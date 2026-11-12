import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html','.js':'text/javascript','.cjs':'text/javascript','.json':'application/json','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/bundle.js'){
    const modules={};
    const visit=file=>{
      if(!file.endsWith('.js'))throw Error('MiniGame runtime data must be exported from a .js module: '+path.relative(root,file));
      let source=fs.readFileSync(file,'utf8');const id=path.relative(root,file).split(path.sep).join('/');if(modules[id])return id;
      modules[id]='';
      source=source.replace(/require\(['"](\.[^'"]+)['"]\)/g,(full,spec)=>{
        let dep=path.resolve(path.dirname(file),spec);if(!fs.existsSync(dep))dep+='.js';
        if(!fs.existsSync(dep))return '({})';return `require(${JSON.stringify(visit(dep))})`;
      });modules[id]=source;return id;
    };
    const entry=visit(path.join(root,'preview/main.js'));
    res.setHeader('content-type','text/javascript');res.end(`(()=>{const modules={${Object.entries(modules).map(([id,s])=>JSON.stringify(id)+':function(module,exports,require){\n'+s+'\n}').join(',')}};const cache={};function require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports;}require(${JSON.stringify(entry)});})();`);return;
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/preview/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404);res.end();}
});
server.listen(8080,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:8080 (browser harness; not a WeChat device validation)'));
