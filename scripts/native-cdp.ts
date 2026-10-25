/** QA-only CDP connection. Never enabled by the application configuration. */
export async function connectNative(port = 9237) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid QA port.");
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok)
    throw new Error(
      "Start the isolated native test executable with its QA debug port first.",
    );
  const pages = (await response.json()) as {
    url: string;
    type: string;
    webSocketDebuggerUrl?: string;
  }[];
  const page = pages.find(
    (item) =>
      item.type === "page" &&
      (item.url.startsWith("http://tauri.localhost") ||
        item.url.startsWith("http://127.0.0.1:1420")),
  );
  if (!page?.webSocketDebuggerUrl)
    throw new Error("No workbench WebView found at the QA port.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Cannot connect to the native WebView.")),
      { once: true },
    );
  });
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function send(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Native QA call timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function invoke<T>(
    command: string,
    args: unknown = {},
    timeoutMs = 15_000,
  ): Promise<T> {
    const result = (await send(
      "Runtime.evaluate",
      {
        expression: `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs,
    )) as { result: { value: T }; exceptionDetails?: unknown };
    if (result.exceptionDetails)
      throw new Error(
        `Native command failed: ${JSON.stringify(result.exceptionDetails)}`,
      );
    return result.result.value;
  }
  function close() {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Native QA connection closed."));
    }
    pending.clear();
    socket.close();
  }
  return { invoke, close };
}
