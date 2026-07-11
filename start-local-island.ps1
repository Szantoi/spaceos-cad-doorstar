# Lokális knowledge-service indítása a 13457-es porton (Cabinet_bilder sziget).
# MIÉRT 13457? A 3456 a spaceos-gabor VPS SSH-forwardja, és a VPS a 3457-et is
# használja (a VS Code Remote-SSH azt is auto-forwardolja 127.0.0.1-re, ami
# leárnyékolja a lokális listener-t). A 13457 ütközésmentes, egyértelműen lokális.
$env:PORT = '13457'
Set-Location $PSScriptRoot
node dist/server.js
