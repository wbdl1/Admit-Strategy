import {createClient} from "@supabase/supabase-js";
import {boundedFetch} from "./network.js";
export async function updateAccountHeader(){
  const config=window.ADMIT_CONFIG;
  const client=createClient(config.supabaseUrl,config.publishableKey,{global:{fetch:boundedFetch()},auth:{flowType:"pkce",detectSessionInUrl:false}});
  const update=user=>{
    const login=document.querySelector(".account-link"),start=document.querySelector(".nav-cta");
    if(login)login.textContent=user?"Portal / Dashboard":"Log in";
    if(start)start.hidden=Boolean(user);
  };
  const {data}=await client.auth.getUser();update(data.user);
  client.auth.onAuthStateChange((_event,session)=>update(session?.user));
}
