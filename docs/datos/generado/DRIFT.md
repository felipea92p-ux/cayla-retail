# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 167 llamadas de `apps/web` contra 300 funciones del schema `retail` en producción.

---

## Roto en producción — 0

## Sobrecargas — 0

Ninguna. Cada función tiene una sola firma en producción.
Nada. Todas las llamadas encajan con la firma real.
## Avisos — 22

- `anular_comprobante` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_categoria_ejes` · `apps/web/app/api/productos/categorias/ejes/route.ts:26` — no manda `p_talla_habitual_ids` (normal si tienen valor por defecto)
- `registrar_comprobante_produccion` · `apps/web/components/ComprobanteProduccionForm.tsx:108` — no manda `p_igv_porcentaje` (normal si tienen valor por defecto)
- `crear_devolucion` · `apps/web/components/DevolucionesFlujo.tsx:232` — no manda `p_motivo_codigo` (normal si tienen valor por defecto)
- `recibir_insumo` · `apps/web/components/InsumoModales.tsx:135` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_consumo_insumo` · `apps/web/components/OrdenInsumos.tsx:112` — no manda `p_nota` (normal si tienen valor por defecto)
- `devolver_insumo_de_produccion` · `apps/web/components/OrdenInsumos.tsx:134` — no manda `p_nota` (normal si tienen valor por defecto)
- `guardar_proveedor_produccion` · `apps/web/components/ProveedorProduccionModal.tsx:75` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `mover_interno` · `apps/web/components/ReponerPisoModal.tsx:71` — no manda `p_nota` (normal si tienen valor por defecto)
- `resolver_prenda_danada` · `apps/web/components/ResolverDanadosModal.tsx:67` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps/web/components/SeriesPanel.tsx:106` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `registrar_proveedor` · `apps/web/components/alta-producto/NuevaMarcaForm.tsx:89` — no manda `p_contacto`, `p_rubro`, `p_plazo_credito_dias`, `p_forma_pago_preferida`, `p_telefono`, `p_banco`, `p_cuenta_bancaria` (normal si tienen valor por defecto)
- `separar_prendas` · `apps/web/components/apartados/ApartarVista.tsx:230` — no manda `p_clienta_id` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/components/apartados/ApartarVista.tsx:259` — no manda `p_estados` (normal si tienen valor por defecto)
- `registrar_adjunto_compra` · `apps/web/lib/adjuntos-compra.ts:71` — no manda `p_nota_credito_id` (normal si tienen valor por defecto)
- `fn_igv_credito_fiscal` · `apps/web/lib/deuda-consolidada.ts:25` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_proveedor_costo_evolucion` · `apps/web/lib/proveedores.ts:267` — no manda `p_limite` (normal si tienen valor por defecto)
- `fn_lineas_comprobantes_produccion` · `apps/web/lib/recibir-produccion.ts:12` — no manda `p_comprobante_id` (normal si tienen valor por defecto)
- `fn_resumen_variantes` · `apps/web/lib/resumen-inventario.ts:42` — no manda `p_ventana_dias` (normal si tienen valor por defecto)
- `crear_rol` · `apps/web/lib/roles-acciones.ts:21` — no manda `p_descripcion` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/lib/separaciones.ts:37` — no manda `p_texto`, `p_estados` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps/web/lib/transmitir-comprobante.ts:165` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)

## No analizadas — 32

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `registrar_movimiento` · `apps/web/components/AjustarInventarioModal.tsx:170` — el objeto se arma con «...», no se puede leer entero
- `cerrar_linea_compra` · `apps/web/components/CerrarFaltanteModal.tsx:59` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:339` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras_medios` · `apps/web/components/PagoJuntosModal.tsx:170` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras` · `apps/web/components/PagoJuntosModal.tsx:178` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:334` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedorModal.tsx:261` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedorModal.tsx:265` — los parámetros no van escritos ahí mismo
- `guardar_cuentas_proveedor` · `apps/web/components/ProveedorModal.tsx:276` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:405` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:866` — los parámetros no van escritos ahí mismo
- `reasignar_reparto_compra` · `apps/web/components/ReasignarReparto.tsx:140` — el objeto se arma con «...», no se puede leer entero
- `recibir_envio` · `apps/web/components/RecepcionEnvio.tsx:636` — los parámetros no van escritos ahí mismo
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:70` — el objeto se arma con «...», no se puede leer entero
- `registrar_nota_credito_compra` · `apps/web/components/RegistrarNotaCreditoModal.tsx:189` — el objeto se arma con «...», no se puede leer entero
- `registrar_reembolso_proveedor` · `apps/web/components/SaldoFavorAcciones.tsx:49` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:223` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:303` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps/web/lib/catalogo-v2.ts:326` — los parámetros no van escritos ahí mismo
- `por_pagar_tramos` · `apps/web/lib/compras-indicadores.ts:110` — el objeto se arma con «...», no se puede leer entero
- `listar_recepciones_compras` · `apps/web/lib/compras-indicadores.ts:213` — el objeto se arma con «...», no se puede leer entero
- `recepciones_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:282` — el objeto se arma con «...», no se puede leer entero
- `listar_compras_operativo` · `apps/web/lib/compras.ts:186` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:213` — el objeto se arma con «...», no se puede leer entero
- `lineas_compra_operativo` · `apps/web/lib/compras.ts:385` — el objeto se arma con «...», no se puede leer entero
- `fn_prioridad_conteo` · `apps/web/lib/conteos.ts:195` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:178` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:208` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen` · `apps/web/lib/movimientos-v2.ts:227` — los parámetros no van escritos ahí mismo
- `fn_facturas_para_nota_credito` · `apps/web/lib/notas-credito.ts:148` — el objeto se arma con «...», no se puede leer entero
- `asignar_rol` · `apps/web/lib/roles-acciones.ts:41` — el objeto se arma con «...», no se puede leer entero
- `abrir_caja` · `apps/web/lib/useResponsable.ts:23` — el objeto se arma con «...», no se puede leer entero

## Funciones que nadie llama — 43

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `actualizar_proveedor`
- `agregar_colaborador`
- `agregar_terminal`
- `ajustar_insumo_por_conteo`
- `archivar_caja_prueba`
- `archivar_conteo_prueba`
- `archivar_producto_prueba`
- `archivar_venta_prueba`
- `asignar_rol`
- `catalogo_actualizar_producto`
- `catalogo_crear_producto`
- `cerrar_linea_compra`
- `convertir_proforma_a_comprobante`
- `desactivar_categoria`
- `desactivar_proveedor`
- `emitir_comprobante`
- `emitir_nota`
- `guardar_cuentas_proveedor`
- `lineas_compra_operativo`
- `listar_compras`
- `listar_compras_operativo`
- `listar_recepciones_compras`
- `por_pagar_tramos`
- `reactivar_categoria`
- `reactivar_proveedor`
- `reasignar_reparto_compra`
- `recalcular_compras`
- `recalcular_stock`
- `recepciones_sin_comprobante`
- `recibir_compras`
- `recibir_envio`
- `recibir_lote`
- `recibir_y_cerrar_compras`
- `registrar_compra`
- `registrar_gasto`
- `registrar_movimiento`
- `registrar_nota_credito_compra`
- `registrar_pago_compra`
- `registrar_pago_compras`
- `registrar_pago_compras_medios`
- `registrar_pedido_no_atendido`
- `registrar_reembolso_proveedor`
- `registrar_venta`
