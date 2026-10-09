#!/usr/bin/env node
/* ============================================
   build-blog.js - 论文分享清单构建脚本
   扫描 blog/posts/*.md，解析 front matter，生成 blog/posts.json
   用法：node tools/build-blog.js（或双击 tools/build-blog.bat）
   零 npm 依赖，仅使用 Node 内置模块
   ============================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var POSTS_DIR = path.resolve(__dirname, '..', 'blog', 'posts');
var OUT_FILE = path.resolve(__dirname, '..', 'blog', 'posts.json');

/* 解析 front matter，仅支持本站所用子集：
   key: value 与 tags: [a, b] 单行数组，value 中可再含冒号 */
function parseFrontMatter(raw) {
  var m = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(raw);
  if (!m) return { meta: null, body: raw };
  var meta = {};
  m[1].split(/\r?\n/).forEach(function (line) {
    var idx = line.indexOf(':');
    if (idx <= 0) return;
    var key = line.slice(0, idx).trim();
    var val = line.slice(idx + 1).trim();
    if (/^\[[\s\S]*\]$/.test(val)) {
      val = val.slice(1, -1).split(',')
        .map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); })
        .filter(function (s) { return s !== ''; });
    }
    meta[key] = val;
  });
  return { meta: meta, body: raw.slice(m[0].length) };
}

/* 规范化日期：容忍 YYYY/MM/DD，输出 YYYY-MM-DD */
function normalizeDate(s) {
  var d = String(s || '').trim().replace(/\//g, '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : (/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)
    ? d.split('-').map(function (p, i) { return i === 0 ? p : ('0' + p).slice(-2); }).join('-')
    : '');
}

/* readtime 缺省估算：CJK 字符数 + 英文单词数，按 400 字/分钟，至少 1 分钟 */
function estimateReadtime(body) {
  var cjk = (body.match(/[\u4e00-\u9fff]/g) || []).length;
  var words = (body.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9\-]*/g) || []).length;
  return Math.max(1, Math.round((cjk + words) / 400));
}

function main() {
  if (!fs.existsSync(POSTS_DIR) || !fs.statSync(POSTS_DIR).isDirectory()) {
    console.error('[build-blog] 未找到文章目录: ' + POSTS_DIR);
    process.exit(1);
  }

  var files = fs.readdirSync(POSTS_DIR)
    .filter(function (f) {
      return /\.md$/i.test(f) && fs.statSync(path.join(POSTS_DIR, f)).isFile();
    })
    .sort();

  var list = [];
  var skipped = 0;

  files.forEach(function (f) {
    var raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    var parsed = parseFrontMatter(raw);
    var meta = parsed.meta;
    var fail = function (reason) {
      console.warn('[build-blog] 跳过 ' + f + '（' + reason + '）');
      skipped++;
    };
    if (!meta) return fail('缺少 --- front matter 头');
    if (!meta.title) return fail('缺少 title');
    var date = normalizeDate(meta.date);
    if (!date) return fail('date 需为 YYYY-MM-DD');
    var tags = Array.isArray(meta.tags)
      ? meta.tags
      : String(meta.tags || '').split(/[,，\s]+/).filter(Boolean);
    if (!tags.length) return fail('缺少 tags');
    list.push({
      file: f,
      title: String(meta.title).trim(),
      date: date,
      tags: tags,
      authors: meta.authors ? String(meta.authors).trim() : '',
      source: meta.source ? String(meta.source).trim() : '',
      abstract: meta.abstract ? String(meta.abstract).trim() : '',
      readtime: parseInt(meta.readtime, 10) || estimateReadtime(parsed.body)
    });
  });

  /* 按日期倒序，同日期按文件名倒序 */
  list.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.file < b.file ? 1 : -1;
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log('[build-blog] 完成：收录 ' + list.length + ' 篇，跳过 ' + skipped + ' 篇');
  console.log('[build-blog] 清单已生成: blog/posts.json');
}

main();
