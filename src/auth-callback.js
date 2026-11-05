// Supabase falls back to its Site URL when a provider attempt expires. Route
// that response to the existing login recovery UI before loading account code.
export function marketingAuthCallbackUrl(href){
  const source=new URL(href),fragment=new URLSearchParams(source.hash.slice(1));
  if(!["code","error","error_code"].some(key=>source.searchParams.has(key))&&!fragment.has("error")&&!fragment.has("error_code"))return null;
  const target=new URL("portal.html",source);
  for(const key of ["diagnosis","book","code","sb_flow_id","error","error_code","sb"]){
    const value=source.searchParams.get(key);
    if(value!==null)target.searchParams.set(key,value);
  }
  for(const key of ["error","error_code"]){
    if(!target.searchParams.has(key)&&fragment.has(key))target.searchParams.set(key,fragment.get(key));
  }
  // Do not forward provider descriptions, arbitrary redirect destinations or
  // fragments. The login screen renders its own safe, actionable explanation.
  return target.href;
}
