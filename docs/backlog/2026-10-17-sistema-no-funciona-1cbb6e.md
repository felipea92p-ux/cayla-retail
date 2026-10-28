## ⚡ La base se cae sin llevarse al ERP (2026-10-17) — rama `claude/sistema-no-funciona-1cbb6e`, ADR-0450

### Hecho

- [x] Diagnóstico con los registros de Supabase (`query_logs`) y una consulta de solo lectura: dos recuperaciones automáticas (16:41 y 17:23 Lima), la base muda de 17:03 a 17:23, reinicio limpio a las 17:32 y servidor Small (90 conexiones) desde las 17:33. **Causa no confirmada.**
- [x] `lib/base-caida-reglas.ts`: `esFalloDeLaBase`, `esFalloDeAuth`, `rutaDeVuelta`, `msHastaReintentar`; conectado en `persona-actual.ts`, `proxy.ts` y el login.
- [x] `/sin-base` (`components/SinBase.tsx`): espera con pregunta espaciada y azar, no pregunta escondida, vuelve a la pantalla de la que salió.
- [x] `GET /api/salud` del ERP (`retail.fn_salud()`, migración `20261017225000`) y de la tienda (`select 1`); públicas, solo un sí o un no con un motivo de lista fija.
- [x] Vigía de salud: `.github/workflows/vigia-salud.yml` + `scripts/ci/vigia-salud.mjs` (14 pruebas, en el CI).
- [x] Topes de la tienda: migración `20261017230000` (20 conexiones, 5 s, 10 s en transacción quieta), `pnpm pruebas:base-resiliencia` (13 comprobaciones, en el CI).
- [x] **EN PRODUCCIÓN 2026-10-17 con el OK de Felipe:** `20261017225000` (`fn_salud`, versión `20261017234815`, comprobada también por la API pública: `true`, 200) y `20261017230000` (topes, versión `20261017234920`; `tienda_web_prod` con 20 conexiones, 5 s y 10 s; los demás roles sin cambio).
- [x] Auditoría del catálogo público: ya se comparte 30 s–5 min entre visitas; no se tocó.

### Falta (de Felipe, en este orden; detalle en el ADR)

- [ ] **Fusionar el PR** (`fn_salud` ya está en producción: el vigía no avisará «falta_fn_salud»).
- [ ] Variables del repo `URL_SALUD_ERP` y `URL_SALUD_TIENDA`; probar el vigía con «Run workflow» (ensayo).
- [ ] Ajustar el tope de 20 conexiones con datos (`pg_stat_activity` en un día normal y en la prueba de carga; hoy la tienda usa ~13).
- [ ] Una regla en Sentry para `Failed to fetch (…supabase.co)` y un monitor externo con aviso al teléfono.
- [ ] Panel de Supabase ▸ Reports ▸ Database entre 16:30 y 17:35 (CPU, memoria, «Disk IO % consumed», conexiones) y soporte de Supabase por los reinicios: es lo que dice la causa.
- [ ] Decidir el plan de lanzamiento de la tienda (los 12 puntos del ADR): prueba de carga de noche, olas, interruptor de pausa, captcha, Sentry en la tienda.

### Pendiente de ingeniería

- [ ] **Refrescar el diccionario de datos** (`fn_salud` ya está en producción; `docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **`fn_resumen_variantes_json` pasa de 8 s** (el único corte del ERP visto el 17-oct 16:51; `authenticated` corta a los 8 s): medirla con `pg_stat_statements` y arreglar su plan (suite `pruebas:fn-resumen-variantes`).
- [ ] **Ruido de Sentry**: con Auth caído, el cliente de auth del navegador reintenta y cada pestaña manda `TypeError: Failed to fetch` (`CAYLA-RETAIL-E`, `/login`): filtrar ese error en `lib/errores-navegador.ts` mientras `/sin-base` está a la vista, sin esconder fallos reales.
- [ ] `sondearLaBase` (`lib/sondear-la-base.ts`) sigue usando `/auth/v1/health`, que no toca Postgres: pasarlo a `/api/salud` cambia lo que dice «Sin conexión» (ADR-0210/0411) y pide su propia prueba.
- [ ] Probar el catálogo con una caída real (¿sirve la copia vieja?) dentro de la prueba de carga; si no, agregar la última copia buena (ADR-0450 «Descarté»).
- [ ] **Dynamic** (`cayla-dynamic`): el mismo «te saca al login» con la base caída; otro repo.
