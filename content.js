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

  let styleFixApplied = false;

  function removeLoginWall() {
    if (!enabled) return;

    let removed = false;

    // Step 1: Find and remove login wall dialogs (role="dialog" with aria-modal="true")
    const dialogs = document.querySelectorAll('div[role="dialog"][aria-modal="true"]');
    if (dialogs.length > 0) {
      dialogs.forEach(d => {
        const text = d.textContent || "";
        if (text.includes("Registrieren") || text.includes("Sign up") ||
            text.includes("Anmelden") || text.includes("Log in") ||
            text.includes("Registriere dich") || text.includes("Sieh dir") ||
            text.includes("Open Instagram") || text.includes("Instagram öffnen") ||
            text.includes("view this") || text.includes("ansehen") ||
            text.includes("full profile") || text.includes("vollständige Profil")) {
          const parent = d.parentElement;
          if (parent && parent !== document.body) {
            parent.remove();
          } else {
            d.remove();
          }
          removed = true;
        }
      });
    }

    // Step 2: Remove dark backdrop divs (rgba(12, 16, 20, 0.7) — Instagram's overlay scrim)
    // Instagram sets styles via CSS classes, not inline styles, so we must check computed styles
    // Scan top-level divs and their direct children only (not all divs) for performance
    const backdropCandidates = document.querySelectorAll('body > div, body > div > div, main > div');
    backdropCandidates.forEach(d => {
      if (d.children.length !== 0) return;
      const s = getComputedStyle(d);
      if (s.position !== 'fixed' && s.position !== 'absolute') return;
      if (s.pointerEvents === 'none' || s.display === 'none') return;
      const bg = s.backgroundColor;
      if (bg.includes('rgba(12, 16, 20') || bg.includes('rgba(0, 0, 0, 0.8') ||
          bg.includes('rgba(0, 0, 0, 0.9') || bg.includes('rgba(38, 38, 38') ||
          bg.includes('rgba(0,0,0,0.8') || bg.includes('rgba(0,0,0,0.9')) {
        const rect = d.getBoundingClientRect();
        if (rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8) {
          d.remove();
          removed = true;
        }
      }
    });

    // Step 3: Remove empty full-screen overlays that intercept clicks
    // Only scan direct children of body and main content containers — not all divs
    const topLevelDivs = document.querySelectorAll('body > div, body > div > div');
    topLevelDivs.forEach(d => {
      const s = getComputedStyle(d);
      if (s.pointerEvents === 'none' || s.display === 'none' || s.visibility === 'hidden') return;
      if (s.position !== 'fixed' && s.position !== 'absolute') return;
      const rect = d.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.8 || rect.height < window.innerHeight * 0.8) return;
      const hasContent = d.textContent.trim().length > 0 ||
                         d.querySelector('img, video, input, button, a, canvas, svg');
      if (!hasContent) {
        d.remove();
        removed = true;
      }
    });

    // Step 4: Fix fixed-height content containers — only once, not every poll
    if (!styleFixApplied || removed) {
      const mainContainer = document.querySelector('main')?.closest('div');
      if (mainContainer) {
        const s = getComputedStyle(mainContainer);
        if (s.position === 'fixed') {
          mainContainer.style.position = 'static';
          mainContainer.style.height = 'auto';
          mainContainer.style.overflow = 'visible';
          styleFixApplied = true;
        }
      }
      // Also check parent of main
      const mainParent = document.querySelector('main')?.parentElement;
      if (mainParent) {
        const s = getComputedStyle(mainParent);
        if (s.position === 'fixed') {
          mainParent.style.position = 'static';
          mainParent.style.height = 'auto';
          mainParent.style.overflow = 'visible';
          styleFixApplied = true;
        }
      }
    }

    // Step 5: Unlock body scroll — only if needed
    if (document.body.style.overflow !== '' || document.body.style.position !== '') {
      document.body.style.overflow = '';
      document.body.style.position = '';
    }

    if (removed) {
      incrementCounter();
    }

    return removed;
  }

  // Intercept clicks on post links and story buttons to navigate directly, bypassing Instagram's login wall trigger
  document.addEventListener('click', (e) => {
    if (!enabled) return;

    // Check for post links: /username/p/POSTID/ or /p/POSTID/
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

    // Check for story button clicks (div[role="button"] with aria-label containing "Story")
    const storyBtn = e.target.closest('[role="button"][aria-label*="Story"], [role="button"][aria-label*="story"]');
    if (storyBtn) {
      e.preventDefault();
      e.stopPropagation();
      // Extract username from the page URL
      const match = window.location.pathname.match(/^\/([^/]+)\/?$/);
      if (match) {
        const username = match[1];
        window.location.href = `/stories/${username}/`;
      }
      return;
    }
  }, true);

  // MutationObserver — only trigger on new dialog elements being added
  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    // Only react if a dialog was added or role attribute changed
    let shouldCheck = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && (node.getAttribute?.('role') === 'dialog' ||
              node.querySelector?.('[role="dialog"]'))) {
            shouldCheck = true;
            break;
          }
        }
      }
      if (m.type === 'attributes' && m.attributeName === 'role' &&
          m.target.getAttribute('role') === 'dialog') {
        shouldCheck = true;
      }
    }
    if (shouldCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(removeLoginWall, 50);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role"],
  });

  // Lighter polling — only check for dialogs, don't re-apply style fixes
  setInterval(() => {
    if (!enabled) return;
    if (!document.documentElement.hasAttribute("data-anti-ig")) {
      document.documentElement.setAttribute("data-anti-ig", "on");
    }
    // Only run full removal if a dialog exists
    if (document.querySelector('div[role="dialog"][aria-modal="true"]')) {
      removeLoginWall();
    }
  }, 500);

  // Initial run
  removeLoginWall();
})();
