// Gemini API Client for Linzu Trust Checker
// Uses Google Gemini API (gemini-1.5-flash) for immediate server-side analysis.

class GeminiClient {
    static get BASE_URL() {
        return 'https://generativelanguage.googleapis.com/v1';
    }

    static async getBestFlashModel(apiKey) {
        // Simplified to prioritize gemini-1.5-flash as requested
        return 'gemini-1.5-flash';
    }

    /**
     * Analyzes an image using Gemini 1.5 Flash with strict JSON output.
     * @param {string} apiKey
     * @param {string} base64Image
     * @param {string} mimeType
     * @returns {Promise<Object>} The parsed JSON result.
     */
    static async analyzeImage(apiKey, base64Image, mimeType) {
        if (!apiKey) {
            throw new Error('API Key is missing. Please set it in the options page.');
        }

        const modelName = 'gemini-1.5-flash';
        const url = `${this.BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`;

        const promptText = `
Role: You are an expert image forensics analyst specializing in detecting AI-generated images.
Task: Analyze the provided image for AI artifacts such as:
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
