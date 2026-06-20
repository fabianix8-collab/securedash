/**
 * Panel "meta": muestra de donde vienen los datos que se estan mostrando.
 * Esto es deliberado - refuerza la seccion "Datos: simulados vs reales" del
 * README directamente en la UI, en vez de dejarlo solo en documentacion.
 */
export default function PipelineInfo({ data }) {
  const items = [
    { label: "Generado", value: new Date(data.generated_at).toLocaleString("es-CL") },
    { label: "Eventos analizados", value: data.stats.total_events.toLocaleString("es-CL") },
    { label: "Reglas de detección", value: "5 (ver MITRE ATT&CK)" },
    { label: "Origen de datos", value: "Logs sintéticos (log_generator.py)" },
  ];

  return (
    <div className="panel">
      <div className="panel-title">
        <span>📄 Sobre estos datos</span>
      </div>

      <dl className="pipeline-info">
        {items.map((item) => (
          <div className="pipeline-info__row" key={item.label}>
            <dt className="text-muted">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-muted pipeline-info__note">
        Este dashboard muestra la salida real de <code>detection_engine.py</code>{" "}
        corriendo sobre logs simulados con ataques inyectados. Las reglas de
        detección y el mapeo MITRE ATT&CK son reales — el dataset es
        sintético. Ver el README del proyecto para el detalle completo.
      </p>

      <style>{`
        .pipeline-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 10px;
        }
        .pipeline-info__row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          gap: 8px;
        }
        .pipeline-info__row dt {
          flex-shrink: 0;
        }
        .pipeline-info__row dd {
          text-align: right;
        }
        .pipeline-info__note {
          font-size: 11px;
          line-height: 1.5;
          border-top: 1px solid var(--border);
          padding-top: 10px;
        }
      `}</style>
    </div>
  );
}
