# ADR-0323 · La grilla de Vender pasa a una tarjeta por prenda, con «Todo de la prenda»

- **Fecha:** 2026-10-03 · **Estado:** construido en la rama `claude/pos-grid-variant-layout-3dd71c`. Solo web, sin migración.
- **Pedido:** Felipe, 2026-10-03: «¿es ideal que salgan todas las variantes dispersas por color o es mucho mejor que la grilla se muestre igual
  que el catálogo, que se haga clic y te muestre todas las variaciones entre colores y tallas de esa prenda?». Vio la maqueta
  (`docs/maquetas/grilla-vender-2026-10/`) y aprobó: «me gusta; el modal, más acorde al sistema; solo cambia la grilla tal cual; super responsive».
- **Reemplaza:** la decisión del 2026-09-14 («una tarjeta por PRENDA + COLOR, con las tallas adentro», cabecera de `lib/catalogo-grupos.ts`) y
  `ElegirTallaModal` (un color a la vez). **Respeta:** ADR-0043 (el padre es dueño del negocio; la tarjeta solo guarda el color que se mira),
  ADR-0136 (movimiento), ADR-0185 (la página no se encoge), D-40 / ADR-0321 (el almacén de la sede no es «agotado»).

## Qué había (medido en producción, solo lectura, 2026-10-03)

- Tienda TRU, piso con stock disponible: **34 prendas daban 114 tarjetas, con 1,04 tallas por tarjeta.** El motivo de agrupar por color
  («las tallas adentro») casi no se cumplía: cada tarjeta era, en la práctica, una variante. Con «Solo con stock» apagado: 97 prendas, 419 tarjetas.
- **Los colores de una prenda salían repartidos por la grilla.** `getCatalogo()` ordena por `sku`, vacío en 725 variantes activas, y desempata
  por `id` (`uuid` al azar): 91 de 97 prendas quedaban partidas en varios bloques.
- Solo 5 de las 114 tarjetas tenían foto de su color: lo que distingue los colores es el mosaico (`MosaicoPrenda`).

## Decidí

1. **Una tarjeta por prenda, ordenadas por nombre** (`agruparPorPrenda`, pura y probada). Adentro, un grupo por color: el `agruparCatalogo` de
   siempre, que siguen usando otras pantallas.
2. **Los puntos eligen el color; debajo va lo que falta elegir.** Prenda con tallas: las tallas del color elegido (tocarla agrega). Talla única
   («Estándar», «Única»): «Agregar · Negro». Con color y talla conocidos siguen siendo dos toques, sin ventana. En escritorio, pasar el mouse por
   un punto anticipa el color; las flechas recorren el grupo. Hasta 5 puntos a la vista (caben en la tarjeta de un celular de 320 px); con más,
   4 y un «+N» que abre la ventana. El color elegido siempre está a la vista (`puntosAVista`).
3. **Tocar la prenda abre «Todo de la prenda»** (`OpcionesDePrendaModal`, `<Modal variante="hoja">`): a la izquierda, la prenda grande en el color
   que se mira; a la derecha, cada color con sus tallas (aquí, en el almacén, apartada, dónde más hay), primero lo que se cobra aquí. Tocar una
   talla agrega y **la ventana se queda abierta** (el cliente que lleva dos colores no la abre dos veces); la casilla dibuja un visto. Una talla del
   almacén cierra la ventana para que el aviso de la bajada (ADR-0321) no quede tapado. «Anotar que no había» va al pie, del color que se mira.
4. **«Solo con stock» filtra por color** (`filtrarConStock`): esconde los colores sin piso y la prenda que se queda sin ninguno. El contador cuenta
   colores: «32 colores ocultos (20 con stock en el almacén)».
5. **Responsive por contenedor, no por ventana:** de 2 a 5 columnas según el ancho del catálogo; en «Todo de la prenda», la foto pasa de franja
   (celular) a columna fija (desde `sm`), y las casillas pasan a tres por fila con el texto corto («4 alm.») cuando la lista es angosta.
6. **Tocar la prenda ya no agrega directo** aunque tenga una sola talla vendible (lo hacía desde el 2026-09-18): la tarjeta trae sus propias tallas
   y «Agregar», y tocar la prenda es mirar todo. Una sola regla para todas las tarjetas.

## Descarté

- **Copiar el catálogo tal cual** (la tarjeta solo abre la vista rápida): con la prenda en la mano y la etiqueta que no lee, sumaba un paso donde
  hay cola. La vista rápida de Productos es una tabla sin botón de agregar.
- **Dejar la grilla por color y solo ordenarla:** arreglaba el desorden pero seguían siendo 3,4 tarjetas por prenda y ningún lugar donde ver
  «¿lo tienes en otro color?».

## Movimiento (ADR-0136)

Solo en respuesta a un toque: fundido entre colores (300 ms), tallas que entran en cascada corta (40 ms de desfase), visto que se dibuja y se
apaga, globito que se reasienta. Sin rebote ni bucle; con movimiento reducido todo se colapsa a un instante (`app/estilos/vender-grilla.css`).

## Verificación

- `lib/catalogo-grupos.test.ts` (20 casos, 9 nuevos: orden, filtro por color, color inicial, puntos a la vista, resumen). `lib/apartada-cableado.test.ts`
  apunta ahora a `TarjetaPrenda.tsx` y `OpcionesDePrendaModal.tsx`. Suite completa: 319 archivos en verde; `tsc` y `eslint` limpios.
- Navegador, ERP local, Tienda Lima: tarjetas ordenadas, puntos que cambian color, tallas y stock sin abrir la ventana; «Todo de la prenda»
  agrega, marca y pasa la casilla a «1 en el almacén» al topar el piso; a 375 px sin desborde, tarjetas de 150 px y tres casillas por fila.
