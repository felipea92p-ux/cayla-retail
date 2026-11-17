# Auditoría al milímetro — `/compras/mi-plata`: los botones de «Tu última ronda» · 2026-11-17 · `claude/compras-envios-mejora-169ffc`

Pieza: la fila de acciones de `UltimaRonda` (`apps/web/components/mi-plata/UltimaRonda.tsx`). «Ver lo que anoté» y «Mis envíos» pasan a ser
el botón secundario chico del sistema (`<Boton>` y `<BotonEnlace>` con `btn-chico`), sin flecha y juntos. En la tarjeta angosta (bajo 30 rem,
el celular) los tres botones se reparten el ancho de su renglón, de margen a margen; desde 30 rem van a su medida, con «Reabrir RC-…» a la
derecha, como antes (`components/mi-plata/ReabrirRonda.tsx`).

Medido: la tarjeta sola, a 1440×900 claro (estados, espacio, tipografía, color, movimiento, textos), 1440 oscuro (estados, color), 1440 vivo
y quieto (movimiento) y **350×750 táctil claro** (estados, espacio, tipografía), más una pasada de foco a 350 px (3 controles). ERP local
(`next dev` de esta rama). **La base local no tiene ninguna ronda de compra** (`retail.compra_rondas`: 0 filas), así que la tarjeta se dibujó
en un banco temporal (`/login-banco-…`, retirado antes del commit) con los datos de la captura de Felipe: RC-000008, 2 envíos, 1 con
diferencias, «Reabrir» disponible. La pantalla real, con una ronda de verdad, no se vio.

Resumen: **0 graves · 0 medias · 0 leves** en lo que cambió. **1 «revisar» decidido a propósito · 2 de antes, fuera de este cambio.**

## Graves
Ninguno.

## Medias
Ninguna.

## Leves
Ninguna.

## Lo que se midió del cambio
- **Caben en una fila a 350 px.** Fila útil de 276 px; a su medida, «Ver lo que anoté» 134 + separación 8 + «Mis envíos» 99 = 241 px. Antes,
  con las flechas, 158 + 20 + 120 = 298 px: no cabían y la tarjeta apilaba tres botones (493 px de alto; ahora 441).
- **Llenan el renglón, de margen a margen** (segunda vuelta, Felipe: «que ocupe todo el espacio, que se repartan»). A 350 px: «Ver lo que
  anoté» 151 + 8 + «Mis envíos» 117 = 276 px, y «Reabrir RC-000008» 276 px en su renglón. Cada uno crece lo mismo desde su medida (no son
  mitades: a 134 px justos, «Ver lo que anoté» no tendría holgura y bajo 350 px se cortaría). Sin scroll lateral.
- **En una tarjeta de 576 px, los tres en una fila a su medida** (134, 99 y 158 px): los dos que muestran a la izquierda, «Reabrir» a la derecha.
- **Tacto:** los tres miden 44 px de alto con el dedo y 40 con mouse; ningún blanco bajo 44 (`pointer: coarse`) ni bajo 24.
- **Letra:** los tres en 12,5 px (antes, «Mis envíos» iba en versalitas de 11 px: dos voces en una fila).
- **Color:** 14 textos medidos, 0 fallan, en claro y en oscuro. La tarjeta ya no gasta rojo (antes, 1: el enlace «Mis envíos»).
- **Foco:** 3 controles medidos; ninguno sin anillo, con anillo flojo ni tapado.
- **Movimiento:** 0 animaciones propias, vivo y quieto; el de los botones es el de `btn-cayla`.
- **Función:** «Ver lo que anoté» abre la hoja de la ronda; «Mis envíos» sigue llevando a `/compras/mi-plata/envios`.

## Decidido a propósito
- **«Ver lo que anoté» y «Mis envíos» sin la flecha de `<BotonVer>` / `<EnlaceVer>`** (Felipe 2026-11-17, mirando la captura a 350 px). Es una
  excepción de esta tarjeta a `accion.ver` (ADR-0358): la pieza no cambia.
- `esperaEscritaAMano` marcó «Reabrir RC-000008 / Reabriendo…»: es `<Boton cargando textoCargando>`, la pieza del sistema
  (`components/mi-plata/ReabrirRonda.tsx:51`). No es hallazgo.

## De antes, fuera de este cambio
- `py-3.5` (14 px) en el bloque de cifras de la tarjeta: fuera de la escala de 4 px. Va a `/espacio`.
- El chip «1 con diferencias» dio 4,33:1 en el peor fondo posible y 5,85:1 en el mejor (el medidor no pudo fijar el fondo: no concluyente).
  Es `<Chip>`, lo mide `lib/vidrio-contraste.test.ts`. Va a `/color` si se confirma.

## Sin medir
- La pantalla real con una ronda cerrada de verdad (no hay en la base local).
- Monto con espacio partible («S/ 4,514.00»): el medidor lo marcó sobre el dato inventado del banco, no sobre el formato real.
- Anchos de tarjeta entre 318 y 576 px: por la suma de anchos, los tres botones entran en una fila desde 407 px útiles (447 px de tarjeta);
  entre 447 y 480 px de tarjeta (30 rem) van los tres en una fila repartiéndose el ancho, y desde 480 px, a su medida.
- Color y movimiento no se repitieron en la segunda vuelta: solo cambió el ancho de los botones.
