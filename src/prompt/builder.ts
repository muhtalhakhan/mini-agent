import type { SkillCatalog } from "../skills/scanner.js";

export function buildSkillCatalog(skills: SkillCatalog): string {
  if (skills.size === 0) return "";
  const entries = [...skills.values()]
    .map(
      (s) =>
        `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`
    )
    .join("\n");
  return `<available_skills>\n${entries}\n</available_skills>`;
}

export function buildSystemPrompt(skillCatalog: string): string {
  return (
    `You are a helpful coding agent CLI. You assist developers with coding tasks, documentation, changelogs, and general project questions.\n\n` +
    (skillCatalog ? skillCatalog + "\n\n" : "") +
    `When a user's request matches a skill's description, call activate_skill with the skill name before responding. Only activate skills that are genuinely relevant. After activating, follow the skill instructions carefully.`
  );
}
