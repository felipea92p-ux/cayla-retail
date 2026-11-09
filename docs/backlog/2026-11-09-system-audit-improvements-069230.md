## 🛡️ El vigía diario de invariantes en producción (2026-11-09, ADR-0632) — migración `20261109152000` POR PEGAR; rama `claude/system-audit-improvements-069230`

Nace del #8 de la auditoría del 2026-11-09 («Nadie vigila la salud del negocio en producción»).

- [x] Clave de identidad en las 28 invariantes de `/chaos` y la siembra generada desde el detector (`scripts/chaos/vigia-semilla.mjs`).
  `vigia-semilla.test.mjs` en el CI: 7 pruebas; control: sin la clave de INV-02, 4 rojas; una palabra cambiada en INV-05 sin regenerar, roja.
- [x] Migración: `invariantes`, `invariantes_corridas`, `invariantes_conocidas`, `fn_correr_invariantes`, `fn_invariantes_estado`,
  `fn_invariantes_aceptar`. `pnpm pruebas:vigia-invariantes` (tanda de Postgres del CI): 20 verdes en una base privada con las 1110
  migraciones de `main` + siembra. Mutación: sin retirar lo conocido, 2 rojos; un error contado como limpia, 1 rojo.
- [x] `GET /api/salud/invariantes` (Vercel Cron 08:30 UTC = 3:30 de Lima). Reglas 7/7 y ruta 7/7 (mutación: avisar siempre = rojo; no
  pedir la clave = rojo). Contra la base real en local: 401 sin clave, 401 con otra, 200 con la buena; el aviso a Sentry lleva conteos e ids.
- [x] Lente «Vigía de la base» en el Observatorio del Admin. Visto en local con una violación provocada (precio de una línea +5): «2 ·
  Problemas nuevos en la base» (INV-02 y INV-07), sin enlace, en claro y en oscuro. `tsc`, eslint, knip, knip:produccion, guías, unificar,
  tema-colores y hover en verde; el hook completo pasó en el commit de la actividad 4.
- [x] `20261109152000` **pegada por Felipe el 2026-11-09**. Verificada por efectos (solo lectura): 28 invariantes (26 activas, 2 sospechas
  apagadas, 1 con sesión), 3 funciones, RLS en las 3 tablas, `authenticated` no las lee, `fn_correr_invariantes` solo `service_role`.
- [x] PR #1731 abierto con `/abrir-pr`.
- [x] Antes de la primera corrida, todas las reglas activas contra producción (solo lectura): INV-03 daba 1.280 falsos positivos (la
  «Prenda sin registrar», ADR-0179/0334). Corregida en `20261109163000`: producción queda en 0 en todo; solo 9 movimientos sin
  responsable (INV-10, ajustes de conteo del 2026-09-30) que serán heredados.
- [ ] **POR PEGAR (Felipe):** `supabase/migrations/20261109163000_vigia_inv03_prenda_sin_registrar.sql`, una parte. Verificar:
  `select sql like '%prendas_por_regularizar%' from retail.invariantes where id = 'INV-03';` → true. Después marcar «SQL pegado» en el PR.
- [ ] Primera corrida: `select retail.fn_correr_invariantes();` (o esperar a las 3:30). Debe decir 0 nuevas y 9 conocidas.
- [ ] **Sentry:** una regla de alerta que escriba a Felipe cuando aparezca `donde = "salud/invariantes (cron): …"` (hoy nadie verificó que
  Sentry mande correos).
- [ ] Tras pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar` al refrescar el volcado (3 tablas y 3 funciones nuevas).
- [ ] Botón «Aceptar» en el detalle de la lente (hoy, `fn_invariantes_aceptar` por SQL Editor).
- [ ] INV-09 (asientos) sale «omitida»: decidir si `fn_diario` acepta la llave de servicio o se queda al Estado de resultados.
- [ ] El índice único de «un comprobante vivo por venta» (INV-06): primero medir producción con `docs/revisiones/2026-11-09-sonda-produccion.sql`.
- [ ] Detalle de texto: «Stock por dueno cuadra» sale sin ñ (el nombre de la invariante es un identificador).
- **No aplica:** `/chaos` (no es una pantalla que guarda), `/focus` y `/sugerir` (sin campos), `/guia` (la lente es un dato, no un
  control nuevo: la huella de Inicio no cambió). **No corrido:** `/formidable` sobre la lente; `tema:auditar`.
