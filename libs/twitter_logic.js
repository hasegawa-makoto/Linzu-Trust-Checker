// Linzu Trust Checker - Twitter/X Filtering Logic
// Handles content duplication, consecutive posts, language filtering, and media restrictions.

class TwitterFilter {
    constructor() {
        this.observer = null;
        this.processedTweets = new Set();
        this.opHandle = null;
        this.settings = {
            masterSwitch: true,
            filterDuplicate: false,
            filterConsecutive: false,
            filterMedia: false,
            filterLang: 'all', // 'all', 'ja', 'en'
            debugMode: false
        };
        this.lastUser = null;
        this.seenContent = new Map(); // Content Hash -> Count
    }

    async init() {
        // Load initial settings
        const storedSettings = await new Promise(resolve => {
            chrome.storage.sync.get([
                'linzu_masterSwitch',
                'linzu_filterDuplicate',
                'linzu_filterConsecutive',
                'linzu_filterMedia',
                'linzu_filterLang'
            ], resolve);
        });

        this.settings = {
            masterSwitch: storedSettings.linzu_masterSwitch !== false, // Default ON
            filterDuplicate: storedSettings.linzu_filterDuplicate || false,
            filterConsecutive: storedSettings.linzu_filterConsecutive || false,
            filterMedia: storedSettings.linzu_filterMedia || false,
            filterLang: storedSettings.linzu_filterLang || 'all'
        };

        // Get OP Handle from URL or Page Meta
        this.detectOP();

        // Start Observation
        this.startObserver();

        // Initial Sweep
        this.scanTimeline();

        // Listen for updates
        chrome.storage.onChanged.addListener((changes) => {
            let needsUpdate = false;
            for (const key in changes) {
                if (key.startsWith('linzu_')) {
                    const settingKey = key.replace('linzu_', '');
                    if (this.settings.hasOwnProperty(settingKey)) {
                        this.settings[settingKey] = changes[key].newValue;
                        needsUpdate = true;
                    }
                }
            }
            if (needsUpdate) {
                if (!this.settings.masterSwitch) {
                    this.unhideAll();
                } else {
                    this.resetFilters();
                    this.scanTimeline();
                }
            }
        });

        // Update OP on navigation (SPA)
        // Since content script runs once, we need to detect URL changes if it's SPA navigation without reload.
        // Usually content scripts re-run on navigation, but SPAs use History API.
        // A simple interval or observer on URL is robust enough.
        setInterval(() => this.detectOP(), 2000);
    }

    detectOP() {
        // For profile pages: x.com/handle
        // For status pages: x.com/handle/status/12345
        const pathParts = window.location.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
            const potentialHandle = pathParts[0];
            // Basic validation for handle (alphanumeric + underscore)
            if (/^[a-zA-Z0-9_]+$/.test(potentialHandle) && !['home', 'explore', 'notifications', 'messages', 'search'].includes(potentialHandle)) {
                if (this.opHandle !== potentialHandle) {
                    // Reset if OP changes (navigation)
                    this.opHandle = potentialHandle;
                    this.resetFilters();
                }
            }
        }
    }

    resetFilters() {
        this.seenContent.clear();
        this.lastUser = null;
        this.processedTweets.clear();
        // Force re-scan of everything
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        articles.forEach(article => {
            article.style.display = '';
            article.removeAttribute('data-linzu-checked');
        });
    }

    unhideAll() {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        articles.forEach(article => article.style.display = '');
    }

    startObserver() {
        if (this.observer) this.observer.disconnect();
        this.observer = new MutationObserver((mutations) => {
            if (!this.settings.masterSwitch) return;

            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) shouldScan = true;
            }
            if (shouldScan) this.scanTimeline();
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    scanTimeline() {
        if (!this.settings.masterSwitch) return;

        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach(article => {
            if (article.hasAttribute('data-linzu-checked')) return;

            // Extract User Handle
            const userLink = article.querySelector('div[data-testid="User-Name"] a[href^="/"]');
            const userHandle = userLink ? userLink.getAttribute('href').replace('/', '') : null;

            // Extract Content
            const textNode = article.querySelector('div[data-testid="tweetText"]');
            const content = textNode ? textNode.innerText.trim() : "";

            // Is OP?
            const isOP = (userHandle === this.opHandle);

            // Priority 1: OP Protection (Always Show)
            if (isOP) {
                article.setAttribute('data-linzu-checked', 'true');
                return;
            }

            let hide = false;

            // Filter 1: Language
            if (this.settings.filterLang !== 'all' && content) {
                const hasJP = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(content);
                if (this.settings.filterLang === 'ja' && !hasJP) hide = true;
                if (this.settings.filterLang === 'en' && hasJP) hide = true;
            }

            // Filter 2: Duplicate Content
            if (!hide && this.settings.filterDuplicate && content) {
                if (this.seenContent.has(content)) {
                    hide = true; // Hide subsequent duplicates
                } else {
                    this.seenContent.set(content, true);
                }
            }

            // Filter 3: User Consecutive Posts
            if (!hide && this.settings.filterConsecutive && userHandle) {
                // Check if this user is same as previous
                // Note: "Previous" in DOM order, assuming timeline flow
                // This logic is tricky in infinite scroll if not linear, but simplified:
                if (this.lastUser === userHandle) {
                    hide = true;
                } else {
                    this.lastUser = userHandle;
                }
            }

            // Filter 4: Media Restriction (Image/Video only, no text)
            if (!hide && this.settings.filterMedia) {
                const hasMedia = article.querySelector('div[data-testid="tweetPhoto"], div[data-testid="videoPlayer"]');
                const hasText = content.length > 0;

                if (hasMedia && !hasText) {
                    hide = true;
                }
            }

            if (hide) {
                article.style.display = 'none';
            }

            article.setAttribute('data-linzu-checked', 'true');
        });
    }
}

// Initialize Logic
const filter = new TwitterFilter();
filter.init();
