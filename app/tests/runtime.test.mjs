import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

globalThis.__shouboxRuntimeTestEnv={DB:{prepare:()=>({bind:()=>({first:async()=>({owner_id:'fixture_owner'})})})}};
const result=await build({entryPoints:[fileURLToPath(new URL('../server/store.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
  name:'isolated-runtime-test',setup(builder){
    builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
    builder.onResolve({filter:/^\.\/cover$/},()=>({path:'cover',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='env'?'export const env=globalThis.__shouboxRuntimeTestEnv;':'export function inspectCover(){throw Error("Not exercised in the runtime delivery test.")}'}));
  }
}]});
const {callTool,searchText,assertOutput}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const headers=new Headers({'oai-authenticated-user-id':'fixture_owner','oai-authenticated-user-email':'fixture@example.test'});
const bundle=JSON.parse(await readFile(new URL('../server/runtime-bundle.json',import.meta.url),'utf8'));

test('runtime delivery authenticates the owner and rejects path injection',async()=>{
  const args={contract_version:'1.0.0',file:'manifest'};
  assert.equal(assertOutput('get_runtime',await callTool('get_runtime',args,headers)),true);
  const delivered=await callTool('get_runtime',args,headers);
  assert.equal(createHash('sha256').update(Buffer.from(delivered.archive.content,'base64')).digest('hex'),delivered.archive.sha256);
  assert.equal(createHash('sha256').update(delivered.archive.materializer).digest('hex'),delivered.archive.materializer_sha256);
  await assert.rejects(()=>callTool('get_runtime',args,new Headers()),error=>error.code==='UNAUTHENTICATED');
  await assert.rejects(()=>callTool('get_runtime',args,new Headers({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'fixture@example.test'})),error=>error.code==='FORBIDDEN');
  await assert.rejects(()=>callTool('get_runtime',{...args,file:'../../.dev.vars'},headers),error=>error.code==='INVALID_ARGUMENT');
  await assert.rejects(()=>callTool('get_runtime',{...args,owner_id:'forged'},headers),error=>error.code==='INVALID_ARGUMENT');
});
test('each runtime file matches its manifest and source bytes',async()=>{
  for(const file of bundle.files){
    const delivered=await callTool('get_runtime',{contract_version:'1.0.0',file:file.path},headers);
    assert.equal(assertOutput('get_runtime',delivered),true);
    assert.equal(createHash('sha256').update(delivered.content).digest('hex'),delivered.sha256);
    assert.equal(delivered.content,await readFile(new URL(`../runtime/${file.path}`,import.meta.url),'utf8'));
    assert.equal(bundle.manifest.files.find(item=>item.path===file.path).sha256,delivered.sha256);
  }
});

test('a fresh installation exposes its runtime only to the configured owner before the first lease',async()=>{
  const original=globalThis.__shouboxRuntimeTestEnv.DB;
  globalThis.__shouboxRuntimeTestEnv.OWNER_EMAIL='fixture@example.test';
  globalThis.__shouboxRuntimeTestEnv.DB={prepare:()=>({bind:()=>({first:async()=>null})})};
  const args={contract_version:'1.0.0',file:'manifest'};
  try{
    assert.equal(assertOutput('get_runtime',await callTool('get_runtime',args,headers)),true);
    await assert.rejects(()=>callTool('get_runtime',args,new Headers({'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'})),{code:'FORBIDDEN'});
    await assert.rejects(()=>callTool('get_runtime',args,new Headers()),{code:'UNAUTHENTICATED'});
  }finally{globalThis.__shouboxRuntimeTestEnv.DB=original;delete globalThis.__shouboxRuntimeTestEnv.OWNER_EMAIL;}
});
test('caption, original and Portuguese speech, visual, and semantic-only terms enter the same keyword index while legacy text remains searchable',()=>{
  const taxonomy={categories:[{id:'c',label:'Publicidade'}],topics:[]};
  const classification={category_ids:['c'],topic_ids:[]};
  const current=searchText({creator:'fixture'},{content_version:'1.2.0',caption:'Legenda café',transcription:'built-in attachments',transcription_pt:'acessórios embutidos',video_inspection:'objeto amarelo',semantic_description:'Personalização funcional por manufatura aditiva'},classification,taxonomy);
  for(const term of ['legenda cafe','built-in attachments','acessorios embutidos','objeto amarelo','personalizacao funcional','manufatura aditiva','publicidade'])assert.ok(current.includes(term));
  const legacy=searchText({}, {description:'legacy description',transcript:[{text:'legacy speech'}],observations:[{fact:'legacy visible'}],creative_inferences:[]},classification,taxonomy);
  for(const term of ['legacy description','legacy speech','legacy visible'])assert.ok(legacy.includes(term));
});
