"""
Tests de detect_credential_stuffing (Regla 4 - T1110.004).

Logica bajo prueba: una IP que prueba 3+ USUARIOS distintos sin exito y
LUEGO logra un login exitoso, dentro de una ventana de 5 minutos.
"""

from detection_engine import detect_credential_stuffing
from tests.conftest import auth_event


def test_detects_stuffing_pattern():
    events = [
        auth_event(0, "9.9.9.9", "admin", "failed", service="web_login"),
        auth_event(10, "9.9.9.9", "administrator", "failed", service="web_login"),
        auth_event(20, "9.9.9.9", "test", "failed", service="web_login"),
        auth_event(30, "9.9.9.9", "jperez", "success", service="web_login"),
    ]
    alerts = detect_credential_stuffing(events, window_seconds=300, fail_threshold=3)

    assert len(alerts) == 1
    assert alerts[0]["mitre_id"] == "T1110.004"
    assert alerts[0]["level"] == "high"


def test_success_without_prior_failures_does_not_trigger():
    """Un login exitoso sin fallos previos es trafico normal, no stuffing."""
    events = [auth_event(0, "190.55.12.10", "jperez", "success", service="web_login")]
    alerts = detect_credential_stuffing(events, window_seconds=300, fail_threshold=3)

    assert alerts == []


def test_below_fail_threshold_does_not_trigger():
    """Solo 2 usuarios distintos fallidos (umbral es 3) no debe disparar la regla."""
    events = [
        auth_event(0, "9.9.9.9", "admin", "failed", service="web_login"),
        auth_event(10, "9.9.9.9", "administrator", "failed", service="web_login"),
        auth_event(20, "9.9.9.9", "jperez", "success", service="web_login"),
    ]
    alerts = detect_credential_stuffing(events, window_seconds=300, fail_threshold=3)

    assert alerts == []


def test_same_user_failing_repeatedly_does_not_count_as_multiple_users():
    """
    5 fallos pero todos del MISMO usuario no es credential stuffing (eso es
    fuerza bruta clasica, otra regla). Esta regla exige usuarios DISTINTOS.
    """
    events = [
        auth_event(0, "9.9.9.9", "admin", "failed", service="web_login"),
        auth_event(10, "9.9.9.9", "admin", "failed", service="web_login"),
        auth_event(20, "9.9.9.9", "admin", "failed", service="web_login"),
        auth_event(30, "9.9.9.9", "admin", "success", service="web_login"),
    ]
    alerts = detect_credential_stuffing(events, window_seconds=300, fail_threshold=3)

    assert alerts == []


def test_failures_outside_window_are_not_counted():
    """
    Fallos que ocurrieron hace mas tiempo que window_seconds no deben
    contar como evidencia para un exito posterior.
    """
    events = [
        auth_event(0, "9.9.9.9", "admin", "failed", service="web_login"),
        auth_event(5, "9.9.9.9", "administrator", "failed", service="web_login"),
        auth_event(10, "9.9.9.9", "test", "failed", service="web_login"),
        # exito muy lejos en el tiempo: los 3 fallos ya "caducaron"
        auth_event(1000, "9.9.9.9", "jperez", "success", service="web_login"),
    ]
    alerts = detect_credential_stuffing(events, window_seconds=300, fail_threshold=3)

    assert alerts == []
