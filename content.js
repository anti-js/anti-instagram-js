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

  function removeLoginWall() {
    if (!enabled) return;

    let removed = false;

    // Find login wall dialogs (role="dialog" with aria-modal="true")
    const dialogs = document.querySelectorAll('div[role="dialog"][aria-modal="true"]');
    dialogs.forEach(d => {
      const text = d.textContent || "";
      // Check if this is a login wall by looking for login/signup keywords
      if (text.includes("Registrieren") || text.includes("Sign up") ||
          text.includes("Anmelden") || text.includes("Log in") ||
          text.includes("Registriere dich") || text.includes("Sieh dir") ||
          text.includes("Open Instagram") || text.includes("Instagram öffnen") ||
          text.includes("view this") || text.includes("ansehen") ||
          text.includes("full profile") || text.includes("vollständige Profil")) {
        // Remove the dialog's parent (the overlay container), not just the dialog
        // This removes both the dialog and its backdrop
        const parent = d.parentElement;
        if (parent && parent !== document.body) {
          parent.remove();
        } else {
          d.remove();
        }
        removed = true;
      }
    });

    // Remove dark backdrop divs (rgba(12, 16, 20, 0.7) — Instagram's overlay scrim)
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach(d => {
      const s = getComputedStyle(d);
      const bg = s.backgroundColor;
      if ((s.position === 'fixed' || s.position === 'absolute') &&
          s.pointerEvents !== 'none' &&
          d.children.length === 0 &&
          (bg.includes('rgba(12, 16, 20') || bg.includes('rgba(0, 0, 0, 0.8') ||
           bg.includes('rgba(0, 0, 0, 0.9') || bg.includes('rgba(38, 38, 38'))) {
        const rect = d.getBoundingClientRect();
        if (rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8) {
          d.remove();
          removed = true;
        }
      }
    });

    // Remove empty full-screen divs that intercept clicks (Instagram's invisible overlay)
    // These are empty divs with pointer-events:auto that cover the whole viewport
    allDivs.forEach(d => {
      if (d.children.length !== 0) return;
      const s = getComputedStyle(d);
      if (s.pointerEvents === 'none' || s.display === 'none' || s.visibility === 'hidden') return;
      const rect = d.getBoundingClientRect();
      if (rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8) {
        // Only remove if it has no visible content (no text, no images, no inputs)
        const hasContent = d.textContent.trim().length > 0 ||
                           d.querySelector('img, video, input, button, a, canvas, svg');
        if (!hasContent) {
          d.remove();
          removed = true;
        }
      }
    });

    // Unlock body scroll
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.style.position = "";
    document.body.style.height = "";

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

  // MutationObserver to catch login walls as they appear
  const observer = new MutationObserver(() => {
    removeLoginWall();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "role"],
  });

  // Also poll periodically for SPA navigations
  setInterval(() => {
    if (!enabled) return;
    if (!document.documentElement.hasAttribute("data-anti-ig")) {
      document.documentElement.setAttribute("data-anti-ig", "on");
    }
    removeLoginWall();
  }, 300);

  // Initial run
  removeLoginWall();
})();
