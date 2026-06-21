// ============================================================================
// SecureDash - Edge Function: ai-proxy (Gemini)
// ============================================================================
// PROBLEMA QUE RESUELVE:
// Llamar a la API de IA directamente desde el navegador expone la key en
// devtools -> cualquiera puede copiarla. Para un proyecto de CIBERSEGURIDAD
// esto es especialmente notorio.
//
// SOLUCION:
// Esta Edge Function corre en los servidores de Supabase (Deno runtime).
// La key vive como variable de entorno del lado del servidor (GEMINI_API_KEY),
// configurada con `supabase secrets set`. El frontend solo llama a esta
// funcion — nunca ve la key real.
//
// DEPLOY:
//   supabase functions deploy ai-proxy
//   supabase secrets set GEMINI_API_KEY=AQ...
//
// USO DESDE EL FRONTEND:
//   const { data, error } = await supabase.functions.invoke('ai-proxy', {
//     body: { question: '...', alertsContext: '...' }
//   });
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY no configurada en el servidor. Ejecuta: supabase secrets set GEMINI_API_KEY=tu-key" }),
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

    const systemWithContext = alertsContext
      ? `${SYSTEM_PROMPT}\n\nAlertas activas actuales:\n${String(alertsContext).slice(0, 2000)}`
      : SYSTEM_PROMPT;

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemWithContext }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: question.slice(0, 1000) }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.4,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${response.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "No se pudo obtener una respuesta.";

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
