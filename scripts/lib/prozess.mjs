// Server-Prozesse in Testskripten starten und samt Kindprozessen beenden.
// next dev/start startet einen Kindprozess (start-server.js); es muss der ganze
// Prozessbaum enden, sonst bleibt der Port belegt und Next 16 verweigert jeden
// weiteren Dev-Server im selben Projekt ("Another next dev server").
// Windows: taskkill /T. macOS/Linux: eigene Prozessgruppe (detached) und Signal
// an die ganze Gruppe.
import { execSync, spawn } from "node:child_process";

const WINDOWS = process.platform === "win32";

export function starteProzess(befehl, args, optionen) {
  return spawn(befehl, args, { ...optionen, detached: !WINDOWS });
}

export function beendeProzess(kind) {
  if (!kind?.pid) return;
  try {
    if (WINDOWS) execSync(`taskkill /PID ${kind.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-kind.pid, "SIGKILL");
  } catch { /* schon beendet */ }
}
