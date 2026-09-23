# ADR-0184 — Compras: cada tienda compra, ve y paga lo suyo (compradores por tienda)

**Fecha:** 2026-09-21 (decisión) · 2026-09-23 (reconciliado con ADR-0161 y cerrado F3-b)
**Estado:** **Aceptado y en producción** (Felipe pegó `20260923180000` … `180500` el 2026-09-23, verificado en solo lectura).
**Decide:** Felipe, el 2026-09-21 (respuestas en «Lo que dijo el negocio») y el 2026-09-23 («Reconciliación con los roles por módulo», abajo).
**Número:** nació como 0145, pasó a 0150 y a 0151; los tres los tomaron otros ADR en `main` (colaboradores, roles a medida, alertas de productos). Pasó a 0179 y también ese lo tomó `main` (prendas sin registrar): queda **0184** (2026-09-23). Commits y comentarios anteriores lo llaman ADR-0145, 0151 o 0179 — **los comentarios de las funciones y tablas ya pegadas en producción dicen «ADR-0179»**: en esas, 0179 quiere decir este ADR, no el de prendas sin registrar.
**Refina** ADR-0075 (lectura por sede), ADR-0126 (el dinero de Compras), ADR-0139 (reparto entre tiendas) y **ADR-0161** (roles por módulo: aquí se le suma la TIENDA).
**Cambia** dos reglas de `docs/datos/15-COMO-OPERA-CAYLA.md`: R-10 («una persona encargada de Compras») y la lectura de R-12 («los proveedores sirven a todas las tiendas»
sigue en pie para el catálogo, pero la deuda deja de ser una sola).

## Estado final (2026-09-23) — esto manda sobre las secciones de abajo

Las secciones de abajo se escribieron el 2026-09-21, cuando el dinero de Compras era solo del líder y «comprador» era una fila en
`compradores_de_tienda`. El 2026-09-22 entró ADR-0161 (en producción): **quién** usa Compras lo decide el ROL, módulo por módulo, y
`20260923130000` escribió «Compras es de la empresa»: con el módulo se veía **todo, de todas las tiendas**. El 2026-09-23 Felipe decidió:
**«cada tienda maneja sus entradas y pagos; si otra tienda registró una factura para dos, cada una registra su pago y recibe lo que le
corresponde»** → con un módulo de Compras se ve y se paga **solo lo de su tienda**; el líder, todo.

**Cómo se componen (dos ejes, cada uno en un solo lugar):**
- **QUIÉN** = el rol (`fn_capacidad_por_modulos`): Facturas de compra registra/anula/adjunta/reasigna; Por pagar paga; Notas de crédito
  registra notas (ADR-0161 P1, sin cambios). Sin módulo no se ve nada.
- **DÓNDE** = `fn_compras_ubicaciones()`: el líder, todas; con módulo, **su tienda** (`fn_ubicacion_actual_persona`, la de todo el ERP;
  para una terminal, la suya) **más** las que el líder le sume en `compradores_de_tienda` (la persona de Compras multi-tienda, R-10). La
  tabla nunca da acceso sola.
- **Ver una factura entera** = ser líder o que la **tienda gestora** (`compras.ubicacion_gestion_id`, donde queda el papel) sea tuya. La
  gestora siempre tiene parte (candado de esquema), así que «toda la factura va a mis tiendas» queda incluido.
- **F3-b — la parte de una tienda que NO gestiona:** no se le abre la tabla (una política de fila no esconde columnas: vería `total`,
  `saldo` y los pagos de la otra tienda por la API). Lee **su** parte con `fn_mis_partes_de_compras()` / `fn_mi_parte_de_compra()`: su
  monto, su saldo, sus líneas y sus pagos. Pantallas: bloque «Tu parte en comprobantes de otras tiendas» (con «Parte nueva»: registrada
  hace ≤ 7 días y sin pagos de su tienda) en Comprobantes y en Por pagar (con Pagar), y `/compras/parte/[id]`.
- **Pagar:** quien no es líder paga siempre desde una de sus tiendas (`p_ubicacion_id`), solo si esa tienda tiene parte y hasta lo que
  le queda (`fn_saldo_de_tienda` = su parte − lo que pagó ella, sin pasar del saldo real de la factura: si el líder saldó todo sin tienda,
  nadie ve deuda fantasma). Candado de esquema diferido: lo pagado por una tienda nunca supera su parte.

**Migraciones (en este orden; las seis en producción desde el 2026-09-23):** `20260923180000_compras_por_tienda_quien_y_donde`, `…180100_compra_parte_por_tienda`,
`…180200_compras_tienda_gestora_y_lectura`, `…180300_compras_pagar_por_tienda`, `…180400_compras_mi_parte`, `…180500_compras_comprador_firma_con_actor` (la firma de `agregar_comprador_de_tienda` en una variable, para que `20260923100000` pueda volver a pegarse). Reemplazan a las cinco
`20260922*` de la rama `adr-0145-compras-permisos`, que nunca se pegaron, chocaban en número con cinco migraciones de `main` y parchaban
textos que ADR-0161 ya había cambiado. Todas parchan la definición VIVA (ancladas en producción al 2026-09-23), son re-pegables y
abortan sin dejar nada a medias si la base cambió.

**Verificado:** `pnpm pruebas:compras-por-tienda` 34/34 (nueva), `compras-parte-por-tienda` 20/20, `roles` 63/63, `dinero-compras` 30/30,
`compras-reparto` 57/57, `compras-indicadores` 144/144, `pagos-compras-endurecimiento` 64/64, `candado-dinero-produccion` 20/20; web:
typecheck, 24.225 tests y `next build`. **Hoy no cambia nada para nadie en producción:** ningún rol fuera del líder tiene Facturas de
compra, Por pagar ni Notas de crédito; deja la puerta bien puesta antes de repartir esos módulos.

**Queda fuera (siguiente):** F6 notas de crédito por tienda (hoy la nota es de la factura y la registra la gestora); F7 resultado por
tienda; `proveedor_creditos` (saldo a favor) sigue siendo de la empresa; `registrar_pago_compra` (envoltorio de un medio, sin tienda)
queda solo para el líder; pantalla para que el líder sume tiendas extra a una persona (hoy por RPC).

## Lo que dijo el negocio (2026-09-21)

1. Cada tienda tiene su propio encargado que compra para ella (Arequipa uno, Trujillo otro…). **Cada tienda compra y ve sus propias facturas.**
2. **El costo es el mismo** para el mismo producto: se le compra al mismo proveedor y el proveedor es general. → No hay costo por tienda; no se construye.
3. **Cada tienda tiene su propio resultado.**
4. **El encargado de la tienda paga** la factura de su tienda.
5. **Una factura puede traer mercadería para varias tiendas.**

**Ronda 2 (2026-09-21):**

6. **La tienda no paga de su caja: paga desde las cuentas de la empresa.** El comprador de la tienda le pide el dinero a la empresa, la empresa se lo pasa, y él paga. → Se cumple R-04 tal cual
   («pagar no toca el cuadre de ninguna sede»): no hay que releerla ni modelar cuentas por tienda. Pero aparece un paso nuevo, **el pedido de fondos**, que hoy vive fuera del sistema (ver «Abierto» 4).
7. **Cada tienda maneja sus facturas y hace sus propias compras.** Se confirma el eje. La factura que trae mercadería para varias tiendas se resolvió en la ronda 3 (respuesta 12).
8. **El comprador de cada tienda es un integrante** (no el líder de equipo), encargado justamente de esto. → Rompe una premisa de ADR-0126: hoy un integrante **no ve dinero de Compras** y el layout de `/compras`
   lo redirige. Con este plan un integrante **comprador** ve y paga el dinero de **su tienda** y solo el de su tienda. Es el cambio de mayor peso de este ADR (ver D1).
9. **Todas las tiendas tienen un comprador** (Lima, Taller, Trujillo, Arequipa…). Nadie compra «por otra tienda».
10. **Proveedores (quién los crea): se deja para después.** No bloquea F1–F3; sí bloquea F4/F5 si el comprador necesita elegir un proveedor que aún no existe.

**Ronda 3 (2026-09-21):**

11. **Quien ve todo es el líder.** → Desaparece la marca «Compras central» que este ADR había propuesto: el **líder** (rol que ya existe) sigue viendo, registrando y pagando en todas las tiendas, exactamente
    como hoy. Menos piezas (principio 3) y ningún líder pierde acceso al aplicar el cambio.
12. **Factura para varias tiendas:** los encargados de las dos tiendas **hablan entre sí y lo resuelven**; el proveedor emite **una sola factura**; **cada tienda paga lo que le corresponde**; y el papel
    **se queda en una de las tiendas**. → Cada factura tiene una **tienda que la gestiona** (donde queda el papel) y un reparto de partes; las demás tiendas ven y pagan su parte (ver D2). El acuerdo
    entre encargados es humano, no del sistema.

**Ronda 4 (2026-09-21) — cierra lo abierto:**

13. **Los compradores de tienda son cuentas creadas para eso**, una por tienda, que hacen el registro. La lista exacta de quién es comprador de qué tienda se carga al aplicar F1, no al escribirla.
14. **La persona encargada de Compras (R-10) no es líder** y puede comprar para una o varias tiendas. → `compradores_de_tienda` admite varias filas por persona. Su acceso lo resuelven los roles y permisos que trabaja otra sesión (`claude/roles-permisos-migration-6506e1`, hoy sin commits propios): **reconciliar con ese diseño antes de aplicar F1 en producción**, para no dejar dos sistemas de permisos que se pisen.
15. **No hay pedido de fondos dentro del sistema ni paso «por aceptar»** en la factura repartida. Ninguno entra en este plan. Si hay disputas, «por aceptar» se agrega después como un estado más.

**Ronda 5 (2026-09-21):**

16. **RETIRADA por Felipe el mismo día.** Se había registrado «cada cuenta de comprador es una persona real» (opción A) y Felipe pidió revisar antes el diseño de la sesión «Estructura de cuentas por tienda». Se cierra con la respuesta 17.

**Ronda 6 (2026-09-21):**

17. **Cada registro y cada pago de Compras queda hecho por la TERMINAL, no por un colaborador en particular: se acepta la cuenta compartida sin nombre.** El comprador de cada tienda es su **terminal administrativa** (una cuenta compartida por tienda, ver la sección siguiente). No se construye identificación por persona (PIN) para pagar. Consecuencia que Felipe acepta: `compras.usuario_id` y `compra_pagos.usuario_id` guardan la persona de la terminal; si alguien pregunta «¿quién pagó esto?», la respuesta es «la terminal de tal tienda». **Lo que contiene el riesgo de R-10** (que quien registra y paga se invente un proveedor): crear proveedores sigue siendo solo del líder (D4), así que la terminal solo puede pagar a proveedores que un líder ya dio de alta.

**Cuentas terminal por tienda (ADR-0152 provisional, sesión «Estructura de cuentas por tienda», rama `claude/terminales-cuentas-129fd4`, sin commitear al 2026-09-21):**

- **Dos cuentas compartidas por tienda, seis en total** (no el Taller): una de **Ventas** y una **Administrativa**. Se guardan como `colaboradores.terminal` (`'ventas'` | `'administrativa'`, una de cada tipo por tienda; nunca un líder) y **cada terminal es una persona de Dynamic** (57 llaves foráneas de retail apuntan a `personas`, así que una cuenta sin persona no puede ni cobrar). La persona la crea quien administra Dynamic; retail solo le da entrada (`agregar_terminal`, solo líder).
- **Capacidades por oficio**, cada una «líder O terminal de tal tipo»: `fn_puede_gestionar_caja` (ventas), `fn_puede_ajustar_inventario`, `fn_puede_editar_catalogo` y `fn_puede_editar_cuentas_proveedor` (administrativa). Las etiquetas con descuento, anular ventas, devoluciones y códigos de descuento siguen solo del líder.
- **Compras queda para este ADR:** esa migración NO abre `fn_puede_registrar_compras()` (por la misma razón que F1: las funciones de pago reciben un `compra_id` sin filtrar por tienda). La **terminal administrativa es el «comprador de tienda»** de este ADR (respuesta 13).
- **Cómo compone con lo construido aquí:** `compradores_de_tienda` funciona tal cual con esa persona (una fila por terminal administrativa). Alternativa más limpia una vez que ambas ramas estén fusionadas: que `fn_compras_ubicaciones()` incluya sola la tienda de la terminal administrativa (`colaboradores.terminal = 'administrativa'`), y dejar la tabla solo para quien compra en varias tiendas (la persona de R-10, que no es una terminal).
- **Trazabilidad del dinero: decidida (respuesta 17).** Una cuenta compartida que registra y paga firma con la persona de la terminal; Felipe lo acepta. Esa sesión habla de que «el dinero aparece según quién se identifique» (un colaborador ve Inventario y Recibir sin montos): eso decide qué VE cada quien en la pantalla y no cambia quién firma el pago.
- **Choque de numeración de migraciones (resuelto de mi lado):** ambas ramas usaban `20260922140000`; la de F2 pasó a `20260922150000`.

**Reconciliación con otros planes (2026-09-21, hallazgos al revisar las sesiones «Estructura de cuentas por tienda» y «Roles y permisos»):**

- **ADR-0150 (roles y permisos a medida, `main`, aprobado, nada aplicado):** decide *qué pantallas* ve un rol (`fn_tiene_permiso(clave)`); este ADR decide *de qué tiendas*. Son ejes distintos y se componen: la puerta de lectura del dinero de Compras pasaría a «tiene el permiso de dinero de Compras **y** la tienda de la factura está en `fn_compras_ubicaciones()`». Ese ADR deja «permisos por sede» fuera de V1 y su F5 (Compras) recrea las funciones de indicadores: **debe partir de `fn_aplicar_candado_de_dinero()` tal como quedó aquí** (ya filtra por `fn_compra_es_de_mis_tiendas`), no de la versión de ADR-0126, o borraría el filtro por tienda.
- **Cuentas por tienda (sesión aparte):** propone dos perfiles por tienda (mostrador; inventario y compras). Este ADR no depende de si la cuenta es personal o compartida mientras exista **una `personas` y una fila en `colaboradores`** (lo que retail exige hoy: `fn_tiene_acceso_retail`, y 57 llaves foráneas de retail apuntan a `personas`). Una cuenta de *terminal* como las de Dynamic (`terminales`: sin persona, atada a una sede) no puede operar retail sin tocar esas 57 llaves.

## Contexto (verificado en el repo, no contra producción)

- `fn_es_lider()` (0016) devuelve «esta persona tiene `colaboradores.rol = 'lider'`». **No mira la tienda.** Por eso hoy un líder de Trujillo ve, registra y paga las
  compras de Arequipa: ADR-0075 lo dejó escrito («un líder no pierde nada: cualquier sede»).
- `fn_puede_registrar_compras()` y `fn_puede_ver_dinero_de_compras()` (ADR-0126, D1) son **la puerta única** del dinero de Compras y hoy responden lo mismo que `fn_es_lider()`.
  ADR-0126 las dejó así justamente para poder cambiar la regla en un solo lugar. Esa decisión es lo que hace viable este plan.
- ADR-0139 ya guarda **a qué tienda va cada línea** (`compra_item_destinos`), quién **recibe** cada parte y a qué tienda pertenece cada **faltante** (`compra_item_cierres.ubicacion_id`).
  Falta lo equivalente para el **dinero**: hoy la deuda (`compras.saldo`) y el pago (`compra_pagos`) son de la factura entera.
- Producción de Compras se toca con funciones `security definer` que escriben su propio candado de sede; `fn_aplicar_candado_de_dinero()` (ADR-0126, D5) **inyecta** «solo líder»
  a cinco funciones de indicadores. Eso choca con este plan (ver «Riesgos»).

## Decisión

### D1 — «Comprador» es un permiso por tienda; el líder ve todo

Una tabla nueva, **`compradores_de_tienda (persona_id, ubicacion_id)`**, dice de qué tiendas es comprador cada persona (normalmente un integrante, respuesta 8; una persona puede tener varias tiendas). Quién ve qué:

| Quién | Compras de… |
|---|---|
| **Líder** (rol que ya existe) | todas las tiendas: ve, registra y paga, como hoy (respuesta 11) |
| **Comprador de tienda** (integrante) | su tienda: las facturas que gestiona y **su parte** de las que gestiona otra tienda |
| Cualquier otra persona | nada de dinero de Compras |

Función nueva `fn_compras_ubicaciones()` → tiendas que puedo gestionar (todas si soy líder; las mías si soy comprador; ninguna si no). `fn_puede_registrar_compras()` y `fn_puede_ver_dinero_de_compras()` (ADR-0126, D1)
siguen siendo la puerta única, sin parámetro: pasan de «soy líder» a «soy líder **o** comprador de alguna tienda». Y **ya no basta**: cada lectura y escritura además filtra por `fn_compras_ubicaciones()`
(el líder no se filtra, porque ve todas).

**Ser comprador NO exige ser líder** y **esto revierte a propósito** una parte de ADR-0126 («dinero solo del líder»): el candado pasa de «rol = líder» a «líder, o comprador de esta tienda». El riesgo que ADR-0126 cerraba
(un integrante cualquiera leyendo montos por la API) **sigue cerrado**: un integrante sin fila en `compradores_de_tienda` no ve nada.

**Cómo quedó F1 al construirla (2026-09-21; migraciones `20260922120000` y `20260922130000`).** Tres decisiones que este texto no fijaba:

1. **Las «dos puertas» se separan.** `fn_puede_ver_dinero_de_compras()` (LEER) se abre a «líder o comprador de alguna tienda»; `fn_puede_registrar_compras()`
   (ESCRIBIR) **no se toca** y sigue siendo solo del líder hasta F3/F4. Las 12 funciones de escritura (`registrar_*`, `anular_compra`, adjuntos, notas) reciben un
   `compra_id` sin filtrar por tienda: abrirlas ahora dejaría a un comprador pagar o anular la factura de otra tienda. F1 es la fase de lectura.
2. **Regla interina de visibilidad, más estricta que la de D2:** un comprador ve una factura **solo si TODA ella va a tiendas suyas**
   (`fn_compra_es_de_mis_tiendas`). La factura repartida con una tienda ajena queda **cerrada** para él hasta F2 (vista de partes): sin partir el dinero
   por tienda no hay forma de enseñarle «su parte» sin enseñarle la de la otra. Costo: hasta F2/F3 un comprador no ve una factura compartida.
3. **La lectura del comprador sigue las tiendas donde COMPRA, no la sede donde está fijo.** Las 5 funciones de dinero filtraban por `fn_puede_ver_compra`
   (sede fija, hecha para recibir); pasan a `fn_compra_es_de_mis_tiendas`. Un comprador de Lima fijo en Trujillo no ve Trujillo. Notas de crédito
   (`notas_credito_tablero`, `fn_facturas_para_nota_credito`) siguen solo del líder hasta F6 porque no filtran por tienda.

**Límite conocido (F5):** las vistas calculan «recibido» leyendo `movimientos`/`lotes`, que se ven por sede; un comprador fijo en una sede que compra para
otra verá el estado de recepción de esa otra según lo que su sede alcanza a ver. La cuenta pensada (una por tienda, fija en su tienda) no lo sufre.

**Riesgo aceptado por Felipe (respuesta 11):** todo líder de equipo ve el dinero de Compras de **todas** las tiendas, no solo de la suya. Es lo que pasa hoy; este ADR no lo empeora ni lo arregla.

### D2 — Cada factura tiene una tienda que la gestiona; el dinero se parte por tienda desde el reparto

- **`compras.ubicacion_gestion_id`** (nuevo, obligatorio): la tienda cuyo comprador **registró y responde por** el comprobante — donde «se queda el papel» (respuesta 12). **No es el destino** (`compras.ubicacion_destino_id`
  se eliminó en ADR-0139 justamente por ser una segunda verdad): el destino de la mercadería sigue siendo el reparto por línea; la gestión dice quién responde por el papel. Un comprador solo puede registrar con **su** tienda
  como gestora, y esa tienda tiene que aparecer en el reparto (si no, sería registrar deuda de otra tienda). El líder puede elegir cualquiera.
- **Reparto:** quien registra puede repartir hacia otras tiendas. El acuerdo con los otros encargados es humano (respuesta 12); el sistema no pide «aceptar». Para que no sea una sorpresa: la parte nueva aparece marcada
  «parte nueva» en el Por pagar y en Recibir del otro comprador, y el líder (que ve todo) puede reasignar (ya existe `compra_reasignaciones`, ADR-0139). Si esto genera disputas, el siguiente paso es un estado «por aceptar»
  (no se construye ahora; es la opción C de las tres que se evaluaron).
- **Vista `compra_parte_por_tienda (compra_id, ubicacion_id, unidades, subtotal, igv, total)`** (F2, construida): se calcula desde `compra_items × compra_item_destinos × compras`. **No se guarda**: el reparto ya es la verdad, y una segunda tabla de montos permitiría un estado imposible (principio 2).
  **Reparte la CABECERA, no las líneas.** Hallazgo al construirla: `compra_items.costo_unitario` guarda 2 decimales pero `registrar_compra` calcula el subtotal con el costo tal como llegó (33.333), así que con costos de 3 decimales la suma de las líneas puede diferir de la cabecera por centavos (líneas 1,336.23; cabecera 1,336.24). Lo que se debe es la cabecera; las líneas solo dicen en qué proporción. El subtotal se reparte según el peso de cada tienda en las líneas y el IGV (un monto guardado, que puede venir del papel) según el subtotal de cada tienda. Redondeo por **mayor resto** (cada centavo sobrante a quien tiene el mayor residuo; empate por `ubicacion_id`), no «el resto a la parte mayor»: es igual con 2 tiendas y más justo con 3 o más.
  **Invariante verificable:** la suma de `subtotal`, `igv` y `total` de las partes es siempre la de `compras`, al centavo (`pnpm pruebas:compras-parte-por-tienda`, con costos de 3 decimales, 3 tiendas, IGV del papel, boletas y regalos de costo 0).
- **Qué puede hacer cada uno sobre una factura:** el comprador de la tienda **gestora** la edita, anula, adjunta escaneos y registra sus notas de crédito. El comprador de **otra** tienda con parte en ella ve solo
  **sus líneas y su monto** y **paga su parte**; no la edita ni la anula.

**F3, construida — `compras.ubicacion_gestion_id` y quién gestiona:**
- **La gestora es el parámetro que ya existía** (`p_ubicacion_destino_id` de `registrar_compra`), reusado en vez de agregar uno nuevo: una lista de parámetros distinta crea una sobrecarga (la lección del 2026-09-19, ver `[[reescribir-funcion-de-produccion-desde-su-definicion-real]]`). Antes de F3 ese parámetro solo era el destino de respaldo de una línea sin reparto explícito y no se guardaba en ningún lado (ADR-0139 quitó `compras.ubicacion_destino_id`); con F3 pasa a ser **la gestora** y sí se guarda.
- **Un comprador registra con SU tienda como gestora, y esa tienda tiene que tener parte en el reparto** — igual para el líder: es un candado de esquema (`compras_gestora_obligatoria` + un disparador diferido que también protege contra escribir el reparto directo), no solo de la RPC. Dejar que cualquiera eligiera una gestora sin parte habría permitido un estado sin sentido: una tienda «responsable del papel» que no recibe nada.
- **Un comprador registra SIN pago** (pagar es F4); el líder sigue registrando con o sin pago, como siempre.
- **La gestora ve la factura ENTERA** (F1 se amplía: antes solo veía una factura si iba completa a sus tiendas). El comprador de otra tienda con parte, pero que no gestiona, sigue sin ver nada — esa es la F3-b pendiente (la vista de «solo mi parte»).
- **`cambiar_tienda_gestora_compra`**: solo el líder, y la nueva tienda tiene que tener parte.
- **Costo real, no supuesto:** repurpasar `p_ubicacion_destino_id` rompió 3 suites de pruebas que ya existían (`compras_reparto`, `pagos_compras_endurecimiento`, `compras_indicadores`), porque usaban ese parámetro como un valor sin relación con el reparto real (antes no importaba). Se corrigieron los 3 (dos ajustes de datos de prueba, uno que reinstala a propósito una versión histórica de `registrar_compra` y ahora también relaja el candado nuevo solo dentro de esa simulación). `pnpm pruebas:compras-tienda-gestora` → 24/24.

### D3 — El pago es de una tienda: `compra_pagos.ubicacion_id`

Cada pago dice **qué tienda lo hizo**. `saldo(compra, tienda) = parte de la tienda − pagos de esa tienda − nota de crédito de esa tienda`. `compras.saldo` sigue siendo la deuda con el proveedor y es la **suma**
de los saldos por tienda (derivado, no editable). Un pago no puede exceder el saldo de la tienda que lo hace: se hace cumplir con el mismo tipo de candado diferido de ADR-0139 y se prueba en SQL.
El comprador paga **solo la parte de su tienda** (también en facturas que gestiona otra); el líder puede pagar la parte de cualquiera.

«Pagar juntos» (ADR-0132) y el tope de pagos (ADR-0135) pasan a operar **por tienda**: un comprador paga varias facturas del mismo proveedor, pero solo la parte de su tienda.

**El dinero sale de las cuentas de la empresa** (respuesta 6): el pago de una tienda **no toca su caja** (R-04 intacta). `compra_pagos.ubicacion_id` dice quién pagó, no de dónde salió la plata.
El **pedido de fondos** («necesito S/ 4,000 para pagar a este proveedor el viernes») **no se modela en la primera versión**: la tienda pide y la empresa gira por el canal de siempre. Lo que sí se entrega en F4 es que
«Por pagar» le muestre al líder **cuánto vence por tienda y por semana** — el dato que hoy adivinan al recibir el pedido. Si después quieren el pedido dentro del sistema, es un ADR aparte.

**F4, construida — `compra_pagos.ubicacion_id`, tres RPC de pago con un candado por tienda:**
- `fn_saldo_de_tienda(compra, ubicacion)` = su parte (F2) menos lo que ya pagó ESA tienda. **Todavía NO resta notas de crédito por tienda** (eso es D5/F6): mientras tanto `compras.saldo` (que sí las resta) sigue siendo el número que manda para la factura entera.
- Las tres RPC que usa la pantalla (`registrar_pagos_compra`, `registrar_pago_compras`, `registrar_pago_compras_medios`) ganan `p_ubicacion_id uuid default null` **al final**, sin cambiar el orden de los parámetros que ya tenían (otra lista de parámetros crea una sobrecarga: aquí además hubo que `drop` la firma vieja explícitamente antes de crear la nueva, porque `create or replace` con un parámetro de más NO reemplaza — deja las DOS vivas). `registrar_pago_compra` (el wrapper de un solo medio) no se toca.
- **Sin tienda (solo el líder puede):** el pago no queda atado a ninguna — paga la factura entera desde «las cuentas de la empresa», como siempre. **Con tienda:** además del saldo total de la factura, el pago no puede superar el saldo de ESA tienda; un candado de esquema (disparador diferido, mismo patrón que F3 y ADR-0139) lo hace cumplir aunque alguien escriba directo (ya cerrado por RLS de todos modos).
- **«Pagar juntos» por tienda:** con `p_ubicacion_id`, CADA comprobante del lote tiene que tener parte de esa tienda y no superar su saldo — todo o nada, igual que ya hacía por saldo total.
- **Hallazgo real al construirla (no un descuido menor):** recrear una función con una firma distinta (`drop` + `create`) crea un objeto nuevo que **no hereda los `grant`** de la vieja — Postgres le da `EXECUTE` a `PUBLIC` por defecto. Las tres quedaron momentáneamente abiertas a `anon` hasta que una prueba que ya existía (`pagos_compras_endurecimiento`) lo detectó; se corrigió con `revoke`/`grant` explícitos después de cada `create`, y quedó una prueba propia que lo fija.
- Dos pruebas que ya existían (`compras_indicadores` — vía el fix anterior de F3 — y `pagos_compras_endurecimiento`) usaban las firmas viejas de estas RPC o reinstalaban a propósito código histórico de antes de esta migración: se actualizaron o ganaron el mismo salto explícito que F1/F3. `pnpm pruebas:compras-pagar-por-tienda` → 23/23.

### D4 — El proveedor sigue siendo uno para toda la empresa

Catálogo compartido (así se dijo: «el proveedor es general»). Cambia lo que se **ve**: el saldo con un proveedor es, para un comprador, **lo que su tienda le debe**; para el líder, el total.
**Crear proveedores** queda solo en el líder por ahora: R-10 ya advertía que quien crea un proveedor y además paga puede inventarse uno, y con varios compradores ese riesgo se multiplica.

### D5 — Notas de crédito: siguen a la tienda que tuvo el faltante

El faltante ya es de una tienda (`compra_item_cierres.ubicacion_id`, ADR-0139): su nota de crédito (ADR-0142) se atribuye a esa tienda y baja **su** saldo. Una nota de otro motivo
(devolución, descuento) la registra un comprador de las tiendas afectadas y se reparte en proporción a las partes. *Detalle por cerrar al llegar a F6.*

### D6 — Resultado por tienda: las compras solo aportan «lo comprado» y «lo que se debe»

Lo que una tienda **gasta en mercadería** en su resultado no es lo que compró sino el costo de lo que **vendió** (`movimientos` ya lleva ubicación y costo). Las compras por tienda alimentan
dos cosas que hoy faltan: **compras del mes** y **deuda con proveedores** de esa tienda. *Sin verificar:* cómo calcula hoy el Estado de Resultados su costo de ventas y si ya corta por tienda;
F7 empieza leyéndolo, no asumiendo.

## Por qué así y no otra forma (alternativas descartadas)

| Alternativa | Por qué no |
|---|---|
| Un esquema de compras por tienda (tablas o proyectos separados) | Rompe la **factura repartida** (el negocio la pidió) y duplica proveedores. El reparto de ADR-0139 ya es el eje. |
| Que el líder de cada tienda sea el comprador «por definición» (usar `sede_base_id`) | Mezcla dos cosas: quién manda en la sede y quién compra. El comprador es un integrante (respuesta 8), no el líder de equipo. |
| Guardar el monto de cada tienda en una tabla | Segunda fuente de verdad: el reparto y el monto podrían discrepar (principio 2). Se calcula. |
| Que la tienda pague sin límite por factura | Un pago mayor a su parte deja a otra tienda con deuda de más, sin que nadie lo vea. |

## Plan por fases (cada una se prueba sola y se pega en producción en su orden)

| Fase | Qué entrega | Cómo lo verificas tú |
|---|---|---|
| **F0** | Cerrada la decisión (ronda 4). Queda cargar la lista de compradores al aplicar F1 | Una lista firmada: «quién es comprador de qué tienda» |
| **F1 — Permiso y lectura** | Tabla `compradores_de_tienda`; `fn_compras_ubicaciones()`; las políticas de `compras`, `compra_items`, `compra_pagos`, `compra_adjuntos`, `compra_notas_credito` y el bucket, las funciones de indicadores y `listar_*` filtran por ella (el líder no se filtra); `resumen_recepciones` gana la tienda. **Solo agrega permiso: ningún líder pierde nada** | Con un ensayo revertido en SQL: el comprador de Arequipa ve solo lo de Arequipa; el líder ve todo; un integrante sin fila ve cero dinero |
| **F2 — Partir el dinero** | Vista `compra_parte_por_tienda` + prueba de la invariante «la suma de partes = total» con redondeos feos (3 tiendas, IGV) | Una factura repartida entre 3 tiendas muestra tres partes que suman el total al centavo |
| **F3 — Registrar y gestionar (hecho en local, sin aplicar)** | `compras.ubicacion_gestion_id` + candado de esquema (gestora con parte); `registrar_compra` exige gestora = tienda del comprador y presente en el reparto (el líder también); un comprador registra sin pago; anular y adjuntar: líder o comprador de la gestora; `cambiar_tienda_gestora_compra` (solo líder) | `pnpm pruebas:compras-tienda-gestora` → 24/24. **Falta con clics** (F5): registrar una factura repartida como comprador y ver que el de la otra tienda no la anule |
| **F4 — Pagar por tienda (hecho en local, sin aplicar)** | `compra_pagos.ubicacion_id` + `fn_saldo_de_tienda`; las tres RPC de pago (`registrar_pagos_compra`, `registrar_pago_compras`, `registrar_pago_compras_medios`) ganan `p_ubicacion_id`; «Pagar juntos» respeta la regla por cada comprobante del lote; sin tienda solo el líder | `pnpm pruebas:compras-pagar-por-tienda` → 23/23. **Falta:** Por pagar por tienda en pantalla (F5) y restar notas de crédito por tienda (F6) |
| **F5 — Pantallas** | El layout de `/compras` deja pasar a líder o comprador (hoy redirige a quien no es líder); Comprobantes, Por pagar y Proveedores acotados; «parte nueva»; los textos «aquí ves todas las tiendas» solo para el líder | En el navegador con un comprador de una tienda y con un líder |
| **F6 — Notas de crédito por tienda** | D5 | La nota de un faltante de Trujillo baja el saldo de Trujillo y no el de Lima |
| **F7 — Resultado por tienda** | D6: compras del mes y deuda por tienda en el resultado de cada una | Lima y Trujillo muestran cifras distintas que suman el total de la empresa |

**Fuera de este plan:** costo por tienda (el negocio dijo que es el mismo), cuentas bancarias por tienda (la tienda paga desde las de la empresa) y el pedido de fondos dentro del sistema (D3).

## Despliegue sin candado roto (regla de esta migración)

F1 **solo agrega**: crea la tabla y da acceso de comprador a los integrantes que Felipe indique. El líder conserva su acceso por rol, así que **nadie pierde nada al aplicarla** y volver atrás es vaciar la tabla.
El recorte —que un integrante sin fila deje de ver dinero de Compras— ya lo hizo ADR-0126 y no cambia.

## Riesgos

1. **`fn_aplicar_candado_de_dinero()` (ADR-0126, D5)** inyecta «solo líder → 42501» a las cinco funciones de indicadores. Con este plan esas funciones dejan de fallar para el comprador: le **filtran** a su tienda (al líder no le filtran).
   Hay que reescribir esa función (y su red de seguridad `select retail.fn_aplicar_candado_de_dinero();` → `{}`), o reaplicarla borraría el filtro nuevo. Es la primera cosa que se toca en F1.
2. **Muchas funciones a la vez.** ADR-0139 tocó 19 funciones de Compras; F1 y F4 tocan un conjunto parecido (25 archivos de migración mencionan las dos puertas). Se trabaja como pidió la memoria de este repo:
   partir de `pg_get_functiondef` de **producción**, no del archivo.
3. **Pantallas sin prueba automática**: cada fase de UI se verifica en el navegador con un comprador real de prueba.
4. **Producción**: todas son migraciones de esquema en producción. Se dejan listas en local y las pega Felipe, una por fase, con verificación en solo lectura después.

## Abierto — ninguna cambia el diseño; se necesitan antes de la fase indicada

1. **Nombres de los compradores por tienda** (bloquea aplicar F1 en producción, no escribirla): las cuentas que se crearán y a qué tienda(s) pertenece cada una.
2. **Reconciliar con la sesión de roles y permisos** (bloquea aplicar F1 en producción): dar a la persona de Compras (no líder) su acceso sin duplicar el sistema de permisos.

*Cerradas:* medio de pago (6), compradores integrantes (8), todas las tiendas con comprador (9), líder ve todo (11), factura repartida (12), persona de Compras y pedido de fondos y «por aceptar» (13–15). *Diferida por Felipe:* quién crea proveedores (10).

## Consecuencias

- Al terminar, un comprador nunca ve ni paga lo de otra tienda salvo su parte de una factura repartida; el líder ve todo; el dinero de una factura repartida suma siempre al centavo; y cada tienda tiene su deuda con proveedores separada.
- Lo ya construido (recibir por tienda, reparto, notas de crédito, candado del dinero) se **reutiliza**, no se rehace: el eje sigue siendo `compra_item_destinos`.
- Las líneas «aquí ves todas las tiendas» de Comprobantes y Por pagar (commit `3e4ea1c6`) son ciertas hoy y para un líder; dejarán de serlo para un comprador: se ajustan en F5.
