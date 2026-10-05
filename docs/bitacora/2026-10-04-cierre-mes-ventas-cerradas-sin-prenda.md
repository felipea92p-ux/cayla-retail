## 2026-10-04 (Cierre de mes: las ventas cerradas sin prenda salen como un aviso que no bloquea — ADR-0335)
Qué hice: ADR-0334 dejó una deuda escrita: cuando un líder cierra la cola de ventas sin registrar, esas ventas quedan con su ingreso y SIN costo (la línea
sigue en «Cargo especial» con costo 0), y el cierre de mes de Finanzas no las nombraba. Producción (solo lectura) mostró el riesgo concreto: septiembre
tiene 31 ventas sin registrar (S/ 1,541.40) que HOY bloquean su cierre; si el líder cierra la cola antes, el bloqueo desaparece y septiembre se congela
con el margen inflado sin que nadie lo sepa. Felipe eligió, con una pregunta, un aviso que no bloquea: «N ventas (S/ X) se cerraron sin prenda: su costo
es desconocido». Aparece en Finanzas ▸ Cierre de mes junto a «prendas con su costo», con «Ver ventas» hacia Existencias ▸ Ventas sin registrar, y al
cerrar queda guardado en el cierre. Migración `20261005130000` (un parche anclado, sin tocar tablas), pantalla y 20 casos nuevos en la prueba del cierre.
Por qué así: bloquear dejaba un mes con cola cerrada imposible de cerrar (la prenda no se puede identificar), y estimar un costo por categoría inventa un
número que queda congelado con huella. Es un chequeo aparte de «sin costo» porque ese tiene cura (cargar el costo) y este no. Se parchó la función viva en vez
de recrearla porque otra migración (ADR-0253) le cambió la puerta del cierre y recrearla desde el archivo la habría borrado; en producción la función es
idéntica byte por byte a la de la base de pruebas.
Felipe se lleva: ADR-0335; la migración NO está en producción (el orden y la huella que debe dar la función, en
`docs/backlog/2026-10-04-cierre-mes-ventas-cerradas-sin-prenda.md`); y una tarea que no pidió: el Estado de resultados tiene la misma exclusión y no avisa
de estas ventas, así que el margen que lee el contador sale inflado a diario, no solo al cerrar. Verificado: 124 casos SQL, 8 de 8 mutaciones detectadas,
vitest, y el navegador a 375 px y escritorio.
