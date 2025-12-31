#!/bin/bash

# Fast Deployment Script for Raspberry Pi 5
# Usage: ./deploy-rpi5.sh

echo "🚀 Starting Fast Deployment for Elevator Monitor..."

# 1. Update & Install Dependencies
echo "📦 Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg

# 1b. Install Node.js 22.x (Required for Vite/Electron)
echo "🟢 Upgrading Node.js to v22..."
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt-get install -y nodejs build-essential

# 1c. Install Runtime Libraries
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0 libfuse2

# 2. Install Project Dependencies
echo "📥 Installing project packages..."
npm install

# 3. Build Application
echo "Hammering out the build..."
npm run build

# 4. Setup Systemd Service (Auto-start)
echo "⚙️ Configuring auto-start service..."

SERVICE_FILE="/etc/systemd/system/elevator-monitor.service"
CURRENT_DIR=$(pwd)
USER=$(whoami)

sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=Elevator Emergency Monitor
After=network.target

[Service]
User=$USER
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/npm run dev
Restart=always
Environment=DISPLAY=:0

[Install]
WantedBy=graphical.target
EOL

# 5. Enable Service
sudo systemctl daemon-reload
sudo systemctl enable elevator-monitor
# sudo systemctl start elevator-monitor  <-- Uncomment to start immediately

echo "✅ Deployment Complete!"
echo "To start the app manually: npm run dev"
echo "To start the service: sudo systemctl start elevator-monitor"
