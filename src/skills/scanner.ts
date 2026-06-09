import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/skills/ → dist/ → project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export interface Skill {
  name: string;
  description: string;
  skillDir: string;
  skillPath: string;
  body: string;
}

export type SkillCatalog = Map<string, Skill>;

export function getSkillsDir(): string {
  return path.join(PROJECT_ROOT, ".skills");
}

// Tier 1: scan metadata only — bodies are already in memory from SKILL.md parse but
// the catalog keeps them; getSkillBody reads from the map (no extra disk hit).
export function discoverSkills(skillsDir: string): SkillCatalog {
  const skills: SkillCatalog = new Map();
  if (!fs.existsSync(skillsDir)) return skills;

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;

    const raw = fs.readFileSync(skillPath, "utf8");
    const parsed = matter(raw);
    const name = (parsed.data.name as string) || entry.name;
    const description = parsed.data.description as string | undefined;

    if (!description) continue;
    if (skills.has(name)) {
      console.warn(chalk.yellow(`⚠ Duplicate skill name "${name}" — skipping ${entry.name}`));
      continue;
    }

    skills.set(name, {
      name,
      description,
      skillDir: entry.name,
      skillPath,
      body: parsed.content.trim(),
    });
  }
  return skills;
}

// Tier 2: return body from the in-memory catalog entry (already parsed at startup).
export function getSkillBody(skills: SkillCatalog, skillName: string): string | null {
  return skills.get(skillName)?.body ?? null;
}
