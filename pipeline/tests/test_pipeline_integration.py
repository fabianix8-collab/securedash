"""
Test de integracion: corre log_generator.py + detection_engine.py end-to-end
y valida la FORMA del dashboard_data.json resultante.

Esto es justamente lo que hubiera atrapado el bug real que encontramos en
load_to_supabase.py (nombres de columna que no coincidian con stats):
si la forma del JSON cambia sin querer, este test lo nota antes que un
despliegue a produccion.
"""

import json
import subprocess
import sys
from pathlib import Path

PIPELINE_DIR = Path(__file__).parent.parent


def test_pipeline_end_to_end_produces_valid_dashboard_data(tmp_path):
    # Corremos los scripts reales como subprocesos, en su propio cwd, igual
    # que lo haria una persona o un workflow de CI.
    subprocess.run(
        [sys.executable, "log_generator.py"], cwd=PIPELINE_DIR, check=True, capture_output=True
    )
    subprocess.run(
        [sys.executable, "detection_engine.py"], cwd=PIPELINE_DIR, check=True, capture_output=True
    )

    output_path = PIPELINE_DIR / "output" / "dashboard_data.json"
    assert output_path.exists()

    data = json.loads(output_path.read_text())

    # --- Forma general ---
    for key in ("generated_at", "alerts", "ip_summary", "hourly_threats", "type_distribution", "stats"):
        assert key in data

    # --- stats: estas son EXACTAMENTE las claves que load_to_supabase.py
    # mapea a columnas de la tabla pipeline_runs. Si alguien renombra una
    # clave aqui sin actualizar el loader, este test debe fallar primero. ---
    for key in ("total_events", "failed_logins", "unique_attacker_ips", "active_alerts"):
        assert key in data["stats"]
        assert isinstance(data["stats"][key], int)

    # --- alertas: con los datos sinteticos deterministas (SEED=42) siempre
    # se generan alertas de las 5 reglas ---
    assert len(data["alerts"]) > 0
    mitre_ids_found = {a["mitre_id"] for a in data["alerts"]}
    assert mitre_ids_found == {"T1110", "T1190", "T1595.001", "T1110.004", "T1078"}

    for alert in data["alerts"]:
        for field in (
            "id", "level", "title", "description", "source_ip", "country",
            "country_code", "mitre_id", "mitre_name", "evidence_count",
            "timestamp", "resolved",
        ):
            assert field in alert, f"falta el campo '{field}' en una alerta"
        assert alert["level"] in ("critical", "high", "medium", "low")
        assert alert["resolved"] is False

    # --- alertas ordenadas por severidad descendente ---
    rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    ranks = [rank[a["level"]] for a in data["alerts"]]
    assert ranks == sorted(ranks, reverse=True)

    # --- ip_summary: nunca debe incluir IPs marcadas como Chile/CL
    # (ver build_ip_summary - esas son anomalias de cuenta, no atacantes externos) ---
    for row in data["ip_summary"]:
        assert row["country_code"] != "CL"
        assert 0 <= row["risk_score"] <= 100

    # --- hourly_threats: arrays del mismo largo que la cantidad de labels ---
    hourly = data["hourly_threats"]
    assert len(hourly["labels"]) == len(hourly["critical_high"]) == len(hourly["medium_low"])

    # --- type_distribution: los porcentajes deben sumar ~100 ---
    total_pct = sum(data["type_distribution"]["values"])
    assert 99.0 <= total_pct <= 101.0  # tolerancia por redondeo
