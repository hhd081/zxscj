// tools/parse-bookmarks.mjs
// 将 Netscape 书签 HTML 转换为在线收藏夹的数据格式，输出 assets/seed.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || 'C:/Users/ASUS/Desktop/bookmarks_2026_10_8.html';
const OUT = join(__dirname, '..', 'assets', 'seed.js');

const text = readFileSync(SRC, 'utf8');

function decode(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const re =
  /<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A\s+([^>]*)>([\s\S]*?)<\/A>|<DL>|<\/DL>/gi;

const stack = [];
const items = [];
let m;
while ((m = re.exec(text)) !== null) {
  if (m[1] !== undefined) {
    // H3 folder
    stack.push(decode(m[1]).trim());
  } else if (m[2] !== undefined) {
    // A bookmark
    const attrs = m[2];
    const titleRaw = m[3];
    const href = (attrs.match(/HREF="([^"]*)"/i) || [])[1] || '';
    const addDate = (attrs.match(/ADD_DATE="(\d+)"/i) || [])[1];
    const title = decode(titleRaw).trim();
    const path = stack.slice();
    items.push({ href, title, path, addDate });
  } else if (m[0].toLowerCase() === '<dl>') {
    // opening DL: nothing to push (folder already pushed on H3)
  } else {
    // closing </DL>
    if (stack.length) stack.pop();
  }
}

// 转换成 app 数据格式
const ROOT = '收藏夹';
const out = [];
for (const it of items) {
  let path = it.path.slice();
  if (path[0] === ROOT) path = path.slice(1);
  const category = path.length ? path.join(' / ') : '未分类';
  const tags = path.slice(); // 每个层级文件夹作为标签，便于跨类检索
  out.push({
    id: 'seed-' + out.length,
    type: 'link',
    title: it.title || it.href,
    content: '',
    url: it.href,
    category,
    tags,
    notes: '',
    createdAt: it.addDate ? Number(it.addDate) * 1000 : Date.now(),
    updatedAt: it.addDate ? Number(it.addDate) * 1000 : Date.now(),
  });
}

const cats = {};
out.forEach((i) => (cats[i.category] = (cats[i.category] || 0) + 1));
console.log('总书签数:', out.length);
console.log('分类分布:');
Object.entries(cats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => console.log(`  ${c}: ${n}`));

const data = `// 自动生成：由浏览器书签 HTML 转换而来，首次打开应用且数据为空时自动载入。
window.BOOKMARK_SEED = ${JSON.stringify(out, null, 0)};
`;
writeFileSync(OUT, data, 'utf8');
console.log('已写入', OUT);
