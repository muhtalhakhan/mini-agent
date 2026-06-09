import { describe, it, expect } from "vitest";
import { tmpdir } from "os";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { discoverSkills, getSkillBody } from "../skills/scanner.js";
import { buildSkillCatalog } from "../prompt/builder.js";

function tmpSkillsDir(suffix: string): string {
  return join(tmpdir(), `mini-agent-test-${Date.now()}-${suffix}`);
}

function writeSkill(
  dir: string,
  skillName: string,
  content: string
): void {
  const skillDir = join(dir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content);
}

describe("discoverSkills", () => {
  it("returns empty map when directory does not exist", () => {
    const skills = discoverSkills("/non/existent/path");
    expect(skills.size).toBe(0);
  });

  it("parses a valid skill with frontmatter", () => {
    const dir = tmpSkillsDir("valid");
    writeSkill(
      dir,
      "welcome-me",
      `---
name: welcome-me
description: Onboard new users
---
# Welcome body content`
    );

    const skills = discoverSkills(dir);
    expect(skills.size).toBe(1);
    const skill = skills.get("welcome-me");
    expect(skill?.name).toBe("welcome-me");
    expect(skill?.description).toBe("Onboard new users");
  });

  it("falls back to directory name when name is missing from frontmatter", () => {
    const dir = tmpSkillsDir("fallback");
    writeSkill(
      dir,
      "my-skill",
      `---
description: A skill without explicit name
---
# Body`
    );

    const skills = discoverSkills(dir);
    expect(skills.size).toBe(1);
    expect(skills.has("my-skill")).toBe(true);
  });

  it("skips skill missing description", () => {
    const dir = tmpSkillsDir("nodesc");
    writeSkill(
      dir,
      "no-desc-skill",
      `---
name: no-desc-skill
---
# Body without description`
    );

    const skills = discoverSkills(dir);
    expect(skills.size).toBe(0);
  });

  it("skips directories without SKILL.md", () => {
    const dir = tmpSkillsDir("noskill");
    mkdirSync(join(dir, "not-a-skill"), { recursive: true });
    writeFileSync(join(dir, "not-a-skill", "README.md"), "not a skill");

    const skills = discoverSkills(dir);
    expect(skills.size).toBe(0);
  });

  it("discovers multiple skills", () => {
    const dir = tmpSkillsDir("multi");
    writeSkill(dir, "welcome-me", `---\nname: welcome-me\ndescription: Onboard\n---\n# Body`);
    writeSkill(dir, "changelog-generator", `---\nname: changelog-generator\ndescription: Changelogs\n---\n# Body`);
    writeSkill(dir, "documentation", `---\nname: documentation\ndescription: Write docs\n---\n# Body`);

    const skills = discoverSkills(dir);
    expect(skills.size).toBe(3);
    expect(skills.has("welcome-me")).toBe(true);
    expect(skills.has("changelog-generator")).toBe(true);
    expect(skills.has("documentation")).toBe(true);
  });

  it("skips duplicate skill names and keeps the first", () => {
    const dir = tmpSkillsDir("dupes");
    // Both dirs have name: same-skill in frontmatter
    const dir1 = join(dir, "skill-a");
    const dir2 = join(dir, "skill-b");
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, "SKILL.md"), `---\nname: same-skill\ndescription: First\n---\n# Body`);
    writeFileSync(join(dir2, "SKILL.md"), `---\nname: same-skill\ndescription: Second\n---\n# Body`);

    const skills = discoverSkills(dir);
    // Only the first one encountered is kept
    expect(skills.size).toBe(1);
    expect(skills.get("same-skill")?.description).toBe("First");
  });

  it("stores skill body in the map entry (available for Tier 2 activation)", () => {
    const dir = tmpSkillsDir("body");
    writeSkill(
      dir,
      "doc-skill",
      `---
name: doc-skill
description: Writes docs
---
# Documentation Instructions
Generate JSDoc comments.`
    );

    const skills = discoverSkills(dir);
    const skill = skills.get("doc-skill");
    expect(skill?.body).toContain("Generate JSDoc comments");
  });

  it("catalog XML (Tier 1) does NOT expose body — only name + description", () => {
    const dir = tmpSkillsDir("tier1");
    writeSkill(
      dir,
      "secret-skill",
      `---
name: secret-skill
description: Has a body
---
# Secret instructions only revealed on activation`
    );

    const skills = discoverSkills(dir);
    const catalog = buildSkillCatalog(skills);
    expect(catalog).toContain("Has a body");
    expect(catalog).not.toContain("Secret instructions only revealed on activation");
  });
});

describe("getSkillBody", () => {
  it("returns the body for a known skill", () => {
    const dir = tmpSkillsDir("getbody");
    writeSkill(
      dir,
      "my-skill",
      `---
name: my-skill
description: Test skill
---
# Full instructions here`
    );

    const skills = discoverSkills(dir);
    const body = getSkillBody(skills, "my-skill");
    expect(body).toContain("Full instructions here");
  });

  it("returns null for an unknown skill", () => {
    const skills = discoverSkills(tmpSkillsDir("empty-getbody"));
    expect(getSkillBody(skills, "nonexistent")).toBeNull();
  });
});
