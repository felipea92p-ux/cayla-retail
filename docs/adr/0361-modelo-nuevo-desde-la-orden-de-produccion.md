# ADR-0361 · Modelo nuevo desde la orden de producción: ida y vuelta a Nuevo producto y «Modelo nuevo» dentro de la propia orden

- **Fecha:** 2026-10-07 (primera parte) y 2026-10-09 (segunda parte) · **Estado:** **construido en dos partes; falta pegar la migración en producción.**
  - *Primera parte* (ida y vuelta a Nuevo producto): solo web, sin migración; verificada.
  - *Segunda parte* («Modelo nuevo» dentro de «Nueva orden»): migración aditiva `supabase/migrations/20261009120000_abrir_produccion_con_modelo_nuevo.sql`
    ensayada contra el Postgres local (20 casos, todos terminan en `ROLLBACK`) y web verificada (`tsc`, `eslint`, 387 archivos / 156.458 pruebas y el
    recorrido en el navegador con datos de ejemplo). **Orden obligatorio: primero la migración en producción, después se publica la web** (ver «Despliegue»).
  - **Hecho el 2026-10-10:** recorrido con datos reales en local (como líder), `/chaos` (semilla 1010) y `/formidable`; y **los arreglos que Felipe eligió** de esas dos
    pasadas (ver «Lo que se arregló después de `/chaos` y `/formidable`» y «Cómo se verifica»). **Todavía en producción: nada**; la migración se pega primero.
  - **Falta:** lo que es del núcleo y no se tocó (los CHECK `>= 0` de `variantes` y `producciones` admiten `NaN`; `abrir_produccion` acepta un costo `NaN` si se la
    llama directo), la pantalla del colaborador sin permiso de catálogo en el navegador y la pasada con colaboradoras reales (ver `docs/backlog/2026-10-07-vista-inicial-taller-3c5f9a.md`).
- **Pedido:** Felipe, 2026-10-07: «debemos rescatar la forma en que se creaban las órdenes» y «obviamente mejorarlo». De las tres formas que se le
  propusieron eligió la 1, **«alta rápida dentro de la orden»**. La primera versión de este ADR la descartó y construyó un atajo con retorno; el 2026-10-09
  Felipe la corrigió («el Taller no necesariamente crea productos ya existentes») y la segunda parte la construye como se pidió, con las salvaguardas de abajo.
- **Complementa:** ADR-0133 (Producción), ADR-0109 y ADR-0284 (Nuevo producto y su guía), ADR-0294 (un nombre por marca), ADR-0347 (motor de demanda en
  Nueva orden), ADR-0161 (módulos y roles), ADR-0358 (una función, una pieza). **Ajusta el punto 5 del ADR-0051** (ver «Decisión», 1).
- **Precedente:** la alta al vuelo del censo, `supabase/migrations/20260918020000_censo_alta_al_vuelo.sql` (Felipe, 2026-09-18).

## El problema

El 22-jul-2026 una corrida se registraba en un solo formulario: modelo nuevo o existente, tela, avíos, precio a tienda, tallas y colores escritos a mano, y el
costo por prenda con su semáforo al instante. Desde el 2026-09-15 una orden **solo puede producir un modelo que ya existe en el catálogo con sus variantes**
(`abrir_produccion` recibe `variante_id`; ADR-0051, punto 5): en V1 las variantes nacían al vuelo desde la orden y dejaron prendas sin precio, colores
duplicados («Negro»/«negro») y SKUs a ciegas. El remedio quitó también una necesidad legítima. **El Taller crea modelos nuevos como parte normal de su
trabajo**: una Muestra (patronaje → muestra → escalado, donde el escalado define las tallas) es por definición el desarrollo de un modelo que todavía no
existe. Crear un modelo exige `fn_puede_editar_catalogo()` (el líder o un rol con Productos/Atributos), que quien opera el Taller normalmente no tiene: cada
modelo nuevo dependía de un líder y de salir de la orden a otra pantalla. El problema de V1 era el **texto libre**, no el momento de crear el modelo.

## Decisión

1. **Una orden puede crear su modelo** *(reabre y reemplaza la decisión 1 de la primera versión; ajusta el ADR-0051, punto 5)*. Lo que ese punto prohibió son
   los tres problemas del texto libre; se quitan sin quitar el momento: tallas y colores salen **solo del vocabulario** (`tallas`, `colores`), cada talla debe
   estar **habilitada para la categoría** (`categoria_tallas`), el **código lo asigna la base** y el **precio** es obligatorio en una producción (una Muestra
   puede ir sin precio y se completa al aprobarla). `abrir_produccion` no cambia: sigue sin crear variantes y con su misma firma.
2. **Una sola función de la base, `retail.abrir_produccion_con_modelo_nuevo`** (security definer, aditiva): crea el producto, sus variantes y llama a
   `abrir_produccion` al final. **Una llamada, una transacción, un token**: o pasa todo o no queda nada, así que no puede existir «un modelo sin su orden»
   (principio 2). El mismo `p_token` va a `productos.token_cliente` y a `producciones.token_cliente`; reintentar tras perder la red devuelve la orden que ya
   se abrió, sin duplicar el modelo. Sustituye a la «RPC atómica» que la primera versión dejó como alternativa descartada.
3. **Quién:** quien opera el Taller (`fn_puede_operar_ubicacion` + `ubicaciones.tipo = 'taller'`, comprobado **antes** de tocar el catálogo para que nadie
   averigüe nombres ni vocabulario sin permiso), **sin** el candado del líder. El estado del modelo lo decide `productos_estado_alta_biut`, no la función:
   **`pendiente`** si quien lo crea no edita el catálogo (se puede usar de inmediato; **hoy ninguna pantalla lo revisa**: Felipe quitó el aviso «Pendiente de
   revisar» el 2026-10-02, «no me sirve», y una pendiente se trata como cualquier otra) y **`aprobado`** si lo edita. Es la misma marca del alta al vuelo del censo.
4. **Qué se pide y qué no.** Se piden nombre, categoría, tallas, colores (opcionales: una prenda puede no tener color), precio y cantidades. **No** se piden
   marca, proveedor, tejido, patrón ni fotos: el modelo nace sin ellos y quedan en «Para completar» de Editar producto. La base exige tejido y patrón en
   Indumentaria dentro de `crear_producto_con_variantes`, no en una restricción de la tabla; el modelo que nace de una orden queda **incompleto en esos campos**
   hasta que quien edita el catálogo lo complete (la misma concesión del censo). `variantes.costo` nace en 0: el costo real se pega al **cerrar** la orden
   (D-31), como hoy. El material en texto libre de julio **no vuelve**.
5. **Validación por conjuntos, no fila por fila.** Tallas pedidas `EXCEPT` habilitadas para la categoría; colores pedidos `EXCEPT` activos; y «la misma celda
   dos veces» se detecta contando filas contra filas distintas, antes de que el índice `variantes_identidad_unica` la rechace con un error técnico. Las
   cantidades se validan con una expresión regular dentro de un `CASE`, para que «3.5» diga una frase clara y no un error de conversión.
6. **Nombre repetido: se elige el existente, no se falla.** La función usa `buscar_productos_parecidos` contra los modelos sin marca (el modelo nace sin marca; el
   nombre es único por marca, ADR-0294). Un nombre idéntico se rechaza con `hint = nombre_duplicado` y el id del existente en `detail`: la pantalla ofrece
   **«Usar ese modelo»** y cambia a «Ya existe» con ese modelo elegido. Uno que difiere en una letra pide confirmación (`nombre_casi_igual`): **«Es otro modelo,
   crearlo igual»** reenvía con `p_confirmo_distinto = true` y el mismo token.
7. **La pantalla es de quien opera el Taller, no solo del líder.** Un selector «Ya existe / Modelo nuevo» en la hoja de «Nueva orden»; con «Modelo nuevo» se piden
   los campos de arriba con la guía de foco (ADR-0284). El **modelo se construye «virtual»** a partir del borrador, de modo que la matriz de cantidades, el costo
   por prenda y el margen son **el mismo código** de siempre, no una copia. Sin modelos en el catálogo ya no se apaga el botón: se ofrece «+ Crear el primer
   modelo». Si no se pudieron leer las tallas y los colores, la pantalla lo dice y deja elegir un modelo que ya exista (el botón queda apagado). Si la función
   aún no está en la base, avisa en una frase y la hoja conserva lo escrito.
8. **El enlace a Productos se conserva como «alta completa, con fotos»** para quien edita el catálogo (primera parte): ida con `?desde=produccion&tipo=…`
   y vuelta con `?nueva=<modelo>&tipo=…` por la URL, no por estado escondido (`lib/modelo-nuevo-orden-reglas.ts`); un parámetro roto cae al valor de siempre.
9. **Permisos y dinero no cambian.** El margen y el semáforo siguen siendo solo del líder (`decision` solo le llega a él; ya no dependen de que la red
   responda). El costo por prenda sale de `costoUnitario` y `semaforoMargen` de `lib/produccion-reglas.ts`, la misma fórmula de la base
   (`producciones.costo_unitario`, a 2 decimales).
10. **Sin conexión:** «Nueva orden» (con un modelo que ya existe o con «Modelo nuevo») se abre en línea, como siempre: no pasa por la cola sin conexión, y con
    «Modelo nuevo» además necesita a la base para repartir los códigos. Solo la alta completa en Nuevo producto puede quedar en la cola (ADR-0210); entonces el
    producto aún no tiene `id` y no hay enlace de vuelta: la pantalla de éxito lo dice y manda a abrir la orden desde Producción cuando el producto suba.

## Lo que se arregló después de `/chaos` y `/formidable` (2026-10-10, a pedido de Felipe)

**En la función** (dentro de la misma migración, porque aún no está en producción): nombre ≤ 80 letras y nota ≤ 200; precio redondeado a céntimos **antes** de comparar, ≥ S/ 0.01 en una
producción (antes `0.001` pasaba y se guardaba como 0,00), ≤ S/ 99,999.99, sin `NaN` ni nulo; costos de tela, avíos y maquila sin `NaN`, sin negativos (con frase, ya no «violates check
constraint») y ≤ S/ 999,999.99, a céntimos; una línea **sin talla** en una categoría que sí tiene tallas se rechaza (nacía la variante «…-U»); y una talla sin forma de uuid se dice con la
frase del vocabulario. Los CHECK de las tablas **no** se tocaron: son del núcleo.

**En la pantalla:** (1) los montos se leen estricto (solo dígitos y un punto): «12,50», «S/ 50» o «1e9» ya no se guardan como 0 sino que se dicen, y **la coma solo se explica con un ejemplo, no
se acepta** (decisión de Felipe: leer dinero distinto es suyo); (2) cada «Falta» imprime a la vista qué hacer (`PieGuia conFrase`; antes solo vivía en el `title`, que no se ve con dedo ni teclado);
(3) el orden es Nombre → Categoría → Tallas → **Precio** → Colores → Cuántas, y la carta de 89 colores arranca **cerrada** solo aquí (`ElegirColores cartaAbierta`, por defecto `true`: Nuevo producto no
cambia, ADR-0312/0314); (4) el semáforo dice **«Margen bajo»** y no «Pierde» (un 38 % positivo se leía como pérdida), una sola vez en `lib/produccion-reglas.ts`, con los mismos umbrales; (5) el botón
principal es «Crear y abrir orden» (a 375 px el anterior se recortaba ~21 px); (6) dos clics en el mismo instante envían **una** llamada (marca síncrona); (7) si se corta la conexión, el aviso dice
«no podemos confirmar si llegó a guardarse» (antes «No se guardó nada», falso si la base sí guardó); (8) Escape, clic fuera y «Cancelar» con trabajo escrito preguntan «¿Salir sin guardar?» (el mismo
hook de «Registrar gasto»; elegir solo el tipo o el modo no cuenta como trabajo).

## Qué cambió

| Antes | Ahora |
|---|---|
| Un modelo que no existía obligaba a salir de Producción, crearlo en Productos (si la cuenta podía) y volver a abrir la orden a mano | «Nueva orden ▸ Modelo nuevo»: nombre, categoría, tallas, colores, precio y cantidades; un solo botón («Crear y abrir orden») |
| Quien opera el Taller sin permiso de catálogo dependía de un líder para cada modelo nuevo | Puede crearlo; nace `pendiente` y se usa de inmediato |
| Un nombre repetido solo se descubría al fallar el alta | La pantalla ofrece «Usar ese modelo» o «Es otro modelo, crearlo igual» |
| Sin modelos: aviso y botón apagado | «+ Crear el primer modelo» abre la misma hoja |
| El margen y el semáforo del líder dependían de que la red respondiera | Los ve siempre; un modelo sin precio lo dice |
| Al guardar el alta completa, las salidas eran fotos, otro parecido o la lista | Si venía de una orden, la salida principal es «Abrir la orden de producción/muestra» |

## Despliegue (el orden importa)

Vercel publica la web al fusionar con `main`; la migración la pega Felipe en producción (SQL Editor, una sola parte: solo una función y sus permisos). **La
migración va PRIMERO.** Si se publica la web antes, «Modelo nuevo» muestra «Crear un modelo desde la orden todavía no está activo en la base de datos» (la
pantalla no se cae y lo escrito se conserva), pero nadie puede usarlo. Antes de pegarla, ensayo con `begin; …; rollback;`. La migración comprueba al inicio que
`abrir_produccion(uuid, uuid, jsonb, numeric, numeric, numeric, boolean, date, text, uuid)` exista con esa firma exacta y aborta sin crear nada si no.

## Se rompe si

- `abrir_produccion` cambia de firma (el ancla de la migración lo detecta; la prueba SQL también).
- `productos_estado_alta_biut` deja de marcar `pendiente` a quien no edita el catálogo: el modelo del Taller nacería aprobado sin que nadie lo revise.
- Alguien agrega una talla o un color sin pasar por el vocabulario (la validación por conjuntos lo frena).
- El Taller deja de ser `ubicaciones.tipo = 'taller'`.
- La web cambia el nombre de un parámetro del RPC: `lib/modelo-nuevo-reglas.test.ts` compara los nombres contra la firma de la migración y contra
  `packages/database/src/types.ts`.

## Alternativas descartadas

- **Copiar el alta del catálogo dentro de la hoja** (formulario propio con todas sus reglas): la razón de la primera versión de este ADR (Nuevo producto es página
  propia por decisión escrita; la base exige tejido y patrón; nombre único por marca; tallas por categoría). Duplicaría esas reglas y se desfasaría de ellas
  (principio 3; «una función, una pieza», ADR-0358). La segunda parte no copia nada: pide lo mínimo y deja que la base valide.
- **Llamar `crear_producto_con_variantes` desde la orden:** exige `fn_puede_editar_catalogo()`, justo lo que el Taller no tiene.
- **Material (tela) en texto libre, como en julio:** devuelve el problema de V1. El tejido es vocabulario y lo completa quien edita el catálogo.
- **Ampliar el margen a todo el Taller:** es un permiso sobre dinero y precios; es de Felipe.

## Lo que «pendiente» significa hoy (corregido el 2026-10-10)

La primera versión de este ADR llamó «hueco» a que la web no tenga pantalla para aprobar o rechazar los productos `pendiente`. **Es una decisión anterior de Felipe, no
un olvido:** el 2026-10-02 quitó el aviso «Pendiente de revisar» de Editar producto («no me sirve»; `docs/bitacora/2026-10-02-product-edit-local-ad1952.md`). La base
sigue marcando `estado_alta = 'pendiente'` y `revisar_producto_censo` sigue existiendo, pero ninguna pantalla la llama y Existencias trata una pendiente «como cualquier
otra» (`lib/existencias-catalogo-reglas.ts:25-27`). Un modelo creado desde la orden por quien no edita el catálogo **se usa y se vende sin que nadie lo apruebe**; si se
creó por error, se descontinúa en su ficha. Por eso la pantalla de éxito **no** dice «queda pendiente de un líder» (sería falso). Lo que sí sigue abierto, y es de
Felipe (dinero): si quien opera el Taller debe fijar el precio de venta de un modelo del catálogo (decisiones 3, 4 y 9). Otra sesión trabaja en una pantalla de
revisión («Por revisar», ADR-0371); esta rama no la toca.

## Cómo se verifica

- **Reglas puras** — `lib/modelo-nuevo-reglas.test.ts` (55 pruebas): vocabulario (solo categorías hoja, tallas activas en su orden), problemas del borrador, líneas y
  parámetros del RPC, lectura de los errores de la base y de la función ausente; dos pruebas con semilla fija (2.000 borradores: «si no falta nada, lo que se manda
  cumple la regla de la base»; 3.000: la guía de foco y la validación dicen lo mismo); la paridad de nombres con la migración y con los tipos generados; y que
  **ningún `<Boton>` del formulario envíe sin querer** (todos llevan `type="button"`). Comprobado por mutación: se rompió una regla y la prueba falló en tres lugares.
- **Base** — `pnpm pruebas:abrir-produccion-modelo-nuevo` (35 casos contra el Postgres local, todos con `ROLLBACK`; los 15 de /chaos nacieron como el ataque que los encontró y 12 de ellos fallan contra la migración vieja): un líder crea el modelo y abre su orden en una
  llamada; un colaborador del Taller sin permiso de catálogo también (nace `pendiente`) y uno con Productos lo crea `aprobado`; un token; una transacción (si la orden
  falla no queda modelo); permisos (otra sede, otra ubicación, `anon`); precio; vocabulario (talla de otra categoría, color inexistente, celda repetida, cantidad en
  cero o con decimales, matriz vacía); nombre idéntico y casi igual; y que la migración se pueda volver a pegar.
- **Navegador** (copia de `main`, componentes reales, servidor de la base simulado): éxito; nombre repetido → «Usar ese modelo»; casi igual → «crearlo igual» con
  el mismo token y `p_confirmo_distinto = true`; función ausente; vocabulario caído (el botón queda apagado); y sin modelos. **El recorrido encontró un error real:**
  los botones del aviso no tenían `type="button"` y, dentro del `<form>`, «Usar ese modelo» volvía a enviar la orden (dos llamadas al servidor). Corregido y con prueba.
- **Datos reales en local (2026-10-10, como líder, web de la rama contra el Postgres local `:54421` con la migración aplicada):** el modelo «Prueba Short Taller A» nació
  `aprobado` con código `SHO-0001`, 3 variantes a S/ 85,00 con costo 0, sin marca/proveedor/tejido/patrón, y su orden `en_proceso` con 6/4/2 y token; la comparación de
  datos mostró exactamente 9 tablas tocadas (productos, variantes, códigos, orden y líneas) y **ninguna** de `stock` ni `movimientos`.
- **`/chaos`, semilla 1010** (informe local `docs/taller-vista-inicial/chaos-informe-produccion-ordenes-2026-10-10.md`, no versionado): 19 ataques corridos y 1 que no aplica; 13 resistieron
  sin reparo y 6 dejaron hallazgos (8 por causa, de gravedad 2 a 4, ninguno de gravedad 1; los 12 detectores de la base sin violaciones nuevas). **Tras los arreglos se volvieron a correr
  los mismos ataques con la misma semilla** (el 2026-10-10, web de la rama contra la base local con la migración nueva): nombre de 300 y 5.000 letras y el carácter nulo, precios `0.001`,
  `12,50`, `1e9` y `100000`, y costos con coma, «S/», negativos y mil millones quedan **bloqueados con la frase a la vista**; el doble clic pasó de 2 llamadas a **1**; perder la respuesta dice
  la verdad y el reintento no duplica; Escape, clic fuera y Cancelar con datos preguntan, y sin cambios cierran directo; y los 30 parámetros hostiles directos a la función pasaron de 4 hallazgos y
  3 errores crudos a **ninguno** (queda el carácter nulo, que Postgres rechaza al leer el texto antes de entrar a la función). **Sigue abierto, y es de Felipe:** un costo `NaN` directo a `abrir_produccion`
  y los CHECK de las tablas.
- **`/formidable`** (`docs/formidable/produccion-nueva-orden.md`): primera corrida leyes 4,8 y oficio 5; prueba ciega con Opus (el ciego con Sonnet cayó dos veces por el filtro de seguridad) que
  completó la tarea a la primera en 42 acciones con 10 dudas. Tras aplicar los tres cambios, remedido al mismo ancho: del nombre a «Cuántas por talla y color» hay **413 px (0,46 pantallas) y no 1.199 px
  (1,33)**; a 375 px el botón cabe. La prueba ciega **no se repitió**: la nota de la ley 1 sigue provisional.
- **No verificado todavía:** la pantalla de un colaborador del Taller **sin** permiso de catálogo en el navegador (solo en SQL, casos 2 y 2b; los pasos para verla están en
  el backlog); un cierre de orden con costo `NaN` (el CHECK `>= 0` lo admite: [inferido]); la prueba ciega después de los cambios; y la pasada de `/formidable` con 3 a 5 colaboradoras reales.
