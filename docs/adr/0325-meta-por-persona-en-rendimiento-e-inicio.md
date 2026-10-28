# ADR-0325 — Meta por persona: se reparte sola desde la de la sede, la ajusta la líder de sede y la integrante ve la suya

**Fecha:** 2026-09-29
**Estado:** **Diseño aprobado por Felipe con un spike interactivo; construidos y probados los pasos 1 a 4 (la base, el panel de Rendimiento y el Inicio de la integrante), en la rama
`claude/accesos-rol-terminal-3e62ba`.** **En producción está solo la tabla `metas_persona_ajustes` (la PARTE 1 de `20260930050200`, aplicada el 2026-09-29): las 11 funciones NO están** (`20260930040100` y las partes 2 a 4
de `20260930050200`; ver «Lo que se descubrió al aplicar en producción»). Pegarlas lo hace Felipe, y la web no debe fusionarse a `main` antes. Las decisiones que estaban abiertas se cerraron el mismo día (D-157 a D-160);
lo que sigue abierto está en el acta.
**Decide:** Felipe, 2026-09-29.
**Afecta (cuando se construya):** una migración nueva en partes (`retail.metas_persona_ajustes`, `fn_horas_programadas`,
`fn_asistencia_por_dia`, `fn_reparto_meta`, `fn_metas_por_dia`, `fn_metas_equipo`, `fn_mi_meta`, `fn_mis_ventas_por_dia`, `fn_rendimiento_serie`, `fn_metas_historial`, `fijar_meta_persona`),
`apps/web/app/(app)/rendimiento/`, `apps/web/lib/rendimiento.ts`, `apps/web/lib/rendimiento-reglas.ts`, `lib/rendimiento-meta-reglas.ts` y `lib/mi-meta-reglas.ts`
nuevos, `apps/web/components/rendimiento/*` y `components/inicio/MiMeta.tsx` nuevos, `apps/web/app/(app)/page.tsx` (Inicio), `apps/web/lib/inicio.ts`,
`packages/database/src/types.ts` y `docs/ARQUITECTURA.md`. **No toca** `movimientos`, `stock`, `ventas` ni `venta_items`.
**Acta:** [`docs/datos/DECISIONES-2026-09-29-meta-por-persona.md`](../datos/DECISIONES-2026-09-29-meta-por-persona.md) (D-142 a D-160,
con las 8 preguntas, lo que se midió antes y lo que sigue abierto). **Referencia visual:**
[`docs/maquetas/rendimiento-meta-2026-09/`](../maquetas/rendimiento-meta-2026-09/) (Rendimiento y el Inicio de la integrante, con datos de
prueba y sin datos) y [`docs/maquetas/inicio-bloques-por-rol-2026-09/`](../maquetas/inicio-bloques-por-rol-2026-09/) (los bloques del Inicio por rol).
**Relacionado:** ADR-0219 (Rendimiento; **este ADR le levanta el «metas por persona: todavía no»**), ADR-0225 (Inicio por rol),
ADR-0161 y ADR-0178 (roles por módulo, escalón Admin), ADR-0207 (Actividad), ADR-0177 (quien registra no aprueba),
ADR-0136 (modales), ADR-0149 (loader), ADR-0169 (paleta), ADR-0185 (la página no se encoge), ADR-0209 (combos), D-64, D-65, D-68.

## Contexto

Felipe pidió que cada integrante vea «algo simple» de su meta y que la líder de la sede vea todo el rendimiento de su tienda, con la
meta de cada persona ajustable. Lo que existe hoy, medido en producción el 2026-09-29:

- **Meta por persona: no existe.** Solo hay meta por sede (`ubicaciones.meta_venta_diaria`, `ubicacion_metas_dia` con campañas,
  `fn_meta_mes`, `fn_parametros_caja`) y **ninguna tienda la tiene cargada**.
- **Ventas: una sola en toda la historia.** No hay de dónde calcular «cómo se vende».
- **«Tus ventas» del Inicio era falso.** `fn_ventas_del_dia`, para quien no es líder, devuelve todas las ventas de su tienda; el Inicio las
  mostraba como de la persona. Una meta individual sobre ese número se habría llenado con lo que vendieron sus compañeras.
- **Horarios de Dynamic:** `turnos` termina el 21-sep; `horarios_asignados` tiene 21 horarios abiertos hoy (de 31 personas);
  `jornadas` (lo trabajado) está al día. Retail lee `jornadas` (`fn_asesoras_de_turno`, `fn_rendimiento_horas_nucleo`), no los horarios.
- **Rendimiento** (ADR-0219, primera mitad, ya en producción) muestra el mes y dos rankings, sin meta, sin el día y sin la semana.
- **Quién es «líder de la sede»:** Felipe cargó el 2026-09-29 a 4 encargadas de TRU como *Líder de equipo con Tienda TRU asignada*.
  No existe un rol «Encargada de tienda».

## Decisión

### 1. El modelo, en una frase

**La meta de la sede baja a cada persona según sus horas programadas; la líder de la sede o el Admin pueden ajustar la del mes de cada
una, con motivo; y el avance se mide con quién atendió cada venta (Caja).** Se fija por mes, se calcula cada día y se ve en Hoy, Semana
y Mes. La integrante ve solo lo suyo. La meta es para reconocer y acompañar: no se usa para pagar ni para evaluar (D-142).

### 2. El reparto vive en la base, en UNA sola definición

`retail.fn_reparto_meta(p_ubicacion_id uuid, p_desde date, p_hasta date) → (persona_id, fecha, meta_auto, base)`, **interna**
(sin `grant` a `authenticated`); la usan las dos lecturas de abajo.

- **Promete:** la parte AUTOMÁTICA de cada persona en cada día = meta de la sede de ese día × (sus horas programadas ÷ las de todas las
  de esa sede ese día), en múltiplos de S/ 10 por el método del mayor resto, de modo que **las partes de un día suman exactamente la
  meta de la sede de ese día**. `base` dice `'horas'` o `'iguales'`.
- **Asume:** que la sede tiene meta (misma regla de `fn_parametros_caja`, campañas incluidas). Sin meta, 0 filas: nunca inventa una.
  Sin horario vigente ese día: partes iguales entre quienes marcaron asistencia (`jornadas`); si nadie marcó, esa parte queda sin asignar.
  *(Decidido por Felipe el 2026-09-29: D-158.)*

- **DECIDÍ:** calcular el reparto en la base, con una sola función, y que la líder y la integrante lean de ella.
- **DESCARTÉ:** calcularlo en la web (TypeScript, como `rendimiento-reglas.ts`). La integrante no puede leer las horas de sus
  compañeras (D-149, «solo lo suyo»): solo una función `security definer` puede darle **su parte** sin mostrarle las de las demás. Y dos
  cálculos, uno en el servidor y otro en la base, acabarían dando dos metas distintas para la misma persona.
- **SE ROMPE SI:** alguien duplica la fórmula en una pantalla. Entonces la líder y la integrante ven metas distintas para la misma persona.

### 3. Las horas programadas: una sola puerta a Dynamic

`retail.fn_horas_programadas(p_ubicacion_id uuid, p_desde date, p_hasta date) → (persona_id, fecha, horas, fuente)`, interna.

- **Promete:** las horas que le tocaba trabajar a cada persona de esa tienda cada día, con la fuente: `'horario'` (`horarios_asignados`
  vigente ese día) o `'turno'` (una excepción de ese día en `turnos`; `es_descanso` vale 0 h).
- **Asume:** que DO mantiene vigentes los horarios (hoy, 21 abiertos de 31). **Forma leída en producción el 2026-09-29:** `horario_por_dia` es un
  objeto por día de la semana (`"0"` domingo … `"6"` sábado) con la entrada `e`, la salida `s` y los minutos de refrigerio `r`; las 21 vigentes lo traen y
  ninguna persona tiene dos vigentes. Horas del día = salida − entrada − refrigerio. Es el ÚNICO lugar donde retail toca esas tablas de Dynamic: si su
  forma cambia (Dynamic está migrando), se arregla aquí y no en cada pantalla. **«Persona de la tienda»** = `fn_ubicacion_de_partida` (la asignada; para un
  líder, la de su sede de Dynamic), el mismo criterio de `fn_rendimiento_ubicaciones`.
- **DESCARTÉ:** `turnos` como fuente principal. Termina el 2026-09-21 y no tiene filas de octubre.

### 4. Los ajustes de la líder: una tabla que solo se agrega

`retail.metas_persona_ajustes`: una fila por cambio, **sin `update` ni `delete`**, con RLS encendido y sin políticas (se lee y se escribe
solo por funciones `security definer`, como `venta_reasignaciones` de ADR-0219).

| Columna | Qué guarda |
|---|---|
| `ubicacion_id`, `persona_id`, `mes` | de quién, en qué tienda y para qué mes (`mes` es siempre el día 1) |
| `meta` | la meta del mes **o `null` = «volver a la automática»** |
| `meta_antes` | la meta efectiva justo antes de este cambio |
| `motivo`, `detalle` | del catálogo cerrado (`cambia_horario`, `capacitacion`, `cubre_otra_tienda`, `vuelve_de_descanso`, `automatica`, `otro`); `otro` exige una línea |
| `cambiado_por`, `created_at` | quién (la persona de retail que firmó) y cuándo |

La meta vigente de una persona en un mes es **la fila más reciente** de esa combinación. El ajuste es sobre la **meta del mes**; la del
día y la de la semana se recalculan en la misma proporción (`meta_ajustada ÷ meta_auto`).

`retail.fijar_meta_persona(p_persona_id, p_ubicacion_id, p_mes, p_meta, p_motivo, p_detalle default null, p_meta_esperada default null)`
— **una sola transacción**, que empieza y termina dentro de la función:

1. Firma con `retail.fn_actor_persona_id(true)` (el responsable elegido, ADR-0161); la pantalla usa `<ComboResponsable>`.
2. Toma un candado de la base por (persona, tienda, mes) para que dos personas que cambian la misma meta a la vez no se pisen.
3. Comprueba los permisos y los estados imposibles de abajo.
4. Si `p_meta_esperada` no coincide con la meta que hay ahora, se niega («la meta cambió mientras la editabas»).
5. Inserta el ajuste y deja su línea en `retail.actividad` (si anotar falla, el cambio se guarda igual: principio de ADR-0207).

**Estados que nunca deben existir, y con qué se impide:**

| Estado imposible | Lo impide |
|---|---|
| Una meta ≤ 0, o mayor que la meta de la sede del mes | `check` de la tabla y la función |
| Un cambio sin motivo, o «otro» sin su línea | `check` de la tabla |
| Un ajuste automático con valor, o uno manual sin valor | `check ((motivo = 'automatica') = (meta is null))` |
| Editar o borrar el historial | disparador que lo rechaza + `revoke` de escritura |
| Cambiar la meta de un mes ya pasado | la función, con la fecha de Lima |
| Una líder de sede cambiando **su propia** meta (solo un Admin) | la función: `p_persona_id = actor` y no Admin |
| Cambiar la meta de otra tienda | la función, con `fn_rendimiento_ubicaciones()` |
| Una persona que no es de esa tienda | la función |
| Dos cambios simultáneos que se pisan | candado + `p_meta_esperada` |

### 5. Las lecturas

Todas `security definer`, `revoke … from public, anon`, `grant execute … to authenticated`.

- **`fn_metas_equipo(p_mes date default null)`** — para la líder y el Admin: **una fila por persona de las tiendas que
  `fn_rendimiento_ubicaciones()` le deja ver**, aunque no tenga ventas (`fn_rendimiento_equipo` solo trae a quien vendió): horas del mes,
  meta automática, ajuste, meta del mes, meta de hoy y de los 7 días, y la base del reparto.
- **`fn_mi_meta()`** (sin parámetros: mi tienda es la que me toca) — **solo la mía**: mi meta de cada día del mes y la del mes. Nunca horas ni metas ajenas.
  Una terminal recibe 0 filas. Sin meta de la sede o sin horario, 0 filas: **el bloque no se dibuja** (D-150).
- **`fn_mis_ventas_del_dia`** — *hecha* (paso 1): lo que atendió quien mira, completado y no de prueba. **`fn_ventas_del_dia` no cambia.**
- **`fn_mis_ventas_por_dia(p_desde, p_hasta)`** y **`fn_rendimiento_serie(p_ubicacion_id, p_desde, p_hasta)`** — las ventas por día de una
  persona y de una sede, para el gráfico. Índice existente: `ventas_ubicacion_fecha_idx`.

**Qué cuenta como venta** (D-148): con IGV, completada y no de prueba; las devoluciones y los cambios no restan; el apartado cuenta el día
que se entrega, a quien lo apartó. Es la definición de ADR-0219 punto 2, para que la integrante y la encargada vean el mismo número.

### 6. Permisos

**Se reutiliza el módulo `rendimiento`** (decidido por Felipe el 2026-09-29: D-157): quien lo ve cambia las metas de su tienda y el Admin las de todas,
sin poder cambiar la propia. **No hay módulo nuevo**: la regla de ADR-0161 («quien ve un módulo hace todo lo que hay en él») se cumple sin
tocar `rol_modulos`. **Ningún paso de esta construcción toca `roles`, `rol_modulos` ni `modulos`** (D-160): las encargadas de TRU siguen siendo «Líder de equipo» con
Tienda TRU asignada y ven Rendimiento por eso (`fn_rendimiento_ubicaciones`); la base impide que cambien la propia. La integrante no necesita ningún módulo para ver su meta: son sus propios datos, en su Inicio (D-150).

### 7. La web

- **Rendimiento** (`/rendimiento`): selector Hoy · Semana · Mes (abre en Hoy, en la URL); cifras con meta y avance; «Cómo va hoy» por persona
  con la meta editable; «Ventas contra la meta» con pestañas Semana | Mes (Acumulado | Por día); «Cambios de meta»; rankings al final. Sin meta de
  la sede, la pantalla lo dice y lleva a Configuración › Metas.
- **Gráfico:** **altura fija** (200 px en computadora, 176 en celular) y dibujado con el ancho medido de su caja: en una pantalla grande no
  crece y las barras siguen delgadas. Trazo de 2 px, marcas de 8 px, leyenda siempre, una etiqueta directa selectiva, tooltip y «Ver como tabla».
  La serie de referencia va punteada y en taupe. Tokens de `globals.css` (ADR-0169).
- **No salta:** cambiar de período o de pestaña navega con `scroll: false` y conserva el foco (ADR-0185); reservar el alto del gráfico evita que la
  página se acorte mientras se dibuja.
- **La ventana «Meta»:** `<Modal variante="hoja">` (ADR-0136), motivo con `CampoSelect` (ADR-0209), `<ComboResponsable>` (ADR-0161).
- **Inicio de la integrante:** «Tu meta de hoy», «Tu mes» y «Tus ventas contra tu meta» (Semana | Mes), solo si `fn_mi_meta` devuelve algo.
  Reglas de presentación en `lib/metas-reglas.ts` (con pruebas): ritmo esperado, «asignado X de Y», orden.
- **Inicio, ya construido** (D-152 a D-154): los accesos salen de lo que hace el rol; «Nuevo producto» exige Productos + catálogo; la líder lo tiene
  en lugar de «Apartados»; la terminal de almacén lleva «Recibir mercadería» fijo. Ver la actualización en ADR-0225.

### 8. Todo puede fallar

| Si… | Pasa esto |
|---|---|
| Dynamic no responde o no se pueden leer los horarios | Rendimiento sigue mostrando ventas y dice «No se pudieron leer los horarios: la meta de cada persona no se puede calcular»; el Inicio de la integrante oculta el bloque de meta |
| La sede no tiene meta | «Sin meta»; nada se reparte y nada se inventa |
| Una persona no tiene horario vigente | Partes iguales entre quienes marcaron asistencia ese día (propuesta) |
| La web se publica antes que la migración | Las lecturas de meta no existen: el bloque se oculta o dice «No se pudo leer»; **nunca** cae a mostrar el número de otra persona |
| Fijar una meta falla a medias | No puede: es una sola transacción |

### 9. Números (para no optimizar por superstición)

Hasta ~30 personas por tienda (12 hoy en TRU) × 31 días = **unas 930 filas** por lectura del reparto: se calcula al leer, sin caché ni tabla
de resultados. Los ajustes son pocos por persona por mes: **menos de 1.000 filas al año** en las tres tiendas. Las ventas por día usan
`ventas_ubicacion_fecha_idx` (un mes de una tienda son cientos de filas).

- **DESCARTÉ:** guardar la meta calculada de cada mes en una tabla. Se quedaría vieja al cambiar un horario a mitad de mes y habría dos
  verdades. **SE ROMPE SI** el reparto tarda más de lo que una pantalla tolera; con las cifras de arriba no es plausible.

## Orden de construcción y despliegue

| # | Paso | Cómo se verifica | Estado |
|---|---|---|---|
| 0 | Estos papeles (ADR + acta + notas en D-64, D-68, D-113, D-125, ADR-0219 y ADR-0225) | Están escritos antes que el código | **Hecho** |
| 1 | `fn_mis_ventas_del_dia` + `lib/inicio.ts` | `pnpm pruebas:mis-ventas` (7 casos, en el CI); con dos cuentas de la misma tienda cada una ve solo lo suyo | **Hecho y probado en local; la función NO está en producción** |
| 2 | La migración de metas (`20260930050200`, 4 partes, con `retail.` y `set lock_timeout`) | `pnpm pruebas:metas-persona` (70 comprobaciones, en el CI): las partes suman exacto la meta de la sede (con una meta de 1.800 y con una de 1.845); un descanso, un turno y el «sin horarios» se comportan como dicen; cada estado imposible se rechaza; la segunda edición con la meta vieja se rechaza; nadie cambia la suya; la integrante no lee la de otra; una terminal no lee nada; la migración se aplica dos veces sin error | **Hecho y probado en local; en producción está la tabla (parte 1), NO las funciones (partes 2 a 4)** |
| 3 | Rendimiento web | Comparar captura y spike al mismo ancho, y a 375 px | **Hecho** (commit `0d866e93` y el ritmo esperado): probado en el navegador local, con la sesión de Felipe (guardar, volver a la automática, tope) y con datos de ejemplo a 1280 y a 375 px |
| 4 | Inicio de la integrante | Con una cuenta de prueba de TRU | **Hecho** (commit `65fbd364`): visto con datos de ejemplo; falta una sesión de una integrante real |
| 5 | Producción y datos | Cargar las metas de TRU; ensayo revertible y `md5` del cuerpo; luego `pnpm datos:generar:produccion` y `pnpm datos:comparar` | **A medias:** diccionario refrescado (foto del 2026-09-29); **falta pegar las funciones** y cargar las metas de TRU |

**Reglas de producción** (CLAUDE.md): ensayo con rollback y el ok puntual de Felipe antes de pegar; las migraciones **antes** que la web; la
migración del paso 2 crea tablas y funciones nuevas y **no altera tablas en uso**; si lleva políticas, van solas y al final (deadlocks del SQL
Editor). **Condición de despliegue (D-150):** cargar y revisar las metas de TRU con las encargadas **antes** de publicar el paso 4.

## Lo que se descubrió al construir el paso 2

- **`fn_rendimiento_equipo` (ya en producción) no reconoce como «encargada» a una encargada que es Líder de equipo.** Marca `es_encargada` solo si el rol
  trae el módulo `rendimiento` en `rol_modulos`, y el rol Líder no tiene filas ahí (ve todo por ser líder). Como las 4 encargadas de TRU son Líder (D-160),
  el chip «Encargada» no les saldría en los rankings. `fn_metas_equipo` ya usa la regla correcta (líder con esa tienda, o rol con el módulo). **Se resolvió en la web y
  no en la función de producción** (paso 3): `armarRankings` (`lib/rendimiento.ts`) pone la insignia de `fn_metas_equipo` sobre la de los rankings. Así no se toca en producción
  una función que funciona, y la de la base queda con su límite documentado aquí.
- **El Postgres local compartido no tenía la migración de Rendimiento del 2026-09-29** (`20260929160000`, ya en `main` y en producción), y sin ella
  `fn_rendimiento_ubicaciones` no existe. Se aplicó al local para probar; el CI reconstruye la base desde cero, así que no le afecta.
- **La carrera real de dos conexiones no se probó.** Se probó de forma secuencial que la segunda edición con la meta vieja se rechaza. Que el candado ponga en
  fila a dos personas que editan a la vez es una garantía de Postgres, pero verlo exige commitear datos (el historial no se puede borrar) y eso solo se hace en
  una base desechable (`BASE_DESECHABLE=1`, como `bajada_al_piso_concurrencia.mjs`). Queda pendiente.
- **Solo en el local:** dos Admin cuya sede base de Dynamic es Lima cuentan como personas de Lima (`fn_ubicacion_de_partida`), por eso el Admin ve 6 filas y no 4.
  En producción los Admin están en Central y no son de ninguna tienda.

## Lo que se descubrió al aplicar en producción (paso 5, 2026-09-29)

- **Solo llegó la parte 1.** Una lectura de producción (`pg_proc`, `pg_trigger`) mostró la tabla y su disparador con 0 filas, y **ninguna** de las 11 funciones. El paquete de pegado que se
  entregó tenía, numerado junto a los que aplican, un archivo «deshacer» (`drop function …`): se pegó en la misma tanda y quitó las funciones (dejó la tabla, como estaba pensado: el historial no
  se borra). No se perdió nada, porque ninguna pantalla las usaba. **Diseño corregido:** el «cómo se revierte» vive en el encabezado de la migración y en este ADR; **nunca hay un archivo que
  deshace en la misma carpeta ni con la misma numeración que el que aplica.**
- **Esta sesión no puede escribir en producción** (el clasificador bloqueó aplicar el SQL por la herramienta de Supabase): lo pega Felipe. Se dejó todo listo: el SQL exacto está en los dos archivos de
  migración (`20260930040100` completo y `20260930050200` desde «PARTE 2 de 4»), y la verificación de solo lectura en `scripts/migraciones/verificar-meta-por-persona-produccion.sql` (compara el `md5`
  del cuerpo de cada función contra el probado en local, y los permisos: la última fila debe decir 0).
- **Orden:** las funciones **antes** de fusionar la web (Vercel publica al fusionar). Si la web saliera primero, no se rompe nada: el Inicio de una integrante dice «No se pudieron cargar las ventas de hoy»
  y Rendimiento muestra solo los rankings y avisa que las metas no se pudieron leer.

## Fuera de alcance

- **Sugerir la meta de la sede desde el historial** (D-144): fase 2, con 4 semanas de ventas.
- **Bono, comisión o evaluación con la meta** (D-142, D-65): no. Si algún día se quiere, antes va un abogado laboralista.
- **Ranking o comparación entre integrantes, visible para ellas** (D-66 en pausa), **la ficha por persona** y **«corregir quién atendió»**
  (ADR-0219, segunda mitad): siguen pendientes. Corregir una venta de persona mueve las cifras de las dos; los ajustes de meta no cambian.
- **Taller** (ADR-0219, respuesta 19) y **Lima**, que no tiene personal cargado en Dynamic (D-62).
- **El estado de «no hay meta» por tienda como interruptor** (descartado en D-150).

## Objeciones registradas

- **Encendida por defecto quita el colchón** de que las metas se revisen antes de mostrarse (D-150). Felipe lo decidió; se cubre con el orden
  del despliegue, no con un interruptor.
- **«Ritmo esperado»** («Adelante», «En ritmo», «Por debajo») lo agregó Claude al spike. Ayuda a leer el día pero puede sentirse como un
  juicio; **Felipe decidió que se queda** (D-159).
- **Las encargadas son «Líder de equipo»** y heredan todo lo del líder. Un rol propio les daría solo lo que necesitan; **Felipe decidió no crearlo y no tocar roles** (D-160).

## Cómo se verifica

1. **Base:** una prueba SQL por función en `scripts/pruebas/` (con rollback, sesión simulada, y en el CI): reparto exacto, cada estado imposible
   de la tabla de arriba, concurrencia sobre la misma meta, alcance por rol (Admin, líder de sede, integrante, terminal) y `pnpm pruebas:roles`.
2. **Web:** pruebas de las reglas puras; en el navegador, los tres roles, con datos y sin datos, a 1440 y a 375 px; y que cambiar de período
   no mueva la posición de la pantalla.
3. **Producción:** solo lectura después de cada migración (existencia, `md5` del cuerpo, permisos), y refrescar el diccionario.


## Actualización 2026-10-03 (Felipe, con spike): propuesta final de la pantalla — etapa 1

Felipe comparó cuatro vistas de Rendimiento y cuatro del Inicio (`docs/maquetas/rendimiento-vistas-2026-10/`) y eligió. **Rendimiento:** pestañas por
tienda (variante A) con tres medidas nuevas. **Inicio de la integrante:** el anillo del día + «Lo que va bien»; los accesos con «Nuevo producto» en el
lugar de «Apartados».

DECIDÍ: construir en dos etapas, la primera sin SQL nuevo.
DESCARTÉ: construir las tres medidas de una vez, porque «ventas por hora» (`ventas.created_at` existe pero ninguna función la devuelve por hora) y «prendas por
venta» de la tienda (`fn_rendimiento_equipo` no trae prendas) piden una lectura nueva, y eso alarga el SQL que ya está pendiente de pegar en producción.
SE ROMPE SI: la proyección del mes se lee como una promesa. Por eso dice «cerca de», no proyecta con menos de 3 días cerrados con ventas y no cuenta los días sin parte de la meta.

**Etapa 1 (hecha, sin SQL nuevo):**
- Rendimiento: la pantalla abre en la **tienda de la sesión** (antes, «Todas»). Arriba, `ComparativoTiendas`: una tarjeta por tienda con su avance **del mes** contra su
  meta (marca «a hoy tocaba», palabras de D-159) que a la vez es la pestaña (`?sede=`). Se compara el mes y no el período del panel porque el período (Hoy · Semana · Mes) es estado
  del panel de la tienda elegida. Quien lleva una sola tienda no ve pestañas. **Proyección del mes** en el panel (`proyectarMes`, pura y probada).
  Se desvía del spike en un punto: el spike pedía solo la tienda mirada para cargar menos; con 3 tiendas son 3 lecturas chicas, así que se siguen leyendo todas.
- Inicio de la integrante: `SeccionMiMeta` es ahora el **anillo del día**; `SeccionLoQueVaBien` (mejor día del mes, racha, ticket contra el mes pasado) y `SeccionTuMes`
  (con lo que falta dicho en días de SU promedio). `reconocer` (`lib/mi-meta-reglas.ts`, pura y probada) **calla** lo que no tiene base: sin muestra (menos de 5 ventas en
  alguno de los dos meses), si el ticket bajó, sin racha de 2 días o más. Sale el gráfico «Tus ventas contra tu meta» del Inicio (el de Rendimiento se queda). La lectura pide ahora
  también el mes pasado (`rangoDeMiLectura`).
- Accesos: en la lista del mostrador, «Nuevo producto» (quien puede dar de alta productos) retira a «Apartados»; sin ese permiso queda «Apartados». «Apartados» sigue en el menú de
  Ventas y en el aviso «Apartados que vencen» de «Te toca».

**Etapa 2 (hecha en código el mismo día, a pedido de Felipe: las tres medidas van en la interfaz):** «ventas por hora» y «prendas por venta» en el panel de Rendimiento, con **una lectura nueva
de solo lectura**, `retail.fn_rendimiento_detalle(p_ubicacion_id, p_desde, p_hasta)` (`20261003180000`): por día y hora de LIMA, lo que vendió la TIENDA —ventas, soles con IGV y prendas—, con la misma
definición de «venta que cuenta» que `fn_rendimiento_serie` (completada y no de prueba) y el mismo alcance (`fn_rendimiento_ubicaciones()`; otra tienda, 42501). Es de la tienda y no de una persona: sirve para
repartir turnos, no para juzgar. Prueba: `pnpm pruebas:rendimiento-detalle` (6 casos, en el CI). Las reglas de la web (`ventasDeLaTiendaPorHora`, `prendasPorVenta`) son puras y probadas.
**La función NO está en producción: la pega Felipe** (un solo `create or replace function`, sin partes ni candados). Si la web sale antes, el panel sigue y dice «No se pudieron leer las ventas por hora ahora»;
nunca dibuja 0. **Sigue abierta** la marca de ritmo del anillo del Inicio («dónde solías ir a esta hora»): ahora que hay ventas por hora de la TIENDA, se podría sacar la curva típica del día, pero es otra decisión
(cuántos días de historia, qué hacer con una tienda nueva) y no se inventó.

## Actualización 2026-10-03 (b): auditoría de Rendimiento — correcciones

Auditoría local de `/rendimiento` (cuello: ninguno de velocidad; con ~54.000 ventas la lectura más pesada tarda 19 ms; el problema era de corrección). Tres correcciones, cada una en su commit:
1. **Historial de metas falso (mío).** `leerPantallaRendimiento` pedía el historial solo de la tienda de la URL; al abrir sin `?sede=` el Admin veía «Todavía nadie cambió una meta». Ahora las tres lecturas de cada
   tienda (serie, historial, ventas por hora) salen de `lib/rendimiento-lectura.ts` y se piden siempre; si una falla, la causa (código y mensaje de la base, ningún dato personal) queda en el log
   y la pantalla sigue diciendo «no se pudo leer», nunca «sin datos». Probado en `rendimiento-lectura.test.ts`.
2. **Pestañas instantáneas.** Cambiar de tienda era un enlace a `?sede=`: para la espera global una navegación es una «carga» (loader a pantalla completa y dos rondas de lecturas) para mostrar datos que ya
   estaban en memoria. Ahora es estado del navegador (`TiendasRendimiento`), igual que Hoy · Semana · Mes, y conserva la vista elegida.
3. **Ranking de «soles por hora»: opción C, decidida por Felipe el 2026-10-03.** Ver el apartado siguiente.

### El centro de la contracción (hallazgo de la auditoría, 2026-10-03) — decide Felipe

`contraerSolesPorHora` (`rendimiento-reglas.ts`, de `main`) encoge cada número hacia el promedio del RESTO de la tienda (ADR-0219, act. 2026-09-29). Medido con las reglas reales:
- **Invierte el orden con la misma exposición.** Dos personas con 100 h y 30 ventas cada una, crudo 15 y 9 por hora, salen con 11,57 y 12,43: la de 9 queda primera. Con dos personas la diferencia entre ambas es
  `(2w − 1) · (crudoᵢ − crudoⱼ)`, así que el orden se invierte cuando el peso `w` de la persona es menor que 0,5; con las mismas ventas por persona eso es **exactamente cuando cada una tiene menos de 40 ventas** (la
  «muestra chica»). En un barrido de 28 combinaciones de horas y ventas: invertido en 16 con 2 personas, 12 con 3 y 8 con 5. AQP (2 personas, menos de 40 ventas) está en esa zona.
- **El número mostrado puede alejarse de la persona.** Con A = 8 h a S/50 por hora y B = 160 h a S/18, hoy sale A 20,94 y B **28,58**: el «resto» de B es solo A y su racha de suerte, y B termina «corregida» muy por encima de lo que vende.
- **Pero cambiar el centro al promedio de TODA la tienda no es gratis:** conserva el orden con la misma exposición (13,29 y 10,71) y deja a B en 18,50, pero **A pasa al frente** (22,32 contra 18,50), y la prueba
  `rendimiento-reglas.test.ts:31` escribe lo contrario como expectativa de negocio («el mes sostenido termina adelante del mes corto con un golpe de suerte»).

Las dos metas —(1) con la misma exposición no se invierte, (2) la veterana queda adelante de la nueva afortunada— no las cumple ningún centro simple. Felipe eligió la **opción C** (2026-10-03):

**DECIDÍ:** (a) el centro de la contracción pasa a ser el promedio de TODA la tienda (con la persona adentro) y (b) el ranking se ORDENA por una **cota prudente** —el número contraído menos `Z = 2`
errores estándar, «lo que podemos asegurar»— mientras que el número que se MUESTRA sigue siendo el contraído. Error estándar relativo `√((1 + CV²) / N)` con `N` = ventas + 40 (las del prior) y `CV = 1` (variación del
ticket, supuesto: no se conoce por persona). Código: `cotaPrudente`, `Z_COTA_PRUDENTE`, `CV_TICKET` en `rendimiento-reglas.ts`; la tabla de la pantalla explica el orden en su nota.
**DESCARTÉ:** (A) dejarlo como estaba, porque invierte el orden en «muestra chica»; (B) solo cambiar el centro, porque la nueva con una venta grande pasa al frente de la veterana (22,32 contra 18,50);
y calibrar la cota con una `Z` hecha a medida del caso de la prueba. **SE ROMPE SI:** el ticket varía mucho más que su promedio (CV > 1: la cota castiga de menos); o alguien cuestiona los dos errores estándar:
con `Z = 1,64` la veterana y la nueva del caso empatan, y con `Z = 2` la veterana queda adelante **por poco** (cota 13,73 contra 12,91). **Verificado** con las reglas reales (`rendimiento-reglas.test.ts`, 19 pruebas): la
propiedad «con las mismas horas y ventas, el orden del crudo se respeta» se barre en 96 combinaciones de personas, horas y ventas, y el caso que lo mostró (100 h, 30 ventas, crudo 15 y 9) sale 13,29 y 10,71.
**Límite que no se arregla acá:** `fn_rendimiento_equipo` solo devuelve a quien vendió, así que quien trabajó horas y no vendió nada no entra al promedio de la tienda (lo infla un poco).
**Efecto visible:** los números de «Vende más por hora» cambian (la veterana deja de salir «corregida» por encima de lo que vende) y el orden ya no sigue al número mostrado cuando hay poca evidencia.

## Actualización 2026-10-03 (c): el SQL ya está en producción

Felipe dio su OK puntual el 2026-10-03 y se aplicó desde la integración de Supabase: ensayo del archivo más chico dentro de una transacción deshecha (el md5 del cuerpo coincidió con el probado en local, o sea que la herramienta no
altera el texto de la función), y luego los tres archivos, uno por uno: `fn_mis_ventas_del_dia` (`20260930040100`), las partes 2 a 4 de `20260930050200` (4 funciones internas, 4 lecturas y `fijar_meta_persona`) y
`fn_rendimiento_detalle` (`20261003180000`). Antes de aplicar se comprobó en solo lectura que producción tenía las dependencias (`fn_ubicacion_de_partida`, `fn_parametros_caja`, `fn_meta_mes`, `fn_actividad_anotar` con sus 12
parámetros, `fn_terminal_actual`, `fn_es_admin`) y la tabla `metas_persona_ajustes` (0 filas, con RLS). **Verificación (`scripts/migraciones/verificar-meta-por-persona-produccion.sql`): 32 chequeos, 0 diferencias** — las 12 funciones con el
mismo md5 que en local, `anon` sin acceso, la tabla cerrada y el historial que no se edita.
**Lo que sigue abierto:** TRU tiene 11 personas con horas programadas hoy pero **ninguna meta de la tienda cargada** (el reparto da 0 filas), así que ni el panel ni el Inicio de una integrante mostrarán metas hasta que alguien la cargue en
Configuración ▸ Tiendas y caja. Falta refrescar el diccionario (`pnpm datos:generar:produccion` desde un volcado nuevo) y fusionar la web.
