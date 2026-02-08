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

            // 2. Noise/Texture Analysis (Moved up for use in classification)
            const noiseAnalysis = this.analyzeNoise(imageData);

            // 1. Classification (Photo vs Illustration) - Now uses Noise
            const classification = this.classifyImage(imageData, noiseAnalysis);

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
     * Analyze local variance (smoothness/noise).
     * High Variance = Noisy (Photo-like)
     * Low Variance = Smooth (AI/Illustration-like)
     */
    static analyzeNoise(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        let totalVariance = 0;
        let count = 0;

        // Sample more densely (every 2nd pixel row/col)
        for (let y = 0; y < imageData.height - 1; y += 2) {
            for (let x = 0; x < width - 1; x += 2) {
                const i = (y * width + x) * 4;
                const r = data[i];

                // Compare with immediate neighbor for fine noise
                const iRight = i + 4;
                const rRight = data[iRight];

                totalVariance += Math.abs(r - rRight);
                count++;
            }
        }

        const avgVariance = totalVariance / count;
        return { avgVariance };
    }

    /**
     * Classify image based on color variance AND texture.
     */
    static classifyImage(imageData, noise) {
        const data = imageData.data;
        let colorSet = new Set();
        // Increased sampling rate: check every 100th pixel (optimization for speed vs accuracy)
        // Wait, requested "increase sampling". Let's do every 20th pixel to be safer but reasonably fast.
        const sampleRate = 20;

        for (let i = 0; i < data.length; i += 4 * sampleRate) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            // Quantize slightly
            const colorKey = `${Math.floor(r/10)},${Math.floor(g/10)},${Math.floor(b/10)}`;
            colorSet.add(colorKey);
        }

        const uniqueColors = colorSet.size;
        const totalPixels = data.length / 4;
        const sampledPixels = totalPixels / sampleRate;
        const colorRatio = uniqueColors / sampledPixels;

        // Classification Logic
        // Photos: High Color Variance AND High Texture Noise
        // Illustrations: Low Color Variance OR (High Color Variance but Low Noise -> Digital Art)

        let type = 'Unknown';

        if (colorRatio > 0.1) {
            // Many colors. Could be Photo or detailed AI/Art.
            // Use noise as discriminator.
            // Real photos typically have avgVariance > 5-10 depending on ISO.
            if (noise.avgVariance > 8) {
                type = 'Photo';
            } else {
                type = 'Illustration'; // Or "Digital Art" / "Smooth AI Photo"
            }
        } else {
            type = 'Illustration';
        }

        // Override: If variance is extremely high (>20), it's almost certainly a noisy photo.
        if (noise.avgVariance > 20) type = 'Photo';

        return { type, colorRatio };
    }

    /**
     * Simplified Error Level Analysis
     */
    static async performELA(originalCanvas, mimeType) {
        try {
            const compressedBlob = await originalCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
            const compressedBitmap = await createImageBitmap(compressedBlob);

            const diffCanvas = new OffscreenCanvas(originalCanvas.width, originalCanvas.height);
            const ctx = diffCanvas.getContext('2d');

            ctx.drawImage(originalCanvas, 0, 0);
            const originalData = ctx.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;

            ctx.drawImage(compressedBitmap, 0, 0);
            const compressedData = ctx.getImageData(0, 0, diffCanvas.width, diffCanvas.height).data;

            let totalDiff = 0;
            // Sampling for ELA
            for (let i = 0; i < originalData.length; i += 16) { // Every 4th pixel
                totalDiff += Math.abs(originalData[i] - compressedData[i]) +
                             Math.abs(originalData[i+1] - compressedData[i+1]) +
                             Math.abs(originalData[i+2] - compressedData[i+2]);
            }

            const avgDiff = totalDiff / (originalData.length / 16);
            compressedBitmap.close();
            return avgDiff;

        } catch (e) {
            return 0;
        }
    }

    /**
     * Calculate final heuristic score (0-100)
     * Must avoid 50.
     */
    static calculateForensicScore(cls, noise, ela) {
        let score = 55; // Base bias: slightly suspicious if nothing else known
        let reasons = [];

        // 1. Photo Analysis
        if (cls.type === 'Photo') {
            // High noise in Photo -> Likely Human (Camera Sensor)
            if (noise.avgVariance > 12) {
                score = 25; // Low AI probability
                reasons.push(`Detected sensor noise (Variance: ${noise.avgVariance.toFixed(1)}).`);
            }
            // Very smooth Photo -> Likely AI
            else if (noise.avgVariance < 6) {
                score = 75; // High AI probability
                reasons.push(`Unnaturally smooth texture for a photo (Variance: ${noise.avgVariance.toFixed(1)}).`);
            } else {
                score = 45; // Ambiguous Photo
                reasons.push('Photo texture is indeterminate.');
            }
        }
        // 2. Illustration Analysis
        else {
            // Illustrations are naturally smooth. Harder to judge.
            // Bias towards 45 (Human Art) or 65 (AI Art)?
            // AI Art often has inconsistent artifacts or specific smoothness.

            // If ELA is very low (uniform), might be AI.
            if (ela < 2) {
                score = 65;
                reasons.push('Compression analysis suggests synthetic generation.');
            } else {
                score = 35; // Likely Human Digital Art
                reasons.push('Texture consistent with digital illustration.');
            }
        }

        return { score, reasons };
    }
}
