import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { select, input, password, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { PROVIDER_META, providerColor, type ModelEntry } from "./providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/config/ → dist/ → project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, ".mini-agent.json");

export interface AgentConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export function loadConfig(): AgentConfig | null {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as AgentConfig;
    } catch {
      // corrupted — fall through
    }
  }
  for (const [providerKey, meta] of Object.entries(PROVIDER_META)) {
    const apiKey = process.env[meta.envKey];
    if (apiKey) {
      return { provider: providerKey, apiKey, model: "" };
    }
  }
  return null;
}

export function saveConfig(cfg: AgentConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export async function getModels(providerKey: string, apiKey: string): Promise<ModelEntry[] | null> {
  const meta = PROVIDER_META[providerKey];
  if (meta.staticModels) return meta.staticModels;
  try {
    return await meta.fetchModels!(apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.yellow(`⚠ Could not fetch live models: ${msg}`));
    return null;
  }
}

export async function runWizard(existing: AgentConfig | null): Promise<AgentConfig> {
  const { default: boxen } = await import("boxen");
  console.log(
    boxen(chalk.bold.cyan("  mini-agent setup"), {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
    })
  );

  const detectedEnvKeys = Object.entries(PROVIDER_META)
    .filter(([, meta]) => !!process.env[meta.envKey])
    .map(([k]) => k);

  const providerChoices = Object.entries(PROVIDER_META).map(([key, meta]) => ({
    name:
      meta.label + (detectedEnvKeys.includes(key) ? chalk.dim(` (${meta.envKey} in env)`) : ""),
    value: key,
  }));

  const defaultProvider =
    existing?.provider ||
    (detectedEnvKeys.length > 0 ? detectedEnvKeys[0] : Object.keys(PROVIDER_META)[0]);

  const provider = await select({
    message: "Choose a provider:",
    choices: providerChoices,
    default: defaultProvider,
  });

  const meta = PROVIDER_META[provider];
  const envValue = process.env[meta.envKey];

  let apiKey: string | undefined;
  if (envValue) {
    console.log(
      chalk.dim(`Using ${meta.envKey} from environment: `) +
        chalk.white(envValue.slice(0, 8) + "…")
    );
    const useEnv = await confirm({ message: "Use this key?", default: true });
    if (useEnv) apiKey = envValue;
  }

  if (!apiKey) {
    apiKey = await password({ message: `Enter your ${meta.label} API key:`, mask: "*" });
  }

  console.log(chalk.dim("Fetching available models…"));
  const models = await getModels(provider, apiKey);

  let model: string;
  if (models && models.length > 0) {
    const colorFn = providerColor(provider);
    model = await select({
      message: "Choose a model:",
      choices: models.map((m) => ({
        name:
          colorFn(m.id) +
          (m.label && m.label !== m.id
            ? chalk.dim("  " + m.label.split(" — ").slice(1).join(" — "))
            : ""),
        value: m.id,
      })),
    });
  } else {
    model = await input({ message: "Enter model ID manually:" });
  }

  const cfg: AgentConfig = { provider, apiKey, model };
  saveConfig(cfg);
  console.log(chalk.green("✓ config saved"));
  return cfg;
}
