const {test}=require('node:test');
const assert=require('node:assert/strict');
const THREE=require('../dist/three.js');
const createRenderer=require('../src/rendering/renderer.js');

function setup(t){
  const warnings=[];
  t.mock.method(console,'warn',message=>warnings.push(message));
  const uploaded=new Map(),uploads=[];
  class WebGL1Renderer {
    constructor(){this.shadowMap={};}
    setPixelRatio(){}
    setSize(){}
    setRenderTarget(){}
    clear(){}
    clearDepth(){}
    dispose(){}
    render(scene){
      scene.traverse(object=>{
        const texture=object.material?.map||object.material?.uniforms?.tOverlay?.value;
        if(!texture||uploaded.get(texture)===texture.version)return;
        // Three r158 WebGLTextures' WebGL1 / no EXT_sRGB upload branch.
        // Run the real ImageUtils converter on a native MiniGame canvas object.
        if(texture.colorSpace===THREE.SRGBColorSpace)THREE.ImageUtils.sRGBToLinear(texture.image);
        uploaded.set(texture,texture.version);uploads.push(texture);
      });
    }
  }
  const platform={
    canvas:{getContext:type=>type==='webgl2'?null:{},addEventListener(){}},
    overlay:{width:128,height:64,getContext:()=>({})},
    info:{width:128,height:64,dpr:1}
  };
  const gfx=createRenderer({...THREE,WebGLRenderer:WebGL1Renderer},platform);
  return {gfx,platform,warnings,uploads};
}

test('native MiniGame canvas uploads do not repeat Unsupported image type warnings',t=>{
  const {gfx,warnings,uploads}=setup(t);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  for(let i=0;i<3;i++)gfx.render(scene,camera);
  assert.equal(uploads.length,3,'the changing UI must still upload each frame');
  assert.equal(warnings.filter(message=>message.includes('Unsupported image type')).length,0);
});

test('resizing the native UI canvas retains warning-free uploads',t=>{
  const {gfx,platform,warnings,uploads}=setup(t);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  gfx.render(scene,camera);
  platform.overlay.width=256;platform.overlay.height=128;
  gfx.render(scene,camera);gfx.render(scene,camera);
  assert.notEqual(uploads[0],uploads[1],'resizing must replace immutable texture storage');
  assert.equal(warnings.filter(message=>message.includes('Unsupported image type')).length,0);
});
