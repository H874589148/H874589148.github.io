// 验证 data.js 与 script.js 的接口一致性
global.window = {};
require('f:/GitHub/H874589148.github.io/games/life/data.js');
const d = global.window.__lifeData;

const need = ['ERA_GROUPS','ERA_OF','OCCUPATIONS','ATTRS','TOTAL_POINTS','INFANT_TEXTS','ZHUAZHOU','CLASSICS','DECISIONS','RANDOM_MINOR','RANDOM_MAJOR','TITLES','DEFAULT_TITLE','DEATH_CAUSES','OCC_BONUS','stats'];
const miss = need.filter(k => d[k] === undefined);
console.log('缺失导出:', miss.length ? miss : '无');

console.log('OCCUPATIONS 键:', Object.keys(d.OCCUPATIONS).join(','), '| 职业总数:', Object.values(d.OCCUPATIONS).reduce((s, a) => s + a.length, 0));

// OCC_BONUS 覆盖与键合法性
const occs = Object.values(d.OCCUPATIONS).flat();
const noBonus = occs.filter(o => !d.OCC_BONUS[o]);
console.log('无加成职业:', noBonus.length ? noBonus.join(',') : '（全部有加成）');
const badB = [];
Object.entries(d.OCC_BONUS).forEach(([o, b]) => Object.keys(b).forEach(k => { if (!['iq','eq','talent','body','wealth','power'].includes(k)) badB.push(o + ':' + k); }));
console.log('OCC_BONUS 非法键:', badB.length ? badB : '无');

// ZHUAZHOU / CLASSICS / INFANT_TEXTS
console.log('ZHUAZHOU 键:', JSON.stringify(Object.keys(d.ZHUAZHOU)), '| ancient:', JSON.stringify(d.ZHUAZHOU.ancient));
console.log('CLASSICS:', d.CLASSICS.length, '条');
const eraDist = d.INFANT_TEXTS.reduce((m, t) => (m[t.era] = (m[t.era] || 0) + 1, m), {});
console.log('INFANT_TEXTS:', d.INFANT_TEXTS.length, '条, era分布:', JSON.stringify(eraDist));

// DEATH_CAUSES 覆盖 script.js 的 die('age'/'illness'/'accident') + data 的 setCause('war'/'famine')
console.log('DEATH_CAUSES:', JSON.stringify(d.DEATH_CAUSES));

// TITLES 结构
const badT = d.TITLES.filter(t => typeof t.ok !== 'function' || !t.title || !t.sub);
console.log('TITLES 异常:', badT.length ? badT.map(t => t.title) : '无', '| 共', d.TITLES.length, '条');
console.log('DEFAULT_TITLE:', JSON.stringify(d.DEFAULT_TITLE));

// tags 值域（与 script.js propsOf 关注的标签对齐）
const tagSet = new Set();
d.DECISIONS.forEach(e => e.options.forEach(o => (o.tags || []).forEach(t => tagSet.add(t))));
console.log('tags 值域(' + tagSet.size + '):', [...tagSet].sort().join(','));

// RANDOM_MAJOR 特殊字段
const mj = d.RANDOM_MAJOR.filter(e => e.ill || e.setTag || e.setCause);
console.log('major 特殊字段:', mj.map(e => e.id + '(ill:' + !!e.ill + ',tag:' + (e.setTag || '-') + ',cause:' + (e.setCause || '-') + ')').join(' '));

// stats
console.log('stats:', JSON.stringify(d.stats()));
