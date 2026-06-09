---
name: changelog-generator
description: Generates user-facing changelogs from git commits or a list of changes. Use when the user asks to create a changelog, generate release notes, document recent changes, or summarize what changed in a release. Trigger phrases include "generate changelog", "create release notes", "what changed", "draft changelog".
---

# Changelog Generator

Transforms raw git commits or a list of changes into a clean, user-facing changelog.

## Instructions

1. Ask the user for their list of changes or git commits if not provided.
2. Categorize changes into: **Added**, **Changed**, **Fixed**, **Removed**.
3. Rewrite technical commit messages into plain, user-friendly language.
4. Format the output as a proper changelog following Keep a Changelog conventions.
5. Include a version header and date if provided.

## Output Format

```
## [Version] - YYYY-MM-DD

### Added
- New feature descriptions in plain language

### Changed
- Updated behavior descriptions

### Fixed
- Bug fix descriptions
```
