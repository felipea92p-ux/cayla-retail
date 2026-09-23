# Pantalla — Caja (`/caja`)

> **Trabajo en vuelo:** `docs/SESIONES-ACTIVAS.md` registra `ventas-visual-redesign-240e2b` (rediseño visual de Caja + Cambios): la parte de Caja ya se ve fusionada con `main` vía PR #120–#122 (sin choques de código, solo en BACKLOG/BITACORA), pero esa misma fila dice que hay un **PR #128 abierto y NO fusionado** con más cambios de Caja/Cambios; Punto de Venta sigue en la misma rama. Si ese PR trae algo distinto de lo que ve este análisis, este archivo queda corto en ese punto — no lo cubre.
>
> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder de equipo e integrante, comparados, Tienda TRU (escritorio, 1920 px) · Datos: **sin SQL nuevo** — se reusa evidencia `[producción]` ya corrida en los últimos 7 días (volcado del 2026-09-21) y el propio checklist de BACKLOG.md; lo que no tiene esa evidencia va `[no verificable]` y las consultas que faltan quedan en «SQL pendiente».
> SHA analizado: `88457700` (origin/main) — la rama de este worktree estaba 10 commits detrás de `origin/main` en general, pero **los archivos de esta pantalla ya coincidían byte a byte con `origin/main`** (`git diff --stat HEAD origin/main -- apps/web/app/(app)/caja apps/web/components/CajaAbiertaPanel.tsx apps/web/components/MovimientoCajaModal.tsx apps/web/lib/caja-panel-reglas.ts apps/web/lib/caja.ts` → vacío): se analizó tal cual está en el worktree. Si esos archivos cambian después, este análisis está vencido.
> Archivos: `apps/web/app/(app)/caja/page.tsx` · `components/CajaAbiertaPanel.tsx` · `components/MovimientoCajaModal.tsx` · `components/CerrarCajaModalV2.tsx` · `components/ui/Graficos.tsx` · `app/(app)/caja/historial/page.tsx` · `lib/caja.ts` · `lib/caja-panel-reglas.ts` · `lib/persona-actual.ts` · RPC `registrar_movimiento_caja`, `cerrar_caja`, `abrir_caja`, `fn_ventas_del_dia`, `fn_puede_gestionar_caja` · tablas `cajas`, `caja_movimientos`, `venta_pagos`

## 0 · Veredicto
El hueco de dinero que el análisis anterior encontró (2026-09-21) **sigue abierto, sin tocar, byte a byte igual**: la RPC `registrar_movimiento_caja` no cambió una línea desde el 15-sep, así que cualquier colaborador con sesión sigue pudiendo vaciar el cajón con un egreso «Retiro de efectivo» u «Otro» de cualquier monto sin ser líder — el propio `docs/BACKLOG.md:254` lo confirma sin marcar. Alrededor de ese hueco sí se trabajó bien: el modal ahora conoce el rol, no viene precargado, avisa de una caja de días abiertos y el historial de cierres por fin muestra la diferencia en una tabla — pero ninguna de esas piezas toca la RPC, así que el candado sigue siendo decorativo y el puntaje no se mueve.
**Cumple su finalidad:** 5,0/10 (promedio 6,2, con tope 5 por el candado de dinero seguir roto) · **Relevancia:** 8,0/10 — Núcleo

## 1 · Finalidad declarada
"Esta pantalla existe para que quien atiende sepa cuánta plata entró y salió en el turno, registre lo que mueve el efectivo fuera de una venta, y que un líder (o, si se aplica ADR-0160, la terminal de ventas) pueda cerrar el turno contando y viendo si cuadra."
Fuente: `docs/datos/modulos/07-ventas-y-caja.md` («Para qué existe»: «el dinero entra al cajón, el stock de la sede baja, y queda escrito quién cobró y cuándo» — sin aviso de V1 en este archivo hoy, a diferencia de lo que citaba el análisis anterior), D-13 y D-49 (`docs/datos/DECISIONES-2026-09-12.md:72,293`), ADR-0056, ADR-0143 y ADR-0160 (nuevo desde el análisis anterior).
¿Coinciden docs y pantalla? **No del todo, y sigue siendo hallazgo:**
- D-13 reserva al líder «registrar gastos y depósitos». ADR-0056 decidió lo contrario para el depósito. Las dos siguen vigentes y sin reconciliar; la pantalla sigue la segunda.
- ADR-0160 (2026-09-21, **NO aplicada en producción todavía** — su propio encabezado dice «NADA aplicado en producción: falta pegar la migración... se detiene y se confirma antes de pegar») decide que además del líder, una cuenta compartida "terminal de ventas" pueda cerrar caja y registrar movimientos. El código de `/caja` ya asume esa posibilidad (`CajaAbiertaPanel.tsx:209`: «La caja la cierra un líder de equipo **o la terminal de ventas**»), pero la base de producción, mientras la migración no se pegue, sigue exigiendo `fn_es_lider()` a secas — la frase en pantalla hoy en producción describiría un poder que la base todavía no da (o, si el código ya se desplegó, no rompe nada porque `fn_mi_terminal()` no existe ahí y todo colaborador cae a "persona común", pero el texto del botón queda adelantado a la base).

## 2 · Objeción
1. **La puerta del dinero sigue abierta — cero cambios en la RPC desde el 15-sep, confirmado por tres fuentes independientes.** `registrar_movimiento_caja` (`supabase/migrations/20260915202040_caja_deposito_y_ajuste.sql:43-83`) es la ÚNICA definición de esa función en todo `supabase/migrations/` además de su versión anterior de `0008` — ninguna migración posterior la redefine (`grep -rl registrar_movimiento_caja supabase/migrations` solo la encuentra en esos dos archivos) `[código]`. Sigue exigiendo líder únicamente cuando `p_es_ajuste = true` (`…202040.sql:61-63`); `p_tipo`, `p_monto > 0` y `p_motivo` no vacío son las únicas otras reglas (`:67-75`) — sin tope de monto, sin lista cerrada de motivos. El propio checklist de tareas que dejó el análisis anterior, escrito por otra sesión el mismo día en `docs/BACKLOG.md:254`, sigue sin marcar: «#1 Candado real en `registrar_movimiento_caja`... **Espera su decisión sobre permisos**» `[código docs/BACKLOG.md:254]`. Y el modal (`MovimientoCajaModal.tsx:53-60`) sigue mandando `p_es_ajuste: esAjuste` calculado en el navegador a partir del motivo elegido (`esMotivoDeAjuste`, `caja-panel-reglas.ts:280-282`) — quien llame la RPC desde la consola del navegador (no desde el modal) decide el valor de `p_es_ajuste` él mismo. Resultado, sin cambios respecto al 21-sep: un colaborador registra un **egreso "Otro" o "Retiro de efectivo" por cualquier monto** con `es_ajuste = false` y hace exactamente lo que D-13 dice que solo el líder puede hacer — mover el efectivo sin una venta detrás — sin pasar por ningún candado de rol.
2. **Lo que sí se hizo mejora la pantalla pero no toca la RPC, así que es cortesía sobre el mismo hueco.** `motivosDeMovimiento(tipo, esLider)` (`caja-panel-reglas.ts:286-289`) ya esconde «Ajuste» a quien no es líder — el propio comentario del código lo admite: «Solo esconde lo que la base ya rechaza — el candado real sigue siendo la RPC» (`:284-285`) `[código]`. Es exactamente la alternativa que el análisis anterior ya había descartado como insuficiente («esconder opciones en el modal — cualquier sesión llama la RPC desde la consola»). Los motivos que SÍ pasan para un colaborador sin ningún candado — «Retiro de efectivo», «Depósito bancario», «Compra de insumos» y «Otro» en egreso (`caja-panel-reglas.ts:276`) — son justo los que mueven plata de verdad.
3. **La contradicción D-13 / ADR-0056 sigue sin resolverse, y ahora se le suma ADR-0160 sin que nadie la haya cruzado con las dos anteriores.** ADR-0160 (2026-09-21) amplía quién puede ejecutar `registrar_movimiento_caja` con `es_ajuste=true` de «solo líder» a «líder o terminal de ventas» (`supabase/migrations/20260922200000_terminales_por_tienda.sql:115-117,311`: `fn_puede_gestionar_caja()` = `fn_es_lider() or fn_es_terminal('ventas')`, e inyectada dentro de `registrar_movimiento_caja` reemplazando `fn_es_lider()`) — **todavía no aplicada en producción** (su propio ADR lo dice). Una «terminal de ventas» es una cuenta que **usa todo el equipo de la tienda** (ADR-0160, «Lo que dijo el negocio», punto 1): el día que se pegue esa migración, un «Ajuste de caja (faltante)» —el movimiento que D-13 quiso reservar a una persona nombrada, para que el descuadre tenga un responsable— podrá quedar a nombre de «Terminal Ventas TRU» sin que se sepa cuál de las colaboradoras de turno lo hizo (el propio ADR lo admite en su sección «Se rompe si»: «cualquiera que sepa la clave de una terminal actúa como ella»). Es una decisión de negocio ya tomada por Felipe (ADR-0160), no un bug — pero nadie la cruzó todavía contra el hueco #1: ampliar QUIÉN puede hacer un ajuste no cierra que la mayoría de los movimientos (los que no son ajuste) sigan sin pedir ningún rol.

## 3 · Lo que está bien y no se toca
- **El modal ya conoce el rol y no ofrece lo que la base rechazaría** (tarea #2 del análisis anterior, cerrada): `MovimientoCajaModal` recibe `esLider` (`:15`) y `motivosDeMovimiento` filtra «Ajuste» para quien no es líder (`caja-panel-reglas.ts:286-289`) `[código]`. Confirmado también por `docs/BACKLOG.md:250` («[x] #2»).
- **Aviso de caja abierta de días anteriores** (tarea #3, cerrada): `turnoLargo`/`HORAS_TURNO_LARGO = 18` (`caja-panel-reglas.ts:266-271`) y el componente `AvisoTurnoLargo` (`CajaAbiertaPanel.tsx:398-409`) pintan una franja roja con «Esta caja lleva N h abierta… avisa a un líder» cuando pasa el umbral `[código]`. Falta aún la decisión de Felipe sobre el umbral exacto y quién cierra sin líder en la tienda (`docs/BACKLOG.md:251`), pero la pieza visible ya existe.
- **El modal dejó de venir precargado y ya pide lo que hace falta** (tarea #6, cerrada): sin tipo ni motivo elegidos de entrada (`MovimientoCajaModal.tsx:18-21`), foco en el monto (`:112`, `autoFocus`), «S/» y placeholder «0.00» (`:102-113`), «Ingreso» ahora en verde y no en rojo (`:86-89`, coherente con cómo el propio panel pinta un ingreso), y Referencia obligatoria en «Depósito bancario» y «Otro» (`referenciaObligatoria`, `caja-panel-reglas.ts:292-294`; `mov-nota` con `required={pideReferencia}`, `:170`) `[código]`.
- **Movimientos manuales en hora de Lima** (tarea #10, cerrada): `diaYHoraLima` reemplaza `getHours()` del navegador (`CajaAbiertaPanel.tsx:153`, import `:33`) `[código]`.
- **`/caja/historial` ya muestra la diferencia en una tabla, no solo el esperado**: columnas Apertura/Esperado/Contado/Diferencia con color por cuadre (`app/(app)/caja/historial/page.tsx:69-106`), más el filtro «Con datos de prueba» (D-54/ADR-0159, `:33,50-58`) que antes no existía `[código]`. Sigue faltando el filtro por sede y una paginación real (sigue en `limite = 60` fijo, `lib/caja.ts:222`) — eso es lo que BACKLOG deja sin marcar en su #8.
- **Cierre ciego real, sin cambios y sigue correcto**: quien cuenta no ve el esperado hasta después (`CerrarCajaModalV2.tsx:75-93`) `[código]`.
- **Cierre solo para líder, confirmado sin tocar**: `fn_es_lider()` dentro de `cerrar_caja` sigue siendo la primera línea de la función (`20260921120000_candado_de_lider_caja_y_ajuste.sql:86-89`) — **aplicada en producción el 2026-09-21** según `docs/SESIONES-ACTIVAS.md:21` `[producción, 2026-09-21]`.
- **`cerrar_caja` excluye las ventas anuladas del efectivo esperado, y esto no cambió**: `v.estado <> 'anulada'` (`20260921120000…sql:107-109`) `[código]`.
- **`fn_ventas_del_dia` excluye anuladas y no repite venta con dos comprobantes**, y sigue así en su versión más reciente del día de hoy (`20260922213700_ventas_del_dia_firma_con_quien_atendio.sql:85`: `v.estado = 'completada'`) `[código]`.
- **Volumen sigue siendo el mismo, bajo**: `caja_movimientos` tiene ~3 filas `[producción, volcado 2026-09-21, docs/datos/generado/DICCIONARIO-RETAIL.md:1227]`. Con 3 tiendas activas de verdad, cualquier plan de acceso alcanza.
- **`CajaGraficos.tsx` sigue existiendo sin que nadie lo importe** — no es una mejora, pero tampoco es nuevo ni se agravó: `grep -rn "CajaGraficos" apps/web` no encuentra referencias fuera del propio archivo `[código]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,0 | Mejoró (verde para ingreso, S/, sin prellenado) pero conserva el `<select>` nativo y `focus:border-rojo` en cualquier campo | `[código MovimientoCajaModal.tsx:86-89; Modal.tsx:122-123]` |
| Lógica de negocio | 4,0 | Sin cambio: candado decorativo, D-13/ADR-0056 sin reconciliar, y ahora ADR-0160 (sin aplicar) suma una cuenta compartida al ajuste | `[código …202040.sql:61-75; BACKLOG.md:254]` |
| Arquitectura | 5,5 | Cadena limpia sin cambios; mismos estados imposibles (sin tope de egreso), misma falta de cola offline para movimientos | `[código MovimientoCajaModal.tsx:53]` |
| Funciones | 6,5 | Mejoró: aviso de turno largo y tabla de diferencia en historial ya existen; sigue faltando revisar movimientos antes de contar y el código muerto | `[código, BACKLOG.md:249-262]` |
| Utilidad | 7,0 | Mejoró bastante el flujo del modal (foco, sin prellenado, S/, referencia); el escenario de la colaboradora sola ya no se equivoca por el modal, pero sigue pudiendo mover plata sin candado real | `[código MovimientoCajaModal.tsx:112,102-113]` |
| Conexión con el ERP | 7,0 | Sin cambios de fondo; ADR-0160 (sin aplicar) es la única novedad de conexión, y toca directamente `cerrar_caja`/`registrar_movimiento_caja` | `[código 20260922200000…sql]` |

### Estética (7,0)
(a) Coherencia CAYLA: crema/tinta, serif, esquinas suaves sin cambios `[visto histórico, sin nueva captura]`. Rojo: sigue sin hacerse cumplir el tope de 2 (`design-tokens.ts:73`) en `/caja` — barra de meta (`CajaAbiertaPanel.tsx:238`), borde de la KPI «Egresos» (`:265`), «Ver historial completo» (`:307`), icono de cada egreso (`:162`) y barras rojo-profundo de cierres descuadrados (`Graficos.tsx:69`) siguen siendo rojo simultáneo en la misma pantalla `[código]`.
(b) Modal: mejoró el punto más visible del análisis anterior — «Ingreso» ya no comparte color con «Egreso»: el botón activo usa `border-verde bg-verde/10 text-verde` para ingreso y `border-rojo…` solo para egreso (`MovimientoCajaModal.tsx:86-89`) `[código]`. Pero `focus:border-rojo` sigue pintando de rojo cualquier campo con foco, incluida «Referencia» (`Modal.tsx:122`) `[código]`, y el `<select>` de motivo sigue siendo el nativo del sistema operativo, sin estilo propio (`MovimientoCajaModal.tsx:125-140`, `campoSelect` en `Modal.tsx:123` es solo un wrapper de clases sobre un `<select>` real) `[código]`.
(c) Universales: ya no hay spinner nativo visible en el monto (`[appearance:textfield]` y ocultar los botones, `MovimientoCajaModal.tsx:116`) — mejora directa sobre el hallazgo anterior `[código]`. Etiquetas de 11 px a `text-tinta/70` (`campoEtiqueta`, `Modal.tsx:120`) siguen igual, en el borde del piso de contraste `[inferido; no medido]`.

### Lógica de negocio (4,0)
- El candado de rol para un movimiento NO marcado como ajuste sigue sin existir en la base. Ninguna decisión escrita cubre «un colaborador registra un egreso o ingreso "Otro"» sin ser líder — la misma conclusión del 21-sep, porque el código que la sostiene no cambió `[ninguna decisión escrita cubre esto]`.
- ADR-0160 (nueva desde el análisis anterior) decide ampliar el candado de ajuste de «líder» a «líder o terminal de ventas», pero **eso no cierra el hueco de #1** — un ajuste hecho por la terminal compartida sigue siendo más plata movida sin nombre propio que antes (el ADR mismo lo advierte en «Se rompe si»), y los movimientos que no son ajuste (la mayoría de las rutas por las que hoy se puede sacar plata) siguen sin pedir ni líder ni terminal: piden solo sesión con acceso a esa ubicación `[código …200000.sql:311; ADR-0160 §"Se rompe si"]`.
- **Ajuste antes del cierre sigue tapando la diferencia**, sin cambio respecto al 21-sep: `cerrar_caja` sigue sumando por `tipo`, no por `motivo` (`20260921120000…sql:111-114`), así que un «Ajuste (faltante)» hecho antes de contar sigue acercando a cero la diferencia final que el historial mostraría `[código]`.
- **«Compra de insumos» como egreso rápido sigue contradiciendo R-04** («El efectivo para pagar sale de reservas bancarias. Nunca del cajón de una tienda», `docs/datos/15-COMO-OPERA-CAYLA.md:43`): el motivo sigue en la lista de egresos de cualquier colaborador (`caja-panel-reglas.ts:276`) `[código]`.

### Arquitectura (5,5)
- **Cadena sin cambios estructurales:** `page.tsx` → `CajaAbiertaPanel` → `MovimientoCajaModal` → RPC `registrar_movimiento_caja` (security definer, `search_path` fijo) → `caja_movimientos` → RLS SELECT solo `[código]`.
- **Estado imposible que la base sigue sin impedir:** un egreso mayor que el efectivo disponible; un motivo `ilike 'ajuste%'` con `es_ajuste = false`. Sin CHECK, sin lista cerrada de motivos en la base — el CHECK que existe (`caja_movimientos_monto_check`, `caja_movimientos_tipo_check`, `[producción, DICCIONARIO-RETAIL.md:1243-1244]`) solo exige `monto > 0` y `tipo in (ingreso, egreso)`, nada del resto.
- **Caída externa sin cambios**: los movimientos manuales todavía no se encolan offline — `MovimientoCajaModal.tsx:53` sigue siendo una llamada directa sin cola, a diferencia de las ventas (`lib/ventas-offline.ts`). Con una caja por sede y movimientos raros, el riesgo sigue siendo bajo, pero D-49 («la caja no se congela nunca») sigue sin cumplirse para este camino. Se degrada así: la venta sobrevive sin internet, el retiro de efectivo se pierde y hay que reescribirlo.
- **Volumen:** ~3 filas en `caja_movimientos` `[producción, volcado 2026-09-21]`. Con 3 tiendas y unos 3–5 movimientos por día, unos 4 000–5 000 filas en 3 años: ningún índice ni caché adicional se justifica.
- **Lentes extra:** RLS/rol sigue siendo el hallazgo central. La hora de Lima en movimientos ya se corrigió (`diaYHoraLima`, `CajaAbiertaPanel.tsx:153`), así que ese lente queda cerrado desde la #10.
- **Novedad de arquitectura (no verificada en producción):** `fn_puede_operar_ubicacion` sigue siendo el único candado de sede dentro de `registrar_movimiento_caja` — ADR-0160 no lo toca. Si la migración de terminales se pega, el candado de rol pasa a `fn_puede_gestionar_caja()`, pero el candado de sede sigue igual `[código …200000.sql:310-311]`.

### Funciones (6,5)
- **Existen y funcionan, sin cambios**: abrir caja, movimiento manual, cerrar con conteo ciego, ver todos los movimientos, detalle de venta, historial de cierres con diferencia visible (mejorado), dona y tabla.
- **Nuevas desde el 21-sep**: franja de aviso de turno largo (`AvisoTurnoLargo`); modal sin prellenado con foco y referencia obligatoria; tabla de historial con Esperado/Contado/Diferencia y filtro de datos de prueba.
- **Fantasma / sin uso, sin cambio**: `CajaGraficos.tsx` completo (huérfano), `senalCaja` y `tendenciaCierres7Dias` sin importar fuera de `caja-panel-reglas.ts` `[código; `grep -rn` sin resultados fuera de ese archivo]`.
- **Faltan, sin cambio**: que el líder vea los movimientos manuales del turno con su autor antes de contar (`CerrarCajaModalV2.tsx` no los lista — confirmado leyendo el archivo completo hoy); candado real de rol/monto en la RPC.
- **Sobran / ambiguas, sin cambio**: «Ajuste de caja (faltante/sobrante)» tal como está (ver §8, la decisión sigue pendiente — `docs/BACKLOG.md:255`).

### Utilidad (7,0)
Mismo escenario que el 21-sep, repetido hoy contra el código actual: una colaboradora nueva, 8 p. m., la líder no está y hay que sacar S/200 para un flete.
1. Abre «+ Ingreso / egreso»: **ya no hay nada elegido** — tipo y motivo en blanco (`MovimientoCajaModal.tsx:18-21`) `[código]`. Mejora directa: ya no puede confirmar por accidente un egreso que no eligió.
2. El foco cae en el monto, con «S/» visible (`:112,102-104`) `[código]`. Mejora directa sobre el hallazgo anterior («el foco caía en el botón Ingreso»).
3. Elige «Retiro de efectivo» (o «Otro»): **la base la deja pasar sin ser líder**, exactamente como el 21-sep — nada del flujo mejorado cambia esto, porque la RPC sigue sin preguntar por el rol salvo que el motivo sea «Ajuste» (`esMotivoDeAjuste`, `caja-panel-reglas.ts:280-282`, y solo si además viene marcado `p_es_ajuste=true`, cosa que el modal ya no le ofrece hacer con "Otro"/"Retiro de efectivo" — pero la RPC en sí no lo exige, así que da igual qué motivo escriba).
4. Con «Otro» o «Depósito bancario», ahora SÍ le exige una referencia antes de dejarla enviar (`referenciaObligatoria`, `pideReferencia`, `:170`) `[código]`. Mejora directa: antes pasaba sin voucher ni nota.
Se sigue equivocando en (3) — no por el diseño del modal (que ya mejoró), sino porque **el modal no puede arreglar lo que decide el servidor**: cualquiera con la consola del navegador salta el modal entero y llama la RPC directo, con cualquier motivo. El fallo sigue siendo del diseño de la RPC, no de la colaboradora ni del modal.

### Conexión con el ERP (7,0)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Sigue siendo el arqueo del día: la diferencia de cierre alimenta el historial (ahora más visible en tabla) y la confianza en cada sede. |
| Dinero y stock que toca | ×1 | 9 | Todo el efectivo de la sede sigue pasando por aquí; no toca stock. |
| Frecuencia y personas que la usan | ×1 | 8 | Se abre todos los días en cada sede; volumen de producción sigue bajo (~3 filas en `caja_movimientos`, `[producción, 2026-09-21]`) porque retail aún no opera a régimen completo. |
| Qué se detiene si falla | ×1 | 7 | Las ventas no se frenan (D-49), pero sin cierre no hay arqueo ni depósito del día. |

Relevancia = (2·8 + 9 + 8 + 7) / 5 = **8,0** → **Núcleo**. Sin cambio respecto al 21-sep: nada de lo que se tocó desde entonces altera cuánta gestión, dinero o frecuencia pasa por esta pantalla.

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas` y `venta_pagos` (efectivo vs otros métodos), devoluciones (`aprobar_devolucion`), cambios (ADR-0053), apertura de caja (`abrir_caja`). Sin cambios.
- **Aguas abajo:** `cerrar_caja`, `/caja/historial` (ahora con tabla de diferencia), `getDetalleCierre`. El futuro «adelanto de apartado» (`docs/BACKLOG.md:208`, Fase 2 de ADR-0141) seguirá siendo un ingreso de caja apoyado en la misma RPC sin candado real — razón de más para que #1 se cierre antes de que ese ingreso exista.
- **Pájaro dueño y vecinos:** COLIBRÍ (Ventas y caja) — confirmado en `docs/datos/generado/AVIARIO.md:19,35-36` — «Lo lleva: libre», sin dueño asignado todavía `[código]`. Vecinos: Cambios, Devoluciones, Facturación (comparten `fn_ventas_del_dia`, actualizada hoy mismo por otra sesión sin tocar la exclusión de anuladas, `20260922213700…sql`).
- **Novedad — Terminales (ADR-0160):** conecta `/caja` con `/colaboradores` (alta de la cuenta compartida, pestaña «Terminales») y con el módulo de menú (`lib/menu.ts`). Es código completo pero **sin aplicar en producción**; el día que se pegue, cambia quién puede cerrar caja y ajustar sin tocar ninguno de los archivos que esta pantalla ya usa hoy.
- **Externos, y qué pasa si caen:** SUNAT/Nubefact no participan en la caja. Sin internet: las ventas se encolan y los movimientos manuales no (sin cambio) — se degrada así: la venta se salva, el retiro de efectivo se pierde.

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Que la base decida quién puede mover el efectivo y qué es un ajuste
- **Dónde:** `supabase/migrations/20260915202040_caja_deposito_y_ajuste.sql:43-83` como cuerpo de partida (sigue siendo la definición vigente); columnas `caja_movimientos.motivo` y `es_ajuste`.
- **Por qué en este puesto:** idéntico al 21-sep, porque nada lo cambió: es dinero, y hoy un colaborador mueve el esperado con «Otro» o «Retiro de efectivo» sin ningún candado de rol. `docs/BACKLOG.md:254` lo confirma sin marcar, con la nota «espera su decisión sobre permisos» — la decisión de Felipe sigue siendo el bloqueante, no el código.
- **Cómo lo verificas tú:** desde la consola del navegador con sesión de colaboradora, llamar `registrar_movimiento_caja` con motivo «Otro» y monto 500 → hoy responde éxito (debería responder error de líder para egresos grandes o exigir referencia server-side); con motivo «Ajuste de caja (faltante)» y `p_es_ajuste=false` → debería tratarlo igual como ajuste y exigir líder (hoy no lo hace: el servidor confía en el valor que manda el cliente).
- **Esfuerzo / dependencias:** M · la migración toca producción: confirmar con Felipe antes de pegarla (regla de CLAUDE.md); prefijo `retail.`. Antes, reconciliar D-13 con ADR-0056 **y ahora también con ADR-0160** en un ADR que las cruce las tres.
- **DECIDÍ (propuesta, la confirma Felipe):** vocabulario cerrado de motivos en la RPC (no en el navegador). Para colaborador: «Retiro de efectivo», «Depósito bancario» **con referencia obligatoria server-side**; «Compra de insumos» se retira de Caja (contradice R-04, ver Objeción §2 punto 3 de la lógica de negocio); «Ajuste» y «Otro» solo líder (o `fn_puede_gestionar_caja()` si ADR-0160 ya está en producción). `es_ajuste` se deduce del motivo en el servidor, no del parámetro del cliente.
- **DESCARTÉ:** *solo esconder opciones en el modal* — ya está hecho (tarea #2) y no cierra nada, el mismo hueco sigue accesible por consola; *todo movimiento solo líder/terminal* — una colaboradora sola a las 8 p. m. no podría sacar un depósito del día y el negocio se frena en el mostrador.
- **SE ROMPE SI:** un colaborador se lleva S/300 de la caja, registra «Retiro de efectivo» S/300 a las 7:50 p. m. sin nota, la líder cuenta a ciegas al cerrar, cuadra a cero y el retiro queda como una fila con `es_ajuste=false` que nadie audita — hoy exactamente igual que hace un mes.

### #2 · [Replantear] «Ajuste de caja (faltante/sobrante)»: ¿debe existir dentro de la caja abierta?
- **Dónde:** `MovimientoCajaModal.tsx:26-28`; `MOTIVO_AJUSTE_INGRESO`/`MOTIVO_AJUSTE_EGRESO` (`caja-panel-reglas.ts:273-274`); `cerrar_caja`.
- **Por qué en este puesto:** sin cambios desde el 21-sep — sigue siendo la función que más puede "arreglar" un cuadre sin dejar rastro del descuadre, y con ADR-0160 (si se aplica) también podría hacerlo una cuenta compartida sin nombre propio. `docs/BACKLOG.md:255` sigue sin marcar y dice «decide Felipe».
- **Cómo lo verificas tú:** Felipe elige A o B en §8; con B, cerrar una caja con diferencia real y ver la diferencia visible en `/caja/historial` (esto último ya funciona: la tabla ya muestra Esperado/Contado/Diferencia).
- **Esfuerzo / dependencias:** decisión primero; implementación M. Se decide junto con la #1.
- **DECIDÍ (propuesta, sin cambio):** que el descuadre viva solo en el cierre (`cajas.diferencia`), con motivo obligatorio y sin ajuste previo.
- **DESCARTÉ:** *mantener el ajuste tal como está* — sigue tapando la diferencia, y con ADR-0160 aplicado la puede tapar una cuenta compartida; *quitarlo sin reemplazo* — un sobrante/faltante real necesita quedar explicado.
- **SE ROMPE SI:** un líder (o, tras ADR-0160, la terminal de ventas con la clave compartida) registra «Ajuste (faltante) S/40» a las 6 p. m. «para dejarla cuadrada», cierra a las 8 p. m. con S/0 de diferencia, y en el historial —ya visible en tabla— la fila sale sin diferencia: nadie se entera de que faltaron S/40 esa semana, y con la terminal, tampoco se sabe quién lo hizo.

### #3 · [Corregir] Que `getResumenCaja` y la lista de ventas midan lo mismo que `cerrar_caja`
- **Dónde:** `getResumenCaja` (`lib/caja.ts:111-147`, específicamente `:114` sin filtro de `ventas.estado`) frente a `cerrar_caja` (`20260921120000…sql:107-109`, sí excluye anuladas); `fn_ventas_del_dia` (última versión `20260922213700…sql`, solo trae **hoy**, no el turno completo).
- **Por qué en este puesto:** hoy 0 ventas anuladas en producción según el volcado (`[producción, 2026-09-21, mismo dato que citó el análisis anterior — no se corrió una consulta nueva]`), así que la divergencia sigue latente, no activa; pero es la misma raíz que el 21-sep y nadie la tocó, y el primer anulado dentro de una caja abierta hará que la tarjeta "Ventas efectivo" del tablero no coincida con el esperado del cierre.
- **Cómo lo verificas tú:** anular una venta de prueba dentro de una caja abierta → la tarjeta "Ventas efectivo" del tablero debe bajar igual que el esperado que calculará `cerrar_caja`; con una caja abierta desde ayer, "Ritmo del día" y la lista de "Movimientos recientes" deben incluir las ventas de ambos días o decir explícitamente que solo muestran hoy.
- **Esfuerzo / dependencias:** M · toca una consulta de lectura, no un esquema de producción.

### #4 · [Mejorar] Que el líder vea los movimientos manuales del turno con su autor antes de contar
- **Dónde:** `CerrarCajaModalV2.tsx` completo (releído hoy: no hay ninguna lista de movimientos antes del campo de conteo, `:190-205`); datos ya disponibles en `CajaAbiertaPanel.tsx` (`todosLosEventos`, `:140-165`).
- **Por qué en este puesto:** sin cambios desde el 21-sep. El conteo es ciego respecto del esperado, pero no tiene por qué serlo respecto de quién retiró qué — hoy el `usuario_id` de cada movimiento no lo ve nadie antes de cerrar.
- **Cómo lo verificas tú:** cerrar caja como líder con dos movimientos manuales registrados en el turno → deben aparecer listados con motivo, referencia y autor antes del campo de conteo, sin mostrar el total esperado.
- **Esfuerzo / dependencias:** S · no antes de la #1.

### #5 · [Mejorar] Historial de cierres: filtro por sede y paginación real
- **Dónde:** `getHistorialCierres` (`lib/caja.ts:222-232`, `limite = 60` fijo, sin filtro de `ubicacion_id`); `app/(app)/caja/historial/page.tsx`.
- **Por qué en este puesto:** la mitad de la tarea vieja (#8) ya se cerró sola — la tabla ya muestra Esperado/Contado/Diferencia con color (`historial/page.tsx:69-106`) — pero sigue trayendo todas las sedes mezcladas y con un tope silencioso de 60 filas sin paginar, que con 3 tiendas cerrando caja todos los días se agota en unas semanas.
- **Cómo lo verificas tú:** `/caja/historial` debe poder filtrarse por sede, y pasar de 60 cierres debe mostrar una página siguiente en vez de cortar en silencio.
- **Esfuerzo / dependencias:** M.

### #6 · [Conectar] Movimientos de caja sin internet y chip de sincronía honesto
- **Dónde:** `MovimientoCajaModal.tsx:53` (llamada directa, sin cola); `lib/ventas-offline.ts` (cola de ventas, patrón a reusar); `CajaAbiertaPanel.tsx:98-108,474-493` (`EstadoSync` solo cuenta ventas).
- **Por qué en este puesto:** sin cambios desde el 21-sep. D-49 dice que la caja no se congela nunca; hoy un retiro sin internet se pierde y el chip «Todo sincronizado» no lo sabe.
- **Cómo lo verificas tú:** apagar la red, registrar un retiro → debe quedar pendiente y el chip debe decir «1 movimiento sin sincronizar»; al volver la red, debe subir solo.
- **Esfuerzo / dependencias:** M · no antes de la #1 (la cola debe respetar el candado nuevo, sea cual sea).

### #7 · [Replantear] Cruzar ADR-0160 (terminales) con el candado de dinero antes de pegarlo en producción
- **Dónde:** `supabase/migrations/20260922200000_terminales_por_tienda.sql:310-311` (reemplaza `fn_es_lider()` por `fn_puede_gestionar_caja()` dentro de `cerrar_caja` y `registrar_movimiento_caja`); `docs/adr/0160-cuentas-terminal-por-tienda.md`.
- **Por qué en este puesto:** es la única pieza nueva desde el análisis anterior que toca directamente el candado de dinero de esta pantalla, y su propio ADR ya se detiene antes de pegarse — pero nadie documentó todavía si "terminal de ventas puede hacer un ajuste sin nombre propio" es un riesgo que Felipe ya sopesó junto con el hueco #1, o si se decidió por separado sin verlo.
- **Cómo lo verificas tú:** antes de pegar `20260922200000…sql` en producción, confirmar con Felipe si quiere que un «Ajuste de caja» hecho por la terminal de ventas (sin nombre de colaborador detrás) sea aceptable, o si el ajuste debe seguir exigiendo una persona nombrada aunque el resto de Caja sí lo abra a la terminal.
- **Esfuerzo / dependencias:** decisión, no código · junto con la #1 y la #2 (las tres tocan quién puede mover plata y cómo queda escrito).
- **DECIDÍ:** no proponer una alternativa de código — esto es una pregunta a Felipe, no un defecto a corregir.
- **DESCARTÉ:** *dejar que la migración se pegue sin esta conversación* — el propio ADR-0160 ya se detuvo a propósito; ignorarlo sería saltarse un freno que su autor puso a propósito.
- **SE ROMPE SI:** se pega la migración, una terminal de ventas hace tres «ajustes» distintos en una semana en la misma tienda, y al revisar nadie puede saber si fue la misma persona las tres veces o tres colaboradoras distintas usando la misma clave.

### #8 · [Corregir] «Compra de insumos» sale de la lista de egresos de Caja (contradice R-04)
- **Dónde:** `caja-panel-reglas.ts:276` (`MOTIVOS_EGRESO`).
- **Por qué en este puesto:** sin cambios desde el 21-sep — R-04 (`docs/datos/15-COMO-OPERA-CAYLA.md:43`) dice que el efectivo para pagar proveedores sale de reservas bancarias, nunca del cajón de una tienda, y el motivo sigue ofreciéndose a cualquier colaborador.
- **Cómo lo verificas tú:** el desplegable de motivo en egreso ya no debe ofrecer «Compra de insumos» (o, si Felipe decide que sí aplica en algún caso real, debe quedar documentado en un ADR que reconcilie con R-04).
- **Esfuerzo / dependencias:** S · junto con la #1.

### #9 · [Mejorar] Piel restante del modal: desplegable propio, tope de 2 rojos en el tablero
- **Dónde:** `MovimientoCajaModal.tsx:125-140` (`<select>` nativo); `Modal.tsx:122-123` (`focus:border-rojo` en cualquier campo); recuento de rojo en `CajaAbiertaPanel.tsx:238,265,307,162` y `Graficos.tsx:69`.
- **Por qué al final:** no daña dinero ni datos; ya se cerró la parte más visible (verde/rojo del tipo, sin spinner). Queda el desplegable nativo y el tope de rojo del tablero completo.
- **Cómo lo verificas tú:** el campo Motivo usa un componente propio de la paleta CAYLA, no el `<select>` del sistema operativo; contar los usos de `--color-rojo` visibles a la vez en `/caja` con caja abierta ≤ 2.
- **Esfuerzo / dependencias:** S · bajo valor / opcional.

### #10 · [Eliminar] Código sin uso
- **Dónde:** `components/CajaGraficos.tsx` (huérfano, confirmado hoy: sin referencias fuera de sí mismo), `senalCaja` y `tendenciaCierres7Dias` (`caja-panel-reglas.ts:257-263,193-222`, sin uso fuera del propio archivo).
- **Por qué al final:** antes de agregar algo se borra, pero no cambia lo que ve la colaboradora. Sin cambios desde el 21-sep — nadie lo tocó.
- **Cómo lo verificas tú:** `pnpm lint` y `pnpm typecheck` en verde tras borrar; ninguna pantalla cambia.
- **Esfuerzo / dependencias:** S · bajo valor / opcional.

### #11 · [Corregir] Verificar en producción si `cajas_update` permite reescribir un cierre ya hecho — *sigue sin correrse*
- **Dónde:** `docs/datos/01-INVARIANTES.md:171` (documenta, sin fecha de verificación nueva desde el 21-sep, que `cajas_update` en producción permite editar cualquier caja de tu sede, cerrada o no, incluidos `monto_cierre_real` y `diferencia`); ninguna migración desde entonces toca esa política (`grep -rn cajas_update supabase/migrations` → vacío) `[código]`.
- **Por qué en este puesto:** si sigue abierto, todo el trabajo de cierre ciego, candado de líder y (cuando se aplique) candado de terminal se puede desarmar con un `update` después de contar — es más grave que cualquier otro hallazgo de esta pantalla y, otra vez, nadie corrió la consulta.
- **Cómo lo verificas tú:** correr D1/D4 de «SQL pendiente» abajo contra producción.
- **Esfuerzo / dependencias:** S, pero es una consulta, no una migración — puede correr hoy mismo.

### #12 · [Mejorar] Reconciliar D-13, ADR-0056 y ADR-0160 en un solo ADR — *bajo valor táctico, alto valor de claridad; no bloquea nada por sí sola*
- **Dónde:** `docs/datos/DECISIONES-2026-09-12.md:72` (D-13), `docs/adr/0056-…md`, `docs/adr/0160-…md`.
- **Por qué al final:** ninguna de las tres decisiones por sí sola bloquea trabajo; lo que hace falta es que quede escrito en un solo lugar «quién puede mover plata sin venta, con o sin terminal» en vez de en tres documentos que se contradicen en parte.
- **Cómo lo verificas tú:** existe un ADR nuevo que cita las tres y dice explícitamente qué reemplaza o aclara de cada una.
- **Esfuerzo / dependencias:** S (solo documentar una decisión ya tomada en pedazos) · se apoya en lo que salga de la #1, #2 y #7.

## 8 · Estrategia alternativa

**Ajuste de caja: dos formas de resolver el mismo problema (el descuadre), sin cambios desde el 21-sep — decisión todavía pendiente.**

| | **A — Ajuste dentro de la caja abierta (hoy)** | **B — El descuadre vive solo en el cierre** |
|---|---|---|
| **Ganas** | El líder (o, tras ADR-0160, la terminal) puede regularizar un faltante conocido a media jornada. | Un solo lugar para el descuadre (principio 4); el historial —ya en tabla— siempre dice cuánto faltó o sobró; nadie puede «dejar la caja cuadrada» antes de contar. |
| **Pagas** | Puede tapar diferencias; con cierre ciego solo sirve si ya se sabe la diferencia por otra vía; y desde ADR-0160 puede quedar sin nombre propio si lo hace la terminal. | Hay que exigir motivo en el cierre y un espacio para explicarlo (`cajas` hoy no tiene esa columna, `[producción, DICCIONARIO-RETAIL.md:1225-1244, sin columna de explicación]`); un líder pierde la opción de «arreglar» a media jornada. |

No la doy por decidida: ADR-0056 la decidió Felipe el 2026-09-15 (líder-only). **Decide Felipe** — y ahora con un dato nuevo: ADR-0160 ya la amplió de hecho a «líder o terminal» en el código, sin que conste que esta pregunta se le haya vuelto a hacer con esa ampliación sobre la mesa.

## 9 · Referentes de ERP y futuro
`[no verificable]`: lo que sigue, de memoria, sin verificar — sin cambios respecto al 21-sep.
- **Tope de retiro por turno y «drop-safe» (buzón):** no le sirve a 3 tiendas con una caja cada una hoy → Futuro.
- **Conteo por denominaciones:** útil cuando el cierre falle seguido; sin evidencia todavía.
- **Doble firma en cierres con diferencia mayor a un umbral:** relacionado con la #2.
- **Cierre de dos personas:** requiere más de un líder por sede; sigue habiendo 9 líderes con alcance global y ninguno fijo (`docs/BACKLOG.md:165`, sin cambio).

## 10 · Fuera de esta pantalla
**Lo mismo que el 21-sep, y sigue sin verificarse un mes después: si `cajas_update` en producción permite reescribir un cierre ya hecho.** `docs/datos/01-INVARIANTES.md:171` sigue documentando que sí, sin fecha de re-verificación posterior a esa. Ninguna migración desde entonces tocó esa política (`[código, grep vacío]`). Si sigue abierto, todo el trabajo de cierre ciego y candado de líder —e incluso lo que se decida sobre el hueco #1— se puede desarmar con un `update` de la API después de contar. Sigue siendo más grave que cualquier hallazgo de esta pantalla y sigue sin verse desde ella. Un mes de trabajo en Caja (turno largo, modal, historial, terminales) y esta pregunta concreta —una sola consulta de solo lectura— nunca se corrió.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:caja]` #1 (re-confirmado) Candado real en `registrar_movimiento_caja` — sigue sin tocar desde el 15-sep; reconciliar D-13/ADR-0056/ADR-0160 — M · migración en producción: confirmar con Felipe
- [ ] `[pantalla:caja]` #2 (re-confirmado) Replantear «Ajuste de caja» (decide Felipe, §8, ahora con el dato de ADR-0160) — decisión + M
- [ ] `[pantalla:caja]` #3 `getResumenCaja`/`fn_ventas_del_dia` miden el turno igual que `cerrar_caja` (excluir anuladas en el resumen; decidir si el turno multi-día se ve completo) — M
- [ ] `[pantalla:caja]` #4 El cierre muestra al líder los movimientos manuales del turno con su autor antes de contar — S
- [ ] `[pantalla:caja]` #5 `/caja/historial`: filtro por sede y paginación real (la diferencia ya se ve) — M
- [ ] `[pantalla:caja]` #6 Movimientos de caja sin internet y chip de sincronía honesto — M
- [ ] `[pantalla:caja]` #7 Antes de pegar `20260922200000_terminales_por_tienda.sql`: confirmar con Felipe si un ajuste de caja hecho por la terminal de ventas (sin nombre propio) es aceptable — decisión, no código
- [ ] `[pantalla:caja]` #8 Quitar «Compra de insumos» de los egresos de Caja (contradice R-04) o documentar la excepción — S
- [ ] `[pantalla:caja]` #9 Piel: desplegable propio del modal, tope de 2 rojos en el tablero — S (bajo valor)
- [ ] `[pantalla:caja]` #10 Borrar `CajaGraficos.tsx`, `senalCaja`, `tendenciaCierres7Dias` — S (bajo valor)
- [ ] `[pantalla:caja]` #11 Fuera de la pantalla: correr D1/D4 y confirmar si `cajas_update` permite reescribir un cierre ya hecho — S, un mes pendiente
- [ ] `[pantalla:caja]` #12 Reconciliar D-13, ADR-0056 y ADR-0160 en un ADR único — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Reloj + «Lleva N h» | Hora y duración del turno | bien (ya avisa a las 18 h) | `[código caja-panel-reglas.ts:266-271; CajaAbiertaPanel.tsx:398-409]` |
| Cabecera | Chip «Todo sincronizado» | Cola de ventas offline | ajustar (no cuenta movimientos manuales) | `[código CajaAbiertaPanel.tsx:98-108,474-493]` |
| Cabecera | «+ Ingreso / egreso» | Abre el modal | ajustar (visible para cualquier rol; la base no filtra motivos no-ajuste) | `[código :198-200]` |
| Cabecera | «Cerrar caja» | Cierra con conteo ciego | bien | `[código :204-211; 20260921120000…sql:87]` |
| Tarjetas | Apertura, Ingresos, Egresos | Suman `cajas`/`caja_movimientos` | bien | `[código caja.ts:133-134]` |
| Tarjetas | Ventas efectivo / otro método | Suman `venta_pagos` del turno | ajustar (no excluyen anuladas) | `[código caja.ts:114]` |
| Dona | Métodos de pago | Distribución de ventas de esta caja | bien (ya no dice «HOY» engañosamente) | `[código CajaAbiertaPanel.tsx:276-284]` |
| Ritmo del día | Ventas, ticket, última venta | Resume ventas de hoy | ajustar (fuente sigue siendo solo-hoy en una caja multi-día) | `[código fn_ventas_del_dia, filtro de fecha]` |
| Movimientos recientes | Lista + «Ver todo» | Mezcla ventas y movimientos manuales, hora de Lima | bien | `[código :140-165]` |
| Historial de cierres (tablero) | Barras por cierre | Altura = esperado, color = cuadre | ajustar (sin cifra de diferencia al no pasar el cursor) | `[código Graficos.tsx:53-69]` |
| Historial de cierres (`/caja/historial`) | Tabla completa | Apertura/Esperado/Contado/Diferencia + filtro de prueba | bien (mejoró) | `[código historial/page.tsx:69-106]` |
| Modal | Tipo (Ingreso/Egreso) | Elige tipo | bien (ya no comparten color) | `[código :77-94]` |
| Modal | Monto | Numérico con S/ | bien | `[código :97-119]` |
| Modal | Motivo (desplegable) | Lista filtrada por rol + «Otro» | ajustar (nativo; «Compra de insumos» contradice R-04; la base no verifica el rol para no-ajuste) | `[código :121-161; caja-panel-reglas.ts:276-289]` |
| Modal | Referencia | Nota, obligatoria en Depósito/Otro | bien | `[código :163-175]` |
| Cierre | Conteo ciego + resultado | Muestra esperado/contado/diferencia recién al cerrar | bien | `[código CerrarCajaModalV2.tsx:108-162]` |
| Cierre | Movimientos manuales del turno | — | falta | `[código: CerrarCajaModalV2.tsx completo, sin esa lista]` |
| Código | `CajaGraficos.tsx`, `senalCaja`, `tendenciaCierres7Dias` | — | sobra | `[código, sin referencias]` |

## SQL pendiente
Nadie corrió estas dos consultas desde el análisis anterior (2026-09-21); siguen siendo las de mayor consecuencia de esta pantalla. Formato de `plantilla-sql.md`.

```sql
-- D1. Política de UPDATE de `cajas` en producción (¿permite reescribir un cierre ya hecho?)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'retail' and tablename = 'cajas' and cmd = 'UPDATE';

-- D4 (equivalente). ¿`cajas` tiene un trigger que impida modificar una fila con estado = 'cerrada'?
select tgname, tgrelid::regclass::text as tabla, pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'retail.cajas'::regclass and not tgisinternal;

-- E4. Motivos reales usados en caja_movimientos hasta hoy, por tipo y es_ajuste — para saber si "Otro"/
-- "Retiro de efectivo" ya se usó para montos grandes sin ser líder
select tipo, es_ajuste, motivo, count(*) as veces, max(monto) as monto_max
from retail.caja_movimientos
group by 1, 2, 3
order by monto_max desc;
```

Pega aquí el resultado de D1, D4 y E4 (o dime "sin SQL" y este análisis queda con el mismo hallazgo #11 abierto un mes más).

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo (SQL parcial: solo E7) | 5,0 | 8,0 | — (primer análisis) |
| 2026-09-21 | cierre parcial (rama `claude/caja-mejoras-sin-decision`) | — | — | #2, #3, #6, #10 (nota de la sesión: «#11 solo la parte de "Ingreso" en verde y sin spinner») |
| 2026-09-22 | completo (sin SQL nuevo; reusa `[producción]` del 21-sep y `docs/BACKLOG.md`) | 5,0 (mismo tope: el candado de dinero sigue roto) | 8,0 | Confirmado: #2, #3, #6, #10 siguen cerradas y sin regresión. Nuevas desde entonces: mitad de la vieja #8 (diferencia visible en `/caja/historial`) — la otra mitad (filtro de sede + paginación) sigue abierta como #5 de esta versión. #1, #4, #5(vieja, ajuste), #7(vieja), #9(vieja), #11(vieja, resto), #12(vieja) siguen abiertas, renumeradas arriba. Nuevo hallazgo (no existía el 21-sep): ADR-0160 (terminales) toca directamente el candado de dinero de esta pantalla y aún no está en producción — tarea #7 de esta versión. |
