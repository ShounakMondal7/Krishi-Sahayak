/**
 * Auto-discovered backend endpoints and tunnel configurations.
 * Used by services/api.ts for transparent multi-endpoint auto-failover.
 */
export const DETECTED_LAN_IP = '10.180.42.135';
export const LAN_BACKEND_URL = `http://${DETECTED_LAN_IP}:8000`;
export const PUBLIC_TUNNEL_URL = 'https://krishi-sahayak-ai.loca.lt';
export const LOCALHOST_BACKEND_URL = 'http://localhost:8000';
export const EMULATOR_BACKEND_URL = 'http://10.0.2.2:8000';
