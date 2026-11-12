# ── Stage 1: Abhängigkeiten ──────────────────────────────
FROM node:25-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: Build ───────────────────────────────────────
FROM node:25-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# npm führt "postbuild" nach "build" automatisch aus
RUN npm run build

# ── Stage 3: Migrationsdienst ───────────────────────────
# Eigenes kleines Image für Migrationen. Server: scripts/server-migrate.sh (baut
# dieses Image und startet es; siehe .github/copilot-instructions.md, "Produktion:
# Server-Struktur und Migrationen"). Entwicklung: `docker compose run --rm migrate
# [--bis 0012]` mit der docker-compose.yml des Repos.
# Enthält nur scripts/migrate.mjs, drizzle/ (SQL + Journal) und die zwei Pakete,
# die das Skript braucht, in den Versionen aus package-lock.json. Steht VOR der
# Produktions-Stage: Ohne --target baut Docker die LETZTE Stage (runner), der
# Portal-Build bleibt davon unberührt.
FROM node:25-alpine AS migrate
WORKDIR /app
COPY package-lock.json ./
RUN npm install --no-save --no-package-lock --ignore-scripts --no-audit --no-fund     $(node -p "['postgres','drizzle-orm'].map(n => n + '@' + require('./package-lock.json').packages['node_modules/' + n].version).join(' ')")     && rm package-lock.json
COPY scripts/migrate.mjs ./scripts/migrate.mjs
# Nur SQL-Migrationen und Journal, nicht drizzle/manual.
COPY drizzle/*.sql ./drizzle/
COPY drizzle/meta/_journal.json ./drizzle/meta/_journal.json
USER node
ENTRYPOINT ["node", "scripts/migrate.mjs"]

# ── Stage 4: Dienstplan-Import (einmalig) ───────────────
# Excel-Import der Dienstpläne (Phase 4). Server: scripts/server-import.sh (baut
# dieses Image und startet es im Netz fw-network). node_modules kommen aus der
# deps-Stage, also exakt aus package-lock.json. Enthält nur das Importskript und
# seine Bibliotheken: Excel und zuordnung.json werden NIE ins Image kopiert, sondern
# zur Laufzeit read-only gemountet (data/ steht in .dockerignore). Steht vor der
# Produktions-Stage, der Portal-Build bleibt unberührt.
FROM node:25-alpine AS import
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY scripts/dienstplan-import.mjs ./scripts/dienstplan-import.mjs
COPY scripts/lib/dienstplan-import.mjs scripts/lib/schutz.mjs ./scripts/lib/
USER node
ENTRYPOINT ["node", "scripts/dienstplan-import.mjs"]

# ── Stage 5: Produktion ─────────────────────────────────
FROM node:25-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV PROJECT_ROOT=/app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]