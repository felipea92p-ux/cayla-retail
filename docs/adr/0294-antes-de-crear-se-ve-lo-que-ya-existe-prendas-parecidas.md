# ADR-0294 · Antes de crear, se ve lo que ya existe: la alerta de «prendas parecidas» en Nuevo producto

- **Fecha:** 2026-09-30 · **Estado:** construido (rama `claude/cayla-product-deduplication-b2f0da`, PR abierto para que Felipe lo fusione). Solo web, **sin migración y sin tocar producción**: es la Fase 1. Probado con pruebas y con una página temporal que monta el
  formulario real con respuestas de ejemplo para la base; **no probado con una cuenta real** (ver «Cómo se verifica»).
- **Número:** 0294. Se tomó primero el 0293 (el último en `origin/main` era el 0292) y, al subir, otro PR ya había fusionado el 0293 («descuento por etiqueta»): se
  renumeró aquí, en la bitácora, el backlog, `docs/ARQUITECTURA.md`, `docs/SESIONES-ACTIVAS.md`, la investigación y el README de la maqueta.
- **Pedido:** Felipe, 2026-09-29: que agregar un producto no cree la **misma prenda dos veces con nombres distintos**; comparar por marca,
  categoría y tiempo, con foto y stock a la vista, y que el sistema no decida por la persona («cada uno lo interpreta a su manera»). Felipe,
  2026-09-30, sobre la primera maqueta: en lugar de un «ya lo tenemos» grande, **una alerta en el resumen de la derecha, «para no estorbar»**; y
  confirmó el orden del formulario con «tal cual» (Marca y proveedor arriba del Nombre).
- **Evidencia y diseño:** `docs/investigacion/2026-09-29-duplicados-de-producto.md` (la sección 0 manda sobre lo que la contradiga).
  **Especificación visual aprobada:** `docs/maquetas/producto-buscar-primero-2026-09/` (`index.html` y `README.md`).
- **Complementa:** ADR-0260 (Nuevo producto en cuatro preguntas: no suma pasos ni campos), ADR-0283 (la marca es opcional), ADR-0284 (guía de foco),
  ADR-0285 (una identidad para todo el alta), ADR-0290 (los ejemplos de los campos), ADR-0292 (dónde se registró cada producto) y ADR-0109 (donde
  nacen `buscar_productos_parecidos` y el nombre único). **No cambia** ADR-0126 (nunca precio ni costo) ni ADR-0246, decisión 9 (el tiempo no decide).

## Qué había

- **La defensa compara solo el texto del nombre.** `retail.buscar_productos_parecidos(p_referencia, p_excluir_id)` (similitud de trigramas, corte
  0,5) y el índice único `productos_referencia_clave_unica` sobre `fn_clave_referencia(referencia)`, **global** (sin marca ni categoría). La pantalla
  (`components/alta-producto/AvisoParecidos.tsx`, `lib/use-parecidos.ts`) dice un nombre y una casilla «Es otro producto distinto»; no muestra foto,
  stock, marca ni cuándo se cargó, así que quien decide no tiene con qué.
- **El par que lo disparó no era una falla.** «Wide Leg» y «Wide Leg Corto Comfo» (Jirish, Jeans, mismo tejido y patrón) puntúan 0,474 contra un
  corte de 0,5: hoy no avisa, y es lo correcto, porque Felipe los juzgó **prendas distintas**. Lo que falta es que quien carga la segunda pueda
  **ver** la primera y comparar el diseño.
- **Ocho caminos por donde entra o se toca un producto** (informe, 2.1; solo cuatro funciones escriben en `productos` o `variantes`). Solo el
  primero, Nuevo producto, mira parecidos. Los huecos medidos, por gravedad:
  - **El Conteo** (`censo_crear_variante`) crea productos **sin comparar parecidos** y sin compuerta de permiso en el cuerpo de la función: cualquier
    cuenta autenticada puede ejecutarla (`components/conteo/AltaAlVuelo.tsx:160` es un campo de texto libre).
  - **La cola sin conexión** (`lib/useColaOffline.ts:114`): si otra sede ya creó el nombre mientras no había red, la operación queda «definitivo» y
    solo ofrece «Descartar», que **borra tallas, colores, precios, cantidades y fotos** de lo llenado.
  - **La carrera entre dos sedes** termina en un error de índice sin pista (`unique_violation`, 23505) que no reabre el paso del nombre. Inferida
    del código y de Postgres; no reproducida.
  - **No hay «Es el mismo» ni fusión:** la única función de fusión que existe es `unir_clientas`.
- **La palanca más grande no es el algoritmo, es el orden de la pantalla.** Un control que solo filtra por marca, sin comparar texto, ya acierta el
  91,1 % en recall@5, contra 79,5 % de la función actual (corpus sintético: sirve para comparar técnicas, no para prometer precisión).

## Decidí

1. **«Mismo producto» = mismo diseño.** La **foto** y el stock son la evidencia. El sistema **avisa y ordena**; nunca decide ni fusiona, nunca
   preselecciona una respuesta. Una reedición es prenda nueva «siempre y cuando el diseño sea diferente».
2. **La ayuda es una alerta compacta en el resumen de la derecha** (entre la ficha y «Avance») **más una hoja «Ver y comparar» bajo demanda**
   (`<Modal variante="hoja">`, ADR-0136). En celular y tablet no existe ese panel: la misma alerta pasa a una **tira sobre la barra inferior**
   (`data-barra-ficha`) y la hoja abre a pantalla completa. Cuatro tonos del sistema: informativa (pizarra), ámbar, rojo (solo lo que frena) y
   neutra. La tarjeta dice **qué vio** («Coincide el código: SS25 311»), nunca «es la misma» ni «son distintas». Hay un solo botón lleno en el paso
   (el de «Seguir»): «Es el mismo diseño» no empuja.
3. **Marca y proveedor sube arriba del Nombre; sigue OPCIONAL y la guía de foco NO la señala.** «Sigue aquí» va al primer campo requerido por hacer,
   el Nombre. Con la marca elegida la lectura de lo que ya existe de esa marca empieza antes de que se escriba una letra. Esto **reemplaza lo que
   mostraba la maqueta** (D11: marca «sugerida» con «Sigue aquí» en `#inicio` y `#sinmarca`), que **no se construyó**. La alerta **no depende de
   que haya marca**: sin marca, o con la marca comodín «Importado», la lista sale de la **categoría** con buscador (D5). En el código,
   `camposDelAlta` (`lib/alta-producto-guia.ts`) sube la entrada `marca` antes de `nombre` (cosmético: `requerido: false, sugerido: false`).
4. **No hay campo «Código de la marca»** (D3). El código («SS25 311», «79-SS24», «G44») se **lee del texto** que ya escriben en nombre y descripción
   (`codigoDeMarca`, `lib/parecidas-alta-reglas.ts`). El buscador de la hoja acepta un código. **Un código distinto no prueba otro diseño** (una
   reedición cambia de código): solo baja un poco el orden y se muestra sin veredicto; un código solo **ordena y rotula**, un texto **filtra**.
5. **Las etiquetas de los campos no se renombran** («Nombre», «Descripción», «Marca y proveedor», «Tejido», «Patrón»). Lo nuevo es texto de la
   alerta y de la hoja, no un cambio de campo.
6. **Fase 1 sin tocar producción: solo lecturas que ya existen.** `fn_productos` (por marca, con todas sus categorías; sin marca, por la categoría),
   la tabla `productos` (descripción, tejido, patrón, temporada y `created_at`, que `fn_productos` no trae), `fn_existencias_productos` (stock por sede
   **en cantidades**, sin apartadas, dañadas ni en camino: ADR-0270), `fn_producto_origen` (en qué sede se registró cada producto: ADR-0292) y, de
   contexto, `fn_temporadas`, `ubicaciones`, `variantes` y `producto_fotos`. No hace falta la RPC `buscar_existentes_alta` del plan. **«Cargada en
   Tienda TRU» sale de `fn_producto_origen`, no se infiere** (corrige la sección 0.2 del informe, que proponía inferirla de quién propuso la prenda);
   sin fila, la tarjeta dice solo «hace X h».
7. **«Es el mismo diseño» abre la ficha del existente** (`/productos/<id>/editar`, donde ya están «Agregar tallas» y «Agregar colores»): D2 = solo
   variantes. **No suma unidades** (se registran en Recibir) y **lo llenado en el paso no se guarda**: la tarjeta lo dice antes de tocar, no después.
8. **Solo frena el idéntico exacto**, con la misma clave que la base (`claveReferencia` espeja a `fn_clave_referencia`: sin tildes, espacios ni
   puntuación: «Polo G 44» es «Polo G44»). **Excepción honesta de la Fase 1: «una letra de diferencia».** La base sigue rechazándola
   (`nombre_casi_igual`) salvo `p_confirmo_distinto = true`; la maqueta decía que «Polo G45» frente a «Polo G44» ya no frenaba, y eso **no es cierto
   hasta que cambie la base**. Por eso «Crear» espera a que la persona responda «No, es otro diseño» a esa prenda en la hoja, y entonces manda
   `p_confirmo_distinto = true`. La constante `CASI_IGUAL_FRENA_EN_BASE` (`lib/parecidas-alta-estado.ts`) se apaga el día que la base deje de exigirlo.
   La frase de esa falta pasó a «Confirma que es otro diseño (mira la prenda parecida), o ábrela.», idéntica en `lib/alta-producto.ts` y en
   `lib/alta-producto-guia.ts` (una prueba exige que coincidan).
9. **El candado sale de la BASE, prenda por prenda; la alerta solo dibuja** (`lib/parecidas-alta-estado.ts`). Si la base marca algo y la pantalla
   nueva no puede hablar de esa prenda (la lectura carga, falló o no la trajo), vuelve la casilla de siempre (`AvisoParecidos`, con `respaldo`): nunca
   un «Crear» apagado sin salida (principio 9). Sin red no hay alerta ni hoja. El aviso rojo del idéntico vive **también en línea, bajo el campo
   Nombre**, porque un error que frena debe verse junto al campo donde se produce; lo mismo el ámbar de «casi igual» (con «Ver y comparar») mientras
   «Crear» espera esa respuesta, y el rojo del nombre reservado «Prenda sin Registrar» (el producto de las ventas, que la base no ve por no tener categoría).
10. **El puntaje es la forma «A» de la investigación, en el navegador, puro y probado** (tokens con léxico de prendas, peso por rareza, conflictos por
    campo y marca y categoría como **peso blando en el orden**, nunca como veto). Peso estático, sin corpus en el navegador: el puntaje de una
    candidata no cambia cuando aparece otra. Lo que sí acota es la **lectura**: con marca se lee toda la marca elegida (todas sus categorías) y se
    suman, aparte, las prendas de otra marca que la comprobación de nombres de la base marcó (`idsExtra`), para que un idéntico o una letra de
    otra marca llegue con su tarjeta. El **material** (tejido, patrón) es pista débil, sin veto (D10). **El corte 0,48 es provisional**
    (`UMBRAL_PARECIDA_PROVISIONAL`): solo decide el color de la alerta (ámbar o informativa), **nunca frena**.
11. **La lista se muestra siempre, ordenada** (`ordenarConMotor`, `lib/parecidas-alta-reglas.ts`). Primero el nivel (idéntico, una letra, parecida,
    contexto); dentro de cada nivel, la descontinuada al final (con chip apagado «Descontinuada»), luego la que más se parece (por bandas), luego la
    de la misma marca y categoría y solo a igual fuerza la más reciente y, si empatan, la que tiene stock. **El tiempo ordena y rotula («hace 6
    min»); nunca filtra** (D4).
12. **Tiempos:** la alerta espera 0,6 s tras teclear (vaciar el campo es inmediato); el candado no espera (usa el nombre de ahora). Un solo pulso de
    entrada al cambiar de nivel, sin bucle y apagado con `prefers-reduced-motion` (ADR-0136). Las lecturas son consultas GET o RPC `fn_*` (prefijo de la
    lista de lectura de `lib/espera-reglas.ts`), así que el loader global (ADR-0149) no bloquea la pantalla mientras se busca.

### Dónde vive cada cosa

| Pieza | Archivo (`apps/web/`) | Qué hace |
|---|---|---|
| Contrato | `lib/parecidas-alta-tipos.ts` | `CandidataAlta`, `ConsultaAlta`, niveles, `UMBRAL_PARECIDA_PROVISIONAL` |
| Reglas (puras) | `lib/parecidas-alta-reglas.ts`, `lib/parecidas-lexico.ts`, `lib/parecidas-alta-fixtures/` | ordenar, nivel, motivo, código leído, `buscarEnHoja` |
| Lectura | `lib/candidatas-alta-datos.ts` (mapper puro), `lib/candidatas-alta-lector.ts` (lector y control: carrera, plazo y memoria), `lib/useCandidatasAlta.ts` | se queda solo con las columnas del contrato: **precio y costo no se guardan** |
| Vista (pura) | `lib/parecidas-alta-vista.ts` | todos los textos (`TEXTO`, `FRASE`), el tono, las filas y qué frena |
| Pegamento | `lib/parecidas-alta-estado.ts`, `lib/useParecidasAlta.ts` | candado desde la base, revisadas, pausa, respaldo; devuelve un superconjunto de `useParecidos` |
| Pantalla | `components/alta-producto/AlertaParecidas.tsx`, `TarjetaParecida.tsx`, `HojaParecidas.tsx`, `TiraParecidas.tsx`, `ParecidasDelAlta.tsx` | alerta, tarjeta, hoja, tira, aviso bajo Nombre y «Revisa: N parecidas · Ver» |
| Estilos | `app/estilos/alta-parecidas.css` (importado en `app/globals.css`) | solo tokens de `globals.css` |
| Integración | `components/NuevoProductoForm.tsx`, `components/alta-producto/FichaPrevia.tsx` | orden del paso 2, pie, «Avance» y la prop opcional `parecidas` |

**Guía de foco (ADR-0284):** `/productos/nuevo` sigue `aplicada`; `HojaParecidas.tsx` se declara `no-aplica` en `MODALES`
(`lib/guia-de-foco-pantallas.ts`, con su motivo: un solo campo opcional y una respuesta por prenda; lo que falta y lo que sigue lo dicen la alerta y
el pie del paso 2). `MODALES_PENDIENTES_HOY` no cambia. Las parecidas **no son un campo** ni entran a `camposDelAlta`: «Revisa: N parecidas · Ver»
es una línea sugerida que nunca apaga «Seguir».

## Descarté

- **Un bloque grande «¿Ya la tenemos?» dentro del formulario** (el diseño de la primera maqueta). Felipe: «para no estorbar». *Ganas:* el
  formulario queda corto y el resumen es donde la gente ya mira «qué falta». *Pagas:* un aviso periférico se puede pasar por alto. Se mitiga con el
  pulso, la línea en «Avance», el pie del paso y el rojo en línea; y la fase posterior registra si se abrió «Ver y comparar» para decidir con datos si
  hace falta hacerlo más visible (informe, sección 12).
- **Fusionar solo, preseleccionar «Es el mismo» o destacarlo.** Unir dos prendas distintas es el error caro (mezcla stock, costos y ventas), y la
  precisión de «Es el mismo» en validación fue 0,885 [0,760–0,977] contra 0,95 buscado: preseleccionar sesga a la persona (anclaje).
- **Un LLM en el guardado y embeddings.** Rompen el principio 9 (dependencia externa dentro del formulario de las cuatro sedes); un LLM sin ejemplos
  dio precisión 71 % con recall 98 % en un benchmark de productos y tiende a decir «mismo», que es el error caro; los embeddings miden cercanía y no
  identidad, y esos son justo los hermanos peligrosos (Lara/Lora, G44/G45). Tampoco `unaccent`, `fuzzystrmatch` ni `vector` (informe, 5.5).
- **Un campo nuevo «Código de la marca»** (P11 del informe): un `alter` de tabla en uso para algo que el texto ya trae. Felipe preguntó si era necesario;
  no lo es en la Fase 1.
- **Filtrar por tiempo o por temporada.** Como filtro duro, el recall@5 baja de 0,964 a 0,929 (90 días), 0,848 (30 días) y 0,839 (misma temporada), y
  choca con ADR-0246, decisión 9 (un modelo que el Taller repite es el mismo producto). Solo ordena y rotula.
- **La marca como veto en el puntaje.** Un bloqueo duro por marca y categoría pierde entre 2,7 % y 16,7 % de los duplicados verdaderos según el supuesto
  de cuánto se equivocan al elegirla, y con marca equivocada el aviso de la mejor técnica cae de 0,94 a 0,01. En el puntaje es un peso; sin marca manda
  la categoría (D5).
- **Limpiar el vocabulario** (tejidos, patrones; D9). Felipe: «ya han registrado los reales». No se toca nada de producción.
- **Renombrar etiquetas** («Nombre del modelo», «Cómo es el diseño»). No las aprobó.
- **La RPC nueva `buscar_existentes_alta`** (P4 del informe): `fn_productos` + una consulta a `productos` + `fn_existencias_productos` +
  `fn_producto_origen` alcanzan sin tocar producción.
- **Tokens puros del nombre, Levenshtein, Jaro-Winkler, fonética.** No mejoran la línea base en PR-AUC o la dejan peor en falsas alarmas (informe, 4.4).

## Se rompe si

1. **El corpus sintético no es el mundo.** Todas las cifras de algoritmo salen de 485 registros (46 % de grupos duplicados) escritos por un LLM con las
   mismas creencias que el léxico; hay pocos productos reales y casi todos de una sede. Sirven para comparar técnicas, no para prometer precisión.
   El léxico es una foto sin calibrar con altas reales.
2. **La prevalencia real es baja.** Con 5 % de altas duplicadas, la precisión del aviso baja de 0,80 a 0,35 (unas 14 alertas por cada 100 altas, de
   las que 5 son reales). Por eso la pantalla **muestra una lista y no interrumpe**: solo frena el idéntico.
3. **La marca es equivocada o es un comodín.** Sin marca real el aviso se apaga (0,94 a 0,01). Por eso sin marca manda la categoría (D5) y
   «Importado» se reconoce **por nombre** (`NOMBRES_COMODIN_DE_MARCA` en `lib/parecidas-alta-estado.ts`; no hay constante en la base). Otras marcas comodín
   están por decidir. Y como la lectura se acota por la marca elegida, una marca equivocada esconde de la lista a las prendas de la marca correcta
   (salvo las que la comprobación de nombres de la base marque); el segundo anillo «otras marcas con nombre casi idéntico» y la marca partida
   (Divas / Divas Now) **no están cubiertos** en la Fase 1.
4. **El corte 0,48 es provisional.** Hasta tener altas reales etiquetadas (fase posterior) solo pinta el tono de la alerta.
5. **Una marca que nombra sus prendas por código** («Polo G44», «Polo G45»…) verá a todas sus hermanas avisar siempre: un código distinto no baja del
   corte (decisión de Felipe). Se revisa con altas reales.
6. **El mismo nombre en otra marca.** La base sigue rechazándolo aunque sea de otra marca (el nombre es único global hasta la fase posterior, D1) y la
   pantalla guía a agregarle el modelo. Es provisional.
7. **Sin foto no se compara el diseño a la vista.** Solo una de las ocho prendas de la investigación tenía foto: la tarjeta dice «Sin foto todavía» y
   no finge con la muestra del tejido (cinco jeans mostrarían el mismo denim). Pedir la foto más temprano queda por decidir.
8. **La base cambia por debajo.** Si se cambia `buscar_productos_parecidos` o `crear_producto_con_variantes` sin apagar `CASI_IGUAL_FRENA_EN_BASE`, la
   pantalla frena lo que la base ya deja pasar (o al revés). Cualquier cambio a esas funciones parte de `pg_get_functiondef` de producción.
9. **Una carrera entre dos sedes** sigue terminando en un 23505 sin pista: no reabre el paso del nombre (comportamiento de hoy, no empeora). Con la
   alerta atrasada por la pausa tras teclear, el texto puede ir un paso atrás del candado; el candado siempre es el de la base.

## Fases posteriores (cada una necesita el OK de Felipe y, si toca producción, SQL pegado por él)

| Fase | Qué | Dónde vive / qué toca |
|---|---|---|
| **2a** | **Sumar variantes Y unidades en un gesto** («Es el mismo diseño» que registra lo que la persona trae, en su sede, en una transacción; D2, opción 2) | función nueva que escribe stock (`sumar_variantes_a_producto`), firma con `fn_actor_persona_id(true)` y `ComboResponsable` (ADR-0161); respeta `variantes_identidad_unica` |
| **2b** | **Cerrar la carrera entre sedes** y quitar el bloqueo «una letra» | `crear_producto_con_variantes`: capturar `unique_violation` y responder `nombre_duplicado` con el id del ganador; `left join categorias`; apagar `CASI_IGUAL_FRENA_EN_BASE`. Partir de la definición real de producción |
| **2c** | **Nombre único por marca** (D1, decidida) | índice `productos_referencia_clave_unica` → `(marca_id, clave)` con `NULLS NOT DISTINCT`; tabla en uso: en PARTES (ADR-0195) |
| **3** | **Registro de decisiones en modo sombra** (incluye si se abrió «Ver y comparar») | tabla de solo agregar `decisiones_parecido`, RLS sin políticas; fija el corte y decide si la alerta hace falta más visible |
| **4** | **Cerrar el Conteo** (D7) | `censo_crear_variante` con `fn_ve_modulo('conteos')` y el mismo buscador compacto en `AltaAlVuelo.tsx`; coordinar con la sesión del Conteo |
| **4** | **Cola sin conexión** | «Es el mismo diseño» en vez de solo «Descartar». (`nombreEnCola` de `lib/cola-offline.ts` ya compara con la clave de la base, `claveReferencia`: hecho en la revisión final.) |
| **5** | `productos.codigo_marca`, herramienta de fusión (molde `unir_clientas`), retirar `catalogo_crear_producto` | solo si hace falta (el código ya se lee del texto) |

## Lo que queda a decisión de Felipe

1. **«Polo G45» frente a «Polo G44».** En la Fase 1 «Crear» espera la respuesta «No, es otro diseño», porque la base hoy lo rechaza. La maqueta decía
   que no frenaba: solo será así con la fase 2b. ¿Se acepta esa diferencia mientras tanto?
2. **«Revisa: N parecidas · Ver»** hoy solo sale en el pie del **paso 2**. ¿Se repite junto a «Crear producto» en el paso 4?
3. **«Crear producto» en escritorio (resuelto en la revisión final, 2026-09-30).** Con la alerta el resumen es más alto que una pantalla de 900 px. El
   `<aside>` de `FichaPrevia.tsx` lleva tope de alto (`lg:max-h-[calc(100dvh-3rem)]`); la ficha, la alerta y «Avance» corren por su cuenta y «Cancelar /
   Crear producto / Siguiente» quedan FIJOS abajo: el botón se ve a 900, 800 y 720 px de alto. Queda la decisión de si la alerta muestra dos filas o tres
   (hoy dos), ahora que ya no tapa el botón.
4. **Pedir la foto al crear** (punto 8 de «Falta confirmar»): sin foto no se compara el diseño a la vista.

## Cómo se verifica

- **Pruebas** (desde `apps/web`; en el repo `pnpm --filter web test <ruta>`, en este árbol se corrió con `./node_modules/.bin/vitest run`):
  `lib/parecidas-alta-reglas`, `lib/parecidas-alta-vista`, `lib/parecidas-alta-estado`, `lib/candidatas-alta-datos`, `lib/useCandidatasAlta`,
  `lib/useParecidasAlta`, `lib/alta-producto-guia` (la marca va antes del nombre y «Sigue aquí» sigue en el nombre aun con foco en la marca),
  `lib/guia-de-foco` (`HojaParecidas.tsx` declarada) y `lib/reglas-sin-uso` (pasa: `tramoDeCodigo` limpia el código de la descripción en
  `descripcionSinCodigo` y `codigoDeMarca` rotula el código buscado en `buscarEnHoja`). `tsc --noEmit` y `eslint` sobre los archivos nuevos.
- **En el navegador, con una cuenta real** (lo que falta): `/productos/nuevo` → Jeans → marca **Jirish**: el resumen dice que ya hay 2 prendas de esa
  marca, con foto o «Sin foto todavía», y «Ver y comparar» muestra colores, tallas y «Disponibles» por sede **sin precios ni costos**. Teclear
  «Wide Leg Corto» pone primero a «Wide Leg Corto Comfo» y el campo Nombre no se mueve. Tocar «Es el mismo diseño» abre
  `/productos/<id>/editar` y avisa antes que lo llenado no se guarda. Un nombre idéntico a uno existente deja «Seguir» apagado con el rojo bajo Nombre.
  «Polo G44» sobre «Polo G45» hace que «Crear» espere la respuesta de la hoja. Apagar la red o tumbar la lectura deja la casilla de siempre.
  Capturar a 375 px y a 1280, 1440 y 1920 px y compararlas con la maqueta (regla del spike de Finanzas, aplicada a esta pantalla).
- **Producción, solo lectura** (2026-09-30): existen `buscar_productos_parecidos(p_referencia, p_excluir_id)`, `censo_crear_variante`, `unir_clientas`,
  `fn_producto_origen`, `fn_existencias_productos`, `fn_productos`, `fn_temporadas` y el índice `productos_referencia_clave_unica`.

**No verificado al escribir esto:** una alta real desde la web; la lectura real de `fn_productos`, `fn_producto_origen` y `fn_existencias_productos` con
una cuenta (la página de prueba usó respuestas de ejemplo); la casilla de respaldo; «Crear otro parecido» con la lista que trae la base (el código
vacía nombre y descripción y llama a `reiniciar()` en `NuevoProductoForm.tsx`, `otroParecido`); el pulso y `prefers-reduced-motion` en un sistema
real; el anuncio del lector de pantalla; Safari de una tablet de tienda; el peso de la lectura en una tablet. La página temporal `app/auth/` **no va
al commit**.
