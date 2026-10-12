# FIUL · Coach4Energy

App del Programa C4E: plan por bloques, contador diario, informe de composición corporal y panel del coach.

- **Sin dependencias ni compilación.** HTML + JavaScript que habla directo con Supabase (Auth + REST). Vercel la publica tal cual (Framework: Other, sin build).
- **Seguridad:** la dan las reglas RLS de la base (`supabase/01_esquema.sql`). La publishable key de `config.js` es pública por diseño.
- **Base de datos:** Supabase, proyecto FIÜL, región São Paulo.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `app.js`, `styles.css` | La app |
| `config.js` | URL y publishable key de Supabase |
| `vercel.json` | Cabeceras de seguridad para Vercel |
| `supabase/01_esquema.sql` | Tablas, reglas de seguridad y bucket de archivos (ya cargado) |
| `supabase/02_piloto_nicolas.sql` | Ficha, plan y mediciones #8–#12 del piloto |
| `scripts/` | Migración de los Excel de alimentos y generación de SQL |

## Cómo se da de alta un cliente (piloto)

1. Cargar su ficha en `clientes` (con su email) y su plan en `planes`.
2. Supabase → Authentication → Users → Add user → mismo email, contraseña, "Auto Confirm User".
3. La cuenta se vincula sola con la ficha por el email. El cliente entra, acepta el consentimiento y ve su plan.
