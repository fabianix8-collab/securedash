"""
log_generator.py
=================

Genera logs simulados pero realistas para SecureDash.

IMPORTANTE - HONESTIDAD SOBRE LOS DATOS:
Estos logs son SINTETICOS. No provienen de ningun sistema en produccion.
Se generan con un patron de trafico "normal" (ruido de fondo) mas un set
de ataques INYECTADOS deliberadamente, para que detection_engine.py tenga
patrones reales que detectar usando reglas, no datos hardcodeados.

En produccion estos archivos .jsonl serian reemplazados por:
  - Logs reales de un honeypot (ver docs/honeypot-setup.md)
  - Logs de auth.log / nginx access.log de un servidor real
  - Feeds de threat intelligence (AbuseIPDB, AlienVault OTX)

Salida (formato JSON Lines - 1 evento por linea, igual a como lo entregan
shippers reales como Filebeat/Fluentd):
  data/auth.log.jsonl     -> intentos de login (SSH / panel web)
  data/access.log.jsonl   -> peticiones HTTP (para detectar SQLi)
  data/network.log.jsonl  -> conexiones de red (para detectar escaneo de puertos)
"""

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = 42
random.seed(SEED)

# Ventana temporal total simulada: ultimas 24 horas
WINDOW_HOURS = 24
NOW = datetime.now(timezone.utc)
WINDOW_START = NOW - timedelta(hours=WINDOW_HOURS)

# --- "Trafico normal" (usuarios legitimos, IPs internas/chilenas) ---
NORMAL_USERS = ["jperez", "mgonzalez", "acontreras", "rsoto", "ti_soporte", "fmunoz"]
NORMAL_IPS = ["190.55.12.10", "190.55.12.11", "200.27.34.5", "200.27.34.6", "201.238.90.4"]
NORMAL_PATHS = ["/", "/dashboard", "/api/profile", "/api/orders", "/static/app.js", "/favicon.ico"]

# --- IPs atacantes (rangos asociados en reportes publicos a Tor / abuso conocido) ---
ATTACKER_IPS = {
    "185.220.101.47": {"country": "Rusia", "code": "RU"},
    "103.88.85.254": {"country": "China", "code": "CN"},
    "91.191.209.40": {"country": "Alemania", "code": "DE"},
    "45.155.205.105": {"country": "Brasil", "code": "BR"},
    "134.122.52.13": {"country": "Estados Unidos", "code": "US"},
}

SQLI_PAYLOADS = [
    "' OR '1'='1",
    "admin'--",
    "1; DROP TABLE users",
    "' UNION SELECT username,password FROM users--",
    "1' OR 1=1 LIMIT 1--",
]


def ts(offset_seconds):
    """Convierte un offset en segundos desde WINDOW_START a timestamp ISO con sufijo Z."""
    dt = WINDOW_START + timedelta(seconds=offset_seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond:06d}Z"


def business_hours_offset():
    """
    Genera un offset (en segundos) dentro de la ventana, sesgado hacia
    "horario laboral simulado".

    Clave: usamos la HORA RELATIVA dentro de la ventana (offset // 3600,
    rango 0-23 para una ventana de 24h) en vez de la hora real del reloj.
    Esto hace la simulacion DETERMINISTA y reproducible sin importar la
    hora real en que se ejecute el script.

    Convencion fija para esta simulacion:
      - horas relativas 8-20  -> "horario laboral"      (peso alto)
      - horas relativas 6-8 y 20-23 -> "horas de borde" (peso medio)
      - horas relativas 0-6   -> "madrugada simulada"   (peso bajo)

    detect_offhours_access() en detection_engine.py usa la MISMA
    convencion (horas relativas 0-6) para decidir que es "fuera de horario".
    """
    while True:
        offset = random.randint(0, WINDOW_HOURS * 3600 - 1)
        rel_hour = offset // 3600
        if 8 <= rel_hour < 20:
            accept_prob = 1.0
        elif 6 <= rel_hour < 8 or 20 <= rel_hour < 23:
            accept_prob = 0.3
        else:
            accept_prob = 0.05
        if random.random() < accept_prob:
            return offset


def write_jsonl(path, events):
    events.sort(key=lambda e: e["timestamp"])
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# 1. Ruido de fondo: trafico normal distribuido en las 24 horas
# ---------------------------------------------------------------------------
def generate_background_traffic():
    auth_events, access_events, net_events = [], [], []

    # Logins normales exitosos, concentrados en horario laboral
    for _ in range(140):
        offset = business_hours_offset()
        ip = random.choice(NORMAL_IPS)
        auth_events.append({
            "timestamp": ts(offset),
            "source_ip": ip,
            "username": random.choice(NORMAL_USERS),
            "service": random.choice(["ssh", "web_login"]),
            "status": "success",
            "event": "auth",
        })

    # Algunos typos / passwords mal escritos (ruido normal, no es ataque)
    for _ in range(20):
        offset = business_hours_offset()
        ip = random.choice(NORMAL_IPS)
        auth_events.append({
            "timestamp": ts(offset),
            "source_ip": ip,
            "username": random.choice(NORMAL_USERS),
            "service": "web_login",
            "status": "failed",
            "event": "auth",
        })

    # Peticiones HTTP normales
    for _ in range(220):
        offset = business_hours_offset()
        access_events.append({
            "timestamp": ts(offset),
            "source_ip": random.choice(NORMAL_IPS),
            "method": "GET",
            "path": random.choice(NORMAL_PATHS),
            "query": "",
            "status_code": 200,
            "event": "http_request",
        })

    return auth_events, access_events, net_events


# ---------------------------------------------------------------------------
# 2. Ataque inyectado: Fuerza bruta SSH
#    -> 1 IP envia decenas de intentos fallidos contra "root" en pocos segundos
# ---------------------------------------------------------------------------
def inject_brute_force(auth_events):
    ip = "185.220.101.47"
    base_offset = 9 * 3600 + 14 * 60  # ~09:14 dentro de la ventana
    for i in range(42):
        auth_events.append({
            "timestamp": ts(base_offset + i * 2),  # un intento cada ~2s
            "source_ip": ip,
            "username": "root",
            "service": "ssh",
            "status": "failed",
            "event": "auth",
        })


# ---------------------------------------------------------------------------
# 3. Ataque inyectado: Inyeccion SQL contra /api/auth
# ---------------------------------------------------------------------------
def inject_sqli(access_events):
    ip = "103.88.85.254"
    base_offset = 9 * 3600 + 26 * 60
    for i, payload in enumerate(SQLI_PAYLOADS):
        access_events.append({
            "timestamp": ts(base_offset + i * 15),
            "source_ip": ip,
            "method": "POST",
            "path": "/api/auth",
            "query": f"username={payload}&password=x",
            "status_code": 403,
            "event": "http_request",
        })


# ---------------------------------------------------------------------------
# 4. Ataque inyectado: Escaneo de puertos
#    -> 1 IP conecta a cientos de puertos distintos en segundos
# ---------------------------------------------------------------------------
def inject_port_scan(net_events):
    ip = "91.191.209.40"
    base_offset = 10 * 3600 + 2 * 60
    ports = random.sample(range(1, 65535), 340)
    for i, port in enumerate(ports):
        net_events.append({
            "timestamp": ts(base_offset + i * 0.1),
            "source_ip": ip,
            "dest_port": port,
            "protocol": "TCP",
            "event": "connection",
        })


# ---------------------------------------------------------------------------
# 5. Ataque inyectado: Credential stuffing
#    -> Varios intentos fallidos con distintos usuarios, luego 1 exito
# ---------------------------------------------------------------------------
def inject_credential_stuffing(auth_events):
    ip = "45.155.205.105"
    base_offset = 10 * 3600 + 40 * 60
    for i, user in enumerate(["admin", "administrator", "test", "jperez"]):
        status = "failed" if user != "jperez" else "success"
        auth_events.append({
            "timestamp": ts(base_offset + i * 8),
            "source_ip": ip,
            "username": user,
            "service": "web_login",
            "status": status,
            "event": "auth",
        })


# ---------------------------------------------------------------------------
# 6. Ataque inyectado: Acceso fuera de horario (posible insider / cuenta comprometida)
#    -> hora relativa 3 (madrugada simulada, ver business_hours_offset)
# ---------------------------------------------------------------------------
def inject_offhours_access(auth_events):
    base_offset = 3 * 3600 + 14 * 60  # hora relativa 3 -> "madrugada simulada"
    auth_events.append({
        "timestamp": ts(base_offset),
        "source_ip": "200.27.34.5",
        "username": "acontreras",
        "service": "web_login",
        "status": "success",
        "event": "auth",
    })


def main():
    auth_events, access_events, net_events = generate_background_traffic()

    inject_brute_force(auth_events)
    inject_sqli(access_events)
    inject_port_scan(net_events)
    inject_credential_stuffing(auth_events)
    inject_offhours_access(auth_events)

    write_jsonl("data/auth.log.jsonl", auth_events)
    write_jsonl("data/access.log.jsonl", access_events)
    write_jsonl("data/network.log.jsonl", net_events)

    # meta.json: le dice al motor de deteccion donde empieza la ventana y
    # cuanto dura, para que pueda calcular "horas relativas" sin depender
    # del reloj real (ver business_hours_offset mas arriba).
    with open("data/meta.json", "w") as f:
        json.dump({"window_start": ts(0), "window_hours": WINDOW_HOURS}, f, indent=2)

    print(f"auth.log.jsonl:    {len(auth_events)} eventos")
    print(f"access.log.jsonl:  {len(access_events)} eventos")
    print(f"network.log.jsonl: {len(net_events)} eventos")
    print(f"Ventana temporal: {ts(0)} -> {ts(WINDOW_HOURS * 3600 - 1)}  ({WINDOW_HOURS}h)")


if __name__ == "__main__":
    main()
