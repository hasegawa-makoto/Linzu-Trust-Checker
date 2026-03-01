/**
 * LicenseManager: Handles license activation and validation.
 */
class LicenseManager {
    /**
     * Activates a license key.
     * For now, this just saves the key locally without external validation.
     * @param {string} licenseKey
     * @returns {Promise<Object>} Result with success/error/data
     */
    static async activate(licenseKey) {
        // Master Key Backdoor for Development/Testing
        if (licenseKey === 'DEV-MASTER-KEY-LINZU-TEST') {
            console.log('Master Key Activated');
        }

        // Simplified logic: accept any non-empty key and save it as active.
        if (licenseKey && licenseKey.trim().length > 0) {
            const licenseData = {
                key: licenseKey,
                status: 'active',
                activated_at: Date.now()
            };
            await this.saveLicense(licenseData);
            return {
                success: true,
                data: { activated: true }
            };
        } else {
            return { success: false, error: 'License key cannot be empty' };
        }
    }

    /**
     * Validates the currently stored license.
     * For now, this checks local storage. Robust implementation might re-validate with API periodically.
     * @returns {Promise<boolean>} True if valid
     */
    static async validate() {
        const license = await this.getLicense();
        if (!license || !license.key) {
            return false;
        }
        // In a real app, check expiration date or re-validate against API here if needed.
        // For MVP, existence of activated key is enough.
        return true;
    }

    /**
     * Saves license info to storage.
     */
    static async saveLicense(data) {
        await new Promise(resolve => {
            chrome.storage.local.set({ 'linzu_license': data }, resolve);
        });
    }

    /**
     * Retrieves stored license info.
     */
    static async getLicense() {
        return new Promise(resolve => {
            chrome.storage.local.get('linzu_license', (items) => {
                resolve(items.linzu_license || null);
            });
        });
    }
}

// Export
(typeof window !== 'undefined' ? window : self).LicenseManager = LicenseManager;
