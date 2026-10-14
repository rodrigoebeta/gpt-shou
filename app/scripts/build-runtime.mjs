import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const names=['package.json','package-lock.json','bootstrap.mjs','acquire.mjs','transcribe.py','workflow.txt'];
const files=await Promise.all(names.map(async path=>{
  const content=await readFile(new URL(`../runtime/${path}`,import.meta.url),'utf8');
  return {path,sha256:createHash('sha256').update(content).digest('hex'),content};
}));
const manifest={runtime_version:'1.7.5',execution:'cloud',platform:'linux-x64',node_minimum:22,files:files.map(({path,sha256})=>({path,sha256}))};
const compressed=gzipSync(Buffer.from(JSON.stringify({manifest,files})),{level:9});
const materializer=await readFile(new URL('./materialize-runtime.py',import.meta.url),'utf8');
const archive={encoding:'gzip-base64-json',sha256:createHash('sha256').update(compressed).digest('hex'),content:compressed.toString('base64'),materializer,materializer_sha256:createHash('sha256').update(materializer).digest('hex')};
const output=JSON.stringify({manifest,files,archive},null,2)+'\n';
const target=new URL('../server/runtime-bundle.json',import.meta.url);
if(process.argv.includes('--check')){
  const saved=JSON.parse(await readFile(target,'utf8'));
  const encoded=Buffer.from(saved.archive?.content??'','base64');
  if(JSON.stringify({manifest:saved.manifest,files:saved.files})!==JSON.stringify({manifest,files}) || saved.archive?.materializer!==materializer || saved.archive.materializer_sha256!==archive.materializer_sha256 || createHash('sha256').update(encoded).digest('hex')!==saved.archive.sha256 || gunzipSync(encoded,{maxOutputLength:1048576}).toString('utf8')!==JSON.stringify({manifest,files}))throw Error('The runtime bundle is stale.');
}
else await writeFile(target,output);
