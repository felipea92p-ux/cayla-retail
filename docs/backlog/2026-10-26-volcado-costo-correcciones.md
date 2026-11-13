## 🗂️ Refresco del volcado (2026-10-26) — rama `claude/volcado-costo-correcciones`

- [x] Volcado al día con producción (foto del 2026-10-26 21:08 UTC): 287 relaciones, 1650 funciones; `costo_correcciones` ya está en `docs/datos/generado/`.
- [x] 13 tablas nuevas con pájaro; `aviario --verificar` en verde.
- [ ] Producción trae migraciones que `main` no tiene con ese nombre: `campanas_modulo_y_portada_por_dia`, `campanas_diseno`, `campanas_diseno_en_la_tienda`, `campanas_una_sola_llave`, `campanas_web_imagenes_parte1_bucket`/`parte2_politica`, `cambio_varias_prendas_parte4_revisar_envio_al_final_de_la_lista`, `trafico_web` y `trafico_web_lectura` (ADR-0495, rama aún fuera de `main`); las dos `…_comentarios_exactos` son re-pegados de funciones ya existentes. Se anota, no se arregla aquí.
- [ ] `20261026162000_tienda_web_conf_tienda` está en `main` y sus tablas existen en producción, pero no figura en `schema_migrations` (se pegó por el SQL Editor).
- [ ] `RPCS.md` y `DICCIONARIO-DYNAMIC.md` quedaron en la foto del 2026-09-12: ningún script del volcado los refresca (`generar.mjs --volcado` solo reescribe el de Retail). Nunca correr `datos:generar` a secas: pisa ambos con la foto del Postgres local.
