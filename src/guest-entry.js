import {createClient} from '@supabase/supabase-js';
import {boundedFetch} from './network.js';
export async function openReturningWorkspace(){
 const config=window.ADMIT_CONFIG,client=createClient(config.supabaseUrl,config.publishableKey,{global:{fetch:boundedFetch()},auth:{flowType:'pkce',detectSessionInUrl:false}});
 const {data,error}=await client.auth.getSession();
 if(!error&&data.session)location.replace(new URL('portal.html',location.href).href);
}
