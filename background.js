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
});

// Inject scroll guard into the page's MAIN world, bypassing CSP.
// This is the only reliable way to override window.scrollTo in the
// same JS context where Instagram's code runs.
function injectScrollGuardInMainWorld(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) return;

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: "MAIN",
    func: function () {
      if (window.__antiIgScrollGuard) return;
      window.__antiIgScrollGuard = true;

      var lockedY = -1, userY = 0, restoring = false;
      window.addEventListener('scroll', function () {
        if (restoring) return;
        userY = window.scrollY;
        if (userY > 50) lockedY = userY;
      }, { passive: true });

      var o1 = window.scrollTo.bind(window);
      window.scrollTo = function () {
        if (arguments.length >= 2 && arguments[1] === 0 && userY > 50) return;
        return o1.apply(window, arguments);
      };
      var o2 = window.scroll.bind(window);
      window.scroll = function () {
        if (arguments.length >= 2 && arguments[1] === 0 && userY > 50) return;
        return o2.apply(window, arguments);
      };

      // Override scrollTop setter on html element
      var html = document.documentElement;
      var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      if (desc && desc.set) {
        Object.defineProperty(html, 'scrollTop', {
          get: function () { return desc.get.call(this); },
          set: function (v) { if (v === 0 && userY > 50) return; desc.set.call(this, v); },
          configurable: true
        });
      }

      // Override scrollIntoView to block scrolling to top elements
      var osi = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function () {
        var r = this.getBoundingClientRect();
        if (r.top > -10 && r.top < 10 && userY > 50) return;
        return osi.apply(this, arguments);
      };

      // Override focus to prevent scroll-into-view on focus
      var ofn = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function () {
        var r = this.getBoundingClientRect();
        if (r.top > -10 && r.top < 10 && userY > 50) return;
        return ofn.apply(this, arguments);
      };

      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

      // rAF loop: continuously restore scroll if yanked to top
      function rafLock() {
        if (userY > 50 && window.scrollY < 10) {
          restoring = true;
          o1(0, lockedY > 0 ? lockedY : userY);
          setTimeout(function () { restoring = false; }, 50);
        }
        requestAnimationFrame(rafLock);
      }
      requestAnimationFrame(rafLock);
    }
  }).catch(function (e) {
    // Silently fail — content script rAF fallback will handle it
  });
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
