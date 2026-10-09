## 2026-10-09 (La caja puede anular una venta del día)
Qué hice: `anular_venta` deja de exigir líder y pide el módulo Devoluciones (`fn_ve_modulo('devoluciones')`), y el botón «Anular venta» de Devoluciones sale para toda cuenta que ve el módulo (migración `20261009120000`, parche anclado; aplicada en local, **no en producción**).
Por qué así: «Anular» es un botón dentro de Devoluciones, y quien ve un módulo hace lo que hay en él (ADR-0161/0306). Siguen todos los candados que la hacen segura: motivo, responsable, caja abierta, mismo día de Lima, sin comprobante enviado a SUNAT y sin cambio ni devolución previa.
Felipe se lleva: lo ven las tres cajas («Terminal de ventas») y también el rol «Integrante» (11 cuentas); si solo debe ser la caja, se le quita Devoluciones a Integrante en Roles y accesos.

## 2026-10-09 (La tienda revisa sus aperturas y devuelve a la venta lo que se arregló)
Qué hice: `revisar_apertura_caja` pasa a `fn_puede_gestionar_caja()` (líder o módulo Caja) con un candado nuevo de sede, y `arreglar_prenda_danada` a `fn_ve_modulo('existencias')` (migración `20261009121000`, aplicada en local, **no en producción**). En pantalla, Caja ▸ Historial muestra las aperturas por revisar a quien está ahí, y el panel de dañadas le ofrece «Se arregló» a quien no es líder (liquidar, botar y donar siguen del líder).
Por qué así: las dos son botones dentro de un módulo (ADR-0306). Revisar una apertura no mueve plata y queda firmado quién la revisó; arreglar una prenda es un traslado interno que ya exige la sede.
Felipe se lleva: pruebas `pruebas:caja-cierre-traslado` y `pruebas:danadas-reportar-arreglar` actualizadas y en verde; quien abrió la caja puede revisar su propia diferencia (antes la miraba un líder).
