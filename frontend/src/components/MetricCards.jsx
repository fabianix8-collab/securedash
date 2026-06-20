/**
 * 4 tarjetas con metricas clave, todas derivadas de stats en
 * pipeline/output/dashboard_data.json (salida real de detection_engine.py).
 */
export default function MetricCards({ stats }) {
  const cards = [
    {
      label: "Login fallidos (24h)",
      value: stats.failed_logins,
      sub: "eventos auth.log",
      color: "text-critical",
    },
    {
      label: "IPs atacantes unicas",
      value: stats.unique_attacker_ips,
      sub: "con al menos 1 alerta",
      color: "text-high",
    },
    {
      label: "Alertas activas",
      value: stats.active_alerts,
      sub: "criticas + altas",
      color: "text-high",
    },
    {
      label: "Eventos procesados",
      value: stats.total_events,
      sub: "auth + access + network",
      color: "text-accent",
    },
  ];

  return (
    <div className="grid-4">
      {cards.map((c) => (
        <div className="panel metric" key={c.label}>
          <div className="metric__label">{c.label}</div>
          <div className={`metric__value ${c.color}`}>
            {c.value.toLocaleString("es-CL")}
          </div>
          <div className="metric__sub text-muted">{c.sub}</div>
        </div>
      ))}

      <style>{`
        .metric__label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .metric__value {
          font-size: 26px;
          font-weight: 500;
          line-height: 1.2;
        }
        .metric__sub {
          font-size: 11px;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
