// 验证 data.js 内容库规模与数据完整性
global.window = {};
require('f:/GitHub/H874589148.github.io/games/life/data.js');
const d = global.window.__lifeData;
console.log('规模:', JSON.stringify(d.stats()));

// id 唯一性
const ids = new Set(); const dup = [];
d.DECISIONS.forEach(e => { if (ids.has(e.id)) dup.push(e.id); ids.add(e.id); });
console.log('重复id:', dup.length ? dup : '无');

// 阶段分布（5-14/15-24/25-34/35-44/45+）
const seg = { '童年5-14': 0, '少年15-24': 0, '青年25-34': 0, '中年35-44': 0, '后半生45+': 0 };
d.DECISIONS.forEach(e => {
  if (e.min >= 45) seg['后半生45+']++; else if (e.min >= 35) seg['中年35-44']++;
  else if (e.min >= 25) seg['青年25-34']++; else if (e.min >= 15) seg['少年15-24']++;
  else seg['童年5-14']++;
});
console.log('阶段分布:', JSON.stringify(seg));

// 时代分布
const eraCount = {};
d.DECISIONS.forEach(e => eraCount[e.era] = (eraCount[e.era] || 0) + 1);
console.log('时代分布:', JSON.stringify(eraCount));

// 条件字段合法性（白名单）
const OK = ['minWealth','maxWealth','minIq','minTalent','minEq','minBody','minPower','maxPower','tag','anytag','notag','gender'];
const bad = [];
d.DECISIONS.forEach(e => {
  const cs = [e.cond, ...e.options.map(o => o.cond)].filter(Boolean);
  cs.forEach(c => Object.keys(c).forEach(k => { if (!OK.includes(k)) bad.push(e.id + ':' + k); }));
});
console.log('非法cond键:', bad.length ? bad : '无');

// eff 键合法性
const OKA = ['iq','eq','talent','body','wealth','power'];
const badE = [];
d.DECISIONS.forEach(e => e.options.forEach(o => {
  if (o.eff) Object.keys(o.eff).forEach(k => { if (!OKA.includes(k)) badE.push(e.id + ':' + k); });
}));
console.log('非法eff键:', badE.length ? badE : '无');

// outfit 合法性
const badO = [];
d.DECISIONS.forEach(e => e.options.forEach(o => { if (o.outfit && !['cloth','shortcoat','scholar','wuxia','silk','official','medic','straw','fine','qipao','student','suit','work','sport','casual'].includes(o.outfit)) badO.push(e.id + ':' + o.outfit); }));
console.log('非法outfit:', badO.length ? badO : '无');

// 每个事件必须有 options 且每个 option 有 t/say
const badS = [];
d.DECISIONS.forEach(e => { if (!e.options || !e.options.length || e.options.some(o => !o.t || !o.say)) badS.push(e.id); });
console.log('缺选项/文案:', badS.length ? badS : '无');

// 随机事件合法性
const badM = [];
[...d.RANDOM_MINOR, ...d.RANDOM_MAJOR].forEach((e, i) => {
  if (e.eff && Object.keys(e.eff).some(k => !OKA.includes(k))) badM.push('minor/major#' + i);
  if (e.cond && Object.keys(e.cond).some(k => !OK.includes(k))) badM.push('cond#' + i);
});
console.log('随机事件非法键:', badM.length ? badM : '无');

// gender 条件事件统计（性别分支覆盖）
const gCount = d.DECISIONS.filter(e => (e.cond && e.cond.gender) || e.options.some(o => o.cond && o.cond.gender)).length;
console.log('含性别分支事件:', gCount);
const wCount = d.DECISIONS.filter(e => (e.cond && (e.cond.minWealth || e.cond.maxWealth)) || e.options.some(o => o.cond && (o.cond.minWealth || o.cond.maxWealth))).length;
console.log('含家境门槛事件:', wCount);
