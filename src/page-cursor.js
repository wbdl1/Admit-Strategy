const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp=/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
export function createdPage(query,cursor,size=25){
  query=query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(size+1);
  if(cursor){
    if(!uuid.test(cursor.id)||!timestamp.test(cursor.created_at))throw new Error('Invalid page cursor');
    query=query.or('created_at.lt."'+cursor.created_at+'",and(created_at.eq."'+cursor.created_at+'",id.lt.'+cursor.id+')');
  }
  return query;
}
export function splitPage(rows,size=25){
  const records=rows.slice(0,size),last=records.at(-1);
  return {records,cursor:rows.length>size?{id:last.id,created_at:last.created_at}:null};
}
