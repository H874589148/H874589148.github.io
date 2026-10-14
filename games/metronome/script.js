/* ============================================
   节拍器 metronome
   - Web Audio lookahead 调度（25ms 轮询 + 0.12s 提前量），杜绝裸 setInterval 抖动
   - 音色全部实时合成，零外部音频资源
   - 纯函数部分 module.exports 导出，供 js/tests/metronome.test.js 直接引用
   ============================================ */
'use strict';

/* ===== 常量与纯函数（不触碰 DOM，Node 测试可引用） ===== */
const BPM_MIN = 40, BPM_MAX = 208, BPM_DEFAULT = 120;
const BEATS_MIN = 1, BEATS_MAX = 12;

function clampBpm(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return BPM_DEFAULT;
    return Math.min(BPM_MAX, Math.max(BPM_MIN, n));
}

function clampBeats(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return 4;
    return Math.min(BEATS_MAX, Math.max(BEATS_MIN, n));
}

/* 意大利速度术语表：[区间下限 BPM, 术语, 中文] */
const TEMPO_TERMS = [
    [40, 'Largo', '广板'],
    [61, 'Larghetto', '小广板'],
    [67, 'Adagio', '柔板'],
    [77, 'Andante', '行板'],
    [109, 'Moderato', '中板'],
    [121, 'Allegro', '快板'],
    [169, 'Presto', '急板'],
    [200, 'Prestissimo', '最急板'],
];

function tempoTerm(bpm) {
    const v = clampBpm(bpm);
    let hit = TEMPO_TERMS[0];
    for (const row of TEMPO_TERMS) if (v >= row[0]) hit = row;
    return { name: hit[1], zh: hit[2] };
}

/* 相邻两次脉冲（含细分）的时间间隔（秒） */
function beatInterval(bpm, subdiv) {
    return 60 / clampBpm(bpm) / subdiv;
}

const TEMPO_PRESETS = [40, 60, 72, 96, 120, 144, 180, 208];

/* 拍号预设：6/8 按乐理惯例 = 2 拍/小节 + 三连音细分 */
const TIME_SIG_PRESETS = [
    { label: '2/4', beats: 2, subdiv: 1 },
    { label: '3/4', beats: 3, subdiv: 1 },
    { label: '4/4', beats: 4, subdiv: 1 },
    { label: '6/8', beats: 2, subdiv: 3 },
];

const SUBDIVISIONS = [
    { id: 1, label: '四分' },
    { id: 2, label: '八分' },
    { id: 3, label: '三连音' },
    { id: 4, label: '十六分' },
];

const SOUNDS = [
    { id: 'wood', label: '木鱼' },
    { id: 'drum', label: '架子鼓' },
    { id: 'click', label: '节拍器' },
    { id: 'beep', label: '电子哔声' },
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BPM_MIN, BPM_MAX, BPM_DEFAULT, BEATS_MIN, BEATS_MAX,
        clampBpm, clampBeats, TEMPO_TERMS, tempoTerm, beatInterval,
        TEMPO_PRESETS, TIME_SIG_PRESETS, SUBDIVISIONS, SOUNDS,
    };
}

/* ===== 浏览器环境：状态 / 音频 / 调度 / 视觉 / UI ===== */
if (typeof window !== 'undefined' && typeof document !== 'undefined') (function () {

    const LS_KEY = 'ee-metronome';
    const LOOKAHEAD_MS = 25;      // 调度轮询间隔
    const SCHEDULE_AHEAD = 0.12;  // 音频提前调度窗口（秒）
    const PENDULUM_AMP = 30;      // 摆锤振幅（度）
    const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---- 状态与持久化 ---- */
    const state = { bpm: BPM_DEFAULT, beats: 4, accent: true, subdiv: 1, sound: 'wood', volume: 80 };

    function load() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const s = JSON.parse(raw);
            state.bpm = clampBpm(s.bpm);
            state.beats = clampBeats(s.beats);
            state.accent = s.accent !== false;
            state.subdiv = SUBDIVISIONS.some(x => x.id === s.subdiv) ? s.subdiv : 1;
            state.sound = SOUNDS.some(x => x.id === s.sound) ? s.sound : 'wood';
            const v = Math.round(Number(s.volume));
            state.volume = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 80;
        } catch (e) { /* 损坏数据静默回退默认 */ }
    }

    function save() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* file:// 等场景静默 */ }
    }

    /* ---- DOM ---- */
    const $ = id => document.getElementById(id);
    const el = {
        pendulum: $('pendulum'), dots: $('beatDots'), toggle: $('toggleBtn'),
        bpmNum: $('bpmNum'), bpmTerm: $('bpmTerm'), bpmSlider: $('bpmSlider'),
        bpmDown: $('bpmDown'), bpmUp: $('bpmUp'), tempoPresets: $('tempoPresets'),
        beatsNum: $('beatsNum'), beatsDown: $('beatsDown'), beatsUp: $('beatsUp'),
        accentWrap: $('accentWrap'), accentChk: $('accentChk'), tsPresets: $('tsPresets'),
        subdivRow: $('subdivRow'), soundRow: $('soundRow'),
        volSlider: $('volSlider'), volVal: $('volVal'),
    };

    /* ---- 音频引擎（首次手势创建 AudioContext） ---- */
    let ctx = null, master = null, noiseBuf = null;

    function ensureAudio() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = state.volume / 100;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }

    function applyVolume() {
        if (!master) return;
        master.gain.setTargetAtTime(state.volume / 100, ctx.currentTime, 0.01);
    }

    function noiseSrc() {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        return s;
    }

    /* 脉冲级别：2=重拍（小节首拍且重音开启） 1=普通拍 0=细分脉冲 */
    const LEVEL_GAIN = [0.35, 0.75, 1];

    /* 木鱼：带通噪声敲击 + 正弦快衰减 */
    function vWood(t, level) {
        const peak = LEVEL_GAIN[level];
        const freq = level === 2 ? 1350 : level === 1 ? 900 : 700;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 1.4, t);
        osc.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
        const g = ctx.createGain();
        g.gain.setValueAtTime(peak, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + 0.08);
        const n = noiseSrc();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 1.2;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(peak * 0.6, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
        n.connect(bp).connect(ng).connect(master);
        n.start(t); n.stop(t + 0.02);
    }

    /* 架子鼓：重拍=底鼓（扫频正弦+click），弱拍=踩镲，细分=更轻踩镲 */
    function vDrum(t, level) {
        if (level === 2) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
            const g = ctx.createGain();
            g.gain.setValueAtTime(1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            osc.connect(g).connect(master);
            osc.start(t); osc.stop(t + 0.14);
            const n = noiseSrc();
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 1200;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(0.35, t);
            ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
            n.connect(hp).connect(ng).connect(master);
            n.start(t); n.stop(t + 0.015);
        } else {
            const peak = level === 1 ? 0.5 : 0.22;
            const n = noiseSrc();
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 7000;
            const g = ctx.createGain();
            g.gain.setValueAtTime(peak, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (level === 1 ? 0.035 : 0.02));
            n.connect(hp).connect(g).connect(master);
            n.start(t); n.stop(t + 0.04);
        }
    }

    /* 机械节拍器：带通 click + 短 ping；重拍叠加 C7 铃声 */
    function vClick(t, level) {
        const peak = level === 0 ? 0.35 : 0.8;
        const n = noiseSrc();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 8;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(peak, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        n.connect(bp).connect(ng).connect(master);
        n.start(t); n.stop(t + 0.025);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = level === 2 ? 2200 : 1700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(peak * 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + 0.035);
        if (level === 2) {
            const bell = ctx.createOscillator();
            bell.type = 'sine';
            bell.frequency.value = 2093; // C7
            const bg = ctx.createGain();
            bg.gain.setValueAtTime(0.28, t);
            bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            bell.connect(bg).connect(master);
            bell.start(t); bell.stop(t + 0.36);
        }
    }

    /* 电子哔声：方波，重拍/普通/细分 = 880/660/440Hz */
    function vBeep(t, level) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = level === 2 ? 880 : level === 1 ? 660 : 440;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(LEVEL_GAIN[level] * 0.5, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + (level === 0 ? 0.035 : 0.06));
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + 0.07);
    }

    const VOICES = { wood: vWood, drum: vDrum, click: vClick, beep: vBeep };

    /* ---- 调度引擎 ---- */
    let running = false, timerId = null, rafId = 0;
    let nextTime = 0, beatIdx = 0, subIdx = 0;
    let queue = [];                    // 已调度待发声的拍事件 {time, beat}
    let pendAnchor = 0, pendDur = 0.5; // 摆锤相位锚点（最近调度拍的发声时刻）与拍长

    function scheduler() {
        while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
            const accentOn = state.accent && state.beats > 1;
            const level = subIdx > 0 ? 0 : (accentOn && beatIdx === 0 ? 2 : 1);
            VOICES[state.sound](nextTime, level);
            if (subIdx === 0) {
                queue.push({ time: nextTime, beat: beatIdx });
                pendAnchor = nextTime;
                pendDur = 60 / state.bpm;
            }
            nextTime += beatInterval(state.bpm, state.subdiv);
            subIdx++;
            if (subIdx >= state.subdiv) { subIdx = 0; beatIdx = (beatIdx + 1) % state.beats; }
        }
    }

    /* ---- 视觉：拍点灯 + 摆锤（rAF 读音频时钟，与声音严格对齐） ---- */
    let lastFlash = 0;

    function flashDot(beat) {
        const dots = el.dots.children;
        for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === beat);
        lastFlash = performance.now();
    }

    function clearDots() {
        for (const d of el.dots.children) d.classList.remove('active');
    }

    function draw() {
        if (!running) return;
        const now = ctx.currentTime;
        while (queue.length && queue[0].time <= now + 0.001) {
            const ev = queue.shift();
            flashDot(ev.beat);
        }
        if (performance.now() - lastFlash > 160) clearDots();
        if (!REDUCED) {
            const deg = PENDULUM_AMP * Math.cos(Math.PI * (now - pendAnchor) / pendDur);
            el.pendulum.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
        }
        rafId = requestAnimationFrame(draw);
    }

    function renderDots() {
        el.dots.textContent = '';
        const showDown = state.accent && state.beats > 1;
        for (let i = 0; i < state.beats; i++) {
            const d = document.createElement('span');
            d.className = 'beat-dot' + (showDown && i === 0 ? ' downbeat' : '');
            el.dots.appendChild(d);
        }
    }

    /* ---- 开始 / 停止 ---- */
    function start() {
        ensureAudio();
        beatIdx = 0; subIdx = 0; queue = [];
        nextTime = ctx.currentTime + 0.06;
        pendAnchor = nextTime;
        pendDur = 60 / state.bpm;
        timerId = setInterval(scheduler, LOOKAHEAD_MS);
        scheduler();
        running = true;
        el.toggle.textContent = '停止';
        el.toggle.classList.remove('btn-primary');
        el.toggle.classList.add('btn-accent');
        rafId = requestAnimationFrame(draw);
    }

    function stop() {
        running = false;
        clearInterval(timerId); timerId = null;
        cancelAnimationFrame(rafId);
        queue = [];
        clearDots();
        el.pendulum.style.transform = 'rotate(0deg)';
        el.toggle.textContent = '开始';
        el.toggle.classList.add('btn-primary');
        el.toggle.classList.remove('btn-accent');
    }

    /* ---- UI 同步 ---- */
    function syncTempoUI() {
        el.bpmNum.textContent = state.bpm;
        const term = tempoTerm(state.bpm);
        el.bpmTerm.textContent = term.name + ' · ' + term.zh;
        if (Number(el.bpmSlider.value) !== state.bpm) el.bpmSlider.value = state.bpm;
        for (const c of el.tempoPresets.children) c.classList.toggle('active', Number(c.dataset.bpm) === state.bpm);
    }

    function syncMeterUI() {
        el.beatsNum.textContent = state.beats;
        const single = state.beats <= 1;
        el.accentChk.disabled = single;
        el.accentWrap.classList.toggle('disabled', single);
        el.accentChk.checked = state.accent;
        for (const c of el.tsPresets.children) {
            c.classList.toggle('active', Number(c.dataset.beats) === state.beats && Number(c.dataset.subdiv) === state.subdiv);
        }
        for (const c of el.subdivRow.children) c.classList.toggle('active', Number(c.dataset.subdiv) === state.subdiv);
        queue.length = 0; // 拍结构变了，丢弃按旧结构调度的视觉事件
        renderDots();
    }

    function syncSoundUI() {
        for (const c of el.soundRow.children) c.classList.toggle('active', c.dataset.sound === state.sound);
        if (Number(el.volSlider.value) !== state.volume) el.volSlider.value = state.volume;
        el.volVal.textContent = state.volume;
    }

    /* ---- 状态变更（播放中改动下一拍生效，不中断） ---- */
    function setBpm(v) { state.bpm = clampBpm(v); save(); syncTempoUI(); }
    function setBeats(v) { state.beats = clampBeats(v); save(); syncMeterUI(); }
    function setSubdiv(v) { state.subdiv = v; save(); syncMeterUI(); }
    function setSound(v) { state.sound = v; save(); syncSoundUI(); }
    function setVolume(v) {
        const n = Math.round(Number(v));
        state.volume = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : state.volume;
        save(); syncSoundUI(); applyVolume();
    }
    function setTimeSig(ts) { state.beats = ts.beats; state.subdiv = ts.subdiv; save(); syncMeterUI(); }

    /* ---- chips 构建 ---- */
    function chip(parent, label, data, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip-btn';
        b.textContent = label;
        for (const k in data) b.dataset[k] = data[k];
        b.addEventListener('click', onClick);
        parent.appendChild(b);
    }

    function buildChips() {
        for (const bpm of TEMPO_PRESETS) chip(el.tempoPresets, String(bpm), { bpm }, () => setBpm(bpm));
        for (const ts of TIME_SIG_PRESETS) chip(el.tsPresets, ts.label, { beats: ts.beats, subdiv: ts.subdiv }, () => setTimeSig(ts));
        for (const s of SUBDIVISIONS) chip(el.subdivRow, s.label, { subdiv: s.id }, () => setSubdiv(s.id));
        for (const s of SOUNDS) chip(el.soundRow, s.label, { sound: s.id }, () => setSound(s.id));
    }

    /* ---- 事件 ---- */
    el.toggle.addEventListener('click', () => (running ? stop() : start()));
    el.bpmSlider.addEventListener('input', e => setBpm(e.target.value));
    el.bpmDown.addEventListener('click', () => setBpm(state.bpm - 1));
    el.bpmUp.addEventListener('click', () => setBpm(state.bpm + 1));
    el.beatsDown.addEventListener('click', () => setBeats(state.beats - 1));
    el.beatsUp.addEventListener('click', () => setBeats(state.beats + 1));
    el.accentChk.addEventListener('change', e => { state.accent = e.target.checked; save(); syncMeterUI(); });
    el.volSlider.addEventListener('input', e => setVolume(e.target.value));

    /* 空格=开始/停止，↑↓=BPM±1；控件聚焦时交还原生行为 */
    window.addEventListener('keydown', e => {
        const tag = (e.target.tagName || '').toUpperCase();
        const inControl = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
        if (e.code === 'Space') {
            if (inControl || tag === 'BUTTON' || tag === 'A') return;
            e.preventDefault();
            if (running) stop(); else start();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (inControl) return;
            e.preventDefault();
            setBpm(state.bpm + (e.key === 'ArrowUp' ? 1 : -1));
        }
    });

    /* ---- 初始化 ---- */
    load();
    buildChips();
    syncTempoUI();
    syncMeterUI();
    syncSoundUI();
})();
