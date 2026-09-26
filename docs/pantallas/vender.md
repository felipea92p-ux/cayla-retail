# Pantalla — Punto de Venta (`/vender`)

> Otra sesión tocándola: **sí — corregido tras verificar en vivo.** `docs/SESIONES-ACTIVAS.md` nombra `ventas-visual-redesign-240e2b` y `local-work-3a718a`/`buscar-entry-point-7aa994` como trabajo en vuelo sobre esta pantalla; verificado con `gh pr view 128` y `git log`, **las dos ya están fusionadas** (PR #128 → `MERGED` 2026-09-18; los commits de `buscar-entry-point-7aa994` sobre `PuntoDeVenta.tsx` ya están en `origin/main`). El tablero de coordinación está desactualizado en este punto — no es un choque real. **La colisión real, no listada en `SESIONES-ACTIVAS.md`, es el PR #285** (`claude/responsable-y-roles-spike`, **abierto, actualizado hoy 2026-09-22 21:06 UTC** — prácticamente en simultáneo con esta sesión): ADR-0161 (combo "Responsable" por operación) + ADR-0162 (terminales sin persona), que toca `PuntoDeVenta.tsx`/`CajaAbiertaPanel.tsx` **y también Cambios, Devoluciones y Facturación/Comprobantes** — es decir, casi todo el módulo Ventas a la vez. Este análisis lee el código tal como está HOY en `origin/main` (sin ese PR).
>
> Modo: completo · Fecha: 2026-09-22 · Rol/sede: colaboradora/líder, Tienda TRU (captura adjunta, escritorio ~1920 px) · Datos: código + `docs/BACKLOG.md`/`docs/BITACORA.md` (verificaciones de producción de los últimos 7 días) — sin SQL nuevo corrido para esta pantalla, ver "SQL pendiente".
> SHA analizado: `88457700` (origin/main, rama al día — `0	0` contra origin) — si `PuntoDeVenta.tsx`, `PuntoDeVentaCatalogo.tsx`, `PuntoDeVentaTicket.tsx`, `lib/vender-reglas.ts` o `registrar_venta` cambian después, este análisis está vencido.
> Archivos: `apps/web/app/(app)/vender/page.tsx` · `components/PuntoDeVenta.tsx` (1164 líneas) → `PuntoDeVentaCatalogo.tsx`, `PuntoDeVentaTicket.tsx` (→ `VendedorasFila.tsx`), `ElegirTallaModal.tsx`, `VentaRegistradaModal.tsx` (→ `ReciboTermico.tsx`), `AbrirCajaFormV2.tsx`, `CerrarCajaModalV2.tsx`, `PuntoDeVentaColaOffline.tsx` · `lib/vender-reglas.ts`, `lib/ventas-offline.ts`, `lib/useVendedorasDeTurno.ts`, `lib/envio-sunat.ts`, `lib/buscar-prenda-v2.ts`, `lib/cargo-especial.ts`, `lib/recibo-reglas.ts` · RPC `registrar_venta`, `abrir_caja`, `cerrar_caja`, `fn_asesoras_de_turno`, `fn_stock_por_sede`, `fn_ventas_del_dia` · tablas `stock`, `ventas`, `venta_items`, `apartados`, `cajas`

## 0 · Veredicto
El motor de cobro está bien construido — concurrencia correcta sobre el último talle, SUNAT cae sin perder la venta, y el candado de "quién atendió" bloquea cobrar sin vendedora. Lo que falla es comunicación, no dinero: una prenda apartada para una clienta se ve igual que una agotada de verdad, y el "Monto manual" cobra cualquier suma sin pedir por qué. La objeción más urgente no es de código: son dos sesiones activas rediseñando el mismo archivo sin coordinarse.
**Cumple su finalidad:** 7,4/10 · **Relevancia:** 9,6/10 — Núcleo

## 1 · Finalidad declarada
"Esta pantalla existe para que cualquier colaboradora de mostrador cobre una venta completa —buscar la prenda, armar el ticket, cobrar con el medio que sea, y que el comprobante salga solo— sin depender de que un líder esté presente."
Fuente: `docs/datos/07-GOBIERNO.md` (Colibrí = Ventas y caja), `lib/menu.ts:250-252` (Ventas, terminal tipo "ventas"), y el patrón repetido en BITÁCORA ("terminal de ventas aterriza en `/vender`", `docs/BACKLOG.md:54`).
¿Coinciden docs y pantalla? **Sí**, con un matiz: la finalidad asume que "agotado" y "reservado para otra clienta" son la misma respuesta para quien vende. No lo son, y hoy la pantalla los trata igual (ver Objeción #1).

## 2 · Objeción
1. **"Agotada" y "apartada para una clienta" se ven exactamente igual, y ya se sabe.** `PuntoDeVentaCatalogo.tsx:203` (`v.stockAqui <= 0 ? "sin stock aquí" : ...`) y `PuntoDeVenta.tsx:484` (`` `${nombreVariante} está agotada` ``) no distinguen el motivo — aunque el NÚMERO que llega ya viene neto de lo apartado (`inventario-v2.ts:198`, `vender/page.tsx:67,84`: `pisoDisponible = piso − apartadoPiso`). El propio `docs/BACKLOG.md:225-226` ya lo registra como pendiente ("Vender y Cambios dicen «agotada» / «Sin stock aquí» de una prenda cuyo piso está todo apartado ... `PuntoDeVenta.tsx` lo comparte con otra sesión, por eso no se tocó"), y el análisis de Separaciones de HOY (`docs/maquetas/separaciones-2026-09/ANALISIS.md:67`) ya **asume que esto está resuelto** ("Punto de Venta dice «Separada para una clienta», no «Agotada»") cuando en realidad no lo está. Escenario real: una clienta pregunta por una Casaca Emilia negro talla M que está separada para otra clienta; la colaboradora ve "agotada" y le dice que no hay, en vez de "está separada, ¿la quieres para ti si no la recogen?" — pierde una venta que pudo encolarse.
2. **"Monto manual" cobra cualquier suma sin pedir por qué, y no es un caso raro: tiene su propio SKU fijo.** `agregarMontoManual()` (`PuntoDeVenta.tsx:536-561`) solo exige `if (!valor) return` — ningún tope, ningún motivo obligatorio por línea. La variante centinela `ID_CARGO_ESPECIAL` (`lib/cargo-especial.ts:14`) está deliberadamente diseñada para esto (999 999 de stock, excluida de todo conteo por id — decisión de Felipe del 2026-09-15, bien documentada), así que el mecanismo en sí es correcto; lo que falta es el freno. La única pista que queda es la "Nota para esta venta" (`PuntoDeVentaTicket.tsx:1099-1130`, `PuntoDeVenta.tsx:236`), que es **opcional** y **a nivel de toda la venta**, no de esa línea — si el ticket tiene 3 prendas más el cargo especial, la nota no dice a cuál de las 4 líneas corresponde. Comparado con Descuento, que si exige argumento escrito para ciertas razones (`vender-reglas.ts:337`, `necesitaArgumentoEscrito`), Monto manual no exige nada. No es un hueco de caja (la venta sí se registra, sí se paga, sí aparece en "Vendido hoy" — a diferencia del hueco real que sí existe en Caja, `docs/pantallas/caja.md` objeción #1): es un hueco de trazabilidad.

## 3 · Lo que está bien y no se toca
- **Concurrencia correcta en el candado más importante de la pantalla:** `fn_aplicar_movimiento` toma `SELECT ... FOR UPDATE` sobre la fila de `stock` antes de descontar (`supabase/migrations/20260920160000_apartar_stock.sql:124-138`) — dos cobros simultáneos del último talle no pueden vender la misma unidad dos veces; el segundo espera el lock y falla con "Stock insuficiente" `[código]`, capturado y traducido por nombre de prenda en `PuntoDeVenta.tsx:854-865` `[código]`.
- **SUNAT/Lucode cae y la venta no se pierde.** `registrar_venta` y la emisión del comprobante corren en pasos separados: la venta (stock, caja, pagos) ya quedó completa antes de que `enviarVentaASunat` (`lib/envio-sunat.ts:9-24`) siquiera se dispare; si Lucode no responde, el comprobante queda `pendiente_reintento` sin perder su número (`lib/transmitir-comprobante.ts:129-146`) y una cola periódica lo reintenta (`/api/lucode/reintentar`). Se degrada así: la venta nunca se pierde, el papeleo con SUNAT se pone al día después.
- **Cobrar exige vendedora antes que nada** `[visto: botón "COBRAR" apagado con "Elige quién atendió a la clienta"]` — el sistema no deja avanzar con un dato a medias en vez de guardar una venta huérfana; ejemplo limpio del principio 12 (Norman) bien aplicado.
- **La escala de rojo se respeta en la vista de reposo.** `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`); en la captura, lo único rojo visible sin interactuar es el ícono "quitar" de la línea del ticket (`PuntoDeVentaTicket.tsx:845`, `text-rojo-profundo` de base, no solo en hover) — el resto de los usos de `rojo` en el código (`grep` cuenta ~20) son estados `focus-within`/`hover`, no colores en reposo.
- **`cantidad_apartada` ya se resta del stock que se muestra** (`inventario-v2.ts:198`, `vender/page.tsx:67,84`) — el número que ve la colaboradora es correcto aunque el TEXTO todavía no lo explique (objeción #1).
- **La cola offline tiene su propia UI** (`PuntoDeVentaColaOffline.tsx`, ADR-0092) — una venta hecha sin internet no depende de que la colaboradora recuerde reenviarla.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Coherente con el resto de Ventas (crema/tinta, serif, esquinas suaves); rojo dentro del tope en reposo | `[visto]` `[código design-tokens.ts:73]` |
| Lógica de negocio | 6,5 | "Agotada" ambigua; Monto manual sin motivo obligatorio | `[código PuntoDeVentaCatalogo.tsx:203]` `[código PuntoDeVenta.tsx:536-561]` |
| Arquitectura | 7,5 | Concurrencia y degradación de SUNAT correctas; "Dejar en espera" vive solo en el navegador | `[código apartar_stock.sql:124-138]` `[código almacen-local.ts]` |
| Funciones | 8,0 | Todo lo visible en la captura tiene lógica real detrás; nada fantasma encontrado | `[código, mapa completo]` |
| Utilidad | 7,0 | Flujo de cobro guiado y difícil de equivocar; el hueco es justo en la conversación con la clienta sobre una prenda apartada | `[inferido, escenario]` |
| Conexión con el ERP | 8,0 | Bien conectada aguas arriba y abajo; Apartar stock conectado a nivel de dato, no de mensaje | `[código]` |

### Estética (7,5)
(a) Coherencia CAYLA: crema/papel, serif de display en "Ticket actual" `[visto]`, esquinas `rounded-xl`/`rounded-lg` consistentes `[código]`. (b) Rojo: el propio archivo usa la clase `rojo` en ~20 lugares (`grep`), pero la enorme mayoría son `focus-within:` o `hover:` — estados que no están activos a la vez. En reposo, en la captura, solo el ícono "quitar" del ticket es rojo-profundo de base `[código PuntoDeVentaTicket.tsx:845]`; si la clienta paga con un método distinto a efectivo aparecería el color de ese método (BITÁCORA 2026-09-18, "un color por método de pago"), no verificado aquí `[no verificable]`. (c) Universales: el buscador tiene foco visible con anillo `ring-2 ring-rojo/20` `[código]`; los chips de talla sin stock quedan `opacity-55` con borde `rojo-profundo/40` — visualmente distinguibles pero **no dicen POR QUÉ** no tienen stock (objeción #1) `[visto+código PuntoDeVentaCatalogo.tsx:313]`.

### Lógica de negocio (6,5)
Ver Objeción #1 y #2. Además: la variante centinela `ID_CARGO_ESPECIAL` está bien diseñada para no contaminar catálogo ni inventario (`lib/cargo-especial.ts`, decisión de Felipe 2026-09-15) — el defecto es solo de trazabilidad, no de diseño de datos. **Referentes** (de memoria, `[no verificable]`): Shopify POS y Square permiten una "custom amount" similar; ninguno de los dos, hasta donde recuerdo, la deja sin motivo cuando supera cierto monto — comparación aproximada, no verificada contra su documentación actual.

### Arquitectura (7,5)
- **Cadena:** `page.tsx` (server: `getCatalogo`, `getCajaAbierta`, `fn_stock_por_sede`, `campanas_vigentes`, `fn_ventas_del_dia`) → `PuntoDeVenta.tsx` (cliente) → `registrar_venta` (RPC) → `fn_aplicar_movimiento` (security definer) → `stock`/`movimientos`. Sigue la convención del repo (RLS + RPC) `[código]`.
- **Concurrencia:** resuelta para el caso que más importa (última unidad) — ver §3. La escritura de `stock` está cerrada por RLS a solo SELECT (`0004_rls.sql:70-72`); toda escritura pasa por la función `security definer` `[código]`.
- **Caída externa — SUNAT:** ver §3, correcto. **Caída externa — red del navegador:** la venta se encola (`ventas-offline.ts`, `PuntoDeVentaColaOffline.tsx`), reintentada al volver la conexión `[código, ADR-0092]`.
- **"Dejar en espera" es solo del navegador:** `dejarEnEspera()` (`PuntoDeVenta.tsx:637-647`) guarda en `localStorage` vía `lib/almacen-local.ts` — un ticket en espera en un mostrador **no existe** para otro mostrador de la misma tienda. Con una sola caja/terminal de ventas por sede hoy, el riesgo es bajo; con más de una terminal (ADR-0160 ya las define) deja de serlo `[código, inferido]`.
- **Volumen:** sin número propio corrido para esta pantalla — ver "SQL pendiente" `[no verificable]`.

### Funciones (8,0)
Cada acción de la captura tiene lógica real detrás (tabla completa entregada por el subagente de mapeo, verificada por muestreo): buscador con lector de código de barras, toggle "solo con stock", chips de categoría, grilla con tallas, monto manual, selector de vendedora, cantidad/quitar, descuento por línea y por ticket, nota, dejar en espera, cobrar, atajos de navegación. No se encontró ningún botón sin función real (`[código]`, mapa completo en el historial de esta sesión). Nada "sobra" a primera vista; lo que falta ya está en la Objeción.

### Utilidad (7,0)
Escenario: colaboradora nueva, sábado por la tarde, mostrador lleno. Clienta pide una Casaca Emilia negro M. 1) Escanea o busca — aparece, con talla M en gris. 2) Ve "sin stock aquí" o el chip apagado — no distingue si es que no queda ninguna en la tienda o si hay una guardada para otra clienta (Objeción #1): le dice a la clienta que no hay. 3) Si en cambio la clienta pide "algo especial" (un arreglo, un envío), la colaboradora usa "Monto manual" sin que el sistema le pida anotar de qué se trata más allá de la nota general del ticket (Objeción #2). El resto del flujo —elegir talla, atendió, cobrar— es directo y difícil de equivocar; el "COBRAR" bloqueado sin vendedora evita el error más caro (una venta sin autoría).

### Conexión con el ERP (8,0)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Es el origen de casi todos los datos de venta que alimentan Caja, Historial, Comprobantes y Análisis. |
| Dinero y stock que toca | ×1 | 10 | Cobra dinero real y descuenta stock real en cada línea. |
| Frecuencia y personas que la usan | ×1 | 10 | Se abre en cada cobro, en las 3 tiendas, todo el día. |
| Qué se detiene si falla | ×1 | 10 | Si esta pantalla cae, ninguna tienda puede vender. |

Relevancia = (2·9 + 10 + 10 + 10) / 5 = **9,6** → **Núcleo**.

## 6 · Conexión con el ERP
- **Aguas arriba:** `stock`/`fn_stock_por_sede` (Inventario), `campanas_vigentes` (promociones), `fn_asesoras_de_turno` (asistencia de Dynamic), `apartados` (Separaciones/Apartar stock, dato ya conectado — mensaje todavía no).
- **Aguas abajo:** `cajas`/`caja_movimientos` (el cierre del día), `/vender/historial`, Comprobantes/Facturación (emisión SUNAT vía Lucode), `fn_ventas_del_dia` (leído también por Caja y Facturación).
- **Pájaro dueño y vecinos:** 07 Colibrí (Ventas y caja); vecinos directos Caja, Cambios, Devoluciones (mismo pájaro), Comprobantes (08 Cuervo, exige `facturar`).
- **Externos, y qué pasa si caen:** SUNAT/Lucode — se degrada bien (ver §3). Dynamic (asistencia, para "quién atendió") — si no responde, `useVendedorasDeTurno` probablemente cae a una lista vacía o de error; no verificado en este análisis `[no verificable]`.

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Decir "apartada para una clienta", no "agotada"
- **Dónde:** `PuntoDeVentaCatalogo.tsx:203`, `PuntoDeVenta.tsx:484`; el dato (`cantidad_apartada`) ya está disponible en `stockAqui` neto — falta el motivo, no el número.
- **Por qué en este puesto:** ya está en `docs/BACKLOG.md:225-226`, y el diseño de Separaciones de HOY ya lo da por resuelto sin estarlo — si Separaciones sale primero, esta pantalla quedará mintiendo activamente sobre por qué algo "no está".
- **Cómo lo verificas tú:** desde Inventario ▸ Existencias, apartar 1 unidad de una prenda hasta dejarla en 0 disponible en Tienda TRU; en Punto de Venta esa talla debe decir "apartada", no "agotada"/"sin stock aquí".
- **Esfuerzo / dependencias:** S · depende de que `apartar_stock` (ADR-0141) esté pegado en producción (hoy no lo está, `docs/BACKLOG.md:396`) para que el dato llegue real.

### #2 · [Corregir] Motivo obligatorio en "Monto manual", por línea
- **Dónde:** `PuntoDeVenta.tsx:536-561` (`agregarMontoManual`), modal en `PuntoDeVentaCatalogo.tsx` (~línea 1113-1150 en `PuntoDeVenta.tsx`, subtítulo "Para una prenda sin etiqueta, producto dañado o cargo especial").
- **Por qué en este puesto:** hoy una colaboradora cobra cualquier monto bajo "Cargo especial" sin decir de qué se trata; la única nota es opcional y a nivel de todo el ticket. No es un hueco de caja (la venta sí queda registrada y pagada) pero sí de trazabilidad: nadie puede reconstruir después qué fue ese cargo.
- **Cómo lo verificas tú:** abrir "Monto manual", escribir un monto y confirmar sin texto — hoy pasa; después del cambio debe pedir un concepto corto obligatorio antes de dejar cobrar.
- **Esfuerzo / dependencias:** S · **DECIDÍ (propuesta, la confirma Felipe):** un campo "concepto" de texto corto, obligatorio, específico de esa línea (no la Nota general del ticket), que viaje a `venta_items` para quedar auditable por línea. **DESCARTÉ:** prohibirlo a colaboradores y dejarlo solo para líder — el mostrador necesita esta vía todos los días (prenda sin etiqueta, daño, arreglo) y frenarla del todo detiene la venta. **SE ROMPE SI:** una colaboradora cobra "Cargo especial S/80" sin prenda ni motivo, y tres meses después nadie puede decir si fue un arreglo legítimo o un descuento disfrazado.

### #3 · [Eliminar/fusionar/conectar] Fusionar el PR #285 (Responsable/terminales sin persona) antes de tocar más el módulo
- **Dónde:** `apps/web/components/PuntoDeVenta.tsx`, `CajaAbiertaPanel.tsx`, y — a diferencia de lo que parecía a primera vista — también Cambios, Devoluciones y Facturación/Comprobantes (`git log origin/main..origin/claude/responsable-y-roles-spike --oneline` lo confirma).
- **Por qué en este puesto:** PR #285 está **abierto y se actualizó hoy mismo** (2026-09-22 21:06 UTC), y no figura en `docs/SESIONES-ACTIVAS.md` — el mismo hueco de coordinación que ya encontró el análisis de Cambios en esta misma sesión ("el tablero que se creó para evitar colisiones fantasma está generando una"). Es la pieza de trabajo en vuelo de mayor alcance de todo el módulo Ventas: toca prácticamente todas las pantallas que este análisis cubrió. Cualquier tarea de esta lista o de las otras 5 pantallas, hecha ahora sobre estos archivos, corre el riesgo de perderse o duplicarse cuando ese PR se fusione.
- **Cómo lo verificas tú:** `gh pr view 285` (estado, archivos tocados); confirmar con Felipe si se fusiona antes o después de las correcciones #1/#2 de arriba.
- **Esfuerzo / dependencias:** — (decisión de Felipe) · **bloquea** #1 y #2 si se hacen directamente sobre `PuntoDeVenta.tsx`: mejor coordinarlas con lo que traiga el PR #285, o pedir que se fusione primero.

### #4 · [Mejorar] Enlazar "Ver historial" desde Punto de Venta
- **Dónde:** `PuntoDeVenta.tsx` (zona de "Ventas de hoy"/atajos, ~171-175); destino `venta.historial` ya existe en `lib/menu.ts:255`.
- **Por qué en este puesto:** `docs/BACKLOG.md:133` ya lo pide ("enlaces «Ver historial →» desde «Ventas de hoy» ... esperar a que salgan los rediseños en curso"). Barato y cierra un ciclo de trabajo diario (cobrar → revisar lo cobrado).
- **Cómo lo verificas tú:** un enlace visible en la franja de "Ventas de hoy" que lleve a `/vender/historial` con el filtro del día de hoy ya aplicado.
- **Esfuerzo / dependencias:** S · no antes de #3 (mismo archivo en disputa).

### #5 · [Mejorar] "Dejar en espera" visible entre terminales de la misma tienda
- **Dónde:** `lib/almacen-local.ts`, `PuntoDeVenta.tsx:637-647`.
- **Por qué en este puesto:** hoy un ticket en espera vive solo en el navegador que lo creó. Con una sola terminal de ventas por sede el riesgo es bajo; ADR-0160 ya define terminales por tipo, así que el día que una tienda tenga dos cajas, un ticket en espera en una no se ve en la otra.
- **Cómo lo verificas tú:** dejar un ticket en espera, abrir la misma cuenta en otro navegador/dispositivo — hoy no aparece.
- **Esfuerzo / dependencias:** M (mover de `localStorage` a una tabla de servidor) · **bajo valor / futuro** — solo se vuelve real cuando exista una segunda terminal de ventas por sede.

### #6 · [Mejorar] Confirmar si "Solo con stock" y el buscador manejan bien miles de prendas
- **Dónde:** `PuntoDeVentaCatalogo.tsx`, `catalogo-grupos.ts` (`agruparCatalogo`).
- **Por qué en este puesto:** hoy CAYLA tiene 3 tiendas + 1 taller y un catálogo manejable; sin un número real de filas no hay opinión de rendimiento válida — esto es una verificación, no un problema confirmado.
- **Cómo lo verificas tú:** ver "SQL pendiente" — cuántas variantes activas por sede hay hoy en producción.
- **Esfuerzo / dependencias:** — (verificación, no cambio) · bajo valor mientras el catálogo siga en cientos de variantes, no miles.

### #7 · [Corregir] Aviso claro si `fn_asesoras_de_turno` no responde (Dynamic caído)
- **Dónde:** `lib/useVendedorasDeTurno.ts:29`.
- **Por qué en este puesto:** el "quién atendió" bloquea "COBRAR" (bien, §3) pero si la fuente de asistencia (Dynamic) no responde, no quedó verificado qué ve la colaboradora — si el bloqueo queda mudo, una tienda entera no podría cobrar por una falla ajena a la venta misma.
- **Cómo lo verificas tú:** ver "SQL pendiente"/prueba manual — simular que `fn_asesoras_de_turno` falla y confirmar que aparece un mensaje claro con una salida (p. ej. "sin conexión con asistencia: elige manualmente").
- **Esfuerzo / dependencias:** S · primero verificar si ya existe (puede que #7 no sea necesaria — confirmar antes de construir).

### #8 · [Mejorar] Tope o aviso en "Monto manual" para montos fuera de lo común
- **Dónde:** `PuntoDeVenta.tsx:536-561`.
- **Por qué en este puesto:** además del motivo (#2), un monto muy alto sin ninguna prenda detrás debería, al menos, pedir confirmación extra — hoy pasa igual que S/5 que S/5000.
- **Cómo lo verificas tú:** cobrar un "Monto manual" de S/5000 — hoy no hay ninguna fricción adicional.
- **Esfuerzo / dependencias:** S · después de #2 (mismo flujo).

### #9 · [Mejorar] Indicar visualmente que un comprobante quedó "pendiente de reintento" tras cobrar
- **Dónde:** `VentaRegistradaModal.tsx`, `lib/envio-sunat.ts`.
- **Por qué en este puesto:** la venta nunca se pierde (§3, bien), pero no quedó verificado en este análisis si la colaboradora VE que el comprobante quedó pendiente y no emitido — si no lo ve, no sabe que hay que revisarlo en Comprobantes más tarde.
- **Cómo lo verificas tú:** cobrar con Lucode caído (sandbox) y confirmar que el modal de venta registrada dice explícitamente "comprobante pendiente, se reintentará".
- **Esfuerzo / dependencias:** S · **verificar primero si ya existe** antes de construir nada — no se confirmó en este análisis.

### #10 · [Mejorar] Confirmar que `--color-metodo-*` sigue consistente tras fusionar PR #285
- **Dónde:** `globals.css`, tokens `--color-metodo-*` (compartidos con la dona de Caja, según BITÁCORA 2026-09-18).
- **Por qué en este puesto:** varias sesiones han tocado estos tokens en fechas distintas a lo largo de septiembre; un token compartido mal fusionado rompe el color de método de pago en dos pantallas a la vez.
- **Cómo lo verificas tú:** después de que se resuelva #3, abrir Caja y Punto de Venta y comparar que el color de "Yape"/"Efectivo"/"Tarjeta" sea el mismo en ambas.
- **Esfuerzo / dependencias:** — · depende de #3.

### #11 · [Mejorar] Aviso explícito de "38 prendas agotadas ocultas" con acceso directo
- **Dónde:** `PuntoDeVentaCatalogo.tsx` (contador visible en la captura).
- **Por qué en este puesto:** bajo valor, es una mejora de comodidad — hoy la cifra es informativa pero no clickeable para revisarlas (no verificado si ya lo es).
- **Cómo lo verificas tú:** tocar el texto "38 prendas agotadas ocultas" — si no reacciona, agregar que muestre esa lista.
- **Esfuerzo / dependencias:** S · **bajo valor / opcional**.

### #12 · [Replantear] ¿"Cargo especial" debería tener sub-tipos en vez de uno solo?
- **Dónde:** `lib/cargo-especial.ts`, `registrar_venta` (constante `c_cargo_especial`).
- **Por qué en este puesto:** hoy "arreglo de bastilla", "producto dañado" y "cargo especial genérico" comparten el mismo SKU centinela — distinguibles solo por el texto libre de la Nota (si acaso). Es una pregunta de diseño, no una urgencia.
- **DECIDÍ:** dejarlo como tarea de decisión para Felipe, no ejecutarla de una — depende de si el negocio necesita reportar cuánto se cobra por daños vs. arreglos vs. otros conceptos.
- **DESCARTÉ:** proponer sub-tipos ya mismo sin ese dato — sería una tabla nueva para un problema que hoy nadie pidió resolver.
- **SE ROMPE SI:** el negocio crece y alguien pide "cuánto cobramos el año pasado en arreglos" y la única fuente es leer 200 notas de texto libre una por una.
- **Esfuerzo / dependencias:** — · **bajo valor / futuro**, decisión de Felipe primero.

## 9 · Referentes de ERP y futuro
Shopify POS y Square permiten un "monto personalizado" similar al Cargo especial; no verifiqué si exigen motivo por encima de cierto monto — dato de memoria, no confirmado contra su documentación de 2026. El "tope de stock" con animación (`anim-tope`, `PuntoDeVentaCatalogo.tsx:406-417`) ya está construido y no necesita referente externo: es una solución propia bien resuelta.

## 10 · Fuera de esta pantalla
Lo de mayor consecuencia no está en el código de esta pantalla: es el **PR #285** (ADR-0161/0162, "Responsable" + terminales sin persona), abierto y actualizado hoy mismo, que toca `PuntoDeVenta.tsx` y, de paso, Caja, Cambios, Devoluciones y Facturación/Comprobantes — prácticamente todo el módulo Ventas — **sin aparecer en `docs/SESIONES-ACTIVAS.md`**. El mismo tablero pensado para evitar choques está desactualizado en dos direcciones a la vez: nombra colisiones que ya se fusionaron (ver el encabezado de este archivo) y no nombra la que sí está en vuelo ahora mismo. Antes de tocar cualquiera de las 6 pantallas de este módulo, vale la pena que alguien actualice ese tablero de verdad.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:vender]` #1 Punto de Venta dice "apartada para una clienta" en vez de "agotada" — S
- [ ] `[pantalla:vender]` #2 "Monto manual" exige un concepto obligatorio por línea — S
- [ ] `[pantalla:vender]` #3 Reconciliar `ventas-visual-redesign-240e2b` y `local-work-3a718a` sobre `PuntoDeVenta.tsx` — decisión de Felipe
- [ ] `[pantalla:vender]` #4 Enlace "Ver historial" desde Punto de Venta — S
- [ ] `[pantalla:vender]` #5 "Dejar en espera" compartido entre terminales — M, futuro
- [ ] `[pantalla:vender]` #7 Aviso si Dynamic (asistencia) no responde al elegir vendedora — S, verificar primero
- [ ] `[pantalla:vender]` #9 Aviso visible si el comprobante quedó pendiente de reintento al cobrar — S, verificar primero

## SQL pendiente
Para cerrar los huecos `[no verificable]` de este análisis (volumen real de variantes por sede, si `fn_asesoras_de_turno` falla con gracia, si el comprobante pendiente se avisa), hace falta correr en producción (formato `.claude/skills/pantalla/plantilla-sql.md`, prefijo `retail.` en el SQL Editor de producción):
```sql
-- Volumen: variantes activas visibles hoy por sede (para juzgar si el buscador/grilla necesitan paginar)
select s.ubicacion_id, count(*) filter (where st.cantidad - st.cantidad_apartada > 0) as con_stock,
       count(*) as total_variantes
from retail.stock st
join retail.variantes v on v.id = st.variante_id and v.activo
group by 1;
```

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-22 | completo | 7,4 | 9,6 | — (primer análisis de esta pantalla) |
