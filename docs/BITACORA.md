# BITÁCORA — CAYLA Retail

> 3 líneas por cierre de sesión/paso: fecha, qué se cerró, qué aprendió Felipe.
> Se acumula, no se reescribe — es historia, no un resumen que se actualiza.

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
