/*
 * app.js — 在线收藏夹 应用逻辑
 * 功能：添加 / 编辑 / 删除、分类组织、标签、关键词+标签搜索、排序、导入导出、分类管理。
 */
'use strict';

/* ---------------- 状态 ---------------- */
const state = {
  items: [],
  categories: [],
  filterCategory: null, // null = 全部
  filterTag: null,
  expanded: null, // 已展开的分类路径集合（树形侧边栏）
  search: '',
  sort: 'newest',
  editingId: null,
  formTags: [],
  imageMode: 'url',
  imageData: null,
};

const DEFAULT_CATEGORIES = ['未分类', '工作', '学习', '灵感', '购物', '娱乐', '其他'];

/* ---------------- DOM ---------------- */
const $ = (sel) => document.querySelector(sel);
const el = {
  searchInput: $('#searchInput'),
  categoryList: $('#categoryList'),
  tagCloud: $('#tagCloud'),
  itemsGrid: $('#itemsGrid'),
  emptyState: $('#emptyState'),
  emptyAddBtn: $('#emptyAddBtn'),
  addBtn: $('#addBtn'),
  exportBtn: $('#exportBtn'),
  exportHtmlBtn: $('#exportHtmlBtn'),
  importBtn: $('#importBtn'),
  importFile: $('#importFile'),
  manageCategoriesBtn: $('#manageCategoriesBtn'),
  sortSelect: $('#sortSelect'),
  activeFilters: $('#activeFilters'),
  itemCount: $('#itemCount'),
  // 弹窗
  modal: $('#modal'),
  modalTitle: $('#modalTitle'),
  modalClose: $('#modalClose'),
  itemForm: $('#itemForm'),
  submitBtn: $('#submitBtn'),
  urlField: $('#urlField'),
  urlInput: $('#urlInput'),
  faviconPreview: $('#faviconPreview'),
  imageField: $('#imageField'),
  imageUrlField: $('#imageUrlField'),
  imageUrlInput: $('#imageUrlInput'),
  imageUploadField: $('#imageUploadField'),
  imageUploadInput: $('#imageUploadInput'),
  imagePreviewWrap: $('#imagePreviewWrap'),
  imagePreview: $('#imagePreview'),
  textField: $('#textField'),
  textInput: $('#textInput'),
  titleInput: $('#titleInput'),
  categoryInput: $('#categoryInput'),
  notesInput: $('#notesInput'),
  tagInput: $('#tagInput'),
  tagChips: $('#tagChips'),
  formError: $('#formError'),
  categoryDatalist: $('#categoryDatalist'),
  // 分类管理弹窗
  catModal: $('#catModal'),
  catAddForm: $('#catAddForm'),
  catAddInput: $('#catAddInput'),
  catManageList: $('#catManageList'),
  toastContainer: $('#toastContainer'),
};

/* ---------------- 工具 ---------------- */
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function sanitizeUrl(url) {
  if (!url) return '';
  let u = String(url).trim();
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(u)) u = 'https://' + u;
  if (!/^https?:\/\//i.test(u)) return '';
  return u;
}
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  el.toastContainer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2400);
}
function faviconFor(url) {
  const domain = getDomain(url);
  return domain ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}` : '';
}

/* ---------------- 渲染：分类（树形，可展开） ---------------- */
function buildCategoryTree() {
  const root = { path: '', name: '', children: new Map(), exact: 0, total: 0 };
  const exactCount = {};
  state.items.forEach((it) => {
    const cat = it.category || '未分类';
    exactCount[cat] = (exactCount[cat] || 0) + 1;
  });
  Object.keys(exactCount).forEach((cat) => {
    const parts = cat.split('/').map((s) => s.trim()).filter(Boolean);
    let node = root;
    let path = '';
    parts.forEach((p, i) => {
      path = i === 0 ? p : path + ' / ' + p;
      if (!node.children.has(p)) {
        node.children.set(p, { path, name: p, children: new Map(), exact: 0, total: 0 });
      }
      node = node.children.get(p);
    });
    node.exact = exactCount[cat];
  });
  (function totals(n) {
    let t = n.exact;
    for (const c of n.children.values()) t += totals(c);
    n.total = t;
    return t;
  })(root);
  return root;
}

function renderCategories() {
  const root = buildCategoryTree();
  if (state.expanded === null) {
    state.expanded = new Set();
    for (const c of root.children.values()) state.expanded.add(c.path); // 默认展开一级
  }

  let html =
    `<li class="cat-item ${state.filterCategory === null ? 'active' : ''}" data-cat="__all__">` +
    `<span class="cat-toggle-placeholder"></span>` +
    `<span class="cat-name">全部</span><span class="cat-count">${state.items.length}</span></li>`;

  function renderNode(node, depth) {
    let out = '';
    for (const child of node.children.values()) {
      const hasChildren = child.children.size > 0;
      const isExpanded = state.expanded.has(child.path);
      const isActive = state.filterCategory === child.path;
      const isBranch =
        state.filterCategory &&
        state.filterCategory !== child.path &&
        state.filterCategory.startsWith(child.path + ' / ');
      const chevron = hasChildren
        ? `<span class="cat-toggle ${isExpanded ? 'open' : ''}" data-toggle="${escapeHtml(child.path)}">▸</span>`
        : `<span class="cat-toggle-placeholder"></span>`;
      const cls = `cat-item depth-${depth} ${isActive ? 'active' : ''} ${isBranch ? 'branch' : ''}`;
      out +=
        `<li class="${cls}" data-cat="${escapeHtml(child.path)}" style="padding-left:${depth * 16 + 10}px">` +
        chevron +
        `<span class="cat-name">${escapeHtml(child.name)}</span>` +
        `<span class="cat-count">${child.total}</span></li>`;
      if (hasChildren && isExpanded) out += renderNode(child, depth + 1);
    }
    return out;
  }
  html += renderNode(root, 0);
  el.categoryList.innerHTML = html;
}

function updateCategoryDatalist() {
  const cats = [...new Set([...state.categories, ...state.items.map((i) => i.category || '未分类')])];
  el.categoryDatalist.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
}

/* ---------------- 渲染：标签 ---------------- */
function renderTags() {
  const counts = {};
  state.items.forEach((it) => (it.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!tags.length) {
    el.tagCloud.innerHTML = '<p class="muted">暂无标签</p>';
    return;
  }
  el.tagCloud.innerHTML = tags
    .map(
      (t) =>
        `<span class="tag-chip ${state.filterTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">` +
        `#${escapeHtml(t)}<span class="tag-count">${counts[t]}</span></span>`
    )
    .join('');
}

/* ---------------- 筛选与排序 ---------------- */
function getFilteredItems() {
  let items = state.items.slice();
  if (state.filterCategory) {
    const f = state.filterCategory;
    items = items.filter((it) => {
      const c = it.category || '未分类';
      return c === f || c.startsWith(f + ' / ');
    });
  }
  if (state.filterTag) {
    items = items.filter((it) => (it.tags || []).includes(state.filterTag));
  }
  const q = state.search.trim().toLowerCase();
  if (q) {
    items = items.filter((it) => {
      const hay = [it.title, it.content, it.url, (it.tags || []).join(' '), it.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  items.sort((a, b) => {
    if (state.sort === 'oldest') return a.createdAt - b.createdAt;
    if (state.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh');
    return b.createdAt - a.createdAt;
  });
  return items;
}

/* ---------------- 渲染：卡片 ---------------- */
function renderCard(it) {
  const typeLabel = { link: '链接', image: '图片', text: '文本' }[it.type] || it.type;
  const tagsHtml = (it.tags || [])
    .map((t) => `<span class="tag-pill" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`)
    .join('');

  let media = '';
  if (it.type === 'link') {
    media =
      `<div class="card-media link-media">` +
      `<img class="favicon" src="${faviconFor(it.url)}" onerror="this.style.display='none'" alt="" />` +
      `<div class="link-url">${escapeHtml(it.url || '')}</div></div>`;
  } else if (it.type === 'image') {
    media =
      `<div class="card-media image-media"><img src="${escapeHtml(it.content || '')}" alt="${escapeHtml(it.title || '')}" loading="lazy" /></div>`;
  } else {
    const snippet = String(it.content || '').replace(/\s+/g, ' ').trim();
    media = `<div class="card-media text-media">${escapeHtml(snippet.length > 220 ? snippet.slice(0, 220) + '…' : snippet)}</div>`;
  }

  const cat = it.category || '未分类';
  const safeUrl = sanitizeUrl(it.url);
  return (
    `<article class="card" data-id="${it.id}">` +
    `<div class="card-top">` +
    `<span class="type-badge type-${it.type}">${typeLabel}</span>` +
    `<span class="cat-badge">${escapeHtml(cat)}</span>` +
    `</div>` +
    media +
    `<h3 class="card-title">${escapeHtml(it.title || '(无标题)')}</h3>` +
    (tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : '') +
    (it.notes ? `<p class="card-notes">${escapeHtml(it.notes)}</p>` : '') +
    `<div class="card-footer">` +
    `<span class="card-date">${formatDate(it.createdAt)}</span>` +
    `<div class="card-actions">` +
    (it.type === 'link' && safeUrl
      ? `<a class="icon-btn" href="${safeUrl}" target="_blank" rel="noopener" title="打开链接">↗</a>`
      : '') +
    `<button class="icon-btn" data-act="edit" data-id="${it.id}" title="编辑">✎</button>` +
    `<button class="icon-btn danger" data-act="delete" data-id="${it.id}" title="删除">🗑</button>` +
    `</div></div></article>`
  );
}

function renderItems() {
  const items = getFilteredItems();
  el.itemCount.textContent = `${items.length} 项`;
  if (!items.length) {
    el.itemsGrid.innerHTML = '';
    el.emptyState.classList.remove('hidden');
    return;
  }
  el.emptyState.classList.add('hidden');
  el.itemsGrid.innerHTML = items.map(renderCard).join('');
}

/* ---------------- 渲染：当前筛选 ---------------- */
function renderActiveFilters() {
  const parts = [];
  if (state.filterCategory) parts.push(`分类：${escapeHtml(state.filterCategory)}`);
  if (state.filterTag) parts.push(`标签：#${escapeHtml(state.filterTag)}`);
  if (state.search) parts.push(`搜索：“${escapeHtml(state.search)}”`);
  if (parts.length) {
    el.activeFilters.innerHTML =
      `<span class="filter-label">筛选</span>` +
      parts.map((p) => `<span class="filter-pill">${p}</span>`).join('') +
      `<button id="clearFilters" class="link-btn">清除</button>`;
  } else {
    el.activeFilters.innerHTML = '';
  }
}

/* ---------------- 数据刷新 ---------------- */
async function refresh() {
  state.items = await Store.getAll();
  renderCategories();
  updateCategoryDatalist();
  renderTags();
  renderActiveFilters();
  renderItems();
}

/* ---------------- 弹窗：添加 / 编辑 ---------------- */
function setType(type) {
  el.urlField.classList.toggle('hidden', type !== 'link');
  el.imageField.classList.toggle('hidden', type !== 'image');
  el.textField.classList.toggle('hidden', type !== 'text');
}

function setImageMode(mode) {
  state.imageMode = mode;
  el.imageUrlField.classList.toggle('hidden', mode !== 'url');
  el.imageUploadField.classList.toggle('hidden', mode !== 'upload');
}

function renderTagChips() {
  el.tagChips.innerHTML = state.formTags
    .map((t, i) => `<span class="tag-pill removable" data-i="${i}">#${escapeHtml(t)} <span class="x">×</span></span>`)
    .join('');
}

function showFormError(msg) {
  el.formError.textContent = msg;
  el.formError.classList.remove('hidden');
}
function clearFormError() {
  el.formError.textContent = '';
  el.formError.classList.add('hidden');
}

function resetForm() {
  el.itemForm.reset();
  state.formTags = [];
  state.imageData = null;
  state.imageMode = 'url';
  renderTagChips();
  clearFormError();
  el.faviconPreview.style.display = 'none';
  el.imagePreviewWrap.classList.add('hidden');
  el.imagePreview.removeAttribute('src');
  setType('link');
  setImageMode('url');
}

function openModal(item) {
  resetForm();
  if (item) {
    state.editingId = item.id;
    el.modalTitle.textContent = '编辑收藏';
    el.submitBtn.textContent = '保存修改';
    el.titleInput.value = item.title || '';
    el.categoryInput.value = item.category || '未分类';
    el.notesInput.value = item.notes || '';
    state.formTags = (item.tags || []).slice();
    renderTagChips();
    if (item.type === 'image') {
      setType('image');
      if (String(item.content || '').startsWith('data:')) {
        setImageMode('upload');
        state.imageData = item.content;
        el.imagePreview.src = item.content;
        el.imagePreviewWrap.classList.remove('hidden');
      } else {
        setImageMode('url');
        el.imageUrlInput.value = item.content || item.url || '';
      }
    } else if (item.type === 'text') {
      setType('text');
      el.textInput.value = item.content || '';
    } else {
      setType('link');
      el.urlInput.value = item.url || '';
      el.faviconPreview.src = faviconFor(item.url);
      el.faviconPreview.style.display = item.url ? 'inline-block' : 'none';
    }
  } else {
    state.editingId = null;
    el.modalTitle.textContent = '添加收藏';
    el.submitBtn.textContent = '保存';
    el.categoryInput.value = state.filterCategory && state.filterCategory !== '__all__' ? state.filterCategory : '';
  }
  el.modal.classList.remove('hidden');
  setTimeout(() => el.titleInput.focus(), 50);
}

function closeModal() {
  el.modal.classList.add('hidden');
  state.editingId = null;
}

/* ---------------- 表单提交 ---------------- */
async function handleSubmit(e) {
  e.preventDefault();
  clearFormError();
  const type = document.querySelector('input[name="type"]:checked').value;
  const title = el.titleInput.value.trim();
  const category = el.categoryInput.value.trim() || '未分类';
  const notes = el.notesInput.value.trim();

  let content = '';
  let url = '';

  if (type === 'link') {
    url = sanitizeUrl(el.urlInput.value);
    if (!url) return showFormError('请输入有效的链接地址（http/https）');
    if (!title) {
      const d = getDomain(url);
      el.titleInput.value = d || url;
    }
  } else if (type === 'image') {
    if (state.imageMode === 'url') {
      url = sanitizeUrl(el.imageUrlInput.value);
      if (!url) return showFormError('请输入有效的图片链接');
      content = url;
    } else {
      if (!state.imageData) return showFormError('请选择要上传的图片');
      content = state.imageData;
    }
    if (!title) el.titleInput.value = '图片收藏';
  } else {
    content = el.textInput.value.trim();
    if (!content && !title) return showFormError('请输入文本内容或标题');
    if (!title) el.titleInput.value = content.slice(0, 30);
  }

  const finalTitle = el.titleInput.value.trim() || title;

  const item = {
    id: state.editingId || uid(),
    type,
    title: finalTitle,
    content,
    url,
    category,
    notes,
    tags: state.formTags.slice(),
    createdAt: state.editingId
      ? state.items.find((i) => i.id === state.editingId)?.createdAt || Date.now()
      : Date.now(),
    updatedAt: Date.now(),
  };

  await Store.put(item);
  // 若分类是新增的，记录到分类列表
  if (!state.categories.includes(category)) {
    state.categories.push(category);
    await Store.setSetting('categories', state.categories);
  }
  await refresh();
  closeModal();
  toast(state.editingId ? '已更新收藏' : '已添加收藏', 'success');
}

/* ---------------- 删除 ---------------- */
async function deleteItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  if (!confirm(`确定删除「${item.title || '该收藏'}」吗？此操作不可撤销。`)) return;
  await Store.delete(id);
  await refresh();
  toast('已删除', 'success');
}

/* ---------------- 分类管理 ---------------- */
async function openCatModal() {
  renderCatManager();
  el.catModal.classList.remove('hidden');
}
function closeCatModal() {
  el.catModal.classList.add('hidden');
}
function renderCatManager() {
  const used = {};
  state.items.forEach((it) => {
    const c = it.category || '未分类';
    used[c] = (used[c] || 0) + 1;
  });
  const cats = [...new Set([...state.categories, ...Object.keys(used)])];
  el.catManageList.innerHTML = cats
    .map(
      (c) =>
        `<li class="cat-manage-item">` +
        `<span class="cat-manage-name">${escapeHtml(c)} <span class="muted">(${used[c] || 0})</span></span>` +
        `<button class="icon-btn danger" data-cat-del="${escapeHtml(c)}" title="删除分类">🗑</button>` +
        `</li>`
    )
    .join('');
}
async function addCategory(name) {
  name = name.trim();
  if (!name) return;
  if (state.categories.includes(name)) {
    toast('分类已存在', 'info');
    return;
  }
  state.categories.push(name);
  await Store.setSetting('categories', state.categories);
  renderCatManager();
  updateCategoryDatalist();
  toast('已添加分类', 'success');
}
async function deleteCategory(name) {
  const count = state.items.filter((i) => (i.category || '未分类') === name).length;
  if (count > 0) {
    if (!confirm(`分类「${name}」下有 ${count} 项，删除后这些项将归入「未分类」。确定继续？`)) return;
    for (const it of state.items) {
      if ((it.category || '未分类') === name) {
        it.category = '未分类';
        await Store.put(it);
      }
    }
  }
  state.categories = state.categories.filter((c) => c !== name);
  await Store.setSetting('categories', state.categories);
  if (state.filterCategory === name) state.filterCategory = null;
  await refresh();
  renderCatManager();
  toast('已删除分类', 'success');
}

/* ---------------- 导入 / 导出 ---------------- */
function exportData() {
  const data = {
    app: 'online-bookmarks',
    version: 1,
    exportedAt: Date.now(),
    categories: state.categories,
    items: state.items,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `收藏夹备份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast('已导出备份', 'success');
}

/* 导出为 Netscape 书签 HTML（浏览器可直接导入） */
function exportHtml() {
  const items = state.items;
  if (!items.length) {
    toast('暂无数据可导出', 'info');
    return;
  }
  const root = { name: '收藏夹', children: {}, items: [] };
  function ensure(parts, node) {
    let cur = node;
    for (const p of parts) {
      if (!cur.children[p]) cur.children[p] = { name: p, children: {}, items: [] };
      cur = cur.children[p];
    }
    return cur;
  }
  for (const it of items) {
    const cat = it.category || '未分类';
    const parts = String(cat)
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const node = parts.length ? ensure(parts, root) : root;
    node.items.push(it);
  }
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  function renderNode(node, depth) {
    let out = '';
    const pad = '    '.repeat(depth);
    for (const name of Object.keys(node.children)) {
      const child = node.children[name];
      out += `${pad}<DT><H3>${esc(name)}</H3>\n`;
      out += `${pad}<DL><p>\n`;
      out += renderNode(child, depth + 1);
      out += `${pad}</DL><p>\n`;
    }
    for (const it of node.items) {
      const add = Math.floor((it.createdAt || Date.now()) / 1000);
      out += `${pad}<DT><A HREF="${esc(it.url || '')}" ADD_DATE="${add}">${esc(it.title || '')}</A>\n`;
    }
    return out;
  }
  const content =
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
    '<!-- This is an automatically generated file. -->\n' +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    '<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n' +
    '    <DT><H3>收藏夹</H3>\n    <DL><p>\n' +
    renderNode(root, 2) +
    '    </DL><p>\n</DL><p>\n';
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `收藏夹导出-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast('已导出浏览器书签格式', 'success');
}

/* 解析 Netscape 书签 HTML 为应用数据 */
function parseBookmarks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const found = [];
  function walk(dl, path) {
    if (!dl) return;
    for (const child of dl.children) {
      if (child.tagName !== 'DT') continue;
      const h3 = child.querySelector(':scope > H3');
      const a = child.querySelector(':scope > A');
      if (h3) {
        // 文件夹：子 DL 可能在 DT 内部，也可能是其后的兄弟 DL
        let nested = child.querySelector(':scope > DL');
        if (!nested) {
          let sib = child.nextElementSibling;
          while (sib && sib.tagName !== 'DL') sib = sib.nextElementSibling;
          nested = sib;
        }
        if (nested) walk(nested, path.concat(h3.textContent.trim()));
      } else if (a) {
        found.push({ a, path: path.slice() });
      }
    }
  }
  const top = doc.querySelector('DL');
  walk(top, []);
  const ROOT = '收藏夹';
  return found.map((r) => {
    let path = r.path.slice();
    if (path[0] === ROOT) path = path.slice(1);
    const category = path.length ? path.join(' / ') : '未分类';
    const href = r.a.getAttribute('href') || '';
    const title = (r.a.textContent || '').trim();
    const addDate = r.a.getAttribute('add_date');
    return {
      id: uid(),
      type: 'link',
      title: title || href,
      content: '',
      url: href,
      category,
      tags: path.slice(),
      notes: '',
      createdAt: addDate ? Number(addDate) * 1000 : Date.now(),
      updatedAt: Date.now(),
    };
  });
}

/* 导入书签 HTML：合并去重（按 URL） */
async function importBookmarks(html) {
  const incoming = parseBookmarks(html);
  if (!incoming.length) {
    toast('未在该文件中发现书签', 'info');
    return;
  }
  const existing = await Store.getAll();
  const seen = new Set(
    existing.map((i) => String(i.url || '').toLowerCase()).filter(Boolean)
  );
  let added = 0;
  const newCats = new Set();
  for (const it of incoming) {
    const key = String(it.url || '').toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    await Store.put(it);
    added++;
    if (!state.categories.includes(it.category)) newCats.add(it.category);
  }
  if (newCats.size) {
    state.categories.push(...newCats);
    await Store.setSetting('categories', state.categories);
  }
  await refresh();
  toast(`已导入 ${added} 个书签（跳过重复 ${incoming.length - added} 个）`, 'success');
}

/* 导入 JSON 备份：覆盖现有 */
async function importJson(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.items)) throw new Error('文件格式不正确');
  if (!confirm(`将导入 ${data.items.length} 项，现有数据将被覆盖，是否继续？`)) return;
  await Store.clearAll();
  for (const it of data.items) {
    if (!it.id) it.id = uid();
    if (!it.createdAt) it.createdAt = Date.now();
    await Store.put(it);
  }
  if (Array.isArray(data.categories)) {
    state.categories = data.categories;
    await Store.setSetting('categories', state.categories);
  }
  state.filterCategory = null;
  state.filterTag = null;
  state.search = '';
  el.searchInput.value = '';
  await refresh();
  toast('导入成功', 'success');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const text = reader.result;
      const isHtml = /<DT>\s*<A\s+HREF|<H1>Bookmarks<\/H1>|NETSCAPE-Bookmark/i.test(text);
      if (isHtml) {
        await importBookmarks(text);
      } else {
        await importJson(text);
      }
    } catch (err) {
      toast('导入失败：' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ---------------- 事件绑定 ---------------- */
function wireEvents() {
  // 搜索
  el.searchInput.addEventListener('input', debounce(() => {
    state.search = el.searchInput.value;
    renderActiveFilters();
    renderItems();
  }, 200));

  // 排序
  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    renderItems();
  });

  // 分类点击（展开/折叠 或 筛选）
  el.categoryList.addEventListener('click', (e) => {
    const toggle = e.target.closest('.cat-toggle');
    if (toggle) {
      const path = toggle.dataset.toggle;
      if (state.expanded.has(path)) state.expanded.delete(path);
      else state.expanded.add(path);
      renderCategories();
      return;
    }
    const li = e.target.closest('.cat-item');
    if (!li) return;
    const cat = li.dataset.cat;
    state.filterCategory = cat === '__all__' ? null : cat;
    renderCategories();
    renderActiveFilters();
    renderItems();
  });

  // 标签云点击
  el.tagCloud.addEventListener('click', (e) => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    state.filterTag = chip.dataset.tag;
    renderTags();
    renderActiveFilters();
    renderItems();
  });

  // 卡片标签点击（冒泡到 grid）
  el.itemsGrid.addEventListener('click', (e) => {
    const tagPill = e.target.closest('.tag-pill');
    if (tagPill && !tagPill.classList.contains('removable')) {
      state.filterTag = tagPill.dataset.tag;
      renderTags();
      renderActiveFilters();
      renderItems();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'edit') {
      const item = state.items.find((i) => i.id === id);
      if (item) openModal(item);
    } else if (btn.dataset.act === 'delete') {
      deleteItem(id);
    }
  });

  // 清除筛选
  el.activeFilters.addEventListener('click', (e) => {
    if (e.target.id === 'clearFilters') {
      state.filterCategory = null;
      state.filterTag = null;
      state.search = '';
      el.searchInput.value = '';
      renderCategories();
      renderTags();
      renderActiveFilters();
      renderItems();
    }
  });

  // 添加按钮
  el.addBtn.addEventListener('click', () => openModal(null));
  el.emptyAddBtn.addEventListener('click', () => openModal(null));

  // 弹窗关闭
  el.modal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  el.modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.modal.classList.contains('hidden')) closeModal();
      if (!el.catModal.classList.contains('hidden')) closeCatModal();
    }
  });

  // 类型切换
  document.querySelectorAll('input[name="type"]').forEach((r) =>
    r.addEventListener('change', () => setType(r.value))
  );
  // 图片来源切换
  document.querySelectorAll('input[name="imageMode"]').forEach((r) =>
    r.addEventListener('change', () => setImageMode(r.value))
  );

  // 链接 favicon 预览
  el.urlInput.addEventListener('input', () => {
    const f = faviconFor(el.urlInput.value);
    if (f) {
      el.faviconPreview.src = f;
      el.faviconPreview.style.display = 'inline-block';
    } else {
      el.faviconPreview.style.display = 'none';
    }
  });

  // 图片上传预览
  el.imageUploadInput.addEventListener('change', () => {
    const file = el.imageUploadInput.files && el.imageUploadInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showFormError('图片过大，请选择 8MB 以内的图片');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.imageData = reader.result;
      el.imagePreview.src = reader.result;
      el.imagePreviewWrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  // 标签输入
  el.tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = el.tagInput.value.trim().replace(/^#/, '');
      if (v && !state.formTags.includes(v)) {
        state.formTags.push(v);
        renderTagChips();
      }
      el.tagInput.value = '';
    }
  });
  el.tagInput.addEventListener('blur', () => {
    const v = el.tagInput.value.trim().replace(/^#/, '');
    if (v && !state.formTags.includes(v)) {
      state.formTags.push(v);
      renderTagChips();
      el.tagInput.value = '';
    }
  });
  el.tagChips.addEventListener('click', (e) => {
    const pill = e.target.closest('.tag-pill.removable');
    if (!pill) return;
    const i = Number(pill.dataset.i);
    state.formTags.splice(i, 1);
    renderTagChips();
  });

  // 表单提交
  el.itemForm.addEventListener('submit', handleSubmit);

  // 分类管理
  el.manageCategoriesBtn.addEventListener('click', openCatModal);
  el.catModal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close-cat')) closeCatModal();
  });
  el.catAddForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addCategory(el.catAddInput.value);
    el.catAddInput.value = '';
  });
  el.catManageList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat-del]');
    if (!btn) return;
    deleteCategory(btn.dataset.catDel);
  });

  // 导入导出
  el.exportBtn.addEventListener('click', exportData);
  el.exportHtmlBtn.addEventListener('click', exportHtml);
  el.importBtn.addEventListener('click', () => el.importFile.click());
  el.importFile.addEventListener('change', () => {
    if (el.importFile.files && el.importFile.files[0]) importData(el.importFile.files[0]);
    el.importFile.value = '';
  });
}

/* ---------------- 初始化 ---------------- */
async function init() {
  try {
    let cats = await Store.getSetting('categories');
    state.categories = Array.isArray(cats) && cats.length ? cats : DEFAULT_CATEGORIES.slice();
    if (!cats) await Store.setSetting('categories', state.categories);
  } catch (err) {
    toast('存储初始化失败：' + err.message, 'error');
    state.categories = DEFAULT_CATEGORIES.slice();
  }

  // 首次打开且数据为空时，自动载入内置书签种子
  try {
    const seeded = await Store.getSetting('seeded');
    if (
      !seeded &&
      window.BOOKMARK_SEED &&
      Array.isArray(window.BOOKMARK_SEED) &&
      window.BOOKMARK_SEED.length
    ) {
      for (const it of window.BOOKMARK_SEED) await Store.put(it);
      const seedCats = [...new Set(window.BOOKMARK_SEED.map((i) => i.category))];
      state.categories = [...new Set([...state.categories, ...seedCats])];
      await Store.setSetting('categories', state.categories);
      await Store.setSetting('seeded', true);
      toast(`已自动载入 ${window.BOOKMARK_SEED.length} 个书签`, 'success');
    }
  } catch (err) {
    console.error('种子载入失败', err);
  }

  await refresh();
  wireEvents();
}

document.addEventListener('DOMContentLoaded', init);
