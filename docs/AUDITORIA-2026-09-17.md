# Auditoría integral — CAYLA Retail (2026-09-17)

> **Nota de restauración (2026-09-18).** El archivo original de esta auditoría existía solo en
> disco, en un worktree sin commit, y se perdió cuando ese worktree se recreó. Este texto es la
> restauración hecha desde la lectura completa del original en una sesión posterior. El
> contenido se reprodujo tal como se leyó; si aparece una diferencia menor de redacción frente al
> original, esta copia es la que queda en el repositorio. Única adición al texto: una anotación de corrección
> fechada 2026-09-18 en el hecho sobre `comprobantes` (Facturación / SUNAT), marcada como tal.

## Resumen ejecutivo

**1. El corte V1→V2 (commit `0af2f1b`, 2026-09-12) dejó un mapa de "qué sobrevivió" que ni los propios ADRs cuentan completo.** Facturación/SUNAT sobrevivió íntegra (9 RPCs, todos los componentes) — contradiciendo lo que el propio `docs/BACKLOG.md` llegó a afirmar en algún momento. Finanzas se borró casi entera, salvo `activos_fijos` (39 filas reales del Taller, rescatadas a propósito). Identidad se reescribió completa: `retail.personas` (la tabla-vista escribible que la auditoría de 26 agentes marcó como hueco crítico el 2026-09-05) fue eliminada sin reemplazo, cerrando ese hueco por diseño, no por parche. Y la taxonomía universal (ADR-0030, capa de traducción tipo Shopify, 1.849 categorías) desapareció del todo — sin que ningún ADR posterior lo mencione explícitamente — dejando dos archivos huérfanos (`AnclarVocabulario.tsx`, `scripts/taxonomia/cargar.mjs`) que fallarían si alguien los corriera hoy. Consecuencia: cualquier sesión (humana o de IA) que audite leyendo solo ADRs sin cruzar contra `origin/main` concluye cosas falsas en ambas direcciones — código que ya no existe, o código que sí existe pero el ADR dice que no.

**2. 21 de 60 worktrees activos están a más de 250 commits de atraso de `origin/main`, y esta misma auditoría corrió desde uno de ellos.** 16 comparten el commit `74d6888` (2026-09-05), 526 commits antes que `origin/main` — incluida la carpeta base del repo. Ya costó al menos 2 episodios documentados de trabajo duplicado en `BITACORA.md` (dos sesiones resolviendo lo mismo por caminos distintos, un PR fusionado que otra sesión ya había dejado listo). Sin una decisión de Felipe sobre cuáles borrar, el próximo choque de migraciones con el mismo timestamp o el próximo "arreglo" de un bug que ya no existe es cuestión de tiempo.

**3. Riesgo de que Traslados y Conteo estén rotos en producción ahora mismo, sin confirmar.** El código de las 4 vistas de Inventario (incluida la llamada a `iniciar_traslado`, a `transferencias.numero` y a `fn_conteos_resumen`) ya está fusionado en `origin/main`, y Vercel publica `main` en cada push. Pero las 4 migraciones que lo respaldan (`20260915204457`, `20260916110000`, `20260916150000`, `20260916200000`) están marcadas en su propio encabezado "solo LOCAL, no aplicar sin autorización de Felipe". Si no se pegaron ya en el SQL Editor de producción con prefijo `retail.`, dos de las cuatro pestañas del módulo (Traslados, Conteo) fallan hoy en las 3 tiendas con un error crudo de Postgres, y "Mover mercadería" no funciona en ninguna sede.

**4. El hueco de integridad más serio de toda la auditoría: `ventas`, `venta_items`, `devoluciones` y `devolucion_items` siguen aceptando INSERT/UPDATE directo desde el navegador**, saltándose `registrar_venta` y `aprobar_devolucion` por completo. El `GRANT` de `0005_grants.sql` nunca se revocó para estas 4 tablas — a diferencia de `movimientos`, donde sí se cerró (P-05/ADR-0055, 2026-09-15). Las policies de RLS solo exigen `fn_puede_operar_ubicacion()`, no validan precio, stock, caja abierta ni exigen ser líder. Consecuencia concreta: cualquier colaboradora autenticada, con la consola del navegador abierta, puede fabricar una venta fantasma en su sede o aprobarse su propia devolución en efectivo sin ser líder — y esto último corrompe en silencio el arqueo de `cerrar_caja`.

**5. `anular_venta` está construida, probada (8-9 escenarios con rollback) y nunca se aplicó a producción.** La migración `20260916172645` sigue sin pegarse en el SQL Editor de producción. Hoy, en el sistema real, no existe forma de anular una venta.

**6. Dos funciones para dar de alta un producto, con candados de negocio distintos, y la que de verdad se usa es la más limitada.** `/productos/nuevo` llama a `crear_producto_con_variantes` (sin fotos, temporada ni venta-sin-stock). La función extendida con esos tres campos, `catalogo_crear_producto`, existe pero ninguna ruta la llama. Resultado: hoy es imposible cargar fotos o fijar temporada al CREAR un producto — hay que crearlo primero y entrar a editar después.

**7. "Monto facturado" en el panel de Comprobantes suma todo lo que no debería.** `totalMes` (ComprobantesPanel.tsx:245) suma el total de TODOS los comprobantes del mes sin filtrar por estado ni ambiente: pendientes sin transmitir, rechazados, anulados, e incluso pruebas de sandbox. La cifra que Felipe (o su contador) usaría para conciliar está inflada por diseño, sin corregir desde que se detectó.

**8. La documentación viva contradice al código y se contradice a sí misma en varios puntos ya verificados.** `docs/ARQUITECTURA.md` describe secciones completas del modelo de identidad V1 (`fn_puede_operar_sede`, tabla `sedes`, `lib/persona.ts`) que ya no existen, y tiene dos secciones "Producción (Taller)" contradictorias en la misma subsección. `docs/BACKLOG.md` (2883 líneas, rompiendo su propia regla de "máx. 3 ítems por cubo") cita números de ADR equivocados dos veces (0035 en vez de 0072 para vocabulario cerrado; 0050/0052 en vez de 0051 para Producción) y describe al menos 3 bugs ya resueltos sin marcar como cerrados.

**9. La misma función de permiso tiene nombre distinto en local (`fn_puede_operar_sede`) y en producción (`puede_operar_sede`) desde 2026-09-10, sin resolver.** plpgsql no delata el error al compilar: un `create or replace` futuro que copie el cuerpo de un gemelo al otro compilaría en verde y recién reventaría cuando alguien la llame — exactamente el mismo patrón que ya mordió al proyecto con `recibir_lote` (ADR-0004) y con `registrar_movimiento` (dos firmas vivas hoy, 6 y 7 parámetros).

---

## Hechos — lo que ya funciona (verificado)

### Vender / Caja / Post-venta

**`registrar_venta` es atómica, idempotente y valida precio/descuento contra el catálogo** — exige caja abierta, valida que el precio recibido calce con `variantes.precio` (excepto Cargo especial), exige motivo de lista cerrada para cualquier descuento, nunca permite vender bajo costo, aplica el tope escalonado (20%/35%) solo al líder y exige código de descuento válido a la colaboradora; `p_token` evita duplicar la venta en un reintento de red. (`supabase/migrations/20260916223000_venta_precio_cambiado_sku_nulo.sql`)

**Cambios y Devoluciones ya exigen caja abierta cuando hay efectivo real de por medio** — `registrar_cambio` y `aprobar_devolucion` rechazan con el mismo mensaje que `registrar_venta` cuando la diferencia/reembolso es en efectivo y no hay caja abierta; cierra el hueco que ADR-0052/0053 habían dejado escrito a propósito. (`supabase/migrations/20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql`)

**`cerrar_caja` cuadra correctamente apertura + ventas + ingresos/egresos + reembolsos + cambios, con signo** — un solo `sum()` cubre ventas en efectivo, ingresos, egresos, reembolsos de devoluciones aprobadas en efectivo y `cambios.diferencia` (con signo) filtrado a método efectivo. `getResumenCaja` usa las mismas cuatro fuentes como vista previa antes del cierre (conteo ciego, ADR-0042). (`supabase/migrations/20260915200000_diferencia_de_cambio_en_el_arqueo.sql`; `apps/web/lib/caja.ts:87-115`)

**La cola de ventas offline está bien diseñada y documentada, con umbral de stock de sobra** — `lib/ventas-offline.ts` implementa `stockComprometido`/`carritoPasaElUmbral` (regla ADR-0013: tras vender debe quedar ≥1 unidad de piso), excluye ventas rechazadas del overlay y excluye Cargo especial del control de stock; `PuntoDeVenta.tsx` la conecta con detección de fallo de red, reintento automático y banner con "Descartar" de dos pasos. (`apps/web/lib/ventas-offline.ts`; `apps/web/components/PuntoDeVenta.tsx:658-687`)

**`anular_venta` (RPC + pantalla) está construida con candados correctos, aunque sin aplicar en producción** — solo líder, solo mientras la caja de la venta siga abierta, bloqueada si el comprobante ya fue enviado/aceptado por SUNAT, y bloqueada si algún ítem ya fue tocado por un Cambio o una Devolución no rechazada. `AnularVentaForm.tsx` pide condición por línea, consistente con Devoluciones. (`supabase/migrations/20260916172645_anular_venta.sql`; `apps/web/components/AnularVentaForm.tsx`)

**`vender/page.tsx` YA usa `fn_stock_por_sede()`** — lee "otras sedes" vía RPC en vez de un select directo a `stock` (que RLS habría filtrado mal para una colaboradora de sede fija). Esto contradice un ítem de `docs/BACKLOG.md` (líneas ~1015-1024) que todavía lo lista sin marcar como resuelto. (`apps/web/app/(app)/vender/page.tsx:49`)

**La pantalla de administración de códigos de descuento YA existe, restringida a líder** — `/vender/descuentos` + `CodigosDescuentoPanel` permiten crear/apagar/ver vigencia, con redirect si el rol no es líder. Contradice otro ítem de `docs/BACKLOG.md` (línea ~1113) que lo lista como "pendiente de construir". (`apps/web/app/(app)/vender/descuentos/page.tsx`)

### Facturación / SUNAT

**Facturación/SUNAT sobrevivió íntegro al corte V1→V2** — `page.tsx`, `ComprobantesPanel`, `ProformasPanel`, `VentasDelDiaPanel`, `lib/lucode.ts` y las 9 RPCs de `0010_facturacion.sql` existen en `origin/main` hoy, no solo en documentación. El propio `docs/BACKLOG.md` ya se autocorrigió el 2026-09-16 citando el commit de corte: "Facturación/SUNAT se rescata íntegra". (`apps/web/app/(app)/vender/facturacion/page.tsx:1-106`; `supabase/migrations/0010_facturacion.sql`)

**Reservar y transmitir están separados a propósito (principio 9, todo puede fallar)** — `emitir_comprobante` es un RPC de Postgres puro que reserva serie/número aunque Lucode esté caído; transmitir es un POST `/api/lucode/emitir` aparte que nunca inventa un estado si Lucode no responde: el comprobante queda "pendiente", visible para reintentar. (`supabase/migrations/0010_facturacion.sql:209-237`; `apps/web/app/api/lucode/emitir/route.ts:149-184`)

**Ambiente sandbox/producción no se puede confundir en ningún punto** — un CHECK hace imposible un comprobante "aceptado" sin ambiente conocido; una nota o anulación devuelve 409 explícito si el original se transmitió en el otro ambiente. La pantalla marca "· prueba" con borde punteado, no solo con color. (`supabase/migrations/0010_facturacion.sql:83-84`; `apps/web/components/ComprobantesPanel.tsx:17-39`)

**Anulación con dos caminos reales, verificados contra el sandbox de Lucode** — boleta va por resumen diario, factura/notas por comunicación de baja; verificado en vivo el 2026-09-09, no solo por documentación. "Anulado" solo se escribe con confirmación real de SUNAT. (`apps/web/lib/lucode.ts:307-355`; `docs/adr/0016-anulacion-de-comprobantes.md:83-108`)

**Acceso líder-only real, en tres capas independientes** (relacionado con el cierre de "control total temporal" que también documenta el módulo de Identidad) — `page.tsx` redirige si el rol no es líder; `anular_comprobante`/`registrar_serie_comprobante` vuelven a exigir `fn_es_lider()` dentro de la RPC. "Control total temporal" terminó el 2026-09-14. (`apps/web/app/(app)/vender/facturacion/page.tsx:22-23`; `supabase/migrations/0010_facturacion.sql:192-194,307-309`)

**Venta y comprobante nacen en la misma transacción (principio 9)** — `registrar_venta` llama a `emitir_comprobante` dentro de su propia transacción; una venta jamás queda separada de su comprobante. (`supabase/migrations/20260916223000_venta_precio_cambiado_sku_nulo.sql:241-244`)

**Cero camino de escritura que se salte las reglas de negocio** — `comprobantes`/`series_comprobantes`/`proformas` solo tienen GRANT SELECT; toda escritura pasa por RPC security definer. (`supabase/migrations/0010_facturacion.sql:394-425`) *(Corrección posterior, 2026-09-18, ver ADR-0104: esto es inexacto. `0010` otorga SELECT pero no revoca lo que `0005_grants.sql` ya había dado; hoy esas tablas están protegidas solo por RLS, no por permiso de tabla.)*

**Proformas vigentes ya no dependen del mes visible (corregido 2026-09-16)** — `getProformasMes` trae las vigentes en consulta aparte, sin filtro de fecha, y las fusiona con el historial por id. (`apps/web/lib/proformas.ts:12-38`)

### Productos / Catálogo / Taxonomía

**Vocabulario cerrado de colores, portado a V2 con su candado real** — `retail.colores` tiene índice único sobre `fn_clave_texto(nombre)` que hace imposible que "Azul marino" y "azul marino" convivan. Sobrevivió al corte como migración nueva (ADR-0072, no fusión de rama). (`supabase/migrations/20260912235500_vocabulario_cerrado.sql`)

**Colores: proponer/aprobar, de punta a punta** — cualquiera con sesión puede agregar un color y queda usable al instante; un trigger decide el estado real mirando si quien inserta es líder, nunca el cliente. No existe "rechazar", solo desactivar. (`supabase/migrations/20260916220000_colores_proponer_aprobar.sql`)

**Subcategoría opcional de un solo nivel, con candado en la base** — un trigger impide que una categoría con hijas se vuelva hija, o que una hija tenga a su vez hijas. (`supabase/migrations/20260915224501_categorias_subcategoria.sql`)

**Alta de producto con matriz talla×color en una transacción** — `crear_producto_con_variantes` valida todo el array antes de escribir una fila, es idempotente por token y exige `fn_es_lider()` dentro de la propia función. (`supabase/migrations/20260915221633_crear_producto_con_variantes.sql`)

**Listado de Productos con filtros y paginación resueltos en Postgres** — `listarProductos`/`getResumenProductos` llaman a `fn_productos`/`fn_productos_resumen`, paginado por producto y por número de página; ya no filtra en memoria del cliente. (`apps/web/lib/catalogo-v2.ts:78-260`)

**Identidad de variante con talla normalizada, ya aplicada en producción** — índice único que compara `fn_token_talla(talla)` en vez de texto exacto; según BACKLOG con verificación directa contra Postgres, ya se pegó y confirmó en producción el 2026-09-16. (`supabase/migrations/20260916190000_variantes_identidad_unica.sql`)

**Fotos, temporada y venta-sin-stock funcionan en la edición de producto** — `ProductoDetalle` trae `fotos`, `temporada` y `permitirVentaSinStock`; funciona en edición, aunque no en la alta (ver corrección). (`apps/web/lib/catalogo-v2.ts:260-340`)

**Historial de producto (movimientos + cambios de precio/categoría) ya construido** — combina `fn_movimientos` con un ledger append-only que un trigger llena solo. (`apps/web/app/(app)/productos/[id]/historial/page.tsx`)

### Inventario / Movimientos / Stock

**Existencias implementa fielmente las 4 vistas del ADR-0071** — semáforo de 4 estados, miniatura de producto, tarjeta "en camino" y `resumenRed()`, leído línea por línea coincide con la documentación. (`apps/web/lib/inventario-v2.ts`)

**Traslados en dos fases con locking determinístico para evitar deadlocks** — `fn_aplicar_movimiento`, rama traslado, bloquea SIEMPRE origen y destino en el mismo orden relativo (no "origen primero"), evitando un deadlock clásico; usa `is not distinct from` para comparar `sububicacion_id` NULL de forma segura. (`supabase/migrations/20260914230000_inventario_piso_almacen.sql:149-172`)

**Resolución de piso/almacén centralizada, sin duplicación** — `fn_sububicacion_por_defecto` es el único punto que decide sububicación; ~14 funciones de escritura la llaman, ninguna resuelve por su cuenta. (`supabase/migrations/20260914230000_inventario_piso_almacen.sql:74-88`)

**Movimientos: lectura 100% en Postgres, con cursor y filtros validados** — `listarMovimientos` usa `fn_movimientos` con paginado por cursor; `filtrosDesdeParams` valida cada parámetro de URL con regex antes de mandarlo a SQL. (`apps/web/lib/movimientos-v2.ts`)

**Integridad de cantidades es un constraint de esquema, no una validación de código** — `movimientos_cantidad_valida` y `transferencia_items_cantidad_check` hacen estructuralmente imposible una cantidad ≤0.

**El bug "sububicacion_id NULL en las 3 sedes" del BACKLOG ya no es cierto hoy para Lima y Trujillo** — consulta directa (2026-09-17) al Postgres local compartido: Tienda Lima 37/37 filas con sububicación asignada, Tienda Trujillo 17/17. Solo Taller tiene sus 48 filas en NULL, y eso es diseño intencional. `docs/BACKLOG.md` (2026-09-16) todavía lo describe como bug vigente en las TRES sedes — desactualizado (ver corrección abajo; también citado, con menos detalle temporal, desde Vender/Caja/Post-venta). (consulta SQL directa, 2026-09-17; `supabase/migrations/20260914230000_inventario_piso_almacen.sql:19`)

**Numeración corrida y `fn_conteos_resumen` ya existen en el Postgres local** — `transferencias.numero` y `conteos.numero` (con sequences y unique constraints), consistente con que ADR-0071 dice "Aplicado en local".

### Compras

**El rediseño de Compras del 14-sep sí está en el código y coincide con lo que describe el backlog** — `FiltrosCompras.tsx` (toggle "Más filtros"), `CompraFormV2.tsx` (resumen sticky, Enter-en-costo), `por-pagar/page.tsx` (una tabla en 3 tramos), `RecepcionCompraFormV2.tsx` (curva de tallas, "Todo llegó", barra fija) — los 4 archivos leídos completos calzan con la documentación. (`apps/web/components/FiltrosCompras.tsx`, `CompraFormV2.tsx`, `RecepcionCompraFormV2.tsx`; `apps/web/app/(app)/compras/por-pagar/page.tsx`)

**La arquitectura de ADR-0035/0036 (factura como eje, foto por triggers, paginado por cursor) está implementada tal como documentan los ADRs** — triggers mantienen `pagado`/`facturado_cantidad`/`recibido_cantidad`; columnas generadas `saldo`/`estado_pago`/`estado_recepcion`; `listar_compras()` usa cursor keyset, no CASE dinámico. (`supabase/migrations/20260912234815_compras_snapshot_y_paginado.sql`)

**Todas las migraciones de Compras que el backlog marca "sí está en producción" existen en el repo con el contenido que describen** — las 7 migraciones del 12 y 14 de septiembre, más `proveedores_administrables` e `igv_solo_en_factura`.

**Escritura solo por RPC, cero estados imposibles en el modelo de facturas** — `compras`/`compra_items`/`compra_pagos` solo con SELECT; `registrar_compra` valida todo antes de escribir; `anular_compra` rechaza si hay pagos o recepción; `recibir_compras` bloquea la línea con `FOR UPDATE` antes de validar excedente. (`supabase/migrations/20260912231956_compras_desde_factura.sql:180-547`)

**Las pruebas unitarias del cálculo de IGV son reales y cubren el caso de redondeo que motivó el fix** — incluido el caso documentado en BITÁCORA (1×S/10 con IGV → base 8.47, IGV 1.53, total 10.00). (`apps/web/lib/compras-reglas.test.ts:1-49`)

**`fn_puede_registrar_compras()` no hereda el bug de NULL-como-permiso que sí tuvo `fn_puede_operar_ubicacion`** — delega en `fn_es_lider()`, que usa `exists(...)`, siempre true/false real. (`supabase/migrations/0016_roles_colaborador.sql:38-46`)

### Producción / Taller

**Ciclo completo de una orden implementado y sin puerta de escritura fuera de las RPC** — las 5 RPC security-definer son la única forma de escribir en `producciones`/`produccion_lineas`; no hay policy de insert/update/delete. (`supabase/migrations/20260915130000_produccion_del_taller.sql`)

**Estados imposibles bloqueados por constraint, no por validación en código** — `producciones_terminada_coherente` hace imposible una orden "terminada" sin `cantidad_buenas`; el doble cierre queda bloqueado dentro de `cerrar_produccion` (lock FOR UPDATE + chequeo de estado).

**Reglas de costo y semáforo de margen cubiertas por tests puros que replican la fórmula SQL** — `lib/produccion-reglas.ts` (costoUnitario, semaforoMargen, umbrales 60%/40%) con 8 tests, incluida la regla de que la merma sube el costo unitario. (`apps/web/lib/produccion-reglas.ts` y `.test.ts`)

**El acceso a Producción hoy es consistente entre menú y guard de página (revert de hoy)** — el commit `2a3a35a` (17-sep) quitó la excepción "líder ve Producción desde cualquier ubicación" tanto en `AppShell.tsx` como en `produccion/page.tsx` — antes eran dos partes del sistema decidiendo lo mismo de dos formas distintas, ahora coinciden. (commit `2a3a35a`)

**Las variantes nunca se crean al vuelo desde una orden** — la matriz color×talla solo ofrece celdas para variantes que ya existen; `abrir_produccion` valida en SQL que cada variante pertenezca al producto elegido, decisión documentada en ADR-0051 punto 5 para evitar el problema de V1.

### Identidad / Roles / Permisos / Seguridad

**El modelo de identidad se reescribió completo en el corte V1→V2 (2026-09-12)** — retail dejó de tener su propia tabla `personas`; la identidad se lee en vivo desde `public.personas` (Dynamic) vía funciones security definer (`fn_es_lider`, `fn_ubicacion_actual_persona`, `fn_puede_operar_ubicacion`) y `fn_persona_actual_resumen`. El frontend usa `lib/persona-actual.ts`. (`supabase/migrations/0009_integracion_dynamic.sql:1-30`)

**El hueco "control total temporal" (cualquier activo de Dynamic = Líder) está cerrado en código y en producción** — `0012_control_total_temporal.sql` (2026-09-12) hizo que `fn_es_lider()` devolviera true para cualquiera; `0016_roles_colaborador.sql` (2026-09-14) lo cerró con una allowlist real (`retail.colaboradores`), aplicado y verificado en producción el mismo día (también citado desde Facturación y observado indirectamente en el guard de Producción). (`docs/BITACORA.md`, línea 1117-1139)

**Defensa en 3 capas real para pantallas líder-only** — Compras, Facturación y Colaboradores exigen rol líder en pantalla, RPC y RLS de forma independiente; el guard de Compras vive en el layout, corregido el 2026-09-14 tras probarse en vivo que un Colaborador cargaba `/compras` completo por URL directa.

**El hueco crítico de la auditoría de "26 agentes" (`retail.personas` escribible) ya no existe como objeto** — la memoria de sesión (2026-09-05) documentaba `retail.personas` como vista con `security_invoker=false` y UPDATE abierto a `authenticated`; `0009_integracion_dynamic.sql` hace `drop table retail.personas` sin reemplazo. BITÁCORA 2026-09-16 confirma contra `information_schema.tables` que ya no existe.

**`fn_puede_operar_ubicacion` no tiene el bug de bypass por NULL** — envuelve el resultado en `coalesce(..., false)`, cerrando el bug que 0006 documenta arreglar (`fn_es_lider() OR NULL` da NULL, no false).

**El modelo `sedes`→`ubicaciones` sí cambió de nombre completo tras V2; ambos lados están al día** — `lib/ubicaciones.ts` + tabla propia `retail.ubicaciones`, con `sede_dynamic_id` opcional que enlaza solo las ubicaciones que corresponden a una sede real de Dynamic.

**La cookie de ubicación activa nunca es la única puerta** — `cambiarUbicacionActiva` llama a `fn_puede_operar_ubicacion` ANTES de guardar la cookie, y cada RPC de escritura la vuelve a validar por su cuenta. (`apps/web/app/actions/ubicacion.ts:19-30`)

### Infraestructura y meta-estado del proyecto

**ADR-0004 (`recibir_lote`) quedó resuelto de raíz por el corte V2, no por su propio parche** — el `recibir_lote` real de V2 valida `fn_puede_operar_ubicacion` desde el diseño, ya no inserta en `productos`, y sí acepta `p_orden_compra_id`. El bug no sigue vivo: fue reemplazado, no arreglado. (`supabase/migrations/0003_funciones.sql:178-215`)

**`docs/datos/` es el sistema de documentación de datos más riguroso del repo, y se declara consciente de sus propios huecos** — 14 módulos + `generado/` (diccionarios, RPCS.md, DRIFT.md) regenerados desde un volcado real de producción, nunca a mano.

**`datos:comparar` funciona hoy y reporta 0 roto en producción** — el generado `DRIFT.md` (regenerado 2026-09-15) compara 44 llamadas `.rpc(...)` contra 73 funciones reales del schema `retail`: 0 rotas, 9 avisos benignos, 13 funciones sin ninguna pantalla que las use.

**`migraciones:verificar` existe, es honesto sobre lo que no puede afirmar, y ya evitó un susto real** — extrae qué promete cada uno de los ~75 archivos SQL y los cruza contra el inventario real; documenta con precisión sus 3 límites (no distingue cuál versión de un `create or replace` quedó viva, no entiende archivos de solo insert/grant, no ve sobrecargas de firma).

**ADR-0066 estableció un patrón real para probar RPCs de escritura contra Postgres real, con rollback** — `registrar_cambio.mjs` (12 escenarios) y `aprobar_devolucion_caja.mjs` hablan directo a `psql` dentro de una transacción que siempre termina en ROLLBACK, sin tocar el Postgres compartido por ~27 worktrees.

**CI real desde 2026-09-09: typecheck + lint + tests en cada push a main** — `.github/workflows/ci.yml` corre `next typegen` → `typecheck` → `lint` → `test`, con concurrencia que cancela corridas duplicadas.

**V2 rescató a propósito la única tabla de Finanzas con datos reales (`activos_fijos`, 39 filas)** — el corte borró Finanzas completa porque su data era de prueba, excepto `activos_fijos`, para la que se escribió una migración V2 propia sin la FK a `cuentas_contables` que exigía V1.

---

## Pendientes

### Vender / Caja / Post-venta

**`stock.sububicacion_id` en NULL bloquea toda venta en el Postgres LOCAL compartido** — `fn_sububicacion_por_defecto` siempre devuelve un UUID real de "Piso de venta", y `fn_aplicar_movimiento` compara contra `stock.sububicacion_id` — pero el stock existente quedó en NULL porque una migración agregó la columna sin backfill. Efecto: cualquier venta/cambio/anulación local falla con "Stock insuficiente: hay 0". Bitácora confirma que producción NO sufre esto. Sin dueño ni backfill decidido todavía. *(Ver corrección en Inventario/Movimientos/Stock: para 2026-09-17 esto ya no es cierto para Lima y Trujillo — verificado con SQL directo, solo Taller sigue en NULL, por diseño.)* (`supabase/migrations/20260914230000_inventario_piso_almacen.sql:74-142`)

**`anular_venta` sin aplicar en producción** — probada en local (8-9 escenarios) y por Felipe en su sesión, pero la migración `20260916172645` no se ha pegado en producción. Dueño: Felipe. **Solo en BACKLOG, sin verificar contra el código en producción.** (`docs/adr/0065-anular-una-venta.md`, sección "Estado")

**`totalEfectivoEncolado()` existe pero no está conectada a `CerrarCajaModalV2`** — la función que suma cuánto efectivo hay atrapado en la cola offline está escrita y probada, pero solo se usa en su propio test. Si se cierra caja con ventas en efectivo encoladas, el "esperado" no las incluye y aparece un sobrante que no es error de nadie. (`apps/web/lib/ventas-offline.ts:155`)

**Cero pruebas automatizadas sobre `registrar_venta`** — sí existen scripts para `registrar_cambio`, `aprobar_devolucion` y `abrir_caja`/`cerrar_caja`, pero ninguno cubre el RPC de mayor riesgo del módulo. (verificado: no existe `scripts/pruebas/registrar_venta.mjs`)

**La caja no tiene día de negocio** — la tabla `cajas` no tiene columna de fecha ni cierre automático; una caja abierta el lunes puede seguir abierta el viernes arrastrando toda la semana. (`supabase/migrations/0008_caja_y_pagos.sql:20-35`)

**Ficha de clienta pospuesta por decisión explícita de Felipe** — `registrar_venta` acepta `p_cliente_id` desde hace tiempo, pero Vender nunca lo manda; Felipe respondió que aún no decide si va a almacenar clientas. **Solo en BACKLOG, sin verificar en el código de ejecución.** (`docs/BACKLOG.md` línea ~1091-1098, cita de Felipe 2026-09-16)

**No se puede medir cuánto se regala por código de descuento pese a que ya existe la pantalla de administración** — ni `ventas` ni `venta_items` guardan qué código se usó (solo el motivo). La pantalla `/vender/descuentos` ya permite crear y apagar códigos, pero no hay forma de saber cuánto margen se regaló por cada uno. (grep sobre `supabase/migrations/*`: ninguna columna persiste el código usado)

### Facturación / SUNAT

**Conectar "Ventas de hoy" con "Emitir comprobante" — Felipe lo pospuso explícitamente** — hay que mirar el monto en un panel y volver a tipearlo en el otro; `emitir_comprobante` ya acepta `p_venta_id`/`p_items` pero el `onEmitir` de `ComprobantesPanel.tsx` no los manda. (`apps/web/components/ComprobantesPanel.tsx:263-291`; `docs/BACKLOG.md` líneas 2035-2042, "pospuesto 2026-09-16")

**Correlativo reservado que nunca se transmitió — 2 casos reales sin salida, según BACKLOG** — `anular_comprobante` exige `estado='aceptado'`, y la pantalla nunca ofrece "Anular" para un "pendiente". El backlog documenta dos números reales quemados en producción. **Solo en BACKLOG, sin verificar en producción.** (`supabase/migrations/0010_facturacion.sql:298-335`; `docs/BACKLOG.md` líneas 2044-2059)

**Guía de Remisión Electrónica (SUNAT) para traslados entre ubicaciones — cero código** — obligatoria desde 2023 para mover mercadería tienda/Taller. Confirmado por grep sobre todo el repo: cero menciones de "remision". Felipe decidió no construirla todavía. (`docs/BACKLOG.md` líneas 152-158)

**Trámite de alta como PSE tercero ante SUNAT SOL — sin confirmación posterior en el repo** — última fecha documentada 2026-09-05; no hay entrada posterior que confirme el trámite cerrado, pese a boletas reales ya transmitidas en "producción". **Solo en BACKLOG, sin verificar.** (`docs/adr/0005-facturacion-electronica-parte-en-dos.md` líneas 105-112)

### Productos / Catálogo / Taxonomía

**Stock fantasma de los productos de prueba archivados** — 6 productos descontinuados dejaron de contar en catálogo/caja/conteo, pero sus ~1.600 unidades siguen en `retail.stock`. **Solo en BACKLOG, sin verificar en producción.** (`docs/BACKLOG.md`, sección "Loro", 2026-09-16)

**Verificación de RLS de `colores_update_lider` pendiente con cuenta real** — la lógica del trigger se probó por impersonación con ROLLBACK, pero la policy que bloquea a un Colaborador de aprobar un color nunca se probó de punta a punta (relacionado con el mismo hueco de verificación que reporta Identidad). **Solo en BACKLOG, sin verificar.** (`docs/adr/0070-colores-proponer-aprobar.md`)

**Subida real de la muestra de color nunca probada con Storage encendido** — se verificó solo a nivel de mecanismo de display; la subida navegador→bucket nunca corrió con Supabase Storage real. **Solo en BACKLOG, sin verificar.** (`docs/adr/0061-muestra-de-color-columna-y-bucket-publico.md`)

**`productos.referencia` sigue sin constraint de unicidad** — ninguna migración crea índice único; dos productos pueden llamarse exactamente igual. Decisión de negocio pendiente, no olvido técnico. (grep sin resultados en `supabase/migrations/*.sql`)

**Mecanismo proponer/aprobar aún no existe para categorías** — el mismo mecanismo de Colores sigue pendiente para "Tucán" (taxonomía); hoy agregar/editar categoría exige Líder sin excepción. **Solo en BACKLOG, sin verificar.**

**Cero pruebas automatizadas para la lógica nueva de catálogo** — `apps/web/lib` solo tiene `catalogo-grupos.test.ts`; nada cubre el trigger de proponer/aprobar colores ni el de subcategoría única (reconocido en el propio ADR como D-25).

### Inventario / Movimientos / Stock

**Aplicar en producción la cadena de migraciones de Inventario 2026-09-15/16** — `20260915204457` (fn_movimientos + p_producto_id), `20260916110000` (alcance de conteo), `20260916150000` (traslados dos fases), `20260916200000` (numeración + fn_conteos_resumen) — las 4 marcadas "solo local"/"pendiente producción". Dueño: Felipe, pegar en orden con prefijo `retail.`. (*ver también la urgencia de esto en la corrección de este mismo módulo, y la mención general en Infraestructura*). **Solo en BACKLOG, sin verificar contra producción.**

**Exportar a CSV/Excel en Existencias y Movimientos** — quedó fuera a propósito de la pasada de ADR-0071. **Solo en BACKLOG.**

**"Ajuste rápido" desde la cabecera de Movimientos** — hoy el ajuste solo se abre por fila desde Existencias; el diseño original lo pedía también desde Movimientos. **Solo en BACKLOG.**

**Cero pruebas automatizadas contra Postgres real para las RPC de escritura de Inventario** — `iniciar_traslado`, `confirmar_traslado`, `cerrar_traslado_con_diferencia`, `registrar_recepcion_traslado`, `abrir_conteo`, `conteo_contar`, `cerrar_conteo` y `mover_interno` no tienen ningún script en `scripts/pruebas/`; el propio ADR-0063 admite que ni una subida exitosa real de traslado se pudo demostrar de punta a punta.

### Compras

**El rediseño de Compras del 14-sep sigue sin verse renderizado en navegador desde esa fecha** — revisando BITÁCORA completa después del 14-sep no hay ninguna entrada de "compras"; lo único verificado ese día fue Recibir. Nadie ha vuelto a mirar `/compras`, `/compras/nueva` ni `/compras/por-pagar` en navegador real desde entonces.

**No existe ninguna prueba automatizada de UI para el flujo de recepción** — el repo no tiene Playwright ni `@testing-library` instalados; la "verificación con Playwright" del 14-sep fue una sesión efímera de MCP, no quedó como test.

**Decisión pendiente: qué hacer con una factura recibida a medias para siempre** — ADR-0035 deja explícitamente abierto si se agrega una acción para cerrar una línea con faltante. **Solo en BACKLOG.**

**Un pago a proveedor registrado por error no tiene reverso** — deja esa factura bloqueada para pagos futuros para siempre porque no existe RPC de reverso. **Solo en BACKLOG.**

**La subida real de adjuntos nunca se probó de punta a punta** — la tabla/RPC/bucket existen, pero como Storage está apagado en el Postgres local, nadie ha subido un archivo real desde el navegador y confirmado que aparece y se descarga. **Solo en BACKLOG.**

### Producción / Taller

**Refrescar el diccionario de datos de Producción** — ADR-0051 deja pendiente correr `pnpm datos:generar:produccion`. **Solo en BACKLOG.**

**Tres decisiones de ADR-0051 §5 siguen sin cerrar formalmente** — atajo "Nuevo modelo" desde la orden (depende de que Productos V2 permita crear variantes desde pantalla), si "tercerizado" se marca al abrir o por etapa, y si agregar `productos.material` (V1). **Solo en BACKLOG.**

**Entrada manual del Taller sin corrida de producción, sin resolver** — V1 tenía `RecibirLoteForm`; V2 lo cubre vía Compras → Recibir, sin vínculo a una orden de producción. **Solo en BACKLOG** para la decisión, aunque el mecanismo actual sí está verificado en código.

**Reconciliar `ordenes_produccion` (V1, legado) con `producciones` (vigente) — deliberadamente fuera de alcance** — verificado que ningún componente ni RPC vigente en `origin/main` las lee (`git grep` sin resultados).

**Insumos del taller: sin inventario real de materia prima** — el costo directo se declara a mano en cada orden; no hay tabla de insumos ni stock de tela. Decisión de julio: postergado a propósito.

**BITACORA.md sin entrada para el revert del 2026-09-17** — el commit `2a3a35a` de hoy no tiene su registro de 3 líneas todavía.

### Identidad / Roles / Permisos / Seguridad

**Falta verificar en navegador que un Colaborador de sede fija opera realmente sobre SU sede** — Micaela existe como colaboradora de Tienda Trujillo en local, pero falta confirmar en navegador que caja/selector/escáner operan sobre esa sede. **Solo en BACKLOG.**

**El conteo ciego de caja no es realmente ciego para quien la opera** — `ventas_select` permite consultar las ventas de la sede desde las devtools, revelando el total esperado antes de contar. Depende de una decisión de Felipe sobre granularidad de permisos (D-12, sin construir). **Solo en BACKLOG.**

**Las políticas RLS de "Colores: proponer/aprobar" no se probaron con una cuenta real, solo por analogía** (mismo hallazgo que reporta Productos/Catálogo) — la conexión usada tiene `rolbypassrls=true`. **Solo en BACKLOG.**

**`docs/ARQUITECTURA.md` necesita reescribir su sección de identidad/roles sobre V2** — el documento se autodeclara "fotografía al 2026-09-04" y nunca se actualizó para reflejar `lib/persona-actual.ts`, `retail.colaboradores` y el rol "colaborador".

### Infraestructura y meta-estado del proyecto

**Ninguna RPC del núcleo de dinero/stock tiene prueba automatizada contra Postgres real** — solo `registrar_cambio` y `aprobar_devolucion_caja` tienen el patrón de ADR-0066; `registrar_venta`, `cerrar_caja`, `transferir`, `mover_interno`, `recibir_lote` siguen dependiendo de verificación manual. (`docs/adr/0066-...md`, sección "Lo que falta")

**La función de permiso con nombre distinto (local vs producción) sigue sin arreglo de fondo** — `fn_puede_operar_sede` (local) vs `puede_operar_sede` (producción), abierto desde 2026-09-10, sin marca `[x]` en BACKLOG.

**`registrar_movimiento` tiene dos firmas vivas en producción (6 y 7 parámetros)** — mismo patrón que ADR-0004: un `create or replace` con parámetro nuevo no reemplazó la firma vieja. Hoy no rompe nada porque ninguna pantalla la llama directo.

**`migraciones:verificar` y `datos:comparar` no corren en CI** — dependen 100% de que alguien se acuerde de correrlos manualmente antes de una sesión grande.

**Al menos 21 de 60 worktrees están a más de 250 commits de atraso respecto a `origin/main`** — 16 comparten exactamente el commit `74d6888` (526 commits atrás), 5 más entre 270 y 538 commits. Dueño: Felipe — decidir cuáles borrar. (comando corrido en esta sesión, 2026-09-17)

**Migraciones recientes del BACKLOG marcadas "aplicar en producción" sin confirmar hoy** — incluye `20260916200000_numeracion_traslados_conteos.sql` (detalle completo en Inventario/Movimientos/Stock) y varias más de la sesión "5 piezas inspiradas en NetSuite". El propio BACKLOG se corrige a sí mismo el mismo día. **Solo en BACKLOG, sin verificar contra producción.**

---

## Correcciones — deuda y bugs

### Vender / Caja / Post-venta

**`ventas` y `venta_items` siguen aceptando INSERT directo, saltándose `registrar_venta` por completo** — `0005_grants.sql` da INSERT/UPDATE/DELETE en bloque a `authenticated` sobre todas las tablas de retail, y nunca se revocó para estas dos (sí se revocó para `movimientos` en P-05, 2026-09-15). Las policies solo exigen `fn_puede_operar_ubicacion` — no verifican precio, stock, caja abierta, ni generan comprobante o movimiento de stock. Cualquier colaboradora autenticada podría insertar una "venta" fantasma desde la consola. Es exactamente el mismo hueco que P-05 ya cerró para movimientos, sin extenderlo aquí — ni siquiera aparece mencionado junto a "transferencias" en la lista de pendientes de ADR-0055. (`supabase/migrations/0004_rls.sql:103-114`; `0005_grants.sql:16-23`)

**`devoluciones`/`devolucion_items` tienen policy "for all": cualquier colaboradora puede aprobar su propia devolución en efectivo sin ser líder** — son policies FOR ALL que solo exigen `fn_puede_operar_ubicacion`, no `fn_es_lider()`. `aprobar_devolucion` (la RPC) sí exige líder, pero eso no importa si alguien hace un UPDATE directo vía PostgREST: puede fijar `estado='aprobada'`, `reembolso_metodo='efectivo'`, monto y caja a mano, sin generar el movimiento de reposición de stock. Corrompe silenciosamente el arqueo de `cerrar_caja`. (`supabase/migrations/0004_rls.sql:118-127`)

**`anular_venta` repone stock sin fijar `sububicacion_id`, a diferencia de todos los demás caminos de reversa** — el INSERT de reversa (condición "vendible") omite la columna, quedando NULL por defecto, mientras `registrar_venta`, `registrar_cambio` y `aprobar_devolucion` sí calculan `fn_sububicacion_por_defecto` y lo escriben. Hoy queda enmascarado porque todo el stock local vive en NULL — en cuanto se corrija ese backfill, una venta anulada devolverá la prenda a un "cajón" sin sububicación en vez de a Piso de venta. (`supabase/migrations/20260916172645_anular_venta.sql:121`)

**`docs/BACKLOG.md` tiene al menos dos ítems obsoletos sin marcar en Vender/Caja** — "cambiar `vender/page.tsx` a `fn_stock_por_sede`" ya está hecho; "administrar códigos de descuento" ya tiene pantalla (`/vender/descuentos`, 2026-09-15). El backlog no se reescribió para reflejar ninguno de los dos cierres. (`docs/BACKLOG.md` líneas ~1015-1024 y ~1113-1116)

### Facturación / SUNAT

**"Monto facturado" suma comprobantes que nunca fueron una venta facturada** — `totalMes` suma el total de TODOS los comprobantes del mes sin filtrar por estado: pendientes, rechazados, anulados, y hasta comprobantes de prueba (sandbox). La cifra que un líder usaría para conciliar con su contador está inflada por diseño, sin corregir desde que se encontró. (`apps/web/components/ComprobantesPanel.tsx:245`)

**Un comprobante en estado "enviado" es un callejón sin salida en la pantalla** — `accionComprobante()` solo ofrece "Transmitir" para pendiente/rechazado y "Anular" para aceptado; un comprobante que Lucode devolvió como PENDIENTE al emitir cae al último else y pinta solo un guion, sin acción disponible. `consultarEstadoLucode()` existe para re-consultar ese caso pero ninguna ruta la llama — código muerto (su equivalente para anulación sí se usa). (`apps/web/components/ComprobantesPanel.tsx:60-94`; `apps/web/lib/lucode.ts:301-305`)

**Proformas: cero indicio de ubicación pese a mostrar las 3 tiendas mezcladas** — `getProformasMes` trae todas las vigentes sin filtrar por ubicación (correcto para un líder), pero `ProformasPanel.tsx` nunca pinta `ubicacion_id`/nombre; el prop `ubicaciones` solo se usa para el desplegable de "Nueva proforma". (`apps/web/lib/proformas.ts:19-27`; `apps/web/components/ProformasPanel.tsx:192-275`)

**El PDF/CDR que Lucode ya devuelve se descarta y nunca se persiste ni se muestra** — `/api/lucode/emitir` responde con `xmlUrl`/`cdrUrl`/`pdfUrl` reales, pero `ComprobantesPanel.tsx` solo lee `datos.error`; ni la consulta ni el tipo `Comprobante` exponen `respuesta_sunat`. Un líder que necesita entregar el PDF tiene que entrar al panel de Lucode aparte. (`apps/web/app/api/lucode/emitir/route.ts:186-192`; `apps/web/lib/comprobantes.ts:17-25`)

### Productos / Catálogo / Taxonomía

**ADR-0030 (taxonomía universal Shopify) no existe en el código real — quedó completamente borrada** — se declara "Construido y verificado" (1.849 categorías, 10.216 valores, 108 tests), pero en `origin/main` no existe ninguna tabla `taxonomia_*`, ni la ruta `/inventario/taxonomia`, ni `lib/taxonomia/anclar.ts`. El corte V1→V2 se llevó todo el mecanismo. Solo sobreviven dos archivos huérfanos: `AnclarVocabulario.tsx` (0 importadores) y `scripts/taxonomia/cargar.mjs` (genera SQL contra tablas que ya no existen). Ni ADR-0072 ni ADR-0073 mencionan explícitamente que esta capa también desapareció. (`git grep 'taxonomia'` sobre `supabase/migrations` → 0 resultados)

**Referencia de ADR rota, repetida en el propio BACKLOG** — tanto la consigna de esta auditoría como `docs/BACKLOG.md` (línea 6) citan "docs/adr/0035-vocabulario-cerrado-portado-no-fusionado.md". Ese archivo hoy es 0035-la-factura-de-compra-es-el-eje-de-recepcion-y-pago.md (Compras). El ADR correcto es el **0072**, renumerado el 2026-09-16 tras colisión de dos sesiones paralelas.

**Dos RPCs distintas para crear un producto — la que de verdad se usa no soporta fotos/temporada/venta sin stock** — `/productos/nuevo` usa `NuevoProductoForm` → `crear_producto_con_variantes` (sin fotos/temporada). Existe `catalogo_crear_producto`, extendida el mismo día con esos 3 campos, cuyo propio comentario SQL dice "para /productos/nuevo" — pero ninguna ruta la llama. Consecuencia real: hoy es imposible cargar fotos, fijar temporada o marcar "venta sin stock" AL CREAR un producto. (`apps/web/app/(app)/productos/nuevo/page.tsx`; `supabase/migrations/20260915224500_producto_fotos_temporada_venta_sin_stock.sql`)

**TODOs muertos en la ficha de edición de producto** — `/productos/[id]/editar/page.tsx` sigue mostrando dos tarjetas placeholder ("TODO(Sesión A2)"/"TODO(Sesión A3)") aunque ambas funciones ya existen ("Ajustar inventario" y el historial).

**ADR-0069 quedó con estado desactualizado frente al BACKLOG del mismo día** — dice "Producción: pendiente de que Felipe pegue [...]", pero el BACKLOG (misma fecha) certifica con consulta directa a Postgres que ese SQL ya está pegado y confirmado en producción.

### Inventario / Movimientos / Stock

**Riesgo de desincronización código↔esquema en producción (Traslados y Conteo)** — el código de las 4 vistas de Inventario (incluida la llamada a `iniciar_traslado`, `transferencias.numero` y `fn_conteos_resumen`) ya está fusionado en `origin/main` — y por tanto ya es lo que Vercel publica en cada push. Sus migraciones están marcadas explícitamente "solo local"/"pendiente producción". Si no se aplicaron ya, hoy mismo Traslados y Conteo (2 de las 4 pestañas) fallarían al abrir en producción con error crudo de Postgres, y "Mover mercadería" no funcionaría en ninguna sede. No se pudo confirmar el estado real de producción — punto más urgente de verificar hoy con Felipe. (`docs/BACKLOG.md:60-64`)

**`docs/BACKLOG.md` describe un bug de `sububicacion_id` que ya no es cierto hoy** — el ítem "stock.sububicacion_id en NULL en las tres sedes" (2026-09-16) ya no coincide con el Postgres local compartido: Lima y Trujillo están 100% backfilleadas (verificado 2026-09-17). Documentación desactualizada del tipo exacto que esta auditoría pidió detectar.

**Comentario desactualizado en `mover/page.tsx` sobre la RPC `transferir()`** — sigue diciendo "`transferir()` sale del almacén de tienda..." pero esa función fue eliminada (`drop function if exists retail.transferir`) y reemplazada por `iniciar_traslado` desde el 2026-09-16. No afecta funcionalidad, pero confunde a quien lea el archivo. (`apps/web/app/(app)/inventario/mover/page.tsx:15-19`)

### Compras

**`recibir/page.tsx` tiene código y comentario muertos desde que el layout bloquea a cualquier no-líder** — sigue calculando "ubicacionesPermitidas" distinto para líder vs. integrante, pero `layout.tsx` (2026-09-16) hace redirect a cualquier `persona.rol !== 'lider'` ANTES de que esa página cargue — ninguna integrante llega nunca a ejecutar esa rama. (`apps/web/app/(app)/compras/layout.tsx:38-40`; `recibir/page.tsx:27`)

**`recalcular_compras()` es invocable por cualquier persona autenticada, sin chequeo de rol, a diferencia de toda otra RPC de Compras** — a diferencia de `registrar_compra`/`anular_compra`/`recibir_compras`/`registrar_pagos_compra` (todas empiezan con chequeo de `fn_puede_registrar_compras()`), esta no tiene ninguno. Por el `alter default privileges` de `0005_grants.sql`, cualquier función nueva sin REVOKE explícito queda ejecutable por cualquier sesión autenticada. El propio repo ya conoce el patrón correcto (revocado explícitamente para `fn_recalcular_costo_variante` el 16-sep) pero no se aplicó aquí. Hoy es inofensivo (recalcula desde la verdad), pero con más volumen es una vía de degradación de performance expuesta sin control de rol. (`supabase/migrations/20260912234815_compras_snapshot_y_paginado.sql:105-120,288`)

### Producción / Taller

**Contradicción documental sobre si `produccion_del_taller` está en producción, ya resuelta pero no cerrada en el backlog** — el header de la migración dice "NO en producción"; ADR-0051 dice "Aplicado... verificado 2026-09-15"; `docs/BACKLOG.md` (línea 1387) marca esto como contradicción sin resolver. BITÁCORA del 16-sep SÍ lo resuelve (confirma contra objetos reales que existen en producción), pero el ítem de BACKLOG nunca se tachó.

**`docs/ARQUITECTURA.md` tiene dos secciones "Producción (Taller)" contradictorias en la misma subsección** — líneas 191-198 describen correctamente el modelo V2 vigente; líneas 272-276, dentro de la MISMA subsección 3.1, describen RPCs que no existen en ningún lugar del código actual (`revertir_produccion_inventario`, `eliminar_produccion`) seguidas de una sección "Finanzas/contabilidad" completa sobre un módulo borrado en el corte. Documentación V1 pegada sin depurar.

**Número de ADR equivocado para la vuelta de Producción, en dos documentos distintos** — BACKLOG cita "ADR-0050 §5"; ARQUITECTURA.md cita "ADR-0052". Ninguno es correcto: el ADR real es el **0051** (ADR-0050 es de categorías de Movimientos; ADR-0052 es del reembolso en efectivo de caja). Cuatro sesiones eligieron el número 0051 el mismo día y hubo una renumeración que estos dos documentos no reflejaron.

**El costo real puede pisar el estimado con cero, sin aviso, si se deja vacío el campo al cerrar** — `cerrar_produccion` documenta que "los costos que lleguen null conservan el estimado", pero `CierreOrdenModal` nunca envía null: usa `Number(tela) || 0`, así que un campo vacío se traduce a 0. Solo se valida que `totalBuenas` sea mayor a cero, no los costos. (`apps/web/components/OrdenesProduccionV2.tsx`)

**`reversion_produccion` sin etiqueta propia en Movimientos; el pendiente de ADR-0051 quedó a medias** — ya no es cierto para "produccion" (tiene etiqueta desde el rediseño de ADR-0050), pero sigue siendo cierto para "reversion_produccion", que cae al fallback `motivo.replace(/_/g,' ')`. Tampoco hay enlace desde Movimientos hacia la orden de producción de origen. (`apps/web/lib/movimientos-reglas.ts:49-66`)

### Identidad / Roles / Permisos / Seguridad

**El BACKLOG describe una trampa de nombres (`fn_puede_operar_sede`) que ya no existe post-V2** — `docs/BACKLOG.md` (líneas 1965-1983, fechado 2026-09-10, antes del corte) advierte sobre `fn_puede_operar_sede`/`puede_operar_sede`. Ese modelo entero fue reemplazado el 2026-09-12: la función viva hoy es `fn_puede_operar_ubicacion`. BITÁCORA lo dice explícitamente dos veces. (Este hallazgo sobre nombres de funciones gemelas sigue vivo, pero para *otra* función — ver el pendiente de Infraestructura sobre `puede_operar_sede`.)

**`docs/ARQUITECTURA.md` describe el modelo de identidad V1 completo, ya reemplazado** — las secciones "Identidad y sede" (§3.1), "RLS sin tenant_id" (§4.3) y "Vocabulario" (§9) citan `lib/persona.ts`, la cookie `cayla_sede_activa`, `fn_puede_operar_sede`, la tabla `sedes` y el rol "integrante". Ninguno de estos objetos existe hoy: son `lib/persona-actual.ts`, cookie `cayla_ubicacion_activa`, `fn_puede_operar_ubicacion`, tabla `ubicaciones`, rol "colaborador".

**`apps/web/proxy.ts` tiene comentarios que citan archivos y funciones inexistentes** — dice que la escritura pasa por `fn_puede_operar_sede (0012)` y menciona `app/actions/sede.ts` y `lib/persona.ts` como si existieran. Ninguno existe: la función real es `fn_puede_operar_ubicacion`, el server action real es `app/actions/ubicacion.ts`, el archivo real es `lib/persona-actual.ts`. No ejecuta código roto, pero desorienta activamente. (`apps/web/proxy.ts:5-6,15-20`)

**`quitar_colaborador` borra físicamente en vez de archivar (viola el principio 2 del propio CLAUDE.md)** — ejecuta `delete from colaboradores where persona_id = p_persona_id` — borrado físico de quién tuvo acceso a retail, con qué rol y desde cuándo. El CLAUDE.md raíz exige explícitamente "nunca borres datos... nunca DELETE en catálogos con historial". Ya reconocido como pendiente en BACKLOG, pero no corregido en el código actual. (`supabase/migrations/0016_roles_colaborador.sql:167-180`)

### Infraestructura y meta-estado del proyecto

**ADR-0004 y ADR-0006 documentan bugs de código que el corte V1→V2 ya volvió obsoletos, sin que el BACKLOG lo aclare** — describen fallas de componentes que el commit de corte borró del árbol (`RecibirLoteForm.tsx` viejo, Finanzas/`PatrimonioEditor.tsx` ya no existen). El propio prompt de esta auditoría los cita como ejemplo de drift vigente — verificado en código, ya no aplican tal como están escritos.

**`FinanzasNav.tsx` es código muerto huérfano tras el borrado de Finanzas** — sigue en el árbol con un link a `/finanzas/patrimonio`, pero ninguna ruta lo importa (confirmado por grep sobre todo `origin/main`). Deuda directa de limpieza (principio 7 de CLAUDE.md).

**`docs/datos/13-PROMESAS-INCUMPLIDAS.md` cita una pantalla (`RegistrarGastoModal`) que ya no existe en el código** — el ítem P-01 describe una pantalla mandando `p_metodo_pago` a una `registrar_gasto` de 6 parámetros. Verificado: ni el modal ni la función existen hoy — el propio archivo se escribió el mismo día del corte que ya había borrado esa pantalla.

**Contradicción real sobre `gen-types`, no solo documental: el `types.ts` committeado hoy le falta lo que el propio BACKLOG advirtió que le faltaría** — BACKLOG del 09-14 advierte que generar tipos con `--local` borraría 6 objetos que solo existen en producción, incluido `puede_operar_sede`. BACKLOG del 09-15 declara el cambio "sin riesgo de drift". Verificado: `packages/database/package.json` usa `--local --schema retail`, y `types.ts` no contiene `catalogo_con_stock`, `sede_meta` ni `puede_operar_sede` — exactamente la pérdida predicha. Impacto bajo hoy (ninguna pantalla las llama por `.rpc()`), pero la afirmación de "sin riesgo" no es correcta tal como está escrita.

**El comentario de cabecera de `ci.yml` quedó con un número de pruebas desactualizado** — dice "las 79 pruebas pasan" (comentario de 2026-09-09); hoy hay 25 archivos `*.test.ts` (subieron de 7 el 2026-09-10) y el BACKLOG del 16-sep reporta 282 pruebas.

---

## Mejoras

### Vender / Caja / Post-venta

**Los mensajes de error de stock insuficiente en el cobro ya identifican la prenda por nombre y código, con cuántas quedan** — `cobrar()` en `PuntoDeVenta.tsx` reescribe el error crudo de Postgres con la referencia/código de la prenda y el stock real restante. Compras e Inventario todavía no replican este patrón — el costo de no hacerlo es que ahí la colaboradora sigue viendo el mensaje genérico. (`apps/web/components/PuntoDeVenta.tsx:689-704`)

**El cierre de caja no avisa si hay ventas offline encoladas sin subir todavía** — el banner de la cola offline es visible en Vender, pero `CerrarCajaModalV2` (en `/caja`) no cruza esa información. Alguien puede cerrar caja mientras hay una venta en efectivo esperando subir, y el sobrante no se explica solo. (`apps/web/lib/ventas-offline.ts:155`)

### Facturación / SUNAT

**`lib/lucode.ts`: solo se prueba la lectura de anulación, no la de emisión ni el payload real a SUNAT** — `traducirEstado` y `payloadDe` (incluye `nota_credito_codigo_tipo` reusado para nota_debito, marcado "no confirmado campo por campo") no tienen ni un test, pese a ser funciones puras sin red. (`apps/web/lib/lucode.test.ts`, 37 líneas)

**Sin indicador de "reservado hace mucho y nunca transmitido"** — el tile "Pendientes de enviar" cuenta cuántos hay, pero no distingue uno reservado hace 10 minutos de uno reservado hace 3 días — el tipo exacto de caso que costó una auditoría manual con SQL. El dato (`created_at`) ya viaja en cada fila.

### Productos / Catálogo / Taxonomía

**Colores pendientes de aprobar se pierden entre los aprobados** — en `ColoresLista.tsx`, un color "pendiente" se mezcla en la misma grilla, distinguido solo por un badge pequeño. Con 16 colaboradoras proponiendo colores en paralelo durante el censo, un Líder tiene que escanear 30+ tarjetas para encontrar las 2-3 pendientes.

**No se puede reasignar el padre de una categoría existente** — `categoria_padre_id` solo se fija al crear; ni el modal de edición ni el endpoint PUT permiten promover/degradar una categoría, aunque el trigger de la base ya lo validaría correctamente. Reconocido en BACKLOG como decisión de alcance, no bug.

**`scripts/taxonomia/cargar.mjs` es código muerto sin advertencia** — genera SQL para tablas `taxonomia_*` que ya no existen; nadie que lo encuentre sabría, sin investigar, que fallaría al aplicarse.

### Inventario / Movimientos / Stock

**Existencias no pagina — carga todo el stock de la sede de una vez** — `getStockPorUbicacion`/`getExistencias` traen todas las filas en una sola consulta con joins anidados. Hoy ~100 filas funciona bien; con el parámetro de escala a 3 años (1000+ SKUs) podría acercarse a varios miles por carga.

**Existencias no distingue "Taller por diseño" de "sede con el bug de sububicación"** — cuando toda la fila de stock de una sede tiene `sububicacion_id` NULL, la pantalla se degrada en silencio al modo sin piso/almacén, igual que Taller — sin ningún aviso de que algo no cuadra para una tienda que sí debería separarlos.

### Compras

**Un adjunto que sube al bucket pero falla al registrarse queda huérfano para siempre** — el propio comentario de `adjuntos-compra.ts` admite que un objeto sin fila en `compra_adjuntos` es "basura invisible": sin reintento automático ni forma de listar/limpiar huérfanos. (`apps/web/lib/adjuntos-compra.ts:72-88`)

**La curva de tallas es la pieza visual más compleja del módulo y no tiene ninguna red de seguridad automatizada** — 615 líneas en `RecepcionCompraFormV2.tsx`, con la lógica de reparto completamente a mano, sin un solo test.

### Producción / Taller

**El selector de modelo en "Nueva orden" no escala al catálogo real** — `getModelosProducibles()` trae TODOS los productos con variantes activas, sin filtro ni límite; `NuevaOrdenProduccionForm` los vuelca en un `<select>` nativo sin buscador. Con 1000+ SKUs a 3 años, la lista se vuelve larga sin poder escribir para filtrar.

**Cero pruebas automatizadas sobre las 5 RPC de Producción** — toda la verificación de abrir/set_etapa/cerrar/anular/revertir fue manual, una sola vez, por PostgREST. No hay pgTAP ni `*.test.sql` en el repo.

### Identidad / Roles / Permisos / Seguridad

**El comentario de `persona-actual.ts` describe "control total temporal" como si siguiera vigente** — dice "el día que 'control total temporal' se revierta, esto puede volver a distinguirse" — pero ya se revirtió el 2026-09-14. No es un bug funcional, pero cuenta una historia vieja. (`apps/web/lib/persona-actual.ts:19-24`)

**`retail.colaboradores` expone el organigrama completo de accesos a cualquiera con acceso a retail** — la policy `colaboradores_select` da SELECT de la tabla entera a cualquiera con `fn_tiene_acceso_retail()`, no solo a líderes — decisión deliberada y documentada. Riesgo bajo hoy, pero si CAYLA algún día quiere ocultar quién tiene acceso a Facturación, hoy no se puede sin tocar RLS.

### Infraestructura y meta-estado del proyecto

**`migraciones:verificar` no cruza qué nombres llama cada cuerpo de función** — confirma que un objeto EXISTE por nombre, pero no que la versión viva sea la correcta ni que las funciones que se llaman entre sí compartan el mismo nombre en ambos entornos — el caso de `fn_puede_operar_sede`/`puede_operar_sede` puede repetirse con cualquier otro par de gemelas.

**60 worktrees activos es una carga operativa que ya costó re-trabajo real** — al menos 2 episodios documentados de sesiones paralelas resolviendo el mismo problema sin saberlo. Cada worktree nuevo que arranca sin revisar el estado de los demás repite trabajo o pisa una migración con el mismo timestamp.

**`docs/BACKLOG.md` (2883 líneas) rompe su propia regla de tamaño** — el encabezado dice "máx. 3 ítems por cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando", pero el archivo mismo lleva un aviso de 2026-09-14 admitiendo que "este documento no se ha reescrito para reflejar V2 todavía". Cada sesión nueva paga el precio de leer ~2900 líneas para separar lo vigente de lo obsoleto.

---

## Sugerencias

### Vender / Caja / Post-venta

**Persistir el código de descuento usado por venta para poder reportarlo** — agregar `codigo_descuento`/`codigo_descuento_id` a `venta_items`, escrita por `registrar_venta` cuando el descuento viene con código. Con la pantalla de administración ya construida, es el único dato que falta para ver cuánto margen regaló cada código.

**Agregar al backlog un reporte de "prendas dañadas por sede/mes" usando datos que ya existen** — `devolucion_items.condicion` y `venta_anulacion_items.condicion` ya distinguen vendible/dañada-reparación/dañada-donar/devolver a proveedor, pero solo viven fila por fila.

**Aviso blando de "caja abierta hace más de N horas" mientras no exista día de negocio** — un aviso simple en `/caja` cuando `abierta_en` supera, por ejemplo, 14 horas, mitigaría el riesgo de una caja que se arrastra días. V1 sí tenía este aviso y V2 lo perdió en el corte.

### Facturación / SUNAT

**Botón "Descargar CSV del mes" en Comprobantes, reusando el helper que ya existe** — `apps/web/lib/exportar-csv.ts` ya es un helper sin dependencias nuevas, usado hoy solo por `AjustarInventarioModal.tsx`.

**Link "Ver PDF" en la fila de un comprobante aceptado** — ligado a la corrección sobre el PDF/CDR descartado: persistir `respuesta_sunat` y agregar un link discreto junto al chip "Aceptado".

**"Facturado por sede" además del total único del mes** — cada tienda ya tiene su propia serie y cada fila ya trae `ubicacion_id`; agrupar por sede daría una comparación entre tiendas sin exportar nada.

### Productos / Catálogo / Taxonomía

**Autocompletar temporada desde valores ya usados** — `productos.temporada` es texto libre sin vocabulario cerrado; antes de que el catálogo real (300-900 SKUs) lo llene, van a convivir "Verano 26"/"verano 26"/"Verano 2026" — mismo problema que colores tenía antes de ADR-0024. Un `distinct temporada` para autocompletar evitaría el problema sin el costo de un vocabulario cerrado nuevo.

**Agregar un color nuevo sin salir del formulario de producto** — como desde ADR-0070 cualquiera con sesión puede proponer un color, sería barato exponer el mismo POST como acción rápida dentro del ComboBuscable de color.

**Punto de reorden por sede, no solo por producto en la red** — `stockMinimo` es un único número que suma todas las sedes; `fn_productos` ya calcula demanda/lead time/punto de reorden a nivel de red. Con Taller + 3 tiendas de demanda distinta, una sede puntual puede estar en cero mientras la red total luce sana.

### Inventario / Movimientos / Stock

**Mostrar "días sin contar" también en Existencias o en la ficha de producto** — `fn_prioridad_conteo` ya calcula `dias_sin_contar` por variante; hoy encerrado solo en la pantalla de Conteo.

**Revisar si un conteo abierto por sububicación (no solo por ubicación) tendría sentido a futuro** — el índice `conteos_un_abierto_por_ubicacion` impide dos conteos abiertos simultáneos en la misma sede, aunque sean de sububicaciones distintas.

### Compras

**Sugerir el modo de línea (detallada/agrupada) según el historial del proveedor** — "cada proveedor factura distinto" es una regla de negocio reconocida (ADR-0035); se podría recordar el patrón más frecuente de cada proveedor y preseleccionar el modo de línea.

**Persistir el reparto de la curva de tallas mientras se arma la guía** — si una colaboradora está tipeando la curva de una factura de 48 unidades y se recarga la página, todo el reparto se pierde porque el estado vive solo en React. Guardar en sessionStorage mientras la guía está sin enviar.

### Producción / Taller

**Vínculo opcional entre una recepción de mercadería y una orden de producción en curso** — un campo opcional "orden de producción relacionada" (select filtrado a producciones `en_proceso` del Taller) daría trazabilidad sin resolver el problema más grande de insumos.

**Mostrar el tiempo de corte a stock en la tarjeta de orden terminada** — `OrdenProduccion` ya trae `creadoEn` e `inventariadoEn`; restarlos daría "X días de corte a stock" por corrida, gratis de calcular.

### Identidad / Roles / Permisos / Seguridad

**Reemplazar el DELETE de `quitar_colaborador` por una columna `revocado_en`** — filtrar por "is null" en `fn_es_lider`/`fn_tiene_acceso_retail`. Resuelve de raíz el hallazgo de "borra en vez de archiva" y regala, gratis, el historial de accesos que hoy no existe — mismo patrón que ya usa el resto del esquema.

### Infraestructura y meta-estado del proyecto

**Correr `migraciones:verificar` contra el Postgres local dentro del propio CI** — un paso de CI que levante `npx supabase start` y corra el verificador convertiría un chequeo manual en un gate automático.

**Un script de "salud de worktrees" que Felipe corra antes de abrir uno nuevo** — un one-liner que liste en segundos cuáles de los 60 worktrees están a más de 100 commits de atraso y con 0 commits propios.

**Extender el patrón ADR-0066 primero a `registrar_venta` y `cerrar_caja`** — de las RPC sin cobertura, estas dos tocan plata real en cada turno de caja de las 3 tiendas; empezar ahí reduce primero el riesgo de plata mal cuadrada.

---

## Preguntas sin resolver — necesitan a Felipe

### Vender / Caja / Post-venta

**¿Se extiende a `ventas`/`venta_items`/`devoluciones`/`devolucion_items` el mismo candado de "solo RPC" que ya se aplicó a `movimientos` (P-05/ADR-0055)?** Opción A — revocar INSERT/UPDATE/DELETE de tabla a `authenticated` en las 4 tablas, verificando función por función quién escribe ahí antes de revocar. Ganas: cierra el hueco de integridad más serio de esta auditoría. Pagas: repetir el trabajo de ADR-0055 cuatro veces, con riesgo de romper alguna RPC no identificada. Opción B — dejarlo para cuando se active FORCE ROW LEVEL SECURITY en general (ya descartado dos veces, ADR-0042/0055). Ganas: cero trabajo hoy. Pagas: el hueco queda abierto sin fecha, explotable por cualquier colaboradora con la consola abierta.

**¿Qué backfill aplicar a `stock.sububicacion_id` en el Postgres local compartido?** Opción A — asignar todo a "Piso de venta" por defecto (rápido, puede no reflejar la distribución real). Opción B — reconstruir a mano la distribución real piso/almacén de cada sede (más lento, cuadra mejor con el conteo físico). *(Nota: ver Inventario/Movimientos/Stock — este backfill ya ocurrió para Lima y Trujillo entre el 16 y el 17 de septiembre; solo Taller queda pendiente, y ahí es intencional.)*

### Facturación / SUNAT

**¿El alta como PSE tercero ante SUNAT SOL ya se completó?** Opción A — ya se hizo: falta que Felipe lo confirme con fecha. Opción B — sigue pendiente: cualquier comprobante "aceptado"+"producción" transmitido hasta ahora podría necesitar revisión legal antes de darlo por válido ante SUNAT.

**¿Qué debe significar "Monto facturado"?** Opción A — solo `aceptado` + `entorno_transmision='produccion'`: la cifra cae de golpe frente a lo que Felipe ve hoy. Opción B — `aceptado` sin importar ambiente, excluyendo solo rechazado/anulado/pendiente: sigue mezclando pruebas de sandbox si alguien deja el sistema mal configurado.

**Correlativo reservado y nunca transmitido: ¿se puede anular sin avisarle a SUNAT?** Nunca salió hacia Lucode, así que no hay nada que dar de baja allá — sería un camino nuevo, más simple que ADR-0016. Opción A — construirlo: dos significados de "anular" conviviendo en la misma pantalla. Opción B — dejarlo "pendiente" indefinidamente y solo advertir: la serie sigue perdiendo números sin límite.

### Productos / Catálogo / Taxonomía

**¿Queda algún color de producción fuera del vocabulario cerrado?** El backlog viejo señalaba "Arena" y "azul" escritos a mano; el script de ADR-0069/BACKLOG-Loro dice haber resuelto Arena→ARN en producción el 16-sep. Pregunta cerrada para Felipe: confirmar con una consulta directa hoy, o darlo por cerrado.

**¿Qué hacer con el mecanismo de taxonomía universal (ADR-0030), muerto desde el corte V2?** Opción A — darlo por descartado y borrar los dos archivos huérfanos. Opción B — reconstruirlo sobre V2 cuando llegue el importador de catálogos con IA (ADR-0073). Cuesta lo mismo decidirlo hoy que dentro de 3 meses cuando alguien lo re-proponga sin saber que ya se construyó una vez y se perdió.

**¿Cuál de las dos funciones de alta de producto debe sobrevivir?** `crear_producto_con_variantes` (alcanzable, sin fotos/temporada) y `catalogo_crear_producto` (inalcanzable, con fotos/temporada/venta-sin-stock) resuelven lo mismo con dos candados distintos. Unificarlas evita mantener dos caminos de escritura para la misma operación.

### Inventario / Movimientos / Stock

**¿"Pedir traslado" sigue siendo un mensaje de WhatsApp, o se construye como acción del sistema?** El semáforo ya dice "pide traslado" y dónde hay stock, pero el pedido real se hace por WhatsApp. Opción (a) dejarlo así — costo cero, pero el sistema nunca sabe que alguien pidió. Opción (b) construir la solicitud — tabla nueva + flujo de aprobación, con trazabilidad completa. **Solo en BACKLOG.**

**¿Conviene un backfill/trigger automático de `sububicacion_id` para que este bug deje de repetirse?** El mismo síntoma ya mordió al proyecto al menos dos veces documentadas, siempre por reseeds del Postgres compartido. Opción (a) seguir dependiendo de que cada script de seed lo haga bien a mano. Opción (b) un trigger BEFORE INSERT que resuelva automáticamente si la ubicación tiene piso_venta configurado.

### Compras

**¿Una integrante de sede debe poder recibir mercadería en su propia sede sin que el líder esté presente?** El candado de negocio en la RPC SÍ deja recibir a una integrante en su sede, pero el layout de `/compras` (16-sep) redirige a cualquier no-líder, incluida Recibir. Opción A — dejarlo como está: menos gente toca el conteo físico, pero si el líder no está cuando llega el camión, la mercadería queda sin registrar hasta que el líder entre. Opción B — abrir solo Recibir a integrantes en su propia sede: se recibe en el momento, pero exige un permiso más granular que "líder/no líder".

**¿Se prioriza una RPC de reverso de pago (`anular_pago_compra`) antes de que ocurra en producción real?** Opción A (recomendada, append-only) — mantiene el registro auditable de que hubo un error y su corrección; una línea más de trabajo antes de que aparezca el primer caso real. Opción B (no hacer nada) — cero esfuerzo hoy; cuando ocurra el primer pago mal tipeado, esa factura queda bloqueada sin camino documentado.

### Producción / Taller

**¿`ordenes_produccion`/`bom_items` (V1) se pueden dropear ya de producción, o hay razón para conservarlas?** Verificado que ningún componente ni RPC vigente las lee. Opción A — dropearlas: menos superficie de esquema, pero se pierde el historial crudo de producción anterior a V2 si nunca se migró. Opción B — dejarlas como archivo histórico documentado: no se pierde nada, pero la pregunta se repite en cada auditoría futura.

**¿El Taller necesita una entrada de mercadería propia, separada de abrir una corrida?** Opción A — mantener solo Compras → Recibir: una sola pantalla de entrada, pero el Taller que compra tela/avíos directo no tiene dónde registrarlo. Opción B — agregar entrada manual propia del Taller: cierra el hueco, pero tensiona la integridad conceptual del módulo de Inventario.

**¿Vale la pena construir el atajo "Nuevo modelo" desde la orden ahora, sabiendo que depende de Productos V2?** Hoy Productos V2 no crea variantes desde pantalla; el atajo solo orientaría con un link a `/productos`, donde se pierde todo lo tecleado en la orden a medio armar.

### Identidad / Roles / Permisos / Seguridad

**¿Debe un Colaborador poder ver el total esperado de ventas antes de cerrar caja?** Opción A — dejarlo así: cero trabajo, pero el conteo ciego es cosmético. Opción B — restringir `ventas_select` para que el agregado nunca sea legible por quien no es líder, calculándolo solo del lado servidor: el candado es real, pero hay que auditar qué otras pantallas dependen de leer `ventas` con el total visible.

**¿Se archiva o se sigue borrando el acceso a retail al quitar un colaborador?** Opción A — mantener el DELETE actual: cero rastro de quién tuvo acceso a Facturación/SUNAT y cuándo se le quitó. Opción B (recomendada) — agregar `revocado_en` y filtrar por "is null": historial completo, consistente con el principio 4 del propio CLAUDE.md y con el patrón que ya usa el resto del esquema. Si no hay respuesta, se ejecuta B.

### Infraestructura y meta-estado del proyecto

**¿Renombrar `puede_operar_sede` en producción, o reforzar el verificador?** Opción A — renombrar `retail.puede_operar_sede` a `fn_puede_operar_sede` en producción con alias temporal: elimina la trampa de raíz, pero es DDL en el proyecto compartido con Dynamic, requiere ventana de Felipe. Opción B — dejar los nombres y enseñarle a `migraciones:verificar` a cruzar qué nombres llama cada cuerpo: cero riesgo en producción, pero el problema de fondo sigue vivo para el próximo par de funciones gemelas.

**¿`gen-types` se queda en `--local` o vuelve a apuntar a producción?** `--local`: rápido, pero ciego a objetos que solo existen en producción por drift acumulado (verificado: `catalogo_con_stock`, `sede_meta`, `puede_operar_sede` ausentes hoy). `--project-id` de producción: fiel a lo real, pero reintroduce el riesgo de que un `db reset` local deje tipos que no calzan.

**¿Se autoriza borrar los worktrees fantasma, o alguno sigue vivo por una razón fuera del historial?** 16 worktrees comparten el commit pre-corte `74d6888` con solo 2-3 commits propios nunca publicados; 5 más entre 270 y 538 commits atrás. Opción A — borrarlos todos: 21 carpetas menos que auditar, cero riesgo de razonar sobre código ya borrado, pero solo Felipe sabe si alguno tiene cambios sin commitear en disco. Opción B — dejarlos: cero riesgo de perder algo, pero el mismo susto de hoy se repite con 20 candidatos más.

---

## Innovaciones

### Vender / Caja / Post-venta

**Conectar la "condición" de post-venta con control de calidad del Taller** — `devolucion_items` y `venta_anulacion_items` ya capturan si una prenda vuelve vendible, dañada-reparación, dañada-donar o para devolver al proveedor — un dato que un ERP retail genérico no tendría naturalmente enlazado a manufactura. Convertirlo en alerta o resumen para el Taller es diferenciación real y el dato ya existe estructurado.

**El código de etiqueta escaneable como base de trazabilidad pieza a pieza** — `variantes.codigo` (autogenerado, escaneable) ya es la identidad real que usan Vender, Cambios, Devoluciones y Anulación. Es la base natural para, el día que CAYLA quiera numerar piezas individuales, pasar de codificar la variante a codificar la prenda física, sin rediseñar los flujos de post-venta.

### Facturación / SUNAT

**Extender el mismo adaptador Lucode a Guía de Remisión Electrónica** — Lucode es una plataforma PSE general de SUNAT; CAYLA ya modela traslados en dos fases en el esquema y ya tiene el patrón de adaptador aislado probado y funcionando — cerrar el hueco legal de remisión reusando la misma relación comercial costaría una fracción de evaluar un proveedor nuevo.

**Serie por tienda como eje de un "cuadre fiscal por sede" mensual** — cada tienda ya tiene su propia serie SUNAT; usarlo también como eje de reporte le daría a Felipe una comparación real entre puntos de venta sin construir un módulo de BI, solo agrupando un dato que ya existe.

### Productos / Catálogo / Taxonomía

**Ligar el color del vocabulario a su proveedor/lote de tela** — usar el campo `notas` (hoy texto libre) para enlazar cada color con el proveedor/lote que lo originó, de modo que cuando el Taller necesite reponer tela para un color agotado, la compra salga directo desde la ficha del color.

**Ficha compartible por WhatsApp usando piezas que ya existen pero nunca conviven** — el código corto de variante, la galería de fotos y `resumenRed()` (Inventario) hoy están repartidos en Productos e Inventario; juntarlas en una "ficha técnica" lista para compartir es barato de construir con lo que ya está hecho.

### Inventario / Movimientos / Stock

**Reusar el motor de traslado en dos fases para seguir la producción del Taller por etapas** — el modelo ya construido para trasladar entre sedes (envío → tránsito → confirmación con diferencias) es exactamente el motor que le falta a Producción: hoy una orden entra a stock de un solo golpe, sin pasar por corte→costura→acabado. Extender el mismo mecanismo le daría a CAYLA trazabilidad real de producción textil sin inventar un segundo motor.

### Compras

**Reusar el componente de curva de tallas (color×talla) entre Compras y Producción** — `RecepcionCompraFormV2` ya construye una tabla color×talla para repartir unidades; BITÁCORA menciona que Producción también tiene "matriz color × talla". Si son dos implementaciones separadas del mismo patrón visual, es exactamente el caso que el principio de integridad conceptual pide evitar. Extraer un componente compartido beneficiaría a ambos módulos.

### Producción / Taller

**Margen real por corrida, cruzado contra ventas reales por SKU** — CAYLA es de las pocas retailers de indumentaria peruanas con manufactura propia: el costo REAL de una prenda se calcula por corrida y se pega a `variantes.costo`, pero hoy solo se usa para el semáforo de la propia orden. Cruzarlo contra ventas reales daría un reporte de "margen real vendido" que una tienda sin producción propia no podría construir.

**Vista agregada de qué líneas de producción "pierden" sistemáticamente** — el semáforo hoy vive solo en la tarjeta de cada orden individual; agregarlo por categoría o temporada expondría qué modelos el Taller produce sistemáticamente con margen bajo.

### Identidad / Roles / Permisos / Seguridad

**Un tercer rol "Operario de Taller", acotado a producción, no a venta** — CAYLA es retail + manufactura, y `ubicaciones.tipo = 'taller'` ya distingue el Taller de una tienda. Hoy solo existen Líder/Colaborador y todo Colaborador entra con el mismo paquete de permisos sin importar dónde trabaje. Un operario de producción probablemente no debería poder abrir caja ni vender, pero sí registrar etapas de producción. Ningún ERP retail genérico modela esta distinción porque ninguno tiene manufactura textil integrada.

### Infraestructura y meta-estado del proyecto

**Documentar el patrón ADR-0066 como "el estándar de pruebas de CAYLA", no como un ADR aislado** — para un equipo de una persona con ~27 worktrees compartiendo un solo Postgres local, probar con `psql` + ROLLBACK es la escala correcta. Vale la pena moverlo a un archivo tipo `docs/datos/COMO-SE-PRUEBA.md` referenciado desde el README.

**Convertir `datos:comparar` en un botón dentro del propio ERP, no solo un comando de terminal** — el detector de drift ya hace exactamente lo que un ERP de este tamaño necesita; un botón Líder-only que dispare el script server-side evitaría depender de que Felipe se acuerde de correrlo en la terminal.

---

## A profundizar

### Vender / Caja / Post-venta

**No ejecuté yo mismo los scripts de prueba de Caja/Cambios/Devoluciones** — solo leí el código y confié en que BITÁCORA reporta sus últimas corridas en verde (12/12, 2/2, 15/15). No tuve Postgres local disponible en esta auditoría de solo lectura, especialmente después de los cambios más recientes (`venta_precio_cambiado_sku_nulo`, `anular_venta`) que no estaban probados por estos scripts.

**No confirmé contra producción viva si el hueco de RLS en ventas/devoluciones sigue exactamente así** — se basa en leer `origin/main` y en que ningún REVOKE posterior aparece en el repo. No descarté que alguien haya aplicado un REVOKE directo en el SQL Editor de producción sin dejar migración correspondiente.

**`lib/registro-contable.ts` podría ser código muerto o podría ser la base de un rebuild de Finanzas en curso fuera de `origin/main`** — no encontré ningún import real desde ninguna página en `origin/main`, pero el historial de git de este worktree (fuera de `origin/main`) muestra un commit reciente "feat(finanzas): Fase 2 — Egresos", lo que sugiere que Finanzas se está reconstruyendo activamente en una rama que todavía no llega a main. No se pudo resolver la contradicción sin salirse del alcance de leer solo `origin/main` (relacionado con el hecho de Infraestructura sobre el rescate de solo `activos_fijos` en el corte V2).

**No revisé línea por línea varios componentes de Cambios/Devoluciones/Caja** — `CambioFormV2.tsx`, `DevolucionFormV2.tsx`, `CambiosLista.tsx`, `DevolucionesLista.tsx`, `CerrarCajaModalV2.tsx`, `AbrirCajaFormV2.tsx`, `CajaAbiertaPanel.tsx`, `MovimientoCajaModal.tsx` — me apoyé en lo que BACKLOG/BITÁCORA documentan sobre ellos.

### Facturación / SUNAT

**`fn_ventas_del_dia` no blinda contra una venta con más de un comprobante** — el `left join comprobantes` no tiene `order by ... limit 1`, a diferencia de `fn_movimientos`, que sí lo hace explícitamente para la misma relación con un comentario propio. No encontré cómo una venta terminaría hoy con dos comprobantes, pero no pude descartarlo con una consulta real a producción.

**No verifiqué en vivo si hay comprobantes reales atascados en "enviado" hoy** — las entradas de BITACORA que registran transmisiones reales muestran a Lucode devolviendo ACEPTADO casi de inmediato; no encontré ningún caso documentado de un comprobante quedándose en "enviado". Sin acceso de lectura a producción para confirmar si el problema ya ocurrió o sigue siendo teórico.

### Productos / Catálogo / Taxonomía

**"Tucán" como codename no identificado en el código actual** — el BACKLOG menciona "Tucán (taxonomía)" como el mismo mecanismo de proponer/aprobar pendiente de construir, pero no encontré código, rama ni ADR propio bajo ese nombre.

**No revisé línea por línea `ProductosAgrupados.tsx` ni `FiltrosProductos.tsx`** — confirmé su existencia y rol, pero no verifiqué si el agrupamiento maneja bien una matriz grande de variantes (50+) ni si la paginación dentro de una fila expandida podría degradar el rendimiento con datos reales del censo.

**Vocabulario cerrado para tejidos/patrones/etiquetas: no encontré rastro en V2** — confirmé que colores sí lo tiene (ADR-0070) y que tallas deliberadamente NO (ADR-0024); no encontré mención de "tejidos", "patrones" ni "etiquetas" como vocabularios cerrados independientes en ningún ADR o migración de V1 o V2, pero no tuve tiempo de rastrear la rama V1 completa para descartarlo con certeza.

### Inventario / Movimientos / Stock

**Estado real de las 4 migraciones pendientes en PRODUCCIÓN** — no se pudo consultar producción (la auditoría lo prohíbe explícitamente). Es el punto más urgente: si el código de Traslados/Conteo llegó a producción vía Vercel antes que el SQL, esas 2 pestañas están rotas ahora mismo.

**El estado de `sububicacion_id` que verifiqué es del Postgres local compartido, no de producción** — confirmado hoy (2026-09-17) por SQL directo; ese estado puede cambiar en cualquier momento por otra sesión (reset/reseed) y no dice nada sobre el proyecto Supabase de producción.

**Componentes de UI no revisados en profundidad** — `ConteoPanel.tsx`, `TrasladoDetallePanel.tsx`, `TrasladosLista.tsx`, `MovimientosLista.tsx`, `FiltrosMovimientos.tsx`, `ConteosLista.tsx`, `ReponerPisoModal.tsx` no se leyeron línea por línea.

**`mover_interno` (reposición piso↔almacén dentro de la misma sede) no se revisó** — se menciona en BACKLOG/ADR como la RPC de reposición interna, pero no se leyó su código SQL ni se confirmó dónde vive exactamente su UI.

### Compras

**No re-ejecuté tsc/eslint/vitest sobre el módulo** — la tarea pide auditoría de solo lectura y el checkout local del worktree puede estar desincronizado de `origin/main`; correr build/lint contra el disco no habría probado el código que sí se leyó con `git show`.

**No leí completos `CompraDetalle.tsx` ni `LineasPago.tsx`** — este último es el componente compartido entre 3 pantallas de dinero; vale la pena una lectura línea por línea dado que un bug ahí afectaría los tres flujos de pago a la vez.

**No confirmé si la política de INSERT del bucket `retail-compras-adjuntos` (abierta a cualquier autenticado) representa un vector de abuso real** — el comentario de la migración ya reconoce el diseño; no evalué cuánto costaría en la práctica que alguien llenara el bucket de basura.

### Producción / Taller

**No verifiqué contra la base de producción real, por instrucción explícita de esta auditoría** — todo lo reportado sobre "qué está aplicado en producción" es reconstrucción a partir de BACKLOG/BITÁCORA/ADR cruzados entre sí.

**No verifiqué la atomicidad real de `cerrar_produccion` ante una falla a mitad del loop de líneas** — por inspección de código debería revertir la transacción completa si falla a mitad de camino, pero no se comprobó con una prueba real forzando un error.

**No confirmé si el diccionario de datos de Producción ya se regeneró** — no se revisó `docs/datos/generado/` para confirmar si ya incluye `producciones`/`produccion_lineas`.

**No comparé el `seed.sql` local contra los supuestos de la migración de Producción** — no se leyó ese archivo completo para confirmar que la data de prueba local no arrastra algún estado previo contradictorio.

### Identidad / Roles / Permisos / Seguridad

**No pude confirmar contra la base de producción real que el código vivo es byte-por-byte `0016_roles_colaborador.sql`** — todo lo dicho sobre "producción hoy" se apoya en lo que BITÁCORA documenta como aplicado, más la inferencia de que las migraciones se pegan en orden secuencial. El propio repo documenta que esto ya falló antes (dos firmas vivas de `recibir_lote` a la vez).

**No hice un barrido de RLS tabla por tabla sobre todo el schema `retail`** — con 28+ tablas y un antecedente real de una tabla que aceptaba INSERT directo sin RPC hasta el 2026-09-15, valdría un `select tablename, rowsecurity from pg_tables where schemaname='retail'` sistemático.

**No pude confirmar si el hueco de `retail.personas` se cerró a propósito como fix de seguridad o "de rebote"** — ninguna BITÁCORA ni ADR menciona explícitamente "cerramos el hueco de la auditoría de 26 agentes"; la eliminación fue por una razón de arquitectura, no como respuesta directa a esa auditoría puntual. Nadie parece haber vuelto a verificar el caso específico que esa auditoría describía.

### Infraestructura y meta-estado del proyecto

**No verifiqué si las migraciones marcadas "aplicar en producción" de los últimos 2 días ya se aplicaron** — el BACKLOG se corrige a sí mismo el mismo día que se escribe; cualquier lista armada hoy leyendo solo el archivo puede estar parcialmente resuelta ya.

**El número exacto de pruebas (282) no lo verifiqué ejecutando nada** — por las restricciones de esta auditoría (solo lectura, worktree 526 commits atrasado), no corrí `pnpm test`. Confirmé de forma independiente el número de archivos (25), pero el conteo de 282 pruebas individuales viene solo del BACKLOG.

**No entrevisté el propósito de cada uno de los 60 worktrees** — reporto el patrón agregado a partir de metadata de git, pero no hay forma de saber desde código si alguno tiene cambios sin commitear en disco que Felipe todavía necesita.

**No leí a fondo `scripts/pruebas/aprobar_devolucion_caja.mjs`** — confirmé que existe junto a `registrar_cambio.mjs`, pero no verifiqué cuántos escenarios cubre ni si comparte los mismos supuestos frágiles sobre sububicaciones de piso/almacén.

---

## Anexo — estado por módulo

| Módulo | # hechos | # pendientes | # correcciones | # mejoras | # sugerencias | # preguntas | # innovaciones | # a profundizar |
|---|---|---|---|---|---|---|---|---|
| Vender / Caja / Post-venta | 7 | 7 | 4 | 2 | 3 | 2 | 2 | 4 |
| Facturación / SUNAT | 8 | 4 | 4 | 2 | 3 | 3 | 2 | 2 |
| Productos / Catálogo / Taxonomía | 8 | 6 | 5 | 3 | 3 | 3 | 2 | 3 |
| Inventario / Movimientos / Stock | 7 | 4 | 3 | 2 | 2 | 2 | 1 | 4 |
| Compras | 6 | 5 | 2 | 2 | 2 | 2 | 1 | 3 |
| Producción / Taller | 5 | 6 | 5 | 2 | 2 | 3 | 2 | 4 |
| Identidad / Roles / Permisos / Seguridad | 7 | 4 | 4 | 2 | 1 | 2 | 1 | 3 |
| Infraestructura y meta-estado | 7 | 6 | 5 | 3 | 3 | 3 | 2 | 4 |
| **Total** | **55** | **42** | **32** | **18** | **19** | **20** | **13** | **27** |

---

**Nota sobre deduplicación:** ningún hallazgo se omitió por completo. Donde el mismo tema real aparece en más de un módulo con matices distintos (el estado de `stock.sububicacion_id`, mencionado con menos detalle temporal desde Vender pero verificado con SQL directo desde Inventario el mismo día de la auditoría; el cierre de "control total temporal", documentado en profundidad desde Identidad y citado como evidencia de apoyo desde Facturación; la verificación pendiente de RLS de Colores, reportada tanto desde Productos como desde Identidad; y las migraciones de Inventario pendientes de producción, detalladas en Inventario y mencionadas como ejemplo desde Infraestructura) se dejó el desarrollo completo en el módulo con la evidencia más directa y se cruzó desde el otro con una referencia entre paréntesis, en vez de repetir el detalle completo dos veces.
