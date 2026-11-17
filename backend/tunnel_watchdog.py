"""
tunnel_watchdog.py — Robust Persistent Localtunnel Daemon for Krishi Sahayak.
Auto-discovers active tunnel URL, updates frontend configurations, and sends periodic keep-alives.
"""
import os
import re
import sys
import time
import subprocess
import urllib.request
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [TunnelWatchdog] %(message)s")
logger = logging.getLogger("watchdog")

PREFERRED_SUBDOMAIN = "krishi-sahayak-ai"
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINTS_TS = os.path.join(ROOT_DIR, "frontend", "mobile", "constants", "backend_endpoints.ts")
ENV_FILE = os.path.join(ROOT_DIR, "frontend", "mobile", ".env")

active_tunnel_url = f"https://{PREFERRED_SUBDOMAIN}.loca.lt"

def update_frontend_endpoints(tunnel_url: str):
    """Dynamically updates frontend constants and .env with the live tunnel URL."""
    try:
        content = f"""/**
 * Auto-discovered backend endpoints and tunnel configurations.
 * Used by services/api.ts for transparent multi-endpoint auto-failover.
 */
export const DETECTED_LAN_IP = '10.180.42.135';
export const LAN_BACKEND_URL = `http://${{DETECTED_LAN_IP}}:8000`;
export const PUBLIC_TUNNEL_URL = '{tunnel_url}';
export const LOCALHOST_BACKEND_URL = 'http://localhost:8000';
export const EMULATOR_BACKEND_URL = 'http://10.0.2.2:8000';
"""
        with open(ENDPOINTS_TS, "w", encoding="utf-8") as f:
            f.write(content)
        
        with open(ENV_FILE, "w", encoding="utf-8") as f:
            f.write(f"EXPO_PUBLIC_API_URL={tunnel_url}\n")
            
        logger.info(f"Updated frontend endpoints to: {tunnel_url}")
    except Exception as e:
        logger.warning(f"Failed to update frontend config: {e}")

def spawn_localtunnel():
    """Starts localtunnel with fallback subdomain if preferred is held."""
    cmd = ["npx", "localtunnel", "--port", "8000", "--subdomain", PREFERRED_SUBDOMAIN]
    logger.info(f"Executing: {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True,
        bufsize=1,
    )
    return proc

def ping_health(url: str) -> bool:
    try:
        req = urllib.request.Request(f"{url}/health", headers={"bypass-tunnel-reminder": "true"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.getcode() == 200
    except Exception:
        return False

def main():
    global active_tunnel_url
    logger.info("Initializing Localtunnel Watchdog...")
    
    proc = spawn_localtunnel()
    
    # Read output until URL is discovered
    start_time = time.time()
    url_found = False
    
    while time.time() - start_time < 20:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.5)
            continue
        line = line.strip()
        logger.info(f"localtunnel output: {line}")
        match = re.search(r"https://[^\s]+\.loca\.lt", line)
        if match:
            active_tunnel_url = match.group(0).rstrip("/")
            url_found = True
            logger.info(f"Captured active tunnel URL: {active_tunnel_url}")
            update_frontend_endpoints(active_tunnel_url)
            break
            
    if not url_found:
        logger.warning(f"Using default fallback URL: {active_tunnel_url}")
        update_frontend_endpoints(active_tunnel_url)

    consecutive_failures = 0
    while True:
        try:
            if proc.poll() is not None:
                logger.warning("Localtunnel process terminated. Respawning...")
                proc = spawn_localtunnel()
                time.sleep(5)
                consecutive_failures = 0

            is_ok = ping_health(active_tunnel_url)
            if is_ok:
                consecutive_failures = 0
                logger.info(f"Health OK: {active_tunnel_url}/health (200 OK)")
            else:
                consecutive_failures += 1
                logger.warning(f"Health ping failed for {active_tunnel_url} (failure count: {consecutive_failures})")
                if consecutive_failures >= 4:
                    logger.warning("Excessive ping failures. Restarting localtunnel process...")
                    try:
                        proc.terminate()
                        proc.kill()
                    except Exception:
                        pass
                    proc = spawn_localtunnel()
                    time.sleep(5)
                    consecutive_failures = 0

            # Ping every 25 seconds for keepalive
            time.sleep(25)
        except KeyboardInterrupt:
            logger.info("Watchdog shutting down...")
            try:
                proc.terminate()
            except Exception:
                pass
            break
        except Exception as e:
            logger.warning(f"Watchdog loop iteration notice: {e}")
            time.sleep(15)

if __name__ == "__main__":
    main()
