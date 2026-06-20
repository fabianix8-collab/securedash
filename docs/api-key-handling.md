# Manejo de API Keys en SecureDash

Este documento explica el problema de seguridad mas critico del prototipo
inicial y las dos formas correctas de resolverlo, segun donde despliegues
el proyecto.

## El problema

GitHub Pages solo sirve archivos estaticos (HTML/CSS/JS). No hay backend.
Si la llamada a la API de Claude se hace con `fetch()` directo desde el
navegador, la API key tiene que estar en el bundle de JavaScript que se le
entrega al usuario -> cualquiera puede abrir las DevTools, copiar la key y
usarla bajo tu cuenta.

Para un proyecto que se presenta como herramienta de seguridad, este es
exactamente el tipo de vulnerabilidad que el dashboard deberia "detectar".
Por eso es importante resolverlo y poder explicarlo en una entrevista.

## Opcion A (recomendada) - Supabase Edge Function como proxy

Si ya estas usando Supabase para persistencia (ver `supabase/schema.sql`),
lo mas natural es agregar la Edge Function en `supabase/functions/ai-proxy/`.

La API key vive como secret en Supabase (`supabase secrets set
ANTHROPIC_API_KEY=...`), nunca en el repo ni en el bundle del frontend. El
frontend llama a `supabase.functions.invoke('ai-proxy', {...})`.

Ventajas: seguro, gratis dentro de los limites del free tier de Supabase,
no necesitas mantener un servidor.

## Opcion B - Modo "Bring Your Own Key" (BYOK) para demo 100% estatica

Si quieres que el proyecto funcione SOLO con GitHub Pages, sin Supabase ni
ningun backend, la alternativa honesta es pedirle al usuario que ingrese su
propia API key de Anthropic (obtenida gratis en console.anthropic.com), que
se guarda SOLO en memoria del navegador (nunca en localStorage, nunca se
envia a ningun servidor tuyo).

Implementacion (React, ejemplo):

```jsx
function ApiKeyInput({ onSave }) {
  const [key, setKey] = useState("");
  return (
    <div className="api-key-banner">
      <p>
        Para usar el asistente IA, ingresa tu propia API key de Anthropic.
        Se usa solo en este navegador y no se almacena en ningun servidor.
      </p>
      <input
        type="password"
        placeholder="sk-ant-..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <button onClick={() => onSave(key)}>Guardar</button>
      <a href="https://console.anthropic.com/settings/keys" target="_blank">
        Obtener una API key gratis
      </a>
    </div>
  );
}
```

La key se guarda en un `useState` (memoria, se pierde al recargar) — NUNCA
en `localStorage`/`sessionStorage`, porque eso la deja accesible a cualquier
script que corra en la pagina (riesgo de XSS).

## Que opcion elegir para el portafolio

Para impresionar en una entrevista, la Opcion A es mejor: demuestra que
sabes que un proxy de servidor es la forma correcta de manejar secretos, y
que entiendes Edge Functions / arquitectura serverless.

La Opcion B es valida como fallback documentado ("si no quieres configurar
Supabase, esta es la alternativa, y aqui esta el tradeoff de seguridad que
implica"). Mencionar AMBAS opciones en el README, con sus tradeoffs, es en
si mismo una senal de madurez tecnica.
