/* Firefox compatibility */
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  globalThis.chrome = browser;
}

(function () {
  "use strict";

  let enabled = true;
  let blockedCount = 0;

  chrome.storage.local.get(["enabled", "blockedCount"], (data) => {
    enabled = data.enabled !== false;
    blockedCount = data.blockedCount || 0;
    if (enabled) {
      document.documentElement.setAttribute("data-anti-ig", "on");
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue;
      if (enabled) {
        document.documentElement.setAttribute("data-anti-ig", "on");
        injectPageStyle();
        removeLoginWall();
      } else {
        document.documentElement.removeAttribute("data-anti-ig");
        const s = document.getElementById("anti-ig-style");
        if (s) s.remove();
      }
    }
  });

  function incrementCounter() {
    blockedCount++;
    chrome.storage.local.set({ blockedCount });
  }

  // ─── Inject CSS directly into the page DOM ─────────────────────────────
  // This survives React re-renders and works identically in Firefox & Chrome.
  // Extension-injected stylesheets (content_scripts.css) can be overridden by
  // inline !important styles; a <style> element in the DOM is more durable.
  function injectPageStyle() {
    if (document.getElementById("anti-ig-style")) return;
    const s = document.createElement("style");
    s.id = "anti-ig-style";
    s.textContent = `
      html[data-anti-ig="on"] {
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: auto !important;
      }
      html[data-anti-ig="on"] body {
        overflow: visible !important;
        position: static !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }
      html[data-anti-ig="on"] body > div[id^="mount_"],
      html[data-anti-ig="on"] body > div[id^="mount_"] > div,
      html[data-anti-ig="on"] body > div[id^="mount_"] > div > div,
      html[data-anti-ig="on"] body > div[id^="mount_"] > div > div > div,
      html[data-anti-ig="on"] body > div[id^="mount_"] > div > div > div > div,
      html[data-anti-ig="on"] body > div[id^="mount_"] > div > div > div > div > div,
      html[data-anti-ig="on"] body > div[id^="mount_"] > div > div > div > div > div > div {
        position: static !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      html[data-anti-ig="on"] div[role="dialog"][aria-modal="true"] {
        display: none !important;
      }
      html[data-anti-ig="on"] .x1h0vfkc {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ─── Login wall removal ────────────────────────────────────────────────
  const LOGIN_KEYWORDS = [
    "Registrieren", "Sign up", "Anmelden", "Log in",
    "Registriere dich", "Sieh dir", "Open Instagram",
    "Instagram öffnen", "view this", "ansehen",
    "full profile", "vollständige Profil", "Melde dich an"
  ];

  function isLoginWall(el) {
    const text = el.textContent || "";
    return LOGIN_KEYWORDS.some(k => text.includes(k));
  }

  function hideElement(el) {
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function removeLoginWall() {
    if (!enabled || !document.body) return;

    let blocked = false;

    // 1) Hide login wall dialogs and their wrapper containers
    document.querySelectorAll('div[role="dialog"][aria-modal="true"]').forEach(d => {
      if (isLoginWall(d)) {
        const wrapper = d.parentElement && d.parentElement !== document.body
          ? d.parentElement
          : d;
        hideElement(wrapper);
        blocked = true;
      }
    });

    // 2) Hide dark scrims (Instagram's class for the modal backdrop)
    document.querySelectorAll('.x1h0vfkc').forEach(d => {
      hideElement(d);
      blocked = true;
    });

    // 3) Neutralize empty full-screen click interceptors
    document.querySelectorAll('.x1qjc9v5, .x1ey2m1c').forEach(d => {
      if (d.textContent.trim() === "" &&
          !d.querySelector('img, video, input, button, a, canvas, svg')) {
        d.style.setProperty("pointer-events", "none", "important");
      }
    });

    unlockScroll();

    if (blocked) {
      incrementCounter();
    }
  }

  // ─── Scroll unlock ─────────────────────────────────────────────────────
  // Strip inline styles that Instagram's JS sets on body/html to lock scroll.
  function unlockScroll() {
    if (!document.body) return;
    const body = document.body;
    const html = document.documentElement;
    // Remove the entire style attribute if it contains height/overflow locks
    if (body.hasAttribute('style')) {
      const bs = body.getAttribute('style');
      if (bs.includes('overflow') || bs.includes('height') || bs.includes('position')) {
        body.removeAttribute('style');
      }
    }
    if (html.hasAttribute('style')) {
      const hs = html.getAttribute('style');
      if (hs.includes('overflow') || hs.includes('height')) {
        html.removeAttribute('style');
      }
    }
  }

  // ─── Guard window.scrollTo to prevent Instagram from pulling user back ─
  // Instagram's React components sometimes call scrollTo(0, 0) on re-render,
  // which yanks the user back to the top. We allow user-initiated scrolls
  // but block programmatic ones that target y=0 when the user has scrolled.
  let userScrollY = 0;
  window.addEventListener('scroll', () => {
    userScrollY = window.scrollY;
  }, { passive: true });

  const origScrollTo = window.scrollTo.bind(window);
  window.scrollTo = function(...args) {
    // Block scrollTo(0, 0) if user has scrolled down
    if (enabled && args.length >= 2 && args[1] === 0 && userScrollY > 100) {
      return;
    }
    return origScrollTo(...args);
  };

  // ─── Click interception for posts and stories ──────────────────────────
  document.addEventListener('click', (e) => {
    if (!enabled) return;

    const link = e.target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (href.match(/^\/[^/]+\/p\//) || href.match(/^\/p\//)) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = href;
        return;
      }
    }

    const storyBtn = e.target.closest('[role="button"][aria-label*="Story"], [role="button"][aria-label*="story"]');
    if (storyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const match = window.location.pathname.match(/^\/([^/]+)\/?$/);
      if (match) {
        window.location.href = `/stories/${match[1]}/`;
      }
    }
  }, true);

  // ─── MutationObserver: dialog/scrim appearance + style attribute guard ─
  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    let shouldCheck = false;
    for (const m of mutations) {
      // Strip style attribute changes on body/html (Instagram re-applies
      // height:100% and overflow:hidden via inline styles)
      if (m.type === 'attributes' && m.attributeName === 'style') {
        if (m.target === document.body || m.target === document.documentElement) {
          unlockScroll();
        }
      }
      // Check for new dialog/scrim nodes
      if (m.addedNodes) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.getAttribute?.('role') === 'dialog' ||
              node.classList?.contains('x1h0vfkc') ||
              node.querySelector?.('[role="dialog"], .x1h0vfkc')) {
            shouldCheck = true;
            break;
          }
        }
      }
      if (shouldCheck) break;
    }
    if (shouldCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(removeLoginWall, 50);
    }
  });

  function startObserver() {
    if (!document.body) {
      setTimeout(startObserver, 50);
      return;
    }
    // Observe body for child changes AND style attribute changes on body/html
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "role"]
    });
    // Also observe html for style changes
    const htmlObs = new MutationObserver(() => {
      if (enabled) unlockScroll();
    });
    htmlObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"]
    });
  }

  // ─── Light polling as a safety net ─────────────────────────────────────
  setInterval(() => {
    if (!enabled) return;
    if (!document.documentElement.hasAttribute("data-anti-ig")) {
      document.documentElement.setAttribute("data-anti-ig", "on");
    }
    injectPageStyle();
    unlockScroll();
    if (document.querySelector('div[role="dialog"][aria-modal="true"], .x1h0vfkc')) {
      removeLoginWall();
    }
  }, 1000);

  // ─── Initial run — wait until body exists (script runs at document_start)
  function init() {
    if (document.body) {
      injectPageStyle();
      removeLoginWall();
      startObserver();
    } else {
      setTimeout(init, 50);
    }
  }
  init();
})();
