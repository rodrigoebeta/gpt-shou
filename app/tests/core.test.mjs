import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {transform,build} from "esbuild";
import {test} from "node:test";
import assert from "node:assert/strict";
const source=await readFile(new URL("../server/validation.ts",import.meta.url),"utf8");
const {code}=await transform(source,{loader:"ts",format:"esm",target:"es2022"});
const {parseStrict,readBody,valid,canonical,sha256,normalize,validateAnalysis,validateContent}=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const contract=JSON.parse(await readFile(new URL("../server/agent-api.json",import.meta.url),"utf8"));
const bundled=await build({entryPoints:[fileURLToPath(new URL("../server/mcp-request.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node"});
const {mcpRequest}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

test("managed MCP envelopes accept absent or null IDs and protocol metadata without weakening tool schemas",()=>{
  const arguments_={contract_version:"1.0.0",reference_id:"7cbb5bb1-b5bc-4337-aec3-b95c623b1802",include_content:false};
  const body={jsonrpc:"2.0",method:"tools/call",params:{name:"get_reference",arguments:arguments_,_meta:{progressToken:1}}};
  assert.equal(mcpRequest(body).id,null);
  assert.equal(mcpRequest({...body,id:null,_meta:{trace:"fixture"}}).id,null);
  assert.equal(mcpRequest({...body,id:"request"}).id,"request");
  for(const id of [true,{},[],1.5])assert.throws(()=>mcpRequest({...body,id}));
  assert.throws(()=>mcpRequest({...body,owner_id:"claim"}));
  assert.throws(()=>mcpRequest({...body,params:{...body.params,owner_id:"claim"}}));
  assert.throws(()=>mcpRequest({...body,jsonrpc:"1.0"}));
  const schema=contract.tools.find(tool=>tool.name==="get_reference").inputSchema;
  assert.equal(valid(schema,arguments_),true);
  assert.equal(valid(schema,{...arguments_,owner_id:"claim"}),false);
});

test("all date schemas support connector full-string matching and calendar validation",()=>{
  let count=0;
  function inspect(schema){if(!schema||typeof schema!=="object")return;if(schema.format==="date-time"){
    count++;
    const regex=new RegExp(schema.pattern);
    for(const date of ["2026-10-13T05:08:59.946Z","2026-10-13T05:08:59Z"]){assert.equal(regex.exec(date)?.[0],date);assert.equal(valid(schema,date),true);}
    for(const date of ["Z","2026-10-13T05:08:59+00:00","2026-02-30T05:08:59Z"])assert.equal(valid(schema,date),false);
  }for(const value of Object.values(schema))inspect(value);}
  inspect(contract);assert.ok(count>20);
});

test("strict parsing rejects duplicate, escaped duplicate, prototype, and excessive keys",()=>{
  assert.deepEqual(parseStrict('{"nested":[{"id":1}],"text":"{[\\\"x\\\"]}"}'),{nested:[{id:1}],text:'{["x"]}'});
  for(const text of ['{"id":1,"id":2}','{"id":1,"\\u0069d":2}','{"__proto__":{}}','['.repeat(65)+'0'+']'.repeat(65)])assert.throws(()=>parseStrict(text));
  assert.deepEqual(parseStrict('{"x":{"id":1},"y":{"id":2}}'),{x:{id:1},y:{id:2}});
});
test("contract schemas enforce strict properties, UUID, version, nullability, dates, and collection bounds",()=>{
  const schema=contract.tools.find(tool=>tool.name==="start_run").inputSchema;
  const good={contract_version:"1.0.0",request_id:crypto.randomUUID(),package_version:"0.1.0",mode:"acquire",trigger:"manual",run_id:null,lease_epoch:null,pending_cursor:null};
  assert.equal(valid(schema,good),true);
  for(const patch of [{owner_id:"attacker"},{request_id:"not-uuid"},{contract_version:"2"},{lease_epoch:Infinity}])assert.equal(valid(schema,{...good,...patch}),false);
  const missing={...good};delete missing.pending_cursor;assert.equal(valid(schema,missing),false);
  const date={type:"string",format:"date-time",pattern:"Z$"};
  assert.equal(valid(date,"2026-02-28T00:00:00Z"),true);
  assert.equal(valid(date,"2026-02-31T00:00:00Z"),false);
  const array={type:"array",items:{type:"string"},maxItems:2,uniqueItems:true};
  assert.equal(valid(array,["a","b"]),true);assert.equal(valid(array,["a","a"]),false);assert.equal(valid(array,["a","b","c"]),false);
});
test("streamed bodies enforce byte bounds and reject invalid UTF-8",async()=>{
  assert.deepEqual(await readBody(new Request("http://localhost/",{method:"POST",body:'{"ok":true}'})),{ok:true});
  await assert.rejects(()=>readBody(new Request("http://localhost/",{method:"POST",body:new Uint8Array([0xff])})),error=>error.code==="INVALID_ARGUMENT");
  await assert.rejects(()=>readBody(new Request("http://localhost/",{method:"POST",body:" ".repeat(2097153)})),error=>error.code==="CONTENT_TOO_LARGE");
});
test("canonical receipts ignore object-key order and preserve array order and Unicode",async()=>{
  assert.equal(canonical({z:1,a:{b:2,a:"câmera"}}),'{"a":{"a":"câmera","b":2},"z":1}');
  assert.equal(await sha256(canonical({b:2,a:1})),await sha256(canonical({a:1,b:2})));
  assert.notEqual(await sha256(canonical([1,2])),await sha256(canonical([2,1])));
  assert.equal(normalize("Câmeras PANIFICAÇÃO"),"cameras panificacao");
});
test("audiovisual validation rejects invented speech, contradictory modalities, and out-of-range evidence",()=>{
  const analysis={duration_seconds:10,transcript_language:null,inspection:{visual:"observed",audio:"absent",speech:"absent"},transcript:[],description:"",observations:[],creative_inferences:[]};
  assert.doesNotThrow(()=>validateAnalysis(analysis,true));
  assert.throws(()=>validateAnalysis({...analysis,transcript:[{start:0,end:1,text:"invented"}]},false));
  assert.throws(()=>validateAnalysis({...analysis,observations:[{start:0,end:11,fact:"x",modality:"visual",inference:false}]},false));
  assert.throws(()=>validateAnalysis({...analysis,observations:[{start:0,end:1,fact:"x",modality:"audio",inference:false}]},false));
  assert.throws(()=>validateAnalysis({...analysis,creative_inferences:[{start:0,end:1,fact:"x",modality:"visual",inference:false}]},false));
  assert.throws(()=>validateAnalysis({...analysis,inspection:{visual:"observed",audio:"unavailable",speech:"unavailable"}},true));
  assert.doesNotThrow(()=>validateAnalysis({...analysis,inspection:{visual:"observed",audio:"unavailable",speech:"unavailable"}},false));
});

test('keyword content accepts verified speech absence and preserves unavailable inspection',()=>{
  const content={content_version:'1.2.0',caption:'',transcription:'',transcription_pt:'',video_inspection:'A synthetic watering can.',semantic_description:'A synthetic garden product.',availability:{caption:'observed',transcription:'absent',transcription_pt:'absent',video_inspection:'observed',semantic_description:'generated'}};
  const schema=contract.tools.find(tool=>tool.name==='update_reference').inputSchema.properties.content;
  assert.equal(valid(schema,content),true);assert.doesNotThrow(()=>validateContent(content,true));
  const unavailable={...content,transcription:null,transcription_pt:null,availability:{...content.availability,transcription:'unavailable',transcription_pt:'unavailable'}};
  assert.doesNotThrow(()=>validateContent(unavailable,false));assert.throws(()=>validateContent(unavailable,true));
  assert.throws(()=>validateContent({...unavailable,transcription:'invented'},false));
  assert.throws(()=>validateContent({...content,transcription:'invented'},true));
  assert.equal(valid(schema,{...content,owner_id:'forged'}),false);
});

test('Portuguese translation is required for complete new content and cannot replace unobserved speech',()=>{
  const content={content_version:'1.2.0',caption:'caption',transcription:'Built-in attachments.',transcription_pt:'Acessórios embutidos.',video_inspection:'Objeto azul.',semantic_description:'Design de produto.',availability:{caption:'observed',transcription:'observed',transcription_pt:'translated',video_inspection:'observed',semantic_description:'generated'}};
  const schema=contract.tools.find(tool=>tool.name==='update_reference').inputSchema.properties.content;
  assert.equal(valid(schema,content),true);assert.doesNotThrow(()=>validateContent(content,true));
  const missing={...content,transcription_pt:null,availability:{...content.availability,transcription_pt:'unavailable'}};
  assert.doesNotThrow(()=>validateContent(missing,false));assert.throws(()=>validateContent(missing,true));
  for(const patch of [
    {transcription_pt:' '},
    {availability:{...content.availability,transcription_pt:'original'}},
    {transcription:null,availability:{...content.availability,transcription:'unavailable'}},
    {transcription:'',availability:{...content.availability,transcription:'absent'}}
  ])assert.throws(()=>validateContent({...content,...patch},false));
  const original={...content,transcription:'Acessórios embutidos.',availability:{...content.availability,transcription_pt:'original'}};
  assert.doesNotThrow(()=>validateContent(original,true));
  assert.equal(valid(schema,{...content,transcription_pt:'a'.repeat(250001)}),false);
});

test('historical content stays readable while new content writes require semantic text',()=>{
  const legacy={content_version:'1.0.0',caption:'caption',transcription:'Speech.',video_inspection:'Objeto.',availability:{caption:'observed',transcription:'observed',video_inspection:'observed'}};
  const translated={...legacy,content_version:'1.1.0',transcription_pt:'Fala.',availability:{...legacy.availability,transcription_pt:'translated'}};
  const input=contract.tools.find(tool=>tool.name==='update_reference').inputSchema.properties.content;
  const output=contract.tools.find(tool=>tool.name==='get_reference').successSchema.properties.content;
  for(const old of [legacy,translated]){
    assert.equal(valid(input,old),false);assert.equal(valid(output,old),true);
    assert.doesNotThrow(()=>validateContent(old,true));
  }
  const current={...translated,content_version:'1.2.0',semantic_description:'Design de produto.',availability:{...translated.availability,semantic_description:'generated'}};
  assert.equal(valid(input,current),true);assert.equal(valid(output,current),true);
});

test('semantic content requires available source text, bounded nonblank text, and honest availability',()=>{
  const content={content_version:'1.2.0',caption:'',transcription:'',transcription_pt:'',video_inspection:'Objeto azul.',semantic_description:'Design de produto.',availability:{caption:'observed',transcription:'absent',transcription_pt:'absent',video_inspection:'observed',semantic_description:'generated'}};
  const schema=contract.tools.find(tool=>tool.name==='update_reference').inputSchema.properties.content;
  assert.equal(valid(schema,content),true);assert.doesNotThrow(()=>validateContent(content,true));
  const missing={...content,semantic_description:null,availability:{...content.availability,semantic_description:'unavailable'}};
  assert.doesNotThrow(()=>validateContent(missing,false));assert.throws(()=>validateContent(missing,true));
  assert.throws(()=>validateContent({...missing,semantic_description:'invented'},false));
  for(const semantic_description of [null,'',' '])assert.throws(()=>validateContent({...content,semantic_description},false));
  const noSource={...content,video_inspection:null,availability:{...content.availability,video_inspection:'unavailable'}};
  assert.throws(()=>validateContent(noSource,false));
  assert.doesNotThrow(()=>validateContent({...noSource,caption:'A caption supplies source evidence.'},false));
  assert.equal(valid(schema,{...content,semantic_description:'a'.repeat(6001)}),false);
  const omitted=structuredClone(content);delete omitted.semantic_description;
  assert.equal(valid(schema,omitted),false);
  assert.equal(valid(schema,{...content,availability:{...content.availability,semantic_description:'observed'}}),false);
});
