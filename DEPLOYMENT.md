# SecureDash — Runbook operativo (puesta en marcha completa)

Esta guía asume que el codigo ya esta correcto y probado localmente (pipeline,
build de frontend, lint — todo verificado). Lo que queda son pasos que
**requieren tus propias cuentas** (Supabase, GitHub, Anthropic), por lo que
no se pueden automatizar desde aqui. Sigue el orden: cada paso depende del
anterior.

Tiempo estimado total: 30-45 minutos la primera vez.

---

## Paso 0 — Cuentas necesarias (gratis)

- [ ] Cuenta en [github.com](https://github.com)
- [ ] Cuenta en [supabase.com](https://supabase.com) (login con GitHub es lo mas rapido)
- [ ] API key de Anthropic en [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
      (requiere agregar metodo de pago; el uso de este proyecto es minimo, pero la cuenta debe existir)

---

## Paso 0.5 — Verificación local (antes de subir nada)

```bash
cd pipeline
pip install -r requirements.txt --break-system-packages
python3 -m pytest -v          # deberian pasar 29 tests
python3 log_generator.py
python3 detection_engine.py
cp output/dashboard_data.json ../frontend/src/data/

cd ../frontend
npm install
npm run lint
npm run build                 # debe compilar sin errores
```

- [ ] Los 29 tests pasan
- [ ] `npm run build` termina sin errores

---

## Paso 1 — Repositorio en GitHub

```bash
cd securedash
git init
git add .
git commit -m "Initial commit: SecureDash"
```

En GitHub: **New repository** → nombre `securedash` (si usas otro nombre,
ajusta `base` en `frontend/vite.config.js`) → **no** inicialices con README
(ya tienes uno) → crea el repo, luego:

```bash
git remote add origin https://github.com/<tu-usuario>/securedash.git
git branch -M main
git push -u origin main
```

**Checklist:**
- [ ] El repo existe y el codigo esta arriba
- [ ] `pipeline/output/dashboard_data.json` y `frontend/src/data/dashboard_data.json` estan en el repo (son la "demo data" — esta bien que sean publicos, son sinteticos)

---

## Paso 2 — Proyecto Supabase + esquema

1. En Supabase: **New project** → elige nombre, password de DB (guardalo), region (la mas cercana, ej. `sa-east-1` São Paulo).
2. Espera ~2 min a que se cree.
3. Ve a **SQL Editor** → **New query** → pega el contenido completo de
   `supabase/schema.sql` → **Run**.

**Verificacion:**
- [ ] En **Table Editor** aparecen 3 tablas: `alerts`, `attacker_ips`, `pipeline_runs`
- [ ] En **Authentication → Policies** (o Database → Policies), cada tabla
      tiene una policy de `SELECT` para el rol publico y **ninguna** de
      INSERT/UPDATE/DELETE para `anon` (esto es intencional, ver comentarios
      en schema.sql)

---

## Paso 3 — Cargar los datos del pipeline a Supabase

En **Project Settings → API**, copia:
- `Project URL` → `SUPABASE_URL`
- `service_role` key (sección "Project API keys", **no** la `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`

```bash
cd pipeline
pip install -r requirements.txt --break-system-packages
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
python3 load_to_supabase.py
```

Salida esperada: `OK: 7 filas -> alerts`, `OK: 4 filas -> attacker_ips`, `OK: 1 filas -> pipeline_runs`.

**Verificacion:**
- [ ] En Table Editor, la tabla `alerts` tiene 7 filas
- [ ] `attacker_ips` tiene 4 filas

> Nota: cada corrida de `load_to_supabase.py` agrega nuevas filas a `alerts`
> y `pipeline_runs` (son historicos), pero actualiza `attacker_ips` por IP
> (`on_conflict=ip`). Si quieres limpiar y reiniciar, borra las filas desde
> el Table Editor antes de re-correr.

---

## Paso 4 — Edge Function (proxy de IA)

Instala la CLI de Supabase (una vez):

```bash
npm install -g supabase
```

Desde la raiz del proyecto:

```bash
supabase login
supabase link --project-ref <tu-project-ref>   # esta en Project Settings → General
supabase functions deploy ai-proxy
supabase secrets set ANTHROPIC_API_KEY=sk-ant-tu-key-aqui
```

**Verificacion (prueba directa con curl):**

```bash
curl -L -X POST 'https://<tu-project-ref>.supabase.co/functions/v1/ai-proxy' \
  -H "Authorization: Bearer <tu-anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"question":"Explica que es un ataque de fuerza bruta"}'
```

- [ ] La respuesta es `{"text": "..."}` (no `{"error": ...}`)
- [ ] Si da error 500 "ANTHROPIC_API_KEY no configurada", revisa
      `supabase secrets list` para confirmar que el secret quedo guardado

---

## Paso 5 — Conectar el frontend a Supabase

```bash
cd frontend
cp .env.example .env.local
```

Edita `.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # la ANON key, Project Settings → API
```

Prueba local:

```bash
npm run dev
```

- [ ] Las alertas, métricas y gráficos se ven correctamente
- [ ] El asistente IA YA NO muestra el mensaje de "no configurado"
- [ ] Click en una alerta → el asistente responde (llamando a la Edge Function)

---

## Paso 6 — GitHub Pages (deploy automático)

1. En GitHub: **Settings → Pages → Source → GitHub Actions**.
2. En **Settings → Secrets and variables → Actions → New repository secret**,
   agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Haz commit/push de cualquier cambio en `frontend/` (o ve a la pestaña
   **Actions** y ejecuta el workflow "Deploy frontend to GitHub Pages"
   manualmente con **Run workflow**).
4. Espera a que el workflow termine (✅ verde).

- [ ] El sitio queda publicado en `https://<tu-usuario>.github.io/securedash/`
- [ ] Si el repo NO se llama `securedash`, edita `base` en
      `frontend/vite.config.js` antes del paso 3 de este punto

---

## Paso 7 — Verificación end-to-end final

- [ ] Abrir la URL de GitHub Pages en el celular → revisar que se vea bien (responsive)
- [ ] Hacer click en la alerta crítica de fuerza bruta → el asistente la explica
- [ ] Usar un botón rápido del asistente ("Resumen ejecutivo") → responde en español
- [ ] Revisar en Supabase (Table Editor) que las 7 alertas siguen ahí

---

## Mantenimiento: refrescar los datos

Para simular una "nueva corrida" del SOC con datos distintos:

```bash
cd pipeline
python3 log_generator.py
python3 detection_engine.py
cp output/dashboard_data.json ../frontend/src/data/dashboard_data.json
python3 load_to_supabase.py   # si usas Supabase

git add .
git commit -m "Refresh demo data"
git push   # dispara el deploy automático
```

---

## Troubleshooting rápido

| Síntoma | Causa probable |
|---|---|
| GitHub Pages muestra pantalla en blanco | `base` en `vite.config.js` no coincide con el nombre del repo |
| Asistente IA dice "no configurado" en producción | Faltan los secrets `VITE_SUPABASE_*` en GitHub Actions |
| Edge Function responde 500 | `ANTHROPIC_API_KEY` no seteada (`supabase secrets list`) |
| `load_to_supabase.py` da error de columna | El esquema no se corrió completo — re-ejecuta `schema.sql` |
| Tabla vacía en el dashboard | Olvidaste copiar `dashboard_data.json` a `frontend/src/data/` tras correr el pipeline |
