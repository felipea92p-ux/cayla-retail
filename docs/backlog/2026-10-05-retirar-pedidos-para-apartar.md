## 🧹 Retirar `fn_pedidos_para_apartar` (2026-10-05, ADR-0328 act. 17, cierre) — migración `20261005170000` **POR PEGAR**; rama `claude/retirar-pedidos-para-apartar`

La lectura vieja de los pedidos a otra sede para un cliente. #799 la reemplazó por `fn_pedidos_con_cliente`, pero quedó viva en producción
y le entrega a la sede que envía el nombre, los apellidos y el celular del cliente (la decisión del 2026-10-04 se los quitó).

- [x] **Producción leída (solo lectura, 2026-10-05):** firma `p_ubicacion_id uuid`; cero llamadas desde `pg_proc.prosrc`, `pg_views`,
  `pg_matviews`, `pg_policies`, `pg_depend`, `pg_trigger` y `cron.job`. En los registros de la API de las últimas 24 h, su última llamada
  fue el 2026-10-04 22:26 UTC (la web de antes de #799); desde que se publicó #799 (2026-10-05 14:30 UTC) solo se llama la nueva.
- [x] **Pruebas:** `pedir_a_otra_sede.mjs` 71/71 y `separaciones.mjs` 79/79 leyendo `fn_pedidos_con_cliente`, con y sin la migración;
  la migración se pega dos veces sin error.
- [ ] **POR PEGAR en producción.** Una sola parte, se pega tal cual (un `drop function if exists`; sin políticas, sin `alter`, sin
  `drop trigger`). Antes, la sonda de la cabecera (debe dar 0 y 0); después:
  ```sql
  select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_pedidos_para_apartar';  -- 0
  ```
- [ ] Después de pegar, refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`): `funciones-produccion.txt` y
  `packages/database/src/types.ts` todavía la listan porque se generan desde producción.
