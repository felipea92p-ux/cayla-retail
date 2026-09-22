# Pantalla — Por pagar (`/compras/por-pagar`)

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder (pantalla solo-líder, `layout.tsx`), vista con «Tienda TRU» activa en el encabezado · Datos: captura real del estado vacío («Todo pagado») + código + producción
> SHA analizado: `16e61448` (origin/main == HEAD del worktree, 2026-09-22) — si `page.tsx`, `PorPagarLista.tsx`, `PagoJuntosModal.tsx`, `DeudaPorVencimiento.tsx`, `SalidasDeCaja.tsx`, `SaldosAFavor.tsx`, `PorPagarControles.tsx`, `PorPagarContexto.tsx`, `por-pagar-reglas.ts` o `compras-indicadores.ts` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/compras/por-pagar/page.tsx` · `components/PorPagarLista.tsx` · `PagoJuntosModal.tsx` · `DeudaPorVencimiento.tsx` · `SalidasDeCaja.tsx` · `SaldosAFavor.tsx` · `PorPagarControles.tsx` · `PorPagarContexto.tsx` · `PorPagarVistaRapida.tsx` · `FiltrosCompras.tsx` · `lib/por-pagar-reglas.ts` · `lib/compras-indicadores.ts` · `lib/compras.ts` · RPC `por_pagar_tramos`, `deuda_por_vencimiento`, `salidas_caja_30d`, `resumen_compras`, `resumen_compras_extra`, `listar_compras`, `fn_proveedores`, `registrar_pago_compras`, `registrar_pago_compras_medios`, `registrar_pagos_compra` · tablas `compras`, `compra_pagos`, `compra_notas_credito`, `compra_item_destinos`, `proveedores`
> Otra sesión tocándola: no. `docs/SESIONES-ACTIVAS.md` registra tres ramas relacionadas ya cerradas o sin cambios: `claude/filtro-destino-compras` (fusionada, PR #221), `claude/por-pagar-ui-animations-4ffe60` (fusionada) y `claude/mejorar-modulo-por-pagar-48008c` (abandonada sin commits).

## Nota sobre el Paso 2 (SQL)

No se pidió una consulta nueva a Felipe. `docs/datos/generado/` se refrescó el 2026-09-21 (commit `8864b3d6`, «verificado por hash» contra el proyecto `cayla-dynamic`) — un día antes de este análisis y sobre el mismo estado de código (`16e61448`). De ese volcado salen, ya verificadas contra producción real: filas por tabla (`retail_filas.json`), políticas RLS activas (`retail_policies.json`) y columnas/constraints (`DICCIONARIO-RETAIL.md`). Lo único que ese volcado NO cubre son las **definiciones de las funciones** nuevas (`RPCS.md` quedó desactualizado el 2026-09-12, 23 funciones; hoy hay muchas más) — para eso se usó el texto de las migraciones más recientes que redefinen cada función (Paso 1, subagente), que es lo que de verdad corre porque el commit del volcado es el mismo que el HEAD analizado. Si Felipe quiere una verificación en vivo de todos modos, la consulta D3 de `plantilla-sql.md` (`pg_get_functiondef` sobre `por_pagar_tramos, deuda_por_vencimiento, salidas_caja_30d, resumen_compras, resumen_compras_extra, listar_compras, registrar_pago_compras, registrar_pago_compras_medios, registrar_pagos_compra`) sigue disponible y la puede correr cuando quiera; no bloqueó este análisis porque ninguna migración de esas funciones quedó sin aplicar (`docs/BACKLOG.md`: «Fusionado y migración aplicada en producción», 2026-09-21).

**El dato más importante que trajo el volcado no es de estructura, es de uso: `compras = 0 filas`, `compra_pagos = 0 filas`, `compra_notas_credito = 0 filas` en producción (`retail_filas.json`).** No es un bug de la captura — es el estado real de la base. Todo lo que sigue se lee con eso en mente.

## 0 · Veredicto

Por pagar está bien construida y peor probada que ninguna otra pantalla del repo: candado de dinero sólido, animaciones cuidadas, pago en lote con varios medios — y **cero comprobantes reales la han usado nunca** (producción, 2026-09-21). Su defecto más serio no es de diseño sino de honestidad de los números: las 4 tarjetas y los dos paneles superiores ignoran el filtro «Destino» mientras la lista de abajo sí lo respeta, así que un líder que filtra por tienda ve un «Deuda total» que no es de esa tienda.

**Cumple su finalidad:** 6,1/10 · **Relevancia:** 5,8/10 — Comodidad (declarada como prioridad #1 de negocio por Felipe, D-46; la evidencia real de uso y el patrón de compra la empujan a Comodidad, no a Núcleo)

## 1 · Finalidad declarada

«Esta pantalla existe para responder, en orden: (1) ¿cuánto debo y qué es urgente?, (2) ¿cómo se reparte y cuándo sale la plata?, (3) ¿a quién le pago primero y cómo? — y para dejar pagar, individualmente o en lote, comprobantes vigentes con saldo.»
Fuente: comentario de cabecera `page.tsx:22-32` y `docs/adr/0131-por-pagar-responde.md`, no la captura. `docs/datos/DECISIONES-2026-09-12.md` (D-46) la nombra explícitamente: «Cuentas por pagar e IGV» es la **prioridad #1** que Felipe declaró para lo que falta construir, y marca la parte de «cuánto le debo a un proveedor y desde cuándo» como ya resuelta en código — lo que esta pantalla es.
¿Coinciden? Parcialmente. La pantalla cumple la mitad de D-46 (el saldo por proveedor) pero no la otra mitad que la misma decisión pide («no existe cálculo de crédito fiscal acumulado ni alerta de umbral de 300 UIT» — `compras.igv` se guarda por factura y nadie lo suma, `docs/datos/modulos/11-finanzas-operativas.md:92`). Esa mitad de la prioridad #1 de Felipe no vive en ninguna pantalla todavía.
Además, `docs/datos/15-COMO-OPERA-CAYLA.md` (R-01) contradice el nivel de detalle que la pantalla construyó: con 97% de compras al contado, «la antigüedad de la deuda por tramos... es sobre-ingeniería para hoy» — palabra textual del propio documento, escrito antes de que se construyeran los tramos de vencimiento y las salidas de caja de 30 días.

## 2 · Objeción

**Las 4 tarjetas y los dos paneles («Deuda por vencimiento», «Salidas de caja») no respetan el filtro Destino; la lista, sí.** `page.tsx:61-65` llama a `getResumenCompras()`, `getResumenComprasExtra()`, `getDeudaPorVencimiento()` y `getSalidasCaja30d()` sin argumentos — son globales, de todas las tiendas — mientras que `getPorPagarTramos(...)` (que alimenta la lista, l.65) sí recibe `filtros.destinoId`. Con `?dest=<tienda>` activo, un líder ve «Deuda total: S/ X» arriba (todas las tiendas) y una lista abajo que suma menos que X (solo esa tienda), en la misma pantalla, sin ninguna nota que diga «esto es de todas las tiendas». Es justo el tipo de contradicción que el principio 2 de este repo prohíbe para el inventario («cero estados inconsistentes») aplicado al dinero: dos cifras sobre la misma pregunta, en la misma pantalla, que no cuadran.

No hay objeción de mayor severidad (ningún candado de dinero roto, ninguna forma de pagar de más: eso lo blinda la base — `compras_no_sobrepagada`, `for update` en las RPC de pago, token de idempotencia). El resto son deudas de foco y de cableado, no de seguridad.

## 3 · Lo que está bien y no se toca

- **El candado de dinero funciona en las tres capas.** RLS activo en `compras`, `compra_pagos`, `compra_notas_credito` y `compra_items`, los cuatro con `fn_puede_ver_dinero_de_compras()` — verificado en el volcado de producción del 2026-09-21, no solo en el texto de la migración `[producción retail_policies.json]`.
- **Nunca se puede pagar de más ni pagar una compra anulada.** Constraint `compras_no_sobrepagada` (`pagado + notas_credito <= total`) y la RPC de pago rechaza `estado <> 'vigente'` `[código 20260918202000_…:83; 20260919180000_…:~310]`.
- **Idempotencia real del pago:** token por formulario (`crypto.randomUUID()`) guardado en `compra_pagos.pago_grupo_id`; repetir el envío por un doble clic o un reintento de red devuelve el pago original, no lo duplica `[código PagoJuntosModal.tsx:101; 20260919180000_…:279-283]`.
- **R-04 se respeta al pie de la letra:** pagar nunca toca `caja_movimientos`, ni en efectivo — está escrito así a propósito en el comentario de la migración fundacional `[código 20260912231956_…:38-40]`, y coincide con la decisión de negocio («el efectivo para pagar sale de reservas bancarias, nunca del cajón de una tienda»).
- **El vocabulario y el tono son los del repo:** «colaboradora/líder», «tienda/sede», sin una sola palabra prohibida en la captura ni en el código revisado.
- **La entrada escalonada y las cifras que cuentan (ADR-0131) están bien acotadas:** una sola vez al llegar, nunca en bucle, con `prefers-reduced-motion` cubierto por la regla global — no es decorativa, resuelve un problema real (antes, «Vencido S/ 6,670» no decía cuáles).
- **El estado vacío distingue error de «nada que pagar».** Una consulta que falla cae en `error.tsx` (con su propio mensaje); solo «Todo pagado» significa de verdad deuda cero — la captura adjunta es ese caso, y el código no lo falsea.

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Coherente con las pantallas hermanas de Compras; objetivos táctiles bajo 44 px (casilla, «×» del chip, botón «Pagar» compacto) | `[código PorPagarLista.tsx:698,287; CompraDetallePanel.tsx:145]` |
| Lógica de negocio | 5,0 | Construida para un patrón de deuda (tramos de antigüedad) que la propia doc del negocio llama sobre-ingeniería para hoy; placeholder que nunca se cumple | `[docs/datos/15-COMO-OPERA-CAYLA.md:19-23]` `[código DeudaPorVencimiento.tsx:17-18,88-91]` |
| Arquitectura | 6,5 | Candado de dinero sólido; tarjetas globales no filtran por Destino mientras la lista sí; pagos por RPC directa desde el navegador sin server action ni Zod | `[código page.tsx:61-65]` `[código PagoJuntosModal.tsx]` |
| Funciones | 6,0 | Lo que existe (pago individual, en lote, varios medios, saldo a favor) funciona; una pieza fantasma («Días promedio de pago») | `[código DeudaPorVencimiento.tsx:88-91]` |
| Utilidad | 4,5 | Nadie —ni un líder— ha decidido «a quién pago» aquí con datos reales todavía: 0 comprobantes en producción | `[producción retail_filas.json: compras=0]` |
| Conexión con el ERP | 6,0 | Bien conectada aguas arriba (Comprobantes → `compras`); nada la consume aguas abajo, ni siquiera Inicio, que ya pidió esa cola | `[docs/pantallas/inicio.md:75,107-110]` |

### Estética
`[visto]` La captura mantiene la paleta crema/tinta, las tarjetas `TarjetaCifra`, el toggle «POR URGENCIA / POR PROVEEDOR» y el ícono de check trazado en verde del estado vacío — coherente con `/compras`, `/compras/proveedores` y el resto del módulo. Sin uso de rojo en este estado (no aplica el tope `MAX_ROJO_POR_PANTALLA` porque no hay deuda vencida que pintar). `[código]` Objetivos táctiles: la casilla de selección mide 17 px visibles (`PorPagarLista.tsx:698`), el «×» de un chip de filtro local 16 px (`:287`) y el botón «Pagar» en su variante compacta usa `px-2.5 py-1.5 text-[11px]` (`CompraDetallePanel.tsx:145`) — los tres bajo el mínimo de 44×44 px de WCAG 2.5.5, y la propia pantalla se documenta pensada también para celular (ADR-0131 D8, vista de tarjeta bajo 40 rem).

### Lógica de negocio
`[docs]` R-01 (`docs/datos/15-COMO-OPERA-CAYLA.md:19`) dice, de la propia mano de Felipe vía este repo: «con 97% al contado casi no hay deuda que envejecer... la antigüedad de la deuda por tramos... es sobre-ingeniería para hoy». Esta pantalla construyó exactamente eso: tramos de vencimiento (vencida / 0-7 / 8-30 / más de 30) y salidas de caja de 30 días, con animación, filtros cruzados y ADR propio (0131). No está mal hecho — está construido para un caso que el propio negocio dice que es el 3% de las veces. `[código]` La caja punteada «Días promedio de pago · % pagado a tiempo — Aparecen con el primer comprobante pagado» (`DeudaPorVencimiento.tsx:88-91`) es una promesa que el código admite en su propio comentario que no se está cumpliendo (l.17-18) — y **el dato que promete ya existe** por proveedor, sin conectar (`fn_proveedor_metricas_compras.dias_pago_real_promedio`, migración `20260918221000`). `[producción]` `compras=0` filas: nada de esto se ha ejercitado con una factura real desde que se escribió (D-46 ya lo advertía el 2026-09-12; nueve días después, sigue en cero).

### Arquitectura
`[código]` Cadena completa verificada: `page.tsx` → RPC vía `lib/compras.ts` / `lib/compras-indicadores.ts` → funciones `security definer` con `fn_exige_dinero_de_compras()` inyectado por `fn_aplicar_candado_de_dinero()` → RLS de las tablas. El único eslabón sin candado propio de dinero es `listar_compras`, que es `SECURITY INVOKER` y depende solo de la RLS de `compras_resumen` (`security_invoker`) — funciona hoy, pero si algún día alguien la vuelve `security definer` sin pensarlo, se abre el dinero sin que ninguna prueba lo detecte hasta que alguien la explote. `[código]` Degradación desigual ante fallos: `getNotasPendientes` y `getPagosDeCompras` devuelven `{}` y solo hacen `console.error` (la pantalla se ve, sin esa pieza); pero `getResumenCompras` y el resto de las funciones de dinero usan `exigir()` (lanza), y cualquier fallo tira TODA la pantalla a `error.tsx` — incluido el mensaje amable de «filtro Destino no disponible» (`MENSAJE_FILTRO_DESTINO_NO_DISPONIBLE`, `compras-reglas.ts:425`), que en producción Next enmascara con el genérico. `[código]` Concurrencia: las RPC de pago hacen `for update` ordenado por id antes de tocar el saldo — dos líderes pagando el mismo comprobante al mismo milisegundo no lo duplican. `[código]` Volumen: con `compras_por_pagar_idx` (parcial, solo `estado='vigente' and saldo>0`) la lista se mantiene chica aunque haya millones de compras pagadas — diseño correcto para 3 tiendas + 1 taller, sin sobre-construir.

### Funciones
`[código]` Existen y funcionan: pago individual (`BotonPagar` → `registrar_pagos_compra`), pago en lote de varios comprobantes del mismo proveedor con varios medios (`PagoJuntosModal` → `registrar_pago_compras_medios`), saldo a favor como medio de pago, vista rápida del comprobante con su historial de pagos, filtro cruzado por tramo/semana de caja/proveedor. `[código]` Fantasma: la caja de «Días promedio de pago» (ver arriba). `[inferido]` Sobra, no en código sino en alcance: el nivel de detalle de tramos de vencimiento para un negocio 97% al contado (ver Lógica de negocio) — no es una función que sobre en el sentido de «botón sin lógica», sino esfuerzo puesto donde el propio negocio dijo que no hacía falta.

### Utilidad
`[inferido, sin escenario en navegador — 0 filas en producción]` Un líder que necesita decidir «a quién le pago hoy» un lunes real: hoy no puede vivir ese escenario en producción porque no hay ni un comprobante cargado. Todo lo que se sabe de esta pantalla en uso real viene de pruebas automatizadas (`scripts/pruebas/compras_indicadores.mjs`, 2213 líneas) y de sesiones de diseño (`docs/maquetas/por-pagar-spike-2026-09/`), nunca de un líder pagándole a un proveedor de verdad. Eso no es culpa del diseño de la pantalla — es una señal de que el módulo entero de Compras (no solo Por pagar) todavía no se adoptó, y quien decide con esta pantalla hoy lo hace sobre un escenario hipotético, no comprobado.

### Conexión con el ERP
Ver sección 6.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Directo: decide a quién pagar y evita quedar mal con el ~3% de proveedores a crédito; indirecto: es la mitad ya resuelta de la prioridad #1 de Felipe (D-46, cuentas por pagar e IGV) — la otra mitad (IGV acumulado) no vive en ninguna pantalla todavía |
| Dinero y stock que toca | ×1 | 8 | Toca dinero real de forma directa e irreversible (un pago no tiene «deshacer», por diseño — ADR-0131 D5) |
| Frecuencia y personas que la usan | ×1 | 2 | 0 comprobantes en producción hoy; aun con uso real, solo ~3% de las compras generan algo que «esperar» a pagar (R-01, R-05: 99% se paga completo y al contado) |
| Qué se detiene si falla | ×1 | 4 | Si falla, un líder no ve el saldo con un proveedor a crédito antes de que corte el suministro — real pero acotado al 3% de los casos |

Relevancia = (2·7 + 8 + 2 + 4) / 5 = **5,8** → Comodidad.

*Nota para Felipe:* esta cuenta castiga la Frecuencia porque hoy es honestamente cero. Si D-46 se toma en serio como prioridad #1 y se completa con el IGV acumulado (que hoy no existe en ningún lado), el mismo módulo sube de categoría — pero eso es una decisión de dónde poner el esfuerzo, no algo que esta pantalla, sola, pueda resolver.

## 6 · Conexión con el ERP

- **Aguas arriba:** una compra nace en Comprobantes (`registrar_compra`, ADR-0035) y aparece aquí en cuanto tiene saldo > 0 y está vigente; el índice parcial `compras_por_pagar_idx` la recoge automáticamente, sin paso manual.
- **Aguas abajo:** hoy, nada. Ningún reporte de flujo de caja ni ninguna otra pantalla lee `por_pagar_tramos`, `deuda_por_vencimiento` ni `salidas_caja_30d`. La propia auditoría de Inicio (`docs/pantallas/inicio.md:75,107-110`) ya señaló este hueco desde el otro lado: su tarea #1 es sumar la cola de «compras por pagar» a «Por atender», y hoy no existe esa conexión.
- **Pájaro dueño y vecinos:** Pelícano (`docs/datos/modulos/09-compras-y-proveedores.md`), sin nadie asignado todavía («Lo lleva: libre — apúntate en `07-GOBIERNO.md`»). Vecino directo y no compartido: `/produccion/por-pagar` (Producción, ADR propio, módulo aparte por decisión D-H) reimplementó el mismo patrón —tramos, modal de pago, token de idempotencia— desde cero, sin tocar ni reusar `PorPagarLista.tsx`, `PagoJuntosModal.tsx` ni `por-pagar-reglas.ts`.
- **Externos, y qué pasa si caen:** ninguno en el camino crítico de esta pantalla. SUNAT/Nubefact ya corrieron cuando la compra se registró (aguas arriba); si caen, no impiden ver ni pagar lo que ya está en `compras`.

## 7 · Las 12 tareas, por importancia

### #1 · [Replantear] Decidir el nivel de inversión en tramos de vencimiento vs. completar la prioridad real de Felipe (IGV)
- **Dónde:** el módulo entero de `DeudaPorVencimiento.tsx`, `SalidasDeCaja.tsx`, `por-pagar-reglas.ts` (tramos) frente a `compras.igv` / `fn_igv_credito_fiscal` (que sí existe en Producción, `20260921110000`, pero no en Compras)
- **Por qué en este puesto:** define si el esfuerzo que sigue en Por pagar se pone en pulir algo que el propio negocio llamó sobre-ingeniería (R-01), o en cerrar lo que Felipe declaró prioridad #1 (D-46: IGV acumulado y alerta de 300 UIT), que hoy no existe en Compras
- **Cómo lo verificas tú:** una conversación con Felipe, registrada como ADR el mismo día que se decida
- **Esfuerzo / dependencias:** S (decisión) — las tareas #6 y #12 dependen de esta
- **DECIDÍ:** proponer que se mida el uso real de tramos/caja durante 30 días después de la primera factura a crédito cargada, antes de invertir más en esa parte
- **DESCARTÉ:** seguir punliendo tramos/caja sin esa medición, porque hoy no hay ni una fila que confirme que alguien los necesita
- **SE ROMPE SI:** CAYLA cruza el umbral de 300 UIT sin tener IGV acumulado en ninguna pantalla — ahí sí hay una consecuencia fiscal real, y hoy nadie la ve venir desde este módulo

### #2 · [Corregir] Las 4 tarjetas y los dos paneles superiores no respetan el filtro Destino
- **Dónde:** `page.tsx:61-65` (`getResumenCompras`, `getResumenComprasExtra`, `getDeudaPorVencimiento`, `getSalidasCaja30d`, todas sin argumentos) frente a `getPorPagarTramos(..., destinoId: filtros.destinoId)` en `page.tsx:65`
- **Por qué en este puesto:** es la única inconsistencia que un líder ve con sus propios ojos en la misma pantalla — dos cifras sobre la misma pregunta que no cuadran
- **Cómo lo verificas tú:** con al menos dos comprobantes de tiendas distintas, filtrar por `?dest=`; hoy «Deuda total» no cambia y la lista sí
- **Esfuerzo / dependencias:** S (arreglo barato: anotar «de todas las tiendas» en las 4 tarjetas cuando `?dest=` está activo) → M/L si se decide sumar el filtro a las funciones de base (requiere migración, como hizo `20260921130000` con `por_pagar_tramos`)

### #3 · [Corregir] «Días promedio de pago · % pagado a tiempo» es una promesa que nunca se cumple
- **Dónde:** `DeudaPorVencimiento.tsx:88-91` (caja punteada) frente a `fn_proveedor_metricas_compras.dias_pago_real_promedio` (`20260918221000`), que ya calcula justo eso por proveedor
- **Por qué en este puesto:** una pieza de UI que promete un dato «cuando exista» y el dato ya existe en otro lado sin conectar es la definición de función fantasma
- **Cómo lo verificas tú:** con el primer comprobante pagado por completo en producción, la caja debería mostrar una cifra; hoy seguiría vacía sin este cambio
- **Esfuerzo / dependencias:** S — cablear la lectura existente, o M si se decide construir el agregado global (no solo por proveedor)

### #4 · [Corregir] El mensaje amable de «filtro Destino no disponible» se pierde en producción
- **Dónde:** `MENSAJE_FILTRO_DESTINO_NO_DISPONIBLE` (`compras-reglas.ts:425`), capturado por `apps/web/app/(app)/error.tsx`
- **Por qué en este puesto:** hoy un fallo puntual de ese filtro se ve igual que cualquier otro error genérico — el mensaje que sí explica qué pasó nunca llega a pantalla
- **Cómo lo verificas tú:** forzar ese error localmente y comparar el texto que ve el líder contra el mensaje que el código sí produce
- **Esfuerzo / dependencias:** S

### #5 · [Mejorar] Objetivos táctiles bajo 44 px
- **Dónde:** casilla de selección (`PorPagarLista.tsx:698`, 17 px), «×» del chip de filtro local (`:287`, 16 px), botón «Pagar» compacto (`CompraDetallePanel.tsx:145`)
- **Por qué en este puesto:** la propia pantalla se pensó para celular (ADR-0131 D8); en celular estos tres son los que más se tocan
- **Cómo lo verificas tú:** con el emulador de celular (375 px) medir el área de toque de los tres elementos
- **Esfuerzo / dependencias:** S

### #6 · [Eliminar/fusionar/conectar] Fusionar el patrón con `/produccion/por-pagar`
- **Dónde:** `PorPagarProduccionPanel.tsx` (205 líneas) reimplementa tramos, modal y token que ya existen en `PorPagarLista.tsx` / `PagoJuntosModal.tsx` / `por-pagar-reglas.ts`
- **Por qué en este puesto:** dos formas de resolver lo mismo en el mismo repo — el principio 3 de este repo (simplicidad radical, piezas componibles) pide una, no dos
- **Cómo lo verificas tú:** que un cambio de regla de tramo (por ejemplo, el ancho de la ventana «vence esta semana») se haga en un solo archivo y se refleje en ambas pantallas
- **Esfuerzo / dependencias:** L · no antes de la #1 (D-H ya decidió que Producción es un módulo aparte a propósito; fusionar el código sin resolver esa tensión repetiría la discusión)

### #7 · [Mejorar] Conectar esta pantalla con Inicio
- **Dónde:** `lib/inicio-reglas.ts:90` (`colasInicio`) necesita leer `por_pagar_tramos`/`resumen_compras`, hoy sin subir esa lectura a `lib/`
- **Por qué en este puesto:** ya está pedido desde el otro lado (`docs/pantallas/inicio.md` #1); sin esto, «Por atender» no avisa de vencimientos y el líder solo se entera si entra aquí
- **Cómo lo verificas tú:** con un comprobante vencido, «Por atender» en Inicio debería mostrar la cola y coincidir con esta pantalla
- **Esfuerzo / dependencias:** M · coordinar con quien tome la tarea #1 de `docs/pantallas/inicio.md`

### #8 · [Mejorar] «Tengo S/» no persiste entre visitas
- **Dónde:** `SalidasDeCaja.tsx:81-88`
- **Por qué en este puesto:** cumple R-04 correctamente (no toca caja real) pero obliga a reescribir el número cada vez que se entra, sin ganar nada a cambio
- **Cómo lo verificas tú:** cerrar y volver a abrir la pantalla; hoy el campo vuelve a cero
- **Esfuerzo / dependencias:** S (guardarlo en `localStorage`, nunca en la base — sigue siendo «solo de pantalla»)

### #9 · [Mejorar] Validación de pago sin server action ni Zod
- **Dónde:** `PagoJuntosModal.tsx` llama las RPC de pago directo desde el navegador con `createClient()`; no hay `"use server"` ni `zod` en la ruta de pago
- **Por qué en este puesto:** funciona hoy porque la base valida todo, pero un error de negocio (monto mal repartido, medio inválido) llega como texto crudo de Postgres en vez de un mensaje estructurado
- **Cómo lo verificas tú:** provocar un error de reparto y comparar el mensaje que ve el líder contra lo que el código de error de Postgres realmente dice
- **Esfuerzo / dependencias:** M

### #10 · [bajo valor / ya en BACKLOG] Vigilar `registrar_pago_compras`/`registrar_pago_compras_medios` con `datos:comparar`
- **Dónde:** `docs/BACKLOG.md` («armar los parámetros explícitos en `PagoJuntosModal.tsx`»)
- **Por qué en este puesto:** ya identificado, no es hallazgo nuevo de este análisis
- **Cómo lo verificas tú:** `pnpm datos:comparar` deja de listar esas dos funciones como «no analizadas»
- **Esfuerzo / dependencias:** S

### #11 · [bajo valor / futuro] Cursor de paginación con `fecha_vencimiento` nulo en orden «vencimiento»
- **Dónde:** `listar_compras` (`20260918205000`), orden por `(fecha_vencimiento, id)` con `nulls last`
- **Por qué en este puesto:** hoy improbable (los créditos exigen vencimiento por constraint, los contados no tienen saldo) — deuda latente, no activa
- **Cómo lo verificas tú:** una prueba con una fila `vigente`, `saldo>0` y `fecha_vencimiento null` cruzando el límite de página
- **Esfuerzo / dependencias:** S, cuando se decida mirarlo

### #12 · [bajo valor / futuro] Reporte de antigüedad de deuda por tramos (1-30 / 31-60 / 61-90)
- **Dónde:** `docs/datos/10-ROADMAP-DATOS.md` lo propone; `docs/datos/15-COMO-OPERA-CAYLA.md:19-23` lo desestima para hoy
- **Por qué en este puesto:** la propia doc del negocio dice que es sobre-ingeniería mientras el 97% se pague al contado — no construir salvo que ese patrón cambie
- **Cómo lo verificas tú:** N/A hasta que exista un área comercial con crédito real, como el mismo documento anticipa
- **Esfuerzo / dependencias:** no antes de la #1

## 9 · Referentes de ERP y futuro

Filtro obligatorio aplicado: ¿le sirve a 3 tiendas y 1 taller hoy? La antigüedad de deuda por tramos (Odoo/NetSuite la tienen de fábrica) no pasa el filtro — ver R-01 y la tarea #12. `[no verificado, de memoria]` Lo único que sí podría valer la pena mirar de esos productos es el «pago sugerido por vencimiento» (ordenar automáticamente por urgencia, que esta pantalla ya hace con `agrupar=urgencia`) — no hay nada nuevo que copiar ahí; CAYLA ya lo tiene.

## 10 · Fuera de esta pantalla

**El módulo de Compras entero (no solo Por pagar) no tiene ni una factura real cargada en producción**, nueve días después de que `docs/datos/DECISIONES-2026-09-12.md` (D-46) lo señalara como brecha de uso. Se han fusionado seis o más PR sobre Por pagar en ese tiempo (filtro Destino, animaciones, pago con varios medios, endurecimiento del candado) sin que ninguno se haya probado contra un pago real. No es una falla de esta pantalla — es una pregunta para Felipe sobre si vale la pena seguir invirtiendo en pulir Compras antes de que alguien lo use de verdad, o si conviene destrabar primero lo que sea que esté frenando la carga de la primera factura.

## 11 · Líneas propuestas para BACKLOG.md

- [ ] `[pantalla:compras-por-pagar]` #1 Replantear: decidir tramos de vencimiento vs. completar IGV/crédito fiscal (D-46) — S (decisión)
- [ ] `[pantalla:compras-por-pagar]` #2 Las 4 tarjetas y «Deuda por vencimiento»/«Salidas de caja» no respetan el filtro Destino — S/M/L
- [ ] `[pantalla:compras-por-pagar]` #3 Cablear «Días promedio de pago · % pagado a tiempo» a `fn_proveedor_metricas_compras` o quitar la caja — S/M
- [ ] `[pantalla:compras-por-pagar]` #4 El mensaje de «filtro Destino no disponible» se pierde en `error.tsx` — S
- [ ] `[pantalla:compras-por-pagar]` #5 Objetivos táctiles bajo 44 px (casilla, chip, botón Pagar compacto) — S
- [ ] `[pantalla:compras-por-pagar]` #6 Fusionar el patrón con `/produccion/por-pagar` (no antes de decidir #1) — L
- [ ] `[pantalla:compras-por-pagar]` #7 Sumar «por pagar» a «Por atender» de Inicio (coordinar con `docs/pantallas/inicio.md` #1) — M
- [ ] `[pantalla:compras-por-pagar]` #8 Persistir «Tengo S/» en `localStorage` (nunca en la base) — S
- [ ] `[pantalla:compras-por-pagar]` #9 Pago vía server action con Zod en vez de RPC directa desde el navegador — M

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Selector de tienda («TIENDA TRU») | Cambia la sede activa del layout | bien | `[visto]` |
| Cifras | Deuda total | Suma global, cuenta desde 0 | ajustar (no filtra Destino) | `[código page.tsx:61]` |
| Cifras | Vencido | Enlace a `?vencidas=1` | bien | `[código page.tsx:145]` |
| Cifras | Vence esta semana | Enlace ancla `#tramo-semana`, ventana de 8 días inclusive | bien | `[código page.tsx:169]` |
| Cifras | Concentración | Barra + % del proveedor top | bien, no filtra Destino | `[código page.tsx:176-184]` |
| Panel | Deuda por vencimiento | Barra apilada que filtra la lista al clic | bien, no filtra Destino | `[código DeudaPorVencimiento.tsx]` |
| Panel | Deuda por vencimiento → caja punteada | Promete «días promedio / % a tiempo» | sobra tal como está (fantasma) | `[código DeudaPorVencimiento.tsx:88-91]` |
| Panel | Salidas de caja 30 días | Lista por semana, filtra al clic | bien, no filtra Destino | `[código SalidasDeCaja.tsx]` |
| Panel | «Tengo S/» | Campo manual, no persiste | ajustar | `[código SalidasDeCaja.tsx:81-88]` |
| Filtros | Buscador «Proveedor o número» | Debounce 350 ms, atajo `/` | bien | `[código FiltrosCompras.tsx:90-130]` |
| Filtros | Por urgencia / Por proveedor | Reordena con FLIP, URL detrás | bien | `[código PorPagarControles.tsx]` |
| Filtros | Botón Filtros | Abre proveedor/destino/vencidas/condición | bien | `[visto]` |
| Lista | Estado vacío «Todo pagado» | Check trazado, distingue de error | bien | `[visto]` `[código page.tsx:244-255]` |
| Lista | Fila con «Pagar» | Abre `PagoPiezas`/RPC de pago | bien | `[código PorPagarLista.tsx:679-683]` |
| Lista | Casilla de selección | Marca para «Pagar juntos» | ajustar (17 px) | `[código PorPagarLista.tsx:698]` |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-22 | completo | 6,1/10 | 5,8/10 — Comodidad | primer análisis |
