# BITÁCORA — CAYLA Retail

> 3 líneas por cierre de sesión/paso: fecha, qué se cerró, qué aprendió Felipe.
> Se acumula, no se reescribe — es historia, no un resumen que se actualiza.

## 2026-09-08 (el deploy no es el sistema: producción estaba a medio configurar)
Felipe reportó que la consulta de DNI/RUC "antes funcionaba y ya no". El código
estaba bien: el token `sk_` responde 200 contra apis.net.pe y `lib/padron.ts`
maneja la v1 desde `6dca050`. Lo que faltaba era la mitad de la configuración —
producción tenía `PADRON_PROVEEDOR` pero no `PADRON_TOKEN`, y `sin_proveedor`
se dispara igual con que falte una sola de las dos, mostrando el mismo texto
que si no hubiera nada configurado. `.env.local` nunca se despliega; Vercel
necesita sus propias variables y nadie las había puesto. `.env.example`
además seguía listando solo `decolecta/apisnetpe/factiliza`, así que la doc
empujaba a configurar `apisnetpe` (v2) con un token `sk_`, que responde 401.

**El hallazgo que vale más que el arreglo:** buscando eso se vio que producción
tampoco tiene `LUCODE_TOKEN` ni `LUCODE_ENTORNO`, y que `retail.comprobantes`
está vacía. O sea, la boleta B004-000001 del 5-sep no salió del deploy: salió
de `npm run dev` en la computadora de Felipe, apuntando a la base de producción
y al SUNAT de producción. **Hoy el sistema que opera de verdad es el local de
Felipe, no lo que está desplegado** — algo que nadie había escrito y que cambia
cómo se lee todo el estado del proyecto.

Y una tercera capa: producción estaba tres migraciones atrás en facturación
(`unificacion/20`, `21` y `22` nunca se pegaron en el SQL Editor). Por eso
registrar una serie fallaba con "Could not find the function ... in the schema
cache": PostgREST resuelve por firma exacta y ahí vivía la de 3 parámetros. Se
aplicaron las tres y se verificó que no quedaran sobrecargas duplicadas, el
riesgo que el propio archivo advierte. Se aprovechó que `comprobantes` y
`series_comprobantes` estaban en cero: no hubo datos que migrar.

Lo que queda abierto y va al backlog: no existe forma de saber qué archivos de
`supabase/unificacion/` están aplicados en producción. Se descubrió por una
pantalla rota, no por una alerta — y esta vez salió barato solo porque no había
datos.

## 2026-09-05 (PRIMERA TRANSMISIÓN REAL A SUNAT + choque de sesiones paralelas)
Sesión en paralelo que terminó enseñando más por el error que por el código.
**Lo que sirve y queda:** se transmitió a SUNAT, en producción, la boleta
**B004-000001 (Trujillo, S/1.00, "Cliente varios")** — SUNAT la aceptó en cola
(estado PENDIENTE, firmada) y devolvió su PDF. Antes se había probado el
circuito completo en sandbox con **B005-000001 (S/189.90)**, ACEPTADA con CDR,
cliente identificado por DNI verificado contra RENIEC. O sea: **transmitir a
producción funciona hoy**, con el token de Lucode que Felipe ya tiene. Dos
consecuencias operativas que hay que respetar sí o sí: (1) **B004-000001 ya
está consumida ante SUNAT** — cuando se configure la base definitiva, la serie
B004 de TRU debe registrarse con próximo número **2**, o SUNAT rechazará todo
por duplicado; (2) esa boleta es un documento legal por una venta que no
existió y **hay que darla de baja** (resumen diario de bajas, 7 días) desde el
panel de Lucode. Numeración decidida con Felipe, una serie por tienda para
saber de dónde vino cada venta: **TRU B004/F004, AQP B005/F005, LIM B006/F006**.
De ahí sale el único código rescatado: `0039_serie_numero_inicial.sql` (+
`unificacion/22`), que permite fijar el próximo correlativo al registrar una
serie — antes siempre nacía en 1, sin forma de continuar una serie ya usada.
Se corrigió también un error de fondo en la UI: decía "Serie (la que dio
SUNAT)" y que SUNAT asigna las series. Falso en facturación electrónica: las
define el emisor, sin autorización; solo mandan el formato y que el correlativo
sea único y ascendente.
**El error, que vale más que lo anterior:** esta sesión reimplementó desde cero
el conector con Lucode y la verificación RENIEC/SUNAT **que ya existían en
`origin/main`** (`lib/lucode.ts`, `/api/lucode/emitir`, `/api/padron`,
comprobantes con ítems por ADR-0009), porque nunca hizo `git fetch` al abrir.
Trabajó cinco commits sobre un `main` local desactualizado en 30+ commits. Al
descubrirlo se descartó todo ese código en vez de mergearlo —habría dejado dos
conectores, dos rutas, dos variables de entorno y migraciones 0033/0034/0035
duplicadas con contenido distinto— y se rescató solo lo que main no tenía. La
rama `prueba/lo-que-estes-cambiando` queda como registro. **Regla que este
repo ya sabía y se saltó: `git fetch` ANTES de escribir la primera línea**; la
propia bitácora ya documenta dos choques de sesiones paralelas antes de este.
Aparte: el token de Lucode se pegó en el chat, justo lo que el backlog pedía no
hacer — conviene rotarlo desde el panel.

## 2026-09-05 (Fase 2 — Egresos, primera pantalla nueva del reemplazo de Alegra)
Con Fase 0/0.5/1 ya cerradas (por sesiones paralelas), primer trabajo propio de
esta sesión sobre el plan: `/finanzas/egresos`, pantalla nueva que antes no
existía — los gastos solo se veían agregados dentro del EERR del Resumen, sin
lista propia. Small multiples (hallazgo Ramp/Tufte, Ronda 2): una
`TarjetaIndicador` por sede siempre visible, no un selector que esconda que
una sede gasta distinto a otra — verificado en vivo (entorno local por fin
funciona, ADR-0010): registré un gasto de prueba en AQP y solo esa tarjeta
subió, las otras tres siguieron en S/0.

De paso, dos huecos reales encontrados al construir: (1) `RegistrarGastoModal`/
`RegistrarGastoButton` nunca habían recibido el sistema de identidad CAYLA —
usaban `bg-white`/`rounded-2xl`/`text-red-600` desde que se construyeron, ajeno
por completo a rojo/crema/tinta — corregido; (2) `METODOS_PAGO` compartido
(efectivo/pos/yape/transferencia, para ventas) se estaba a punto de reusar para
gastos, que tienen su propio constraint real distinto
(efectivo/banco/yape/tarjeta, `0013_finanzas_nucleo.sql`) — mismo nombre, dos
dominios. Se le dio su propio tipo (`MetodoPagoGasto`) en vez de forzar el
existente. Aparte, `getGastos()`/`GastoConDetalle` en `lib/finanzas.ts` estaban
muertos (nadie los llamaba, quedaron atrás cuando Felipe cambió el criterio a
mes calendario) — se borraron en vez de sumarles un uso más. Las etiquetas de
categoría/método, antes copiadas en 2-3 archivos, ahora viven una sola vez en
`packages/shared/src/enums.ts`.

## 2026-09-05 (Fase 1 — conector real con Lucode en sandbox)
Felipe pidió adelantar la Fase 1 (transmisión real a SUNAT vía Lucode, el PSE
que ya tiene en sandbox, ADR-0005). Bloqueante encontrado antes de tocar
Lucode: `comprobantes` nunca guardó detalle por ítem (solo subtotal/igv/total
agregados) y la API de Lucode exige un array `items` — sin eso no hay nada
válido que transmitir. Se agregó `comprobantes.items jsonb` con un fallback: si
`ComprobantesPanel.tsx` (el único flujo real hoy, manual, sin desglose) no
manda items, `emitir_comprobante`/`emitir_nota` arman uno genérico con el monto
real; el desglose por SKU exacto queda pendiente de que Facturación se conecte
a `ventas`/`movimientos` (decisión de UX de Felipe, no de esta fase). Se
construyó `apps/web/lib/lucode.ts` (mismo patrón que `lib/padron.ts`,
ADR-0008: nunca tumba la pantalla si Lucode no responde), la ruta
`/api/lucode/emitir` y el botón "Transmitir" en `ComprobantesPanel.tsx`
(visible solo en pendiente/rechazado). Bug real cazado probando la migración,
no leyendo código: `CREATE OR REPLACE` con un parámetro nuevo al final no
reemplaza la función vieja — Postgres la identifica por tipos de parámetros de
entrada, así que quedaron dos versiones ambiguas hasta agregar un `DROP
FUNCTION IF EXISTS` explícito de la firma vieja. ADR-0009. Migraciones
renumeradas de 0035/0036 a 0037/0038 (y unificacion 18/19 a 20/21) porque para
cuando se commitearon, otra sesión en paralelo ya había tomado esos números
(ver entrada de proveedor habitual, abajo) — mismo contenido, solo cambió el
nombre del archivo. Pendiente: Felipe pegue `20_comprobantes_items.sql` y
`21_actualizar_transmision_comprobante.sql` en producción, y ponga su
`LUCODE_TOKEN` real en `.env.local` (nunca en el chat) para la primera prueba
real contra el sandbox de Lucode.

## 2026-09-05 (Proforma: la pantalla que faltaba desde la Fase 0)
Felipe pidió "diseñemos algo que nos permita emitir boletas y facturas". Boleta
y factura ya emitían (con verificación RENIEC/SUNAT, ADR-0008) — lo que
faltaba, con backend listo desde la Fase 0 (ADR-0007) pero sin una sola
pantalla que lo usara, era la Proforma. Se construyó `ProformasPanel.tsx` +
`lib/proformas.ts`: crear proforma (sin verificación de documento — no es
fiscal, no lo exige la ley) y "Convertir a comprobante" (sí exige RUC si se
convierte a factura, reusa `ConsultaDocumento`). Nunca un `UPDATE` de estado —
convertir llama a `convertir_proforma_a_comprobante`, que crea un comprobante
nuevo. Proformas por vencer en 48h se ordenan primero (patrón "excepciones
primero", Ronda 2) y usan `TarjetaIndicador` ya construido en Fase 0.5 en vez
de repetir el markup de KPI a mano.

`packages/database/src/types.ts` seguía sin `proformas` ni las columnas de
NC/ND de la Fase 0 (`comprobante_original_id`, `motivo`) — la migración 0034/17
se aplicó a producción después de la última regeneración. Se agregaron a mano
(mismo patrón ya usado para `crear_producto_con_variantes`), no se regeneró
completo: el script de `gen-types` sigue apuntando al proyecto viejo de retail
(deuda ya trackeada). `next build` completo corrido y limpio, no solo `tsc` —
la lección de la sesión anterior sobre que uno solo no basta.

## 2026-09-05 (Catálogo no mostraba lo recibido — faltaba conectar el almacén interno)
Felipe registró una recepción de prueba y preguntó por qué no aparecía en su
stock. No era un bug de datos: "Recibir mercadería" sí mete las unidades a
`retail.stock_almacen` (el almacén interno, construido el 09-03), pero
`getCatalogoConStock` (lo que alimenta Catálogo, Vender, Comercial, etc.)
solo leía `retail.stock` (piso) — nadie había conectado esa fuente al
frontend todavía. Se agregó `stockAlmacenPorSede/Total` a `VarianteConStock`
de forma aditiva (Vender sigue viendo solo piso, para no ofrecer como
vendible algo que sigue en la bodega) y Catálogo ahora muestra "+N en
almacén" junto al stock total. Aprendizaje para explicarle a Felipe: recibir
≠ tener en venta — el paso "Bajar a tienda" en Almacén es el que de verdad
habilita vender algo recién llegado.

## 2026-09-05 (hallazgo real: faltaban 25 de 30 categorías en producción)
Felipe llenó "Recibir mercadería" con un ejemplo real (Blusa Manga Larga,
proveedor EGTI) y notó que Categoría no ofrecía "Blusas" — solo las 5 de
`0030_categorias_captura_real.sql`. Causa raíz encontrada leyendo el propio
repo: `supabase/unificacion/04_catalogo.sql` (paso 4 de la unificación con
Dynamic, jul-2026) recreó la tabla `retail.categorias` desde cero pero nunca
volvió a correr las 30 filas semilla de `0009_categorias.sql` — solo definió
la estructura. Las 5 de `0030` fueron las PRIMERAS que existieron en
producción, no una adición a 30 previas. El gap llevaba desde julio sin
notarse porque el catálogo real recién empezó a cargarse el 09-03. Repuestas
las 25 faltantes (`0036` local, `unificacion/19` producción, `on conflict do
nothing`, seguro de correr). De paso, Felipe notó que Costo/Precio/Stock
mínimo en el mismo formulario solo tenían placeholder — se veían idénticos
una vez llenos porque el placeholder desaparece al escribir; se agregaron
etiquetas fijas a todos los campos del ítem, y la confirmación al recibir
ahora dice cuántos ítems/unidades entraron con enlaces a Catálogo/Almacén.

## 2026-09-05 (proveedor habitual del producto — cierra la pregunta de Felipe)
Felipe probó Proveedores (le gustó editar/desactivar) y preguntó cómo debía
relacionarse con "Nuevo producto": ¿primero el proveedor, luego el producto
"de ese proveedor"? Se explicó el patrón de los ERP serios (Shopify: vendor
como etiqueta del producto; Odoo/QuickBooks: proveedor preferido en el
producto vs. proveedor real por orden de compra/recepción — dos preguntas
distintas, no una) y se completó la mitad que faltaba: `productos.proveedor_id`
(opcional, no candado) + selector en `NuevoProductoForm`. La otra mitad
("¿quién trajo este lote?") ya existía desde Fase 3 en `lotes.proveedor_id` —
no se tocó. De paso, a pedido de Felipe, se quitó "Categoría" del formulario
de Proveedores (duplicaba la misma idea que ahora vive en el vínculo
producto↔proveedor). Migración local `0035`, producción en
`unificacion/18_productos_proveedor.sql` (reemplaza a `16` si Felipe todavía
no lo pegó). Empujado a `main` y a la rama propia a pedido explícito.

## 2026-09-05 (Fase 0 confirmada en producción + reconciliación con 2 sesiones paralelas)
Felipe pegó `17_facturacion_completa.sql` en producción. Confirmado con
`pg_proc`/`information_schema.tables`: las 6 funciones y las 3 tablas
(`comprobantes`, `series_comprobantes`, `proformas`) existen — Fase 0 cerrada
de punta a punta, no solo "escrita". En el camino, dos sesiones paralelas
habían avanzado bastante en el mismo árbol compartido: verificación RENIEC/
SUNAT (ADR-0008), corrección del proveedor SUNAT a Lucode (no Nubefact — ver
esa entrada abajo), Fase 0.5 de tokens de diseño empezada, y Proveedores
(editar/desactivar) ya en GitHub. Un solo conflicto real al fusionar
(`BITACORA.md`, aditivo — dos sesiones agregando entradas al mismo punto, se
combinan sin perder nada). Backlog actualizado para reflejar el estado real:
Lucode reemplaza a Nubefact en toda referencia, con el trámite pendiente que
le toca a Felipe (alta como PSE tercero en SUNAT SOL, no antes de mañana).

## 2026-09-05 (el entorno local por fin existe)
Felipe pidió arreglar lo del Supabase local. Eran tres causas encadenadas, no
una: (1) `supabase start` aborta y borra TODOS los contenedores si uno solo
falla el healthcheck, y fallaban cuatro —analytics, vector, realtime y storage—
por saturación de tener dos stacks de Supabase en la misma máquina; como la CLI
ve el contenedor de Postgres y dice "setup is running", el fallo era invisible.
(2) La app pide el schema `retail` y las migraciones locales dejan todo en
`public`. (3) `lib/persona.ts` solo reconocía el rol `admin` de dynamic, así que
un Líder local se volvía integrante y quedaba fuera de media app.

Lo que manda de la solución: el renombrado `public` → `retail` va en
`supabase/seed.sql`, que corre SOLO en local — así las migraciones se siguen
escribiendo sin prefijo (una sola forma, como manda CLAUDE.md) y el local queda
con la misma forma que producción, sin que el código de la app tenga un camino
distinto según dónde corra. Se descartó reescribir las 34 migraciones con
prefijo `retail.` (mataría de paso el archivo dual que causó ADR-0004 y
ADR-0006, pero es un proyecto aparte) y se descartó una variable de entorno para
el schema, que es justo el patrón que produce bugs que nadie reproduce. ADR-0010.

Ahora sí hay evidencia en vez de razonamiento: login real como "Felipe Alvarez ·
Líder · AQP", `/vender/facturacion` cargando con las series del seed, un DNI
incompleto respondiendo "Falta 1 dígito", una boleta real emitida
(B001-000001, S/118.00) por la RPC contra el schema `retail`, y al reteclear el
mismo DNI la tarjeta "MARIA FERNANDA ALVAREZ QUISPE — De un comprobante
anterior". Eso último es el camino de degradación de ADR-0008 probado de punta a
punta, sin proveedor de padrón y sin internet. Precio consciente: Storage queda
apagado en local, así que subir fotos de producto no funciona ahí.

## 2026-09-05 (facturación — verificar al cliente contra RENIEC/SUNAT antes de emitir)
Felipe pidió que boletas y facturas lean el DNI (o el RUC, si es factura) y
muestren en pantalla los datos del cliente para poder verificarlos antes de
emitir. Se construyó como tres piezas separadas y no como un campo con una
llamada adentro: validación pura (`packages/shared/src/documento.ts`), adaptador
de proveedores (`apps/web/lib/padron.ts`, tres proveedores intercambiables por
variable de entorno) y un campo reutilizable (`ConsultaDocumento.tsx`) que va a
servir igual en el punto de venta. Decisiones y descartes en ADR-0008.

Lo que manda del hallazgo: ni RENIEC ni SUNAT tienen API abierta —todo pasa por
intermediarios que cobran por consulta y a veces desaparecen—, y Nubefact (el
OSE ya elegido) no sirve para consultar, solo para emitir. Por eso el dígito
verificador del RUC se calcula en casa: caza casi todos los tipeos sin gastar
una consulta pagada y funciona sin internet. Y por eso lo que se muestra no es
solo el nombre sino el estado y la condición del RUC: una factura a un RUC de
baja o "no habido" la rechaza SUNAT y la clienta pierde el crédito fiscal, con
el correlativo ya quemado.

Dos bugs reales cazados por probar en vez de razonar: (1) el middleware mandaba
a `/login` también a las rutas de API, así que un `fetch()` recibía HTML en vez
de JSON y el formulario decía "no se pudo consultar" cuando en realidad la
sesión había vencido — le pasaba igual a `/api/export/inventario` desde antes;
(2) el formulario guardaba el tipo de documento como estado aparte del tipo de
comprobante, así que tipear un DNI y luego cambiar a Factura dejaba
"factura + dni" y la venta se caía recién al apretar Emitir. Ahora se deriva:
el estado imposible no existe. Aparte, se confirmó que el stack local de retail
es solo Postgres (los demás servicios no levantan y `retail` no está expuesto
como schema), así que la app nunca ha corrido contra local — está en el backlog.

## 2026-09-05 (reemplazo total de Alegra — Fase 0: esquema legal completo)
Felipe pidió reemplazar Alegra por completo, con un módulo propio superior a
QuickBooks y estética de casa de moda de herencia. Se hicieron 27 preguntas de
descubrimiento y se investigó con 7 agentes en paralelo (UX de Stripe/Mercury/
Ramp/QuickBooks/Xero, estética Hermès/LVMH/Ralph Lauren/Aesop/The Row, motores
de insights fintech, API de Nubefact y normativa SUNAT real). Hallazgo que
manda: OSE=Nubefact confirmado (S/70/mes, hasta 500 comprobantes, locales sin
límite); proforma/nota de venta NO es comprobante de pago (Art. 2, RS 007-99);
ningún benchmark segmenta por sede física — CAYLA debe hacerlo desde el día 1
o un consolidado esconde que una tienda cae mientras otra sube. Plan de 7 fases
escrito y aprobado (`~/.claude/plans/cozy-gathering-nova.md`).

Fase 0 completa: migración `0034_facturacion_completa.sql` — tabla `proformas`
separada (nunca se "promociona" con UPDATE, se convierte creando un comprobante
nuevo), NC/ND con referencia obligatoria a un comprobante ACEPTADO (CHECK de
fila + trigger, dos capas), `nota_debito` agregado al tipo. Se probó
empíricamente contra Postgres local (puerto reconfigurado a 54421-54429 para no
chocar con el de cayla-dynamic) — y la prueba cazó un bug real antes de
entregarlo: se me olvidó actualizar el check de `series_comprobantes.tipo`
además del de `comprobantes.tipo`, la misma familia de deriva que ya costó
ADR-0004 y ADR-0006. Corregido antes de commitear, no después. ADR-0007.

## 2026-09-04 (Proveedores — editar, desactivar, banco/marca)
Felipe revisó Proveedores y preguntó si estaba bien así. Hallazgo: el
formulario solo insertaba, `activo` existía y el query ya filtraba por ella
pero nada la usaba (no había forma de archivar un proveedor), y `marca`/
`banco`/`cuenta_bancaria` vivían en el schema sin exponerse en pantalla.
Cada fila (Líder) abre ahora el mismo formulario en modo edición con
Desactivar/Reactivar — nunca se borra la fila — y se agregaron los tres
campos que faltaban. Sin RPC nueva: `.update()` directo contra la tabla,
mismo patrón que ya usaba el `.insert()` (RLS `proveedores_write_lider`
cubre ambos). Empujado a `main` después de fast-forward con un commit nuevo
en paralelo (traslado de Facturación de Finanzas a Vender, sin overlap).

## 2026-09-04 (alta de producto con matriz talla × color)
Felipe pidió crear un producto ("Reflixme") pensando en todo — tallas y
colores incluidos — y encontró el hueco real: "Recibir mercadería" crea un
`producto` nuevo por CADA ítem agregado con "+ Agregar prenda nueva", así que
pedir la misma referencia varias veces (una por talla/color) deja productos
duplicados en vez de un modelo con N variantes. Se construyó
`crear_producto_con_variantes` + pantalla `/inventario/producto/nuevo` (solo
Líder): chips de talla/color, matriz generada con SKU/costo/precio editable
por fila, un solo INSERT a `productos` + N a `variantes`, sin tocar stock
(nace con 0 unidades hasta el primer lote real). Antes de comitear, un
`git fetch` mostró que esta rama estaba 12 commits detrás de `origin/main`
(otra sesión en paralelo, misma máquina, ya había cerrado almacén interno,
facturación parte 1 y el fix de seguridad de `recibir_lote` — ver ADR-0004);
se fusionó todo antes de tocar nada más, con un solo conflicto real en
`packages/database/src/types.ts` (se tomó la versión regenerada y se le
reinsertó a mano la entrada de la función nueva). Se siguió el mismo patrón
dual que `recibir_lote`: versión local sin prefijo en
`0033_crear_producto_variantes.sql`, versión schema-calificada lista para
pegar en producción en `supabase/unificacion/16_crear_producto_variantes.sql`
— Claude no pega SQL en producción directo, eso lo hace Felipe. `next build`
completo (no solo `tsc`) corrido a propósito: la sesión paralela ya había
encontrado que `tsc` solo no bastaba para atrapar los 30 errores de
null-safety que bloqueaban el deploy. Empujado a `main` (fast-forward limpio)
a pedido explícito de Felipe; falta que pegue el archivo 16 en el SQL Editor
y confirme que el producto aparece en Catálogo — cierra de paso la
verificación pendiente de "almacén interno".

## 2026-09-03 (auditoría — la bitácora estaba congelada desde julio)
Felipe pidió retomar CAYLA retail; la carpeta local llegó vacía a la sesión y se
repobló (clon/sync de otra Mac) mientras se investigaba. Corrí `/backlog`: la
bitácora y el backlog llevaban parados desde el 19-20 de julio pero el repo tiene
commits reales hasta el 23, incluida una fase de "Unificación" (retail pasa a leer
`sedes`/`personas` de Dynamic vía schema dedicado) nunca documentada aquí.
Hallazgo que manda sobre todo lo demás: el código de HEAD fuerza
`db:{schema:"retail"}` en cada consulta, pero `cayla-dynamic/supabase/migrations/0097`
(27-jul, posterior) dice explícitamente que el puente con retail "todavía no
existe" — o producción quedó desincronizada del repo, o cada consulta falla desde
hace 6 semanas. No se puede saber leyendo código; queda como primer punto a
verificar con Felipe contra Vercel/Supabase antes de construir nada más. Backlog
reescrito completo con esto como ítem #1 de ARREGLAR.

## 2026-09-03 (verificación — el schema `retail` sí existe en producción)
Felipe corrió en el SQL Editor de producción: `select schema_name from
information_schema.schemata where schema_name = 'retail'` → devolvió la fila. El
peor escenario (app rota 6 semanas, o desincronizada del repo) queda descartado:
`NEXT_PUBLIC_SUPABASE_URL` de producción sí apunta al proyecto con el schema
unificado. Sigue sin confirmar si las 22 tablas y las vistas puente están
completas y sirviendo datos reales — próximo paso queda anotado en el backlog
como dos `select` de una línea, no una investigación nueva.

**Mismo día, segundo chequeo:** Felipe corrió los dos `select` pendientes.
`retail.sedes` devolvió 5 filas (no vacío) y `information_schema.tables` para el
schema `retail` devolvió 28 (más que las ~22 esperadas — las migraciones de
producción `0024`-`0029`, escritas después de la unificación, sumaron tablas
propias encima). Cierra la duda del hallazgo #1: la unificación con Dynamic está
aplicada y con datos reales, no a medias ni rota. Backlog actualizado: el ítem
pasa de ARREGLAR (riesgo) a CERRADO; queda solo una deuda de documentación (falta
el ADR y el `02_*.sql` que crea el schema, nunca se guardó en el repo).

## 2026-09-03 (arranca Frente 1 — captura del catálogo real)
Felipe pidió seguir con el catálogo real. Antes de tocar la captura física, se
retomó una decisión de julio que quedó escrita en `docs/PLAN-DE-TRABAJO.md` §4 y
nunca se migró: 5 categorías nuevas (Conjuntos, Enterizos, Chalecos, Bodys,
Blazers/Sacos) respaldadas por el historial real de compras. Felipe pidió ver el
detalle completo antes de aprobar ("2 y 4" a la pregunta: explicar más Y dejar
espacio a ajustes) — se mostró la tabla con tallas sugeridas propuestas y no pidió
cambios. Migración `0030_categorias_captura_real.sql` escrita (aditiva, sin tocar
esquema) y ADR-0003. Pendiente: que Felipe la corra en el SQL Editor de producción.

## 2026-09-03 (recibir_lote — la unificación perdió tres cosas)
Con `0030` ya corrida, se comparó `retail.recibir_lote` de producción contra el
frontend y contra `supabase/migrations/0018` (la última versión local antes de
la unificación). Confirmado con `pg_get_functiondef`: la unificación migró una
copia más vieja — sin validar sede (mismo hueco que `0012` ya había cerrado),
sin guardar `categoria_id` (cada producto nuevo quedaba sin categoría pese a
que el formulario sí la manda — rompía lo de `0030`), y sin aceptar
`p_orden_compra_id` (recibir ligado a una compra fallaba). Felipe pidió
arreglar las tres juntas. Al escribir el fix salió una cuarta cosa, más
grande: el frontend también manda `p_orden_produccion_id`, pero apunta a un
modelo de Producción (`ordenes_produccion`) que las migraciones `0025`-`0029`
reemplazaron por `producciones` sin propagar el cambio — ni `lotes` tiene
columna para ese vínculo, ni la pantalla de recibir se actualizó. Felipe
decidió dejarlo como tarea aparte, no meterlo en el mismo arreglo. Migración
`0031` escrita (local, idéntica a 0018) + ADR-0004, con el cuerpo
schema-calificado listo para pegar en producción. Sin `BEGIN…ROLLBACK` local
esta vez — el puerto de Supabase local estaba ocupado por otra sesión
(cayla-dynamic).

## 2026-09-03 (hallazgo de una sesión paralela — almacén interno)
Mientras se trabajaba la taxonomía con Felipe, otra sesión (misma Mac, otro
proceso) descubrió que "Recibir mercadería" está bloqueada en producción: la
unificación nunca recreó las sedes-almacén (TRU-ALM/AQP-ALM/LIM-ALM), así que
Recibir y "Bajar a tienda" no tienen dónde escribir. Diseñó y dejó lista (sin
aplicar, sin commitear) `supabase/unificacion/12_almacen_interno.sql` — un
contenedor tipo 'almacen' por sede en vez de una sede hermana — y encontró de
paso el hueco de seguridad de `recibir_lote` (ver arriba). Se commiteó su
trabajo sin tocarlo. Verificado 2026-09-03 (esta sesión): `fn_aplicar_movimiento`
y `recalcular_stock` de producción coinciden exactos con lo que la migración
asume — es seguro pegarla — pero `recibir_lote` queda fuera de esa migración a
propósito (ver entrada de arriba).

## 2026-07-16
Fase 1 (inventario multi-sede) verificada en vivo. Felipe pausó el plan de retomar la
Fase 2 financiera y pidió en su lugar "Inventario Inteligente" (rotación, alertas,
reorder point) inspirado en cómo lo resuelven Zara/Walmart/marcas premium, escalado a
3 tiendas + 1 taller — no a esa escala real.

## 2026-07-17 (mañana)
Inventario Inteligente construido y verificado (build/lint limpios). En revisión
autónoma se encontraron y corrigieron 2 bugs reales (sugerencia de traslado limitada
a una sola sede, clasificación ABC mal calculada en el límite) y se documentó un gap
de RLS sin corregir a la espera de confirmación.

## 2026-07-17 (tarde)
Se adoptó el "Protocolo Pedagógico": Claude decide lo técnico, pregunta lo que tiene
consecuencia de negocio, y enseña siempre. Se commiteó todo lo de la mañana (3
commits). Se aplicó el fix de RLS confirmado por Felipe. Al dar de alta la cuenta de
Felipe se descubrieron 4 filas duplicadas en `personas` para el mismo `auth_user_id`
— el login fallaba con el mismo error que "cuenta no vinculada" porque
`requirePersonaActual()` usa `.single()`, que exige exactamente una fila. Felipe
aprendió a diagnosticar esto con una consulta antes de borrar nada, y por qué el motor
bloqueó el primer intento de borrado (una de las filas ya tenía movimientos reales
asociados). Se agregó `unique(auth_user_id)` para que esta clase de error sea
imposible de repetir.

## 2026-07-17 (noche)
Se subió cayla-retail a GitHub por primera vez — no tenía remoto configurado, ni
siquiera la Fase 1 tenía respaldo fuera de la Mac de Felipe. El primer intento con
token embebido en la URL falló dos veces por errores de transcripción manual en
Terminal (token duplicado); funcionó al tercer intento con el token correcto. Se
conectó Vercel al repo de GitHub para que cada push despliegue solo, reemplazando el
flujo anterior de deploy manual por CLI. Primer intento de conexión no disparó build
del código ya existente (solo dispara con push nuevos); un segundo push (el commit de
docs) lo activó. Felipe confirmó en pantalla, logueado en `cayla-retail.vercel.app`,
que Inventario Inteligente está completo en producción: 4 KPIs, panel de alertas,
filtros y badges. Fase 2 (Inventario Inteligente) queda cerrada de punta a punta:
construida, verificada local y en producción, con respaldo en GitHub.

## 2026-07-17 (madrugada)
Retomada la Fase 2 financiera. Investigué manejo de caja retail y contabilidad antes
de diseñar (conteo ciego, mermas como COGS, categorías de gasto estructuradas — no
solo inventado). Construidos Diario de Caja, Gastos y Estado de Resultados sobre
tablas nuevas (`cajas`, `ventas`, `gastos`). Felipe probó en vivo y dio feedback real
que corregí en el momento: el formulario de gasto pedía subtotal cuando lo natural es
partir del total del comprobante (se invirtió el cálculo), y la diferencia de caja se
mostraba en rojo sin importar el signo (se corrigió a verde/rojo según sobra o falta).
También encontré una inconsistencia real revisando el módulo: el modal de
movimiento genérico todavía ofrecía "Venta" como motivo, lo que crearía una venta
"fantasma" sin fila en `ventas` ni caja asociada — se retiró de ahí, el botón "Vender"
es ahora la única forma correcta de registrar una venta.

## 2026-07-17 (noche 2 — Fase 3: almacén)
Felipe pidió expresamente 21-33 preguntas antes de diseñar el ingreso de mercadería
("para diseñar algo formidable") — se hicieron 24, en dos tandas (4 fundacionales con
opciones, 20 más en texto libre). Hallazgo clave que cambió el plan sobre la marcha:
Integrante necesita poder crear un SKU nuevo al recibir un fardo (con costo/precio),
lo que choca con la regla de Fase 1 de que solo Líder crea catálogo — Felipe decidió
"hay que confiar en el equipo"; se resolvió sin relajar la regla general, dejando que
`recibir_lote` cree catálogo con permisos elevados solo para sus propias inserciones
internas (security definer), no abriendo la tabla `productos`/`variantes` a Integrante
en general. Construido: almacén hermano por tienda, contenedores, lotes, bajada y
devolución reutilizando `traslado`. Verificado en producción.

Fricción real de la sesión, no de la app: subir a GitHub y mantener el push
funcionando tomó muchísimo más tiempo que el código — tokens que caducan cada vez que
se revocan, ventanas nuevas de Terminal que no heredan la carpeta de trabajo, y un
archivo `Index.html` suelto que apareció en GitHub y causó un historial divergente
que hubo que reconciliar con merge. Nada de esto es un problema del código de CAYLA;
es la curva de aprendizaje normal de git/GitHub para alguien que no lo usa a diario.

Felipe probó "Recibir mercadería" en vivo y dio feedback real: los campos de talla/
color/categoría quedan escondidos hasta buscar y crear un producto nuevo, no es obvio
a primera vista. Pidió retomar el rediseño de ese formulario en una sesión aparte —
queda anotado en el backlog, no se improvisó un cambio de UX apurado al cierre.

## 2026-07-17 (madrugada 2 — taxonomía de categorías)
La misma sesión siguió: en vez de abrir el rediseño de UX en otro chat, Felipe pidió
diseñar la estructura de familias/categorías del catálogo. Se construyó con 2 rondas
de preguntas cortas en vez de las 24 de la fase anterior — la primera fijó el criterio
(estándar por categoría, no por familia; varias marcas/proveedores), la segunda afinó
categorías reales (Maquillaje, Útiles de oficina) comparando con LVMH/Zara/Hermès.
Felipe corrigió el diseño tres veces en vivo sobre Bisutería: primero pidió agregarla,
luego pidió separarla en 4 categorías (pulseras/aretes/anillos/collares), y finalmente
— con frustración visible por tener que repetirlo — la elevó a familia propia, séptima
decisión que ya no se debe volver a cuestionar. Resultado: 6 familias fijas, 30
categorías en tabla editable por Líder, con tallas sugeridas por categoría (ej.
Zapatillas → 34-42, Bisutería → Único) que ahora alimentan un selector real en vez de
texto libre en "Recibir mercadería". `productos.categoria` (texto libre, sin dueño de
qué valores eran válidos) se reemplazó por `categoria_id` — sin backfill porque el
catálogo real todavía no está cargado, más barato cambiar el terreno ahora que
después de 900 SKUs reales. Build y lint verificados limpios. Migración
`0009_categorias.sql` pendiente de correr en Supabase (Felipe debe pegarla en el SQL
Editor, igual que las anteriores).

Felipe corrigió las tallas sugeridas antes de correr la migración — había asumido
rangos "de catálogo genérico" (28-38 para Jeans, "Único" para Anillos) en vez de
preguntar qué vende Cayla realmente: Jeans y Pantalones van 26-34, "Estándar" es una
talla adicional muy usada junto a XS-XXL (no un reemplazo) en Polos/Camisetas,
Blusas, Poleras/Sudaderas, Camisas, y dos categorías que faltaban del todo (Chompas,
Tops), y Anillos sí tiene talla numérica real (6-9), no es "Único" como el resto de
Bisutería. Corregido en el archivo antes de que Felipe la corra — ninguna de las 30
categorías originales cambió de nombre o familia, solo las tallas sugeridas de 8 de
ellas y 2 categorías nuevas. Felipe corrió la migración en Supabase y verificó en
vivo en "Recibir mercadería": Familia filtra Categoría, y Categoría cambia la Talla
de texto libre a un desplegable con las tallas reales (Zapatillas 34-42, Jeans
26-34, Polos con Estándar primero, Anillos 6-9). Fase de taxonomía cerrada de punta
a punta: construida, verificada en producción. Se commiteó y subió a GitHub — y de
paso se resolvió la causa raíz del dolor recurrente de git: se cambió el remoto de
HTTPS-con-token (que caduca) a SSH (llave permanente que ya existía y ya estaba
autorizada en la cuenta). Ya no hará falta generar tokens nunca más en esta Mac.

## 2026-07-17 (noche — revisión autónoma del proyecto)
Felipe pidió revisar todo el proyecto en modo autónomo y dejar un checklist. Leí las
9 migraciones, las RPCs de stock/dinero, todas las políticas RLS, la lógica de
inteligencia/finanzas y los 15 componentes. El código está sano — no hubo bugs de UI
que arreglar a ciegas. Hallazgo principal (real, no teórico): una **condición de
carrera** en `fn_aplicar_movimiento` — dos ventas de la última unidad de la misma
prenda/sede en el mismo instante dejan el stock en -1, porque la validación lee sin
bloquear la fila. Es el escenario "dos clientas se llevan la última prenda en el mismo
segundo" del propio criterio de arquitectura. NO lo apliqué (toca el corazón del stock
y es decisión de Felipe): dejé la migración lista en `docs/propuestas/0010_stock_concurrencia.sql`
(fuera de supabase/migrations/ para que no se aplique sola) con `for update` + `check
(cantidad>=0)` + la FK que le faltaba a movimientos.venta_id. Segundo hallazgo: el
indicador "Estancado" se reinicia con las bajadas de almacén (mide "días sin salida"
en vez de "días sin venta", que es la intención declarada) — documentado como Decisión
2, necesita una columna nueva, no se improvisó. Único cambio de código aplicado: un
texto del login que aún decía "hoja `personas`" (herencia de Sheets) → "el sistema".
Todo quedó en `docs/CHECKLIST-MANANA.md`. Build y lint limpios.

## 2026-07-18 (madrugada — Felipe resuelve el checklist)
Felipe volvió y pidió resolver los pasos del checklist en vivo. **Decisión 1 (concurrencia
de stock):** revisó que no hubiera stock negativo previo, corrió la migración 0010 en
Supabase (for update + check cantidad>=0 + FK de venta_id), y el archivo pasó de propuesta
a `supabase/migrations/0010`. **Decisión 2 (Estancado):** patrón migración-primero para no
romper producción — Felipe corrió 0011 (columna `stock.ultima_venta`, backfill del
histórico, y fn_aplicar_movimiento sella la fecha solo con motivo='venta'), y recién
después se subió el cambio de pantalla (inteligencia.ts lee ultima_venta; el indicador se
renombró de "Días sin salida" a "Días sin venta" en las 3 pantallas que lo usaban, para
que diga lo que mide). Aprendizaje de método: cuando un cambio toca base + pantalla, la
base va primero y la pantalla después, para que nunca exista un momento donde la pantalla
pida una columna que aún no existe. **Decisión 3 (seguridad):** Felipe corrió 0012 —
las 5 funciones security-definer (registrar_movimiento, abrir/cerrar caja, registrar_venta,
recibir_lote) ahora validan la sede del que llama con el helper `fn_puede_operar_sede`
(Líder, o tu sede, o el almacén de tu tienda). 100% base, sin cambio de pantalla. Con esto
cierran las tres deudas grandes de la revisión nocturna; el cubo ARREGLAR quedó casi vacío
(solo el warning de middleware deprecado, que no rompe nada).

## 2026-07-19 (Fase F1 — el núcleo financiero, jubilación de SINATRA)
Felipe compartió los 3 SINATRA reales (.xlsm por sede). Se disecaron a fondo (hojas,
fórmulas, rangos, VBA extraído): S/646K de ventas 2026 registradas, 2,368 celdas con
error, cuadres de efectivo en -S/6,122 (TRU) y -S/7,675 (LIM) sin fecha de origen,
Proveedores desincronizado entre archivos (295 vs 287 filas), macros que solo navegan.
Informe completo en docs/ANALISIS-SINATRA.md. Decisiones de Felipe (6 preguntas):
NO replicar — estándar QuickBooks o superior; corte limpio; monto total en caja;
tipos de costo/gasto se revisan juntos después; los 4 reportes irrenunciables (EERR
mensual calendario, año vs año, cuadre de efectivo continuo, patrimonio); compras+
proveedores ahora ligado a recibir. Se construyó y desplegó F1 completo: migraciones
0013 (proveedores, depósitos bancarios, ajustes de efectivo, históricos mensuales,
patrimonio_items) y 0014 (registrar_gasto con método de pago), lib finanzas-nucleo
(meses calendario de Lima), y el mundo Finanzas con 4 secciones: Resumen (EERR
mensual con selector), Efectivo (cuadre continuo + depósitos + ajustes con motivo),
Año vs año (con editor de siembra de históricos), Patrimonio (neto en vivo +
partidas manuales). Proveedores como directorio único en Inventario, seleccionable
al recibir mercadería. Nota didáctica del día: correr una migración dos veces da
"already exists" — es Postgres negándose a duplicar, no un error real.

## 2026-07-19 (Fase B — etiquetas, fotos y mínimos por sede)
Tras cerrar F1, Felipe pidió seguir. Se eligió Fase B de inventario (su prioridad
declarada) sobre F2 de finanzas (que necesita su tiempo en la revisión de tipos).
Tres entregas: (1) /inventario/etiquetas — etiquetas 62×29mm para la Brother
QL-1110NWB con código de barras Code 128 B generado como SVG propio (tabla oficial
de patrones, checksum y stop; sin librerías externas), vista previa = impresión;
(2) fotos de producto — una por modelo (decisión de Felipe), bucket público
`fotos-productos`, subida desde el detalle (Líder), miniaturas en catálogo agrupado
y búsqueda; (3) stock mínimo por sede — stock.stock_minimo por (variante, sede) vía
RPC fijar_stock_minimo (única puerta de escritura: stock no tiene política de
UPDATE), alerta "bajo mínimo" por tienda integrada a reponerYa y visible en rojo en
el detalle. Migraciones 0015 y 0016 corridas por Felipe. Aprendizaje del día:
"already exists" al correr una migración dos veces no es un error — es Postgres
negándose a duplicar lo que ya está.

## 2026-07-19 (F2 — compras, exportar y el modelo de gastos corregido)
Cerrando el día: órdenes de compra formales (/inventario/compras) reutilizando la
tabla de Fase 1 que nunca tuvo UI — proveedor del directorio, monto estimado,
"dinero comprometido en camino", y el ciclo se cierra solo: al recibir el lote
ligado, la orden pasa a recibida (0017). Exportar Excel del inventario (CSV con BOM,
punto y coma para Excel en español, costo solo Líder). Y la revisión de tipos de
gasto que quedó de F1: Felipe pidió NO replicar su clasificación ("yo diseñé
SINATRA pero es imperfecto — no repitas mis errores"). Modelo adoptado: 3 destinos
del dinero — gastos del mes (EERR, +categoría "suministros"), inversiones (su
antiguo "IME" → Patrimonio como activo, no gasto), insumos de taller (dentro de
variantes.costo, nunca duplicados como gasto). Fijo/Variable pospuesto a su pedido.
Migración 0017 corrida por Felipe. Tres fases desplegadas en un solo día:
F1 (núcleo financiero), Fase B (etiquetas/fotos/mínimos) y F2 (compras/export).

## 2026-07-19 (Producción — el Taller entra al sistema)
Felipe eligió Producción sobre el plan de carga del catálogo. Descubrimiento en 2
tandas (8 preguntas): el Taller produce EN CONTINUO (no por encargo), es la minoría
del catálogo pero >100 prendas/semana, registran ambos (equipo del Taller con cuenta
+ Felipe), entrega directa a cada tienda, quiere etapas corte→confección→acabado y
costo CALCULADO — pero insumos "después". La tensión se resolvió con la receta de
costo: bom_items (Fase 1, dormida) + precio_unitario + productos.costo_mano_obra =
costo sugerido SIN inventario de materia prima. Construido: /produccion (tablero con
etapas, cantidades hechas, destino), receta de costo en el detalle de producto
(aplicable a todas las variantes del modelo), y el ciclo cerrado — recibir con
origen Taller liga la producción y la completa sola (0018, simétrico a órdenes de
compra). RLS: el Taller opera sus órdenes, la tienda destino ve lo que viene hacia
ella. Regla de arquitectura sostenida: avanzar producción NO toca stock — el stock
nace únicamente cuando la tienda recibe el fardo.

## 2026-07-19 (Fase C1 — los 4 estados financieros)
Tras dos rondas de investigación contable (docs/ESTUDIO-CONTABILIDAD.md y
docs/MANUAL-CONTABLE-CAYLA.md) y guardarlas en memoria, Felipe pidió armar los
balances de verdad: Balance General, EERR, Flujo de Efectivo y Estado de Cambios en
el Patrimonio. Decisión de arquitectura: modelo de LECTURA (lib/contabilidad.ts) que
calcula los 4 estados sobre los sub-libros existentes aplicando las reglas del
manual — SIN tabla de asientos, SIN migración, SIN tocar ningún money path (venta,
stock, gastos intactos). Cuadra por construcción: Patrimonio = Activo − Pasivo, y se
desglosa en Capital (residual: aportes e inventario por formalizar) + Utilidades
acumuladas (EERR de toda la historia). Verificación algebraica hecha: la identidad
contable se sostiene con el modelo caja/inventario/IGV. Página Finanzas → Balances
con los 4 estados y selector de mes. Corrección del manual aplicada: el flete
(gasto "transporte") se presenta dentro del margen bruto (cuenta 609), no entre
gastos de operación. Simplificaciones declaradas en la propia pantalla: Balance a
hoy, costo vigente, sin depreciación ni cuentas por pagar (llegan en C2). El
endurecimiento a libro mayor inmutable con asientos persistidos queda para C4/SUNAT.

## 2026-07-19 (loop autónomo — ayudas (!) que enseñan)
Felipe pidió trabajar en loop agregando descripciones fáciles y botones (!)
clicables que expliquen cada concepto en su idioma. Se construyó el componente
`Ayuda` (un (!) sutil en la marca; abre panel al tocar, cierra al tocar afuera o con
Escape; fuerza texto normal aunque viva dentro de una etiqueta en versalitas — bug
de herencia detectado y arreglado en verificación en vivo). Regado por todas las
pantallas con jerga: los 4 estados financieros (cada término del Balance/EERR/Flujo/
Cambios explicado con analogía del negocio), el Resumen de Finanzas, el cuadre de
Efectivo, Comercial (rotación, reponer, dinero parado) y los indicadores del detalle
de producto (velocidad, días de inventario, días sin venta, sell-through, clase ABC)
y del Inicio del Líder. Encarna el protocolo de docencia del CLAUDE.md: dejar a
Felipe más capaz de discutir el sistema, no de aplaudirlo. Verificado en vivo con el
navegador: el (!) abre, cierra y se ve en la marca.

## 2026-07-19 (noche — carga de data + plan maestro)
Felipe pidió cargar su data real de las 3 unidades. Estudio profundo de los SINATRA
para catálogo: "Ingreso Mercadería" es un REGISTRO DE COMPRAS, no un catálogo (sin SKU,
sin tallas, sin colores; 350 "detalles" distintos solo en Polos&Tops). FRENO y discuto:
importarlo crearía cientos de productos a medias — el catálogo real se captura bien vía
recepciones. Lo cargable sí: PROVEEDORES, 292 únicos limpiados de 866 filas crudas (228
con RUC válido; me auto-corregí un bug donde el ".0" de RUC-como-float rompía la
validación; 3 conflictos reales de RUC entre archivos flagueados: Amuza/Ivanana/Maju
Vogue; 2 RUC rotos: Tawas/Tiska). SQL de carga dejado en Downloads (NO en git — es PII de
proveedores). Felipe también preguntó dónde va su IME: respuesta = Finanzas → Patrimonio
como Activo, NO gasto (corrige el enredo de SINATRA); se construyó categorización de IME
(muebles/equipos/intangibles) — migración 0019 + editor, PENDIENTE de que Felipe la corra
(sin subir para no romper prod). Antes de irse pidió plan detallado: escrito en
docs/PLAN-DE-TRABAJO.md (estado actual, 3 frentes, taxonomía alineada a su data real con 5
categorías nuevas propuestas: Conjuntos/Enterizos/Chalecos/Bodys/Blazers, plan de captura,
quién hace qué) + docs/GUIA-CARGA-CATALOGO.md (guía imprimible para Encargadas). Hallazgo:
su "Complementos" (412 compras, 2ª más grande) es mayormente bisutería — no es rubro menor.

## 2026-07-18 (tarde — identidad visual + rediseño UX total)
Dos saltos grandes en un día. Primero, la identidad: se leyó el brandbook CAYLA v3.0
(los dos PDFs de marca) y se aplicó a la app — Rojo #B8412D como acento sagrado, Crema
#F5F0E8 de fondo (nunca blanco puro), Tinta #1A1A18 (nunca negro absoluto), EB Garamond
para títulos/cifras + DM Sans para interfaz, sin sombras/gradientes/bordes redondeados,
el colibrí como marca. Tensión resuelta: Felipe pidió "tipo Apple" pero el brandbook
prohíbe justo el look Apple genérico — se decidió que la esencia CAYLA manda en el cómo
y Apple es la vara de calidad (espacio, tipografía, quitar lo que sobra).

Después, Felipe pidió rediseñar la funcionalidad completa ("no me gusta la distribución
de botones y todo el sistema") con descubrimiento tipo QuickBooks. Objeción aceptada:
en vez de las 99-300 preguntas que pidió, se hicieron ~24 de alto impacto en tandas de
4 (mismo método que el almacén). Decisiones clave: 50% escritorio / 40% celular; las
**Encargadas de atención al cliente** (vocabulario corregido por Felipe: jamás
"vendedoras" ni "empleados") son las usuarias principales; foco en INVENTARIO;
catálogo agrupado por producto con matriz de tallas; dolores nombrados: "ir al almacén
a buscar a ciegas" y "comprar por intuición sin datos". Felipe detectó él mismo la
redundancia Inventario/Almacén → se investigó QuickBooks + POS retail (Square,
Lightspeed): navegación v3 aprobada = lateral escritorio con "+ Nuevo" global, 4
pestañas + botón + central en celular, Almacén DENTRO de Inventario. Tiene escáner
Zebra (funciona como teclado — soportado de fábrica por la búsqueda) e impresoras
Epson TM-T20III (boletas) y Brother QL-1110NWB (etiquetas). Fase A construida y
desplegada de un tirón: AppShell, /buscar con ubicación de contenedor, /inventario
agrupado, inicios por rol, /vender, /comercial v1. Precio ahora visible para
Encargadas (lo necesitan para vender; el costo sigue siendo solo del Líder).
Pendiente fase B: fotos (una por modelo), etiquetas Brother, stock mínimo por sede,
exportar Excel, conteo físico. Al cierre, Felipe pidió y se construyó el selector de
sede del Líder (TRU/AQP/LIM/Taller en la cabecera): cambia la perspectiva de toda la
app sin tocar permisos — el servidor ya validaba por 0012. Verificado en vivo por
Felipe ("bien muy bien").

## 2026-09-04 (modernización de interfaces — primer paso)
Felipe pidió "descargar skills para el diseño de todas las interfaces" y que la app
sea "moderna". Antes de tocar código se auditó el repo: ya existe un sistema de
identidad completo y verificado en producción (brandbook v3.0), y hay un precedente
explícito del 18-jul donde se decidió que la esencia CAYLA manda sobre una estética
genérica "tipo Apple". Se le presentó la tensión a Felipe con AskUserQuestion: eligió
modernizar DENTRO del sistema CAYLA, usando Radix/shadcn solo como base de
accesibilidad sin estilo propio, nunca el look por defecto de un kit externo.

Se encontró el punto real de la petición: 6 modales del núcleo (abrir/cerrar caja,
vender, bajar a tienda, registrar gasto, movimiento de stock) seguían con estilos
genéricos pre-brandbook (blanco/negro/neutral-*), y ninguno de los 8 modales de la
app atrapaba el foco ni cerraba con Escape. Se construyó `components/ui/Modal.tsx`
(Radix Dialog + tokens CAYLA) y se migraron los 6 modales + `EfectivoPanel` →
ADR-0003. Verificado en navegador (página de prueba temporal, borrada al cerrar):
overlay y panel con la paleta correcta, Escape y click-afuera cierran. Pendiente,
anotado en BACKLOG: `MenuNuevo` del AppShell sigue sin el mismo tratamiento (patrón
distinto, no modal). Commiteado.

## 2026-09-08 (campos con estado y capa de movimiento)
Felipe pidió rediseñar "emitir comprobante" — desplegables, campos, etiquetas,
animaciones — "futurista y elegante" y reutilizable, sin tocar la lógica interna que
él está trabajando en paralelo. Se le marcó la tensión antes de escribir código:
"futurista" en su forma habitual (glassmorphism, glow, gradientes, redondeos) choca
con el brandbook v3.0, cuyos tokens de radio están en 0 y cuyas sombras están
desactivadas a propósito. Se resolvió como instrumento de precisión: el futurismo
viene del comportamiento, no de la decoración. Cero colores nuevos → ADR-0011.

Se construyó `components/ui/campos.tsx` (Campo, CampoTexto, CampoMonto, CampoSelect,
Segmentado, Boton) sobre un solo dispositivo visual — el "hilo vivo", 1px que se
dibuja en rojo al enfocar — más una capa de movimiento en `globals.css` con
`prefers-reduced-motion`. `CampoSelect` es un listbox propio con teclado completo, sin
sumar dependencias. El modal de emisión ahora muestra el correlativo que se va a
reservar ANTES de emitir, o avisa que la sede no tiene serie: el dato ya venía en la
prop `series` y solo faltaba mostrarlo — antes eso se descubría con la RPC fallando y
la clienta en el mostrador.

Verificado en navegador con ruta de prueba temporal (borrada al cerrar): modal
centrado en escritorio y hoja desde abajo en móvil, desplegable con flechas/Enter/
Escape, segmentado que desliza y cambia el formulario a RUC, banda del correlativo
avisando la sede sin serie. Dos bugs propios encontrados y corregidos en el camino:
el centrado del modal peleaba con el transform de la animación, y Escape sobre el
desplegable abierto cerraba el modal entero. tsc, eslint y 51 tests en verde.

## 2026-09-08 (legibilidad y suavizado — todo el sistema)
Con Facturación ya en producción, Felipe pidió tres cosas para toda la app: texto más
grande o con más contraste ("las letras pequeñas no se llegan a notar"), menos sharp /
más smooth, y más animaciones. Lo segundo revierte su propia decisión del 05-sep
(radio 0, sin sombras); se le marcó antes de tocar nada y confirmó el cambio de
criterio → ADR-0012, para que no se lea como drift dentro de seis meses.

Lo del texto resultó medible, no de gusto: `text-tinta/45` — la etiqueta más usada del
sistema, 136 apariciones — daba 2.57:1 sobre crema, contra el mínimo AA de 4.5. El
ámbar de los chips daba 3.07 y el verde 4.21. Se subió el PISO sin tocar el techo:
tamaños 8→10/9→11/10→11/11→12, tokens xs 12→13 y sm 14→15 (mueve ~320 usos desde un
solo lugar), piso de contraste en tinta/65, y verde/ámbar oscurecidos con hermanos
"profundos" para el texto sobre su propio tinte. Medido después sobre el DOM
renderizado: 0 elementos reprueban AA, el peor quedó en 4.72. `EtiquetasGenerator`
quedó congelado a propósito — imprime en rollo físico de 62×29mm.

Radios 0 → 4/8/12/16/22px y sombras reactivadas solo para lo que flota. Movimiento
nuevo: salida animada del modal (antes desaparecía de golpe), globo de ayuda,
escalonado del desplegable, alza al pasar el mouse y barrido de luz en los botones.
61 archivos por sustitución mecánica, verificado con tsc, eslint, 51 tests, `next
build` y medición de contraste en el navegador. Subido a GitHub y desplegado a Vercel
sin consultar, por pedido explícito de Felipe al ser un cambio solo estético.

## 2026-09-09 (la pantalla mentía: SUNAT sí estaba conectado)
Felipe preguntó si el aviso del modal de emisión —"el envío a SUNAT todavía no está
conectado, ver SEE propio vs. OSE"— seguía vigente. No: es texto de la Fase 0, falso
desde el 05-09, y peor, manda a decidir algo que ya se decidió y que no era ninguna de
las dos opciones que nombra (ni SEE propio ni OSE: Lucode como PSE, ADR-0005). En la
misma pantalla ya vivía el botón "Transmitir" que sí manda a SUNAT.

Corregido el texto del modal y el comentario de cabecera de `ComprobantesPanel.tsx`;
`ARQUITECTURA.md` repetía la misma afirmación en la línea de `/vender/facturacion` y
nunca había documentado `/api/lucode/emitir` ni la RPC
`actualizar_transmision_comprobante` — agregados los dos. tsc, eslint y 51 tests en
verde. De paso se corrigió el BACKLOG, que todavía daba las migraciones
`unificacion/20`/`21` por pegar cuando la BITÁCORA del 08-09 dice que se aplicaron.

**Lo que Felipe aprende acá:** un texto de interfaz es tan estado del sistema como una
tabla — envejece igual y nadie lo revisa, porque no rompe ningún test. Este llevaba
cuatro días diciéndole a quien está en el mostrador que no había nada que hacer después
de "Emitir", cuando faltaba exactamente un clic. Lo que sí sigue bloqueado no es el
código: producción no tiene `LUCODE_TOKEN` en Vercel, así que en el deploy "Transmitir"
responde `sin_credenciales`. La máquina de Felipe sí puede transmitir
(`apps/web/.env.local` tiene token y `LUCODE_ENTORNO=sandbox`) — el archivo que
`vercel env pull` sobrescribió es el `.env.local` de la raíz, que Next no lee. Con
`sandbox` ahí, un "Transmitir" de hoy queda "Aceptado" en la app sin haber llegado a
SUNAT, y nada en `respuesta_sunat` dice de qué ambiente vino: eso es un estado
inconsistente de verdad (principio 2), no un detalle de configuración.

## 2026-09-09 (la lentitud era geografía, no datos)
Felipe reportó pantallas lentas y pidió apostar por local-first. Se midió antes de
proponer, y la hipótesis obvia resultó falsa: la base responde en **0.862 ms** — 19
variantes, 28 movimientos, todo el schema `retail` por debajo de 1 MB. No hay consulta
que optimizar ni índice que agregar. La causa es geográfica: `X-Vercel-Id: iad1::…`
delata que la función corre en Washington D.C. mientras Supabase está en `sa-east-1`
(São Paulo), así que cada consulta cruza el continente y vuelve. Medido desde Perú, una
página **estática ya cacheada en el edge** tarda 430 ms de TTFB — ese es el piso, antes
de consultar nada. Encima, cada navegación encadena 4 viajes secuenciales, y dos son el
mismo `auth.getUser()` pedido dos veces (`middleware.ts:31` y `lib/persona.ts:52`: el
`cache()` de React memoriza dentro de un render, pero middleware y RSC son invocaciones
distintas). Hallazgos menores: las 28 rutas salen `ƒ` sin una sola directiva de caché en
todo el repo, `next.config.ts` está vacío, y `getEstadoResultados` (`lib/finanzas.ts:150`)
tiene 5 consultas independientes en fila india que el resto del repo ya había migrado a
`Promise.all`. El bundle quedó descartado como causa: 352 kB gzip, rango normal.

Se le marcó a Felipe la tensión de su propio pedido: local-first es la apuesta correcta
y se mantiene como destino, pero no es lo que está lento hoy — hacerlo primero sería
arreglar la capa equivocada, semanas de trabajo tras las cuales la primera carga
seguiría cruzando a Washington. Eligió el orden propuesto (Fase 0: región + cascadas +
`getClaims()`; Fase 1: caché y streaming; Fase 2: local-first) y decidió la regla de
negocio que faltaba: si se cae el internet en plena venta, se vende offline **solo con
stock de sobra**; si es la última unidad, bloquea — el punto medio entre perder la venta
y sobrevender. La arquitectura queda asentada en ADR-0013: lecturas replicadas al
navegador, escrituras siempre por RPC con `movimientos` como única fuente de verdad.
Nada de código tocado todavía, por pedido explícito suyo.

## 2026-09-09 (el riel del lateral — ADR-0014)
Felipe pidió rediseñar el menú lateral: "muy chico, muy hacia arriba, muy junto",
más futurista y elegante, con las animaciones ya establecidas pero algo innovador, y
"solo cambios estéticos" para poder pushear desde otra sesión sin sorpresas. Las tres
quejas eran medibles: lateral de 224px, filas de 39px con 2px de aire, y 6 ítems
apretados arriba dejando ~380px de vacío muerto abajo. Debajo había algo de fondo: el
lateral era el último rincón que seguía marcando "dónde estás" con un bloque `bg-sand`
plano, la gramática de julio, mientras desde ADR-0011 todo el resto usa el hilo vivo.

Se resolvió con UN riel que se desliza entre filas en vez de seis luces que se
prenden — el indicador del `Segmentado` puesto de canto, con la forma exacta de la
marca del desplegable: dos piezas que ya existían, unidas. Lo innovador propio: al
pasar el mouse por una fila apagada aparece el mismo riel en gris, donde va a quedar
el rojo si sueltas el clic ("estás acá / irías allá"). El alto de fila y el paso del
riel salen de las mismas dos constantes, así que no puede desalinearse y no hay que
medir el DOM. Ancho 224→272px desde un token nuevo (`--spacing-lateral`), que además
destapó que el panel "+ Nuevo" abría 16px corrido por un `left-60` suelto. Dos grupos,
Operación y Dirección, que coinciden con lo que solo ve el Líder; con un solo grupo el
título se oculta. De paso se cerró un pendiente del BACKLOG desde ADR-0003: `Escape`
cierra el "+ Nuevo" y el foco vuelve al botón.

Verificado en navegador con ruta de prueba temporal bajo `/auth` (el único prefijo que
el middleware deja pasar sin sesión; borrada al cerrar): riel en los 6 destinos, marca
fantasma, vista de Encargada sin el grupo "Dirección", `Escape` + devolución de foco,
riel del celular deslizándose, y contraste medido sobre el DOM. Ahí salió un hallazgo:
`text-taupe` sobre crema da 3.39:1 y reprueba AA — la firma del lateral quedó en
`tinta/65`, y los otros 9 usos de taupe de la app quedaron anotados en BACKLOG.
`tsc`, `eslint`, 51 tests y `next build` en verde. **Commiteado sin pushear**, por
pedido de Felipe: el push sale de otra sesión.

## 2026-09-09 (paso "a": el comprobante ya sabe contra qué ambiente se transmitió)
Buscando qué se ganaba con arreglar las variables de Lucode apareció algo peor que la
variable: `lib/lucode.ts` habla con sandbox o con producción según `LUCODE_ENTORNO`, y
las dos respuestas se guardaban idénticas — `estado='aceptado'`, con CDR y PDF. La base
afirmaba "SUNAT lo aceptó" sin poder respaldarlo, y se propagaba: `emitir_nota` solo
exige que el original esté aceptado, así que una nota de crédito real podía colgarse de
una boleta que solo existe en el sandbox.

Construido (ADR-0015): columna `comprobantes.entorno_transmision` con `check (estado =
'pendiente' or entorno_transmision is not null)`; `p_entorno` obligatorio en la RPC, con
la firma vieja de 4 parámetros dropeada a propósito para no dejar sobrecarga (el error
de PostgREST del 08-09); el ambiente viaja pegado al `ResultadoLucode` en vez de releerse
del entorno al guardar; la ruta rechaza notas que cruzan de ambiente; y el chip dice
"Aceptado · prueba" con borde punteado, más el conteo en el resumen del mes. tsc, eslint
y 51 tests en verde. **El SQL no se corrió en ningún lado todavía** — Docker estaba
abajo, así que `supabase db reset` no pudo verificarlo; queda como el primer paso de la
próxima vez que se abra el stack.

**Lo que Felipe aprende acá:** "está aceptado" no es un estado del sistema si el sistema
no sabe quién lo aceptó. El bug no era que se pudiera transmitir a un sandbox —eso hace
falta para probar—, era que después nadie pudiera notar la diferencia. Cuando dos hechos
con consecuencias legales opuestas se guardan iguales, el error no aparece el día que
ocurre sino el día que alguien confía en el dato.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.** Archivos de esta
sesión: `ComprobantesPanel.tsx`, `lib/lucode.ts`, `lib/comprobantes.ts`,
`app/api/lucode/emitir/route.ts`, `packages/database/src/types.ts`,
`supabase/migrations/0040_*.sql`, `supabase/unificacion/23_*.sql`, `docs/adr/0013-*`,
BACKLOG y BITÁCORA. NO son de esta sesión y quedan sin tocar: `AppShell.tsx`,
`globals.css`, `ui/campos.tsx`, `app/auth/`.

## 2026-09-09 (Fase 0 aplicada — de la geografía al código)
Felipe dio luz verde a la Fase 0 del ADR-0013 y se aplicó completa, con una advertencia
suya: había varias sesiones trabajando en paralelo sobre el mismo árbol. Se verificó
antes de escribir nada — las otras estaban en `lucode.ts`, `comprobantes.ts`,
`AppShell.tsx`, `campos.tsx` y `globals.css`; la Fase 0 iba sobre `finanzas.ts`,
`middleware.ts`, `persona.ts` y config. Cero cruce. (Detalle simpático: la sesión de
"Rediseño inicio" reescribió `lib/panel.ts` haciendo la misma clase de optimización —
quitar la relectura de `stock`, reusar `getSedes()` cacheado — sin coordinación previa.)

Los tres cambios: (1) `apps/web/vercel.json` fija la región en `gru1`; el archivo va en
`apps/web/` y no en la raíz porque el `package.json` raíz no declara `next` — si Vercel
construyera desde ahí no detectaría el framework, y el middleware que sí corre hoy no
existiría. Es una inferencia, no un dato leído: la config del proyecto Vercel da 403, así
que se confirma tras desplegar mirando `X-Vercel-Id`. (2) `getEstadoResultados` pasó de 5
consultas en fila india a `Promise.all` de 4, porque `sedes` salió de `getSedes()`
cacheado — esa consulta desaparece del todo en vez de paralelizarse; `getDiarioCaja`
igual, de 3 a una tanda. (3) `getUser()` → `getClaims()` en middleware y persona.

Lo más útil del día fue una suposición que se cayó al verificarla. El ADR daba por hecho
que (3) exigiría migrar el proyecto a claves JWT asimétricas — cambio de auth en
producción, y encima compartido con Dynamic, así que se había planificado como el paso
riesgoso, al final y por separado. Bastó pedir `/auth/v1/.well-known/jwks.json` para ver
que **el proyecto ya firma con ES256 asimétrica**: la verificación ya podía ser local con
WebCrypto y no había nada que migrar. La fase estuvo a punto de partirse en dos y de
gastar una consulta a Felipe por un riesgo inexistente. Queda anotado en el ADR.

Verificado: `tsc`, `eslint`, 51 tests y `next build` en verde. **Sin desplegar**: quedan 6
commits sin subir y 3 son de otras sesiones — hacer push habría desplegado trabajo ajeno
sin su visto bueno. La medición real del antes/después queda pendiente del despliegue;
hasta entonces la mejora es una estimación, no un hecho.

## 2026-09-09 (paso "c": el sistema ya sabe deshacer)
Felipe eligió construir la anulación ANTES de darle credenciales de producción a las
sedes — el orden correcto: el botón de facturar llega cuando ya existe el de deshacer.
Investigado contra `docs.apisunat.pe/llms-full.txt`, no de memoria: SUNAT tiene DOS
caminos, no uno. Factura y notas van por comunicación de baja (`/api/v3/voided`);
las boletas NO se pueden dar de baja individualmente, van por resumen diario
(`/api/v3/daily-summary` con `accion_resumen: "anular"`). El adaptador ya excluía
`boleta` de su firma — quien lo escribió sabía que faltaba la otra mitad.

Construido (ADR-0016): `anularBoletaLucode` en el adaptador, ruta `/api/lucode/anular`,
RPC `anular_comprobante` con motivo obligatorio, `anulado_por` y `anulado_at`, y botón
+ modal en la fila. Tres reglas que valen más que el botón: "anulado" solo se escribe
cuando SUNAT lo confirma (si el resumen diario vuelve PENDIENTE, la fila dice "Anulación
en trámite"); no se anula un comprobante con notas vivas colgadas; y el sistema NO
decide el plazo — la doc de Lucode se contradice (3 vs 5 días) y SUNAT habla de 7, así
que se intenta y se muestra el rechazo textual del proveedor. Decisión de Felipe: anular
es solo de líder, y la regla vive en la RPC, no en la pantalla.

De paso se corrigió el nombre del campo del motivo en `/voided`: el adaptador mandaba
`motivo_de_anulacion`, que no aparece en ninguna página de la documentación; el
documentado es `motivo`. tsc, eslint y 51 tests en verde. **Nada de esto está probado
contra el sandbox real ni corrido en Postgres** — Docker sigue abajo.

**Lo que Felipe aprende acá:** cuando una API externa tiene dos caminos para lo que
parece una sola acción, meterlos en una función con un `if` adentro no simplifica: hace
que el próximo que lea el código asuma que anular una boleta y anular una factura son lo
mismo. No lo son — una es síncrona y la otra la procesa SUNAT después. El código debe
dejar ver la diferencia que el negocio ya tiene.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.** Archivos de esta
sesión: `ComprobantesPanel.tsx`, `lib/lucode.ts`, `lib/comprobantes.ts`,
`app/api/lucode/{emitir,anular}/route.ts`, `app/(app)/vender/facturacion/page.tsx`,
`packages/database/src/types.ts`, `supabase/migrations/0040_*` y `0041_*`,
`supabase/unificacion/23_*` y `24_*`, `docs/adr/0015-*` y `0016-*`, BACKLOG y BITÁCORA.

## 2026-09-09 (tarde — middleware → proxy, la convención de Next 16)
Felipe pidió saldar el aviso de deprecación antes de seguir con la Fase 1. Next 16
renombró `middleware` a `proxy`: cambia el nombre del archivo y el de la función, y nada
más — `config.matcher` y los tipos `NextRequest`/`NextResponse` quedan idénticos. No se
usó el codemod oficial (`npx @next/codemod@canary middleware-to-proxy .`) porque corre
sobre todo el repo y había trabajo sin commitear de otras sesiones en el mismo árbol; a
mano fueron dos renombres y `git mv`, así que el historial del archivo se conserva.

El renombre no es cosmético y quedó explicado dentro del propio archivo: "middleware" se
confundía con el de Express —algo que corre DENTRO de la app— cuando en realidad es una
barrera de red por DELANTE, en otro proceso y potencialmente en otra región. Esa
separación es exactamente la razón de que `cache()` de React no comparta nada entre este
archivo y el render, que fue el hallazgo del ADR-0013. Se anotó además una trampa que
trae la doc: las Server Actions no son rutas propias (viajan como POST a la ruta donde se
usan), así que un matcher que excluya esa ruta deja la acción sin cubrir — se verificó
que `app/actions/sede.ts` ya valida por su cuenta antes de afirmarlo en el comentario.

Se verificó en vivo, no solo compilando, porque acá el riesgo no es que el build falle
sino que compile y el guardia de sesión desaparezca en silencio: con el server local, una
ruta protegida sin sesión da 307 a `/login`, una ruta de API da 401 JSON (el caso especial
que evita que un `fetch` reciba el HTML del login) y `/login` da 200. El propio log de
Next nombra `proxy.ts` en su desglose de tiempos. Build sin el aviso, `tsc`, `eslint` y 51
tests en verde.

Hallazgo de paso, **solo local**: hay un `package.json` + `package-lock.json` sueltos en
`C:\Users\danyj\` (de una instalación del CLI de supabase) y Next infiere ESE directorio
como raíz del workspace en vez del repo. En Vercel no pasa —el contenedor de build no
tiene ese home—, así que no afecta producción. Se arregla con `turbopack.root` en
`next.config.ts`; se deja para la Fase 1, que va a tocar ese archivo igual.

## 2026-09-09 (taupe deja de ser color de texto — ADR-0017)
Primero de los dos pasos que pidió Felipe después del lateral. `--color-taupe`
(#a47865) da 3.39:1 sobre crema y 3.21:1 sobre `bg-sand/40`: reprueba AA en todos los
fondos donde se usa, y siete de sus nueve usos son información operativa, no adorno —
los chips "Estancado", "muestra", "tercerizado", la categoría de un activo, el score de
un proveedor. ADR-0012 no lo vio porque esos 9 usos viven en pantallas que necesitan
sesión y el barrido de esa vez solo midió lo visible sin login.

Se agregó `--color-taupe-profundo: #805c4c` — mismo tono (18.1°) y saturación, la
luminosidad baja de 52% a 40% — y se pasaron los 9 usos de texto. Da 5.23:1 sobre crema,
4.94 sobre sand/40 y 4.72 sobre su propio tinte; medido después sobre el DOM renderizado
en `/login`: 5.21. El borde `border-taupe/40` de OrdenesProduccion queda como estaba: un
borde no es texto. El matiz que quedó escrito en el ADR es que acá "profundo" NO
significa lo mismo que en ADR-0012 — verde y ámbar solo fallaban sobre su propio tinte,
taupe falla en todos lados, así que el profundo lo reemplaza en todo texto.

De paso me corregí a mí mismo: la firma "Donde el estilo transforma." la había puesto en
`tinta/65` en el lateral porque era el arreglo seguro sin token nuevo. Con el token
existiendo eso dejaba la misma frase de dos colores según la pantalla, así que las tres
apariciones (login, /mas, lateral) quedaron en `taupe-profundo`. tsc, eslint y 63 tests
en verde.

## 2026-09-09 (Fase 1 — lo que sí entró, y por qué `cacheComponents` no)
Fase 1 se planificó con tres piezas: caché del router, `cacheComponents` para que el
armazón aparezca al instante, y cachear `sedes` de verdad. Al ir a construirlas, dos de
las tres se cayeron por razones distintas, y ambas caídas son el contenido real del día.

**Lo que entró.** `staleTimes.dynamic = 30`: el default de Next es 0, así que volver
atrás a una pantalla ya vista repetía el render completo en el servidor — desde Perú
~400ms para ver algo que se acababa de mirar, y en el mostrador se navega Vender →
Inventario → Vender todo el tiempo. Subirlo es seguro por una disciplina que el repo ya
tenía: los 22 componentes que mutan algo llaman `router.refresh()` al terminar, lo que
invalida esa caché entera. Se verificaron uno por uno (venta, recepción de lote, gasto,
movimiento, caja) ANTES de subir el valor, no después. Y `turbopack.root`, que silencia
la inferencia equivocada de la raíz del workspace; se comprobó instrumentando la config
temporalmente para ver el path resuelto, en vez de asumir que `__dirname` apuntaba donde
uno cree.

**Lo que se cayó por medición, no por pereza.** `cacheComponents` no es un flag que se
prende: con él, `Date.now()` y `new Date()` durante el prerender son **error de build**, y
el escape `instant = false` explícitamente no los perdona. Este repo tiene **16 de esos**
en código de servidor, más **24 archivos** que llaman `requirePersonaActual()` → `cookies()`
y necesitarían cada uno su `<Suspense>`. Encima `<Activity>` cambia el ciclo de vida —el
estado sobrevive a la navegación, así que los 8 modales hay que revisarlos uno a uno. Es
una migración de casi todas las páginas, y hoy había otras sesiones con `app/(app)/page.tsx`,
`lib/panel.ts` y el rediseño del riel abiertos. Se difiere a su propia sesión con el árbol
quieto; Vercel publica una skill oficial para conducirla (`next-cache-components-adoption`).

**Lo que se descartó por ser inútil.** Cachear `sedes` globalmente sonaba obvio —5 filas
que no cambian nunca, pedidas en cada carga— pero al mirar el código no gana nada: ya sale
dentro del `Promise.all` de `requirePersonaActual`, **en paralelo con la consulta a
`personas`, que es por usuario y no se puede cachear**. Eliminar el viaje de `sedes` no
acorta la ruta crítica ni un milisegundo, porque el otro viaje de esa misma tanda sigue
ahí. Y hacerlo habría costado caro: `unstable_cache` corre fuera del contexto de request,
así que `cookies()` revienta adentro, y un cliente anónimo chocaría con la política
`sedes_select_autenticado`. Habría que debilitar RLS o meter una service key al proyecto
para ganar cero. Se anota como idea muerta para que no se vuelva a proponer.

## 2026-09-09 (0040 y 0041 corridas: el local no era lo que decía ser)
Al ir a correr las migraciones apareció que `supabase_migrations` registraba hasta la
0035 aplicada, pero `retail.comprobantes` no tenía `comprobante_original_id` ni
`motivo` (columnas de la 0034) y `emitir_nota` no existía. El número registrado y el
esquema real no coincidían — arrastre de la renumeración de migraciones que ADR-0009 ya
documenta. Y por el diseño de ADR-0010 (el seed renombra `public`→`retail` DESPUÉS de
migrar), `supabase migration up` no puede arreglarlo: aplicaría contra un `public`
vacío. La única salida es `db reset`, que Felipe autorizó con el costo medido — 1
comprobante de prueba, todo lo demás lo regenera el seed.

Reset corrido: las 41 migraciones aplican en orden. Verificado en Postgres real, no por
inspección: la restricción de ambiente y la de motivo quedan `VALIDADO` (el bloque que
las valida solas funcionó), y `actualizar_transmision_comprobante` tiene UNA sola firma
de 5 argumentos — el drop de la vieja evitó la sobrecarga que rompió PostgREST el 08-09.
Después, siete reglas probadas suplantando a la líder sembrada: aceptado sin ambiente
rechazado; anular un pendiente rechazado; anular sin motivo rechazado; anular con una
nota viva rechazado; baja en trámite deja el estado en "aceptado" y solo pone
`anulacion_solicitada_at`; baja confirmada escribe 'anulado' con motivo y `anulado_por`.

**El hallazgo que queda para el proyecto:** hay DOS stacks locales corriendo —
`cayla-retail` (API 54421 / DB 54422) y `cayla-dynamic` (54321 / 54322) — y
`apps/web/.env.local` apunta al de **Dynamic**, cuyo schema `retail` no tiene
`comprobantes` ni `series_comprobantes` ni `proformas`. O sea: el "local" que levanta
la app y el "local" que administra `supabase db reset` desde este repo NO son la misma
base. Por eso no se verificó la pantalla en navegador — y explica de dónde salía la
sensación de que "en local no se ve lo que acabo de migrar". No se tocó `.env.local`:
tiene los tokens de Felipe y la sesión de latencia está midiendo contra local ahora.

**Lo que Felipe aprende acá:** "está aplicado" no es un hecho hasta que lo dice la base,
no la tabla de migraciones. Acá el registro decía 0035 y el esquema decía otra cosa —
y ese desfase es justo lo que hace que una migración "ya probada" falle en producción.
Correrla contra un Postgres de verdad y preguntarle a `pg_constraint` y `pg_proc` qué
quedó es la diferencia entre creer y saber.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (Fase 2 — el motor de sincronización, decidido por un hallazgo de seguridad)
Con el punto 2 (`cacheComponents`) bloqueado por el árbol en movimiento, se pasó a resolver
lo que ADR-0013 había dejado abierto: qué motor de sincronización para local-first. Se
evaluaron los tres reales — ElectricSQL (solo lecturas, sobre replicación lógica),
PowerSync (bidireccional, el único con escrituras offline de primera) y Zero (bidireccional
server-authoritative con `zero-cache`).

ElectricSQL parecía la respuesta obvia: su modelo es solo-lectura, sin CRDT ni conflictos,
que es exactamente la forma que ADR-0013 había decidido. **Hasta que apareció el dato que da
vuelta todo: ElectricSQL no implementa RLS** — su equipo declaró que hasta la 1.0 dependen de
autorización por API. Y lo mismo, en distinto grado, vale para los tres: todos esperan que la
autorización viva en una capa propia delante de la base. Eso choca de frente con lo que este
proyecto ya escribió en `CLAUDE.md`: "la seguridad la resuelve RLS directamente, no una capa
de API separada". Adoptar cualquiera significaría reexpresar `stock_select_lider`,
`stock_select_propia_sede`, `fn_es_lider()` y `fn_sede_actual_persona()` como reglas de un
proxy — reescribir el modelo de seguridad para ganar velocidad de lectura.

Decisión (ADR-0018): **local-first a mano sobre lo que ya hay** — instantánea en IndexedDB +
Supabase Realtime para los cambios, que sí respeta RLS de fábrica. Sin servicio nuevo, sin
tocar la replicación del proyecto compartido con Dynamic, y con la autorización viviendo en
un solo lugar. Se acepta que es código propio: es código pequeño para datos pequeños (<1 MB
hoy), y la alternativa no era menos código sino menos código acá y un modelo de seguridad
nuevo allá.

Verificado antes de escribirlo como supuesto: la publicación `supabase_realtime` en
producción tiene **0 tablas**. Habilitarla es DDL sobre el proyecto compartido, así que es el
primer paso de la Fase 2 y necesita el visto bueno de Felipe, no ejecución directa.

**Y la precondición que importa más que todo lo anterior: la Fase 0 sigue sin desplegar.** El
"~700ms" es estimación, no medición. Construir el cambio de arquitectura más grande desde la
unificación encima de una línea base sin medir es justo lo que el método prohíbe. El ADR
queda escrito para que la decisión sea rápida cuando haya números — no para adelantarla.

## 2026-09-09 (Desplegable: el selector de sede deja el <select> nativo)
Segundo de los dos pasos. El `SedeSwitcher` era el último control de la cabecera con la
lista gris que dibuja Windows, al lado del buscador y del lateral que ya hablan la
gramática de CAYLA. El obstáculo real no era el estilo: `CampoSelect` es `Campo` +
combobox, y `Campo` dibuja un <label> y reserva alto fijo para el pie — meterlo en la
cabecera le sumaba ~30px de alto a la barra superior de TODAS las pantallas.

Se partió en dos en vez de agregarle un prop `compacto`: `Desplegable` es el control y
`CampoSelect` pasa a ser `Campo` + `Desplegable`. Un flag de modo adentro obliga a pensar
cada cambio futuro dos veces ("¿con etiqueta o sin?"); partirlo deja a cada pieza haciendo
una cosa. La API de `CampoSelect` quedó idéntica — su único consumidor, `ComprobantesPanel`,
no se tocó, y se verificó que su lista sigue midiendo exactamente el ancho del campo
(334px = 334px). El `Desplegable` toma dos formas: `campo` (se para sobre el hilo vivo) y
`pastilla` (se defiende con borde, para la cabecera), y dos anclajes de lista, porque el
disparador de la cabecera dice "TRU" y mide 65px — una lista de 65px no se puede leer.

El arreglo de fondo no es visual: mientras la app se repuntaba a la otra sede, lo único
que avisaba era un `disabled:opacity-50`, o sea nada. Ahora corre el barrido del hilo.
Verificado en navegador (ruta de prueba temporal, borrada al cerrar): lista anclada a la
derecha sin salirse de pantalla en 375px, Escape cierra y devuelve el foco, flechas+Enter
eligen, barrido corriendo a 1.1s, y `CampoSelect` sin cambios.

**Hallazgo del camino, y su corrección al cerrar la sesión:** `next build` falló dos veces
con "Uncached data accessed outside of <Suspense>" y después pasó cinco veces seguidas con
el mismo código. Supuse que no era mío, lo verifiqué con un A/B (stash → build → pop →
build) y tampoco era del A/B. Lo anoté como build intermitente, culpando a un supuesto
"Cache Components activado por defecto en Next 16.2" que salía en el banner.

**Eso era falso, y se descubrió al auditar el cierre.** El banner ya no lo dice: la sesión
paralela tenía `cacheComponents` prendido en el árbol de trabajo justo en esa ventana,
probándolo, y después lo sacó (ver la entrada "Fase 1 — lo que sí entró, y por qué
`cacheComponents` no", más arriba). Nunca fue intermitente ni mío: era el árbol compartido
cambiando debajo. Se borró el pendiente equivocado del BACKLOG — duplicaba, encima mal, el
que esa sesión ya había dejado bien escrito. La lección para dos sesiones en paralelo sobre
un mismo working tree: un build que falla puede no ser del código de nadie, sino del
minuto. tsc, eslint, 63 tests y 5 builds seguidos en verde.

## 2026-09-09 (23 y 24 en producción: (a) y (c) cerrados salvo la prueba con Lucode)
Antes de pasarle el SQL a Felipe se verificó contra producción que los tres supuestos de
los archivos fueran ciertos: que `retail.es_lider()` y `retail.puede_operar_sede(uuid)`
existan con esos nombres, y que `actualizar_transmision_comprobante` tuviera hoy la
firma de 4 argumentos que el `drop` apunta. Los tres, correctos — el round-trip que
costó la primera migración post-unificación (03-09) esta vez no pasó.

Felipe pegó las dos. Confirmado leyendo la base: una sola firma de 5 argumentos (sin la
sobrecarga que rompió PostgREST el 08-09), las 6 columnas, y
`comprobantes_anulado_tiene_motivo` en VALIDADO.

**Lo que la verificación encontró de paso:** `retail.comprobantes` NO estaba vacía como
decía el backlog — tiene **B004-000002** (boleta, S/10.00, aceptada, transmitida el 08-09
17:35 Lima). Por eso `comprobantes_transmitido_tiene_entorno` quedó NOT VALID, que es
justo lo que el bloque `do $$` estaba diseñado para hacer sin romper el script. Nadie
sabe si esa boleta salió al SUNAT real o al sandbox: es el agujero que ADR-0015 cierra,
llegado un día tarde. No se rellenó a mano — se resuelve mirando el panel de Lucode.
Consecuencia para (b): la serie B004 de TRU va por el número **3**, no el 2 del backlog.

**Lo que Felipe aprende acá:** una migración se verifica ANTES de pegarla, no solo
después. Los tres `select` contra `pg_proc` que corrieron primero costaron un minuto y
son la diferencia entre pegar sabiendo y pegar a ver qué pasa — sobre todo en un esquema
que no es el propio, donde el nombre de una función (`fn_es_lider` en local,
`es_lider` en producción) no es el mismo.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (el "+ Nuevo" es un menú, no un diálogo — ADR-0019)
Tercero y último de los pendientes que quedaron del lateral. La pregunta "¿lo migramos a
`Modal`?" se había reabierto tres veces (ADR-0003 lo dejó afuera a propósito, ADR-0014 lo
resolvió a medias), así que esta vez quedó como ADR en lugar de comentario. La respuesta
es no, y no por ahorrar: atrapar el foco es el patrón de un DIÁLOGO. Un menú hace lo
contrario — el tabulador lo cierra y sigue de largo.

Lo que seguía roto no era la falta de trampa de foco: era que Tab recorría las cinco
opciones y después seguía por la app de atrás, tapada por el velo pero entera tabulable.
Quien navega con teclado terminaba escribiendo en un formulario que no podía ver. Se
implementó el patrón menu button completo: `role="menu"`/`menuitem`, `aria-haspopup="menu"`
en los dos disparadores, flechas con vuelta, Inicio/Fin, Espacio (Enter ya andaba solo,
son `<a>`), tipeo para saltar, y Tab cerrando. El teclado es el mismo de `CampoSelect`:
se levantó de ahí, no se inventó, así que se comporta igual.

Una diferencia con la letra del patrón, asumida: la W3C dice que Tab mueve al siguiente
elemento de la página; acá devuelve el foco al botón que abrió. Cuesta un Tab más y evita
arrastrar para siempre un buscador de "próximo tabulable" por un menú de cinco opciones.
Verificado en navegador con ruta de prueba temporal (borrada al cerrar): flechas con
vuelta en los dos sentidos, Inicio/Fin, "b" saltando a "Bajar a tienda", Espacio navegando
de verdad, y Tab y Escape cerrando con el foco de vuelta en el botón sin caer en el enlace
de atrás. tsc, eslint y 63 tests en verde. Con esto quedan cerradas las tres cosas que el
lateral había dejado anotadas.

## 2026-09-09 (b1: la primera llamada real encontró dos bugs que la doc tapaba)
El plan era poner el token en Vercel. Antes de eso apareció un riesgo de orden que había
que decir: el deploy vivo llama a `actualizar_transmision_comprobante` con 4 argumentos y
producción ya solo tiene la de 5 (por la migración 23 recién pegada). Poner el token sin
desplegar el código habría hecho lo peor posible — transmitir el documento a SUNAT y
fallar al guardarlo. Hoy no pasa solo porque la ruta corta antes, en `sin_credenciales`.
Y desplegar exige pushear 19 commits, 14 de otras sesiones, incluida una reescritura de
auth que su propia sesión marcó "pendiente de desplegar". Felipe eligió probar en local.

No se pudo levantar el dev (ya corría otro `next dev` de otra sesión, PID 37052, y Next
no permite dos para el mismo directorio; no se mató su proceso). Así que se probó lo
único que de verdad estaba sin verificar: el contrato con Lucode, llamando al sandbox
con el adaptador REAL del repo, no con un payload inventado.

**Encontró dos bugs que solo una llamada real podía mostrar.** La documentación describe
mal el cuerpo de LOS DOS endpoints de anulación: ninguno acepta la forma plana. Boleta
necesita `{documento:"resumen_diario", documentos_afectados:[...]}` y factura
`{documento:"comunicacion_baja", motivo, documento_afectado:{...}}`. Los errores no
ayudaban: `Undefined array key "documentos_afectados"` uno, `El campo documento
seleccionado no es válido` el otro. Corregidos y reprobados: los dos devuelven `ok`.

**Y confirmaron la decisión más discutible de ADR-0016:** los dos caminos responden
PENDIENTE, no ACEPTADO — el de boletas lo dice con todas sus letras, "firmado
correctamente, pero aún no ha sido validado por la SUNAT". O sea que "Anulación en
trámite" no era un caso raro del resumen diario: es el camino normal de toda anulación.
Si la RPC hubiera escrito 'anulado' con el primer 200, el sistema estaría dando por dado
de baja algo que SUNAT ni miró.

**Lo que Felipe aprende acá:** la documentación de un proveedor es una hipótesis, no un
hecho. Estos dos bugs pasaron tsc, eslint, 63 tests y una revisión de esquema completa —
ninguna de esas herramientas puede saber qué espera un servidor ajeno. La única prueba
que valía era la llamada, y costó diez minutos. Fíjate el orden que salvó esto: se probó
en SANDBOX antes de poner el token de producción, así que el precio de estar equivocado
fue cero.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (el Inicio: pasos 0 y 1 — y la red de seguridad que nunca funcionó)

Rediseño del Inicio contra cómo lo resuelven los ERPs serios (cues de Dynamics 365,
KPI Scorecard de NetSuite, Activities de Odoo). Del plan de 6 pasos entraron dos.
**Paso 0:** `getPanelLider` dejó de releer `stock` entero con su join a `variantes`
para sumar el inventario a costo — ahora lo saca de las variantes que la pantalla ya
cargó. El Inicio era la pantalla más visitada y la que más leía. Efecto de lado que
vale más que el rendimiento: el inventario a costo del Inicio y el de Comercial salen
del mismo cálculo, así que ya no pueden discrepar. **Paso 1:** las 4 cifras pasaron a
`TarjetaIndicador` (la de Finanzas, extendida con dos huecos opcionales: `ayuda` y
`pie`), con mini-línea de 14 días y comparativo. Decisión de Felipe: el inventario a
costo ahora **incluye el almacén**, con una línea chica que lo dice — la mercadería
recibida y sin bajar es la plata más dormida que hay, esconderla la volvía invisible.

**Lo que Felipe aprendió y no era obvio:** un porcentaje necesita dos cosas del mismo
tamaño. El comparativo no es contra ayer sino contra el mismo día de la semana pasada
**y solo hasta esta misma hora**: a las 10am ninguna tienda vendió su día entero, así
que comparar contra el día completo pinta un rojo permanente por las mañanas que no
significa nada. En TRU, que vende casi todo entre 5 y 8 de la tarde, ese número mal
hecho se aprende a ignorar en una semana. La aritmética de "qué día es esto" en hora
de Lima salió a `lib/panel-serie.ts` (puro, sin Supabase) con 12 pruebas que fijan los
bordes donde UTC y Lima no coinciden — una venta a las 11pm en Trujillo cayendo en el
día equivocado no rompe nada, solo deja la cifra mal, en silencio.

**El hallazgo de la sesión, que no era del Inicio:** `retail.recalcular_stock()` —lo
que ARQUITECTURA.md §4.2 llama la red de seguridad del inventario— **nunca pudo correr
en una base con ventas.** Insertaba las salidas como `-sum(cantidad)` confiando en que
el `on conflict do update` las restara de la fila existente, pero Postgres evalúa los
CHECK sobre la fila PROPUESTA antes de detectar el conflicto: `stock_cantidad_no_negativa`
la rechazaba antes de que el update llegara a existir. Confirmado con una reproducción
de 4 líneas, no por deducción. Arreglado calculando el neto por (variante, sede) en una
sola pasada (ADR-0020, `0042` local + `unificacion/25` sin pegar). De paso salió un
segundo defecto del mismo tamaño: el `truncate` de la versión vieja borraba también
`stock_minimo` y `contenedor_id`, que no se derivan de `movimientos` — arreglar solo el
error de Postgres habría entregado algo peor, una función que ahora sí corre y borra en
silencio los mínimos de cada sede.

**Tres trampas de entorno que costaron media hora y valen más que el tiempo perdido:**
(1) hay **dos** `.env.local` —el de la raíz, restos de un `vercel env pull` con los
valores literales `"[SENSITIVE]"`, y el de `apps/web`, que es el que Next lee—; diagnostiqué
sobre el equivocado y llegué a una conclusión falsa antes de corregirme. (2) El servidor
de desarrollo tiene `NEXT_PUBLIC_SUPABASE_URL` **exportada en su terminal**, y en Next eso
le gana al archivo: `apps/web/.env.local` dice `:54321` (stack de dynamic) pero la app
habla con `:54421` (stack de retail). Se resolvió mirando `auth.users.last_sign_in_at` en
las dos bases, no razonando. (3) `retail.stock_almacen` **no existe en local** — solo la
crea `unificacion/12`, que es de producción — así que la línea del almacén no se puede
verificar acá. Cuarto caso del patrón de migraciones duales.

Y para poder ver funcionar algo alguna vez: `supabase/seed-demo.sql`, opt-in (no está en
`config.toml`), 28 ventas en 14 días con forma, una prenda que dispara "reponer ya" y otra
estancada. Respeta la regla: inserta `movimientos` con su fecha real y deriva `stock`, nunca
escribe una cantidad a mano.

**SESIÓN EN CURSO — quedan los pasos 2 a 6 del Inicio.** Lo de esta parte es seguro de
commitear: `lib/panel.ts`, `lib/panel-serie.ts` (+ pruebas), `components/TarjetaIndicador.tsx`,
`app/(app)/page.tsx`, `supabase/migrations/0042`, `supabase/unificacion/25`, `supabase/seed-demo.sql`,
`docs/adr/0020`.

## 2026-09-09 (Inicio, paso 2 — la bandeja de pendientes: estado vs. acción)

El Inicio pasa a tener dos mitades con naturalezas distintas, y la diferencia es
lo que hace útil el bloque nuevo. Las 4 tarjetas de arriba describen un ESTADO
("vendiste S/306", "3 de 3 cajas abiertas"). La bandeja de abajo lista ACCIONES:
cosas con consecuencia si nadie las hace hoy. Seis, cada una con su contador y su
enlace a la pantalla donde se resuelve — patrón "Activity Cues" de Dynamics 365:
comprobantes rechazados por SUNAT, comprobantes emitidos y nunca transmitidos,
cajas que amanecieron abiertas, producción terminada sin inventariar, producción
pasada de su fecha de entrega, y órdenes de compra que ya debieron llegar.

**Lo que Felipe aprendió y no era obvio:** el valor del bloque está en cuándo NO
aparece. Un tablero que muestra "0 pendientes · 0 rechazados · 0 atrasados"
enseña a ignorar esa zona de la pantalla, y el día que salga un número real ya
nadie lo mira. Así que si no hay nada que hacer, el bloque no existe — verificado
en vivo neutralizando las seis condiciones y recargando: desaparece entero, sin
encabezado huérfano. De la misma familia es la decisión de dónde va el rojo: solo
lo llevan los tres que tienen plazo legal o dinero suelto (SUNAT × 2 y la caja
sin cerrar). Si se pintara todo, el rojo dejaría de significar nada.

Eso obligó a corregir algo del paso 1: la tarjeta "Cajas" pintaba de rojo toda
caja cerrada, pero una caja cerrada de noche es lo normal, no una alerta. Ahora
la tarjeta dice el estado sin rojo ("3 de 3 abiertas") y la alerta de verdad —una
caja que lleva días abierta— vive en la bandeja. Dos reglas más que quedaron
escritas: una orden de compra SIN `fecha_estimada` no se marca atrasada nunca
(no sabemos cuándo debía llegar, y avisar de algo que quizá no lo está es la
forma más rápida de que la bandeja pierda credibilidad), y un comprobante
emitido HOY y todavía sin transmitir tampoco cuenta: sigue en el flujo normal.

El seed de demostración se extendió para poder ver todo esto (comprobante
rechazado con su código real de SUNAT, uno sin transmitir, caja de LIM abierta
hace 3 días, dos corridas del Taller y una orden de compra vencida). De paso
dejó registrada una trampa real: al sembrar comprobantes a mano hay que mover
`series_comprobantes.siguiente_numero`, o la primera boleta emitida desde la
pantalla choca contra el `unique(tipo, serie, numero)` — el mismo problema que
dejó B004-000001 en producción el 05-09.

## 2026-09-09 (Inicio, paso 3 — el traslado deja de mirar el cero y mira el límite)

El paso iba a ser el más barato del plan: mostrar `alertasTraslado`, que
`inteligencia.ts` calculaba desde que existe y no leía ninguna pantalla —
trabajo pagado y tirado, cero consultas nuevas para rescatarlo. Al explicarle a
Felipe la limitación del algoritmo (solo avisa con una sede en CERO exacto, así
que una tienda con 1 unidad de algo que vuela no aparece nunca), decidió
cambiar la regla: **que el aviso lo dispare el límite que cada sede fija, no el
cero.**

Lo bueno es que ese límite ya existía entero y nadie lo estaba aprovechando:
`stock.stock_minimo` se fija por sede desde `/producto/[varianteId]` con la RPC
`fijar_stock_minimo` (componente `MinimosPorSede`, Fase B), pero solo alimentaba
"reponer ya". El traslado lo ignoraba. O sea que la función que Felipe pedía ya
estaba a medio construir hacía meses, en el lado del negocio, sin conectar.

**Lo que Felipe aprendió y no era obvio:** cambiar un umbral obliga a cambiar
también la explicación. Con la regla vieja el motivo era evidente y no había
nada que decir ("está en cero"). Con un límite configurable, el mismo número
significa cosas distintas en cada tienda: 2 blusas están bien en una sede con
límite 1 y mal en una con límite 5. Por eso la línea ahora dice el porqué —
"TRU tiene 2, su mínimo es 5"— y no solo el número. Un aviso configurable que no
dice contra qué se configuró es un aviso que nadie sabe si creer.

Dos decisiones que se tomaron de paso, ambas consecuencia de la de Felipe y no
opcionales: (1) `max(límite, 1)` conserva el comportamiento viejo donde nadie
fijó un límite, así que nada de lo que avisaba hoy deja de avisar — y respeta lo
que `MinimosPorSede` le promete a la usuaria, que vacío significa "usa el mínimo
general", no cero; (2) el origen tampoco puede quedar por debajo del suyo:
tapar un hueco abriendo otro no es una sugerencia, es mover el problema de
tienda. Y el orden pasó a ser por lo que le FALTA al destino, no por lo que le
sobra al origen: lo urgente es el hueco, no el excedente.

## 2026-09-09 (b2 ya estaba hecho, y el circuito completo se probó solo)
Al ir a poner `LUCODE_TOKEN` en Vercel, el CLI respondió que la variable ya existía.
`vercel env ls`: `LUCODE_TOKEN` y `LUCODE_ENTORNO=produccion` estaban puestas desde
hacía 19 horas — Felipe las configuró la noche del 08-09 y no quedó anotado. El backlog
seguía diciendo lo contrario, que es el mismo agujero de "nadie sabe qué está aplicado"
que ya nos costó un reset local hoy.

Eso explica de dónde salió B004-000002: del deploy, no de la máquina de Felipe. Y
apareció **B004-000003** (09-09 11:57) con `entorno_transmision='produccion'` ya escrito
— un dato que SOLO puede escribir la RPC de 5 argumentos. Cruzado con las horas de los
deploys (11:50:31 el del push, 12:07:16 un redeploy), queda probado que el circuito
completo funciona en producción: pantalla → Lucode → SUNAT → base, con el código nuevo.

**Mi error del día, para que quede:** dije que el deploy seguía sirviendo código viejo.
Falso. Estaba leyendo una copia de CDN cacheada antes de las 11:50 (`X-Vercel-Cache:
HIT`, `Age: 192`) y usando una clase CSS como marcador, que es un indicador frágil. El
marcador bueno lo declara el propio HTML: `data-dpl-id`, que `vercel inspect` ata al
deployment exacto. Un chequeo indirecto que da negativo no prueba nada; solo prueba que
el chequeo era malo.

**Lo que Felipe aprende acá:** la configuración también es estado del sistema, y también
envejece sin avisar. Dos veces en un día el repo dijo una cosa y la realidad otra — las
migraciones en local, y estas variables. Ninguna de las dos se descubrió por una alerta:
las dos salieron porque alguien fue a mirar. Escribir "ya lo configuré" cuesta diez
segundos y es lo único que evita que la próxima sesión trabaje sobre un mapa viejo.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (la primera anulación real, y el botón que faltaba para cerrarla)
Felipe emitió B004-000003 como prueba a las 11:57:11 y la anuló a las 11:58:49 — ocho
minutos después de que el deploy con el código nuevo entrara en producción. El botón
funcionó a la primera y quedó en "Anulación en trámite", que es lo correcto: el panel de
Lucode muestra ese mismo documento como **ANULANDO**. Nuestro estado resultó ser espejo
del suyo sin que nadie lo hubiera coordinado.

Pero ahí se vio el hueco: nada podía sacarla de "en trámite". El botón "Anular" se
esconde cuando hay una baja pedida —para que nadie la pida dos veces— y la otra mitad no
existía. Un documento real atascado por diseño. Se construyó
`/api/lucode/consultar-anulacion` + botón "Consultar" en las filas en trámite.

**Lo que salvó la consulta en vivo.** Antes de escribir el lector se consultó
`/api/v3/status` contra producción: devuelve `estado: "ANULANDO"`. Lucode tiene un
vocabulario de anulación distinto al de emisión, y `traducirEstado` manda a PENDIENTE
todo lo que no reconoce — o sea que habría leído un `ANULADO` real como "sigue en
trámite" para siempre. El botón nuevo no habría cerrado nada nunca, y el síntoma sería
"consulto y no pasa nada". Por eso `interpretarEstadoAnulacion` es función propia, pura
y con 5 tests. tsc, eslint y 68 tests en verde.

**Lo que Felipe aprende acá:** dos sistemas pueden usar la misma palabra para cosas
distintas y ninguno de los dos avisa. "Estado" en la emisión significa qué dijo SUNAT del
documento; "estado" en la anulación significa qué dijo SUNAT de la baja. Reusar el lector
por parecido de forma es el error clásico — el código habría compilado, pasado todos los
tests y fallado en silencio. La única forma de saberlo era preguntarle al servidor de
verdad, antes de escribir el lector y no después.

**SESIÓN TERMINADA — es seguro commitear y pushear esta parte.**

## 2026-09-09 (tarde — medir la cosa equivocada tres veces seguidas)
Con la Fase 0 desplegada se fue a comprobar la región y salió `iad1` tres veces. Se
descartó el plan (Hobby permite una región; y resultó que la cuenta es Pro, con cinco),
se descartó el timing de build, y se llegó a acusar a la ubicación de `vercel.json` —
"mi apuesta estuvo mal"— cuando Felipe confirmó que el Root Directory sí era `apps/web`,
o sea que el archivo estaba bien puesto desde el principio.

**El error era el método, no la configuración.** Las tres rutas medidas —`/login`,
`/inventario`, `/api/padron`— las responde el **proxy** o el CDN antes de llegar a
ninguna función de página: estático con `X-Vercel-Cache: PRERENDER`, 307 al login, y 401
JSON respectivamente. Y Vercel despliega el proxy al borde justamente para resolver
redirects rápido. O sea que `X-Vercel-Id: iad1` habría salido igual con la región
perfectamente cambiada. Se verificó que **no existe ninguna ruta que ejecute función de
página sin sesión**: `/auth/*` está exento del guardia pero no tiene handler, y todo lo
demás lo intercepta el proxy.

Lo zanjó una captura del panel: el badge **"Overridden"** en Function Regions es Vercel
avisando que `vercel.json` sobreescribe el ajuste del panel — prueba de que el archivo SÍ
se lee, en `apps/web/`, donde estaba. La región es `gru1`. Bonus del mismo panel: Fluid
Compute está encendido, así que las instancias se reutilizan y el JWKS que `getClaims()`
descarga queda cacheado entre peticiones en vez de re-pedirse por invocación.

**La lección, que es la que vale:** una medición que no puede distinguir entre "funcionó"
y "no funcionó" no es una medición. Las tres rutas daban el mismo número en ambos mundos,
y aun así se sacaron conclusiones de ellas —y se acusó a un archivo inocente— durante tres
rondas. Antes de medir hay que preguntarse qué se vería si el cambio SÍ hubiera funcionado.

**Segunda corrección, más incómoda: el "~2 s" original nunca se midió.** Salió de la
percepción de Felipe más la cuenta de 4 viajes de red, y el "~700 ms después de Fase 0"
era una estimación encima de esa estimación. Lo que sí está medido: 0.86 ms de ejecución
en base, ~95 ms de RTT Perú↔São Paulo, ~400-430 ms de respuesta del borde, y 2 de los 4
viajes eliminados. De ahí sale la recalibración honesta: como `getClaims()` ya quitó dos
viajes, la región puede ahorrar la mitad de lo estimado (~250-350 ms), no lo que se dijo.
Y no mejora el `/login` de 430 ms, que es CDN y no depende de la región de funciones.

**Sigue sin medirse lo único que importa:** el TTFB de una pantalla CON sesión iniciada.
Es el número que todo este trabajo pretende bajar y nadie lo ha tomado nunca.

## 2026-09-09 (por fin la medición real: la región funcionó y el costo no está en los datos)
Con permiso de Felipe se midió desde su propio navegador, con sesión iniciada — lo único
que faltaba y que ninguna medición anterior podía dar.

**La región funcionó.** `x-vercel-id` en una petición que SÍ ejecuta función devuelve
`iad1::gru1::…` — **dos** segmentos: el primero es el borde que recibió, el segundo es
dónde ejecutó. `gru1` = São Paulo. Las mediciones con `curl` daban un solo segmento
porque las respondía el proxy o el CDN sin llegar nunca a la función.

**La pantalla real, con sesión:** navegación completa a `/inventario` con TTFB de **131 ms**
y carga total de **750 ms** (HTML de 9.3 kB, conexión reutilizada). Forzando render dinámico
por RSC: TTFB ~300-400 ms, total ~390-500 ms. O sea: el sistema está entre **300 y 750 ms**,
no en los ~2 s que se venían asumiendo. Ese "~2 s" nunca existió como medición.

**Y el hallazgo que manda:** se midieron cuatro rutas de peso muy distinto y **no hay
correlación entre lo que la pantalla hace y lo que tarda**. `/mas` (47 líneas, casi solo
enlaces, 11 kB) tardó 409 ms; `/comercial`, la más pesada del sistema (24.5 kB, catálogo +
inteligencia + ABC + traslados), tardó 297 ms. La liviana es la más lenta.

Eso significa que lo que queda **no es trabajo de datos: es sobrecosto fijo por petición** —
consistente con los 0.86 ms que tarda la base. Y explica la estructura que queda: la
petición entra por `iad1` (Washington) aunque la función corra en `gru1`, así que cada carga
hace Perú → Washington → São Paulo → Washington → Perú. El desvío del borde no lo
controlamos; la región de la función sí, y ya está donde debe.

**Consecuencia para la Fase 2, y es a favor:** como el costo es por-petición y no por-dato,
cachear datos no ayudaría — lo que ayuda es **no hacer la petición**, que es exactamente lo
que hace local-first. El diagnóstico de ADR-0018 sobrevive a la medición. Lo que cambia es
la magnitud del premio: pasa de "arreglar un sistema roto" a "volver instantáneo un sistema
que ya responde decente". Eso ya no es decisión técnica, es de Felipe.

## 2026-09-09 (la red de seguridad corre por primera vez y encuentra 2 filas)

Felipe pegó `unificacion/25` en producción y corrió la verificación: **2
diferencias**. `retail.stock` y `retail.movimientos` llevaban meses discrepando
en dos filas sin que nadie pudiera enterarse, porque la única herramienta capaz
de detectarlo —`recalcular_stock()`— no podía ni ejecutarse (ADR-0020). Revisado
después: las 10 filas de stock siguen siendo 10 y **todas tienen entre 1 y 5
movimientos detrás**, así que no se borró nada; la función corrigió dos
cantidades hacia el neto de la fuente de verdad. Las filas eran SKUs de prueba
de la unificación (`A`, `B`, `T281d432ae4f`), no catálogo real.

**Lo que Felipe aprendió, y vale más que el arreglo:** una verificación puede
destruir su propia evidencia. La que escribí guardaba el estado previo en un
`create temporary table`, y el SQL Editor de Supabase corre cada ejecución en
una conexión distinta del pool — la tabla murió al terminar la primera consulta.
Resultado: se supo que había 2 diferencias y ya no había con qué mirarlas. Eso
es peor que no tener verificación: cuando todo cuadra da confianza, y cuando NO
cuadra deja ciego justo en el momento que importa. La regla que queda: una
verificación que compara "antes y después" tiene que persistir el "antes" en
una tabla real, y borrarla a mano al final. Corregido en `unificacion/25`.

Segunda lección, del push de hoy: verifiqué tres commits y se subieron cuatro.
Entre el chequeo y el `git push` otra sesión commiteó sobre el mismo `main`
local. La verificación era correcta cuando se hizo y quedó vieja al ejecutar.
En un repo donde varias sesiones commitean a la misma rama, "verifico y después
pusheo" tiene una ventana abierta: hay que fijar el rango y pushear ese SHA
(`git push origin <sha>:main`). El cuarto commit resultó inofensivo —revisado
después, usa `getClaims()` y `mapearRol()`, patrones que ya corrían en
producción— pero eso fue suerte, no proceso.

## 2026-09-09 (robustez: las pantallas que mentían)
Felipe pidió el sistema "lo más robusto posible" y sugirió local-first para agilizarlo. Se
le marcó la tensión antes de tocar nada: **robusto y ágil no son lo mismo, y local-first
los empuja en direcciones opuestas** — agrega una segunda copia de la verdad en cada
navegador, que es exactamente una forma nueva de tener estados imposibles (principio 2).

Como nadie usa el sistema todavía, se auditó la robustez en vez de la velocidad. El
resultado: **20 consultas descartaban el error de Supabase, 1 lo revisaba, y no había una
sola error boundary en toda la app.** El camino de escritura sí estaba bien —la venta
revisa el error del RPC y lo muestra—, el problema era todo el de lectura.

Lo grave no es que una pantalla se caiga: es que NO se caiga. `const { data } = await
supabase...` deja `data` en null al fallar, el código hace `data ?? []`, y la pantalla
dibuja vacío con cara de normalidad. Si fallaba la consulta de `ventas`, el Estado de
Resultados mostraba **S/0 en ventas** y un Líder concluía que no vendió nada.
`getCatalogoConStock` hacía `return []`: CAYLA sin una sola prenda. Una pantalla caída se
nota; una que miente, no.

Felipe eligió el comportamiento "depende de la pantalla", que es el que corresponde:
`exigir()` lanza para plata, stock y catálogo; `tolerar()` deja seguir con aviso para
listados de apoyo. Vive en `lib/resultado.ts` con la regla escrita para elegir entre los
dos. Aplicado a los tres cimientos + dos barreras de error nuevas.

Anotado con honestidad: el `Promise.all` de Finanzas lo había escrito yo esa misma mañana
optimizando velocidad, y mantuve intacta su forma de fallar callada. Y **la barrera no se
pudo probar en vivo**: llegar a ella exige sesión iniciada porque el layout redirige antes
de renderizar. Está en la ruta correcta y el build la registra, pero eso no es lo mismo
que verla atrapar — la misma distinción que hoy costó tres rondas con la región.

## 2026-09-09 (el punto medio: rápido sin abrir la puerta a conflictos)
Felipe pidió las tres cosas juntas — rápido, robusto, y sin que queden cosas en el aire ni
haya conflictos — y preguntó si había un punto medio. Lo hay, y la distinción que lo define
es la que resuelve su preocupación: **local-first guarda una COPIA de los datos (dos
verdades que sincronizar, pueden divergir); el punto medio guarda una RESPUESTA RECIENTE
del servidor (una sola verdad, solo puede ser vieja).** En cinco palabras: datos viejos,
nunca datos distintos. Un dato viejo se corrige con el siguiente refresco y su antigüedad
tiene techo; un dato distinto es un estado imposible, que es lo que prohíbe el principio 2.

Parte ya estaba andando sin que se notara: el `staleTimes: 30` de la Fase 1 hace que volver
a una pantalla vista hace menos de 30 s no vaya al servidor, y cualquier mutación lo
invalida vía `router.refresh()`.

Faltaba la otra mitad, y era un hueco claro: `/inventario` y `/vender` hacían `await` de
TODO antes de devolver JSX. La cabecera, la navegación y los botones —que no dependen de
ninguna consulta— esperaban detrás del catálogo entero. Ahora la página solo espera la
persona (memorizada por el layout, sin viaje nuevo) y el resto baja en su `<Suspense>` con
esqueleto. En `/vender` se partió en dos: el historial del día era una consulta chica que
esperaba al catálogo entero solo por compartir `Promise.all`.

Salió el primer caso real de `tolerar()`, y vale como ejemplo de cómo se aplica la regla:
el historial de `/vender` muestra dinero pero no lo decide —el cuadre lo calcula
`cerrar_caja` en el servidor contra `ventas`, no contra esa lista—, y fallar en duro ahí
significaría dejar a una Encargada sin poder vender, con la clienta enfrente, porque no
cargó un historial. Ese intercambio no se paga. → ADR-0021.

Detalle técnico que casi se me pasa: los anchos del esqueleto son fijos y no aleatorios.
`Math.random()` en un Server Component daría un valor distinto en servidor y cliente, y
React lo marcaría como desajuste de hidratación.

Pendiente y anotado: extenderlo a `/comercial`, `/finanzas/*`, `/produccion` y `/buscar`
—es mecánico—, y **verlo funcionar en vivo**. Compila y pasa 68 pruebas, pero que la
estructura aparezca antes que los datos hay que verlo corriendo con sesión iniciada. Es la
misma distinción entre "compila" y "funciona" que hoy mismo costó tres rondas con la región.

## 2026-09-09 (Inicio, paso 4 — la actividad, y tres choques de sesiones en una hora)

`movimientos` es la fuente de verdad del inventario desde el primer día y
ninguna pantalla la había mostrado nunca en orden cronológico. Ahora el Inicio
cierra con las últimas 8: hora, sede, qué pasó, prenda, cantidad, monto y quién.
Las de hoy muestran solo la hora; las anteriores, el día — leer "18:30" sin
saber de qué día es peor que un texto más largo. Es un bloque de naturaleza
distinta a los otros dos: no pide nada (eso es la bandeja) y no resume nada (eso
son las tarjetas); responde "¿qué está pasando?", que para un Líder en Lima que
no ve el piso de Trujillo hoy solo se responde por teléfono.

Las etiquetas del feed se escribieron aparte de las de `MovimientoModal` a
propósito: las del modal son instructivas ("Otro (especificar en nota)") porque
guían a quien registra, y leídas de corrido en una lista sobran. Son dos
redacciones del mismo dominio para dos usos, no una duplicación — pero van
tipadas contra el mismo enum de `@cayla-retail/shared`, así que un motivo nuevo
no compila hasta traducirse en ambos lados.

**Lo que Felipe aprendió, y no fue del código:** hoy se cruzaron tres sesiones en
el mismo árbol y cada cruce enseñó algo distinto.

(1) **El servidor de desarrollo cambió de base sin que nadie lo tocara.** Su
`NEXT_PUBLIC_SUPABASE_URL` venía exportada en la terminal donde se levantó —y en
Next eso le gana al archivo—; al reiniciarse, pasó a leer `apps/web/.env.local`,
que apuntaba al stack de cayla-dynamic (`:54321`) en vez del de este repo
(`:54421`). Síntoma: "tu cuenta no está vinculada a ningún integrante", con los
datos intactos. Se resolvió mirando en qué puerto responde el bundle servido, no
razonando. El archivo quedó corregido: local ya no depende de una variable
invisible.

(2) **Un error tragado convierte una falla en un dato falso.** Otra sesión hizo
que `getCatalogoConStock` fallara en voz alta (`exigir`), y eso tumbó el Inicio
en local con `Could not find the table 'retail.stock_almacen'`. No era un bug
nuevo: era el agujero que este mismo backlog anotó por la mañana, invisible seis
días porque el error se descartaba y el almacén se veía "vacío" — indistinguible
de "no hay nada guardado". Su cambio es correcto; lo que hizo fue encender la luz.

(3) **Dos sesiones resolvieron el mismo problema a la vez, con el mismo número.**
Esa sesión escribió `0042_almacen_interno.sql` mientras yo escribía
`0043_almacen_interno_local.sql`, y el 0042 ya estaba tomado por
`0042_recalcular_stock_neto.sql`, pusheado horas antes. `npx supabase db reset`
falló con `duplicate key ... schema_migrations_pkey` y local quedó bloqueado para
todos. Se resolvió por asimetría, no por gusto: **lo pusheado no se renumera, lo
no commiteado sí** — renumerar una migración que alguien ya aplicó rompe su
historial. Se borró mi versión (la suya era superior: 385 líneas contra 89, y de
paso arregla que `unificacion/12` partió de un cuerpo anterior a `0011` y perdió
la línea que sella `stock.ultima_venta`) y se renumeraron los suyos a `0044` y
`unificacion/26`, sin tocarles una línea de SQL.

La regla que queda de las tres: en un repo con sesiones paralelas, el número de
migración es un recurso compartido y hay que pedirlo mirando `origin`, no el
directorio local.

## 2026-09-09 (streaming extendido: 8 de 10 pantallas)
Se aplicó el patrón de ADR-0021 al resto: `/buscar`, `/produccion`, `/comercial` y tres de
Finanzas (`efectivo`, `patrimonio`, `activos`), sumadas a `/inventario` y `/vender` que ya
estaban. Ocho pantallas donde la estructura ya no espera a los datos.

`/buscar` fue el caso con más efecto: el título sale de lo que la Encargada acaba de
escribir y esperaba a que cargara el catálogo ENTERO para dibujarse — con la pistola Zebra
eso se siente como si el escaneo no hubiera entrado. Lleva además `key={term}` en el
boundary, deliberado: sin él, cambiar de búsqueda reusa el boundary ya resuelto y se
siguen viendo los resultados VIEJOS mientras llegan los nuevos, sin señal de carga. Y su
consulta de stock pasó a `exigir()`: decir "sin coincidencias" porque falló una consulta
mandaría a alguien al almacén a buscar algo que sí está.

Las tres de Finanzas comparten forma (cabecera + `FinanzasNav` + secciones), así que
salieron con una sola transformación mecánica. **`egresos` y `comparativo` no**: sus
cabeceras sí dependen de datos calculados —navegación de meses, selector de sede— y el
corte automático las rompió. Se intentaron, falló `tsc`, y se revirtieron limpias en vez de
forzarlas. Quedan para tratarse una por una, junto con `/finanzas` y `/finanzas/balances`.

Se limpiaron tres variables que quedaron sin uso tras mover código a los componentes hijos
(`ventanaDias` en comercial, `persona` en efectivo, `supabase` en producción). eslint sin
warnings, tsc, 68 pruebas y `next build` en verde.

Sigue sin verificarse en vivo que el streaming se vea: hace falta sesión iniciada. Es lo
primero al desplegar.

## 2026-09-09 (streaming completo: las 10 pantallas)
Se cerraron las cuatro que faltaban. Todas tenían cabeceras que dependían de valores
calculados, por eso el corte mecánico que sirvió para efectivo/patrimonio/activos las
rompía; se hicieron una por una. En `/finanzas` y `/finanzas/balances` el título y las
flechas de mes esperaban a que se calcularan los CUATRO estados financieros completos solo
para poder decir "Septiembre 2026".

`/finanzas/comparativo` salió mejor que el resto y vale la pena por qué: se partió en TRES
boundaries en vez de dos. El selector de sedes es **navegación**, no dato — hacerlo esperar
significaría no poder cambiar de tienda hasta que cargue la tabla— y solo necesita
`getSedes()`, memorizada, así que quedó instantáneo. El editor de históricos y la
comparación van cada uno por su lado, y el editor usa `tolerar()`: si falla su consulta se
oculta el botón en vez de tumbar la pantalla, porque sembrar históricos es una tarea
ocasional del Líder que no debería impedir mirar el comparativo.

Dos veces el script automático dejó las variables en el lado equivocado del corte (las
constantes de estilo de `balances`, el `eerr` de `finanzas`). `tsc` lo cazó las dos veces;
se revirtieron limpias y se rehicieron a mano en vez de parchear.

`tsc` y `eslint` limpios sobre lo tocado, 68 pruebas en verde. El `next build` completo no
pasa en este momento, pero por trabajo en curso de otra sesión en `app/(app)/page.tsx`
(`getPanelLider` cambió de firma), no por esto — verificado revisando que ningún error
apunte a los archivos de esta tanda.

## 2026-09-09 (Inicio, pasos 5 y 6 — un inicio por rol, y el código de sede como fuente de bugs)

El Inicio tenía dos ramas y hacían falta tres. La persona del Taller caía en la
de la Encargada, que le ofrece Vender, Bajar a tienda y el estado de la caja:
tres cosas que en el Taller no existen. Y encima, por el bug de abajo, en
producción ni siquiera veía el enlace a Producción.

**Lo que Felipe aprendió y no era obvio:** el bug no estaba en el `if`. `AppShell`
y `/mas` preguntaban `sedeCodigo === "TALLER"`, y tras la unificación el Taller se
llama **LIM** en producción — `unificacion/01_sedes.sql:35` lo mapea a
`tipo=fabrica` justamente porque su código no es TALLER. La causa raíz es que el
CÓDIGO de una sede no sirve para decidir nada (cambia entre local y producción) y
cada pantalla lo re-deducía por su cuenta. Tres copias de la misma pregunta, dos
equivocadas. Se arregla exponiendo `sedeTipo` en `PersonaActual`: una sola
respuesta, en el sitio que ya buscaba la sede. `/produccion` llevaba meses
haciéndolo bien y sirvió de modelo — la pista estaba en el propio repo.

La otra decisión de fondo fue no volver a filtrar por sede en TypeScript. RLS ya
acota las filas a la sede de quien mira, así que las tres funciones del panel
sirven a los dos roles sin cambio. Filtrar de nuevo en el código habría sido
mantener dos copias de la misma regla, y esas copias siempre se desincronizan.
Solo se filtra a mano donde RLS no puede saber la intención: la lista de cajas
(`getSedes()` devuelve todas y la Encargada vería dos tiendas ajenas siempre
cerradas) y QUÉ pendientes tienen sentido por rol — a una Encargada no le toca
perseguir una orden de compra ni una corrida del Taller. Verlas sin poder hacer
nada con ellas es la forma más rápida de que deje de mirar el bloque.

El seed suma los otros dos usuarios (`encargada@` y `taller@`). Hasta hoy esos dos
inicios no se podían ver funcionar porque no había con quién entrar — el mismo
agujero que el seed vino a tapar para los datos, ahora para los roles.

## 2026-09-09 (la caja aprende a que la escaneen, y los errores dejan de hablar Postgres)
Se analizó el apartado D del documento *el estándar, los doce y el camino* — la
comparativa no funcional de 16 sistemas— y se rescataron las celdas de 5/5, que son
el estándar que alguien ya alcanzó. Nadie saca 5 en las cinco dimensiones: Square
llega a tres y se cae en soporte y apertura; Loyverse llega a tres y se cae en
belleza y apertura. Contrastado contra el repo, CAYLA ya tiene dos casi regaladas
(belleza ≈5, español =5) y una medida y decente (velocidad, 131 ms TTFB). La más
floja resultó ser **facilidad de aprendizaje** — y es justo donde INVY, marcado en
el propio documento como "nuestro competidor", ya saca 5. Felipe eligió esa.

**El hallazgo que justifica la sesión entera:** el buscador del modal de venta era
un `<input>` dentro de un `<form>` con botón submit y **sin `onKeyDown`**. La pistola
Zebra tipea el SKU y da Enter sola —es lo que ya hace funcionar `/buscar` sin
configurar nada—, así que en la caja ese Enter caía en el envío implícito del
formulario: con el carrito vacío mostraba "El carrito está vacío", y **con el
carrito ya cargado registraba la venta a mitad del escaneo**. El equipo ya había
aprendido el gesto de escanear; la única pantalla donde no servía era la de vender.

**Lo que Felipe aprendió y no era obvio:** que `lib/resultado.ts`, del mismo día,
solo cubría la mitad del problema. Arregló las **lecturas** que fallaban en silencio
y dejó escrita la regla —"sin jerga de Postgres, que no le sirve de nada y la
asusta"— pero del lado de la **escritura** no había equivalente: 29 llamadas en 17
componentes mostraban el texto crudo, incluida la pantalla de más presión del
sistema. Nace `lib/error-escritura.ts` (ADR-0022) como hermano suyo, y lo que lo
define es lo que decide NO tocar: los `raise exception` de las RPC ya están en
castellano de CAYLA y pasan palabra por palabra, porque re-escribirlos dejaría dos
textos que se pueden desincronizar — la misma trampa que ADR-0018 evitó al no
duplicar las reglas de RLS. Traduce solo lo que escribe Postgres por su cuenta, y lo
que no reconoce no se lo traga: cae con el texto original detrás de "Código:".

Verificado: build, lint, `tsc --noEmit` y 77 pruebas (9 nuevas, una por huella).
**Sin verificar en vivo** —y anotado en BACKLOG— el escaneo con la pistola real: el
layout redirige al login y no corresponde que Claude escriba la contraseña.

## 2026-09-09 (medición post-despliegue: el streaming NO mejoró los tiempos)
Se empujaron los 4 commits del streaming (solo hasta `7fe820c`; el commit de la sesión del
Inicio se dejó sin subir porque esa tanda seguía abierta) y se midió en el navegador de
Felipe, con sesión iniciada.

**Lo que sí se confirmó:** la función ejecuta en `gru1` (`x-vercel-id: iad1::gru1::…`), el
streaming funciona de verdad —el HTML trae el marcado del esqueleto y la respuesta llega en
**3 trozos**, no en uno—, y el despliegue nuevo estuvo vivo 40 s después del push.

**Lo que NO se cumplió, y hay que decirlo:** los tiempos no se movieron.

| | Antes | Después |
|---|---|---|
| TTFB `/inventario` | 131 ms | 124 ms |
| Carga total | 750 ms | 730 ms |

Eso está dentro del ruido. **El streaming no produjo una mejora medible de tiempo**, y la
razón es la misma que ya había aparecido midiendo por rutas: entre el primer byte y el HTML
completo solo hay ~100 ms. Casi todo el tiempo está ANTES del primer byte. El streaming solo
puede repartir lo que viene DESPUÉS — y ahí había poco que repartir.

Queda como resultado negativo medido, no como intuición: **el cuello no es cuándo llegan los
datos, es el peaje fijo por petición** (Perú → borde en Washington → función en São Paulo →
y de vuelta). Lo único que atacó eso de verdad fue el cambio de región.

Lo que el cambio sí hace, y no es tiempo: antes la pantalla mostraba un "Cargando…"
centrado mientras esperaba TODO; ahora muestra la cabecera, la navegación, los botones y un
esqueleto con la forma del contenido. Es una mejora de qué se ve durante la espera, no de
cuánto dura. Se mantiene por eso —y porque el `tolerar()` de `/vender` es robustez
independiente de la velocidad—, pero **deja de contarse como ganancia de velocidad**.

## 2026-09-09 (la medición que redirige todo: el cuello es el cliente, no la red)
Se midieron en el navegador de Felipe las dos cosas que faltaban.

**`staleTimes: 30` funciona.** Navegando con clics reales entre `/vender` e `/inventario`:
la primera ida y vuelta hizo 1 petición `?_rsc=` cada una; **la segunda hizo CERO**. La
caché del router sirve la pantalla sin tocar el servidor. Confirmado.

**Y ahí apareció lo que da vuelta el diagnóstico del día: con CERO peticiones de red, la
navegación sigue tardando ~1000 ms.**

| Navegación | Peticiones | Tiempo |
|---|---|---|
| 1ª ida a /vender | 1 | 1447 ms |
| 1ª vuelta a /inventario | 1 | 1004 ms |
| 2ª ida a /vender | **0** | 1010 ms |
| 2ª vuelta a /inventario | **0** | 993 ms |

Con red y sin red tarda lo mismo. Se descartó que fuera la capa de animación midiendo con
`textContent` (existe apenas React monta el nodo) además de `innerText` (solo cuando ya es
visible): ambos dan ~1000 ms, así que no es el CSS, es el montaje.

**Consecuencia:** todo el trabajo del día —región, viajes de red, cascadas, streaming— atacó
el camino del SERVIDOR. Y el tiempo que la Encargada siente al tocar un enlace está dominado
por ~1 s de trabajo del CLIENTE que nada de eso toca. Es el mismo error de forma que ya se
cometió dos veces hoy: optimizar donde se estaba mirando en vez de donde estaba el costo.

Esto también recalibra local-first una vez más: eliminar la petición no bajaría de ~1 s si
el montaje del árbol de React sigue costando eso. **Antes de cualquier otra cosa de
rendimiento hay que perfilar el cliente** — cuánto de ese segundo es hidratación, cuánto son
los 37 componentes marcados `"use client"`, y cuánto el tamaño del árbol.

**La barrera de error sigue sin verificarse.** Se intentó forzarla con
`/producto/esto-no-es-un-uuid`, pero esa ruta maneja el caso y devuelve 404 correctamente
—buen comportamiento, pero no ejercita el boundary—. Forzar un fallo real de consulta en
producción exigiría romper algo a propósito; queda pendiente probarlo en local con sesión.

## 2026-09-09 (CORRECCIÓN: no hay cuello en el cliente — era mi instrumento)
**La entrada anterior está equivocada y se corrige acá.** Se afirmó que la navegación tardaba
~1000 ms incluso sin red y que el cuello se había mudado al cliente. Falso, y el error fue de
medición otra vez.

El detector usaba `setInterval(…, 8)` para vigilar cuándo cambiaba la pantalla. **Chrome
estrangula los temporizadores a uno por segundo en pestañas de segundo plano** —y la pestaña
lo estaba, porque se conducía por automatización—, así que el detector solo podía comprobar
una vez por segundo. De ahí el "~1000 ms" clavado en las cuatro mediciones: era el período de
mi propio reloj, no la duración de la navegación. La pista que lo delató estaba en los datos y
casi se pasa por alto: `latidos_registrados: 0` — un intervalo de 16 ms que no se ejecutó ni
una vez en un segundo es imposible salvo que esté estrangulado.

Repetido con `MutationObserver`, que corre en microtareas y es inmune a ese
estrangulamiento:

| Navegación | Peticiones | Tiempo real |
|---|---|---|
| 1ª a /vender | 1 | 1634 ms |
| 1ª a /inventario | 0 | 441 ms |
| 2ª ida y vuelta | 0 | **7 ms y 7 ms** |
| 3ª ida y vuelta | 0 | **6 ms y 6 ms** |

**Una pantalla ya visitada se abre en 6-7 ms.** `staleTimes: 30` no solo funciona: es, con
diferencia, el cambio más efectivo de todo el día — y estuvo a punto de darse por inútil por
un error de medición propio.

Recalibra local-first una vez más, y ahora hacia abajo: para navegación repetida la caché del
router ya entrega 6 ms, así que local-first no compraría velocidad ahí. Lo que sí añadiría es
sobrevivir más allá de los 30 s y funcionar sin internet. Ese es todo su valor restante, y
hay que decidirlo con eso en la mano.

**Tercer error de medición del día, de la misma familia:** medir el instrumento en vez de la
cosa (el proxy en vez de la región; el tiempo posterior al primer byte sin comprobar cuánto
había; ahora el período del temporizador). La defensa que funcionó las tres veces fue la
misma: desconfiar de un número sospechosamente redondo o idéntico y buscar con qué se vería
distinto si la hipótesis fuera falsa.

## 2026-09-09 (organización del inventario, bloques 0 y 1 — contar hacia abajo ya se puede)

Arranca el proyecto de organizar el inventario y traer los 300-900 SKUs reales de una vez.
Felipe decidió: censo big-bang, **solo el piso** de las 3 tiendas, **costo por modelo** (no
por talla/color), **código corto nuevo** (`BLU-0042-AZM-M`), y las Encargadas cuentan mientras
él aprueba antes de que entre nada. Dato que cambia el diseño: **casi todas las prendas ya
traen código de barras de fábrica** — el censo puede escanear desde el minuto uno en vez de
imprimir y pegar 900 etiquetas primero.

**Bloque 0 (`0044_almacen_interno.sql` + `unificacion/26_…`):** `stock_almacen`, el contenedor
`tipo='almacen'`, `bajar_a_piso` y `devolver_a_almacen` solo existían en producción desde el
3-sep; ahora están en el riel numerado y `npx supabase db reset` deja una base local igual a
la de producción. Y en el camino apareció la deriva inversa: al reescribir
`fn_aplicar_movimiento` para el almacén, `unificacion/12` partió de un cuerpo anterior a
`0011` y **perdió el `ultima_venta`**. En producción esa columna existe y nadie la escribe, así
que "Días sin venta" viene midiendo la edad de la variante desde que se creó — todo el catálogo
aparece estancado para siempre. `unificacion/26` la restaura y hace backfill desde `movimientos`.

**Bloque 1 (`0045_ajuste_con_signo.sql` + `unificacion/27_…`, ADR-0023):** era **imposible
registrar un conteo menor a lo que dice el sistema**. No por `min={1}` en la pantalla, que era
el síntoma: la rama `ajuste` proponía la fila con el delta y el CHECK se evalúa sobre la fila
propuesta. El mismo bug de ADR-0020, a cincuenta líneas de la función que ese ADR daba por
segura. Peor: producción **nunca tuvo** `stock_cantidad_no_negativa`, así que allá no habría
explotado — habría creado stock negativo en silencio. Se arregla con
asegurar→bloquear→verificar→sumar y se ponen las tres redes que faltaban.

**Lo que aprendió Felipe:** que escribir la regla en un ADR no basta — ADR-0020 dejó anotado el
patrón peligroso y aun así la tercera ocurrencia estaba dentro de la misma función que ese ADR
declaraba a salvo; hay que ir a buscar todas las apariciones el mismo día. Y que un error que
avisa vale más que uno que no: el mismo defecto era ruidoso en local y silencioso en producción,
y el silencioso es el caro.

**Choque de sesiones paralelas, otra vez** (como el 5-sep). Mientras se escribía esto, otra
sesión comiteaba `0042_recalcular_stock_neto.sql` y ADR-0019 a 0022 sobre los mismos archivos.
Se resolvió de forma aditiva —mis migraciones se renumeraron a `0044`/`0045` y `recalcular_stock`
quedó con la versión de ADR-0020 *extendida* para conocer el almacén, no reemplazada— pero
conviene no tener dos sesiones en el mismo módulo a la vez.

## 2026-09-09 (segunda mitad del aprendizaje: los callejones sin salida)
Cerrada la dimensión que faltaba del apartado D. Ocho estados vacíos decían que no
había nada y ahí terminaban; ahora cada uno nombra dónde se resuelve. La regla que
se siguió al escribirlos vale más que los textos: **se verificó componente por
componente dónde vive de verdad cada acción antes de nombrarla**. Ahí apareció que
`/finanzas/activos` solo LEE `activos_fijos` — ninguna pantalla de la app los crea,
entran a mano por SQL. El estado vacío lo dice tal cual en vez de sugerir un botón
que no existe, y el hueco quedó en BACKLOG. Un estado vacío que apunta a un lugar
equivocado es peor que uno que no apunta a ninguno.

Uno no se tocó a propósito: `/finanzas/registrar` ya decía "Corre la migración 0020
en Supabase". Suena a jerga, pero el lector real de esa pantalla es el Líder, o sea
Felipe. Lo que ya está bien dicho para quien lo lee no se reescribe.

Cinco botones (!) nuevos en Inventario, Recibir mercadería y Buscar. Los 38 que ya
existían estaban TODOS en pantallas del Líder —Balances 13, Comercial 3, Producto
5—: la ayuda del sistema estaba escrita para quien lo mandó a construir, no para
quien lo usa ocho horas al día.

**Lo que Felipe aprendió y no era obvio:** al intentar verificar en su Chrome, el
sistema rebotó con `sin_persona` — la cuenta tiene usuario en Auth local pero no
fila en `personas`. No es un bug del código: es que `supabase/seed.sql` solo siembra
`felipe@cayla.local`, y cualquier otro correo entra a Auth sin quedar ligado a un
integrante. El mensaje del login ya lo explicaba bien ("Pide a un Líder que te dé de
alta"), que es exactamente el trabajo que esta sesión vino a hacer en el resto de la
app: el error correcto se ve como una instrucción, no como una falla.

## 2026-09-09 (el traductor llega a los 17 componentes, y destapa dos mudos)
`traducirError` quedó aplicado en los 31 sitios de escritura del repo. El grep de
`error.message` fuera de `lib/error-escritura.ts` ya no devuelve nada. Cada sitio
nombra su acción en idioma de negocio —"registrar el depósito", "cerrar la orden al
inventario", "convertir la proforma en comprobante"— y eso obligó a leer qué hacía
cada función antes de nombrarla, que es la parte que un reemplazo mecánico se salta.
En `OrdenesProduccion` el envoltorio `llamar()` recibe ahora el nombre de la acción:
un mensaje genérico en las tres RPC de la orden no habría orientado a nadie.

**El hallazgo:** dos escrituras no mostraban el error, se lo tragaban enteras.
`ComprasManager.cancelar` y `RecetaCosto.quitarItem`, las dos con el mismo
`if (!error) router.refresh()`. Se tocaba "Cancelar" o "Quitar", no pasaba nada, y no
había manera de saber por qué. Es exactamente la falla que `lib/resultado.ts` arregló
en las lecturas el mismo día —la pantalla que miente en vez de caerse— viva del otro
lado y sin que la auditoría de robustez la viera, porque esa auditoría buscaba
`select` descartando su error, no `insert`.

**Lo que Felipe aprendió y no era obvio:** el heurístico de "insertar el import
después del último `import`" partió dos archivos por la mitad. `RegistrarGastoModal` y
`RegistroContableForm` tienen imports multilínea, y la línea nueva cayó DENTRO de la
llave abierta. Lo atrapó `tsc` en el acto con siete errores de sintaxis por archivo,
no una revisión visual. La lección no es "no automatizar": es que un cambio mecánico
sobre 17 archivos necesita una verificación mecánica detrás, y acá el compilador es
esa red — build, lint, tsc y 77 pruebas antes de commitear, siempre en ese orden.


## 2026-09-09 (verificada la robustez, y con un fallo real en vez de un simulacro)
Se montó un entorno aparte para probar las barreras sin tocar el trabajo de otras sesiones:
worktree propio (porque Next no permite dos `dev` en el mismo directorio y había uno
corriendo), `pnpm install` ahí, y el servidor levantado con las variables del Supabase LOCAL
pasadas en línea — sin crear ningún `.env`, para no cambiarle el entorno a nadie si reinicia.
Dos intentos fallaron antes: `--dir` no existe en `next dev`, y Turbopack rechaza un
`node_modules` enlazado por junction ("points out of the filesystem root").

**Y entonces apareció algo mejor que la prueba planeada: un fallo de verdad.** El overlay de
Next mostró exactamente esto:

```
No se pudo leer las sedes: JWT issued in the future
  exigir        lib/resultado.ts (42:11)
  <anonymous>   lib/sedes.ts (32:22)
  <anonymous>   lib/persona.ts (54:26)
```

`exigir()` atrapó un fallo genuino —desfase de reloj entre el contenedor de Supabase local y
la máquina— y lanzó con el contexto en idioma de negocio ("las sedes"), no con jerga de
Postgres. **Antes de este cambio, `getSedes()` habría devuelto `[]` en silencio** y la app se
habría dibujado sin ninguna sede, sin un solo aviso: exactamente la falla silenciosa que se
auditó esta mañana, reproducida sola.

Y debajo del overlay, la pantalla real:

```
CAYLA
El sistema no pudo arrancar
Esto no es un problema de tu computadora. Reintenta; si sigue igual, avisa a Felipe.
REINTENTAR      Código: 1080313944
```

`global-error.tsx` verificado en vivo, con su botón y su código para los logs.

**Lo que sigue sin ejercitarse:** `(app)/error.tsx`, la barrera de sección. El fallo ocurrió
en el layout, así que sube a la global sin pasar por ella — que es el comportamiento correcto,
pero deja esa otra sin probar. La maquinaria de boundaries queda demostrada por la global.

**Hallazgo de entorno para Felipe, no del código:** el Supabase local tiene el reloj adelantado
respecto a la máquina, y eso rompe el login local con "JWT issued in the future". Cualquiera
que intente levantar el entorno local se va a topar con esto hasta reiniciar el contenedor.

Todo lo montado quedó desmontado: servidor detenido, worktree eliminado, página de prueba
borrada, `git status` limpio de rastros propios.

## 2026-09-09 (organización del inventario, bloques 2 y 3 — el color deja de ser texto libre y la prenda tiene varios códigos)

**Bloque 2 (`0046_colores.sql` + `unificacion/28`, ADR-0024).** `variantes.color` era texto
libre sin restricción. Con cuatro Encargadas capturando 900 prendas en paralelo iban a nacer
"Azul marino", "azul marino", "AZUL MARINO" y "marino" — cuatro colores para la base, uno para
la clienta. Lo que decide hacerlo AHORA es lo que cuesta después: unificar dos colores no es un
`update` de texto, es **fusionar variantes** con stock e historial, o sea escribir movimientos
para arreglar una falta de ortografía. 29 colores aprobados por Felipe, con un índice único
sobre el nombre normalizado que hace imposible el duplicado ortográfico — lo rechaza la base,
no un `if` en el cliente. **No se hizo tabla de tallas**, y la asimetría es el argumento:
agregar tallas tarde es barato (no es FK de nada), agregar colores tarde es caro.

**Bloque 3 (`0047_codigos.sql` + `unificacion/29`, ADR-0025).** El código corto `BLU-0042-AZM-M`
al lado del SKU, que no se toca. El argumento que cierra la discusión no es estético: **la
etiqueta no entra**. `EtiquetasGenerator` estira el Code 128 al ancho de la etiqueta sin
importar cuántos módulos tenga, así que un SKU de 40 caracteres da 1.2 puntos por módulo a 300
dpi cuando la regla térmica es ≥3. Ésa es la razón real de que la pistola a veces no lea. El
código corto da 3.1. Más `variantes_identidad_unica`, que es lo que impide que cuatro personas
creen la misma prenda cuatro veces el primer día del censo.

**La pieza que más cambia el proyecto: `codigos_barras`.** Como casi todas las prendas ya traen
código de fábrica, una tabla donde una prenda puede tener VARIOS códigos convierte el censo de
"imprimir y pegar 900 etiquetas antes de escanear nada" a "escanear lo que ya está en la
percha". Y de yapa el backfill registra el `sku` viejo, así que toda etiqueta ya impresa sigue
funcionando el día que cambiemos de nomenclatura. Verificado: tres códigos distintos
(`BLU-0001-AZM-M`, el sku viejo, y un EAN `7501234567890`) resuelven a la misma prenda.

**Lo que aprendió Felipe:** que un backfill es la mitad fácil del problema. La primera versión
registraba los códigos con un `insert … select` al final — cubría el pasado y nada mantenía el
futuro: una variante creada al día siguiente quedaba con código pero sin ser escaneable. Lo
encontró una prueba, no una revisión. Se movió el registro dentro de la única función que acuña
códigos, y así el invariante se sostiene solo. Misma lección que ADR-0023, dos veces en el
mismo día: escribir la regla no alcanza, hay que ponerla donde no se pueda saltear.

**Nota de sesiones paralelas:** esta vez salió bien. La otra sesión construyó **sobre** el
bloque 1 (`ce51374`: tradujo al castellano las dos redes que trajo `0045`) en vez de chocar.

## 2026-09-09 (cierre: las tres pruebas pendientes, todas en verde)
Con el Supabase local reiniciado por Felipe, se probaron las tres cosas que quedaban. Entorno
montado otra vez en un worktree aparte (Next no permite dos `dev` en el mismo directorio) con
las variables pasadas en línea, sin crear ningún `.env`.

**Tropiezo del que vale aprender:** el primer intento seguía fallando, ahora con "Invalid
schema: retail". La causa era mía: estaba apuntando al puerto **54321**, el default de
Supabase, cuando `supabase/config.toml` de este repo define la API en **54421**. Es decir,
estuve hablando todo el rato con OTRA instancia local de Supabase que también corre en esta
máquina. El síntoma —"el schema retail no existe"— parecía un problema del repo y era un
puerto equivocado. Mismo patrón del día: el instrumento apuntando al lugar equivocado.

Con el puerto correcto, entrando como Líder (la sesión de `localhost` se comparte entre
puertos, así que se heredó la de Felipe):

1. **`(app)/error.tsx` — la barrera de sección.** Página de prueba que lanza desde `exigir()`:
   sale "NO SE PUDO CARGAR / Esta pantalla no está mostrando datos", con Reintentar, Volver al
   inicio y el código para logs. Y el detalle que confirma que es la de SECCIÓN y no la
   global: el contenido salió dentro de `<main>` **con la navegación intacta** — solo se
   reemplazó la pantalla, no la app entera.

2. **`tolerar()` — la franja de aviso.** Rompiendo a propósito la consulta del historial de
   `/vender` (columna inexistente, solo en el worktree): la caja **sigue operativa** —"Abre la
   caja de AQP", con su botón— y debajo la franja: "No se pudo cargar las ventas de hoy. Lo
   demás de esta pantalla sí está al día. Puedes seguir vendiendo con normalidad." Es
   exactamente el intercambio que Felipe eligió: nunca dejar a una Encargada sin vender por un
   historial.

3. **El arreglo de `actions/sede.ts`.** El selector cambió de AQP a TRU y la pantalla lo
   siguió ("VENDER · TRU", "Abre la caja de TRU"). Antes del arreglo esto no hacía nada en
   local, en silencio, porque la acción comparaba contra `'admin'` y en local el rol es
   `'lider'`.

Con esto queda verificado en vivo TODO lo construido hoy salvo lo ya medido en producción.
Entorno desmontado: servidor detenido, worktree eliminado, repo principal sin rastros.

## 2026-09-09 (por fin sabemos qué corrió, y lo primero que dijo fue malo)
Nace `scripts/migraciones/` — una consulta que se pega en el SQL Editor y devuelve el
inventario de objetos vivos, y un verificador que lo compara contra lo que promete
cada uno de los 75 archivos SQL del repo. Responde el ítem que el BACKLOG llamaba "la
deuda que produce todas las anteriores". Sin dependencias nuevas y sin credenciales
nuevas: usa el camino de pegar-en-el-editor que el repo ya usa para producción, y en
local habla con el contenedor del `supabase start`.

Lo que define su diseño no es lo que detecta sino lo que se le prohíbe afirmar: la
AUSENCIA es certeza, la PRESENCIA solo dice que existe algo con ese nombre —
`create or replace` se repite entre archivos, así que encontrar `fn_aplicar_movimiento`
no dice cuál de sus cinco versiones está viva. Y lo que no supo leer lo declara: cuatro
archivos salen como "sin promesas detectables", no como aprobados.

**El hallazgo de la primera corrida, y es serio:** cuatro funciones tienen dos o tres
firmas vivas al mismo tiempo. `registrar_movimiento` con 10 y 12 argumentos,
`recibir_lote` con 6, 7 y 8, `registrar_produccion` con 11, 13 y 15,
`crear_producto_con_variantes` con 7 y 8. Probado con `explain`, que no ejecuta nada:
una llamada que solo nombra los parámetros comunes devuelve `function is not unique`.
En la base local eso significa que **una devolución al almacén funciona y un ajuste,
una merma o un traslado normal no** — `MovimientoModal` solo manda `p_contenedor_id`
cuando es devolución, y `supabase-js` borra del JSON las claves `undefined`.

**Lo que Felipe aprendió y no era obvio:** `create or replace function` con un
argumento NUEVO no reemplaza nada — crea una segunda función y deja viva la vieja. Eso
ya estaba documentado en ADR-0009, pero como anécdota de una migración; resultó ser un
patrón repetido cuatro veces. Y explica dos cosas que este BACKLOG venía atribuyendo a
otra causa: que `recibir_lote` no aparezca en los tipos generados, y que
`RecibirLoteForm` "siempre falla cuando se usa". Desde hoy, toda migración que cambie
la firma de una función lleva su `drop function` de la vieja con los tipos explícitos
(ADR-0026). El arreglo en producción NO se hizo: es DDL en el proyecto compartido con
Dynamic, o sea parar-y-confirmar.

## 2026-09-09 (el arreglo de las firmas duplicadas, con candado)
Escrita `0049_una_sola_firma_por_funcion.sql` y su gemelo `unificacion/31`. Se queda
siempre la firma más nueva, que se verificó una por una contra lo que la app manda de
verdad: `registrar_movimiento` de 12 porque `MovimientoModal` manda `p_contenedor_id`,
`recibir_lote` de 8 por `p_orden_produccion_id`, `registrar_produccion` de 15 por
`p_costo_maquila` y `p_fecha_entrega`, `crear_producto_con_variantes` de 8 por
`p_proveedor_id`. Aplicado en local: las cinco formas de llamada resuelven y el
verificador ya no reporta sobrecargas.

**Lo que Felipe aprendió y no era obvio:** un script que borra cosas necesita un
candado que le impida borrar la ÚLTIMA. Antes de eliminar cada firma vieja se comprueba
que la nueva existe; si no está —producción recibió las migraciones pegadas a mano, no
con `db reset`, así que puede tener otra combinación— no borra nada y avisa. Sin ese
candado, correrlo contra una base con solo la firma vieja habría dejado la función sin
ninguna implementación: pasar de "dos y no se sabe cuál" a "ninguna" no es limpiar, es
romper. Y sin `cascade`, a propósito: si algo depende de una firma vieja, que falle y se
vea, no que se lleve el dependiente por delante.

Segundo detalle de oficio: el gemelo termina con un `select` que muestra una tabla de
estado, no con `raise notice`. El SQL Editor de Supabase no siempre enseña los notices,
y un script destructivo que corre sin decir qué hizo es un script que nadie va a querer
correr dos veces. Probado corriéndolo dos veces: la segunda no cambia nada.

Producción no se tocó: es DDL en el proyecto compartido con Dynamic.


## 2026-09-09 (organización del inventario, bloque 4 — el censo es el primer conteo)

`0048_conteos.sql` + `unificacion/30` + ADR-0027. Dos tablas (`conteos`, `conteo_lineas`) y
siete RPC. **La idea que sostiene todo:** un conteo que puede crear prendas al vuelo es un
censo, y un censo sobre un catálogo ya cargado es un conteo — son la misma operación. Por eso
no hay código de "carga inicial" que se use una vez y se abandone.

**El permiso que hace posible el censo, verificado con una Encargada real de AQP.** Abre el
conteo, crea "Blusa Reflixme M Azul marino" al vuelo adoptando su código de fábrica
`7501111111111`, y cuenta 4. Intenta cerrar: *"Solo un líder puede cerrar un conteo — es la
aprobación de lo contado"*. **El stock se quedó en 0 hasta que Felipe cerró.** Eso es
exactamente lo que Felipe pidió: las Encargadas cuentan, él aprueba, y recién ahí entra.
Comparación en la misma prueba: la puerta vieja (`crear_producto_con_variantes`) sí la rechaza.

**La decisión más fina, y la que más fácil se hacía mal: `cantidad_sistema` se congela al
contar, no al cerrar.** Sistema 10 → a las 15:00 cuenta 8 → a las 15:30 se vende 1 → cierra a
las 16:00. Con el sistema congelado: 8−10 = −2 sobre 9 = **7**, correcto. Leyendo el sistema al
cerrar: 8−9 = −1 sobre 9 = 8, y **la venta desaparece**. Un conteo afirma un instante, no el
presente. Probado reproduciendo el escenario entero.

Y `ajuste` con signo en vez de un `tipo='conteo'` nuevo, por una razón que vale anotar:
`recalcular_stock` conoce cuatro tipos y nada más, así que un tipo nuevo quedaría excluido EN
SILENCIO — el día que alguien corriera la red de seguridad para arreglar otra cosa, el censo
entero se borraría. Bug latente que estalla meses después.

**Lo que aprendió Felipe:** que una prueba que falla no prueba que el código esté mal. La
primera corrida dijo "FALLA — la venta se perdió"; el código estaba bien y la **aserción**
estaba mal (conté 3 sobre 10 y esperaba el resultado de contar 8 sobre 10). Averiguar cuál de
los dos miente es parte del trabajo, no un trámite — y en este caso la respuesta correcta era
volver a correr el escenario exacto del diseño, no cambiar el código para que la prueba pasara.

**Confirmación de un hallazgo ajeno:** una prueba lateral chocó con
`crear_producto_con_variantes(unknown, unknown, jsonb) is not unique` — las dos sobrecargas que
la otra sesión ya documentó en ADR-0026 y dejó pendientes de decisión de Felipe. No es nuevo;
es una segunda confirmación de que ese arreglo hace falta.

## 2026-09-09 (cerrada la auditoría de lecturas silenciosas: de 20 a 1)
Se completaron las ~15 que faltaban. El repo pasó de **20 consultas que descartaban el error
de Supabase a 1**, y esa única es deliberada y está documentada en su propio archivo.

Apareció un tercer comportamiento que no estaba previsto y resultó el más importante:
**`exigirOpcional()`**, para las consultas `.maybeSingle()` donde "no hay fila" es una
respuesta legítima. El caso que lo motivó es el mejor ejemplo de todo el trabajo:
`getCajaAbierta` devolvía `null` **tanto si no había caja abierta como si la consulta
fallaba**. La pantalla decía "caja cerrada" en ambos casos — invitando a abrir una segunda
caja sobre una que sí estaba abierta. Ese es exactamente el estado imposible que prohíbe el
principio 2, y estaba escondido dentro de un `const { data }`. Lo mismo con el contenedor de
almacén: "tu sede no tiene almacén configurado" cuando lo que pasó fue que se cayó la red.

En las rutas de API el arreglo es distinto, porque ahí lanzar no sirve: tienen que devolver
el estado correcto. Las tres de Lucode reportaban un fallo de consulta como **"Comprobante no
encontrado" (404)** — en facturación eso hace que alguien re-emita una boleta que sí existe.
Ahora 503 dice "reintenta" y 404 dice "no está", que son cosas distintas. El export y el
padrón acusaban al usuario con "Sin persona vinculada" (403) por un fallo del servidor.

Y la Server Action del selector de sede: si su consulta se caía, el Líder tocaba el selector
y no pasaba nada — indistinguible de "no tienes permiso". Ahora revienta y se ve.

79 pruebas (subieron de 68 con trabajo de otras sesiones), eslint sin un solo warning, `tsc`
y `next build` en verde.

## 2026-09-09 (producción estaba limpia, y eso enseñó más que el bug)
Felipe corrió la comprobación en el SQL Editor de Dynamic: **cero funciones con más de
una firma en `retail`**. La inferencia que yo había escrito horas antes —que las
sobrecargas explicaban que `recibir_lote` no esté en los tipos generados y que
`RecibirLoteForm` "siempre falla cuando se usa"— era falsa para producción. Corregido en
ADR-0026 y en el BACKLOG: allá esos dos síntomas siguen sin causa conocida, y el arreglo
`0049` valió solo para local, donde el problema sí era real.

**Lo que Felipe aprendió y no era obvio, y vale más que el bug:** las dos bases se
construyen por caminos distintos. Local replica el historial COMPLETO —`0002_functions`
crea `registrar_movimiento` con 10 argumentos, `0008_almacen` la redefine con 12, y como
`create or replace` con firma nueva no reemplaza, la de 10 sobrevive a cada `db reset`—.
Producción nunca vio esa secuencia: `unificacion/07_funciones_operacion.sql:55` la define
UNA sola vez, ya con las 12. O sea que **la base local no es una réplica fiel de
producción**, y la diferencia no está en los datos sino en la forma del schema. Un bug
encontrado en local puede no existir allá (acaba de pasar) y uno de producción puede no
reproducirse acá. Es el costo real, con un caso concreto detrás, de la deuda de
migraciones duales que el BACKLOG ya tenía anotada.

Y una lección de método: la afirmación "esto explica aquello" es una hipótesis hasta que
alguien la mide. Estaba escrita en un ADR con tono de hecho. Medir costó diez segundos.


## 2026-09-09 (verificación post-despliegue de la robustez: 18 pantallas, ninguna rota)
Felipe empujó los 10 commits pendientes. Verificado en producción con sesión iniciada: se
recorrieron **las 18 pantallas de la app** buscando el texto de las barreras de error
("Esta pantalla no está mostrando datos" / "El sistema no pudo arrancar").

Resultado: **18 de 18 en HTTP 200, ninguna rota.**

Ese era el riesgo real del cambio y por eso se comprobó: `exigir()` convierte fallos que
antes eran invisibles en pantallas que se caen. Si alguna consulta llevaba meses fallando en
silencio, hoy se habría visto. Ninguna lo estaba — o sea que el sistema funcionaba de verdad,
no por accidente, y ahora además avisa cuando deje de hacerlo.

Rutas públicas sanas también: `/login` 200, `/inventario` 307 al login, `/api/padron` 401 con
su JSON. La región sigue en `gru1`.
