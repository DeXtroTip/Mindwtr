// FOSS builds ship without hosted AI providers: the assistant only talks to a
// local OpenAI-compatible server, so both AI paths fall back to these ids when a
// synced setting names a hosted provider.
//
// Lives in lib/ rather than settings.constants.ts because ./ai-config.ts needs
// the fallbacks and lib/ never imports components/.
export const FOSS_LOCAL_LLM_MODEL_OPTIONS = ['llama3.2', 'qwen2.5', 'mistral', 'phi-4-mini'];
export const FOSS_LOCAL_LLM_COPILOT_OPTIONS = ['llama3.2', 'qwen2.5', 'mistral', 'phi-4-mini'];
