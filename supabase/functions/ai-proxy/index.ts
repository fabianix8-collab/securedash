// ============================================================================
// SecureDash - Edge Function: ai-proxy
// ============================================================================
// PROBLEMA QUE RESUELVE:
// En el prototipo inicial, la llamada a la API de Claude se hacia
// directamente desde el navegador con fetch(), lo que requiere exponer la
// API key en el codigo del frontend -> cualquiera puede abrir devtools,
// copiar la key y usarla por su cuenta. Para un proyecto de CIBERSEGURIDAD,
// este error es especialmente notorio.
//
// SOLUCION:
// Esta Edge Function corre en los servidores de Supabase (Deno runtime).
// La API key vive como variable de entorno del lado del servidor
// (ANTHROPIC_API_KEY, configurada con `supabase secrets set`), y el
// frontend solo llama a esta funcion - nunca ve la key real.
//
// DEPLOY:
//   supabase functions deploy ai-proxy
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// USO DESDE EL FRONTEND:
//   const { data, error } = await supabase.functions.invoke('ai-proxy', {
//     body: { question: '...', alertsContext: '...' }
//   });
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres SecureDash AI, un asistente de ciberseguridad integrado
en un panel SOC para PYMEs chilenas. Tu trabajo es explicar alertas de
seguridad en lenguaje simple para usuarios no tecnicos.

Reglas:
- Responde siempre en espanol.
- Maximo 3-4 oraciones.
- Siempre termina con una accion concreta recomendada.
- Si te dan contexto de alertas activas, usalo en tu respuesta.
- Si la pregunta no tiene relacion con seguridad, redirige amablemente
  al proposito del panel.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada en el servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { question, alertsContext } = await req.json();

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Falta el campo 'question' (string)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const system = alertsContext
      ? `${SYSTEM_PROMPT}\n\nAlertas activas actuales:\n${String(alertsContext).slice(0, 2000)}`
      : SYSTEM_PROMPT;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: question.slice(0, 1000) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${response.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? "No se pudo obtener una respuesta.";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
