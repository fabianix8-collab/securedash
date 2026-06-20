import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { useMediaQuery } from "../hooks/useMediaQuery";

ChartJS.register(ArcElement, Tooltip, Legend);

const PALETTE = ["#f85149", "#d29922", "#58a6ff", "#bc8cff", "#3fb950", "#e3b341"];

/**
 * Distribucion porcentual de alertas por tecnica MITRE ATT&CK
 * (type_distribution en dashboard_data.json, calculado en
 * build_type_distribution de detection_engine.py).
 */
export default function TypeDistributionChart({ distribution }) {
  const isMobile = useMediaQuery("(max-width: 640px)");

  const data = {
    labels: distribution.labels,
    datasets: [
      {
        data: distribution.values,
        backgroundColor: PALETTE.slice(0, distribution.labels.length),
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
    plugins: {
      legend: {
        // A la derecha hay espacio horizontal de sobra en desktop; en
        // mobile el contenedor es angosto y la leyenda lateral dejaba el
        // donut casi invisible, asi que pasa abajo.
        position: isMobile ? "bottom" : "right",
        labels: { color: "#8b949e", boxWidth: 10, font: { size: 10 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${ctx.parsed}%`,
        },
      },
    },
  };

  return (
    <div style={{ position: "relative", height: isMobile ? 240 : 180 }}>
      <Doughnut
        data={data}
        options={options}
        role="img"
        aria-label="Gráfico de dona mostrando el porcentaje de alertas por técnica de ataque MITRE ATT&CK"
      />
    </div>
  );
}
