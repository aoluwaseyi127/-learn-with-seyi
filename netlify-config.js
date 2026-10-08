const fs = require('fs');
const api = (process.env.LEARN_WITH_SEYI_API || '').replace(/\/$/, '');
fs.writeFileSync('config.js', `window.LEARN_WITH_SEYI_API = ${JSON.stringify(api)};\n`);
console.log(`Generated config.js with API base: ${api || '(same origin)'}`);
