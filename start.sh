#!/bin/bash
# ╔══════════════════════════════════════════╗
# ║        Job Finder — Start Script         ║
# ╚══════════════════════════════════════════╝

cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Job Finder — Starting...          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Check Docker is installed ────────────────
if ! command -v docker &>/dev/null; then
    echo "❌  Docker is not installed."
    echo "    Install it from: https://docs.docker.com/engine/install/"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# ── Check Docker daemon is running ───────────
if ! docker info &>/dev/null 2>&1; then
    echo "⚠️   Docker is not running. Starting Docker..."
    sudo systemctl start docker 2>/dev/null || true
    sleep 3
    if ! docker info &>/dev/null 2>&1; then
        echo "❌  Could not start Docker. Please start it manually."
        echo ""
        read -p "Press Enter to close..."
        exit 1
    fi
fi

# ── Check .env file exists ───────────────────
if [ ! -f ".env" ]; then
    echo "❌  .env file not found!"
    echo "    Run this command to create it:"
    echo "    cp .env.example .env"
    echo "    Then fill in your API keys."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# ── Stop old containers ──────────────────────
echo "🔄  Stopping any old containers..."
docker compose down --remove-orphans &>/dev/null

# ── Start containers ─────────────────────────
echo "🚀  Starting PostgreSQL + Backend..."
echo ""
docker compose up -d

if [ $? -ne 0 ]; then
    echo ""
    echo "❌  Failed to start. Check Docker and your .env file."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# ── Wait until healthy ────────────────────────
echo ""
echo "⏳  Waiting for app to be ready..."
MAX_WAIT=60
COUNT=0
while true; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null)
    if [ "$STATUS" = "200" ]; then
        break
    fi
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_WAIT ]; then
        echo "❌  App didn't start in time. Run: docker compose logs"
        echo ""
        read -p "Press Enter to close..."
        exit 1
    fi
    printf "."
    sleep 1
done

# ── Open browser ─────────────────────────────
echo ""
echo ""
echo "✅  App is ready!"
echo ""

if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:8000 &>/dev/null &
elif command -v gnome-open &>/dev/null; then
    gnome-open http://localhost:8000 &>/dev/null &
fi

echo "╔══════════════════════════════════════════╗"
echo "║  🌐  http://localhost:8000               ║"
echo "║                                          ║"
echo "║  To stop:  ./stop.sh                     ║"
echo "║  Or run:   docker compose down           ║"
echo "╚══════════════════════════════════════════╝"
echo ""
read -p "Press Enter to close this window (app keeps running)..."
