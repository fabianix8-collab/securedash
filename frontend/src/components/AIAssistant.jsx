import { useEffect, useRef, useState } from "react";
import { askAssistant } from "../services/aiAssistant";
import { isSupabaseConfigured } from "../services/supabaseClient";

const QUICK_PROMPTS = [
  { label: "🔴 Amenaza más crítica", q: "¿Cuál es la amenaza más crítica detectada y por qué?" },
  { label: "Resumen ejecutivo", q: "Dame un resumen ejecutivo del estado de seguridad actual para alguien no técnico." },
  { label: "Priorización", q: "¿Cómo debería priorizar la respuesta a estas alertas según su impacto real?" },
  { label: "Fuerza bruta", q: "Explica qué es un ataque de fuerza bruta y cómo se mitiga." },
];

/**
 * Asistente IA. Recibe `alerts` para construir contexto y un `pendingQuestion`
 * que AlertsPanel puede disparar al hacer click en una alerta especifica.
 */
export default function AIAssistant({ alerts, pendingQuestion, onConsumePending }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [byokKey, setByokKey] = useState("");
  const chatRef = useRef(null);

  const alertsContext = alerts
    .slice(0, 5)
    .map((a) => `[${a.level.toUpperCase()}] ${a.title} (${a.mitre_id}) - ${a.description}`)
    .join("\n");

  async function send(question) {
    if (!question.trim() || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    const result = await askAssistant({ question, alertsContext, byokKey });

    setMessages((prev) => [
      ...prev,
      result.error
        ? { role: "error", text: result.error }
        : { role: "assistant", text: result.text },
    ]);
    setLoading(false);
  }

  // Si AlertsPanel dispara una pregunta (click en una alerta), la enviamos
  useEffect(() => {
    if (!pendingQuestion) return;
    const question = pendingQuestion;
    onConsumePending();
    // El envio del mensaje es un efecto secundario deliberado en respuesta
    // a una accion del usuario en otro componente (click en una alerta),
    // no un derivado de estado que deba calcularse durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    send(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, loading]);

  return (
    <div className="panel">
      <div className="panel-title">
        <span>🤖 Asistente IA — Análisis de amenazas</span>
        <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          Claude API
        </span>
      </div>

      {!isSupabaseConfigured && (
        <div className="ai-config-hint text-muted">
          Sin Edge Function configurada. Puedes ingresar una API key de
          Google AI Studio solo para esta sesión (no se guarda):{" "}
          <input
            type="password"
            placeholder="AQ..."
            value={byokKey}
            onChange={(e) => setByokKey(e.target.value)}
            className="ai-byok-input"
          />
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            obtener key gratis
          </a>
        </div>
      )}

      <div className="ai-quick-prompts">
        {QUICK_PROMPTS.map((p) => (
          <button key={p.label} className="ai-quick-btn" onClick={() => send(p.q)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="ai-chat scroll-thin" ref={chatRef}>
        {messages.length === 0 && (
          <p className="text-muted ai-empty">
            Haz una pregunta, usa un botón rápido, o haz click en cualquier
            alerta del panel para que el asistente la explique.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg--${m.role}`}>
            {m.role === "assistant" && <div className="ai-msg__label">🤖 SecureDash AI</div>}
            {m.role === "error" && <div className="ai-msg__label">⚠️ Error</div>}
            <span dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg--assistant">
            <div className="ai-msg__label">🤖 SecureDash AI</div>
            <span className="ai-loading">Analizando…</span>
          </div>
        )}
      </div>

      <form
        className="ai-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="ai-input"
          placeholder="Pregunta sobre cualquier alerta o amenaza..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="ai-send-btn" type="submit" disabled={loading}>
          Analizar
        </button>
      </form>

      <style>{`
        .ai-config-hint {
          font-size: 11px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ai-byok-input {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 4px 8px;
          color: var(--text);
          font-size: 11px;
          font-family: var(--font-mono);
          width: 180px;
          max-width: 100%;
        }
        .ai-quick-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }
        .ai-quick-btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 4px 10px;
          font-size: 11px;
          color: var(--text-muted);
          cursor: pointer;
        }
        .ai-quick-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        @media (max-width: 640px) {
          .ai-quick-btn {
            padding: 6px 10px;
            font-size: 12px;
          }
          .ai-input-row {
            flex-direction: column;
          }
          .ai-send-btn {
            width: 100%;
          }
        }
        .ai-chat {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 220px;
          min-height: 60px;
          overflow-y: auto;
          margin-bottom: 10px;
        }
        .ai-empty {
          font-size: 12px;
        }
        .ai-msg {
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        font-size: 13px;
        line-height: 1.5;
        max-width: 90%;
        word-break: break-word;
        white-space: pre-wrap;
        }
        .ai-msg--user {
          background: var(--accent-soft);
          border: 1px solid rgba(88, 166, 255, 0.3);
          color: #79c0ff;
          align-self: flex-end;
        }
        .ai-msg--assistant {
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          align-self: flex-start;
          white-space: pre-line;
        }
        .ai-msg--error {
          background: rgba(248, 81, 73, 0.08);
          border: 1px solid rgba(248, 81, 73, 0.3);
          color: var(--critical);
          align-self: flex-start;
          white-space: pre-line;
        }
        .ai-msg__label {
          font-size: 10px;
          color: var(--accent);
          font-weight: 600;
          margin-bottom: 4px;
        }
        .ai-loading {
          color: var(--text-muted);
          font-size: 12px;
        }
        .ai-input-row {
          display: flex;
          gap: 8px;
        }
        .ai-input {
          flex: 1;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 8px 12px;
          color: var(--text);
          font-size: 13px;
          font-family: inherit;
          outline: none;
        }
        .ai-input:focus {
          border-color: var(--accent);
        }
        .ai-send-btn {
          background: var(--accent);
          border: none;
          border-radius: var(--radius-sm);
          padding: 8px 16px;
          color: #0d1117;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }
        .ai-send-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
