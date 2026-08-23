// popup.js — Manages toggle settings for Toystaller overlay visibility per section

const TOGGLE_KEYS = {
    toggleGrid:    'toystaller_show_grid',
    toggleFeed:    'toystaller_show_feed',
    toggleStories: 'toystaller_show_stories',
    toggleDM:      'toystaller_show_dm'
};

const DEFAULTS = {
    toystaller_show_grid:    true,
    toystaller_show_feed:    true,
    toystaller_show_stories: true,
    toystaller_show_dm:      true
};

// Load saved settings into checkboxes
chrome.storage.local.get(Object.values(TOGGLE_KEYS), (result) => {
    for (const [elemId, storageKey] of Object.entries(TOGGLE_KEYS)) {
        const el = document.getElementById(elemId);
        if (!el) continue;
        const val = result[storageKey];
        el.checked = (val === undefined || val === null) ? DEFAULTS[storageKey] : val;
    }
});

// Save on change and notify active Instagram tabs
for (const [elemId, storageKey] of Object.entries(TOGGLE_KEYS)) {
    const el = document.getElementById(elemId);
    if (!el) continue;

    el.addEventListener('change', () => {
        const obj = {};
        obj[storageKey] = el.checked;
        chrome.storage.local.set(obj, () => {
            // Notify all Instagram tabs to refresh overlay visibility
            chrome.tabs.query({ url: '*://*.instagram.com/*' }, (tabs) => {
                for (const tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'toystaller_settings_changed',
                        key: storageKey,
                        value: el.checked
                    }).catch(() => {});
                }
            });
        });
    });
}
