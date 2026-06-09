import { describe, it, expect } from "vitest";
import { buildAnthropicTools, buildOpenAITools } from "../tools/definitions.js";

describe("buildAnthropicTools", () => {
  it("returns empty array when no skills", () => {
    expect(buildAnthropicTools([])).toHaveLength(0);
  });

  it("returns a single activate_skill tool", () => {
    const tools = buildAnthropicTools(["welcome-me", "changelog-generator", "documentation"]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("activate_skill");
  });

  it("constrains skill_name enum to discovered skill names", () => {
    const names = ["welcome-me", "changelog-generator", "documentation"];
    const tools = buildAnthropicTools(names);
    const enumValues = tools[0].input_schema.properties.skill_name.enum as string[];
    expect(enumValues).toEqual(names);
  });

  it("marks skill_name as required", () => {
    const tools = buildAnthropicTools(["welcome-me"]);
    expect(tools[0].input_schema.required).toContain("skill_name");
  });

  it("does not include names outside the discovered list in the enum", () => {
    const tools = buildAnthropicTools(["only-this-skill"]);
    const enumValues = tools[0].input_schema.properties.skill_name.enum as string[];
    expect(enumValues).not.toContain("hallucinated-skill");
  });

  it("has a non-empty description", () => {
    const tools = buildAnthropicTools(["welcome-me"]);
    expect(tools[0].description.length).toBeGreaterThan(0);
  });
});

describe("buildOpenAITools", () => {
  it("returns empty array when no skills", () => {
    expect(buildOpenAITools([])).toHaveLength(0);
  });

  it("returns a single function tool wrapping activate_skill", () => {
    const tools = buildOpenAITools(["welcome-me", "changelog-generator"]);
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("function");
    expect(tools[0].function.name).toBe("activate_skill");
  });

  it("constrains skill_name enum to discovered skill names", () => {
    const names = ["welcome-me", "changelog-generator", "documentation"];
    const tools = buildOpenAITools(names);
    const enumValues = tools[0].function.parameters.properties.skill_name.enum as string[];
    expect(enumValues).toEqual(names);
  });

  it("marks skill_name as required", () => {
    const tools = buildOpenAITools(["welcome-me"]);
    expect(tools[0].function.parameters.required).toContain("skill_name");
  });

  it("has a non-empty function description", () => {
    const tools = buildOpenAITools(["welcome-me"]);
    expect(tools[0].function.description.length).toBeGreaterThan(0);
  });

  it("anthropic and openai tools agree on the same enum values", () => {
    const names = ["welcome-me", "changelog-generator", "documentation"];
    const anthropic = buildAnthropicTools(names);
    const openai = buildOpenAITools(names);
    const anthropicEnum = anthropic[0].input_schema.properties.skill_name.enum as string[];
    const openaiEnum = openai[0].function.parameters.properties.skill_name.enum as string[];
    expect(anthropicEnum).toEqual(openaiEnum);
  });
});
