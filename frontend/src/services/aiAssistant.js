import { supabase, isSupabaseConfigured } from "./supabaseClient";

/**
 * Servicio del asistente IA. Implementa los DOS modos documentados en
 * docs/api-key-handling.md:
 *
 *   A) Edge Function de Supabase (recomendado): la API key vive como
 *      secret en el servidor de Supabase. Se usa si VITE_SUPABASE_URL y
 *      VITE_SUPABASE_ANON_KEY estan configuradas.
 *
 *   B) BYOK (Bring Your Own Key): el usuario pega su propia API key de
 *      Anthropic, que se guarda solo en memoria (estado de React) y se usa
 *      para llamar directo a la API desde el navegador. Anthropic requiere
 *      el header 'anthropic-dangerous-direct-browser-access' para esto - el
 *      nombre del header es deliberadamente alarmante: la key queda
 *      expuesta en el bundle/devtools de quien use tu sitio. Es un fallback
 *      para demos personales, no para un sitio publico con trafico real.
 *
 * Devuelve siempre { text } o { error }.
 */

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

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return { text: data.text, mode: "edge-function" };
  } catch (err) {
    return {
      error: `Error al llamar a la Edge Function: ${err.message}. Verifica que esté desplegada y que ANTHROPIC_API_KEY esté configurada (supabase secrets set).`,
    };
  }
}

async function askViaDirectApi(question, alertsContext, apiKey) {
  // Modo BYOK con Gemini: la key se usa directamente desde el navegador
  // solo para demos personales. Ver docs/api-key-handling.md.
  const GEMINI_MODEL = "gemini-2.0-flash";
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
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Sin respuesta del modelo.";
    return { text, mode: "byok" };
  } catch (err) {
    return { error: `Error llamando a la API de Gemini: ${err.message}` };
  }
}

function buildSystem() {
  return `Eres SecureDash AI, un asistente de ciberseguridad integrado en un panel SOC para PYMEs chilenas. Responde en espanol, maximo 3-4 oraciones, termina con una accion concreta recomendada.`;
}
