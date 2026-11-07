// Bereitet .next/standalone nach "next build" vor (output: "standalone").
// Laeuft unter Windows und Linux (Node >= 16.7, fs.cpSync).
//   public       -> .next/standalone/public
//   .next/static -> .next/standalone/.next/static
// Es werden bewusst KEINE .env-Dateien kopiert: Zugangsdaten gehoeren nicht ins Image.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("postbuild: .next/standalone fehlt (next build mit output: 'standalone' ausfuehren).");
  process.exit(1);
}

const copies = [
  { from: "public", to: join(standalone, "public") },
  { from: join(".next", "static"), to: join(standalone, ".next", "static") },
];

mkdirSync(join(standalone, ".next"), { recursive: true });
for (const { from, to } of copies) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.log(`postbuild: ${from} nicht vorhanden, uebersprungen`);
    continue;
  }
  cpSync(src, to, { recursive: true, force: true });
  console.log(`postbuild: ${from} kopiert`);
}

// Sicherheitsnetz: .env-Dateien aus frueheren Builds entfernen.
for (const name of readdirSync(standalone)) {
  if (name.startsWith(".env")) {
    rmSync(join(standalone, name), { force: true });
    console.log(`postbuild: ${name} entfernt`);
  }
}
console.log("Standalone ready");