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

// Dates, optional times and UUIDs form a stable ascending assessment order.
// PostgreSQL retains fractional seconds; never round the returned cursor.
export function assessmentPage(query,cursor,size=25){
  query=query.order('due_date').order('due_time',{nullsFirst:false}).order('id').limit(size+1);
  if(cursor){
    if(!uuid.test(cursor.id)||!/^\d{4}-\d{2}-\d{2}$/.test(cursor.due_date)||
      (cursor.due_time!==null&&!/^\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(cursor.due_time)))throw new Error('Invalid assessment cursor');
    const date='due_date.eq.'+cursor.due_date;
    const later=cursor.due_time===null
      ?'and('+date+',due_time.is.null,id.gt.'+cursor.id+')'
      :'and('+date+',or(due_time.gt.'+cursor.due_time+',due_time.is.null,and(due_time.eq.'+cursor.due_time+',id.gt.'+cursor.id+')))';
    query=query.or('due_date.gt.'+cursor.due_date+','+later);
  }
  return query;
}
export function splitAssessmentPage(rows,size=25){
  const records=rows.slice(0,size),last=records.at(-1);
  return {records,cursor:rows.length>size?{id:last.id,due_date:last.due_date,due_time:last.due_time}:null};
}
