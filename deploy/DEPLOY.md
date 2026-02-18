# Trenchable API — VPS Deployment Guide

## Prerequisites on your VPS

```bash
# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Install git
sudo apt install -y git
```

---

## 1. Push your code to GitHub

```bash
# On your local machine (monorepo root)
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/trenchable.git
git push -u origin main
```

---

## 2. First deploy on the VPS

```bash
# SSH into your VPS
ssh user@YOUR_VPS_IP

# Download just the deploy script
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/trenchable/main/deploy/deploy.sh
chmod +x deploy.sh

# Edit REPO_URL inside deploy.sh first
nano deploy.sh   # set REPO_URL at the top

# Run setup (clones repo, builds image, starts container)
./deploy.sh setup
```

---

## 3. Fill in your .env

```bash
nano /opt/trenchable/.env
```

Required values:
| Key | Value |
|---|---|
| `SOLANA_RPC_PRIMARY` | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` |
| `API_KEYS` | `openssl rand -hex 32` output |
| `CORS_ORIGIN` | `https://api.YOUR_DOMAIN.com` |

After editing, restart:
```bash
./deploy.sh restart
```

---

## 4. Set up HTTPS with nginx

```bash
# Copy nginx config
sudo cp /opt/trenchable/deploy/nginx.conf /etc/nginx/sites-available/trenchable

# Edit your domain
sudo nano /etc/nginx/sites-available/trenchable
# Replace api.YOUR_DOMAIN.com with your actual subdomain

# Enable site
sudo ln -s /etc/nginx/sites-available/trenchable /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate (point your DNS A record to VPS IP first)
sudo certbot --nginx -d api.YOUR_DOMAIN.com
```

---

## 5. Update extension to point at production API

In `apps/extension/lib/config.ts`:
```ts
export const API_BASE_URL = 'https://api.YOUR_DOMAIN.com';
```

Then rebuild the extension:
```bash
cd apps/extension && node build.mjs
```

Reload the extension in `chrome://extensions`.

---

## 6. Future re-deploys

```bash
# On the VPS
cd /path/to/deploy.sh
./deploy.sh update    # pulls latest code, rebuilds image, restarts
```

---

## Useful commands

```bash
./deploy.sh logs      # tail container logs
./deploy.sh status    # check if container is running
docker exec -it trenchable-api sh   # shell into container
```

---

## Generate API key

```bash
openssl rand -hex 32
```

Add to `API_KEYS` in `.env` (comma-separated for multiple keys).
