# 1. Base con pnpm
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app

# 2. Instalación de dependencias
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# 3. Construcción (Builder)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Argumentos o variables necesarias durante el build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN pnpm build

# 4. Imagen final de ejecución (Runner)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Instalar pnpm para scripts de mantenimiento/migraciones si se requieren
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Crear usuario sin privilegios para seguridad (ISO 27001 / Buenas prácticas)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar archivos públicos y construidos de Next.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.npmrc ./.npmrc
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs

EXPOSE 3000

# `pnpm start` dispara un "install" previo automático cuando el lockfile no está
# en la imagen (pnpm 12 + verify-deps-before-run), y el usuario nextjs no puede
# escribir pnpm-lock.yaml -> ERR_PNPM_LOCKFILE_WRITE_FILE. Como las dependencias
# ya vienen resueltas y copiadas desde la etapa builder, arrancamos Next directo.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
