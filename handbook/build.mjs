#!/usr/bin/env node
// Builds a Handbook's index.html from its Markdown pages. This script belongs to
// the handbook skill and is copied with it; the Handbook it builds belongs to the
// project. Everything project-specific comes from the Handbook's config.json.
// Node built-ins only. Run: node .claude/skills/handbook/build.mjs [handbook-dir]
//
// Every page's Markdown is inlined in a <script type="text/markdown"> element,
// so the page opens from file:// and fetches nothing. The browser renders it
// with marked (18.0.13, see vendor/README), inlined from the skill. Mermaid loads
// from a CDN and, when it fails to load, a diagram shows its source instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? 'handbook');
const rel = path.relative(process.cwd(), root) || '.';

function fail(file, message) {
  console.error(`${rel}/${file}: ${message}`);
  process.exit(1);
}

// --------------------------------------------------------------- config

// config.json is the project's contract with the skill. The build reads the
// title, the languages, the parts and nothing else; the skill reads the rest.
if (!fs.existsSync(path.join(root, 'config.json'))) {
  console.error(`${rel}/config.json: not found. Run /handbook init to start a Handbook here.`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));

// Interface strings, one entry per language the build knows. A configured
// language with no entry here is an error: add it before the project uses it.
const UI = {
  en: { contents: 'Contents', built: 'Built', updated: 'updated', verified: 'verified at',
        onThisPage: 'On this page', wide: 'Full width',
        missing: 'This page is not in English yet. The <source> version is shown.' },
  es: { contents: 'Contenido', built: 'Generado', updated: 'actualizado', verified: 'verificado en',
        onThisPage: 'En esta página', wide: 'Ancho completo',
        missing: 'Esta página aún no está en español. Se muestra la versión en <source>.' },
};
const LANGUAGE_NAMES = { en: { en: 'English', es: 'inglés' }, es: { en: 'Spanish', es: 'español' } };

if (typeof config.title !== 'string' || !config.title) fail('config.json', 'missing field "title"');
if (!Array.isArray(config.languages) || config.languages.length === 0) fail('config.json', 'missing field "languages"');
if (!Array.isArray(config.parts) || config.parts.length === 0) fail('config.json', 'missing field "parts"');

const LANGS = config.languages;
const SOURCE = LANGS[0]; // every page is written in this language first
for (const lang of LANGS) {
  if (!UI[lang]) fail('config.json', `language "${lang}" has no interface strings in the skill's build.mjs`);
}
const PARTS = config.parts.map((part) => {
  if (!part.id) fail('config.json', 'a part is missing its "id"');
  for (const lang of LANGS) {
    if (!part.label || !part.label[lang]) fail('config.json', `part "${part.id}" has no label for "${lang}"`);
  }
  return part.id;
});

// What the browser script reads: the part labels and the interface strings, by
// language. The source language never shows the fallback notice.
const STRINGS = Object.fromEntries(
  LANGS.map((lang) => [
    lang,
    {
      ...UI[lang],
      missing: lang === SOURCE ? '' : UI[lang].missing.replace('<source>', (LANGUAGE_NAMES[SOURCE] || {})[lang] || SOURCE),
      ...Object.fromEntries(config.parts.map((part) => [part.id, part.label[lang]])),
    },
  ]),
);

// ---------------------------------------------------------------- pages

/** Parses the `---` block at the top of a page. Supports `key: value` and block lists. */
function parseFrontmatter(text, file) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) fail(file, 'missing frontmatter (a --- block at the top of the file)');
  const meta = {};
  let listKey = null;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && listKey) {
      meta[listKey].push(item[1].trim());
      continue;
    }
    const pair = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!pair) fail(file, `malformed frontmatter line "${line}"`);
    const [, key, value] = pair;
    if (value === '') {
      meta[key] = [];
      listKey = key;
    } else {
      meta[key] = value.replace(/^["']|["']$/g, '');
      listKey = null;
    }
  }
  return { meta, body: match[2] };
}

function validate(meta, file) {
  const need = (key, ok, expected) => {
    if (meta[key] === undefined) fail(file, `missing field "${key}"`);
    if (!ok(meta[key])) fail(file, `malformed field "${key}" (expected ${expected})`);
  };
  need('title', (v) => typeof v === 'string' && v.length > 0, 'a non-empty string');
  need('part', (v) => PARTS.includes(v), PARTS.map((p) => `"${p}"`).join(' or '));
  need('order', (v) => /^\d+$/.test(v), 'an integer');
  need('verified', (v) => /^[0-9a-f]{7,40}$/.test(v), 'a commit SHA');
  need('updated', (v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'a date, YYYY-MM-DD');
  if (meta.part === 'technical' || meta.sources !== undefined) {
    need('sources', (v) => Array.isArray(v) && v.length > 0 && v.every((s) => s.length > 0), 'a non-empty list of globs');
  }
  return { ...meta, order: Number(meta.order), sources: meta.sources ?? [] };
}

function readPages(lang) {
  const dir = path.join(root, 'pages', lang);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = `pages/${lang}/${name}`;
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, name), 'utf8'), file);
      return { ...validate(meta, file), lang, slug: name.slice(0, -3), body, file };
    });
}

const pages = LANGS.flatMap(readPages);
const english = pages
  .filter((p) => p.lang === 'en')
  .sort((a, b) => PARTS.indexOf(a.part) - PARTS.indexOf(b.part) || a.order - b.order);
if (english.length === 0) fail('pages/en', 'no pages found');
for (const page of pages) {
  if (!english.some((en) => en.slug === page.slug)) {
    fail(page.file, `no English page with the slug "${page.slug}"`);
  }
}

// ----------------------------------------------------------------- html

const builtAt = new Date().toISOString();

// marked is inlined, so index.html is a single file the developer can open or send.
// A literal "</script" would end the element early; "<\/script" is the same string to JS.
const marked = fs
  .readFileSync(path.join(skillDir, 'vendor', 'marked.min.js'), 'utf8')
  .replace(/<\/script/gi, '<\\/script');

// Escapes text for HTML. The browser script below has the same one-liner.
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A part with no pages is left out, so a config can hold parts before they fill.
const nav = config.parts
  .filter((part) => english.some((p) => p.part === part.id))
  .map(
    (part) => `
      <section class="part">
        <h2 data-i18n="${part.id}">${esc(part.label[SOURCE])}</h2>
        <ul>${english
          .filter((p) => p.part === part.id)
          .map((p) => `
          <li><a href="#en/${p.slug}" data-slug="${p.slug}">${esc(p.title)}</a></li>`)
          .join('')}
        </ul>
      </section>`,
  )
  .join('');

// The language switch is pointless with one language, so it is left out.
const langSwitch =
  LANGS.length < 2
    ? ''
    : `<div class="lang" role="group" aria-label="Language">
    ${LANGS.map(
      (lang, i) =>
        `<button type="button" data-lang="${lang}" aria-pressed="${i === 0}">${esc(lang.toUpperCase())}</button>`,
    ).join('\n    ')}
  </div>`;

const markdownBlocks = pages
  .map(
    (p) =>
      `<script type="text/markdown" data-lang="${p.lang}" data-slug="${p.slug}" data-title="${esc(p.title)}" data-part="${p.part}" data-verified="${p.verified}" data-updated="${p.updated}">\n` +
      // "</" would end the script element; the page reverses this escape before parsing.
      p.body.replace(/<\//g, '<\\/') +
      '\n</script>',
  )
  .join('\n');

const html = `<!doctype html>
<html lang="${SOURCE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="build-time" content="${builtAt}">
<title>${esc(config.title)}</title>
<style>
  :root {
    --bg: #fbfbf9; --panel: #f3f3ef; --ink: #1c1c1a; --muted: #6b6b66;
    --rule: #e2e2dc; --accent: #1f5fbf; --code-bg: #efefea; --notice: #fff4d6;
    --sidebar: 15.5rem; --toc: 14rem; --measure: 46rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #141414; --panel: #1a1a19; --ink: #e6e6e2; --muted: #9a9a94;
      --rule: #2a2a28; --accent: #86b0f2; --code-bg: #1f1f1e; --notice: #3a3210;
    }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  a { color: var(--accent); }
  code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  code { background: var(--code-bg); padding: .1em .35em; border-radius: 3px; font-size: .9em; }
  pre { background: var(--code-bg); padding: .8rem 1rem; border-radius: 4px; overflow-x: auto; }
  pre code { background: none; padding: 0; font-size: .875em; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* top bar: title, language switch, contents toggle on phones */
  .bar {
    display: flex; align-items: center; gap: 1rem; padding: .6rem 1rem;
    border-bottom: 1px solid var(--rule); background: var(--panel);
    position: sticky; top: 0; z-index: 2;
  }
  .bar .brand { font-weight: 600; letter-spacing: -.01em; margin-right: auto; text-decoration: none; color: inherit; }
  .lang { display: inline-flex; border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; }
  .lang button {
    appearance: none; border: 0; background: transparent; color: var(--muted);
    font: inherit; font-size: .8rem; letter-spacing: .06em; padding: .2rem .6rem; cursor: pointer;
  }
  .lang button[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
  .toggle, .wide { appearance: none; border: 1px solid var(--rule); border-radius: 4px; background: transparent; color: inherit; font: inherit; font-size: .85rem; padding: .2rem .6rem; cursor: pointer; }
  .toggle { display: none; }
  .wide[aria-pressed="true"] { background: var(--ink); color: var(--bg); }

  /* sidebar left, content centred on a reading measure, section list right */
  .frame { display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr) var(--toc); min-height: calc(100vh - 3rem); }
  body.wide .frame { grid-template-columns: var(--sidebar) minmax(0, 1fr); }
  body.wide aside { display: none; }
  nav {
    border-right: 1px solid var(--rule); background: var(--panel); padding: 1.25rem 1rem;
    position: sticky; top: 3rem; height: calc(100vh - 3rem); overflow-y: auto;
  }
  nav .part + .part { margin-top: 1.5rem; }
  nav h2 { font-size: .72rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 0 0 .4rem .5rem; }
  nav ul { list-style: none; margin: 0; padding: 0; }
  nav a { display: block; padding: .3rem .5rem; border-radius: 4px; color: inherit; text-decoration: none; font-size: .92rem; }
  nav a:hover { background: var(--code-bg); }
  nav a[aria-current="page"] { background: var(--ink); color: var(--bg); }

  main { padding: 2.5rem 2rem 4rem; width: 100%; max-width: calc(var(--measure) + 4rem); margin: 0 auto; }
  body.wide main { max-width: none; margin: 0; }

  aside {
    padding: 2.5rem 1.25rem 2rem 0; position: sticky; top: 3rem; height: calc(100vh - 3rem); overflow-y: auto;
    font-size: .85rem;
  }
  aside h2 { font-size: .72rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 0 0 .6rem; }
  aside ul { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--rule); }
  aside li a { display: block; padding: .25rem .75rem; margin-left: -2px; border-left: 2px solid transparent; color: var(--muted); text-decoration: none; line-height: 1.35; }
  aside li a:hover { color: var(--ink); }
  aside li a[aria-current="true"] { color: var(--ink); border-left-color: var(--ink); }
  aside:empty, aside.empty { visibility: hidden; }
  .stamp { display: flex; flex-wrap: wrap; gap: .5rem 1rem; font-size: .75rem; letter-spacing: .04em; color: var(--muted); margin: 0 0 .5rem; }
  .stamp .part-name { text-transform: uppercase; letter-spacing: .1em; }
  main h1 { font-size: 2rem; line-height: 1.15; letter-spacing: -.02em; margin: 0 0 1.5rem; }
  .notice { background: var(--notice); border-radius: 4px; padding: .6rem .9rem; margin: 0 0 1.5rem; font-size: .9rem; }
  .notice:empty { display: none; }
  article h2 { font-size: 1.3rem; margin: 2.2rem 0 .6rem; letter-spacing: -.01em; scroll-margin-top: 4.5rem; }
  article h3 { font-size: 1.05rem; margin: 1.6rem 0 .4rem; }
  article p, article ul, article ol { margin: 0 0 1rem; }
  article img, article svg { max-width: 100%; }
  article table { border-collapse: collapse; margin: 0 0 1rem; }
  article th, article td { border: 1px solid var(--rule); padding: .3rem .6rem; text-align: left; }
  .diagram { margin: 0 0 1rem; }
  .diagram pre.mermaid[data-processed] { background: none; padding: 0; overflow: visible; }
  footer { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--rule); font-size: .75rem; color: var(--muted); }

  @media (max-width: 64rem) {
    .frame, body.wide .frame { grid-template-columns: var(--sidebar) minmax(0, 1fr); }
    aside, .wide { display: none; }
  }
  @media (max-width: 47rem) {
    .frame, body.wide .frame { grid-template-columns: 1fr; }
    .toggle { display: inline-block; }
    nav { display: none; position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--rule); }
    body.nav-open nav { display: block; }
    main { padding: 1.5rem 1rem 3rem; }
    main h1 { font-size: 1.6rem; }
  }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>
</head>
<body>
<header class="bar">
  <a class="brand" href="#">${esc(config.title)}</a>
  ${langSwitch}
  <button type="button" class="wide" aria-pressed="false" data-i18n="wide">Full width</button>
  <button type="button" class="toggle" aria-expanded="false" data-i18n="contents">Contents</button>
</header>
<div class="frame">
  <nav aria-label="Pages">${nav}
  </nav>
  <main>
    <p class="stamp"><span class="part-name"></span><span class="updated"></span><span class="mono verified"></span></p>
    <h1></h1>
    <p class="notice" role="status"></p>
    <article></article>
    <footer><span data-i18n="built">Built</span> <time datetime="${builtAt}">${builtAt.slice(0, 16).replace('T', ' ')} UTC</time></footer>
  </main>
  <aside aria-label="Sections">
    <h2 data-i18n="onThisPage">On this page</h2>
    <ul></ul>
  </aside>
</div>

${markdownBlocks}

<script>${marked}</script>
<script>
(function () {
  var CODE_BASE_URL = ${JSON.stringify(config.codeBaseUrl || '')};
  var TITLE = ${JSON.stringify(config.title)};
  var LANGS = ${JSON.stringify(LANGS)};
  var STRINGS = ${JSON.stringify(STRINGS)};
  // #<lang>/<slug>, and #<lang>/<slug>/<section> to land on a heading.
  var ROUTE_RE = new RegExp('^#(' + LANGS.join('|') + ')\\\\/([\\\\w-]+)(?:\\\\/([\\\\w-]+))?$');
  var PAGE_LINK_RE = new RegExp('^#(' + LANGS.join('|') + ')\\\\/([\\\\w-]+(?:\\\\/[\\\\w-]+)?)$');
  var rendered = null; // { lang, slug } of the page in the article
  var blocks = Array.prototype.slice.call(document.querySelectorAll('script[type="text/markdown"]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('nav a[data-slug]'));
  var firstSlug = links[0].dataset.slug;

  function find(lang, slug) {
    return blocks.filter(function (block) { return block.dataset.lang === lang && block.dataset.slug === slug; })[0];
  }
  function storedLang() {
    try { return localStorage.getItem('handbook.lang'); } catch (e) { return null; }
  }
  function storeLang(lang) {
    try { localStorage.setItem('handbook.lang', lang); } catch (e) {}
  }
  function route() {
    var match = location.hash.match(ROUTE_RE);
    if (match) return { lang: match[1], slug: match[2], section: match[3] || '' };
    var stored = storedLang();
    return { lang: STRINGS[stored] ? stored : LANGS[0], slug: firstSlug, section: '' };
  }
  // A heading's id: its text, lowercased, accents dropped, anything else a dash.
  function slugify(text) {
    return text.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // A link whose target is a repo-relative path becomes a code link, or plain code with no base URL.
  // A link to another page, written as #<lang>/<slug> or #<lang>/<slug>/<section>, keeps the reader in the language being rendered.
  // A link to a section of the same page, written as #<section>, gets the page's route in front.
  var renderer = {
    link: function (token) {
      var href = token.href, text = this.parser.parseInline(token.tokens);
      var pageLink = href.match(PAGE_LINK_RE);
      if (pageLink) return '<a href="#' + route().lang + '/' + pageLink[2] + '">' + text + '</a>';
      var sectionLink = href.match(/^#([\\w-]+)$/);
      if (sectionLink) return '<a href="#' + route().lang + '/' + route().slug + '/' + sectionLink[1] + '">' + text + '</a>';
      var isRepoPath = !/^([a-z][a-z0-9+.-]*:|#|\\/)/i.test(href);
      if (!isRepoPath) return false;
      if (!CODE_BASE_URL) {
        var code = '<code>' + esc(href) + '</code>';
        return text === esc(href) ? code : text + ' (' + code + ')';
      }
      var base = CODE_BASE_URL.replace(/\\/?$/, '/');
      return '<a class="code-link" href="' + esc(base + href) + '">' + text + '</a>';
    },
    code: function (token) {
      if (token.lang !== 'mermaid') return false;
      return '<div class="diagram"><pre class="mermaid">' + esc(token.text) + '</pre></div>';
    }
  };
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  marked.use({ renderer: renderer });

  function render() {
    var current = route();
    if (rendered && rendered.lang === current.lang && rendered.slug === current.slug) { goToSection(current.section); return; }
    var block = find(current.lang, current.slug) || find(LANGS[0], current.slug);
    if (!block) { location.replace('#' + current.lang + '/' + firstSlug); return; }
    var strings = STRINGS[current.lang];
    var fallback = block.dataset.lang !== current.lang;

    document.documentElement.lang = block.dataset.lang;
    document.title = block.dataset.title + ' · ' + TITLE;
    document.querySelector('.part-name').textContent = strings[block.dataset.part];
    document.querySelector('.updated').textContent = strings.updated + ' ' + block.dataset.updated;
    document.querySelector('.verified').textContent = strings.verified + ' ' + block.dataset.verified;
    document.querySelector('main h1').textContent = block.dataset.title;
    document.querySelector('.notice').textContent = fallback ? strings.missing : '';
    document.querySelector('article').innerHTML = marked.parse(block.textContent.replace(/<\\\\\\//g, '</'));

    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = strings[el.dataset.i18n]; });
    document.querySelectorAll('.lang button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === current.lang));
    });
    links.forEach(function (a) {
      a.href = '#' + current.lang + '/' + a.dataset.slug;
      var own = find(current.lang, a.dataset.slug);
      a.textContent = (own || find(LANGS[0], a.dataset.slug)).dataset.title;
      if (a.dataset.slug === current.slug) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.body.classList.remove('nav-open');
    document.querySelector('.toggle').setAttribute('aria-expanded', 'false');
    buildSections(current);
    rendered = { lang: current.lang, slug: current.slug };
    if (window.mermaid) drawDiagrams();
    if (!location.hash) location.replace('#' + current.lang + '/' + current.slug);
    else goToSection(current.section);
  }

  // The section list on the right: one entry per h2, the one in view marked as current.
  var headings = [];
  function buildSections(current) {
    var list = document.querySelector('aside ul');
    list.innerHTML = '';
    headings = Array.prototype.slice.call(document.querySelectorAll('article h2'));
    headings.forEach(function (h2) {
      h2.id = slugify(h2.textContent);
      var a = document.createElement('a');
      a.href = '#' + current.lang + '/' + current.slug + '/' + h2.id;
      a.textContent = h2.textContent;
      var li = document.createElement('li');
      li.appendChild(a);
      list.appendChild(li);
    });
    document.querySelector('aside').classList.toggle('empty', headings.length === 0);
    markCurrentSection();
  }
  function goToSection(id) {
    var target = id && document.getElementById(id);
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
    markCurrentSection();
  }
  function markCurrentSection() {
    var line = 96; // px below the top bar
    var currentId = '';
    headings.forEach(function (h2) { if (h2.getBoundingClientRect().top <= line) currentId = h2.id; });
    document.querySelectorAll('aside a').forEach(function (a) {
      if (a.getAttribute('href').split('/').pop() === currentId) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { markCurrentSection(); ticking = false; });
  });

  // Full width: the article drops its reading measure and the section list hides. Remembered per browser.
  var wideButton = document.querySelector('.wide');
  function setWide(on) {
    document.body.classList.toggle('wide', on);
    wideButton.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('handbook.wide', on ? '1' : ''); } catch (e) {}
  }
  wideButton.addEventListener('click', function () { setWide(!document.body.classList.contains('wide')); });
  try { if (localStorage.getItem('handbook.wide')) setWide(true); } catch (e) {}

  function drawDiagrams() {
    var nodes = document.querySelectorAll('pre.mermaid:not([data-processed])');
    if (nodes.length) window.mermaid.run({ nodes: nodes, suppressErrors: true });
  }

  document.querySelectorAll('.lang button').forEach(function (button) {
    button.addEventListener('click', function () {
      storeLang(button.dataset.lang);
      location.hash = '#' + button.dataset.lang + '/' + route().slug;
    });
  });
  document.querySelector('.toggle').addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    this.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', render);
  document.addEventListener('mermaid-ready', drawDiagrams);
  render();
})();
</script>
<script type="module">
  import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')
    .then(function (m) {
      window.mermaid = m.default;
      var dark = matchMedia('(prefers-color-scheme: dark)').matches;
      window.mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral' });
      document.dispatchEvent(new Event('mermaid-ready'));
    })
    .catch(function () { /* offline: diagrams stay as their source */ });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), html);
const translated = pages.length - english.length;
console.log(`${rel}/index.html: ${english.length} pages${translated ? `, ${translated} translated` : ''}, built ${builtAt}`);
