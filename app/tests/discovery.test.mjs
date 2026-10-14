import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const db=new DatabaseSync(':memory:');
for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
let failBatch=false, beforeBatch=null;
function prepared(sql,args=[]){return {bind:(...values)=>prepared(sql,values),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:()=>db.prepare(sql).run(...args)};}
globalThis.__discoveryEnv={OWNER_EMAIL:'fixture@example.test',DB:{prepare:prepared,batch:async statements=>{
  if(beforeBatch){const action=beforeBatch;beforeBatch=null;action();}
  db.exec('BEGIN');try{for(const s of statements)s.run();if(failBatch){failBatch=false;throw Error('Injected transaction failure');}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}}};
const bundled=await build({entryPoints:[fileURLToPath(new URL('../server/store.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/cover$/},()=>({path:'cover',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='env'?'export const env=globalThis.__discoveryEnv':'export function inspectCover(){throw Error("Media is excluded from this test")}'}));
}}]});
const {callTool,assertOutput}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const browserBundle=await build({entryPoints:[fileURLToPath(new URL('../server/browser.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/cover$/},()=>({path:'cover',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='env'?'export const env=globalThis.__discoveryEnv':'export function inspectCover(){throw Error("No media") }'}));
}}]});
const {search,changeSettings,facets,coverResponse,changeReference}=await import(`data:text/javascript;base64,${Buffer.from(browserBundle.outputFiles[0].text).toString('base64')}`);
const headers=new Headers({'oai-authenticated-user-id':'fixture_owner','oai-authenticated-user-email':'fixture@example.test'});
let lease,tax;
const base=()=>({contract_version:'1.0.0',request_id:crypto.randomUUID(),run_id:lease.run_id,lease_epoch:lease.lease_epoch});
async function call(name,args){const result=await callTool(name,{contract_version:'1.0.0',...args},headers);assert.equal(assertOutput(name,result),true,`${name} output schema`);return result;}
async function acquire(){lease=await call('start_run',{request_id:crypto.randomUUID(),package_version:'0.1.0',mode:'acquire',trigger:'manual',run_id:null,lease_epoch:null,pending_cursor:null});tax=lease.settings.taxonomy_revision;return lease;}
const source=(key,collections=[])=>({source_key:key,source_url:`https://www.instagram.com/reel/${key}/`,creator:'fixture',collection_ids:collections,discovered_at:'2026-10-13T00:00:00Z',saved_at:null,save_order:null});
const page=(collection,revision,after,last,end=false)=>({collection_id:collection,expected_revision:revision,after_source_key:after,last_source_key:last,end_reached:end,restart:false});
const read=id=>call('get_discovery',{collection_id:id});
const finish=()=>call('finish_run',{...base(),outcome:'interrupted',cursor:lease.cursor,cooldowns:[]});

test('late creator metadata survives replay and updates search without changing stored work',async()=>{
  resetInstallation();await acquire();
  const original={...source('LATE_CREATOR'),creator:null};
  const added=await call('register_sources',{...base(),sources:[original]});
  const id=added.items[0].reference.reference_id;
  db.prepare('UPDATE "references" SET analysis=?,outcome=?,manual_categories=1,manual_topics=1,result_sha=?,cover_key=?,last_attempt_at=?,last_attempt_run_id=? WHERE id=?').run('{"content_version":"1.2.0","caption":"preserved evidence"}','partial','a'.repeat(64),'existing-cover','2026-10-13T00:00:00Z','old-run',id);
  const before=db.prepare('SELECT * FROM "references" WHERE id=?').get(id);
  const args={...base(),sources:[{...original,creator:'verified.author'}]};
  const updated=await call('register_sources',args);
  assert.deepEqual(await call('register_sources',args),updated);
  const after=db.prepare('SELECT * FROM "references" WHERE id=?').get(id);
  assert.equal(after.creator,'verified.author');assert.equal(after.revision,before.revision+1);
  for(const key of Object.keys(before).filter(k=>!['creator','search_text','revision','updated_at'].includes(k)))assert.deepEqual(after[key],before[key],key);
  const readback=await call('get_reference',{reference_id:id,include_content:false});
  const {collection_ids,...metadata}=original;
  assert.deepEqual(readback.source,{...metadata,creator:'verified.author'});
  const creators=(await facets(new URL('https://site.test/api/facets?type=creator&query=verified'),headers)).items;
  assert.equal(creators.length,1);assert.equal(creators[0].id,'verified.author');assert.equal(creators[0].label,'verified.author');
  const query={query:'verified.author',filters:{category:[],topic:[],creator:[],collection:[]},order:'recent',removed:false,cursor:null};
  assert.equal((await search(query,headers)).items[0].id,id);
  assert.equal((await search({...query,query:'preserved evidence',filters:{...query.filters,creator:['verified.author']}},headers)).items[0].id,id);
  for(const creator of [null,'','wrong.author'])await call('register_sources',{...base(),sources:[{...original,creator}]});
  assert.deepEqual(db.prepare('SELECT * FROM "references" WHERE id=?').get(id),after);
  await finish();resetInstallation();
});

test('discovery backfills creators atomically and preserves removed references',async()=>{
  resetInstallation();await acquire();
  const original={...source('DISCOVERY_CREATOR'),creator:null};
  await call('register_sources',{...base(),sources:[original]});
  const args={...base(),page:page(null,0,null,original.source_key,true),sources:[{...original,creator:'verified.author'}]};
  failBatch=true;
  await assert.rejects(()=>call('record_discovery_page',args),{code:'REVISION_CONFLICT'});
  assert.equal(db.prepare('SELECT creator FROM "references"').get().creator,null);
  assert.equal((await read(null)).discovery.revision,0);
  await call('record_discovery_page',args);
  assert.equal(db.prepare('SELECT creator FROM "references"').get().creator,'verified.author');
  db.exec('UPDATE "references" SET removed=1,creator=NULL');
  const before=db.prepare('SELECT * FROM "references"').get();
  await call('register_sources',{...base(),sources:args.sources});
  assert.deepEqual(db.prepare('SELECT * FROM "references"').get(),before);
  await finish();resetInstallation();
});

test('pending traversal covers 123 items and survives a lost finish with partial failures',async()=>{
  resetInstallation();await acquire();
  for(let i=0;i<123;i+=50)await call('register_sources',{...base(),sources:Array.from({length:Math.min(50,123-i)},(_,j)=>source(`QUEUE_${i+j}`))});
  const renewPage=cursor=>call('start_run',{...base(),mode:'renew',trigger:'manual',package_version:'0.1.0',pending_cursor:cursor});
  const attempt=ref=>call('update_reference',{...base(),reference_id:ref.reference_id,expected_revision:ref.revision,outcome:'partial',analysis:null,content:null,classification:null,failure:{code:'ANALYSIS_FAILED',retry_at:null}});
  let page=await renewPage(null);const processed=new Set();
  assert.equal(page.started_at,db.prepare('SELECT started_at FROM runs WHERE id=?').get(lease.run_id).started_at);
  for(const ref of page.pending.slice(0,7)){await attempt(ref);processed.add(ref.reference_id);}
  const staleCursor=page.next_pending_cursor;
  db.exec("UPDATE installations SET lease_expires='2000-01-01T00:00:00Z'");
  await acquire();
  await assert.rejects(()=>renewPage(staleCursor),{code:'INVALID_ARGUMENT'});
  page=lease;
  assert.equal(page.pending.length,50);
  assert(page.pending.every(ref=>!processed.has(ref.reference_id)));
  // A renewal with a null cursor must not retry items already attempted in this run.
  await attempt(page.pending[0]);processed.add(page.pending[0].reference_id);
  page=await renewPage(null);
  const thisRun=new Set();let pages=0;
  for(;;){
    pages++;
    for(const ref of page.pending){assert(!thisRun.has(ref.reference_id));thisRun.add(ref.reference_id);await attempt(ref);processed.add(ref.reference_id);}
    if(!page.next_pending_cursor)break;
    page=await renewPage(page.next_pending_cursor);
  }
  assert.equal(pages,3);assert.equal(processed.size,123);
  assert.equal((await renewPage(null)).pending.length,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM "references" WHERE last_attempt_at IS NOT NULL').get().n,123);
  await finish();await acquire();assert.equal(lease.pending.length,50);
  await finish();
});

test('analysis cooldown allows discovery; retry dates and terminal items do not block other work',async()=>{
  resetInstallation();await acquire();
  const added=await call('register_sources',{...base(),sources:['WAIT','GONE','NEXT'].map(key=>source(key))});
  const wait=added.items[0].reference,gone=added.items[1].reference;
  const later=new Date(Date.now()+600000).toISOString();
  const update=(ref,outcome,failure)=>call('update_reference',{...base(),reference_id:ref.reference_id,expected_revision:ref.revision,outcome,analysis:null,content:null,classification:null,failure});
  await update(wait,'retry_wait',{code:'RATE_LIMITED',retry_at:later});
  await update(gone,'unavailable',{code:'SOURCE_UNAVAILABLE',retry_at:null});
  await call('finish_run',{...base(),outcome:'retry_wait',cursor:lease.cursor,cooldowns:[{service:'analysis',limited_at:new Date().toISOString(),next_allowed_at:later,server_reset_at:null,backoff_step:1}]});
  await acquire();assert.deepEqual(lease.pending.map(r=>r.source_key),['NEXT']);assert.equal(lease.cooldowns[0].service,'analysis');
  await call('register_sources',{...base(),sources:[source('DISCOVERED_DURING_ASR_OUTAGE')]});
  await finish();
  db.prepare('UPDATE "references" SET failure=? WHERE id=?').run(JSON.stringify({code:'RATE_LIMITED',retry_at:'2000-01-01T00:00:00Z'}),wait.reference_id);
  await acquire();assert(lease.pending.some(r=>r.reference_id===wait.reference_id));assert(!lease.pending.some(r=>r.reference_id===gone.reference_id));
  await call('finish_run',{...base(),outcome:'retry_wait',cursor:lease.cursor,cooldowns:[{service:'instagram',limited_at:new Date().toISOString(),next_allowed_at:later,server_reset_at:null,backoff_step:1}]});
  await assert.rejects(()=>acquire(),{code:'RATE_LIMITED'});
  resetInstallation();
});

test('collection discovery and resume preserve references across page replay, failed writes, and expired leases',async t=>{
  await acquire();let a,b,first;
  await t.test('stable mappings, source rename, partial catalog, and explicit mapping conflicts',async()=>{
    const args={...base(),expected_taxonomy_revision:tax,collections:[{instagram_id:'111',label:'Garden',collection_id:null},{instagram_id:'222',label:'Tools',collection_id:null}]};
    const result=await call('sync_collections',args);[a,b]=result.collections.map(c=>c.id);tax=result.taxonomy_revision;
    assert.deepEqual(await call('sync_collections',args),result);
    const again=await call('sync_collections',{...base(),expected_taxonomy_revision:tax,collections:[{instagram_id:'111',label:'Garden renamed',collection_id:null}]});tax=again.taxonomy_revision;
    assert.equal(again.collections[0].id,a);assert.equal(again.collections[0].label,'Garden');assert.equal(again.collections[0].instagram_label,'Garden renamed');
    assert.equal(JSON.parse(db.prepare('SELECT taxonomy FROM installations').get().taxonomy).collections.length,2);
    await assert.rejects(()=>call('sync_collections',{...base(),expected_taxonomy_revision:tax,collections:[{instagram_id:'333',label:'Bad',collection_id:a}]}),{code:'INVALID_ARGUMENT'});
  });
  await t.test('a page saves identities and its checkpoint atomically; replay creates no duplicates',async()=>{
    const args={...base(),page:page(a,0,null,'AAA'),sources:[source('AAA',[a])]};
    first=await call('record_discovery_page',args);
    assert.equal(first.items[0].disposition,'new');assert.equal((await read(a)).discovery.revision,1);
    assert.deepEqual(await call('record_discovery_page',args),first);
    await assert.rejects(()=>call('record_discovery_page',{...args,request_id:crypto.randomUUID()}),{code:'REVISION_CONFLICT'});
    failBatch=true;
    await assert.rejects(()=>call('record_discovery_page',{...base(),page:page(a,1,'AAA','BBB'),sources:[source('BBB',[a])]}),{code:'REVISION_CONFLICT'});
    assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,1);assert.equal((await read(a)).discovery.anchor_source_key,'AAA');
  });
  await t.test('an expired run resumes from the committed page and rejects the previous lease',async()=>{
    const old=base();db.exec("UPDATE installations SET lease_expires='2000-01-01T00:00:00Z'");await acquire();
    assert.ok(lease.lease_epoch>old.lease_epoch);assert.equal(lease.pending[0].reference_id,first.items[0].reference.reference_id);
    assert.equal((await read(a)).discovery.anchor_source_key,'AAA');
    await assert.rejects(()=>call('record_discovery_page',{...old,page:page(a,1,'AAA','BBB'),sources:[source('BBB',[a])]}),{code:'LEASE_EXPIRED'});
    await call('record_discovery_page',{...base(),page:page(a,1,'AAA','BBB'),sources:[source('BBB',[a])]});
    assert.equal((await read(a)).discovery.pages,2);
  });
  await t.test('collection membership is additive and preserves complete content, cover, and manual classification',async()=>{
    const cover=JSON.stringify({sha256:'a'.repeat(64),mime_type:'image/jpeg',byte_count:100,width:10,height:10,acquired_at:'2026-10-13T00:00:00Z'});
    db.prepare('UPDATE "references" SET outcome=?,analysis=?,classification=?,cover=?,result_sha=?,manual_categories=1 WHERE source_key=?').run('complete','{"content_version":"1.2.0","transcription":"fixture"}','{"category_ids":[],"topic_ids":[]}',cover,'b'.repeat(64),'AAA');
    const before=db.prepare('SELECT * FROM "references" WHERE source_key=?').get('AAA');
    await call('record_discovery_page',{...base(),page:page(b,0,null,'AAA'),sources:[source('AAA',[b])]});
    const after=db.prepare('SELECT * FROM "references" WHERE source_key=?').get('AAA');
    assert.deepEqual(JSON.parse(after.collections),[a,b]);assert.equal(after.revision,before.revision+1);
    for(const key of ['analysis','classification','cover','result_sha','manual_categories','outcome'])assert.equal(after[key],before[key]);
    for(const collection of [a,b]){
      const found=await search({query:'',filters:{category:[],topic:[],creator:[],collection:[collection]},order:'recent',removed:false,cursor:null},headers);
      assert.ok(found.items.some(item=>item.id===before.id));
    }
  });
  await t.test('scope excludes other lists and does not remove existing references',async()=>{
    const result=await call('set_import_scope',{...base(),expected_taxonomy_revision:tax,scope:{mode:'collections',collection_ids:[a]}});tax=result.settings.taxonomy_revision;
    await assert.rejects(()=>changeSettings({revision:tax,action:'remove',type:'collection',id:a,reclassify:false},headers),{code:'INVALID_ARGUMENT'});
    await assert.rejects(()=>call('record_discovery_page',{...base(),page:page(b,1,'AAA','CCC'),sources:[source('CCC',[b])]}),{code:'INVALID_ARGUMENT'});
    const skipped=await call('register_sources',{...base(),sources:[source('CCC',[b])]});assert.equal(skipped.items[0].disposition,'out_of_scope');
    assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,2);
    await assert.rejects(()=>call('record_discovery_page',{...base(),page:page(a,2,'BBB','DDD'),sources:[source('DDD',[])]}),{code:'INVALID_ARGUMENT'});
  });
  await t.test('empty pages, end markers, missing-anchor restart, and removed references have safe boundaries',async()=>{
    await assert.rejects(()=>call('record_discovery_page',{...base(),page:page(a,2,'wrong','CCC'),sources:[]}),{code:'INVALID_ARGUMENT'});
    await call('record_discovery_page',{...base(),page:page(a,2,'BBB','PHOTO'),sources:[]});
    db.prepare('UPDATE "references" SET removed=1 WHERE source_key=?').run('BBB');
    const restarted=await call('record_discovery_page',{...base(),page:{...page(a,3,null,'BBB'),restart:true},sources:[source('BBB',[a])]});
    assert.equal(restarted.items[0].disposition,'removed');assert.equal(restarted.discovery.pages,1);
    await call('record_discovery_page',{...base(),page:page(a,4,'BBB','BBB',true),sources:[]});
    assert.equal((await read(a)).discovery.completed,true);
    await call('record_discovery_page',{...base(),page:page(a,5,null,'EEE'),sources:[source('EEE',[a])]});
    assert.equal((await read(a)).discovery.pages,1);
    const checkpoint=(await read(a)).discovery;await finish();assert.deepEqual((await read(a)).discovery,checkpoint);
    await acquire();assert.deepEqual((await read(a)).discovery,checkpoint);
  });
  await t.test('concurrent taxonomy change rolls back a discovery page',async()=>{
    beforeBatch=()=>db.exec('UPDATE installations SET taxonomy_revision=taxonomy_revision+1');
    await assert.rejects(()=>call('record_discovery_page',{...base(),page:page(a,6,'EEE','FFF'),sources:[source('FFF',[a])]}),{code:'REVISION_CONFLICT'});
    assert.equal((await read(a)).discovery.revision,6);assert.equal(db.prepare('SELECT id FROM "references" WHERE source_key=?').get('FFF'),undefined);
  });
  await t.test('authorization and schema reject forged identities and malformed collection IDs',async()=>{
    await assert.rejects(()=>callTool('get_discovery',{contract_version:'1.0.0',collection_id:a},new Headers()),{code:'UNAUTHENTICATED'});
    const other=new Headers({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'});
    await assert.rejects(()=>callTool('get_discovery',{contract_version:'1.0.0',collection_id:a},other),{code:'FORBIDDEN'});
    await assert.rejects(()=>read('111'),{code:'INVALID_ARGUMENT'});
    await assert.rejects(()=>call('get_discovery',{collection_id:a,owner_id:'forged'}),{code:'INVALID_ARGUMENT'});
  });
});

function resetInstallation(){
  for(const table of ['receipts','references','discovery_lists','baseline_sources','runs','installations'])db.exec(`DELETE FROM "${table}"`);
}

test('initial-mode and baseline activation guards reject concurrent state changes',async()=>{
  resetInstallation();await acquire();
  beforeBatch=()=>db.prepare('INSERT INTO discovery_lists(id,owner_id,revision,updated_at) VALUES(?,?,?,?)').run('all_saved','fixture_owner',1,new Date().toISOString());
  await assert.rejects(()=>chooseNewOnly(),{code:'REVISION_CONFLICT'});
  assert.equal(JSON.parse(db.prepare('SELECT settings FROM installations').get().settings).initial_import,'existing');
  resetInstallation();await acquire();await chooseNewOnly();
  await call('record_discovery_page',{...base(),page:page(null,0,null,'OLD'),sources:[source('OLD')]});
  beforeBatch=()=>db.prepare('UPDATE discovery_lists SET baseline_completed_at=?,completed=1,revision=revision+1').run(new Date().toISOString());
  await assert.rejects(()=>call('register_sources',{...base(),sources:[source('RACE')]}),{code:'REVISION_CONFLICT'});
  assert.equal(db.prepare('SELECT source_key FROM baseline_sources WHERE source_key=?').get('RACE'),undefined);
  assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,0);
  assert.equal((await read(null)).baseline.status,'ready');
});
async function chooseNewOnly(){
  const result=await call('set_import_mode',{...base(),expected_taxonomy_revision:tax,initial_import:'new_only'});
  tax=result.settings.taxonomy_revision;return result;
}
test('new-only All posts baseline survives interruptions and imports only later unseen identities',async t=>{
  resetInstallation();await acquire();
  await t.test('mode is configured before discovery and exposes the required baseline',async()=>{
    const result=await chooseNewOnly();
    assert.equal(result.baseline.status,'collecting');assert.deepEqual(result.baseline.pending_list_ids,[null]);
    const args={...base(),sources:[source('HEAD')]};
    const head=await call('register_sources',args);
    assert.equal(head.items[0].disposition,'baseline_only');
    assert.deepEqual(await call('register_sources',args),head);
    assert.equal(db.prepare('SELECT count(*) AS n FROM baseline_sources').get().n,1);
    assert.equal((await read(null)).discovery.revision,0);
  });
  await t.test('baseline pages, identities, and receipts commit atomically',async()=>{
    const args={...base(),page:page(null,0,null,'OLD'),sources:[source('OLD')]};
    const first=await call('record_discovery_page',args);
    assert.equal(first.items[0].disposition,'baseline_only');assert.equal(first.items[0].reference,null);
    assert.deepEqual(await call('record_discovery_page',args),first);
    assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,0);
    failBatch=true;
    await assert.rejects(()=>call('record_discovery_page',{...base(),page:page(null,1,'OLD','FAILED'),sources:[source('FAILED')]}),{code:'REVISION_CONFLICT'});
    assert.equal(db.prepare('SELECT source_key FROM baseline_sources WHERE source_key=?').get('FAILED'),undefined);
    assert.equal((await read(null)).discovery.revision,1);
  });
  await t.test('an expired lease resumes the baseline and includes arrivals during the scan',async()=>{
    const stale=base();db.exec("UPDATE installations SET lease_expires='2000-01-01T00:00:00Z'");await acquire();
    assert.equal(lease.baseline.status,'collecting');assert.equal(lease.pending.length,0);
    await assert.rejects(()=>call('record_discovery_page',{...stale,page:page(null,1,'OLD','DURING'),sources:[source('DURING')]}),{code:'LEASE_EXPIRED'});
    const during=await call('record_discovery_page',{...base(),page:page(null,1,'OLD','DURING'),sources:[{...source('DURING'),saved_at:new Date().toISOString()}]});
    assert.equal(during.items[0].disposition,'baseline_only');assert.equal(during.baseline.status,'collecting');
    await finish();await acquire();assert.equal((await read(null)).discovery.anchor_source_key,'DURING');
  });
  await t.test('the final page remains baseline and activation survives later scan restarts',async()=>{
    const end=await call('record_discovery_page',{...base(),page:page(null,2,'DURING','LAST',true),sources:[source('LAST')]});
    assert.equal(end.items[0].disposition,'baseline_only');assert.equal(end.baseline.status,'ready');assert.ok(end.baseline.completed_at);
    assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,0);
    const again=await call('record_discovery_page',{...base(),page:page(null,3,null,'OLD'),sources:[source('OLD')]});
    assert.equal(again.discovery.completed,false);assert.equal(again.discovery.pages,1);
    assert.equal(again.discovery.baseline_completed_at,end.baseline.completed_at);assert.equal(again.baseline.status,'ready');
    const after=await call('register_sources',{...base(),sources:[source('OLD'),source('DURING'),source('LAST'),source('AFTER'),source('HEAD')]});
    assert.deepEqual(after.items.map(x=>x.disposition),['baseline_only','baseline_only','baseline_only','new','baseline_only']);
    assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,1);
    const duplicate=await call('register_sources',{...base(),sources:[source('AFTER')]});
    assert.equal(duplicate.items[0].reference.reference_id,after.items[3].reference.reference_id);
  });
  await t.test('removed records and the configured mode cannot be overwritten by rediscovery',async()=>{
    db.prepare('UPDATE "references" SET removed=1 WHERE source_key=?').run('AFTER');
    const removed=await call('register_sources',{...base(),sources:[source('AFTER')]});assert.equal(removed.items[0].disposition,'removed');
    await assert.rejects(()=>call('set_import_mode',{...base(),expected_taxonomy_revision:tax,initial_import:'existing'}),{code:'INVALID_ARGUMENT'});
    assert.equal((await chooseNewOnly()).settings.initial_import,'new_only');
    await finish();await acquire();assert.equal(lease.baseline.status,'ready');assert.equal(lease.pending.length,0);
  });
});

test('new-only collection scope waits for every initial list and preserves imported content on scope expansion',async t=>{
  resetInstallation();await acquire();await chooseNewOnly();
  const mapped=await call('sync_collections',{...base(),expected_taxonomy_revision:tax,collections:[{instagram_id:'111',label:'A',collection_id:null},{instagram_id:'222',label:'B',collection_id:null},{instagram_id:'333',label:'C',collection_id:null}]});
  tax=mapped.taxonomy_revision;const [a,b,c]=mapped.collections.map(x=>x.id);
  async function scope(ids){const result=await call('set_import_scope',{...base(),expected_taxonomy_revision:tax,scope:{mode:'collections',collection_ids:ids}});tax=result.settings.taxonomy_revision;return result;}
  await scope([a,b]);
  await t.test('all selected lists finish before the first import',async()=>{
    const first=await call('record_discovery_page',{...base(),page:page(a,0,null,'OLD_A',true),sources:[source('OLD_A',[a])]});
    assert.equal(first.baseline.status,'collecting');assert.deepEqual(first.baseline.pending_list_ids,[b]);
    const during=await call('record_discovery_page',{...base(),page:page(a,1,null,'DURING',true),sources:[source('DURING',[a])]});
    assert.equal(during.items[0].disposition,'baseline_only');
    const last=await call('record_discovery_page',{...base(),page:page(b,0,null,'OLD_B',true),sources:[source('OLD_B',[b])]});
    assert.equal(last.baseline.status,'ready');assert.equal(db.prepare('SELECT count(*) AS n FROM "references"').get().n,0);
    await call('register_sources',{...base(),sources:[source('LATER',[a,b])]});
  });
  await t.test('scope expansion requires its new baseline and preserves existing results',async()=>{
    const cover=JSON.stringify({sha256:'a'.repeat(64),mime_type:'image/jpeg',byte_count:100,width:10,height:10,acquired_at:'2026-10-13T00:00:00Z'});
    db.prepare('UPDATE "references" SET outcome=?,analysis=?,cover=?,classification=?,result_sha=?,manual_categories=1 WHERE source_key=?').run('complete','{"content_version":"1.2.0","transcription":"fixture"}',cover,'{"category_ids":[],"topic_ids":[]}','b'.repeat(64),'LATER');
    const before=db.prepare('SELECT * FROM "references" WHERE source_key=?').get('LATER');
    const changed=await scope([a,b,c]);assert.equal(changed.baseline.status,'collecting');assert.deepEqual(changed.baseline.pending_list_ids,[c]);
    const head=await call('register_sources',{...base(),sources:[source('UNKNOWN',[a])]});
    assert.equal(head.items[0].disposition,'baseline_only');
    const recorded=await call('record_discovery_page',{...base(),page:page(c,0,null,'OLD_C',true),sources:[source('LATER',[c]),source('OLD_A',[c]),source('OLD_C',[c])]});
    assert.deepEqual(recorded.items.map(x=>x.disposition),['existing','baseline_only','baseline_only']);assert.equal(recorded.baseline.status,'ready');
    const after=db.prepare('SELECT * FROM "references" WHERE source_key=?').get('LATER');
    for(const key of ['analysis','cover','classification','result_sha','manual_categories','outcome'])assert.equal(after[key],before[key]);
    assert.deepEqual(JSON.parse(after.collections),[a,b,c]);
    const newItem=await call('register_sources',{...base(),sources:[source('AFTER_EXPANSION',[c])]});assert.equal(newItem.items[0].disposition,'new');
  });
  await t.test('All posts requires its own complete baseline after a scope change',async()=>{
    const changed=await call('set_import_scope',{...base(),expected_taxonomy_revision:tax,scope:{mode:'all_saved',collection_ids:[]}});tax=changed.settings.taxonomy_revision;
    assert.deepEqual(changed.baseline.pending_list_ids,[null]);
    const empty=await call('record_discovery_page',{...base(),page:page(null,0,null,null,true),sources:[]});assert.equal(empty.baseline.status,'ready');
  });
});


test('versioned covers permit private browser reuse and still require owner authorization',async()=>{
  resetInstallation();await acquire();
  const added=await call('register_sources',{...base(),sources:[source('CACHED_COVER')]});
  const id=added.items[0].reference.reference_id;
  db.prepare('UPDATE "references" SET cover_key=?,cover=? WHERE id=?').run('fixture-cover',JSON.stringify({mime_type:'image/webp'}),id);
  let reads=0;
  globalThis.__discoveryEnv.BUCKET={get:async()=>{reads++;return {body:new Uint8Array([1,2,3])};}};
  try{
    const first=await search({query:'',filters:{category:[],topic:[],creator:[],collection:[]},order:'recent',removed:false,cursor:null},headers);
    const response=await coverResponse(id,headers);
    assert.equal(response.headers.get('Cache-Control'),'private, max-age=3600');
    assert.equal(response.headers.get('Vary'),'Cookie, Authorization, OAI-Sites-Authorization');
    assert.equal(response.headers.get('Content-Type'),'image/webp');
    assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
    await assert.rejects(coverResponse(id,new Headers()),error=>error.code==='UNAUTHENTICATED');
    await assert.rejects(coverResponse(id,new Headers({'oai-authenticated-user-id':'someone_else','oai-authenticated-user-email':'other@example.test'})));
    assert.equal(reads,1);
    const updated=await changeReference({id,expected_revision:first.items[0].revision,action:'remove'},headers);
    assert.notEqual(updated.item.cover_url,first.items[0].cover_url);
  }finally{delete globalThis.__discoveryEnv.BUCKET;await finish();}
});
