import { env } from "cloudflare:workers";
import contract from "./agent-api.json";
import { AppError, canonical, normalize, sha256, valid, validateAnalysis, validateContent } from "./validation";
import { inspectCover } from "./cover";
import { runtimeFile } from "./runtime";

export const VERSION = "0.1.0";
const success = (value: any) => ({ ok: true, contract_version: "1.0.0", ...value });
const now = () => new Date().toISOString();
const expires = () => new Date(Date.now() + 900000).toISOString();
const categoryLabels = ["Confeitaria","Panificação","Churrasco","Barismo","Alfaiataria","Streetwear","Calçados","Acessórios","Maquiagem","Cosméticos","Cabelos","Unhas","Ecoturismo","Mochilão","Hotelaria","Cruzeiros","IA","Câmeras","Aplicativos","Games","Musculação","Corrida","Pilates","Nutrição","Publicidade","Documentários","Videoclipes","Animação"];
export const database = () => { if (!env.DB) throw new AppError("DEPENDENCY_UNAVAILABLE"); return env.DB; };
const statement = (sql: string, args: any[] = []) => database().prepare(sql).bind(...args);
export const one = (sql: string, args: any[] = []) => statement(sql, args).first<any>();
export const all = async (sql: string, args: any[] = []) => (await statement(sql, args).all<any>()).results;
export async function installation() { return one("SELECT * FROM installations WHERE id=1"); }

export async function authorize(headers: Headers, bootstrap = false) {
  const id = headers.get("oai-authenticated-user-id");
  const email = headers.get("oai-authenticated-user-email");
  if (!id || !email) throw new AppError("UNAUTHENTICATED");
  const row = await installation();
  if (row) { if (row.owner_id !== id) throw new AppError("FORBIDDEN"); }
  else if (!bootstrap || !env.OWNER_EMAIL || email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) throw new AppError("FORBIDDEN");
  return { id, row };
}

export function receipt(row: any) {
  return { reference_id: row.id, source_key: row.source_key, revision: row.revision,
    outcome: row.outcome, removed: !!row.removed, index_status: row.analysis ? "ready" : "pending",
    result_sha256: row.result_sha ?? null, cover: row.cover ? JSON.parse(row.cover) : null };
}
export async function reference(id: string, owner: string) {
  const row = await one('SELECT * FROM "references" WHERE id=? AND owner_id=?', [id, owner]);
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}
function checkLease(row: any, args: any) {
  if (!row || row.run_id !== args.run_id || row.lease_epoch !== args.lease_epoch || !row.lease_expires || row.lease_expires <= now()) throw new AppError("LEASE_EXPIRED");
}
const leaseCondition = "EXISTS(SELECT 1 FROM installations WHERE id=1 AND owner_id=? AND run_id=? AND lease_epoch=? AND lease_expires>?)";
function checkedReference(row: any, args: any) {
  if (row.removed) throw new AppError("REFERENCE_REMOVED");
  if (row.revision !== args.expected_revision) throw new AppError("REVISION_CONFLICT", "Reference changed.", null, row.revision);
}

async function replay(owner: string, tool: string, args: any, hash: string) {
  const saved = await one("SELECT * FROM receipts WHERE id=? AND owner_id=? AND tool=? AND expires_at>?", [`${tool}:${args.request_id}`, owner, tool, now()]);
  if (!saved) return null;
  if (saved.input_sha !== hash) throw new AppError("IDEMPOTENCY_CONFLICT");
  return JSON.parse(saved.result);
}

// A NULL receipt violates NOT NULL and rolls back the entire D1 batch when its guard fails.
export async function commit(owner: string, tool: string, args: any, result: any, writes: D1PreparedStatement[], guard: string, guardArgs: any[], before: D1PreparedStatement[] = []) {
  const hash = await sha256(canonical(args));
  const saved = await replay(owner, tool, args, hash);
  if (saved) return saved;
  const until = new Date(Date.now() + 30 * 86400000).toISOString();
  const record = statement(`INSERT INTO receipts(id,owner_id,tool,input_sha,result,expires_at) VALUES(?,?,?,?,CASE WHEN (${guard}) THEN ? ELSE NULL END,?)`, [`${tool}:${args.request_id}`,owner,tool,hash,...guardArgs,canonical(result),until]);
  try { await database().batch([...before, record, ...writes]); }
  catch {
    const raced = await replay(owner, tool, args, hash);
    if (raced) return raced;
    const current = await installation();
    if (current?.owner_id !== owner) throw new AppError("FORBIDDEN");
    if (args.run_id) checkLease(current,args);
    if (args.reference_id) checkedReference(await reference(args.reference_id,owner),args);
    throw new AppError("REVISION_CONFLICT", "State changed. Read the current state and retry.");
  }
  return result;
}

export function settings(row: any) {
  const taxonomy = JSON.parse(row.taxonomy);
  const consent = row.reclassification ? JSON.parse(row.reclassification) : null;
  return { ...JSON.parse(row.settings), taxonomy_revision: row.taxonomy_revision,
    categories: taxonomy.categories, topics: taxonomy.topics,
    collections: taxonomy.collections.map((c:any)=>({...c,instagram_id:c.instagram_id??null,instagram_label:c.instagram_label??null})),
    reclassification_consent_id: consent?.id ?? null, manual_overwrite_allowed: false };
}

export async function baseline(owner:string,row:any,checkpoint?:any) {
  const config=JSON.parse(row.settings);
  if(config.initial_import!=="new_only")return {status:"not_required",required_list_ids:[],pending_list_ids:[],completed_at:null};
  const required:(string|null)[]=config.scope.mode==="all_saved"?[null]:config.scope.collection_ids;
  const lists=await all("SELECT id,baseline_completed_at FROM discovery_lists WHERE owner_id=?",[owner]);
  const completed=new Map(lists.map((item:any)=>[item.id,item.baseline_completed_at]));
  if(checkpoint)completed.set(checkpoint.collection_id??"all_saved",checkpoint.baseline_completed_at);
  const pending=required.filter(id=>!completed.get(id??"all_saved"));
  return {status:pending.length?"collecting":"ready",required_list_ids:required,pending_list_ids:pending,
    completed_at:pending.length?null:required.map(id=>completed.get(id??"all_saved")).sort().at(-1)??null};
}

async function start(owner: string, row: any, args: any) {
  if (args.package_version !== VERSION) throw new AppError("UNSUPPORTED_VERSION", "Use the compatible package version.");
  if (args.mode === "acquire" && (args.run_id !== null || args.lease_epoch !== null || args.pending_cursor !== null)) throw new AppError("INVALID_ARGUMENT");
  if (args.mode === "renew") checkLease(row,args);
  if (args.mode === "acquire" && row?.run_id && row.lease_expires > now()) throw new AppError("RUN_BUSY", "Another run is active.", row.lease_expires);
  const cooldowns = row ? JSON.parse(row.cooldowns) : [];
  const blocked = cooldowns.filter((c: any) => ["instagram","site"].includes(c.service) && c.next_allowed_at > now());
  if (args.mode === "acquire" && blocked.length) throw new AppError("RATE_LIMITED", "A service cooldown remains active.", blocked.map((c:any)=>c.next_allowed_at).sort().at(-1));
  const runId = args.mode === "acquire" ? crypto.randomUUID() : row.run_id;
  const epoch = args.mode === "acquire" ? (row?.lease_epoch ?? 0) + 1 : row.lease_epoch;
  const expiry = expires();
  const taxonomy = {categories: categoryLabels.map(label => ({id:crypto.randomUUID(),label})),topics:[],collections:[]};
  const initial = {package_version:VERSION,analysis_version:"1.0.0",scope:{mode:"all_saved",collection_ids:[]},initial_import:"existing",time_zone:"America/Sao_Paulo",daily_times:["09:00","18:00"]};
  let snapshot = row ?? {settings:JSON.stringify(initial),taxonomy:JSON.stringify(taxonomy),taxonomy_revision:1,cursor:'{"new_saves":null,"initial_import":null}',cooldowns:"[]",reclassification:null};
  let afterId = "", afterTime="", afterSaved="9999-12-31T23:59:59Z";
  if (args.pending_cursor) {
    let cursor:any;
    try{cursor=JSON.parse(atob(args.pending_cursor));}catch{throw new AppError("INVALID_ARGUMENT","Invalid pending cursor.");}
    if(cursor.run!==runId || cursor.epoch!==epoch || typeof cursor.time!=="string" || typeof cursor.saved!=="string" || !/^[0-9a-f-]{36}$/.test(cursor.id))throw new AppError("INVALID_ARGUMENT","Invalid pending cursor.");
    afterId=cursor.id;afterTime=cursor.time;afterSaved=cursor.saved;
  }
  const consent = snapshot.reclassification ? JSON.parse(snapshot.reclassification) : null;
  // Persisted attempts prevent a failing first page from starving the rest after a restart.
  const pendingRows = await all(`SELECT * FROM "references" WHERE owner_id=? AND removed=0
    AND (outcome NOT IN ('complete','unavailable') OR (? IS NOT NULL AND id IN (SELECT value FROM json_each(?))))
    AND (last_attempt_run_id IS NULL OR last_attempt_run_id<>?)
    AND (failure IS NULL OR json_extract(failure,'$.retry_at') IS NULL OR json_extract(failure,'$.retry_at')<=?)
    AND (coalesce(last_attempt_at,'')>? OR (coalesce(last_attempt_at,'')=? AND
      (coalesce(saved_at,discovered_at)<? OR (coalesce(saved_at,discovered_at)=? AND id>?))))
    ORDER BY coalesce(last_attempt_at,''),coalesce(saved_at,discovered_at) DESC,id LIMIT 51`,
    [owner,consent?.id??null,JSON.stringify(consent?.reference_ids??[]),runId,now(),afterTime,afterTime,afterSaved,afterSaved,afterId]);
  const startedAt = args.mode === "acquire" ? now() : (await one("SELECT started_at FROM runs WHERE id=?",[runId])).started_at;
  const result = success({run_id:runId,started_at:startedAt,lease_epoch:epoch,lease_expires_at:expiry,settings:settings(snapshot),cursor:JSON.parse(snapshot.cursor),cooldowns,
    baseline:await baseline(owner,snapshot),pending:pendingRows.slice(0,50).map(receipt),next_pending_cursor:pendingRows.length>50 ? btoa(JSON.stringify({run:runId,epoch,time:pendingRows[49].last_attempt_at??'',saved:pendingRows[49].saved_at??pendingRows[49].discovered_at,id:pendingRows[49].id})) : null});
  const before = row ? [] : [statement("INSERT INTO installations(id,owner_id,settings,taxonomy) VALUES(1,?,?,?) ON CONFLICT(id) DO NOTHING",[owner,JSON.stringify(initial),JSON.stringify(taxonomy)])];
  const guard = args.mode === "acquire" ? "EXISTS(SELECT 1 FROM installations WHERE id=1 AND owner_id=? AND lease_epoch=? AND (run_id IS NULL OR lease_expires<=?))" : leaseCondition;
  const guardArgs = args.mode === "acquire" ? [owner,row?.lease_epoch??0,now()] : [owner,runId,epoch,now()];
  const writes = [statement("UPDATE installations SET run_id=?,lease_epoch=?,lease_expires=? WHERE id=1",[runId,epoch,expiry])];
  if (args.mode === "acquire") writes.push(statement("INSERT INTO runs(id,owner_id,epoch,trigger,started_at) VALUES(?,?,?,?,?)",[runId,owner,epoch,args.trigger,startedAt]));
  return commit(owner,"start_run",args,result,writes,guard,guardArgs,before);
}

const renew = (expiry: string) => statement("UPDATE installations SET lease_expires=? WHERE id=1",[expiry]);
function taxonomyGuard(owner:string,row:any,args:any) {
  return {sql:`${leaseCondition} AND EXISTS(SELECT 1 FROM installations WHERE id=1 AND taxonomy_revision=?)`,args:[owner,args.run_id,args.lease_epoch,now(),row.taxonomy_revision]};
}
async function syncCollections(owner:string,row:any,args:any) {
  if(args.expected_taxonomy_revision!==row.taxonomy_revision)throw new AppError("TAXONOMY_STALE");
  const taxonomy=JSON.parse(row.taxonomy), items:any[]=[];
  const ids=args.collections.map((c:any)=>c.instagram_id);
  if(new Set(ids).size!==ids.length)throw new AppError("INVALID_ARGUMENT","Duplicate Instagram collections.");
  for(const observed of args.collections){
    if(!observed.label.trim())throw new AppError("INVALID_ARGUMENT","A collection label is required.");
    let item=taxonomy.collections.find((c:any)=>c.instagram_id===observed.instagram_id);
    if(observed.collection_id){
      const selected=taxonomy.collections.find((c:any)=>c.id===observed.collection_id);
      if(!selected || (item && item.id!==selected.id) || (selected.instagram_id && selected.instagram_id!==observed.instagram_id))throw new AppError("INVALID_ARGUMENT","Collection mapping conflicts.");
      item=selected;
    }
    if(!item){
      if(taxonomy.collections.length>=500)throw new AppError("INVALID_ARGUMENT","Collection limit reached.");
      let label=observed.label.trim();
      if(taxonomy.collections.some((c:any)=>normalize(c.label)===normalize(label)))label=`${label.slice(0,55)} (${observed.instagram_id})`;
      item={id:crypto.randomUUID(),label};taxonomy.collections.push(item);
    }
    item.instagram_id=observed.instagram_id;item.instagram_label=observed.label.trim();items.push(item);
  }
  const changed=canonical(taxonomy)!==canonical(JSON.parse(row.taxonomy));
  const revision=row.taxonomy_revision+(changed?1:0), expiry=expires(),guard=taxonomyGuard(owner,row,args);
  return commit(owner,"sync_collections",args,success({collections:items,taxonomy_revision:revision,lease_expires_at:expiry}),[
    statement("UPDATE installations SET taxonomy=?,taxonomy_revision=? WHERE id=1",[JSON.stringify(taxonomy),revision]),renew(expiry)
  ],guard.sql,guard.args);
}
async function setImportScope(owner:string,row:any,args:any){
  if(args.expected_taxonomy_revision!==row.taxonomy_revision)throw new AppError("TAXONOMY_STALE");
  const config=JSON.parse(row.settings),collections=JSON.parse(row.taxonomy).collections;
  if(args.scope.mode==="all_saved"?args.scope.collection_ids.length!==0:!args.scope.collection_ids.length || args.scope.collection_ids.some((id:string)=>!collections.some((c:any)=>c.id===id&&c.instagram_id)))throw new AppError("INVALID_ARGUMENT","Select mapped collections.");
  config.scope=args.scope;
  const revision=row.taxonomy_revision+(canonical(config)!==canonical(JSON.parse(row.settings))?1:0),expiry=expires(),guard=taxonomyGuard(owner,row,args);
  const updated={...row,settings:JSON.stringify(config),taxonomy_revision:revision};
  return commit(owner,"set_import_scope",args,success({settings:settings(updated),baseline:await baseline(owner,updated),lease_expires_at:expiry}),[
    statement("UPDATE installations SET settings=?,taxonomy_revision=? WHERE id=1",[JSON.stringify(config),revision]),renew(expiry)
  ],guard.sql,guard.args);
}
async function setImportMode(owner:string,row:any,args:any){
  if(args.expected_taxonomy_revision!==row.taxonomy_revision)throw new AppError("TAXONOMY_STALE");
  const config=JSON.parse(row.settings),changed=config.initial_import!==args.initial_import;
  const unused='NOT EXISTS(SELECT 1 FROM "references") AND NOT EXISTS(SELECT 1 FROM discovery_lists) AND NOT EXISTS(SELECT 1 FROM baseline_sources)';
  if(changed && !(await one(`SELECT (${unused}) AS unused`)).unused)throw new AppError("INVALID_ARGUMENT","Choose the initial import mode before discovery starts.");
  config.initial_import=args.initial_import;
  const revision=row.taxonomy_revision+(changed?1:0),expiry=expires(),guard=taxonomyGuard(owner,row,args);
  const updated={...row,settings:JSON.stringify(config),taxonomy_revision:revision};
  return commit(owner,"set_import_mode",args,success({settings:settings(updated),baseline:await baseline(owner,updated),lease_expires_at:expiry}),[
    statement("UPDATE installations SET settings=?,taxonomy_revision=? WHERE id=1",[JSON.stringify(config),revision]),renew(expiry)
  ],guard.sql+(changed?` AND (${unused})`:""),guard.args);
}
async function discovery(owner:string,row:any,collectionId:string|null){
  if(collectionId && !JSON.parse(row.taxonomy).collections.some((c:any)=>c.id===collectionId&&c.instagram_id))throw new AppError("INVALID_ARGUMENT","Unknown Instagram collection.");
  const found=await one("SELECT * FROM discovery_lists WHERE id=? AND owner_id=?",[collectionId??"all_saved",owner]);
  return {collection_id:collectionId,revision:found?.revision??0,anchor_source_key:found?.anchor_source_key??null,pages:found?.pages??0,completed:!!found?.completed,updated_at:found?.updated_at??null,baseline_completed_at:found?.baseline_completed_at??null};
}
async function register(owner: string, row: any, args: any, paginated=false) {
  const config = settings(row);
  const baselineBefore=await baseline(owner,row),collecting=baselineBefore.status==="collecting";
  const knownCollections = JSON.parse(row.taxonomy).collections.map((c:any)=>c.id);
  const keys = args.sources.map((source:any)=>source.source_key);
  if (new Set(keys).size !== keys.length) throw new AppError("INVALID_ARGUMENT", "Duplicate sources.");
  const guard=taxonomyGuard(owner,row,args);
  const items: any[] = [], writes: D1PreparedStatement[] = [], guards = [guard.sql], guardArgs: any[] = guard.args;
  if(config.initial_import==="new_only"){
    guards.push("(SELECT count(*) FROM discovery_lists WHERE owner_id=? AND id IN (SELECT value FROM json_each(?)) AND baseline_completed_at IS NOT NULL)=?");
    guardArgs.push(owner,JSON.stringify(baselineBefore.required_list_ids.map(id=>id??"all_saved")),baselineBefore.required_list_ids.length-baselineBefore.pending_list_ids.length);
  }
  let checkpoint:any=null;
  if(paginated){
    const page=args.page,previous=await discovery(owner,row,page.collection_id);
    if(config.scope.mode==="collections" && !config.scope.collection_ids.includes(page.collection_id))throw new AppError("INVALID_ARGUMENT","Collection is outside the configured scope.");
    if(page.expected_revision!==previous.revision)throw new AppError("REVISION_CONFLICT","Discovery changed. Read its checkpoint.",null,previous.revision);
    const after=page.restart||previous.completed?null:previous.anchor_source_key;
    if(page.after_source_key!==after || (!page.end_reached && (!page.last_source_key || page.last_source_key===after)) || (!page.last_source_key && args.sources.length))throw new AppError("INVALID_ARGUMENT","Invalid discovery boundary.");
    if(page.collection_id && args.sources.some((s:any)=>!s.collection_ids.includes(page.collection_id)))throw new AppError("INVALID_ARGUMENT","A source must belong to the observed collection.");
    checkpoint={collection_id:page.collection_id,revision:previous.revision+1,anchor_source_key:page.last_source_key,pages:(page.restart||previous.completed?0:previous.pages)+1,completed:page.end_reached,updated_at:now(),baseline_completed_at:previous.baseline_completed_at??(config.initial_import==="new_only"&&page.end_reached?now():null)};
    guards.push("coalesce((SELECT revision FROM discovery_lists WHERE id=? AND owner_id=?),0)=?");guardArgs.push(page.collection_id??"all_saved",owner,previous.revision);
    writes.push(statement("INSERT INTO discovery_lists(id,owner_id,revision,anchor_source_key,pages,completed,updated_at,baseline_completed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,anchor_source_key=excluded.anchor_source_key,pages=excluded.pages,completed=excluded.completed,updated_at=excluded.updated_at,baseline_completed_at=excluded.baseline_completed_at",[page.collection_id??"all_saved",owner,checkpoint.revision,checkpoint.anchor_source_key,checkpoint.pages,checkpoint.completed?1:0,checkpoint.updated_at,checkpoint.baseline_completed_at]));
  }
  for (const source of args.sources) {
    if (source.source_url !== `https://www.instagram.com/reel/${source.source_key}/` || source.collection_ids.some((id:string)=>!knownCollections.includes(id))) throw new AppError("INVALID_ARGUMENT", "Invalid source or collection.");
    if (config.scope.mode === "collections" && !source.collection_ids.some((id:string)=>config.scope.collection_ids.includes(id))) {items.push({source_key:source.source_key,disposition:"out_of_scope",reference:null});continue;}
    const existing = await one('SELECT * FROM "references" WHERE source_key=? AND owner_id=?',[source.source_key,owner]);
    if (existing) {
      const collections=[...new Set([...JSON.parse(existing.collections),...source.collection_ids])];
      const creator=existing.creator?.trim() ? existing.creator : source.creator?.trim() || null;
      if(!existing.removed && (collections.length!==JSON.parse(existing.collections).length || creator!==existing.creator)){
        if(collections.length>500)throw new AppError("INVALID_ARGUMENT","Collection membership limit reached.");
        guards.push('EXISTS(SELECT 1 FROM "references" WHERE id=? AND revision=? AND removed=0)');guardArgs.push(existing.id,existing.revision);
        const indexed=searchText({...existing,creator},existing.analysis?JSON.parse(existing.analysis):null,JSON.parse(existing.classification),JSON.parse(row.taxonomy));
        writes.push(statement('UPDATE "references" SET collections=?,creator=?,search_text=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(collections),creator,indexed,now(),existing.id]));existing.revision++;
      }
      items.push({source_key:source.source_key,disposition:existing.removed?"removed":"existing",reference:receipt(existing)});continue;
    }
    if(config.initial_import==="new_only" && (collecting || await one("SELECT source_key FROM baseline_sources WHERE source_key=? AND owner_id=?",[source.source_key,owner]))){
      if(collecting)writes.push(statement("INSERT INTO baseline_sources(source_key,owner_id) VALUES(?,?) ON CONFLICT(source_key) DO NOTHING",[source.source_key,owner]));
      items.push({source_key:source.source_key,disposition:"baseline_only",reference:null});continue;
    }
    const id = crypto.randomUUID();
    const fresh = {id,source_key:source.source_key,revision:1,outcome:"pending",removed:0,analysis:null,cover:null,result_sha:null};
    items.push({source_key:source.source_key,disposition:"new",reference:receipt(fresh)});
    guards.push('NOT EXISTS(SELECT 1 FROM "references" WHERE source_key=?)'); guardArgs.push(source.source_key);
    writes.push(statement('INSERT INTO "references"(id,owner_id,source_key,source_url,creator,collections,discovered_at,saved_at,save_order,search_text,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,owner,source.source_key,source.source_url,source.creator,JSON.stringify(source.collection_ids),source.discovered_at,source.saved_at,source.save_order,normalize(source.creator??""),now()]));
  }
  const expiry = expires(); writes.push(renew(expiry));
  return commit(owner,paginated?"record_discovery_page":"register_sources",args,success({items,baseline:await baseline(owner,row,checkpoint),...(paginated?{discovery:checkpoint}:{}),lease_expires_at:expiry}),writes,guards.join(" AND "),guardArgs);
}

function referenceGuard(owner: string, row: any, args: any) {
  return {sql:`${leaseCondition} AND EXISTS(SELECT 1 FROM "references" WHERE id=? AND owner_id=? AND revision=? AND removed=0) AND EXISTS(SELECT 1 FROM installations WHERE id=1 AND taxonomy_revision=?)`,
    args:[owner,args.run_id,args.lease_epoch,now(),row.id,owner,row.revision,args.taxonomyRevision]};
}
async function cover(owner: string, installation: any, args: any) {
  const row = await reference(args.reference_id,owner); checkedReference(row,args);
  if (!env.BUCKET) throw new AppError("DEPENDENCY_UNAVAILABLE");
  const inspected = await inspectCover(args);
  const key = `covers/${crypto.randomUUID()}`;
  await env.BUCKET.put(key,inspected.bytes,{httpMetadata:{contentType:args.mime_type}});
  const head = await env.BUCKET.head(key);
  if (!head || head.size !== inspected.bytes.length) {await env.BUCKET.delete(key);throw new AppError("DEPENDENCY_UNAVAILABLE");}
  const data = {sha256:args.sha256,mime_type:args.mime_type,byte_count:inspected.bytes.length,width:inspected.width,height:inspected.height,acquired_at:args.acquired_at};
  const expiry = expires();
  const updated = {...row,revision:row.revision+1,cover:JSON.stringify(data)};
  const guard = referenceGuard(owner,row,{...args,taxonomyRevision:installation.taxonomy_revision});
  try {
    const result = await commit(owner,"store_cover",args,success({reference:receipt(updated),lease_expires_at:expiry}),[
      statement('UPDATE "references" SET cover=?,cover_key=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(data),key,now(),row.id]),renew(expiry)],guard.sql,guard.args);
    const actual = await reference(row.id,owner);
    if (actual.cover_key !== key) await env.BUCKET.delete(key);
    if (row.cover_key && actual.cover_key !== row.cover_key) await env.BUCKET.delete(row.cover_key);
    return result;
  } catch (error) {
    // A lost response can follow a committed batch; verify the current key before cleanup.
    const actual = await reference(row.id,owner);
    if (actual.cover_key !== key) await env.BUCKET.delete(key);
    throw error;
  }
}

export function effectiveClassification(row: any, incoming: any, installation: any) {
  const old = JSON.parse(row.classification);
  if (!incoming && old.taxonomy_revision) return old;
  const taxonomy = JSON.parse(installation.taxonomy);
  if (incoming && incoming.taxonomy_revision !== installation.taxonomy_revision) throw new AppError("TAXONOMY_STALE");
  if (incoming) {
    if (incoming.category_ids.some((id:string)=>!taxonomy.categories.some((c:any)=>c.id===id)) || incoming.topic_ids.some((id:string)=>!taxonomy.topics.some((c:any)=>c.id===id))) throw new AppError("INVALID_ARGUMENT", "Unknown classification.");
    if (incoming.reclassification_consent_id) {
      const consent = installation.reclassification ? JSON.parse(installation.reclassification) : null;
      if (!consent || consent.id !== incoming.reclassification_consent_id || consent.taxonomy_revision !== installation.taxonomy_revision || !consent.reference_ids.includes(row.id)) throw new AppError("CONSENT_REQUIRED");
    }
  }
  return {taxonomy_revision:installation.taxonomy_revision,
    category_ids:row.manual_categories || !incoming ? old.category_ids : incoming.category_ids,
    topic_ids:row.manual_topics || !incoming ? old.topic_ids : incoming.topic_ids,
    reclassification_consent_id:incoming?.reclassification_consent_id??null};
}
export function searchText(row: any, analysis: any, classification: any, taxonomy: any) {
  const labels = [...taxonomy.categories,...taxonomy.topics].filter((t:any)=>[...classification.category_ids,...classification.topic_ids].includes(t.id)).map((t:any)=>t.label);
  return normalize([row.creator??"",...labels,analysis?.caption??"",analysis?.transcription??"",analysis?.transcription_pt??"",analysis?.video_inspection??"",analysis?.semantic_description??"",analysis?.description??"",...(analysis?.transcript??[]).map((s:any)=>s.text),...(analysis?.observations??[]).map((s:any)=>s.fact),...(analysis?.creative_inferences??[]).map((s:any)=>s.fact)].join(" "));
}
async function update(owner: string, installation: any, args: any) {
  const row = await reference(args.reference_id,owner); checkedReference(row,args);
  if(args.analysis && args.content) throw new AppError("INVALID_ARGUMENT","Use one content format.");
  const analysis = args.content ?? args.analysis ?? (row.analysis ? JSON.parse(row.analysis) : null);
  if(analysis?.content_version) validateContent(analysis,args.outcome==="complete");
  else validateAnalysis(analysis,args.outcome==="complete");
  if (args.outcome === "complete" && !row.cover) throw new AppError("INVALID_ARGUMENT", "An original cover is required.");
  const expectedCode: any = {login_required:"LOGIN_REQUIRED",unavailable:"SOURCE_UNAVAILABLE",retry_wait:"RATE_LIMITED"};
  if (expectedCode[args.outcome] && args.failure?.code !== expectedCode[args.outcome]) throw new AppError("INVALID_ARGUMENT", "A matching failure is required.");
  if (args.outcome === "retry_wait" && (!args.failure.retry_at || args.failure.retry_at <= now())) throw new AppError("INVALID_ARGUMENT", "A future retry time is required.");
  if (args.outcome === "complete" && args.failure) throw new AppError("INVALID_ARGUMENT", "Complete results cannot retain a failure.");
  const classification = effectiveClassification(row,args.classification,installation);
  const resultSha = analysis ? await sha256(canonical({analysis,classification})) : null;
  const indexed = searchText(row,analysis,classification,JSON.parse(installation.taxonomy));
  const expiry = expires();
  const next = {...row,revision:row.revision+1,analysis:analysis?JSON.stringify(analysis):null,outcome:args.outcome,result_sha:resultSha};
  const guard = referenceGuard(owner,row,{...args,taxonomyRevision:installation.taxonomy_revision});
  const attemptedAt=now();
  const writes = [statement('UPDATE "references" SET analysis=?,classification=?,search_text=?,result_sha=?,outcome=?,failure=?,revision=revision+1,updated_at=?,last_attempt_at=?,last_attempt_run_id=? WHERE id=?',[next.analysis,JSON.stringify(classification),indexed,resultSha,args.outcome,args.failure?JSON.stringify(args.failure):null,attemptedAt,attemptedAt,args.run_id,row.id]),renew(expiry)];
  if (classification.reclassification_consent_id) {
    const consent = JSON.parse(installation.reclassification);
    consent.reference_ids=consent.reference_ids.filter((id:string)=>id!==row.id);
    writes.push(statement("UPDATE installations SET reclassification=? WHERE id=1",[consent.reference_ids.length?JSON.stringify(consent):null]));
  }
  return commit(owner,"update_reference",args,success({reference:receipt(next),lease_expires_at:expiry}),writes,guard.sql,guard.args);
}

async function finish(owner: string, row: any, args: any) {
  const services = args.cooldowns.map((c:any)=>c.service);
  if (new Set(services).size !== services.length) throw new AppError("INVALID_ARGUMENT");
  const merged: any[] = JSON.parse(row.cooldowns);
  for (const incoming of args.cooldowns) {
    if (incoming.next_allowed_at <= incoming.limited_at || incoming.next_allowed_at <= now() || (incoming.server_reset_at && incoming.next_allowed_at < incoming.server_reset_at)) throw new AppError("INVALID_ARGUMENT", "Invalid cooldown.");
    const old = merged.find((c:any)=>c.service===incoming.service);
    if (!old) merged.push(incoming);
    else if (incoming.next_allowed_at > old.next_allowed_at) Object.assign(old,incoming,{backoff_step:Math.max(old.backoff_step,incoming.backoff_step)});
  }
  if (args.outcome === "retry_wait" && !merged.some(c=>c.next_allowed_at>now())) throw new AppError("INVALID_ARGUMENT", "A cooldown is required.");
  const totals = await one('SELECT count(*) AS discovered, sum(CASE WHEN removed=0 AND outcome=\'complete\' THEN 1 ELSE 0 END) AS complete, sum(CASE WHEN removed=0 AND outcome=\'partial\' THEN 1 ELSE 0 END) AS partial, sum(removed) AS removed, sum(CASE WHEN removed=0 AND outcome NOT IN (\'complete\',\'partial\') THEN 1 ELSE 0 END) AS pending FROM "references" WHERE owner_id=?',[owner]);
  const counts = Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,value??0]));
  const ended = now();
  return commit(owner,"finish_run",args,success({run_id:args.run_id,ended_at:ended,outcome:args.outcome,counts,lease_released:true}),[
    statement("UPDATE installations SET run_id=NULL,lease_expires=NULL,cursor=?,cooldowns=? WHERE id=1",[JSON.stringify(args.cursor),JSON.stringify(merged)]),
    statement("UPDATE runs SET ended_at=?,outcome=? WHERE id=?",[ended,args.outcome,args.run_id])],leaseCondition,[owner,args.run_id,args.lease_epoch,ended]);
}

export async function callTool(name: string, args: any, headers: Headers) {
  const tool = contract.tools.find(tool=>tool.name===name);
  if (!tool) throw new AppError("INVALID_ARGUMENT", "Unknown tool.");
  const identity = await authorize(headers,name==="get_runtime" || (name==="start_run" && args?.mode==="acquire"));
  if (args?.contract_version !== "1.0.0") throw new AppError("UNSUPPORTED_VERSION");
  if (!valid(tool.inputSchema,args)) throw new AppError("INVALID_ARGUMENT", "Arguments do not match the contract.");
  const hash = await sha256(canonical(args));
  if (args.request_id) {const saved=await replay(identity.id,name,args,hash);if(saved)return saved;}
  if (name === "start_run") return start(identity.id,identity.row,args);
  if (name === "get_runtime") return runtimeFile(args.file);
  if (name === "get_discovery") return success({discovery:await discovery(identity.id,identity.row,args.collection_id),baseline:await baseline(identity.id,identity.row)});
  if (name === "get_reference") {
    const row = await reference(args.reference_id,identity.id);
    const data = args.include_content && row.analysis?JSON.parse(row.analysis):null;
    return success({reference:receipt(row),source:{source_key:row.source_key,source_url:row.source_url,creator:row.creator,discovered_at:row.discovered_at,saved_at:row.saved_at,save_order:row.save_order},collection_ids:JSON.parse(row.collections),analysis:data?.content_version?null:data,content:data?.content_version?data:null,
      classification:args.include_content?effectiveClassification(row,null,identity.row):null,
      failure:row.failure?JSON.parse(row.failure):null});
  }
  checkLease(identity.row,args);
  if (name === "sync_collections") return syncCollections(identity.id,identity.row,args);
  if (name === "set_import_scope") return setImportScope(identity.id,identity.row,args);
  if (name === "set_import_mode") return setImportMode(identity.id,identity.row,args);
  if (name === "record_discovery_page") return register(identity.id,identity.row,args,true);
  if (name === "register_sources") return register(identity.id,identity.row,args);
  if (name === "store_cover") return cover(identity.id,identity.row,args);
  if (name === "update_reference") return update(identity.id,identity.row,args);
  return finish(identity.id,identity.row,args);
}

export const toolList = contract.tools.map(({name,description,annotations,inputSchema})=>({name,description,annotations,inputSchema}));
export const assertOutput = (name: string, output: any) => valid(contract.tools.find(t=>t.name===name)!.successSchema,output);
