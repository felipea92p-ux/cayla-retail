# ADR-0320 — «Reponer prenda» y «Subir prenda» abren el modelo entero (2026-10-03)

**Decidió:** Felipe, con maqueta (`docs/maquetas/bajar-por-modelo-2026-10/`). **Continúa** el ADR-0295 (Reponer con todas las tallas) y el
ADR-0300 (Subir a almacén): ahora con todos los colores. Mantiene el ADR-0231 (la ventana no sugiere cantidades).

## El problema

Para bajar al piso un Polo en azul, blanco y negro había que buscar cada color en Existencias, abrir su ventana, poner las cantidades,
elegir al responsable, confirmar y esperar la recarga de la pantalla: tres veces. «Reponer» y «Subir a almacén» abrían UNA prenda
(modelo + un color). La escritura en sí no es lo lento: `bajar_al_piso` tarda 32 ms de media en producción (88 llamadas, medido el
2026-10-03 con `pg_stat_statements`); lo lento es repetir el ciclo y la recarga que sigue a cada guardado.

## La decisión

1. **Los botones de la tarjeta y del cajón pasan a llamarse «Reponer prenda» y «Subir prenda»** y abren el **modelo entero**: una fila por
   color y una columna por talla. No hay botón «solo este color»: quien no quiere mover un color lo deja en 0.
2. **La tabla es la de Nuevo y Editar producto** (`MatrizCantidades`, `MatrizStockFicha`): encabezado hueso, franja de 5 px con el color de
   la fila, filas alternadas, caja − N + por celda que también se escribe, columna «Total» y fila «Total» fija; en celular se desliza de
   lado con el color fijo. Una sola forma para no tener que releerla. Debajo de cada caja, «hay N» = el tope; la celda sin nada que mover
   (o el color sin esa talla) sale rayada con «—», como las combinaciones quitadas del alta.
3. **Todo arranca en 0** (ADR-0231). No hay botón «Poner 1 en cada talla»: CAYLA no sugiere cuánto reponer; la cifra la pone quien tiene
   las prendas en la mano.
4. **Sigue siendo UNA llamada, todo o nada.** Las celdas de todos los colores viajan juntas en `bajar_al_piso` (Reponer) o
   `retirar_del_piso` (Subir), cada celda es una variante, y la marca de reintento, el candado de red incierta y el rechazo por tope
   quedan como estaban. Si la base rechaza una celda, esa celda se marca y no se guarda nada. **Sin migración.**

## Corrección el mismo día (PR siguiente)

La primera versión se vio mal en la pantalla real, aunque la maqueta estaba bien: (1) la hoja heredaba la **foto lateral** y el ancho
angosto de «Reponer/Subir», así que la tabla quedaba apretada, con scroll propio y solo dos tallas a la vista; (2) la **guía de foco**
(`alta-guia.css`) enciende todo `<input>` del bloque que sigue con fondo `papel`, y blanqueaba cada caja − N + (en Editar producto no
pasa porque ahí no hay un `CampoGuiado` alrededor). Se arregló así: las dos ventanas son más anchas (`max-w-3xl`) y sin foto lateral
(una miniatura junto al nombre del modelo), la tabla no tiene scroll vertical propio (la hoja es la que baja) y la regla de la luz
excluye las cajas de `[data-matriz-mover]`. Lección: una pieza se verifica DENTRO del modal y de la guía, no sola.

## Lo que se descartó

- **Marcar el modelo entero y bajarlo con la pistola** (propuesta B): ahorra buscar, no contar.
- **Hoja de bajada de varios modelos** (propuesta C): útil cuando llega un fardo con muchos modelos; queda para después, y sería esta
  misma tabla repetida por modelo.
- **Mantener «Solo azul»**: dos formas de hacer lo mismo; quien quiera uno solo deja los otros en 0.
- **Extraer una pieza común con Editar producto** (franja, caja − N +, fila Total): `MatrizMover` copia el estilo sin tocar esas dos
  tablas. Compartirla es un paso aparte, para no mover Editar producto en el mismo cambio. Queda en el backlog.

## Cómo se ve cada pieza

`lib/reponer-prenda-reglas.ts` (reglas puras: `coloresParaMover`, `columnasDeTallas`, `totalesDeMatriz`, `lineasDeMoverModelo`,
`detalleDeLoMovido`) · `lib/existencias-prendas.ts` (`coloresDelModelo`) · `components/MatrizMover.tsx` · `ReponerPrendaModal.tsx` y
`SubirAAlmacenModal.tsx` (reciben `prendas`, los colores del modelo) · `ExistenciasTarjetas.tsx` y `CajonPrendaExistencias.tsx`
(botones) · `InventarioPanel.tsx` (guarda el `productoId` y lee los colores de `stock`, así que tras refrescar la ventana ve las cifras
nuevas). Se eliminó `SelectorDeTallas.tsx`.

## Verificación

`vitest` completo (312 archivos), `tsc` y `eslint` limpios. La tabla se vio en el navegador a escritorio y a 375 px, con los dos rumbos,
un color y varios, un error de la base en una celda y un número tecleado por encima del tope (se recorta). **No se probó con una cuenta
real contra producción**: queda como primer uso en tienda (ver el backlog).
