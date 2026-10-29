import { build } from "esbuild";
import { mkdir, readdir, copyFile, writeFile, readFile, rename, rm } from "node:fs/promises";
import {createHash} from "node:crypto";
import { resolve } from "node:path";
import {readBuildConfig} from "./build-config.mjs";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "dist");
// Reject a misconfigured release before touching the last usable local artifact.
const publicConfig = readBuildConfig(process.env);
await rm(target, { recursive: true, force: true });
await mkdir(resolve(target, "assets"), { recursive: true });
for (const file of await readdir(root)) {
  if (/\.(html|css)$/.test(file) || file === "_headers") await copyFile(resolve(root, file), resolve(target, file));
}
await build({ entryPoints: [resolve(root, "src/runtime.js")], bundle: true, minify: true,
  outfile: resolve(target, "assets/runtime.js"), format: "iife", target: ["safari16", "chrome110", "edge110"] });
await build({entryPoints:[resolve(root,"src/marketing.js")],bundle:true,minify:true,splitting:true,
  outdir:resolve(target,"assets"),format:"esm",target:["safari16","chrome110","edge110"]});
await build({entryPoints:[resolve(root,"src/calendar-worker.js")],bundle:true,minify:true,
  outfile:resolve(target,"assets/calendar-worker.js"),format:"iife",target:["safari16","chrome110","edge110"]});
const workerPath=resolve(target,"assets/calendar-worker.js");
const workerName="calendar-worker-"+createHash("sha256").update(await readFile(workerPath)).digest("hex").slice(0,12)+".js";
await rename(workerPath,resolve(target,"assets",workerName));
// Extraction libraries are loaded only in a dedicated worker, never on portal startup.
await build({entryPoints:[resolve(root,'src/source-worker.js')],bundle:true,minify:true,
 outfile:resolve(target,'assets/source-worker.js'),format:'esm',target:['safari16','chrome110','edge110']});
await copyFile(resolve(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),resolve(target,'assets/pdf-worker.js'));
const sourceWorkers={};
for(const name of ['source-worker','pdf-worker']){
 const path=resolve(target,'assets',name+'.js'),filename=name+'-'+createHash('sha256').update(await readFile(path)).digest('hex').slice(0,12)+'.js';
 await rename(path,resolve(target,'assets',filename));sourceWorkers[name]='assets/'+filename;
}
const config = { ...publicConfig, calendarWorkerUrl:"assets/"+workerName, sourceWorkerUrl:sourceWorkers['source-worker'], pdfWorkerUrl:sourceWorkers['pdf-worker'] };
await writeFile(resolve(target, "assets/config.js"), "window.ADMIT_CONFIG = " + JSON.stringify(config).replace(/</g, "\\u003c") + ";\n");
console.log("Static site built. Environment:", config.environment, "Backend:", config.backend);
// HTML URLs stay stable; changing scripts/config receive new URLs so a cached
// earlier client cannot silently run against a newer deployment.
for(const entry of ["runtime","marketing","config"]){
  const original=resolve(target,"assets",entry+".js");
  const digest=createHash("sha256").update(await readFile(original)).digest("hex").slice(0,12);
  const filename=entry+"-"+digest+".js";await rename(original,resolve(target,"assets",filename));
  for(const page of (await readdir(target)).filter(n=>n.endsWith(".html"))){
    const path=resolve(target,page),html=await readFile(path,"utf8");
    await writeFile(path,html.replaceAll("assets/"+entry+".js","assets/"+filename));
  }
}

for(const stylesheet of ['design-system','portal-ux','launch']){
  const css=await readFile(resolve(target,stylesheet+'.css'));
  const cssName=stylesheet+'-'+createHash('sha256').update(css).digest('hex').slice(0,12)+'.css';
  await rename(resolve(target,stylesheet+'.css'),resolve(target,'assets',cssName));
  for(const page of (await readdir(target)).filter(n=>n.endsWith('.html'))){
    const path=resolve(target,page);
    await writeFile(path,(await readFile(path,'utf8')).replace('href="'+stylesheet+'.css"','href="assets/'+cssName+'"'));
  }
}
