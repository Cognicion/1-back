import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
});

export const QA_ERROR_CAPTURE_SCRIPT = `(() => {
  const errors = [];
  const describe = (value) => {
    if (value instanceof Error) return value.stack || value.message || String(value);
    try { return typeof value === "string" ? value : JSON.stringify(value); }
    catch { return String(value); }
  };
  Object.defineProperty(globalThis, "__connectomeQaErrors", { value: errors, configurable: true });
  addEventListener("error", (event) => errors.push({ type: "error", message: event.message || describe(event.error) }));
  addEventListener("unhandledrejection", (event) => errors.push({ type: "unhandledrejection", message: describe(event.reason) }));
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    errors.push({ type: "console.error", message: args.map(describe).join(" ") });
    originalError(...args);
  };
})();`;

export const QA_FULLSCREEN_STUB_SCRIPT = `(() => {
  let activeElement = null;
  Object.defineProperty(globalThis, "__qaRejectFullscreen", { value: false, writable: true, configurable: true });
  try {
    Object.defineProperty(Document.prototype, "fullscreenElement", {
      configurable: true,
      get() { return activeElement; }
    });
  } catch {
    try {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get() { return activeElement; }
      });
    } catch { /* el E2E verificara el fallback */ }
  }
  Element.prototype.requestFullscreen = async function requestFullscreenForQa() {
    if (globalThis.__qaRejectFullscreen) {
      const error = new Error("Fullscreen rechazado por QA");
      error.name = "NotAllowedError";
      throw error;
    }
    activeElement = this;
    this.ownerDocument.dispatchEvent(new Event("fullscreenchange"));
  };
  Document.prototype.exitFullscreen = async function exitFullscreenForQa() {
    activeElement = null;
    this.dispatchEvent(new Event("fullscreenchange"));
  };
})();`;

export async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : null,
    process.platform === "linux" ? "/usr/bin/google-chrome" : null,
    process.platform === "linux" ? "/usr/bin/chromium" : null,
    process.platform === "linux" ? "/usr/bin/chromium-browser" : null
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch { /* probar siguiente */ }
  }
  throw new Error(`Chrome no encontrado. Rutas examinadas: ${candidates.join(", ")}`);
}

export async function startStaticServer(rootDirectory) {
  const root = resolve(rootDirectory);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const decodedPath = decodeURIComponent(requestUrl.pathname);
      let filePath = resolve(root, `.${decodedPath}`);
      const relativePath = relative(root, filePath);
      if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }
      let fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = join(filePath, "index.html");
        fileStat = await stat(filePath);
      }
      if (!fileStat.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
      const body = request.method === "HEAD" ? null : await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store, max-age=0",
        "content-length": fileStat.size,
        "content-type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
        "x-content-type-options": "nosniff"
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error?.code === "ENOENT" ? "Not found" : "Static server error");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise) => server.close(() => resolvePromise()))
  };
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.openPromise = this.open();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    this.socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("Conexion CDP cerrada"));
      this.pending.clear();
    });
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", () => reject(new Error(`No se pudo abrir CDP: ${this.url}`)), { once: true });
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ""}`));
      else pending.resolve(message.result || {});
      return;
    }
    const callbacks = this.listeners.get(message.method);
    if (!callbacks) return;
    for (const callback of [...callbacks]) callback(message.params || {});
  }

  async send(method, params = {}) {
    await this.openPromise;
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise((resolvePromise, reject) => this.pending.set(id, { resolve: resolvePromise, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, callback) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(callback);
    return () => this.listeners.get(method)?.delete(callback);
  }

  waitForEvent(method, predicate = () => true, timeoutMs = 15000) {
    return new Promise((resolvePromise, reject) => {
      let timer;
      const off = this.on(method, (params) => {
        if (!predicate(params)) return;
        clearTimeout(timer);
        off();
        resolvePromise(params);
      });
      timer = setTimeout(() => {
        off();
        reject(new Error(`Timeout esperando evento CDP ${method}`));
      }, timeoutMs);
    });
  }

  close() {
    try { this.socket?.close(); } catch { /* ya cerrado */ }
  }
}

export async function launchChromeHarness({ rootDirectory, initScripts = [], viewport = { width: 1440, height: 900 } } = {}) {
  const chromePath = await findChromeExecutable();
  const server = await startStaticServer(rootDirectory);
  const profilePrefix = join(tmpdir(), "cognicion-connectome-chrome-");
  const profileDirectory = await mkdtemp(profilePrefix);
  const stderr = [];
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,MediaRouter",
    "--disable-gpu",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--no-default-browser-check",
    "--no-first-run",
    "--password-store=basic",
    "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  chrome.stderr?.on("data", (chunk) => {
    if (stderr.join("").length < 12000) stderr.push(String(chunk));
  });
  const port = await waitForDevToolsPort(profileDirectory, chrome, stderr);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error(`No se pudo crear target CDP: ${targetResponse.status}`);
  const target = await targetResponse.json();
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.openPromise;
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Log.enable"),
    cdp.send("Performance.enable")
  ]);
  const protocolExceptions = [];
  const consoleErrors = [];
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    protocolExceptions.push(exceptionDetails?.exception?.description || exceptionDetails?.text || "Runtime.exceptionThrown");
  });
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type !== "error") return;
    consoleErrors.push(args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") || "console.error");
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    mobile: Boolean(viewport.mobile)
  });
  for (const source of [QA_ERROR_CAPTURE_SCRIPT, ...initScripts]) {
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  const harness = {
    origin: server.origin,
    cdp,
    protocolExceptions,
    consoleErrors,
    async evaluate(expression) {
      const response = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      });
      if (response.exceptionDetails) {
        const description = response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Excepcion evaluando JavaScript";
        throw new Error(description);
      }
      return response.result?.value;
    },
    async navigate(pathname = "/") {
      const url = new URL(pathname, server.origin).href;
      const loaded = cdp.waitForEvent("Page.loadEventFired", () => true, 20000);
      await cdp.send("Page.navigate", { url });
      await loaded;
      return url;
    },
    async waitForFunction(expression, { timeoutMs = 20000, intervalMs = 40 } = {}) {
      const started = Date.now();
      let lastError;
      while (Date.now() - started < timeoutMs) {
        try {
          if (await harness.evaluate(expression)) return true;
        } catch (error) {
          lastError = error;
        }
        await delay(intervalMs);
      }
      throw new Error(`Timeout esperando condicion: ${expression}${lastError ? `\n${lastError.message}` : ""}`);
    },
    async click(selector) {
      const point = await harness.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error("Selector no encontrado: ${escapeForInline(selector)}");
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    },
    async press(key) {
      const definition = keyDefinition(key);
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...definition });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...definition });
    },
    async setViewport(width, height, { mobile = false, deviceScaleFactor = 1 } = {}) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile });
      await harness.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    },
    async screenshot() {
      const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      return result.data;
    },
    async pageErrors() {
      const captured = await harness.evaluate("globalThis.__connectomeQaErrors || []").catch(() => []);
      return [...captured, ...protocolExceptions.map((message) => ({ type: "Runtime.exceptionThrown", message })), ...consoleErrors.map((message) => ({ type: "console.error", message }))];
    },
    async close() {
      try { await cdp.send("Browser.close"); } catch { /* cerrar proceso abajo */ }
      cdp.close();
      await waitForExit(chrome, 3000);
      if (chrome.exitCode == null) chrome.kill();
      await server.close();
      const resolvedTemp = resolve(tmpdir());
      const resolvedProfile = resolve(profileDirectory);
      if (resolvedProfile.startsWith(`${resolvedTemp}${sep}`) && basename(resolvedProfile).startsWith("cognicion-connectome-chrome-")) {
        await rm(resolvedProfile, { recursive: true, force: true }).catch(() => {});
      }
    }
  };
  return harness;
}

async function waitForDevToolsPort(profileDirectory, chrome, stderr) {
  const portFile = join(profileDirectory, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (chrome.exitCode != null) throw new Error(`Chrome termino antes de iniciar CDP (${chrome.exitCode}).\n${stderr.join("")}`);
    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
      if (Number(port) > 0) return Number(port);
    } catch { /* aun no escrito */ }
    await delay(40);
  }
  throw new Error(`Chrome no publico DevToolsActivePort.\n${stderr.join("")}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode != null) return;
  await Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    delay(timeoutMs)
  ]);
}

function keyDefinition(key) {
  const definitions = {
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }
  };
  return definitions[key] || { key, code: key, text: key.length === 1 ? key : undefined };
}

function escapeForInline(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
