import { useEffect, useState } from "react";

/**
 * Barra superior: logo, reloj en vivo y conteo de alertas criticas.
 *
 * El reloj es puramente decorativo (refuerza la sensacion de "monitoreo en
 * tiempo real"), pero el conteo de criticos viene de datos reales del
 * pipeline (dashboardData.stats / alerts).
 */
export default function Topbar({ criticalCount, generatedAt }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString("es-CL", { hour12: false });
  const generatedStr = generatedAt
    ? new Date(generatedAt).toLocaleString("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

  return (
    <header className="topbar">
      <div className="topbar__logo">
        <span aria-hidden="true">🛡️</span> SecureDash
        <span className="topbar__subtitle">SOC Monitor · datos sinteticos</span>
      </div>
      <div className="topbar__status">
        <span>
          <span className="pulse-dot" aria-hidden="true" /> Sistema activo
        </span>
        <span className="text-muted topbar__clock" title="Hora local del navegador, solo decorativa">
          {timeStr}
        </span>
        <span className="text-muted topbar__pipeline" title="Cuando se ejecuto detection_engine.py">
          Pipeline: {generatedStr}
        </span>
        <span className={criticalCount > 0 ? "text-critical" : "text-muted"}>
          {criticalCount} critico{criticalCount === 1 ? "" : "s"} activo
          {criticalCount === 1 ? "" : "s"}
        </span>
      </div>

      <style>{`
        .topbar {
          background: var(--bg-panel);
          border-bottom: 1px solid var(--border);
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .topbar__logo {
          display: flex;
          align-items: baseline;
          gap: 8px;
          font-size: 16px;
          font-weight: 500;
          color: var(--accent);
          flex-wrap: wrap;
        }
        .topbar__subtitle {
          font-size: 11px;
          font-weight: 400;
          color: var(--text-muted);
        }
        .topbar__status {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 12px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }
        .topbar__status > span {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        @media (max-width: 640px) {
          .topbar {
            padding: 10px 12px;
            gap: 6px;
          }
          .topbar__subtitle,
          .topbar__pipeline {
            display: none;
          }
          .topbar__status {
            gap: 10px;
            font-size: 11px;
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </header>
  );
}
