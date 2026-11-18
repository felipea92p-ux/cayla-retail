## Recibir ▸ lo que dejó probar la recepción sin aviso (2026-11-03)

Decidido por Felipe el 2026-11-03, punto por punto. Nada está construido todavía. El informe con la evidencia vive en `.flujo-de-negocio/informes/` (fuera de git).

**Orden:** primero el costo, en su propio PR. Lo demás va junto después, con `/construir`. Lo que no se alcanzó a probar se corre cuando estén los arreglos.

### Primero
- [x] **Costo disparatado:** sin aviso salta el mismo aviso de costo fuera de lo normal que en un envío con aviso (`fn_recepcion_entrar`, filtro de `regalo` con `sobrante_causa` NULL, viene de `20261028182000`). La hoja de confirmación muestra el costo real («S/ 58 → S/ 9 999»). Revisar en producción, solo leyendo, si ya hay costos dañados. La migración se pega con el OK de Felipe.

### Después, juntos
- [x] **Proveedor (cambia con la salida anticipada, más abajo):** un envío sin proveedor no cierra ni pasa a los libros. Quien ve Compras corrige un proveedor equivocado después de cerrar, con rastro. La lista del cierre deja de ofrecer proveedores de gastos.
- [x] **Prendas repetidas:** buscar en todas las marcas de la categoría, preguntar con «Existe también» si el nombre es igual o casi igual, y pedir «¿Es esta?» con foto antes de agregar una parecida.
- [x] **Tienda web:** lo creado al recibir nunca sale solo en la web, sin importar quién lo crea. Cambia la regla del 2026-10-19 para este camino; va en un ADR.
- [x] **Datos para vender:** al recibir, solo el precio es obligatorio. Tejido y patrón pasan a opcionales y quedan como «falta completar».
- [x] **Envío vacío:** no se cierra con 0 contadas, tampoco en la base; la pantalla ofrece «Cancelar la recepción». Un envío reabierto que nunca metió nada al stock se puede cancelar.
- [x] **Reabrir:** cada modelo se ve con «ya en stock» y bloqueado, y solo se cuenta lo nuevo. Si sobraron o faltaron, un enlace lleva a Ajustar stock con esa prenda.
- [x] **Nombre:** «Aretes 1» contado no frena el cierre: queda pendiente y no se vende hasta tener nombre. Cambia la regla del 2026-11-03 (ADR-0604); va en un ADR.
- [x] **Terminal de marcaje:** no hay kiosco. El aviso sale al abrir la hoja: «Nadie marcó entrada hoy en <sede>. Marca tu entrada en la computadora de la Terminal de marcaje y toca Actualizar lista.» «Actualizar lista» dice «Revisado a las 3:34: todavía nadie». Vale para todas las pantallas que usan ese aviso.
- [x] **Textos:** en un envío sin aviso, «Costo (opcional): si no lo sabes, llega con la factura», «Usar el nombre que escribiste» y «Al cerrar quedan en el almacén; bájalas al piso para venderlas». A unos aretes no se les piden tallas.
- [x] **Costo en cero:** revisado, no hizo falta cambiar nada. `fn_estado_resultados` cuenta aparte lo vendido sin costo y avisa que el margen sale inflado; `fn_campanas_reporte` calcula su margen solo con lo que tiene costo.
- [x] **Detalles de pantalla:** las tallas y el botón de la hoja no se mueven al tocar; la descripción pasa a «Crear la prenda» y el nombre no cambia de mayúsculas; «Bajar al piso» dice que se puede usar el «+» sin etiqueta; «No llegó nada» se aleja de «+5» y confirma con un aviso; la página 2 de Existencias sube sola.

### Lo que dictó Felipe al probar (aprobado el 2026-11-03)
- [x] **Fila del modelo:** una línea con «…» para la descripción; «Por contar» a la altura del tacho; nada se monta. Completa, se lee al abrir el modelo.
- [x] **«Cerrar el conteo»:** así se llama «Pasar a cerrar», en sus dos lugares. La pantalla siguiente abre con «Revisa y cierra» y su botón «Cerrar el envío».
- [x] **Qué falta:** el botón apagado lo dice en un cuadro sutil, con mouse y al tocarlo; cada cosa lleva a su lugar.
- [x] **Tabla de Cerrar:** una fila por modelo con un solo costo, «cambiar por talla» para el caso raro, sin «Toda la línea», sin barras ni «Antes S/ —»; «qué pasó» solo si algo no cuadra. Felipe la ve antes de cerrarla.
- [x] **Crear la prenda:** mismas piezas y mismos pasos que Nuevo producto, sin lo que aquí sobra. Tejido y patrón siguen opcionales al recibir.
- [x] Quitar el aviso de marca (`claude/recibir-marca-opcional`, sin commit): la marca vacía es «no tiene». En un envío con guía se sigue sugiriendo la de la categoría: vacía, lo de la guía quedaría como faltante.

### Salida anticipada: un modelo a la venta sin cerrar el envío (aprobado el 2026-11-03)
Felipe: «debe quedar absolutamente perfecto». Toca stock y movimientos: va con `/construir` y `/chaos`.
- [x] **Cómo:** un botón en el modelo, «Llevar al stock ahora · 12», cuando lo repartido cuadra. Quien tiene Recibir lo usa; queda a su nombre.
- [x] **Una parte:** sale lo repartido; lo demás sigue por repartir y puede salir en otra tanda.
- [x] **Costo:** el de la orden o el que escriba quien ve el dinero; un costo fuera de lo normal pide confirmar. Sin aviso y sin ver el dinero, entra sin costo.
- [x] **Después de salir:** hoja con «Imprimir 12 etiquetas», «Bajar al piso» y «Seguir contando». Las etiquetas son solo de esa tanda.
- [x] **Corregir:** con un movimiento de salida, con quién y por qué, solo mientras siga en el almacén. Si ya bajó o se vendió, manda a Ajustar stock.
- [x] **Cancelar:** con algo en stock no se cancela; se cierra con lo que hay.
- [x] **Diferencias:** solo al cierre final, que pregunta solo lo que no cuadra, contando lo que ya salió.
- [x] **Factura:** una tanda no escribe ningún papel: la factura sigue su camino de siempre y se une al cierre final. Compras ve «12 de 70 ya en stock · se sigue contando».
- [x] **Olvidado:** se ve desde el inicio en «Te toca» y en Recibir; a los 3 días se resalta y le aparece al líder.
- [x] **Sin aviso y sin proveedor:** sale igual, con el lote a nombre de un proveedor «Por confirmar», excluido de las métricas de proveedores. Se cambia al real con rastro. Compras lo resuelve, o quien cuenta si ya lo sabe; el envío no cierra hasta tenerlo. Cambia lo que se descartó el 2026-10-14 (ADR-0393): va en un ADR.

### Por probar cuando estén los arreglos
- [ ] Precio de venta rechazado, dos personas contando a la vez, unir la factura después y 375 px.

### Base local
- [ ] Refrescar la aislada `cayla-retail-prod` con el volcado de hoy, copiarle los datos de prueba y hacer que el ERP local apunte a ella (59421 y 59422). La compartida (54421) se queda como está, con las migraciones de `main`.

### Para que decida Felipe
- [ ] **Mayúsculas del nombre:** «Polo a rayas» se guarda «Polo a Rayas» («a» ya es conector; ya no sale «Polo A Rayas»). Guardarlo tal como se escribe cambiaría el formato único de todo el catálogo (`fn_titulo_referencia`): no se tocó.
- [ ] **«Cambiar por talla» y «Crear la prenda» sin aprobar mirando:** Felipe pidió ver la tabla de Cerrar antes de darla por buena; se construyó y se revisa en el PR.

### En producción (2026-11-03, con el OK de Felipe; pegadas por MCP, por eso cambia la versión)
`20261104000000` → `20261104010518` · `20261104001000` → `20261104010616` · `20261104002000` → `20261104010619` · `20261104003000` → `20261104010622` · `20261104005000` → `20261104010755` · `20261104012000` → `20261104145014` (2026-11-04: «a» solo es conector si le sigue otra palabra, y corregir una tanda no cuenta como pérdida; comprobado en producción: «Blusa A», «Polo a Rayas»).
- [x] Foto de producción: la refrescó main el 2026-11-04 (10:12 UTC) y `despacho_salidas` ya está en el diccionario. `20261104012000` es posterior, pero solo cambia el cuerpo de dos funciones.
