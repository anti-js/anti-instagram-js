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
      html[data-anti-ig="on"] .x1qjc9v5.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k {
        pointer-events: none !important;
      }
      html[data-anti-ig="on"] .x1uvtmcs {
        pointer-events: none !important;
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

    // 3) Neutralize click interceptors — Instagram uses multiple overlay
    //    classes to intercept clicks. Disable pointer-events on known
    //    overlay classes and any full-viewport div without interactive content.
    document.querySelectorAll('.x1qjc9v5.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k, .x1uvtmcs').forEach(d => {
      d.style.setProperty("pointer-events", "none", "important");
    });
    // Also scan for any div covering most of the viewport with no
    // interactive content — these are click interceptors
    document.querySelectorAll('div').forEach(d => {
      if (d === document.body || d.parentElement !== document.body) return;
      const rect = d.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.5 || rect.height < window.innerHeight * 0.5) return;
      if (d.querySelector('img, video, input, button, a, canvas, svg, [role="dialog"], [role="button"]')) return;
      d.style.setProperty("pointer-events", "none", "important");
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

  // ─── Inject scroll guard into PAGE'S MAIN WORLD ────────────────────────
  // Content scripts run in an isolated world — overriding window.scrollTo
  // here does NOT affect Instagram's page-world JS. We must inject a
  // <script> element into the page DOM so the override runs in the same
  // JS context as Instagram's code.
  function injectScrollGuard() {
    if (document.getElementById("anti-ig-scroll-guard")) return;

    const code = [
      "(function(){",
      "  var uy=0;",
      "  window.addEventListener('scroll',function(){uy=window.scrollY},{passive:true});",
      "  var o=window.scrollTo.bind(window);",
      "  window.scrollTo=function(){",
      "    if(arguments.length>=2&&arguments[1]===0&&uy>100)return;",
      "    return o.apply(window,arguments);",
      "  };",
      "  var o2=window.scroll.bind(window);",
      "  window.scroll=function(){",
      "    if(arguments.length>=2&&arguments[1]===0&&uy>100)return;",
      "    return o2.apply(window,arguments);",
      "  };",
      "  var osi=Element.prototype.scrollIntoView;",
      "  Element.prototype.scrollIntoView=function(){",
      "    var r=this.getBoundingClientRect();",
      "    if(r.top>-10&&r.top<10&&uy>100)return;",
      "    return osi.apply(this,arguments);",
      "  };",
      "  if('scrollRestoration'in history)history.scrollRestoration='manual';",
      "  window.__antiIgScrollGuard=true;",
      "})();"
    ].join("\n");

    // Try inline script first
    const s = document.createElement("script");
    s.id = "anti-ig-scroll-guard";
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);

    // Fallback: if CSP blocked inline script, try blob URL
    setTimeout(() => {
      s.remove();
      try {
        const blob = new Blob([code], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const s2 = document.createElement("script");
        s2.id = "anti-ig-scroll-guard";
        s2.src = url;
        s2.onload = () => URL.revokeObjectURL(url);
        (document.head || document.documentElement).appendChild(s2);
      } catch (e) {}
    }, 200);
  }

  // ─── Content-script fallback: restore scroll if yanked to top ──────────
  // If the page-world guard fails (CSP), this detects unexpected scroll-to-0
  // and restores the user's position. Uses a flag to avoid infinite loops.
  let lastGoodScrollY = 0;
  let restoringScroll = false;
  window.addEventListener('scroll', () => {
    if (restoringScroll) return;
    if (window.scrollY > 100) {
      lastGoodScrollY = window.scrollY;
    } else if (window.scrollY <= 10 && lastGoodScrollY > 100 && enabled) {
      restoringScroll = true;
      const target = lastGoodScrollY;
      lastGoodScrollY = 0;
      window.scrollTo(0, target);
      setTimeout(() => { restoringScroll = false; }, 200);
    }
  }, { passive: true });

  // ─── Click interception for posts, stories, and "load more" ────────────
  // Use capture phase to intercept clicks before Instagram's handlers.
  // If the click hits an overlay div, find the real button underneath.
  document.addEventListener('click', (e) => {
    if (!enabled) return;

    // If click landed on an overlay (not a button/link), try to find
    // the real interactive element underneath
    if (e.target.tagName === 'DIV' && !e.target.matches('button, a, [role="button"], input')) {
      // Temporarily hide the overlay to find what's underneath
      const target = e.target;
      const origPE = target.style.pointerEvents;
      target.style.pointerEvents = 'none';
      const rect = target.getBoundingClientRect();
      const realTarget = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
      target.style.pointerEvents = origPE;
      
      if (realTarget && realTarget !== target && 
          (realTarget.matches('button, [role="button"]') || realTarget.closest('button, [role="button"]'))) {
        const btn = realTarget.closest('button, [role="button"]') || realTarget;
        btn.click();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

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
    injectScrollGuard();
    unlockScroll();
    if (document.querySelector('div[role="dialog"][aria-modal="true"], .x1h0vfkc')) {
      removeLoginWall();
    }
  }, 1000);

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
