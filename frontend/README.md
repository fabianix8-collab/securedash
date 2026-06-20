# SecureDash — Frontend

Dashboard React que consume la salida real de `pipeline/detection_engine.py`
(`pipeline/output/dashboard_data.json`) y la presenta como un panel SOC:
métricas, alertas priorizadas, gráficos (Chart.js) y un asistente IA.

Ver el [README principal](../README.md) para la arquitectura completa del
proyecto y la explicación de qué datos son simulados vs reales.

## Requisitos

- Node.js 20+
- El archivo `src/data/dashboard_data.json` debe existir. Se copia desde
  `pipeline/output/` después de correr el pipeline:

  ```bash
  cd ../pipeline
  python3 log_generator.py
  python3 detection_engine.py
  cp output/dashboard_data.json ../frontend/src/data/
  ```

## Desarrollo

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build    # genera dist/
npm run preview  # sirve dist/ localmente para probar el build
```

## Asistente IA

Por defecto, sin configuración, el asistente muestra instrucciones de cómo
activarlo (no hay ninguna key hardcodeada en el código — ver
[`docs/api-key-handling.md`](../docs/api-key-handling.md)).

**Opción A — Edge Function de Supabase (recomendada):**

1. Despliega `supabase/functions/ai-proxy` y configura el secret
   `ANTHROPIC_API_KEY` en Supabase (ver README principal).
2. Copia `.env.example` a `.env.local` y completa `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` (la **anon key**, nunca la service role).

**Opción B — BYOK (solo para uso personal):**

Si no configuras Supabase, el panel del asistente muestra un campo para
pegar tu propia API key de Anthropic. Se usa solo en memoria del navegador
durante esa sesión, nunca se guarda ni se envía a ningún servidor propio.

## Deploy en GitHub Pages

El workflow en `.github/workflows/deploy.yml` construye y publica
automáticamente `frontend/dist` en cada push a `main`. Pasos:

1. En GitHub: **Settings → Pages → Source → GitHub Actions**.
2. (Opcional) Agrega los secrets `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` en **Settings → Secrets and variables → Actions**
   si vas a usar la Opción A del asistente IA.
3. Si tu repo no se llama `securedash`, ajusta `base` en `vite.config.js`
   (o define la variable de entorno `VITE_BASE_PATH` en el workflow) para que
   coincida con `https://<usuario>.github.io/<nombre-repo>/`.

## Estructura

```
src/
  components/   -> un componente por panel del dashboard
  services/      -> cliente de Supabase + lógica del asistente IA
  data/           -> dashboard_data.json (salida del pipeline de Python)
  App.jsx         -> layout principal
  index.css       -> sistema de diseño (paleta, paneles, badges)
```
