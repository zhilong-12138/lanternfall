const zh=require('./zh.js');
module.exports=function createUI(LF,platform,saves,actions){
  const G=LF.game,P=G.P,ctx=platform.overlay.getContext('2d');
  let buttons=[],page=0,tab='party',panel=null,countdown=null,toasts=[],selected=[],message=null;
  let width=0,height=0,safeLeft=0,safeRight=0,panelRect=null;
  // cardPick: the chosen card stays highlighted for a beat before it is taken,
  // so a tap reads as "selected" instead of the panel vanishing instantly.
  // fxQueue: delayed blessing bursts (rings, motes, glows) run off this frame clock.
  let cardPick=null,pressPoint=null;
  const fxQueue=[],COMMIT=0.42;
  const ui={pick:[],userTouched:false,closable:false,
    init(){},resize(){},refreshTop(){},dim(){},fall(){},hideTitle(){},portraitTargets:()=>[],
    isOpen:()=>!!panel||!!message||!!saves.conflict,
    toast(text){toasts.push({text,time:3});if(toasts.length>3)toasts.shift();},
    close(){if(panel?.type==='cards'||panel?.type==='choice'||panel?.type==='runend')return;panel=null;countdown=null;G.panel=null;},
    openMenu(value='party'){tab=value;page=0;selected=(G.run?.party||[]).slice();panel={type:'menu'};G.panel='menu';countdown=null;},
    openCards(offer,rec){panel={type:'cards',offer,rec};cardPick=null;countdown=P.steward?{time:6,fn:()=>chooseCard(rec)}:null;},
    openChoice(rec){panel={type:'choice',rec};countdown=P.steward?{time:7,fn:()=>chooseRoad(P.steward?rec:P.push)}:null;},
    openRunEnd(){panel={type:'runend'};countdown=P.steward?{time:8,fn:()=>{G.stewardBoons();restart();}}:null;},
    showReward(reward){if(reward?.seconds>=90&&(reward.silver||reward.xp))message={title:'离线收益',text:`离线 ${Math.floor(reward.seconds/60)} 分钟，获得银币 ${fmt(reward.silver)}，经验 ${fmt(reward.xp)}，提升 ${reward.levels} 级。`};},
    openAway(){},
    showHistory(items){page=0;panel={type:'history',items};G.panel='menu';},
    showError(error){message={title:'操作未完成',text:String(error.message||error)};},
    reset(){panel=null;message=null;countdown=null;page=0;cardPick=null;pressPoint=null;fxQueue.length=0;},
    press(x,y){pressPoint={x,y};},
    release(){pressPoint=null;},
    tap(x,y){
      ui.userTouched=true;pressPoint=null;LF.audio.start();
      if(cardPick)return true;
      if(panel)countdown=null;
      for(let i=buttons.length-1;i>=0;i--){const b=buttons[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){if(!b.disabled){countdown=null;Promise.resolve().then(b.fn).catch(ui.showError);}return true;}}
      return !!panel||!!message||!!saves.conflict||G.state==='title';
    },
    update(dt){
      for(const t of toasts)t.time-=dt;toasts=toasts.filter(t=>t.time>0);
      if(countdown){countdown.time-=dt;if(countdown.time<=0){const fn=countdown.fn;countdown=null;fn();}}
      if(cardPick){cardPick.t+=dt;if(cardPick.t>=COMMIT){const i=cardPick.i;cardPick=null;if(panel?.type==='cards')chooseCard(i);}}
      for(let i=fxQueue.length-1;i>=0;i--){const e=fxQueue[i];e.t-=dt;if(e.t<=0){fxQueue.splice(i,1);try{e.fn();}catch(_){}}}
    },
    draw(){
      width=platform.info.width;height=platform.info.height;safeLeft=platform.info.safe.left+12;safeRight=platform.info.safe.right+12;buttons=[];
      ctx.save();ctx.textBaseline='middle';ctx.textAlign='left';
      if(G.state==='title')drawTitle();else drawHUD();
      if(panel){buttons=[];drawPanel();}
      if(saves.conflict){buttons=[];drawConflict();}
      if(message){buttons=[];drawMessage();}
      if(actions.busy()){buttons=[];veil();text('正在同步进度…',width/2,height/2,18,'#edd9ad','center');}
      toasts.forEach((t,i)=>{rect(width/2-170,66+i*28,340,25,'#111a22e8');text(t.text,width/2,79+i*28,12,'#ead5a9','center');});
      if(height>width){veil();text('请横屏使用',width/2,height/2,24,'#ead5a9','center');}
      ctx.restore();
    }
  };
  function fmt(value){value=Math.floor(value||0);return value>1e6?(value/1e6).toFixed(1)+'M':value>10000?(value/1000).toFixed(1)+'k':String(value);}
  function rect(x,y,w,h,color,border){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);if(border){ctx.strokeStyle=border;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);}}
  function text(value,x,y,size=14,color='#dfd8c7',align='left'){ctx.fillStyle=color;ctx.font=`${size}px sans-serif`;ctx.textAlign=align;ctx.fillText(String(value),x,y);}
  function wrap(value,x,y,maxWidth,size=13,color='#b7b7ae',lines=3){
    ctx.font=`${size}px sans-serif`;let line='',lineNo=0;
    for(const char of String(value)){if(ctx.measureText(line+char).width>maxWidth&&line){text(line,x,y+lineNo*(size+6),size,color);lineNo++;line='';if(lineNo>=lines)return;}line+=char;}
    if(line)text(line,x,y+lineNo*(size+6),size,color);
  }
  function inside(point,x,y,w,h){return !!point&&point.x>=x&&point.x<=x+w&&point.y>=y&&point.y<=y+h;}
  function button(label,x,y,w,h,fn,disabled=false,active=false){
    const down=!disabled&&inside(pressPoint,x,y,w,h);
    rect(x,y,w,h,disabled?'#161b20':down?'#2c3742':active?'#46351b':'#19212aeF',disabled?'#333b42':down?'#d8b273':active?'#e0b46d':'#746248');
    text(label,x+w/2,y+h/2,13,disabled?'#636d75':down?'#fff2d2':active?'#ffe0a5':'#e7d9be','center');buttons.push({x,y,w,h,fn,disabled});
  }
  function veil(){rect(0,0,width,height,'#040912c9');}
  function header(title){
    veil();const w=Math.min(820,width-safeLeft-safeRight-24),h=height-44;
    panelRect={x:(width-w)/2,y:22,w,h};const r=panelRect;
    rect(r.x,r.y,r.w,r.h,'#0b131bf5','#796543');text(title,r.x+20,r.y+25,18,'#f2d39b');return r;
  }
  function drawTitle(){
    rect(0,0,width,height,'#040a1255');text('LANTERNFALL',width/2,height*.29,Math.min(42,width/16),'#f0d29b','center');
    text('携最后一盏灯，走过荒原',width/2,height*.29+42,15,'#c2b8a2','center');
    // Shader link failures silently drop every lit mesh, so surface them on the
    // title screen: a真机 screenshot then carries the driver log with it.
    if(LF.gfx&&LF.gfx.shaderError)text('渲染异常 '+LF.gfx.glVersion+'：'+LF.gfx.shaderError.slice(0,90),width/2,height*.29+68,11,'#ffb097','center');
    const y=Math.max(height*.56,145),ready=actions.ready();
    button(G.run?'继续远征':'点亮灯火',width/2-100,y,200,42,()=>{actions.begin();},!ready,true);
    if(G.run&&P.runs>0)button('开始新一局',width/2-100,y+52,200,36,async()=>{const r=await platform.modal({title:'开始新一局',content:'将结束当前远征，长期养成保留。确认开始？'});if(r.confirm)actions.begin(true);},!ready);
    text(actions.error()||saves.status,width/2,height-27,12,actions.error()?'#ffb097':'#9faeaa','center');
    if(actions.error())button('重试连接',width/2-65,height-85,130,36,actions.retry);
  }
  function drawHUD(){
    const run=G.run;rect(0,0,width,53,'#080f19e0');
    text(run?`第 ${run.stage} 关 · Lv.${run.level}`:'远征结束',safeLeft,19,14,'#efd9b3');
    text(run?`银币 ${fmt(run.silver)}   余烬 ${P.embers}   灯火 ${'◆'.repeat(run.flames)}`:`余烬 ${P.embers}`,safeLeft,39,12,'#b8beb4');
    const capsule=platform.info.capsule;const right=capsule&&capsule.top<60?Math.min(width-safeRight,capsule.left-8):width-safeRight;
    button('菜单',right-58,9,58,35,()=>ui.openMenu());
    button(P.speed+'×',right-116,9,50,35,()=>{P.speed=P.speed===1?2:P.speed===2?4:1;G.save();});
    button(P.steward?'自动':'手动',right-182,9,58,35,()=>{P.steward=!P.steward;G.save();},false,P.steward);
    const bottom=height-platform.info.safe.bottom-12,space=width-safeLeft-safeRight-112,gap=5,pw=(space-3*gap)/4;
    G.heroes.forEach((hero,i)=>{
      const x=safeLeft+i*(pw+gap),y=bottom-63;rect(x,y,pw,63,'#101923e8',hero.down?'#684233':'#4a514b');
      text(zh.name(hero.cls),x+8,y+14,12,hero.down?'#8e8c82':'#ebd4ac');
      text(hero.down?'倒地 '+Math.ceil(hero.downT)+'s':fmt(hero.hp)+' / '+fmt(hero.maxHp),x+8,y+32,11,'#adb8ac');
      rect(x+8,y+44,pw-16,5,'#292b30');rect(x+8,y+44,(pw-16)*Math.max(0,hero.hp/hero.maxHp),5,hero.down?'#514b46':'#a9583b');
    });
    button('照明弹 '+Math.round(G.flare*100)+'%',width-safeRight-103,bottom-63,103,63,()=>G.fireFlare(true),G.flare<1||!run,true);
    text(saves.status,safeLeft,height-platform.info.safe.bottom-85,10,saves.conflict?'#ffb87a':'#9daba8');
    if(G.bossRef&&G.bossRef.hp>0){const b=G.bossRef;rect(width*.28,60,width*.44,4,'#312a28');rect(width*.28,60,width*.44*b.hp/b.maxHp,4,'#c15c39');}
  }
  // Every class has its own blessing look: colour, ground mark and motes.
  const BLESSING={
    warden:{rgb:[1.7,1.25,.55],css:'#ffd99a',kind:'ward'},
    reaver:{rgb:[2.0,.42,.22],css:'#ff9a72',kind:'rage'},
    fletcher:{rgb:[.6,1.7,.8],css:'#9ce6b4',kind:'haste'},
    lamplighter:{rgb:[2.0,1.1,.35],css:'#ffc06a',kind:'ember'},
    apothecary:{rgb:[.45,1.7,.95],css:'#8ff0c2',kind:'heal'},
    rimebinder:{rgb:[.45,1.05,2.0],css:'#a8d8ff',kind:'frost'},
    party:{rgb:[1.9,1.6,.95],css:'#ffe6b0',kind:'party'}
  };
  function selectCard(i){
    if(cardPick)return;
    const card=panel?.offer[i];if(!card)return;
    countdown=null;cardPick={i,t:0};
  }
  function bless(card){
    const F=LF.fx;if(!F||LF.quiet||!card)return;
    const b=BLESSING[card.who]||BLESSING.party,label='「'+zh.card(card).name+'」';
    let list=(G.heroes||[]).filter(h=>!h.down&&(card.who==='party'||h.cls===card.who));
    if(!list.length)list=(G.heroes||[]).filter(h=>!h.down).slice(0,1);
    list.forEach((h,k)=>{
      const x=h.x,z=h.z,d=k*.07;
      fxQueue.push({t:d,fn:()=>{
        F.ring(x,z,.55,2.7,.9,b.rgb,.06);
        if(b.kind==='frost'){F.mark('frost',x,z,1.7,1.3);F.frost(x,1.0,z,14,.55);}
        else if(b.kind==='rage'){F.mark('fire',x,z,1.5,1.1);F.embers(x,.7,z,14,b.rgb,.5,2.6);}
        else if(b.kind==='heal')F.embers(x,.5,z,10,[.45,1.8,.95],.45,1.8);
        else if(b.kind==='haste')F.dust(x,.7,z,12,b.rgb,.55,2.4);
        else if(b.kind==='ward')F.sparks(x,1.0,z,12,b.rgb,3.2);
        else if(b.kind==='party')F.sparks(x,1.1,z,10,b.rgb,3.4);
        else F.embers(x,.8,z,12,b.rgb,.45,2.2);
        F.glow(x,1.5,z,1.4,b.rgb,.6);
        F.float(x,2.4,z,label,b.css,13,.9);
      }});
      fxQueue.push({t:d+.3,fn:()=>F.glow(x,1.5,z,1.0,b.rgb,.35)});
      fxQueue.push({t:d+.55,fn:()=>F.ring(x,z,1.9,2.5,.6,b.rgb,.06)});
    });
  }
  function chooseCard(index){
    const card=panel?.offer[index];if(!card)return;
    G.takeCard(card.id);cardPick=null;panel=null;G.panel=null;countdown=null;
    bless(card);G.save();if(G.pending.length)G.openPending();
  }
  function chooseRoad(push){panel=null;countdown=null;G.choose(push);}
  function restart(){panel=null;countdown=null;G.panel=null;actions.restart();}
  function drawPanel(){
    const kind=panel.type;
    if(kind==='menu'){drawMenu();return;}
    if(kind==='history'){const r=header('历史存档 · 最近十个版本');button('返回',r.x+r.w-74,r.y+9,58,32,()=>ui.openMenu('save'));rows(panel.items.map(item=>({title:'版本 '+item.revision+' · 第 '+item.stage+' 关 · Lv.'+item.level,desc:new Date(item.created_at*1000).toLocaleString(),label:'恢复',fn:()=>actions.restore(item.revision),disabled:item.revision===saves.local.revision})),r.x+20,r.y+60,r.w-40,r.h-85);return;}
    const r=header(kind==='cards'?'升级 · 选择一张卡牌':kind==='choice'?'路灯重新点亮':'灯火熄灭 · 本局结算');
    if(kind==='cards'){
      const gap=10,cw=(r.w-40-2*gap)/3,y=r.y+58,ch=r.h-105;
      const pick=cardPick&&panel.offer[cardPick.i]?cardPick.i:-1,progress=cardPick?Math.min(1,cardPick.t/COMMIT):0;
      panel.offer.forEach((card,i)=>{
        const z=zh.card(card),x=r.x+20+i*(cw+gap),chosen=pick===i,down=!cardPick&&inside(pressPoint,x,y,cw,ch),dim=pick>=0&&!chosen;
        // chosen card: warm fill, double gold frame, a progress bar and a 已选定 tag
        rect(x,y,cw,ch,chosen?'#242c2f':down?'#22303a':'#172029',chosen?'#ffd27a':i===panel.rec?'#c99e58':down?'#e8c789':'#4d5659');
        if(chosen){ctx.strokeStyle='#ffe6b0';ctx.lineWidth=2;ctx.strokeRect(x+2.5,y+2.5,cw-5,ch-5);}
        else if(down){ctx.strokeStyle='#e8c789';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,cw-2,ch-2);}
        text(card.who==='party'?'全队':zh.name(card.who),x+12,y+20,13,chosen?'#ffd9a2':dim?'#8d8b80':'#d3b581');
        if(chosen)text('已选定',x+cw-12,y+20,12,'#ffe0a5','right');
        wrap(z.name,x+12,y+48,cw-24,15,chosen?'#ffeecb':dim?'#8d8b80':'#f1d8a5',2);
        wrap(z.d,x+12,y+91,cw-24,12,chosen?'#ded7c6':dim?'#767d7a':'#bfc7c0',Math.max(1,Math.min(3,Math.floor((ch-129)/18))));
        if(chosen)rect(x+10,y+ch-8,(cw-20)*progress,3,'#ffd27a');
        button('选择 · '+((G.run.cards[card.id]||0)+1)+'/3',x+10,y+ch-46,cw-20,36,()=>selectCard(i),chosen);
        buttons.push({x,y,w:cw,h:ch,fn:()=>selectCard(i)});
      });
    }else if(kind==='choice'){
      wrap(`已通过第 ${G.run.stage} 关。前路危险：${G.danger(true)}。继续前进可获得更高奖励；原地驻守收益为 80%。`,r.x+24,r.y+70,r.w-48,14,'#bfc7c0',3);
      button('继续前进',r.x+24,r.y+r.h-101,(r.w-60)/2,46,()=>chooseRoad(true),false,panel.rec);
      button('原地驻守',r.x+36+(r.w-60)/2,r.y+r.h-101,(r.w-60)/2,46,()=>chooseRoad(false),false,!panel.rec);
    }else {
      const last=G.last;wrap(`最远关卡 ${last?.stage||P.best.stage} · 本局等级 ${last?.level||P.best.level} · 获得余烬 ${last?.embers||0}。可在菜单的祝福页花费余烬，提升下次远征。`,r.x+24,r.y+75,r.w-48,15,'#d3c5a8',3);
      button('用余烬购买祝福',r.x+24,r.y+r.h-112,(r.w-60)/2,42,()=>ui.openMenu('boons'));
      button('再次点亮灯火',r.x+36+(r.w-60)/2,r.y+r.h-112,(r.w-60)/2,42,restart,false,true);
    }
    if(countdown)text(`自动选择倒计时 ${Math.ceil(countdown.time)} 秒 · 点击后取消`,r.x+22,r.y+r.h-22,12,'#a4aca7');
  }
  function drawMenu(){
    const tabs=[['party','阵容'],['gear','装备'],['camp','营地'],['boons','祝福'],['sound','声音'],['save','存档']];
    const r=header('远征菜单');button('关闭',r.x+r.w-74,r.y+9,58,32,()=>{panel=null;G.panel=null;if(!G.run){panel={type:'runend'};G.panel='runend';}});
    const tw=(r.w-40-5*5)/6;tabs.forEach(([key,label],i)=>button(label,r.x+20+i*(tw+5),r.y+48,tw,32,()=>{tab=key;page=0;},false,key===tab));
    const x=r.x+20,y=r.y+96,w=r.w-40,h=r.h-150;
    if(tab==='party'){
      const items=Object.keys(LF.data.CL).map(hero=>({title:zh.name(hero)+' · '+zh.role(hero),desc:zh.blurb(hero),
        label:P.unlocked[hero]?(selected.includes(hero)?'已上阵':'选择'):'未解锁',disabled:!P.unlocked[hero],active:selected.includes(hero),
        fn:()=>{if(selected.includes(hero))selected=selected.filter(h=>h!==hero);else if(selected.length<4)selected.push(hero);}}));
      rows(items,x,y,w,h-38);
      button('应用阵容 '+selected.length+'/4',x,y+h-30,w,32,()=>{G.run.party=Object.keys(LF.data.CL).filter(h=>selected.includes(h));P.lastParty=G.run.party.slice();panel=null;G.panel=null;LF.reparty();},selected.length!==4||!G.run);
    }else if(tab==='gear'){
      const items=G.run?G.run.party.map(hero=>{const gear=G.run.gear[hero]||{};return {title:zh.name(hero),desc:['weapon','armour','trinket'].map(slot=>gear[slot]?zh.item(gear[slot].name)+' +'+gear[slot].pow+'%':'空槽').join(' / ')};}):[];
      rows(items,x,y,w,h);
    }else if(tab==='camp'){
      rows(LF.data.CAMP.map(item=>{const z=zh.camp(item);return {title:z.name+' · '+(G.run?.camp[item.id]||0),desc:z.d+'，每级 +'+item.per+item.unit,label:G.run?fmt(G.campCost(item.id))+' 银币':'无远征',disabled:!G.run||G.run.silver<G.campCost(item.id),fn:()=>{if(G.buyCamp(item.id))G.save();}};}),x,y,w,h);
    }else if(tab==='boons'){
      rows(LF.data.BOONS.map(item=>{const z=zh.boon(item),rank=G.boon(item.id),done=rank>=item.max||item.unlock&&P.unlocked[item.id],cost=G.boonCost(item.id);return {title:z.name+' '+rank+'/'+item.max,desc:z.d,label:done?'已完成':cost+' 余烬',disabled:done||P.embers<cost,fn:()=>{if(G.buyBoon(item.id))G.save();}};}),x,y,w,h);
    }else if(tab==='sound'){
      rows([
        {title:'声音',desc:LF.audio.error||'音乐和环境声按需加载',label:P.vol.mute?'开启':'静音',fn:()=>{P.vol.mute=!P.vol.mute;LF.audio.setVol();LF.audio.start();G.save();}},
        {title:'音乐音量',desc:Math.round(P.vol.music*100)+'%',label:'调整',fn:()=>{P.vol.music=P.vol.music>=.99?0:Math.min(1,P.vol.music+.2);LF.audio.setVol();G.save();}},
        {title:'音效音量',desc:Math.round(P.vol.sfx*100)+'%',label:'调整',fn:()=>{P.vol.sfx=P.vol.sfx>=.99?0:Math.min(1,P.vol.sfx+.2);LF.audio.setVol();G.save();}},
        {title:'画质',desc:actions.quality(),label:'切换',fn:actions.cycleQuality}
      ],x,y,w,h);
    }else {
      rows([
        {title:'云存档',desc:saves.status,label:'立即同步',disabled:!saves.config.apiBase,fn:async()=>{G.save();await saves.flush();}},
        {title:'导出本地备份',desc:'复制存档到剪贴板，继续时重建当前关卡',label:'复制',fn:()=>{G.save();platform.clipboard(JSON.stringify(saves.local.payload));}},
        {title:'导入备份',desc:'支持本小游戏备份和原网页版本的 JSON 存档',label:'导入',fn:actions.importSave},
        {title:'云端历史存档',desc:'保留最近十个版本，可选择恢复',label:'查看',disabled:!saves.config.apiBase,fn:actions.showHistory},
        {title:'结束本局',desc:'领取余烬，保留长期养成',label:'结束远征',disabled:!G.run,fn:async()=>{const answer=await platform.modal({title:'结束远征',content:'确认结束本局并领取余烬？'});if(answer.confirm){panel=null;G.panel=null;G.endRun();}}}
      ],x,y,w,h);
    }
    text(`余烬 ${P.embers}   银币 ${fmt(G.run?.silver)}`,r.x+22,r.y+r.h-19,12,'#abbaa9');
  }
  function rows(items,x,y,w,h){
    const count=Math.max(1,Math.floor((h-27)/55)),pages=Math.max(1,Math.ceil(items.length/count));page=Math.min(page,pages-1);
    items.slice(page*count,(page+1)*count).forEach((item,i)=>{const ry=y+i*55;rect(x,ry,w,49,'#14202a',item.active?'#be985a':null);text(item.title,x+10,ry+14,12,'#e7d4ae');wrap(item.desc,x+10,ry+34,w-(item.fn?130:24),11,'#a4b5b0',1);if(item.fn)button(item.label,x+w-105,ry+7,96,34,item.fn,item.disabled,item.active);});
    if(pages>1){button('上一页',x,y+h-25,75,26,()=>page--,page===0);text((page+1)+' / '+pages,x+w/2,y+h-11,12,'#aab6ae','center');button('下一页',x+w-75,y+h-25,75,26,()=>page++,page>=pages-1);}
  }
  function drawConflict(){
    const r=header('发现另一份存档');const local=saves.local.payload?.player.run,remote=saves.conflict.payload?.player.run;
    wrap(`本地：第 ${local?.stage||0} 关，等级 ${local?.level||0}。云端：第 ${remote?.stage||0} 关，等级 ${remote?.level||0}。请选择继续的进度。选择前会备份双方数据。`,r.x+24,r.y+75,r.w-48,15,'#c9c6b6',4);
    button('使用云端进度',r.x+24,r.y+r.h-72,(r.w-60)/2,44,()=>actions.resolve('cloud'),false,true);
    button('保留本地进度',r.x+36+(r.w-60)/2,r.y+r.h-72,(r.w-60)/2,44,()=>actions.resolve('local'));
  }
  function drawMessage(){const r=header(message.title);wrap(message.text,r.x+24,r.y+76,r.w-48,15,'#c9c6b6',6);button('知道了',r.x+r.w/2-70,r.y+r.h-65,140,40,()=>{message=null;});}
  return ui;
};
