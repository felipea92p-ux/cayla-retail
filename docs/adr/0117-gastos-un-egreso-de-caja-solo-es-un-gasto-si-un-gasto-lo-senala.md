# ADR-0117 — Gastos: un egreso de caja solo es un gasto si un gasto lo señala

**Fecha:** 2026-09-18
**Estado:** **PROPUESTO — espera la aprobación de Felipe para construir.** No hay código ni migración. Las cuatro
decisiones de diseño de abajo ya las tomó Felipe; falta su ok al modelo completo.
**Afectará (cuando se apruebe):** tablas nuevas `gastos`, `categorias_gasto` y `egresos_no_gasto`; RPC
`registrar_gasto` y `anular_gasto`; pantalla `/finanzas/egresos`. **No toca** `caja_movimientos`, `registrar_movimiento_caja`
ni `cerrar_caja`.
**Reservados:** migración `20260918193000_gastos.sql`.
**Relacionado:** ADR-0109 (los estados financieros; el gasto es su regla 9), ADR-0112 (los permisos por defecto
dejan escribir a `authenticated`: hay que revocar explícitamente).

## El problema

Hoy no existe la tabla de gastos generales. Sin ella el Estado de Resultados no tiene de dónde sacar alquiler, luz,
planilla ni publicidad. Pero el riesgo real de esta tarea no es crear la tabla: es **contar el mismo gasto dos veces**.

La caja ya recibe egresos: `MovimientoCajaModal` ofrece como motivos rápidos "Retiro de efectivo", "Depósito bancario",
"Ajuste de caja (faltante)", "Compra de insumos" y "Otro", en texto libre. Es decir:
- Parte de los gastos pequeños **ya entra por la caja** (bolsas, movilidad, insumos).
- Otros egresos de caja **no son gastos en absoluto**: un depósito al banco mueve plata de un bolsillo a otro, un retiro
  es plata que sale del negocio, un ajuste corrige un conteo.

Si el Estado de Resultados sumara `gastos` **y** los egresos de caja, contaría dos veces lo que entra por los dos
lados, y además trataría un depósito bancario como si fuera un gasto.

## Decisión

**DECIDÍ:**

1. **`gastos` es la única fuente de verdad de los gastos.** El Estado de Resultados lee SOLO `gastos`; el arqueo de caja
   lee SOLO `caja_movimientos`. Nunca leen del otro.
2. **Un egreso de caja es un *medio de pago*, no un gasto.** Solo pasa a ser gasto cuando una fila de `gastos` lo señala
   con `caja_movimiento_id`, y ese vínculo es único: un mismo egreso no puede respaldar dos gastos. Así es
   estructuralmente imposible contarlo dos veces.
3. **Tres caminos de entrada, todos solo por RPC y solo para líder:**
   - **A. Pagado sin caja** (transferencia, Yape, Plin, tarjeta): se registra el gasto y no hay egreso de caja.
   - **B. Pagado en efectivo desde una caja abierta:** una sola transacción crea el egreso de caja y el gasto que lo
     señala. Todo o nada.
   - **C. Clasificar un egreso que una encargada ya registró:** el líder crea el gasto señalando ese egreso. No se crea
     ningún movimiento de caja nuevo.
4. **Los egresos de caja que no son gastos** (depósito, retiro, ajuste) se marcan "no es gasto" en una tabla propia
   (`egresos_no_gasto`, solo agrega filas), con motivo y quién lo revisó. La pantalla muestra un contador de
   "egresos de caja sin clasificar", nunca los esconde.
5. **Solo el líder registra gastos** (decisión de Felipe). Las encargadas siguen registrando egresos de caja como hoy:
   el mostrador no cambia. Un gasto es plata y sueldos, y no lo ve cualquiera (RLS: `select` solo para líder).
6. **Cada gasto es de una tienda/Taller o "de la empresa"** (decisión de Felipe). `ubicacion_id` nulo = de la empresa
   (oficina, contador, software): aparece solo en el consolidado, como ya acordó el cierre de mes (ADR-0109).
7. **Se registra al pagar** (decisión de Felipe): la fecha es la del gasto. Un recibo de luz de agosto pagado en
   septiembre cae en septiembre. No hay "gastos por pagar" en esta versión.
8. **Categorías: lista cerrada en una tabla** (decisión de Felipe) con la cuenta contable (PCGE) de cada una, sembrada con
   las del manual contable: personal (62), alquileres (635), servicios básicos (636), transporte (631), mantenimiento
   (634), publicidad (637) y suministros (656). Es la única casa de "esta categoría va a esta cuenta"; el Estado de
   Resultados la usa, no la repite.
9. **Sin `DELETE`.** Un gasto se anula con motivo y responsable (`estado = 'anulado'`), como una venta.
10. **Comprobante:** `factura`, `boleta`, `recibo_por_honorarios` o `sin_comprobante`. El IGV solo se guarda con
    factura (mismo criterio que compras: el crédito de IGV solo existe con factura).

**DESCARTÉ:**
- **Sumar gastos + egresos de caja en el Estado de Resultados**: cuenta dos veces y trata un depósito como gasto.
- **Agregar una columna de naturaleza a `caja_movimientos`** (gasto / depósito / retiro / ajuste): toca el núcleo de
  dinero y su RPC (principio 1) y obligaría a reclasificar el historial. Una tabla aparte no toca nada existente.
- **Filtrar los egresos por el texto del motivo** ("Depósito bancario"): el texto es libre, alguien escribe "deposito" y
  el filtro se rompe sin avisar. Es el problema de los colores antes de cerrar el vocabulario.
- **Que cualquier colaboradora registre gastos:** ve y carga planilla y alquileres, y elige categorías sin contexto contable.
- **Gastos por pagar (devengo):** exacto pero exige una segunda pantalla y un segundo estado mientras el volumen es
  chico. Se revisa si el contador lo pide.
- **Repartir los gastos de la empresa entre tiendas** o **obligar a elegir tienda:** inventan una imputación arbitraria.
- **Una categoría "Otros":** se descartó a propósito. Un cajón de sastre es como se pudren los vocabularios, y la cuenta
  que le tocaría (659) es la de las mermas, que el manual contable resta del margen bruto: un gasto de oficina ahí
  distorsionaría el margen. Un gasto que no calza en ninguna categoría es una señal de que falta una categoría, y se agrega.
- **Categorías editables por el líder:** una categoría mapeada a la cuenta equivocada hace que el Estado de Resultados
  salga mal sin avisar.

**SE ROMPE SI:**
- Un gasto se paga **en efectivo desde una caja que ya cerró** y no hay egreso que clasificar: el camino B exige caja
  abierta; el camino C exige que el egreso exista. Efectivo que sale de un cajón fuera de caja no tiene camino en esta
  versión (queda como pregunta abierta, abajo).
- Se **anula un gasto que había creado su egreso de caja** (camino B): anular el gasto NO devuelve la plata a la caja.
  El egreso vuelve a "sin clasificar", porque la plata sí salió. Un error de monto en la caja se corrige en la caja
  (movimiento de ajuste), no aquí.
- La **cuenta contable de una categoría** no coincide con lo que el contador espera: las siete del manual están
  pendientes de su confirmación.
- Alguien intenta registrar como gasto una **compra de mercadería, un activo o el flete de una compra**: no hay
  categoría para eso, a propósito (van a inventario, a `activos_fijos` y a la cuenta 609).
- Se **cierra un mes** (ADR-0109) y se registra un gasto con fecha de ese mes: hace falta el bloqueo por período (tarea 8).

## Modelo (borrador; se afina al construir)

```
retail.categorias_gasto ( codigo text pk, nombre text, cuenta_pcge text, activo boolean )   -- 7 filas sembradas

retail.gastos (
  id uuid pk,
  ubicacion_id uuid null references retail.ubicaciones,      -- null = "de la empresa"
  categoria text not null references retail.categorias_gasto (codigo),
  descripcion text not null,
  fecha date not null,                                        -- día del gasto, en hora de Lima
  monto_total numeric(12,2) not null check (monto_total > 0),
  igv numeric(12,2) not null default 0,
  comprobante_tipo text not null,                             -- factura | boleta | recibo_por_honorarios | sin_comprobante
  comprobante_numero text,
  proveedor_id uuid null references retail.proveedores,       -- reusa el directorio de proveedores
  medio_pago text not null,                                   -- efectivo | tarjeta | yape | plin | transferencia
  caja_movimiento_id uuid null references retail.caja_movimientos,
  estado text not null default 'vigente',                     -- vigente | anulado
  motivo_anulacion text, anulado_por uuid, anulado_en timestamptz,
  registrado_por uuid, token_cliente uuid unique, created_at timestamptz default now()
)

retail.egresos_no_gasto ( caja_movimiento_id uuid pk references retail.caja_movimientos, motivo text, revisado_por uuid, revisado_en timestamptz )
```

## Estados imposibles (Lamport: qué NUNCA debe existir, y quién lo impide)

| Estado imposible | Se impide con |
|---|---|
| Un mismo egreso de caja respaldando dos gastos | índice único parcial sobre `caja_movimiento_id` `where estado = 'vigente'` |
| Un gasto en efectivo sin egreso de caja, o uno con Yape que sí lo tiene | `check`: `medio_pago = 'efectivo'` ⇔ `caja_movimiento_id is not null` |
| Un gasto cuyo monto no coincide con el egreso que señala | validación dentro de la RPC (camino C) y prueba con rollback |
| IGV en algo que no es factura, o IGV mayor que el total | `check` (`igv = 0` salvo factura; `igv <= monto_total`) |
| Una factura sin número | `check` |
| Un gasto anulado sin motivo ni responsable | `check` de coherencia (mismo patrón que `ventas`) |
| Un gasto borrado | `revoke delete` + sin política de escritura |
| Cualquier colaboradora insertando un gasto directo desde la consola | `revoke insert, update, delete ... from authenticated` — **explícito, porque `0005_grants.sql` da escritura por defecto a toda tabla nueva** (ADR-0112) |
| Un egreso a la vez "gasto" y "no es gasto" | la RPC de "no es gasto" rechaza si ya tiene un gasto vigente, y la de gasto rechaza si está marcado |
| El mismo gasto guardado dos veces por un doble clic o un reintento de red | `token_cliente` único (mismo patrón que `registrar_venta`) |

## Contratos (Liskov)

- **`registrar_gasto(...)`** *promete:* crear un gasto vigente, y, en el camino B, su egreso de caja, todo o nada.
  *Asume:* que quien llama es líder; en el camino B, que la caja está abierta; en el C, que el egreso existe, no tiene
  ya un gasto vigente y su monto coincide.
- **`anular_gasto(id, motivo)`** *promete:* marcar el gasto como anulado, liberar el vínculo con el egreso y no tocar la
  caja. *Asume:* líder, y que el período del gasto no está cerrado.
- **`fn_egresos_resumen(...)`** *promete:* gastos por tienda y "de la empresa", más el contador de egresos de caja sin
  clasificar. *Asume:* nada; solo lee.

## Todo o nada (Gray)

La única transacción con más de una tabla es el camino B: `insert` en `caja_movimientos` y `insert` en `gastos`
juntos. Si falla el segundo, no queda un egreso huérfano. Dos líderes clasificando el mismo egreso a la vez: el segundo
choca contra el índice único y recibe un mensaje claro, no un estado a medias.

## Qué pasa si algo externo falla (Vogels)

Este módulo no depende de ningún servicio externo: no habla con SUNAT, con Lucode ni con un banco. Un gasto con factura
guarda el número que tipeó el líder, no lo valida contra SUNAT. Se degrada solo si la base cae, como todo lo demás.

## Números (Jeff Dean)

≈ 150 gastos al mes entre las tiendas y la empresa → ≈ 5.400 filas en 3 años. Egresos de caja: del orden de decenas al
día. Cualquier consulta agrega decenas de miles de filas como máximo. No hace falta índice más allá de `(ubicacion_id,
fecha)` y el único parcial. **Supuesto, no dato:** 150 al mes se estimó en ADR-0109; el volumen real de gastos se mide
cuando haya carga.

## Verificación prevista (principio 7)

1. Prueba aislada con un Postgres desechable (patrón de ADR-0110/0113): los cinco estados imposibles de la tabla, los
   tres caminos, el anular, y **mutaciones** que la hagan fallar (quitar el índice único, quitar el `check` de efectivo,
   permitir el `DELETE`).
2. Un gasto de prueba en UNA tienda y comprobar que **solo mueve esa tarjeta** y que el egreso de caja no se cuenta doble.
3. Contra el stack local con Docker: los permisos reales, `fn_es_lider` verdadera y la pantalla autenticada.

## Preguntas abiertas para Felipe

1. **Efectivo fuera de caja.** ¿Alguna vez se paga un gasto en efectivo sacado de un cajón que no es la caja del día
   (una caja fuerte, plata de la oficina)? Si es así, esta versión no lo cubre.
2. **Las siete categorías y sus cuentas** deben pasar por el contador antes de sembrarse.
3. **Menú:** la pantalla es `/finanzas/egresos`, y hoy no existe ninguna entrada "Finanzas". ¿Dónde va en el menú que
   ordenaste el 16-sep?
4. **Historial:** los egresos de caja anteriores a este módulo aparecerán todos "sin clasificar". ¿Se clasifican, o se
   marcan como "no es gasto" en bloque los anteriores a una fecha?

## Cómo se deshace (una vez construido)

`drop` de las tres tablas y las dos funciones. Sin pérdida de dinero: `caja_movimientos` no se toca jamás.
