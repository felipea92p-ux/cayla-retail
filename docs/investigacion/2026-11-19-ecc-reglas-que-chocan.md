# Lo que ecc propone y nuestras reglas prohíben: ¿quién tiene razón? (2026-11-19)

**Pregunta de Felipe.** Al revisar el repo de skills [`affaan-m/ecc`](https://github.com/affaan-m/ecc) se descartaron varias
piezas porque «chocan con las reglas». ¿Y si la regla es la equivocada? Este documento toma cada choque y lo juzga contra lo
que hacen los mejores equipos, sin dar por buena ninguna de las dos partes. Lo que sí sirve de ecc tal cual está en
`docs/backlog/2026-11-19-ecc-skills-agents-analysis-3dd8fe.md`. La segunda vuelta, con el diseño, el color y el flujo enteros,
está en `2026-11-19-diseno-color-y-flujo-sin-miedo-a-las-reglas.md`.

**Cómo se midió.** Todo contra `origin/main` del 2026-11-19 (`ac88e0dbb`). Las cifras salen de comandos sobre el repo; la
documentación de Claude Code y la de Supabase se consultaron el mismo día. Lo que no se pudo verificar dice «por verificar».

**Veredicto en una línea.** En la mayoría de los choques la regla de CAYLA gana, porque ecc escribe para equipos grandes y
volúmenes que CAYLA no tiene (principio 5). Pero en **cuatro** la regla compensa con más texto o más candados un diseño que se
podría cambiar para que el problema no exista (principio 2 aplicado al proceso, no solo al inventario). Tres de ellas (A, C y D)
conviene cambiarlas con matices. En la cuarta (B) el problema es real, pero el remedio que proponen ecc y Supabase todavía no es
seguro aquí.

**Revisión escéptica.** Un revisor independiente intentó tumbar cada propuesta con evidencia del repo. Ninguna resistió entera,
y sus objeciones comprobadas ya están incorporadas abajo. B fue la que más cambió.

---

## Las cuatro reglas que convendría cambiar

### A. Dónde viven las reglas: `CLAUDE.md` de 143 KB → raíz corta + reglas por carpeta

**La regla hoy.** Toda regla nueva entra a `CLAUDE.md`, con su historia («aprendido el 2026-09-24…») y su lista de excepciones.

**Lo que dice ecc.** Reglas separadas por tema (`rules/common`, `rules/typescript`…), un `CLAUDE.md` por módulo
(`module-governance`) y medir el costo de contexto (`context-budget`).

**Evidencia.**

- `CLAUDE.md` mide 143.430 bytes y 1.005 líneas: unos 35.000 tokens que se cargan en **cada** sesión, también en una que solo
  toca un SQL o un texto de la tienda.
- La documentación de Claude Code recomienda apuntar a menos de 200 líneas por archivo y dice que un archivo largo consume
  contexto y **reduce la adherencia**. El tamaño juega en contra de lo que el tamaño busca.
- El 91 % de esos bytes (129 KB) está en secciones cuya regla ya vigila una prueba o el CI, y `.githooks/pre-commit` corre la
  suite entera de `vitest` en cada commit. La regla no depende de que Claude se acuerde: si la rompe, el commit no pasa.
- Tres secciones repiten lo que ya está en otro lado: «Una función, una pieza» (29 KB; la tabla está en `docs/unificar/` y la
  vigila `unificar.test.ts`), «Movimiento y modales» (16 KB; repite ADR-0136) y el párrafo de skills (10 KB; repite sus
  descripciones).
- Efecto colateral medido en la misma sesión: el listado de skills tiene un presupuesto fijo, y `focus`, `sugerir`,
  `unificar`, `revision` y `textos` llegaron sin descripción.

**Lo que hacen los mejores.** Claude Code ya trae el mecanismo: `.claude/rules/<tema>.md` con `paths:` en el frontmatter se
carga solo cuando Claude lee o edita un archivo de esa ruta, y un `CLAUDE.md` dentro de una carpeta (`supabase/CLAUDE.md`) se
carga al tocar esa carpeta. Los `@imports` **no** sirven para esto: se cargan siempre, junto al archivo que los importa. Es el
mismo principio que el código: lo que se usa en un lugar vive en ese lugar.

**La regla nueva.**

1. `CLAUDE.md` raíz, lo más cerca posible de 200 líneas: rol, los 12 principios, autonomía, vocabulario, idioma, ritual de
   sesión y un **índice de reglas**, una línea por regla, con la prueba que la vigila y dónde leer el detalle.
2. **Las reglas transversales se quedan en la raíz** (una o dos líneas cada una), porque cruzan carpetas: solo tokens y modo
   oscuro, módulos y roles (`exigirModulo`, `fn_actor_persona_id(true)`), guía de foco y sugerencias, familias fuera de los
   motores y precio 0, números y PR (`pnpm reservar`) y el pase de SQL a producción. Una sesión que diseña una RPC desde `lib/`
   o desde la conversación todavía no abrió `supabase/`, y una regla con `paths:` solo se carga al leer o editar un archivo de
   su ruta.
3. A `.claude/rules/` va solo el **detalle local**, partido por ruta. Por ejemplo: `sql-produccion.md` (`supabase/**`: cómo pegar,
   las partes, el `select … into`), `finanzas.md` (`apps/web/**/finanzas/**`), `tienda.md` (`apps/tienda/**`), `guias.md`
   (`apps/web/lib/guias/**`) y `movimiento.md` (`apps/web/**/*.css`, `apps/web/components/**`).
4. Una regla que ya tiene prueba lleva **una línea** y el nombre de la prueba. La historia («aprendido el…») va al ADR, no a la
   regla.
5. Medirlo: `/context` antes y después, en una sesión que solo toca SQL y en otra que toca un modal.

- **Ganas:** miles de tokens menos en cada sesión (cuántos, lo dice la medición del punto 5), y una regla que se lee entera
  en vez de perderse en la línea 700. Cada sesión ve las reglas de lo que está tocando.
- **Pagas:** una mañana de reorganizar sin cambiar el contenido, y el riesgo de que una regla quede en una ruta que no se toca
  (se mitiga con el índice y las transversales en la raíz). Una sesión que toca de todo cargará casi todo, como hoy.
- **Quién decide:** Felipe (toca la forma en que se gobiernan todos los módulos).

### B. SQL a producción por un solo camino: el pipeline con aprobación, no el pegado

**La regla hoy.** Felipe pega cada migración en el SQL Editor antes de fusionar (a veces usa `supabase db push` o
`apply_migration` del conector). `CLAUDE.md` dedica 4,8 KB a cómo pegar sin romper: el prefijo `retail.`, partir en partes
contra el deadlock de políticas, no escribir `select … into` dentro de un texto entre comillas porque el editor agrega líneas.

**Lo que dice ecc.** Su primer principio de migraciones: todo cambio es una migración y nadie altera producción a mano. La propia
documentación de Supabase recomienda «a CI/CD pipeline to deploy new migrations» con GitHub Actions en vez de aplicar desde una
máquina.

**Evidencia de lo que cuesta el camino manual.**

- Tres de las reglas de `CLAUDE.md` existen solo por cómo se comporta el SQL Editor: todo lo pegado en una sola transacción, el
  `search_path` en `public` y las líneas que agrega solo.
- Alrededor de eso creció un aparato: `sql-pegado.yml` (la casilla «SQL pegado» que el CI comprueba, ADR-0251),
  `deriva-diaria.yml` y su corrección `deriva-pegados.mjs` (ADR-0402), `sin-drop-trigger.mjs`, el candado de los ayudantes
  `pg_temp`, 26 archivos `pegar-en-produccion-*.sql` y el formato de reemplazo anclado.
- Hay tres canales a producción y dos registros: `supabase_migrations.schema_migrations` y `retail.migraciones_aplicadas`.
  `apply_migration` anota la versión con la hora en que se aplica, no con la del archivo. Que producción y `main` difieran es un
  estado posible, y por eso existe un vigía que lo detecta cada mañana: el 2026-10-14, 239 de 302 diferencias eran de PR
  abiertos.
- Por el principio 2 («si el inventario puede quedar en un estado imposible, el diseño está mal»), el proceso hoy **detecta** la
  deriva en vez de hacerla **imposible**.

**Lo que hacen los mejores.** Las migraciones las aplica el pipeline, un solo camino, con una persona que aprueba. Ejemplos:
GitHub con *environments* que piden revisión, y Supabase con su ejemplo de Actions. La consola queda para emergencias.

**Por qué aquí todavía no.** La revisión escéptica encontró en el propio repo tres razones que el remedio de ecc no considera:

1. **El CLI aplica todas las migraciones pendientes en una sola sesión**, y los ayudantes `pg_temp` se arrastran de una a otra.
   Cada pegada del SQL Editor, en cambio, es su propia sesión. El 2026-10-23 eso dejó a `main` sin poder armar una base desde
   cero (`42P13`; `scripts/migraciones/README.md`, «Ayudantes pg_temp»). Un `db push` desde el CI correría justo en ese modo.
2. **El historial no coincide.** Las pegadas del SQL Editor no dejan fila en `supabase_migrations.schema_migrations` (ADR-0251,
   «DESCARTÉ», verificado el 2026-09-22), y el CLI exige que el historial local y el remoto coincidan. El primer `db push`
   fallaría o querría «reparar» un historial que además comparte el proyecto con Dynamic.
3. **ADR-0195 sigue valiendo con el CLI**: el bloqueo de las 21 tablas de `auth` y `storage` lo toma `create policy` en Postgres,
   no el editor. La regla de partir las políticas no se va; solo cambia de «partes de una pegada» a «archivos aparte».

Y la llave: la deriva diaria ya cuida que ningún paso que corre SQL de un PR tenga la llave de producción en su entorno
(ADR-0402). Una llave que **escribe** el esquema, en un repo público, es otra categoría de riesgo, no un escalón más.

**La regla nueva, más chica.** El problema de fondo (tres canales, dos registros, deriva que se detecta en vez de impedirse)
sigue siendo real. El remedio va por etapas:

1. **Un solo canal desde ya.** Elegir uno de los tres y dejar los otros para emergencias anotadas. El candidato natural es el
   SQL Editor, que es el que el aparato actual ya entiende. `apply_migration` es el peor de los tres, porque registra la versión
   con otra hora.
2. **Medir antes de automatizar.** Un `supabase db push --dry-run` contra producción, con el resultado anotado, dice cuánto se
   aparta el historial. Y acordar con Dynamic de quién son las filas de esa tabla.
3. **Recién entonces**, si el paso 2 sale limpio, un botón manual que aplica **un archivo por vez** (su propia sesión, como hoy
   el editor) detrás de un *environment* con la aprobación de Felipe.

- **Ganas (etapa 1):** un registro que se puede leer, sin construir nada.
- **Pagas:** el pegado a mano sigue, y con él sus reglas.
- **Quién decide:** Felipe (cambia cómo se toca producción).

### C. Movimiento: de «sin bucle, sin rebote» con 29 excepciones a un criterio por frecuencia

**La regla hoy.** ADR-0136: sin rebote, nunca decorativo, nunca en bucle. Siguen 16 KB de excepciones con nombre (el colibrí,
el gato Aventurero, la billetera de insignias, el telar de Finanzas, la planilla de Ajustar stock…): **29 actualizaciones
distintas de ADR-0136** citadas en `CLAUDE.md` (21 días distintos, del 5 de octubre al 17 de noviembre, más dos sin fecha), y
varias porque Felipe pidió «full animaciones».

**Lo que dice ecc.** `motion-foundations` y `motion-patterns`: resortes (*springs*), gestos y una librería (`motion`).

**Lo que hacen los mejores.** Apple anima casi todo con resortes; el de fábrica no rebota, y el rebote se reserva para lo que la
persona arrastra con el dedo. El criterio de fondo de su guía de movimiento no es «nada de adorno» sino **cuánto se repite**:
lo que se hace cien veces al día responde rápido y sin show, y lo que pasa una vez (entrar, cerrar la caja, sellar) puede
lucirse.

**Diagnóstico.** Una regla que se exceptúa varias veces por semana no describe lo que se decide: la regla real es la que ya
enseña `/movimiento` («dónde no van nunca: lo que se usa cientos de veces, el teclado, las filas»). La lista de excepciones es
la prueba. Pero la lista también cumple una función que un criterio solo no cumple: cada excepción la eligió Felipe mirando, y
tiene su prueba (`tienda-web-movimiento`, `sellos-movimiento`, `campana-hoja-movimiento`, `ajuste-modelo-movimiento`). Con un
criterio solo, cada sesión diría que su pantalla «es un momento», y el ERP volvería a tener veinte estilos de movimiento, que es
justo lo que combate ADR-0358.

**La regla nueva.**

- **Lo que nunca lleva movimiento rico** (lo que se usa cientos de veces: filas, teclas, combos, botones, el mostrador): solo
  responde, en 200 ms o menos, sin bucle y sin entrar en cascada. Esto sí es criterio, y se puede vigilar.
- **Lo demás sigue pidiendo el OK de Felipe**, como hoy. La pregunta cambia de «¿es una excepción?» a «¿es un momento o una
  señal?», y la respuesta queda en el registro.
- **El registro sale de `CLAUDE.md`:** una tabla (pieza, categoría, quién la eligió, su prueba) en `docs/movimiento/` o en
  la regla de carpeta de la propuesta A. `CLAUDE.md` conserva la regla en tres líneas.
- **Siempre:** `prefers-reduced-motion`, solo `transform` y `opacity`, interrumpible.

Lo que **no** cambia: no hace falta la librería `motion`. GSAP ya está, y `lib/hoja-gesto.ts` ya hereda la velocidad del dedo
al soltar una hoja.

- **Ganas:** 16 KB menos de `CLAUDE.md` y una regla que nombra lo que Felipe decide de verdad (frecuencia y propósito).
- **Pagas:** mover el registro y revisar que cada fila tenga su prueba. El control de Felipe sobre cada pieza se mantiene.
- **Quién decide:** Felipe (es su estética; ADR-0136 es suyo).

### D. El loader a pantalla completa: que el marco quede vivo al navegar

**La regla hoy.** ADR-0149: un solo loader que cubre todo, también el lateral y la cabecera, al cargar una pantalla, al guardar y
al cambiar de sede. Aparece a los 200 ms. Cada `loading.tsx` dibuja `<EsperaPantalla />`.

**Lo que dice ecc.** `react-patterns`: `Suspense` por sección, esqueletos y estados pendientes por acción.

**El argumento original y lo que cambió.** ADR-0149 descartó el estado pendiente por botón porque «las acciones que guardan en
silencio son las que nadie recordó». Eso ya se resolvió por otro lado: desde el 2026-10-14 **todo botón que guarda pasa
`cargando`** (`<Boton cargando>`, decisión `accion.guardar` de `/unificar`, vigilada por prueba). Para guardar, hoy hay dos
señales a la vez: el botón dice «Guardando…» y la pantalla entera se tapa.

**Lo que hacen los mejores.** En los paneles de Linear, Stripe o Vercel, al navegar el marco sigue vivo: el lateral responde, y
si te equivocaste de pantalla, te vas a otra sin esperar. El App Router de Next.js está hecho para eso: `loading.tsx` reemplaza
el contenido y deja el layout. CAYLA usa `loading.tsx` para tapar también el layout, y pierde esa ventaja justo donde más
importa: el internet de una tienda.

Donde sí conviene bloquear todo: cobrar, anular, ajustar stock o emitir un comprobante. Ahí tapar la pantalla protege. Aunque
el doble envío ya lo frena la base (`p_token` en `registrar_venta` y en cientos de funciones más), una colaboradora no debe
seguir tocando mientras el dinero está en vuelo.

**Lo que el ADR sí considera y hay que respetar** (revisión escéptica):

- El problema que le dio origen fue justo un marco vivo con un contenido viejo: «el lateral cambia de resaltado pero el
  contenido sigue siendo el anterior, o queda en blanco» (ADR-0149, «Contexto»). Dejar el lateral vivo sin una señal clara en el
  contenido revive ese engaño.
- Con el loader a la vista el resto de la app está `inert`. Eso impide navegar mientras un guardado termina con un
  `router.refresh()`, y ese es el peor caso si el marco queda vivo: el guardado termina en una pantalla que ya no está a la vista.
- El aviso de éxito se coordina con el loader (`lib/espera-estado.ts`). Cambiar el alcance obliga a rehacer esa coordinación.

**La regla nueva.**

- **Todo guardado sigue tapando la pantalla entera, como hoy**: el de dinero, stock y comprobantes, y también el de un nombre o
  un filtro guardado. Así no hay navegación con un guardado en vuelo.
- **Al navegar** (y solo al navegar), el loader cubre el área de contenido y deja el lateral y la cabecera vivos. El contenido
  viejo nunca queda a la vista: el loader lo tapa desde los 200 ms, igual que hoy. Sigue siendo una sola pieza.
- **La medición es requisito, no recomendación:** cuánto dura de verdad una navegación en tienda (Vercel Speed Insights o el
  registro de `/medicion`). Si casi todas se quedan bajo 1 s, el cambio no vale lo que cuesta.

- **Ganas:** en una carga lenta, la persona puede cambiar de idea e ir a otra pantalla.
- **Pagas:** tocar la pieza global, `clasificarPeticion` (separar navegar de guardar) y la coordinación con los avisos.
- **Quién decide:** Felipe (es experiencia de uso en todos los módulos). Es la de menos confianza de las cuatro: no hay ninguna
  medida que la respalde todavía.

---

## Una que no está prohibida, pero quedó fuera por la costumbre de «solo local»

### E. Pruebas de punta a punta en el CI para los caminos del dinero

Todo lo que se prueba en un navegador es local y manual: `/chaos`, `/flujo-de-negocio`, `guias:recorrer`, `tema:auditar` y las
mediciones de `/milimetro`. Ningún workflow de `.github/workflows/` corre Playwright. Tiene sentido para lo que escribe en la
base local compartida o saca capturas privadas, pero deja sin red el camino más caro de romper: vender y cobrar, cerrar la
caja, devolver con nota de crédito y trasladar.

Los mejores tienen un puñado de pruebas de punta a punta en cada PR que toca esos caminos, contra una base desechable. Es lo que
proponen `e2e-testing` y `browser-qa` de ecc. El CI de CAYLA ya levanta Postgres para sus pruebas de base. Propuesta: de 4 a 6
pruebas, con datos inventados (el repo es público: las capturas solo si fallan, y nunca con datos reales), que corren solo
cuando `scripts/ci/alcance.mjs` ve tocados esos módulos.

Las pruebas de navegador son frágiles. Por eso empiezan como check **informativo**, que no bloquea la fusión, durante dos
semanas en las que se cuentan los rojos falsos. Solo pasan a obligatorias si casi no hay.

- **Ganas:** un botón de cobrar roto no llega a la tienda.
- **Pagas:** minutos de CI (de ahí el alcance) y el trabajo de mantener 4 a 6 pruebas cuando cambie la pantalla. Corrección de la
  segunda vuelta: desde la cola de fusión (2026-11-07) el CI ya no traba; un PR tarda de mediana 20 minutos en fusionarse.
- **Quién decide:** Felipe (tiempo de CI).

---

## Donde la regla de CAYLA gana (y por qué)

| ecc propone | La regla de CAYLA | Por qué gana CAYLA |
|---|---|---|
| `CREATE INDEX CONCURRENTLY`, backfill por lotes, renombres «sin caída» (`database-migrations`) | Índices en la misma transacción | Las tablas tienen menos de 25 mil filas y el bloqueo dura milisegundos (`20260924110000_concurrencia_caja_e_indices.sql:39`). Es técnica para millones de filas (principio 5). El renombre en tres pasos ya se usa (colaborador → integrante) |
| `bigint` o evitar UUID (`postgres-patterns`, `database-reviewer`) | 206 claves `uuid` | Con este volumen la fragmentación del índice no se nota, y cambiarlo costaría meses. Si alguna tabla de solo agregar crece mucho (`movimientos`), `uuidv7` cuando producción pase a Postgres 18 |
| Índice en toda clave foránea | Sin índice hasta que algo tarde ~200 ms (`panel_calidad.sql:40`), con la lentitud medida sola (ADR-0656) | Medir primero es lo correcto, y CAYLA nunca borra un padre (no hay barridos por `on delete`). **Matiz por medir:** la columna que filtra una política RLS sí conviene indexarla siempre, porque la política corre fila por fila |
| Interfaz optimista (`react-patterns`, `useOptimistic`) | Nada optimista en dinero, stock ni comprobantes; sí en estado de interfaz | Es lo que hacen Stripe y los bancos: un cobro se muestra cuando la base lo confirma |
| TanStack Query, SWR, `react-window` | Server Components y lectura en el servidor | Con el App Router de Next 16 una caché de cliente duplicaría la del servidor |
| `rgba()` sueltos, `prefers-color-scheme`, toques de 40 px (`make-interfaces-feel-better`) | Solo tokens, `data-tema`, 24/32/44 px | Los tokens son lo que hace cualquier sistema de diseño serio. 24/32/44 sigue a WCAG 2.5.8 y a Apple mejor que 40. **Matiz menor:** casi todos ofrecen «Automático (como el sistema)» además de claro y oscuro; para un terminal compartido de tienda, arrancar en claro es defendible |
| Combos y modales a mano con ARIA (`frontend-a11y`) | Radix y las piezas únicas | Una pieza probada una vez es más accesible que cien hechas a mano |
| Borrar código muerto con un agente (`refactor-cleaner`) | Knip en el CI, `@public` e `@internal` con motivo | El agente ignora las excepciones declaradas y baja paquetes con `npx` |
| `REGRESSION.md`, `TESTS.md`, `MAP.md` (`module-regression`, `test-collaboration`, `change-impact`) | Una sola fuente de verdad | Serían copias que se desactualizan. El CI ya elige qué correr (`alcance.mjs`) |
| Memoria automática de «instintos» (`continuous-learning-v2`) | Memoria en archivos, decisiones en ADR (principio 8) | Guarda datos personales en texto plano y aprende de páginas de terceros sin que nadie lo revise |
| Hooks que niegan la primera edición o bloquean al cerrar (`gateguard`, `delivery-gate`) | Sin hooks de Claude; pre-commit con `tsc` y `vitest` | El pre-commit ya da la respuesta determinista antes de cada commit. Lo único que falta son preguntas antes de tocar producción (`permissions.ask`, punto 1 del backlog) |
| Una dirección de diseño propia de la skill (`frontend-design-direction`, `design-system`) | Las skills de diseño de afuera se consultan, no mandan | Las marcas serias tienen su propio sistema; una estética genérica lo diluye |
| Cobertura mínima de 80 % (`verification-loop`, `tdd-workflow`) | Sin meta de cobertura | Una meta de cobertura se cumple con pruebas que no prueban nada (ley de Goodhart) |

**Sobre los ADR.** ecc trata un ADR como un registro fijo: si la decisión cambia, se escribe otro que lo reemplaza. CAYLA les
agrega «actualizaciones» con fecha. No es grave por sí mismo. Lo malo es que la regla vigente quede en tres lugares a la vez:
`CLAUDE.md`, la última actualización del ADR y el registro de la familia. La propuesta A lo resuelve: la regla vive en un
lugar, el ADR guarda el porqué.

---

## Lo que hacen los mejores y ni ecc ni CAYLA tienen todavía (sin choque con ninguna regla)

- **Modelo por tarea en los subagentes.** `/revision`, `/formidable` y `/chaos` lanzan revisores que heredan el modelo de la
  sesión (el más caro). ecc le pone a cada agente su modelo (`sonnet` para revisar, `haiku` para barridos mecánicos). Los tres
  revisores de esta misma sesión gastaron unos 250 a 300 mil tokens cada uno. Las skills que lanzan barridos de solo lectura
  podrían pedir un modelo más barato.
- **Pruebas de mutación en las reglas del dinero.** Hay más de 1.000 archivos de prueba, pero nada dice si atraparían un error.
  Una herramienta de mutación (Stryker) sobre dos o tres `*-reglas.ts` de caja y ventas cambia un `>` por `>=` y mira si alguna
  prueba se pone en rojo. Es la medida que usan los equipos serios en lógica crítica, en vez de la cobertura.

---

## Orden recomendado

1. **A** (las reglas por carpeta, con las transversales en la raíz): es la de más ganancia diaria, no toca producción y mejora la
   adherencia a todas las demás reglas.
2. **C** (movimiento por frecuencia, con la lista en un registro): sale casi gratis si se hace junto con A.
3. **B, solo su etapa 1** (un solo canal a producción) y el punto 1 del backlog (que Claude pregunte antes de tocar
   producción). La etapa 2 (el `--dry-run` y el acuerdo con Dynamic) es una investigación aparte; el pipeline, solo si esta sale
   limpia.
4. **E** (pruebas de punta a punta de los caminos del dinero), como check informativo.
5. **D** (el marco vivo al navegar), solo si la medición dice que las navegaciones en tienda tardan.
