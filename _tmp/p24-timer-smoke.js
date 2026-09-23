/* 24点游戏计时与成绩纯函数冒烟：node _tmp/p24-timer-smoke.js （exit 0 = 全部通过） */
'use strict';
const P24 = require('F:/GitHub/H874589148.github.io/games/24point/script.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('PASS', name); }
    else { fail++; console.log('FAIL', name, extra == null ? '' : extra); }
}

/* ---- fmtTime ---- */
ok('fmtTime(0) = "0.0 秒"', P24.fmtTime(0) === '0.0 秒', P24.fmtTime(0));
ok('fmtTime(499) = "0.5 秒"（四舍五入到十分位）', P24.fmtTime(499) === '0.5 秒', P24.fmtTime(499));
ok('fmtTime(23400) = "23.4 秒"', P24.fmtTime(23400) === '23.4 秒', P24.fmtTime(23400));
ok('fmtTime(59949) = "59.9 秒"（未满 60 不进位）', P24.fmtTime(59949) === '59.9 秒', P24.fmtTime(59949));
ok('fmtTime(60000) = "1:00.0"', P24.fmtTime(60000) === '1:00.0', P24.fmtTime(60000));
ok('fmtTime(95200) = "1:35.2"', P24.fmtTime(95200) === '1:35.2', P24.fmtTime(95200));
ok('fmtTime(69960) = "1:10.0"（十分位进位不错位）', P24.fmtTime(69960) === '1:10.0', P24.fmtTime(69960));
ok('fmtTime(600000) = "10:00.0"', P24.fmtTime(600000) === '10:00.0', P24.fmtTime(600000));
ok('fmtTime(-5) 负值按 0 处理', P24.fmtTime(-5) === '0.0 秒', P24.fmtTime(-5));

/* ---- pushRecord ---- */
{
    const list = [];
    for (let i = 1; i <= 12; i++) P24.pushRecord(list, { no: i, ms: i * 1000 }, 10);
    ok('pushRecord 插入 12 条后长度 = 10', list.length === 10, list.length);
    ok('pushRecord 最新在顶（no=12）', list[0].no === 12, list[0].no);
    ok('pushRecord 最旧两条被移除（末位 no=3）', list[list.length - 1].no === 3, list[list.length - 1].no);
    ok('pushRecord 返回原数组引用', P24.pushRecord(list, { no: 13 }, 10) === list && list.length === 10 && list[0].no === 13);
}

/* ---- avgMs ---- */
ok('avgMs 均值计算', P24.avgMs([{ ms: 1000 }, { ms: 2000 }, { ms: 3100 }]) === 6100 / 3, P24.avgMs([{ ms: 1000 }, { ms: 2000 }, { ms: 3100 }]));
ok('avgMs 空列表返回 null', P24.avgMs([]) === null);

/* ---- 可解性预判基准（与既有结论一致） ---- */
ok('[1,1,1,1] 无解', P24.solve24([1, 1, 1, 1]).length === 0);
ok('[3,3,8,8] 有解', P24.solve24([3, 3, 8, 8]).length > 0);

console.log('----------------------------------------');
console.log('p24-timer-smoke: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
