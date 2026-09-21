# Pantalla — Caja (`/caja`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder de equipo, Tienda TRU (escritorio, 1920 px) · Datos: **sin SQL casi completo** — solo llegó E7 (0 ventas anuladas dentro de cajas). Felipe aclaró que retail aún no opera de verdad y que hay una caja por sede; el resto del bloque A–E quedó sin correr, y todo lo que dependa de él va marcado `[no verificable]`.
> SHA analizado: `553c0ff7` (origin/main; la rama estaba al día, 0 commits de diferencia) — si esos archivos cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/caja/page.tsx` · `components/CajaAbiertaPanel.tsx` · `components/MovimientoCajaModal.tsx` · `components/CerrarCajaModalV2.tsx` · `components/ui/Graficos.tsx` · `lib/caja.ts` · `lib/caja-panel-reglas.ts` · RPC `registrar_movimiento_caja`, `cerrar_caja`, `abrir_caja`, `fn_ventas_del_dia` · tablas `cajas`, `caja_movimientos`, `venta_pagos`
> Otra sesión tocándola: no hoy. `docs/SESIONES-ACTIVAS.md` lista dos sesiones que ya tocaron Caja (`ventas-visual-redesign-240e2b`, rediseño 2026-09-18, y `candado-lider-caja-ajuste`, ADR-0143, ya en `main`). Ninguna aparece abierta sobre el modal de movimientos.

## 0 · Veredicto
Tablero de Caja bien resuelto de piel y con un cierre ciego correcto, pero el modal de Ingreso/Egreso —la única puerta por donde entra o sale plata que no es una venta— quedó abierta a cualquier colaborador: puede registrar un egreso o un ingreso «Otro» de cualquier monto, y el cierre lo tomará como plata esperada. La pantalla además mezcla «turno» con «hoy» (dona «HOY S/3075» sobre un turno de 73 h con 3 ventas listadas) y no avisa de una caja abierta hace tres días.
**Cumple su finalidad:** 5,0/10 (promedio 5,75, con tope 5 por el candado abierto) · **Relevancia:** 8,0/10 — Núcleo

## 1 · Finalidad declarada
"Esta pantalla existe para que quien atiende sepa cuánta plata entró y salió en el turno, registre lo que mueve el efectivo fuera de una venta, y que un líder pueda cerrar el turno contando y viendo si cuadra."
Fuente: `docs/datos/modulos/07-ventas-y-caja.md` (encabezado, «Para qué existe»; **avisa que describe V1**, por eso solo lo uso para la finalidad, no para estados), `docs/adr/0056-*.md` (V2: `cajas` + `caja_movimientos` + `venta_pagos`, cierre = `apertura + ventas_efectivo + Σingresos − Σegresos …`), D-13 y ADR-0143.
¿Coinciden docs y pantalla? **No del todo, y es hallazgo:**
- D-13 (2026-09-12) reserva al líder «registrar gastos y depósitos». ADR-0056 (2026-09-15) decidió aparte que el depósito bancario lo pueda hacer cualquier colaborador. Las dos decisiones están vigentes y se contradicen; la pantalla sigue la segunda.
- ADR-0143 §2 afirma que `registrar_movimiento_caja` «ya pide líder». **Solo lo pide cuando `p_es_ajuste` es verdadero** `[código supabase/migrations/20260915202040_caja_deposito_y_ajuste.sql:61-63]`. Manda el código.

## 2 · Objeción
1. **La puerta del dinero está abierta y el candado de «Ajuste» es decorativo.** Un colaborador ve «+ Ingreso / egreso» `[código CajaAbiertaPanel.tsx:193]` sin filtro de rol, y el modal ni siquiera recibe el rol `[código MovimientoCajaModal.tsx:20]`. La RPC solo exige líder si el propio navegador manda `p_es_ajuste = true` (`…sql:61`); el motivo es texto libre sin lista cerrada (`…sql:73`). Resultado: un colaborador registra un **egreso «Otro» por S/100** o un **ingreso «Otro» por S/100** con `es_ajuste = false`, y hace exactamente lo que el candado dice impedir —mover el esperado sin venta detrás— sin pasar por el candado. El líder cuenta a ciegas, «cuadra», y lo único que queda es el `usuario_id` de una fila que nadie revisa al cerrar. Es el mismo hueco que ADR-0143 cerró para el stock (§1: «inventarse una entrada, salida o ajuste que cuadra un faltante»). Además tampoco hay tope ni chequeo de que el egreso no supere el efectivo disponible (`…sql:58-75`).
2. **La pantalla mezcla «turno» con «hoy».** La dona dice «HOY S/3075» y «Ventas efectivo S/1806», pero «Ritmo del día» cuenta **3 ventas** y «Movimientos recientes» lista tres ventas por S/894 `[visto]`. Las tarjetas suman todo el turno (`getResumenCaja`, `lib/caja.ts:111-147`); la lista y el ritmo salen de `fn_ventas_del_dia`, que solo trae **hoy** `[código migración 20260921103000…sql:86-87]`. Una caja abierta 3 días muestra dos verdades distintas en la misma pantalla.
3. **Una caja abierta hace 73 h no avisa nada** `[visto: «Lleva 73 h 09 min»]`. La cinta simplemente se estira `[código caja-panel-reglas.ts:27-31]`. Es un turno que nadie cerró: el cierre de tres días queda como una sola cifra y el «Historial de cierres» pierde el día a día. El BACKLOG ya lo sabe a medias («quién cierra cuando no hay un líder en la tienda», `docs/BACKLOG.md:67`, decisión de Felipe pendiente).

## 3 · Lo que está bien y no se toca
- **Cierre ciego real:** quien cuenta no ve el esperado; se revela después con la diferencia con signo `[código CerrarCajaModalV2.tsx:108-160; lib/caja.ts:23-29]`. Es el candado que hace útil todo lo demás.
- **Cierre solo para líder, en tres capas:** botón escondido (`CajaAbiertaPanel.tsx:199`, con el texto «La caja la cierra un líder de equipo» en vez de un hueco mudo), `fn_es_lider()` dentro de `cerrar_caja` (`20260921120000…sql:87-89`) y prueba `pruebas:candado-lider` 20/20 `[código, ADR-0143]`.
- **Una sola caja abierta por sede:** índice único parcial `cajas_sede_abierta_unique` `[código docs/datos/01-INVARIANTES.md:77]`; coincide con lo que dijo Felipe (1 caja por sede).
- **`caja_movimientos` solo se escribe por RPC** (solo política SELECT `[producción, DICCIONARIO-RETAIL.md:1252]`) y tiene `monto > 0` y `tipo in (ingreso, egreso)` `[producción, volcado]`. No hay `DELETE`: coherente con «nunca borres».
- **El esperado del cierre es completo:** apertura + ventas efectivo (sin anuladas) + ingresos − egresos − reembolsos + cambios `[código 20260921120000…sql:129-130]`.
- **Ventas anuladas dentro de cajas: 0** `[producción, E7]`, así que la diferencia entre tarjetas y cierre (tarea #4) es latente, no activa.
- **Los movimientos manuales sí aparecen en «Movimientos recientes»** con su motivo, verde/rojo y signo `[código CajaAbiertaPanel.tsx:136-160]`, y el modal usa `<Modal>` (ADR-0136) `[código MovimientoCajaModal.tsx:72]`.
- **Metáfora del reloj y tablero** (cinta de turno, dona con «Ver como tabla», sparklines): coherente con Cambios/Devoluciones `[visto]`, y la tabla alternativa da accesibilidad a la dona.
- **Doble apertura, otra sede y monto negativo** ya tienen prueba en SQL `[código scripts/caja/verificar.sql A1-A5]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6,5 | El tablero es coherente y sobrio, pero el modal rompe reglas propias: «Ingreso» seleccionado sale rojo igual que «Egreso», el desplegable es el nativo del sistema, hay spinner nativo y el rojo del tablero pasa de 4 usos fijos | `[visto capturas 2-5]` `[código MovimientoCajaModal.tsx:83-85; Modal.tsx:121-127]` |
| Lógica de negocio | 4,0 | Movimiento manual sin candado real; ajuste que tapa diferencias antes del cierre; dos decisiones (D-13 / ADR-0056) que se contradicen | `[código …202040.sql:58-75]` `[D-13, ADR-0056]` |
| Arquitectura | 5,5 | Cadena limpia (RLS + RPC security definer), pero `es_ajuste` viene del cliente, hay lecturas por SELECT directo que no comparten reglas con `cerrar_caja` (anuladas) y no hay offline para movimientos | `[código caja.ts:114 vs …120000.sql:109]` |
| Funciones | 6,0 | Existe todo lo esencial; sobra código muerto y «Ajuste» es ambiguo; faltan aviso de turno largo y revisión de movimientos al cerrar | `[código CajaGraficos.tsx huérfano]` |
| Utilidad | 5,5 | Fácil de leer; fácil de equivocarse en el modal (egreso prellenado, motivo prellenado, sin «S/», sin foco en el monto) y confuso el «HOY» del turno | `[visto]` `[código MovimientoCajaModal.tsx:22-24]` |
| Conexión con el ERP | 7,0 | Bien conectada aguas arriba (ventas, devoluciones, cambios) y aguas abajo (cierre, historial); el flujo de compras/proveedores respeta R-04 (no toca la caja) | `[código ADR-0052, 0053, R-04]` |

### Estética (6,5)
(a) Coherencia CAYLA: crema y tinta bien, serif en el título y cifras, esquinas suaves `[visto]`. Rojo: `MAX_ROJO_POR_PANTALLA = 2` (`design-tokens.ts:73`) **no se hace cumplir en /caja** `[código]`; con caja abierta hay barra de meta (`:230`), borde e icono de Egresos (`:257,658`), enlace «Ver historial completo» (`:299`), un rojo por cada egreso listado (`:157`) y barras rojo-profundo por cada cierre descuadrado (`Graficos.tsx:69`): en la captura se cuentan al menos cuatro grupos `[visto]`.
(b) Modal: el botón activo del tipo usa `border-rojo bg-rojo/8 text-rojo` para los dos tipos (`MovimientoCajaModal.tsx:84`); en la captura 4 «Ingreso» está en rojo y contradice el verde con que el propio panel pinta un ingreso (`:157`) `[visto + código]`. Además `focus:border-rojo` pinta rojo cualquier campo enfocado (captura 4, «Referencia») `[código Modal.tsx:122]`.
(c) Universales: el `<select>` nativo (capturas 3 y 5) usa el azul del sistema operativo y el ancho del campo, ajeno a la paleta `[visto]`; el spinner nativo del monto aparece a la vista `[visto captura 2]`; etiquetas de 11 px a `text-tinta/70` (`Modal.tsx:120`) están en el borde del piso de contraste de ADR-0012 `[inferido; no medido]`. El campo Monto no muestra «S/» ni placeholder, y queda vacío sin pista de la unidad `[visto]`.

### Lógica de negocio (4,0)
- **D-13** dice que el líder «registra gastos y depósitos»; **ADR-0056** decidió lo contrario para el depósito; **ADR-0143** dice que `registrar_movimiento_caja` ya pide líder, pero solo lo hace con la marca de ajuste. Ninguna decisión escrita cubre «un colaborador registra un egreso o ingreso “Otro”» `[ninguna decisión escrita cubre esto]`.
- **Ajuste antes del cierre:** el cierre es ciego; el líder no conoce el esperado, así que un «Ajuste (faltante)» hecho antes del cierre solo tiene sentido si ya sabe la diferencia por fuera (por ejemplo, por otra vía de conteo). Y el efecto es tapar la diferencia: el esperado baja, la diferencia final se acerca a cero y la barra del historial sale verde `[código ADR-0056 §4: cerrar_caja suma por tipo, no por motivo]`. Rompe el principio 4 («una sola fuente de verdad»): el descuadre queda escrito en dos sitios, o en ninguno.
- **Referentes** (de memoria, `[no verificable]`): en Shopify POS y Lightspeed existen entradas y salidas de efectivo con motivo, y en Odoo POS «cash in/out»; ninguno, hasta donde recuerdo, deja registrar un ajuste que anule una diferencia futura. **Filtro de escala:** el tope de retiro y el buzón (drop-safe) no le sirven a 3 tiendas hoy → Futuro (§9).
- **Faltante sin dueño:** que 9 líderes tengan alcance global y ningún líder esté fijo a una tienda `[código docs/BACKLOG.md:67]` significa que hoy una caja de sede sin líder presente puede quedar abierta (la de 73 h de la captura, p. ej.).

### Arquitectura (5,5)
- **Cadena:** `page.tsx` → `CajaAbiertaPanel` → `MovimientoCajaModal` → RPC `registrar_movimiento_caja` (security definer, `search_path` fijo) → `caja_movimientos` → RLS SELECT solo. Es la convención del repo `[código]`.
- **Estado imposible que la base no impide:** un egreso mayor que el efectivo disponible (no hay tope ni suma); un motivo `ilike 'ajuste%'` con `es_ajuste = false`; ambos entran. **No hay CHECK ni lista cerrada de motivos** `[código …sql:73; producción sin verificar, E3/E4 sin correr]`.
- **Transacción:** una fila por llamada; sin idempotency key, un doble envío antes de que `setLoading(true)` re-renderice podría duplicar el movimiento (improbable, no imposible) `[código MovimientoCajaModal.tsx:51,164]` `[inferido]`.
- **Concurrencia:** dos personas registrando a la vez en la misma caja son dos filas independientes: sin problema. Cierre y registro simultáneos: `registrar_movimiento_caja` lee `estado` sin `for update` (`…sql:53-64`), así que un movimiento puede colarse justo mientras se cierra `[inferido; ventana de milisegundos, una caja por sede]`.
- **Caída externa:** los movimientos no se encolan; con el internet caído el modal falla con un error traducido y el dato **se pierde** (hay que reescribirlo) `[código MovimientoCajaModal.tsx:53]`. D-49 dice que «la caja no se congela nunca». Se degrada así: la venta sí sobrevive offline, el retiro de efectivo no. Con una caja por sede y movimientos raros, el riesgo es bajo, pero el chip «Todo sincronizado» solo cuenta ventas y no se refresca tras montar `[código CajaAbiertaPanel.tsx:98-104,451-470]`.
- **Volumen:** ~3 filas hoy en `caja_movimientos` `[producción, DICCIONARIO-RETAIL.md:1227]`. Con 3 tiendas y unos 3–5 movimientos por día, unos 4 000 en 3 años: cualquier plan de acceso alcanza; no hay problema de rendimiento.
- **Lentes extra:** **RLS/rol** (el hallazgo central) y **hora de Lima**: `getSeriesVentasCaja` y los movimientos usan `getHours()` del navegador mientras las ventas llegan en hora de Lima `[código caja.ts:295-301; CajaAbiertaPanel.tsx:150-160]`; un navegador con otra zona ordena mal la lista.
- **Divergencia latente:** `getResumenCaja` no filtra `ventas.estado` (`lib/caja.ts:114`) y `cerrar_caja` sí (`20260921120000…sql:109`); hoy 0 anuladas `[producción, E7]`, pero el primer anulado mostrará una tarjeta más alta que el esperado.

### Funciones (6,0)
- **Existen y funcionan:** abrir caja, movimiento manual, cerrar con conteo ciego, ver todos los movimientos, detalle de venta, historial de cierres, dona y tabla.
- **Fantasma / sin uso:** `CajaGraficos.tsx` completo, `senalCaja` y `tendenciaCierres7Dias` no se usan en el panel `[código, mapa]`.
- **Faltan:** aviso de turno largo; mostrar al líder, antes de contar, los movimientos manuales del turno con su autor; referencia obligatoria en «Otro» y en depósito.
- **Sobran / ambiguas:** «Ajuste de caja (faltante/sobrante)» tal como está (ver §8).

### Utilidad (5,5)
Escenario: una colaboradora nueva, 8 p. m., la líder no está y hay que sacar S/200 para pagar un flete.
1. Abre «+ Ingreso / egreso»: el tipo ya está en «Egreso» y el motivo en «Retiro de efectivo» (prellenados) `[visto]`.
2. El foco cae en el botón «Ingreso», no en el monto `[código: sin autoFocus]`.
3. Escribe 200; no hay «S/» y el giro del spinner lo altera con la rueda del mouse `[visto]`.
4. Ve «Ajuste de caja (faltante)» entre las opciones. Si lo elige, la base la rechaza con «Solo un líder de equipo puede registrar un ajuste» solo después de enviar `[código]`. Si elige «Otro» y escribe «flete», **pasa sin pedirle voucher ni nota** y cuadra el cierre `[código]`.
Se equivoca en (2)–(4) por diseño, no por falta de capacitación. Dato del escenario que no se puede saber: si el flete se paga de la caja o de las reservas bancarias (R-04 dice que un pago a proveedor **no** sale de la caja de una tienda); el modal ofrece «Compra de insumos» como egreso rápido y eso contradice R-04 `[código MovimientoCajaModal.tsx:17; R-04]`, o sea una colaboradora puede registrar en caja lo que el negocio decidió no pagar de caja.

### Conexión con el ERP (7,0)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Es el arqueo del día: la diferencia de cierre alimenta el historial y la decisión de confiar en una sede; sin datos limpios de ingresos y egresos ese número no significa nada. |
| Dinero y stock que toca | ×1 | 9 | Todo el efectivo de la sede pasa por aquí; no toca stock. |
| Frecuencia y personas que la usan | ×1 | 8 | Se abre todos los días en cada sede (hoy retail aún no opera de verdad: 3 filas en `caja_movimientos`). |
| Qué se detiene si falla | ×1 | 7 | Las ventas no se frenan (D-49), pero sin cierre no hay arqueo ni depósito del día. |

Relevancia = (2·8 + 9 + 8 + 7) / 5 = **8,0** → **Núcleo**.

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas` y `venta_pagos` (efectivo vs otros métodos), devoluciones (`aprobar_devolucion`, reembolso en efectivo — ADR-0052), cambios (ADR-0053), apertura de caja (`abrir_caja`).
- **Aguas abajo:** `cerrar_caja` (esperado = f(apertura, ventas, ingresos, egresos, reembolsos, cambios)), `/caja/historial`, `getDetalleCierre`. El futuro «adelanto de apartado» (BACKLOG:96, Fase 2 de ADR-0141) será un ingreso de caja: se apoyará en la misma RPC y por eso su candado debe quedar bien antes.
- **Pájaro dueño y vecinos:** COLIBRÍ (Ventas y caja, `07-ventas-y-caja.md`, «lo lleva: libre»); vecinos: Cambios, Devoluciones, Facturación (comparten `fn_ventas_del_dia`). No verifiqué `AVIARIO.md` `[no verificable]`.
- **Externos, y qué pasa si caen:** SUNAT/Nubefact no participan en la caja. Sin internet: las ventas se encolan y **los movimientos no** (se degrada así: la venta se salva, el retiro no); el cierre con red bloquea si hay efectivo encolado sin subir (ADR-0092).

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Que la base decida quién puede mover el efectivo y qué es un ajuste
- **Dónde:** nueva migración sobre `registrar_movimiento_caja` (`supabase/migrations/20260915202040_caja_deposito_y_ajuste.sql:43-83` como cuerpo de partida); columna `caja_movimientos.motivo` y `es_ajuste`.
- **Por qué en este puesto:** es dinero. Hoy un colaborador mueve el esperado con «Otro» y el candado de ajuste se esquiva con `p_es_ajuste = false`. Sin esto, el cierre ciego no protege de nada que pase antes de cerrar. Es el mismo hueco que ADR-0143 cerró para stock.
- **Cómo lo verificas tú:** desde la consola del navegador con sesión de colaborador, llamar `registrar_movimiento_caja` con motivo «Otro» y monto 50 → debe responder error de líder; con «Retiro de efectivo» y sin referencia → debe pedir referencia; con `p_es_ajuste=false` y motivo «Ajuste de caja (faltante)» → debe tratarlo como ajuste y exigir líder. Prueba nueva `scripts/pruebas/` (como `candado_lider_caja_y_ajuste.mjs`): falla sin la migración, pasa con ella.
- **Esfuerzo / dependencias:** M · **la migración toca producción: confirmar con Felipe antes de pegarla** (regla de CLAUDE.md, cambio de esquema en producción; pegar con prefijo `retail.`). Antes, decidir con Felipe la tabla de permisos de abajo (DECIDÍ) y **reconciliar D-13 con ADR-0056 en un ADR**.
- **DECIDÍ (propuesta, la confirma Felipe):** vocabulario cerrado de motivos en la RPC (no en el navegador). Para colaborador: «Retiro de efectivo», «Depósito bancario» y «Compra de insumos» **con referencia obligatoria**; «Ajuste» y «Otro» solo líder. `es_ajuste` se deduce del motivo en el servidor (se elimina el parámetro o se ignora).
- **DESCARTÉ:** *solo esconder opciones en el modal* — cualquier sesión llama la RPC desde la consola (ADR-0143 §5); *todo movimiento solo líder* — una colaboradora sola a las 8 p. m. no podría sacar un depósito del día, y el negocio se frena en el mostrador.
- **SE ROMPE SI:** un colaborador se lleva S/300 de la caja, registra «Otro» egreso S/300 a las 7:50 p. m., la líder cuenta a ciegas al cerrar, cuadra a cero y el hurto queda como una fila con motivo «flete» que nadie mira.

### #2 · [Corregir] El modal debe conocer el rol y mostrar solo lo que la base aceptará
- **Dónde:** `MovimientoCajaModal.tsx:20` (recibir `personaRol`), listas `MOTIVOS_*` (`:17-18`), llamada desde `CajaAbiertaPanel.tsx:193,333-351`.
- **Por qué en este puesto:** hoy la colaboradora descubre el rechazo después de enviar. Es rápido y quita el error por diseño; sin #1 solo es escenografía (por eso va después).
- **Cómo lo verificas tú:** entrar como colaboradora → el desplegable no ofrece «Ajuste» ni «Otro»; como líder → ofrece todo.
- **Esfuerzo / dependencias:** S · no antes de la #1 (para que el modal refleje las reglas reales).

### #3 · [Corregir] Avisar de una caja abierta de días anteriores y decidir quién la cierra
- **Dónde:** `caja-panel-reglas.ts:19-31` (`duracionAbierta`, `escalaTurno`), `CajaAbiertaPanel.tsx:393-444` (`RelojDeCaja`); decisión pendiente `docs/BACKLOG.md:67`.
- **Por qué en este puesto:** la captura muestra una caja de **73 h** sin una sola alerta `[visto]`. Un turno de tres días hace inútiles la dona, el ritmo y la lista, y un cierre por tres días no dice en qué día apareció la diferencia. Con una caja por sede, cada día sin cerrar es un arqueo perdido.
- **Cómo lo verificas tú:** abrir una caja con `abierta_en` de hace más de 18 h (local o datos de prueba) → aparece una franja «Esta caja lleva N h abierta: ciérrala con un líder» (a quien no es líder, «avisa a un líder»); el reloj cambia de estado.
- **Esfuerzo / dependencias:** S (aviso) + una decisión de Felipe: ¿umbral y quién cierra si no hay líder?

### #4 · [Corregir] Que tarjetas, dona, lista y ritmo midan lo mismo: el turno
- **Dónde:** dona con texto «HOY» (`CajaAbiertaPanel.tsx`, componente de dona), `fn_ventas_del_dia` (`20260921103000…sql:86-87`, solo hoy), `getResumenCaja` (`lib/caja.ts:114`, sin filtro de anuladas) frente a `cerrar_caja` (`20260921120000…sql:109`).
- **Por qué en este puesto:** en la captura la dona dice S/3075 «HOY» y la lista muestra 3 ventas por S/894 `[visto]`: dos cifras de la misma caja que no cuadran a simple vista. Y el día que se anule una venta, las tarjetas y el esperado del cierre dejarán de coincidir (hoy 0 anuladas, `[producción, E7]`).
- **Cómo lo verificas tú:** con una caja abierta desde ayer, la dona debe decir «Este turno» y la lista debe incluir las ventas de los dos días (o el texto «Solo hoy» junto al título de la lista); anular una venta de prueba → la tarjeta «Ventas efectivo» baja igual que el esperado.
- **Esfuerzo / dependencias:** M · toca una consulta de lectura, no un esquema de producción.

### #5 · [Replantear] «Ajuste de caja (faltante/sobrante)»: ¿debe existir dentro de la caja abierta?
- **Dónde:** `MovimientoCajaModal.tsx:10-11,17-18,36`; `caja_movimientos.es_ajuste`; `cerrar_caja`.
- **Por qué en este puesto:** es la función que más puede «arreglar» un cuadre sin dejar rastro del descuadre. Su único trabajo aquí es pedirle a Felipe que decida (ver §8).
- **Cómo lo verificas tú:** Felipe elige A o B en §8; después, con B, cerrar una caja con diferencia y ver la diferencia en el historial (barra roja, con el motivo escrito).
- **Esfuerzo / dependencias:** decisión primero; implementación M. Se decide junto con la #1.
- **DECIDÍ (propuesta):** que el descuadre viva **solo** en el cierre (`cajas.diferencia`), con motivo obligatorio y sin ajuste previo.
- **DESCARTÉ:** *mantener el ajuste tal como está* — sigue tapando la diferencia; *quitarlo sin reemplazo* — un sobrante/faltante real necesita quedar explicado, no invisible.
- **SE ROMPE SI:** un líder registra «Ajuste (faltante) S/40» a las 6 p. m. «para dejarla cuadrada», cierra a las 8 p. m. con S/0 de diferencia, y en el historial la barra sale verde: nadie se entera de que faltaron S/40 esa semana.

### #6 · [Mejorar] Flujo del modal: sin valores prellenados, foco en el monto, referencia cuando importa
- **Dónde:** `MovimientoCajaModal.tsx:22-24,47-50,93-107,147-158`.
- **Por qué en este puesto:** la misma raíz apareció en `docs/pantallas/colaboradores.md` #1 (el alta abre con valores ya elegidos): dos pantallas con «alta que no pregunta»; una tercera lo convertiría en tarea raíz. Aquí el tipo «Egreso» y el motivo «Retiro de efectivo» vienen elegidos, y con solo escribir un monto se registra.
- **Cómo lo verificas tú:** abrir el modal → el foco está en el monto, hay «S/» y placeholder «0.00», el motivo dice «Elige un motivo» y «Registrar» no se activa hasta elegirlo; con «Depósito bancario» u «Otro», Referencia se vuelve obligatoria.
- **Esfuerzo / dependencias:** S · junto con #2.

### #7 · [Mejorar] Que el líder vea los movimientos manuales del turno antes de contar
- **Dónde:** `CerrarCajaModalV2.tsx:165-203` (antes del campo de conteo); datos ya cargados en `CajaAbiertaPanel.tsx` (`todosLosEventos`).
- **Por qué en este puesto:** el conteo es ciego respecto del esperado, pero **no** tiene por qué serlo respecto de quién retiró qué. Ver «Egreso S/200 · flete · [colaborador]» antes de contar es lo que hace útil el `usuario_id` que hoy nadie mira. No rompe el conteo ciego (no muestra el total esperado).
- **Cómo lo verificas tú:** cerrar caja como líder con dos movimientos manuales → aparecen listados con motivo, referencia y autor, y el esperado sigue oculto.
- **Esfuerzo / dependencias:** S · no antes de la #1.

### #8 · [Mejorar] Historial de cierres: mostrar la diferencia, no solo el esperado
- **Dónde:** `CajaAbiertaPanel.tsx:284-302,169` (altura = `montoCierreSistema`), `Graficos.tsx:53-69`, `app/(app)/caja/historial/page.tsx:28-60`.
- **Por qué en este puesto:** la altura de la barra es lo que el sistema esperaba, no lo contado, y el color rojo-profundo es la única señal de descuadre. En la captura hay **dos cierres el miércoles 16** (S/60 y S/0) `[visto]`, pero no se ve cuál cuadró ni por cuánto. `/caja/historial` además trae todas las sedes sin paginar, tope silencioso de 60, y usa un `<h1>` propio en vez de `EncabezadoPagina` (`page.tsx:40`).
- **Cómo lo verificas tú:** pasar el cursor por una barra muestra «esperado / contado / diferencia»; `/caja/historial` filtra por sede y pagina.
- **Esfuerzo / dependencias:** M.

### #9 · [Conectar] Movimientos sin internet y un chip «Todo sincronizado» que no mienta
- **Dónde:** `MovimientoCajaModal.tsx:53`, `lib/ventas-offline.ts` (cola de ventas), `CajaAbiertaPanel.tsx:98-104,451-470`.
- **Por qué en este puesto:** D-49 dice que la caja no se congela nunca; hoy un retiro sin internet se pierde y el chip solo cuenta ventas y no se refresca. Con una caja por sede y movimientos raros es riesgo bajo, pero es una promesa del negocio.
- **Cómo lo verificas tú:** apagar la red, registrar un retiro → queda pendiente y el chip dice «1 movimiento sin sincronizar»; al volver la red, se sube y el chip vuelve a «Todo sincronizado».
- **Esfuerzo / dependencias:** M · no antes de la #1 (la cola debe respetar el nuevo candado).

### #10 · [Corregir] Hora de Lima en lista y series
- **Dónde:** `CajaAbiertaPanel.tsx:150-160` (`d.getHours()`), `lib/caja.ts:295-301` (`getSeriesVentasCaja`); hay ayudante `diaYHoraLima` en `fechas-lima.ts`.
- **Por qué en este puesto:** solo se nota si el navegador no está en Lima; hoy los mostradores sí lo están.
- **Cómo lo verificas tú:** cambiar la zona horaria del navegador → el orden de «Movimientos recientes» no cambia.
- **Esfuerzo / dependencias:** S · *bajo valor hoy, útil cuando salga la sede de otro país o el móvil de un líder viajando.*

### #11 · [Mejorar] Piel: tipo del modal, desplegable y rojo del tablero — *bajo valor / opcional*
- **Dónde:** `MovimientoCajaModal.tsx:83-85` (rojo para ambos tipos); `Modal.tsx:121-127`; `ui/Modal` `campoSelect`; `Graficos.tsx:69`.
- **Por qué al final:** no daña dinero ni datos; hace que «Ingreso» deje de parecer un error y respeta el tope de 2 rojos. Ingreso en verde (el token ya existe en el panel), Egreso en rojo; un selector propio en vez del nativo; ocultar el spinner del monto.
- **Cómo lo verificas tú:** captura del modal con Ingreso seleccionado → no sale en rojo; contar rojos en el tablero ≤ 2.
- **Esfuerzo / dependencias:** S · junto con #6.

### #12 · [Eliminar] Código sin uso y agujeros de prueba — *bajo valor / opcional*
- **Dónde:** `components/CajaGraficos.tsx` (huérfano, 3 componentes), `senalCaja` y `tendenciaCierres7Dias` (`caja-panel-reglas.ts:177,193`); prueba nueva para `getResumenCaja` y `MovimientoCajaModal`.
- **Por qué al final:** antes de agregar algo, se borra; pero no cambia lo que ve la colaboradora. La cobertura de #1 ya va con esa migración.
- **Cómo lo verificas tú:** `pnpm lint` y `pnpm typecheck` verdes tras borrar; ninguna pantalla cambia.
- **Esfuerzo / dependencias:** S · después de #8 (que puede reusar `tendenciaCierres7Dias`).

## 8 · Estrategia alternativa

**Ajuste de caja: dos formas de resolver el mismo problema (el descuadre).**

| | **A — Ajuste dentro de la caja abierta (hoy)** | **B — El descuadre vive solo en el cierre** |
|---|---|---|
| **Ganas** | El líder puede regularizar un faltante conocido a media jornada; ya construido y con candado de líder (ADR-0056). | Un solo lugar para el descuadre (principio 4); el historial siempre dice cuánto faltó o sobró; no hay forma de «dejar la caja cuadrada» antes de contar. |
| **Pagas** | Puede tapar diferencias; con cierre ciego solo sirve si el líder ya sabe la diferencia por otra vía; el historial verde puede mentir. | Hay que exigir motivo en el cierre y un espacio para explicar una diferencia (hoy `cajas` no tiene columna de explicación `[producción sin verificar]`); un líder pierde la opción de «arreglar» a media jornada. |

No la doy por decidida: ADR-0056 la decidió Felipe el 2026-09-15 (líder-only). **Decide Felipe.**

## 9 · Referentes de ERP y futuro
`[no verificable]`: lo que sigue viene de memoria, no lo verifiqué.
- **Tope de retiro por turno y «drop-safe» (buzón):** el efectivo de más se saca de la caja y se registra en una bolsa numerada. No le sirve a 3 tiendas con una caja cada una hoy → Futuro.
- **Conteo por denominaciones (billetes y monedas):** ayuda a detectar errores de conteo. Filtro de escala: útil cuando el cierre falle seguido; hoy no hay evidencia (E6 sin correr).
- **Doble firma en cierres con diferencia mayor a un umbral:** relacionado con la #5.
- **Cierre de dos personas:** requiere más de un líder por sede; hoy 9 líderes con alcance global, ninguno fijo.

## 10 · Fuera de esta pantalla
**Verificar si la política `cajas_update` de producción todavía permite reescribir un cierre ya hecho.** `docs/datos/01-INVARIANTES.md:171` dice que permite editar cualquier caja de tu sede, cerrada o no, incluidos el monto contado y la diferencia. Es el tercero de los tres números que Felipe mira primero (D-52). Ninguna de mis consultas D1 y D4 se ejecutó, así que `[no verificable]`; el mapa del código vio solo `select` en local, pero eso es local. Si sigue abierto, todo el trabajo de cierre ciego, candado de líder y ajuste se puede desarmar con un `update` de la API después de contar. Es más grave que cualquier hallazgo de esta pantalla y no se ve desde ella. Segunda pista, más chica: **ADR-0143 §2 afirma algo que el código contradice** (que `registrar_movimiento_caja` ya pide líder) y quedó escrito como verdad.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:caja]` #1 Candado real en `registrar_movimiento_caja` (vocabulario cerrado, `es_ajuste` del servidor, referencia obligatoria; reconciliar D-13 con ADR-0056 en un ADR) — M · migración en producción: confirmar con Felipe
- [ ] `[pantalla:caja]` #2 El modal de movimientos conoce el rol y esconde lo que la base rechazará — S
- [ ] `[pantalla:caja]` #3 Aviso de caja abierta de días anteriores + decisión de quién la cierra sin líder — S
- [ ] `[pantalla:caja]` #4 Tarjetas, dona, lista y ritmo miden el turno; `getResumenCaja` excluye anuladas — M
- [ ] `[pantalla:caja]` #5 Replantear «Ajuste de caja» (decide Felipe, §8) — decisión + M
- [ ] `[pantalla:caja]` #6 Modal sin valores prellenados, foco en monto, «S/», referencia obligatoria en depósito y «Otro» — S
- [ ] `[pantalla:caja]` #7 El cierre muestra al líder los movimientos manuales del turno con su autor — S
- [ ] `[pantalla:caja]` #8 Historial de cierres con la diferencia visible y `/caja/historial` con filtro y paginación — M
- [ ] `[pantalla:caja]` #9 Movimientos de caja sin internet y chip de sincronía honesto — M
- [ ] `[pantalla:caja]` #10 Hora de Lima en lista de movimientos y series por hora — S
- [ ] `[pantalla:caja]` #11 Piel del modal: tipo verde/rojo, desplegable propio, sin spinner; tope de 2 rojos — S (bajo valor)
- [ ] `[pantalla:caja]` #12 Borrar `CajaGraficos.tsx` y funciones sin uso; pruebas de `getResumenCaja` y del modal — S (bajo valor)
- [ ] `[pantalla:caja]` Fuera de la pantalla: correr D1/D4 y confirmar en producción que `cajas_update` no permite reescribir un cierre — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título, «Turno de [colaborador] · Líder de equipo» | Dice quién tiene el turno y con qué rol | bien | `[visto]` |
| Cabecera | Reloj «02:23» + «Lleva 73 h 09 min» | Hora y duración del turno | ajustar (sin alerta a 73 h) | `[visto]` `[código caja-panel-reglas.ts:19-31]` |
| Cabecera | Chip «Todo sincronizado» | Cola de ventas offline | ajustar (no cuenta movimientos, no se refresca) | `[código CajaAbiertaPanel.tsx:98-104,451-470]` |
| Cabecera | «+ Ingreso / egreso» | Abre el modal | ajustar (visible para cualquier rol) | `[código :193]` |
| Cabecera | «Cerrar caja» | Cierra con conteo ciego | bien | `[código :199; …120000.sql:87]` |
| Tarjetas | Apertura, Ingresos, Egresos | Suman `cajas`/`caja_movimientos` | bien | `[código caja.ts:83,133-134]` |
| Tarjetas | Ventas efectivo / otro método (con sparkline) | Suman `venta_pagos` del turno | ajustar (no excluyen anuladas) | `[código caja.ts:114]` |
| Dona | «S/3075 HOY» | Distribución por método | ajustar (es el turno, no hoy) | `[visto]` |
| Dona | «Ver como tabla» | Cambia a tabla accesible | bien | `[código :666-703]` |
| Ritmo del día | 3 ventas · S/298 · 3 h 41 min | Resume ventas de hoy | ajustar (solo hoy, no el turno) | `[visto]` `[código migración …103000:86-87]` |
| Movimientos recientes | Lista de 8 + «Ver todo» | Mezcla ventas y movimientos manuales | ajustar (hora local del navegador) | `[código :136-160]` |
| Historial de cierres | Barras por cierre, «Ver historial completo» | Muestra esperado del sistema | ajustar (falta la diferencia; 2 cierres el mismo día) | `[visto]` `[código :169,294]` |
| Modal | Tipo (Ingreso / Egreso) | Elige tipo | ajustar (ambos en rojo, prellenado en Egreso) | `[visto capturas 2 y 4]` |
| Modal | Monto | Numérico | ajustar (sin S/, spinner, sin foco) | `[visto captura 2]` |
| Modal | Motivo (desplegable) | Lista cerrada + «Otro» | ajustar (nativo; ajuste/otro para colaborador; «Compra de insumos» vs R-04) | `[visto capturas 3 y 5]` |
| Modal | Referencia (opcional) | Nota | ajustar (obligatoria en depósito y «Otro») | `[código :147-158]` |
| Código | `CajaGraficos.tsx`, `senalCaja` | — | sobra | `[código, mapa]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo (SQL parcial: solo E7) | 5,0 | 8,0 | — (primer análisis) |
