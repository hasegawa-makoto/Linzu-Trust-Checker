/**
 * Linzu Image Forensics Library
 * Provides advanced image analysis using Canvas API to detect potential AI generation.
 */
class ImageForensics {

    /**
     * Main analysis function
     * @param {Blob} imageBlob
     * @returns {Promise<Object>} Analysis results
     */
    static async analyze(imageBlob) {
        try {
            const bitmap = await createImageBitmap(imageBlob);
            const width = bitmap.width;
            const height = bitmap.height;

            // Create Canvas
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);

            const imageData = ctx.getImageData(0, 0, width, height);

            // 1. Classification (Photo vs Illustration)
            const classification = this.classifyImage(imageData);

            // 2. Noise/Texture Analysis
            const noiseAnalysis = this.analyzeNoise(imageData);

            // 3. ELA (Error Level Analysis)
            const elaScore = await this.performELA(canvas, imageBlob.type);

            bitmap.close();

            // Synthesis: Calculate AI Probability based on features
            const aiScore = this.calculateForensicScore(classification, noiseAnalysis, elaScore);

            return {
                success: true,
                type: classification.type, // 'Photo' or 'Illustration'
                details: {
                    classification: classification,
                    noise: noiseAnalysis,
                    ela: elaScore
                },
                forensicScore: aiScore.score,
                reasons: aiScore.reasons
            };

        } catch (e) {
            console.warn('Forensics failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Classify image based on color variance and edge density.
     */
    static classifyImage(imageData) {
        const data = imageData.data;
        let colorSet = new Set();
        // Sample pixels for performance
        const sampleRate = 10;

        for (let i = 0; i < data.length; i += 4 * sampleRate) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            // Quantize colors slightly to group similar ones
            const colorKey = `${Math.floor(r/10)},${Math.floor(g/10)},${Math.floor(b/10)}`;
            colorSet.add(colorKey);
        }

        const uniqueColors = colorSet.size;
        const totalPixels = data.length / 4;
        const sampledPixels = totalPixels / sampleRate;
        const colorRatio = uniqueColors / sampledPixels;

        // Simple Heuristic: High color variance -> Photo, Low -> Illustration
        // Photos usually have noise creating many unique colors.
        const type = colorRatio > 0.15 ? 'Photo' : 'Illustration';

        return { type, colorRatio };
    }

    /**
     * Analyze local variance (smoothness/noise).
     */
    static analyzeNoise(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        let totalVariance = 0;
        let count = 0;

        // Calculate variance of Laplacian (edge/noise detection)
        // Or simpler: difference between pixel and neighbors
        for (let y = 1; y < imageData.height - 1; y += 2) {
            for (let x = 1; x < width - 1; x += 2) {
                const i = (y * width + x) * 4;
                const r = data[i];

                // Compare with right neighbor
                const iRight = i + 4;
                const rRight = data[iRight];

                totalVariance += Math.abs(r - rRight);
                count++;
            }
        }

        const avgVariance = totalVariance / count;

        // AI images (especially photos) tend to be smoother (lower variance) than real camera photos (sensor noise).
        // Illustrations vary.
        return { avgVariance };
    }

    /**
     * Simplified Error Level Analysis
     * Re-compresses image and checks difference.
     */
    static async performELA(originalCanvas, mimeType) {
        try {
            // Compress heavily
            const compressedBlob = await originalCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
            const compressedBitmap = await createImageBitmap(compressedBlob);

            const diffCanvas = new OffscreenCanvas(originalCanvas.width, originalCanvas.height);
            const ctx = diffCanvas.getContext('2d');

            // Draw original
            ctx.drawImage(originalCanvas, 0, 0);
            const originalData = ctx.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;

            // Draw compressed
            ctx.drawImage(compressedBitmap, 0, 0);
            const compressedData = ctx.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;

            let totalDiff = 0;
            for (let i = 0; i < originalData.length; i += 4) {
                // Sum RGB differences
                totalDiff += Math.abs(originalData[i] - compressedData[i]) +
                             Math.abs(originalData[i+1] - compressedData[i+1]) +
                             Math.abs(originalData[i+2] - compressedData[i+2]);
            }

            const avgDiff = totalDiff / (originalData.length / 4);
            compressedBitmap.close();

            // Interpretation:
            // High difference usually means high frequency details (noise).
            // AI images often have uniform ELA or specific patterns.
            // This is a complex metric, using a simplified score here.
            return avgDiff;

        } catch (e) {
            return 0;
        }
    }

    /**
     * Calculate final heuristic score (0-100)
     */
    static calculateForensicScore(cls, noise, ela) {
        let score = 50; // Neutral start
        let reasons = [];

        // 1. Photo Analysis
        if (cls.type === 'Photo') {
            // Photos usually have high noise/variance due to sensor.
            // AI Photos are often cleaner/smoother.
            if (noise.avgVariance < 5) {
                score += 20;
                reasons.push('Texture is unnaturally smooth (AI typical).');
            } else if (noise.avgVariance > 15) {
                score -= 20;
                reasons.push('Natural sensor noise detected.');
            }

            // ELA for Photos:
            // AI might handle compression differently, but simplified:
            // Very low ELA diff might indicate synthetic smoothness.
            if (ela < 2) {
                score += 10;
            }
        }
        // 2. Illustration Analysis
        else {
            // AI Illustrations often have "melted" details but high local contrast.
            // Harder to judge purely on variance without complex edge tracking.
            // We rely more heavily on metadata for illustrations, but:
            if (noise.avgVariance < 2) {
                score += 10; // Very flat vector-like, could be SVG or AI vector style.
            }
        }

        return { score, reasons };
    }
}
