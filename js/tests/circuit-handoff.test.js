/* 传输契约、异常、会话及原生链接激活的确定性测试。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { environment, Element, plain, settle } = require('./handoff-harness');
const empty = () => ({ items: [], groups: [] });
const component = () => ({ kind: 'comp', id: 'r', type: 'resistor', x: 12.5, y: -37.2, rot: 3, fh: true, fv: false, text: 'R1' });
const drawing = () => ({ items: [component(), { kind: 'label', id: 't', x: 10, y: 30, text: 'R1\n10k', richText: { version: 1, align: 'middle', lines: [{ runs: [{ text: 'R', bold: true }, { text: '1', script: 'sub', size: 13 }] }] } }, { kind: 'wire', id: 'w', pts: [{ x: 1, y: 3 }, { x: 12.5, y: -37.2 }], stroke: 'var(--color-text)', sw: 2, dash: '3 2' }], groups: [{ id: 'g', members: ['r', 't'] }] });
function pack(doc = drawing(), title = '当前图') { return { doc, title, context: { module: 'test' } }; }
test('完整图纸校验为深拷贝，保留镜像、小数坐标、线型、富文本和分组', () => {
    const { s } = environment(), doc = drawing(), copy = s.CircuitHandoff.validateDoc(doc);
    assert.deepEqual(plain(copy), doc); copy.items[0].x = 999; assert.equal(doc.items[0].x, 12.5);
    assert.deepEqual(plain(s.CircuitHandoff.validateDoc(empty())), empty());
    for (const type of Object.keys(s.Razavi.metaAll())) assert.doesNotThrow(() => s.CircuitHandoff.validateDoc({ items: [{ ...component(), type }], groups: [] }));
});
test('新旧地与器件线型经 handoff 和会话 JSON 完整往返', async () => {
    const h = environment(), H = h.s.CircuitHandoff, d = drawing();
    d.items.push({ ...component(), id: 'g1', type: 'ground', dash: '7 4' }, { ...component(), id: 'g2', type: 'ground-triangle', dash: '2 3' });
    d.items[0].dash = '7 4';
    const token = H.create('交互升级'); H.publish(token, pack(d));
    const record = H.read(token); assert.deepEqual(plain(record.doc), d);
    H.saveSession(token, record); const saved = H.loadSession(token); assert.deepEqual(plain(saved.doc), d);
    assert.equal(h.s.Razavi.textPos(saved.doc.items.at(-1).type), 'none');
});
test('损坏、未知版本/器件/变体、ID、坐标、富文本与分组拒绝', () => {
    const { s } = environment(), H = s.CircuitHandoff;
    const cases = [d => d.version = 2, d => d.items[0].type = 'missing', d => d.items[0].rot = 90, d => d.items[0].x = Infinity,
        d => d.items[0].y = 1e8, d => d.items[0].id = 'w', d => d.items[0].variant = 'wrong', d => d.items[0].stroke = 'url(https://bad)',
        d => d.items[0].sw = 0, d => d.items[0].dash = 'NaN', d => d.items[0].fh = 'true', d => d.items[0].id = '',
        d => d.items[1].richText.lines[0].runs[0].script = 'bad', d => d.items[2].pts = [{ x: 0, y: 0 }],
        d => d.groups[0].members.push('missing'), d => d.groups[0].members.push('r'), d => d.groups[0].id = 'r'];
    for (const change of cases) { const d = drawing(); change(d); assert.throws(() => H.validateDoc(d)); }
    assert.throws(() => H.validateDoc(JSON.parse('{"items":[],"__proto__":{"polluted":true}}')), /危险/);
    assert.throws(() => H.clone({ a: undefined }), /JSON/);
    assert.throws(() => H.clone({ text: '汉'.repeat(800000) }), /2 MiB/);
    assert.throws(() => H.validateDoc({ items: Array.from({ length: 5001 }, (_, i) => ({ ...component(), id: String(i) })) }), /5000/);
    assert.throws(() => H.validateDoc({ items: [{ kind: 'wire', id: 'w', pts: Array.from({ length: 20001 }, () => ({ x: 0, y: 0 })) }] }), /20000/);
});
test('TF 元数据保存及参数值/前缀校验，不限制其他模块器件', () => {
    const { s } = environment(), H = s.CircuitHandoff;
    const d = { items: [{ ...component(), analysis: { version: 1, symbol: 'R1', value: '2.5e1', prefix: 'k' } }], groups: [], inputKind: 'current', analysisContext: { version: 1, kind: 'tf' } };
    assert.deepEqual(plain(H.validateDoc(d)), d);
    for (const value of ['0', '-1', 'NaN', '1e308', '1e']) { const bad = plain(d); bad.items[0].analysis.value = value; assert.throws(() => H.validateDoc(bad)); }
    d.items[0].analysis.value = ''; assert.doesNotThrow(() => H.validateDoc(d));
});
test('并发 token、乱序发布、结构一致和原存档隔离', async () => {
    const h = environment(), H = h.s.CircuitHandoff, main = 'ee-circuit-sketch-v2';
    h.s.localStorage.setItem(main, 'original');
    const a = H.create('A'), b = H.create('B'); assert.notEqual(a, b); assert.match(a, /^[a-f0-9]{32}$/);
    const wa = H.wait(a), wb = H.wait(b);
    H.publish(b, pack(empty(), 'B')); h.events.fire('storage'); assert.equal((await wb).title, 'B');
    H.publish(a, pack()); h.events.fire('storage'); const r = await wa;
    assert.deepEqual(plain(r.doc), drawing()); assert.equal(r.source, 'A'); assert.equal(h.s.localStorage.getItem(main), 'original');
    assert.throws(() => H.publish(a, pack()), /完成/); assert.equal(h.timers.size, 0);
});
test('超时、源错误、失效 token、损坏及过期只清理本功能记录', async () => {
    const h = environment(), H = h.s.CircuitHandoff, a = H.create('A');
    const pending = assert.rejects(H.wait(a), /超时/); h.tick(H.WAIT); await pending;
    H.publish(a, null, Error('草稿未提交')); await assert.rejects(H.wait(a), /草稿/);
    await assert.rejects(H.wait('bad'), /无效/);
    h.s.localStorage.setItem(H.PREFIX + 'broken', '{'); h.s.localStorage.setItem('other', '{"expiresAt":1}');
    h.tick(H.TTL); H.create('fresh'); assert.equal(h.s.localStorage.getItem(H.PREFIX + a), null);
    assert.equal(h.s.localStorage.getItem(H.PREFIX + 'broken'), '{'); assert.ok(h.s.localStorage.getItem('other'));
    await assert.rejects(H.wait(a), /失效/);
});
test('会话刷新优先恢复修改、两 token 不串档，会话失败不消耗原记录', () => {
    const h = environment(), H = h.s.CircuitHandoff, a = H.create('A'), b = H.create('B');
    H.publish(a, pack()); H.publish(b, pack(empty()));
    const r = H.read(a); r.doc.items[0].x = 55; H.saveSession(a, r); H.consume(a);
    assert.equal(H.loadSession(a).doc.items[0].x, 55); assert.equal(H.loadSession(b), null);
    const rb = H.read(b); h.s.sessionStorage.failWrite = true; assert.throws(() => H.saveSession(b, rb), /配额/);
    H.acknowledge(b); assert.equal(H.read(b).status, 'ready'); assert.ok(H.read(b).receivedAt);
    h.tick(H.TTL * 2); assert.equal(H.loadSession(a).doc.items[0].x, 55);
});
test('HTTP、存储不可用、配额不足明确失败', async () => {
    const h = environment(), H = h.s.CircuitHandoff;
    h.s.location.protocol = 'file:'; assert.throws(() => H.create('A'), /HTTP/);
    h.s.location.protocol = 'https:'; h.s.localStorage.failWrite = true; assert.throws(() => H.create('A'), /配额/);
    h.s.localStorage.failWrite = false; const t = H.create('A'); h.s.localStorage.failRead = true;
    await assert.rejects(H.wait(t), /读取/); h.s.localStorage.failRead = false; h.s.localStorage.failWrite = true;
    assert.throws(() => H.publish(t, pack()), /配额/);
});
test('原生链接在异步快照前获得独立 token，未响应与接收状态可见', async () => {
    const h = environment(), H = h.s.CircuitHandoff, a = new Element('a'), status = new Element(); let resolve;
    H.bind(a, '模块', () => new Promise(r => { resolve = r; }), status);
    const event = a.fire('click'); assert.ok(!event.prevented); assert.equal(a.target, '_blank'); assert.equal(a.rel, 'noopener');
    const token = a.href.split('=')[1]; assert.equal(H.read(token).status, 'pending'); resolve(pack()); await settle();
    assert.equal(H.read(token).status, 'ready'); h.tick(H.WAIT); assert.match(status.textContent, /新页尚未响应/);
    a.fire('auxclick', { button: 1 }); const second = a.href.split('=')[1]; assert.notEqual(second, token);
    resolve(pack(empty())); await settle(); H.consume(second); h.events.fire('storage'); assert.match(status.textContent, /已接收/);
    a.setAttribute('aria-disabled', 'true'); assert.ok(a.fire('click').prevented);
});
test('同步/异步取图异常发布 error，禁用或存储失败不跳转普通主档', async () => {
    const h = environment(), H = h.s.CircuitHandoff, a = new Element('a'), status = new Element();
    H.bind(a, '模块', () => { throw Error('存在草稿'); }, status); a.fire('click');
    assert.equal(H.read(a.href.split('=')[1]).status, 'error'); assert.match(status.textContent, /草稿/);
    h.s.localStorage.failWrite = true; assert.ok(a.fire('click').prevented);
    h.s.localStorage.failWrite = false;
    const b = new Element('a'); H.bind(b, '模块', () => Promise.reject(Error('超时')), status); b.fire('click'); await settle();
    assert.equal(H.read(b.href.split('=')[1]).error, '超时');
});
