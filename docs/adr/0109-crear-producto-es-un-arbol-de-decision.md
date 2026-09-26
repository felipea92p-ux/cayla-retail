# ADR-0109 — Crear un producto es un árbol de decisión (familia → categoría → marca → atributos), y sus reglas viven en la base

**Fecha:** 2026-09-18
**Estado:** Construido: mapa de datos, esquema, formulario nuevo, pantalla de éxito, y —segunda parte— marca y proveedor en todo el ciclo del producto. Las
migraciones se probaron contra un Postgres 17 desechable con el esquema mínimo y el
formulario en el navegador con datos y red simulados. **NO probados** con `db reset`
(Docker caído ese día) ni contra la base real, y **NO aplicados en producción**: Felipe
pega los 8 SQL. **El código no se puede desplegar antes que el SQL** (ver
"Orden de despliegue").
**Afecta:** `productos` (trigger + índice único nuevos), `categoria_tallas.habitual`,
`familias.exige_tejido_patron`, `crear_producto_con_variantes`,
`actualizar_categoria_ejes`, `censo_crear_variante`, función nueva
`buscar_productos_parecidos`, `lib/error-escritura.ts`, tipos de `packages/database`.
Migraciones `20260918230000`, `230100`, `230200` y `230300` (catálogo) y `231000`, `231100`, `231200` y `231300` (marca y proveedor); `NuevoProductoForm.tsx`,
`components/alta-producto/*`, `lib/alta-producto*.ts`, `/productos/nuevo`.

## El problema

"Nuevo producto" mostraba **"Sin tejidos habilitados para esta categoría"** en toda
categoría. Diagnóstico en producción (solo lectura): el vocabulario existe (25 tallas,
17 tejidos, 7 patrones, todos aprobados) pero **ninguna de las 40 categorías tiene
tejidos ni patrones asignados**, y 15 no tienen tallas. El formulario estaba bien;
estaba desconectado del catálogo. Además la familia no participaba (lista plana de
categorías), y la base **no impedía duplicados**: `productos.referencia` no tenía
ningún candado, solo `codigo`.

## Lo que se decidió (Felipe, 20 preguntas, 2026-09-18)

| Tema | Decisión |
|---|---|
| Forma | Una sola página que se va revelando (cada bloque se desbloquea al resolver el anterior), no asistente por pasos: mismo candado con menos toques |
| Elegir rama | Tarjetas de familia → categoría, con caja de búsqueda como atajo |
| Al elegir categoría | Viene marcada la **curva habitual** (`categoria_tallas.habitual`) |
| Categoría sin tallas | Panel para configurarla ahí mismo; se guarda aparte, nunca dentro de la transacción del alta |
| Tejido/patrón | Obligatorios en Indumentaria (`familias.exige_tejido_patron`), opcionales en el resto |
| Falta un valor | "+ Nueva talla/color/tejido/patrón" dentro del bloque (propone y, como Líder, aprueba) |
| Etiquetas | Bloque opcional al final |
| Colores | Agrupados por familia de color + los más usados de la categoría al frente |
| Nombre | Tipo título automático ("blusa camila" → "Blusa Camila"); bloquea idéntico o 1 letra de diferencia, con salida deliberada del Líder; parecido mayor solo avisa |
| Precio/costo | Precio obligatorio; costo sugerido desde el último producto de la categoría, con margen % |
| Fotos | Fuera del alta: pantalla de éxito que invita a subirlas por color |
| Después de crear | Pantalla de éxito: Agregar fotos · Crear otro parecido · Ir a productos |
| Código | Vista previa antes de guardar |
| Quién / dónde | Solo Líder, desde el terminal de cada caja (PC/Mac mini; táctil también) |
| Curvas | Ropa S-M-L; Pantalón/Jeans 28-30-32 (26 y 34 disponibles, sin 36); Calzado 35-40 |
| Estándar / Única | Se quedan las dos: "Estándar" para ropa, "Única" (renombrada de "Único" por 20260918170000) para todo lo demás. Se reparten por familia y nunca conviven en una categoría |

## Por qué las reglas del nombre viven en la base

Hay **tres** caminos que insertan en `productos`: `crear_producto_con_variantes`,
`catalogo_crear_producto` y `censo_crear_variante`. Una regla que viva solo en el
formulario deja los otros dos abiertos. El censo era el peor: crea **un producto por
escaneo**, sin buscar si ya existe (escanear "Blusa Aurora" en S y luego en M dejaba
dos productos, con el stock partido).

- **Trigger** `productos_referencia_biu`: normaliza a tipo título. Solo actúa cuando
  `referencia` cambia — los 44 nombres existentes no se tocan **mientras nadie los edite**:
  el día que alguien renombra o re-guarda uno con otro texto, ese nombre pasa al formato único.
- **Índice único parcial** sobre `fn_clave_referencia(referencia)` donde
  `estado_alta <> 'rechazado'`: idéntico imposible (ignora tildes, mayúsculas,
  espacios y puntuación). Un producto rechazado en el censo no bloquea recrearlo bien.
- **`buscar_productos_parecidos`**: alimenta el aviso en vivo. Niveles `identico`,
  `una_letra`, `parecido` (trigram ≥ 0.5).
- **`censo_crear_variante`**: si el nombre ya existe en la MISMA categoría, cuelga la
  variante de ese producto; en OTRA categoría, error (un nombre, un producto).

## Alternativas descartadas

- **Cambiar `fn_clave_texto`** para que ignore puntuación: la usan colores, tallas y
  familias como candado único; alterarla cambiaría en silencio qué es "el mismo
  nombre" en tres tablas. Se creó `fn_clave_referencia`.
- **Extensión `fuzzystrmatch`** para medir "una letra": un comparador lineal de 20
  líneas hace lo mismo sin dependencia nueva en el proyecto compartido con Dynamic.
- **Tipo oración estricto** ("Blusa camila"): pierde la mayúscula del nombre propio y
  obliga a reescribir los 44 productos.
- **Validar solo en el formulario**: el censo (300-900 prendas) se lo salta.
- **`categoria_curva` como tabla aparte**: la curva es siempre un subconjunto de las
  tallas de la categoría; una columna booleana lo garantiza sin FK extra.

## Lo que no estaba en el pedido y pesó más

`actualizar_categoria_ejes` **borra y reinserta** todas las tallas de la categoría en
cada guardado. Sin tocarla, cada edición de categoría por un Líder habría borrado la
curva habitual en silencio. Ahora, si quien llama no manda una curva, conserva la
existente; si la manda, debe estar dentro de las tallas enviadas.

## Compatibilidad hacia atrás (por qué el SQL puede ir antes que el código)

> **Vale para las cuatro primeras migraciones (`230000`–`230300`), no para las de marca.** Desde
> `231000` (`marca_id` NOT NULL) hasta `231100` el alta y el censo *viejos* fallan: ver «Orden de
> despliegue (ampliado)». Esta sección se escribió antes de la segunda parte y se dejó tal cual
> por honestidad sobre el orden en que se decidió.

Las dos RPC cambian de firma **solo agregando un parámetro opcional al final**
(`p_confirmo_distinto`, `p_talla_habitual_ids`) y se borra la firma vieja para no dejar
dos sobrecargas (ya rompieron producción dos veces en este repo). PostgREST resuelve
las llamadas de 7 y 4 argumentos contra la firma nueva. La pantalla actual sigue
funcionando entre que se pega el SQL y que se despliega el formulario nuevo — con un
cambio de comportamiento a propósito: en Indumentaria la base ya rechaza una prenda sin
tejido o sin patrón (con frase clara), y un nombre repetido también; antes se guardaban.

## Orden de despliegue (esto sí puede romper las tiendas)

`pnpm datos:comparar` lo confirmó el 2026-09-18: contra producción, el formulario nuevo
llama a `buscar_productos_parecidos` (no existe) y manda `p_confirmo_distinto` y
`p_etiqueta_ids` a `crear_producto_con_variantes` (no los acepta). Si el código se
despliega primero, "Nuevo producto" falla siempre. Por eso: **1) pegar los SQL en orden
(`230000` → `230100` → `230200` → `230300`, y los de marca: `231000` → `231100` → `231200` → `231300`), 2) recién ahí mergear/desplegar.** Con las cuatro primeras, «al revés no pasa nada» (la
pantalla vieja sigue funcionando contra el SQL nuevo: parámetros opcionales al final); con las de
marca **sí pasa** (ver abajo). Al cerrar: `pnpm datos:generar:produccion` y `pnpm datos:comparar`
deben terminar **sin las 4 alarmas** (`censo_crear_variante`, `crear_producto_con_variantes`,
`crear_marca`, `buscar_productos_parecidos`).

**Lo que el comparador NO ve** (lo aprendí revisando este mismo PR): solo lee llamadas con los
parámetros escritos ahí mismo. `fn_productos` y `fn_productos_resumen` (los filtros de marca y
proveedor van con un `...`) y `catalogo_actualizar_producto` (los parámetros van en una variable)
no se pueden leer, así que el comparador no avisaría si esas tres se rompen. Las cubre la prueba
de regresión contra la copia exacta de producción, no el comparador. Y el aviso de parecidos
volvió a ser legible **a propósito**: `use-parecidos.ts` pasa los parámetros literales.

## Decisiones del formulario que no estaban en la tabla de arriba

- **Rojo casi nunca.** El brandbook (`globals.css`) reserva el rojo como acento, máx. 2
  por pantalla. Lo elegido se marca con tinta y ✓; ámbar = avisa y deja seguir; rojo =
  bloquea.
- **Mientras se comprueba el nombre, el paso 3 sigue cerrado.** Descubierto probándolo:
  la primera versión abría el paso 3 al escribir y lo cerraba de golpe si el nombre
  resultaba duplicado, con la persona ya eligiendo tallas. Tope de 6 s: una red colgada no
  deja el formulario esperando para siempre; si la comprobación falla, se dice y la base
  vuelve a verificar al guardar.
- **Colores NO se proponen dentro del formulario** (sí tallas, tejidos y patrones): un
  color necesita código, tono, familia de color y tipo. Se enlaza a Atributos en otra
  pestaña, con «actualizar los colores» sin perder lo llenado.
- **«Más usados» y «último costo» son sugerencias** sobre las últimas 2.000 variantes
  creadas, no un dato contable. El margen se calcula sobre el precio sin descontar IGV: es
  una alerta, no contabilidad.
- **El código previsto puede cambiar** si otra persona crea un producto de la misma
  categoría a la vez (el correlativo lo asigna la base al guardar).

## Pantalla de éxito (paso 4)

Al guardar no se vuelve a la lista: aparece una pantalla con tres salidas. **Las fotos son
la principal** (sin foto, la grilla de Productos muestra solo el tono del color) y enlazan
a `/productos/{id}/editar#fotos`; no se suben desde ahí porque el archivo sube al elegirlo
y quedaría huérfano si se cerrara la pantalla. **«Crear otro parecido»** conserva
categoría, tallas, tejido, patrón, precio, costo y etiquetas (una colección son ~10
prendas casi iguales) y limpia nombre, descripción y colores; el token de idempotencia se
renueva, porque un producto nuevo es una operación nueva y no un reintento (con el mismo
token la base devolvería el producto anterior). Probado: el segundo guardado sale con
token distinto y con los datos copiados.

## Se rompe si

- Dos prendas legítimas difieren en una sola letra (Top Lily / Top Lili): el aviso
  bloquea; por eso existe `p_confirmo_distinto`.
- Alguien renombra una categoría, talla o tejido antes de correr el mapa
  (`20260918230200`): el bloque de verificación aborta TODO en vez de cargar la mitad y
  dice qué nombre no encontró.
- Se agrega un cuarto camino de creación: imposible saltarse el trigger, pero **no**
  el aviso de "una letra" (vive en la RPC). Si el camino nuevo no llama
  `buscar_productos_parecidos`, solo tendrá el bloqueo de idéntico.
- Una familia que exige tejido/patrón tiene una categoría activa sin opciones: el
  producto sería imposible de crear. La migración del mapa lo comprueba al final y
  falla si ocurre; `crear_producto_con_variantes` lo dice con `hint =
  'categoria_sin_tejidos'` / `'categoria_sin_patrones'`.

## Cómo se verificó y qué NO

Postgres 17 desechable en puerto propio (sin tocar Docker ni los puertos compartidos),
con tablas mínimas y los nombres reales de las 44 categorías/25 tallas/17 tejidos/7
patrones: funciones puras (título, clave, una edición), trigger, índice, aviso,
idempotencia del token, exigencias por familia, censo (mismo nombre → misma variante
colgada; otra categoría → error; variante repetida → error de índice), preservación y
reemplazo de la curva, y el mapa (idempotente, dentro y fuera de una transacción, y
aborta si un nombre no coincide). Con control negativo de los `assert`.
Formulario: en el navegador con `zz-harness` (andamio temporal, ya borrado) y `fetch`
interceptado — árbol y búsqueda con tildes, aviso idéntico/una letra/parecido con su
confirmación, paso 3 cerrado mientras se comprueba, curva marcada, configurar categoría
sin tallas y sin tejidos, «+ Nueva talla», colores más usados, matriz 3×2, margen,
payload exacto a la RPC, celular sin desborde horizontal.
**No verificado:** `db reset` completo, RLS reales, la RPC de alta contra la base real
(solo contra el esquema mínimo), aviso de parecidos con `pg_trgm` de producción,
sesión de Líder real, y accesibilidad con lector de pantalla (solo `aria-pressed`,
`role=alert` y `inert`, sin probar con uno).


---

# Segunda parte — Marca y proveedor (2026-09-18)

## El pedido

Felipe notó que `productos` no dice de quién es la prenda ni quién la trae: sin eso no se
puede filtrar por marca, ni buscar «adidas» en la caja, ni saber a quién pedirle lo que se
acaba. Verificado en producción: `productos` tenía 13 columnas y ninguna de esas dos; hay
un solo proveedor cargado y ninguno se llama «CAYLA SAC».

## Lo que se decidió (Felipe, AskUserQuestion)

| Tema | Decisión |
|---|---|
| Qué es la marca | Vocabulario cerrado, lo administra un Líder (sin proponer/aprobar, como Familias) |
| Relación | «Primero debe existir el proveedor»: un proveedor tiene varias marcas. Una misma marca puede llegar por más de un proveedor (raro, pero pasa con accesorios y chompas importadas) |
| Obligatoriedad | Marca **y** proveedor obligatorios, también en el censo |
| Los 44 existentes | De prueba/demo: marca CAYLA, proveedor CAYLA SAC |
| Proveedor nuevo desde el formulario | Solo nombre y RUC opcional; lo demás se completa en Compras |
| Dónde se usa | Filtro y tarjeta en Productos, buscador de la caja, e «Inventario y reposición» — todo en esta rama |
| `catalogo_crear_producto` | Se retira (sin permiso de ejecución), como último SQL |

## DECIDÍ

`marcas` (vocabulario global) + `marca_proveedores` (qué proveedores traen cada marca, N:N) y el
producto guarda `marca_id` **y** `proveedor_id`, atados por **llave compuesta** a una pareja
registrada: un proveedor que no trae esa marca es un estado que la base no deja guardar.
Una sola regla (`fn_validar_marca_proveedor`) la usan el alta, el censo y la edición.

## DESCARTÉ

`marcas.proveedor_id` (una marca, un proveedor; duplicar la marca si llega por dos). Felipe
preguntó cuál convenía y dijo que la otra «tiene sus virtudes»: es más simple y afecta pocas
marcas. Se descartó por dos motivos de fondo: (1) **cambiar de proveedor pasaría a ser cambiar
de marca** —una chompa Adidas que cambia de distribuidor «cambiaría de marca» aunque Adidas
siga siendo Adidas—; (2) **la marca se fragmenta sin que la base lo impida**: un «Adidass» bajo
el otro distribuidor nace como marca distinta, y solo una validación de pantalla lo frena. Con
la marca única globalmente y el vínculo aparte, la base lo rechaza (`crear_marca` reutiliza la
marca existente y solo le suma el proveedor).

## SE ROMPE SI

- Una marca deja de tener sentido sin proveedor (hoy CAYLA cuelga de «CAYLA SAC»).
- Registrar el vínculo marca↔proveedor de cada compra nueva estorbara al catalogar: con 3
  tiendas y un taller, poco probable; el formulario lo hace en un toque.
- **El censo frena el conteo**: pedir marca y proveedor en cada alta al vuelo (300-900 prendas)
  es fricción real. Se compensa recordando la última pareja de la tanda y sugiriendo las más
  usadas de la categoría; si aun así estorba, la salida es permitir el alta «pendiente de marca»
  y exigirla al aprobar (descartada por Felipe hoy).

## Qué se construyó

- **Base** (`231000`–`231300`): tablas y RLS; `productos.marca_id/proveedor_id` NOT NULL con llave
  compuesta **y** llaves simples (para poder traer los nombres desde PostgREST); rellenado de
  los existentes; `crear_marca`; tres RPC reescritas; `fn_productos`, `fn_productos_resumen` y
  `fn_productos_buscar` (filtros, columnas de tarjeta y búsqueda por marca y proveedor).
- **Nuevo producto**: bloque 2 «Marca y proveedor», antes del nombre.
- **Selector** (`ElegirMarcaProveedor`): parejas más usadas en la categoría (un toque), una
  caja que busca en marcas y proveedores a la vez, elección automática si hay un solo proveedor,
  y «+ Nueva marca» / «+ Otro proveedor» sin salir (`NuevaMarcaForm`, compartido con la pantalla
  de Marcas). Lo usan Nuevo producto, el censo y Editar.
- **Editar**: marca y proveedor solo se envían si **cambiaron** (si no, un proveedor desactivado
  más tarde impediría guardar hasta un cambio de precio); hereda las reglas de nombre y de familia.
- **Catálogo → Marcas** (`/productos/marcas`): marcas con sus proveedores, sumar otro proveedor,
  renombrar, desactivar (la base lo impide si hay productos activos).
- **Productos**: filtros de marca y proveedor, marca en la tarjeta y en la fila, y «A quién
  pedirle» (los productos por reponer agrupados por proveedor).
- **Caja**: escribir la marca encuentra sus prendas. Solo suma un campo al texto buscable; no
  toca precios, stock ni cobro. (La primera versión de este PR **decía** que la caja buscaba por
  marca y no era cierto: `vender/page.tsx` armaba las variantes sin el campo. Ahora la pasa. La marca
  llega por una consulta **aparte y tolerante** en `getCatalogo`, no anidada en la principal: esa
  consulta la leen la caja, cambios, buscar, compras, recepción, conteo y traslados, y un embed que
  la base todavía no conoce las habría tumbado a las siete. Sin el SQL de marcas la caja vende igual,
  solo sin buscar por marca.)
- **Categorías**: la curva habitual se marca y se ve.

## Lo que se decidió sin preguntar (objétalo si no te gusta)

- **Marcas no tiene fila propia en el menú lateral**: Felipe pidió «con 3 está bien» para
  Catálogo. Se llega desde Categorías, desde el selector («Administrar marcas») y el grupo
  Catálogo se abre al estar en ella.
- **«Inventario y reposición»** se resolvió donde ya vive la señal de reposición: Productos
  («Pedir a proveedor»), agrupada por proveedor. **Inventario → Existencias no filtra por
  proveedor todavía**: pide cambiar `fn_stock_por_sede` y su pantalla; está en el backlog.
- Etiquetas de campaña que ya rigen sobre la categoría se muestran «ya aplica por campaña» y no
  se eligen a mano.

## Orden de despliegue (ampliado)

Los 8 SQL, en orden, y recién después el código: `230000` → `230100` → `230200` → `230300` →
`231000` → `231100` → `231200` → `231300`. Los cuatro de marca dejan una ventana en la que
Nuevo producto y el censo (los VIEJOS) fallan hasta que se despliegue el código nuevo:
`231000` deja `marca_id` NOT NULL antes de que `231100` reescriba las RPC. **Pegar los cuatro
seguidos y desplegar enseguida.** Las migraciones viven en `2309…` a propósito: la sesión de
Compras reclamó toda la banda `20260918200000`–`20260918219999` (ADR-0111).

## Cómo se verificó y qué NO

Postgres 17 desechable: rellenado de los existentes, `NOT NULL`, llave compuesta (un insert
directo con pareja inválida falla), `crear_marca` (reutiliza la marca, es idempotente, rechaza
un proveedor inactivo), candado de desactivar, alta, censo (crear pide marca; reutilizar no),
edición (sin marca no cambia; cambiar de proveedor dentro de la marca; pareja inválida;
renombrar solo el formato; idéntico; una letra; tejido/patrón solo si está activo), y una **prueba
de regresión de las tres funciones de listado sobre la copia exacta de producción**: 10 escenarios
sin los filtros nuevos devuelven lo mismo que hoy. Pantallas en el navegador con red simulada:
selector (sugerencias, búsqueda, marca con dos proveedores, crear marca y proveedor), edición,
censo, Marcas y Nuevo producto.

**Verificado por el CI (piloto «Pruebas de RPC contra Postgres», después de corregir un defecto
propio, ver abajo):** la cadena COMPLETA de migraciones sobre una base nueva —las 8 de este ADR
incluidas—, la carga de `seed.sql` ya adaptado a marca y proveedor obligatorios, y los scripts de
venta y caja (`registrar_venta`, caja, cambios…) como regresión.

**Defecto que encontró el CI y que mi propia prueba no podía ver:** el mapa de categorías
(`230200`) abortaba en una base nueva porque el vocabulario de patrones todavía no existe ahí (las
semillas locales corren DESPUÉS de las migraciones), y con él caían las migraciones que vienen
detrás. Mi verificación «aborta todo si un nombre no existe» protegía a producción de un typo pero
rompía cualquier `db reset`. Ahora distingue: un eje con el vocabulario **completamente vacío** se
salta con un aviso («todavía no hay datos»); con vocabulario presente, un nombre que no calce
**sigue abortando todo** («los datos no son los que creíamos»). Probado en cuatro escenarios
(producción, patrones vacíos, typo, todo vacío). Lección: un candado que aborta es correcto solo
si distingue «aún no hay datos» de «los datos están mal».

**No verificado:** RLS reales, las funciones contra la base real de producción, sesión de Líder
real, Productos con `fn_productos` real (solo contra el esquema mínimo y la copia exacta de
producción), y lector de pantalla.

# Tercera parte — Revisión adversarial del PR (2026-09-18)

Antes de pedir revisión, un flujo de agentes escépticos intentó **refutar** el PR por dimensiones
(SQL, seguridad, concurrencia, pantallas, despliegue, documentación). Sobrevivieron 23 hallazgos;
estos son los que cambian lo que hay que saber. Cada uno se corrigió o se documenta aquí.

## Corregido en la base (`230000`, `230100`, `230300`, `231000`, `231100`, `231300`)

- **`rechazado` es terminal.** El índice único deja recrear el nombre de una prenda rechazada
  (`estado_alta <> 'rechazado'`), pero nada impedía *reactivarla*: dos activas con el mismo nombre.
  Ahora un CHECK (`productos_rechazado_descontinuado_check`) exige `estado = 'descontinuado'` si está
  rechazada, y `catalogo_actualizar_producto` lo dice con palabras (`rechazado_no_reactivable`). Editar
  ya no ofrece «Activo» para esas prendas.
- **Reactivar valida marca y proveedor.** Volver a poner activo un producto saltaba el candado de
  desactivar (la marca o el proveedor podían estar apagados). Ahora reactivar corre la misma validación.
- **El censo ya no deja un precio en 0 ni un producto huérfano.** Al colgar una variante de un producto que
  ya existe, quien no es Líder (o un 0) hereda precio y costo de una variante hermana; la respuesta trae
  `reutilizado` para que la pantalla no diga «pendiente de revisión» cuando no lo está; una categoría
  distinta o un producto sin categoría (el «cargo especial») se rechazan en vez de mezclarse; y dos
  escaneos simultáneos del mismo nombre reintentan en vez de fallar (`unique_violation`; está
  implementado, pero **no se ejercitó con dos sesiones reales**, solo por lectura del código).
- **Un `UPDATE` que afecta 0 filas ya no «sale bien».** `catalogo_actualizar_producto` lo avisa (antes
  la RLS podía dejar la edición en nada y la pantalla decía «guardado»).
- **El historial audita marca y proveedor**, como ya hacía con categoría y estado.
- **`fn_titulo_referencia` recorta también tab y NBSP** (espejo de la `.trim()` del formulario).
- **Permisos.** `drop function` reinicia los permisos: cada función recreada vuelve a cerrarse a
  `public` y `anon`.
- **Regresión de listados repetida** contra la copia exacta de producción tras los cambios: 10
  escenarios idénticos; permisos verificados.

## Corregido en pantallas

- Caja: pasa la marca (ver arriba). `getCatalogo`: marca en consulta aparte y tolerante.
- «A quién pedirle» usa **los mismos filtros** que la tarjeta «Pedir a proveedor» (la suma coincide) y, si
  falla, se omite en vez de tumbar Productos.
- Los avisos de parecidos enlazaban a `/productos/{id}` (no existe → 404); ahora a `/productos/{id}/editar`.
- Censo: mensaje verdadero cuando la variante se sumó a una prenda existente.
- Marca y proveedor: reintentar tras crear el proveedor ya no lo registra dos veces; un proveedor sin
  marcas ofrece «+ Primera marca de …» en vez de un callejón sin salida; lo recién creado sobrevive a que el
  selector se desmonte (censo, «crear otro parecido»).
- «+ Nueva talla/tejido/patrón» reconoce un valor que ya existe en el vocabulario y lo ofrece en la
  categoría, en vez de rebotar con «ya existe».
- El costo sugerido de la categoría anterior ya no se queda al cambiar de categoría; el precio por celda
  acepta centavos (`step="any"`); **Enter dentro de un campo ya no crea el producto**.
- `useParecidos` usa `AbortController` (no `AbortSignal.timeout`, ausente en Safari antiguo) y se degrada a
  «no pude comprobar» en vez de dejar el bloque cerrado para siempre.
- `claveReferencia` (TS) pliega solo `áéíóúüñ`, igual que la base.

## Decisiones que se mantienen (con su costo dicho)

- ~~Editar exige tejido y patrón en Indumentaria~~ — **decisión cambiada el 2026-09-19, ver la quinta parte.**
- `fn_productos_buscar` busca por subcadena en marca y proveedor (como ya hacía con nombre y código).
- Volver a correr el mapa de categorías (`230200`) reinicia la curva habitual de tallas a la de la migración.

## Fuera de este PR (ya existía)

`proveedores_select` (0004) deja a cualquier sesión autenticada leer `banco` y `cuenta_bancaria` de los
proveedores. **No es un descuido: `20260918120000` lo decidió a propósito** («ficha, no agregado — quedan
abiertos»). Este PR no lo introduce ni lo empeora (solo suma `nombre` a la lista del selector). Lo dejo
señalado porque una cuenta bancaria es dato de pago, no de ficha, y conviene que Felipe reconsidere esa
decisión: ver BACKLOG.

# Cuarta parte — Lo que falló al pegar en producción (2026-09-18)

El SQL 1 y el SQL 2 se pegaron sin problema. El **SQL 3 (el mapa de categorías, `230200`) falló** con
`42P01 relation "_mapa_tallas" does not exist`. No dejó nada a medias (verificado en producción: 173 vínculos
de talla, 0 de tejido, 0 de patrón, sin tablas sueltas).

**Causa.** El mapa creaba tres tablas con `create temp table` y las usaba en sentencias siguientes. Una tabla
temporal solo existe en la **conexión** que la creó, y el SQL Editor de Supabase no garantiza la misma conexión
entre sentencias. **Mi prueba y el piloto del CI no lo podían ver:** `psql -f` corre todo el archivo en una sola
conexión. El propio archivo decía que «cada sentencia puede ir en su propia transacción» y aun así lo di por
seguro: era exactamente el riesgo, nombrado y no probado.

```
DECIDÍ: todo el mapa en UN solo bloque `do $mapa$ … $mapa$`: una sentencia, una conexión, una transacción.
DESCARTÉ: (a) una tabla auxiliar persistente en `retail`: deja basura si aborta a medias y exige un dueño en el
  aviario; (b) repetir el mapa dentro de cada `insert` con un CTE: tres copias que se desincronizan.
SE ROMPE SI: el editor cortara la sentencia en un `;` interior. No lo hace: los SQL 1 y 2 traen funciones con
  `$$ … ; … $$` y entraron enteras.
```

**Ganancia.** Si algo aborta, se deshace TODO el mapa (antes, los `insert` ya hechos quedaban). Probado con el
archivo nuevo en una base desechable, en los dos modos (una conexión, y una conexión por sentencia): 204 / 139 /
133 vínculos y 117 tallas habituales; idempotente; un nombre que no calza aborta sin dejar nada; base nueva
(vocabulario vacío) se salta con aviso; una categoría exigente que el mapa no nombra aborta y deshace.

**Y el resto.** Las otras 7 migraciones se volvieron a correr sentencia por sentencia, cada una en su propia
conexión (95 + 9 sentencias, 0 errores) con las mismas suites SQL de antes: nada más depende de estado de sesión.

# Quinta parte — Editar: la regla «no empeora» (2026-09-19)

Antes de pegar el SQL 6 en producción medí lo que su regla de edición significaba con los datos reales
(consulta de solo lectura): de los 39 productos activos, **38 son de Indumentaria y ninguno tiene tejido ni
patrón**, porque hasta el SQL 3 ninguna categoría tenía tejidos habilitados y nadie podía asignarlos. La regla
que Felipe había pedido («darle a Editar las mismas reglas que a Nuevo producto») habría hecho que **cambiar solo
el precio de esas 38 prendas exigiera antes elegir tejido y patrón**, desde el momento de pegar el SQL, también en la
pantalla actual. Se había pensado para prendas nuevas, no para todo el catálogo existente.

```
DECIDÍ: al EDITAR, un producto activo de Indumentaria que YA tenía tejido o patrón no puede quedarse sin él; uno que
  nunca los tuvo se guarda igual. Nuevo producto sigue exigiéndolos SIEMPRE. (Felipe eligió esta opción, 2026-09-19.)
DESCARTÉ: (a) exigirlos siempre al editar: la base se limpia con el uso, pero mientras tanto un cambio de precio
  exige elegir tejido y patrón en 38 prendas; (b) exigirlos siempre, pero cargar antes los 38: obliga a decidir el tejido
  y el patrón de cada uno (no se inventan) y detiene el despliegue.
SE ROMPE SI: se espera que «Indumentaria siempre tiene tejido» sea verdad en toda la tabla. No lo es: los 38 viejos siguen
  sin dato hasta que alguien los complete (la pantalla de Editar lo sugiere, no lo obliga) — cualquier reporte que
  agrupe por tejido debe tolerar nulos.
```

Implementación: `catalogo_actualizar_producto` lee el tejido y el patrón actuales y solo rechaza dejarlos en blanco si
ya existían (mismos `hint`, `tejido_obligatorio` / `patron_obligatorio`); `ProductoForm` calcula `exigeTejido` /
`exigePatron` con la misma regla y, si faltan, muestra una sugerencia. Probado con una suite de 8 escenarios en un Postgres
desechable, con **control negativo**: contra la versión anterior de la función la prueba de «cambiar el precio sin tejido»
falla con «En Indumentaria el tejido es obligatorio».


## Actualización 2026-09-25 — «¿no será una marca que ya existe?»

El 24-sep se creó la marca «Cayla 2» (con Jacard Peru SAC) para dar de alta **Top Aurora** (TOP-0011, 65 prendas en
stock): CAYLA ya existía, pero traída solo por CAYLA SAC. Consultado en producción (solo lectura). Dos huecos del
selector, no un error de quien lo usó:

1. **La pareja elegida sola no tenía salida.** Con un solo proveedor, la marca se elige sola con él (paso 3), y ese estado
   solo ofrecía «Cambiar», que vuelve a lo mismo. «+ Otro proveedor para X» existía solo cuando la marca ya tenía dos.
   Ahora la pareja elegida ofrece «+ Otro proveedor para {marca}» y «+ Otra marca de {proveedor}».
2. **El formulario de nueva marca callaba.** Ahora, mientras se escribe, dice si el nombre es IGUAL a una marca (no se crea
   otra: `crear_marca` le suma el proveedor) y pregunta si se PARECE (`marcasParecidas` en `lib/marcas.ts`). Guardar sin
   responder no guarda.

```
DECIDÍ: preguntar en el formulario, sin bloquear: «Sí, es CAYLA» pone el nombre real; «No, es otra marca» deja seguir.
  Parecida = misma raíz salvo números o signos («Cayla 2»), 1 letra de diferencia desde 5 letras o 2 desde 8
  («Kristell»), o un nombre que cabe entero en otro, palabra por palabra («Divas» en «Divas Now»).
DESCARTÉ: (a) un candado en la base (índice por raíz sin números): «La Femme» y «La Femme 21» pueden ser dos marcas de
  verdad, y la base no puede preguntar; (b) avisar solo con el nombre igual: es justo el caso que ya funcionaba y no
  habría atrapado «Cayla 2».
SE ROMPE SI: alguien crea la marca por otro camino que no pase por `NuevaMarcaForm` (SQL directo, una carga masiva
  como la del ADR-0140): la pregunta vive en la pantalla. Medida contra las 80 marcas de producción, entre ellas solo
  dispara CAYLA ~ Cayla 2 y Divas ~ Divas Now.
```

Lo que sigue sin resolver: la base no sabe **fusionar** dos marcas ni **quitarle** una marca a un proveedor. «Cayla 2» se
arregla a mano (editar Top Aurora a CAYLA · Jacard y desactivar «Cayla 2»); la unión Cayla 2 ↔ Jacard queda guardada.

## Actualización 2026-09-25 (b) — «¿no será un proveedor que ya tienes?»

El mismo hueco que «Cayla 2», con plata de por medio. `retail.proveedores` solo frena un nombre IGUAL
(`proveedores_nombre_clave_unica` sobre `fn_clave_texto`, que no quita puntos: P-25 de `docs/datos/13-PROMESAS-INCUMPLIDAS.md`)
y un RUC repetido (`proveedores_ruc_unico`), y el RUC es opcional. «Jacard Perú S.A.C.» o «Jacard Peru» entraban como
proveedor nuevo junto a «Jacard Peru SAC», y sus facturas, su Por pagar y sus notas de crédito quedaban en dos fichas.

La regla de las marcas salió de `lib/marcas.ts` a `lib/nombres-parecidos.ts` (`nombresParecidos`, sin cambiarle nada; acepta
`quitar`: qué palabras no cuentan para la identidad), y cada dominio la llama con su nombre: `marcasParecidas` (todas las
palabras cuentan) y `proveedoresParecidos` en `lib/proveedores-reglas.ts`. Se pregunta en las dos puertas de la web que
registran con `registrar_proveedor`: el «+ Registrar … como proveedor nuevo» de `NuevaMarcaForm` y Compras ▸ Proveedores ▸
Registrar (`ProveedorModal`; al editar no se pregunta). La caja es una sola pieza para marcas y proveedores:
`components/ui/PreguntaParecido.tsx`.

```
DECIDÍ: la regla de las marcas con dos diferencias que salen de cómo funciona un proveedor: (1) la forma societaria del
  final no cuenta (SA, SAA, SAC, SACS, SRL, SCRL, EIRL, con o sin puntos); (2) si los dos tienen RUC válido y distinto, no
  se pregunta: para SUNAT son dos contribuyentes. «Sí» elige al que existe (Nueva marca) o abre su ficha (Compras);
  «No, es otro» deja seguir; registrar sin contestar no registra. Con el nombre IGUAL no hay «No»: la base no dejaría.
DESCARTÉ: (a) un candado en la base (índice sobre el nombre sin forma societaria): «Jacard Peru SAC» y «Jacard Peru EIRL»
  pueden ser dos empresas con dos RUC, y la base no puede preguntar; (b) comparar en Postgres, como
  `buscar_productos_parecidos`: los productos son miles, pero los proveedores son 76 y ya están en la pantalla — un viaje
  a la base por tecla es más lento y, con la red caída, deja de preguntar; (c) copiar la regla de marcas en proveedores:
  dos copias se separan con el tiempo.
SE ROMPE SI: un proveedor entra por una puerta que no llama a `proveedoresParecidos`: hoy el proveedor rápido de Gastos
  (`RegistrarGastoModal` → `registrar_proveedor_de_gasto`, en BACKLOG) o una carga por SQL. Y en Nueva marca la lista de
  proveedores trae solo `id, nombre`: sin el RUC del existente, (2) no actúa y ahí se pregunta de más, nunca de menos.
```

Medida contra los 76 proveedores de producción (2026-09-25, solo lectura): ningún par igual, y la pregunta dispara en uno
solo: Moda Mia ~ Valeria Mia Peru Moda EIRL (por nombre contenido; Moda Mia no tiene RUC). Hay que mirarlo a mano. Los casos
del pedido la disparan todos: «Jacard Perú S.A.C.», «Jacard Peru», «Skopjer S.R.L.», «Corporacion Imperium S.C.R.L.».
Pruebas: `lib/nombres-parecidos.test.ts` y `lib/proveedores-parecidos.test.ts`.

## Actualización 2026-09-25 (c) — la tercera puerta: el proveedor rápido de Gastos

Finanzas ▸ Gastos ▸ Registrar gasto ▸ «¿No está? Súmalo» registra con `registrar_proveedor_de_gasto`
(`20260924235100`), que ya reutiliza el proveedor si el RUC coincide o si el nombre es IGUAL (`fn_clave_texto`), pero
dejaba pasar «Hidrandina S.A.A.» junto a «Hidrandina SA». Ahora pregunta como las otras dos puertas, con la misma pieza
(`PreguntaParecido`) y la misma regla (`proveedoresParecidos`). Sin migración.

La diferencia con las otras puertas sale de la RPC: `registrar_proveedor` crea siempre; `registrar_proveedor_de_gasto`
«suma o reutiliza». Por eso la regla de esta puerta, `sumarProveedorDeGasto` (`lib/gastos-reglas.ts`), dice ANTES lo que la
base haría: mismo RUC → es ese (aunque el nombre diga otra cosa, o todavía no haya nombre); mismo nombre → es ese; si no,
pregunta por los parecidos que nadie contestó; si no queda pregunta, suma.

```
DECIDÍ: «Sí» elige al que existe en el combo de proveedor, aquí mismo; «No, «X» es otro proveedor» deja sumar; «Sumar
  proveedor» sin contestar no suma (aviso que lleva a la pregunta). Con el mismo RUC o el mismo nombre no hay «No»: la caja
  dice «ya es de…» y «Sumar» elige ese, sin viaje a la base y con el aviso «ya estaba en el directorio: no se creó otro».
DESCARTÉ: (a) preguntar solo por nombre, como Nueva marca: con un RUC igual y un nombre parecido, «No, es otro» habría
  mandado a la base un proveedor que la base igual devuelve —la pantalla diría «otro» y el gasto quedaría en el mismo—;
  (b) traer también los proveedores desactivados para comparar: es 1 de 76 (2026-09-25) y la base igual lo reutiliza si es
  el mismo RUC o nombre; cambiaría `getProveedoresParaGasto`, que usan dos pantallas, por un caso que hoy no existe.
SE ROMPE SI: dos personas suman a la vez, desde dos pantallas abiertas antes, «Hidrandina SA» y «Hidrandina S.A.A.» sin
  RUC: ninguna ve a la otra en su lista, y la base (candado por nombre IGUAL) deja entrar las dos. La pregunta es un aviso,
  no un candado (ver el DESCARTÉ (a) de la actualización (b)).
```

Pruebas: `lib/gastos-proveedor-parecido.test.ts` (9 casos: el de Hidrandina, «No» que deja seguir, igual con tildes y
mayúsculas, RUC antes que nombre, RUC válido distinto, RUC a medio escribir, mismo nombre con otro RUC, vacío, y el tope que
se aplica después de «es otro»). Verificado con un andamio (sin base local) a 800 y 375 px: la pregunta, «Sumar» sin
contestar (no sale ninguna petición), «Sí» (queda elegido), «No» (sale `registrar_proveedor_de_gasto`), mismo RUC con otro
nombre (elige sin petición ni opción duplicada) y mismo nombre escrito distinto.
