# ADR-0212 — Nuevo producto con su stock de hoy (la carga inicial, en la misma operación)

**Fecha:** 2026-09-26
**Estado:** Construido y probado en local (Postgres desechable y navegador sin base). **No está en producción:** falta
pegar `supabase/migrations/20260926130000_alta_producto_con_stock_inicial.sql` en el SQL Editor **antes** de publicar la
web; si no, «Crear producto» falla entero («function does not exist»).
**Número:** se escribió como 0211; 0210 y 0211 los tomaron otras ramas el mismo día (`0210-cola-sin-conexion-generica-empezando-por-recibir.md`, `0211-los-desplegables-fixed-van-en-portal-a-document-body.md`).
**Decidió:** Felipe, el 2026-09-26: «estoy pasando mi sistema desde 0 y no es una llegada de mercadería, es la que ya
está; me interesaría 0 papeleo por ahora». Lo técnico (cómo se guarda, dónde queda, quién puede) lo decidí yo con esa
regla.
**Módulo:** Catálogo (alta de producto) e Inventario (Halcón: `movimientos`/`stock`). No crea módulo ni tabla.

## El problema

«Nuevo producto» pedía todo menos cuántas unidades hay. CAYLA está pasando su tienda al sistema desde cero: la prenda
ya está colgada o en el almacén, no «llega» de un proveedor. Después de crearla había que ir a Existencias ▸ Ajustar
stock ▸ «Reposición» y cargarla talla por talla.

En producción (consulta de solo lectura del 2026-09-26), el 24 y 25-sep entraron **152 unidades por «Ajuste ·
reposición»** contra 50 por una recepción con origen. Tres costos de ese atajo:

- Queda como «Ajuste», así que se mezcla con las correcciones de verdad y ninguna lectura puede separar la carga
  inicial de un faltante corregido.
- Frescura (ADR-0208) no sabe desde cuándo está la prenda: sin llegada ni bajada, el reloj de tienda y el de piso
  arrancan en blanco. La «Reposición» en el piso ya se cerró (`20260926000400`) justo por eso.
- Un producto creado con prisa quedaba en 0 hasta que alguien se acordara, y ese «0» ya no quiere decir «se agotó».

## Decisión

Un **quinto paso** en Nuevo producto, «Cuántas tienes hoy»: la misma tabla talla × color del paso 4, pero con un
número por celda, más «¿Dónde están?» (colgadas en el piso o guardadas en el almacén). Todo se guarda en **una sola
transacción** con el producto: RPC nueva `crear_producto_con_stock_inicial`.

```
DECIDÍ: la carga inicial es una ENTRADA con motivo `carga_inicial` (vocabulario que ya existía: `movimientos-reglas.ts`
        la muestra como «Carga inicial» en Entradas y Análisis la cuenta como llegada, `20260924010700` línea 514), al
        almacén de la sede activa, firmada por el responsable (ADR-0162). «Colgadas en el piso» = la misma entrada al
        almacén + `bajar_al_piso` en la misma transacción: Frescura ve una bajada con hora, nunca un piso que sube solo.
DESCARTÉ: (a) recibirla como «Ingreso sin comprobante» (`recibir_lote`) porque Felipe fue explícito en que no es una
        llegada, y porque inflaría «Unidades sin comprobante» del mes (R-08, el número para el contador) con toda la
        migración; (b) usar el ajuste («Reposición», `registrar_movimiento`) porque es lo que hay hoy y deja la carga
        mezclada con las correcciones, y además es solo del líder (ADR-0143); (c) crear el producto y después cargar el
        stock en otra llamada desde la pantalla, porque si la segunda falla queda un producto sin su stock y la persona
        cree que se guardó todo; (d) una entrada directa al piso, porque es exactamente la puerta que se cerró el
        2026-09-25 (`20260926000400`); la otra sesión de Frescura descartó por lo mismo su motivo `carga_existente`.
SE ROMPE SI: alguien usa esta puerta para mercadería que LLEGA (con o sin factura): entra sin costo de compra ni
        proveedor documentado y no aparece en Compras, Por pagar ni en «sin comprobante». La pantalla lo dice en su nota,
        pero la base no puede distinguirlo. Por eso esta puerta es para el paso al sistema y hay que cerrarla cuando
        termine (ver «Pendiente»).
```

### Quién puede, y por qué no hace falta ser líder

```
DECIDÍ: cargar stock inicial lo puede quien puede crear el producto (`fn_puede_editar_catalogo`) Y operar esa tienda
        (`fn_puede_operar_ubicacion`, la misma regla que `recibir_lote`), y solo para prendas SIN ningún movimiento en esa
        tienda (`fn_cargar_stock_inicial`, hint `carga_con_historia`). «Colgadas en el piso» pide además el módulo
        «Bajada al piso» (lo exige `bajar_al_piso`; la pantalla lo apaga si la cuenta no lo tiene).
DESCARTÉ: exigir líder, como el ajuste (ADR-0143). Ese candado existe para que nadie tape un faltante con un ajuste, y
        una prenda sin historia no tiene faltante que tapar. Exigir líder habría dejado fuera a la terminal de la tienda,
        que es justo la que está cargando el catálogo hoy.
SE ROMPE SI: una prenda YA vendida o recibida pudiera recibir una carga inicial. No puede: el candado mira `movimientos`
        de esa tienda después de tomar los candados en orden (ADR-0190). Probado en F10.
```

### Cómo se escribió (sin copiar funciones vivas)

`crear_producto_con_stock_inicial` **llama** a `crear_producto_con_variantes` y a `bajar_al_piso` en vez de copiar sus
cuerpos: hereda sus candados y cualquier parche en vivo futuro (el problema de `reemplazar_vivo` que rompió Análisis el
2026-09-25). Busca el id de cada variante recién nacida por su talla y color, y si una cantidad no encuentra su
variante, no crea nada (hint `carga_sin_variante`). La carga en sí vive en `fn_cargar_stock_inicial`, **interna**
(`revoke` a `public`, `anon` y `authenticated`), para poder reutilizarla el día que se quiera cargar stock inicial a un
producto ya creado sin tocar esta lógica.

### Sin conexión (ADR-0210)

El alta ya se podía guardar sin red (cola en el navegador, PR #436, fusionado el mismo día). Con esta decisión:

- La cola encola `crear_producto_con_stock_inicial`. La lista blanca `RPCS_PRODUCTOS` (`lib/useColaProductos.ts`)
  conserva `crear_producto_con_variantes`, para que un alta guardada sin red ANTES de publicar esta versión no se descarte
  como inválida al volver la conexión.
- Con stock, la operación encolada firma con la hora del alta (`x-momento`, el mismo mecanismo que la venta sin conexión,
  acotado a 7 días). La carga firma con el responsable (`fn_actor_persona_id`) y, sin esa hora, un alta hecha a las 7 p. m.
  que sube al día siguiente se rechazaría porque la persona ya marcó su salida. `crear_producto_con_variantes` no pedía
  responsable; por eso antes no hacía falta.
- Las unidades se cargan al subir, con la fecha de subida (`movimientos.created_at`), no la del alta. Para una carga
  inicial la diferencia es de horas y no cambia ninguna decisión.

## Estados que dejan de ser posibles

| Estado imposible | Qué lo impide |
|---|---|
| Producto creado con cantidades y sin su stock (o stock sin producto) | Una sola transacción; F7 prueba que un fallo en la carga o en la bajada no deja ni el producto |
| La misma carga dos veces por un doble clic o un reintento de red | El token del alta: si el producto ya existe, se devuelve sin cargar. Dos llegadas simultáneas se ponen en fila con `pg_advisory_xact_lock` (ADR-0190): la segunda devuelve el mismo producto. Probado con dos sesiones y COMMIT reales |
| Carga inicial sobre una prenda con historia en esa tienda | `carga_con_historia` |
| Prendas en el piso sin bajada (Frescura con huecos) | «Piso» = almacén + `bajar_al_piso` |
| Una cantidad imposible (decimal, negativa, texto, más de 9999) | La base la rechaza antes de crear nada (`carga_cantidad_invalida`); la pantalla ni la deja escribir |
| Crear el producto sin haber decidido el stock | El paso 5 exige cantidades o marcar «Todavía no tengo unidades» (`problemasAlta`) |

## Números (por qué no hace falta nada más)

El paso al sistema es de 300 a 900 SKU (BACKLOG, «catálogo real»), unas 20 variantes por producto como máximo: una RPC
por producto, con 20 inserciones en `movimientos`. En hora punta de carga eso es una operación por minuto; no hace falta
cola, caché ni lote masivo.

## Verificación

- `scripts/pruebas/alta_con_stock_inicial.mjs` (`pnpm pruebas:alta-con-stock-inicial`, cableada en CI): 28 casos en
  Postgres desechable, todos en verde. Tres mutaciones del SQL (sin el retorno del reintento, sin el candado de
  historia, sin la bajada) las detecta la prueba.
- Carrera real con COMMIT: dos llegadas del mismo intento a la vez devuelven el mismo producto y 4 unidades, no 8. Sin
  el candado del token, la segunda mostraba un error de algo que sí se había guardado.
- Navegador (formulario real con datos de mentira, sin base): el paso 5 a 1440 px y a 375 px (la tabla entra entera,
  sin desplazamiento lateral), la celda quitada en el paso 4 sale rayada y sin campo, totales por fila y columna, Enter
  no envía, «Todavía no tengo» deja crear, y sin el módulo «Bajada al piso» el piso sale apagado con su explicación.
- `tsc`, `eslint` y la batería web completa (152 archivos, 77.268 pruebas) en verde.

## Cómo se pega en producción

Tal cual, en una vez, en el SQL Editor (ya trae `set search_path = retail, ...`). Solo crea dos funciones: no toca
tablas en uso, ni políticas ni disparadores (ADR-0195 no aplica). Se puede pegar dos veces. **Después** se publica la
web. Verificación de solo lectura después de pegar:

```sql
select to_regprocedure('retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean)') is not null as rpc,
       not has_function_privilege('authenticated', 'retail.fn_cargar_stock_inicial(uuid, jsonb, text)', 'execute') as carga_interna;
```

## Pendiente

- **Cerrar la puerta cuando termine el paso al sistema.** Pasado ese día, la mercadería nueva llega por Compras o por
  «Recibir sin comprobante», y la carga inicial solo sirve para inventar stock sin papeles. Opciones para decidir con
  Felipe: una fecha de cierre en Configuración, o un módulo propio «Carga inicial» que el líder apaga.
- **Productos que ya se crearon sin stock** (los de producción de antes de esto) no pueden usar el paso 5.
  `fn_cargar_stock_inicial` ya sirve para ellos (solo prendas sin historia); falta la pantalla.
- Una fila en `docs/datos/generado/` cuando se pegue en producción (`pnpm datos:generar:produccion`).
