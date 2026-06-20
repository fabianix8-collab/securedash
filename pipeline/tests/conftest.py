"""
conftest.py
===========

Fixtures compartidas por los tests de detection_engine.py.

Filosofia de estos tests: cada test de regla construye sus PROPIOS eventos
sinteticos minimos (no usa log_generator.py ni los archivos .jsonl reales).
Esto es deliberado:

  1. Los tests quedan totalmente deterministas y rapidos (no dependen de
     random.seed ni de archivos en disco).
  2. Cada test prueba la regla de deteccion de forma AISLADA: si
     test_brute_force_detects_above_threshold falla, el problema esta en
     detect_brute_force(), no en como log_generator.py arma los datos.
  3. Sirven como documentacion ejecutable: leyendo los tests se entiende
     exactamente que patron dispara (o no dispara) cada regla.
"""

from datetime import datetime, timedelta, timezone

import pytest

# WINDOW_START fijo y arbitrario para todos los tests. Lo importante es que
# sea consistente entre los timestamps que genera cada test y window_start_dt
# que se le pasa a las funciones bajo prueba.
WINDOW_START = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc).replace(tzinfo=None)


@pytest.fixture
def window_start():
    return WINDOW_START


def ts(seconds_offset):
    """Timestamp ISO (mismo formato que log_generator.py) a N segundos de WINDOW_START."""
    dt = WINDOW_START + timedelta(seconds=seconds_offset)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond:06d}Z"


def auth_event(offset, ip, username, status, service="ssh"):
    return {
        "timestamp": ts(offset),
        "source_ip": ip,
        "username": username,
        "service": service,
        "status": status,
        "event": "auth",
    }


def http_event(offset, ip, method, path, query, status_code=200):
    return {
        "timestamp": ts(offset),
        "source_ip": ip,
        "method": method,
        "path": path,
        "query": query,
        "status_code": status_code,
        "event": "http_request",
    }


def net_event(offset, ip, port):
    return {
        "timestamp": ts(offset),
        "source_ip": ip,
        "dest_port": port,
        "protocol": "TCP",
        "event": "connection",
    }
