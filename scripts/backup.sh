#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Copia de seguridad de la base de datos del Sistema de Seguimiento.
#
# Con PostgreSQL NATIVO (la decisión de arquitectura del proyecto) `pg_dump` es un
# binario del sistema, así que este script es trivial. Con la aplicación dentro de
# un contenedor NO funcionaría: la imagen de producción no trae el cliente de
# PostgreSQL (regla `important.md` §2).
#
# Uso:
#   bash scripts/backup.sh                  # backup al directorio por defecto
#   BACKUP_DIR=/otra/ruta bash scripts/backup.sh
#
# Programar (crontab -e):
#   0 2 * * * cd /opt/sistema1_5 && bash scripts/backup.sh >> /var/log/seguit-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuración ────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-${PWD}/backups}"
RETENER_DIAS="${RETENER_DIAS:-30}"

# Lee del .env si está, sin depender de que las variables estén exportadas.
if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

DB_URL="${DATABASE_URL:-postgresql://postgres:12345678@localhost:5432/sistitulados_db}"
NOMBRE_DB="${DB_NAME:-sistitulados_db}"

Sello="$(date +%F)"
Archivo="$BACKUP_DIR/${NOMBRE_DB}_${Sello}.dump"

# ── Verificaciones previas ───────────────────────────────────────────────────
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: no se encontró 'pg_dump'." >&2
  echo "       Instale el cliente de PostgreSQL (postgresql-client) o marque" >&2
  echo "       BACKUP_DIR / BACKUP_CMD para usar otra herramienta." >&2
  exit 1
fi

if ! pg_dump "$DB_URL" --version >/dev/null 2>&1; then
  echo "AVISO: no se pudo validar la conexión. Se intentará de todos modos." >&2
fi

mkdir -p "$BACKUP_DIR"

# ── Backup ───────────────────────────────────────────────────────────────────
# -Fc  = formato custom (comprimido, y permite restaurar tablas sueltas)
# -Z6  = compresión media
echo "[$(date '+%F %T')] Generando backup de '$NOMBRE_DB'…"

if ! pg_dump "$DB_URL" -Fc -Z6 --no-owner --no-privileges -f "$Archivo.tmp"; then
  rm -f "$Archivo.tmp"
  echo "ERROR: falló el pg_dump." >&2
  exit 1
fi

mv "$Archivo.tmp" "$Archivo"

Tamano="$(du -h "$Archivo" | cut -f1)"
echo "[$(date '+%F %T')] OK  →  $Archivo  ($Tamano)"

# ── Rotación ─────────────────────────────────────────────────────────────────
# Los backups son datos personales (cédulas, correos, teléfonos). No se mandan a
# ningún lado: se quedan en el servidor, con permisos restringidos.
chmod 600 "$Archivo"

Borrados=0
while IFS= read -r -d '' viejo; do
  rm -f "$viejo"
  Borrados=$((Borrados + 1))
done < <(find "$BACKUP_DIR" -name "${NOMBRE_DB}_*.dump" -type f -mtime "+$RETENER_DIAS" -print0)

echo "[$(date '+%F %T')] Rotación: $Borrados backup(s) de más de $RETENER_DIAS días eliminados."

# ── Recordatorio ─────────────────────────────────────────────────────────────
Ultimo="$(ls -1t "$BACKUP_DIR"/${NOMBRE_DB}_*.dump 2>/dev/null | head -1)"
if [ -n "$Ultimo" ]; then
  echo ""
  echo "Para PROBAR que el backup sirve (recomendado, una vez por mes):"
  echo "  createdb -T template0 -E UTF8 --locale-provider=icu --icu-locale=es-BO-x-icu prueba_restore"
  echo "  pg_restore -d prueba_restore '$Ultimo' && echo 'BACKUP OK'"
  echo "  dropdb prueba_restore"
fi