# Pantalla — Devoluciones (`/devoluciones`)

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder de equipo, Tienda TRU (mostrador/tablet) · Datos: real parcial — reutiliza el SQL de producción del análisis anterior (A2, A3, C1, C2, D2, D3, D4, D5, E5; **fecha 2026-09-21**, dentro de la ventana de 7 días que pide este re-análisis) más lectura fresca del diccionario generado (`DICCIONARIO-RETAIL.md`, volcado del **2026-09-21**) y de BACKLOG/BITACORA del **2026-09-22**. No corrí SQL nuevo (regla del Paso 2: no bloquear el flujo); lo que necesitaría una consulta nueva de verdad queda en «SQL pendiente» al final.
> SHA analizado: `88457700` (= `origin/main`); esta rama (`claude/pantalla-ventas-module-bf9b1b`) está **10 commits detrás de `origin/main`** — leí todo el código y los docs con `git show origin/main:<ruta>`, nunca del árbol local. Si `page.tsx`, `DevolucionesFlujo.tsx`, `DevolucionesPanel.tsx`, `DevolucionesPendientes.tsx`, `DevolucionesVentas.tsx`, `lib/devoluciones*.ts` o las RPC de devoluciones cambian después de `88457700`, este análisis queda vencido.
> Archivos: `apps/web/app/(app)/devoluciones/page.tsx` · `components/DevolucionesPanel.tsx` · `DevolucionesFlujo.tsx` · `DevolucionesPendientes.tsx` · `DevolucionesVentas.tsx` · `BuscadorVentas.tsx` · `ComprasAgrupadas.tsx` · `lib/devoluciones.ts` · `lib/devoluciones-reglas.ts` · `lib/cambios-reglas.ts` · `lib/ventas-v2.ts` · RPC `crear_devolucion`, `aprobar_devolucion`, `rechazar_devolucion`, `anular_venta`, `resolver_prenda_danada` · tablas `devoluciones`, `devolucion_items`, `prendas_danadas`, `cambios` · migración sin aplicar `20260922180000_devoluciones_motivo_estructurado.sql`
> Otra sesión tocándola: **no, hoy — pero la propia `docs/SESIONES-ACTIVAS.md` está desactualizada en el punto que el encargo de este análisis me pidió declarar.** Ese documento lista (fila «Activas ahora», `claude/interface-recommendations-8ce365`, «Desde: 2026-09-18») el rediseño de `/devoluciones` con el modelo guiado ADR-0122 como **«Commits locales, sin push»** — la señal que me pidieron avisar como riesgo de choque con `aa5f07f6` (fusionado a `main`, PR #288). **Verificado: ese riesgo no existe.** El rediseño ADR-0122/0125 de esa fila **ya es el código vigente en `origin/main`** — `page.tsx:10` lo dice explícito («rediseño 2026-09-18, mismo modelo que Cambios, ADR-0125/0122») y los cambios de esta semana (2026-09-21 y 2026-09-22, incluido `aa5f07f6`) se construyeron encima de él. La fila hermana (`ventas-visual-redesign-240e2b`, misma fecha) nombra `CambiosLista.tsx` y `CambioFormV2.tsx`: **esos archivos ya no existen en `origin/main`** (verificado: `git show origin/main:apps/web/components/CambiosLista.tsx` → no existe). Dos filas de la tabla que el equipo usa para evitar choques describen un estado de hace cuatro días que el propio repo ya superó dos veces. No es un hallazgo de Devoluciones, pero si alguien la lee hoy y por eso evita tocar «piezas compartidas» pensando que hay trabajo sin subir, está coordinando contra un fantasma (ver §10).
> Datos personales: cualquier nombre, DNI o correo de la captura o del SQL reusado va como `[clienta]`, `[colaborador]`, `[DNI]`.

## 0 · Veredicto

Un flujo bien dibujado sobre una base que sigue sin los candados que le cierran el paso al dinero: la misma devolución que se autoaprobó en 5,6 segundos hace cuatro días se seguiría autoaprobando hoy, porque nadie tocó `aprobar_devolucion` ni el permiso de escritura directa esta semana — a pesar de que sí se tocó todo lo demás alrededor (motivo estructurado, chips de plazo, tres pantallas vecinas). Lo que sí se arregló, se arregló bien y con evidencia de verificación real: la tarjeta por venta (tarea #8 de la vez pasada) y el motivo con lista cerrada (D-79) están construidos, probados y documentados — el segundo, a un paso de producción.
**Cumple su finalidad:** 5/10 (promedio 5,3, con tope 5 por defectos que pueden dañar dinero) · **Relevancia:** 6,2/10 — Soporte

## 1 · Finalidad declarada

"Esta pantalla existe para registrar la devolución de una clienta contra su compra y dejarla pendiente; un líder la aprueba, y solo ahí se mueve el stock, se emite la nota de crédito y se decide el reembolso."
Fuente: `docs/ARQUITECTURA.md:375-384`, ADR-0122 y `docs/datos/15-COMO-OPERA-CAYLA.md` §9 (R-37, R-38, R-39). No sale de la captura ni de la pantalla misma.
¿Docs y pantalla coinciden? **Sigue sin coincidir, en el mismo punto que la vez pasada.** R-38 dice que el plazo de 15 días «lo aplica cualquiera en caja» y que «no hace falta autorización de la líder». El flujo de hoy sigue exigiendo un líder para **toda** devolución (`DevolucionesFlujo.tsx:508-512`, «Revisar y aprobar»; `DevolucionesPendientes.tsx:181-188`, solo `esLider` ve botones). Nada de lo que cambió esta semana (motivo estructurado, tarjeta por venta) toca esta contradicción. Manda R-38 (es del negocio); el diseño actual sigue siendo una decisión reversible, sin decidir.

## 2 · Objeción

**1. Cuatro tablas de dinero y stock se siguen pudiendo escribir directo desde el navegador — verificado de nuevo hoy, sin cambios.** El diccionario generado del volcado de producción (`DICCIONARIO-RETAIL.md`, leído el 2026-09-21) muestra `devoluciones_write` y `devolucion_items_write` como políticas `FOR ALL` que solo preguntan `fn_puede_operar_ubicacion(ubicacion_id)` — nada sobre el verbo ni sobre quién ejecuta `[producción, DICCIONARIO-RETAIL.md:1384-1385,1413-1414]`. La política RLS limita la fila, no el privilegio de tabla; el privilegio de tabla (`INSERT/UPDATE/DELETE` de `authenticated` sobre `devoluciones`, `devolucion_items`, `prendas_danadas`, `cambios`) fue el D4 del análisis anterior y nada en las **17 migraciones que se escribieron esta misma semana** (`20260922100000` a `20260922234100`, listadas en `supabase/migrations/`) toca un `revoke` sobre estas cuatro tablas — verificado con `grep -rn "revoke.*devoluciones" supabase/migrations/` → sin resultados. Con la misma sesión que puede llamar `crear_devolucion`, una colaboradora puede `update devoluciones set estado='aprobada', reembolso_monto=..., reembolso_metodo='efectivo'` desde la consola del navegador, y `cerrar_caja` lo resta del efectivo esperado como si un líder lo hubiera aprobado. **No lo ejecuté** `[inferido]` de política + ausencia de `revoke`, mismo criterio que ya cerró ADR-0143 para `cerrar_caja` y que esta semana cerró `20260922100000_colaboradores_endurecimiento.sql` para `colaboradores` (confirmado: existe un `revoke` para esa tabla, no para estas cuatro — dos pantallas con el mismo defecto, ver §10).

**2. `aprobar_devolucion` sigue sin comparar quién registró con quien aprueba.** El cuerpo vigente (`supabase/migrations/20260918070000_devolver_proveedor_entra_a_cuarentena.sql:108-113`) solo valida `fn_es_lider()`; no hay ningún `if d.solicitado_por = v_persona`. Es la misma función que dejó autoaprobarse la única devolución real de producción en 5,6 segundos el 2026-09-16 `[producción, C1, dato del análisis del 2026-09-21, sin cambios desde entonces porque la función no se tocó]`. Con 9 líderes de alcance global (ADR-0143), sobra quien apruebe lo ajeno, y hoy nada obliga a que sea otra persona.

**3. La nota de crédito se sigue calculando sobre el precio de lista, no sobre lo que pagó la clienta.** Misma línea que el análisis anterior citó, sin tocar: `v_total_devuelto` sale de `sum(vi.precio_unitario * di.cantidad)` (`20260918070000…:166`), mientras la pantalla ya muestra el neto con descuento (`devoluciones-reglas.ts:143-145`, `valorPagado`). Con una línea sin descuento da igual (el único caso real en producción, `[producción, C2]`); con descuento, se acredita de más ante SUNAT.

**4. El tope de reembolso sigue siendo un aviso de pantalla, no un candado de base.** `revisarAprobacion` (`devoluciones-reglas.ts:288-302`) devuelve `aviso`, no `bloqueo`, cuando el monto excede lo pagado (línea 298-300); `aprobar_devolucion` acepta cualquier `p_reembolso_monto numeric` sin comparar contra el valor de la devolución (`20260918070000…:86,153-156`). Un líder puede aprobar S/999 de reembolso sobre una devolución de S/79 con solo un texto ámbar de por medio, sin que nada lo frene.

Lo nuevo esta semana no toca ninguno de los cuatro — motivo estructurado y tarjeta por venta son mejoras reales, pero ninguna es un candado de dinero. Trade-off igual de honesto que hace cuatro días: nada de esto ha causado un daño porque hoy hay 1 devolución y ~18-23 ventas en 15 días `[producción, E5 y BACKLOG del 2026-09-21/22 sobre comprobantes]`. Es pre-vuelo. La ventana para arreglarlo barato (una migración chica) se sigue cerrando sin que nadie la toque.

## 3 · Lo que está bien y no se toca

- **La tarjeta por venta en «Actividad reciente» — cerrada de verdad, con evidencia real de navegador.** `DevolucionesVentas.tsx` ahora tiene un modo `resumen` (`resumen?: boolean`, línea 20 del componente) que en vez de una fila por prenda pinta una sola tarjeta con prendas·importe, un chip de plazo calculado **una sola vez** (`estadoPlazoDevolucion`, `devoluciones-reglas.ts:105-115`, no por línea) y una nota si la venta ya tuvo cambio o devolución (`actividadPreviaVenta`, `cambios-reglas.ts:182-204`, compartida con Cambios). El botón entra al paso «Prendas» sin nada marcado (`onIniciar(primera, false)`, `DevolucionesVentas.tsx:143-146`). BACKLOG (2026-09-22) registra que se probó en el navegador con datos reales: venta con 1 prenda ya cambiada → sin botón; venta con 2 de 3 devueltas → botón, paso «Prendas» bloquea solo las procesadas. Esto cierra, con evidencia, la tarea #8 del análisis del 2026-09-21 («un chip y una acción por boleta, no por línea»).
- **Motivo estructurado (D-79/ADR-0158) — construido con el criterio correcto, un paso de producción.** `devoluciones.motivo_codigo` con `check` de seis valores, candado en `crear_devolucion` (`p_motivo_codigo text`, sin default) en vez de solo en la pantalla — principio 2 de este repo, respetado (`20260922180000…:101-118`). La migración documenta explícitamente por qué **no** unificó el vocabulario con `cambios.motivo` (perdería la distinción talla_chica/talla_grande que hoy orienta al Taller) y por qué **no** se usa para rankear asesoras (prohibición explícita de Felipe, sin ningún `group by` sobre colaboradora en el cambio). Objeción bien manejada, no un olvido.
- **Registrar y aprobar siguen siendo dos tiempos, y registrar sigue sin mover nada** — `crear_devolucion` no toca `movimientos` `[código 20260922180000…:101-149]`.
- **`aprobar_devolucion` sigue todo-o-nada**: bloquea la fila (`for update`, línea 108), mueve el stock, y si falta la serie de nota de crédito frena la aprobación entera con mensaje claro en vez de aprobar a medias (`20260918070000…:178-180`).
- **Esquema con cinturón sin cambios ni regresión**: `CHECK` de estado, de coherencia `pendiente ⇔ aprobado_en nulo`, `UNIQUE (devolucion_id, venta_item_id)` `[producción, DICCIONARIO-RETAIL.md:1375-1376, 1401]`; venta anulada no se puede devolver (`devolucion_items_venta_no_anulada`, sin tocar).
- **`nota_venta` ya se contempla en la lectura de pendientes** — `getDevolucionesPendientes` ahora incluye `"nota_venta"` en los tipos de comprobante que busca (`lib/devoluciones.ts:76`), adelantándose a la nueva tercera opción de comprobante del Punto de Venta (`20260922224300_nota_de_venta.sql`, D-164): sin este ajuste, una devolución sobre una venta con nota de venta se habría visto como «Venta sin comprobante» por error. Detalle chico, bien pensado.
- **Ergonomía del flujo, sin regresión**: buscador único con atajo «/», stepper con foco por paso, Escape retrocede, doble clic frenado (`enviandoAhora`), panel de impacto que dice la verdad («al registrarla, la caja no se mueve»).

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | La tarjeta-resumen quitó el ruido de 30+ chips/botones idénticos; persisten el checkbox de 16 px y el botón rojo con monto | `[código DevolucionesVentas.tsx]` · `[código DevolucionesFlujo.tsx:288-292,483]` |
| Lógica de negocio | 4,5 | Motivo ya estructurado (código, aún no en base); R-38/R-37 y NC sin descuento siguen sin resolver | `[código]` · `[producción]` |
| Arquitectura | 4,0 | `crear_devolucion` reescrita esta semana y AÚN sin token, sin `for update`, sin cruce con `cambios`, sin candado de sede | `[código 20260922180000…:118-149]` |
| Funciones | 5,5 | Motivo estructurado ya es función real (falta pegar); «Sin comprobante» sigue siendo fantasma; sigue sin vale ni historial de resueltas | `[código]` |
| Utilidad | 5,0 | Sin cambios: la colaboradora sigue sin poder decirle a la clienta qué recibe | `[inferido, mismo recorrido de la vez pasada]` |
| Conexión con el ERP | 6,5 | `nota_venta` ya integrado en la lectura; el resto de la cadena, sin cambios | `[código lib/devoluciones.ts:76]` |

**Cumple su finalidad = 5,3 → tope 5** (los cuatro defectos de dinero de §2 siguen intactos).

### Estética (7,5)
- **(a) Coherencia con CAYLA.** Sigue siendo hermana de Cambios y Caja: papel, serif, timeline por día `[código, sin cambios visuales de fondo]`. El cambio real: donde antes «Actividad reciente» repetía 30+ chips «Dentro del plazo» y 30+ botones negros (uno por prenda), ahora muestra **una tarjeta por venta** con un solo chip de plazo y un solo botón `[código DevolucionesVentas.tsx, función `ResumenCompraVenta`]`. Con ~18-23 ventas en 15 días, eso es ~18-23 elementos en vez de ~30-45: menos ruido, pero **el rojo del tope `MAX_ROJO_POR_PANTALLA = 2` (`design-tokens.ts:73`) sigue sin hacerse cumplir**: cada venta fuera de plazo pinta su chip en rojo (`estadoPlazoDevolucion`, tono `rojo`), así que con varias boletas vencidas a la vista se repite el mismo patrón de antes, solo que menos denso.
- **(b) Marca y tono.** Sin cambios: vocabulario correcto, frases honestas («Al registrarla, la caja no se mueve»).
- **(c) Universales.** Checkbox nativo de 16 px sin cambiar (`h-4 w-4`, `DevolucionesFlujo.tsx:292`; mitigado porque toda la fila es `<label>`). Botón rojo con el monto de la devolución (`BotonRojo … monto={soles(valorTotal)}`, `DevolucionesFlujo.tsx:483`) sigue sugiriendo que sale plata, cuando el panel de al lado dice lo contrario. Con el nuevo modo resumen, las tarjetas de «Actividad reciente» tienen alturas más parejas (un resumen de una línea cada una) — se redujo el hueco de masonry irregular que se veía en la captura anterior.

### Lógica de negocio (4,5)
- **Contra R-38** sin cambios: toda devolución sigue pasando por un líder.
- **Contra R-37** sin cambios: la entrada sigue siendo «Iniciar devolución»; «¿Le sirve otra talla o color?» sigue como una franja al pie del paso 2 (`DevolucionesFlujo.tsx:327-340`), no antes de elegir devolver.
- **Motivo, ahora resuelto en código — D-79/ADR-0158.** `MOTIVOS_DEVOLUCION` (`devoluciones-reglas.ts:27-34`) trae seis valores con lista cerrada, y `crear_devolucion` los exige con `check` en la base (`20260922180000…:117-119`). **Sin aplicar en producción** — confirmado por el propio archivo de la migración («este agente NO lo aplica») y por el diccionario del 2026-09-21, que aún muestra `devoluciones` con 13 columnas, sin `motivo_codigo` `[producción, DICCIONARIO-RETAIL.md:1353-1366]`. BACKLOG (2026-09-22) lo confirma: «Sin aplicar en producción… espera revisión de Felipe».
- **Nota de crédito sin descuento**, sin cambios (§2.3).
- **Reembolso sin tope real en el servidor**, sin cambios (§2.4).
- **Plazo**: sigue solo avisando; `estadoPlazoDevolucion` (nueva función, `devoluciones-reglas.ts:105-115`) es el mismo cálculo que antes, ahora factorizado para reusarse en la tarjeta-resumen — no cambia que el servidor no lo valida.
- **Referentes (de memoria, no verificado):** sin cambios respecto al análisis anterior — Shopify POS/Lightspeed resuelven la devolución contra la venta original con destino y reembolso explícitos en el momento (ver §9).

### Arquitectura (4,0)
- **Cadena, sin cambios estructurales**: `page.tsx` → `DevolucionesPanel` → `DevolucionesFlujo`/`DevolucionesPendientes` → RPC directas desde el navegador → tablas, RLS y triggers.
- **`crear_devolucion` se reescribió esta semana (drop+create) y el rediseño NO tocó ninguno de los huecos que ya estaban señalados** — verificado línea por línea contra el cuerpo nuevo (`20260922180000…:101-149`): sigue sin `p_token` (comparar con `registrar_cambio`, que sí lo tiene desde `20260919000100`), sigue con `select * into v_venta_item … from venta_items` **sin `for update`** (línea 133), sigue sin mirar `cambios` al calcular disponibilidad, y sigue validando solo el permiso de quien opera (`fn_puede_operar_ubicacion(p_ubicacion_id)`) sin comparar `p_ubicacion_id` con la sede real de la venta. Es la prueba más concreta de que el candado de dinero no es «lo próximo en la lista»: se tocó la función completa para otra cosa y estos huecos ni se mencionaron en la cabecera de la migración (que sí documenta con detalle otras decisiones).
- **Concurrencia**: sin cambios — doble aprobación imposible (`for update` en `aprobar_devolucion`), doble registro de la misma línea sigue sin bloqueo (`select` sin `for update` en `crear_devolucion`, arriba).
- **Caída externa**: sin cambios — la NC se degrada bien («se degrada así, no pierde este dato»); si falta la serie, aprobar se frena entero.
- **Volumen**: sigue sin dato nuevo propio; reuso el marco del análisis anterior (≈130 mil ventas en 3 años, sin problema de índices a esa escala) porque nada cambió en el volumen de esta tabla esta semana.
- **Lente nuevo esta semana**: la migración de `nota_venta` (`20260922224300…sql`) agrega un tercer tipo de comprobante que `getDevolucionesPendientes` ya sabe leer (`lib/devoluciones.ts:76`) — sin esto, una devolución sobre una venta con nota de venta habría mostrado «Venta sin comprobante» de forma incorrecta. Bien anticipado, aunque no lo pedía esta tarea.

### Funciones (5,5)
- **Existen y funcionan**: todo lo del análisis anterior, más el motivo con chips de un toque (`MOTIVOS_DEVOLUCION`, seis botones en el paso 3) y la tarjeta-resumen de Actividad reciente.
- **Casi cerrada, no fantasma pero tampoco completa**: el motivo estructurado tiene código, pruebas (`pnpm pruebas:crear-devolucion-motivo`, 8/8 según BACKLOG) y verificación en navegador — pero la columna no existe en producción todavía, así que hoy `p_motivo_codigo` fallaría contra la base real si se desplegara el front sin la migración (la propia migración lo advierte: «SE ROMPE SI se despliega el código nuevo… ANTES que esta migración»).
- **Fantasma, sin cambios**: «Sin comprobante» (`BuscadorVentas.tsx:144-148`) sigue solo activando un filtro, no un flujo distinto.
- **Faltan, sin cambios**: decirle a la clienta qué recibe; vale o saldo a favor (R-37); historial de resueltas.

### Utilidad (5,0)
Mismo escenario que el análisis anterior (clienta que vuelve a los 8 días con una prenda que no le queda), y el mismo punto de fricción: al terminar el paso 4 la colaboradora sigue sin poder decirle a la clienta qué recibe — el reembolso lo decide un líder después. La tarjeta-resumen de «Actividad reciente» sí mejora un paso previo (encontrar la venta es más rápido, menos texto que leer), pero no toca el momento en que la clienta pregunta «¿y mi plata?» `[inferido, mismo recorrido]`.

### Conexión con el ERP (6,5)
Ver §6. Sube medio punto por `nota_venta`, que amplía correctamente qué cuenta como «venta con comprobante» sin romper nada existente.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6,5 | El motivo estructurado (D-79) ya está construido para alimentar «calce por prenda» con el Taller — sube el indirecto; sigue sin historial de resueltas y sin `motivo_codigo` en producción todavía |
| Dinero y stock que toca | ×1 | 8 | Reembolso, entradas de stock, prendas dañadas, nota de crédito ante SUNAT — sin cambios |
| Frecuencia y personas que la usan | ×1 | 5 | Sigue siendo baja frente al volumen de ventas (≈1 devolución por cada ~18-23 ventas en 15 días, `[producción, E5, 2026-09-21]`) |
| Qué se detiene si falla | ×1 | 5 | La venta sigue; se detiene la atención posventa y, si falla mal, cuadra mal la caja — sin cambios |

Relevancia = (2·6,5 + 8 + 5 + 5) / 5 = **6,2** → **Soporte**.

## 6 · Conexión con el ERP

- **Aguas arriba:** `ventas`/`venta_items`, `comprobantes` (ahora también `nota_venta`, `lib/devoluciones.ts:76`), `cajas`, `variantes`/`productos`, `personas`, `cambios`.
- **Aguas abajo:** `movimientos` → `stock`; `prendas_danadas` → cuarentena; `cerrar_caja`; `comprobantes` (nota de crédito) → Facturación/SUNAT.
- **Pájaro dueño y vecinos:** Ventas y caja (`docs/datos/modulos/07`), con Facturación (08) e Inventario (05) como vecinos; no reverifiqué `AVIARIO.md` línea por línea `[no verificable aquí]`.
- **Externos, y qué pasa si caen:** SUNAT/Nubefact solo en la NC, transmitida aparte de la aprobación — sin cambios.
- **Cifras de cabecera:** siguen contando **aprobaciones**, no registros (`getEstadisticasDevoluciones`, `lib/devoluciones.ts:143-169`); lo nuevo es que «Por aprobar (N)» **sí es visible hoy**, como título de sección propio (`DevolucionesPendientes.tsx:46-47`) — no está en la fila de cifras de la cabecera (`page.tsx:33-39`), pero tampoco está escondido como sugería el análisis anterior. Matiza, no cierra, la tarea #7 vieja.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Cerrar la escritura directa sobre las tablas de devoluciones
- **Dónde:** nueva migración `revoke insert, update, delete, truncate on retail.devoluciones, retail.devolucion_items, retail.prendas_danadas, retail.cambios from authenticated, anon;` (precedente esta misma semana: `20260922100000_colaboradores_endurecimiento.sql`, que hizo justo esto para `colaboradores`). Las RPC son `security definer` con dueño `postgres`, no dependen del privilegio.
- **Por qué en este puesto:** es plata. Verificado de nuevo hoy (§2.1): nada de lo tocado esta semana lo cerró. Sin esto, las tareas #2-#4 son decorativas.
- **Cómo lo verificas tú:** con una sesión de **integrante** en la consola del navegador, `supabase.from('devoluciones').update({estado:'aprobada'}).eq('id', …)` debe devolver `42501 permission denied`; después, registrar, aprobar, rechazar una devolución y hacer un cambio deben seguir funcionando igual.
- **Esfuerzo / dependencias:** S. Cambio de esquema en producción → lo confirma Felipe.

### #2 · Corregir — `crear_devolucion`: los candados que le siguen faltando
- **Dónde:** `crear_devolucion` (hoy en `20260922180000…:101-149`, ya con `drop`+`create` reciente — la próxima migración parte de este cuerpo, no del de `0003_funciones.sql`). (a) `p_token uuid` + índice único (como `cambios_token_cliente_key`); (b) `select … for update` sobre las `venta_items` implicadas (línea 133); (c) sumar `cambios` al cálculo de disponibilidad; (d) exigir `p_ubicacion_id = ventas.ubicacion_id` o registrar la sede de reingreso como decisión explícita.
- **Por qué en este puesto:** la función se volvió a tocar esta semana para el motivo estructurado y ninguno de estos cuatro huecos se mencionó ni se cerró — es la evidencia más directa de que nadie los está tratando como urgentes mientras sí se atiende todo lo demás alrededor.
- **Cómo lo verificas tú:** (1) llamar `crear_devolucion` dos veces con el mismo `p_token` → misma devolución, no dos; (2) dos llamadas simultáneas sobre la misma línea → una falla; (3) una línea con cambio hecho → «ya se cambió»; (4) una venta de TRU registrada desde AQP → error.
- **Esfuerzo / dependencias:** M. No antes de la #1. Coordinar con quien toque `registrar_cambio` (mismo patrón, `cambios-reglas.ts`).

### #3 · Corregir — `aprobar_devolucion`: quien registra no aprueba, y el reembolso tiene tope real
- **Dónde:** `aprobar_devolucion` (`20260918070000…:108-113` para el primer candado, `:86,153-156` para el segundo): `if d.solicitado_por = v_persona then raise exception …` (salvo decisión expresa, ver #5); `if p_reembolso_monto > (valor neto de la devolución) then raise exception`.
- **Por qué en este puesto:** la única devolución real de producción se autoaprobó en 5,6 s hace una semana y la función no se ha tocado desde entonces — sigue exactamente igual de abierta hoy.
- **Cómo lo verificas tú:** como líder, registra una devolución y trata de aprobarla → error claro; con otra líder, apruébala. Reembolso de S/999 sobre una devolución de S/79 → error, no solo aviso.
- **Esfuerzo / dependencias:** S. **Decisión de Felipe primero:** ¿qué pasa si en una tienda solo hay una líder ese día? No antes de la #1.

### #4 · Corregir — Nota de crédito por lo que la clienta pagó, no por el precio de lista
- **Dónde:** `aprobar_devolucion`, cálculo de `v_total_devuelto` (`20260918070000…:166`): debe ser `(precio_unitario − coalesce(descuento_unitario,0)) × cantidad`, igual que ya calcula la pantalla (`devoluciones-reglas.ts:143-145`).
- **Por qué en este puesto:** es la única discrepancia entre lo que la pantalla promete y lo que se declara a SUNAT; sin cambios desde el análisis anterior porque nadie la tocó.
- **Cómo lo verificas tú:** vende una prenda de S/149.90 con S/15 de descuento, devuélvela con comprobante aceptado y compara el total de la NC con el «Lo que pagó» de la pantalla.
- **Esfuerzo / dependencias:** S. **Confirmar con Felipe y el contador antes de tocar** (plata/tributario). Junto con la #3 en una sola migración.

### #5 · Replantear — Devolución en el acto cuando es rutinaria; líder solo para excepciones
- **Dónde:** `crear_devolucion` (mover a servidor el cálculo de plazo/condición/reembolso) + `DevolucionesFlujo.tsx` (paso 4 y éxito) + `DevolucionesPendientes.tsx` (cola solo con excepciones). Ver §8.
- **Por qué en este puesto:** sigue siendo la fricción de mostrador más grande y la contradicción más directa con R-38. No antes de #1-#3: aprobar por regla sobre una base que se deja escribir directo abre el mismo forado.
- **Cómo lo verificas tú:** cuando esté decidida, una devolución en plazo, impecable y sin reembolso en efectivo queda resuelta al terminar el paso 4, con el stock ya en el piso.
- **Esfuerzo / dependencias:** L. No antes de #1, #2 y #3.
- **DECIDÍ (propuesta, no ejecutada):** aprobar por regla en el servidor lo que R-38 llama rutina (en plazo + impecable + sin plata en efectivo); líder para lo demás.
- **DESCARTÉ:** dejar todo pendiente como hoy — exige a una líder presente por cada devolución de S/79 sin que R-38 lo pida, y descartar el plazo por completo — hoy nada lo valida, perderlo sería ir hacia atrás.
- **SE ROMPE SI:** una colaboradora marca «impecable» una prenda con mancha (el `itemInicial()` de `DevolucionesFlujo.tsx:65-67` ya la marca «vendible» por defecto hoy) y la clienta se va con su valor: la prenda vuelve al piso sin revisión. Mitiga la cuarentena obligatoria para «defecto»; «impecable» sigue autodeclarado.

### #6 · Corregir — Pegar en producción `devoluciones.motivo_codigo` y verificar con clic real
- **Dónde:** `supabase/migrations/20260922180000_devoluciones_motivo_estructurado.sql`, ya construida, probada (`pnpm pruebas:crear-devolucion-motivo`, 8/8 según BACKLOG) y verificada en el navegador con un servidor propio. Solo falta pegarla en producción con el prefijo `retail.` (regla de CLAUDE.md) y confirmar el orden de despliegue que la propia migración exige (base primero, front después — la migración lo advierte en su sección «SE ROMPE SI»).
- **Por qué en este puesto:** es lo más cerca de terminado de toda la lista — el trabajo difícil ya está hecho y verificado; dejarlo sin pegar es la única razón por la que Devoluciones sigue sin el dato que D-79 pidió, mientras Cambios ya lo tiene en producción desde el 2026-09-19.
- **Cómo lo verificas tú:** después de pegarla, `select motivo_codigo, count(*) from retail.devoluciones group by 1` (con datos nuevos) da categorías limpias; registrar una devolución en el navegador de producción con el front ya desplegado no falla con «could not find function».
- **Esfuerzo / dependencias:** S. Necesita el OK de Felipe para pegar en producción (regla de CLAUDE.md sobre cambios de esquema en producción); desplegar la migración ANTES que el front que ya la usa.

### #7 · Mejorar — R-37: el cambio primero, a la vista
- **Dónde:** `ComprasAgrupadas.tsx` (fila de acción: «Cambiar» junto a «Devolver»), `DevolucionesFlujo.tsx:327-340` (franja al pie del paso 2), `ResumenCompraVenta` en `DevolucionesVentas.tsx` (hoy solo ofrece «Iniciar devolución», ninguna opción de cambio desde la tarjeta-resumen nueva).
- **Por qué en este puesto:** el negocio dice que la devolución es el último recurso y la pantalla — incluida la tarjeta-resumen que se construyó esta semana — lo sigue sin mostrar antes de entrar al flujo de devolver.
- **Cómo lo verificas tú:** en «Actividad reciente», la tarjeta de una venta con talla disponible en otro color muestra la opción de cambio sin tener que entrar primero a «Iniciar devolución».
- **Esfuerzo / dependencias:** M. Coordinar con quien toque el mismo componente en Cambios.

### #8 · Mejorar — Que las cifras de cabecera digan la verdad, y avisar el tope de 30
- **Dónde:** `page.tsx:33-39` (rótulo «Devoluciones hoy» → «Aprobadas hoy»; «Valor devuelto» → «Valor devuelto este mes»); `lib/ventas-v2.ts:75,275` (`LIMITE_ACTIVIDAD = 30`, sin aviso cuando se recorta); `DevolucionesPanel.tsx` (avisar «Mostrando las 30 más recientes de N»).
- **Por qué en este puesto:** «Por aprobar (N)» ya es visible como sección (matiza esta tarea, no la cierra); el resto —rótulos que dicen «hoy»/«mes» pero cuentan aprobaciones, y un tope de 30 que se recorta en silencio— sigue igual que hace una semana.
- **Cómo lo verificas tú:** con más de 30 boletas en 15 días, la lista dice cuántas hay en total; los rótulos de la cabecera dicen «Aprobadas» en vez de sugerir registros.
- **Esfuerzo / dependencias:** S. Ninguna.

### #9 · Mejorar — Vale o saldo a favor de la clienta (R-37)
- **Dónde:** decisión de negocio primero (¿el «vale» es una nota de crédito de SUNAT o un saldo interno?), después tabla y RPC nuevas, y una tercera opción en «¿Se le reembolsa algo?» (`DevolucionesPendientes.tsx:200-206`).
- **Por qué en este puesto:** R-37 lo nombra como segunda opción; sin él, una aprobación «sin reembolso» deja el valor de la devolución sin dueño en ningún registro.
- **Cómo lo verificas tú:** aprobar una devolución eligiendo «Vale» deja un saldo consultable de esa clienta.
- **Esfuerzo / dependencias:** L. No antes de la #5 y de una decisión de Felipe.

### #10 · Mejorar — Pulido de jerarquía y accesibilidad
- **Dónde:** `DevolucionesFlujo.tsx:483` (botón rojo con monto en Confirmación — mismo criterio que Caja: reservar el rojo para lo irreversible, mover el monto a texto); `DevolucionesFlujo.tsx:288-292` (checkbox de 16 px → control con área táctil de 44); `DevolucionesFlujo.tsx:65-67` («Impecable» preseleccionado por defecto, sin cambio); `DevolucionesPendientes.tsx:103-117` (`rechazar()` no llama `avisar.exito` — a diferencia de `aprobar()`, línea 94-98 — quien rechaza no recibe confirmación de que se guardó).
- **Por qué en este puesto:** cada uno es pequeño, pero juntos siguen dejando el «¿le doy plata?» en el botón rojo y el rechazo sin señal de éxito, exactamente como hace una semana.
- **Cómo lo verificas tú:** rechazar una devolución muestra un aviso de éxito igual que aprobarla; el botón final de Confirmación ya no se lee como salida de dinero.
- **Esfuerzo / dependencias:** S. Ninguna.

### #11 · Mejorar — Verificar el flujo completo con datos reales, de punta a punta
- **Dónde:** ninguna línea de código — es una verificación manual pendiente. BACKLOG (2026-09-22) lo deja explícito: «Verificar con clic real `/devoluciones` con datos reales: el panel oculto del navegador no hidrata las páginas del menú. Falta registrar una devolución de punta a punta, aprobarla y ver la nota de crédito en Facturación.»
- **Por qué en este puesto:** todo lo construido esta semana (tarjeta-resumen, motivo estructurado) se probó con servidores propios y datos de prueba, nunca con el flujo real completo en producción o en un entorno equivalente. Antes de confiar en cualquiera de las tareas de arriba, alguien tiene que ver la cadena entera funcionar con ojos humanos.
- **Cómo lo verificas tú:** registrar una devolución real (o de práctica) de principio a fin: buscar la venta, elegir prenda, motivo, confirmar, aprobar como líder, y confirmar que la nota de crédito aparece en Facturación lista para transmitir.
- **Esfuerzo / dependencias:** S. Ninguna — es la más barata de las 12 y una de las que más confianza da.

### #12 · Eliminar/fusionar/conectar — *bajo valor / opcional*: rótulos honestos y DNI enmascarado
- **Dónde:** `BuscadorVentas.tsx:144-148` («Sin comprobante» → «Ventas sin comprobante»; «Escanear prenda» → «Escanear (lector)»), datos de `comprobante` en `DevolucionesPendientes.tsx` (DNI como `••••4223` si en algún punto se muestra completo).
- **Por qué en este puesto (bajo valor):** sin cambios respecto al análisis anterior — sigue sin haber evidencia de que esto cause un error real hoy.
- **Cómo lo verificas tú:** el chip dice lo que hace; ningún dato personal completo queda visible fuera de quien tiene permiso de sede.
- **Esfuerzo / dependencias:** S. Ninguna.

## 8 · Estrategia alternativa

Nace de la #5 y decide Felipe; no cambia el orden de las 12. Sin cambios respecto al análisis anterior porque nada de lo construido esta semana tocó esta decisión.

**A · Como está, con candados (#1–#4).** Ganas: cambio pequeño y seguro. Pagas: cada devolución pide una líder presente y la cola de «Por aprobar» se llena de rutina que se aprueba en segundos.

**B · Regla en el servidor: la rutina se resuelve en el mostrador.** En plazo + impecable + sin reembolso en efectivo → `crear_devolucion` la aprueba en el acto; fuera de plazo, con defecto, o con reembolso en efectivo → queda pendiente para un líder. Ganas: cumple R-38, la clienta sale resuelta, la cola de líder solo tiene lo que de verdad necesita ojos. Pagas: migración mayor de `crear_devolucion`, el plazo deja de vivir solo en TS, «impecable» sigue autodeclarado (riesgo de stock, no de caja).

**C · Igual que B, pero «impecable» lo confirma una segunda persona con un toque.** Ganas: cubre el riesgo de B sin cola aparte. Pagas: sigue necesitando una segunda persona en hora pico.

Mi recomendación sigue siendo **B**, después de #1–#3: el negocio ya lo dijo (R-38) y una aprobación que siempre se da en 5 segundos no controla nada. Decide Felipe.

## 9 · Referentes de ERP y futuro

`[no verificable]`: viene de memoria, sin confirmar contra los productos. Sin cambios respecto al análisis anterior.
- **Shopify POS / Lightspeed:** devolución contra la venta original, con destino del stock y medio de reembolso o crédito elegidos en el mismo momento. Es el modelo de #5.
- **Odoo / NetSuite:** retorno con estado de la prenda y ubicación de reingreso. CAYLA ya lo hace con cuarentena.
- **Futuro, no cuenta entre las 12:** cámara real para «Escanear prenda»; nota de crédito transmitida en línea desde esta pantalla; portal de la clienta; cola offline de devoluciones; analítica de tasa de devolución por producto (necesita #9 de la lista de tareas). **Novedad de esta semana que ya adelanta parte de este terreno:** `nota_venta` (D-164) es, dentro de CAYLA, un documento interno sin IGV — un paso conceptualmente cercano al «recibo sin fiscalizar» que algunos POS ofrecen para ventas al contado; no se pidió para esta tarea, pero vale la pena que el reporte futuro de devoluciones lo contemple como un tercer tipo de comprobante desde el diseño, no como un parche después.

## 10 · Fuera de esta pantalla

**El candado que falta en Devoluciones no es un caso aislado: ya es un patrón confirmado en dos análisis independientes de este mismo repo, y esta semana se cerró en una tabla vecina pero no en esta.** `docs/pantallas/colaboradores.md` encontró el mismo defecto (escritura directa abierta sobre una tabla que solo debería tocarse por RPC) y esta semana se resolvió con `20260922100000_colaboradores_endurecimiento.sql` — un `revoke` real, verificado. El análisis anterior de Devoluciones (2026-09-21) encontró exactamente el mismo patrón sobre `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios`, y en los siete días que pasaron —con 17 migraciones nuevas tocando casi todo el resto del repo, incluida la propia `crear_devolucion`— nadie lo cerró aquí. Dos pantallas con el mismo defecto real y una plantilla de arreglo ya probada (la de `colaboradores`, esta misma semana) es la señal más fuerte posible de que esto ya no es una tarea por pantalla: es una tarea de una sola migración que revise **todo** `retail` de una vez —

```sql
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'retail' and grantee = 'authenticated'
  and privilege_type in ('INSERT','UPDATE','DELETE')
group by 1 order by 1;
```

— y cierre cada tabla que salga y que solo se escriba por RPC, con la misma verificación que ya usó `colaboradores` esta semana. Es más grave que cualquier otro hallazgo de esta pantalla porque no se ve desde ninguna pantalla sola: se ve recién al comparar dos auditorías separadas por una semana.

## 11 · Líneas propuestas para BACKLOG.md

- [ ] `[pantalla:devoluciones]` #1 Revocar INSERT/UPDATE/DELETE de `devoluciones`, `devolucion_items`, `prendas_danadas`, `cambios` a `authenticated` (migración) — S
- [ ] `[pantalla:devoluciones]` #2 `crear_devolucion` v3: token de idempotencia, `for update`, cruce con `cambios`, sede de la venta — M
- [ ] `[pantalla:devoluciones]` #3 `aprobar_devolucion`: quien registra no aprueba; tope de reembolso real — S
- [ ] `[pantalla:devoluciones]` #4 Nota de crédito por el neto pagado (descuento) — S (confirmar con contador)
- [ ] `[pantalla:devoluciones]` #5 Decidir la estrategia alternativa B: devolución rutinaria en el acto (R-38) — L
- [ ] `[pantalla:devoluciones]` #6 Pegar en producción `devoluciones.motivo_codigo` (D-79/ADR-0158) y verificar con clic real — S
- [ ] `[pantalla:devoluciones]` #7 «Cambiar» a la vista antes de «Devolver», también en la tarjeta-resumen (R-37) — M
- [ ] `[pantalla:devoluciones]` #8 Rótulos de cabecera honestos y aviso del tope de 30 en la lista — S
- [ ] `[pantalla:devoluciones]` #9 Vale o saldo a favor de la clienta (R-37) — L
- [ ] `[pantalla:devoluciones]` #10 Pulido: botón rojo, táctil, aviso al rechazar, «Impecable» preseleccionado — S
- [ ] `[pantalla:devoluciones]` #11 Verificar el flujo completo (registrar → aprobar → NC en Facturación) con datos reales — S
- [ ] `[pantalla:devoluciones]` #12 (bajo valor) Rótulos honestos de «Sin comprobante»/«Escanear» y DNI enmascarado — S
- [ ] `[pantalla:devoluciones]` RAÍZ Barrido de escritura directa para `authenticated` en todo `retail` (ver §10; ya hay plantilla probada en `colaboradores` esta semana) — M
- [ ] `[proceso]` `docs/SESIONES-ACTIVAS.md` tiene filas de 2026-09-18/19 («Activas ahora») que describen trabajo ya fusionado o superado (`interface-recommendations-8ce365`, `ventas-visual-redesign-240e2b`: `CambiosLista.tsx`/`CambioFormV2.tsx` ya no existen) — moverlas a «Cerradas hoy» o borrarlas evita que una sesión futura evite «tocar piezas compartidas» por un choque que ya no existe — S

## SQL pendiente

No hace falta SQL nuevo para las tareas #1-#4, #8, #12: la evidencia de código (grep de `revoke`, lectura de los cuerpos de `crear_devolucion`/`aprobar_devolucion`) ya es concluyente y el volcado del 2026-09-21 confirma el estado de las políticas. Lo único que valdría la pena, si Felipe quiere confirmar el volumen exacto siete días después del análisis anterior:

```sql
-- 1. Devoluciones y ventas de los últimos 15 días, para refrescar E5 (Relevancia, frecuencia)
select
  (select count(*) from retail.devoluciones where created_at > now() - interval '15 days') as devoluciones_15d,
  (select count(*) from retail.ventas where created_at > now() - interval '15 days' and estado <> 'anulada') as ventas_15d;

-- 2. Confirmar de nuevo, hoy, que ninguna devolución quedó aprobada sin movimiento asociado
-- (E3 del análisis anterior nunca llegó)
select di.id, di.condicion, di.movimiento_id
from retail.devolucion_items di
join retail.devoluciones d on d.id = di.devolucion_id
where d.estado = 'aprobada' and di.movimiento_id is null;
```

Pega aquí el resultado de las dos consultas (o dime "sin SQL" y el análisis queda como está, con lo del 2026-09-21 reusado y marcado como tal).

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto (bien / ajustar / sobra / falta) | Evidencia |
|---|---|---|---|---|
| Cabecera | Cifras (hoy / mes / valor) | Cuenta aprobaciones y su valor pagado | ajustar (rótulos siguen sin decir «aprobadas») | `[código page.tsx:33-39, lib/devoluciones.ts:143-169]` |
| Iniciar | Buscador único + atajo «/» | Busca boleta, DNI, clienta, prenda, código | bien | `[código BuscadorVentas.tsx]` |
| Iniciar | «Sin comprobante» | Solo filtra la lista | ajustar / fantasma (sin cambios) | `[código BuscadorVentas.tsx:144-148]` |
| Por aprobar | Título «Por aprobar (N)» | Cuenta pendientes reales, visible como sección | bien (matiza tarea #8 vieja) | `[código DevolucionesPendientes.tsx:46-47]` |
| Actividad reciente | Tarjeta-resumen por venta (NUEVO) | Prendas·importe, un chip de plazo, actividad previa | **bien — cierra la tarea #8 del análisis anterior** | `[código DevolucionesVentas.tsx, ResumenCompraVenta]` |
| Actividad reciente | Chip de plazo, por venta (antes por línea) | Dice el plazo una sola vez por boleta | bien | `[código devoluciones-reglas.ts:105-115]` |
| Flujo · paso 3 | Motivo con lista cerrada (NUEVO) | Seis chips de un toque, candado en la base (sin pegar) | bien en código; falta producción | `[código devoluciones-reglas.ts:27-34; migración 20260922180000]` |
| Flujo · paso 2 | «¿Le sirve otra talla o color?» | Enlace a Cambios, al pie del paso | ajustar (sigue enterrado, sin cambios) | `[código DevolucionesFlujo.tsx:327-340]` |
| Flujo · paso 3 | «Impecable» preseleccionado | Estado por defecto de cada prenda | ajustar (sin cambios) | `[código DevolucionesFlujo.tsx:65-67]` |
| Flujo · paso 4 | Botón rojo con el monto | Registra la devolución | ajustar (sin cambios) | `[código DevolucionesFlujo.tsx:483]` |
| Por aprobar | Rechazar sin aviso de éxito | Rechaza la devolución | ajustar (sin cambios) | `[código DevolucionesPendientes.tsx:103-117]` |
| — | Vale / saldo a favor | — | falta (sin cambios) | `[código: no existe]` |
| — | Historial de resueltas | — | falta (sin cambios) | `[inferido]` |
| — | Candado de dinero (RLS/grants, self-approval, tope de reembolso, NC con descuento) | — | **falta, sin cambios en 7 días** | `[producción + código, §2]` |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 5/10 | 6,0/10 — Soporte | — (primer análisis) |
| 2026-09-22 | — (pedido puntual de Felipe, no una pasada completa) | — | — | #8 — un chip y una acción por boleta, no por línea (`docs/BACKLOG.md`, `apps/web/components/DevolucionesVentas.tsx`) |
| 2026-09-22 | completo (re-análisis, código `88457700`) | 5/10 | 6,2/10 — Soporte | #8 confirmada cerrada con evidencia de navegador (tarjeta-resumen). #9 (motivo estructurado) **cerrada en código, no en producción** — construida, probada (8/8) y verificada en navegador; falta pegar la migración `20260922180000`. #1-#4, #5 (decisión), #6, #7, #10, #11, #12 de la lista anterior: **sin cerrar**, verificadas de nuevo contra el código de hoy y sin cambios en 7 días pese a que `crear_devolucion` se reescribió esta semana para otra cosa. |
