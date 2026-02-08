/**
 * I18nManager: Handles dynamic language switching for the UI.
 * Bypasses chrome.i18n for UI text to allow user preference override without browser restart.
 */
class I18nManager {
    constructor() {
        this.messages = {};
        this.currentLang = 'en';
    }

    /**
     * Initializes the manager by loading the preferred language.
     * @returns {Promise<void>}
     */
    async init(forcedLang = null) {
        if (forcedLang) {
            this.currentLang = forcedLang;
        } else {
            // Fix: Use correct callback pattern for chrome.storage.sync.get
            // In verification script, it might fail if callback isn't handled or mocked perfectly.
            // But in real extension, get returns a promise in MV3 or accepts callback.
            // We'll use Promise wrapper to be safe and compatible with callback-based mock.
            const data = await new Promise(resolve => {
                chrome.storage.sync.get('outputLanguage', (items) => {
                    resolve(items || {});
                });
            });
            this.currentLang = data.outputLanguage || this.getBrowserLang();
        }

        await this.loadMessages(this.currentLang);
    }

    getBrowserLang() {
        const lang = navigator.language || navigator.userLanguage;
        return lang && lang.startsWith('ja') ? 'ja' : 'en';
    }

    /**
     * Loads the messages.json file for the specified language.
     */
    async loadMessages(lang) {
        try {
            const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const response = await fetch(url);
            this.messages = await response.json();
        } catch (e) {
            console.error('Failed to load locale:', lang, e);
            // Fallback to English
            if (lang !== 'en') {
                await this.loadMessages('en');
            }
        }
    }

    /**
     * Gets a message by key.
     * @param {string} key
     * @returns {string} The localized message or the key if missing.
     */
    getMessage(key) {
        if (this.messages[key]) {
            return this.messages[key].message;
        }
        // Fallback to chrome.i18n if not found (though manual fetch is preferred for consistency)
        if (chrome.i18n && chrome.i18n.getMessage) {
             return chrome.i18n.getMessage(key) || key;
        }
        return key;
    }

    /**
     * Localizes the entire page by searching for [data-i18n] attributes.
     */
    localizePage() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const msg = this.getMessage(key);

            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'placeholder')) {
                el.placeholder = msg;
            } else if (el.tagName === 'IMG' && el.hasAttribute('title')) {
                el.title = msg;
            } else {
                el.textContent = msg;
            }
        });

        // Also handle tooltips defined by title-i18n
        const tooltips = document.querySelectorAll('[data-i18n-title]');
        tooltips.forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.getMessage(key);
        });
    }
}

// Export
(typeof window !== 'undefined' ? window : self).I18nManager = I18nManager;
