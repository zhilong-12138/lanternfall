const {validatePayload}=require('./saves.js');
// v1 is the first cloud format. Legacy browser exports are a bare player object.
function migratePayload(raw){
  const value=JSON.parse(JSON.stringify(raw));
  if(value?.schema_version!==undefined){validatePayload(value);return value;}
  if(!value||typeof value!=='object'||typeof value.embers!=='number'||!value.unlocked)throw Error('不是有效的 Lanternfall 存档');
  value.pendingCards=0;value.atWaylight=false;
  value.vol=Object.assign({music:.6,sfx:.8,mute:false,master:1},value.vol||{});
  value.rate=value.rate||{silver:0,xp:0};value.best=value.best||{stage:0,level:0,time:0};
  value.lastSeen=0;value.speed=[1,2,4].includes(value.speed)?value.speed:1;
  const result={schema_version:1,player:value};validatePayload(result);return result;
}
module.exports={migratePayload};
