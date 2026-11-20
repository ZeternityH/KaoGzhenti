/* 考公真题 PWA · 应用逻辑 */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const main = $('#main');
  const topbar = { back: $('#btnBack'), brand: $('#brand'), title: $('#topTitle'), more: $('#btnMore') };

  const state = {
    catalog: null,           // data/index.json
    view: 'home',
    paper: null,             // 当前套卷数据
    paperId: null,
    idx: 0,                  // 当前题号
    answers: {},             // qid -> 'A' / 'AB' / ...
    revealed: {},            // qid -> true 已提交
    marks: load('kg_marks', {}),       // qid -> true 收藏
    wrong: load('kg_wrong', {}),       // qid -> {paperId, no}
    progress: load('kg_progress', {}), // paperId -> {answers, revealed, idx, updated}
    stats: load('kg_stats', { total: 0, correct: 0, byModule: {} }),
    filter: { module: '全部', year: '全部', region: '全部', q: '' },
    randomPool: null,        // 随机练习的题目池
  };

  function load(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1600); }
  async function fetchJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

  // 分片加载：一个分片含约40套卷，加载后常驻内存，切换同片试卷零请求
  const shardCache = {};
  async function loadShard(file) {
    if (shardCache[file]) return shardCache[file];
    const data = await fetchJSON(file);
    shardCache[file] = data;
    return data;
  }
  function paperOf(meta) { return loadShard(meta.shard).then(d => d[meta.id]); }

  function setHeader(title) {
    topbar.back.hidden = !title;
    topbar.brand.hidden = !!title;
    topbar.title.hidden = !title;
    topbar.title.textContent = title || '';
  }
  function setNav(active) { $$('#bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === active)); }

  function navigate(view, opts = {}) {
    state.view = view;
    if (opts.title !== undefined) setHeader(opts.title); else if (view === 'home') setHeader('');
    setNav(['home', 'practice', 'wrong', 'stats'].includes(view) ? view : '');
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    const v = state.view;
    if (v === 'home') renderHome();
    else if (v === 'module') renderModule();
    else if (v === 'quiz') renderQuiz();
    else if (v === 'wrong') renderWrong();
    else if (v === 'stats') renderStats();
    else if (v === 'practice') renderPracticeHub();
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    const c = state.catalog;
    if (!c) { main.innerHTML = '<div class="view"><div class="empty">题库加载中…</div></div>'; return; }
    const total = c.totalQuestions.toLocaleString();
    const modules = c.modules.map(m => `
      <button class="module-card" data-module="${esc(m.name)}">
        <div class="mc-top"><span class="mc-emoji">${moduleEmoji(m.name)}</span><b>${esc(m.name)}</b></div>
        <div class="mc-num">${m.questions.toLocaleString()} 题 · ${m.papers} 卷</div>
      </button>`).join('');
    main.innerHTML = `<div class="view">
      <div class="hero">
        <h1>刷真题，上岸快一步</h1>
        <p>覆盖 2016–2026 国考/省考/选调 · 原题 + 官方解析</p>
        <div class="hero-stats">
          <div class="hero-stat"><b>${total}</b><span>真题总数</span></div>
          <div class="hero-stat"><b>${c.totalPapers}</b><span>试卷套数</span></div>
          <div class="hero-stat"><b>${Object.keys(state.progress).length}</b><span>已练套卷</span></div>
        </div>
      </div>
      <div class="section-title">快速开始</div>
      <div class="quick-grid">
        <button class="quick-card" data-nav-go="random"><span class="qc-icon purple">🎲</span><span><b>随机练习</b><span>按模块智能抽题</span></span></button>
        <button class="quick-card" data-nav-go="continue"><span class="qc-icon green">▶</span><span><b>继续做题</b><span>接着上次进度</span></span></button>
        <button class="quick-card" data-nav-go="wrong"><span class="qc-icon red">✕</span><span><b>错题本</b><span>${Object.keys(state.wrong).length} 道待巩固</span></span></button>
        <button class="quick-card" data-nav-go="fav"><span class="qc-icon blue">☆</span><span><b>我的收藏</b><span>${Object.keys(state.marks).length} 道已收藏</span></span></button>
      </div>
      <div class="section-title">按模块刷题 <small>共 ${c.modules.length} 个模块</small></div>
      <div class="module-grid">${modules}</div>
    </div>`;

    $$('[data-module]', main).forEach(b => b.onclick = () => { state.filter.module = b.dataset.module; state.filter.year = '全部'; state.filter.region = '全部'; state.filter.q = ''; navigate('module', { title: b.dataset.module }); });
    $$('[data-nav-go]', main).forEach(b => b.onclick = () => {
      const g = b.dataset.navGo;
      if (g === 'random') navigate('practice');
      else if (g === 'wrong') navigate('wrong');
      else if (g === 'fav') openFav();
      else if (g === 'continue') continueLast();
    });
  }
  function moduleEmoji(n) { return ({ '政治理论': '🚩', '常识判断': '💡', '言语理解与表达': '📖', '数量关系': '🔢', '判断推理': '🧩', '资料分析': '📊' })[n] || '📚'; }

  /* ---------- 试卷列表 ---------- */
  function renderModule() {
    const c = state.catalog; if (!c) return;
    let papers = c.papers.filter(p => state.filter.module === '全部' || p.module === state.filter.module);
    const years = ['全部', ...Array.from(new Set(papers.map(p => p.year).filter(Boolean))).sort().reverse()];
    const regions = ['全部', ...Array.from(new Set(papers.map(p => p.region).filter(Boolean))).sort()];
    if (state.filter.year !== '全部') papers = papers.filter(p => p.year === state.filter.year);
    if (state.filter.region !== '全部') papers = papers.filter(p => p.region === state.filter.region);
    const q = state.filter.q.trim();
    if (q) papers = papers.filter(p => p.title.includes(q));

    main.innerHTML = `<div class="view">
      <div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="searchInput" placeholder="搜索试卷名称" value="${esc(state.filter.q)}" /></div>
      <div class="chips">${years.map(y => `<button class="chip ${state.filter.year === y ? 'active' : ''}" data-year="${esc(y)}">${esc(y)}</button>`).join('')}</div>
      <div class="chips">${regions.map(r => `<button class="chip ${state.filter.region === r ? 'active' : ''}" data-region="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <div class="section-title">共 ${papers.length} 套试卷</div>
      <div class="list">${papers.map(p => {
        const pr = state.progress[p.id];
        const done = pr ? Object.keys(pr.revealed || {}).length : 0;
        return `<button class="paper-item" data-paper="${p.id}"><div class="pi-title">${esc(p.title)}</div>
          <div class="pi-meta"><span class="tag">${esc(p.module)}</span><span>${esc(p.region || '')} ${esc(p.year || '')}</span><span>${p.count} 题</span>
          ${done ? `<span class="pi-progress">${Math.round(done / p.count * 100)}%</span>` : ''}</div></button>`;
      }).join('') || '<div class="empty">没有匹配的试卷</div>'}</div>
    </div>`;

    const si = $('#searchInput');
    si.oninput = e => { state.filter.q = e.target.value; clearTimeout(si._t); si._t = setTimeout(() => { const pos = si.selectionStart; renderModule(); const n = $('#searchInput'); n.focus(); n.setSelectionRange(pos, pos); }, 300); };
    $$('[data-year]', main).forEach(b => b.onclick = () => { state.filter.year = b.dataset.year; renderModule(); });
    $$('[data-region]', main).forEach(b => b.onclick = () => { state.filter.region = b.dataset.region; renderModule(); });
    $$('[data-paper]', main).forEach(b => b.onclick = () => openPaper(b.dataset.paper));
  }

  async function openPaper(id) {
    try {
      toast('加载试卷中…');
      const p = await paperOf(state.catalog.papers.find(x => x.id === id));
      tagQuestions(id, p.questions);
      state.paper = p; state.paperId = id; state.randomPool = null;
      const pr = state.progress[id];
      state.answers = pr?.answers || {}; state.revealed = pr?.revealed || {}; state.idx = pr?.idx || 0;
      if (state.idx >= p.questions.length) state.idx = 0;
      navigate('quiz', { title: p.title });
    } catch (e) { toast('加载失败：' + e.message); }
  }

  function continueLast() {
    const entries = Object.entries(state.progress).filter(([, v]) => v.updated);
    if (!entries.length) { toast('还没有做题记录，先选一套卷吧'); navigate('module', { title: '全部试卷' }); state.filter.module = '全部'; renderModule(); return; }
    entries.sort((a, b) => b[1].updated - a[1].updated);
    openPaper(entries[0][0]);
  }

  /* ---------- 随机练习 ---------- */
  let randomLoading = false;   // 组题进行中锁，防止连点启动多个并行流程
  let randomToken = 0;         // 每次组题递增序号，旧流程完成时不许覆盖新结果

  // 组题期间禁用所有模块按钮并显示加载态，避免用户误以为没响应而反复点击
  function setRandButtonsLoading(on) {
    $$('[data-rand]', main).forEach(b => {
      b.disabled = on;
      if (on) {
        if (!b.dataset.origHtml) b.dataset.origHtml = b.innerHTML;
        b.innerHTML = '<span class="qc-icon blue">⏳</span><span><b>组题中…</b><span>请稍候</span></span>';
      } else if (b.dataset.origHtml) {
        b.innerHTML = b.dataset.origHtml;
        delete b.dataset.origHtml;
      }
    });
  }

  function renderPracticeHub() {
    const c = state.catalog;
    main.innerHTML = `<div class="view">
      <div class="section-title">随机练习 <small>从题库中智能抽题</small></div>
      <div class="quick-grid" style="grid-template-columns:1fr 1fr">
        ${c.modules.map(m => `<button class="quick-card" data-rand="${esc(m.name)}"><span class="qc-icon blue">${moduleEmoji(m.name)}</span><span><b>${esc(m.name)}</b><span>${m.questions.toLocaleString()} 题可选</span></span></button>`).join('')}
        <button class="quick-card" data-rand="全部"><span class="qc-icon purple">🎯</span><span><b>全部混合</b><span>六大模块随机</span></span></button>
      </div>
      <div class="section-title">练习设置</div>
      <div class="sheet" style="position:static;display:block;border-radius:16px;box-shadow:var(--shadow)">
        <div class="row"><span>每次题量</span><span><select id="randCount"><option>10</option><option selected>20</option><option>30</option><option>50</option></select></span></div>
        <div class="row"><span>已收藏题目</span><button class="btn ghost" id="goFav">查看 ${Object.keys(state.marks).length} 道</button></div>
      </div>
    </div>`;
    $$('[data-rand]', main).forEach(b => b.onclick = () => startRandom(b.dataset.rand, +$('#randCount').value));
    $('#goFav').onclick = openFav;
    // 若组题仍在进行中（例如切走再回到本页），保持按钮禁用态
    if (randomLoading) setRandButtonsLoading(true);
  }

  async function startRandom(moduleName, count) {
    // 防连点：已在组题中则直接忽略本次点击
    if (randomLoading) return;
    randomLoading = true;
    const token = ++randomToken;
    setRandButtonsLoading(true);
    try {
      toast('正在抽题…');
      let pool = state.catalog.papers.filter(p => moduleName === '全部' || p.module === moduleName);
      pool = shuffle(pool.slice());

      // 先并发预热需要的分片（首次组题的主要耗时在网络下载），带缓存复用
      const needed = new Set();
      for (const p of pool) { needed.add(p.shard); if (needed.size >= 6) break; }
      await Promise.all([...needed].map(s => loadShard(s).catch(() => ({}))));
      if (token !== randomToken) return; // 已被更新的请求取代

      // 分片已在内存，后续 paperOf 同步命中缓存，不会再卡顿
      const picked = [];
      for (const p of pool) {
        if (picked.length >= count) break;
        const data = await paperOf(p);
        if (!data) continue;
        data.questions.forEach((q, i) => { q._pid = p.id; q._i = i; q._module = p.module; q._key = `${p.id}#${i}`; });
        picked.push(...data.questions);
      }
      if (token !== randomToken) return;
      if (!picked.length) { toast('题库加载失败，请检查网络后重试'); return; }

      state.randomPool = shuffle(picked).slice(0, count);
      state.paper = { title: `随机练习 · ${moduleName} · ${state.randomPool.length}题`, questions: state.randomPool };
      state.paperId = null; state.answers = {}; state.revealed = {}; state.idx = 0;
      navigate('quiz', { title: '随机练习' });
    } catch (e) { toast('抽题失败：' + e.message); }
    finally {
      // 只有最后一次请求才负责解锁并恢复按钮；旧请求结束不动锁
      if (token === randomToken) { randomLoading = false; setRandButtonsLoading(false); }
    }
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- 答题 ---------- */
  function currentQ() {
    const qs = state.paper.questions;
    return state.randomPool ? qs[state.idx] : null;
  }
  // 用「所在卷+题号」作唯一键：同一 qid 在多套卷中重复出现，仅用 qid 会串答案
  function qidOf(q) {
    if (q._key) return q._key;
    return q.qid || `${q._pid || ''}#${q._i ?? 0}`;
  }
  // 给一套卷的题目打上稳定来源标记（幂等）
  function tagQuestions(pid, questions) {
    questions.forEach((q, i) => { if (q._pid === undefined) q._pid = pid; if (q._i === undefined) q._i = i; q._key = `${q._pid}#${i}`; });
    return questions;
  }
  function rawQid(q) { return q.qid || ''; }

  function renderQuiz() {
    const p = state.paper; if (!p) return;
    const qs = p.questions, n = qs.length;
    if (!n) { main.innerHTML = '<div class="empty">该试卷暂无题目</div>'; return; }
    state.idx = Math.max(0, Math.min(state.idx, n - 1));
    const q = qs[state.idx], qid = qidOf(q);
    const chosen = state.answers[qid] || '';
    const revealed = !!state.revealed[qid];
    const correct = q.options.filter(o => o.correct).map(o => o.key).sort().join('');
    const isRight = revealed && chosen === correct;

    const material = q.material ? `<div class="material"><div class="mat-label">📎 材料题（点击展开/收起）</div><details open><summary style="display:none">材料</summary>${q.material}</details></div>` : '';

    main.innerHTML = `<div class="view">
      <div class="quiz-head">
        <div class="qh-top"><span>第 ${state.idx + 1} / ${n} 题</span><span>${esc(q.tag || '')}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${(state.idx + 1) / n * 100}%"></div></div>
      </div>
      ${material}
      <div class="qcard">
        <div class="qtag">${esc(q._module || p.module || '行测')} · qid ${esc(rawQid(q))}</div>
        <div class="qstem">${q.stem}</div>
        <div class="opts">${q.options.map(o => {
          let cls = 'opt';
          if (revealed) {
            if (o.correct) cls += ' correct';
            else if (chosen.includes(o.key)) cls += ' wrong';
            cls += ' locked';
          } else if (chosen.includes(o.key)) cls += ' selected';
          return `<button class="${cls}" data-opt="${esc(o.key)}"><span class="key">${esc(o.key)}</span><span class="otext">${o.text || esc(o.key)}</span></button>`;
        }).join('')}</div>
        <div class="answerbar">
          ${revealed ? `<span class="ans-badge ${isRight ? 'right' : 'wrong'}">${isRight ? '✓ 回答正确' : '✕ 回答错误'}</span><span style="color:var(--muted);font-size:13px">正确答案：${esc(correct)}</span>` : ''}
          <button class="fab-mark" id="btnMark" title="收藏">${state.marks[qid] ? '★' : '☆'}</button>
        </div>
        ${!revealed && chosen ? '<button class="btn primary" id="btnSubmit" style="width:100%;margin-top:12px">提交答案</button>' : ''}
        ${revealed ? `<div class="qexp"><div class="exp-title">官方解析</div>${q.explanation || '（暂无解析）'}</div>` : ''}
      </div>
      <div class="qnav">
        <button class="btn ghost" id="btnPrev" ${state.idx === 0 ? 'disabled' : ''}>上一题</button>
        <button class="btn ghost" id="btnSheet">答题卡</button>
        <button class="btn primary" id="btnNext">${state.idx === n - 1 ? '完成' : '下一题'}</button>
      </div>
    </div>`;

    $$('[data-opt]', main).forEach(b => b.onclick = () => {
      if (revealed) return;
      const key = b.dataset.opt;
      const multi = correct.length > 1;
      if (multi) {
        let arr = chosen ? chosen.split('') : [];
        arr = arr.includes(key) ? arr.filter(x => x !== key) : [...arr, key];
        state.answers[qid] = arr.sort().join('');
      } else state.answers[qid] = key;
      saveProgress(); renderQuiz();
    });
    const sub = $('#btnSubmit'); if (sub) sub.onclick = submitAnswer;
    $('#btnPrev').onclick = () => { if (state.idx > 0) { state.idx--; saveProgress(); renderQuiz(); } };
    $('#btnNext').onclick = () => { if (state.idx < n - 1) { state.idx++; saveProgress(); renderQuiz(); } else finishQuiz(); };
    $('#btnSheet').onclick = openSheet;
    $('#btnMark').onclick = () => { if (state.marks[qid]) { delete state.marks[qid]; toast('已取消收藏'); } else { state.marks[qid] = true; toast('已收藏'); } save('kg_marks', state.marks); renderQuiz(); };
    // 材料题详情点击展开收起
    const det = $('.material details'); if (det) $('.mat-label').onclick = () => { det.open = !det.open; };
  }

  function submitAnswer() {
    const q = state.paper.questions[state.idx], qid = qidOf(q);
    const chosen = state.answers[qid]; if (!chosen) return;
    const correct = q.options.filter(o => o.correct).map(o => o.key).sort().join('');
    const right = chosen === correct;
    state.revealed[qid] = true;
    state.stats.total++; if (right) state.stats.correct++;
    const m = q._module || state.paper.module || '其他';
    state.stats.byModule[m] = state.stats.byModule[m] || { total: 0, correct: 0 };
    state.stats.byModule[m].total++; if (right) state.stats.byModule[m].correct++;
    save('kg_stats', state.stats);
    if (!right) { state.wrong[qid] = { paperId: state.paperId || q._pid || null, no: q._i ?? state.idx, module: m }; save('kg_wrong', state.wrong); }
    else if (state.wrong[qid]) { delete state.wrong[qid]; save('kg_wrong', state.wrong); }
    saveProgress(); renderQuiz();
  }

  function saveProgress() {
    if (!state.paperId) return;
    state.progress[state.paperId] = { answers: state.answers, revealed: state.revealed, idx: state.idx, updated: Date.now() };
    save('kg_progress', state.progress);
  }
  function finishQuiz() { toast('已完成本轮练习'); saveProgress(); navigate('home'); }

  function openSheet() {
    const qs = state.paper.questions;
    const html = `<button class="sheet-close" data-close>×</button><h3>答题卡</h3>
      <div class="grid-nums">${qs.map((q, i) => {
        const qid = qidOf(q); let cls = '';
        if (state.revealed[qid]) { const correct = q.options.filter(o => o.correct).map(o => o.key).sort().join(''); cls = state.answers[qid] === correct ? 'right' : 'wrong'; }
        else if (state.answers[qid]) cls = 'done';
        return `<button class="${cls} ${i === state.idx ? 'cur' : ''}" data-jump="${i}">${i + 1}</button>`;
      }).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:16px"><button class="btn ghost" id="sheetReset" style="flex:1">清空本题进度</button><button class="btn primary" id="sheetClose2" style="flex:1">返回</button></div>`;
    openBottomSheet(html);
    $$('[data-jump]', $('#sheet')).forEach(b => b.onclick = () => { state.idx = +b.dataset.jump; closeBottomSheet(); saveProgress(); renderQuiz(); });
    $('#sheetClose2').onclick = closeBottomSheet;
    $('#sheetReset').onclick = () => { state.answers = {}; state.revealed = {}; state.idx = 0; saveProgress(); closeBottomSheet(); renderQuiz(); toast('已清空'); };
  }

  /* ---------- 错题本 / 收藏 ---------- */
  function renderWrong() {
    const items = Object.entries(state.wrong);
    main.innerHTML = `<div class="view"><div class="section-title">错题本 <small>${items.length} 道 · 答对后自动移除</small></div>
      ${items.length ? `<div class="list">${items.map(([qid, info]) => `<button class="paper-item" data-wrong="${esc(qid)}" data-pid="${esc(info.paperId || '')}">
        <div class="pi-title">${esc(qid)} · ${esc(info.module || '')}</div>
        <div class="pi-meta"><span>${info.paperId ? '点击回到原题' : '随机题'}</span><span>第 ${(info.no || 0) + 1} 题</span></div></button>`).join('')}</div>
        <button class="btn ghost" id="clearWrong" style="width:100%;margin-top:14px">清空错题本</button>`
        : '<div class="empty">错题本是空的，继续保持！<br/>答错的题会自动收集到这里。</div>'}</div>`;
    $$('[data-wrong]', main).forEach(b => b.onclick = async () => {
      const pid = b.dataset.pid;
      if (pid) { await openPaper(pid); state.idx = state.wrong[b.dataset.wrong]?.no || 0; renderQuiz(); }
      else toast('该题来自随机练习，请在题库中搜索 qid 查找');
    });
    const cw = $('#clearWrong'); if (cw) cw.onclick = () => { if (confirm('确定清空错题本？')) { state.wrong = {}; save('kg_wrong', {}); renderWrong(); } };
  }

  async function openFav() {
    const ids = Object.keys(state.marks);
    if (!ids.length) { toast('还没有收藏题目'); return; }
    setHeader('我的收藏'); setNav('');
    main.innerHTML = '<div class="view"><div class="empty">加载收藏中…</div></div>';
    const found = [];
    // 按分片去重加载，避免同一分片重复请求
    const doneShards = {};
    for (const p of state.catalog.papers) {
      if (doneShards[p.shard]) continue;
      doneShards[p.shard] = true;
      const shard = await loadShard(p.shard);
      for (const [pid, data] of Object.entries(shard)) {
        const meta = state.catalog.papers.find(x => x.id === pid);
        data.questions.forEach((q, i) => { const key = `${pid}#${i}`; if (state.marks[key]) { q._pid = pid; q._i = i; q._key = key; q._module = meta?.module || ''; found.push(q); } });
      }
      if (found.length >= ids.length) break;
    }
    state.randomPool = found;
    state.paper = { title: `我的收藏 · ${found.length}题`, questions: found };
    state.paperId = null; state.answers = {}; state.revealed = {}; state.idx = 0;
    navigate('quiz', { title: '我的收藏' });
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    const s = state.stats;
    const rate = s.total ? Math.round(s.correct / s.total * 100) : 0;
    const circ = 2 * Math.PI * 52;
    const modRows = Object.entries(s.byModule).sort((a, b) => b[1].total - a[1].total).map(([m, v]) => {
      const r = Math.round(v.correct / v.total * 100);
      return `<div class="bar-row"><div class="bar-label"><span>${esc(m)}</span><span>${r}% · ${v.total}题</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${r}%"></div></div></div>`;
    }).join('');
    main.innerHTML = `<div class="view">
      <div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="11"/>
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--primary)" stroke-width="11"
          stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - rate / 100)}"
          transform="rotate(-90 60 60)"/>
        <text x="60" y="57" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text)">${rate}%</text>
        <text x="60" y="78" text-anchor="middle" font-size="12" fill="var(--muted)">正确率</text>
      </svg></div>
      <div class="stat-grid">
        <div class="stat-card"><b>${s.total}</b><span>累计作答</span></div>
        <div class="stat-card"><b>${s.correct}</b><span>答对题数</span></div>
        <div class="stat-card"><b>${Object.keys(state.wrong).length}</b><span>错题待巩固</span></div>
        <div class="stat-card"><b>${Object.keys(state.progress).length}</b><span>练习套卷</span></div>
      </div>
      <div class="section-title">各模块正确率</div>
      <div class="card" style="background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--shadow)">
        ${modRows || '<div class="empty" style="padding:24px">还没有作答记录</div>'}
      </div>
      <button class="btn ghost" id="resetAll" style="width:100%;margin-top:16px">清空所有学习数据</button>
    </div>`;
    $('#resetAll').onclick = () => { if (confirm('确定清空所有进度、错题和统计？此操作不可恢复。')) { ['kg_marks','kg_wrong','kg_progress','kg_stats'].forEach(k => localStorage.removeItem(k)); location.reload(); } };
  }

  /* ---------- 底部弹层 ---------- */
  function openBottomSheet(html) { $('#sheet').innerHTML = html; $('#sheet').hidden = false; $('#sheetMask').hidden = false; }
  function closeBottomSheet() { $('#sheet').hidden = true; $('#sheetMask').hidden = true; }
  $('#sheetMask').onclick = closeBottomSheet;

  /* ---------- 更多菜单 ---------- */
  topbar.more.onclick = () => {
    openBottomSheet(`<button class="sheet-close" data-close>×</button><h3>更多</h3>
      <div class="row"><span>题库版本</span><span style="color:var(--muted)">2016–2026 · 58890题</span></div>
      <div class="row"><span>离线使用</span><span style="color:var(--muted)">${navigator.onLine ? '已联网' : '离线中'}</span></div>
      <div class="row"><button class="btn ghost" style="flex:1" id="mHome">返回首页</button></div>
      <div class="row"><button class="btn ghost" style="flex:1" id="mFav">我的收藏</button></div>`);
    // 菜单内容刚插入 DOM，必须在此之后再绑定事件
    $('#mHome').onclick = () => { closeBottomSheet(); navigate('home'); };
    $('#mFav').onclick = () => { closeBottomSheet(); openFav(); };
  };

  // 事件委托：sheet 关闭按钮
  document.addEventListener('click', e => { if (e.target.matches('[data-close]')) closeBottomSheet(); });

  /* ---------- 导航与返回 ---------- */
  $$('#bottomnav button').forEach(b => b.onclick = () => {
    const n = b.dataset.nav;
    if (n === 'home') navigate('home');
    else if (n === 'practice') navigate('practice');
    else if (n === 'wrong') navigate('wrong');
    else if (n === 'stats') navigate('stats');
  });
  topbar.back.onclick = () => {
    if (state.view === 'quiz') { if (state.paperId) { const pr = state.progress[state.paperId]; navigate('module', { title: state.filter.module }); state.filter.module = state.paper?.module || state.filter.module; renderModule(); } else navigate('practice'); }
    else if (state.view === 'module') navigate('home');
    else navigate('home');
  };

  /* ---------- 安装提示 ---------- */
  let deferredPrompt = null;
  const banner = $('#installBanner');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (!localStorage.getItem('kg_install_dismiss')) banner.hidden = false; });
  $('#btnInstall').onclick = async () => { banner.hidden = true; localStorage.setItem('kg_install_dismiss', '1'); if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; } else toast('请在浏览器菜单中选择「添加到主屏幕」'); };
  $('#btnInstallClose').onclick = () => { banner.hidden = true; localStorage.setItem('kg_install_dismiss', '1'); };

  /* ---------- Service Worker ---------- */
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  /* ---------- 启动 ---------- */
  (async function init() {
    try { state.catalog = await fetchJSON('./data/index.json'); }
    catch (e) { main.innerHTML = `<div class="empty">题库数据加载失败<br/><small>${esc(e.message)}</small></div>`; return; }
    renderHome();
  })();
})();
