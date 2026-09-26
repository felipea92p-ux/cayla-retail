# Diferencias — lo que la pantalla llama vs. lo que producción acepta

> ⚠️ **ARCHIVO GENERADO.** Se reescribe con `pnpm datos:comparar --md`.
> Comparadas 316 llamadas `.rpc` de `apps/web` contra 544 funciones del schema `retail` en producción: 269 con los parámetros leídos (se comparan uno por uno), 41 directas cuyos parámetros no se pudieron leer (solo se comprueba que la función exista), 6 con el nombre en un ternario o una variable.
> **Foto de producción: 2026-09-25 16:09 UTC.** Todo lo de este archivo es tan fresco como esa foto: una función
> creada o cambiada DESPUÉS sale como «no existe», con parámetros de más o con un aviso de un parámetro que ya no existe, aunque en
> producción ya esté bien. Antes de dar una pantalla por rota, confirmarlo en producción; para refrescar la foto,
> `docs/datos/generado/COMO-REFRESCAR.md`.

> **Palabras de este informe.** *Foto*: la lista de funciones de producción que está en `funciones-produccion.txt`, tomada en la fecha
> de arriba. *Aviso*: la pantalla no manda un parámetro que la función acepta (normal si tiene valor por defecto). *Sobrecarga*: dos
> funciones con el mismo nombre y distinta lista de parámetros: una llamada por nombre queda ambigua. Las `fn_*` (372 en la
> foto: en su mayoría disparadores, candados de dinero y ayudantes que llaman otras funciones) se dejan fuera de «sin llamada» a
> propósito; 117 sí las nombra una pantalla y salen en las secciones de arriba, y a las otras 255 no las nombra ninguna pantalla y aquí no se listan.

---

## Llamadas sin respaldo en la foto de producción — 13

Cada entrada es una llamada que **la foto no respalda**: la función no aparece, o la app manda un parámetro que la foto no
tiene. **No es lo mismo que «pantalla rota»**: una función creada o cambiada después de la foto sale aquí aunque en
producción ya esté bien. Confirmarlo antes de actuar:

```sql
select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname = '<nombre>';
```

Si la foto está vieja, refrescarla (`docs/datos/generado/COMO-REFRESCAR.md`). Si la entrada trae «Migración que la crea», esa
migración define la función: se pegó en producción después de la foto, o todavía no se ha pegado.

### `editar_marca` — no está en la foto

- **Dónde:** `apps/web/components/EditarMarcaModal.tsx:84`
- **Qué pasa:** la función `editar_marca` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260926150000_editar_marca.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_producto_se_puede_eliminar` — no está en la foto

- **Dónde:** `apps/web/components/EliminarProductoModal.tsx:45`
- **Qué pasa:** la función `fn_producto_se_puede_eliminar` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260926220000_eliminar_producto.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `eliminar_producto` — no está en la foto

- **Dónde:** `apps/web/components/EliminarProductoModal.tsx:58`
- **Qué pasa:** la función `eliminar_producto` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260926220000_eliminar_producto.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `eliminar_marca` — no está en la foto

- **Dónde:** `apps/web/components/MarcasLista.tsx:138`
- **Qué pasa:** la función `eliminar_marca` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260926213000_eliminar_marca.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `mover_interno` — parámetro de más

- **Dónde:** `apps/web/components/ReponerPisoModal.tsx:120`
- **Qué pasa:** manda `p_token` y la foto de producción no lo acepta
- **La app manda:** `p_ubicacion_id`, `p_variante_id`, `p_cantidad`, `p_sububicacion_origen_id`, `p_sububicacion_destino_id`, `p_nota`, `p_token`
- **La foto acepta:** `p_ubicacion_id`, `p_variante_id`, `p_cantidad`, `p_sububicacion_origen_id`, `p_sububicacion_destino_id`, `p_nota`
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_actividad` — no está en la foto

- **Dónde:** `apps/web/components/actividad/ListaActividad.tsx:43`
- **Qué pasa:** la función `fn_actividad` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260926090000_actividad_por_modulo.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_actividad_personas` — no está en la foto

- **Dónde:** `apps/web/components/actividad/PantallaActividad.tsx:37`
- **Qué pasa:** la función `fn_actividad_personas` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260926090000_actividad_por_modulo.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_calidad` — no está en la foto

- **Dónde:** `apps/web/lib/calidad.ts:56`
- **Qué pasa:** la función `fn_calidad` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260918192000_panel_calidad.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_calidad_danadas` — no está en la foto

- **Dónde:** `apps/web/lib/calidad.ts:57`
- **Qué pasa:** la función `fn_calidad_danadas` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260918192000_panel_calidad.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_comercial_sedes` — no está en la foto

- **Dónde:** `apps/web/lib/comercial.ts:62`
- **Qué pasa:** la función `fn_comercial_sedes` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260918191000_panel_comercial.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_comercial_horas` — no está en la foto

- **Dónde:** `apps/web/lib/comercial.ts:63`
- **Qué pasa:** la función `fn_comercial_horas` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260918191000_panel_comercial.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `fn_comercial_colaboradoras` — no está en la foto

- **Dónde:** `apps/web/lib/comercial.ts:64`
- **Qué pasa:** la función `fn_comercial_colaboradoras` no está en la foto de producción (2026-09-25 16:09 UTC)
- **Migración que la crea:** `supabase/migrations/20260918191000_panel_comercial.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

### `crear_producto_con_stock_inicial` — no está en la foto

- **Dónde:** `apps/web/components/NuevoProductoForm.tsx:366`
- **Qué pasa:** la función `crear_producto_con_stock_inicial` no está en la foto de producción (2026-09-25 16:09 UTC); sus parámetros no se pudieron leer
- **Migración que la crea:** `supabase/migrations/20260926130000_alta_producto_con_stock_inicial.sql` (se pegó después de la foto, o todavía no)
- **Solo si producción sigue así,** esa pantalla fallaría siempre en las tiendas (no es intermitente): confírmalo con la consulta de arriba.

## Sobrecargas — 0

Ninguna. Cada función tiene una sola firma en producción.

## Avisos — 24

- `registrar_comprobante_produccion` · `apps/web/components/ComprobanteProduccionForm.tsx:120` — no manda `p_igv_porcentaje` (normal si tienen valor por defecto)
- `registrar_movimiento_dinero` · `apps/web/components/GastosPanel.tsx:602` — no manda `p_cuenta_origen_id`, `p_fecha`, `p_comision`, `p_caja_id` (normal si tienen valor por defecto)
- `recibir_insumo` · `apps/web/components/InsumoModales.tsx:151` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_consumo_insumo` · `apps/web/components/OrdenInsumos.tsx:124` — no manda `p_nota` (normal si tienen valor por defecto)
- `devolver_insumo_de_produccion` · `apps/web/components/OrdenInsumos.tsx:154` — no manda `p_nota` (normal si tienen valor por defecto)
- `resolver_prenda_danada` · `apps/web/components/ResolverDanadosModal.tsx:71` — no manda `p_proveedor_id` (normal si tienen valor por defecto)
- `registrar_proveedor` · `apps/web/components/alta-producto/NuevaMarcaForm.tsx:161` — no manda `p_contacto`, `p_rubro`, `p_plazo_credito_dias`, `p_forma_pago_preferida`, `p_telefono`, `p_banco`, `p_cuenta_bancaria` (normal si tienen valor por defecto)
- `separar_prendas` · `apps/web/components/apartados/ApartarVista.tsx:251` — no manda `p_clienta_id` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/components/apartados/ApartarVista.tsx:280` — no manda `p_estados` (normal si tienen valor por defecto)
- `fn_presupuesto_propuesta` · `apps/web/components/finanzas/ConfiguracionPresupuesto.tsx:115` — no manda `p_hoy` (normal si tienen valor por defecto)
- `registrar_adjunto_compra` · `apps/web/lib/adjuntos-compra.ts:84` — no manda `p_nota_credito_id` (normal si tienen valor por defecto)
- `fn_balance_general` · `apps/web/lib/balance.ts:33` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `fn_configuracion_tiendas` · `apps/web/lib/configuracion.ts:20` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_igv_credito_fiscal` · `apps/web/lib/deuda-consolidada.ts:34` — no manda `p_mes` (normal si tienen valor por defecto)
- `fn_gastos_lista` · `apps/web/lib/gastos.ts:103` — no manda `p_solo_empresa` (normal si tienen valor por defecto)
- `fn_activos_lista` · `apps/web/lib/gastos.ts:120` — no manda `p_corte` (normal si tienen valor por defecto)
- `fn_presupuesto_vs_real` · `apps/web/lib/presupuesto.ts:14` — no manda `p_ubicacion_id`, `p_hoy` (normal si tienen valor por defecto)
- `fn_proveedor_costo_evolucion` · `apps/web/lib/proveedores.ts:267` — no manda `p_limite` (normal si tienen valor por defecto)
- `fn_lineas_comprobantes_produccion` · `apps/web/lib/recibir-produccion.ts:18` — no manda `p_comprobante_id` (normal si tienen valor por defecto)
- `fn_estado_resultados` · `apps/web/lib/resultados.ts:16` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `fn_campanas_reporte` · `apps/web/lib/resultados.ts:27` — no manda `p_ubicacion_id` (normal si tienen valor por defecto)
- `crear_rol` · `apps/web/lib/roles-acciones.ts:26` — no manda `p_descripcion` (normal si tienen valor por defecto)
- `buscar_separaciones` · `apps/web/lib/separaciones.ts:37` — no manda `p_texto`, `p_estados` (normal si tienen valor por defecto)
- `fn_totales_historial_ventas` · `apps/web/lib/ventas-historial.ts:166` — no manda `p_ids` (normal si tienen valor por defecto)

## No analizadas — 59

Estas 59 entradas son **entradas, no llamadas** (un ternario da dos; una función mencionada da una aunque no haya llamada):
arman sus parámetros fuera de la propia llamada, o la pantalla nombra la función sin un `.rpc("…")` directo (un ternario, un
ayudante, una constante), o usan `.rpc` como valor (`.bind`, `const { rpc } = x`). No se pueden revisar leyendo el texto.
**No están aprobadas: están sin revisar.** Una llamada directa o de un ternario a una función que la foto no tiene también está arriba,
entre las «sin respaldo» (p. ej. `crear_producto_con_stock_inicial`). Lo que aquí NO se ve: una llamada indirecta a una función que ni la
foto ni ninguna migración del repo conocen.

- `(alias de rpc)` · `apps/web/app/(app)/productos/categorias/page.tsx:42` — `.rpc` se usa como valor (se llama con un cast: `(x.rpc as …)(…)`): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/anular/route.ts:50` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/consultar-anulacion/route.ts:40` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `(alias de rpc)` · `apps/web/app/api/lucode/emitir/route.ts:34` — `.rpc` se usa como valor (.rpc.bind(…)): la función que se llama por ahí no se ve
- `reactivar_categoria` · `apps/web/app/api/productos/categorias/route.ts:149` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `desactivar_categoria` · `apps/web/app/api/productos/categorias/route.ts:149` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_movimiento` · `apps/web/components/AjustarInventarioModal.tsx:180` — el objeto se arma con «...», no se puede leer entero
- `(nombre calculado)` · `apps/web/components/BajarAlPisoForm.tsx:376` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `cerrar_linea_compra` · `apps/web/components/CerrarFaltanteModal.tsx:65` — el objeto se arma con «...», no se puede leer entero
- `registrar_pagos_compra` · `apps/web/components/CompraDetallePanel.tsx:278` — el objeto se arma con «...», no se puede leer entero
- `registrar_compra` · `apps/web/components/CompraFormV2.tsx:365` — el objeto se arma con «...», no se puede leer entero
- `guardar_gasto_fijo` · `apps/web/components/GastosFijosYActivos.tsx:382` — el objeto se arma con «...», no se puede leer entero
- `registrar_gasto` · `apps/web/components/GastosPanel.tsx:599` — el objeto se arma con «...», no se puede leer entero
- `fn_impuestos_registro_ventas` · `apps/web/components/ImpuestosPanel.tsx:69` — los parámetros no van escritos ahí mismo
- `fn_impuestos_registro_compras` · `apps/web/components/ImpuestosPanel.tsx:71` — los parámetros no van escritos ahí mismo
- `crear_producto_con_stock_inicial` · `apps/web/components/NuevoProductoForm.tsx:366` — los parámetros no van escritos ahí mismo
- `registrar_pago_compras_medios` · `apps/web/components/PagoJuntosModal.tsx:189` — el objeto se arma con «...», no se puede leer entero
- `registrar_pago_compras` · `apps/web/components/PagoJuntosModal.tsx:199` — el objeto se arma con «...», no se puede leer entero
- `catalogo_actualizar_producto` · `apps/web/components/ProductoForm.tsx:346` — el objeto se arma con «...», no se puede leer entero
- `actualizar_proveedor` · `apps/web/components/ProveedorModal.tsx:302` — el objeto se arma con «...», no se puede leer entero
- `registrar_proveedor` · `apps/web/components/ProveedorModal.tsx:306` — los parámetros no van escritos ahí mismo
- `guardar_cuentas_proveedor` · `apps/web/components/ProveedorModal.tsx:317` — los parámetros no van escritos ahí mismo
- `desactivar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:177` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `reactivar_proveedor` · `apps/web/components/ProveedoresPanel.tsx:177` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:487` — los parámetros no van escritos ahí mismo
- `registrar_venta` · `apps/web/components/PuntoDeVenta.tsx:1040` — los parámetros no van escritos ahí mismo
- `reasignar_reparto_compra` · `apps/web/components/ReasignarReparto.tsx:146` — el objeto se arma con «...», no se puede leer entero
- `recibir_envio` · `apps/web/components/RecepcionEnvio.tsx:675` — los parámetros no van escritos ahí mismo
- `recibir_lote` · `apps/web/components/RecepcionFormV2.tsx:97` — los parámetros no van escritos ahí mismo
- `registrar_activo` · `apps/web/components/RegistrarGastoModal.tsx:200` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_gasto` · `apps/web/components/RegistrarGastoModal.tsx:200` — el nombre va dentro de una expresión (un ternario…), no como un texto solo: no se leen sus parámetros
- `registrar_nota_credito_compra` · `apps/web/components/RegistrarNotaCreditoModal.tsx:204` — el objeto se arma con «...», no se puede leer entero
- `registrar_reembolso_proveedor` · `apps/web/components/SaldoFavorAcciones.tsx:61` — el objeto se arma con «...», no se puede leer entero
- `(nombre calculado)` · `apps/web/components/finanzas/CierreMes.tsx:253` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `registrar_movimiento_dinero` · `apps/web/components/finanzas/CuentasDinero.tsx:859` — el objeto se arma con «...», no se puede leer entero
- `editar_cuenta_dinero` · `apps/web/components/finanzas/EditarCuentaModal.tsx:90` — los parámetros no van escritos ahí mismo
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:283` — el objeto se arma con «...», no se puede leer entero
- `fn_productos` · `apps/web/lib/catalogo-v2.ts:363` — el objeto se arma con «...», no se puede leer entero
- `fn_productos_resumen` · `apps/web/lib/catalogo-v2.ts:386` — los parámetros no van escritos ahí mismo
- `por_pagar_tramos` · `apps/web/lib/compras-indicadores.ts:110` — el objeto se arma con «...», no se puede leer entero
- `resumen_recepciones` · `apps/web/lib/compras-indicadores.ts:178` — los parámetros no van escritos ahí mismo
- `listar_recepciones_compras` · `apps/web/lib/compras-indicadores.ts:213` — el objeto se arma con «...», no se puede leer entero
- `resumen_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:252` — los parámetros no van escritos ahí mismo
- `recepciones_sin_comprobante` · `apps/web/lib/compras-indicadores.ts:282` — el objeto se arma con «...», no se puede leer entero
- `listar_compras_operativo` · `apps/web/lib/compras.ts:192` — el objeto se arma con «...», no se puede leer entero
- `listar_compras` · `apps/web/lib/compras.ts:219` — el objeto se arma con «...», no se puede leer entero
- `lineas_compra_operativo` · `apps/web/lib/compras.ts:392` — el objeto se arma con «...», no se puede leer entero
- `fn_prioridad_conteo` · `apps/web/lib/conteos.ts:200` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:178` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos` · `apps/web/lib/movimientos-v2.ts:208` — el objeto se arma con «...», no se puede leer entero
- `fn_movimientos_resumen` · `apps/web/lib/movimientos-v2.ts:227` — los parámetros no van escritos ahí mismo
- `fn_facturas_para_nota_credito` · `apps/web/lib/notas-credito.ts:148` — el objeto se arma con «...», no se puede leer entero
- `asignar_rol` · `apps/web/lib/roles-acciones.ts:50` — los parámetros no van escritos ahí mismo
- `(nombre calculado)` · `apps/web/lib/useColaOffline.ts:106` — el nombre de la función no va escrito ahí mismo (una variable, una constante o una plantilla): no se sabe cuál llama
- `fn_productos_por_categoria` · `apps/web/app/(app)/productos/categorias/page.tsx:42` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `cerrar_periodo` · `apps/web/components/finanzas/CierreMes.tsx:273` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `reabrir_periodo` · `apps/web/components/finanzas/CierreMes.tsx:351` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros
- `bajar_al_piso` · `apps/web/lib/bajada-reglas.ts:27` — el nombre va entre comillas (un ayudante, una constante…) y la foto de producción NO tiene esa función; la crea supabase/migrations/20260926000200_bajada_piso_funciones.sql (posterior a la foto, sin pegar aún en producción, o retirada después)
- `crear_producto_con_variantes` · `apps/web/lib/useColaProductos.ts:13` — el nombre va entre comillas pero no como `.rpc("…")` directo (un ayudante, una constante…): no se leen sus parámetros

## Funciones sin llamada detectada desde `apps/web` — 21

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
- `archivar_caja_prueba`
- `archivar_conteo_prueba`
- `archivar_producto_prueba`
- `archivar_venta_prueba`
- `cambiar_tienda_gestora_compra`
- `catalogo_crear_producto`
- `convertir_proforma_a_comprobante`
- `emitir_comprobante`
- `emitir_nota`
- `quitar_comprador_de_tienda`
- `recalcular_compras`
- `recalcular_stock`
- `recibir_compras`
- `recibir_y_cerrar_compras`
- `registrar_gasto_legado_2026_09`
- `registrar_pago_compra`
- `registrar_pedido_no_atendido`
