## 🧾 Compras solo ve historial (2026-10-29, ADR-0574) — web + 6 migraciones SIN pegar; rama `claude/saldo-devolucion-pendiente-5c8383`

- [x] El saldo baja al cerrar con devolución; «Por devolver en caja» (`20261029191000`).
- [x] La transferencia con banco y «ya tenía plata» entran solas al fondo (`20261029192000`).
- [x] Serie y número al comprar, con las reglas de completar y sin duplicados (`20261029193000`).
- [x] El papel pasa solo a los libros al cerrar el conteo; si falla, queda con su motivo (`20261029194000`).
- [x] Los gastos con papel pasan solos al cerrar la ronda (`20261029195000`).
- [x] «Revisar compras» trae lo que escribió la compradora y por qué no pasó solo (`20261029200000`).
- [ ] **Pegar las seis migraciones en producción, en orden y ANTES de publicar la web** (esperan el OK de Felipe). Después refrescar el volcado del diccionario (`compra_papeles.serie/numero/pasa_sola_error`, `compra_gastos.papel/ruc/pasa_sola_error`).
- [ ] **Sin probar en el navegador:** el formulario de «Registrar compra» con serie y número, el de «Gasté en otra cosa» con su papel, el detalle de Compras con el aviso, y «Reabrir» a la derecha. Falta `/formidable`, `/chaos` (guardan), el celular a 375 px y 1920 px, y correr las guías (`guias:recorrer`) de `compras.mi-plata`, `compras.mi-plata.compra` y `compras.fondos`.
- [ ] **Decisión de Felipe:** ¿un margen para corregir el conteo antes de que la compra pase a los libros? Hoy cerrar el conteo es definitivo (el envío ya no se reabre).
- [ ] **Decisión de Felipe:** lo ya pendiente (sus S/ 5,700 por confirmar; papeles y gastos anotados antes) sigue en la bandeja de Compras. ¿Se confirma de una vez desde Compras, o se hace una migración de una vez?
- [ ] **Decisión de Felipe:** Yape, efectivo y la transferencia sin banco siguen por confirmar porque no se sabe de qué caja salen. Si quiere que también pasen solos, hay que elegir una cuenta de origen para cada medio.
- [ ] «Ya tenía plata» no sale de «BCP Empresa» (la tabla lo prohíbe); si se quiere, es un cambio de esquema aparte.
- [ ] La devolución en caja sigue pidiendo que Compras la reciba (`recibir_cierre_compras`): elige la cuenta (viene la que indicó la compradora). Es lo único que quedó manual porque mueve plata física.
