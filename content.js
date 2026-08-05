/* Firefox compatibility */
if (typeof chrome === "undefined" && typeof browser !== "undefined") {
  globalThis.chrome = browser;
}

(function () {
  "use strict";

  let enabled = true;
  let blockedCount = 0;
  let downloadBtnEnabled = true;
  let timestampsEnabled = true;
  let downloadCount = 0;

  chrome.storage.local.get(["enabled", "blockedCount", "downloadBtn", "timestamps", "downloadCount"], (data) => {
    enabled = data.enabled !== false;
    blockedCount = data.blockedCount || 0;
    downloadBtnEnabled = data.downloadBtn !== false;
    timestampsEnabled = data.timestamps !== false;
    downloadCount = data.downloadCount || 0;
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
        removeDlBtn();
        stripTimestampEnhancements();
      }
    }
    if (changes.downloadBtn) {
      downloadBtnEnabled = changes.downloadBtn.newValue !== false;
      if (!downloadBtnEnabled) removeDlBtn();
    }
    if (changes.timestamps) {
      timestampsEnabled = changes.timestamps.newValue !== false;
      if (!timestampsEnabled) stripTimestampEnhancements();
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
      html[data-anti-ig="on"] .x1qjc9v5.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k {
        pointer-events: none !important;
      }
      html[data-anti-ig="on"] .x1uvtmcs {
        pointer-events: none !important;
      }
      html[data-anti-ig="on"] .xg6iff7.xippug5 {
        pointer-events: none !important;
      }
      /* Re-enable pointer-events on interactive elements even if a
         parent overlay has pointer-events: none. Login wall dialogs
         are already display:none so their buttons can't be clicked. */
      html[data-anti-ig="on"] a[href],
      html[data-anti-ig="on"] button,
      html[data-anti-ig="on"] [role="button"],
      html[data-anti-ig="on"] [role="link"],
      html[data-anti-ig="on"] input,
      html[data-anti-ig="on"] select,
      html[data-anti-ig="on"] textarea,
      html[data-anti-ig="on"] [role="slider"],
      html[data-anti-ig="on"] [role="tab"] {
        pointer-events: auto !important;
      }
      #anti-ig-dl-btn {
        position: fixed !important;
        z-index: 99999 !important;
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        background: rgba(0, 0, 0, 0.55) !important;
        color: #fff !important;
        /* No !important on display — inline display:none must be able to
           hide the button (media scrolled away / feature toggled off). */
        display: flex;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
        transition: opacity 0.2s, transform 0.2s, background 0.2s !important;
        user-select: none !important;
      }
      #anti-ig-dl-btn:hover {
        transform: scale(1.1) !important;
        background: rgba(0, 149, 246, 0.85) !important;
      }
      @keyframes anti-ig-spin {
        to { transform: rotate(360deg); }
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
    if (!el || !el.style) return;
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

    // 2b) Hide any fixed/absolute overlay div that contains login wall text.
    //     This catches login walls that aren't role="dialog" elements —
    //     Instagram uses different overlay patterns on post pages (fixed
    //     div with z-index:20 nested inside <main>, no role, no #scrollview).
    //     IMPORTANT: Skip divs that contain real content (main, article,
    //     post links, images) — the #scrollview content container has
    //     position:fixed and includes nav bar "Anmelden"/"Registrieren"
    //     text, but hiding it would hide the entire page content.
    document.querySelectorAll('div').forEach(d => {
      const style = window.getComputedStyle(d);
      if (style.position !== 'fixed' && style.position !== 'absolute') return;
      if (style.display === 'none') return;
      const rect = d.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.5 || rect.height < 200) return;
      // Skip divs that contain real content — they're not pure overlays.
      // Use strong indicators (main, article, video) — NOT img or post
      // links, because login wall overlays contain a profile pic <img>
      // and an intent:// link with /p/ in the URL.
      if (d.querySelector('main, article, video')) return;
      if (isLoginWall(d)) {
        hideElement(d);
        blocked = true;
      }
    });

    // 3) Neutralize specific click interceptors by class name only.
    //    Do NOT broadly scan all divs — that blocks the main content container.
    document.querySelectorAll('.x1qjc9v5.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k, .x1uvtmcs, .xg6iff7.xippug5').forEach(d => {
      if (d && d.style) d.style.setProperty("pointer-events", "none", "important");
    });
    // Re-enable pointer-events on #scrollview content container.
    // There are TWO #scrollview divs — one contains the page content,
    // the other is an overlay. The content one has real interactive
    // elements or media; the overlay one doesn't.
    // We only disable the overlay container itself — NOT its children.
    // pointer-events:none on the container makes it transparent to
    // clicks so they pass through to content below.
    document.querySelectorAll('#scrollview').forEach(sv => {
      if (sv.querySelector('a[href], button, [role="button"], [role="link"], img, video, main, article')) {
        sv.style.setProperty("pointer-events", "auto", "important");
      } else {
        sv.style.setProperty("pointer-events", "none", "important");
      }
    });
    // Also disable overlay divs that are OUTSIDE #scrollview —
    // Instagram adds separate overlay layers (x1n2onr6.xzkaem6 chain)
    // that cover the viewport and intercept clicks on lower posts.
    // We only disable the overlay div itself — NOT its children.
    // pointer-events:none makes the div transparent to clicks so they
    // pass through to content below. Disabling children breaks real
    // content that might be nested inside.
    if (document.body) {
      document.body.querySelectorAll(':scope > div, :scope > div > div').forEach(d => {
        if (d.closest('#scrollview')) return;
        if (d.id && d.id.startsWith('mount_')) return;
        const rect = d.getBoundingClientRect();
        if (rect.width < window.innerWidth * 0.5 || rect.height < 200) return;
        // If the div is a login wall, hide it even if it contains buttons
        // (the buttons are login wall buttons like "Schließen", "Registrieren").
        // But skip divs that contain real content (main, article, video) —
        // those are content containers with nav bar login text, not overlays.
        if (d.querySelector('main, article, video')) return;
        if (isLoginWall(d)) {
          hideElement(d);
          blocked = true;
          return;
        }
        if (d.querySelector('a[href], button, [role="button"], [role="link"], img, video, main, nav, [role="navigation"], [role="main"]')) return;
        d.style.setProperty("pointer-events", "none", "important");
      });
    }

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

  // ─── Inject scroll guard into PAGE'S MAIN WORLD ────────────────────────
  // Content scripts run in an isolated world — we can't override
  // window.scrollTo here. Instagram's CSP blocks inline <script> and
  // blob: scripts. The only way is chrome.scripting.executeScript with
  // world:"MAIN" from the background script, which bypasses CSP.
  function injectScrollGuard() {
    // Send message to background script to inject in MAIN world
    try {
      chrome.runtime.sendMessage({ action: "injectScrollGuard" });
    } catch (e) {
      // Extension context invalidated (extension was reloaded)
      // Content-script rAF fallback will handle scroll restoration
    }
  }

  // ─── Content-script fallback: rAF scroll lock + event-based restore ────
  // Runs in the content script's isolated world as a fallback in case
  // the page-world <script> injection is blocked by CSP.
  // Uses jump distance (prevScrollY - y) to distinguish user-initiated
  // scroll-to-top from Instagram's sudden programmatic scroll-to-top:
  // if scrollY jumps 200+px to <=10 in a single frame, it's programmatic.
  let lastGoodScrollY = 0;
  let prevScrollY = 0;
  let restoringScroll = false;
  window.addEventListener('scroll', () => {
    if (restoringScroll) return;
    if (window.scrollY > 50) {
      lastGoodScrollY = window.scrollY;
    }
  }, { passive: true });

  // rAF-based fallback: check every frame if scroll was yanked to top.
  // Use jump distance (prevScrollY - y) to distinguish user scrolling
  // from programmatic scroll-to-top. A user wheel tick moves ~50-100px
  // per frame; Instagram's programmatic scroll jumps 200+px to 0.
  function rafFallback() {
    if (enabled && !restoringScroll) {
      const y = window.scrollY;
      if (y <= 10 && lastGoodScrollY > 50 && prevScrollY - y > 200) {
        restoringScroll = true;
        window.scrollTo(0, lastGoodScrollY);
        setTimeout(() => { restoringScroll = false; }, 150);
      }
      prevScrollY = y;
    }
    requestAnimationFrame(rafFallback);
  }
  requestAnimationFrame(rafFallback);

  // ─── Click interception for posts and stories ───────────────────────
  // Only intercept clicks on post links and story buttons to navigate
  // directly, bypassing Instagram's login-wall interceptors.
  // Do NOT intercept all div clicks — that breaks normal page interaction.
  document.addEventListener('click', (e) => {
    if (!enabled) return;

    const link = e.target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      // Post links: /username/p/XXX/ or /p/XXX/
      if (href.match(/^\/[^/]+\/p\//) || href.match(/^\/p\//)) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = href;
        return;
      }
      // Profile links: /username/ — Instagram intercepts these to show
      // a login wall. Navigate directly to bypass it.
      // Exclude non-profile paths that also have a single segment.
      const SPECIAL_PATHS = /^(accounts|explore|direct|stories|reel|reels|tags|about|developer|legal|help|press|api|graphql|notifications|settings|emails|oauth|data|business|creator|community|directory|web|p|videos)\b/;
      const profileMatch = href.match(/^\/([^/]+)\/?$/);
      if (profileMatch && !SPECIAL_PATHS.test(profileMatch[1])) {
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
        if ((m.target === document.body && document.body) || m.target === document.documentElement) {
          unlockScroll();
        }
      }
      // Check for new dialog/scrim/login-wall nodes
      if (m.addedNodes) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.getAttribute?.('role') === 'dialog' ||
              node.classList?.contains('x1h0vfkc') ||
              node.classList?.contains('xzkaem6') ||
              node.querySelector?.('[role="dialog"], .x1h0vfkc, .xzkaem6') ||
              isLoginWall(node)) {
            shouldCheck = true;
            break;
          }
        }
      }
      // Also check for media changes (carousel navigation, new post content)
      if (!shouldCheck && m.addedNodes) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'IMG' || node.tagName === 'VIDEO' ||
              node.querySelector?.('img, video, article')) {
            shouldCheck = true;
            break;
          }
        }
      }
      if (shouldCheck) break;
    }
    if (shouldCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        removeLoginWall();
        updateDlBtn();
      }, 50);
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
    injectScrollGuard();
    unlockScroll();
    setupProfilePicDownload();
    if (document.querySelector('div[role="dialog"][aria-modal="true"], .x1h0vfkc')) {
      removeLoginWall();
    }
    updateDlBtn();
  }, 1000);

  // ─── Media download button ────────────────────────────────────────────
  // The button is position:fixed on document.body (NOT inside the media
  // container) so it survives Instagram's DOM re-renders. Its position
  // is calculated from the media container's bounding rect and updated
  // on scroll, resize, and via the polling interval.
  let dlBtn = null;
  let dlBusy = false;
  let activeRecording = null; // { stop() } while a video recording is running

  function incrementDownloadCount() {
    downloadCount++;
    chrome.storage.local.set({ downloadCount });
  }

  function isPostPage() {
    const p = window.location.pathname;
    return /\/p\//.test(p) || /\/reel\//.test(p) || /\/reels\//.test(p);
  }

  function getPostId() {
    const m = window.location.pathname.match(/\/(p|reel|reels)\/([^/]+)/);
    return m ? m[2] : 'post';
  }

  // Profile pages are a single non-reserved path segment ("/<username>").
  function isProfilePage() {
    if (isPostPage()) return false;
    const seg = window.location.pathname.split('/').filter(Boolean);
    if (seg.length !== 1) return false;
    const reserved = ['explore', 'accounts', 'direct', 'stories', 'about', 'developer', 'legal'];
    return !reserved.includes(seg[0]);
  }

  // Track the last media element we attached to so the button doesn't
  // jump between candidates (e.g. suggested-post thumbnails) on scroll.
  let lastMediaEl = null;

  // The actually-visible rect of an element: its bounding rect intersected
  // with every clipping ancestor (overflow != visible) and the viewport.
  // getBoundingClientRect alone ignores overflow clipping, which is why
  // carousel slides hidden outside the overflow:hidden frame still report a
  // large "visible" area — the button then lands on a clipped-off photo,
  // fully outside the picture to the left/right.
  function visibleRectOf(el) {
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    let cur = el.parentElement;
    while (cur && cur !== document.documentElement) {
      const style = window.getComputedStyle(cur);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const cr = cur.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, cr.left);
          right = Math.min(right, cr.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, cr.top);
          bottom = Math.min(bottom, cr.bottom);
        }
      }
      cur = cur.parentElement;
    }
    left = Math.max(left, 0);
    top = Math.max(top, 0);
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);
    return {
      left, top, right, bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  }

  function visibleAreaOf(el) {
    const r = visibleRectOf(el);
    return r.width * r.height;
  }

  // Suggested/related post thumbnails are always wrapped in a link to a
  // DIFFERENT post (/p/... or /reel/...). The current post's media never
  // is. This is how we keep the button glued to the viewed post only.
  function isSuggestedMedia(el) {
    const link = el.closest('a[href]');
    if (!link) return false;
    const m = (link.getAttribute('href') || '').match(/\/(p|reel|reels)\/([^/]+)/);
    return !!m && m[2] !== getPostId();
  }

  // Find the main visible media element and its container on a post page.
  function findMainMedia() {
    // Prefer the post <article> so suggested-post/related images elsewhere
    // in <main> can't win the "largest visible image" contest.
    const scope = document.querySelector('article') ||
      document.querySelector('main, [role="main"]') || document;
    const candidates = scope.querySelectorAll('img');
    let bestImg = null;
    let bestVisibleArea = 0;
    candidates.forEach(img => {
      const rect = img.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) return;
      if (isSuggestedMedia(img)) return;
      const style = window.getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const visibleArea = visibleAreaOf(img);
      if (visibleArea > bestVisibleArea) {
        bestVisibleArea = visibleArea;
        bestImg = img;
      }
    });

    // Pick the video with the largest actually-visible area — the first
    // <video> in the DOM may be a clipped-off carousel slide.
    let video = null;
    let bestVideoArea = 0;
    scope.querySelectorAll('video').forEach(v => {
      const rect = v.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) return;
      if (isSuggestedMedia(v)) return;
      const a = visibleAreaOf(v);
      if (a > bestVideoArea) { bestVideoArea = a; video = v; }
    });
    if (!video) {
      const fallback = document.querySelector('main video, [role="main"] video');
      if (fallback && !isSuggestedMedia(fallback)) video = fallback;
    }

    // Sticky selection: if the previously tracked media is still in the DOM
    // and meaningfully visible (clip-aware — a carousel slide that slid out
    // of the overflow:hidden frame does NOT count), keep it instead of
    // jumping to another candidate.
    const lastVisible = lastMediaEl && lastMediaEl.isConnected &&
      !isSuggestedMedia(lastMediaEl)
      ? visibleRectOf(lastMediaEl) : null;
    if (!(lastVisible && lastVisible.width >= 100 && lastVisible.height >= 100 &&
          lastVisible.width * lastVisible.height > 100 * 100)) {
      lastMediaEl = bestVideoArea > bestVisibleArea ? video : (bestImg || video);
    }

    return { image: bestImg, video, mediaEl: lastMediaEl };
  }

  function getBestImageUrl(img) {
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const entries = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        return { url: parts[0], width: parts[1] ? parseInt(parts[1]) : 0 };
      });
      entries.sort((a, b) => b.width - a.width);
      if (entries.length > 0 && entries[0].url) return entries[0].url;
    }
    return img.src;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // tag optionally customizes the filename (e.g. carousel index, username).
  function downloadImage(img, tag) {
    const url = getBestImageUrl(img);
    if (!url) return;
    const filename = tag ? `instagram_${tag}.jpg` : `instagram_${getPostId()}.jpg`;
    const fallback = () => {
      try {
        chrome.runtime.sendMessage({ action: "downloadMedia", url, filename });
        incrementDownloadCount();
      } catch (e) {
        window.open(url, '_blank');
      }
    };
    // Re-encode through a canvas so the file is a REAL JPEG — Instagram's
    // CDN often serves WebP/HEIC bytes, which a forced .jpg filename would
    // just disguise. Falls back to the raw download if fetch/encode fails.
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
      .then(blob => createImageBitmap(blob))
      .then(bitmap => {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        canvas.toBlob(jpeg => {
          if (jpeg) {
            downloadBlob(jpeg, filename);
            incrementDownloadCount();
          } else {
            fallback();
          }
        }, 'image/jpeg', 0.95);
      })
      .catch(fallback);
  }

  // Carousel batch download: collect every slide image of the current post
  // (Instagram slides them via a translated track) and download each one.
  function getCarouselImages(mediaEl) {
    let node = mediaEl;
    while (node && node !== document.body) {
      const style = node.getAttribute && node.getAttribute('style');
      if (style && /translateX/.test(style)) {
        const track = node.parentElement;
        if (!track) return null;
        const imgs = [...track.querySelectorAll('img')].filter(i =>
          i.getBoundingClientRect().width >= 100 && !isSuggestedMedia(i));
        return imgs.length > 1 ? imgs : null;
      }
      node = node.parentElement;
    }
    return null;
  }

  function downloadCarousel(mediaEl) {
    const imgs = getCarouselImages(mediaEl);
    if (!imgs) { downloadImage(mediaEl); return; }
    const seen = new Set();
    let n = 0;
    imgs.forEach((img) => {
      const url = getBestImageUrl(img);
      if (!url || seen.has(url)) return;
      seen.add(url);
      n++;
      // Stagger requests so the browser doesn't choke on a download burst.
      const index = n;
      setTimeout(() => downloadImage(img, `${getPostId()}_${index}`), (index - 1) * 400);
    });
  }

  // Profile picture download: on profile pages, double-clicking the avatar
  // downloads the best available resolution as a real JPG.
  function setupProfilePicDownload() {
    if (!enabled || !downloadBtnEnabled || !isProfilePage()) return;
    const avatar = document.querySelector('header img');
    if (!avatar || avatar.dataset.antiIgPfp) return;
    avatar.dataset.antiIgPfp = '1';
    avatar.style.cursor = 'zoom-in';
    avatar.title = 'Double-click to download profile picture';
    avatar.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const user = window.location.pathname.split('/').filter(Boolean)[0];
      downloadImage(avatar, user);
    });
  }

  function pickRecordingFormat() {
    const candidates = [
      { mime: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', ext: 'mp4', blob: 'video/mp4' },
      { mime: 'video/mp4', ext: 'mp4', blob: 'video/mp4' },
      { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', blob: 'video/webm' },
      { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', blob: 'video/webm' },
      { mime: 'video/webm', ext: 'webm', blob: 'video/webm' }
    ];
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c.mime)) return c;
      } catch (e) { /* keep looking */ }
    }
    return null;
  }

  function downloadVideo(video) {
    if (!video) return;
    dlBusy = true;
    updateDlBtnState();
    try {
      const format = pickRecordingFormat();
      if (!format) {
        console.warn('Anti-IG: no supported recording format');
        dlBusy = false;
        updateDlBtnState();
        return;
      }
      const stream = video.captureStream ? video.captureStream()
        : video.mozCaptureStream ? video.mozCaptureStream() : null;
      if (!stream) throw new Error('captureStream not supported');
      const recorder = new MediaRecorder(stream, { mimeType: format.mime });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: format.blob });
        downloadBlob(blob, `instagram_${getPostId()}.${format.ext}`);
        incrementDownloadCount();
        dlBusy = false;
        updateDlBtnState();
      };
      recorder.onerror = () => { dlBusy = false; updateDlBtnState(); };
      const prevMuted = video.muted;
      const prevVolume = video.volume;
      video.muted = true;
      video.volume = 0;
      video.currentTime = 0;
      const finish = () => {
        video.removeEventListener('ended', finish);
        activeRecording = null;
        if (recorder.state !== 'inactive') recorder.stop();
        video.muted = prevMuted;
        video.volume = prevVolume;
      };
      video.play().then(() => {
        recorder.start();
        video.addEventListener('ended', finish);
        // A second click on the button stops the recording early and saves
        // whatever has been captured so far (handled in the click handler).
        activeRecording = { stop: finish };
      }).catch(() => { dlBusy = false; updateDlBtnState(); });
    } catch (e) { dlBusy = false; updateDlBtnState(); }
  }

  function updateDlBtnState() {
    if (!dlBtn) return;
    if (dlBusy) {
      // Keep pointer events ON — clicking again stops the recording early.
      dlBtn.style.opacity = '0.85';
      dlBtn.style.pointerEvents = 'auto';
      dlBtn.querySelector('.dl-icon').style.display = 'none';
      dlBtn.querySelector('.dl-spinner').style.display = 'inline-block';
      dlBtn.title = 'Recording — click to stop and save';
    } else {
      dlBtn.style.opacity = '1';
      dlBtn.style.pointerEvents = 'auto';
      dlBtn.querySelector('.dl-icon').style.display = 'inline-block';
      dlBtn.querySelector('.dl-spinner').style.display = 'none';
      dlBtn.title = 'Download media (Alt+click: all carousel images · D: shortcut)';
    }
  }

  function positionDlBtn(mediaEl) {
    if (!dlBtn || !mediaEl) return;
    const margin = 8;
    const btnSize = 36;
    // Actually-visible portion of the media (clip- and viewport-aware).
    const vis = visibleRectOf(mediaEl);
    const right = vis.right;
    const bottom = vis.bottom;
    // Only show the button if it fits fully inside the visible area —
    // otherwise it would stick out past the edge of the picture.
    if (vis.width < btnSize + margin * 2 || vis.height < btnSize + margin * 2) {
      dlBtn.style.display = 'none';
      return;
    }
    dlBtn.style.display = 'flex';
    // Desired button position in viewport coordinates (bottom-right of media).
    const desiredLeft = right - margin - btnSize;
    const desiredTop = bottom - margin - btnSize;
    // position:fixed is relative to the viewport ONLY if no ancestor has a
    // transform/filter/perspective — Instagram applies transforms to body
    // in several flows (scroll-lock, modals, transitions), which silently
    // changes the button's containing block and throws viewport math off.
    // Instead of guessing the containing block: set left/top, measure where
    // the button actually landed, and correct the offset. Works for any
    // containing block, transformed or not.
    dlBtn.style.left = desiredLeft + 'px';
    dlBtn.style.top = desiredTop + 'px';
    dlBtn.style.right = 'auto';
    dlBtn.style.bottom = 'auto';
    const actual = dlBtn.getBoundingClientRect();
    const dx = desiredLeft - actual.left;
    const dy = desiredTop - actual.top;
    if (dx !== 0 || dy !== 0) {
      dlBtn.style.left = (desiredLeft + dx) + 'px';
      dlBtn.style.top = (desiredTop + dy) + 'px';
    }
  }

  function createDlBtn() {
    if (dlBtn) return;
    dlBtn = document.createElement('div');
    dlBtn.id = 'anti-ig-dl-btn';
    dlBtn.innerHTML = `
      <svg class="dl-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <svg class="dl-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:none;animation:anti-ig-spin 1s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    `;
    dlBtn.title = 'Download media (Alt+click: all carousel images · D: shortcut)';
    dlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Click during a recording: stop early and save what's captured.
      if (activeRecording) { activeRecording.stop(); return; }
      if (dlBusy) return;
      const { image, video } = findMainMedia();
      if (e.altKey && image) {
        downloadCarousel(image);
      } else if (video && video.readyState >= 2) {
        downloadVideo(video);
      } else if (image) {
        downloadImage(image);
      }
    });
    document.body.appendChild(dlBtn);
  }

  function removeDlBtn() {
    if (dlBtn) { dlBtn.remove(); dlBtn = null; }
    lastMediaEl = null;
  }

  function updateDlBtn() {
    if (!enabled || !downloadBtnEnabled || !isPostPage()) { removeDlBtn(); return; }
    const { mediaEl } = findMainMedia();
    if (!mediaEl) {
      if (dlBtn) dlBtn.style.display = 'none';
      return;
    }
    if (!dlBtn) createDlBtn();
    if (dlBtn) {
      dlBtn.style.display = 'flex';
      positionDlBtn(mediaEl);
      updateDlBtnState();
    }
  }

  // Keep button aligned with media on scroll and resize
  window.addEventListener('scroll', () => {
    if (dlBtn && dlBtn.style.display !== 'none') {
      const { mediaEl } = findMainMedia();
      if (mediaEl) positionDlBtn(mediaEl);
    }
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (dlBtn && dlBtn.style.display !== 'none') {
      const { mediaEl } = findMainMedia();
      if (mediaEl) positionDlBtn(mediaEl);
    }
  }, { passive: true });

  // ─── Timestamp enhancement ───────────────────────────────────────────
  // Instagram shows relative times ("200 Wo.", "37 w") on comments and the
  // post itself. The exact instant is always in <time datetime="...ISO...">,
  // so ages can be computed precisely and locale-independently:
  //  - every timestamp gets a hover tooltip with the full exact date/time
  //  - timestamps older than ~1 month get a "~X.Xy" / "~Xmo" suffix
  //  - the post's own timestamp (last <time> in the document — the post
  //    date row sits below the comments) also gets the full exact upload
  //    date shown inline, right where the relative date is
  function stripTimestampEnhancements() {
    document.querySelectorAll('.anti-ig-yrs, .anti-ig-full-date').forEach(s => s.remove());
    document.querySelectorAll('time[datetime]').forEach(t => t.removeAttribute('title'));
  }

  function enhanceTimestamps() {
    if (!enabled || !timestampsEnabled || !isPostPage()) return;
    // Note: real Instagram post pages have NO <article> element — comment
    // and post timestamps sit directly in the document. Don't scope to one.
    const times = document.querySelectorAll('time[datetime]');
    times.forEach((t, i) => {
      const dt = new Date(t.getAttribute('datetime'));
      if (isNaN(dt.getTime())) return;
      const full = dt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
      if (t.title !== full) t.title = full;
      if (!t.querySelector('.anti-ig-yrs')) {
        const years = (Date.now() - dt.getTime()) / (365.25 * 24 * 3600 * 1000);
        let label = null;
        if (years >= 1) label = `~${years.toFixed(1)}y`;
        else if (years >= 1 / 12) label = `~${Math.round(years * 12)}mo`;
        if (label) {
          const s = document.createElement('span');
          s.className = 'anti-ig-yrs';
          s.style.cssText = 'opacity:0.65;margin-left:4px;white-space:nowrap;';
          s.textContent = `· ${label}`;
          t.appendChild(s);
        }
      }
      // Full exact date+time on the post's own timestamp (last <time> in
      // the document — the post date row sits below the comments). If
      // Instagram already shows the date (4-digit year present), only add
      // the exact time of day; otherwise add the full localized datetime.
      if (i === times.length - 1 && !t.querySelector('.anti-ig-full-date')) {
        const label = /\d{4}/.test(t.textContent)
          ? dt.toLocaleTimeString(undefined, { timeStyle: 'short' })
          : full;
        const s = document.createElement('span');
        s.className = 'anti-ig-full-date';
        s.style.cssText = 'opacity:0.85;margin-left:6px;white-space:nowrap;';
        s.textContent = `· ${label}`;
        t.appendChild(s);
      }
    });
  }

  // Fast polling for carousel navigation — Instagram slides images via
  // CSS transforms without adding new DOM nodes, so MutationObserver
  // doesn't catch it. Poll at 300ms to detect the visible image change.
  setInterval(() => {
    if (!enabled) return;
    updateDlBtn();
    enhanceTimestamps();
  }, 300);

  // Keyboard shortcut: press D on a post page to trigger the download
  // button (ignored while typing in an input/textarea/contenteditable).
  document.addEventListener('keydown', (e) => {
    if (!enabled || !downloadBtnEnabled || !isPostPage()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key.toLowerCase() !== 'd') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!dlBtn || dlBtn.style.display === 'none') return;
    e.preventDefault();
    dlBtn.click();
  });

  // Also catch carousel nav button clicks for immediate update
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[aria-label]');
    if (!btn) return;
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('next') || label.includes('prev') ||
        label.includes('weiter') || label.includes('zurück') ||
        label.includes('suivant') || label.includes('précédent')) {
      setTimeout(updateDlBtn, 50);
      setTimeout(updateDlBtn, 300);
    }
  }, true);

  // ─── Initial run — wait until body exists (script runs at document_start)
  function init() {
    if (document.body) {
      injectPageStyle();
      injectScrollGuard();
      removeLoginWall();
      startObserver();
    } else {
      setTimeout(init, 50);
    }
  }
  init();
})();
