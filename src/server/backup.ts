export function startBackupCron() {
  // Do not report backups as completed until a real Firestore export target
  // and a tested restore procedure have been configured.
  console.warn("[Backup] Automated backups are disabled. No backup was created.");
}
