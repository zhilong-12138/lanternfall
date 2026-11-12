const {test}=require('node:test');
const assert=require('node:assert/strict');
const createUI=require('../src/ui/canvas-ui.js');
const {makeGame}=require('./fixture.cjs');
function setup(width=844,height=390){
  const LF=makeGame();LF.audio={start(){},setVol(){}};
  const labels=[];const context=new Proxy({measureText:text=>({width:String(text).length*7}),fillText:text=>labels.push(String(text))},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
  const platform={overlay:{getContext:()=>context},info:{width,height,safe:{left:0,right:0,top:0,bottom:0},capsule:null}};
  const saves={status:'云存档已同步',config:{apiBase:'https://example.test'},local:{revision:1},conflict:null};
  const actions={busy:()=>false,ready:()=>true,error:()=>'',quality:()=>'low'};
  const ui=createUI(LF,platform,saves,actions);LF.ui=ui;LF.game.state='walk';return {LF,ui,labels};
}
test('a card modal blocks underlying HUD actions without losing the pending card',async()=>{
  const {LF,ui}=setup();LF.game.panel='cards';ui.openCards(LF.game.offerCards(),0);ui.draw();
  ui.tap(810,20);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(LF.game.panel,'cards');assert(ui.isOpen());
});
test('small landscape screens can page through save actions',async()=>{
  const {ui,labels}=setup(640,320);ui.openMenu('save');ui.draw();assert(labels.includes('云存档'));
  labels.length=0;ui.tap(558,232);await new Promise(resolve=>setImmediate(resolve));ui.draw();
  assert(labels.includes('导出本地备份'));assert(labels.includes('复制'));
});
test('card offer prints Chinese copy rather than the shared English data',async()=>{
  const {LF,ui,labels}=setup();const offer=LF.data.CARDS.filter(c=>['l_kindle','p_haste'].includes(c.id));
  LF.game.panel='cards';ui.openCards(offer,0);ui.draw();
  assert(labels.includes('暖炉'));assert(labels.includes('急行军'));
  assert(!labels.some(label=>/WARM HEARTH|QUICK MARCH|mends|attack speed/i.test(label)));
});
test('camp, boons and gear names are localized',async()=>{
  const {LF,ui,labels}=setup();
  ui.openMenu('camp');ui.draw();assert(labels.some(l=>l.startsWith('灯油')));assert(!labels.some(l=>/LAMP OIL/.test(l)));
  labels.length=0;ui.openMenu('boons');ui.draw();assert(labels.some(l=>l.startsWith('愤怒余烬')));assert(!labels.some(l=>/EMBER OF WRATH/.test(l)));
  labels.length=0;LF.game.run.gear.warden={weapon:{name:'Wickfall, Arming Sword',pow:12}};ui.openMenu('gear');ui.draw();
  assert(labels.some(l=>l.includes('灯芯坠，武装剑 +12%')));
});
test('tapping a card body highlights it, then commits after the beat',async()=>{
  const {LF,ui}=setup();LF.game.panel='cards';
  const offer=LF.game.offerCards();ui.openCards(offer,0);ui.draw();
  const count=()=>Object.values(LF.game.run.cards).reduce((a,b)=>a+b,0);
  const before=count(),picked=offer[0].id;
  ui.press(100,150);ui.draw();assert.equal(LF.game.panel,'cards','press alone must not commit');
  ui.tap(100,150);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(LF.game.panel,'cards','the card stays on screen for the highlight beat');
  ui.draw();ui.update(0.2);assert.equal(LF.game.panel,'cards');
  ui.update(0.3);
  assert.equal(LF.game.panel,null,'the card commits once the beat elapses');
  assert.equal(count(),before+1);
  assert.equal(LF.game.run.cards[picked],1);
});
