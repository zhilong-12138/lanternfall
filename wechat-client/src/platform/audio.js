module.exports = function createAudio(platform, manifest, getVolume) {
  let loaded=false,started=false,music=null,fire=null,paused=false,index=0;
  const voices=[];
  const api={ctx:null,CATS:['music','campfire'],error:'',
    async start(){
      started=true;if(paused)return;
      if(!loaded){if(api.loading)return;api.loading=true;try{await platform.loadAudio();loaded=true;}catch(_){api.error='声音资源加载失败，点声音按钮重试';return;}finally{api.loading=false;}}
      if(!music&&manifest.music.length){music=platform.audio(manifest.music[index]);music.onError?.(()=>{api.error='音乐格式或设备不兼容';});music.onEnded?.(()=>{index=(index+1)%manifest.music.length;music.src=manifest.music[index];music.play();});}
      if(!fire&&manifest.campfire){fire=platform.audio(manifest.campfire);fire.loop=true;}
      api.setVol();if(!getVolume().mute){music?.play();fire?.play();}
    },
    play(event){
      if(!started||paused||getVolume().mute||!loaded)return;
      const paths=manifest.sfx[event];if(!paths?.length||voices.length>=6)return;
      const a=platform.audio(paths[Math.floor(Math.random()*paths.length)]);a.volume=Math.min(1,getVolume().sfx*(getVolume().master??1));
      voices.push(a);const done=()=>{const i=voices.indexOf(a);if(i>=0)voices.splice(i,1);a.destroy?.();};a.onEnded?.(done);a.onError?.(done);a.play();
    },
    setVol(){const v=getVolume();if(music)music.volume=v.mute||v.off?.music?0:Math.min(1,v.music*(v.master??1));if(fire)fire.volume=v.mute||v.off?.campfire?0:Math.min(.18,v.sfx*.13*(v.master??1));for(const a of voices)a.volume=v.mute?0:v.sfx*(v.master??1);},
    pause(){paused=true;music?.pause();fire?.pause();for(const a of voices)a.stop();},
    resume(){paused=false;if(started)api.start();},
    musicCue(){},update(){},
    destroy(){api.pause();music?.destroy?.();fire?.destroy?.();for(const a of voices)a.destroy?.();}
  };return api;
};
