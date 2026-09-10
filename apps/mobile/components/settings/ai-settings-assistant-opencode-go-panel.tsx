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
    aiReasoningOptions: { value: AIReasoningEffort; label: string }[];
    onAiApiKeyChange: (value: string) => void;
    onAiReasoningEffortChange: (value: AIReasoningEffort) => void;
    t: Translate;
    tc: ThemeColors;
};

export function AiSettingsAssistantOpenCodeGoPanel({
    aiApiKey,
    aiReasoningEffort,
    aiReasoningOptions,
    onAiApiKeyChange,
    onAiReasoningEffortChange,
    t,
    tc,
}: AiSettingsAssistantOpenCodeGoPanelProps) {
    const hasReasoningOptions = aiReasoningOptions.length > 0;
    return (
        <>
            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                <View style={styles.settingInfo}>
                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiReasoning')}</Text>
                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                        {t(hasReasoningOptions
                            ? 'settings.aiReasoningHintOpenCodeGo'
                            : 'settings.aiReasoningUnsupported')}
                    </Text>
                </View>
            </View>
            {hasReasoningOptions && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    <View style={styles.backendToggle}>
                        {aiReasoningOptions.map((option) => (
                            <TouchableOpacity
                                key={option.value}
                                style={[
                                    styles.backendOption,
                                    { borderColor: tc.border, backgroundColor: aiReasoningEffort === option.value ? tc.filterBg : 'transparent' },
                                ]}
                                onPress={() => onAiReasoningEffortChange(option.value)}
                            >
                                <CompactText
                                    style={[styles.backendOptionText, { color: aiReasoningEffort === option.value ? tc.tint : tc.secondaryText }]}
                                    numberOfLines={2}
                                >
                                    {option.label}
                                </CompactText>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}
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
