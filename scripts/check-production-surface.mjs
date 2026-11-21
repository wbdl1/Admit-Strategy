// Read-only deployment smoke check. Authenticated student acceptance remains separate.
import {productionOrigin, productionSupabaseUrl} from "./build-config.mjs";
import {pathToFileURL} from "node:url";

const request = async (url, options={}) => {
  const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(10000),...options});
  return response;
};
export async function checkProductionSurface(get=request) {
  const checks=[];
  const require=(condition,message)=>{if(!condition)throw new Error(message);};
  async function follow(path,{origin=productionOrigin,query=""}={}) {
    let url=new URL(path,origin);url.search=query;
    const seen=new Set();
    for(let i=0;i<6;i++) {
      require(!seen.has(url.href),"Redirect loop detected.");seen.add(url.href);
      const response=await get(url.href);
      if(![301,302,303,307,308].includes(response.status))return {response,url};
      const location=response.headers.get("location");require(location,"Redirect has no destination.");
      const next=new URL(location,url);
      require(next.protocol==="https:" && ["admitstrategy.com","www.admitstrategy.com"].includes(next.hostname) && !next.port && !next.username && !next.password,"Redirect leaves the approved HTTPS domain.");
      if(query)require(next.search===query,"Legacy-link redirect lost its query parameters.");
      url=next;
    }
    throw new Error("Too many redirects.");
  }
  for(const path of ["/","/index.html","/privacy.html","/portal.html"]) {
    const {response,url}=await follow(path);
    require(response.status===200,`Required page failed: ${path}`);
    require(url.origin===productionOrigin,"Page did not reach the canonical hostname.");
    require(response.headers.get("content-type")?.includes("text/html"),"A page returned an unexpected content type.");
    require(response.headers.get("referrer-policy")==="no-referrer","Missing private-link referrer protection.");
    require(response.headers.get("x-frame-options")==="DENY","Missing frame protection.");
    if(path==="/portal.html") {
      require(response.headers.get("cache-control")?.includes("no-store"),"Portal cache policy is missing.");
      require(response.headers.get("x-robots-tag")?.includes("noindex"),"Portal indexing protection is missing.");
    }
    const html=await response.text();
    require(html.includes("Admit Strategy"),"Unexpected page content.");
    if(path==="/") {
      const match=html.match(/src=["'](assets\/config-[a-f0-9]{12}\.js)["']/);
      require(match,"Versioned public configuration was not found.");
      const configResponse=await get(new URL(match[1],productionOrigin).href);
      require(configResponse.status===200,"Public configuration asset failed.");
      const source=await configResponse.text();
      const payload=source.match(/^window\.ADMIT_CONFIG = (\{.*\});\s*$/s);
      require(payload,"Unexpected public configuration format.");
      const config=JSON.parse(payload[1]);
      require(config.environment==="production" && config.backend==="supabase" && config.supabaseUrl===productionSupabaseUrl,"Site points to the wrong backend or environment.");
      require(/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey) && config.googleEnabled===true,"Public Auth configuration is incomplete.");
      const settingsResponse=await get(productionSupabaseUrl+"/auth/v1/settings",{headers:{apikey:config.publishableKey}});
      require(settingsResponse.status===200,"Production authentication is unavailable.");
      const settings=await settingsResponse.json();
      require(settings.external?.google===true && settings.external?.email===true,"A required authentication provider is disabled.");
      // Uploads cannot be published until this authenticated validator completes.
      // Preflight and an unauthenticated rejection exercise deployment/CORS without
      // creating a file, issuing a signed URL or bypassing user authorization.
      const validator=productionSupabaseUrl+"/functions/v1/file-validate";
      const preflight=await get(validator,{method:"OPTIONS",headers:{Origin:productionOrigin,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,apikey,content-type"}});
      require(preflight.status===204 && preflight.headers.get("access-control-allow-origin")===productionOrigin,"Upload validator is missing or rejects the production origin.");
      const allowed=(preflight.headers.get("access-control-allow-headers")||"").toLowerCase().split(",").map(x=>x.trim());
      require(["authorization","apikey","content-type"].every(x=>allowed.includes(x)),"Upload validator does not allow the browser upload headers.");
      const denied=await get(validator,{method:"POST",headers:{Origin:productionOrigin,apikey:config.publishableKey,"Content-Type":"application/json"},body:"{}"});
      require(denied.status===401 && denied.headers.get("access-control-allow-origin")===productionOrigin,"Upload validator must reject unauthenticated access with a browser-readable response.");
    }
    checks.push(path);
  }
  const oldLink=await follow("/portal.html",{query:"?book=1&diagnosis=release-smoke-probe"});
  require(oldLink.response.status===200,"An existing portal link failed.");
  const missing=await follow("/release-smoke-not-a-page");
  require(missing.response.status===404,"Unknown routes must return 404 rather than a false homepage success.");
  for(const origin of ["https://www.admitstrategy.com","http://admitstrategy.com","http://www.admitstrategy.com"]) {
    const result=await follow("/portal.html",{origin,query:"?book=1"});
    require(result.response.status===200 && result.url.origin===productionOrigin,"HTTP/www did not reach the canonical HTTPS site.");
  }
  return {checks,canonicalOrigin:productionOrigin,passed:true,scope:"Public routes, redirects, headers, provider availability and upload-validator preflight/authentication rejection only; no account, file, booking or email was created."};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await checkProductionSurface(),null,2));}
  catch(error) {console.error("Production surface check failed:",error instanceof TypeError ? "Network or response parsing failed." : error.message);process.exitCode=1;}
}
