// Firefox compatibility
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  globalThis.chrome = browser;
}

const enabledToggle = document.getElementById("enabledToggle");
const blockedCountEl = document.getElementById("blockedCount");
const resetBtn = document.getElementById("resetBtn");

chrome.storage.local.get(["enabled", "blockedCount"], (data) => {
  enabledToggle.checked = data.enabled !== false;
  blockedCountEl.textContent = data.blockedCount || 0;
});

enabledToggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
});

resetBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "resetCount" }, () => {
    blockedCountEl.textContent = 0;
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedCount) {
    blockedCountEl.textContent = changes.blockedCount.newValue;
  }
});
