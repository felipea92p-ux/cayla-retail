# Pantalla — Devoluciones (`/devoluciones`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder, Tienda TRU · Datos: real parcial (SQL de producción A2, A3, C1, C2, D2, D3, D4, D5, E5; D1 leído del volcado del repo; **B1 no llegó** —se pegó la consulta en vez del resultado—; E1/E2 volvieron «sin filas» sin distinguir cuál; E3 y E4 no llegaron)
> SHA analizado: `bb540298` (= `origin/main`, rama sin diferencia) — si `page.tsx`, `DevolucionesFlujo.tsx`, `DevolucionesPanel.tsx`, `DevolucionesPendientes.tsx`, `lib/devoluciones*.ts` o las RPC de devoluciones cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/devoluciones/page.tsx` · `components/DevolucionesPanel.tsx` · `DevolucionesFlujo.tsx` · `DevolucionesPendientes.tsx` · `DevolucionesVentas.tsx` · `BuscadorVentas.tsx` · `ComprasAgrupadas.tsx` · `FlujoGuiado.tsx` · `lib/devoluciones.ts` · `lib/devoluciones-reglas.ts` · `lib/cambios-reglas.ts` · `lib/ventas-v2.ts` · RPC `crear_devolucion`, `aprobar_devolucion`, `rechazar_devolucion`, `anular_venta`, `resolver_prenda_danada` · tablas `devoluciones`, `devolucion_items`, `prendas_danadas`, `cambios`, `movimientos`, `comprobantes`
> Otra sesión tocándola: **no** sobre `/devoluciones` (el rediseño lo cerró `claude/interface-recommendations-8ce365`, 2026-09-18). **Roce posible, no verificado:** `claude/ventas-visual-redesign-240e2b` sigue en Ventas y `/cambios` comparte `FlujoGuiado`, `ComprasAgrupadas` y `BuscadorVentas` con esta pantalla.
> Datos personales: la captura trae un nombre y un DNI de prueba en la lista; aquí van como `[clienta]` y `[DNI]`.

## 0 · Veredicto

Un flujo bien pensado y bien dibujado sobre una base que no lo respalda: el candado de líder que la pantalla muestra se salta desde la consola, y la regla del negocio (R-38) dice lo contrario de lo que el flujo obliga a hacer en el mostrador.
**Cumple su finalidad:** 5/10 (promedio 5.2, con tope 5 por un defecto que puede dañar dinero) · **Relevancia:** 6.0/10 — Soporte

## 1 · Finalidad declarada

"Esta pantalla existe para registrar la devolución de una clienta contra su compra y dejarla pendiente; un líder la aprueba, y solo ahí se mueve el stock, se emite la nota de crédito y se decide el reembolso."
Fuente: `docs/ARQUITECTURA.md:375-384`, ADR-0122 y `docs/datos/15-COMO-OPERA-CAYLA.md` §9 (R-37, R-38, R-39). No sale de la captura.
¿Docs y pantalla coinciden? **No, en un punto que manda:** R-38 dice que el plazo de 15 días «lo aplica cualquiera en caja» y que «no hace falta autorización de la líder» (*dato duro*). El flujo obliga a que **toda** devolución pase por un líder (`DevolucionesFlujo.tsx:466`, captura 6). El propio comentario del código lo reconoce (`devoluciones-reglas.ts:86-91`) y ADR-0122 lo resuelve por decisión de diseño («ya hay un líder que aprueba cada una»), no por una regla escrita. Manda R-38 (es del negocio); el diseño actual es una decisión reversible.

## 2 · Objeción

**1. La aprobación de líder es un letrero, no un candado.** `authenticated` tiene `INSERT, UPDATE, DELETE` sobre `devoluciones`, `devolucion_items`, `prendas_danadas` y `cambios` `[producción, D3]`; la política `devoluciones_write` es `FOR ALL` y solo pregunta «¿es mi sede?» `[producción, volcado 2026-09-21]`; y no hay ningún trigger sobre `devoluciones` `[producción, A3]`. Ningún código de `apps/web` escribe directo en esas tablas `[código: grep de insert/update/delete]`, así que no hay razón para tener el permiso. Una colaboradora con sesión puede, desde la consola del navegador, marcar una devolución como `aprobada` con `reembolso_metodo='efectivo'` y un monto, y `cerrar_caja` lo resta del efectivo esperado (`20260921120000_candado_de_lider_caja_y_ajuste.sql:116-130`): el faltante de caja desaparece del arqueo. También puede borrar una pendiente sin rastro. **No lo ejecuté** `[inferido]` de permisos + política + ausencia de trigger; el mismo criterio que ADR-0143 aplicó a `cerrar_caja`: «una pantalla que esconde el botón no es un candado». `movimientos` sí está cerrada (solo `SELECT`, `20260915150000`); estas cuatro tablas no.

**2. La única devolución real de producción se aprobó a sí misma en 5,6 segundos** `[producción, C1: autoaprobada=true, registrada 20:37:11, aprobada 20:37:16]`. `aprobar_devolucion` pide `fn_es_lider()` pero no compara con quien la registró (`20260918070000…:111`; D5: `compara_solicitante=false`), y al terminar de registrar la pantalla ofrece «Revisar y aprobar» (`DevolucionesFlujo.tsx:507`). Con 9 líderes y 16 colaboradores en producción (ADR-0143) sobra quien apruebe lo ajeno.

**3. El flujo pone al revés lo que el negocio dijo.** R-37: primero un cambio, después nota de crédito o vale, y la plata al final. La pantalla entra por un botón negro «INICIAR DEVOLUCIÓN» en cada línea (captura 1) y el cambio queda como una franja al final de un paso 2 largo (captura 4, tras ~12 líneas). Además la colaboradora termina el flujo sin poder decirle a la clienta qué recibe: el reembolso lo decide un líder después (captura 6: «si se le reembolsa, lo decide quien la apruebe»). **No existe el «vale»** que R-37 nombra: solo hay reembolso por 5 medios de pago (`cambios-reglas.ts:47-53`) `[código]`.

Trade-off honesto: nada de esto ha causado un daño, porque hoy hay 1 devolución y 18 ventas en 15 días `[producción, E5 y volcado]`. Es pre-vuelo. Arreglarlo cuesta una migración pequeña; descubrirlo con TRU en vivo cuesta un cierre de caja que no cuadra sin explicación.

## 3 · Lo que está bien y no se toca

- **Registrar y aprobar son dos tiempos, y registrar no mueve nada** — un error al registrar no puede ensuciar stock ni caja. `crear_devolucion` no toca `movimientos` `[código 0003:420-466]`.
- **`aprobar_devolucion` es todo-o-nada:** bloquea la devolución (`for update`), mueve el stock por `fn_aplicar_movimiento`, deja `movimiento_id` en cada línea, y si la venta tenía comprobante aceptado emite la nota de crédito en la misma transacción; sin serie de NC, frena con un mensaje claro en vez de aprobar a medias `[código 20260918070000:107-218]`. Su firma es única en producción y coincide con el repo `[producción, funciones-produccion.txt]`.
- **Principio 4 respetado:** el stock vuelve solo por `movimientos` (entrada, motivo `devolucion`), atribuido a quien aprueba; el destino depende del estado de la prenda (piso si es impecable, cuarentena + fila en `prendas_danadas` si tiene defecto) — cumple R-39 `[código]`.
- **Todas las RPC de este flujo son `security definer` con `search_path` fijo y ninguna es ejecutable por `anon`** `[producción, D4]`; RLS está activo en las cinco tablas `[producción, D2]`.
- **Venta anulada no se devuelve:** trigger `devolucion_items_venta_no_anulada` (y el gemelo en `cambios`) `[producción, A3]`; y `anular_venta` se niega si ya hay devolución o cambio.
- **Esquema con cinturón:** `CHECK` de estado, de condición, de cantidad > 0, de coherencia `pendiente ⇔ aprobado_en nulo`, y `UNIQUE (devolucion_id, venta_item_id)` `[producción, volcado]`.
- **La cifra de la cabecera cuadra con producción:** S/ 109.00 = `neto_pagado` de la única devolución aprobada `[producción, C2]`; «hoy 0 / mes 1» es coherente con su fecha de aprobación (16-set) `[producción, C1]`.
- **Ergonomía del flujo:** buscador único (boleta, DNI, clienta, prenda, código, atajo «/»), stepper con `aria-current`, foco al título en cada paso, Escape retrocede, error con `role="alert"` que conserva el formulario, doble clic frenado en cliente (`enviandoAhora`, `DevolucionesFlujo.tsx:117,208`) `[código]`.
- **El panel «Lo que revisa el sistema» y el «Impacto»** (inventario, caja) dicen antes de guardar qué va a pasar — la caja «no se mueve» — `[visto, capturas 5 y 6]`. Honestidad de estado poco común; no se toca.
- **Plazo por color** (verde dentro, rojo vencido) es un pedido explícito de Felipe (ADR-0122, 2026-09-18).

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con CAYLA (papel, serif de título, hilos finos, timeline por día); ruido por repetición: el mismo chip verde y el mismo botón negro en cada una de ~30 líneas; botón rojo con monto que parece plata que sale | `[visto]` 1-6 · `[código FlujoGuiado.tsx:298]` |
| Lógica de negocio | 4 | Aprobación de líder para todo contradice R-38; sin vale (R-37); reembolso sin tope; nota de crédito sin descuento; plazo solo avisa | `[código]` · `[producción]` |
| Arquitectura | 4 | Buena transacción, pero escritura directa abierta, sin idempotencia, sin bloqueo de filas, sin cruce con `cambios` ni con la sede de la venta | `[producción D3/A3/D5]` · `[código]` |
| Funciones | 5 | Lo central existe y funciona; «Sin comprobante» no es un flujo; falta decirle a la clienta qué recibe; falta vale | `[código]` · `[visto]` |
| Utilidad | 5 | Guiado y claro, pero termina en «queda pendiente» y la clienta se queda esperando | `[visto]` · `[inferido]` |
| Conexión con el ERP | 6 | Bien enlazada con stock, cuarentena, arqueo de caja, Facturación y Cambios; las cifras de cabecera cuentan aprobaciones, no registros | `[código]` · `[producción]` |

**Cumple su finalidad = 5.2 → tope 5** (hay un defecto que puede dañar dinero: hallazgo 1).

### Estética (7)
- **(a) Coherencia con CAYLA.** Fondo papel, títulos serif, tarjetas de trazo fino, etiquetas en versalitas, timeline con punto por día `[visto 1-6]`; es hermana de Cambios y de Caja. Rojo: un solo botón por paso (`Registrar devolución`, `Aprobar devolución`), dentro del tope `MAX_ROJO_POR_PANTALLA = 2` `[código design-tokens.ts:73]`; pero **con una venta fuera de plazo hay tres** (botón + chip del panel + ícono de la validación; `FlujoGuiado.tsx:203`, `CambioResumen.tsx:105-112`) y el tope es solo un comentario, sin nada que lo haga cumplir `[código FlujoGuiado.tsx:14-16]`.
- **(b) Marca y tono.** Vocabulario correcto («clienta», «líder», «sede», «prenda»); frases cortas y honestas («No quedó registrada en la venta», «Al registrarla, la caja no se mueve») `[visto 6]`.
- **(c) Heurísticas.** *Ruido:* en la lista, 30+ chips «Dentro del plazo» idénticos y 30+ botones negros (captura 1-2): el plazo es de la **boleta**, no de la línea, y lo normal no necesita chip. *Jerarquía:* el rojo «REGISTRAR DEVOLUCIÓN S/ 79.00» sugiere dinero saliendo, cuando el panel de al lado dice que la caja no se mueve `[visto 6]`. *Vacíos:* el masonry de dos columnas deja huecos grandes cuando una tarjeta es corta (captura 2, columna izquierda bajo B004-000019). *Tarjeta 2 de captura 1:* «Anular venta» cae a segunda línea porque el nombre de la clienta es largo → el encabezado se desalinea. *Táctil:* checkbox nativo de 16 px (`DevolucionesFlujo.tsx:284-290`, mitigado porque toda la fila es `<label>`), «Anular venta» como texto `py-1 text-xs` (`DevolucionesVentas.tsx:35-45`), nudos del stepper de 34 px. *Contraste/tamaño:* SKU en monoespaciada de ~11 px sobre crema `[visto 1-4]`. *Foco visible:* no encontré regla propia para el stepper; queda el anillo del navegador `[código, no verificado renderizado]`.

### Lógica de negocio (4)
- **Contra R-38** (cualquiera en caja aplica el plazo, sin autorización): el flujo obliga a líder para todo, incluida la devolución más simple (en plazo, impecable, sin plata). Es la fricción principal del mostrador.
- **Contra R-37** (cambio → nota de crédito/vale → plata al final): la entrada por línea es «Iniciar devolución»; el cambio es un enlace al pie (`DevolucionesFlujo.tsx:330-336`); no hay vale.
- **Contra R-39** (destino según estado): bien resuelto en la aprobación.
- **Nota de crédito sin descuento:** `aprobar_devolucion` suma `precio_unitario × cantidad` (`20260918070000_devolver_proveedor_entra_a_cuarentena.sql`, variable `v_total_devuelto`, dentro de `aprobar_devolucion`), mientras la pantalla muestra `valorPagado` con descuento (`devoluciones-reglas.ts:129`). En producción hoy da igual (`bruto = neto`, C2) porque esa línea no tenía descuento `[producción C2]`; con una línea con descuento (el BACKLOG cita 149.90 con 15 de descuento) se acreditaría de más `[código]`. Ninguna D-nn cubre el criterio contable; es plata: confirmar con Felipe y el contador.
- **Reembolso sin tope en el servidor:** solo hay aviso en la UI (`revisarAprobacion`, `devoluciones-reglas.ts:284`); `aprobar_devolucion` acepta cualquier `p_reembolso_monto` `[código]`.
- **Plazo:** solo se avisa; el servidor no lo valida (D5: `valida_plazo=false`) y `DIAS_PLAZO_CAMBIO=15` es una constante de TS sin tabla (`cambios-reglas.ts:341`). ADR-0122 lo dejó abierto: «falta que Felipe diga quién decide pasado el plazo».
- **Sede:** `crear_devolucion` no compara `p_ubicacion_id` con `ventas.ubicacion_id` `[código 0003:432]`. Una líder que busca en «Todas las tiendas» registra en SU sede una venta ajena y el stock reingresa ahí `[código]`.
- **Ninguna D-nn escrita cubre** el reembolso sin boleta aceptada, ni qué es un «vale». D-43 (devoluciones ligadas a su boleta, con nota de crédito, decidiendo a qué sede reingresa) es la que gobierna: la sede de reingreso hoy la decide quien registra, no la venta.
- **Referentes (de memoria, no verificado):** Shopify POS y Lightspeed manejan la devolución contra la venta original, con la sede de reingreso como decisión explícita del cajero y el reembolso/crédito elegido en el mismo momento; ninguno espera a un tercero para lo rutinario (ver §9).

### Arquitectura (4)
- **Cadena:** `page.tsx` (Server Component) → `DevolucionesPanel` (cliente) → `DevolucionesFlujo`/`DevolucionesPendientes` → **RPC directas desde el navegador** (no hay server actions de devoluciones) → `crear_devolucion` / `aprobar_devolucion` / `rechazar_devolucion` → tablas, RLS y triggers `[código]`.
- **Estados imposibles:** el `CHECK` de coherencia impide `pendiente` con `aprobado_en`; **nada** impide que una aprobada tenga `reembolso_monto` sin `movimiento_id` en sus líneas si alguien escribe directo `[producción, D3 + A3]`. E3 (líneas aprobadas sin movimiento) no llegó.
- **Transacciones:** una RPC = una transacción; `crear_devolucion` inserta cabecera y N líneas juntas; `aprobar_devolucion` incluye stock + NC. Bien.
- **Concurrencia:** doble aprobación imposible (`for update`). **Dos registros a la vez de la misma línea** pasan los dos el `sum()` porque el `select` no bloquea (D5: `bloquea_filas=false`) `[código 0003:451-458]`. El `UNIQUE (devolucion_id, venta_item_id)` solo frena duplicados dentro de una misma devolución.
- **Idempotencia:** `crear_devolucion` no tiene `p_token` (D5: `usa_token=false`), a diferencia de `registrar_cambio` (que sí lo tiene, `20260919000100…:128-130`). Si la red se corta después del commit, el reintento crea otra pendiente por otra unidad. No hay cola offline de devoluciones (solo de ventas) `[código]`.
- **Cruce con cambios:** ni `crear_devolucion` ni `registrar_cambio` miran la otra tabla (D5: `menciona_cambios=false`); la pantalla lo cubre con `unidadesDisponibles`, la base no `[código + producción]`. La prenda volvería al stock dos veces.
- **Caída externa (una frase):** si SUNAT no responde, la aprobación no se cae —la NC queda reservada y se transmite después desde Facturación— **se degrada así, no pierde este dato**; si falta la serie de NC, aprobar se frena entero con mensaje claro (correcto: todo o nada).
- **Volumen (con números):** producción hoy: 18 ventas completadas en 15 días (todas las sedes, 0 sin comprobante) `[producción E5]`; 1 devolución, 1 línea, 1 cambio, 0 prendas dañadas `[volcado 2026-09-21]`. Supuesto mío, sin dato: 40 boletas/día por tienda × 3 tiendas × 3 años ≈ 130 mil ventas y, a 8 % de devolución, ~10 mil devoluciones — trivial para Postgres. No hay índice por `venta_item_id` en `devolucion_items` `[producción A2]` ni por `(ubicacion_id, estado)` en `devoluciones`; a 10 mil filas no importa, así que **no propongo índices**. Lo que sí muerde antes es `LIMITE_ACTIVIDAD = 30` (`ventas-v2.ts:75`): la lista dice «últimos 15 días» pero recorta a las 30 más nuevas; muerde desde ~2 boletas/día por tienda, o sea casi de inmediato una vez en vivo `[código]`.
- **Lente RLS / datos personales:** la lista trae nombre y DNI completos de `comprobantes` (`ventas-v2.ts:322-327`), visibles solo para la sede o líder (`comprobantes_select`, `0010_facturacion.sql:400-401`). No hay enmascarado; riesgo bajo, ver tarea #12. **Lente auditoría:** `movimientos` sale atribuido a quien aprueba (bien) y `solicitado_por`/`aprobado_por` existen, pero nada impide que sean la misma persona.

### Funciones (5)
- **Existen y funcionan:** buscador único, actividad de 15 días con filtros, flujo de 4 pasos con varias prendas en una devolución (una sola NC), «Por aprobar» con aprobar/rechazar, reembolso opcional con aviso de caja cerrada, cuarentena, NC automática, atajo «/», `?item=` desde Cambios `[código]`.
- **Fantasma (promesa sin lógica detrás):** **«Sin comprobante»** (`BuscadorVentas.tsx:144-148`) parece iniciar una devolución sin boleta, pero solo activa un filtro; una venta sin comprobante ni siquiera guarda quién compró (`ventas-v2.ts:77-79`). **«Escanear prenda»** no abre cámara: enfoca el campo para un lector físico (`BuscadorVentas.tsx:75-79`) — honesto en el comentario, no en el rótulo; medio fantasma.
- **Faltan para cumplir la finalidad:** (1) que la colaboradora sepa y diga qué recibe la clienta (cambio / nota de crédito o vale / plata); (2) un vale o saldo a favor de la clienta (R-37); (3) devolver una venta que nunca se registró (BACKLOG R-15); (4) un historial de devoluciones aprobadas y rechazadas en esta pantalla `[inferido: la pantalla muestra pendientes y marca «Con devolución 1»; no encontré lista de resueltas]`.
- **Sobran / se pueden fusionar:** el chip de plazo por línea (es de la boleta); «Rechazar» no da aviso de éxito mientras «Aprobar» sí (`DevolucionesPendientes.tsx:103-117`).

### Utilidad (5)
Escenario: **una clienta vuelve a los 8 días con una blusa negra talla L que no le queda.** La colaboradora nueva, en hora pico:
1. Va a Ventas → Devoluciones; escribe la boleta o escanea la prenda. ✔ Claro (captura 1).
2. Ve ~18 boletas con «INICIAR DEVOLUCIÓN» en cada línea. Duda si le corresponde primero un cambio (R-37): el cambio no está a la vista.
3. Paso 2 (captura 3): marca la blusa, cantidad 1 (¿cuántas? «quedan 6»). ✔ Se entiende. Si la boleta tiene 12 líneas, recorre la lista entera (captura 4).
4. Paso 3: motivo y estado. «Impecable» viene marcado por defecto (`itemInicial()`, `DevolucionesFlujo.tsx:65-67`): si no mira la prenda, el sistema le da ✓ en «Estado de cada prenda indicado» igual (captura 5). El estado decide si vuelve al piso o a cuarentena.
5. Paso 4: «Registrar devolución S/ 79.00» en rojo. Duda: ¿le doy la plata? El panel dice que la caja no se mueve.
6. Termina con «pendiente de aprobación». La clienta pregunta «¿y mi plata?»; la colaboradora no puede contestar y tiene que buscar a una líder. **El error o la duda no es de capacitación: el diseño no le da con qué responder.**
Sin mirar: ¿y si la clienta no trae boleta? Toca «Sin comprobante» y solo ve un filtro (§4 Funciones).

### Conexión con el ERP (6)
Ver §6.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | Directo: cola «Por aprobar» y plazo a la vista; indirecto: motivo y estado de cada prenda alimentan calidad, pero el motivo es texto (`motivo_codigo` sigue pendiente) y no hay historial de resueltas |
| Dinero y stock que toca | ×1 | 8 | Reembolso (arqueo de caja), entradas de stock, prendas dañadas y nota de crédito ante SUNAT |
| Frecuencia y personas que la usan | ×1 | 5 | En producción, 1 devolución frente a 18 ventas de 15 días (≈ 5 %, una muestra minúscula); la usa toda colaboradora de cada sede, pero no todos los días |
| Qué se detiene si falla | ×1 | 5 | La venta sigue; se detiene la atención posventa y, si falla mal, cuadra mal la caja |

Relevancia = (2·6 + 8 + 5 + 5) / 5 = **6.0** → **Soporte**. Sube a 7+ si el motivo se estructura y el volumen real de devoluciones resulta mayor.

## 6 · Conexión con el ERP

- **Aguas arriba:** `ventas`/`venta_items` (lo comprado y el descuento), `comprobantes` (nombre, DNI, aceptado o no), `cajas` (¿hay una abierta para el efectivo?), `variantes`/`productos` (foto, talla, color), `personas` (quién vendió), `cambios` (lo ya cambiado) `[código ventas-v2.ts]`.
- **Aguas abajo:** `movimientos` → `stock` (vía `fn_aplicar_movimiento`); `prendas_danadas` → cuarentena y `resolver_prenda_danada` (Existencias); `cerrar_caja` (resta reembolsos en efectivo aprobados de esa caja); `comprobantes` (nota de crédito) → Facturación/SUNAT; `cambios-estadisticas`/Resumen de inventario leen devoluciones `[código]`.
- **Pájaro dueño y vecinos:** Ventas y caja (`docs/datos/modulos/07`), con Facturación (08) e Inventario (05) como vecinos; `AVIARIO.md` no lo revisé línea por línea `[no verificable aquí]`.
- **Externos, y qué pasa si caen:** SUNAT/Nubefact solo en la NC, que se transmite aparte → la aprobación no depende de que SUNAT responda. Sin Culqi ni Shopify en este flujo.
- **Cifras de cabecera:** «Devoluciones hoy» cuenta **aprobaciones del día**, no registros (`devoluciones.ts:143-170`): una devolución registrada hoy y pendiente no aparece en ningún número de arriba; «Valor devuelto» es el valor **del mes** de lo aprobado, no el reembolso, y su rótulo no dice «este mes».

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Cerrar la escritura directa sobre las tablas de devoluciones
- **Dónde:** nueva migración `revoke insert, update, delete, truncate on retail.devoluciones, retail.devolucion_items, retail.prendas_danadas, retail.cambios from authenticated, anon;` (precedente: `20260915150000_movimientos_insert_solo_rpc.sql:84`; misma tarea ya propuesta para `colaboradores`, `docs/pantallas/colaboradores.md` #4). Las RPC son `security definer` con dueño `postgres`, no dependen del privilegio `[producción D4]`.
- **Por qué en este puesto:** es plata. Hoy cualquier colaboradora con sesión puede fabricar un reembolso en efectivo aprobado y hacer desaparecer un faltante del arqueo, o borrar una pendiente. Sin esto, todas las demás tareas de candados (#2, #3) son decorativas.
- **Cómo lo verificas tú:** con una sesión de **integrante** en la consola del navegador, `supabase.from('devoluciones').update({estado:'aprobada'}).eq('id', …)` devuelve `42501 permission denied`; después registra, aprueba, rechaza una devolución, resuelve una prenda de cuarentena y haz un cambio: todo sigue funcionando.
- **Esfuerzo / dependencias:** S. Ninguna; **antes** confirmar en local con `grep` que nada escribe directo (hecho: `apps/web` no escribe en esas 4 tablas). Es cambio de esquema en producción → lo confirma Felipe.

### #2 · Corregir — `crear_devolucion` con los candados que le faltan
- **Dónde:** nueva versión de `crear_devolucion` (hoy solo `0003_funciones.sql:420-466`), con `drop`+`create` para no dejar dos sobrecargas (BACKLOG ya avisa el riesgo con `registrar_cambio`). (a) `p_token uuid` + índice único parcial `devoluciones.token_cliente` (como `cambios_token_cliente_key`, `[producción A2]`); (b) `select … for update` sobre las `venta_items` implicadas; (c) sumar también `cambios` al tope de unidades (y el gemelo en `registrar_cambio`); (d) exigir `p_ubicacion_id = ventas.ubicacion_id`, o guardar la sede de reingreso como decisión explícita; (e) prueba SQL en `scripts/pruebas/`.
- **Por qué en este puesto:** cierra los tres huecos de stock (duplicado por reintento, carrera, doble reingreso cambio+devolución) y el de sede. Hoy solo la pantalla los tapa (`unidadesDisponibles`); un reintento con la red mala o una llamada directa los abre.
- **Cómo lo verificas tú:** (1) llamar `crear_devolucion` dos veces con el mismo `p_token` → devuelve la misma devolución, no dos; (2) dos llamadas simultáneas sobre la misma línea → una falla; (3) una línea con cambio hecho → «ya se cambió»; (4) una venta de TRU registrada desde AQP → error.
- **Esfuerzo / dependencias:** M. Tocar `registrar_cambio` en paralelo: coordinar con la sesión de Ventas (`ventas-visual-redesign-240e2b`). No antes de la #1.

### #3 · Corregir — `aprobar_devolucion`: quien registra no aprueba, y el reembolso tiene tope
- **Dónde:** `aprobar_devolucion` (vigente en `20260918070000…:85-218`): `if d.solicitado_por = v_persona then raise exception …` (salvo decisión expresa, ver #5); `if p_reembolso_monto > valor pagado (neto) then raise exception`; y el botón «Revisar y aprobar» (`DevolucionesFlujo.tsx:507`) solo para quien no la registró.
- **Por qué en este puesto:** la única devolución real fue autoaprobada en 5,6 s `[producción C1]`; un control que quien pide puede firmar no controla. Son dos `if` en la misma función que ya se toca en #4, así que se hacen juntas.
- **Cómo lo verificas tú:** como líder, registra una devolución y trata de aprobarla → error claro; con otra líder, apruébala. Prueba un reembolso de S/ 999 sobre una prenda de S/ 79 → error.
- **Esfuerzo / dependencias:** S. **Decisión de Felipe primero:** ¿qué pasa si en una tienda solo hay una líder ese día? (propuesta: otra líder de cualquier sede, o la propia con motivo escrito y marca `autoaprobada`). No antes de la #1.

### #4 · Corregir — Nota de crédito por lo que la clienta pagó, no por el precio de lista
- **Dónde:** `aprobar_devolucion`, cálculo de `v_total_devuelto` (`20260918070000…`, `sum(vi.precio_unitario * di.cantidad)`): debe ser `(precio_unitario − coalesce(descuento_unitario, 0)) × cantidad`. La pantalla ya muestra el neto (`devoluciones-reglas.ts:129`). Mismo hueco en la diferencia de Cambios (BACKLOG).
- **Por qué en este puesto:** es la única discrepancia entre lo que la pantalla promete y lo que se emite ante SUNAT; con descuento se acredita de más. Hoy no se ve porque el caso real no tenía descuento `[producción C2]`.
- **Cómo lo verificas tú:** vende una prenda de S/ 149.90 con S/ 15 de descuento, devuélvela con comprobante aceptado y compara el total de la NC con el «Lo que pagó» de la pantalla (deben ser iguales).
- **Esfuerzo / dependencias:** S. **Confirmar con Felipe y el contador antes de tocar** (movimiento de dinero real/tributario, CLAUDE.md). Junto con la #3 en una sola migración.

### #5 · Replantear — Devolución en el acto cuando es rutinaria; líder solo para excepciones
- **Dónde:** `crear_devolucion` (calcular en servidor plazo, condición y si hay reembolso) + `DevolucionesFlujo.tsx` (paso 4 y pantalla de éxito) + `DevolucionesPendientes.tsx` (la cola queda solo con excepciones). Ver §8.
- **Por qué en este puesto:** es la fricción de mostrador más grande y contradice R-38. **No la ordeno primero porque no se puede hacer antes de #1–#3**: aprobar por regla sobre una base que se deja escribir directo abre el mismo forado. Decide Felipe; esta tarea solo pide esa decisión.
- **Cómo lo verificas tú:** cuando esté decidida, una devolución en plazo, impecable y sin reembolso queda resuelta al terminar el paso 4, con el stock ya en el piso.
- **Esfuerzo / dependencias:** L. No antes de #1, #2 y #3.
- **DECIDÍ (propuesta, no ejecutada):** aprobar por regla en el servidor lo que R-38 llama rutina (en plazo + impecable + sin plata en efectivo); líder para lo demás.
- **DESCARTÉ:** dejar todo pendiente como hoy, porque exige a una líder presente por cada devolución de S/ 79 y, según R-38, el negocio no lo pide; y descartar el plazo por completo, porque hoy nada lo valida.
- **SE ROMPE SI:** una colaboradora marca «impecable» una prenda con mancha y la clienta se va con su valor: la prenda vuelve al piso sin revisión. Mitiga la cuarentena obligatoria para «defecto», pero «impecable» sigue siendo autodeclarado.

### #6 · Mejorar — R-37: el cambio primero, a la vista
- **Dónde:** `ComprasAgrupadas.tsx` (fila: acción «Cambiar» junto a «Devolver»), `DevolucionesFlujo.tsx:330-336` (la franja «¿Le sirve otra talla o color?» hoy al pie del paso 2), `BuscadorVentas.tsx`.
- **Por qué en este puesto:** el negocio dice que la devolución es el último recurso, y la pantalla lo esconde. Es una decisión de orden, no de backend. Toca piezas compartidas con Cambios.
- **Cómo lo verificas tú:** abre la lista con una boleta de 12 líneas: el cambio se ve sin bajar y sin haber elegido nada.
- **Esfuerzo / dependencias:** M. Coordinar con `ventas-visual-redesign-240e2b` (comparte los componentes).

### #7 · Mejorar — Que las cifras y la lista digan la verdad
- **Dónde:** `page.tsx:33-40` y `lib/devoluciones.ts:143-170` (rótulo «Devoluciones hoy» → «Aprobadas hoy»; «Valor devuelto» → «Valor devuelto este mes»; sumar «Por aprobar N»); `lib/ventas-v2.ts:75` (`LIMITE_ACTIVIDAD = 30`) y `DevolucionesPanel.tsx:219-252` (avisar «Mostrando las 30 más recientes de N; busca para ver otras»).
- **Por qué en este puesto:** hoy la lista recorta en silencio y dice «últimos 15 días»; en cuanto TRU pase de 2 boletas/día, una clienta de hace 10 días «no existe» hasta que se busca. Y una devolución registrada hoy no aparece en ningún número.
- **Cómo lo verificas tú:** con más de 30 boletas en 15 días, la lista dice cuántas hay; registra una devolución y la cabecera muestra «Por aprobar 1».
- **Esfuerzo / dependencias:** S. Ninguna.

### #8 · Mejorar — El plazo es de la boleta: un chip por compra y una acción por compra
- **Dónde:** `ComprasAgrupadas.tsx` (chip del encabezado de la boleta, no por línea; el chip solo con «Vence en N días» o «Fuera del plazo»; conservar el color pedido en ADR-0122), botón «Devolver de esta boleta» además del por línea.
- **Por qué en este puesto:** 30+ chips verdes idénticos y 30+ botones negros tapan lo que sí importa (una boleta a punto de vencer). Tensión con el pedido de Felipe (ADR-0122, color por plazo): **decide Felipe** si el verde va siempre visible o solo cuando hay algo que decir.
- **Cómo lo verificas tú:** la captura de la lista se lee de un vistazo: un solo chip rojo o ámbar destaca entre las boletas.
- **Esfuerzo / dependencias:** M. Coordinar con la sesión de Ventas (componente compartido).

### #9 · Mejorar — Motivo estructurado (`motivo_codigo`)
- **Dónde:** `devoluciones.motivo_codigo` con `CHECK` (los cinco de `devoluciones-reglas.ts:22-28`), en `crear_devolucion`; el detalle sigue en `motivo`.
- **Por qué en este puesto:** es lo que hace que Devoluciones alimente decisiones (¿qué producto vuelve por defecto? ¿qué talla no calza?); hoy es texto libre concatenado, sumable solo con `group by` frágil. Sube la relevancia de Gestión.
- **Cómo lo verificas tú:** `select motivo_codigo, count(*) from retail.devoluciones group by 1` da cinco categorías limpias.
- **Esfuerzo / dependencias:** S–M. Mismo archivo de migración que #2 (una sola `crear_devolucion`); no antes de la #2.

### #10 · Mejorar — Vale o saldo a favor de la clienta (R-37)
- **Dónde:** decisión de negocio primero (¿el «vale» es una nota de crédito de SUNAT o un saldo interno?), después tabla y RPC nuevas, y una tercera opción en «¿Se le reembolsa algo?» (`DevolucionesPendientes.tsx:201-252`).
- **Por qué en este puesto:** R-37 nombra el vale como segunda opción; sin él la aprobación «sin reembolso» deja S/ 79 sin dueño: el stock entró, la NC (si aplica) se emitió y ningún registro dice qué se le debe a la clienta. Hoy con 1 devolución no duele; con TRU en vivo, sí.
- **Cómo lo verificas tú:** aprobar una devolución eligiendo «Vale» deja un saldo consultable de esa clienta.
- **Esfuerzo / dependencias:** L. No antes de la #5 y de una decisión de Felipe (concepto nuevo: se explica con `/explica`).

### #11 · Mejorar — Pulido de jerarquía y accesibilidad
- **Dónde:** `FlujoGuiado.tsx:298` (`BotonRojo`: en Confirmación, botón en tinta y el monto como texto, el rojo reservado para «Rechazar»/irreversible); `DevolucionesFlujo.tsx:284-290` (checkbox de 16 px → control de 24+ con área de 44); `DevolucionesVentas.tsx:35-45` («Anular venta» a botón de 44 px); SKU a 12 px con más contraste; `DevolucionesPendientes.tsx:103-117` (aviso de éxito al rechazar); estado «Impecable» sin preseleccionar o con un aviso al confirmar que no se miró la prenda.
- **Por qué en este puesto:** cada uno es pequeño, pero juntos quitan el «¿le doy plata?» del botón rojo y el ✓ regalado de «Estado de cada prenda indicado».
- **Cómo lo verificas tú:** en una tablet, marca una prenda con el pulgar sin fallar; el botón final ya no se lee como salida de dinero.
- **Esfuerzo / dependencias:** S. Ninguna.

### #12 · Eliminar/fusionar/conectar — *bajo valor / opcional*: rótulos honestos y DNI enmascarado
- **Dónde:** `BuscadorVentas.tsx:140-148` («Sin comprobante» → «Ventas sin comprobante»; «Escanear prenda» → «Escanear (lector)»), `ventas-v2.ts:322-327` y `DevolucionesVentas.tsx` (DNI como `••••4223`).
- **Por qué en este puesto (bajo valor):** hoy nadie se equivoca gravemente (0 sin comprobante en 15 días `[producción E5]`) y el DNI solo lo ve la sede; el rótulo honesto evita una promesa vacía. Devolver una venta sin registrar (R-15) es aparte y depende de decisión de negocio.
- **Cómo lo verificas tú:** el chip dice lo que hace; la tarjeta ya no muestra el DNI completo.
- **Esfuerzo / dependencias:** S. Ninguna.

## 8 · Estrategia alternativa

Nace de la #5 y decide Felipe; no cambia el orden de las 12.

**A · Como está, con candados (#1–#4).** Ganas: cambio pequeño y seguro; todo pasa por un líder, que es lo que hoy se cree que ocurre. Pagas: cada devolución pide una líder presente (la clienta espera), la cola de «Por aprobar» se llena de rutina que se aprueba en segundos (la única aprobada tardó 5,6 s) y se sigue contradiciendo R-38.

**B · Regla en el servidor: la rutina se resuelve en el mostrador.** En plazo + impecable + sin reembolso en efectivo → `crear_devolucion` la aprueba en el acto (stock al piso, atribuido a quien la registra); fuera de plazo, con defecto, con reembolso en efectivo o de otra sede → queda pendiente para un líder. Ganas: cumple R-38, la clienta sale resuelta, la cola de líder solo tiene lo que de verdad necesita ojos (cada aprobación pesa), y el plazo pasa a validarse en la base. Pagas: una migración mayor de `crear_devolucion`; el plazo deja de vivir solo en TS (hay que llevarlo a una tabla de configuración); y «impecable» es autodeclarado, así que una colaboradora puede devolver al piso una prenda dañada (riesgo de stock, no de caja).

**C · Igual que B, pero «impecable» lo confirma una segunda persona con un toque** (una líder o cualquiera distinta, en el mismo mostrador). Ganas: cubre el riesgo de B sin cola aparte. Pagas: sigue necesitando una segunda persona en hora pico; es una versión atenuada de A.

Mi recomendación: **B**, después de #1–#3, porque el negocio ya lo dijo (R-38) y porque una aprobación que siempre se da en 5 segundos no controla nada. Decide Felipe.

## 9 · Referentes de ERP y futuro

Todo lo de esta sección viene de memoria y no está verificado contra los productos.
- **Shopify POS / Lightspeed (punto de venta):** devolución contra la venta original, con elección explícita del destino del stock y del medio de reembolso o crédito en el mismo momento. Es el modelo de #5.
- **Odoo / NetSuite (inventario):** retorno con estado de la prenda y ubicación de reingreso. CAYLA ya lo hace con cuarentena.
- **Futuro, no cuenta entre las 12:** cámara real para «Escanear prenda» (hoy alcanza el lector físico); nota de crédito transmitida en línea desde esta pantalla; portal de la clienta para pedir su devolución; cola offline de devoluciones (hoy solo hay de ventas): solo importa si TRU pierde internet a menudo; analítica de tasa de devolución por producto (necesita #9).

## 10 · Fuera de esta pantalla

**El defecto de la #1 no es de Devoluciones: es de todo el esquema `retail`.** `0005_grants.sql` dio `select, insert, update, delete` a `authenticated` sobre **todas** las tablas del esquema, y las migraciones solo lo revocaron en cuatro (`movimientos`, `historial_producto_cambios`, `costo_historial`, `transferencia_recepciones`) `[código: grep de REVOKE, puede haber otras sintaxis]`. `docs/pantallas/colaboradores.md` ya encontró lo mismo en `colaboradores`. Si se confirma en producción, cualquier colaboradora con sesión podría editar desde la consola tablas como `stock` (que el principio 4 dice que nunca se edita a mano), `cajas` (`monto_cierre_sistema`, `diferencia`), `venta_pagos` o `comprobantes`, limitada solo por la RLS de sede. ADR-0143 cerró dos RPC pero no las tablas. Es una sola tarea raíz (un barrido, no una por pantalla); para verla, corre en producción:

```sql
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'retail' and grantee = 'authenticated'
  and privilege_type in ('INSERT','UPDATE','DELETE')
group by 1 order by 1;
```

Cada tabla que salga y que solo se escriba por RPC es una candidata a `revoke`, con la misma verificación de la #1.

## 11 · Líneas propuestas para BACKLOG.md

- [ ] `[pantalla:devoluciones]` #1 Revocar INSERT/UPDATE/DELETE de `devoluciones`, `devolucion_items`, `prendas_danadas`, `cambios` a `authenticated` (migración) — S
- [ ] `[pantalla:devoluciones]` #2 `crear_devolucion` v2: token de idempotencia, `for update`, cruce con `cambios`, sede de la venta — M
- [ ] `[pantalla:devoluciones]` #3 `aprobar_devolucion`: quien registra no aprueba; tope de reembolso — S
- [ ] `[pantalla:devoluciones]` #4 Nota de crédito por el neto pagado (descuento) — S (confirmar con contador)
- [ ] `[pantalla:devoluciones]` #5 Decidir la estrategia alternativa B: devolución rutinaria en el acto (R-38) — L
- [ ] `[pantalla:devoluciones]` #6 «Cambiar» a la vista antes de «Devolver» (R-37) — M
- [ ] `[pantalla:devoluciones]` #7 Rótulos de cabecera y aviso del tope de 30 en la lista — S
- [ ] `[pantalla:devoluciones]` #8 Un chip y una acción por boleta, no por línea — M
- [ ] `[pantalla:devoluciones]` #9 `devoluciones.motivo_codigo` estructurado — S–M
- [ ] `[pantalla:devoluciones]` #10 Vale o saldo a favor de la clienta (R-37) — L
- [ ] `[pantalla:devoluciones]` #11 Pulido: botón rojo, táctil, aviso al rechazar, «Impecable» — S
- [ ] `[pantalla:devoluciones]` #12 (bajo valor) Rótulos honestos de «Sin comprobante»/«Escanear» y DNI enmascarado — S
- [ ] `[pantalla:devoluciones]` RAÍZ Barrido de escritura directa para `authenticated` en todo `retail` (ver §10) — M

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Cifras (hoy / mes / valor) | Cuenta aprobaciones y su valor pagado | ajustar (rótulos, falta «Por aprobar») | `[código devoluciones.ts:143-170]` |
| Iniciar | Buscador único + atajo «/» | Busca boleta, DNI, clienta, prenda, código | bien | `[código BuscadorVentas.tsx]` |
| Iniciar | «Escanear prenda» | Enfoca el campo para lector físico | ajustar (rótulo) | `[código BuscadorVentas.tsx:75-79]` |
| Iniciar | «Sin comprobante» | Solo filtra la lista | ajustar / fantasma | `[código BuscadorVentas.tsx:144-148]` |
| Iniciar | «Buscar en <sede>» | Líder busca en otras sedes | bien (falta candado de sede en base) | `[código page.tsx:20]` |
| Actividad | Timeline por día | Agrupa compras de 15 días | bien | `[visto 1-2]` |
| Actividad | Filtros Todas / Con devolución / Sin comprobante | Filtra en cliente | bien | `[visto 1]` |
| Actividad | Chip «Dentro del plazo» por línea | Dice el plazo | ajustar (por boleta) | `[visto 1-2]` |
| Actividad | «Iniciar devolución» por línea | Abre el flujo | ajustar (una por boleta + cambio) | `[visto 1-2]` |
| Actividad | «Anular venta» | Solo líder; abre modal | bien (botón pequeño) | `[código DevolucionesVentas.tsx:35-45]` |
| Flujo | Stepper de 4 pasos | Guía y da foco | bien | `[código FlujoGuiado.tsx:103-146]` |
| Flujo | Paso 2 (prendas y cantidad) | Elige varias líneas | bien (lista larga sin buscar) | `[visto 3-4]` |
| Flujo | Paso 3 (motivo y estado) | Motivo, nota y estado | ajustar («Impecable» por defecto) | `[código DevolucionesFlujo.tsx:65-67]` |
| Flujo | Paso 4 (confirmación) | Resumen e impacto | bien; botón rojo con monto ajustar | `[visto 6]` |
| Flujo | «Por aprobar» | Aprobar/rechazar con reembolso | bien; falta candado de autoaprobación | `[código DevolucionesPendientes.tsx]` |
| — | Vale / saldo a favor | — | falta | `[código: no existe]` |
| — | Historial de resueltas | — | falta | `[inferido]` |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 5/10 | 6.0/10 — Soporte | — (primer análisis) |
| 2026-09-22 | — (sin re-evaluar; pedido puntual de Felipe, no una nueva pasada completa) | — | — | #8 — un chip y una acción por boleta, no por línea (`docs/BACKLOG.md`, `apps/web/components/DevolucionesVentas.tsx`) |
