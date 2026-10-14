import { readFile, writeFile, mkdir, mkdtemp, readdir, realpath, lstat, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const base = 'https://www.instagram.com';
const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export class AcquisitionError extends Error {
  constructor(code, retryAt = null) { super(code); this.code = code; this.retryAt = retryAt; }
}
export function sourceIdentity(value) {
  let url;
  try { url = new URL(value); } catch { throw new AcquisitionError('INVALID_SOURCE'); }
  const match = /^\/(?:p|reel|reels)\/([A-Za-z0-9_-]{3,64})\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password || !match) throw new AcquisitionError('INVALID_SOURCE');
  const key = match[1];
  return { source_key:key, source_url:`${base}/reel/${key}/`, media_id:[...key].reduce((n,c)=>n*64n+BigInt(alphabet.indexOf(c)),0n).toString() };
}
export function mediaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new AcquisitionError('INVALID_MEDIA'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)) throw new AcquisitionError('INVALID_MEDIA');
  return url.href;
}
export function findProduct(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 32) return null;
  if (node.if_not_gated_logged_out && typeof node.if_not_gated_logged_out === 'object') return node.if_not_gated_logged_out;
  for (const value of Object.values(node)) { const found = findProduct(value, depth+1); if (found) return found; }
  return null;
}
export function inspectResponse(response) {
  const status = response.status;
  if (status === 429) {
    const header = response.headers?.get?.('retry-after') ?? response.headers?.['retry-after'];
    const seconds = /^\d+$/.test(String(header)) ? Number(header) : null;
    const date = seconds === null ? Date.parse(String(header)) : Date.now()+seconds*1000;
    throw new AcquisitionError('RATE_LIMITED', Number.isFinite(date) && date>Date.now() ? new Date(date).toISOString() : null);
  }
  if (status === 401) throw new AcquisitionError('LOGIN_REQUIRED');
  if (status === 403) throw new AcquisitionError('ACCESS_RESTRICTED');
  if (status !== 200) throw new AcquisitionError('SOURCE_UNAVAILABLE');
  const url = new URL(response.url);
  if (url.pathname.startsWith('/accounts/login')) throw new AcquisitionError('LOGIN_REQUIRED');
  if (/<title>\s*(Just a moment|Access Denied|Verify you are human)/i.test(response.text ?? '')) throw new AcquisitionError('ACCESS_RESTRICTED');
  return response;
}
export function pageCreator(source, html) {
  const decode=value=>value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,entity)=>entity[0]==='#'?String.fromCodePoint(Math.min(0x10ffff,parseInt(entity.slice(entity[1].toLowerCase()==='x'?2:1),entity[1].toLowerCase()==='x'?16:10))):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[entity.toLowerCase()]));
  const meta=new Map();
  for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
    const attrs=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1].toLowerCase(),decode(m[3])]));
    const name=attrs.property??attrs.name;
    if(name && attrs.content)meta.set(name,attrs.content);
  }
  let canonical;
  try{canonical=new URL(meta.get('og:url'));}catch{throw new AcquisitionError('SOURCE_IDENTITY_UNVERIFIED');}
  const match=/^\/([A-Za-z0-9._]{1,30})\/(?:reel|p)\/([A-Za-z0-9_-]+)\/?$/.exec(canonical.pathname);
  if(canonical.origin!==base || !match || match[2]!==source.source_key)throw new AcquisitionError('SOURCE_IDENTITY_UNVERIFIED');
  const title=meta.get('twitter:title')??'';
  const titleOwner=/\(@([A-Za-z0-9._]{1,30})\)/.exec(title)?.[1] ?? /^@([A-Za-z0-9._]{1,30})\s/.exec(title)?.[1];
  if(titleOwner?.toLowerCase()!==match[1].toLowerCase())throw new AcquisitionError('CREATOR_UNAVAILABLE');
  return match[1];
}
export async function metadataOnly(value, fetcher=fetch) {
  const source=sourceIdentity(value);
  const response=await fetcher(source.source_url,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  inspectResponse({status:response.status,url:source.source_url,headers:response.headers});
  if(!response.body)throw new AcquisitionError('SOURCE_UNAVAILABLE');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000)throw new AcquisitionError('METADATA_TOO_LARGE');chunks.push(value);}}
  finally{await reader.cancel();}
  const text=Buffer.concat(chunks).toString('utf8');
  inspectResponse({status:response.status,url:source.source_url,text});
  return {ok:true,source_key:source.source_key,source_url:source.source_url,creator:pageCreator(source,text),acquired_at:new Date().toISOString()};
}
export async function acquireProduct(value, session) {
  const source = sourceIdentity(value);
  const headers = {'X-IG-App-ID':'936619743392459','X-ASBD-ID':'359341','X-IG-WWW-Claim':'0',Origin:base,Accept:'*/*'};
  const home = inspectResponse(await session.get(base+'/'));
  let lsd = home.text.match(/\["LSD",\[\],\{"token":"([^"]+)"/)?.[1];
  const eq = home.text.match(/<script\b[^>]*\bid="__eqmc"[^>]*>([\s\S]*?)<\/script>/);
  if (eq) { try { lsd = JSON.parse(eq[1]).l || lsd; } catch {} }
  let product = null;
  if (lsd) {
    const ruling = inspectResponse(await session.get(base+'/api/v1/web/get_ruling_for_content/', {headers,params:{content_type:'MEDIA',target_id:source.media_id}}));
    const data = ruling.json();
    if (data.title || data.description) throw new AcquisitionError('ACCESS_RESTRICTED');
    const csrf = data.status==='ok' ? session.cookies.get('csrftoken') : null;
    const queryHeaders = {...headers,'X-FB-Friendly-Name':'PolarisLoggedOutDesktopWWWPostRootContentQuery','X-FB-LSD':lsd,'X-Requested-With':'XMLHttpRequest',Referer:source.source_url};
    if (csrf) queryHeaders['X-CSRFToken'] = csrf;
    const response = inspectResponse(await session.post(base+'/api/graphql',{headers:queryHeaders,data:{lsd,fb_api_caller_class:'RelayModern',fb_api_req_friendly_name:'PolarisLoggedOutDesktopWWWPostRootContentQuery',server_timestamps:'true',variables:JSON.stringify({media_id:source.media_id}),doc_id:'27130156389949648'}}));
    try { product = findProduct(response.json()); } catch {}
  }
  if (!product) {
    const page = inspectResponse(await session.get(source.source_url));
    if (new URL(page.url).pathname==='/') throw new AcquisitionError('SOURCE_UNAVAILABLE');
    for (const match of page.text.matchAll(/<script\b[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/g)) {
      try { product = findProduct(JSON.parse(match[1])); if (product) break; } catch {}
    }
  }
  if (!product) throw new AcquisitionError('SOURCE_UNAVAILABLE');
  const productId = String(product.pk ?? product.id ?? '').split('_')[0];
  if (product.code !== source.source_key && productId !== source.media_id) throw new AcquisitionError('SOURCE_IDENTITY_UNVERIFIED');
  const video = product.video_versions?.length ? product : product.carousel_media?.find(item=>item.video_versions?.length);
  if (!video) throw new AcquisitionError('VIDEO_UNAVAILABLE');
  return {source,product,video};
}
async function workRoot(runtime) {
  const work = join(await realpath(runtime), 'work');
  await mkdir(work, {recursive:true, mode:0o700});
  if ((await lstat(work)).isSymbolicLink() || await realpath(work) !== work) throw new AcquisitionError('INVALID_WORK_DIRECTORY');
  return work;
}
export async function createItemWorkspace(sourceKey, runtime = runtimeDirectory) {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(sourceKey)) throw new AcquisitionError('INVALID_SOURCE');
  const work = await workRoot(runtime);
  if ((await readdir(work)).length) throw new AcquisitionError('ITEM_CLEANUP_REQUIRED');
  return mkdtemp(join(work, sourceKey + '-'));
}
export async function cleanupItem(directory, runtime = runtimeDirectory) {
  if (typeof directory !== 'string' || !directory) throw new AcquisitionError('INVALID_WORK_DIRECTORY');
  const work = await workRoot(runtime);
  const target = resolve(directory);
  if (dirname(target) !== work || !/^[A-Za-z0-9_-]{3,64}-[A-Za-z0-9]{6}$/.test(basename(target))) throw new AcquisitionError('INVALID_WORK_DIRECTORY');
  const entry = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new AcquisitionError('INVALID_WORK_DIRECTORY');
  await rm(target, {recursive:true, force:true});
  return {ok:true, item_directory:target, removed:true};
}
async function download(session, url, path, limit) {
  const fs = await import('node:fs');
  const fd = fs.openSync(path,'wx'); let bytes = 0; const digest = createHash('sha256');
  try {
    const response = await session.get(mediaUrl(url),{headers:{Referer:base+'/'},maxRedirects:0,timeout:90,contentCallback:chunk=>{
      bytes += chunk.length;
      if (bytes>limit) throw new AcquisitionError('MEDIA_TOO_LARGE');
      digest.update(chunk); fs.writeSync(fd,chunk);
    }});
    inspectResponse(response);
    if (!bytes) throw new AcquisitionError('MEDIA_UNAVAILABLE');
    return {path,byte_count:bytes,sha256:digest.digest('hex'),mime_type:response.contentType?.split(';')[0]??null};
  } catch (error) { fs.closeSync(fd); fs.unlinkSync(path); throw error; }
  finally { try { fs.closeSync(fd); } catch {} }
}
export async function main(value) {
  if (process.platform!=='linux' || process.arch!=='x64') throw new AcquisitionError('CLOUD_RUNTIME_REQUIRED');
  const runtime = runtimeDirectory;
  const library = (await readFile(join(runtime,'native-path.txt'),'utf8')).trim();
  process.env.LIBCURL_PATH = library;
  const { Session, Curl } = await import('impers');
  const { curl_version } = await import('./node_modules/impers/dist/ffi/libcurl.js');
  if (!Curl.hasImpersonateSupport() || !(await readFile('/proc/self/maps','utf8')).includes(library)) throw new AcquisitionError('NATIVE_LIBRARY_UNAVAILABLE');
  const check = new Curl(); check.impersonate('chrome124'); check.cleanup();
  const source = sourceIdentity(value);
  const directory = await createItemWorkspace(source.source_key, runtime);
  let session;
  try {
    session = new Session({impersonate:'chrome124',timeout:60,connectTimeout:20,verify:true,caCert:process.env.CURL_CA_BUNDLE||process.env.SSL_CERT_FILE||'/etc/ssl/certs/ca-certificates.crt',maxRedirects:5});
    const { product, video } = await acquireProduct(value,session);
    const formats = [...video.video_versions].filter(item=>typeof item.url==='string').sort((a,b)=>(a.width*a.height)-(b.width*b.height));
    const chosen = formats.find(item=>item.width>=720)||formats[0];
    const media = await download(session,chosen.url,join(directory,'video.mp4'),100_000_000);
    const streams = JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',media.path],{encoding:'utf8',timeout:20000}));
    if (!streams.streams?.some(stream=>stream.codec_type==='video')) throw new AcquisitionError('VIDEO_UNAVAILABLE');
    const candidates = [...(video.image_versions2?.candidates??[])].sort((a,b)=>(b.width*b.height)-(a.width*a.height));
    const coverUrl = (candidates.find(item=>item.width<=640)||candidates.at(-1))?.url;
    const cover = coverUrl ? await download(session,coverUrl,join(directory,'cover'),1_048_576) : null;
    const caption = product.caption===null ? '' : typeof product.caption?.text==='string' ? product.caption.text : null;
    const result = {ok:true,runtime_version:'1.7.5',item_directory:directory,source_key:source.source_key,source_url:source.source_url,creator:product.user?.username??null,caption,acquired_at:new Date().toISOString(),video:media,cover,streams,native_version:curl_version()};
    await writeFile(join(directory,'source.json'),JSON.stringify(result,null,2),{mode:0o600});
    return result;
  } catch (error) {
    await cleanupItem(directory, runtime);
    throw error;
  } finally { await session?.close(); }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await (process.argv[2]==='--cleanup' ? cleanupItem(process.argv[3]) : process.argv[2]==='--metadata' ? metadataOnly(process.argv[3]) : main(process.argv[2])))); }
  catch (error) { console.log(JSON.stringify({ok:false,error:{code:error instanceof AcquisitionError?error.code:'ACQUISITION_FAILED',retry_at:error instanceof AcquisitionError?error.retryAt:null}})); process.exitCode=2; }
}
