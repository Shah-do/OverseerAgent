import GeminiProvider from './GeminiProvider.js';
import AnthropicProvider from './AnthropicProvider.js';
import ModelProvider, { MediaIntent } from './ModelProvider.js';

export function createProvider(provider: string, apiKey: string): ModelProvider {
  if (!provider) throw new Error('LLM_PROVIDER environment variable is required');
  if (!apiKey) throw new Error(`LLM_API_KEY is required for provider: ${provider}`);

  switch (provider.toLowerCase()) {
    case 'gemini':
      console.log('🔮 Initializing Gemini provider');
      return new GeminiProvider(apiKey);
    case 'anthropic':
      console.log('🪶 Initializing Anthropic provider');
      return new AnthropicProvider(apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}. Supported providers: gemini, anthropic`);
  }
}

export async function invokeChatModel(userPrompt: string): Promise<MediaIntent> {
  const providerName = process.env.LLM_PROVIDER?.toLowerCase();
  if (!providerName) throw new Error('LLM_PROVIDER environment variable is not set or is empty.');

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error(`LLM_API_KEY is not defined for provider ${providerName}.`);

  const providerInstance = createProvider(providerName, apiKey);
  try {
    return await providerInstance.generateResponse(userPrompt);
  } catch (err: unknown) {
    console.error(`❌ Error in invokeChatModel with ${providerName} provider:`, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export function validateLLMConfig(): void {
  const provider = process.env.LLM_PROVIDER;
  const supportedProviders = ['gemini', 'anthropic'];

  if (!provider) {
    throw new Error(`❌ LLM_PROVIDER environment variable is required. Set it to one of: ${supportedProviders.join(', ')}.`);
  }

  if (!supportedProviders.includes(provider.toLowerCase())) {
    throw new Error(`❌ Unsupported LLM provider: ${provider}. Supported providers: ${supportedProviders.join(', ')}.`);
  }

  if (!process.env.LLM_API_KEY) {
    throw new Error('❌ LLM_API_KEY environment variable is required for the selected provider.');
  }

  console.log(`✅ LLM configuration validated: ${provider}`);
}
