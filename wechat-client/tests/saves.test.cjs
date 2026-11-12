const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SaveService}=require('../src/services/saves.js');
const {payload,makeGame}=require('./fixture.cjs');
const {migratePayload}=require('../src/services/migrations.js');
const {validatePayload}=require('../src/services/saves.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(){
  const store=new Map();let revision=0,remote=null,ids=0,user='A',failAfterWrite=false;
  const operations=new Map();
  const platform={storage:{get:key=>store.get(key)||null,set:(key,value)=>store.set(key,clone(value))},now:()=>1000000,randomId:()=>('operation'+ ++ids).padEnd(20,'0'),login:async()=>user,
    request:async({url,method='GET',data})=>{
      if(url.endsWith('auth/wechat'))return {token:'token-'+user,user_id:user};
      if(method==='GET')return {revision,payload:clone(remote),updated_at:100,server_time:100};
      if(operations.has(data.request_id))return clone(operations.get(data.request_id));
      if(data.revision!==revision)throw Object.assign(Error('conflict'),{status:409,data:{detail:{code:'save_conflict',save:{revision,payload:clone(remote)}}}});
      revision++;if(data.payload)remote=clone(data.payload);
      const result={revision,payload:clone(remote),updated_at:100,server_time:100};operations.set(data.request_id,result);
      if(failAfterWrite){failAfterWrite=false;throw Error('response lost');}return result;
    }};
  return {platform,store,newService:()=>new SaveService(platform,{apiBase:'https://example.test',requestTimeout:100}),state:()=>({revision,remote}),advance(value){remote=clone(value);revision++;},fail(){failAfterWrite=true;},user(value){user=value;}};
}
test('real gameplay core simulates and resumes a checkpoint without browser globals',()=>{
  const game=makeGame();const summary=game.game.sim(180,{alwaysPush:true});
  assert(summary.t>=180);assert(summary.level>=1);assert(summary.stage>=1);
  game.game.P.run=game.game.run;const stage=game.game.run.stage;game.game.resume();assert.equal(game.game.run.stage,stage);assert.equal(game.game.heroes.length,4);
});
test('a lost response retries the same operation across app restart',async()=>{
  const env=setup();const service=env.newService();await service.open();service.capture(payload());env.fail();
  await assert.rejects(service.flush());assert(service.local.pending);assert.equal(env.state().revision,1);
  const next=env.newService();await next.open();assert.equal(env.state().revision,2); // revision 1 replayed, revision 2 is the offline claim
  assert.equal(next.local.dirty,false);assert.equal(next.local.pending,null);
});
test('a newer device cannot be silently overwritten, explicit cloud choice restores it',async()=>{
  const env=setup();const service=env.newService();await service.open();service.capture(payload());await service.flush();
  service.local.payload.player.embers=5;service.capture(service.local.payload);
  const newer=payload();newer.player.embers=20;env.advance(newer);
  await assert.rejects(service.flush());assert(service.conflict);assert.equal(env.state().remote.player.embers,20);
  const chosen=await service.resolve('cloud');assert.equal(chosen.player.embers,20);assert([...env.store.keys()].some(key=>key.includes('.conflict.')));
});
test('explicit local conflict choice writes with the latest cloud revision',async()=>{
  const env=setup();const service=env.newService();await service.open();const own=payload();own.player.embers=7;service.capture(own);env.advance(payload());
  await assert.rejects(service.flush());await service.resolve('local');assert.equal(env.state().remote.player.embers,7);assert.equal(service.conflict,null);
});
test('re-authentication refuses to upload an old account save to a different account',async()=>{
  const env=setup();const service=env.newService();await service.open();service.capture(payload());await service.flush();env.user('B');
  await assert.rejects(service.refresh(),/账号已变化/);assert.equal(service.token,null);
});
test('local-only mode stores and reloads progress without a network request',async()=>{
  const env=setup();env.platform.request=()=>{throw Error('network not expected');};
  const a=new SaveService(env.platform,{apiBase:''});await a.open();const p=payload();p.player.embers=9;a.capture(p);
  const b=new SaveService(env.platform,{apiBase:''});assert.equal((await b.open()).player.embers,9);
});
test('legacy browser saves migrate, invalid imports fail before replacing progress',()=>{
  const old=payload().player;delete old.pendingCards;delete old.atWaylight;
  assert.equal(migratePayload(old).schema_version,1);
  assert.throws(()=>migratePayload({schema_version:2,player:old}));
  const bad=payload();bad.player.run.silver=-1;assert.throws(()=>validatePayload(bad));
  const invalid=payload();invalid.player.admin=true;assert.throws(()=>validatePayload(invalid));
  const card=payload();card.player.run.cards.p_hp=4;assert.throws(()=>validatePayload(card));
});
test('progress captured during a slow upload stays dirty for the next upload',async()=>{
  const env=setup();const a=env.newService();await a.open();a.capture(payload());
  const original=env.platform.request;let unblock;env.platform.request=async args=>{if(args.method==='PUT'){await new Promise(resolve=>unblock=resolve);}return original(args);};
  const pending=a.flush();await new Promise(resolve=>setImmediate(resolve));const p=payload();p.player.embers=4;a.capture(p);unblock();await pending;
  assert(a.local.dirty);assert.equal(a.local.payload.player.embers,4);assert.equal(env.state().remote.player.embers,0);
  env.platform.request=original;await a.flush();assert.equal(env.state().remote.player.embers,4);
});
