"""
detection_engine.py
====================

Este es el "cerebro" de SecureDash. Lee los logs generados (o logs reales con
el mismo formato, ver docs/honeypot-setup.md) y aplica reglas de deteccion
basadas en patrones de ataque conocidos.

Cada regla esta documentada con:
  - Que detecta y por que (logica de seguridad real)
  - Umbral usado y justificacion
  - Tecnica MITRE ATT&CK asociada

Salida: pipeline/output/dashboard_data.json
Este JSON tiene la MISMA forma que consumiria el frontend de React, y es el
mismo formato que se insertaria en las tablas de Supabase (ver supabase/schema.sql).
"""

import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

MITRE = json.loads((BASE_DIR / "mitre_mapping.json").read_text())


def load_meta():
    """
    Carga la metadata de la ventana temporal generada por log_generator.py
    (data/meta.json: window_start + window_hours).

    Si el archivo no existe (ej. al importar este modulo para tests unitarios
    sin haber corrido el generador primero), devuelve una ventana de 24h que
    termina ahora. Las funciones que dependen de esto (deteccion fuera de
    horario, agregacion por hora) reciben window_start_dt explicitamente, por
    lo que los tests pueden pasar cualquier valor fijo sin depender de este
    fallback.
    """
    meta_path = DATA_DIR / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        window_start = datetime.strptime(meta["window_start"], "%Y-%m-%dT%H:%M:%S.%fZ")
        return window_start, meta["window_hours"]
    return datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=24), 24


def relative_hour(timestamp_str, window_start_dt):
    """
    Hora relativa (0..window_hours-1) de un timestamp dentro de la ventana,
    medida desde window_start_dt. Usamos esto en vez de la hora real del
    reloj para que las reglas de deteccion sean deterministas e
    independientes de cuando se ejecute el pipeline (ver business_hours_offset
    en log_generator.py, que usa exactamente la misma convencion).
    """
    delta = parse_ts(timestamp_str) - window_start_dt
    return int(delta.total_seconds() // 3600)

# Geolocalizacion: para la demo usamos un mapeo local (las IPs son simuladas).
# En produccion, reemplazar lookup_country() por una llamada real a una API
# como ip-api.com (gratuita, sin key para bajo volumen):
#
#   import requests
#   def lookup_country(ip):
#       r = requests.get(f"http://ip-api.com/json/{ip}?fields=country,countryCode")
#       data = r.json()
#       return data["country"], data["countryCode"]
GEO_LOOKUP = {
    "185.220.101.47": ("Rusia", "RU"),
    "103.88.85.254": ("China", "CN"),
    "91.191.209.40": ("Alemania", "DE"),
    "45.155.205.105": ("Brasil", "BR"),
    "134.122.52.13": ("Estados Unidos", "US"),
}


def lookup_country(ip):
    return GEO_LOOKUP.get(ip, ("Desconocido", "??"))


def load_jsonl(filename):
    path = DATA_DIR / filename
    events = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def parse_ts(t):
    return datetime.strptime(t, "%Y-%m-%dT%H:%M:%S.%fZ")


# ---------------------------------------------------------------------------
# REGLA 1 - Fuerza bruta
# Logica: si una misma IP acumula N o mas intentos de login FALLIDOS dentro
# de una ventana corta de tiempo, es estadisticamente imposible que sea un
# usuario humano escribiendo mal su clave -> es un script automatizado.
# Umbral: 5 fallos en 60 segundos (valor tipico usado por fail2ban por defecto).
# MITRE: T1110 - Brute Force
# ---------------------------------------------------------------------------
def detect_brute_force(auth_events, window_seconds=60, threshold=5):
    alerts = []
    failed = [e for e in auth_events if e["status"] == "failed"]
    by_ip = defaultdict(list)
    for e in failed:
        by_ip[e["source_ip"]].append(e)

    for ip, events in by_ip.items():
        events.sort(key=lambda e: e["timestamp"])
        times = [parse_ts(e["timestamp"]) for e in events]

        # ventana deslizante simple
        i = 0
        for j in range(len(times)):
            while (times[j] - times[i]).total_seconds() > window_seconds:
                i += 1
            count_in_window = j - i + 1
            if count_in_window >= threshold:
                country, code = lookup_country(ip)
                alerts.append({
                    "level": "critical",
                    "title": "Ataque de fuerza bruta detectado",
                    "description": (
                        f"{count_in_window} intentos de login fallidos contra el usuario "
                        f"'{events[j]['username']}' desde {ip} en menos de {window_seconds}s "
                        f"(servicio: {events[j]['service']})."
                    ),
                    "source_ip": ip,
                    "country": country,
                    "country_code": code,
                    "mitre_id": "T1110",
                    "mitre_name": MITRE["T1110"]["name_es"],
                    "evidence_count": count_in_window,
                    "timestamp": events[j]["timestamp"],
                })
                break  # una alerta por IP es suficiente para esta demo
    return alerts


# ---------------------------------------------------------------------------
# REGLA 2 - Inyeccion SQL (SQLi)
# Logica: se busca en el path/query de las peticiones HTTP patrones de
# sintaxis SQL que NUNCA deberian aparecer en un input legitimo de usuario
# (comillas + OR, UNION SELECT, comentarios SQL --, DROP TABLE, etc).
# MITRE: T1190 - Exploit Public-Facing Application
# ---------------------------------------------------------------------------
SQLI_PATTERNS = [
    r"(\bOR\b\s*['\"]?\d+['\"]?\s*=\s*['\"]?\d+)",   # OR 1=1 / OR '1'='1
    r"(\bUNION\b\s+\bSELECT\b)",
    r"(--\s*$)",
    r"(\bDROP\b\s+\bTABLE\b)",
    r"(admin'--)",
]
SQLI_REGEX = re.compile("|".join(SQLI_PATTERNS), re.IGNORECASE)


def detect_sqli(access_events):
    alerts = []
    by_ip = defaultdict(list)
    for e in access_events:
        target = e.get("query", "") + " " + e.get("path", "")
        if SQLI_REGEX.search(target):
            by_ip[e["source_ip"]].append(e)

    # Se agrupan todos los hits de SQLi de una misma IP en UNA alerta con
    # un contador de evidencia, en vez de una alerta por peticion. Asi se
    # ve como lo mostraria un SOC real: "5 intentos de SQLi desde esta IP",
    # no 5 tarjetas casi identicas en el dashboard.
    for ip, events in by_ip.items():
        events.sort(key=lambda e: e["timestamp"])
        country, code = lookup_country(ip)
        first, last = events[0], events[-1]
        alerts.append({
            "level": "critical",
            "title": "Inyeccion SQL detectada",
            "description": (
                f"{len(events)} peticiones con payloads SQL maliciosos hacia "
                f"{first['path']} desde {ip}. Ejemplo de payload: \"{first['query'][:60]}\""
            ),
            "source_ip": ip,
            "country": country,
            "country_code": code,
            "mitre_id": "T1190",
            "mitre_name": MITRE["T1190"]["name_es"],
            "evidence_count": len(events),
            "timestamp": last["timestamp"],
        })
    return alerts


# ---------------------------------------------------------------------------
# REGLA 3 - Escaneo de puertos
# Logica: una IP que intenta conectarse a una gran cantidad de puertos
# DISTINTOS en poco tiempo esta haciendo reconocimiento (buscando servicios
# expuestos), no trafico normal de aplicacion.
# Umbral: 50+ puertos distintos en 60 segundos.
# MITRE: T1595.001 - Active Scanning: Scanning IP Blocks
# ---------------------------------------------------------------------------
def detect_port_scan(network_events, window_seconds=60, threshold=50):
    alerts = []
    by_ip = defaultdict(list)
    for e in network_events:
        by_ip[e["source_ip"]].append(e)

    for ip, events in by_ip.items():
        events.sort(key=lambda e: e["timestamp"])
        times = [parse_ts(e["timestamp"]) for e in events]
        ports = [e["dest_port"] for e in events]

        i = 0
        seen_ports = set()
        for j in range(len(times)):
            while (times[j] - times[i]).total_seconds() > window_seconds:
                i += 1
            window_ports = set(ports[i:j + 1])
            if len(window_ports) >= threshold:
                country, code = lookup_country(ip)
                alerts.append({
                    "level": "high",
                    "title": "Escaneo de puertos masivo",
                    "description": (
                        f"{len(window_ports)} puertos distintos escaneados desde {ip} "
                        f"en menos de {window_seconds}s."
                    ),
                    "source_ip": ip,
                    "country": country,
                    "country_code": code,
                    "mitre_id": "T1595.001",
                    "mitre_name": MITRE["T1595.001"]["name_es"],
                    "evidence_count": len(window_ports),
                    "timestamp": events[j]["timestamp"],
                })
                break
    return alerts


# ---------------------------------------------------------------------------
# REGLA 4 - Credential stuffing
# Logica: una IP que prueba varios USUARIOS distintos (no solo reintenta el
# mismo) y finalmente logra un login exitoso es consistente con el uso de
# una lista de credenciales filtradas (credential stuffing), no un usuario
# legitimo que olvido su clave.
# MITRE: T1110.004 - Credential Stuffing
# ---------------------------------------------------------------------------
def detect_credential_stuffing(auth_events, window_seconds=300, fail_threshold=3):
    alerts = []
    by_ip = defaultdict(list)
    for e in auth_events:
        by_ip[e["source_ip"]].append(e)

    for ip, events in by_ip.items():
        events.sort(key=lambda e: e["timestamp"])
        fails = []
        for e in events:
            t = parse_ts(e["timestamp"])
            fails = [f for f in fails if (t - f[1]).total_seconds() <= window_seconds]
            if e["status"] == "failed":
                fails.append((e["username"], t))
            elif e["status"] == "success" and len({u for u, _ in fails}) >= fail_threshold:
                country, code = lookup_country(ip)
                alerts.append({
                    "level": "high",
                    "title": "Posible credential stuffing - login exitoso tras multiples usuarios fallidos",
                    "description": (
                        f"Desde {ip} se probaron {len({u for u, _ in fails})} usuarios distintos "
                        f"sin exito y luego se logro acceso como '{e['username']}'."
                    ),
                    "source_ip": ip,
                    "country": country,
                    "country_code": code,
                    "mitre_id": "T1110.004",
                    "mitre_name": MITRE["T1110.004"]["name_es"],
                    "evidence_count": len(fails) + 1,
                    "timestamp": e["timestamp"],
                })
                fails = []
    return alerts


# ---------------------------------------------------------------------------
# REGLA 5 - Acceso fuera de horario (anomalia de comportamiento)
# Logica: un login exitoso de una cuenta legitima en horario no laboral
# (00:00-06:00) no es necesariamente un ataque externo, pero es una anomalia
# que merece revision: puede ser una cuenta comprometida (insider threat o
# credenciales robadas usadas por un tercero).
# MITRE: T1078 - Valid Accounts
# ---------------------------------------------------------------------------
def detect_offhours_access(auth_events, window_start_dt, start_rel_hour=0, end_rel_hour=6):
    alerts = []
    for e in auth_events:
        if e["status"] != "success":
            continue
        rel_hour = relative_hour(e["timestamp"], window_start_dt)
        if start_rel_hour <= rel_hour < end_rel_hour:
            country, code = lookup_country(e["source_ip"])
            alerts.append({
                "level": "medium",
                "title": "Acceso exitoso en horario no laboral",
                "description": (
                    f"Usuario '{e['username']}' inicio sesion desde {e['source_ip']} "
                    f"durante la madrugada (hora relativa {rel_hour} de la ventana "
                    f"monitoreada), fuera del patron habitual de trafico."
                ),
                "source_ip": e["source_ip"],
                "country": country if country != "Desconocido" else "Chile",
                "country_code": code if code != "??" else "CL",
                "mitre_id": "T1078",
                "mitre_name": MITRE["T1078"]["name_es"],
                "evidence_count": 1,
                "timestamp": e["timestamp"],
            })
    return alerts


# ---------------------------------------------------------------------------
# Agregacion: construir el JSON final que consume el dashboard
# ---------------------------------------------------------------------------
LEVEL_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def build_ip_summary(alerts):
    """
    Tabla de IPs atacantes EXTERNAS (para el panel 'Top IPs atacantes').

    Las alertas de "acceso fuera de horario" (T1078) corresponden a IPs
    internas/chilenas con cuentas legitimas que iniciaron sesion en horario
    anomalo - son una categoria distinta (anomalia de cuenta, no atacante
    externo) y se excluyen de esta tabla para no mezclar ambos conceptos.
    """
    by_ip = defaultdict(lambda: {"attempts": 0, "risk": 0, "types": set(), "country": "", "country_code": ""})
    for a in alerts:
        if a["country_code"] == "CL":
            continue
        entry = by_ip[a["source_ip"]]
        entry["attempts"] += a["evidence_count"]
        entry["risk"] = max(entry["risk"], LEVEL_RANK[a["level"]] * 22 + min(a["evidence_count"], 14))
        entry["types"].add(a["mitre_name"])
        entry["country"] = a["country"]
        entry["country_code"] = a["country_code"]

    summary = []
    for ip, e in by_ip.items():
        summary.append({
            "ip": ip,
            "country": e["country"],
            "country_code": e["country_code"],
            "attempts": e["attempts"],
            "risk_score": min(100, e["risk"]),
            "attack_types": sorted(e["types"]),
        })
    summary.sort(key=lambda x: x["risk_score"], reverse=True)
    return summary


def build_hourly_threats(alerts, auth_events, window_start_dt, hours):
    # Para cada una de las `hours` horas de la ventana, cuenta:
    #  - critical_high: alertas criticas/altas detectadas en esa hora
    #  - medium_low: eventos "failed" (ruido base) + alertas medium/low
    labels, crit_high, med_low = [], [], []
    for h in range(hours):
        bucket_time = window_start_dt + timedelta(hours=h)
        labels.append(f"{bucket_time.hour:02d}:00")
        crit_high.append(0)
        med_low.append(0)

    for a in alerts:
        idx = relative_hour(a["timestamp"], window_start_dt)
        if 0 <= idx < hours:
            if a["level"] in ("critical", "high"):
                crit_high[idx] += 1
            else:
                med_low[idx] += 1

    for e in auth_events:
        if e["status"] == "failed":
            idx = relative_hour(e["timestamp"], window_start_dt)
            if 0 <= idx < hours:
                med_low[idx] += 1

    return {"labels": labels, "critical_high": crit_high, "medium_low": med_low}


def build_type_distribution(alerts):
    counts = defaultdict(int)
    for a in alerts:
        counts[a["mitre_name"]] += 1
    total = sum(counts.values()) or 1
    labels = list(counts.keys())
    values = [round(c / total * 100, 1) for c in counts.values()]
    return {"labels": labels, "values": values}


def main():
    window_start_dt, window_hours = load_meta()

    auth_events = load_jsonl("auth.log.jsonl")
    access_events = load_jsonl("access.log.jsonl")
    network_events = load_jsonl("network.log.jsonl")

    alerts = []
    alerts += detect_brute_force(auth_events)
    alerts += detect_sqli(access_events)
    alerts += detect_port_scan(network_events)
    alerts += detect_credential_stuffing(auth_events)
    alerts += detect_offhours_access(auth_events, window_start_dt)

    # ordenar por severidad y luego por timestamp descendente
    alerts.sort(key=lambda a: (LEVEL_RANK[a["level"]], a["timestamp"]), reverse=True)
    for i, a in enumerate(alerts, start=1):
        a["id"] = i
        a["resolved"] = False  # ver frontend: AlertsPanel permite marcar como resuelta en memoria

    ip_summary = build_ip_summary(alerts)
    hourly = build_hourly_threats(alerts, auth_events, window_start_dt, window_hours)
    type_dist = build_type_distribution(alerts)

    total_events = len(auth_events) + len(access_events) + len(network_events)
    failed_logins = sum(1 for e in auth_events if e["status"] == "failed")
    unique_ips = len(ip_summary)
    active_alerts = sum(1 for a in alerts if a["level"] in ("critical", "high"))

    dashboard_data = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "alerts": alerts,
        "ip_summary": ip_summary,
        "hourly_threats": hourly,
        "type_distribution": type_dist,
        "stats": {
            "total_events": total_events,
            "failed_logins": failed_logins,
            "unique_attacker_ips": unique_ips,
            "active_alerts": active_alerts,
        },
    }

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "dashboard_data.json"
    out_path.write_text(json.dumps(dashboard_data, indent=2, ensure_ascii=False))

    print(f"{len(alerts)} alertas generadas:")
    for a in alerts:
        print(f"  [{a['level'].upper():8s}] {a['mitre_id']:10s} {a['title']} ({a['source_ip']})")
    print(f"\nGuardado en {out_path}")


if __name__ == "__main__":
    main()
