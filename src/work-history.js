const categories=[['tasks','Actions'],['assessments','Assessments'],['study_blocks','Study blocks'],['review_cards','Review topics, including mastered'],['classes','Classes'],['study_materials','Materials'],['weak_points','Weak points'],['projects','Projects'],['evidence','Evidence'],['sessions','Shared session notes'],['progress_scores','Progress scores']];
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};

// History is fetched only on demand. Each category retains its own cursor and
// mounted record forms; loading another page never replaces an existing editor.
export class WorkHistory {
  constructor({portal,render,patch,onRows=()=>{}}){Object.assign(this,{portal,render,patch,onRows});this.roots=new Set();this.pages=[];}
  dispose(){this.disposed=true;}
  mountAll(){
    if(this.disposed)return;
    for(const root of document.querySelectorAll('[data-work-history]')){
      if(this.roots.has(root))continue;this.roots.add(root);
      root.append(element('h3','All work & history'),element('p','Find older or completed work. Open a category to load 25 records at a time, newest additions first.'));
      for(const [table,title] of categories){
        const panel=element('details'),summary=element('summary',title),list=element('div'),status=element('p'),more=element('button','Load more');
        panel.className='form-panel';list.className='list';status.className='form-help';status.setAttribute('role','status');
        more.type='button';more.className='btn secondary';more.hidden=true;
        const page={table,panel,list,status,more,ids:[],cursor:null,loaded:false,busy:false};this.pages.push(page);
        panel.append(summary,list,status,more);root.append(panel);
        panel.ontoggle=()=>{if(panel.open&&!page.loaded)this.load(page);};more.onclick=()=>this.load(page);
      }
    }
  }
  async load(page){
    if(this.disposed||page.busy)return;page.busy=true;page.more.disabled=true;page.status.textContent='Loading history…';
    try{
      const result=await this.portal.readPage(page.table,page.cursor);
      if(this.disposed||!page.panel.isConnected)return;
      for(const record of result.records)if(!page.ids.includes(record.id))page.ids.push(record.id);
      page.cursor=result.cursor;page.loaded=true;this.refresh(page);this.onRows();
      page.status.textContent=page.ids.length?`${page.ids.length} records loaded${page.cursor?'':'. End of history.'}`:'No records yet.';
      page.more.textContent='Load more';page.more.hidden=!page.cursor;
    }catch(error){
      if(this.disposed||!page.panel.isConnected)return;
      page.status.textContent=error.message||'History could not be loaded. Your open work is preserved.';page.more.textContent='Retry history';page.more.hidden=false;
    }finally{page.busy=false;page.more.disabled=false;}
  }
  refreshAll(){if(!this.disposed)for(const page of this.pages)if(page.panel.isConnected&&page.loaded)this.refresh(page);}
  refresh(page){
    for(const record of this.portal.historyRecords(page.table,page.ids)){
      let row=[...page.list.children].find(node=>node.dataset.historyRecord===record.id);
      if(!row){row=element('div');row.dataset.historyRecord=record.id;page.list.append(row);}
      this.patch(row,this.render(page.table,[record]));
      if(this.portal.canEdit===false)row.querySelectorAll('form[data-portal-form] button,[data-move-review]').forEach(button=>button.disabled=true);
    }
  }
}
