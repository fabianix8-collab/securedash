"""
Tests de detect_brute_force (Regla 1 - T1110).

Logica bajo prueba: 5+ logins FALLIDOS desde la misma IP dentro de una
ventana de 60 segundos -> alerta critica.
"""

from detection_engine import detect_brute_force
from tests.conftest import auth_event


def test_detects_brute_force_above_threshold():
    """5 fallos en 40s desde la misma IP debe generar exactamente 1 alerta critica."""
    events = [
        auth_event(0, "1.2.3.4", "root", "failed"),
        auth_event(10, "1.2.3.4", "root", "failed"),
        auth_event(20, "1.2.3.4", "root", "failed"),
        auth_event(30, "1.2.3.4", "root", "failed"),
        auth_event(40, "1.2.3.4", "root", "failed"),
    ]
    alerts = detect_brute_force(events, window_seconds=60, threshold=5)

    assert len(alerts) == 1
    assert alerts[0]["level"] == "critical"
    assert alerts[0]["mitre_id"] == "T1110"
    assert alerts[0]["source_ip"] == "1.2.3.4"
    assert alerts[0]["evidence_count"] == 5


def test_does_not_trigger_below_threshold():
    """4 fallos (uno menos que el umbral) NO debe generar alerta."""
    events = [
        auth_event(0, "1.2.3.4", "root", "failed"),
        auth_event(10, "1.2.3.4", "root", "failed"),
        auth_event(20, "1.2.3.4", "root", "failed"),
        auth_event(30, "1.2.3.4", "root", "failed"),
    ]
    alerts = detect_brute_force(events, window_seconds=60, threshold=5)

    assert alerts == []


def test_does_not_trigger_when_attempts_are_spread_out():
    """
    5 fallos, pero distribuidos en mas tiempo del que cubre la ventana
    (60s): el ataque real es "rafaga corta", no fallos esporadicos a lo
    largo del dia. La regla no debe confundir ambos casos.
    """
    events = [
        auth_event(0, "1.2.3.4", "root", "failed"),
        auth_event(100, "1.2.3.4", "root", "failed"),
        auth_event(200, "1.2.3.4", "root", "failed"),
        auth_event(300, "1.2.3.4", "root", "failed"),
        auth_event(400, "1.2.3.4", "root", "failed"),
    ]
    alerts = detect_brute_force(events, window_seconds=60, threshold=5)

    assert alerts == []


def test_successful_logins_do_not_count_towards_threshold():
    """Los logins EXITOSOS no deben contar como evidencia de fuerza bruta."""
    events = [
        auth_event(0, "1.2.3.4", "root", "failed"),
        auth_event(10, "1.2.3.4", "root", "success"),
        auth_event(20, "1.2.3.4", "root", "failed"),
        auth_event(30, "1.2.3.4", "root", "success"),
        auth_event(40, "1.2.3.4", "root", "failed"),
    ]
    # Solo 3 fallos reales en la ventana -> no alcanza el umbral de 5
    alerts = detect_brute_force(events, window_seconds=60, threshold=5)

    assert alerts == []


def test_different_ips_are_tracked_independently():
    """
    Fallos repartidos entre dos IPs distintas (3 cada una) no deben
    combinarse para alcanzar el umbral; cada IP se evalua por separado.
    """
    events = (
        [auth_event(i * 10, "1.2.3.4", "root", "failed") for i in range(3)]
        + [auth_event(i * 10, "5.6.7.8", "admin", "failed") for i in range(3)]
    )
    alerts = detect_brute_force(events, window_seconds=60, threshold=5)

    assert alerts == []


def test_two_ips_both_above_threshold_generate_two_alerts():
    """Si dos IPs distintas superan el umbral, cada una genera su propia alerta."""
    events = (
        [auth_event(i * 5, "1.2.3.4", "root", "failed") for i in range(6)]
        + [auth_event(i * 5, "5.6.7.8", "admin", "failed") for i in range(6)]
    )
    alerts = detect_brute_force(events, window_seconds=60, threshold=5)

    ips_with_alerts = {a["source_ip"] for a in alerts}
    assert ips_with_alerts == {"1.2.3.4", "5.6.7.8"}
    assert len(alerts) == 2
