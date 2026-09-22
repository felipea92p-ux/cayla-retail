# Fase 5 — Producción del Taller, verificado directo (2026-09-22, complementa el workflow)

> El agente `produccion_infra` y el agente `produccion_ordenes` (ver `fase-5-recetas-verificadas.md`) encontraron un
> conflicto real de mecanismo entre sus dos recetas — la síntesis pidió fusionarlas en un solo bloque, un solo autor.
> Antes de escribir ese bloque, verifiqué yo mismo (no vía workflow) el esquema exacto de las 10 tablas y las 8 RPC
> reales de Producción, con `pg_get_functiondef`/`pg_constraint`/`information_schema` en vivo contra `vovjyyiafkxteijimpuy`.
> Esto es la fuente de verdad para escribir el bloque fusionado — más confiable que la prosa de cualquiera de los dos
> agentes, que a veces resumía en vez de citar textual.

## Orden estricto de inserción (el que manda)

```
proveedores_produccion
  → insumos
    → comprobantes_produccion (cabecera, líder, como registrar_comprobante_produccion)
      → comprobantes_produccion_items (líneas: insumo_id + cantidad + costo_unitario; subtotal = round(cant*costo,2))
      → comprobantes_produccion_pagos (si condicion='contado', paga el total exacto)
        → comprobantes_produccion_recepciones (una por comprobante, como recibir_comprobante_produccion)
          → insumo_lotes (UNA fila por línea recibida — comprobante_item_id y recepcion_id son FK REALES, nunca NULL)
          → movimientos_insumo tipo='compra' (una por lote, mismo costo_unitario del lote)
            → producciones + produccion_lineas (como abrir_produccion; cantidad_plan = Σ líneas)
              → movimientos_insumo tipo='consumo' (FIFO real: el lote más antiguo con saldo > 0, nunca cruza lotes
                dentro de UN consumo — si no alcanza, se necesitan dos filas de consumo sobre dos lotes)
                → fn_recalcular_costo_insumos_produccion (recalcula costo_tela/costo_avios desde los movimientos_insumo
                  de esa producción — llamarlo una vez al final de todos los consumos de esa OP, no por consumo)
                  → cerrar_produccion (cantidad_buenas por línea, estado='terminada', inventariado_at=ahora salvo
                    muestra, UN movimiento 'entrada' motivo='produccion' por línea con cantidad_buenas > 0, y
                    fn_recalcular_costo_variante por esa misma línea — ver abajo)
```

Chequeo final obligatorio (lo pidió el agente de infra, no puede escribirlo solo porque depende del otro bloque):
`select insumo_id, ubicacion_id from v_insumo_saldos where fisico < 0` debe devolver 0 filas.

## Columnas exactas (confirmado en vivo, 2026-09-22)

### `proveedores_produccion`
`id uuid PK, nombre text NOT NULL (btrim>0), rubro text NOT NULL CHECK IN (tela,avios,maquila,otro), ruc text NULLABLE
CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$'), contacto text, telefono text, plazo_credito_dias int CHECK(>0 o null),
forma_pago_preferida text CHECK IN (transferencia,yape,plin,efectivo,deposito,otro) o null, banco text,
cuenta_bancaria text, cci text CHECK (cci ~ '^[0-9]{20}$' o null), celular_billetera text CHECK (~'^9[0-9]{8}$' o
null), billeteras text[] CHECK (cardinality 1-2, <@ ARRAY['yape','plin']), titular_cuenta text (2-120 chars),
activo boolean NOT NULL default true, created_at timestamptz default now()`.
CHECK `proveedores_produccion_billetera_coherente`: `celular_billetera IS NULL) = (billeteras IS NULL)` — los dos
juntos o ninguno.
**El plan decía "reutilizar el patrón de RUC de la Fase 3" — es falso: la Fase 3 solo LEE ruc de `proveedores` ya
existentes, nunca genera uno. El único patrón de 11 dígitos que existe hoy vive en el fixture LOCAL de pruebas
(`scripts/demo/local/fixtures-produccion-simulada.sql:69`, `'20' || lpad((100000+g)::text, 9, '0')`), no en el
generador real. Usar ese MISMO formato pero determinista con `pg_temp.h()`, por ejemplo:
`'20' || lpad((100000 + floor(pg_temp.h('ruc:'||clave) * 899999999))::text, 9, '0')`.**

### `insumos`
`id uuid PK, codigo text UNIQUE NOT NULL, nombre text NOT NULL, tipo text NOT NULL CHECK IN (tela,avio),
unidad_medida text NOT NULL CHECK IN (metro,unidad,kilo,cono,par,docena), proveedor_id uuid FK → proveedores_produccion
(nullable), merma_pct numeric NOT NULL default 0 CHECK (>=0 AND <0.5), stock_minimo numeric nullable CHECK(>=0 o
null), archivado_at timestamptz nullable, nota text, created_at/updated_at timestamptz default now()`.

### `comprobantes_produccion`
`id uuid PK, proveedor_id uuid NOT NULL FK, tipo text NOT NULL default 'factura' CHECK IN (factura,boleta,
nota_venta), serie text NOT NULL (btrim>0), numero text NOT NULL (btrim>0, es TEXTO no integer), fecha_emision date
NOT NULL default CURRENT_DATE, condicion text NOT NULL CHECK IN (contado,credito), fecha_vencimiento date nullable
(NOT NULL si condicion=credito), subtotal/igv/total numeric NOT NULL (todos >=0; total=subtotal+igv EXACTO — CHECK
`comprobantes_produccion_total_cuadra`; igv=0 salvo tipo=factura), estado text NOT NULL default 'vigente' CHECK IN
(vigente,anulada), motivo_anulacion text nullable (NOT NULL si anulada), nota text, usuario_id uuid FK → personas
(el líder que registra — `registrar_comprobante_produccion` exige `fn_es_lider()`), token_cliente uuid UNIQUE
nullable (dejar NULL en el seed), created_at timestamptz default now()`.
UNIQUE real: `(proveedor_id, serie, numero)`.

### `comprobantes_produccion_items`
`id uuid PK, comprobante_id uuid NOT NULL FK, insumo_id uuid nullable FK → insumos (NULL solo si es concepto libre,
no insumo del catálogo — CHECK exige insumo_id o descripcion), descripcion text nullable, cantidad numeric NOT NULL
(>0), costo_unitario numeric NOT NULL (>=0), subtotal numeric nullable (parece calculado en la RPC como
round(cantidad*costo_unitario,2), pero la columna NO es GENERATED — hay que insertarlo a mano igual que hace el RPC)`.

### `comprobantes_produccion_pagos`
`id uuid PK, comprobante_id uuid NOT NULL FK, fecha date NOT NULL default CURRENT_DATE, monto numeric NOT NULL (>0),
metodo text NOT NULL CHECK IN (transferencia,yape,plin,efectivo,deposito,otro), referencia text, usuario_id uuid FK,
created_at timestamptz default now(), grupo_id uuid nullable (dejar NULL, es para pago-por-lote de varios
comprobantes — no lo usa este seed)`.
Regla real de `registrar_comprobante_produccion`: si `condicion='contado'`, la suma de pagos debe ser EXACTAMENTE
el total (no solo ≥). A crédito, el seed puede dejar sin pagos (no es obligatorio) o simularlos como hace Fase 3
con `compra_pagos` si se quiere más realismo — no es necesario para el volumen objetivo (~12 comprobantes).

### `comprobantes_produccion_recepciones`
`id uuid PK, comprobante_id uuid NOT NULL FK, ubicacion_id uuid NOT NULL FK → ubicaciones (siempre 'Taller' en este
seed — `recibir_comprobante_produccion` exige `ubicaciones.tipo='taller'`), nota text, usuario_id uuid FK, token_cliente
uuid UNIQUE nullable, created_at timestamptz default now()`.
**Una recepción por comprobante alcanza** (recibir todas sus líneas de insumo de una vez, como hace un líder real que
recibe todo el pedido junto) — no hace falta simular recepciones parciales para el volumen objetivo.

### `insumo_lotes`
`id uuid PK, insumo_id uuid NOT NULL FK, ubicacion_id uuid NOT NULL FK (= Taller), codigo_lote text nullable (usar
serie-numero del comprobante, ej. 'FD01-00000003'; si dos líneas del mismo insumo en el mismo comprobante, sufijo
'/2'), proveedor_id uuid nullable FK (= comprobantes_produccion.proveedor_id de esa línea), cantidad_ingresada numeric
NOT NULL (>0), costo_unitario numeric NOT NULL (>=0, = el costo_unitario de la línea del comprobante, SIN IGV),
documento text nullable (= mismo codigo_lote), fecha_ingreso date NOT NULL default CURRENT_DATE, origen text NOT NULL
default 'compra' CHECK IN (compra,saldo_inicial) — **usar SIEMPRE 'compra' en este seed, nunca 'saldo_inicial'** (no
hay ninguna receta que pida saldo inicial sin comprobante), nota text, created_at timestamptz default now(),
comprobante_item_id uuid nullable FK → comprobantes_produccion_items (**PONERLO SIEMPRE** — es lo que
`fn_recalcular_costo_insumos_produccion`/trazabilidad esperan, aunque la columna en sí sea nullable), recepcion_id
uuid nullable FK → comprobantes_produccion_recepciones (**PONERLO SIEMPRE**, mismo motivo)`.

### `movimientos_insumo`
`id uuid PK, insumo_id uuid NOT NULL FK, insumo_lote_id uuid nullable FK (NOT NULL salvo tipo='ajuste' — CHECK
`movimientos_insumo_lote_obligatorio`), ubicacion_id uuid NOT NULL FK, tipo text NOT NULL CHECK IN (compra,consumo,
devolucion,merma,ajuste), cantidad numeric NOT NULL (CHECK: >0 salvo tipo='ajuste' que exige <>0 — este seed nunca
usa 'ajuste' ni 'devolucion' ni 'merma' salvo para la anomalía A11-merma, ver abajo), costo_unitario numeric NOT NULL
default 0 (>=0 — para 'compra' = costo del lote; para 'consumo' = el costo_unitario DEL LOTE consumido, no un
promedio), produccion_id uuid nullable FK (NOT NULL si tipo IN (consumo,devolucion); NULL si tipo IN
(compra,merma,ajuste) — CHECK `movimientos_insumo_produccion_segun_tipo`), usuario_id uuid FK, motivo text nullable
(NOT NULL si tipo='ajuste'), nota text, created_at timestamptz default now()`.

### `producciones`
`id uuid PK, ubicacion_id uuid NOT NULL FK (= Taller), producto_id uuid NOT NULL FK → productos, estado text NOT NULL
default 'en_proceso' CHECK IN (en_proceso,terminada,anulada), es_muestra boolean NOT NULL default false, etapas jsonb
NOT NULL default '{}' (claves de `set_etapa_produccion`: patronaje|muestra|escalado|corte|confeccion|acabado, valores
pendiente|hecho|tercerizado — el seed puede dejar solo las 3 de "producción" en 'hecho': corte/confeccion/acabado,
o tercerizado para variar), costo_tela/costo_avios/costo_maquila numeric NOT NULL default 0 (>=0 cada uno),
cantidad_plan integer NOT NULL (>0, = Σ produccion_lineas.cantidad_plan), cantidad_buenas integer nullable (>0 si no
null — CHECK `producciones_terminada_coherente`: terminada ⟺ cantidad_buenas NOT NULL, y viceversa NULL+
inventariado_at NULL si no terminada), costo_unitario numeric **GENERATED ALWAYS AS
round((costo_tela+costo_avios+costo_maquila) / coalesce(cantidad_buenas,cantidad_plan), 2) — NUNCA insertarlo a
mano, PostgreSQL lo rechaza**, fecha_entrega date nullable, nota text, inventariado_at timestamptz nullable (= now()
al cerrar, salvo muestra que queda NULL), token_cliente uuid UNIQUE nullable (dejar NULL), creado_por uuid FK →
personas (el líder o colaborador que abre la OP — `abrir_produccion` solo exige `fn_puede_operar_ubicacion`, NO
exige líder), created_at timestamptz default now()`.

### `produccion_lineas`
`id uuid PK, produccion_id uuid NOT NULL FK, variante_id uuid NOT NULL FK (debe pertenecer al MISMO producto_id de
la orden — el propio RPC lo valida), cantidad_plan integer NOT NULL (>0), cantidad_buenas integer nullable (>=0 si
no null — puede ser 0, a diferencia de producciones.cantidad_buenas que exige el TOTAL >0), created_at timestamptz
default now()`. UNIQUE real: `(produccion_id, variante_id)`.

## RPC reales, verbatim (para replicar su lógica con fechas históricas — ninguna acepta fecha, todas usan `now()`)

### `abrir_produccion(p_ubicacion_id, p_producto_id, p_lineas jsonb, p_costo_tela, p_costo_avios, p_costo_maquila, p_es_muestra, p_fecha_entrega, p_nota, p_token)`
Exige `fn_puede_operar_ubicacion` y `ubicaciones.tipo='taller'`. Cada línea de `p_lineas` debe ser una variante DEL
`producto_id` elegido (si no, aborta) — el seed debe respetar esto: todas las `produccion_lineas` de una OP son
variantes del mismo producto. `cantidad_plan` de la cabecera = Σ de las líneas (agrupa por variante si se repite).
`creado_por` = quien opera esa ubicación (cualquier colaborador/líder del Taller, no exige líder).

### `registrar_comprobante_produccion(...)`
Exige `fn_es_lider()` (a diferencia de `abrir_produccion`). Valida cada línea (insumo existe y no archivado, o
descripción libre; cantidad>0; costo>=0), `subtotal = Σ round(cantidad*costo,2)`, `igv = round(subtotal*18%,2)` solo
si `tipo='factura'`, `total=subtotal+igv`. Si `condicion='contado'` exige pago(s) que sumen EXACTO el total. Inserta
cabecera → items → pagos, en ese orden.

### `recibir_comprobante_produccion(p_comprobante_id, p_ubicacion_id, p_lineas, p_cierres, p_nota, p_token)`
Exige `ubicaciones.tipo='taller'`. Crea UNA fila en `comprobantes_produccion_recepciones`, luego por cada línea de
`p_lineas` (cada una con `item_id` + `cantidad`): genera `codigo_lote` = `documento` (serie-numero) si es la primera
vez que ese insumo recibe con ese código, o `documento || '/2'`, `/3'`... si se repite; inserta UN `insumo_lotes`
(con `comprobante_item_id` y `recepcion_id` reales) y UN `movimientos_insumo` tipo='compra' con el mismo
`costo_unitario` de la línea del comprobante. El seed no necesita simular `p_cierres` (faltantes) — ningún hallazgo
lo pide para el volumen objetivo.

### `registrar_consumo_insumo(p_produccion_id, p_insumo_id, p_cantidad, p_nota)`
Exige la producción `en_proceso`. Busca el lote de ESE insumo en ESA ubicación con `fecha_ingreso, created_at` más
antiguo que tenga saldo > 0 (`saldo = cantidad_ingresada − Σconsumo/merma + Σdevolucion` de ese lote); si el lote
más antiguo con saldo no alcanza para `p_cantidad`, la función ABORTA (no cruza lotes sola — "si de verdad necesitas
cruzar de lote, registra el consumo en dos llamadas"): el seed debe hacer lo mismo, dos filas de `movimientos_insumo`
tipo='consumo' si un solo lote no alcanza. Inserta el movimiento con el `costo_unitario` DEL LOTE (no recalculado) y
llama a `fn_recalcular_costo_insumos_produccion` al final.

### `fn_recalcular_costo_insumos_produccion(p_produccion_id)`
Suma, sobre TODOS los `movimientos_insumo` de esa producción con `tipo IN (consumo,devolucion)`: para insumos
`tipo='tela'` → `costo_tela`; para `tipo='avio'` → `costo_avios` (consumo suma, devolución resta). Solo actualiza la
columna si hubo al menos un movimiento de ese tipo de insumo (si una OP no consume avíos, `costo_avios` queda en su
valor anterior, normalmente 0). **Llamar UNA SOLA VEZ al final de todos los consumos de esa OP**, no por cada
consumo — el resultado es el mismo (es una suma total, no incremental) pero llamarlo una vez es más barato y más
fiel a cómo lo usaría la pantalla real (que lo llama tras cada consumo, pero el resultado converge igual).

### `cerrar_produccion(p_produccion_id, p_buenas jsonb, p_costo_tela, p_costo_avios, p_costo_maquila)`
Exige `estado='en_proceso'` y `inventariado_at IS NULL`. Por cada línea de `p_buenas` actualiza
`produccion_lineas.cantidad_buenas`; las líneas no mencionadas quedan en 0 (nunca NULL). `cantidad_buenas` total de
la cabecera = Σ líneas — si sale 0, la función ABORTA ("anula la orden en vez de cerrarla"): el seed nunca debe
cerrar una OP con 0 buenas totales (ver A11-merma abajo, se reduce pero nunca a 0). Actualiza
`costo_tela/costo_avios/costo_maquila` (los que pasa `cerrar_produccion`, que pueden diferir de los que ya dejó
`fn_recalcular_costo_insumos_produccion` — en el seed, pasar los MISMOS valores que ya quedaron, para no
contradecirlos), `estado='terminada'`, `inventariado_at=ahora` (NULL si `es_muestra`). Si es muestra, termina ahí —
**una muestra terminada NO genera ningún movimiento ni toca costo de variante**, tal como decía el plan original
(confirmado, sigue siendo cierto). Si NO es muestra: por cada línea con `cantidad_buenas > 0`, UN movimiento
`entrada` motivo=`produccion` con `produccion_id` y `sububicacion_id = fn_sububicacion_por_defecto(taller, 'entrada')`
— **hoy esto siempre da NULL porque el Taller no tiene NINGUNA fila en `sububicaciones`** (confirmado en vivo, 0
filas) — el seed debe dejar `sububicacion_id = NULL` en esos movimientos, exactamente como lo haría la función real
hoy (no una simplificación del seed, es el comportamiento real actual). Luego llama a
`fn_recalcular_costo_variante(variante_id, cantidad_buenas, costo_unitario_de_la_OP, 'produccion', movimiento_id)`
por cada línea — ver abajo. `costo_unitario_de_la_OP` es el `producciones.costo_unitario` GENERATED, calculado
DESPUÉS del UPDATE de arriba (ya con `cantidad_buenas` puesto) — en el seed, calcularlo a mano con la misma fórmula
antes de usarlo, ya que el valor real de la columna generada solo existe tras el INSERT/UPDATE de esa fila.

### `fn_recalcular_costo_variante(p_variante_id, p_cantidad_nueva, p_costo_unitario_nuevo, p_origen, p_movimiento_id)`
**Decisión del arquitecto (no hay drift, es una decisión de diseño):** la Fase 3 (compras/recepciones) declinó
llamar a esta función («el costo es constante, no deja historial» — comentario explícito en el generador). Para
Producción, SÍ replicarla: aquí es donde el costo de la prenda NACE de verdad (no es un precio pagado, es lo que
costó hacerla), así que dejarlo sin costo_historial sería un hueco real de la demo, no una simplificación razonable.
Lógica exacta: lee `variantes.costo` actual (`v_costo_anterior`) y `Σ stock` de esa variante en TODA la red
(`v_stock_previo`, todas las ubicaciones — en el seed, calcularlo desde la simulación diaria de stock de las Fases
3/4/5 en ese instante, no desde la tabla real `stock` que Fase 6 todavía no llenó). Si `v_stock_previo = 0`, el costo
resultante es directamente `p_costo_unitario_nuevo`; si no, promedio ponderado:
`round((stock_previo*costo_anterior + cantidad_nueva*costo_nuevo) / (stock_previo+cantidad_nueva), 2)`. Inserta una
fila en `costo_historial` (`variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo,
costo_resultante, origen='produccion', movimiento_id, usuario_id, created_at`=el instante del cierre) y actualiza
`variantes.costo = costo_resultante`. **Esto significa que Producción cierra DESPUÉS de toda la simulación de venta
de esas variantes esté clara, o el `v_stock_previo` que el seed calcule no va a coincidir con lo que la fórmula real
habría visto** — coordinarlo con el orden global de todo el generador (Producción entra en la Fase 5, las ventas ya
están en la Fase 4: el `stock_previo` de cada línea de producción debe calcularse con el snapshot de stock en el
INSTANTE del cierre de esa OP, considerando todo lo sembrado hasta ahí, ventas incluidas).

## Anomalía A11 (3 partes, según el plan)

- **1 OP atrasada**: `fecha_entrega` en el pasado (respecto al fin de la ventana) y `estado='en_proceso'` (nunca se
  cierra) — la más simple de las tres, no toca `cerrar_produccion` en absoluto.
- **1-2 OP anuladas SIN consumos**: usar `anular_produccion(p_produccion_id, p_motivo)` — **no leí esta función
  todavía, verificarla antes de usarla** (nombre confirmado en el listado de RPC, `pg_get_functiondef` pendiente).
  El plan es explícito: NUNCA con consumos ya registrados (revertir consumos es frágil y el plan lo excluye a
  propósito, ver "Tampoco se siembra por frágil" en el ADR-0150 original).
- **1 OP con merma**: cerrar con `cantidad_buenas` menor a `cantidad_plan` en alguna línea (nunca 0 en el TOTAL, ver
  arriba) — la manera más simple y la que recomiendo (ponytail: menos ramas) en vez de sobre-consumir insumos
  respecto al ratio esperado.
