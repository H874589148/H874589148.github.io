/* ============================================================
   识谱练习 - script.js
   章节体系：C 调基础10章 + 升号调15章 + 降号调15章，含3个跨组综合章
   渲染：本地 Bravura SVG 刻谱字形；音频：Web Audio 合成；无运行时网络依赖
   ============================================================ */
(function () {
'use strict';

/* ================= 乐理基础 ================= */
var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var MIDI_BOTTOM = 21, MIDI_TOP = 108;
var SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
var SHARP_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var GROUP_NAMES = ['大字二组', '大字一组', '大字组', '小字组', '小字一组', '小字二组', '小字三组', '小字四组', '小字五组'];
var MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

function octaveOf(m) { return Math.floor(m / 12) - 1; }
function groupNameOf(m) { var o = octaveOf(m); return GROUP_NAMES[o] || ('八度' + o); }
function midiName(m) { return SHARP_NAME[m % 12] + octaveOf(m); }
function letterIdx(l) { return LETTERS.indexOf(l); }
function letterAccToMidi(letter, acc, oct) { return (oct + 1) * 12 + SEMI[letter] + (acc || 0); }
function diaOf(letter, oct) { return oct * 7 + letterIdx(letter); }
function isBlackMidi(m) { var s = ((m % 12) + 12) % 12; return s === 1 || s === 3 || s === 6 || s === 8 || s === 10; }
function accText(acc) { return acc === 1 ? '♯' : acc === -1 ? '♭' : ''; }
function dispKeyName(name) { return name.replace('#', '♯').replace('b', '♭'); }

/* 自然大调音阶（含理论音名 E#/B#/Cb/Fb） */
function scaleOf(tonicLetter, tonicAcc) {
  var start = letterIdx(tonicLetter), tonicSemi = SEMI[tonicLetter] + tonicAcc, out = [];
  for (var i = 0; i < 7; i++) {
    var letter = LETTERS[(start + i) % 7];
    var target = (tonicSemi + MAJOR_STEPS[i]) % 12;
    var d = target - SEMI[letter];
    if (d > 6) d -= 12; else if (d < -6) d += 12;
    out.push({ letter: letter, acc: d });
  }
  return out;
}

/* ================= 15 调定义 ================= */
var KEYS = {
  C:  { name: 'C大调',  sig: null,                        tonic: { letter: 'C', acc: 0 },  part: 'c' },
  G:  { name: 'G大调',  sig: { type: 'sharp', count: 1 }, tonic: { letter: 'G', acc: 0 },  part: 'sharp' },
  D:  { name: 'D大调',  sig: { type: 'sharp', count: 2 }, tonic: { letter: 'D', acc: 0 },  part: 'sharp' },
  A:  { name: 'A大调',  sig: { type: 'sharp', count: 3 }, tonic: { letter: 'A', acc: 0 },  part: 'sharp' },
  E:  { name: 'E大调',  sig: { type: 'sharp', count: 4 }, tonic: { letter: 'E', acc: 0 },  part: 'sharp' },
  B:  { name: 'B大调',  sig: { type: 'sharp', count: 5 }, tonic: { letter: 'B', acc: 0 },  part: 'sharp' },
  Fs: { name: 'F#大调', sig: { type: 'sharp', count: 6 }, tonic: { letter: 'F', acc: 1 },  part: 'sharp' },
  Cs: { name: 'C#大调', sig: { type: 'sharp', count: 7 }, tonic: { letter: 'C', acc: 1 },  part: 'sharp' },
  F:  { name: 'F大调',  sig: { type: 'flat', count: 1 },  tonic: { letter: 'F', acc: 0 },  part: 'flat' },
  Bb: { name: 'Bb大调', sig: { type: 'flat', count: 2 },  tonic: { letter: 'B', acc: -1 }, part: 'flat' },
  Eb: { name: 'Eb大调', sig: { type: 'flat', count: 3 },  tonic: { letter: 'E', acc: -1 }, part: 'flat' },
  Ab: { name: 'Ab大调', sig: { type: 'flat', count: 4 },  tonic: { letter: 'A', acc: -1 }, part: 'flat' },
  Db: { name: 'Db大调', sig: { type: 'flat', count: 5 },  tonic: { letter: 'D', acc: -1 }, part: 'flat' },
  Gb: { name: 'Gb大调', sig: { type: 'flat', count: 6 },  tonic: { letter: 'G', acc: -1 }, part: 'flat' },
  Cb: { name: 'Cb大调', sig: { type: 'flat', count: 7 },  tonic: { letter: 'C', acc: -1 }, part: 'flat' }
};

/* 各调主音（高音谱号章 / 低音谱号章的起始 MIDI，恒为主音到 7 级音的一个八度） */
var KEY_TONIC = {
  G:  { treble: 67, bass: 43 }, D:  { treble: 62, bass: 50 }, A:  { treble: 69, bass: 45 },
  E:  { treble: 64, bass: 52 }, B:  { treble: 71, bass: 47 }, Fs: { treble: 66, bass: 42 },
  Cs: { treble: 61, bass: 49 }, F:  { treble: 65, bass: 41 }, Bb: { treble: 70, bass: 46 },
  Eb: { treble: 63, bass: 51 }, Ab: { treble: 68, bass: 44 }, Db: { treble: 61, bass: 49 },
  Gb: { treble: 66, bass: 42 }, Cb: { treble: 59, bass: 47 }
};

/* C 调 9 组：覆盖 88 键 A0–C8，从中央向两端交替展开；极端组 8va/8vb/15ma 记谱 */
var C_GROUPS = [
  { group: '小字一组', clef: 'treble', low: 60,  high: 71,  ottava: null },
  { group: '小字二组', clef: 'treble', low: 72,  high: 83,  ottava: null },
  { group: '小字组',   clef: 'bass',   low: 48,  high: 59,  ottava: null },
  { group: '小字三组', clef: 'treble', low: 84,  high: 95,  ottava: { offset: -12, mark: '8va' } },
  { group: '大字组',   clef: 'bass',   low: 36,  high: 47,  ottava: null },
  { group: '小字四组', clef: 'treble', low: 96,  high: 107, ottava: { offset: -24, mark: '15ma' } },
  { group: '大字一组', clef: 'bass',   low: 24,  high: 35,  ottava: { offset: 12, mark: '8vb' } },
  { group: '小字五组', clef: 'treble', low: 108, high: 108, ottava: { offset: -24, mark: '15ma' } },
  { group: '大字二组', clef: 'bass',   low: 21,  high: 23,  ottava: { offset: 12, mark: '8vb' } }
];

/* ================= 章节生成 ================= */
function naturalsScale(low, high) {
  var out = [];
  for (var m = low; m <= high; m++) {
    if (isBlackMidi(m)) continue;
    out.push({ letter: SHARP_NAME[m % 12], acc: 0, octave: octaveOf(m), midi: m });
  }
  return out;
}

function spelledScale(tonicMidi, tonic) {
  var base = octaveOf(tonicMidi), oct = base;
  for (var t = base - 1; t <= base + 1; t++) {
    if (letterAccToMidi(tonic.letter, tonic.acc, t) === tonicMidi) { oct = t; break; }
  }
  var start = letterIdx(tonic.letter);
  return scaleOf(tonic.letter, tonic.acc).map(function (n, i) {
    var o = oct + Math.floor((start + i) / 7);
    return { letter: n.letter, acc: n.acc, octave: o, midi: letterAccToMidi(n.letter, n.acc, o) };
  });
}

function clefLabel(clef) { return clef === 'treble' ? '高音谱号' : '低音谱号'; }

var CHAPTERS = [];
(function buildChapters() {
  var no = 0;
  C_GROUPS.forEach(function (g) {
    no++;
    CHAPTERS.push({
      id: 'c' + g.low, part: 'c', no: no, keyId: 'C', keyName: 'C调', sig: null,
      clef: g.clef, low: g.low, high: g.high, ottava: g.ottava, group: g.group,
      rangeLabel: midiName(g.low) + '–' + midiName(g.high),
      scale: naturalsScale(g.low, g.high),
      title: 'C调 · ' + clefLabel(g.clef) + ' · ' + g.group
    });
  });
  Object.keys(KEY_TONIC).forEach(function (kid) {
    ['treble', 'bass'].forEach(function (clef) {
      no++;
      var k = KEYS[kid], tonicMidi = KEY_TONIC[kid][clef];
      CHAPTERS.push({
        id: kid + '-' + clef, part: k.part, no: no, keyId: kid, keyName: k.name, sig: k.sig,
        clef: clef, low: tonicMidi, high: tonicMidi + 11, ottava: null, group: '',
        rangeLabel: midiName(tonicMidi) + '–' + midiName(tonicMidi + 11),
        scale: spelledScale(tonicMidi, k.tonic),
        title: dispKeyName(k.name) + ' · ' + clefLabel(clef)
      });
    });
  });
  ['c', 'sharp', 'flat'].forEach(function (part) {
    var chapters = CHAPTERS.filter(function (ch) { return ch.part === part; });
    chapters.forEach(function (ch, i) { ch.no = i + 1; });
    var kid = part === 'c' ? 'C' : part === 'sharp' ? 'G' : 'F';
    CHAPTERS.push({ id: part + '-mixed', part: part, no: chapters.length + 1,
      mixed: true, keyId: kid, keyName: KEYS[kid].name, sig: KEYS[kid].sig,
      clef: 'treble', ottava: null, low: 48, high: 83, group: '',
      rangeLabel: '自选音域 · 默认 C3–B5', scale: poolFor(kid, 48, 83),
      title: (part === 'c' ? 'C调' : part === 'sharp' ? '升号调' : '降号调') + '综合练习' });
  });
})();

var PARTS = [
  { id: 'c', tab: '第一部分 · C调基础', desc: '覆盖 88 键全部 9 个组别，从中央 C 向两端展开' },
  { id: 'sharp', tab: '第二部分 · 升号调', desc: 'G / D / A / E / B / F♯ / C♯，按调号升高的音' },
  { id: 'flat', tab: '第三部分 · 降号调', desc: 'F / B♭ / E♭ / A♭ / D♭ / G♭ / C♭，按调号降低的音' }
];

/* ================= 谱位 / 出题 / 键盘 ================= */
var CLEF_DIA0 = { treble: diaOf('E', 4), bass: diaOf('G', 2) };

function writtenOctave(chapter, note) {
  return note.octave + (chapter.ottava ? chapter.ottava.offset / 12 : 0);
}
function posOf(chapter, note) {
  return diaOf(note.letter, writtenOctave(chapter, note)) - CLEF_DIA0[chapter.clef];
}
function writtenMidiOf(chapter, midi) {
  return midi + (chapter.ottava ? chapter.ottava.offset : 0);
}

function poolFor(kid, low, high) {
  if (low > high) return [];
  var k = KEYS[kid], out = [];
  scaleOf(k.tonic.letter, k.tonic.acc).forEach(function (n) {
    for (var oct = 0; oct <= 8; oct++) {
      var midi = letterAccToMidi(n.letter, n.acc, oct);
      if (midi >= Math.max(21, low) && midi <= Math.min(108, high))
        out.push({ letter: n.letter, acc: n.acc, octave: oct, midi: midi });
    }
  });
  return out.sort(function (a, b) { return a.midi - b.midi; });
}
function partKeys(part) {
  return Object.keys(KEYS).filter(function (kid) { return KEYS[kid].part === part; });
}
function eligibleKeys(part, low, high) {
  return partKeys(part).filter(function (kid) { return poolFor(kid, low, high).length; });
}
function pick(items, rnd) { return items[Math.min(items.length - 1, Math.floor(rnd() * items.length))]; }
function chooseKey(part, low, high, previous, rnd) {
  var keys = eligibleKeys(part, low, high);
  if (keys.length > 1) keys = keys.filter(function (k) { return k !== previous; });
  return keys.length ? pick(keys, rnd || Math.random) : null;
}
function groupOf(midi) {
  var low = Math.max(21, Math.floor(midi / 12) * 12);
  return { low: low, high: Math.min(108, Math.floor(midi / 12) * 12 + 11) };
}
function genPage(chapter, n, rnd) {
  rnd = rnd || Math.random;
  var pool = chapter.scale, out = [], prev = -1, firstGroup;
  if (!pool.length) return out;
  for (var i = 0; i < n; i++) {
    var candidates = pool.filter(function (note) { return note.midi !== prev; });
    if (!candidates.length) candidates = pool;
    if (chapter.mixed && i === 1) {
      var other = candidates.filter(function (note) { return groupOf(note.midi).low !== firstGroup; });
      if (other.length) candidates = other;
    }
    if (chapter.mixed) {
      var groups = {};
      candidates.forEach(function (note) {
        var g = groupOf(note.midi).low;
        (groups[g] || (groups[g] = [])).push(note);
      });
      candidates = groups[pick(Object.keys(groups), rnd)];
    }
    var note = pick(candidates, rnd);
    if (!i) firstGroup = groupOf(note.midi).low;
    prev = note.midi;
    out.push(note);
  }
  return out;
}
function noteOf(midi, kid) {
  var inKey = poolFor(kid, midi, midi);
  if (inKey.length) return inKey[0];
  var name = SHARP_NAME[midi % 12], letter = name[0], acc = name.length > 1 ? 1 : 0;
  if (acc && KEYS[kid].part === 'flat') {
    letter = LETTERS[(letterIdx(letter) + 1) % 7]; acc = -1;
  }
  return { letter: letter, acc: acc, octave: octaveOf(midi), midi: midi };
}
function notationFor(note) {
  var oct = note.octave, ottava = null;
  if (oct >= 7) ottava = { offset: -24, mark: '15ma' };
  else if (oct >= 6) ottava = { offset: -12, mark: '8va' };
  else if (oct <= 1) ottava = { offset: 12, mark: '8vb' };
  return { clef: oct >= 4 ? 'treble' : 'bass', ottava: ottava };
}
function notationOf(ch, note, learn) {
  return ch.mixed || (learn && (note.midi < ch.low || note.midi > ch.high)) ? notationFor(note) : ch;
}
function scoreMetrics(width, sig, preview) {
  var gap = preview ? 10 : 12;
  var start = 18 + gap * 3 + (sig ? sig.count * gap + 10 : 0) + 18;
  return { width: width, gap: gap, start: start,
    capacity: Math.max(1, Math.floor((width - start - 18) / 42)) };
}
function pageSize(mode, choice, width, sig) {
  return choice !== 'auto' ? Math.max(1, Math.min(10, Number(choice) || 1)) :
    Math.min(mode === 'timed' ? 8 : 10, scoreMetrics(width, sig).capacity);
}

/* 局部键盘 12 键视窗：起点 = min(本章最低键, 108-11)，不完整组别也保持 7 白 5 黑 */
function kbWindow(chapter) {
  var start = Math.min(chapter.low, MIDI_TOP - 11), keys = [];
  for (var m = start; m <= start + 11; m++) keys.push(m);
  return keys;
}

/* 电脑键盘映射：白键从左到右 A S D F G H J，黑键 W E T Y U */
function keyMap(chapter) {
  var keys = kbWindow(chapter), whites = [], blacks = [], map = {};
  keys.forEach(function (m) { if (isBlackMidi(m)) blacks.push(m); else whites.push(m); });
  'ASDFGHJ'.split('').forEach(function (c, i) { if (whites[i] != null) map[whites[i]] = c.toLowerCase(); });
  'WETYU'.split('').forEach(function (c, i) { if (blacks[i] != null) map[blacks[i]] = c.toLowerCase(); });
  return map;
}

function solfegeOf(chapter, note) {
  var k = KEYS[chapter.keyId], scale = scaleOf(k.tonic.letter, k.tonic.acc);
  for (var i = 0; i < scale.length; i++) {
    if (((SEMI[scale[i].letter] + scale[i].acc + 12) % 12) === note.midi % 12) return SOLFEGE[i];
  }
  return '';
}
function isTonic(kid, midi) {
  var t = KEYS[kid].tonic;
  return (SEMI[t.letter] + t.acc + 12) % 12 === midi % 12;
}

/* ================= SVG 渲染 ================= */
/* 谱号 path 定义在局部坐标：谱表底线为 y=0，向上为负；线距 12px */
/* Bravura 1.392，Copyright © 2019 Steinberg Media Technologies GmbH，SIL OFL 1.1。
   来源：https://github.com/steinbergmedia/bravura/blob/301087ca0b0d30b65d81bc3e718ff64b613e2a9a/redist/svg/Bravura.svg
   原始轮廓（仅规整空白），units-per-em=1000，每谱间250单位；许可见 vendor/bravura/OFL.txt。
   这里只绘制 SVG 图形，不发布子集字体。顺序对应 E050/E062/E0A4/E260/E261/E262。 */
var GLYPHS = {
  treble: 'M376 415l25 -145c3 -18 3 -18 29 -18c147 0 241 -113 241 -241c0 -113 -67 -198 -168 -238c-14 -6 -15 -5 -13 -17c11 -62 29 -157 29 -214c0 -170 -130 -200 -197 -200c-151 0 -190 98 -190 163c0 62 40 115 107 115c61 0 96 -47 96 -102c0 -58 -36 -85 -67 -94 c-23 -7 -32 -10 -32 -17c0 -13 26 -29 80 -29c59 0 159 18 159 166c0 47 -15 134 -27 201c-2 12 -4 11 -15 9c-20 -4 -46 -6 -69 -6c-245 0 -364 165 -364 339c0 202 153 345 297 464c12 10 11 12 9 24c-7 41 -14 106 -14 164c0 104 24 229 98 311c20 22 51 48 65 48 c11 0 37 -28 52 -50c41 -60 65 -146 65 -233c0 -153 -82 -280 -190 -381c-6 -6 -8 -7 -6 -19zM470 943c-61 0 -133 -96 -133 -252c0 -32 2 -66 6 -92c2 -13 6 -14 13 -8c79 69 174 159 174 270c0 55 -27 82 -60 82zM361 262l-21 128c-2 11 -4 12 -14 4 c-47 -38 -93 -75 -153 -142c-83 -94 -93 -173 -93 -232c0 -139 113 -236 288 -236c20 0 40 2 56 5c15 3 16 3 14 14l-50 298c-2 11 -4 12 -20 8c-61 -17 -100 -60 -100 -117c0 -46 30 -89 72 -107c7 -3 15 -6 15 -13c0 -6 -4 -11 -12 -11c-7 0 -19 3 -27 6 c-68 23 -115 87 -115 177c0 85 57 164 145 194c18 6 18 5 15 24zM430 103l49 -285c2 -12 4 -12 16 -6c56 28 94 79 94 142c0 88 -67 156 -148 163c-12 1 -13 -2 -11 -14z',
  bass: 'M252 262c173 0 279 -116 279 -290c0 -304 -260 -482 -506 -602c-6 -3 -12 -5 -17 -5c-9 0 -13 6 -13 12c0 8 6 13 15 18c233 133 371 289 371 568c0 157 -46 261 -152 261c-102 0 -162 -73 -162 -113c0 -10 3 -18 16 -18s23 7 50 7c49 0 96 -40 96 -104 c0 -62 -43 -106 -106 -106c-81 0 -123 69 -123 149c0 96 78 223 252 223zM629 180c31 0 55 -24 55 -55s-24 -55 -55 -55s-55 24 -55 55s24 55 55 55zM630 -71c31 0 54 -23 54 -54s-23 -54 -54 -54s-54 23 -54 54s23 54 54 54z',
  head: 'M97 -125c-54 0 -97 31 -97 83c0 86 88 167 198 167c57 0 97 -32 97 -83c0 -85 -109 -167 -198 -167z',
  flat: 'M12 -170c-8 10 -12 581 -12 581c1 18 17 28 31 28c10 0 19 -6 19 -17c0 -20 -6 -260 -7 -282c0 -7 4 -14 11 -17c2 -1 3 -1 5 -1c5 0 16 9 22 14c14 9 38 17 55 17c46 -3 90 -39 90 -96c0 -46 -31 -107 -120 -169c-25 -17 -49 -44 -79 -61c0 0 -3 -2 -6 -2s-6 1 -9 5z M47 -81c0 -5 2 -15 11 -15c3 0 6 1 10 3c43 27 89 81 89 135c0 25 -12 58 -41 58c-23 0 -63 -29 -70 -49c-1 -4 -2 -16 -2 -32c0 -40 3 -100 3 -100z',
  natural: 'M141 181l15 5c1 1 3 1 4 1c4 0 8 -3 8 -8v-502c0 -7 -6 -12 -12 -12h-13c-7 0 -12 5 -12 12v149c0 8 -7 11 -17 11c-29 0 -85 -24 -99 -30c-1 -1 -3 -1 -4 -1l-2 -1c-6 0 -9 3 -9 9v515c0 7 5 12 12 12h13c6 0 12 -5 12 -12v-167c0 -4 4 -5 10 -5c26 0 90 23 90 23 c1 0 2 1 4 1zM37 39v-103c0 -4 5 -6 12 -6c25 0 82 23 82 41v103c0 4 -3 5 -9 5c-24 0 -85 -26 -85 -40z',
  sharp: 'M237 118l-26 -10c-8 -3 -13 -22 -13 -29v-93c0 -12 7 -18 13 -18l26 10c2 1 3 1 5 1c4 0 7 -3 7 -8v-71c0 -6 -5 -14 -12 -17c0 0 -21 -8 -28 -11s-11 -15 -11 -23v-142c0 -6 -6 -11 -17 -11c-7 0 -13 5 -13 11v125c0 6 -5 18 -14 18l-2 -1h-1l-61 -25 c-5 -2 -10 -9 -10 -22v-139c0 -6 -7 -11 -17 -11c-7 0 -13 5 -13 11v123c0 5 -5 16 -12 16c-1 0 -2 0 -3 -1c-9 -3 -23 -9 -24 -9l-2 -1c-6 0 -9 3 -9 9v71c0 6 5 14 12 16c0 0 21 9 27 11c6 3 11 12 11 23v99c0 8 -6 18 -14 18l-1 -1c-8 -4 -23 -10 -24 -10l-2 -1 c-6 0 -9 3 -9 9v71c0 6 5 14 12 16c0 0 20 8 26 11s12 13 12 27v135c0 6 6 11 16 11c7 0 14 -5 14 -11v-120c0 -8 3 -20 12 -20c17 4 51 18 63 25c9 6 12 19 13 29v130c0 6 6 11 16 11c8 0 14 -5 14 -11v-122c0 -8 7 -13 14 -13c5 1 25 9 25 9c2 1 3 1 5 1c4 0 7 -3 7 -8 v-71c0 -6 -5 -14 -12 -17zM168 -45c2 9 4 37 4 64s-2 52 -4 57c-2 4 -8 6 -15 6c-25 0 -71 -21 -73 -38c-2 -8 -3 -43 -3 -74c0 -24 1 -46 3 -50c1 -3 6 -5 12 -5c23 0 70 20 76 40z'
};
function glyph(name, x, y, gap) {
  var scale = gap / 250;
  return '<path class="music-glyph glyph-' + name + '" transform="translate(' + x + ',' + y + ') scale(' + scale + ',' + (-scale) + ')" d="' + GLYPHS[name] + '"/>';
}

/* 调号升降号的标准字位（音级 dia 值） */
var SIG_POS = {
  sharp: { treble: [38, 35, 39, 36, 33, 37, 34], bass: [24, 21, 25, 22, 19, 23, 20] },
  flat:  { treble: [34, 37, 33, 36, 32, 35, 31], bass: [20, 23, 19, 22, 18, 21, 17] }
};

function line(cls, x1, y1, x2, y2) {
  return '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
}
function noteName(note) { return note.letter + accText(note.acc) + note.octave; }
function accidentalOf(kid, note) {
  var k = KEYS[kid], spell = scaleOf(k.tonic.letter, k.tonic.acc);
  var expected = spell.filter(function (n) { return n.letter === note.letter; })[0].acc;
  return expected === note.acc ? null : note.acc === 0 ? 'natural' : note.acc > 0 ? 'sharp' : 'flat';
}
/* 每系统独立计算上下边界；实际宽度决定列数，固定题量不会被缩小或删减。 */
function scoreSVG(chapter, notes, o) {
  o = o || {};
  var W = o.width || 720, metrics = scoreMetrics(W, chapter.sig, o.preview);
  var gap = metrics.gap, capacity = metrics.capacity, html = '', H = 8;
  var grand = chapter.mixed;
  var count = Math.max(1, Math.ceil(notes.length / capacity));
  for (var row = 0; row < count; row++) {
    var chunk = notes.slice(row * capacity, (row + 1) * capacity);
    var clefs = grand ? ['treble', 'bass'] : [chunk.length ? notationOf(chapter, chunk[0], o.label).clef : chapter.clef];
    var rows = [], system = '';
    clefs.forEach(function (clef) {
      var top = -6 * gap, bottom = 2 * gap, items = [];
      chunk.forEach(function (note, col) {
        var nt = notationOf(chapter, note, o.label);
        if (nt.clef !== clef) return;
        var pos = posOf(nt, note), y = -pos * gap / 2, stem = y + (pos < 4 ? -3 : 3) * gap;
        var upper = Math.min(y - 14, stem - 2), lower = Math.max(y + 14, stem + 2);
        var oy = null;
        if (nt.ottava) {
          oy = nt.ottava.offset < 0 ? Math.min(-4 * gap, upper) - 14 : Math.max(0, lower) + 14;
          upper = Math.min(upper, oy - 15); lower = Math.max(lower, oy + 10);
        }
        top = Math.min(top, upper); bottom = Math.max(bottom, lower);
        items.push({ note: note, nt: nt, pos: pos, y: y, stem: stem, oy: oy, col: col });
      });
      var base = H - top;
      for (var j = 0; j < 5; j++) system += line('staff-line', 10, base - j * gap, W - 10, base - j * gap);
      system += glyph(clef, 18, base - (clef === 'treble' ? 1 : 3) * gap, gap);
      if (chapter.sig) {
        var positions = SIG_POS[chapter.sig.type][clef];
        for (var k = 0; k < chapter.sig.count; k++)
          system += glyph(chapter.sig.type, 18 + gap * 3 + k * gap,
            base - (positions[k] - CLEF_DIA0[clef]) * gap / 2, gap);
      }
      items.forEach(function (item) {
        var idx = row * capacity + item.col, x = metrics.start + (item.col + 0.5) * (W - metrics.start - 18) / Math.max(1, chunk.length);
        var y = base + item.y, p = item.pos, half = gap * 295 / 500;
        var cls = 'note-g' + (o.done && o.done[idx] ? ' done' : '') + (o.shakeIdx === idx ? ' shake' : '');
        system += '<g class="' + cls + '" data-idx="' + idx + '" data-clef="' + clef + '">';
        for (var lp = -2; lp >= p; lp -= 2) system += line('ledger', x - 11, base - lp * gap / 2, x + 11, base - lp * gap / 2);
        for (var up = 10; up <= p; up += 2) system += line('ledger', x - 11, base - up * gap / 2, x + 11, base - up * gap / 2);
        var sx = x + (p < 4 ? half - 0.6 : -half + 0.6);
        system += line('stem', sx, y, sx, base + item.stem);
        system += glyph('head', x - half, y, gap);
        var acc = o.label && accidentalOf(chapter.keyId, item.note);
        if (acc) system += glyph(acc, x - half - 15, y, gap);
        if (o.targetIdx === idx) system += '<circle class="target-ring" cx="' + x + '" cy="' + y + '" r="14"/>';
        if (item.oy !== null) {
          var oy = base + item.oy;
          system += '<g class="ottava-column" data-column="' + idx + '"><text class="ottava-mark" x="' + (x - 17) + '" y="' + (oy - 4) + '">' + item.nt.ottava.mark + '</text>';
          system += '<path class="ottava-line" d="M ' + (x - 17) + ' ' + oy + ' H ' + (x + 18) + ' l 0 ' + (item.nt.ottava.offset < 0 ? 5 : -5) + '"/></g>';
        }
        system += '</g>';
      });
      rows.push(base); H = base + bottom + 12;
    });
    if (grand) system += line('staff-line', 10, rows[0] - 4 * gap, 10, rows[1]);
    html += '<g class="staff-system" data-system="' + row + '">' + system + '</g>';
    H += 10;
  }
  if (o.label && notes.length) {
    var n = notes[0], notation = notationOf(chapter, n, true);
    html += '<text class="note-label" x="' + W / 2 + '" y="' + (H + 8) + '">' + noteName(n) + ' · ' + (solfegeOf(chapter, n) || '调外音') + '</text>';
    H += 26;
    if (notation.ottava) {
      html += '<text class="note-label-sub" x="' + W / 2 + '" y="' + (H + 2) + '">记谱 ' + n.letter + accText(n.acc) + writtenOctave(notation, n) + ' → 实音 ' + noteName(n) + '</text>';
      H += 20;
    }
  }
  return '<svg class="score-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (grand ? '高低音大谱表，依次单音作答' : '五线谱') + '">' + html + '</svg>';
}

/* 88 键总览 */
function kb88SVG(chapter, view, range, hints) {
  view = view || chapter; range = range || chapter;
  var WW = 13, WH = 64, BW = 8, BH = 38, whites = [], blacks = [], wCount = 0;
  for (var m = MIDI_BOTTOM; m <= MIDI_TOP; m++) {
    if (isBlackMidi(m)) blacks.push({ m: m, x: wCount * WW - BW / 2, w: BW, h: BH });
    else { whites.push({ m: m, x: wCount * WW, w: WW, h: WH }); wCount++; }
  }
  var all = whites.concat(blacks), s = '', rangeKeys = all.filter(function (k) { return k.m >= range.low && k.m <= range.high; });
  if (rangeKeys.length) {
    var left = Math.min.apply(null, rangeKeys.map(function (k) { return k.x; }));
    var right = Math.max.apply(null, rangeKeys.map(function (k) { return k.x + k.w; }));
    s += '<rect class="range-bar" x="' + left + '" y="1" width="' + (right - left) + '" height="5"/>';
  }
  all.forEach(function (k) {
    var inView = k.m >= view.low && k.m <= view.high;
    s += '<g data-overview-m="' + k.m + '"><title>' + midiName(k.m) + ' · 点击选择' + groupNameOf(k.m) + '</title>';
    s += '<rect class="' + (isBlackMidi(k.m) ? 'kbb' : 'kbw') + (inView ? ' hl' : '') + '" x="' + k.x + '" y="10" width="' + k.w + '" height="' + k.h + '" rx="1.5"/>';
    if (k.m % 12 === 0) s += '<text class="kb88-c" x="' + (k.x + k.w / 2) + '" y="71" text-anchor="middle">C' + octaveOf(k.m) + '</text>';
    if (hints !== false && isTonic(chapter.keyId, k.m)) s += '<circle class="tonic-dot" cx="' + (k.x + k.w / 2) + '" cy="' + (k.h - 2) + '" r="2.4"/>';
    s += '</g>';
  });
  return '<svg class="kb88-svg" viewBox="-1 0 ' + (wCount * WW + 2) + ' 76" role="img" aria-label="88键音域导航，下方组别按钮也可选择">' + s + '</svg>';
}

/* 局部键盘（12 键视窗） */
function keyboardGeometry(view, width) {
  var keys = kbWindow(view), WW = 62, BW = 38, wCount = 0, whites = [], blacks = [];
  keys.forEach(function (m) {
    if (isBlackMidi(m)) blacks.push({ m: m, x: wCount * WW - BW / 2, w: BW });
    else { whites.push({ m: m, x: wCount * WW, w: WW }); wCount++; }
  });
  var left = Math.min(0, blacks[0].x), right = Math.max(wCount * WW, blacks[blacks.length - 1].x + BW);
  var W = right - left + 2, H = Math.max(220, Math.min(330, 170 * W / (width || W)));
  return { whites: whites, blacks: blacks, left: left - 1, width: W, height: H };
}
function kbLocalSVG(chapter, view, options, width) {
  view = view || chapter; options = options || { label: 'name', mapping: true, hints: true };
  var geo = keyboardGeometry(view, width), s = '', map = keyMap(view);
  geo.whites.concat(geo.blacks).forEach(function (k) {
    var black = isBlackMidi(k.m), h = black ? geo.height * 0.62 : geo.height;
    var enabled = k.m >= view.low && k.m <= view.high, tonic = isTonic(chapter.keyId, k.m);
    var cls = 'key ' + (black ? 'key-b' : 'key-w') + (enabled ? '' : ' disabled') + (tonic ? ' tonic-key' : '');
    var n = noteOf(k.m, chapter.keyId), sol = solfegeOf(chapter, n), cx = k.x + k.w / 2;
    s += '<g class="' + cls + '" data-m="' + k.m + '" role="button" aria-label="' + noteName(n) + '" aria-disabled="' + !enabled + '" tabindex="' + (enabled ? '0' : '-1') + '">';
    s += '<rect class="' + (black ? 'kbb' : 'kbw') + '" x="' + k.x + '" y="0" width="' + k.w + '" height="' + h + '" rx="3"/>';
    /* 白键提示放在黑键下沿以下，避免被相邻黑键遮住。 */
    var hintY = black ? 13 : geo.height * 0.62 + 6;
    if (options.hints && sol) s += '<circle class="scale-dot" cx="' + cx + '" cy="' + hintY + '" r="2.6"/>';
    if (options.hints && tonic) s += '<text class="tonic-tag" x="' + cx + '" y="' + (hintY + 16) + '" text-anchor="middle">主音</text>';
    if (options.label !== 'off') s += '<text class="' + (options.label === 'sol' ? 'kb-sol' : 'kb-name') + '" x="' + cx + '" y="' + (h - 35) + '" text-anchor="middle">' + (options.label === 'sol' ? sol : noteName(n)) + '</text>';
    if (options.mapping) s += '<text class="kb-map" x="' + cx + '" y="' + (h - 12) + '" text-anchor="middle">' + map[k.m].toUpperCase() + '</text>';
    s += '</g>';
  });
  return '<svg class="kb-local-svg" viewBox="' + geo.left + ' -1 ' + geo.width + ' ' + (geo.height + 2) + '" aria-label="局部钢琴键盘">' + s + '</svg>';
}

/* ================= 音频（Web Audio 合成） ================= */
var actx = null, master = null, volume = 0.7;
function ensureAudio() {
  try {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = volume;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
    return true;
  } catch (e) { return false; }
}
function playNote(midi) {
  if (!ensureAudio()) return;
  var t = actx.currentTime, f = 440 * Math.pow(2, (midi - 69) / 12);
  var g = actx.createGain(); g.connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.85, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  var lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.connect(g);
  [[1, 1, 'sine'], [2, 0.35, 'triangle'], [3, 0.12, 'sine']].forEach(function (h) {
    var o = actx.createOscillator(), og = actx.createGain();
    o.type = h[2]; o.frequency.value = f * h[0]; og.gain.value = h[1];
    o.connect(og); og.connect(lp); o.start(t); o.stop(t + 1.5);
  });
}
function playError() {
  if (!ensureAudio()) return;
  var t = actx.currentTime;
  var o = actx.createOscillator(), g = actx.createGain();
  o.type = 'triangle'; o.frequency.value = 140;
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.18);
}

/* ================= 状态与流程 ================= */
var TIMED_SECONDS = 60;
var state = {
  ch: null, mode: 'learn', keyId: 'C', previousKey: null, range: null, view: null,
  page: [], targetIdx: 0, done: [], pageIndex: 1, score: 0, correct: 0, wrong: 0,
  timedEnd: 0, timerId: null, timedRunning: false, runConfig: null,
  flipId: null, generation: 0, runSize: 0, held: {}
};
function $(id) { return document.getElementById(id); }
function store() {
  try { return window.localStorage; } catch (e) { return null; }
}
/* 存储拒绝或配额耗尽时，本次会话仍保留偏好与成绩。 */
function safeStorage(storage) {
  var memory = {};
  return {
    read: function (key) {
      if (Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
      try {
        var value = JSON.parse(storage ? storage.getItem(key) : 'null');
        return memory[key] = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch (e) { return memory[key] = {}; }
    },
    write: function (key, value) {
      memory[key] = value;
      try { if (storage) storage.setItem(key, JSON.stringify(value)); } catch (e) { /* 内存已保存 */ }
    }
  };
}
var storage = safeStorage(store());
function normalizePrefs(p) {
  function count(v) { return /^[1-9]$|^10$/.test(String(v)) ? String(v) : 'auto'; }
  function midi(v, fallback) { return Number.isInteger(v) && v >= 21 && v <= 108 ? v : fallback; }
  var low = midi(p.low, 48), high = midi(p.high, 83);
  if (low > high) { low = 48; high = 83; }
  return { label: ['name', 'sol', 'off'].indexOf(p.label) >= 0 ? p.label : 'name',
    mapping: p.mapping !== false, hints: p.hints !== false,
    freeCount: count(p.freeCount), timedCount: count(p.timedCount), low: low, high: high };
}
var prefs = normalizePrefs(storage.read('ee-sightreading-prefs'));
function savePrefs() { storage.write('ee-sightreading-prefs', prefs); }
function getBests() { return storage.read('ee-sightreading-best-v2'); }
function configKey(config) {
  return [config.id, config.low, config.high, config.size, config.label, +config.mapping, +config.hints].join('|');
}
function configForRun(size) {
  return { id: state.ch.id, low: state.range.low, high: state.range.high, size: size,
    label: prefs.label, mapping: prefs.mapping, hints: prefs.hints };
}
function configText(c) {
  return midiName(c.low) + '–' + midiName(c.high) + ' · 每页' + c.size + '音 · ' +
    ({ name: '音名', sol: '唱名', off: '无标注' })[c.label] + ' · 字母' + (c.mapping ? '开' : '关') + ' · 提示' + (c.hints ? '开' : '关');
}
function setBest(config, score) {
  var b = getBests(), key = configKey(config);
  if (score > (Number.isFinite(b[key]) ? b[key] : 0)) { b[key] = score; storage.write('ee-sightreading-best-v2', b); return true; }
  return false;
}
function cancelFlip() {
  state.generation++;
  if (state.flipId !== null) clearTimeout(state.flipId);
  state.flipId = null;
}
function scheduleFlip() {
  cancelFlip();
  var generation = state.generation;
  state.flipId = setTimeout(function () {
    if (generation !== state.generation || !state.ch || state.mode !== 'free') return;
    state.flipId = null; state.pageIndex++; newPage();
  }, 450);
}
function stopTimed() {
  cancelFlip();
  if (state.timerId !== null) clearInterval(state.timerId);
  state.timerId = null; state.timedRunning = false;
}
function currentChapter() {
  return Object.assign({}, state.ch, { keyId: state.keyId, sig: KEYS[state.keyId].sig,
    keyName: KEYS[state.keyId].name, scale: poolFor(state.keyId, state.range.low, state.range.high) });
}
function scoreWidth() { return Math.max(180, $('scoreBox').getBoundingClientRect().width || 720); }
function newPage() {
  cancelFlip();
  if (state.ch.mixed) {
    var next = chooseKey(state.ch.part, state.range.low, state.range.high, state.previousKey);
    if (!next) { state.page = []; state.done = []; state.targetIdx = 0; renderScore(); syncControls(); return false; }
    state.keyId = next; state.previousKey = next;
  }
  var ch = currentChapter(), choice = state.mode === 'timed' ? prefs.timedCount : prefs.freeCount;
  var n = state.timedRunning ? state.runSize : pageSize(state.mode, choice, scoreWidth(), ch.sig);
  state.page = genPage(ch, n); state.targetIdx = 0;
  state.done = state.page.map(function () { return false; });
  renderScore(); renderOverview(); renderLocal(); syncControls();
  return !!state.page.length;
}
function renderScore() {
  var o = { width: scoreWidth(), label: state.mode === 'learn' && state.page.length > 0 };
  if (state.mode !== 'learn') { o.done = state.done; o.targetIdx = state.targetIdx; }
  $('scoreBox').innerHTML = scoreSVG(currentChapter(), state.page, o);
  $('chBadges').textContent = (state.ch.mixed ? '高低音大谱表 · ' : '') + dispKeyName(KEYS[state.keyId].name) +
    ' · 出题区间 ' + midiName(state.range.low) + '–' + midiName(state.range.high);
  updateStatus();
}

function updateStatus() {
  var el = $('modeStatus');
  if (state.mode === 'learn') {
    el.textContent = '学习模式 · 按键即显示对应音符';
  } else if (state.mode === 'free') {
    var done = state.done.filter(function (d) { return d; }).length;
    el.textContent = '自由测验 · 第 ' + state.pageIndex + ' 页 · ' + done + '/' + state.page.length + ' · 累计正确 ' + state.correct + ' / 错误 ' + state.wrong;
  } else {
    var left = state.timedRunning ? Math.max(0, Math.ceil((state.timedEnd - Date.now()) / 1000)) : TIMED_SECONDS;
    el.textContent = '限时挑战 · 得分 ' + state.score + ' · 剩余 ' + left + ' 秒';
  }
}

function setMode(mode) {
  stopTimed(); releaseAll(); closeLabels(false);
  $('startOverlay').hidden = true; $('resultOverlay').hidden = true;
  state.mode = mode; state.previousKey = null;
  state.pageIndex = 1; state.score = 0; state.correct = 0; state.wrong = 0;
  state.page = []; state.done = []; state.targetIdx = 0;
  if (mode === 'learn') state.keyId = state.ch.keyId;
  ['learn', 'free', 'timed'].forEach(function (m) {
    var b = $('mode-' + m);
    b.classList.toggle('active', m === mode); b.setAttribute('aria-pressed', String(m === mode));
  });
  if (mode === 'free') newPage();
  else { renderScore(); renderOverview(); renderLocal(); }
  syncControls();
}
function requestTimed() {
  if (!validPool()) return;
  closeLabels(false);
  $('startConfig').textContent = configText(configForRun(plannedSize()));
  $('startOverlay').hidden = false; $('btnTimedStart').focus();
}
function plannedSize() {
  /* 综合挑战按最多的有效调号预留空间，局内题量固定。 */
  var sig = KEYS[state.keyId].sig;
  if (state.ch.mixed) {
    var keys = eligibleKeys(state.ch.part, state.range.low, state.range.high);
    var count = Math.max.apply(null, keys.map(function (k) { return KEYS[k].sig ? KEYS[k].sig.count : 0; }));
    sig = { count: Math.max(0, count) };
  }
  return pageSize('timed', prefs.timedCount, scoreWidth(), sig);
}
function startTimed() {
  if (!validPool()) return;
  stopTimed(); releaseAll();
  $('startOverlay').hidden = true; $('resultOverlay').hidden = true;
  state.score = 0; state.correct = 0; state.wrong = 0; state.pageIndex = 1; state.previousKey = null;
  state.runSize = plannedSize(); state.runConfig = configForRun(state.runSize);
  state.timedEnd = Date.now() + TIMED_SECONDS * 1000; state.timedRunning = true;
  newPage(); syncControls(); $('mode-timed').focus();
  state.timerId = setInterval(function () {
    if (Date.now() >= state.timedEnd) endTimed(); else updateStatus();
  }, 200);
}
function endTimed() {
  if (!state.timedRunning) return;
  stopTimed(); releaseAll(); state.page = [];
  renderScore(); syncControls();
  var record = setBest(state.runConfig, state.correct), total = state.correct + state.wrong;
  $('resultTitle').textContent = record ? '新纪录！' : '时间到';
  $('resultScore').textContent = state.correct + ' 分';
  $('resultAcc').textContent = '正确率 ' + (total ? Math.round(state.correct / total * 100) : 0) + '%（按对 ' + state.correct + ' / 按错 ' + state.wrong + '）';
  $('resultConfig').textContent = configText(state.runConfig);
  $('resultBest').textContent = '同配置最佳：' + (getBests()[configKey(state.runConfig)] || 0) + ' 分';
  $('resultOverlay').hidden = false; $('btnAgain').focus();
}
function markPressed(midi, pressed) {
  var g = $('kbLocalBox').querySelector('.key[data-m="' + midi + '"]');
  if (g) g.classList.toggle('pressed', pressed !== false);
}
function releaseAll() {
  state.held = {};
  if (typeof document !== 'undefined') document.querySelectorAll('.key.pressed').forEach(function (g) { g.classList.remove('pressed'); });
}
function holdKey(source, midi) {
  if (Object.prototype.hasOwnProperty.call(state.held, source)) return;
  var alreadyHeld = Object.keys(state.held).some(function (k) { return state.held[k] === midi; });
  state.held[source] = midi;
  if (!alreadyHeld) pressKey(midi);
}
function releaseKey(source) {
  var midi = state.held[source]; delete state.held[source];
  if (!Object.keys(state.held).some(function (k) { return state.held[k] === midi; })) markPressed(midi, false);
}

function pressKey(midi) {
  if (!state.ch) return;
  /* 截止判定先于音符匹配，后台节流不能延长计分窗口。 */
  if (state.timedRunning && Date.now() >= state.timedEnd) { endTimed(); return; }
  if (!$('startOverlay').hidden || !$('resultOverlay').hidden) return;
  if (midi < state.view.low || midi > state.view.high || kbWindow(state.view).indexOf(midi) < 0) return;
  playNote(midi); markPressed(midi);
  if (state.mode === 'learn') {
    state.page = [noteOf(midi, state.keyId)]; renderScore(); return;
  }
  if (state.mode === 'timed' && !state.timedRunning) return;
  var target = state.page[state.targetIdx];
  if (!target) return;
  if (midi === target.midi) {
    state.done[state.targetIdx] = true;
    state.targetIdx++;
    state.correct++;
    if (state.mode === 'timed') state.score = state.correct;
    if (state.targetIdx >= state.page.length) {
      if (state.mode === 'free') {
        renderScore();
        scheduleFlip();
        return;
      }
      newPage();  /* 限时：立即下一页 */
      return;
    }
    renderScore();
  } else {
    state.wrong++;
    playError();
    renderScore();
    var idx = state.targetIdx;
    var g = $('scoreBox').querySelector('.note-g[data-idx="' + idx + '"]');
    if (g) {
      g.classList.add('shake');
      setTimeout(function () { if (g.parentNode) g.classList.remove('shake'); }, 350);
    }
  }
}

function validPool() {
  return state.ch.mixed ? eligibleKeys(state.ch.part, state.range.low, state.range.high).length > 0 : true;
}
function syncControls() {
  var locked = state.timedRunning, mixed = !!state.ch.mixed;
  $('rangeControls').hidden = !mixed;
  $('learnKeyItem').hidden = !mixed || state.mode !== 'learn';
  $('pageCount').disabled = locked || state.mode === 'learn';
  $('pageCount').value = state.mode === 'timed' ? prefs.timedCount : prefs.freeCount;
  $('labelFields').disabled = locked;
  ['rangeLow', 'rangeHigh', 'rangeCentral', 'rangeFull', 'learnKey'].forEach(function (id) { $(id).disabled = locked; });
  $('rangeLow').value = prefs.low; $('rangeHigh').value = prefs.high;
  $('learnKey').value = state.keyId;
  $('btnChallenge').hidden = state.mode !== 'timed';
  $('btnChallenge').textContent = locked ? '取消本局' : '开始挑战';
  $('btnChallenge').disabled = !validPool();
  $('btnRegen').disabled = state.mode === 'learn' || (state.mode === 'timed' && !locked) || !validPool();
  var pool = currentChapter().scale, groups = {};
  pool.forEach(function (n) { groups[groupOf(n.midi).low] = true; });
  $('rangeMessage').textContent = !validPool() ? '此区间在本部分没有调内音，请调整区间。' :
    pool.length === 1 ? '本页调号在区间内只有一个音，允许重复。' :
    Object.keys(groups).length === 1 ? '本页调号在区间内仅含一个组，按单组练习。' :
    '同页跨组，每页一调；请手动选择键盘组别，选区不提示答案。';
}
function changeRange(low, high) {
  if (state.timedRunning) return;
  if (low > high) { $('rangeMessage').textContent = '最低音不能高于最高音。'; $('rangeLow').value = prefs.low; $('rangeHigh').value = prefs.high; return; }
  cancelFlip(); prefs.low = low; prefs.high = high; savePrefs();
  state.range = { low: low, high: high }; state.view = defaultView();
  if (state.mode === 'free') newPage();
  else { state.page = []; renderScore(); }
  renderOverview(); renderLocal(); syncControls();
}
function defaultView() {
  if (!state.ch.mixed) return { low: state.ch.low, high: state.ch.high };
  return groupOf(Math.max(state.range.low, Math.min(60, state.range.high)));
}
function canSelect(view) {
  return !state.ch.mixed || view.high >= state.range.low && view.low <= state.range.high;
}
function selectView(view) {
  if (!canSelect(view)) return;
  state.view = { low: view.low, high: view.high };
  renderOverview(); renderLocal();
}
function closeLabels(focus) {
  $('labelPanel').hidden = true; $('labelToggle').setAttribute('aria-expanded', 'false');
  if (focus) $('labelToggle').focus();
}

/* ================= 视图 ================= */
function chapterById(id) {
  for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return CHAPTERS[i];
  return null;
}

function badgeList(ch) {
  var b = [];
  b.push(ch.clef === 'treble' ? '高音谱号' : '低音谱号');
  var k = dispKeyName(ch.keyName);
  if (ch.sig) k += ' · ' + (ch.sig.type === 'sharp' ? '♯'.repeat(ch.sig.count) : '♭'.repeat(ch.sig.count));
  b.push(k);
  b.push(ch.group ? ch.group + ' · ' + ch.rangeLabel : ch.rangeLabel + '（大致' + groupNameOf(ch.low) + '~' + groupNameOf(ch.high) + '）');
  if (ch.ottava) b.push('记谱 ' + midiName(writtenMidiOf(ch, ch.low)) + '–' + midiName(writtenMidiOf(ch, ch.high)) + ' · ' + ch.ottava.mark);
  return b;
}

function previewNotes(ch) { return [ch.scale[Math.floor(ch.scale.length / 2)]]; }
function bestText(ch) {
  var bests = getBests(), values = Object.keys(bests).filter(function (k) { return k.split('|')[0] === ch.id; }).map(function (k) { return bests[k]; }).filter(Number.isFinite);
  var legacy = storage.read('ee-sightreading-best')[ch.id];
  return (values.length ? '历史最高（跨配置） ' + Math.max.apply(null, values) + ' 分' : '暂无新版限时成绩') +
    (Number.isFinite(legacy) ? ' · 旧版最佳 ' + legacy + ' 分' : '');
}

function buildCards() {
  PARTS.forEach(function (part) {
    var track = $('track-' + part.id);
    var html = '';
    CHAPTERS.filter(function (c) { return c.part === part.id; }).forEach(function (ch) {
      html += '<button type="button" class="chapter-card" data-ch="' + ch.id + '" aria-label="进入' + ch.title + '">';
      html += '<span class="ch-no">第 ' + ch.no + ' 章</span>';
      html += '<span class="ch-preview">' + scoreSVG(ch, previewNotes(ch), { width: 200, preview: true }) + '</span>';
      html += '<span class="ch-title">' + ch.title + '</span>';
      html += '<span class="ch-range">' + ch.rangeLabel + (ch.ottava ? ' <span class="ch-badge">' + ch.ottava.mark + '</span>' : '') + '</span>';
      html += '<span class="ch-best">' + bestText(ch) + '</span>';
      html += '</button>';
    });
    track.innerHTML = html;
  });
}

function refreshBests() {
  CHAPTERS.forEach(function (ch) {
    var card = document.querySelector('.chapter-card[data-ch="' + ch.id + '"]');
    if (!card) return;
    var el = card.querySelector('.ch-best');
    if (el) el.textContent = bestText(ch);
  });
}

function showSelect() {
  stopTimed(); releaseAll(); closeLabels(false);
  $('startOverlay').hidden = true; $('resultOverlay').hidden = true;
  var previous = state.ch;
  state.ch = null; $('practiceView').hidden = true; $('selectView').hidden = false;
  refreshBests();
  if (previous) document.querySelector('[data-ch="' + previous.id + '"]').focus();
}
function openChapter(ch) {
  stopTimed(); state.ch = ch; state.keyId = ch.keyId;
  state.range = ch.mixed ? { low: prefs.low, high: prefs.high } : { low: ch.low, high: ch.high };
  state.view = defaultView();
  $('selectView').hidden = true; $('practiceView').hidden = false;
  $('chTitle').textContent = '第 ' + ch.no + ' 章 · ' + ch.title;
  $('learnKey').innerHTML = partKeys(ch.part).map(function (kid) { return '<option value="' + kid + '">' + dispKeyName(KEYS[kid].name) + '</option>'; }).join('');
  setMode('learn'); $('btnBack').focus();
}
function renderOverview() {
  $('kb88Box').innerHTML = kb88SVG(currentChapter(), state.view, state.range, prefs.hints);
  $('viewLabel').textContent = '当前键盘：' + midiName(state.view.low) + '–' + midiName(state.view.high);
  $('groupButtons').innerHTML = C_GROUPS.slice().sort(function (a, b) { return a.low - b.low; }).map(function (g) {
    return '<button class="btn group-btn" type="button" data-group="' + g.low + '" aria-pressed="' + (state.view.low === g.low && state.view.high === g.high) + '"' + (canSelect(g) ? '' : ' disabled') + '>' + g.group + '</button>';
  }).join('');
}
function renderLocal() {
  var box = $('kbLocalBox'), focus = box.contains(document.activeElement) ? document.activeElement.getAttribute('data-m') : null;
  box.innerHTML = kbLocalSVG(currentChapter(), state.view, prefs, box.clientWidth);
  Object.keys(state.held).forEach(function (source) { markPressed(state.held[source]); });
  if (focus) {
    var key = box.querySelector('[data-m="' + focus + '"]');
    if (key) key.focus();
  }
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  /* Tab 切换（方向键支持，同 24point） */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.sr-tab'));
  function activateTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { activateTab(tab); });
    tab.addEventListener('keydown', function (e) {
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      activateTab(tabs[(i + dir + tabs.length) % tabs.length]);
    });
  });

  /* 横滑箭头 */
  document.querySelectorAll('.ch-arrow').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var track = $(btn.getAttribute('data-track'));
      track.scrollBy({ left: 260 * Number(btn.getAttribute('data-dir')), behavior: 'smooth' });
    });
  });

  /* 章节卡进入 */
  document.querySelectorAll('.chapter-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var ch = chapterById(card.getAttribute('data-ch'));
      if (ch) openChapter(ch);
    });
  });

  $('btnBack').addEventListener('click', showSelect);
  $('mode-learn').addEventListener('click', function () { setMode('learn'); });
  $('mode-free').addEventListener('click', function () { setMode('free'); });
  $('mode-timed').addEventListener('click', function () { setMode('timed'); });
  $('btnTimedStart').addEventListener('click', startTimed);
  $('btnAgain').addEventListener('click', function () {
    $('resultOverlay').hidden = true;
    startTimed();
  });
  $('btnBack2').addEventListener('click', showSelect);
  $('btnRegen').addEventListener('click', function () {
    if (state.mode === 'learn') return;
    if (state.mode === 'timed' && !state.timedRunning) return;
    newPage();
  });
  $('volume').addEventListener('input', function () {
    volume = Number(this.value) / 100;
    if (master) master.gain.value = volume;
  });
  $('btnChallenge').addEventListener('click', function () {
    if (state.timedRunning) setMode('timed'); else requestTimed();
  });
  $('btnStartCancel').addEventListener('click', function () { $('startOverlay').hidden = true; $('btnChallenge').focus(); });
  $('btnResultClose').addEventListener('click', function () { $('resultOverlay').hidden = true; $('btnChallenge').focus(); });
  $('labelToggle').addEventListener('click', function () {
    var opening = $('labelPanel').hidden;
    $('labelPanel').hidden = !opening; this.setAttribute('aria-expanded', String(opening));
  });
  $('labelFields').addEventListener('change', function () {
    if (state.timedRunning) return;
    prefs.label = document.querySelector('input[name="keyLabel"]:checked').value;
    prefs.mapping = $('showMapping').checked; prefs.hints = $('showHints').checked;
    if (state.flipId !== null) scheduleFlip();
    savePrefs(); renderLocal(); renderOverview();
  });
  $('pageCount').addEventListener('change', function () {
    if (state.timedRunning || state.mode === 'learn') return;
    prefs[state.mode === 'timed' ? 'timedCount' : 'freeCount'] = this.value;
    savePrefs(); cancelFlip(); if (state.mode === 'free') newPage();
  });
  ['rangeLow', 'rangeHigh'].forEach(function (id) {
    $(id).addEventListener('change', function () { changeRange(Number($('rangeLow').value), Number($('rangeHigh').value)); });
  });
  $('rangeCentral').addEventListener('click', function () { changeRange(48, 83); });
  $('rangeFull').addEventListener('click', function () { changeRange(21, 108); });
  $('learnKey').addEventListener('change', function () {
    if (state.timedRunning || state.mode !== 'learn') return;
    cancelFlip(); state.keyId = this.value; state.page = []; renderScore(); renderOverview(); renderLocal(); syncControls();
  });
  $('btnDefaultView').addEventListener('click', function () { selectView(defaultView()); });
  $('kb88Box').addEventListener('click', function (e) {
    var key = e.target.closest('[data-overview-m]');
    if (key) selectView(groupOf(Number(key.getAttribute('data-overview-m'))));
  });
  $('groupButtons').addEventListener('click', function (e) {
    var button = e.target.closest('[data-group]');
    if (!button) return;
    var low = Number(button.getAttribute('data-group'));
    selectView(groupOf(low)); $('groupButtons').querySelector('[data-group="' + low + '"]').focus();
  });
  $('kbLocalBox').addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var g = e.target.closest('.key');
    if (!g || g.classList.contains('disabled')) return;
    e.preventDefault();
    $('kbLocalBox').setPointerCapture(e.pointerId);
    holdKey('pointer-' + e.pointerId, Number(g.getAttribute('data-m')));
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) {
    $('kbLocalBox').addEventListener(event, function (e) { releaseKey('pointer-' + e.pointerId); });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.label-control')) closeLabels(false);
  });
  document.addEventListener('keydown', function (e) {
    var overlay = !$('startOverlay').hidden ? $('startOverlay') : !$('resultOverlay').hidden ? $('resultOverlay') : null;
    if (overlay) {
      if (e.key === 'Escape') { overlay.hidden = true; $('btnChallenge').focus(); e.preventDefault(); }
      if (e.key === 'Tab') {
        var buttons = overlay.querySelectorAll('button:not(:disabled)'), index = Array.prototype.indexOf.call(buttons, document.activeElement);
        var next = (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus(); e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape' && !$('labelPanel').hidden) { closeLabels(true); return; }
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || !state.ch) return;
    if (e.target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"]),.label-control')) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.key:not(.disabled)')) {
      holdKey('keyboard-' + e.code, Number(e.target.closest('.key').getAttribute('data-m'))); e.preventDefault(); return;
    }
    var map = keyMap(state.view);
    for (var m in map) {
      if (map[m] === e.key.toLowerCase()) { holdKey('keyboard-' + e.code, Number(m)); e.preventDefault(); return; }
    }
  });
  document.addEventListener('keyup', function (e) { releaseKey('keyboard-' + e.code); });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });
  var lastWidth = 0;
  function resize() {
    if (!state.ch) return;
    var width = scoreWidth();
    if (Math.abs(width - lastWidth) < 1) return;
    lastWidth = width; renderScore(); renderLocal();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe($('scoreBox'));
  window.addEventListener('resize', resize);
}

/* ================= 启动 ================= */
function init() {
  var options = '';
  for (var m = 21; m <= 108; m++) options += '<option value="' + m + '">' + midiName(m) + ' · ' + groupNameOf(m) + '</option>';
  $('rangeLow').innerHTML = options; $('rangeHigh').innerHTML = options;
  for (var n = 1; n <= 10; n++) $('pageCount').insertAdjacentHTML('beforeend', '<option value="' + n + '">' + n + '</option>');
  document.querySelector('input[name="keyLabel"][value="' + prefs.label + '"]').checked = true;
  $('showMapping').checked = prefs.mapping; $('showHints').checked = prefs.hints;
  buildCards(); bindEvents(); showSelect();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

/* ================= 导出（供 Node 冒烟测试） ================= */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    letterAccToMidi: letterAccToMidi,
    scaleOf: scaleOf,
    CHAPTERS: CHAPTERS,
    KEYS: KEYS,
    KEY_TONIC: KEY_TONIC,
    posOf: posOf,
    writtenMidiOf: writtenMidiOf,
    writtenOctave: writtenOctave,
    genPage: genPage,
    kbWindow: kbWindow,
    keyMap: keyMap,
    solfegeOf: solfegeOf,
    midiName: midiName,
    octaveOf: octaveOf,
    isBlackMidi: isBlackMidi,
    SIG_POS: SIG_POS,
    CLEF_DIA0: CLEF_DIA0,
    poolFor: poolFor, chooseKey: chooseKey, eligibleKeys: eligibleKeys, groupOf: groupOf,
    noteOf: noteOf, notationFor: notationFor, notationOf: notationOf, accidentalOf: accidentalOf,
    pageSize: pageSize, scoreMetrics: scoreMetrics, scoreSVG: scoreSVG, GLYPHS: GLYPHS,
    keyboardGeometry: keyboardGeometry, kbLocalSVG: kbLocalSVG, kb88SVG: kb88SVG, isTonic: isTonic,
    safeStorage: safeStorage, configKey: configKey, normalizePrefs: normalizePrefs,
    state: state, prefs: prefs, openChapter: openChapter, setMode: setMode, newPage: newPage,
    selectView: selectView, changeRange: changeRange, pressKey: pressKey, holdKey: holdKey,
    releaseKey: releaseKey, cancelFlip: cancelFlip, startTimed: startTimed, endTimed: endTimed,
    setBest: setBest, getBests: getBests, showSelect: showSelect
  };
}
})();
