import test from "node:test";
import assert from "node:assert/strict";
import {marketingAuthCallbackUrl} from "../src/auth-callback.js";

test("an expired Site URL callback reaches login recovery without leaking provider details",()=>{
  const next=new URL(marketingAuthCallbackUrl("https://admitstrategy.com/?error=access_denied&error_code=flow_state_expired&error_description=private-detail&redirect_to=https://evil.example"));
  assert.equal(next.origin,"https://admitstrategy.com");assert.equal(next.pathname,"/portal.html");
  assert.equal(next.search,"?error=access_denied&error_code=flow_state_expired");
  assert.equal(next.hash,"");
});
test("fallback callbacks retain the diagnosis or booking route and PKCE code",()=>{
  const diagnosis=new URL(marketingAuthCallbackUrl("http://127.0.0.1:4173/index.html?diagnosis=fixture&code=one-use-fixture&sb_flow_id=fixture"));
  assert.equal(diagnosis.origin,"http://127.0.0.1:4173");assert.equal(diagnosis.pathname,"/portal.html");
  assert.equal(diagnosis.searchParams.get("diagnosis"),"fixture");assert.equal(diagnosis.searchParams.get("code"),"one-use-fixture");
  const booking=new URL(marketingAuthCallbackUrl("https://admitstrategy.com/?book=1#error=access_denied&error_description=private-detail"));
  assert.equal(booking.search,"?book=1&error=access_denied");assert.equal(booking.hash,"");
});
test("ordinary marketing and diagnosis links do not get mistaken for auth callbacks",()=>{
  for(const suffix of ["","?diagnosis=1","#booking","?utm_source=email#quiz","?error_description=unrelated"])
    assert.equal(marketingAuthCallbackUrl("https://admitstrategy.com/"+suffix),null);
});
