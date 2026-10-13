## Datos bancarios de proveedores (2026-10-13, auditoría de 20 puntos, punto 18)
- [x] **Migración `20261013161000`**, la ficha con «Cambios de la cuenta», el aviso en el Inicio del líder y en el Observatorio, y los candados `pnpm pruebas:datos-sensibles-proveedores` (en el CI) y `lib/proveedores-columnas-bancarias.test.ts`.
- [ ] **Orden en producción, con el OK de Felipe: PRIMERO publicar la web, DESPUÉS pegar `20261013161000` (sola).** Al revés, la web vieja se cae en la ficha del proveedor hasta publicar. Aborta sola si `fn_proveedores` o `compras_resumen` cambiaron desde el 13-oct (anclas por texto). Termina con «QUEDÓ BIEN».
- [ ] **Al agregar una columna a `proveedores`:** darle `grant select (<columna>) on retail.proveedores to authenticated` en la misma migración.
- [ ] **Decide Felipe:** la tabla `codigos_descuento` ya no se usa (desde 20261002100000). Archivarla o dejarla; no hace daño (0 códigos en producción).
- [ ] **Ver el aviso con una cuenta líder que no sea Admin** (Inicio común): cubierto por `inicio-avisos.test.ts`, no mirado en el navegador.
- [ ] **Diccionario:** refrescar el volcado cuando esté en producción.
