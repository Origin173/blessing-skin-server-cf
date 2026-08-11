// 分析首页 500 错误
const fs = require('fs');
const os = require('os');
const path = require('path');
const html = fs.readFileSync(path.join(os.tmpdir(), 'home-500.html'), 'utf8');
console.log('HTML 大小:', html.length);

// error boundary 对象
const m = html.match(/"error":\{[^}]{0,300}/);
console.log('error obj:', m ? m[0] : 'none');

// digest
const d = html.match(/digest[^,]{0,120}/g);
console.log('digests:', d ? [...new Set(d)].slice(0, 3) : 'none');

// 任何包含 Error 的字符串 (排除 i18n JSON)
const e = html.match(/Error[^\\"]{0,150}/g);
const filtered = e ? [...new Set(e)].filter((s) => !s.includes('fileExtError') && !s.includes('ErrorBoundary') && !s.includes('errorStyles')).slice(0, 5) : 'none';
console.log('Error 消息:', filtered);
