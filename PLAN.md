# mini-agent — Build Plan

A Node.js CLI coding agent implementing the open [Agent Skills specification](https://agentskills.io/specification).

**References:** [standup-cli](https://github.com/muhtalhakhan/standup-cli) · [bytepet-cli](https://github.com/muhtalhakhan/bytepet-cli) · [0to1-builders-template](https://github.com/muhtalhakhan/0to1-builders-template)

---

## Phase 1 — Project Scaffold

**Goal:** Establish the project skeleton before writing any logic.

- Created `package.json` with `"type": "module"`, `bin` entry pointing to `dist/index.js`, and all runtime dependencies (`@anthropic-ai/sdk`, `openai`, `@inquirer/prompts`, `boxen`, `chalk`, `gray-matter`)
- Added `.gitignore` covering `node_modules/`, `dist/`, `.mini-agent.json` (stores API key), `.env`, OS and editor artifacts
- Created the `.skills/` directory with three subdirectories, each containing a `SKILL.md` with YAML frontmatter

---

## Phase 2 — Skill Files

**Goal:** Author the three required skills following the Agent Skills spec frontmatter format (`name`, `description`, body).

### `.skills/welcome-me/SKILL.md`
Triggers on onboarding phrases ("new to this project", "getting started", "help me onboard"). Body instructs the model to open with the exact line:
```
> Welcome to mini-agent!
```

### `.skills/changelog-generator/SKILL.md`
Triggers on changelog/release note requests. Body instructs the model to categorise changes (Added / Changed / Fixed / Removed) and format output as Keep a Changelog.

### `.skills/documentation/SKILL.md`
Triggers on documentation requests. Body instructs the model to identify doc type (JSDoc, README, API reference) and include a usage example.

> **Key principle enforced in all three files:** the model follows the skill body — the harness never hardcodes response content. The welcome header, changelog structure, and JSDoc format all come from the SKILL.md body, not from JavaScript.

---

## Phase 3 — Initial Single-File Implementation (`index.js`)

**Goal:** Get a working CLI running as fast as possible, then refactor.

Built the entire agent in a single ES module `index.js`:

- **Provider metadata** — defined `PROVIDER_META` with four providers, each carrying `label`, `envKey`, `color`, `apiFamily`, `skillsSupported`, and either `staticModels` or a live `fetchModels` function
- **Config loading** — priority order: `.mini-agent.json` on disk → env var detection → `null` (triggers wizard)
- **Setup wizard** — `@inquirer/prompts` `select` / `password` / `confirm` flow; detects existing env keys and offers to reuse them; fetches live model list with a fallback to manual text input; saves to `.mini-agent.json`
- **Three-tier progressive disclosure**
  - Tier 1 (startup): `discoverSkills()` reads all `SKILL.md` files with `gray-matter`, parses frontmatter, builds `<available_skills>` XML containing only `name` + `description` — injected into the system prompt
  - Tier 2 (on demand): the `activate_skill` tool is registered with `skill_name` constrained to an enum of discovered names; when the model calls it, the full body is returned wrapped in `<skill_content>` tags
  - Tier 3 (execution): model follows skill instructions to produce its response
- **Anthropic streaming loop** — event-by-event SSE parsing, `input_json_delta` accumulation before `JSON.parse`, session dedup via `activatedSkills` Set
- **Slash commands** — `/skills`, `/config`, `/switch`, `/clear`, `/help`, `exit`
- **Banner** — `boxen` + `chalk` showing provider, model, skill names, and available commands
- **Single-shot mode** — `process.argv.slice(2)` check; if non-empty, run once and exit

---

## Phase 4 — TypeScript Migration + Build Pipeline

**Goal:** Adopt the same TypeScript + compiled output pattern used in [standup-cli](https://github.com/muhtalhakhan/standup-cli) and [bytepet-cli](https://github.com/muhtalhakhan/bytepet-cli).

- Renamed `index.js` → `src/index.ts`; added full TypeScript types (`AgentConfig`, `ProviderMeta`, `Skill`, `AnthropicTool`, `OAITool`, `ContentBlock`, etc.)
- Added `tsconfig.json` — `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: ./dist`, `strict: true`
- Updated `package.json`:
  - `"main"` and `"bin"` both point to `dist/index.js`
  - `build`: `tsc && chmod +x dist/index.js`
  - `dev`: `tsx src/index.ts` (no build step during development)
  - `start`: `node scripts/run.mjs`
- Added `scripts/run.mjs` — auto-installs deps and auto-builds `dist/` on first run, then spawns `dist/index.js`; detects pnpm vs npm from lockfile
- Deleted old `index.js`; shebang `#!/usr/bin/env node` is preserved by `tsc` in `dist/index.js`

---

## Phase 5 — Provider Overhaul

**Goal:** Remove providers that don't support tool calling; add providers that do; fix model filtering.

### Removed
| Provider | Reason |
|---|---|
| Google Gemini | SDK doesn't support Anthropic tool format; no `activate_skill` support |
| GLM / Zhipu AI | OpenAI-compat SSE but no tool calling support in that path |

### Added
| Provider | API family | Model source |
|---|---|---|
| Groq | OpenAI-compat | Live fetch from `api.groq.com/openai/v1/models` |
| OpenRouter | OpenAI-compat | Live fetch from `openrouter.ai/api/v1/models` |

### Model filtering rules established
- **Groq**: exclude `whisper` (speech-to-text) and `guard` (safety classifier) — capability filter, not a name filter
- **OpenRouter**: keep only models where `architecture.modality` includes `text` and `->text` (chat-capable); show all that pass, no arbitrary cap
- **CommandCode**: no filter — trust the platform's own `/models` endpoint entirely

### Added `openai` npm package
Used for Groq and OpenRouter clients (`new OpenAI({ baseURL: ... })`). Removed `@google/generative-ai`.

### OpenAI streaming loop
Added `runOpenAILoop` to handle `tool_calls` deltas with index-based accumulation, then dispatch `activate_skill` the same way as the Anthropic loop.

---

## Phase 6 — CommandCode Dynamic Routing

**Goal:** Implement correct routing based on the [CommandCode Provider API docs](https://commandcode.ai/docs/provider-api).

**Key finding from docs:**
- `/provider/v1/chat/completions` → OpenAI format → OpenAI and OSS models **only**
- `/provider/v1/messages` → Anthropic format → Claude models **only**
- Sending a Claude model to `/chat/completions` returns `400`; sending a non-Claude model to `/messages` also returns `400`
- Anthropic SDK appends `/v1/messages` automatically, so its `baseURL` must be `https://api.commandcode.ai/provider` (without `/v1`)

**Implementation:**
- Set `commandcode.apiFamily = "dynamic"` in `PROVIDER_META`
- Added `resolveApiFamily(cfg)` helper: for non-dynamic providers returns the static value; for CommandCode checks if `cfg.model` starts with `claude` or `anthropic/` → returns `"anthropic"`, otherwise `"openai"`
- Updated `makeClient(cfg)`:
  - Calls `resolveApiFamily` first
  - `"anthropic"` path: `new Anthropic({ apiKey, baseURL: "https://api.commandcode.ai/provider" })`
  - `"openai"` path: `new OpenAI({ apiKey, baseURL: "https://api.commandcode.ai/provider/v1" })`
- Updated `runLoop()` in `main()` to use `resolveApiFamily(cfg)` instead of `meta.apiFamily`
- On `/switch`: conversation history is cleared (Anthropic and OpenAI message formats are incompatible; a provider or model change resets the session)

---

## Phase 7 — Modular Refactor

**Goal:** Split the 800-line `src/index.ts` into focused modules. Inspired by the structure used in [0to1-builders-template](https://github.com/muhtalhakhan/0to1-builders-template).

### Final module layout

```
src/
├── index.ts              ← entry point: REPL + single-shot mode only
├── agent/
│   └── loop.ts           ← runAnthropicLoop, runOpenAILoop, LoopContext
├── cli/
│   └── commands.ts       ← printBanner, handleSlashCommand
├── config/
│   ├── manager.ts        ← AgentConfig, loadConfig, saveConfig, runWizard, getModels
│   └── providers.ts      ← PROVIDER_META, resolveApiFamily, makeClient, providerColor
├── prompt/
│   └── builder.ts        ← buildSkillCatalog, buildSystemPrompt
├── skills/
│   └── scanner.ts        ← discoverSkills, getSkillBody, getSkillsDir
└── tools/
    └── definitions.ts    ← buildAnthropicTools, buildOpenAITools
```

### Dependency graph (no circular deps)
```
index.ts
  ├── config/manager.ts   → config/providers.ts
  ├── config/providers.ts → (external: @anthropic-ai/sdk, openai, chalk)
  ├── skills/scanner.ts   → (external: fs, path, gray-matter)
  ├── prompt/builder.ts   → skills/scanner.ts (types only)
  ├── tools/definitions.ts → (no internal deps)
  ├── agent/loop.ts       → skills/scanner.ts, tools/definitions.ts, config/manager.ts
  └── cli/commands.ts     → config/providers.ts, config/manager.ts, skills/scanner.ts
```

### Notes
- All local imports use `.js` extensions (required by `NodeNext` module resolution)
- `PROJECT_ROOT` is computed from `__dirname` in each file that needs it (`dist/config/manager.js` → `dist/config/` → `dist/` → project root)
- No `src/ui/` directory — chalk + boxen output stays in `cli/commands.ts`

---

## Phase 8 — Tests

**Goal:** Cover every pure module with unit tests using vitest.

Added `vitest` to `devDependencies`. Added `test` and `test:watch` scripts to `package.json`. Added `vitest.config.ts`.

### Test files

| File | Tests | Covers |
|---|---|---|
| `__tests__/builder.test.ts` | 10 | `buildSkillCatalog` XML structure, body exclusion (Tier 1 only), `buildSystemPrompt` embeds catalog and `activate_skill` instruction |
| `__tests__/scanner.test.ts` | 11 | `discoverSkills` — valid parse, missing desc, missing name, no SKILL.md, multiple skills, duplicate dedup, body stored; `getSkillBody` — known + unknown |
| `__tests__/tools.test.ts` | 11 | `buildAnthropicTools` + `buildOpenAITools` — empty list, single tool, enum constrained to exact names, required field, both tools agree on same enums |
| `__tests__/providers.test.ts` | 13 | `PROVIDER_META` structure, all providers support skills, `resolveApiFamily` for all providers, CommandCode dynamic routing (Claude → anthropic, GPT/OSS/DeepSeek/Kimi → openai) |

**Total: 45 tests, all passing.**

---

## Final Project Structure

```
mini-agent/
├── src/
│   ├── index.ts
│   ├── agent/loop.ts
│   ├── cli/commands.ts
│   ├── config/
│   │   ├── manager.ts
│   │   └── providers.ts
│   ├── prompt/builder.ts
│   ├── skills/scanner.ts
│   ├── tools/definitions.ts
│   └── __tests__/
│       ├── builder.test.ts
│       ├── scanner.test.ts
│       ├── tools.test.ts
│       └── providers.test.ts
├── .skills/
│   ├── welcome-me/SKILL.md
│   ├── changelog-generator/SKILL.md
│   └── documentation/SKILL.md
├── scripts/run.mjs
├── dist/                   ← compiled output (gitignored)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── PLAN.md
└── README.md
```

---

## Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript → dist/
npm start            # auto-build if needed, then run
npm run dev          # run via tsx (no build step)
npm test             # run all tests once
npm run test:watch   # re-run tests on save
npm link             # install mini-agent globally
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Model-driven skill activation | The LLM reads `<available_skills>` and calls `activate_skill` itself — no keyword matching in the harness |
| `activate_skill` enum constraint | `skill_name` is an enum of discovered names — prevents the model from hallucinating nonexistent skills |
| Session dedup | `activatedSkills` Set ensures each skill loads into context only once per conversation |
| `<skill_content>` wrapping | Returned body is wrapped in tags so the model distinguishes skill instructions from conversation |
| CommandCode dynamic routing | Claude models → `/messages` (Anthropic format); everything else → `/chat/completions` (OpenAI format); enforced by the platform API itself |
| Clear history on `/switch` | Anthropic and OpenAI message formats are incompatible; provider change resets conversation |
| `PROJECT_ROOT` from `__dirname` | `.skills/` and `.mini-agent.json` live next to the package, not wherever the user `cd`s |
