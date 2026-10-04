# Pantalla — Recibir mercadería (`/recibir`)

> Modo: completo · Fecha: 2026-10-03 · Rol/sede: líder, Tienda TRU · Datos: **real** (consulta de solo lectura corrida por Felipe en producción el 2026-10-03, bloques 1 a 9)
> SHA analizado: `b4cb05c3` (la rama iba 0/0). `main` avanzó después (`ae22874d`) y no tocó ninguno de estos archivos — si lo hace, este análisis está vencido.
> Archivos: `app/(app)/recibir/{layout,loading,page}.tsx` · `components/RecepcionEnvio.tsx` (1.844 líneas) · `ResumenPrevioEnvio` · `EnvioRecibido` · `KpisRecibir` · `AvisoTrasladosEnCamino` · `RecepcionesCompraLista` · `RecepcionVistaRapida` · `FiltrosRecibidas` · `PorRegularizarLista` · `ui/Pestanas.tsx` · `lib/{por-regularizar,por-regularizar-reglas,envio-reglas,recepciones-reglas,recibidas-filtros-reglas,useColaRecibir,compras}.ts` · RPC `recibir_envio`, `recibir_compras`, `cerrar_linea_compra`, `recibir_lote`, `regularizar_prenda`, `listar_recepciones_compras`, `resumen_recepciones`, `listar_compras_operativo` · tablas `compras`, `compra_items`, `compra_item_cierres`, `envios`, `lotes`, `envio_extras`, `movimientos`, `stock`, `prendas_por_regularizar`
> Otra sesión tocándola: **sí** — `claude/traslados-window-empty-625dcb` (ADR-0299). Su migración `20261001140000` **ya está en producción** (bloque 5: `recibir_envio` trae `ADR-0299=true`); la fila de `docs/SESIONES-ACTIVAS.md` que dice «sin pegar» está vencida. El PR #773 (de este análisis) toca `por-regularizar*` y `PorRegularizarLista.tsx`.

## 0 · Veredicto

La pantalla se diseñó para recibir contra la factura de un proveedor, y esa parte tiene **cero uso en producción** (`compras`, `lotes` y `envios`, 0 filas). El trabajo que sí ocurre aquí es el de la tercera pestaña: **217 ventas «sin registrar» pendientes, el 87 % de todas las líneas de venta (218 de 251)**, creciendo de 31 a 84 por día, sin una sola regularizada, en una pestaña sin contador y con un diseño de una prenda por vez.
La parte de proveedor está bien construida (una transacción, token anti doble clic, candados en tabla) pero sin rodar nunca; la parte que se usa tenía un tope de 200 filas que ya se pasó (PR #773 lo corrige, falta publicarlo).

**Cumple su finalidad:** 5,0/10 (promedio 5,3, con tope 5 por un defecto vivo de stock) · **Relevancia:** 8,0/10 — **Núcleo**

## 1 · Finalidad declarada

«Esta pantalla existe para que la mercadería de un proveedor entre al stock de la sede, contada contra su comprobante (un envío puede traer varios proveedores), y para que almacén una cada prenda vendida antes de estar en el sistema con su prenda real.» Fuentes: ADR-0113 (recibir por envío), ADR-0299 (Recibir es solo de proveedores; los traslados se reciben en Traslados), ADR-0179 (prendas sin registrar), ADR-0035 (la factura es el eje) — no la captura.
¿Docs y pantalla coinciden? **Sí en lo que dicen, no en lo que pesa:** los ADR describen la regularización como una excepción puntual («en hora punta llegan prendas sin etiquetar»); producción dice que es la regla (87 %). Manda producción.

## 2 · Objeción

**El módulo se diseñó alrededor de lo que no se usa y esconde lo que sí.** La pantalla abre en «Pendientes» (comprobantes de proveedor: 0 en producción) y dice «No hay comprobantes…», mientras el trabajo real —217 ventas sin descontar del stock, S/ 10.598,46 cobrados— vive en la tercera pestaña, sin número, resuelto una por una en una ventana. A 84 por día nuevas, almacén gastaría unos 40 minutos diarios solo en regularizar (a ~30 s cada una, `[inferido]`), y hoy no se regulariza ninguna.
El trade-off: tratar la excepción como regla exige decidir **por qué** caja vende así (¿catálogo de AQP sin cargar?, ¿falta de etiquetas?) antes de construir más pantalla; arreglar solo la pantalla (lote, contador) vacía la cola sin cerrar el grifo. Ver tarea #2.

## 3 · Lo que está bien y no se toca

- **Recibir de proveedor es una sola transacción con token.** `recibir_envio` escribe envío, lotes por proveedor, movimientos, stock y costo en una llamada; reintentar con el mismo token no duplica (`envios_token_cliente_key` y `lotes_token_cliente_key`, índices únicos parciales) `[producción bloque 7]` `[código RecepcionEnvio.tsx:246,669]`.
- **No se puede recibir más de lo facturado.** `compras_no_sobrerecibida` (`recibido + cerrado ≤ facturado`) existe en producción como CHECK de tabla `[producción bloque 7]`.
- **Escribir directo está cerrado donde importa.** `lotes`, `envios`, `envio_extras`, `movimientos`, `stock` y `prendas_por_regularizar`: RLS activo y `authenticated` sin INSERT/UPDATE/DELETE `[producción bloque 6]`. 0 funciones `security definer` sin `search_path` en todo `retail` `[producción bloque 8]`.
- **ADR-0299 aplicada:** `recibir_envio` rechaza traslados; `recibir_lote` y `recibir_envio` llevan el tope de costo atípico `[producción bloque 5]`.
- **Una prenda sin registrar no puede quedar a medias:** `prendas_por_regularizar_completa` (regularizada ⇔ trae todo), `venta_item_id` único y FK a la línea de venta `[producción bloque 7]`; la función bloquea la fila (`for update`) y rechaza regularizar dos veces `[código 20260923162300:46-56]`.
- **El faltante tiene salida con razón:** `no_llego`, `danada`, `error_proveedor` (CHECK `compra_item_cierres_motivo_check`) `[producción]`.
- **Cola sin conexión** para recibir (`useColaRecibir`, mismo token al reintentar) `[código, mapa del subagente]`.

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | Coherente con CAYLA, pero la puerta más usada (Ingreso sin comprobante) es un enlace gris de 12 px y la sede aparece 3 veces | `[visto]` `[código page.tsx:72-97]` |
| Lógica de negocio | 4 | La excepción de ADR-0179 es hoy el 87 % de las ventas; quien vendió puede regularizar su propia venta | `[producción]` `[código]` |
| Arquitectura | 7 | Transacción, token, candados y RLS sólidos; tope de 200 filas (corregido en #773), 80 lotes en memoria, sin deshacer, grants vivos | `[producción]` `[código]` |
| Funciones | 5 | Recibir existe y funciona; faltan regularizar en lote y deshacer; hay controles fantasma | `[código]` `[mapa]` |
| Utilidad | 4 | La colaboradora aterriza en una pestaña vacía mientras su trabajo está en otra sin aviso | `[visto]` `[inferido]` |
| Conexión con el ERP | 6 | Bien cableada a movimientos, stock, costo y Actividad; Existencias no ve la cola y 0 uso real de la cadena proveedor→costo→deuda | `[producción]` `[código]` |

### Datos de producción (2026-10-03, consulta de Felipe)
- **Volumen:** `compras` 0 · `compra_items` 0 · `compra_item_cierres` 0 · `envios` 0 · `lotes` 0 · `envio_extras` 0 · `envio_traslados` 0 · `transferencia_recepciones` 0 · `proveedores` 81 · `marca_proveedores` 87 · `movimientos` 851 · `venta_items` 251 · `transferencias` 4 (1 `en_transito` de hace 16 días).
- **Cómo entró el stock:** `entrada/carga_inicial` 550 filas, 766 u; traslados internos 172 filas; `ajuste` 94 filas (conteos y reposición); `salida/venta` **33** filas. Cero `entrada/recepcion`.
- **Por regularizar:** 217 pendientes (S/ 10.598,46), 1 anulada, **0 regularizadas**; AQP 159 y TRU 58; la más vieja, de hace 3 días. Por día: 28-sep 1 · 30-sep 31 · 1-oct 39 · 2-oct 63 · 3-oct 84. Líneas «sin registrar» / total de líneas de venta: 218 / 251. Al menos 70 ya pasaron los 2 días (vencidas).
- **Roles con el módulo `recibir`:** Integrante, Terminal Almacén y **Terminal de ventas** (este último sin `traslados`).

### Estética
(a) **Coherencia con CAYLA** `[visto]`: crema y tinta, un solo rojo (el subrayado de la pestaña), `card-cayla`; sin sombras sueltas. Pero el módulo de Compras no tiene cabecera decidida (CLAUDE.md, ADR-0220), así que el H1 de 24 px difiere de Ventas/Inventario (46 px con `EncabezadoPagina`) — pregunta abierta para Felipe, no tarea mía.
(b) **Marca y tono** `[visto]` `[código page.tsx:78-85]`: el texto principal dice «Cada prenda entra como movimiento — el stock no se edita a mano». Es un principio interno de arquitectura, no una instrucción para quien recibe; sobra.
(c) **Heurísticas** `[visto]`: la línea de texto mide ~130 caracteres a 2000 px (sin ancho máximo); la tarjeta vacía ocupa todo el ancho con texto de 14 px; «TIENDA TRU» se repite arriba a la derecha, en el eyebrow y en el párrafo; la etiqueta del lateral «Notas de crédito de prove…» sale cortada sin puntos suspensivos; las pestañas no tienen números aunque `Pestanas` ya sabe pintarlos (`ui/Pestanas.tsx:31,77`); el enlace «Ingreso sin comprobante» tiene `text-xs text-tinta/55` (contraste bajo) y es la ruta del 30 % de las compras (R-07).

### Lógica de negocio
- **R-07** (`15-COMO-OPERA-CAYLA.md`): más del 30 % de las compras llega sin factura. La puerta para eso («Ingreso sin comprobante», `/inventario/recibir`, `recibir_lote`) es una nota al pie, y `lotes` tiene 0 filas: nadie la ha usado `[producción]`.
- **ADR-0179** diseñó la regularización como cola corta con plazo de 2 días y aviso al líder. Con 217 pendientes todas vencen o vencerán; el aviso del inicio (`contarVencidas`) ya dirá un número alto y nadie lo atiende. Ninguna decisión escrita cubre cuántas pendientes son aceptables ni qué se hace cuando la cola supera lo que almacén puede regularizar.
- **Sin separación de funciones** `[código 20260923162300:25-56]`: `regularizar_prenda` no compara `vendido_por` con quien regulariza; solo exige operar la sede. `diferencia = cobrado − oficial` es la señal de descuentos no planificados, y quien vendió elige la «prenda real» que fija el oficial. Con el módulo `recibir` en Integrante y en Terminal de ventas `[producción bloque 4]`, el mismo mostrador vende y cuadra. No hay una D-nn que lo cubra.
- **Costo** (fuera de esta pantalla, ver §10): el primer envío real recalculará `variantes.costo` como promedio sobre un stock de carga inicial.
- **Referentes** `[no verificado, de memoria]`: Odoo ofrece crear un «pedido pendiente» o cerrar el faltante al validar una recepción (CAYLA ya tiene el cierre con motivo); Shopify POS y Lightspeed permiten una «venta personalizada» sin inventario y no reconcilian después. Ninguno resuelve «217 ventas sin prenda» con una cola 1×1: el patrón común es corregir el catálogo antes de vender.

### Arquitectura
Cadena: `page.tsx` → `RecepcionEnvio` → `recibir_envio` → `recibir_compras` / `cerrar_linea_compra` / `fn_aplicar_movimiento` → `envios`, `lotes`, `movimientos`, `stock`, `variantes.costo`, `compra_item_cierres` (triggers actualizan `compras.recibido_cantidad`/`cerrado_cantidad`) `[mapa del subagente]`.
- **Estados imposibles:** recibir más de lo facturado (CHECK), regularizar a medias (CHECK), dos veces la misma venta (UNIQUE) `[producción]`.
- **Transacción:** una sola llamada RPC por recepción y por regularización. `regularizar_prenda` mueve movimientos, stock, línea de venta y fila pendiente juntos.
- **Concurrencia:** dos sedes sobre el mismo comprobante se serializan por el candado de la línea (`fn_bloquear_en_orden`); dos regularizaciones de la misma prenda, por `for update` + `prenda_ya_regularizada` `[código]`.
- **Caída externa:** sin integración externa (no pasa por SUNAT). Se degrada así: sin red o 5xx/408/429, la recepción va a una cola local con su token y sube sola; no pierde el conteo (`error-escritura.ts:604`). **Regularizar no tiene cola ni token**: sin red, falla con mensaje y se reintenta a mano (aceptable: es una acción sobre una fila ya existente).
- **Volumen con números:** 84 pendientes nuevas por día y subiendo → >1.000 filas en unos 10 días, ~2.500 en un mes, ~29.000 al año si nada cambia `[inferido de 4 días]`. Hoy `Tabla` pinta todas las filas visibles sin paginar ni virtualizar. La lectura por páginas (`leerTodas`) del PR #773 aguanta ese volumen; la tabla del navegador, no.
- **Defecto vivo (corregido en #773, sin publicar):** `getPorRegularizar` pedía `.limit(200)` por fecha descendente; con 217 pendientes la pantalla muestra 200, esconde las 18 más viejas y falsea sus cuatro cifras.
- **Lecturas con tope silencioso:** `getRecepcionesRecientes` lee 80 lotes y filtra en memoria; las dos RPC de Recibidas filtran por todas las sedes operables mientras el encabezado dice una sede `[mapa del subagente]`. Hoy sin consecuencia (0 lotes).
- **Grants vivos** `[producción bloque 6]`: `compras` y `compra_items` siguen con INSERT/UPDATE/DELETE para `authenticated` (la RLS solo-SELECT los frena), a diferencia de `lotes`, `envios`, `movimientos`, `stock`: una política mal puesta los abriría. `lotes` tiene una política INSERT muerta (sin privilegio).
- **Lentes:** RLS (cubierto), datos personales (la pantalla muestra el nombre de quien vendió; viene de `fn_nombres_personas`), auditoría (ADR-0207 ya anota Recibir y Regularizar en Actividad).

### Funciones
- **Existen y funcionan:** marcar comprobantes, contar (+ «Todo llegó / Nada llegó»), escáner por pistola, recibir con diferencia, cierre de faltante con motivo (líder), confirmar con responsable, cola sin conexión, aviso de traslados en camino, historial de recibidas con cajón, regularizar una prenda `[código]`.
- **Fantasma o sin salida** `[mapa del subagente, no verificado en el navegador]`: el combo «Entra al almacén de» (`RecepcionEnvio.tsx:1095`) es inalcanzable porque la página pasa una sola sede (el campo de solo lectura, `:1101`, es el que se ve); `p_notas_credito` se manda siempre `[]`; los filtros de Pendientes por URL (`q`, `prov`, `tipo`, `desde`, `hasta`) no tienen ningún control en pantalla.
- **Faltan:** regularizar en lote; buscar por descripción/categoría/talla en Por regularizar (solo hay filtro por vendedora); contador en las pestañas; deshacer o corregir una recepción (`anular_compra` se niega si ya hay recibido); imprimir recibo (no existe y no se pide).
- **Sobran:** el párrafo de principio interno; la repetición del enlace «Ingreso sin comprobante» (dos veces en la misma pantalla vacía); los controles fantasma de arriba.

### Utilidad (persona sin contexto)
Escenario: **una colaboradora nueva de almacén de AQP, lunes en la mañana.** Abre el menú, entra a «Recibir mercadería» y aterriza en «Pendientes»: «No hay comprobantes con mercadería pendiente de recibir.» Concluye que no hay nada que hacer `[visto]`. No sabe que la tercera pestaña, sin número ni color, guarda 159 prendas de su sede (`[producción]`); si la abre, cada fila pide «Regularizar», una ventana, elegir la prenda real de un catálogo de ~700 y responder si «perdió la etiqueta» o «llegó nueva» `[código PorRegularizarLista]`. Si algo duda es esa pregunta: la regla de «se cuenta lo físico» es de almacén, no del idioma de la colaboradora. Y al llegar un envío de verdad, la puerta sin comprobante es una línea chica. El fallo es del diseño: el sistema sabe dónde está el trabajo y no lo dice.

### Conexión con el ERP
- **Aguas arriba:** Compras (`compras`, `compra_items`, reparto por sede), Vender (`registrar_venta` crea las filas pendientes), Catálogo (la prenda real que se elige), Proveedores (81).
- **Aguas abajo:** `movimientos` → `stock` → Existencias/Movimientos/Análisis; `variantes.costo` (promedio); Etiquetas de precio (imprimir tras recibir); Por pagar (la deuda sale de la factura, no de aquí); Inicio (aviso de vencidas, conteo exacto); Actividad.
- **Pájaro dueño y vecinos:** 05 · Halcón (envíos y lotes, `menu.ts:357`); vecino de 09 · Pelícano (facturas) y de Traslados (ADR-0299).
- **Externos y qué pasa si caen:** ninguno. Producción de CAYLA tiene su propio «Recibir» (`/produccion/recibir`, tela y avíos) con etiqueta parecida: dos pantallas, dos módulos (`menu.ts:262`).

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Cada recepción fija stock y costo, y cada regularización fija qué prenda se vendió y a qué descuento; de eso dependen reposición, rotación y margen |
| Dinero y stock que toca | ×1 | 9 | 217 ventas (S/ 10.598,46) sin descontar del stock más toda la mercadería que entre de proveedores |
| Frecuencia y personas que la usan | ×1 | 7 | La cola de regularizar crece a diario (84/día); la parte de proveedor aún no se estrena |
| Qué se detiene si falla | ×1 | 8 | Sin Recibir, la mercadería comprada no entra al stock; sin regularizar, el stock sobra y el costo de lo vendido queda sin dato |

Relevancia = (2·8 + 9 + 7 + 8) / 5 = **8,0** — Núcleo.

## 6 · Conexión con el ERP
Ver §4 «Conexión con el ERP».

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Publicar el arreglo del tope de 200 (PR #773) — ya en revisión
- **Dónde:** `lib/por-regularizar.ts` (`getPorRegularizar`), `lib/por-regularizar-reglas.ts` (`resueltasDesde`), `components/PorRegularizarLista.tsx`.
- **Por qué en este puesto:** el defecto ya está pasando: 217 pendientes, la pantalla muestra 200, esconde las 18 más viejas y sus cifras no coinciden con las del inicio. Es solo web, sin SQL.
- **Cómo lo verificas tú:** tras publicar, en `/recibir?vista=por-regularizar` la tarjeta «Por regularizar» debe decir **217** (o más), y «Vencidas» debe coincidir con la cifra de vencidas del Inicio.
- **Esfuerzo / dependencias:** S (hecho) · fusionar #773.

### #2 · [Replantear] La excepción es el 87 % de las ventas: decidir la estrategia (ver §8)
- **Dónde:** ADR-0179; `registrar_venta` (crea la fila pendiente); carga de catálogo/stock de AQP y TRU; `prendas_por_regularizar`.
- **Por qué en este puesto:** sin la causa, cualquier mejora a la pantalla solo ordena un grifo abierto. Hay una pregunta que Felipe responde en un minuto: ¿por qué caja no encuentra estas prendas en el catálogo? (los números sugieren AQP: 159 de 217).
- **Cómo lo verificas tú:** la consulta de la sección §10 por sede; si `carga_inicial` de AQP es mucho menor que la de TRU, la causa es la carga.
- **Esfuerzo / dependencias:** decisión de Felipe · antes de la #3.
- **DECIDÍ (recomendado, decide Felipe):** cerrar la causa (completar la carga de AQP) y, mientras tanto, dar la regularización en lote (#3) para vaciar los 217.
- **DESCARTÉ:** regularización automática por coincidencia de categoría + talla + color, porque esa tríada admite varios precios y una coincidencia equivocada cuadra el stock con la prenda equivocada, que es peor que un pendiente visible.
- **SE ROMPE SI:** AQP sigue vendiendo con el catálogo vacío en una campaña y entran 150 por día: ni el lote alcanza (almacén sin tiempo) y solo cerrar la causa sirve.

### #3 · [Mejorar] Regularizar en lote
- **Dónde:** `PorRegularizarLista.tsx` (selección múltiple + «una prenda y una forma para N filas») y una RPC nueva `regularizar_prendas_lote` (todo o nada, con las mismas reglas que `regularizar_prenda`, `supabase/migrations/20260923162300_regularizar_prenda.sql`).
- **Por qué en este puesto:** 217 ventanas de ~30 s son unas 1,8 h; 84 nuevas por día son ~40 min diarios. Es lo único que vacía la cola mientras la #2 cierra el grifo. Nueva RPC = contrato nuevo: propongo, no ejecuto sin tu ok.
- **Cómo lo verificas tú:** elegir 10 pendientes iguales («Blusa beige M»), una prenda y «ya estaba registrada»: las 10 pasan a regularizadas, el stock baja 10 y `movimientos` tiene 10 salidas `venta`; si una falla, ninguna cambia.
- **Esfuerzo / dependencias:** L · después de la #2 (qué forma tiene la regularización).

### #4 · [Corregir] Quien vendió una prenda no la regulariza
- **Dónde:** `regularizar_prenda` (`20260923162300_regularizar_prenda.sql:25-56`, sin `vendido_por`); módulo `recibir` en Integrante, Terminal Almacén y Terminal de ventas.
- **Por qué en este puesto:** `diferencia` es la señal de descuentos no planificados y quien vendió elige la prenda que fija el precio oficial. Es una decisión de negocio de Felipe (¿vale para el líder? ¿para el Terminal de ventas?). La función viva puede diferir del archivo: se parcha por ancla sobre `pg_get_functiondef`, no copiando el repo.
- **Cómo lo verificas tú:** con el usuario que vendió una línea, «Regularizar» responde «no puedes regularizar tu propia venta»; con otro usuario, sí.
- **Esfuerzo / dependencias:** M · independiente.

### #5 · [Mejorar] Ensayar el primer envío real de punta a punta
- **Dónde:** `recibir_envio`/`recibir_lote` y `fn_recalcular_costo_variante`; `pnpm pruebas:recibir-envio`.
- **Por qué en este puesto:** la cadena proveedor → stock → costo → deuda tiene 0 filas en producción; el primer envío real la estrena con un stock cargado desde cero. Si esas prendas tienen costo 0, el promedio se diluye (ver §10).
- **Cómo lo verificas tú:** un comprobante de prueba, 3 prendas en TRU: `lotes` 1, `movimientos` 3 `entrada/recepcion`, `variantes.costo` igual al del comprobante (no un promedio con 0).
- **Esfuerzo / dependencias:** S · antes del primer envío de verdad.

### #6 · [Mejorar] Pestañas con contador y aterrizaje en donde hay trabajo
- **Dónde:** `page.tsx:100-109` (`Pestanas` ya acepta `conteo`, `ui/Pestanas.tsx:31,77`); el cálculo de pendientes y vencidas ya existe (`contarVencidas`, `por-regularizar.ts`).
- **Por qué en este puesto:** es lo que la colaboradora nueva de §4 necesita para no concluir que no hay nada. Barato y no toca reglas.
- **Cómo lo verificas tú:** `/recibir` muestra «Por regularizar 217» con el punto rojo si hay vencidas; con Pendientes vacío y Por regularizar con trabajo, la pantalla abre ahí (o lo dice arriba).
- **Esfuerzo / dependencias:** S · después de #1.

### #7 · [Mejorar] El estado vacío dice por qué y ofrece la puerta de verdad
- **Dónde:** `page.tsx:262-275` (estado vacío), `:89-95` (el enlace), `:78-85` (el texto con jerga).
- **Por qué en este puesto:** con `compras` en 0, el estado vacío es el normal de todos los días. Debe decir «los comprobantes se registran en Facturas de proveedor» y dar «Ingreso sin comprobante» como acción principal (el 30 % de las compras, R-07), sin la frase del movimiento y sin repetir el enlace.
- **Cómo lo verificas tú:** un integrante sin contexto, frente a la pantalla vacía, llega a «Ingreso sin comprobante» en un toque y sin leer un párrafo; el enlace aparece una sola vez.
- **Esfuerzo / dependencias:** S.

### #8 · [Corregir] Una sola regla de sede para las tres pestañas y la puerta sin comprobante
- **Dónde:** `page.tsx:68-70` (`ubicacionMirada`), `:116` (Por regularizar: líder todas, resto la suya), Recibidas (RPC sobre todas las sedes operables) e `/inventario/recibir` (usa la sede de la cuenta, no `?ubicacion=`).
- **Por qué en este puesto:** el encabezado dice «Tienda TRU» y una pestaña muestra otra cosa; el líder cambia de sede en una y no en la otra. Es una inconsistencia conceptual, aunque con 0 lotes aún no hace daño.
- **Cómo lo verificas tú:** como líder, elegir «Recibiendo en: AQP» y comprobar que las tres pestañas y el enlace sin comprobante hablan de AQP.
- **Esfuerzo / dependencias:** M.

### #9 · [Mejorar] La tabla de Por regularizar con más de 1.000 filas
- **Dónde:** `PorRegularizarLista.tsx` (pinta todas las filas visibles); ya existe el filtro por vendedora, faltan búsqueda y filtro por sede/vencidas.
- **Por qué en este puesto:** el PR #773 hace que la lectura aguante el volumen; el navegador no pinta bien miles de filas (a 84/día se llega a 1.000 en ~10 días). Si la #2 y la #3 funcionan, esta tarea pierde urgencia.
- **Cómo lo verificas tú:** con 1.200 filas de prueba, la lista abre en menos de 1 s y una búsqueda por «blusa» devuelve solo esas.
- **Esfuerzo / dependencias:** M · después de #1.

### #10 · [Eliminar/fusionar/conectar] Quitar lo fantasma de `/recibir` · *bajo valor*
- **Dónde:** `RecepcionEnvio.tsx:1095` (combo inalcanzable), `p_notas_credito` siempre `[]`, filtros de URL sin control, mensaje de vacío de Recibidas que cita una sede que no es la de la lista.
- **Por qué en este puesto:** limpia deuda sin riesgo; antes de agregar algo se borra.
- **Cómo lo verificas tú:** `rg "Entra al almacén de"` deja una sola aparición (el campo de solo lectura) y el comportamiento no cambia.
- **Esfuerzo / dependencias:** S · bajo valor: nadie lo nota hoy.

### #11 · [Corregir] Revocar los privilegios de escritura de `compras` y `compra_items` · *bajo valor, higiene*
- **Dónde:** migración nueva; hoy `authenticated` tiene INSERT/UPDATE/DELETE sobre ambas `[producción bloque 6]`, igual que no lo tiene sobre `lotes`/`envios`/`movimientos`/`stock`.
- **Por qué en este puesto:** solo la RLS (una política SELECT) lo frena; defensa en profundidad sobre tablas de dinero. Una migración de `revoke` no mezcla `alter` con políticas, así que cabe en una parte.
- **Cómo lo verificas tú:** repetir el bloque 6: `compras` y `compra_items` deben dar `false/false/false` y registrar una compra desde la pantalla debe seguir funcionando (va por RPC).
- **Esfuerzo / dependencias:** S · pide SQL en producción.

### #12 · [Mejorar] Deshacer o corregir una recepción · *futuro, antes de que haya recepciones reales*
- **Dónde:** no existe (ni botón ni RPC); `anular_compra` rechaza si hay mercadería recibida (`20260918205000`).
- **Por qué en este puesto:** un error de conteo en el primer envío real solo se corrige con un ajuste manual y su motivo. Importa cuando haya recepciones; hoy hay cero.
- **Cómo lo verificas tú:** recibir 5 prendas de más en un comprobante de prueba y poder revertirlas con motivo; el stock vuelve y queda el rastro en `movimientos`.
- **Esfuerzo / dependencias:** L · después de #5.

## 8 · Estrategia alternativa

Hoy: «vender primero, registrar después, regularizar una por una» (ADR-0179). Con 87 % de las ventas, deja de ser un parche y es el flujo.

| Opción | Ganas | Pagas |
|---|---|---|
| **A. Seguir 1×1 y hacerlo más rápido** (lote, buscador, contador) | Se construye en días, sin cambiar el proceso de caja | Sigue tratando como excepción lo que es la regla; el stock no cuadra hasta que alguien regulariza |
| **B. Cerrar la causa**: terminar la carga de catálogo y stock (empezando por AQP) para que caja venda normal | La excepción vuelve a ser excepción; stock y costo correctos al vender | Depende de un censo físico (días de almacén); mientras tanto sigue entrando «sin registrar» |
| **C. Regularización automática por coincidencia** | 217 filas se vuelven decenas de confirmaciones | Ambigüedad (varias prendas con la misma categoría/talla/color y distinto precio): equivocarse cuadra el stock con la prenda equivocada |

**Recomendación:** B como solución, A (lote) como puente, C descartada por ahora. Decide Felipe (tarea #2).

## 9 · Referentes de ERP y futuro

*Lo que viene de memoria no está verificado.* Odoo y NetSuite reciben contra una orden de compra con recibo parcial y pedido pendiente; CAYLA ya tiene el equivalente con la factura como eje y cierre de faltante con motivo. Shopify POS y Lightspeed tienen «venta personalizada» sin inventario y no reconcilian. Pasan el filtro «¿le sirve a 3 tiendas y 1 taller hoy?» pero son futuro: recepción ciega por bulto con escáner de cámara (hoy solo pistola), aviso de envío del proveedor (ASN), conciliación automática factura ↔ recepción.

## 10 · Fuera de esta pantalla

**El costo de lo que ya está en el sistema.** El stock existe por `carga_inicial` (550 filas, 766 unidades). Si esas variantes tienen `costo` 0 o vacío, el primer envío real recalcula el costo como promedio con ese 0 y lo diluye (el defecto verificado en la auditoría del 3-oct: 20 polos sin costo + 10 a S/ 40 → S/ 13,33). Y las 217 líneas «sin registrar» llevan el costo de la prenda ficticia, así que el margen de esos S/ 10.598 es desconocido. Es lo más grave que esta pantalla no muestra y toca a Vender, Existencias y los reportes.
Consulta de solo lectura para saberlo (dos bloques, pega el resultado):

```sql
-- 1) ¿cuántas variantes con stock tienen costo 0 o vacío?
select count(*) as con_stock,
       count(*) filter (where coalesce(v.costo, 0) = 0) as sin_costo
from retail.variantes v
where exists (select 1 from retail.stock s where s.variante_id = v.id and s.cantidad > 0);

-- 2) ¿de dónde viene la carga inicial, sede por sede? (prueba de la hipótesis de AQP)
select u.nombre, count(*) as filas, sum(m.cantidad) as unidades,
       min(m.created_at)::date as desde, max(m.created_at)::date as hasta
from retail.movimientos m join retail.ubicaciones u on u.id = m.ubicacion_id
where m.motivo = 'carga_inicial'
group by u.nombre order by 1;
```

## 11 · Líneas propuestas para el backlog

- [ ] `[pantalla:recibir]` #1 Publicar el arreglo del tope de 200 (PR #773) — S (hecho, falta fusionar)
- [ ] `[pantalla:recibir]` #2 Decidir la estrategia: 87 % de las ventas entran «sin registrar» — decisión de Felipe
- [ ] `[pantalla:recibir]` #3 Regularizar en lote (RPC nueva + selección múltiple) — L
- [ ] `[pantalla:recibir]` #4 Quien vendió no regulariza su propia venta — M
- [ ] `[pantalla:recibir]` #5 Ensayar el primer envío real y verificar el costo promedio — S
- [ ] `[pantalla:recibir]` #6 Pestañas con contador y aterrizaje donde hay trabajo — S
- [ ] `[pantalla:recibir]` #7 Estado vacío con la puerta «Ingreso sin comprobante» a primer plano, sin jerga — S
- [ ] `[pantalla:recibir]` #8 Una sola regla de sede para las tres pestañas — M
- [ ] `[pantalla:recibir]` #9 Tabla de Por regularizar con 1.000+ filas: búsqueda y paginado — M
- [ ] `[pantalla:recibir]` #10 Quitar controles fantasma de `/recibir` — S (bajo valor)
- [ ] `[pantalla:recibir]` #11 Revocar escritura directa de `authenticated` en `compras` y `compra_items` — S (SQL)
- [ ] `[pantalla:recibir]` #12 Deshacer o corregir una recepción — L (futuro)

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Encabezado | «RECIBIR · TIENDA TRU» y «TIENDA TRU» arriba a la derecha | Dice la sede | ajustar (tres veces la sede) | `[visto]` |
| Encabezado | H1 «Recibir mercadería» | Título; el módulo Compras no tiene cabecera decidida | ajustar (pregunta a Felipe) | `[visto]` |
| Encabezado | Párrafo de 3 líneas | Explica el flujo y un principio interno | ajustar (sobra la frase del movimiento) | `[código page.tsx:78-85]` |
| Encabezado | Enlace «Ingreso sin comprobante» | Lleva a `/inventario/recibir` | ajustar (puerta del 30 % escondida) | `[código page.tsx:89-95]` |
| Pestañas | Pendientes · Recibidas recientemente · Por regularizar | Tres vistas | ajustar (sin contador) | `[código page.tsx:100-109]` |
| Pendientes | Tarjeta «No hay comprobantes…» | Estado vacío; con lista, `RecepcionEnvio` | ajustar (no explica por qué ni da acción principal) | `[código page.tsx:262-275]` |
| Pendientes | `RecepcionEnvio`: marcar, contar, escanear, recibir, faltantes | Recibe contra comprobante, en una transacción | bien | `[código]` `[producción]` |
| Pendientes | Aviso de traslados en camino | Enlaza a Traslados (ADR-0299) | bien | `[código]` |
| Recibidas | Lista, filtros y cajón lateral | Historial de recepciones | ajustar (sede y 80 lotes) | `[mapa]` |
| Por regularizar | 4 tarjetas (pendientes, vencidas, descuento, sobreprecio) | Cifras de la cola | bien (con #773) | `[código]` |
| Por regularizar | Tabla, filtros «Pendientes/Regularizadas/Todas» y vendedora | Lista y filtra | ajustar (sin búsqueda ni lote) | `[código PorRegularizarLista.tsx:77-141]` |
| Por regularizar | Modal «Regularizar» | Une la venta con su prenda real | bien (falta separar de quien vendió) | `[código :195]` |
| Lateral | «Notas de crédito de prove…» | Etiqueta del menú | ajustar (cortada) | `[visto]` |
| Lateral | Recibir mercadería aparece en Inventario y en Compras | Una fila u otra según el permiso | bien | `[código menu.ts:320,357]` |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-03 | completo | 5,0 | 8,0 | — (primer análisis; la #1 está hecha en el PR #773, sin fusionar) |
