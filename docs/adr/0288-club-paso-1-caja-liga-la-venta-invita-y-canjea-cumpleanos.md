# ADR-0288: Club de clientas, paso 1 (Caja liga la venta, invita al club y canjea el cumpleaños)

**Fecha:** 2026-09-29
**Estado:** Aceptado como diseño (Felipe resolvió los tres puntos abiertos el 2026-09-29; ver «Lo que decidió Felipe»).
Todavía no hay migración ni código: se construye por tandas (1a → 1e).
**Decide:** Felipe, en las actas `docs/datos/DECISIONES-2026-09-26-clientas.md` (D-92 a D-111) y
`docs/datos/DECISIONES-2026-09-29-club-clientas.md` (CL-1 a CL-28; manda donde corrige a la anterior).
**Afecta:**
- **Tablas:** `retail.clientas` (documento con tipo, `cumple_anio`, `club_desde`); nuevas `retail.club_permisos`,
  `retail.club_textos` y `retail.club_canjes`; `retail.venta_items` (`es_regalo`, `descuento_club_unitario`);
  `retail.pedidos_no_atendidos` (`motivo`, `razon`); `retail.comprobantes` (tipos de documento, **con el OK de Felipe**).
- **Funciones:** `registrar_venta` (se reescribe desde su definición de producción); `registrar_clienta`,
  `editar_clienta`, `buscar_clienta`, `unir_clientas` y `archivar_clienta` (se ajustan al documento con tipo).
  Nuevas: `unirse_al_club`, `registrar_mensaje_publicidad` («Llegó su mensaje»), `registrar_desde_whatsapp`
  (cartel), `registrar_baja_whatsapp`, `resumen_clienta_caja` y `registrar_pedido_no_atendido` con motivo.
- **Tablas (actualización 2026-09-30):** `retail.ubicaciones.whatsapp_numero`; en `clientas`, `publicidad_desde` y
  `codigo_club`.
- **Web:** `PuntoDeVenta.tsx` (la fila «Clienta» del ticket y el cobro), `lib/clienta-ticket-reglas.ts`,
  `lib/clienta-actividad-reglas.ts`, `lib/ventas-offline.ts`, `lib/lucode.ts`, `NuevaClientaModal.tsx`.

## El encargo, en una frase

Hoy la clienta del ticket **solo llena el comprobante**. `registrar_venta` ya acepta `p_cliente_id` y
`ventas.cliente_id` tiene su FK a `clientas` (`20260922140000`), pero `PuntoDeVenta.tsx` nunca lo manda: ninguna
venta queda en la ficha de nadie (verificado en `main` el 2026-09-29, `git grep p_cliente_id apps/web` vacío).
Este paso cierra ese hueco y le agrega lo que el club necesita en caja:
- documento con tipo;
- invitación al club;
- tarjeta de socia;
- cumpleaños con candado;
- «es para regalo» y «se probó y no llevó».

> **Aviso a otras sesiones:** el PR #631 dice «pasos 1 y 2 en `main`». Solo el 2 lo está (ADR-0249). El paso 1 es
> este ADR.

## DECISIÓN 1: la venta se liga con el `p_cliente_id` que ya existe

**DECIDÍ:** Cobrar manda `p_cliente_id` con la clienta elegida, y la venta sin conexión lo guarda en la cola igual
que el resto de `ParamsRegistrarVenta`. `registrar_venta` agrega dos reglas:
- si la ficha fue **unida** a otra, la venta se liga a la que se mantuvo (`fusionada_en_id`);
- si está **anonimizada**, rechaza con `clienta_anonimizada`. Es una venta sin conexión que llegó tarde: se vende
  sin clienta y la cola la muestra como rechazo, igual que una caja cerrada (ADR-0036).

**DESCARTÉ:** un parámetro nuevo `p_clienta_id` (con el nombre correcto). La API ya dice `cliente_id` en la tabla y
en la función; tener dos nombres para lo mismo es peor que un nombre viejo.

**SE ROMPE SI:** alguien vuelve a crear `retail.clientes` (retirada en ADR-0154). La FK apunta a `clientas`.

## DECISIÓN 2: el documento tiene tipo, y la columna deja de llamarse `dni` (CL-2)

**El problema:** una clienta con carné de extranjería guardado en una columna `dni` sale en la boleta como
DNI (catálogo 06 de SUNAT: «1») con un número que RENIEC no tiene, y SUNAT la rechaza. El nombre de la columna
miente, y esa mentira termina en un comprobante rechazado.

**DECIDÍ:**
- `clientas.dni` pasa a llamarse `documento_numero`, y se agrega `documento_tipo text not null default 'dni'`, con
  un check que solo acepta `dni`, `carne_extranjeria` o `pasaporte`.
- El único parcial `clientas_dni_unico` pasa a `(documento_tipo, documento_numero)`.
- Formato, con un check `not valid` y validado después de revisar las filas de producción: DNI con 8 dígitos;
  carné y pasaporte, de 6 a 12 letras o dígitos.
- El check de anonimizada (ADR-0249) se reescribe con las columnas nuevas.
- Solo el DNI consulta el padrón (`/api/padron`, ADR-0008); carné y pasaporte llevan el nombre a mano.

**DESCARTÉ:**
- Dejar la columna `dni` y agregar solo el tipo: es más barato hoy, pero cada función futura tendría que recordar
  que `dni` no siempre es un DNI.
- Una tabla aparte de documentos por clienta: nadie tiene dos.

**PAGO:** 7 funciones de Clientas cambian de cuerpo, y `registrar_clienta`/`editar_clienta` cambian de
parámetros. Por eso se hace `drop function` de la firma vieja y `create` de la nueva en la misma parte: un `create
or replace` con otros parámetros crea una sobrecarga, no reemplaza (memoria «reescribir una función de producción»).
Cada función se reescribe partiendo de su `pg_get_functiondef` de producción, con el md5 «antes» comprobado.

**SE ROMPE SI:** una función que no se reescribió sigue leyendo `clientas.dni`. Por eso la PARTE 2 termina con
un `select` que falla si algún `prosrc` de `retail` todavía nombra `clientas.dni`.

## DECISIÓN 3: el comprobante acepta carné y pasaporte, pero es una parte aparte que pide el OK de Felipe

**DECIDÍ:** `comprobantes_cliente_tipo_doc_check` suma `carne_extranjeria` y `pasaporte`, y `lib/lucode.ts` los
manda como «4» y «7» (catálogo 06 de SUNAT). Va en su **propia parte**, porque toca la emisión legal (CLAUDE.md:
integraciones que dan validez legal a un comprobante).

**Mientras no se pegue**, la clienta con carné o pasaporte **igual compra y se liga a su ficha**. Su boleta sale como
hoy sale la de una extranjera: `sin_documento` con su nombre. Se degrada con gracia (principio 9) y no bloquea el
resto del paso.

## DECISIÓN 4: dos permisos distintos, y el de publicidad solo nace de un mensaje que ella escribe (reescrita el 2026-09-30)

*La versión del 2026-09-29 (un solo permiso, «respondió SÍ a la bienvenida», D-108) queda reemplazada. El porqué está
en la «Actualización 2026-09-30» al final.*

Hay tres estados que la pantalla debe distinguir:

| Estado | Qué significa | Cómo lo da | Cómo se sabe |
|---|---|---|---|
| **Identificada** | Tiene ficha; sus compras se ligan | Da su documento | `clientas` activa |
| **Socia** | Beneficios del club y avisos **informativos** (su apartado, la talla que pidió, su boleta) | Su «sí» de palabra en caja, que registra la asesora con el texto del club | `clientas.club_desde is not null` |
| **Con publicidad** | Novedades, rebajas, «Te extrañamos» y el saludo de cumpleaños por WhatsApp | **Solo escribiéndole ella a la tienda** desde el QR | `clientas.publicidad_desde is not null` |

**DECIDÍ:**
- **`retail.club_permisos`** es append-only, como `movimientos`. Guarda:
  - `clienta_id`;
  - `finalidad`: `club` o `publicidad_whatsapp`;
  - `accion`: `otorga` o `revoca`;
  - `medio`: `caja_palabra`, `whatsapp_propio` (ella escribió), `ficha` o `baja_whatsapp`;
  - `telefono`: el número que escribió, o el de la ficha al registrarse;
  - `texto_version`, `ubicacion_id`, `venta_id` (si fue en una venta), `registrado_por` (el responsable del combo,
    ADR-0161; siempre obligatorio, porque no hay bot) y `created_at`.
  - Sin `update` ni `delete` para nadie. RLS encendido **sin políticas**: solo la escriben y la leen funciones
    `security definer`.
- **Candado de la ley en el esquema:** un check hace imposible `finalidad = 'publicidad_whatsapp' and accion =
  'otorga'` con un medio que no sea `whatsapp_propio`. **Nadie puede marcar la publicidad «de palabra»**, ni desde
  caja ni desde la ficha.
- `club_desde` y `publicidad_desde` son la **foto** que la misma transacción deriva de esa historia (principio 4).
  Checks:
  - `club_desde` exige celular;
  - `publicidad_desde` exige `club_desde`.
- `whatsapp_consentimiento_en` (ADR-0154) queda como estaba, sin escrituras nuevas. Una migración posterior la retira
  cuando ninguna lectura la use.
- **`clientas.codigo_club`** (`C-0001`, correlativo y único) se asigna al unirse. Va en el QR personalizado y es lo
  que la asesora busca cuando llega el mensaje.
- **`ubicaciones.whatsapp_numero`**: el número de cada tienda, para armar el enlace `wa.me`. **Sin número no se
  muestra el QR** y el club sigue funcionando sin publicidad (principio 9).
- **La baja entra en este paso, no en el 3:** desde que existe el primer permiso de publicidad, su «BAJA» debe
  registrarse ese mismo día (la ley pide efecto inmediato). `registrar_baja_whatsapp` busca por número, escribe
  `revoca` y vacía `publicidad_desde`; la baja vale para las 3 tiendas.
- **`retail.club_textos`** (`version`, `tipo` — `club` o `mensaje_publicidad` —, `texto`, `vigente_desde`): el texto
  que la asesora lee al invitarla y el mensaje que ella envía. Nunca se editan; cada cambio es una versión nueva.
  **Sin un texto `club` vigente, Cobrar no muestra «Invitar».**

**Lo que cambia de hoy:** `registrar_clienta(p_acepta_whatsapp := true)` hoy marca el permiso en caja. **Deja de
hacerlo**: el parámetro desaparece de la firma nueva. Las fichas que hoy tienen `whatsapp_consentimiento_en`
marcado en caja pasan a **socias** (un evento `club` de medio `caja_palabra`, con `texto_version` nulo y la nota
«marcado en caja antes de ADR-0288»), **sin publicidad**: les falta su mensaje. Producción tenía 0 clientas el
2026-09-26; la migración cuenta cuántas toca y lo imprime.

**DESCARTÉ:**
- Un booleano `es_socia`: no dice desde cuándo, y el aniversario (CL-17) necesita la fecha.
- Que la tienda mande el primer mensaje pidiendo el «SÍ» (el D-108 original): es el primer contacto que la Ley
  32323 dejó sin efecto.
- La casilla que ella toca en una pantalla: CAYLA no tiene pantallas táctiles ni tablets (Felipe, 2026-09-30).

## DECISIÓN 5: el cumpleaños lo calcula la base, con un canje único por año

**DECIDÍ:**
- **Cobrar manda solo `p_canjear_cumpleanos boolean`; nunca manda el monto.** `registrar_venta` verifica cuatro
  cosas, con `for update` sobre la clienta:
  - que sea socia;
  - que el mes actual en `America/Lima` sea su `cumple_mes`;
  - que no haya un canje vivo este año;
  - que la venta tenga conexión (ver abajo).
- Si pasa, calcula en cada línea `descuento_club_unitario = round((precio_unitario - descuento_unitario) *
  pct / 100, 2)`: es la cascada de CL-11, sobre toda la compra.
- El total del comprobante ya lo descuenta.
- **`retail.club_canjes`**: `clienta_id`, `tipo` (`cumpleanos`; más adelante, `aniversario`), `anio`,
  `venta_id` y `anulado_en`, con un **único parcial `(clienta_id, tipo, anio) where anulado_en is null`**. Un
  segundo canje del mismo año es imposible en el esquema, no solo en el código.
- El % vive en `configuracion_empresa.club_cumple_pct` (default 10), para que Felipe lo ajuste con datos (pendiente
  5 de CL-G) sin migrar.
- El descuento del club **no cuenta para el tope de descuento de la asesora** (D-67): es una regla del club, no
  su criterio.
- **Anular la venta** libera el canje (`anulado_en`): la venta nunca existió.
- **Sin conexión, el botón se apaga.** Una venta encolada con cumpleaños podría llegar a la base después de que
  otra tienda ya lo canjeó, y la clienta ya se fue con el precio rebajado. Ese estado sería imposible de
  corregir (principio 2): es mejor no ofrecerlo que tener que arreglarlo después.

**DESCARTÉ:** que la pantalla calcule el 10% y lo mande en `descuento_unitario` con el motivo «cumpleaños». La base
tendría que creerle al navegador el monto y la elegibilidad, y cualquier descuento podría disfrazarse de
cumpleaños.

## DECISIÓN 6: «buscó y no había» y «se probó y no llevó» son la misma tabla (CL-7, CL-14)

**DECIDÍ:** `pedidos_no_atendidos` suma:
- `motivo`: `no_habia_talla` (default: todo lo de hoy) o `se_probo_no_llevo`;
- `razon` opcional, solo para `se_probo_no_llevo`: `no_le_quedo`, `precio`, `color` o `lo_piensa`.

El informe «Tallas y prendas que faltaron» (CL-14) lee una sola tabla. En Cobrar, **al quitar una prenda del ticket**
aparece un toque opcional: «¿Se la probó y no la llevó?». Anota con o sin clienta: sin clienta sigue siendo
demanda para Compras. Sin venta también funciona: el ticket se limpia y lo anotado queda.

**DESCARTÉ:** una tabla nueva `senales_clienta`. Serían dos lugares para la misma pregunta de Compras («¿qué
querían y no se llevaron?»).

**SE ROMPE SI:** «Llegó tu talla» (paso 3) avisa también por `se_probo_no_llevo`: ella no pidió esa prenda. El
aviso filtra `motivo = 'no_habia_talla'`.

## DECISIÓN 7: «es para regalo» es una marca por prenda vendida (D-101)

**DECIDÍ:** `venta_items.es_regalo boolean not null default false`, que se marca por línea en el ticket solo si hay
clienta elegida. `fn_clienta_compras` lo devuelve, y `deducirTallas` (`lib/clienta-actividad-reglas.ts`) lo salta:
se cierra el «LÍMITE CONOCIDO (v1)» de ese archivo.

## DECISIÓN 8: la tarjeta de socia lee una sola función, y la regla de frecuente sigue en un solo lugar

**DECIDÍ:** `resumen_clienta_caja(p_clienta_id)` (el prefijo `resumen_` ya está en la lista de lectura de
`espera-reglas.ts`, así que no abre el loader) devuelve:
- `es_socia`;
- `cumple_disponible` (su mes, sin canje este año, con el %);
- `pedidos_llegados`: sus `no_habia_talla` sin resolver que hoy tienen stock en esta sede.

La **talla** y **«te falta N para frecuente»** siguen saliendo de `deducirTallas` y `estadoFrecuente` sobre
`fn_clienta_compras`: la ficha y la caja usan la misma regla y no pueden decir cosas distintas.

**Ajuste de CL-25 (compra neta):** `fn_clienta_compras` pasa a excluir las ventas devueltas enteras, y con eso
«frecuente» deja de contarlas en la ficha y en la caja a la vez.

## DECISIÓN 9: el registro en caja ocurre en el ticket, sin salir del cobro

Es el flujo del spike (`docs/maquetas/punto-venta-spike-2026-09/`, la captura de Felipe del 2026-09-29):
1. Tipo de documento (DNI por defecto) + número → `buscar_clienta`.
2. Si no existe y es un DNI: `/api/padron` → nombre. Si el padrón no responde, el campo de nombre se abre para
   escribirlo (principio 9).
3. «Registrar» → `registrar_clienta`. Queda identificada y en el ticket. **Registrarse no es unirse al club.**
4. Si no es socia: la tarjeta «No es del club todavía» con **Invitar / Ahora no** (CL-8: en cada compra; «Ahora no»
   no se guarda). «Invitar» pide:
   - el celular (obligatorio, CL-1);
   - el cumpleaños (día y mes; año opcional, CL-3);
   - que la asesora lea el texto `club` vigente → `unirse_al_club` (evento `club`, medio `caja_palabra`) → se
     asigna su `codigo_club`.
   - **Al terminar, la tarjeta muestra el QR personalizado de publicidad** y el mismo QR sale impreso en su ticket
     (ver «Actualización 2026-09-30»). Ella decide si lo escanea ahora, en casa o nunca.
5. Al registrarse (con cualquier documento), `registrar_clienta` **liga sus ventas anteriores sin clienta** cuyo
   comprobante tiene ese mismo tipo y número (CL-27). El padrón usado para la boleta no crea la ficha: la crea el
   registro.

La ficha de `/clientas` (`NuevaClientaModal.tsx`) cambia igual: el interruptor «acepta WhatsApp» se vuelve «se
une al club», con el texto `club` vigente. **La ficha no puede marcar la publicidad** (candado de la D-4). **Se conserva la guía de foco** (`CampoGuiado`, `PieGuia`; ADR-0284 y el aviso
del PR #631).

## Permisos y módulos

Todo vive en el módulo `clientas` (D-92), y no nace ningún módulo nuevo. Cada función nueva:
- empieza con `fn_exigir_modulo('clientas')`;
- firma con `fn_actor_persona_id(true)`.

Una cuenta sin el módulo sigue vendiendo sin clienta (`filaDeClienta` → `nada`). Tampoco puede canjear el
cumpleaños: `registrar_venta` rechaza `p_canjear_cumpleanos` sin el módulo.

## Estados que el esquema hace imposibles

- Dos canjes vivos del mismo tipo y año para la misma clienta (único parcial en `club_canjes`).
- Dos fichas con el mismo `(documento_tipo, documento_numero)`.
- Un DNI que no tenga 8 dígitos.
- Una socia sin celular.
- Un evento del club borrado o editado (sin permisos de escritura; solo funciones `security definer`).
- Un evento `club` u `otorga` nuevo sin versión de texto (check: `texto_version` nulo solo en los eventos migrados,
  con medio `caja_palabra` y la nota de legado).
- **Un permiso de publicidad que no venga de un mensaje de ella** (`otorga` + `publicidad_whatsapp` exige
  `whatsapp_propio`).
- Publicidad sin club (`publicidad_desde` exige `club_desde`).
- Una anonimizada con documento, celular, cumpleaños, `club_desde` o `publicidad_desde` (el check de ADR-0249,
  reescrito; anonimizar escribe antes los eventos `revoca` de los dos permisos).

**Lo que queda del lado de la función, no del esquema** (y lo cubren las pruebas):
- que el canje sea en su mes;
- que `descuento_club_unitario > 0` solo exista en una venta con canje.

## Cómo se pega en producción (ADR-0195: partes que no mezclan `alter` de tablas en uso con políticas)

| Parte | Qué | Nota |
|---|---|---|
| 1 | `alter` de `clientas`, `venta_items`, `pedidos_no_atendidos`; tablas nuevas con RLS y sin políticas; `configuracion_empresa.club_cumple_pct` | `lock_timeout 3s`, idempotente |
| 2 | Funciones: `registrar_venta`, las 7 de Clientas, `unirse_al_club`, `resumen_clienta_caja`, `registrar_pedido_no_atendido`; y el guardia que falla si algo sigue nombrando `clientas.dni` | Aborta sin tocar nada si el md5 «antes» de una función cambió en vivo |
| 3 | Migra los permisos marcados en caja a eventos `club` de legado (socias sin publicidad) | Imprime cuántas filas tocó |
| 4 | **Comprobantes: carné y pasaporte** | OK de Felipe (2026-09-29); se verifica con una boleta real en Lucode |

No hay parte de políticas: las tablas nuevas solo se leen por funciones.

## Pasos verificables (principio 7), en este orden

| Paso | Qué | Cómo lo verifica Felipe |
|---|---|---|
| 1a | Venta ligada + documento con tipo + ventas anteriores que se ligan | Vende a una clienta registrada y la venta aparece en su ficha; registra un DNI que ya tenía una boleta sin ficha, y esa compra aparece |
| 1b | Invitar + los dos permisos + textos versionados + código de socia + QR (caja, ticket, cartel) + «Llegó su mensaje» + «Registrar desde WhatsApp» + tarjeta de socia | La invita en caja y ve «Socia desde…» sin publicidad; escanea el QR con su celular, envía el mensaje, la asesora marca «Llegó su mensaje» con el código y la ficha pasa a «Con publicidad»; desde la ficha no hay forma de marcarla a mano |
| 1c | Cumpleaños | Vende a una socia en su mes, toca «10%» y ve la cascada (20% → 28%); en otra venta el botón ya no está; anula la primera y vuelve |
| 1d | «Es para regalo» + «se probó y no llevó» | Marca un regalo y la talla de la ficha no cambia; quita una prenda del ticket, anota «se la probó» y la ve en la lista |
| 1e | Boleta con carné o pasaporte | Emite una boleta de prueba con carné y Lucode la acepta con tipo «4» |

Cada tanda:
- se prueba **a 375 px** (PL-105: toca Vender);
- trae `scripts/pruebas/club-caja.mjs` (carrera de dos canjes a la vez, fusionada, anonimizada, sin módulo, sin
  texto vigente);
- trae `vitest` de `lib/club-caja-reglas.ts`.

## Las tres preguntas

- **Concurrencia:** dos cajas canjean el cumpleaños a la vez. El `for update` sobre la clienta pone a la segunda en
  espera y el único parcial la rechaza con `cumpleanos_ya_canjeado`. Dos cajas registran el mismo documento: lo
  frena el único `(tipo, número)` y el upsert completa la ficha existente.
- **Caída externa:** si el padrón no responde, el nombre se escribe a mano. Si no hay conexión, se vende y la venta
  va a la cola con su `p_cliente_id`, pero sin cumpleaños (el botón se apaga). Si Lucode rechaza un carné (antes de
  la parte 4), la boleta sale `sin_documento`.
- **Persona sin contexto:** la asesora elige el documento (ya viene DNI), escribe el número, el nombre aparece solo,
  y hace una pregunta: «¿te unes al club?».

## Lo que decidió Felipe (2026-09-29)

1. **La parte 4 (comprobantes con carné y pasaporte): sí**, en su parte aparte. Antes de dar la tanda 1e por
   terminada, una boleta de prueba real tiene que ser aceptada por Lucode con el tipo «4».
2. **El texto v1 del consentimiento** es el borrador. *(Descartado el 2026-09-30 por la Ley 32323 y
   reemplazado por los textos v2: ver la actualización al final.)* La PARTE 1 lo siembra como `club_textos.version = 1`:

   > Te unes al Club CAYLA. Te escribiremos por WhatsApp desde el número de la tienda para avisarte cuando llegue
   > tu talla, en tu cumpleaños y con novedades (máximo 2 promociones al mes). Te llegará un mensaje: respóndelo SÍ
   > para activarlo. Puedes salir cuando quieras respondiendo BAJA. CAYLA cuida tus datos según la Ley 29733.

   Cuando el club tenga su nombre definitivo (pendiente 1 de CL-G), se crea la versión 2. La 1 no se edita: hay
   «sí» que la citan.
3. **Si devuelve toda la compra, no recupera el cumpleaños:** lo usó en esa visita. Solo **anular** la venta libera
   el canje (`anulado_en`), porque la venta nunca existió. Si la devolución fue por una falla, el líder puede
   compensarla con un descuento autorizado (D-67).

## Lo que queda fuera de este paso

- «Respondió SÍ», las bajas y la bandeja de avisos (paso 3).
- La bandeja que recomienda qué mensaje mandar a cada clienta y los mensajes para todas (paso 3; ver la
  «Actualización 2026-09-30»).
- El aniversario (paso 5; `club_canjes.tipo` ya lo admite).
- El ticket de regalo sin precios (idea, no pedida).
- El % del cumpleaños contra el tope del 2% (paso 4).

## Actualización 2026-09-30: sin bot, y la publicidad solo cuando ella escribe primero (Ley 32323)

**Qué cambió.** El 2026-09-29 Felipe pidió un bot de envío automático, y se investigó la API oficial de Meta
(`docs/investigacion/2026-09-30-whatsapp-bot-y-consentimiento.md`). Con los costos y las reglas a la vista, Felipe
decidió el 2026-09-30:
- **No habrá bot.** Cada tienda envía los mensajes a mano desde su propio número. Se confirma D-106.
- **El sistema recomienda** qué mensaje mandar a cada clienta y arma los mensajes para todas; la tienda los envía.
  Es el diseño del paso 3, no de este paso.

**Lo que toca a este paso** (Felipe, 2026-09-30):
- `club_permisos.origen` pasa a ser `medio` (`caja_palabra`, `whatsapp_propio`, `ficha`, `baja_whatsapp`), sin `bot`, y
  `registrado_por` es siempre obligatorio.
- **El texto v1 del 2026-09-29 queda descartado.** Decía «te llegará un mensaje: respóndelo SÍ», y la **Ley 32323**
  (9-may-2025, art. 58.1.e del Código del Consumidor) solo permite publicidad a quien «por iniciativa propia» contacta
  a la empresa. Indecopi habló de «derogación tácita» del primer contacto para pedir permiso
  (`docs/investigacion/2026-09-30-whatsapp-bot-y-consentimiento.md`).
- **Sin pantalla táctil ni tablet**, el consentimiento queda así (D-4 reescrita):
  - **Club** (beneficios y avisos informativos): su «sí» de palabra en caja, registrado por la asesora.
  - **Publicidad:** solo si ella escribe primero, desde un QR que abre el WhatsApp de la tienda con el texto listo.
- **Dónde está el QR y cómo se sabe de quién es:**

| Dónde | Qué dice el mensaje | Cómo se liga a su ficha |
|---|---|---|
| Pantalla de caja, al invitarla | Quiere recibir publicidad + su código `C-0142` | La asesora busca el código (o el número) y marca «Llegó su mensaje». Si escribió desde otro número, el ERP lo avisa y su celular pasa a ser el que escribió |
| Ticket de una venta con clienta | Igual, con su código | Igual; puede hacerlo en casa |
| Ticket de una venta sin clienta y cartel del mostrador | Quiere unirse al club y recibir publicidad (sin código) | Como ella escribió primero, la tienda responde en ese chat pidiendo su DNI. Con el DNI, «Registrar desde WhatsApp» la crea socia con publicidad (padrón para el nombre, el número que escribió como celular). Sin DNI no hay ficha y el ERP no le escribe |

- **Textos v2** (reemplazan el v1; se siembran en `club_textos`):
  - **Club, que la asesora lee:** «Te unes al Club CAYLA: guardamos tu nombre, documento, celular y cumpleaños para
    tus beneficios y para avisarte por WhatsApp de tus apartados y de las tallas que nos pidas. Puedes salir cuando
    quieras.»
  - **Mensaje personalizado, que ella envía:** «Hola CAYLA, quiero recibir por WhatsApp novedades, rebajas y mi saludo
    de cumpleaños. Sé que me doy de baja escribiendo BAJA. (Club C-0142)»
  - **Mensaje genérico, que ella envía:** «Hola CAYLA, quiero unirme al Club CAYLA y recibir por WhatsApp novedades,
    rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA.»
- **Riesgo aceptado:** Felipe decidió activar el club **sin validación de un abogado** (2026-09-30). Quedan sin
  confirmar dos puntos: que invitar en caja cuente como «iniciativa propia» y que los avisos informativos queden fuera
  del 58.1.e.
- **Condiciones para activar en una tienda:**
  - que su `whatsapp_numero` esté cargado;
  - que el respaldo de WhatsApp de su celular esté encendido: la prueba del permiso es el chat.
- **La tanda 1b vuelve a estar lista para construirse.** El paso 3 (la bandeja que recomienda qué mensaje mandar y
  los mensajes para todas) solo ofrece publicidad a quien tiene `publicidad_desde`, y avisos informativos a toda
  socia.

## Actualización 2026-09-30 (b): tanda 1a construida

Migración `supabase/migrations/20260930160000_club_paso1a_venta_ligada_y_documento.sql` (una sola parte, sin
políticas). Se probó en un Postgres desechable propio, con las 372 migraciones y el seed. Lo que se aparta del diseño
de arriba, y por qué:

- **`registrar_venta` no se reescribe entera.** Un solo reemplazo anclado agrega un bloque anidado después de
  `fn_actor_persona_id(true)`: resuelve la ficha y reasigna el propio `p_cliente_id`, que en PL/pgSQL es asignable y es
  lo que el `insert into ventas` ya guarda.
  - Por qué: el texto vivo difiere entre bases solo en comentarios. Producción, main y el local tienen el mismo md5
    normalizado, pero un ancla sobre la declaración no calzaba en la base armada desde el repo.
  - Las 5 anclas se comprobaron en producción (en solo lectura): cada una aparece exactamente una vez.
- **La venta con clienta NO exige el módulo «Clientas».** El id solo sale de `buscar_clienta`, que sí lo exige. Exigirlo
  en `registrar_venta` haría fallar una venta ENTERA que esperaba en la cola sin conexión, si al rol le quitaron el módulo
  en el camino.
- **Dos ayudantes internos**, sin EXECUTE para la API:
  - `fn_documento_clienta`: normaliza y valida; es el único lugar de los mensajes.
  - `fn_ligar_ventas_por_documento` (CL-27): liga solo ventas sin clienta y nunca mueve una que ya es de otra ficha.
    También la usa `editar_clienta` cuando cambia el documento. Hoy liga por DNI; la tanda 1e la extiende sin cambiarla,
    porque compara `comprobantes.cliente_tipo_doc` con el mismo nombre de tipo.
- **`editar_clienta` traduce el único:** poner un documento que ya es de otra ficha da 23505 con el hint
  `documento_de_otra_ficha` y el mensaje «únelas con Unir fichas», en vez del error crudo.
- **El seed ya no trae la empresa con RUC como clienta.** Una ficha es de una persona (DNI, carné o pasaporte), y el RUC
  va en la factura.
- **Orden de despliegue:** pegar la migración y fusionar el PR enseguida. Entre los dos, la pantalla vieja no puede
  registrar ni editar fichas (la venta sigue sin clienta); leer y buscar funcionan igual.
