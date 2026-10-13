## 🧨 /chaos en todo el ERP (2026-10-13) — rama `claude/chaos-skill-all-screens-5c56e1`, semilla `20261013`

Informes con la evidencia en `.chaos/informes/*-2026-10-13.md` (locales, fuera de git). Tablero: `docs/chaos/README.md`.

### Decisiones de Felipe (dinero, stock, RPC, comprobantes)
- [x] ~~**El token de un formulario no sigue a su contenido**~~ — Ventas y Caja cerrado (ADR-0396, `intentos_con_token` + `useIntento`). Falta el mismo patrón en Finanzas, Producción, Inventario y Compras (ver abajo). (gravedad 1, transversal). Tras una respuesta perdida, el reintento con otro contenido devuelve lo viejo y la pantalla anuncia lo nuevo. Se vio en Vender (pieza de liquidación o canje del club) y está confirmado en la base en 6 funciones. Arreglo en la web: una pieza común de token atada a la huella de lo que se manda, como `existencias/FlujoTalla.tsx` y `PedirAOtraSedeModal.tsx`. Además, opcional en la base: rechazar un token repetido con otro contenido.
- [x] ~~**`NaN` pasa los CHECK `>= 0`**~~ — Ventas y Caja cerrado (`*_montos_finitos`, `fn_monto_valido`, ADR-0396). Faltan Producción, Finanzas, Catálogo y Clientes. (gravedad 1 en la base, solo por API, transversal). Llega al costo oficial de una prenda (al recibir una compra o cerrar una orden, y no se corrige a mano), al cierre de caja, a egresos, gastos, saldos, metas y activos. Arreglo: un CHECK `<> 'NaN'` (o `isfinite`) en las columnas de dinero y costo, o una validación común.
- [ ] **Recibir y anular la misma factura de proveedor a la vez deja una factura anulada con mercadería ingresada** (gravedad 1, 3 de 3). `anular_compra` debe tomar el candado de la compra antes de mirar los movimientos. INV-14 ya lo detecta.
- [x] ~~**`aprobar_devolucion` guarda reembolsos negativos o con método inventado**~~ (cerrado, ADR-0396) (gravedad 1 en la base, la pantalla lo bloquea): −500 en efectivo suben el esperado de caja en 500.
- [ ] **«Prenda de más» en traslados** (ADR-0173): entra al destino sin salir del origen. Choca con INV-08. ¿Debe descontarse del origen o quedar como sobrante a investigar?
- [x] ~~**El efectivo puede quedar negativo**~~ — Felipe: la base lo impide (cerrado, ADR-0396). (egresos, reembolsos y retiros mayores que lo que hay). ¿La base debe impedirlo?
- [x] ~~**Factura con RUC de 10 dígitos** (y boleta con DNI de 7)~~ — Felipe: bloquear en la pantalla y en la base (cerrado, ADR-0396).
- [ ] Preguntas: ¿cerrar una orden con más buenas que las planeadas? ¿el precio de catálogo solo del líder? (además, dos preguntas de permisos en el chat).

### Arreglos de una pantalla (sin base), listos para hacerse con el OK
- [x] ~~Vender: recargar al cobrar pierde el aviso~~ (cerrado: el cobro en curso se resuelve al volver, ADR-0396) (guardar «cobro en curso» en `sessionStorage` y preguntar por su token al volver).
- [x] ~~Cambios y Devoluciones: un texto largo pegado en el buscador tumba la pantalla~~ (cerrado, también «B001-12345678901» en Historial) (tope en `clasificarBusqueda` y `maxLength`).
- [ ] Un id que no es uuid tumba Traslados `[id]`, Editar producto y Proveedor (`notFound()`).
- [ ] Una fecha imposible en el filtro tumba Movimientos, y una combinación de filtros, Por pagar (validar la fecha en el lector de parámetros).

### Seguridad
- [ ] Tres hallazgos de permisos o seguridad: ver el chat del 2026-10-13 (no se versionan).

### Lo que no se cubrió
- [ ] El navegador en los formularios de Inventario, Catálogo, Compras, Producción y Finanzas (DC-01 y RS-03 por pantalla). El defecto real de esa familia es el del token, y ya está anotado.
- [ ] El celular en Cambios y Devoluciones; SUNAT y Lucode reales; la página pública del club (necesita la llave de servicio); una cuenta «líder no admin» (en el seed los dos líderes son admin).

### Después de los arreglos de Ventas (ADR-0396)
- [ ] **Pegar en producción M2–M9** (`20261013200000`…`20261013211000`), una parte por llamada, **con todas las cajas cerradas** (M1 ya está).
- [ ] Purga de `intentos_con_token` a los 90 días (crece una fila por escritura con token).
- [ ] El mismo patrón de token (`useIntento` + la llamada a `fn_intento_con_huella`) en Finanzas (`GastosPanel`), Traslados (`PasePedido`, `iniciar_traslado`), Inventario (`ajustar_inventario`), Compras (`registrar_compra`) y Producción (`abrir_produccion`).
- [ ] Propuesta de regla para CLAUDE.md («el token sigue al contenido»): espera el OK de Felipe (va en el PR).
