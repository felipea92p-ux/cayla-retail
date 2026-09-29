# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 384 llamadas `.rpc` de `apps/web` contra 676 funciones del schema `retail` en producción: 331 con los parámetros leídos (se comparan uno por uno), 46 directas cuyos parámetros no se pudieron leer (solo se comprueba que la función exista), 7 con el nombre en un ternario o una variable.
> **Foto de producción: 2026-09-29 22:36 UTC.** Todo lo de este archivo es tan fresco como esa foto: una función
> creada o cambiada DESPUÉS sale como «no existe», con parámetros de más o con un aviso de un parámetro que ya no existe, aunque en
> producción ya esté bien. Antes de dar una pantalla por rota, confirmarlo en producción; para refrescar la foto,
> `docs/datos/generado/COMO-REFRESCAR.md`.

> **Palabras de este informe.** *Foto*: la lista de funciones de producción que está en `funciones-produccion.txt`, tomada en la fecha
> de arriba. *Aviso*: la pantalla no manda un parámetro que la función acepta (normal si tiene valor por defecto). *Sobrecarga*: dos
> funciones con el mismo nombre y distinta lista de parámetros: una llamada por nombre queda ambigua. Las `fn_*` (461 en la
> foto: en su mayoría disparadores, candados de dinero y ayudantes que llaman otras funciones) se dejan fuera de «sin llamada» a
> propósito; 147 sí las nombra una pantalla y salen en las secciones de arriba, y a las otras 314 no las nombra ninguna pantalla y aquí no se listan.

---

## Llamadas sin respaldo en la foto de producción — 8

Cada entrada es una llamada que **la foto no respalda**: la función no aparece, o la app manda un parámetro que la foto no
tiene. **No es lo mismo que «pantalla rota»**: una función creada o cambiada después de la foto sale aquí aunque en
producción ya esté bien. Confirmarlo antes de actuar:

```sql
select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname = '<nombre>';
```

Si la foto está vieja, refrescarla (`docs/datos/generado/COMO-REFRESCAR.md`). Si la entrada trae «Migración que la crea», esa
migración define la función: se pegó en producción después de la foto, o todavía no se ha pegado.

### `fijar_meta_persona` — no está en la foto

- **Dónde:** `apps/web/components/rendimiento/EditarMetaModal.tsx:109`
- **Qué pasa:** la función `fijar_meta_persona` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930050000_metas_por_persona.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_global_cobertura` — no está en la foto

- **Dónde:** `apps/web/lib/cayla-global.ts:13`
- **Qué pasa:** la función `fn_global_cobertura` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260929140000_cayla_global_modulo_solo_admin.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_mis_ventas_del_dia` — no está en la foto

- **Dónde:** `apps/web/lib/inicio.ts:63`
- **Qué pasa:** la función `fn_mis_ventas_del_dia` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930040000_mis_ventas_del_dia.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_mi_meta` — no está en la foto

- **Dónde:** `apps/web/lib/inicio.ts:94`
- **Qué pasa:** la función `fn_mi_meta` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930050000_metas_por_persona.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_mis_ventas_por_dia` — no está en la foto

- **Dónde:** `apps/web/lib/inicio.ts:95`
- **Qué pasa:** la función `fn_mis_ventas_por_dia` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930050000_metas_por_persona.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_metas_equipo` — no está en la foto

- **Dónde:** `apps/web/lib/rendimiento.ts:176`
- **Qué pasa:** la función `fn_metas_equipo` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930050000_metas_por_persona.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_rendimiento_serie` — no está en la foto

- **Dónde:** `apps/web/lib/rendimiento.ts:206`
- **Qué pasa:** la función `fn_rendimiento_serie` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930050000_metas_por_persona.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_metas_historial` — no está en la foto

- **Dónde:** `apps/web/lib/rendimiento.ts:207`
- **Qué pasa:** la función `fn_metas_historial` no está en la foto de producción (2026-09-29 22:36 UTC)
- **Migración que la crea:** `supabase/migrations/20260930050000_metas_por_persona.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

## Sobrecargas — 0

Ninguna. Cada función tiene una sola firma en producción.

## Avisos — 32

- `fn_temporada_efectiva` · `apps/web/app/(app)/productos/atributos/page.tsx:42` — no manda `p_producto_id` (normal si tienen valor por defecto)
- `registrar_comprobante_produccion` · `apps/web/components/ComprobanteProduccionForm.tsx:120` — no manda `p_igv_porcentaje` (normal si tienen valor por defecto)
- `registrar_movimiento_dinero` · `apps/web/components/GastosPanel.tsx:598` — no manda `p_cuenta_origen_id`, `p_fecha`, `p_comision`, `p_caja_id` (normal si tienen valor por defecto)
- `recibir_insumo` · `apps/web/components/InsumoModales.tsx:151` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_consumo_insumo` · `apps/web/components/OrdenInsumos.tsx:124` — no manda `p_nota` (normal si tienen valor por defecto)
- `devolver_insumo_de_produccion` · `apps/web/components/OrdenInsumos.tsx:154` — no manda `p_nota` (normal si tienen valor por defecto)
- `asignar_temporadas` · `apps/web/components/ProductoForm.tsx:703` — no manda `p_solo_sin_temporada` (normal si tienen valor por defecto)
- `resolver_prenda_danada` · `apps/web/components/ResolverDanadosModal.tsx:71` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `fn_actividad` · `apps/web/components/actividad/ListaActividad.tsx:43` — no manda `p_hasta` (normal si tienen valor por defecto)
- `registrar_proveedor` · `apps/web/components/alta-producto/NuevaMarcaForm.tsx:219` — no manda `p_contacto`, `p_rubros`, `p_plazo_credito_dias`, `p_forma_pago_preferida`, `p_telefono`, `p_banco`, `p_cuenta_bancaria` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/components/apartados/ApartarVista.tsx:420` — no manda `p_estados` (normal si tienen valor por defecto)
- `censo_crear_variante` · `apps/web/components/conteo/AltaAlVuelo.tsx:94` — no manda `p_costo`, `p_precio` (normal si tienen valor por defecto)
- `fn_presupuesto_propuesta` · `apps/web/components/finanzas/ConfiguracionPresupuesto.tsx:115` — no manda `p_hoy` (normal si tienen valor por defecto)
- `registrar_pedido_no_atendido` · `apps/web/components/punto-de-venta/AnotarNoHabia.tsx:43` — no manda `p_producto_id` (normal si tienen valor por defecto)
- `buscar_clienta` · `apps/web/components/punto-de-venta/ClientaDelTicket.tsx:112` — no manda `p_incluir_archivadas` (normal si tienen valor por defecto)
- `registrar_adjunto_compra` · `apps/web/lib/adjuntos-compra.ts:87` — no manda `p_nota_credito_id` (normal si tienen valor por defecto)
- `fn_balance_general` · `apps/web/lib/balance.ts:33` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/lib/caja-tablero.ts:86` — no manda `p_texto`, `p_estados` (normal si tienen valor por defecto)
- `fn_temporada_efectiva` · `apps/web/lib/catalogo-v2.ts:663` — no manda `p_producto_id` (normal si tienen valor por defecto)
- `fn_configuracion_tiendas` · `apps/web/lib/configuracion.ts:20` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_igv_credito_fiscal` · `apps/web/lib/deuda-consolidada.ts:34` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_gastos_lista` · `apps/web/lib/gastos.ts:103` — no manda `p_solo_empresa` (normal si tienen valor por defecto)
- `fn_activos_lista` · `apps/web/lib/gastos.ts:120` — no manda `p_corte` (normal si tienen valor por defecto)
- `fn_actividad` · `apps/web/lib/inicio.ts:161` — no manda `p_modulo`, `p_persona_id`, `p_hasta`, `p_antes_at`, `p_antes_id` (normal si tienen valor por defecto)
- `fn_presupuesto_vs_real` · `apps/web/lib/presupuesto.ts:14` — no manda `p_ubicacion_id`, `p_hoy` (normal si tienen valor por defecto)
- `fn_proveedor_costo_evolucion` · `apps/web/lib/proveedores.ts:267` — no manda `p_limite` (normal si tienen valor por defecto)
- `fn_lineas_comprobantes_produccion` · `apps/web/lib/recibir-produccion.ts:18` — no manda `p_comprobante_id` (normal si tienen valor por defecto)
- `fn_estado_resultados` · `apps/web/lib/resultados.ts:16` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `fn_campanas_reporte` · `apps/web/lib/resultados.ts:27` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `crear_rol` · `apps/web/lib/roles-acciones.ts:33` — no manda `p_descripcion` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/lib/separaciones.ts:48` — no manda `p_texto`, `p_estados` (normal si tienen valor por defecto)
- `fn_totales_historial_ventas` · `apps/web/lib/ventas-historial.ts:251` — no manda `p_ids` (normal si tienen valor por defecto)

## No analizadas — 67

Estas 67 entradas son **entradas, no llamadas** (un ternario da dos; una función mencionada da una aunque no haya llamada):
arman sus parámetros fuera de la propia llamada, o la pantalla nombra la función sin un `.rpc("…")` directo (un ternario, un
ayudante, una constante), o usan `.rpc` como valor (`.bind`, `const { rpc } = x`). No se pueden revisar leyendo el texto.
**No están aprobadas: están sin revisar.** Una llamada directa o de un ternario a una función que la foto no tiene también está arriba,
entre las «sin respaldo» (p. ej. `crear_producto_con_stock_inicial`). Lo que aquí NO se ve: una llamada indirecta a una función que ni la
foto ni ninguna migración del repo conocen.

- `(alias de rpc)` · `apps/web/app/(app)/productos/categorias/page.tsx:46` — `.rpc` se usa como valor (se llama con un cast: `(x.rpc as …)(…)`): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/anular/route.ts:50` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:40` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/emitir/route.ts:34` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `reactivar_categoria` · `apps/web/app/api/productos/categorias/route.ts:149` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `desactivar_categoria` · `apps/web/app/api/productos/categorias/route.ts:149` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `ajustar_inventario` · `apps/web/components/AjustarInventarioModal.tsx:245` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/BajarAlPisoForm.tsx:404` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `cerrar_linea_compra` · `apps/web/components/CerrarFaltanteModal.tsx:65` — el objeto se arma con «...», no se puede leer entero
- `registrar_pagos_compra` · `apps/web/components/CompraDetallePanel.tsx:278` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:382` — el objeto se arma con «...», no se puede leer entero
- `(nombre calculado)` · `apps/web/components/EliminarProductoModal.tsx:77` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `guardar_gasto_fijo` · `apps/web/components/GastosFijosYActivos.tsx:383` — el objeto se arma con «...», no se puede leer entero
- `registrar_gasto` · `apps/web/components/GastosPanel.tsx:595` — el objeto se arma con «...», no se puede leer entero
- `fn_impuestos_registro_ventas` · `apps/web/components/ImpuestosPanel.tsx:69` — los parámetros no van escritos ahí mismo
- `fn_impuestos_registro_compras` · `apps/web/components/ImpuestosPanel.tsx:71` — los parámetros no van escritos ahí mismo
- `crear_producto_con_stock_inicial` · `apps/web/components/NuevoProductoForm.tsx:522` — los parámetros no van escritos ahí mismo
- `registrar_pago_compras_medios` · `apps/web/components/PagoJuntosModal.tsx:189` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras` · `apps/web/components/PagoJuntosModal.tsx:199` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:597` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedorModal.tsx:307` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedorModal.tsx:311` — los parámetros no van escritos ahí mismo
- `guardar_cuentas_proveedor` · `apps/web/components/ProveedorModal.tsx:322` — los parámetros no van escritos ahí mismo
- `desactivar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:177` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `reactivar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:177` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:548` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:1175` — los parámetros no van escritos ahí mismo
- `reasignar_reparto_compra` · `apps/web/components/ReasignarReparto.tsx:146` — el objeto se arma con «...», no se puede leer entero
- `recibir_envio` · `apps/web/components/RecepcionEnvio.tsx:688` — los parámetros no van escritos ahí mismo
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:97` — los parámetros no van escritos ahí mismo
- `registrar_activo` · `apps/web/components/RegistrarGastoModal.tsx:202` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_gasto` · `apps/web/components/RegistrarGastoModal.tsx:202` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_nota_credito_compra` · `apps/web/components/RegistrarNotaCreditoModal.tsx:204` — el objeto se arma con «...», no se puede leer entero
- `registrar_reembolso_proveedor` · `apps/web/components/SaldoFavorAcciones.tsx:61` — el objeto se arma con «...», no se puede leer entero
- `separar_prendas` · `apps/web/components/apartados/ApartarVista.tsx:409` — los parámetros no van escritos ahí mismo
- `conteo_contar` · `apps/web/components/conteo/ContarConteo.tsx:144` — el objeto se arma con «...», no se puede leer entero
- `conteo_recontar` · `apps/web/components/conteo/RevisarConteo.tsx:133` — los parámetros no van escritos ahí mismo
- `conteo_confirmar_diferencia` · `apps/web/components/conteo/RevisarConteo.tsx:134` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/components/finanzas/CierreMes.tsx:253` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `registrar_movimiento_dinero` · `apps/web/components/finanzas/CuentasDinero.tsx:857` — el objeto se arma con «...», no se puede leer entero
- `editar_cuenta_dinero` · `apps/web/components/finanzas/EditarCuentaModal.tsx:90` — los parámetros no van escritos ahí mismo
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:300` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:401` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps/web/lib/catalogo-v2.ts:440` — los parámetros no van escritos ahí mismo
- `por_pagar_tramos` · `apps/web/lib/compras-indicadores.ts:110` — el objeto se arma con «...», no se puede leer entero
- `resumen_recepciones` · `apps/web/lib/compras-indicadores.ts:178` — los parámetros no van escritos ahí mismo
- `listar_recepciones_compras` · `apps/web/lib/compras-indicadores.ts:213` — el objeto se arma con «...», no se puede leer entero
- `resumen_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:252` — los parámetros no van escritos ahí mismo
- `recepciones_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:282` — el objeto se arma con «...», no se puede leer entero
- `listar_compras_operativo` · `apps/web/lib/compras.ts:192` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:219` — el objeto se arma con «...», no se puede leer entero
- `lineas_compra_operativo` · `apps/web/lib/compras.ts:392` — el objeto se arma con «...», no se puede leer entero
- `fn_frescura_sede` · `apps/web/lib/frescura.ts:41` — los parámetros no van escritos ahí mismo
- `fn_confianza_registro` · `apps/web/lib/frescura.ts:42` — los parámetros no van escritos ahí mismo
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:184` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:236` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen_procesos` · `apps/web/lib/movimientos-v2.ts:256` — los parámetros no van escritos ahí mismo
- `fn_facturas_para_nota_credito` · `apps/web/lib/notas-credito.ts:148` — el objeto se arma con «...», no se puede leer entero
- `asignar_rol` · `apps/web/lib/roles-acciones.ts:62` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/lib/useColaOffline.ts:106` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `fn_productos_por_categoria` · `apps/web/app/(app)/productos/categorias/page.tsx:46` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `cerrar_periodo` · `apps/web/components/finanzas/CierreMes.tsx:273` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `reabrir_periodo` · `apps/web/components/finanzas/CierreMes.tsx:351` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `bajar_al_piso` · `apps/web/lib/bajada-reglas.ts:27` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `eliminar_producto` · `apps/web/lib/eliminar-producto-reglas.ts:62` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `eliminar_producto_con_historia` · `apps/web/lib/eliminar-producto-reglas.ts:62` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `crear_producto_con_variantes` · `apps/web/lib/useColaProductos.ts:13` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros

## Funciones sin llamada detectada desde `apps/web` — 34

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
- `apartar_stock`
- `archivar_caja_prueba`
- `archivar_conteo_prueba`
- `archivar_producto_prueba`
- `archivar_venta_prueba`
- `cambiar_tienda_gestora_compra`
- `cargar_stock_inicial`
- `catalogo_crear_producto`
- `convertir_proforma_a_comprobante`
- `emitir_comprobante`
- `emitir_nota`
- `huellas_catalogo`
- `mover_interno`
- `quitar_comprador_de_tienda`
- `recalcular_compras`
- `recalcular_stock`
- `recibir_compras`
- `recibir_y_cerrar_compras`
- `registrar_gasto_legado_2026_09`
- `registrar_movimiento`
- `registrar_pago_compra`
- `trg_actividad_caja_movimientos`
- `trg_actividad_caja_traslados`
- `trg_actividad_cajas`
- `trg_actividad_cambios`
- `trg_actividad_separacion_creada`
- `trg_actividad_separacion_hijas`
- `trg_actividad_separaciones`
- `trg_actividad_ventas`
- `trg_pedidos_al_llegar`
