---
name: revision
description: Revisión maestra del repo de CAYLA Retail. Cinco revisores en paralelo (módulos y diccionario, base de datos, cierre y pendientes, instrucciones a Claude Code, duplicación de la web) y un escéptico que descarta lo falso. Entrega un informe de hallazgos rankeados con solución, esfuerzo y cómo verificarla, más ideas para programar mejor. Solo lee, no arregla. Con `rapido` corre una pasada barata; con `eje=A`…`eje=E`, un solo eje.
---

Revisión maestra del repo. Alcance pedido: $ARGUMENTS

**Regla madre:** revisas y propones. No tocas código, migraciones, BACKLOG ni producción. Arreglar es un paso aparte que Felipe ordena ("haz los de «Corrige ya»"). Lo único que esta revisión escribe en el repo es su informe.

**Para qué sirve, en una frase:** decirle a quien decide qué corregir primero, qué decidir él y qué método cambiar para que el mismo error no vuelva a aparecer. Un informe que solo lista defectos es un fracaso; uno que no distingue lo grave de lo cosmético también.

**Por qué es autocontenido:** esta skill la corre cualquiera del equipo, y `~/.claude/CLAUDE.md` (el criterio global de Felipe) no está en el repo. Todo lo que el revisor necesita para juzgar va aquí abajo.

## Paso 0 — Terreno (tú, el coordinador, antes de lanzar nada)

1. `git fetch origin` y `git rev-list --left-right --count HEAD...origin/main`. Si la rama va detrás, dilo en la primera línea del informe y pásale a cada revisor el SHA de `origin/main` para que lea con `git show origin/main:<ruta>`: leer código viejo produce hallazgos fantasma. Anota `git rev-parse --short origin/main`: sin ese SHA nadie sabe contra qué versión vale el informe.
2. Mira qué está en vuelo: `docs/SESIONES-ACTIVAS.md` (solo la tabla «Activas ahora») y `gh pr list --state open --limit 60`. Se lo pasas a los revisores para que no reporten como hallazgo lo que un PR abierto ya arregla.
3. Crea el directorio de trabajo `<scratchpad>/revision-AAAA-MM-DD/` (el scratchpad de tu prompt de sistema; si no hay, `/tmp/revision-AAAA-MM-DD/`). Ahí van los JSON de los revisores; el repo solo recibe el informe final.
4. `BACKLOG.md` y `BITACORA.md` juntos pasan de 15.000 líneas: **no se leen enteros, se buscan** por módulo o término. El triaje del 2026-09-25 (sección «Estado verificado el 2026-09-25» del BACKLOG) ya clasificó las casillas abiertas de ese día; esta revisión no lo repite, mira lo que cambió después.

## Paso 1 — Lanza los cinco revisores

**En UN solo mensaje, cinco llamadas al tool `Agent`** (`general-purpose`, en segundo plano). Cada prompt = el «Contrato común» de abajo + el bloque de su eje + su ruta de salida `<dir>/eje-X.json`. Espera las notificaciones; no hagas polling ni repitas su trabajo mientras corren. Al terminar, comprueba que cada JSON existe y parsea (`jq . <archivo>`); si uno falló, relanza solo ese.

### Contrato común (se pega entero en el prompt de cada revisor)

**Eres revisor de un eje del ERP de CAYLA (retail + manufactura textil peruana: tiendas TRU/AQP/LIM y un Taller en Lima). Stack real: Next.js + Supabase (Postgres + RLS), tablas en español, sin `tenant_id`. Producción vive DENTRO del proyecto Supabase «cayla-dynamic», schema `retail` (no en Freewheel).** Vocabulario: colaborador/integrante, líder de equipo, sede/tienda, clienta; en la base la tabla de sedes es `ubicaciones`. Nunca «empleado/jefe/sucursal».

**Límites duros (romperlos invalida tu informe):**
- Solo lectura. No uses Edit/Write en el repo (solo escribes tu JSON en el directorio de la revisión). Prohibido: `git add/commit/push/switch/checkout/reset/stash`, `pnpm install`, **cualquier `pnpm datos:*` o `node scripts/datos/*`** (reescriben `docs/datos/generado/`, y lo hacen aun con `--help`: pasó en la primera corrida con `datos:comparar`; para el cruce de funciones usa `pg_proc` en vivo y lee `DRIFT.md` ya escrito), `supabase start`/`db reset`, arrancar servidores, `pkill`, y cualquier escritura a producción, incluso «con ROLLBACK». Permitido si `node_modules` ya existe: `pnpm lint`, `pnpm typecheck`, `pnpm test` y los candados `node scripts/adr/numeros.mjs` y `node scripts/migraciones/versiones.mjs`; no instales nada para poder correrlos.
- Producción, **solo `SELECT`**: por el conector Supabase (`execute_sql`; si está diferido, cárgalo con ToolSearch). Elige el proyecto «cayla-dynamic» por nombre (`list_projects`) y comprueba que ve el schema con `select count(*) from retail.modulos`. Una sentencia por llamada, empezando con `select` o `with`. Verifica **por efectos** (`pg_proc`, `pg_constraint`, `pg_trigger`, `information_schema`, `pg_class.relrowsecurity`), nunca por `supabase_migrations.schema_migrations` (los nombres no son fiables). Las cifras de producción envejecen en horas: consúltalas en vivo, no las cites de memoria ni del volcado `docs/datos/generado/`. Si el conector no responde, di «sin producción», degrada al volcado con su fecha y baja la confianza de esos hallazgos a Media.
- Datos personales: en el JSON van conteos y nombres de columnas, nunca filas con DNI, teléfono o nombre de una clienta.
- Sin evidencia no hay hallazgo: cada uno lleva `archivo:línea` o una consulta con su resultado.
- Antes de reportar, busca el término en `docs/BACKLOG.md` (`grep -n`). Si ya está registrado y el registro sigue vigente, no lo reportes; si está desfasado o subestima la severidad, repórtalo citando la línea. Si un PR abierto ya lo arregla, dilo y baja la severidad.
- Si dos entradas de un documento se contradicen, manda la más reciente por la fecha de su encabezado; si un documento contradice a producción, manda producción y esa contradicción es hallazgo.
- Producción y `main` se mueven mientras corre la revisión (en la primera corrida, dos PR nuevos y dos funciones nuevas en producción a media pasada): anota la hora de cada consulta y, si algo cambió entre tu primera lectura y tu JSON, dilo en `resumen`.

**Rúbrica: las 12 preguntas con las que se juzga cada cosa.** Cita el número cuando un hallazgo nace de una.
1. *Núcleo mínimo:* ¿hay algo en el núcleo (`productos`, `variantes`, `stock`, `movimientos`) o en un módulo compartido que podría vivir en la periferia?
2. *Integridad conceptual:* ¿dos partes resuelven el mismo problema de dos formas? Una está mal, aunque las dos funcionen.
3. *Contrato antes que código:* ¿el módulo o RPC dice en tres líneas qué promete y qué asume?
4. *Estados imposibles:* ¿el esquema los impide (CHECK, FK, UNIQUE, trigger) o solo el código? Un constraint vale más que diez validaciones.
5. *Desenredar:* ¿una función mezcla dos responsabilidades (calcular y guardar; dinero y stock)?
6. *Caso especial:* ¿un `if` de excepción que un mejor modelo de datos haría sobrar?
7. *Borrar antes de agregar:* ¿capa, abstracción, tabla o columna que nadie usa?
8. *Todo falla:* ¿qué pasa cuando SUNAT/Lucode, apis.net.pe o Dynamic no responden? ¿Está escrito «se degrada así, no pierde este dato»?
9. *Todo o nada:* ¿lo que toca más de una tabla, dinero o stock cabe en una transacción? ¿Qué pasa si dos escrituras llegan al mismo registro en el mismo milisegundo?
10. *Números antes que opiniones:* ¿hay cifra (filas a 3 años, escrituras por minuto en hora punta)? Sin número, «puede ser lento» es superstición.
11. *Hacer fácil el cambio:* ¿la tarea obliga a pelear con el código existente? El refactor va en un commit y el cambio en otro.
12. *El error es del diseño:* ¿una colaboradora sin formación técnica completa el flujo sola, sin que nadie se lo explique?

**Severidad** (asígnala por el escenario, no por el tono):
- **Crítico:** puede perder o falsear dinero, stock o un comprobante; da acceso a quien no debe; o hoy rompe algo en producción.
- **Alto:** producirá un estado inconsistente o una caída con el uso o el volumen que viene, o bloquea salir en vivo.
- **Medio:** deuda que encarece cada cambio futuro.
- **Bajo:** higiene.
**Esfuerzo:** S (menos de 2 h) · M (medio día a un día) · L (más). **Confianza:** Alta (reproduciste la evidencia) · Media (inferido, o sin producción).

**Formato de cada hallazgo** (máximo 8 por eje, rankeados; el noveno no se escribe: si hay más, el eje está peor que un informe y lo dices en `resumen`):
`{ id, eje, titulo, severidad, esfuerzo, confianza, rubrica:[n], evidencia:["archivo:línea | consulta → resultado"], problema, por_que_importa, solucion, descartada, se_rompe_si, como_verificar, toca_dinero_o_produccion, decide_felipe, pregunta_para_felipe }`
- `por_que_importa`: un escenario del negocio real (la última unidad de un polo vendida en dos sedes a la vez; una clienta que devuelve a los 8 días), nunca «mejor práctica».
- `solucion`: pasos con nombre de tabla, archivo o función, no «hay que pensar en escalabilidad».
- `descartada`: la alternativa real y su costo. Quien no puede nombrar lo que descartó tomó lo primero que funcionó.
- `se_rompe_si`: el escenario específico que haría fallar tu solución.
- `decide_felipe: true` cuando depende de cómo opera CAYLA (dinero, permisos, plazos, a qué sede reingresa algo): no lo asumas, escribe la pregunta con «Ganas / Pagas».
- `como_verificar`: qué corre alguien para ver que quedó bien (una consulta, un comando `pnpm`, una captura a 375 px).

**Tu JSON completo:** `{ eje, resumen, hallazgos:[…], ideas:[…≤3], lo_que_esta_bien:[…≤3], no_mire:[…] }`. Las `ideas` son patrones repetibles para programar mejor («cada RPC nueva nace con su prueba en `scripts/pruebas/`», «este `if` desaparece si la sede es una columna y no un nombre»), con el archivo donde se ve. `no_mire` es lo que no alcanzaste a revisar: declararlo vale más que aparentar cobertura. Presupuesto orientativo: ~40 llamadas de herramienta; trabaja los puntos de tu eje en el orden en que están escritos y, si te quedas sin presupuesto, corta desde el último y decláralo en `no_mire`.

### Los cinco ejes

Cada uno lleva su pregunta madre y dónde mirar. Los ejemplos son **patrones a buscar**, no hallazgos ya dados: si no los encuentras vigentes, no los reportes.

**A · Módulos que se hablan, y diccionario alineado** — *«¿lo que un módulo da por hecho de otro está prometido, escrito y vigilado?»*
1. *El mismo dato escrito en dos sitios:* columnas o listas que representan el mismo concepto en dos módulos y pueden separarse (rubro de un proveedor vs categoría del catálogo; motivos, estados o medios de pago como texto libre en una tabla y como lista cerrada en otra). Método: `docs/datos/generado/retail_columnas.json` + `retail_constraints.json` (columnas `text` con vocabulario cerrado que no son FK), `CHECK` con la misma lista escrita en 2+ tablas, constantes repetidas entre `apps/web/lib/*-reglas.ts` y `packages/shared`.
2. *Contratos RPC pantalla ↔ base:* cruza cada `.rpc("…")` de `apps/web` (`grep -rn '\.rpc(' apps/web`) con `pg_proc` **en vivo** (`pnpm datos:comparar` lee el volcado, que va detrás): firmas que no calzan, sobrecargas, funciones vivas que un `create or replace` posterior pudo revertir (`grep -n "reemplazar_vivo" supabase/migrations/*.sql`).
3. *Un módulo asume algo de otro:* sigue tres flujos de punta a punta (venta → stock → movimiento → caja → comprobante; recibir → stock → costo → por pagar; devolución → nota de crédito → stock). En cada frontera: ¿quién lo promete (`docs/datos/09-CONTRATOS.md`), qué candado lo vigila (`01-INVARIANTES.md`), y `13-PROMESAS-INCUMPLIDAS.md` sigue diciendo la verdad?
4. *Alineación diccionario · aviario · menú · roles:* `DICCIONARIO-RETAIL.md` y `retail_*.json` contra la base viva (tablas, vistas, funciones, RLS); `scripts/datos/aviario.mjs` y `AVIARIO.md`; `apps/web/lib/modulos.ts` y `lib/menu.ts` contra `retail.modulos`; un archivo de `docs/datos/modulos/` por pájaro. No repitas de memoria cuántas tablas hay: mídelo.
5. *Coordinación y organización:* filas de `SESIONES-ACTIVAS.md` con más de 7 días (sesiones zombi), choques de ADR y de versión de migración (`node scripts/adr/numeros.mjs`, `node scripts/migraciones/versiones.mjs`), PR abiertos que tocan los mismos archivos (`gh pr diff <n> --name-only`), ramas huérfanas.

**B · Base de datos: esquema, RLS, funciones** — *«¿puede el esquema producir un estado imposible aunque el código sea perfecto?»*
1. *RLS:* tablas de `retail` sin RLS (`relrowsecurity`), políticas `using (true)`, tablas leídas directo con `.from("…")` desde la web cuya política no distingue sede ni rol.
2. *Funciones `security definer`:* sin `search_path` fijo, `execute` para `anon`/PUBLIC (`has_function_privilege`), funciones que escriben sin firmar con `retail.fn_actor_persona_id(true)` ni preguntar `fn_ve_modulo`/`fn_es_lider`.
3. *Estados imposibles:* columnas `*_id` sin FK (`pg_constraint`), pares contradictorios sin CHECK (estado «anulada» con fecha de anulación nula), `numeric` de dinero o stock sin `CHECK >= 0` donde corresponde, `timestamp` sin zona.
4. *Dinero y stock:* ¿todo cambio de `stock` nace de un `movimientos` (append-only, sin `UPDATE`/`DELETE` para nadie)? ¿Redondeo y descuentos calculados en un solo lugar? ¿Nota de crédito y devolución acreditan lo que se cobró?
5. *Concurrencia e idempotencia:* la última unidad vendida en dos sedes (`for update`, UNIQUE parcial), doble clic (tokens `p_token`), y si `scripts/pruebas/concurrencia_*.mjs` prueba carreras reales con COMMIT.
6. *Migraciones:* prefijo `retail.` o `set search_path`, `create or replace trigger` (nunca `drop trigger`), políticas en partes separadas de los `alter` de tablas en uso (CLAUDE.md, «Políticas y deadlocks»), parches vivos que se pierden al recrear.
7. *Volumen:* estima filas a 3 años en las tablas calientes (`movimientos`, `stock`, `actividad`, ventas) con `pg_stat_user_tables` y `pg_total_relation_size`; índices que faltan para las `fn_*` de listado. Con número, no con opinión.
8. *Pruebas:* qué funciones que tocan dinero no tienen prueba en `scripts/pruebas/`, y qué pruebas de `package.json` no están cableadas en `.github/workflows/ci.yml`.

**C · Cierre y pendientes** — *«¿lo que llamamos terminado lo usa la sede sola, conectado y verificado?»* (aquí vive lo que Felipe llama «pendientes»)
1. *Fusionado sin pegar:* migraciones nuevas en `origin/main` (`git log origin/main -- supabase/migrations`) cuyo efecto no está en producción, y PR fusionados a `main` cuya web ya pide una columna o función que la base no tiene.
2. *PR abiertos:* edad, `CONFLICTING`, checks, los zombis; `gh pr list --state merged --json number,mergedAt,createdAt,reviews` para medir horas hasta fusionar, PR fusionados en rojo y revisiones registradas.
3. *Pendientes reales:* busca `- [ ]` **por módulo**, no entero; clasifica en: ya hecho · espera acción concreta de Felipe (di cuál) · decisión de dinero · trabajo que Claude hace solo. Reporta lo que cambió desde el triaje del 2026-09-25 y lo que el triaje dejó de lado.
4. *Celular y verificación:* pantallas de Vender, Cambios y Devoluciones con captura a 375 px (`docs/pr/`, casillero de `.github/pull_request_template.md`); rutas de `apps/web/app/(app)/` sin entrada en el menú, sin `loading.tsx`/`error.tsx`, o con `TODO`/`FIXME`.
5. *Documentos de estado:* `docs/BACKLOG.md`, `docs/ARQUITECTURA.md` y `docs/datos/generado/` contra la realidad; cifras escritas a mano que ya envejecieron.
6. *Puertas:* qué obliga el CI y `main` (checks, revisión) y qué queda a la disciplina de cada quien.

**D · Cómo instruimos a Claude Code** — *«¿qué reglas se cumplen solas y cuáles dependen de que alguien se acuerde?»*
1. Inventario de las reglas de `CLAUDE.md` (movimiento de modales, loader único, paleta, módulos y roles, combos, página estable, pantallas de Finanzas, migraciones y deadlocks…). Para cada una: **vigilada** (una prueba, lint o CI la rompe en rojo: `lib/modulos.test.ts`, la prueba de arquitectura), **solo escrita**, o **contradicha por el código**. Busca violaciones reales con `grep`: overlay `fixed inset-0` fuera de `<Modal>`, `<select` nativo, hex sueltos en `*.tsx`, `fn_actor_persona_id(false)` o `from personas where auth_user_id` en migraciones nuevas, `drop trigger`. Excluye los usos legítimos de `fn_actor_persona_id(false)` (comparar con la cuenta, «no te quites a ti mismo», `fn_alcanzo_a`).
2. `CLAUDE.md`: longitud, contradicciones internas, afirmaciones que ya no son ciertas, cifras que envejecen, rituales imposibles (mandar leer archivos de miles de líneas), dependencias de archivos fuera del repo.
3. `.claude/skills/`: skills que citan archivos inexistentes, solapadas, o que faltan (checklist de «módulo nuevo», de «aplicar migración a producción») y hoy son párrafos sueltos de `CLAUDE.md`.
4. `.claude/settings.json`, `.githooks/pre-commit`: qué regla escrita podría ser un hook o un paso del CI (`migraciones:verificar`, `adr:numeros`); rutas que solo existen en una máquina.
5. *Simulación del recién llegado:* con solo lo que hay en el repo, ¿puede una sesión de Claude Code de una persona sin contexto escribir una migración correcta, un módulo nuevo con su rol y una pantalla que respete la paleta? Recorre el camino mínimo y anota dónde se atasca o se equivoca en silencio.

**E · Duplicación y consistencia de la web** — *«¿el mismo problema está resuelto de una sola manera?»*
1. *Tamaño y mezcla:* componentes de más de ~800 líneas (`find apps/web -name '*.tsx' | xargs wc -l | sort -rn | head`) y qué mezclan (UI + reglas de dinero + llamadas a la base); `"use client"` que no hace falta.
2. *Duplicados de negocio:* cálculos de IGV, descuento, redondeo, formateo de moneda y fecha implementados en más de un archivo; validaciones duplicadas frente a `packages/shared`; helpers de error paralelos.
3. *Mecanismos paralelos:* combos, modales, tablas, loaders y colas de guardado que resuelven lo mismo de dos maneras, aunque las reglas de `CLAUDE.md` digan que hay una. Si `jscpd` no está instalado, no lo instales: usa `grep` por firma y `codegraph`/`graphify` si existen.
4. *Rendimiento web:* cascadas de `await` en Server Components que podrían ir en `Promise.all`, cantidad de `.rpc` por pantalla, imports pesados en el cliente (apóyate en la skill `vercel-react-best-practices` si está disponible).
5. *Persona sin contexto:* estados vacíos, de carga y de error con texto que una colaboradora entiende; un formulario donde una equivocación se cobra en dinero o stock sin confirmación.
6. *Pruebas de web:* `lib/*-reglas.ts` sin su `.test.ts` junto al lado, empezando por las que calculan dinero.

## Paso 2 — El escéptico

Cuando los cinco JSON estén listos, **un solo `Agent`** (`general-purpose`) recibe el mismo contrato de límites duros y esta tarea: *intentar refutar cada hallazgo*, no confirmarlo. Con ~40 hallazgos no alcanza el presupuesto para todos: que empiece por los Críticos y Altos, siga con los Medios, y marque `NO_VERIFICADO` lo que no vea, en vez de confirmarlo por inercia. También anota en `cambios_desde_la_revision` lo que `main` o producción cambiaron mientras tanto.
- Reabre cada `evidencia` en el SHA de `origin/main` y vuelve a correr cada consulta. Si el archivo o la línea ya no dicen eso, es **REFUTADO**.
- Busca si un PR abierto o reciente ya lo arregla (`gh pr list --state all --search "<término>"`) y si el BACKLOG ya lo registra.
- Detecta **duplicados entre ejes** y los fusiona (el mismo defecto mirado desde la base y desde la web es uno).
- Baja la severidad de todo «Crítico» sin escenario concreto de dinero, stock, comprobante o acceso.
- Juzga la `solucion`: ¿es reversible en menos de 30 minutos?, ¿introduce riesgo nuevo?, ¿su `se_rompe_si` es un escenario o una frase vacía?
- Veredicto por hallazgo: **CONFIRMADO** (reprodujo la evidencia) · **PLAUSIBLE** (no pudo reproducirla y no la refuta) · **REFUTADO** (con el motivo) · **DUPLICADO de <id>**. Escribe `<dir>/esceptico.json`.

## Paso 3 — El informe (lo escribes tú, no un agente)

Sigue `plantilla-informe.md` y guarda en `docs/revisiones/AAAA-MM-DD-revision-maestra.md` (crea la carpeta). Reglas:
- Entran CONFIRMADO y PLAUSIBLE. Los REFUTADOS van en una sección corta con su motivo: prueba que el escéptico trabajó y evita que el próximo revisor los repita.
- **Orden:** severidad → menor esfuerzo primero → mayor confianza. Un Crítico en S va antes que un Crítico en L.
- Toda respuesta a una tarea real lleva **tres movimientos**: *el trabajo* (lo revisado), *la objeción* (lo que está mal de fondo, directo y con el trade-off nombrado; si no hay, «sin objeción» y ya) y *lo que nadie pidió* (UNA cosa, la de mayor consecuencia, con su porqué; si no la encuentras, no revisaste el sistema, revisaste la tarea: vuelve a mirar).
- «Cómo programar mejor» no es una lista de consejos: son las `ideas` agrupadas por patrón, cada una con el archivo donde se ve mal hoy y cómo se vería bien.
- Cifras: cada número lleva la consulta o comando que lo produjo y la fecha. Ninguno de memoria.
- El encabezado lleva el SHA analizado, si hubo producción, y qué ejes corrieron. Sin eso el informe no dice contra qué vale.

## Paso 4 — Preguntas a Felipe

Del apartado «Decide Felipe» toma las **2 a 4 decisiones de mayor peso** (dinero, permisos, plazos, qué módulo se apaga) y hazlas con `AskUserQuestion`: cada opción con «Ganas / Pagas», la recomendada primero y marcada «(Recomendado)». Decide tú lo técnico y explícalo en tres líneas; pregunta solo lo que únicamente él sabe. Al cerrar cada ronda, refleja lo elegido en el informe.

## Paso 5 — Cierre

1. `git status --short` debe mostrar solo `docs/revisiones/…` (y `.claude/skills/revision/` mientras esta skill no esté commiteada). Si algo más cambió, un revisor rompió la regla de solo lectura: repórtalo, no lo escondas.
2. En el chat: máximo 10 líneas: los 3 hallazgos que harías primero, lo que decide Felipe, la ruta del informe. Después, tres líneas de docencia (**QUÉ HICE** en lenguaje de negocio · **POR QUÉ ASÍ** la razón real · **QUÉ SE ROMPERÍA SIN ESTO**).
3. **Antes de publicar el informe, mira la visibilidad del repositorio** (`gh repo view --json visibility`). Si es público y el informe describe un hueco de seguridad todavía abierto en producción (nombre de la función y cómo abusarla), **no lo commitees en una rama que se empuje ni abras PR con él** hasta que el hueco esté cerrado; déjalo en una rama local o compártelo por un canal privado, y dilo. Lo mismo vale para las ramas que arreglan esos huecos: se pegan en producción primero y se abren como PR después.
4. No hagas commit ni PR sin que Felipe lo pida. Ofrece, en una línea, convertir «Corrige ya» en ramas de trabajo, o pasar los pendientes que la revisión reclasificó a `/backlog` para que reescriba `docs/BACKLOG.md`.

## Modos

- **`rapido`**: un solo revisor generalista (el contrato común, ~15 llamadas, los 3 mejores hallazgos de cada eje) y sin escéptico. El informe lo dice en la primera línea: «pasada rápida — sin escéptico, puede traer falsos positivos».
- **`eje=A|B|C|D|E`**: solo ese revisor, más el escéptico.
- **Sin argumentos:** los cinco ejes y el escéptico.
