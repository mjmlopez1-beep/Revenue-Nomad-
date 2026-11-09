# Claude Code configuration

Project-level skills, agents and plugin settings for Claude Code. Everything here
is vendored from open-source repositories so it works offline and can be edited
in place. Each skill lives in `skills/<name>/SKILL.md` and is invoked with
`/<name>` (or picked up automatically by its description).

## Installed sources

| Source | Installed as | Upstream commit | License |
| --- | --- | --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 39 skills in `skills/` (engineering, productivity, misc, in-progress) | `4ae2317` (2026-10-31) | MIT |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 25 skills in `skills/`, 4 subagents in `agents/` | `301b02b` (2026-11-01) | MIT |
| [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) | `skills/security-audit/` | `c1c8a8c` (2026-09-14) | MIT |
| [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) | 6 skills in `skills/` | `3ccff53` (2026-09-15) | MIT |
| [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) | Plugin `egm@egm` via `settings.json` | marketplace (auto-updates) | Apache-2.0 |

License texts are in `licenses/`.

## Why EGM is a plugin, not copied files

The Elephant-Goldfish Model skills read their reviewer personas and document
standards through `${CLAUDE_PLUGIN_ROOT}`, and its Claude subagents are
registered by the plugin manifest with `omitClaudeMd: true` for fresh-context
"goldfish" reviews. Copying only the `SKILL.md` files would break those paths,
so `settings.json` registers the `egm` marketplace and enables the plugin.
Claude Code will offer to install it the first time this project is opened.
Invoke with `/egm:egm-brainstorm`, `/egm:egm-draft`, `/egm:egm-review`.

## Notes

- Matt Pocock's `setup-matt-pocock-skills` is a one-time setup for his
  engineering skills (issue tracker, triage labels, domain docs). Run `/setup-matt-pocock-skills` once.
- Skills marked `disable-model-invocation: true` only run when you call them
  by name; they will not trigger automatically.
- `skills/code-review/` (Matt Pocock) shares its name with Claude Code's
  built-in `/code-review` skill. Rename the folder and its `name:` field if you
  want both available unambiguously.
- Cloudflare's `security-audit` skill: start Claude Code in this repo and ask
  "security audit this codebase".

## Updating

Re-clone the upstream repo and copy the skill folders over the existing ones,
then update the commit column above. The EGM plugin updates itself.
