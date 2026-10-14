import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const bundle=JSON.parse(readFileSync(new URL('../server/runtime-bundle.json',import.meta.url),'utf8'));
const materializer=fileURLToPath(new URL('../scripts/materialize-runtime.py',import.meta.url));
const base=fileURLToPath(new URL('../../.cache/shoubox/materialize-tests/',import.meta.url));
mkdirSync(base,{recursive:true});
const directory=mkdtempSync(join(base,'case-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function run(target,content=bundle.archive.content,digest=bundle.archive.sha256){return spawnSync(process.env.SHOUBOX_TEST_PYTHON||'python',[materializer,join(directory,target),content,digest],{encoding:'utf8',timeout:10000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});}
test('offline materialization preserves all six original files and the lockfile byte for byte',()=>{
  const result=run('valid');assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).files_verified,6);assert.equal(JSON.parse(result.stdout).network_used,false);
  for(const file of bundle.files)assert.equal(readFileSync(join(directory,'valid',file.path),'utf8'),file.content);
  assert.equal(hash(readFileSync(join(directory,'valid','package-lock.json'))),bundle.manifest.files.find(file=>file.path==='package-lock.json').sha256);
  assert.equal(existsSync(join(directory,'valid','node_modules')),false);
});
test('materialization rejects an altered outer archive before creating files',()=>{
  const result=run('outer',bundle.archive.content,'0'.repeat(64));assert.notEqual(result.status,0);
  assert.equal(existsSync(join(directory,'outer')),false);
});
test('materialization validates every inner file before writing any file',()=>{
  const payload=structuredClone({manifest:bundle.manifest,files:bundle.files});payload.files[1].content+='\n';
  const encoded=gzipSync(Buffer.from(JSON.stringify(payload)));
  assert.notEqual(run('inner',encoded.toString('base64'),hash(encoded)).status,0);
  assert.equal(existsSync(join(directory,'inner')),false);
});
test('materialization rejects unsafe paths even with a valid outer checksum',()=>{
  const payload=structuredClone({manifest:bundle.manifest,files:bundle.files});payload.files[0].path='../escaped.txt';
  const encoded=gzipSync(Buffer.from(JSON.stringify(payload)));
  assert.notEqual(run('unsafe',encoded.toString('base64'),hash(encoded)).status,0);
  assert.equal(existsSync(join(directory,'escaped.txt')),false);
});
test('materialization does not replace an existing lockfile',()=>{
  const path=join(directory,'existing');mkdirSync(path);writeFileSync(join(path,'package-lock.json'),'KEEP');
  assert.notEqual(run('existing').status,0);
  assert.equal(readFileSync(join(path,'package-lock.json'),'utf8'),'KEEP');
});
