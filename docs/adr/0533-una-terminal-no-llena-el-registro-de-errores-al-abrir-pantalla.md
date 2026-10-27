# ADR-0533 — Una terminal ya no llena el registro de errores al abrir una pantalla

**Estado:** aceptada · migración `20261027140000` **EN PRODUCCIÓN desde 2026-10-27** (con el OK de Felipe; registrada como `20261027140750`, la hora del pegado) · la web va en su PR · **Fecha:** 2026-10-27 ·
**Decidió:** Felipe (toca funciones de la base en producción) · **Sigue a:** ADR-0161/0162 (responsable de la operación) y ADR-0454 (terminales con respaldo)

## Contexto

Al revisar el registro de Postgres de producción (24 h, 2026-10-26/27) el error más repetido, con diferencia, fue «Elige quién hace esta
operación»: **4 258 veces**, unas 48 por hora aun de madrugada, siempre a pares (dos llamadas por cada carga de pantalla). No era una falla:
cada carga de pantalla (`requirePersonaActualV2`, `apps/web/lib/persona-actual.ts`) hace dos lecturas en paralelo, y en una TERMINAL (la tablet de
la tienda, que no es una persona) las dos rechazan a propósito, porque `fn_actor_persona_id` exige responsable:

1. `fn_actor_persona_id(false)`, para proponer a la persona de la sesión en el combo «Responsable».
2. `fn_mi_pantalla_principal()`, que por dentro llama a la misma función.

La web ya descarta las dos respuestas de una terminal (`!terminal && …`). El rechazo no hace nada, pero queda escrito como ERROR y tapa los
errores de verdad cuando se mira el panel de Supabase.

## Decisión

**Dos lecturas que no rechazan, y nada más.**

1. `retail.fn_mi_persona_id()`: la persona de la cuenta (`public.personas.auth_user_id = auth.uid()`), o NULL — sin sesión o en una terminal.
   Es exactamente lo que `fn_actor_persona_id(false)` da a una persona.
2. `retail.fn_mi_pantalla_principal()` lee esa función. Misma respuesta para una persona; NULL (en vez de un rechazo) para una terminal.
3. La web llama a `fn_mi_persona_id`. Si la base aún no la tiene (PGRST202: web publicada antes de pegar la migración), usa la lectura de antes.

`fn_actor_persona_id` no se toca: sigue rechazando a una terminal sin responsable, con `p_de_tienda` true o false.

DESCARTÉ: cambiar `fn_actor_persona_id(false)` para que devuelva NULL en una terminal. Esa función también compara «tú contra tú» en permisos
(`fn_alcanzo_a`, «no te quites a ti mismo»); si hoy rechaza y mañana devuelve NULL, una comparación de seguridad cambia de resultado para callar un
registro. El ruido no vale un permiso.

DESCARTÉ: que la web pregunte primero «¿eres terminal?» y después el resto. Es una espera más, en serie, en cada pantalla de TODAS las cuentas,
para ahorrarle el ruido a unas pocas terminales (hoy las dos van en paralelo con las otras lecturas).

SE ROMPE SI: alguien usa `fn_mi_persona_id()` para decidir un permiso. Es una lectura de la propia cuenta y devuelve NULL a una terminal; un permiso
sigue decidiéndose con `fn_es_lider()` / `fn_ve_modulo()` o `fn_actor_persona_id(false)`.

## Qué no cambia

- Ningún permiso: la función nueva solo devuelve el id de la propia cuenta, que la persona ya podía leer. `anon` no puede ejecutarla.
- `fn_actor_persona_id` y todas las operaciones de tienda firmadas con ella.
- Lo que ve una persona: mismo combo «Responsable» con su propuesta, misma pantalla principal.

## Verificación

- `pnpm pruebas:terminal-lecturas-sin-ruido` (9 casos, ROLLBACK siempre): una persona recibe lo mismo que antes (comparado contra el cuerpo viejo);
  una terminal y «sin sesión» reciben NULL sin error; `fn_actor_persona_id` sigue rechazando a la terminal; `anon` no ejecuta.
- `pnpm pruebas:terminal-sin-responsable` sigue en verde (27/27).

## Cómo se aplicó en producción (OK de Felipe, 2026-10-27)

Se aplicó por el MCP de Supabase **antes** de publicar la web, tras un ensayo revertible contra una terminal real y una persona real (terminal → vacío
sin error; persona → mismo id y misma pantalla que con la lectura vieja; `fn_actor_persona_id(false)` sigue rechazando a la terminal; `anon` sin
permiso). Solo `create or replace function` y permisos: no toma tablas ni políticas. Con solo el SQL cae la mitad del ruido (la de
`fn_mi_pantalla_principal`); la otra mitad cae al publicar la web de este PR. Comprobación pendiente: el conteo de «Elige quién hace esta operación» en
`query_logs` (`source = 'postgres_logs'`).

Si la web se publicara antes que el SQL, nada se rompe: usa la lectura de antes.
