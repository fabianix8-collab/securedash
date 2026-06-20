import { useMemo, useState } from "react";
import "./App.css";

import dashboardData from "./data/dashboard_data.json";

import Topbar from "./components/Topbar";
import MetricCards from "./components/MetricCards";
import AlertsPanel from "./components/AlertsPanel";
import ThreatChart from "./components/ThreatChart";
import IPTable from "./components/IPTable";
import TypeDistributionChart from "./components/TypeDistributionChart";
import CountryDistribution from "./components/CountryDistribution";
import PipelineInfo from "./components/PipelineInfo";
import AIAssistant from "./components/AIAssistant";

export default function App() {
  const [pendingQuestion, setPendingQuestion] = useState(null);

  // IDs de alertas marcadas como "resueltas" por el analista durante esta
  // sesion. Vive solo en memoria (se pierde al recargar la pagina) - ver la
  // nota en AlertsPanel.jsx sobre por que no se persiste a Supabase en esta
  // version del proyecto.
  const [resolvedIds, setResolvedIds] = useState(() => new Set());

  function toggleResolved(alertId) {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  }

  // El conteo de criticos activos en la Topbar y el contexto que recibe el
  // asistente IA deben excluir alertas ya resueltas: una alerta cerrada no
  // deberia seguir contando como amenaza activa.
  const activeAlerts = useMemo(
    () => dashboardData.alerts.filter((a) => !resolvedIds.has(a.id)),
    [resolvedIds]
  );

  const criticalCount = activeAlerts.filter((a) => a.level === "critical").length;

  return (
    <div className="app">
      <Topbar
        criticalCount={criticalCount}
        generatedAt={dashboardData.generated_at}
      />

      <main className="app__main">
        <MetricCards stats={dashboardData.stats} />

        <div className="grid-2">
          <AlertsPanel
            alerts={dashboardData.alerts}
            resolvedIds={resolvedIds}
            onToggleResolved={toggleResolved}
            onAskAI={(q) => setPendingQuestion(q)}
          />

          <div className="stack-col">
            <div className="panel">
              <div className="panel-title">
                <span>📊 Amenazas por hora (24h)</span>
              </div>
              <ThreatChart hourly={dashboardData.hourly_threats} />
            </div>
            <IPTable ipSummary={dashboardData.ip_summary} />
          </div>
        </div>

        <AIAssistant
          alerts={activeAlerts}
          pendingQuestion={pendingQuestion}
          onConsumePending={() => setPendingQuestion(null)}
        />

        <div className="grid-3">
          <div className="panel">
            <div className="panel-title">
              <span>🥧 Distribución por técnica MITRE</span>
            </div>
            <TypeDistributionChart distribution={dashboardData.type_distribution} />
          </div>
          <CountryDistribution ipSummary={dashboardData.ip_summary} />
          <PipelineInfo data={dashboardData} />
        </div>
      </main>

      <footer className="app__footer">
        SecureDash — proyecto educativo / portafolio.{" "}
        <a href="https://attack.mitre.org/" target="_blank" rel="noreferrer">
          MITRE ATT&CK
        </a>
      </footer>
    </div>
  );
}
