# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 479 llamadas `.rpc` de `apps/web` contra 919 funciones del schema `retail` en producción: 402 con los parámetros leídos (se comparan uno por uno), 52 directas cuyos parámetros no se pudieron leer (solo se comprueba que la función exista), 25 con el nombre en un ternario o una variable.
> **Foto de producción: 2026-10-09 23:26 UTC.** Todo lo de este archivo es tan fresco como esa foto: una función
> creada o cambiada DESPUÉS sale como «no existe», con parámetros de más o con un aviso de un parámetro que ya no existe, aunque en
> producción ya esté bien. Antes de dar una pantalla por rota, confirmarlo en producción; para refrescar la foto,
> `docs/datos/generado/COMO-REFRESCAR.md`.

> **Palabras de este informe.** *Foto*: la lista de funciones de producción que está en `funciones-produccion.txt`, tomada en la fecha
> de arriba. *Aviso*: la pantalla no manda un parámetro que la función acepta (normal si tiene valor por defecto). *Sobrecarga*: dos
> funciones con el mismo nombre y distinta lista de parámetros: una llamada por nombre queda ambigua. Las `fn_*` (649 en la
> foto: en su mayoría disparadores, candados de dinero y ayudantes que llaman otras funciones) se dejan fuera de «sin llamada» a
> propósito; 195 sí las nombra una pantalla y salen en las secciones de arriba, y a las otras 454 no las nombra ninguna pantalla y aquí no se listan.

---

## Llamadas sin respaldo en la foto de producción — 0

Nada. Todas las llamadas encajan con la firma de la foto.

## Sobrecargas — 0

Ninguna. Cada función tiene una sola firma en producción.

## Avisos — 38

- `fn_temporada_efectiva` · `apps/web/app/(app)/productos/atributos/page.tsx:42` — no manda `p_producto_id` (normal si tienen valor por defecto)
- `fn_existencias` · `apps/web/app/api/traslados/prendas-de-sede/route.ts:35` — no manda `p_producto_ids` (normal si tienen valor por defecto)
- `registrar_comprobante_produccion` · `apps/web/components/ComprobanteProduccionForm.tsx:120` — no manda `p_igv_porcentaje` (normal si tienen valor por defecto)
- `registrar_movimiento_dinero` · `apps/web/components/GastosPanel.tsx:623` — no manda `p_cuenta_origen_id`, `p_fecha`, `p_comision`, `p_caja_id` (normal si tienen valor por defecto)
- `recibir_insumo` · `apps/web/components/InsumoModales.tsx:151` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_consumo_insumo` · `apps/web/components/OrdenInsumos.tsx:125` — no manda `p_nota` (normal si tienen valor por defecto)
- `devolver_insumo_de_produccion` · `apps/web/components/OrdenInsumos.tsx:155` — no manda `p_nota` (normal si tienen valor por defecto)
- `asignar_temporadas` · `apps/web/components/ProductoForm.tsx:874` — no manda `p_solo_sin_temporada` (normal si tienen valor por defecto)
- `resolver_prenda_danada` · `apps/web/components/ResolverDanadosModal.tsx:125` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `fn_actividad` · `apps/web/components/actividad/ListaActividad.tsx:43` — no manda `p_hasta` (normal si tienen valor por defecto)
- `registrar_proveedor` · `apps/web/components/alta-producto/NuevaMarcaForm.tsx:224` — no manda `p_contacto`, `p_rubros`, `p_plazo_credito_dias`, `p_forma_pago_preferida`, `p_telefono`, `p_banco`, `p_cuenta_bancaria` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/components/apartados/ApartarVista.tsx:496` — no manda `p_estados` (normal si tienen valor por defecto)
- `censo_crear_variante` · `apps/web/components/conteo/AltaAlVuelo.tsx:95` — no manda `p_costo`, `p_precio` (normal si tienen valor por defecto)
- `fn_presupuesto_propuesta` · `apps/web/components/finanzas/ConfiguracionPresupuesto.tsx:115` — no manda `p_hoy` (normal si tienen valor por defecto)
- `buscar_clienta` · `apps/web/components/punto-de-venta/ClientaDelTicket.tsx:451` — no manda `p_incluir_archivadas` (normal si tienen valor por defecto)
- `registrar_adjunto_compra` · `apps/web/lib/adjuntos-compra.ts:87` — no manda `p_nota_credito_id` (normal si tienen valor por defecto)
- `fn_balance_general` · `apps/web/lib/balance.ts:33` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/lib/caja-tablero.ts:86` — no manda `p_texto`, `p_estados` (normal si tienen valor por defecto)
- `fn_productos` · `apps/web/lib/candidatas-alta-lector.ts:173` — no manda `p_busqueda`, `p_categoria_id`, `p_color_codigo`, `p_estado`, `p_precio_min`, `p_precio_max`, `p_stock`, `p_proveedor_id` (normal si tienen valor por defecto)
- `fn_productos` · `apps/web/lib/candidatas-alta-lector.ts:176` — no manda `p_busqueda`, `p_color_codigo`, `p_estado`, `p_precio_min`, `p_precio_max`, `p_stock`, `p_marca_id`, `p_proveedor_id` (normal si tienen valor por defecto)
- `fn_temporada_efectiva` · `apps/web/lib/catalogo-v2.ts:676` — no manda `p_producto_id` (normal si tienen valor por defecto)
- `fn_configuracion_tiendas` · `apps/web/lib/configuracion.ts:22` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_igv_credito_fiscal` · `apps/web/lib/deuda-consolidada.ts:34` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_gastos_lista` · `apps/web/lib/gastos.ts:103` — no manda `p_solo_empresa` (normal si tienen valor por defecto)
- `fn_activos_lista` · `apps/web/lib/gastos.ts:120` — no manda `p_corte` (normal si tienen valor por defecto)
- `fn_mis_ventas_del_dia` · `apps/web/lib/inicio.ts:67` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `fn_actividad` · `apps/web/lib/inicio.ts:185` — no manda `p_modulo`, `p_persona_id`, `p_hasta`, `p_antes_at`, `p_antes_id` (normal si tienen valor por defecto)
- `fn_existencias` · `apps/web/lib/por-regularizar-stock.ts:24` — no manda `p_producto_ids` (normal si tienen valor por defecto)
- `fn_presupuesto_vs_real` · `apps/web/lib/presupuesto.ts:14` — no manda `p_ubicacion_id`, `p_hoy` (normal si tienen valor por defecto)
- `fn_proveedor_costo_evolucion` · `apps/web/lib/proveedores.ts:267` — no manda `p_limite` (normal si tienen valor por defecto)
- `fn_lineas_comprobantes_produccion` · `apps/web/lib/recibir-produccion.ts:18` — no manda `p_comprobante_id` (normal si tienen valor por defecto)
- `fn_metas_equipo` · `apps/web/lib/rendimiento.ts:195` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_estado_resultados` · `apps/web/lib/resultados.ts:16` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `fn_campanas_reporte` · `apps/web/lib/resultados.ts:27` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `fn_resumen_variantes_json` · `apps/web/lib/resumen-inventario.ts:30` — no manda `p_cmp_desde`, `p_cmp_hasta` (normal si tienen valor por defecto)
- `crear_rol` · `apps/web/lib/roles-acciones.ts:33` — no manda `p_descripcion` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/lib/separaciones.ts:49` — no manda `p_texto`, `p_estados` (normal si tienen valor por defecto)
- `fn_totales_historial_ventas` · `apps/web/lib/ventas-historial.ts:252` — no manda `p_ids` (normal si tienen valor por defecto)

## No analizadas — 115

Estas 115 entradas son **entradas, no llamadas** (un ternario da dos; una función mencionada da una aunque no haya llamada):
arman sus parámetros fuera de la propia llamada, o la pantalla nombra la función sin un `.rpc("…")` directo (un ternario, un
ayudante, una constante), o usan `.rpc` como valor (`.bind`, `const { rpc } = x`). No se pueden revisar leyendo el texto.
**No están aprobadas: están sin revisar.** Una llamada directa o de un ternario a una función que la foto no tiene también está arriba,
entre las «sin respaldo» (p. ej. `crear_producto_con_stock_inicial`). Lo que aquí NO se ve: una llamada indirecta a una función que ni la
foto ni ninguna migración del repo conocen.

- `(alias de rpc)` · `apps/web/app/(app)/productos/categorias/page.tsx:46` — `.rpc` se usa como valor (se llama con un cast: `(x.rpc as …)(…)`): la función que se llama por ahí no se ve
- `registrarse_en_el_club` · `apps/web/app/actions/club-registro.ts:97` — los parámetros no van escritos ahí mismo
- `fn_frescura_sede` · `apps/web/app/api/inventario/frescura-vara-cayla/route.ts:45` — los parámetros no van escritos ahí mismo
- `(alias de rpc)` · `apps/web/app/api/lucode/anular/route.ts:50` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:40` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/emitir/route.ts:34` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/reintentar/route.ts:36` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `reactivar_categoria` · `apps/web/app/api/productos/categorias/route.ts:149` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `desactivar_categoria` · `apps/web/app/api/productos/categorias/route.ts:149` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `ajustar_inventario` · `apps/web/components/AjustarInventarioModal.tsx:385` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/BajarAlPisoForm.tsx:692` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/components/BajarEnManoModal.tsx:116` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `cerrar_linea_compra` · `apps/web/components/CerrarFaltanteModal.tsx:65` — el objeto se arma con «...», no se puede leer entero
- `registrar_pagos_compra` · `apps/web/components/CompraDetallePanel.tsx:278` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:410` — el objeto se arma con «...», no se puede leer entero
- `(nombre calculado)` · `apps/web/components/EliminarProductoModal.tsx:82` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `guardar_gasto_fijo` · `apps/web/components/GastosFijosYActivos.tsx:394` — el objeto se arma con «...», no se puede leer entero
- `registrar_gasto` · `apps/web/components/GastosPanel.tsx:620` — el objeto se arma con «...», no se puede leer entero
- `fn_impuestos_registro_ventas` · `apps/web/components/ImpuestosPanel.tsx:71` — los parámetros no van escritos ahí mismo
- `fn_impuestos_registro_compras` · `apps/web/components/ImpuestosPanel.tsx:73` — los parámetros no van escritos ahí mismo
- `recibir_lote` · `apps/web/components/LlegoMercaderia.tsx:204` — los parámetros no van escritos ahí mismo
- `crear_producto_con_stock_inicial` · `apps/web/components/NuevoProductoForm.tsx:589` — los parámetros no van escritos ahí mismo
- `cerrar_produccion` · `apps/web/components/OrdenCierre.tsx:88` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras_medios` · `apps/web/components/PagoJuntosModal.tsx:189` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras` · `apps/web/components/PagoJuntosModal.tsx:199` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:737` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedorModal.tsx:307` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedorModal.tsx:311` — los parámetros no van escritos ahí mismo
- `guardar_cuentas_proveedor` · `apps/web/components/ProveedorModal.tsx:322` — los parámetros no van escritos ahí mismo
- `desactivar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:163` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `reactivar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:163` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:657` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/PuntoDeVenta.tsx:973` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:1510` — los parámetros no van escritos ahí mismo
- `reasignar_reparto_compra` · `apps/web/components/ReasignarReparto.tsx:146` — el objeto se arma con «...», no se puede leer entero
- `recibir_envio` · `apps/web/components/RecepcionEnvio.tsx:670` — los parámetros no van escritos ahí mismo
- `registrar_activo` · `apps/web/components/RegistrarGastoModal.tsx:202` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_gasto` · `apps/web/components/RegistrarGastoModal.tsx:202` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_nota_credito_compra` · `apps/web/components/RegistrarNotaCreditoModal.tsx:207` — el objeto se arma con «...», no se puede leer entero
- `(nombre calculado)` · `apps/web/components/ResolverDanadosModal.tsx:196` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `registrar_reembolso_proveedor` · `apps/web/components/SaldoFavorAcciones.tsx:61` — el objeto se arma con «...», no se puede leer entero
- `(nombre calculado)` · `apps/web/components/analisis/HojaLiquidarDesde.tsx:58` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `separar_prendas` · `apps/web/components/apartados/ApartarVista.tsx:485` — los parámetros no van escritos ahí mismo
- `conteo_contar` · `apps/web/components/conteo/ContarConteo.tsx:153` — el objeto se arma con «...», no se puede leer entero
- `conteo_recontar` · `apps/web/components/conteo/RevisarConteo.tsx:136` — los parámetros no van escritos ahí mismo
- `conteo_confirmar_diferencia` · `apps/web/components/conteo/RevisarConteo.tsx:137` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/cuadre-piso/CuadrarPisoForm.tsx:453` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/components/cuadre-piso/CuadrarPisoForm.tsx:495` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/components/existencias/FlujoTalla.tsx:387` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `ajustar_inventario` · `apps/web/components/ficha-producto/useStockFicha.ts:252` — los parámetros no van escritos ahí mismo
- `ajustar_inventario` · `apps/web/components/ficha-producto/useStockFicha.ts:369` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/finanzas/CierreMes.tsx:272` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `registrar_movimiento_dinero` · `apps/web/components/finanzas/CuentasDinero.tsx:870` — el objeto se arma con «...», no se puede leer entero
- `editar_cuenta_dinero` · `apps/web/components/finanzas/EditarCuentaModal.tsx:90` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/plan-compra/PlanCategoriaModal.tsx:76` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/analisis-datos.ts:33` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/analisis-liquidar.ts:14` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/analisis-por-llegar.ts:23` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/analisis-sede.ts:29` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `fn_productos_facetas` · `apps/web/lib/catalogo-v2.ts:344` — los parámetros no van escritos ahí mismo
- `fn_productos_listado` · `apps/web/lib/catalogo-v2.ts:353` — el objeto se arma con «...», no se puede leer entero
- `agregar_colaboradores` · `apps/web/lib/colaboradores-acciones.ts:34` — los parámetros no van escritos ahí mismo
- `por_pagar_tramos` · `apps/web/lib/compras-indicadores.ts:110` — el objeto se arma con «...», no se puede leer entero
- `resumen_recepciones` · `apps/web/lib/compras-indicadores.ts:178` — los parámetros no van escritos ahí mismo
- `listar_recepciones_compras` · `apps/web/lib/compras-indicadores.ts:213` — el objeto se arma con «...», no se puede leer entero
- `recepciones_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:257` — el objeto se arma con «...», no se puede leer entero
- `listar_compras_operativo` · `apps/web/lib/compras.ts:192` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:219` — el objeto se arma con «...», no se puede leer entero
- `lineas_compra_operativo` · `apps/web/lib/compras.ts:392` — el objeto se arma con «...», no se puede leer entero
- `(alias de rpc)` · `apps/web/lib/consultar-comprobante.ts:72` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(nombre calculado)` · `apps/web/lib/cuadre-piso.ts:16` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `fn_frescura_sede` · `apps/web/lib/frescura.ts:47` — los parámetros no van escritos ahí mismo
- `fn_frescura_decisiones` · `apps/web/lib/frescura.ts:49` — los parámetros no van escritos ahí mismo
- `fn_confianza_registro` · `apps/web/lib/frescura.ts:53` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/lib/motor-demanda.ts:16` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/motor-demanda.ts:47` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/motor-demanda.ts:48` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:183` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:243` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen_procesos` · `apps/web/lib/movimientos-v2.ts:263` — los parámetros no van escritos ahí mismo
- `fn_facturas_para_nota_credito` · `apps/web/lib/notas-credito.ts:148` — el objeto se arma con «...», no se puede leer entero
- `registrar_pedido_no_atendido` · `apps/web/lib/pedidos-no-atendidos-acciones.ts:25` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/lib/plan-compra.ts:10` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `(nombre calculado)` · `apps/web/lib/rendimiento.ts:227` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `asignar_rol` · `apps/web/lib/roles-acciones.ts:62` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/lib/useColaOffline.ts:106` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `fn_productos_por_categoria` · `apps/web/app/(app)/productos/categorias/page.tsx:46` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_tomar_comprobantes_para_consultar` · `apps/web/app/api/lucode/reintentar/route.ts:40` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `cerrar_periodo` · `apps/web/components/finanzas/CierreMes.tsx:292` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `reabrir_periodo` · `apps/web/components/finanzas/CierreMes.tsx:370` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_liquidar_desde` · `apps/web/lib/analisis-liquidar-reglas.ts:15` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `guardar_liquidar_desde` · `apps/web/lib/analisis-liquidar-reglas.ts:16` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_analisis_por_llegar` · `apps/web/lib/analisis-por-llegar-lectura.ts:12` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_analisis_sede` · `apps/web/lib/analisis-sede-lectura.ts:11` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `bajar_al_piso_desde_vender` · `apps/web/lib/bajada-desde-vender.ts:18` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `bajar_en_mano` · `apps/web/lib/bajada-en-mano.ts:20` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `bajar_al_piso` · `apps/web/lib/bajada-reglas.ts:29` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_confirmar_baja_sunat` · `apps/web/lib/consultar-comprobante.ts:76` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `cuadrar_piso` · `apps/web/lib/cuadre-piso-reglas.ts:23` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `previsualizar_cuadre_piso` · `apps/web/lib/cuadre-piso-reglas.ts:24` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_cuadre_piso_estado` · `apps/web/lib/cuadre-piso-reglas.ts:25` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `reportar_danada` · `apps/web/lib/danadas-reglas.ts:25` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `arreglar_prenda_danada` · `apps/web/lib/danadas-reglas.ts:27` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_demanda_sede` · `apps/web/lib/demanda-reglas.ts:24` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `eliminar_producto` · `apps/web/lib/eliminar-producto-reglas.ts:63` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `eliminar_producto_con_historia` · `apps/web/lib/eliminar-producto-reglas.ts:63` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_motor_demanda_preparacion` · `apps/web/lib/motor-demanda-reglas.ts:22` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `subir_para_enviar` · `apps/web/lib/para-enviar-reglas.ts:168` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_plan_compra` · `apps/web/lib/plan-compra-reglas.ts:22` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `guardar_plan_compra_linea` · `apps/web/lib/plan-compra-reglas.ts:23` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_rendimiento_serie` · `apps/web/lib/rendimiento-lectura.ts:28` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_metas_historial` · `apps/web/lib/rendimiento-lectura.ts:29` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `fn_rendimiento_detalle` · `apps/web/lib/rendimiento-lectura.ts:30` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `retirar_del_piso` · `apps/web/lib/retiro-reglas.ts:21` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `crear_producto_con_variantes` · `apps/web/lib/useColaProductos.ts:13` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros

## Funciones sin llamada detectada desde `apps/web` — 58

Existen en producción y ninguna pantalla de `apps/web` las nombra entre comillas (ni con un `.rpc("…")` directo ni de otra
forma; los comentarios y las pruebas no cuentan; las `fn_*` se descartan a propósito). **Esto NO prueba que sobren.** Cada
una puede ser:

- una función **a la que llama otra función o un disparador** de la base (aquí no se leen los cuerpos SQL): p. ej. `recibir_compras`
  la llama `recibir_envio` (migración `20260919121000`), que es la que la pantalla de recepción nombra;
- una que **usa un script o Dynamic** desde fuera, no una pantalla;
- una **herramienta de mantenimiento que se corre a mano** desde el SQL Editor (p. ej. `recalcular_stock`, `archivar_*_prueba`);
- una función **retirada o de legado** que sigue en la base;
- una **pantalla que falta construir**;
- o una función que de verdad **sobra**.

Antes de retirar una, buscar quién la usa (`git grep` y, en producción, los cuerpos de las demás funciones). Esta consulta lee SOLO
cuerpos de funciones de `retail`: los disparadores, las políticas de seguridad y los trabajos programados (cron) se miran aparte.

```sql
select p.proname from pg_proc p
 where p.pronamespace = 'retail'::regnamespace and p.proname <> '<nombre>' and p.prosrc ~ ('\m' || '<nombre>' || '\M');
```

- `agregar_colaborador`
- `agregar_comprador_de_tienda`
- `agregar_terminal`
- `ajustar_insumo_por_conteo`
- `apartar_prenda`
- `apartar_stock`
- `archivar_caja_prueba`
- `archivar_conteo_prueba`
- `archivar_producto_prueba`
- `archivar_venta_prueba`
- `cambiar_tienda_gestora_compra`
- `cargar_activo_inicial`
- `cargar_stock_inicial`
- `catalogo_crear_producto`
- `confirmar_invitacion_club`
- `convertir_proforma_a_comprobante`
- `crear_invitacion_club`
- `emitir_comprobante`
- `emitir_nota`
- `fijar_capacidad_piso`
- `fijar_grupos_de_categorias`
- `huellas_catalogo`
- `marcar_guia_vista`
- `mover_entre_piso_y_almacen`
- `mover_interno`
- `quitar_comprador_de_tienda`
- `recalcular_compras`
- `recalcular_stock`
- `recibir_compras`
- `recibir_y_cerrar_compras`
- `registrar_desde_whatsapp`
- `registrar_gasto_legado_2026_09`
- `registrar_hallazgo_de_conteo`
- `registrar_mensaje_publicidad`
- `registrar_movimiento`
- `registrar_pago_compra`
- `resumen_sin_comprobante`
- `revisar_producto_censo`
- `trg_actividad_caja_movimientos`
- `trg_actividad_caja_traslados`
- `trg_actividad_cajas`
- `trg_actividad_cambios`
- `trg_actividad_cierre_cola`
- `trg_actividad_conteos`
- `trg_actividad_gestion`
- `trg_actividad_historial_producto`
- `trg_actividad_movimientos`
- `trg_actividad_productos`
- `trg_actividad_separacion_creada`
- `trg_actividad_separacion_hijas`
- `trg_actividad_separaciones`
- `trg_actividad_transferencias`
- `trg_actividad_ventas`
- `trg_conteo_items_sin_contar`
- `trg_conteos_arranque_coherente`
- `trg_para_enviar_al_salir`
- `trg_pedidos_al_llegar`
- `unirse_al_club`
