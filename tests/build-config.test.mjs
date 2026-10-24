import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readBuildConfig, productionSupabaseUrl} from "../scripts/build-config.mjs";

const production = {APP_ENV:"production", APP_BACKEND:"supabase", SUPABASE_URL:productionSupabaseUrl,
  SUPABASE_PUBLISHABLE_KEY:"sb_publishable_synthetic_test", GOOGLE_AUTH_ENABLED:"true"};

test("hosted builds fail closed instead of publishing development or the legacy backend", () => {
  assert.throws(()=>readBuildConfig({CF_PAGES:"1"}), /explicit production/);
  for (const override of [{APP_BACKEND:"legacy"},{SUPABASE_URL:"http://127.0.0.1:54321"},
    {SUPABASE_URL:"https://another-project.supabase.co"},{GOOGLE_AUTH_ENABLED:"false"},{APP_ENV:"prod"}]) {
    assert.throws(()=>readBuildConfig({...production,...override}));
  }
  const result=readBuildConfig({...production,CF_PAGES:"1",SMTP_PASSWORD:"private-value",SUPABASE_SECRET_KEY:"private-value"});
  assert.equal(result.environment,"production");
  assert.equal(JSON.stringify(result).includes("private-value"),false);
});

test("build configuration rejects credential-bearing keys and URLs without printing them", () => {
  for (const key of ["sb_secret_private","eyJserviceRole","<script>secret</script>"]) {
    assert.throws(()=>readBuildConfig({...production,SUPABASE_PUBLISHABLE_KEY:key}),error=>!error.message.includes(key));
  }
  for (const url of ["http://example.com","https://user:password@example.com","https://example.com/?secret=yes","javascript:alert(1)"]) {
    assert.throws(()=>readBuildConfig({...production,APP_ENV:"development",SUPABASE_URL:url}),error=>!error.message.includes(url));
  }
  assert.equal(readBuildConfig({...production,APP_ENV:"development",SUPABASE_URL:"http://127.0.0.1:54321"}).backend,"supabase");
});

test("static hosting preserves private portal caching rules and real not-found behavior", () => {
  const headers=readFileSync(new URL("../_headers",import.meta.url),"utf8");
  for(const path of ["/portal","/portal.html"]) {
    const rule=headers.split("\n\n").flatMap(block=>block.split(/\n(?=\/)/)).find(block=>block.startsWith(path+"\n"));
    assert.match(rule || "", /Cache-Control: no-store/);
    assert.match(rule || "", /X-Robots-Tag: noindex/);
  }
  assert.match(headers,/Referrer-Policy: no-referrer/);
  const fallback=readFileSync(new URL("../404.html",import.meta.url),"utf8");
  assert.match(fallback,/href="\/portal.html"/);
  assert.doesNotMatch(fallback,/<script/i);
});
