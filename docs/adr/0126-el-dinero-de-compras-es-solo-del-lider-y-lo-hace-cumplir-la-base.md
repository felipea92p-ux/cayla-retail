# ADR-0126 — El dinero de Compras es solo del líder, y lo hace cumplir la base

- **Estado:** Aceptado (Felipe, 2026-09-19). **Las dos migraciones están pendientes de pegar en producción** — orden y
  verificación en «Cómo se despliega».
- **Refina** ADR-0075 (la lectura de Compras acotada por sede): sigue acotada por sede, pero **ya no incluye montos**.
- **Cierra** el hallazgo H4 de las pruebas SQL de Compras (PR #165) y el hueco que ADR-0113 (D5) solo *evitaba*.
- **Migraciones:** `20260919160000_dinero_de_compras_lectura_operativa.sql` (A) y
  `20260919161000_dinero_de_compras_tablas_solo_lider.sql` (B).

## Contexto — el problema

Todas las pantallas de Compras y de Proveedores son solo de líder: el layout de `/compras` redirige a quien no lo es, y
`/recibir` (donde cuenta cualquier colaborador de la sede) le tacha los montos en el servidor. Parecía cerrado. No lo
estaba, porque **la pantalla no es la base**: un colaborador con su sesión puede llamar a la API directo, sin pasar por
ninguna pantalla. Verificado contra producción el 2026-09-19 (solo lectura), un integrante de Tienda Trujillo podía leer
los montos de su sede por **tres puertas**:

1. **Cinco funciones** con solo el candado de sede (`fn_puede_operar_ubicacion`): `resumen_compras`,
   `resumen_compras_extra` (compras del mes, IGV, valor por recibir), `deuda_por_vencimiento`, `salidas_caja_30d` y
   `por_pagar_tramos`.
2. **Las tablas**: `compras` (subtotal, IGV, total, pagado, saldo, notas de crédito), `compra_items` (costo por línea),
   `compra_pagos`, `compra_adjuntos` y `compra_notas_credito`, todas con `select` para «quien opera la sede» (ADR-0075).
3. **El bucket de Storage** `retail-compras-adjuntos` (los escaneos de las facturas, con los montos a la vista):
   `select` para *cualquier* usuario con sesión, de cualquier sede.

Por eso cerrar solo las cinco funciones —lo que sugería el hallazgo H4— **no habría servido de nada**: el mismo monto
seguía a un `select` de distancia. El hueco tenía que cerrarse en las tres puertas o en ninguna.

Producción tenía 0 lotes, 0 envíos y 0 escaneos: no se filtró nada real. Era un hueco latente que habría empezado a
importar con la primera factura escaneada.

## Decisión

**D1 — «Dinero» es un monto, y la regla vive en UN lugar.** `fn_puede_ver_dinero_de_compras()`; hoy responde «solo el
líder» (igual que `fn_puede_registrar_compras`). Toda política y toda función que muestre dinero de Compras usa esa, no
`fn_puede_operar_ubicacion` (que solo dice «de mi sede»). Si un día una contadora ve el dinero sin registrar compras, se
cambia esa función y no veinte.

**D2 — Lo operativo sigue por sede, y es una lista de PERMITIDOS.** Recibir necesita saber qué comprobantes vienen a la
sede, de quién, cuántas prendas y cuánto falta. Eso lo dan `listar_compras_operativo` y `lineas_compra_operativo`
(`security definer`, con el candado de sede escrito a mano): devuelven *solo* esas columnas. Una lista de tapados
(«devuelve todo menos el dinero») se rompe en silencio el día que Compras agrega una columna de dinero; una de permitidos
queda cerrada por omisión. Tampoco tienen filtros de pago: filtrar por `saldo` es una forma de enterarse del saldo.

**D3 — Las tablas y el bucket pasan a solo-líder** (parte B). Las vistas `compras_resumen` y `compra_items_resumen`
siguen siendo `security_invoker` y heredan la política: al integrante le salen vacías. No se vuelven `security definer`:
una vista así es una puerta de *escritura* si alguien le deja un `GRANT`. Las funciones de recibir (`recibir_compras`,
`recibir_envio`…) ya son `security definer` y siguen leyendo lo que necesitan: recibir no cambia.

**D4 — Las cinco funciones FALLAN, no devuelven ceros.** Un integrante recibe `42501 «Solo un líder puede ver …»`. Un
cero *miente*: un tablero que dijera «Deuda: S/ 0.00» a quien no puede verla diría algo falso. Fallar dice la verdad
(«esto no es para ti») y hace visible el día que alguien cablee mal una pantalla.

**D5 — El candado se INYECTA, no se copia** (`fn_aplicar_candado_de_dinero()`). Estas funciones las reescriben otras
migraciones en vuelo —la de los hallazgos H1/H2/H3/H5 suelta y recrea `por_pagar_tramos` con otra firma— y en producción
se pegan a mano en el orden que toque. Copiar aquí un cuerpo pisaría la versión más nueva o dejaría una **sobrecarga sin
candado** (llamarla con 4 argumentos ni siquiera es posible cuando conviven: «is not unique»). Así que la migración lee la
definición que tenga cada base, le agrega *una* línea al principio y la recrea con la misma firma. Es idempotente y
devuelve qué arregló, así que sirve también de **red de seguridad**: `select retail.fn_aplicar_candado_de_dinero();` →
`{}` significa que todo sigue con candado. **Regla para quien toque Compras:** después de pegar cualquier migración que
recree una de las cinco, correrla.

**D6 — Qué NO es dinero.** Los *estados* (pagada/pendiente, vencida, condición, fecha de vencimiento) no son montos y
siguen visibles para quien opera la sede en `compras_resumen`. Es lo que la pantalla de Recibir ya mostraba; si Felipe
quiere esconderlos también, es sacar columnas de las dos funciones operativas.

**D7 — La app.** `listarCompras`/`getLineasCompra` reciben `sinMontos` (quien no es líder) y leen por las funciones
operativas; si la función todavía no existe en esa base (el despliegue llegó antes que la migración: PostgREST
`PGRST202` o `42883`), siguen por el camino de antes en vez de tumbar Recibir (principio 9). Cualquier *otro* error sí se
ve. `/inventario/recibir` deja de dibujar la columna de costo para quien no es líder (`recepciones_sin_comprobante` ya
se lo entrega NULL). La página sigue tachando los montos en el servidor como segunda línea.

## Consecuencias

- **Para un integrante:** recibe igual que siempre (mismas listas, mismo conteo, mismo `recibir_envio`), sin un solo
  monto. Por la API directa ya no lee `compras`, `compra_items`, `compra_pagos`, los escaneos ni las cinco funciones.
- **Para el líder:** nada cambia (para él `fn_puede_ver_dinero_de_compras()` es verdadera en toda sede). Se verificó que
  las cinco devuelven lo mismo que antes.
- **Riesgo residual — una función recreada sin el candado.** Otra migración puede recrear una de las cinco sin él (D5).
  Lo cubren `pnpm pruebas:dinero-compras` (falla si alguna queda sin candado; corre en el piloto de CI) y la rutina.
- **Lo que este ADR NO resuelve** (son decisiones de otros módulos, y las dejo a la vista para Felipe):
  1. `fn_productos` devuelve `costo` (y `precio`) a **cualquier** usuario con sesión, y el catálogo no lo esconde: el
     costo unitario por prenda lo ve hoy un integrante por diseño del catálogo. Esconderlo toca Inventario, Productos y
     Vender a la vez.
  2. `proveedores_select` deja a cualquier usuario con sesión leer RUC, teléfono, **banco y cuenta bancaria** de todos
     los proveedores directo de la tabla. Es del módulo de Proveedores.
- **Pruebas:** `pnpm pruebas:dinero-compras` (32 casos, con `--en-seco`: candado, líder intacto, lecturas operativas con
  paridad de orden/filtros/cursor contra `listar_compras`, tablas y bucket vacíos para el integrante, recibir sigue
  funcionando, el costo oculto, la inyección sobre funciones sin candado —incluida la sobrecarga—, y que la B se niegue
  a correr sin la A). `pruebas:compras-indicadores` se adaptó: los casos que afirmaban que Micaela ve los montos de su
  sede ahora afirman que el líder ve todas las sedes, y H4 pasó de «decisión pendiente» a la regla resuelta.

## Cómo se despliega

El PR se fusiona primero: la app funciona con o sin las migraciones (D7). Después, en el SQL Editor de producción y **en
este orden**:

1. `20260919160000_dinero_de_compras_lectura_operativa.sql` (A) — aditiva, nada deja de funcionar al pegarla. Al final
   imprime las cinco firmas a las que les puso el candado (en producción ninguna lo tenía todavía).
2. `20260919161000_dinero_de_compras_tablas_solo_lider.sql` (B) — **después de A y de que Vercel haya desplegado**.
   Se niega a correr si la A no está («Pega primero …»).
3. Verificar: `select retail.fn_aplicar_candado_de_dinero();` → `{}`; iniciar sesión como colaborador y abrir `/recibir`.
4. Refrescar el volcado y el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`). Hasta entonces `pnpm datos:comparar`
   marca `lineas_compra_operativo` como «no existe en producción»: es correcto, y la app lo cubre con el respaldo.
