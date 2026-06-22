import { supabase, isSupabaseConfigured } from "./supabaseClient";

const FALLBACK_MESSAGE = `El asistente IA no esta configurado en este despliegue.

Para activarlo, sigue docs/api-key-handling.md:
- Opcion A (recomendada): despliega supabase/functions/ai-proxy y configura
  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
- Opcion B (BYOK): ingresa tu propia API key de Google AI Studio abajo.`;

export async function askAssistant({ question, alertsContext, byokKey }) {
  if (isSupabaseConfigured) {
    return askViaEdgeFunction(question, alertsContext);
  }
  if (byokKey) {
    return askViaDirectApi(question, alertsContext, byokKey);
  }
  return { text: FALLBACK_MESSAGE, mode: "unconfigured" };
}

async function askViaEdgeFunction(question, alertsContext) {
  try {
    // Limitar el contexto a solo 2 alertas y 300 chars max para no exceder
    // los limites del free tier de Gemini
    const shortContext = alertsContext
      ? alertsContext.split("\n").slice(0, 2).join("\n").slice(0, 300)
      : null;

    const { data, error } = await supabase.functions.invoke("ai-proxy", {
      body: { question: question.slice(0, 500), alertsContext: shortContext },
    });

    if (data?.text) {
      return { text: data.text, mode: "edge-function" };
    }
    if (error) throw new Error(error.message || JSON.stringify(error));
    if (data?.error) throw new Error(data.error);
    throw new Error("Respuesta inesperada de la Edge Function");
  } catch (err) {
    return {
      error: `Error al llamar a la Edge Function: ${err.message}.`,
    };
  }
}

async function askViaDirectApi(question, alertsContext, apiKey) {
  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const systemWithContext = alertsContext
    ? `${buildSystem()}\n\nAlertas activas:\n${alertsContext.slice(0, 300)}`
    : buildSystem();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemWithContext }] },
        contents: [{ role: "user", parts: [{ text: question.slice(0, 500) }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta.";
    return { text, mode: "byok" };
  } catch (err) {
    return { error: `Error llamando a Gemini: ${err.message}` };
  }
}

function buildSystem() {
  return `Eres SecureDash AI, asistente de ciberseguridad para PYMEs chilenas. Responde en español, máximo 3 oraciones cortas, termina con una acción concreta.`;
}
