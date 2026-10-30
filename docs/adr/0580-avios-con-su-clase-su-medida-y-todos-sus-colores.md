# ADR-0580 — El avío: su clase, su medida y todos sus colores en una sola hoja

- **Fecha:** 2026-10-30 · **Estado:** **decidido por Felipe el 2026-10-30** (cuatro decisiones, abajo) y **construido** en la rama `claude/avios-colors-attributes-e155bc`. **El SQL (`20261030144000`) todavía NO está pegado en producción.**
- **Nace de:** Felipe, 2026-10-30: «en los avíos también hay colores, corrige esos errores, hazlo así como en tela, fácil de registrar; en avíos hay botones, cierres, pretinas, no lo sé, investiga y date cuenta de todo lo que se necesita para registrar bien; el apartado de nueva tela mejoró bastante, pero debería compartir la misma información de atributos y mostrármelo para poder elegir con mayor facilidad, y darme la opción de registrar nuevo material y nuevo color y sincronizar con los atributos».
- **Cierra:** el hallazgo **G16 de ADR-0554** («“Nueva tela” existe solo para la tela; hilo, cierres, botones y elástico siguen siendo un alta por color»). **Completa:** ADR-0554 (la tela con sus colores), ADR-0513 (`producto_avios`, cuyo `DESCARTÉ` decía textualmente «Insumos no tiene familia de avíos; inventarla es otro módulo» — esto es ese módulo), ADR-0284 (guía de foco), ADR-0290 (sugerencias coherentes) y ADR-0534 (un valor de vocabulario nace aprobado).
- **Investigación:** cinco lentes en paralelo (dominio textil, base de datos, radio de explosión, pantalla y atributos) más un escéptico por recomendación; 6 de 20 recomendaciones cayeron en la refutación.

## El problema

Para registrar seis botones nácar de colores, una persona abría «Nuevo avío» seis veces y tecleaba seis códigos inventados a mano; si repetía uno, se enteraba al guardar, con el error crudo de Postgres (`NuevoInsumoModal.tsx:109`). El combo «Color» tenía **un solo valor** y decía «Sin color», mientras la hoja de tela de al lado ofrecía los 103 colores con buscador y «+ Nuevo color». La hoja le pedía **«Merma al cortar (%)» a un botón** y le pedía color a una etiqueta de composición, que no tiene; después decía «Faltan: … De qué color es» aunque nada bloqueara.

Y dos cosas más graves, que no se ven:

1. **El sistema no sabía que un botón es un botón.** `insumos.tipo` solo vale `tela` o `avio` (`20260917145000:63`), así que la medida que de verdad distingue un avío de otro —18 L de línea, 40 cm de largo, 3 cm de ancho, título 40— terminaba escrita **dentro del nombre**. Medido en producción: `retail.fn_clave_texto('Boton nacar 18mm')` y `fn_clave_texto('Boton nacar 18 mm')` **no son iguales** (`20260912235500_vocabulario_cerrado.sql:39-46` colapsa espacios, no los borra), así que el candado `materiales_nombre_tipo_unico` dejaba entrar **dos fichas del mismo botón, cada una con su stock, sin un solo error**.
2. **La unidad del avío se congela para siempre.** `fn_insumos_unidad_firme` (`20261028172000`, en producción) la fija en cuanto cualquier fila apunta al insumo, y el mensaje es «Crea otro insumo con la unidad correcta». La hoja proponía **«unidad» para todo avío** (`UNIDAD_SUGERIDA = { avio: "unidad" }`), también para el hilo, que se compra en **conos de ~5.000 m**. El primer cono de hilo ingresado con esa hoja habría quedado mal medido para siempre, en silencio.

**El radio de explosión es cero.** Consultado en vivo el 2026-10-30 (`vovjyyiafkxteijimpuy`): **0 avíos** en `retail.insumos`, 0 en `materiales`, 0 recetas de avío (`producto_avios`), 0 líneas de orden de insumo. Nada que migrar; por eso los candados nuevos se pueden exigir de entrada.

## Las cuatro decisiones de Felipe (2026-10-30)

1. **Arranca con seis clases más «Otro»:** Botón (unidades), Cierre (unidades), Hilo (**conos**), Etiqueta (unidades), Elástico y cinta (metros), Pretina (metros). Nadie en el repo sabía qué avíos compra CAYLA —la única lista era un texto de ayuda, `insumos-reglas.ts:14`, y «pretina» no aparecía en ningún documento del Taller—, así que se arranca con lo probable y Felipe lo corrige **sin deploy**, en Catálogo ▸ Atributos ▸ Avíos. **DESCARTÓ** esperar a darme la lista exacta (un turno de bloqueo) y arrancar sin clases (la hoja más simple, pero el sistema seguiría sin saber que un botón es un botón).
2. **Sin unidad de compra con factor, por ahora.** Una caja de 144 se anota como 144. **DESCARTÓ** el factor (`unidades_por_compra`) porque hay **cuatro** funciones que abren lotes (`recibir_insumo`, `recibir_orden_insumo`, `recibir_comprobante_produccion`, `encontre_tela`) y **ninguna lee `unidad_compra`**: el factor sin la conversión haría entrar «10 docenas» al libro como 10 unidades, un faltante de ×12 que nadie ve. Va junto con la conversión kilo→metro de la tela (actividad 4 de ADR-0554, nunca construida).
3. **Un avío lo crea quien opera el Taller, igual que una tela.** «Quien tiene la caja de botones en la mano la registra.» **DESCARTÓ** dejarlo del líder (cero cambios en producción, pero dos hojas hermanas con reglas distintas, y la hoja ni lo avisaba: reventaba al guardar). **No cambia:** el saldo inicial con su costo sigue siendo del líder (`saldo_sin_lider`), y corregir una ficha también (`editar_material`).
4. **El color del avío sale de la MISMA carta de colores de las prendas**, con «+ Nuevo color» desde la hoja. **Ganas:** un negro es un negro, y «Nueva orden» podrá proponer sola el avío del color de la prenda. **Pagas:** un color de proveedor creado desde el Taller entra a la carta que se usa al vestir una prenda, nace aprobado (ADR-0534) y quema su código de 3 letras para siempre. La hoja lo avisa antes. **DESCARTÓ** una carta propia del Taller — que además no era una opción real: `insumos.color_codigo` ya es llave foránea dura a `colores(codigo)` desde el 14-oct (`20261014154000:73`).

## Lo que decidí yo

**DECIDÍ: la clase de avío es una TABLA que el líder amplía (`retail.avio_clases`), con un CHECK CERRADO de `comportamiento` del que cuelgan las reglas** (`pieza · largo · ancho · titulo · etiqueta · otro`). **DESCARTÉ** el CHECK fijo de clases (una clase nueva exigiría un deploy, y es justo lo que Felipe no sabía todavía) y **DESCARTÉ** la tabla con las reglas editables: una regla editable que determina una unidad **irreversible** es un estado imposible esperando su turno. Es el híbrido que el repo ya tiene dos veces: `categorias` (tabla + `familia` CHECK de 6) y `colores` (tabla + `familia_color` CHECK de 9). **SE ROMPE SI** las reglas se indexan por el nombre visible: se indexan por el **prefijo** y por el **comportamiento**, nunca por el nombre (ADR-0290 lo exige).

**DECIDÍ: la medida va en columnas (`medida_valor`, `medida_unidad`) y el nombre que se LEE lo compone la base.** `fn_insumos_copias_de_la_tela` arma «Botón nácar 18 L · Negro» para cada color, y `lib/avio-clases-reglas.ts` dice exactamente lo mismo en la web (con punto decimal, como `trim_scale`; su prueba lo exige valor por valor, y `scripts/pruebas/materiales.mjs` V15 lo comprueba contra la base). El candado de nombre repetido pasó a ser **(nombre, tipo, medida)**: dos medidas del mismo botón son dos fichas a propósito; la misma medida dos veces no entra, ni escrita distinto. **DESCARTÉ** dejar la medida dentro del nombre (medido: `fn_clave_texto` no pega «18mm» con «18 mm») y **DESCARTÉ** un segundo eje de variante en `insumos` (medida × color): `20261026152000:22-23` ya decidió que «una etiqueta de la S y otra de la M son DOS avíos», y tocar `insumos_material_color_unico` rompería la simetría exacta de la que viven «retirar color», el candado de unidad y las invariantes de `/chaos`. **SE ROMPE SI** alguien escribe la medida DENTRO del nombre **además** de ponerla en su campo: quedan dos fichas legítimas para la base. La hoja lo evita mostrando el nombre compuesto mientras se escribe («Se va a llamar «Hilo poliéster título 40».») y avisando de la ficha parecida, pero la base no puede impedirlo sin prohibir los números en un nombre.

**DECIDÍ: el alta pasa por `crear_material` + `agregar_colores_a_material`, las mismas de la tela, y la hoja vieja se retira.** **DESCARTÉ** arreglar `NuevoInsumoModal.tsx` en su sitio: era el último `.insert` directo a `insumos` de toda la web, y nacía sin código derivado, sin token de reintento, sin candado de concurrencia y sin línea en Actividad. **SE ROMPE SI** nadie traduce los mensajes: por eso `crear_material` y `editar_material` ahora dicen «el avío» o «la tela» según el caso, en vez de una palabra de sistema.

**DECIDÍ: la merma solo existe en lo que se mide en metros.** «Merma al cortar» es lo que se pierde de cada corte: un botón no se corta. La regla es por **unidad**, no por clase (un elástico por metro sí la lleva), y la hace cumplir `fn_material_leer` (`merma_sin_metro`), no solo la pantalla.

**DECIDÍ no tocar tres cosas:** el conversor `fn_materializar_insumos_sueltos` se queda con su `and i.tipo = 'tela'` (convertiría 0 filas y hay una prueba que lo exige); los papeles ya emitidos no congelan nombre ni código (con 0 órdenes de insumo no hay nada que proteger); y `producto_avios` no cambia (apunta por `insumo_id`, no por código, así que el nombre compuesto no rompe ninguna receta).

## El esquema, en una línea cada uno

| Qué | Dónde | Por qué |
|---|---|---|
| `retail.avio_clases` | tabla nueva | nombre, `prefijo` único (el principio del código: `BOT-01`), `comportamiento` (CHECK de 6), `unidad_sugerida`, `pide_color`, `orden`, `activo` |
| `materiales.clase_id` | columna nueva | **obligatoria en un avío** (`materiales_avio_con_clase`), **prohibida en una tela** (`materiales_clase_solo_avio`) |
| `materiales.medida_valor` + `medida_unidad` | columnas nuevas | `linea · milimetro · centimetro · titulo`; van las dos o ninguna; solo en un avío; con tope |
| `materiales_nombre_tipo_medida_unico` | índice (reemplaza a `materiales_nombre_tipo_unico`) | dos medidas del mismo nombre son dos fichas; la misma medida dos veces, no |
| `fn_medida_texto` / `fn_medida_cuadra` | funciones nuevas | la misma tabla de verdad que la web; sus dos pruebas la comparan |
| `fn_codigo_de_material(nombre, tipo, clase)` | sobrecarga nueva | el prefijo sale de la CLASE (`BOT-01`, no `NAC-01` para «Nácar grande»). La de dos argumentos delega; la de tres va **sin default**, o `fn_codigo_de_material('x','y')` quedaría ambigua (42725) y rompería `crear_material` de golpe |

## Lo construido

- **Base** (`supabase/migrations/20261030144000_avios_clase_medida_y_quien_los_crea.sql`, **dos partes**: la tabla, las columnas, los candados y las funciones; y la política de `avio_clases` sola y al final, ADR-0195). Re-ejecutable, sin `drop trigger`, sin `select … into` dentro de un texto entre comillas (ADR-0288).
- **Lógica pura:** `lib/avio-clases-reglas.ts` (qué unidad propone cada comportamiento, si lleva color, qué medida pide, cómo se dice una medida, cómo se compone el nombre, el prefijo libre de una clase nueva) y `lib/avio-nuevo-reglas.ts` (`problemasDeAvioNuevo` es la ÚNICA regla con la que la hoja decide si guarda). Sus dos pruebas, 54 casos.
- **Pantalla:** `components/insumos-taller/NuevoAvioModal.tsx` (reemplaza a `NuevoInsumoModal.tsx`, retirado) y `components/AvioClasesLista.tsx` (Catálogo ▸ Atributos ▸ **Avíos**, la pestaña nueva), más `app/api/produccion/avio-clases/route.ts`.
- **Lo que la hoja hace y la vieja no:** pregunta PRIMERO la clase; propone su unidad y **avisa que es irreversible**; pide la medida que esa clase pide y rechaza la que no; arma el código con el prefijo de la clase; ofrece los 103 colores con buscador, carta y «+ Nuevo color»; una fila por color con su saldo inicial, su costo y su mínimo; manda un token (un reintento no duplica nada); y una clase que no lleva color (la etiqueta) ni siquiera lo pregunta.
- **Registros al día:** guía de foco (`guia-de-foco-pantallas.ts`), guía interactiva (cuatro pasos nuevos en `guias/pantallas/produccion.ts`, uno en `catalogo.ts`, las dos huellas aceptadas **después** de revisar la demo), sugerencias por clase (`sugerirAvio`, indexada por prefijo), y `produccion-corte-de-red.test.ts`, que ahora exige a las dos hojas de alta lo que hace innecesaria la frase honesta: su **token**.

## La guía de foco encontró dos contradicciones reales

La prueba de los 19 escenarios (ADR-0284: «lo que la guía dice que falta tiene que ser lo mismo que la validación bloquea») se puso en rojo dos veces, y las dos eran bugs de verdad:

1. Una **etiqueta con medida escrita**: `problemasDeAvioNuevo` la rechazaba y la guía decía «todo listo», porque para una etiqueta no dibujaba el campo de medida. Ahora lo dibuja cuando hay algo escrito que sobra.
2. Un **botón con merma escrita**: lo mismo con la merma, que solo se dibuja si el avío se mide en metros.

Y una tercera, al corregirlas: `problemasDeAvioNuevo` no miraba al **responsable** y la guía sí. Ahora lo mira, que es lo que hace cierto el contrato «`problemas…` es la única regla con la que la hoja decide si guarda».

## Verificación

- **Base privada** con las 981 migraciones del repo (Postgres 17 de Homebrew, puerto propio, sin tocar la base compartida): **0 errores**, la migración repegada encima sin efecto.
- **`pnpm pruebas:materiales`: 143/143** (antes 119; 24 casos nuevos, grupo V). **Prueba de mutación:** con `fn_medida_cuadra` devolviendo siempre `true` y sin el CHECK `materiales_avio_con_clase`, **tres casos se ponen en rojo** (V2b, V8, V16) — la suite no está ciega.
- **Las 14 suites de Postgres que tocan insumos**, todas en verde: `insumos_candados` 24/24, `ordenes_insumo` 53/53, `produccion_ficha_consumo` 21/21, `produccion_punta_a_punta` completo, `roles_cobertura_modulos` 32/32, y las demás.
- **La web:** `tsc` limpio; las 746 suites de vitest; `lib/avio-clases-reglas.test.ts` y `lib/avio-nuevo-reglas.test.ts` (54 casos).
- **En el navegador, con login real y guardando de verdad** (entorno local con Postgres + PostgREST + puerta de Auth): se creó `HIL-01` «Hilo poliéster título 40», clase Hilo, **en conos**, con dos colores (`HIL-01-NEG` «Hilo poliéster título 40 · Negro» y `HIL-01-CRU` «… · Crudo»), y Actividad anotó «creó el avío «Hilo poliéster título 40» (HIL-01) con 2 colores». Revisado en escritorio (1440), en **modo oscuro** y a **375 px**; y la pestaña Catálogo ▸ Atributos ▸ Avíos con las siete clases.

**No verificado:** `/chaos` formal sobre la hoja; `/formidable` con una persona sin contexto; `pnpm --filter web tema:auditar` con sus escenarios nuevos; `guias:recorrer` contra el navegador (las huellas se aceptaron tras revisar los pasos a mano, no tras un recorrido); y `pnpm datos:generar:produccion` / `datos:comparar`, que piden el volcado de producción.

## Lo que queda (no construido)

1. **La unidad de compra con factor** (gruesa, ciento, caja), junto con la conversión kilo→metro de la tela: decisión 2 de Felipe, y no se hace una sin la otra.
2. **Que «Nueva orden» proponga el avío del color de la prenda.** Ahora es posible por primera vez —`producto_avios` ya guarda el color de la PRENDA y el avío ya tiene color propio—, que es justo lo que ADR-0513 había descartado por no existir la familia de avíos.
3. **Un candado para que no nazca otro avío suelto**: endurecer `insumos_insert_lider` a `with check (fn_es_lider() and material_id is not null)`. No entró aquí porque hay 40 inserts de avío suelto en 13 suites de `scripts/pruebas/` que corren como `postgres` y habría que revisarlos uno por uno.
4. **Los dos avíos sueltos de la base local de prueba** (y, el día que existan, los de producción) no se convierten en ficha: el conversor sigue siendo solo de telas, a propósito.
