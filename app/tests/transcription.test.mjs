import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('transcription validation and diagnostics pass without media, models, or network access',()=>{
  const result=spawnSync(process.env.SHOUBOX_TEST_PYTHON||'python',[fileURLToPath(new URL('./transcription.test.py',import.meta.url))],{
    encoding:'utf8',timeout:30000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}
  });
  assert.equal(result.status,0,result.stderr||result.error?.message);
});
