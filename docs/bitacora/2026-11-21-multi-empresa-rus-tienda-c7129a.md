## 2026-11-21 (Empresas aliadas, actividad 1: crearlas, editarlas y darlas de baja desde Configuración, ADR-0683)
Qué hice: bajo la banda de CAYLA en Configuración ▸ Empresa y tiendas, la sección «Empresas aliadas» (opción D de Felipe) con su hoja: nombre, RUC consultado al padrón, régimen, tiendas y, opcionales, correo, teléfono y cuentas para cobrar (Yape, Plin o banco). Todo se guarda de una vez con `guardar_empresa_aliada` (solo el Admin). La baja pide escribir su nombre, se aplica a los 7 días con el trabajo diario `/api/empresas/bajas` y se deshace desde su tarjeta. Migración `20261121152000`, solo en local.
Por qué así: hasta hoy una aliada solo nacía con una migración. Una sola función que guarda todo evita una aliada a medias en una tienda sin dónde cobrarle. La baja borra de verdad solo lo que nunca tuvo historia; con historia, la desactiva y su pasado se queda, porque borrarlo cambiaría meses ya cerrados.
Felipe se lleva: puede registrar una aliada él mismo, pero todavía no debe vender: el Diario, su cuenta, el cobro y las cifras siguen escritos solo para CLAURE hasta las actividades 2 a 7. La migración no va a producción sola. Pruebas: 35 de base y 16 de reglas; visto en el navegador en claro, oscuro y 375 px.

## 2026-11-21 (Empresas aliadas, actividad 2: el Diario y el Balance con cualquier aliada, ADR-0683)
Qué hice: el Diario reclasifica las ventas, anulaciones, devoluciones, cambios y pérdidas de cualquier aliada con cuenta, no solo de CLAURE, y sin mirar si sigue activa. La lógica de CLAURE se copió tal cual en funciones por aliada; las de CLAURE quedan como envoltura. Migración `20261121160000`, solo en local.
Por qué así: el Balance ya sacaba el stock de cualquier dueña, pero el Diario solo corregía lo de CLAURE: una segunda aliada habría descuadrado la 201 con su primera venta. Copiar la lógica en vez de cambiar `fn_claure_ventas` deja intactas la línea de CLAURE de Impuestos y la cuenta con Claudia.
Felipe se lleva: una prueba con una segunda aliada en Trujillo demuestra que el Balance y el Diario se mueven igual y que darla de baja no cambia su pasado. Todo se probó en una copia de la base local puesta al día con `main`; la base compartida no se tocó.

## 2026-11-21 (Empresas aliadas, actividad 3: la cuenta con cada dueña, ADR-0683)
Qué hice: los pagos a una aliada y el efectivo que se queda su dueña al cerrar la caja ahora dicen a quién son; lo que se le debe se calcula por aliada, con la lógica de CLAURE copiada. Cuentas y dinero tiene una pestaña por aliada con «Pagar a <nombre>», y el cierre de caja un bloque por cada una. Migración `20261121162000`, solo en local.
Por qué así: con dos aliadas, un pago a una habría bajado la deuda de la otra. La aliada viaja en un encabezado y la pone un disparador «siempre», sin cambiar `cerrar_caja` ni `registrar_movimiento_dinero`; las funciones de CLAURE no se tocaron para que la pantalla de hoy y sus pruebas sigan igual.
Felipe se lleva: con Claurè sola, todo se ve igual que hoy. «Pagar a CLAURE» ya no está en el «Registrar movimiento» general: se paga desde su pestaña o desde el cierre. Probado en la base con dos aliadas; la pestaña de una segunda aliada no se vio en el navegador porque la base local compartida está atrasada.

## 2026-11-21 (Empresas aliadas, actividad 4: el cobro al número de cada dueña, ADR-0683)
Qué hice: en Vender, si el ticket lleva prendas de una aliada y se paga con Yape, Plin o transferencia, la hoja pregunta «¿A qué número pagó?» con la dueña ya marcada, y la cajera puede cambiarla. Lo elegido se guarda con el pago en la cuenta de esa dueña. Sirve para cualquier aliada, no solo CLAURE. Migración `20261121164000`, solo en local.
Por qué así: antes todo Yape caía en la cuenta de CAYLA y alguien lo movía después; con varias aliadas eso no escala. La elección viaja aparte de la venta, así que `registrar_venta` no cambió y, si la cuenta no sirve, la venta se guarda igual en CAYLA.
Felipe se lleva: con un ticket todo de CAYLA no aparece ninguna pregunta nueva. Lo de CLAURE ya no hay que corregirlo a mano después, salvo un ticket de dos empresas pagado todo por Yape a dos números o una venta sin conexión.

## 2026-11-21 (Empresas aliadas, actividad 5: campañas y gastos por aliada, ADR-0683)
Qué hice: cada aliada tiene en su tarjeta «Entra a las campañas de CAYLA», apagado al crearla; CLAURE sigue encendida. Las ofertas ya no nombran a CLAURE: alcanzan a lo de CAYLA y, si incluyen a las aliadas, a las que tienen el interruptor encendido. En Configuración ▸ Gastos hay un «Reparto con …» por cada aliada, y el Diario y «lo que falta del mes» restan la parte de todas. Migración `20261121171000`, solo en local.
Por qué así: una aliada nueva habría entrado sola a las campañas de CAYLA, con su precio rebajado sin su permiso, y no podía cargar su parte de la luz o del alquiler. La regla vive en una sola función que llaman las ocho de ofertas.
Felipe se lleva: con Claurè sola, todo igual que hoy. Una aliada nueva no entra a ninguna campaña hasta que un Admin enciende su interruptor. Lo probé en una base con todas las migraciones, como la del CI: pasan las pruebas de ofertas, campañas, Caja y Finanzas.

## 2026-11-21 (Empresas aliadas, actividad 6: las cifras de CAYLA sin ninguna aliada, ADR-0683)
Qué hice: lo que vende cualquier aliada sale de las cifras de CAYLA (Inicio, Club, Observatorio, calidad, «lo que falta del mes», Impuestos y el Estado de resultados), y una aliada dada de baja no le devuelve su pasado a CAYLA. «De eso, S/ X es de …» en Dónde está suma lo que se le debe a todas. Migración `20261121173000`, solo en local.
Por qué así: la regla preguntaba por CLAURE activa; con una aliada nueva las ventas de CAYLA se habrían inflado y, al dar de baja a una, los meses cerrados habrían cambiado solos. Se cambió el mismo trozo en seis funciones, comprobado contra producción, sin renombrar nada.
Felipe se lleva: con Claurè sola, cada número sale igual. Con varias aliadas, los textos dicen «las empresas aliadas» y algunos quedan en singular (anotado).

## 2026-11-21 (Empresas aliadas, actividad 7: el filtro «Empresa» en Existencias e Historial, ADR-0683)
Qué hice: en las tiendas donde venden dos empresas o más, Existencias tiene la píldora «Empresa», y al elegir una se ven solo sus unidades, con sus cantidades de piso y almacén. Historial tiene la misma píldora y deja solo las ventas con prendas de esa empresa. Además: las empresas de una tienda ya no dependen del id de CAYLA escrito a mano, y los textos de Reportes, Apartados y el valor del inventario nombran a la aliada que corresponde. Migración `20261121175000`, solo en local.
Por qué así: Felipe pidió que, al crear una tienda o una aliada, los filtros salgan solos. Productos y Reportes ya lo hacían; faltaban las dos pantallas que se usan a diario. Las cantidades salen de la regla de siempre, así ningún número contradice a otro.
Felipe se lleva: en Lima ya puede ver «lo de CLAURE» en Existencias y en Historial. Comprobantes y Pedidos web quedan para después. Una venta con prendas de las dos empresas sale entera en Historial con el filtro puesto.

## 2026-11-22 (Empresas aliadas: la conexión de cada aliada con Lucode, ADR-0683)
Qué hice: cada tarjeta de aliada tiene «Comprobantes» (solo el Admin). Ahí se guarda su domicilio fiscal y la llave que le dio Lucode. La llave va cifrada al Vault de Supabase y nunca vuelve a la pantalla: la tarjeta dice «Lucode conectado · …ABCD». Al guardarla se prueba sola contra Lucode, sin emitir nada. Migración `20261122213000`, pegada en producción el mismo día; ruta `POST /api/lucode/probar-aliada`.
Por qué así: Felipe eligió el Vault («la recomendada»). Una llave en una columna la puede leer cualquiera con acceso a la tabla y con ella se emiten comprobantes a nombre de otra empresa; en Vercel, cada aliada nueva pediría un deploy. Solo el servidor (service_role) la lee.
Felipe se lleva: ya puede dejar conectada a CLAURE el día que tenga su llave. No cambia cómo se emite: hasta la fase 2 todo sigue saliendo como CAYLA. Probado en local con un Lucode falso: llave mal copiada, guardada, probada, nunca en la página, y a 375 px.

## 2026-11-22 (/chaos en la base, aplicado)
La migración `20261121203000` (nombre invisible y altas a la vez) ya está en producción: la huella de `guardar_empresa_aliada` coincide con la del repo.

## 2026-11-22 (/formidable de Empresas aliadas: los 3 cambios y el Yape de CLAURE)
Qué hice: la tarjeta de una aliada dice qué le falta («Falta RUC, régimen y tiendas») y no repite la razón social si es su nombre; una cuenta nueva vacía ya no impide guardar; el RUC explica en su «?» (también la clave SOL), el padrón caído habla de la empresa, «Entra a las campañas» tiene su «?» y «Buscar» quedó alineado con la caja (también en Proveedores). La cuenta de CLAURE que no tiene número ya no se pide ni se renombra ni se archiva (camino «b»).
Por qué así: Felipe aprobó los 3 cambios y la «b». Para cargarle el RUC a CLAURE, la hoja pedía el Yape de Claudia, y quitarla habría archivado la cuenta de sus cobros.
Felipe se lleva: ya puede editar CLAURE en producción y cargarle RUC y régimen sin tocar su Yape. Probado en local con la misma cuenta que producción: guardó, y la cuenta siguió igual.

## 2026-11-23 (diccionario de datos y cierre de la rama)
Qué hice: el diccionario quedó con la foto de producción del 2026-11-23: 102 grupos nuevos o cambiados, entre ellos las columnas de Empresas aliadas y `gasto_reparto_aliadas`; las 2319 huellas coinciden. Ocho tablas nuevas, varias de otras ramas ya publicadas, recibieron su pájaro en el aviario. Sumé la fila de la hoja de la aliada al tablero de /chaos.
Por qué así: la consulta del repo pesa 100 KB de ida y otro tanto de vuelta. La partí en tres lecturas: huellas por cubos, la lista de lo que cambió y su contenido. Después la aplicó `pnpm datos:refrescar`, que vuelve a verificar todas las huellas contra producción.
Felipe se lleva: la rama queda lista para revisar. Sin correr: `tema:auditar` y `guias:recorrer` (en el backlog).
