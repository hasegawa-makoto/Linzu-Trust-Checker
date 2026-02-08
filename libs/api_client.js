// Gemini API Client for Linzu Trust Checker
// Uses Google Gemini API (v1) for immediate server-side analysis.

class GeminiClient {
    static get BASE_URL() {
        return 'https://generativelanguage.googleapis.com/v1';
    }

    /**
     * Gets the best available "Flash" model dynamically.
     * Strategies:
     * 1. Check for 'gemini-2.0-flash' (Current stable/latest as per knowledge).
     * 2. Fallback to 'gemini-1.5-flash' if 2.0 is not available or errors.
     * 3. Ideally, we would list models, but that requires an extra RTT.
     *    For this implementation, we will try to use the generic latest alias if supported,
     *    or a list of known high-performance flash models in descending order.
     *
     *    However, `gemini-1.5-flash` is the current workhorse. `gemini-2.0-flash` is newer.
     *    The user requested "always latest stable alias (gemini-flash)".
     *    So we will prioritize 'gemini-2.0-flash' or just 'gemini-1.5-flash' if that's what we have.
     *    Actually, let's try to fetch the list of models and pick the latest one with "flash" in the name.
     */
    static async getBestFlashModel(apiKey) {
        const cacheKey = 'linzu_cached_model_v2';

        try {
            // Check cache first
            const cache = await new Promise(resolve => chrome.storage.local.get(cacheKey, resolve));
            if (cache[cacheKey] && cache[cacheKey].timestamp > Date.now() - 24 * 60 * 60 * 1000) {
                return cache[cacheKey].modelName;
            }

            // Fetch available models
            const response = await fetch(`${this.BASE_URL}/models?key=${apiKey}`);
            if (!response.ok) throw new Error('Failed to list models');

            const data = await response.json();
            const models = data.models || [];

            // Filter for 'flash' models that support generation
            const flashModels = models.filter(m =>
                m.name.includes('flash') &&
                m.supportedGenerationMethods &&
                m.supportedGenerationMethods.includes('generateContent')
            );

            // Sort to find the "latest"
            // Strategy: Look for "latest" alias first, then version numbers.
            // But usually the API returns specific versions.
            // Let's sort by version number descending.
            // Names are like "models/gemini-1.5-flash", "models/gemini-1.5-flash-001"

            flashModels.sort((a, b) => {
                // simple string compare might be enough if versioning is consistent
                // "gemini-2.0" > "gemini-1.5"
                return b.name.localeCompare(a.name);
            });

            // Prefer 'gemini-2.0-flash' over 'gemini-1.5-flash' if available
            // Actually, simply sorting descending by name should put 2.0 before 1.5

            let bestModel = 'models/gemini-1.5-flash'; // Safe fallback
            if (flashModels.length > 0) {
                bestModel = flashModels[0].name;
            }

            // Allow manual override or specific alias check?
            // User asked for "gemini-flash" alias if possible.
            // If the list contains 'gemini-flash', use it?
            // Usually aliases aren't listed in the standard models endpoint the same way or might be separate.
            // Let's stick to the latest specific version found.

            // Update cache
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
            throw new Error('API Key is missing.');
        }

        const modelName = await this.getBestFlashModel(apiKey);
        // Ensure model name doesn't double-prefix 'models/'
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

Output Requirement: Return ONLY valid JSON matching this schema:
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
            }],
            generationConfig: {
                response_mime_type: "application/json"
            }
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

                // Specific error handling for model not found (404)
                if (response.status === 404) {
                    throw new Error('MODEL_NOT_FOUND');
                }

                throw new Error(errorData.error?.message || `API Error: ${response.status}`);
            }

            const data = await response.json();
            const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResult) {
                throw new Error('No response from AI.');
            }

            try {
                const jsonResult = JSON.parse(textResult);
                return jsonResult;
            } catch (e) {
                console.error('Failed to parse JSON:', textResult);
                throw new Error('Invalid JSON response from AI.');
            }

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            throw error;
        }
    }
}
