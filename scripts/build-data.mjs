/**
 * 行测题库 -> 分片式 PWA 数据
 * 输出:
 *   data/index.json            试卷元数据 + 每卷所属分片
 *   data/shards/s001.json ...  每片约 40 套卷的完整题目（按需加载）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = [
  ['01-政治理论', '政治理论'], ['02-常识判断', '常识判断'],
  ['03-言语理解与表达', '言语理解与表达'], ['04-数量关系', '数量关系'],
  ['05-判断推理', '判断推理'], ['06-资料分析', '资料分析'],
];
const PER_SHARD = 40;

const normImages = (s = '') => s
  .replace(/src=(["'])(?:\.\.\/)*90-图片\//g, 'src=$190-图片/')
  .replace(/<img\s/g, '<img loading="lazy" decoding="async" ');
const cleanBlock = (s = '') => s.replace(/^\s*---\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w\u4e00-\u9fa5]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[kv[1]] = v;
  }
  return out;
}
function parseQuestion(content, no, qid, tag) {
  const lines = content.split('\n');
  let os_ = lines.findIndex(l => /^\s*-\s+\*\*[A-Za-z]\*\*/.test(l));
  if (os_ < 0) os_ = lines.length;
  const stem = normImages(cleanBlock(lines.slice(0, os_).join('\n')));
  const options = [];
  for (let i = os_; i < lines.length; i++) {
    const om = lines[i].match(/^\s*-\s+\*\*([A-Za-z])\*\*[.．、]?\s*(.*)$/);
    if (!om) continue;
    options.push({ key: om[1].toUpperCase(), text: normImages(om[2].replace(/✅/g, '').trim()), correct: om[2].includes('✅') });
  }
  const rest = lines.slice(os_).join('\n');
  const am = rest.match(/\*\*答案\*\*\s*[:：]\s*([^\n]+)/);
  const answer = am ? am[1].replace(/✅/g, '').trim() : '';
  let explanation = '';
  const ei = rest.indexOf('**官方解析**');
  if (ei >= 0) explanation = normImages(cleanBlock(rest.slice(ei + '**官方解析**'.length)));
  return { no, qid, tag, stem, options, answer, explanation };
}
function parsePaper(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const fm = parseFrontmatter(text);
  const body = text.slice(text.indexOf('\n---') + 4);
  const markers = [];
  let m;
  const matRe = /^##\s+材料\s*(\d+)\s*$/gm;
  const qRe = /^#{2,3}\s+第\s*(\d+)\s*题[　\s]*<sub>\s*qid\s+(\d+)\s*·\s*([^<]*)<\/sub>\s*$/gm;
  while ((m = matRe.exec(body))) markers.push({ pos: m.index, end: m.index + m[0].length, type: 'material' });
  while ((m = qRe.exec(body))) markers.push({ pos: m.index, end: m.index + m[0].length, type: 'question', no: +m[1], qid: m[2], tag: (m[3] || '').trim() });
  markers.sort((a, b) => a.pos - b.pos);
  let material = '';
  const questions = [];
  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];
    const next = i + 1 < markers.length ? markers[i + 1].pos : body.length;
    const content = body.slice(mk.end, next);
    if (mk.type === 'material') material = normImages(cleanBlock(content));
    else {
      const q = parseQuestion(content, mk.no, mk.qid, mk.tag);
      if (material) q.material = material;
      if (q.stem || q.options.length) questions.push(q);
    }
  }
  const tm = body.match(/^#\s+(.+)$/m);
  return { title: fm['试卷'] || (tm ? tm[1].trim() : ''), module: fm['模块'] || '', year: fm['年份'] || '', region: fm['地区'] || '', count: questions.length, questions };
}

async function main() {
  const shardDir = path.join(ROOT, 'data', 'shards');
  await fs.mkdir(shardDir, { recursive: true });
  const catalog = { generatedAt: new Date().toISOString(), totalPapers: 0, totalQuestions: 0, modules: [], papers: [] };
  const pending = []; // {meta, paper}
  let shardNo = 0;

  async function flushShard() {
    if (!pending.length) return;
    shardNo++;
    const name = `s${String(shardNo).padStart(3, '0')}`;
    const obj = {};
    for (const { meta, paper } of pending) {
      obj[meta.id] = paper;
      meta.shard = `data/shards/${name}.json`;
    }
    await fs.writeFile(path.join(shardDir, `${name}.json`), JSON.stringify(obj), 'utf8');
    pending.length = 0;
  }

  for (let mi = 0; mi < MODULES.length; mi++) {
    const [dirName, moduleName] = MODULES[mi];
    const dir = path.join(ROOT, dirName);
    let files = [];
    try { files = (await fs.readdir(dir)).filter(f => f.endsWith('.md') && f !== 'README.md').sort(); }
    catch { continue; }
    const mod = { id: `m${mi + 1}`, name: moduleName, papers: 0, questions: 0 };
    for (let i = 0; i < files.length; i++) {
      const raw = await fs.readFile(path.join(dir, files[i]), 'utf8');
      let paper;
      try { paper = parsePaper(raw); } catch { continue; }
      if (!paper.questions.length) continue;
      const id = `m${mi + 1}-${String(i + 1).padStart(4, '0')}`;
      const meta = { id, title: paper.title, module: moduleName, year: paper.year, region: paper.region, count: paper.count };
      catalog.papers.push(meta);
      pending.push({ meta, paper });
      mod.papers++; mod.questions += paper.count;
      if (pending.length >= PER_SHARD) await flushShard();
    }
    catalog.modules.push(mod);
    console.log(`${moduleName}: ${mod.papers} 卷 / ${mod.questions} 题`);
  }
  await flushShard();
  catalog.totalPapers = catalog.papers.length;
  catalog.totalQuestions = catalog.papers.reduce((s, p) => s + p.count, 0);
  await fs.writeFile(path.join(ROOT, 'data', 'index.json'), JSON.stringify(catalog), 'utf8');
  console.log(`合计 ${catalog.totalPapers} 卷 / ${catalog.totalQuestions} 题 / ${shardNo} 分片`);
}
main().catch(e => { console.error(e); process.exit(1); });
