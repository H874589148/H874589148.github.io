// 截断 data.js 至第 913 行（去除重复残留块）
const fs = require('fs');
const p = 'f:/GitHub/H874589148.github.io/games/life/data.js';
const lines = fs.readFileSync(p, 'utf8').split('\n');
console.log('before:', lines.length, 'lines');
const out = lines.slice(0, 913).join('\n') + '\n';
fs.writeFileSync(p, out, 'utf8');
console.log('after :', out.split('\n').length, 'lines');
console.log('tail  :', JSON.stringify(out.split('\n').slice(-3)));
