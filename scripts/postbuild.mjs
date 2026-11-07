// Bereitet .next/standalone nach `next build` vor (output: "standalone").
// Ersetzt das frühere Shell-Skript (cp/mkdir -p), das unter Windows scheiterte.
// Läuft unter Windows und Linux (Node ≥ 16.7, fs.cpSync).
//
// Verhalten wie zuvor:
//   public        → .next/standalone/public          (falls vorhanden)
//   .next/static  → .next/standalone/.next/static
//   .env.local    → .next/standalone/.env.local      (falls vorhanden)
// Fehlende Quellen werden übersprungen (vorher: 2>/dev/null), ein fehlendes
// .next/standalone ist dagegen ein Fehler (Build lief nicht oder ohne standalone).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("postbuild: .next/standalone fehlt (next build mit output: 'standalone' ausführen).");
  process.exit(1);
}

const copies = [
  { from: "public", to: join(standalone, "public") },
  { from: join(".next", "static"), to: join(standalone, ".next", "static") },
  { from: ".env.local", to: join(standalone, ".env.local") },
];

mkdirSync(join(standalone, ".next"), { recursive: true });
for (const { from, to } of copies) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.log(`postbuild: ${from} nicht vorhanden – übersprungen`);
    continue;
  }
  cpSync(src, to, { recursive: true, force: true });
  console.log(`postbuild: ${from} kopiert`);
}
console.log("Standalone ready");
