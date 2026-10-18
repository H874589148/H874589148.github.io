#!/usr/bin/env node
/* 音乐清单生成器：增删 assets/music 中的音乐后运行 node tools/build-music-list.js。
 * 仅使用 Node 内置模块；只写 playlist.js，不修改音频。导入本模块不会写文件。
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MUSIC_DIR = path.resolve(__dirname, '../assets/music');
const AUDIO_FILE = /\.(mp3|m4a|ogg|wav)$/i;

function scanTracks(root = MUSIC_DIR, io = fs) {
    const tracks = [];
    function visit(dir, prefix) {
        for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            const file = prefix + entry.name;
            if (entry.isDirectory()) visit(path.join(dir, entry.name), file + '/');
            else if (entry.isFile() && AUDIO_FILE.test(entry.name)) {
                tracks.push({ file, title: entry.name.replace(AUDIO_FILE, '') });
            }
        }
    }
    visit(root, '');
    return tracks.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}

function serializeTracks(tracks) {
    const json = JSON.stringify(tracks, null, 2).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '/* 自动生成：请运行 node tools/build-music-list.js 更新，勿手动维护。 */\n' +
        'window.YuexinmiaoMusicTracks = ' + json + ';\n';
}

function build(root = MUSIC_DIR, io = fs) {
    // 完整扫描成功后才写入，读取失败不会以部分结果覆盖原清单。
    const tracks = scanTracks(root, io);
    io.writeFileSync(path.join(root, 'playlist.js'), serializeTracks(tracks), 'utf8');
    return tracks;
}

if (require.main === module) {
    try {
        const tracks = build();
        console.log('[build-music-list] 已生成 assets/music/playlist.js，共 ' + tracks.length + ' 首音乐');
    } catch (err) {
        console.error('[build-music-list] 生成失败：' + err.message);
        process.exitCode = 1;
    }
}
module.exports = { scanTracks, serializeTracks, build };
