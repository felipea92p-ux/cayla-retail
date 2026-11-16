# Al milímetro · «Poner un %» (PR #1898, ADR-0669)

**Fecha:** 2026-11-16 · **Rama:** `claude/rebaja-rapida-por-prenda` · **Modo:** `auditar`
**Dónde:** `/productos/campanas`, ERP local (puerto 3077) sobre una copia de la base con todas las migraciones. Prenda de prueba
`PAN-0001-BEI-28` (Pantalón Carla), Tienda Lima, con su cajón «−20 %» y dos campañas con descuento de siempre.

## Piezas auditadas

| Pieza | Archivo | Piezas del sistema que usa |
|---|---|---|
| El escáner | `components/rebajas/PonerUnPct.tsx` | `<Buscador tamano="mostrador">`, `<ListaSugerencias>` |
| La hoja de la prenda | `components/rebajas/HojaRebaja.tsx` | `<Modal tamano="mediana">`, `pildora-cayla`, `<Interruptor>`, `<Boton cargando>`, `<PieAcciones>`, la guía de foco |
| «Rebajas de Tienda Lima» | `components/rebajas/RebajasDeTienda.tsx` | `<TituloSeccion cuenta>`, `<TarjetaCifra compacta activa>` |
| El cajón de un % | `RebajasDeTienda.tsx` (`PrendasDeRebaja`) | `<Cajon>`, `<Aviso>`, `<Vacio>`, `<Boton peso="peligro" cargando>` |

## Números

**0 graves · 0 medias · 0 leves** en lo nuevo.

| Medidor | 1440 claro | 375 con el dedo | 1440 oscuro | quieto / vivo |
|---|---|---|---|---|
| Estados | 0 apagados, 0 errores; la tarjeta abierta lleva `aria-pressed="true"` | 0 apagados | — | 0 bucles propios |
| Foco (`{ foco: true }`) | hoja 10/10, lista 3/3, cajón 8/8 con anillo; 0 tapados | — | — | — |
| Espacio | 0 blancos bajo 24 px | 0 blancos bajo 44 px; sin desborde (375 = 375) | — | — |
| Tipografía | 0 textos de lectura bajo 14 px; 0 etiquetas bajo 11 px | ídem | — | — |
| Color | 0 textos fallan (hoja 21, cajón 38) | — | 0 textos fallan; 0 APCA débiles | — |
| Movimiento | — | — | — | Los 5 bucles de la página son del aviso de cierre de caja (ADR-0359) |
| Textos | sin fallas medibles | — | — | — |

## Lo que el medidor marcó y es de una pieza decidida

- **El escáner sin borde (relleno 1,11:1).** Es el pozo de `<Buscador tamano="mostrador">` (ADR-0596, «lo hundido espera tu dato»): se dibuja
  con una sombra interior que el medidor no lee. El de Vender tiene la misma cara (`buscador mostrador`, fondo 5 % y la misma sombra).
- **El interruptor apagado (1,11:1).** `<Interruptor>` del sistema (decidido 2026-10-13).
- **«Poner el %» / «Quitar» con su «Guardando…» al lado.** Es `<Boton cargando>`: apila las dos palabras en la misma celda para no cambiar de ancho.
  El «no concluyente» de 1,12:1 es la palabra escondida sobre la gota.
- **El globito «3» sin cifras tabulares.** `titulo-cuenta` en DM Sans: la propuesta 1 de `/tipografia`.

## Heredado de la página (no es de este PR)

La pila «Rigen hoy» (34 px adentro contra 26 afuera), el título de `<Vacio>` (interlineado 1,20), las versalitas de 9,5 px del pase y el
chip «No sale en la portada» de 13 px.

## Sin medir

- La hoja en oscuro con el dedo y el cajón a 375 px (sí la hoja a 375 en claro).
- Lo que pide guardar: «Guardando…» visto en vivo, el error de la base y el doble clic con los medidores. La concurrencia y los valores
  fuera de rango sí están probados contra la base (`pnpm pruebas:rebaja-rapida`).
- `tema:auditar`, `guias:recorrer` y `/chaos` completo.
