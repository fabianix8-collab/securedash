"""
Tests de detect_port_scan (Regla 3 - T1595.001).

Logica bajo prueba: una misma IP conectando a 50+ puertos DISTINTOS dentro
de una ventana de 60 segundos -> alerta de escaneo (reconocimiento).
"""

from detection_engine import detect_port_scan
from tests.conftest import net_event


def test_detects_scan_above_threshold():
    events = [net_event(i * 0.5, "9.9.9.9", 1000 + i) for i in range(55)]
    alerts = detect_port_scan(events, window_seconds=60, threshold=50)

    assert len(alerts) == 1
    assert alerts[0]["mitre_id"] == "T1595.001"
    assert alerts[0]["level"] == "high"
    assert alerts[0]["evidence_count"] >= 50


def test_does_not_trigger_below_threshold():
    events = [net_event(i * 0.5, "9.9.9.9", 1000 + i) for i in range(30)]
    alerts = detect_port_scan(events, window_seconds=60, threshold=50)

    assert alerts == []


def test_repeated_connections_to_same_port_do_not_count_as_scan():
    """
    100 conexiones al MISMO puerto (ej. trafico normal a un servicio web)
    no es un escaneo: lo que importa es la cantidad de puertos DISTINTOS,
    no el volumen total de conexiones.
    """
    events = [net_event(i * 0.1, "190.55.12.10", 443) for i in range(100)]
    alerts = detect_port_scan(events, window_seconds=60, threshold=50)

    assert alerts == []


def test_scan_spread_over_long_time_does_not_trigger():
    """
    50 puertos distintos pero repartidos en mas tiempo del que cubre la
    ventana de deteccion no deben generar alerta (no es una rafaga).
    """
    events = [net_event(i * 5, "9.9.9.9", 1000 + i) for i in range(50)]  # 245s de span
    alerts = detect_port_scan(events, window_seconds=60, threshold=50)

    assert alerts == []
