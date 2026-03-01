/**
 * LicenseManager: Handles license activation and validation.
 */
class LicenseManager {
    /**
     * Activates a license key based on a hardcoded secret code for Stripe fulfillment.
     * @param {string} licenseKey
     * @returns {Promise<Object>} Result with success/error/data
     */
    static async activate(licenseKey) {
        const key = licenseKey ? licenseKey.trim() : '';

        // Master Key Backdoor or Valid Stripe Access Code
        if (key === 'DEV-MASTER-KEY-LINZU-TEST' || key === 'LINZU_PRO_ACCESS') {
            const licenseData = {
                key: key,
                status: 'active',
                activated_at: Date.now()
            };
            await this.saveLicense(licenseData);
            return {
                success: true,
                data: { activated: true }
            };
        } else {
            return { success: false, error: 'Invalid Code' }; // Error message is localized in UI
        }
    }

    /**
     * Validates the currently stored license status.
     * @returns {Promise<boolean>} True if valid
     */
    static async validate() {
        const license = await this.getLicense();
        if (!license || license.status !== 'active') {
            return false;
        }
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
