const start=require('../src/main.js');
const config=require('../config.js');
const canvas=document.getElementById('game');const overlay=document.createElement('canvas');
const info={width:innerWidth,height:innerHeight,dpr:devicePixelRatio,safe:{left:0,right:0,top:0,bottom:0},capsule:null};
let show,hide;
const platform={canvas,overlay,info,window,
  update(){info.width=innerWidth;info.height=innerHeight;info.dpr=devicePixelRatio;},
  storage:{get:key=>{try{return JSON.parse(localStorage.getItem(key));}catch(_){return null;}},set:(key,value)=>localStorage.setItem(key,JSON.stringify(value))},
  now:()=>Date.now(),randomId:()=>crypto.randomUUID().replaceAll('-',''),
  login:async()=> 'dev:'+(new URLSearchParams(location.search).get('user')||'preview'),
  async request({url,method='GET',data,token}){const response=await fetch(url,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});const value=await response.json();if(!response.ok)throw Object.assign(Error('HTTP '+response.status),{status:response.status,data:value});return value;},
  raf:fn=>requestAnimationFrame(fn),
  onTouch:fn=>canvas.addEventListener('pointerup',e=>{const r=canvas.getBoundingClientRect();fn(e.clientX-r.left,e.clientY-r.top);}),
  onTouchStart:fn=>canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();fn(e.clientX-r.left,e.clientY-r.top);}),
  onResize:fn=>window.addEventListener('resize',()=>{platform.update();fn();}),
  onShow:fn=>{show=fn;},onHide:fn=>{hide=fn;},onNetwork:fn=>window.addEventListener('online',fn),
  modal:async({title,content})=>({confirm:confirm(title+'\n'+content),cancel:false}),
  clipboard:data=>navigator.clipboard?.writeText(data),
  readClipboard:async()=>prompt('粘贴 Lanternfall JSON 存档')||'',
  loadAudio:async()=>{},
  audio:path=>{const a=new Audio('/'+path);return {set src(value){a.src='/'+value;},get src(){return a.src;},set volume(v){a.volume=v;},set loop(v){a.loop=v;},play(){a.play().catch(()=>{});},pause(){a.pause();},stop(){a.pause();a.currentTime=0;},destroy(){a.pause();a.src='';},onError:fn=>a.addEventListener('error',fn),onEnded:fn=>a.addEventListener('ended',fn)};}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide?.();else show?.();});
window.addEventListener('error',e=>document.getElementById('error').textContent=e.message+'\n'+(e.error?.stack||''));
window.addEventListener('unhandledrejection',e=>document.getElementById('error').textContent=String(e.reason?.stack||e.reason));
// The preview is a rendering harness first, so it stays offline unless asked:
// ?api=8010 (port shorthand) or ?api=http://host:port enables the cloud save path;
// a bare ?api or ?api=0 forces local-only mode.
const apiParam=new URLSearchParams(location.search).get('api');
if(apiParam===null)config.apiBase='';
else if(!apiParam||apiParam==='0')config.apiBase='';
else config.apiBase=/^https?:\/\//.test(apiParam)?apiParam:'http://127.0.0.1:'+apiParam;
start(platform,config).then(app=>window.gameApp=app).catch(e=>document.getElementById('error').textContent=e.stack);
