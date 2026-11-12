module.exports = function createPlatform(wx) {
  const canvas = wx.createCanvas(); // The first canvas is the only on-screen canvas.
  const overlay = wx.createCanvas();
  const info = {};
  const update = () => {
    const data = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    info.width=data.windowWidth; info.height=data.windowHeight; info.dpr=data.pixelRatio||1;
    const safe=data.safeArea||{left:0,top:0,right:info.width,bottom:info.height};
    info.safe={left:safe.left||0,top:safe.top||0,right:Math.max(0,info.width-safe.right),bottom:Math.max(0,info.height-safe.bottom)};
    try { info.capsule=wx.getMenuButtonBoundingClientRect(); } catch (_) { info.capsule=null; }
  };
  update();
  // Three r158 only needs event registration on the supplied canvas, not a DOM.
  if (!canvas.style) canvas.style={};
  const events = new Map();
  const add = (type, fn) => { if(!events.has(type)) events.set(type,new Set()); events.get(type).add(fn); };
  if (!canvas.addEventListener) canvas.addEventListener=add;
  if (!canvas.removeEventListener) canvas.removeEventListener=(type,fn)=>events.get(type)?.delete(fn);
  const dispatch = type => { for(const fn of events.get(type)||[]) fn({preventDefault(){}}); };
  if(wx.onContextLost) wx.onContextLost(()=>dispatch('webglcontextlost'));
  if(wx.onContextRestored) wx.onContextRestored(()=>dispatch('webglcontextrestored'));
  return {
    canvas, overlay, info, update,
    window: {get innerWidth(){return info.width;},get innerHeight(){return info.height;},get devicePixelRatio(){return info.dpr;}},
    storage: {get:key=>wx.getStorageSync(key)||null, set:(key,value)=>wx.setStorageSync(key,value)},
    randomId() { const bytes=new Uint8Array(16); if(wx.getRandomValues) { try { const r=wx.getRandomValues({length:16}); if(r?.randomValues) bytes.set(new Uint8Array(r.randomValues)); else throw Error(); } catch (_) { for(let i=0;i<16;i++) bytes[i]=Math.random()*256; } } else for(let i=0;i<16;i++) bytes[i]=Math.random()*256; return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''); },
    now:()=>Date.now(),
    request:({url,method='GET',data,token,timeout=10000})=>new Promise((resolve,reject)=>wx.request({url,method,data,timeout,
      header:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      success:r=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(Object.assign(new Error('HTTP '+r.statusCode),{status:r.statusCode,data:r.data})),fail:reject})),
    login:()=>new Promise((resolve,reject)=>wx.login({success:r=>r.code?resolve(r.code):reject(Error('微信登录未返回 code')),fail:reject})),
    raf:fn=>(canvas.requestAnimationFrame?canvas.requestAnimationFrame(fn):requestAnimationFrame(fn)),
    onTouch(fn){wx.onTouchEnd(e=>{const p=e.changedTouches[0];if(p)fn(p.clientX??p.x,p.clientY??p.y);});},
    // Press feedback: cards and buttons can light up while the finger is down.
    onTouchStart(fn){if(wx.onTouchStart)wx.onTouchStart(e=>{const p=e.touches[0]||e.changedTouches[0];if(p)fn(p.clientX??p.x,p.clientY??p.y);});},
    onResize:fn=>wx.onWindowResize(()=>{update();fn();}),
    onHide:fn=>wx.onHide(fn), onShow:fn=>wx.onShow(fn),
    onNetwork:fn=>wx.onNetworkStatusChange?.(e=>e.isConnected&&fn()),
    modal:options=>new Promise(resolve=>wx.showModal({...options,success:resolve,fail:()=>resolve({cancel:true})})),
    clipboard:data=>wx.setClipboardData({data}),
    readClipboard:()=>new Promise((resolve,reject)=>wx.getClipboardData({success:r=>resolve(r.data),fail:reject})),
    loadAudio:()=>new Promise((resolve,reject)=>wx.loadSubpackage({name:'audio',success:resolve,fail:reject})),
    audio:path=>{const audio=wx.createInnerAudioContext();audio.src=path;audio.obeyMuteSwitch=true;return audio;}
  };
};
