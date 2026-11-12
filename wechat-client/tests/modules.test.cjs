const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {payload}=require('./fixture.cjs');

// Model the resolver in the reported MiniGame stack: JSON is not a JS module.
// Node's native require and our old browser bundler accepted JSON and hid this bug.
function minigameRequire(){
  const root=path.resolve(__dirname,'..'),cache=new Map();
  function load(specifier,parent=path.join(root,'game.js')){
    let filename=path.resolve(path.dirname(parent),specifier);
    if(!filename.endsWith('.js'))filename+='.js';
    if(!fs.existsSync(filename))throw Error(`module '${path.relative(root,filename).split(path.sep).join('/')}' is not defined, require args is '${specifier}'`);
    if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const factory=vm.runInThisContext('(function(module,exports,require){\n'+fs.readFileSync(filename,'utf8')+'\n})',{filename});
    factory(module,module.exports,child=>load(child,filename));
    return module.exports;
  }
  return load;
}

test('save validation loads with the MiniGame JS-only module resolver',()=>{
  const load=minigameRequire();
  const validate=load('./src/services/validate-schema.js');
  assert.deepEqual(load('./dist/save-schema.js'),JSON.parse(fs.readFileSync(path.resolve(__dirname,'../src/services/save-schema.json'),'utf8')));
  assert.doesNotThrow(()=>validate(payload()));
  const invalid=payload();invalid.player.run.silver=-1;
  assert.throws(()=>validate(invalid),/save\.player\.run/);
});

test('game bootstrap and card validation load all runtime data as JS modules',()=>{
  const load=minigameRequire();
  assert.equal(typeof load('./src/main.js'),'function');
  const audio=load('./dist/audio.js');
  assert(audio.music.length>0);
  for(const file of audio.music)assert(fs.existsSync(path.resolve(__dirname,'..',file)));
  const {validatePayload}=load('./src/services/saves.js');
  assert.doesNotThrow(()=>validatePayload(payload()));
  const invalid=payload();invalid.player.run.cards.p_dmg=4;
  assert.throws(()=>validatePayload(invalid),/卡牌等级无效/);
});
