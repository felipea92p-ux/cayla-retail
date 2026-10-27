# Backlog · 2026-10-27 · Una terminal ya no llena el registro de errores al abrir una pantalla (ADR-0533) — rama `claude/terminales-sin-ruido-a80019`

## PEGADA en producción (2026-10-27, con el OK de Felipe) — ya no está por pegar

Se pegó el 2026-10-27 a las 14:07 UTC (registrada como `20261027140750`, la hora del pegado; el archivo se llama `20261027140000`), por el MCP de Supabase, ANTES de fusionar: primero un ensayo revertible (terminal real → vacío sin error; persona real → mismo id y misma pantalla que antes; sin sesión → vacío; `anon` sin permiso) y después la aplicación. La web de este PR funciona con o sin el SQL (si la base no tiene `fn_mi_persona_id`, responde PGRST202 y la web usa la lectura de antes), así que pegarlo antes no hace falta y publicar la web primero no rompe nada. Lo único que no cambia hasta que se pegue es el ruido: ~4 258 errores al día «Elige quién hace esta operación» de las tablets.

1. `20261027140000_terminal_lecturas_sin_ruido.sql` — UNA parte, re-pegable, solo `create or replace function` y permisos (sin tablas, políticas ni `drop trigger`). Va pegada tal cual en el SQL Editor de producción. Termina con su propio bloque de comprobación: si algo no quedó, la pegada falla sin aplicarse.

Comprobación (debe dar `t | t | t`): `select to_regprocedure('retail.fn_mi_persona_id()') is not null, position('fn_mi_persona_id()' in pg_get_functiondef('retail.fn_mi_pantalla_principal()'::regprocedure)) > 0, not has_function_privilege('anon', 'retail.fn_mi_persona_id()', 'execute');`

Después de pegar: comprobar en el registro de Postgres (`query_logs`, `source = 'postgres_logs'`) que cae el conteo de «Elige quién hace esta operación», y `pnpm datos:generar:produccion` (`docs/datos/generado/COMO-REFRESCAR.md`).

- [x] `fn_mi_persona_id()` + `fn_mi_pantalla_principal()` sin rechazar a una terminal (migración `20261027140000`), `persona-actual.ts` con respaldo, ADR-0533. Casos en `pnpm pruebas:terminal-lecturas-sin-ruido` (9) y `pruebas:terminal-sin-responsable` sigue en 27/27.
- [x] **PEGADA `20261027140000` en producción (OK de Felipe, 2026-10-27).** Verificada en solo lectura: la función existe, `fn_mi_pantalla_principal` la usa, `anon` no la ejecuta, `authenticated` y `service_role` sí, una sola firma de cada una.
- [ ] Falta: ver el conteo de errores bajar. Con solo el SQL pegado cae la mitad (la que viene de `fn_mi_pantalla_principal`); la otra mitad (`fn_actor_persona_id(false)` desde la web) cae cuando se publique la web de este PR. Sin navegador: el cambio no cambia ninguna pantalla.
