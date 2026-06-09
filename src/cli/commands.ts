import readline from "readline";
import chalk from "chalk";
import boxen from "boxen";
import { PROVIDER_META, providerColor } from "../config/providers.js";
import { runWizard, type AgentConfig } from "../config/manager.js";
import type { SkillCatalog } from "../skills/scanner.js";

const ASCII_BANNER = [
  "╔╦╗╦╔╗╔╦   ╔═╗╔═╗╔═╗╔╗╔╔╦╗",
  "║║║║║║║║   ╠═╣║ ╦║╣ ║║║ ║ ",
  "╩ ╩╩╝╚╝╩   ╩ ╩╚═╝╚═╝╝╚╝ ╩ ",
].join("\n");

export function printBanner(skillNames: string[], cfg: AgentConfig): void {
  const meta = PROVIDER_META[cfg.provider] || { label: cfg.provider };
  const colorFn = providerColor(cfg.provider);

  const ascii = chalk.bold.cyan(ASCII_BANNER);

  const info =
    chalk.dim("provider: ") +
    colorFn(meta.label) +
    chalk.dim("  ·  model: ") +
    chalk.white(cfg.model) +
    "\n" +
    chalk.dim("skills:   ") +
    chalk.yellow(skillNames.join(", ") || "none") +
    "\n\n" +
    chalk.dim("/skills  /config  /switch  /clear  /help  exit");

  console.log(
    boxen(ascii + "\n\n" + info, {
      padding: { top: 1, bottom: 1, left: 2, right: 3 },
      borderStyle: "round",
      borderColor: "cyan",
    })
  );
}

export function handleSlashCommand(
  cmd: string,
  skills: SkillCatalog,
  cfg: AgentConfig,
  rl: readline.Interface,
  skillNames: string[],
  clearHistory: () => void,
  onResume: () => void
): void {
  const command = cmd.trim().split(/\s+/)[0].toLowerCase();

  switch (command) {
    case "/skills": {
      if (skills.size === 0) {
        console.log(chalk.dim("No skills discovered."));
        break;
      }
      for (const skill of skills.values()) {
        const desc =
          skill.description.length > 110
            ? skill.description.slice(0, 110) + "…"
            : skill.description;
        console.log(
          boxen(chalk.yellow(skill.name) + "\n" + chalk.dim(desc), {
            padding: 1,
            borderStyle: "round",
            borderColor: "yellow",
          })
        );
      }
      break;
    }
    case "/config": {
      const meta = PROVIDER_META[cfg.provider] || { label: cfg.provider };
      const colorFn = providerColor(cfg.provider);
      const masked = cfg.apiKey ? cfg.apiKey.slice(0, 8) + "…" : "(none)";
      console.log(
        boxen(
          chalk.bold("Configuration") +
            "\n\n" +
            chalk.dim("Provider: ") +
            colorFn(meta.label) +
            "\n" +
            chalk.dim("Model:    ") +
            chalk.white(cfg.model) +
            "\n" +
            chalk.dim("API Key:  ") +
            chalk.white(masked) +
            "\n\n" +
            chalk.dim("Note: .mini-agent.json stores your API key — it is gitignored."),
          { padding: 1, borderStyle: "round", borderColor: "cyan" }
        )
      );
      break;
    }
    case "/switch": {
      rl.pause();
      runWizard(cfg)
        .then((newCfg) => {
          Object.assign(cfg, newCfg);
          clearHistory();
          rl.resume();
          printBanner(skillNames, cfg);
          onResume();
        })
        .catch((err: Error) => {
          console.error(chalk.red("Wizard error: " + err.message));
          rl.resume();
          onResume();
        });
      return; // async — don't call onResume here
    }
    case "/clear": {
      console.clear();
      printBanner(skillNames, cfg);
      break;
    }
    case "/help": {
      console.log(
        boxen(
          chalk.bold("Commands") +
            "\n\n" +
            chalk.yellow("/skills") +
            chalk.dim("   List all available skills\n") +
            chalk.yellow("/config") +
            chalk.dim("   Show current provider, model, and key\n") +
            chalk.yellow("/switch") +
            chalk.dim("   Switch provider or model (clears history)\n") +
            chalk.yellow("/clear") +
            chalk.dim("    Clear screen and reprint banner\n") +
            chalk.yellow("/help") +
            chalk.dim("     Show this help message\n") +
            chalk.yellow("exit") +
            chalk.dim("      Quit the agent\n\n") +
            chalk.dim("Ctrl+C  Exit  ·  Ctrl+L  Clear"),
          { padding: 1, borderStyle: "round", borderColor: "white" }
        )
      );
      break;
    }
    default:
      console.log(chalk.red(`unknown command: ${command} (type /help)`));
  }

  onResume();
}
