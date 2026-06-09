---
name: documentation
description: Generates clear, well-structured documentation for code, APIs, functions, or modules. Use when the user asks to document code, write docs, add comments, generate a README, or explain how something works. Trigger phrases include "document this", "write docs", "generate README", "add documentation", "explain this code".
---

# Documentation Generator

Produces clear, thorough documentation for code, APIs, and modules.

## Instructions

1. Identify what type of documentation is needed: function-level, module-level, API reference, or README.
2. For code: extract the function signature, parameters, return values, and purpose.
3. Write documentation in the appropriate format (JSDoc, docstring, Markdown).
4. Include a usage example where helpful.
5. Keep it concise but complete — document intent, not just mechanics.

## Output Formats

### JSDoc (JavaScript/TypeScript)
```js
/**
 * Brief description of what the function does.
 * @param {Type} paramName - Description of parameter
 * @returns {Type} Description of return value
 * @example
 * functionName(arg) // => result
 */
```
