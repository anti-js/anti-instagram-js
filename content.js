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
        removeLoginWall();
      } else {
        document.documentElement.removeAttribute("data-anti-ig");
      }
    }
  });

  function incrementCounter() {
    blockedCount++;
    chrome.storage.local.set({ blockedCount });
  }

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

    // 3) Neutralize empty full-screen click interceptors — disable pointer
    //    events instead of removing, so React never notices missing nodes
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

  // Clear any inline height cap (Instagram sets fixed pixel heights on
  // html/body which cut off content below the fold and lock scrolling)
  function unlockScroll() {
    if (!document.body) return;
    const body = document.body;
    const html = document.documentElement;
    if (body.style.overflow) body.style.overflow = "";
    if (body.style.position) body.style.position = "";
    if (body.style.height) body.style.height = "";
    if (body.style.minHeight) body.style.minHeight = "";
    if (body.style.maxHeight) body.style.maxHeight = "";
    if (html.style.overflow) html.style.overflow = "";
    if (html.style.height) html.style.height = "";
    if (html.style.minHeight) html.style.minHeight = "";
    if (html.style.maxHeight) html.style.maxHeight = "";
  }

  // Intercept clicks on post links and story buttons to navigate directly,
  // bypassing Instagram's login wall trigger
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

  // MutationObserver — react only when dialog/scrim nodes appear
  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    let shouldCheck = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.getAttribute?.('role') === 'dialog' ||
            node.classList?.contains('x1h0vfkc') ||
            node.querySelector?.('[role="dialog"], .x1h0vfkc')) {
          shouldCheck = true;
          break;
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
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Light polling as a safety net — always clear height caps, run full
  // removal only when a dialog or scrim is present
  setInterval(() => {
    if (!enabled) return;
    if (!document.documentElement.hasAttribute("data-anti-ig")) {
      document.documentElement.setAttribute("data-anti-ig", "on");
    }
    unlockScroll();
    if (document.querySelector('div[role="dialog"][aria-modal="true"], .x1h0vfkc')) {
      removeLoginWall();
    }
  }, 1000);

  // Initial run — wait until body exists (script runs at document_start)
  function init() {
    if (document.body) {
      removeLoginWall();
      startObserver();
    } else {
      setTimeout(init, 50);
    }
  }
  init();
})();
