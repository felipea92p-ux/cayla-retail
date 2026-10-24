## 2026-10-23 (Por qué las chicas cargan stock en Catálogo y no en Existencias, y tres formas de traerlo)
Qué hice: comparé los dos caminos en el código y armé `docs/maquetas/existencias-ajustar-stock-2026-10/`: tres formas (en el modal de la prenda, en una hoja propia o en la misma tarjeta) de llevar a Existencias la tabla color × talla que hoy solo tiene Editar producto, con el botón de la cabecera, «Etiquetas de lo que entró» y la ficha de Catálogo de solo lectura. Tocable, en claro, oscuro y a 375 px. Sin código del ERP ni migración.
Por qué así: Catálogo gana por la tabla de todo el modelo con un solo guardado, por escribir el número contado y porque una prenda que la tienda nunca tuvo no aparece en Existencias. Felipe ya decidió que Nuevo producto conserva sus unidades del día, que la ficha queda con los números y «Ajustar en Existencias», y quiso ver la maqueta antes de construir.
Felipe se lleva: elegir A, B o C en la maqueta. Después vienen tres actividades, y Catálogo pasa a solo lectura al final, para que nadie se quede sin camino en el medio.

## 2026-10-23 (Ronda 2: ajustar stock dentro del modal de la prenda, con movimiento rico)
Qué hice: `ronda-2.html` sobre el modal real de Existencias: tres formas de darle peso a «Ajustar stock» y dos diseños de la vista de ajuste (planilla y riel de etiquetas), con toda la coreografía de entrar, contar, guardar y volver, una sola vez y sin rebote. Revisada a 1024 y 375 px, en claro y oscuro.
Por qué así: Felipe eligió quedarse con el modal actual y pidió que «Ajustar stock» pese más y que su vista sea sofisticada y con animaciones; el modal se ensancha al ajustar para que entren hasta 6 tallas sin deslizar.
Felipe se lleva: elegir el peso (1, 2 o 3) y la vista (planilla o riel); con eso arranca la actividad 1.

## 2026-10-23 (Ronda 3: la talla en foco, el ancho justo y una planilla más fina)
Qué hice: `ronda-3.html` con solo lo elegido (banda + planilla): al entrar, la talla de la que vienes queda encendida y el resto se oscurece; el modal crece solo si la tabla no cabe y lo justo; la tabla se rediseñó con más aire. Revisada a 1440, 1024 y 375 px, en claro y oscuro, con tres prendas (1, 4 y 6 tallas).
Por qué así: Felipe pidió que el modal no se ensanche de más, que la vista se enfoque en el número que eligió y una tabla más estética.
Felipe se lleva: aprobar la ronda 3 (y que entre en el lugar donde esa talla tiene más unidades); con eso se construye la actividad 1.

## 2026-10-23 (Actividad 1: la planilla del modelo en Existencias, ADR-0494)
Qué hice: el modal de la prenda de Existencias ajusta todo el modelo en una planilla color × talla. Entra con la talla elegida en foco y en el lugar con más unidades, y guarda en una sola llamada a `ajustar_inventario`. Si entró algo, ofrece «Etiquetas de lo que entró», y «Ajustar stock» de la cabecera busca la prenda y abre su planilla. Retiré el recorrido de 4 pasos por talla. Cuatro commits, sin migración; la guía de Existencias pasa sus 36 pasos.
Por qué así: Felipe aprobó la ronda 3. Catálogo ganaba por la tabla de todo el modelo, el número contado y un solo guardado, y ahora Existencias tiene las tres cosas.
Felipe se lleva: el `/chaos` (semilla 494) encontró que contar con la tienda abierta guarda la diferencia contra lo que la planilla leyó al abrirse: con 6 leídas, 1 vendida y 5 contadas, quedan 4. Es de stock y de la RPC: decide él. El ataque quedó a medias porque otra sesión escribía en la base local, y una restauración mía le borró 1239 filas de prueba de `trafico_web`.

## 2026-10-23 (Contar con la tienda abierta: la base compara lo que había, ADR-0494 act. b)
Qué hice: con «Conté y hay otro número», cada línea de la planilla viaja con lo que había al contar. `ajustar_inventario`, con la prenda ya bloqueada, rechaza todo si cambió y dice qué cambió; la planilla conserva lo contado y marca la talla. Migración `20261024001000` (reemplazos anclados) y `pnpm pruebas:ajuste-lo-que-habia` (18 casos). En el navegador, el mismo ataque quedó en 6, lo contado. La migración no está en producción.
Por qué así: Felipe eligió mi recomendación. Comparar en la base, con el candado de las ventas, no deja ninguna ventana y no cuesta otra lectura; releer en la pantalla dejaba una ventana.
Felipe se lleva: dar el OK para pegar `20261024001000` en producción. La web funciona con o sin ella: sin la migración, la base ignora lo que había y se porta como antes.

## 2026-10-24 (La comparación al contar, en producción)
Qué hice: pegué `20261024001000` en producción con `apply_migration`, que la registró como `20261024224929`, y marqué «SQL pegado en producción» en el PR #1316. Antes de pegar revisé que cada ancla apareciera una vez en la función viva. Después, la consulta del PR dio `t | 2`, y los dos bloques insertados tienen la misma huella que en local.
Por qué así: Felipe dio el OK. La regla es pegar antes de fusionar, y esta migración no rompe la web de hoy.
Felipe se lleva: el PR listo para fusionar cuando su CI quede en verde. La función de producción ya difería del repo antes de pegar (md5 `44d927…` contra `01ef62…` en local): no la toqué, pero vale una revisión de deriva aparte.

