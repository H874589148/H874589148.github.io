/* 运行：node --test js/tests/sight-reading.test.js；真实布局、音频和触屏另做浏览器验收。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SR = require('../../games/sight-reading/script');
const chapter = id => SR.CHAPTERS.find(ch => ch.id === id);
function random(seed = 73) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }

test('六个字形与固定版本官方SVG轮廓摘要一致', () => {
  // 来自 Bravura 1.392 官方 Git blob 1d8a3fda895073a1af407be9b16b14105fb450c3；摘要仅忽略空白。
  const hashes = {
    treble:'b488424d648638d930c7a5a3de3b273b43434cfc2418da049978f0250fdba95b',
    bass:'1cfbd34449a7c452430cf70b240e4689001fb8c419423177821159e19426f752',
    head:'91d3aaa9595e7fd28041c3e66e7f93ee117c991e84bfa1d969db34fd3fa66b5c',
    flat:'d05e3c7e2bc843463e12e12f009342f2fe2fed4b3190f7b9fecb69b4ee85c080',
    natural:'2cbaaa1704091c4a5239180f71703886c4117114c12a0944703eb064a3ba2f19',
    sharp:'b1d6682d7b3c02325a9b616053e3dd6db5b03b5c6974e3980640bc4d0c243db0'
  };
  const crypto = require('node:crypto');
  for (const [name, hash] of Object.entries(hashes))
    assert.equal(crypto.createHash('sha256').update(SR.GLYPHS[name].replace(/\s/g,'')).digest('hex'),hash);
  // Windows 检出可能使用 CRLF；按 Git 原始 LF 文本核验许可。
  const license = Buffer.from(fs.readFileSync(path.join(__dirname,'../../games/sight-reading/vendor/bravura/OFL.txt'),'utf8').replace(/\r\n/g,'\n'));
  assert.equal(crypto.createHash('sha1').update('blob '+license.length+'\0').update(license).digest('hex'), '2ef86a39593a42e3971fb88314ed7d2b748d4ef4');
});

test('40章，10/15/15独立连续编号，原37章id保留', () => {
  assert.equal(SR.CHAPTERS.length, 40);
  for (const [part, count] of [['c', 10], ['sharp', 15], ['flat', 15]]) {
    const chapters = SR.CHAPTERS.filter(ch => ch.part === part);
    assert.deepEqual(chapters.map(ch => ch.no), Array.from({ length: count }, (_, i) => i + 1));
    assert.equal(chapters[count - 1].id, part + '-mixed');
  }
  const ids = [60, 72, 48, 84, 36, 96, 24, 108, 21].map(m => 'c' + m);
  for (const kid of Object.keys(SR.KEY_TONIC)) for (const clef of ['treble', 'bass']) ids.push(kid + '-' + clef);
  assert.equal(ids.length, 37);
  assert.ok(ids.every(id => chapter(id)));
});
test('15调拼写、音程、理论音名与88键端点', () => {
  for (const [letter, acc, oct, midi] of [['B',1,3,60],['B',1,4,72],['C',-1,4,59],['E',1,4,65],['F',-1,4,64]])
    assert.equal(SR.letterAccToMidi(letter,acc,oct), midi);
  const expected = { C:'C D E F G A B',G:'G A B C D E F#',D:'D E F# G A B C#',A:'A B C# D E F# G#',E:'E F# G# A B C# D#',B:'B C# D# E F# G# A#',Fs:'F# G# A# B C# D# E#',Cs:'C# D# E# F# G# A# B#',F:'F G A Bb C D E',Bb:'Bb C D Eb F G A',Eb:'Eb F G Ab Bb C D',Ab:'Ab Bb C Db Eb F G',Db:'Db Eb F Gb Ab Bb C',Gb:'Gb Ab Bb Cb Db Eb F',Cb:'Cb Db Eb Fb Gb Ab Bb' };
  for (const kid of Object.keys(SR.KEYS)) {
    const key = SR.KEYS[kid], scale = SR.scaleOf(key.tonic.letter, key.tonic.acc);
    assert.equal(scale.map(n => n.letter + (n.acc === 1 ? '#' : n.acc === -1 ? 'b' : '')).join(' '), expected[kid]);
    const pool = SR.poolFor(kid, 0, 127);
    assert.ok(pool.every(n => n.midi >= 21 && n.midi <= 108 && n.midi === SR.letterAccToMidi(n.letter,n.acc,n.octave)));
    for (let m = 21; m <= 108; m++) {
      const n = SR.noteOf(m, kid), notation = SR.notationFor(n);
      assert.equal(n.letter.length, 1); assert.equal(SR.letterAccToMidi(n.letter, n.acc, n.octave), m);
      assert.ok(Number.isFinite(SR.posOf(notation, n)));
    }
  }
  assert.equal(SR.poolFor('C',21,108)[0].midi,21);
  assert.equal(SR.poolFor('C',21,108).at(-1).midi,108);
});
test('单音/空池出题和确定性随机均终止，不连音，综合页覆盖至少2组', () => {
  assert.deepEqual(SR.genPage({scale:[]},10,()=>0),[]);
  assert.equal(SR.genPage(chapter('c108'),10,()=>0).length,10);
  assert.deepEqual(SR.eligibleKeys('c',22,22),[]);
  assert.equal(SR.chooseKey('c',22,22,'C'),null);
  for (const kid of Object.keys(SR.KEYS)) {
    const ch = {mixed:true,scale:SR.poolFor(kid,21,108)}, rnd=random();
    for (let page = 0; page < 100; page++) {
      const notes=SR.genPage(ch,10,rnd);
      assert.ok(new Set(notes.map(n=>SR.groupOf(n.midi).low)).size>=2);
      assert.ok(notes.every((n,i)=>!i || n.midi!==notes[i-1].midi));
    }
  }
  assert.ok(SR.genPage(chapter('c60'),10,()=>0).every((n,i,a)=>!i||n.midi!==a[i-1].midi));
  let previous='G'; const rnd=random();
  for(let i=0;i<100;i++){const next=SR.chooseKey('sharp',21,108,previous,rnd);assert.notEqual(next,previous);previous=next;}
});
test('八度谱位按拼写，调外黑键及还原号不产生NaN', () => {
  assert.equal(SR.posOf(chapter('c60'),SR.noteOf(60,'C')),-2);
  assert.equal(SR.writtenMidiOf(chapter('c84'),84),72);
  assert.equal(SR.writtenMidiOf(chapter('c96'),107),83);
  assert.equal(SR.writtenMidiOf(chapter('c21'),23),35);
  assert.equal(SR.notationFor(SR.noteOf(59,'Cb')).clef,'treble');
  assert.equal(SR.notationFor(SR.noteOf(60,'Cs')).clef,'bass');
  assert.equal(SR.accidentalOf('G',SR.noteOf(65,'G')),'natural');
  assert.equal(SR.accidentalOf('C',SR.noteOf(61,'C')),'sharp');
  const markup=SR.scoreSVG(chapter('G-treble'),[SR.noteOf(65,'G')],{label:true,width:276});
  assert.match(markup,/glyph-natural/); assert.doesNotMatch(markup,/NaN|undefined/);
});
test('自动容量、固定1–10音与多行大谱表，八度线限定单列', () => {
  assert.equal(SR.pageSize('free','auto',720,null),10);
  assert.equal(SR.pageSize('timed','auto',720,null),8);
  assert.ok(SR.pageSize('free','auto',276,{count:7})<SR.pageSize('free','auto',276,null));
  for(let n=1;n<=10;n++) assert.equal(SR.pageSize('timed',String(n),276,{count:7}),n);
  const ch=chapter('c-mixed'), notes=[21,108,84,36,60,96,24,72,48,23].map(m=>SR.noteOf(m,'C'));
  const svg=SR.scoreSVG(ch,notes,{width:276});
  assert.equal((svg.match(/class="note-g"/g)||[]).length,10);
  assert.ok((svg.match(/class="staff-system"/g)||[]).length>=3);
  assert.equal((svg.match(/class="ottava-column"/g)||[]).length,6);
  assert.match(svg,/glyph-treble/);assert.match(svg,/glyph-bass/);
  for(const ch0 of SR.CHAPTERS) {
    for(const width of [276,331,700,900]) {
      const s=SR.scoreSVG(ch0,SR.genPage(ch0,10,random()),{width});
      assert.doesNotMatch(s,/NaN|undefined/);
      assert.equal((s.match(/class="note-g"/g)||[]).length,10);
    }
  }
});
test('全部视窗7白5黑，起始黑键轮廓不裁切，A0不是C调主音', () => {
  for(const view of SR.CHAPTERS.concat(Array.from({length:88},(_,i)=>SR.groupOf(i+21)))) {
    const keys=SR.kbWindow(view), geo=SR.keyboardGeometry(view,276);
    assert.equal(keys.length,12);assert.equal(keys.filter(SR.isBlackMidi).length,5);
    assert.ok(keys.every(m=>m>=21&&m<=108));assert.equal(Object.keys(SR.keyMap(view)).length,12);
    for(const k of geo.whites.concat(geo.blacks)){assert.ok(k.x>=geo.left);assert.ok(k.x+k.w<=geo.left+geo.width);}
    const desktop=SR.keyboardGeometry(view,900);
    assert.ok((desktop.height-35)-(desktop.height*0.62+6+16)>=24, '白键提示与音名保留独立文字带');
  }
  assert.equal(SR.isTonic('C',21),false);assert.equal(SR.isTonic('C',108),true);
  assert.ok(SR.keyboardGeometry(chapter('Bb-treble')).left<0);
});
test('音名/唱名、字母、提示互不依赖，黑键也有唱名', () => {
  const ch=chapter('G-treble');
  const a=SR.kbLocalSVG(ch,ch,{label:'sol',mapping:false,hints:false},276);
  assert.match(a,/kb-sol/);assert.doesNotMatch(a,/kb-map|scale-dot|tonic-tag/);
  assert.match(a,/data-m="78"[\s\S]*?kb-sol/);
  const b=SR.kbLocalSVG(ch,ch,{label:'off',mapping:true,hints:true},276);
  assert.match(b,/kb-map/);assert.match(b,/scale-dot/);assert.doesNotMatch(b,/class="kb-name|class="kb-sol/);
  assert.doesNotMatch(SR.kb88SVG(ch,ch,ch,false),/tonic-dot/);
});
test('配置成绩隔离，localStorage拒绝写入/损坏JSON的内存降级', () => {
  const config={id:'c60',low:60,high:71,size:8,label:'name',mapping:true,hints:true};
  const base=SR.configKey(config);
  for(const [k,v] of Object.entries({id:'c-mixed',low:59,high:72,size:10,label:'off',mapping:false,hints:false})) assert.notEqual(SR.configKey({...config,[k]:v}),base);
  const storage=SR.safeStorage({getItem:()=>'{broken',setItem:()=>{throw Error('quota');}});
  assert.deepEqual(storage.read('prefs'),{});storage.write('prefs',{x:1});assert.deepEqual(storage.read('prefs'),{x:1});
  const denied=SR.safeStorage({getItem:()=>{throw Error('denied');}});
  assert.deepEqual(denied.read('old'),{});denied.write('x',{score:7});assert.equal(denied.read('x').score,7);
  assert.equal(SR.normalizePrefs({low:108,high:21}).low,48);
});

/* 最小DOM与可控时钟只验证真实状态机；不据此声称视觉或真实点击通过。 */
function harness() {
  const nodes=new Map(), timeouts=new Map(), callbacks=new Map(), writes=[]; let now=1000,id=0;
  function el(key) {
    if(!nodes.has(key)) nodes.set(key,{hidden:false,innerHTML:'',textContent:'',value:'',disabled:false,clientWidth:720,
      classList:{toggle(){},add(){},remove(){}},setAttribute(){},getAttribute(){return null;},focus(){},contains(){return false;},
      getBoundingClientRect(){return {width:720};},querySelector(){return null;},querySelectorAll(){return [];}});
    return nodes.get(key);
  }
  const document={readyState:'loading',activeElement:null,addEventListener(){},getElementById:el,querySelector:s=>el(s),querySelectorAll:()=>[]};
  const sandbox={document,window:{localStorage:{getItem:k=>k==='ee-sightreading-best'?'{"c60":99}':null,setItem:(k,v)=>writes.push([k,v])}},
    module:{exports:{}},Date:{now:()=>now},setTimeout:fn=>{timeouts.set(++id,fn);callbacks.set(id,fn);return id;},clearTimeout:i=>timeouts.delete(i),
    setInterval:()=>++id,clearInterval(){},console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../games/sight-reading/script.js'),'utf8'),sandbox);
  const api=sandbox.module.exports;
  return {api,el,timeouts,callbacks,writes,tick:t=>now=t,open:cid=>api.openChapter(api.CHAPTERS.find(c=>c.id===cid))};
}
test('视窗切换不改题库/进度；错八度计错；调外学习有效', () => {
  const h=harness(),a=h.api;h.open('c60');a.setMode('free');
  const page=JSON.stringify(a.state.page),range=JSON.stringify(a.state.range),key=a.state.keyId;
  a.selectView({low:72,high:83});assert.equal(JSON.stringify(a.state.page),page);assert.equal(JSON.stringify(a.state.range),range);assert.equal(a.state.keyId,key);
  a.pressKey(72);assert.equal(a.state.wrong,1);assert.equal(a.state.correct,0);
  a.setMode('learn');a.pressKey(73);assert.equal(a.state.page[0].midi,73);assert.equal(a.state.page[0].letter,'C');assert.equal(a.state.page[0].acc,1);
});
test('自由翻页的旧回调在改配置/重开/返章后失效，数量改变保留累计分', () => {
  const h=harness(),a=h.api;h.open('c108');a.prefs.freeCount='1';a.setMode('free');a.pressKey(108);
  assert.equal(a.state.correct,1);assert.equal(h.timeouts.size,1);
  const stale=[...h.callbacks.values()][0];a.prefs.freeCount='10';a.newPage();stale();
  assert.equal(a.state.page.length,10);assert.equal(a.state.correct,1);assert.equal(a.state.pageIndex,1);
  a.showSelect();stale();assert.equal(a.state.ch,null);
});
test('限时锁配置、数量固定、先判截止、不超时加分、旧成绩不覆盖', () => {
  const h=harness(),a=h.api;h.open('c108');a.setMode('timed');a.prefs.timedCount='1';a.startTimed();
  assert.equal(h.el('pageCount').disabled,true);assert.equal(h.el('labelFields').disabled,true);
  a.changeRange(21,108);assert.equal(a.state.range.low,108);
  a.prefs.timedCount='10';a.newPage();assert.equal(a.state.page.length,1);
  a.pressKey(108);assert.equal(a.state.correct,1);
  h.tick(a.state.timedEnd);a.pressKey(108);assert.equal(a.state.correct,1);assert.equal(a.state.timedRunning,false);
  assert.equal(h.el('labelFields').disabled,false);assert.equal(h.el('resultOverlay').hidden,false);
  assert.ok(h.writes.some(([key])=>key==='ee-sightreading-best-v2'));assert.ok(!h.writes.some(([key])=>key==='ee-sightreading-best'));
});
test('综合区间包含边界，单音与空题库安全降级，章节模板不修改', () => {
  const h=harness(),a=h.api;const before=JSON.stringify(a.CHAPTERS);h.open('c-mixed');
  a.changeRange(108,108);a.setMode('free');assert.ok(a.state.page.every(n=>n.midi===108));
  a.changeRange(22,22);assert.equal(a.state.page.length,0);assert.equal(h.el('btnChallenge').disabled,true);
  a.setMode('timed');a.startTimed();assert.equal(a.state.timedRunning,false);
  assert.equal(JSON.stringify(a.CHAPTERS),before);
});
test('一次按下只判定一次，释放后可重新作答', () => {
  const h=harness(),a=h.api;h.open('c108');a.setMode('free');
  a.holdKey('keyboard-KeyJ',108);a.holdKey('keyboard-KeyJ',108);assert.equal(a.state.correct,1);
  a.releaseKey('keyboard-KeyJ');a.holdKey('keyboard-KeyJ',108);assert.equal(a.state.correct,2);
});
