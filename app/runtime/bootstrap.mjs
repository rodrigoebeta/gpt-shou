import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform!=='linux' || process.arch!=='x64' || Number(process.versions.node.split('.')[0])<22) throw Error('The cloud runtime requires Linux x86_64 and Node 22 or later.');
const root = dirname(fileURLToPath(import.meta.url));
const cache = join(root,'.cache');
const native = join(root,'.tools','native');
await mkdir(join(cache,'tmp'),{recursive:true}); await mkdir(native,{recursive:true});
const env = {...process.env,TEMP:join(cache,'tmp'),TMP:join(cache,'tmp'),TMPDIR:join(cache,'tmp'),npm_config_cache:join(cache,'npm')};
function run(stage, command, args, timeout) {
  console.log(JSON.stringify({stage,status:'started'}));
  try { execFileSync(command,args,{cwd:root,env,stdio:'inherit',timeout}); }
  catch(error) { console.log(JSON.stringify({stage,status:'failed',exit_code:error.status??null,signal:error.signal??null})); throw error; }
  console.log(JSON.stringify({stage,status:'passed'}));
}
for (const command of ['curl','tar','ffprobe']) execFileSync(command,[command==='ffprobe'?'-version':'--version'],{cwd:root,env,stdio:'ignore',timeout:20000});
run('npm_ci','npm',['ci','--no-audit','--no-fund','--cache',env.npm_config_cache],180000);
const archive = join(cache,'libcurl.tar.gz');
run('native_download','curl',['--location','--connect-timeout','20','--max-time','90','--fail','--silent','--show-error','--output',archive,'https://github.com/lexiforest/curl-impersonate/releases/download/v2.2.2/libcurl-impersonate-v2.2.2.x86_64-linux-gnu.tar.gz'],100000);
const expected = 'da09231c2809977266ddd00a0b60e638f8e67fc5dc97811065a185fa951a3275';
if (createHash('sha256').update(await readFile(archive)).digest('hex')!==expected) throw Error('Native archive checksum mismatch.');
execFileSync('tar',['--no-same-owner','-xzf',archive,'-C',native],{cwd:root,env,stdio:'inherit',timeout:20000});
const library = join(native,'libcurl-impersonate.so');
await readFile(library);
await writeFile(join(root,'native-path.txt'),library+'\n',{mode:0o600});
console.log(JSON.stringify({ok:true,runtime_version:'1.7.5',execution:'cloud',native_sha256:expected}));
