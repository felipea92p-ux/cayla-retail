# ADR-0153 — El contrato de venta se amplía: asesora, quién emite, descuento con tope de líder, y una cola para lo que SUNAT no acepta

**Fecha:** 2026-09-22
**Estado:** Backend construido (esquema + RPC) y verificado contra un Postgres 17 desechable local (Docker caído) más producción en solo lectura para
los datos que necesitaba confirmar. **NO fusionado con la pantalla** — `PuntoDeVenta.tsx` sigue llamando `registrar_venta` exactamente igual que hoy;
conectar el mostrador es una tanda aparte, a propósito (ver D-88/D-89 más abajo).
**Decide:** Felipe, ronda de 60 preguntas del 2026-09-21 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, D-53 a D-91) — ejecutado por un agente
en worktree propio desde `origin/main`, tanda de agentes del 2026-09-22.
**Afecta:** `retail.ventas` (6 columnas nuevas), `retail.colaboradores` (1 columna nueva), `retail.comprobantes` (1 estado nuevo + 4 columnas de
bitácora), `retail.registrar_venta` (5 parámetros nuevos), `retail.anular_venta` (1 línea), y 4 funciones nuevas (`fn_es_lider_persona`,
`fn_asesoras_de_turno`, `fn_marcar_reintento_transmision`, `fn_comprobantes_cola_reintento`). Dos migraciones:
`20260922150000_venta_asesora_emisor_descuento_lider.sql` y `20260922151500_comprobantes_cola_de_reintento.sql`.

## Contexto

D-56, D-57, D-60, D-62, D-67, D-85, D-86 y D-87 de la ronda de 60 preguntas piden ampliar lo que una venta sabe de sí misma: quién la atendió, quién va
a emitir su comprobante, si su descuento necesitó el visto bueno de un líder, y qué pasa cuando SUNAT no responde. Es una sola pieza (no cinco) porque
las cinco tocan la misma función — `registrar_venta` — y repartirla entre varios agentes habría significado que dos reescriban la misma firma en
paralelo y se pisen (la razón explícita por la que esta tarea se asignó entera a un solo dueño).

**Regla dura de toda la pieza:** todo es aditivo, con `DEFAULT`. La llamada que hace hoy `PuntoDeVenta.tsx` (11 parámetros, sin ninguno de los nuevos)
tiene que seguir funcionando exactamente igual — verificado con una prueba automatizada que reproduce esa llamada posicional tal cual.

## Decisión 1 — D-62: la venta guarda quién la atendió, y una función sugiere quién está de turno

**DECIDÍ:** `ventas.asesora_id uuid references public.personas(id)`, nullable, y `retail.fn_asesoras_de_turno(p_ubicacion_id uuid)` — lee
`public.jornadas`/`public.marcajes` (Dynamic) uniendo por `retail.ubicaciones.sede_dynamic_id` y `retail.colaboradores.persona_id`, siempre por `uuid`.
Nunca expone la hora exacta ni el tipo de una pausa (médico/trámite/personal son datos sensibles): todo `salida_*` que no sea `salida_final` colapsa a
`'en_pausa'`. Columnas reales verificadas contra producción (`vovjyyiafkxteijimpuy`, solo lectura, 2026-09-22) — no contra
`docs/datos/14-DYNAMIC.md`, que D-62 mismo marca desactualizado.

**DESCARTÉ:**
- *Un FK de `asesora_id` a `retail.colaboradores(persona_id)`.* Se armó primero así y se descartó al revisar `20260922110000_colaboradores_
  suspender_y_actividad.sql`: «suspender» y `quitar_colaborador` **mueven o borran** esa fila de verdad (no es una tabla con historial, es «quién tiene
  la puerta abierta HOY»). Cualquier asesora que alguna vez vendió y luego se suspende habría dejado esa venta con un FK roto — y la suspensión misma
  habría fallado con «viola llave foránea», rompiendo la operación diaria más común del módulo Colaboradores. Referenciar `public.personas(id)` (el
  identificador que Dynamic nunca borra) es además el patrón que YA usan `ventas.usuario_id`/`ventas.anulado_por` — consistencia, no invención.
- *Recalcular el estado desde `marcajes` sin mirar `jornadas.estado`.* `jornadas` ya es la fuente de verdad que Dynamic mantiene; reinventar su máquina
  de estados en retail duplicaría lógica de negocio ajena y podría desalinearse el día que Dynamic cambie una regla. Se usa `marcajes` (última marca
  viva del día) como señal de "ahora mismo" y `jornadas.estado` como respaldo cuando no hay ninguna marca — nunca al revés.
- *SQL fijo contra `public.jornadas`/`public.marcajes`.* Habría hecho fallar el propio `create function` en cualquier Postgres que no sea producción:
  Postgres valida las tablas referenciadas al crear la función (`check_function_bodies`), y el Postgres LOCAL de desarrollo, sin Docker, no tiene stub
  de asistencia — a propósito, para no fingir datos reales (ADR-0033). Se usa `execute` dinámico con un `begin/exception when undefined_table or
  undefined_column` que apaga la sugerencia en vez de romper la venta.

**SE ROMPE SI:** Dynamic renombra o cambia el tipo de `jornadas.sede_id`/`jornadas.estado`/`marcajes.tipo` sin avisar — la función se apaga sola
(tabla vacía), no lanza un error visible, así que el silencio en sí puede pasar desapercibido. Queda como PENDIENTE validar la lectura contra datos
reales de TRU/AQP antes de que el mostrador la use (D-62 ya confirmó que HAY datos ahí; esta migración no pudo probarlo en vivo porque el Postgres
local no tiene esas tablas — ver «Verificación» abajo).

## Decisión 2 — D-56/D-57/D-85/D-86/D-87: quién emite el comprobante

**DECIDÍ:** `ventas.emisor text not null default 'retail' check (emisor in ('alegra','retail'))` y `p_emisor` en `registrar_venta` con el mismo
default. Cuando es `'retail'`, la función reserva comprobante como ya hace hoy (`retail.emitir_comprobante`, series propias por ubicación). Cuando es
`'alegra'`, la venta se registra completa (stock, caja, pagos) **sin** tocar `retail.comprobantes`. Campo opcional `ventas.boleta_alegra_numero text`
(texto libre, ej. `"B001-00045"`) para ubicar la venta al hacer un cambio, con un candado que impide llenarlo si `emisor = 'retail'` (no tiene sentido
ahí). Una nota de crédito la emite quien emitió la boleta original — no hace falta candado nuevo: si Alegra emitió la boleta, ese comprobante nunca
existió en `retail.comprobantes`, y `emitir_nota` ya exige un `comprobante_original_id` real.

**LA OBJECIÓN — el default NO es `'alegra'`, aunque D-56 lo pida literal.** D-56 dice «con "La emite Alegra" por defecto» — pero esa frase describe qué
opción va preseleccionada en la pantalla del mostrador que **todavía no existe**, no qué debe pasar si nadie manda el parámetro. Hoy
`PuntoDeVenta.tsx` llama `registrar_venta` **siempre** con `p_tipo_comprobante` puesto — es decir, el comportamiento real de hoy, de hecho, ya es
«retail emite» (el propio D-56 lo dice: «hoy retail reserva boleta en cada venta y la deja pendiente»). El requerimiento de esta tanda es explícito y
más fuerte: *la llamada actual debe seguir funcionando EXACTAMENTE igual que hoy, sin ningún cambio de comportamiento visible hasta que el mostrador
los use*. Si el default fuera `'alegra'`, pegar esta migración en producción habría apagado la emisión de las boletas de las 3 tiendas en el instante
mismo del pegado, sin tocar una sola línea de React — la peor clase de regresión, silenciosa, en un sistema que ya transmite documentos reales a
SUNAT. Se resuelve la contradicción a favor de no romper lo que ya funciona: `default 'retail'`. El día que el mostrador ofrezca el selector, esa
pantalla decide su propio valor inicial (Alegra, por D-56) y lo manda siempre explícito — el default de la función deja de importar en cuanto nadie
vuelve a omitir el parámetro.

**DESCARTÉ:**
- *Crear una tabla de series nueva para retail.* D-85 pedía «series propias por tienda, si no existe una tabla créala mínima —
  `retail.series_comprobante (ubicacion_id, tipo, serie, correlativo_actual)`». Esa tabla **ya existe**: `retail.series_comprobantes` (plural),
  creada en `0010_facturacion.sql`, con exactamente esas columnas (`siguiente_numero` en vez de `correlativo_actual`, mismo concepto) y ya usada por
  `emitir_comprobante` vía `fn_reservar_numero_serie`. Crear una tabla nueva habría sido el caso especial que el principio 6 de este repo pide
  eliminar, no agregar — y habría dejado DOS numeraciones paralelas compitiendo por el mismo propósito.

**SE ROMPE SI:** alguien asume que el default `'retail'` de la función ES la recomendación de negocio de D-56 y construye el mostrador con Alegra
como opción secundaria — no lo es; es un valor de compatibilidad hacia atrás, documentado acá exactamente para que la próxima tanda no lo copie sin
leer esto.

## Decisión 3 — D-60: qué pasa cuando SUNAT/Lucode no responde

**DECIDÍ:** `comprobantes.estado` admite `'pendiente_reintento'`, con bitácora (`intentos_transmision`, `ultimo_intento_transmision_at`,
`ultimo_error_transmision`, `proximo_reintento_at`) y dos RPC: `fn_marcar_reintento_transmision` (escribe un intento fallido, con backoff simple de 15
minutos por intento hasta un tope de 2 horas) y `fn_comprobantes_cola_reintento` (la cola visible, por ubicación o —solo líder— consolidada). **Se
degrada así, no pierde este dato:** un comprobante que Lucode/SUNAT no aceptaron por un error de red o del proveedor (nunca un rechazo real de SUNAT,
que ya tiene su propio estado `rechazado`) queda visible, con cuántas veces se intentó y hace cuánto — nunca desaparece, nunca pierde el correlativo
que ya reservó.

**DESCARTÉ (a propósito, no por falta de tiempo):**
- *Automatizar el disparo y el reintento periódico dentro de esta tanda.* Necesita infraestructura que una RPC sola no puede dar: Postgres no llama a
  Lucode (no hay `pg_net`/`http` en este esquema) y no hay scheduler corriendo. Automatizarlo de verdad pide una Edge Function con cron (o un cron de
  Vercel) — infraestructura nueva, fuera del alcance «RPC + esquema» de esta tarea. Inventar una automatización a medias (ej. un trigger que finge
  reintentar sin poder llamar a Lucode) habría sido peor que no automatizarlo: una promesa que el esquema no puede cumplir.

**SE ROMPE SI (documentado, no resuelto en esta tanda — ver PENDIENTE):** nadie conecta `fn_marcar_reintento_transmision` desde
`apps/web/app/api/lucode/emitir/route.ts` (hoy esa ruta, en su rama de error, deja el comprobante como estaba en vez de encolarlo) — el esquema queda
listo pero inerte. Y si alguien reintroduce el botón «Transmitir» para un `pendiente_reintento` sin agregar ese estado a
`motivoParaNoTransmitir` (`apps/web/lib/transmision-reglas.ts`, que hoy solo deja pasar `pendiente`/`rechazado`), quedaría visible en la cola pero
intransmisible desde la pantalla.

**Hallazgo al diseñar esto (no pedido, pero real):** `anular_venta` (`20260921121500_anular_venta_libera_el_comprobante_pendiente.sql`) libera a
`no_emitido` el comprobante `pendiente` de una venta que se anula, pero no miraba `pendiente_reintento` — un comprobante que ya falló una vez y
quedó en la cola habría sobrevivido a la anulación de su propia venta, reintentando para siempre declarar ante SUNAT algo que ya no existe. Se agregó
`pendiente_reintento` a esa misma liberación (`20260922151500`, un `create or replace` de una sola línea, misma firma).

## Decisión 4 — D-67: descuento de venta con tope por rol y autorización de un líder

**DECIDÍ:** `colaboradores.tope_descuento_pct numeric default 10` (NULL = sin tope; los líderes ya registrados quedan en NULL por backfill).
`registrar_venta` gana `p_descuento_pct numeric default 0`, `p_autorizado_por uuid default null` y `p_motivo_descuento text default null`: si
`p_descuento_pct` supera el tope de quien vende, exige que `p_autorizado_por` sea un `persona_id` con `fn_es_lider_persona(...)` verdadero — nueva
función, misma idea que `fn_es_lider()` pero evaluada sobre OTRA persona (quien autoriza, no quien ejecuta la llamada) — si no, `raise exception`
con `errcode = 42501`. Se guarda en `ventas.descuento_pct`/`descuento_autorizado_por`/`descuento_motivo` (auditoría para D-63).

**DESCARTÉ:**
- *Cruzar este descuento con `venta_items.descuento_unitario` (el descuento por línea que ya existe, con su propio candado de código/escalonado,
  R-45/ADR-0048).* Son dos mecanismos que hoy conviven sin validarse entre sí: `p_descuento_pct` es un dato de auditoría a NIVEL DE VENTA, no
  reemplaza ni recalcula el descuento por línea. Reconciliarlos es una decisión de negocio (¿debe coincidir? ¿debe ser mayor o igual?) que le
  corresponde a la tanda del mostrador, con Felipe mirando cómo se usa en la práctica — no algo para decidir a ciegas en una migración de esquema.
- *Sobrecargar `fn_es_lider()` con un parámetro opcional en vez de crear `fn_es_lider_persona`.* Mismo problema que ya evitó ADR-0026: dos firmas
  vivas resolviendo cosas distintas bajo el mismo nombre confunde más de lo que ahorra.

**SE ROMPE SI:** el mostrador manda `p_autorizado_por` de una persona que dejó de ser líder ENTRE que el líder tecleó su clave y que la venta llegó al
servidor — `fn_es_lider_persona` se evalúa en el momento exacto de `registrar_venta`, así que ese caso se rechaza correctamente (no es un hueco, es
el comportamiento correcto); lo que SÍ falta es decidir, en la tanda del mostrador, CÓMO un líder "presta" su autorización (¿su propia sesión?
¿clave física en el mismo dispositivo?) — esta migración solo exige el hecho, no dice cómo se recoge en pantalla.

## Verificación (no «debería funcionar»)

- **Postgres 17 desechable local** (Docker caído — `postgres-desechable-sin-docker`): 194 migraciones de `origin/main` + `seed.sql` aplicadas antes,
  luego las dos migraciones de esta pieza, dos veces cada una (idempotencia confirmada, sin duplicar constraints/índices/funciones).
- **`pnpm pruebas:venta-contrato-ampliado`** (nuevo, 13 escenarios, todos en ROLLBACK): la llamada de hoy sin parámetros nuevos se comporta idéntico
  (mismo stock, mismo comprobante reservado, `emisor = 'retail'`); `fn_asesoras_de_turno` no falla ni sin `sede_dynamic_id` ni sin las tablas de
  Dynamic (el caso real de TODO Postgres local); descuento sobre el tope sin autorización falla con **SQLSTATE 42501 exacto** (verificado con
  `pg_temp.intento`, no solo el texto); el mismo descuento CON autorización de un líder real pasa y queda auditado; autorización de alguien que NO es
  líder sigue en 42501; un líder aplica cualquier descuento sin autorización (sin tope); `p_emisor = 'alegra'` no reserva comprobante;
  `anular_venta` libera un comprobante que ya estaba en `pendiente_reintento`.
- **Regresión: `pnpm pruebas:registrar-venta`** (25/25), **`pruebas:anular-venta-comprobante`** (9/9), **`pruebas:comprobante-venta-anulada`** (8/8),
  **`pruebas:ventas-del-dia`** (11/11), **`pruebas:notas-credito`** (42/42), **`pruebas:candado-lider`** (20/20) — todas en verde, cero roturas.
  `pruebas:colaboradores-endurecimiento` falla en este Postgres local, pero por una causa previa y ajena a esta pieza: su propio script (que su
  cabecera marca «escrita sin poder correrla») no encuentra ninguna persona sin acceso en el seed mínimo (2 personas, las 2 ya colaboradoras) y su
  manejo de «sin datos, salir sin fallar» no funciona como está escrito — no toca nada que esta migración cambie (`agregar_colaborador`/
  `quitar_colaborador`/`fn_dynamic_disponibles` siguen intactas).
- **`pnpm typecheck`** y **`pnpm lint`**: verdes (esta pieza no toca ni un archivo `.ts`/`.tsx`).
- **Concurrencia:** `registrar_venta` sigue siendo una sola transacción todo-o-nada (principio 9): si el candado de descuento falla, no queda ni venta
  ni movimiento de stock a medias. `fn_marcar_reintento_transmision` usa `for update` sobre la fila del comprobante antes de decidir si puede
  encolarse, para que dos intentos casi simultáneos (ej. un reintento manual y uno automático futuro) no se pisen.
- **Caída externa:** cubierta explícitamente por la Decisión 3 (D-60) — es el tema completo de esta sección del ADR.
- **Persona sin contexto:** no aplica todavía — esta tanda no toca ninguna pantalla; se vuelve a evaluar cuando el mostrador conecte estos parámetros.

## Pendiente (para la próxima tanda, fuera de «RPC + esquema»)

1. `apps/web/app/api/lucode/emitir/route.ts`: en la rama `if (!resultado.ok)`, llamar `fn_marcar_reintento_transmision(fila.id, resultado.detalle ??
   resultado.motivo ?? null)` en vez de dejar el estado como estaba.
2. `apps/web/lib/transmision-reglas.ts:21`: agregar `pendiente_reintento` a los estados que `motivoParaNoTransmitir` deja transmitir.
3. Disparo automático de la transmisión al cobrar (hoy es un botón manual en `ComprobantesPanel`) + Edge Function con cron para el reintento
   periódico y el aviso al líder cuando pasan horas — infraestructura nueva, fuera de esta tanda.
4. `PuntoDeVenta.tsx` empieza a mandar `p_asesora_id` (con `fn_asesoras_de_turno` como sugerencia, nunca filtro duro — D-62), el selector Alegra/retail
   (con Alegra preseleccionado — D-56/57) y, cuando exista un flujo de descuento de venta en la pantalla, `p_descuento_pct`/`p_autorizado_por`/
   `p_motivo_descuento`.
5. Validar `fn_asesoras_de_turno` contra datos reales de TRU/AQP en producción antes de que el mostrador la use (esta migración no pudo probarla en
   vivo: el Postgres local no tiene stub de `jornadas`/`marcajes`, a propósito — ADR-0033).
6. Topes exactos de `tope_descuento_pct` por rol: Felipe los ajusta con un `update` directo cuando lo decida — no requiere otra migración.
