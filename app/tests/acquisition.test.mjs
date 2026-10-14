import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceIdentity,mediaUrl,acquireProduct,inspectResponse,createItemWorkspace,cleanupItem,pageCreator,metadataOnly} from '../runtime/acquire.mjs';
import {mkdir,mkdtemp,writeFile,readFile,readdir,rm,symlink,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';

test('metadata-only acquisition verifies owner and source without media or browser requests',async()=>{
  const url='https://www.instagram.com/reel/AbC123/';
  const html='<meta content="https://www.instagram.com/verified.author/reel/AbC123/" property="og:url"><meta name="twitter:title" content="Name (&#064;verified.author) &#x2022; Instagram reel">';
  let calls=0;
  const result=await metadataOnly(url,async actual=>{calls++;assert.equal(actual,url);return new Response(html);});
  assert.equal(calls,1);assert.equal(result.creator,'verified.author');assert.equal(result.source_key,'AbC123');
  assert.equal(result.video,undefined);assert.equal(result.item_directory,undefined);
  const source=sourceIdentity(url);
  assert.equal(pageCreator(source,html.replace('Name (&#064;verified.author)','&#064;verified.author')),'verified.author');
  assert.throws(()=>pageCreator(source,html.replace('/AbC123/','/Other/')),{code:'SOURCE_IDENTITY_UNVERIFIED'});
  assert.throws(()=>pageCreator(source,html.replace('www.instagram.com','example.test')),{code:'SOURCE_IDENTITY_UNVERIFIED'});
  assert.throws(()=>pageCreator(source,html.replace('&#064;verified.author','&#064;mentioned.author')),{code:'CREATOR_UNAVAILABLE'});
  assert.throws(()=>pageCreator(source,'<meta property="og:description" content="Thanks @mentioned.author">'),{code:'SOURCE_IDENTITY_UNVERIFIED'});
  await assert.rejects(()=>metadataOnly(url,async()=>new Response('',{status:429,headers:{'retry-after':'60'}})),{code:'RATE_LIMITED'});
  await assert.rejects(()=>metadataOnly(url,async()=>new Response('',{status:403})),{code:'ACCESS_RESTRICTED'});
  await assert.rejects(()=>metadataOnly(url,async()=>new Response('x'.repeat(2_000_001))),{code:'METADATA_TOO_LARGE'});
});

async function fixture(t) {
  const cache = resolve('.cache');
  await mkdir(cache, {recursive:true});
  const root = await mkdtemp(join(cache, 'item-cleanup-'));
  t.after(async () => {
    assert.equal(dirname(root), cache);
    await rm(root, {recursive:true, force:true});
  });
  return realpath(root);
}

test('sequential items require cleanup and preserve shared runtime files', async t => {
  const root = await fixture(t);
  await mkdir(join(root, '.asr-probe'));
  await writeFile(join(root, '.asr-probe', 'model.fixture'), 'shared model fixture');
  for (const key of ['AbC123', 'XyZ987']) {
    const item = await createItemWorkspace(key, root);
    await mkdir(join(item, 'frames'));
    for (const name of ['video.mp4', 'cover', 'source.json', 'frames/frame.fixture']) {
      await writeFile(join(item, name), 'synthetic bytes, no media processing');
    }
    await assert.rejects(() => createItemWorkspace('Next123', root), {code:'ITEM_CLEANUP_REQUIRED'});
    assert.equal((await cleanupItem(item, root)).removed, true);
    assert.equal((await cleanupItem(item, root)).removed, true);
    assert.deepEqual(await readdir(join(root, 'work')), []);
    assert.equal(await readFile(join(root, '.asr-probe', 'model.fixture'), 'utf8'), 'shared model fixture');
  }
});

test('cleanup rejects parent, shared, unrelated, and symlink targets', async t => {
  const root = await fixture(t);
  const outside = join(root, 'unrelated');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.fixture'), 'keep');
  const item = await createItemWorkspace('AbC123', root);
  for (const path of [root, join(root,'work'), outside, join(item,'frames'), '', undefined]) {
    await assert.rejects(() => cleanupItem(path, root), {code:'INVALID_WORK_DIRECTORY'});
  }
  const linked = join(root, 'work', 'Link123-abcdef');
  await symlink(outside, linked, 'junction');
  await assert.rejects(() => cleanupItem(linked, root), {code:'INVALID_WORK_DIRECTORY'});
  await symlink(outside, join(item, 'nested-link'), 'junction');
  await cleanupItem(item, root);
  assert.equal(await readFile(join(outside, 'keep.fixture'), 'utf8'), 'keep');
});

test('a linked work directory cannot redirect acquisition or cleanup', async t => {
  const root = await fixture(t);
  const outside = join(root, 'unrelated');
  await mkdir(outside);
  await symlink(outside, join(root, 'work'), 'junction');
  await assert.rejects(() => createItemWorkspace('AbC123', root), {code:'INVALID_WORK_DIRECTORY'});
  await assert.rejects(() => cleanupItem(join(root, 'work', 'AbC123-abcdef'), root), {code:'INVALID_WORK_DIRECTORY'});
  assert.deepEqual(await readdir(outside), []);
});

test('source parsing normalizes Instagram links and rejects non-source URLs',()=>{
  const expected=sourceIdentity('https://www.instagram.com/reel/AbC123/');
  assert.deepEqual(sourceIdentity('https://instagram.com/p/AbC123/?utm_source=fixture'),expected);
  assert.notEqual(sourceIdentity('https://instagram.com/reel/XyZ987/').media_id,expected.media_id);
  for(const value of ['http://instagram.com/p/AbC123/','https://instagram.com.evil.test/p/AbC123/','https://u:p@instagram.com/p/AbC123/','https://instagram.com/accounts/login/','https://instagram.com:444/p/AbC123/'])assert.throws(()=>sourceIdentity(value));
});
test('media URLs stay within the Instagram CDN hosts',()=>{
  assert.equal(mediaUrl('https://scontent.cdninstagram.com/video.mp4?fixture=1'),'https://scontent.cdninstagram.com/video.mp4?fixture=1');
  for(const value of ['https://127.0.0.1/file','https://evil.test/file','http://scontent.fbcdn.net/file','https://fbcdn.net.evil.test/file'])assert.throws(()=>mediaUrl(value));
});
test('access stops and retry dates are not bypassed',()=>{
  for(const [status,code] of [[401,'LOGIN_REQUIRED'],[403,'ACCESS_RESTRICTED'],[404,'SOURCE_UNAVAILABLE']])assert.throws(()=>inspectResponse({status,url:'https://www.instagram.com/'}),error=>error.code===code);
  assert.throws(()=>inspectResponse({status:429,url:'https://www.instagram.com/',headers:{'retry-after':'120'}}),error=>error.code==='RATE_LIMITED'&&Date.parse(error.retryAt)>Date.now());
  assert.throws(()=>inspectResponse({status:200,url:'https://www.instagram.com/accounts/login/',text:''}),error=>error.code==='LOGIN_REQUIRED');
});
test('the archived GraphQL route supports different source keys and actual caption data',async()=>{
  for(const key of ['AbC123','XyZ987']){
    const source=sourceIdentity(`https://www.instagram.com/p/${key}/`);let variables;
    const product={code:key,caption:{text:'A fixture caption'},user:{username:'fixture'},video_versions:[{url:'https://scontent.cdninstagram.com/fixture.mp4',width:720,height:1280}]};
    const response=(data,text='')=>({status:200,url:'https://www.instagram.com/',text,json:()=>data});
    const session={cookies:{get:()=>null},get:async url=>url.endsWith('/get_ruling_for_content/')?response({status:'ok'}):response({},'["LSD",[],{"token":"fixture"}'),post:async(url,args)=>{variables=JSON.parse(args.data.variables);return response({data:{if_not_gated_logged_out:product}});}};
    const actual=await acquireProduct(source.source_url,session);
    assert.equal(variables.media_id,source.media_id);assert.equal(actual.product.caption.text,'A fixture caption');assert.equal(actual.source.source_key,key);
  }
});
test('a returned product cannot silently replace the requested source',async()=>{
  const session={get:async()=>({status:200,url:'https://www.instagram.com/reel/AbC123/',text:'<script data-sjs>{"if_not_gated_logged_out":{"code":"Other","video_versions":[{}]}}</script>'})};
  await assert.rejects(()=>acquireProduct('https://www.instagram.com/reel/AbC123/',session),error=>error.code==='SOURCE_IDENTITY_UNVERIFIED');
});
