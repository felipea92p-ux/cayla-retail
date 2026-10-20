## Empresas CAYLA y CLAURE en Nuevo producto (ADR-0463, 2026-10-20)

- [ ] **Pegar `20261020225000_empresas_cayla_y_claure.sql` en producción** (una sola ejecución; no está en producción). Con OK de Felipe, y antes que la migración de la otra sesión. Después: refrescar el diccionario (`pnpm datos:generar:produccion`) y mirar que «Tienda LIM» quedó con las dos empresas en `empresa_sedes`.
- [ ] **Probar un alta de punta a punta** desde Lima con una cuenta real y desde Trujillo (la base local no tiene la migración aplicada y el worktree no tiene sesión): la pantalla se vio solo con datos inventados.
- [ ] **La palabra en pantalla:** hoy dice «Tienda» (como lo pidió Felipe); en la base es «empresa». Decidir si queda así.
- [ ] **«Es nueva» al recibir y al contar, y el censo:** hoy caen a CAYLA sin preguntar. En Lima, una cartera de CLAURE debería preguntar.
- [ ] **Editar producto con la empresa corregible** (una prenda creada con la empresa equivocada). Toca `catalogo_actualizar_producto` (reemplazo anclado, ADR-0384): sumarla a las listas `DESHACER_*`.
- [ ] **Stock de CLAURE solo en Lima:** `empresa_sedes` ya tiene el dato; falta usarlo en Existencias, Traslados y la carga inicial.
- [ ] **Una sede nueva** se suma a mano a `empresa_sedes`; si no, se trata como solo-CAYLA.
- [ ] `/formidable` y `/chaos` del campo (hoy no se corrió la prueba ciega ni el ataque a propósito, y la guía interactiva no se recorrió con `guias:recorrer`: hace falta sesión).
- [ ] **Etiqueta de liquidación y empresa:** hoy solo cambió el link («tienda.cayla.pe»); una pieza de liquidación no tiene empresa. Si habrá piezas de CLAURE, decidir de dónde sale su empresa.
- [ ] **Ayuda del costo en Nuevo producto con CLAURE elegida** («lo que CLAURE le cobra a CAYLA»), con la regla de sugerencias coherentes (ADR-0290).
- [ ] **Nombre de CLAURE:** hoy «CLAURE» sin tilde; si debe ser «Claurè», es una actualización de `empresas.nombre`.
- [ ] **Imprimir una etiqueta real** (Brother) de CLAURE y de CAYLA con el link nuevo: se vio en pantalla, no en papel.
- [ ] **Volver a pegar `20261020225000` DESPUÉS de `20261013155000`** (la lista de la hora declarada): producción el 2026-10-20 no la tenía, así que la sección 5 se saltó con un aviso. Al pegar esa migración su lista no incluye `crear_producto_con_empresa`; re-pegar esta (es repetible) la suma. Si no, una alta con empresa hecha sin internet firmaría con la hora de subida.
