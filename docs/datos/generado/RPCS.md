# Funciones — la única puerta de escritura

> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — se reescribe entero cada vez que
> alguien corre `pnpm datos:generar`. Lo único editable a mano es la columna
> «Para qué sirve», que vive en `glosario.json` y este generador respeta.
>
> **Origen:** `supabase_db_cayla-dynamic`
> **Leído el:** 2026-09-12 20:18:01
> **Funciones en `retail`:** 23
>
> Escribir en esta base no se hace con un `insert`: se hace llamando a una de estas
> funciones, que hace todo o no hace nada. Lo que corre **como dueño** (`definer`) se
> salta los permisos por fila a propósito — por eso cada una tiene que validar sede y
> rol por su cuenta.
---


## Todas las funciones

### `abrir_caja`

```sql
abrir_caja(p_sede_id uuid, p_monto_apertura numeric)
  → uuid
```
*definer (corre como dueño) · volátil · 12 líneas de cuerpo*

### `cerrar_caja`

```sql
cerrar_caja(p_caja_id uuid, p_monto_contado numeric)
  → TABLE(monto_esperado numeric, monto_contado numeric, diferencia numeric)
```
*definer (corre como dueño) · volátil · 15 líneas de cuerpo*

### `cerrar_produccion`

```sql
cerrar_produccion(p_produccion_id uuid, p_costo_tela numeric, p_costo_avios numeric, p_costo_maquila numeric, p_buenas jsonb)
  → void
```
*definer (corre como dueño) · volátil · 43 líneas de cuerpo*

### `eliminar_produccion`

```sql
eliminar_produccion(p_produccion_id uuid)
  → void
```
*definer (corre como dueño) · volátil · 12 líneas de cuerpo*

### `es_lider`

```sql
es_lider()
  → boolean
```
*invoker (corre como quien llama) · estable · 1 líneas de cuerpo*

### `es_supervisor`

```sql
es_supervisor()
  → boolean
```
*invoker (corre como quien llama) · estable · 1 líneas de cuerpo*

### `fijar_stock_minimo`

```sql
fijar_stock_minimo(p_variante_id uuid, p_sede_id uuid, p_minimo integer DEFAULT NULL::integer)
  → void
```
*definer (corre como dueño) · volátil · 9 líneas de cuerpo*

### `fn_aplicar_movimiento`

```sql
fn_aplicar_movimiento(p_movimiento_id uuid)
  → void
```
*definer (corre como dueño) · volátil · 42 líneas de cuerpo*

### `fn_asiento_cuadra`

```sql
fn_asiento_cuadra()
  → trigger
```
*invoker (corre como quien llama) · volátil · 12 líneas de cuerpo*

### `mi_sede`

```sql
mi_sede()
  → uuid
```
*invoker (corre como quien llama) · estable · 1 líneas de cuerpo*

### `persona_actual`

```sql
persona_actual()
  → TABLE(id uuid, auth_user_id uuid, nombre text, sede_id uuid, rol text, email text)
```
*definer (corre como dueño) · estable · 5 líneas de cuerpo*

### `puede_operar_sede`

```sql
puede_operar_sede(p_sede_id uuid)
  → boolean
```
*invoker (corre como quien llama) · estable · 1 líneas de cuerpo*

### `recalcular_stock`

```sql
recalcular_stock()
  → void
```
*definer (corre como dueño) · volátil · 25 líneas de cuerpo*

### `recibir_lote`

```sql
recibir_lote(p_sede_id uuid, p_origen text, p_items jsonb, p_proveedor text DEFAULT NULL::text, p_numero_guia text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
  → uuid
```
*definer (corre como dueño) · volátil · 38 líneas de cuerpo*

### `registrar_asiento`

```sql
registrar_asiento(p_unidad_id uuid, p_glosa text, p_origen text, p_lineas jsonb, p_fecha date DEFAULT CURRENT_DATE, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id uuid DEFAULT NULL::uuid)
  → uuid
```
*definer (corre como dueño) · volátil · 34 líneas de cuerpo*

### `registrar_deposito`

```sql
registrar_deposito(p_sede_id uuid, p_monto numeric, p_nota text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE)
  → uuid
```
*definer (corre como dueño) · volátil · 11 líneas de cuerpo*

### `registrar_gasto`

```sql
registrar_gasto(p_sede_id uuid, p_categoria text, p_subtotal numeric, p_igv numeric, p_total numeric, p_especificacion text DEFAULT NULL::text)
  → uuid
```
*definer (corre como dueño) · volátil · 11 líneas de cuerpo*

### `registrar_movimiento`

```sql
registrar_movimiento(p_variante_id uuid, p_sede_id uuid, p_tipo text, p_cantidad integer, p_motivo text DEFAULT NULL::text, p_canal text DEFAULT NULL::text, p_sede_destino_id uuid DEFAULT NULL::uuid, p_monto numeric DEFAULT NULL::numeric, p_venta_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text, p_contenedor_id uuid DEFAULT NULL::uuid, p_lote_id uuid DEFAULT NULL::uuid)
  → uuid
```
*definer (corre como dueño) · volátil · 16 líneas de cuerpo*

### `registrar_produccion`

```sql
registrar_produccion(p_unidad_id uuid, p_cantidad integer, p_costo_tela numeric, p_costo_avios numeric, p_costo_maquila numeric, p_precio_taller numeric, p_variantes jsonb DEFAULT '[]'::jsonb, p_producto_id uuid DEFAULT NULL::uuid, p_referencia text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_detalle text DEFAULT NULL::text, p_es_muestra boolean DEFAULT false, p_fecha_entrega date DEFAULT NULL::date, p_marcar_terminado boolean DEFAULT false, p_nota text DEFAULT NULL::text, p_material text DEFAULT NULL::text)
  → uuid
```
*definer (corre como dueño) · volátil · 60 líneas de cuerpo*

### `registrar_venta`

```sql
registrar_venta(p_caja_id uuid, p_metodo_pago text, p_items jsonb, p_nota text DEFAULT NULL::text)
  → uuid
```
*definer (corre como dueño) · volátil · 31 líneas de cuerpo*

### `revertir_produccion_inventario`

```sql
revertir_produccion_inventario(p_produccion_id uuid)
  → void
```
*definer (corre como dueño) · volátil · 18 líneas de cuerpo*

### `set_etapa_produccion`

```sql
set_etapa_produccion(p_produccion_id uuid, p_etapa text, p_estado text)
  → void
```
*definer (corre como dueño) · volátil · 12 líneas de cuerpo*

### `set_updated_at`

```sql
set_updated_at()
  → trigger
```
*invoker (corre como quien llama) · volátil · 3 líneas de cuerpo*
