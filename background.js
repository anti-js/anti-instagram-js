// Firefox compatibility
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  globalThis.chrome = browser;
}

// Background script — manages extension state and blocked counter
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "blockedCount"], (data) => {
    chrome.storage.local.set({
      enabled: data.enabled !== false,
      blockedCount: data.blockedCount || 0,
    });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "resetCount") {
    chrome.storage.local.set({ blockedCount: 0 }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (msg.action === "injectScrollGuard" && sender.tab) {
    injectScrollGuardInMainWorld(sender.tab.id);
  }
  if (msg.action === "downloadMedia") {
    chrome.downloads.download({
      url: msg.url,
      filename: msg.filename,
      saveAs: false,
    }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
});

// Inject scroll guard into the page's MAIN world, bypassing CSP.
// This is the only reliable way to override window.scrollTo in the
// same JS context where Instagram's code runs.
function injectScrollGuardInMainWorld(tabId) {
  const api = (typeof browser !== "undefined" ? browser.scripting : null) ||
              (typeof chrome !== "undefined" ? chrome.scripting : null);
  if (!api || !api.executeScript) return;

  const scrollGuardFunc = function () {
    if (window.__antiIgScrollGuard) return;
    window.__antiIgScrollGuard = true;

    var lockedY = -1, userY = 0, restoring = false;
    window.addEventListener('scroll', function () {
      if (restoring) return;
      userY = window.scrollY;
      if (userY > 50) lockedY = userY;
    }, { passive: true });

    // Check if a scrollTo/scroll call targets the top of the page.
    // Handles both positional form scrollTo(0, 0) and object form
    // scrollTo({ top: 0 }) — Instagram uses the object form in newer builds.
    function isScrollToTop(args) {
      if (args.length >= 2 && args[1] <= 10 && userY > 50) return true;
      if (args.length >= 1 && typeof args[0] === 'object' && args[0] !== null) {
        var top = args[0].top;
        if (top !== undefined && top <= 10 && userY > 50) return true;
      }
      return false;
    }

    var o1 = window.scrollTo.bind(window);
    window.scrollTo = function () {
      if (isScrollToTop(arguments)) return;
      return o1.apply(window, arguments);
    };
    var o2 = window.scroll.bind(window);
    window.scroll = function () {
      if (isScrollToTop(arguments)) return;
      return o2.apply(window, arguments);
    };

    // Guard scrollBy — block large upward scrolls that would reach the top
    var o3 = window.scrollBy.bind(window);
    window.scrollBy = function () {
      if (userY > 50) {
        if (arguments.length >= 2 && arguments[1] < 0) {
          if (userY + arguments[1] <= 10) return;
        }
        if (arguments.length >= 1 && typeof arguments[0] === 'object' && arguments[0] !== null) {
          var top = arguments[0].top;
          if (top !== undefined && top < 0 && userY + top <= 10) return;
        }
      }
      return o3.apply(window, arguments);
    };

    var html = document.documentElement;
    var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && desc.set) {
      try {
        Object.defineProperty(html, 'scrollTop', {
          get: function () { return desc.get.call(this); },
          set: function (v) { if (v <= 10 && userY > 50) return; desc.set.call(this, v); },
          configurable: true
        });
      } catch (e) {}
    }

    // Block scrollIntoView for elements at or above the viewport top.
    // When the user is scrolled down, elements at the top of the document
    // have negative r.top values — the old guard only checked -10..10,
    // missing elements far above the viewport.
    var osi = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      var r = this.getBoundingClientRect();
      if (r.top < 10 && userY > 50) return;
      return osi.apply(this, arguments);
    };

    // WebKit-specific: scrollIntoViewIfNeeded
    if (typeof Element.prototype.scrollIntoViewIfNeeded === 'function') {
      var osin = Element.prototype.scrollIntoViewIfNeeded;
      Element.prototype.scrollIntoViewIfNeeded = function () {
        var r = this.getBoundingClientRect();
        if (r.top < 10 && userY > 50) return;
        return osin.apply(this, arguments);
      };
    }

    // Block focus() on elements at or above the viewport top —
    // focus() scrolls the element into view by default.
    var ofn = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () {
      var r = this.getBoundingClientRect();
      if (r.top < 10 && userY > 50) return;
      return ofn.apply(this, arguments);
    };

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // rAF fallback: detect sudden jumps to top (programmatic scroll).
    // Use jump distance (prevY - scrollY) to distinguish user scrolling
    // from programmatic scroll-to-top. A user wheel tick moves ~50-100px
    // per frame; Instagram's programmatic scroll jumps 200+px to 0.
    var prevY = 0;
    function rafLock() {
      if (userY > 50 && window.scrollY < 10 && prevY - window.scrollY > 200 && !restoring) {
        restoring = true;
        o1(0, lockedY > 0 ? lockedY : userY);
        setTimeout(function () { restoring = false; }, 50);
      }
      prevY = window.scrollY;
      requestAnimationFrame(rafLock);
    }
    requestAnimationFrame(rafLock);
  };

  // Try with world: "MAIN" first (Chrome 111+, Firefox 128+)
  try {
    api.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: scrollGuardFunc
    }).catch(function () {
      // Fallback: try without world (runs in isolated world, less effective
      // but still provides rAF scroll restoration)
      try {
        api.executeScript({
          target: { tabId: tabId },
          func: scrollGuardFunc
        }).catch(function () {});
      } catch (e) {}
    });
  } catch (e) {
    // Synchronous fallback for older browsers
    try {
      api.executeScript({
        target: { tabId: tabId },
        func: scrollGuardFunc
      }, function () {});
    } catch (e2) {}
  }
}

// Also inject on tab update (SPA navigation within Instagram)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('instagram.com')) {
    chrome.storage.local.get(['enabled'], (data) => {
      if (data.enabled !== false) {
        injectScrollGuardInMainWorld(tabId);
      }
    });
  }
});
