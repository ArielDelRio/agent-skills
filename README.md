# agent-skills

Agent skills I maintain and reuse across projects. Each directory here is one skill: a `SKILL.md` with its instructions, plus whatever files it needs to do its job.

## Install

With the [skills CLI](https://skills.sh):

```sh
npx skills add ArielDelRio/agent-skills -s handbook
```

That installs into the current project. Add `-g` for a user-level install, and `-l` to list what the repo has without installing anything.

## Skills

### handbook

Builds and maintains a project's Handbook: browsable documentation, read by opening one `handbook/index.html` in a browser, written for a developer rather than for a coding assistant.

The skill is project-agnostic; the Handbook it produces belongs to the project and is committed with it. On first run, `/handbook init` reads the repo, interviews you about what the docs should cover, proposes a page set and writes `handbook/config.json` — the contract everything else reads. From then on, `add` and `edit` document new work, `check` reports where the docs have drifted from the code, `sync` brings the whole thing back in line, and `translate` writes the other languages.

Pages are Markdown with frontmatter that records the commit each page was last verified against, so drift is measurable rather than a feeling. The build is Node with no dependencies and inlines its Markdown renderer, so the output is a single file that opens offline.

Needs Node and git.

## Adding a skill

One directory per skill at the root, named after it. The `name` in the frontmatter matches the directory. Keep skills self-contained: anything a skill needs travels inside its directory, so copying the directory is enough to move it.
