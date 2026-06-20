"""
Tests de detect_offhours_access (Regla 5 - T1078).

Logica bajo prueba: un login EXITOSO entre las 00:00 y las 06:00 (hora
relativa a window_start_dt) genera una alerta de anomalia, aunque la
cuenta sea legitima (podria ser una cuenta comprometida).
"""

from detection_engine import detect_offhours_access
from tests.conftest import auth_event, window_start  # noqa: F401  (fixture)


def test_detects_success_at_3am(window_start):
    # offset 3h * 3600s = 10800s -> cae a las 03:00 desde window_start
    events = [auth_event(3 * 3600, "200.27.34.5", "acontreras", "success", service="web_login")]
    alerts = detect_offhours_access(events, window_start)

    assert len(alerts) == 1
    assert alerts[0]["mitre_id"] == "T1078"
    assert alerts[0]["level"] == "medium"


def test_does_not_trigger_during_business_hours(window_start):
    # offset 14h -> 14:00, dentro de horario laboral
    events = [auth_event(14 * 3600, "200.27.34.5", "acontreras", "success", service="web_login")]
    alerts = detect_offhours_access(events, window_start)

    assert alerts == []


def test_failed_offhours_login_does_not_trigger(window_start):
    """La regla mira logins EXITOSOS; un intento fallido a las 3am no aplica aqui."""
    events = [auth_event(3 * 3600, "200.27.34.5", "acontreras", "failed", service="web_login")]
    alerts = detect_offhours_access(events, window_start)

    assert alerts == []


def test_boundary_at_exactly_6am_is_excluded(window_start):
    """El rango es [0, 6) horas: exactamente las 06:00 ya no cuenta como off-hours."""
    events = [auth_event(6 * 3600, "200.27.34.5", "acontreras", "success", service="web_login")]
    alerts = detect_offhours_access(events, window_start, start_rel_hour=0, end_rel_hour=6)

    assert alerts == []


def test_boundary_at_5_59_is_included(window_start):
    events = [auth_event(5 * 3600 + 59 * 60, "200.27.34.5", "acontreras", "success", service="web_login")]
    alerts = detect_offhours_access(events, window_start, start_rel_hour=0, end_rel_hour=6)

    assert len(alerts) == 1
