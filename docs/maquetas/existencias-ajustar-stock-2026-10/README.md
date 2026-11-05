# Maqueta · El stock se carga en Existencias (2026-10-23)

**Estado: ronda 3, la que se construye si Felipe la aprueba. Nada construido todavía.** Ronda 1: `index.html`. Ronda 2: `ronda-2.html`. Ronda 3: `ronda-3.html` (doble clic).

## El pedido

Felipe, 2026-10-23: las colaboradoras ingresan el stock desde Catálogo ▸ Productos y él quiere que lo hagan desde Existencias,
con Catálogo obsoleto para eso. Saben que se puede desde los dos lados, pero Catálogo les resulta más cómodo.

## Por qué prefieren Catálogo (leído en el código, no medido en producción)

| | Catálogo ▸ Editar producto | Existencias |
|---|---|---|
| Qué se ve | Todo el modelo: tabla color × talla con − N + (`components/ficha-producto/MatrizStockFicha.tsx`) | Una talla a la vez (`lib/existencias-flujos.ts:131`) |
| Pasos | Motivo, lugar y responsable una vez por visita; un solo guardado (`useStockFicha.ts`) | Por cada talla: Dónde → Sumar o quitar y cuántas → Motivo → Quién |
| Qué se escribe | El número contado | La diferencia |
| Prenda que la tienda nunca tuvo | Aparece | No aparece: Existencias solo lista lo que tiene fila de `stock` en la sede o viene en camino (`lib/inventario-v2.ts:270`) |
| Al terminar | «Etiquetas de lo que entró» | Nada |
| Dónde está | Lo primero que se abre en la ficha | En «Más ⌄» y como acción 6 de 7 del modal |

Además, la ficha arranca en «Conteo físico» (`lib/ficha-cambio-de-sede.ts:18`): lo que se carga ahí sin cambiar el motivo queda en
Movimientos como conteo. No se midió en producción (las lecturas estaban bloqueadas en la sesión).

## Lo que ya decidió Felipe (2026-10-23)

1. Hoy hacen las dos cosas (ingresar y corregir), y sobre todo **correcciones al contar**, porque Recibir mercadería espera a Compras
   y todavía se está cuadrando el inventario. → La tabla arranca en «Conté y hay otro número».
2. **Nuevo producto sigue poniendo las unidades del día** en que la prenda nace.
3. **Editar producto queda con los números a la vista y «Ajustar en Existencias»**, sin − ni +.
4. **Primero esta maqueta**, antes de construir.

## Las tres formas

La tabla, sus reglas y su guardado son los mismos en las tres; cambia dónde vive.

- **A · En el modal de la prenda (recomendada).** «Ajustar stock» convierte la columna derecha del modal de ADR-0391 en la tabla de todo
  el modelo; la foto se achica. Todo lo de la prenda queda en un solo lugar y es un modal que ya conocen.
- **B · Una hoja propia.** La tabla de Editar producto tal cual, en su propia hoja. Cero aprendizaje y más ancho, pero es una hoja más.
- **C · En la misma tarjeta.** La tarjeta se abre a lo ancho de la fila con la tabla adentro. Sirve para recorrer la lista mientras se
  cuadra, pero las tarjetas vecinas bajan al abrirla.

Lo común: el botón «Ajustar stock» en la cabecera, que pregunta la prenda y encuentra también las que la tienda nunca tuvo; «Etiquetas
de lo que entró» al guardar, y la ficha de Catálogo de solo lectura.

## Reglas que la maqueta respeta (de la base, no inventadas)

- Una sola llamada a `ajustar_inventario` por guardado (ADR-0240), firmada por el responsable (ADR-0161).
- «Encontré unidades» (`reposicion`) solo suma y solo en el almacén de una tienda que separa piso y almacén (`reposicionCerrada`).
- Una talla que nunca estuvo en la tienda, con la carga inicial cerrada, entra solo con «Encontré unidades» (`textoProblemaMotivo`).
- Lo apartado no se quita. «Se dañó» no se resta: se reporta.
- Los motivos son los de Existencias (`motivosDeAjuste`) y viajan a la base como sus cuatro motivos (`motivoParaLaBase`).

**Una decisión nueva de la maqueta, que Felipe confirma al elegir:** un lugar por vez. Lo contado es del almacén o del piso, y para cambiar
de lugar primero se guarda o se descarta.

## Datos

La prenda «Blusa Emma BLU-0142», sus cuatro colores y todas las cantidades son inventados. Colores: los tokens de `apps/web/app/globals.css`
y `apps/web/app/estilos/tema.css`.

## Ronda 2 (2026-10-23): dentro del modal de la prenda, con movimiento rico

Felipe, sobre la ronda 1 y una captura del modal real («Aretes Grandes»): «me gusta el modal actual, tal vez darle más peso a ajustar
stock y al mandarnos a esa vista mejorarla bastante, que sea sofisticada, elegante y full animaciones». O sea: la forma A, sobre el
modal de ADR-0391 tal como está.

`ronda-2.html` reproduce ese modal y deja elegir, con los controles de arriba:

- **El peso de «Ajustar stock»:** 1 · una banda bajo «Dónde está» («¿No es lo que ves en la tienda?», recomendada, sale de la lista);
  2 · primera de la lista y en tinta; 3 · un botón junto a «Dónde está» y un lápiz en «En piso» / «En almacén».
- **La vista de ajuste:** *Planilla* (números grandes en serif, − y + que se encienden al pasar) o *Riel de etiquetas* (cada talla es
  una etiqueta colgada del riel de su color, como en la tarjeta de Existencias).
- Dos prendas: Blusa Emma (4 colores × 4 tallas) y Aretes Grandes (2 colores, talla única), para ver el caso chico.

**Movimiento, «rico, una vez, sin rebote ni bucle»** (el mismo contrato que Insignias y la hoja de campaña, ADR-0136): al entrar, lo
de la talla se va, la foto se achica con «Ajustando», el modal se ensancha (62 → 74 rem), el hilo de la cabecera se dibuja y los
números llegan en ola (o las etiquetas se cuelgan); al contar, el número rueda, la celda se enmarca en ámbar y entra su talón a la
izquierda con la balanza entran/salen; al guardar, el hilo del botón corre mientras la base responde, cada talla se sella en verde,
el talón recibe «Guardado» y las etiquetas salen por la ranura; al volver, las cifras de «Dónde está» cuentan hasta el número nuevo.
«Cámara lenta» lo muestra a un tercio. Con `prefers-reduced-motion`, quieto.

Revisada en el navegador a 1024 y 375 px, en claro y oscuro, con las tres formas de peso y las dos vistas: sin desborde (la tabla se
desliza dentro de su caja en el celular) y sin errores en la consola.

**Al construir esto, el ADR de movimiento (ADR-0136) suma la excepción de esta vista**, como las demás de la lista de CLAUDE.md.

## Ronda 3 (2026-10-23): banda + planilla, la talla en foco y el ancho justo

Felipe eligió en la ronda 2 **la banda bajo «Dónde está» y la planilla**, y pidió tres cosas más: que el modal **no se ensanche
innecesariamente**; que, al entrar desde un color y una talla, **la vista se enfoque en ese número** («un highlight, o oscurecer el resto
de números y variaciones»), y que la tabla sea **más estética**. `ronda-3.html` deja solo lo elegido (sin los pesos 2 y 3 ni el riel) y suma:

- **El foco.** Al terminar de armarse la tabla, el resto baja de tono (28 %) y la talla elegida queda encendida: borde de tinta, una sombra
  suave, un anillo que se cierra una vez, su color marcado en la fila y su talla en la píldora oscura de la columna; en la compu, con el
  cursor listo y el número seleccionado para escribir encima (en el celular no, porque abriría el teclado sin pedirlo). La cabecera dice
  «Empiezas por Dorado · Única · Ver todo el modelo». **Tocar otra celda, «Ver todo el modelo» o Escape enciende todo**; un segundo
  Escape vuelve a la prenda. Lo que ya cambiaste nunca se oscurece. Si la tabla se desliza (celular, muchas tallas), se lleva sola hasta la
  talla en foco.
- **El ancho justo.** El modal se queda en 62 rem si la tabla cabe (1 a 4 tallas) y, si no, crece lo necesario y nada más (6 tallas:
  de 62 a unos 74 rem); al volver, regresa. En el celular nunca crece: la tabla se desliza dentro de su caja.
- **La tabla.** Más aire: la talla en su píldora, el color con el mismo círculo del modal y su nombre en la serif, con una línea debajo
  (lo que hay en el otro lugar), números de 28 px, − y + discretos que se encienden al pasar el mouse, y lo secundario («2 en piso») solo
  al pasar o con el foco. Sin cebra, con líneas finas. Con una sola talla no hay columna «Total» (repetiría el número).
- **Una propuesta de la maqueta, que Felipe confirma al aprobar:** entra en el lugar donde esa talla tiene más unidades (Dorado: 3 en
  piso y 0 en almacén → «En piso»); con empate, en almacén, como hoy.

Revisada en el navegador: Aretes a 1440 (el modal se queda en 992 px), Blusa a 1024 (foco y simulación), Vestido Lía a 1440 (crece a
1182 px y la tabla entra sin deslizarse) y a 375 px (se desliza hasta la talla en foco), la blusa a 375 px en oscuro, y el guardado
completo. Sin errores en la consola.
