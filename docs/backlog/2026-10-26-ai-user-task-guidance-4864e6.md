## «Pregúntale a CAYLA»: el asistente con IA que guía (ADR-0529, 11 actividades aprobadas por Felipe el 2026-10-26)

- [x] 1 · El cajón sin IA: botón «Preguntar» en la cabecera, «?» y ⌘/, búsqueda local entre las guías del menú de la cuenta.
- [x] 2 · La IA responde (Claude Haiku 5.5, `/api/asistente`): elige guía y paso de una lista cerrada; sin clave, sin respuesta en 8 s o con una respuesta fuera de la lista, búsqueda sin IA. ~2 s y ~US$0,0013 por pregunta (medido en local).
- [x] 3 · Recorridos: «Muéstrame» arranca en el paso que responde, con lo que necesita abierto, y pasa solo a la pantalla del siguiente tramo (hasta 3).
- [x] 4 · Sin acceso: si responde una pantalla de un módulo que el rol no tiene, el sistema dice dónde se hace y «pídeselo a tu líder de equipo», sin los pasos.
- [x] 5 · Cada pregunta queda anotada (`retail.asistente_preguntas`, migración `20261026235000`), «¿Te sirvió? Sí / No» y «¿Qué buscabas?», y el tope de US$30 al mes (`fn_asistente_gasto_del_mes`). Aplicada solo en la base local.
- [ ] **Pegar `20261026235000_asistente_preguntas.sql` en producción** (necesita el OK de Felipe; una sola parte, tabla nueva sin políticas y tres funciones). Mientras no esté, el asistente responde igual pero no anota nada (`preguntaId: null`, sin «¿Te sirvió?») ni cuenta el tope del mes: queda solo el límite de gasto de la consola de Anthropic.
- [ ] Refrescar el volcado de producción (`datos:generar:produccion`) cuando la migración esté aplicada: `pnpm datos:comparar` marca las tres funciones hasta entonces.
- [x] 6 · Rellenar con candados: el dato que la persona dijo, tal cual, solo en el `<Buscador>` (`data-asistente="rellenable"`, lista blanca vigilada), marcado «Lo escribió CAYLA · revísalo» hasta que la persona lo toca. Nunca guarda.
- [ ] **Felipe:** ¿sumar otros campos rellenables (el texto de un motivo, combos de una opción)? Hoy solo el buscador.
- [x] 7 · Reglas de tienda (`lib/asistente/reglas-de-tienda.ts`, 10 aprobadas por Felipe el 2026-10-27) y errores con la frase de la pantalla (`frasesDeErrores`). Una regla sin escribir: «Eso no lo tengo escrito todavía».
- [ ] **Felipe (2026-10-27): «los líderes solo supervisan visualmente».** Hoy el sistema exige líder para aprobar una devolución (`aprobar_devolucion`), anular un comprobante y autorizar un descuento sobre el tope; y la guía de Caja dice «Lo hace un líder» aunque `cerrar_caja` ya no lo exige. Sacar esos candados toca dinero y permisos: va en su propia sesión, con su ADR y su migración. Mientras tanto, la regla «devolucion-aprueba» queda en borrador.
- [ ] 8 · Interruptor por sede en Configuración (`retail.asistente_sedes`).
- [ ] 9 · Pantalla «Lo que pregunta tu equipo» (módulo nuevo, solo líder).
- [ ] 10 · El informe del lunes (vigía de GitHub Actions + Sonnet 5.5).
- [ ] 11 · Evaluación de 40 preguntas, `/guia`, `/focus`, `/formidable`, `/chaos`, modo oscuro y 375 px, y el PR con `/abrir-pr`.
- [ ] Ver en producción que un tramo encuentra su pieza a tiempo (en desarrollo, Productos tardó más de 8 s en cargar).
- [ ] **Felipe:** ¿«¿Cómo anulo una boleta?» debe llevar a Devoluciones («Anular una venta de hoy») o a Comprobantes? Hoy la IA elige Devoluciones.
- [ ] En una terminal la pregunta queda sin persona: el cajón todavía no manda el responsable del combo (`x-responsable`).

### Para continuar desde otra sesión (2026-10-27)

**Dónde está todo.** Rama `claude/ai-user-task-guidance-4864e6`, worktree
`/Users/felipealvarez/Proyectos/cayla-retail/.claude/worktrees/ai-user-task-guidance-4864e6`. Todo en commits locales (sin push, sin
PR: la regla de Felipe es un PR al final de la obra, con `/abrir-pr`). La decisión es `docs/adr/0529-preguntale-a-cayla-asistente-con-ia.md`
(léela entera: las 10 respuestas de Felipe, las tres tensiones y «Lo que decidí al construir»). Se construye con `/construir`, una
actividad y un commit a la vez.

**Lo que sigue, en orden** (la lista completa está arriba):
- **8 · Interruptor por sede.** Tabla nueva `retail.asistente_sedes` (ubicación, encendido, desde), escrita solo por una función con
  `fn_es_lider()`… pero ojo: Felipe dijo el 2026-10-27 que «los líderes solo supervisan visualmente»; antes de poner ese candado,
  pregúntale quién enciende el asistente de una sede (y mira qué decidió la sesión «Sacar los candados de líder que ya no aplican»).
  El interruptor va en Configuración; el botón «Preguntar» (`components/asistente/Asistente.tsx`, montado en `components/AppShell.tsx`)
  solo sale en las sedes encendidas. No es un módulo (ADR-0306). Migración nueva con `pnpm reservar migracion`.
- **9 · Pantalla «Lo que pregunta tu equipo»** (módulo nuevo, nace solo para el líder: migración con `insert into retail.modulos`,
  `CLAVES_MODULO`/`MODULOS` en `lib/modulos.ts`, nodo en `lib/menu.ts`, `exigirModulo`, su guía y su guía de foco).
- **10 · Informe del lunes** (vigía de GitHub Actions + Claude Sonnet 5.5, `claude-sonnet-5-5`; las cifras salen de SQL y cada mejora
  cita ids de preguntas que existen).
- **11 · Cierre**: evaluación de 40 preguntas, `/guia`, `/focus`, `/formidable`, `/chaos`, modo oscuro, 375 px y el PR con `/abrir-pr`.

**Piezas que ya existen** (para no rehacerlas): `lib/asistente/` (preselección local, respuesta y revisión de la IA, recorrido,
sin acceso, relleno, reglas de tienda, conocimiento), `app/api/asistente/route.ts` y `app/api/asistente/sirvio/route.ts`,
`components/guias/recorrido.ts` y los cambios en `MotorGuias.tsx`, `GuiaInteractiva.tsx` y `piloto.ts` (acción `rellenar`,
`dejarComoQuedo`), `data-asistente="rellenable"` en `components/ui/Buscador.tsx`. Pruebas: `lib/asistente/*.test.ts`,
`lib/asistente-rellenable.test.ts`, `pnpm pruebas:asistente-preguntas` (13 casos contra Postgres).

**Base y claves.**
- La migración `20261026235000_asistente_preguntas.sql` está aplicada **solo en la base local** (contenedor `supabase_db_cayla-retail`,
  anotada en `supabase_migrations.schema_migrations`). Se editó después de aplicarla (tipos `regla` y `error`, columna `referencia`) y la
  base local se puso al día a mano: si una sesión nueva la recrea, que la aplique entera de nuevo. **No está en producción**: pegarla
  necesita el OK de Felipe.
- `apps/web/.env.local` de este worktree tiene `ANTHROPIC_API_KEY` (la puso Felipe; nunca se imprime ni se sube). Felipe también la
  puso en Vercel. Una pregunta cuesta ~US$0,0013 con `claude-haiku-5-5`.
- La base local tiene 2 preguntas de prueba en `retail.asistente_preguntas` (se pueden dejar).

**Para verificar en el navegador:** `preview_start` con `cayla-retail-dev` (puerto 3010), entrar como Felipe (cuenta de prueba local),
⌘/ abre el asistente. Para otra cuenta sin cerrar la sesión del navegador se usó un script local que pide la sesión de una cuenta de
prueba y llama a `/api/asistente` (las claves de prueba están en `apps/web/tema/cuentas.mjs`).

**Sesión ligada.** «Sacar los candados de líder que ya no aplican» (`local_7c66890d-6529-4e46-b3ba-866cadb23320`) corre aparte: revisa
`aprobar_devolucion`, anular un comprobante y el descuento sobre el tope, y el texto «Lo hace un líder» de la guía de Caja. Cuando el
sistema deje de exigir líder para una devolución, reescribir y aprobar la regla `devolucion-aprueba` de `lib/asistente/reglas-de-tienda.ts`.
