const clone = value => JSON.parse(JSON.stringify(value));
const validateSchema=require('./validate-schema.js');
function validatePayload(payload) {
  validateSchema(payload);
  if(!payload||payload.schema_version!==1||!payload.player)throw Error('不支持的存档版本');
  const p=payload.player;
  if(!p.best||!p.rate||!p.vol||!p.unlocked||!p.boons||![1,2,4].includes(p.speed))throw Error('存档数据不完整');
  const heroes=['warden','reaver','fletcher','lamplighter','apothecary','rimebinder'];
  if(p.run&&(!Array.isArray(p.run.party)||p.run.party.length!==4||new Set(p.run.party).size!==4||p.run.party.some(h=>!heroes.includes(h)||!p.unlocked[h])||!p.run.camp||!p.run.cards||!p.run.gear||p.run.stage<1||p.run.level<1))throw Error('本局存档无效');
  for(const [key,rank] of Object.entries(p.boons)){const limit={dmg:20,hp:20,silver:10,xp:10,start:12,apothecary:1,rimebinder:1}[key];if(limit===undefined||rank<0||rank>limit)throw Error('祝福等级无效');}
  if(Object.keys(p.unlocked).some(h=>!heroes.includes(h))||Object.values(p.unlocked).some(v=>v!==0&&v!==1))throw Error('英雄解锁数据无效');
  if(p.run){const cardIds=new Set(require('../../dist/contract.js').cards);for(const [key,rank] of Object.entries(p.run.cards))if(!cardIds.has(key)||!Number.isInteger(rank)||rank<0||rank>3)throw Error('卡牌等级无效');for(const [hero,slots] of Object.entries(p.run.gear)){if(!heroes.includes(hero))throw Error('装备角色无效');for(const [slot,item] of Object.entries(slots))if(!['weapon','armour','trinket'].includes(slot)||item.slot!==slot)throw Error('装备槽位无效');}}
  const inspect=value=>{if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>1e150))throw Error('存档数值无效');if(value&&typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('存档字段无效');inspect(value[key]);}};
  inspect(payload);return payload;
}

class SaveService {
  constructor(platform,config){
    this.platform=platform;this.config=config;this.token=null;this.userId=null;this.local=null;this.busy=null;
    this.status='准备存档';this.conflict=null;this.reward=null;this.online=false;this.changed=()=>{};
  }
  key(){return 'lanternfall.wx.v1.'+this.userId;}
  persist(){this.platform.storage.set(this.key(),clone(this.local));}
  readLocal(){
    const value=this.platform.storage.get(this.key());
    if(!value)return {revision:0,payload:null,dirty:false,generation:0,pending:null};
    try{if(value.payload)validatePayload(value.payload);if(!Number.isInteger(value.revision)||!Number.isInteger(value.generation))throw Error();return value;}
    catch(_){this.platform.storage.set(this.key()+'.corrupt.'+this.platform.now(),value);this.status='损坏的本地存档已备份';return {revision:0,payload:null,dirty:false,generation:0,pending:null};}
  }
  async identify(){
    const code=await this.platform.login();
    const auth=await this.platform.request({url:this.config.apiBase+'/api/v1/auth/wechat',method:'POST',data:{code},timeout:this.config.requestTimeout});
    if(this.userId&&this.userId!==auth.user_id) {this.token=null;this.online=false;this.status='微信账号已变化，请重新进入游戏';throw Error(this.status);}
    this.userId=auth.user_id;this.token=auth.token;this.online=true;
    this.platform.storage.set('lanternfall.wx.last-user',this.userId);
  }
  async request(path,method='GET',data){
    try{return await this.platform.request({url:this.config.apiBase+'/api/v1/'+path,method,data,token:this.token,timeout:this.config.requestTimeout});}
    catch(error){if(error.status!==401)throw error;await this.identify();return this.platform.request({url:this.config.apiBase+'/api/v1/'+path,method,data,token:this.token,timeout:this.config.requestTimeout});}
  }
  async open(){
    if(!this.config.apiBase){this.userId='guest';this.local=this.readLocal();this.status='本地存档 · 未配置云服务';return this.local.payload;}
    try{await this.identify();}
    catch(error){
      this.userId=this.platform.storage.get('lanternfall.wx.last-user');
      if(!this.userId)throw Error('首次登录需要网络及可用的云服务');
      this.local=this.readLocal();this.online=false;this.status='离线 · 上次账号的本地存档';
      if(!this.local.payload)throw error;return this.local.payload;
    }
    this.local=this.readLocal();
    try {
      if(this.local.pending)await this.sendPending();
      if(this.conflict)return this.local.payload;
      const remote=await this.request('save');
      if(this.local.dirty){
        if(this.local.revision!==remote.revision){this.setConflict(remote);return this.local.payload;}
        await this.flush();
      }else this.accept(remote);
      if(this.local.payload){await this.claim();}
      this.status='云存档已同步';return this.local.payload;
    }catch(error){if(this.conflict)return this.local.payload;this.online=false;this.status='离线 · 已保存到本地';if(!this.local.payload)throw error;return this.local.payload;}
  }
  accept(remote){
    if(remote.payload)validatePayload(remote.payload);
    this.local={revision:remote.revision,payload:clone(remote.payload),dirty:false,generation:(this.local?.generation||0)+1,pending:null};this.persist();
  }
  capture(payload){
    validatePayload(payload);if(!this.local)throw Error('存档未初始化');
    this.local.payload=clone(payload);this.local.generation++;this.local.dirty=true;this.persist();
    if(!this.conflict)this.status=this.config.apiBase?'已保存到本地 · 待同步':'本地存档 · 未配置云服务';
  }
  setConflict(remote){
    this.conflict=clone(remote);this.local.conflict=this.conflict;this.persist();this.status='存档冲突 · 请选择保留的进度';this.changed();
  }
  async sendPending(){
    const pending=this.local.pending;if(!pending)return;
    try{
      const result=await this.request(pending.kind==='claim'?'offline/claim':pending.kind==='restore'?'save/restore':'save',pending.kind==='write'?'PUT':'POST',pending.body);
      this.local.revision=result.revision;this.local.pending=null;
      if(pending.kind!=='write'){
        // Claims only run while gameplay is paused, so replacing this payload is safe.
        this.local.payload=result.payload;this.local.dirty=false;this.reward=result.reward;
      }else this.local.dirty=this.local.generation!==pending.generation;
      this.persist();this.status=this.local.dirty?'已保存到本地 · 待同步':'云存档已同步';return result;
    }catch(error){
      if(error.status===409){
        this.local.pending=null;
        const remote=error.data?.detail?.save||await this.request('save');this.setConflict(remote);
      }else if(error.status===404){this.local.pending=null;this.persist();this.status='历史存档已过期 · 请刷新列表';}
      else if(error.status===422||error.status===413){this.local.pending=null;this.persist();this.status='存档校验未通过 · 请导出备份或恢复旧档';}
      else {this.status='已保存到本地 · 同步失败，稍后重试';this.online=false;}
      throw error;
    }
  }
  async flush(){
    if(!this.config.apiBase||this.conflict||!this.local?.dirty&&!this.local?.pending)return;
    if(this.busy){await this.busy;return this.flush();}
    this.busy=(async()=>{
      if(!this.token)await this.identify();
      if(this.local.pending)await this.sendPending();
      if(this.local.dirty&&!this.conflict){
        this.local.pending={kind:'write',generation:this.local.generation,body:{request_id:this.platform.randomId(),revision:this.local.revision,payload:clone(this.local.payload)}};
        this.persist();await this.sendPending();
      }
    })();
    try{await this.busy;}finally{this.busy=null;}
  }
  async claim(){
    if(this.conflict||!this.config.apiBase||!this.local.payload)return;
    await this.flush();
    this.local.pending={kind:'claim',generation:this.local.generation,body:{request_id:this.platform.randomId(),revision:this.local.revision}};
    this.persist();return this.sendPending();
  }
  async refresh(){
    if(!this.config.apiBase||this.conflict)return null;
    // Recheck identity even when the saved business token is still valid.
    await this.identify();await this.flush();
    const remote=await this.request('save');
    if(remote.revision!==this.local.revision){this.setConflict(remote);return null;}
    await this.claim();return this.local.payload;
  }
  async resolve(choice){
    if(!this.conflict)return null;
    const remote=await this.request('save');
    // Keep both sides before the user's explicit choice.
    this.platform.storage.set(this.key()+'.conflict.'+this.platform.now(),{local:this.local.payload,remote:remote.payload});
    const own=clone(this.local.payload);
    this.conflict=null;delete this.local.conflict;
    this.accept(remote);
    if(choice==='local'&&own){this.capture(own);await this.flush();}
    this.status='云存档已同步';return this.local.payload;
  }
  async history(){await this.flush();return (await this.request('save/history')).items;}
  async restore(revision){
    if(this.conflict)throw Error('请先处理存档冲突');
    await this.flush();
    this.platform.storage.set(this.key()+'.before-restore.'+this.platform.now(),this.local.payload);
    this.local.pending={kind:'restore',generation:this.local.generation,body:{request_id:this.platform.randomId(),revision:this.local.revision,source_revision:revision}};
    this.persist();await this.sendPending();return this.local.payload;
  }
}
module.exports={SaveService,validatePayload};
