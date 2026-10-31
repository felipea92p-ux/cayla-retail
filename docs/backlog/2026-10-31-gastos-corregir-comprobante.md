## Gastos: corregir, «Llegó el comprobante», «No tendrá comprobante», QR y foto (ADR-0588, 2026-10-31)

**En producción desde el 2026-10-31** (OK de Felipe): las tres migraciones, como `20261031163305`, `20261031163834` y `20261031163913` (ADR-0588).
Falta refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) para que `gasto_correcciones` y `gastos_no_emiten` entren al diccionario, y
publicar la web (el PR).

- [ ] Decisión de Felipe: ¿quien solo tiene el módulo Gastos ve y sube la foto del comprobante? Hoy solo quien ve el dinero de Compras (verla) y quien
      adjunta facturas (subirla). Ampliarlo es un permiso nuevo (`registrar_adjunto_compra` y la política de lectura del bucket).
- [ ] Sumar la foto al registrar el gasto (hoy se suma desde su hoja, después).
- [ ] Guardar el RUC de CLAURE para que el aviso del QR lo reconozca en Lima (hoy compara solo contra el de CAYLA y lo dice).
- [ ] `/chaos` y `/formidable` de «Corregir gasto», «Llegó el comprobante» y «No tendrá comprobante».
- [ ] Del punto 4 en adelante de la comparación: el detalle en el cajón lateral con ↑ ↓, aviso de duplicado al registrar, la categoría sugerida por
      proveedor, el presupuesto en cada hilo, «Por revisar» y descargar lo filtrado.
