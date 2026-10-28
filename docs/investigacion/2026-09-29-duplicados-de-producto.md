# Duplicados de producto: que las cuatro sedes hablen de la misma prenda

**Para:** Felipe Alvarez · **Fecha:** 2026-09-29 · **Estado:** investigación cerrada; no toca código ni base · **Autor:** arquitecto (Claude)

**Cómo leerlo.** **La sección 0 (actualización del 2026-09-30) va primero y manda sobre lo que la contradiga.** La sección 1 cabe en una página y alcanza para decidir. Las secciones 2 a 8 son la evidencia y el diseño. La 9 es el plan por pasos, la 10 son las decisiones que solo tú puedes tomar. El apéndice dice cómo reproducir cada cifra.

**Convención de citas.** Las líneas `archivo:línea` son de la rama de este trabajo (`5f5488ad`). `origin/main` está hoy 64 commits adelante (`c2b1284d`), y allí las líneas cambian: `useParecidos` está en `NuevoProductoForm.tsx:238` aquí y en `:260` en `origin/main`. Hay que traer `origin/main` antes de tocar cualquier archivo (paso P0).

**Cómo leer las cifras de rendimiento.** Producción tiene 9 productos: no alcanza para medir nada. Todas las cifras de algoritmo salen de un **corpus sintético** de 485 registros (8 reales más 477 inventados a mano y por perturbaciones), con 46 % de grupos duplicados. Sirven para **comparar técnicas entre sí**, no para prometer cuánta precisión tendrá el sistema. Cuando una cifra dependa de un supuesto, lo digo al lado.

- **PR-AUC:** 1,0 es separar perfecto los duplicados de los que no lo son. Al azar, en este corpus, da 0,41.
- **recall@5:** de cada 100 altas que sí eran de una prenda ya existente, en cuántas la prenda correcta aparece entre las cinco primeras de la lista.
- **Aviso falso en primeras altas:** de cada 100 prendas realmente nuevas, cuántas mostrarían un aviso sin motivo.
- **Falsa alarma dura:** de cada 100 «gemelos» que son prendas distintas (Polo G44 y Polo G45), cuántos cruzan el umbral y se confundirían con la misma.
- Los intervalos `[a–b]` son intervalos de confianza al 95 % por bootstrap de grupos.

---

## 0. Actualización del 2026-09-30 (léela primero: manda sobre lo que contradiga el resto)

**Por qué existe.** El informe se escribió antes de que Felipe respondiera y antes de comprobar varias cosas contra producción y `main`. Esta sección corrige o reemplaza lo que ya no vale; el resto se conserva como evidencia.

### 0.1 Decisiones de Felipe (2026-09-29 y 2026-09-30)

| Tema | Decisión |
|---|---|
| **Qué es «el mismo producto»** | **El mismo diseño.** «Wide Leg» y «Wide Leg Corto Comfo» (Jirish, Jeans, Denim, Liso) son **prendas distintas**. Una reedición es prenda nueva «siempre y cuando el diseño sea diferente». Consecuencia: la **foto** es la evidencia principal y el botón dice «Es el mismo diseño». El código de la marca ayuda, pero no decide |
| **Cómo se ve la ayuda** | **Una alerta compacta en el resumen de la derecha** y una hoja «Ver y comparar» bajo demanda, no un bloque grande dentro del formulario (mensaje del 30-sep: «para no estorbar»). Solo frena el idéntico exacto |
| **Alcance** | **Fase 1 sin tocar producción**: con lecturas que ya existen. «Es el mismo diseño» abre la ficha del existente (**D2 = solo variantes**); las unidades y la carrera entre sedes son fases posteriores |
| **D1, índice único del nombre** | **Único por marca**, en una fase posterior (toca `productos_referencia_clave_unica`, con su OK y SQL pegado por él). Mientras tanto, la base sigue rechazando el mismo nombre aunque sea de otra marca, y la pantalla guía a agregarle el modelo |
| **D3, «Código de la marca»** | **No hay campo propio en la Fase 1** (Felipe preguntó si es necesario: no lo es, porque el código se lee del texto que ya escriben en nombre y descripción). El buscador de la hoja acepta un código. Una columna queda para otra fase si hace falta indexarlo |
| **D4, tiempo** | Solo ordena y rotula («hace 6 min»), «no sería preciso» |
| **D5, sin marca o «Importado»** | Lista de la **categoría** con buscador |
| **D10, material** | Pista débil, sin veto («cada integrante lo interpreta distinto») |
| **D9, limpieza del vocabulario** | **Descartada por ahora** («ya han registrado los reales»): no tocar tejidos, patrones ni nada de producción |
| **Etiquetas de los campos** | **Sin renombrar** (no aprobó «Nombre del modelo» ni «Cómo es el diseño»; «Tejido» y «Patrón» se quedan) |
| **D6, D7, D8** | D6 (autoaprobación) y D7 (permiso de `censo_crear_variante`) siguen abiertas. D8 (etiquetado): Felipe juzgó dos pares —el par de Jirish (**distintas**) y una reedición (**nueva si cambia el diseño**)—; otros dos pares eran ejemplos hipotéticos («Lara Camisa Negra», «Polo G45») y quedaron sin etiquetar |

### 0.2 Correcciones de hechos (comprobadas el 2026-09-30)

- **El par de Jirish no es una falla del sistema.** Las frases de 1, 2.2 y 2.3 que lo llamaban «falla», «duplicado plausible» o «candidato» están reescritas: hoy no avisa (correcto en este caso), pero tampoco le muestra a quien carga la segunda prenda cuál es la existente.
- **«Polo G45» y «Lara Camisa Negra» eran ejemplos del banco de pruebas, no datos reales.** Felipe los buscó en el sistema y no existían. Todo ejemplo inventado se rotula «Ejemplo».
- **La Fase 1 no necesita la RPC nueva `buscar_existentes_alta`.** Se arma con `fn_productos` (foto por variante, colores, tallas, marca y categoría), una consulta directa a `productos` para lo que `fn_productos` no trae (descripción, tejido, patrón, temporada y `created_at`; la política de lectura la permite a cualquier cuenta con sesión) y `fn_existencias_productos` (stock por sede en cantidades). **P4 pasa a opcional y P6 ya no depende de P4.** Comprobado contra la definición real: `fn_productos` no devuelve descripción, tejido, patrón, temporada ni cuándo se cargó.
- **«Cargada en Tienda X» se puede inferir.** Las 9 prendas reales tienen `propuesto_por`; la sede actual del autor es Tienda TRU en 8 de 9 y el primer movimiento de stock de las 9 está en Tienda TRU (el autor de «Polo G44» hoy no tiene sede asignada: ahí la tarjeta dice solo «hace X h»).
- **Producción tiene ahora 10 productos** (los 8 del cuadro 2.3, «Conjunto Chaleco + Pantalon Sastre» y el centinela). Ninguna conclusión cambia.
- **Numeración de ADR.** Donde este informe cita «ADR-0283» para «una sola identidad del alta», es el **ADR-0285**; el ADR-0283 es «producto sin marca ni proveedor».
- **`censo_crear_variante`.** Confirmado en producción: es `SECURITY DEFINER` y cualquier cuenta autenticada puede ejecutarla; no tiene compuerta de módulo (`fn_puede_editar_catalogo()` solo decide si hereda precio y costo de una hermana). Sí captura `unique_violation`: en el Conteo la carrera entre dos escaneos se resuelve sola.
- **Otras sesiones ya cambiaron este paso.** La guía de foco (ADR-0284: `camposDelAlta` en `lib/alta-producto-guia.ts`, con 41 pruebas) fija el orden y el estado de cada campo, y la marca opcional (ADR-0283) ya está en producción. Reordenar el paso 2 obliga a tocar esas reglas y sus pruebas.
- **Textos de 6.2 y 6.3 sustituidos.** «Es la misma / No, es otra prenda» pasan a «Es el mismo diseño / No, es otro diseño»; sin tarjeta destacada; un solo botón lleno por pantalla (el de «Seguir»). Vale la maqueta `docs/maquetas/producto-buscar-primero-2026-09/`.
- **Plan de la sección 9:** P4 opcional; P6 = alerta en el resumen y hoja «Ver y comparar»; P11 (campo «Código de la marca») aplazado; P12 (limpieza) descartado por ahora.

### 0.3 Lo que se gana y se paga con la alerta en el resumen

*Ganas:* no estorba, el formulario queda corto y el resumen es donde la gente ya mira «qué falta». *Pagas:* un aviso periférico se puede pasar por alto, y en celular no existe el panel derecho (pasa a una tira sobre la barra inferior). Se mitiga con un pulso de entrada, una línea en la lista «Avance», el pie del paso y el rojo en línea cuando frena. La regla de decisión de la sección 12 sigue valiendo: registrar si la persona abrió «Ver y comparar» permite decidir con datos si hace falta hacerlo más visible.

### 0.4 Qué se construyó (2026-09-30)

- **Fase 1 construida, solo web, sin migración y sin tocar producción** (PR abierto): ADR-0294 y `docs/maquetas/producto-buscar-primero-2026-09/README.md` («Qué se construyó»). Cubre P5 y P6: la forma A de 4.2 y 5.2 corre en el navegador (`lib/parecidas-alta-reglas.ts`, con el corte 0,48 provisional que solo pinta el color de la alerta), más la alerta en el resumen, la hoja «Ver y comparar» y la tira de celular y tablet.
- **P4 no se hizo ni hace falta:** las lecturas son `fn_productos`, la tabla `productos`, `fn_existencias_productos` y `fn_producto_origen`. **Esto corrige 0.2:** «Cargada en Tienda X» sale de `fn_producto_origen` (ADR-0292), no de inferir la sede de quien propuso la prenda; sin fila, la tarjeta dice solo «hace X h».
- **Marca y proveedor sube arriba del Nombre** (recomendación 1 de la sección 1) y **sigue opcional y sin señalar** en la guía de foco: «Sigue aquí» va al Nombre. Sin marca (o con «Importado») la lista sale de la categoría (D5). **No hay campo «Código de la marca»** (P11 aplazado): el código se lee del texto.
- **Solo frena el idéntico, con una excepción de esta fase:** la base sigue rechazando «una letra» (5.4, punto 2 queda para la fase posterior), así que «Crear» espera la respuesta «No, es otro diseño»; `CASI_IGUAL_FRENA_EN_BASE` lo apaga cuando la base cambie. El candado sale de la base, no de la alerta.
- **Sin construir** (cada una con su OK y SQL pegado por Felipe): P7 (sumar variantes y unidades; «Es el mismo diseño» hoy abre la ficha), P8 (carrera entre sedes), P9 (registro de decisiones en sombra), P10 (Conteo y cola sin conexión), nombre único por marca (D1), P11, P14 y P15. P12 (limpieza) sigue descartado.
- **No verificado:** nada se ha visto con una cuenta real ni con datos reales de la base (la prueba usó respuestas de ejemplo en una página temporal); tampoco el pulso, `prefers-reduced-motion` ni Safari de una tablet. Cualquier cifra de las secciones 3 y 4 sigue siendo de un corpus sintético.

---

## 1. Resumen para decidir

**El problema en una frase.** Hoy el sistema solo sabe comparar el **texto del nombre**, y cada integrante escribe distinto: la misma prenda puede nacer dos veces, el Conteo la crea en silencio, y nadie lo ve hasta que el stock ya está partido entre dos fichas. No existe ninguna función para reparar eso después.

**Lo que encontré**

1. **La defensa actual solo compara texto y no le enseña nada a quien decide.** *(Reescrito el 2026-09-30: ver la sección 0.)* «Wide Leg» y «Wide Leg Corto Comfo» (misma marca Jirish, categoría Jeans, tejido, patrón y temporada) puntúan 0,474 y el aviso exige 0,5: hoy no avisa, y en este caso es lo correcto, porque Felipe los juzgó **prendas distintas**; pero tampoco le muestra a quien carga la segunda cuál es la que ya existe, para que compare el diseño. «Lara Camisa» contra «Camisa Lara» (ejemplo del banco de pruebas, no un dato real) puntúa 1,000 pero solo informa. «Polo G45» contra «Polo G44» (ejemplo del banco de pruebas: no existe «Polo G45» en el sistema) bloquearía de más si fueran dos modelos legítimos. Y «Wide Leg» sí avisa, pero contra «Adelle Wide Leg», que es de **otra marca**.
2. **Dos caminos no miran nada.** El alta al vuelo del Conteo (`censo_crear_variante`) crea productos sin comparar parecidos, y hoy no exige ningún permiso dentro de la función. La cola sin conexión, cuando otra sede ya creó el nombre, solo ofrece «Descartar» y borra tallas, colores, precios, cantidades y fotos.
3. **No hay «Es el mismo» ni fusión.** Verificado en `pg_proc`: la única función de fusión que existe es `unir_clientas`. Corregir un duplicado hoy es rechazarlo y recargar a mano.
4. **La palanca más grande no es un algoritmo, es el orden de la pantalla.** Un control que solo filtra por marca, sin ninguna comparación de texto, ya acierta el 91,1 % en recall@5, contra 79,5 % de la función actual. Pedir la marca **antes** del nombre vale más que cualquier fórmula.
5. **Qué sirve y qué no.** Tokens puros (Jaccard, contención, coseno) no mejoran la línea base en PR-AUC (0,47–0,58 contra 0,52). Sirve combinar: leer descripción, tejido y patrón; una capa de conflictos por campo (código de marca distinto, pack, largo, patrón); y la marca como peso. Con eso PR-AUC llega a 0,91–0,93. Embeddings, LLM en el guardado, fonética y Levenshtein sobre el nombre entero no aportan (sección 4).
6. **Ninguna lectura del «intervalo de tiempo» sirve como filtro.** Como filtro duro, el recall@5 baja de 0,964 a 0,929 (90 días), 0,848 (30 días) o 0,839 (misma temporada). Como peso suave sube los avisos falsos. Sirve para **ordenar y rotular** la tarjeta («Cargada hace 2 días»), no para decidir qué es el mismo producto.
7. **Las cifras no se transfieren tal cual.** Con 5 % de altas duplicadas (más realista que 46 %), la precisión del aviso baja de 0,80 a 0,35. Con marca equivocada en la consulta, el aviso de la mejor técnica cae de 0,94 a 0,01. Con 20 confusores que el corpus no tiene (línea niña, hombre, docena, repuesto), «Es el mismo» se activó en 6 de 20 casos con la técnica A y en 15 de 20 con la C.

**Lo que recomiendo**

1. **Marca antes del nombre** en el paso «¿Cómo es?».
2. **«¿Ya la tenemos?»**: lista de lo que ya existe de esa marca (todas sus categorías), con foto, colores, tallas, stock por sede y cuándo se cargó. Sin umbral: siempre se muestra, ordenada por parecido.
3. **Puntaje de orden en el cliente**, con la marca como **peso blando** y no como bloqueo duro (la forma de la técnica A, elegida por robustez, no porque gane en los números).
4. **Solo frena el idéntico exacto**, como decidiste. «Es el mismo» es un clic humano que suma tallas, colores y unidades al producto existente; nunca se preselecciona ni se fusiona solo.
5. **Registrar cada decisión** («Es el mismo» / «Es otro» / ignoró) en una tabla de solo agregar, y salir en modo sombra: los umbrales de «Puede ser» se fijan con datos reales, no con este corpus.
6. **Cerrar los caminos ciegos:** Conteo con el mismo buscador compacto; la carrera entre dos sedes devuelve al paso del nombre con el existente; la cola sin conexión ofrece «Es el mismo».
7. **Sacar talla y color del nombre** con una regla de formulario, y crear un campo **«Código de la marca»** (SS25 311, 79-SS24, G44), que hoy viven metidos en nombre o descripción en 3 de 8 productos.
8. **Limpiar el vocabulario** (tejidos, patrones) sin borrar nada, después de volver a medir: los datos cambiaron hoy.

**No instalar nada.** `pg_trgm` ya alcanza. `unaccent`, `fuzzystrmatch` y `vector` no aportan y son cambios compartidos con Dynamic.

**Lo que necesito de ti** (detalle y recomendación en la sección 10): índice único global o por marca (D1); qué suma «Es el mismo» (D2); campo código de la marca (D3); tiempo solo como orden (D4); qué hacer si no hay marca o es un comodín (D5); autoaprobación del vocabulario (D6); Conteo y su permiso (D7); 30 minutos tuyos etiquetando casos (D8); qué archivar del vocabulario (D9); peso bajo del tejido y del patrón (D10).

**Qué toca producción.** Los pasos P4, P7, P8, P9, P11, P12, P14 y P15 (sección 9), cada uno con tu OK antes. El resto es documentación, pruebas y código de pantalla.

---

## 2. Qué pasa hoy, con evidencia

### 2.1 Los ocho caminos por donde entra (o se toca) un producto

Verificado con una búsqueda por expresión regular sobre `pg_proc.prosrc` de todos los schemas en producción (proyecto `vovjyyiafkxteijimpuy`): solo **cuatro funciones** hacen `insert` en `productos` o `variantes`. Recibir mercadería y Producción no crean productos.

| # | Camino | ¿Mira parecidos? | Defensa real | Qué se duplica si falla |
|---|---|---|---|---|
| 1 | **Nuevo producto** (`/productos/nuevo`) → `crear_producto_con_stock_inicial` → `crear_producto_con_variantes` | Sí, por nombre | Idéntico y «una letra» frenan; «parecido» (≥ 0,5) solo informa; índice único global | Todo nombre que use otras palabras para lo mismo y no sea idéntico ni a una letra ni ≥ 0,5: «Blusa Lara» no encuentra «Camisa Lara» (ejemplo) |
| 2 | **Alta al vuelo del Conteo** → `censo_crear_variante` | **No** | Solo nombre exacto en la misma categoría: cuelga la variante del que hay e **ignora la marca elegida**; en otra categoría, error | Cada variante ortográfica crea un producto en silencio: «Camisa Larra», «Lara Camisa» y «Culote Petit Yani» habrían creado 3 |
| 3 | **Editar producto** → `catalogo_actualizar_producto` | Solo si cambia el nombre | Igual que 1, sin el bloqueo local | Cambiar marca o categoría no dispara nada |
| 4 | **Recibir mercadería** (`recibir_envio`, `recibir_lote`, `registrar_compra`, `regularizar_prenda`) | No crea | La prenda desconocida sale hacia `/productos/nuevo` sin nombre ni marca | Entrada indirecta al camino 1 (`PorRegularizarLista.tsx:231`) |
| 5 | **Producción / Taller** (`abrir_produccion`) | No crea | Recibe un `p_producto_id` que ya existe | Con dos fichas iguales, el taller abre la orden contra la equivocada y el costo se parte |
| 6 | `catalogo_crear_producto` | No | Sin `EXECUTE` para usuarios autenticados | Hoy nada; es código muerto que conviene retirar |
| 7 | Escritura directa por PostgREST | No | Las políticas `productos_write_lider` y `variantes_write_lider` la permiten a quien tenga `fn_puede_editar_catalogo()` | La web no lo hace; el candado «una letra» se salta |
| 8 | `buscar_productos_parecidos` (la función misma) | — | Ver 2.2 | — |

**Quién puede crear.** `fn_puede_editar_catalogo()` es verdadera para el líder y para cualquier rol con los módulos `productos` o `atributos`. Medido hoy: **12 integrantes y 13 líderes, los 25 activos** dan de alta directo y el producto nace `aprobado`. Hay 0 productos pendientes y 0 rechazados: no existe cola de revisión que mire duplicados.

### 2.2 Los huecos, ordenados por gravedad

| Gravedad | Hueco | Evidencia |
|---|---|---|
| Alta | El Conteo crea sin comparar y sin exigir permiso | `censo_crear_variante`: `EXECUTE` a `authenticated` y ninguna compuerta de permiso en el cuerpo; `AltaAlVuelo.tsx:160` es un campo de texto libre sin `useParecidos` |
| Alta | Ningún umbral de texto sabe si es el mismo diseño | `similarity` = 0,474 entre «Wide Leg Corto Comfo» y «Wide Leg» (dos diseños distintos según Felipe, 2026-09-30: aquí el silencio es correcto); `word_similarity` = 1,000 los trataría como iguales. Por eso la pantalla muestra foto y stock y decide la persona |
| Alta | La identidad es solo el nombre, global | Índice `productos_referencia_clave_unica` sobre `fn_clave_referencia(referencia)` sin marca ni categoría; `buscar_productos_parecidos` recibe solo texto |
| Alta | No hay «Es el mismo» ni fusión | Ver punto 3 del resumen |
| Alta | La cola sin conexión pierde el alta rechazada | `useColaOffline.ts:114` la clasifica «definitivo»; `ColaOfflineAviso` ofrece solo «Descartar» |
| Media | La carrera entre dos sedes termina en un error de índice sin enlace | 2.5 |
| Media | El aviso no muestra foto, stock ni marca, ni permite actuar | `AvisoParecidos.tsx:15` define `Parecido = { id, referencia, categoria, nivel }`; `use-parecidos.ts:49` descarta `categoria_id` y `similitud` |
| Media | Depende de haber elegido categoría, y ocurre antes de la marca | `NuevoProductoForm.tsx:238` (`activo: Boolean(categoriaId)`); el paso 2 pide Nombre y luego «Marca y proveedor» |
| Media | Un producto sin categoría es invisible | `buscar_productos_parecidos` hace `join categorias` (interno): `select buscar_productos_parecidos('Prenda sin Registrar')` devuelve 0 filas aunque el centinela existe |
| Media | Falso positivo «una letra» con códigos de modelo | «Polo G45» contra «Polo G44» = `una_letra` 0,636; hoy exige marcar la casilla «Es otro producto distinto» |
| Media | Orden de palabras y sinónimos | `pg_trgm` no ve el orden: «Lara Camisa» = 1,000 pero solo informa. «Blusa Lara» no encuentra «Camisa Lara» |
| Media | Sin pruebas | Ningún archivo de `scripts/pruebas` ejerce `buscar_productos_parecidos` ni el índice único |
| Baja | `catalogo_crear_producto` sigue definida y tipada | `packages/database/src/types.ts:5339` |

### 2.3 Los ocho productos reales

Los 8 se crearon el 2026-09-29 entre las 10:42 y las 12:06 (hora Lima): **84 minutos**. Solo «Camisa Lara» tiene foto. Hay 40 variantes. El catálogo se depuró el 28 y 29 de septiembre (61 eliminaciones en `historial_producto_cambios`), así que el 100 % de lo que existe tiene menos de una semana.

| Producto | Marca | Categoría | Temporada | Lo que la marca dejó escrito a mano |
|---|---|---|---|---|
| Camisa Lara | La Femme 21 | Camisas y Blusas | (*) | — |
| Palazo Billie | Wayi | Jeans | sin temporada | descripción «Palazo» |
| Culotte Petit Yani | Wayi | Jeans | sin temporada | descripción «Palazo» |
| Adelle Wide Leg | Pilar | Jeans | (*) | descripción «Palazo» |
| Wide Leg Corto Comfo | Jirish | Jeans | verano | descripción «wide leg corto - SS25 311 - C» |
| Wide Leg | Jirish | Jeans | verano | descripción «Wide leg - \|79-SS24» |
| Polo G44 | Krisstell | Polos | clásico | «G44» dentro del nombre |
| Polo Evaluna | Krisstell | Polos | clásico | — |

(*) Verificado el 2026-09-30: «Camisa Lara» es de primavera y «Adelle Wide Leg» de verano. Otras dos descripciones reales, «Manga larga, crop a rayas» y «Cuello escote redondo en U», existen pero los insumos no dicen a qué producto pertenecen.

Lo que muestran:

- **Cinco marcas, cinco combinaciones marca+categoría.** Tres de las cinco tienen dos productos (Wayi/Jeans, Jirish/Jeans, Krisstell/Polos). Un alta nueva con esa distribución vería en promedio 1,75 candidatos.
- **Los tres pares de misma marca y categoría son los que un texto no puede decidir:** Palazo Billie / Culotte Petit Yani = 0,03; Wide Leg / Wide Leg Corto Comfo = 0,474; Polo G44 / Polo Evaluna = 0,29. El único par que dispara el aviso actual (Wide Leg / Adelle Wide Leg, 0,563) es entre **marcas distintas**.
- **El par de Jirish son dos prendas distintas (Felipe, 2026-09-30).** Lo creó **una sola persona** (un líder de Tienda TRU, seis minutos entre uno y otro), no dos sedes, y sus códigos, SS25 311 y 79-SS24, ya lo sugerían. Felipe confirmó que son dos diseños: «Wide Leg» y «Wide Leg Corto Comfo». En el banco de pruebas ese par está etiquetado como negativo duro (`silueta_distinta`), que es coherente con su criterio: las cifras no cambian.
- **Tres descripciones dicen «Palazo» en dos marcas** para prendas llamadas Palazo, Culotte y Wide Leg. La misma silueta tiene tres nombres.
- **Tejido y patrón no separan nada:** 5 de 5 jeans son Denim, 7 de 8 productos son Liso, y en los tres pares de misma marca y categoría el tejido y el patrón son idénticos. Confirman, no excluyen.

### 2.4 El vocabulario (tejidos, patrones, tallas, marcas)

**Por qué se cuela basura.** El alta de un tejido o patrón inserta el nombre tal cual tras `.trim()` (`apps/web/app/api/productos/tejidos/route.ts:30`). El disparador `tejidos_estado_biut` marca el valor `aprobado` si `fn_puede_editar_catalogo()` es verdadera, y lo es para integrantes y líderes. Desde el 2026-09-25 se crearon **17 valores** (9 tejidos, 3 patrones, 5 tallas) y los 17 nacieron autoaprobados, sin nota (9 por integrantes y 8 por líderes). El aviso «un Líder tiene que aprobarla» (`ProponerValor.tsx:93`) nunca aparece para nadie.

**El único chequeo previo** es igualdad exacta sin tildes ni mayúsculas (`ProponerValor.tsx:75-76`). El índice único usa `fn_clave_texto`, que no quita puntuación ni plural: «Cable-knit» y «Cable knit» son claves distintas y ambos pasan.

**Empuje al comodín.** `NuevoProductoForm.tsx:94` dice que Indumentaria **exige** tejido y patrón, y no hay salida «no sé / mezcla». Lo observado: «Tela» e «Hilo» (genéricos), «lana» en minúscula y «pruebaTEJIDO» (verificado hoy: sigue aprobado y activo, 0 productos, ofrecido en Pantalones).

### 2.5 Correcciones a cifras que circulaban

Un escéptico volvió a medir en producción al final de la sesión. Estas cifras cambiaron o no se sostienen:

| Se dijo | Hoy |
|---|---|
| 85 marcas, 80 proveedores, 47 categorías | **82 marcas, 78 proveedores, 45 categorías** |
| Marcas de prueba («Prueba», «prueba marca1», «dfsdf»), proveedores y categorías de prueba | **Ya no existen** (alguien las depuró hoy). «pruebaTEJIDO» sí sigue |
| 37 movimientos | **39** (entrada 32, ajuste 2, salida 2, traslado 3) |
| Integrante = 17 de 25 | **12 integrantes y 13 líderes.** El mecanismo de fondo se confirma |
| De los 17 valores autoaprobados, 15 por integrantes y 2 por líderes | **9 y 8** |
| Los dos «Wide Leg» los crearon dos sedes | **Una sola persona**, de Tienda TRU |
| `censo_crear_variante` la usa quien tenga el módulo Conteos | **Cualquier cuenta autenticada:** no hay compuerta en el cuerpo de la función |

Consecuencia: todo lo que dependa de esas cifras, sobre todo la limpieza de la sección 8, **se vuelve a medir antes de ejecutar**.

### 2.6 La carrera entre dos sedes y la cola sin conexión

**Carrera.** TRU y AQP dan de alta «Blusa Aurora» a la vez, con dos `token_cliente` distintos. `crear_producto_con_variantes` no toma ningún candado por nombre; el candado que hay (`pg_advisory_xact_lock`) es por token y solo cubre el reintento del mismo intento. Las dos pasan la comprobación previa; la segunda espera en el índice único y falla con error 23505. Como todo es una transacción, no queda producto, variante ni stock. Lo que ve esa persona: `NuevoProductoForm.tsx:504-516` solo reabre el paso 2 si el error trae el aviso `nombre_duplicado` o `nombre_casi_igual` (`alta-producto.ts:447`). Un 23505 llega como aviso flotante con la frase de `error-escritura.ts:110`, **sin enlace, sin foto y sin volver al nombre**.

Esto lo infiero de la semántica de Postgres y del código; no lo reproduje porque las escrituras a producción están prohibidas. El contraste sí es verificable: en el Conteo la misma carrera se resuelve sola, porque `censo_crear_variante` captura `unique_violation` y cuelga la variante del ganador.

**Cola sin conexión.** Sin red, la op se guarda en `localStorage` (`cayla:productos:cola`) y las fotos en IndexedDB. `nombreEnCola` (`cola-offline.ts:152`) compara solo contra la cola de ese navegador y normaliza distinto que la base: quita tildes pero no puntuación, así que «Polo G 44» y «Polo G44» son el mismo nombre en la base y distintos en la cola. Al volver la red, si otra sede ya creó el nombre, la op pasa a rechazo y **nunca se reintenta**. El aviso rojo solo se dibuja dentro de `/productos/nuevo`. El único botón es «Descartar», que borra la op y sus fotos («No quedó nada registrado en el sistema»). Mientras tanto, las prendas físicas están en la tienda sin registrar.

---

## 3. El problema formalizado

### 3.1 Qué problema es

**El problema.** Dos sedes cuentan la misma prenda con nombres distintos y nadie se entera. Los libros dicen «resolución de entidades» (*entity resolution*): decidir cuándo dos fichas describen el mismo objeto del mundo real. En CAYLA, el objeto es un **modelo** (la Lara), no una talla ni un color: «Blusa Aurora Roja» y «Blusa Aurora» son el mismo producto, y el color y la talla son variantes.

**Analogía.** Es el molde de la Lara en el taller. Da igual quién lo llame «Lara», «Camisa Lara» o «la de crop rayado»: tiene que haber una sola ficha, con todas sus copias por color y talla colgando de ella.

**Cómo se ve mal hecho.** Dos fichas del mismo modelo, cada una con su stock parcial; el taller abre la orden contra una y las ventas salen de la otra. Como `movimientos` es de solo agregar (principio 4), deshacerlo no es un `update`.

**Dónde verlo.** Índice `productos_referencia_clave_unica` (supabase/migrations/20260918230000_producto_nombre_una_sola_forma.sql); función `retail.buscar_productos_parecidos` en la misma migración; `apps/web/lib/use-parecidos.ts:41`.

### 3.2 Los dos errores no cuestan igual

- **Unir dos prendas distintas** (Polo G44 con Polo G45) es el peor error: se mezclan stock, costos y ventas. Nunca se auto-fusiona.
- **Dejar dos fichas de la misma prenda** es el error barato: se arregla con una herramienta de fusión posterior. Por eso el sistema se sesga hacia **mostrar de más** en la lista, pero **interrumpir de menos**.

### 3.3 Las tres zonas

La resolución de entidades clásica (Fellegi y Sunter, 1969) reparte cada par en tres zonas con dos umbrales:

| Zona | Significa | Qué hace la pantalla |
|---|---|---|
| **Es el mismo** | Evidencia fuerte | Tarjeta destacada con «Es la misma: sumarle mis tallas y colores». Nunca preselecciona ni fusiona sola |
| **Puede ser** | Hay que mirar | Lista ordenada, una tarjeta por candidato, sin interrumpir |
| **Nuevo** | Nada parecido | No muestra nada; el campo Nombre queda libre |

**Cómo se entra a «Es el mismo» sin umbrales calibrados.** Solo por una regla exacta: misma clave de nombre (hoy, `fn_clave_referencia` igual). Todo lo demás se ordena por puntaje pero no se etiqueta hasta tener datos reales (sección 12).

### 3.4 Por qué marca + categoría + tiempo acotan (y dónde no)

**Idea.** No se compara la prenda nueva contra todo el catálogo, sino contra lo que ya hay de **esa marca**. Es buscar en el estante de la marca en vez de en toda la bodega. El libro lo llama **bloqueo** (*blocking*).

**Cuántos candidatos deja** (simulación Monte Carlo con semilla fija; las distribuciones son supuestas, solo las 85 marcas y 47 categorías de partida son medidas):

| Catálogo | Reparto supuesto | Media | p95 |
|---|---|---|---|
| 500 productos | 85 marcas × 43 categorías, uniforme | 0,13 | 1 |
| 500 | 85 marcas × 18 categorías de indumentaria | 0,32 | 1 |
| 500 | concentrado 80/20 en marca y categoría | 1,37 | 4 |
| 500 | marcas especializadas en 3 categorías | 6,4 | 12 |
| 500 | marcas especializadas en 1 categoría | 19,1 | 31 |
| 2.000 | concentrado 80/20 | 5,5 | 13 |
| 2.000 | marcas especializadas en 1 categoría | 76 | 109 |

Hoy las 5 marcas con producto trabajan una sola categoría, pero con una muestra ínfima. En el corpus sintético, el bloque marca+categoría de las consultas duplicadas tiene **mediana 2 candidatos** (p90 5, máximo 8) y solo la marca, mediana 4.

**Lectura.** Con 500 productos el filtro por marca y categoría basta para hojear tarjetas sin comparar texto. Con 2.000 y marcas especializadas ya no alcanza solo, y el orden por parecido deja de ser cosmético. Por eso el texto es **orden dentro de la lista**, no portero.

**Dónde el bloqueo pierde.**

- **Marca o categoría mal elegida por la otra sede.** Un bloqueo duro por marca y categoría pierde entre 2,7 % (corpus sintético) y 16,7 % (simulación con 12 % de alias de marca y 15 % de categoría vecina supuestos) de los duplicados verdaderos. Ambas cifras dependen de un supuesto, y ese supuesto, cuánto se equivocan los integrantes al elegir marca y categoría, es lo único que no está medido. Ya pasó una vez con las categorías: 6 productos se re-archivaron el 17–18 de septiembre (Blusas a Camisas y Blusas: 5; Polos V1 a Polos: 1). Jeans contiene palazo, culotte y wide leg, y Pantalones también los admitiría.
- **Marca propia y comodines.** La marca CAYLA (Taller) puede concentrar el catálogo (si fuera el 35 % repartido en 12 categorías, cada alta vería unos 15 candidatos: supuesto, no medido). «Importado» es un comodín, no una marca.
- **Marca opcional.** Desde #620 (ADR-0283), `marca_id` puede ser NULL.

Por eso el diseño usa la marca como **peso** y ofrece un segundo anillo («otras categorías de esta marca», «otras marcas con nombre casi idéntico») en vez de excluir.

**El tiempo, las dos lecturas.**

| Lectura | A favor | En contra (medido) |
|---|---|---|
| **A. Temporada con su año derivado** | La columna y su lista cerrada ya existen; el año se calcula con `fn_ocurrencia_temporada` y `temporada_fechas` (12 filas, 2026–2028) | Es opcional: 2 de 8 son NULL y 2 de 8 son «clásico», que no tiene ventana. **Choca con ADR-0246 decisión 9:** un modelo que el Taller repite es el mismo producto. Las temporadas no llevan año: los dos jeans de Jirish figuran «verano» con códigos SS25 y SS24 |
| **B. Ventana según fecha de alta** | `created_at` existe y no exige que nadie elija nada | Hoy es degenerada: 8 de 8 en 84 minutos. Una ventana de 6 meses dejaría fuera justo el caso del Taller que repite un modelo |

**Resultado del benchmark (familia C).** Como filtro duro, el recall@5 baja de 0,964 (sin tiempo) a 0,929 con ≤ 90 días, 0,848 con ≤ 30, 0,143 con ≤ 7 y 0,839 con misma temporada. Como peso blando no mejora PR-AUC ni recall, y sube los avisos falsos en primeras altas (días +0,087 [0,047–0,133]; temporada +0,033). Además, los pesos que el modelo aprendió («otra mitad de temporada» = −5,0 bits) son un artefacto del generador del corpus, que nunca hace cruzar la mitad de temporada. **Conclusión:** el tiempo ordena y rotula; no decide.

---

## 4. Algoritmos evaluados y resultados

### 4.1 Cómo se midió

- **Corpus:** 485 registros (8 productos reales, 261 escritos a mano, 216 generados por perturbaciones etiquetadas), 130 grupos de duplicados (280 pares positivos), 150 registros sueltos, 175 «negativos duros» con motivo escrito y 21 tipos de variación (orden de palabras, sinónimo, anglicismo, error de tipeo, código de marca en el nombre, etc.).
- **Partición:** entrenamiento y validación 50/50 por hash de la componente de grupos unidos por negativos duros, para que ningún negativo duro cruce la partición. Los scorers nunca ven `grupoId` ni `variacion`. Los umbrales se eligen solo con entrenamiento; la validación se corrió una vez por scorer congelado.
- **Fidelidad de la línea base:** las cuatro funciones de producción se leyeron con `pg_get_functiondef` y su puerto a JavaScript coincide en 680 pares con producción y en 240.100 pares con `nombres-parecidos.ts`. Un recálculo independiente reprodujo las métricas titulares y 45 JSON salieron idénticos byte a byte al volver a correrlos.
- **Flujo «buscar primero»:** para cada alta posterior de un grupo, se busca contra las altas anteriores y se mira en qué lugar sale la correcta.

### 4.2 Tabla comparable (validación, corpus sintético)

| Técnica | PR-AUC pares [IC95] | recall@1 flujo | recall@5 flujo | recall@5 una palabra | Aviso falso en primeras altas | Falsa alarma dura (aviso) | «Es el mismo»: precisión [IC95] / recall |
|---|---|---|---|---|---|---|---|
| **Línea base Postgres** (`similarity` ≥ 0,5) | 0,517 [0,42–0,65] | 0,795 [0,714–0,863] | 0,795 | 0,179 [0,109–0,261] | 0,453 | 0,866 | umbral inalcanzable |
| **Línea base cliente** (`nombres-parecidos.ts`) | 0,463 | 0,679 | 0,688 | 0,375 | 0,407 | 0,753 | inalcanzable |
| Solo bloquear por marca, puntaje constante (control) | — | 0,580 | 0,911 | — | — | — | — |
| Tokens puros del nombre (Jaccard, contención, coseno; con y sin léxico) | 0,469–0,583 | 0,77–0,93 | 0,89–0,98 | 0,44–0,57 | 0,47–0,68 | 0,69–0,88 | inalcanzable |
| Coseno del texto completo con léxico (nombre, descripción, tejido, patrón) | 0,706 [0,592–0,818] | 0,929 | 0,991 | 0,545 | 0,467 | 0,711 | inalcanzable |
| B8: Soft-TF-IDF sobre el nombre | 0,638 [0,522–0,763] | 0,964 | 0,973 | 0,57 | 0,40 | 0,70 | inalcanzable |
| B10: mezcla logística de caracteres (sin marca) | 0,745 [0,651–0,850] | 0,920 | 0,97 | 0,52 | 0,31 | 0,58 | 0,95* / 0,18 |
| B11: B10 con marca y categoría | 0,795 [0,694–0,892] | 0,964 | 0,982 | 0,97 (con marca) | 0,24 | 0,52 | 0,95* / 0,22 |
| **C: Fellegi-Sunter compuesto** (estratificado) | 0,914 [0,862–0,957] | 0,938 | 1,000 | 0,946 (con marca) | 0,10 | 0,196 | 0,856 [0,723–0,964] / 0,778 |
| C sin estratos | 0,887 [0,831–0,939] | 1,000 | 1,000 | 1,000 (con marca) | 0,087 | 0,186 | 0,939 [0,839–1,000] / 0,608 |
| **A: tokens + léxico + conflictos + marca como peso** | **0,927 [0,850–0,974]** | **1,000** | **1,000** | **0,830 [0,763–0,897]** | **0,093 [0,047–0,147]** | **0,186 [0,037–0,391]** | **0,885 [0,760–0,977] / 0,758** |

\* En B10 y B11 la precisión ≥ 0,95 se alcanza en entrenamiento; en validación el recall al que llega es 0,18–0,22 y el umbral solo sirve como «casi seguro».

**Referencias.** Un azar con semilla da PR-AUC 0,41; una regla de igualdad exacta (misma marca y misma clave de nombre) da precisión 1,0 con recall 0,092, es decir, el índice único ya atrapa el 9 % de los duplicados del corpus.

### 4.3 Qué aporta cada pieza

Ablaciones sobre el mejor scorer (A con marca como peso, PR-AUC 0,927), cada una medida en validación:

| Se quita | PR-AUC | Lectura |
|---|---|---|
| Nada | 0,927 | |
| Sinónimos y siluetas del léxico | 0,900 | Cuesta 0,027 y 7 puntos de recall@5 con una palabra: dentro del ruido del intervalo |
| Códigos y atributos de forma (código de marca, pack, versión, manga, largo, tiro, cuello) | 0,818 | **Es la pieza que más pesa:** la falsa alarma dura sube de 0,186 a 0,546 |
| Todo el léxico | 0,729 | Los intervalos de 0,632–0,825 y 0,850–0,974 no se solapan |
| La marca (peso = 1) | recall@5 una palabra baja de 0,830 a 0,598 | Pedir la marca antes del nombre es lo que hace viable buscar con una palabra |

Lecturas que importan:

- **El valor del léxico está en extraer campos comparables** (código, pack, largo), no en decir que dos palabras son sinónimas.
- **Quitar 45 alias que el léxico comparte con el generador del corpus** baja PR-AUC de 0,927 a 0,912; quitar 45 al azar da 0,916 y 0,906. La circularidad por vocabulario compartido pesa poco; la que sí pesa es la estructural (4.5).
- **Descripción, tejido y patrón** explican casi todo el recall@5 completo (coseno del texto sin léxico: 1,000; solo el nombre: 0,955). El ajuste con entrenamiento bajó el peso de la descripción de 0,4 a 0,2.
- **La categoría casi no aporta al ranking:** con categoría equivocada las cifras no cambian. La marca sí.
- **Estratificar por similitud de nombre (C)** ayudó en entrenamiento (PR-AUC 0,921 a 0,953) y perjudicó en validación (recall@1 0,938 contra 1,000 sin estratos, diferencia −0,063 [−0,120, −0,019]). Se descubrió mirando validación y no se volvió a congelar.

### 4.4 Lo que no aporta

Dicho sin adornos:

- **Tokens puros del nombre** (Jaccard, contención, coseno) no superan claramente la línea base en PR-AUC ni bajan las falsas alarmas. Solo suben recall@5. La contención da 1,0 a todo lo que contenga la palabra.
- **Levenshtein y Jaro-Winkler sobre el nombre entero:** recall@5 de 0,79–0,91, y al 98 % de recall devuelven casi todo el catálogo como candidato. Marcan como duplicado a «Camisa Lara» contra «Camisa Lora», que son modelos distintos.
- **Fonética** (Soundex, Metaphone, clave propia en español): recall@1 de 0,67–0,92; pensada para inglés, la documentación de PostgreSQL advierte que no funciona bien con UTF-8, y no sirve para códigos de estilo (G44, 311).
- **Embeddings (pgvector):** no medidos aquí. El único modelo nativo de las Edge Functions de Supabase (`gte-small`) es solo inglés; los multilingües son API externa. Además la literatura consultada (solo el resumen) afirma que los embeddings miden cercanía y no identidad, y esos son justo los hermanos peligrosos (Lara/Lora, G44/G45).
- **LLM en línea:** con ChatGPT sin ejemplos, precisión 71 % con recall 98 % en un benchmark de productos con 80 % de casos difíciles. Tiende a decir «mismo», que es el error caro. Es una dependencia externa dentro del formulario que usan las cuatro sedes (principio 9). Como mucho serviría de auditor asíncrono de la cola de revisión, nunca en el guardado.
- **Tejido o patrón como separador:** en los datos reales no separa nada, y el benchmark lo respalda: con el material sin tope de ±1 bit el PR-AUC empeora (0,859 contra 0,914). Ver D10.
- **Tiempo como filtro o como peso:** ver 3.4.
- **Reglas de «una letra» como bloqueo:** con nombres propios de modelo dan falso positivo (Polo Evaluna contra Polo Evalina = 0,889 en A).

**¿Y la línea base? Dónde ya está casi tan buena.** La función actual no está cerca del nivel de A o C en PR-AUC ni en falsas alarmas. Pero:

- **Con la marca ya conocida** el orden importa menos: el control que solo filtra por marca ya acierta el 91,1 % en recall@5.
- **Tecleando prefijos sin marca ni categoría** (el caso real de quien escribe letra a letra), un comparador trivial de prefijo acierta el 52 % a 3–4 letras, y A solo 8–21 %. A 8 letras: prefijo 0,68; A 0,62; C 0,47; línea base 0,28. La lista sin marca es un problema abierto, y por eso el diseño pide la marca primero.
- **Sobre cruces nuevos** (20 duplicados y 20 negativos escritos después, fuera de la taxonomía del corpus), la línea base detectó 13 de 20 duplicados; A también 13; B10 16; B11 15; C 14. La sofisticación no se traduce en más detección en ese caso; sí en menos falsas alarmas: negativos sin alarma, línea base 3, A 6, B11 5, C 5.

### 4.5 Lo que el escéptico de método encontró

Lo he incorporado como condiciones del diseño, no como notas al pie.

1. **A y C no se distinguen** con este corpus: diferencia pareada de PR-AUC +0,013 [−0,047, +0,060]. Elegir una de las dos con estos números no es legítimo. Elijo la forma de A por razones de diseño: su ranking sobrevive a una marca equivocada (recall@1 de 1,00 a 0,97), tiene menos parámetros que requieran etiquetas, y activa «Es el mismo» en menos negativos nuevos (6/20 contra 15/20). A queda primero en 7 de 7 repartos alternativos (PR-AUC 0,921–0,973); C, 0,846–0,956; B11, 0,755–0,833.
2. **Marca equivocada.** Con la marca de la consulta cambiada en una fracción de las consultas duplicadas, el recall@1 de C baja de 0,94 a 0,80 (10 %), 0,64 (25 %), 0,44 (50 %) y 0,02 (100 % «Importado»); B11 de 0,96 a 0,08. A se mantiene. Pero el **aviso** (candidato correcto con puntaje sobre el umbral) sí muere en las tres: con «Importado», A pasa de 0,938 a 0,009, B11 de 0,964 a 0,027, C de 0,911 a 0,027. El corpus no mide este caso, que su propio README marca como el más peligroso. Conclusión: marca como peso blando, nunca como bloqueo duro (C lo usa duro).
3. **Prevalencia.** Con 5 % de altas duplicadas, la precisión del aviso es 0,35 [0,26–0,49] en A, 0,32 en C, 0,17 en B11 y 0,08 en la línea base; con 2 %, 0,17 en A. Son unas 14 alertas por cada 100 altas, de las que 5 son reales. Por eso la pantalla no interrumpe con umbrales: muestra una lista.
4. **Tamaño del catálogo.** Con registros reales submuestreados a 25, 50, 100, 200 y 400 anteriores (solo 22 consultas × 3 repeticiones, intervalo ancho), el aviso falso de A va de 0,01 a 0,09 y el de la línea base de 0,04 a 0,59. Con señuelos plausibles (copias con otro nombre propio, un piso adversario y no un catálogo real) y +485/+1.455/+3.395 registros, el aviso falso de A sube de 0,09 a 0,51/0,65/0,71. El «9,3 %» titular de A mezcla altas tempranas con pool chico; sobre los 79 registros sueltos es 17,7 %.
5. **`recall@k` no mide «buscar primero».** Está saturado: el bloque tiene mediana 2 candidatos. No mide la persona que teclea, ni cuántos avisos inútiles ve, ni cuánto tarda.
6. **Los pesos aprendidos codifican el generador.** Entrenar con lo programático y validar con lo escrito a mano (y al revés) da PR-AUC de A 0,931/0,950, C 0,859/0,831, B11 0,689/0,634, contra 0,927, 0,914 y 0,795 en el reparto original. En B, el 26,3 % de las altas posteriores de duplicados no trae descripción, contra 2,3 % de primeras altas: un artefacto que el modelo aprende como «descripción vacía = duplicado» y que sube su PR-AUC de 0,696 a 0,795.
7. **Confusores fuera de la taxonomía.** En 20 negativos nuevos (línea niña, hombre, bebé, maternal, docena, pieza suelta de conjunto, repuesto, talla grande dicha con otras palabras), «Es el mismo» se activó en 15/20 con C, 6/20 con A, 3/20 con B11 y 10/20 con C sin estratos, frente a 8–9 % en los negativos duros del corpus. El corpus tiene un solo registro con hombre/niña/bebé/maternal y ninguno con talla numérica.
8. **Fragilidades de A con mecanismo verificado.** (i) «Wide Leg Kira Corto» contra «Wide Leg Corto Kira», misma marca, puntúa 0,26 (< 0,479): una frase del léxico partida se lee como conflicto de silueta. (ii) Todo número de 1–2 cifras en el nombre se toma como «versión»: «Zapatilla Nika 38» contra «Nika 40» = 0,40. (iii) «Largo» dicho solo de un lado se penaliza ×0,2. Es exactamente el «cada uno lo interpreta a su manera» del pedido, y por eso el paso «Sacar talla y color del nombre» va en la pantalla, no solo en el algoritmo.
9. **Fuga transductiva.** El IDF se calculó con los 485 registros, incluidos los de validación. Recalculado solo con entrenamiento: PR-AUC casi igual (0,927 a 0,922) pero el aviso falso de A sube de 0,093 a 0,147 y la falsa alarma dura de 0,186 a 0,299. En producción el IDF saldría del catálogo previo.
10. **Sensibilidad al reparto.** Los umbrales de «Es el mismo» de A van de 0,767 a 0,898 y los de C de 0,597 a 0,752 según el reparto; la precisión de «Es el mismo» en validación va de 0,885 a 0,991 (A) y de 0,856 a 0,988 (C). Se evaluaron unos 65 scorers sobre la misma validación y se eligió al mejor: sesgo de ganador no medido.
11. **Orden de llegada.** Invirtiendo la línea de tiempo (la consulta es la alta más antigua), recall@1 de la línea base baja de 0,795 a 0,589, A de 1,000 a 0,955, C sube de 0,938 a 0,964.
12. **«Es el mismo» sigue sin ser confiable:** precisión 0,885 [0,760–0,977] contra 0,95 buscado. Si la interfaz lo preselecciona, sesga a la persona (anclaje) y contamina las etiquetas de la sombra.

### 4.6 Qué se concluye

- **No hay ganador entre A y C con estos datos.** La forma de A se elige por robustez de diseño.
- **La técnica sofisticada aporta poco por sí sola.** Lo que mueve la aguja, en orden: saber la marca; leer descripción, tejido y patrón como texto; la capa de conflictos por campo; el peso IDF que baja la palabra de tipo («Polo», «Vestido») y sube el nombre propio. El algoritmo de similitud es lo de menos.
- **Los números son piso de comparación.** El corpus lo escribió un LLM con las mismas creencias que el léxico y que los scorers; la marca siempre es correcta; hay 8 productos reales cargados por una sede en 84 minutos. La confianza real solo llegará con las altas reales (sección 12).

---

## 5. Arquitectura recomendada

### 5.1 Las cuatro capas

**Problema.** Un solo lugar no puede hacerlo todo: la base es lo único que ve a todas las sedes a la vez pero es mala para cambiar un léxico o afinar un puntaje; el navegador es cómodo para afinar y probar pero no es la última palabra.

**Analogía.** Es la diferencia entre el guardia de la bodega (no deja entrar dos cajas con el mismo rótulo exacto) y la vendedora que mira el estante antes de dar de alta (reconoce «esa es la Lara»). El guardia nunca se equivoca pero solo entiende igualdad exacta; la vendedora entiende parecidos pero puede equivocarse. Se necesitan los dos.

```
  alta nueva (marca elegida, categoría elegida, texto tecleado)
        |
   [Capa 1] RECUPERACIÓN           en la base (RPC de solo lectura)
        |   trae los candidatos de esa marca + un segundo anillo
        v
   [Capa 2] PUNTAJE                en el navegador (TypeScript puro, con pruebas)
        |   ordena por parecido de texto + conflictos + marca como peso
        v
   [Capa 3] ZONAS                  en el navegador
        |   idéntico exacto frena; lo demás es una lista sin interrumpir
        v
   [Capa 0] RED DE SEGURIDAD       en la base (ya existe; se mejora)
        |   índice único + comprobación al guardar
        v
   [Capa 4] RETROALIMENTACIÓN      en la base (tabla de solo agregar)
            cada clic «Es el mismo» / «Es otro» queda como etiqueta
```

| Capa | Dónde corre | Por qué ahí |
|---|---|---|
| 0. Red de seguridad | Base (SQL) | Es la única que ve todas las sedes a la vez y la que hace cumplir el idéntico exacto. Ya existe; se mejora (5.4) |
| 1. Recuperación | Base: una RPC de lectura nueva con prefijo `buscar_` | Junta lo que el cliente no puede ver: stock de otras sedes (la política `stock_select` deja a un no líder ver solo su sede, así que va como función `security definer` que devuelva solo cantidades), foto principal, colores. El prefijo `buscar_` evita que el loader global bloquee la pantalla al teclear (`espera-reglas.ts`) |
| 2. Puntaje | Navegador, en `apps/web/lib/` | Léxico y pesos cambian con un despliegue, no con una migración; es lógica pura testeable; reordena en vivo al llenar la marca. Escribirlo en SQL fue peor: la variante de Soft-TF-IDF con `pg_trgm` como métrica interna bajó a R@1 0,90–0,94 |
| 3. Zonas | Navegador | Son reglas de presentación |
| 4. Retroalimentación | Base | Es dato de negocio, de solo agregar, con responsable y sede |

### 5.2 Qué calcula el puntaje (en palabras)

Explico cada pieza empezando por el problema:

1. **Limpiar el ruido.** *Problema:* «Polo G-44», «Polo G 44» y «Polo G44» son la misma prenda para una persona. *Hace:* minúsculas, sin tildes, singular, abreviaturas (Cam. a camisa), código de temporada separado del nombre. **El código de estilo (G44, 311) se conserva como pista.** Léxico curado: 159 sinónimos, 85 abreviaturas, 258 palabras de ruido, 23 patrones de código y 20 familias de material; el subconjunto que usa el puntaje pesa 33 KB (9 KB comprimido).
2. **Dar peso por rareza (IDF).** *Problema:* «Polo» está en media tienda y no identifica nada; «Evaluna» está en una prenda. *Hace:* la palabra rara pesa más que la común. Analogía: en el taller, decir «la camisa» no señala ninguna; decir «la Lara» sí.
3. **Comparar el texto completo.** Nombre con peso 1, descripción 0,4 (0,2 tras el ajuste), tejido 0,15, patrón 0,15.
4. **Conflictos por campo.** *Problema:* «Polo G44» y «Polo G45» son casi el mismo texto y dos modelos. *Hace:* multiplica por 0,4 cuando el código de marca es distinto, cuando el pack, la versión (II, Plus, Petit) o el largo, la manga, el tiro o el cuello difieren. Es la pieza que más pesa (4.3).
5. **La marca como peso.** ×0,4 si la marca difiere, ×0,7 si la categoría difiere (×0,9 si son vecinas según el léxico).
6. **Suma de evidencias (Fellegi-Sunter), que no se usa en el primer lanzamiento.** Sumar bits de evidencia por campo, con tres zonas: es la técnica C. Queda como evolución si la calibración con datos reales (sección 12) muestra que el puntaje multiplicativo de A no separa bien.

**Punto por resolver: material como señal débil.** A trata el **patrón** como conflicto (×0,4), que es más fuerte que «señal débil». Tú pediste el material como pista, no como veto. En C, tejido y patrón llevan un tope de ±1 bit y los datos respaldan el tope. En el paso P5 el patrón pasa a peso bajo y se vuelve a medir con el arnés antes de aceptarlo (D10).

### 5.3 Umbrales provisionales

Los que salieron del corpus, **solo para orientación**: aviso ≥ 0,479 y «Es el mismo» ≥ 0,767 (A). En validación, «Es el mismo» dio precisión 0,885, no 0,95. **No se usan para decidir nada visible el día 1**, excepto el idéntico exacto. La lista se muestra siempre, ordenada por puntaje. Los umbrales se fijan con las decisiones registradas (sección 12).

### 5.4 Mejoras a la red de seguridad (capa 0)

Todas son cambios de funciones centrales en producción: requieren tu OK y partir de la definición real de producción (`pg_get_functiondef`), no de la migración del repo (una función con parámetros distintos crearía una sobrecarga).

1. **Carrera entre sedes.** `crear_producto_con_variantes` captura `unique_violation` y responde con el mismo aviso `nombre_duplicado` y el id del ganador, en vez de un 23505 mudo. Así la pantalla reabre el paso del nombre con el existente.
2. **Quitar el bloqueo «una letra»,** que produce falsos positivos con códigos (G44/G45) y contradice tu decisión de frenar solo el idéntico exacto. Se conserva el parámetro `p_confirmo_distinto` por compatibilidad. En la lista, «una letra» pasa a ser una tarjeta de mayor puntaje, no un freno.
3. **`left join categorias`** en la comprobación (el centinela y cualquier producto sin categoría dejan de ser invisibles).
4. **`censo_crear_variante`:** comprobar `fn_ve_modulo('conteos')` (D7) y llamar la misma recuperación de parecidos.
5. **Prueba SQL nueva** para `buscar_productos_parecidos` y el índice único, que hoy no tienen ninguna (P3).

### 5.5 Qué NO hay que instalar sin tu OK

`pg_trgm` 1.6 ya está instalada y alcanza. El proyecto se comparte con Dynamic: instalar una extensión es un cambio compartido.

| Extensión o servicio | Estado | Recomendación |
|---|---|---|
| `unaccent` | Disponible, no instalada | **No.** `fn_clave_texto` ya quita tildes y ñ con `translate` |
| `fuzzystrmatch` | Disponible, no instalada | **No.** Soundex y Metaphone no sirven en UTF-8; `fn_dentro_de_una_edicion` ya cubre una edición |
| `vector` (pgvector 0.8.2) | Disponible, no instalada | **No.** Exige un modelo externo, no separa hermanos, sin ganancia medida |
| LLM o API externa en el guardado | — | **No.** Rompe el principio 9 |
| Índice GIN de trigramas sobre `fn_clave_texto(referencia)` | — | **Solo si** la comparación global se vuelve lenta: 89–115 ms para 5.000 filas en SQL (medido con filas generadas), 1,2–3,0 ms en el navegador. Con cientos de productos, irrelevante |

**Contingencia si la RPC de lectura falla:** cambiar `similarity` por `greatest(similarity, word_similarity)` en `buscar_productos_parecidos`. Con `word_similarity` acertaron 12 de 12 consultas parciales sobre los 8 productos reales (con `similarity` ≥ 0,5, 5 de 12). No se midió su tasa de falsas alarmas.

---

## 6. El flujo de pantalla «Buscar primero, escribir después»

Encaja dentro del paso 2 «¿Cómo es?» del ADR-0260, sin agregar un paso.

### 6.1 Los pasos

| Paso | Qué ve la persona | Por qué |
|---|---|---|
| 1. Categoría | Sin cambios | Es la mitad de la clave |
| 2. Marca **sube** | «¿De quién es?» arriba de Nombre y Descripción. Hoy: Nombre (`NuevoProductoForm.tsx:672`), Descripción (`:694`), Marca (`:697`) | La marca sale de la etiqueta física de la prenda (se reconoce, no se recuerda). Sin marca no hay bloque que revisar |
| 3. **«¿Ya la tenemos?»** | Al elegir la marca, sin escribir nada: «Ya hay 2 prendas de Wayi en Jeans», hasta 3 tarjetas y «Ver los N» en una hoja con buscador | Reconocer antes que recordar. Es lista con tarjetas, no autocompletar: en estudios de e-commerce las sugerencias se eligieron el 23 % de las veces y la gente prefiere recorrer la lista completa |
| 4. Anillos de respaldo | Si lo tecleado no coincide con nada del bloque: (a) misma marca, otra categoría; (b) marcas parecidas (Divas / Divas Now); (c) otra marca solo si el nombre es casi idéntico, en una línea gris que informa | El bloqueo por marca y categoría pierde por diseño; los anillos lo cubren |
| 5. Decidir sobre una tarjeta | «Es la misma: sumarle mis tallas y colores» o «No, es otra prenda». Enlace fijo «No la veo: es nueva» | Botones con verbo. Reemplaza la casilla «Es otro producto distinto, créalo igual» (`AvisoParecidos.tsx:66-67`), que se aprende a marcar sin leer |
| 6. Nombre y Descripción | Con ayuda: «Empieza por el tipo de prenda y sigue con el modelo: Blusa Lara. El color y la talla se eligen después». Si el nombre trae un color, tejido o talla, pregunta «¿Lo quito?». Campo opcional «Código de la marca» | Un producto es un modelo; con las listas `colores`, `tejidos`, `patrones` que ya existen se detecta |
| 7. Tejido y patrón | Se muestran en la tarjeta; no puntúan como veto | Tu decisión: material como señal débil |
| 8. Crear | La base vuelve a comprobar el idéntico; si otra sede se adelantó, dice quién y ofrece el camino del paso 5 con lo ya llenado | Principio 9: la base manda y no se pierde nada |

Con 0 candidatos, el bloque se pliega en una línea («Todavía no hay prendas de Wayi en Jeans. Esta sería la primera») y el Nombre aparece. Con marca nueva, igual.

### 6.2 La tarjeta del candidato

Lo que muestra:

- **Foto principal**; si no hay, la muestra del tejido y los puntos de color. Solo 1 de 8 productos tiene foto: la tarjeta nunca queda vacía y dice «Sin foto todavía».
- **Nombre en negrita**, «marca · categoría» debajo, y un `Chip` apagado «Descontinuada» o «Pendiente» si corresponde.
- **Por qué aparece**, en una frase: «Mismo modelo: Lara», «Mismo modelo, pero está en Pantalones», «Nombre casi igual». Sin el porqué la gente hace clic mecánico.
- **Tejido, patrón, temporada** como chips pequeños. La temporada se lee tal cual está (sin año).
- **Colores** (hasta 8 y «+N») y rango de tallas.
- **Stock por sede en cantidades:** «TRU 7 · AQP 0 · LIM 0 · Taller 0». Nunca precio ni costo (candado de dinero, ADR-0126).
- **Cuándo y dónde se cargó:** «Cargada en Tienda TRU hace 2 días». La sede sale de `propuesto_por` cruzado con `colaboradores.ubicacion_asignada_id`, o del registro de decisiones (sección 7.3); no hay columna de sede del alta.
- **Dos botones con verbo.**

**Cuántos:** sin escribir, hasta 5 del bloque (las 3 primeras con tarjeta completa, el resto en filas compactas). Escribiendo, máximo 3 tarjetas completas; el nivel «otras marcas» va plegado. En 375 px: 4 filas compactas y solo la tocada se expande.

**Orden:** (1) nivel A: mismo modelo, misma marca y categoría; luego B: mismo modelo en otra categoría o nombre casi igual; luego C: otra marca, solo informa; (2) mayor coincidencia; (3) más reciente primero (la simultaneidad entre sedes es el escenario típico); (4) con stock antes que sin stock. El tiempo ordena y rotula, **nunca filtra**.

### 6.3 Microcopy

| Situación | Texto |
|---|---|
| Título del bloque | ¿Ya la tenemos? |
| Bajada | Mira lo que ya hay de Wayi en Jeans antes de crear una nueva. Así las 4 sedes hablan de la misma prenda. |
| Contador | Ya hay 2 prendas de Wayi en Jeans |
| Casilla vacía | Todavía no hay prendas de Wayi en Jeans. Esta sería la primera. |
| Buscador | Busca por nombre o por el código de la etiqueta… |
| Botón principal | Es la misma: sumarle mis tallas y colores |
| Botón secundario | No, es otra prenda |
| Enlace fijo | No la veo: es nueva |
| Único caso que frena | “Camisa Lara” ya existe en La Femme 21. Ábrela y súmale el color o la talla que trajiste. |
| Ya tiene parte | Ya tiene Negro en S, M y L. Tú traes Negro en XL y Blanco en M: se suman a la misma prenda. |
| Descontinuada | Palazo Billie está descontinuada. Si volvió a llegar, actívala y súmale lo nuevo. |
| Dos sedes a la vez | Justo ahora TRU creó “Palazo Billie” (hace 2 min). Lo que llenaste no se pierde: súmalo a esa prenda. |
| Sin conexión al buscar | No pude revisar lo que ya existe. Puedes seguir: se vuelve a revisar al crear. |
| Cola rechazada | Otra sede ya creó esta prenda mientras no tenías internet. Tus tallas y colores siguen aquí: súmalos a la que ya existe. |
| Color en el nombre | “Roja” es un color y se elige en el paso 3. ¿Lo quito del nombre? |
| Stock ajeno | Solo se ven cantidades, no precios ni costos. |

Se respeta el vocabulario del negocio (sede, integrante, clienta) y el sistema de diseño: `<Modal variante="hoja">` para «Ver los N», `Chip` para estados, `btn-cayla` con `btn-primario|secundario`, colores solo desde los tokens de `globals.css` y ningún `<select>` nativo (los combos van por `CampoSelect`/`ComboBuscable`, ADR-0209).

### 6.4 Casos de borde

| Caso | Tratamiento |
|---|---|
| El existente no tiene foto | La norma hoy (7 de 8). Muestra del tejido y puntos de color; sumar la foto es opcional después |
| Candidata descontinuada | Se muestra con `Chip` apagado al final del nivel; «Activarla y sumar». Las `rechazado` no se muestran (el índice único ya las ignora) |
| Faltan tallas o colores que la persona trae | Es el caso principal de «Es la misma». Hoy `AgregarColoresModal` y `AgregarTallasModal` crean las variantes **sin unidades** (`variantes-ficha-reglas.ts:1074`, `NACEN_SIN_UNIDADES`) y mandan a Recibir. Ver D2 |
| Dos sedes a la vez | La base cierra la ventana (5.4); la pantalla no pierde lo llenado |
| Sin conexión | El buscador dice que no pudo revisar; un alta encolada puede salir «rechazada» al subir: ahí se ofrece «Es la misma» con los parámetros ya guardados en la op. No hay copia local del catálogo para buscar sin red (mejora aparte, no verificada) |
| Ya existe en otra categoría | Anillo (a), nivel B, con la categoría en la frase |
| Marca partida en dos (Divas / Divas Now) | Anillo (b) con `nombres-parecidos.ts`. Medido en marcas y proveedores: la regla actual atrapa 12 de 15 pares reales marca↔proveedor y la ampliada (todas las palabras del nombre corto están en el otro, con una palabra rara) 15 de 15 sin falsos nuevos |
| Casilla grande (CAYLA del Taller) | Sin escribir, 3 tarjetas + «Ver los N» con buscador; el modelo (Lara, Billie) separa |
| Reposición de un clásico el año siguiente | Se muestra igual («Cargada hace 11 meses · Clásico»): no se filtra por tiempo |
| «Crear otro parecido» (`ProductoCreado.tsx:193-203`) | Hoy copia marca, categoría, tejido, tallas y precio. Debe volver con el Nombre **vacío** y pasar por «¿Ya la tenemos?»: es un clon, fuente clásica de duplicados |
| Conteo (`AltaAlVuelo.tsx`) | Mismo buscador en versión compacta: una línea y un toque, porque en un conteo de 300–900 escaneos cualquier aviso largo se ignora |
| Marca ausente o comodín | D5 |
| Integrante sin acceso al stock ajeno | La RPC de recuperación devuelve solo cantidades, con el criterio de `fn_stock_por_sede` |

**Lo que no se hace:** tres banners apilados de tres colores (deben quedar un bloqueo y una lista); aviso después de escribir el nombre; desplegable pequeño de autocompletar; filtrar duro por temporada o fecha; puntuar el tejido como veto; leer la tabla `stock` para mostrar stock de otras sedes (mostraría ceros falsos); mostrar precio o costo; fusionar borrando.

**Celular.** Aunque la regla PL-105 hoy rige Vender, Cambios y Devoluciones, las sedes cargan producto desde tablets: se captura a 375 px antes de darlo por terminado.

---

## 7. Datos: qué cambia en el esquema

### 7.1 Campo «Código de la marca»

**Problema.** Tres de ocho productos llevan el código de la marca metido a mano en texto libre, en tres formatos: «SS25 311» y «\|79-SS24» en descripción, «G44» en el nombre. Es la pista más fuerte que existe para separar Jirish SS25 311 de Jirish 79-SS24 y no se puede consultar ni indexar. `productos.codigo` (JEA-0007) es el código **interno** de CAYLA, no el de la marca.

**Propuesta.** `productos.codigo_marca text null` más su clave normalizada (mayúsculas, sin espacios ni signos). Se rellena con el extractor del léxico (`codigo_temporada_modelo`, `codigo_modelo_guion_temporada`; 22 expresiones con versión Postgres probadas con 136 casos y 0 fallos). El campo del formulario es opcional y se pide después del nombre.

**Cómo se usa.** «Misma marca y mismo código» es la pista más fuerte para la lista. Recomiendo **avisar fuerte y no frenar** hasta verificar que las marcas no reutilizan el mismo número en otra temporada («311» en SS24 y en SS25 sería un falso positivo). Por eso el código incluye el token de temporada. Con la migración no se rellena nada sin que un líder lo confirme. D3.

### 7.2 El modelo del tiempo

**Recomendación:** ninguna columna nueva por ahora. Se usa `productos.temporada` (clave sin año) y `created_at` para ordenar y rotular; el año se lee del código de la marca cuando existe o se calcula con `fn_ocurrencia_temporada(temporada, fecha)`. Cuando haya lotes, envíos o producciones (hoy `compras`, `compra_items`, `lotes`, `envios` y `producciones` tienen **0 filas**), el ancla de recencia pasa a ser **la última llegada a CAYLA** (`fn_es_llegada_a_cayla`), no `created_at` (ADR-0246 nota d, decisión 9). Las temporadas nulas y «clásico» se muestran siempre entre los candidatos. D4.

### 7.3 Sede del alta

No hay columna. Se deduce de `propuesto_por`, y `colaboradores.ubicacion_asignada_id` puede haber cambiado desde entonces. El registro de decisiones (7.4) guarda la sede **en el momento de la decisión**; para la tarjeta se usa lo inferido, dicho con cuidado («Cargada en Tienda TRU»).

### 7.4 Cambios de esquema propuestos

| Cambio | Tipo | Riesgo | Notas |
|---|---|---|---|
| `retail.buscar_existentes_alta(p_marca_id, p_categoria_id, p_texto)`: función de lectura | Función nueva | Bajo (solo lectura) | `left join categorias`; foto, colores, tallas, stock por sede en cantidades, `created_at`, temporada, tejido, patrón, código de la marca; sin precios. Se pega sin partes |
| `retail.sumar_variantes_a_producto(...)`: «Es el mismo» | Función nueva | Medio (escribe stock) | Ver D2. Firma con `fn_actor_persona_id(true)` y pantalla con `ComboResponsable`. Respeta `variantes_identidad_unica` (producto, talla, color) y `variantes_sin_mezcla_de_color`. **No recrea `catalogo_actualizar_producto`** |
| `retail.decisiones_parecido` (solo agregar) | Tabla nueva | Bajo | RLS encendido sin políticas (se lee por función `security definer`, evita el deadlock de políticas del ADR-0195); nunca `DELETE`, un error se marca `revertido` |
| Ajuste de `crear_producto_con_variantes` (5.4 puntos 1–3) | Función central | Medio | Partir de `pg_get_functiondef` de producción |
| Ajuste de `censo_crear_variante` (5.4 punto 4) | Función | Medio | Idem |
| `productos.codigo_marca` | Columna nueva | Medio | `alter table` sobre una tabla en uso; nullable, sin default; pegar en PARTES (ADR-0195) |
| `retail.productos_referencia_clave_unica` con alcance de marca | Índice | Alto (núcleo) | Solo si eliges la opción 2 de D1. `(marca_id, clave)` con `NULLS NOT DISTINCT` (Postgres 17.6 lo soporta) |
| `fusionado_en_id` y `sinonimos text[]` en tejidos, patrones, marcas, proveedores | Columnas nuevas | Bajo | No hacen falta hoy (0 referencias que mover); el molde es `colores.sinonimos` y `unir_clientas` |
| Retirar `catalogo_crear_producto` | Drop de función | Bajo | Código muerto; quitar el tipo de `types.ts:5339` |

Después de cada cambio de esquema: `pnpm datos:generar:produccion` y `pnpm datos:comparar` (regla de oro de `docs/datos/`). Toda migración lleva el prefijo `retail.` o `set search_path = retail, public, extensions;`.

---

## 8. Limpieza del vocabulario existente

**Regla: nada se borra.** Se archiva (`activo = false`), se renombra o se mueve. Y **todo se vuelve a medir antes de ejecutar**: las cifras de la auditoría son del mediodía y cambiaron durante la tarde (2.5).

### 8.1 Propuestas

| Valor | Hallazgo | Propuesta | Riesgo |
|---|---|---|---|
| Tejido «pruebaTEJIDO» | Basura autoaprobada el 28 de septiembre, activa, 0 productos, ofrecida en Pantalones | Archivar (`activo = false`) | Bajo |
| Tejido «lana» | Sin mayúscula (el POST no normaliza el texto mostrado), 0 productos | Renombrar a «Lana»; la clave `fn_clave_texto` es la misma, no choca | Bajo |
| Tejidos «Tela» e «Hilo» | Genéricos que no describen material; nacieron por el empuje del comodín | **Primero** dar salida en el alta («Sin definir / Mezcla»), después archivar | Medio-bajo: sin la salida, reaparecen como «Tela2» |
| Tejido «Hilo de algodón» | ¿Es Algodón, un punto tejido o una fibra distinta? Ningún texto lo dice | Preguntar a quien lo propuso; si era Algodón, sinónimo y archivar | Medio: fusionar pierde el matiz |
| Algodón / Algodón pima / Algodón alicrado | Jerarquía, no duplicado. «Alicrado» es algodón con licra | Dejar. Escribir la jerarquía en `notas` de los hijos | Bajo |
| Licra / Suplex / Algodón alicrado | Sinónimos que el texto no ve (similitud 0,00 entre Licra y Suplex) | Dejar. Sumar «Suplex» y «Lycra» a la nota de Licra; si confirmas que Suplex es lo mismo, alias y archivar | Medio: una fusión equivocada mezcla materiales de precio distinto |
| Patrones «macrame» y «Cable knit» | Técnicas de trama y punto en Patrones; por ADR-0106 la textura va en Tejidos | Mover a Tejidos («Macramé», «Cable knit») y archivar los patrones (0 productos) | Bajo hoy, medio si se espera |
| Patrón «Rombos» | Sin categoría que lo ofrezca (invisible), no duplicado | Mapearlo o desactivarlo | Bajo |
| Categorías Jeans / Pantalones / Polos / Poleras / Chompas | Solapes semánticos que ningún texto ve | **No fusionar** (llevan prefijo de código: JEA-0008). La búsqueda por marca sin exigir categoría resuelve el solape sin tablas nuevas | Alto para la regla de identidad, nulo para los datos |
| Categoría «Blusas» (retirada) | Sin nota que diga a dónde pasó | Agregar la nota como la de «Polos (V1, retirada)» | Bajo |
| Tallas «Standar», «XSS», «J» | Ya desactivadas | Dejar | Bajo |
| Tallas «Estándar» y «Única» | Mismo significado, categorías disjuntas | Dejar | Bajo |
| Etiquetas «Para liquidar» ×5, «San Valentín»/«Galentine's Day» | Alcances distintos por diseño | Dejar. Un aviso de parecidos debe tratar «Día de/del…» y «Para liquidar» como palabras genéricas | Bajo |
| Marca «Divas» / «Divas Now» | Único par de marcas reales que el aviso marca (0,60) | Preguntar a Felipe si son una sola; si sí, desactivar «Divas Now». **Verificar que existan hoy** | Bajo |
| Marca «Importado» | Comodín de origen, no una marca | Documentar como comodín (D5). **Verificar que exista hoy** | Medio |

### 8.2 Guardas para que no vuelva a pasar

1. **Salida en el alta** para material que la persona no sabe («Sin definir / Mezcla»), o tejido y patrón opcionales. Sin esto seguirán inventando comodines.
2. **Aviso de parecidos en tejidos, patrones, tallas y etiquetas.** Hoy solo marcas y proveedores lo tienen (`nombres-parecidos.ts`). Se extiende la regla con «todas las palabras del nombre corto están en el otro y hay una palabra rara». Descontar palabras genéricas (Collection, Fashion, Moda, Store): sin eso «Zoe Collection» y «Chic Collection» se marcan a 0,58.
3. **Cola de revisión posterior** para lo creado por no-líderes (D6). Como los 25 activos crean directo, el flujo «propone cualquiera, aprueba un líder» hoy no gobierna nada.
4. **Corregir ADR-0095:** la exigencia de comentario al aprobar vive solo en la rama `UPDATE` del disparador; en `INSERT` por quien tiene capacidad de catálogo se aprueba sin nota (las 5 tallas del 28 de septiembre tienen notas nulas).
5. **Actualizar ADR-0070:** su premisa «el duplicado nunca llega a existir» solo vale para tilde, mayúscula y espacio; plural, puntuación y sinónimo la desmienten.
6. **Endurecer el RUC:** `00000000000` pasa el `CHECK` hoy; rechazar todos ceros y, idealmente, validar el dígito verificador de SUNAT.

---

## 9. Plan por pasos verificables

Cada paso se puede probar funcionando (principio 7). «Toca producción» = necesita tu OK explícito antes de pegar nada.

| Paso | Qué | Cómo lo verificas tú | Toca producción |
|---|---|---|---|
| **P0** | Traer `origin/main` (hoy 64 commits adelante); leer `docs/SESIONES-ACTIVAS.md`; coordinar con las sesiones de Conteo (Benja-responsive), `catalog-screens-review`, `product-colors-image-upload`, `product-variant-editing` y `stock-status-inconsistency` | `git rev-list --count HEAD..origin/main` da 0; el tablero no muestra choque en `NuevoProductoForm.tsx`, `ProductoForm.tsx`, `AltaAlVuelo.tsx`, `error-escritura.ts` | No |
| **P1** | Tus respuestas a D1–D10; ADR nuevo (número al subir) y notas en ADR-0109 y ADR-0070 | Lees el ADR y estás de acuerdo | No |
| **P2** | Etiquetas de referencia: tú etiquetas las 40 filas de `casos_para_felipe.csv` y unos 30 pares del corpus | Se mide cuánto discrepas conmigo; si discrepas mucho, se corrige la definición de «mismo producto» antes de seguir | No |
| **P3** | Pruebas de la red de seguridad: prueba SQL de `buscar_productos_parecidos` y del índice, en Postgres desechable (no el 54422 compartido), enganchada al CI | El CI corre la prueba y falla si la borro | No |
| **P4** | Migración con la RPC de lectura `buscar_existentes_alta` | En el SQL Editor, `select` para Jirish + Jeans devuelve los dos Wide Leg con colores y stock por sede, sin precios | **Sí** (función nueva, no altera datos) |
| **P5** | Lógica pura de puntaje en `apps/web/lib/` (normalización, léxico recortado, conflictos, marca como peso; patrón con peso bajo) con pruebas sobre el conjunto dorado (`golden-set-buscar-existentes.json`) y un subconjunto del corpus | `pnpm test` verde. Los 18 casos dorados: los 12 que deben avisar avisan y los 4 negativos no. Se corre el arnés (`bench/`) con el patrón en peso bajo y se compara con A | No |
| **P6** | Pantalla: marca sube, «¿Ya la tenemos?», tarjeta, dos botones, ayuda contra color y talla en el nombre; sin umbrales, solo frena el idéntico exacto | En `/productos/nuevo`, escoger Jirish y Jeans muestra las dos fichas con «TRU 7 · AQP 0…»; teclear «Wide Leg Corto» pone la correcta arriba; captura a escritorio y a 375 px | No (depende de P4 aplicado) |
| **P7** | RPC «Es el mismo» (suma variantes y unidades a un producto existente) | En un Postgres desechable: variantes nuevas y movimientos de entrada, stock cuadra; una combinación repetida no duplica; dos personas a la vez no rompen | **Sí** (escribe stock) |
| **P8** | Red de seguridad: `unique_violation` a `nombre_duplicado` con id del ganador; quitar el bloqueo «una letra»; `left join categorias` | Prueba SQL con dos transacciones: la segunda recibe el aviso con el id; «Polo G45» ya no se frena | **Sí** (función central) |
| **P9** | Registro de decisiones (`decisiones_parecido`) y escritura por RPC; sombra de puntajes | Un alta de prueba deja una fila con marca, candidatos, puntaje y decisión; la tabla no acepta `DELETE` | **Sí** (tabla nueva) |
| **P10** | Conteo (`AltaAlVuelo`) con la misma búsqueda compacta; cola sin conexión con «Es el mismo» y `nombreEnCola` con la normalización de la base; `censo_crear_variante` con compuerta de módulo (D7) | Escanear «Camisa Larra» muestra «¿Es Camisa Lara?»; una op rechazada por nombre ofrece sumar en vez de solo Descartar | Solo la compuerta de `censo_crear_variante` |
| **P11** | Campo `productos.codigo_marca` y su extractor | El formulario acepta «SS25 311»; buscar «311» encuentra la ficha; «Polo G44» y «Polo G45» quedan separados | **Sí** (`alter` de tabla en uso, en partes) |
| **P12** | Limpieza de vocabulario (8.1), salida «Sin definir» y aviso de parecidos para tejidos, patrones, tallas y etiquetas | Lista de antes y después de cada fila tocada; nada borrado; el catálogo activo ya no muestra «pruebaTEJIDO» | **Sí** (updates de filas de catálogo) |
| **P13** | Calibración con altas reales (S1 silenciosa, S2 visible, S3 evaluación final; sección 12) | Informe semanal al líder con los pares confirmados de menor puntaje | Configuración |
| **P14** | Herramienta de fusión (molde `unir_clientas`), cuando aparezca el primer duplicado real | Fusionar dos fichas mueve variantes y stock sin borrar nada y deja snapshot | **Sí** |
| **P15** | Retirar `catalogo_crear_producto` y su tipo | El generador de tipos ya no la lista | **Sí** (baja prioridad) |

Al cierre de cada paso: bitácora en `docs/bitacora/AAAA-MM-DD-<tema>.md` y backlog en `docs/backlog/…` (ADR-0259), y actualizar `docs/ARQUITECTURA.md` cuando cambie una ruta o una RPC.

Un módulo nuevo (por ejemplo, la pantalla del informe semanal al líder) nace **solo para el líder** en Roles y accesos, con migración propia, entrada en `lib/modulos.ts`, `layout.tsx` con `exigirModulo` y funciones que firman con `fn_actor_persona_id(true)` (ADR-0161).

**Orden por valor:** P0–P3 no cuestan nada de producción y destraban todo. P4–P6 entregan «Buscar primero» sin depender de ningún umbral. P7–P8 dan el «Es el mismo» y cierran la carrera. P9 abre la sombra. Del P10 en adelante se cierran los caminos ciegos y se limpia.

---

## 10. Decisiones abiertas

Formato: qué ganas, qué pagas, mi recomendación.

**D1. Índice único: ¿global o por marca?** Hoy `productos_referencia_clave_unica` hace único el nombre en todo el catálogo. Bajo tu regla de identidad (marca + categoría), «Wide Leg» de Jirish y «Wide Leg» de Pilar son dos productos legítimos, y hoy la base rechaza el segundo.
- Opción 1, dejarlo global. *Ganas:* cero riesgo, no toca el núcleo (principio 1), lo idéntico sigue frenando. *Pagas:* la gente tendrá que inventar prefijos («Adelle Wide Leg»), que es lo que se quiere evitar. No probado: es una inferencia, no un hecho medido.
- Opción 2, `(marca_id, clave)` con `NULLS NOT DISTINCT`. *Ganas:* coherente con tu regla; cada marca tiene sus nombres. *Pagas:* un cambio de esquema en el núcleo, y la marca opcional (#620) hace que dos productos sin marca sigan chocando.
- **Recomiendo la opción 1 por ahora y medir:** con la sombra (P9) se registra cuántas veces la base rechaza un nombre idéntico de **otra** marca. Si ocurre en la práctica, se pasa a la opción 2 con datos.

**D2. ¿Qué suma «Es el mismo»?** Hoy los modales de ficha crean variantes **sin unidades** y mandan a Recibir.
- Opción 1, solo variantes (usa los modales que ya existen). *Ganas:* sin función nueva de stock. *Pagas:* la persona trae la prenda en la mano y termina en dos pantallas; mientras tanto las unidades están sin registrar.
- Opción 2, variantes **y unidades** de una vez, en la sede de quien registra, en una transacción (`sumar_variantes_a_producto`). *Ganas:* un solo gesto, coherente con «ergonomía = potencia». *Pagas:* función nueva que escribe stock; hay que decidir qué pasa con una combinación talla-color que ya existe.
- **Recomiendo la opción 2:** las combinaciones nuevas se crean con su stock inicial; para una combinación que ya existe, se registra un movimiento de entrada (append-only) a esa variante en tu sede, con el motivo que corresponda. Si el motivo no encaja, se pide usar Recibir para esas. Requiere tu OK sobre el motivo.

**D3. Campo «Código de la marca».** *Ganas:* la pista más fuerte para separar SS25 de SS24 y G44 de G45; se puede indexar. *Pagas:* un campo más en el formulario y un `alter` de tabla en uso. Falta verificar que las marcas no reutilicen el mismo número en otra temporada. **Recomiendo** crearlo opcional, avisar fuerte y **no frenar** hasta verificarlo.

**D4. Tiempo.** (a) Solo ordenar y rotular. (b) Columna nueva de temporada con año. (c) Ventana por fecha de alta. **Recomiendo (a):** ninguna lectura sirve como filtro (3.4); (b) contradice la decisión 9 del ADR-0246; (c) hoy no discrimina nada (8 de 8 en 84 minutos). Se revisa cuando existan lotes y producciones.

**D5. Marca ausente o comodín.** La marca es opcional desde #620, y «Importado» (si existe) y CAYLA agrupan cosas muy distintas. Con marca vacía o comodín, el aviso deja de funcionar (0,94 a 0,01). **Recomiendo** que, sin marca real, la lista sea **por categoría con búsqueda de texto en todo el catálogo**, con un texto claro («Sin marca no puedo reducir la lista: te muestro lo de la categoría»), y que los comodines se declaren en una lista de configuración en vez de en el código.

**D6. Autoaprobación del vocabulario.** Los 25 activos crean tejidos y patrones aprobados. (i) Cola de revisión posterior con aviso de parecidos previo. (ii) Nota obligatoria también en `INSERT`. (iii) Quitar el módulo `atributos` a Integrante. **Recomiendo (i):** conserva que el censo no se frene (ADR-0070) y pone el ojo del líder después. (iii) contradice esa decisión.

**D7. Conteo y su permiso.** `censo_crear_variante` no tiene compuerta de permiso y está concedida a cualquier cuenta autenticada. **Recomiendo** agregar `fn_ve_modulo('conteos')` y que use el mismo buscador compacto. Cambia una función en producción. Coordinar con la sesión que reescribe el Conteo (PR #620 lo dejó «igual a propósito»).

**D8. Etiquetado tuyo.** 30 minutos sobre `casos_para_felipe.csv` (40 filas) y unos 30 pares del corpus. Sin eso, todas las etiquetas del sistema son de un LLM. **Recomiendo** hacerlo antes de P6.

**D9. Limpieza de vocabulario.** Qué archivar y qué mover (8.1): pruebaTEJIDO, Tela, Hilo, Hilo de algodón, Suplex, macramé y Cable knit. **Recomiendo** empezar por lo indiscutible (pruebaTEJIDO y «lana»→«Lana») y dar la salida en el alta antes de archivar «Tela» e «Hilo».

**D10. Peso del material.** Tejido y patrón con tope bajo, sin veto (como C, ±1 bit), y sin conflicto de patrón (A hoy lo trata ×0,4). *Ganas:* fiel a lo que pediste. *Pagas:* puede subir algo la falsa alarma dura; se re-mide en P5. **Recomiendo** el tope bajo.

---

## 11. Riesgos

1. **Falso positivo (unir prendas distintas).** El error caro. Mitigación: nada se auto-fusiona; «Es el mismo» es un clic explícito con foto y stock; el código de estilo distinto resta; «Es el mismo» no se preselecciona; el registro permite revertir.
2. **Corpus sintético.** Todo lo de la sección 4 sale de un corpus que un LLM escribió con las mismas creencias que el léxico. Mitigación: sombra antes de fijar umbrales; conservar el arnés como prueba de regresión.
3. **Marca equivocada, ausente o comodín.** Rompe el aviso de las tres técnicas. Mitigación: marca como peso, anillos de respaldo, D5.
4. **Prevalencia baja y crecimiento del catálogo.** Con 5 % de duplicados la precisión del aviso baja a 0,35; con 3.000 señuelos, el aviso falso de A sube a 0,71. El estudio de fatiga de alertas en medicina (van der Sijs, JAMIA 2006, solo el resumen) reporta entre 49 y 96 % de alertas ignoradas. Mitigación: lista, no interrupción; interruptor en servidor que apaga el aviso si el falso semanal pasa de 20 %.
5. **Hermanos legítimos** (Lara/Lora, G44/G45, Corto/Largo, Plus). Comparten marca, categoría y temporada. Mitigación: conflictos por campo, código de la marca, ninguna auto-fusión.
6. **Fragilidad de A** con números en el nombre («Nika 38» contra «Nika 40»), frases del léxico partidas y «largo» dicho de un solo lado. Mitigación: sacar talla y color del nombre por regla de formulario; arreglos al léxico sin mirar los pares de validación.
7. **Contradice una decisión vigente** si el tiempo se vuelve llave: ADR-0246 decisión 9. Mitigación: tiempo solo ordena.
8. **Cambios en el núcleo de producción** (`crear_producto_con_variantes`, índice único, `alter productos`). Mitigación: tu OK por paso; partir de `pg_get_functiondef`; migraciones en partes (ADR-0195); `create or replace trigger`, nunca `drop trigger`.
9. **Choque con otras sesiones** en `NuevoProductoForm.tsx`, `ProductoForm.tsx`, `AltaAlVuelo.tsx`, `error-escritura.ts`, `VariantesFicha.tsx`, `catalogo_actualizar_producto`, `fn_productos`. El tablero de sesiones puede estar desactualizado. Mitigación: P0 antes de escribir código.
10. **Numeración.** Los números de ADR y de migración chocan siempre entre ramas. Numerar al subir.
11. **Los datos se mueven.** Hoy se depuró el catálogo de pruebas en horas. Mitigación: remedir antes de cada paso y antes de escribir un ADR.
12. **Carrera y cola sin conexión** confirmadas por código, no reproducidas. Mitigación: pruebas en Postgres desechable (P3, P8).
13. **La foto no sostiene el aviso hoy** (1 de 8). Mitigación: tarjeta con muestra de tejido y puntos de color.
14. **Multi-sede aún no ocurrió.** Los 39 movimientos son casi todos de Tienda TRU; el conflicto entre sedes es previsión.
15. **Peso del catálogo en el navegador** (~200 bytes por fila, estimado y no medido; solo probado en un Mac, no en una tablet de tienda). Mitigación: la RPC trae solo la marca; el IDF sale de una lista liviana de nombres.
16. **Dependencias externas.** LLM o embeddings en el guardado violarían el principio 9. No se usan.

---

## 12. Cómo validar con datos reales después del lanzamiento

**Objetivo.** Decidir con datos: (a) si el aviso «Puede ser» debe destacarse, (b) con qué umbral, (c) si «Es el mismo» puede alguna vez destacarse, (d) si la marca puede usarse como bloqueo o solo como peso.

**Qué se registra** (P9, tabla `decisiones_parecido`, solo agregar): persona vía `fn_actor_persona_id(true)`, sede, sesión de alta, versión del algoritmo; al guardar y a los 3, 5 y 8 caracteres tecleados: nombre, descripción, tejido, patrón, marca, categoría, temporada, tamaño del bloque; los 10 primeros candidatos con puntaje y señales por campo; qué se mostró; y la decisión (creó nuevo / sumó a X / buscó a mano y eligió X / abandonó), con el tiempo que tardó.

**Tres fases**

- **S1, sombra silenciosa (2–3 semanas):** no se destaca nada. Cada semana un líder audita: todos los pares en el 20 % superior de puntaje, el 10–15 % de las altas sin alarma con sus candidatos más cercanos, y 100 pares al azar de puntaje bajo para medir el piso. Etiqueta ternaria: mismo / distinto / no sé, con una definición escrita y 10 ejemplos (mismo modelo de la marca; color y talla son variantes; línea niña, hombre, pack y accesorio son productos distintos; material distinto = «no sé»).
- **S2, sombra visible pasiva (3–4 semanas):** «Parecidos» con foto y stock en el 50 % de las altas, asignado al azar por sesión y estratificado por sede. El otro 50 % es el control: esa comparación es la estimación honesta del efecto real. Se audita un 10 % de los clics, porque los «Es otro» hechos con prisa contaminan.
- **S3:** umbrales congelados con S1+S2 y evaluados una sola vez en el 30 % final que nadie miró.

**Cuántas altas hacen falta** (Wilson y normal, 95 %): 384–544 altas nuevas etiquetadas para medir el aviso falso con ±3 puntos; 138 duplicados confirmados para el recall con ±5; 75 eventos de zona alta para certificar precisión ≥ 0,95 (unos 200 para ±3 puntos); 300 positivos y 1.000 negativos para estabilizar umbrales (el corpus usó 127 y 325 y la precisión bajó de 0,95 a 0,86–0,89); 100 pares doblemente etiquetados con kappa de Cohen ≥ 0,70. **Con cientos de productos en total, estas muestras tardarán meses.** Por eso el lanzamiento no depende de ningún umbral: la lista se muestra siempre y solo frena el idéntico.

**Reglas de decisión fijadas de antemano**

- Mostrar «Puede ser» (sin preselección) si, con ≥ 400 altas sin duplicado auditadas, el aviso falso es ≤ 15 % (límite superior de Wilson ≤ 18 %), y con ≥ 100 duplicados auditados el recall del candidato en el top 3 y sobre umbral es ≥ 0,80 (límite inferior ≥ 0,72).
- Destacar «Es el mismo» solo si el límite inferior de Wilson de la precisión es ≥ 0,90 en ≥ 200 eventos, y solo para los tipos de variación donde no haya fallado.
- Vetar el bloqueo duro por marca si más del 5 % de los duplicados auditados tienen marca distinta.
- Recalibrar cada +500 pares etiquetados o cuando el catálogo se duplique; apagar el aviso desde el servidor si el falso semanal pasa de 20 %.

**Qué se mide, por versión:** PR-AUC y curva P-R sobre pares etiquetados; alertas por 100 altas; recall@1/3/5 contra el tamaño del catálogo (100, 300, 1.000, 3.000) y del bloque; aviso falso por tramo; rendimiento por sede, hora y colaborador (el «acento» de cada sede que el corpus no tiene); % de duplicados con marca o categoría distinta o con talla o color en el nombre; días entre duplicados y % que cruza de temporada; tasa de «Es otro» por eje (público, pack, accesorio, largo, número); curvas de tecleo con y sin marca elegida; deriva mensual. Los intervalos se calculan por producto, no por par.

**Lo que puede hacerse ya, sin esperar:** pedir la marca antes del nombre; que el formulario mueva talla y color del nombre a variantes; foto y stock en el aviso; y registrar el evento en sombra desde el día 1. Cada semana sin registro es una semana sin etiquetas.

---

## Apéndice A. Fuentes

**Código y base (verificado):**
- `supabase/migrations/20260918230000_producto_nombre_una_sola_forma.sql`: `fn_clave_referencia`, `fn_dentro_de_una_edicion`, índice único y `buscar_productos_parecidos`.
- `apps/web/components/NuevoProductoForm.tsx:238`, `apps/web/lib/use-parecidos.ts:36-70`, `apps/web/components/alta-producto/AvisoParecidos.tsx:15,66-67`, `apps/web/lib/alta-producto.ts:447`, `apps/web/lib/cola-offline.ts:152`, `apps/web/lib/error-escritura.ts:110`, `apps/web/components/conteo/AltaAlVuelo.tsx:94,160`, `apps/web/lib/nombres-parecidos.ts`.
- ADR-0070 (colores), ADR-0095, ADR-0106, ADR-0109, ADR-0126, ADR-0161, ADR-0195, ADR-0209, ADR-0246 (decisiones 5, 6 y 9), ADR-0260, ADR-0283.
- Producción de solo lectura, proyecto `vovjyyiafkxteijimpuy`, schema `retail`, 2026-09-29: `pg_proc`, `pg_indexes`, `pg_extension`, `information_schema`, conteos de tablas y `ts_lexize('spanish_stem')`.

**Técnicas y estándares** (lo que se pudo abrir; entre paréntesis lo que no):
- PostgreSQL: [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html), [fuzzystrmatch](https://www.postgresql.org/docs/current/fuzzystrmatch.html), [unaccent](https://www.postgresql.org/docs/current/unaccent.html), [diccionarios de texto](https://www.postgresql.org/docs/current/textsearch-dictionaries.html); [stemmer español de Snowball](https://snowballstem.org/algorithms/spanish/stemmer.html); [RapidFuzz](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html).
- Fellegi-Sunter: [valores m y u (Robin Linacre)](https://www.robinlinacre.com/m_and_u_values/), [teoría en Splink](https://github.com/moj-analytical-services/splink/blob/master/docs/topic_guides/theory/fellegi_sunter.md), [reglas de bloqueo](https://moj-analytical-services.github.io/splink/topic_guides/blocking/blocking_rules.html), [frecuencia de término](https://moj-analytical-services.github.io/splink/topic_guides/comparisons/term-frequency.html), [Record linkage (Wikipedia)](https://en.wikipedia.org/wiki/Record_linkage). Limitaciones: [Zingg](https://www.zingg.ai/post/fellegi-sunter-model-limitations-modern-entity-resolution) (blog de un proveedor: interés comercial).
- Bloqueo y filtrado: [Papadakis et al., ACM Computing Surveys 2020](https://arxiv.org/abs/1905.06167) (solo el resumen). [dedupe](https://docs.dedupe.io/en/latest/how-it-works/Matching-records.html). [ING, TF-IDF sobre n-gramas](https://bergvca.github.io/2017/10/14/super-fast-string-matching.html).
- Cohen, Ravikumar y Fienberg 2003 ([PDF](https://pubs.dbs.uni-leipzig.de/dc/files/Cohen2003Acomparisonofstringdistance.pdf) **no se pudo abrir**, HTTP 503; el hallazgo sale de un resumen de búsqueda, sin cifras).
- Distancias: [Jaro-Winkler](https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance), [Damerau-Levenshtein](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance), [Soundex](https://en.wikipedia.org/wiki/Soundex).
- Embeddings y LLM: [pgvector](https://github.com/pgvector/pgvector), [gte-small](https://huggingface.co/Supabase/gte-small), [búsqueda semántica en Supabase](https://supabase.com/docs/guides/functions/examples/semantic-search), [arXiv 2608.16161](https://arxiv.org/pdf/2608.16161) (solo metadatos y resumen; cifras no verificadas), [Peeters y Bizer](https://arxiv.org/html/2305.03423), [estudio de costos en Zenodo](https://zenodo.org/records/20089436).

**Patrones de producto** (lo que se pudo abrir):
- Salesforce: [ayuda](https://help.salesforce.com/s/articleView?id=sf.duplicate_prevention.htm&language=en_US&type=5) (no se pudo abrir como página completa; se usó el resumen), [Salesforce Ben](https://www.salesforceben.com/salesforce-duplicate-rules/), [Trailhead](https://trailhead.salesforce.com/content/learn/modules/sales_admin_duplicate_management/sales_admin_duplicate_management_unit_2).
- [HubSpot](https://knowledge.hubspot.com/records/deduplication-of-records); [Odoo 17, `product_product.py`](https://raw.githubusercontent.com/odoo/odoo/17.0/addons/product/models/product_product.py) y [su foro](https://www.odoo.com/forum/help-1/is-there-a-way-to-flag-duplicate-products-59575); [Shopify según Ablestar](https://www.ablestar.com/blog/how-to-find-and-fix-duplicate-products-in-shopify/) (blog de tercero) y [Ayuda de variantes](https://help.shopify.com/en/manual/products/variants/add-variants) (resumen de búsqueda); [Lightspeed](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533872618651-SKU-FAQs) (403; resúmenes de búsqueda); Square, hilos de comunidad ([1](https://community.squareup.com/t5/Archived-Ideas-Read-Only/Is-there-a-way-to-duplicate-an-item/idc-p/165601#M15775), [2](https://community.squareup.com/t5/General-Discussion/SKUs-already-exist-in-your-library/td-p/320158)); [Stack Overflow](https://stackoverflow.blog/2009/04/29/handling-duplicate-questions/); [Linear](https://linear.app/changelog/2023-08-03-similar-issues) ([nota](https://linear.app/now/using-ai-to-detect-similar-issues), [ZenML](https://www.zenml.io/llmops-database/ai-powered-similar-issues-detection-for-project-management)); [GitHub Issues](https://github.blog/changelog/2026-06-18-duplicate-detection-and-issue-fields-mcp-support-for-github-issues/) (la condición de disparo, título completo y 100 caracteres, sale de prensa y no del changelog: no se usa como regla); [Jira](https://community.atlassian.com/forums/Jira-questions/Need-to-search-Similar-issue-to-display-when-we-create-a-new-one/qaq-p/2848979).
- Usabilidad: [NN/g, sugerencias de búsqueda](https://www.nngroup.com/articles/site-search-suggestions/), [Baymard, autocompletado](https://baymard.com/blog/autocomplete-design), [NN/g, diálogos de confirmación](https://www.nngroup.com/articles/confirmation-dialog/), [NN/g, errores de concepto](https://www.nngroup.com/articles/user-mistakes/) y [reconocer contra recordar](https://www.nngroup.com/articles/recognition-and-recall/), [van der Sijs et al., JAMIA 2006](https://academic.oup.com/jamia/article-abstract/13/2/138/729701) (solo el resumen).

## Apéndice B. Cómo reproducir el benchmark

Todo vive en el scratchpad de esta sesión, **que es temporal** (`/private/tmp/...`). Antes de cerrar la sesión hay que copiar lo que se quiera conservar al repo, por ejemplo a `scripts/investigacion/duplicados/` (requiere tu OK, porque agrega archivos).

Raíz: `/private/tmp/claude-501/-Users-claudiapereyra-Proyectos--cayla-retail--claude-worktrees-cayla-product-deduplication-b2f0da/e4847270-507e-4849-a988-527ceb53fb90/scratchpad`

| Qué | Dónde (bajo la raíz) | Cómo |
|---|---|---|
| Corpus (485 registros, 175 negativos duros, 21 tipos) | `corpus-duplicados.json`, `corpus-README.md`, `cb/` (generador `engine.py`, `lex.py` y validador `validate.py`) | Determinista: mismo md5 con 3 semillas de hash |
| Léxico de prendas | `lexico-prendas.json`, `lexico-build/` | 22 expresiones con versión Postgres probadas contra producción con `select` |
| Arnés y líneas base | `bench/` (`harness.mjs`, `lineabase.mjs`, `humo.mjs`, `pg.mjs`, `util.mjs`, `LEEME.md`) | Node 26, sin dependencias. `node bench/lineabase.mjs` (unos 4 s); `node bench/humo.mjs` (39 pruebas); `node bench/verificar-fidelidad.mjs` (680 pares contra producción y 240.100 contra `nombres-parecidos.ts`); `node bench/verificar-arnes.mjs`; `node bench/tabla.mjs [sinIndice]` |
| Familia A | `bench/a_final.mjs`, `a_scorers.mjs`, `a_tokens_lib.mjs`, `a_ajuste.mjs`, `a_posthoc.mjs` (análisis posterior, etiquetado como tal), `a_humo.mjs` | `node bench/a_final.mjs` |
| Familia B | `bench/b-final.mjs`, `b-scorers.mjs`, `b-modelo.mjs`, `b-analisis.mjs` | `node bench/b-final.mjs` (unos 90 s) |
| Familia C | `bench/c_familia_c.mjs`, `c_fs.mjs`, `c_texto.mjs`, `c_analisis.mjs`, `c_iter.mjs` | `node bench/c_familia_c.mjs` |
| Resultados | `bench/resultados/*.json` | Dos corridas dan JSON idéntico byte a byte |
| Proyección de candidatos | `proyeccion_candidatos.py/.json`, `proyeccion_especializada.py/.json` | Monte Carlo con semilla fija; la fórmula cerrada de control coincide (0,137, 0,327, 1,38) |
| Auditoría de vocabulario | `vocab/` (`scan.ts`, `pares.ts`, `idf.ts`, `union.ts`, `datos.json`) | Solo lectura sobre producción |
| Re-prueba del escéptico | `escepticos/adv/`, `escepticos/repro/`, `escepticos/casos_para_felipe.csv` | `escepticos/adv/correr_casos.mjs` corre los 40 casos congelados (md5 `e2f5099e775dc7a5cf04e42f3e2bd974`); `sensibilidades.mjs`, `escala_submuestreo.mjs`, `escala_pool.mjs`, `prevalencia.py`, `bootstrap_pareado.py`, `explicar.mjs` |
| Prototipo del buscador y conjunto dorado | `prototipo-buscar-existentes-v2.sql`, `golden-set-buscar-existentes.json` | Bloqueo por marca y categoría y luego comparación del «modelo»: avisa 12 de 12 sin falsos en 4 negativos. Lo armé mirando esos mismos productos: demuestra el mecanismo, no mide precisión |

## Apéndice C. Límites de lo investigado

- Los 8 productos reales se cargaron en 84 minutos, casi todos por la misma sede. No permiten estimar ninguna distribución; los ~300 pares etiquetados que harían falta para calibrar no existen aún.
- Los pesos, umbrales y cifras de rendimiento salen de un corpus sintético con marca y categoría casi siempre correctas y 46 % de grupos duplicados. Las etiquetas de los casos frontera (Maia/Maya, Sofi/Sofía) son criterio del autor.
- El escéptico escribió 40 casos nuevos con etiquetas propias (mismo LLM); con n = 20 los intervalos de Wilson son de ±25 puntos.
- Los intervalos del arnés no incluyen la incertidumbre de haber elegido los umbrales con 127 positivos y 149 negativos.
- No se midieron embeddings ni LLM en el corpus; lo dicho sobre ellos viene de la literatura consultada.
- No se midió el costo en una tablet de tienda; solo en un Mac.
- La carrera entre sedes y el comportamiento de la cola sin conexión están confirmados por lectura de código y catálogo, no reproducidos en producción.
- No se pudo abrir el PDF de Cohen 2003, Salesforce Help completo, el artículo de variantes de Lightspeed (403) ni el texto completo de van der Sijs; se indican donde se usan.
- Tampoco está verificada la condición de disparo de GitHub Issues ni las cifras de arXiv 2608.16161.
- Las marcas «Importado» y «Divas / Divas Now» y cualquier cifra de vocabulario se remiden antes de actuar (2.5).
- `docs/datos/generado/DICCIONARIO-RETAIL.md:333` sigue diciendo que `productos.temporada` es texto libre; producción ya tiene la llave a `temporadas(clave)`. Se refresca con `pnpm datos:generar:produccion` cuando se aplique una migración.
