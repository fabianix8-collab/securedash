/**
 * Nivel de riesgo por pais de origen, usando risk_score (0-100, ya
 * normalizado en build_ip_summary de detection_engine.py).
 *
 * NOTA DE DISEÑO: deliberadamente NO se usa `attempts` aqui. `attempts`
 * mezcla unidades distintas segun el tipo de ataque (intentos de login,
 * puertos escaneados, peticiones HTTP), por lo que sumarlas haria que un
 * escaneo de puertos (50 "intentos") parezca mas grave que una fuerza
 * bruta critica (5 "intentos"), cuando es al reves. risk_score ya
 * normaliza eso.
 */
export default function CountryDistribution({ ipSummary }) {
  const rows = [...ipSummary]
    .sort((a, b) => b.risk_score - a.risk_score)
    .map((row) => ({
      country: row.country,
      ip: row.ip,
      riskScore: row.risk_score,
      type: row.attack_types[0],
    }));

  const colors = ["#f85149", "#d29922", "#58a6ff", "#bc8cff", "#3fb950", "#e3b341"];

  return (
    <div className="panel">
      <div className="panel-title">
        <span>📍 Riesgo por país de origen</span>
      </div>

      {rows.map((r, i) => (
        <div className="country-row" key={r.ip}>
          <div className="country-row__label text-muted">
            <span>
              {r.country} <span className="country-row__type">· {r.type}</span>
            </span>
            <span>{r.riskScore}/100</span>
          </div>
          <div className="country-row__bar">
            <div
              className="country-row__fill"
              style={{ width: `${r.riskScore}%`, background: colors[i % colors.length] }}
            />
          </div>
        </div>
      ))}

      {rows.length === 0 && <p className="text-muted">Sin datos de IPs externas.</p>}

      <style>{`
        .country-row {
          margin-bottom: 10px;
        }
        .country-row__label {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 11px;
          margin-bottom: 3px;
          gap: 8px;
        }
        .country-row__type {
          font-size: 10px;
        }
        .country-row__bar {
          height: 4px;
          background: var(--bg-elevated);
          border-radius: 2px;
        }
        .country-row__fill {
          height: 100%;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
