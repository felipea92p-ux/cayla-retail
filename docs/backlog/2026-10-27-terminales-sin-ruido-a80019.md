# Backlog · 2026-10-27 · Una terminal ya no llena el registro de errores al abrir una pantalla (ADR-0533) — rama `claude/terminales-sin-ruido-a80019`

## POR PEGAR en producción (2026-10-27) — decide Felipe

Se pega **después de fusionar**, y solo con el OK de Felipe (pidió esperarlo): la web de este PR funciona sin el SQL (si la base no tiene `fn_mi_persona_id`, responde PGRST202 y la web usa la lectura de antes), así que pegarlo antes no hace falta y publicar la web primero no rompe nada. Lo único que no cambia hasta que se pegue es el ruido: ~4 258 errores al día «Elige quién hace esta operación» de las tablets.

1. `20261027140000_terminal_lecturas_sin_ruido.sql` — UNA parte, re-pegable, solo `create or replace function` y permisos (sin tablas, políticas ni `drop trigger`). Va pegada tal cual en el SQL Editor de producción. Termina con su propio bloque de comprobación: si algo no quedó, la pegada falla sin aplicarse.

Comprobación (debe dar `t | t | t`): `select to_regprocedure('retail.fn_mi_persona_id()') is not null, position('fn_mi_persona_id()' in pg_get_functiondef('retail.fn_mi_pantalla_principal()'::regprocedure)) > 0, not has_function_privilege('anon', 'retail.fn_mi_persona_id()', 'execute');`

Después de pegar: comprobar en el registro de Postgres (`query_logs`, `source = 'postgres_logs'`) que cae el conteo de «Elige quién hace esta operación», y `pnpm datos:generar:produccion` (`docs/datos/generado/COMO-REFRESCAR.md`).

- [x] `fn_mi_persona_id()` + `fn_mi_pantalla_principal()` sin rechazar a una terminal (migración `20261027140000`), `persona-actual.ts` con respaldo, ADR-0533. Casos en `pnpm pruebas:terminal-lecturas-sin-ruido` (9) y `pruebas:terminal-sin-responsable` sigue en 27/27.
- [ ] **PEGAR `20261027140000` en producción (lo decide Felipe).**
- [ ] Sin hacer: ver el conteo de errores bajar en producción (solo se puede después de pegar). Sin navegador: el cambio no cambia ninguna pantalla.
