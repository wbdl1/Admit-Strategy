// Bound every network wait. A timeout means persistence is uncertain; callers
// must retry the original idempotency key rather than inventing another create.
export function boundedFetch(fetcher=fetch,timeoutMs=12000){
  return async(input,options={})=>{
    const controller=new AbortController();
    const abort=()=>controller.abort(options.signal?.reason);
    if(options.signal?.aborted)abort();else options.signal?.addEventListener("abort",abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new Error("The connection timed out. Please retry.")),timeoutMs);
    try{return await fetcher(input,{...options,signal:controller.signal});}
    finally{clearTimeout(timer);options.signal?.removeEventListener("abort",abort);}
  };
}
