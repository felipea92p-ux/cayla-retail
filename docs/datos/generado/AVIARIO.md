# Aviario — de qué pájaro es cada tabla

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — lo reescribe `pnpm datos:aviario`.
> Para darle pájaro a una tabla se edita `scripts/datos/aviario.mjs`. Para apuntarte a un
> pájaro, `docs/datos/07-GOBIERNO.md` §1: el pájaro es el puesto, quién lo lleva se dice allá.
>
> **Origen:** volcado de producción (`retail_columnas.json`) · **Tablas y vistas:** 166 · **Sin pájaro:** 0

## Por pájaro

| # | Pájaro | Módulo | Tablas |
|---|---|---|---|
| 01 | **Ganso** | Identidad y acceso | `acciones_sin_responsable` · `colaboradores` · `colaboradores_historial` · `colaboradores_suspendidos` · `lider_modulos_ocultos` · `modulos` · `rol_modulos` · `roles` · `roles_historial` · `terminales` · `ubicaciones` |
| 02 | **Loro** | Catálogo y vocabulario | `catalogo_version` · `categoria_patrones` · `categoria_tallas` · `categoria_tejidos` · `categorias` · `codigos_barras` · `codigos_correlativos` · `colores` · `etiqueta_categorias` · `etiquetas` · `familias` · `historial_producto_cambios` · `marca_proveedores` · `marcas` · `patrones` · `producto_color_temporadas` · `producto_fotos` · `producto_origen` · `productos` · `tallas` · `tejidos` · `temporada_fechas` · `temporadas` · `variante_etiquetas` · `variantes` |
| 03 | **Tucán** | Taxonomía universal | *sin tablas hoy* |
| 04 | **Golondrina** | Importación de catálogo | *sin tablas hoy* |
| 05 | **Halcón** | Inventario y movimientos | `ajustes_inventario_intentos` · `bajada_piso_items` · `bajadas_en_mano` · `bajadas_piso` · `capacidad_piso` · `categoria_grupo_mix` · `costo_historial` · `cuadre_piso_items` · `cuadres_piso` · `envio_extras` · `envio_traslados` · `envios` · `frescura_decisiones` · `grupos_mix` · `lotes` · `movimientos` · `movimientos_internos_intentos` · `prendas_danadas` · `prendas_para_enviar` · `prendas_para_enviar_salidas` · `stock` · `sububicaciones` · `transferencia_items` · `transferencia_recepciones` · `transferencias` |
| 06 | **Lechuza** | Conteo y censo físico | `conteo_items` · `conteos` |
| 07 | **Colibrí** | Ventas y caja | `apartados` · `apartados_opciones` · `caja_movimientos` · `caja_traslados` · `cajas` · `cambios` · `campana_efecto_caja` · `cierres_cola_arranque` · `clientas` · `clientas_fusiones` · `club_aniversario_escala` · `club_avisos_enviados` · `club_canjes` · `club_etiquetas` · `club_intentos_registro` · `club_invitaciones` · `club_permisos` · `club_textos` · `codigos_descuento` · `cola_arranque_plazo` · `configuracion_historial` · `devolucion_items` · `devoluciones` · `metas_persona_ajustes` · `pedidos_no_atendidos` · `prendas_por_regularizar` · `separacion_abonos` · `separacion_avisos` · `separacion_correlativos` · `separacion_ediciones` · `separacion_items` · `separacion_items_retirados` · `separacion_pagos` · `separacion_pedidos` · `separaciones` · `ubicacion_metas_dia` · `venta_anulacion_items` · `venta_items` · `venta_pagos` · `ventas` |
| 08 | **Cuervo** | Facturación SUNAT | `comprobante_anticipos` · `comprobantes` · `configuracion_empresa` · `proformas` · `respaldo_b002_renumeradas_20261002` · `series_comprobantes` · `ubicacion_datos_fiscales` |
| 09 | **Pelícano** | Compras y proveedores | `compra_adjuntos` · `compra_item_cierres` · `compra_item_destinos` · `compra_item_reparto_resumen` · `compra_items` · `compra_items_resumen` · `compra_notas_credito` · `compra_pagos` · `compra_parte_por_tienda` · `compra_reasignaciones` · `compradores_de_tienda` · `compras` · `compras_resumen` · `planes_compra` · `planes_compra_lineas` · `proveedor_creditos` · `proveedores` |
| 10 | **Gallito** | Producción del Taller | `comprobantes_produccion` · `comprobantes_produccion_cierres` · `comprobantes_produccion_items` · `comprobantes_produccion_pagos` · `comprobantes_produccion_recepciones` · `cotizaciones_maquila` · `insumo_lotes` · `insumos` · `movimientos_insumo` · `produccion_etapas_historial` · `produccion_lineas` · `producciones` · `proveedores_produccion` · `v_insumo_saldos` |
| 11 | **Garza** | Finanzas operativas | `categorias_gasto` · `conciliaciones` · `cuentas_asignadas` · `cuentas_dinero` · `dinero_revisados` · `egresos_no_gasto` · `gastos` · `gastos_fijos` · `gastos_fijos_descartados` · `gastos_legado_2026_09` · `medios_de_cobro` · `movimientos_dinero` · `parametros_finanzas` · `planilla_por_sede` · `presupuestos` |
| 12 | **Urraca** | Contabilidad | `activos_fijos` · `cuentas` · `diario_cerrado` · `parametros_tributarios` · `periodo_cierres` · `periodos` · `saldos_iniciales` · `tipos_activo` |
| 13 | **Águila** | Inteligencia y reportes | `actividad` |
| 14 | **Gorrión** | Plataforma y esquema | `huellas_llave` |

## Por tabla

Tienes un nombre de tabla, quieres el pájaro.

| Tabla | Pájaro |
|---|---|
| `acciones_sin_responsable` | 01 · Ganso |
| `actividad` | 13 · Águila |
| `activos_fijos` | 12 · Urraca |
| `ajustes_inventario_intentos` | 05 · Halcón |
| `apartados` | 07 · Colibrí |
| `apartados_opciones` | 07 · Colibrí |
| `bajada_piso_items` | 05 · Halcón |
| `bajadas_en_mano` | 05 · Halcón |
| `bajadas_piso` | 05 · Halcón |
| `caja_movimientos` | 07 · Colibrí |
| `caja_traslados` | 07 · Colibrí |
| `cajas` | 07 · Colibrí |
| `cambios` | 07 · Colibrí |
| `campana_efecto_caja` | 07 · Colibrí |
| `capacidad_piso` | 05 · Halcón |
| `catalogo_version` | 02 · Loro |
| `categoria_grupo_mix` | 05 · Halcón |
| `categoria_patrones` | 02 · Loro |
| `categoria_tallas` | 02 · Loro |
| `categoria_tejidos` | 02 · Loro |
| `categorias` | 02 · Loro |
| `categorias_gasto` | 11 · Garza |
| `cierres_cola_arranque` | 07 · Colibrí |
| `clientas` | 07 · Colibrí |
| `clientas_fusiones` | 07 · Colibrí |
| `club_aniversario_escala` | 07 · Colibrí |
| `club_avisos_enviados` | 07 · Colibrí |
| `club_canjes` | 07 · Colibrí |
| `club_etiquetas` | 07 · Colibrí |
| `club_intentos_registro` | 07 · Colibrí |
| `club_invitaciones` | 07 · Colibrí |
| `club_permisos` | 07 · Colibrí |
| `club_textos` | 07 · Colibrí |
| `codigos_barras` | 02 · Loro |
| `codigos_correlativos` | 02 · Loro |
| `codigos_descuento` | 07 · Colibrí |
| `cola_arranque_plazo` | 07 · Colibrí |
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
| `compra_parte_por_tienda` | 09 · Pelícano |
| `compra_reasignaciones` | 09 · Pelícano |
| `compradores_de_tienda` | 09 · Pelícano |
| `compras` | 09 · Pelícano |
| `compras_resumen` | 09 · Pelícano |
| `comprobante_anticipos` | 08 · Cuervo |
| `comprobantes` | 08 · Cuervo |
| `comprobantes_produccion` | 10 · Gallito |
| `comprobantes_produccion_cierres` | 10 · Gallito |
| `comprobantes_produccion_items` | 10 · Gallito |
| `comprobantes_produccion_pagos` | 10 · Gallito |
| `comprobantes_produccion_recepciones` | 10 · Gallito |
| `conciliaciones` | 11 · Garza |
| `configuracion_empresa` | 08 · Cuervo |
| `configuracion_historial` | 07 · Colibrí |
| `conteo_items` | 06 · Lechuza |
| `conteos` | 06 · Lechuza |
| `costo_historial` | 05 · Halcón |
| `cotizaciones_maquila` | 10 · Gallito |
| `cuadre_piso_items` | 05 · Halcón |
| `cuadres_piso` | 05 · Halcón |
| `cuentas` | 12 · Urraca |
| `cuentas_asignadas` | 11 · Garza |
| `cuentas_dinero` | 11 · Garza |
| `devolucion_items` | 07 · Colibrí |
| `devoluciones` | 07 · Colibrí |
| `diario_cerrado` | 12 · Urraca |
| `dinero_revisados` | 11 · Garza |
| `egresos_no_gasto` | 11 · Garza |
| `envio_extras` | 05 · Halcón |
| `envio_traslados` | 05 · Halcón |
| `envios` | 05 · Halcón |
| `etiqueta_categorias` | 02 · Loro |
| `etiquetas` | 02 · Loro |
| `familias` | 02 · Loro |
| `frescura_decisiones` | 05 · Halcón |
| `gastos` | 11 · Garza |
| `gastos_fijos` | 11 · Garza |
| `gastos_fijos_descartados` | 11 · Garza |
| `gastos_legado_2026_09` | 11 · Garza |
| `grupos_mix` | 05 · Halcón |
| `historial_producto_cambios` | 02 · Loro |
| `huellas_llave` | 14 · Gorrión |
| `insumo_lotes` | 10 · Gallito |
| `insumos` | 10 · Gallito |
| `lider_modulos_ocultos` | 01 · Ganso |
| `lotes` | 05 · Halcón |
| `marca_proveedores` | 02 · Loro |
| `marcas` | 02 · Loro |
| `medios_de_cobro` | 11 · Garza |
| `metas_persona_ajustes` | 07 · Colibrí |
| `modulos` | 01 · Ganso |
| `movimientos` | 05 · Halcón |
| `movimientos_dinero` | 11 · Garza |
| `movimientos_insumo` | 10 · Gallito |
| `movimientos_internos_intentos` | 05 · Halcón |
| `parametros_finanzas` | 11 · Garza |
| `parametros_tributarios` | 12 · Urraca |
| `patrones` | 02 · Loro |
| `pedidos_no_atendidos` | 07 · Colibrí |
| `periodo_cierres` | 12 · Urraca |
| `periodos` | 12 · Urraca |
| `planes_compra` | 09 · Pelícano |
| `planes_compra_lineas` | 09 · Pelícano |
| `planilla_por_sede` | 11 · Garza |
| `prendas_danadas` | 05 · Halcón |
| `prendas_para_enviar` | 05 · Halcón |
| `prendas_para_enviar_salidas` | 05 · Halcón |
| `prendas_por_regularizar` | 07 · Colibrí |
| `presupuestos` | 11 · Garza |
| `produccion_etapas_historial` | 10 · Gallito |
| `produccion_lineas` | 10 · Gallito |
| `producciones` | 10 · Gallito |
| `producto_color_temporadas` | 02 · Loro |
| `producto_fotos` | 02 · Loro |
| `producto_origen` | 02 · Loro |
| `productos` | 02 · Loro |
| `proformas` | 08 · Cuervo |
| `proveedor_creditos` | 09 · Pelícano |
| `proveedores` | 09 · Pelícano |
| `proveedores_produccion` | 10 · Gallito |
| `respaldo_b002_renumeradas_20261002` | 08 · Cuervo |
| `rol_modulos` | 01 · Ganso |
| `roles` | 01 · Ganso |
| `roles_historial` | 01 · Ganso |
| `saldos_iniciales` | 12 · Urraca |
| `separacion_abonos` | 07 · Colibrí |
| `separacion_avisos` | 07 · Colibrí |
| `separacion_correlativos` | 07 · Colibrí |
| `separacion_ediciones` | 07 · Colibrí |
| `separacion_items` | 07 · Colibrí |
| `separacion_items_retirados` | 07 · Colibrí |
| `separacion_pagos` | 07 · Colibrí |
| `separacion_pedidos` | 07 · Colibrí |
| `separaciones` | 07 · Colibrí |
| `series_comprobantes` | 08 · Cuervo |
| `stock` | 05 · Halcón |
| `sububicaciones` | 05 · Halcón |
| `tallas` | 02 · Loro |
| `tejidos` | 02 · Loro |
| `temporada_fechas` | 02 · Loro |
| `temporadas` | 02 · Loro |
| `terminales` | 01 · Ganso |
| `tipos_activo` | 12 · Urraca |
| `transferencia_items` | 05 · Halcón |
| `transferencia_recepciones` | 05 · Halcón |
| `transferencias` | 05 · Halcón |
| `ubicacion_datos_fiscales` | 08 · Cuervo |
| `ubicacion_metas_dia` | 07 · Colibrí |
| `ubicaciones` | 01 · Ganso |
| `v_insumo_saldos` | 10 · Gallito |
| `variante_etiquetas` | 02 · Loro |
| `variantes` | 02 · Loro |
| `venta_anulacion_items` | 07 · Colibrí |
| `venta_items` | 07 · Colibrí |
| `venta_pagos` | 07 · Colibrí |
| `ventas` | 07 · Colibrí |

## En el aviario, pero no en el volcado de producción

Puede ser SQL que todavía no se pegó allá, o un volcado viejo que todavía no la conoce (cómo refrescarlo:
`COMO-REFRESCAR.md`). Si la tabla ya no existe, sobra en `scripts/datos/aviario.mjs`.

- `frescura_vara_cayla`
- `parametros_analisis`
