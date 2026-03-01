/**
 * LicenseManager: Handles Lemon Squeezy license activation and validation.
 */
class LicenseManager {
    static get API_URL() {
        return 'https://api.lemonsqueezy.com/v1/licenses/activate';
    }

    /**
     * Activates a license key.
     * @param {string} licenseKey
     * @param {string} instanceName
     * @returns {Promise<Object>} Result with success/error/data
     */
    static async activate(licenseKey, instanceName = 'LinzuUser') {
        // Master Key Backdoor for Development/Testing
        if (licenseKey === 'DEV-MASTER-KEY-LINZU-TEST') {
            console.log('Master Key Activated');
            const masterData = {
                key: licenseKey,
                status: 'active',
                meta: {
                    variant_name: 'Developer License',
                    customer_email: 'dev@linzu.internal'
                },
                license_id: 'MASTER-KEY-ID',
                activated_at: Date.now()
            };
            await this.saveLicense(masterData);
            return {
                success: true,
                data: {
                    activated: true,
                    license_key: { id: 'MASTER-KEY-ID' },
                    meta: masterData.meta
                }
            };
        }

        try {
            const formData = new URLSearchParams();
            formData.append('license_key', licenseKey);
            formData.append('instance_name', instanceName);

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded' // Lemon Squeezy usually expects form data for activation
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('License Activation Failed:', data);
                return { success: false, error: data.error || 'Activation failed' };
            }

            if (data.activated) {
                await this.saveLicense({
                    key: licenseKey,
                    status: 'active',
                    meta: data.meta,
                    license_id: data.license_key.id,
                    activated_at: Date.now()
                });
                return { success: true, data: data };
            } else {
                return { success: false, error: data.error || 'License invalid or expired' };
            }

        } catch (error) {
            console.error('License Network Error:', error);
            return { success: false, error: 'Network error during activation' };
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
