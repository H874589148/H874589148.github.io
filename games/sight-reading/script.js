/* ============================================================
   识谱练习 - script.js
   章节体系：C 调 9 组（88 键全覆盖）+ 升号调 7 调 + 降号调 7 调，共 37 章
   渲染：原生 SVG 刻谱风格；音频：Web Audio 合成；零外部依赖
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

function genPage(chapter, n, rnd) {
  rnd = rnd || Math.random;
  var pool = chapter.scale, out = [], prev = -1, idx;
  for (var i = 0; i < n; i++) {
    if (pool.length === 1) idx = 0;
    else { do { idx = Math.floor(rnd() * pool.length); } while (pool[idx].midi === prev); }
    prev = pool[idx].midi;
    out.push(pool[idx]);
  }
  return out;
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
  if (chapter.keyId === 'C') return SOLFEGE[letterIdx(note.letter)];
  for (var i = 0; i < chapter.scale.length; i++) {
    if (chapter.scale[i].midi === note.midi) return SOLFEGE[i];
  }
  return '';
}

/* ================= SVG 渲染 ================= */
/* 谱号 path 定义在局部坐标：谱表底线为 y=0，向上为负；线距 12px */
var TREBLE_CLEF = '<path class="clef-stroke" d="M 13 12 C 7 8 6 0 11 -3 C 15 -6 17 -12 16 -18 C 14 -28 12 -38 16 -48 C 19 -56 27 -58 30 -52 C 33 -45 28 -38 22 -38 C 17 -38 14 -34 15 -28 C 16 -22 22 -20 24 -15 C 26 -10 22 -6 18 -8 C 14 -10 14 -15 18 -16"/>';
var BASS_CLEF = '<path class="clef-fill" d="M 4 -30 C 3 -38 10 -42 17 -39 C 25 -35 27 -24 22 -12 C 18 -3 12 4 9 10 C 8 12 7 13 6 14 C 8 6 11 0 14 -6 C 18 -15 17 -26 10 -30 C 7 -32 5 -32 4 -30 Z"/>' +
  '<circle class="clef-fill" cx="21" cy="-33" r="2.4"/><circle class="clef-fill" cx="21" cy="-39" r="2.4"/>';

/* 调号升降号的标准字位（音级 dia 值） */
var SIG_POS = {
  sharp: { treble: [38, 35, 39, 36, 33, 37, 34], bass: [24, 21, 25, 22, 19, 23, 20] },
  flat:  { treble: [34, 37, 33, 36, 32, 35, 31], bass: [20, 23, 19, 22, 18, 21, 17] }
};

function sharpSVG(x, y) {
  return '<path class="acc-glyph" d="M ' + (x - 2.6) + ' ' + (y - 10) + ' L ' + (x - 2.6) + ' ' + (y + 10) +
    ' M ' + (x + 2.6) + ' ' + (y - 10) + ' L ' + (x + 2.6) + ' ' + (y + 10) +
    ' M ' + (x - 6) + ' ' + (y - 2.5) + ' L ' + (x + 6) + ' ' + (y - 5.5) +
    ' M ' + (x - 6) + ' ' + (y + 4.5) + ' L ' + (x + 6) + ' ' + (y + 1.5) + '"/>';
}
function flatSVG(x, y) {
  return '<path class="acc-glyph" d="M ' + x + ' ' + (y - 11) + ' L ' + x + ' ' + (y + 8) +
    ' M ' + x + ' ' + (y + 8) + ' C ' + (x + 6.5) + ' ' + (y + 6.5) + ' ' + (x + 6.5) + ' ' + (y - 2) + ' ' + x + ' ' + (y - 4) + '"/>';
}

/* 谱面主渲染：notes 为该章 scale 中的音符；o: {done, targetIdx, shakeIdx, label} */
function scoreSVG(chapter, notes, o) {
  o = o || {};
  var W = 720, H = 176, BY = 110, LG = 12;
  var ks = chapter.sig ? chapter.sig.count : 0;
  var clefW = chapter.clef === 'treble' ? 44 : 38;
  var x0 = 16 + clefW + (ks ? ks * 11 + 10 : 0) + 14;
  var parts = [], i, x, y, p;

  for (i = 0; i < 5; i++) {
    parts.push('<line class="staff-line" x1="16" y1="' + (BY - i * LG) + '" x2="' + (W - 16) + '" y2="' + (BY - i * LG) + '"/>');
  }
  parts.push('<g class="clef-g" transform="translate(22,' + BY + ')">' + (chapter.clef === 'treble' ? TREBLE_CLEF : BASS_CLEF) + '</g>');

  if (ks) {
    var poss = SIG_POS[chapter.sig.type][chapter.clef];
    for (i = 0; i < ks; i++) {
      x = 16 + clefW + 8 + i * 11;
      y = BY - (poss[i] - CLEF_DIA0[chapter.clef]) * 6;
      parts.push(chapter.sig.type === 'sharp' ? sharpSVG(x, y) : flatSVG(x, y));
    }
  }

  var maxY = 0, minY = BY;
  notes.forEach(function (note) {
    p = posOf(chapter, note);
    maxY = Math.max(maxY, BY - p * 6);
    minY = Math.min(minY, BY - p * 6);
  });

  if (chapter.ottava) {
    var above = chapter.ottava.offset < 0;
    var oy = above ? Math.min(34, minY - 12) : Math.max(126, maxY + 12);
    var hook = above ? ' l 0 6' : ' l 0 -6';
    parts.push('<path class="ottava-line" d="M 20 ' + oy + ' H ' + (W - 20) + hook + '"/>');
    parts.push('<text class="ottava-mark" x="' + (above ? 22 : W - 22) + '" y="' + (above ? oy - 7 : oy + 9) + '"' + (above ? '' : ' text-anchor="end"') + '>' + chapter.ottava.mark + '</text>');
  }

  var n = notes.length;
  for (i = 0; i < n; i++) {
    var note = notes[i];
    p = posOf(chapter, note);
    x = n === 1 ? (x0 + W) / 2 : x0 + (i + 0.5) * (W - x0 - 8) / n;
    y = BY - p * 6;
    var cls = 'note-g' + (o.done && o.done[i] ? ' done' : '') + (o.shakeIdx === i ? ' shake' : '');
    var g = '<g class="' + cls + '" data-idx="' + i + '">';
    var lp;
    for (lp = -2; lp >= p; lp -= 2) g += '<line class="ledger" x1="' + (x - 11) + '" y1="' + (BY - lp * 6) + '" x2="' + (x + 11) + '" y2="' + (BY - lp * 6) + '"/>';
    for (lp = 10; lp <= p; lp += 2) g += '<line class="ledger" x1="' + (x - 11) + '" y1="' + (BY - lp * 6) + '" x2="' + (x + 11) + '" y2="' + (BY - lp * 6) + '"/>';
    var up = p < 4, sx = up ? x + 5.2 : x - 5.2;
    g += '<line class="stem" x1="' + sx + '" y1="' + (up ? y - 1 : y + 1) + '" x2="' + sx + '" y2="' + (up ? y - 30 : y + 30) + '"/>';
    g += '<ellipse class="notehead" cx="' + x + '" cy="' + y + '" rx="6.4" ry="4.7" transform="rotate(-16 ' + x + ' ' + y + ')"/>';
    if (o.targetIdx === i) g += '<circle class="target-ring" cx="' + x + '" cy="' + y + '" r="14"/>';
    g += '</g>';
    parts.push(g);
  }

  if (o.label && notes.length) {
    var note0 = notes[0];
    var written = note0.letter + accText(note0.acc) + writtenOctave(chapter, note0);
    var sounding = note0.letter + accText(note0.acc) + note0.octave;
    var sol = solfegeOf(chapter, note0);
    var below = !(chapter.ottava && chapter.ottava.offset > 0);
    if (chapter.ottava) {
      if (below) {
        parts.push('<text class="note-label-sub" x="' + (W / 2) + '" y="136">记谱 ' + written + ' → 实音 ' + sounding + '</text>');
        parts.push('<text class="note-label" x="' + (W / 2) + '" y="156">' + sounding + ' · ' + sol + '</text>');
      } else {
        parts.push('<text class="note-label" x="' + (W / 2) + '" y="14">' + sounding + ' · ' + sol + '</text>');
        parts.push('<text class="note-label-sub" x="' + (W / 2) + '" y="30">记谱 ' + written + ' → 实音 ' + sounding + '</text>');
      }
    } else {
      parts.push('<text class="note-label" x="' + (W / 2) + '" y="146">' + sounding + ' · ' + sol + '</text>');
    }
  }

  return '<svg class="score-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="五线谱">' + parts.join('') + '</svg>';
}

/* 88 键总览 */
function kb88SVG(chapter) {
  var WW = 13, WH = 64, BW = 8, BH = 38;
  var whites = [], blacks = [], wCount = 0, tonic = chapter.scale[0].midi;
  for (var m = MIDI_BOTTOM; m <= MIDI_TOP; m++) {
    if (isBlackMidi(m)) blacks.push({ m: m, x: wCount * WW - BW / 2 });
    else { whites.push({ m: m, x: wCount * WW }); wCount++; }
  }
  var s = '';
  whites.forEach(function (k) {
    var inRange = k.m >= chapter.low && k.m <= chapter.high;
    s += '<rect class="kbw' + (inRange ? ' hl' : '') + '" x="' + k.x + '" y="0" width="' + WW + '" height="' + WH + '" rx="1.5"/>';
    if (k.m % 12 === 0) s += '<text class="kb88-c" x="' + (k.x + WW / 2) + '" y="' + (WH - 3) + '" text-anchor="middle">C' + octaveOf(k.m) + '</text>';
    if (k.m === tonic) s += '<circle class="tonic-dot" cx="' + (k.x + WW / 2) + '" cy="' + (WH - 13) + '" r="2.4"/>';
  });
  blacks.forEach(function (k) {
    var inRange = k.m >= chapter.low && k.m <= chapter.high;
    s += '<rect class="kbb' + (inRange ? ' hl' : '') + '" x="' + k.x + '" y="0" width="' + BW + '" height="' + BH + '" rx="1.5"/>';
    if (k.m === tonic) s += '<circle class="tonic-dot" cx="' + (k.x + BW / 2) + '" cy="' + (BH - 8) + '" r="2.4"/>';
  });
  var W = wCount * WW;
  return '<svg class="kb88-svg" viewBox="0 0 ' + W + ' ' + (WH + 2) + '" aria-hidden="true">' + s + '</svg>';
}

/* 局部键盘（12 键视窗） */
function kbLocalSVG(chapter) {
  var keys = kbWindow(chapter);
  var WW = 62, WH = 190, BW = 38, BH = 116;
  var whites = [], blacks = [], wCount = 0;
  keys.forEach(function (m) {
    if (isBlackMidi(m)) blacks.push({ m: m, x: wCount * WW - BW / 2 });
    else { whites.push({ m: m, x: wCount * WW }); wCount++; }
  });
  var scaleSet = {}, tonic = chapter.scale[0].midi;
  chapter.scale.forEach(function (n) { scaleSet[n.midi] = 1; });
  var map = keyMap(chapter);
  var s = '', W = wCount * WW;

  whites.forEach(function (k) {
    var enabled = k.m >= chapter.low && k.m <= chapter.high;
    var cls = 'key key-w' + (enabled ? '' : ' disabled') + (k.m === tonic ? ' tonic-key' : '');
    s += '<g class="' + cls + '" data-m="' + k.m + '" tabindex="-1">';
    s += '<rect class="kbw" x="' + k.x + '" y="0" width="' + WW + '" height="' + WH + '" rx="3"/>';
    if (scaleSet[k.m]) s += '<circle class="scale-dot" cx="' + (k.x + WW / 2) + '" cy="16" r="2.6"/>';
    if (k.m === tonic) s += '<text class="tonic-tag" x="' + (k.x + WW / 2) + '" y="34" text-anchor="middle">主音</text>';
    s += '<text class="kb-name" x="' + (k.x + WW / 2) + '" y="' + (WH - 38) + '" text-anchor="middle">' + midiName(k.m) + '</text>';
    s += '<text class="kb-sol" x="' + (k.x + WW / 2) + '" y="' + (WH - 38) + '" text-anchor="middle">' + (scaleSet[k.m] ? solfegeOf(chapter, { letter: SHARP_NAME[k.m % 12], midi: k.m }) : '') + '</text>';
    s += '<text class="kb-map" x="' + (k.x + WW / 2) + '" y="' + (WH - 10) + '" text-anchor="middle">' + (map[k.m] || '') + '</text>';
    s += '</g>';
  });
  blacks.forEach(function (k) {
    var enabled = k.m >= chapter.low && k.m <= chapter.high;
    var cls = 'key key-b' + (enabled ? '' : ' disabled') + (k.m === tonic ? ' tonic-key' : '');
    s += '<g class="' + cls + '" data-m="' + k.m + '" tabindex="-1">';
    s += '<rect class="kbb" x="' + k.x + '" y="0" width="' + BW + '" height="' + BH + '" rx="3"/>';
    if (scaleSet[k.m]) s += '<circle class="scale-dot-dark" cx="' + (k.x + BW / 2) + '" cy="12" r="2.4"/>';
    if (k.m === tonic) s += '<text class="tonic-tag-dark" x="' + (k.x + BW / 2) + '" y="28" text-anchor="middle">主音</text>';
    s += '<text class="kb-name kb-name-dark" x="' + (k.x + BW / 2) + '" y="' + (BH - 16) + '" text-anchor="middle">' + midiName(k.m) + '</text>';
    s += '<text class="kb-map kb-map-dark" x="' + (k.x + BW / 2) + '" y="' + (BH - 16) + '" text-anchor="middle">' + (map[k.m] || '') + '</text>';
    s += '</g>';
  });
  return '<svg class="kb-local-svg" viewBox="0 0 ' + W + ' ' + WH + '" aria-hidden="true">' + s + '</svg>';
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
var FREE_N = 10, TIMED_N = 8, TIMED_SECONDS = 60;
var state = {
  ch: null, mode: 'learn',
  page: [], targetIdx: 0, done: [],
  pageIndex: 1, score: 0, correct: 0, wrong: 0,
  timedEnd: 0, timerId: null, timedRunning: false
};

function $(id) { return document.getElementById(id); }
function store() {
  try { return window.localStorage; } catch (e) { return null; }
}
function getBests() {
  var s = store(); if (!s) return {};
  try { return JSON.parse(s.getItem('ee-sightreading-best') || '{}'); } catch (e) { return {}; }
}
function setBest(chId, score) {
  var s = store(); if (!s) return false;
  var b = getBests();
  if (!(chId in b) || score > b[chId]) { b[chId] = score; s.setItem('ee-sightreading-best', JSON.stringify(b)); return true; }
  return false;
}

function stopTimed() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  state.timedRunning = false;
}

function newPage() {
  var n = state.mode === 'timed' ? TIMED_N : FREE_N;
  state.page = genPage(state.ch, n);
  state.targetIdx = 0;
  state.done = state.page.map(function () { return false; });
  renderScore();
}

function renderScore() {
  var o = {};
  if (state.mode === 'learn') {
    o.label = state.page.length > 0;
  } else {
    o.done = state.done;
    o.targetIdx = state.targetIdx < state.page.length ? state.targetIdx : -1;
  }
  $('scoreBox').innerHTML = scoreSVG(state.ch, state.page, o);
  updateStatus();
}

function updateStatus() {
  var el = $('modeStatus');
  if (state.mode === 'learn') {
    el.textContent = '学习模式 · 按键即显示对应音符';
  } else if (state.mode === 'free') {
    var done = state.done.filter(function (d) { return d; }).length;
    el.textContent = '自由测验 · 第 ' + state.pageIndex + ' 页 · ' + done + '/' + state.page.length;
  } else {
    var left = state.timedRunning ? Math.max(0, Math.ceil((state.timedEnd - Date.now()) / 1000)) : TIMED_SECONDS;
    el.textContent = '限时挑战 · 得分 ' + state.score + ' · 剩余 ' + left + ' 秒';
  }
}

function setMode(mode) {
  stopTimed();
  $('startOverlay').hidden = true;
  $('resultOverlay').hidden = true;
  state.mode = mode;
  state.pageIndex = 1; state.score = 0; state.correct = 0; state.wrong = 0;
  ['learn', 'free', 'timed'].forEach(function (m) {
    var b = $('mode-' + m);
    b.classList.toggle('active', m === mode);
    b.setAttribute('aria-pressed', m === mode ? 'true' : 'false');
  });
  if (mode === 'learn') { state.page = []; renderScore(); }
  else if (mode === 'timed') { state.page = []; renderScore(); $('startOverlay').hidden = false; }
  else newPage();
}

function startTimed() {
  $('startOverlay').hidden = true;
  state.score = 0; state.correct = 0; state.wrong = 0;
  state.timedEnd = Date.now() + TIMED_SECONDS * 1000;
  state.timedRunning = true;
  newPage();
  state.timerId = setInterval(function () {
    updateStatus();
    if (Date.now() >= state.timedEnd) endTimed();
  }, 200);
}

function endTimed() {
  stopTimed();
  state.page = [];
  renderScore();
  var isRecord = state.correct > 0 && setBest(state.ch.id, state.correct);
  var total = state.correct + state.wrong;
  var acc = total ? Math.round(state.correct / total * 100) : 0;
  $('resultTitle').textContent = (isRecord ? '新纪录！' : '时间到');
  $('resultScore').textContent = state.correct + ' 分';
  $('resultAcc').textContent = '正确率 ' + acc + '%（按对 ' + state.correct + ' / 按错 ' + state.wrong + '）';
  $('resultBest').textContent = '本章最佳：' + (getBests()[state.ch.id] || 0) + ' 分';
  $('resultOverlay').hidden = false;
}

function markPressed(midi) {
  var g = $('kbLocalBox').querySelector('.key[data-m="' + midi + '"]');
  if (g) {
    g.classList.add('pressed');
    setTimeout(function () { g.classList.remove('pressed'); }, 160);
  }
}

function pressKey(midi) {
  if (!state.ch) return;
  if (midi < state.ch.low || midi > state.ch.high) return;   /* 视窗外（不完整组别）不可按 */
  playNote(midi);
  markPressed(midi);
  if (state.mode === 'learn') {
    state.page = [chapterNoteOf(midi)];
    renderScore();
    return;
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
        state.pageIndex++;
        renderScore();
        setTimeout(function () {
          if (state.mode === 'free') newPage();
        }, 450);
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

function chapterNoteOf(midi) {
  for (var i = 0; i < state.ch.scale.length; i++) {
    if (state.ch.scale[i].midi === midi) return state.ch.scale[i];
  }
  return { letter: SHARP_NAME[midi % 12], acc: 0, octave: octaveOf(midi), midi: midi };
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

function previewNotes(ch) {
  if (ch.scale.length >= 3) return [ch.scale[0], ch.scale[2], ch.scale[4]];
  return ch.scale.slice();
}

function buildCards() {
  PARTS.forEach(function (part) {
    var track = $('track-' + part.id);
    var html = '';
    CHAPTERS.filter(function (c) { return c.part === part.id; }).forEach(function (ch) {
      var best = getBests()[ch.id];
      html += '<button type="button" class="chapter-card" data-ch="' + ch.id + '" aria-label="进入' + ch.title + '">';
      html += '<span class="ch-no">第 ' + ch.no + ' 章</span>';
      html += '<span class="ch-preview">' + scoreSVG(ch, previewNotes(ch), {}) + '</span>';
      html += '<span class="ch-title">' + ch.title + '</span>';
      html += '<span class="ch-range">' + ch.rangeLabel + (ch.ottava ? ' <span class="ch-badge">' + ch.ottava.mark + '</span>' : '') + '</span>';
      html += best != null ? '<span class="ch-best">限时最佳 ' + best + ' 分</span>' : '<span class="ch-best ch-best-empty">暂无限时成绩</span>';
      html += '</button>';
    });
    track.innerHTML = html;
  });
}

function refreshBests() {
  CHAPTERS.forEach(function (ch) {
    var card = document.querySelector('.chapter-card[data-ch="' + ch.id + '"]');
    if (!card) return;
    var best = getBests()[ch.id];
    var el = card.querySelector('.ch-best');
    if (el) el.textContent = best != null ? '限时最佳 ' + best + ' 分' : '暂无限时成绩';
  });
}

function showSelect() {
  stopTimed();
  $('startOverlay').hidden = true;
  $('resultOverlay').hidden = true;
  state.ch = null;
  $('practiceView').hidden = true;
  $('selectView').hidden = false;
  refreshBests();
}

function openChapter(ch) {
  state.ch = ch;
  $('selectView').hidden = true;
  $('practiceView').hidden = false;
  $('chTitle').textContent = '第 ' + ch.no + ' 章 · ' + ch.title;
  $('chBadges').innerHTML = badgeList(ch).map(function (t) {
    return '<span class="badge">' + t + '</span>';
  }).join('');
  renderOverview();
  renderLocal();
  setMode('learn');
}

function renderOverview() {
  $('kb88Box').innerHTML = kb88SVG(state.ch);
}
function renderLocal() {
  var box = $('kbLocalBox');
  box.innerHTML = kbLocalSVG(state.ch);
  box.className = box.className.replace(/ ?label-\w+/, '') + ' label-' + state.labelMode;
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
  $('labelSel').addEventListener('change', function () {
    state.labelMode = this.value;
    renderLocal();
  });

  /* 局部键盘点击 */
  $('kbLocalBox').addEventListener('pointerdown', function (e) {
    var g = e.target.closest ? e.target.closest('.key') : null;
    if (!g || g.classList.contains('disabled')) return;
    pressKey(Number(g.getAttribute('data-m')));
  });

  /* 电脑键盘映射 */
  document.addEventListener('keydown', function (e) {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if ($('practiceView').hidden) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    var map = keyMap(state.ch);
    for (var m in map) {
      if (map[m] === e.key.toLowerCase()) { pressKey(Number(m)); e.preventDefault(); return; }
    }
  });
}

/* ================= 启动 ================= */
function init() {
  state.labelMode = 'name';
  $('labelSel').value = 'name';
  buildCards();
  bindEvents();
  showSelect();
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
    CLEF_DIA0: CLEF_DIA0
  };
}
})();
