export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, { type: string; enum?: string[]; description: string }>;
    required: string[];
  };
}

export interface OAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, { type: string; enum?: string[]; description: string }>;
      required: string[];
    };
  };
}

export function buildAnthropicTools(skillNames: string[]): AnthropicTool[] {
  if (skillNames.length === 0) return [];
  return [
    {
      name: "activate_skill",
      description:
        "Activate a skill to load its full instructions before responding. Call this when the user's request matches a skill's description.",
      input_schema: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            enum: skillNames,
            description: "The name of the skill to activate.",
          },
        },
        required: ["skill_name"],
      },
    },
  ];
}

export function buildOpenAITools(skillNames: string[]): OAITool[] {
  if (skillNames.length === 0) return [];
  return [
    {
      type: "function",
      function: {
        name: "activate_skill",
        description:
          "Activate a skill to load its full instructions before responding. Call this when the user's request matches a skill's description.",
        parameters: {
          type: "object",
          properties: {
            skill_name: {
              type: "string",
              enum: skillNames,
              description: "The name of the skill to activate.",
            },
          },
          required: ["skill_name"],
        },
      },
    },
  ];
}
