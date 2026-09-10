import type { AIProvider, AIProviderConfig, AIReasoningEffort, BreakdownInput, BreakdownResponse, ClarifyInput, ClarifyResponse, CopilotInput, CopilotResponse, ReviewAnalysisInput, ReviewAnalysisResponse, AIRequestOptions } from '../types';
import { buildBreakdownPrompt, buildClarifyPrompt, buildCopilotPrompt, buildReviewAnalysisPrompt } from '../prompts';
import {
    fetchTextWithTimeout,
    isAIRequestStopError,
    normalizeTags,
    normalizeTimeEstimate,
    parseJson,
    rateLimit,
    throwIfAIRequestAborted,
    type BufferedAIResponse,
    waitForAIRequestRetry,
    withAIRequestStopNotifications,
} from '../utils';
import { isBreakdownResponse, isClarifyResponse, isCopilotResponse, isReviewAnalysisResponse } from '../validators';

export const OPENAI_COMPATIBLE_DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export const resolveCompatibleTimeoutMs = (value?: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : OPENAI_COMPATIBLE_DEFAULT_TIMEOUT_MS;

export interface OpenAICompatibleResponseSchema {
    name: string;
    schema: Record<string, unknown>;
}

// Nullable via anyOf rather than `type: [X, 'null']` — LM Studio's MLX structured-output
// engine (outlines) rejects array-form `type` with "'type' must be a string" (#1012),
// while both it and OpenAI strict mode accept the anyOf spelling.
const nullable = (schema: Record<string, unknown>): Record<string, unknown> => ({
    anyOf: [schema, { type: 'null' }],
});

export const CLARIFY_JSON_SCHEMA: OpenAICompatibleResponseSchema = {
    name: 'clarify_response',
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options', 'suggestedAction'],
        properties: {
            question: { type: 'string' },
            options: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['label', 'action'],
                    properties: {
                        label: { type: 'string' },
                        action: { type: 'string' },
                    },
                },
            },
            // Whole object is nullable (may be absent), but when present it must
            // carry a non-null title so ClarifySuggestion.title: string stays sound.
            suggestedAction: nullable({
                type: 'object',
                additionalProperties: false,
                required: ['title', 'context', 'timeEstimate', 'isProject'],
                properties: {
                    title: { type: 'string' },
                    context: nullable({ type: 'string' }),
                    timeEstimate: nullable({ type: 'string' }),
                    isProject: nullable({ type: 'boolean' }),
                },
            }),
        },
    },
};

export const BREAKDOWN_JSON_SCHEMA: OpenAICompatibleResponseSchema = {
    name: 'breakdown_response',
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['steps'],
        properties: {
            steps: { type: 'array', items: { type: 'string' } },
        },
    },
};

export const REVIEW_JSON_SCHEMA: OpenAICompatibleResponseSchema = {
    name: 'review_analysis_response',
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['suggestions'],
        properties: {
            suggestions: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'action', 'reason'],
                    properties: {
                        id: { type: 'string' },
                        action: { type: 'string', enum: ['someday', 'archive', 'breakdown', 'keep'] },
                        reason: { type: 'string' },
                    },
                },
            },
        },
    },
};

export const COPILOT_JSON_SCHEMA: OpenAICompatibleResponseSchema = {
    name: 'copilot_response',
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['context', 'timeEstimate', 'tags'],
        properties: {
            context: nullable({ type: 'string' }),
            timeEstimate: nullable({ type: 'string' }),
            tags: { type: 'array', items: { type: 'string' } },
        },
    },
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const extractText = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === 'string') return item;
                if (!isRecord(item)) return '';
                const text = item.text ?? item.content;
                return typeof text === 'string' ? text : '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();
    }
    if (isRecord(value)) {
        const text = value.text ?? value.content;
        if (typeof text === 'string') return text.trim();
        if (Array.isArray(value.summary)) return extractText(value.summary);
        if (typeof value.summary === 'string') return value.summary.trim();
    }
    return '';
};

export const extractOpenAICompatibleMessageText = (message: unknown): string => {
    if (!isRecord(message)) return '';
    const contentText = extractText(message.content);
    if (contentText) return contentText;

    const reasoningContent = extractText(message.reasoning_content);
    if (reasoningContent) return reasoningContent;

    return extractText(message.reasoning);
};

export interface OpenAICompatibleErrorInfo {
    status: number;
    message: string;
    code: string;
    type: string;
    raw: string;
}

export async function readOpenAICompatibleErrorInfo(response: BufferedAIResponse): Promise<OpenAICompatibleErrorInfo> {
    const status = response.status;
    let message = '';
    let code = '';
    let type = '';
    let raw = '';
    // The timeout helper buffers the body once as text. Parse that copy so a
    // non-JSON provider error remains available for the fallback message.
    raw = response.bodyText;
    if (raw) {
        try {
            const data = JSON.parse(raw) as {
                error?: string | { message?: string; code?: string; type?: string };
            };
            if (typeof data?.error === 'string') {
                message = data.error;
                raw = '';
            } else if (data?.error) {
                message = data.error.message ?? '';
                code = data.error.code ?? '';
                type = data.error.type ?? '';
                raw = '';
            }
        } catch {
            // Not JSON; fall back to the raw body text below.
        }
    }
    return { status, message, code, type, raw };
}

// A pre-Structured-Outputs official model (e.g. a manually-entered gpt-4-turbo)
// rejects response_format: json_schema with a 400. Detect it so we can retry the
// same request with the looser json_object rather than failing every AI call.
export const isUnsupportedResponseFormatError = (info: OpenAICompatibleErrorInfo): boolean => {
    if (info.status !== 400) return false;
    const haystack = `${info.message} ${info.code} ${info.type}`.toLowerCase();
    return haystack.includes('response_format') || haystack.includes('json_schema') || haystack.includes('structured output');
};

export const requiresJsonSchemaResponseFormat = (info: OpenAICompatibleErrorInfo): boolean => {
    if (info.status !== 400) return false;
    const haystack = `${info.message} ${info.code} ${info.type}`.toLowerCase();
    return haystack.includes('response_format')
        && haystack.includes('json_schema')
        && (haystack.includes('must') || haystack.includes('only'));
};

// A model that takes no reasoning parameter at all answers 400 naming the field
// (rather than rejecting one tier), which is how a mis-guessed per-model profile
// shows up: an OpenCode Go id whose upstream has no effort control.
export const isUnsupportedReasoningEffortError = (info: OpenAICompatibleErrorInfo): boolean => {
    if (info.status !== 400) return false;
    return /reasoning[_\s-]?effort/i.test(`${info.message} ${info.code} ${info.type} ${info.raw}`);
};

// What the request should carry for reasoning, resolved per model by the policy:
// the effort to send (already narrowed to what the model accepts) and whether an
// explicit temperature is allowed. Some models reject a temperature value with a
// 400 unsupported_parameter or unsupported_value error, so their policy sets
// omitTemperature and the request relies on the model default instead.
export interface OpenAICompatibleRequestPolicy {
    reasoningEffort?: AIReasoningEffort;
    omitTemperature: boolean;
}

export interface OpenAICompatiblePolicy {
    label: string;
    rateLimitKey: string;
    resolveUrl: (config: AIProviderConfig) => string;
    resolveApiKey: (config: AIProviderConfig) => string;
    validateConfig: (config: AIProviderConfig, url: string, apiKey: string) => void;
    buildHeaders: (config: AIProviderConfig, apiKey: string) => Record<string, string>;
    buildError: (info: OpenAICompatibleErrorInfo, context: { url: string; preferJsonSchema: boolean }) => Error;
    preferJsonSchema: (url: string) => boolean;
    getExtraBodyParams: (config: AIProviderConfig) => Record<string, unknown>;
    resolveRequestPolicy: (config: AIProviderConfig) => OpenAICompatibleRequestPolicy;
}

async function requestCompatible(
    config: AIProviderConfig,
    policy: OpenAICompatiblePolicy,
    prompt: { system: string; user: string },
    schema?: OpenAICompatibleResponseSchema,
    options?: AIRequestOptions,
): Promise<string> {
    const url = policy.resolveUrl(config);
    const preferJsonSchema = policy.preferJsonSchema(url);
    const apiKey = policy.resolveApiKey(config);
    policy.validateConfig(config, url, apiKey);
    const requestPolicy = policy.resolveRequestPolicy(config);
    const reasoningEffort = requestPolicy.reasoningEffort;

    const extraBodyParams = policy.getExtraBodyParams(config);
    // An explicit temperature in extraBodyParams always wins so users can
    // override our defaults (e.g. force a value on a reasoning model, or opt
    // out of temperature entirely by setting it to undefined) if provider
    // behavior changes in the future.
    const hasExplicitTemperature = Object.prototype.hasOwnProperty.call(extraBodyParams, 'temperature');

    // Prefer strict Structured Outputs on the official endpoint. Custom endpoints
    // start with json_object for compatibility, then retry with json_schema if the
    // server explicitly requires it (LM Studio). response_format stays protected
    // from extraBodyParams so every operation uses its matching schema.
    const jsonSchemaResponseFormat = schema
        ? { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } }
        : undefined;
    const responseFormat = preferJsonSchema && jsonSchemaResponseFormat
        ? jsonSchemaResponseFormat
        : { type: 'json_object' };

    const body = {
        ...extraBodyParams,
        model: config.model,
        messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
        ],
        // Reasoning models only support the default temperature; sending an
        // explicit value returns a 400 unsupported_value error. Skip our
        // default for them, but never override a user-supplied temperature.
        ...(hasExplicitTemperature || requestPolicy.omitTemperature ? {} : { temperature: 0.2 }),
        response_format: responseFormat,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    };

    const headers = policy.buildHeaders(config, apiKey);

    await rateLimit(policy.rateLimitKey, 250, options?.signal, policy.label);

    // Runs the transient-retry loop for one body and returns the final Response
    // (ok or a non-retryable error); throws only on network failure after retries.
    const dispatch = async (requestBody: unknown): Promise<BufferedAIResponse> => {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
            throwIfAIRequestAborted(options?.signal, policy.label);
            let response: BufferedAIResponse;
            try {
                response = await fetchTextWithTimeout(
                    url,
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(requestBody),
                    },
                    resolveCompatibleTimeoutMs(config.timeoutMs),
                    policy.label,
                    options?.signal,
                    config.fetcher,
                );
            } catch (error) {
                // A timeout or caller abort is terminal: retrying it would either
                // repeat a 30s wait or ignore the cancel the user asked for.
                if (isAIRequestStopError(error)) throw error;
                if (attempt < MAX_RETRIES) {
                    await waitForAIRequestRetry(400 * Math.pow(2, attempt), options?.signal, policy.label);
                    continue;
                }
                throw error;
            }

            if (!response.ok && RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
                await waitForAIRequestRetry(400 * Math.pow(2, attempt), options?.signal, policy.label);
                continue;
            }
            return response;
        }
        throw new Error(`${policy.label} request failed to start.`);
    };

    let response = await dispatch(body);
    let activeResponseFormat: unknown = responseFormat;

    // Negotiate the opposite structured-output mode when an endpoint names the
    // one it requires: older official models use json_object; LM Studio uses json_schema.
    if (!response.ok && jsonSchemaResponseFormat && response.status === 400) {
        const info = await readOpenAICompatibleErrorInfo(response);
        if (preferJsonSchema && isUnsupportedResponseFormatError(info)) {
            activeResponseFormat = { type: 'json_object' };
            response = await dispatch({ ...body, response_format: activeResponseFormat });
        } else if (!preferJsonSchema && requiresJsonSchemaResponseFormat(info)) {
            activeResponseFormat = jsonSchemaResponseFormat;
            response = await dispatch({ ...body, response_format: activeResponseFormat });
        }
    }

    // One more 400 case, after the format negotiation: a model that takes no
    // reasoning parameter at all. Retry the same request without it so a wrongly
    // guessed per-model profile degrades to the provider default instead of
    // failing the operation outright.
    if (!response.ok && response.status === 400 && reasoningEffort) {
        const info = await readOpenAICompatibleErrorInfo(response);
        if (isUnsupportedReasoningEffortError(info)) {
            const bodyWithoutReasoningEffort: Record<string, unknown> = { ...body, response_format: activeResponseFormat };
            delete bodyWithoutReasoningEffort.reasoning_effort;
            response = await dispatch(bodyWithoutReasoningEffort);
        }
    }

    if (!response.ok) {
        throw policy.buildError(await readOpenAICompatibleErrorInfo(response), { url, preferJsonSchema });
    }

    const result = JSON.parse(response.bodyText) as {
        choices?: Array<{ message?: unknown }>;
    };

    const text = extractOpenAICompatibleMessageText(result.choices?.[0]?.message);
    if (!text) {
        throw new Error(`${policy.label} returned no content.`);
    }
    return text;
}

export function createOpenAICompatibleProvider(
    config: AIProviderConfig,
    policy: OpenAICompatiblePolicy,
): AIProvider {
    // Wrapped once here rather than in each policy so every OpenAI-compatible
    // adapter reports timeouts and cancels through config.onRequestStop.
    return withAIRequestStopNotifications(config, {
        clarifyTask: async (input: ClarifyInput, options?: AIRequestOptions): Promise<ClarifyResponse> => {
            const prompt = buildClarifyPrompt(input);
            const text = await requestCompatible(config, policy, prompt, CLARIFY_JSON_SCHEMA, options);
            try {
                return parseJson<ClarifyResponse>(text, isClarifyResponse);
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestCompatible(config, policy, retryPrompt, CLARIFY_JSON_SCHEMA, options);
                return parseJson<ClarifyResponse>(retryText, isClarifyResponse);
            }
        },
        breakDownTask: async (input: BreakdownInput, options?: AIRequestOptions): Promise<BreakdownResponse> => {
            const prompt = buildBreakdownPrompt(input);
            const text = await requestCompatible(config, policy, prompt, BREAKDOWN_JSON_SCHEMA, options);
            try {
                return parseJson<BreakdownResponse>(text, isBreakdownResponse);
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestCompatible(config, policy, retryPrompt, BREAKDOWN_JSON_SCHEMA, options);
                return parseJson<BreakdownResponse>(retryText, isBreakdownResponse);
            }
        },
        analyzeReview: async (input: ReviewAnalysisInput, options?: AIRequestOptions): Promise<ReviewAnalysisResponse> => {
            const prompt = buildReviewAnalysisPrompt(input.items);
            const text = await requestCompatible(config, policy, prompt, REVIEW_JSON_SCHEMA, options);
            try {
                return parseJson<ReviewAnalysisResponse>(text, isReviewAnalysisResponse);
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestCompatible(config, policy, retryPrompt, REVIEW_JSON_SCHEMA, options);
                return parseJson<ReviewAnalysisResponse>(retryText, isReviewAnalysisResponse);
            }
        },
        predictMetadata: async (input: CopilotInput, options?: AIRequestOptions): Promise<CopilotResponse> => {
            const prompt = buildCopilotPrompt(input);
            const text = await requestCompatible(config, policy, prompt, COPILOT_JSON_SCHEMA, options);
            try {
                const parsed = parseJson<CopilotResponse>(text, isCopilotResponse);
                const context = typeof parsed.context === 'string' ? parsed.context : undefined;
                const timeEstimate = typeof parsed.timeEstimate === 'string' ? parsed.timeEstimate : undefined;
                const tags = Array.isArray(parsed.tags) ? normalizeTags(parsed.tags) : [];
                return {
                    context,
                    timeEstimate: normalizeTimeEstimate(timeEstimate) as CopilotResponse['timeEstimate'],
                    tags,
                };
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestCompatible(config, policy, retryPrompt, COPILOT_JSON_SCHEMA, options);
                const parsed = parseJson<CopilotResponse>(retryText, isCopilotResponse);
                const context = typeof parsed.context === 'string' ? parsed.context : undefined;
                const timeEstimate = typeof parsed.timeEstimate === 'string' ? parsed.timeEstimate : undefined;
                const tags = Array.isArray(parsed.tags) ? normalizeTags(parsed.tags) : [];
                return {
                    context,
                    timeEstimate: normalizeTimeEstimate(timeEstimate) as CopilotResponse['timeEstimate'],
                    tags,
                };
            }
        },
    });
}
