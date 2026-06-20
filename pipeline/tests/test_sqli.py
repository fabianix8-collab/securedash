"""
Tests de detect_sqli (Regla 2 - T1190).

Logica bajo prueba: el query o path de una peticion HTTP contiene sintaxis
SQL que nunca deberia aparecer en un input legitimo (OR 1=1, UNION SELECT,
comentarios --, DROP TABLE, patron admin'--).
"""

from detection_engine import detect_sqli
from tests.conftest import http_event


def test_detects_or_1_equals_1():
    events = [http_event(0, "9.9.9.9", "POST", "/api/auth", "username=' OR '1'='1&password=x")]
    alerts = detect_sqli(events)

    assert len(alerts) == 1
    assert alerts[0]["mitre_id"] == "T1190"
    assert alerts[0]["level"] == "critical"


def test_detects_union_select():
    events = [http_event(0, "9.9.9.9", "GET", "/search", "q=1 UNION SELECT username,password FROM users")]
    alerts = detect_sqli(events)

    assert len(alerts) == 1


def test_detects_drop_table():
    events = [http_event(0, "9.9.9.9", "POST", "/api/items", "id=1; DROP TABLE users")]
    alerts = detect_sqli(events)

    assert len(alerts) == 1


def test_detects_admin_comment_bypass():
    events = [http_event(0, "9.9.9.9", "POST", "/login", "username=admin'--&password=anything")]
    alerts = detect_sqli(events)

    assert len(alerts) == 1


def test_legitimate_traffic_does_not_trigger():
    """Trafico HTTP normal (sin sintaxis SQL) no debe generar falsos positivos."""
    events = [
        http_event(0, "190.55.12.10", "GET", "/dashboard", ""),
        http_event(10, "190.55.12.10", "GET", "/api/profile", ""),
        http_event(20, "190.55.12.10", "POST", "/api/orders", "item=notebook&qty=2"),
    ]
    alerts = detect_sqli(events)

    assert alerts == []


def test_apostrophe_alone_does_not_trigger():
    """
    Un apostrofe solo (ej. nombre 'O'Brien') es legitimo y comun; la regla
    debe exigir el patron completo (OR + comparacion), no solo el caracter.
    """
    events = [http_event(0, "190.55.12.10", "POST", "/api/profile", "name=O'Brien")]
    alerts = detect_sqli(events)

    assert alerts == []


def test_multiple_payloads_from_same_ip_are_grouped_into_one_alert():
    """
    detect_sqli agrupa todos los hits de una misma IP en UNA alerta con
    evidence_count, en vez de una tarjeta por peticion (asi se ve como lo
    mostraria un SOC real: "5 intentos de SQLi desde esta IP").
    """
    events = [
        http_event(0, "9.9.9.9", "POST", "/api/auth", "username=' OR 1=1--"),
        http_event(15, "9.9.9.9", "POST", "/api/auth", "username=admin'--"),
    ]
    alerts = detect_sqli(events)

    assert len(alerts) == 1
    assert alerts[0]["evidence_count"] == 2
    assert alerts[0]["source_ip"] == "9.9.9.9"


def test_payloads_from_different_ips_generate_separate_alerts():
    """IPs distintas con payloads SQLi cada una generan alertas independientes."""
    events = [
        http_event(0, "9.9.9.9", "POST", "/api/auth", "username=' OR 1=1--"),
        http_event(15, "8.8.8.8", "POST", "/api/auth", "username=admin'--"),
    ]
    alerts = detect_sqli(events)

    ips_with_alerts = {a["source_ip"] for a in alerts}
    assert ips_with_alerts == {"9.9.9.9", "8.8.8.8"}
    assert len(alerts) == 2
    assert all(a["evidence_count"] == 1 for a in alerts)
