// 审计: src/app 里所有静态 t('...') key vs 语言包
const fs = require('fs');
const path = require('path');
const lang = require('../src/lib/server/lang/zh_CN.json');

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
  );
}

const files = walk('src/app').filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
const missing = [];
const staticKeys = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/t\(\s*'([^']+)'/g)) {
    staticKeys.add(m[1]);
    if (!lang[m[1]]) missing.push([f, m[1]]);
  }
}
console.log('页面使用的静态 key 数:', staticKeys.size);
console.log('缺失 key 数:', missing.length);
const byFile = {};
for (const [f, k] of missing) (byFile[f] ??= []).push(k);
for (const [f, ks] of Object.entries(byFile)) {
  console.log(f);
  for (const k of ks) console.log('  MISSING:', k);
}
