/* 运行：node --test js/tests/metronome.test.js；音频合成与摆锤视觉另做浏览器验收。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../games/metronome/script');

test('BPM clamp：越界收敛到 40–208，非法输入回退默认 120', () => {
  assert.equal(M.clampBpm(39), 40);
  assert.equal(M.clampBpm(0), 40);
  assert.equal(M.clampBpm(-100), 40);
  assert.equal(M.clampBpm(209), 208);
  assert.equal(M.clampBpm(10000), 208);
  assert.equal(M.clampBpm(120), 120);
  assert.equal(M.clampBpm(120.6), 121);
  assert.equal(M.clampBpm('96'), 96);
  assert.equal(M.clampBpm('abc'), 120);
  assert.equal(M.clampBpm(NaN), 120);
  assert.equal(M.clampBpm(undefined), 120);
});

test('每小节拍数 clamp：1–12，非法输入回退 4', () => {
  assert.equal(M.clampBeats(0), 1);
  assert.equal(M.clampBeats(-3), 1);
  assert.equal(M.clampBeats(13), 12);
  assert.equal(M.clampBeats(4), 4);
  assert.equal(M.clampBeats(5.7), 6);
  assert.equal(M.clampBeats('x'), 4);
});

test('速度术语映射：区间边界逐点命中', () => {
  const name = b => M.tempoTerm(b).name;
  assert.equal(name(40), 'Largo');
  assert.equal(name(60), 'Largo');
  assert.equal(name(61), 'Larghetto');
  assert.equal(name(66), 'Larghetto');
  assert.equal(name(67), 'Adagio');
  assert.equal(name(76), 'Adagio');
  assert.equal(name(77), 'Andante');
  assert.equal(name(108), 'Andante');
  assert.equal(name(109), 'Moderato');
  assert.equal(name(120), 'Moderato');
  assert.equal(name(121), 'Allegro');
  assert.equal(name(168), 'Allegro');
  assert.equal(name(169), 'Presto');
  assert.equal(name(199), 'Presto');
  assert.equal(name(200), 'Prestissimo');
  assert.equal(name(208), 'Prestissimo');
  assert.equal(M.tempoTerm(120).zh, '中板');
  assert.equal(M.tempoTerm(40).zh, '广板');
});

test('拍间隔数学：60/BPM/细分数', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + ' vs ' + b);
  near(M.beatInterval(120, 1), 0.5);        // 120BPM 四分 = 0.5s
  near(M.beatInterval(120, 2), 0.25);       // 八分
  near(M.beatInterval(120, 3), 1 / 6);      // 三连音
  near(M.beatInterval(120, 4), 0.125);      // 十六分
  near(M.beatInterval(60, 1), 1);           // 60BPM = 1s
  near(M.beatInterval(208, 4), 60 / 208 / 4);
  near(M.beatInterval(0, 1), 60 / 40);      // 非法 BPM 经 clamp 后计算
});

test('速度预设：全部落在 40–208 且含 120，严格升序无重复', () => {
  for (const b of M.TEMPO_PRESETS) assert.ok(b >= 40 && b <= 208);
  assert.ok(M.TEMPO_PRESETS.includes(120));
  const sorted = [...M.TEMPO_PRESETS].sort((a, b) => a - b);
  assert.deepEqual(M.TEMPO_PRESETS, sorted);
  assert.equal(new Set(M.TEMPO_PRESETS).size, M.TEMPO_PRESETS.length);
});

test('拍号预设：2/4、3/4、4/4 直映射，6/8 = 2 拍 + 三连音', () => {
  const find = label => M.TIME_SIG_PRESETS.find(t => t.label === label);
  assert.deepEqual(find('2/4'), { label: '2/4', beats: 2, subdiv: 1 });
  assert.deepEqual(find('3/4'), { label: '3/4', beats: 3, subdiv: 1 });
  assert.deepEqual(find('4/4'), { label: '4/4', beats: 4, subdiv: 1 });
  assert.deepEqual(find('6/8'), { label: '6/8', beats: 2, subdiv: 3 });
  for (const t of M.TIME_SIG_PRESETS) {
    assert.ok(t.beats >= M.BEATS_MIN && t.beats <= M.BEATS_MAX);
    assert.ok(M.SUBDIVISIONS.some(s => s.id === t.subdiv));
  }
});

test('细分与音色表：id 唯一且完整', () => {
  assert.deepEqual(M.SUBDIVISIONS.map(s => s.id), [1, 2, 3, 4]);
  assert.deepEqual(M.SOUNDS.map(s => s.id), ['wood', 'drum', 'click', 'beep']);
  assert.equal(new Set(M.SOUNDS.map(s => s.label)).size, M.SOUNDS.length);
});
