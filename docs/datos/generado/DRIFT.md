# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 116 llamadas de `apps/web` contra 196 funciones del schema `retail` en producción.

---

## Roto en producción — 3

## Sobrecargas — 0

Ninguna. Cada función tiene una sola firma en producción.
### `liberar_apartado` — no existe

**Dónde:** `apps/web/components/ApartadosModal.tsx:41`
**Qué pasa:** la función `liberar_apartado` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `apartar_stock` — no existe

**Dónde:** `apps/web/components/ApartarModal.tsx:57`
**Qué pasa:** la función `apartar_stock` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

### `listar_apartados` — no existe

**Dónde:** `apps/web/lib/apartados.ts:12`
**Qué pasa:** la función `listar_apartados` no existe en producción
**Consecuencia:** esa pantalla falla siempre en las tiendas. No es intermitente.

## Avisos — 17

- `anular_comprobante` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:72` — no manda `p_motivo` (normal si tienen valor por defecto)
- `actualizar_transmision_comprobante` · `apps/web/app/api/lucode/emitir/route.ts:159` — no manda `p_entorno`, `p_motivo_rechazo` (normal si tienen valor por defecto)
- `actualizar_categoria_ejes` · `apps/web/app/api/productos/categorias/ejes/route.ts:23` — no manda `p_talla_habitual_ids` (normal si tienen valor por defecto)
- `registrar_comprobante_produccion` · `apps/web/components/ComprobanteProduccionForm.tsx:104` — no manda `p_igv_porcentaje` (normal si tienen valor por defecto)
- `emitir_comprobante` · `apps/web/components/ComprobantesPanel.tsx:378` — no manda `p_venta_id`, `p_items` (normal si tienen valor por defecto)
- `registrar_serie_comprobante` · `apps/web/components/ComprobantesPanel.tsx:405` — no manda `p_siguiente_numero` (normal si tienen valor por defecto)
- `recibir_insumo` · `apps/web/components/InsumoModales.tsx:135` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_consumo_insumo` · `apps/web/components/OrdenInsumos.tsx:112` — no manda `p_nota` (normal si tienen valor por defecto)
- `devolver_insumo_de_produccion` · `apps/web/components/OrdenInsumos.tsx:134` — no manda `p_nota` (normal si tienen valor por defecto)
- `crear_proforma` · `apps/web/components/ProformasPanel.tsx:106` — no manda `p_items`, `p_cliente_num_doc` (normal si tienen valor por defecto)
- `convertir_proforma_a_comprobante` · `apps/web/components/ProformasPanel.tsx:136` — no manda `p_venta_id` (normal si tienen valor por defecto)
- `mover_interno` · `apps/web/components/ReponerPisoModal.tsx:65` — no manda `p_nota` (normal si tienen valor por defecto)
- `resolver_prenda_danada` · `apps/web/components/ResolverDanadosModal.tsx:59` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_proveedor` · `apps/web/components/alta-producto/NuevaMarcaForm.tsx:76` — no manda `p_contacto`, `p_rubro`, `p_plazo_credito_dias`, `p_forma_pago_preferida`, `p_telefono`, `p_banco`, `p_cuenta_bancaria` (normal si tienen valor por defecto)
- `registrar_adjunto_compra` · `apps/web/lib/adjuntos-compra.ts:71` — no manda `p_nota_credito_id` (normal si tienen valor por defecto)
- `fn_proveedor_costo_evolucion` · `apps/web/lib/proveedores.ts:267` — no manda `p_limite` (normal si tienen valor por defecto)
- `fn_resumen_variantes` · `apps/web/lib/resumen-inventario.ts:42` — no manda `p_ventana_dias` (normal si tienen valor por defecto)

## No analizadas — 30

Estas llamadas arman sus parámetros fuera de la propia llamada, así que no se
pueden revisar leyendo el texto. **No están aprobadas: están sin revisar.**

- `registrar_movimiento` · `apps/web/components/AjustarInventarioModal.tsx:159` — el objeto se arma con «...», no se puede leer entero
- `cerrar_linea_compra` · `apps/web/components/CerrarFaltanteModal.tsx:59` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:339` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras_medios` · `apps/web/components/PagoJuntosModal.tsx:170` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras` · `apps/web/components/PagoJuntosModal.tsx:178` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:323` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedorModal.tsx:261` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedorModal.tsx:265` — los parámetros no van escritos ahí mismo
- `guardar_cuentas_proveedor` · `apps/web/components/ProveedorModal.tsx:276` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:362` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:785` — los parámetros no van escritos ahí mismo
- `reasignar_reparto_compra` · `apps/web/components/ReasignarReparto.tsx:140` — el objeto se arma con «...», no se puede leer entero
- `recibir_envio` · `apps/web/components/RecepcionEnvio.tsx:632` — los parámetros no van escritos ahí mismo
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:70` — el objeto se arma con «...», no se puede leer entero
- `registrar_nota_credito_compra` · `apps/web/components/RegistrarNotaCreditoModal.tsx:189` — el objeto se arma con «...», no se puede leer entero
- `registrar_reembolso_proveedor` · `apps/web/components/SaldoFavorAcciones.tsx:49` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:223` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:303` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps/web/lib/catalogo-v2.ts:326` — los parámetros no van escritos ahí mismo
- `por_pagar_tramos` · `apps/web/lib/compras-indicadores.ts:110` — el objeto se arma con «...», no se puede leer entero
- `listar_recepciones_compras` · `apps/web/lib/compras-indicadores.ts:211` — el objeto se arma con «...», no se puede leer entero
- `recepciones_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:280` — el objeto se arma con «...», no se puede leer entero
- `listar_compras_operativo` · `apps/web/lib/compras.ts:181` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:207` — el objeto se arma con «...», no se puede leer entero
- `lineas_compra_operativo` · `apps/web/lib/compras.ts:375` — el objeto se arma con «...», no se puede leer entero
- `fn_prioridad_conteo` · `apps/web/lib/conteos.ts:189` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:178` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:208` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen` · `apps/web/lib/movimientos-v2.ts:227` — los parámetros no van escritos ahí mismo
- `fn_facturas_para_nota_credito` · `apps/web/lib/notas-credito.ts:148` — el objeto se arma con «...», no se puede leer entero

## Funciones que nadie llama — 33

Existen en producción y ninguna pantalla las usa. Cada una es una de dos cosas:
una pantalla que falta construir, o una función que sobra y habría que retirar.

- `actualizar_proveedor`
- `ajustar_insumo_por_conteo`
- `catalogo_actualizar_producto`
- `catalogo_crear_producto`
- `cerrar_linea_compra`
- `desactivar_categoria`
- `desactivar_proveedor`
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
- `registrar_reembolso_proveedor`
- `registrar_venta`
