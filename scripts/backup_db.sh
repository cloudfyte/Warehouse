#!/usr/bin/env bash
# Daily PostgreSQL backup for Warehouse ERP
# Recommended cron: 0 2 * * * /path/to/ware_house/scripts/backup_db.sh >> /var/log/warehouse_backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/warehouse}"
KEEP_DAYS="${KEEP_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="warehouse_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup → ${BACKUP_DIR}/${FILENAME}"

docker exec warehouse_postgres pg_dump \
  -U warehouse \
  -d warehouse \
  --no-owner \
  --no-acl \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

SIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "[$(date)] Backup complete: ${FILENAME} (${SIZE})"

# Remove backups older than KEEP_DAYS days
find "$BACKUP_DIR" -name "warehouse_*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[$(date)] Cleaned backups older than ${KEEP_DAYS} days"
