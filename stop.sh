#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Job Finder — Stopping...          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

docker compose down --remove-orphans

echo ""
echo "✅  All containers stopped."
echo ""
read -p "Press Enter to close..."
