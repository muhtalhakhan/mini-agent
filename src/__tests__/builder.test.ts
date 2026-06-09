import { describe, it, expect } from "vitest";
import { buildSkillCatalog, buildSystemPrompt } from "../prompt/builder.js";
import type { SkillCatalog } from "../skills/scanner.js";

function makeSkills(entries: Array<{ name: string; description: string }>): SkillCatalog {
  const map: SkillCatalog = new Map();
  for (const e of entries) {
    map.set(e.name, {
      name: e.name,
      description: e.description,
      skillDir: e.name,
      skillPath: `/fake/.skills/${e.name}/SKILL.md`,
      body: `# ${e.name} body`,
    });
  }
  return map;
}

describe("buildSkillCatalog", () => {
  it("returns empty string for no skills", () => {
    const catalog = buildSkillCatalog(new Map());
    expect(catalog).toBe("");
  });

  it("wraps skills in <available_skills> XML", () => {
    const skills = makeSkills([{ name: "welcome-me", description: "Onboard new users" }]);
    const catalog = buildSkillCatalog(skills);
    expect(catalog).toContain("<available_skills>");
    expect(catalog).toContain("</available_skills>");
  });

  it("includes name and description for each skill", () => {
    const skills = makeSkills([
      { name: "welcome-me", description: "Onboard new users" },
      { name: "changelog-generator", description: "Generate changelogs" },
      { name: "documentation", description: "Write docs" },
    ]);
    const catalog = buildSkillCatalog(skills);
    expect(catalog).toContain("<name>welcome-me</name>");
    expect(catalog).toContain("<name>changelog-generator</name>");
    expect(catalog).toContain("<name>documentation</name>");
    expect(catalog).toContain("Onboard new users");
    expect(catalog).toContain("Generate changelogs");
    expect(catalog).toContain("Write docs");
  });

  it("does NOT include skill body in catalog (Tier 1 only)", () => {
    const skills = makeSkills([{ name: "welcome-me", description: "Onboard new users" }]);
    const catalog = buildSkillCatalog(skills);
    // Body text should never appear in the catalog XML
    expect(catalog).not.toContain("# welcome-me body");
  });
});

describe("buildSystemPrompt", () => {
  it("contains base agent description", () => {
    const prompt = buildSystemPrompt("");
    expect(prompt).toContain("helpful coding agent");
  });

  it("does not contain <available_skills> when no skills", () => {
    const prompt = buildSystemPrompt("");
    expect(prompt).not.toContain("<available_skills>");
  });

  it("embeds catalog XML when skills are present", () => {
    const skills = makeSkills([
      { name: "welcome-me", description: "Onboard new users" },
      { name: "documentation", description: "Write docs" },
    ]);
    const catalog = buildSkillCatalog(skills);
    const prompt = buildSystemPrompt(catalog);
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("<name>welcome-me</name>");
    expect(prompt).toContain("<name>documentation</name>");
  });

  it("instructs the model to call activate_skill", () => {
    const skills = makeSkills([{ name: "welcome-me", description: "Onboard new users" }]);
    const catalog = buildSkillCatalog(skills);
    const prompt = buildSystemPrompt(catalog);
    expect(prompt).toContain("activate_skill");
  });

  it("tells the model to activate only when genuinely relevant", () => {
    const skills = makeSkills([{ name: "welcome-me", description: "Onboard" }]);
    const catalog = buildSkillCatalog(skills);
    const prompt = buildSystemPrompt(catalog);
    expect(prompt.toLowerCase()).toContain("genuinely relevant");
  });
});
