import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceIdentity,mediaUrl,acquireProduct,inspectResponse} from '../runtime/acquire.mjs';

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
