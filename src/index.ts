#!/usr/bin/env node
import readline from "readline";
import chalk from "chalk";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { loadConfig, runWizard, type AgentConfig } from "./config/manager.js";
import { makeClient, resolveApiFamily } from "./config/providers.js";
import { discoverSkills, getSkillsDir } from "./skills/scanner.js";
import { buildSkillCatalog, buildSystemPrompt } from "./prompt/builder.js";
import { buildAnthropicTools, buildOpenAITools } from "./tools/definitions.js";
import { runAnthropicLoop, runOpenAILoop } from "./agent/loop.js";
import { printBanner, handleSlashCommand } from "./cli/commands.js";

async function main(): Promise<void> {
  let cfg = loadConfig();
  if (!cfg || !cfg.model) {
    cfg = await runWizard(cfg);
  }

  let client = makeClient(cfg);

  const skillsDir = getSkillsDir();
  const skills = discoverSkills(skillsDir);
  const skillNames = [...skills.keys()];
  const skillCatalog = buildSkillCatalog(skills);
  const systemPrompt = buildSystemPrompt(skillCatalog);

  // Messages are typed per-provider family and cleared on /switch
  const messages: unknown[] = [];
  const activatedSkills = new Set<string>();

  function buildLoopContext() {
    return {
      client,
      cfg: cfg!,
      messages,
      systemPrompt,
      anthropicTools: buildAnthropicTools(skillNames),
      openAITools: buildOpenAITools(skillNames),
      skills,
      activatedSkills,
    };
  }

  async function runLoop(): Promise<void> {
    const family = resolveApiFamily(cfg!);
    const ctx = buildLoopContext();
    if (family === "anthropic") {
      await runAnthropicLoop(ctx);
    } else {
      await runOpenAILoop(ctx);
    }
  }

  // Single-shot mode: mini-agent "prompt text"
  const cliPrompt = process.argv.slice(2).join(" ").trim();
  if (cliPrompt) {
    messages.push({ role: "user", content: cliPrompt });
    try {
      await runLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red("Error: " + msg));
      process.exit(1);
    }
    process.exit(0);
  }

  // REPL mode
  printBanner(skillNames, cfg);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (): void => {
    rl.question(chalk.green("you") + chalk.dim(" › "), async (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed === "exit" || trimmed === "quit") {
        rl.close();
        return;
      }

      if (trimmed.startsWith("/")) {
        handleSlashCommand(
          trimmed,
          skills,
          cfg!,
          rl,
          skillNames,
          () => {
            // Rebuild client + clear history when provider/model changes
            client = makeClient(cfg!);
            messages.length = 0;
            activatedSkills.clear();
          },
          prompt
        );
        return;
      }

      messages.push({ role: "user", content: trimmed });
      try {
        await runLoop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red("\nError: " + msg));
      }
      prompt();
    });
  };

  rl.on("close", () => {
    console.log(chalk.dim("\nbye"));
    process.exit(0);
  });

  prompt();
}

main().catch((err: Error) => {
  console.error(chalk.red("Fatal: " + err.message));
  process.exit(1);
});
