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
     * @param {string} apiKey
     * @param {string} base64Image
     * @param {string} mimeType
     * @returns {Promise<Object>} The parsed JSON result.
     */
    static async analyzeImage(apiKey, base64Image, mimeType) {
        if (!apiKey) {
            throw new Error('API_KEY_MISSING');
        }

        const modelName = await this.getBestFlashModel(apiKey);
        const cleanModelName = modelName.startsWith('models/') ? modelName.slice(7) : modelName;
        const url = `${this.BASE_URL}/models/${cleanModelName}:generateContent?key=${apiKey}`;

        // Model-agnostic prompt focused on logical analysis
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
            // Removed generationConfig.response_mime_type to fix Invalid JSON payload error in v1
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

                if (response.status === 404) throw new Error('MODEL_NOT_FOUND');
                if (response.status === 403 || errorData.error?.message?.includes('API key')) throw new Error('API_KEY_INVALID');
                if (response.status === 400 && errorData.error?.message?.includes('JSON')) throw new Error('INVALID_JSON_PAYLOAD');

                throw new Error(errorData.error?.message || `API Error: ${response.status}`);
            }

            const data = await response.json();
            let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResult) {
                throw new Error('AI_NO_RESPONSE');
            }

            // Cleanup potential Markdown wrapping
            textResult = textResult.trim();
            if (textResult.startsWith('```json')) {
                textResult = textResult.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (textResult.startsWith('```')) {
                textResult = textResult.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            // Find first '{' and last '}' just in case
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
                throw new Error('AI_PARSE_ERROR');
            }

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            throw error;
        }
    }
}
