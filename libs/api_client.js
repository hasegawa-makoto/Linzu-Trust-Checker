// Gemini API Client for Linzu Trust Checker
// このクライアントは、Google Gemini APIを使用して画像のAI生成アーティファクトを分析します。
// 使用モデル: gemini-1.5-flash (または最新のFlashモデル)
// エンドポイント: v1 (安定版)

class GeminiClient {
    /**
     * Gemini APIのベースURL
     * 安定版の v1 エンドポイントを使用します。
     */
    static get BASE_URL() {
        return 'https://generativelanguage.googleapis.com/v1';
    }

    /**
     * 最適なFlashモデルを動的に取得します。
     * @param {string} apiKey - ユーザーが設定したGemini APIキー
     * @returns {Promise<string>} 最適なモデル名 (例: 'models/gemini-1.5-flash')
     */
    static async getBestFlashModel(apiKey) {
        // キャッシュチェック (24時間有効)
        const cacheKey = 'linzu_cached_model';
        const cache = await new Promise(resolve => chrome.storage.local.get(cacheKey, resolve));

        if (cache[cacheKey] && cache[cacheKey].timestamp > Date.now() - 24 * 60 * 60 * 1000) {
            // console.log('Using cached model:', cache[cacheKey].modelName);
            return cache[cacheKey].modelName;
        }

        try {
            const url = `${this.BASE_URL}/models?key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                // モデルリスト取得に失敗した場合は、安全なデフォルト値を返す
                console.warn('Failed to fetch model list, falling back to default.');
                return 'models/gemini-1.5-flash';
            }

            const data = await response.json();

            // "flash" を含み、画像生成(generateContent)をサポートするモデルをフィルタリング
            const flashModels = (data.models || [])
                .filter(m => m.name.toLowerCase().includes('flash'))
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));

            if (flashModels.length === 0) {
                 return 'models/gemini-1.5-flash'; // Fallback
            }

            // バージョン番号でソート (新しい順)
            // 単純な文字列比較ではなく、バージョン番号をパースして比較するのが理想だが、
            // 現状は "gemini-1.5-flash" や "gemini-1.5-flash-001" などの形式が多い。
            // "latest" があればそれを優先、なければバージョン番号が大きいものを選ぶ。
            // ここでは簡易的に、名前の降順ソート（新しいバージョン番号が上に来やすい）を採用しつつ、
            // "latest" を含むものを最優先にするロジックを組む。

            flashModels.sort((a, b) => {
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();

                // "latest" を優先
                if (nameA.includes('latest') && !nameB.includes('latest')) return -1;
                if (!nameA.includes('latest') && nameB.includes('latest')) return 1;

                // バージョン番号の比較 (単純な文字列降順)
                if (nameA > nameB) return -1;
                if (nameA < nameB) return 1;
                return 0;
            });

            const bestModel = flashModels[0].name;

            // キャッシュに保存
            chrome.storage.local.set({
                [cacheKey]: {
                    modelName: bestModel,
                    timestamp: Date.now()
                }
            });

            // console.log('Selected best flash model:', bestModel);
            return bestModel;

        } catch (error) {
            console.error('Error selecting model:', error);
            return 'models/gemini-1.5-flash'; // Safe Fallback
        }
    }

    /**
     * 画像を分析し、AI生成の兆候を検出します。
     * @param {string} apiKey - ユーザーが設定したGemini APIキー
     * @param {string} base64Image - 分析対象の画像データ (Base64形式、ヘッダーなし)
     * @param {string} mimeType - 画像のMIMEタイプ (例: 'image/jpeg')
     * @returns {Promise<string>} 分析結果のテキスト
     * @throws {Error} API呼び出しに失敗した場合、または分析不能な場合にエラーをスローします。
     */
    static async analyzeImage(apiKey, base64Image, mimeType) {
        // APIキーの簡易チェック
        if (!apiKey) {
            throw new Error('APIキーが設定されていません。設定画面から保存してください。');
        }

        // 動的にモデルを選択
        const modelName = await this.getBestFlashModel(apiKey);

        // エンドポイント構築
        // modelName には 'models/' プレフィックスが含まれている場合があるため調整
        const cleanModelName = modelName.startsWith('models/') ? modelName.slice(7) : modelName;
        const url = `${this.BASE_URL}/models/${cleanModelName}:generateContent?key=${apiKey}`;

        // リクエストボディの構築
        const requestBody = {
            contents: [{
                parts: [
                    { text: "この画像を分析し、AI生成の視覚的な証拠（不自然な照明、解剖学的な誤り、アーティファクトなど）があるか確認してください。簡潔に日本語で回答してください。\n出力フォーマット:\n【判定】(AIの可能性が高い / 自然な画像 / 不明)\n【理由】(具体的な理由)" },
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
                throw new Error(errorData.error?.message || `API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!analysisText) {
                throw new Error('AIからの応答が空でした。画像の内容を認識できなかった可能性があります。');
            }

            return analysisText;

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            throw error;
        }
    }
}
