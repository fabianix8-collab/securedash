import { useState } from "react";

const LEVEL_LABEL = {
  critical: "CRITICO",
  high: "ALTO",
  medium: "MEDIO",
  low: "BAJO",
};

function formatTime(isoString) {
  return new Date(isoString).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Lista de alertas generadas por detection_engine.py, ordenadas por
 * severidad (ya vienen ordenadas desde el pipeline).
 *
 * Dos interacciones independientes por alerta:
 *  - Click en el cuerpo de la alerta -> se le pide al asistente IA que la
 *    explique (via onAskAI, conectado a AIAssistant).
 *  - Click en el check -> se marca como resuelta (triage).
 *
 * IMPORTANTE sobre el estado "resuelta": vive solo en memoria de React
 * (useState en App.jsx), NO se persiste a Supabase. Esto es una decision
 * deliberada para esta demo: implementar persistencia real requeriria
 * autenticacion (ver resolve_alert() en supabase/schema.sql, que ya esta
 * preparada para eso) para que no cualquier visitante anonimo pueda alterar
 * el estado de las alertas de todos. El badge "Solo en esta sesion" deja
 * esto explicito en la UI en vez de implicar una persistencia que no existe.
 */
export default function AlertsPanel({ alerts, resolvedIds, onAskAI, onToggleResolved }) {
  const [filter, setFilter] = useState("active"); // "active" | "all" | "resolved"

  const visibleAlerts = alerts.filter((a) => {
    const isResolved = resolvedIds.has(a.id);
    if (filter === "active") return !isResolved;
    if (filter === "resolved") return isResolved;
    return true;
  });

  const activeCount = alerts.filter(
    (a) => !resolvedIds.has(a.id) && (a.level === "critical" || a.level === "high")
  ).length;
  const resolvedCount = resolvedIds.size;

  return (
    <div className="panel">
      <div className="panel-title">
        <span>🔔 Alertas detectadas</span>
        <span className="badge critical">{activeCount} activas</span>
      </div>

      <div className="alerts-filter">
        <button
          className={`alerts-filter__btn ${filter === "active" ? "is-selected" : ""}`}
          onClick={() => setFilter("active")}
        >
          Pendientes ({alerts.length - resolvedCount})
        </button>
        <button
          className={`alerts-filter__btn ${filter === "resolved" ? "is-selected" : ""}`}
          onClick={() => setFilter("resolved")}
        >
          Resueltas ({resolvedCount})
        </button>
        <button
          className={`alerts-filter__btn ${filter === "all" ? "is-selected" : ""}`}
          onClick={() => setFilter("all")}
        >
          Todas ({alerts.length})
        </button>
      </div>

      <div className="alerts-list scroll-thin">
        {visibleAlerts.map((a) => {
          const isResolved = resolvedIds.has(a.id);
          return (
            <div
              key={a.id}
              className={`alert-item alert-item--${a.level} ${isResolved ? "alert-item--resolved" : ""}`}
            >
              <button
                className="alert-item__resolve-btn"
                title={isResolved ? "Marcar como pendiente" : "Marcar como resuelta"}
                aria-label={isResolved ? "Marcar como pendiente" : "Marcar como resuelta"}
                onClick={() => onToggleResolved(a.id)}
              >
                {isResolved ? "✓" : ""}
              </button>

              <button
                className="alert-item__body"
                onClick={() =>
                  onAskAI(
                    `Explica esta alerta de seguridad en lenguaje simple y dime ` +
                      `que deberia hacer al respecto: "${a.title}" — ${a.description} ` +
                      `(Tecnica MITRE ${a.mitre_id} - ${a.mitre_name})`
                  )
                }
              >
                <span className={`badge ${a.level}`}>{LEVEL_LABEL[a.level]}</span>
                <div className="alert-item__main">
                  <div className="alert-item__title">{a.title}</div>
                  <div className="alert-item__meta text-muted">
                    {a.source_ip} · {a.country} · {a.mitre_id} {a.mitre_name}
                  </div>
                </div>
                <span className="alert-item__time text-muted">
                  {formatTime(a.timestamp)}
                </span>
              </button>
            </div>
          );
        })}

        {visibleAlerts.length === 0 && (
          <p className="text-muted alerts-empty">
            {filter === "resolved"
              ? "Aún no has marcado ninguna alerta como resuelta."
              : "No hay alertas en este filtro."}
          </p>
        )}
      </div>

      <p className="text-muted alerts-note">
        El estado "resuelta" se guarda solo en esta sesión del navegador (no
        se persiste en Supabase). Ver <code>resolve_alert()</code> en{" "}
        <code>supabase/schema.sql</code> para la versión con persistencia real.
      </p>

      <style>{`
        .alerts-filter {
          display: flex;
          gap: 6px;
          margin-bottom: 10px;
        }
        .alerts-filter__btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 4px 10px;
          font-size: 11px;
          color: var(--text-muted);
          cursor: pointer;
        }
        .alerts-filter__btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .alerts-filter__btn.is-selected {
          background: var(--accent-soft);
          border-color: var(--accent);
          color: var(--accent);
        }

        .alerts-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 340px;
          overflow-y: auto;
        }
        .alert-item {
          display: flex;
          align-items: stretch;
          gap: 8px;
          border-radius: var(--radius-sm);
          border: 1px solid transparent;
          transition: background 0.15s, opacity 0.15s;
        }
        .alert-item--critical { background: rgba(248, 81, 73, 0.05); border-color: rgba(248, 81, 73, 0.2); }
        .alert-item--high     { background: rgba(210, 153, 34, 0.05); border-color: rgba(210, 153, 34, 0.2); }
        .alert-item--medium   { background: rgba(227, 179, 65, 0.05); border-color: rgba(227, 179, 65, 0.2); }
        .alert-item--low      { background: rgba(63, 185, 80, 0.05); border-color: rgba(63, 185, 80, 0.2); }
        .alert-item--resolved {
          opacity: 0.55;
        }

        .alert-item__resolve-btn {
          flex-shrink: 0;
          width: 28px;
          margin: 8px 0 8px 8px;
          border-radius: 5px;
          border: 1px solid var(--border);
          background: var(--bg-elevated);
          color: var(--low);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .alert-item__resolve-btn:hover {
          border-color: var(--low);
        }

        .alert-item__body {
          flex: 1;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px 10px 8px 0;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          color: var(--text);
          min-width: 0;
        }
        .alert-item__body:hover,
        .alert-item__body:focus-visible {
          background: var(--bg-elevated);
          outline: none;
          border-radius: var(--radius-sm);
        }

        .alert-item__main {
          flex: 1;
          min-width: 0;
        }
        .alert-item__title {
          font-size: 13px;
          margin-bottom: 2px;
        }
        .alert-item--resolved .alert-item__title {
          text-decoration: line-through;
        }
        .alert-item__meta {
          font-size: 11px;
        }
        .alert-item__time {
          font-size: 10px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .alert-item .badge {
          flex-shrink: 0;
        }

        .alerts-empty {
          font-size: 12px;
          padding: 8px 0;
        }
        .alerts-note {
          font-size: 10px;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
          line-height: 1.5;
        }

        @media (max-width: 640px) {
          .alert-item__time {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
