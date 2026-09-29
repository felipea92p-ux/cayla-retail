## 2026-09-29 (Inicio ya no cuenta una venta anulada ni muestra una venta de prueba en «Equipo de hoy»)

Qué hice: «Equipo de hoy» en Inicio seguía diciendo «Melany E. · 1 venta · S/ 60 · vendió 1 prenda por S/ 59.90 · B004-000033»
aunque esa venta ya estaba anulada y marcada de prueba. Salía de la bitácora de Actividad, que es inmutable y guarda dos líneas
por una venta anulada («vendió…» y «anuló…»); `armarEquipo` (`apps/web/lib/inicio-avisos.ts`) sumaba todas las «vendió» y no
miraba las «anuló». Ahora empareja cada venta con su anulación por `tabla = 'ventas'` + `registro_id`: una venta anulada no cuenta
como venta ni como última acción de quien la registró, y si era de prueba (`detalle.es_prueba`, que solo trae la línea de la
anulación) ninguna de sus líneas sale en ese bloque. Quien solo firmó una venta de prueba tampoco aparece como «sin marcar
asistencia». Cuatro pruebas nuevas en `inicio-avisos.test.ts` (22/22).

Por qué así: la bitácora no se edita (ADR-0224: lo que ya decía se queda), así que el arreglo va en la lectura, no en los datos ni
en una migración; y solo toca Inicio: la pantalla Actividad sigue mostrando ambas líneas, que es su trabajo como auditoría. Es un
error real, no solo de esta prueba: cualquier venta anulada de verdad inflaba las cifras de la vendedora en Inicio (pasó también con
la B005-000001 anulada ayer).

Felipe se lleva: solo web, sin migración. Además, en producción la boleta B004-33 (sandbox) se borró con el script de ensayo y corrida
real que Felipe pegó en el SQL Editor: respaldada en `respaldo_purgas.filas` («purga boleta B004-33 sandbox 2026-09-29», 1 fila),
serie B004 sigue en 34, comprobantes 4 → 3; corrige lo que dice la nota anterior de hoy (la boleta ya no queda). El stock de Camisa
Lara en Tienda TRU se verificó en la fuente de existencias (`fn_existencias_base`): físico 1, piso 1, almacén 0. Falta ver Inicio en
el navegador con una cuenta de líder tras el despliegue.
