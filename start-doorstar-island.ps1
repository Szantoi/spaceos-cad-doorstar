# Doorstar knowledge-service indítása a 13458-as porton (Doorstar sziget).
# A 13457-et a CAD-általános sziget (knowledge-service-0.0.01) foglalja, ezért
# ez a folyamat 13458-on fut — saját KNOWLEDGE_BASE_PATH, saját ChromaDB
# collection (cabinetbilder-doorstar), a .env-ben beállítva.
$env:PORT = '13458'
Set-Location $PSScriptRoot
node dist/server.js
