// 审计: client 组件 fetch 路径 vs 已注册路由
const fs = require('fs');
const path = require('path');

function walk(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
  );
}

// 1. 提取 client 组件的 fetch/axios 路径 (静态字符串)
const comps = walk('src/components').filter((f) => f.endsWith('.tsx'));
const calls = [];
for (const f of comps) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"]+|[`'"]\/[^`'"]*)/g)) {
    const p = m[1].replace(/[`'"$]/g, '');
    if (p.startsWith('/api/') || p.startsWith('/user/') || p.startsWith('/admin/') || p.startsWith('/skinlib/') || p.startsWith('/texture')) {
      calls.push([f, p]);
    }
  }
}

// 2. 提取所有已注册路由
const routes = new Set();
for (const f of walk('src/lib/server/routes').filter((x) => x.endsWith('.ts'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\.(get|post|put|delete|patch|any|all)\(\s*[`'"](\/[^`'"]*|[`'"]\/[^`'"]*)/g)) {
    let p = m[2].replace(/[`'"]/g, '');
    // 去掉参数占位符 (:xxx / * ) → 生成前缀匹配
    p = p.split(':')[0].replace(/\/\*+$/, '');
    routes.add(p);
  }
}

// 3. 核对
console.log('=== client fetch 路径核对:');
const missing = [];
for (const [f, p] of calls) {
  // 路径参数化后检查是否有前缀匹配的路由
  const base = p.replace(/\/\d+(\/|$)/g, '/:id$1').replace(/\/[a-f0-9]{32}/, '/:hash');
  const matched = [...routes].some((r) => base === r || base.startsWith(r + '/') || r.startsWith(base + '/'));
  if (!matched) missing.push([f, p]);
}
for (const [f, p] of missing) console.log('  MISS:', f.split(path.sep).pop(), p);
console.log('未匹配数:', missing.length);
console.log('已注册路由前缀:', [...routes].sort().join(' | '));
