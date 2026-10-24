# ADR-0494 — El stock se carga en Existencias: la planilla del modelo dentro del modal de la prenda

- **Fecha:** 2026-10-23 · **Estado:** aceptado. Felipe eligió la ronda 3 de la maqueta mirándola
  (`docs/maquetas/existencias-ajustar-stock-2026-10/ronda-3.html`), «incluido que entre en el lugar donde esa talla tiene más unidades», y
  dijo «Arranca la actividad 1». Código en la rama `claude/stock-entry-improvements-b36df8`. La planilla nació sin migración; contar con la
  tienda abierta sumó una, `20261024001000_ajuste_compara_lo_que_habia_al_contar.sql` (ver la actualización al final). **No está en
  producción**: se pega con el OK de Felipe, y la web funciona con o sin ella.
- **Relacionados:** ADR-0391 (el modal de la prenda de Existencias), ADR-0240 (`ajustar_inventario`: todo el ajuste en una llamada, con su
  marca), ADR-0328 (la carga inicial), ADR-0306 (un botón es una función del módulo donde vive), ADR-0136 act. 2026-10-23 (c) (el movimiento
  de esta vista), ADR-0358 (una función, una pieza), ADR-0389 (guías interactivas), ADR-0149 (el loader único).

## El problema

Las colaboradoras cargan y corrigen el stock desde Catálogo ▸ Editar producto, no desde Existencias. Las dos cosas funcionan, pero Catálogo
gana por tres razones que se vieron en el código:

1. Muestra **todo el modelo** (colores × tallas) en una tabla y lo guarda **de una vez**. Existencias tenía un recorrido de 4 pasos **por talla**:
   cinco tallas eran cinco recorridos.
2. En Catálogo se escribe **el número que contaste**. En Existencias se elegía cuánto sumar o restar.
3. Una prenda que la tienda **nunca tuvo** aparece en Catálogo y no en Existencias (`getExistencias` lista lo que tiene fila de `stock` o viene
   en camino).

Hoy se hacen sobre todo **correcciones al contar**: todavía se está cuadrando el inventario y «Recibir mercadería» espera a Compras.

## Lo que se decidió

1. **Existencias es la puerta del stock**, en tres actividades y en este orden, para que nadie se quede sin camino en el medio. (1) La planilla del
   modelo en Existencias: este ADR. (2) Existencias encuentra las prendas que la tienda nunca tuvo. (3) Al final, Editar producto queda de solo
   lectura en stock, con los números y «Ajustar en Existencias». Nuevo producto conserva sus unidades del día al crearlo.
2. **La planilla vive dentro del modal de la prenda**, no en una hoja aparte, porque Felipe quiso conservar el modal. Se entra por **la banda «¿No
   es lo que ves en la tienda?»** bajo «Dónde está», o por la tecla 6. Desde afuera, **«Ajustar stock» de la cabecera** pregunta «¿Qué prenda vas
   a ajustar?». Busca mientras se escribe con el mismo índice que la lista (nombre, código, etiqueta escaneada) y abre la planilla. Solo lo ve
   quien puede ajustar y mirando su propia sede.
3. **Todo el modelo, un lugar a la vez.** Filas por color y columnas por talla, en el piso o en el almacén («Dónde contaste»), porque
   `ajustar_inventario` recibe una sola sububicación por llamada. Un guardado es una llamada con una marca por intento (la huella del lote). Las
   prendas nuevas en la sede van como carga inicial (`p_cargas`) en la misma llamada.
4. **La talla de la que vienes queda en foco:** llega encendida, con su anillo, y el resto queda en sombra. Tocar o tabular a otra celda levanta
   el foco, y también el primer Escape. El segundo Escape vuelve a la talla.
5. **Se entra en el lugar donde esa talla tiene más unidades** (si empatan, el almacén). Donde no se separa piso y almacén (el Taller), no hay
   elección.
6. **Los motivos, en lenguaje de tienda**, empezando por «Conté y hay otro número» (`conteo_fisico`): se escribe lo contado y el sistema manda la
   diferencia. Los demás:
   - «Encontré unidades» (`reposicion`): solo suma, y no en el piso de una tienda que separa piso y almacén.
   - «No aparece» (`merma`): solo resta.
   - «Error al cobrar» y «Uso interno» (`otro`, con su nota fija).
   - «Otro» (`otro`): pide la nota, y una nota de espacios o de caracteres invisibles no cuenta.

   «Se dañó» no se resta: se reporta con «Reportar dañada» en la talla.
7. **El ancho justo:** el modal crece solo si la planilla no cabe, en cinco escalones de 62 a 90 rem (`anchoDelModalAlAjustar`). Con dos tallas
   no cambia.
8. **«Etiquetas de lo que entró»:** si el guardado sumó prendas, sale la misma tira de Editar producto (`TiraDeLoQueEntro`). La página de
   etiquetas, con `?ajuste=1`, dice «Existencias · Lo que entró». Si solo salieron prendas, se vuelve a la talla con el aviso.
9. **El guardado no abre el loader** (`x-espera: no`): el botón lleva su hilo y el sellado de cada talla es la respuesta. Si la respuesta no
   llega, los números quedan trabados y se reenvía lo mismo con la misma marca.
10. **Se retira el recorrido «Ajustar» de 4 pasos por talla** (`FlujoTalla` y `lib/existencias-flujos.ts`). `AjustarInventarioModal.tsx` queda para
    enlazar un ajuste con un conteo.
11. **Dos piezas crecen, sin abrir variantes nuevas:** `PasoCantidad` gana `tamano="planilla"` (44 px, número en serif de 24 px) y el botón
    `bloqueado` (se ve apagado, dice por qué en su `title` y sigue tocable para explicarlo). `CifraQueCuenta` gana `desde`, para contar desde
    el número viejo. El movimiento es la excepción ADR-0136 act. 2026-10-23 (c), vigilada por `lib/ajuste-modelo-movimiento.test.ts`.

## Por qué así y no de otra forma

- **En el modal y no en una hoja propia (la B de la ronda 1) ni en la tarjeta (la C):** se llega desde lo que la persona ya está mirando, y la
  talla elegida dice dónde empezar. En la tarjeta no cabían cinco tallas.
- **Un lugar a la vez y no piso y almacén juntos:** serían dos llamadas con dos marcas, y un corte entre ellas deja la mitad guardada. Contar
  también se hace por lugar.
- **La diferencia y no el número absoluto:** es lo que recibe `ajustar_inventario` y lo que guarda `movimientos`. Cambiarlo pide migración, y
  esta actividad se decidió sin ella (ver «Lo que queda abierto»).
- **La planilla y no el riel de etiquetas (ronda 2):** Felipe eligió la planilla; el riel escondía las tallas que no estaban a la vista.

## Lo que queda abierto

- **Contar con la tienda abierta:** resuelto en la planilla (ver la actualización de abajo). La matriz de Editar producto todavía manda
  la diferencia sin lo que había; se retira con la actividad 3, cuando Catálogo quede de solo lectura.
- El `/chaos` quedó detenido a los 9 de 23 ataques: otra sesión escribía en la base local compartida. Falta el núcleo de red, recarga, sede y
  teclado.
- Actividades 2 y 3.
- Sin medir en producción: cuántos ajustes se hacían desde la ficha y con qué motivo.

## Cómo se verifica

- Pruebas:
  - `lib/existencias-ajuste-modelo.test.ts`: motivos, lugar inicial, límites por celda, el lote y el ancho.
  - `lib/existencias-buscar-ajuste.test.ts`: el buscador de la cabecera entra en la primera talla de la curva, o en la exacta con un código.
  - `lib/ajuste-modelo-movimiento.test.ts`: sin bucle, la curva del sistema y apagado con «reducir movimiento».
  - `lib/existencias-panel-talla.test.ts`, `lib/existencias-flujos.test.ts` y `lib/etiqueta-precio-reglas.test.ts`.
- Guía: `inventario`, con los pasos «Ajustar stock» de la cabecera y la banda. `guias:recorrer` pasa los 36 pasos.
- En el navegador:
  1. Existencias ▸ una prenda ▸ la banda: la planilla entra con la talla en foco y en el lugar con más unidades.
  2. Se cuenta y se guarda: cada talla se sella, salen las etiquetas si entró algo y Movimientos muestra el conteo a nombre del responsable.
  3. «Ajustar stock» de la cabecera ▸ «ivana» ▸ Enter: la planilla entra en Blanco S.
  4. Se revisó a 1280 y 375 px, en claro y oscuro.

## Actualización 2026-10-23 (b) — contar con la tienda abierta: la base compara lo que había (Felipe: «aplica tu recomendación»)

**El problema.** El `/chaos` de la planilla (semilla 494, CON-06) encontró que contar con la tienda abierta guardaba un stock que no era el
contado. La planilla leyó 6, otra sesión sacó 1 y quedó en 5; al escribir lo contado, 5, se mandó −1 contra la lectura vieja y la base quedó
en 4. La base cuadraba consigo misma pero no con la tienda, y nadie avisaba.

**Lo que se decidió.**
1. **Con «Conté y hay otro número», cada línea viaja con `esperado`:** lo que había en ese lugar cuando se contó, el mismo «hoy» que
   muestra la planilla (la sububicación, o la suma de la sede donde no se separa). Los demás motivos no lo llevan: «encontré 2» y «no
   aparece 1» son diferencias, y valen igual aunque alguien haya vendido.
2. **La base compara con el stock ya bloqueado** (`fn_bloquear_en_orden`, el mismo candado de las ventas). Si una línea cambió, rechaza TODO
   el ajuste con `ajuste_cambio_al_contar` y devuelve en `detail` qué cambió (`[{variante_id, esperado, ahora}]`). Nada queda a medias.
3. **La comparación va después del atajo de la marca:** el reintento de un ajuste ya guardado sigue devolviendo «ya registrado», aunque el
   stock ya no sea el `esperado`. `esperado` no entra a la huella de la marca en la base.
4. **La pantalla no pierde lo contado:** la copia local toma lo de ahora y la diferencia se vuelve a sacar contra eso
   (`mantenerLoContado`). Con 6 leídas, 5 contadas y 1 vendida, la talla ya no cambia: lo contado es lo que hay. La talla queda marcada en
   ámbar («había 8, ahora 7») hasta que la persona la toca, y un aviso dice qué cambió, que no se guardó nada y que vuelva a guardar.
   Guardar no se repite solo: la persona decide si su conteo ya descontaba esa venta.
5. **Sin `esperado`, todo sigue igual:** la ficha de Editar producto, «Ajustar inventario» y el hallazgo de un conteo no cambian.

**Por qué así y no releer en la pantalla justo antes de guardar.** Releer deja una ventana entre la lectura y el guardado, y además gasta una
lectura más en cada guardado. Comparar en la base con la prenda bloqueada no deja ninguna ventana y no cuesta una ida más: es el mismo
candado que ya toman las ventas.

**Cómo se pega.** Una sola parte, solo funciones, con dos reemplazos ANCLADOS (ADR-0288) sobre la función viva. Si las anclas no calzan,
se niega sin escribir nada. Es idempotente y no tiene `select … into` dentro de un texto entre comillas. Se puede pegar antes o después de
publicar la web: una web vieja no manda `esperado`, y una base vieja ignora la clave.

**Cómo se verifica.**
- `pnpm pruebas:ajuste-lo-que-habia`: 18 casos en ROLLBACK, con un control sin la migración y dos sesiones reales; el conteo espera a que
  la otra suelte la prenda.
- La lógica pura (`cambiosAlContar`, `conStockDeAhora`, `mantenerLoContado`, `textoCambiosAlContar`) está en
  `lib/existencias-ajuste-modelo.test.ts`.
- En el navegador, el mismo ataque de la semilla 494:
  - La planilla leyó 8 y otra sesión sacó 1.
  - Al guardar 6, la base rechazó: «Mientras contabas cambió Beige S: había 8 y ahora hay 7…». La celda siguió en 6 y el pie pasó de «salen 2»
    a «salen 1».
  - El segundo guardado dejó 6, lo contado. Ninguna invariante nueva.
