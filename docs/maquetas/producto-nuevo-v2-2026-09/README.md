# Spike visual · Nuevo producto v2 (2026-09-28)

> **Estado: propuesta, sin aprobar.** No toca `NuevoProductoForm.tsx` ni ninguna pieza de `components/alta-producto/`.

`index.html`: un solo archivo, ábrelo en el navegador. Los datos son inventados. **No es la implementación.**
La barra punteada salta a un estado (Vacío, Paso 2, Paso 3, Paso 4, Listo para crear), muestra la pantalla a
375 px y esconde o muestra la comparación «Hoy vs. propuesta». También se abre directo en un estado: `#listo`,
`#p3`, `#p4,celular`.

Sucede al spike del 2026-09-24 (`../producto-nuevo-spike-2026-09/`, ADR-0197). Ese spike ordenó el alta en 4 pasos.
Después se le sumaron temporada (ADR-0246), etiquetas con dibujo (ADR-0109 act. c), fotos revisadas (ADR-0228) y el
stock de hoy como paso 5 (ADR-0212). Todo eso cayó en el paso 3 o en un paso nuevo, y la pantalla volvió a cargarse.

## Qué confunde hoy (leído del código en `main`, `6b301666`)

1. **El paso 3, «Cómo se hace», tiene 7 campos:** tallas, tejido, patrón, temporada, colores, etiquetas y fotos. El paso
   2 tiene 3 y el 4 tiene 2. «Seguir al precio» queda a varias pantallas de distancia.
2. **Cada color aparece 4 veces:** en los chips, en las casillas de fotos (`FotosAlta`), en la tabla de variantes
   (paso 4) y en la tabla de stock (paso 5, `MatrizCantidades`). Esas dos tablas son la misma talla × color dibujada
   dos veces en dos pasos distintos.
3. **Hay tres marcadores de avance a la vez:** la barra de 5 segmentos de arriba, los números del acordeón y la caja
   «Siguiente paso» de la ficha.
4. **Tejido y patrón describen la prenda**, pero viven junto a las tallas y los colores, que son sus variantes.
5. **El campo «Nombre» tiene la etiqueta «Referencia».**
6. **Si falta un color, hay que ir a otra pestaña**: se crea en Catálogo → Atributos y después se toca «actualiza los
   colores».
7. **Los textos de ayuda son largos.** El de fotos ocupa 3 líneas, el de temporada 2 y la nota de carga inicial 3.

## Qué propone

| Hoy | Propuesta |
|---|---|
| 5 pasos: Qué es · Quién es y cómo se llama · Cómo se hace · Precio y variantes · Cuántas tienes hoy | **4 preguntas:** ¿A qué categoría pertenece? · ¿Cómo es? · ¿En qué tallas y colores? · ¿Cuánto cuesta y cuántas hay? |
| Tejido y patrón en «Cómo se hace» | **En «¿Cómo es?»**, junto al nombre y la marca: es lo que describe a la prenda |
| «Qué producto es» (se elige una categoría) | **«¿A qué categoría pertenece?»**: el título dice lo que se elige (Felipe, 2026-09-28) |
| Descripción, temporada y etiquetas a la vista, cada una con su fila | **Plegadas en «Más detalles · opcional»**. La línea plegada dice qué se llenó («descripción, Verano, 1 etiqueta») |
| Fotos en una grilla aparte de casillas por color | **La foto va en la fila de su color, dentro de la tabla de variantes.** Una sola tabla (color × talla) muestra fotos, variantes y quitar |
| Tabla de variantes en el paso 4 y tabla de stock en el paso 5 | **La tabla aparece al elegir las tallas y los colores (paso 3). En el paso 4 es la misma tabla, con cantidades**, total por fila y por columna. «Precios distintos» es un segmento de esa tabla, no otra vista |
| Barra de 5 segmentos arriba + «Siguiente paso» en la ficha | **Sin barra arriba.** Bajo la ficha va la lista «Avance»: las 4 preguntas con ✓, su resumen o lo que falta. Se toca para volver a una |
| «Referencia» como etiqueta del nombre | **«Nombre»**, en caja grande, con «Se guardará como Blusa Lirio» debajo |
| Un color que falta se crea en otra pestaña | **«+ Nuevo color»** (y «+ Crear el color «…»» al final del buscador): nombre + muestra, y queda elegido |
| Campos obligatorios sin marca | Etiqueta roja **«obligatorio»** en lo que bloquea «Seguir» |
| Ficha: Tallas, Tejido y patrón, Etiquetas, Variantes, Stock, Precio | Ficha más corta: código, nombre, categoría · marca · tejido, dos cifras (**Variantes** y **Hoy en tienda**) y **Precio · margen** |

## Lo que NO cambia

- Toda la lógica de `lib/alta-producto.ts` (`problemasAlta`, `faltaDelPaso`, `construirCeldas`, código previsto), la
  RPC `crear_producto_con_stock_inicial` con su token de idempotencia, el Enter bloqueado, el alta sin conexión, «Crear
  otro parecido» y la subida de fotos después de crear.
- `ArbolCategoria`, `ElegirMarcaProveedor`, `AvisoParecidos`, `ElegirTejido`, `ElegirColores`, `ElegirEtiquetas`,
  `ProponerValor`, `ConfigurarCategoria`, `RevisarFotosModal` y `ComboResponsable` se mueven de lugar, no cambian por
  dentro. Las etiquetas del spike son chips simples: en el ERP siguen siendo las de `ElegirEtiquetas`, con dibujo.
- Celular: la barra fija de abajo (nombre, código, variantes, precio, «Crear», siguiente paso) queda igual.

## Decisiones para Felipe antes de implementar

1. **Precio y stock en el mismo paso.** Hoy son dos pasos. Juntos, la tabla se dibuja una sola vez y el paso 4 cierra
   el alta. El costo: un paso más largo para quien carga 5 colores × 6 tallas.
2. **Fotos dentro de la fila del color.** Ganas que no se repite la lista de colores. Pagas que la foto «para todos
   los colores» no tiene fila propia: en el spike, la primera foto se usa en los colores que no tienen la suya. ¿Alcanza,
   o hace falta una fila «Todos los colores»?
3. **Crear un color desde el alta.** Hoy crear colores es de Catálogo → Atributos. ¿Quién puede crearlo desde aquí?
   ¿Solo el líder, igual que marcas y proveedores?
4. **Descripción, temporada y etiquetas plegadas.** Las etiquetas se pusieron a la vista a propósito el 2026-09-26
   (ADR-0109). Si tienen que seguir a la vista, van como fila abierta al final de «¿Cómo es?».

## Cómo se portaría (estimado)

- `NuevoProductoForm.tsx`: pasa de 5 a 4 `PasoAlta`. `cuerpo(2)` recibe tejido, patrón y el plegable. `cuerpo(3)`
  queda con tallas, colores y la tabla. El paso 4 junta el precio actual con `MatrizCantidades`. Se quita el `<nav>`
  de 5 segmentos.
- `lib/alta-producto.ts`: `PASOS_ALTA` y `faltaDelPaso` pasan a 4 pasos (el problema de tejido o patrón se mueve al
  paso 2, el de stock al 4). Sus pruebas `.test.ts` cambian con eso.
- `MatrizVariantes` gana una columna de fotos por fila (la de `FotosAlta`, con `RevisarFotosModal`). `MatrizCantidades`
  gana el segmento «Cuántas hay hoy / Precios distintos» y absorbe la edición de precio de `MatrizVariantes`.
- `FichaPrevia`: la tarjeta se achica y «Siguiente paso» pasa a ser la lista «Avance».
- Crear un color desde el alta: si Felipe lo aprueba, hace falta una RPC o un permiso (la única pieza que podría
  necesitar migración).
- Hay otras sesiones sobre este formulario (ver `docs/SESIONES-ACTIVAS.md`): reconciliar contra `main` antes de
  empezar.
