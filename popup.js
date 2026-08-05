// Firefox compatibility
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  globalThis.chrome = browser;
}

const enabledToggle = document.getElementById("enabledToggle");
const downloadBtnToggle = document.getElementById("downloadBtnToggle");
const timestampsToggle = document.getElementById("timestampsToggle");
const blockedCountEl = document.getElementById("blockedCount");
const downloadCountEl = document.getElementById("downloadCount");
const resetBtn = document.getElementById("resetBtn");
const statusText = document.getElementById("statusText");
const versionEl = document.getElementById("version");

versionEl.textContent = "v" + chrome.runtime.getManifest().version;

function updateStatus(enabled) {
  document.body.classList.toggle("disabled", !enabled);
  statusText.textContent = enabled
    ? "Active — login walls are being removed"
    : "Paused — Instagram behaves normally";
}

chrome.storage.local.get(["enabled", "blockedCount", "downloadCount", "downloadBtn", "timestamps"], (data) => {
  const enabled = data.enabled !== false;
  enabledToggle.checked = enabled;
  downloadBtnToggle.checked = data.downloadBtn !== false;
  timestampsToggle.checked = data.timestamps !== false;
  blockedCountEl.textContent = data.blockedCount || 0;
  downloadCountEl.textContent = data.downloadCount || 0;
  updateStatus(enabled);
});

enabledToggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
  updateStatus(enabledToggle.checked);
});

downloadBtnToggle.addEventListener("change", () => {
  chrome.storage.local.set({ downloadBtn: downloadBtnToggle.checked });
});

timestampsToggle.addEventListener("change", () => {
  chrome.storage.local.set({ timestamps: timestampsToggle.checked });
});

resetBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "resetCount" }, () => {
    blockedCountEl.textContent = 0;
  });
  chrome.storage.local.set({ downloadCount: 0 });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedCount) {
    blockedCountEl.textContent = changes.blockedCount.newValue;
  }
  if (changes.downloadCount) {
    downloadCountEl.textContent = changes.downloadCount.newValue;
  }
  if (changes.enabled) {
    const enabled = changes.enabled.newValue !== false;
    enabledToggle.checked = enabled;
    updateStatus(enabled);
  }
});
