# mini-agent

A Node.js command-line coding agent implementing the open [Agent Skills specification](https://agentskills.io/specification). It uses an LLM to respond to user prompts and loads specialized "skill" instruction files on demand based on what the user asks — using the model itself to decide which skill is relevant, not keyword matching in the harness.

---

## How it works

The agent uses **three-tier progressive disclosure** defined by the Agent Skills spec:

| Step | What happens |
|---|---|
| Startup (Tier 1) | Scan `.skills/`, load only `name + description` into `<available_skills>` in the system prompt |
| User message | LLM reads the catalog and the user prompt |
| Match + activate | If a description fits, LLM calls `activate_skill` (enum of valid names) |
| Load body (Tier 2) | CLI reads full `SKILL.md` from disk and returns it as tool result |
| Reply (Tier 3) | Model follows skill instructions to produce its response |

**Key design**: Skill matching is model-driven — the LLM reads the catalog and decides which skill (if any) to activate. The harness only provides the `activate_skill` tool with an enum-constrained `skill_name` parameter.

---

## Skills included

| Skill | Trigger phrases |
|---|---|
| `welcome-me` | "new to this project", "just joined", "getting started", "what should I do", "help me onboard" |
| `changelog-generator` | "generate changelog", "create release notes", "what changed", "draft changelog" |
| `documentation` | "document this", "write docs", "generate README", "add documentation", "explain this code" |

---

## Setup

```bash
pnpm install
```

Set at least one provider API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export COMMANDCODE_API_KEY=...
# or
export GROQ_API_KEY=...
# or
export OPENROUTER_API_KEY=...
```

On first run (or if no key is set), the setup wizard walks you through provider/model selection and saves to `.mini-agent.json`.

> **Security note**: `.mini-agent.json` stores your API key locally. It is listed in `.gitignore` and must never be committed.

---

## Run

**Auto-build + run (recommended):**
```bash
pnpm start
```

**Development (no build step):**
```bash
pnpm dev
```

**Single-shot mode:**
```bash
pnpm start -- "I'm new to this project, what should I do?"
```

**Global command (after `pnpm link --global`):**
```bash
mini-agent
mini-agent "generate a changelog for my project"
```

---

## Test

```bash
pnpm test          # run all tests once
pnpm test:watch    # re-run on save
```

---

## Test prompts

| # | Prompt | Expected |
|---|---|---|
| 1 | `I'm new to this project, what should I do?` | `welcome-me` activates; first line of response is `> Welcome to mini-agent!` |
| 2 | `What's the weather in London?` | No skill activates; normal response |
| 3 | `Can you help me create a changelog for my project?` | `changelog-generator` activates |
| 4 | `I need to write documentation for my API` | `documentation` activates |

---

## Slash commands

| Command | Description |
|---|---|
| `/skills` | List all available skills with descriptions |
| `/config` | Show current provider, model, and masked API key |
| `/switch` | Re-run the setup wizard to change provider or model |
| `/clear` | Clear the screen and reprint the banner |
| `/help` | Show all available commands |
| `exit` | Quit the agent |

**Keyboard shortcuts:** `Ctrl+C` to exit · `Ctrl+L` to clear

---

## Supported providers

| Provider | Skills | Model source |
|---|---|---|
| Anthropic | ✅ Full `activate_skill` support | Static list |
| CommandCode | ✅ Full `activate_skill` support (dynamic routing) | Live fetch |
| Groq | ✅ Full `activate_skill` support | Live fetch |
| OpenRouter | ✅ Full `activate_skill` support | Live fetch |

**CommandCode dynamic routing:** Claude models are routed to `/messages` (Anthropic format); all other models are routed to `/chat/completions` (OpenAI format) — enforced by the platform API.
