# Lámina · Rediseño de Producción: Órdenes y la orden (2026-10-14)

> **Estado: para que Felipe elija MIRANDO (ADR-0358: el 2026-10-06 eligió por descripción y al ver el resultado no le gustó).**
> Dos preguntas, cuatro pantallas. Nada de esto está implementado; la lámina no toca `apps/web`.

`index.html`: un solo archivo, sin frameworks. Ábrelo con `preview_start maquetas` (sirve `docs/maquetas` en el 8791) y entra a
`/produccion-rediseno-2026-10/index.html`, o `python3 -m http.server 8791 --directory docs/maquetas`. La barra de arriba tiene el índice
(A, B, C, D), el botón **Oscuro/Claro** (pone `data-tema="oscuro"` en `<html>`, como el botón real) y el ancho **1440 / 1024**: cada vista
entra en un marco de ese ancho (el documento se desplaza de costado si la ventana es más angosta). Por la URL: `#vista-c,oscuro,1024`.

Los colores son **solo los tokens reales** de `apps/web/app/globals.css` (`@theme`) y `apps/web/app/estilos/tema.css` (bloque oscuro),
copiados a variables al inicio del archivo; fuera de ese bloque no hay ningún hex. Los `--prenda-*` son color de DATO (el color de la prenda,
ADR-0336 §3) y no cambian con el tema. Fuentes: DM Sans y EB Garamond, las del ERP.

## Lo que ya está decidido (no se discute en la lámina)

La orden de producción es la única entidad y las áreas son fases por las que pasa: **Corte · Costura · Acabado** más **Bordado, Estampado y
Lavandería** opcionales. Cada fase tiene UN quién (el Taller o un servicio de afuera), decidido al abrir; lo que sale a un servicio es una
**Salida** y lo que regresa una **Vuelta** (buenas, segundas, faltantes), por talla y color; la tarifa es por prenda; el avance se anota
«Terminé N de M» por talla y color; la tela se elige al abrir; la cabecera es `EncabezadoPagina`; escritorio primero (1440 × 900), 1024 se adapta.

## Las dos preguntas

### Pregunta 1 · Órdenes: ¿lista (A) o columnas por fase (B)?

| | A · Lista | B · Columnas |
|---|---|---|
| Qué manda | La **urgencia**: una fila por lote, ordenadas por entrega; la fase es un dato de la fila (chip + quién la tiene) | El **lugar**: cada columna es una mesa del Taller (Por cortar · En costura · En acabado · Listas) y el lote es una tarjeta que avanza |
| Qué se ve de un vistazo | Qué pide algo y para cuándo; «Hoy en el Taller» cuenta por fase y filtra | Cuánto hay en cada mesa; lo que está afuera, marcado dentro de su columna |
| Piezas del sistema | `EncabezadoPagina`, `TarjetaCifra` (filtra: puesta en arena), `Pestanas` (EN CURSO · MUESTRAS · TERMINADAS), `pildora-cayla`, `Buscador`, `Tabla`, `Chip`, `nota-cayla` | Las mismas, sin cifras (las columnas ya cuentan); tarjetas con mosaico, cuántas, quién, hilo de avance y entrega |
| A 1024 | Cabe: se esconden «En la fase» y «Entrega» como columnas y pasan a la línea del chip | Las cuatro columnas se desplazan de costado dentro de la tarjeta |

En las dos: la prenda se ve (mosaico del color + ícono de la categoría, 48 px), **rojo solo por tres causas** (entrega pasada, tela que no
llega, N días sin moverse) con «¿Por qué?» a un toque (tocable en la lámina: abre una línea), y «+ Nueva orden» en la cabecera.

### Pregunta 2 · La orden: ¿cajón (C) o página (D)?

| | C · Cajón de 560 px | D · Página `/produccion/ordenes/OP-000002` |
|---|---|---|
| Qué gana | La lista queda a la vista y marcada; se abre, se anota y se sigue con la siguiente sin cambiar de pantalla | URL propia (se comparte, se vuelve con la flecha `<Volver>`), todo el ancho |
| Cómo se lee | De arriba abajo: fases una bajo otra, tela, costo, línea de tiempo | Fases en fila cosidas por su hilo; tela y costo lado a lado; la línea de tiempo al costado |
| A 1024 | El cajón tapa casi todo el contenido (672 px libres) | Fases en 2 × 2, bloques apilados |

En las dos: cabecera con la prenda grande, OP, modelo, cuántas (grande) y entrega; la **ruta de fases como piezas** (hecha ✓ · actual
encendida · pendiente, con quién, «N de M», fecha prometida; «+ Agregar una fase» para las opcionales); **una sola acción por fase** («Anotar
vuelta» / «Otra salida» en la que está afuera; sería «Terminé N» si fuera del Taller); «Tela» (plan, usada, alcanza), «Costo» (estimado · real
en dos columnas), línea de tiempo (quién, cuándo, cuánto) y «Pasar al stock» deshabilitado hasta que termine la última fase.

## Datos

Los seis lotes de la base local sembrada, sin el prefijo «ZZ Prueba»: Blusa Marina, Pantalón Lía, Vestido Aurora; Textiles Andinos (tela) y
Confecciones del Norte (costura, S/ 4.50 por prenda). **En la lámina «hoy» es el lunes 19 de octubre** para que la entrega del 18 de OP-000003
ya haya pasado, como dice la base; las fechas de corte, salida y «sin moverse» se acomodan a ese hoy. Los metros, costos y la matriz por talla
son ilustrativos (1.5 m por pantalón, 24 por color).

## Verificación (medido con `.claude/skills/formidable/referencia/medir-oficio.js`, una vista a la vez)

Claro y oscuro, 1440 y 1024, las cuatro vistas: **0 blancos bajo 24 px, 0 textos bajo 4,5:1, 0 huecos fuera de escala salvo uno (ver abajo), una
sola acción primaria por vista** (en C, dos: la de la lista tapada por el velo y la del cajón). Lo que el script marca y queda a propósito:

- **Rojos sobre 2 en A, B y C (4–5):** el riel del menú lateral (2 px, del ERP) + las tres causas de los datos sembrados (+ «Anular orden» en C).
  Con los datos reales de hoy hay tres órdenes que piden algo; la regla de «máximo 2 rojos» es de acento y aquí el rojo es semáforo de dato.
  Decisión de Felipe: dejarlo así o, como Frescura, pasar la tercera causa al chip de contorno `tinta`.
- **Texto chico (10 u 11 px):** las versalitas del ERP (`label-cayla`, «Retail», la línea de sede, los nombres de cifra). Son las del sistema.
- **Radios distintos (5–8):** 4, 8, 10, 12, 14, 16, 20 y 999 px son los del ERP (controles, filas del lateral, pestañas, tarjetas, hoja, píldoras).
- **Un hueco de 15 px** en A y C: entre la causa y su explicación abierta (la fila centra sus celdas y la banda va debajo).
- **«Bordes casi alineados»:** números de distinto ancho («2» y «57» con su unidad), textos alineados a la derecha, y los 1 px de borde de tarjeta.

Se miró en el navegador integrado en claro y oscuro, a 1440 y a 1024, con capturas; se corrigió el texto cortado de la tabla a 1024, el
«quién» que se salía de la pieza de Costura en D, la voz de versalitas que se colaba en los botones de las hojas, los contrastes de «Buscar» y
sus teclas (tinta al 65 %), y el filo del mosaico en oscuro (ahora `tinta`, que se invierte).

## Lo que no se resolvió

- El conteo de rojos con tres causas a la vez (arriba).
- Lo que no es de la lámina: cómo se anota «Terminé N» para una fase del Taller (aquí la fase viva es de un servicio, así que se ven Salida/Vuelta),
  y la hoja de «Nueva orden», que ya tiene su propia lámina (`docs/maquetas/produccion-nueva-orden-2026-10/`, ADR-0396).

## Lo que eligió Felipe (2026-10-14, mirando las capturas a 1440 px, claro y oscuro)

- **Pregunta 1 · Órdenes: A · Lista.** Una fila por lote ordenada por entrega, la fase y quién la tiene como dato de la fila, «Hoy en el Taller» arriba.
- **Pregunta 2 · La orden: D · Página propia.** `/produccion/ordenes/OP-000002` con la flecha para volver, fases en fila, tela y costo lado a lado.

B (columnas) y C (cajón) quedan en la lámina como lo descartado. La decisión vive en ADR-0400 (decisión 10).
