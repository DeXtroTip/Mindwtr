import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { AIReasoningEffort } from '@mindwtr/core';

import type { ThemeColors } from '@/hooks/use-theme-colors';
import { CompactText } from '@/components/compact-text';

import { styles } from './settings.styles';

type Translate = (key: string) => string;

type AiSettingsAssistantOpenCodeGoPanelProps = {
    aiApiKey: string;
    aiReasoningEffort: AIReasoningEffort;
    onAiApiKeyChange: (value: string) => void;
    onAiReasoningEffortChange: (value: AIReasoningEffort) => void;
    t: Translate;
    tc: ThemeColors;
};

export function AiSettingsAssistantOpenCodeGoPanel({
    aiApiKey,
    aiReasoningEffort,
    onAiApiKeyChange,
    onAiReasoningEffortChange,
    t,
    tc,
}: AiSettingsAssistantOpenCodeGoPanelProps) {
    return (
        <>
            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                <View style={styles.settingInfo}>
                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiReasoning')}</Text>
                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                        {t('settings.aiReasoningHint')}
                    </Text>
                </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                <View style={styles.backendToggle}>
                    {(['low', 'medium', 'high'] as AIReasoningEffort[]).map((effort) => (
                        <TouchableOpacity
                            key={effort}
                            style={[
                                styles.backendOption,
                                { borderColor: tc.border, backgroundColor: aiReasoningEffort === effort ? tc.filterBg : 'transparent' },
                            ]}
                            onPress={() => onAiReasoningEffortChange(effort)}
                        >
                            <CompactText
                                style={[styles.backendOptionText, { color: aiReasoningEffort === effort ? tc.tint : tc.secondaryText }]}
                                numberOfLines={2}
                            >
                                {effort === 'low'
                                    ? t('settings.aiEffortLow')
                                    : effort === 'medium'
                                        ? t('settings.aiEffortMedium')
                                        : t('settings.aiEffortHigh')}
                            </CompactText>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                <View style={styles.settingInfo}>
                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiApiKey')}</Text>
                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>{t('settings.aiApiKeyHint')}</Text>
                </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <TextInput
                    value={aiApiKey}
                    onChangeText={onAiApiKeyChange}
                    placeholder={t('settings.aiApiKeyPlaceholder')}
                    placeholderTextColor={tc.secondaryText}
                    autoCapitalize="none"
                    secureTextEntry
                    style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                />
            </View>
        </>
    );
}
