#!/bin/bash
# Deploy Fetchr Admin Panel to VPS
# Run from local machine: bash deploy.sh

VPS="ubuntu@152.228.137.122"
REMOTE_DIR="/home/ubuntu/fetchr-admin"

echo "=== Deploying Fetchr Admin to VPS ==="

# 1. Create remote directory
ssh $VPS "mkdir -p $REMOTE_DIR"

# 2. Sync files (exclude node_modules, .auth.json, config.json, electron stuff)
rsync -avz --exclude='node_modules' --exclude='.auth.json' --exclude='config.json' --exclude='electron.js' \
    ~/fetchr-server-manager/ $VPS:$REMOTE_DIR/

# 3. Create server-mode config on VPS (no SSH needed since it runs locally)
ssh $VPS "cat > $REMOTE_DIR/config.json << 'EOF'
{
  \"server\": {
    \"host\": \"localhost\",
    \"port\": 22,
    \"username\": \"ubuntu\",
    \"privateKeyPath\": \"~/.ssh/id_ed25519\"
  },
  \"stripe\": {
    \"apiKey\": \"rk_test_51TmJq7HasvxF8FR00g4WqckmnKH4aBsSHFT1yh6NtaglcEifrE4gpHHz4bKndGnFwlUmf7SsaRUss6Co7bmG9Qk600avTEj9G1\"
  },
  \"cloudflare\": {
    \"apiToken\": \"cfut_TZUPRj4YGQgzg7oTQCFE7swpmdsjlDm6H7xd8H5g7905070f\",
    \"zoneId\": \"c0eaf2d01505f6905998da26db7482d7\"
  }
}
EOF"

# 4. Install dependencies on VPS
ssh $VPS "cd $REMOTE_DIR && npm install --production"

# 5. Create systemd service (runs independently of Docker/Fetchr)
ssh $VPS "sudo tee /etc/systemd/system/fetchr-admin.service > /dev/null << 'EOF'
[Unit]
Description=Fetchr Admin Panel
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/fetchr-admin
Environment=ADMIN_MODE=server
Environment=PORT=3001
Environment=JWT_SECRET=$(openssl rand -hex 32)
ExecStart=/usr/bin/node main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

# 6. Enable and start the service
ssh $VPS "sudo systemctl daemon-reload && sudo systemctl enable fetchr-admin && sudo systemctl restart fetchr-admin"

# 7. Check status
ssh $VPS "sudo systemctl status fetchr-admin --no-pager"

echo ""
echo "=== Fetchr Admin deployed! ==="
echo "Running on VPS port 3001 (systemd, independent of Docker)"
echo "Next: add admin.fetchr.fr to Caddy and Cloudflare DNS"
