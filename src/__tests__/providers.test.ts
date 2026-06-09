import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PROVIDER_META, resolveApiFamily } from "../config/providers.js";
import type { AgentConfig } from "../config/manager.js";

function cfg(provider: string, model: string): AgentConfig {
  return { provider, apiKey: "test-key", model };
}

describe("PROVIDER_META", () => {
  it("defines all four expected providers", () => {
    expect(PROVIDER_META).toHaveProperty("anthropic");
    expect(PROVIDER_META).toHaveProperty("groq");
    expect(PROVIDER_META).toHaveProperty("openrouter");
    expect(PROVIDER_META).toHaveProperty("commandcode");
  });

  it("all providers have required fields", () => {
    for (const [key, meta] of Object.entries(PROVIDER_META)) {
      expect(meta.label, `${key}.label`).toBeTruthy();
      expect(meta.envKey, `${key}.envKey`).toBeTruthy();
      expect(meta.color, `${key}.color`).toBeTruthy();
      expect(meta.apiFamily, `${key}.apiFamily`).toMatch(/^(anthropic|openai|dynamic)$/);
      expect(typeof meta.skillsSupported, `${key}.skillsSupported`).toBe("boolean");
    }
  });

  it("all providers support skills", () => {
    for (const [key, meta] of Object.entries(PROVIDER_META)) {
      expect(meta.skillsSupported, `${key} should support skills`).toBe(true);
    }
  });

  it("anthropic has static model list", () => {
    expect(PROVIDER_META.anthropic.staticModels?.length).toBeGreaterThan(0);
  });

  it("groq, openrouter, commandcode have live fetchModels", () => {
    expect(typeof PROVIDER_META.groq.fetchModels).toBe("function");
    expect(typeof PROVIDER_META.openrouter.fetchModels).toBe("function");
    expect(typeof PROVIDER_META.commandcode.fetchModels).toBe("function");
  });

  it("commandcode is marked dynamic", () => {
    expect(PROVIDER_META.commandcode.apiFamily).toBe("dynamic");
  });
});

describe("resolveApiFamily", () => {
  it("anthropic provider always resolves to anthropic", () => {
    expect(resolveApiFamily(cfg("anthropic", "claude-sonnet-4-6"))).toBe("anthropic");
    expect(resolveApiFamily(cfg("anthropic", "claude-opus-4-8"))).toBe("anthropic");
  });

  it("groq always resolves to openai", () => {
    expect(resolveApiFamily(cfg("groq", "llama-3.3-70b-versatile"))).toBe("openai");
    expect(resolveApiFamily(cfg("groq", "mixtral-8x7b-32768"))).toBe("openai");
  });

  it("openrouter always resolves to openai", () => {
    expect(resolveApiFamily(cfg("openrouter", "anthropic/claude-opus-4-8"))).toBe("openai");
    expect(resolveApiFamily(cfg("openrouter", "openai/gpt-4o"))).toBe("openai");
  });

  describe("commandcode dynamic routing", () => {
    it("routes claude-* models to anthropic /messages endpoint", () => {
      expect(resolveApiFamily(cfg("commandcode", "claude-sonnet-4-6"))).toBe("anthropic");
      expect(resolveApiFamily(cfg("commandcode", "claude-opus-4-8"))).toBe("anthropic");
      expect(resolveApiFamily(cfg("commandcode", "claude-haiku-4-5-20251001"))).toBe("anthropic");
    });

    it("routes anthropic/ prefixed models to anthropic /messages endpoint", () => {
      expect(resolveApiFamily(cfg("commandcode", "anthropic/claude-sonnet-4-6"))).toBe("anthropic");
    });

    it("routes OpenAI models to openai /chat/completions endpoint", () => {
      expect(resolveApiFamily(cfg("commandcode", "gpt-5.5"))).toBe("openai");
      expect(resolveApiFamily(cfg("commandcode", "openai/gpt-4o"))).toBe("openai");
    });

    it("routes OSS models to openai /chat/completions endpoint", () => {
      expect(resolveApiFamily(cfg("commandcode", "deepseek/deepseek-v4-flash"))).toBe("openai");
      expect(resolveApiFamily(cfg("commandcode", "moonshotai/Kimi-K2.5"))).toBe("openai");
      expect(resolveApiFamily(cfg("commandcode", "glm-4-flash"))).toBe("openai");
    });
  });
});
