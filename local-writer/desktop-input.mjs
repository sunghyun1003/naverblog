import { createInterface } from "node:readline";

// Keep stdin attached across login/navigation/worker transitions. A stop click
// during a browser check must not disappear between two readline instances.
export function desktopCommands(input, onStop) {
  const reader = createInterface({ input });
  const queue = [];
  let pending;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true; queue.length = 0; onStop();
    pending?.("stop"); pending = undefined;
  };
  reader.on("line", line => {
    if (line === "stop") { stop(); return; }
    if (stopped) return;
    if (pending) { const resolve = pending; pending = undefined; resolve(line); }
    else if (queue.length < 1) queue.push(line);
  });
  reader.on("close", stop);
  return {
    next: () => stopped ? Promise.resolve("stop") : queue.length ? Promise.resolve(queue.shift())
      : new Promise(resolve => { pending = resolve; }),
    close: () => reader.close(),
  };
}
