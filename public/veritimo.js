/**
 * Veritimo — Theme Runtime JS
 * Handles dark mode toggle, OS preference sync, and MeshCentral core dark mode bidirectional sync
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'veritimo-theme';
    var MC_DARKMODE_KEY = 'darkmode';   // MeshCentral core uses localStorage['darkmode'] = 'yes' or ''
    var htmlEl = document.documentElement;

    /**
     * Read MeshCentral core's dark mode preference, then fall back to ours.
     * Priority: MC core key > our stored pref > OS system preference
     */
    function resolveTheme() {
        // 1. Check MeshCentral core preference first
        var mcDark = localStorage.getItem(MC_DARKMODE_KEY);
        if (mcDark === 'yes') return 'dark';
        if (mcDark === '' || mcDark === 'no') return 'light';

        // 2. Fall back to our own stored preference
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;

        // 3. Follow OS
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
            ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        htmlEl.setAttribute('data-theme', theme);
        // Keep our key in sync
        localStorage.setItem(STORAGE_KEY, theme);
        // Keep MeshCentral core key in sync so core pages follow suit
        localStorage.setItem(MC_DARKMODE_KEY, theme === 'dark' ? 'yes' : '');

        var btn = document.getElementById('vt-darkmode-btn');
        if (btn) {
            btn.title = (theme === 'dark') ? 'Switch to Light Mode' : 'Switch to Dark Mode';
            btn.innerHTML = (theme === 'dark') ? '&#9728;' : '&#9790;';
        }
    }

    function toggleTheme() {
        var current = htmlEl.getAttribute('data-theme') || resolveTheme();
        applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    function injectToggleButton() {
        if (document.getElementById('vt-darkmode-btn')) return;
        var show = localStorage.getItem('veritimo-floatbtn');
        if (show === 'false') return;  // user disabled the floating button
        var btn = document.createElement('div');
        btn.id = 'vt-darkmode-btn';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.onclick = toggleTheme;
        document.body.appendChild(btn);
        // Set icon after injection
        applyTheme(htmlEl.getAttribute('data-theme') || resolveTheme());
    }

    // Apply theme immediately (before paint) to avoid flash
    applyTheme(resolveTheme());

    // Watch MeshCentral's key for changes made from another tab / MC settings page
    window.addEventListener('storage', function (e) {
        if (e.key === MC_DARKMODE_KEY) {
            var theme = (e.newValue === 'yes') ? 'dark' : 'light';
            applyTheme(theme);
        }
        if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
            applyTheme(e.newValue);
        }
    });

    // Watch OS preference changes (only if no manual preference set)
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            var mc = localStorage.getItem(MC_DARKMODE_KEY);
            var vt = localStorage.getItem(STORAGE_KEY);
            // Only auto-switch if neither MC nor Veritimo has a manual stored preference
            if (mc === null && vt === null) applyTheme(e.matches ? 'dark' : 'light');
        });
    }

    // Inject toggle button once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggleButton);
    } else {
        injectToggleButton();
    }

    // Expose globally so the plugin iframe/settings tab can also call them
    window.veritimoToggle = toggleTheme;
    window.veritimoApplyTheme = applyTheme;
    window.veritimoResolveTheme = resolveTheme;
}());
