## 🧾 Un Admin recibe lo que él mismo compró (2026-10-26, ADR-0517) — rama `claude/inventario-recibir-mejoras-a2e1cc`

- [x] Migración `20261026161000_admin_recibe_lo_que_compro.sql`: la excepción en un solo lugar (`fn_recepcion_puede_recibir_lo_propio`), el candado (`fn_recepcion_exigir`), «Llegó esta orden» (`recibir_orden_sin_envio`), las lecturas (`fn_recepcion_quien_mira`), `fn_envio_detalle` y `fn_revisar_compras` con la marca del rastro, y el disparador que anota en Actividad. **Aplicada en la base local.**
- [x] Web: aviso al Admin antes de contar, aviso en el envío cerrado y chip en la ficha del papel de «Revisar compras»; textos del bloqueo y de la guía al día.
- [x] `pnpm pruebas:recibir-lo-propio` (10 casos) y tres casos de suites viejas adaptados.
- [x] «Precio de venta» del cierre del envío en una fila por prenda; el título «Contra factura» de «Ver todo lo recibido» ya no queda tapado.
- [x] **Pegar la migración en producción (con el OK de Felipe).** Hecho el 2026-10-26 (`apply_migration` «admin_recibe_lo_que_compro», versión 20261026221730 en el historial); antes se comprobó en solo lectura que las tres anclas existían una vez, y después los md5 de las funciones salieron iguales a lo probado.
- [ ] Ver renderizado el aviso de un envío cerrado por quien compró (la base local no tiene uno).
- [ ] Decidir si el Taller (insumos) recibe la misma excepción (hoy conserva el bloqueo íntegro).
- [ ] `/formidable` y `/chaos` de las pantallas de Recibir tocadas (no se corrieron).
- [ ] `pendientes_de_envio` L1 espera una base sin pendientes: falla en la base local compartida (137 de datos reales). No es de este cambio.

## 🧾 Costo de compra por prenda en el cierre de un envío (2026-10-26, ADR-0519) — rama `claude/inventario-recibir-mejoras-a2e1cc`

- [x] Migración `20261026164000_costo_por_prenda_en_la_recepcion.sql`: `despacho_conteos.costos_prendas`, el cierre lo valida y lo guarda, la puerta al stock usa el costo de cada variante, «Hacer ahora» entra con él y el conteo lo devuelve. **Aplicada en la base local.**
- [x] Web: «Precio de compra» por prenda junto al de venta (con «Antes S/ …»), lo que se manda al cerrar, la confirmación y el frenado de un costo mal escrito; guía y huella al día.
- [x] `pnpm pruebas:costo-por-prenda` (9 casos) y las reglas puras de la web probadas.
- [x] **Pegar en producción (con el OK de Felipe), después de `20261026161000`, y ANTES de publicar la pantalla.** Hecho el 2026-10-26 (`apply_migration` «costo_por_prenda_en_la_recepcion», versión 20261026221835); anclas comprobadas antes en solo lectura y md5 iguales a lo probado después.
- [ ] Cerrar un envío real desde la pantalla con un costo propio y mirar `despacho_recibidos` (no se hizo para no mover datos de pruebas).
- [ ] Decidir si las prendas «por crear» (sin producto todavía) también llevan costo propio: hoy entran con el de su línea.

