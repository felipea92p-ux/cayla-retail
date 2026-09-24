# Spike visual · Nuevo producto (2026-09-24)

`index.html`: un solo archivo, ábrelo en el navegador. Los datos son inventados. **No es la implementación.**
Sirve para decidir cómo se reparte la pantalla `/productos/nuevo` (`components/NuevoProductoForm.tsx`, ADR-0109).
La barra punteada de arriba cambia de estado (Vacío, A medio llenar, Listo para crear, Nombre repetido) y
muestra la pantalla a 375 px.

## Qué confunde hoy (leído del código en `origin/main`)

1. **Siete tarjetas del mismo peso, una debajo de otra.** Las que siguen cerradas se ven igual, en gris y
   con texto. El recorrido se vuelve largo y no queda claro dónde estás.
2. **El orden salta.** Primero van Marca y Nombre, cada uno en su tarjeta. Colores está separado de
   Precio y variantes, aunque las variantes salen de las tallas × los colores.
3. **Las variantes son una fila de casillas con un campo de precio pegado a cada una.** Con 4 tallas y
   3 colores salen 12 cajitas sueltas y no se ve la forma talla × color.
4. **El resumen repite datos y la lista «Falta» enumera todo a la vez.** Eso asusta al empezar. Además,
   el botón Crear queda arriba a la derecha mientras la persona trabaja abajo.
5. **Los 14 colores aparecen de una vez, agrupados por familia.**
6. **La cabecera no usa `<CabeceraPantalla>`** (ADR-0169).

## Qué propone el spike

| Hoy | Propuesta |
|---|---|
| 7 bloques: Qué es · Marca · Nombre · Talla/tejido/patrón · Colores · Precio · Etiquetas | **4 pasos**: Qué es · Quién es y cómo se llama · Cómo se hace · Precio y variantes (las etiquetas quedan dentro, plegadas) |
| Todos los bloques a la vista, los cerrados en gris | **Acordeón**: se abre un paso a la vez. El terminado se pliega a una línea con «Cambiar». El que viene es una línea punteada |
| Se avanza al llenar | El paso 1 avanza solo al elegir la categoría. Los demás tienen un botón **«Seguir →»** y, al lado, qué falta |
| Fila de casillas con precio | **Tabla talla × color.** Clic en una celda la quita. Clic en el color o la talla quita la fila o la columna. «Poner un precio distinto» cambia las celdas a campos |
| Resumen en lista + «Falta» con todos los puntos | **La ficha de la prenda**: código, nombre, categoría, puntos de color, tallas, variantes y precio. Debajo, **un solo «Siguiente paso»** |
| Margen en un aviso aparte | Precio · Costo · **Margen** en una fila de tres, con el color del nivel (verde, ámbar o rojo) |
| Todos los colores | Primero los 5 frecuentes de la categoría. **«Más colores (9)»** abre los grupos |
| Celular: el resumen cae al final | **Barra fija abajo**: nombre, código, variantes, precio, «Crear» y el siguiente paso. «Ver» despliega la ficha |

## Lo que NO cambia

- La lógica de `lib/alta-producto.ts` (`desbloqueos`, `problemasAlta`, `construirCeldas`, código previsto) se
  mantiene tal cual. El spike solo junta esos resultados en otros contenedores.
- Sigue siendo una sola transacción (`crear_producto_con_variantes`) con su token de idempotencia, con
  Enter bloqueado y con la pantalla de éxito «Crear otro parecido».
- `ArbolCategoria`, `ElegirMarcaProveedor`, `AvisoParecidos`, `ProponerValor` y `ConfigurarCategoria`
  cambian de lugar, no de funcionamiento.

## Decisiones para Felipe antes de implementar

1. **Nombre y Marca en un mismo paso.** Hoy el nombre se abre recién después de elegir la marca. En el
   spike se abren juntos. ¿Te sirve así o la marca tiene que ir antes?
2. **«Seguir →» explícito o avance automático.** El spike usa un botón en los pasos 2 y 3 para no
   cerrarle el paso a quien todavía está mirando.
3. **Precio por celda en la tabla.** En celular, la celda muestra solo ✓ y el precio aparece únicamente
   cuando es distinto. ¿Alcanza con eso?

## Cómo se portaría (estimado, sin migraciones)

- `NuevoProductoForm.tsx`: agregar el estado `pasoAbierto` y cambiar los 7 `<Bloque>` por 4 `<PasoAlta>`
  (una pieza nueva en `alta-producto/piezas.tsx`).
- La tabla nueva va en `alta-producto/MatrizVariantes.tsx`, sobre el `construirCeldas` que ya existe.
- La ficha nueva va en `alta-producto/FichaPrevia.tsx`, en lugar del `<aside>` actual, y su barra de celular
  en la misma pieza.
- `page.tsx`: cambiar la cabecera por `<CabeceraPantalla sobretitulo="Catálogo · Productos">`.
