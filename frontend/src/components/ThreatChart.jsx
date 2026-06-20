import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useMediaQuery } from "../hooks/useMediaQuery";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * Grafico de barras apiladas: alertas criticas/altas vs medias/bajas por
 * hora, usando hourly_threats de dashboard_data.json (calculado por
 * build_hourly_threats en detection_engine.py a partir de timestamps reales
 * de las alertas y eventos fallidos).
 */
export default function ThreatChart({ hourly }) {
  const isMobile = useMediaQuery("(max-width: 640px)");

  const data = {
    labels: hourly.labels,
    datasets: [
      {
        label: "Critico / Alto",
        data: hourly.critical_high,
        backgroundColor: "rgba(248, 81, 73, 0.55)",
        borderColor: "#f85149",
        borderWidth: 1,
        stack: "threats",
      },
      {
        label: "Medio / Bajo",
        data: hourly.medium_low,
        backgroundColor: "rgba(227, 179, 65, 0.35)",
        borderColor: "#e3b341",
        borderWidth: 1,
        stack: "threats",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { color: "#8b949e", boxWidth: 12, font: { size: 10 } },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: {
          color: "#8b949e",
          font: { size: 9 },
          // En 24 etiquetas no entran todas en una pantalla angosta:
          // Chart.js elige automaticamente un subconjunto legible.
          autoSkip: true,
          maxTicksLimit: isMobile ? 6 : 12,
          maxRotation: 0,
        },
        grid: { color: "#21262d" },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { color: "#8b949e", font: { size: 9 }, precision: 0 },
        grid: { color: "#21262d" },
      },
    },
  };

  return (
    <div style={{ position: "relative", height: isMobile ? 160 : 200 }}>
      <Bar
        data={data}
        options={options}
        role="img"
        aria-label="Gráfico de barras apiladas mostrando eventos de seguridad críticos, altos, medios y bajos por hora durante las últimas 24 horas"
      />
    </div>
  );
}
