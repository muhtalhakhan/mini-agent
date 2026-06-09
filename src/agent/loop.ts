import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import chalk from "chalk";
import type { SkillCatalog } from "../skills/scanner.js";
import { getSkillBody } from "../skills/scanner.js";
import type { AnthropicTool, OAITool } from "../tools/definitions.js";
import type { AgentConfig } from "../config/manager.js";

export interface LoopContext {
  client: Anthropic | OpenAI;
  cfg: AgentConfig;
  messages: unknown[];
  systemPrompt: string;
  anthropicTools: AnthropicTool[];
  openAITools: OAITool[];
  skills: SkillCatalog;
  activatedSkills: Set<string>;
}

// ---------------------------------------------------------------------------
// Anthropic streaming loop
// ---------------------------------------------------------------------------

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export async function runAnthropicLoop(ctx: LoopContext): Promise<void> {
  const { cfg, systemPrompt, anthropicTools, skills, activatedSkills } = ctx;
  const client = ctx.client as Anthropic;
  const messages = ctx.messages as Array<{ role: string; content: unknown }>;
  const MAX_TURNS = 10;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let textAccum = "";
    let currentToolUse: { id: string; name: string } | null = null;
    let inputAccum = "";
    const toolUseBlocks: ToolUseBlock[] = [];
    const contentBlocks: ContentBlock[] = [];

    const stream = client.messages.stream({
      model: cfg.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages as Parameters<typeof client.messages.stream>[0]["messages"],
      ...(anthropicTools.length > 0
        ? { tools: anthropicTools as Parameters<typeof client.messages.stream>[0]["tools"] }
        : {}),
    });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolUse = { id: event.content_block.id, name: event.content_block.name };
          inputAccum = "";
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          process.stdout.write(event.delta.text);
          textAccum += event.delta.text;
        } else if (event.delta.type === "input_json_delta") {
          inputAccum += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolUse) {
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = JSON.parse(inputAccum || "{}") as Record<string, unknown>;
          } catch {
            parsedInput = {};
          }
          toolUseBlocks.push({ ...currentToolUse, input: parsedInput });
          contentBlocks.push({
            type: "tool_use",
            id: currentToolUse.id,
            name: currentToolUse.name,
            input: parsedInput,
          });
          currentToolUse = null;
          inputAccum = "";
        } else if (textAccum) {
          contentBlocks.push({ type: "text", text: textAccum });
          textAccum = "";
        }
      }
    }

    if (textAccum) contentBlocks.push({ type: "text", text: textAccum });

    if (toolUseBlocks.length === 0) {
      process.stdout.write("\n");
      return;
    }

    messages.push({ role: "assistant", content: contentBlocks });

    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
    for (const toolCall of toolUseBlocks) {
      if (toolCall.name === "activate_skill") {
        const skillName = toolCall.input.skill_name as string;

        if (activatedSkills.has(skillName)) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: `Skill "${skillName}" is already loaded in this session.`,
          });
          continue;
        }

        const body = getSkillBody(skills, skillName);
        if (!body) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: `Skill "${skillName}" not found.`,
          });
          continue;
        }

        process.stdout.write(chalk.dim.yellow(`\n⚡ activating skill: ${skillName}\n`));
        activatedSkills.add(skillName);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: `<skill_content name="${skillName}">\n${body}\n</skill_content>`,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible streaming loop (Groq, OpenRouter, CommandCode non-Claude)
// ---------------------------------------------------------------------------

type OAIMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export async function runOpenAILoop(ctx: LoopContext): Promise<void> {
  const { cfg, systemPrompt, openAITools, skills, activatedSkills } = ctx;
  const client = ctx.client as OpenAI;
  const messages = ctx.messages as OAIMessage[];
  const MAX_TURNS = 10;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(messages as OpenAI.Chat.ChatCompletionMessageParam[]),
    ];

    const stream = await client.chat.completions.create({
      model: cfg.model,
      messages: apiMessages,
      ...(openAITools.length > 0
        ? { tools: openAITools as OpenAI.Chat.ChatCompletionTool[] }
        : {}),
      stream: true,
    });

    let textAccum = "";
    const tcAccum = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        process.stdout.write(delta.content);
        textAccum += delta.content;
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!tcAccum.has(idx)) tcAccum.set(idx, { id: "", name: "", arguments: "" });
          const entry = tcAccum.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.arguments += tc.function.arguments;
        }
      }
    }

    if (tcAccum.size === 0) {
      process.stdout.write("\n");
      messages.push({ role: "assistant", content: textAccum });
      return;
    }

    const toolCalls: OAIToolCall[] = [...tcAccum.values()].map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    }));

    messages.push({ role: "assistant", content: textAccum || null, tool_calls: toolCalls });

    for (const tc of [...tcAccum.values()]) {
      if (tc.name === "activate_skill") {
        let parsedArgs: { skill_name?: string } = {};
        try {
          parsedArgs = JSON.parse(tc.arguments) as { skill_name?: string };
        } catch {
          parsedArgs = {};
        }

        const skillName = parsedArgs.skill_name;
        if (!skillName) {
          messages.push({ role: "tool", tool_call_id: tc.id, content: "Missing skill_name." });
          continue;
        }

        if (activatedSkills.has(skillName)) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Skill "${skillName}" is already loaded in this session.`,
          });
          continue;
        }

        const body = getSkillBody(skills, skillName);
        if (!body) {
          messages.push({ role: "tool", tool_call_id: tc.id, content: `Skill "${skillName}" not found.` });
          continue;
        }

        process.stdout.write(chalk.dim.yellow(`\n⚡ activating skill: ${skillName}\n`));
        activatedSkills.add(skillName);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `<skill_content name="${skillName}">\n${body}\n</skill_content>`,
        });
      }
    }
  }
}
