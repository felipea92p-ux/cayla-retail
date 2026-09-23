# Aviario — de qué pájaro es cada tabla

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — lo reescribe `pnpm datos:aviario`.
> Para darle pájaro a una tabla se edita `scripts/datos/aviario.mjs`. Para apuntarte a un
> pájaro, `docs/datos/07-GOBIERNO.md` §1: el pájaro es el puesto, quién lo lleva se dice allá.
>
> **Origen:** volcado de producción (`retail_columnas.json`) · **Tablas y vistas:** 94 · **Sin pájaro:** 0

## Por pájaro

| # | Pájaro | Módulo | Tablas |
|---|---|---|---|
| 01 | **Ganso** | Identidad y acceso | `colaboradores` · `colaboradores_historial` · `colaboradores_suspendidos` · `modulos` · `rol_modulos` · `roles` · `roles_historial` · `terminales` · `ubicaciones` |
| 02 | **Loro** | Catálogo y vocabulario | `categoria_patrones` · `categoria_tallas` · `categoria_tejidos` · `categorias` · `codigos_barras` · `codigos_correlativos` · `colores` · `etiqueta_categorias` · `etiquetas` · `familias` · `historial_producto_cambios` · `marca_proveedores` · `marcas` · `patrones` · `producto_fotos` · `productos` · `tallas` · `tejidos` · `variante_etiquetas` · `variantes` |
| 03 | **Tucán** | Taxonomía universal | *sin tablas hoy* |
| 04 | **Golondrina** | Importación de catálogo | *sin tablas hoy* |
| 05 | **Halcón** | Inventario y movimientos | `costo_historial` · `envio_extras` · `envio_traslados` · `envios` · `lotes` · `movimientos` · `prendas_danadas` · `stock` · `sububicaciones` · `transferencia_items` · `transferencia_recepciones` · `transferencias` |
| 06 | **Lechuza** | Conteo y censo físico | `conteo_items` · `conteos` |
| 07 | **Colibrí** | Ventas y caja | `apartados` · `caja_movimientos` · `cajas` · `cambios` · `clientas` · `codigos_descuento` · `devolucion_items` · `devoluciones` · `pedidos_no_atendidos` · `separacion_correlativos` · `separacion_items` · `separacion_pagos` · `separaciones` · `venta_anulacion_items` · `venta_items` · `venta_pagos` · `ventas` |
| 08 | **Cuervo** | Facturación SUNAT | `comprobantes` · `configuracion_empresa` · `proformas` · `series_comprobantes` · `ubicacion_datos_fiscales` |
| 09 | **Pelícano** | Compras y proveedores | `compra_adjuntos` · `compra_item_cierres` · `compra_item_destinos` · `compra_item_reparto_resumen` · `compra_items` · `compra_items_resumen` · `compra_notas_credito` · `compra_pagos` · `compra_reasignaciones` · `compras` · `compras_resumen` · `proveedor_creditos` · `proveedores` |
| 10 | **Gallito** | Producción del Taller | `comprobantes_produccion` · `comprobantes_produccion_cierres` · `comprobantes_produccion_items` · `comprobantes_produccion_pagos` · `comprobantes_produccion_recepciones` · `cotizaciones_maquila` · `insumo_lotes` · `insumos` · `movimientos_insumo` · `produccion_lineas` · `producciones` · `proveedores_produccion` · `v_insumo_saldos` |
| 11 | **Garza** | Finanzas operativas | `gastos` · `planilla_por_sede` |
| 12 | **Urraca** | Contabilidad | `activos_fijos` |
| 13 | **Águila** | Inteligencia y reportes | *sin tablas hoy* |
| 14 | **Gorrión** | Plataforma y esquema | *sin tablas hoy* |

## Por tabla

Tienes un nombre de tabla, quieres el pájaro.

| Tabla | Pájaro |
|---|---|
| `activos_fijos` | 12 · Urraca |
| `apartados` | 07 · Colibrí |
| `caja_movimientos` | 07 · Colibrí |
| `cajas` | 07 · Colibrí |
| `cambios` | 07 · Colibrí |
| `categoria_patrones` | 02 · Loro |
| `categoria_tallas` | 02 · Loro |
| `categoria_tejidos` | 02 · Loro |
| `categorias` | 02 · Loro |
| `clientas` | 07 · Colibrí |
| `codigos_barras` | 02 · Loro |
| `codigos_correlativos` | 02 · Loro |
| `codigos_descuento` | 07 · Colibrí |
| `colaboradores` | 01 · Ganso |
| `colaboradores_historial` | 01 · Ganso |
| `colaboradores_suspendidos` | 01 · Ganso |
| `colores` | 02 · Loro |
| `compra_adjuntos` | 09 · Pelícano |
| `compra_item_cierres` | 09 · Pelícano |
| `compra_item_destinos` | 09 · Pelícano |
| `compra_item_reparto_resumen` | 09 · Pelícano |
| `compra_items` | 09 · Pelícano |
| `compra_items_resumen` | 09 · Pelícano |
| `compra_notas_credito` | 09 · Pelícano |
| `compra_pagos` | 09 · Pelícano |
| `compra_reasignaciones` | 09 · Pelícano |
| `compras` | 09 · Pelícano |
| `compras_resumen` | 09 · Pelícano |
| `comprobantes` | 08 · Cuervo |
| `comprobantes_produccion` | 10 · Gallito |
| `comprobantes_produccion_cierres` | 10 · Gallito |
| `comprobantes_produccion_items` | 10 · Gallito |
| `comprobantes_produccion_pagos` | 10 · Gallito |
| `comprobantes_produccion_recepciones` | 10 · Gallito |
| `configuracion_empresa` | 08 · Cuervo |
| `conteo_items` | 06 · Lechuza |
| `conteos` | 06 · Lechuza |
| `costo_historial` | 05 · Halcón |
| `cotizaciones_maquila` | 10 · Gallito |
| `devolucion_items` | 07 · Colibrí |
| `devoluciones` | 07 · Colibrí |
| `envio_extras` | 05 · Halcón |
| `envio_traslados` | 05 · Halcón |
| `envios` | 05 · Halcón |
| `etiqueta_categorias` | 02 · Loro |
| `etiquetas` | 02 · Loro |
| `familias` | 02 · Loro |
| `gastos` | 11 · Garza |
| `historial_producto_cambios` | 02 · Loro |
| `insumo_lotes` | 10 · Gallito |
| `insumos` | 10 · Gallito |
| `lotes` | 05 · Halcón |
| `marca_proveedores` | 02 · Loro |
| `marcas` | 02 · Loro |
| `modulos` | 01 · Ganso |
| `movimientos` | 05 · Halcón |
| `movimientos_insumo` | 10 · Gallito |
| `patrones` | 02 · Loro |
| `pedidos_no_atendidos` | 07 · Colibrí |
| `planilla_por_sede` | 11 · Garza |
| `prendas_danadas` | 05 · Halcón |
| `produccion_lineas` | 10 · Gallito |
| `producciones` | 10 · Gallito |
| `producto_fotos` | 02 · Loro |
| `productos` | 02 · Loro |
| `proformas` | 08 · Cuervo |
| `proveedor_creditos` | 09 · Pelícano |
| `proveedores` | 09 · Pelícano |
| `proveedores_produccion` | 10 · Gallito |
| `rol_modulos` | 01 · Ganso |
| `roles` | 01 · Ganso |
| `roles_historial` | 01 · Ganso |
| `separacion_correlativos` | 07 · Colibrí |
| `separacion_items` | 07 · Colibrí |
| `separacion_pagos` | 07 · Colibrí |
| `separaciones` | 07 · Colibrí |
| `series_comprobantes` | 08 · Cuervo |
| `stock` | 05 · Halcón |
| `sububicaciones` | 05 · Halcón |
| `tallas` | 02 · Loro |
| `tejidos` | 02 · Loro |
| `terminales` | 01 · Ganso |
| `transferencia_items` | 05 · Halcón |
| `transferencia_recepciones` | 05 · Halcón |
| `transferencias` | 05 · Halcón |
| `ubicacion_datos_fiscales` | 08 · Cuervo |
| `ubicaciones` | 01 · Ganso |
| `v_insumo_saldos` | 10 · Gallito |
| `variante_etiquetas` | 02 · Loro |
| `variantes` | 02 · Loro |
| `venta_anulacion_items` | 07 · Colibrí |
| `venta_items` | 07 · Colibrí |
| `venta_pagos` | 07 · Colibrí |
| `ventas` | 07 · Colibrí |
