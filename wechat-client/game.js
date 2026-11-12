const createPlatform=require('./src/platform/wechat.js');
const start=require('./src/main.js');
const config=require('./config.js');
start(createPlatform(wx),config).catch(error=>{
  console.error('Lanternfall startup failed',error.message);
  wx.showModal({title:'启动失败',content:error.message||'请更新微信后重试',showCancel:false});
});
