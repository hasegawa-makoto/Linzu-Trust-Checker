// Gemini API Client for Linzu Trust Checker
// Uses Google Gemini API (v1) for immediate server-side analysis.

class GeminiClient {
    static get BASE_URL() {
        return 'https://generativelanguage.googleapis.com/v1';
    }

    /**
     * Gets the best available "Flash" model dynamically.
     */
    static async getBestFlashModel(apiKey) {
        const cacheKey = 'linzu_cached_model_v2';

        try {
            const cache = await new Promise(resolve => chrome.storage.local.get(cacheKey, resolve));
            if (cache[cacheKey] && cache[cacheKey].timestamp > Date.now() - 24 * 60 * 60 * 1000) {
                return cache[cacheKey].modelName;
            }

            const response = await fetch(`${this.BASE_URL}/models?key=${apiKey}`);
            if (!response.ok) throw new Error('Failed to list models');

            const data = await response.json();
            const models = data.models || [];

            const flashModels = models.filter(m =>
                m.name.includes('flash') &&
                m.supportedGenerationMethods &&
                m.supportedGenerationMethods.includes('generateContent')
            );

            // Sort by version number descending
            flashModels.sort((a, b) => {
                return b.name.localeCompare(a.name);
            });

            let bestModel = 'models/gemini-1.5-flash';
            if (flashModels.length > 0) {
                bestModel = flashModels[0].name;
            }

            chrome.storage.local.set({
                [cacheKey]: {
                    modelName: bestModel,
                    timestamp: Date.now()
                }
            });

            return bestModel;

        } catch (error) {
            console.warn('Model list fetch failed, using fallback:', error);
            return 'models/gemini-1.5-flash';
        }
    }

    /**
     * Analyzes an image using the best available Gemini Flash model.
     */
    static async analyzeImage(apiKey, base64Image, mimeType) {
        if (!apiKey) {
            const err = new Error('API_KEY_MISSING');
            err.code = 'API_KEY_MISSING';
            throw err;
        }

        const modelName = await this.getBestFlashModel(apiKey);
        const cleanModelName = modelName.startsWith('models/') ? modelName.slice(7) : modelName;
        const url = `${this.BASE_URL}/models/${cleanModelName}:generateContent?key=${apiKey}`;

        const promptText = `
Role: You are an expert image forensics analyst.
Task: Logically analyze the provided image for artifacts characteristic of AI generation.
Focus on:
- Physical inconsistencies (lighting, shadows, reflections).
- Anatomical errors (hands, fingers, eyes, teeth).
- Unnatural textures (overly smooth skin, plastic-like hair).
- Garbled or alien text.
- Logic failures in background details.

Output Requirement:
You must output VALID JSON only. Do not wrap in markdown code blocks.
Schema:
{
  "is_ai_likely": boolean,
  "ai_probability": integer (0-100),
  "detected_type": string (e.g., "AI Generated Photo", "Real Photo", "AI Illustration"),
  "reasons": string[] (List of specific Japanese descriptions of artifacts found)
}
`;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType, data: base64Image } }
                ]
            }]
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Gemini API Error:', errorData);

                // Create Structured Error
                const message = errorData.error?.message || `API Error: ${response.status}`;
                const err = new Error(message);
                err.status = response.status;
                err.apiError = errorData;

                if (response.status === 404) err.code = 'MODEL_NOT_FOUND';
                else if (response.status === 403 || message.includes('API key')) err.code = 'API_KEY_INVALID';
                else if (response.status === 429) err.code = 'RATE_LIMIT_EXCEEDED';
                else if (response.status === 400) err.code = 'INVALID_REQUEST';
                else err.code = 'UNKNOWN_API_ERROR';

                throw err;
            }

            const data = await response.json();
            let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResult) {
                const err = new Error('AI_NO_RESPONSE');
                err.code = 'AI_NO_RESPONSE';
                throw err;
            }

            // Cleanup potential Markdown wrapping
            textResult = textResult.trim();
            if (textResult.startsWith('```json')) {
                textResult = textResult.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (textResult.startsWith('```')) {
                textResult = textResult.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            const start = textResult.indexOf('{');
            const end = textResult.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                textResult = textResult.slice(start, end + 1);
            }

            try {
                const jsonResult = JSON.parse(textResult);
                return jsonResult;
            } catch (e) {
                console.error('Failed to parse JSON:', textResult);
                const err = new Error('AI_PARSE_ERROR');
                err.code = 'AI_PARSE_ERROR';
                throw err;
            }

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            // Re-throw if it already has a code, otherwise wrap
            if (error.code || error.status) throw error;

            const err = new Error(error.message || 'Network/Unknown Error');
            err.code = 'NETWORK_ERROR';
            throw err;
        }
    }
}
