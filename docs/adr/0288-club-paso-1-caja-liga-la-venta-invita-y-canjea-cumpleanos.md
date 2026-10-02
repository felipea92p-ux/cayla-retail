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

*Superada el 2026-09-30: Felipe decidió seguir el spike, sin la marca. Ver «Actualización 2026-09-30 (e)».*

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
- **Primer pegado en producción (2026-09-30), fallido sin daño.** El SQL Editor vio `select … into v_ficha_id` dentro
  del texto que el reemplazo anclado inserta en `registrar_venta`, lo tomó por un `SELECT INTO` que crea una tabla y
  agregó al final `alter table v_ficha_id enable row level security` (se ve en el log de Postgres). Falló con 42P01 y
  todo se deshizo; se verificó en producción, en solo lectura, que siguen `dni` y las funciones de antes.
  - Arreglo: la ficha se lee con `for … in select … for key share loop exit; end loop;`. El md5 «después» de
    `registrar_venta` pasa a `703928f5…`.
  - La regla quedó en CLAUDE.md («El SQL Editor agrega líneas por su cuenta»).


## Contrato de la tanda 1b (2026-09-30): socia, dos permisos, código y QR

Se construye sobre la D-4 reescrita y la «Actualización 2026-09-30». Migración `20260930200000_club_paso1b_permisos_y_qr.sql`,
en partes si hace falta: sin políticas, triggers con `create or replace trigger`, y ningún `select … into` dentro de un texto
entre comillas.

**Esquema**
- `retail.clientas` suma estas columnas:
  - `club_desde timestamptz`, `publicidad_desde timestamptz`;
  - `codigo_club text unique`, con formato `C-0001` y secuencia `retail.clientas_codigo_club_seq`;
  - `cumple_anio smallint` (opcional, CL-3).
  - Candados:
    - `club_desde` exige celular;
    - `publicidad_desde` exige `club_desde`;
    - `codigo_club` está presente si y solo si hay `club_desde`;
    - una anonimizada no tiene `club_desde`, `publicidad_desde`, `codigo_club` ni `cumple_anio`.
- `retail.ubicaciones.whatsapp_numero text`: 9 dígitos que empiezan en 9. Sin número no hay QR.
- `retail.club_textos (tipo, version, texto, vigente_desde, creado_por)`, con único `(tipo, version)`.
  - `tipo`: `club` (lo lee la asesora), `mensaje_personal` (lo envía ella; lleva `{codigo}`) o `mensaje_generico`.
  - El vigente de cada tipo es su versión más alta. Se siembran los textos v2 de la actualización como `version = 2`.
    El v1 nunca se sembró.
- `retail.club_permisos`, de solo agregar (un disparador rechaza `update` y `delete`; RLS sin políticas y sin permisos
  para la API):
  - columnas: `id`, `clienta_id`, `finalidad` (`club` o `publicidad_whatsapp`), `accion` (`otorga` o `revoca`), `medio`,
    `texto_tipo`, `texto_version`, `ubicacion_id`, `venta_id`, `registrado_por`, `nota` y `created_at`;
  - `medio`: `caja_palabra`, `ficha`, `whatsapp_propio`, `baja_whatsapp`, `anonimizar` o `legado`.
  - Candados:
    - una publicidad que se otorga exige `medio = 'whatsapp_propio'`;
    - `otorga` exige `texto_version`, salvo en `legado`;
    - `registrado_por` es obligatorio salvo en `legado`.
  - **Sin teléfono en el evento.** Anonimizar tiene que poder borrar a la clienta (Ley 29733) y un registro de solo
    agregar no se edita. La prueba del número es el chat de la tienda.

**Funciones.** Todas empiezan con `fn_exigir_modulo('clientas')` y firman con `fn_actor_persona_id(true)`, salvo la de
la tienda.
- `unirse_al_club(p_clienta_id uuid, p_telefono_whatsapp text, p_cumple_dia smallint, p_cumple_mes smallint,
  p_cumple_anio smallint, p_medio text default 'caja_palabra', p_ubicacion_id uuid, p_venta_id uuid)`
  → `table(codigo_club text, club_desde timestamptz)`.
  - `p_medio` es `caja_palabra` o `ficha`. El celular es obligatorio.
  - Exige texto `club` vigente (hint `club_sin_texto`); rechaza una ficha archivada o anonimizada.
  - Si ya es socia, completa los datos y devuelve su código sin un evento nuevo.
- `registrar_mensaje_publicidad(p_clienta_id uuid, p_telefono_que_escribio text, p_ubicacion_id uuid)` → `timestamptz`
  («Llegó su mensaje»).
  - Exige que sea socia.
  - Escribe una publicidad que se otorga con medio `whatsapp_propio` y el texto `mensaje_personal` vigente.
  - Si el número que escribió difiere del de la ficha, ese pasa a ser su celular.
- `registrar_desde_whatsapp(p_documento_tipo text, p_documento_numero text, p_nombre text, p_telefono_que_escribio text,
  p_ubicacion_id uuid)` → `table(clienta_id uuid, codigo_club text)` (cartel).
  - El documento es obligatorio (CL-1).
  - Completa o crea la ficha, como `registrar_clienta`.
  - Escribe `club` y publicidad, las dos con medio `whatsapp_propio` y el texto `mensaje_generico`.
- `registrar_baja_whatsapp(p_telefono text, p_ubicacion_id uuid)` → `integer` (fichas afectadas).
  - Revoca la publicidad (medio `baja_whatsapp`) de toda ficha con ese celular y vacía `publicidad_desde`.
  - Su club sigue: los avisos informativos no son publicidad.
- `resumen_clienta_caja(p_clienta_id uuid)` → `table(es_socia boolean, codigo_club text, club_desde timestamptz,
  con_publicidad boolean, celular text, cumple_dia smallint, cumple_mes smallint)`. Es de lectura (prefijo `resumen_`).
- `fn_club_textos_vigentes()` → `table(tipo text, version integer, texto text)`. Es de lectura; la llama la web.
- `guardar_whatsapp_tienda(p_ubicacion_id uuid, p_numero text)`.
  - Con el mismo permiso que `guardar_metas_tienda` (Configuración ▸ Tiendas y caja).
  - Un número vacío lo quita.
- `registrar_clienta(p_documento_tipo, p_documento_numero, p_nombre, p_telefono_whatsapp, p_cumple_dia, p_cumple_mes,
  p_cumple_anio)` y `editar_clienta(p_id, p_documento_tipo, p_documento_numero, p_nombre, p_telefono_whatsapp,
  p_cumple_dia, p_cumple_mes, p_cumple_anio, p_tallas, p_version_esperada)` **pierden `p_acepta_whatsapp` y
  `p_revoca_whatsapp`**. El permiso ya no se marca ahí (D-4). A una socia no se le puede borrar el celular.
- `archivar_clienta` con anonimizar: primero escribe `revoca` (medio `anonimizar`) de los permisos vigentes, después vacía
  los campos del club.
- `unir_clientas`: la que queda toma el `club_desde` y el `publicidad_desde` más antiguos, y el código si no tenía. Los
  eventos de la ficha unida se quedan con ella; `clientas_fusiones` lleva de una a la otra.
- Legado: las fichas con `whatsapp_consentimiento_en` pasan a socias SIN publicidad (evento `club`/`legado`), solo si
  tienen celular. Producción tenía 0 el 2026-09-30.

**Web**
- **Cobrar:** la fila de la clienta muestra «Socia C-0142» o la tarjeta «No es del club todavía — Invitar / Ahora no»
  (CL-8).
  - «Invitar» pide celular y cumpleaños, lee el texto `club` y llama a `unirse_al_club`.
  - Al terminar muestra el QR personalizado: `wa.me/51<número de la tienda>?text=<mensaje_personal con su código>`.
  - El ticket impreso lleva el QR personalizado (socia) o el genérico.
- **`/clientas`:**
  - la ficha muestra socia, publicidad y código, con «Unirse al club» (medio `ficha`), «Llegó su mensaje» y «Pidió BAJA»;
  - «Registrar desde WhatsApp» y «Registrar una BAJA» en el panel;
  - el cartel imprimible en `/clientas/cartel`, con el QR genérico de cada tienda;
  - `NuevaClientaModal` pierde el interruptor «acepta WhatsApp».
- **Configuración ▸ Tiendas y caja:** el número de WhatsApp de cada tienda.
- **Ajustes al contrato (2026-09-30, a pedido del agente de Cobrar, aprobados por el arquitecto):**
  - `fn_club_textos_vigentes()` no exige el módulo «Clientas»: la usa también el ticket impreso de una cajera sin él, para
    el QR genérico. Los textos no son datos personales.
  - `unirse_al_club` exige documento y nombre, además del celular (CL-1), con el hint `socia_sin_documento`.
  - `unirse_al_club` suma `p_texto_version`: rechaza con `club_texto_cambio` si el texto `club` cambió desde que la
    asesora lo leyó. Así el permiso guarda exactamente lo que se le leyó.
- **Cambio de celular (decisión del arquitecto, 2026-09-30, a pedido de Felipe; Felipe puede revertirla):** el celular de una socia se cambia siempre, pero si tenía publicidad, `editar_clienta` y `registrar_clienta` se la quitan en la misma transacción (evento `revoca`, medio nuevo `cambio_celular`, con `registrado_por`), porque la prueba del permiso es el chat desde el número viejo; sigue socia y la recupera cuando escriba desde el número nuevo («Llegó su mensaje»). «Llegó su mensaje» y el cartel sí cambian el celular conservándola (ella escribió desde el nuevo), y el disparador `clientas_celular_con_publicidad` rechaza (`celular_con_publicidad`) cualquier otro cambio de celular que la conserve.


## Actualización 2026-09-30 (c): camino B, ella confirma su publicidad en una página de CAYLA

**Decisión de Felipe (2026-09-30), «Directo al camino B».** Viene del spike del club (rama
`claude/spyke-club-clientas-visual-631f7a`). El QR personal ya no abre el WhatsApp de la tienda: abre una **página pública
de CAYLA** con el texto y una **casilla sin marcar**. Cuando ella la marca y confirma, el permiso de publicidad queda
registrado solo, y la caja y la ficha se actualizan sin que nadie marque nada.
- «Llegó su mensaje» se queda como **respaldo** (camino A).
- El QR genérico (cartel y ticket sin clienta) sigue abriendo el WhatsApp de la tienda: registrar a alguien nuevo desde
  una página pública pediría su documento en internet, y eso no se decidió.

**Por qué cumple la Ley 32323.** El consentimiento es de ella, en su propio celular, con una casilla que ella marca. Es la
«iniciativa propia» más clara posible, y deja prueba en la base: la versión del texto, la hora y el enlace usado. El
reglamento de la Ley 29733 (art. 5.1) nombra el «toque» como consentimiento válido.

**Contrato (lo decide el arquitecto; Felipe puede revertir cualquier punto):**
- **Tabla `retail.club_invitaciones`:** `id`, `clienta_id` (FK), `token` (único), `ubicacion_id`, `creada_por` (el
  responsable), `creada_en`, `vence_en`, `usada_en`, `texto_version` (la que ella aceptó).
  - RLS sin políticas: solo la leen y la escriben funciones.
- **El token:** 16 caracteres aleatorios seguros para una URL (`gen_random_bytes`, unos 96 bits).
  - **Vence a los 7 días:** el mismo QR le sirve desde casa si hoy no lo escanea.
  - **Se usa una sola vez.** Adivinarlo no es viable, y aunque se adivinara solo daría un permiso de publicidad, nunca
    datos: la página muestra su nombre de pila y el celular a medias.
- **Medio nuevo `qr_web` en `club_permisos`:** es un otorga de publicidad **sin `registrado_por`**, porque lo registró
  ella y no una persona de la tienda; lleva la versión del texto de la página. `registrado_por` nulo solo se admite en
  `qr_web` y en `legado`.
- **Texto nuevo `pagina_publicidad`**, v1, sembrado; `{celular}` se reemplaza por su celular a medias:
  > Quiero recibir por WhatsApp de CAYLA novedades, rebajas y mi saludo de cumpleaños al {celular}. Sé que puedo darme de
  > baja cuando quiera escribiendo BAJA.
- **Funciones:**
  - `crear_invitacion_club(p_clienta_id uuid, p_ubicacion_id uuid)` → `table(token text, vence_en timestamptz)`.
    - Exige el módulo «Clientas» y el responsable.
    - Exige que sea socia y que no tenga publicidad (hint `ya_tiene_publicidad`).
    - Si ya tiene una invitación vigente sin usar, la devuelve; si no, crea una nueva.
  - `fn_invitacion_club(p_token text)` → `table(estado text, nombre_corto text, celular_enmascarado text, codigo_club text,
    texto text, texto_version integer, tienda text, razon_social text, ruc text)`.
    - **Es para `anon`**: la página es pública.
    - `estado`: `vigente`, `usada`, `vencida` o `no_existe`.
    - Solo devuelve datos con `vigente`.
  - `confirmar_invitacion_club(p_token text, p_texto_version integer)` → `text` (el estado final). **Es para `anon`.**
    - Solo con una invitación vigente, sin usar, y con la clienta todavía socia y sin anonimizar.
    - Rechaza con `club_texto_cambio` si el texto cambió.
    - Escribe el otorga con medio `qr_web` y marca `publicidad_desde` y `usada_en`, todo en una transacción con
      `for update` de la invitación.
    - Una segunda llamada devuelve `usada` sin escribir nada.
- **Web:**
  - Ruta pública `/club/[token]`, fuera de `(app)` y permitida en `proxy.ts`. Mobile first, con la marca CAYLA y el diseño
    del spike («Demo: página completa»).
  - En Cobrar y en la ficha, «Mostrar su QR» crea la invitación, dibuja el QR de `${origen}/club/${token}` y dice
    «Esperando su confirmación» sin animación en bucle (regla de movimiento, ADR-0136).
  - La caja consulta `resumen_clienta_caja` cada 3 s mientras la hoja está abierta; cuando llega la publicidad, cambia a
    «Listo».
  - Debajo, «Llegó su mensaje (respaldo)».
- **Ticket impreso:** sigue con el QR del camino A (WhatsApp con su código). Imprimir no puede depender de crear una
  invitación en la base, y ese QR también le sirve desde casa.
- **Anonimizar y unir (decisión del arquitecto, 2026-09-30):** archivar una ficha (con o sin anonimizar) vence en ese
  momento sus invitaciones sin usar, y unir vence las de la ficha que se va; las de la que queda siguen. Nada se borra y
  ninguna invitación pasa a otra ficha, porque un enlace pensado para un número podría terminar dando la publicidad en
  otro. La página responde `vencida` también ante una ficha archivada, anonimizada, unida o sin club, sin decir por qué.

## Contrato de la tanda 1c (2026-09-30): el cumpleaños con un canje por año

Se construye sobre la D-5, CL-10 y CL-11. Migración en TRES partes (van después de la 1b; cada una sola en el SQL Editor,
en orden): `20260930230000_club_paso1c_parte1_venta_items.sql` (solo `venta_items`), `…230100_…parte2_configuracion.sql`
(solo `configuracion_empresa`) y `…230200_…parte3_cumpleanos.sql` (`club_canjes` y las funciones). Toda venta lee la
configuración y después escribe `venta_items`: tomadas en una misma transacción, una venta a medio camino y la migración
se esperarían en cruz (deadlock). La cabecera de la PARTE 3 tiene el porqué, el orden y la verificación con los md5.

**Decisión de Felipe (2026-09-30): el 10 % de cumpleaños se aplica completo aunque deje una prenda bajo su costo.** Es un
regalo del club. El candado de «no vender bajo costo» sigue valiendo para el resto de los descuentos: se mide sin la
parte del club.

**Cómo viaja:**
- `venta_items.descuento_unitario` sigue siendo el descuento TOTAL por unidad, así que el comprobante, los pagos y los
  reportes no cambian.
- La columna nueva `venta_items.descuento_club_unitario` (default 0) dice cuánto de ese total es del cumpleaños.
  Candado: `0 <= descuento_club_unitario <= descuento_unitario`.
- Cobrar calcula con la misma regla pura y manda en cada ítem `descuento_club_unitario`, con `p_canjear_cumpleanos =
  true`. **La base lo recalcula y rechaza si no coincide** (hint `cumple_descuento_distinto`, tolerancia de 1 céntimo),
  así que la pantalla nunca decide el monto.

**Regla del cálculo** (CL-11, en cascada, a toda la compra, prenda sin registrar incluida):
`descuento_club_unitario = round((precio_unitario − descuento_sin_club) × pct / 100, 2)`
- `descuento_sin_club = descuento_unitario − descuento_club_unitario`.
- Una prenda al 20 % queda en 28 %.
- El redondeo es el de Postgres (medio céntimo hacia arriba); la regla de la web lo replica, con prueba.

**`registrar_venta`** suma `p_canjear_cumpleanos boolean default false`. Cambia de firma: `drop` de la vieja y `create`
de la nueva, partiendo de la definición viva de producción (la de la 1a).
- **Con `p_canjear_cumpleanos = true` exige**, con la ficha ya resuelta tomada `for no key update` en la MISMA lectura de
  la 1a (la que sigue las uniones; al construir: dos canjes a la misma socia hacen fila ahí, y una venta sin canje a esa
  clienta no espera, porque su `for key share` no choca; tomarla primero `for key share` y subirla después trabaría a dos
  canjes entre sí):
  - que sea socia (`club_desde`), sin anonimizar ni archivar;
  - que el mes actual en `America/Lima` sea su `cumple_mes`;
  - que no haya un canje vivo este año (el único parcial lo hace imposible igual).
  - Los hints: `cumple_no_socia`, `cumple_fuera_de_mes`, `cumple_ya_canjeado` y `cumple_sin_clienta` (una anonimizada ya
    la frena la 1a con `clienta_anonimizada`). Al construir se sumó `cumple_sin_monto`: un canje que no descuenta nada
    (todo redondea a 0.00) gastaría el cumpleaños del año por nada.
  - Un reintento de la MISMA venta (mismo `p_token`) que esperó en la ficha mientras la primera se guardaba devuelve esa
    venta, no `cumple_ya_canjeado`.
- **Sin canjear**, todo `descuento_club_unitario` tiene que ser 0 (hint `cumple_sin_canje`).
- **El motivo de la línea describe el descuento SIN el club** (candado `venta_items_motivo_coherente_con_descuento`, que
  sigue `not valid`): una prenda cuyo único descuento es el cumpleaños no lleva motivo; con campaña o descuento a mano,
  el suyo.
- **Los candados de la venta miden el descuento SIN la parte del club:**
  - el costo;
  - el tope de la asesora (D-67);
  - el 35 % del líder;
  - el argumento sobre el 15 %;
  - el código de descuento.
  - (Al construir: la campaña también se verifica sobre el descuento sin club. El tope D-67 no necesita nada: mide
    `p_descuento_pct`, que la caja declara aparte y no sale de las líneas.)
- **Al canjear**, escribe en `retail.club_canjes` (`id`, `clienta_id`, `tipo` = `'cumpleanos'`, `anio`, `venta_id`,
  `pct`, `monto`, `registrado_por`, `created_at`, `anulado_en`, `anulado_por`).
  - Candado: único parcial `(clienta_id, tipo, anio) where anulado_en is null`.
  - RLS sin políticas.
  - Anota la actividad sin datos de la clienta.
- `configuracion_empresa.club_cumple_pct numeric not null default 10`, con candado entre 1 y 50: Felipe lo ajusta sin
  migrar.
- **Anular la venta** libera el canje (`anulado_en`, `anulado_por`, los de la venta): la venta nunca existió. Al
  construir se hizo con un disparador sobre `ventas` (`trg_club_canje_libera_al_anular`, como el de la prenda por
  regularizar) y no dentro de `anular_venta`, que no cambia: así libera TODA anulación, también la del SQL a mano
  (`pegar-en-produccion-anular-venta-*.sql`). Una devolución NO lo libera (decisión de Felipe, 2026-09-29).
- **Sin conexión, la web apaga el botón**, y una venta con el canje nunca entra a la cola sin conexión (`llevaCanje`,
  `lib/ventas-offline.ts`): si la conexión se corta al cobrarla, la caja lo dice y la asesora decide (confirmar otra vez
  cuando vuelva, con el mismo `p_token`, o quitar el cumpleaños y cobrar el total). Si igual llegara una a la base con el
  canje ya usado, se rechaza entera y la cola la muestra como rechazo (ADR-0036).
- **`resumen_clienta_caja`** suma `cumple_disponible boolean`, `cumple_pct numeric`, `cumple_canjeado_este_anio boolean` y
  (al conectar la web) `cumple_canjeado_el date`, el día de Lima del canje vivo: la caja dice «Cumpleaños canjeado el 12 sep»,
  como el spike. Cambia el tipo de retorno: `drop` y `create`, con la misma lectura y los mismos permisos.

**Web** (se sigue el spike aprobado, `docs/maquetas/club-clientas-spike-2026-09/` en el commit `94f2dece`: «hay que
guiarse con el spike visual», Felipe):
- En la caja de la clienta de Cobrar, la fila «Cumple este mes · 10 % disponible» con «Canjear 10 %» (y, con lo del club
  plegado, la misma acción como píldora): solo se puede tocar si `cumple_disponible` y hay conexión; sin conexión el botón
  dice «Sin conexión» y se apaga. Si ya lo usó, el candado «Cumpleaños canjeado el 12 sep · Una vez al año». El % sale de
  `cumple_pct`, nunca escrito a mano.
- **Al tocarlo, el 10 % es UNA línea en el pie del ticket** («Cumpleaños del club · 10 % de la compra −S/ x», punto 9 del
  README del spike) y el total, el cobro, el vuelto y los pagos usan el total nuevo. **Las prendas no muestran nada**: el
  reparto por línea (`descuento_club_unitario`) queda en la base y en el comprobante (el papel imprime el descuento total
  de cada prenda y una línea «Incluye 10 % de cumpleaños del club»). Esto corrige lo que decía este contrato antes de
  construir («cada prenda muestra su −10 %»).
- Quitar o cambiar a la clienta del ticket, perder la conexión o que su resumen deje de decir disponible lo apaga, y NO
  vuelve solo (spike: sin conexión se apaga y queda así; si volviera, el total cambiaría bajo las manos de quien cobra).
  Cuando se apaga solo, la caja lo avisa.
- Ante `cumple_ya_canjeado`, `cumple_fuera_de_mes`, `cumple_no_socia` o `cumple_descuento_distinto`, la caja apaga el
  canje, vuelve a leer el resumen y lo dice; los otros tres (`cumple_sin_clienta`, `cumple_sin_canje`, `cumple_sin_monto`)
  lo apagan sin releer. **La venta nunca se vuelve a mandar sola sin el descuento**: la clienta tiene que saber que paga
  más (`rechazoDelCanje`).
- Después de cobrar, «Venta registrada» dice «Cumpleaños canjeado (−S/ x). No puede usarlo otra vez hasta el año que
  viene; devolver la compra tampoco lo devuelve.»
- La regla pura vive en `lib/club-cumple-canje-reglas.ts`, con su prueba (el nombre `club-cumple-reglas.ts` ya lo usa la
  tanda 1b para ESCRIBIR el cumpleaños en la hoja): `descuentoClubLinea`, `descuentosParaRegistrar`, `ticketConCumple`,
  `cumpleEnCaja`, `pctDelCanje` y los textos.

## Actualización 2026-09-30 (d): tanda 1e (el comprobante con carné y pasaporte)

Migración `supabase/migrations/20260930250000_club_paso1e_comprobante_carne_pasaporte.sql` (una sola parte, sin
políticas ni `drop trigger`). Es la PARTE 4 de la tabla de arriba y la DECISIÓN 3, con el OK de Felipe del 2026-09-29.
Se probó en un Postgres desechable propio con todas las migraciones y el seed. Lo que se decidió al construirla:

- **La base.** El candado de tipos de `comprobantes` suma `carne_extranjeria` y `pasaporte`, y un candado nuevo
  (`comprobantes_carne_pasaporte_formato`) les exige número de 6 a 12 letras o dígitos en mayúsculas, la misma regla
  que la ficha. Una factura sigue exigiendo RUC (`comprobantes_factura_requiere_ruc`, sin tocar).
- **Una sola función cambia: `emitir_comprobante`.** Con un reemplazo anclado sobre su cuerpo vivo y candado de
  versión por md5 normalizado (antes `392971c9…`, después `a3f15c5b…`), limpia y valida el carné o el pasaporte con
  `fn_documento_clienta` (los mismos mensajes que la ficha, hint `documento_invalido`) antes de reservar el correlativo.
  - Por qué ahí: es el único lugar por donde nace un comprobante con documento. La llaman `registrar_venta`,
    `convertir_proforma_a_comprobante` y los apartados.
  - Se revisaron en su definición viva todas las que usan `cliente_tipo_doc`: `registrar_venta` y la conversión de
    proformas lo pasan tal cual; `emitir_nota` (notas de crédito y débito), `abonar_separacion` y `entregar_separacion`
    lo copian del comprobante anterior. Ninguna rechaza ni traduce estos tipos.
  - `fn_ligar_ventas_por_documento` (1a) no cambia: ya compara por tipo, así que un carné liga en cuanto el comprobante
    lo guarda.
- **Apartados, fuera.** `separar_prendas` arma `dni` o `sin_documento` desde su parámetro `p_clienta_dni` (solo dígitos),
  y `separaciones.clienta_dni` es solo de DNI. Llevar el carné a los apartados es otra tabla, dos firmas y el formulario
  de Apartar: queda en el backlog. Mientras tanto, ese apartado sale «sin documento» con su nombre, como hoy.
- **Una sola parte, con los `alter` al final.** La regla de partes (ADR-0195) es por las políticas, y aquí no hay. La
  transacción toma en exclusiva solo `comprobantes`, al final y con `lock_timeout` de 3 s: sin ciclo con una venta.
- **El orden de despliegue es al revés que en la 1a: primero la migración, después la web.** Con la web nueva y el
  candado viejo, la boleta a un carné se rechaza y con ella la venta ENTERA. Con la migración pegada y la web vieja no
  cambia nada.
- **La web.** Una sola tabla, `lib/documento-comprobante-reglas.ts`, con el catálogo 06 (1 DNI, 4 carné, 6 RUC,
  7 pasaporte) y cómo se lee (DNI, CE, RUC, Pasaporte).
  - La leen el envío a Lucode (`lib/lucode.ts`), el QR del papel (`recibo-reglas.ts`), la térmica, el A4, el modal de
    venta registrada, Cambios/Devoluciones (`ventas-v2.ts`) y el registro de ventas de Impuestos. Antes cada uno decía
    `ruc ? "6" : "1"` por su cuenta, y un carné habría salido como DNI en el envío y en el QR, y como «0» en el registro.
  - `documentoParaComprobante` deja pasar los tres tipos, con su tipo; una ficha vieja fuera de formato sale «sin
    documento» en vez de frenar la venta.
  - En Cobrar, el paso «Comprobante» de una boleta o nota de venta tiene el combo «Tipo de documento» (DNI por defecto,
    `CampoTipoDocumento`). Carné y pasaporte llevan el nombre a mano, porque no tienen padrón. Vive en
    `components/punto-de-venta/DocumentoDelComprobante.tsx`, para tocar `PuntoDeVenta*.tsx` lo mínimo.
  - Un carné o un pasaporte mal escrito no deja cobrar (`motivoBloqueoCobro`), con el mensaje de la ficha. Tampoco una
    factura con letras en el número: pasa si se cambia de boleta a factura con un carné ya escrito (visto en el navegador
    a 375 px), y saldría a SUNAT como un RUC que no existe.
- **Lucode, sin confirmar.** «4» y «7» son los códigos del catálogo 06 de SUNAT, el mismo del que ya salen «1» y «6».
  Pero ninguna boleta a un carné o a un pasaporte se transmitió todavía, ni al sandbox. Como decidió Felipe (punto 1
  de arriba), la tanda no se cierra hasta que una boleta de prueba REAL a un carné sea aceptada con tipo «4». Si SUNAT
  la rechazara, la boleta queda `rechazado` (la venta no se pierde), y se vuelve atrás en la web
  (`documentoParaComprobante` otra vez solo DNI); la migración puede quedar.

## Actualización 2026-09-30 (e): tanda 1d

Se construye sobre la D-6, CL-7 y CL-14. Va después de la 1c.

**Decisión de Felipe (2026-09-30): sin «es para regalo».**
- Felipe decidió el 2026-09-30 seguir el spike aprobado del club (`docs/maquetas/club-clientas-spike-2026-09/`, README,
  punto 8), que no lleva la marca «¿Es para regalo?» en la línea del ticket.
- **La D-7 y la D-101 quedan superadas en ese punto.** Un regalo cuenta para la talla deducida. Lo corrige la talla que ella
  dice en su ficha (preferencias, tanda 1f), que manda sobre la deducida.
- Esta tanda no toca `venta_items`, `fn_clienta_compras` ni `registrar_venta`. El «LÍMITE CONOCIDO (v1)» de
  `lib/clienta-actividad-reglas.ts` lo dice igual.
- Lo que se había construido para la marca se sacó entero antes de pegarlo en ningún lado:
  - las partes 3 y 4 de la migración;
  - la lectura en la ficha;
  - el salto en `deducirTallas`.

**Migración en dos partes** (cada una se pega sola, en orden; sin políticas ni `drop trigger`):

| Parte | Archivo | Qué |
|---|---|---|
| 1 | `20260930240000_club_paso1d_parte1_pedidos.sql` | `alter` de `pedidos_no_atendidos`: `motivo` y `razon`, con sus candados |
| 2 | `20260930240100_club_paso1d_parte2_se_probo.sql` | `registrar_pedido_no_atendido` con `p_motivo` y `p_razon`; la cabecera completa |

- **Por qué partes:** el `alter` va solo, como en la 1c, para que la transacción tenga una sola tabla en uso y no pueda
  trabarse en cruz con nadie (40P01). La función va después de sus columnas. La parte 2 aborta si falta la 1.
- **Parte 1:** `motivo text not null default 'no_habia_talla'`, así que todo lo anotado antes queda «buscó y no había».
  - `razon` solo existe con `se_probo_no_llevo`, y es una de `no_le_quedo`, `precio`, `color` o `lo_piensa`.
  - Candados: `pedidos_no_atendidos_motivo_valido` y `pedidos_no_atendidos_razon_solo_si_se_probo`.
- **Parte 2:** `p_motivo` (default `no_habia_talla`) y `p_razon` van **al final**, así que la llamada vieja de 5 parámetros
  sigue funcionando.
  - Cambia la firma: se hace `drop` de la vieja y `create` de la nueva sobre su definición viva.
  - Sigue firmando con `fn_actor_persona_id(true)`, sin exigir módulo (basta poder operar la sede), y con los mismos
    permisos.
  - Rechazos nuevos (P0001 con hint): `pedido_motivo_invalido`, `pedido_razon_sin_se_probo` y `pedido_razon_invalida`.

**md5 normalizados, antes → después** (el «antes» coincide con lo medido en producción el 2026-09-30):

| Función | antes | después |
|---|---|---|
| `registrar_pedido_no_atendido(uuid,uuid,text,text,uuid)` | `750b65e98c09826228ba5f72b7800391` | deja de existir |
| `registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text)` | no existía | `b48f006fb8336ea27fb9e2929343d10d` |

**Cobrar: «¿Se la probó y no la llevó?»**, como en el spike (`quitadaHTML` y el `quitar` de su motor):
- **Cuándo:** al quitar una prenda del ticket aparece, justo bajo la clienta, la pregunta: «¿Se la probó y no la llevó?
  Quitaste «Blusa Carlita» (M). Anótalo para Compras: es opcional.» Sale también si el ticket quedó vacío.
- **Botones:** «No le quedó», «Precio», «Color» y «Lo piensa», y «No anotar».
  - Las razones se apagan sin responsable, y el combo sale ahí mismo, como en «Anotar que no había».
  - Tocar una anota `se_probo_no_llevo` con su razón, con o sin clienta, firmada por el responsable, y la pregunta se va.
- **Aviso:** «Anotado: se la probó y no la llevó · Blusa Carlita · talla M». El spike decía que se ve en «Clientas ▸
  Resumen», una pantalla que no existe; el aviso dice «Pedidos no atendidos».
- **Se va sin anotar:** con «No anotar», al pasar a cobrar, al dejar el ticket en espera o al retomar otro. Quitar otra
  prenda la reemplaza.
- **Dónde está el código:**
  - la pregunta vive en `components/punto-de-venta/SeProboNoLlevo.tsx`;
  - `PuntoDeVenta.tsx` solo guarda la prenda quitada y la pone en el `arriba` del ticket;
  - la lógica es pura, en `lib/se-probo-reglas.ts` (`prendaQuitadaDeLinea`, `textoPrendaQuitada`, `datosSeProbo`,
    `avisoAnotado`), con su prueba.
- **Qué se guarda:** la prenda se anota como «nombre · color», con su talla. Una «Prenda sin registrar» va con su
  descripción, sin talla.

**Lo que se decidió al construir**
- **«Llegó tu talla» (paso 3) avisa SOLO por `motivo = 'no_habia_talla'`.** Queda escrito en la cabecera de la parte 2 y
  en el comentario de la columna.
  - Por la misma razón, Inicio y Análisis siguen contando solo «buscó y no había» (`esPedidoDeTalla`).
  - La lista de Pedidos no atendidos muestra el motivo y la razón de cada fila.

**Pruebas:**
- `pnpm pruebas:club-se-probo`, en el CI: comprueba también que la 1d no toca la venta ni la ficha.
- La lógica de la pregunta, en `lib/se-probo-reglas.test.ts`.

## Actualización 2026-09-30 (f): tanda 1f, la lista y la ficha de /clientas como el spike

**El encargo.** Que Clientas ▸ Fichas y la ficha queden como el spike del club (rama `claude/spyke-club-clientas-visual-631f7a`,
`docs/maquetas/club-clientas-spike-2026-09/fuente/src/50-clientas.js`), sin lo de los pasos 3 a 5 (pestañas Avisos, Resumen y
Beneficios; la escalera del aniversario). Antes, la lista eran las últimas 50 fichas y sus filtros contaban solo esas 50, y ni
la lista ni la ficha sabían «su sede» (CL-6), la última compra ni cuántas son frecuentes con compra neta (CL-25).

**Migración `20260930210000_club_paso1f_lista_y_ficha.sql`** (una sola parte, sin políticas ni `drop trigger`, `lock_timeout
3s`, idempotente, candado de versión por md5 de lo que crea; va DESPUÉS de la 1b y no depende de la 1c, la 1d ni la 1e):
- **Una regla, un lugar.** `fn_venta_devuelta_entera` (cada prenda volvió entera, sumando sus devoluciones aprobadas; un
  cambio no cuenta) → `fn_club_compras_netas` (completadas, sin las de prueba ni las devueltas enteras) →
  `fn_club_resumen_compras` (su sede, compras en 12 y 6 meses, frecuente con 3 o más en 6 meses, última compra). Internas: sin
  EXECUTE para la API. El umbral es el de `lib/clienta-actividad-reglas.ts`, y `lib/clientas-lista-reglas.test.ts` lee la
  migración y falla si se separan.
- **Su sede (CL-6):** la de más compras netas en 12 meses; **si empatan, la de su compra más reciente** (y el nombre, para que
  el empate total sea estable). Sin compras en 12 meses, no tiene sede («—»).
- **Lecturas** (prefijo `fn_`, no abren el loader; todas exigen el módulo «Clientas»): `fn_clientas_lista(p_termino, p_filtro,
  p_limite, p_desde)` (8 filtros: todas, socias, frecuentes, con y sin publicidad, sin celular, cumplen este mes y archivadas;
  el término busca como `buscar_clienta`; 50 por página; `total` y `baja_en`), `fn_cifras_clientas()` (las cifras y la cuenta
  de cada píldora, sobre toda la base), `fn_clienta_su_sede(p_clienta_id)`, `fn_clienta_permisos(p_clienta_id)` y
  `fn_club_etiquetas()`.
- **Preferencias (CL-5):** `retail.club_etiquetas (grupo, valor, orden, activa)`, sembrada con los valores **de trabajo** del
  spike (`20-datos.js`, `ETQ`: Trabajo, Evento, Día a día · Clásico, Tendencia, Relajado · Fucsia, Amarillo, Negro, Lana,
  Poliéster). **Felipe los puede cambiar** (pendiente 2 de la sección G del acta): un valor no se renombra ni se borra (el
  disparador `club_etiquetas_fijas` lo impide, porque hay fichas que lo citan): se apaga (`activa = false`) y se agrega otro;
  quien ya lo tenía lo conserva. `clientas.preferencias jsonb` (`{}` por defecto) y `guardar_preferencias_clienta(p_id,
  p_preferencias, p_version_esperada)`: módulo, responsable del combo, candado optimista, solo valores del catálogo activo
  (`preferencia_invalida`).

**DECIDÍ (el arquitecto; Felipe puede revertir cualquiera):**
- **Preferencias solo de una socia**, como el spike (lo muestra solo a ella), con un candado en el esquema
  (`clientas_preferencias_solo_socia`). Sirven a los avisos del club; a una clienta que solo se identificó no se le pidió más
  que ligar sus compras (Ley 29733, finalidad).
- **Anonimizar y unir las vacían con un disparador** (`clientas_preferencias_sin_club`: la ficha deja de ser socia → sin
  preferencias), no reescribiendo `archivar_clienta` ni `unir_clientas`: la 1b todavía las cambia (su md5 «después» se movió
  dos veces el 2026-09-30) y un reemplazo anclado habría atado esta tanda a un md5 que se mueve. Vale para cualquier camino
  futuro que quite el club. Límite: al unir, las preferencias de la ficha que se va no pasan a la que queda (se vuelven a
  marcar).
- **«Frecuente» con compra neta en la lista y en la ficha.** La ficha toma «Frecuente» de `fn_clienta_su_sede` (la misma regla
  que la lista); si esa lectura falla, vuelve a `estadoFrecuente` sobre sus compras (principio 9). La caja sigue con
  `estadoFrecuente` sobre `fn_clienta_compras`, que todavía cuenta las devueltas enteras (ver pendiente).
- **«Frecuentes» no exige ser socia** (el spike sí: `esFrecuente = esSocia && …`): es un hecho de sus compras (D-103). La
  insignia «Socia frecuente» sí es solo de socias; el filtro encuentra también a la identificada que compra seguido, que es a
  quien conviene invitar.
- **«Archivadas» es una píldora más, al final**, en vez del interruptor «Incluir archivadas» o un lugar en el menú «Más»: es una
  vista (qué se mira), no una acción; vive en la URL como los demás filtros, lleva su cuenta y no mezcla archivadas con activas
  en las otras cuentas. El menú es para acciones.
- **«Pidió BAJA»** (`baja_en`): la socia cuyo último paso de la publicidad fue su BAJA se pinta así (apagada), como el spike, y
  no como «Sin publicidad». Un cambio de celular que le quitó la publicidad no cuenta como BAJA.
- **Buscador, filtro y página en la URL** (`?q=&filtro=&pagina=`): lo tipeado va por `useBusquedaEnUrl` (sin loader); un filtro
  o una página por clic, con el loader.
- **La tabla decide su forma por el ancho de la tarjeta (`@container`)**: 6 columnas desde 800 px de tarjeta, 4 de 560 a 800 y
  apilada por debajo. Con el lateral abierto, una ventana de 800 px deja ~450 px a la tabla: ahí cortaba el chip y el celular.
- **Cabecera en una fila también a 375 px**: Exportar, «Más» (con «Llegó un mensaje de WhatsApp» e «Imprimir el cartel del
  club») y «+ Nueva clienta». «Más» es `MenuAcciones` con la opción nueva `texto` (botón secundario con palabra, no «⋯»).

**Del spike se tomó** (`50-clientas.js` salvo que diga otro archivo): las dos acciones de la cabecera (l. 78), las cuatro
cifras con sus detalles (l. 104), las píldoras con su cuenta (l. 105), las seis columnas y sus contenidos (l. 101 y 108-114), el
pie «N de N clientas · todas las cuentas con el módulo ven a todas» (l. 114), la nota de su sede (l. 115), las insignias de estado
y publicidad (`45-club-caja.js` l. 7-10), el dato «Su sede · N de M» de la ficha (l. 134), las preferencias con sus tres listas
y su nota (l. 129 y 137; valores de `20-datos.js` l. 128-129) y la historia de los permisos con sus medios en palabras (l. 121,
125-127 y 143).

**No se tomó, a propósito:** las pestañas y todo lo de los pasos 3 a 5 (l. 81, 144); la tarjeta de filtros separada de la tabla
(l. 113: CLAUDE.md pide filtros y tabla en UNA tarjeta); los códigos de sede TRU/AQP/LIM (V2 no los tiene: «Trujillo»,
`nombreCortoSede`); el `esSocia` dentro de `esFrecuente` (`20-datos.js` l. 137, ver arriba); las celdas apiladas una por línea
del spike en celular (aquí, nombre e insignias arriba y una línea con celular, sede y última compra); el corte con «…» de la
última compra (aquí se parte en dos líneas) y los chips montados del spike en anchos medianos. El buscador ocupa todo el ancho
de la tarjeta (el del spike tiene `max-w-sm`), como pidió el encargo.

**La ficha se tocó lo mínimo** (`ClientaFichaModal.tsx`): tres imports; «Frecuente» con compra neta; «Registrada» pasa a «Su
sede» (`Dato` suma un `detalle`); y las piezas aparte `PreferenciasClienta` y `HistoriaPermisos`. Ya junta con la 1b final (el
camino B), queda en el orden del spike (`modalFicha`, l. 133-146): datos → insignias → talla → preferencias → permisos (de la
1b) → historia → compras.

**Pendiente (fuera de esta tanda):**
- `fn_clienta_compras` todavía cuenta las ventas devueltas enteras (D-8, CL-25). Quien la reescriba (la 1d le suma
  `es_regalo`) filtra con `retail.fn_venta_devuelta_entera(v.id)` y la caja deja de diferir de la ficha.
- El texto `club` v2 que se le lee no nombra las preferencias. Si Felipe quiere que su «sí» las cubra, es una versión 3 del texto.
- (Resuelto al juntarla con la 1b final.) «Ella misma» en la historia es el `qr_web` del camino B: la prueba de la base confirma
  una invitación como `anon` y la historia dice «Pidió la publicidad por WhatsApp · desde la página de su QR · ella misma · texto
  v1», con la tienda de la invitación.

**Cómo se pega:** después de la 1b, `20260930210000_club_paso1f_lista_y_ficha.sql` solo en el SQL Editor (una parte). Fusionar
la web después. **Cómo lo verifica Felipe:** abre Clientas: cuatro cifras con Frecuentes, el buscador que busca al escribir, las
píldoras con Archivadas y la tabla con Su sede y Última compra; a 800 px con el lateral abierto nada se corta; abre una socia:
«Su sede · N de M», marca Evento y Lana, «Guardar preferencias», y su historia del permiso en orden. Capturas lado a lado con el
spike en `docs/capturas/2026-09-30-club-paso1f/`.

## Actualización 2026-10-01 (g): ella se une sola desde el cartel, y el club es solo WhatsApp de promociones

**Qué cambió y por qué.** Felipe, con el paso 1 ya en producción (0 socias todavía), decidió que la asesora no registre el
club en caja: ella escanea el QR del cartel y se registra sola en una página de CAYLA. El club deja de servir para avisos
personales y queda como lo que vende: estar al día con lo que tiene CAYLA, sus promociones y los cupones de cumpleaños y de
aniversario. Supera, en lo que contradicen, a la D-4 (dos permisos), la D-9 (el registro del club en caja), la actualización
(c) (QR personal y casilla de publicidad) y al texto `club` v2.

**Decisiones de Felipe (2026-10-01):**
- **G-1 · Un solo QR, el del cartel, general por tienda.** Abre la página de registro de esa tienda. El ticket impreso lleva el
  mismo QR. Se retiran el QR personal de la caja (camino B, `/club/[token]`) y el QR de WhatsApp del ticket (camino A).
- **G-2 · En caja, solo el DNI.** «Registrar clienta» pide el documento; con DNI el nombre sale del padrón. La asesora no
  escribe celular ni cumpleaños. Si no es socia, la tarjeta dice «Pídele que escanee el cartel» y se actualiza sola cuando
  ella se une con ese documento. El canje del cumpleaños y «¿Se la probó?» no cambian.
- **G-3 · La página.** Documento (DNI por defecto; carné o pasaporte con el nombre escrito por ella). Con DNI muestra el
  nombre a medias («¿Eres Lucía P. S.?») para que confirme que tipeó bien, sin revelar el nombre completo de nadie. Celular y
  fecha de nacimiento completa (con año) son obligatorios; el correo es opcional y solo un dato de contacto. Casilla
  «Confirmo ser mayor de 18 años», que la base además comprueba con la fecha.
- **G-4 · DNI que ya existe: se reemplazan sus datos**, y es socia desde la primera vez que se inscribió (`club_desde` no
  se mueve). Si no existe, se crea la ficha completa.
- **G-5 · Al unirse, recibe WhatsApp de promociones** (novedades, rebajas, avisos de sus cupones). Nada personal por WhatsApp:
  ni «tu apartado está listo» ni «llegó tu talla».
- **G-6 · Saludo obligatorio.** Después de «Unirme», el único paso que queda es «Saludar a CAYLA por WhatsApp» (al número de
  la tienda del cartel, con su código). Así guarda el número oficial y la conversación la empieza ella. La página no puede
  saber si lo envió: lo deja como el único camino para terminar.
- **G-7 · Sin «Llegó un mensaje de WhatsApp».** Se retira de Clientas ▸ Más. La BAJA se registra en su ficha y en Avisos.
- **G-8 · Clientas ▸ Avisos.** La lista de mensajes por mandar a cada socia. «Enviar» abre WhatsApp Web con el número y el
  texto listos; la encargada solo presiona Enter. Queda anotado como enviado.
- **G-9 · Aniversario:** no basta cumplir el año como socia; en ese año tiene que haber comprado.
- **G-10 · Contra el abuso del cartel:** el DNI tiene que existir en el padrón; pocos registros por celular y por hora; la
  ficha dice «se registró ella desde el cartel».
- **G-11 · El texto de la página** tiene que ser profesional y sin huecos legales (borrador en
  `docs/club/texto-legal-registro-v1.md`, para aprobar antes de publicar).

**Lo que la ley exige y cómo lo cubre (resumen; detalle en el borrador del texto):**
- Ley 32323 (art. 58.1.e del Código del Consumidor): publicidad solo a quien, por iniciativa propia, contacta a la empresa y
  da un consentimiento libre, previo, informado, expreso e inequívoco. La cubren el cartel (ella decide escanear), la casilla
  expresa sin marcar y su saludo desde su número.
- Ley 29733 y su reglamento (DS 016-2024-JUS): deber de información (responsable, finalidades, destinatarios, transferencia al
  extranjero, plazo, derechos ARCO), prueba del consentimiento a cargo de CAYLA (se guarda el texto exacto, su versión y la
  hora), finalidades separadas, baja sencilla y gratuita, y el banco de datos inscrito ante la Autoridad Nacional.
- Los datos viven en São Paulo, Brasil (Supabase `sa-east-1`, Vercel `gru1`): es un flujo transfronterizo y se informa.

**Riesgo legal que el texto no cierra (para que Felipe decida):** el reglamento de la Ley 29733 (art. 3.2) no deja condicionar
un beneficio a aceptar un tratamiento que no es indispensable. Si la casilla de WhatsApp es obligatoria para ser socia, el
cupón de cumpleaños queda atado a aceptar publicidad. La ruta sólida es la casilla de WhatsApp opcional: sin ella es socia con
sus cupones en tienda, sin mensajes.

**Decisiones de Felipe (2026-10-01, segunda ronda), que cierran el riesgo y el texto:**
- **G-12 · La casilla de WhatsApp es opcional.** Sin ella es socia con sus beneficios en tienda y sin mensajes. Cierra el
  riesgo del art. 3.2.
- **G-13 · Aniversario = un vale en soles para comprar en toda la tienda, que crece cada año** (supera la escalera de regalos
  del CL-17). Un año de club cuenta con **6 compras o S/ 600 en compras netas**; si no cuenta, **se pausa** (no se pierde lo
  acumulado); el vale se usa **dentro de 60 días**. Montos propuestos y editables sin deploy: S/ 20 · 30 · 40 · 50 · 60 (el del
  quinto año se repite). Uno solo de los dos beneficios del club por compra.
- **G-14 · Banco de datos inscrito:** código PJ-2026-4550 (constancia INS-2026-5132, 08/09/2026).
- **G-15 · Conservación: 3 años desde la última compra** (sin compras: desde que se registró); luego la ficha se anonimiza sola.
  Está en la política y en los términos.
- **G-16 · Aviso de 15 días** antes de cambiar o terminar el programa (propuesto).

## Contrato de la tanda 1g (2026-10-01)

Cuatro agentes trabajan en paralelo sobre este contrato. El de base es el único que escribe migraciones y
`packages/database/src/types.ts`; los demás programan contra estas firmas.

### Base (migraciones `20261001210xxx_club_paso1g_*`, en partes: cada `alter` de una tabla en uso va solo)

Esquema:
- `clientas`: `correo text` (opcional, formato básico), `registro_origen text` (`caja` | `cartel`), `club_ubicacion_id uuid`
  (la tienda del cartel donde se unió por última vez: es el WhatsApp que saludó y el que le escribe).
- `club_textos.tipo` suma `terminos`, `privacidad`, `casilla_publicidad`, `saludo`, `aviso_cumpleanos`, `aviso_aniversario`,
  `aviso_novedades`, `aviso_rebaja`, cada uno en v1 con el texto aprobado en `docs/club/texto-legal-registro-v1.md`. Los
  marcadores (`{pct}`, `{escala}`, `{nombre}`, `{codigo}`, `{tienda}`) los completa quien muestra el texto.
- `club_permisos.medio` suma `pagina_cartel` (otorga club y publicidad; sin `registrado_por`; con la versión del texto).
- `configuracion_empresa`: `club_aniversario_compras int default 6`, `club_aniversario_monto numeric(10,2) default 600`,
  `club_aniversario_dias int default 60`.
- `club_aniversario_escala (anio smallint primary key, 1..5; monto numeric(10,2) > 0)` = 20, 30, 40, 50, 60.
- `club_canjes.tipo` suma `aniversario`, con `anio_club smallint`: un canje vivo por clienta y año de club; anular lo libera.
- `club_intentos_registro (id, creado_en, tipo 'consulta'|'registro', ip_hash, documento_hash, celular)`: RLS sin políticas.
- `club_avisos_enviados (id, clienta_id, tipo 'cumpleanos'|'aniversario'|'novedades'|'rebaja', referencia, telefono, texto,
  ubicacion_id, enviado_por, creado_en, deshecho_en)`: solo agrega.
- Módulo nuevo `avisos_club` (grupo de Clientas), nace solo para el líder, `delegable = true`.

Funciones («servidor» = solo la llama el servidor de la web con la llave de servicio, nunca `anon` ni `authenticated`):
1. `fn_club_pagina(p_ubicacion_id uuid) returns jsonb` · `anon`. `{tienda, whatsapp, pct, escala:[{anio, monto}], compras,
   monto_minimo, dias, textos:{terminos, privacidad, casilla_publicidad, saludo: {version, texto}}}`; `null` si no es una tienda.
2. `club_intento(p_tipo text, p_ip_hash text, p_documento_hash text, p_celular text) returns boolean` · servidor. Anota y dice
   si está dentro del límite: consultas ≤ 20 por ip y hora; registros ≤ 5 por ip, ≤ 3 por celular y ≤ 3 por documento, por hora.
3. `registrarse_en_el_club(p_ubicacion_id uuid, p_documento_tipo text, p_documento_numero text, p_nombre text, p_telefono text,
   p_nacimiento date, p_correo text, p_mayor_de_edad boolean, p_acepta_terminos boolean, p_acepta_publicidad boolean,
   p_versiones jsonb, p_nombre_del_padron boolean) returns table (clienta_id uuid, codigo_club text, club_desde timestamptz,
   era_socia boolean, nombre_corto text)` · servidor. G-3, G-4, G-5, G-10, G-12: 18 años cumplidos a la fecha de Lima;
   `p_versiones` deben ser las vigentes (`club_texto_cambio`); documento que existe → reemplaza nombre (si viene del padrón),
   celular, nacimiento y correo (un correo vacío no borra); conserva `club_desde` y `codigo_club`; una ficha anonimizada no se
   reusa; casilla de publicidad marcada → otorga (después de cambiar el celular, que revoca la anterior por el disparador);
   sin marcar → no toca un permiso anterior. Hints: `club_menor`, `club_datos_invalidos`, `club_texto_cambio`,
   `club_documento_archivado`.
4. `fn_club_aniversario(p_clienta_id uuid) returns table (anios_que_cuentan int, anio_en_curso_cuenta boolean, compras_anio int,
   monto_anio numeric, proximo_aniversario date, vale_disponible boolean, vale_monto numeric, vale_vence date,
   vale_canjeado_el date)` · módulo `clientas`. Año de club = [`club_desde` + n años, + n+1); cuenta con el umbral en compras
   netas (la regla de la 1f); se pausa.
5. `resumen_clienta_caja` suma `aniversario_disponible boolean, aniversario_monto numeric, aniversario_vence date` (reescrita
   sobre `fa690d7f…`).
6. `registrar_venta` suma `p_canjear_aniversario boolean default false` (18 parámetros; `drop` + `create` sobre `2b55a94a…`):
   reparte el vale en `descuento_club_unitario` proporcional al neto de cada línea, sin pasar el total; una sola ventaja del
   club por venta. Hints: `club_un_cupon_por_compra`, `aniversario_no_disponible`, `aniversario_ya_canjeado`,
   `aniversario_sin_monto`.
7. `fn_club_avisos_pendientes(p_ubicacion_id uuid) returns table (clienta_id uuid, nombre text, telefono text, tipo text,
   referencia text, texto text, detalle text)` · módulo `avisos_club`. Solo socias con publicidad vigente de esa tienda
   (`club_ubicacion_id`; sin él, su sede). Cumpleaños: desde el día 1 de su mes, cupón sin canjear, un aviso por año.
   Aniversario: vale disponible, un aviso por vale. Novedades: productos que llegaron a esa tienda en los últimos 14 días, a lo
   más uno por semana. Rebaja: prenda en promoción vigente con stock en esa tienda en su talla deducida. Tope CL-21 (2
   promocionales al mes; cumpleaños y aniversario no cuentan) y grupo testigo CL-20 (1 de cada 5, fijo por clienta, fuera de
   novedades y rebajas). El texto sale de las plantillas `aviso_*`.
8. `registrar_aviso_enviado(p_clienta_id uuid, p_tipo text, p_referencia text, p_texto text, p_ubicacion_id uuid) returns uuid` y
   `deshacer_aviso_enviado(p_id uuid) returns void` (dentro de 10 minutos) · módulo `avisos_club`, firman con el responsable.
9. `guardar_beneficios_club(p_pct numeric, p_compras int, p_monto numeric, p_dias int, p_escala jsonb) returns void` · solo el
   líder. Si cambia algo que los términos nombran, publica una versión nueva de `terminos`.
10. `fn_club_anonimizar_inactivas() returns int` · servidor. Anonimiza con la rutina de `archivar_clienta` las fichas sin compra
    en 3 años (sin compras: 3 años desde que se registró) y deja el permiso `anonimizar` en su historia.
11. Retiro, sin borrar funciones: se revoca `execute` de `unirse_al_club`, `crear_invitacion_club`,
    `registrar_mensaje_publicidad` y `registrar_desde_whatsapp` a `authenticated`, y de `fn_invitacion_club` y
    `confirmar_invitacion_club` a `anon`. `registrar_baja_whatsapp` sigue.

### Web
- **Pública:** `app/club/[tienda]/page.tsx` (reemplaza `/club/[token]`), `app/club/privacidad/page.tsx`,
  `app/club/terminos/page.tsx`, y las acciones de servidor `consultarNombre` y `registrarme` (llave de servicio por
  `lib/supabase-admin.ts`, padrón por `consultarPadron`, la ip con una sal del servidor). Con guía de foco, probada a 375 px y sin
  datos de nadie en los errores. El QR del cartel y el del ticket abren `${origen}/club/${ubicacion_id}`.
- **Caja y ficha:** registrar solo con el documento (Cobrar y Nueva clienta); la tarjeta «Pídele que escanee el cartel» que se
  actualiza sola; el vale de aniversario en la tarjeta y en el pie (como el cumpleaños; uno por compra); BAJA en la ficha; retiro
  de invitar, del QR personal y de «Llegó un mensaje de WhatsApp».
- **Avisos y configuración:** Clientas ▸ Avisos (módulo `avisos_club`): la lista por tipo; «Enviar» abre
  `https://web.whatsapp.com/send?phone=51…&text=…` y anota el envío, con «Deshacer»; BAJA. «Beneficios del club» (líder): %,
  umbral, días y escala. Cron diario `/api/club/conservacion` (con `CRON_SECRET`) que llama `fn_club_anonimizar_inactivas`.

## Actualización 2026-10-01 (h): tanda 1g construida

Construida sobre el contrato, con estas decisiones donde el contrato no alcanzaba (detalle en las cabeceras de
`20261001210000`–`210700`):
- El vale de aniversario se reparte por prenda con la misma regla que `repartirVale` de la web, al céntimo; si no coincide,
  `aniversario_descuento_distinto`. `club_canjes.monto` guarda lo aplicado. **Un vale que cubre toda la compra se rechaza**
  (`aniversario_cubre_todo`): pendiente de Felipe.
- Con DNI, la página exige el nombre del padrón (G-10); con carné o pasaporte no pisa un nombre que ya existía. Un documento
  archivado sin anonimizar no se reactiva desde la página (`club_documento_archivado`); uno anonimizado crea ficha nueva.
- Cambiar el celular desde la página revoca la publicidad del número anterior y, si marcó la casilla, la otorga al nuevo.
- `guardar_beneficios_club` publica una versión nueva de `terminos` cada vez que cambia algo (el % y la escala son parte de
  lo que ella acepta) y no deja bajar la escala.
- Avisos: grupo testigo fijo por clienta (1 de 5), tope del mes calendario de Lima, novedades con `fn_es_llegada` (sin la
  carga inicial) a lo más cada 7 días, rebaja por `campanas_vigentes()` en la talla de su última compra de esa categoría.
- Conservación: `fn_clienta_anonimizar` (la misma rutina que `archivar_clienta`); no anonimiza una ficha con apartado abierto.
- La consulta del «¿Eres …?» va por `POST /api/club/nombre` con `x-espera: no` (una acción de servidor siempre abre el
  loader, ADR-0149); el DNI viaja en el cuerpo.

## Actualización 2026-10-01 (i): el cartel «Invitación» y la página de la clienta, rediseñados

Felipe pidió un cartel más llamativo y una página mejor, con animaciones, y eligió entre propuestas de un lienzo de diseño
(`https://claude.ai/artifact/MKC9Z7w3pAQBnWYojUBKXM`, privado de Felipe):
- **Cartel C «Invitación»** (de tres: Tinta, «El 10 % manda» e Invitación): A4 a sangre en rojo profundo, marco doble crema,
  «*Estás invitada*», los tres beneficios con puntos guía y el QR real de cada tienda. El %, la escala de vales y el umbral
  salen de la base, nunca escritos a mano.
- **La página `/club/<tienda>` en tres pasos** (al escanear → sus datos → ya es socia), aprobada tal cual: el inicio vende los
  beneficios; los datos conservan toda la lógica de la 1g (padrón, guía de foco, textos legales versionados, WhatsApp
  opcional) con una barra de avance; el final entrega una **tarjeta de socia digital** (nombre, código, desde cuándo) y, si es
  su mes, el aviso del cupón de cumpleaños.
- **Movimiento:** propio de esta página, documentado en ADR-0136 act. (f).

## Actualización 2026-10-01 (j): el saludo sin la frase de la BAJA, y el ticket sin QR del club

Felipe, 2026-10-01, después de ver la página publicada:
- **El saludo, versión 2** (`20261001223000_club_saludo_v2_sin_baja.sql`). El mensaje que ella envía a la tienda al unirse ya
  no termina con «Sé que me doy de baja escribiendo BAJA.». Como `club_textos` no se edita, es una versión nueva. Cómo darse
  de baja lo siguen diciendo la casilla de WhatsApp y la Política de privacidad (2.8), que es lo que ella acepta. Los
  **avisos** de la tienda siguen cerrando con «responde BAJA»: el candado `club_textos_aviso_con_baja` sigue igual, porque
  cada mensaje promocional tiene que decir cómo dejar de recibirlos.
- **El ticket impreso ya no lleva QR del club.** Se fueron `clubEnElTicket`, el campo `club` del recibo y el bloque del QR en
  `ReciboTermico`. El papel lleva solo el QR de SUNAT. La clienta se une con el QR del cartel del mostrador (G-1), que sigue
  igual.

## Actualización 2026-10-02 (k): clientes y miembros, sin género, y casillas breves

Felipe, 2026-10-02, mirando la página publicada: el club le tiene que hablar igual a un hombre que a una mujer, y el ERP tiene
que decir «clientes», no «clientas». Lo decidido con él:
- **«clientas» → «clientes» en todo el ERP**, en lo que se ve: menú, pantallas, avisos y textos. Las tablas, columnas, rutas y
  claves no cambian (`retail.clientas`, `clienta_id`, `/clientas`, módulo `clientas`): no se ven, y renombrarlas arriesga datos.
  La regla de vocabulario de CLAUDE.md pasa a decir «cliente».
- **«socia» → «miembro»**: «Ya eres miembro», «Código de miembro», el sello «MIEMBRO» de la tarjeta, «Miembro desde…».
  «¡Bienvenida, Rosa!» pasa a «¡Te damos la bienvenida, Rosa!», y «Casi lista» a «Ya casi».
- **Cartel «Te invitamos»** (antes «Estás invitada»), con la bajada «a ser parte del club. Es gratis.».
- **Casillas breves:** «Acepto la Política de privacidad y los Términos del Club CAYLA.» y «Quiero recibir por WhatsApp
  novedades y promociones de CAYLA.», con «Opcional.» como única nota. Lo demás (finalidades, envío según compras y talla, la
  BAJA) lo dice la Política que enlaza la casilla. Se suelta el candado `club_textos_casilla_con_baja`. Los avisos siguen
  cerrando con «responde BAJA».
- **La letra chica bajo el botón ya no dice «Brasil».** La Política (2.5) sí lo sigue diciendo, porque la Ley 29733 pide
  informar el flujo transfronterizo.
- **En la base**, la migración `20261002160000_club_textos_v2_sin_genero.sql` publica la v2 de `terminos`, `privacidad`,
  `casilla_publicidad`, `aviso_cumpleanos` y `aviso_novedades`, con un candado que exige que la v1 sea la del 2026-10-01. Además
  renombra el módulo a «Clientes». Los textos v2 están en `docs/club/texto-legal-registro-v2.md`; el v1 queda como historia.
- **Queda para un segundo paso:** unas 25 funciones de la base cuyos mensajes de error dicen «clienta» o «socia», entre ellas
  `registrar_venta`. Cambiarlas exige reescribir cada función viva con su candado de versión, y se hace aparte.
