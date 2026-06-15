#!/bin/bash

echo "================================"
echo "  Job Finder - Starting App"
echo "================================"
echo

cd "$(dirname "$0")"

if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker is not installed."
    echo "Install it from https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info &>/dev/null; then
    echo "ERROR: Docker is not running."
    echo "Start Docker and try again."
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found."
    echo "Please create a .env file with your API keys. See SETUP.md for details."
    exit 1
fi

echo "Stopping any existing containers..."
docker compose down &>/dev/null

echo "Starting services (PostgreSQL + Backend)..."
docker compose up -d

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to start services. Check your .env file and Docker setup."
    exit 1
fi

echo
echo "Waiting for app to be ready..."
sleep 5

echo "Opening browser..."
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:8000
elif command -v gnome-open &>/dev/null; then
    gnome-open http://localhost:8000
fi

echo
echo "================================"
echo "  App is running!"
echo "  URL: http://localhost:8000"
echo "  To stop: docker compose down"
echo "================================"
