import { query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { AGENT_PROMPT, VERSION } from "./config.js";
import type { AgentEmit } from "./types.js";

type Json = Record<string, unknown>;

export async function runClaudeAgentSDKTurn(prompt: string, emit: AgentEmit, options: { cwd?: string; sessionId?: string } = {}) {
    if (!prompt.trim()) return;

    const fullPrompt = prompt.trim() ? `${AGENT_PROMPT}\n\n用户请求：${prompt}` : prompt;

    try {
        emit("agent_event", { agent: "claude", type: "turn.started" });

        const queryOptions = {
            model: "claude-sonnet-4-20250514",
            cwd: options.cwd || process.cwd(),
            allowedTools: ["mcp__infinite-canvas__*"],
            permissionMode: "bypassPermissions" as const,
            maxTurns: 20,
            ...(options.sessionId ? { resume: options.sessionId } : {}),
        };

        const queryResult = query({
            prompt: fullPrompt,
            options: queryOptions,
        });

        let sessionId: string | undefined;

        for await (const message of queryResult) {
            const normalized = normalizeClaudeAgentSDKMessage(message, sessionId);
            if (normalized) {
                if (normalized.type === "session.started" && normalized.session_id) {
                    sessionId = normalized.session_id;
                }
                emit("agent_event", { agent: "claude", ...normalized });
            }
        }

        emit("agent_event", { agent: "claude", type: "turn.completed" });
        emit("agent_done", { agent: "claude" });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        emit("agent_error", { message: errorMessage });
        emit("agent_done", { agent: "claude", error: errorMessage });
    }
}

function normalizeClaudeAgentSDKMessage(message: SDKMessage, sessionId?: string): Json | null {
    if (message.type === "system") {
        if (message.subtype === "init") {
            return {
                type: "session.started",
                session_id: sessionId || message.session_id,
                model: message.model,
                tools: message.tools,
            };
        }
        return null;
    }

    if (message.type === "assistant") {
        const content = message.message?.content;
        if (!Array.isArray(content)) return null;

        const textParts: string[] = [];
        const toolCalls: Json[] = [];

        for (const block of content) {
            if (block.type === "text") {
                textParts.push(block.text);
            } else if (block.type === "tool_use") {
                toolCalls.push({
                    type: "tool_call",
                    id: block.id,
                    name: block.name,
                    input: block.input,
                });
            }
        }

        const result: Json = { type: "assistant.message" };
        if (textParts.length > 0) {
            result.text = textParts.join("\n");
        }
        if (toolCalls.length > 0) {
            result.tool_calls = toolCalls;
        }
        return result;
    }

    if (message.type === "user") {
        const content = message.message?.content;
        if (!Array.isArray(content)) return null;

        const toolResults: Json[] = [];
        for (const block of content) {
            if (block.type === "tool_result") {
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.tool_use_id,
                    content: block.content,
                    is_error: block.is_error,
                });
            }
        }

        if (toolResults.length > 0) {
            return {
                type: "tool.results",
                results: toolResults,
            };
        }
        return null;
    }

    if (message.type === "result") {
        if (message.subtype === "success") {
            return {
                type: "turn.result",
                result: message.result,
                cost_usd: message.cost_usd,
                duration_ms: message.duration_ms,
                num_turns: message.num_turns,
                session_id: message.session_id,
            };
        } else if (message.subtype === "error") {
            return {
                type: "turn.error",
                error: message.error,
                cost_usd: message.cost_usd,
                duration_ms: message.duration_ms,
            };
        }
    }

    return null;
}

export function createClaudeAgentSDKAdapter() {
    return {
        runTurn: runClaudeAgentSDKTurn,
    };
}