// Gemini API Client for Linzu Trust Checker
// このクライアントは、Google Gemini APIを使用して画像のAI生成アーティファクトを分析します。
// 使用モデル: gemini-1.5-flash
// エンドポイント: v1 (安定版)

class GeminiClient {
    /**
     * Gemini APIのエンドポイント設定
     * 将来的にAPIバージョンが変更された場合は、ここを更新してください。
     * 安定版の v1 エンドポイントを使用します。
     */
    static get API_ENDPOINT() {
        return 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
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

        const url = `${this.API_ENDPOINT}?key=${apiKey}`;

        // リクエストボディの構築
        // プロンプトは日本語で回答を求め、簡潔なフォーマットを指定しています。
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
                // ユーザー向けの一般的なエラーメッセージに変換
                // 詳細なエラー内容はコンソールに残しつつ、UIには親切なメッセージを返す
                throw new Error(errorData.error?.message || `API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // レスポンスの解析
            // candidates配列が存在し、contentが含まれているかを確認
            const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!analysisText) {
                throw new Error('AIからの応答が空でした。画像の内容を認識できなかった可能性があります。');
            }

            return analysisText;

        } catch (error) {
            console.error('Gemini Analysis Failed:', error);
            // 呼び出し元（UI層）でキャッチして表示するためのエラーを再スロー
            throw error;
        }
    }
}
