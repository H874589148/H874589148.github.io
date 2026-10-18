/* 清单生成器使用内存 io 替身验证扫描、过滤与原子写入；不写临时音频。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { scanTracks, build } = require('../../tools/build-music-list');

function entry(name, type = 'file') {
    return {
        name,
        isFile: () => type === 'file',
        isDirectory: () => type === 'dir',
        isSymbolicLink: () => type === 'link'
    };
}
function fakeIo(dirs) {
    const writes = [];
    return {
        writes,
        readdirSync(dir) {
            if (!Object.hasOwn(dirs, dir)) throw new Error('目录不存在：' + dir);
            return dirs[dir];
        },
        writeFileSync(file, content) { writes.push({ file, content }); }
    };
}

test('递归扫描音频，跳过符号链接和非音频并稳定排序', () => {
    const root = 'music-root';
    const sub = path.join(root, '子目录');
    const dirs = {
        [root]: [entry('乙.mp3'), entry('link.wav', 'link'), entry('说明.txt', 'dir'), entry('b.m4a'), entry('子目录', 'dir')],
        [sub]: [entry('甲 #%.ogg'), entry('skip.webm'), entry('更深', 'dir')],
        [path.join(sub, '更深')]: [entry('丙.WAV')],
        [path.join(root, '说明.txt')]: []
    };
    const tracks = scanTracks(root, fakeIo(dirs));
    assert.deepEqual(tracks, [
        { file: 'b.m4a', title: 'b' },
        { file: '乙.mp3', title: '乙' },
        { file: '子目录/更深/丙.WAV', title: '丙' },
        { file: '子目录/甲 #%.ogg', title: '甲 #%'}
    ]);
});

test('完整扫描成功后生成可执行清单，特殊字符安全转义', () => {
    const root = 'music-root';
    const tracks = [{ file: '分行\u2028.mp3', title: '分行\u2028' }, { file: '甲 #%.mp3', title: '甲 #%' }];
    const io = fakeIo({ [root]: [entry('甲 #%.mp3'), entry('分行\u2028.mp3')] });
    const result = build(root, io);
    assert.equal(JSON.stringify(result), JSON.stringify(tracks));
    assert.equal(io.writes.length, 1);
    assert.equal(io.writes[0].file, path.join(root, 'playlist.js'));
    const sandbox = { window: {} };
    new vm.Script(io.writes[0].content, { filename: 'playlist.js' }).runInContext(vm.createContext(sandbox));
    assert.equal(JSON.stringify(sandbox.window.YuexinmiaoMusicTracks), JSON.stringify(tracks));
    assert.match(io.writes[0].content, /window\.YuexinmiaoMusicTracks = \[/);
    assert.match(io.writes[0].content, /\\u2028/);
});

test('空目录生成空清单，扫描失败不覆盖旧文件', () => {
    const root = 'music-root';
    const emptyIo = fakeIo({ [root]: [] });
    assert.deepEqual(build(root, emptyIo), []);
    assert.equal(emptyIo.writes.length, 1);
    assert.match(emptyIo.writes[0].content, /YuexinmiaoMusicTracks = \[\]/);
    const brokenIo = fakeIo({});
    assert.throws(() => build(root, brokenIo), /目录不存在/);
    assert.equal(brokenIo.writes.length, 0);
});

test('真实 assets/music 清单与当前目录扫描结果一致', () => {
    const actual = scanTracks();
    const sandbox = { window: {} };
    new vm.Script(fs.readFileSync(path.resolve(__dirname, '../../assets/music/playlist.js'), 'utf8'), { filename: 'playlist.js' })
        .runInContext(vm.createContext(sandbox));
    assert.equal(JSON.stringify(sandbox.window.YuexinmiaoMusicTracks), JSON.stringify(actual));
    assert.ok(actual.length > 0);
});
