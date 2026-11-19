
## 🧰 Lo que sirve del repo de skills `affaan-m/ecc` (2026-11-19) — solo documentación; rama `claude/ecc-skills-agents-analysis-3dd8fe`

Se revisaron las 327 skills, los 74 agentes, los hooks y las reglas de [`affaan-m/ecc`](https://github.com/affaan-m/ecc) (v2.2.3,
commit `3f14a10`) contra las 35 skills de `main`. **No se instala el plugin**: sus hooks corren en cada herramienta, uno
guarda en disco lo que devuelve cada llamada (incluidas consultas a producción con datos de clientes) y sus revisores son
copias recortadas del `pr-review-toolkit` oficial de Anthropic. Nada de ecc reemplaza a una skill propia. Lo que se rescata
son ideas sueltas, ordenadas por valor. El análisis de las reglas que chocan con ecc, y cuáles convendría cambiar, está en
`docs/investigacion/2026-11-19-ecc-reglas-que-chocan.md`.

- [x] Análisis hecho y verificado contra `origin/main` (`c3204bc83`): cada cita de los revisores se comprobó en el código.

**Las 8 ideas para adaptar** (de más a menos valor)

- [ ] **1. Que Claude pregunte antes de tocar producción.** `permissions.ask` nativo en `.claude/settings.json`, sin hooks:
  `apply_migration` del conector de Supabase, `Bash(supabase db push*)`, `Bash(git push --force*)` y `-f`,
  `Bash(git reset --hard*)`, `Bash(git stash pop*)`, `Bash(git clean*)` y `Bash(git commit --no-verify*)` (el pre-commit
  de `.githooks/` solo vale si nadie lo salta). `execute_sql` queda fuera salvo que Felipe acepte que pregunte también en
  cada `select` de `/revision`. Según la documentación de Claude Code, una regla `ask` sigue preguntando en modo auto.
  Viene de `gateguard`, que no ve las vías reales a producción. **Decide Felipe** (es configuración).
- [ ] **2. Achicar `CLAUDE.md`: 143 KB y 1.005 líneas, unos 35.000 tokens en cada sesión.** La documentación oficial
  recomienda menos de 200 líneas y dice que un archivo largo «reduce la adherencia». El 91 % de sus bytes describe reglas que
  ya vigila una prueba o el CI, y el pre-commit corre la suite entera de `vitest`. Mecanismo: `.claude/rules/<tema>.md` con
  `paths:` (se cargan solo al tocar archivos de esa ruta) o un `CLAUDE.md` por carpeta (`supabase/`, `apps/tienda/`). Los
  `@imports` no sirven: se cargan siempre. Detalle en la investigación, propuesta A. **Decide Felipe** (toca todos los módulos).
- [ ] **3. Descripciones de skills más cortas.** El listado de skills tiene un presupuesto (1 % de la ventana de contexto).
  Cuando se pasa, Claude Code recorta las descripciones de las skills menos usadas: en la sesión del 2026-11-19 `focus`,
  `sugerir`, `unificar`, `revision` y `textos` llegaron **sin descripción**. Recortarlas a unos 250 caracteres, con el caso
  de uso primero. Alternativa sin tocar las skills: `skillListingBudgetFraction: 0.02` en la configuración.
- [ ] **4. «Relleno silencioso» en el escáner de observabilidad** (`scripts/rendimiento/observabilidad.mjs`,
  `/skill-evaluacion-observabilidad`). Hoy da por tratado un `catch { return [] }` y no mira `.catch(() => …)`: hay 144 en
  `apps/web` (64 `=> null`, 38 `=> {}`). Muchos son a propósito y están comentados (`getCambiosBancarios(id).catch(() => [])`
  en la ficha del proveedor lo dice en la línea de arriba). La regla sería exigir el motivo en la línea, como `// tema-fijo:`.
  Viene de `silent-failure-hunter`, «Dangerous Fallbacks».
- [ ] **5. Una familia nueva en `/chaos`: «el botón que no hace lo que dice».** No falla nada ni se escribe nada malo, pero
  un `router.refresh()`, un `push` o un `useEffect([prop])` pisa el estado que se acababa de guardar. Las invariantes no lo
  ven y `/flujo-de-negocio` solo lo ve si el botón está en su camino. Viene de `click-path-audit` (patrones 4-6 y la carrera
  async); su mapa de stores no aplica (no hay Zustand ni Redux).
- [ ] **6. Medir si el motor de demanda acierta:** sesgo con signo y WMAPE por categoría y campaña, nunca MAPE (se rompe con
  menos de ~50 unidades por semana). Hoy no hay ningún error de pronóstico medido en `apps/web/lib`. Dónde:
  `plan-compra-resultados.ts` (escenario elegido contra lo vendido, sin las agotadas) y el «comparar antes de reemplazar» de
  `demanda-reglas.ts` §5. Viene de `inventory-demand-planning`, «Forecast Accuracy Metrics». **Decide Felipe** (negocio).
- [ ] **7. El candado que falta contra el deadlock de políticas.** `scripts/migraciones/sin-drop-trigger.mjs` dice que no ve
  un `alter` de tabla en uso junto a un `create policy` en la misma pegada. Idea: correr cada parte en Postgres local dentro de
  `begin … rollback`, leer `pg_locks` del propio proceso y poner rojo si toma a la vez `AccessExclusiveLock` sobre
  `auth`/`storage` y sobre una tabla de `retail`. **Antes de construirlo:** probar que el Postgres local reproduce ese bloqueo
  (ADR-0195 lo midió solo en producción). Vale igual con el CLI: el bloqueo lo toma `create policy` en Postgres, no el
  editor. Viene de `database-migrations/examples/postgres-add-column.sql`.
- [ ] **8. `/decide` con una voz independiente:** escribir la posición propia antes de mirar las opciones y lanzar un
  escéptico con contexto limpio que reciba solo la pregunta; el disenso queda a la vista. Solo en decisiones estructurales.
  Viene de `council` (pasos 3-5).

**Para hacer una vez**

- [ ] **Auditoría SEO de `apps/tienda`** (tarjeta propuesta en la sesión del 2026-11-19). No hay `sitemap.ts`, `robots.ts`,
  `metadataBase` ni canonical, y la ficha de prenda (`catalogo/[id]`) solo da `title`: sin descripción, sin imagen
  OpenGraph (la vista previa al compartir por WhatsApp) y sin JSON-LD `Product`/`Offer` en soles.
- [ ] **Evaluación del asistente con repeticiones** (tarjeta propuesta en la sesión del 2026-11-19). `evaluar.mjs --veces 3`:
  3 de 3 en los casos de seguridad (`sin_acceso`, `fuera_de_tema`), promedio y peor caso en el resto, y costo y tiempo de la
  corrida. Una sola pasada no separa un 88 % real de un 92 % con suerte. Viene de `eval-harness` (pass@k).
- [ ] **Pasar la lista de revisión de `skill-stocktake` por las 35 skills**, a mano y con un subagente, sin sus scripts (escriben
  en `~/.claude`). Primeras sospechosas: `grill-me` junto a `grilling`; las tres `skill-*`, con nombres de otro estilo;
  `caveman`, `innovar` y `ultra-criterio`; y el set «Al milímetro» contra las secciones de `CLAUDE.md` que lo repiten.

**Decisiones de negocio que salieron de paso** (son de Felipe)

- [ ] Quién aprueba una devolución después de los 15 días: `devoluciones-reglas.ts:94-97` dice que «no está escrito quién».
  El orden de `returns-reverse-logistics` («Return Policy Exception Logic») serviría de texto para quien aprueba: con defecto,
  se acepta siempre; si se puede volver a vender, la excepción sale barata; cuidado con el precedente.
- [ ] Si `DIAS_OBJETIVO_PRODUCCION` (hoy el umbral fijo de cobertura sana) debería salir de «días hasta la próxima orden + días
  que tarda en llegar a la tienda» (~14 del corte a la tienda, sin medir: `06-planificacion.md:214`). Si se quiere colchón,
  un cuantil Poisson, no la Z normal de ecc.
- [ ] Si el asistente anota también `cache_creation_input_tokens` en `registrar_pregunta_asistente` (hoy solo
  `cache_read_input_tokens`), para saber cuánto sirve la caché. Lleva migración.

**Reglas que convendría cambiar** (todas de Felipe; el porqué, lo que se gana y lo que se paga, en la investigación)

- [ ] **A.** `CLAUDE.md` raíz corto, con las reglas transversales en una línea cada una; el detalle local a `.claude/rules/`
  con `paths:`.
- [ ] **C.** Movimiento: «nada rico en lo que se usa cientos de veces» como criterio; las 29 excepciones salen de `CLAUDE.md` a
  un registro con su prueba, y cada pieza nueva sigue pidiendo el OK de Felipe.
- [ ] **B, etapa 1.** Un solo canal a producción. La etapa 2 (`supabase db push --dry-run` contra producción y acordar con
  Dynamic el historial) es una investigación aparte. El pipeline del CI, solo si sale limpia.
- [ ] **E.** De 4 a 6 pruebas de punta a punta de los caminos del dinero en el CI, informativas durante dos semanas.
- [ ] **D.** El marco vivo al navegar (los guardados siguen tapando todo), solo si la medición dice que las navegaciones tardan.

**Segunda vuelta: diseño, color y flujo** (`docs/investigacion/2026-11-19-diseno-color-y-flujo-sin-miedo-a-las-reglas.md`; lo
que toca la estética lo elige Felipe mirando una lámina, no esta lista)

- [ ] **Escalones con nombre para texto, línea y relleno** (4 + 3 + 2, en OKLCH por tema) en vez de 13 opacidades de tinta (2.324
  usos) y el taupe compitiendo por ser el secundario (1.683). Migrar al tocar cada pantalla, con su deuda vigilada.
- [ ] **Rampa tipográfica cerrada:** los 37 tamaños sueltos a una rampa con nombre; nada nuevo bajo 11 px (197 usos hoy, deuda
  que solo baja); el eje `opsz` de DM Sans en `layout.tsx`; cifras tabulares en toda columna de montos. Se quedan el título de 46 px
  y las versalitas de la cabecera.
- [ ] **Comparar mirando «vidrio en todo» contra «vidrio solo en lo que flota»** en Existencias, Compras y la hoja de Cobro. Si
  gana la segunda, cambia la regla S5 del contrato con Dynamic.
- [ ] **Cerrar las recetas de vidrio** en tres niveles de material (hoy 16 radios de desenfoque, 12 saturaciones y 217 variables),
  sin cambiar el aspecto y con el aviso a Dynamic.
- [ ] **Separar los colores de dato que chocan en una misma pantalla** (`#2f6aa3` es sede Trujillo, persona 1, transferencia y
  TikTok).
- [ ] **Detalles de oficio:** contorno interior de 1 px en las fotos de prendas, `text-wrap: balance` en títulos y `pretty` en párrafos.
- [ ] **Decisión de Felipe:** si las animaciones ricas que se siguen construyendo deben verse (ofrecer el botón la primera vez, o
  encenderlas en los equipos que las aguantan), dado que ADR-0625 las deja apagadas por defecto.
- [ ] **F1.** Tablero de sesiones que se arma solo (`pnpm sesiones` al abrir sesión), en lugar de las 143 filas a mano de
  `docs/SESIONES-ACTIVAS.md`.
- [ ] **F2.** Partir los archivos donde escriben todos: una guía por pantalla, un archivo por entrada en los tableros de
  `/formidable` y `/chaos`, y `ARQUITECTURA.md` generado.
- [ ] **F3.** Skills obligatorias en tres niveles, con un recibo atado al commit en vez de una casilla.
- [ ] **F4.** Modo «señalar un elemento» en `apps/web/unificar/elegir.mjs`.
- [x] **F5.** La memoria guarda decisiones, no estado: se corrigieron las tres notas con PR fusionados (#1617, #1779, #1766).
- [ ] **F6 (decide Felipe).** Un PR por actividad en las obras grandes.
- [ ] **F7–F9.** Modelo según la tarea en los subagentes; auditar una vez las compuertas con `loop-design-check`; limpiar 39
  worktrees y 213 ramas remotas.

**Descartado, con el motivo** (para no volver a evaluarlo)

- `postgres-patterns`: resumen de `supabase-postgres-best-practices`, que ya está entera. Su plantilla trae
  `REVOKE ALL ON SCHEMA public`, y en este proyecto `public` es el schema de Dynamic.
- `database-migrations` (el texto): el 60 % es Prisma, Drizzle, Kysely y Django. `CREATE INDEX CONCURRENTLY` y el `COMMIT`
  dentro de `DO $$` fallan en la transacción única del SQL Editor, y con tablas de menos de 25 mil filas no hacen falta.
- `continuous-learning-v2`: arma una segunda memoria sin versionar en `~/.local/share`, guarda hasta 5.000 caracteres de lo
  que devuelve cada herramienta en texto plano (DNI, teléfonos y nombres, si la consulta es a producción) y un agente en
  segundo plano escribe «instintos» sin preguntar, leyendo páginas de terceros.
- `gateguard`, `delivery-gate`, `safety-guard`, `strategic-compact`: hooks que estorban con varias sesiones en paralelo o solo
  dan consejos. Lo que sí protege es el punto 1.
- Los agentes `code-reviewer`, `security-reviewer`, `typescript-reviewer`, `react-reviewer`, `pr-test-analyzer`,
  `type-design-analyzer`, `comment-analyzer`, `database-reviewer`, `refactor-cleaner`: genéricos o copias recortadas. Si algún
  día se quieren, se instala el `pr-review-toolkit` original del marketplace oficial.
- `make-interfaces-feel-better` (versión vieja de `better-ui`), `frontend-a11y`, `react-patterns`, `santa-method`,
  `verification-loop`, `change-impact`, `module-regression`, `test-collaboration`, `spec-miner`, `inherit-legacy-style`,
  `production-audit`, `prompt-caching-strategy` (el asistente ya usa la caché bien, `route.ts:163`), `cost-aware-llm-pipeline`
  (precios viejos), `canary-watch`, `production-scheduling` (pensado para 300 operarios).
