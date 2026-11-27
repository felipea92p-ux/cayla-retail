# Auditoría al milímetro — Compradores como tabla y el detalle de una persona en dos columnas (PR #2042, ADR-0704 act. c) · 2026-11-26 · claude/bhekam-claudia-pereyra-fondos-3346ee
Medido: 1440×900 claro (vivo y quieto) · 375×812 claro con dedo · 1440 oscuro · foco con teclado · color con la pantalla entera a la vista (1440×1900, claro y oscuro)     Servidor: `http://compradores.localhost:3067` (worktree, sin base)
Resumen: 0 graves · 2 medias abiertas, las dos de piezas del sistema que ya existían (2 corregidas) · 0 leves abiertas (3 corregidas) · 4 decididos a propósito

Cómo se midió: las dos vistas (`CompradoresVista` y `DetalleComprador`) dibujadas en una página temporal, sin sesión ni base, con los datos de
producción de ese día pasados por las mismas lecturas de `lib/compradores-reglas.ts` (cinco personas: una con plata y sin compras, una con compras
por revisar y una a medio pagar, una con plata y sin ronda, una quieta 17 días y una ronda vacía de 34). Los siete medidores del set corrieron en
un Chrome sin pantalla (32 mediciones) y, tras los arreglos, se repitieron los que tocaban (14). **No se midió con el marco del ERP**: ver «Sin medir».

## Graves

Ninguno.

## Medias

Corregidas en este mismo PR:

1. **El motivo de una entrega se cortaba en la columna «Su plata»** — `MovimientosDeFondo`, `p.truncate` — medido: 2 de 3 renglones cortados a 384 px
   de columna («De BCP Soles · Resto de los 7,200 del 9-nov: los 3…»), y el texto entero solo quedaba en el `title` — regla: el hover nunca es el único
   camino a una información — `[Norma]` WCAG 1.4.13 — /textos. Con `dePersona` el renglón ya no se corta: baja de línea.
2. **La barra de «Gastó» no escribía su cifra** — `DetalleComprador`, tarjeta «Gastó» — medido: `cifrasEscritas: 0`; el «13 %» solo lo decía la
   etiqueta para el lector de pantalla — regla: una barra dice su número a la vista — /graficos. Ahora la barra es decorativa y a su lado dice «Usó el 13 %».

Abiertas, de piezas del sistema que ya existían (no nacen de este cambio; no se tocan aquí porque viven en `components/ui/`, que comparte Dynamic):

3. **`<Volver>` mide 42×42 con el dedo** — `components/ui/Volver.tsx`, en toda pantalla que lo usa — medido a 375 px con puntero grueso: 42×42 —
   regla del repo: con el dedo, 44 px (ADR-0611, mejora 5); no está en la lista de `app/estilos/tacto.css` — va a /espacio. Espera a Felipe.
4. **`<Chip tono="pizarra">` en oscuro no se pudo concluir** — «Sin compras», «Sin ronda» en la tabla — medido: entre 4.39:1 y 5.41:1 (mínimo 4.5),
   según lo que quede detrás del vidrio — `[Norma]` WCAG 1.4.3 — va a /color: hay que medirlo sobre el fondo real del ERP.

## Leves

Corregidas en este mismo PR:

5. «100 %» no cabía en su caja de 36 px y corría 2 px el borde derecho de la columna «Gastó» — ahora 40 px; medido: `columnasSinAlinear: 0` — /tipografia.
6. Dos insignias se leían como frases a 13 px («Cerrar su ronda, 34 días quieta», «Sin abrir su ronda») — ahora «Cerrar su ronda», «Sin ronda» y
   «Sin compras»; medido: `lecturaBajo14: 0`. Los días ya los dice la segunda línea de la fila — /textos.
7. Separación de 14 px entre el ícono y el texto de cada entrega (fuera de la escala de 4) — `gap-x-3.5` → `gap-x-3` — /espacio.

## Decidido a propósito

- La pista de `<BarraAvance>` da 1.12:1 contra su fondo: es la pista en arena de la pieza elegida (ADR-0358); el relleno, que es el dato, da 7.88:1 y 13.75:1.
- La columna «Gastó» lleva el monto y, debajo, el porcentaje usado: el medidor lo lee como «decimales mezclados» en una columna.
- Los nombres de proveedor en mayúsculas («MIYAN 777 S.A.C.») son el dato tal como se registró, no texto de la interfaz.
- Los dos `:hover` que lista el medidor de estados (`.barra-t`, `.parecidas-punto`) son de hojas globales de otras pantallas; `lib/hover-con-mouse.test.ts` pasa.

## Lo que salió limpio

Estados: sin hallazgos en las cinco pasadas; foco medido en 10 controles de la lista y 2 del detalle, ninguno invisible ni tapado. Color: 114 textos
de la lista y 82 del detalle, 0 fallan en claro y 0 en oscuro (9 del detalle en oscuro pasan WCAG y quedan para segunda mirada con APCA: insignias
del sistema entre 4.67:1 y 6.13:1). Tipografía: seis tamaños, todos de la escala (13 · 14 · 16 · 21, más 28 y 46 de exhibición); toda cifra pide y
tiene tabulares. Espacio: nada bajo 24 px con mouse; sin radios invertidos. Movimiento: 0 animaciones en bucle, vivo y quieto; la única entrada es la
de `<BarraAvance>`, de la pieza. Las capturas en oscuro se miraron: sin manchas claras ni velos.

## Sin medir

- **Con el marco real del ERP** (menú, cabecera de vidrio y fondo Lienzo): la página temporal no lo lleva. El contraste del vidrio sobre el fondo y si la
  cabecera tapa el foco quedan sin medir.
- **`tema:auditar`**: entra con cuentas de prueba y necesita un banco local; no se corrió. El oscuro se midió con el medidor de /color y mirando capturas.
- **Lo que guarda dentro del detalle** (Entregar plata, Anular, la bandeja de revisión, Cerrar su ronda): son las piezas de antes y no se abrieron aquí.
- Foco con teclado a 375 px y los anchos de 1024 y 1920 px (se capturaron, no se midieron).
