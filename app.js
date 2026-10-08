/* ============================================================
 *  轻量 Markdown 渲染器（无依赖）
 * ============================================================ */
const MD = (function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(u) {
    return /^(https?:|mailto:|\/|#)/i.test(u) ? u : '#';
  }
  function inline(text) {
    let s = text;
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000CODE' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) =>
      /^https?:/i.test(u) ? '<img src="' + safeUrl(u) + '" alt="' + alt + '" loading="lazy">' : alt);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) =>
      '<a href="' + safeUrl(u) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => '<code>' + escapeHtml(codes[Number(i)]) + '</code>');
    return s;
  }
  function render(src) {
    if (!src) return '';
    src = String(src).replace(/\r\n?/g, '\n');
    const lines = src.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(\w*)/);
      if (fence) {
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        const codeId = 'code_' + Math.random().toString(36).slice(2, 8);
        out.push('<pre id="' + codeId + '"><div class="md-code-head"><span>' + escapeHtml(lang || 'code') +
          '</span><button class="md-copy" data-target="' + codeId + '">复制</button></div><code>' +
          escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { const lv = h[1].length; out.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'); i++; continue; }
      if (/^(\s*)(---|\*\*\*|___)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + render(buf.join('\n')) + '</blockquote>');
        continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
        out.push('<ul>' + buf.map(x => '<li>' + inline(x) + '</li>').join('') + '</ul>');
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
        out.push('<ol>' + buf.map(x => '<li>' + inline(x) + '</li>').join('') + '</ol>');
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        const parseRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        const header = parseRow(line); i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
        let html = '<table><thead><tr>' + header.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>';
        for (const r of rows) html += '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>';
        html += '</tbody></table>';
        out.push(html);
        continue;
      }
      const buf = [line]; i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^```/.test(lines[i]) &&
             !/^(#{1,6})\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) &&
             !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) &&
             !/^(\s*)(---|\*\*\*|___)\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      out.push('<p class="md-p">' + inline(buf.join('\n')) + '</p>');
    }
    return out.join('');
  }
  return { render, escapeHtml };
})();

/* ============================================================
 *  本地加密
 * ============================================================ */
const CRYPTO = (() => {
  const SALT = new TextEncoder().encode('roleplay-pwa-salt-v1');
  let cachedKey = null;
  async function deriveKey(pin) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: SALT, iterations: 120000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function setPin(pin) {
    if (!pin) { cachedKey = null; return; }
    cachedKey = await deriveKey(pin);
  }
  function hasKey() { return !!cachedKey; }
  async function encrypt(plain) {
    if (!cachedKey) return { plain: true, data: plain };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cachedKey, enc.encode(plain));
    const buf = new Uint8Array(iv.byteLength + cipher.byteLength);
    buf.set(iv, 0); buf.set(new Uint8Array(cipher), iv.byteLength);
    return { plain: false, data: btoa(String.fromCharCode(...buf)) };
  }
  async function decrypt(payload) {
    if (!payload) return '';
    if (payload.plain) return payload.data || '';
    if (!cachedKey) throw new Error('需要 PIN 解锁');
    const buf = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const cipher = buf.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cachedKey, cipher);
    return new TextDecoder().decode(dec);
  }
  return { setPin, hasKey, encrypt, decrypt, isPlain: (p) => !!p && p.plain };
})();

/* ============================================================
 *  主题 / 字号 / 主题色
 * ============================================================ */
const THEME_KEY = 'rp_theme';
const ACCENT_KEY = 'rp_accent';
const FONT_KEY = 'rp_fontScale';
const THEMES = ['auto', 'light', 'dark', 'oled'];
const THEME_ICONS = { auto: '🌓', light: '☀️', dark: '🌙', oled: '⬛' };
const PRESET_COLORS = [
  { name: '蓝', hex: '#4a6cf7' }, { name: '紫', hex: '#8b5cf6' },
  { name: '粉', hex: '#ec4899' }, { name: '红', hex: '#ef4444' },
  { name: '橙', hex: '#f59e0b' }, { name: '绿', hex: '#10b981' },
  { name: '青', hex: '#06b6d4' }, { name: '灰', hex: '#64748b' }
];
let currentAccent = localStorage.getItem(ACCENT_KEY) || '#4a6cf7';

function getResolvedMode() {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  if (saved === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return saved;
}
function applyTheme() {
  const mode = getResolvedMode();
  document.documentElement.setAttribute('data-theme', mode);
  const meta = document.getElementById('metaThemeColor');
  if (meta) meta.setAttribute('content', mode === 'oled' ? '#000000' : mode === 'dark' ? '#0f1117' : '#f5f6fa');
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = THEME_ICONS[saved] || '🌓';
  applyAccent(currentAccent);
}
function setTheme(mode) { localStorage.setItem(THEME_KEY, mode); applyTheme(); updateThemeButtons(); }
function cycleTheme() {
  const cur = localStorage.getItem(THEME_KEY) || 'auto';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  setTheme(next);
  const labels = { auto: '跟随系统', light: '浅色', dark: '深色', oled: '纯黑' };
  toast(labels[next] || next);
}
function updateThemeButtons() {
  const cur = localStorage.getItem(THEME_KEY) || 'auto';
  ['auto', 'light', 'dark', 'oled'].forEach(m => {
    const el = document.getElementById('theme' + m[0].toUpperCase() + m.slice(1));
    if (el) el.style.borderColor = (m === cur) ? 'var(--accent)' : '';
  });
}
function applyAccent(color) {
  currentAccent = color;
  const mode = getResolvedMode();
  if (window.__applyAllColors) window.__applyAllColors(color, mode);
}
function applyFontScale(scale) {
  document.documentElement.style.setProperty('--font-scale', scale);
  const label = document.getElementById('fontScaleLabel');
  if (label) label.textContent = Math.round(scale * 100) + '%';
  const range = document.getElementById('fontScaleRange');
  if (range) range.value = Math.round(scale * 100);
}
function initAppearance() {
  applyTheme();
  const scale = Number(localStorage.getItem(FONT_KEY) || 1);
  applyFontScale(scale);
  updateThemeButtons();
  const sw = document.getElementById('swatches');
  sw.innerHTML = '';
  PRESET_COLORS.forEach(c => {
    const el = document.createElement('div');
    el.className = 'swatch'; el.style.background = c.hex; el.title = c.name; el.dataset.color = c.hex;
    el.onclick = () => {
      localStorage.setItem(ACCENT_KEY, c.hex);
      applyAccent(c.hex);
      document.getElementById('accentPicker').value = c.hex;
      updateSwatchActive(c.hex);
      toast('主题色：' + c.name);
    };
    sw.appendChild(el);
  });
  updateSwatchActive(currentAccent);
  document.getElementById('accentPicker').value = currentAccent;
  document.getElementById('accentPicker').oninput = (e) => {
    const c = e.target.value;
    localStorage.setItem(ACCENT_KEY, c);
    applyAccent(c); updateSwatchActive(c);
  };
  document.getElementById('fontScaleRange').oninput = (e) => {
    const s = Number(e.target.value) / 100;
    localStorage.setItem(FONT_KEY, s);
    applyFontScale(s);
  };
  document.getElementById('themeAuto').onclick = () => setTheme('auto');
  document.getElementById('themeLight').onclick = () => setTheme('light');
  document.getElementById('themeDark').onclick = () => setTheme('dark');
  document.getElementById('themeOled').onclick = () => setTheme('oled');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme();
  });
}
function updateSwatchActive(color) {
  document.querySelectorAll('.swatch').forEach(el => {
    el.classList.toggle('active', (el.dataset.color || '').toLowerCase() === (color || '').toLowerCase());
  });
}

/* ============================================================
 *  API 模板
 * ============================================================ */
const API_TEMPLATES = {
  deepseek: { name: 'DeepSeek', base: 'https://api.deepseek.com', models: [
    { id: 'deepseek-chat', desc: '通用对话', badge: '推荐' },
    { id: 'deepseek-reasoner', desc: '推理模型', badge: 'R1' }]},
  openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', models: [
    { id: 'gpt-4o-mini', desc: '轻量', badge: '推荐' },
    { id: 'gpt-4o', desc: '旗舰' }, { id: 'gpt-4-turbo', desc: '上一代' }]},
  siliconflow: { name: 'SiliconFlow', base: 'https://api.siliconflow.cn/v1', models: [
    { id: 'deepseek-ai/DeepSeek-V3', desc: 'V3', badge: '推荐' },
    { id: 'deepseek-ai/DeepSeek-R1', desc: 'R1' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', desc: 'Qwen 72B' }]},
  moonshot: { name: 'Moonshot', base: 'https://api.moonshot.cn/v1', models: [
    { id: 'moonshot-v1-8k', desc: '8K', badge: '推荐' },
    { id: 'moonshot-v1-32k', desc: '32K' }]},
  zhipu: { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', models: [
    { id: 'glm-4-plus', desc: '旗舰', badge: '推荐' },
    { id: 'glm-4-flash', desc: '极速' }]},
  dashscope: { name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: [
    { id: 'qwen-plus', desc: 'Plus', badge: '推荐' },
    { id: 'qwen-max', desc: 'Max' }]},
  ollama: { name: 'Ollama', base: 'http://localhost:11434/v1', models: [
    { id: 'qwen2.5', desc: '本地', badge: '本地' },
    { id: 'llama3.1', desc: '本地' }]},
  custom: { name: '自定义', base: '', models: [] }
};

/* ============================================================
 *  IndexedDB v4
 * ============================================================ */
let db;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('roleplay_pwa', 4);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('messages')) {
        const store = d.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('convId', 'convId');
        store.createIndex('parentId', 'parentId');
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('characters')) d.createObjectStore('characters', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('apis')) d.createObjectStore('apis', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('conversations')) {
        const cs = d.createObjectStore('conversations', { keyPath: 'id' });
        cs.createIndex('charId', 'charId');
      }
      if (!d.objectStoreNames.contains('knowledge')) {
        const ks = d.createObjectStore('knowledge', { keyPath: 'id' });
        ks.createIndex('charId', 'charId');
      }
      if (!d.objectStoreNames.contains('groups')) {
        d.createObjectStore('groups', { keyPath: 'convId' });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : r);
    t.onerror = () => reject(t.error);
  });
}
const DB = {
  put: (s, v) => tx(s, 'readwrite', st => st.put(v)),
  get: (s, k) => tx(s, 'readonly', st => st.get(k)),
  del: (s, k) => tx(s, 'readwrite', st => st.delete(k)),
  all: (s) => tx(s, 'readonly', st => st.getAll()),
  allByIndex: (store, indexName, value) => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const idx = t.objectStore(store).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }),
  allByConv: (convId) => DB.allByIndex('messages', 'convId', convId),
  clear: (s) => tx(s, 'readwrite', st => st.clear())
};

/* ============================================================
 *  状态
 * ============================================================ */
let characters = [];
let currentCharId = null;
let conversations = [];
let currentConvId = null;
let messages = [];
let activeLeafId = null;
let rootId = null;
let streamingText = null;
let isGenerating = false;
let currentAbort = null;
let apis = [];
let currentApiId = null;
let knowledgeList = [];
let kbEditingId = null;
let currentGroup = null;
let groupEditingMemberId = null;
const CONFIG = { recentRounds: 12 };

function genId() { return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function genConvId() { return 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
function genKbId() { return 'kb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
function genMemberId() { return 'gm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
function getCurrentChar() { return characters.find(c => c.id === currentCharId); }
function getCurrentApi() { return apis.find(a => a.id === currentApiId); }
function getCharById(id) { return characters.find(c => c.id === id); }
function getApiById(id) { return apis.find(a => a.id === id); }

let toastTimer;
function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) {}
  return false;
}

/* ============================================================
 *  数据迁移
 * ============================================================ */
async function migrateV3IfNeeded() {
  const flag = await DB.get('meta', 'schema_v3_migrated');
  if (flag && flag.value === true) return;
  const allChars = await DB.all('characters');
  for (const c of allChars) {
    const oldConvId = 'conv_' + c.id;
    const oldMsgs = await DB.allByConv(oldConvId);
    if (oldMsgs.length === 0) continue;
    const existing = await DB.allByIndex('conversations', 'charId', c.id);
    if (existing.length > 0) continue;
    const newConvId = genConvId();
    const conv = { id: newConvId, charId: c.id, title: '默认会话', createdAt: Date.now(), updatedAt: Date.now() };
    await DB.put('conversations', conv);
    for (const m of oldMsgs) { m.convId = newConvId; await DB.put('messages', m); }
    const oldLeaf = await DB.get('meta', oldConvId + '_leaf');
    const oldRoot = await DB.get('meta', oldConvId + '_root');
    if (oldLeaf) await DB.put('meta', { key: newConvId + '_leaf', value: oldLeaf.value });
    if (oldRoot) await DB.put('meta', { key: newConvId + '_root', value: oldRoot.value });
  }
  await DB.put('meta', { key: 'schema_v3_migrated', value: true });
}
async function migrateV4IfNeeded() {
  const flag = await DB.get('meta', 'schema_v4_migrated');
  if (flag && flag.value === true) return;
  await DB.put('meta', { key: 'schema_v4_migrated', value: true });
}

/* ============================================================
 *  API 配置
 * ============================================================ */
async function loadApis() {
  apis = await DB.all('apis');
  let cur = await DB.get('meta', 'currentApiId');
  if (!cur || !apis.find(a => a.id === cur.value)) {
    currentApiId = apis[0]?.id || null;
    await DB.put('meta', { key: 'currentApiId', value: currentApiId });
  } else currentApiId = cur.value;
}
function refreshApiSelect() {
  const sel = document.getElementById('apiSelect');
  sel.innerHTML = '';
  if (apis.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '（无 API）'; opt.disabled = true; opt.selected = true;
    sel.appendChild(opt);
  } else {
    for (const a of apis) {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name || a.model || 'API';
      if (a.id === currentApiId) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  refreshApiStatus();
}
function refreshApiStatus() {
  const a = getCurrentApi();
  const hasKey = a && a.apiKey && !!a.apiKey.data;
  const ok = a && hasKey && a.apiBase && a.model;
  document.getElementById('apiDot').className = 'api-dot ' + (ok ? 'ok' : 'bad');
  document.getElementById('apiStatus').textContent = ok ? a.model : '未配';
}
document.getElementById('apiSelect').onchange = async () => {
  currentApiId = document.getElementById('apiSelect').value;
  await DB.put('meta', { key: 'currentApiId', value: currentApiId });
  refreshApiStatus();
  toast('已切换到：' + (getCurrentApi()?.name || ''));
};
function openApiList() {
  document.getElementById('apiEditView').style.display = 'none';
  const listEl = document.getElementById('apiList');
  listEl.style.display = '';
  document.getElementById('addApiBtn').parentElement.style.display = 'flex';
  listEl.innerHTML = '';
  if (apis.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-mute);font-size:13px;padding:8px 0;">还没有 API 配置。</div>';
  }
  for (const a of apis) {
    const item = document.createElement('div');
    item.className = 'api-item' + (a.id === currentApiId ? ' active' : '');
    item.innerHTML = '<div class="info"><div class="n">' + MD.escapeHtml(a.name || '未命名') +
      '</div><div class="m">' + MD.escapeHtml(a.model || '') + ' · ' +
      MD.escapeHtml((a.apiBase || '').replace(/^https?:\/\//, '')) + '</div></div>' +
      (a.id === currentApiId ? '<span class="check">✓</span>' : '');
    item.onclick = () => openApiEdit(a.id);
    listEl.appendChild(item);
  }
}
function openApiEdit(id) {
  const a = id ? apis.find(x => x.id === id) : null;
  document.getElementById('apiList').style.display = 'none';
  document.getElementById('addApiBtn').parentElement.style.display = 'none';
  const editView = document.getElementById('apiEditView');
  editView.style.display = '';
  editView.dataset.editingId = a ? a.id : '';
  document.getElementById('modelPicker').style.display = 'none';
  document.getElementById('apiForm').classList.remove('disabled');
  document.getElementById('apiName').value = a ? (a.name || '') : '';
  document.getElementById('apiBase').value = a ? (a.apiBase || '') : '';
  document.getElementById('apiModel').value = a ? (a.model || '') : '';
  document.getElementById('apiKey').value = '';
  document.getElementById('deleteApiBtn').style.display = a ? '' : 'none';
  if (a && a.apiKey && !a.apiKey.plain) {
    document.getElementById('apiKey').placeholder = '（已加密，留空则不变）';
  } else {
    document.getElementById('apiKey').placeholder = 'sk-...';
    if (a && a.apiKey) document.getElementById('apiKey').value = a.apiKey.data || '';
  }
}
document.getElementById('addApiBtn').onclick = () => openApiEdit(null);
document.getElementById('cancelApiBtn').onclick = () => openApiList();

document.querySelectorAll('#apiPanel .presets button').forEach(btn => {
  btn.onclick = () => {
    const key = btn.dataset.preset;
    const tpl = API_TEMPLATES[key];
    if (!tpl) return;
    if (key === 'custom' || tpl.models.length === 0) {
      document.getElementById('apiName').value = '';
      document.getElementById('apiBase').value = '';
      document.getElementById('apiModel').value = '';
      document.getElementById('modelPicker').style.display = 'none';
      document.getElementById('apiForm').classList.remove('disabled');
      document.getElementById('apiBase').focus();
      return;
    }
    openModelPicker(tpl);
  };
});
function openModelPicker(tpl) {
  const picker = document.getElementById('modelPicker');
  const list = document.getElementById('modelPickerList');
  document.getElementById('modelPickerName').textContent = tpl.name + ' · 选择模型';
  list.innerHTML = '';
  tpl.models.forEach((m) => {
    const item = document.createElement('div');
    item.className = 'model-picker-item';
    item.innerHTML = '<div><div class="m-name">' + MD.escapeHtml(m.id) + '</div><div class="m-desc">' +
      MD.escapeHtml(m.desc || '') + '</div></div>' +
      (m.badge ? '<span class="m-badge">' + MD.escapeHtml(m.badge) + '</span>' : '');
    item.onclick = () => {
      document.getElementById('apiName').value = tpl.name + (tpl.models.length > 1 ? ' · ' + m.id : '');
      document.getElementById('apiBase').value = tpl.base;
      document.getElementById('apiModel').value = m.id;
      picker.style.display = 'none';
      document.getElementById('apiForm').classList.remove('disabled');
      document.getElementById('apiKey').focus();
      toast('已填入：' + tpl.name + ' / ' + m.id);
    };
    list.appendChild(item);
  });
  picker.style.display = '';
  document.getElementById('apiForm').classList.add('disabled');
}
document.getElementById('modelPickerClose').onclick = () => {
  document.getElementById('modelPicker').style.display = 'none';
  document.getElementById('apiForm').classList.remove('disabled');
};
document.getElementById('saveApiBtn').onclick = async () => {
  const name = document.getElementById('apiName').value.trim();
  const apiBase = document.getElementById('apiBase').value.trim();
  const model = document.getElementById('apiModel').value.trim();
  const apiKeyRaw = document.getElementById('apiKey').value.trim();
  if (!apiBase || !model) { alert('API Base 和模型名不能为空'); return; }
  const editingId = document.getElementById('apiEditView').dataset.editingId;
  let encKey;
  if (editingId) {
    const a = apis.find(x => x.id === editingId);
    if (apiKeyRaw) encKey = await CRYPTO.encrypt(apiKeyRaw);
    else encKey = a.apiKey || { plain: true, data: '' };
    Object.assign(a, { name: name || model, apiBase, model, apiKey: encKey });
    await DB.put('apis', a);
  } else {
    encKey = apiKeyRaw ? await CRYPTO.encrypt(apiKeyRaw) : { plain: true, data: '' };
    const a = { id: 'api_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name || model, apiBase, model, apiKey: encKey };
    apis.push(a); await DB.put('apis', a);
    if (!currentApiId) {
      currentApiId = a.id;
      await DB.put('meta', { key: 'currentApiId', value: currentApiId });
    }
  }
  refreshApiSelect(); openApiList();
  toast('已保存'); scheduleAutoSync();
};
document.getElementById('deleteApiBtn').onclick = async () => {
  const editingId = document.getElementById('apiEditView').dataset.editingId;
  if (!editingId) return;
  if (!confirm('确定删除此 API 配置？')) return;
  apis = apis.filter(a => a.id !== editingId);
  await DB.del('apis', editingId);
  if (currentApiId === editingId) {
    currentApiId = apis[0]?.id || null;
    await DB.put('meta', { key: 'currentApiId', value: currentApiId });
  }
  refreshApiSelect(); openApiList();
  toast('已删除'); scheduleAutoSync();
};
document.getElementById('apiToggle').onclick = () => {
  const panel = document.getElementById('apiPanel');
  panel.classList.toggle('show');
  if (panel.classList.contains('show')) {
    openApiList(); loadDavConfigToUI(); updateThemeButtons();
    updateSwatchActive(currentAccent);
    document.getElementById('accentPicker').value = currentAccent;
    updatePinStatus();
    refreshKbCharSelect();
    renderKbList();
  }
};
function updatePinStatus() {
  const el = document.getElementById('pinStatus');
  if (!el) return;
  el.textContent = localStorage.getItem('rp_hasPin') === '1'
    ? (CRYPTO.hasKey() ? '✅ 已加密并解锁' : '🔒 已加密，未解锁')
    : '⚠️ 未加密（API Key 明文存本机）';
}
document.getElementById('pinSaveBtn').onclick = async () => {
  const pin = document.getElementById('pinInput').value.trim();
  await CRYPTO.setPin(pin || null);
  localStorage.setItem('rp_hasPin', pin ? '1' : '0');
  updatePinStatus();
  toast(pin ? '已启用本地加密' : '已关闭加密');
};

/* ============================================================
 *  角色卡互转 + PNG 解析
 * ============================================================ */
function toTavernCard(char) {
  return {
    spec: 'chara_card_v2', spec_version: '2.0',
    data: {
      name: char.name || '未命名',
      description: char.prompt || '',
      personality: '', scenario: '', first_mes: char.firstMes || '', mes_example: '',
      creator_notes: char.desc || '', system_prompt: '', post_history_instructions: '',
      alternate_greetings: [], tags: [], creator: '', character_version: '1.0',
      extensions: { emoji: char.emoji || '🙂' }
    },
    name: char.name || '未命名', description: char.prompt || '',
    personality: '', scenario: '', first_mes: char.firstMes || '', mes_example: ''
  };
}
function fromTavernCard(json) {
  const data = json.data || json;
  if (!data.name && !data.description) return null;
  return {
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    emoji: (json.data?.extensions?.emoji) || '🙂',
    name: data.name || '导入角色',
    prompt: data.description || data.personality || '',
    desc: data.creator_notes || data.scenario || '',
    firstMes: data.first_mes || ''
  };
}
async function parsePngCard(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('不是 PNG 文件');
  let offset = 8;
  while (offset < view.byteLength) {
    const len = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    if (type === 'tEXt') {
      const chunk = bytes.slice(dataStart, dataStart + len);
      const zero = chunk.indexOf(0);
      const key = String.fromCharCode(...chunk.slice(0, zero));
      const val = String.fromCharCode(...chunk.slice(zero + 1));
      if (key === 'chara') return JSON.parse(atob(val));
    }
    if (type === 'IEND') break;
    offset = dataStart + len + 4;
  }
  throw new Error('PNG 里没找到角色卡数据');
}
document.getElementById('exportCardBtn').onclick = async () => {
  const editingId = document.getElementById('charEditView').dataset.editingId;
  if (!editingId) return;
  const c = characters.find(x => x.id === editingId);
  if (!c) return;
  const card = toTavernCard(c);
  const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (c.name || 'character') + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('角色卡已导出');
};
document.getElementById('importCardBtn').onclick = () => document.getElementById('importCardFile').click();
document.getElementById('importCardFile').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let json;
    if (file.name.toLowerCase().endsWith('.png')) json = await parsePngCard(file);
    else json = JSON.parse(await file.text());
    const c = fromTavernCard(json);
    if (!c) throw new Error('不是有效的角色卡');
    characters.push(c); await DB.put('characters', c);
    refreshCharSelect();
    toast('已导入：' + c.name);
    openCharList();
  } catch (err) { alert('导入失败：' + err.message); }
  e.target.value = '';
};

/* ============================================================
 *  多会话
 * ============================================================ */
async function loadConversations() {
  if (!currentCharId) { conversations = []; currentConvId = null; return; }
  conversations = await DB.allByIndex('conversations', 'charId', currentCharId);
  conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (conversations.length === 0) {
    const c = await createConversation(currentCharId, '默认会话');
    conversations = [c];
  }
  const lastKey = 'rp_lastConv_' + currentCharId;
  const last = localStorage.getItem(lastKey);
  currentConvId = (last && conversations.find(c => c.id === last)) ? last : conversations[0].id;
}
async function createConversation(charId, title) {
  const conv = {
    id: genConvId(),
    charId,
    title: title || ('会话 ' + new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await DB.put('conversations', conv);
  return conv;
}
function refreshConvSelect() {
  const sel = document.getElementById('convSelect');
  sel.innerHTML = '';
  if (conversations.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '（无会话）'; opt.disabled = true; opt.selected = true;
    sel.appendChild(opt);
    return;
  }
  for (const c of conversations) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title || '未命名';
    if (c.id === currentConvId) opt.selected = true;
    sel.appendChild(opt);
  }
}
document.getElementById('convSelect').onchange = async () => {
  currentConvId = document.getElementById('convSelect').value;
  if (currentCharId) localStorage.setItem('rp_lastConv_' + currentCharId, currentConvId);
  await loadGroup();
  await loadConversation();
  lastRenderedCount = 0; render();
};
document.getElementById('newConvBtn').onclick = async () => {
  if (!currentCharId) { alert('请先创建角色'); return; }
  const title = prompt('新会话名称（留空自动生成）', '');
  if (title === null) return;
  const conv = await createConversation(currentCharId, title || '');
  conversations.unshift(conv);
  currentConvId = conv.id;
  localStorage.setItem('rp_lastConv_' + currentCharId, currentConvId);
  refreshConvSelect();
  await loadGroup();
  await loadConversation();
  lastRenderedCount = 0; render();
  toast('已创建新会话');
};

/* ============================================================
 *  群聊
 * ============================================================ */
async function loadGroup() {
  if (!currentConvId) { currentGroup = null; return; }
  const g = await DB.get('groups', currentConvId);
  if (g) {
    currentGroup = g;
    currentGroup.members = (currentGroup.members || []).sort((a, b) => (a.order || 0) - (b.order || 0));
  } else {
    currentGroup = null;
  }
  updateGroupIndicator();
}
function updateGroupIndicator() {
  const btn = document.getElementById('groupBtn');
  if (!btn) return;
  if (currentGroup && currentGroup.members && currentGroup.members.length > 1) {
    btn.textContent = '👥' + currentGroup.members.length;
    btn.title = '群聊：' + currentGroup.members.map(m => m.name).join('、');
  } else {
    btn.textContent = '👥';
    btn.title = '会话设置 / 群聊';
  }
}
function isGroupMode() {
  return currentGroup && currentGroup.members && currentGroup.members.length > 1;
}
function openGroupModal() {
  if (!currentConvId) { alert('请先选择会话'); return; }
  document.getElementById('groupTitle').value = currentGroup?.title || '';
  renderGroupMembers();
  document.getElementById('groupModalMask').classList.add('show');
}
document.getElementById('groupBtn').onclick = openGroupModal;
document.getElementById('groupCloseBtn').onclick = () => {
  document.getElementById('groupModalMask').classList.remove('show');
};
function renderGroupMembers() {
  const list = document.getElementById('groupMemberList');
  list.innerHTML = '';
  if (!currentGroup || !currentGroup.members || currentGroup.members.length === 0) {
    list.innerHTML = '<div style="color:var(--text-mute);font-size:13px;padding:8px 0;">还没有参与者。点下面「＋ 添加参与者」。</div>';
    document.getElementById('groupClearBtn').style.display = 'none';
    return;
  }
  document.getElementById('groupClearBtn').style.display = '';
  const sorted = [...currentGroup.members].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const m of sorted) {
    const char = getCharById(m.charId);
    const api = getApiById(m.apiId);
    const item = document.createElement('div');
    item.className = 'group-member-item';
    item.innerHTML = '<span class="gm-emoji">' + (char?.emoji || '🙂') + '</span>' +
      '<div class="gm-info"><div class="gm-name">' + MD.escapeHtml(m.name || char?.name || '未知') +
      '</div><div class="gm-meta">' + MD.escapeHtml(api ? (api.name + ' / ' + api.model) : '（API 已删除）') +
      '</div></div><span class="gm-order">顺序 ' + (m.order || 0) + '</span>';
    item.onclick = () => editGroupMember(m.id);
    list.appendChild(item);
  }
}
document.getElementById('groupAddMemberBtn').onclick = () => editGroupMember(null);
function editGroupMember(memberId) {
  groupEditingMemberId = memberId;
  const m = memberId ? currentGroup.members.find(x => x.id === memberId) : null;
  const charSel = document.getElementById('groupMemberChar');
  const apiSel = document.getElementById('groupMemberApi');
  charSel.innerHTML = '';
  for (const c of characters) {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = (c.emoji || '🙂') + ' ' + c.name;
    charSel.appendChild(o);
  }
  apiSel.innerHTML = '';
  for (const a of apis) {
    const o = document.createElement('option');
    o.value = a.id; o.textContent = (a.name || a.model) + ' / ' + a.model;
    apiSel.appendChild(o);
  }
  document.getElementById('groupMemberChar').value = m?.charId || (characters[0]?.id || '');
  document.getElementById('groupMemberApi').value = m?.apiId || (apis[0]?.id || '');
  document.getElementById('groupMemberName').value = m?.name || '';
  document.getElementById('groupMemberOrder').value = m?.order ?? (currentGroup?.members?.length || 0);
  document.getElementById('groupMemberEdit').style.display = '';
}
document.getElementById('groupMemberCancel').onclick = () => {
  document.getElementById('groupMemberEdit').style.display = 'none';
  groupEditingMemberId = null;
};
document.getElementById('groupMemberSave').onclick = () => {
  const charId = document.getElementById('groupMemberChar').value;
  const apiId = document.getElementById('groupMemberApi').value;
  const name = document.getElementById('groupMemberName').value.trim();
  const order = Number(document.getElementById('groupMemberOrder').value) || 0;
  if (!charId || !apiId) { alert('角色和 API 都要选'); return; }
  if (!currentGroup) currentGroup = { convId: currentConvId, title: '', members: [] };
  if (!currentGroup.members) currentGroup.members = [];
  const char = getCharById(charId);
  if (groupEditingMemberId) {
    const m = currentGroup.members.find(x => x.id === groupEditingMemberId);
    Object.assign(m, { charId, apiId, name: name || char?.name || '未知', order });
  } else {
    currentGroup.members.push({
      id: genMemberId(), charId, apiId,
      name: name || char?.name || '未知', order
    });
  }
  document.getElementById('groupMemberEdit').style.display = 'none';
  groupEditingMemberId = null;
  renderGroupMembers();
};
document.getElementById('groupSaveBtn').onclick = async () => {
  if (!currentConvId) return;
  const title = document.getElementById('groupTitle').value.trim();
  if (!currentGroup) currentGroup = { convId: currentConvId, title: '', members: [] };
  currentGroup.convId = currentConvId;
  currentGroup.title = title;
  await DB.put('groups', currentGroup);
  const conv = conversations.find(c => c.id === currentConvId);
  if (conv && title) { conv.title = title; await DB.put('conversations', conv); }
  refreshConvSelect();
  updateGroupIndicator();
  document.getElementById('groupModalMask').classList.remove('show');
  toast('会话设置已保存');
  lastRenderedCount = 0; render();
  scheduleAutoSync();
};
document.getElementById('groupClearBtn').onclick = async () => {
  if (!currentGroup) return;
  if (!confirm('清空群聊参与者？恢复为单人对话模式。')) return;
  currentGroup.members = [];
  await DB.put('groups', currentGroup);
  renderGroupMembers();
  updateGroupIndicator();
  toast('已恢复单人模式');
};

/* ============================================================
 *  知识库
 * ============================================================ */
function refreshKbCharSelect() {
  const sel = document.getElementById('kbCharSelect');
  sel.innerHTML = '';
  if (characters.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '（无角色）'; opt.disabled = true; opt.selected = true;
    sel.appendChild(opt); return;
  }
  for (const c of characters) {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = (c.emoji || '🙂') + ' ' + c.name;
    if (c.id === currentCharId) opt.selected = true;
    sel.appendChild(opt);
  }
}
async function loadKnowledge(charId) {
  if (!charId) { knowledgeList = []; return; }
  knowledgeList = await DB.allByIndex('knowledge', 'charId', charId);
  knowledgeList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
function renderKbList() {
  const list = document.getElementById('kbList');
  list.innerHTML = '';
  if (knowledgeList.length === 0) {
    list.innerHTML = '<div class="kb-empty">还没有知识条目。点上方「＋ 新增条目」。</div>';
    return;
  }
  for (const k of knowledgeList) {
    const item = document.createElement('div');
    item.className = 'kb-item';
    item.innerHTML = '<div style="flex:1;min-width:0;"><div class="kb-keys">' +
      MD.escapeHtml(k.keys) + '</div><div class="kb-content">' +
      MD.escapeHtml(k.content) + '</div></div><span style="color:var(--text-mute);">›</span>';
    item.onclick = () => openKbEdit(k.id);
    list.appendChild(item);
  }
}
document.getElementById('kbCharSelect').onchange = async (e) => {
  const charId = e.target.value;
  await loadKnowledge(charId);
  renderKbList();
};
document.getElementById('kbAddBtn').onclick = () => openKbEdit(null);
function openKbEdit(id) {
  const k = id ? knowledgeList.find(x => x.id === id) : null;
  kbEditingId = id;
  document.getElementById('kbModalTitle').textContent = k ? '编辑知识条目' : '新增知识条目';
  document.getElementById('kbKeys').value = k ? (k.keys || '') : '';
  document.getElementById('kbContent').value = k ? (k.content || '') : '';
  document.getElementById('kbDeleteBtn').style.display = k ? '' : 'none';
  document.getElementById('kbModalMask').classList.add('show');
}
document.getElementById('kbCancelBtn').onclick = () => {
  document.getElementById('kbModalMask').classList.remove('show');
};
document.getElementById('kbSaveBtn').onclick = async () => {
  const charId = document.getElementById('kbCharSelect').value;
  if (!charId) { alert('请先选择角色'); return; }
  const keys = document.getElementById('kbKeys').value.trim();
  const content = document.getElementById('kbContent').value.trim();
  if (!keys) { alert('关键词不能为空'); return; }
  if (!content) { alert('内容不能为空'); return; }
  if (kbEditingId) {
    const k = knowledgeList.find(x => x.id === kbEditingId);
    Object.assign(k, { keys, content });
    await DB.put('knowledge', k);
  } else {
    const k = { id: genKbId(), charId, keys, content, createdAt: Date.now() };
    knowledgeList.push(k);
    await DB.put('knowledge', k);
  }
  document.getElementById('kbModalMask').classList.remove('show');
  renderKbList();
  toast('已保存');
  scheduleAutoSync();
};
document.getElementById('kbDeleteBtn').onclick = async () => {
  if (!kbEditingId) return;
  if (!confirm('确定删除此知识条目？')) return;
  knowledgeList = knowledgeList.filter(k => k.id !== kbEditingId);
  await DB.del('knowledge', kbEditingId);
  document.getElementById('kbModalMask').classList.remove('show');
  renderKbList();
  toast('已删除');
  scheduleAutoSync();
};
function buildKnowledgeContext(charId, userText) {
  const list = knowledgeList.filter(k => k.charId === charId);
  if (list.length === 0) return '';
  const text = (userText || '').toLowerCase();
  const hits = [];
  for (const k of list) {
    const keys = (k.keys || '').split(/[,，、\s]+/).filter(Boolean);
    if (keys.some(key => text.includes(key.toLowerCase()))) hits.push(k.content);
  }
  if (hits.length === 0) return '';
  return '\n\n【知识库】\n' + hits.join('\n');
}

/* ============================================================
 *  WebDAV
 * ============================================================ */
const DAV_KEY = 'rp_dav_config';
function getDavConfig() {
  try { const s = localStorage.getItem(DAV_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function setDavConfig(cfg) { localStorage.setItem(DAV_KEY, JSON.stringify(cfg)); }
function loadDavConfigToUI() {
  const c = getDavConfig() || {};
  document.getElementById('davUrl').value = c.url || '';
  document.getElementById('davUser').value = c.user || '';
  document.getElementById('davPass').value = c.pass || '';
  document.getElementById('davPath').value = c.path || 'roleplay/backup.json';
  document.getElementById('davAutoSync').checked = !!c.autoSync;
}
document.getElementById('davSaveBtn').onclick = () => {
  const url = document.getElementById('davUrl').value.trim();
  const user = document.getElementById('davUser').value.trim();
  const pass = document.getElementById('davPass').value.trim();
  const path = document.getElementById('davPath').value.trim() || 'roleplay/backup.json';
  const autoSync = document.getElementById('davAutoSync').checked;
  if (!url || !user || !pass) { alert('URL、账号、密码都要填'); return; }
  setDavConfig({ url, user, pass, path, autoSync });
  toast('云端配置已保存');
};
async function davRequest(method, body = null) {
  const c = getDavConfig();
  if (!c || !c.url || !c.user || !c.pass) throw new Error('请先填写并保存云端配置');
  let base = c.url.replace(/\/$/, '');
  let path = (c.path || 'roleplay/backup.json').replace(/^\//, '');
  const fullUrl = base + '/' + path;
  const dirs = path.split('/').slice(0, -1);
  let curBase = base;
  for (const d of dirs) {
    curBase += '/' + d;
    try { await fetch(curBase + '/', { method: 'MKCOL',
      headers: { 'Authorization': 'Basic ' + btoa(c.user + ':' + c.pass) } }); } catch (e) {}
  }
  const headers = { 'Authorization': 'Basic ' + btoa(c.user + ':' + c.pass) };
  const opts = { method, headers };
  if (body !== null) { headers['Content-Type'] = 'application/json; charset=utf-8'; opts.body = body; }
  return fetch(fullUrl, opts);
}
document.getElementById('davTestBtn').onclick = async () => {
  const statusEl = document.getElementById('davStatus');
  statusEl.textContent = '测试中…';
  try {
    const url = document.getElementById('davUrl').value.trim();
    const user = document.getElementById('davUser').value.trim();
    const pass = document.getElementById('davPass').value.trim();
    if (!url || !user || !pass) throw new Error('先填 URL、账号、密码');
    setDavConfig({ url, user, pass,
      path: document.getElementById('davPath').value.trim() || 'roleplay/backup.json',
      autoSync: document.getElementById('davAutoSync').checked });
    const res = await fetch(url.replace(/\/$/, '') + '/', { method: 'PROPFIND',
      headers: { 'Authorization': 'Basic ' + btoa(user + ':' + pass), 'Depth': '0' } });
    if (res.status === 207 || res.status === 200 || res.ok) statusEl.textContent = '✅ 连接成功';
    else if (res.status === 401) statusEl.textContent = '❌ 账号或密码错误';
    else statusEl.textContent = '⚠️ 返回 ' + res.status;
  } catch (e) { document.getElementById('davStatus').textContent = '❌ ' + e.message; }
};
async function buildBackupData(includeKeys = false) {
  const allChars = await DB.all('characters');
  const allMsgs = await DB.all('messages');
  const allApis = await DB.all('apis');
  const allConvs = await DB.all('conversations');
  const allKb = await DB.all('knowledge');
  const allGroups = await DB.all('groups');
  const apisOut = includeKeys ? allApis : allApis.map(a => ({ ...a, apiKey: { plain: true, data: '' } }));
  return { version: 4, app: 'roleplay-pwa', exportedAt: new Date().toISOString(),
    characters: allChars, messages: allMsgs, apis: apisOut,
    conversations: allConvs, knowledge: allKb, groups: allGroups };
}
document.getElementById('davUploadBtn').onclick = async () => {
  const statusEl = document.getElementById('davStatus');
  statusEl.textContent = '上传中…';
  try {
    const data = await buildBackupData(false);
    const res = await davRequest('PUT', JSON.stringify(data));
    if (res.ok || res.status === 201 || res.status === 204) {
      statusEl.textContent = '✅ 上传成功 ' + new Date().toLocaleTimeString();
      localStorage.setItem('rp_lastBackup', String(Date.now()));
      toast('云端备份成功（不含 Key）');
    } else statusEl.textContent = '❌ 上传失败：' + res.status;
  } catch (e) { statusEl.textContent = '❌ ' + e.message; }
};
document.getElementById('davDownloadBtn').onclick = async () => {
  const statusEl = document.getElementById('davStatus');
  statusEl.textContent = '下载中…';
  try {
    const res = await davRequest('GET');
    if (!res.ok) { statusEl.textContent = '❌ 云端无备份或读取失败：' + res.status; return; }
    const data = await res.json();
    if (!data.characters) { statusEl.textContent = '❌ 备份文件格式不对'; return; }
    if (!confirm(`将用云端数据覆盖本机数据（${data.characters.length} 个角色）。继续？`)) {
      statusEl.textContent = '已取消'; return;
    }
    await DB.clear('characters'); await DB.clear('messages'); await DB.clear('apis');
    await DB.clear('conversations'); await DB.clear('knowledge'); await DB.clear('groups');
    for (const c of data.characters) await DB.put('characters', c);
    for (const m of data.messages || []) await DB.put('messages', m);
    for (const a of data.apis || []) await DB.put('apis', a);
    for (const c of data.conversations || []) await DB.put('conversations', c);
    for (const k of data.knowledge || []) await DB.put('knowledge', k);
    for (const g of data.groups || []) await DB.put('groups', g);
    await loadCharacters(); await loadApis(); await loadConversations();
    await loadGroup(); await loadKnowledge(currentCharId);
    refreshCharSelect(); refreshApiSelect(); refreshConvSelect();
    refreshKbCharSelect(); renderKbList();
    await loadConversation();
    lastRenderedCount = 0; render();
    statusEl.textContent = '✅ 恢复成功 ' + new Date().toLocaleTimeString();
    toast('已从云端恢复');
  } catch (e) { statusEl.textContent = '❌ ' + e.message; }
};
let autoSyncTimer = null;
function scheduleAutoSync() {
  const c = getDavConfig();
  if (!c || !c.autoSync) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(async () => {
    try {
      const data = await buildBackupData(false);
      await davRequest('PUT', JSON.stringify(data));
      localStorage.setItem('rp_lastBackup', String(Date.now()));
    } catch (e) {}
  }, 8000);
}

/* ============================================================
 *  本地导出 / 导入
 * ============================================================ */
document.getElementById('exportBtn').onclick = async () => {
  const includeKeys = confirm('导出文件里是否包含 API Key？\n\n确定 = 包含\n取消 = 不包含（推荐）');
  const data = await buildBackupData(includeKeys);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'roleplay-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  localStorage.setItem('rp_lastBackup', String(Date.now()));
  toast(includeKeys ? '已导出（含 Key）' : '已导出（不含 Key）');
};
document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.characters || !data.messages) throw new Error('文件格式不对');
      if (!confirm(`将合并导入 ${data.characters.length} 个角色、${data.messages.length} 条消息。继续？`)) return;
      for (const c of data.characters) await DB.put('characters', c);
      for (const m of data.messages) await DB.put('messages', m);
      for (const a of data.apis || []) await DB.put('apis', a);
      for (const c of data.conversations || []) await DB.put('conversations', c);
      for (const k of data.knowledge || []) await DB.put('knowledge', k);
      for (const g of data.groups || []) await DB.put('groups', g);
      await loadCharacters(); await loadApis(); await loadConversations();
      await loadGroup(); await loadKnowledge(currentCharId);
      refreshCharSelect(); refreshApiSelect(); refreshConvSelect();
      refreshKbCharSelect(); renderKbList();
      await loadConversation();
      lastRenderedCount = 0; render();
      toast('导入完成');
    } catch (err) { alert('导入失败：' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
};

/* ============================================================
 *  角色 / 会话加载
 * ============================================================ */
async function loadCharacters() {
  characters = await DB.all('characters');
  let cur = await DB.get('meta', 'currentCharId');
  if (!cur || !characters.find(c => c.id === cur.value)) {
    currentCharId = characters[0]?.id || null;
    await DB.put('meta', { key: 'currentCharId', value: currentCharId });
  } else currentCharId = cur.value;
}
async function loadConversation() {
  messages = []; activeLeafId = null; rootId = null;
  const char = getCurrentChar();
  if (!char || !currentConvId) return;
  messages = await DB.allByConv(currentConvId);
  if (messages.length === 0) {
    let systemContent = char.prompt;
    if (isGroupMode()) {
      systemContent = currentGroup.members
        .map(m => '【' + m.name + '的人设】\n' + (getCharById(m.charId)?.prompt || ''))
        .join('\n\n');
    }
    const sys = { id: genId(), parentId: null, role: 'system', content: systemContent,
      children: [], createdAt: Date.now(), convId: currentConvId };
    await saveNode(sys);
    rootId = sys.id; activeLeafId = sys.id;
    if (!isGroupMode() && char.firstMes) {
      const fm = { id: genId(), parentId: sys.id, role: 'assistant', content: char.firstMes,
        children: [], createdAt: Date.now(), convId: currentConvId, speakerId: char.id };
      await saveNode(fm);
      sys.children.push(fm.id);
      await saveNode(sys);
      activeLeafId = fm.id;
    }
    await saveMeta();
  } else {
    const r = await DB.get('meta', currentConvId + '_root');
    const l = await DB.get('meta', currentConvId + '_leaf');
    rootId = r ? r.value : messages.find(m => !m.parentId)?.id;
    activeLeafId = l && messages.find(m => m.id === l.value) ? l.value : rootId;
  }
}
async function saveNode(node) {
  node.convId = currentConvId;
  if (!node.children) node.children = [];
  await DB.put('messages', node);
  const idx = messages.findIndex(m => m.id === node.id);
  if (idx >= 0) messages[idx] = node; else messages.push(node);
}
async function saveMeta() {
  if (!currentConvId) return;
  await DB.put('meta', { key: currentConvId + '_leaf', value: activeLeafId });
  await DB.put('meta', { key: currentConvId + '_root', value: rootId });
  const conv = conversations.find(c => c.id === currentConvId);
  if (conv) { conv.updatedAt = Date.now(); await DB.put('conversations', conv); }
}

/* ============================================================
 *  树操作
 * ============================================================ */
function buildMap() { const m = new Map(); for (const x of messages) m.set(x.id, x); return m; }
function getPath(leafId) {
  const map = buildMap(); const path = []; let cur = map.get(leafId);
  while (cur) { path.unshift(cur); cur = cur.parentId ? map.get(cur.parentId) : null; }
  return path;
}
function getActivePath() { return activeLeafId ? getPath(activeLeafId) : []; }
function getSiblings(node) {
  if (!node.parentId) return [node];
  const map = buildMap(); const parent = map.get(node.parentId);
  if (!parent) return [node];
  return (parent.children || []).map(id => map.get(id)).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
}
function buildContext(leafId) {
  const path = getPath(leafId);
  if (path.length === 0) return [];
  const system = path[0];
  const rest = path.slice(1);
  const maxMsgs = CONFIG.recentRounds * 2;
  let kept = rest.length > maxMsgs ? rest.slice(-maxMsgs) : rest;
  while (kept.length && kept[0].role !== 'user') kept.shift();
  let lastUserText = '';
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].role === 'user') { lastUserText = path[i].content; break; }
  }
  const kbText = buildKnowledgeContext(currentCharId, lastUserText);
  if (isGroupMode()) {
    const groupCtx = kept.map(m => {
      if (m.role === 'assistant' && m.speakerId) {
        const speaker = currentGroup.members.find(x => x.charId === m.speakerId);
        const name = speaker?.name || getCharById(m.speakerId)?.name || '未知';
        return { role: 'assistant', content: '【' + name + '】' + m.content };
      }
      return { role: m.role, content: m.content };
    });
    return [{ role: 'system', content: system.content + kbText }, ...groupCtx];
  }
  return [{ role: 'system', content: system.content + kbText },
    ...kept.map(m => ({ role: m.role, content: m.content }))];
}

/* ============================================================
 *  API 调用
 * ============================================================ */
async function getApiKeyRaw(a) {
  if (!a || !a.apiKey) return '';
  if (CRYPTO.isPlain(a.apiKey)) return a.apiKey.data || '';
  try { return await CRYPTO.decrypt(a.apiKey); }
  catch (e) { throw new Error('API Key 已加密，请在设置里输入 PIN 解锁'); }
}
async function callLLMWithApi(api, contextMessages, onDelta, signal) {
  const rawKey = await getApiKeyRaw(api);
  if (!rawKey) throw new Error('API "' + (api.name || api.model) + '" 缺少 Key');
  const res = await fetch(api.apiBase.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rawKey },
    body: JSON.stringify({ model: api.model, messages: contextMessages, stream: true }),
    signal
  });
  if (!res.ok) throw new Error('API "' + (api.name || api.model) + '" 错误 ' + res.status + ': ' + await res.text());
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '', usage = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const data = s.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) { full += delta; onDelta && onDelta(delta, full); }
        if (json.usage) usage = json.usage;
      } catch (e) {}
    }
  }
  if (usage) updateUsageUI(usage);
  return full;
}
async function callLLM(contextMessages, onDelta) {
  const a = getCurrentApi();
  if (!a) throw new Error('请先在 ⚙️ 里配置并选择 API');
  currentAbort = new AbortController();
  const result = await callLLMWithApi(a, contextMessages, onDelta, currentAbort.signal);
  currentAbort = null;
  return result;
}
async function addChild(parentId, role, content, speakerId) {
  const node = { id: genId(), parentId, role, content, children: [], createdAt: Date.now(), convId: currentConvId };
  if (speakerId) node.speakerId = speakerId;
  await saveNode(node);
  const parent = messages.find(m => m.id === parentId);
  if (parent) {
    parent.children = parent.children || [];
    parent.children.push(node.id);
    await saveNode(parent);
  }
  activeLeafId = node.id;
  await saveMeta();
  return node;
}
async function editMessage(msgId, newContent, regenAfter) {
  const old = messages.find(m => m.id === msgId);
  if (!old) return;
  if (!regenAfter) {
    old.content = newContent;
    await DB.put('messages', old);
    return old;
  }
  const newNode = { id: genId(), parentId: old.parentId, role: old.role, content: newContent,
    children: [], createdAt: Date.now(), convId: currentConvId };
  if (old.speakerId) newNode.speakerId = old.speakerId;
  await saveNode(newNode);
  const parent = messages.find(m => m.id === old.parentId);
  if (parent) {
    parent.children = parent.children || [];
    parent.children.push(newNode.id);
    await saveNode(parent);
  }
  activeLeafId = newNode.id;
  await saveMeta();
  return newNode;
}

/* ============================================================
 *  渲染
 * ============================================================ */
const chatEl = document.getElementById('chat');
let lastRenderedCount = 0;

function updateBranchStat() {
  const el = document.getElementById('branchStat');
  if (!el) return;
  const real = messages.filter(m => m.role !== 'system');
  const branchPoints = messages.filter(m => m.children && m.children.length > 1).length;
  el.textContent = '分支点 ' + branchPoints + ' / 消息 ' + real.length;
}
function render() {
  const char = getCurrentChar();
  if (!char) {
    chatEl.innerHTML = '<div class="empty-hint">还没有角色 🎭<br>点顶部「角色」→「新建角色」。</div>';
    lastRenderedCount = 0; updateBranchStat();
    return;
  }
  const path = getActivePath().filter(m => m.role !== 'system');
  chatEl.innerHTML = '';
  if (path.length === 0 && streamingText === null) {
    chatEl.innerHTML = '<div class="empty-hint">' + MD.escapeHtml(char.emoji || '🙂') + ' 和「' +
      MD.escapeHtml(char.name) + '」开始对话吧～</div>';
    lastRenderedCount = 0; updateBranchStat();
    return;
  }
  path.forEach((msg, i) => {
    const isNew = i >= lastRenderedCount;
    chatEl.appendChild(renderMessage(msg, char, isNew));
  });
  lastRenderedCount = path.length;
  if (streamingText !== null) {
    const tmp = document.createElement('div');
    tmp.className = 'msg assistant' + (isGroupMode() ? ' group' : '');
    const av = document.createElement('div');
    av.className = 'avatar'; av.textContent = char.emoji || '🙂';
    tmp.appendChild(av);
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = MD.render(streamingText) + '<span class="cursor"></span>';
    tmp.appendChild(bubble);
    chatEl.appendChild(tmp);
    bindCopyButtons(bubble);
  }
  updateBranchStat();
  scrollToBottom();
}
function scrollToBottom() { requestAnimationFrame(() => { chatEl.scrollTop = chatEl.scrollHeight; }); }

function renderMessage(msg, char, isNew) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + msg.role;
  if (msg.role === 'assistant' && isGroupMode()) wrap.classList.add('group');
  if (!isNew) wrap.style.animation = 'none';

  if (msg.role === 'assistant') {
    let speakerChar = char;
    let speakerName = '';
    if (isGroupMode() && msg.speakerId) {
      speakerChar = getCharById(msg.speakerId) || char;
      const member = currentGroup.members.find(x => x.charId === msg.speakerId);
      speakerName = member?.name || speakerChar.name;
    }
    const av = document.createElement('div');
    av.className = 'avatar'; av.textContent = speakerChar.emoji || '🙂';
    wrap.appendChild(av);
    if (isGroupMode() && speakerName) {
      const nameEl = document.createElement('div');
      nameEl.className = 'speaker-name';
      nameEl.textContent = speakerName;
      wrap.appendChild(nameEl);
    }
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (msg.role === 'user') bubble.textContent = msg.content;
  else { bubble.innerHTML = MD.render(msg.content); bindCopyButtons(bubble); }
  wrap.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const time = new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.createElement('span');
  timeEl.textContent = time;
  timeEl.style.cssText = 'font-size:11px;opacity:.7;';
  meta.appendChild(timeEl);

  const editBtn = document.createElement('button');
  editBtn.textContent = '编辑';
  editBtn.onclick = () => enterEditMode(wrap, msg);
  meta.appendChild(editBtn);

  if (msg.role === 'assistant') {
    const regenBtn = document.createElement('button');
    regenBtn.textContent = '重新生成';
    regenBtn.onclick = () => doRegenerate(msg);
    meta.appendChild(regenBtn);

    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-btn';
    speakBtn.textContent = '🔊';
    speakBtn.title = '朗读';
    speakBtn.onclick = () => speakText(msg.content, speakBtn);
    meta.appendChild(speakBtn);
  }

  const siblings = getSiblings(msg);
  if (siblings.length > 1) {
    const nav = document.createElement('div');
    nav.className = 'branch-nav';
    const idx = siblings.findIndex(s => s.id === msg.id) + 1;
    const prev = document.createElement('button');
    prev.textContent = '‹'; prev.disabled = idx <= 1;
    prev.onclick = () => switchToSibling(msg, -1);
    const label = document.createElement('span');
    label.textContent = idx + '/' + siblings.length;
    const next = document.createElement('button');
    next.textContent = '›'; next.disabled = idx >= siblings.length;
    next.onclick = () => switchToSibling(msg, +1);
    nav.append(prev, label, next);
    meta.appendChild(nav);
  }
  wrap.appendChild(meta);
  return wrap;
}
function bindCopyButtons(container) {
  container.querySelectorAll('.md-copy').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const pre = container.querySelector('#' + targetId) || document.getElementById(targetId);
      if (!pre) return;
      const code = pre.querySelector('code');
      const text = code ? code.textContent : '';
      const done = () => { btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '复制'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    };
  });
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}
function enterEditMode(wrap, msg) {
  const bubble = wrap.querySelector('.bubble');
  bubble.style.display = 'none';
  const box = document.createElement('textarea');
  box.className = 'edit-box'; box.value = msg.content;
  box.style.height = 'auto';
  box.addEventListener('input', () => {
    box.style.height = 'auto';
    box.style.height = Math.min(box.scrollHeight, 400) + 'px';
  });
  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save'; saveBtn.textContent = '保存并分叉';
  const saveNoRegen = document.createElement('button');
  saveNoRegen.className = 'cancel'; saveNoRegen.textContent = '仅改文字';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel'; cancelBtn.textContent = '取消';
  actions.append(saveBtn, saveNoRegen, cancelBtn);
  wrap.insertBefore(box, bubble.nextSibling);
  wrap.insertBefore(actions, box.nextSibling);
  box.focus();
  setTimeout(() => { box.style.height = Math.min(box.scrollHeight, 400) + 'px';
    box.setSelectionRange(box.value.length, box.value.length); }, 50);
  cancelBtn.onclick = () => { lastRenderedCount = 0; render(); };
  saveNoRegen.onclick = async () => {
    await editMessage(msg.id, box.value, false);
    lastRenderedCount = 0; render(); scheduleAutoSync();
  };
  saveBtn.onclick = async () => {
    const role = msg.role;
    await editMessage(msg.id, box.value, true);
    lastRenderedCount = 0; render();
    if (role === 'user') await autoContinue();
    else scheduleAutoSync();
  };
}

function setGenerating(on) {
  isGenerating = on;
  document.getElementById('sendBtn').textContent = on ? '■' : '↑';
  document.getElementById('input').disabled = on;
  document.getElementById('sendBtn').disabled = false;
}
async function sendMessage() {
  if (isGenerating) return;
  if (!getCurrentChar()) { alert('请先创建角色'); return; }
  const input = document.getElementById('input');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto';
  setGenerating(true);
  try {
    await addChild(activeLeafId, 'user', text);
    render();
    await autoContinue();
  } catch (e) {
    if (e.name !== 'AbortError') alert(e.message);
  } finally { setGenerating(false); }
}
async function autoContinue() {
  if (isGroupMode()) return autoContinueGroup();
  const context = buildContext(activeLeafId);
  streamingText = ''; render();
  try {
    const reply = await callLLM(context, (d, full) => { streamingText = full; render(); });
    streamingText = null;
    await addChild(activeLeafId, 'assistant', reply, getCurrentChar()?.id);
    render(); scheduleAutoSync();
  } catch (e) {
    if (e.name === 'AbortError' && streamingText) {
      const partial = streamingText;
      streamingText = null;
      await addChild(activeLeafId, 'assistant', partial, getCurrentChar()?.id);
      render();
    } else { streamingText = null; render(); throw e; }
  }
}
async function autoContinueGroup() {
  const members = [...currentGroup.members].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const m of members) {
    const api = getApiById(m.apiId);
    if (!api) { toast('跳过 "' + m.name + '"：API 已删除'); continue; }
    const context = buildContext(activeLeafId);
    streamingText = ''; render();
    const ctrl = new AbortController();
    currentAbort = ctrl;
    try {
      const reply = await callLLMWithApi(api, context, (d, full) => {
        streamingText = '【' + m.name + '】\n' + full;
        render();
      }, ctrl.signal);
      streamingText = null;
      await addChild(activeLeafId, 'assistant', reply, m.charId);
      render();
    } catch (e) {
      if (e.name === 'AbortError' && streamingText) {
        const partial = streamingText.replace(/^【[^】]+】\n/, '');
        streamingText = null;
        await addChild(activeLeafId, 'assistant', partial, m.charId);
        render();
      } else {
        streamingText = null; render();
        toast('"' + m.name + '" 出错：' + e.message);
      }
    }
    currentAbort = null;
  }
  scheduleAutoSync();
}
async function doRegenerate(msg) {
  if (isGenerating) return;
  setGenerating(true);
  streamingText = ''; render();
  try {
    if (isGroupMode() && msg.speakerId) {
      const api = currentGroup.members.find(x => x.charId === msg.speakerId);
      const apiObj = api ? getApiById(api.apiId) : null;
      if (!apiObj) throw new Error('找不到对应的 API');
      const context = buildContext(msg.parentId);
      const ctrl = new AbortController();
      currentAbort = ctrl;
      const reply = await callLLMWithApi(apiObj, context, (d, full) => { streamingText = full; render(); }, ctrl.signal);
      streamingText = null;
      await addChild(msg.parentId, 'assistant', reply, msg.speakerId);
      render(); scheduleAutoSync();
    } else {
      const context = buildContext(msg.parentId);
      const reply = await callLLM(context, (d, full) => { streamingText = full; render(); });
      streamingText = null;
      await addChild(msg.parentId, 'assistant', reply, getCurrentChar()?.id);
      render(); scheduleAutoSync();
    }
  } catch (e) {
    if (e.name === 'AbortError' && streamingText) {
      const partial = streamingText;
      streamingText = null;
      await addChild(msg.parentId, 'assistant', partial, msg.speakerId || getCurrentChar()?.id);
      render();
    } else { streamingText = null; render(); if (e.name !== 'AbortError') alert(e.message); }
  } finally { setGenerating(false); }
}
async function switchToSibling(msg, dir) {
  if (isGenerating) return;
  const siblings = getSiblings(msg);
  const idx = siblings.findIndex(s => s.id === msg.id);
  const target = siblings[idx + dir];
  if (!target) return;
  let leaf = target;
  while (leaf.children && leaf.children.length) {
    const nextId = leaf.children[leaf.children.length - 1];
    const next = messages.find(m => m.id === nextId);
    if (!next) break;
    leaf = next;
  }
  activeLeafId = leaf.id;
  await saveMeta();
  lastRenderedCount = 0; render();
}
function updateUsageUI(usage) {
  const prompt = usage.prompt_tokens || 0;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0;
  const rate = prompt ? (cached / prompt * 100) : 0;
  document.getElementById('hitRate').textContent = rate.toFixed(0) + '%';
  document.getElementById('tokenStat').textContent = prompt + '↓' + cached + '命中/' + (usage.completion_tokens || 0) + '↑';
}

/* ============================================================
 *  补回功能：导出 Markdown
 * ============================================================ */
function exportCurrentBranchAsMarkdown() {
  const char = getCurrentChar();
  if (!char) { alert('请先创建角色'); return; }
  const path = getActivePath().filter(m => m.role !== 'system');
  if (path.length === 0) { alert('当前分支没有消息'); return; }
  const lines = [];
  lines.push('# ' + (char.emoji || '🙂') + ' ' + char.name);
  if (char.desc) lines.push('> ' + char.desc);
  lines.push('');
  lines.push('导出时间：' + new Date().toLocaleString('zh-CN'));
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const msg of path) {
    const time = new Date(msg.createdAt).toLocaleString('zh-CN');
    if (msg.role === 'user') {
      lines.push('## 🧑 用户');
    } else {
      let name = char.name;
      if (isGroupMode() && msg.speakerId) {
        const member = currentGroup.members.find(x => x.charId === msg.speakerId);
        name = member?.name || getCharById(msg.speakerId)?.name || char.name;
      }
      lines.push('## ' + (char.emoji || '🙂') + ' ' + name);
    }
    lines.push('');
    lines.push('*' + time + '*');
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  const md = lines.join('\n');
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (char.name || 'chat') + '-' + new Date().toISOString().slice(0, 10) + '.md';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出 Markdown');
}
document.getElementById('exportMdBtn').onclick = exportCurrentBranchAsMarkdown;

/* ============================================================
 *  补回功能：消息搜索
 * ============================================================ */
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');
const searchPrev = document.getElementById('searchPrev');
const searchNext = document.getElementById('searchNext');
const searchClose = document.getElementById('searchClose');
let searchHits = [];
let searchIndex = -1;
function openSearch() {
  searchBar.classList.add('show');
  searchInput.value = '';
  searchHits = []; searchIndex = -1;
  searchCount.textContent = '0 / 0';
  clearSearchHits();
  setTimeout(() => searchInput.focus(), 50);
}
function closeSearch() {
  searchBar.classList.remove('show');
  clearSearchHits();
  searchHits = []; searchIndex = -1;
}
function clearSearchHits() {
  document.querySelectorAll('.msg.search-hit, .msg.search-current').forEach(el => {
    el.classList.remove('search-hit', 'search-current');
  });
}
function performSearch() {
  clearSearchHits();
  const q = searchInput.value.trim();
  if (!q) { searchHits = []; searchIndex = -1; searchCount.textContent = '0 / 0'; return; }
  const path = getActivePath().filter(m => m.role !== 'system');
  const lowerQ = q.toLowerCase();
  searchHits = [];
  path.forEach((msg, i) => {
    if (msg.content.toLowerCase().includes(lowerQ)) searchHits.push({ id: msg.id, index: i });
  });
  const allMsgs = document.querySelectorAll('.msg');
  searchHits.forEach(h => {
    if (allMsgs[h.index]) allMsgs[h.index].classList.add('search-hit');
  });
  searchCount.textContent = searchHits.length ? ('1 / ' + searchHits.length) : '0 / 0';
  searchIndex = searchHits.length ? 0 : -1;
  if (searchIndex >= 0) focusHit(searchIndex);
}
function focusHit(i) {
  const hit = searchHits[i];
  if (!hit) return;
  document.querySelectorAll('.msg.search-current').forEach(el => el.classList.remove('search-current'));
  const allMsgs = document.querySelectorAll('.msg');
  const el = allMsgs[hit.index];
  if (el) {
    el.classList.add('search-current');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  searchCount.textContent = (i + 1) + ' / ' + searchHits.length;
}
document.getElementById('searchBtn').onclick = () => {
  if (searchBar.classList.contains('show')) closeSearch();
  else openSearch();
};
searchClose.onclick = closeSearch;
searchInput.addEventListener('input', () => {
  clearTimeout(searchInput._t);
  searchInput._t = setTimeout(performSearch, 200);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (searchHits.length === 0) return;
    searchIndex = (searchIndex + 1) % searchHits.length;
    focusHit(searchIndex);
  }
  if (e.key === 'Escape') closeSearch();
});
searchPrev.onclick = () => {
  if (searchHits.length === 0) return;
  searchIndex = (searchIndex - 1 + searchHits.length) % searchHits.length;
  focusHit(searchIndex);
};
searchNext.onclick = () => {
  if (searchHits.length === 0) return;
  searchIndex = (searchIndex + 1) % searchHits.length;
  focusHit(searchIndex);
};

/* ============================================================
 *  补回功能：语音合成（朗读 AI 消息）
 * ============================================================ */
let currentUtterance = null;
function speakText(text, btn) {
  if (!('speechSynthesis' in window)) { alert('当前浏览器不支持语音合成'); return; }
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.speak-btn.playing').forEach(b => b.classList.remove('playing'));
    if (btn && btn.classList.contains('playing')) return;
  }
  const clean = text
    .replace(/```[\s\S]*?```/g, '（代码块）')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~#>|]/g, '')
    .replace(/\n+/g, '。')
    .trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'zh-CN';
  u.rate = 1.0;
  u.pitch = 1.0;
  u.onend = () => { if (btn) btn.classList.remove('playing'); currentUtterance = null; };
  u.onerror = () => { if (btn) btn.classList.remove('playing'); currentUtterance = null; };
  currentUtterance = u;
  if (btn) btn.classList.add('playing');
  window.speechSynthesis.speak(u);
}

/* ============================================================
 *  角色选择器
 * ============================================================ */
const charSelect = document.getElementById('charSelect');
function refreshCharSelect() {
  charSelect.innerHTML = '';
  if (characters.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '（无角色）'; opt.disabled = true; opt.selected = true;
    charSelect.appendChild(opt); return;
  }
  for (const c of characters) {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = (c.emoji || '🙂') + ' ' + c.name;
    if (c.id === currentCharId) opt.selected = true;
    charSelect.appendChild(opt);
  }
}
charSelect.onchange = async () => {
  currentCharId = charSelect.value;
  await DB.put('meta', { key: 'currentCharId', value: currentCharId });
  await loadConversations();
  refreshConvSelect();
  await loadGroup();
  await loadConversation();
  await loadKnowledge(currentCharId);
  refreshKbCharSelect();
  renderKbList();
  lastRenderedCount = 0; render();
};

/* ============================================================
 *  角色管理
 * ============================================================ */
const charModalMask = document.getElementById('charModalMask');
const charListView = document.getElementById('charListView');
const charEditView = document.getElementById('charEditView');
const cardList = document.getElementById('cardList');
document.getElementById('manageBtn').onclick = () => { openCharList(); charModalMask.classList.add('show'); };
document.getElementById('closeCharBtn').onclick = () => charModalMask.classList.remove('show');
function openCharList() {
  charListView.style.display = '';
  charEditView.style.display = 'none';
  document.getElementById('charModalTitle').textContent = '角色管理';
  cardList.innerHTML = '';
  if (characters.length === 0) {
    cardList.innerHTML = '<div style="color:var(--text-mute);font-size:13px;padding:8px 0;">还没有角色。</div>';
  }
  for (const c of characters) {
    const item = document.createElement('div');
    item.className = 'card-item';
    item.innerHTML = '<span class="emoji">' + (c.emoji || '🙂') + '</span><div><div class="name">' +
      MD.escapeHtml(c.name) + '</div><div class="desc">' + MD.escapeHtml(c.desc || '') +
      '</div></div><span class="edit-icon">编辑 ›</span>';
    item.onclick = () => openCharEdit(c.id);
    cardList.appendChild(item);
  }
}
function openCharEdit(id) {
  const c = id ? characters.find(x => x.id === id) : null;
  charListView.style.display = 'none';
  charEditView.style.display = '';
  document.getElementById('charModalTitle').textContent = c ? '编辑角色' : '新建角色';
  document.getElementById('editEmoji').value = c ? (c.emoji || '') : '';
  document.getElementById('editName').value = c ? c.name : '';
  document.getElementById('editPrompt').value = c ? c.prompt : '';
  document.getElementById('editFirstMes').value = c ? (c.firstMes || '') : '';
  document.getElementById('editDesc').value = c ? (c.desc || '') : '';
  charEditView.dataset.editingId = c ? c.id : '';
  document.getElementById('deleteCharBtn').style.display = c ? '' : 'none';
  document.getElementById('exportCardBtn').style.display = c ? '' : 'none';
}
document.getElementById('addCharBtn').onclick = () => openCharEdit(null);
document.getElementById('cancelEditBtn').onclick = () => openCharList();
document.getElementById('saveCharBtn').onclick = async () => {
  const emoji = document.getElementById('editEmoji').value.trim() || '🙂';
  const name = document.getElementById('editName').value.trim();
  const prompt = document.getElementById('editPrompt').value.trim();
  const firstMes = document.getElementById('editFirstMes').value.trim();
  const desc = document.getElementById('editDesc').value.trim();
  if (!name) { alert('角色名不能为空'); return; }
  if (!prompt) { alert('人设不能为空'); return; }
  const editingId = charEditView.dataset.editingId;
  if (editingId) {
    const c = characters.find(x => x.id === editingId);
    Object.assign(c, { emoji, name, prompt, firstMes, desc });
    await DB.put('characters', c);
  } else {
    const c = { id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      emoji, name, prompt, firstMes, desc };
    characters.push(c); await DB.put('characters', c);
    if (!currentCharId) {
      currentCharId = c.id;
      await DB.put('meta', { key: 'currentCharId', value: currentCharId });
      await loadConversations();
      refreshConvSelect();
      await loadConversation(); render();
    }
  }
  refreshCharSelect(); openCharList(); scheduleAutoSync();
};
document.getElementById('deleteCharBtn').onclick = async () => {
  const editingId = charEditView.dataset.editingId;
  if (!editingId) return;
  if (!confirm('确定删除此角色？对话记录和知识库也会一并删除。')) return;
  characters = characters.filter(c => c.id !== editingId);
  await DB.del('characters', editingId);
  const convs = await DB.allByIndex('conversations', 'charId', editingId);
  for (const conv of convs) {
    const nodes = await DB.allByConv(conv.id);
    for (const n of nodes) await DB.del('messages', n.id);
    await DB.del('meta', conv.id + '_leaf');
    await DB.del('meta', conv.id + '_root');
    await DB.del('conversations', conv.id);
    await DB.del('groups', conv.id);
  }
  const kbs = await DB.allByIndex('knowledge', 'charId', editingId);
  for (const k of kbs) await DB.del('knowledge', k.id);
  if (currentCharId === editingId) {
    currentCharId = characters[0]?.id || null;
    await DB.put('meta', { key: 'currentCharId', value: currentCharId });
    await loadConversations(); refreshConvSelect();
    await loadGroup();
    await loadConversation();
    await loadKnowledge(currentCharId); refreshKbCharSelect(); renderKbList();
    lastRenderedCount = 0; render();
  }
  refreshCharSelect(); openCharList(); scheduleAutoSync();
};

/* ============================================================
 *  输入框
 * ============================================================ */
const inputEl = document.getElementById('input');
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!isGenerating) sendMessage();
  }
});
document.getElementById('sendBtn').onclick = () => {
  if (isGenerating) { if (currentAbort) currentAbort.abort(); return; }
  sendMessage();
};
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => setTimeout(scrollToBottom, 100));
}
document.getElementById('themeBtn').onclick = cycleTheme;

/* ============================================================
 *  Service Worker
 * ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 注册失败', e));
  });
}

/* ============================================================
 *  启动
 * ============================================================ */
(async function main() {
  initAppearance();
  await openDB();
  await requestPersistentStorage();
  await migrateV3IfNeeded();
  await migrateV4IfNeeded();
  await loadCharacters();
  await loadApis();
  await loadConversations();
  await loadKnowledge(currentCharId);
  refreshCharSelect();
  refreshApiSelect();
  refreshConvSelect();
  refreshKbCharSelect();
  renderKbList();
  await loadGroup();
  await loadConversation();
  lastRenderedCount = 0;
  render();
  updatePinStatus();
  if (localStorage.getItem('rp_hasPin') === '1' && !CRYPTO.hasKey()) {
    setTimeout(async () => {
      const pin = prompt('请输入 PIN 解锁 API Key（留空则需重填 Key）');
      if (pin) { await CRYPTO.setPin(pin); updatePinStatus(); toast('已解锁'); }
    }, 600);
  }
  if (apis.length === 0) {
    document.getElementById('apiPanel').classList.add('show');
    openApiList();
  }
  const lastBackup = localStorage.getItem('rp_lastBackup');
  const now = Date.now();
  if (lastBackup && now - Number(lastBackup) > 7 * 86400 * 1000) {
    setTimeout(() => {
      if (confirm('已经 7 天没备份了，现在导出一份吗？')) {
        document.getElementById('exportBtn').click();
      }
    }, 1500);
  }
})();