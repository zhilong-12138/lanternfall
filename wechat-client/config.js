// Override locally with config.local.js (ignored by git). No secrets belong here.
let local = {};
try { local = require('./config.local.js'); } catch (_) {}
module.exports = Object.assign({ apiBase: '', requestTimeout: 10000, quality: 'low' }, local);
