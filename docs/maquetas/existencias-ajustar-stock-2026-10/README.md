# Maqueta · El stock se carga en Existencias (2026-10-23)

**Estado: ronda 2 para que Felipe elija mirando. Nada construido todavía.** Ronda 1: `index.html`. Ronda 2: `ronda-2.html` (doble clic).

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
