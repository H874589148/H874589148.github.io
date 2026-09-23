/* tools/truth-table/engine.js
   逻辑真值表求值引擎（纯函数，无 DOM 依赖，浏览器 window.TTEngine / Node module.exports 双端可用）
   迁移自根目录 logic_truth_table.html：
   - 位并行求值：每个信号表示为 BigInt 位向量，第 r 位 = 第 r 行输入组合下的取值，一次算完 2^n 行
   - 文本 DSL：input/output/assign 声明、~!&|^*+ 运算符、and/or/nand/nor/xor/xnor/not/buf 门函数、# 与 // 注释
   - Blob Worker 内联运行器：仅自身函数序列化为代码，用户表达式永远作为数据解析，不做 eval */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.TTEngine = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';

/* ================= 位并行求值引擎 ================= */

function constMask(v, allMask){ return v ? allMask : 0n; }

// 第 j 个输入的掩码：连续 2^j 个 0、2^j 个 1，周期 2^(j+1)
function makeInputMask(j, n){
  const Rb = 1n << BigInt(n);              // 位数 = 行数 2^n
  const runLen = BigInt(2 ** j);
  let val = ((1n << runLen) - 1n) << runLen;
  let width = runLen * 2n;
  while (width < Rb){ val |= val << width; width *= 2n; }
  return val & ((1n << Rb) - 1n);
}

function evalOp(op, args, env, allMask){
  const vals = args.map(a => (typeof a === 'string') ? env.get(a) : constMask(a.const, allMask));
  if (vals.some(v => v === undefined)) throw new Error('内部错误：引用了未定义的信号');
  switch (op){
    case 'buf':  return vals[0];
    case 'not':  return (~vals[0]) & allMask;
    case 'and':  return vals.reduce((a, b) => a & b);
    case 'or':   return vals.reduce((a, b) => a | b);
    case 'xor':  return vals.reduce((a, b) => a ^ b);
    case 'nand': return (~vals.reduce((a, b) => a & b)) & allMask;
    case 'nor':  return (~vals.reduce((a, b) => a | b)) & allMask;
    case 'xnor': return (~vals.reduce((a, b) => a ^ b)) & allMask;
    default: throw new Error('未知运算: ' + op);
  }
}

// Validate references and arity before evaluation; do not silently treat bad data as 0/1.
function validateIR(ir){
  if (!ir || !Array.isArray(ir.inputs) || !Array.isArray(ir.signals) || !Array.isArray(ir.outputs)) throw new Error('网表需要 inputs、signals、outputs 数组');
  if (!ir.outputs.length) throw new Error('网表没有输出信号');
  const validName = name => typeof name === 'string' && /^[A-Za-z_]\w*$/.test(name);
  const names = new Set();
  for (const name of ir.inputs){
    if (!validName(name)) throw new Error('非法输入名称：' + name);
    if (names.has(name)) throw new Error('信号名重复：' + name);
    names.add(name);
  }
  const defs = new Map();
  for (const sg of ir.signals){
    if (!sg || !validName(sg.name)) throw new Error('网表信号名称非法');
    if (names.has(sg.name)) throw new Error('信号名重复：' + sg.name);
    names.add(sg.name); defs.set(sg.name, sg);
    if (!['and','or','not','nand','nor','xor','xnor','buf'].includes(sg.op)) throw new Error('未知运算：' + sg.op);
    if (!Array.isArray(sg.args) || (['not','buf'].includes(sg.op) ? sg.args.length !== 1 : sg.args.length < 2)) throw new Error('信号 ' + sg.name + ' 的门参数个数不正确');
  }
  const checkRef = ref => {
    if (typeof ref === 'string'){
      if (!names.has(ref)) throw new Error('引用了未定义的信号：' + ref);
    } else if (!ref || ![0,1].includes(ref.const)) throw new Error('网表常量只能为 0 或 1');
  };
  ir.signals.forEach(sg => sg.args.forEach(checkRef));
  const outputNames = new Set();
  for (const out of ir.outputs){
    if (!out || !validName(out.name) || outputNames.has(out.name)) throw new Error('输出名称非法或重复');
    outputNames.add(out.name); checkRef(out.ref);
  }
  const state = new Map(), sorted = [], path = [];
  const visit = name => {
    if (state.get(name) === 2) return;
    if (state.get(name) === 1) throw new Error('检测到循环依赖：' + path.slice(path.indexOf(name)).concat(name).join(' → '));
    state.set(name, 1); path.push(name);
    const sg = defs.get(name);
    sg.args.forEach(ref => { if (typeof ref === 'string' && defs.has(ref)) visit(ref); });
    path.pop(); state.set(name, 2); sorted.push(sg);
  };
  ir.signals.forEach(sg => visit(sg.name));
  return { inputs: ir.inputs.slice(), signals: sorted, outputs: ir.outputs.slice() };
}

// ir: { inputs:[名字], signals:[{name,op,args,temp}], outputs:[{name,ref}] }
function evaluateIR(ir){
  ir = validateIR(ir);
  const n = ir.inputs.length;
  if (n > 20) throw new Error('输入信号有 ' + n + ' 个，完整真值表需要 2^' + n + ' 行，已超出工具上限（20 个输入，约 100 万行）。请拆分电路或减少输入。');
  const R = 2 ** n;
  const allMask = (1n << BigInt(R)) - 1n;
  const env = new Map();
  ir.inputs.forEach((name, j) => env.set(name, makeInputMask(j, n)));
  for (const sg of ir.signals) env.set(sg.name, evalOp(sg.op, sg.args, env, allMask));
  const outMasks = ir.outputs.map(o => {
    if (typeof o.ref === 'string'){
      if (!env.has(o.ref)) throw new Error('内部错误：找不到输出信号 ' + o.ref);
      return env.get(o.ref);
    }
    return constMask(o.ref.const, allMask);
  });
  const outRefs = new Set(ir.outputs.map(o => typeof o.ref === 'string' ? o.ref : null).filter(Boolean));
  const internals = ir.signals
    .filter(sg => !sg.temp && !outRefs.has(sg.name))
    .map(sg => ({ label: sg.name, mask: env.get(sg.name) }));
  return { n, R, allMask, env, outMasks, internals, ir };
}

/* ================= 文本表达式解析 ================= */

function lineErr(lineNo, msg){ return new Error('第 ' + lineNo + ' 行: ' + msg); }

function tokenize(s, lineNo){
  const toks = []; let i = 0;
  while (i < s.length){
    const c = s[i];
    if (/\s/.test(c)){ i++; continue; }
    if (/[A-Za-z_]/.test(c)){
      let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      toks.push({ t: 'id', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === '0' || c === '1'){ toks.push({ t: 'num', v: c }); i++; continue; }
    if (s.substr(i, 2) === '&&'){ toks.push({ t: '&' }); i += 2; continue; }
    if (s.substr(i, 2) === '||'){ toks.push({ t: '|' }); i += 2; continue; }
    if ('~!&*|+^(),'.includes(c)){ toks.push({ t: c }); i++; continue; }
    throw lineErr(lineNo, "不认识的字符 '" + c + "'");
  }
  return toks;
}

function parseExpr(text, lineNo){
  const toks = tokenize(text, lineNo);
  let p = 0;
  const eat = t => (toks[p] && toks[p].t === t) ? toks[p++] : null;

  function parseOr(){
    let l = parseXor();
    while (eat('|') || eat('+')) l = { op: 'or', args: [l, parseXor()] };
    return l;
  }
  function parseXor(){
    let l = parseAnd();
    while (eat('^')) l = { op: 'xor', args: [l, parseAnd()] };
    return l;
  }
  function parseAnd(){
    let l = parseNot();
    while (eat('&') || eat('*')) l = { op: 'and', args: [l, parseNot()] };
    return l;
  }
  function parseNot(){
    if (eat('~') || eat('!')) return { op: 'not', args: [parseNot()] };
    return parsePrimary();
  }
  function parsePrimary(){
    if (eat('(')){
      const e = parseOr();
      if (!eat(')')) throw lineErr(lineNo, '括号不匹配');
      return e;
    }
    const num = eat('num');
    if (num) return { op: 'const', const: +num.v };
    const id = eat('id');
    if (id){
      const name = id.v;
      if (eat('(')){
        const args = [];
        if (!eat(')')){ do { args.push(parseOr()); } while (eat(',')); if (!eat(')')) throw lineErr(lineNo, '函数调用的括号不匹配'); }
        const fn = name.toLowerCase();
        if (fn === 'not'){ if (args.length !== 1) throw lineErr(lineNo, 'not() 需要 1 个参数'); return { op: 'not', args }; }
        if (fn === 'buf' || fn === 'id'){ if (args.length !== 1) throw lineErr(lineNo, 'buf() 需要 1 个参数'); return { op: 'buf', args }; }
        if (['and','or','nand','nor','xor','xnor'].includes(fn)){
          if (args.length < 2) throw lineErr(lineNo, fn + '() 需要至少 2 个参数');
          return { op: fn, args };
        }
        throw lineErr(lineNo, "未知函数 '" + name + "'（可用: and or nand nor xor xnor not buf）");
      }
      return { op: 'ref', name };
    }
    throw lineErr(lineNo, '表达式不完整');
  }

  const ast = parseOr();
  if (p < toks.length) throw lineErr(lineNo, '表达式有多余内容');
  return ast;
}

function refsOf(ast, cb){
  if (ast.op === 'ref') cb(ast.name);
  else if (ast.op !== 'const') ast.args.forEach(a => refsOf(a, cb));
}

function buildIRFromText(src){
  const defs = new Map();        // 信号名 -> 表达式树
  const order = [];              // 定义顺序
  const declaredInputs = [];
  const declaredOutputs = [];

  src.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    let line = raw.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim();
    if (!line) return;
    line = line.replace(/;\s*$/, '').trim();

    let m = line.includes('=') ? null : line.match(/^(inputs?|outputs?|in|out)\b\s*(.*)$/i);
    if (m){
      const isInput = m[1].toLowerCase().startsWith('in');
      const names = m[2].split(/[,\s]+/).filter(Boolean);
      if (!names.length) throw lineErr(lineNo, '声明缺少信号名');
      for (const nm of names){
        if (!/^[A-Za-z_]\w*$/.test(nm)) throw lineErr(lineNo, "非法信号名 '" + nm + "'");
        const list = isInput ? declaredInputs : declaredOutputs;
        if (!list.includes(nm)) list.push(nm);
      }
      return;
    }

    line = line.replace(/^assign\s+(?=[A-Za-z_]\w*\s*=)/i, '');
    m = line.match(/^([A-Za-z_]\w*)\s*=\s*(.*)$/);
    if (!m) throw lineErr(lineNo, '无法解析「' + line + '」，应形如 信号 = 表达式，或 input/output 声明');
    const name = m[1];
    if (declaredInputs.includes(name)) throw lineErr(lineNo, "'" + name + "' 已声明为输入，不能再赋值");
    if (defs.has(name)) throw lineErr(lineNo, "信号 '" + name + "' 被重复赋值");
    defs.set(name, parseExpr(m[2], lineNo));
    order.push(name);
  });

  if (!defs.size) throw new Error('没有解析到任何赋值语句（例如 y = a & b）');
  for (const nm of declaredInputs) if (defs.has(nm)) throw new Error("'" + nm + "' 同时被声明为输入又被赋值，请检查");
  for (const nm of declaredOutputs) if (!defs.has(nm)) throw new Error("声明的输出 '" + nm + "' 没有赋值");

  // 拓扑排序 + 循环依赖检查
  const state = new Map(), topo = [];
  const visit = (nm, stack) => {
    const st = state.get(nm);
    if (st === 2) return;
    if (st === 1){
      const i = stack.indexOf(nm);
      throw new Error('检测到循环依赖：' + stack.slice(i).concat(nm).join(' → ') + '。组合逻辑不能有反馈回路。');
    }
    state.set(nm, 1); stack.push(nm);
    refsOf(defs.get(nm), r => { if (defs.has(r)) visit(r, stack); });
    stack.pop(); state.set(nm, 2); topo.push(nm);
  };
  order.forEach(nm => visit(nm, []));

  // 输入：显式声明的在前，其次按出现顺序
  const inputs = [];
  const addInput = nm => { if (!defs.has(nm) && !inputs.includes(nm)) inputs.push(nm); };
  declaredInputs.forEach(addInput);
  for (const nm of order) refsOf(defs.get(nm), addInput);

  // 输出：显式声明的，或定义了但没有人用到的
  const referenced = new Set();
  for (const nm of order) refsOf(defs.get(nm), r => referenced.add(r));
  const seenOut = new Set();
  const outputs = [];
  for (const nm of order){
    if ((declaredOutputs.includes(nm) || !referenced.has(nm)) && !seenOut.has(nm)){
      seenOut.add(nm);
      outputs.push({ name: nm, ref: nm });
    }
  }
  if (!outputs.length) throw new Error('没有可观察的输出：每个信号都被其它信号用到了，请加一个不被引用的信号作为输出');

  // 展平表达式树为信号列表（子表达式分配临时信号 t1、t2…）
  const usedNames = new Set([...order, ...inputs]);
  let tmp = 0;
  const tmpName = () => { let nm; do { nm = 't' + (++tmp); } while (usedNames.has(nm)); usedNames.add(nm); return nm; };
  const signals = [];
  const emit = (ast, hint) => {
    if (ast.op === 'ref' || ast.op === 'const'){
      const arg = ast.op === 'ref' ? ast.name : { const: ast.const };
      if (!hint) return arg;
      signals.push({ name: hint, op: 'buf', args: [arg], temp: false });
      return hint;
    }
    const args = ast.args.map(ch => emit(ch, null));
    if (hint){ signals.push({ name: hint, op: ast.op, args, temp: false }); return hint; }
    const nm = tmpName();
    signals.push({ name: nm, op: ast.op, args, temp: true });
    return nm;
  };
  for (const nm of topo) emit(defs.get(nm), nm);

  return { inputs, signals, outputs };
}

/* ================= 结果准备与 CSV（Worker 内复用） ================= */

function maskToBits(m){ return m.toString(2); }
function bitAt(bits, r){ const i = bits.length - 1 - r; return i >= 0 && bits[i] === '1' ? 1 : 0; }

// String conversion and filtering are performed once in the worker, not on each page turn.
function prepareResult(st){
  st.inputCols = st.ir.inputs.map(name => ({label:name, bits:maskToBits(st.env.get(name)), cls:'in'}));
  st.outputCols = st.ir.outputs.map((o,i) => ({label:o.name, bits:maskToBits(st.outMasks[i]), cls:'out'}));
  st.internalCols = st.internals.map(c => ({label:c.label, bits:maskToBits(c.mask), cls:'mid'}));
  const combined = st.outMasks.reduce((acc,m) => acc | m, 0n).toString(2);
  const indexes = new Uint32Array(st.R); let count = 0;
  for (let r = 0; r < st.R; r++) if (bitAt(combined,r)) indexes[count++] = r;
  st.onesRows = indexes.slice(0,count);
  return st;
}

function makeCsvBlob(cols, rows, progress){
  const quote = value => '"' + String(value).replace(/"/g,'""') + '"';
  const parts = ['\ufeff', cols.map(c => quote(c.label)).join(',') + '\r\n'];
  for (let start = 0; start < rows; start += 8192){
    const lines = [];
    for (let r = start; r < Math.min(rows,start + 8192); r++) lines.push(cols.map(c => bitAt(c.bits,r)).join(','));
    parts.push(lines.join('\r\n') + '\r\n');
    if (progress) progress(Math.min(100,Math.round((start + lines.length) / rows * 100)));
  }
  return new Blob(parts, {type:'text/csv;charset=utf-8'});
}

/* ================= Blob Worker 内联运行器 =================
   仅本文件内函数被序列化为代码；用户表达式始终作为数据解析，绝不 eval。 */
function workerEntry(){
  self.onmessage = event => {
    try {
      const data = event.data;
      if (data.type === 'csv'){
        const blob = makeCsvBlob(data.cols,data.rows,p => self.postMessage({progress:p}));
        self.postMessage({result:blob}); return;
      }
      const start = performance.now();
      const ir = data.source === 'text' ? buildIRFromText(data.text) : data.ir;
      const result = evaluateIR(ir);
      result.elapsed = performance.now() - start;
      self.postMessage({result:prepareResult(result)});
    } catch(error){
      self.postMessage({error:error instanceof RangeError ? '表达式嵌套过深或电路过大，请拆分后计算' : error.message});
    }
  };
}
function runJob(data, onProgress){
  return new Promise((resolve,reject) => {
    const functions = [constMask,makeInputMask,evalOp,validateIR,evaluateIR,lineErr,tokenize,parseExpr,refsOf,buildIRFromText,maskToBits,bitAt,prepareResult,makeCsvBlob];
    const code = '"use strict";\n' + functions.map(fn => fn.toString()).join('\n') + '\n(' + workerEntry.toString() + ')();';
    let url, worker, timer;
    const cleanup = () => { clearTimeout(timer); if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url); };
    try {
      url = URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
      worker = new Worker(url);
      timer = setTimeout(() => { cleanup(); reject(new Error('计算超过 60 秒，已停止；请缩小电路后重试')); },60000);
      worker.onmessage = e => {
        if (e.data.progress !== undefined){ if (onProgress) onProgress(e.data.progress); return; }
        cleanup();
        if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result);
      };
      worker.onerror = e => { e.preventDefault(); cleanup(); reject(new Error('后台计算未能启动或运行，请使用允许本地 Worker 的现代浏览器')); };
      worker.postMessage(data);
    } catch(e){ cleanup(); reject(new Error('无法启动本地后台计算：' + e.message)); }
  });
}

/* ================= 文本示例 ================= */
var TEXT_EXAMPLES = {
  majority:'# 三输入多数表决器\n# 至少两个输入为 1 时，maj 输出 1\ninput a, b, c\n\nmaj = (a & b) | (a & c) | (b & c)',
  mux:'# 2 选 1 选择器：s=1 选 a，s=0 选 b\ninput a, b, s\n\nns = ~s\nleft = a & s\nright = b & ns\ny = left | right',
  adder:'# 1 位全加器：a、b、cin 相加\ninput a, b, cin\noutput sum, carry\n\np = a ^ b\nsum = p ^ cin\ncarry = (a & b) | (p & cin)',
  constant:'# 无输入的常量电路，真值表只有一行\ny = 1'
};

return {
  constMask: constMask, makeInputMask: makeInputMask, evalOp: evalOp,
  validateIR: validateIR, evaluateIR: evaluateIR,
  tokenize: tokenize, parseExpr: parseExpr, refsOf: refsOf, buildIRFromText: buildIRFromText,
  maskToBits: maskToBits, bitAt: bitAt, prepareResult: prepareResult, makeCsvBlob: makeCsvBlob,
  runJob: runJob, TEXT_EXAMPLES: TEXT_EXAMPLES
};
});
