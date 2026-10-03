## 🧭 Accesos del Inicio por función del rol y terminal (2026-09-29) — solo web, sin migración; rama `claude/accesos-rol-terminal-3e62ba`

- [x] Lista de accesos por función, leída de los módulos del rol (`lib/inicio-avisos.ts`, `accesosRapidos`): líder, mostrador,
  trastienda (no vende, en tienda), almacén y taller. «Nuevo producto» (`/productos/nuevo`) pide ver Productos + `editarCatalogo`.
  Icono en `app/(app)/page.tsx`. 12 pruebas de accesos en `inicio-avisos.test.ts`; `tsc` y `eslint` en verde.
  **Sin verlo en el navegador:** falta una sesión iniciada por Felipe (un colaborador y la terminal de almacén).
- [ ] **Decidir (Felipe):** elegir los accesos por rol en Roles y accesos. Hoy las listas viven en el código; una columna
  `accesos_inicio` en `retail.roles` (como `pantalla_principal`, ADR-0247) dejaría al líder cambiarlas sin pedir código. Toca la
  RPC que guarda el rol → migración en producción, con su ok puntual. Solo hace falta si un rol no encaja en las cinco listas.
- [x] **Inicio «pobre» por rol (Felipe, 2026-09-29):** maqueta hecha en `docs/maquetas/inicio-bloques-por-rol-2026-09/` (4 roles, celular
  y computadora, estados vacío y de falla; cifras inventadas). Verificada en el navegador integrado.
- [x] **Decidido por Felipe (2026-09-29):** «Las 3 tiendas» solo la líder; «Nuevo producto» en lugar de Apartados para la líder; botón
  fijo «Recibir mercadería» para la terminal de almacén (los dos últimos, hechos); meta individual simple para el integrante.
- [ ] **Antes de construir la meta individual:** corregir `fn_ventas_del_dia` (a una colaboradora le devuelve todas las ventas de su
  tienda, verificado en producción), y decidir quién la fija y si es diaria o mensual; reabre D-64, D-125 y D-68. Detalle en el README de la maqueta.
- [ ] (histórico) las 5 preguntas del README de esa carpeta. Cuidado: «Tu semana» de la colaboradora y
  «Las 3 tiendas hoy» se solapan con el módulo Rendimiento (ADR-0219, otra sesión): una sola definición de esas cifras.
- [ ] El tope de 4 accesos (ADR-0225 D5) obliga a sacar uno para meter otro.

## 🎯 Meta por persona en Rendimiento e Inicio (2026-09-29) — solo maqueta, sin migración; misma rama

- [x] **Spike interactivo hecho:** `docs/maquetas/rendimiento-meta-2026-09/` (líder de sede, Admin, integrante; datos de prueba y sin datos;
  9:30 a. m. y 5:40 p. m.; Hoy · Semana · Mes; cambiar una meta con motivo e historial). Verificado en el navegador integrado.
- [x] **Las 8 decisiones de Felipe (2026-09-29):** meta de la sede primero; fórmula con productos y ventas para la fase 2 (solo sugiere la
  meta de la sede); reparto por horas programadas (turnos de Dynamic); mensual; editan la líder de la sede y el Admin; con IGV, sin
  anuladas, devoluciones no restan, apartado el día de la entrega; la integrante ve solo lo suyo y no se usa para pagar ni evaluar;
  Rendimiento abre en «Hoy».
- [ ] **Antes de construir:** (1) función nueva con las ventas de hoy de quien mira, porque `fn_ventas_del_dia` devuelve toda la tienda
  a una colaboradora; (2) cargar la meta de la sede (ninguna tienda la tiene en producción); (3) leer los turnos de Dynamic por una función
  de retail; (4) reabrir D-64, D-125 y D-68 en el acta y el ADR; (5) tablas para metas ajustadas e historial con candado en la base.
- [x] **Decidido por Felipe (D-159):** la marca de «ritmo esperado» y las palabras «Adelante / En ritmo / Por debajo» en «Cómo va hoy» se quedan; construido en el paso 3.

- [x] **Decidido por Felipe (2026-09-29, plan de implementación):** la meta que ve la integrante **se ve por defecto** (encendida), sin módulo «Mi meta» ni
  interruptor. Se descartó el módulo por rol que proponía Claude. El riesgo que eso deja (metas sin revisar en la primera semana) se cubre en el rollout: cargar
  y revisar las metas de TRU con las encargadas ANTES de desplegar el Inicio de la integrante (paso 4).
- [x] **Verificado en producción (2026-09-29):** las encargadas de TRU se cargaron como **Líder de equipo con Tienda TRU asignada** (4 personas, 0 Admin);
  no existe un rol «Encargada de tienda». Con eso ya verían Rendimiento de su tienda, pero heredan todo lo del líder. Decidir si conviene un rol propio.
- [ ] Pendientes de respuesta: permiso para cambiar metas (recomendado: el módulo `rendimiento`), qué hacer sin horario vigente (partes iguales entre quienes
  marcaron asistencia) y la marca de «ritmo esperado».

## ✅ Paso 3 del plan: Rendimiento web (2026-09-29) — commit `0d866e93` y el ritmo esperado; **espera las funciones en producción**

- [x] **Panel de la tienda** (`components/rendimiento/PanelRendimiento.tsx`, cliente): período Hoy · Semana · Mes (estado local + `history.replaceState`: no navega, no vuelve a pedir la
  pantalla y no mueve el scroll, como pidió Felipe); 4 cifras con meta y «a hoy tocaba»; «Cómo va» por persona (vendió, meta «por horas / partes iguales / Ajustada», avance con barra, turno de
  hoy) con orden por columna; pie «Asignado a las N: X de Y de la sede · cuadra / faltan / se pasa»; gráfico «Ventas contra la meta» (`GraficoVentasMeta.tsx`: altura fija 200/176 px, ancho medido, Semana |
  Mes, acumulado o por día, tooltip, tabla); historial «Cambios de meta»; rankings del mes al final (servidor). El Admin abre en «Todas» (una tarjeta por tienda) y elige tienda con `?sede=`.
- [x] **Ritmo esperado (D-159)** en «Cómo va hoy»: marca de cuánto del turno ya pasó y «Adelante / En ritmo / Por debajo» (10 puntos de margen); se calcula en el navegador (la hora de Lima) para no
  desincronizar servidor y cliente.
- [x] **Modal «Meta de…»** (`EditarMetaModal.tsx`): cambia la meta DEL MES con motivo obligatorio, «Volver a la meta automática», valida antes de enviar lo mismo que la base, manda `p_meta_esperada`; firma con
  el responsable (`ComboResponsable`; el Admin firma solo). Aplica la **Guía de foco** (ADR-0284: la meta, el motivo y quién lo hace). Probado de punta a punta en el navegador local con la sesión de Felipe.
- [x] **Lecturas nuevas en la base** (en la migración `20260930050200`, todavía sin pegar): `fn_metas_equipo` suma lo vendido por persona (hoy, 7 días, mes); `fn_rendimiento_serie` trae la meta de la sede
  por día y lo ya asignado; `fn_metas_historial` lee el historial. Pruebas nuevas en `pnpm pruebas:metas-persona` (70 comprobaciones).
- [x] **Si la base todavía no tiene el panel**, la pantalla sigue con los rankings de siempre y dice que las metas no se pudieron leer (no se cae). La suite de la web (`pnpm --filter web test`) en verde.
- [ ] **A 375 px:** revisado con datos de ejemplo (sin desbordes, gráfico de 176 px); falta verlo con datos reales de TRU.

## ✅ Paso 4 del plan: el Inicio de la integrante (2026-09-29) — commit `65fbd364`; **espera las funciones en producción**

- [x] Una integrante de tienda con meta ve **«Tu meta de hoy»** y **«Tu mes»** (con «a hoy tocaba») + Caja, y **«Tus ventas contra tu meta»** (Semana | Mes) solo con lo suyo, con la nota «la meta es para
  acompañarte». Lee `fn_mi_meta` y `fn_mis_ventas_por_dia` (`lib/inicio.ts` → `getMiMeta`; reglas puras en `lib/mi-meta-reglas.ts`, 10 pruebas). **Sin meta, o si la base no tiene las funciones, el
  Inicio queda como estaba** (nunca «0 %»). La líder no lo ve: tiene Rendimiento.
- [ ] **Condición de despliegue (D-150):** cargar la meta de TRU en Configuración ▸ Tiendas y caja y revisarla con las encargadas ANTES de que las integrantes vean esto; avisarles también que «Tus ventas» baja al total de lo suyo.
- [ ] **Sin verlo con una cuenta de integrante real** (solo con datos de ejemplo): falta una sesión de una integrante de TRU.

## 🔴 Paso 5 del plan: producción y datos (2026-09-29) — **PENDIENTE DE FELIPE: pegar el SQL**

- [x] **Verificado contra producción con una lectura (2026-09-29):** solo llegó la PARTE 1 (tabla `metas_persona_ajustes` y su disparador, 0 filas). Las 11 funciones **no existen**: el paquete de pegado incluía un
  archivo «deshacer» numerado junto a los demás, se pegó, y quitó las funciones (dejó la tabla, como estaba diseñado). No se perdió nada: ninguna pantalla las usaba. **Lección:** un archivo que deshace no va nunca en
  la misma carpeta ni con la misma numeración que el que aplica; el «cómo se revierte» vive en el encabezado de la migración.
- [ ] **PEGAR en el SQL Editor de producción, una sola vez y todo junto:** `supabase/migrations/20260930040100_mis_ventas_del_dia.sql` completo, y `supabase/migrations/20260930050200_metas_por_persona.sql` **desde el
  encabezado «PARTE 2 de 4» hasta el final** (la parte 1 ya está aplicada; volverla a pegar es inofensivo pero innecesario). Solo `create or replace function` de nombres nuevos: no toca tablas, políticas ni funciones existentes.
  Después pegar `scripts/migraciones/verificar-meta-por-persona-produccion.sql` (solo lee): la última fila debe decir 0.
- [ ] Refrescar el diccionario tras pegar (`pnpm datos:refrescar`, ver `docs/datos/generado/COMO-REFRESCAR.md`): hoy `DRIFT.md` avisa, con razón, de las 6 llamadas que esperan estas funciones.
- [ ] **NO fusionar el PR a `main` antes de pegar** (Vercel publica al fusionar): sin las funciones, «Tus ventas» del Inicio de una integrante dice «No se pudieron cargar las ventas de hoy» y Rendimiento cae a los rankings.
- [x] Diccionario de datos refrescado con la foto del 2026-09-29 22:36 UTC (143 tablas): `metas_persona_ajustes` → Colibrí; `acciones_sin_responsable` (de otra sesión, sin dueño) → Ganso.
- [ ] La carrera REAL de dos conexiones sigue sin probarse (exige una base desechable, `BASE_DESECHABLE=1`).

## ✅ Paso 1 del plan: «Mis ventas de hoy» (2026-09-29) — migración `20260930040100` **la función NO está en producción todavía** (falta pegarla); rama `claude/accesos-rol-terminal-3e62ba`

- [x] `retail.fn_mis_ventas_del_dia(p_ubicacion_id default null)`: las ventas de hoy cuya asesora (`asesora_id`) es quien pregunta, completadas y no de prueba
  (la misma definición de Rendimiento, ADR-0219). Nunca las de otra persona, tampoco para un líder; una terminal recibe 0 filas. **No cambia `fn_ventas_del_dia`**
  (Caja, Vender y Comprobantes necesitan el día de la tienda). Aplicada solo en el Postgres local.
- [x] `lib/inicio.ts` y `fuenteVentasDeHoy` (`lib/inicio-reglas.ts`): la líder lee el día de la sede; una integrante, solo lo suyo. Tipos en `packages/database`.
- [x] Prueba `pnpm pruebas:mis-ventas` (7 casos, con ROLLBACK), agregada al CI; 2 pruebas nuevas de la regla en `inicio-reglas.test.ts`. `tsc`, `eslint` y las
  verificaciones de migraciones en verde.
- [ ] **Para producción (pide el ok puntual de Felipe):** pegar la migración (solo agrega una función, sin partes ni candados) **ANTES** de publicar la web; si la web
  sale primero, el Inicio de una integrante dice «No se pudieron cargar las ventas de hoy» en vez de mostrar el número de otra. Después: `pnpm datos:generar:produccion`.
- [ ] **Sin verlo en el navegador:** falta una sesión iniciada por Felipe con una cuenta de integrante de TRU.
- [ ] Efecto visible a avisar: la integrante verá que su «Tus ventas» baja del total de la tienda a lo suyo. Es la cifra correcta; conviene decírselo antes.

## ✅ Paso 0 del plan: los papeles (2026-09-29) — solo documentos

- [x] **ADR-0318** (`docs/adr/0318-meta-por-persona-en-rendimiento-e-inicio.md`) y el acta **D-142 a D-160** (`docs/datos/DECISIONES-2026-09-29-meta-por-persona.md`), con las 8 preguntas, lo
  que se midió y lo que sigue abierto. Números verificados libres en `main`, ramas remotas, PR abiertos, worktrees y `SESIONES-ACTIVAS`.
- [x] Notas fechadas (sin borrar lo anterior) en D-64, D-68, D-113 y D-125, en ADR-0219 y en ADR-0225 (accesos por función del rol). Enlaces revisados, la suite de la web en verde.
- [ ] **Abierto para Felipe (detalle en el acta, «Abierto»):** permiso para cambiar metas (propuesta: módulo `rendimiento`); qué hacer sin horario vigente (partes iguales entre quienes marcaron
  asistencia); «ritmo esperado»; rol propio para las encargadas; tope y meses pasados; cuándo cargar las metas de TRU; aviso a las integrantes.
- [ ] **Siguiente: paso 2** (metas en la base). Antes, leer la forma real de `horarios_asignados.horario_por_dia`.

## ✅ Paso 2 del plan: las metas en la base (2026-09-29) — migración `20260930050200`: **la tabla SÍ está en producción (parte 1); las funciones NO (faltan las partes 2 a 4)**

- [x] **Decididas por Felipe (2026-09-29):** permiso = módulo `rendimiento` (D-157); sin horario, partes iguales (D-158); «ritmo esperado» se queda (D-159); no se toca ningún rol y las encargadas
  siguen como Líder de equipo (D-160). Acta y ADR actualizados.
- [x] **`20260930050200_metas_por_persona.sql`** (4 partes, re-ejecutable): tabla `retail.metas_persona_ajustes` (solo se agrega, RLS sin políticas); internas `fn_horas_programadas` (única puerta a
  `horarios_asignados`/`turnos` de Dynamic), `fn_asistencia_por_dia`, `fn_reparto_meta` (las partes suman EXACTO la meta de la sede), `fn_metas_por_dia`; lecturas `fn_metas_equipo`, `fn_mi_meta`,
  `fn_mis_ventas_por_dia`, `fn_rendimiento_serie`; y `fijar_meta_persona` (una transacción, candado por persona-tienda-mes, motivo, historial, actividad). No toca `roles`, `rol_modulos` ni `modulos`.
- [x] **Prueba `pnpm pruebas:metas-persona`** (~55 comprobaciones, con ROLLBACK, en el CI) y tipos en `packages/database`; `tsc`, la suite de la web y las verificaciones de migraciones en verde;
  la migración se aplica dos veces sin error. Filas nuevas en `docs/ARQUITECTURA.md`.
- [ ] **Para producción (pide el ok puntual de Felipe):** pegar `20260930040100` y `20260930050200` (solo agregan una tabla y funciones; la PARTE 1 toma un candado breve sobre `ubicaciones` y `personas`,
  con `lock_timeout = '3s'`) **ANTES** de publicar la web; ensayo con rollback y `md5` del cuerpo; después `pnpm datos:generar:produccion`.
- [x] **`fn_rendimiento_equipo.es_encargada` no reconoce a las encargadas que son Líder (D-160): resuelto en la web sin tocar la función de producción.** El panel manda la insignia «Encargada» de `fn_metas_equipo` (que sí las reconoce) sobre la de los rankings (`armarRankings` en `lib/rendimiento.ts`).
- [ ] **Pendiente:** la carrera REAL de dos conexiones (exige commitear datos: solo en una base desechable, `BASE_DESECHABLE=1`); probada solo la segunda edición con la meta vieja.
- [ ] **Siguiente: paso 3** (Rendimiento web).
