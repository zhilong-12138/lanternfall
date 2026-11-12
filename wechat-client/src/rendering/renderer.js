// Static render-scale budget per quality tier. The scene is geometry heavy (8600 grass
// clusters), so quality trades fill rate against sharpness: the drawing buffer is what the
// device stretches to the screen, so a small buffer is exactly what looks blurry.
const PRESETS={
  low:{cap:2,pixels:2.0e6,min:0.75},
  medium:{cap:2.6,pixels:3.4e6,min:0.8},
  high:{cap:3,pixels:5.2e6,min:0.9}
};
module.exports = function createRenderer(THREE, platform, quality='low', options={}) {
  const {canvas,overlay,info}=platform;
  // three.js r158 classifies the context with
  //   typeof WebGL2RenderingContext !== 'undefined' && gl.constructor.name === 'WebGL2RenderingContext'
  // The WeChat runtime hands out a real WebGL2 context while that constructor global is
  // missing, so three falls back to its WebGL1 shader path and emits
  // "#extension GL_OES_standard_derivatives" -- which a GLES3 driver rejects. Every
  // MeshStandardMaterial then fails to link: Sky/UI ShaderMaterials keep drawing while
  // the whole 3D world disappears. Only ask for WebGL2 when three.js will recognise it,
  // so the runtime and three.js always agree on the shader dialect.
  // MSAA is nearly free on tile GPUs and is the only thing that smooths the many thin
  // silhouettes (grass blades, spear shafts, fence rails) at this pixel density.
  const antialias=options.antialias!==false;
  const attributes={alpha:false,antialias,depth:true,powerPreference:'high-performance'};
  let gl=null;
  if(typeof WebGL2RenderingContext!=='undefined'){try{gl=canvas.getContext('webgl2',attributes);}catch(_){}}
  if(!gl)try{gl=canvas.getContext('webgl',attributes);}catch(_){}
  if(!gl)try{gl=canvas.getContext('experimental-webgl',attributes);}catch(_){}
  if(!gl) throw Error('此设备无法创建 WebGL，请更新微信后重试');
  const renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias,alpha:false});
  // A failed program silently drops its meshes, which is exactly how the missing world
  // stayed invisible. Keep the driver log where 真机调试 can read it.
  if(renderer.debug){
    renderer.debug.checkShaderErrors=true;
    renderer.debug.onShaderError=(context,program,vertexShader,fragmentShader)=>{
      const log=name=>{const source=context.getShaderInfoLog(name);return source?source.trim():'';};
      console.error('[lanternfall] shader link failed:',log(vertexShader),log(fragmentShader));
      gfx.shaderError=(log(vertexShader)+' '+log(fragmentShader)).trim().replace(/\s+/g,' ');
    };
  }
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.shadowMap.enabled=quality!=='low';renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.autoClear=false;
  // UI pixels are already display-encoded. The pass-through shader preserves
  // their colors without ImageUtils trying to convert a native MiniGame canvas
  // as if it were an HTMLCanvasElement on the WebGL1 upload path.
  function overlayTexture(){const value=new THREE.CanvasTexture(overlay);value.minFilter=THREE.LinearFilter;value.magFilter=THREE.LinearFilter;value.generateMipmaps=false;value.colorSpace=THREE.NoColorSpace;return value;}
  let texture=overlayTexture(),overlayWidth=overlay.width,overlayHeight=overlay.height;
  const screen=new THREE.Scene();const screenCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const material=new THREE.ShaderMaterial({
    uniforms:{tOverlay:{value:texture}},
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader:'uniform sampler2D tOverlay; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tOverlay,vUv); }',
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false
  });
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;screen.add(quad);
  const version=(()=>{try{return String(gl.getParameter(gl.VERSION)||'');}catch(_){return '';}})();
  if(/WebGL 2|OpenGL ES 3/.test(version)&&!(renderer.capabilities&&renderer.capabilities.isWebGL2))
    console.warn('[lanternfall] WebGL2 context classified as WebGL1 by three.js; its GLSL ES 1.00 shaders are rejected on GLES3 drivers.');
  const gfx={renderer,glVersion:version,webgl2:!!(renderer.capabilities&&renderer.capabilities.isWebGL2),shaderError:'',
    W:0,H:0,cw:0,ch:0,scale:0,lost:false,params:{focus:18,aperture:0,ao:0,bloom:0,fogMul:1,flash:0},
    lights:Array.from({length:4},()=>({pos:new THREE.Vector3(),col:new THREE.Color()})),
    // Highest scale this screen may use: bounded by the device pixel ratio, the tier cap,
    // and the tier's pixel budget.
    targetScale(){
      const preset=PRESETS[quality]||PRESETS.low;
      const budget=Math.sqrt(preset.pixels/Math.max(1,info.width*info.height));
      return Math.max(preset.min,Math.min(info.dpr||1,preset.cap,budget));
    },
    // scale maps CSS pixels onto the drawing buffer. Omit it to return to the tier target;
    // main.js lowers it when frames get slow (dynamic resolution).
    resize(scale){
      const preset=PRESETS[quality]||PRESETS.low;
      this.cw=info.width;this.ch=info.height;
      const value=Math.max(0.7,Math.min(typeof scale==='number'?scale:this.scale||this.targetScale(),preset.cap));
      this.scale=value;
      this.W=Math.max(2,Math.round(info.width*value));this.H=Math.max(2,Math.round(info.height*value));
      renderer.setPixelRatio(1);renderer.setSize(this.W,this.H,false);
    },
    render(scene,cam){
      if(this.lost)return;
      if(!scene.fog)scene.fog=new THREE.FogExp2(0x080d16,.023);
      renderer.setRenderTarget(null);renderer.clear();renderer.render(scene,cam);
      if(overlay.width!==overlayWidth||overlay.height!==overlayHeight){
        texture.dispose();texture=overlayTexture();material.uniforms.tOverlay.value=texture;
        overlayWidth=overlay.width;overlayHeight=overlay.height;
      }
      texture.needsUpdate=true;renderer.clearDepth();renderer.render(screen,screenCam);
    },
    setQuality(value){quality=value;renderer.shadowMap.enabled=value!=='low';this.scale=0;this.resize();},
    dispose(){texture.dispose();material.dispose();quad.geometry.dispose();renderer.dispose();}
  };
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();gfx.lost=true;});
  // Recreating all GPU resources is safer than resuming stale application objects.
  canvas.addEventListener('webglcontextrestored',()=>{platform.onContextRestored?.();});
  gfx.resize();return gfx;
};
