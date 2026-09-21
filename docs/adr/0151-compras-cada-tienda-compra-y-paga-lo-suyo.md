# ADR-0151 — Compras: cada tienda compra, ve y paga lo suyo (compradores por tienda)

**Fecha:** 2026-09-21
**Estado:** **Aceptado el 2026-09-21** (cuarta ronda). Se construye por fases; F1 va primero. Nada de esto está en producción todavía.
**Decide:** Felipe, el 2026-09-21 (respuestas en «Lo que dijo el negocio»). Arquitectura: este documento.
**Numeración:** se escribió como 0145, pero `origin/main` ya tenía un 0145 (colaboradores). Se renumeró a 0150 y ese número también lo tomó `docs/adr/0150-roles-y-permisos-a-medida.md` en `main`; queda **0151**. Los commits `7b232583`, `db93cdab` y `0d908ea2` (rama `claude/aviso-cambio-de-sede`) lo nombran 0145. Renumerar de nuevo al subir si otro toma el 0150 (ver ADR-0139, «Historia del número»).
**Refina** ADR-0075 (lectura por sede), ADR-0126 (el dinero de Compras es solo del líder) y ADR-0139 (un comprobante se reparte entre tiendas).
**Cambia** dos reglas de `docs/datos/15-COMO-OPERA-CAYLA.md`: R-10 («una persona encargada de Compras») y la lectura de R-12 («los proveedores sirven a todas las tiendas»
sigue en pie para el catálogo, pero la deuda deja de ser una sola).

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
- **Vista `compra_parte_por_tienda (compra_id, ubicacion_id, subtotal, igv, total)`**, calculada desde `compra_item_destinos × compra_items` (cantidad de la tienda × costo de la línea, más su IGV). **No se guarda**: el reparto
  ya es la verdad, y una segunda tabla de montos permitiría un estado imposible (principio 2). El redondeo se resuelve dando el resto de centavos a la tienda con la parte mayor; **invariante verificable:** la suma de las partes
  es igual a `compras.total`, siempre.
- **Qué puede hacer cada uno sobre una factura:** el comprador de la tienda **gestora** la edita, anula, adjunta escaneos y registra sus notas de crédito. El comprador de **otra** tienda con parte en ella ve solo
  **sus líneas y su monto** y **paga su parte**; no la edita ni la anula.

### D3 — El pago es de una tienda: `compra_pagos.ubicacion_id`

Cada pago dice **qué tienda lo hizo**. `saldo(compra, tienda) = parte de la tienda − pagos de esa tienda − nota de crédito de esa tienda`. `compras.saldo` sigue siendo la deuda con el proveedor y es la **suma**
de los saldos por tienda (derivado, no editable). Un pago no puede exceder el saldo de la tienda que lo hace: se hace cumplir con el mismo tipo de candado diferido de ADR-0139 y se prueba en SQL.
El comprador paga **solo la parte de su tienda** (también en facturas que gestiona otra); el líder puede pagar la parte de cualquiera.

«Pagar juntos» (ADR-0132) y el tope de pagos (ADR-0135) pasan a operar **por tienda**: un comprador paga varias facturas del mismo proveedor, pero solo la parte de su tienda.

**El dinero sale de las cuentas de la empresa** (respuesta 6): el pago de una tienda **no toca su caja** (R-04 intacta). `compra_pagos.ubicacion_id` dice quién pagó, no de dónde salió la plata.
El **pedido de fondos** («necesito S/ 4,000 para pagar a este proveedor el viernes») **no se modela en la primera versión**: la tienda pide y la empresa gira por el canal de siempre. Lo que sí se entrega en F4 es que
«Por pagar» le muestre al líder **cuánto vence por tienda y por semana** — el dato que hoy adivinan al recibir el pedido. Si después quieren el pedido dentro del sistema, es un ADR aparte.

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
| **F3 — Registrar y gestionar** | `compras.ubicacion_gestion_id`; `registrar_compra` exige gestora = tienda del comprador y presente en el reparto (el líder elige); la pantalla Registrar ofrece el reparto a otras tiendas; edición y anulación solo de la gestora | Como comprador de Arequipa registro una factura repartida con Trujillo; el comprador de Trujillo la ve solo en su parte y no puede anularla |
| **F4 — Pagar por tienda** | `compra_pagos.ubicacion_id`, saldo por tienda, tope por tienda; «Pagar juntos» y Por pagar por tienda | Pago de Arequipa baja solo el saldo de Arequipa; uno mayor a su parte se rechaza |
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
