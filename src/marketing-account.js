import {createClient} from "@supabase/supabase-js";
import {boundedFetch} from "./network.js";
export async function updateAccountHeader(){
  const config=window.ADMIT_CONFIG;
  const client=createClient(config.supabaseUrl,config.publishableKey,{global:{fetch:boundedFetch()},auth:{flowType:"pkce",detectSessionInUrl:false}});
  const update=user=>{
    const login=document.querySelector(".account-link"),start=document.querySelector(".nav-cta");
    if(login)login.textContent=user?"My workspace":"Log in";
    if(start)start.hidden=false;
    document.querySelectorAll("[data-open-admit]").forEach(link=>link.href=user?"portal.html":"try.html");
  };
  const {data}=await client.auth.getUser();update(data.user);
  client.auth.onAuthStateChange((_event,session)=>update(session?.user));
}
