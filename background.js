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
});
