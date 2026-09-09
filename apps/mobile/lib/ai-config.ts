import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type { AIProviderConfig, AIProviderId, AppData } from '@mindwtr/core';
import { buildAIConfig as buildCoreAIConfig, buildCopilotConfig as buildCoreCopilotConfig, getAIKeyStorageKey, isSandboxMode, loadAIKeyFromStorage, saveAIKeyToStorage } from '@mindwtr/core';
import { logInfo } from './app-log';
import { FOSS_LOCAL_LLM_COPILOT_OPTIONS, FOSS_LOCAL_LLM_MODEL_OPTIONS } from './foss-local-models';

import {
    deleteSessionSecret,
    evacuateLegacySecretToSession,
    getSessionSecret,
    isSecureStoreAvailable,
    setSessionSecret,
} from './secure-secret-store';

const getSecureKey = (provider: AIProviderId) => {
    return getAIKeyStorageKey(provider).replace(/[^A-Za-z0-9._-]/g, '_');
};

export async function loadAIKey(provider: AIProviderId): Promise<string> {
    if (isSandboxMode()) return '';
    const key = getSecureKey(provider);
    if (await isSecureStoreAvailable()) {
        const value = await SecureStore.getItemAsync(key);
        if (value) {
            await saveAIKeyToStorage(AsyncStorage, provider, '');
            return value;
        }

        const legacyValue = await loadAIKeyFromStorage(AsyncStorage, provider);
        if (legacyValue) {
            await SecureStore.setItemAsync(key, legacyValue, {
                keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
            await saveAIKeyToStorage(AsyncStorage, provider, '');
        }
        return legacyValue;
    }

    const sessionValue = getSessionSecret(key);
    if (sessionValue !== null) return sessionValue;

    const legacyValue = await loadAIKeyFromStorage(AsyncStorage, provider);
    if (legacyValue) {
        await evacuateLegacySecretToSession(
            key,
            legacyValue,
            () => saveAIKeyToStorage(AsyncStorage, provider, ''),
        );
    }
    return legacyValue;
}

export async function saveAIKey(provider: AIProviderId, value: string): Promise<void> {
    if (isSandboxMode()) return;
    const key = getSecureKey(provider);
    if (await isSecureStoreAvailable()) {
        if (!value) {
            await SecureStore.deleteItemAsync(key);
        } else {
            await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        }
        await saveAIKeyToStorage(AsyncStorage, provider, '');
        deleteSessionSecret(key);
        return;
    }

    await saveAIKeyToStorage(AsyncStorage, provider, '');
    if (value) {
        setSessionSecret(key, value);
    } else {
        deleteSessionSecret(key);
    }
}

const isFossBuild = (): boolean => {
    const extra = Constants.expoConfig?.extra as { isFossBuild?: unknown } | undefined;
    return extra?.isFossBuild === true || extra?.isFossBuild === 'true';
};

/**
 * The provider an AI request will actually use. FOSS builds only ever talk to the
 * local OpenAI-compatible server, so a synced hosted provider must not decide
 * which API key an AI surface loads or which model it asks the server for. Every
 * mobile AI path resolves the provider through here instead of reading
 * `settings.ai.provider`.
 *
 * @example resolveEffectiveAIProvider({ ai: { provider: 'opencode-go' } }) // 'openai' on a FOSS build
 */
export function resolveEffectiveAIProvider(settings: AppData['settings'] | undefined): AIProviderId {
    const provider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
    return isFossBuild() && provider !== 'openai' ? 'openai' : provider;
}

const sanitizeFossSettings = (settings: AppData['settings'] | undefined): AppData['settings'] => {
    const source = settings ?? {};
    const provider = resolveEffectiveAIProvider(source);
    if (provider === (source.ai?.provider ?? 'openai')) return source;
    // A synced hosted provider carries that provider's model names, which the
    // local server does not serve, so the rewrite also returns to local defaults.
    return {
        ...source,
        ai: {
            ...source.ai,
            provider,
            model: FOSS_LOCAL_LLM_MODEL_OPTIONS[0],
            copilotModel: FOSS_LOCAL_LLM_COPILOT_OPTIONS[0],
        },
    };
};

export function isAIKeyRequired(settings: AppData['settings'] | undefined): boolean {
    if (isSandboxMode()) return false;
    const config = buildCoreAIConfig(sanitizeFossSettings(settings), '');
    return !(config.provider === 'openai' && Boolean(config.endpoint));
}

const withRequestDiagnostics = (config: AIProviderConfig): AIProviderConfig => ({
    ...config,
    onRequestStop: (reason) => {
        void logInfo('AI request stopped without retry', {
            scope: 'ai',
            extra: {
                releaseCheck: 'v1.3.0/ai-request-stop-once',
                outcome: reason,
                provider: config.provider,
                timeoutMs: config.timeoutMs,
            },
        }).catch(() => undefined);
    },
});

export function buildAIConfig(settings: AppData['settings'] | undefined, apiKey: string, sessionId?: string): AIProviderConfig {
    if (isSandboxMode()) throw new Error('Unavailable in sandbox');
    return withRequestDiagnostics(buildCoreAIConfig(sanitizeFossSettings(settings), apiKey, sessionId));
}

export function buildCopilotConfig(settings: AppData['settings'] | undefined, apiKey: string, sessionId?: string): AIProviderConfig {
    if (isSandboxMode()) throw new Error('Unavailable in sandbox');
    return withRequestDiagnostics(buildCoreCopilotConfig(sanitizeFossSettings(settings), apiKey, sessionId));
}
