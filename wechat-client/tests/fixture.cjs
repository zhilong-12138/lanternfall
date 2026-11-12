const THREE=require('../dist/three.js');
const engine=require('../dist/engine.js');
function makeGame(){const LF=engine({window:{innerWidth:844,innerHeight:390,devicePixelRatio:1}},THREE);LF.quiet=true;LF.game.newRun();return LF;}
function payload(){const LF=makeGame();LF.game.P.run=LF.game.run;return JSON.parse(JSON.stringify({schema_version:1,player:LF.game.P}));}
module.exports={makeGame,payload};
if(require.main===module)process.stdout.write(JSON.stringify(payload()));
