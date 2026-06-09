import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import chalk, { type ChalkInstance } from "chalk";
import type { AgentConfig } from "./manager.js";

export interface ModelEntry {
  id: string;
  label: string;
}

export interface ProviderMeta {
  label: string;
  envKey: string;
  color: string;
  staticModels?: ModelEntry[];
  fetchModels?: (apiKey: string) => Promise<ModelEntry[]>;
  skillsSupported: boolean;
  // "dynamic" = routing is model-aware, resolved at runtime by resolveApiFamily()
  apiFamily: "anthropic" | "openai" | "dynamic";
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    color: "cyan",
    apiFamily: "anthropic",
    skillsSupported: true,
    staticModels: [
      { id: "claude-opus-4-8", label: "claude-opus-4-8 — most capable, complex reasoning" },
      { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6 — best speed + intelligence balance" },
      { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001 — fastest, near-frontier" },
      { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5 — previous generation" },
      { id: "claude-opus-4-6", label: "claude-opus-4-6 — previous Opus" },
    ],
  },
  groq: {
    label: "Groq",
    envKey: "GROQ_API_KEY",
    color: "green",
    apiFamily: "openai",
    skillsSupported: true,
    fetchModels: async (apiKey: string): Promise<ModelEntry[]> => {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data: Array<{ id: string }> };
      // Exclude non-chat models: Whisper (speech-to-text) and Guard (safety classifier)
      return data.data
        .filter((m) => !m.id.includes("whisper") && !m.id.includes("guard"))
        .map((m) => ({ id: m.id, label: m.id }));
    },
  },
  openrouter: {
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    color: "magenta",
    apiFamily: "openai",
    skillsSupported: true,
    fetchModels: async (apiKey: string): Promise<ModelEntry[]> => {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        data: Array<{ id: string; name?: string; architecture?: { modality?: string } }>;
      };
      // Keep only text-input → text-output models (chat-capable)
      return data.data
        .filter((m) => {
          const modality = m.architecture?.modality ?? "";
          return modality.includes("text") && modality.includes("->text");
        })
        .map((m) => ({ id: m.id, label: m.name || m.id }));
    },
  },
  commandcode: {
    label: "CommandCode",
    envKey: "COMMANDCODE_API_KEY",
    color: "yellow",
    // Claude models → /messages (Anthropic SDK); everything else → /chat/completions (OpenAI SDK)
    apiFamily: "dynamic",
    skillsSupported: true,
    fetchModels: async (apiKey: string): Promise<ModelEntry[]> => {
      const res = await fetch("https://api.commandcode.ai/provider/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        data?: Array<{ id: string }>;
        models?: Array<{ id: string }>;
      };
      const list = data.data || data.models || (data as unknown as Array<{ id: string }>);
      return Array.isArray(list) ? list.map((m) => ({ id: m.id, label: m.id })) : [];
    },
  },
};

export function providerColor(providerKey: string): ChalkInstance {
  const color = PROVIDER_META[providerKey]?.color || "white";
  return (chalk as unknown as Record<string, ChalkInstance>)[color] ?? chalk.white;
}

// CommandCode routes by model: Claude → /messages (Anthropic), everything else → /chat/completions (OpenAI)
export function resolveApiFamily(cfg: AgentConfig): "anthropic" | "openai" {
  const meta = PROVIDER_META[cfg.provider];
  if (meta?.apiFamily !== "dynamic") return meta?.apiFamily ?? "openai";
  const id = cfg.model.toLowerCase();
  return id.startsWith("claude") || id.startsWith("anthropic/") ? "anthropic" : "openai";
}

export function makeClient(cfg: AgentConfig): Anthropic | OpenAI {
  const family = resolveApiFamily(cfg);

  if (family === "anthropic") {
    // CommandCode: Anthropic SDK appends /v1/messages so baseURL must omit /v1
    const baseURL =
      cfg.provider === "commandcode" ? "https://api.commandcode.ai/provider" : undefined;
    return new Anthropic({ apiKey: cfg.apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  const baseURLMap: Record<string, string> = {
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    commandcode: "https://api.commandcode.ai/provider/v1",
  };
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: baseURLMap[cfg.provider],
    ...(cfg.provider === "openrouter"
      ? { defaultHeaders: { "HTTP-Referer": "https://github.com/mini-agent" } }
      : {}),
  });
}
