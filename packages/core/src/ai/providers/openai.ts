import type { AIProvider, AIProviderConfig } from '../types';
import {
    createOpenAICompatibleProvider,
    type OpenAICompatibleErrorInfo,
} from './openai-compatible';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';

function buildOpenAIError(info: OpenAICompatibleErrorInfo, usingOfficialOpenAI: boolean): Error {
    const { status, message, code, type, raw } = info;

    if (status === 401) {
        return usingOfficialOpenAI
            ? new Error('OpenAI API key is invalid or missing.')
            : new Error('OpenAI-compatible endpoint rejected the request. Check the custom base URL, API key, and model.');
    }
    if (status === 403) {
        return usingOfficialOpenAI
            ? new Error('OpenAI access denied for this model or key.')
            : new Error('OpenAI-compatible endpoint denied access. Check the API key and model permissions.');
    }
    if (status === 404) {
        return usingOfficialOpenAI
            ? new Error('OpenAI model not found or unavailable for this key.')
            : new Error('OpenAI-compatible endpoint or model not found. Check the custom base URL and model.');
    }
    if (status === 429) {
        return usingOfficialOpenAI
            ? new Error('OpenAI rate limit or quota exceeded. Please try again later.')
            : new Error('OpenAI-compatible endpoint rate limit or quota exceeded. Please try again later.');
    }

    const parts = [
        `OpenAI request failed (${status})`,
        code ? `[${code}]` : '',
        type ? `(${type})` : '',
        message ? `: ${message}` : '',
        !message && raw ? `: ${raw}` : '',
    ].filter(Boolean);
    return new Error(parts.join(' ').trim());
}

export function createOpenAIProvider(config: AIProviderConfig): AIProvider {
    return createOpenAICompatibleProvider(config, {
        label: 'OpenAI',
        rateLimitKey: 'openai',
        resolveUrl: (cfg) => cfg.endpoint || OPENAI_BASE_URL,
        resolveApiKey: (cfg) => String(cfg.apiKey || '').trim(),
        validateConfig: (_cfg, url, apiKey) => {
            const usingOfficialOpenAI = url === OPENAI_BASE_URL;
            if (!apiKey && usingOfficialOpenAI) {
                throw new Error('OpenAI API key is required.');
            }
        },
        buildHeaders: (_cfg, apiKey) => {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (apiKey) {
                headers.Authorization = `Bearer ${apiKey}`;
            }
            return headers;
        },
        buildError: (info, { url }) => buildOpenAIError(info, url === OPENAI_BASE_URL),
        preferJsonSchema: (url) => url === OPENAI_BASE_URL,
        getExtraBodyParams: (cfg) => cfg.extraBodyParams ?? {},
    });
}
