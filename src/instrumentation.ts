// Next.js Instrumentation-Hook: läuft einmal beim Serverstart, bevor Requests
// bedient werden. Der Datenbank-Startschutz liegt in instrumentation-node.ts.
// Der Import MUSS direkt in diesem if-Block stehen, damit der Bundler ihn aus
// dem Edge-Bundle entfernt (postgres braucht Node-Module wie net/tls).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
