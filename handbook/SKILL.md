---
name: handbook
description: Starts, extends, edits, checks, syncs and translates a project's Handbook, the browsable documentation in handbook/. Invoked only by the developer.
disable-model-invocation: true
---

# Handbook

The Handbook is a project's official documentation: a product apart, read in a browser by opening `handbook/index.html`, written for a developer who reads, and never for the coding assistant.

This skill is portable and knows nothing about any one project. Everything project-specific — the title, the parts, the languages, the page set, where the source of truth lives, what counts as an area of code — is in `handbook/config.json`, which this skill writes on `init` and reads on every other mode. Read that file before anything else.

One rule: this skill is the only thing that reads or changes `handbook/`, and it changes nothing outside it. It never commits, and it never edits the project's own docs, however wrong they look.

The first word of `$ARGUMENTS` picks the mode; the rest is `<what>`. No argument: see [No argument](#no-argument).

## Layout

The skill, copied into any project:

```text
<skill>/
  SKILL.md               this file
  build.mjs              node <skill>/build.mjs [dir] -> <dir>/index.html
  vendor/marked.min.js   Markdown renderer, vendored and inlined into the build
```

The Handbook it produces, which belongs to the project and is committed with it:

```text
handbook/
  config.json            the contract: title, parts, languages, page set, source of truth, areas
  pages/<lang>/<slug>.md source pages, one directory per configured language
  index.html             generated, committed, what the developer opens
```

The Handbook always sits at `handbook/` in the repo root. Requires Node and git: the build is Node with no dependencies, and `verified` is a commit SHA.

## config.json

```json
{
  "title": "Acme Handbook",
  "codeBaseUrl": "",
  "languages": ["en", "es"],
  "parts": [{ "id": "product", "label": { "en": "Product", "es": "Producto" } }],
  "glossary": "CONTEXT.md",
  "sourcesOfTruth": ["README.md", "CONTEXT.md", "docs/"],
  "areas": ["src/*/modules/*", "packages/*"],
  "pages": [{ "slug": "what-is-acme", "part": "product", "order": 10, "content": "The product and who it is for." }]
}
```

- `title` heads the browser tab and the top bar. `codeBaseUrl` prefixes code links, empty until the repo has a remote.
- `languages`: the first is the source, the one every page is written in. The rest are translations. One language is fine, and the build then leaves out the language switch. The build carries interface strings for `en` and `es` only; another language needs an entry added to `UI` in `build.mjs`.
- `parts` groups the pages in the sidebar, in this order.
- `glossary` is the file whose vocabulary the pages use. `sourcesOfTruth` are the project's own docs, in descending authority, always below the code.
- `areas` are globs for the directories that each deserve a page. `check` reports the ones no page claims.
- `pages` is the page set: every page the Handbook has, with the part it belongs to, its order within that part (leave gaps: 10, 20, 30) and one line of what it holds. This is the contract `write` fills and `add`, `edit` and `sync` keep.

## Frontmatter

Every page starts with YAML frontmatter. All fields are required, except `sources` on pages of the first part.

```yaml
---
title: Agent package
part: technical            # an id from config.parts
order: 20                  # sorts within the part
verified: 8c959dd          # git rev-parse --short HEAD when the page was last checked against the code
updated: 2026-09-19        # the day the page's content last changed, YYYY-MM-DD
sources:                   # repo-relative globs the page describes; check expands them
  - packages/agent/**
---
```

The build exits 1 naming the file and the field when frontmatter is missing or malformed. Fix the page and build again.

`verified` says when the page was last compared with the code; `updated` says when its text last changed. `check` moves only `verified`. `write`, `add`, `edit` and `sync` set both on the pages they change, `updated` to today's date. `translate` copies both from the source page.

## Growth rule

A new area of code — a directory matching one of `config.areas` — gets a new page with the next free `order` in its part, added to `config.pages` in the same change. A feature inside an area goes into that area's page, into every flow page it changes, and into any page that tracks the project's progress.

## Writing rules

- Use the terms of `config.glossary` and no synonym it avoids.
- Each section says what the part is for, what it talks to and its invariants. Each section that describes code ends with `Start reading at [<file>](<repo-relative path>), <function>.` When the file has no function to name, such as an entry file, a config or a doc, name its export, key or section instead. A section that describes no code (limits, comparisons, glossary notes) ends without one. No code snippets.
- Describe only what the code does today. What is planned or designed appears once, on the page that tracks progress, as pending.
- The code is the source of truth, then `config.sourcesOfTruth` in their order, then the Handbook. Write what the code does; take the why and the standards from the project's docs. When they and the code disagree, the code wins: the page says what the code does, and the disagreement is recorded on the progress page, because this skill never edits the project's docs. Never carry a claim from an existing page forward without checking it against the code.
- A code reference is a Markdown link whose target is the repo-relative path: `[chat.ts](src/main/modules/agent/lib/chat.ts)`. The build prefixes the target with `codeBaseUrl`; with an empty `codeBaseUrl` it renders as plain code. The project's own docs are linked the same way as sources of detail, never copied: the Handbook is its own narrative.
- The `##` headings of a page are its sections: the browser lists them in "On this page" and gives each an id from its text, lowercased, accents dropped, other characters as dashes. A link to a section of the same page is `[text](#<id>)`; to a section of another page, `[text](#<lang>/<slug>/<id>)` with the source language. Renaming a heading breaks links to it, so search the pages for the old id before renaming.
- Mix prose with the other forms, as [Text and pictures](#text-and-pictures) says. A page that is a wall of paragraphs is not read.
- The source language is where a page is written. Other languages exist only as translations of it, written by `translate` or refreshed by `add`, `edit` and `sync`.

## Text and pictures

A page of nothing but paragraphs is hard to take in, and a page decorated with pictures that say nothing is worse. Every form below earns its place by doing something prose does badly, and is used only then.

| Form | Earns its place when | Not for |
| --- | --- | --- |
| Prose | The why, the caveat, the invariant, anything with a reason inside it. This is the default. | Comparing several things along the same axes. |
| A table | Several things share a set of attributes and the reader will compare them: one row per thing, one column per attribute. | Two facts, or a list that has no second column. |
| A list | The items are a set or a sequence, and their being many is the point. | Three sentences that belong in a paragraph. |
| A diagram | The shape of a mechanism carries the meaning: who talks to whom, what order things happen in, what state follows what. | What a numbered list already says clearly. |

Diagrams are fenced ` ```mermaid ` blocks. The reader can open one full screen from the control on it, and offline the browser shows the block's source in its place, so its labels have to read as plain text. Keep one diagram to one idea: two small diagrams beat one that shows everything.

The rules that keep this honest:

- A visual **replaces** text, never repeats it. If the paragraph beside a diagram walks through the same arrows, cut the paragraph or cut the diagram.
- If you cannot say what the reader takes from a visual that the prose did not already give them, it is decoration. Delete it.
- A page with no visual at all is fine when nothing on it has a shape worth drawing. A page with several is fine too, when it earns them. Neither a quota nor a cap.
- Put each one next to the text it serves, not in a gallery at the end.
- The Handbook is a single file that opens offline, so the forms above are all there is: no screenshots, no icons, no images.

## Build

```sh
node <skill>/build.mjs
```

Reads `handbook/config.json` and every page under `handbook/pages/` and rewrites `handbook/index.html`. Exit 0 with `index.html` written is the only success. It takes the Handbook's directory as an optional argument, defaulting to `handbook`.

## Closing every changing mode

`init`, `write`, `add`, `edit`, `sync`, `translate`, and `check` when it bumped a page, all end the same way:

1. Run the build until it exits 0.
2. List the files changed under `handbook/`, from `git status --short handbook/`.
3. Stop. The developer reviews and commits.

## Modes

### No argument

If `handbook/config.json` does not exist, say so and offer `init`. Otherwise print the six modes (`write`, `add`, `edit`, `check`, `sync`, `translate`) with their arguments and one line each, and how to open the Handbook. Change nothing.

### init

Start a Handbook in a project that has none. Refuse to run when `handbook/config.json` already exists: say so and point at `sync`.

It is an interview, but not a blank one. Look first, propose, and let the developer correct.

1. **Read the project.** Its README, its manifest (`package.json`, `pyproject.toml`, `go.mod`, whatever it has), its directory tree to two or three levels, any `CONTEXT.md`, `AGENTS.md`, `docs/`, `adr/` or equivalent, and enough of the entry points to know what the thing does.
2. **Ask what the code cannot say.** One question at a time, each with the answer already proposed from step 1 so the developer can confirm or correct:
   - What is this product, and who reads this Handbook?
   - How far does the Handbook reach: the whole repo, or one part of it?
   - What does it document about the product itself — what it is for, what it decides, where it stands — and what about the technical side?
   - Which parts, and in which order? Product and technical is the usual pair; propose it and let them change it.
   - Which languages, source first?
   - Is there a URL the code links to, for `codeBaseUrl`?
3. **Propose the page set**, derived from the answers and the tree: one page per product question worth its own page, one per area matching the globs you propose for `areas`, and a page for the project's standards and decisions when it has any. Give each a slug, a part, an order and its one line. Show it as a table and let the developer cut, add, rename and reorder. Do not write anything yet.
4. **Write `handbook/config.json`** from the agreed answers: `title`, `codeBaseUrl`, `languages`, `parts`, `glossary`, `sourcesOfTruth`, `areas` and `pages`.
5. Tell the developer the build command and suggest a script for it in their manifest, if it has one. Do not edit anything outside `handbook/`.
6. Run `write`.

### write

Fill the page set from the code. Overwrites every page in the source language; other languages are left alone and reported as needing `translate`.

1. Read `config.sourcesOfTruth`, then the code each page in `config.pages` describes.
2. Write every page of `config.pages` under `pages/<source>/`, following the writing rules, with `sources` listing every path the page describes, `verified` set to `git rev-parse --short HEAD` and `updated` to today.
3. Close.

### add `<what>`

Document something new that exists in the code.

1. Read the code of `<what>` and place it by the growth rule: a new page for a new area, otherwise the area's page.
2. Write the content. A new page is added to `config.pages` in the same change. Update every flow page `<what>` changes, and the progress page when something it tracks moved.
3. Add `sources` globs for the new code on every touched page and set `verified` to `git rev-parse --short HEAD` and `updated` to today on each.
4. Rewrite the translations of each touched page that has one, from its new source text.
5. Close.

### edit `<what>`

Change what is documented. Same steps as `add`, with step 1 finding the pages whose text says `<what>`.

### check

Report drift between the Handbook and the code. Read-only, except step 5.

1. For each source-language page with `sources`, run `git log --oneline <verified>..HEAD -- <each source glob, quoted>`. When it lists commits, run `git diff <verified>..HEAD -- <the same globs>` and judge every sentence of the page against it. A page with no `sources` is judged against `git diff <verified>..HEAD -- <config.sourcesOfTruth>`.
2. Unclaimed areas: every directory matching a glob in `config.areas` that no page's `sources` covers.
3. Stale build: read `<meta name="build-time">` from `index.html`; it is stale when any file under `pages/` changed later (`git log -1 --format=%cI -- <file>`, or the file's modification time when it has uncommitted changes).
4. Stale translations: for each page in a non-source language, compare its last change with the source page's (`git log -1 --format=%ct -- <file>`, or the file's modification time when it has uncommitted changes); older than its source is stale.
5. Set `verified` to `git rev-parse --short HEAD` on every page judged accurate in step 1. Edit nothing else: a stale page is reported, not fixed.
6. Print the report in the chat, in four lists: stale pages with the commits and what changed, unclaimed areas, stale build, stale translations. Empty lists are printed as empty.
7. If step 5 changed a page, close. Otherwise stop.

### sync

Bring the whole Handbook up to date with the code and the project's docs, in two halves: a proposal, then the change once the developer confirms it. Nothing changes before the confirmation.

1. Run `check` steps 1 to 4. For each page also run `git log --oneline <verified>..HEAD -- <config.sourcesOfTruth>`, so that changes in the project's docs count even when the page's `sources` did not change.
2. For every page with commits, read in source-of-truth order: the code diff first, then the docs diff, then the page as it is. Decide sentence by sentence what is now false, missing or superseded. Where the code and the docs disagree, the code wins, and the disagreement goes into the proposal for the progress page.
3. Print the proposal in the chat and stop. Per page: the commits behind the change, the sentences to change, add or remove, and the new `verified` and `updated`. Then: new pages for unclaimed areas by the growth rule, translations to refresh, and the pages with nothing to change. End by asking the developer to confirm, or to name the pages to skip.
4. Once the developer confirms, apply exactly the proposal, minus the pages they skipped: edit the pages, add any new page to `config.pages`, set `verified` to `git rev-parse --short HEAD` and `updated` to today on every changed page, rewrite the translations of each changed page that has one, and close. A page the developer skipped keeps its `verified`, so the next `sync` raises it again.

### translate `[<lang>] <slug|all>`

Write a page in one of the non-source languages, from its source version. `<lang>` may be left out when the project has exactly one.

1. `all` means every page under `pages/<source>/`; a slug means that page. A slug with no source page is an error: print it and stop.
2. Write `pages/<lang>/<slug>.md` from `pages/<source>/<slug>.md`: same frontmatter, `verified` and `updated` included, with `title` in the target language, body translated. Link targets, paths, identifiers and Mermaid blocks stay as in the source.
3. Close.
