# ADR-0622 · Rendimiento de la base: medido con un año de datos, arreglado sin cambiar ninguna respuesta

- **Fecha:** 2026-11-07 · **Estado:** construido en la rama `claude/retail-system-audit-optimization-f2a453`. Cuatro migraciones, **pegadas en producción el 2026-11-07** y verificadas por md5: `20261107164000`, `20261107171000`, `20261107172000` y `20261107202000`. Más cambios de la web en el marco, Inicio, Vender, Caja y
  Comercial.
- **Pidió:** Felipe: «que sea rápido en sus respuestas de la base de datos… lo más rápido y escalable; una auditoría primero».
- **Sigue a:** ADR-0194 (la prueba de carga con un año sintético), ADR-0188 (concurrencia) y `20261101004000` (funciones de apoyo sin ajustes).

## El problema

Producción tiene poco volumen todavía. Medirla hoy no dice cómo se va a portar en 12 meses, y el conector de Supabase de esta sesión no la ve
(cuenta distinta). Se midió entonces sobre `cayla_carga`: una copia de `main` con las 95 migraciones nuevas y un año de operación sintética
(`pnpm carga:preparar`): 6 tiendas, 3.000 productos, 24.000 variantes, 144.000 filas de stock, 131.000 ventas, 263.000 líneas, 407.000
movimientos, 20.000 clientes y 2.200 cajas.

Un medidor llamó **254 funciones de lectura** que usa la web. Lo hizo como líder, con RLS real, en transacción de solo lectura y con todos los
parámetros opcionales en null. Estas pasaban el corte de producción, 8 s (PostgREST):

| Pantalla | Función | Antes |
|---|---|---|
| Compras ▸ Proveedores | `fn_proveedores_prendas`, `fn_proveedores_rendimiento`, `fn_proveedores_ventas_diarias`, `fn_proveedor_prendas` | > 15 s (cada una) |
| Caja / Historial (dueño de lo vendido) | `fn_vendido_por_empresa` | 18 s sin fechas, 2,7 s un mes |
| Nuevo producto (candidatas) | `fn_existencias_productos` con todos los productos | 505 s |

Otras 9 pasaban de 1 s:

| Función | Antes | Dónde |
|---|---|---|
| `fn_resumen_finanzas` | 6,8 s | Finanzas ▸ Resumen |
| `fn_observatorio` | 3,7 s | Inicio del Admin, cada 30 s |
| `fn_pos_alertas` | 3,3 s | Cuentas y dinero |
| `fn_cuadrar_depositos_vista` | 3,2 s | Cuadrar depósitos |
| `fn_cifras_clientas` | 2,4 s | Clientes |
| `fn_clientas_lista` | 1,9 s | Clientes |
| `fn_calidad` | 2,0 s | Análisis ▸ Calidad |
| `fn_resumen_variantes_json` | 2,0 s | Inventario ▸ Resumen |
| `fn_stock_por_sede_json` | 1,1 s | cada apertura de Vender |

**En la web**, el marco de cada pantalla esperaba hasta 4 tandas de consultas en serie antes del primer byte. Además:
- la caja abierta se leía dos veces por petición;
- Comercial hacía unas 120 llamadas a `fn_parametros_caja` por carga (una por tienda y día);
- Inicio, Vender y Caja esperaban lecturas en fila que no dependían unas de otras.

## La causa, en una línea cada una

Casi todo era un mismo error: **una pregunta hecha por fila que podía hacerse una vez**.

- `fn_proveedor_reparto` pasaba 525.000 eventos de venta por cinco ventanas, aunque casi toda prenda la trajo un solo proveedor. Con un solo
  proveedor, la parte es 1 y el redondeo no mueve nada. Además, cada función recalculaba el reparto de toda la base, también la que pide un solo
  proveedor.
- `fn_dinero_libro`, el libro de toda la plata, preguntaba `fn_cuenta_de_cobro` una vez por pago: unas 99.000 llamadas.
- `fn_pos_pendientes` filtraba el día con `(created_at at time zone …)::date`, que no usa índice, y lo hacía dos veces por lote.
- `fn_impuestos_igv_meses` y `fn_impuestos_panel` leían la historia entera de comprobantes dos veces por llamada.
- `fn_item_es_de_claure` y `fn_dueno_de_la_linea` se evaluaban por línea, y el planificador las copiaba dos o tres veces. Pasaba en
  `fn_observatorio`, `fn_club_compras_netas` (Clientes), `fn_calidad` y `fn_vendido_por_empresa`.
- `fn_existencias_productos` reagrupaba todo el stock una vez por producto, dentro de una subconsulta correlativa.
- `transferencias` no tenía índice por sede de origen ni de destino, y el contador de Traslados del menú la consulta en cada pantalla.

## Decisión

1. **Nunca cambia una respuesta.** Cada función nueva se comparó con la vieja por md5 de su salida ordenada. Se comparó como líder y como integrante,
   con argumentos reales, y con casos armados dentro de `begin … rollback` que ejercen las ramas raras: variantes de 2 y 3 proveedores,
   devoluciones, CLAURE, cuentas selladas, depósitos y saldo a favor de IGV. Lo que no daba idéntico se descartó.
2. **Se mide con volumen, no con la base de hoy.** El medidor quedó como receta: `pnpm carga:preparar` y el script de esta sesión (ver «Cómo se
   repite»). `scripts/carga/01_volumen.sql` se puso al día con el esquema.
3. **Toda migración que reescribe una función entera lleva un candado md5.** Se escribe desde el cuerpo de `main`, y producción puede tener otro
   (ADR-0194 encontró 46 funciones distintas). Por eso, antes de tocar nada, cada migración compara el md5 del cuerpo vivo contra el de `main` y el de
   la propia migración, y aborta diciendo cuál no coincide. Así se puede pegar dos veces y nunca pisa un parche en vivo.
4. **La web pide junto lo que no depende entre sí.**
   - `getCajaAbierta` y `getEmpresasAqui` usan `cache()`.
   - Se juntaron las lecturas en serie del recordatorio de cierre, del contador de Traslados, del Inicio, de Vender y de Caja.
   - Comercial usa `fn_metas_de_los_dias`, que llama a la misma `fn_parametros_caja` en un solo viaje. Si la función todavía no está en la base,
     vuelve a preguntar día por día.

## Resultado (misma copia, mismo medidor, antes → después)

- **Pasan de 8 s:** 6 → 0. **Pasan de 1 s:** 15 → 5. Todas siguen siendo funciones de lectura, sin cambio de firma ni de permisos.

| Función | Antes | Después |
|---|---|---|
| `fn_existencias_productos` (todos los productos) | > 15 s | 0,46 s |
| `fn_vendido_por_empresa` (sin fechas) | > 15 s | 0,8 s |
| `fn_proveedores_ventas_diarias` | > 15 s | 0,66 s |
| `fn_proveedores_rendimiento` | > 15 s | 2,2 s |
| `fn_proveedor_prendas(uno)` | > 15 s | ~0,4 s |
| `fn_resumen_finanzas` | 6,8 s | 2,7 s |
| `fn_observatorio` | 3,7 s | 0,7 s |
| `fn_pos_alertas` | 3,3 s | 0,47 s |
| `fn_cuadrar_depositos_vista` | 3,2 s | 0,49 s |
| Clientes (lista + cifras) | 4,3 s | 0,58 s |
| `fn_calidad` | 2,0 s | 0,47 s |
| Sin cuenta, Pagos sin cuenta, Conciliación, Saldos | ~0,9 s c/u | ~0,22 s c/u |

## Lo que no se hizo y por qué

Estas cambian el diseño o el negocio y las decide Felipe:

- **Vender descarga el stock de toda la red en cada apertura** (`fn_stock_por_sede_json`: 144.000 filas y 18 MB con un año). Se pasó a pedirlo por
  la prenda que se mira. Ya estaba pendiente desde ADR-0194 (#7).
- **Inventario ▸ Resumen** (`fn_resumen_variantes_json`, 1,9 s) calcula todas las tallas por todas las sedes. Hay dos salidas: calcular lo pesado
  solo para la sede pedida, o precalcularlo (ADR-0194 #8).
- **Compras ▸ Proveedores** sigue con ~2,2 s y calcula el reparto dos o tres veces por carga. Hay dos salidas:
  - una sola RPC para la página: ahorra la mitad de la CPU de la base;
  - una tabla derivada refrescada: la lectura baja a ~50 ms, pero muestra minutos de atraso.
- **El marco** sigue con 6 RPC de la persona por petición. Se pueden juntar en una sola (`fn_persona_actual_resumen` ampliada). Toca permisos y todas
  las pantallas, así que va aparte.
- **Funciones de apoyo con `security definer`/`set search_path`** (`fn_item_es_de_claure`, `fn_dueno_de_la_linea`, `fn_cuenta_de_cobro`): en local
  quitarlos no ganó nada. En producción, `20261101004000` midió hasta 100 veces más por llamada. Se mide allá con
  `scripts/rendimiento/diagnostico-produccion.sql` antes de tocarlas.
- **El tamaño del cómputo de Supabase** (ADR-0194 #9): se decide con los números de producción de ese mismo diagnóstico.

## Cómo se repite

1. `node scripts/carga/carga.mjs preparar` crea `cayla_carga` y nunca toca la base `postgres` compartida.
2. Aplicar en `cayla_carga` las migraciones que falten de `main`.
3. Medir cada función como líder, en transacción de solo lectura. La mediana de 2 corridas cuenta; el ruido de la Mac es alto, así que los bloques de
   `explain (analyze, buffers)` valen más que los milisegundos.
4. Para comparar una versión nueva: `begin; create or replace …; md5 de la salida; rollback;`, contra el md5 de la vieja.

## Riesgos

- **Reglas copiadas en la consulta.** `fn_vendido_por_empresa` lleva escrita la regla de `fn_dueno_de_la_linea`, y `fn_calidad` la de
  `fn_origen_producto`, para no llamarlas por línea. Si esas reglas cambian, estas dos también; lo dicen sus comentarios.
- **Dependen del volumen de hoy.** El atajo del reparto vale mientras pocas prendas tengan varios proveedores. Si son muchas, ese tramo cuesta lo de
  antes, pero solo para esas prendas.
- **Lo que no se probó.** Las pruebas de Postgres del repo (`scripts/pruebas/*.mjs`) no se corrieron contra la base compartida; las corre el CI. Las
  de reparto, `proveedor_reparto.mjs` y `proveedores_ventas_diarias.mjs`, pasaron contra `cayla_carga`. `proveedor_prendas_origen.mjs` ya fallaba
  igual en esa copia antes del cambio.
