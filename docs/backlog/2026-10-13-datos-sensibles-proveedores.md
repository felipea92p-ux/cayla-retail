## Datos bancarios de proveedores y códigos de descuento (2026-10-13, auditoría de 20 puntos, punto 18)
- [x] **Migraciones `20261013161000` y `20261013162000`**, la ficha con «Cambios de la cuenta», el aviso en el Inicio del líder y en el Observatorio. Prueba `pnpm pruebas:datos-sensibles-proveedores` en la lista del CI.
- [ ] **POR PEGAR en producción, con el OK de Felipe, ANTES de publicar la web:** primero `20261013161000` (sola; aborta si `fn_proveedores` o `compras_resumen` cambiaron desde el 13-oct), después `20261013162000` (solo la política). Cada una termina con «QUEDÓ BIEN».
- [ ] **Al agregar una columna a `proveedores`:** darle `grant select (<columna>) on retail.proveedores to authenticated` en la misma migración; ya no hay `select` de tabla entera.
- [ ] **Ver el aviso con una cuenta líder que no sea Admin** (Inicio común, no el Observatorio): está cubierto por `inicio-avisos.test.ts`, pero no se miró en el navegador.
- [ ] **Diccionario:** refrescar el volcado cuando estén en producción.
