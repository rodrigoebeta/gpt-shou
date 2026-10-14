import { env } from "cloudflare:workers";
import { all, authorize, commit, database, installation, reference, settings, searchText, VERSION } from "./store";
import { AppError, canonical, normalize, readBody, sha256 } from "./validation";

export function publicReference(row: any, taxonomy: any) {
  const classification = JSON.parse(row.classification);
  return { id:row.id, revision:row.revision, source_url:row.source_url, creator:row.creator,
    saved_at:row.saved_at??row.discovered_at, category_ids:classification.category_ids, topic_ids:classification.topic_ids,
    categories:taxonomy.categories.filter((t:any)=>classification.category_ids.includes(t.id)),
    topics:taxonomy.topics.filter((t:any)=>classification.topic_ids.includes(t.id)),
    collection_ids:JSON.parse(row.collections), outcome:row.outcome, removed:!!row.removed,
    cover_url:row.cover_key?`/api/covers/${row.id}?v=${row.revision}`:null };
}

export async function session(headers: Headers) {
  const identity = await authorize(headers,true);
  const row = identity.row;
  return {connected:!!row,version:VERSION,search_mode:"keyword",settings:row?settings(row):null,
    collections:row?JSON.parse(row.taxonomy).collections:[],
    run:row?.run_id?{active:row.lease_expires>new Date().toISOString(),expires_at:row.lease_expires}:null,
    cooldowns:row?JSON.parse(row.cooldowns):[],automation_enabled:false};
}

export function csrf(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new AppError("FORBIDDEN");
}

function searchFilters(body: any, owner: string) {
  if (!body || Object.keys(body).some(key=>!["query","filters","order","removed","cursor"].includes(key)) || typeof body.query!=="string" || body.query.length>500 || !["best","recent"].includes(body.order) || typeof body.removed!=="boolean") throw new AppError("INVALID_ARGUMENT");
  const filters = body.filters;
  if (!filters || Object.keys(filters).some(key=>!["category","topic","creator","collection"].includes(key))) throw new AppError("INVALID_ARGUMENT");
  for(const key of ["category","topic","creator","collection"]) {
    if (!Array.isArray(filters[key]) || filters[key].some((s:any)=>typeof s!=="string" || s.length>128)) throw new AppError("INVALID_ARGUMENT");
  }
  const clauses=["owner_id=?","removed=?"],args:any[]=[owner,body.removed?1:0];
  for (const [key,path] of [["category","$.category_ids"],["topic","$.topic_ids"]]) {
    if (filters[key].length) {clauses.push("EXISTS(SELECT 1 FROM json_each(classification,?) WHERE value IN (SELECT value FROM json_each(?)))");args.push(path,JSON.stringify(filters[key]));}
  }
  if(filters.creator.length){clauses.push("creator IN (SELECT value FROM json_each(?))");args.push(JSON.stringify(filters.creator));}
  if(filters.collection.length){clauses.push("EXISTS(SELECT 1 FROM json_each(collections) WHERE value IN (SELECT value FROM json_each(?)))");args.push(JSON.stringify(filters.collection));}
  return {clauses,args,words:[...new Set(normalize(body.query).trim().split(/\s+/).filter(Boolean))]};
}

export async function search(body: any, headers: Headers) {
  const {id,row} = await authorize(headers);
  const taxonomy = JSON.parse(row.taxonomy);
  const {clauses,args,words}=searchFilters(body,id);
  if(words.length){clauses.push("NOT EXISTS(SELECT 1 FROM json_each(?) WHERE instr(search_text,value)=0)");args.push(JSON.stringify(words));}
  const digest = await sha256(canonical({owner:id,query:body.query,filters:body.filters,order:body.order,removed:body.removed}));
  let offset=0;
  if(body.cursor){
    let cursor:any;
    try{cursor=JSON.parse(atob(body.cursor));}catch{throw new AppError("INVALID_ARGUMENT");}
    if(cursor.hash!==digest || !Number.isSafeInteger(cursor.offset) || cursor.offset<0)throw new AppError("INVALID_ARGUMENT");
    offset=cursor.offset;
  }
  const where=clauses.join(" AND ");
  const count=await database().prepare(`SELECT count(*) AS count FROM "references" WHERE ${where}`).bind(...args).first<any>();
  const columns="id,revision,source_url,creator,saved_at,discovered_at,classification,collections,outcome,removed,cover_key";
  const rank=words.length && body.order==="best" ? "(SELECT sum(CASE WHEN instr(lower(coalesce(creator,'')),value)>0 THEN 5 ELSE 1 END) FROM json_each(?))" : "0";
  const rankArgs=words.length && body.order==="best"?[JSON.stringify(words)]:[];
  const records=await all(`SELECT ${columns},(${rank}) AS rank FROM "references" WHERE ${where} ORDER BY rank DESC,coalesce(saved_at,discovered_at) DESC,id LIMIT 51 OFFSET ?`,[...rankArgs,...args,offset]);
  return {items:records.slice(0,50).map((r:any)=>publicReference(r,taxonomy)),total:count.count,
    cursor:records.length>50?btoa(JSON.stringify({hash:digest,offset:offset+50})):null};
}

export async function facets(url: URL, headers: Headers) {
  const {id,row}=await authorize(headers);
  const type=url.searchParams.get("type"),query=normalize(url.searchParams.get("query")??"");
  const offset=Number(url.searchParams.get("offset")??0);
  if(!["category","topic","creator","collection"].includes(type??"") || query.length>200 || !Number.isSafeInteger(offset) || offset<0)throw new AppError("INVALID_ARGUMENT");
  let items:any[],more=false;
  if(type==="creator"){
    items=await all('SELECT creator AS id,creator AS label FROM "references" WHERE owner_id=? AND creator IS NOT NULL AND instr(lower(creator),?)>0 GROUP BY creator ORDER BY creator LIMIT 21 OFFSET ?',[id,query,offset]);
    more=items.length>20;items=items.slice(0,20);
  } else {
    const taxonomy=JSON.parse(row.taxonomy);
    const key:any={category:"categories",topic:"topics",collection:"collections"};
    const matches=taxonomy[key[type!]].filter((item:any)=>normalize(item.label).includes(query)).sort((a:any,b:any)=>a.label.localeCompare(b.label,"pt-BR"));
    items=matches.slice(offset,offset+20);more=matches.length>offset+20;
  }
  return {items,next_offset:more?offset+20:null};
}

export async function changeReference(body:any,headers:Headers) {
  const {id,row:installation}=await authorize(headers);
  if(!body || Object.keys(body).some(key=>!["id","expected_revision","action","category_ids","topic_ids"].includes(key)) || typeof body.id!=="string" || !Number.isSafeInteger(body.expected_revision) || !["remove","restore","classify"].includes(body.action))throw new AppError("INVALID_ARGUMENT");
  const row=await reference(body.id,id);
  if(row.revision!==body.expected_revision)throw new AppError("REVISION_CONFLICT","A referência mudou. Atualize a biblioteca.",null,row.revision);
  const taxonomy=JSON.parse(installation.taxonomy);
  const writes:D1PreparedStatement[]=[];
  if(body.action==="classify"){
    if(row.removed)throw new AppError("REFERENCE_REMOVED");
    for(const [field,list] of [["category_ids",taxonomy.categories],["topic_ids",taxonomy.topics]] as const){
      if(!Array.isArray(body[field]) || body[field].length>100 || new Set(body[field]).size!==body[field].length || body[field].some((key:any)=>!list.some((item:any)=>item.id===key)))throw new AppError("INVALID_ARGUMENT");
    }
    const classification={taxonomy_revision:installation.taxonomy_revision,category_ids:body.category_ids,topic_ids:body.topic_ids,reclassification_consent_id:null};
    const analysis=row.analysis?JSON.parse(row.analysis):null;
    const digest=analysis?await sha256(canonical({analysis,classification})):null;
    writes.push(database().prepare('UPDATE "references" SET classification=?,manual_categories=1,manual_topics=1,search_text=?,result_sha=?,revision=revision+1,updated_at=? WHERE id=?').bind(JSON.stringify(classification),searchText(row,analysis,classification,taxonomy),digest,new Date().toISOString(),row.id));
  } else {
    writes.push(database().prepare('UPDATE "references" SET removed=?,revision=revision+1,updated_at=? WHERE id=?').bind(body.action==="remove"?1:0,new Date().toISOString(),row.id));
  }
  const args={...body,request_id:crypto.randomUUID()};
  await commit(id,"browser_reference",args,{ok:true},writes,'EXISTS(SELECT 1 FROM "references" WHERE id=? AND owner_id=? AND revision=?) AND EXISTS(SELECT 1 FROM installations WHERE id=1 AND taxonomy_revision=?)',[row.id,id,row.revision,installation.taxonomy_revision]);
  return {item:publicReference(await reference(row.id,id),taxonomy)};
}

export async function changeSettings(body:any,headers:Headers) {
  const {id,row}=await authorize(headers);
  if(!body || Object.keys(body).some(key=>!["revision","action","type","id","label","reclassify"].includes(key)) || body.revision!==row.taxonomy_revision || !["add","rename","remove"].includes(body.action) || !["category","topic","collection"].includes(body.type) || typeof body.reclassify!=="boolean")throw new AppError("INVALID_ARGUMENT");
  const taxonomy=JSON.parse(row.taxonomy);
  const key:any={category:"categories",topic:"topics",collection:"collections"};
  const values=taxonomy[key[body.type]];
  if(body.action!=="remove" && (typeof body.label!=="string" || !body.label.trim() || body.label.trim().length>100 || values.some((value:any)=>value.id!==body.id&&normalize(value.label)===normalize(body.label.trim()))))throw new AppError("INVALID_ARGUMENT","Nome vazio ou já existente.");
  if(body.action==="add"){
    if(values.length>=500)throw new AppError("INVALID_ARGUMENT","Limite de opções atingido.");
    values.push({id:crypto.randomUUID(),label:body.label.trim()});
  } else {
    const index=values.findIndex((item:any)=>item.id===body.id);
    if(index<0)throw new AppError("NOT_FOUND");
    if(body.action==="rename")values[index].label=body.label.trim();
    else {
      if(body.type==="collection" && JSON.parse(row.settings).scope.collection_ids.includes(body.id))throw new AppError("INVALID_ARGUMENT","Retire a coleção do escopo antes de removê-la.");
      const field=body.type==="collection"?"collections":"classification";
      const path=body.type==="collection"?"$":body.type==="category"?"$.category_ids":"$.topic_ids";
      const used=await database().prepare(`SELECT id FROM "references" WHERE owner_id=? AND EXISTS(SELECT 1 FROM json_each(${field},?) WHERE value=?) LIMIT 1`).bind(id,path,body.id).first();
      if(used)throw new AppError("INVALID_ARGUMENT","Opção em uso. Altere as referências primeiro.");
      values.splice(index,1);
    }
  }
  const revision=row.taxonomy_revision+1;
  const references=body.reclassify?await all('SELECT id FROM "references" WHERE owner_id=? AND removed=0',[id]):[];
  const consent=references.length?{id:crypto.randomUUID(),taxonomy_revision:revision,reference_ids:references.map((r:any)=>r.id)}:null;
  await commit(id,"browser_taxonomy",{...body,request_id:crypto.randomUUID()},{ok:true},[
    database().prepare("UPDATE installations SET taxonomy=?,taxonomy_revision=?,reclassification=? WHERE id=1").bind(JSON.stringify(taxonomy),revision,consent?JSON.stringify(consent):null)
  ],"EXISTS(SELECT 1 FROM installations WHERE id=1 AND owner_id=? AND taxonomy_revision=?)",[id,row.taxonomy_revision]);
  return session(headers);
}

export async function coverResponse(id:string,headers:Headers) {
  const owner=await authorize(headers);
  const row=await reference(id,owner.id);
  if(!row.cover_key || !env.BUCKET)throw new AppError("NOT_FOUND");
  const object=await env.BUCKET.get(row.cover_key);
  if(!object)throw new AppError("NOT_FOUND");
  const mime=JSON.parse(row.cover).mime_type;
  return new Response(object.body,{headers:{"Content-Type":mime,"Cache-Control":"private, max-age=3600","Vary":"Cookie, Authorization, OAI-Sites-Authorization","X-Content-Type-Options":"nosniff"}});
}

export function errorResponse(error:unknown) {
  const failure=error instanceof AppError?error:new AppError("INTERNAL_ERROR","Não foi possível concluir. Tente novamente.");
  const status:any={UNAUTHENTICATED:401,FORBIDDEN:403,NOT_FOUND:404,REVISION_CONFLICT:409,REFERENCE_REMOVED:409,INVALID_ARGUMENT:400};
  return Response.json({error:{code:failure.code,message:failure.message}},{status:status[failure.code]??503,headers:{"Cache-Control":"no-store"}});
}
export async function body(request:Request){csrf(request);return readBody(request);}
