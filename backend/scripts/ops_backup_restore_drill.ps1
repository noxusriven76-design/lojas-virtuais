param(
  [string]$MySqlContainer = "loja_mysql",
  [string]$MySqlRootPassword = "change-me-strong-root",
  [string[]]$Databases = @("loja_core", "loja_roupas", "loja_relogios", "loja_agro"),
  [string]$DrillSourceDatabase = "loja_agro"
)

$ErrorActionPreference = "Stop"

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "backups/phase8_$ts"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($db in $Databases) {
  docker exec $MySqlContainer mysqldump -uroot -p$MySqlRootPassword --single-transaction --set-gtid-purged=OFF $db > "$backupDir/$db.sql"
}

$drillDb = "${DrillSourceDatabase}_restore_test"
docker exec $MySqlContainer mysql -uroot -p$MySqlRootPassword -e "DROP DATABASE IF EXISTS $drillDb; CREATE DATABASE $drillDb;"
Get-Content "$backupDir/$DrillSourceDatabase.sql" | docker exec -i $MySqlContainer mysql -uroot -p$MySqlRootPassword $drillDb

$tableCount = docker exec $MySqlContainer mysql -uroot -p$MySqlRootPassword -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$drillDb';"
$ordersCount = docker exec $MySqlContainer mysql -uroot -p$MySqlRootPassword -N -e "SELECT COUNT(*) FROM $drillDb.orders;"
$productsCount = docker exec $MySqlContainer mysql -uroot -p$MySqlRootPassword -N -e "SELECT COUNT(*) FROM $drillDb.products;"

$log = @()
$log += "date=$(Get-Date -Format s)"
$log += "backup_dir=$backupDir"
$log += "restore_test_db=$drillDb"
$log += "table_count=$tableCount"
$log += "orders_count=$ordersCount"
$log += "products_count=$productsCount"
$log += "result=ok"
$log | Set-Content "$backupDir/restore_drill_evidence.log"

docker exec $MySqlContainer mysql -uroot -p$MySqlRootPassword -e "DROP DATABASE IF EXISTS $drillDb;"

Get-Content "$backupDir/restore_drill_evidence.log"
