const THREE=require('../dist/three.js');
const createEngine=require('../dist/engine.js');
const createRenderer=require('./rendering/renderer.js');
const createUI=require('./ui/canvas-ui.js');
const createAudio=require('./platform/audio.js');
const {SaveService}=require('./services/saves.js');
const {migratePayload}=require('./services/migrations.js');
const manifest=require('../dist/audio.js');

module.exports=async function start(platform,config){
  const LF=createEngine(platform,THREE),G=LF.game,saves=new SaveService(platform,config);
  let ready=false,hidden=false,working=false,loading=false,error='',quality=config.quality||'low',last=0,acc=0,saveTime=0,cloudTime=0,drsAvg=0,drsFrames=0;
  const gfx=LF.gfx=createRenderer(THREE,platform,quality,{antialias:config.antialias!==false});
  LF.audio=createAudio(platform,manifest,()=>G.P.vol);
  const defaults=JSON.parse(JSON.stringify(G.P));
  function capture(){
    if(!ready)return;
    G.P.lastSeen=platform.now();G.P.run=G.run;
    G.P.pendingCards=G.pending.length+(G.panel==='cards'?1:0);
    G.P.atWaylight=G.state==='choice'||G.state==='relight';
    saves.capture({schema_version:1,player:G.P});
  }
  function apply(payload){
    if(ready)LF.runtime.reset();
    for(const key of Object.keys(G.P))delete G.P[key];
    Object.assign(G.P,JSON.parse(JSON.stringify(defaults)),payload?JSON.parse(JSON.stringify(payload.player)):{});
    if(G.P.run)G.resume();else G.newRun();
    G.pending=Array(Math.min(500,G.P.pendingCards||0)).fill('card');
    G.state='title';G.panel=null;LF.ui.reset();LF.ui.pick=G.run.party.slice();LF.audio.setVol();acc=0;
  }
  const actions={
    ready:()=>ready,error:()=>error,busy:()=>working,quality:()=>quality,
    begin(fresh=false){
      if(!ready||saves.conflict)return;
      if(fresh){LF.runtime.reset();G.newRun();G.P.pendingCards=0;G.P.atWaylight=false;}
      G.state='walk';G.panel=null;LF.audio.start();
      if(G.P.atWaylight){G.state='choice';G.openChoice();}else if(G.pending.length)G.openPending();
      G.save();
    },
    restart(){LF.restartRun();G.P.pendingCards=0;G.P.atWaylight=false;},
    async retry(){await boot();},
    cycleQuality(){quality=quality==='low'?'medium':quality==='medium'?'high':'low';gfx.setQuality(quality);LF.runtime.resize();},
    async resolve(choice){
      working=true;try{const data=await saves.resolve(choice);apply(data);}finally{working=false;}
    },
    async importSave(){
      const text=await platform.readClipboard();
      if(text.length>256*1024)throw Error('存档体积超过限制');
      let payload;try{payload=migratePayload(JSON.parse(text));}catch(error){throw Error('无法导入：'+error.message);}
      const answer=await platform.modal({title:'导入存档',content:'导入将替换当前进度。原进度会先保留为本地备份，确认继续？'});
      if(!answer.confirm)return;
      platform.storage.set(saves.key()+'.before-import.'+platform.now(),saves.local.payload);
      saves.capture(payload);apply(payload);await saves.flush();
    },
    async showHistory(){G.save();const items=await saves.history();LF.ui.showHistory(items);},
    async restore(revision){
      const answer=await platform.modal({title:'恢复历史存档',content:'确认恢复版本 '+revision+'？当前进度会先备份。'});
      if(!answer.confirm)return;
      working=true;try{apply(await saves.restore(revision));}finally{working=false;}
    }
  };
  LF.ui=createUI(LF,platform,saves,actions);
  G.save=()=>{try{capture();}catch(e){error='本地保存失败：'+e.message;}};
  LF.runtime.init(gfx.renderer);
  LF.begin=actions.begin;
  async function boot(){
    if(loading)return;loading=true;error='';working=true;
    try{const data=await saves.open();apply(data);ready=true;LF.ui.showReward(saves.reward);}
    catch(e){ready=false;error=e.message||'登录失败';}
    finally{loading=false;working=false;}
  }
  async function reconnect(){
    if(!ready||working||!config.apiBase||saves.conflict)return;
    working=true;
    try{const data=await saves.refresh();if(data){apply(data);LF.ui.showReward(saves.reward);}}
    catch(e){if(!saves.conflict){saves.status='离线 · 已保存到本地';if(/账号已变化/.test(e.message))error=e.message;}}
    finally{working=false;last=0;}
  }
  platform.onTouchStart?.((x,y)=>{if(working||hidden)return;LF.ui.press(x,y);});
  platform.onTouch((x,y)=>{if(working||hidden)return;LF.ui.release();if(!LF.ui.tap(x,y)&&ready)LF.runtime.tap(x,y);});
  platform.onResize(()=>{gfx.resize();LF.runtime.resize();});
  platform.onHide(()=>{hidden=true;G.save();saves.flush().catch(()=>{});LF.audio.pause();});
  platform.onShow(()=>{hidden=false;last=0;LF.audio.resume();reconnect();});
  platform.onNetwork(()=>{G.save();reconnect();});
  platform.onContextRestored=()=>{G.save();ready=false;error='画面资源已重置，请退出后重新进入';platform.modal({title:'画面需要重新加载',content:error,showCancel:false});};
  function frame(now){
    platform.raf(frame);if(hidden)return;
    const dt=last?Math.min(.1,Math.max(0,(now-last)/1000)):1/60;last=now;
    if(gfx.lost)return;
    const paused=!ready||working||!!saves.conflict||G.state==='title'||!!G.panel||!G.run;
    // Dynamic resolution: hold the sharpest drawing buffer this device can actually
    // sustain. Only adapts during gameplay so the title screen never reallocates.
    if(config.adaptiveResolution!==false&&ready&&!paused){
      drsAvg=drsAvg?drsAvg*0.9+dt*0.1:dt;
      if(++drsFrames>=90){
        const target=gfx.targetScale(),current=gfx.scale;
        if(drsAvg>0.024&&current>0.75)gfx.resize(Math.max(0.7,current*0.88));
        else if(drsAvg<0.0135&&current<target-0.02)gfx.resize(Math.min(target,current*1.08));
        drsAvg=0;drsFrames=0;
      }
    }
    let gameDt=0;
    if(!paused){acc+=dt*G.P.speed;let steps=0;while(acc>=1/60&&steps++<16){G.step(1/60);acc-=1/60;gameDt+=1/60;if(G.panel||!G.run)break;}if(acc>4/60)acc=0;}
    LF.alpha=paused?1:Math.min(1,acc*60);
    const time=LF.runtime.update(dt,gameDt,paused);
    LF.fx.draw2d(paused?0:Math.max(gameDt,.0001));
    if(!working&&!saves.conflict)LF.ui.update(dt);LF.ui.draw();
    if(LF.world.cur&&LF.scene.fog){LF.scene.fog.color.copy(LF.world.cur.fog);LF.scene.fog.density=LF.world.cur.dens;}
    gfx.render(LF.scene,LF.cam,time);
    saveTime+=dt;cloudTime+=dt;
    if(ready&&!working&&saveTime>=15){saveTime=0;G.save();}
    if(ready&&!working&&!saves.conflict&&cloudTime>=20){cloudTime=0;saves.flush().catch(()=>{});}
  }
  platform.raf(frame);
  await boot();
  return {LF,saves,actions,platform};
};
