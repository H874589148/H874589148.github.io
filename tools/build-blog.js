#!/usr/bin/env node
/* ============================================
   build-blog.js - 博客清单构建脚本
   扫描 blog/posts/*.md（知识分享）与 blog/papers/*.md（论文分享），
   解析 front matter，分别生成 blog/posts.json 与 blog/papers.json
   用法：node tools/build-blog.js（或双击 tools/build-blog.bat）
   零 npm 依赖，仅使用 Node 内置模块
   ============================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var BLOG_DIR = path.resolve(__dirname, '..', 'blog');
/* 两个模块共用同一套列表/详情页（?m= 参数区分），文件名跨目录必须唯一，
   否则详情页路由存在歧义（构建时告警） */
var TARGETS = [
  { key: 'knowledge', label: '知识分享', src: path.join(BLOG_DIR, 'posts'), out: path.join(BLOG_DIR, 'posts.json'), defaultAuthors: 'Hawkeye' },
  { key: 'paper', label: '论文分享', src: path.join(BLOG_DIR, 'papers'), out: path.join(BLOG_DIR, 'papers.json'), defaultAuthors: '' }
];

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

/* 扫描单个模块目录，解析 front matter 并写出清单，返回收录条目列表 */
function scanDir(target) {
  var srcDir = target.src;
  var outFile = target.out;
  var skipped = 0;
  var list = [];

  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    console.warn('[build-blog] 未找到 ' + target.label + '目录: ' + srcDir + '（已生成空清单）');
    fs.writeFileSync(outFile, JSON.stringify(list, null, 2) + '\n', 'utf8');
    return list;
  }

  var files = fs.readdirSync(srcDir)
    .filter(function (f) {
      return /\.md$/i.test(f) && fs.statSync(path.join(srcDir, f)).isFile();
    })
    .sort();

  files.forEach(function (f) {
    var raw = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var parsed = parseFrontMatter(raw);
    var meta = parsed.meta;
    var fail = function (reason) {
      console.warn('[build-blog] 跳过 ' + target.label + '/' + f + '（' + reason + '）');
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
      authors: meta.authors ? String(meta.authors).trim() : (target.defaultAuthors || ''),
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

  fs.writeFileSync(outFile, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log('[build-blog] ' + target.label + '：收录 ' + list.length + ' 篇，跳过 ' + skipped + ' 篇');
  console.log('[build-blog] 清单已生成: ' + path.relative(path.resolve(__dirname, '..'), outFile));
  return list;
}

function main() {
  var all = TARGETS.map(scanDir);

  /* 跨目录重名校验：详情页按文件名在两份清单中顺序查找，重名会导致路由歧义 */
  var seen = {};
  TARGETS.forEach(function (t, i) {
    all[i].forEach(function (item) {
      var lower = item.file.toLowerCase();
      if (seen[lower]) {
        console.warn('[build-blog] 警告：文件名 "' + item.file + '" 同时存在于 '
          + seen[lower] + ' 与 ' + t.label + '，详情页将命中先收录的清单，请重命名其一。');
      } else {
        seen[lower] = t.label;
      }
    });
  });

  console.log('[build-blog] 完成：知识分享 ' + all[0].length + ' 篇 + 论文分享 ' + all[1].length + ' 篇');
}

main();
