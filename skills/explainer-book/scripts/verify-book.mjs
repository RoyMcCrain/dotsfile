#!/usr/bin/env node
// 章立ての学習資料 (<topic>-book/) を検査する。本全体の構造を見てから、各章を verify-doc.mjs に渡す。
//
//   node verify-book.mjs <book-dir> [--write] [--skip-html]
//
// 本全体 (book.json に照らして)
//   chapters    章ファイルが存在し、NN- の番号が book.json の順と一致するか
//   objectives  各章の学習目標に <!-- quiz: <id> --> が 1 つ以上あるか。quiz が知らない目標を名指ししていないか
//   concepts    概念を、それを導入する章より前の章で使っていないか。requires が前の章で導入済みか
//   budget      本文の推定読了時間が、章の minutes に収まるか
//   exercises   演習の印 <!-- exercise: <id> --> があり、答えが <details> の中にあるか。
//               starter (未完成で落ちるはずの検査) と answer (通るはずの検査) が checks.json にあるか
//   map         book.json から章の依存図 (Mermaid) と事実シートを作り、コミット済みと一致するか
// 各章 (verify-doc.mjs --pages README.md,01-….md,…)
//   checks.json の再実行、引用の照合、図の検査、HTML の vlmkit ゲート
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { write: { type: 'boolean', default: false }, 'skip-html': { type: 'boolean', default: false } },
});
const bookDir = resolve(positionals[0] ?? '.');
const here = dirname(fileURLToPath(import.meta.url));
const verifyDoc = join(here, '../../explainer/scripts/verify-doc.mjs');

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const ng = (msg, fix) => { failures++; console.log(`  ✗ ${msg}${fix ? `\n    → ${fix}` : ''}`); };

const book = JSON.parse(readFileSync(join(bookDir, 'book.json'), 'utf8'));
const checks = existsSync(join(bookDir, 'checks.json'))
  ? new Set(JSON.parse(readFileSync(join(bookDir, 'checks.json'), 'utf8')).checks.map((c) => c.name))
  : new Set();
const read = (f) => (existsSync(join(bookDir, f)) ? readFileSync(join(bookDir, f), 'utf8') : null);

// 本文だけ (コードブロック・HTML コメント・details の中身を除く): 概念の使用と読了時間の推定に使う
const prose = (md) => md.replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<details>[\s\S]*?<\/details>/g, '');
const codeLines = (md) => [...md.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].reduce((n, m) => n + m[1].split('\n').length - 1, 0);

// ---- chapters ------------------------------------------------------------------
console.log('chapters');
book.chapters.forEach((c, i) => {
  const want = String(i + 1).padStart(2, '0');
  if (!read(c.file)) ng(`${c.file}: listed in book.json but missing`);
  else if (!c.file.startsWith(`${want}-`)) ng(`${c.file}: is chapter ${i + 1} in book.json`, `rename it to ${want}-….md so the file order is the reading order`);
  else ok(`${c.file} (${c.kind})`);
});
if (book.chapters[0]?.kind !== 'quickstart') ng('chapter 1 is not a quickstart', 'the first chapter should get the reader to a working result before any theory');

// ---- objectives ----------------------------------------------------------------
console.log('objectives (学習目標 ↔ 理解度チェック)');
for (const c of book.chapters) {
  const md = read(c.file) ?? '';
  const quizzes = [...md.matchAll(/<!--\s*quiz:\s*([\w-]+)\s*-->/g)].map((m) => m[1]);
  for (const o of c.objectives ?? []) {
    quizzes.includes(o.id) ? ok(`${c.file}: ${o.id}`) : ng(`${c.file}: objective "${o.id}" is never quizzed`, 'add a question that asks the reader to make that judgement: <!-- quiz: ' + o.id + ' --> before its <details>');
  }
  for (const q of quizzes)
    if (!(c.objectives ?? []).some((o) => o.id === q)) ng(`${c.file}: quiz names "${q}", which is not an objective of this chapter`);
  if (!(c.objectives ?? []).length) ng(`${c.file}: no objectives`, 'write 1–3 things the reader can do after this chapter');
}

// ---- concepts ------------------------------------------------------------------
console.log('concepts (導入より前に使っていないか)');
const introducedIn = new Map();
book.chapters.forEach((c, i) => (c.introduces ?? []).forEach((t) => introducedIn.set(t, i)));
const termsOf = (t) => [t, ...((book.aliases ?? {})[t] ?? [])];
book.chapters.forEach((c, i) => {
  const text = prose(read(c.file) ?? '');
  for (const [t, at] of introducedIn) {
    if (at <= i) continue;
    const hit = termsOf(t).find((w) => text.includes(w));
    if (hit) ng(`${c.file}: uses "${hit}" before chapter ${at + 1} introduces it`, `move the definition earlier (introduces), or reword this chapter`);
  }
  for (const r of c.requires ?? []) {
    if ((book.assumed ?? []).includes(r)) continue;
    const at = introducedIn.get(r);
    if (at === undefined) ng(`${c.file}: requires "${r}", which no chapter introduces`, 'add it to a chapter\'s introduces, or to book.json "assumed" if the persona already knows it');
    else if (at >= i) ng(`${c.file}: requires "${r}", introduced only in chapter ${at + 1}`);
  }
  for (const t of c.introduces ?? [])
    termsOf(t).some((w) => text.includes(w)) ? ok(`${c.file}: introduces ${t}`) : ng(`${c.file}: claims to introduce "${t}" but never mentions it`);
});

// ---- budget --------------------------------------------------------------------
console.log('budget (推定読了時間 ≤ minutes)');
const CPM = book.charsPerMinute ?? 500; // 日本語の黙読 400〜600 字/分
const LPM = book.codeLinesPerMinute ?? 15;
for (const c of book.chapters) {
  const md = read(c.file) ?? '';
  const chars = prose(md).replace(/\s/g, '').length;
  const est = chars / CPM + codeLines(md) / LPM;
  const line = `${c.file}: ~${est.toFixed(1)} min to read (${chars} chars, ${codeLines(md)} code lines), budget ${c.minutes}`;
  est <= c.minutes ? ok(line) : ng(line, 'split the chapter or cut what the persona already knows');
}

// ---- exercises -----------------------------------------------------------------
console.log('exercises (演習: 未完成なら落ち、答えなら通る)');
for (const e of book.exercises ?? []) {
  const md = read(e.chapter) ?? '';
  const at = md.indexOf(`<!-- exercise: ${e.id} -->`);
  if (at < 0) { ng(`${e.id}: no <!-- exercise: ${e.id} --> in ${e.chapter}`); continue; }
  const before = failures;
  const after = md.slice(at);
  if (!/<details>/.test(after.split(/\n## /)[0])) ng(`${e.id}: the answer is not inside a <details> in the same section`, 'hide the answer so the reader tries first');
  for (const n of [...(e.starter ?? []), ...(e.answer ?? [])])
    if (!checks.has(n)) ng(`${e.id}: check "${n}" is not in checks.json`);
  if (!(e.answer ?? []).length) ng(`${e.id}: no answer check`, 'an exercise whose answer is not executed can teach a wrong answer');
  else if (e.kind === 'write' && !(e.starter ?? []).length) ng(`${e.id}: a "write" exercise needs a starter check that fails`, 'prove the exercise is not already solved by the starting point');
  else if (failures === before) ok(`${e.id}: ${(e.starter ?? []).length} starter check(s) expected to fail, ${e.answer.length} answer check(s)`);
}

// ---- map -----------------------------------------------------------------------
console.log('map (章の依存図 = book.json)');
const id = (i) => `ch${String(i + 1).padStart(2, '0')}`;
const deps = [];
book.chapters.forEach((c, i) => {
  for (const r of c.requires ?? []) {
    const at = introducedIn.get(r);
    if (at !== undefined && at < i && !deps.includes(`${id(i)}->${id(at)}`)) deps.push(`${id(i)}->${id(at)}`);
  }
});
const label = (c, i) => `${String(i + 1).padStart(2, '0')} ${c.short ?? c.file}`.replace(/"/g, "'");
// 題は図に入れない（長い本の題は狭い画面ではみ出す）。README の画像の alt / 本文で言う
const mmd = ['---', 'config:', '  themeVariables:', '    fontSize: 20px', '  flowchart:', '    wrappingWidth: 480', '---', 'flowchart BT',
  ...book.chapters.map((c, i) => `  ${id(i)}["${label(c, i)}"]`),
  ...deps.map((d) => `  ${d.replace('->', ' --> ')}`)].join('\n') + '\n';
const facts = JSON.stringify({ labels: book.chapters.map(label), edges: deps }, null, 2) + '\n';
const figDir = join(bookDir, 'figures');
mkdirSync(figDir, { recursive: true });
const pairs = [[join(figDir, 'book-map.mmd'), mmd], [join(figDir, 'book-map.facts.json'), facts]];
for (const [path, text] of pairs) {
  if (opt.write) { writeFileSync(path, text); ok(`wrote ${path.split('/').pop()}`); }
  else if (read(`figures/${path.split('/').pop()}`) !== text) ng(`${path.split('/').pop()} does not match book.json`, 're-run with --write');
  else ok(`${path.split('/').pop()} matches book.json`);
}
if (!(read('README.md') ?? '').includes('figures/book-map.svg')) ng('README.md does not show figures/book-map.svg', 'put the chapter map on the index page');

// ---- 各章を verify-doc へ ----------------------------------------------------------
console.log('\n--- verify-doc (README.md + chapters) ---');
const pages = ['README.md', ...book.chapters.map((c) => c.file)].join(',');
const args = [verifyDoc, bookDir, '--pages', pages, ...(opt.write ? ['--write'] : []), ...(opt['skip-html'] ? ['--skip-html'] : [])];
const r = spawnSync('node', args, { stdio: 'inherit' });
if (r.status !== 0) failures++;

console.log(failures === 0 ? '\nbook verdict: VERIFIED' : `\nbook verdict: ${failures} FAILURE GROUP(S) (see ✗ above)`);
process.exit(failures === 0 ? 0 : 1);
