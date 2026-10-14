import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundled = await build({entryPoints:[fileURLToPath(new URL("../server/updates.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node"});
let instance = 0;
const fresh = () => import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text+`\n// ${instance++}`).toString("base64")}`);
const release = {schema_version:1,version:"1.8.0",summary:"Melhora o processamento."};

test("release comparison uses numeric stable versions and rejects malformed values", async () => {
  const {newerRelease,releaseVersion} = await fresh();
  assert.equal(newerRelease("1.10.0","1.9.9"),true);
  assert.equal(newerRelease("2.0.0","1.99.99"),true);
  assert.equal(newerRelease("1.7.5","1.7.5"),false);
  assert.equal(newerRelease("1.7.2","1.7.5"),false);
  for(const value of [null,"01.2.3","1.2","1.2.3-beta","1.2.3\n","1.2.999999",{}]) assert.throws(()=>releaseVersion(value));
});

test("release checks share a cache and send no installation information", async t => {
  let requests = 0, now = Date.now();
  t.mock.method(Date,"now",()=>now);
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    requests++;
    assert.equal(url,"https://raw.githubusercontent.com/rodrigoebeta/gpt-shou/main/app/server/release.json");
    assert.deepEqual(options.headers,{Accept:"application/json"});
    assert.equal(options.redirect,"error");
    assert.equal(options.body,undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(release);
  });
  const {checkUpdates} = await fresh();
  const results=await Promise.all([checkUpdates(),checkUpdates()]);
  assert.equal(requests,1);
  assert.equal(results[0].status,"available");
  assert.equal(results[0].installed_version,"1.7.5");
  assert.deepEqual(results[0],results[1]);
  await checkUpdates();assert.equal(requests,1);
  now+=15*60*1000+1;
  await checkUpdates();assert.equal(requests,2);
});

test("invalid feeds and failed requests remain unavailable without breaking the library", async t => {
  const cases=[
    ()=>Response.json({...release,schema_version:2}),
    ()=>Response.json({...release,version:"1.9.0<script>"}),
    ()=>Response.json({...release,summary:"x".repeat(501)}),
    ()=>Response.json({...release,url:"https://untrusted.example"}),
    ()=>new Response('{"version":"1.8.0","version":"2.0.0"}'),
    ()=>new Response("<html>Error</html>"),
    ()=>new Response(" ".repeat(2097153)),
    ()=>new Response("unavailable",{status:503}),
    ()=>{throw new DOMException("Request timed out","TimeoutError");},
  ];
  for(const response of cases){
    const mock=t.mock.method(globalThis,"fetch",async()=>response());
    const {checkUpdates}=await fresh();
    const result=await checkUpdates();
    assert.equal(result.status,"unavailable");assert.equal(result.latest,null);
    await checkUpdates();assert.equal(mock.mock.callCount(),1);
    mock.mock.restore();
  }
});

test("equal and older releases never offer a downgrade", async t => {
  for(const version of ["1.7.5","1.7.2"]){
    const mock=t.mock.method(globalThis,"fetch",async()=>Response.json({...release,version}));
    const {checkUpdates}=await fresh();assert.equal((await checkUpdates()).status,"current");
    mock.mock.restore();
  }
});

test("the update endpoint authorizes before checking GitHub and disables private response caching", async t => {
  const result=await build({entryPoints:[fileURLToPath(new URL("../app/api/updates/route.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node",plugins:[{
    name:"update-route-fixture",setup(builder){
      builder.onResolve({filter:/^@\/server\/(store|browser)$/},args=>({path:args.path,namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path.endsWith("store")?
        'export async function authorize(headers){if(headers.get("oai-authenticated-user-id")!=="owner")throw Error("FORBIDDEN");}':
        'export function errorResponse(){return Response.json({error:"FORBIDDEN"},{status:403});}'}));
    }
  }]});
  const {GET}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const request=t.mock.method(globalThis,"fetch",async()=>Response.json(release));
  assert.equal((await GET(new Request("https://fixture.example/api/updates"))).status,403);
  assert.equal(request.mock.callCount(),0);
  const response=await GET(new Request("https://fixture.example/api/updates",{headers:{"oai-authenticated-user-id":"owner"}}));
  assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal((await response.json()).status,"available");
});
