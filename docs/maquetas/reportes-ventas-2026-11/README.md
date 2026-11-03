# Maqueta · Ventas ▸ Reportes (2026-11-02)

> **Estado: en revisión con Felipe.** Solo maqueta: no hay migración, ni código del ERP, ni cambio en producción.
> Todos los datos (tiendas, personas, prendas, cifras) son **inventados**.

`index.html`: un solo archivo sobre el marco del ERP ya elegido (`../vidrio-base-2026-10/`). Se abre con la config `maqueta-referentes`
del navegador integrado (`.claude/launch.json`) en `http://localhost:3031/reportes-ventas-2026-11/index.html`: abierto con doble clic no
carga el marco. La barra negra de arriba cambia de pantalla, la cara del ranking, el tema y el ancho (320, 375, 768, 1024, 1280, 1440, 1920).

## Decisiones de Felipe del 2026-11-03 que la maqueta todavía NO refleja (mandan sobre ella)

- **Dónde vive:** Ventas ▸ Reportes, como séptima hija del menú de Ventas (excepción nueva al tope de 6) y módulo propio `reportes_ventas`, que nace solo para el líder.
- **Sin «Por vendedor»:** las personas se quedan en Rendimiento. La tabla se corta por tienda y por categoría.
- **El ranking es la cara A (tabla):** la vitrina no se construye.
- **Historia real:** la primera venta real de producción es del 2026-09-30, no de agosto; el «mes a mes» muestra hasta 12 meses y solo los que tienen ventas. «Vs el año pasado» aparece cuando exista ese mes.
- **Solo tiendas en la versión 1:** las ventas de la tienda web todavía no están en `retail.ventas`.
- **El Historial ya se descarga** (CSV, solo el líder): la descarga de Reportes sigue ese patrón.

## Por qué

Pedido (Felipe, 2026-11-02): «al sistema le falta reportes, como reporte de venta mensual y ranking de prendas que más se venden, con sus filtros».
Lo que ya existe cubre pedazos, no el reporte:

| Pantalla | Qué da | Qué le falta |
|---|---|---|
| Ventas ▸ Historial | ventas por día o semana de un rango, ticket, prendas, anuladas, cómo se pagó | comparar mes contra mes; cortar por tienda, categoría o vendedor; descargar |
| Análisis ▸ Qué pedir | «Lo que más se vende» (5 a 20 modelos) y «Lo que más rinde» | solo mira «mis días de ventas» (hasta 30); filtra solo por tipo; no descarga; es una pregunta de inventario |
| Finanzas ▸ Estados financieros | resultados del mes y CSV para el contador | es contabilidad y dinero; no habla de prendas |

## Lo que propone

Una hija nueva de Ventas, **Reportes** (después de Historial), con dos pestañas:

1. **Ventas del mes.** Selector de mes y de tienda; cinco cifras (vendido, ventas, ticket, prendas, devuelto) contra el mes pasado; ventas por
   día con la raya del promedio del mes pasado; mes a mes (tocar un mes lo elige); cómo pagaron; y una tabla que se corta por tienda,
   categoría o vendedor. El mes en curso dice «a la fecha» y se compara contra los **mismos días** del mes anterior (no contra el mes entero).
2. **Ranking de prendas.** Fechas (octubre, septiembre, últimos 30 o 90 días, a tu medida), tienda, categoría, marca, talla y color; por modelo
   o por color y talla; por unidades o por soles. A la derecha (debajo en pantallas medianas), qué tallas y colores se llevan **con esos mismos
   filtros**. Cada fila trae «vs período anterior» y «Quedan N» (en ámbar si alcanza para menos de 14 días: lleva a Análisis).

Todo se toca: los filtros son los combos reales del marco, los chips de filtros puestos se quitan, «Limpiar todo» los borra y el estado
vacío dice qué filtro hay que quitar. «Descargar» solo muestra el aviso (la maqueta no baja nada).

## Lo que Felipe elige mirando

**El ranking como A · Tabla o B · Vitrina** (botón de arriba). La tabla se lee y se descarga mejor; la vitrina (los tres primeros grandes, el
resto en cuadrícula) se entiende en cinco segundos y se parece a la prenda en el piso. La elegida es la única; la otra se borra.

## Piezas ya decididas que usa (no se inventó ninguna)

`<EncabezadoPagina>` (ADR-0220) · `<TarjetaCifra>` «Placa Serena» · pestañas «La gota de Mi perfil» · buscador «Pozo» · combos «Gota viajera»
(`DesplegablePildora`) · `<SelectorMes>` · `<BarrasTiempo>` · `<BarraApilada>` · `<Chip>` · `<FiltroPuesto>` y `<BotonLimpiar>` · `<Paginas>` ·
`<Vacio>` · `<BotonDescargar>` · la prenda sin foto como `MosaicoPrenda` (ADR-0333). Solo tokens; los colores de prenda y de medio de pago son
dato (`tema-fijo`).

## Decisiones abiertas de Felipe (cada una cambia qué se construye)

1. **Dónde vive.** Propuesta: Ventas ▸ Reportes, módulo nuevo `reportes_ventas`, que nace solo para el líder (ADR-0161). Alternativa: una
   pestaña más dentro de Análisis (más cerca de «qué pedir», pero mezcla un reporte de ventas con decisiones de inventario).
2. **Qué cuenta como venta.** Propuesta: cobradas, sin anuladas ni de prueba; una devolución o un cambio resta en el mes en que se hizo, no en
   el de la venta; la bolsa cuenta en el reporte de ventas y **no** entra al ranking (ADR-0377).
3. **«Por vendedor».** La maqueta lo muestra. Hay que decidir si usa la misma regla que Rendimiento (ADR-0325, donde CLAUDE ya quedó fuera de
   metas) o si el reporte no desglosa personas. Es una cifra por persona: mejor que sea del líder.
4. **Costo y margen no se muestran.** Siguen siendo del líder dentro de Análisis (ADR-0328).
5. **Excel.** Propuesta: CSV con una fila por lo que se ve en pantalla (el corte elegido, no todo el catálogo), mismo patrón que
   `finanzas/reportes/descargar`.
6. **Quién ve qué tienda.** Una cuenta de tienda vería solo la suya (como Compras por tienda, ADR-0184); el líder y el Admin, todas.

## Lo que se construiría después de elegir (en este orden)

1. Reportes ▸ Ventas del mes (una RPC de solo lectura, el módulo en Roles y accesos, la guía interactiva y la guía de foco de los filtros).
2. Reportes ▸ Ranking de prendas (otra RPC de lectura; reutiliza el selector, la tabla y la descarga de la primera).
3. Descarga CSV de las dos.
4. Pruebas: reglas puras en `lib/reportes-ventas-reglas.ts` con su prueba, y la RPC contra Postgres (`pnpm pruebas:*`).

Nada de esto se construye hasta que Felipe apruebe la maqueta.
