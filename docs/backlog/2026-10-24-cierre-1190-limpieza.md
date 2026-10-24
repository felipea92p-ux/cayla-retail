## 🧹 Cierre de #1190: portada a `main` y archivo (2026-10-24) — solo base y deriva, sin web; rama `claude/cierre-1190-limpieza`

- [x] #1190 cerrado en GitHub (rama conservada: ahí viven ADR-0436, su maqueta y `packages/portada`).
- [x] Migración `20261024155000_campanas_cierre_de_1190_portada_a_main_y_archivo.sql` (una parte, idempotente, con guarda de md5) + `deriva.mjs` (diferencias CONOCIDAS congeladas por huella, con 3 pruebas) + actualización de ADR-0476. Ensayo en base desechable: ver la bitácora.
- [ ] **POR PEGAR (2026-10-24) — `supabase/migrations/20261024155000_campanas_cierre_de_1190_portada_a_main_y_archivo.sql`**: pegarla de una vez en el SQL Editor de producción, con el OK de Felipe, **después** de revisar el PR. Se pega DESPUÉS de fusionar sin riesgo (la tienda de `main` ya ignora la clave sobrante); no hay apuro. Comprobar con las 4 consultas del encabezado del archivo (deben dar `t`).
- [ ] Después de pegarla: refrescar el volcado (`pnpm datos:generar:produccion`) y correr la deriva del día; debe quedar roja solo por `fn_analisis_pedido_en_camino`.
- [ ] `fn_analisis_pedido_en_camino(uuid)`: de la rama `claude/skills-todos-agents-94f745` (commit `b9dfac277`, sin PR); subirla a PR o dejar constancia de por qué no.
- [ ] Decisión de Felipe: lo que se pierde con el cierre (campañas sin descuento, carrusel, fondo con foto, `packages/portada`, la puerta de Editar producto de `212000`) se rehace o no sobre `campana_web_disenos`.
- [ ] Independiente de #1190 y visible al cliente: Aniversario CAYLA (−10 %) rige solo en TRU y la portada lo anuncia en las 3 sedes; el 24 y 25-oct el Día del Gato (−15 %, todas las sedes) convive con una portada que sigue anunciando Aniversario.
