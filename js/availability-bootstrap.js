(function availabilityBootstrap() {
  "use strict";

  if (window.cognicionAvailability) return;

  const APP_VERSION = "2.209";
  const SCRIPT_URL = document.currentScript?.src || new URL("js/availability-bootstrap.js", window.location.href).href;
  const STORAGE_KEY = "cognicion.availability.events.v1";
  const WATCHDOG_MS = 12000;
  const MAX_EVENTS = 50;
  const ALLOWED_EVENTS = new Set([
    "BOOT_START",
    "HTML_READY",
    "SW_READY",
    "SW_NETWORK_TIMEOUT",
    "SW_CACHE_FALLBACK",
    "SW_CACHE_MISS",
    "MAIN_LOADED",
    "FIREBASE_READY",
    "FIRST_RENDER",
    "APP_READY"
  ]);
  const bootStartedAt = performance.now();
  let appReady = false;
  let criticalScriptLoaded = false;
  let recoveryPending = false;

  function browserFamily() {
    const value = navigator.userAgent || "";
    if (/Edg\//.test(value)) return "Edge";
    if (/Firefox\//.test(value)) return "Firefox";
    if (/Chrome\//.test(value) && !/Edg\//.test(value)) return "Chrome";
    if (/Safari\//.test(value) && !/Chrome\//.test(value)) return "Safari";
    return "Other";
  }

  function platformClass() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "") ? "mobile" : "desktop";
  }

  function networkState() {
    if (navigator.onLine === false) return "offline";
    const effectiveType = navigator.connection?.effectiveType;
    return typeof effectiveType === "string" && /^(?:slow-2g|2g|3g|4g)$/.test(effectiveType)
      ? effectiveType
      : "online";
  }

  function readQueue() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.slice(-MAX_EVENTS) : [];
    } catch (_) {
      return [];
    }
  }

  function storeQueue(queue) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_EVENTS)));
    } catch (_) {
      // La telemetría técnica es opcional; la aplicación no depende de storage.
    }
  }

  function mark(eventName, details = {}) {
    if (!ALLOWED_EVENTS.has(eventName)) return;
    const suppliedDuration = Number(details.durationMs);
    const event = {
      event: eventName,
      timestamp: new Date().toISOString(),
      appVersion: APP_VERSION,
      browserFamily: browserFamily(),
      platform: platformClass(),
      networkState: networkState(),
      durationMs: Number.isFinite(suppliedDuration)
        ? Math.max(0, Math.round(suppliedDuration))
        : Math.max(0, Math.round(performance.now() - bootStartedAt))
    };
    const queue = readQueue();
    queue.push(event);
    storeQueue(queue);
    performance.mark?.(`cognicion:availability:${eventName.toLowerCase()}`);
  }

  function diagnosticsUrl() {
    return new URL("../diagnostico-red.html", SCRIPT_URL).href;
  }

  function showRecovery() {
    if (appReady || document.getElementById("cognicionBootstrapRecovery")) return;
    if (!document.body) {
      recoveryPending = true;
      return;
    }
    recoveryPending = false;
    const offline = navigator.onLine === false;
    const overlay = document.createElement("section");
    overlay.id = "cognicionBootstrapRecovery";
    overlay.setAttribute("role", "alert");
    overlay.setAttribute("aria-live", "assertive");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:grid",
      "place-items:center",
      "padding:24px",
      "background:#081018",
      "color:#f8fafc",
      "font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(";");
    overlay.innerHTML = `
      <div style="width:min(100%,36rem);padding:24px;border:1px solid #334155;border-radius:16px;background:#0f172a;box-shadow:0 24px 70px rgba(0,0,0,.45)">
        <p style="margin:0 0 8px;color:#7dd3fc;font-weight:700;letter-spacing:.04em">RECUPERACIÓN DE COGNICIÓN</p>
        <h1 style="margin:0 0 12px;font:800 clamp(1.45rem,4vw,2rem)/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">La interfaz no pudo iniciar.</h1>
        <p style="margin:0 0 20px;color:#cbd5e1">${offline
          ? "El dispositivo informa que no tiene conexión a Internet."
          : "Hay conexión de red, pero un recurso esencial no respondió a tiempo."}</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button type="button" data-cognicion-retry style="border:0;border-radius:10px;padding:11px 15px;background:#38bdf8;color:#082f49;font-weight:800;cursor:pointer">Reintentar</button>
          <a href="${diagnosticsUrl()}" style="border:1px solid #64748b;border-radius:10px;padding:10px 14px;color:#f8fafc;text-decoration:none">Diagnóstico de conexión</a>
        </div>
        <p style="margin:18px 0 0;color:#94a3b8;font-size:.875rem">Esta pantalla no consulta ni muestra información clínica.</p>
      </div>`;
    overlay.querySelector("[data-cognicion-retry]")?.addEventListener("click", () => window.location.reload(), { once: true });
    document.body.appendChild(overlay);
  }

  function visibleApplicationRoot() {
    const root = document.querySelector("main, [role='main'], form, .public-shell, .dashboard-container");
    return Boolean(root && root.getClientRects().length);
  }

  function markFirstRender() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!criticalScriptLoaded || !visibleApplicationRoot()) return;
      mark("FIRST_RENDER");
      mark("APP_READY");
      appReady = true;
      window.clearTimeout(watchdogTimer);
      criticalObserver.disconnect();
      document.getElementById("cognicionBootstrapRecovery")?.remove();
    }));
  }

  function isCriticalScript(element) {
    return element instanceof HTMLScriptElement && element.hasAttribute("data-cognicion-critical");
  }

  function bindCriticalScript(script) {
    if (!isCriticalScript(script) || script.dataset.cognicionAvailabilityBound === "true") return;
    script.dataset.cognicionAvailabilityBound = "true";
    script.addEventListener("load", () => {
      criticalScriptLoaded = true;
      mark("MAIN_LOADED");
      if (script.dataset.cognicionReady !== "event") markFirstRender();
    }, { once: true });
    script.addEventListener("error", showRecovery, { once: true });
  }

  const criticalObserver = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      bindCriticalScript(node);
      node.querySelectorAll?.("script[data-cognicion-critical]").forEach(bindCriticalScript);
    }));
  });
  criticalObserver.observe(document.documentElement, { childList: true, subtree: true });

  function errorBelongsToCriticalScript(filename) {
    if (!filename) return false;
    try {
      const failedPath = new URL(filename, window.location.href).pathname;
      return [...document.querySelectorAll("script[data-cognicion-critical]")]
        .some((script) => new URL(script.src, window.location.href).pathname === failedPath);
    } catch (_) {
      return false;
    }
  }

  mark("BOOT_START", { durationMs: 0 });

  const watchdogTimer = window.setTimeout(showRecovery, WATCHDOG_MS);

  window.addEventListener("error", (event) => {
    if (appReady) return;
    if (isCriticalScript(event.target) || errorBelongsToCriticalScript(event.filename)) showRecovery();
  }, true);

  document.addEventListener("DOMContentLoaded", () => {
    mark("HTML_READY");
    document.querySelectorAll("script[data-cognicion-critical]").forEach(bindCriticalScript);
    if (recoveryPending) showRecovery();
    void import(new URL("./services/cacheControlService.js", SCRIPT_URL).href)
      .then(({ iniciarCacheCognicionDiferido }) => iniciarCacheCognicionDiferido())
      .catch(() => null);
  }, { once: true });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data;
      if (data?.type !== "COGNICION_AVAILABILITY_EVENT") return;
      mark(data.event, { durationMs: data.durationMs });
    });
    navigator.serviceWorker.ready.then(() => mark("SW_READY")).catch(() => null);
  }

  window.cognicionAvailability = Object.freeze({
    appVersion: APP_VERSION,
    mark,
    ready: markFirstRender,
    showRecovery,
    getEvents: () => readQueue().map((event) => ({ ...event }))
  });
}());
