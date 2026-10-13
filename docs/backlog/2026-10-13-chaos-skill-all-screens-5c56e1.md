## 🧨 /chaos en todo el ERP (2026-10-13) — rama `claude/chaos-skill-all-screens-5c56e1`, semilla `20261013`

Informes con la evidencia en `.chaos/informes/*-2026-10-13.md` (locales, fuera de git). Tablero: `docs/chaos/README.md`.

### Decisiones de Felipe (dinero, stock, RPC, comprobantes)
- [ ] **El token de un formulario no sigue a su contenido** (gravedad 1, transversal). Tras una respuesta perdida, el reintento con otro contenido devuelve lo viejo y la pantalla anuncia lo nuevo. Se vio en Vender (pieza de liquidación o canje del club) y está confirmado en la base en 6 funciones. Arreglo en la web: una pieza común de token atada a la huella de lo que se manda, como `existencias/FlujoTalla.tsx` y `PedirAOtraSedeModal.tsx`. Además, opcional en la base: rechazar un token repetido con otro contenido.
- [ ] **`NaN` pasa los CHECK `>= 0`** (gravedad 1 en la base, solo por API, transversal). Llega al costo oficial de una prenda (al recibir una compra o cerrar una orden, y no se corrige a mano), al cierre de caja, a egresos, gastos, saldos, metas y activos. Arreglo: un CHECK `<> 'NaN'` (o `isfinite`) en las columnas de dinero y costo, o una validación común.
- [ ] **Recibir y anular la misma factura de proveedor a la vez deja una factura anulada con mercadería ingresada** (gravedad 1, 3 de 3). `anular_compra` debe tomar el candado de la compra antes de mirar los movimientos. INV-14 ya lo detecta.
- [ ] **`aprobar_devolucion` guarda reembolsos negativos o con método inventado** (gravedad 1 en la base, la pantalla lo bloquea): −500 en efectivo suben el esperado de caja en 500.
- [ ] **«Prenda de más» en traslados** (ADR-0173): entra al destino sin salir del origen. Choca con INV-08. ¿Debe descontarse del origen o quedar como sobrante a investigar?
- [ ] **El efectivo puede quedar negativo** (egresos, reembolsos y retiros mayores que lo que hay). ¿La base debe impedirlo?
- [ ] **Factura con RUC de 10 dígitos** (y boleta con DNI de 7): la pantalla avisa pero deja emitir.
- [ ] Preguntas: ¿cerrar una orden con más buenas que las planeadas? ¿el precio de catálogo solo del líder? (además, dos preguntas de permisos en el chat).

### Arreglos de una pantalla (sin base), listos para hacerse con el OK
- [ ] Vender: recargar al cobrar pierde el aviso (guardar «cobro en curso» en `sessionStorage` y preguntar por su token al volver).
- [ ] Cambios y Devoluciones: un texto largo pegado en el buscador tumba la pantalla (tope en `clasificarBusqueda` y `maxLength`).
- [ ] Un id que no es uuid tumba Traslados `[id]`, Editar producto y Proveedor (`notFound()`).
- [ ] Una fecha imposible en el filtro tumba Movimientos, y una combinación de filtros, Por pagar (validar la fecha en el lector de parámetros).

### Seguridad
- [ ] Tres hallazgos de permisos o seguridad: ver el chat del 2026-10-13 (no se versionan).

### Lo que no se cubrió
- [ ] El navegador en los formularios de Inventario, Catálogo, Compras, Producción y Finanzas (DC-01 y RS-03 por pantalla). El defecto real de esa familia es el del token, y ya está anotado.
- [ ] El celular en Cambios y Devoluciones; SUNAT y Lucode reales; la página pública del club (necesita la llave de servicio); una cuenta «líder no admin» (en el seed los dos líderes son admin).
