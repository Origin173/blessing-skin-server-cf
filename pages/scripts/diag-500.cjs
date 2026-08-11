// 分析 /admin/i18n 500 页面
const fs = require('fs');
const os = require('os');
const path = require('path');
const html = fs.readFileSync(path.join(os.tmpdir(), 'i18n-500.html'), 'utf8');
console.log('大小:', html.length);

// Next error page 的 digest/message
const m = html.match(/"message\\":\\"[^\\]{0,200}/);
console.log('message:', m ? m[0] : 'none');
const d = html.match(/digest[^,]{0,150}/g);
console.log('digest:', d ? [...new Set(d)].slice(0, 3) : 'none');

// RSC payload 里的异常
const e = html.match(/Error[^\\"<]{0,180}/g);
if (e) {
  const filtered = [...new Set(e)].filter((s) => !s.includes('ErrorBoundary') && !s.includes('errorStyles') && !s.includes('errorScripts') && !s.includes('error-h1') && !s.includes('error-code'));
  console.log('errors:', filtered.slice(0, 8));
}
// 页面上可见文本
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400);
console.log('可见文本:', text);
