import { supabase, isSupabaseConfigured } from "./supabaseClient";

const FALLBACK_MESSAGE = `El asistente IA no esta configurado en este despliegue.

Para activarlo, sigue docs/api-key-handling.md:
- Opcion A (recomendada): despliega supabase/functions/ai-proxy y configura
  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
- Opcion B (BYOK): ingresa tu propia API key de Google AI Studio abajo
  (solo para uso personal/demo, no para un sitio publico).`;

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
    const { data, error } = await supabase.functions.invoke("ai-proxy", {
      body: { question, alertsContext },
    });

    // supabase-js marca error cuando el status no es 2xx, pero tambien
    // cuando hay un error de red. Si data existe y tiene text, es exito.
    if (data?.text) {
      return { text: data.text, mode: "edge-function" };
    }

    if (error) throw new Error(error.message || JSON.stringify(error));
    if (data?.error) throw new Error(data.error);

    throw new Error("Respuesta inesperada de la Edge Function");
  } catch (err) {
    return {
      error: `Error al llamar a la Edge Function: ${err.message}. Verifica que este desplegada y que GEMINI_API_KEY este configurada (supabase secrets set).`,
    };
  }
}

async function askViaDirectApi(question, alertsContext, apiKey) {
  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const systemWithContext = alertsContext
    ? `${buildSystem()}\n\nAlertas activas actuales:\n${alertsContext}`
    : buildSystem();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemWithContext }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.4 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta del modelo.";
    return { text, mode: "byok" };
  } catch (err) {
    return { error: `Error llamando a la API de Gemini: ${err.message}` };
  }
}

function buildSystem() {
  return `Eres SecureDash AI, un asistente de ciberseguridad integrado en un panel SOC para PYMEs chilenas. Responde en espanol, maximo 3-4 oraciones, termina con una accion concreta recomendada.`;
}
