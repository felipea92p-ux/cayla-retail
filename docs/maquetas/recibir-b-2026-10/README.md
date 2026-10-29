# Recibir mercadería · B v2 (2026-10-29)

Felipe eligió la dirección B («Viaje») del rediseño fiel (`../recibir-fiel-2026-10/`) y pidió mejorarla con **componentes nuevos**, sin
atarse a las piezas ya decididas: si un componente nuevo es mejor que el de hoy, se propone para reemplazarlo en todo el ERP después de implementarlo.

- `index.html`: el flujo completo, con las mismas funciones y los mismos toques que hoy (8 + la matriz en el camino feliz; el inventario
  de funciones está en `../recibir-fiel-2026-10/README.md`). **Desde el 2026-10-29 lleva las piezas finales que eligió Felipe** (Trayecto
  mejorado, Acordeón de categorías, Dial mejorado, Podio, Vitrina, Sello de lacre y Totales que ruedan); «Qué prendas son» y «Tallas y colores»
  siguen como estaban. Los estilos de las piezas vienen de `ronda3.css` y `opciones.css`; `final.css` solo las encaja en el flujo.
- `componentes.html`: los 9 componentes, cada uno vivo, junto a la pieza que reemplazaría y dónde más del ERP serviría.
- `opciones.html` (2026-10-29, **ronda 3**, la vigente): Felipe eligió el **Trayecto** del flujo y el **Dial** (aquí mejorados, con más animación) y el **Sello de lacre**; pidió rehacer categorías, qué prendas son, tallas, cierre, precio y barra de abajo: 3 opciones nuevas de cada una (Carrusel / Pastillas que se abren / Riel de nodos; Cartas boca abajo / Ríos / Polaroids; Burbujas / Chips que vuelan / Planilla; Anillos / Flujo / Podio; Medidor de margen / Vitrina / Monedas; Isla dinámica / Siguiente paso / Totales que ruedan).
- **Elegido por Felipe (ronda 3):** Trayecto mejorado, Dial mejorado (el número se toca y se escribe con el teclado; sin arrastrar el aro ni la rueda, a pedido suyo), Podio (cierre), Vitrina (precio), Sello de lacre (envío cerrado) y Totales que ruedan (barra de abajo).
- **Categorías, rehechas con su nota:** una categoría despliega las prendas que se anotaron en la compra para ver el detalle; no se cuenta «una más» a la categoría. Tres opciones: Acordeón, Pestañas con vitrina y Mapa de la compra.
- **Sin elegir:** qué prendas son y tallas y colores; quedan como estaban (Felipe: «hasta ahí nada más»).
- **En el ERP desde el 2026-10-29** (ADR-0575): Trayecto, Acordeón, Dial, Totales que ruedan, Podio, Vitrina y Sello de lacre.
- `ronda2.html` (2026-10-29, ronda 2, guardada): Felipe pidió otras opciones, más estéticas y animadas, para cada pieza. Hay 3 por pieza (27), todas tocables, con «Me gusta esta» y un resumen para copiar la elección. Las de esta página son alternativas a las de `componentes.html`, no se suman.

## Los 9 componentes propuestos

| # | Componente | Reemplazaría | Dónde más serviría |
|---|---|---|---|
| 1 | **Trayecto** | `<Chip>` de estado + columnas Enviado/Estado/Prendas de la tabla | Traslados, Pedidos web, Órdenes, Devoluciones |
| 2 | **Dial** (aro con un segmento por prenda; se gira, rueda, ↑ ↓) | número + `PasoCantidad` + barra de avance del conteo | Conteo, Ajustar stock, Contar envío de Traslados |
| 3 | **Riel de categorías** (lengüetas con su aro) | píldoras de categoría | Conteo por zona, Nuevo producto, Plan de campaña |
| 4 | **Bandeja de identificación** (la barra se tiñe con cada prenda) | lista «¿Qué … son?» | Apartados, Cambios, «Separar» |
| 5 | **Tablero de tallas** (se toca la talla; dañadas como modo) | `MatrizRecepcion` con `PasoCantidad` por celda | Ajustar stock, Nuevo producto |
| 6 | **Cinta de cierre** (una barra a escala con la marca «dijeron» y causas con dibujo) | tabla de cierre + `BarraApilada` | Cierre de caja, Conteo, Traslado recibido |
| 7 | **Etiqueta de precio** (precio, costo y lo que se gana) | campos «Costo» / «Precio de venta» | Nuevo/Editar producto, Liquidación, Apunte de compras |
| 8 | **Talón de recepción** + «Lo que sigue» | sello + 4 `TarjetaCifra` + tarjetas sueltas | Cierre de caja, Traslado recibido |
| 9 | **Isla con hilo** (avance en el borde) | `BarraDeAbajo` sin avance | Vender, Conteo, Nuevo producto |

## Lo que se cuidó

- **Mismos clics.** El Tablero de tallas cambia «+» de 32 px por la celda entera (un toque, una prenda): mismo número de toques, blanco
  más grande. El Dial suma formas (girar, rueda, flechas) sin quitar los botones ni los atajos.
- **Letra de 14 px como mínimo**, explicaciones largas detrás de un ⓘ, colores solo de tokens (la etiqueta de precio es papel: lleva
  tokens fijos, no se oscurece), modo oscuro y 375 px revisados.
- **Movimiento**: una vez, sin rebote y sin bucle (la prenda que vuela a su fila, el aro que se llena, el sello, la cinta que crece).

## Antes de construirlo

1. Felipe elige qué componentes entran al sistema (pasa por `/unificar`: cada uno elegido reemplaza su pieza en `docs/unificar/` y
   `lib/unificar.test.ts`, y la deuda de migrar el resto se cuenta).
2. Las guías de Recibir (`/guia`) y la guía de foco se ponen al día con los controles nuevos.
3. Riesgos a probar con colaboradoras reales: girar el Dial sin querer (solo responde al aro, no al número) y tocar una celda de más en el
   Tablero (el «−» de la esquina y las casillas de arriba lo hacen visible).
