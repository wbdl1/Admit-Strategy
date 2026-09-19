import test from "node:test";
import assert from "node:assert/strict";
import {checkProductionSurface} from "../scripts/check-production-surface.mjs";
import {productionSupabaseUrl} from "../scripts/build-config.mjs";

function fixture({dropQuery=false,wrongBackend=false,disabledGoogle=false,false404=false}={}) {
  return async address=>{
    const url=new URL(address);
    if(url.origin===productionSupabaseUrl)return Response.json({external:{email:true,google:!disabledGoogle}});
    if(url.protocol!=="https:" || url.hostname.startsWith("www."))return new Response(null,{status:308,headers:{location:"https://admitstrategy.com"+url.pathname+url.search}});
    if(url.pathname.endsWith(".html"))return new Response(null,{status:308,headers:{location:(url.pathname==="/index.html"?"/":url.pathname.replace(/\.html$/,""))+(dropQuery?"":url.search)}});
    if(url.pathname.startsWith("/assets/"))return new Response("window.ADMIT_CONFIG = "+JSON.stringify({environment:"production",backend:wrongBackend?"legacy":"supabase",supabaseUrl:productionSupabaseUrl,publishableKey:"sb_publishable_synthetic",googleEnabled:true})+";\n");
    const status=url.pathname==="/release-smoke-not-a-page"&&!false404?404:200;
    return new Response('<title>Admit Strategy</title><script src="assets/config-0123456789ab.js"></script>',{status,headers:{"content-type":"text/html","referrer-policy":"no-referrer","x-frame-options":"DENY","cache-control":"no-store","x-robots-tag":"noindex"}});
  };
}
test("production smoke follows legacy links and checks the actual hosted Auth settings without mutations",async()=>{
  assert.equal((await checkProductionSurface(fixture())).passed,true);
});
test("production smoke fails on lost handoffs, wrong backend, disabled OAuth or false 404 success",async()=>{
  for(const options of [{dropQuery:true},{wrongBackend:true},{disabledGoogle:true},{false404:true}]) {
    await assert.rejects(checkProductionSurface(fixture(options)));
  }
});
