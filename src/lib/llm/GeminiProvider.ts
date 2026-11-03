import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import ModelProvider, { MediaIntent } from './ModelProvider.js';
import { profileMap } from '../../config/index.js';

/**
 * Google Gemini provider implementation.
 * GEMINI_MODEL is configurable so deployments can select a currently available
 * model without rebuilding the image.
 */
class GeminiProvider extends ModelProvider {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey: string) {
    super(apiKey);
    if (!apiKey) throw new Error('Gemini API key is required.');

    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    console.log('🔮 Using Gemini model:', modelName);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  getSystemPrompt(): string {
    const basePrompt = super.getSystemPrompt();
    const modifiedBasePrompt = basePrompt.replace(
      "You're an assistant that extracts media request information from user prompts.",
      'You are a media request assistant. Extract media information from user prompts and respond ONLY with valid JSON.'
    );
    return `${modifiedBasePrompt}\n\nAvailable profiles (by media type): ${JSON.stringify(profileMap)}\nWhen returning a profile, pick the numeric id under the correct media type ('movies' or 'tv').\nRespond with JSON only, no additional text or formatting.`;
  }

  async generateResponse(userPrompt: string): Promise<MediaIntent> {
    try {
      const systemPromptText = this.getSystemPrompt();
      console.log('🔮 Calling Gemini API...');

      const result = await this.model.generateContent({
        systemInstruction: { role: 'system', parts: [{ text: systemPromptText }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 150,
          responseMimeType: 'application/json',
        },
      });

      const response = await result.response;
      const responseText = response.text();
      console.log('Gemini raw response text:', responseText);

      if (!responseText) throw new Error('Empty response from Gemini API');
      return super.validateResponse(responseText);
    } catch (err: unknown) {
      console.error('❌ Error calling Gemini API:', err instanceof Error ? err.message : String(err));
      if (err instanceof Error) {
        if (err.message.includes('API_KEY_INVALID')) {
          throw new Error('Invalid Gemini API key. Please check your LLM_API_KEY environment variable.');
        }
        if (err.message.includes('QUOTA_EXCEEDED')) {
          throw new Error('Gemini API quota exceeded. Please check your usage limits.');
        }
        if (err.message.includes('RATE_LIMIT_EXCEEDED')) {
          throw new Error('Gemini API rate limit exceeded. Please try again later.');
        }
      }
      throw new Error(`Failed to generate response from Gemini: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export default GeminiProvider;
