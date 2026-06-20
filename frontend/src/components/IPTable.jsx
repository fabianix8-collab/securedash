function riskColor(score) {
  if (score >= 80) return "var(--critical)";
  if (score >= 55) return "var(--high)";
  return "var(--medium)";
}

/**
 * Tabla de IPs atacantes externas, agregadas por build_ip_summary() en
 * detection_engine.py (excluye IPs internas/CL con alertas de tipo
 * "acceso fuera de horario", que se tratan como anomalia de cuenta, no
 * como atacante externo).
 */
export default function IPTable({ ipSummary }) {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>🌐 Top IPs atacantes</span>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {ipSummary.length} IPs
        </span>
      </div>

      <div className="ip-table-wrapper scroll-thin">
        <table className="ip-table">
          <thead>
            <tr>
              <th>IP</th>
              <th>País</th>
              <th>Eventos</th>
              <th>Riesgo</th>
              <th className="ip-table__types-col">Técnicas</th>
            </tr>
          </thead>
          <tbody>
            {ipSummary.map((row) => (
              <tr key={row.ip}>
                <td className="ip-table__ip">{row.ip}</td>
                <td>{row.country}</td>
                <td className="text-critical">{row.attempts}</td>
                <td>
                  <div className="risk-bar">
                    <div
                      className="risk-bar__fill"
                      style={{
                        width: `${row.risk_score}%`,
                        background: riskColor(row.risk_score),
                      }}
                    />
                  </div>
                  <span className="text-muted" style={{ fontSize: 10 }}>
                    {row.risk_score}/100
                  </span>
                </td>
                <td className="text-muted ip-table__types ip-table__types-col">
                  {row.attack_types.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .ip-table-wrapper {
          overflow-x: auto;
        }
        .ip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .ip-table th {
          text-align: left;
          color: var(--text-muted);
          font-weight: 400;
          padding: 4px 8px;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .ip-table td {
          padding: 7px 8px;
          border-bottom: 1px solid var(--bg-elevated);
          vertical-align: middle;
        }
        .ip-table tr:last-child td {
          border-bottom: none;
        }
        .ip-table__ip {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--accent);
          white-space: nowrap;
        }
        .ip-table__types {
          font-size: 11px;
          white-space: nowrap;
        }
        .risk-bar {
          height: 4px;
          border-radius: 2px;
          background: var(--bg-elevated);
          overflow: hidden;
          width: 60px;
          margin-bottom: 2px;
        }
        .risk-bar__fill {
          height: 100%;
          border-radius: 2px;
        }

        /* En mobile, la columna "Tecnicas" (texto largo) se oculta para
           evitar que la tabla fuerce scroll horizontal; el resto de
           columnas son cortas y caben sin problema. La tecnica de cada
           IP sigue visible al hacer click en su alerta correspondiente. */
        @media (max-width: 640px) {
          .ip-table__types-col {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
