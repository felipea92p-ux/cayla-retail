# ADR-0139 — Compras: un comprobante se reparte entre tiendas y cada tienda recibe lo suyo

**Fecha:** 2026-09-18 (diseño) · 2026-09-19 (implementación y verificación en local)
**Estado:** Aceptado, **implementado y en producción** (2026-09-20). Fusionado en el PR #203 y aplicadas por Felipe las dos migraciones
(172000 y 173000, en ese orden). Verificado con SQL contra Postgres real, pruebas de la web y el navegador (registrar, recibir,
reasignar, cerrar faltante), y **en producción en solo lectura tras el pegado**: objetos presentes, cabecera eliminada, ninguna función,
política ni vista que aún la lea, candado de dinero intacto, RLS sin permisos de escritura y triggers diferidos activos.
Nota: lo que se pegó fue el primer archivo enviado, cuyos comentarios de base de datos dicen «ADR-0138» (el número que tenía entonces);
el SQL funcional es idéntico al de `main`. Quedó anotado como opcional alinear esos 8 comentarios a 0139.
**Decide:** Felipe, en lo de negocio (una factura de proveedor puede traer mercadería para varias tiendas y cada tienda hace su
propia recepción). Arquitectura: este documento.
**Afecta:** `compras` (pierde `ubicacion_destino_id`), `compra_items`, `compra_item_cierres` (gana `ubicacion_id`), dos tablas
nuevas (`compra_item_destinos`, `compra_reasignaciones`), una vista nueva y una reescrita, y 19 funciones (lista en «Alcance»);
las pantallas Registrar, Recibir, detalle y lista de Compras.
**Historia del número:** el borrador del 2026-09-18 se llamó 0107 (chocaba con el de la etiqueta de campaña); se renumeró a 0132; chocó con «Pagar juntos»
(0132, ya en `main`) y pasó a 0138; chocó con «Comparar períodos» de Inventario (0138, ya en `main` y aplicado en producción) y quedó en
**0139**. Los cuatro nombres son el mismo documento.
**Reemplaza al borrador del 2026-09-18**: cambian tres cosas que se anotan en «Qué cambió respecto del
diseño».

## Contexto (verificado contra `main` y contra producción, solo lectura)

1. La factura tenía **un** destino, `compras.ubicacion_destino_id` (NOT NULL): a la vez «a dónde va la mercadería» y la llave de
   seguridad de las tablas de lectura (ADR-0075).
2. `recibir_compras` topaba lo recibido de cada línea sumando `movimientos.compra_item_id` de **todas** las ubicaciones. Nada
   sabía cuánto le toca a cada tienda: con una factura repartida, si TRU recibía 14 de 24, AQP quedaba topada en 10 sin aviso; si
   recibía las 24, AQP no podía recibir nada; y un integrante de la otra tienda ni veía la factura.
3. Comprobantes, Recibir y Por pagar no filtraban por ubicación: solo las acotaba RLS, que deja pasar todo al líder.
4. Reglas del negocio que mandan (`docs/datos/15-COMO-OPERA-CAYLA.md`): **R-04** pagar a un proveedor no toca el cuadre de ninguna
   sede; **R-10** pagan Compras y Felipe; **R-12** los proveedores sirven a todas las tiendas a la vez.

## Decisión

### 1. Qué es «por tienda» en cada módulo

«Por tienda» son tres cosas distintas: **perspectiva** (qué muestra la pantalla al abrirla), **permiso** (quién puede leer u operar)
y **atribución** (a qué tienda pertenece el registro).

| Módulo | ¿Se parte por tienda? | Por qué |
|---|---|---|
| Recibir mercadería | **Sí.** Perspectiva = la tienda activa; muestra lo que le toca a esa tienda. | Es un acto físico en un lugar: la recepción mete stock en una sola ubicación. |
| Comprobantes | **No.** Es un documento de la empresa; muestra a qué tiendas va. | Lo registra Compras (solo líder); si viera solo su tienda «faltarían» comprobantes que sí existen. |
| Por pagar | **No.** La deuda es una. | R-04, R-10, R-12. Su pregunta («¿qué pago hoy y cuánta liquidez necesito?») solo se responde con el total. |

### 2. Modelo de datos (tal como quedó)

- **`compra_item_destinos (compra_item_id, ubicacion_id, cantidad)`**, PK en ambas, `cantidad > 0`: el **plan**, cuánto de cada línea
  va a cada tienda. La línea sigue siendo el papel tal como llegó. La base **siempre** guarda reparto, aunque sea de una sola tienda:
  cero casos especiales al leer.
- **Lo recibido por tienda no se guarda**: sale de `sum(movimientos.cantidad) where compra_item_id = L and ubicacion_id = U` (una sola
  fuente de verdad; el núcleo `movimientos` no se tocó). `pendiente(L, U) = asignado − recibido − cerrado`. Lo expone la vista
  **`compra_item_reparto_resumen`** (línea × tienda).
- **`compra_reasignaciones`**: bitácora append-only (línea, de, a, cantidad, motivo `llego_de_mas | error_de_tienda | otro`, nota, quién,
  cuándo). Nunca se edita ni se borra.
- **`compra_item_cierres.ubicacion_id`**: un faltante es de una tienda concreta (ADR-0111 + reparto).
- **`fn_puede_ver_compra(compra_id)`** = líder, o alguna línea repartida a mi ubicación; reemplaza a
  `fn_puede_operar_ubicacion(c.ubicacion_destino_id)` en todas las funciones que la usaban.
- **`compras_resumen.ubicaciones_destino uuid[]`** reemplaza a `ubicacion_destino_id`. **`compras.ubicacion_destino_id` se elimina**
  (dos verdades permitirían un estado imposible). Antes de soltarla, la migración verifica que ninguna función, vista ni política la
  lea y, si queda un uso, aborta con la lista y no cambia nada; y ya se había copiado a `compra_item_destinos` (relleno).
- **Tres candados que hace cumplir la base, no la pantalla:**
  1. Lo asignado a una línea suma su cantidad: *constraint trigger diferido* en ambas tablas (valida al confirmar, así
     `registrar_compra` inserta línea y reparto juntos).
  2. Una tienda no recibe más de lo suyo: dentro de `recibir_compras`, con el `for update` sobre la línea que ya existe. El mensaje dice
     la cifra («a Tienda Trujillo le tocan 12 de esta línea, ya recibió 12 y cerró 0; se intenta recibir 1 más») y qué hacer.
  3. Reasignar solo mueve lo que la tienda de origen aún no recibió ni cerró, con el mismo candado de fila.
- **Escritura solo por RPC** (sin políticas de INSERT/UPDATE/DELETE en las dos tablas nuevas).
- **RPC (firmas):** `registrar_compra` no cambia de firma: cada ítem puede traer `destinos: [{ubicacion_id, cantidad}]` y
  `p_ubicacion_destino_id` pasa a significar «destino de las líneas que no traen reparto» (una web vieja sigue funcionando).
  `cerrar_linea_compra(…, p_ubicacion_id default null)` (obligatorio si la línea está repartida entre varias tiendas).
  `reasignar_reparto_compra(p_compra_item_id, p_desde, p_hacia, p_cantidad, p_motivo, p_nota)`: solo líder.
  `lineas_compra_operativo(p_compra_ids, p_ubicacion_id)` y `listar_compras_operativo(…, p_ubicacion_id)`: «lo que le toca a mi
  tienda» (`*_aqui`), **sin dinero** (ADR-0126). Cada cambio de firma es `drop function` de la vieja + `create` (un `create or replace`
  con parámetro nuevo deja dos sobrecargas vivas y PostgREST responde «could not choose the best candidate function»).
- **Parches sobre la definición VIVA, no cuerpos copiados.** `recibir_compras`, `recibir_envio` y `registrar_compra` se parchan con
  `pg_get_functiondef` + `replace()` con anclas verificadas y guardas («ya parchada»): en producción se pega a mano y en cualquier
  orden, y copiar el cuerpo pisaría el de otra sesión. Lo mismo para las 8 funciones de dinero/proveedores que se re-llavean.

### 3. Cómo encaja con las demás decisiones

- **ADR-0111 (faltantes):** `pendiente` descuenta lo cerrado; «Todo llegó» y «Lo que faltó» operan sobre la parte de la tienda que
  recibe; la nota de crédito sigue siendo una por comprobante. El comprobante pasa a `recibida` cuando **todas** las partes están
  recibidas o cerradas.
- **ADR-0113 (recibir por envío):** `recibir_envio` valida el reparto de la tienda que recibe (un integrante solo recibe líneas con
  reparto para su sede) y pasa la tienda a los cierres del envío.
- **ADR-0126 (dinero de Compras solo líder):** **cierra la «privacidad, decisión abierta» del borrador.** Un integrante lee por
  `listar_compras_operativo` / `lineas_compra_operativo` (lista de campos permitidos, sin montos) y ve solo su parte. Tras recrear las
  funciones de dinero, la migración reaplica `fn_aplicar_candado_de_dinero()`, como pide esa decisión.
- **ADR-0135 (pagos endurecidos, otra sesión):** su parche de `registrar_compra` (181000) y el de este reparto conviven **en cualquier
  orden** (ambos parchan por anclas); se probó sobre las dos formas de la función.

### 4. Experiencia de uso (UI/UX) — como se construyó

Principios: (1) el sistema dice **lo que falta**, no solo que hay un error («Faltan 4 por repartir», no «suma inválida»); (2) cada
número se explica solo («Te toca 12 de 24 del comprobante»); (3) la tienda ve primero lo suyo y lo de otras tiendas es secundario y
solo para líderes; (4) lo que se mueve deja rastro y motivo a la vista; (5) lo que se hacía de una forma sigue igual: «Una tienda» es
el valor por defecto y no manda `destinos`.

- **Registrar** (`RepartoEnRegistro.tsx`, `CompraFormV2.tsx`). «Mercadería destinada a»: **Una tienda** (el selector de siempre) |
  **Repartir entre tiendas**. En «Repartir» se marcan las tiendas una vez (chips; al menos una) y **cada línea** muestra una casilla por
  tienda y en vivo «Faltan 4 por repartir» (ámbar) / «Sobran 2» (rojo) / «✓ Repartidas 24 de 24» (verde), con «Partes iguales» por línea y
  «Repartir todas en partes iguales». La lista de «qué falta» junto al botón dice **qué línea y cuánto** («Línea 2: faltan 4 por
  repartir»); el costo que falta se avisa antes que el reparto. El resumen muestra «Mercadería para Tienda Lima · 12 u. / Tienda
  Trujillo · 12 u.». En celular cada tienda es su propia fila. Sin reparto en pantalla, el valor por defecto no es silencioso: quien
  registra es Compras, no está parada en la tienda que recibe.
- **Recibir** (`/recibir`). Perspectiva = tienda activa (selector solo para líderes). Cada comprobante repartido dice «… · tu parte» y cada
  línea «Te toca 12 de 24 del comprobante · También falta en Taller: 4 · Tienda Trujillo: 8» (lo segundo solo para líderes). Los topes,
  «Todo llegó» y las cifras son de la tienda; el «S/ por llegar» usa lo que le falta a ELLA (con IGV del comprobante).
- **Detalle del comprobante** (`RepartoPorTienda.tsx`, `ReasignarReparto.tsx`). «Reparto por tienda»: matriz línea × tienda con
  «recibió/le toca» (4/12), totales por tienda con barra y «faltan N», y el historial «Felipe movió 2 unidades de Taller a Tienda
  Trujillo · Llegó de más a la otra tienda». **Reasignar** (solo líder): línea, de dónde (solo tiendas con pendiente), a dónde, cuántas
  (solo lo pendiente; precargado con todo lo pendiente) y por qué (tres motivos; «otro» pide nota), mostrando el efecto antes de
  confirmar («Lima 12 → 10 · Trujillo 12 → 14»). Un comprobante de **una sola tienda** con algo por recibir muestra una frase y el botón:
  es el único camino para «esto llegó a otra tienda» (sin él, recibirla allá se rechaza). **Cerrar con faltante** en una línea
  repartida pregunta «¿En qué tienda faltó?». Si el reparto no se pudo leer, la sección lo dice (`tolerar`, `lib/resultado.ts`) en vez de
  dibujarse vacía como si el comprobante no estuviera repartido.
- **Lista de comprobantes.** «Repartida: Tienda Lima · Tienda Trujillo» bajo el estado de recepción, solo si va a más de una tienda.

### 5. Qué NO se hizo, y por qué

- **Filtro y chip «Destino» en Comprobantes y Por pagar.** El borrador los pedía. La lista es paginada en Postgres (≤ 50 filas por
  cursor): un filtro en el navegador solo miraría la página cargada y **mentiría** sobre el resto; uno de verdad exige un parámetro nuevo
  en `listar_compras` (otro `drop function`) y coordinar con Por pagar, que tiene la pantalla en vuelo. Queda en el BACKLOG. Lo que sí
  está: cada comprobante repartido dice a qué tiendas va.
- **Maquetas previas.** El borrador pedía maquetar y aprobar tres piezas antes de construir. Se construyó directo sobre la piel ya
  aprobada de Comprobantes (mismos chips, tabla, modal y campos) y se verificó en el navegador; si Felipe quiere ajustar la forma, se
  ajusta sobre lo que ya existe.
- **«Volver a Una tienda con un reparto armado pide confirmación».** Al volver, el reparto queda en memoria (si lo reactiva, sigue ahí) y
  lo que se envía es solo lo del modo elegido; nada se pierde ni se manda a medias, así que la confirmación no protege de nada.

## Qué cambió respecto del diseño del 2026-09-18

1. **La cabecera perdió el destino en vez de conservarlo derivado.** Igual que el borrador; lo nuevo es que se elimina en una segunda
   migración (173000) que primero re-llavea y verifica.
2. **La privacidad ya no es una decisión abierta**: la resolvió ADR-0126 (ver arriba).
3. **`registrar_compra` se parcha por anclas** (no se reemplaza): otra sesión (ADR-0135) reescribía la misma función y un reemplazo
   completo habría pisado a una u otra según el orden de pegado.

## Alcance medido (objetos tocados)

- **Tablas:** `compra_item_destinos` y `compra_reasignaciones` (nuevas); `compra_item_cierres` (+`ubicacion_id`); `compras`
  (−`ubicacion_destino_id`).
- **Vistas:** `compra_item_reparto_resumen` (nueva); `compras_resumen` (`ubicaciones_destino uuid[]`).
- **Funciones:** nuevas `fn_puede_ver_compra` y `reasignar_reparto_compra`; con parche `recibir_compras`, `recibir_envio`,
  `registrar_compra`; con firma nueva `cerrar_linea_compra`, `lineas_compra_operativo`, `listar_compras_operativo`; re-llaveadas
  (`fn_puede_ver_compra(c.id)`) `resumen_compras`, `resumen_compras_extra`, `deuda_por_vencimiento`, `salidas_caja_30d`,
  `por_pagar_tramos`, `fn_proveedores` (que Comprobantes reescribió en su 170000 con 4 columnas de cuentas: se parcha sobre esa
  definición y conserva las columnas), `fn_proveedor_metricas_compras`, `fn_proveedor_costo_evolucion`; reescritas por tienda
  `resumen_recepciones` y `listar_recepciones_compras`; recreada `listar_compras` (devuelve `SETOF compras_resumen`).
- **Web:** `lib/reparto-reglas.ts` (+pruebas), `lib/compras-reparto.ts`, `lib/compras.ts`, `lib/compra-form-progreso.ts`,
  `lib/recepciones-reglas.ts`; componentes `RepartoEnRegistro`, `RepartoPorTienda`, `ReasignarReparto`, `CompraFormV2`, `CompraDetalle`,
  `CerrarFaltanteModal`, `RecepcionEnvio`, `recibir/page.tsx`, `compras/page.tsx`.

## Cómo se verificó

- **Base** (`pnpm pruebas:compras-reparto`, Postgres real, cada escenario en su transacción con ROLLBACK): **47/47**. Reparto 12/12; una
  suma distinta se rechaza (por la RPC y por el candado diferido escribiendo directo); una tienda no recibe más de lo suyo ni se «come» la
  de otra; reasignar solo lo pendiente; un integrante no reasigna y no ve la parte de otra tienda; cierres por tienda; RLS; «Recibidas» por
  tienda; el candado de dinero sigue en pie. `--en-seco` (48 con el escenario de re-pegado) solo sirve **antes** de aplicar.
- **Suites vecinas, contra la base con las dos migraciones:** dinero de compras 30/30 (2 se saltan: solo aplican antes del reparto),
  recibir por envío 29/29, faltantes y pago por lote 112/112, referencias de movimientos 72/72, indicadores 144/144, pagos endurecidos 65/65,
  cuentas de proveedor 28/28. **Orden de migraciones** 170000 → 172000 → 173000 → 180000 → 181000 probado en transacción con ROLLBACK
  (la 173000 parcha el `fn_proveedores` de la 170000 y lo deja idéntico a la definición viva).
- **Web:** tipos, lint y 1367 pruebas (66 archivos).
- **Navegador (escritorio y 375 px):** registrar 24 u. repartidas 12 + 12 → en la base `compra_item_destinos` Lima 12 + Trujillo 12 y
  `ubicaciones_destino` con las dos; recibir 18 u. en Lima y comprobar que Trujillo y Taller no se tocaron (comprobante `parcial` 18/36);
  la perspectiva de Trujillo muestra «0 de 14 u. · tu parte»; reasignar 2 de Lima a Trujillo (14 / 10, con historial); cerrar 1 en Lima
  («1 cerradas», «faltan 9»).
- **No se probó:** la carrera de dos recepciones concurrentes de la misma línea desde dos conexiones (un solo `psql` no las lanza a la
  vez); se razona con el `for update` sobre la línea, el mismo candado que ya usaba `recibir_compras`.

## Cómo se pega en producción

**Verificado contra producción el 2026-09-19, solo lectura (`SELECT` sobre `cayla-dynamic`; no se ejecutó DDL):**
- Ninguno de los objetos de este ADR existe todavía; la cabecera `compras.ubicacion_destino_id` existe y es NOT NULL.
- Los requisitos de la 172000 están: libro de cierres (ADR-0111), `recibir_envio` (ADR-0113), candado de dinero (ADR-0126);
  `compras_resumen` tiene 32 columnas (la guarda acepta 32 o 33) y son, en orden, las 32 primeras de la vista que la 172000 vuelve a
  declarar (solo se agrega `ubicaciones_destino` al final); existe el trigger `compra_item_cierres_inmutables` que el relleno apaga un instante.
- Las 12 anclas de los parches (`registrar_compra` ×7, `recibir_compras` ×2, `recibir_envio` ×3) existen en las definiciones vivas, cada una
  el número de veces que el parche exige, y ninguna función está ya parchada.
- Las 15 funciones que aún leen la columna son exactamente las que las dos migraciones tratan (8 re-llaveadas + `resumen_recepciones` y
  `listar_recepciones_compras` reescritas + `registrar_compra`, `recibir_envio`, `cerrar_linea_compra`, `lineas_compra_operativo`,
  `listar_compras_operativo`); la única política que la cita (`compra_item_cierres_select`) la vuelve a crear la 172000; ninguna otra vista
  depende de `compras_resumen`; las 8 funciones se re-llavean sin que quede ningún uso.
- **Producción no tiene ni un comprobante** (0 en `compras`, `compra_items`, recepciones ligadas a comprobantes y `compra_item_cierres`): el
  relleno no tiene nada que copiar y nadie está usando Compras que pueda salir afectado por el orden.

**Orden y qué esperar**
1. **Antes:** ya están las migraciones de ADR-0111, 0113 y 0126 (comprobado arriba; las guardas de la 172000 también lo verifican y abortan
   claro si falta alguna). Las 180000/181000 de ADR-0135 ya están aplicadas: da igual el orden respecto a ellas.
2. **`20260919172000_reparto_compra_por_tienda.sql`**, se pega **sin prefijo `retail.`** (lleva `set search_path`), **sola, en su propia
   ejecución**. Aditiva: crea el reparto, parcha las funciones y deja la cabecera sin uso.
3. **`20260919173000_reparto_compra_retira_destino_de_cabecera.sql`**, **en otra ejecución** (así se probaron, cada una en su propia
   transacción; en una sola habría que poner antes `set constraints all immediate` si el relleno de la 172000 dejó reparto con eventos de
   constraint diferidos pendientes — en producción no hay nada que rellenar). Re-llavea, verifica que nada lea la columna y la elimina.
4. `select retail.fn_aplicar_candado_de_dinero();` (la 173000 ya lo llama; se repite como comprobación, es idempotente).
5. Fusionar el PR (despliega la web). **Es seguro en cualquier orden respecto al SQL**, y por eso se endureció la web:
   - *Web nueva, base vieja* (se fusionó antes de pegar): `listarCompras` y `getLineasCompra` reintentan SIN `p_ubicacion_id` si la base no
     conoce la firma nueva (si no, un colaborador —que no puede leer `listar_compras`— vería Recibir vacío); el detalle no dibuja «Reparto por
     tienda» (la tabla no existe: `esRelacionAusente`, sin el aviso de «no se pudo cargar»); y Registrar NO ofrece «Repartir entre tiendas»
     (`repartoDisponible`): una `registrar_compra` de antes ignoraría `destinos` y mandaría todo a una tienda sin avisar.
   - *Web vieja, base nueva* (se pegó antes de fusionar): verificado leyendo el código de `main`, nunca pide la columna por nombre; solo la usa
     el «Destino» del detalle, que cae a «—» hasta el despliegue. Es lectura de código, no una ejecución.
6. Refrescar el diccionario (`pnpm datos:generar:produccion`, `generado/COMO-REFRESCAR.md`) y correr `pnpm datos:comparar`; el pájaro de las
   dos tablas nuevas está en `scripts/datos/aviario.mjs` (la asignación la aprueba Felipe).

**Cada una es re-pegable justo después de sí misma, pero la 172000 NO se re-pega después de la 173000** (la columna que su relleno lee ya
no existe: falla y revierte entera, sin dejar nada a medias). Tampoco los pegables históricos que nombran la columna, entre ellos
`supabase/migrations/pegar-en-produccion-compras-atraso-recepcion.sql` y `docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-14.sql`; y los dos
pegables de ADR-0126 (A y B) que recrean las funciones de dinero dejan de ser re-pegables una vez aplicado el reparto.

## Consecuencias y qué se rompería

- Se rompe si alguien vuelve a filtrar por un destino en la cabecera (ya no existe), escribe directo en `compra_item_destinos`, o agrega
  una RPC que lee `compras`/`compra_items` sin `fn_puede_ver_compra` (mismo aviso de ADR-0075: una función `security definer` no pasa por
  RLS).
- Un colaborador solo recibe líneas con reparto para su tienda: si la mercadería llegó a otra, un líder debe **reasignar** primero. Es a
  propósito (una tienda no se come la parte de otra) y por eso el botón existe también en comprobantes de una sola tienda.
- Tres suites de otras sesiones daban por existente la columna eliminada y se ajustaron (`pagos_compras_endurecimiento`,
  `proveedores_cuentas_pago` devuelven la columna DENTRO de la transacción de cada escenario; `compras_indicadores` tenía además una lista
  de alias de `fn_proveedores()` desactualizada desde las 4 columnas nuevas de cuentas). Un `--en-seco` de esas suites ya no sirve con el
  reparto aplicado.
- Deuda anotada: el filtro «Destino» (ver «Qué NO se hizo»); y `docs/datos/generado/` no se regenera hasta que producción tenga las
  migraciones.
