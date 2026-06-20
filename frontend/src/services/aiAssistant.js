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
- Opcion B (BYOK): ingresa tu propia API key de Anthropic abajo (solo para
  uso personal/demo, no para un sitio publico).`;

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
  const system = `Eres SecureDash AI, un asistente de ciberseguridad integrado en un panel SOC para PYMEs chilenas. Responde siempre en espanol, en maximo 3-4 oraciones, y termina con una accion concreta recomendada.${
    alertsContext ? `\n\nAlertas activas actuales:\n${alertsContext}` : ""
  }`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`${res.status} ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "Sin respuesta del modelo.";
    return { text, mode: "byok" };
  } catch (err) {
    return { error: `Error llamando a la API de Anthropic: ${err.message}` };
  }
}
