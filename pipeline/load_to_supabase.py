"""
load_to_supabase.py
====================

Toma el archivo output/dashboard_data.json (generado por detection_engine.py)
y lo inserta en Supabase.

USO:
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # service_role, NO la anon key
    python3 load_to_supabase.py

POR QUE service_role Y NO anon:
La tabla 'alerts' tiene RLS habilitado y SOLO permite SELECT publico (ver
supabase/schema.sql). Insertar filas requiere la service_role key, que tiene
permisos de administrador y por eso NUNCA debe usarse en codigo de frontend.
Este script se ejecuta en tu maquina / en un cron job / en un GitHub Action,
nunca en el navegador del usuario.

Este script es deliberadamente simple (usa requests + REST API de Supabase)
para no agregar una dependencia pesada (supabase-py) si no es necesaria.
"""

import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Falta la libreria 'requests'. Instala con: pip install requests --break-system-packages")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    sys.exit(
        "Faltan variables de entorno.\n"
        "Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de ejecutar este script."
    )

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

DATA_PATH = Path(__file__).parent / "output" / "dashboard_data.json"


def rest_url(table):
    return f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"


def upsert(table, rows, on_conflict=None):
    if not rows:
        return
    url = rest_url(table)
    headers = dict(HEADERS)
    if on_conflict:
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        url += f"?on_conflict={on_conflict}"
    resp = requests.post(url, headers=headers, data=json.dumps(rows))
    if resp.status_code >= 300:
        print(f"  ERROR insertando en {table}: {resp.status_code} {resp.text[:300]}")
    else:
        print(f"  OK: {len(rows)} filas -> {table}")


def main():
    data = json.loads(DATA_PATH.read_text())

    print("Insertando alertas...")
    alert_rows = [
        {
            "detected_at": a["timestamp"],
            "level": a["level"],
            "title": a["title"],
            "description": a["description"],
            "source_ip": a["source_ip"],
            "country": a["country"],
            "country_code": a["country_code"],
            "mitre_id": a["mitre_id"],
            "mitre_name": a["mitre_name"],
            "evidence_count": a["evidence_count"],
        }
        for a in data["alerts"]
    ]
    upsert("alerts", alert_rows)

    print("Actualizando tabla de IPs atacantes...")
    ip_rows = [
        {
            "ip": r["ip"],
            "country": r["country"],
            "country_code": r["country_code"],
            "attempts": r["attempts"],
            "risk_score": r["risk_score"],
            "attack_types": r["attack_types"],
        }
        for r in data["ip_summary"]
    ]
    upsert("attacker_ips", ip_rows, on_conflict="ip")

    print("Registrando ejecucion del pipeline...")
    upsert("pipeline_runs", [{
        "total_events": data["stats"]["total_events"],
        "failed_logins": data["stats"]["failed_logins"],
        "alerts_created": len(data["alerts"]),
        "active_alerts": data["stats"]["active_alerts"],
    }])

    print("Listo.")


if __name__ == "__main__":
    main()
