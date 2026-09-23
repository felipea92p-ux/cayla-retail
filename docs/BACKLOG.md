# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**⚠️ AVISO 2026-09-14 — gran parte de lo de abajo describe V1, reemplazada por V2 el
2026-09-12 (`0af2f1b`, ver `docs/adr/0035-vocabulario-cerrado-portado-no-fusionado.md`
y BITÁCORA de esa fecha).** Facturación electrónica (Lucode/SUNAT), Finanzas (EERR/
Balance/Efectivo/Patrimonio) y Producción del Taller, tal como se detallan más abajo,
**ya no existen en el código** — V2 las borró a propósito (no tenían pantalla V2 propia
y su data en `retail` era de prueba, no operación real). **Producción volvió el 2026-09-15
sobre V2 (ADR-0051)** — lo que diga de ella más abajo describe la versión V1, no la actual.
**Corrección 2026-09-16 (auditoría de Facturación): la frase de arriba está mal para
Facturación — nunca se borró, a diferencia de Producción/Finanzas.** El propio commit del
corte (`0af2f1b`, 2026-09-12) lo dice en su mensaje: *"Facturación/SUNAT se rescata íntegra
(comprobantes, series con correlativo, proformas, 9 RPCs)"*. Verificado hoy contra el código
(`vender/facturacion/page.tsx`, `ComprobantesPanel.tsx`, `ProformasPanel.tsx`, `lib/lucode.ts`,
las RPCs) y contra producción (`retail.comprobantes`/`retail.proformas` tienen filas reales:
aceptadas, anulada, y 2 pendientes). Cierra la duda que había quedado abierta en BITÁCORA
2026-09-15 ("la contradicción sin resolver sobre si Facturación/SUNAT también quedó descrita
como V1"). Detalle de lo que SÍ sigue abierto en Facturación (no el módulo entero, un punto
puntual) en 🩹 ARREGLAR, más abajo en este mismo archivo.
Lo que sí sigue vigente hoy: Vender/Caja (POS), Productos, Inventario, Compras, Movimientos,
Colaboradores, Producción, Facturación. Antes de
actuar sobre cualquier ítem de este archivo, confirmar contra `apps/web/app/(app)/` que
el módulo todavía existe — este documento no se ha reescrito para reflejar V2 todavía
(tarea propia, pendiente de agendar con Felipe, no improvisada acá).

---

## 🎯 El combo «Responsable» en TODA operación que guarda (2026-09-23, ADR-0161 act. c) — EN PRODUCCIÓN (web fusionada en PR #360 y publicada; Felipe pegó la migración el 2026-09-23; verificado en solo lectura: `(false)` solo en los 4 permisos, 80 funciones firman con el responsable, sin sobrecargas)
Felipe no encontraba el combo en Recibir ni en Registrar comprobante: la A8 los había dejado fuera («no de tienda»). Decidió
«en todo», con el mismo candado de asistencia. Migración: toda firma `fn_actor_persona_id(false)` → `(true)`, salvo 4 usos que
son permiso de la cuenta. Web: combo en Compras (registrar, recibir envío/lote, adjuntos, notas de crédito, pagos, reembolso,
cierre de faltante, reparto), Producción/Taller/Insumos (abrir, cerrar, anular, revertir, consumo, devolución, ingreso de
insumo, comprobante, recepción y pago de comprobante), Colaboradores y Roles y accesos, y Aperturas por revisar.
- [x] Publicado en orden: primero la web, después la migración.
- [ ] Verlo con clics (Recibir en una terminal, Registrar comprobante, Taller) — solo se verificó con typecheck, build,
      24.333 pruebas web y las pruebas SQL (`pruebas:actor-firma` 30/30, `pruebas:roles` 70/70, `pruebas:terminales` 52/52).
- [x] «Quién» en las que guardaban sin firmar (ADR-0161 act. d, migración `20260923240000`) — EN PRODUCCIÓN (web PR #364 publicada; Felipe pegó la migración el 2026-09-23; verificado en solo lectura: 12 columnas, tabla de etapas con RLS, 8 funciones y el disparador, sin sobrecargas):
      `set_etapa_produccion`, `anular_comprobante_produccion`, `anular_compra`, proveedores de producción, alta de insumos,
      `reactivar_terminal`, crear terminal y cambiar su clave.
- [ ] Mostrar el «quién» en pantalla (anulada por, historial de etapas, creado por): hoy queda solo en la base.
- [ ] Recibir envío/lote toma la lista de turno de la ubicación que recibe (no la de la cabecera): un almacén sin marcas bloquea.

## 🎯 Caja: cierre con traslado y apertura verificada (2026-09-23, ADR-0186) — EN PRODUCCIÓN (Felipe pegó la migración el 2026-09-23; verificado en solo lectura: una firma por función, tabla, columnas, check, política y permisos; las llamadas de la pantalla resuelven sin ambigüedad) y web fusionada (PR #350)
- ~~Orden obligatorio~~ (cumplido): pegar `supabase/migrations/20260923200000_caja_cierre_con_traslado_y_apertura_verificada.sql` en producción (ya trae el prefijo `retail.`; se puede pegar dos veces) y **recién después** fusionar la web. Al revés, «Cerrar caja» falla: la web manda `p_traslado_*` y la base vieja no los conoce.
- Hecho: esperado visible desde el inicio (`fn_esperado_caja`, mismo cálculo que `cerrar_caja`), conteo por billetes opcional, un traslado (caja fuerte / depósito con voucher / entregado al líder), «queda en el cajón para el próximo turno» calculado, tarjeta «Último cierre» con la caja cerrada, apertura que pide contar el cajón y exige motivo si no coincide, cola «Aperturas de caja con diferencia» en Inicio del líder y sección para marcarlas revisadas en Historial de cierres. Botón «+ Entrada / salida» renombrado a «Registrar movimiento».
- Pruebas: `pnpm pruebas:caja-cierre-traslado` (18/18). Visto en el navegador (local): paso 1 y 2 del cierre con datos reales y la apertura con un cierre de muestra. **No se completó un cierre con clics**: el combo Responsable exige alguien con entrada marcada en la tienda local.
- Pendiente: ver un cierre y una apertura reales con clics tras pegar; refrescar el diccionario (`pnpm datos:generar:produccion`). Fuera por decisión: traslado a otra sede/Taller (necesita acuse de recibo) y fondo sugerido por sede.
- ~~Sin resolver: el tablero sumaba ventas anuladas~~ **Resuelto (2026-09-23):** `getResumenCaja` y `getSeriesVentasCaja` excluyen `estado = 'anulada'`, igual que `fn_calcular_esperado_caja`. En producción no cambió ninguna cifra ese día (0 anuladas en las 3 cajas abiertas; 54 en cajas anteriores).

## 🔍 La página no se encoge bajo el mouse (2026-09-23, ADR-0185) — FUSIONADO (PR #344 y #347); falta verlo con clics reales
Barrido de todo el ERP: ventanas ancladas arriba, lista del Responsable flotando, regla global `<PaginaEstable />` y hueco estable para los datos de cada medio de pago. Medido con Chrome sin ventana: 0 px.
- [ ] **Verlo con clics reales**, con sesión de líder: al fondo de Registrar comprobante, desmarcar «Registrar un pago ahora» (la vista no se mueve; queda aire abajo que se va al subir); en Cambios y en Vender (celular), elegir Responsable estando abajo.
- [ ] Revisar en celular que una ventana corta con la lista del Responsable abierta no quede tapando el botón de guardar.
- [x] `components/NotaCreditoCierre.tsx` era código muerto (nadie lo importaba desde ADR-0142): **borrado el 2026-09-23** con OK de Felipe, junto con 5 funciones y 2 tipos huérfanos de `lib/recepciones-reglas.ts`.

## 🎯 Etiqueta de precio que sale sola al ingresar mercadería (2026-09-23, ADR-0180 y ADR-0182) — los 3 pasos EN PRODUCCIÓN (PR #351, fusionado por Felipe el 2026-09-23); el formato del cartón (44 × 62 mm) en el PR siguiente, sin fusionar
Felipe pidió dejar P-touch Editor: la etiqueta sale del ERP al ingresar mercadería, y con campaña se reimprime con el precio rebajado y el porqué. Diseño elegido en 3 rondas de maquetas: «D · Editorial, corregida» (`docs/maquetas/etiqueta-precio-2026-09/`).
- [x] **Paso 1:** `/etiquetas-de-precio`, una etiqueta por prenda que entró (Recibir, Ingreso sin comprobante, orden del Taller cerrada). Lee `movimientos` por lote o producción, no hay RPC nuevo. PDF real revisado y los 6 QR decodificados a 300 dpi. Producción verificada en solo lectura: las columnas y funciones que usa existen, y las 1.295 variantes activas tienen código.
- [x] **Medida del cartón (Felipe, 2026-09-23): 5 × 8 cm** → la etiqueta pasa a **44 × 62 mm**, impresa de lado (papel del driver: 62 × 44 mm). Arreglo «QR abajo» con el QR lo más grande que entra: 22 mm (20 con campaña). Verificado en PDF real y con los QR decodificados (ADR-0180, «El cartón de 5 × 8 cm»).
- [ ] **Felipe:** imprimir 1 etiqueta en la QL-1110NWB real y escanearla en Vender (pasos en ADR-0180 «Configurar la Brother»; papel del driver **62 × 44 mm**). Mirar que salga completa y a tamaño real.
- [x] **Paso 3 (ADR-0182):** el precio de campaña baja al .90. Una sola regla: `retail.fn_descuento_campana` en la base y `descuentoDeCampana` en la caja, iguales al céntimo en 29.187 combinaciones. Parchea `registrar_venta` y `separar_prendas` (las únicas que calculan campaña en producción). `pnpm pruebas:campana-redondeo` 7/7 y 24.265 pruebas web en verde.
- [x] **`20260923174100_campana_redondea_a_90.sql` pegada en producción el 2026-09-23** (OK de Felipe). Ensayo con rollback verificado, huellas antes/después iguales a las locales, permisos intactos, ejemplos 18.00 / 24.90 / 24.00 / 20.10 (ADR-0182, «Pegada en producción»).
- [x] **Web publicada** el 2026-09-23 a las 12:16: Felipe fusionó el PR #351. **Antes de activar la primera campaña, recargar Vender (F5) en cada caja**: una pestaña abierta desde antes sigue con el cálculo viejo y esa venta se rechaza (`venta_campana_omitida`).
- [ ] **Fusionar el PR del formato del cartón** (44 × 62 mm, QR de 22/20 mm): lo publicado todavía imprime 62 × 92, que no entra en el cartón de 5 × 8 cm.
- [x] El volcado de producción ya trae `fn_descuento_campana` (refrescado por otra sesión, `50b944cd`, 2026-09-23).
- [x] **Paso 2:** la etiqueta dice lo que la caja cobra hoy (con campaña: tachado, precio .90, «−20 %», motivo, «válido hasta»). Se imprime desde la campaña («Volver al precio normal» cuando termina) y desde un producto, con una etiqueta por unidad en stock de la tienda. Probado con la base local, con SQL en transacciones revertidas (alcance y seguridad) y con PDF real + QR.
- [ ] Preguntar a Felipe **en qué sede está la impresora**: si no está en el Taller, lo producido se etiqueta al llegar a la tienda, y eso es parte del paso 2.

## 🎯 Prendas sin registrar: se venden con rastro y almacén las regulariza (2026-09-23, ADR-0179) — base EN PRODUCCIÓN (pegada y verificada 2026-09-23); la web falta fusionar (rama `claude/untagged-products-pos-fe22a4`)
Prendas que llegan a piso antes de pasar por almacén (taller, proveedores, accesorios de internet) y se venden a precio estimado. «Monto manual» pasa a ser «Prenda sin registrar» (descripción, categoría, talla, color, precio; sin mover stock) y almacén la une con su prenda real en Recibir ▸ Por regularizar, respondiendo si «perdió la etiqueta» o «llegó nueva». Detalle en [docs/adr/0179-prendas-sin-registrar.md](adr/0179-prendas-sin-registrar.md).
- [x] Base: `20260923161700_prendas_por_regularizar.sql` (tabla, `registrar_venta` y `anular_venta` con la misma firma, triggers de anulación y de cambio/devolución, variante centinela que faltaba en producción) y `20260923162300_regularizar_prenda.sql`. `pnpm pruebas:prendas-por-regularizar` 15/15; `registrar-venta`, `anular-venta-comprobante`, `comprobante-venta-anulada`, `registrar-cambio`, `separaciones`, `vendedora-en-venta` y `ventas-del-dia` siguen en verde.
- [x] Web: modal de caja, pestaña «Por regularizar» (cifras del mes, filtros, modal con la pregunta y la diferencia antes de guardar), cola «Prendas por regularizar» en el inicio del líder (vencidas a los 2 días), comprobante electrónico nombrado con lo que anotó caja (`descripcion_libre`, nunca `descripcion`: ver «Se rompe si» del ADR).
- [x] Visto en el navegador contra la base local (modal, ticket, pestaña con una vencida y una regularizada, inicio). **Sin probar con clics:** «Cobrar» y «Regularizar» de punta a punta, porque la base local no tiene la asistencia de Dynamic que exige el combo «Responsable»; se cubrió llamando a las mismas funciones con los mismos datos.
- [x] **Las dos migraciones pegadas en producción (2026-09-23, OK de Felipe)** con `supabase db query --linked -f`. Antes de pegar se vio que la versión viva de `registrar_venta`/`anular_venta` NO era la de ningún archivo (la nota de venta y la firma del responsable las editaron en vivo): la primera versión de la migración copiaba el archivo y **habría quitado la nota de venta de la caja**. Se rehízo como parche sobre la definición viva (`pg_temp.reemplazar`) y se probó contra la definición exacta de producción restaurada en local. Huellas después: `registrar_venta` `f0b072c1…`, `anular_venta` `15f8f274…`, `regularizar_prenda` `4ef1b674…` (una firma cada una, mismas ACL); disparadores encendidos; centinela aprobada y sin código; la tabla solo lectura para `authenticated`. Humo en Tienda TRU como líder con responsable presente (venta con nota de venta + regularizar «llegó nueva» + anular), revertido: 0 rastros. Rollback guardado (definiciones previas, huellas `916114…`/`ddac3a…`).
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) con el próximo volcado: tabla y función nuevas.
- [x] **Componentes del sistema y datos encadenados (pedido de Felipe, 2026-09-23):** el modal de caja usa `ComboBuscable` (categoría y color, con muestra), `Desplegable` (talla) y `CampoTexto`; la talla ofrece solo las de la categoría (`categoria_tallas` vía `getEjesPorCategoria`, todas si la categoría no tiene) y se borra si deja de calzar; los colores salen «Más usado» primero (el uso de la categoría en el catálogo de la caja) y después por familia, como en Nuevo producto; la descripción se sugiere «Pantalones · Negro · Talla 28» con «Usar» (llena y deja seguir escribiendo) o «Descartar». En «Por regularizar»: `ComboBuscable` para la prenda (primero las que calzan en categoría, talla y color) y `Desplegable` para el filtro de colaboradora. «Perdió la etiqueta / llegó nueva» sigue con `pildora-cayla`: `Segmentado` subraya la primera opción aunque no se haya elegido, y aquí una respuesta por defecto es justo lo que descuenta dos veces.
- [x] Probado por Felipe en local (2026-09-23: «está bien») y fusionado a `main` por PR el mismo día (el ADR-0178 lo tomó «escalón admin» mientras tanto: esta rama usa 0179).
- [ ] Probar con clics en una tienda real: vender una prenda sin registrar y regularizarla desde la cuenta de almacén.
- [ ] Aparte, sin decidir: las reimpresiones y el historial muestran «Prenda sin registrar» mientras la prenda está pendiente (el comprobante electrónico y el ticket del momento sí dicen la descripción).
## 🎯 Por pagar muestra la parte de MI tienda (2026-09-23, ADR-0187) — construido; migración `20260924100000` POR PEGAR en producción antes de fusionar
Felipe: «que cada tienda vea su parte». La tienda que registró una factura repartida veía el total en Por pagar. Ahora todas las cifras, la lista y el pago usan `fn_deuda_visible` (el líder, igual que antes).
- [x] Migración `20260924100000_por_pagar_parte_de_mi_tienda.sql` (5 indicadores reescritos desde su definición viva de producción + `fn_proveedores` con anclas; candado `{}`).
- [x] Web: filas con «Tu parte · total S/ …», pago lleno con la parte, `porPagarConMiParte` en `lib/compras-mi-parte.ts`.
- [x] Pruebas: `pruebas:por-pagar-parte-de-mi-tienda` 12/12; las de Compras en verde; vitest 24.338.
- [ ] Pegar en producción y verificar (una firma por función, `fn_aplicar_candado_de_dinero()` → `{}`); después fusionar.
- [ ] Verlo con clics con una cuenta no líder con Por pagar; sumar la prueba al CI.

## 🎯 Compras por tienda: cada tienda ve y paga lo suyo (2026-09-23, ADR-0184 — nació como 0145/0150/0151) — EN PRODUCCIÓN las 6 migraciones (Felipe, 2026-09-23; verificadas en solo lectura)
Decisión de Felipe (2026-09-23): con un módulo de Compras se ve y se paga **solo lo de su tienda**; el líder, todo. El rol dice QUIÉN (ADR-0161); `fn_compras_ubicaciones()` dice DÓNDE (su tienda + extras de `compradores_de_tienda`). Detalle en [docs/adr/0184-compras-cada-tienda-compra-y-paga-lo-suyo.md](adr/0184-compras-cada-tienda-compra-y-paga-lo-suyo.md), «Estado final».
- [x] Migraciones `20260923180000` … `20260923180400` (quién y dónde · parte por tienda · gestora + lectura + escrituras · pagar por tienda · F3-b «mi parte»), ancladas en las definiciones de producción del 2026-09-23, re-pegables. Reemplazan a las 5 `20260922*` de la rama `adr-0145-compras-permisos` (nunca pegadas; chocaban en número con 5 de main).
- [x] Web: `persona.tiendasCompra`, «Pagas desde» en los 6 puntos de pago, gestora al registrar, bloque «Tu parte en comprobantes de otras tiendas» (con «Parte nueva») en Comprobantes y Por pagar, y `/compras/parte/[compraId]`.
- [x] Pruebas: `pruebas:compras-por-tienda` 34/34 (en el CI; reemplaza las 4 suites del modelo viejo), `compras-parte-por-tienda` 20/20, `roles` 63/63 y las demás de Compras en verde.
- [x] **Pegadas en producción** (Felipe, 2026-09-23) `20260923180000` … `180400`. Verificado en solo lectura: tabla, vista, 2 columnas, 13 funciones con una sola firma, 5 políticas, 3 candados, nada abierto a `anon`, partes que cuadran al centavo, ninguna vigente sin gestora y `fn_aplicar_candado_de_dinero()` → `{}`.
- [x] **Pegada `20260923180500_compras_comprador_firma_con_actor.sql`** (Felipe, 2026-09-23; verificado: una firma, `v_quien := fn_actor_persona_id(false)`, cerrada a anon).
- [ ] Refrescar el volcado y `pnpm datos:generar:produccion` (el `types.ts` regenerado en main es anterior: lo de Compras por tienda se agregó a mano en este PR).
- [ ] Verlo con clics con una cuenta no líder con Por pagar (hoy ningún rol de producción tiene Facturas de compra, Por pagar ni Notas de crédito).
- [ ] F6 notas de crédito por tienda; F7 resultado por tienda; pantalla para sumar tiendas extra (hoy `agregar_comprador_de_tienda` por RPC).
- [ ] Postgres local compartido: el 2026-09-23 se deshicieron allí los F0–F4 viejos y se aplicaron las de main hasta `20260923163000` más estas 5 (10 funciones que una migración vieja regresionó se restauraron desde producción, verificadas por huella md5). **Quedan sin aplicar en local** `20260922235000` y `20260923110500` (candado de caja/cambios): son anteriores a otras ya aplicadas y pueden regresionar funciones si se aplican a ciegas.

## 🎯 Escalón Admin leído de Dynamic + «solo das lo que tienes» (2026-09-23, ADR-0178) — EN PRODUCCIÓN (Felipe la pegó el 2026-09-23; verificado objeto por objeto: `fn_es_admin`, los 4 candados inyectados, «Administrador» archivado, los 5 admins); web fusionada en main (PR #333)
- La migración se escribió como `20260923160000` y se **renumeró a `20260923163000`** al fusionar (chocaba con `20260923160000_responsable_obligatorio`); contenido idéntico al pegado. Falta refrescar el volcado y `pnpm datos:generar:produccion`.
- **Integrante con 0 módulos: DECIDIDO (Felipe, 2026-09-23), se queda así.** Es configurable desde Roles y accesos; no es un error ni algo pendiente.
- **Decidido (Felipe, 2026-09-23):** Daniel y los 3 practicantes siguen como Líder. Y rige «solo alcanzas a quien está por debajo de ti» (como Dynamic): migración `20260923174500_alcanzas_solo_a_quien_esta_debajo.sql` — **EN PRODUCCIÓN** (pegada y verificada el 2026-09-23: funciones, candados inyectados, permisos; simulando sesiones, Daniel no puede suspender a Felipe y Felipe sí a Daniel). Faltan: refrescar el diccionario de datos.
- Pendiente de la misma conversación: el rol «Encargada de sede» (aprobar/anular en su tienda), que Felipe todavía no aprobó.

## 🩹 Velocidad: auditoría módulo por módulo y el tope de 1.000 filas (2026-09-23) — paso 1 hecho, SIN migraciones
Se midieron en producción (Playwright, solo lectura) 44 pantallas: tiempo hasta que se va el loader, peso de la respuesta y consultas más caras (`pg_stat_statements`).
**Paso 1 (hecho): la caja no veía 295 prendas.** PostgREST corta toda respuesta en 1.000 filas sin error; el catálogo tiene 1.295 variantes y `fn_stock_por_sede` 2.927 filas. La «Chompa Cuello Redondo Lana» roja M (2 en TRU) salía «No encontramos». Nació `leerTodas()` (`lib/resultado.ts`): pide por páginas con orden único, de a 3 en paralelo. Aplicado a `getCatalogo`, `getStockPorUbicacion`, `leerStockDeLasSedes` (Vender, Apartados, Cambios, Existencias) y a Atributos ▸ Etiquetas. Medido contra producción: catálogo 1.295/1.295 en ~680 ms, stock de la red 2.927/2.927 en ~250 ms.
**Regla desde hoy: una lectura que puede pasar de 1.000 filas va con `leerTodas()` y un `.order()` que no repita.**
Lo que sigue, en este orden (acordado con Felipe):
- ~~Existencias y caja, arreglos de código~~ **hecho (PR #335, en producción 2026-09-23):** `fn_resumen_variantes` se pedía 3 veces (la de 30 días repetida) → 2 con `cache`; `filasSemana` recortada a 18 campos (2,1 → 1,3 MB); la caja lee solo cantidades de su sede (`getDisponibleEnSede`, reglas en `sumarCantidades`). Cifras idénticas antes/después (huella de la caja `2a12d636`; Existencias TRU 2.860 / 73 / 12 / 97). Caja: servidor ~1,5–2,0 s → ~1,1 s. **Existencias sigue en ~3 s.**
- **Existencias: el techo ya no es el código, es la CPU de la base** (medido 2026-09-23): `fn_resumen_variantes` cuesta 265 ms dentro de la base (con derrame a disco temporal) y ~430 ms por llamada; 3 llamadas a la vez tardan 685 ms y 6 tardan 1,3 s. Y pedir por páginas RECALCULA la función entera en cada página. Felipe eligió **(a) jsonb en una fila**: `20260923171700_lecturas_en_una_fila_jsonb.sql` (envolturas `fn_resumen_variantes_json`, `fn_resumen_comparacion_json`, `fn_stock_por_sede_json`; las originales no se tocan) — **PEGADA en producción el 2026-09-23**, ensayada antes con BEGIN/ROLLBACK: mismas filas y mismo orden que las originales (1.172 / 1.172 / 2.927 / 1.150), ACL idéntica, `anon` sin acceso. Las 3 lecturas de Existencias: ~1,85 s → ~1,27 s medido desde Lima. Pendiente: (c) abaratar la función misma (derrame a disco), y regenerar el diccionario (los tipos de estas 3 se agregaron a mano: la base local estaba apagada).
- ~~Comprobantes ▸ Emitidos~~ **hecho (2026-09-23):** además de pintar todo (16.500 elementos, 2,8 MB de HTML) estaba CORTADO en 1.000: septiembre tiene 1.406 comprobantes (julio 2.809) y las tarjetas sumaban S/ 131.300 de los S/ 189.029 aceptados. Ahora `leerTodas`, sin `respuesta_sunat` hacia el navegador, y 25 por página con `PaginacionLocal` (filtros, búsqueda, totales y tarjetas ven el mes entero).
- **Catálogo de la caja (opción A):** sigue cargándose entero (vende sin internet); adelgazar lo que viaja y no volver a pedirlo en cada visita.
- **Productos (2,3 s):** `fn_productos_resumen`, marcas y `categoria_tallas` lentas para su tamaño — confirmar con estadísticas limpias (las de hoy mezclan antes del ADR-0176).
- ~~Contador de traslados en cada navegación~~ **descartado tras medir (2026-09-23):** al navegar con clic Next NO vuelve a ejecutar el layout (la respuesta ni trae el contador); solo corre al cargar o refrescar. Las 4 funciones de la persona tardan 1,5–8 ms en la base. El piso de ~0,3–0,45 s que se ve desde Lima es red y arranque de la función, no código.
- ~~Cascadas~~ **Movimientos hecho** (ubicaciones y sububicaciones a la vez). Recibir: su 3.er grupo depende de los comprobantes del 2.º, no se adelanta; lo que pesa ahí es `getCatalogo()` (316 KB por visita).
- **El catálogo se guarda entre visitas (opción A de Felipe, ADR-0181):** `getCatalogo()` con `unstable_cache`, identificado por la versión que la BASE sube con disparadores en las 8 tablas del catálogo (`20260923184300_version_del_catalogo.sql`) y por el commit desplegado. Ensayada en producción con BEGIN/ROLLBACK (la versión sube con escrituras de líder; nadie lee la tabla; `anon` sin acceso). **Falta: OK de Felipe para pegarla** (toca `variantes` y `productos`, núcleo). La web funciona igual sin ella (lee en vivo).
- 🔒 **El costo de una prenda solo para quien ve el dinero (ADR-0183, Felipe: opción C + regla A):** la base cerraba mal `variantes.costo` (cualquier sesión lo leía; Conteo mandaba los 1.295 costos al navegador; `fn_productos`, `fn_costo_historial` y `censo_crear_variante` lo devolvían sin preguntar). Excepción (opción 2, mantiene P5): Análisis sigue mostrando el costo de su sede a quien tiene ese módulo. Migración `20260923193700` + web por la puerta `fn_costos_variantes_json`. Ensayada en producción como líder, colaboradora y terminal (tabla en el ADR). **EN PRODUCCIÓN 2026-09-23** (PR #349 desplegado primero, migración pegada después con guardas: huellas de las 5 funciones sin cambio y bloque final que abortaba si algo quedaba mal). Verificado como líder: Conteo y Compras ▸ Nueva reciben sus 1.295 costos, Productos y Análisis los suyos, la ficha de producto muestra el costo (Polo Básico M/corta: 8 × S/ 18 = base), caja/Cambios/Recibir sin costo y sin errores. Pendiente también: resultados de ADR-0181 en producción (copia del catálogo: 0 lecturas tras 5 visitas, se renueva sola).

## 🎯 Candado de dinero en Caja, Cambios y Devoluciones (2026-09-22/23, ADR-0177 — renumerado desde 0166 por choque con Separaciones, y de 0169 por choque con la Paleta oficial) — pegado y verificado en producción; Cambios revertido a pedido de Felipe
Del análisis `/pantalla` completo del módulo Ventas: la misma familia de hueco en tres pantallas (dinero se movía sin que la base exigiera líder), cerrada en una sola migración. Detalle en [docs/adr/0177-candado-de-dinero-en-caja-cambios-devoluciones.md](adr/0177-candado-de-dinero-en-caja-cambios-devoluciones.md).
- [x] `registrar_movimiento_caja`: `es_ajuste` deducido del motivo (vocabulario cerrado), no de lo que manda el navegador; referencia obligatoria en "Depósito bancario"/"Otro".
- [x] `registrar_cambio`: exige líder cuando la diferencia le devuelve plata a la clienta.
- [x] `aprobar_devolucion`: quien registra no puede aprobar su propia devolución; el reembolso no puede superar lo pagado con descuento.
- [x] `revoke insert/update/delete/truncate` sobre `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios` para `authenticated`/`anon` (mismo patrón que `colaboradores` y `apartados`).
- [x] **Migración `20260922235000` pegada en producción el 2026-09-22** (Felipe) — verificada en solo lectura (huellas de las 3 funciones, permisos de tabla) y con Postgres desechable local (209 migraciones + la nueva, dos veces, 64/64 pruebas, incluida prueba de mutación del `revoke`).
- [x] De paso, `scripts/pruebas/candado_dinero_caja_cambios_devoluciones.mjs` (nuevo) y 3 arreglos a fixtures que solo se notaron porque el candado ya es real: `supabase/seed.sql` (motivos de caja inventados, una sola líder), `aprobar_devolucion_caja.mjs` y `candado_lider_caja_y_ajuste.mjs` (un motivo con la tilde mal puesta, nunca coincidía con nada).
- [x] **Decidido por Felipe (2026-09-23): NO al flujo de "pendiente" — se revierte el candado de líder en Cambios.** "0 trabas, queremos agilidad y el mejor servicio hacia nuestros clientes": Devoluciones ya se opera desde el terminal de cada sede con quien lo gestiona marcando su nombre (combo Responsable); exigir una aprobación aparte en Cambios sumaba fricción al mostrador. `20260923110500_cambios_sin_candado_de_lider.sql` quita solo esa pieza — Caja y Devoluciones no se tocaron. Riesgo aceptado explícitamente: una colaboradora sola puede devolverle plata a una clienta en un cambio sin que nadie más lo revise (el caso real de S/100 por Plin puede repetirse).
- [ ] Pendiente, aparte, con ok explícito de Felipe (toca lo que se reporta a SUNAT): la nota de crédito de una devolución se sigue calculando sobre precio de lista, no sobre lo pagado con descuento (`docs/pantallas/devoluciones.md` §2.3).
- [ ] Pendiente, ya decidido por Felipe (BACKLOG, más abajo): nota de crédito por diferencia de un cambio (serie B por tienda) — proyecto de SUNAT/Lucode aparte, no se mezcló con este candado.
- [x] **Verificado tras la fusión del PR #285:** la migración F3 de abajo (`actor_firma_las_operaciones`) lee la definición viva de `registrar_movimiento_caja`/`registrar_cambio`/`aprobar_devolucion` y solo reemplaza la línea que busca a la persona — no pisa este candado (ni su reversión en Cambios) cuando F3 se pegue en producción.
- [x] **`20260923110500_cambios_sin_candado_de_lider.sql` está en producción** (verificado el 2026-09-23: `registrar_cambio` ya no tiene el candado de líder y sigue firmando con `fn_actor_persona_id(true)`; Caja conserva el suyo). Se renombró desde `…110000` porque chocaba con `20260923110000_cambiar_rol_entre_lideres.sql` y dejaba el CI de `main` en rojo; las dos ya estaban pegadas, así que el cambio de número no toca producción.

## 🔒 Responsable obligatorio para todos (2026-09-23, Felipe, ADR-0162 actualización) — ENCENDIDO en producción (10:24)
«Todas obligatorias, un mismo flujo para todos; si nadie marcó asistencia no se podrá vender.» Sin excepción para el líder.
- [x] Interruptor como dato: `configuracion_empresa.exige_responsable` (migración `20260923160000_responsable_obligatorio.sql`), apagado por defecto; 6 casos nuevos en `pruebas:terminales-sin-persona` (52/52).
- [x] Combo en las 7 llamadas que no lo mandaban (anular venta, aprobar/rechazar devolución, anular y liberar comprobante, archivar serie, registrar clienta) y en `/api/lucode/consultar-anulacion` — PR #329 fusionado y publicado (`3a7d4377`), auditoría en 0.
- [ ] Verlo con clics en cada una de esas pantallas, con alguien marcado.
- [x] `20260923160000` pegada en producción el 2026-09-23 (ensayo con ROLLBACK y COMMIT): una sola firma, la columna existe y el interruptor quedó APAGADO.
- [x] **Encendido en producción el 2026-09-23 a las 10:24** (Felipe: «Encender ahora», sabiendo que Arequipa y Lima tenían 0 marcados). Verificado: un líder sin responsable recibe «Elige quién hace esta operación»; lo que no es de tienda sigue igual.
- [ ] Emergencia (una tienda trabada): `update retail.configuracion_empresa set exige_responsable = false;` — sin migración.
- [ ] Lima: cargar su asistencia en Dynamic; hasta entonces, con el interruptor encendido, Lima no puede guardar nada.
- Cómo verificas: como persona, en una tienda donde nadie marcó entrada, el botón de guardar queda apagado con «Nadie de turno…»; con alguien marcado, se elige y guarda a su nombre.

## 🎯 Las 6 decisiones de los módulos (2026-09-22, ADR-0161 P1–P6) — EN PRODUCCIÓN (pegada el 2026-09-23)
Migración `20260923140000_modulos_seis_decisiones.sql` + web + pruebas. Detalle y clasificación de cada candado en el ADR-0161 («P1–P6 construidas»).
- [x] **P1 Compras, cada módulo lo suyo:** `fn_puede_registrar_facturas_compra` (registrar, anular, reparto, adjuntos), `fn_puede_pagar_compras` (pagos y reembolsos), `fn_puede_registrar_notas_credito` (notas y el PDF de la nota). `fn_puede_registrar_compras` queda solo para leer lo de los tres. Web: el detalle del comprobante muestra cada botón a su módulo (`accionesDeCompra`).
- [x] **P2 Recibir con montos** para quien ve el dinero de Compras (`verDineroCompras`), sin cambiar la sede que se mira. Sin cambio en la base (se dejó escrito por qué).
- [x] **P3 Proveedores:** alta, edición, archivo y ficha con su módulo (`fn_puede_gestionar_proveedores`, política `proveedores_write`); en la ficha, los montos con `verDineroCompras` y los insumos del Taller solo el líder.
- [x] **P4 Etiquetas sin descuento desde la ficha de la prenda** con Productos o Categorías y atributos; las de descuento no se le ofrecen a quien no es líder.
- [x] **P5 Existencias:** costo y stock de la red, solo del líder (Análisis ve el costo de SU sede en Análisis).
- [x] **P6 Colaboradores y Roles y accesos, solo a personas:** candado en los disparadores de `terminales` y `rol_modulos` + capacidades falsas para una terminal; en Roles y accesos se avisa al encenderlos y no se ofrecen esos roles a una terminal.
- [x] **Pegada en producción el 2026-09-23** (OK de Felipe) por el MCP: ensayo con ROLLBACK y luego COMMIT, con los 21 candados verificados por la propia migración. Comprobado después: encender Colaboradores en «Terminal Almacén» se rechaza («solo se da a personas»), política `proveedores_write`, `fn_resumen_variantes` solo del líder.
- [x] **Pregunta para Felipe (P3) — respondida:** la Terminal Almacén **se queda con Proveedores** («normal que una terminal registre proveedores»). Sin cambio.
- [x] **Pregunta para Felipe (P1) — respondida:** queda como se propuso (recibir con nota de crédito por faltante pide Notas de crédito).
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella); `datos:comparar` sin pantallas rotas ni firmas dobles.
- Cómo verificas: un rol con solo «Por pagar» ve el detalle de un comprobante con «Registrar pago» y sin «Anular»; uno con solo «Proveedores» entra a Compras ▸ Proveedores, abre la ficha sin una cifra y puede editar; en Roles y accesos, encender Colaboradores en «Terminal de ventas» avisa y no se enciende.

## 🩹 RLS fila por fila: Historial de ventas caído por timeout (2026-09-22, ADR-0176) — A y B PEGADAS en producción
Con el sembrado de 90 días (7.001 ventas), `/vender/historial` pasaba los 8 s de `statement_timeout` y mostraba «No se pudo cargar» (digest `575251889`). La causa: la RLS llamaba funciones SECURITY DEFINER una vez por fila.
- [x] **A:** las 4 políticas de lectura de venta (`ventas`, `venta_items`, `venta_pagos`, `comprobantes`) con `(select …)`, más el índice `ventas (created_at desc, id desc)`. Migración `20260923143700_…`, PEGADA en producción y aplicada en local. Mismas filas visibles, verificado con huellas como líder e integrante. La lista pasó de 12,3 s a 0,5 s.
- [x] **Verlo con clics:** Felipe abrió `/vender/historial` en producción y cargó (2026-09-22).
- [x] **B:** `20260923152300_rls_todas_una_vez_por_consulta.sql`, PEGADA en producción y aplicada en local. Reescribió las 92 políticas restantes con `retail.fn_rls_una_vez_por_consulta()`; quedan 0 pendientes. Equivalencia de 121/121 cláusulas con 6 cuentas (líder, integrantes de TRU, AQP y Taller, dos terminales). Movimientos para una integrante: 57 s → 14 ms; Stock: 7,3 s → 3 ms.
- [x] **Políticas pendientes de envolver:** la 140000 corrió `fn_rls_una_vez_por_consulta()` al final; la consulta del ADR-0176 da **0** en producción (2026-09-23).
- [ ] **Base local:** la migración de separaciones (`20260923090000`) no está aplicada en local (`scripts/pruebas/separaciones.mjs` da 0/46 porque falta la tabla); en producción sí está.
- [ ] **Decisión de Felipe:** las 7.002 ventas en producción tienen `es_prueba = false`, sembradas incluidas. El filtro «Ver datos de prueba» no las esconde y cuentan en los totales. ¿Es a propósito (ADR-0150)?
- [ ] **Previo, sin relación con esto:** `scripts/pruebas/registrar_venta.mjs` da 21/25 en local. Fallan los 4 casos «colaboradora + código de descuento»; fallan igual con las políticas viejas.
## 🎯 Catálogo: el combo «Responsable» solo dentro de las ventanas (2026-09-23, ADR-0161 act. b) — construido, SIN migraciones
- [x] Las 8 listas de Catálogo sin combo arriba; Aprobar, Desactivar y Reactivar abren una confirmación con el combo adentro (`ConfirmarConResponsable`). Maqueta aprobada: `docs/maquetas/catalogo-responsable-confirmacion-2026-09/`. Tipos, lint y 24 240 pruebas en verde.
- [ ] **Verlo con clics** (no se pudo sin sesión): con tu cuenta, desactivar un tejido abre «¿Desactivar «X»?» con tu nombre ya elegido; con una terminal, viene vacío y el botón se apaga hasta elegir.

## 🎯 Combo «Responsable»: propone a quien inició sesión y dice «¿Quién está atendiendo?» (2026-09-22, actualización del ADR-0161) — en `main` (PR #320), SIN migraciones

- [x] ~~Texto del combo vacío: «¿Quién está atendiendo?» en todos los módulos.~~ (corregido abajo)
- [x] Con una sesión de persona, el combo viene elegido con ella (si está de turno) y vuelve a ella tras guardar; con una terminal y en el módulo Punto de venta (venta y apartados), vacío. Regla pura `responsableInicial` en `lib/responsable-reglas.ts`, con pruebas.
- [x] **Corregido 2026-09-23:** «¿Quién está atendiendo?» solo en Punto de venta (venta y apartados), Cambios y Devoluciones, y ahí siempre vacío; el resto vuelve a «¿Quién hace esta operación?» (modo `atencion`/`operacion`, ADR-0161 actualización 2026-09-23). Sin migraciones.
- [ ] **Verlo con clics:** con tu cuenta y la entrada marcada, Ajustar stock trae tu nombre y dice «¿Quién hace esta operación?» si lo vacías; en Punto de venta, Apartados, Cambios y Devoluciones viene vacío con «¿Quién está atendiendo?»; con una terminal, vacío en todas las pantallas.

## 🎯 Existencias: la tabla pinta 15 prendas por página (2026-09-22) — hecho, SIN migraciones
- [x] `InventarioPanel.tsx` pinta solo una página de 15 (`FILAS_POR_PAGINA`); las tarjetas, los filtros, el CSV (todas las páginas de lo filtrado) y los overlays siguen viendo todo. Cambiar un filtro vuelve a la página 1; si un guardado achica la lista, cae en la última que existe. Pie: «Mostrando 1–15 de 52 prendas» / «Mostrando 1–15 de 18 (de 52 prendas)».
- [x] Lógica pura en `lib/paginacion.ts` (`paginar`, `numerosDePagina`, este último movido desde `components/Paginacion.tsx`) + 8 pruebas; paginador en memoria `components/ui/PaginacionLocal.tsx`, mismo dibujo que `PaginacionPaginas`. Probado en navegador sobre una demo temporal con 52 variantes (escritorio y 390 px, sin errores de consola).
- [ ] **Verlo con clics reales** en TRU contra producción y medir cuánto bajó la carga. Si sigue lenta, lo que queda es el servidor: la página trae TODAS las variantes y 8 consultas (`getExistencias` + cobertura + ritmo 7D/30D + apartados…) antes de pintar; paginar en la base exige mover filtros, tarjetas y recomendaciones a RPC — decidir con la medición en la mano, no antes.

## 🎯 Traslados: rediseño de lista y detalle, conteo por borradores y vacíos ocultos (2026-09-22, ADR-0173) — construido y verificado con datos de muestra; SIN migración
- [x] Demo aprobada por Felipe (`docs/maquetas/traslados-rediseno-2026-09/`). En producción, los 4 traslados tienen 0 líneas y 0 movimientos (quedaron de la limpieza de datos): se **ocultan** en la lista, en las lecturas de `lib/traslados.ts` y en el contador del menú. No se borran.
- [x] Lista: estados «Por confirmar / Por revisar / En camino / Completado», los colores de lo que va cuando no hay fotos, «Salió» con hora, píldoras en lugar del `<select>` nativo y el aviso de vacíos para el líder. Detalle: recorrido en 4 pasos (quién envió, quién contó, quién cerró), 3 cifras, conteo con −/+/«Coincide» guardado al confirmar, un solo campo para escanear, `<Modal>` para confirmar, nota obligatoria al cerrar con diferencia y tarjetas en celular. Cierra el pendiente «Traslados › detalle sigue con la celda de texto».
- [ ] **Verlo con una sesión real** (TRU y AQP): contar y confirmar un traslado de prueba, abrir el modal y cerrar uno con diferencia como líder. En la ruta de muestra el combo Responsable no tenía base y el modal no se abrió.
- [ ] Endurecer en la base la nota de cierre: hoy solo la pantalla la exige; `cerrar_traslado_con_diferencia` acepta `p_nota` vacía.
- [x] (ADR-0175) Las tarjetas son el filtro (los chips repetidos pasan a Abiertos · Cerrados · Todos), dirección Entran/Salen a la vista y tabla en dos acomodos (6 columnas desde 1280 px, tarjeta debajo). Capturas a 1280/1440/390 px con el `TrasladosPanel` real y datos de muestra. Falta verlo con clics reales.
- [ ] Decidir qué hacer con las 4 cabeceras vacías de producción (Traslados 1 al 4): siguen en la base; el 4 está «en tránsito».

## 🎯 Los 7 módulos «del líder» se pueden dar a un rol (2026-09-22, ADR-0161 B6-B8) — EN PRODUCCIÓN (pegadas el 2026-09-22)
- [x] Pegadas en producción: `20260923130000_abrir_modulos_a_los_roles.sql` y `20260923131000_colaboradores_y_roles_delegables.sql` (verificado el 2026-09-22 leyendo producción: `fn_puede_analizar`, `fn_puede_gestionar_colaboradores` y los 7 módulos `delegable`).
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella).
- [x] ~~PR aparte: las 6 decisiones P1-P6~~ → sección de arriba.
- Cómo verificas: en Roles y accesos los 7 módulos salen con interruptor; un rol con solo «Por pagar» ve Compras ▸ Por pagar con montos; uno con «Etiquetas» ve la pestaña Etiquetas y no puede poner descuento.

## 🎯 Conteo físico: rediseño con la guía oficial (2026-09-22, ADR-0174) — hecho; migración en producción desde el 2026-09-22
Demo: `docs/maquetas/conteo-rediseno-2026-09/conteo.html` (artifact https://claude.ai/artifact/U6e6UwKXX3rByebdBPDLrD).
- [x] Pantalla: abrir en tres pasos; «Suma por escaneo» / «Escribir cantidad» con escrituras en fila; «Faltan por contar» sin cifras (variante A, elegida por Felipe); sin «Diferencia hasta ahora» con conteo abierto; «Vacío» en historial y detalle; revisión en `<Modal>`; detalle con «Con diferencia / Todas» y soles por línea. Tipos, lint y 8031 pruebas en verde; recorrido en navegador con datos de muestra (sin base local).
- [x] **Migración en producción** (OK de Felipe, 2026-09-22, por MCP en una transacción): `20260923120000_conteo_vacio_no_se_cierra.sql`. Verificado: candado 1 vez, antes de tocar stock, `security definer`, una firma, mismos permisos; md5 `257e622c…` → `acc166a9…`. No había conteos abiertos. Falta refrescar el volcado (`generado/COMO-REFRESCAR.md`); la firma no cambió.
- [ ] **Verlo con clics reales** en TRU: abrir «Solo Camisas y Blusas» en el piso, contar con la pistola en suma (varias lecturas seguidas de la misma prenda), corregir, revisar y cerrar; y confirmar que la pistola manda Enter al final de cada lectura (si no, en suma no cuenta: hay que configurarla).

## 🎯 Paleta oficial «CAYLA Dynamic» + rediseño visual de Inventario (2026-09-22, ADR-0169) — hecho, SIN migraciones; falta verlo con clics reales
- [x] Tokens oficiales en `globals.css` para todo el ERP: papel `#fbf8f2`, taupe `#805c4c`, verde `#48603f`, ámbar `#74501a`, más `hueso` y `pizarra` nuevos, radio flotante de 20 px y serif en 600. Contraste medido: todo ≥ 4.5:1.
- [x] Piezas del sistema: `eyebrow-cayla`, `btn-cayla` (primario/secundario/peligro/sutil/enlace), `pildora-cayla`, `caja-cayla`, `nota-cayla` y zebra de tabla; `Tabla`, `Chip` (insignia con punto + tono `pizarra`), `TarjetaCifra`, `campos` (variante `caja`) y `CabeceraPantalla` nueva.
- [x] Existencias, Movimientos, Traslados, Conteo y Análisis en el orden oficial (cabecera → cifras → filtros y tabla en una sola tarjeta → nota). Solo visual: ninguna pantalla cambia su información. Typecheck, lint y 7,868 pruebas en verde; capturas antes/después en 3 anchos sobre una demo temporal con datos de muestra (no había base local: docker bloqueado por la red de la sesión).
- [x] Movimientos rediseñado con las tres opciones que Felipe eligió en la demo (ADR-0170): una sola sede (la de la cabecera), proceso en dos pasos bajo el tipo, filtros en dos filas como la guía, lista de la guía con hora, vacío que ofrece 90 días con la cifra real. Sin migración. Typecheck, lint y 7,984 pruebas en verde; capturas a 1366/820/390 px sobre una ruta temporal con datos de muestra (sin base local: el proxy bloquea las imágenes de Supabase).
- [ ] Movimientos: verlo con clics reales contra la base (filtros, `?proc=conteo` desde Conteo, vacío con 90 días, detalle).
- [ ] Movimientos: cantidades por proceso en el drill-down — pide agrupar `fn_movimientos_resumen` por motivo (cambio de RPC en producción). Solo si el equipo lo pide.
- [ ] **Verlo con clics reales** contra la base local o de producción (líder e integrante): filtros en caja, píldoras, zebra, chips y los modales que abren desde Existencias.
- [ ] **Ventas a la guía oficial** cuando se fusionen sus ramas en curso (Caja/Punto de Venta/Cambios, Devoluciones, Facturación, Historial #275/#278). Después: Catálogo e Inicio (la guía trae sus maquetas).
- [ ] Decisiones abiertas de la guía (ADR-0169, «Lo que NO se hizo»): modo oscuro, pasar la caja hueso a todos los formularios, botones de modal sin versalitas y la curva `ease-salida` frente a `--ease-cayla`.

## 🎯 Proformas con prendas, hoja A4 con fotos y cobro en el Punto de Venta (2026-09-22, ADR-0167) — EN PRODUCCIÓN (base y web)
PR [#298](https://github.com/felipea92p-ux/cayla-retail/pull/298), fusionado. Diseño: `docs/superpowers/specs/2026-09-22-proformas-con-prendas-design.md` (maqueta C, con foto de cada prenda); plan: `docs/superpowers/plans/2026-09-22-proformas-con-prendas.md`. Decisión en [docs/adr/0167-proformas-con-prendas.md](adr/0167-proformas-con-prendas.md).
- [x] **Rediseño de Comprobantes** (mismo día, commit `1a470626`): sin botones en la cabecera; «Emitir comprobante» borrado (cada venta se declara sola, D-60); Series a todo el ancho con la sede propia primero y «Último: hace…»; Emitidos con filtros tipo/tienda/estado, totales por tipo y WhatsApp; Por reintentar con «Qué hacer», plazo de SUNAT (3 días) y «Reintentar los N». Verificado en el navegador local contra la base (totales = SQL).
- [x] **Migración `20260923094700_proformas_con_prendas.sql`**: `numero`, `nota`, `venta_id`; `crear_proforma` v2 (valida y calcula; borra la firma vieja); `marcar_proforma_cobrada`; `convertir_proforma_a_comprobante` sin permiso. Ensayada en una transacción con ROLLBACK (rechazos, una sola firma, idempotencia, otra tienda) y aplicada solo en local.
- [x] Pantalla: «Nueva proforma» con buscador/escáner, cantidad, descuento hasta 20 % con motivo, clienta, validez y nota; lista con número, detalle con foto, Ver / imprimir, WhatsApp, Duplicar / Renovar y Cobrar. Hoja A4 verificada con un PDF real (una hoja, nada cortado).
- [x] **Cobro de punta a punta en el navegador local** (PRO-000006, Trujillo): carrito armado, venta completada, piso 4 → 3 con su movimiento, proforma «convertida» y enlazada, nota de venta NV01-000002. Se cobró con nota de venta porque la boleta chocó con el problema de series de abajo.
- [x] **Pegada en producción el 2026-09-22** (Felipe: «Ok»), por el MCP en una sola transacción con bloque de validación final, ensayada antes en local sobre el estado de producción. Antes: `crear_proforma` vieja `45909742…` (rollback guardado = su definición de `20260918091500`, misma huella), 1 proforma vigente de S/ 7,000, sin disparadores en `proformas`. Después: `crear_proforma` `1cf28322…` y `marcar_proforma_cobrada` `1dbeece0…` (iguales a local), una sola firma, EXECUTE solo `postgres`/`authenticated`, `convertir_proforma_a_comprobante` solo `postgres`; la proforma existente es PRO-000001. Humo como líder real sin escribir: `crear_proforma([])` → «necesita al menos una prenda», `marcar_proforma_cobrada(uuid inexistente)` → «no existe»; después, 1 proforma y último número 1. No se registró en `schema_migrations` de producción (igual que pegados anteriores).
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella).
- [x] **PR #298 fusionado por Felipe el 2026-09-22 (22:09 UTC)**, CI entero en verde (incluida la piloto de RPC: `pruebas:comprobante-venta-anulada` ahora inserta su proforma con el formato anterior, porque `crear_proforma` solo acepta prendas). Vercel desplegó bien. Al fusionar se integró el Responsable (ADR-0161): «Nueva proforma» firma con el combo y «Reintentar los N» pasa por la misma confirmación que «Reintentar ahora».
- [x] **Verificado en producción el 2026-09-23** (solo lectura): columnas y candados en su lugar; `marcar_proforma_cobrada` `1dbeece0…`; «Convertir» solo `postgres`; una sola firma de `crear_proforma`, ahora `03e640bd…` porque después se pegó «actor firma» (ADR-0162), que cambió su línea de quién opera por `fn_actor_persona_id(true)` — deshecha esa línea da exactamente `1cf28322…`, lo pegado. Todavía nadie creó una proforma con prendas en producción (solo existe PRO-000001, formato anterior, de prueba).
- [ ] Primera proforma real en producción: crear una con prendas, imprimirla y cobrarla en una tienda con stock en el piso, y mirar que quede «convertida».
- [ ] En la base LOCAL, Lima y Trujillo comparten la serie `B001` con contadores independientes: la siguiente boleta de Trujillo (B001-24) choca con la de Lima (`comprobantes_tipo_serie_numero_key`). Producción no lo tiene (B004/B005). Arreglar la base local (una serie por tienda), no el código.
## 🎯 Terminales sin persona, como en Dynamic (2026-09-22, ADR-0162) — CONSTRUIDO en la rama `claude/responsable-y-roles-spike` (PR #285); falta pegar en producción y publicar
- [x] Investigado Dynamic (`public.terminales`, cuenta de Auth sin persona, `fn_sede_actual_terminal`, script de alta, sin PIN) y medido en producción: 75 funciones de retail buscan persona (~65 con un reemplazo mecánico, 10 a mano).
- [x] Plan en `docs/adr/0162-terminales-sin-persona-como-dynamic.md`; spike, pantallas 5 y 6. Aprobado por Felipe.
- [x] **F1:** el encabezado `x-responsable` llega por PostgREST (local con `curl` y `supabase-js`; en producción, el CORS ya lo acepta).
- [x] **F2** `20260923010000_terminales_sin_persona.sql`: `retail.terminales`, `fn_terminal_actual`, `fn_persona_presente`, `fn_actor_persona_id`, `fn_exige_responsable` (apagado), `terminal_id` + `trg_sellar_terminal` en 10 tablas, `fn_terminales`/`desactivar_terminal`/`reactivar_terminal`, retiro de `colaboradores.terminal` y `agregar_terminal`. `pnpm pruebas:terminales-sin-persona` 34/34.
- [x] **F3** `20260923100000_actor_firma_las_operaciones.sql`: 65 funciones firman con `fn_actor_persona_id` (36 de tienda, 29 no), cotejadas contra producción en solo lectura. Terminal sin tope de descuento y libera apartados siempre (Felipe). `pnpm pruebas:actor-firma` 30/30, `pnpm pruebas:terminales` (reescrita) 74/74.
- [x] **F4a** web: sesión de terminal por `requirePersonaActualV2`, pie del lateral con el aparato, aviso de terminal desactivada en `/login`, pestaña Colaboradores ▸ Terminales (Desactivar / Reactivar).
- [x] **F5** script `pnpm terminales:crear` (+ `pnpm terminales:probar`), sin correr contra ningún entorno.
- [x] F2 `20260923010000` y F3 `20260923100000` pegadas en producción (2026-09-22/23); `terminales`, `fn_actor_persona_id` y `fn_exige_responsable` están en el volcado del 2026-09-23.
- [ ] Publicar la web (fusionar el PR #285; lo fusiona Felipe).
- [ ] Felipe crea las 6 terminales (ventas y administrativa de TRU/AQP/LIM) con `pnpm terminales:crear`. **No crear personas en Dynamic.**
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella).
- [ ] Verificar con una terminal de verdad en TRU (aún no se probó con la sesión de un aparato en el navegador; sí con la de un líder).
- [x] La migración del ADR-0160 **ya está pegada** en producción, con 0 terminales dadas de alta.

## 🎯 Cambiar rol y ubicación entre líderes (2026-09-22, actualización del ADR-0161) — EN PRODUCCIÓN (PR #304 y #310)
- [x] `asignar_rol` sube a Líder y baja a un líder (con sede si no tiene); nunca a uno mismo ni Líder a una terminal.
- [x] Ubicación entre líderes: para un líder es la tienda donde arranca (`fn_ubicacion_de_partida`).
- [x] `20260923110000` y `20260923120100_ubicacion_de_lideres` (antes `120000`: se renumeró por choque con conteo vacío) pegadas y verificadas en producción el 2026-09-22: versión del repo, una firma cada una, las 25 personas arrancan donde antes. **No volver a pegarlas:** `20260923131000` (roles delegables) se pegó después y les agregó sus candados; re-pegarlas los borra.
- [ ] Refrescar el volcado y `pnpm datos:generar:produccion` + `pnpm datos:comparar` (entra `fn_ubicacion_de_partida`).
- [ ] Verlo con clics: poner «Tienda Trujillo» a un líder de Oficina TRU y que entre ahí.

## 🎯 Responsable en cada operación + roles retomados (2026-09-22, ADR-0161) — combo Responsable CONSTRUIDO (F4b, PR #285); roles en otra rama
- [ ] **Más adelante (Felipe, 2026-09-22: «no es tan importante por ahora»):** guardar quién crea o cambia marcas (`retail.marcas` no tiene columna de firma) y anotar los cambios de NOMBRE de una prenda en el historial (`fn_registrar_cambio_producto` solo registra categoría, estado, marca, proveedor, precio y costo). Hoy el combo se pide en Catálogo pero esos dos casos no dejan rastro.
- [x] **Decisiones de Felipe** (4 rondas): combo «Responsable» vacío en cada acción que guarda, solo el nombre, solo quien marcó entrada hoy en esa tienda y no salió, bloqueo si no hay nadie (también LIM y también el líder desde casa), en todas las cuentas para la operación de tienda. Roles simplificados después a «ve / no ve» por módulo.
- [x] **Spike visual:** `docs/maquetas/responsable-y-roles-spike-2026-09/` (editor de roles, combo en una venta, cierre de caja, nadie de turno).
- [x] **Spike aprobado.** En pausa NO firma ni opera; sin conexión vale la hora de la venta.
- [x] **(a) Responsable, en la base:** lo resuelve `fn_actor_persona_id` del ADR-0162 (no hizo falta un `fn_responsable_actual()` aparte ni una columna `responsable_id`: `usuario_id` es el responsable y `terminal_id` el aparato).
- [x] **(a) Responsable, en la web (F4b):** `lib/responsable-reglas.ts` (+ test), `lib/useDeTurno.ts`, `lib/useResponsable.ts`, `components/ComboResponsable.tsx`, `components/SedeActiva.tsx`; encabezados `x-responsable` / `x-ubicacion` / `x-momento`. Conectado en Punto de venta (reemplaza la fila «Atendió» del ADR-0163) y ventas sin conexión, Caja, Cambios, Devoluciones, Facturación, Inventario y Catálogo (lista en el ADR-0161, «F4b»).
- [x] **Verificado en navegador** (Postgres local, sesión de líder): abrir caja, cobrar (nota de venta), egreso de caja y cerrar caja → combo vacío, botón apagado hasta elegir, vuelve a vacío, y en la base firma la persona ELEGIDA.
- [ ] Encender `fn_exige_responsable()` (`create or replace … select true`) **solo después** de publicar la web y de revisar que no quede una escritura de tienda sin combo; si no, la base rechaza a una persona sin encabezado con `responsable_requerido`.
- [ ] (b) **Roles «ve / no ve» por módulo:** en construcción en otra rama (`claude/roles-por-modulo`), **no está en el PR #285**.
- [ ] LIM no podrá guardar nada hasta que se cargue su asistencia en Dynamic (decisión A5). En el Postgres local (sin `marcajes`/`jornadas`) todo queda bloqueado igual: es la regla, no un error.
- [ ] **Decide Felipe:** ¿«Pedidos no atendidos» es operación de tienda (lleva combo)? Hoy no tiene combo; su función ya firma con `fn_actor_persona_id(true)`.
- [x] **Decide Felipe:** la terminal descuenta sin tope, pero como no es líder, un descuento manual por línea le sigue exigiendo un código de descuento válido (`venta_descuento_requiere_codigo`, `registrar_venta`). ¿Se deja así o la terminal queda libre del código también? **Decidido (Felipe, 2026-09-22): la terminal pide código, como una colaboradora.**
- [ ] **Límite conocido:** un Punto de venta abierto SIN conexión desde el inicio no carga la lista del combo y no puede vender sin conexión hasta que la cargue una vez con red.
- [x] ~~Alinear la fila «Atendió» del ADR-0163 con el ADR-0161~~: hecho en F4b (el combo la reemplaza; vacío siempre y bloqueo).

## 🎯 «Quién vendió» en el ticket del Punto de venta (2026-09-22, ADR-0163) — rehecho sobre la asistencia de Dynamic; migración en producción, falta fusionar la web
Un solo equipo de caja y varias colaboradoras por tienda. La fila «Atendió» ofrece a quienes marcaron entrada hoy en Dynamic (`fn_asesoras_de_turno`) y la venta se guarda en `ventas.asesora_id` — ambas ya en producción desde la 20260922150000 (ADR-0153). Decisión en [docs/adr/0163-vendedora-en-el-ticket.md](adr/0163-vendedora-en-el-ticket.md).
- [x] Primera versión con columna propia (`vendedora_id`) e interruptor del líder: verificada en navegador el 2026-09-22, pero chocaba con la 150000 de main (dos columnas, dos `registrar_venta`). **Descartada al fusionar main**: se borró la 20260922143700 (nunca se pegó) y el modal del líder.
- [x] Rehecha (Felipe: 1A 2A 3A): solo las `presente`; si nadie marcó hoy, todas las de la sede con aviso; sin interruptor. `lib/useVendedorasDeTurno.ts` relee cada minuto. `p_asesora_id` en la venta y en la cola offline; historial, Cambios/Devoluciones y detalle de caja leen `asesora_id`. Pruebas puras en verde (7816) y ensayo de las migraciones 140000 + 150000 + 213700 en una transacción con ROLLBACK contra el Postgres local: 6/6.
- [x] **`20260922213700` pegada en producción (2026-09-22, OK de Felipe)** por el MCP: huella antes = la de la 140000 sin comentarios, después `39e3070d…` = el repo; una sola sobrecarga, permisos iguales; humo como líder sin escribir: 2 ventas de hoy = 2 filas, ninguna sin vendedor. Hasta que se fusione la web, `asesora_id` llega vacío y la salida es idéntica a la de antes.
- [x] **Verificado en navegador (local, 2026-09-22)** con asistencia simulada (tabla temporal + `fn_asesoras_de_turno` reemplazada unos minutos, restaurada con la misma huella `c435a1eb…`): 2 presentes y 1 en almuerzo → 2 chips y cobro bloqueado hasta elegir; cobro real → `asesora_id` = Sofía, `usuario_id` = Felipe, «Ventas de hoy» dice «Sofía»; 1 presente → «Atiende Micaela» sin recargar; nadie marcó → las 3 con el aviso.
- [ ] Fusionar la rama (PR) — pedir OK. Después, mirar en producción la fila con la asistencia real de TRU.
- [x] Base local sincronizada (OK de Felipe): retirada la versión vieja, 13 migraciones pendientes aplicadas en una transacción (ensayada antes con ROLLBACK) y registradas; se vaciaron las 10 filas de prueba de la tabla vieja `clientes`. `pruebas:vendedora-en-venta` 7/7, `pruebas:ventas-del-dia` 11/11. `pruebas:registrar-venta` da 21/25 por dos cajas abiertas en la base local (Lima desde el 18-sep, Trujillo desde hoy): la prueba las intenta cerrar como colaboradora y el candado de líder lo impide — estado de la base, no de este cambio.
- [ ] Aparte (lo encontró la primera verificación): Lima y Trujillo comparten código de serie de comprobante con contadores independientes.

## 🎯 Nota de venta en el Punto de venta (2026-09-22, ADR-0164) — migración en producción; falta fusionar la web
Tercera opción del comprobante: Boleta | Factura | Nota de venta. Documento interno, serie propia por tienda (NV01 TRU, NV02 AQP, NV03 LIM), sin IGV desglosado, nunca va a SUNAT. Felipe: 1A mismo precio · 2A serie por tienda · 3A no se convierte en boleta · 4A cualquier colaboradora.
- [x] Base: `20260922224300_nota_de_venta.sql` — tipo `nota_venta`, estado `interna` y candado que impide que quede `pendiente`; `registrar_venta`/`emitir_comprobante`/`anular_venta` tocadas sobre su definición viva. Ensayo con ROLLBACK aplicándola dos veces: NV01-1 `interna`, IGV 0, total = precio; boleta igual que antes; la base rechaza nota de venta `pendiente` y boleta `interna`; anular → `no_emitido`; una sola versión de cada función. Aplicada en local.
- [x] Web: selector de 3 opciones, pie sin IGV, térmico y A4 «NOTA DE VENTA» sin QR ni IGV con «Documento sin valor tributario»; la ruta de Lucode la frena por tipo; Facturación la excluye; Historial, Cambios y Devoluciones la muestran. 7821 pruebas en verde.
- [x] **Verificado en navegador (local):** cobro con nota de venta en Trujillo → «Nota de venta NV01-000001 · Interna — no va a SUNAT», papel sin IGV ni QR, no aparece en Facturación, sí en Historial.
- [x] **Pegada en producción (2026-09-22, OK de Felipe)** por el MCP: antes, cada fragmento aparecía 1 vez y una sola versión de cada función; validación dentro de la transacción (sin sobrecargas, cambios presentes, permisos iguales, series NV01 TRU / NV02 AQP / NV03 LIM). `emitir_comprobante` quedó idéntica a local; `registrar_venta` y `anular_venta` difieren solo en comentarios (igual lógica, huella sin comentarios coincide). Humo como líder en un bloque que siempre aborta: NV01-1 `interna`, IGV 0, total = precio; al anular, `no_emitido`; nada quedó guardado (0 notas, contadores en 1).
- [ ] Fusionar la rama (PR) — pedir OK. Hasta entonces la web publicada no ofrece la nota de venta.
- [ ] Confirmar con el contador cómo se declaran las ventas con nota de venta (no lo decide el sistema).
- [x] **Hallazgo del CI (PR #286):** en una base armada desde cero, `registrar_venta`, `fn_asesoras_de_turno` y `fn_es_lider_persona` (recreadas/creadas en la 150000) quedaban ejecutables por `PUBLIC` — Postgres lo da por defecto y la regla que lo quita en producción y local vive FUERA de las migraciones. `20260922231700` lo cierra explícito. **No hace falta pegarla:** producción ya tiene `{postgres, authenticated}` en las tres (verificado); aplicada en local sin cambios.
- [ ] Aparte: pasar a una migración el `alter default privileges ... revoke execute on functions from public` que producción y local tienen a mano, para que una base nueva nazca igual.

## 🎯 Cuentas terminal por tienda (2026-09-21, ADR-0160) — fusionado a `main` (PR #281); migración entregada a Felipe para pegar
- [x] **Base:** `20260922200000_terminales_por_tienda.sql` (columna `terminal`, `agregar_terminal`, 5 capacidades `fn_puede_*` «líder O terminal», candados inyectados desde la definición real en 13 funciones + 5 disparadores + 15 políticas; `suspender_colaborador`/`reactivar_colaborador` conservan el tipo también tras D-70). `pnpm pruebas:terminales` (75 casos, en el CI) y las 20 del ADR-0143 en verde con esta migración encima.
- [x] **Web:** menú por terminal (`terminales` en `lib/menu.ts`, falla cerrado, con herencia por D-84), `puede()` / `exigirPermiso()`, la terminal de ventas aterriza en `/vender`, y Caja, Existencias, Productos, Conteo, Traslados, Facturación y Catálogo deciden por permiso; pestaña propia **«Terminales»** en `/colaboradores` (separada de Activos, pedido de Felipe) con «+ Agregar terminal». Fusionado con D-70 (alta con aprobación) y D-84 (subgrupos de menú): la terminal queda **exenta** de la cola de aprobación.
- [x] **Pegada en producción** (verificado 2026-09-22: columna y `agregar_terminal` existen, 0 terminales). Queda reemplazada en identidad por el ADR-0162. Antes, prueba en seco contra producción, solo lectura: las 23 funciones y las 15 políticas coinciden, así que no debería abortar. Luego verificar en la base y correr `datos:generar:produccion`.
- [x] ~~Felipe: crear las 6 personas en Dynamic~~ — **ya no**: el ADR-0162 reemplaza la terminal-persona por una terminal sin persona.
- [ ] **Probarlas con clics:** nadie ha visto las terminales en el navegador (entrar como terminal exige claves que yo no escribo).
- [x] **Compras de la administrativa = ADR-0184** (antes «ADR-0151», comprador de tienda): reescrito sobre los roles por módulo y subido; ver la sección «Compras por tienda» arriba.
- [ ] El combo «¿quién atiende?» pasó a ser el combo **Responsable** de todas las operaciones: ADR-0161.
- [ ] Disparador que impida mover una terminal al Taller llamando `cambiar_ubicacion_colaborador` a mano (la web no lo ofrece; la base no lo impide).
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella).

## 🎯 Ficha de clienta v1, backend (2026-09-22, ADR-0154, D-76/D-77) — hecho en local, FALTA PEGAR 1 MIGRACIÓN EN PRODUCCIÓN
Tabla `retail.clientas` + RPC `buscar_clienta`/`registrar_clienta`. La FK de `ventas.cliente_id` se repuntó desde la tabla vieja `retail.clientes`
(se retira — ~0 filas en producción, pero dos lectores activos que también se actualizaron: `fn_ventas_del_dia` y el embed de Ventas ▸ Historial).
16 pruebas en verde con un Postgres 17 desechable que corrió las 195 migraciones del repo en orden (`pnpm pruebas:clientas`).
- [ ] **Pegar en producción** la migración `20260922140000_ficha_de_clienta_v1_backend.sql` (agregar el prefijo `retail.` o `set search_path` al
      pegar en el SQL Editor — nunca en el archivo del repo) y correr `pnpm datos:generar:produccion` después.
- [ ] **La pantalla de captura del mostrador (Punto de Venta)** — la construye otra tanda de agentes. `/clientas` (esta tarea) es solo una
      pantalla mínima de verificación (lista + buscador + alta), sin engancharse a `lib/menu.ts` (otra tarea de la misma tanda lo toca).
- [ ] **Regenerar `packages/database/src/types.ts` de verdad** con `supabase gen types --local` cuando el stack local (Docker) esté arriba — esta
      sesión lo editó a mano porque Docker no estaba disponible; conviene confirmar que calza exacto.

## 🎯 Productos: las alertas de stock solo cuentan activas, «Stock total» y números que no mienten (2026-09-22, ADR-0151) — hecho en local, FALTA PEGAR 1 MIGRACIÓN EN PRODUCCIÓN
Análisis completo en `docs/pantallas/productos.md` (12 tareas; Felipe eligió la opción A y ordenó la #1 a la #4).
- [x] **#1 Descontinuados fuera de «sin stock», «stock bajo», «para pedir» y «A quién pedirle»**, y marcados con un chip en la Grilla. Migración `20260922120000` (mismas firmas; el filtro y el contador cambian juntos, con o sin filtros: 18 combinaciones en la prueba). Además «stock bajo» y «sin stock» ya no se solapan, y pedir descontinuadas + alerta de stock explica por qué no hay nada.
- [x] **#2 «Stock total»** (opción A): la tarjeta, la Tabla y una línea bajo los contadores dicen que el número es la suma de todas las sedes y el Taller. `components/NotaStockTotal.tsx`, `lib/productos-stock.ts`.
- [x] **#3 «N variantes»** cuenta variantes, no filas de stock (`count(distinct v.id)`), en la misma migración `20260922120000` (un solo archivo: se pega a mano y dos archivos sobre las mismas funciones dependían del orden).
- [x] **#4 «Sin stock» ya no es rojo** (chip neutro en la Grilla, tinta en la Tabla; se llama igual que el subtítulo y el filtro): queda un solo rojo, el de «N sin stock» del subtítulo. «Stock bajo» también se dice con palabras.
- [ ] **Pegar en producción la migración** `20260922120000_productos_alertas_solo_activas_y_variantes_distintas.sql` (ya trae `set search_path`; idempotente) y verificar con las consultas del ADR-0151. El orden con el despliegue del código no importa. Hasta entonces «no está en producción».
- [ ] **Decisión de Felipe — qué número ve una tienda (opciones B/C):** R-48 («cada líder ve solo su sede») choca con su propia decisión del 2026-09-15 («Productos suma toda la red»). Opciones y recomendación: sección 8 de `docs/pantallas/productos.md`. Bloquea la #10 y la #12 del análisis.
- [ ] Pendientes del análisis (#5–#12, sin orden de ejecución dado): fotos y rótulo «MUESTRA» (34 de 39 activos sin foto), esconder «Editar» al integrante, demanda y plazo de entrega por producto (medir antes), `p_stock_minimo` en el alta, un solo universo de variantes vigentes, «Activar» en bloque sin revalidar marca y proveedor, táctil y contraste. Y fuera de la pantalla: `fn_productos*` y las lecturas de `productos`/`variantes` sirven costo y stock a cualquier cuenta autenticada del proyecto de Dynamic (consulta Q12).
- [ ] **Revisión adversarial (3 revisores) — lo que quedó abierto a propósito, ADR-0151 «Lo que NO toca»:** Inventario (Existencias y Resumen) sigue contando descontinuadas como sin stock / stock bajo / reponer piso, y «Desactivar» en bloque no toca `variantes.activo` — decidir con Felipe si Inventario sigue a Productos; Inicio cuenta «Productos activos» sobre todas las filas (descontinuadas y el producto especial incluidos); R-48 en `15-COMO-OPERA-CAYLA.md` debe llevar la excepción cuando se decida.
- [ ] Confirmar con Q2 y Q4a del análisis las cifras de producción que salieron de una lectura de solo lectura hecha por un agente (17 o 18 sin stock activas, 0 para pedir sin descontinuadas, 163 variantes reales).

## 🎯 Roles y permisos a medida (2026-09-22, ADR-0150) — se abandonó en F1 y se RETOMÓ el mismo día (ADR-0161): ahora con acciones por módulo y con las terminales dentro
- [x] **F0:** 8 decisiones cerradas por Felipe (roles en tabla; ve/no ve por pantalla; solo el líder administra roles; Facturación no se delega; un rol por persona; piloto Inventario/Almacén; catálogos de Dynamic y retail separados; acceso a retail explícito con ubicación). Maqueta ajustada en `docs/maquetas/roles-spike-2026-09/` (bloqueo «Solo líder por ahora», Archivar rol, historial, Dar acceso, movimiento ADR-0136).
- [ ] **F1** migración (`roles`, `permisos`, `rol_permisos`, `roles_historial`, `rol_id` en `colaboradores` **y** `colaboradores_suspendidos`, `fn_tiene_permiso`, `fn_mis_permisos`) — comportamiento idéntico al de hoy. **Cambio de esquema en producción: confirmar con Felipe antes de pegar.**
- [ ] **F2** `permisosDe` de `lib/menu.ts` lee de la base; la fotografía `menu-hoy.golden.json` no debe cambiar · **F3** piloto Inventario/Almacén + pantallas «Asignar rol» y «Roles y accesos» · **F4** Catálogo · **F5** Compras (reaplicar `fn_aplicar_candado_de_dinero()`) · **F6** Producción y ubicación · **F7** limpieza de `esLider`, ARQUITECTURA y diccionario.
- [ ] Pregunta abierta para F1: ¿el alta en «Agregar colaboradores» debe proponer la ubicación desde la sede base de Dynamic? Hoy se elige a mano.
- [ ] Coordinar con el PR `claude/adr-0145-compras-permisos` antes de F5 (mismo terreno: permisos de Compras).

## 🎯 Menú a datos: `lib/menu.ts` (2026-09-21, ADR-0144) — paso 1, sin cambio visible
- [x] Árbol de datos + `menuPara` (permisos semánticos, no `esLider`) + fotografía del menú de hoy (`menu-hoy.golden.json`, capturada del `AppShell.tsx` real de `main`) + pruebas (equivalencia en 6 perfiles, invariantes, topes 8/6, rutas vivas existen). `AppShell.tsx` pierde las constantes de filas y `produccion-menu.ts` pasa a ser vista fina. `tsc`, `eslint` y 2023 pruebas en verde; 1176 renders del original y del nuevo, 0 diferencias.
- [ ] Pasos siguientes (cambian la fotografía a propósito, cada uno con el OK de Felipe): «Más» + avatar «Yo» + lupa en celular; colaborador plano; «+ Nuevo» agrupado e Inicio por perfil; nombres («… del Taller», elegido por Felipe); rebasar los PRs abiertos sobre el árbol.
- [ ] **Producción SUPERA el tope de 6: 7 hijas** (líder parado en el Taller) desde que #231 (Resumen, F6) entró sin regrupar; queda como deuda explícita con una prueba «DEUDA…» que la vigila. F7 Eficiencia obligará a regrupar (candidato: `produccion.abastecimiento`). **Quien agregue una fila al menú edita `lib/menu.ts`, no `AppShell.tsx`** (cómo, en el ADR-0144).

## 🎯 Colaboradores en dos secciones + editor de roles rediseñado (2026-09-22, ADR-0172) — hecho, sin migraciones

- [x] Spike aprobado (`docs/maquetas/colaboradores-ux-spike-2026-09/`, PR #313) y construido: Cuentas / Roles y accesos, «Por atender», Actividad en modal, `?pestana=` viejos siguen funcionando.
- [x] Roles: lista agrupada con avisos, grupos plegables + buscador, «Se suma / Se quita», vista previa con cambios, matriz «Comparar roles».
- [ ] Verlo con clics reales contra la base (solo se probó con datos de ejemplo) · decidir si «Asignar» acepta varias cuentas a la vez (la RPC `asignar_rol` es de a una).

## 🎯 Colaboradores: el alta nueva no queda operativa sin aprobación (2026-09-22, ADR-0157, D-70) — hecho en local, falta pegar en producción
Detalle, decisiones y lo descartado en [docs/adr/0157-alta-de-colaborador-requiere-aprobacion.md](adr/0157-alta-de-colaborador-requiere-aprobacion.md).
- [x] Investigado primero (no asumido): no existe trigger sobre `personas` que cree colaboradores — el alta ya era manual, pero de un solo paso (proponer = dar acceso). La baja automática por Dynamic (`p.estado = 'activo'`) ya existía desde 0006/0009 y no se tocó.
- [x] `retail.colaboradores` gana `estado` (`pendiente_aprobacion`/`activo`, default `activo` — no desconecta a nadie ya operando). El candado se sumó en las seis funciones que leen `colaboradores` (no solo las tres obvias): `fn_es_lider`, `fn_ubicacion_actual_persona`, `fn_tiene_acceso_retail`, `fn_mi_perfil`, `fn_persona_actual_resumen` (el gate de login), `fn_stock_por_sede`.
- [x] RPC `fn_aprobar_alta_colaborador` (solo líder, candado primero) y `fn_colaboradores_pendientes`. `suspender_colaborador` rechaza a alguien todavía pendiente (evita que `reactivar_colaborador` lo active sin haber pasado por aprobación).
- [x] Pantalla: pestaña «Pendientes» en `/colaboradores` con Aprobar y Rechazar. Tipos, lint y pruebas en verde; visto en el navegador con datos de ejemplo. Migración `20260922170000_alta_colaborador_requiere_aprobacion.sql`: 10 escenarios en `scripts/pruebas/colaboradores_alta_requiere_aprobacion.mjs` (Postgres 17 desechable, sin Docker), más regresión en `colaboradores_endurecimiento.mjs` y `candado_lider_caja_y_ajuste.mjs`.
- [x] `20260922170000` está en producción: `colaboradores.estado`, `fn_aprobar_alta_colaborador` y `fn_colaboradores_pendientes` aparecen en el volcado del 2026-09-23.
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella).
- [ ] **D-69 queda aparte** (líder acotado a su sede): `fn_aprobar_alta_colaborador` hoy acepta a cualquier líder, el estado real antes de D-69 — según su propia decisión, D-69 se aplica después de la salida en TRU.
- [ ] Verlo con clics en localhost con datos reales: proponer un alta, confirmar que la persona no puede operar todavía, aprobarla y confirmar que sí puede.

## 🎯 Colaboradores: rediseño con Suspender, Cambiar ubicación, Actividad e Inactivas (2026-09-22, ADR-0148) — hecho en local, falta pegar en producción
Sobre la maqueta de Felipe. Detalle, decisiones y lo descartado en [docs/adr/0148-colaboradores-suspender-mueve-la-fila-y-el-historial-solo-se-agrega.md](adr/0148-colaboradores-suspender-mueve-la-fila-y-el-historial-solo-se-agrega.md).
- [x] Pantalla: 4 tarjetas reales, pestañas Activos / Suspendidos / Inactivas en Dynamic / Actividad, buscador y filtro por rol, «Tú», menú «⋯» (Cambiar ubicación · Suspender · Quitar), alta de varias personas a la vez. Tipos, lint y 2357 pruebas en verde; visto en el navegador con datos de ejemplo.
- [x] Migración `20260922110000_colaboradores_suspender_y_actividad.sql`: probada con 67 comprobaciones en PGlite (no Docker).
- [x] `20260922110000` está en producción: `colaboradores_suspendidos` y `colaboradores_historial` aparecen en el volcado del 2026-09-23.
- [ ] Correr la prueba contra el Postgres local con Docker cuando haya (las 67 comprobaciones de PGlite no reemplazan al contenedor).
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella).
- [ ] Verlo con clics en localhost con datos reales: suspender a una persona de prueba y comprobar que **de verdad** no puede entrar (probar el ingreso con su cuenta).
- [ ] Decisión abierta: si una persona suspendida tiene una caja abierta a su nombre, hoy no se cierra sola.
- [ ] Fuera de esta tanda: la decisión de cuáles de los 9 líderes deben serlo (`docs/pantallas/colaboradores.md`, sección 10); hoy solo se cambia entrando a la base.

## 🎯 Colaboradores: auditoría y primeros arreglos (2026-09-22, ADR-0145) — pantalla hecha, falta pegar la migración en producción
Análisis completo en [docs/pantallas/colaboradores.md](pantallas/colaboradores.md) (6,5/10, Soporte, 12 tareas).
- [x] Pantalla (#1, #7, #8, #9): alta sin persona ni ubicación puestas de antemano, un solo rojo, contraste y textos corregidos. Tipos, lint y pruebas de `error-escritura` en verde.
- [x] **`20260922100000_colaboradores_endurecimiento.sql` APLICADA en producción por Felipe el 2026-09-22** (chequeo previo: 0 colaboradores sin ubicación; después: `authenticated` solo conserva SELECT y el constraint `colaboradores_colaborador_con_ubicacion` existe). Cubre #2, #4 y #5. **No pegar de nuevo.** Pendiente: refrescar el volcado de `docs/datos/generado/` y correr en local `pnpm pruebas:colaboradores-endurecimiento --en-seco` (escrita, **nunca corrida**: faltó Docker).
- [ ] Verlo en el navegador con datos reales: abrir «Agregar colaborador» (campos vacíos, botón apagado hasta elegir) y quitar a una persona de prueba.
- [ ] #3 historial de accesos (tabla que solo se agrega), #6 cambiar ubicación sin quitar y agregar, #10 «Último acceso», #11 aclarar «Sede en Dynamic», #12 decidir dónde vive el alta (retail o Dynamic).
- [ ] **Decisión de Felipe:** quiénes de los 9 líderes deben seguir siéndolo (salieron de un backfill «todos líderes», `0016`); hoy la pantalla no permite bajar ni subir a nadie.

## 🎯 Historial de ventas — Ventas ▸ Historial (2026-09-21, ADR-0147) — publicado, SIN migración (nada que pegar en producción)
- [x] `/vender/historial` (grupo Ventas, entre Caja y Cambios): todas las ventas de cualquier fecha y de todas las tiendas. Filtros en la URL (período, tienda y vendedor solo líder, estado, pago, con/sin boleta o factura), lista por día de Lima, detalle al tocar una fila (`DetalleVentaModal`), paginado por cursor, cifras del rango completo (una anulada se ve tachada y no suma). 45 pruebas de reglas + 8 de integración contra la base local (líder y colaboradora) + vista previa en 4 anchos.
- [x] Comparado con producción EN VIVO el 2026-09-21 (solo lectura): columnas, RLS, FK y funciones que lee, idénticas. Producción tiene 16 ventas.
- [x] **Look Atelier** (2026-09-21, pedido de Felipe): misma línea que Cambios/Devoluciones/Caja y filtros como Catálogo; el trazo del período dibujado como un hilo, mezcla de pagos, racimo de miniaturas del color de cada prenda y total exacto por día; **el pulso va en un lateral pegajoso (desde 1280 px) para que las ventas sean lo primero** — pedido de Felipe tras ver el primer gráfico de ancho completo. Verificado con la sesión del panel sobre la base LOCAL y una vista previa en 4 anchos. Falta verlo con clics reales y con una venta anulada de verdad (la base local no tiene).
- [ ] **Verlo con clics reales** (líder e integrante, panel visible): con la sesión del panel sobre la base LOCAL ya se recorrieron filtros, cursor y cifras contra SQL leyendo el HTML del servidor (23 ventas de prueba, S/ 2,936.70; producción tenía 16 y ahí todavía no se ha visto); falta lo que pide hidratación: cambiar filtros con el mouse, paginar, tocar una fila, el hover del pulso y una venta anulada de verdad (no hay ninguna).
- [ ] Búsqueda por boleta / DNI / clienta / prenda (la lógica existe en `ventas-v2.ts`: `buscarVentas`, hoy interna). Y enlaces «Ver historial →» desde «Ventas de hoy» (Caja, Punto de Venta, Facturación) y desde el detalle de un cierre (`?caja=`) — esperar a que salgan los rediseños en curso de esas pantallas.
- [ ] Solo si un rango supera 1,000 ventas (hoy no): RPC de agregados + migración (requiere OK). **Decisiones de negocio resueltas el 2026-09-21** (ADR-0147): cada quien ve su tienda y el líder todas; no se incluyen ventas de antes del ERP.
- [ ] Deuda ajena que apareció: `fn_ventas_del_dia` no lee `ventas.estado` — una anulada de hoy cuenta completa en «Vendido hoy» (ya en la lista de Facturación).

## 🎯 Candado de líder: solo el líder cierra la caja y ajusta stock (2026-09-21, ADR-0143) — APLICADO EN PRODUCCIÓN

## 🎯 Filtro de búsqueda especial (2026-09-21, anexo del ADR-0071) — Existencias, Análisis y Movimientos
- [x] `lib/filtro-busqueda-especial.ts` (`crearIndiceBusquedaEspecial`, `interpretarBusquedaEspecial`, `filtrarConBusquedaEspecial`) + su prueba (130, sobre `filtro-busqueda-especial.casos.json`): términos en cualquier orden sobre nombre/SKU/código/color/talla, todos deben cumplirse; una talla suelta que existe en los datos se compara solo con la talla, los colores con sus equivalentes (blanca/blanco…); plurales, códigos sin guiones y palabras que no filtran («talla», «de»…); el texto pisa el filtro visual de su dimensión y la pantalla avisa. Existencias lo usa en `InventarioPanel.tsx`.
- [x] Análisis (Desempeño y Comparar › Detalle): `aplicarAlcance` usa el filtro; `resumen-busqueda.ts` quedó como adaptador (la categoría cuenta como nombre). Verificado en local con «blusa rosado m», «blusas rosadas», «camisas» (categoría), «blusa talla l», «vestido rosada s». Sin migraciones.
- [x] Movimientos, en SQL: migración `20260921153700_movimientos_busqueda_especial.sql` (nuevo cuerpo de `fn_movimientos_variantes` + `fn_busqueda_singulares` + `fn_busqueda_formas_color`), aplicada en el Postgres local; `pnpm pruebas:fn-movimientos-busqueda-especial` (146) lee el mismo archivo de casos que TypeScript.
- [ ] **Aplicar `20260921153700` en producción** (proyecto `cayla-dynamic`, schema `retail`; el archivo ya trae los nombres con `retail.` y su `set search_path`). Se intentó el 2026-09-21: el clasificador de permisos bloqueó incluso el ensayo revertible. Al aplicar: ensayo en transacción que se revierte, `apply_migration` con el texto exacto del archivo y verificar `md5(prosrc)` = `fn_busqueda_formas_color` 2fc226c03605dbc40c6fcf30b4a972ce · `fn_busqueda_singulares` dc36c2913cee31fe22d7440668c2f783 · `fn_movimientos_variantes` f991f653cfd38dca86d1f2dc165655bd (hoy `fn_movimientos_variantes` en producción es 3d0f876f8bc83ccd399106e1b6a67ffd, igual que en local antes del cambio). Es compatible hacia atrás: todo lo que la búsqueda anterior encontraba se sigue encontrando.
- [ ] Al aplicarla, cambiar el texto guía de `FiltrosMovimientos.tsx` (hoy «Prenda, código, barras o referencia…») a «Prenda, color, talla, código… ej. blusa rosado m» y su `aria-label`. Se dejó fuera del merge a propósito: no prometer en pantalla lo que producción aún no hace.
- [ ] Sumar `pruebas:fn-movimientos-busqueda-especial` al job `pruebas-postgres` de `.github/workflows/ci.yml`.
- [ ] Aplicarlo a los demás buscadores —la misma función; cada pantalla dice cómo leer sus campos—: Traslados, Conteo (buscador y sugerencias) y Vender/Cambios/Devoluciones. En la caja hoy manda `filtrarPrendasV2`, que a propósito no separa palabras (su prueba lo fija): cambiarlo es una decisión aparte.
- [ ] Decidir dos reglas: (a) los códigos de barras se buscan parcial (antes, exacto); (b) dos tallas o dos colores escritos a la vez se exigen los dos (no hay «M o L»).
- [ ] La marca (ya se busca en la caja, ADR-0109) no entra en Existencias: `FilaStock` no la trae.

## 🎯 Análisis: rediseño con la guía oficial (2026-09-22, ADR-0171) — construido y verificado con datos de muestra; sin migración
Demo y decisiones: [docs/maquetas/analisis-rediseno-2026-09/](maquetas/analisis-rediseno-2026-09/README.md).
- [x] Felipe eligió: Desempeño con la misma anatomía que Comparar (A), aviso de exactitud en franja y sede sin datos con salidas.
- [x] «Cambio relevante» por reglas: `lib/resumen-lectura.ts` + `resumen-lectura.test.ts` (7 reglas en orden), en las dos tablas.
- [x] Desempeño: 4 cifras + 3 gráficos (`ResumenDesempenoGeneral`, agregados en `resumen-desempeno.ts`), banda de sell-through en la cabecera de la tabla.
- [x] Comparar: una sola lectura (sin «Vista general / Detalle»), cifras A → B, 3 gráficos en una fila, la dona filtra la tabla y baja hasta ella.
- [x] Franja de exactitud (`ResumenBanner`) y vacío con salidas (`ResumenVacio`, también para el Taller).
- [x] Colores de gráfico `--color-grafico-*` (verde/neutro/ámbar claro), validados como relleno vecino.
- [ ] **Verlo con clics reales contra la base** (local o producción): en esta sesión no había Docker; se verificó con los componentes reales y datos de muestra.
- [ ] En el celular, la columna «Lectura» queda a la derecha de la tabla, que se desplaza dentro de su tarjeta. Evaluar si en el celular la lectura debe ir bajo el nombre del producto.
- [ ] Decisión global aparte: lateral oscuro de la guía vs lateral claro de hoy (afecta a todo el ERP).

## 🎯 Análisis: un solo selector de fechas (2026-09-21, anexo del ADR-0138) — hecho y verificado en local; en `main`
- [x] Período A, Período B y «Personalizado» de Desempeño abren el mismo `PopoverRango` (`ResumenControles.tsx`): Desde/Hasta en dd/mm/aaaa ya cargados, foco en «Desde», Tab, Enter o «Aplicar», calendario de ayuda, errores en línea; los atajos de A y B (período anterior / año pasado; 7-30-90 días / este mes) van dentro. `CampoFecha` gana el modo opt-in `estricto` + `revelarError`. Verificado en local (A 09/07→09/08, B 09/05→09/06, Personalizado 01/08→01/09, fechas inválidas, presets, 320–430 px). Sin cambios de base ni de `lib/`.
- [ ] Autoformato de `CampoFecha` con día o mes de un dígito: «9/7/2026» queda «97/20/26» (solo entiende dd/mm/aaaa con ceros). Completar con 0 al teclear «/» — toca todos los campos de fecha del ERP; decidir con Felipe.
- [ ] Felipe dijo «UI siempre en DD/MM/YYYY»: el selector y sus avisos lo cumplen, las píldoras de Comparar conservan «desde 9 jul. hasta 9 ago.» del Figma. Decidir si pasan a dd/mm/aaaa (cambia `textoPildoraPeriodo`).
- [ ] El selector no se cierra con Escape ni con clic afuera (solo «Cancelar»/«Aplicar») y al cerrar el foco no vuelve a la píldora o al chip que lo abrió.

## 🎯 Producto / variante: una sola celda en Existencias y Conteo (2026-09-21, anexo del ADR-0071) — hecho y verificado en local; en `main`
- [x] `ProductoVarianteCelda` (`ui/PrendaCelda.tsx`) en Existencias, «Conviene contar primero» y el detalle de un conteo; encabezado «Producto / variante» en Existencias y en ese detalle. `lib/apariencia-variantes.ts` trae foto principal + `colorHex` con la regla de Existencias (degrada sin tumbar la pantalla); `fotoPrincipal` pasó a `inventario-reglas.ts` (+4 pruebas); `LineaConteo` gana `colorHex` y `fotoUrl`. Sin cambios de base. Verificado en el navegador integrado (320–1920 px, fotos sembradas y retiradas, consulta rota a propósito).
- [x] ~~Traslados › detalle sigue con la celda de texto de `PrendaCelda`.~~ Cerrado el 2026-09-22 (ADR-0173): usa `ProductoVarianteCelda` con color y foto. (2026-09-21: Movimientos, Desempeño y Detalle por producto ya usan `ProductoVarianteCelda` con el encabezado «Producto / variante»; Movimientos muestra el color en texto y sin foto —su dato no trae `colorHex` ni `fotoUrl`—, y las filas de Análisis tampoco traen foto. Sumarlos a sus consultas si se quiere la cápsula y la miniatura.)
- [ ] Conteo abierto (buscador, líneas ya contadas y modal «Revisar antes de cerrar») sigue en texto plano: es un flujo de escaneo donde la densidad importa y solo se ve con un conteo abierto (escribe en la base). Es la misma celda si se quiere. Para contar, la foto del COLOR (la prenda que se tiene en la mano) ayudaría más que la principal del producto; hoy Existencias usa la principal.
- [ ] Las pestañas de Inventario tienen scroll horizontal de página a ≤ 360 px (7 px a 360, 47 a 320), también en Movimientos y Traslados: causa sin identificar, no viene de la celda. (2026-09-21: la franja de pestañas se quitó; falta comprobar a ≤ 360 px si el scroll de página desaparece con ella.)

## 🎯 Candado de líder: solo el líder cierra la caja y ajusta stock (2026-09-21, ADR-0143) — hecho en local, falta pegar en producción
- [x] Migración `20260921120000` (renumerada desde `20260921110000` el 2026-09-21 por chocar con Por pagar de Producción, que ya estaba en producción; `cerrar_caja` y `registrar_movimiento` exigen `fn_es_lider()`, 42501), prueba `pruebas:candado-lider` (20/20; 9/20 contra las funciones de producción sin candado), escenario C2 de `caja:verificar` ajustado, y cinco botones escondidos a quien no es líder (Caja, Punto de Venta, Existencias, Productos en lista y en grilla).
- [x] **Aplicado en producción el 2026-09-21** con ok de Felipe: PR #218 fusionado y desplegado, sonda sin escrituras, ensayo revertido, `apply_migration` (registrada como `20260921152907`) y verificación por catálogo y con un colaborador, un líder y `anon` reales (pasos en el ADR-0143).
- [ ] Decisión operativa de Felipe: quién cierra la caja cuando no hay un líder en la tienda (hoy 9 líderes con alcance global, ninguno fijo a una tienda; 3 cajas abiertas, probablemente de prueba).

## 🎯 Carga inicial de proveedores (2026-09-20, ADR-0140) — APLICADA EN PRODUCCIÓN
- [x] Hoja depurada a 74 fichas / 75 marcas / 75 vínculos; revisión adversarial; ensayo contra producción con retroceso (2→76, 1→76, 1→76; base intacta).
- [x] **Aplicada el 2026-09-20** (76/76/76; 74/74 fichas y 75/75 vínculos idénticos, auditado desde afuera). El editor confirmó antes del paso 6 (`42P01 _antes`): solo falló la autocomprobación. **No volver a pegar.** Material privado: `~/Developer/cayla-cargas-privadas/proveedores-2026-09/`.
- [ ] Verla en el navegador: `/proveedores` (74 fichas nuevas, chip «Sin datos de pago») y `/productos/marcas` (75 marcas vinculadas).
- [ ] Próxima carga masiva: **una sola sentencia `do $$`** (atómica por sí sola); no depender de `begin/commit` ni de tablas temporales entre sentencias.
- [ ] Verificar en SUNAT los RUC 10 de mayor gasto y los RUC 20 con aviso (lista en `03-pendientes-privados.md`); pedir el RUC vigente a los que entraron sin RUC.
- [ ] **Proponer (requiere aprobación + ADR propio):** una sola migración con `proveedor_principal_id` (razones sociales relacionadas: cada RUC sigue siendo fila; cierra el choque de `unique (proveedor_id, serie, numero)`) y `direccion`. Hoy `compras` no guarda el RUC del emisor; hay 0 compras, así que hay que decidirlo antes de la primera factura de un RUC relacionado.
- [x] Proveedores: **buscar y mostrar por marca** (2026-09-20, sin migración): lista, detalle rápido, ficha y combo de nueva compra; lectura secundaria que degrada a `null` (ADR-0142). Verificado en el navegador con datos inventados; pendiente verlo con los datos reales. **No cubre** los buscadores de Comprobantes y Recepciones (filtran el proveedor por nombre dentro de sus RPC: requiere migración).
- [ ] Higiene de git: commit local sin publicar `99059734` (rama `claude/sweet-gould-fe63b4`) con un volcado anterior de esta hoja. No subir esa rama; no borrar con `gc --prune=now` (destruiría otro commit sin publicar y el reflog de los demás worktrees).

## 🎯 «Ajustar inventario» se abría vacío: seguía pidiendo `variantes.talla` (2026-09-20)
- [x] `AjustarInventarioModal.tsx` pedía la columna `variantes.talla`, que la taxonomía cerrada eliminó (ADR-0095, `20260917100500`); la base respondía «column variantes.talla does not exist» y el modal quedaba vacío desde «Ajustar» en Existencias y Productos. Ahora usa `talla:tallas ( valor )` sin cast (si vuelve a pedir una columna inexistente, `tsc` falla — comprobado con una mutación) y arma las filas en `lib/ajuste-reglas.ts` (12 pruebas), con las tallas en orden de curva. Reproducido a nivel de Postgres (esquema real, solo lectura); barrido de `apps/web`: ningún otro select ni filtro pide `talla` a secas sobre `variantes`, y los otros 4 `as unknown as` de selects solo angostan tipos.
- [ ] Verlo en navegador con datos reales (sin Docker no hay PostgREST local): abrir «Ajustar» en un producto con varias tallas y ver que salgan ordenadas y con su stock. En producción la columna ya estaba borrada desde el 2026-09-17 (ver 🎯 Taxonomía de variante), así que el modal llevaba roto desde entonces — según este BACKLOG, no consultado en vivo.

## 🎯 Separaciones (Fase 2 de Apartar stock) — análisis y demo funcional (2026-09-22), sin construir

Separar una prenda con adelanto, entregarla cobrando el saldo, vencer con aviso y liberar sola, con el adelanto «en custodia» fuera de
los ingresos hasta la entrega. Análisis, referentes y modelo propuesto: [docs/maquetas/separaciones-2026-09/ANALISIS.md](maquetas/separaciones-2026-09/ANALISIS.md);
demo: `docs/maquetas/separaciones-2026-09/demo.html`.

- [x] Investigación (Lightspeed, Shopify, contabilidad, SUNAT, Indecopi) y demo funcional con reloj simulado.
- [x] Decisiones D1–D4 (Felipe, 2026-09-22): boleta de anticipo, monto libre, 100% devuelto preferentemente por Yape/Plin/transferencia (se registra al separar), una sola extensión de +7.
- [ ] **Felipe valida las funciones en la demo** y decide D5 (quién libera y registra la devolución).
- [x] Demo de interfaz con el lenguaje visual del ERP (`docs/maquetas/separaciones-2026-09/interfaz.html`, 2026-09-22): lateral con «Separaciones» bajo Ventas, Separar / Entregar / Todas, modales ADR-0136. Falta que Felipe la revise.
- [ ] Confirmar con Lucode (apisunat.pe) la emisión de anticipo + regularización, y con el contador el tratamiento (pasivo 122 + IGV al cobrar).
- [x] Requisito: ADR-0141 (`20260920160000_apartar_stock.sql`) **aplicada en producción el 2026-09-22** (con OK de Felipe; Claude, vía SQL en una transacción): cuerpos de función idénticos al repo por md5, verificador en 0 filas, stock intacto (153 filas).
- [x] **Base de datos (2026-09-23, ADR-0166):** `20260923090000_separaciones.sql` — `separaciones`, `separacion_items`, `separacion_pagos`,
      `separacion_correlativos`; 9 funciones (`separar_prendas`, `entregar_separacion`, `extender_separacion`, `liberar_separacion`,
      `registrar_devolucion_separacion`, `fn_vencer_separaciones`, `buscar_separaciones`, `resumen_separaciones`, `fn_verificar_separaciones`).
      46 pruebas SQL (`pnpm pruebas:separaciones`, en CI), 4 mutaciones detectadas, regresión en verde. `cerrar_caja` no se tocó: el efectivo del
      adelanto entra como ingreso de caja. **Aplicada en producción el 2026-09-22** (con OK de Felipe; Claude, vía SQL en una transacción): cuerpos de función idénticos al repo por md5, verificador en 0 filas, stock intacto (153 filas).
- [x] **`20260923090000_separaciones.sql` pegada en producción** (2026-09-22, después de ADR-0141): 10 funciones con md5 idéntico, `fn_verificar_separaciones` en 0, `venta_pagos` acepta `anticipo`.
- [ ] **Series faltantes en producción:** Lima (LIM) solo tiene `NV03`: un apartado en Lima falla al emitir la boleta de anticipo hasta que se registre su serie de boleta/factura. Ninguna tienda tiene serie de nota de crédito: la devolución se registra igual, con el aviso «La nota de crédito queda pendiente».
- [ ] **Transmitir anticipos a SUNAT:** hoy `motivoParaNoTransmitir` los frena (boleta de anticipo y la final que lo deduce). Falta armar el payload
      de anticipo/regularización en `lib/lucode.ts` y probarlo en el sandbox; confirmar con el contador el caso del adelanto del 100% (no se emite
      segundo comprobante).
- [ ] **D5 por confirmar:** extender/liberar/devolver hoy exigen `fn_puede_gestionar_caja()` (líder o terminal de ventas).
- [x] **Pantallas (2026-09-23):** `/vender/apartados` con Apartar, Entregar y Todos; en pantalla se llama **Apartados** (código APT-, boleta
      «Anticipo por apartado»). Probado en el navegador contra Postgres real. Menú: Cambios y Devoluciones pasan al subgrupo «Posventa».
- [x] **Felipe aprobó el subgrupo «Posventa»** (2026-09-22) en el menú (el golden se cambió a propósito; si no lo quiere, la alternativa es sacar
      Apartados del lateral y dejarlo como pestaña del Punto de venta).
- [x] **Buscador con foto en Apartar (2026-09-22, ADR-0168):** búsqueda en vivo por nombre como el Punto de venta, con miniatura por fila; agotadas atenuadas al final con «N en el almacén» o dónde más hay. `FotoPrenda` de Apartados sale optimizada (≈5 KB en vez de ≈90 KB por foto). Demo: `docs/maquetas/separaciones-2026-09/buscador.html`.
- [ ] **Llevar el buscador con foto al Punto de venta** si Felipe lo pide (hoy decidió solo Apartados); la pieza a mover es la de `ApartarVista` + `FotoPrenda`.
- [ ] **En Caja**, la tarjeta «En custodia» (hoy vive en Apartados → Todos) y `anticipo` en `NOMBRE_METODO`/historial de ventas.
- [ ] **Existencias** sigue ofreciendo «Apartar» de ADR-0141 (sin adelanto): decidir si se quita o se deja como reserva rápida.
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella); las 4 tablas de separaciones son de Colibrí en el aviario.

## 🎯 Apartar stock — Fase 1: reserva física con clienta y fecha límite (2026-09-20, ADR-0141) — en producción desde el 2026-09-22

Una prenda apartada para una clienta ya **no se puede vender**: sigue contando en el conteo físico, pero deja de estar *disponible*. Existencias tiene la
tarjeta «Apartados» (lo vencido en rojo; **no se libera solo**), la acción «Apartar» por fila y «Liberar» (solo quien apartó, o una líder). Detalle,
decisiones, lo que se descartó y la verificación en [docs/adr/0141-apartar-stock-reserva-fisica.md](adr/0141-apartar-stock-reserva-fisica.md).

- [x] **Motor, tabla y RPC** (`20260920160000_apartar_stock.sql`): `stock.cantidad_apartada`, `apartados`, `apartar_stock`, `liberar_apartado`,
      `listar_apartados`, `fn_verificar_apartados`; `fn_aplicar_movimiento` (venta, traslado y ajuste miran lo disponible) y `recalcular_stock`.
      Verificado con 41 pruebas SQL + 54 de regresión + carreras con COMMIT (hasta 120 conexiones) + prueba de mutación.
- [x] **`20260920160000_apartar_stock.sql` pegada en producción el 2026-09-22, antes de desplegar la web** — los 6 cuerpos con md5 idéntico al repo, `fn_verificar_apartados` en 0. (Existencias lee la columna nueva). Entera, en el SQL Editor de
      cayla-dynamic; es re-ejecutable. Pasos y verificación en el ADR («Cómo se pega en producción»).
- [ ] **Probarlo en el navegador con datos reales, como colaboradora y como líder.** Esta sesión no tenía base de datos: se vieron los componentes reales
      con datos de ejemplo (formulario, errores, vencidos, caída de red), pero no el ciclo completo apartar → ver → liberar contra Postgres.
- [ ] **Fase 2 — el adelanto ligado a Caja.** Decidido con Felipe: ingreso de caja «adelanto de apartado»; si se cancela o vence, se devuelve (egreso); sin
      comprobante hasta la venta final por el total. Incluye que **`registrar_venta` consuma la reserva en una sola transacción** (hoy: liberar con motivo
      «entregada» y cobrar en Vender; entre un paso y otro hay una ventana de segundos). Es lo más delicado: toca la RPC más sensible del sistema.
      **Antes de usarlo con clientas reales, el contador debe validar el tratamiento tributario de un anticipo de mercadería.**
- [ ] **Lecturas que todavía muestran stock físico** (el motor igual rechaza lo no disponible): `fn_stock_por_sede` («dónde más hay»), el listado de Productos
      (`fn_productos`) y los resúmenes de Inventario.
- [ ] **Conteo con apartados:** si un conteo encuentra menos prendas que las apartadas, el cierre falla con un mensaje claro; falta el flujo «resolver el
      apartado desde el conteo».
- [ ] **Anatomía del Producto — lo que sigue pendiente (verificado 2026-09-20; ninguna pieza está en producción).** Construidas y sin PR: estado de
      publicación (`claude/producto-estado-publicacion-e3c13e`, pusheada), país de origen/fabricante/material (`claude/producto-etiquetado-legal-16434c`,
      pusheada), ciclo de vida por categoría (`claude/categoria-ciclo-vida-daa78e`, **solo en un disco local**). Nunca construidas: calidad de la prenda
      (`stock_calidad`, como registro append-only — no como contador editable), historial de cambios del producto, y lead time / pedido mínimo del proveedor.
      **Campañas: descartada** — `main` la resolvió (ADR-0107/0108, la etiqueta de campaña lleva el %). Ojo: esas ramas traen ADR con número repetido
      (0094 y 0097) y `main` ya va en 0141.
- [ ] **Retirar la lectura tolerante** de `getStockPorUbicacion` (`inventario-v2.ts`, reintento sin `cantidad_apartada` ante `42703`) y de `getApartadosAbiertos`
      (`apartados.ts`, `[]` ante `PGRST202`) **cuando la migración esté verificada en producción**. Existen solo para que una web que sale antes que el SQL no
      tumbe la caja; después son código muerto.
- [ ] **Vender y Cambios dicen «agotada» / «Sin stock aquí»** de una prenda cuyo piso está todo apartado (se ve en el piso, pero es de una clienta): falta decir
      «apartada para una clienta». `PuntoDeVenta.tsx` lo comparte con otra sesión, por eso no se tocó aquí.
- [ ] **La reposición sugerida desde Resumen** (`ReponerPisoModal` con `cantidadInicial`) todavía parte del stock físico del almacén; en Existencias ya se corrigió.
- [ ] **El mensaje del cierre de conteo** ya nombra el SKU, pero la vista previa (`previsualizar_cierre_conteo`) no avisa de los apartados: quien cuenta no ve
      que hay prendas reservadas que también hay que contar.
- [x] 🩹 **CORREGIDO en el PR #210 (2026-09-20; ver la sección «Ajustar inventario» más arriba; la taxonomía es ADR-0095, no 0075).** **`AjustarInventarioModal.tsx` selecciona `variantes.talla`, que ya no existe (es `talla_id`)** desde la taxonomía cerrada (ADR-0075): «Ajustar
      inventario» probablemente falla al cargar las variantes. No se tocó aquí; verificar con datos reales.

---

## 🎯 Módulo «Notas de crédito» aparte de Recepción (2026-09-19) — spike listo, sin implementar
- [x] Spike visual: `docs/maquetas/notas-credito-spike-2026-09/notas-credito-vivo.html` (+ README con el mapa pantalla → datos/RPC reales, lo que requiere migración y 5 decisiones D1–D5 con Ganas/Pagas). Verificado abriéndolo en el navegador; el movimiento en curso lo debe juzgar Felipe a ojo.
- [ ] Decisiones de Felipe D1–D5 (README del spike). Recomendaciones: registrar la nota solo en el módulo; «reclamada» en segunda fase; «Aplicada» deducida por FIFO; urgencia a 14 días; adjunto ligado a la nota.
- [ ] Implementar: ruta `/compras/notas-credito` (solo líder, ADR-0126); función de lectura del tablero (migración); sacar `NotaCreditoCierre` de `RecepcionEnvio` dejando un enlace; aviso: `recibir_envio` puede seguir aceptando `p_notas_credito`.

## 🎯 Notas de crédito: módulo propio (2026-09-19, ADR-0142) — APLICADA EN PRODUCCIÓN, falta fusionar el código
- [x] Módulo `/compras/notas-credito` (solo líder) con el diseño y el movimiento del spike `docs/maquetas/notas-credito-spike-2026-09/`: tablero, registro con buscador de facturas (documento, proveedor y monto), destino del dinero (devolver ahora / queda a favor, en una sola transacción), detalle y saldos a favor.
- [x] Notas de crédito FUERA de Recepción (`RecepcionEnvio`, `EnvioRecibido`, `recibir/page.tsx`, `envio-reglas`) y fuera del detalle (`AccionesFaltantes`): queda el chip «Se reclama en Notas de crédito ↗». `recibir_envio` sigue aceptando `p_notas_credito`; la pantalla lo manda vacío.
- [x] **`20260919211000_notas_credito_modulo.sql` pegada en producción por Felipe (2026-09-20/21)**. Verificado por Claude el 2026-09-21 contra la base: las 6 funciones con el md5 idéntico al local y `compra_adjuntos.nota_credito_id` presente. PR #206 fusionado y volcado refrescado el 2026-09-21: `funciones-produccion.txt` pasó de 185 a 196 firmas (las 3 del módulo más 8 que otras sesiones habían dejado sin anotar: comprobantes y proveedores de Producción) y `compra_adjuntos.nota_credito_id` entró al diccionario. `datos:comparar` solo marca las 3 funciones de «apartar stock» (ADR-0141), que no están en producción todavía — ajeno a este módulo.
- [ ] Fase 2 (D2): «reclamada al proveedor» (tabla `compra_nota_reclamos`) y el recordatorio a los 14 días. Decidido: primero usar el tablero una semana.
- [ ] Subir el adjunto de la nota desde el módulo: `compra_adjuntos.nota_credito_id` ya existe y `registrar_adjunto_compra` lo acepta; falta el flujo de archivos en la pantalla.
- [x] Piezas huérfanas **borradas el 2026-09-23** (OK de Felipe): `components/NotaCreditoCierre.tsx` y, en `lib/recepciones-reglas.ts`, `notaDelBloque`, `efectoCierre`, `igvDeMonto`, `montoNotaSugerido`, `textoReparteNota` (+ tipos `Efecto`, `NotaBorrador`). `disponibilidadNota` **NO** estaba huérfana (la usa `estadoNotaFaltante`, que llama el detalle del comprobante) y se quedó, igual que `tasaIgv`, `reparteNota` y `MARGEN_NOTA` (los usa el módulo de notas de crédito).
- [ ] «Aplicada» se deduce por FIFO (D3): si algún día se quiere exacta, hay que guardar de qué nota salió cada uso del saldo — toca funciones que mueven dinero, por eso no se hizo.

## 🎯 Caja: tareas de la auditoría `docs/pantallas/caja.md` (2026-09-21)
- [x] #2 El modal de movimientos recibe el rol y no ofrece «Ajuste» a quien no es líder (reglas puras en `lib/caja-panel-reglas.ts`, `motivosDeMovimiento`). Solo esconde: el candado real es la #1.
- [x] #3 Franja de aviso cuando la caja lleva 18 h o más abierta (`turnoLargo`, `AvisoTurnoLargo` en `CajaAbiertaPanel.tsx`). **Falta decidir con Felipe:** el umbral (18 h es propuesta) y quién cierra si no hay líder en la tienda.
- [x] #6 Modal sin valores prellenados, foco en el monto, «S/», sin spinner, «Ingreso» en verde; referencia obligatoria en «Depósito bancario» y «Otro» (solo en el navegador; la base aún no lo exige).
- [x] #10 Movimientos manuales en hora de Lima (`diaYHoraLima`).
- [ ] #1 Candado real en `registrar_movimiento_caja` (vocabulario cerrado, `es_ajuste` del servidor, referencia obligatoria; reconciliar D-13 con ADR-0056) — **migración en producción: confirmar con Felipe**. Espera su decisión sobre permisos.
- [ ] #5 Replantear «Ajuste de caja» (A o B, §8 de la auditoría) — decide Felipe.
- [ ] #4 Tarjetas, dona, lista y ritmo miden el turno; `getResumenCaja` excluye anuladas — M
- [ ] #7 El cierre muestra al líder los movimientos manuales del turno con su autor — S
- [ ] #8 Historial de cierres con la diferencia visible, filtro por sede y paginación — M
- [ ] #9 Movimientos de caja sin internet y chip de sincronía honesto — M
- [ ] #11 Piel restante del modal: desplegable propio y tope de 2 rojos en el tablero — S (bajo valor)
- [ ] #12 Borrar `CajaGraficos.tsx`, `senalCaja`, `tendenciaCierres7Dias` (sin uso) y pruebas de `getResumenCaja` — S (bajo valor)
- [ ] Verificar en producción si `cajas_update` permite reescribir un cierre ya hecho (D1/D4 de la auditoría, nunca corridas) — S

## 🎯 Caja: «Ver todo», detalle de venta y reimpresión — ticket y A4 (2026-09-19, ADR-0137)

Felipe pidió que en «Movimientos recientes» hubiera un «Ver todo» y que una venta abriera su detalle
con reimpresión de la boleta, en ticket y en A4 con el diseño de CAYLA. Spec y plan en
`docs/superpowers/`; decisiones en ADR-0137.

- [x] **Vuelto guardado** — `venta_pagos.recibido` (candado: solo efectivo, nunca menor que `monto`)
      y `registrar_venta` que lo lee, misma firma. Vender lo manda (`pagosParaRpc`) y la cola offline lo
      conserva. Verificado en local con ventas reales. **Ventas anteriores: sin vuelto, no se inventa.**
- [x] **«Ver todo» + detalle de venta + ticket con vuelto** — modales apilados, «Reintentar» si falla la
      lectura, y solo se reimprime lo que tiene validez (`puedeImprimir`).
- [x] **Boleta / factura A4** — desde nuestra fila `comprobantes`, con la estructura de la de Alegra y el
      diseño de CAYLA. Verificada con el PDF real del motor de Chrome (1 hoja A4; 3 hojas con 45 líneas).
- [x] **Migración `20260919210000_venta_pagos_recibido.sql` aplicada en producción** (la pegó Felipe antes de
      fusionar #195/#196; verificada el 2026-09-19: columna y candado presentes, una sola `registrar_venta`
      con el cuerpo idéntico al del repo, `EXECUTE` solo para `authenticated`/`postgres`). Para sus ventas
      anteriores `recibido` queda vacío y el ticket sale sin línea de vuelto.
- [x] Hecho: volcado refrescado el 2026-09-23 (94 tablas, 300 funciones, copia idéntica a producción verificada por huella); `venta_pagos.recibido` ya está en el diccionario.
- [ ] **Confirmar con la primera venta en efectivo**: que `venta_pagos.recibido` se guarde y el detalle de esa
      venta muestre «Recibió … · Vuelto …» (al 2026-09-19 aún no había ninguna con `recibido`).
- [ ] **Probar la impresión de verdad**: la térmica y una impresora A4, con el diálogo real. Solo se
      verificó el PDF del motor de Chrome, no el papel.
- [ ] **Guardar la dirección de la clienta para la factura** — hoy el A4 imprime la línea «Dirección»
      en blanco. El padrón de RUC sí la trae; falta una columna en `comprobantes` y llevarla a Lucode.
- [ ] **Punto de venta (`/vender`): misma cabecera y entrada que Caja** — hoy solo dice «Cargando caja…».

## 🎯 Producción como módulo propio, con su abastecimiento, conectado con Compras (2026-09-19, ADR-0133 — propuesto)

Plan completo en [`docs/PLAN-PRODUCCION.md`](PLAN-PRODUCCION.md); diseño de referencia en `docs/maquetas/produccion-modulo-2026-09/`.
**Nada de esto está construido:** solo el spike y el plan (verificado en el navegador). Cada fase = un PR.

- [x] **F0 · Preparación (2026-09-19):** `origin/main` fusionada (rama al día), ADR-0133 reservado (el 0130 —renumerado tras chocar con el menú plegable en `main`—, 0131 y 0132 los tienen otras ramas), spike y plan commiteados.
- [x] **D-A (menú) — REVERTIDA el 2026-09-20 por Felipe:** Producción se ve **solo parado en un Taller, líder incluido** (por el tipo de la ubicación activa). Rigió el 2026-09-19 lo contrario (el líder la veía desde cualquier ubicación). Solo menú y páginas, sin esquema; Compras no cambió. Ver nota en ADR-0133.
- [ ] **Pendiente derivado de D-A (2026-09-20):** el enlace del Resumen de Inventario a `/produccion` (`lib/resumen-acciones.ts`, paso «revisar abastecimiento» de una prenda que se repone fabricando) ya no lleva a las Órdenes cuando el líder mira desde una tienda: aterriza en el aviso «cambia al Taller». Funciona, pero es un paso de más — decidir si el Resumen debería mandar a la orden con la ubicación ya cambiada, o si basta el aviso.
- [x] **D-H (2026-09-19, decisión de Felipe contra mi recomendación):** Producción tiene su propio directorio de proveedores y sus propios Comprobantes / Por pagar / Recibir. Compras no se toca.
- [ ] **Decisiones de Felipe que siguen abiertas (bloquean F4 y F7):** **D-I** (vista consolidada de deuda e IGV de los dos módulos) ·
      D-E `maquila_referencias` · D-F `gastos_taller` · D-G costos de insumos solo líder.
- [x] **F1 · Navegación (2026-09-19; corregida el mismo día: Producción y Compras son módulos distintos)** — `AppShell.tsx` (grupo «Producción» = Proveedores, Comprobantes, Recibir mercadería, Por pagar, Órdenes;
      «Compras» ya no existe), `lib/produccion-menu.ts` (+ test), `/produccion/ordenes` (contenido movido) y `/produccion` → redirige.
      Sin esquema. Verificado en navegador como líder desde Tienda Lima; tipos, lint y 1178 pruebas en verde.
      **Pendiente de probar con sesión real:** colaborador del Taller y de tienda. **Diferido a F6:** insignias del menú.
- [x] **F2 · Órdenes (2026-09-19):** tablero por etapa, panel (etapas, matriz talla×color, costo, cierre por variante), muestras, terminadas y
      anuladas conservadas; `OrdenesProduccionV2.tsx` retirado. Sin esquema. **El formulario de nueva orden sigue pidiendo tela y avíos hasta
      F3** (quitarlos antes deja el costo falso). Verificado en navegador como líder; 1344 pruebas. **Pendiente:** colaborador del Taller;
      costos de `producciones` visibles al colaborador por la API (entra en D-G / F4e).
- [x] **F3 · Insumos (2026-09-20):** pantalla `/produccion/insumos` (saldo desde el ledger, lotes, libro), nuevo insumo, ingreso de lote, y descuento desde la orden con
      vista previa. Sin esquema. Verificado en navegador como líder; 1415 pruebas. **Sin verificar:** colaborador del Taller. El ingreso no pide proveedor (F4a).
- [x] **F3b · Devolver insumos** (2026-09-20, local): `devolver_insumo_de_produccion` + costo neto en `registrar_consumo_insumo` + `anular_produccion` que devuelve lo descontado (migración `20260920100000`, **sin pegar en producción**, prueba `pnpm pruebas:insumos-devolucion`). **Aplicada en producción y validada el 2026-09-20.** Falta verla en el navegador con el panel abierto.
      insumos:** un consumo no se puede deshacer y anular una orden no devuelve la tela. Bloquea que el Taller adopte Insumos en producción.
- [ ] **F4 · Abastecimiento propio de Producción (esquema, alto riesgo; ya NO espera a ADR-0139, el reparto entre tiendas):** 4a proveedores de Producción (`proveedores_produccion`,
  - [x] **F8 · Cierre y conexión con Inventario** (2026-09-22, local, sin migraciones): «Llevarlas a las tiendas» desde el cierre y desde la orden terminada → `/inventario/mover` con origen y varias líneas prellenadas; documentación al día. **Con esto ADR-0133 queda implementado (F0–F8).**
  - [ ] **Movimientos sin referencia de la orden de producción** (hueco de F8): que `fn_movimientos` (Inventario) devuelva `produccion_id` y el modelo, y que `referenciaMovimiento` muestre «Orden de <modelo>» con enlace a `/produccion/ordenes?orden=<id>`. Requiere reescribir esa función desde su definición de producción.
  - [ ] **Pendientes que siguen abiertos del módulo:** ver el módulo con clics y con una sesión de colaborador del Taller; refrescar `docs/datos/generado/` (`pnpm datos:generar:produccion`); decidir si `fn_costo_historial` (costo de prendas) pasa a solo-líder; filtrar solo gastos vigentes en `lib/eficiencia.ts` cuando ADR-0117 agregue «anulado».
  - [x] **F7 · Eficiencia del Taller** (2026-09-22, local): costo por prenda = materiales + conversión (planilla de Dynamic por la vista puente `retail.planilla_por_sede` + gastos del Taller de Finanzas), período a período; sin cotización de maquila (D-E descartada); sin tabla de gastos propia (D-F resuelta) — migración `20260921160000` (**sin pegar en producción**), prueba `pnpm pruebas:planilla-por-sede`. Falta pegarla y verla con clics. Sigue F8.
  - [x] **F6 · Resumen de Producción** (2026-09-21, local, sin migraciones): `/produccion` = «¿qué necesita mi decisión hoy?» con tarjetas por urgencia, cifras, ¿qué producir? y ¿alcanza la tela? (`lib/produccion-decisiones.ts`, `ResumenProduccionPanel.tsx`); solo hechos, sin plazos inventados. Falta verlo con clics y con datos reales. Siguen F7 (Eficiencia; necesita D-E y D-F) y F8.
  - [x] **F5 · Nueva orden con decisión** (2026-09-21, local, sin migraciones): curva sugerida por talla y color desde el ritmo y stock de toda la red, ¿alcanza la tela y los avíos? con rendimiento medido de las órdenes cerradas, costo y margen; solo líder (`lib/produccion-decision-reglas.ts`, `lib/decision-produccion.ts`, `NuevaOrdenProduccionForm.tsx`). Falta verlo con clics y con datos reales. Siguen F6 (Resumen), F7 (Eficiencia; D-E, D-F) y F8.
  - [x] **F4e · Candado del dinero de Producción** (2026-09-21, local): privilegio por columna sobre `insumo_lotes`/`movimientos_insumo`/`producciones` + `fn_costos_insumos_taller` + `fn_costos_producciones` + `v_insumo_saldos` cerrada (migraciones `20260921150000` A y `20260921151000` B, **sin pegar en producción; orden: A → desplegar la app → B**, prueba `pnpm pruebas:candado-dinero-produccion`). Falta pegarlas y verlas con una sesión de colaborador. **Por decidir:** `fn_costo_historial` (costo de prendas) es legible por cualquier colaborador.
  - [x] **F4d · Recibir insumos** (2026-09-21, local): `recibir_comprobante_produccion` (un lote por línea, quien opera el Taller, sin montos, idempotente) + `fn_lineas_comprobantes_produccion` + cierres con motivo + `anular_comprobante_produccion` negada con mercadería recibida + pantalla `/produccion/recibir` (migración `20260921140000`, **sin pegar en producción**, prueba `pnpm pruebas:recibir-comprobante-produccion`). Falta pegarla, verla con clics y probarla con un colaborador del Taller. Sigue F4e (candado del dinero).
  - [x] **F4c · Por pagar de Producción + consolidado D-I** (2026-09-21, local): `registrar_pago_comprobante_produccion` (varios medios, sin pasarse del saldo, idempotente) + `fn_deuda_consolidada` + `fn_igv_credito_fiscal` + pantalla `/produccion/por-pagar` (migración `20260921110000`, **pegada en producción**, prueba `pnpm pruebas:por-pagar-produccion`). Falta verla con clics. Siguen F4d (Recibir; debe actualizar `anular_comprobante_produccion`) y F4e (candado del dinero).
  - [x] **F4b · Comprobantes de Producción** (2026-09-21, local): `comprobantes_produccion` (+ `_items`, `_pagos`) solo-líder + `registrar_/anular_comprobante_produccion` + `fn_comprobantes_produccion` + pantalla `/produccion/comprobantes` (migración `20260921100000`, **sin pegar en producción**, prueba `pnpm pruebas:comprobantes-produccion`). Falta pegarla y verla con clics. Siguen F4c (Por pagar; requiere D-I), F4d, F4e.
  - [x] **F4a · Proveedores de Producción** (2026-09-20, local): `proveedores_produccion` solo-líder + `guardar_proveedor_produccion`/`cambiar_estado_proveedor_produccion`/`fn_proveedores_produccion` + pantalla `/produccion/proveedores` (migración `20260920110000`, **sin pegar en producción**, prueba `pnpm pruebas:proveedores-produccion`). Falta pegarla y verla en el navegador.
      repunta `insumos`/`insumo_lotes`) · 4b comprobantes · 4c por pagar (requiere D-I) · 4d recibir insumos → lote · 4e candado del dinero.
      Cada uno con su prueba SQL; Compras no se modifica. Timestamps ≥ `20260919210000`; pega Felipe.
- [ ] **F5 · Nueva orden con decisión** (curva desde `fn_resumen_variantes`, cobertura de tela, costo, margen, entrega).
- [ ] **F6 · Resumen «¿qué necesita mi decisión hoy?»** (reglas puras con tests).
- [ ] **F7 · Eficiencia del Taller** (D-31: `maquila_referencias` + `gastos_taller`; estados vacíos hasta tener datos).
- [ ] **F8 · Cierre:** «llevarlas a las tiendas» (Traslados), referencia en Movimientos, refresco de `docs/datos/`, ARQUITECTURA.

## 🎯 Por pagar responde + Pagar juntos con varios medios (2026-09-19, ADR-0131 y ADR-0132)
- [x] Hecho y en producción: la pantalla (PR #183), `registrar_pago_compras_medios` con sus dos migraciones (`20260919190000` y `…200000`, **verificadas en la base**: una sola firma, fecha validada, token antes del saldo a favor) y el modal con varios medios (PR #187). Probado con 27 casos locales y con pagos reales en el navegador: 2 comprobantes × 2 medios (escritorio) y 3 × 3 (celular 375 px, sin desborde). Diccionario de producción refrescado (PR #192).
- [ ] Sin probar en pantalla: dividir el pago con el saldo a favor encendido (la base sí lo cubre en pruebas), y «Solo lo vencido» después de dividir (los medios dejan de sumar y el botón se bloquea, sin mensaje que lo explique más allá de «faltan S/ X»).
- [ ] `datos:comparar` no vigila `registrar_pago_compras` ni `registrar_pago_compras_medios` (objeto armado con `...`, «no analizadas»): armar los parámetros explícitos en `PagoJuntosModal.tsx` para que vuelvan a estar bajo la red.

## 🎯 Endurecer el pago a proveedores (2026-09-19, ADR-0135) — migración lista en local, falta producción
- [x] Migraciones `20260919180000` y `20260919181000` **pegadas en producción por Felipe (2026-09-19)**. **Verificado en la base el 2026-09-19** (una sola firma de cada función, md5 igual al local, `anon` sin EXECUTE) y `funciones-produccion.txt` refrescado (178 funciones): `datos:comparar` ya no marca ninguna pantalla rota (`fn_proveedores_serie_12m` también estaba aplicada en producción y el volcado no la tenía). Tablas y columnas no cambiaron: el diccionario no necesita más.
- [ ] Después: enviar `p_token` (uuid del formulario) desde `CompraDetallePanel.tsx` a `registrar_pagos_compra`; regenerar `types.ts` y el diccionario de producción. Antes de aplicar, NO: la función vieja no acepta el parámetro.
- [ ] Decidir M6: por defecto del saldo a favor en el pago individual, en lote y al registrar el comprobante (hoy solo el lote lo destaca).
- [ ] `registrar_pago_compra` (singular) tiene EXECUTE para PUBLIC: cerrar con `revoke … from public, anon` (exige líder por dentro; no explotable, pero conviene).
- [ ] Deriva local: `por_pagar_tramos` sin candado ADR-0126 (falla `dinero_compras_solo_lider`); repegar `20260919160000` en el local.

## 🎯 Comprobantes con movimiento y regla de modales (2026-09-19, ADR-0136)

Hecho: regla de modales en `<Modal>` (los 49 la heredan); lista `/compras` con cifras que cuentan, barras de reparto, indicador deslizante,
avance en la celda, filas que se reacomodan (FLIP) y atajos `/` `j` `k`; detalle con línea de tiempo, historial de pagos y **Registrar pago
desde el detalle** (antes navegaba a Por pagar); registro con tramos, lista de pendientes y ayuda de costo; corregido el error de la factura
(`estadoNotaFaltante` llamada desde el servidor).

- [ ] **Recorrido visual por Felipe** de `/compras`, la factura (modal y página), Registrar pago, Pago juntos y `/compras/nueva`: el movimiento
      solo está verificado por tipos, pruebas y compilación, no a ojo. Mirar sobre todo: el indicador de pestañas, el reacomodo de filas al
      cambiar de vista, y que `LineasPago` (cambió de desplegable a fichas) se vea bien también dentro de `/compras/nueva`.
- [ ] **Migrar a `<Modal>`** las piezas que dibujan su propio overlay: `ProveedorModal`, `ProveedorVistaRapida` (movimiento propio de ADR-0128),
      `ConteoPanel`, `ProductosAgrupados`. Cambia su aspecto: pantalla por pantalla, con ok de Felipe.
- [ ] **Recorrido de los 49 modales** por la nueva entrada (más larga y con cascada): Vender, Caja y Compras primero.
- [ ] **«Costo actual» vs «último costo»** en el registro: hoy la ayuda usa el costo promedio ponderado de `variantes.costo`; el último costo real
      pagado exige leer `costo_historial` (consulta nueva).
- [ ] Una **prueba de arquitectura** que impida llamar desde un Server Component a una función exportada por un archivo `"use client"` (el error
      que tumbó la factura no lo ve `tsc` ni `next build`: solo aparece al renderizar).

## 🎯 Proveedores: CCI, Yape/Plin y titular para pagar sin equivocarse (2026-09-19, ADR-0134)

Rama `claude/comprobantes-ui-ux-animations-ab153b`. **La base YA está en producción** (registrada como
`20260919173940 proveedores_cci_y_billetera`; el archivo del repo es `20260919170000_…`, se renumera al aplicarla):
4 columnas nuevas en `retail.proveedores` (`cci`, `celular_billetera`, `billeteras`, `titular_cuenta`) con 5 candados,
la RPC `guardar_cuentas_proveedor` (solo líder) y `fn_proveedores()` con 28 columnas; una sola firma de cada una, nada en
`public`, EXECUTE solo `authenticated`. Hay 2 proveedores y ninguna cuenta cargada (el backfill no copió nada). Pruebas:
`pnpm pruebas:proveedores-cuentas` (28 casos) y `proveedores-reglas.test.ts`. **La web va en este PR** (tarjeta
`CuentasProveedor`, «Cómo pagarle» en `ProveedorModal`, ficha, chip «Sin datos de pago», `PagoJuntosModal`, `LineasPago`,
`CompraFormV2`). Regla: un proveedor con pago preferido EFECTIVO no se marca «sin datos de pago»; el N.° de operación sigue opcional.

- [ ] **Visibilidad por rol de las 5 columnas de pago** (`banco`, `cuenta_bancaria`, `cci`, `celular_billetera`,
      `titular_cuenta`): **decisión final del proyecto** (Felipe, 2026-09-19: «como parte final cuando esté casi todo el
      proyecto hecho»). Se cierran juntas o ninguna. Ver el ítem «Decisión a reconsiderar» de la sección «Crear producto como árbol de decisión
      (ADR-0109)» más abajo (`proveedores_select` a cualquier sesión) y ADR-0134 (D7). Cuidado: `compras_resumen`/`listar_compras` arrastran
      `proveedor_banco/cuenta_bancaria` con el rol del usuario; esconder columnas sin más rompería el detalle de compras.
- [ ] **Bitácora de cambios de cuenta** (riesgo residual, recomendado como siguiente paso **antes de que haya volumen de
      pagos**): tabla append-only `proveedor_cuentas_historial` —quién, cuándo, valor anterior enmascarado— escrita por
      `guardar_cuentas_proveedor` en la misma transacción. Hoy un líder o una sesión comprometida puede cambiar un CCI antes de
      un pago sin dejar rastro. Es dato personal de un tercero (Ley 29733).
- [ ] **Anular la copia duplicada de `cuenta_bancaria`** donde ya está el mismo número en `cci` (opcional, decisión de Felipe;
      no se propone hacerlo ahora: no se borran datos con historial). La UI ya no la muestra repetida (`cuentaLocalVisible`).
- [ ] **Refrescar el volcado de producción** para que el diccionario incluya las columnas y la función nuevas
      (`pnpm datos:generar:produccion`; `docs/datos/generado/COMO-REFRESCAR.md`). No se editó `generado/` a mano.
- [ ] **Cargar a mano el CCI/celular/titular de los 2 proveedores reales** cuando la web se fusione, y mirar en pantalla que
      «Sin datos de pago» y los avisos de `CompraFormV2`/`LineasPago` salgan como se espera (las pantallas no tienen prueba automática).

## 🔧 Repo contra producción: lo que producción tiene y el repo no (2026-09-21)

La base local se dejó idéntica a producción el 2026-09-21 (huella por objeto: 217 de 217 funciones y 81 de 82 tablas y vistas; la que falta es `planilla_por_sede`, que necesita las tablas reales de Dynamic — no se ponen stubs en `public`: rompen `pruebas:planilla-por-sede`). Para lograrlo hubo que aplicar a mano cosas que **ninguna migración de `main` escribe**; una base local nueva o una marca nueva no las tendría:

- [ ] **Permisos de producción sin migración.** Default global `postgres:f:global:{postgres=X/postgres}` (`alter default privileges for role postgres revoke execute on functions from public`); `revoke execute on all functions in schema retail from public` (en producción `anon` ejecuta 0 funciones; local llegó a tener 96); `stock`, `transferencias` y `transferencia_items` solo SELECT para `authenticated`; `stock` y `movimientos` solo lectura para `service_role`; `fn_aplicar_movimiento` y `recalcular_stock` sin EXECUTE para `service_role`. Falta una migración idempotente que lo escriba.
- [ ] **`retail.gastos` y `registrar_gasto` (11 parámetros) están en producción y no en la cadena de `main`.** Vienen de las migraciones tempranas de `claude/garza-caja-modulo-7aad0f` (`20260916171500_gastos_operativos` y `20260916174750_gastos_idempotente`, sin fusionar); las posteriores (`20260918193000_gastos`, ADR-0117) NO están en producción. Sin ellas Eficiencia (Taller), que lee `gastos`, falla en una base local reconstruida. Decidir: fusionar las dos tempranas o escribir la migración desde la definición viva de producción.
- [x] **(Resuelto 2026-09-22: aplicada en producción.)** Apartar stock (ADR-0141, `20260920160000`) estaba en `main` y NO en producción, y el front ya llama a `apartar_stock`, `liberar_apartado` y `listar_apartados`: esas pantallas fallan en producción. Se retiró de la base local para que calce con producción. Pegar en producción (necesita el OK de Felipe) y reaplicar en local con `psql` registrando la versión.
- [ ] **Refrescar `docs/datos/generado/funciones-produccion.txt`** (199 firmas contra 217 en producción): `pnpm datos:comparar` marca como rotas 5 pantallas que sí existen en producción.

Aparte: `pnpm pruebas:colaboradores-endurecimiento` falla en local con `no rows returned for \gset` porque su montaje busca una persona activa que aún no sea colaboradora y la base ya no tiene ninguna (no es de la sincronización).

## 🎯 Facturación en cuatro vistas (2026-09-18, ADR-0124)

Rama `claude/billing-design-analysis-ee464b`. Spec aprobado por Felipe el 2026-09-19: `docs/superpowers/specs/2026-09-18-facturacion-cuatro-vistas-design.md`. Plan: `docs/superpowers/plans/2026-09-19-facturacion-cuatro-vistas-r0-r1.md` (R0 y R1 al detalle; R2 a R4 se hicieron directo, por rebanadas). **Estado al 2026-09-21: R1 y las cuatro vistas con su look (R2 rebanadas A a C, R3 y R4) construidas y verificadas en el navegador contra la base local, sin push.** `main` está fusionada (Atelier entró a `main` el 2026-09-19, ADR-0123). Las migraciones de `fn_ventas_del_dia`, de `anular_venta` y del candado de comprobante sobre venta anulada (`20260921161500`) ya están pegadas en producción (2026-09-21). La franja de proformas del Resumen (R2) ya está. Falta el cierre: ver «Falta para cerrar Facturación» más abajo.

- [x] **R0 — Preparación:** verificar contra producción (solo lectura) que `retail.ventas.estado` existe y la definición viva de `fn_ventas_del_dia` (¿excluye anuladas?); confirmar el estado de Atelier (ADR-0106, hoy 0123) y de `panel-comercial` (ADR-0110).
  - 2026-09-19: `main` fusionada (solo chocaron BACKLOG y BITÁCORA); el ADR pasó del 0121 al **0124** porque `claude/interface-recommendations-8ce365` (Cambios, Devoluciones y Atelier) ocupa del 0121 al 0123; Atelier no está en `main` ni en GitHub (solo en esa rama local, donde su ADR es el 0123); `panel-comercial` no está en `main` (PR #151 abierto, ADR-0110); línea base de la suite web: 916 pruebas en verde.
  - 2026-09-19, producción verificada en solo lectura (`cayla-dynamic`, schema `retail`). **(a)** `ventas.estado` existe (CHECK: `completada` o `anulada`; hoy las 9 ventas son `completada`): no aplica la regla que oculta el comparativo de R2. **(b)** `fn_ventas_del_dia` tiene una sola firma, `(uuid)`, pero **no filtra por `ventas.estado` ni lo devuelve** (solo el `estado` del comprobante): una venta anulada saldría en la lista del día con su total y sin etiqueta. **R2 no se cierra** hasta que se excluyan o se etiqueten; la corrección es una migración que se propone a Felipe y espera su OK (no se aplicó nada). **(c)** series solo en Tienda AQP (`B005`, `F005`) y Tienda TRU (`B004`, `F004`); ninguna `nota_credito`, como se esperaba: la franja de R3 lo mostrará. **(d)** línea base para la Task 8: 11 comprobantes (`aceptado` 1 desde 2026-09-08, `anulado` 1 desde 2026-09-09, `pendiente` 9 desde 2026-09-14) y 1 proforma `vigente`, con 0 vencidas derivadas.
- [x] **R1 — Estructura** (sin depender de Atelier): layout + cuatro rutas + pestañas + cabecera + los dos modales extraídos + redirect de `/vender/descuentos` + `BotonCompacto`.
  - 2026-09-19, hecha y verificada contra la base local (`LUCODE_ENTORNO=sandbox`), en el navegador con la sesión de líder de Felipe. Las cuatro URLs, atrás/adelante y el 307 de `/vender/descuentos`; contadores iguales a la base (Comprobantes en ámbar, Proformas solo si hay vigentes) y ocultos —con el error real de Postgres en el log del servidor— si su consulta falla; una vista caída no tumba la cabecera y «Reintentar» la recupera sin recargar (en Next 16 `reset` solo no vuelve a pedir los datos: se usa `router.refresh()` + `reset()`); los dos modales abren desde cualquier pestaña y la emisión conserva su token de idempotencia (dos fallos seguidos mandan el mismo; tras un éxito se renueva); el mes se conserva entre Proformas y Comprobantes; foco con teclado visible (`outline: solid`); medidas de la maqueta v8 confirmadas (pestañas 14 px, contenedor 14 px/4 px/blur 22, píldora 10 px/0,45 s, botones 36 px/10 px/13 px/500); `pnpm --filter web build` en verde. Defectos que salieron al verificar, ya corregidos: la sombra de la píldora y el anillo de foco se recortaban en pantalla ancha (`5476c1b4`), en celular la pestaña activa quedaba fuera de pantalla (`124aaf40`) y el contador decía «1 vigentes» (`f91a9e9f`). **Sin comprobar en vivo:** la puerta de un integrante (solo por lectura de código: las cuatro páginas piden `exigirLider()` en su primera línea; se prueba entrando como `micaela@cayla.local` y abriendo `/vender/facturacion`, que debe llevar a `/`) y el desplazamiento suave de las pestañas en celular al cambiar de vista.
  - Pendientes conocidos que **no son error de R1**: (a) hasta R3 la tarjeta «Pendientes de enviar» del panel de Comprobantes cuenta `pendiente`+`enviado` **del mes**, mientras el contador de la pestaña cuenta `pendiente`+`rechazado` **sin mes** (la definición del spec §9): pueden no coincidir; (b) hasta R3 la tarjeta «Proformas vigentes» cuenta también las vencidas (el contador de la pestaña ya no).
  - Hallado al construir R1, fuera de esta entrega: el botón «Reintentar» de `app/(app)/error.tsx` y `app/global-error.tsx` tiene el mismo defecto que se corrigió en Facturación (`reset` solo no vuelve a pedir los datos); y en Tailwind 4 el anillo de foco de todo elemento con `outline-none` + `focus-visible:outline*` que no lleve además `outline-solid` no se dibuja (los usos se cuentan con `git grep "outline-none"`; se ofreció como tarea aparte el 2026-09-19).
- [x] **R2 — Resumen**: tarjetas de vidrio, la franja de proformas, «Actividad de hoy», comparativo «mismo día de la semana pasada, a esta hora», línea viva y buscador.
  - [x] **A — las cuatro tarjetas de vidrio** («Vendido hoy» con su comparativo, «Ventas», «Por enviar a SUNAT» y «Ticket promedio»), con sparkline, eje, barra de envío y barras de ticket; reglas en `lib/facturacion-resumen-reglas.ts` y `-graficos.ts`. Verificadas en el navegador con datos reales y con los de la maqueta (+12 %, −27 % en rojo).
  - [x] **B — «Actividad de hoy»**: la lista del día con el hilo del comprobante (venta · número · SUNAT · aceptado), chip, detalle y el botón por fila (*Transmitir*, *Reintentar* o *Ver PDF*); un aceptado de prueba no se ve como uno real (ADR-0015). Reglas en `lib/facturacion-actividad.ts`.
  - [x] **C — la línea viva** («Lunes, 21 de setiembre · 09:27 · actualizado hace 16 s»; el punto late mientras es reciente y pasa a ámbar y quieto a los 10 minutos) **y el buscador** (filtra la vista que se mira; sin tildes ni mayúsculas; se borra al cambiar de vista). Reglas en `lib/facturacion-busqueda.ts`.
  - [x] **La franja de proformas** del Resumen (spec §7), 2026-09-21: una fila `card-cayla` entre las tarjetas y «Actividad de hoy» con «1 vigente · S/ 88.50 · 0 por vencer» y «Ver proformas →». Sale de `getResumenProformas()`, la misma cuenta del contador de la pestaña y de las tarjetas de Proformas (`vigentes` y monto son solo las que aún valen): la franja y la pestaña no pueden discrepar. Regla pura `franjaDeProformas` en `lib/facturacion-proformas-reglas.ts` (3 pruebas) y componente de servidor `components/FranjaProformas.tsx` (se llama así porque `ResumenProformas`, el nombre que le daba el spec, ya es el tipo de esa cuenta). Cuatro estados, vistos en el navegador —con los datos de hoy y, para los otros tres, con una página temporal de datos inventados ya borrada—: normal; con lo que vence pronto (chip ámbar «2 por vencer»: el estado nunca va solo en color); sin vigentes (una línea, no tres ceros); y lectura fallida («No se pudieron leer las proformas», nunca una cifra inventada). En celular envuelve en tres líneas sin cortar. Va arriba de la actividad para que «por vencer» se vea sin bajar: moverla debajo es cambiar una línea de `page.tsx`. No muestra las vencidas (el spec pide tres cifras; están en la vista Proformas).
  - [x] **Migración de `fn_ventas_del_dia`, escrita, probada y aplicada en local (2026-09-21):** `supabase/migrations/20260921103000_ventas_del_dia_una_fila_por_venta_y_sin_anuladas.sql`. La función (que leen Caja, Vender y Facturación) no filtraba `ventas.estado` —una venta anulada seguía en la lista y sumaba a «Vendido hoy» y a la meta de Caja— y repetía la venta que tiene dos comprobantes (uno liberado o dado de baja y su reemplazo). Ahora da UNA fila por venta `completada`, con su comprobante vigente (o el más nuevo si solo hay muertos). Misma firma y columnas (`create or replace`: sin sobrecarga, permisos intactos). Prueba nueva `pnpm pruebas:ventas-del-dia` (11/11; sin la migración 7/11, y las cuatro que fallan son justo las que arregla) y su paso en CI; `registrar-venta` (22/22) y `caja:verificar` (15/15) siguen en verde. Se aplicó al Postgres local compartido con `psql` y NO con `migration up`: `up` habría aplicado también las tres migraciones de `main` que esta rama trae y la base compartida aún no tiene (proveedores, movimientos con referencias y el dinero de Compras solo-líder), que no son de Facturación.
  - [x] **Pegada en producción el 2026-09-21** (Felipe: «Pega ya»). Antes: huella del cuerpo `9f564c0f0a7f93cee69e7ff389972de4` (igual a la del repo), una sola firma, y la lógica vieja contra la nueva sobre las 16 ventas reales de producción: 16 filas contra 16, cero diferencias. Después: huella `7a29927aeea6a81a0b85d8fe890a7c9d` (igual a la de local), una sola firma, permisos, dueño, `security definer`, volatilidad y `search_path` intactos, comentario puesto, y llamada como el líder de producción: 2 ventas de hoy, S/ 795.00, igual a la suma directa de `ventas` y `venta_items`. Sin cambio visible hoy (ninguna venta anulada ni repetida). Rollback listo (el cuerpo anterior, con la huella verificada). `docs/datos/generado/funciones-produccion.txt` no cambia: solo guarda firmas. El frontend no depende del orden: `ventasUnicas` sigue defendiendo las tarjetas si una base es anterior.
  - Sin comprobar: pulsar *Transmitir* / *Reintentar* / *Ver PDF* con datos reales (llama al sandbox de Lucode; no se pulsó sin permiso de Felipe), el hover de las tarjetas y la entrada animada (el panel del navegador estuvo oculto casi todo el tiempo).
- [x] **R3 — Comprobantes y Proformas** (2026-09-21).
  - **Comprobantes:** cuatro tarjetas (Emitidos; «Monto facturado» = aceptado en producción, restadas las notas de crédito, con «de prueba», «sin enviar» y «por confirmar» aparte; Pendientes y Rechazados, de cualquier mes), la franja de series que faltan por tienda (hoy: la de nota de crédito) con «Registrar serie» que abre el formulario ya puesto en la primera que falta, «Nota de crédito» como tipo del formulario, y la lista con chips y botones compactos (`accionesDelComprobante` decide qué botón le toca a cada estado; un rechazado nunca se libera, ADR-0093). Revisada con ojos frescos: 4 Importantes, todos arreglados.
  - **Proformas:** tarjetas Vigentes / Monto cotizado / Por vencer (48 h) / Vencidas desde `resumenProformas` (la cuenta del contador de la pestaña; antes el panel sumaba las vencidas como plata por cobrar), orden «excepciones primero» y la línea «Vence en 5 h» / «Venció hace 2 d».
- [x] **R4 — Códigos de descuento** (2026-09-21): cuatro tarjetas (Vigentes / Por vencer en 7 días / Vencidos / Apagados) y estado de cada código (vigente, por vencer, programado, vencido, apagado) contra `hoyLima`, la misma fecha con la que `registrar_venta` valida al cobrar (`fn_hoy_lima()`).

- [x] **Cabecera y entrada unificadas con Cambios, Devoluciones, Caja e Historial** (2026-09-21, Felipe: «que siga el patrón de diseño de las demás»). `FacturacionCabecera` usa `EncabezadoPagina` (hilo que se dibuja, «Todas las tiendas · fecha y hora de Lima», título serif de 46 px, frase) con las dos acciones bajo la frase (como Caja) y `ResumenSede` a la derecha (por enviar a SUNAT y proformas vigentes, con `CifraAnimada`; un `null` —la lectura falló— no dibuja la cifra, un cero sí). La línea viva («actualizado hace 16 s», punto que late y pasa a ámbar a los 10 min) se conserva dentro de la línea de arriba: `EncabezadoPagina` ganó un `detalle` opcional que no cambia las otras pantallas. La caja de búsqueda bajó a la fila de las pestañas (`CajaDeBusqueda`, exportada). Cascada de entrada: cabecera 0, resumen 1, pestañas 2 y las vistas empiezan en 2 (antes en 0; sus paneles pasaron de 4 y 5 a 6 y 7); `space-y-7` como las demás. Verificado en el navegador a 1440 y 390 px (sin desborde), con las medidas de Cambios (misma letra a 46 px, mismo origen) y cambiando de pestaña (la cabecera no se remonta). Falta decidir si las tarjetas de vidrio (look v8) también pasan a `card-cayla`.

### Comprobantes: envío automático a SUNAT y series (D-60, ADR-0165, 2026-09-22)

Rama `claude/comprobantes-series-auto-emit-4346ee`, fusionada con `main` (nota de venta incluida). Diseño aprobado: `docs/superpowers/specs/2026-09-22-comprobantes-series-y-envio-automatico-design.md`. «Facturación» pasa a ser **Comprobantes** (`/vender/comprobantes`, los enlaces viejos redirigen). Los cuatro pasos construidos y verificados en local contra el sandbox; tipos, 7843 pruebas y lint en verde. **Sin push.**

- [x] **Paso 1 — envío al cobrar.** Vender llama a `/api/lucode/emitir { venta_id }` en segundo plano. Verificado: una venta real cobrada en la pantalla disparó el envío sola.
- [x] **Las líneas de una venta ya se pueden declarar** (hallado al probar el paso 1): ninguna boleta nacida de una venta se había podido transmitir nunca (ítems sin descripción y con precio con IGV). `itemsParaLucode`: referencia + SKU, `(precio − descuento) / 1,18`. B001-25 aceptada por el sandbox con CDR.
- [x] **Paso 2 — reintento sin cron** (`fn_tomar_comprobantes_para_reintento`, reserva de 5 min con `skip locked`, `/api/lucode/reintentar`). Verificado: el barrido aceptó 3; con el token apagado quedaron en cola con su error; con el token de vuelta, «Reintentar ahora» los aceptó.
- [x] **Paso 3 — la pantalla.** Series · Emitidos · Por reintentar · Proformas; sin Resumen, sin Códigos de descuento (el código al cobrar sigue), sin «Transmitir»; aviso rojo si algo pasa 1 hora en cola; pastilla «Pruebas». El Resumen viejo se caía al ver un `pendiente_reintento` (ya no existe).
- [x] **Paso 4 — archivar series.** `registrar_serie_comprobante` reemplazaba la serie conservando el contador; ahora se archiva con motivo y la nueva empieza en 1. Una activa por tienda y tipo; un nombre no se reusa. Guía de salida a producción en Series.
- [x] **Las 20 boletas de prueba pendientes de producción** (B004, 14–22 sep, S/ 11 056,10): marcadas `no_emitido` con motivo «Venta de prueba…» (Felipe: «B»), por MCP con guarda de conteo = 20.
- [x] **`LUCODE_ENTORNO` a `sandbox` en Vercel y redesplegado** (Felipe, 2026-09-22). Estaba en `produccion`: los 2 comprobantes transmitidos el 08 y 09-sep fueron a la SUNAT real. El valor no se pudo leer desde la CLI sin descargar todos los secretos; se confía en el cambio de Felipe.
- [x] **Pegadas en producción el 2026-09-22** (Felipe: «1 y 2»), cada una en una transacción con bloque de validación final. `20260922193700`: `fn_tomar_comprobantes_para_reintento` con huella `344aa75b…` (igual a local), una firma, `security definer`, EXECUTE solo `authenticated`/`postgres`; humo como líder real: tomó 0 (nada en cola). `20260922234100`: antes `fn_reservar_numero_serie` `a911c8ae…` y `registrar_serie_comprobante` `2b6879d0…` (iguales a local; rollback = sus definiciones de `0010`), después `e04f4e9a…`, `83a3dee0…` y `archivar_serie_comprobante` `43fdebef…` (iguales a local); tres columnas, candado viejo fuera, índice único parcial, `fn_reservar` sigue cerrada (solo `postgres`); las 7 series con sus mismos números (`B004@24 … NV03@1`), ninguna archivada. Humo como líder, deshecho: registrar otra boleta en TRU se frena («archívala primero»), reservar da B004-24, y tras archivar B004 la reserva falla («No hay una serie registrada»); después, series y 23 comprobantes intactos. No se registraron en `supabase_migrations.schema_migrations` de producción (el historial de producción no es fiable, igual que en pegados anteriores).
- [ ] **PR a `main`** y su fusión (despliega): OK de Felipe.
- [ ] **Nota de crédito B y F en la misma tienda** (SUNAT exige la letra del documento que corrige). Con una sola NC activa por tienda no se puede; exige que `emitir_nota` y `aprobar_devolucion` le digan a `fn_reservar_numero_serie` qué letra quieren. Disparador: la primera factura que haya que corregir.
- [ ] `aprobar_devolucion` comprueba que exista una serie de NC sin mirar si está archivada: si solo queda una archivada, falla igual (la reserva aborta la transacción) pero con un mensaje menos claro. Sumar `archivada_at is null` la próxima vez que alguien la toque.
- [ ] **Cron de respaldo** para la cola, solo si se ve quieta de verdad (hoy la barren los cobros y las aperturas de Comprobantes).
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando las dos migraciones estén en producción.

### Falta para cerrar Facturación (2026-09-21)

**Necesita a Felipe** (decisión, OK o una prueba con su sesión):
- [x] **OK para pegar en producción la migración de `fn_ventas_del_dia`**: dado y pegada el 2026-09-21 (arriba).
- [x] **`anular_venta` y el comprobante de la venta que anula** (hallado el 2026-09-21 al probar la migración de `fn_ventas_del_dia`, en local y en producción). Anular una venta con boleta pendiente no tocaba esa boleta: seguía `pendiente`, contaba en «Por enviar a SUNAT», tenía su botón *Transmitir* y nada en `/api/lucode/emitir` miraba que la venta estuviera anulada, o sea que se podía declarar a SUNAT una venta ya devuelta. **Arreglado, y la migración pegada en producción el 2026-09-21** (Felipe: «Pega anular venta en producción»). (1) Migración `supabase/migrations/20260921121500_anular_venta_libera_el_comprobante_pendiente.sql`: `anular_venta` libera el comprobante `pendiente` de la venta (`no_emitido`, con «Venta anulada: <motivo>», quién y cuándo) en la misma transacción, igual que «Liberar sin espera» (ADR-0093), y repara los que ya hubieran quedado colgados (hoy son cero en producción y en local). Misma firma; el resto del cuerpo es idéntico (un `diff` contra el de `20260916214500` solo muestra el bloque agregado). En producción — antes: huella `338b85903b5005c140a049e9c9747c34` (igual a la del repo), una sola firma, 0 ventas anuladas y 0 comprobantes pendientes de ventas anuladas, presentes las columnas y restricciones que usa, ningún disparador de `update` sobre `comprobantes`, y el plan (`explain`) de los dos `update` nuevos contra el esquema real. Después: huella `bf62399b8935871806c765f1779a5f49` (igual a la de local), una sola firma, permisos, dueño, `security definer`, volatilidad y `search_path` intactos, ninguna venta anulada ni comprobante con motivo «Venta anulada» (la reparación no tocó filas), y una llamada como líder real sobre una venta que no existe responde «La venta … no existe» sin escribir nada. Rollback listo: el cuerpo de `20260916214500_anular_venta_sin_huecos.sql`, con su huella verificada contra la de producción. Prueba `pnpm pruebas:anular-venta-comprobante` (9/9; sin la migración 6/9, y las tres que fallan son las que arregla) y su paso en CI; `aprobar-devolucion-caja` 5/5, `registrar-cambio` 18/18, `registrar-venta` 22/22, `ventas-del-dia` 11/11 y `caja:verificar` 15/15 siguen en verde. (2) Código, que sale con el próximo push y no depende de la migración: `/api/lucode/emitir` se niega a transmitir el comprobante de una venta anulada (`lib/transmision-reglas.ts`, 8 pruebas; ante la duda —no se pudo leer la venta o llegó en otra forma, sin `estado`— también se niega: falla cerrada). Revisión independiente con contexto nuevo: 0 críticos, 2 importantes y 4 menores; el importante #2 (la guarda fallaba abierta si la venta llegaba sin `estado`) y los menores de las pruebas y del encabezado de la migración se corrigieron en el acto; el otro importante es la ventana de abajo. **Ventana que no se cierra:** una transmisión en vuelo (los segundos que tarda Lucode) mientras otra persona anula la misma venta; `actualizar_transmision_comprobante` no mira el estado previo y dejaría el comprobante `aceptado` sobre una venta anulada (habría que emitir una nota de crédito). Muy improbable (dos personas sobre la misma venta en unos 15 s) y sin arreglo barato: lo cerraría un estado `transmitiendo` que se reclama con un `update` condicional antes de llamar a Lucode y que `anular_venta` trate como bloqueante (decisión de Felipe). La misma raíz alcanza a «Liberar sin espera»: un `pendiente` cuyo intento venció a los 15 s pero que SUNAT sí procesó se libera como si nunca hubiera salido. Chequeo barato mientras tanto, debe dar 0 filas: `select c.id from retail.comprobantes c join retail.ventas v on v.id = c.venta_id where v.estado = 'anulada' and c.estado in ('pendiente','enviado','aceptado')`. **Caso decidido por Felipe el 2026-09-21, opción (a): se deja como está.** Un comprobante `rechazado` de una venta que se anula NO se toca (ya llegó a SUNAT, ADR-0093) y la ruta de transmisión no lo manda: queda en «Rechazados» sin salida y sin aviso en la fila. Si aparece uno se resuelve a mano con el contador (liberarlo dejaría un hueco en la numeración de un comprobante que sí llegó a SUNAT). Hoy no hay ninguna venta anulada en producción.
- [x] **OK para pegar en producción la migración `20260921161500`**: dado y pegada el 2026-09-21 (arriba).
- [ ] **Serie de nota de crédito: Felipe eligió A el 2026-09-21** (una serie con B por tienda ahora; la de factura, cuando se emita la primera factura). **Falta ejecutarlo**: ver «Para ejecutar A» al final. Lo investigado el 2026-09-21: **Qué exige SUNAT** (fuente primaria: Resolución de Superintendencia 117-2017, Anexo N.° 3): la serie de una nota de crédito tiene cuatro caracteres y empieza en **F** si corrige una factura y en **B** si corrige una boleta (S si corrige un recibo de servicios públicos, que CAYLA no emite). **Qué pasa hoy:** `series_comprobantes` tiene `unique (ubicacion_id, tipo)`, o sea UNA serie de nota de crédito por tienda, y `fn_reservar_numero_serie` la usa sin mirar qué documento se corrige; ninguna tienda tiene una todavía, y sin ella una devolución de un comprobante aceptado no se puede aprobar (el formulario solo sugiere «BC01»). **Producción hoy:** solo se emitieron boletas (1 aceptada, 1 anulada, 17 pendientes) y las series de factura de las dos tiendas (F004 y F005) nunca se usaron. **Opciones.** (A) Registrar una serie de nota de crédito que empiece con B por tienda (p. ej. `BC04` en TRU y `BC05` en AQP, alineadas con sus boletas B004 y B005), sin tocar código: *ganas* desbloquear las devoluciones de boletas hoy; *pagas* una restricción invisible, porque el día de la primera factura devuelta Lucode/SUNAT rechazaría la nota. (B) Hacer ya la migración que admita dos series de nota de crédito por tienda, una B y una F elegida según el documento que se corrige (cambia `series_comprobantes`, `fn_reservar_numero_serie`, `emitir_nota` y «Registrar serie»): *ganas* cumplir la norma para siempre; *pagas* una migración de producción por algo que aún no ha pasado (0 facturas emitidas). **Recomendación: A ahora, con un aviso claro (que el sistema diga «falta la serie de nota de crédito para facturas» en vez de dejar que Lucode rechace), y B el día que se emita la primera factura.** **Para ejecutar A** (Felipe eligió subir la rama y registrarlas él desde la pantalla; Tienda LIM todavía no emite, así que no lleva series hasta que emita): (1) confirmar con el contador o con Lucode el texto de cada serie (propuesta: `BC04` en TRU y `BC05` en AQP); el sandbox no pidió darla de alta en ningún panel (ver 3), pero producción puede ser distinta. (2) **Subir la rama**: la pantalla de producción (`main`) solo ofrece boleta y factura en «Registrar serie»; la de esta rama ofrece nota de crédito y, desde el 2026-09-21, **valida el formato** (cuatro caracteres y la letra que corresponde, B o F; `errorDeSerie`, 4 pruebas), que antes aceptaba cualquier texto de hasta 4 caracteres. (3) **Hecho el 2026-09-21: nota de crédito probada en el sandbox** con el conector real y sin tocar ninguna base: `BC01-1`, que corrige la boleta B001-21 por su total (motivo `06`, devolución total), aceptada por SUNAT a la primera, con su hash, XML, CDR y PDF, y con una serie que nunca se dio de alta en ningún panel; la ruta `/api/lucode/emitir` arma esos mismos campos desde la base (`comprobante_original_id` y `motivo`). No probado: una nota de crédito de una factura (serie F) ni una nota de débito. **Disparador para la opción B:** la primera factura emitida. Hasta entonces, una nota de crédito de una factura con serie B la rechazaría SUNAT; un aviso «falta la serie de nota de crédito para facturas» evitaría llegar a ese rechazo.
- [x] **Proforma vencida: se puede convertir, pero pide confirmación** (Felipe eligió la opción B el 2026-09-21). La base sigue sin impedirlo (la RPC solo mira `estado = 'vigente'`, no `vence_at`) y el comprobante sale con el precio de la cotización (convertir emite el comprobante: no registra una venta ni mueve stock). En el modal «Convertir a comprobante» de una proforma vencida aparece un aviso ámbar —«Esta proforma venció hace 3 d. El comprobante saldrá con el precio de la cotización (S/ 320.00), no con el de hoy. Si ya cambió, cotiza de nuevo.»— y el botón «Emitir comprobante» queda apagado hasta marcar «Sí, emitirlo al precio de entonces»; una vigente, o una por vencer, no pide nada. Regla pura `confirmacionDeConversion` en `lib/facturacion-proformas-reglas.ts` (3 pruebas) y `components/ProformasPanel.tsx`; el envío también se frena en el manejador, no solo con el botón. Visto en el navegador con una página temporal de datos inventados (ya borrada): el aviso pasa de «alert» a «status» al marcar, el botón queda bloqueado y un envío forzado no llega a la base, la casilla se reinicia al cerrar, y la vigente no muestra aviso. Solo pantalla: no se tocó la base. Si algún día debe ser imposible, es la opción C (prohibirlo en la RPC y esconder «Convertir»).
- [x] **Probar *Transmitir* en el sandbox de Lucode** (2026-09-21, con el OK de Felipe: «Hazlas todas»). Modo `sandbox` (`LUCODE_ENTORNO=sandbox`; el código apunta a `sandbox.apisunat.pe`) y una sola boleta de prueba —B001-000021, S/ 1.11, sin nombre— pulsada desde Comprobantes. La ruta `/api/lucode/emitir` respondió 200; en la base quedó `aceptado`, entorno `sandbox`, con su hash, PDF, XML y CDR (los tres enlaces salen a `sandbox.apisunat.pe`); la fila pasó a «ACEPTADO · PRUEBA» y ofrece «Anular»; la pestaña bajó de 23 a 22 por enviar; la tarjeta dice «1 de 23 enviados» y el aceptado de prueba suma aparte («S/ 1.11 de prueba»), sin entrar al monto facturado (ADR-0015). **Sin probar:** *Reintentar* con un rechazo real (la respuesta fue una aceptación) y el hilo animado de la fila del Resumen (en local no hay ventas de hoy; comparte la ruta y el hook `useTransmitir` con Comprobantes). Esa boleta quedó `aceptado` en la base local compartida.
- [x] **Puerta del integrante**, verificada en tres capas sin usar su contraseña (2026-09-21): (1) `lib/facturacion-puerta.test.ts` fija que las cinco páginas y layouts esperan `exigirLider()` antes que nada; (2) `exigirLider()` redirige a `/` si el rol no es líder; (3) consultada como Micaela con su identidad local (solo lectura), `fn_persona_actual_resumen()` dice `es_lider = false` (Tienda Trujillo) y `fn_es_lider()` da `f`, que el código traduce a «integrante»; como Felipe da `t`. **Falta solo el clic real** con la sesión de Micaela en el panel (opcional, 30 segundos: lo hace Felipe entrando él).
- [x] **Subir la rama** (Felipe eligió A el 2026-09-21: subirla para registrar las series de nota de crédito desde la pantalla). **Hecho: fusionada con `main` (`bdf7ea71`) y subida a `origin/claude/billing-design-analysis-ee464b`.** La fusión tuvo 5 conflictos, todos de «sumar de los dos lados» (`ci.yml`, `package.json`, BACKLOG, BITÁCORA y SESIONES-ACTIVAS), resueltos conservando los dos lados. Verificado sobre el árbol fusionado: sin versiones de migración repetidas (200 archivos), sin números de ADR repetidos fuera del legado, tipos y lint limpios, 99 archivos y 2331 pruebas en verde, `pnpm --filter web build` en verde con las cuatro rutas de Facturación, y el umbral de 1024 px de las pestañas sigue bien con el menú lateral de `main` abierto o plegado (contenedor de 560 y 561 px contra 545 de las pestañas). De las 126 funciones que llama el front, 123 existen en producción con una sola firma; las tres que no (`apartar_stock`, `liberar_apartado`, `listar_apartados`) son de Apartar stock (ADR-0141, de otra sesión, «hecho en local, falta pegar en producción») y ya estaban en `main`. **Falta:** un PR a `main` —el CI solo corre en pull requests y en pushes a `main`, y es ahí donde corren las pruebas contra Postgres— y su fusión, que DESPLIEGA a producción todo el rediseño de Facturación: necesita el OK de Felipe. Aparte, en Windows fallan dos cosas que en Linux no y que `main` ya traía: el candado del aviario (`AVIARIO.md` «quedó viejo») y `lib/menu.test.ts` (`SyntaxError`), ambos por los finales de línea CRLF —el shebang de `scripts/datos/aviario.mjs`—; convertir ese archivo a LF en la copia local lo arregla sin cambio en Git.

**Falta construir:**
- [x] La **franja de proformas** del Resumen (hecha, ver R2).
- [x] **Un comprobante no nace sobre una venta anulada** (hallado el 2026-09-21 leyendo `emitir_comprobante` en producción, solo lectura; lo confirmó el revisor de `20260921121500`). `emitir_comprobante` aceptaba cualquier `p_venta_id`, también el de una venta anulada, y `convertir_proforma_a_comprobante` se lo pasaba sin mirar: quedaba un `pendiente` sobre una venta ya devuelta (por RPC a mano o por una carrera con la anulación). **Hecho: un candado en la tabla** —trigger `comprobantes_venta_no_anulada`, `before insert`, con `for share` sobre la venta contra el `for update` de `anular_venta`; el mismo patrón que ya cubre cambios y devoluciones (`fn_linea_de_venta_no_anulada`)— en `supabase/migrations/20260921161500_comprobante_no_nace_sobre_venta_anulada.sql`. No toca `emitir_comprobante` (menos superficie para derivar de producción) y cubre cualquier camino que inserte. Prueba `pnpm pruebas:comprobante-venta-anulada` (8/8; 3/8 sin la migración: sin ella los tres intentos —RPC, `insert` directo y proforma— entraban, quemaban un número y dejaban 3 comprobantes sobre la venta anulada) y su paso en CI; `registrar-venta` 22/22, `registrar-cambio` 18/18, `anular-venta-comprobante` 9/9, `aprobar-devolucion-caja` 5/5, `ventas-del-dia` 11/11 y `caja:verificar` 15/15 siguen en verde. **No** comprueba que la venta sea de la misma ubicación (0 casos en producción; una facturación central lo querría distinto) y **no** prueba la carrera con `anular_venta` (necesitaría una segunda conexión con datos confirmados: descansa en el mismo mecanismo que `fn_linea_de_venta_no_anulada`). **Pegada en producción el 2026-09-21** (Felipe: «Pega el candado en producción»). Antes: la función y el trigger no existían, el único trigger de `comprobantes` era el de notas de crédito, había 17 comprobantes con venta y ninguno sobre una venta anulada, los permisos de la función hermana coincidían con lo que produce la migración, y el rollback (`drop trigger` y `drop function`) estaba verificado en local. Se pegó con un bloque de validación al final que habría deshecho todo si el trigger no quedaba activo o la función con permisos abiertos. Después: huella `f6eff0afceb9afcc26db6ada74be58ce` (igual a la de local), una sola firma, permisos `{postgres, authenticated}`, `security definer`, `search_path` fijo, trigger `comprobantes_venta_no_anulada` activo (`before insert`) junto al de notas de crédito, y los datos sin cambios. Prueba de humo en producción: un `insert` real sobre una venta viva dentro de un bloque que termina siempre en excepción; pasó por los dos triggers sin error, se deshizo, no quedó ningún comprobante de prueba y el correlativo no se movió. El rechazo sobre una venta anulada no se pudo probar en producción (no hay ninguna): lo prueba `pnpm pruebas:comprobante-venta-anulada` en local.
- [ ] **`getComprobantesMes` no pagina**: PostgREST corta en 1000 filas (`supabase/config.toml`) y las tarjetas de Comprobantes cuentan sobre lo que llegó, sin aviso. Al 2026-09-19 producción tenía ~11 comprobantes, así que está lejos; antes de que llegue: fallar en duro si llegan 1000 o paginar con `.range()` (como `resumen-inventario.ts`).
- [ ] **Móvil**: la fila apilada es alta (23 comprobantes ≈ 5 pantallas); compactar (número y total en una línea).
- [ ] Los **modales** de serie, anular y liberar (y los de emitir y proforma) siguen con el `Boton` del sistema: decidir si entran a la isla.
- [ ] El `Hilo` de `campos.tsx` en la caja de búsqueda (spec §8), pequeño.
- [ ] Los **estados vacíos** (un mes sin comprobantes ni proformas, sin códigos, una búsqueda sin resultados) revisados a ojo en el navegador: solo el de Proformas y el de la búsqueda se vieron.

**Falta cerrar (proceso):**
- [ ] **Refrescar `docs/datos/generado/funciones-produccion.txt`** (174 firmas contra 206 en producción el 2026-09-21: unas treinta son de otras sesiones —Compras, Producción, Proveedores, Resumen— y una es `fn_comprobante_de_venta_no_anulada`, que se pegó hoy). Es la consulta de `COMO-REFRESCAR.md` §7; después `pnpm datos:generar:produccion` y `pnpm datos:comparar` (restaurar `DRIFT.md` antes de commitear). No se hizo aquí porque el diff es casi todo de otras sesiones. Las tablas y columnas no cambiaron: el diccionario de tablas sigue vigente.
- [ ] La pasada de responsive, accesibilidad y movimiento reducido del spec (R4): el responsive se midió a 375, 768, 1024 y 1280 px; falta lector de pantalla y teclado en las listas, movimiento reducido en el navegador y un celular real.
- [ ] **Revisión con ojos frescos de todo el rango** (solo se revisaron R1, las tarjetas del Resumen y Comprobantes; faltan «Actividad de hoy», Proformas, Códigos y la cabecera con el buscador) y `pnpm --filter web build` sobre el HEAD final.
- [ ] `docs/datos/modulos/08-facturacion-sunat.md`: el hueco de las proformas `vencida` (derivada) y el de `nota_debito`, ya vencidos (spec §14).
- [ ] `finishing-a-development-branch`: opciones para integrar; sin push ni merge a `main` sin Felipe.

Fuera de esta entrega, anotado: emitir desde la fila de una venta sin comprobante (pospuesto el 16-sep); columna «Productos» en proformas (hoy guardan un solo ítem genérico); contador de pendientes en el menú lateral; «en vivo» por polling; búsqueda de comprobantes sin límite de mes; consultar el estado de un comprobante `enviado` (no existe camino; integración con Lucode, confirmar antes). Fuera del módulo, hallado de paso: el botón «Reintentar» de `app/(app)/error.tsx` y `app/global-error.tsx` no vuelve a pedir los datos (`reset` solo no basta en Next 16; se usa `router.refresh()` + `reset()` en Facturación).


## 🎯 Menú lateral plegable (2026-09-19, ADR-0130)

Aplicado y verificado en el navegador como líder (escritorio). Falta:

- [x] **Barras fijas con el menú plegado** (verificado 2026-09-19, escritorio 1440 px): «Pagar juntos» (Por pagar,
  `BarraFija` animada, transición `left, transform`) y la barra de Recibir (transición `left`, 300 ms) arrancan
  en el borde del lateral — 76 px plegado, 272 expandido — y acompañan el cambio; ninguna tapa el avatar. Falta
  solo el pie del Punto de Venta con carrito (aparece bajo `lg`, ancho de tablet), que no se abrió.
- [x] **Vista de colaborador** (verificado 2026-09-19 renderizando `AppShell` con una persona `integrante` de
  prueba, sin iniciar sesión con otra cuenta): sin Colaboradores ni Compras; Inventario trae «Recibir
  mercadería» y no «Resumen»; plegado, el cajón lista las cinco y la insignia («2 por atender») sube al ícono.
  Falta verlo con la cuenta real de Micaela (permisos dentro de cada pantalla, no del menú).
- [ ] **Decidir «Asomar al pasar el mouse»** (spike): no se construyó. Si se quiere, ver «Lo que NO se portó» del ADR.

## 🎯 Proveedores: vista rápida, mini-tendencias y movimiento que responde (2026-09-19, ADR-0128)

Aplicado en código y verificado en el navegador con sesión de líder (escritorio); **falta lo de producción
y mirarlo en celular real** (ver abajo).

- [ ] **Pegar en producción `20260919150000_proveedores_serie_mensual.sql`** (una función de solo lectura, con
  ok explícito de Felipe y con el prefijo `retail.`/`set search_path` que ya trae el archivo). Hasta entonces
  la lista se ve sin mini-tendencias ni barras mensuales — a propósito, no es un error. Después: refrescar el
  volcado (`pnpm datos:generar:produccion`) para que `funciones-produccion.txt` la incluya.
- [ ] **Mirarlo en celular real** (390 px): el cajón a pantalla completa, las filas de 2 columnas y el
  filtro de rubro con desplazamiento horizontal se verificaron solo por CSS, no en un dispositivo. Y con MÁS
  datos: la base local tiene 2 proveedores activos, así que el deslizamiento de filas se midió pero no se
  vio con una lista larga.
- [ ] **Regla de movimiento cambiada (Felipe, 2026-09-19): la llegada a una pantalla también se anima.**
  Aplicada solo en Proveedores. Si otra pantalla la quiere, usa `anim-entra` con `--i` (ver el encabezado de
  «Capa de movimiento» en `globals.css`); no es obligatoria. Falta decidir cuáles siguen (Comprobantes, Por
  pagar, Recibir) — cada una con su verificación en navegador.
- [ ] **Deuda menor:** la barra de «Concentración» dejó de ser un enlace a Por pagar (sus tramos son botones).
  Si se extraña, se agrega un «Ver por pagar →» al pie de la tarjeta.

## 🎯 El dinero de Compras es solo del líder + «Recibidas» por envío (2026-09-19, ADR-0126)

PR #178, fusionado el 2026-09-19 (`cb35240`). **Las dos migraciones están aplicadas en producción** (las pegó Felipe ese
día y se verificaron: ADR-0126, «Verificado en producción»). Cierra los huecos que dejó Recibir por envío:
un integrante leía los montos de su sede por tres puertas —5 funciones, las tablas de Compras y el bucket de
escaneos—; cerrar solo las funciones no habría servido. `pnpm pruebas:dinero-compras` (32 casos, también con
`--en-seco`), `pruebas:compras-indicadores` (144/144), `pruebas:compras-faltantes` (112/112) y `pruebas:recibir-envio` (29/29) en
verde; tipos, lint y 1062 pruebas unitarias en verde.

**Migraciones (aplicadas en producción, en este orden):**

1. `20260919160000_dinero_de_compras_lectura_operativa.sql` (A) — aditiva: nada deja de funcionar al pegarla.
2. `20260919161000_dinero_de_compras_tablas_solo_lider.sql` (B) — **después de A y de que Vercel haya desplegado**. Se
   niega a correr si la A no está («Pega primero …»). Es la que cierra las tablas y el bucket.

- [x] **Pegar A y luego B** en el SQL Editor de producción: hecho el 2026-09-19. El editor muestra solo el resultado
      de la última instrucción: no esperes ver la lista de firmas al pegar A.
- [x] **Verificar tras pegar (base de datos):** 5 de 5 funciones de dinero con candado, sin sobrecargas; las 5 políticas
      y el bucket con la regla nueva; una colaboradora real recibe `42501` en las 5 funciones de dinero mientras las de
      recibir le responden, y a la líder todo le responde.
- [ ] **Verificar en pantalla (Felipe):** abrir `/recibir` como colaborador (Micaela, Tienda Trujillo): lista y líneas
      sin ningún «S/», y `/inventario/recibir` sin la columna de costo. Como líder, `/compras` y `/compras/por-pagar`
      iguales que antes. Producción aún no tiene facturas: la primera será la prueba real.
- [x] **Refrescar el volcado y el diccionario:** hecho el 2026-09-19 (174 funciones, las 5 políticas y, de paso, 2
      funciones de Movimientos que faltaban). `datos:comparar` ya no marca `lineas_compra_operativo`.
- [ ] **Regla para la sesión de Compras:** después de pegar cualquier migración que recree `resumen_compras`,
      `resumen_compras_extra`, `deuda_por_vencimiento`, `salidas_caja_30d` o `por_pagar_tramos`, correr
      `select retail.fn_aplicar_candado_de_dinero();`. Una migración puede llevar, al final y sin depender del orden:
      `do $$ begin if to_regprocedure('retail.fn_aplicar_candado_de_dinero()') is not null then perform retail.fn_aplicar_candado_de_dinero(); end if; end $$;`
- [ ] **Decisiones que este ADR NO toma (para Felipe):** (1) `fn_productos` devuelve `costo` y `precio` a cualquier
      usuario con sesión y el catálogo no lo esconde: hoy un integrante ve el costo unitario de cada prenda; (2)
      `proveedores_select` deja a cualquier sesión leer RUC, teléfono, **banco y cuenta bancaria** de todos los
      proveedores. Ambos tocan otros módulos (Inventario/Productos/Vender; Proveedores).
- [x] **«Recibidas recientemente» agrupada por envío:** las filas de un envío de 2+ proveedores salen bajo una cabecera
      «Envío de N proveedores · Guía …» con lo que llegó y lo que faltó (`agruparPorEnvio`, sin migración: lee
      `lotes.envio_id`). Si el tope de filas corta un envío, no pinta totales de una parte.
- [x] **Diccionario al día con Recibir por envío:** `envios`, `envio_extras`, `envio_traslados` y `lotes.envio_id`
      entraron a `docs/datos/generado/` (refresco acotado a esas tablas contra producción, 2026-09-19). Producción
      tiene 0 filas en `lotes` y en `envios`.

## 🎯 Cambios: flujo guiado, motivo y estado de la prenda que vuelve (2026-09-18, ADR-0125)

Felipe no quedó convencido con la pantalla del PR #128 y pidió primero una auditoría y
después un rediseño profundo (brief detallado: flujo en 4 pasos, validaciones visibles,
impacto en inventario/caja, estados, accesibilidad, responsive). Adaptado a lo que CAYLA
tiene de verdad — detalle y descartes en ADR-0125.

- [x] **Migración `20260919000100_cambios_motivo_y_estado_de_prenda.sql`** — `cambios.motivo`
      (lista cerrada) y `cambios.condicion` (vendible → piso / no_vendible → cuarentena, R-39);
      candado "un cambio por defecto no vuelve al piso"; `prendas_danadas.cambio_id` (la
      cuarentena de Devoluciones recibe también lo de Cambios); `registrar_cambio` rechaza
      ventas anuladas (antes duplicaba stock). Aplicada en local; `pruebas:registrar-cambio`
      18/18 (13 viejas con la firma de antes + 5 nuevas).
- [x] **Migración aplicada en producción el 2026-09-19 (pegada por Felipe; verificada: una sola
      `registrar_cambio` de 8 parámetros, `{postgres, authenticated}`, columnas, candados e índice
      único) — el front ya puede fusionarse.** Lo que sigue es lo que se hizo ANTES de fusionar el front: La firma nueva
      acepta las llamadas viejas (defaults), la pantalla nueva no funciona contra la firma
      vieja. Pegar el archivo tal cual (ya trae `retail.`), confirmar en `pg_proc` UNA
      sola `registrar_cambio(uuid,uuid,uuid,integer,text,uuid,text,text)`, y recién
      después fusionar. Necesita el ok de Felipe (cambio de esquema en producción).
      **Prerrequisitos verificados contra producción el 2026-09-19 (solo catálogo, sin datos):**
      una sola `registrar_cambio` de 6 parámetros con el candado de caja de `20260916180000`;
      `cambios` sin `motivo`/`condicion`; `prendas_danadas` con `devolucion_item_id NOT NULL` y sin
      `cambio_id`; `movimientos.cambio_id`, `ventas.estado` y las tres `fn_*` auxiliares existen;
      cada tienda tiene su cuarentena; ninguno de los dos candados nuevos existe aún.
- [x] **`/cambios` rehecha** — bloques "Iniciar un cambio" y "Actividad reciente" (últimos
      15 días, filtros Todas / Con cambio / Sin comprobante); flujo guiado Venta → Prenda →
      Reemplazo → Confirmación → éxito sin modal; validaciones en vivo con foco al campo
      que falta; impacto en inventario y caja; buscador único (boleta, DNI/RUC, nombre de
      clienta, nombre o etiqueta de la prenda); "Buscar en" solo para líderes (RLS);
      "Tallas que no calzan" para líderes; `/devoluciones?item=` abre la prenda que viene
      de Cambios. Componentes: `CambiosPanel`, `CambiosBuscador`, `CambiosVentas`,
      `CambiosFlujo`, `CambioReemplazo`, `CambioResumen` (reemplazan a `CambiosLista` y
      `CambioFormV2`). Reglas puras con 35 pruebas en `cambios-reglas.test.ts`.
- [x] **De paso:** la lista de Cambios pedía todas las líneas de la sede sin orden
      (PostgREST corta en 1000) — ahora elige las ventas en Postgres; `--color-papel` a
      blanco cálido `#fbf6ec` en todo el sistema (pedido de Felipe).
- [ ] **Verificar con sesión real** — la vuelta se probó con datos de ejemplo (el panel del
      navegador no tenía login): falta buscar contra datos reales y registrar un cambio de
      punta a punta hasta la pantalla de éxito.
- [ ] **Decisiones de dinero/política que Felipe dejó en pausa (no tocadas):** (1) la
      diferencia de precio de un cambio no emite boleta ni nota de crédito —el título "Cambios
      no emitían NC — CERRADO" de más abajo solo es cierto para Devoluciones—, y el método
      arranca en efectivo cuando R-37 dice que devolver plata es lo último; (2) excepciones al
      plazo de 15 días / "cambio extendido" de R-33 (hoy el plazo solo lo controla la pantalla).
- [ ] **Ideas que quedaron fuera a propósito:** buscar por teléfono (no existe el dato:
      necesita la base de clientas de R-33); cambio de una venta que nunca se registró (R-15,
      toca el núcleo); paleta de comandos Ctrl+K global (toca AppShell y todos los módulos);
      endurecer `cambios.motivo` a obligatorio en la base cuando ya no haya pantallas viejas.
- [x] **Devoluciones tenía el mismo hueco de venta anulada — CERRADO 2026-09-18** en la base
      local por la otra sesión (`20260918163712_devolucion_rechaza_venta_anulada.sql`, rama
      `claude/blissful-mccarthy-3b06e5`, **no está en producción**). Al fusionar, la pantalla
      nueva de Devoluciones ya etiqueta la venta anulada y no deja elegir sus prendas.
- [x] **"Actividad reciente" en una tarjeta por venta, no una fila por prenda — CERRADO
      2026-09-22**, mismo patrón que Devoluciones (tarea #8 de `docs/pantallas/devoluciones.md`).
      La tarjeta resume prendas · importe, un chip de plazo por venta y una nota si ya tuvo
      actividad previa; el botón "Iniciar cambio" entra al paso "Prenda" sin preseleccionar
      nada. `totalesVenta` y `actividadPreviaVenta` se comparten con Devoluciones en
      `cambios-reglas.ts` (eran genéricas, no hablaban de devolución); el plazo vencido sigue
      bloqueando en Cambios y no en Devoluciones — `estadoPlazoVenta` y `estadoPlazoDevolucion`
      quedan separadas a propósito, con su propio texto. Sin migración. `ComprasAgrupadas` y
      `CambiosFlujo` no se tocaron — ya soportaban esto desde Devoluciones.

## 🎯 Movimientos: qué cambió en el stock y qué proceso lo originó (2026-09-19, ADR-0127)

**Cerrado esta sesión (PR #179); migración APLICADA en producción el 2026-09-19** —
`20260919155000_movimientos_referencias_y_busqueda.sql`
(`fn_movimientos_busqueda`, `fn_movimientos_de_comprobante`, `fn_movimientos` con 2 columnas
más, `fn_movimientos_resumen` con la misma búsqueda) + pantalla simplificada
(`FiltrosMovimientos.tsx`, `MovimientosLista.tsx`, `MovimientoDetalle.tsx`,
`lib/movimientos-reglas.ts`) + `coincideBusqueda` de Traslados. Ninguna tabla cambia;
ninguna escritura cambia.

**Hecho en producción (2026-09-19):**

- [x] **`20260919155000_movimientos_referencias_y_busqueda.sql` aplicada ANTES de fusionar el front**,
      con la autorización de Felipe: ensayo completo en una transacción revertida contra datos reales
      (464 movimientos, 4 sedes; lo que no debía cambiar dio idéntico, Traslados 1–4 y seis boletas
      reales dieron lo esperado, los permisos por sede se respetan), después `apply_migration` con el
      texto exacto del archivo. Verificado: una sola firma por función, `anon` sin EXECUTE, permisos
      idénticos a la versión anterior, `md5(prosrc)` de las cuatro funciones igual al del archivo.
      Detalle en «Consecuencias» de ADR-0127.

**Pendiente:**

- [ ] **Refrescar el volcado de producción de `docs/datos/generado/`** (`generado/COMO-REFRESCAR.md` y
      luego `pnpm datos:generar:produccion`): describe todavía `fn_movimientos` sin las dos columnas
      nuevas y sin las dos funciones nuevas. Mientras no se refresque, `datos:comparar` no puede
      confirmar esta firma (arma los parámetros con `...`, queda «no analizada»).
- [ ] **Una vez desplegado el front, mirarlo con una sesión real de líder en producción**: «Traslado 1»
      en el buscador de Tienda AQP o TRU y clic en la referencia. No se pudo hacer desde la sesión que
      lo construyó (sin credenciales); la base ya está verificada, falta ver la pantalla.
- [ ] **Decisión de negocio: ¿numeración corrida para ventas, devoluciones, cambios y recepciones?**
      Hoy solo traslados y conteos tienen número; «Venta 184», «Recepción 31» o «Devolución 7» no
      existen. La columna «Referencia» muestra lo que hay: comprobante (`Boleta B001-000184`),
      factura de compra o guía. Numerar es una migración de cuatro tablas con backfill y preguntas
      de negocio (¿el número de venta es el de la boleta?, ¿uno por sede o global?, ¿y una venta sin
      comprobante?). Si en la operación se empieza a decir «la venta 184» en voz alta, conviene;
      si no, el comprobante alcanza.

**Deuda conocida (no bloquea):**

- [ ] **Traslados busca solo entre los en curso y los 30 cerrados más recientes.** Escribir el
      número de un traslado cerrado hace meses no lo encuentra en Traslados (desde Movimientos
      sí se llega: el enlace abre el detalle por id). Hoy no se nota. Si molesta, la búsqueda
      por número pasa al servidor.
- [ ] **A ~800 px con el menú lateral abierto la tabla de Movimientos hace scroll horizontal
      dentro de la tarjeta** (el mínimo de sus cinco columnas es ~500 px y la tarjeta mide ~430).
      Es el contrato de `ui/Tabla.tsx`, compartido con Compras; se ve bien desde ~1000 px y en
      celular (apilada). Si molesta, el breakpoint de la grilla sube de `sm` a `lg` para esta tabla.
- [ ] **El nombre de proceso cambió también en el Historial de producto** («Reposición» →
      «Ajuste · reposición», «Transferencia · llegada/salida»): mismo nombre en todas partes, pero
      es un cambio visible fuera de esta pantalla.

## 🎯 Devoluciones con el mismo modelo que Cambios (2026-09-18, ADR-0122)

Felipe aprobó el flujo de Cambios y pidió repetirlo en Devoluciones. Sin migración ni backend:
solo pantalla y lectura. Detalle, decisiones tomadas por él y descartes en ADR-0122.

- [x] **`/devoluciones` rehecha** — «Iniciar una devolución» (buscador único, escanear, sin
      comprobante), «Por aprobar» (para un líder: prendas, estado, lo que pagó la clienta,
      aviso de plazo, reembolso opcional con aviso de caja cerrada) y «Actividad reciente»
      (15 días, filtros). Flujo guiado Venta → Prendas → Detalle → Confirmación → registrada,
      con **varias prendas en una sola devolución** (una nota de crédito en vez de varias
      parciales). Piezas compartidas con Cambios: `getVentasRecientes`, `FlujoGuiado`,
      `ComprasAgrupadas`, `BuscadorVentas`. 26 pruebas nuevas en `devoluciones-reglas.test.ts`.
- [x] **Hueco cruzado cambio↔devolución cubierto en PANTALLA**: `unidadesDisponibles` descuenta lo
      cambiado y lo devuelto en las dos pantallas; una prenda con devolución registrada ya no
      ofrece «Iniciar cambio» y al revés.
- [ ] **La BASE sigue sin ese candado — hueco real de otra clase que el de venta anulada.**
      `crear_devolucion` cruza solo contra devoluciones y `registrar_cambio` solo contra
      cambios: una línea cambiada se puede devolver por otra vía y la prenda vuelve al stock dos
      veces (0 casos locales). Mismo arreglo que el de venta anulada, en su propia migración.
      **Necesita tocar `crear_devolucion` y `registrar_cambio`: coordinar con la migración
      `20260918163712` (otra sesión) para no dejar dos sobrecargas.**
- [ ] **Plazo de 15 días en Devoluciones: hoy solo se AVISA, no bloquea** (decisión mía por Felipe,
      reversible en `estadoPrendaDevolucion`). Falta que Felipe diga quién decide pasado el plazo
      (¿solo un líder?, ¿con motivo escrito?), y si una prenda con defecto de fábrica debe poder
      devolverse pasado el plazo (no está escrito en R-38; conviene revisarlo con quien lleve lo legal).
- [x] **`devoluciones.motivo_codigo` estructurado — CERRADO 2026-09-22 (D-79, ADR-0158).** La
      migración de venta anulada de otra sesión (`20260918163712`) no llegó a `origin/main` antes de
      esta, así que no hubo colisión que esperar. Lista cerrada: talla, calce, defecto, no_le_gusto,
      regalo, otro — candado en `crear_devolucion` (`p_motivo_codigo`, sin default), no solo en la
      pantalla; `DevolucionesFlujo.tsx` ya la usa con chips de un toque. La columna `motivo` (texto
      libre) sigue igual, para lo que la clienta cuenta de más. **Sin aplicar en producción**
      (`supabase/migrations/20260922180000_devoluciones_motivo_estructurado.sql`, espera revisión de
      Felipe). Prueba `pnpm pruebas:crear-devolucion-motivo` (8/8). **Prohibido explícitamente por
      Felipe:** este dato es para revisar el calce por prenda con el Taller — nunca para rankear,
      puntuar ni comparar asesoras; nada en esta migración ni en el código que la acompaña lo agrupa
      por colaboradora. `cambios.motivo` (20260919000100, ya en producción) NO se tocó: tiene su
      propio vocabulario (talla_chica/talla_grande/otro_color/defecto/otro), más granular para lo que
      el Taller necesita de Cambios, y unificarlo con el de arriba es una decisión de Felipe que
      queda abierta (ver ADR-0158, sección "por qué cambios.motivo no se toca").
- [x] **"Actividad reciente" en una tarjeta por venta, no una fila por prenda — CERRADO
      2026-09-22** (`docs/pantallas/devoluciones.md`, tarea #8: "un chip y una acción por
      boleta, no por línea"). La lista repetía la misma pregunta dos veces: la tarjeta mostraba
      cada prenda de la venta y el paso "Prendas" del flujo la volvía a mostrar. Ahora la tarjeta
      resume la venta (prendas · importe, un chip de plazo, y si ya tuvo un cambio o devolución) y
      un solo botón "Iniciar devolución" que entra al paso "Prendas" sin nada preseleccionado — ahí
      se elige qué prenda, con la misma elegibilidad de siempre (una ya procesada no bloquea el
      resto de la venta). Los resultados de "Iniciar una devolución" (buscar/escanear) NO
      cambiaron: ahí sigue una fila por prenda, porque la colaboradora ya apunta a una puntual.
      `ComprasAgrupadas` ahora acepta `renderCompra` además de `renderFila` (unión discriminada,
      Cambios no se tocó); nuevas `estadoPlazoDevolucion`, `totalesVenta` y `actividadPreviaVenta`
      en `devoluciones-reglas.ts`, con 8 pruebas nuevas. Sin migración: solo pantalla y lectura.
- [ ] **Token de idempotencia en `crear_devolucion`** (como `registrar_cambio`, ADR-0032): sin él,
      una red que se corta después del commit deja un reintento que sale con «ya se devolvieron…».
- [ ] **La nota de crédito usa `precio_unitario` sin restarle `descuento_unitario`**
      (`aprobar_devolucion`, ADR-0100) y la diferencia de un cambio tampoco: en una línea con
      descuento (149.90 con 15 de descuento) se acredita de más. La pantalla ya muestra lo que
      pagó de verdad. Es plata: confirmar con Felipe/contador antes de tocarlo.
- [ ] **Verificar con clic real** `/devoluciones` con datos reales: el panel oculto del navegador no
      hidrata las páginas del menú. Falta registrar una devolución de punta a punta, aprobarla y ver
      la nota de crédito en Facturación.
- [x] **Números de ADR y de migración** (2026-09-19, al fusionar con `main`): los de Cambios,
      Devoluciones y Atelier pasaron de 0104/0105/0106 a **0125/0122/0123** (main usaba esos
      números; el 0121 lo tomó Resumen de inventario mientras tanto y el 0124 lo reservó Facturación) y la migración de `20260918150000` a `20260919000100` (esa hora la ocupa
      `compras_filtro_tipo_documento`); ahora es re-ejecutable, porque en la base local ya estaba
      aplicada con el nombre viejo.

---

## 🎯 Recibir por envío: varios proveedores, una guía, cuenta cualquiera (2026-09-18, ADR-0113)

**En `main` y en producción** (PR #172, fusionado el 2026-09-19; las 2 migraciones las pegó Felipe ese día). Tablas
`envios` / `envio_extras` / `envio_traslados` + `lotes.envio_id`, la RPC atómica e idempotente `recibir_envio`, y la
pantalla `/recibir` (`RecepcionEnvio.tsx`, reglas puras en `lib/envio-reglas.ts`). 29 pruebas SQL
(`pnpm pruebas:recibir-envio`), un envío real de punta a punta desde la pantalla como líder (2 proveedores + un regalo
+ un traslado del Taller). Decisiones de Felipe: un envío puede traer comprobantes de varios proveedores; una sola
guía por envío; lo fuera de comprobante declara su origen (proveedor, y si es regalo; lo de otra sede se confirma como
traslado, no como prenda suelta); cualquier persona cuenta en la puerta; los cuatro indicadores viven bajo «¿Qué
llegó?» y desaparecen al marcar.

- [x] **Spike visual de Recibir aplicado (ADR-0129, 2026-09-19):** resumen previo a recibir, decisión de faltante en
      un toque, escáner sin callejón + «Deshacer», «Marcar las atrasadas», gestos de movimiento y
      cajón de vista rápida en «Recibidas». Verificado en el navegador como líder contra la base local (un envío real de
      76 u.). **Falta:** verlo como colaborador (mismo punto de abajo) y las animaciones de salida (ver «Lo que no se portó»
      del ADR). Sin migración: solo pantalla.
- [ ] **Probar la pantalla como colaborador** (Micaela, integrante de Tienda Trujillo): no se pudo (el inicio de sesión
      pide contraseña y no se escribe). Qué mirar: ningún «S/» en la lista ni en los indicadores, «Entra al almacén de»
      fijo a su sede, sin editor de faltantes ni nota de crédito («Sigue pendiente»), y que `/compras` la devuelva al
      Inicio. En la base local hay comprobantes de prueba `TST-UI000003`/`UI000004` para Tienda Trujillo y
      `TST-UI000001`/`UI000002` (ya recibidos, envío `T009-UI01`): datos de prueba, no se borran.
- [x] **Las 2 migraciones están en producción** (`20260919120000_envios_recepcion_multiproveedor`,
      `20260919121000_recibir_envio`), verificadas contra la base. No hace falta registrarlas en
      `supabase_migrations.schema_migrations`: ahí solo constan las que aplica la herramienta de Supabase (las pegadas
      a mano, incluidas las de Compras, no) y `scripts/migraciones/verificar.mjs` no lee esa tabla.
- [x] **«Recibidas recientemente» vive en `/recibir?vista=recibidas`** con las pastillas de Compras (#174) y ahora
      agrupada por envío (ADR-0126).
- [x] **Hueco de ADR-0075** (montos legibles por un integrante): cerrado por ADR-0126.

Siguiente, sin urgencia: borrador local del conteo; miniaturas de prenda; ni `recibir_compras` ni `recibir_lote`
sueltos tienen token de idempotencia (solo `recibir_envio`). **Cruce:** ADR-0139 (antes 0107, 0132 y 0138; `modulos-por-tienda`, un comprobante
repartido entre tiendas) reescribe las mismas funciones; el tope por tienda va dentro de `recibir_compras`.

## 🎯 Vender: comprobante impreso en térmica + ajustes del POS (2026-09-18, ADR-0114)

Worktree `buscar-entry-point-7aa994`, **sin commitear**. Sin migración. 414 pruebas, `tsc` y `eslint` en verde;
verificado en navegador con datos de mentira (ruta temporal, borrada). **Falta la primera venta real.**

- [x] **Comprobante impreso (80 mm) + modal «Venta registrada» útil**: vuelto a entregar, número y estado,
      subtotal/IGV, pagos, cliente, líneas; botón «Imprimir comprobante» (no cierra el modal). Recibo con
      «SON: …», QR de SUNAT, fecha de Lima. `VentaRegistradaModal.tsx`, `ReciboTermico.tsx`,
      `lib/recibo-reglas.ts`, CSS de impresión en `globals.css`. También imprime con Ctrl+P.
- [x] **Datos del emisor** en `lib/emisor.ts` (CAYLA S.A.C., RUC 20605964550, dirección, teléfono, correo,
      web, régimen, lema — dados por Felipe): el ticket sale completo sin configurar nada. Override opcional
      con `NEXT_PUBLIC_EMISOR_*`. Rediseño del ticket sobre el modelo de Alegra (logo en negro, TOTAL enmarcado).
- [ ] **⚠️ Numeración al cambiar de PSE**: el último ticket de Alegra fue `B001-00005806`. Si la serie de
      boletas de este sistema también es `B001` y arranca en 1, SUNAT rechaza duplicados: continuar el
      correlativo o usar serie nueva ANTES de emitir en producción (`series_comprobantes`).
- [ ] **Resolución de autorización del PSE** (`NEXT_PUBLIC_EMISOR_RESOLUCION`): el ticket de Alegra imprime la
      de Alegra; la de Lucode la tiene Felipe. Vacía = no se imprime.
- [x] **«Imprimir y nueva venta»** (Enter): un toque en vez de tres tras confirmar; «Solo imprimir» y «Sin
      imprimir» como salidas raras. Falta activarlo en cada PC de caja con Chrome `--kiosk-printing`
      (`docs/OPERACION-IMPRESORA-TERMICA.md`).
- [x] **Atajos F1–F5** (#3 de la simulación): F1 efectivo, F2 tarjeta, F3 yape, F4 plin, F5 transferencia; en
      «cobrar» agregan/quitan el medio, en «armar» con prendas pagan todo con ese medio y saltan al cobro.
      Pista «F1»–«F5» en cada chip. Verificado con teclado real.
- [ ] **Siguientes de la simulación de venta** (medida real: 8 toques, <0.5 s de sistema): elegir el método
      desde «armar» (**probado el 2026-09-18 como fila «Cobrar con» sobre «Cobrar» y Felipe la descartó por
      poco estética** — si se retoma, otro diseño); un atajo para CONFIRMAR el cobro (Enter no sirve: el foco vive en el escáner); «Pendiente de enviar» → texto
      claro para la cajera; mostrar «Recibido» en el modal; reimprimir desde «Ventas de hoy».
- [ ] **Probar con la térmica real**: papel «80 mm rollo», márgenes ninguno, escala 100 %; para cero diálogos
      Chrome con `--kiosk-printing` en la PC de caja. Y **escanear el QR** con un lector.
- [ ] **«Nota de venta»**: no existe como opción de Vender (`boleta | factura`). Es un documento sin valor
      tributario (ADR-0007): decisión de negocio y de esquema de Felipe.
- [ ] **Reimprimir desde «Ventas de hoy»**: hoy solo se imprime al cobrar. Reconstruir el recibo desde
      `venta_items` + `venta_pagos` + `comprobantes` (el vuelto no se guarda).
- [ ] **Dirección por tienda** (`ubicaciones` no la tiene; hoy se imprime el domicilio fiscal) y, a futuro,
      «reimprimir el oficial» con el `pdf.ticket` de Lucode cuando la transmisión sea automática.
- [x] Ajustes del POS pedidos en la sesión: «Solo con stock» como interruptor **activo por defecto** con
      contador de agotadas; tarjeta tocable → modal de talla (**una sola talla vendible se agrega directo**);
      avisos de tope por `avisar` + resaltado rojo de la tarjeta (`anim-tope`); un color por método de pago;
      tocar de nuevo un método lo quita y **traspasa su monto al siguiente**; subtotal e IGV en el pie.
- [ ] **Revisar `/caja`**: los tokens `--color-metodo-*` son compartidos con la dona de Caja y cambiaron
      (efectivo azul→cobrizo, tarjeta ámbar→plomo, «Yape / Plin» verde→morado). Decidir si esa dona separa Yape y Plin.
- [ ] **Sincronizar con `main` antes de pushear**: la sesión `ventas-visual-redesign-240e2b` también toca
      `globals.css` (tokens) y dice que «Punto de Venta sigue» en su rama.
## 🎯 Anulación de ventas: el repo se pone al día con producción (2026-09-18)

Se buscaba cerrar «devolver una venta ya anulada vuelve a meter la prenda al stock» (ítem
«CONFIRMADO 2026-09-18» de la rama de Cambios, cuyo ADR provisional es el 0104 y ya choca con
el del aviario de `main`: se renumera al fusionar), confirmado contra `pg_proc` del
Postgres local. **En producción ese hueco no existe:** `20260916214500_anular_venta_sin_huecos`
está aplicada allá desde el 2026-09-16 (triggers `devolucion_items_venta_no_anulada` y
`cambios_venta_no_anulada`, `anular_venta` endurecida, `venta_anulacion_items_una_vez_por_linea`
y un `cerrar_caja` que no cuenta el efectivo de ventas anuladas), pero **nunca se subió al
repo**: no está en `main`, ni en ningún worktree, ni en el historial de git de ninguna rama.
El repo y el local iban atrás; el hueco solo era real ahí. Verificado el 2026-09-18 contra
`cayla-dynamic` (solo lectura): 0 ventas anuladas y 0 devoluciones, pendientes o aprobadas,
sobre una venta anulada — no hay nada que limpiar.

- [x] **`20260916214500_anular_venta_sin_huecos.sql`** — reconstruida desde `pg_proc` y
      `pg_constraint` de producción. **No es el original**: si el archivo real tocaba algo que
      no se ve desde afuera, no lo sé. El cuerpo de `anular_venta`, `cerrar_caja` y
      `fn_linea_de_venta_no_anulada` coincide por huella md5 con el de producción; una sola
      sobrecarga de cada una; permisos intactos. Idempotente: pegarla en producción no cambia
      nada. Probada en local: `pnpm pruebas:aprobar-devolucion-caja` 5/5 (los 3 nuevos se
      vieron en rojo antes: crear una devolución sobre una venta anulada prosperaba, y el
      arqueo daba 179.90 en vez de 100 por el efectivo de la venta anulada), más
      `registrar_cambio` 13/13, `fn_aplicar_movimiento` 11/11 y `registrar_venta` 22/22.
      Una migración anterior de esta sesión (guards dentro de `crear_devolucion` y
      `aprobar_devolucion`) se descartó: era redundante con el trigger.
- [ ] **En producción no hay nada que pegar.** El archivo solo alinea el repo con lo que ya
      corre. Otras sesiones con el Postgres local ya migrado necesitan
      `npx supabase migration up --local --include-all` (su timestamp es anterior a otras
      ya aplicadas).
- [ ] **Hueco chico que sí queda:** `aprobar_devolucion` no mira `ventas.estado`. En
      producción el estado no se alcanza (el trigger impide crear la devolución y
      `anular_venta` se niega si hay una pendiente), así que no se le agregó guard: sería la
      sexta redefinición de esa función por un caso inalcanzable.
- [ ] **Al fusionar con la rama de Cambios (su ADR provisional 0104 choca con el del aviario;
      hay que renumerarlo):** su ítem «Devoluciones tiene el mismo
      hueco de venta anulada» no aplica a producción → cerrarlo apuntando a esta entrada. Su
      guard «Esa venta está anulada» dentro de `registrar_cambio` queda redundante con el
      trigger `cambios_venta_no_anulada` (inofensivo, el trigger es el candado real), y su
      motivo («volvía a meter al stock una prenda que la anulación ya devolvió») es cierto
      solo del repo.
- [ ] **Comparación completa `retail`: producción vs Postgres local, por huella md5
      (2026-09-18).** Se compararon funciones (cuerpo sin comentarios + firma + `security definer`
      + volatilidad + `search_path`), triggers, restricciones, índices, políticas RLS, columnas,
      tablas (con su RLS) y vistas. **Sin comparar:** los datos (filas, seeds), secuencias,
      extensiones, buckets de Storage, el schema `public` (Dynamic), jobs y publicaciones
      realtime. Resultado: 51 de 61 tablas y 119 de 128 funciones son idénticas; las vistas (3),
      también. Las diferencias son de cuatro clases:
      - **A. Solo en producción, sin archivo en el repo (deriva real, hay que reconstruirla).**
        1. `anular_venta_sin_huecos` — ya traída al repo (primer commit de esta rama).
        2. `registrar_movimiento_una_sola_firma`: producción tiene UNA `registrar_movimiento`
           (7 parámetros con defaults); el repo y el local, DOS (la de `0003`, de 6, y la de
           `20260914230000`, de 7: un `create or replace` con otra firma crea otra sobrecarga,
           el hueco de ADR-0009/0004). La lógica de la de 7 es idéntica (md5 sin comentarios).
           En el local, llamarla sin `p_sububicacion_id` da «is not unique» (probado), y
           `AjustarInventarioModal` lo omite en ubicaciones sin piso/almacén: ajustar
           inventario ahí falla en el local y anda en producción.
        3. `catalogo_actualizar_producto`: mismo hueco. Producción tiene una sola firma (12
           parámetros, con `p_tejido_id`/`p_patron_id`); el local conserva además la de 10.
        4. `historial_producto_estado_restaurado`: `fn_registrar_cambio_producto` de
           producción registra el cambio de `estado` del producto; la del repo no.
           `20260915223000_historial_producto_estado` lo agrega y
           `20260916090000_costo_promedio_ponderado` redefine la función sin ese bloque y lo
           pisa. Efecto: descontinuar o reactivar un producto no deja fila en el historial en
           el local ni tras un `db reset`.
        5. `historial_candado_completo`: producción tiene `fn_historial_sin_truncate` y el
           trigger `movimientos_sin_truncate` (`BEFORE TRUNCATE` sobre `movimientos`); el repo
           no. En el local, `TRUNCATE ... CASCADE` sobre `movimientos` vaciaba el libro
           append-only sin quejarse (principio 4); un `TRUNCATE` a secas ya lo frenaban las
           llaves foráneas. El repo no usa `truncate` en ningún seed, script ni
           migración: traerlo no rompe nada. `costo_historial` e `historial_producto_cambios`
           tampoco están protegidas contra `TRUNCATE` en producción.
        6. `compras.token_cliente`, índice `compras_token_cliente_key` y
           `registrar_compra(..., p_token)`: candado de idempotencia sin archivo (ya lo dice la
           cabecera de `pegar-en-produccion-compras-atraso-recepcion.sql`). El local no lo
           tiene, y `20260918130000_compras_atraso_recepcion` (numerada) tampoco lo preserva.
        7. `gastos` (tabla, índices, restricciones, política) y `registrar_gasto`: solo en
           producción. En el repo hay únicamente archivos para pegar (`SQL-PENDIENTE-
           PRODUCCION.sql`, `supabase/unificacion/05_operacion.sql`), ninguna migración
           numerada.
        8. `tejidos.imagen_muestra_url` y `patrones.imagen_muestra_url`: columnas solo en
           producción (el repo la agrega solo a `colores`).
        9. Índice `variante_etiquetas_etiqueta_idx`: solo en producción.
        **Estado de la clase A (2026-09-18): 1 a 5 ya están en el repo.** Las cuatro nuevas
        (2 a 5) son migraciones reconstruidas e idempotentes, con la versión con que quedaron
        registradas en producción, salvo la del candado: `20260916200001`, porque
        `20260916200000` ya es de `numeracion_traslados_conteos` y una versión repetida rompe
        `migration up`. `pnpm pruebas:deriva-produccion` 6/6 (0/6 antes de las migraciones);
        `registrar_venta` 22/22, `registrar_cambio` 13/13, `fn_aplicar_movimiento` 11/11 y
        `aprobar_devolucion_caja` 5/5 sin regresión. Las huellas de
        `fn_registrar_cambio_producto` y `fn_historial_sin_truncate` son idénticas a las de
        producción. **En producción no hay nada que pegar.** Ya están aplicadas al Postgres
        local compartido (dos de ellas borran sobrecargas). No se corrió un `db reset`
        completo porque esa base la usan ~27 worktrees: el orden se verificó por análisis
        (ninguna migración posterior toca esas firmas). **8 y 9 también
        traídas** (`20260918171000_tejidos_patrones_imagen_muestra_e_indice_etiquetas`,
        reconstruida desde el estado vivo porque no hay SQL original; el front solo usa
        `imagen_muestra_url` de `colores`, así que no rompía nada). `pnpm
        pruebas:deriva-produccion` pasa a 8/8. De las 10 tablas que diferían de producción,
        4 quedan idénticas (`movimientos`, `patrones`, `tejidos`, `variante_etiquetas`); las 6
        restantes son las de otras clases: `compras` (6) y `gastos` (7), `cambios` y
        `prendas_danadas` (B, rama de Cambios), `categorias` y `familias` (C, atraso del
        local). **Falta:** 7 (`gastos`), que necesita decisión de Felipe (el 6 ya está, ver abajo). **Ojo con los originales:**
        de las 5 migraciones de producción reconstruidas, 4 están registradas allá SIN SQL
        (`schema_migrations.statements` vacío: se pegaron a mano y se marcaron aplicadas), así
        que no hay original que recuperar; solo la de `catalogo_actualizar_producto` guarda su
        SQL, y es idéntica a la reconstruida.
        **Compras (6), reconciliada:** `20260918180000_compras_token_cliente_idempotencia`
        (columna `token_cliente`, índice único `compras_token_cliente_key` y `registrar_compra`
        de 15 parámetros). Es una migración numerada nueva, posterior a
        `20260918130000_compras_atraso_recepcion`, en vez de editar una ya aplicada: esa crea
        la firma de 14 y la nueva la borra. Huellas de la tabla `compras` y de
        `registrar_compra` idénticas a producción; `pnpm pruebas:deriva-produccion` 12/12. De
        las 10 tablas que diferían quedan 5 idénticas; restan `gastos` (7), `cambios` y
        `prendas_danadas` (B) y `categorias` y `familias` (C). **El front ahora manda `p_token`**
        (`CompraFormV2.tsx`, 2026-09-18): antes el candado estaba dormido y un reintento
        terminaba en «ya está registrada». Mismo patrón que Cambios y Ventas: el token se
        genera una vez por formulario y se renueva solo tras un éxito. Verificado en el
        navegador con la petición real (interceptada, sin escribir nada): sale con un UUID v4 y
        un reintento manda el MISMO token. `tsc`, `eslint` y 391 tests en verde.
        `packages/database/src/types.ts` ganó `p_token` a mano; los tipos siguen sin
        `p_fecha_estimada_llegada` ni `compras.token_cliente` y se arreglan al regenerarlos.
        `pegar-en-produccion-compras-atraso-recepcion.sql` queda gastado (producción ya tiene
        su resultado); no se borra.
        **Compras: producción tiene DOS `registrar_compra` (hallazgo 2026-09-18, al fusionar
        `main`).** Alguien pegó allá las migraciones de Compras de ADR-0111 (existen
        `proveedor_creditos` y `fn_consumir_saldo_favor`) sin registrarlas, y `20260918217000`
        redefine `registrar_compra` con 14 parámetros y sin `p_token`, al lado de la de 15. Hoy hay
        una de 14 (con saldo a favor, sin token) y una de 15 (con token, sin saldo a favor). Una
        llamada sin `p_token` —la del front desplegado— coincide con las dos y falla por ambigua:
        es muy probable que «Nueva compra» esté fallando en producción (no se comprobó llamando a
        la API). Una llamada con `p_token` iría a la de 15 y perdería el saldo a favor. Arreglo:
        `20260918219000_registrar_compra_una_sola_firma_con_token.sql`, una sola función de 15
        parámetros con las dos cosas, y borra la de 14; su cuerpo difiere del de ADR-0111 solo en lo
        del token. Probada en una transacción revertida sobre la sobrecarga que deja `217000`
        (`pnpm pruebas:deriva-produccion` 13/13). **Ya está aplicada en producción**
        (alguien la pegó sin registrarla en el historial de migraciones; verificado en solo lectura
        después: una sola firma, la consulta del pie da `1 | true | true | true` y el md5 del cuerpo es
        idéntico al de esta migración; no se escribió nada desde esta rama). En el Postgres local compartido NO se
        aplicó a propósito: tiene que entrar después de `217000`; si entrara antes, `migration up` la
        daría por aplicada y quedarían dos sobrecargas. Es la tercera vez en esta sesión que un
        `create or replace` con otra lista de parámetros crea una función nueva en vez de
        reemplazar (`registrar_movimiento`, `catalogo_actualizar_producto`, y esta): una prueba de CI
        de «una sola firma por función» atraparía toda la clase.
      - **B. En el repo, pero producción va atrás (pendiente de pegar, necesita el ok de
        Felipe).** `20260917120000_reactivar_rechazado_retira_rechazo`: la
        `fn_tallas_estado_trigger` de producción es la versión vieja (solo aprueba desde
        `pendiente`; no reactiva una talla rechazada ni pone `activo = true`), así que
        reactivar una talla rechazada no funciona en producción. Y lo de la rama de Cambios
        (`20260919000100_cambios_motivo_y_estado_de_prenda`, antes `20260918150000`: se renumeró al fusionar con `main`; sin aplicar en producción): `cambios.motivo`
        y `condicion`, `prendas_danadas.cambio_id`, `registrar_cambio` de 8 parámetros.
        **Estado de B (2026-09-18) — APLICADA en
        producción, solo la de tallas.** Se pidió pegar `20260917120000`. Al compararla con lo que
        ya corre allá, **el archivo entero no se puede pegar**: redefine cinco funciones y
        producción ya tenía la versión FINAL de cuatro (colores, tejidos, patrones y etiquetas
        coinciden por huella con el repo final). La de etiquetas de ese archivo es anterior a
        `20260917230000_etiquetas_vigencia_y_comentario_obligatorio`: pegarlo entero habría hecho
        RETROCEDER etiquetas. Solo `fn_tallas_estado_trigger` estaba atrás, y se aplicó esa
        función sola (`docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-18.sql`) con `apply_migration`,
        registrada como `20260919003414_fn_tallas_estado_trigger_reactivar_rechazado` (UTC), con
        su SQL guardado. Antes se probó en el local, revertido: con la función nueva una rechazada
        se reactiva y la base exige el comentario; con la de producción fallaba («Solo se puede
        aprobar una talla que todavía está pendiente»). Verificado en producción: mismo md5 de
        cuerpo que el repo final (`994940f7…`), una sola firma, un solo trigger
        (`tallas_estado_biut`), permisos intactos, las otras cuatro funciones con su huella de
        antes, y las 25 tallas siguen `aprobado`: ninguna fila cambió, solo se habilita reactivar
        una talla que se rechace en adelante. El primer intento lo denegó el clasificador de
        permisos y no se rodeó; se reintentó con la autorización explícita de Felipe. La
        migración vieja lleva una advertencia de «no pegar entera». **De B falta solo lo de la
        rama de Cambios**, que va con su propio PR.
      - **C. Atraso del local, no deriva** (el repo y producción coinciden, el local no las
        aplicó): `familias_tabla_propia` (tabla `familias`, 2 funciones y
        `categorias_familia_fk` en vez del CHECK) y `compras_filtro_tipo_documento`
        (`listar_compras(p_tipo)`). Se arreglan con `migration up --local --include-all`.
      - **D. Permisos.** En producción 0 de 128 funciones son ejecutables por `public` ni
        `anon`; en el local, 96 de 126. Un `db reset` es más permisivo que producción y no
        puede atrapar un error de permisos. No es un riesgo de producción, es una prueba
        que no prueba.
      - `fn_resumen_variantes`: la huella distinta de antes era solo de comentarios; sin
        comentarios coincide.
      - De las ~25 migraciones «huérfanas por nombre» que salieron antes, casi todas son
        ruido; la deriva real son las de la clase A.

## 🎯 Compras: indicadores para decidir, faltantes con nota de crédito y pago por lote (2026-09-18, ADR-0111)

Rama `claude/pantallas-proveedores-comprobantes-a15ece`. **`main` ya está fusionada en esta rama (2026-09-18,
local; sin push)**: tipos, tests, lint y las pruebas SQL en verde (99 entonces; 112 con las de «esperando nota»), y las 135 migraciones del repo se
reprodujeron limpias desde cero en un Postgres nuevo. Falta el PR contra `main`. Las 11 pantallas de `docs/maquetas/compras-2026-09/` están
implementadas en código (Por pagar, Recibir mercadería, Comprobantes, Registrar, Proveedores +
ficha, Ingreso sin comprobante). D1 (cantidades arrancan en 0), D2 (cerrar línea con faltante +
nota de crédito, libro append-only) y D3 (pagar varios comprobantes de un proveedor de una vez).
El ADR es el **0111**: main ya usa 0104–0107 y hay ramas abiertas con 0108, 0109 y 0110. Las 16 migraciones
van en la banda `20260918200000`–`20260918220000` (main trae su propia `20260918160000`, y otras dos ramas usan
`20260918170000`: una versión repetida rompe `supabase migration up`).

- [ ] **Pegar en producción las 16 migraciones, en este orden** (Felipe, con su ok). Verificado
      2026-09-18 contra la base de producción (`vovjyyiafkxteijimpuy`): ninguna está aplicada; todo
      lo anterior del repo, hasta `20260918150000`, sí. Las cuatro siguientes (12–15) llegaron el mismo día,
      tras la prueba de Felipe: nota de crédito estricta, saldo a favor del proveedor y recepción atómica; la 16 es
      solo una función de lectura nueva (no toca datos ni cambia ninguna otra función). `compras` tiene 0 filas en producción, así
      que la reconstrucción de `saldo/estado_pago/estado_recepcion` no toca datos. Cada archivo ya
      trae su `set search_path = retail, public, extensions;` (no hace falta el prefijo `retail.`).
      1. `20260918200000_fn_hoy_lima` — `fn_hoy_lima()`; reemplaza `current_date` (Lima, no UTC). **Producción ya
         tiene esta función** (la creó otra rama con el mismo cuerpo): este paso es `create or replace` y solo le
         agrega sus permisos; no falla.
      2. `20260918201000_compras_libro_cierres_y_notas_credito` — tablas `compra_item_cierres` y
         `compra_notas_credito` (append-only) + `compra_pagos.pago_grupo_id` + columnas snapshot.
      3. `20260918202000_compras_saldo_y_recepcion_con_cierres_y_notas` — `saldo = total − pagado −
         notas` y `pendiente = cantidad − recibido − cerrado`; triggers de foto, candados
         `compras_no_sobrepagada`/`compras_no_sobrerecibida` y vistas `compras_resumen`/`compra_items_resumen`.
      4. `20260918203000_registrar_pago_compras_por_lote` — pago de varios comprobantes juntos.
      5. `20260918204000_compras_cerrar_linea_y_nota_credito` — `cerrar_linea_compra`,
         `registrar_nota_credito_compra`.
      6. `20260918205000_compras_recibir_anular_y_listar_con_cierres` — `recibir_compras`,
         `anular_compra`, `listar_compras` conscientes de cierres y notas.
      7. `20260918210000_compras_resumen_hoy_lima_y_extra` — `resumen_compras`, `resumen_compras_extra`.
      8. `20260918211000_compras_deuda_tramos_y_salidas_de_caja` — `deuda_por_vencimiento`,
         `salidas_caja_30d`, `por_pagar_tramos`.
      9. `20260918212000_compras_recepciones_indicadores` — `resumen_recepciones`,
         `listar_recepciones_compras`.
      10. `20260918213000_compras_sin_comprobante_indicadores` — `resumen_sin_comprobante`,
          `recepciones_sin_comprobante`.
      11. `20260918214000_proveedores_indicadores` — `fn_proveedores` (+4 columnas),
          `fn_proveedores_resumen`, `fn_proveedor_metricas_compras` (+7), `fn_proveedor_costo_evolucion`,
          `fn_proveedor_devoluciones`.
      12. `20260918215000_compras_nota_credito_estricta_y_saldo_a_favor` — `compra_notas_credito.aplicado`,
          libro `proveedor_creditos`, reglas de la nota por faltante, `cerrar_linea_compra` sin nota.
      13. `20260918216000_recibir_y_cerrar_compras_atomico` — recibir + cerrar + nota en una transacción.
      14. `20260918217000_saldo_a_favor_como_medio_de_pago_y_reembolso` — medio `saldo_a_favor` en los tres
          pagos (`p_credito` en el lote) y `registrar_reembolso_proveedor`.
      15. `20260918218000_saldo_a_favor_lecturas` — `fn_proveedores`/`fn_proveedores_resumen` con saldo a favor,
          `fn_proveedor_creditos`.
      16. `20260918219100_registrar_compra_una_sola_firma_con_token_y_saldo_a_favor` — (renombrada desde `20260918219000` el 2026-09-19: chocaba de versión con `..._con_token`, de otra sesión; las dos son idempotentes, ya corrieron en producción y dejan la misma firma de 15 parámetros; esta va última porque además revoca a `anon`. La producción no lee nombres de archivo.) **CORRECCIÓN URGENTE**:
          al pegar la 217000 en producción, `registrar_compra` quedó con DOS firmas (14 y 15 parámetros) y
          Registrar comprobante falla con «function is not unique». Esta suelta la de 14 y deja UNA de 15
          (la de producción, con `p_token`) más el medio «Saldo a favor». Verificado en producción el
          2026-09-19 con `explain` (sin ejecutar nada). **YA APLICADA en producción (2026-09-19):** una firma de 15
          parámetros, ninguna función sobrecargada, el `explain` de la llamada de la pantalla resuelve.
      17. `20260918220000_compras_nota_pendiente_para_listas` — `compras_nota_pendiente(uuid[])`: los
          comprobantes con faltante cerrado y sin nota, para el chip «Esperando nota» de las listas. Solo líder;
          función nueva (sin overload ni cambio de retorno de `listar_compras`). Si la rama se despliega sin
          pegarla, las listas se dibujan igual, sin el chip (el error queda en el log del servidor).
      **Después de pegar:** desplegar la rama (las pantallas llaman a estas funciones — sin las
      migraciones, `datos:comparar` las marca rotas) y correr `pnpm datos:generar:produccion`.
- [ ] **Verificación visual contra las maquetas** (escritorio y móvil): el navegador integrado pide
      login y yo no ingreso contraseñas. Con sesión iniciada en `localhost:3000`, comparar cada
      pantalla con su PNG de `docs/maquetas/compras-2026-09/` y corregir desvíos.
- [ ] **Desvíos y huecos conocidos:** (a) ~~pestaña «Recibidas» usa el popover de `FiltrosCompras`~~
      **cerrado** (`FiltrosRecibidas` + `recibidas-filtros-reglas.ts`, rama `feat/recibidas-pastillas`;
      falta solo la comparación visual con el PNG de la maqueta 06); (b) «Completar costo» (ingreso sin
      comprobante) no está: falta una RPC para editarlo; (c) la evolución de costo sale de
      `compra_items`, no de `costo_historial`; (d) **prueba SQL de los indicadores: hecha**
      (2026-09-18) — `pnpm pruebas:compras-indicadores` (`scripts/pruebas/compras_indicadores.mjs`):
      145 casos en verde contra el Postgres local, cada uno en su transacción con ROLLBACK y midiendo
      una línea base antes de su escenario (el seed y otras sesiones cambian los números absolutos), más 1
      hallazgo abierto, H4 (siguiente ítem; H1, H2, H3 y H5 ya están corregidos); (e) `types.ts` ya se regeneró tras
      la fusión con main (hecho); (f) al pegar en producción: refrescar el volcado y correr
      `pnpm datos:generar:produccion && pnpm datos:comparar` (el aviario ya conoce las 3 tablas nuevas);
      (g) «esperando nota» ya no es solo del detalle: las listas de Comprobantes y Por pagar muestran el chip
      ámbar «Esperando nota S/ X» (con «Ya puedes registrarla» cuando el comprobante está resuelto; 13 pruebas SQL
      y las de `nota-pendiente-reglas`). Pendiente de ver con sesión: el chip en la celda Pago de Comprobantes
      (11 rem, más angosta que el chip) se apoya en el espacio libre de la columna Total; en Por pagar va bajo el
      proveedor. Aún no sale en Proveedores ni en el Inicio.
- [ ] **Hallazgos de `compras_indicadores.mjs`: H1, H2, H3 y H5 corregidos en la migración
      `20260918221000_compras_hallazgos_h1_h2_h3_h5.sql` (2026-09-19) — YA ESTÁ EN PRODUCCIÓN: Felipe la pegó el
      2026-09-19 y se verificó contra la base (una sola firma por función, `por_pagar_tramos` con 7 parámetros, solo
      `registrar_compra` conserva `current_date`, el default de la fecha de emisión). Se refrescó
      `funciones-produccion.txt` (167 funciones, misma huella que producción) y `pnpm datos:comparar` quedó en verde;
      **los seis `retail_*.json` del diccionario siguen atrasados** (producción tiene 70 tablas y vistas, 689 columnas,
      451 restricciones y 109 políticas; el volcado, 67/671/434/106: son tablas de otras ramas ya pegadas) y hay que
      refrescarlos con las consultas de `generado/COMO-REFRESCAR.md` en el SQL Editor.** Se reescribieron desde la definición REAL de
      producción (`pg_get_functiondef`, misma huella md5 que el local) y con la misma lista de parámetros, salvo
      `por_pagar_tramos` (suelta la firma vieja y estrena `p_tipo`, `p_desde`, `p_hasta`, todos con default: la
      pantalla actual sigue funcionando sea cual sea el orden en que se despliegue). **H1** la ficha calculaba
      `entregado_completo_pct` con `estado_recepcion = 'recibida'` y ahora usa `recibido_cantidad >=
      facturado_cantidad`, igual que `resumen_recepciones`. **H2** `fn_proveedor_devoluciones.ultima` toma
      `resuelto_en` (el día que se devolvió), no `created_at`. **H3** `por_pagar_tramos` acepta los filtros de
      tipo y de emisión, y `getPorPagarTramos` los manda. **H5** los pagos sin fecha explícita (`registrar_pago_compra`,
      `registrar_pagos_compra`, el pago inicial de `registrar_compra`) usan `fn_hoy_lima()`. Pruebas: 145 en
      verde en `compras_indicadores.mjs` (las 4 dejaron de ser `[HALLAZGO]`; se comprobó que fallaban antes de
      aplicar la migración), 112 en `compras_faltantes_y_pago_por_lote.mjs`, 29 en `recibir_envio.mjs`.
      **Sigue abierto, H4 — DECIDIDO DIFERIR (Felipe, 2026-09-19: «aún no hay restricciones por usuario, dejemos
      eso para más adelante»):** los indicadores de dinero que solo tienen candado de sede (`resumen_compras`,
      `resumen_compras_extra`, `deuda_por_vencimiento`, `salidas_caja_30d`, `por_pagar_tramos`) le devuelven a un
      integrante los montos de los comprobantes de SU sede (ADR-0075). No hay fuga hacia otras sedes; choca con
      «lo financiero es solo de líder». Se retoma cuando todo esté en producción, decidiendo si devuelven vacío o
      se quedan como están. **Anotado de paso:** `registrar_compra` aún tiene `p_fecha_emision date DEFAULT
      CURRENT_DATE` (UTC): el mismo defecto de reloj, pero la pantalla siempre manda la fecha del papel y cambiar el
      default de una fecha de EMISIÓN es una decisión distinta a la de un pago; no se tocó.

---

## 🎯 Compras: un comprobante se reparte entre tiendas y cada tienda recibe lo suyo (2026-09-19, ADR-0139) — EN PRODUCCIÓN desde 2026-09-20

Una misma factura de proveedor puede traer mercadería para varias tiendas y cada una hace su propia recepción. La base guarda el
reparto **por línea y tienda** y lo hace cumplir (suma, tope por tienda, reasignación con rastro). Diseño, decisiones y UX en ADR-0139.
**PR #203 fusionado; las migraciones `20260919172000` y `20260919173000` las pegó Felipe en producción y se verificaron en solo lectura
(2026-09-20):** objetos presentes, `compras.ubicacion_destino_id` eliminada, ninguna función/política/vista que aún la lea, candado de
dinero intacto, RLS sin permisos de escritura, triggers diferidos activos. Producción tenía 0 comprobantes: no hubo nada que rellenar.

- [x] **Base, web, aviario, privacidad (ADR-0126):** hechos y en producción (detalle en el ADR).
- [x] **Producción:** migraciones pegadas y verificadas; despliegue de la web confirmado.
- [x] **Diccionario de producción refrescado (2026-09-20):** refresco DIRIGIDO de `docs/datos/generado/` (tablas/vistas/funciones de este
      cambio) contra `cayla-dynamic`; 73 tablas, 185 firmas, `datos:comparar` sin pantallas rotas, aviario en verde. De paso se agregaron
      las firmas de 3 funciones de otras sesiones ya aplicadas en producción (`fn_resumen_comparacion`, `devolver_insumo_de_produccion`,
      `fn_recalcular_costo_insumos_produccion`) que hacían que `datos:comparar` las diera por «rotas».
- [x] **Candados nuevos en `docs/datos/01-INVARIANTES.md`** (suma del reparto, tope por tienda, reasignar solo lo pendiente, escritura solo por RPC).
- [x] **Comentarios de base de datos de producción alineados a «ADR-0139» (2026-09-21):** Felipe corrió el `COMMENT ON` y se comprobó en solo
      lectura que los 8 objetos (`fn_puede_ver_compra`, `reasignar_reparto_compra`, `lineas_compra_operativo`, `listar_compras_operativo`,
      `compra_item_destinos`, `compra_reasignaciones`, `compra_item_reparto_resumen` y `compra_item_cierres.ubicacion_id`) dicen «ADR-0139» y
      ninguno dice «ADR-0138» (número que hoy es del ADR de Comparar períodos, Inventario).
- [x] **Refresco COMPLETO del volcado (2026-09-21):** los 7 archivos de `generado/` comparados contra `cayla-dynamic` (solo lectura) con un
      hash por tabla y por grupo de funciones, y parchados solo donde difería; al final los 7 dan hash idéntico al de producción. Entraron: las 4
      tablas de Producción (`proveedores_produccion`, `comprobantes_produccion` y sus `_items`/`_pagos`; F4a/F4b), `venta_pagos.recibido` (Caja,
      ADR-0137), `compra_adjuntos.nota_credito_id`/`archivado_*` y las restricciones de `compra_notas_credito`, 14 firmas de funciones (entre ellas
      `fn_movimientos` con `p_producto_id`), los conteos de filas y 2 llaves hacia `public.personas`. 77 tablas y vistas, 196 funciones. Las 4 tablas de
      Producción se asignaron al Gallito en `scripts/datos/aviario.mjs` (sin pájaro el CI cae al próximo refresco): **la sesión de Producción lo confirma**.
      `datos:comparar` queda en 3 «rotas» a propósito: `apartar_stock`, `liberar_apartado` y `listar_apartados` (Apartar stock, ADR-0141, cuya migración
      `20260920160000` sigue sin pegar en producción; no es de esta sesión).
- [x] **Filtro y chip «Destino» en Comprobantes y Por pagar (2026-09-21, anexo del ADR-0139):** hecho y verificado en local (SQL 57/57, navegador:
      Trujillo = 5 comprobantes en Comprobantes y 4 con S/ 4,212.60 en Por pagar, cuadrando con los subtotales). Migración
      `20260921130000_compras_filtro_por_tienda_destino.sql`.
- [x] **`20260921130000_compras_filtro_por_tienda_destino.sql` pegada en producción por Felipe (2026-09-21) y verificada en solo lectura:** una sola
      firma de cada función (`listar_compras` con 18 parámetros, `por_pagar_tramos` con 8), cerradas a `anon`, con el candado de dinero puesto en
      `por_pagar_tramos`. El volcado (`funciones-produccion.txt`) ya trae las dos firmas nuevas (refresco completo del mismo día).
- [x] **Datos de prueba en el Postgres LOCAL compartido:** `TST-REPARTO01` (tiene recepciones: no se puede anular) y `TST-RUI0001`
      (repartido 10+14, con una reasignación y un cierre). Solo local, **producción tiene 0** (verificado 2026-09-21); Felipe: no es problema,
      se dejan. Lo único que hacen es ensuciar los totales locales de «Por pagar»/«Por recibir».
- [ ] **Anotado, no de este cambio:** el `--en-seco` de `pagos_compras_endurecimiento` ya no sirve con el reparto aplicado.
- [ ] **Postgres local compartido: un saldo a favor de S/ 200 de Textiles Andina, sobrante de otra sesión, rompe 2 suites** (no tiene relación con
      Compras-reparto ni con el filtro «Destino»): `pnpm pruebas:pago-por-lote-medios` (24/27) y `pnpm pruebas:notas-credito` (35/42); todas sus
      pruebas fallidas hablan de saldo a favor. Se resuelve anulando ese crédito en el local (no se borra: es un libro inmutable) o corriendo esas
      suites en una base limpia. `notas-credito` sí corre en CI (base limpia) y allí pasa; `pago-por-lote-medios` no está en el CI.
- [x] **`pnpm pruebas:compras-reparto` entra al CI (2026-09-21, PR #229):** un paso más en `pruebas-postgres` (`.github/workflows/ci.yml`), junto a
      `dinero-compras` y `pagos-compras-endurecimiento`, con el mismo seed. **Primera corrida real sobre la base limpia del CI: 57/57 en verde** (leído
      en el log del run). Recordatorio: ese job es «piloto, no bloquea» (`continue-on-error`): avisa, no frena una fusión.
      (`pnpm pruebas:deriva-produccion` ya entró al CI el 2026-09-21, #227; su primer resultado en la base limpia de CI está por mirar.)
- [ ] **Decisión de diseño abierta (opcional): las cuatro cifras de arriba de Comprobantes y Por pagar (Por pagar, Por recibir, Compras del mes, IGV;
      Deuda, Vencido, Vence esta semana, Concentración) no siguen NINGÚN filtro**, tampoco el de proveedor ni ahora «Destino»; solo los
      subtotales por tramo de Por pagar lo siguen. Si Felipe quiere que sigan el filtro, cada una de esas funciones necesita su parámetro
      (candado de dinero incluido) — hoy se dejó así a propósito para no cambiar cinco funciones de dinero.

## 🎯 Traslados: lectura operativa, franja «Atención hoy» y contador del menú (2026-09-18, ADR-0105)

Rediseño de `/inventario/traslados` sobre la referencia que dio Felipe; una sola regla
(`traslados-reglas.ts`) para franja, tarjetas, chips, tabla, detalle y el número del menú. **100% local, sin
migración, en PR.** Hecho: reglas + 61 pruebas, miniaturas reales con regla propia, insignia en lateral/pestañas/celular,
refresco cada minuto, detalle con el mismo vocabulario que la lista.

- [ ] **Llevar al repo el `REVOKE` de escritura directa sobre `transferencias` (drift repo ≠ producción).** En
      producción `authenticated` solo tiene SELECT (verificado en solo lectura, 2026-09-18); en la base local y en
      cualquier base creada desde las migraciones tiene UPDATE/INSERT/DELETE, y con la policy `transferencias_update`
      un integrante podría marcar un traslado `cerrada` por la API sin crear `movimientos`. Migración
      `revoke insert, update, delete on retail.transferencias, retail.transferencia_items from authenticated, anon`
      (todas las escrituras legítimas son `security definer`): en producción es un no-op. Antes: confirmar que ningún
      script (`scripts/pruebas/*.mjs`) escribe directo en esas tablas.
- [ ] **Decidir la regla de diferencias** (negocio, no código): hoy una prenda distinta congela TODAS las de ese
      traslado fuera del stock hasta que un líder cierra, y la caja rechaza vender sin stock. Opción B: entran las
      líneas que coinciden (`cerrar_traslado_con_diferencia` ya filtra «líneas sin movimiento»). Y quién recibe el
      aviso de revisión: cualquier líder (lo que permite la RPC) o el líder del destino (lo que hace la pantalla).
- [ ] **Verificar con sesión iniciada** la pantalla real (`/login` local: líder y integrante de TRU). Ojo: en local
      hace falta `npx supabase migration up --local` (la base puede ir atrasada tras un merge: sin
      `meta_venta_diaria` el layout del líder revienta). Lo probado sin sesión fue el panel con datos ficticios, el
      menú con el contador y las reglas contra los 35 traslados reales.

Observado, sin priorizar: la hora estimada se escribe a mano, al minuto, y no se puede reprogramar; en el detalle
las cantidades vienen precargadas pero «Confirmar recepción» sigue apagado hasta salir de cada campo (una
recepción «a medias» accidental cuenta como «requiere acción»); las fotos se suben sin redimensionar y hay cuatro
criterios distintos de «foto de una variante»; Existencias ya no cuenta como «atrasado» a un traslado con
diferencia.

## 🎯 Crear producto como árbol de decisión (2026-09-18, ADR-0109)

Diagnóstico y decisiones en el ADR. Estado: los 4 pasos, marca y proveedor, y la revisión adversarial del PR #164
(ADR-0109, tercera parte) escritos y probados en un Postgres desechable. **Los 8 SQL están pegados en producción desde
el 2026-09-19 y verificados; falta desplegar el código** (mergear el PR #164): hasta entonces, Nuevo producto y el alta al
vuelo del censo fallan en la pantalla actual («Elige la marca del producto»).

- [x] **Los 8 SQL pegados en producción, en orden, y verificados (2026-09-19).** `230000` → `230100` → `230200` (falló la
      primera vez por tablas temporales entre sentencias; corregido a un solo bloque, ADR-0109 cuarta parte) → `230300` →
      `231000` → `231100` (con la regla «no empeora» de Editar, quinta parte) → `231200` → `231300`. Comprobado en solo
      lectura tras cada uno; al final: 0 productos con pareja marca-proveedor inválida, 0 nombres duplicados, RLS y
      políticas de las tablas nuevas, `anon` sin `EXECUTE` en ninguna de las 17 funciones tocadas, Productos filtra y busca
      por marca y proveedor (44 visibles = contador), «Top Lili» avisa contra «Top Lily». Volcado refrescado
      (`pnpm datos:generar:produccion`: 67 tablas) y **`pnpm datos:comparar` sin alarmas**. El comparador sigue sin ver
      `fn_productos`, `fn_productos_resumen` ni `catalogo_actualizar_producto` (parámetros armados con `...`): esas tres
      las cubre la regresión y lo comprobado en producción.
- [ ] **Desplegar el código (mergear el PR #164) — es lo que falta y es urgente:** desde el SQL 5, crear productos con la
      pantalla actual falla. Después, abrir Productos (filtro por marca) y Editar un producto con una sesión de Líder real.
- [ ] **Marca y proveedor — pendiente de verificar con sesión de Líder real** contra la base: alta, censo (crear pide
      marca; reutilizar no), edición (solo manda marca si cambió), Marcas, filtros y «A quién pedirle» de Productos.
      El piloto de CI (base nueva + `seed.sql` + scripts de venta y caja) ya pasó con las 8 migraciones: eso cubre
      `db reset`, que no se pudo correr en local (Docker caído).
- [ ] **Base local sin patrones:** una base nueva no trae vocabulario de patrones (las semillas locales no lo cargan), así
      que en local Nuevo producto de Indumentaria —que exige patrón— pide un «Liso» que no existe. El mapa de categorías
      se salta ese eje con un aviso (`230200`). Sembrar los 7 patrones en `seed.sql` (o en una migración, como se hizo con
      los tejidos) y mapearlos; existe una rama `claude/patrones-seed-retira-colores` que quizá ya lo cubre.
- [ ] **Inventario → Existencias no filtra por proveedor todavía.** «A quién pedirle» vive en Productos (donde está la
      señal «Pedir a proveedor»). Filtrar Existencias por proveedor pide cambiar `fn_stock_por_sede` y su pantalla.
- [ ] **Compras no valida que el proveedor de una compra traiga la marca de lo que se compra.** Hoy `compras.proveedor_id`
      y `productos.proveedor_id` son datos independientes (el proveedor REAL de cada entrega vive en compras/lotes; el del
      producto es «a quién se le pide»). Decidir si un desvío debe avisar.
- [ ] **Marcas sin fila propia en el menú** (Felipe: «con 3 está bien»): se llega desde Categorías y desde el selector.
      Si molesta, es una fila en `AppShell.tsx` (`RUTAS_POR_GRUPO` ya la contempla).
- [ ] **Verificar con `db reset` local** cuando Docker vuelva (hoy se probó contra un Postgres 17 suelto con el
      esquema mínimo, sin RLS ni el resto de la historia de migraciones).
- [x] **Paso 3 — formulario nuevo** (`NuevoProductoForm.tsx` + `components/alta-producto/*`): árbol familia →
      categoría con búsqueda, aviso de parecidos en vivo, curva habitual marcada, tejido/patrón obligatorios en
      Indumentaria, configurar categoría y «+ Nueva talla/tejido/patrón» sin salir, colores con «más usados»,
      margen, código previsto, etiquetas todo-o-nada y resumen que dice qué falta. Probado en el navegador con
      datos y red simuladas; typecheck, lint y 540 pruebas en verde. **Falta verificarlo con sesión de Líder real
      contra la base** una vez pegados los SQL (aviso de parecidos con `pg_trgm` real, guardado de verdad).
- [x] **Primer paso menos caótico** (2026-09-20): de entrada solo Indumentaria, Accesorios y Complementos y Bisutería; el
      resto (Calzado, Belleza, Papelería) tras «Ver más», y la búsqueda las alcanza igual. De paso se arregló el
      encimado de las tarjetas con el menú lateral abierto (columnas por ancho del bloque, no de la ventana).
      Cuáles van a la vista vive en `FAMILIAS_A_LA_VISTA` (`lib/alta-producto.ts`), no en la base. **Se revisa si**
      Calzado empieza a darse de alta a diario (subirlo a la vista es una línea) o si otra pantalla necesita saber
      qué familias son «principales» (ahí sí se sube a una columna de `familias`).
- [ ] **«+ Nuevo color» dentro del formulario**: hoy se enlaza a Atributos en otra pestaña (un color pide código,
      tono, familia de color y tipo). Si duele, hacerlo como modal con esos 4 campos.
- [x] **Paso 4 — pantalla de éxito** (`ProductoCreado.tsx`): Agregar fotos (lleva a `/productos/{id}/editar#fotos`,
      con los colores que faltan) · Crear otro parecido (conserva categoría, tallas, tejido, patrón, precio, costo y
      etiquetas; limpia nombre, descripción y colores; token nuevo) · Ir a productos. Probado en navegador con red
      simulada, escritorio y celular. Las fotos NO se suben desde ahí (el archivo sube al elegirlo y quedaría huérfano);
      la galería de la edición ya asigna cada foto a su color.
- [x] **Etiquetas de campaña y el formulario nuevo**: las que ya rigen sobre la categoría se muestran «ya aplica por
      campaña» y no se eligen a mano (ni se envían).
- [ ] **Revisión adversarial del PR #164 — pendientes que quedaron a propósito** (detalle en ADR-0109, tercera parte):
      (a) **Completar tejido y patrón de los 38 productos activos de Indumentaria que no los tienen** (ADR-0109, quinta
      parte): Editar ya no lo exige si el producto no los tenía (regla «no empeora»), así que se completan cuando alguien
      edite cada prenda, o de una vez si Felipe pasa la lista; mientras tanto, cualquier reporte por tejido debe tolerar
      nulos; (b) el reintento por `unique_violation`
      del censo (dos escaneos simultáneos del mismo nombre) está escrito pero **no se ejercitó con dos sesiones**;
      (c) volver a correr `230200` reinicia la curva habitual de tallas; (d) `desactivar_proveedor` no tiene el candado
      que sí tiene desactivar marca (un proveedor con productos activos se puede desactivar).
- [ ] **Las pruebas SQL de este PR no están en el repo.** Las ~45 pruebas (nombre único, censo, marcas, edición, permisos,
      regresión de `fn_productos` contra la copia de producción) se escribieron y corrieron en un Postgres desechable con un
      esquema mínimo, y viven solo en la carpeta temporal de la sesión. Pasarlas a `scripts/pruebas/` contra el `seed.sql`
      real (como `etiquetar_variantes.sql`) para que el piloto de CI las corra siempre; hoy solo corre el encadenado y la venta.
- [ ] **Endurecimiento opcional (avisos de Supabase, 2026-09-19):** 20 funciones de `retail` figuran con «search_path mutable»;
      5 son de este cambio (`fn_clave_referencia`, `fn_titulo_referencia`, `fn_dentro_de_una_edicion`,
      `fn_marcas_desactivar_candado`, `fn_productos_referencia_trigger`) y las otras 15 ya estaban. Todas usan nombres
      calificados con `retail.`, así que no es un hueco; fijar `set search_path` en las 20 con una sola migración. Y 121
      funciones `security definer` ejecutables por `authenticated` (el diseño: cada RPC revisa `fn_es_lider` adentro).
- [ ] **Candado de «sentencias independientes» para las migraciones.** El mapa (`230200`) falló al pegarlo en producción
      por depender de tablas temporales entre sentencias (ADR-0109, cuarta parte). Un script de `scripts/migraciones/`
      que rechace `create temp table`, `set_config`, `set local` y `set session` fuera de un bloque `do`/función, y que
      corra junto a `migraciones:versiones`. Además, el piloto de CI podría correr cada migración sentencia por sentencia
      (una conexión cada una): `psql -f` no imita al SQL Editor.
- [ ] **Decisión a reconsiderar (ya existía; la tomó `20260918120000` a propósito: «ficha, no agregado — quedan
      abiertos»): `proveedores_select` deja a cualquier sesión autenticada leer `banco` y `cuenta_bancaria`.** Una cuenta
      bancaria es dato de pago. Si Felipe está de acuerdo: restringir esas dos columnas al rol que compra/paga, o moverlas
      a una tabla aparte. Este PR no lo toca.
      **Nota 2026-09-19 (ADR-0134):** desde hoy son **cinco** las columnas de pago (`banco`, `cuenta_bancaria` + `cci`,
      `celular_billetera`, `titular_cuenta`, todas legibles por cualquier sesión) y **se cierran juntas o ninguna**. Felipe
      decidió dejar la restricción por rol para el final del proyecto; sigue abierta, ahora con más superficie. Ver la
      entrada «Proveedores: CCI, Yape/Plin y titular» arriba de este archivo.
- [x] **Editar categoría (`CategoriasLista.tsx`)**: chip de «habitual» en cada talla; manda `p_talla_habitual_ids`.
- [x] **`catalogo_crear_producto`** retirado del uso (`231200`: sin permiso de ejecución; la función queda, no se borra).
- [ ] **Limpieza de nombres existentes** (no urgente): BLU-001, CHO-001, FAL-001, PAN-001, POL-001, VES-001 son
      códigos puestos como nombre; «Cargo especial (sin código)» es un producto técnico.

## 🎯 Aviario: una sola lista tabla→pájaro, revisada en CI (2026-09-18, ADR-0104)

Felipe pidió "traer el aviario" (los 14 pájaros de `07-GOBIERNO.md` §1). Al cruzarlo con
producción, su índice tabla→pájaro describía V1 (26 de 47 tablas ya no existen, 39 de 60
reales sin pájaro) y el generador del diccionario llevaba otra lista distinta.

- [x] **Una sola lista** en `scripts/datos/aviario.mjs`: las 60 tablas y vistas de
      `retail` con un pájaro cada una. El índice se genera en
      `docs/datos/generado/AVIARIO.md` y GOBIERNO §1 apunta ahí.
- [x] **Alarma en CI:** `node scripts/datos/aviario.mjs --verificar` falla si una tabla
      nace sin pájaro, tiene dos, los pájaros no coinciden con GOBIERNO o `AVIARIO.md`
      quedó viejo. Probado sobre una copia: los errores fallan y apuntarse no rompe nada.
- [x] **Felipe aprobó las asignaciones tal cual** (tabla en ADR-0104: 21 nuevas y 3 que
      cambian — `proformas` y `ubicacion_datos_fiscales` → Cuervo, `sububicaciones` →
      Halcón). PR abierto desde `claude/aviario-cayla-8d1efc`, esperando merge.
- [ ] **Gorrión: lo que se pega a mano en el SQL Editor de producción no deja rastro.**
      GOBIERNO §4 apuntaba a `retail.migraciones_aplicadas`, que ya no existe. El
      registro vivo es `supabase_migrations.schema_migrations` (114 filas, la última de
      hoy), pero solo lo llena el camino de migraciones (CLI/MCP), con versión propia y
      no el nombre del archivo del repo. Decidir si todo SQL de producción pasa por ahí.
- [ ] **Cada pájaro: su archivo en `docs/datos/modulos/` describe V1**, igual que
      `00-MAPA.md` (45 tablas, `sede_meta`, `stock_almacen`). El índice ya es verdad;
      los documentos del porqué, todavía no.
- [x] **Volcado de producción refrescado (2026-09-18)** (`generado/COMO-REFRESCAR.md`):
      `retail.familias` entró; el aviario ve 61 tablas y ninguna «no en el volcado».
      Sale de aquí una alarma más fresca, no permanente: se vuelve a quedar vieja con
      cada tanda de migraciones pegadas en producción.
- [ ] **Producción va por delante de `main` en dos columnas:** `retail.patrones.imagen_muestra_url`
      y `retail.tejidos.imagen_muestra_url` existen en producción, pero su SQL solo está en
      ramas sin fusionar (PR #131, migración `20260918140000_patrones_muestra_visual.sql`, y
      la rama `claude/muestra-foto-tejidos-patrones`, migración
      `20260918160000_tejidos_patrones_imagen_muestra.sql`, sin PR). Ojo: `main` ya tiene un
      `20260918140000_tejidos_seed.sql`; el PR #131 traería un segundo archivo con la misma
      versión y `supabase db reset` local se quejaría. Renumerar antes de fusionar.
- [ ] **Registro de migraciones incompleto en producción (refuerza el pendiente de Gorrión de
      arriba):** con efecto vivo en producción (verificado por sus columnas/funciones) pero sin fila en
      `supabase_migrations.schema_migrations` están, al menos siete: `devolver_proveedor_entra_a_cuarentena`,
      las tres de Proveedores (`…071000`, `…073000`, `…120000`),
      `compras_atraso_recepcion`, `etiquetas_estilo_visual`, `emitir_comprobante_idempotente_y_valida_igv`.
      No hay SQL desconocido (cada columna nueva del volcado tiene su archivo en el repo, salvo lo
      de arriba): lo que falta es el rastro.

---

## 🎯 El acento rojo de las tarjetas por fin se ve: `.card-cayla` sale de la sombra (2026-09-18, ADR-0105)

`.card-cayla` (y `.label-cayla`, `.font-display`, `.alza-cayla`, `.scroll-cayla`, `.anim-*`) estaban
en `globals.css` fuera de toda `@layer`, y lo que no tiene capa le gana a toda utilidad de Tailwind:
`card-cayla border-l-2 border-l-rojo` pintaba el borde sand de 1px. El acento de "esta tarjeta pide
algo" no se veía en Resumen, Existencias, Conteo, Traslados, Productos ni en el banner de altas
pendientes; tampoco existían el fondo de "filtro seleccionado" ni el foco de teclado de las tarjetas
de `/compras`. Todo pasó a `@layer components` y hay un test (`lib/globals-capas.test.ts`) que falla
si alguien vuelve a escribir una clase suelta. Detalle, tabla de utilidades muertas y qué se decidió
con cada una: ADR-0105.

- [x] **Hecho y verificado en navegador** con 752 `className` reales del código: mover la capa
      cambia exactamente lo que el análisis predijo, y nada más. `tsc`, `eslint`, 419 tests en verde.
      **No verificado con datos reales:** el Docker local estaba caído y no se reinició (tumbaría los
      Supabase de otras sesiones). Falta que alguien con la base local arriba mire, como líder:
      Inventario → Resumen (borde rojo en "Necesita reposición ahora"; el filtro elegido queda
      sombreado), Traslados (borde en "Por confirmar en mi sede"), Conteo con un conteo abierto,
      Productos con una prenda dada de alta en un conteo, y Compras con Tab (borde rojo al enfocar).
- [x] **`MAX_ROJO_POR_PANTALLA` — decidido por Felipe el 2026-09-18 (opción A).** Los enlaces de
      acción de las tarjetas ("Ver detalle →"…) y los del banner de altas pendientes de Productos
      pasaron a tinta subrayado; el rojo de una tarjeta es su borde. Resumen bajó de 5 a 2 rojos
      (medido en navegador); Traslados, Conteo y Productos quedan en ≤2. Verificar con datos reales
      junto con lo de arriba.
- [x] **`/compras/por-pagar`, tarjeta "Vencido": de 4 rojos a 2** (2026-09-18, aprobado por Felipe).
      Tenía punto, cifra, línea de detalle y —desde ADR-0105— el borde `acento`. Quedan borde + cifra;
      el punto pasa a neutro y el detalle a su color normal. La tarjeta "Vence esta semana" sigue en ámbar.
- [ ] **`ComercialPanel.tsx`** (sesión `comercial-command-leaders-bb5771`, sin commitear, no está en
      `main`): usa `border-l-2! border-l-rojo!` como parche. Con este cambio el `!` sobra y hay que
      quitarlo. Aviso dejado en `SESIONES-ACTIVAS.md`. Ojo: su tarjeta destacada suma borde rojo +
      el resto de la pantalla; medir contra `MAX_ROJO_POR_PANTALLA` antes de dar por bueno.

## 🎯 Colores: agrupados por familia + 4 tonos de investigación real (2026-09-18)

`/productos/colores` era una sola grilla continua ordenada por `orden`
global (10→92) — con 34+ colores un tono nuevo quedaba "colgando" al final
en vez de junto a sus parecidos, y la última fila (Estampados, 3 items)
se veía a medio llenar sin motivo. Se agrupó por familia (Neutro/Azul/
Rojo/Amarillo/Verde/Morado/Tierra/Metálico/Estampado), mismo patrón visual
que ya usa Categorías (`gruposPorFamilia()`, `ColoresLista.tsx`).

De paso, auditoría real (mismo método que ADR-0096: navegar en vivo, citar
URL, declarar cuando un sitio bloquea) contra Zara, Ralph Lauren, LVMH
(Fendi/Dior) y Platanitos. Zara y Platanitos dieron datos reales; Ralph
Lauren bloqueó el acceso en el primer intento y funcionó en el segundo
(navegación más orgánica en vez de URLs directas); LVMH agrupa por familia
amplia, no por tono fino, así que no aportó huecos nuevos. Resultado: 4
colores nuevos con hueco real en Zara (Cobalto, Gris antracita, Caqui,
Tostado — "Caqui" en español, no "Khaki", por la regla de idioma de
CLAUDE.md), confirmados también en Ralph Lauren ("Dark Cobalt"). Nacen
`aprobado` directo — decisión de marca ya tomada con Felipe, no una
propuesta de piso de venta.

- [ ] Verificado tras fusionar con `main` (2026-09-18): `tsc`, 380 tests, lint de
      lo tocado y `next build` en verde; componente renderizado con los datos
      reales de producción. **Falta, en este orden:** (1) Felipe pega en
      producción `20260918010000_familias_tabla_propia.sql` y después
      `20260918154730_colores_audit_zara_platanitos.sql` (supuestos ya
      verificados contra producción, solo lectura); (2) recién ahí se fusiona
      el PR — antes, el despliegue espera `retail.familias`, que no existe.
      **Decisión abierta de Felipe:** con la grilla agrupada, `orden` solo manda
      dentro de cada familia y hoy queda incoherente (Tierra: Arena → Camel →
      Marrón → Chocolate → Caqui → Tostado; los 4 tonos nuevos van al final de
      su familia). Propuesta: de más oscuro a más claro, medido con el hex real
      de la muestra; solo cambia `orden` (dato de presentación, reversible).

---

## 🎯 Rediseño visual de Caja + Punto de Venta (2026-09-18, ADR-0116)

Felipe pidió rediseñar Caja (visual/interactivo, a partir de una maqueta HTML) y
extender el mismo lenguaje visual a Punto de Venta, sin tocar lógica de negocio. La
maqueta traía modo oscuro y una paleta que no es la de CAYLA — protocolo de pregunta
antes de tocar código, Felipe eligió traducirla a la paleta ya existente (detalle en
ADR-0116).

- [x] **Caja: tablero completo con datos reales** — encabezado (avatar por iniciales,
      reloj en vivo, badge de sincronización), barra de meta diaria (si la ubicación
      tiene una configurada), 5 KPIs con sparkline, dona de métodos de pago (+ tabla
      accesible), barras de ventas por hora, timeline de movimientos+ventas, tendencia
      de 7 cierres, barra de acciones fija (luego movida al encabezado: ver 2ª tanda,
      abajo). `CajaAbiertaPanel.tsx` reescrito,
      `Graficos.tsx`/`useCountUp.ts` nuevos, `lib/caja.ts` gana `getSeriesVentasCaja()`
      y `MovimientoCaja.registradoPorNombre`. Verificado en navegador con la caja real
      de Tienda Lima (`felipe@cayla.local`).
      Colores categóricos de método de pago (`--color-metodo-*`) nuevos en
      `globals.css`/`design-tokens.ts` — compartidos con Vender, no son de marca.
- [x] **`ubicaciones.meta_venta_diaria`** — columna nullable nueva
      (`20260918100000_meta_venta_diaria_por_ubicacion.sql`), sin RPC propia todavía
      (se configura por UPDATE directo). Aplicada en local, **pendiente producción con
      ok de Felipe**.
- [x] **Punto de Venta: extendida la misma piel visual** — la mayoría YA calzaba
      (tarjetas de producto ya usaban `alza-cayla`+radio `xl`, total ya en serif,
      botón "Cobrar" ya `bg-tinta`/hover `rojo` igual que "Cerrar caja" — no hizo
      falta tocar nada de eso). Lo que sí cambió: chips de categoría y el toggle
      "Solo con stock" pasan de `rounded-lg` a `rounded-md` (mismo radio que la
      "pastilla" real del selector de ubicación, `campos.tsx`); el selector de
      método de pago (`PuntoDeVentaTicket.tsx`) y el ícono de cada pago ya puesto
      se colorean con los mismos 3 categóricos de la dona de Caja. Verificado en
      navegador armando una venta real con pago mixto efectivo+tarjeta+yape.
- [x] **Caja, 2ª tanda (2026-09-18, adenda de ADR-0116)** — "+ Ingreso / egreso" y "Cerrar
      caja" pasan de la barra fija de abajo al encabezado (a la derecha; el chip de
      sincronización queda junto al título); fuera el botón "Cambios" (sigue en el menú
      lateral, Ventas → Cambios). Dona rehecha como `DonaMetodos.tsx` (SVG puro, sin
      librería): degradado, resplandor, bisel de 100 marcas (1 % cada una), barrido al entrar a
      la vista (se repite al volver a verla) y respuesta al mouse (arco que se adelanta,
      marcas que se encienden, centro que cambia, leyenda sincronizada). Geometría en
      `lib/dona-geometria.ts`, 7 pruebas. Excepción declarada —solo esta dona— a "sin
      gradiente" y a "nada se anima solo al entrar". Verificada en navegador con datos de
      mentira (2, 3 y 1 método; escritorio, tablet, móvil).
- [ ] **Dona de Caja: falta verla con la caja real y en pantalla táctil** — no se probó con
      datos de producción (para no cruzar la cookie de Supabase entre dos `next dev`) ni con un
      dedo real: el toque alterna el método apuntado, pero está razonado, no ejercitado.
- [x] **Caja, 3ª tanda (2026-09-18, adenda de ADR-0116)** — fuera el avatar del encabezado
      (las iniciales no informaban; el nombre ya está al lado) y `iniciales()` de
      `caja-panel-reglas.ts` con él. Lo que se conserva gana vida: `RelojDeCaja` (dígitos que
      ruedan al cambiar, aguja de segundos alineada al segundo real, "Abierta desde… · lleva
      2 h 08 min" con `duracionAbierta()`, 3 pruebas) y `EstadoSync` (onda suave detrás del
      ícono, visto que se traza, re-asentado al cambiar de estado, `role="status"`). Dona
      centrada en su tarjeta en las dos direcciones. Verificado en navegador con datos de
      mentira, incluido el estado "N ventas sin sincronizar" y la paleta nueva del POS.
- [x] **Ventas por hora → "Ritmo del día"** — el gráfico de barras no se entendía ("no lo
      entiendo y no sé si sirve"): sin cifras, la barra mayor siempre llenaba la caja y la rayita
      roja de la hora sin ventas parecía dato. Felipe eligió entre tres caminos (aclararlo /
      cambiarlo / quitarlo) el segundo. `RitmoDelDia` (en `CajaAbiertaPanel.tsx`): ventas, ticket
      promedio y "desde la última venta", y una línea de tiempo de la apertura a ahora con una
      venta por punto (tamaño = monto, color = método, pago mixto = punto partido, las que caen
      juntas se apilan). Sin consultas nuevas: sale de `ventasHoy`. Lógica pura y probada en
      `caja-panel-reglas.ts` (`ritmoDelDia`, `metodosDe`, `formatoDuracion`; 26 pruebas del
      módulo). `BarrasHorarias` sale de `Graficos.tsx`; `useEnVista` pasa a `lib/` porque ahora
      lo comparten la dona y esta tarjeta. Las cifras se ajustan al ancho de la tarjeta (a 340 px
      se pisaban). Si la caja quedó abierta de ayer, el eje dice "Desde medianoche".
- [x] **Caja a todo el ancho (2026-09-18)** — pedido de Felipe: "hay mucho espacio a los lados
      y no se aprovecha", como el Punto de Venta. `/caja` entra en `SIN_TOPE_DE_ANCHO`
      (`AppShell.tsx`, la misma lista de Vender/Compras/Productos/Inventario): el tablero pasa de
      ~1023 px a ~1526 px a 1878. Para *aprovecharlo* y no solo estirarlo: la fila de abajo
      queda en dos columnas iguales alineadas con la de arriba (`2xl`), y la dona (y su texto y
      leyenda) crece con el ancho de SU tarjeta (container queries, 176 → 224 px). Lo que cuelga
      de `/caja` y no es tablero conserva `max-w-5xl` por su cuenta: el formulario de abrir
      caja (un campo, sin tope propio) y el historial de cierres (una columna flexible que
      separaría la sede de sus cifras). Verificado a 1878, 1366 y 1024 px con datos de mentira.
- [x] **Caja: rediseño para usar bien el ancho + actualización en vivo (2026-09-18)** — pedido de
      Felipe: "que se ocupe de manera óptima el espacio" y "que se actualice en tiempo real, con una
      animación cuando hay una venta, para ver cómo va el ritmo".
      *Disposición:* decide por el ancho del PROPIO tablero (`@container`), no de la ventana (la barra
      lateral se come ~350 px). Encabezado en tres zonas con la hora del turno al centro (≥ 1400 px),
      dos zonas (≥ 720) o apilado; KPI en 2/3/5 columnas; cuerpo en una columna, dos (≥ 900: dona y ritmo,
      y debajo historial y movimientos a ancho completo, estos en dos columnas) o tres (≥ 1400:
      "Movimientos" como riel alto a la derecha, cuyo alto natural coincide con las dos filas de la
      izquierda). El historial muestra hasta 14 días con día y monto cuando cabe. Una fila de dos
      columnas con una tarjeta mucho más alta que su vecina la estira y la deja medio vacía: por eso el
      rango medio no es 2×2. Los modales quedan FUERA del contenedor (`container-type` aplica contención
      de layout y ataría su `fixed` al tablero).
      *En vivo:* `useCajaEnVivo` sondea cada 5 s con dos conteos (ventas y movimientos de la caja) y solo
      si el número cambia hace `router.refresh()`; no sondea con la pestaña oculta ni sin red, y retrocede
      hasta 1 min si falla. Al llegar datos nuevos: aviso "Nueva venta" (`avisar`), la tarjeta que subió
      con velo de color e insignia "+S/…", la dona señala sola el método que creció (2,8 s, el ratón
      manda), el punto nuevo del ritmo entra con una onda y se deslizan los demás al crecer el eje, y la
      fila nueva de movimientos se resalta. Lo "nuevo" caduca a los 8 s; lo que ya estaba al abrir no
      cuenta. Lógica pura y probada en `caja-en-vivo.ts` (7 pruebas).
      *Verificado:* 7 anchos (1878 → 390 px) con datos de mentira y un simulador de ventas (venta,
      venta mixta, egreso); las consultas de conteo contra el Postgres LOCAL, solo lectura, como el líder
      del seed (cuenta = filas, RLS lo permite, sin sesión da 401); el overlay del modal cubre la ventana.
- [ ] **Actualización en vivo con Supabase Realtime en vez de sondeo** — hoy llega en ~5–6 s. Realtime
      la haría instantánea, pero exige `alter publication supabase_realtime add table …` en el proyecto
      COMPARTIDO con Dynamic (hoy la publicación tiene 0 tablas, ADR-0018): parar y confirmar con Felipe
      antes de correrlo. Cuando se autorice, `useCajaEnVivo` se cambia por una suscripción y nadie más se toca.
- [ ] **Probar el en vivo de punta a punta con sesión real** — no se pudo (exige entrar): falta ver, con la
      caja abierta en un navegador, una venta hecha desde otro dispositivo y cómo llega. Las piezas están
      verificadas por separado (consultas reales, detección y animaciones con simulador), no el bucle completo.
- [ ] **Tarjetas KPI de Caja vs `TarjetaEstadistica` de Cambios** — hoy son dos familias
      (Caja: borde de color + sparkline; Cambios: ícono en cuadro rojo suave). Unificar cruza
      más de un módulo: esperar a que se fusionen las ramas del POS (paleta de métodos + recibo
      térmico, toca `globals.css`) y de Cambios/Devoluciones, y decidirlo en un cambio corto
      aparte. Ninguna otra sesión toca `CajaAbiertaPanel.tsx` hoy.
- [ ] **Banner de alerta de egresos por encima del promedio semanal** — pedido por la
      maqueta, NO construido: no existe ningún rollup histórico de egresos por día
      (`getHistorialCierres()` no los trae). Necesita una función/consulta nueva antes
      de poder mostrar un número real.
- [ ] **Delta "vs. mismo día de la semana anterior" en la barra de meta** — mismo
      motivo: no hay una cifra de "total vendido" histórico por día en ningún lado;
      `montoCierreSistema` mide otra cosa (el esperado en el cajón, no lo vendido).

---

## 🎯 Resumen de Inventario: quinta pantalla, por variante × sede (2026-09-17, ADR-0101)

Worktree `erp-architecture-summary`. `/inventario/resumen` (solo líder, por sede): estado
general (salud, riesgo de quiebre, traslados sugeridos, exactitud = la de Conteo),
excepciones (necesita reposición ahora, curvas incompletas, posible sobrestock, en camino
con impacto), decisiones sugeridas hoy, productos a vigilar y cómo leer. Motor:
`retail.fn_resumen_variantes` (agregados crudos por variante, demanda por FK y estado real,
ventana observable) + `lib/resumen-reglas.ts` (todas las reglas, reutiliza los umbrales de
Existencias). "Crear traslado" prellena `/inventario/mover` — nunca mueve stock. Verificado
en navegador (desktop/tablet/móvil) con un escenario local de historial; typecheck, lint,
358 pruebas y build en verde. Renumerada de ADR-0097 a 0101: `activar-tienda-lima-eff087`
tomó el 0097 primero y ya está en producción — ver ADR-0101 y la fila de abajo.

**Fusionada con `main` (22 commits, PR #106-#119, 2026-09-18):**
- [x] **`fn_productos` y `fn_prioridad_conteo` ROTAS en `main` local** ("column v.talla does
      not exist") — ya venían arregladas en `main` (`20260917220000_reconcilia_talla_id_...`,
      del PR #108); aplicada acá al fusionar. Verificado con `psql` directo (18 y 48 filas
      respectivamente, antes tiraban error).
- [x] **`conteo/page.tsx` en conflicto con el PR #108** (alta de prenda al vuelo durante
      el conteo): dos ediciones a pocas líneas de distancia, sin pisarse en intención.
      Integradas las dos — `tonoExactitud()` de esta rama y `colores`/`tallasPorCategoria`
      del PR #108, con `ConteoPanel.tsx`/`catalogo-v2.ts` traídos de `main` sin cambios.
- [x] **Bug real encontrado al verificar la fusión, ajeno a esta rama pero ya en
      producción (PR #108): "Conviene contar primero" repetía la misma prenda dos veces**
      con montos de "valor en riesgo" distintos — `fn_prioridad_conteo` lee de `stock`
      (una fila por variante×sububicación) pero nunca exponía cuál sububicación era cuál.
      Corregido en `20260918090000_prioridad_conteo_por_sububicacion.sql`: ahora cada fila
      dice "Piso de venta" o "Almacén de tienda"; de paso, "días sin contar" ahora exige que
      el conteo cerrado haya cubierto esa misma sububicación, no cualquiera de la sede.
- [x] **Aplicadas a producción, con ok puntual de Felipe (2026-09-18): las dos
      migraciones de Resumen** — `fn_resumen_variantes` (renombrada localmente a
      `20260918080000_` por choque de timestamp con `reconcilia_talla_id...` de `main`,
      sin choque de contenido) y `fn_prioridad_conteo` con sububicación
      (`20260918090000_prioridad_conteo_por_sububicacion.sql`). Verificado contra
      producción real vía MCP de Supabase: las dos funciones existen con la firma
      correcta, `anon` no puede ejecutarlas, `fn_resumen_inventario`/`transferir` viejas
      quedaron dropeadas, el índice existe. `pnpm datos:comparar` sale limpio (PR #121).
      `20260916100000_punto_reorden.sql` y la taxonomía cerrada NO se tocaron en esta
      pasada — ya estaban en producción (`variantes.talla_id` confirmado presente antes
      de aplicar nada).
- [ ] **`movimientos.motivo` sin CHECK**: Resumen lo esquiva clasificando por FK, pero
      `fn_productos`/`fn_movimientos` siguen dependiendo del texto — vocabulario cerrado
      como colores/tallas.
- [ ] **`fn_stock_por_sede()` suma cuarentena y el cargo especial** (la usan Existencias
      "en la red" y Vender): una prenda dañada en otra sede aparece como disponible.
- [ ] **`anular_venta` repone al bucket `sububicacion_id NULL`** (ni piso ni almacén): la
      unidad cuenta como disponible pero el POS no la puede vender.
- [ ] **`iniciar_traslado` no aplica `fn_variante_permitida_en_sede`** (el candado de
      etiquetas solo está en `registrar_venta` y en la `transferir` legada): una sugerencia
      de Resumen podría proponer mover una variante restringida.
- [x] **`retail.transferir` (modelo atómico viejo) resucitada por `20260917100700`**,
      ejecutable por `anon` y contada doble como "en camino" — dropeada otra vez en
      `20260917220000_resumen_inventario.sql` (sin caller en la app).
- [ ] **`primer_ingreso` recorre todo el ledger en cada carga de Resumen** (mínimo
      histórico por variante×sede): crece lineal con los años. Candidato a materializar
      (tabla `variante_sede_primer_ingreso` alimentada por `fn_aplicar_movimiento`) cuando
      el ledger pase de ~1 millón de filas.
- [ ] **`retail.tallas` sin columna `orden`**: la curva se ordena con la lista
      `LETRAS` de `tallas.ts`; una talla nueva fuera de esa lista cae alfabética.
      Decisión estructural (taxonomía) para Felipe.
- [ ] **Datos simulados de 6 meses en local** (pedido de Felipe): el escenario de esta
      sesión vive en el scratchpad y no se commitea; el generador real debe cubrir a
      propósito producto nuevo con poco historial, curva rota, mermas mezcladas con ventas,
      temporada con pico y caída.
- ~~Preguntas abiertas (ADR-0101): ventana elegible; «días con stock» en vez de «días desde el
  primer ingreso»~~ — resueltas en la v2 (abajo, ADR-0121). Sigue abierto: el mínimo por variante+sede.

**Resumen v2 (2026-09-18, ADR-0121) — migración APLICADA en producción el 2026-09-19; el frontend sale con el merge del PR #161:**
- [x] Período 7/30/90/este mes/personalizado + comparación (período anterior / mismo período del
      año anterior); el stock siempre es el actual. Velocidad = ventas netas ÷ días EN VENTA (piso),
      cobertura, sell-through, reserva de seguridad, motor de reposición (almacén → en camino → otra
      tienda → Taller → red sin stock → sobrestock), curvas rotas, búsqueda por tokens, filtros en
      la URL, detalle por variante, capital con verificación de costo. Definiciones exactas en el ADR.
- [x] **Aplicada en producción (2026-09-19): `20260919141804_resumen_inventario_v2.sql`** (renombrada desde
      `20260919010000`, que usa `etiquetar_variantes`). Con `apply_migration` (historial de Supabase
      `20260919145415`), autorizada por Felipe, DESPUÉS de un ensayo completo en una transacción revertida
      contra datos reales (mismas cifras que la función anterior en las 4 sedes; colaboradora sin costos ni
      otras sedes; 40–55 ms por sede). Verificado al aplicar: una sola firma de 6 parámetros, `anon` sin
      EXECUTE, cuerpo idéntico byte a byte al archivo (md5 de `prosrc`) y la llamada vieja
      `(p_ubicacion_id, p_ventana_dias)` sigue sirviendo, así que la pantalla anterior no se enteró.
      **Pendiente del ritual:** `pnpm datos:generar:produccion` + `pnpm datos:comparar` (el volcado de
      `docs/datos/generado/` todavía trae la firma vieja: hasta que se refresque, `datos:comparar` marca
      `resumen-inventario.ts` como pantalla rota, y es una alarma falsa).
- [ ] **Lo que se va a ver el primer día en producción** (medido en el ensayo): las 141 filas variante×sede
      que devuelve hoy la función (78 Taller, 17 AQP, 46 TRU) tienen costo `declarado` (ninguna `oficial`:
      `costo_historial` sigue vacío), así que «Capital en inventario» SÍ se
      muestra (ninguno es `alterado` ni `sin_costo`) pero es a costo declarado al dar de alta, no promedio
      ponderado de compras. **Tienda AQP** tiene sus 76 unidades en el almacén y 0 en el piso: todas sus filas
      saldrán «Sin piso / Bajar al piso». **Tienda LIM** no tiene stock ni movimientos (pantalla vacía honesta).
      El ledger de producción cuadra en las 3 sedes con stock (0 filas con `ledger_consistente = false`).
- [ ] **La garantía de costo (ADR-0067) está rota — decisión estructural de Felipe.** Hay dos caminos
      de escritura ajenos a `fn_recalcular_costo_variante`: `catalogo_actualizar_producto` pisa
      `variantes.costo` con lo que mande el formulario (o con 0) y la política `variantes_write_lider`
      deja a cualquier líder escribirlo por la API. En producción `costo_historial` tiene 0 filas (ninguna
      variante tiene el costo respaldado por el cálculo oficial). Hoy la tarjeta «Capital» mide en vez de
      garantizar (`declarado`/`oficial`/`alterado`/`sin_costo`) y cae a «Unidades» si algo con stock queda
      `alterado` o `sin_costo`. Cerrarlo de verdad: un flujo «ajustar costo» con auditoría, sacar el campo
      editable de `ProductoForm`, y que `catalogo_actualizar_producto` deje de tocar el costo — esa función
      tiene deriva repo↔producción, así que se parte de su definición viva.
- [ ] **Cualquier usuario autenticado puede LEER `variantes.costo`** (SELECT abierto en RLS). La v2 solo
      manda el costo a líderes desde la RPC, pero la tabla sigue legible por la API. Cerrar con una vista o
      con columnas restringidas es decisión de modelo de datos.
- [ ] **Confirmar los parámetros de negocio** (valores por defecto, uno por constante en
      `lib/inventario-reglas.ts`): objetivo 14 días de cobertura, reserva de seguridad 3 días, piso de venta
      7 días (alerta < 3), «alta cobertura» > 60 días, evidencia mínima 3/14 días, sell-through bajo < 20 % y
      alto ≥ 60 %, alta demanda = el 20 % más rápido (≥ 0.5 uds/día), tendencia ±25 %, una tienda cede hasta
      dejar 10 días de su propia venta. Son punto de partida, no verdad: Felipe los ajusta mirando su venta real.
- [ ] **Reserva de seguridad como dato** (por variante y sede): hoy se deriva de la velocidad (`max(1, ceil(v×3))`)
      y no se guarda. Si Felipe quiere fijarla a mano por prenda, es una columna o tabla nueva — decisión de modelo.
- [ ] **«Revisar liquidación» y «Revisar reposición» solo abren el detalle**: no hay flujo de liquidación por
      prenda ni de pedido de compra prellenado. «Revisar compra/producción» enlaza a `/compras` o `/produccion`
      sin prellenar. Hacen falta flujos reales antes de convertirlos en botones que ejecuten.
- [ ] **Vista matriz y Online (de la imagen de referencia) NO se construyeron**: no hay flujo ni datos detrás
      (no hay canal online en el modelo). Se prefirió no dibujar botones muertos.
- [ ] **Choque de versión de migración `20260918140000`**: `tejidos_seed` (ya en `main`) y
      `patrones_muestra_visual` (PR #131, abierto) usan la misma versión; el que llegue segundo hace fallar
      `migration up`. No es de esta sesión — hay que renombrar una antes de mezclar el PR #131.
- [ ] **Datos locales de Resumen son ralos**: Trujillo tiene 55 ventas en 4 variantes y casi todo el stock
      sembrado está en almacén (por eso la mayoría sale «SIN PISO»). La verificación de reglas está cubierta por
      las 38 pruebas SQL con escenarios propios (con `ROLLBACK`), pero una revisión con volumen real solo se
      hace con datos de producción.

---

**Resumen — comparar dos períodos A vs B (2026-09-19, ADR-0138):**
- [x] Modo `?modo=comparar` con «Vista general» (Ventas, Rotación, Cobertura y Capital A → B; «Qué cambió» con
      tres señales que abren el detalle filtrado; top 5 de rotación; cobertura al cierre A/B) y «Detalle por
      producto» (vendido y uds/día, Δ, stock al cierre con inicio → cierre, rotación, cobertura, interpretación,
      orden y paginación). «Comparar con» gana «Otro período…». Sin selector de sede propio ni «Ingreso sin
      comprobante»; «Actualizado hh:mm ⓘ» reemplaza el bloque técnico. **Superado por el rediseño visual de abajo**
      (Cobertura/interpretación/señales de texto ya no están en Comparar).
- [x] **Rediseño visual de Comparar períodos** (pedido de Felipe, tabla «dispersa»): contexto compacto «A → B ·
      Cambiar períodos»; búsqueda solo en Detalle; KPI = Ventas, Rotación, **Sell-through** (no Cobertura) y
      Capital; «Qué cambió» → dona **«Evolución del ritmo»** (Aceleró/Estable/Desaceleró, interactiva a Detalle);
      ranking de texto → barras horizontales A/B; **«Distribución de sell-through»** en vez de Cobertura; Detalle a
      6 columnas con **«Cambio relevante»** (uno solo, el más importante) en vez de Interpretación.
- [x] **Fila de períodos en dos píldoras** (frame de Figma de Felipe, 2026-09-21; `ResumenControles.tsx`,
      `textoPildoraPeriodo`/`etiquetaRangoLarga` en `lib/resumen-periodo.ts`): «Período A: desde … hasta …» y
      «Período B: …», de 36 px y alineadas con el selector de Categoría (el frame las dibujó de 32 y con el rango
      de A también en la B); cada una abre el selector de fechas unificado (ver el ítem de 2026-09-21, más arriba). Probado en local:
      1920/1024/390 px, presets, «año anterior», «otro período…», Detalle; sin errores de consola.
- [ ] Diseñar en Figma los estados de las píldoras (abierta, hover, foco, móvil) y la píldora con un rango de un solo
      día: hoy se resolvieron con los tokens existentes (abierta = borde tinta/60, hover = tinta/50).
- [ ] La píldora en reposo usa el fondo y borde del estado «abierto» del botón anterior (tinta/4 % + tinta/30, como
      lo dibuja el frame): junto a los demás controles (borde tinta/15) se lee como «seleccionada». Decidir con Felipe.
- [x] **Miniatura + color real** (`ui/PrendaCelda.tsx:SinFoto`, `ui/MuestraColor.tsx`, como Existencias) en
      Desempeño y Comparar › Detalle (ya tenían `colorHex`); solo miniatura (sin cápsula) en Movimientos,
      Traslados › detalle y Conteo › detalle.
- [x] **Reparto de responsabilidades (ampliación de ADR-0138):** «Resumen» → «Análisis de inventario» con
      Desempeño | Comparar períodos; Desempeño = tabla «Comportamiento del inventario» (vendido, ritmo, sell-through,
      rotación, tendencia), sin stock de hoy ni «Comparar con»; la cobertura pasó a Existencias («Cubre N d» bajo
      «Disponible»). Salieron 5 tarjetas, la tabla de prioridades con acciones y 3 bloques (lógica intacta en `lib/`).
- [x] **Rotación = COGS ÷ inventario promedio a costo, en un solo lugar (`lib/rotacion.ts`)** para filas, ranking, órdenes y
      KPI de Desempeño y Comparar; COGS del `costo_unitario` de cada venta; N/D si falta costo o historial (ADR-0138).
- [x] **Rotación total = Σ COGS ÷ Σ inventario promedio de las variantes válidas** (una variante sin dato ya no apaga la
      cifra de la tienda) y **A contra B sobre las variantes válidas en los dos períodos** (`rotacionAgregada` /
      `rotacionComparada`); debajo de la cifra «N de M variantes comparables» solo si hay exclusiones (ADR-0138, segunda
      corrección). Sin migración.
- [ ] **Cobertura mínima del KPI de rotación:** hoy, si hay al menos una variante válida se calcula (y se informa cuántas
      quedaron fuera). Decidir con datos reales si hace falta un mínimo (p. ej. % de variantes o % del valor de inventario
      cubierto); el universo ya viaja completo en `UniversoRotacion`.
- [ ] **Rotación con promedio temporal del valor del inventario a costo** (objetivo definitivo: COGS histórico ÷ promedio
      temporal del valor histórico, cada tramo con el costo que regía). Hoy: (valor al inicio + valor al cierre) ÷ 2, y una
      prenda que recibe stock a mitad del período sale con la rotación inflada. Puntos de sustitución:
      `BaseRotacion.inventarioPromedioTemporal` y `baseRotacionDeVariante` en `lib/rotacion.ts` (haría falta la serie diaria
      del saldo × costo; la función ya arma los intervalos del piso, faltaría el de lo utilizable). Ojo: Desempeño junta dos
      mitades en `periodoCompleto`; ahí habrá que ponderar por días el promedio de cada mitad.
- [ ] **Valorar el inventario al costo de la fecha** (hoy el COGS es histórico —el de cada venta— pero el inventario del
      inicio y del cierre se valora al costo VIGENTE: un costo que cambió infla o desinfla la rotación): `costo_historial` lo
      permite. Límite documentado en el encabezado de `lib/rotacion.ts` y fijado por una prueba.
- [ ] **Decidir dónde viven las acciones de reposición** (bajar al piso, pedir al Taller, trasladar, curvas rotas,
      «Agotadas con demanda», capital): salieron del análisis y no tienen pantalla nueva. La lógica sigue en
      `lib/resumen-reglas.ts` y `resumen-acciones.ts`; candidata natural: Existencias.
- [x] **`20260919220000_resumen_comparacion_periodos.sql` en producción** (2026-09-20): ensayo revertido contra el
      esquema real → `apply_migration` → verificado por catálogo (firma, `security definer`, `search_path`,
      `revoke`/`grant`) y por `md5` del cuerpo contra el archivo (coincide una vez descontadas las líneas de puro
      comentario, que el transporte de la herramienta quita; el local, aplicado directo del archivo, lo confirma).
      `get_advisors` no suma nada nuevo (el único aviso es el genérico de toda función `security definer` expuesta
      por RPC, igual que las demás). Falta `pnpm datos:generar:produccion` (regenerar el diccionario).
- [ ] Rotación con inventario promedio de dos puntos: para el promedio real hace falta la serie diaria del saldo.
- [ ] Confirmar con Felipe: umbral de «Aceleró/Desaceleró» (±25 %, `TENDENCIA_UMBRAL_PCT`) y de «Mejoró rotación»
      (+25 %), y orden por defecto «Más vendidos en B». Son los umbrales de `inventario-reglas.ts`, no nuevos.
- [ ] **Color real en Movimientos, Traslados › detalle y Conteo › detalle:** tienen la miniatura pero el color
      sigue en texto — el hex no viaja hasta esas filas (en Mover/Recibir/Conteo `getCatalogo()` sí lo trae y se
      descarta al mapear los datos de la pantalla; en Movimientos, Traslados › detalle y Conteo › detalle el tipo
      de la fila no lo tiene en absoluto). Es un cambio de datos, no de diseño — sin migraciones.
- [ ] Mover y Recibir no pueden tener miniatura ni color: el selector de prenda es un `<select>` nativo del
      navegador (un `<option>` no admite marcado). Para tenerlo habría que cambiar el selector por un combobox
      propio — un rediseño, no un ajuste.

## 🎯 Proveedores: ficha ampliada y métricas de compras/insumos (2026-09-17, ADR-0094)

Felipe pidió más métricas de proveedor. Protocolo de pregunta completo primero (lo pidió
explícito: "antes de implementar cualquier cosa, preguntas") — 4 decisiones: objetivo
(negociar mejor + cuidar el flujo de caja + medir confiabilidad), cerrar huecos antes que
métricas, secciones separadas para Taller/insumos vs. prenda terminada/compras, sí agregar
plazo/rubro/forma de pago a la ficha. Al aplicar "cerrar huecos primero" salió una
contradicción real con una decisión de Felipe de esa misma mañana ("devolver_proveedor no es
prioridad") — se le mostró explícita, la revisó, y sí valía la pena ahora. Detalle completo,
con verificación contra Postgres real (Felipe vs. Micaela, sede por sede), en ADR-0094.

- [x] **`devolver_proveedor` deja de desaparecer** — entra a `cuarentena` igual que Dañado,
      reusando `prendas_danadas`/`resolver_prenda_danada` con un cuarto estado
      (`devuelta_proveedor`) en vez de un flujo gemelo.
      `20260918070000_devolver_proveedor_entra_a_cuarentena.sql`. Verificado con
      `psql`+`ROLLBACK`: entrada a cuarentena real, las dos validaciones (proveedor
      obligatorio para este estado / prohibido para los otros) rechazan como corresponde,
      resolución deja movimiento de salida + `proveedor_id` + `resuelto_por`/`resuelto_en`.
- [x] **`proveedores` gana `rubro`/`plazo_credito_dias`/`forma_pago_preferida`** —
      `20260918071000_proveedores_rubro_plazo_forma_pago.sql`. `rubro` a propósito sin
      vocabulario cerrado (ver ADR-0094 para el porqué). `fn_proveedores()`,
      `registrar_proveedor` y `actualizar_proveedor` extendidos y verificados.
- [x] **Dos RPC de métricas, nunca sumadas: `fn_proveedor_metricas_compras` /
      `fn_proveedor_metricas_insumos`** — `20260918072000_proveedor_metricas_compras_e_insumos.sql`.
      **Repiten a mano el candado de sede de ADR-0075** (una función `security definer` se
      salta cualquier policy de la tabla que lee, sin excepción) — la primera versión escrita
      en esta sesión no lo tenía, se corrigió antes de la primera prueba, no después de
      encontrarlo roto. Verificado: Felipe (líder) ve 2 facturas de "Textiles Andina SAC"
      cruzando Taller/Lima (S/13,829.60 facturado, S/5,133.60 de saldo); Micaela (integrante,
      Trujillo) ve todo en cero para el mismo proveedor.
- [x] **D-46 (`docs/datos/DECISIONES-2026-09-12.md`) tenía el mismo problema que ya se había
      encontrado en D-45**: la mitad "cuentas por pagar" ya estaba resuelta por ADR-0035
      desde el 2026-09-12 y el documento nunca se actualizó. Corregido con cita cruzada. La
      mitad IGV (crédito fiscal acumulado, 300 UIT) sigue genuinamente abierta.
- [x] **Pantalla de detalle de proveedor** (`/compras/proveedores/[id]`, con las dos
      secciones de métricas) — construida (`apps/web/lib/proveedores.ts`,
      `ProveedoresPanel.tsx`, página nueva) y verificada de punta a punta en el navegador
      real como Felipe (líder): números de "Textiles Andina SAC" coinciden con lo verificado
      por `psql`, estados vacíos correctos para Insumos.
- [x] **Bug real encontrado y corregido en esta misma pasada: `registrar_proveedor`/
      `actualizar_proveedor` quedaron con DOS sobrecargas vivas** (la vieja de 3/4
      parámetros + la nueva de 6/7) porque agregar parámetros al final con
      `create or replace function` no reemplaza la función — a diferencia de un cambio de
      `RETURNS` (que Postgres sí rechaza), esto no avisa solo. Mismo patrón que ya nombró
      ADR-0009/0004 para otras funciones. Se manifestó como `500` al registrar un proveedor
      real desde el formulario, aunque la prueba de `psql` con parámetros nombrados (que no
      tiene esta ambigüedad) pasaba — encontrado recién al probar en navegador, no antes.
      Corregido con `drop function` de las firmas viejas; verificado con `pg_proc` que
      quedó una sola firma de cada una, y con un registro real end-to-end en el navegador.
      Detalle en ADR-0094, sección "Segunda vuelta".
- [x] **Rubro visible en la fila de la lista, sin entrar al detalle** — pedido de Felipe
      el mismo día al ver la pantalla. `ProveedoresPanel.tsx`: se agrega junto al contacto
      ("Jorge Ramos · Tela"), sin tocar el grid de columnas.
- [x] **Los indicadores del detalle también en la lista, y solo para líder — corrección
      angosta de D-27** (`20260918073000_proveedores_lista_indicadores_y_candado_sede.sql`).
      `fn_proveedores()` suma `total_facturado`/`facturas_vencidas`/
      `facturas_recibidas_completas`/`facturas_con_recepcion_pendiente`, todo `NULL` si
      quien pregunta no es líder — el directorio (nombre/RUC/contacto/rubro/plazo/forma de
      pago) sigue siendo para cualquiera. **Hallazgo que cambió el diagnóstico:**
      `/compras/proveedores` ya era solo-líder desde el 2026-09-16
      (`app/(app)/compras/layout.tsx` redirige a colaboradores) — D-27 nunca se actualizó
      para decirlo. Lo genuinamente nuevo es el candado del lado de los datos (antes,
      alguien podía llamar `fn_proveedores()` directo por API y seguir viendo saldo/
      facturas). Se sacó un chequeo de rol redundante que se había escrito en
      `[id]/page.tsx` (el layout ya lo hacía). D-27 corregido con la misma disciplina que
      D-45/D-46. Detalle completo en ADR-0094, sección "Tercera vuelta".
- [x] **Bug real #2, mismo día: `fn_proveedor_metricas_compras`/`_insumos` — "column
      reference \"saldo\" is ambiguous"** al convertirlas a `plpgsql` para poder rechazar a
      quien no es líder: Postgres declara cada columna de `RETURNS TABLE` como variable de
      salida, y `saldo` (columna de salida) chocó con `compras.saldo` (columna de tabla).
      `create or replace` no lo avisa al aplicar — se manifestó recién al abrir la
      pantalla en el navegador. Corregido calificando cada columna con alias (`c.saldo`,
      `il.fecha_ingreso`). Verificado de nuevo en el navegador, dos veces (líder y
      colaboradora).
- [x] **Fusionado con `main` (26 commits, 2026-09-18) — dos hallazgos reales en el
      camino**, ninguno cosmético: (1) `aprobar_devolucion`/`resolver_prenda_danada`
      también las había tocado otra sesión (Nota de Crédito automática; "Liquidada"
      exige venta real) — la migración de `devolver_proveedor` se reconstruyó sobre
      ese cuerpo real, no el viejo, para no revivir un backdoor de integridad ya
      cerrado ni perder la Nota de Crédito. (2) `resolver_prenda_danada` quedó con
      dos sobrecargas vivas (3 params de la otra sesión + 4 de esta) — mismo bug que
      `registrar_proveedor`, cerrado igual con `drop function`. Migraciones
      renombradas `20260918070000`-`073000` por choque de timestamp con 3 archivos
      de `main`. `db reset`/typecheck/lint/297 tests en verde sobre el árbol
      mezclado. Detalle completo en BITÁCORA 2026-09-18.
- [ ] **Pegar las 4 migraciones en producción** — con el prefijo `retail.` en el SQL Editor
      (CLAUDE.md) o vía MCP de Supabase. Ninguna toca datos existentes (solo columnas/
      funciones nuevas), pero sigue siendo cambio de esquema en producción — confirmar con
      Felipe antes, no autónomo. **Ojo: no son independientes** — `20260918070000`
      redefine `aprobar_devolucion`/`resolver_prenda_danada` sobre el cuerpo que
      trajeron `20260918050000` (Nota de Crédito) y `20260917195508`/`095000`
      (Liquidada), que también tienen que estar aplicadas antes en producción, o
      `create or replace` fallaría al no encontrar la firma que espera reemplazar.
- [ ] **Sin pruebas automatizadas** para `devolver_proveedor`/las métricas nuevas — mismo
      patrón de deuda que el resto de RPC de escritura del repo.
- [ ] **Filtrar/agrupar proveedores por `rubro` en la lista** — el campo ya se guarda, se
      lee y ya se ve por fila; falta el filtro/agrupación propiamente dicho. No construido a
      propósito (fuera del alcance que pidió Felipe esta vez).
- [ ] **Los 2 proveedores del seed tienen un RUC que no pasa el checksum de
      `validarDocumento`** — el botón Guardar del modal de edición queda deshabilitado para
      cualquier cambio a "Confecciones del Sur EIRL" o "Textiles Andina SAC" mientras el
      campo RUC no se corrija a mano primero. Encontrado al verificar esta pasada en
      navegador; es un problema de los datos de prueba del seed, no del código de esta
      sesión — no se tocó.
- [ ] **`docs/datos/modulos/09-compras-y-proveedores.md` describe una tabla `proveedores`
      que no existe** (banco/cuenta_bancaria/categoría/marca/score/teléfono,
      `productos.proveedor_id`) — verificado contra producción real que ninguna de esas
      columnas existe, ni ahí ni en este repo. Mismo síntoma que ya tuvo el módulo 02
      (doc describiendo V1/otra línea de migraciones). No reescrito en esta pasada — es su
      propia tarea, no improvisada acá.

---

## 🎯 Taxonomía de variante: tallas/tejidos/patrones/etiquetas (2026-09-17, ADR-0095)

Worktree `cayla-taxonomia-design`. Vocabulario cerrado (propone/aprueba/rechaza, mismo
mecanismo que colores) para talla, tejido, patrón y etiquetas de catálogo, con filtro
por categoría (`categoria_tallas`/`categoria_tejidos`/`categoria_patrones`) y candado de
sede extendido a traslados. Backend + `NuevoProductoForm.tsx`/`ProductoForm.tsx`
probados en navegador como Líder (crear, editar, guardar). Tipos, lint y 293 pruebas en
verde.

- [x] **Etiquetas: pantalla rediseñada (2026-09-18).** Ilustración protagonista, chip de
      temporada (Vigente / En N días / Fuera de temporada), filtros con conteo, búsqueda sin
      tildes, "Desactivar" solo al pasar el mouse. Arregló de paso "hoy" en UTC → hora de Lima.
- [x] **Colores: sin Tipo ni foto de la tela (2026-09-18, ADR-0106).** Textura = Tejidos,
      estampado = Patrones. Se puede escribir el código HTML o RGB al crear/editar un color.
      Las columnas `tipo` e `imagen_muestra_url` quedan sin uso en la base (no se borran).
- [x] **Etiquetas de campaña — paso 2, modelo y pantalla (2026-09-18, ADR-0107).** Modal
      «Configurar campaña» (% de descuento, fechas, categorías opcionales) y tarjeta con el
      descuento. Guarda todo con un RPC atómico. **Sin efecto en caja.**
- [x] **Pegada en producción y verificada (2026-09-18, solo lectura): `supabase/migrations/20260918160000_etiquetas_descuento_y_categorias.sql`.** Ya lleva `retail.`, es idempotente. Sin ella, la pestaña
      Etiquetas de `/productos/atributos` cae en vivo (las otras cuatro no). Después:
      `pnpm datos:generar:produccion` con el volcado refrescado (entra `etiqueta_categorias`).
- [x] **Etiquetas de campaña — paso 3, la venta lo aplica (2026-09-18, ADR-0108).** Construido y
      probado (25 escenarios SQL en un Postgres de prueba; 579 pruebas; caja y modal verificados
      en navegador). Un descuento por prenda: el mayor. Sin código para la campaña. Fecha en
      hora de Lima. Aviso rojo «por debajo del costo» en el modal de campaña.
- [x] **Pegada en producción y verificada (2026-09-18, solo lectura): `supabase/migrations/20260918170000_venta_aplica_descuento_de_campana.sql`
      — cambia `registrar_venta`.** `registrar_venta` ya lleva la lógica de campaña y existen
      `campanas_vigentes()`, `fn_campanas_por_variante()` y `fn_hoy_lima()`; producción tiene 0
      campañas configuradas. **Volcado refrescado el mismo día** (entran `venta_items.descuento_etiqueta_id`
      y esas tres funciones).
- [ ] **Probar UNA campaña real en caja** (aún no se ha hecho): etiqueta de prueba sin categorías,
      una sola variante, venta de prueba anulada después. Casos: dos etiquetas (20 % y 40 % → 40 %,
      no 60 %), manual que solo reemplaza si es mayor, y campaña que termina hoy después de las 7 pm.
- [ ] **Campañas: lo que no cubre.** `registrar_cambio` y `liquidar_prenda_danada` no aplican
      campañas. Un ticket armado ANTES de que empiece una campaña se rechaza al cobrar («recarga
      Vender»): hoy no se re-evalúa solo en pantalla. La tolerancia de 3 días para la venta sin red
      (`c_tolerancia_campana`) se puede cambiar por mandar la fecha de la venta (firma nueva).
      Decidir si «Jeans» cubre a «Jeans niño» el día que existan subcategorías (hoy 0).
- [ ] **Falso positivo de `datos:comparar` sobre `emitir_comprobante`/`p_token`:** producción ya
      lo acepta (migración 20260918091500); el volcado de funciones está viejo. Se cierra solo al
      refrescarlo.
- [x] **Colores: modal legible y color nuevo sin beige por defecto (2026-09-18).** Muestra única con
      hex, confirmación al desactivar, el color nace sin elegir y la API lo exige.
- [ ] **Colores: decidir si la familia «Estampado» sale de `FAMILIAS_COLOR`** (pantalla y API).
      `EST`, `MUL` y `ANI` ya están desactivados en producción (verificado 2026-09-18, solo lectura:
      `activo=false`, 0 variantes, 0 fotos), así que NO hace falta migración de datos. Lo que queda es
      que el selector de familia todavía deja archivar un color nuevo ahí, aunque el estampado vive
      en Patrones (ADR-0106).
- [x] **Colores: el código de 3 letras se sugiere desde el nombre (2026-09-18).** `lib/color-codigo.ts`
      (regla sacada de los 35 códigos reales: 1 palabra = 3 letras, 2 palabras = 2+1), con 7 pruebas.
      Deja de seguir al nombre si la persona lo escribe; avisa en vivo «Ya lo usa «X»» (cuenta también
      los desactivados) y bloquea el guardado. Verificado en navegador.
- [ ] **Colores: el campo «Orden» ya no significa nada claro** desde que la grilla agrupa por familia
      (todo color nuevo entra con 200). Decidir: quitarlo (orden por nombre) o subir/bajar.
- [ ] **Colores: cuántas prendas usa cada color** (12 de 31 activos no tienen ninguna) y quién
      propuso un pendiente (`propuesto_por` existe, la pantalla no lo lee). Junto con `TarjetaAtributo`.
- [ ] **Colores: sin pruebas** de la API (`/api/productos/colores`) ni de la pantalla; solo
      `color-entrada.test.ts`.
- [ ] **Extraer una `TarjetaAtributo` compartida (Colores/Tejidos/Patrones/Etiquetas).** Desde
      2026-09-18 las cuatro miden igual (5 columnas, margen 16 px, imagen 3:1) pero cada
      archivo repite esas clases a mano: el día que una cambie sin las otras, vuelve el desalineo.
- [x] **Mostrar cuántas variantes usan cada etiqueta (2026-09-19).** La tarjeta dice «N prendas etiquetadas
      a mano» (solo Líder). «Antes de desactivar» ya lo bloquea el servidor con el conteo exacto.
- [x] **Etiquetar prendas más fácil — puerta 1: desde la etiqueta (2026-09-19, ADR-0112).** Botón «Prendas»
      en cada tarjeta: lista de productos con casillas (una marca todas las tallas), excepciones por talla,
      filtro por categoría, «Marcar/Soltar visibles», y **vista previa antes de aplicar** si la etiqueta
      lleva descuento (cuántas prendas, cuánto baja, desde cuándo, cuáles quedan bajo su costo).
- [x] **Pegada en producción y verificada (2026-09-19, solo lectura): `supabase/migrations/20260919010000_etiquetar_variantes.sql`.**
      `retail.etiquetar_variantes(p_cambios jsonb) -> jsonb`: security definer, `search_path=retail, public`, ejecutable
      por `authenticated` y NO por `anon`, con los candados del archivo (Líder, «aprobada y activa», `for share`,
      `on conflict do nothing`, tope por etiqueta). `variante_etiquetas` sigue en 0 filas y `registrar_venta` intacta.
      Su firma ya está en `funciones-produccion.txt` y `datos:comparar` no marca nada roto.
- [ ] **Volcado de producción desactualizado por otras migraciones (hallado 2026-09-19).** Producción tiene 162 funciones
      y el volcado 158: 7 funciones nuevas o con firma distinta (`buscar_productos_parecidos`, `crear_producto_con_variantes`,
      `actualizar_categoria_ejes`, `fn_clave_referencia`, `fn_dentro_de_una_edicion`, `fn_productos_referencia_trigger`,
      `fn_titulo_referencia`) y 3 que ya no existen. Falta refrescar el resto del volcado con el método por firma md5
      (bitácora del 2026-09-18); en este PR solo se añadió la firma de `etiquetar_variantes`.
- [ ] **Etiquetar prendas más fácil — puerta 2: en lote desde `/productos`.** Marcar filas → «Etiquetar…» con
      el mismo RPC y la misma vista previa. Ya decidido con Felipe (2026-09-19): las dos puertas.
- [ ] **Etiquetas de rotación automáticas (Nuevo / Últimas unidades / Top ventas).** Se calculan de alta, stock
      y ventas en vez de etiquetarse a mano (decidido 2026-09-19). Fijar umbrales con Felipe: ¿«Nuevo» = 30 días?
      ¿«Últimas» = 2 unidades en total o por sede? ¿«Top ventas» = las N más vendidas de los últimos 30 días?
      Ojo: hoy las 164 variantes tienen <30 días, «Nuevo» marcaría todo.

- [x] **Pegada en producción (2026-09-17, tarde-noche) — la mitad que faltaba, después
      de que #75 se fusionara a `main` sin su migración.** El "Production Deploy" del
      entorno de esa sesión se la bloqueó, y Vercel desplegó igual el frontend que ya
      esperaba `talla_id` — `/productos` cayó en producción ("NO SE PUDO CARGAR") hasta
      que se aplicó esto. Cadena completa aplicada y reverificada contra
      `vovjyyiafkxteijimpuy`: `retail.tallas` + `categoria_tallas/tejidos/patrones` (la
      parte segura, ya lista desde antes), `variantes.talla_id` (backfill 144/145 filas,
      la única excepción es el sentinel "Cargo especial"), la restricción
      `variantes_producto_talla_color_unico`, `fn_variante_permitida_en_sede` en
      `registrar_venta` (en `transferir` queda escrito pero inerte — producción ya usa
      `iniciar_traslado`/`confirmar_traslado`, ADR-0068), `catalogo_crear_producto`/
      `catalogo_actualizar_producto` con `talla_id` + `color_codigo` en fotos, y
      `categorias.tallas_sugeridas` borrada. Detalle completo — incluida la
      reconciliación de 2 funciones que quedaron rotas por el cambio
      (`fn_prioridad_conteo`, `fn_productos`, que seguían leyendo `variantes.talla` ya
      borrada) y 4 sobrecargas de RPC duplicadas encontradas y cerradas en el camino —
      en BITÁCORA 2026-09-17. Verificación final: cero sobrecargas duplicadas y cero
      referencias a `variantes.talla` en todo `pg_proc` de producción.
      - [ ] **Lo que NO se pegó, a propósito — decisión de negocio, no técnica:**
            `20260917110000` (renombres de ADR-0096: Blusas se fusiona con Camisas,
            etc.) queda vivo solo en este repo/local. Cambia el desplegable que ve una
            encargada de sede ahora mismo — el momento de activarlo en producción lo
            decide Felipe, no es un fix pendiente. Ver 🎯 Familias y categorías, abajo.
- [x] **La reverificación de arriba no cazó todo: a `retail.etiquetas` en producción le
      faltaba la columna `notas` — Catálogo > Etiquetas caía en vivo con "Esta pantalla
      no está mostrando datos".** La tabla la había creado una rama vieja nunca
      fusionada (ver `pegar-en-produccion-taxonomia-parte-segura.sql`); esa
      reconciliación arregló los triggers pero nunca comparó columna por columna.
      `alter table retail.etiquetas add column if not exists notas text;` corrida por
      Felipe en el SQL Editor, reverificada por lectura contra
      `information_schema.columns` (0 filas, sin riesgo). De paso, el trigger que trae
      `20260917100200_etiquetas_catalogo.sql` estaba desactualizado frente al que de
      verdad corre en producción (le faltaba "reactivar retira el rechazo") — corregido
      en el archivo para que un `db reset` local no diverja.
- [x] **Vocabulario real de Etiquetas cargado: 22 filas (2026-09-17).** 19 comerciales/
      festividades (investigadas contra Zara/Bershka/Ralph Lauren/Hermès y calendario
      peruano real — CyberWow lo organiza IAB Perú, Black Friday 27-nov distinto de
      CyberWow, Galentine's/Día del Gato/Día del Perro/Día de la Tierra con fecha
      verificada) + "Para liquidar" generada por sede (`retail.ubicaciones` activa,
      dinámico — no hardcodeado, porque local y producción no comparten nombres de
      sede). Migración `20260917230000`: `vigente_desde`/`vigente_hasta` (calculado en
      lectura, no un cron) + comentario obligatorio al aprobar (mismo candado que
      Tallas, ahora en las 5). Migración `20260917230100`: la semilla. Verificado con
      `db reset` completo (no incremental), `typecheck`/`lint`, y navegador contra
      Postgres local real — las 22 tarjetas con el candado de sede visible.
      **Cerrado 2026-09-18:** vigencia ya conectada — `ProductoForm.tsx` solo ofrece
      etiquetas vigentes hoy (filtro en servidor), y `/productos/etiquetas` muestra la
      ventana + si está vigente o "fuera de temporada". Estilo visual construido
      (migración `20260918060000`): 3 colores fijos + General — urgencia (ámbar),
      positivo (verde), campana (taupe-profundo), nunca rojo (violaría
      `MAX_ROJO_POR_PANTALLA` con 20 tarjetas) ni color libre. Las 20 etiquetas
      clasificadas por nombre. La pantalla agrupa por color en vez de grilla plana.
      **Pendiente, menor:** una etiqueta nueva creada desde la pantalla nace `neutral`
      sin selector para clasificarla ahí mismo — hay que reclasificarla por SQL o en
      una próxima sesión si hace falta desde el día uno.
- [x] **"Para liquidar" corregido: de 4 filas por sede a 1 global (2026-09-18).**
      El diseño original restringía por sede con `sedes_permitidas` — Felipe preguntó
      "por qué 4" y la pregunta destapó que el candado no es cosmético:
      `fn_variante_permitida_en_sede` (`registrar_venta`/`transferir`) lo usa para
      BLOQUEAR venta/traslado, no solo para avisar. Habría bloqueado sin querer la
      venta de una prenda en una sede que tenía su propio stock fresco. Corregido a
      una sola etiqueta global (migración `20260918030000`, 0 variantes afectadas,
      verificado antes de escribirla) y se quitó el botón "SEDES"/todo el flujo de
      edición de `sedes_permitidas` de las 20 etiquetas restantes — "empresa
      uniforme", decisión de Felipe. La columna sigue en el esquema, dormida. PR #115.
- [x] **Tejidos sembrado: 17 valores reales (2026-09-18).** Vacío desde ADR-0095
      (17-sep). Investigado contra Google Merchant Center + el vocabulario propio de
      proveedores de Gamarra (Tejido de Punto vs Tejido Plano), con dos fibras
      peruanas reales (algodón pima, alpaca). Un solo nombre por concepto sin "/"
      (Licra cubre Full Lycra, Jersey cubre Interlock, Rib no se separa de Rib
      licrado). Migración `20260918140000`, los 17 nacen `aprobado`. Verificado con
      `db reset` completo, typecheck/lint, navegador. PR pendiente de abrir.
      **Pendiente, aparte:** Patrones también sembrado (7 valores) y "Estampado"/
      "Multicolor"/"Animal print" retirados de Colores donde estaban duplicados
      (migración `20260918100000`, PR #123, todavía sin fusionar) — imagen de
      muestra para Patrones (como ya tiene Colores) quedó pedida por Felipe, sin
      construir todavía.
- [x] **Las 4 pantallas de administración de vocabulario** (`/productos/tallas`,
      `/productos/tejidos`, `/productos/patrones`, `/productos/etiquetas`, mismo patrón
      que `ColoresLista.tsx`) — construidas y agregadas al nav de "Catálogo"
      (`AppShell.tsx`). Etiquetas suma un campo propio, `sedes_permitidas` (multi-select
      de `retail.ubicaciones`, opcional). Probado en navegador como Líder: proponer,
      aprobar (con comentario obligatorio en Tallas), rechazar, reactivar, desactivar, y
      el candado "en uso" de Etiquetas (bloquea desactivar si alguna variante la tiene
      aplicada — ese candado vive en la API, no en el trigger de la base, porque el
      trigger de `etiquetas` solo cubre la transición pendiente→rechazado, no
      aprobado→desactivado). `db reset`, typecheck y lint en verde.
- [x] **Aplicar/quitar una etiqueta de una VARIANTE puntual ya tiene pantalla.** Dentro
      de "Editar producto" (`ProductoForm.tsx`) — un toggle "Etiquetas" por fila de
      variante, respaldado por un RPC nuevo (`retail.actualizar_variantes_etiquetas`) que
      guarda todas las variantes tocadas en una sola llamada, en la MISMA acción de
      "Guardar cambios" (nunca un botón aparte). Solo manda al RPC las variantes cuyas
      etiquetas de verdad cambiaron contra lo que había al abrir el formulario — evita
      pisar `variante_etiquetas.created_at` en cada guardado del producto y evita exponer
      un guardado de solo precio a un error de etiquetas que no viene al caso. Probado en
      navegador de punta a punta: aplicar una etiqueta, guardar, confirmar por SQL que
      solo esa variante tiene fila nueva; guardar de nuevo sin tocar etiquetas y confirmar
      que `created_at` no se mueve. `db reset`, typecheck, lint y 293 tests en verde.
- [x] **Mapear categoría↔eje ya tiene UI.** Dentro del modal "Editar categoría"
      (`CategoriasLista.tsx`) — 3 grupos de chips (Tallas/Tejidos/Patrones), un botón de
      guardado propio (RPC `retail.actualizar_categoria_ejes`, atómico entre los 3 ejes).
      Antes de esto, tejido/patrón estaban vacíos para TODA categoría (nadie había cargado
      `categoria_tejidos`/`categoria_patrones`) — el selector ya existía en
      `NuevoProductoForm.tsx` pero no tenía nada para ofrecer. Probado en navegador de
      punta a punta: mapear Denim a Jeans en Categorías, confirmar que aparece en el
      selector de tejido al crear un producto de esa categoría. `db reset`, typecheck,
      lint y 293 tests en verde.

---

## 🎯 Vender/Caja ya muestra la foto del producto (2026-09-17)

Felipe: si la Grilla de Productos ya muestra fotos, Caja debería mostrar las mismas —
es el mismo catálogo. `getCatalogo()` (`catalogo-v2.ts`) no traía `producto_fotos` en
su query embebida; se agregó, y `fotoUrl` se resuelve por color exacto (mismo criterio
`color_codigo` que ya usa la Grilla). El dato viaja completo por los 5 archivos entre
la consulta y la tarjeta (`vender/page.tsx` → `PuntoDeVenta.tsx` → `catalogo-grupos.ts`
→ `PuntoDeVentaCatalogo.tsx`), reemplazando el placeholder de iniciales quieto por la
foto real cuando existe (el placeholder se queda como estaba para variantes sin foto
propia). Probado en navegador: prenda con foto la muestra en la tarjeta de Vender;
prenda sin foto sigue con el placeholder de iniciales, sin romperse.

- [x] Cerrado y verificado en navegador. Sin pendientes.

---

## 🎯 Familias y categorías: el contenido real (2026-09-17, ADR-0096)

Investigación real contra Zara, H&M, Bershka, Hermès, Ralph Lauren, LVMH y Platanitos
(terminología peruana). 6 familias (Accesorios pasa a mostrarse "Accesorios y
Complementos"), 39 categorías activas + 2 archivadas (Blusas fusionada con Camisas,
Trajes de baño sin uso). Migración `20260917110000`, probada en navegador.

- [x] **`familia` ya no es un `CHECK constraint` fijo — pasó a tabla propia
      (2026-09-18, ADR-0103).** `retail.familias` (código estable en texto,
      autogenerado del nombre), SIN proponer/aprobar — es decisión de marca,
      no vocabulario operativo, mismo patrón que ya usa `retail.categorias`
      (no el de tejidos/patrones, que sí tienen ese flujo). Pantalla nueva
      `/productos/familias`, líder-only. **Colisión resuelta con Felipe en
      vivo**: `claude/fix-old-stuff-0192ff` construyó en paralelo una
      versión distinta (`familia_id` uuid, con proponer/aprobar) — Felipe
      comparó las dos y eligió esta; ver ADR-0103 para el porqué completo y
      el aviso a esa sesión en `SESIONES-ACTIVAS.md`. Verificado en
      navegador como líder; `pnpm typecheck`/`lint`/297 tests en verde.
      Pendiente: aplicar en producción (SQL con prefijo `retail.`).
- [ ] **Categorías desactivadas de esta sesión (Blusas, Trajes de baño)** — confirmar con
      Felipe si alguna vuelve a activarse cuando el censo real (no el inventario de
      prueba de hoy) muestre que sí hay volumen ahí.
- [ ] **`20260917110000` (los renombres en sí) NO está en producción, a propósito.**
      Confirmado 2026-09-17 tarde-noche al pegar el resto de la taxonomía: producción
      sigue mostrando "Blusas" y "Camisas" como categorías separadas, y "Accesorios"
      sin el "y Complementos". Falta el ok explícito de Felipe sobre el momento
      (cambia lo que ve una encargada de sede hoy mismo) — no es una migración
      olvidada.

---

## 🎯 Revocar EXECUTE público de las funciones "motor" (2026-09-17, ADR-0078)

`retail.fn_aplicar_movimiento(uuid)` (security definer, sin auto-chequeo) tenía EXECUTE
otorgado a `anon` y `authenticated` — cualquiera podía reaplicar un movimiento de tipo
`entrada` ya existente por RPC directo y duplicar stock sin sesión. Mismo patrón que ya se
cerró para `fn_recalcular_costo_variante` (ADR-0067). Detalle completo, tabla de
llamadores verificados contra `pg_proc` y smoke test en
[docs/adr/0078-revocar-execute-publico-de-las-funciones-motor.md](adr/0078-revocar-execute-publico-de-las-funciones-motor.md).

- [x] **Aplicado en LOCAL** (`docker exec`, no `db reset`):
      `20260917150000_revocar_execute_fn_aplicar_movimiento.sql` y
      `20260917150001_revocar_execute_correlativos_y_codigos.sql` — esta segunda también
      cierra `fn_reservar_numero_serie`/`fn_siguiente_correlativo` (mismo patrón, y más
      grave: llamarlas directo quema un número de serie SUNAT sin emitir nada) y
      `fn_asignar_codigo_producto`/`fn_asignar_codigo_variante` (revoke angosto, solo de
      `anon` — `authenticated` lo necesita vía un trigger que no es security definer).
      Verificado con smoke test `psql`+`ROLLBACK`: los seis caminos anon/authenticated
      directos quedan bloqueados, los dos caminos legítimos (wrapper security definer,
      trigger de variantes) siguen funcionando.
- [x] **Verificado contra producción (solo lectura) — el diagnóstico cambia.**
      `fn_aplicar_movimiento` y `fn_recalcular_costo_variante` ya están cerradas ahí;
      `fn_asignar_codigo_producto`/`variante` ya están en el estado angosto correcto. Pero
      **`fn_reservar_numero_serie`/`fn_siguiente_correlativo` siguen con EXECUTE abierto a
      `authenticated` en producción, hoy** — el hueco de numeración SUNAT es real y
      vigente, no hipotético. Detalle en ADR-0078.
- [x] **Aplicado en PRODUCCIÓN (2026-09-17), reverificado después.** Las dos migraciones
      corrieron contra `vovjyyiafkxteijimpuy` (el primer intento lo frenó el clasificador de
      auto mode, el segundo — con Felipe reconfirmando — sí pasó). Reverificado con
      `has_function_privilege`: las cinco funciones quedaron en el estado esperado.
      `get_advisors` no mostró nada nuevo. `20260917150000` fue no-op (ya estaba cerrada);
      `20260917150001` cerró el hueco real de `fn_reservar_numero_serie`/
      `fn_siguiente_correlativo` para `authenticated`.
- [x] **Confirmado contra producción: `registrar_movimiento_una_sola_firma`
      (20260916214600) en efecto colapsó las dos sobrecargas ambiguas** que localmente
      todavía existen (el smoke test de esta tarea tropezó con la ambigüedad). Falta traer
      ese parche a un archivo de este repo — sigue sin uno.
- [x] **De paso, verificado el BLOQUE 1 de `docs/datos/SQL-PENDIENTE-PRODUCCION.sql`
      (2026-09-12): `authenticated` con `TRUNCATE` sobre `retail`, el más grave de la lista
      ("perder CAYLA entera").** Cero filas en producción hoy — ya no existe, para ningún
      rol. El archivo sigue diciendo "nada ejecutado"; está desactualizado, no el riesgo. No
      se revisaron los demás bloques del archivo.
- [ ] **`pnpm datos:comparar` (corrido de paso, ritual de "Regla de oro") encontró 18
      pantallas rotas en producción — sin relación con esta tarea.** Ninguna de las cinco
      funciones de arriba aparece en la lista. Son funciones que existen en este código
      (`iniciar_traslado`, `cerrar_produccion`, `crear_producto_con_variantes`,
      `fn_prioridad_conteo`, mayormente Producción/Traslados/Conteos) pero nunca llegaron a
      `vovjyyiafkxteijimpuy`. Detalle completo en `docs/datos/generado/DRIFT.md` (ya
      regenerado). Merece su propia sesión — toca varios módulos a la vez.

---

## 🎯 Productos — vista de grilla visual (2026-09-17, ADR-0077)

`/productos` alterna grilla ⇄ tabla (`?vista=`), tarjeta con swatches de color
interactivos (hover = vista previa, clic = fijo) y una vista rápida con detalle de
variantes + Ajustar inventario. Sin fotos reales — ninguna en producción — usa un tinte
del color como placeholder honesto en vez de un ícono de "sin foto". Segunda pasada el
mismo día: en Grilla, el Resumen pasa a una línea muda salvo que haya algo que atender.
Tercera pasada: los filtros pasan a píldoras con ícono, y el botón "Filtros" plegable
vuelve (a Felipe le gustaba más así) — Categoría/Color/Estado/Stock dejan el `<select>`
nativo por Radix Select (mismo `radix-ui` ya instalado): la lista abierta también tiene
estilo propio. Color muestra el swatch real de cada opción (`colores.hex`, sumado a la
consulta). Cuarta pasada: las píldoras pierden la caja con borde — ícono+texto sueltos
con el mismo hilo vivo que ya usa `CampoTexto` en el resto del sistema, el panel que
las agrupa pasa a una sola tarjeta con separadores finos en vez de una caja de cajas.
Quinta pasada: el panel pasa de fondo blanco (`papel`) a `sand/50` ("plomo"), las
píldoras ganan la tipografía versalita de "Filtros", y se suma orden por precio
ascendente/descendente (`p_orden` en `fn_productos`,
`20260917180000_productos_ordenar_por_precio.sql`). La Tabla conserva las dos tarjetas
completas, sin tocar en ninguna pasada. Todo construido y verificado en el navegador
local (10 productos reales, incluido el orden por precio funcionando de punta a punta).

- [x] **`20260917180000_productos_ordenar_por_precio.sql` — resuelto indirectamente, con
      un incidente en el medio (2026-09-17, ver BITÁCORA "`/productos` caído en
      producción").** No se pegó nunca sola: solo llegó `20260917190000` (fotos por
      color), que ya traía el mismo `p_orden` en su propio cuerpo — pero como su `DROP`
      apuntaba a la firma de 10 parámetros y no a la de 9, la sobrecarga vieja quedó
      viva y `/productos` se cayó por ambigüedad de RPC. Cerrado con
      `20260917200000_fn_productos_dropea_sobrecarga_vieja.sql` (ok puntual de Felipe:
      "Si hazlo"). Verificado: una sola sobrecarga, `fn_productos` responde con datos
      reales.

- [x] **`producto_fotos` gana `color_codigo` y `fn_productos` devuelve `foto_url` por
      variante — construido, en producción y con el primer piloto real de 5 prendas ×
      4 colores (2026-09-17, ADR-0077 addenda 7; ver BITÁCORA "Primeras 20 fotos reales
      del catálogo" y su corrección el mismo día).** `FotosProducto.tsx`
      (`/productos/[id]/editar`) tiene el selector de color por foto. Piloto real: 5
      productos nuevos (Blusa Ximena, Casaca Emilia, Chompa Josefina, Pantalón Milagros,
      Short Ivanna), cada uno en sus 4 colores (Blanco/Naranja/Negro/Verde) como
      variantes de UN producto — no 20 productos separados, corregido tras el primer
      intento — con foto real por color en `retail-productos-fotos` y stock real
      inyectado (`carga_inicial` en Taller, mismo mecanismo que el resto del catálogo).
      Confirmado con `fn_productos` devolviendo `foto_url` por variante.
      `20260917190000_producto_fotos_por_color.sql` está en producción
      (verificado directo contra `pg_proc`, no solo por lo que decía este BACKLOG).
- [ ] **Verificar en navegador como colaboradora, no solo como líder.** Esta sesión probó
      con la sesión de Felipe en local; falta confirmar que "Ajustar inventario"/"Editar"
      desde la vista rápida se comportan igual para un integrante sin rol de líder.
- [ ] **Sin cambios de esquema en esta pieza** — nada que aplicar a producción todavía; el
      toggle y el componente nuevo son 100% código de front.

---

## 🎯 Recibir mercadería: productos fuera de factura (2026-09-17, ADR-0076)

Felipe: "recibir mercadería" solo se rige respecto a las facturas — si algo
llegó (o se envió) pero ninguna factura de la guía lo lista, no había dónde
anotarlo sin salir a `/inventario/recibir` y perder que llegó en el mismo
paquete. `recibir_compras` ahora acepta ítems con `compra_item_id = null` en
el mismo `p_items`: mismo lote/guía/proveedor que lo facturado, sin tope
contra ninguna línea, sin tocar `compra_pagos` (no inventa deuda), costo
opcional (mismo criterio que `recibir_lote`). Pantalla: nueva sección "¿Llegó
algo que no está en la factura?" en `RecepcionCompraFormV2.tsx`, con el mismo
`ComboBuscable` que ya usa "Registrar factura" para buscar cualquier producto
del catálogo — no solo lo que está en las facturas seleccionadas. Detalle
completo, incluida la verificación por SQL (4 escenarios, con `rollback`) y en
navegador real, en ADR-0076.

Distinto del hueco "mercadería corta o dañada no tiene adónde ir" de la
auditoría más abajo (2026-09-17, misma fecha) — ese es sub-entrega contra lo
facturado; este es sobre-entrega sin factura. No se tocan entre sí.

- [x] **En producción desde 2026-09-17** — aplicada con el MCP de Supabase
      (`apply_migration` contra `vovjyyiafkxteijimpuy`, ok de Felipe para
      todo el paso), no a mano en el SQL Editor. Verificado después contra
      la base, no solo que no tirara error: `retail.recibir_compras` quedó
      con una sola sobrecarga (candado ADR-0009/0004 intacto) y su cuerpo
      real ya tiene `v_con_factura`. `get_advisors` (security) no marcó nada
      nuevo — la única advertencia es la genérica de cualquier
      `security definer` + `authenticated`, ya presente en el resto de RPC
      del repo.
- [ ] **Sin pruebas automatizadas para el camino nuevo** — mismo patrón de
      deuda que el resto de RPC de escritura (ver "Cambios: primeras pruebas
      automatizadas" más abajo). Si alguien escribe
      `scripts/pruebas/recibir_compras.mjs`, los 4 escenarios de ADR-0076 son
      el punto de partida.
- [ ] **Dato de prueba real en el Postgres local compartido.** La recepción
      de "Blusa Emma S/Negro" (2 u., costo 25.50, fuera de factura) + 3 u.
      reales de "Casaca Ximena S/Negro" contra F002-001045 queda en la base
      — no se borró (principio 4, `movimientos` es append-only). Mismo
      criterio que la recepción sin factura de la sesión anterior, el mismo
      día.

---

## 🔖 Pendientes Benja

> Felipe: "recuérdame esto para revisarlo luego con Benja, no lo construyas todavía."
> Sección aparte a propósito — no es un ítem de 🎯/🩹 más, es una cola visible de
> "esto necesita una conversación de negocio antes de volverse código". Se lee al
> abrir sesión junto con el resto de este archivo.
>
> **Nota de fusión (2026-09-17):** otra sesión creó en paralelo una sección equivalente
> ("👤 Pendientes de Benja", mismo concepto, mismo día) — se fusionó acá para no tener
> dos colas del mismo tipo con nombres distintos (mismo criterio que ya aplicó este
> archivo antes con secciones duplicadas de auditoría de migraciones).

- [x] ~~Cuarentena — historial y estado de salida de una prenda dañada~~ **construido
      2026-09-17 (noche)** — Felipe aclaró que lo pendiente era solo la editabilidad,
      no los 3 estados en sí ("ahora mismo necesito los 3 estados [...] luego vamos por
      medio de un panel de administrador, poder editar estas decisiones"). Ver
      `docs/adr/0071-inventario-se-lee-como-cuatro-pantallas.md`, sección "Construcción
      2026-09-17 (noche)", para el detalle completo. Lo único que sigue pendiente de
      esa conversación con Benja es el punto de abajo.

- [ ] **Panel de administrador para editar los 3 estados de Cuarentena.** Hoy Liquidada/
      Se botó/Donada están fijos en un `check` de `retail.prendas_danadas` (migración
      `20260917095000_cuarentena_prendas_danadas.sql`) — cambiar el vocabulario o agregar
      un cuarto estado es una migración, no una pantalla. Felipe pidió que esto nazca
      chico y no se sobrecargue de funciones todavía. Preguntas reales que siguen
      abiertas (no se decidieron solas): ¿quién más allá de un líder podría necesitar
      editar estos estados?

- [x] ~~¿"Liquidada" debería registrar una venta real?~~ **Sí — confirmado por Felipe,
      2026-09-17: "se tiene que tomar en cuenta liquidación como una venta, totalmente".**
      Construido en `20260917150000_liquidar_prenda_danada_como_venta.sql`: nueva función
      `liquidar_prenda_danada` (precio + forma de pago, exige caja abierta, sin comprobante
      por ahora — ver ADR-0071 sección "Corrección 2026-09-17 (más tarde)" para el
      detalle y lo que queda fuera a propósito).

- [x] ~~`devolver_proveedor` — mismo bug de "desaparece sin dejar rastro" que tenía
      Dañado~~ **decisión de Felipe, 2026-09-17: no es prioridad.** "Me parece que la
      manejarán de otra manera [...] si no afecta en nuestra actividad actual ahora mismo,
      entonces no." Sigue sin tocar — si en algún momento se vuelve relevante, retomar
      desde `retail.aprobar_devolucion`, rama `devolver_proveedor`.

- [ ] **Reporte de valor en riesgo, cruzando las 3 sedes a la vez (2026-09-17).** Surgió
      al corregir `fn_prioridad_conteo` (ADR-0074, § "Descartado") — esa función sugiere
      qué contar primero para UNA sede, pensada para el colaborador que va a contar hoy.
      Lo que Benja tendría que construir es distinto: una vista para Felipe/líderes que
      responda "¿cuánta plata sin contar hay expuesta ahora mismo, en las 3 sedes y el
      Taller, ordenada de mayor a menor?" — sin acción de conteo asociada, es solo
      visibilidad para decidir dónde presionar. No reusar `fn_prioridad_conteo` tal cual:
      está `security definer` con `fn_puede_operar_ubicacion` (una sola sede por llamada)
      — una versión cross-sede necesita su propio RPC y probablemente reservarse a
      líder/Felipe, no a cualquier colaborador autenticado. Sin fecha, sin dueño todavía.

---

## 🎯 Recibir mercadería: lista de recepciones + "+ Nueva recepción" (2026-09-17)

Felipe lo pidió tras la auditoría de huecos de más abajo (misma fecha): la pantalla no
dejaba ver nada de lo ya recibido, solo lo pendiente o un formulario en blanco. Sin
cambios de esquema — `retail.lotes` ya guardaba cada recepción (con o sin factura,
ADR-0035); nadie la leía todavía fuera del detalle de una factura puntual
(`getRecepcionesCompra`). Nuevo: `getRecepcionesRecientes()` (`lib/compras.ts`) generaliza
esa misma consulta sin acotar a una factura, y `RecepcionesRecientes.tsx` (reusa
`Tabla`/`Encabezado` de `components/ui/Tabla.tsx`) la dibuja en las dos pantallas:

- **`/inventario/recibir` (sin factura):** pasó de ser siempre el formulario a lista +
  botón — mismo patrón que Colores/Categorías (2026-09-15): `RecibirLotePanel.tsx`
  (nuevo) pone el formulario (`RecepcionFormV2`, lógica de escritura intacta, solo le
  quité el `card-cayla` propio para que no quede una tarjeta dentro de otra) detrás de
  "+ Nueva recepción" en un `Modal`.
- **`/compras/recibir` (con factura, ADR-0035):** pestañas "Pendientes"/"Recibidas
  recientemente" por `?vista=`, server-driven (sin estado de cliente nuevo) para no
  tocar `RecepcionCompraFormV2` (615 líneas, ya maneja bastante estado propio). Cada
  fila de "Recibidas" enlaza a `/compras/factura/[compraId]`.
- Enlace cruzado en los dos sentidos: antes solo `/compras/recibir` mencionaba (y solo
  en su estado vacío) la ruta sin factura; ahora los dos headers se referencian entre sí
  siempre, no solo cuando la lista está vacía.

Verificado en navegador real: recepción sin factura completa (Confecciones del Sur
EIRL, Tienda Lima, 1 unidad, 17/09/2026 — queda como dato real en el Postgres local
compartido, no se borra, principio 4) aparece al instante en la lista tras
`router.refresh()`; pestaña "Recibidas" de Compras muestra las 2 facturas ya recibidas
del seed y enlaza bien al detalle; como Micaela (colaboradora, Tienda Trujillo) la
lista sin factura sale vacía y scoped a su sede — RLS de `lotes`/`movimientos`
(`fn_puede_operar_ubicacion`) ya lo resolvía, no hizo falta acotar nada a mano.
`pnpm --filter web typecheck`/`lint` en verde.

- [ ] **Pregunta de negocio para Felipe, no técnica — cuál pantalla es el default.**
      La tarjeta "Recibir mercadería" del Inicio (`AppShell.tsx`, sección `acciones`)
      manda a `/inventario/recibir` (sin factura); el menú global "+ Nuevo" manda a
      `/compras/recibir` (con factura, el camino principal según ADR-0035). Los dos
      accesos más visibles de la app hoy no coinciden. No lo cambié — decidir cuál es
      el más común en la operación real es suyo, no de Postgres/Next.js.
- [x] **Corrección (mismo día): lo de `personas` NO era drift — es real, en
      producción también.** Primer diagnóstico (arriba, ya borrado) decía que
      `retail.personas` vivía en `public` por drift del Postgres local. Falso:
      verificado contra producción (`vovjyyiafkxteijimpuy`, `information_schema.tables`)
      que `retail.personas` **no existe ahí tampoco** — la identidad de personas está
      unificada con Dynamic desde julio-2026, en `public.personas` (su tabla de
      RR.HH. completa: `nombres`/`apellidos`, no `nombre`; `sede_base_id`, no
      `ubicacion_id`; 30+ columnas de planilla). PostgREST no embebe entre schemas, y
      el propio repo YA tiene el patrón correcto para esto —
      `fn_nombres_personas(p_ids uuid[])` (`0009_integracion_dynamic.sql`), que
      `caja.ts`/`conteos.ts`/`traslados.ts`/`devoluciones.ts` ya usan. Se corrigió
      `getRecepcionesRecientes` para usar esa misma RPC (ya no toca `personas`
      directo) y se revirtió el hand-fix de `packages/database/src/types.ts` (la
      tabla `personas` y el FK que le había agregado a mano a `lotes` no existen en
      ningún lado — era una tabla inventada). Verificado en navegador: "Recibido por"
      ahora sale con el nombre real en las dos filas de la lista.
- [ ] **Sin pruebas automatizadas** para `getRecepcionesRecientes` — mismo patrón de
      deuda que el resto de RPC/consultas de este módulo (ver sección de huecos de
      más abajo, mismo día).

---

## 🎯 Auditoría de migraciones pendientes en producción (2026-09-17)

Felipe pidió validar qué migraciones de `supabase/migrations/` faltan en producción,
antes de correrlas. **Nada contra docs — cada fila de abajo se verificó en vivo contra
`vovjyyiafkxteijimpuy` schema `retail`** (`execute_sql`/`list_migrations`, solo lectura):
columnas/funciones/índices reales, y para dos casos el cuerpo de la función (no alcanza
con que la función exista — hay que ver qué hace). El propio BACKLOG venía desactualizado
en dos direcciones — otra vez el patrón de [[commits-y-migraciones-en-produccion]]:
`20260916200000_numeracion_traslados_conteos.sql` y el SQL de colores del 16-sep
**ya estaban aplicados** (corregidos arriba, en sus propias secciones) aunque sus
checkboxes seguían sin marcar. Las 7 migraciones "de las 5 piezas inspiradas en NetSuite"
más `cambio_y_devolucion_exigen_caja`/`anular_venta`/`variantes_identidad_unica` — 7
chequeos directos contra columnas/funciones reales — también están todas aplicadas.

- [x] **`20260916223000_venta_precio_cambiado_sku_nulo.sql` — aplicada en producción
      2026-09-17, con ok puntual de Felipe.** Corrida con el MCP de Supabase
      (`apply_migration` contra `vovjyyiafkxteijimpuy`), no a mano en el SQL Editor.
      Verificado después contra la base, no solo que no tirara error: una sola
      sobrecarga de `retail.registrar_venta` (sin dejar el candado ADR-0009/0004
      roto) y su cuerpo real ya arma `v_sku` con
      `coalesce(v.codigo, v.sku, 'sin código')`, no con el `select` original.
- [ ] **Producción tiene migraciones sin registro local** (informativo, no bloquea nada):
      `list_migrations` muestra `historial_candado_completo` (20260916200000),
      `historial_producto_estado_restaurado` (20260916201742),
      `anular_venta_sin_huecos` (20260916214500) y
      `registrar_movimiento_una_sola_firma` (20260916214600) aplicadas en producción sin
      un archivo `supabase/migrations/*.sql` con ese nombre en este repo — probablemente
      parches que Felipe escribió directo en el SQL Editor. No se investigó qué cambian
      exactamente (no era la pregunta de hoy); si alguna corrige algo que un archivo local
      "deshace" al pegarse encima, vale la pena migrar el fix a un archivo del repo antes
      de la próxima ronda de producción.
- [ ] **`benja-migracion.sql` sigue como estaba: NO ejecutar.** El propio archivo se
      marca "PENDIENTE DE REVISIÓN — NO EJECUTADO EN PRODUCCIÓN. NO CORRER TAL CUAL" — es
      un `pg_dump --schema-only` de referencia, no una migración incremental. No se tocó.

---

## 🔍 Revisión: Recibir mercadería — huecos para flujo completo de ERP (2026-09-17)

Auditoría pedida por Felipe sobre `/compras/recibir` (RPC `recibir_compras`, ADR-0035) y
`/inventario/recibir` (RPC `recibir_lote`, sin factura) — sin cambios de código, solo
lectura de repo + producción (`vovjyyiafkxteijimpuy`). El diseño en sí está sólido (costo
promedio ponderado con `costo_historial` auditable, tope contra lo facturado con
`select ... for update`, piso/almacén, adjuntos de factura, paginado por cursor) — los
huecos son de alcance, no de correctitud.

- [ ] **El flujo nunca corrió en producción de verdad.** `retail.compras` = 0 filas
      (verificado contra la base, no contra docs). De 160 movimientos `tipo='entrada'`,
      156 son `carga_inicial`, 3 `siembra_cargo_especial`, 1 `devolucion` — ninguno
      `motivo='recepcion'`. Ni `recibir_compras` ni `recibir_lote` se ejecutaron nunca en
      producción. Antes de agregar nada más, correr una recepción real es lo que más
      destapa fricción de verdad (principio 7).
- [ ] **Mercadería corta o dañada no tiene adónde ir** — ya admitido en el propio
      ADR-0035 (docs/adr/0035-la-factura-de-compra-es-el-eje-de-recepcion-y-pago.md:92-93,
      "falta decidir si se agrega 'cerrar línea con faltante'"). Sin eso, una factura con
      3 prendas rotas queda `parcial` para siempre.
- [ ] **Devolución a proveedor es una etiqueta hueca.** `devolucion_items.condicion =
      'devolver_proveedor'` existe (`0002_esquema.sql:269`) pero en `aprobar_devolucion`
      (`20260914230000_inventario_piso_almacen.sql:596-604`) esa condición no genera
      ningún movimiento ni ajuste de deuda con el proveedor — la fila queda marcada y ahí
      termina. Conecta directo con el punto anterior: mercadería dañada no tiene cómo
      salir del sistema hacia el proveedor ni descontarse de lo que se le debe.
- [x] **Insumos/materia prima del Taller: dominio fantasma — RESUELTO 2026-09-17
      (ADR-0090), aplicado en producción.** `retail.insumos`/`insumo_lotes`/
      `movimientos_insumo`/`v_insumo_saldos` (+ `recibir_insumo`/
      `ajustar_insumo_por_conteo`, YA funcionando) son huérfanas del volcado de
      unificación (jul-2026), 0 filas, sin conectar. Primer intento del día construyó un
      esquema paralelo por no leer este ítem antes — chocaba de nombre, se descartó
      (commit `fd3488f`, historia en ADR-0090). Versión final: **adoptado el esquema
      huérfano tal cual** (dos sesiones distintas lo reconstruyeron el mismo día, de
      forma independiente, y coincidieron columna por columna — buena confirmación
      cruzada), más la única pieza que faltaba, `retail.registrar_consumo_insumo`
      (elige el lote más antiguo con saldo, sin partir entre lotes; recalcula
      `costo_tela`/`costo_avios` real). **Local:** `20260917140000_insumos_taller_reconstruido.sql`
      (espejo, ya en `main`) + `20260917141500_registrar_consumo_insumo.sql` (la pieza
      nueva). **`registrar_consumo_insumo` pegada en producción el 2026-09-17** (ok
      explícito de Felipe, excepción puntual a D-11) — confirmado `security_type=DEFINER`
      y `proacl` sin `public`. Fuera de alcance a propósito: `compra_items.producto_id`
      sigue sin poder recibir tela/avíos contra una factura por `/compras/recibir`, y
      `NuevaOrdenProduccionForm.tsx` sigue sin conectar al nuevo stock.
- [ ] **Etiquetado físico (código de barras) al recibir no existe hoy.**
      `EtiquetasGenerator.tsx` ya no está en el árbol; quedan huérfanos `Codigo128.tsx`/
      `codigo128.ts` sin ningún importador (verificado con grep — cero componentes los
      usan). Este mismo BACKLOG decía que `/etiquetas` se "movió a Compras hace tiempo"
      (línea ~546 de este archivo), pero no existe ninguna carpeta `etiquetas` bajo
      `apps/web/app/(app)/compras` — el traslado nunca se completó.
- [ ] **Piso vs. almacén al recibir es 100% fijo.** `fn_sububicacion_por_defecto('entrada')`
      (`20260914230000_inventario_piso_almacen.sql:74-87`) siempre devuelve
      `almacen_tienda`, calculado una sola vez antes del loop; ni la RPC ni la pantalla
      dejan mandar parte de una recepción directo al piso de venta. Probablemente
      intencional (se mueve después por separado vía `/inventario/mover`), vale
      confirmarlo con Felipe si alguna vez pesa en la operación real.
- [ ] **Sin pruebas automatizadas** para `recibir_compras`/`recibir_lote` (`scripts/pruebas/`
      tiene `registrar_cambio.mjs`, `aprobar_devolucion_caja.mjs` y, desde 2026-09-17,
      `registrar_venta.mjs`) — mismo patrón de deuda que todavía tienen
      `iniciar_traslado`/`cerrar_caja` (ver sección "Ventas: primeras pruebas
      automatizadas de `registrar_venta`" más abajo), todavía no le tocó el turno a este
      RPC.
- [ ] **D-45 (`docs/datos/DECISIONES-2026-09-12.md:275`, costeo del inventario) sigue
      listada como abierta pese a que ya se resolvió en código** (promedio ponderado,
      `20260916090000_costo_promedio_ponderado.sql`, confirmado en producción hoy) — el
      documento de decisiones nunca se actualizó para cerrarla. Corregir la tabla de
      "Decisiones que quedaron abiertas" en ese archivo.

---

## 🎯 Facturación: auditoría de flujo completo (2026-09-17)

Felipe preguntó qué le falta al módulo para un flujo completo de ERP. Solo auditoría —
sin cambios de código. Detalle completo, con cita de archivo/línea de cada hallazgo, en
`docs/datos/modulos/08-facturacion-sunat.md` (huecos 1-16, actualizado hoy). Primer
hallazgo, antes que nada: el doc de módulo (fechado 12-sep) tenía **dos huecos ya
resueltos ese mismo día** por `0011_venta_con_comprobante.sql` — venta↔comprobante SÍ
están conectados (`PuntoDeVenta.tsx:647-650` manda `p_tipo_comprobante` siempre) y la
proforma SÍ guarda `precio_unitario` correcto — quedaron marcados RESUELTO en el doc,
con cita, para que nadie los reconstruya.

- [x] **El PDF/XML/CDR que Lucode devuelve en cada emisión se guarda en
      `comprobantes.respuesta_sunat` y ninguna pantalla lo mostraba — CERRADO
      2026-09-18.** `getComprobantesMes` (`lib/comprobantes.ts`) ahora extrae
      `pdfUrl`/`xmlUrl`/`cdrUrl` de `respuesta_sunat` y `ComprobantesPanel.tsx`
      los muestra como enlaces ("Ver PDF · XML · CDR") debajo de cada
      comprobante, en la tabla de escritorio y la tarjeta de celular. Sin
      cambio de esquema — el dato ya existía, solo faltaba leerlo. Verificado
      en navegador local inyectando una `respuesta_sunat` de prueba (revertida
      después). `tsc`/lint/297 tests en verde.
- [x] **Comprobante `pendiente` huérfano, sin camino de salida — RESUELTO
      2026-09-17 por ADR-0093 (`marcar_comprobante_no_emitido`), verificado
      por la auditoría del 2026-09-18: existe la RPC, el botón "Liberar" en
      `ComprobantesPanel.tsx`, y el estado `no_emitido` en el esquema.** Ya
      no es un hueco abierto.
- [x] **Devoluciones/Cambios no emitían Nota de Crédito — CERRADO 2026-09-18
      (ADR-0100).** `aprobar_devolucion` ahora emite la Nota de Crédito sola
      (`emitir_nota`, sin llamador real desde la Fase 0) cuando la venta
      devuelta tiene un comprobante `aceptado` — por el valor exacto de lo
      devuelto, con el motivo 06/07 del Catálogo 09 según sea total o
      parcial. Sin pantalla nueva: aparece en la lista de comprobantes de
      Facturación, lista para "Transmitir". Probado en local con SQL directo
      (devolución parcial real: NC01-000001, subtotal 63.47 + IGV 11.43 =
      total 74.90, coincide centavo a centavo con el cálculo de
      `ComprobantesPanel.tsx`). CI encontró un bug real antes de fusionar
      (la reconstrucción de `aprobar_devolucion` se llevó por delante el
      candado de caja abierta y la cuarentena de prendas dañadas de 2
      migraciones posteriores reales) — corregido, 48/48 pruebas de los 4
      scripts de `scripts/pruebas/` en verde. `tsc`/lint/297 tests en verde.
      **`20260918050000_devolucion_emite_nota_credito.sql` aplicada y
      verificada en producción 2026-09-18** (columna + función confirmadas,
      cuerpo de `aprobar_devolucion` comparado byte a byte contra el de
      producción antes de reemplazarlo).
      **Pendiente real de Felipe, sigue bloqueando el primer uso:** ninguna
      ubicación tiene serie de `nota_credito` registrada todavía — hay que
      registrarla (botón "Registrar serie", ya existe) en cada ubicación con
      boleta o factura, o la primera devolución sobre una venta facturada va
      a fallar con un mensaje que se lo pide explícitamente (a propósito:
      mejor bloquear con un mensaje claro que aprobar la devolución y dejar
      la Nota de Crédito perdida para siempre).
- [x] **`emitir_comprobante` sin idempotencia (hueco 1) y sin candado de IGV (hueco 2b)
      — CERRADO 2026-09-18 (ADR-0102), `20260918091500_emitir_comprobante_idempotente_y_valida_igv.sql`.**
      Portado el mismo patrón `token_cliente`/`p_token` de `registrar_venta`: el guard
      revisa el token antes de reservar el correlativo, así un reintento (respuesta
      perdida, no doble clic) no quema un segundo número. `ComprobantesPanel.tsx` manda
      el token con `useRef` (mismo patrón que `PuntoDeVenta.tsx`). Además, `subtotal +
      igv = total` ahora se valida en la base en `emitir_comprobante` y `crear_proforma`
      — ya no se puede guardar una cifra que no cuadra llamando la RPC directo. Aplicado
      y verificado contra Postgres local (`psql -f`, `CREATE FUNCTION` sin error,
      `pg_get_function_identity_arguments` confirma `p_token`); `pnpm --filter database
      typecheck`/`pnpm --filter web typecheck` en verde. **No probado con una llamada RPC
      autenticada real** (exige JWT/persona real, ver ADR-0102) — solo verificación
      estructural. **No aplicado en producción** — pendiente de Felipe (D-11), aunque ya
      verificado contra `cayla-dynamic` de solo lectura: `emitir_comprobante`/
      `crear_proforma` tienen la misma firma que local (`p_ubicacion_id` incluido,
      no `p_sede_id`), `token_cliente` no existe todavía, 0 filas en
      `comprobantes`/`proformas` con `subtotal+igv≠total` — la migración está lista para
      pegar tal cual, prefijo `retail.` ya incluido en el archivo. **Sigue sin resolver:**
      el 18% hardcodeado en 3 archivos (parte (a) del hueco 2) y el redondeo
      navegador-vs-Lucode (parte (c)) — ver "Lo que falta" en ADR-0102.

Encontrado pero no listado arriba (menor prioridad, incluido en el doc de módulo, no
repetido acá por la regla de 3 ítems por cubo): `registrar_serie_comprobante` no valida
ubicación, un líder puede reapuntar la serie de otra tienda (hueco 12);
`comprobantes.cliente_*` no está ligado a la tabla `clientes` (hueco 16); cero pruebas de
las RPC del módulo contra Postgres real (a diferencia de `registrar_cambio`/
`aprobar_devolucion`, ADR-0066); y el bug ya anotado 2026-09-16 de "Monto facturado"
sumando pendientes/rechazados/anulados/prueba sigue sin decisión.

---

## 🐛 `registrar_venta`: `venta_precio_cambiado` revienta con una prenda sin SKU (2026-09-16)

- [x] **`v_sku` llegaba `NULL` a un `raise ... using detail = ... || v_sku || ...`**
      (`20260915140000_descuento_motivo_y_escalonado.sql`) para cualquier prenda del
      censo (`crear_producto_con_variantes`, `sku` nullable desde
      `20260915221633_crear_producto_con_variantes.sql`). Concatenar con `||` un NULL
      da NULL, y Postgres corta el `RAISE` con su propio error interno ("RAISE
      statement option cannot be null") en vez del `venta_precio_cambiado` (o
      `venta_descuento_*`) que se quería lanzar — la colaboradora veía un error crudo
      de Postgres justo en la venta de una prenda sin SKU, sin el mensaje traducido de
      `error-escritura.ts`. Corregido en
      `20260916223000_venta_precio_cambiado_sku_nulo.sql`: mismo criterio que
      `apps/web/lib/prenda-reglas.ts` (`codigoPrenda`) — código de etiqueta primero,
      sku legado de respaldo, texto fijo si no hubiera ninguno. Reproducido y
      verificado en local (`npx supabase db reset` + una prenda sin sku real): antes
      revienta con el error de Postgres, después lanza `venta_precio_cambiado` con el
      código de etiqueta en el `detail`.
      **En producción desde 2026-09-17** — aplicada con el MCP de Supabase (ok
      puntual de Felipe), no a mano en el SQL Editor. Verificado contra
      `vovjyyiafkxteijimpuy`: `retail.registrar_venta` sigue con una sola sobrecarga
      (mismo candado que se chequeó antes de pegar, ADR-0009/0004) y su cuerpo real
      ya arma `v_sku` con `coalesce(v.codigo, v.sku, 'sin código')`, no con el
      `select` original.

---

## 🎯 Inventario — las 4 vistas de Felipe (2026-09-16, ADR-0071)

Rama `inventario-vistas-de-felipe`. Existencias, Movimientos, Traslados y Conteo
rediseñadas sobre los datos que ya existían; "Inventario" es grupo del lateral con las
4 como pestañas. Tipos, lint, 282 pruebas y build en verde; recorrido en navegador como
líder (Lima) y como colaboradora (Trujillo).

- [x] **Aplicar en producción `20260916200000_numeracion_traslados_conteos.sql`** —
      hecho el 2026-09-16 vía MCP de Supabase (PR #60 ya fusionado), y confirmado de
      nuevo el 2026-09-17 por otra auditoría independiente: `numero`,
      `fn_conteos_resumen`, `conteos.alcance` existen en `vovjyyiafkxteijimpuy`
      (`list_migrations` la muestra pegada con timestamp `20260916231541`). Este
      checkbox se quedó sin marcar en las dos sesiones hasta ahora — dos veces la
      misma verificación, misma respuesta.
- [ ] **Lo que los diseños traían y quedó fuera a propósito:** ~~exportar a CSV/Excel en
      Existencias~~ **RESUELTO 2026-09-17** — botón "Exportar CSV" en
      `InventarioPanel.tsx`, mismo patrón que `AjustarInventarioModal` con
      `descargarCsv`, exporta las filas ya filtradas en pantalla. Quedan: exportar CSV en
      Movimientos (exige una consulta completa, no la página), campana de
      notificaciones, "Ajuste rápido" desde la cabecera de Movimientos (hoy vive por fila
      en Existencias).
- [ ] **"Pedir traslado" no es una acción del sistema.** El semáforo "Stock bajo" dice
      "pide traslado" y "En la red" dice dónde hay, pero el pedido se hace por
      WhatsApp. Una "solicitud de traslado" desde la sede destino (que la sede origen
      convierte en `iniciar_traslado`) cerraría el ciclo. Es modelo de datos nuevo:
      pedir a Felipe con Ganas/Pagas antes de tocarlo.
- [x] ~~"Dañado" (2026-09-17) — decidido: Opción A, sin construir todavía~~
      **construido 2026-09-17 (noche).** `cuarentena` como tercer tipo de
      sububicación; `aprobar_devolucion` mueve ahí las condiciones
      `danada_reparacion`/`danada_donar` en vez de hacerlas desaparecer; tabla
      `retail.prendas_danadas` + RPC `resolver_prenda_danada` (solo líder) resuelven
      cada una como Liquidada/Se botó/Donada; Existencias reemplazó la tarjeta "Piden
      atención" por "Dañado". El ajuste "Merma" de `AjustarInventarioModal` NO se
      tocó — ya tenía su propio movimiento auditable, es un mecanismo distinto. Ver
      ADR-0071, sección "Construcción 2026-09-17 (noche)", para el detalle completo
      y lo que quedó explícitamente fuera de esta pasada (panel de administrador
      para editar los 3 estados; si "Liquidada" debería ser una venta real) — ambos
      en "🔖 Pendientes Benja" más arriba.

---

## 🎯 Colores: proponer/aprobar (2026-09-16, ADR-0070)

Rama `claude/proponer-aprobar-color-20260916`. Cierra el punto que había quedado
abierto en el ítem de Loro de más abajo: cualquiera con sesión propone un color y
queda usable al instante (no frena el censo); cualquiera de los 9 Líderes lo aprueba
después. `retail.colores` gana `estado`/`propuesto_por`/`aprobado_por`/`aprobado_en`;
el estado real lo decide un trigger (`fn_colores_estado_trigger`) mirando
`fn_es_lider()`, no el cliente. `typecheck`/`lint`/266 tests en verde.

- [x] **Pegado en producción — 2026-09-17.** Felipe corrió los 3 bloques en el SQL
      Editor de `cayla-dynamic`. Comprobación (bloque 4): `estados_invalidos=0`,
      `trigger_creado=1`, `policy_insert=1`, `policy_update=1`, `policy_vieja=0` —
      los 5 valores exactos esperados. `colores_ya_aprobados=31`, no "32+" como decía
      el comentario del script (estimación del 16-sep, desactualizada) — confirmado
      por consulta directa (`select estado, count(*) from retail.colores group by
      estado`) que producción tiene hoy exactamente 31 colores, los 31 en
      `aprobado`, cero `pendiente` y cero en estado inválido.
- [x] **Verificado en navegador real, contra el Postgres LOCAL — 2026-09-17 (no el
      canal de ROLLBACK/impersonación del 16-sep, que tiene `rolbypassrls=true` y
      no prueba nada de RLS).** Micaela (`micaela@cayla.local`, Colaboradora real
      del seed, Tienda Trujillo) inició sesión de verdad
      (`supabase.auth.signInWithPassword`) y propuso "Verde Prueba RLS 20260917"
      (`VPR`) en `/productos/colores`: quedó usable al instante con
      `estado='pendiente'`, sin bloquear el flujo. Su intento de aprobarlo se
      probó por dos caminos — no solo "el botón no aparece", que `security-review`
      de este repo ya penaliza como prueba insuficiente: (1) PATCH directo a
      PostgREST (`/rest/v1/colores`, con su JWT real, sin pasar por la app) —
      `colores_update_lider` lo dejó pasar como consulta válida pero sin tocar
      ninguna fila (`200`, `[]`, el comportamiento normal de un `USING` que no
      matchea); (2) PATCH directo a `/api/productos/colores` — el guard propio de
      la ruta respondió `403 "Solo un Líder puede editar el vocabulario de
      colores."`. Lectura directa de Postgres (`docker exec ... psql`, sin pasar
      por RLS) confirmó que el color siguió `pendiente` después de los dos
      intentos. Felipe (Líder, Tienda Lima) inició sesión aparte, vio el botón
      "Aprobar" que Micaela nunca vio, lo usó, y Postgres confirmó
      `estado='aprobado'`, `propuesto_por=Micaela`, `aprobado_por=Felipe`,
      `aprobado_en` sellado. Color de prueba borrado al cerrar (cero variantes lo
      usaban). Las dos políticas RLS (`colores_insert_autenticado`/
      `colores_update_lider`) quedan probadas de punta a punta, ya no solo por
      inferencia de patrón. Ver ADR-0070, sección "Cómo se verificó" (actualizada).
      **Repetido en producción el mismo día por Felipe, en persona, con una cuenta
      real:** confirmó que las mismas situaciones (proponer, no poder aprobar como
      Colaboradora, sí poder aprobar como Líder) funcionan igual en `cayla-dynamic`.
      A diferencia de la prueba local de arriba, esta quedó al nivel "Felipe lo
      probó y confirmó que funciona" — sin el detalle de qué devolvió cada request
      capturado en el chat.
- [x] **`SQL-PENDIENTE-PRODUCCION-2026-09-16-colores.sql` sí está en producción**
      (verificado 2026-09-17 contra `vovjyyiafkxteijimpuy`, no contra docs:
      `retail.colores.estado`/`propuesto_por` y `fn_colores_estado_trigger`
      existen). Este BACKLOG no reflejaba que ya se aplicó — la verificación de
      abajo (colaboradora real en el navegador) sigue abierta, es un punto aparte.
- [ ] **Verificación pendiente, con dueño claro:** la lógica del trigger se probó de
      verdad contra producción (impersonando a Felipe y a Angie Chávez, una de las 16
      colaboradoras dadas de alta hoy, en una transacción con ROLLBACK). Las dos
      políticas RLS nuevas **no** se pudieron probar de punta a punta por ese mismo
      canal — la conexión usada tiene `rolbypassrls=true` y pasa por encima de
      cualquier política siempre. Sintaxis idéntica a `colores_select`/
      `productos_write_lider`, ya vivas en producción, pero es inferencia por patrón,
      no prueba. **Falta: alguien con una cuenta de Colaborador real entra a
      `/productos/colores` en el navegador, propone un color, y confirma que no
      puede aprobarlo — solo un Líder puede.** Ver ADR-0070, sección "Cómo se
      verificó".
- [ ] **No hay forma de "rechazar" una propuesta mala, solo desactivarla** una por
      una desde el camino que ya existía. Con 16 cuentas nuevas es un riesgo bajo,
      no cero. No construido a propósito en esta pasada (alcance acotado).

---

## 🎯 Loro (módulo 02) — prendas escaneables antes del censo (2026-09-16)

Rama `claude/taxonomia-loro-tucan-15eaf3`. Verificado contra V2 y contra producción:
`docs/datos/modulos/02-catalogo-y-vocabulario.md` describe V1, y 3 de los 4 huecos que
Felipe priorizó ya los había cerrado el corte a V2 (disparador de códigos, color como FK,
pantalla de colores). Lo que quedaba se cerró aquí: regla de identidad con talla
normalizada (ADR-0069), red de códigos para variantes activas y `/buscar` leyendo
códigos de barras. Probado en local; tipos y 266 pruebas en verde.

- [x] **`SQL-PENDIENTE-PRODUCCION-2026-09-16-loro.sql`: pegado y confirmado en
      producción 2026-09-16 — cerrado.** Felipe lo corrió completo, bloque 0
      (pre-flight) dio 0 como se esperaba. Comprobación final (bloque 3), igual a lo
      previsto: `activas_sin_codigo=0`, `activas_sin_codigo_barras=0`,
      `productos_descontinuados=6`, `regla_nueva=1`, `regla_vieja=0`,
      `colores_sin_familia=0`, `arena_activa=ARN`. Verificado además por consulta
      directa (Supabase MCP, solo lectura): `retail.colores` tiene `ARE` inactivo
      ("Arena (retirado)") y `ARN` activo ("Arena"). Las 37 variantes de producción
      quedan escaneables (código + código de barras); los 6 productos de prueba
      (BLU-001/PAN-001/VES-001/POL-001/CHO-001/FAL-001) descontinuados, con su
      historial intacto.
- [x] **Stock fantasma de los productos de prueba — ya no existe, se arregló sin
      script ni registro (verificado 2026-09-17).** Archivarlos los sacaba de
      caja, catálogo y conteo, pero dejaba sus ~1.600 unidades vivas en
      `retail.stock` (900 en Taller) porque archivar nunca escribió movimientos
      que las llevaran a 0. Al ir a construir el script de limpieza idempotente
      (`registrar_movimiento` con `p_tipo='ajuste'`, motivo explícito) que este
      ítem pedía, la consulta directa a producción (Supabase MCP, solo lectura)
      mostró `retail.stock` en 0 filas para las 36 variantes de los 6 productos:
      alguien ya lo había corregido a mano — 108 movimientos `ajuste`/`otro` el
      2026-09-16 21:44 UTC por exactamente -1604 (cuadra con 1620 carga_inicial +
      1 devolución − 17 ventas), sin dejar script, sin motivo descriptivo y sin
      anotarlo acá ni en BITACORA. No se construyó el script de limpieza porque
      no había nada que limpiar. Local nunca tuvo este catálogo de prueba
      sembrado (`datos-prueba-catalogo-produccion.sql` excluido a propósito de
      `db reset`), así que tampoco había forma de probar el script ahí.
- [x] **Filtro defensivo en `getStockPorUbicacion` (2026-09-17).** Para que la
      próxima vez que se archive un producto con stock residual ningún reporte
      lo arrastre en silencio: `variante:variantes!inner` + `.eq("variante.activo",
      true)` en `apps/web/lib/inventario-v2.ts` — mismo flag que ya oculta de
      caja/catálogo/conteo. Typecheck, lint y 293 pruebas en verde; verificado en
      el navegador local (Tienda Lima con piso/almacén y Taller sin separación,
      ambas sin regresión). No se pudo ver el caso que sí oculta: hoy no existe
      ningún producto inactivo con stock real, ni en local ni en producción,
      contra el cual probarlo en vivo.
- [x] **Proponer y aprobar colores (decisión 2026-09-16) — construido, ver la sección
      propia "Colores: proponer/aprobar" más arriba (ADR-0070).** Felipe decidió que
      cualquiera de los 9 Líderes actuales aprueba, sin nivel "admin" nuevo. Falta
      pegar en producción y la verificación en navegador que quedó anotada ahí — no
      cerrado del todo todavía. Sigue pendiente el mismo mecanismo para Tucán
      (taxonomía), no construido en esta pasada.
- [x] **`/buscar` sin punto de entrada** (ver "Buscador global fuera de la
      cabecera", más abajo) — resuelto 2026-09-17: tarjeta "Buscar" en Acciones
      de Inicio + campo propio en la pantalla.
      cualquiera de los 9 Líderes actuales aprueba, sin nivel "admin" nuevo. La
      verificación en navegador y el pegado en producción quedaron cerrados el
      mismo 2026-09-17. Sigue pendiente el mismo mecanismo para Tucán (taxonomía),
      no construido en esta pasada.
- [ ] **`/buscar` sin punto de entrada** (ver "Buscador global fuera de la cabecera"):
      ya lee códigos de barras, pero solo se llega por URL.
- [ ] **Reescribir el documento del módulo 02 sobre V2.** Tiene aviso arriba; los huecos
      3, 5, 6, 7, 9-15 no están re-verificados y varios citan migraciones que ya no existen.

---

## 🎯 5 piezas inspiradas en NetSuite (2026-09-16)

Rama `traslados-costeo-reorden-conteo`, todo verificado solo en LOCAL — nada
tocado en producción. Las 5 piezas (costo promedio ponderado, punto de
reorden, conteo por alcance, indicador de rotación, traslados en dos fases)
quedaron cada una en su propio commit, con su propia migración. Detalle
completo en BITÁCORA de esta fecha.

- [ ] **Guía de Remisión Electrónica (SUNAT) para traslados entre
      ubicaciones.** Hueco legal real, encontrado al investigar el traslado
      en dos fases (no construido, a pedido explícito de Felipe — es una
      integración aparte con su propia autorización, como Nubefact). Desde
      2023, mover mercadería entre establecimientos la exige. Verificado por
      grep: cero implementación en el repo hoy. Retomar cuando Felipe lo
      decida, con su contador/asesor legal — no antes.
- [ ] **Recuperar "fecha de pedido" real para el punto de reorden**, si el
      proxy actual (factura→recepción) resulta muy impreciso en la práctica.
      El campo existía en V1 y se borró a propósito en el corte a V2; Felipe
      eligió el proxy por ahora, sabiendo que no es el dato real de tiempo de
      entrega (pedido→llegada).
- [ ] **Decidir si el diseño "censo" completo** (`supabase/unificacion/30_conteos.sql`
      — conteo por familia/contenedor, alta de prenda al vuelo, escaneo
      server-side) se recupera algún día, o se descarta a propósito. Hoy solo
      se reactivó el campo `alcance` (categoría); el resto sigue perdido
      desde el corte a V2, sin que nadie lo haya decidido con esos términos.

---

## 🎯 Cambio y devolución exigen caja si hay efectivo de por medio (2026-09-16)

Al escribir las pruebas de `registrar_cambio` (ítem siguiente) se encontró que ADR-0052
(devoluciones) y ADR-0053 (cambios) habían dejado, cada uno en su propia cabecera de
migración, el MISMO hueco sin resolver: sin caja abierta en la ubicación, la diferencia/
reembolso en efectivo queda con `caja_id = null` — invisible para siempre en cualquier
`cerrar_caja`. Felipe pidió armar el paso para cerrarlo. Detalle completo en ADR-0064.

- [x] **`20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql`** —
      `registrar_cambio`/`aprobar_devolucion` rechazan ahora (mismo mensaje que ya usa
      `registrar_venta`: "No hay una caja abierta…") cuando hay efectivo real moviéndose
      y no hay caja abierta; sin efectivo, siguen funcionando igual que antes. Mismas
      firmas, sin columnas nuevas. Probada en local
      (`pnpm pruebas:registrar-cambio` 13/13, `pnpm pruebas:aprobar-devolucion-caja` 2/2,
      `typecheck`/`lint` limpios).
- [x] **En producción desde 2026-09-16** — pegada por Felipe en el SQL Editor de
      `cayla-dynamic` (con `set search_path = retail, public, extensions;`, ya incluido
      en el archivo); verificada contra `pg_proc` que `registrar_cambio` y
      `aprobar_devolucion` quedaron con una sola sobrecarga cada una (conteo = 1, no el
      hueco de ADR-0009/0004).
- [ ] **Colisión de número de ADR (0063 y ahora también 0064) con la sesión concurrente
      `devoluciones-anular-ventas-e282dc`** (su propio `anular_venta`, migración
      `20260916172645_anular_venta.sql`, sin relación de código con este cambio — se
      verificó que no tocan las mismas funciones). Se resuelve al fusionar ramas, mismo
      patrón que ya pasó con ADR-0051.

---

## 🎯 Ventas: primeras pruebas automatizadas de `registrar_venta` (2026-09-17)

`registrar_venta` (0003_funciones.sql, hoy 11 parámetros tras 8 migraciones encima —
0008_caja_y_pagos, 0011_venta_con_comprobante, candado_precio_venta, codigos_descuento,
nota_en_ventas, inventario_piso_almacen y 20260915140000_descuento_motivo_y_escalonado)
es la función más tocada del repo — cada venta real de las 3 tiendas pasa por ahí — y
tenía cero pruebas automatizadas, mismo hueco que ya cerró `registrar_cambio` (sección de
abajo, ADR-0066). Firma y cuerpo leídos en vivo con `pg_get_functiondef` contra el
Postgres local, no desde `docs/datos/generado/RPCS.md` (describe la V1 de 4 parámetros —
desactualizado).

- [x] **`scripts/pruebas/registrar_venta.mjs`** — 22 escenarios contra el Postgres local
      real, mismo patrón que `registrar_cambio.mjs` (transacción con `ROLLBACK`,
      `set local request.jwt.claim.sub`, sin JWT/PostgREST). Cubre: venta simple (stock
      correcto en la sede correcta), el candado de sede (`fn_puede_operar_ubicacion`,
      Micaela no puede vender en Lima), caja/carrito/pagos/comprobante inválido, precio
      cambiado vs. catálogo (ADR-0048), variante inexistente, stock insuficiente (nunca
      negativo), idempotencia por `p_token`, y las 10 ramas de descuento de R-45
      (20260915140000): motivo obligatorio, "otro" sin detalle, nunca bajo costo, el
      escalonado 20 %/35 % del Líder con y sin argumento, y el tope por código de una
      Colaboradora (código ausente/inválido/insuficiente/dentro de tope). Corre con
      `pnpm pruebas:registrar-venta` — necesita el stack local, no corre desde
      `pnpm test`/CI (ADR-0066). Verificado: 22/22 en verde, dos corridas seguidas sin
      dejar rastro (conteo de `ventas`/`venta_items`/`movimientos`/stock de la variante
      de prueba idéntico antes/después), y el camino de falla probado a propósito (una
      aserción invertida a mano, confirmó ✗ + exit 1, revertida).
- [ ] **La consigna original pedía probar "una variante restringida a otra sede" — ese
      candado no existe en el código hoy** (verificado por grep en
      `supabase/migrations/*.sql`: cero columnas/tablas de restricción de variante por
      sede). El único candado de sede real es de PERSONA (`fn_puede_operar_ubicacion`,
      ya cubierto arriba). Si Felipe quiere restringir una variante puntual a una sede
      (ej. una prenda exclusiva de Lima), es modelo de datos nuevo — no construido, no
      pedido explícitamente todavía.

Igual que `registrar_cambio`: sigue sin engancharse a CI (no hay pipeline en este repo
todavía) y el mismo patrón sigue pendiente para `crear_devolucion`/`cerrar_caja`/
`iniciar_traslado`/`mover_interno`.

---

## 🎯 Cambios: primeras pruebas automatizadas de `registrar_cambio` (2026-09-16)

`registrar_cambio` (0007_cambios.sql + ADR-0053) tenía cero pruebas automatizadas — cada
verificación anterior fue manual ("verificado en psql"/"en el navegador"). Se revisó
`docs/BACKLOG.md` (sección POS V2 de abajo) antes de empezar: no hay ningún ítem grande
pendiente específico de Cambios — lo único de Cambios en esa sección ya está cerrado
(ComboBuscable, ADR-0053). Detalle completo de la decisión de CÓMO probar una RPC en
ADR-0066 (nuevo).

- [x] **`scripts/pruebas/registrar_cambio.mjs`** — 12 escenarios contra el Postgres local
      real (`docker exec ... psql`, `set local request.jwt.claim.sub`, siempre
      `ROLLBACK` — mismo patrón que ya documenta `supabase/seed.sql`, cero dependencias
      nuevas). Cubre: diferencia en los tres sentidos (cero/cobra/devuelve), los 6
      candados (`cantidad<=0`, diferencia sin método, excede lo comprado, venta/variante
      inexistente, sin stock de la variante nueva), idempotencia por `p_token`, el
      candado de sede (Micaela no puede cambiar en Lima — mismo candado que se pidió
      verificar para Vender, confirmado a nivel RPC) y que la diferencia en efectivo
      cuadra `cerrar_caja` (ADR-0053). Corre con `pnpm pruebas:registrar-cambio` — necesita
      el stack local levantado, **no** corre desde `pnpm test`/CI (ver ADR-0066, no toca
      base de datos). Verificado: 12/12 en verde, dos corridas seguidas, sin dejar rastro
      (`movimientos`/`cambios` de prueba en 0 después de cada corrida).
- [ ] **Tienda Lima y Tienda Trujillo no tienen sububicaciones de piso/almacén en el
      Postgres local compartido** (hallazgo de paso, no de este módulo — ver ADR-0066).
      `seed.sql` las crea pero solo corre en `db reset`; este Postgres se migró de más
      veces sin uno después de `20260914230000_inventario_piso_almacen.sql`. Hoy,
      cualquier venta/cambio real en el navegador contra este mismo Postgres compartido
      (no solo esta prueba) recibe `sububicacion_id = NULL` en vez de piso/almacén real.
      El `INSERT` aditivo para reponerlas (idéntico al de `seed.sql`) está en la cabecera
      de `scripts/pruebas/registrar_cambio.mjs` — bloqueado para este agente por el
      clasificador de auto mode ("Modify Shared Resources", correcto: es una escritura
      persistente sobre un recurso de ~27 worktrees). Felipe decide si lo corre.
- [ ] **El mismo patrón (ADR-0066) falta para el resto de RPC de escritura** —
      `crear_devolucion`, `cerrar_caja`, `iniciar_traslado`, `mover_interno`… ninguna
      tiene pruebas automatizadas todavía (`registrar_venta` ya se cerró, 2026-09-17 —
      ver sección "Ventas: primeras pruebas automatizadas de `registrar_venta`" más
      arriba). No es urgente, es el precedente a copiar cuando alguien las toque. (Nota
      al fusionar: `transferir` ya no existe — lo reemplazó
      `iniciar_traslado`/`confirmar_traslado`, ADR-0068.)

---

## 🎯 Caja: pruebas de abrir_caja/cerrar_caja contra Postgres real (2026-09-16)

`pnpm caja:verificar` (`scripts/caja/verificar.mjs` + `.sql`) — 15 escenarios en una sola
transacción con rollback (mismo patrón que cada sesión de Caja venía haciendo a mano y
perdiendo al cerrar): permisos de `abrir_caja` por ubicación (colaborador propia/ajena
sede, líder cualquiera), unicidad de caja abierta, monto de apertura negativo, aritmética
de `cerrar_caja` con depósito+ajuste, el candado de líder de ADR-0056 en ambas direcciones,
doble cierre, permiso de `cerrar_caja` por ubicación, monto contado negativo. Cero huella
verificada (conteo de `cajas` y `ubicacion_asignada_id` de Micaela iguales antes/después de
3 corridas seguidas); el camino de falla se probó a propósito (una aserción invertida a
mano, confirmó ✗ + exit 1, revertida).

**Pendiente, sin dueño:**

- [ ] **`cerrar_caja` también suma `ventas_efectivo` y reembolsos/diferencia de cambio
      (ADR-0052/0053) — esta prueba no los cubre.** Necesitan fixture de producto+variante+
      venta/devolución/cambio completo, fuera del alcance que pidió Felipe ("abrir_caja ni
      cerrar_caja"). Esos tres términos ya se verificaron a mano en sus propias sesiones;
      quien los quiera automatizados arranca de `scripts/caja/verificar.sql` (mismo patrón
      de identidades simuladas con `request.jwt.claim.sub`).
- [x] **Corrección (2026-09-17): la frase de abajo ("no existe pipeline de CI en este
      repo todavía") estaba mal — sí existe.** `.github/workflows/ci.yml` corre desde el
      2026-09-09 (typecheck/lint/`pnpm test` en cada push a `main` y cada PR — ver su
      propia cabecera y ADR-0026). Verificado contra el archivo real, no contra este
      documento.
- [x] **Revisitado con Felipe (2026-09-17): sí es momento — job piloto agregado a
      `ci.yml`.** `pruebas-postgres` levanta Postgres real (`npx supabase start`, con el
      stub de Dynamic copiado primero — CONTRIBUTING.md §1) y corre `caja:verificar` +
      `pruebas:registrar-cambio`/`aprobar-devolucion-caja`/`registrar-venta` contra él, en
      cada push a `main` y cada PR. Lleva `continue-on-error: true` a propósito: ninguna
      corrida real todavía lo vio funcionar en un runner de GitHub Actions (solo en el
      Postgres local de cada quien), así que no bloquea nada mientras se confirma —
      mismo criterio que ADR-0026 para lo incierto. `migraciones:verificar` se dejó
      afuera a propósito (informa, nunca falla — ADR-0026, mezclarlo es otra decisión).
- [ ] **Pendiente: verlo correr de verdad.** Esta sesión no pusheó — hace falta un push a
      esta rama (o el merge) para que GitHub Actions lo corra por primera vez. Con 2-3
      corridas verdes reales, sacar el `continue-on-error` de `.github/workflows/ci.yml`
      convierte el piloto en gate real.
- [x] **Prueba intermitente de `pnpm pruebas:roles` arreglada (2026-09-23, PR #365, fusionado):** «ADR-0178 alcance: cambiarle el rol…»
      falló en el piloto del PR #363 (run 35927333050) con `d2,d3,d2|true` y pasó al reintentar. Filtraba `fn_fuera_de_mi_alcance()` por los
      2 últimos caracteres del UUID; el seed del CI crea colaboradores con UUID aleatorio y ~1 de cada 256 termina en «d2». Ahora filtra por los
      3 UUID completos. Reproducido a propósito (colaborador intruso `…d2`: versión vieja 69/70, nueva 70/70) y suite local 5/5 en 70/70.
      Sin cambio de regla ni de base. **Para el gate real:** una prueba intermitente en el piloto enseña a ignorar el rojo; antes de sacar el
      `continue-on-error`, revisar las demás suites por el mismo patrón (comparar ids por un pedazo, `limit 1` sin `order by`).

---

## 🧹 Buscador global fuera de la cabecera (2026-09-16)

A pedido de Felipe: `BuscadorGlobal` (la caja "Buscar o escanear prenda…" que
vivía en la cabecera de TODAS las pantallas) se quitó de `AppShell.tsx` — no
por estar roto (se verificó en navegador que funciona de punta a punta: busca
por SKU/referencia/talla/color y muestra stock por ubicación), sino porque no
tiene sentido un buscador de catálogo idéntico en pantallas como
`/colaboradores` o `/producción` igual que en `/vender` o `/inicio`. De paso
se borró `BuscadorHero.tsx`, un segundo componente de búsqueda que ya estaba
muerto de verdad (cero imports en todo el repo — probablemente un diseño
anterior del Inicio que quedó huérfano).

- [x] **`/buscar/page.tsx` quedaba sin ningún punto de entrada en la UI —
      resuelto 2026-09-17.** Se tomó la opción ya sugerida acá: tarjeta
      "Buscar" en "Acciones" de Inicio (`app/(app)/page.tsx`), sin tocar
      `AppShell.tsx` (evita reabrir un buscador global en pantallas donde no
      aplica, que es justo lo que esta sección existe para prevenir).
      De paso apareció un bug más profundo: la pantalla dependía enteramente
      del `BuscadorGlobal` ya eliminado para escribir `?q=` en la URL — sin
      caja propia mostraba "escribe algo en el buscador de arriba", apuntando
      a un "arriba" que ya no existe. Se agregó un `<form method="get">`
      nativo (`CampoTexto`/`Boton`, sin "use client") en `buscar/page.tsx`: el
      navegador arma `?q=...` solo, sin depender de JS.
      Verificado: `pnpm --filter web typecheck`/`lint` en verde; navegador
      real (escritorio y celular) — Inicio → tarjeta "Buscar" → `/buscar` con
      el campo propio enfocado → "casaca" → 8 resultados con stock por
      ubicación real; cabecera sigue solo con el selector de ubicación.

Verificado: `pnpm --filter web typecheck`/`lint` en verde; probado en
navegador real (escritorio y celular) en `/` y `/productos` — la cabecera
queda solo con el selector de ubicación, sin salto de layout.

---

## 🔀 Verificación en navegador de F1-F4 + ajuste de layout (2026-09-15, noche — Claude Code Desktop)

**El checkout de `diegoN` en el Mac estaba a un pull de distancia de lo real.**
Esta sesión abrió sobre un fetch cacheado: `git log origin/DiegoN` mostraba
`8d8e0ee` (la integración A1/A2+A3+B1+B2/C1/C2) como si fuera la punta, y con
eso F1-F4 (fotos/temporada, colores tipo+muestra, subcategoría, densidad
visual) parecían haberse perdido — archivos y migraciones enteras ausentes
del árbol. Un `git fetch` explícito mostró la punta real: `7fed0c8`
("resuelve colisiones de ADR y migración entre F1/F2/F3"), que sí trae las
cuatro sesiones completas, ya fusionadas sobre A/B/C. `git merge --ff-only
origin/DiegoN` en el checkout principal + `npx supabase migration up`
(las 3 migraciones de F1/F2/F3) resolvió todo — no hubo ninguna regresión
real, solo una caché local vieja. **Antes de asumir que "DiegoN perdió
trabajo", siempre `git fetch` explícito primero.**

Con eso resuelto, se verificaron en navegador real (Docker sí funciona en
este Mac) los 5 puntos pendientes de la sesión remota anterior — detalle de
cada uno en la sección de su propia sesión (F1/F2/F3) más abajo y en
BITÁCORA de hoy. Cierre general: `tsc`/`eslint`/`vitest` (215/215) en verde
sobre `7fed0c8`.

**Hallazgo de infraestructura, no de código:** el stack local de
`cayla-retail` (`supabase start` de este proyecto) no levanta el contenedor
de Storage (`docker ps` no lo lista, a diferencia del stack de
`cayla-dynamic`, que sí lo tiene). Cualquier subida real de archivo — foto
de producto, muestra de color — no se puede probar de punta a punta en local
hasta que eso se resuelva. Se verificó la lógica de cada pantalla igual,
sembrando datos directo en Postgres en vez de subir por Storage; ver el
detalle en cada ítem.

**Ajuste de layout, pedido aparte por Felipe en la misma sesión:** contra
capturas de referencia (`~/Downloads/Pantallas producto/`, un mockup de ERP
genérico usado solo como referencia de densidad/ancho, no como spec literal
— trae conceptos que no existen acá, como "Departamentos" o "Colección
SS24"), dos quejas concretas:

- [x] **Productos/Categorías/Colores no usaban el ancho completo del
      `<main>`.** `AppShell.tsx` topa todo lo que no esté en
      `SIN_TOPE_DE_ANCHO` a `max-w-5xl` — Vender y Compras ya estaban
      exceptuados por necesitar el espacio; `/productos` no lo estaba.
      Agregado a la lista (una línea, cubre `/productos` y todo lo que
      cuelga: categorías, colores, ficha, historial).
- [x] **"Agregar color"/"Agregar categoría" aparecían al final de una lista
      larga**, no arriba como en la referencia. En `ColoresLista.tsx` y
      `CategoriasLista.tsx`: el disparador pasó a un botón fijo arriba de la
      grilla/lista (mismo estilo que "+ Nuevo producto" de `/productos`), y
      el formulario de alta/edición —que vivía como una `<section>` empotrada
      al fondo de la página— pasó a `<Modal>` (el mismo componente que ya
      usa `ColorEditarModal`), así que aparece centrado sobre lo que se
      esté mirando, no al fondo de un scroll largo. Sin cambios de datos ni
      de RPC — puro reacomodo de layout.

**Verificado:** `pnpm --filter web typecheck`/`lint` en verde; los tres
archivos tocados (`AppShell.tsx`, `ColoresLista.tsx`, `CategoriasLista.tsx`)
probados en navegador real contra un `pnpm dev` propio de este worktree
(puerto aparte, mismo Postgres local compartido) — ancho completo y los 4
modales (nuevo color, editar color, nueva categoría, editar categoría)
abriendo arriba, no al fondo.

**No se tocó el checkout principal ni se hizo commit.** El editor de este
agente tiene bloqueado escribir fuera de su propio worktree (para no
corromper el checkout principal desde una sesión aislada) — el fix vive sin
commitear en la rama `claude/cayla-productos-integration-verify-59676d` de
este worktree, ya con `origin/DiegoN` fusionado adentro. Pendiente de que
Felipe lo traiga (merge/cherry-pick del worktree, o pedirle a este agente
que commitee) antes de que se pierda.

**Pendiente, sin tocar — decisión de Felipe:**

- [x] **PR #47 (`DiegoN` → `main`) ya mergeó** (`4d9da93`, 2026-09-16) — la
      reconciliación de más de un módulo que este ítem pedía ya se resolvió
      (ver BITÁCORA "Tercera nota" del 2026-09-15/16: ganó la numeración de
      ADR de `main`, `diegoN` corrió 0051-0056→0058-0062). Verificado el
      2026-09-16 (sesión de cierre de deuda de Caja) que el módulo Caja
      sobrevivió limpio: `lib/caja.ts` y `MovimientoCajaModal.tsx` sin ningún
      byte de diferencia entre el punto en que ADR-0056 llegó a `main` y el
      HEAD post-PR#47/#50; `types.ts` (el único de los tres que sí cambió en
      el merge) sigue reflejando la firma real de las 3 RPC de caja. Ver
      BITÁCORA de hoy para el detalle completo.
- [ ] **Los cabos sueltos que el resumen anterior daba por abiertos ya no lo
      están** — verificado contra GitHub, no contra lo que decía el resumen:
      PRs #44/#45/#46/#48 (las 4 ramas F1-F4 → DiegoN) ya están MERGED, no
      quedó ninguno redundante por cerrar a mano. El hilo de F3 sobre
      mergear su propio PR #46 también quedó resuelto solo (ya está
      mergeado). Sin acción pendiente en ninguno de los dos.

---

## 🎯 Productos: fotos, temporada y venta sin stock (2026-09-15, Sesión F1)

`/productos/nuevo` y `/productos/[id]/editar` ganan galería de fotos (varias,
reordenables con flechas, una principal), `temporada` (texto libre) y
`permitir_venta_sin_stock` (checkbox), más margen % de solo lectura junto a
precio/costo de cada variante (`20260915224500_producto_fotos_temporada_venta_sin_stock.sql`,
ADR-0060). Tabla nueva `retail.producto_fotos` + bucket público
`retail-productos-fotos`; `catalogo_crear_producto`/`catalogo_actualizar_producto`
ganan `p_temporada`/`p_permitir_venta_sin_stock`/`p_fotos` (reemplazo completo de la
galería en el orden del array). La consigna asumía que `foto_url`/`temporada`
seguían vivas (muertas) en `productos` de producción — verificado contra
`docs/datos/generado/DICCIONARIO-RETAIL.md`: **no existen**, se agregan de cero
(ver ADR-0060 para el porqué). Verificado con RPC reales contra un schema aislado
(`f1_dryrun`) en el proyecto de producción, nunca contra `retail.*`: alta con 3
fotos, reorden + recambio de principal + foto nueva en edición, borrado con
reasignación de principal, `p_fotos = null` sin tocar la galería. `typecheck`/
`lint`/215 tests en verde.

**Pendiente:**

- [x] **`20260915224500_producto_fotos_temporada_venta_sin_stock.sql` sí está en
      producción** (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`, no contra
      docs: existe `retail.producto_fotos` y `catalogo_crear_producto`/
      `catalogo_actualizar_producto` ya aceptan `p_temporada`/
      `p_permitir_venta_sin_stock`/`p_fotos`).
- [x] **Verificado en navegador real (2026-09-15, noche, Claude Code Desktop —
      Docker sí funciona en este Mac).** `FotosProducto.tsx` carga, reordena
      ("Mover a la izquierda/derecha"), cambia de principal ("Marcar
      principal") y persiste tras guardar+recargar — probado sobre "Blusa
      Emma" con 3 fotos sembradas directo en `retail.producto_fotos` (no vía
      la UI: el botón "Agregar foto" dispara un `<input type=file>` oculto, y
      la herramienta de navegador de esta sesión no puede setear archivos en
      un input de ese tipo — limitación de la herramienta, no del código).
      `Temporada` se guarda y sigue ahí tras recargar. Fotos y temporada de
      prueba se revirtieron al terminar (no quedan en la base).
- [ ] **`permitir_venta_sin_stock` no tiene candado real en Vender/`registrar_venta`
      todavía.** Esta sesión solo escribe y muestra el dato en la ficha
      (fuera de alcance: F1 es dueña de la ficha de producto, no de Vender/POS,
      que otras sesiones tocan en paralelo). Sin esto, el checkbox no cambia
      todavía el comportamiento real de una venta con stock 0.
- [ ] **La UI de arriba (integradora F5) debería revisar si `editar/page.tsx`
      sigue con los `TODO(Sesión A2)`/`TODO(Sesión A3)` de "Ajustar inventario"/
      "Ver historial" como tarjetas placeholder** — esas dos funciones ya existen
      como modales desde el menú "..." de `/productos` (Sesión B2, 2026-09-15),
      así que esas dos tarjetas en la ficha de edición están duplicadas/obsoletas.
      No se tocó en esta sesión (fuera del alcance de F1: fotos/temporada/venta
      sin stock), pero queda anotado para quien limpie al integrar.

---

## 🎯 Categorías: subcategoría opcional de un solo nivel (2026-09-15, Sesión F3)

`categorias.categoria_padre_id` (self-FK, nullable) + `categorias.notas`
(`20260915224501_categorias_subcategoria.sql`, ADR-0062). Candado real en un
trigger (`retail.fn_valida_categoria_subcategoria`): un solo nivel (el padre
no puede a su vez tener padre; quien ya tiene hijas no puede convertirse en
hija) y familia siempre heredada del padre. `CategoriasLista.tsx`: "Nueva
categoría" suma selector opcional de padre; "Editar categoría" de una raíz
suma alta/lista de hijas; una categoría sin hijas se ve pixel-idéntica a
antes. `retail.actualizar_categoria` pasó de 4 a 5 argumentos (se agregó
`p_notas`, firma vieja dropeada en la misma migración).

**Pendiente:**

- [x] **Verificado en navegador real (2026-09-15, noche).** Se creó
      "Vestidos largos" (VLA) con padre "Vestidos" desde la propia pantalla —
      aparece en un clúster junto a "Vestidos", el resto de categorías sin
      hijas (ej. "Pantalones") se sigue viendo igual. Se dejó tal cual (es
      dato real, no de prueba) — Felipe decide si la renombra/borra.
- [x] **`20260915224501_categorias_subcategoria.sql` sí está en producción**
      (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`: `actualizar_categoria`
      ya tiene el 5º argumento `p_notas` y `retail.fn_valida_categoria_subcategoria`
      existe).
- [ ] **`packages/database/src/types.ts` se editó a mano**, no con
      `supabase gen types` (no hay base viva en este entorno). Cuando la
      migración se aplique a un Postgres real, regenerar los tipos desde ahí
      y confirmar que calzan con lo que se escribió a mano acá.
- [ ] **Reasignar el padre de una categoría ya existente no tiene UI.** Se
      puede elegir padre solo al crear; una categoría ya creada no se puede
      mover de familia de primer nivel a subcategoría (o viceversa) desde la
      pantalla — decisión de alcance de esta sesión, no una limitación de la
      base (el trigger lo soportaría).

---

## 🎯 Productos: listado y filtros server-side (2026-09-15, Sesión B1)

`/productos` pasó de filtrar/agrupar TODO el catálogo en memoria del cliente a
filtros en la URL + Postgres (`fn_productos`/`fn_productos_resumen`,
`20260915160000_productos_listado_filtros.sql`), mismo patrón que Movimientos.
Paginado por NÚMERO DE PÁGINA (no cursor, decisión de Felipe — el catálogo no
crece como un ledger) y por PRODUCTO (no por fila de variante). Filtros reales:
categoría, color, estado, rango de precio, sin stock/stock bajo. Tarjetas de
resumen (productos, variantes, stock bajo, sin stock) de una sola consulta
agregada. Tabla con checkboxes de selección y menú "..." por fila (Editar
enlaza a `/productos/[id]/editar` de la sesión A1, ruta todavía sin
construir; Ajustar inventario/Ver historial cableados por la Sesión B2 el
mismo día — ver el ítem de integración final más abajo; Duplicar/Archivar
siguen como placeholder). Verificado con psql contra datos reales y con
HTTP real (sesión autenticada reconstruida a mano) — ver BITÁCORA de hoy.

**Pendiente:**

- [x] **`20260915160000_productos_listado_filtros.sql` sí está en producción**
      (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`: `retail.fn_productos`/
      `fn_productos_resumen` existen con los filtros — confirmado también en
      navegador, `/productos` ya filtra server-side).
- [ ] **El campo `stock_minimo` no tiene UI todavía.** La columna existe
      (`retail.productos.stock_minimo`, nullable — sin valor, ese producto
      nunca entra en "stock bajo") pero el mantenedor de ficha
      (`ProductoForm.tsx`, sesión A1) no tiene el campo para escribirla. Sin
      eso, "stock bajo" en /productos queda siempre en 0 salvo que alguien
      lo cargue por Studio/SQL.
- [ ] **"Duplicar" y "Archivar" del menú "..." siguen sin RPC ni diseño**
      (Archivar probablemente sea `productos.estado = 'descontinuado'` —
      igual que ya hace la acción masiva "Desactivar" de la Sesión B2, pero
      por fila; Duplicar no tiene diseño — decisión de Felipe antes de
      construirla).
- [ ] **Columna "Última actualización" en la tabla de /productos — no hay
      dato que mostrar sin tocar esquema.** `productos`/`variantes` solo
      tienen `created_at` (0002_esquema.sql), no `updated_at` — a diferencia
      de `stock.updated_at`, que sí existe. `historial_producto_cambios`
      (20260915204541) sí registra cuándo cambió precio/categoría/estado,
      pero es un ledger append-only pensado para el panel de Historial, no
      para un `JOIN` por fila en el listado sin agregar una columna a
      `fn_productos`. Decidir "cuál timestamp cuenta como última
      actualización" (¿solo precio/categoría/estado? ¿también alta de
      variante?) es una decisión de esquema/negocio, no de polish de UI —
      queda pendiente de que Felipe la resuelva. Sesión F4 (2026-09-15) no
      la construyó a propósito.
- [ ] **El menú de acciones masivas hoy solo tiene Activar/Desactivar** —
      "cambiar categoría" y "exportar" en bloque, mencionados como parte del
      menú de acciones masivas, no existen todavía en `ProductosAgrupados.tsx`.
      No se construyeron en la sesión F4 (2026-09-15, polish de listado): la
      primera toca `categoria_id` de varios productos a la vez, dominio de la
      sesión que edita categorías en paralelo; la segunda es un export de
      catálogo completo, distinto en alcance al reporte puntual que si se
      agregó en Ajustar Inventario (ver abajo). Quedan para quien tome
      acciones masivas end-to-end.

**Hallazgo de coordinación, no de este módulo:** el Postgres local
(`supabase_db_cayla-retail`, puerto 54422) lo comparte el checkout principal
y las 7 sesiones en paralelo de Productos — no hay worktree con su propia
base. Durante esta sesión el contenedor se reinició al menos dos veces en
minutos (otra sesión corriendo `supabase db reset`/`stop`/`start`), borrando
migraciones recién probadas y datos de prueba de otras sesiones sin aviso.
No es un problema de esta migración — es un riesgo del momento (7 sesiones
tocando `/productos` a la vez): vale la pena que Felipe decida si conviene
un Postgres local por sesión mientras dure este tipo de paralelismo.
## 🩹 Inventario, Colaboradores, Movimientos — 2026-09-15 (noche)

Batch de mejoras sobre los tres módulos, del reconocimiento hecho antes con 3 agentes
en paralelo + verificación en código/base propia (no desde `.md`). Aplicado y probado
**solo en local** (typecheck, `vitest`, lint verdes; probado a mano en el navegador
local logueado como Felipe) — nada tocó `main` ni la Supabase de producción, a pedido
explícito de Felipe. Rama local: `fix/inventario-colaboradores-movimientos`.

**Inventario:**
- [x] **`getCatalogo()` dejaba pasar la variante centinela "Cargo especial" y
      productos inactivos** en los selectores de `/inventario/recibir`,
      `/inventario/conteo` y `/buscar` — la propia migración de la centinela
      (`20260912234726_cargo_especial_pos.sql:18-22`) ya avisaba del hueco por
      escrito. Se agregó `.filter(v => v.activo)` en los 3 call sites (no dentro de
      `getCatalogo()`: `ProductosAgrupados.tsx:145` SÍ necesita ver las inactivas,
      atenuadas, para poder gestionarlas). Verificado en el navegador: Cargo especial
      ya no aparece en el selector de Recibir (48 opciones, ninguna es la centinela).
- [x] **`InventarioNav` nunca se montaba en ningún lado** — y además apuntaba a 4
      rutas que ya no existen (`/inventario/proveedores`, `/compras`, `/almacen`,
      `/etiquetas`, movidas a Compras hace tiempo) y no mencionaba `/inventario/mover`,
      que sí es real. Se reescribió la lista de secciones contra las 4 rutas reales y
      se montó desde un `layout.tsx` nuevo (mismo patrón que `compras/layout.tsx`).
      Verificado: la pestaña Stock/Recibir/Mover/Conteo aparece y navega bien.
- [x] **Piso/Almacén/Total sin etiqueta en la vista móvil** de `/inventario`
      (`InventarioPanel.tsx`) — en celular la tabla se apila en tarjeta y esos tres
      números quedaban sin decir cuál era cuál. Etiqueta `sm:hidden` agregada antes
      de cada uno. Verificado en viewport 375px.

**Colaboradores:**
- [x] **`fn_mi_perfil()` resolvía la ubicación de cualquiera con la fórmula de
      Líder** (`sede_dynamic_id`), nunca con `ubicacion_asignada_id` real de un
      Colaborador — podía mostrar la sede equivocada. **`fn_colaboradores()` no
      filtraba `estado='activo'`** — alguien desactivado en Dynamic seguía
      apareciendo como vigente. Migración
      `20260915230001_colaboradores_perfil_y_lista_correctos.sql`, misma firma en
      las dos funciones. Aplicada y verificada en local (una sola firma cada una).
- [x] **"Quitar acceso" sin confirmación** — un clic y ya, sin paso de revisión.
      Se agregó un modal de confirmación (mismo patrón que "Agregar colaborador").
      Verificado en el navegador.
- [x] **Reabrir "Agregar colaborador" tras un alta podía disparar un intento
      fantasma** — el `useState` de la persona elegida no se resincronizaba con
      `disponibles`. Se resetea al abrir el modal, no una sola vez.
- [x] **El picker de "Persona" era un `<select>` con toda la lista de Dynamic**, sin
      buscador — se reemplazó por `ComboBuscable` (mismo componente que ya usan
      Cambios y Compras). De paso, el botón "Agregar colaborador" deshabilitado ahora
      explica por qué ("Todas las cuentas activas de Dynamic ya tienen acceso"),
      verificado en el navegador.

**Movimientos:**
- [x] **Ningún cambio "sin diferencia de precio" se detectaba como tal** —
      `cambio_diferencia` es `numeric` en Postgres, PostgREST la manda como string, y
      `!== 0` nunca compara igual un string contra un number. Se corrige en el origen
      (`movimientos-v2.ts`, `Number(...)` al armar el objeto `cambio`), no solo en el
      sitio de uso.
- [x] **La diferencia de un ajuste por conteo se volvía a calcular en el cliente**
      (`MovimientoDetalle.tsx`) en vez de usar `m.delta`, que `fn_movimientos` ya
      resuelve en SQL — misma regla en dos lugares. Ahora usa `m.delta` directo.
- [x] **Búsqueda de Movimientos sin escapar `%`/`_`** en
      `fn_movimientos_variantes` — un guion bajo literal en un SKU actuaba como
      comodín. Migración `20260915231500_movimientos_busqueda_escapa_comodines.sql`,
      misma firma, con `escape '\'`. Verificado: buscar "_" ya no trae las 49
      variantes; buscar "blusa" sigue filtrando normal.
- [x] **Un link `?mov=<id>` compartido (WhatsApp) fallaba en silencio** si el
      movimiento caía fuera del rango de 30 días por defecto — sin tocar la premisa
      de "nunca una consulta extra" (`MovimientosLista.tsx` ya lo documentaba así),
      se agregó un aviso visible en vez de nada.

**Sueltos, bajo riesgo:**
- [x] `RecepcionFormV2.tsx`: `costoUnitario` ya no deja escribir un negativo (antes
      solo `cantidad` se clampaba); se agregó la huella `variantes_costo_check` a
      `error-escritura.ts` como red de seguridad.
- [x] `ConteoPanel.tsx`: el escaneo de código de barras reimplementaba el matching a
      mano, sensible a mayúsculas — ahora usa `resolverCodigoV2` de
      `buscar-prenda-v2.ts`, igual que Vender. Se agregó `avisar.exito(...)` en
      abrir/contar/cerrar conteo (antes ninguna acción confirmaba éxito).
- [x] `MoverMercaderiaFormV2.tsx`: el tope de cada línea era el stock total de la
      variante, sin restar lo que otras líneas del mismo formulario ya le pedían —
      dos líneas de 10 sobre una prenda con 10 unidades no avisaban nada hasta que
      la RPC rechazaba la segunda.

**Fuera de este batch, a propósito** (necesitan una decisión de Felipe, no un fix
mío): la condición de carrera de "contar mientras se vende" en Conteo, que
`quitar_colaborador` borre en vez de archivar, y el selector de ubicación duplicado
(header vs. `/inventario` local) — este último ya es una decisión consciente
documentada en `AppShell.tsx:516-519`.

## 🎯 Productos — alta con matriz talla×color — 2026-09-15 (noche)

A pedido de Felipe, tras comparar el modelo de variantes contra Lightspeed Retail: la pieza
que faltaba (`/productos` era solo lectura) para dar de alta un producto con su matriz
talla×color, en una transacción atómica. **Aplicado y probado solo en local** (SQL directo +
navegador logueado como Felipe; typecheck/lint/239 tests verdes) — **no aplicado en
producción**, sin ok de Felipe todavía. Detalle completo: ADR-0058.

- [x] **`retail.crear_producto_con_variantes`** — nueva, mismo patrón que
      `abrir_produccion`: candado `fn_es_lider()`, idempotencia por `p_token`, valida toda
      la matriz antes de insertar una fila. Inmune por diseño al bug de `AltaEnConteo`
      (BITÁCORA 2026-09-10): no acepta `producto_id`, siempre crea uno nuevo.
- [x] **`categorias.tallas_sugeridas` repuesta** (existía en V1, se perdió en el corte a V2)
      — sugiere, no restringe; `variantes.talla` sigue siendo texto libre a propósito.
- [x] **`variantes.sku` deja de ser `NOT NULL`** — y de paso, un `grep` propio encontró
      (antes de aplicar el cambio, no después) que el buscador/escáner de Vender
      (`lib/buscar-prenda-v2.ts`) y otros 4 sitios asumían `sku` siempre con valor;
      corregidos en su propio commit antes de tocar el esquema.
- [ ] **`productos.referencia` sigue sin constraint de unicidad** — detectado durante el
      diseño, no resuelto a propósito (es decisión de negocio: ¿puede haber una reedición
      con el mismo nombre?). Sugerencia si Felipe la quiere: aviso suave en la UI, sin
      candado nuevo en el núcleo.
- [ ] **Override de costo por celda** en la matriz — hoy solo el precio se puede
      sobreescribir por celda; costo es un valor base único. Recorte deliberado, cambio de
      UI nada más si hace falta después.
- [ ] **Aplicar a producción** — pendiente el ok puntual de Felipe.

---

## 🔀 Consolidación Vender + Caja — 2026-09-15 (tarde)

Dos ramas cerradas y verificadas por separado que nunca habían llegado a `main` se
unieron en un solo PR (`claude/caja-punto-venta-cambios-f4edbd`): **A**
`claude/venta-caja-screens-animations-7923b9` (Tandas 1-3 del diagnóstico: arreglos,
animaciones, `/caja/historial`, `/vender/descuentos`) y **B**
`claude/sales-implementation-analysis-676b89` (ADR-0052/0053/0054: reembolso y
diferencia de cambio en el arqueo, descuento con motivo y escalonado). 7 bloques de
conflicto, todos mecánicos (`AppShell`, `cambios/page`, `CambiosLista`,
`PuntoDeVentaTicket`, BITÁCORA ×2); `tsc`/`eslint`/`vitest` 239/239 sobre el resultado
y las 3 pantallas con conflicto probadas en navegador. **Las 3 migraciones de B se
aplicaron a producción ANTES del push** (ver cada ítem abajo) — sin eso, Vercel habría
desplegado un front que lee `venta_items.motivo_descuento` y `*.caja_id` contra una base
que no las tenía (42703).

- [ ] **Cuatro sesiones eligieron ADR-0051 el mismo día.** Quedó: 0051 producción del
      Taller (main), 0054 descuento con motivo (B, renumerado), 0055 insert directo a
      `movimientos` (PR #37, renumerado). **`cuervo-colibri` (depósito bancario y ajuste
      de efectivo, sin commitear al cierre de esta sesión) tiene que entrar como 0056**
      y descartar su rename `20260915120000_reparar_fk…` → `120001`: la colisión de
      timestamp ya la resolvió `origin/benja-ramanexo` moviendo producción del Taller a
      `20260915130000`. Al mergear sobre `main` va a chocar en `MovimientoCajaModal.tsx`,
      `lib/caja.ts` y `types.ts` con lo de A — conflictos chicos, mismo patrón que acá.
- [ ] **Dos worktrees con trabajo V1 sin commitear que ya no aplica** — no se tocaron,
      solo se anotan para que nadie los rescate por error: `pos-systems-comparison-c2472c`
      (`CajaPanel`, `CerrarCajaModal`, `RegistrarVentaModal`, `ventas-offline`,
      `0060_cerrar_caja_desglose_metodos.sql`; 180 commits atrás, ninguno de esos archivos
      existe en `main`) y `motion-dev-analysis-3adc35` (`VenderFormV2.tsx`, que B borra).
      Si Felipe confirma, se limpian con `git worktree remove --force`.
- [ ] **`packages/database/src/types.ts` se regeneró en 3 sesiones desde 3 Postgres
      locales distintos** y se auto-mergeó sin conflicto (tsc en verde). No se volvió a
      regenerar en la consolidación — la próxima vez que se toque, regenerar UNA vez con
      `--local` sobre una base con todas las migraciones de `main` aplicadas.
- [ ] **El historial de producción registra las migraciones con timestamp UTC del momento
      de aplicarlas, no con el del archivo** (`20260915211024` ≠ `20260915140000`, igual
      que `movimientos_insert_solo_rpc` → `20260915205618`). `supabase migration list`
      contra producción va a marcar estas como "remotas sin archivo" — es cosmético, el
      nombre coincide; se anota para que nadie las vuelva a aplicar.

---
## 🎯 POS (Vender + Caja) en V2 — diagnóstico del 2026-09-14

> Sale de reconciliar `docs/datos/modulos/07-ventas-y-caja.md` y `01-INVARIANTES.md`
> —que auditaron **producción** con código V1— contra el código y la base **V2**
> reales. Lo que V2 ya arregló solo (venta↔comprobante en la misma transacción,
> candados por línea en `venta_items`/`venta_pagos`, el bug del `NULL` en el candado
> de sede, la caja sin policy de UPDATE) NO se repite acá: esto es lo que queda.

**Cerrado el 2026-09-15 — Tanda 3 del diagnóstico, las dos pantallas nuevas
"bounded" (sin cambio de esquema; ver BITÁCORA de esa fecha):**

- [x] **Historial de cierres de caja** (`/caja/historial`, link desde `/caja`).
      `cajas` ya tenía todo (`estado`, `monto_cierre_sistema/real`, `diferencia`,
      `cerrada_por`, `nota`) — sin RPC, sin filtro de ubicación (mismo criterio que
      Facturación: mientras "control total temporal" siga vigente, se ve todo, con
      la sede en cada fila). `lib/caja.ts` gana `getHistorialCierres()`. Etiquetas
      de celular agregadas a mano (Tabla.tsx apila sin encabezado bajo `sm`, y
      cuatro cifras seguidas sin etiqueta no se leen en una pantalla de cuadre).
- [x] **Códigos de descuento administrables** (`/vender/descuentos`, Líder-only,
      link desde Facturación). `codigos_descuento_insert`/`_update`
      (20260914215103) ya dejaban la RLS lista para que un Líder escriba directo
      — es la única tabla del sistema sin RPC de por medio: sus reglas de negocio
      (código 3-20 mayúsculas, 0<%≤100, vigencia coherente) ya son `check` de la
      tabla, no queda nada que una RPC tuviera que validar encima. Crear, apagar/
      prender (nunca `DELETE`, la tabla no tiene esa policy).
      **De paso:** `packages/database/src/types.ts` no conocía `codigos_descuento`
      (el archivo llevaba desde antes del 12-sep sin regenerar) — regenerado con
      `pnpm --filter @cayla-retail/database gen-types` (ya apunta a `--local`, sin
      el riesgo de drift de producción que describe la regla de oro de `datos:generar`).
      355 líneas nuevas, 0 tablas perdidas (verificado contando `ventas`/`cajas`/
      `clientes`/etc. antes y después).

Verificado: `tsc`, `eslint`, `vitest` (184/184); ambas pantallas probadas en
navegador con escritura real (un código creado y apagado/prendido, el historial
mostrando las 4 cajas cerradas reales de esta sesión con la sede correcta cada
una). **Subido el 2026-09-15 en el PR de consolidación Vender+Caja.**

**Pendiente de decisión de Felipe — las 2 pantallas grandes del mismo
diagnóstico (2026-09-15).** Clasificadas con `superpowers:brainstorming`, no
construidas: cada una necesita una respuesta suya antes de que una sesión
futura pueda diseñarlas. Explorado (no supuesto) contra el esquema real el
2026-09-15 — sigue valiendo mientras nadie migre `ventas` o `clientes`.

- [ ] **Ficha de clienta.** La tabla `clientes` existe completa (nombre, doc,
      teléfono, email — `0002_esquema.sql`) y `registrar_venta` **ya acepta
      `p_cliente_id`** desde que existe (`0011_venta_con_comprobante.sql:98`) —
      pero Vender nunca lo manda: el DNI/nombre que se tipean en el cobro solo
      llegan al comprobante, ninguna venta queda enlazada a una fila real de
      `clientes`. La pregunta que decide todo el diseño: **¿Vender debe empezar
      a buscar/crear la clienta en `clientes` durante el cobro** (cambia el
      flujo de venta — nueva búsqueda, decidir qué pasa si no se encuentra) **o
      la ficha es, para empezar, una pantalla de consulta aparte que no toca
      Vender todavía** (lee `clientes` + su historial de compras vía
      `ventas.cliente_id`, sin cambiar cómo se cobra hoy)? La segunda opción es
      bounded (sin tocar Vender); la primera es arquitectónica (cambia un flujo
      que ya está muy afinado — ADR-0043/0044). Sin RPC nueva en cualquier caso:
      `registrar_venta` ya sabe qué hacer con `p_cliente_id`.
- [x] **Anular una venta — esquema y RPC (2026-09-16, sesión Devoluciones).**
      Felipe respondió las 4 preguntas que este mismo ítem dejaba pendientes:
      (1) el stock depende de la condición de la prenda, mismo selector que
      Devoluciones; (2) si el comprobante ya fue aceptado por SUNAT, **no se
      puede anular** — usar Cambio o Devolución; (3) el plazo es mientras la
      caja de esa venta siga abierta (no el día calendario); (4) solo un
      Líder. `20260916172645_anular_venta.sql` (ADR-0065): `ventas.estado`
      + tabla `venta_anulacion_items` + RPC `anular_venta`. Aplicada al
      Postgres local y verificada con 8 escenarios en una transacción
      revertida (detalle en el ADR). **Sin aplicar en producción todavía.**
- [x] **Anular una venta — pantalla (2026-09-16).** Felipe confirmó: junto a
      Cambio/Devolución. `AnularVentaForm.tsx` (nuevo) + botón "Anular" en
      `DevolucionesLista.tsx`, una sola vez por venta (no por línea), visible
      solo para Líder. No se tocó `BuscarPorComprobante.tsx` — resultó ser
      solo la caja de búsqueda, sin lógica de acciones que compartir.
      Verificado en navegador real (login `felipe@cayla.local`): el botón
      aparece una vez por venta, el modal carga las líneas reales de la
      venta, y un caso real (caja de una venta del 14-sep, ya cerrada) mostró
      el mensaje de error correcto de punta a punta (RPC → `traducirError` →
      pantalla) — prueba end-to-end del camino de rechazo con datos reales,
      no sintéticos. El camino feliz (clic hasta "Venta anulada") no se pudo
      cerrar por clic dentro de la sesión de Claude — el stock de Tienda Lima
      vivía todo en `sububicacion_id = null`, ninguna unidad asignada a "Piso
      de venta" (probablemente sin backfill desde
      `20260914230000_inventario_piso_almacen.sql`), y `registrar_venta`
      rechaza cualquier venta nueva con "hay 0" sin importar cuánto diga
      `stock.cantidad`. **Felipe probó el camino completo en su propia sesión
      local (2026-09-16) y confirmó que todo funciona, camino feliz
      incluido** — sin precisar en el chat si lo desbloqueó con el backfill
      que se le ofreció o con otro ítem que ya tenía piso asignado. El camino
      feliz de `anular_venta` en sí ya estaba probado por SQL de todas formas
      (ver ADR-0065 y la entrada de BITÁCORA de hoy: 9 escenarios en una
      transacción revertida).

**Cerrado el 2026-09-15 — Tanda 1 del diagnóstico de Venta y Caja (6 arreglos, cada
uno verificado en navegador; ver BITÁCORA de esa fecha para el detalle):**

- [x] **`MovimientoCajaModal.tsx` guardaba un ingreso con el motivo del `<select>` de
      egresos** («Retiro de efectivo») aunque la colaboradora escribiera otro en el
      campo libre que sí veía — el `motivo` calculado nunca miraba `tipo === "ingreso"`.
      De paso, `step="0.10"` + `min={0.01}` rechazaba montos redondos («35») por
      validación nativa del navegador; ahora `step="0.01"`.
- [x] **La pistola con el foco en el cobro podía confirmar la venta sola.** El
      `<form>` del ticket (momento «cobrar») no tenía guarda contra el submit nativo
      de un `<input>` al recibir Enter — bypasseaba el botón «Cobrar» sin que nadie lo
      tocara (`cobrar()` revalida `motivoBloqueoCobro`, así que no colaba una venta a
      medias, pero sí una ya completa). `PuntoDeVentaTicket.tsx` ganó un `onKeyDown`
      que bloquea Enter salvo que venga del botón.
- [x] **Cambios y Devoluciones no mostraban cuándo se vendió la prenda** —`creadoEn`
      ya viajaba desde `ventas-v2.ts`/`devoluciones.ts` y no se pintaba. Agregado con
      el mismo patrón (`Intl.DateTimeFormat` es-PE) de `ComprobantesPanel`/`ProformasPanel`.
- [x] **`/cambios` y `/devoluciones` no estaban en ningún menú** — solo vivían en la
      cabecera de Vender, oculta en celular. Agregadas al lateral de escritorio (íconos
      propios, distintos del de Movimientos) y «Registrar cambio» al menú «+ Nuevo»
      (paridad con «Registrar devolución», que ya estaba ahí y sí llega a celular).
- [x] **`CambioFormV2.tsx` elegía la prenda nueva en un `<select>` con TODO el
      catálogo activo, sin stock ni búsqueda** (48+ opciones sin agrupar). Reemplazado
      por `ComboBuscable` (el mismo componente que Compras ya usa para «elegir 1 de
      muchos tipeando») con stock por opción — `cambios/page.tsx` ahora trae
      `getStockPorUbicacion` igual que `vender/page.tsx`, y ya no se ofrece una talla
      sin stock aquí. Sin preselección (mismo criterio que el método de pago del POS,
      ADR-0044): la «Diferencia» y el método de pago solo aparecen con una prenda
      elegida.
- [x] **Vender a 375px: el ticket quedaba debajo de TODO el catálogo.** Apilado
      (bajo `lg`, decisión a propósito — «dos scrolls internos serían peores que uno
      solo») no había forma de ver el total o llegar a «Cobrar» sin pasar antes por
      cada producto de la grilla. Agregada una barra fija (`lg:hidden`, mismo offset
      que la de `RecepcionCompraFormV2.tsx` para despejar las pestañas del celular)
      con «N prenda(s) · total · Ver ticket ↓» que salta directo al ticket — visible
      solo con el carrito no vacío y la caja abierta.

Verificado: `npx tsc --noEmit`, `eslint` y `vitest` (184/184) en verde; cada ítem
probado en navegador contra la base local (venta/cambio/ingreso reales, confirmados
también por consulta directa a Postgres donde aplicaba). **Subido el 2026-09-15 en el
PR de consolidación Vender+Caja.**

**Cerrado el 2026-09-15 — Tanda 2 del diagnóstico (movimiento; ver BITÁCORA de esa
fecha para el detalle de cada uno):**

- [x] **7 de los 8 modales del módulo cerraban en seco** desde sus propios botones
      (Cancelar/Listo/Nueva venta) — `Modal.tsx` ya ofrecía el cierre animado por
      render-prop (`children={(cerrar) => …}`), pero solo `ComprobantesPanel.tsx` lo
      usaba. Corregido en `CambioFormV2`, `DevolucionFormV2`, `CerrarCajaModalV2` (×2),
      `MovimientoCajaModal` y «Venta registrada» en `PuntoDeVenta.tsx` (un octavo modal
      que el diagnóstico original no había contado). El cierre automático tras un
      guardado exitoso se dejó **sin** animar a propósito, mismo criterio que
      `ComprobantesPanel.tsx` ya tenía.
- [x] **La curva de transición por defecto de Tailwind no era `--ease-cayla`** —
      afecta a los ~260 `transition-colors`/hover del sistema. Era una aproximación a
      mano sin comentario que la justifique; ahora es el número literal.
- [x] **El ticket de Vender cambiaba de un momento a otro (armar↔cobrar↔descuento) sin
      salida.** `PuntoDeVentaTicket.tsx` gana su única excepción a "sin estado, sin
      hooks": un búfer de ANIMACIÓN (no de negocio — `momento` sigue siendo del padre,
      `cobrar()` allá revalida contra el valor real) que retiene el contenido saliente
      con `.anim-revelar-salida` (nueva, en `globals.css`) los 160ms que tarda en
      desvanecerse. El `setState` que arranca la salida vive en el render, no en el
      efecto (el propio linter del repo marca ese patrón — `react-hooks/set-state-in-effect`).
- [x] **Nada animaba el despliegue de un bloque** — el motivo bajo el botón del ticket
      (`PuntoDeVentaTicket.tsx`) y el swap select↔input del motivo en
      `MovimientoCajaModal.tsx`, con el truco `grid-template-rows` (0fr↔1fr). Costó una
      segunda vuelta: `min-h-0` solo no basta para 0px real en un campo con
      padding/borde fijo (queda un piso de ~17-23px medido con `getComputedStyle`) —
      hace falta forzar `padding`/`border` a 0 con `!` SOLO mientras está oculto, y el
      `<select>` nativo además necesita `appearance-none` + `text-[0px]` (su cromado de
      sistema operativo no se mueve con padding/borde solos). Verificado con
      `getComputedStyle` en el navegador real, no solo a ojo.
- [x] **Lo que llega por `router.refresh()` se reemplazaba en seco** — `anim-entrada`
      en el swap `AbrirCajaFormV2`↔`CajaAbiertaPanel` de `/caja` (React ya lo remonta
      solo, son componentes distintos); `transition-opacity` en el atenuado de
      `bloqueado` del POS (no tenía ninguna transición); `anim-revelar` en las filas de
      «Ventas de hoy» y de devoluciones pendientes — sin `key` extra: React ya reusa el
      nodo de lo que sigue igual tras el refresh (no reanima) y solo monta —y por lo
      tanto anima— lo genuinamente nuevo.

Verificado igual que la Tanda 1, más una vuelta extra con `getComputedStyle` para los
colapsos de altura (no alcanza con mirar la pantalla: un colapso a 17px en vez de 0
se ve casi igual a ojo). Sesión completa de principio a fin en navegador: agregar
prenda → cobrar → pagar → confirmar → «Venta registrada» con cierre animado → nueva
venta con ticket limpio, y un ingreso de caja real con «Otro» motivo (ambos campos
del swap). Cero errores de consola en una pestaña nueva (la pestaña vieja arrastraba
un error de una ventana intermedia de la propia edición — no representativo).
**Subido el 2026-09-15 en el PR de consolidación Vender+Caja.**

**Cerrado el 2026-09-15 (mismo día, segunda vuelta) — el resto de Tanda 2**: al
revisar contra el mapeo original, la técnica se había aplicado en 1-2 lugares por
categoría, no en todos los identificados. Completado con la misma técnica, mismo
riesgo bajo:

- [x] `CajaAbiertaPanel.tsx` — las 5 tarjetas de resumen (`key={valor}` +
      `anim-asentar`) y las filas de «Movimientos de esta caja» (`anim-revelar`),
      que se habían quedado fuera del barrido de `router.refresh()`.
- [x] El contador «160/200» bajo la nota del ticket, con el mismo truco de
      `grid-template-rows` — antes aparecía de golpe.
- [x] El bloque «Recibido» del pago en efectivo **no necesitó arreglo propio**:
      `p.metodo` de una fila de pago nunca cambia una vez agregada (`agregarPago`
      bloquea duplicados, nada muta el campo), así que animar la fila entera
      (`anim-revelar`, agregado también a cada fila de `pagos.map`) cubre el bloque.
- [x] Los formularios inline «Aprobar»/«Rechazar» de devoluciones pendientes —
      `anim-revelar` simple (no el búfer de dos tiempos del ticket: es una acción de
      Líder, poco frecuente, no justifica la complejidad extra).
- [x] El desplegable «Ventas de hoy» del catálogo — el más visible de los siete,
      usaba `hidden` (display:none), que ni con CSS se puede animar. Ahora
      `grid-template-rows`. Sin controles enfocables adentro (solo filas de texto),
      así que no necesitó los `disabled` condicionales del swap de
      `MovimientoCajaModal`.

Casi se reescribe este último a una técnica distinta (`max-height`) por una falsa
alarma: medido con `getComputedStyle` justo después de un `.click()` disparado por
JS y de un `navigate()`, el colapso parecía atascado en 133px. Era el Suspense de
«Ventas de hoy» (`Cargando ventas de hoy…`) resolviendo en paralelo con el propio
toggle, más que `element.click()` no siempre dispara el handler de React de forma
confiable en sucesión rápida — dos problemas de METODOLOGÍA de prueba, no del
código. Se confirmó con capturas reales (clic real + pantallazo, no JS) que colapsa
y expande limpio, ida y vuelta. **Lo que ya estaba construido funcionaba.**

Verificado igual que la primera vuelta: `tsc`, `eslint`, `vitest` (184/184), y una
sesión de navegador completa (ingreso de caja real, «Ventas de hoy» expandido y
colapsado dos veces con capturas). **Subido el 2026-09-15 en el PR de consolidación Vender+Caja.**

Del mismo diagnóstico: historial de cierres de caja y códigos de descuento
administrables se cerraron en la Tanda 3 (2026-09-15, más arriba). Ficha de
clienta y anular una venta siguen pendientes de una decisión de Felipe —
ver "Pendiente de decisión de Felipe" en el bloque de la Tanda 3, arriba.

**Cerrado el 2026-09-14 en esta sesión:**

- [x] **`movimientos` es inmutable de verdad** — ADR-0042,
      `20260914165703_movimientos_inmutables.sql`. Disparador `before update or
      delete` + retiro de `UPDATE`/`DELETE`/`TRUNCATE` a `authenticated`/`anon`.
      Probado en rojo: las dos operaciones fallan, las 105 filas quedan intactas.
      **Ya está también en producción** — ver el detalle y la higiene pendiente
      (migración sin registrar) en «Pendiente de construir» más abajo.
- [x] **El modal de cierre de caja dejó de revelar el esperado antes de contar**
      (`CerrarCajaModalV2.tsx`). Ahora el esperado sale de la respuesta de
      `cerrar_caja` —calculado en el instante del cierre, no al cargar la página— y
      se muestra DESPUÉS, junto a lo contado. De paso se arregló que el resultado se
      desmontaba solo: `router.refresh()` corría junto al resultado, el servidor
      respondía "ya no hay caja abierta" y el modal moría antes de que nadie leyera
      la diferencia. Y se eliminó la consulta `getResumenCaja` de `vender/page.tsx`,
      que corría fuera del `Promise.all` en cada carga solo para alimentar ese modal.

- [x] **La tarjeta "Esperado en el cajón" se quitó del panel** (decisión de Felipe,
      2026-09-14). El argumento a favor de dejarla era más débil de lo que parecía: para
      saber si alcanza para dar vuelto se mira el cajón, no la pantalla — su utilidad
      real era casi toda al cerrar, que es justo cuando no debe verse. En contra pesó el
      precedente propio: los SINATRA traían cuadres de **−S/6,122 (TRU) y −S/7,675 (LIM)
      sin fecha de origen**, que es lo que pasa cuando la diferencia diaria no se mide.
      Se quitó también del tipo `ResumenCaja` y de `getResumenCaja`, así el número deja
      de viajar al navegador durante el turno (no se puede leer ni inspeccionando props).
      **No es un candado y no debe leerse como "conteo ciego resuelto"** — ver abajo.

- [x] **Vender partido en padre + dos paneles sin estado, para trabajar en dos ramas
      a la vez** (sesión aparte del mismo día, ADR-0043). `PuntoDeVenta.tsx` 705 → 415
      líneas; `PuntoDeVentaTicket.tsx` y `PuntoDeVentaCatalogo.tsx` nuevos, render puro
      sobre props. Refactor sin un solo byte de diferencia en el HTML (medido con
      `renderToString` y con el SSR real). **Regla para las dos ramas que salen de acá:**
      cada sesión es dueña de UN panel; el padre (estado + handlers) se toca en commits
      chicos separados de la UI y entran a `main` apenas compilan.

- [x] **El ticket de Vender tiene dos momentos: armar y cobrar** (sesión B del mismo
      día, ADR-0044, rama `feat/pos-ticket-progresivo`). Con el ticket vacío ya no se
      despliega el cobro: en «armar» solo líneas y total; pago y comprobante aparecen
      recién al tocar «Cobrar», con el DNI adentro del bloque de comprobante. Un solo
      `motivoBloqueoCobro` (`lib/vender-reglas.ts`, 7 tests) apaga el botón, lo explica
      debajo y frena `cobrar()`. El método de pago ya no viene preseleccionado (decisión
      de Felipe) y los (!) del cobro son `Ayuda tono="falta"`: solo cuando falta el
      método o el RUC, y el globo dice qué falta. Verificado en navegador con venta real
      (Boleta B001-000001 en la base local). Adenda del mismo día: en escritorio el
      POS es pantalla fija — la página no scrollea, catálogo y ticket scrollean por
      dentro y el ticket llena toda la altura visible. Segunda adenda: **descuento
      manual** (tercer momento del ticket; % global o por prenda; viaja como
      `descuento_unitario` por línea — verificado en la base, Boleta B001-000005),
      precio de solo lectura, basurero en «1», íconos en los colores del sistema y
      **vuelven shadcn + GSAP** (ADR-0045: el corte V1→V2 los había borrado sin
      registro). Tercera adenda: **pago mixto y vuelto** — filas por medio, recibido en
      efectivo con teclas que suman billetes, «Cubierto / Falta cubrir / Se pasa»;
      verificado con Boleta B001-000006 (yape 50 + efectivo 109.80, «efectivo + yape»
      en Ventas de hoy). **En `origin/main`** (verificado 2026-09-15: `git merge-base
      --is-ancestor` confirma los commits del 14-sep en el HEAD de esta rama).

- [x] **El escaneo manda en el panel izquierdo de Vender; el catálogo es plan B**
      (sesión A del mismo día, rama `feat/pos-escaneo-primero`). Campo de escaneo primero
      y dominante, sin el título «Catálogo De Prendas», chips + grilla debajo, «Monto
      manual» al lado del campo, sin stock atenuadas + chip «Solo con stock» (filtra la
      grilla, no al escáner). El foco vuelve al escáner al abrir caja, al cerrar cualquier
      modal (`Modal.alCerrarEnfocar` sobre Radix) y ante una tecla suelta con el foco en
      un botón (`lib/escaner-tecla-suelta.ts`, 9 tests) — antes el Enter de la pistola
      activaba ese botón. Verificado en navegador con ventas reales en local
      (B001-000002 a 000004). **En `origin/main`.**

- [x] **El catálogo de Vender se mira por prenda + color, con las tallas adentro**
      (sesión A, segunda ola del mismo día, decisión 1A de Felipe). `lib/catalogo-grupos.ts`
      (10 tests) agrupa y ordena tallas; la tarjeta tiene hueco de foto 4:5, chips de talla
      (tocar «M» agrega esa variante; agotada queda tachada), `Tooltip` «N en sede»,
      borde rojo suave sin stock (pedido explícito; rompe el "máx. 2 rojos" del brandbook),
      `Toggle` «Solo con stock», `Badge` en el globito, `alza-cayla`, `scroll-cayla` y
      `RevelarAlScroll` (GSAP) por tarjeta — lo que ya se ve al montar no viaja. 48 → 16
      tarjetas medidas a 1440×900. **En `origin/main`.**
- [x] **La talla agotada dice en qué sede sí hay** (sesión A, tercera ola). Tooltip por
      talla y línea en el desplegable del escáner; `lib/stock-por-sede.ts` (9 tests);
      `page.tsx` lee el stock de todas las sedes que RLS deje ver. Funciona para Líderes;
      para colaboradoras de sede fija llega vacío (ver pendiente siguiente). De paso: fuera
      el reveal al scroll del POS (dos atenuados no conviven) y `catalogo-grupos.ts` dejó
      de ser binario para git (byte NUL → escape). **En `origin/main`.**
- [x] **«Ventas de hoy» firma cada venta con la integrante** (sesión A). Primer nombre,
      inicial del apellido solo si hay dos con el mismo (`lib/nombre-integrante.ts`, 6
      tests); el relleno «—» de la RPC no se pinta. **En `origin/main`.**
- [x] **La cabecera de Vender enlaza a Caja, Cambios y Devoluciones** (sesión A). Tres
      enlaces discretos antes del botón de caja; agrupados con él para que la fila se parta
      limpia; ocultos bajo `sm`. **En `origin/main`.**
- [x] **«Ventas de hoy» muestra la nota de la venta** (sesión A): misma fila, truncada,
      texto completo en `title`; nada si viene null. **En `origin/main`.**
- [x] **El reembolso en efectivo ya resta del arqueo, y se busca una venta por su
      boleta** (ADR-0052, `20260915180000_reembolso_en_el_arqueo.sql`). Antes: aprobar
      una devolución con reembolso en efectivo dejaba el cajón "sobrando" exactamente
      ese monto en `cerrar_caja` — un faltante disfrazado de sobrante. Ahora
      `devoluciones.caja_id` (fijado solo, al aprobar) liga el reembolso a la caja que
      lo absorbe, y `cerrar_caja` lo resta — solo efectivo, Yape/Plin/transferencia/
      tarjeta no tocan el cajón. Tarjeta "Reembolsos en efectivo" nueva en `/caja`. De
      paso: Devoluciones y Cambios solo mostraban las últimas 30 ventas de la sede —
      ahora se puede escribir "B001-10" (o solo "10") y encontrar una venta de hace
      meses (`parsearComprobante`, `BuscarPorComprobante.tsx`, compartido por las dos
      pantallas). Verificado en psql (3 escenarios con rollback) y de punta a punta en
      navegador: `cerrar_caja` con un reembolso real de S/25.90 dio el esperado exacto
      (S/586.82) contra lo contado. **En producción desde 2026-09-15 16:1x (Lima)** — aplicada vía MCP `apply_migration` en `cayla-dynamic`, schema `retail`, verificada contra `information_schema`/`pg_proc` (columnas, constraints, cuerpos nuevos, una sola sobrecarga por función).
- [x] **Cambios ya no tiene la misma fuga que Devoluciones tenía** (ADR-0053,
      `20260915200000_diferencia_de_cambio_en_el_arqueo.sql`) — cerrado el mismo día
      que se encontró. Mismo mecanismo que ADR-0052: `cambios.caja_id` (fijado solo, al
      registrar) liga la diferencia a la caja que la absorbe; `cerrar_caja` la suma con
      signo — positiva (paga de más) suma, negativa (se le devuelve) resta, un solo
      `sum()` cubre los dos sentidos porque el dato ya trae el signo. Tarjeta "Cambios
      en efectivo" nueva en `/caja` (con signo). Encontrado de paso: `cerrar_caja`
      retorna una columna que también se llama `diferencia` — sin calificar
      `cambios.diferencia`, la función ni compilaba en la prueba. Verificado en psql (3
      escenarios) y de punta a punta en navegador: cambio real con diferencia de
      +S/100 en efectivo, `cerrar_caja` dio el esperado exacto (S/194.99).
      **En producción desde 2026-09-15 16:1x (Lima)** — aplicada vía MCP `apply_migration` en `cayla-dynamic`, schema `retail`, verificada contra `information_schema`/`pg_proc` (columnas, constraints, cuerpos nuevos, una sola sobrecarga por función).
- [ ] **Cambiar `vender/page.tsx` a `fn_stock_por_sede`** — lo único que falta. La RPC
      **ya está en producción** (verificado 2026-09-15 contra `pg_proc` en `cayla-dynamic`,
      schema `retail`: security definer, suma piso+almacén por sede — la trajo el bloque 8,
      `…231015_registrar_venta_piso_con_nota`, aunque su propia migración
      `20260914220001` no quedó registrada en `schema_migrations`). `vender/page.tsx:43`
      todavía lee `stock` directo (`supabase.from("stock").select(...)`), así que
      `stock_select` = «puede operar la sede» sigue filtrando y una colaboradora de sede
      fija recibe `otrasSedes` vacío. Cambio: `supabase.rpc("fn_stock_por_sede")` en vez de
      la lectura directa (un commit chico) y verificar como Micaela (colaboradora de
      Trujillo — su fila ya existe en local, ver ítem siguiente).
- [ ] **`etiquetaSede` no sirve en V2 y nadie la usa.** Deriva la ciudad de un `codigo` que
      `ubicaciones` ya no tiene, o de la última palabra del nombre si mide 2–4 letras
      («Tienda LIM» era V1; hoy «Tienda Trujillo» → «TND»). Si se quiere «TRU/AQP» en
      pantalla, es una columna `codigo` en `ubicaciones` (migración); si no, borrar la
      función y su test para que nadie la reviva por error.
- [ ] **Foto por prenda en el catálogo.** La tarjeta ya tiene el hueco (4:5, iniciales en
      serif), pero `productos`/`variantes` no tienen columna de foto ni bucket de Storage.
      Es cambio de modelo de datos: decidir dónde vive (una por producto o por color),
      quién la sube (Productos) y cómo llega a `getCatalogo`. Cuando exista, la tarjeta
      la pinta sin rediseñar.

- [ ] **Vender como colaboradora de sede fija (rol Colaborador, `0016_roles_colaborador`)
      — falta VERIFICAR, ya no falta la data.** Micaela existe en local como colaboradora
      de Tienda Trujillo (confirmado 2026-09-15: `retail.colaboradores` tiene su fila con
      `ubicacion_asignada_id` = Trujillo). Falta entrar como ella y verificar en
      navegador que la caja opera sobre *su* sede y no sobre la de un Líder: el selector
      «Tienda … ▾» del AppShell, el `ubicacionId` que `vender/page.tsx` saca de la persona,
      y que el escáner solo reconozca stock de esa sede. Sin dueño ni fecha; no bloquea
      nada de Vender.

- [x] **(Cerrado 2026-09-15: `…231015_registrar_venta_piso_con_nota` YA está en producción**
      — verificado contra la base: una sola `registrar_venta`, cuyo cuerpo llama a
      `fn_sububicacion_por_defecto`; `fn_stock_por_sede` ya suma por sede; y ya hay
      sububicaciones creadas. Sigue vigente lo operativo: al activar piso/almacén en una
      tienda, llevar antes el stock «sin sububicación» al piso con
      `mover_interno(…, null, piso, …)`, prenda por prenda, no con un script ciego.)

**Pendiente de decisión de Felipe:**

- [ ] **El candado real del conteo ciego sigue pendiente, y depende de los roles.** Lo
      de arriba es fricción, no imposibilidad: las otras cuatro tarjetas (apertura,
      ventas en efectivo, ingresos, egresos) permiten sumar el total a mano, y
      `ventas_select` deja a cualquiera con sesión consultar las ventas de su sede desde
      la consola del navegador — un `GET` de una línea. El candado de verdad es que quien
      opera la caja no pueda leer ese agregado, y eso necesita los cuatro niveles de
      D-12, que hoy no existen en la base.
- [x] **"Control total temporal" (`0012`/`0013`) — cerrado por `0016_roles_colaborador`.**
      El hueco que este ítem denunciaba (cualquier colaborador podía operar cualquier
      sede) ya no existe: verificado 2026-09-15 contra `cayla-dynamic` en vivo,
      `fn_puede_operar_ubicacion` compone sobre el `fn_es_lider()` y
      `fn_ubicacion_actual_persona()` reales de `0016` (Líder = todo; Colaborador = solo
      su `ubicacion_asignada_id`), no sobre el bypass de `0012` ("cualquier persona activa
      de Dynamic"). Sigue pendiente, aparte, el candado del **conteo ciego** (ítem
      siguiente), que depende de los cuatro niveles de D-12 y no de este.
- [ ] **¿Dónde vive la docencia del cobro ahora que los (!) solo se encienden cuando
      falta algo?** (ADR-0044). La explicación de «acá se registra, no se cobra» y de
      «boleta admite DNI opcional; factura exige RUC» quedó dentro de los globos de
      alerta — se lee solo mientras falte el método o el RUC. Y el tercer (!) del bloque
      (el de «Consulta de DNI», dentro de `ConsultaDocumento`, compartido con
      Facturación) sigue siempre encendido. Opciones: dejarlo así, un «?» permanente en
      la cabecera del cobro, o un prop en `ConsultaDocumento` para apagarlo en el POS.

**Pendiente de construir (no es un fix de una sesión):**

- [x] **RESUELTO 2026-09-16 (ADR-0063).** El POS de V2 ya tiene resiliencia sin
      internet: `lib/ventas-offline.ts` (puro, 19 tests) + estado `cola` y el trío de
      sincronización (mount/`online`/latido de 30s, con mutex) en `PuntoDeVenta.tsx` +
      banner con "Descartar" en `PuntoDeVentaColaOffline.tsx`. Verificado en el
      navegador como Micaela (Trujillo) interceptando `fetch` solo para
      `registrar_venta` (nunca se tocó Kong — lo comparten ~27 worktrees): encola,
      banner persistente, reintento al volver la red, rechazo real con "Descartar" de
      dos pasos. **Pendiente, sin poder verificarse en esta sesión por un problema de
      datos ajeno** (ver la nota nueva en 🩹 ARREGLAR, "`stock.sububicacion_id` en NULL
      en las tres sedes"): la subida exitosa de punta a punta ("sube sola" → aparece en
      Ventas de hoy). **Deuda RESUELTA 2026-09-17 (ADR-0092):** `totalEfectivoEncolado()`
      ahora se usa en `CerrarCajaModalV2.tsx` y `CajaAbiertaPanel.tsx` (sus dos puntos de
      montaje) — avisa antes de cerrar caja si hay efectivo offline sin subir, y bloquea
      el cierre solo cuando hay red (le da tiempo al reintento de 30s); sin red deja
      cerrar con el aviso puesto y repite el monto en el resultado.
- [ ] **Ficha de clienta — preguntado a Felipe 2026-09-16, más temprano de lo que se
      pensaba.** `registrar_venta` acepta `p_cliente_id` (el onceavo parámetro) desde
      que se le agregaron los campos de comprobante, pero Vender nunca lo manda. Al
      preguntarle si el cobro debía buscar/crear la clienta en `clientes` o si por
      ahora es solo una pantalla de consulta aparte, contestó: "el campo ya está pero
      aún no tengo contemplado el almacenar clientes en mi sistema" — ni siquiera está
      decidido SI se van a guardar clientas, así que no se construye ninguna de las dos
      opciones todavía. Retomar con `/decide` cuando Felipe quiera avanzar esa decisión.
- [x] **Las tres migraciones de ADR-0048 ya están en producción — ya no bloquean el
      deploy.** `20260914215059_candado_precio_venta.sql`,
      `20260914215103_codigos_descuento.sql` y `20260914220804_nota_en_ventas.sql`.
      Verificado 2026-09-15: las tres versiones están en
      `supabase_migrations.schema_migrations` de `cayla-dynamic` y `registrar_venta` en
      vivo acepta `p_codigo_descuento` y `p_nota`. Pendiente de higiene, no de deploy:
      correr `pnpm datos:generar:produccion` (el diccionario sigue describiendo la RPC de
      5 parámetros de V1). «Ventas de hoy» ya pinta `nota` (ítem cerrado arriba).
- [x] **Ticket en espera (Park/Resume)** — cerrado el 2026-09-14 (ADR-0049): sin tabla,
      en `localStorage` por sede vía `lib/almacen-local.ts` (puro, 9 tests, nunca lanza),
      tope 5, retomar intercambia, se vacía al cerrar caja, sin reserva de stock (avisa por
      nombre). Verificado en navegador de punta a punta, incluido el cierre de caja.
      **La cola offline usa el mismo módulo** con `nombre = "cola"` — el primer ladrillo
      del ítem de resiliencia sin internet ya está puesto.
- [ ] **Administrar códigos de descuento** (paso propio): hoy se crean en Studio
      (`retail.codigos_descuento`: código, %, vigencia, activo, sede o todas). Una pantalla
      para Líderes —crear, apagar, ver vigencia— y, si se quiere medir cuánto se regala
      por código, una columna en `ventas` con el código usado.
- [x] **El precio lo pone el navegador y el descuento es un dato fantasma** — cerrado el
      2026-09-14 (ADR-0048): `registrar_venta` rechaza precios distintos a
      `variantes.precio` (salvo Cargo especial) y, para una Colaboradora, descuentos sin
      código válido o por encima de su %. Probado en psql con rollback y por HTTP.
      `registrar_venta` (`0011_venta_con_comprobante.sql:114-117`) inserta
      `precio_unitario`/`descuento_unitario` tal cual llegan, sin compararlos con
      `variantes.precio`. La columna `descuento_unitario` existe (diseño D-44) pero
      `PuntoDeVenta.tsx:47,141` la deja fija en `0` y el campo "Precio unitario"
      sobreescribe el precio directo. Nadie puede medir cuánto se regala en descuentos,
      ni distinguir un descuento autorizado de un cero de más al tipear.
- [x] **El Líder también tiene tope, y el descuento pide motivo — cierra R-45 y D-44**
      (ADR-0054, `20260915140000_descuento_motivo_y_escalonado.sql`). Desde el 09-14 la
      Colaboradora ya tenía tope (el código); el Líder podía descontar cualquier % sin
      dejar rastro. Ahora, para cualquier descuento > 0 (Líder o Colaboradora): motivo
      de lista cerrada obligatorio, y nunca por debajo del costo, sin revelar el número.
      Solo para el Líder: hasta 20 % sola, 20-35 % con argumento escrito, más de 35 %
      nadie — sin excepción (decisión de Felipe, 2026-09-15: la base no puede distinguir
      "Felipe" de las otras 8 personas registradas; ver ADR-0054 «Se descartó»). De
      paso: descuento en S/ por unidad, no solo en %. Verificado en 10 escenarios psql
      y de punta a punta en navegador (Boletas B001-000010 y B001-000011, local).
      **En producción desde 2026-09-15 16:1x (Lima)** — aplicada vía MCP `apply_migration` en `cayla-dynamic`, schema `retail`, verificada contra `information_schema`/`pg_proc` (columnas, constraints, cuerpos nuevos, una sola sobrecarga por función).
- [ ] **Reporte de "cuánto margen se fue por cada motivo"** (R-45, punto 2) — el dato ya
      se guarda (`venta_items.motivo_descuento`), pero no hay pantalla que lo sume por
      motivo ni por período. Paso propio, sobre ADR-0054.
- [ ] **Cero pruebas automatizadas sobre `registrar_venta`, `abrir_caja` y
      `cerrar_caja`.** Es el núcleo del dinero y del stock. No hay `supabase/tests/`
      ni un solo `*.test.ts` que las toque. Es D-25, y lo pide **antes** del censo.
- [ ] **La caja no tiene día de negocio.** `cajas` (`0008_caja_y_pagos.sql:22-35`) no
      tiene columna de fecha ni cierre automático: una caja abierta el lunes sigue
      abierta el viernes y se lleva las ventas de toda la semana. V2 tampoco tiene el
      aviso blando que V1 sí tenía ("cajas de días anteriores sin cerrar").
- [x] **(Cerrado 2026-09-15: el disparador `movimientos_inmutables` YA está en producción** —
      verificado en vivo dos veces por dos sesiones distintas: primero contra `pg_proc`
      (trigger presente, `authenticated` sin `UPDATE`/`DELETE`/`TRUNCATE`), después tabla
      por tabla al refrescar el volcado — producción y local tienen los mismos 7
      disparadores. Queda una sola higiene: `20260914165703` no aparece en
      `supabase_migrations.schema_migrations` — el candado corre, pero su migración no
      quedó registrada. Registrarla es cosa de Felipe (D-11), no bloquea nada. Queda el
      texto original como historia.)
      **El candado de `movimientos` falta en producción, y NO necesita gemelo.** Medido
      contra la base real el 2026-09-14: **producción ya corre V2** — 35 tablas,
      `retail.ubicaciones` existe, `retail.sedes` ya no, y `movimientos` tiene
      `ubicacion_id`/`venta_item_id`/`compra_item_id`. Se desplegó el 12-sep con las
      migraciones normales (`supabase_migrations.schema_migrations` las registra como
      `retail_0007_cambios` … `retail_0016_colaboradores_iniciales`), así que
      **`supabase/unificacion/` dejó de ser el riel de producción** y escribir un gemelo
      ahí habría revivido la deuda de migraciones duales (ADR-0004/0006), que este
      backlog llama "la que más caro ha salido".
      Lo que corresponde: pegar `20260914165703_movimientos_inmutables.sql` **tal cual**
      —ya usa el prefijo `retail.`— y registrarla con el mismo mecanismo que las otras.
      **El pre-flight ya se corrió contra producción: 0 funciones editan o borran
      `retail.movimientos`.** Único trigger presente: `movimientos_compra_foto`
      (AFTER INSERT), que no choca con uno BEFORE UPDATE/DELETE. `authenticated` tiene
      hoy UPDATE y DELETE (TRUNCATE ya no), y 108 filas de historial que proteger.
- [x] **(Cerrado 2026-09-15: `docs/datos/generado/` se refrescó desde producción V2** —
      39 tablas, 361 columnas, 219 candados, 74 funciones, verificados con md5 contra la
      base real. `pnpm datos:comparar` vuelve a comparar contra firmas de verdad: 0 rotas.
      Las carpetas escritas a mano (`00-MAPA.md`, módulos) siguen describiendo V1 en
      partes — esa pasada sigue pendiente.)
      **`docs/datos/` describe un sistema que ya no existe — ni en el repo ni en
      producción.** Fue medido el 2026-09-12 contra el modelo viejo (45 tablas,
      `sede_id`, `venta_id`, `registrar_gasto`, `supabase/unificacion/`). Verificado hoy:
      `registrar_gasto` **no existe** en producción, así que el "Bloque 3" de
      `SQL-PENDIENTE-PRODUCCION.sql` y todo `DIAGNOSTICO-PANTALLAS-ROTAS.md` quedaron sin
      objeto. Es el mismo problema que el aviso del encabezado de este archivo, pero más
      grave: esa carpeta se presenta como "la verdad medida contra la base". Necesita su
      propia pasada de actualización antes de que alguien —o un agente— construya encima.
- [x] **(Cerrado 2026-09-15: `INSERT` directo a `movimientos` cerrado — P-05.)**
      `20260915150000_movimientos_insert_solo_rpc.sql` revoca `INSERT` sobre
      `retail.movimientos` a `authenticated`/`anon`. Verificado contra producción antes de
      escribirla (no razonado): 12 funciones insertan en `movimientos`, las 12
      `security definer` y dueño `postgres`; `relforcerowsecurity=false`, así que las 12 se
      saltan la policy por ser dueñas — el privilegio de tabla era la única puerta real.
      `authenticated` tenía `INSERT`+`SELECT` (UPDATE/DELETE ya los sacó ayer D-22); queda
      solo con `SELECT`. Cero pantallas dependían del insert directo (`grep` sobre
      `apps/web`: un solo `.from("movimientos")`, en `lib/compras.ts:330`, y es un
      `.select`). Probado en rojo/verde en local (ver ADR-0055): el insert directo como
      `authenticated` ahora falla con `permission denied`; las funciones siguen sin tocar
      RLS. Hallazgo de paso, sin tocar hoy: `registrar_movimiento` tiene **dos firmas**
      vivas en producción (6 y 7 parámetros) — mismo patrón que `recibir_lote` en ADR-0004
      — y hoy nada en `apps/web` la llama (solo se usa `registrar_movimiento_caja`, que es
      otra función). **Pendiente aparte, sin tocar hoy:** aplicar este mismo archivo a
      producción (falta el ok puntual) y `retail.transferencias` tiene la misma forma de
      policy de INSERT sin verificar.
- [ ] **La pieza que le sigue faltando a D-22:** `force row level security` sobre
      `movimientos`, con prueba de que las RPC que insertan (venta, transferencia, conteo)
      siguen pudiendo hacerlo. Sigue descartada por riesgo — ver ADR-0042/ADR-0055.
- [ ] **Dos firmas vivas de `registrar_movimiento` en producción** (6 y 7 parámetros,
      `p_sububicacion_id` de más en la segunda) — un `select registrar_movimiento(...)`
      con los 6 parámetros históricos sale `is not unique`, reproducido en local
      2026-09-15. Mismo patrón que `recibir_lote` (ADR-0004): `create or replace` con
      firma distinta crea función nueva, no reemplaza. Hoy no rompe nada porque
      `apps/web` no llama a esta función (ver arriba) — pero cualquier llamada futura con
      la firma vieja de 6 parámetros va a fallar. Se corrige con `drop function` explícito
      de la firma que sobra, igual que se hizo con `recibir_lote`.
- [ ] **`retail.transferencias` tiene la misma forma de policy de INSERT sin RPC** que
      tenía `movimientos` (`transferencias_insert` en `0004_rls.sql`, mismo patrón que
      P-05). No verificado si tiene el mismo problema — hacerlo antes de asumir que está
      bien o mal.

**Higiene encontrada de paso:**

- [ ] **El «Cargo especial» tiene stock 0 en la base local, en las tres ubicaciones**
      (medido 2026-09-14: 0 filas en `stock` y 0 en `movimientos` para la variante
      centinela). `20260912234726_cargo_especial_pos.sql` siembra 999 999 recorriendo
      `retail.ubicaciones`, pero en un `db reset` esa tabla está vacía porque `seed.sql`
      corre después de las migraciones. Efecto: «Monto manual» falla en local con «Stock
      insuficiente: hay 0 y se pide sacar 1». Producción no lo sufre (las ubicaciones ya
      existían). Arreglo probable: que `seed.sql` repita la siembra por movimiento.
- [ ] **El buscador global del AppShell («Buscar o escanear prenda…») es un segundo campo
      de escaneo en la pantalla de Vender**: con Enter navega a `/buscar` y abandona la
      venta a medio ticket. Fuera del alcance de la sesión A (AppShell es navegación).
      Opciones: ocultarlo en `/vender`, o que en `/vender` reenvíe al escáner de la caja.

- [ ] **La base local está 4 migraciones atrás del repo**: `compras_desde_factura`,
      `compras_snapshot_y_paginado`, `vocabulario_cerrado` y `activos_fijos` están en
      `supabase/migrations/` y no en `supabase_migrations.schema_migrations`. Lo que se
      prueba en local no es lo que el repo describe. No se aplicaron en esta sesión a
      propósito: el Postgres local lo comparten todos los worktrees y no era lo pedido.

---

## 🎯 Movimientos en V2 — lectura con proceso, filtros y detalle (2026-09-15)

**Cerrado esta sesión, solo local** — `20260915090000_movimientos_lectura.sql`
(`fn_movimientos`, `fn_movimientos_resumen`, 2 índices por fecha) + pantalla nueva
(`movimientos/page.tsx`, `FiltrosMovimientos.tsx`, `MovimientosLista.tsx`,
`MovimientoDetalle.tsx`), ADR-0050. Ninguna tabla cambia; ninguna escritura cambia.
Corregido de paso: el signo de las transferencias que ENTRAN (antes salía «−»),
la variante centinela «Cargo especial» fuera de Movimientos/Inventario/Inicio
(`lib/cargo-especial.ts`), y `activacion-piso-almacen-produccion.sql` versionado.

**Pendiente de Felipe (producción):**

- [x] **`20260915090000_movimientos_lectura.sql` ya está en producción — este ítem
      quedó viejo apenas se escribió.** Verificado 2026-09-15, dos veces: primero en
      vivo contra `pg_proc`/`schema_migrations` de `cayla-dynamic` (la migración estaba
      registrada y `fn_movimientos`/`fn_movimientos_resumen` existían), después
      después del merge del PR #33 (Vercel en verde). Verificada como Benjamin en
      Tienda AQP con rollback. De paso quedaron registradas en
      `supabase_migrations.schema_migrations` las tres que se aplicaron con
      `execute_sql` (`…230000`, `…231015`, `…090000`): el historial de producción
      vuelve a contar lo mismo que `supabase/migrations/`.
- [x] **Foto de producción del diccionario refrescada (2026-09-15).** Se hizo desde el
      MCP en trozos verificados con md5 contra producción (no a mano en el SQL Editor):
      `retail_*.json` + `funciones-produccion.txt` describen la V2 real. `pnpm
      datos:comparar`: **0 pantallas rotas**, 8 llamadas «no analizadas» porque arman
      el objeto con `...` (entre ellas `fn_movimientos`, verificada a mano en producción).
- [x] **Detalle compartible por URL** (`?mov=<id>`, 2026-09-15): abrir una fila escribe
      el id con `history.replaceState` (sin consulta al servidor); cambiar un filtro o
      pasar de página lo borra. Y `buscar/page.tsx` ya excluye la centinela.
- [x] **`20260915120000_reparar_fk_transferencia_items.sql` aplicada en producción el
      2026-09-15 con ok de Felipe**, verificada con una transferencia real revertida
      (`transferir()` pasa, la línea queda enlazada a su movimiento). Hallazgo del refresco: la ÚNICA diferencia entre producción y
      local es que `transferencia_items.movimiento_id` apunta a `transferencia_items(id)`
      en vez de `movimientos(id)`. Comprobado con rollback: la primera «Mover
      mercadería» entre sedes fallaría entera con «violates foreign key constraint».
      Hoy hay 0 transferencias en producción; nadie lo pisó todavía. Sin datos que
      tocar, sin cambios de pantalla.
- [x] **Buscar por referencia de operación (guía, serie-número) desde Movimientos** quedó
      fuera de esta fase: exige joins solo para el predicado, y Compras/Facturación ya
      buscan por eso. Si Felipe lo usa seguido, va como función hermana de
      `fn_movimientos_variantes` que resuelva `lote_id[]`/`venta_id[]` — no mezclada con
      la búsqueda de prendas. **Hecho el 2026-09-19 (solo local, ADR-0127):**
      `fn_movimientos_busqueda` resuelve traslado, conteo, boleta/factura de venta, factura de
      compra y guía, y devuelve movimientos concretos (no `lote_id[]`/`venta_id[]`), para que la
      lista y las tarjetas cuenten lo mismo.

## 🎯 Historial de Producto en V2 — movimientos por producto + precio/categoría (2026-09-15)

**Cerrado esta sesión (Sesión A3), solo local** —
`20260915204457_movimientos_por_producto.sql` (`fn_movimientos` gana `p_producto_id`,
resuelve a las variantes del producto; `p_ubicacion_id` sigue obligatorio) +
`20260915204541_historial_producto_cambios.sql` (tabla `historial_producto_cambios`,
trigger en `productos`/`variantes` que la llena solo, `fn_historial_producto_cambios`
para leerla) + `HistorialProductoPanel.tsx` (standalone, agrupable por fecha o por
variante). ADR-0059. Ninguna tabla existente cambia de forma; ninguna escritura
existente cambia de comportamiento. Verificado en Chrome headless contra datos
reales (ver BITÁCORA 2026-09-15).

**Integrado por la Sesión B2 (mismo día):** `HistorialProductoPanel` ya no vive
en una ruta de demo — se monta en `/productos/[id]/historial` (página completa)
y, desde el menú "..." de la lista, como modal con ruta interceptada
`@modal/(.)[id]/historial` (mismo mecanismo que el detalle de factura de
Compras). La ruta de demo `productos/dev/historial/[id]` se borró. De paso,
`20260915223000_historial_producto_estado.sql` extiende el trigger para
auditar también `estado` (ver la sección de Acciones masivas más abajo) — sin
eso, activar/desactivar en bloque quedaba fuera del historial.

**Pendiente de Felipe (producción):**

- [ ] **Aplicar las tres migraciones en producción** (las dos de A3 más
      `20260915223000_historial_producto_estado.sql` de B2, con el prefijo
      `retail.`, ver CLAUDE.md) y correr `pnpm datos:generar:produccion` +
      `pnpm datos:comparar` después. Hasta entonces el diccionario de
      `docs/datos/` no describe `historial_producto_cambios` ni el
      `p_producto_id` nuevo de `fn_movimientos`.
- [ ] **`packages/database/src/types.ts` se editó a mano** (el Postgres local es un
      checkout compartido entre 7 sesiones y no era seguro correr `db reset` para
      regenerar tipos). Cuando alguien corra `generate_typescript_types` contra una base
      estable con estas migraciones aplicadas, confirmar que coincide con lo escrito a
      mano y no queda una edición manual suelta.

## 🎯 Inventario en V2 — piso de venta / almacén de tienda (2026-09-14)

**Cerrado esta sesión, solo local** — `20260914210000_inventario_piso_almacen.sql`,
ver BITACORA de esa fecha para el diseño completo. `retail.stock` gana
`sububicacion_id`; las 12 funciones que tocan stock/conteos quedaron revisadas
una por una; `mover_interno()` es la reposición, reutilizable para cualquier
par de sububicaciones. Pantalla de Inventario rediseñada con tarjetas de
resumen, tabla piso/almacén/total/estado, buscador y filtros; POS y "Mover
mercadería" corregidos para no ofrecer stock que el RPC va a rechazar.

**Pendiente de decisión de Felipe:**

- [ ] **"Otras ubicaciones" al revisar una variante** (visibilidad de piso/total
      en las demás sedes) quedó fuera — el pedido lo marcó como "cuando sea
      útil", no como parte de esta fase. Es una consulta adicional sobre
      `getStockPorUbicacion`/`stock`, no un cambio de esquema.
- [ ] **Concurrencia de `mover_interno` verificada por diseño, no por prueba
      real con dos sesiones simultáneas**: el orden determinístico de lock
      (mismo criterio en las dos direcciones) se revisó en el motor
      (`fn_aplicar_movimiento`), pero no se forzó una carrera real de dos
      `psql` en paralelo. Si alguna vez aparece un deadlock real en reposición
      de piso, empezar por ahí.
- [x] **Compras (lectura): RLS de `compras`/`compra_items`/`compra_pagos`/
      `compra_adjuntos` sin candado de ubicación — decidido y aplicado en
      LOCAL el 2026-09-17.** Verificado con Micaela (integrante, Tienda
      Trujillo) contra una transacción de prueba (rollback, sin escribir
      nada): veía las 3 facturas de Taller y Tienda Lima antes del fix, 0
      después (solo la suya, cuando existe). Protocolo `/decide` con Felipe:
      acotar TODO a `fn_puede_operar_ubicacion`, igual que ventas/movimientos
      — no dejarlo compañía-completa ni partir lectura/escritura. Ver
      ADR-0076 y `supabase/migrations/20260917173000_compras_candado_de_sede.sql`.
      **Aplicado en producción el 2026-09-17** (Felipe, SQL Editor) —
      verificado después contra `pg_policies`/`pg_proc` de `cayla-dynamic`:
      idéntico a local. Registrado a mano en
      `supabase_migrations.schema_migrations` (pegar en el SQL Editor no lo
      hace solo).
      De paso, corregido un supuesto de la auditoría original del 09-14: el
      bypass de `0012_control_total_temporal.sql` ("cualquier persona
      activa") ya NO está vigente ni en local ni en producción —
      `0013`/`0016` lo reemplazaron por un chequeo real de rol de líder; el
      registro de compras (`fn_puede_registrar_compras`) ya era solo-líder,
      no hacía falta tocarlo — el hueco real era solo de lectura.
- [ ] **Catálogo:** si la misma auditoría de accesos del 2026-09-14 encontró
      el mismo patrón débil en tablas de catálogo (no solo Compras), sigue
      sin verificar ni tocar — esta sesión (2026-09-17) solo cubrió Compras.

---

**Auditoría completa 2026-09-03.** BITACORA.md y este archivo llevaban congelados
desde el 19-20 de julio, pero el repo tiene commits reales hasta el 23 de julio —
incluida una fase entera de "Unificación" (9 pasos + fixes) sin documentar en
ningún lado. Se cierra esa brecha aquí. Ver el hallazgo #1 de ARREGLAR: es el más
importante que ha entrado a este archivo desde que existe.

## 🎯 Productos en V2 — alta y edición de producto+variantes (2026-09-15)

**Cerrado esta sesión, solo local** — `20260915150001_catalogo_alta_edicion.sql`
(`catalogo_crear_producto`/`catalogo_actualizar_producto`), `/productos/nuevo`,
`/productos/[id]/editar`, `ProductoForm.tsx`. Ver BITACORA de esta fecha para el
diseño completo (por qué no reusa `crear_producto_con_variantes` de V1/producción,
por qué sin `security definer`, por qué el SKU se sugiere y no se le pide a la
persona).

**Pendiente — para que enchufen las sesiones en paralelo:**

- [ ] **Ajustar inventario (Sesión A2)** y **Ver historial (Sesión A3)**: la ficha
      de edición (`app/(app)/productos/[id]/editar/page.tsx`) deja dos huecos con
      `TODO(Sesión A2)`/`TODO(Sesión A3)` explícitos, debajo del form. Grep por esos
      literales para encontrarlos.
- [ ] **No hay pantalla para agregar un color desde el form de producto** — si
      falta un color durante el alta, hay que ir a Productos → Colores aparte
      (`/productos/colores`, ya existe) y volver. Aceptable por ahora (no lo pidió
      Felipe), pero es la fricción más probable en uso real.
- [ ] **Aplicar en producción** — sigue el patrón de siempre: prefijo `retail.` al
      pegar en el SQL Editor (nunca en el archivo), y correr
      `pnpm datos:generar:produccion` + `pnpm datos:comparar` después.

**Hallazgo de infraestructura, no de este módulo — para la próxima sesión de
planificación:** las 7 sesiones paralelas de esta tanda comparten un solo working
directory y un solo `git HEAD` (no worktrees aislados). Un `git checkout` de una
sesión mueve la rama activa para las otras seis, y un archivo generado compartido
(`packages/database/src/types.ts`) se truncó a 0 bytes a mitad de sesión por dos
`supabase gen types ... > src/types.ts` corriendo a la vez. Se resolvió sin perder
trabajo (rama nueva desde el commit vivo + commit acotado + `git branch -f`), pero
el próximo reparto de sesiones en paralelo debería usar worktrees separados
(`EnterWorktree`/`isolation: "worktree"`) en vez de un directorio compartido.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [x] **`20260915130000_produccion_del_taller` — resuelta la contradicción (2026-09-17
      tarde).** Consultado directo contra `information_schema`/`pg_proc` en `cayla-dynamic`
      (schema `retail`): `abrir_produccion`, `cerrar_produccion`, `set_etapa_produccion` y
      `revertir_produccion` **sí existen** en producción. `DiegoN` tenía razón, `main` no —
      Producción del Taller ya está aplicada y operable en producción, no hace falta pegar
      nada de esa migración de nuevo.
- [ ] **Producción, decisiones abiertas tras la matriz (2026-09-15, ADR-0050 §5):**
      (a) ¿atajo «Nuevo modelo» dentro de la orden que abra el flujo de Productos? Hoy
      Productos V2 no crea variantes desde pantalla (nacen por importación), así que el
      enlace de la matriz solo orienta. (b) ¿«tercerizado» se marca al abrir la orden o
      basta en la tarjeta? (c) `productos.material` de V1 no existe en V2 — solo si Felipe
      lo pide, y como cambio de catálogo, no de Producción.
- [ ] **Producción: lo que quedó fuera del paso 1.** (a) Movimientos muestra
      `produccion`/`reversion_produccion` como texto crudo, sin enlace a la orden.
      (b) V1 tenía `RecibirLoteForm` para que el Taller reciba mercadería sin factura;
      V2 lo cubre por Compras → Recibir — decisión de Felipe si el Taller necesita una
      entrada manual aparte de la corrida. (c) Una orden cerrada no se edita (solo
      revertir + volver a cerrar): revisar con el Taller si eso les alcanza.

- [x] **Migración `20260914210000_compras_resumen_por_vencer` sí está en
      producción** (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`:
      `retail.resumen_compras()` ya devuelve `por_vencer`/`por_vencer_monto`).

- [x] **Migración `20260914220000_compras_orden_por_creacion` sí está en
      producción** (verificado 2026-09-16: `retail.listar_compras` ya acepta
      `p_cursor_creado_en`).

- [x] **Rediseño de Compras (2026-09-14): verificado en navegador 2026-09-17 — encontró
      y arregló un bug real de layout que `tsc`/`eslint` no podían ver (ADR-0098).**
      `/compras/nueva` tenía Serie/Número/Fecha de emisión literalmente superpuestos
      (texto ilegible) entre 1024 y 1279px — la franja donde el panel "Resumen" se
      vuelve columna fija (`lg:` de Tailwind) pero la tarjeta del formulario todavía no
      tiene ancho de sobra. Arreglado: Serie+Número+Fecha pasan a una sola fila de 3
      columnas con `minmax(0,…)` (antes desbordaban su columna en vez de encogerse), y
      el breakpoint del layout de 2 columnas (+ el `sticky` del Resumen, que quedó
      huérfano al mover solo el primero) se corrió de `lg:` (1024px) a `xl:` (1280px) —
      a 1024px la tarjeta del documento no tiene espacio real para tres campos cómodos,
      sin importar cuánto se recorten. Verificado en 1024px, 1280px y 375px (móvil).
      `/compras` (chips, tarjeta "Por pagar" → `/compras/por-pagar?vencidas=1` con el
      panel abierto solo), `/compras/nueva` (buscar "falda" en Producto, Enter en el
      costo agrega línea nueva — confirmado), `/compras/por-pagar` ("Pagar" en la fila
      abre modal sin navegar) y `/compras/recibir` (tocar una factura arma la guía,
      curva de tallas con su propio scroll horizontal, sin desborde) — todo verificado.
      `tsc`, `eslint` y 297 pruebas en verde. Detalle completo, incluido el mismo
      defecto latente sin disparar todavía en `PLANTILLA_LINEAS` (líneas de factura) y
      en `ProductoForm.tsx` (sesión de Catálogo, no tocado acá), en ADR-0098.
      - [ ] **Sin probar en esta pasada:** "+ Sumar" (sumar otra factura del mismo
            proveedor a la misma guía), "Todo llegó", y el caso "barra fija choca con
            las pestañas móviles" en `/compras/recibir` (el número a ajustar, si pasa,
            es `bottom-[calc(4.25rem+…)]` en `RecepcionCompraFormV2.tsx`).
      - [ ] `PLANTILLA_LINEAS` (línea 36 de `CompraFormV2.tsx`) tiene el mismo patrón sin
            `minmax(0,…)` que causó el bug de arriba — no se ha disparado porque sus
            columnas fijas (24rem) son más anchas que el desborde que lo dispara, pero
            sigue latente. Vale una pasada dedicada.

- [ ] **Importador de catálogos de clientes con IA — el estándar universal ya está
      puesto, falta el importador encima.** Construido y verificado hoy (ADR-0030):
      migración `0052`, `scripts/taxonomia/cargar.mjs`, 1.849 categorías y 10.216
      valores de la Shopify Product Taxonomy v2026-08 en local, motor de anclaje
      en dos pasadas (`lib/taxonomia/anclar.ts` puro y testeado +
      `anclar-ia.ts`), endpoint `POST/PUT /api/taxonomia/anclar` (propone / guarda,
      nunca en un solo paso) y pantalla `/inventario/taxonomia`.
      **Bloqueado por lo mismo que todo lo demás de IA: no hay `ANTHROPIC_API_KEY`
      en el entorno.** Sin ella el endpoint responde 503 con el mensaje que lo
      explica, y el anclaje de los 30 colores y 32 categorías de CAYLA nunca se ha
      ejecutado — o sea que la calidad real de las propuestas del modelo todavía no
      se ha visto. Va en `.env.local` y también en Vercel (Production y Preview),
      **sin** prefijo `NEXT_PUBLIC_`, igual que `PADRON_TOKEN` y `LUCODE_TOKEN`.
      Lo que falta después, en orden (plan completo aprobado por Felipe): leer el
      archivo del cliente sin IA (`.xlsx` con `exceljs`, `.csv`, Google Sheets por
      URL) → llamada 1 que infiere el plan de mapeo de columnas → llamada 2 que
      ancla los valores distintos y siembra el vocabulario propio del cliente con
      SUS nombres → RPC `importar_catalogo` transaccional (llamar
      `crear_producto_con_variantes` 900 veces son ~5 minutos de round-trips a São
      Paulo, ADR-0013) + tabla `importaciones` + deshacer por `estado` →
      carril PDF/foto que produce la misma tabla y entra al mismo motor → aviso de
      versión nueva del estándar. Costo estimado ~$0.17 por cliente con Opus 5 y la
      taxonomía cacheada, contra ~$5.85 si se le mandaran las 3.000 filas al modelo:
      la regla es que **la IA compila el mapeo, no procesa las filas**.

- [ ] **`0052` no está en producción.** Se aplicó y verificó solo contra el
      Postgres local. Pegarla en el SQL Editor de producción requiere el prefijo
      `retail.` (CLAUDE.md §"Cómo aplicar SQL a producción") y es un cambio de
      esquema en producción, o sea decisión de Felipe. El seed de la taxonomía
      (`supabase/seed-taxonomia/*.sql`, ~1.5 MB, gitignored) se regenera con
      `node scripts/taxonomia/cargar.mjs` y lleva su propio `set search_path`.

- [x] **`20260914200000_compras_multipago` sí está en producción** (verificado
      2026-09-16: `retail.registrar_pagos_compra` existe).

- [x] **`20260914190000_compras_total_del_papel` sí está en producción**
      (verificado 2026-09-16: `retail.registrar_compra` ya acepta `p_total` y el
      check `compras_total_cuadra` existe).

- [x] **`20260914180000_compras_adjuntos` sí está en producción** (verificado
      2026-09-16: tabla `retail.compra_adjuntos`, RPCs `registrar_adjunto_compra`/
      `archivar_adjunto_compra` y el bucket `retail-compras-adjuntos` existen).
      **La subida real sigue sin probarse de punta a punta** (Storage local
      apagado) — eso no lo confirma una consulta a `information_schema`.

- [x] **`20260914150000_proveedores_administrables` sí está en producción**
      (verificado 2026-09-16: `retail.registrar_proveedor`/`actualizar_proveedor`/
      `desactivar_proveedor`/`reactivar_proveedor` existen).

- [x] **`20260914160000_igv_solo_en_factura` sí está en producción** (verificado
      2026-09-16: check `compras_igv_solo_factura` existe en `retail.compras`).

- [ ] **`gen-types` sigue apuntando al proyecto viejo y ahora hay drift real
      medido.** `packages/database/package.json` usa `--project-id
      vovjyyiafkxteijimpuy` (producción). Generar desde local —lo natural cuando
      las tablas nuevas solo existen ahí— **borra** `catalogo_con_stock`,
      `configuracion_empresa`, `sede_meta`, `sede_datos_fiscales`,
      `persona_actual` y `puede_operar_sede`, que existen en producción y no en
      local. Hoy los 5 tipos de taxonomía y las 2 columnas de anclaje se
      insertaron a mano por eso. Mientras el drift exista, regenerar a ciegas
      rompe la app: hace falta decidir cuál de los dos entornos es la fuente.


- [x] **`almacen interno`: aplicado y verificado en producción 2026-09-03 —
      backend completo, frontend adaptado, falta la prueba en vivo por Felipe.**
      "Recibir mercadería" era el único camino para crear un producto y no
      tenía a dónde escribir (la unificación nunca recreó las sedes-almacén
      TRU-ALM/AQP-ALM/LIM-ALM del retail original). Decisión: el almacén deja
      de ser una sede hermana — pasa a ser un contenedor `tipo='almacen'`
      dentro de la misma sede + tabla `retail.stock_almacen` aparte.
      `supabase/unificacion/12_almacen_interno.sql` pegado y verificado: 4
      contenedores (TRU/AQP/003/LIM, CCO sin ninguno — confirmado con
      `select` real). Las 3 funciones que reescribe (`fn_aplicar_movimiento`,
      `recalcular_stock`, `puede_operar_sede`) se verificaron byte por byte
      contra producción ANTES de pegar, no se asumieron. Frontend actualizado
      en 7 archivos (`inventario/recibir`, `RecibirLoteForm`,
      `inventario/almacen`, `AlmacenStockList`, `BajarATiendaModal`,
      `inventario` catálogo, `InventarioAgrupado`) — ya no buscan una sede
      `tipo='almacen'`, usan el contenedor de la propia sede. Tipos de
      `packages/database` regenerados contra el proyecto correcto
      (`--project-id` de cayla-DYNAMIC, `--schema retail`) — el script de
      `gen-types` en `package.json` sigue apuntando al proyecto viejo de
      retail y hay que corregirlo a mano la próxima vez (ver ítem de tipos
      abajo). **Sin decidir todavía:** si lo terminado del Taller (LIM) debe
      pasar por el almacén interno (con su propio "bajar a piso") o seguir
      directo al piso como hoy — su contenedor ya existe, pero
      `registrar_produccion`/`cerrar_produccion` no lo usan. Y "Devolver a
      almacén" (piso → almacén) quedó con su RPC (`retail.devolver_a_almacen`)
      pero sin conectar en el frontend — pregunta de UX abierta con Felipe
      (¿botón propio, o dentro de `MovimientoModal`?). **Falta lo único que
      de verdad lo cierra: que Felipe entre un producto real por la pantalla
      y confirme que aparece.**
- [x] **RESUELTO (verificado 2026-09-09: `npx tsc --noEmit` sale con exit 0 y
      `next build` compila las 28 rutas). Se arregló en algún momento entre el
      03-09 y hoy sin que nadie lo anotara — mismo patrón que el ítem de
      "no hay registro de qué corrió" de más abajo, pero en el código. Texto
      original abajo, como quedó registrado el 2026-09-03:**
      **`tipos de TypeScript`: regenerar contra el proyecto correcto sacó a la
      luz 30 errores en 14 archivos que nadie tocó hoy — deuda real, no
      ruido de esta sesión.** `retail.sedes`/`retail.personas` son VISTAS
      (join contra `public` de Dynamic) — Postgres no le garantiza a Supabase
      que sus columnas nunca sean nulas, así que el tipo real es
      `string | null` donde el proyecto viejo (con el que se generaban los
      tipos hasta hoy) decía `string`. Afecta `finanzas/*`, `produccion/page.tsx`,
      `producto/[varianteId]/page.tsx`, `layout.tsx`, `actions/sede.ts`,
      `api/export/inventario`, `PatrimonioEditor.tsx`, `lib/finanzas-nucleo.ts`,
      `lib/panel.ts`, `lib/persona.ts`, `lib/sedes.ts` — ninguno tocado en esta
      sesión. `next build` (sin `ignoreBuildErrors` en `next.config`) fallaría
      hoy con estos 30 errores. Necesita su propia sesión, revisando caso por
      caso si el `null` es real (¿puede una sede no tener código?) o si basta
      con filtrar/asegurar como se hizo en `inventario/page.tsx` esta sesión.
      Aparte: `packages/database/package.json` (`gen-types`) sigue apuntando al
      proyecto viejo de retail — corregirlo al de Dynamic + `--schema retail`
      para que esto no se repita.
      **CERRADO 2026-09-09.** Se regeneraron los tipos contra el proyecto
      correcto (`vovjyyiafkxteijimpuy`, `--schema retail`) al empezar
      `lib/conteo.ts`, que no compilaba porque los tipos no conocían `conteos`,
      `conteo_lineas`, `codigos_barras` ni `colores`. De los 30 errores quedaba
      **uno solo**: las otras sesiones limpiaron 29 hoy con la auditoría de
      lecturas. Era `api/lucode/emitir/route.ts:167`, mandando `null` a un
      parámetro que supabase-js tipa opcional (`string | undefined`) porque la
      función tiene default; se cambió a `undefined`, que deja a Postgres
      aplicar ese default. Y se corrigió el `gen-types` para que apunte al
      proyecto de Dynamic con `--schema retail`. `tsc --noEmit` limpio,
      `pnpm build` compila, 79 tests pasan.
- [ ] `catalogo real`: cargar los 300-900 SKUs físicos — el desbloqueador más grande
      que queda. **Cambió de estrategia el 2026-09-09: deja de ser captura gradual
      y pasa a ser un CENSO de una vez.** El plan de `PLAN-DE-TRABAJO.md` §5 ("es
      un ritmo, no un evento") llevaba dos meses sin moverse, y tiene un defecto
      que explica por qué: mientras el catálogo esté a medias, "stock dice 0" es
      ambiguo (¿se agotó, o nunca se capturó?), así que ninguna alerta ni clase
      ABC es confiable, nadie usa el sistema, y nadie lo llena. El censo rompe el
      círculo: desde el día X, 0 significa cero.
      **Decisiones de Felipe (2026-09-09):** solo el piso de las 3 tiendas (no la
      trastienda); costo por modelo, no por talla/color; código corto nuevo
      (`BLU-0042-AZM-M`); las Encargadas cuentan y Felipe aprueba al cerrar el
      conteo. Y el dato que más cambia el diseño: **casi todas las prendas ya
      traen código de barras de fábrica**, así que el censo escanea desde el
      minuto uno en vez de imprimir y pegar 900 etiquetas primero.
      Plan completo en `~/.claude/plans/analiza-el-modulo-de-cached-jellyfish.md`.
      **Avance:** bloques 0 y 1 hechos y verificados en local (ver los dos ítems de
      abajo). Faltan: colores (vocabulario cerrado), códigos + `codigos_barras`,
      conteos, y las pantallas de captura por matriz y de conteo.
      **Consecuencia operativa del alcance que hay que decirle al equipo:** como
      no se cuenta la trastienda, `stock_almacen` queda en 0 y "Bajar a tienda"
      va a fallar por stock insuficiente. Lo que baje de atrás entra como
      "Recibir", no como "Bajar a tienda".
      **Corrección 2026-09-18 — esta entrada quedó desactualizada por las sesiones
      paralelas del 16/17-sep; auditado el código real, no lo que decía este
      archivo.** De los 5 bloqueadores que decía que faltaban, **4 ya están
      completos en producción**: colores (proponer/aprobar/rechazar/reactivar,
      `ColoresLista.tsx`), códigos + `codigos_barras` (tabla desde `0002_esquema.sql`,
      código corto autogenerado por trigger al crear variante), conteos (abrir/
      contar/cerrar/anular, `ConteoPanel.tsx` + `lib/conteos.ts`, escaneo directo) y
      la matriz talla×color con costo por modelo en `/productos/nuevo`.
      **La 5ª brecha (alta de prenda al vuelo durante el conteo) se cerró el
      mismo 2026-09-18 (ADR-0099):** `censo_crear_variante` (sin el candado
      de Líder de `crear_producto_con_variantes`) + `estado_alta` proponer/
      aprobar en `productos` (mismo mecanismo que colores/tallas/tejidos/
      patrones/etiquetas) + banner de revisión en `/productos` y `/productos/
      [id]/editar`. Probado de punta a punta en navegador local: escanear un
      código desconocido en pleno conteo, crear la prenda sin salir de la
      pantalla, contarla, y que el Líder la vea pendiente y la apruebe.
      `tsc`/lint/297 tests en verde. **`20260918020000_censo_alta_al_vuelo.sql`
      aplicada y verificada en producción 2026-09-18** (columnas + 2 funciones
      + 1 trigger confirmados contra `information_schema`/`pg_proc`).
      Aparte, sigue sin construirse una pantalla de impresión de etiquetas
      propias (`Codigo128.tsx`/`codigo128.ts` existen pero no los importa
      nadie) — no bloquea el censo (Felipe ya decidió escanear código de
      fábrica), pero quedó huérfano si algún día hace falta.
- [x] **`almacen interno en el riel numerado` — hecho y verificado en local
      2026-09-09 (`0044_almacen_interno.sql`); falta pegar `unificacion/26` en
      producción.** `stock_almacen`, el contenedor `tipo='almacen'`,
      `bajar_a_piso` y `devolver_a_almacen` solo existían en producción desde el
      3-sep, así que `npx supabase db reset` dejaba una base local donde
      `catalogo.ts:47` consultaba una tabla inexistente. Y apareció la deriva
      inversa: `unificacion/12` reescribió `fn_aplicar_movimiento` partiendo de un
      cuerpo anterior a `0011` y **perdió `ultima_venta`** — en producción la
      columna existe y nadie la escribe, así que "Días sin venta" mide la edad de
      la variante desde que se creó y todo el catálogo aparece estancado para
      siempre. `unificacion/26_ultima_venta_en_aplicar_movimiento.sql` la restaura
      y hace backfill desde `movimientos`. **Pendiente de Felipe: pegar `26` en el
      SQL Editor de producción, ANTES que `27`.**
- [x] **`el ajuste lleva signo` — hecho y verificado en local 2026-09-09
      (`0045_ajuste_con_signo.sql`, ADR-0023); falta pegar `unificacion/27`.**
      Era imposible registrar un conteo MENOR a lo que dice el sistema: la rama
      `ajuste` proponía la fila con el delta y Postgres evalúa el CHECK sobre la
      fila propuesta — el mismo bug de ADR-0020, a cincuenta líneas de la función
      que ese ADR daba por segura. Y producción **nunca tuvo**
      `stock_cantidad_no_negativa`, así que allá no habría explotado: habría
      creado stock negativo en silencio. Se arregla con
      asegurar→bloquear→verificar→sumar bajo `for update`, y se ponen las tres
      redes que faltaban (`stock`, `stock_almacen`, y `movimientos.cantidad <> 0`
      con signo solo para el ajuste). **Pendiente de Felipe: correr el pre-flight
      de `unificacion/27` y LEERLO antes de aplicar** — si hay filas negativas o
      movimientos en cero, se miran una por una y se corrigen con movimientos,
      nunca borrando.
- [x] **`vocabulario cerrado de colores` — hecho y verificado en local 2026-09-09
      (`0046_colores.sql`, ADR-0024); falta pegar `unificacion/28`.** 29 colores
      aprobados por Felipe, con índice único sobre el nombre normalizado: la base
      rechaza "azul marino" si ya existe "Azul marino". Es la pieza con mayor
      costo de postergación del proyecto — unificar colores después del censo no
      es un `update` de texto, es fusionar variantes con stock e historial. NO se
      hizo tabla de tallas, a propósito: agregarla tarde es barato (no es FK de
      nada), agregar colores tarde es caro.
- [x] **`código corto + codigos_barras` — hecho y verificado en local 2026-09-09
      (`0047_codigos.sql`, ADR-0025); falta pegar `unificacion/29` DESPUÉS de la
      `28`.** `BLU-0042-AZM-M` al lado del SKU, que no se toca. El argumento no es
      estético: `EtiquetasGenerator` estira el Code 128 al ancho de la etiqueta,
      así que 40 caracteres dan 1.2 puntos por módulo a 300 dpi cuando la regla
      térmica es ≥3 — **ésa es la razón real de que la pistola a veces no lea**.
      Más `variantes_identidad_unica`, que impide que 4 personas creen la misma
      prenda 4 veces. Y `codigos_barras` (varios códigos → una prenda), que como
      casi todas las prendas ya traen código de fábrica convierte el censo en
      "escanear lo que está en la percha" en vez de "pegar 900 etiquetas primero";
      el backfill registra el `sku` viejo, así que las etiquetas ya impresas
      siguen funcionando. **Pendiente de Felipe: los TRES pre-flight de
      `unificacion/29`** (categorías que el archivo no conoce, variantes
      duplicadas, SKUs repetidos). Si el de duplicados devuelve filas, se resuelve
      una por una — nunca borrando.
- [x] **`sesiones de conteo` — hecho y verificado en local 2026-09-09
      (`0048_conteos.sql`, ADR-0027); falta pegar `unificacion/30` al final de la
      cola.** Dos tablas y siete RPC. Un conteo que puede crear prendas al vuelo
      es un censo; un censo sobre un catálogo cargado es un conteo — la misma
      operación, así que no hay código de "carga inicial" que se abandone.
      `cantidad_sistema` se congela AL CONTAR (si se vende algo entre contar y
      cerrar, la venta sobrevive; leyendo el sistema al cerrar se borraría).
      `ajuste` con signo en vez de un `tipo='conteo'` nuevo, porque
      `recalcular_stock` conoce cuatro tipos y un quinto quedaría excluido en
      silencio. **Verificado con una Encargada real:** abre, crea la prenda
      adoptando su código de fábrica, cuenta 4 — y al cerrar recibe "Solo un líder
      puede cerrar un conteo". El stock quedó en 0 hasta que el Líder cerró.
- [x] **CERRADO 2026-09-10 — `censo`: las pantallas.** El ítem estaba viejo: al auditarlo el
      2026-09-10 resultó que la proyección delgada (`getCatalogoParaConteo`, 6 columnas en
      vez de 1,1 MB) y la pantalla de conteo con pistola ya existían desde `ab479ba`.
      **Cerrado hoy: el cierre del conteo** — `/inventario/conteo/cerrar`, con la varianza
      valorizada en soles, el aviso de lo que nadie contó, y las dos decisiones de la Líder
      (cerrar / anular). Era el agujero que dejaba el módulo entero sin servir: la pantalla
      de conteo prometía "lo contado no entra al inventario hasta que la Líder cierra" y
      `cerrar_conteo` no estaba cableada en ninguna parte.
      **CERRADO TAMBIÉN el alta repetida, y no como se había planeado.** El backlog pedía una
      MATRIZ talla × color; al mirarlo de cerca se descartó y se hizo otra cosa, por dos
      razones. (1) `conteo_crear_variante` siempre termina llamando a `conteo_contar`, así que
      crear las 12 celdas de golpe metería 11 líneas «contadas: 0» al conteo — en el cierre eso
      significa «miré y no había», que es una afirmación, no un vacío. (2) El dolor real no era
      declarar 12 celdas: era que la segunda talla del mismo modelo pedía otra vez los siete
      campos. Se implementó **recordar el modelo**: la siguiente alta pide talla, color y
      cantidad, y nada más.
      **Y de paso destapó un defecto que el censo habría golpeado en la prenda nº 2:**
      `AltaEnConteo` nunca pasaba `p_producto_id`, así que declarar la talla M y después la L
      de la misma blusa creaba DOS productos con la misma referencia y dos códigos cortos
      distintos — y el código corto es lo que va impreso en la etiqueta y lo que agrupa el
      catálogo por modelo. Recordar el modelo es lo que lo impide.
      (Etiquetas en lote quedó fuera del alcance del censo: esa pantalla es de la sesión de QR.)
- [x] **CERRADO 2026-09-10 — LA `33` YA ESTÁ EN PRODUCCIÓN. No queda ninguna migración
      pendiente de pegar.** Aplicada desde la sesión a pedido de Felipe (autorización
      explícita: "aplícala tú"), y verificada en la misma base, no por suposición:
      `la_33_aplicada = true` buscando `v_color_id := nullif(trim(p_color_codigo)` en el
      cuerpo, **una sola firma viva** de 12 argumentos (no se creó sobrecarga, que era el
      riesgo del ADR-0009), e idéntica a la de local argumento por argumento.
      **Se corrió con `execute_sql`, NO con `apply_migration`, y el motivo importa:**
      `apply_migration` habría escrito una fila en `supabase_migrations.schema_migrations`
      del proyecto de Dynamic — el historial de ELLOS, no el nuestro —, y una versión
      fantasma ahí puede romperle el `db push` a quien mantenga Dynamic. `unificacion/`
      se pega, no se registra; eso es justo lo que dice CLAUDE.md.
      **Única divergencia, cosmética y anotada para que nadie la investigue después:** el
      comentario del arreglo quedó en producción sin las flechas `↓↓↓` del archivo del
      repo. El código es idéntico; el marcador que usan las auditorías es la línea de
      código, no el comentario. Texto original abajo:**
      **FALTA UNA SOLA, LA `33` — verificado contra producción 2026-09-10.** Inventario leído de la base y pasado por `migraciones:verificar`:
      la `27`, `28`, `29`, `30`, `31` y `32` **están aplicadas**. Comprobado objeto por
      objeto, no por documento: existen `colores` (30 filas, con `ARN` de la 32),
      `codigos_barras`, `codigos_correlativos`, `conteos`, `conteo_lineas`; hay **0
      funciones sobrecargadas** en `retail` (o sea la 31 corrió); y las 37 categorías
      están. **La única pendiente es `unificacion/33_conteo_color_vacio.sql`:**
      producción tiene todavía la `conteo_crear_variante` de la `30`, confirmado
      buscando `v_color_id := nullif(trim(p_color_codigo)` en el cuerpo de la función
      — no está. Es un `create or replace` de una sola función, con la MISMA firma de
      12 argumentos (no crea sobrecarga) y **no toca ni una fila**.
      **BLOQUEO DE ORDEN:** pegarla ANTES de desplegar la pantalla de conteo. Sin ella,
      crear una prenda al vuelo dejando el color vacío revienta — el formulario manda
      `''` y la versión vieja solo contempla `null`. Es exactamente el bug que `0051`
      arregló en local hoy.
      **Dos avisos que salieron del mismo barrido y NO bloquean:** (a) el verificador
      marca `unificacion/01_sedes.sql` como incompleto por `retail_sede_meta` — falsa
      alarma, la tabla vive en `retail.sede_meta`, se movió de schema en la
      unificación; (b) la sobrecarga de `fn_set_meta_cobertura` que reporta es de
      `public`, o sea de Dynamic, no nuestra. Texto original abajo:**
      **Pegar en producción `27` → `28` → `29` → `30`, en ese orden.** Estado real
      de producción **verificado contra la base el 2026-09-09** (no contra estos
      documentos, que decían otra cosa): la `25`, la `26` y la `31` **ya están
      aplicadas** — el encabezado de ADR-0020 decía que la 25 estaba pendiente
      cuando su propio cuerpo dice que se aplicó, y nadie había registrado que la
      26 ya se pegó. Faltan solo esas cuatro.
      Cada una depende de la anterior: la 29 arma el código de cada prenda con el
      código de color que crea la 28, y la 30 no puede registrar un conteo hacia
      abajo sin el ajuste con signo de la 27.
      **Los siete pre-flight se corrieron contra producción y dieron todos 0**
      (stock negativo, stock_almacen negativo, movimientos en cero, movimientos
      negativos que no son ajuste, categorías desconocidas, variantes duplicadas,
      SKU repetidos). Las 37 categorías calzan exactas con los prefijos de la 29.
      No hay nada que limpiar antes: se pueden pegar seguidas.
      Guía paso a paso con el SQL listo para copiar:
      `~/AppData/Local/Temp/.../scratchpad/falta-pegar.html`, publicada como
      artifact "Lo que falta pegar".
- [ ] **Dos colores escritos a mano que no calzan con los 29.** Los va a destapar
      la `28` en cuanto se pegue: **"Arena"** (3 variantes) y **"azul"** a secas
      (2 variantes) — 5 de las 19 variantes de producción. Arena es un color real
      del catálogo de CAYLA y probablemente convenga agregarlo (`ARN`, familia
      tierra); "azul" hay que decidir si es marino o claro. Mientras no tengan
      color resuelto, esas 5 variantes **no reciben código corto** — es
      deliberado (ADR-0025: el código no se inventa), y en cuanto se les asigne
      color, `retail.fn_asignar_codigo_variante` se los da.
- [ ] **`reemplazo total de Alegra` (antes "finanzas F3") — proyecto propio con
      plan de 8 fases aprobado (Fase 0.5 sumada después). Fase 0 CERRADA Y
      CONFIRMADA EN PRODUCCIÓN 2026-09-05; Fase 0.5 en construcción.** Felipe
      decidió reemplazar Alegra por completo (facturación + contabilidad +
      gastos + ingresos + resumen ejecutivo), no solo conectar SUNAT. Plan
      completo en `~/.claude/plans/cozy-gathering-nova.md`.
      **Corrección importante (ADR-0005, actualizado 2026-09-05):** el
      proveedor de transmisión SUNAT NO es Nubefact — es **Lucode**
      (`app.apisunat.pe`), con quien Felipe ya tenía relación comercial y
      credenciales de sandbox emitidas; más barato que Nubefact (S/30/mes vs
      S/70/mes al mismo volumen). El mecanismo es tercerización **PSE** (sí es
      término oficial SUNAT — la investigación original se equivocó en eso),
      no homologación OSE: CAYLA sigue como "SEE - Del Contribuyente" pero
      autoriza a Lucode a transmitir en su nombre. **Trámite pendiente, hace
      Felipe, no requiere código:** alta como PSE tercero en SUNAT SOL
      (RUCs GIOR TECHNOLOGY `20515809822` / VIDA SOFTWARE `20600337832`, fecha
      de inicio mañana o posterior — SUNAT no permite el mismo día). Mientras
      no se dé de alta, no se puede transmitir en producción aunque el código
      esté listo.
      **Fase 0 (ADR-0007) — verificada en producción:** `17_facturacion_completa.sql`
      pegado; confirmado con `pg_proc`/`information_schema.tables` que las 6
      funciones y las 3 tablas (`comprobantes`, `series_comprobantes`,
      `proformas`) existen. Proforma en tabla separada (nunca se "promociona"
      con UPDATE), NC/ND con referencia obligatoria a un comprobante aceptado
      (CHECK + trigger), `nota_debito` agregado.
      **Fase 1 (Lucode, ADR-0009) — construida y verificada en local, falta
      producción + credenciales:** `comprobantes.items jsonb` (con fallback
      genérico si `ComprobantesPanel.tsx` no manda desglose — el desglose real
      por SKU queda pendiente de conectar Facturación a `ventas`, decisión de
      UX de Felipe), adaptador `apps/web/lib/lucode.ts`, ruta
      `/api/lucode/emitir`, botón "Transmitir" visible en comprobantes
      pendiente/rechazado. Local: `0037_comprobantes_items.sql` +
      `0038_actualizar_transmision_comprobante.sql`. Producción:
      `supabase/unificacion/20_comprobantes_items.sql` +
      `21_actualizar_transmision_comprobante.sql` — **aplicadas en producción
      el 2026-09-08**, junto con `22_serie_numero_inicial.sql` (ver BITÁCORA
      de ese día; el texto de abajo quedó como se escribió el 05-09).
      **Pendiente, ambos bloquean la prueba real:** (1) ~~que Felipe pegue esas
      dos migraciones en el SQL Editor de producción~~ **hecho 2026-09-08**;
      (2) que Felipe ponga su
      `LUCODE_TOKEN` real en `.env.local` (`LUCODE_ENTORNO=sandbox`) — nunca en
      el chat. Sin eso el botón responde "sin_credenciales", sin riesgo de
      transmitir a medias. Independiente del código: el trámite SUNAT SOL de
      alta como PSE tercero (línea de arriba) sigue sin confirmarse hecho —
      bloquea sandbox→producción real aunque el código esté listo.
      **ACTUALIZACIÓN 2026-09-05 (noche) — transmitir a producción YA FUNCIONA,
      verificado con documentos reales.** Sandbox: boleta **B005-000001**
      (S/189.90) ACEPTADA con CDR. Producción: boleta **B004-000001** (TRU,
      S/1.00) transmitida y aceptada en cola por SUNAT (PENDIENTE, firmada, con
      PDF). El token de Lucode autentica igual en ambos ambientes. Tres cosas
      que esto deja pendientes: (1) **dar de baja B004-000001** desde el panel
      de Lucode (resumen diario de bajas, 7 días) — es un documento legal por
      una venta que no existió, y el sistema todavía no sabe anular; (2) al
      configurar la base definitiva, registrar la serie **B004 de TRU con
      próximo número 2** — ese correlativo ya está consumido ante SUNAT y
      arrancar en 1 hace que rechace todo por duplicado; (3) pegar
      `supabase/unificacion/22_serie_numero_inicial.sql`, que es lo que permite
      fijar ese próximo número (antes la serie siempre nacía en 1). Numeración
      acordada con Felipe: una serie por tienda — **TRU B004/F004, AQP B005/F005,
      LIM B006/F006**. Nota de seguridad: el `LUCODE_TOKEN` terminó pegado en el
      chat pese a la advertencia de arriba; conviene rotarlo desde el panel.
      **ACTUALIZACIÓN 2026-09-09 — la pantalla decía que SUNAT no estaba
      conectado.** El modal de emisión seguía con el texto de la Fase 0 ("el
      envío a SUNAT todavía no está conectado — ver SEE propio vs. OSE"), falso
      desde el 05-09 y apuntando a una decisión que ya no existe (es Lucode
      como PSE, ADR-0005). Corregido: ahora dice que Emitir reserva el número y
      que "Transmitir" es lo que lo manda. `ARQUITECTURA.md` repetía la misma
      afirmación y nunca había documentado `/api/lucode/emitir` ni
      `actualizar_transmision_comprobante` — agregados. El bloqueo real no era
      ese texto sino las variables de Lucode que faltan en Vercel (ítem propio
      más abajo, 2026-09-08).
      **PASO (a) HECHO 2026-09-09 — ADR-0015, el ambiente entra al comprobante.**
      `comprobantes.entorno_transmision` + `p_entorno` obligatorio en la RPC:
      un comprobante transmitido al sandbox ya no se guarda igual que uno real,
      y la pantalla lo dice ("Aceptado · prueba"). Cierra dos agujeros: el chip
      verde que no distinguía, y una nota de crédito real colgada de una boleta
      de prueba (`emitir_nota` solo exige que el original esté aceptado).
      **Falta correr el SQL:** `0040_comprobante_entorno_transmision.sql` en
      local (necesita Docker arriba) y `unificacion/23_...` en el SQL Editor de
      producción. Ojo al pegar: dropea la firma de 4 parámetros antes de crear
      la de 5, si se salta ese paso quedan dos sobrecargas.
      **Sigue (b):** variables de Lucode en Vercel — recomendado `LUCODE_TOKEN`
      en los tres ambientes pero `LUCODE_ENTORNO=produccion` SOLO en Production
      (sandbox en Preview y Development), para que ningún preview emita algo
      legal por accidente. **Sigue (c):** anulación dentro del sistema
      (`anularDocumentoLucode` ya existe en el adaptador, sin ruta ni botón, y
      la RPC rechaza `anulado` a propósito).
      **PASO (c) HECHO 2026-09-09 — ADR-0016, anulación dentro del sistema.**
      Ruta `/api/lucode/anular` + RPC `anular_comprobante` (solo líder, motivo
      obligatorio, `anulado_por`) + botón en la fila. Dos caminos según tipo,
      como exige SUNAT: `/api/v3/voided` para factura/notas,
      `/api/v3/daily-summary` con `accion_resumen: "anular"` para boletas
      (verificado en `docs.apisunat.pe/llms-full.txt`). "Anulado" solo se
      escribe con confirmación de SUNAT; si vuelve PENDIENTE la fila dice
      "Anulación en trámite". **Falta correr el SQL** (`0041_anular_comprobante.sql`
      local / `unificacion/24_...` producción) **y probar la llamada real en
      sandbox** — el nombre del campo `motivo` en /voided y la forma de la
      respuesta del resumen diario salen de la documentación, no de una
      respuesta real. Abierto: cerrar solo el ciclo de una anulación en trámite,
      y qué hacer con un correlativo reservado que nunca se transmitió.
      **Queda solo (b):** `LUCODE_TOKEN` y `LUCODE_ENTORNO` en Vercel —
      `produccion` SOLO en Production, `sandbox` en Preview y Development.
      **SQL DE (a) Y (c) CORRIDO Y PROBADO EN LOCAL 2026-09-09.** `db reset`:
      las 41 migraciones aplican en orden, las dos restricciones quedan
      `VALIDADO` y `actualizar_transmision_comprobante` tiene una sola firma
      (sin sobrecarga). Siete reglas probadas contra Postgres real. **Falta
      pegar en producción `unificacion/23_...` y `24_...`** (en ese orden; la
      24 depende de la 23), y probar la llamada real a Lucode en sandbox.
      **Hallazgo nuevo — el local de la app no es el local del repo:** corren
      dos stacks, `cayla-retail` (54421/54422) y `cayla-dynamic` (54321/54322),
      y `apps/web/.env.local` apunta al de Dynamic, cuyo schema `retail` no
      tiene `comprobantes`/`series_comprobantes`/`proformas`. Mientras siga
      así, ninguna pantalla de Facturación se puede verificar en navegador
      local. Decidir cuál de los dos es "el local" de este repo y dejarlo
      escrito — hoy `supabase db reset` administra uno y la app lee el otro.
      **CERRADO 2026-09-09 (final de la jornada):** ya no leen distinto —
      `apps/web/.env.local` dice `:54421` y el bundle que sirve el `:3000` vivo
      confirma `:54421`. "El local de este repo" es `cayla-retail`, escrito en el
      README y comprobable con `pnpm local:donde`.
      **(a) Y (c) EN PRODUCCIÓN 2026-09-09.** `unificacion/23` y `24` pegadas y
      verificadas: una sola firma de `actualizar_transmision_comprobante` (5
      args), las 6 columnas nuevas, `comprobantes_anulado_tiene_motivo` en
      VALIDADO. **Dos cosas quedan abiertas de esto:** (1)
      `comprobantes_transmitido_tiene_entorno` quedó NOT VALID porque
      producción tenía **B004-000002** (boleta S/10.00, aceptada 08-09, ambiente
      DESCONOCIDO) — mirar el panel de Lucode, escribir el ambiente real y
      recién ahí `validate constraint` (SQL exacto en ADR-0015); (2) la llamada
      real a Lucode de anulación sigue **sin probarse en sandbox**: el nombre
      del campo `motivo` en /voided y la forma de la respuesta del resumen
      diario salen de la documentación, no de una respuesta real.
      **Corrección al dato del backlog:** `retail.comprobantes` NO estaba vacía;
      la serie **B004 de TRU va por el número 3**, no el 2 que decía arriba.
      **(b1) HECHO 2026-09-09 — anulación PROBADA contra el sandbox real.**
      Encontró y corrigió dos bugs del adaptador que la documentación tapaba:
      ninguno de los dos endpoints acepta el cuerpo plano. Boleta va con
      `{documento:"resumen_diario", documentos_afectados:[…]}` y factura con
      `{documento:"comunicacion_baja", motivo, documento_afectado:{…}}`. Los dos
      devuelven PENDIENTE, así que "Anulación en trámite" es el camino normal
      de TODA anulación, no solo de boletas (ADR-0016).
      **BLOQUEO DE ORDEN, importante:** el deploy vivo llama a
      `actualizar_transmision_comprobante` con 4 argumentos y producción ya
      solo tiene la de 5. **No poner `LUCODE_TOKEN` en Vercel antes de
      desplegar el código**, o "Transmitir" mandaría el documento a SUNAT y
      fallaría al guardarlo. Orden: push → deploy → token.
      **Falta (b2):** `LUCODE_TOKEN` en Vercel, `LUCODE_ENTORNO=produccion` SOLO
      en Production y `sandbox` en Preview/Development.
      **Falta también:** cerrar el ciclo de una anulación en trámite
      (`consultarEstadoLucode` → promover a `anulado`); hoy queda en trámite
      hasta que alguien mire el panel de Lucode.
      **CICLO DE ANULACIÓN CERRADO 2026-09-09 — botón "Consultar".**
      `/api/lucode/consultar-anulacion` + botón en las filas en trámite:
      pregunta a Lucode y, solo si SUNAT confirmó, promueve a `anulado` con el
      motivo original. `interpretarEstadoAnulacion` es un lector propio porque
      Lucode usa un vocabulario aparte para la anulación (`ANULANDO`/`ANULADO`)
      y reusar el de emisión habría dejado toda baja en trámite para siempre.
      5 tests nuevos. **Falta desplegarlo** y apretar "Consultar" en
      B004-000003, que sigue en trámite desde las 11:58 del 09-09.
      **Sigue abierto:** `ANULADO` no se vio con los ojos todavía — solo
      `ANULANDO`. Confirmarlo cuando SUNAT cierre esa baja.
      **Fase 0.5 (tokens de diseño) — cerrada:** `packages/shared/src/
      design-tokens.ts` (espejo tipado de `globals.css`) y `TarjetaIndicador.tsx`
      construidos (dos sesiones paralelas llegaron al mismo archivo, byte por
      byte); radios corregidos a 0px en toda la app (brandbook pedía esquinas
      rectas, se habían desviado a 8-18px). `tsc` limpio.
      **Fase 2 (Egresos) — primera pantalla nueva construida y verificada en
      vivo:** `/finanzas/egresos` (antes no existía; los gastos solo se veían
      agregados dentro del EERR). Small multiples por sede (`TarjetaIndicador`
      × 5, siempre visibles), tabla de detalle con cifras tabulares. Probado en
      local (ADR-0010): un gasto de prueba en AQP solo movió esa tarjeta, las
      otras tres quedaron en S/0 — segmentación por sede real, no agregada. De
      paso: `RegistrarGastoModal`/`RegistrarGastoButton` nunca habían recibido
      el sistema de identidad CAYLA (usaban `bg-white`/`rounded-2xl` desde que
      se construyeron) — corregido; `METODOS_PAGO_GASTO` separado de
      `METODOS_PAGO` (mismo nombre, dos constraints reales distintos —
      `0013_finanzas_nucleo.sql` vs `0007_finanzas.sql`); `getGastos()` muerto
      en `lib/finanzas.ts` borrado (nadie lo llamaba). Falta: auto-sugerencia
      de categoría por texto (parte 2 de esta fase, no empezada).
      **Aparte, ya construido 2026-09-05 (ADR-0008):** verificación de cliente
      contra RENIEC/SUNAT antes de emitir (`packages/shared/src/documento.ts`,
      `apps/web/lib/padron.ts`, `ConsultaDocumento.tsx`) — encontró y corrigió
      2 bugs reales (middleware bloqueaba rutas de API, estado de tipo de
      documento desincronizado del tipo de comprobante).
      **Aparte, ya construido 2026-09-05:** `supabase/seed.sql` renombra
      `public`→`retail` después de migrar en local — el stack local nunca
      había podido correr con el mismo schema que producción hasta ahora.
      **Pendiente, sin bloquear el proyecto:** preguntarle al contador si
      CAYLA ya cruzó el umbral SIRE (75 UIT, ~S/412,500/año) — obligación
      distinta del PLE (300 UIT) que probablemente ya aplica hoy.
- [x] **LA RPC YA ESTÁ EN PRODUCCIÓN — verificado 2026-09-10.** `retail.crear_producto_con_variantes`
      existe con una sola firma, y la pantalla `/inventario/producto/nuevo` está
      desplegada. O sea que `unificacion/16` se pegó en algún momento y nadie lo anotó.
      **Lo único que queda de este item es manual y de Felipe:** crear un producto real
      con varias tallas/colores y confirmar que aparece en Catálogo. Texto original abajo:**
      **`crear_producto_con_variantes`: construido y verificado (build/lint,
      `next build` limpio) 2026-09-04 — falta que Felipe pegue la RPC en
      producción.** "Recibir mercadería" crea un `producto` nuevo por CADA
      ítem agregado con "+ Agregar prenda nueva": pedir la misma referencia
      varias veces (una por talla/color) dejaba varios productos duplicados
      en vez de un modelo con N variantes. Nueva pantalla
      `/inventario/producto/nuevo` (solo Líder): referencia + familia/
      categoría + chips de talla/color + matriz generada con precio/costo/
      SKU editable por fila → un solo INSERT a `productos` + N a `variantes`,
      sin tocar `stock`/`movimientos` (el modelo nace con 0 unidades hasta el
      primer lote real). Mismo patrón dual que `recibir_lote` (ADR-0004):
      versión local sin prefijo en `0033_crear_producto_variantes.sql`,
      versión schema-calificada para pegar en el SQL Editor de producción en
      `supabase/unificacion/16_crear_producto_variantes.sql`. **Pendiente:
      que Felipe pegue el archivo 16 en producción y cree un producto real
      (ej. varias tallas/colores) para confirmar que aparece en Catálogo** —
      cierra además la verificación que le faltaba a `almacen interno` de
      arriba ("que Felipe entre un producto real por la pantalla").
- [ ] **PROVEEDOR YA CONTRATADO — lo que queda es confirmar Vercel, 2026-09-10.**
      `apps/web/.env.local` tiene un `PADRON_TOKEN` real de `apisnetpe_v1`, así que la
      parte de "contratar" está hecha; y la BITÁCORA del 08-09 registra la consulta
      funcionando en producción (el fallo de ese día fue `apisnetpe` vs `apisnetpe_v1`,
      no falta de credencial). **Lo único abierto: confirmar que Vercel tenga
      `PADRON_PROVEEDOR=apisnetpe_v1` — con el `_v1`.** No pude verificarlo desde la
      sesión: el conector de Vercel devuelve 403 y hay que reautenticar el scope "cayla".
      Se comprueba en un segundo emitiendo en producción y escribiendo un DNI. Texto
      original abajo:**
      **`padrón RENIEC/SUNAT`: construido y verificado 2026-09-05 — falta que
      Felipe contrate un proveedor y ponga dos variables de entorno.** El modal
      de emisión ya lee el DNI/RUC y muestra a quién pertenece antes de emitir
      (nombre o razón social, y para RUC además estado y condición, porque una
      factura a un RUC de baja o "no habido" la rechaza SUNAT con el correlativo
      ya quemado). Adaptadores para tres proveedores intercambiables — ADR-0008.
      **Pendiente:** contratar `decolecta`, `apisnetpe` o `factiliza`, y poner
      en Vercel `PADRON_PROVEEDOR` (uno de esos tres nombres) y `PADRON_TOKEN`.
      Sin eso la pantalla funciona igual, avisando que la consulta automática no
      está activada y dejando escribir el nombre a mano. Reversible: sí (no
      toca el esquema).
- [x] **`la app nunca ha corrido contra el Supabase local` — RESUELTO
      2026-09-05 (ADR-0010).** Eran tres causas: healthchecks que abortaban
      `supabase start` entero, el schema `retail` que en local no existía, y
      `lib/persona.ts` sin reconocer el rol `lider`. Ahora `npx supabase start`
      + `pnpm dev` levanta la app completa contra local (instrucciones en el
      README). Verificado emitiendo una boleta real. Precio: Storage apagado en
      local — subir fotos de producto no funciona ahí.
- [ ] **La misma función de permiso se llama DISTINTO en local y en producción, y
      plpgsql no lo delata — 2026-09-10.** Local: `retail.fn_puede_operar_sede`.
      Producción: `retail.puede_operar_sede`, **sin el `fn_`**. Verificado en las dos
      bases. Los archivos están bien escritos: 20 de `migrations/` usan la versión con
      `fn_` y 17 de `unificacion/` la de sin — nadie se equivocó todavía.
      **Por qué es una trampa y no una curiosidad:** el cuerpo de una función plpgsql
      NO se resuelve al crearla, solo al ejecutarla. O sea que copiar un gemelo al otro
      —el gesto más natural del mundo cuando escribes el par— produce un
      `create or replace` que **corre en verde** y revienta la primera vez que alguien
      la usa, con "function does not exist" y la clienta esperando. `migraciones:verificar`
      tampoco lo ve: comprueba que la función exista por nombre, no a quién llama por
      dentro. Hoy casi muerde al aplicar la `33`: el archivo dice
      `retail.puede_operar_sede` y en local eso no existe, lo que parece un error y no
      lo es.
      Arreglo de fondo: renombrar en producción para que los dos lados digan lo mismo
      (con un alias temporal que llame al nuevo, para no romper las 17 que ya la
      nombran). Arreglo barato mientras tanto: que `migraciones:verificar` extraiga los
      nombres que llama cada cuerpo y los cruce contra el inventario — es la misma idea
      que ya tiene, un nivel más adentro.

- [ ] `migraciones duales (local sin prefijo / producción con prefijo retail.)`:
      la causa raíz de ADR-0004 y ADR-0006 sigue viva — cada cambio de esquema
      se escribe dos veces y las dos copias se desincronizan. Ahora que el local
      corre en el schema `retail` (ADR-0010), la ruta para matarlo es más corta:
      escribir las migraciones una sola vez, ya calificadas. Requiere revisar
      las 32 funciones con `set search_path` y las vistas puente sobre dynamic.
      No urgente, pero es la deuda que más caro ha salido hasta hoy.
- [ ] `produccion — insumos del taller`: la receta de costo (`0024`-`0029`) calcula
      con tela+avíos como costo directo declarado a mano, pero sigue sin inventario
      real de materia prima (decisión de julio: "insumos después"). Sin esto, el
      Taller no sabe cuándo se queda sin tela hasta que pasa. Depende de: decidir
      con Felipe si ya toca retomarlo o sigue postergado. Reversible: sí.
- [ ] `local-first de lecturas (Fase 2 del ADR-0013)`: replicar catálogo, stock,
      precios y sedes al navegador para que las pantallas pinten en 0 ms y la tienda
      siga operando con el wifi caído. Lo hace inusualmente viable el volumen: el
      negocio entero pesa <1 MB hoy y ~1-2 MB con 5.000 variantes — entra completo en
      IndexedDB. **Las escrituras NO se replican**: venta, movimiento y recepción
      siguen pasando por los RPC, `movimientos` sigue siendo la única fuente de verdad
      (principio 4). Escrituras local-first sin arbitraje dejarían el stock en −1
      cuando dos sedes venden offline la misma última unidad — rompe el principio 2.
      Regla de negocio ya decidida por Felipe (2026-09-09): la venta offline se permite
      **solo con stock de sobra**; si es la última unidad, bloquea. Falta definir con
      él el umbral exacto de "de sobra" y qué ve la Encargada cuando se bloquea.
      **Depende de Fase 0 y Fase 1** — sin eso, la primera carga sigue cruzando a
      Washington igual. Tendrá su propio ADR con el motor de sincronización elegido.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [x] **`docs/datos/generado/` estaba desactualizado desde media tarde del 17-sep —
      `pnpm datos:comparar` marcaba 3 pantallas "rotas en producción" que en
      realidad funcionan bien. Refrescado y confirmado 2026-09-17 (noche).** El
      volcado (`funciones-produccion.txt` y los 6 `retail_*.json`) tenía fecha
      15:26 (commit del PR #93, "revoca EXECUTE público"), de antes de que
      aterrizaran ADR-0093 (`marcar_comprobante_no_emitido`) y ADR-0095
      (`actualizar_categoria_ejes`, `actualizar_variantes_etiquetas`) — las 3
      funciones que el comparador marcaba como inexistentes. Antes de alarmar con
      "3 pantallas rotas", se verificó **contra producción de verdad** (MCP de
      Supabase, `vovjyyiafkxteijimpuy`, consulta de solo lectura envuelta en
      `begin transaction read only`): las 3 funciones existen — era la foto, no el
      código. Se volvió a pedir el volcado completo (los 7 queries de
      `COMO-REFRESCAR.md`) y se regeneró el diccionario:
      `pnpm datos:comparar` ahora sale limpio ("Ninguna pantalla llama a una
      función con parámetros que producción no acepte"). De paso salió a la luz
      que producción creció de 45 a **60 tablas** desde la última foto del 12-sep
      — coherente con la cantidad de PRs fusionados hoy (Taxonomía ADR-0095,
      Familias/categorías ADR-0096, Revocar EXECUTE ADR-0078, etc.). El propio
      `docs/CLAUDE.md` ya no necesita corrección: dice explícitamente que el
      conteo vivo está en este diccionario, no hardcodeado ahí.
      **Sin tocar (deuda que sigue viva, no la agrandé ni la until):**
      `glosario.json` solo explica 425 de 586 columnas — las nuevas de hoy (Loro,
      taxonomía, EXECUTE) quedan con "Para qué sirve" vacío hasta que alguien las
      documente a mano; 21 de las 60 tablas quedan "sin módulo" en
      `DICCIONARIO-RETAIL.md` (la lista `DOMINIOS_RETAIL` de `generar.mjs` no se
      actualizó desde el 15-sep). Ninguna de las dos bloquea nada, son mapas
      quedando cortos, no código roto.
- [ ] **`ARQUITECTURA.md:106-119` describe un `/inventario` que ya no existe —
      encontrado 2026-09-17 de rebote, verificando a dónde debía apuntar el alias
      `/almacen`.** El doc dice `/inventario/almacen` → `AlmacenStockList.tsx`,
      `/inventario/compras` → `ComprasManager.tsx`, `/inventario/proveedores` →
      `ProveedoresManager.tsx`, `/inventario/etiquetas` → `EtiquetasGenerator.tsx`, y
      `/inventario` → `InventarioAgrupado.tsx`/`MovimientoModal.tsx`. Ninguno de esos
      cinco componentes existe hoy en el repo (`grep -r` da 0 resultados) y ninguna de
      esas cuatro sub-rutas existe como carpeta bajo `app/(app)/inventario/`
      (`git log` ubica el reemplazo real en `52882ff`, "integra las 4 vistas de
      Felipe", 2026-09-16, ADR-0071 — que dejó `/inventario` como una sola vista con
      piso+almacén juntos, `lib/inventario-v2.ts`). Probablemente son restos de la
      arquitectura V1 que el corte `0af2f1b` (V1→V2) no terminó de limpiar en este
      doc. Efecto concreto ya confirmado: el stub `redirect("/inventario/almacen")`
      de `almacen/page.tsx` apuntaba a un 404 desde el 2026-09-16 sin que nadie lo
      notara — ver ✅ CERRADO de hoy. No se tocó el resto del bloque (106-123):
      corregirlo bien pide releer todo `/inventario/*` y `/compras/*` contra el
      código real (`/compras/proveedores` sí existe hoy, así que probablemente ahí
      se movió esa pieza) — más ancho que esta sesión, que solo tenía permiso sobre
      `next.config.ts` y los dos archivos de `almacen/`.
- [ ] **`stock.sububicacion_id` en NULL en las tres sedes, en el Postgres local
      compartido — detectado 2026-09-16 verificando ADR-0063.** `retail.sububicaciones`
      tiene sus 6 filas intactas (2 piso_venta, 2 almacen_tienda, 2 rack), pero
      `select count(*) from retail.stock where sububicacion_id is not null` da **0**
      sobre 96 filas, en Lima, Trujillo y Taller — probablemente otra de las ~27
      worktrees reseeded `stock` (un `supabase db reset` u otro script) sin su backfill
      de piso/almacén. Efecto: **toda** venta contra este Postgres local se rechaza con
      "Stock insuficiente: hay 0…", incluso el ítem "Monto manual"
      (`ID_CARGO_ESPECIAL`), online u offline — no es un bug de una pantalla, es el
      dato. No se tocó (no es de esta sesión arreglarlo ni está claro cuál es el
      backfill correcto sin mirar cómo se pobló originalmente); quien lo vea de nuevo,
      confirmar con esa misma consulta antes de sospechar de su propio código.
- [ ] **`ComprobantesPanel.tsx`: "Monto facturado" suma TODOS los comprobantes del
      mes, sin importar el estado — encontrado 2026-09-16 al rehacer los tiles del
      resumen, no es de esta sesión.** `totalMes` (`ComprobantesPanel.tsx`, `const
      totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0)`) suma
      pendientes, rechazados, anulados y hasta comprobantes de **prueba** (sandbox,
      que la propia pantalla explica que "no vale como comprobante de pago"). Un
      rechazo o una anulación no fueron una venta facturada; un comprobante de
      prueba nunca lo fue. Pregunta de negocio, no técnica: ¿"Monto facturado" debe
      contar solo `aceptado` + `entorno_transmision='produccion'`? No lo cambié sin
      confirmar contigo qué debe significar la cifra.
- [ ] **Facturación: "Ventas de hoy" no conecta con "Emitir comprobante" — con
      Felipe, pospuesto 2026-09-16 (se hicieron los ítems 2, 3 y 4 de la misma
      auditoría, este no).** Hoy hay que mirar el monto en `VentasDelDiaPanel` y
      volver a tipearlo a mano en el modal de `ComprobantesPanel` — dos pantallas
      para un solo dato. `retail.emitir_comprobante` ya acepta `p_venta_id`/
      `p_items` en producción; `ComprobantesPanel.tsx:215-224` no los manda. Falta
      levantar el estado del modal "emitir" a un componente cliente que envuelva a
      los dos paneles hermanos (hoy conviven sueltos en `facturacion/page.tsx`).

- [x] **Correlativo reservado que nunca se transmitió — mecanismo RESUELTO 2026-09-17
      (ADR-0093), aplicado en producción.** `emitir_comprobante` reserva el
      número oficial ante SUNAT en el mismo instante en que se guarda el comprobante —
      antes de transmitir. Si nadie aprieta "Transmitir" después, ese número quedaba
      `estado='pendiente'` para siempre sin salida. Felipe decidió "liberar sin espera":
      ahora existe `retail.marcar_comprobante_no_emitido` (solo líder, motivo
      obligatorio, nunca toca SUNAT/Lucode — el número queda sin usar para siempre, nunca
      se reutiliza) y un botón "Liberar sin espera" en `ComprobantesPanel.tsx`, junto a
      "Transmitir" cuando `estado='pendiente'` (`rechazado` queda afuera a propósito: ya
      se transmitió, su única salida sigue siendo reintentar). **Migración
      `20260917130050_comprobante_no_emitido.sql` pegada en producción el 2026-09-17**
      (ok explícito de Felipe, excepción puntual a D-11) — `comprobantes_estado_check`/
      `comprobantes_transmitido_tiene_entorno` tenían el mismo nombre allá que en local,
      confirmado antes de aplicar. Los 2 casos reales de producción de abajo siguen sin
      liberarse (nadie apretó el botón nuevo todavía) — igual, ambos siguen mostrando
      `puedeTransmitir=true`, así que Felipe también podría simplemente reintentar
      "Transmitir" sobre ellos si prefiere esa vía. Confirmado en `retail.comprobantes`:
      **B004-000004** (S/655.50, sin cliente, creado 2026-09-14) y **B004-000005**
      (S/185.30, con cliente, creado
      2026-09-15) — dos correlativos oficiales ya quemados ante SUNAT, ninguno transmitido
      ni recuperable desde la pantalla. Pregunta de negocio para Felipe, no técnica: ¿se
      puede anular sin avisarle a SUNAT (nunca salió de acá, no hay nada que darle de baja
      allá — sería un camino nuevo, más simple que el de ADR-0016, no el mismo)? ¿Hay un
      plazo razonable antes de tratarlo como abandonado? Mientras no se decida, cada
      "Emitir" que alguien no transmite quema un número de la serie sin remedio.

- [x] **RESUELTO 2026-09-09. Ahora corre 3 tareas y encontró 1 error real el primer día.**
      `"typecheck": "tsc --noEmit"` en los tres paquetes y la tarea declarada en
      `turbo.json`. Estado al encenderlo: `apps/web` **0 errores** y `packages/shared`
      **0** —estaban limpios porque `next build` ya los tipaba—, y
      `packages/database` **1**: `client.ts:12` usa `process.env` sin `@types/node`
      (TS2580). Invisible desde que existe el paquete, porque `apps/web` lo compila con
      SU tsconfig, que sí tiene los tipos de Node. Arreglado agregando la dependencia,
      que es lo que el paquete de verdad necesita.
      **Dos detalles sin los cuales el gate no sirve, y los dos costaron una corrida
      cada uno:** (1) SIN `dependsOn: ["^typecheck"]` — `apps/web` tipa leyendo el
      código FUENTE de los paquetes, no un artefacto construido, así que encadenarlos
      solo hace que el primer paquete roto cancele los demás y esconda el resto; (2)
      CON `--continue` en el script de la raíz — turbo, por defecto, cancela lo que
      falta en cuanto algo falla, y un gate tiene que dar la lista completa en un solo
      viaje. Con los dos puestos, dos errores plantados a propósito (uno en `web`, otro
      en `shared`) salieron **los dos** en la misma corrida, con salida 2.
      **Probado en rojo antes de creerle al verde** — un gate que nunca se vio fallar no
      es un gate. Cuesta 5 s en frío y **39 ms cacheado** (`FULL TURBO`), o sea que es
      barato de correr antes de cada push.
      **Lo que sigue abierto y no es este item:** no hay CI (`.github/workflows/` no
      existe), así que nada obliga a correrlo; y `apps/web/tsconfig.json` incluye
      `.next/types/**`, que solo existe después de un `build`/`dev` — en un clon limpio
      los tipos de ruta de Next no se verifican. Ninguna de las dos cosas convierte el
      verde en mentira, pero conviene saber qué NO cubre.
      **LAS DOS CERRADAS EL MISMO DÍA (2026-09-10), `.github/workflows/ci.yml`:** el CI
      corre `typecheck` + `lint` + `test` en cada push a main y en cada PR, así que ya no
      depende de que alguien se acuerde; y el agujero de los tipos de ruta se tapó con
      `next typegen` (3,5 s, genera `.next/types/` sin construir), de modo que el clon
      limpio del CI verifica lo mismo que la máquina de Felipe. Texto original abajo:**
      **`pnpm typecheck` no verifica NADA — corre 0 tareas y sale en verde.** El
      script existe en el `package.json` de la raíz (`turbo run typecheck`), pero
      ningún paquete del workspace define esa tarea, así que turbo responde
      *"No tasks were executed as part of this run · 0 successful, 0 total"* y
      termina con éxito. Encontrado el 2026-09-09 usándolo como gate antes de
      pushear: da exactamente la falsa confianza que ADR-0026 describe para el
      verificador de migraciones (*"un verificador que aprueba lo que no entendió
      es peor que no tenerlo: enseña a confiar en un verde vacío"*). El único
      gate real hoy es `pnpm build`, que sí tipa (`next.config.ts` **no** tiene
      `ignoreBuildErrors`) y tarda ~21 s. Arreglo: agregar `"typecheck": "tsc
      --noEmit"` a `apps/web` y a los dos paquetes, y declarar la tarea en
      `turbo.json`. Barato, y convierte un verde mentiroso en uno que significa
      algo.
- [x] **Streaming en las 10 pantallas: hecho y verificado, con resultado NEGATIVO en
      tiempo — 2026-09-09, ADR-0021.** Funciona mecánicamente (el HTML trae el esqueleto
      y llega en 3 trozos), pero **no movió los tiempos**: TTFB 131→124 ms y carga total
      750→730 ms, dentro del ruido. La razón: entre el primer byte y el HTML completo solo
      hay ~100 ms, así que había poco que repartir. Se mantiene porque cambia QUÉ se ve
      durante la espera (estructura en vez de "Cargando…"), no por velocidad. **No volver
      a proponer streaming como solución de rendimiento en este repo.**
- [x] **Auditoria de lecturas silenciosas: CERRADA el 2026-09-09.** Se paso de **20
      consultas que descartaban el error de Supabase a 1**, y esa es deliberada (la memoria
      de conveniencia del padron: si falla, queda preguntarle al padron -- degradarse a la
      ruta lenta es correcto, tumbar la consulta por un cache frio no). `lib/resultado.ts`
      tiene los tres comportamientos con la regla escrita para elegir: `exigir()` cuando un
      numero equivocado ES una decision equivocada, `exigirOpcional()` para los
      `.maybeSingle()` donde "no hay fila" es respuesta legitima pero un error no, y
      `tolerar()` para lo secundario. Las barreras `(app)/error.tsx` y `global-error.tsx`
      quedaron verificadas en vivo el mismo dia.
      **CORRECCIÓN Y CIERRE 2026-09-09 (barrido sobre TODO `apps/web`):** ese "de 20 a 1" era
      correcto **para la lista que auditó** —la que este BACKLOG nombraba—, pero el patrón
      seguía vivo fuera de ella: 52 destructuraciones `{ data: x }` sin `error`, en 16 archivos.
      **Cerradas las 52 el mismo día.** Queda 1, la del padrón, deliberada y explicada en su
      propio código. Lo que alimentaban las que importaban:
      · `lib/finanzas-nucleo.ts` (13) — EERR, cuadre de efectivo, comparativo, patrimonio.
        `getEERRMensual` (`:48`) hace `(ventasData ?? []).forEach(...)`: si la consulta de
        `ventas` falla, el Estado de Resultados dibuja **S/0 en ventas** con cara de
        normalidad. Es, literalmente, el ejemplo que `lib/resultado.ts` usa en su cabecera
        para explicar por qué existe.
      · `lib/contabilidad.ts` (8) — Balance, Flujo de Efectivo, Cambios en el Patrimonio.
      · `lib/pendientes.ts` (4) — la bandeja del Inicio. Su diseño se apoya en que "el valor
        del bloque está en cuándo NO aparece"; si la consulta falla, no aparece, y eso se
        lee como "todo al día". La forma más cara de mentir que tiene el sistema.
      · `lib/panel.ts` (2), `lib/egresos.ts` (2), `lib/actividad.ts` (2),
        `lib/inteligencia.ts` (1), y 5 pantallas más.
      Verificadas y descartadas como falsos positivos: los tres `auth.getClaims()` (si falla,
      no hay sesión y la ruta redirige al login) y `FotoProducto:54` (`getPublicUrl` arma una
      URL en memoria, no devuelve error).
      **Cómo se resolvió cada una.** `exigir()` en todo lo que alimenta una decisión de plata o
      de stock — que resultó ser casi todo. Dos excepciones razonadas:
      · `lib/pendientes.ts` — `exigir` habría tumbado el Inicio entero por una de cinco
        consultas de un bloque secundario, pero `tolerar` a secas tampoco servía: esa bandeja
        **se esconde** cuando no hay nada que hacer, así que una consulta caída se vería igual
        que un día tranquilo. El silencio es su estado normal, y por eso ahí miente mejor que
        en ninguna otra parte. Se resolvió metiendo el fallo A LA BANDEJA como un pendiente
        más ("Esta bandeja está incompleta"): no poder leer tu cola de trabajo es, literalmente,
        algo que atender — y no hizo falta tocar la pantalla.
      · `producto/[varianteId]` — `exigirOpcional()` en las tres consultas que solo corren para
        el Líder: el respaldo llega en `null` a propósito y lo que no puede pasar callado es un
        error, que es la distinción exacta que ese ayudante existe para hacer.
      **El hallazgo más feo, de paso:** `inventario/recibir` derivaba `contenedorAlmacen` de una
      consulta sin revisar. Si fallaba, la pantalla decía «tu sede no tiene un almacén
      configurado» — un mensaje FALSO que manda a configurar lo que ya estaba, con el fardo
      abierto en el mostrador. Un error se entiende; ese mensaje engaña.
      Regla para elegir, la misma de siempre: ¿alguien puede tomar una decisión de negocio
      mirando ese dato? Si sí, `exigir()`.
- [ ] **No hay ninguna pantalla para dar de alta un activo fijo.** `finanzas/activos/page.tsx:54`
      solo LEE `activos_fijos`; ningún componente del repo escribe esa tabla, así que los
      activos entran hoy a mano por SQL. Encontrado el 09-09 al hacer accionables los estados
      vacíos: el de esa pantalla no podía nombrar dónde se resuelve porque no se resuelve en
      ningún lado. Por ahora el texto lo dice tal cual, que es preferible a inventar un botón.
      Cuando toque, el patrón ya existe: `PatrimonioEditor` («+ Agregar partida») hace
      exactamente esto para las partidas de patrimonio.

- [x] **RESUELTO 2026-09-09 — ningún componente del repo muestra ya el error crudo de
      Postgres al escribir.** `traducirError` (ADR-0022) quedó en los 31 sitios de escritura
      de los 17 componentes; el grep de `error.message` fuera de `lib/error-escritura.ts`
      no devuelve nada. De paso aparecieron **dos escrituras que se tragaban el error
      entero** —`ComprasManager.cancelar` y `RecetaCosto.quitarItem`, ambas
      `if (!error) router.refresh()`—: se tocaba el botón, no pasaba nada y nadie se
      enteraba. Es la misma falla que `lib/resultado.ts` arregló del lado de la lectura,
      viva del lado de la escritura.
      **Lo que queda de esto, y es la parte que ninguna prueba puede cerrar:** provocar el
      error de cada pantalla a propósito para saber si la frase sirve de verdad. El
      traductor garantiza que no salga inglés; no garantiza que la frase oriente.
      **Sospecha concreta:** `FotoProducto` no habla con Postgres sino con Supabase
      Storage, así que sus errores (archivo muy pesado, sobre todo) caen al fallback con
      "Código:". No se inventó una huella para eso porque nadie ha visto el texto real —
      cuando alguien suba una foto demasiado grande, se copia el mensaje y se agrega a
      `HUELLAS` **con su prueba** en `lib/error-escritura.test.ts`.

- [x] **RESUELTO — verificado en vivo con la pistola Zebra el 2026-09-09 por Felipe: nada falló.** Lo construido el 09-09
      (escaneo dentro del modal de venta, Enter que ya no registra la venta a medio
      escaneo, tope contra el stock de la sede, acuse con el monto) pasa build, lint,
      tsc y 77 pruebas, **pero no se pudo probar en el navegador**: el layout redirige al
      login y no corresponde que Claude escriba la contraseña. Hay que hacerlo con la
      pistola real, no simulando el tecleo. Felipe lo probó y confirmó que nada falló: el
      escaneo agrega la prenda, dos escaneos seguidos no cierran la venta, y el tope contra
      el stock de la sede frena con el número.
      **Lo que NO se hizo, y se decidió no hacer:** cronometrar a una persona nueva. Sin ese
      número, "facilidad de aprendizaje" —la dimensión del apartado D que esta tanda de
      trabajo vino a cerrar— sigue sin línea base contra la cual comparar la próxima vez.

- [x] **RESUELTO — `recalcular_stock()` aplicada y verificada en producción
      2026-09-09 (ADR-0020). Encontró 2 filas desincronizadas el primer día;
      las 10 filas de stock siguen siendo 10 y todas tienen movimientos
      detrás, así que corrigió cantidades sin borrar nada (eran SKUs de prueba
      de la unificación, no catálogo real). Queda una lección de procedimiento
      registrada en el ADR: la verificación usaba `create temporary table` y el
      SQL Editor de Supabase la destruye entre ejecuciones, así que se supo que
      había 2 diferencias y ya no hubo con qué compararlas. Corregido en
      `unificacion/25`. Texto original abajo:**
      **`recalcular_stock()` arreglada en local, SIN PEGAR EN PRODUCCIÓN —
      2026-09-09, ADR-0020.** La red de seguridad del inventario
      (ARQUITECTURA.md §4.2) nunca pudo correr en una base con ventas: Postgres
      evalúa los CHECK sobre la fila propuesta antes de resolver el
      `on conflict`, así que la fila negativa moría antes del update.
      `supabase/migrations/0042_recalcular_stock_neto.sql` aplicada y verificada
      en local (0 diferencias contra el stock calculado aparte).
      **Falta que Felipe pegue `supabase/unificacion/25_recalcular_stock_neto.sql`
      en el SQL Editor de producción** y corra las dos verificaciones que trae al
      final. Ojo con la segunda: si devuelve algo distinto de 0, no es que el
      arreglo esté mal — es que `stock` y `movimientos` ya estaban
      desincronizados y la red hizo su trabajo por primera vez.

- [x] **YA NO — verificado 2026-09-09.** `supabase/migrations/0044_almacen_interno.sql`
      la crea en local; la base de este repo tiene `retail.stock_almacen`. La entrada
      quedó vieja: describe el estado de antes de la 0044. (Lo que sigue siendo cierto
      del párrafo es el patrón de migraciones duales, no este caso.) Texto original:**
      **`retail.stock_almacen` no existe en local — 2026-09-09.** Solo la crea
      `supabase/unificacion/12_almacen_interno.sql`, que es de producción;
      ninguna migración de `supabase/migrations/` la tiene. `lib/catalogo.ts`
      la consulta sin revisar el error, así que en local devuelve `{}` en
      silencio: el almacén se ve vacío y "Recibir mercadería" / "Bajar a tienda"
      no son verificables en local. Cuarto caso del patrón de migraciones
      duales (con ADR-0004, ADR-0006 y las categorías). Es también lo que
      impide verificar la línea "Incluye S/X en almacén" del Inicio sin
      producción.

- [x] **RESUELTO 2026-09-09 — y el arreglo no fue apagar un stack, fue construir el
      instrumento.** Los dos Supabase locales son legítimos y los dos se quedan: son
      dos repos distintos (`cayla-retail` 54421 / `cayla-dynamic` 54321). Apagar el de
      Dynamic rompería el otro proyecto. Lo que se hizo: (1) el `.env.local` de la raíz
      salió del repo (archivado fuera; se regenera con `vercel env pull` si alguna vez
      hiciera falta) — nada lo leía: no hay `dotenv`, ni `globalDotEnv` en `turbo.json`,
      ni uso de OIDC, o sea que era solo una pista falsa a la mano; (2) `pnpm local:donde`
      (`scripts/local/donde-estoy.mjs`) contesta en un segundo qué stacks corren, cuál
      declara `config.toml`, cuál leerá la app —detectando el caso feo, la variable
      exportada que le gana al archivo— y qué puerto trae de verdad el bundle del `:3000`
      vivo, abriendo los chunks, que es donde Next inlinea `NEXT_PUBLIC_*` (en el HTML no
      está: por eso la primera versión del check salía muda); (3) la tabla de puertos
      abre la sección de Desarrollo del README. **El dato que faltaba en el diagnóstico
      original:** la base de Dynamic también tiene schema `retail` —28 tablas contra las
      36 de acá, le faltan `comprobantes`, `conteos`, `colores`, `stock_almacen`,
      `proformas`, `series_comprobantes`, `codigos_barras`, `codigos_correlativos`—, así
      que el puerto equivocado no falla, miente a medias. Eso es lo que convierte el
      error en una hora. Probado en los dos caminos: en verde, y forzando el puerto malo.
      Texto original abajo:**
      **Dos `.env.local` y uno de ellos con basura — 2026-09-09.** El de la raíz
      tiene `NEXT_PUBLIC_SUPABASE_URL="[SENSITIVE]"` y la clave igual: restos de
      un `vercel env pull` del 08-09 (cuando una variable es *Sensitive* en
      Vercel, el CLI no la puede descifrar y escribe ese literal). Hoy no rompe
      nada porque Next lee el de `apps/web`, pero hizo perder media hora de
      diagnóstico en esta sesión. **Peor todavía:** el servidor de desarrollo
      tiene `NEXT_PUBLIC_SUPABASE_URL` exportada en su terminal, y en Next eso le
      gana al archivo — `apps/web/.env.local` dice `:54321` (stack local de
      dynamic) y la app en realidad habla con `:54421` (stack local de retail).
      Mínimo viable: borrar el `.env.local` de la raíz y dejar en el README qué
      puerto es cuál.

- [x] **RESUELTO 2026-09-09 (pasos 5 y 6 del Inicio). La causa no era el `if`:
      era que el CÓDIGO de sede no sirve para decidir nada y cada pantalla lo
      re-deducía. `PersonaActual` expone ahora `sedeTipo` y los tres sitios leen
      de ahí. De paso el Taller dejó de ver "Vender" (no tiene caja ni piso) y
      el pie del menú dejó de llamarlo "Encargada". Texto original abajo:**
      **`esTaller === "TALLER"` esconde Producción en producción — 2026-09-09.**
      `AppShell.tsx:216` y `mas/page.tsx:10` detectan el Taller por código de
      sede, pero tras la unificación la sede del Taller se llama **`LIM`**
      (`unificacion/01_sedes.sql:35` la mapea a `tipo='fabrica'` justamente
      porque su código no es TALLER). Hoy, en producción, la persona del Taller
      no ve el enlace a Producción en ningún lado. `packages/shared/src/enums.ts:5`
      también quedó viejo (lista `TALLER`, le faltan `003` y `CCO`). Arreglo:
      detectar por `tipo === 'fabrica'`. Va en el paso 6 del plan del Inicio.

- [x] **Fase 0 de latencia: DESPLEGADA Y VERIFICADA EN PRODUCCIÓN el 2026-09-09.**
      La función corre en `gru1` (São Paulo): confirmado con `x-vercel-id: iad1::gru1::…`
      — dos segmentos, el segundo es dónde ejecuta. Las mediciones anteriores daban un
      solo segmento porque las respondía el proxy en el borde sin llegar a la función.
      Pantalla con sesión: TTFB 124 ms, carga total 730 ms. **Registro original abajo,
      por si hay que rediscutirlo:** Lo único que queda
      es `git push` (hoy hay 6 commits sin subir, 3 de otras sesiones — no se
      empujaron para no desplegar trabajo ajeno sin su visto bueno) y después
      confirmar con `curl -sI <dominio>/login | grep -i x-vercel-id`: si dice
      `gru1`, la región tomó; si sigue diciendo `iad1`, el Root Directory del
      proyecto no es `apps/web` y hay que mover `vercel.json` a la raíz o fijar
      la región desde el panel (Settings → Functions). **Medir el TTFB antes y
      después de cada cambio por separado; el que no supere el ruido se revierte.**
      Lo aplicado: (1) `apps/web/vercel.json` con `regions: ["gru1"]`;
      (2) `Promise.all` en `getEstadoResultados` y `getDiarioCaja`, y `sedes`
      pasó a salir de `getSedes()` cacheado — esa consulta desaparece, no se
      paraleliza; (3) `getUser()` → `getClaims()` en `middleware.ts` y
      `lib/persona.ts`. **El riesgo que se temía en (3) no existía:** el proyecto
      ya firma con ES256 asimétrica (verificado en el JWKS), así que la validación
      es local con WebCrypto y no hubo que tocar auth en producción.
      Diagnóstico original, por si hay que rediscutirlo: Diagnóstico medido: la base
      responde en **0.862 ms** (19 variantes, 28 movimientos, <1 MB de schema) y el
      sistema tarda ~2 s. Todo el tiempo es red. `X-Vercel-Id: iad1::…` confirma que
      la función corre en Washington D.C. contra Supabase en `sa-east-1`; una página
      **estática ya cacheada** tarda 430 ms de TTFB desde Perú. Encima, cada
      navegación hace 4 viajes secuenciales, dos de los cuales son el mismo
      `auth.getUser()` pedido dos veces (`middleware.ts:31` y `lib/persona.ts:52` —
      el `cache()` de React no cruza entre middleware y render). Los tres pasos, en
      orden de riesgo creciente: (1) mover la función a `gru1`; (2) `Promise.all` en
      `getEstadoResultados` (`lib/finanzas.ts:150-172`, 5 consultas independientes en
      fila india) y `getDiarioCaja` (3 más); (3) claves JWT asimétricas +
      `getClaims()` para matar el `getUser()` duplicado — este último toca auth en
      producción, va al final y con los otros dos ya verificados. **Medir antes y
      después de cada uno por separado; el que no supere el ruido se revierte.**
      Falta confirmar si `iad1` fue decisión o default: el token de Vercel da 403
      sobre el scope `cayla`.
- [ ] **No hay forma de saber qué archivos de `supabase/unificacion/` están
      aplicados en producción — 2026-09-08.** Se descubrió que `20`, `21` y
      `22` nunca se habían pegado, y solo porque una pantalla se rompió
      ("Could not find the function ... in the schema cache" al registrar una
      serie). Ya aplicadas y verificadas, pero el problema de fondo sigue: el
      historial de migraciones de Supabase no conoce esta carpeta. El ítem de
      categorías de aquí abajo muestra el otro lado del mismo problema: se
      arregló y nadie lo supo hasta que se contó a mano hoy. Salió barato
      porque `comprobantes` y
      `series_comprobantes` estaban vacías. Mínimo viable: un script que
      compare las funciones/columnas que cada archivo promete contra
      `pg_proc`/`information_schema` y liste lo que falta.

- [x] **RESUELTO — Felipe puso las variables el 2026-09-08 por la noche, y
      nadie lo anotó (otra vez el ítem de "no sabemos qué está aplicado").**
      Verificado 2026-09-09 con `vercel env ls`: `LUCODE_TOKEN` y
      `LUCODE_ENTORNO=produccion` existen en Production desde hace 19h, y el
      token es el mismo que el de `apps/web/.env.local`. El deploy transmite:
      **B004-000002 (08-09 17:35) y B004-000003 (09-09 11:57) salieron de ahí**,
      no de la computadora de Felipe. La segunda ya trae
      `entorno_transmision='produccion'` escrito, o sea que corrió contra la RPC
      de 5 argumentos del código desplegado a las 11:50 — circuito completo
      verificado en producción. Texto original abajo, como se escribió el 08-09:
      *"Producción no tiene LUCODE_TOKEN ni LUCODE_ENTORNO. El botón Transmitir
      responde sin_credenciales en el deploy; facturar a SUNAT solo funciona
      desde el npm run dev de Felipe."*
      **Sigue pendiente y es de seguridad:** el token nunca se rotó pese a haber
      pasado por el chat el 05-09, y es el MISMO que ahora vive en Vercel.
      Rotarlo en app.apisunat.pe → Organizaciones, y actualizar los dos lugares
      (Vercel y `apps/web/.env.local`).

- [x] **RESUELTO (verificado 2026-09-08: `select count(*)` devuelve 37 filas,
      por encima de las 30 esperadas). Se aplicó en algún momento entre el
      05-09 y hoy sin que nadie lo anotara — que es justo el ítem de arriba.
      Texto original abajo, como quedó registrado el 2026-09-05:**
      `retail.categorias` le faltan 25 de 30 filas en producción (mismo
      patrón que ADR-0004/ADR-0006, sin arreglar todavía) — encontrado por
      Felipe en vivo, 2026-09-05. `04_catalogo.sql` (paso 4 de la
      unificación) recreó la tabla desde cero pero nunca insertó la semilla
      de `0009` — solo las 5 filas de `0030_categorias_captura_real.sql`
      (pegadas después) existen hoy. "Blusas" y otras 14 de indumentaria más
      todo calzado/accesorios/bisutería/belleza/papelería faltan. Migración
      lista en `supabase/unificacion/19_categorias_completas.sql`
      (`on conflict do nothing`, segura de correr), **falta que Felipe la
      pegue en el SQL Editor**. Sin esto, "Recibir mercadería" y "Nuevo
      producto" no pueden clasificar la mayoría del catálogo real.
      Reversible: sí, son datos (insert aditivo).
- [x] **`patrimonio_items.categoria`: arreglado y confirmado en producción
      2026-09-05 (ADR-0006) — cerrado.** La unificación de julio copió
      `patrimonio_items` desde la migración `0013`, antes de que `0019` le
      agregara `categoria`; `PatrimonioEditor.tsx` inserta esa columna en cada
      ítem, así que agregar un ítem de patrimonio llevaba roto en producción
      desde julio sin que nadie lo notara. Felipe pegó
      `supabase/unificacion/15_patrimonio_categoria.sql` y confirmó con la
      consulta de verificación: `information_schema.columns` ya devuelve
      `categoria` en `retail.patrimonio_items`. Tercer caso del mismo patrón
      de drift (con ADR-0004 y las categorías de `04_catalogo.sql`) — lo que
      falta no es arreglar el siguiente, es dejar de no saber qué corrió en
      producción (ver la deuda de `registro de migraciones aplicadas` abajo).
- [x] **RESUELTO — CUATRO FUNCIONES TENÍAN DOS O TRES FIRMAS VIVAS EN LOCAL. Producción estaba limpia.**
      Encontrado 2026-09-09 por `pnpm migraciones:verificar` en su primera corrida, contra la
      base LOCAL: `registrar_movimiento` (10 y 12 args), `recibir_lote` (6, 7 y 8),
      `registrar_produccion` (11, 13 y 15), `crear_producto_con_variantes` (7 y 8). Probado con
      `explain` (no ejecuta): una llamada que solo nombra los parámetros comunes devuelve
      `function is not unique`. En la práctica, en local, **una devolución al almacén funciona y
      un ajuste, una merma o un traslado normal no** — `MovimientoModal` solo manda
      `p_contenedor_id` cuando es devolución, y `supabase-js` borra las claves `undefined`.
      **Corrección del mismo día, y es importante:** se dio por hecho que esto explicaba que
      `recibir_lote` no esté en los tipos generados y que `RecibirLoteForm` "siempre falla
      cuando se usa". Felipe corrió la consulta y **producción no tiene ninguna función
      duplicada**, así que allá esos dos síntomas siguen sin causa conocida. El motivo de la
      divergencia: local replica el historial completo (`0002` crea la de 10 args, `0008` la
      redefine con 12 y la vieja queda viva), y producción recibió el estado final consolidado
      —`unificacion/07_funciones_operacion.sql:55` la define UNA vez con 12—. O sea: **la base
      local no es una réplica fiel de producción**, y no por los datos sino por la forma. Es el
      costo concreto de la deuda de migraciones duales.
      **Falta saber si producción tiene lo mismo** — se responde corriendo
      `scripts/migraciones/inventario.sql` allá.
      **ARREGLO LISTO, falta pegarlo.** `supabase/migrations/0049_una_sola_firma_por_funcion.sql`
      (aplicado y verificado en local: las cinco formas de llamada que usa la app resuelven, y
      el verificador ya no reporta sobrecargas) y su gemelo
      `supabase/unificacion/31_una_sola_firma_por_funcion.sql` para el SQL Editor de Dynamic.
      El gemelo lleva candado —no borra la firma vieja si la nueva no existe, porque producción
      recibió las migraciones a mano y puede tener otra combinación—, es idempotente (probado
      corriéndolo dos veces) y termina con una tabla que muestra el estado, porque el SQL Editor
      no siempre enseña los `raise notice`. **Pegarlo en producción es decisión de Felipe: es DDL
      en el proyecto compartido con Dynamic.** Antes de eso, la comprobación de 10 segundos está
      escrita en la cabecera del gemelo. Ver ADR-0026.
      Nota al margen: con `recibir_lote` ya sin ambigüedad, podría por fin salir en los tipos
      generados — pero `pnpm gen-types` sigue apuntando al proyecto viejo de retail y sin
      `--schema retail`, así que eso espera a que se arregle ese otro ítem.

- [ ] **`no hay registro de qué migración corrió en producción` — la deuda que
      produce todas las anteriores.** `supabase/unificacion/` tiene 20 archivos
      y el único registro de cuáles se pegaron vive en la memoria de Felipe y
      en frases sueltas de este backlog. Los tres casos de drift de esta semana
      (ADR-0004 `recibir_lote`, ADR-0006 `patrimonio_items.categoria`, y las 25
      categorías que `04_catalogo.sql` nunca insertó) son el mismo agujero, no
      tres bugs distintos: producción se desvía de local y nadie se entera
      durante semanas, hasta que una pantalla falla delante de una clienta.
      Arreglo propuesto: una tabla `retail.migraciones_aplicadas (archivo text
      primary key, aplicada_at timestamptz default now())` y una línea al final
      de cada script de unificación que inserte su propio nombre; con eso, una
      sola consulta dice qué falta. Barato y aditivo. **Decidir con Felipe
      cuándo** — después de vaciar la cola pendiente, no antes.
- [x] **`recibir_lote`: arreglado y confirmado en producción 2026-09-03
      (ADR-0004) — cerrado, con un susto en el camino que vale registrar.**
      Dos sesiones paralelas llegaron a esta función el mismo día por caminos
      distintos y convergieron en el mismo arreglo: la unificación había
      migrado una copia de `recibir_lote` más vieja que la `0018` local, sin
      validar sede, sin guardar `categoria_id` (rompía la taxonomía de
      `0030`) y sin aceptar `p_orden_compra_id`. Cuerpo schema-calificado
      pegado en `supabase/unificacion/14_recibir_lote_produccion.sql`
      (7 parámetros); `13_recibir_lote_valida_sede.sql` quedó SUPERADO (mismo
      hallazgo, alcance más angosto). **Lo que salió mal al pegar:**
      `CREATE OR REPLACE` con un parámetro nuevo (`p_orden_compra_id`) no
      reemplaza la función vieja de 6 parámetros — Postgres las trata como
      dos funciones distintas y crea una segunda, dejando **dos versiones de
      `recibir_lote` conviviendo a la vez** (la vieja insegura + la nueva
      completa). Se detectó regenerando `packages/database/src/types.ts`
      contra el proyecto correcto (el generador mostró un tipo unión con dos
      firmas) — no por una revisión manual. Cualquier "Recibir mercadería"
      sin orden de compra ligada (la mayoría) habría fallado con
      "function is not unique". Verificado con
      `select oid::regprocedure from pg_proc where proname='recibir_lote'
      and pronamespace='retail'::regnamespace` (2 filas), corregido con
      `drop function retail.recibir_lote(uuid,text,jsonb,text,text,text)`
      (la de 6), reverificado (1 fila, la de 7). Lección para la próxima
      migración que le agregue un parámetro a una función existente: un
      `CREATE OR REPLACE` que cambia la firma no reemplaza nada — hay que
      `DROP` la firma vieja explícitamente, o verificar con
      `pg_proc`/`regprocedure` que no quedó una sobrecarga fantasma.
      Agravante relacionado, sin arreglar todavía: `retail.puede_operar_sede`
      (`03_candados.sql:53-55`) tampoco tiene la cláusula `tienda_asociada_id`
      que sí tenía la versión local (`0012`) — hoy solo Líder/admin pasaría ese
      candado para una sede que no es la propia.
- [ ] **`producción`: reconciliar `ordenes_produccion` (modelo viejo) con
      `producciones` (modelo vigente desde `0025`-`0029`) — nunca se propagó.**
      Encontrado al intentar arreglar `recibir_lote`: `inventario/recibir/
      page.tsx:52,57` todavía consulta `retail.ordenes_produccion` y una
      columna `retail.lotes.orden_produccion_id` que **no existe** en
      producción (verificado: `retail.lotes` solo tiene `orden_compra_id`).
      El frontend manda `p_orden_produccion_id` a `recibir_lote`
      (`RecibirLoteForm.tsx:218`) y siempre falla cuando se usa. Deliberadamente
      fuera de `0031` — decidido con Felipe 2026-09-03. Necesita: decidir si
      `producciones` reemplaza del todo a `ordenes_produccion` (¿se puede
      dropear la vieja?), una columna nueva en `lotes` para el vínculo, y
      reescribir la consulta de "producciones pendientes de recibir" contra el
      modelo nuevo. Reversible: sí, nada de esto se ha tocado todavía.
- [ ] `web`: `middleware.ts` usa convención deprecada de Next.js 16 (pide
      `proxy.ts`). Solo un warning en build, no rompe nada. Reversible: sí.
- [x] **ARREGLADOS 2026-09-10, cada uno como pedía su caso — `pnpm lint` en verde.**
      El `:95` quedó con `eslint-disable-next-line` y el motivo escrito (leer
      `localStorage` durante el render devuelve `[]` en el servidor y la cola real en el
      navegador: eso ES una desincronización de hidratación, no una preferencia). El
      `:106` se reemplazó por el ajuste durante el render que documenta React —
      `conteoPrevio` + comparación—, y de paso quitó el parpadeo: el efecto corría
      después de pintar, así que la lista vieja alcanzaba a verse un instante. **El
      montaje no necesitó nada** porque `lineas` ya nacía de `conteo?.lineas` en su
      `useState` (`:62`), o sea que el efecto solo repetía ese valor — por eso el cambio
      conserva el comportamiento exacto. Sin riesgo de bucle: `conteo` llega de un Server
      Component (`page.tsx` hace `await getConteoAbierto`), su identidad solo cambia
      cuando el servidor manda datos nuevos, y la condición se apaga sola en el re-render
      inmediato. Verificado: lint, tipos y las 79 pruebas en verde. Texto original abajo:**
      **`pnpm lint` está en ROJO en main — 2 errores, los dos en `ConteoPanel.tsx`,
      los dos de `react-hooks/set-state-in-effect` — 2026-09-10.** Es lo primero que
      va a marcar el CI recién encendido, y está bien que lo marque: son de código ya
      commiteado (`ab479ba`), no de trabajo suelto. Los dos casos NO son el mismo problema:
      · **`:95` — hidratar `pendientes` desde `localStorage` al montar.** Probablemente
        un falso positivo: en Next no se puede leer `localStorage` durante el render
        (no existe en el servidor y desincroniza la hidratación), así que el efecto es
        justamente el patrón correcto. Lo que corresponde acá es un
        `eslint-disable-next-line` **con el motivo escrito**, no un rediseño.
      · **`:106` — copiar `conteo.lineas` del servidor al estado local.** Éste sí es el
        antipatrón que la regla persigue, y React documenta el reemplazo exacto
        ("ajustar estado durante el render", comparando contra el valor previo). Además
        de callar el lint, quita un render de más: la lista vieja deja de pintarse un
        instante antes de corregirse — en una pantalla donde se cuenta inventario, eso
        no es cosmético.
      Decidir con quien tenga el contexto de la pantalla. Mientras tanto el CI queda
      rojo, que es la verdad.

- [ ] `pruebas`: **dato corregido otra vez, 2026-09-17 — "ninguna toca Postgres" ya no
      es cierto.** La corrección de 2026-09-10 (7 archivos/79 pruebas de TypeScript en
      CI) seguía diciendo que ninguna prueba tocaba Postgres — eso cambió el
      2026-09-16/17: `scripts/pruebas/registrar_cambio.mjs` y
      `scripts/pruebas/aprobar_devolucion_caja.mjs` (ADR-0066) ya corren contra el
      Postgres local de verdad (`docker exec` + `ROLLBACK`, nunca en CI — necesitan
      Docker), y desde hoy también `scripts/pruebas/fn_aplicar_movimiento.mjs`
      (11 escenarios: entrada, salida con bloqueo de stock negativo, traslado atómico
      con overflow forzado, bloqueo por `(ubicacion_id, sububicacion_id)` verificado con
      dos procesos reales en paralelo, y el regresión-catcher exacto de
      ADR-0020/0023 para el signo del ajuste). **Lo que sigue en pie:** `registrar_venta`
      y `cerrar_caja` (las RPC de producción sí quedaron cubiertas por
      `fn_aplicar_movimiento` de forma indirecta) todavía no tienen su propio script
      dedicado — mismo patrón a copiar, documentado en ADR-0066. Cayla Dynamic
      (proyecto hermano) corre 302 pruebas pgTAP sobre su propio dinero; acá el
      principio 7 ("pasos verificables") ya empezó a capturarse en scripts, no solo en
      el navegador, pero falta terminar de cubrir el resto del núcleo.
- [x] **`unificación retail↔dynamic`: RESUELTO 2026-09-17 — ADR-0091.** Documenta por
      qué `retail` vive como schema dentro del proyecto de Dynamic (no un proyecto
      propio), y confirma con `git log --all` que el `02_*.sql` que crea el schema NUNCA
      se llegó a commitear (no se perdió — se corrió a mano contra producción en jul-2026
      y su SQL se fue con la sesión). De paso encontró 3 tablas huérfanas de ese mismo
      paso 02 que tampoco están en el repo: `retail.sede_meta` (la real, con punto —
      `retail_sede_meta` con guion bajo en `01_sedes.sql` es una trampa de nombre, nadie
      la lee), `sede_datos_fiscales`, `configuracion_empresa`.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [x] **`cacheComponents`: ARCHIVADO el 2026-09-09 tras intentarlo de verdad -- ADR-0028.**
      Con el arbol quieto se activo el flag, se corrio el codemod oficial (27 rutas, 0
      errores) y se ejecuto el build. Varias preocupaciones se cayeron al medirlas: 0
      configs de segmento que migrar, 0 `unstable_cache`, y 13 pantallas ya tenian
      `<Suspense>` del mismo dia. **El impedimento real es de producto, no de codigo:**
      `AppShell.tsx:328` decide con `esLider` que enlaces dibuja, asi que la navegacion
      depende del rol -- y un armazon prerenderizado no puede contener un menu que cambia
      segun quien mira. El layout lee cookies para saberlo y bloquea la ruta entera por mas
      `<Suspense>` que se le ponga a cada pagina. No paga: el streaming ya dio CERO en
      tiempo, la cache del router entrega 6-7 ms en pantalla repetida y el armazon llega en
      124 ms. **Solo se revisa si la navegacion deja de depender del rol por una razon de
      producto**, nunca por rendimiento.
- [ ] `inteligencia`: umbral de estancado (45d) y lead time (14d) siguen siendo
      constantes globales, no por categoría/sede. Sigue sin justificarse afinarlo:
      no hay datos reales de venta todavía (depende de `catalogo real` arriba).
- [ ] `almacen/recibir`: rediseño de UX pendiente desde el 17-jul — talla/color/
      categoría quedan escondidos hasta buscar y crear un producto nuevo. Pedido
      explícito de Felipe, nunca agendado en una sesión propia.
- [ ] `finanzas`: el costo de lo vendido usa el costo VIGENTE de cada prenda, no el
      costo del día de la venta. Inofensivo mientras los costos sean estables (nota
      del 17-jul); si algún día se mueven, distorsiona el histórico de EERR pasados.
- [ ] Contraste: el barrido del 08-sep (ADR-0012) midió solo las pantallas que se
      pueden ver sin sesión más Facturación. Las de Finanzas, Inventario y Producción
      quedaron con el piso aplicado por sustitución mecánica pero SIN medición sobre
      el DOM renderizado. Vale una pasada de verificación cuando haya sesión de prueba.
      El hallazgo de taupe que salió acá el 09-sep ya está cerrado (ADR-0017,
      `--color-taupe-profundo`); lo que queda es el barrido de las pantallas con
      sesión, que es más ancho que ese solo color.
- [ ] Campos viejos: los 6 modales del núcleo (abrir/cerrar caja, vender, bajar a
      tienda, registrar gasto, movimiento de stock) siguen con los strings
      `campoTexto`/`campoSelect`/`botonPrimario` de `ui/Modal.tsx`. Migrar pantalla por
      pantalla, nunca de un saque: los strings viejos siguen exportados justamente para
      que la migración sea opcional. `EfectivoPanel` ya no existe (era de Finanzas V1,
      borrado en el corte V1→V2) — se cae de esta lista. `ProformasPanel` ya migró
      (ver CERRADO 2026-09-16) — queda como ejemplo de referencia además de
      `ComprobantesPanel`.

---

## 📚 CONCEPTOS PENDIENTES DE ENSEÑAR

- [ ] **Schema de Postgres como "cajón" aislado** — el hallazgo de arriba no se
      entiende sin este modelo mental: `public` y `retail` pueden vivir en el
      MISMO proyecto Supabase sin verse entre sí a menos que algo los conecte a
      propósito (las vistas puente del paso 3 de unificación). Es la pieza que
      explica por qué "cambiar una palabra en el cliente" puede romper todo.
- [ ] **`security definer`** — por qué `fn_aplicar_movimiento` y las RPCs de venta/
      producción pueden saltarse RLS y por qué eso es seguro *solo* porque validan
      todo adentro (sede del que llama, cuadre de asiento, etc.).
- [ ] **Costeo por margen de contribución** (introducido en `0024`) — por qué la
      mano de obra y los gastos fijos del Taller NO entran al costo por prenda y sí
      al resultado mensual del Taller; es una decisión contable, no un descuido.
- [ ] **Identidad vs. permiso: «quién firma» no es «qué puede hacer la cuenta»** (examen del 2026-09-22,
      ADR-0162). Felipe acertó en que la terminal no anula aunque elija a una líder, pero lo atribuyó a que la
      validación «ya existe». Falta el porqué: al cambiar quién firma (`fn_actor_persona_id`), los permisos tienen
      que seguir mirando la **cuenta** (`fn_es_lider()` falso para la terminal), o elegir a Carmen en el combo, que
      no pide PIN, le daría a cualquiera los poderes de líder.
- [ ] **Diagnóstico por descarte: «falla en una tienda y no en las otras» apunta a datos, no a código** (examen
      del 2026-09-22). Felipe dio el primer paso correcto (¿alguien marcó en AQP?), pero no el siguiente si sí
      marcaron. Orden: la marca → la marca subida al servidor (el kiosco de Dynamic guarda y sube cada 15 s) → el
      vínculo `ubicaciones.sede_dynamic_id` → pausa u otra sede.

## ✅ CERRADO (últimos, con fecha)

- [x] 2026-09-18 — **Tienda Lima activada en producción (ADR-0097).** No estaba
      inactiva, no existía: `retail.ubicaciones` en producción solo tenía Taller,
      Tienda AQP y Tienda TRU (las decenas de menciones de "Tienda Lima" en esta
      bitácora son todas del seed local, nunca de la base real). Creada vía
      `apply_migration` (`20260918010733_activar_tienda_lima.sql`, dry-run+rollback
      verificado antes de aplicar de verdad): fila `Tienda LIM` enlazada a la sede
      Dynamic código `003` (el código `LIM` de Dynamic es el Taller, no la tienda —
      trampa ya documentada abajo, 2026-09-10) + sus 3 sububicaciones (piso de
      venta, almacén de tienda, cuarentena), mismo patrón que AQP/TRU. Verificado
      contra producción después de aplicar; `get_advisors` sin advertencias nuevas.
      **Pendiente (no es parte de "activar"):** cargar stock inicial (traslado desde
      Taller/almacén) y asignar una Encargada — la tienda queda operable pero vacía.
- [x] 2026-09-17 — **`/almacen` y `/almacen/recibir` pasan a `redirects()` de
      `next.config.ts` — y de paso se corrigió un 404 que llevaba un día abierto.**
      Eran páginas de React (`app/(app)/almacen/page.tsx`,
      `app/(app)/almacen/recibir/page.tsx`) que solo llamaban a `redirect()`: cada
      visita pagaba `requirePersonaActualV2()` + `getUbicaciones()` + `AppShell`
      completo en el servidor para terminar igual acá — un alias de ruta pertenece a
      la config, no al árbol de páginas. Verificado en dev (con `.env.local` apuntando
      al Supabase local): el log del servidor no muestra ninguna línea de `proxy.ts`
      para estas dos rutas (sí la muestra para cualquier otra), confirmando que
      `redirects()` resuelve antes de que la barrera de sesión llegue a correr.
      **Hallazgo de rebote:** el destino viejo, `/inventario/almacen`, ya no existe
      desde el 2026-09-16 (ADR-0071, commit `52882ff`, unificó piso+almacén dentro de
      `/inventario`) — el stub llevaba un día completo redirigiendo a un 404 sin que
      nadie lo notara. Corregido el destino a `/inventario` (no `/inventario/almacen`)
      de una vez; el otro alias, `/almacen/recibir` → `/inventario/recibir`, sí
      apuntaba a una ruta real y no cambió. `permanent: false` → **307**, no 308: el
      308 que pedía el ítem original es lo que da `permanent: true`, que es
      justamente lo que no se quería (redirect permanente cacheado en el navegador
      de cada quien). Verificado en navegador real, ambos roles, con las dos rutas:
      colaboradora (Micaela, Tienda Trujillo, sesión ya abierta en el pane) y líder
      (`felipe@cayla.local`) — las dos aterrizan en las pantallas reales de
      Existencias y Recibir mercadería con datos reales, sin ningún componente entre
      medio. `pnpm --filter web build` limpio. De paso quedó al descubierto que
      `ARQUITECTURA.md:106-123` describe un `/inventario` de una arquitectura vieja
      que ya no existe — ver ítem nuevo en 🩹 ARREGLAR, no se tocó por ser más ancho
      que esta sesión.

- [x] 2026-09-16 — **Facturación en tarjetas para celular (ítem 5 de la auditoría de
      amigabilidad; Felipe confirmó que sí entra desde el teléfono a veces).**
      `ComprobantesPanel.tsx` y `ProformasPanel.tsx`: la tabla (`min-w-[760px]`) queda
      para `sm:` (640px) y más ancho; por debajo, las mismas filas se pintan como
      tarjetas apiladas — mismo dato, sin columnas, sin scroll horizontal. Se extrajo
      `accionComprobante()` (botón Transmitir/Anular/Consultar + motivo de rechazo o
      anulación) y `proformasOrdenadas` para que tabla y tarjetas lean la misma lógica,
      no dos copias que puedan desalinearse. **Verificado en el navegador real, con
      Felipe autenticado como líder** (el límite de las sesiones anteriores — sin
      sesión de líder disponible — se resolvió cuando entró él mismo con su
      contraseña): 375px de ancho, con los 13 comprobantes y 1 proforma reales que ya
      había en el local, sin ningún desborde horizontal. `tsc --noEmit`, `pnpm lint`,
      `pnpm test` (239/239) en verde.

- [x] 2026-09-16 — **Auditoría de amigabilidad de Facturación: 3 de 5 hallazgos
      construidos, con el visto bueno de Felipe (pidió todos menos "conectar Ventas
      de hoy con Emitir", ver 🩹 ARREGLAR).** (1) `ComprobantesPanel.tsx`: motivo de
      rechazo de SUNAT ahora visible en la fila (existía en el tipo y en la
      consulta, `lib/comprobantes.ts:20`, y no se pintaba nunca). (2)
      `lib/proformas.ts`: las vigentes se traen aparte, sin el filtro de mes, para
      que una proforma abierta no se caiga de la vista al cruzar de mes — el resto
      de estados sigue por mes. (3) `ComprobantesPanel.tsx`: el resumen pasa de 3 a
      4 tiles — "Rechazados" ya no es una sub-línea roja dentro de "Pendientes de
      enviar". (4) `facturacion/page.tsx`: "Códigos de descuento" se movió de un
      link huérfano bajo el título a la fila de acciones junto al navegador de mes.
      Verificado `tsc --noEmit`, `pnpm lint`, `pnpm test` (239/239) en cada commit
      por separado (4 commits). **Sin demo en navegador autenticado como líder**
      (mismo límite que la sesión de ProformasPanel: este repo solo tiene login por
      contraseña, sin flujo de magic link/OTP en el frontend — verificado, no hay
      ninguna ruta `/auth/*` en `apps/web/app`). De paso salió un hallazgo nuevo, no
      tocado: "Monto facturado" suma comprobantes rechazados/anulados/de prueba —
      ver 🩹 ARREGLAR, es decisión de Felipe qué debe contar la cifra.

- [x] 2026-09-16 — **`ProformasPanel` migrado a `components/ui/campos.tsx` (ADR-0011).**
      Mostrado antes/después a Felipe (artifact interactivo) — aprobó "tal cual". Cambio
      puramente presentacional: `CampoSelect`/`CampoTexto`/`CampoMonto`/`Segmentado`/
      `Boton` en los dos modales (Nueva proforma, Convertir a comprobante); `onCrear`,
      `onConvertir`, `lib/proformas.ts` y la RPC sin tocar. Verificado `tsc --noEmit`,
      `pnpm lint` y `pnpm test` (239/239) en verde. Sin demo en navegador autenticado
      como líder en esta sesión (el atajo de magic link local no completó el canje de
      sesión) — dev server queda levantado en `localhost:3000` por si Felipe quiere
      verlo él mismo. Quedan los 6 modales del núcleo con los campos viejos — ítem
      "Campos viejos" más arriba en este archivo.

- [x] 2026-09-15 — **Colores: tipo visual y muestra real** (Sesión F2,
      `feat/colores-tipo-muestra`, sobre `DiegoN`). `colores.tipo`
      (sólido/textura/estampado — ortogonal a `familia_color`, que agrupa por
      matiz, no por naturaleza), `colores.imagen_muestra_url` y
      `colores.notas` internas (`20260915230000_colores_tipo_y_muestra.sql`).
      Bucket propio `retail-colores-muestras`, PÚBLICO a diferencia de
      `retail-compras-adjuntos` (privado) — decisión justificada en
      ADR-0061: una muestra de tela no tiene el problema de confidencialidad
      de una factura (RUC, montos), y público evita pedir URL firmada por
      cada una de las ~30+ muestras en cada render de la grilla. Columna
      simple en vez de tabla-aparte-con-RPC (como adjuntos de factura)
      porque la relación es 1:1, no 1:N — el candado de negocio real ya
      existe (`colores_write_lider`). `ColoresLista.tsx`: selector de tipo,
      subida de muestra (`lib/colores-muestra.ts`, mismo patrón de subida
      navegador→bucket que `lib/adjuntos-compra.ts`) y campo de notas en
      alta y edición; el listado muestra la muestra real si existe, si no
      el cuadradito de HEX de siempre (fallback intacto). Verificado en
      este entorno: `typecheck`, `lint`, `next build` y `vitest run`
      (215/215) limpios.

      **Fallback visual verificado en navegador real (2026-09-15, noche).**
      "Denim" del ejemplo original no existe — el vocabulario cerrado tiene
      30 nombres fijos y ninguno se llama así; se probó con "Estampado"
      (mismo mecanismo). Tipo=Textura + notas se guardan y persisten.
      **La subida real de la muestra sigue sin probarse un extremo a otro**:
      el contenedor `supabase_storage_cayla-retail` no está entre los que
      levanta este proyecto local (`docker ps` solo trae
      db/rest/auth/kong/studio/pg_meta/inbucket — Storage no corre acá), y
      el botón "Subir muestra" usa un `<input type=file>` oculto que la
      herramienta de navegador de esta sesión no puede completar. Se
      verificó igual el mecanismo de display (URL en `imagen_muestra_url` →
      se pinta la foto en vez del cuadrado de HEX) escribiendo una imagen de
      prueba directo en la fila vía SQL, no por Storage — y se revirtió al
      terminar. Antes de dar la subida por buena: levantar Storage local
      (agregarlo a `supabase/config.toml` si no está declarado, o confirmar
      por qué se excluyó) y subir una muestra real desde el botón.

- [x] 2026-09-15 — **`AjustarInventarioModal.tsx`: ajuste manual de stock por
      variante, con signo** (Sesión A2, `feat/productos-ajustar-inventario`).
      Reusa `retail.registrar_movimiento` (tipo='ajuste', ya existente desde
      `20260914230000_inventario_piso_almacen.sql`) — cero vías nuevas de
      escritura a `stock`. Motivos `reposicion`/`merma`/`conteo_fisico`/`otro`
      agregados a `ETIQUETA_PROCESO`/`PROCESOS_FILTRO` en `movimientos-reglas.ts`.
      Valida el stock negativo en pantalla (ADR-0023) antes de llamar a la RPC.
      Selector Piso de venta/Almacén de tienda cuando la ubicación los separa.
      Probado en navegador contra Tienda Lima / Blusa Valentina, verificado en
      `/movimientos`. Conectado al menú real de `/productos` por la Sesión B2
      el mismo día (ver ítem de integración final abajo).

- [x] 2026-09-15 — **Productos: integración final del bloque (Sesión B2,
      `feat/productos-acciones-masivas`)** — cierra A2+A3+B1. Menú "..." de
      cada fila: "Ajustar inventario" abre `AjustarInventarioModal` (modal de
      `useState`, con `ubicacionId`/`sububicaciones` de la sede del
      colaborador vía `persona.ubicacionId`); "Ver historial" navega a
      `/productos/[id]/historial`, que se abre como modal con ruta
      interceptada (`@modal/(.)[id]/historial`, mismo mecanismo que el
      detalle de factura de Compras) o como página completa por enlace
      directo/recarga. Acciones masivas sobre la selección: Activar/
      Desactivar (solo líder) hacen un solo `UPDATE ... WHERE id IN (...)` de
      `productos.estado` — sin RPC propia, ya alcanza con la RLS
      `productos_write_lider`; el trigger de historial se extendió
      (`20260915223000_historial_producto_estado.sql`) para no perderse esos
      cambios (el propio comentario de A3 avisaba de este hueco). Borradas
      las rutas de demo `productos/dev-ajustar-inventario` y
      `productos/dev/historial/[id]`. De paso: arreglada una colisión de
      timestamp entre dos migraciones de otra sesión anterior
      (`20260915120000_produccion_del_taller.sql` /
      `..._reparar_fk_transferencia_items.sql`, ambas ya en `main`) que
      rompía `supabase db reset` para cualquiera — se renombró la segunda a
      `20260915120001` (solo el archivo, sin tocar contenido). Verificado en
      Chrome headless con Playwright (login real, ambos modales, recarga
      directa del historial, acción masiva reflejada en el historial, las
      tres rutas dev ya no sirven el demo).

- [x] 2026-09-15 — **Categorías: editar y desactivar/reactivar** (Sesión C1,
      `feat/categorias-crud`). `/productos/categorias` solo tenía listado + alta;
      se agregó PUT/PATCH en `route.ts` con RPC `actualizar_categoria` /
      `desactivar_categoria` / `reactivar_categoria` (security definer, mismo
      patrón que `proveedores_administrables`). Decidido con Felipe: prefijo fijo
      una vez que hay productos con esa categoría; desactivar se bloquea (no solo
      avisa) si hay productos activos, con el conteo en el mensaje. De paso se
      cerró un candado que faltaba: `categorias.nombre` era `unique` plano
      (no bloqueaba "Blusas" vs "BLUSAS"); ahora usa `categorias_nombre_clave_unica`
      (`fn_clave_texto`, igual que colores/proveedores) — reemplaza
      `categorias_nombre_key`. Verificado en navegador contra Supabase local.
      **No está en producción** (`20260915160001_categorias_editar_desactivar.sql`
      pendiente de aplicar, junto con las demás migraciones del 2026-09-15 — el
      timestamp pasó de `160000` a `160001` al integrar todo en `diegoN`: chocaba
      con `productos_listado_filtros.sql`, mismo minuto exacto).

- [x] 2026-09-15 — **Vocabulario de colores: editar, desactivar y reactivar** (rama
      `feat/colores-crud`). El listado + alta ya existían; faltaba `PUT/PATCH` en
      `apps/web/app/api/productos/colores/route.ts` (mismo guard de Líder que el POST) y
      la pantalla para usarlo. Antes de desactivar cuenta `variantes` activas con ese
      `color_codigo` y bloquea si hay alguna — decisión de Felipe: se bloquea del todo,
      no se avisa y se deja seguir. El HEX no tiene candado técnico (nada en
      `movimientos`/ventas guarda una copia; catálogo/inventario/producción lo resuelven
      en vivo desde `colores.hex`) pero el formulario lo esconde detrás de "Cambiar
      color" para que no se mueva sin querer. Verificado en el navegador (login sin
      escribir contraseña, vía magic link del service role local): editar Amarillo,
      candado `colores_clave_unica` sigue rechazando "Crudo" → "  Amarillo  ", bloqueo
      de desactivar contra Azul marino (variantes activas reales), desactivar/reactivar
      Amarillo. `tsc`/`eslint` en verde.

- [x] 2026-09-15 — **Producción del Taller restaurada sobre V2** (ADR-0050). Migración
      reconstruida desde el Postgres local (el archivo se había perdido; tablas y RPC
      verificadas idénticas tras `db reset` + diff), `/produccion` con abrir / etapas /
      cerrar al inventario / anular / revertir, `lib/produccion-reglas.ts` con 8 tests,
      ítem en el nav para líder y para quien trabaja en el Taller. Ciclo completo probado
      por PostgREST con RLS real (stock 20→34→20, movimientos append-only).

- [x] 2026-09-12 — **Vocabulario cerrado (colores + categorías) y código corto
      portados a V2, sin fusionar la rama V1 entera — más `activos_fijos`
      rescatada.** El corte V1→V2 (`0af2f1b`) dejó `colores`/`categorias` sin
      el candado que evita "Azul marino" y "azul marino" como filas
      distintas, y sin código corto de prenda. Se evaluó fusionar
      `trix/catalogo-vocabulario` completa y se descartó: 350 archivos,
      mayoría módulos que V2 ya había borrado a propósito (Producción,
      Inventario V1, Finanzas), y `supabase/migrations/` habría quedado con
      los dos núcleos a la vez sin que Git lo marcara como conflicto. Se
      portó en cambio solo el vocabulario, como migraciones nuevas sobre el
      esquema real de V2: `colores_clave_unica` (vía `fn_clave_texto`) + los
      30 colores reales, `categorias.familia`/`prefijo` + las 37 reales, y el
      código corto acuñado por un TRIGGER en `variantes` (no una RPC — V2 no
      tiene una única función que cree variantes). De paso se rescató
      `activos_fijos` (39 filas reales en producción, sin tabla en V2),
      simplificada sin la FK a `cuentas_contables` (Contabilidad sigue sin
      dato real). Verificado: `db reset` limpio, candado de duplicados
      probado en vivo (rechaza "azul  MARINO"), catálogo del seed con código
      corto real asignado solo por el trigger, `tsc`/`eslint` en verde.
      **Pendiente:** ninguna pantalla lee `variantes.codigo` todavía — la
      base está lista, falta conectar la UI.
- [x] 2026-09-10 — **`registrar_venta` deja de duplicar una venta si la red se
      corta a mitad de un cobro (ADR-0032).** `registrar_venta` era atómica
      dentro de Postgres pero no idempotente hacia afuera: si la respuesta se
      perdía después del commit, un reintento de la Encargada entraba como
      venta nueva, con doble descuento de stock. Se agregó `p_token uuid`
      (uno por carrito, generado en `RegistrarVentaModal.tsx`) +
      `ventas.token_cliente` con índice único. Tres rondas de revisión
      adversarial encontraron y cerraron dos bugs reales antes de tocar
      producción: la primera versión devolvía la venta existente ANTES de
      validar el candado de sede (`retail.puede_operar_sede`) — un bypass de
      autorización real; la segunda dejaba la rama de la carrera concurrente
      (`exception when unique_violation`) sin la misma comparación de
      contexto (caja/método/monto) que sí tenía la rama normal. La versión
      final repite esa comparación en las dos ramas y valida sede/caja/estado
      siempre primero, con o sin token. Verificado en producción con consulta
      directa (no solo el `raise notice` del propio script) y con el
      verificador de `scripts/migraciones/` contra una foto fresca de
      producción: firma nueva de 5 argumentos activa, firma vieja ausente,
      `anon`/`PUBLIC` sin `EXECUTE`, cero filas de prueba dejadas atrás.
      `pnpm typecheck` limpio en los 3 paquetes.
- [x] 2026-09-10 — **`recalcular_stock()` vuelve a saber que el almacén
      existe, y de paso corrigió 2 filas de stock que ya estaban infladas
      (ADR-0031).** La versión vigente en producción (ADR-0020, "el neto en
      una pasada") se escribió antes de que existiera el almacén interno —
      producción ya tiene 4 contenedores tipo `almacen` reales y 9
      movimientos enrutados ahí que esa versión no conocía; invocarla
      habría mezclado el almacén de vuelta al piso. Se portó el diseño de
      `0044_almacen_interno.sql` (nunca pegado a producción con ese
      alcance), sumando el candado de Líder que se había perdido en el
      camino, el guard de `stock_minimo` (borde heredado de ADR-0020, ya
      anotado hace días en este archivo) y `EXECUTE` revocado de `PUBLIC`.
      Una revisión adversarial encontró y corrigió un bug antes de aplicar:
      sin una excepción para `tipo='traslado'`, un traslado hacia un
      contenedor de almacén (el mecanismo real de "devolver a almacén", hoy
      inalcanzable desde el frontend) se habría restado del piso de origen
      sin sumarse en ningún lado. Verificando la lógica contra los datos
      reales (por `select`, sin invocar la función) aparecieron 2 filas de
      `stock` con el doble conteo exacto de una entrada al almacén también
      contada como piso, del 2026-09-05 — corregidas a mano con confirmación
      explícita de Felipe (99→49 y 98→58 en Arequipa), sin tocar
      `movimientos`.
- [x] 2026-09-10 — La cabecera dice DÓNDE estás parado, y la tienda de Lima quedó
      entera. El selector mostraba `codigo` — que dejó de ser legible con la
      unificación: el Taller es `LIM` y la tienda de Lima es `003`. Ahora muestra
      una etiqueta derivada (`TND LIM`, `TLL LIM`, `TND AQP`, `TND TRU`, `CCO`) con
      la regla en `lib/etiqueta-sede.ts`, pura y con 9 pruebas que la fijan contra
      los datos reales de producción Y del seed local. Mismo trato para el lateral y
      para la pastilla de la Encargada. Rastreando eso apareció que `003` tenía
      `activo = false`: se podía vender ahí pero no cargarle un gasto ni un asiento
      (`egresos`, `registrar` filtraban por ese flag). El flag resultó ser de
      Dynamic (`retail.sedes` es una vista sobre `public.sedes.activa`) — Felipe
      decidió no escribir en la tabla de Dynamic y que retail deje de mirarlo:
      **ADR-0029**. Verificado antes de tocar nada que ni RLS ni `puede_operar_sede`
      bloqueaban por su lado. **Falta comprobarlo en navegador** (Docker apagado en
      la sesión): typecheck y 88 pruebas en verde, demo pendiente.
- [x] 2026-09-04 — Modal compartido `components/ui/Modal.tsx` sobre Radix Dialog
      (ADR-0003): los 6 modales del núcleo que seguían con estilos genéricos
      pre-brandbook (abrir/cerrar caja, vender, bajar a tienda, registrar gasto,
      movimiento de stock) migraron a los tokens CAYLA v3, y los 8 modales de la
      app ganaron foco atrapado + cierre con `Escape` (antes ninguno lo tenía,
      salvo `Ayuda.tsx` con lógica propia). Verificado en navegador con página de
      prueba temporal (borrada al cerrar). Sin adoptar ningún kit visual externo —
      Radix solo aporta comportamiento, el look sigue siendo 100% CAYLA.
- [x] 2026-07-19/23 — Producción del Taller construida de punta a punta más allá de
      lo registrado en BITACORA: costeo por margen de contribución (`0024`),
      registrar producción por corrida (`0025`), producción a nivel de modelo
      (`0026`), variantes estilo Shopify + "marcar terminado" → inventario
      (`0027`), corrección de producciones mal registradas (`0028`), y la orden de
      producción unificada con 6 etapas y 2 tipos (muestra/producción) en `0029` —
      reemplaza los dos mecanismos que se pisaban entre sí. **Commiteado, sin
      confirmación explícita de Felipe en producción todavía** (no hay entrada de
      bitácora que lo confirme, a diferencia de todo lo anterior).
- [x] 2026-07-16 — Fase 2 pivotada de finanzas a "Inventario Inteligente" (decisión de Felipe)
- [x] 2026-07-17 — Inventario Inteligente commiteado (`feat(inventario)`, `fix(movimientos)`, `docs`)
- [x] 2026-07-17 — Fix RLS: traslados visibles para la sede que los recibe → ADR-0001
- [x] 2026-07-17 — Fix: 4 filas duplicadas en `personas` bloqueaban el login de Felipe;
      agregado `unique(auth_user_id)` para que no se repita → ADR-0002
- [x] 2026-07-17 — Repo conectado a GitHub (`felipea92p-ux/cayla-retail`, privado) —
      antes solo existía en esta Mac, sin respaldo. Vercel conectado al repo para
      deploy automático en cada push; deploy de Inventario Inteligente confirmado
      en `cayla-retail.vercel.app`.
- [x] 2026-07-17 — Fase 2 financiera: Diario de Caja (apertura/cierre con conteo
      ciego), Gastos, Estado de Resultados (mermas como COGS). Verificado por Felipe
      en local. "Venta" se retiró del modal de movimiento genérico — el botón
      "Vender" es ahora la única fuente de verdad para registrar una venta.
- [x] 2026-07-17 — Fase 3: ingreso de mercadería y almacén — un almacén hermano por
      tienda (TRU-ALM/AQP-ALM/LIM-ALM), contenedores, `/almacen/recibir` (lotes),
      `/almacen` (stock + "Bajar a tienda"), devolución con motivo estructurado
      reutilizando `traslado`. Diseñado tras 24 preguntas de descubrimiento (no
      adivinado). Verificado en producción por Felipe.
- [x] 2026-07-17 — Taxonomía real de catálogo: `productos.categoria` (texto libre)
      → 6 familias fijas + 30 categorías en tabla `categorias`, editable por Líder
      sin deploy. Tallas sugeridas por categoría alimentan un `<select>` real en
      "Recibir mercadería". Migración `0009` corrida en Supabase y verificada en vivo.
- [x] 2026-07-17 — Endurecimiento de stock contra concurrencia (`0010`): `for update`
      al validar + `check (cantidad >= 0)` + FK de `movimientos.venta_id`. Cierra la
      condición de carrera que dejaba el stock en -1 con dos ventas simultáneas de la
      última unidad. Encontrado en la revisión nocturna, aprobado y corrido por Felipe.
- [x] 2026-07-18 — "Estancado" mide días sin venta real (`0011`): columna
      `stock.ultima_venta` sellada solo con motivo='venta'. Indicador renombrado a
      "Días sin venta".
- [x] 2026-07-18 — Las 5 RPCs security-definer validan la sede del que llama (`0012`,
      helper `fn_puede_operar_sede`). Cierra la puerta de atrás: nadie mueve stock ni
      cajas de otra sede por API directa.
- [x] 2026-07-18/19 — Identidad visual CAYLA aplicada (brandbook v3.0: Rojo #B8412D,
      Crema #F5F0E8, Tinta #1A1A18, EB Garamond + DM Sans) y rediseño UX total v3
      (AppShell, navegación lateral/móvil, catálogo agrupado, selector de sede del
      Líder). Verificado en vivo por Felipe.
- [x] 2026-07-19 — F1 núcleo financiero (jubilación de SINATRA): proveedores,
      depósitos, ajustes de efectivo, históricos, patrimonio (`0013`-`0014`). Fase B:
      etiquetas Brother con código de barras Code 128 propio, fotos por modelo,
      stock mínimo por sede (`0015`-`0016`). F2: órdenes de compra formales, export
      Excel, modelo de gastos corregido (`0017`). Producción del Taller v1: etapas,
      receta de costo (`0018`). C1: los 4 estados financieros completos por lectura,
      sin tocar money paths (`lib/contabilidad.ts`). Ayudas (!) educativas regadas
      por toda la app. Todo desplegado y verificado el mismo día.
- [x] 2026-07-19 — Motor contable de doble partida (`0019`-`0023`): plan de cuentas
      PCGE, `registrar_asiento` con cuadre forzado, activos fijos con depreciación
      NIIF/SUNAT automática, fix de recursión infinita en RLS de identidad.
- [x] ~2026-07-20/23, confirmado en producción 2026-09-03 — Unificación de
      identidad: retail deja de tener sus propias `sedes`/`personas` y pasa a
      leerlas de Dynamic vía un schema `retail` dedicado dentro del proyecto
      Dynamic, con vistas puente y RPCs migradas (`supabase/unificacion/01`-`11`).
      Verificado con Felipe contra el SQL Editor de producción: el schema
      `retail` existe, tiene 28 tablas (más que las ~22 originales — las
      migraciones de producción `0024`-`0029`, posteriores a la unificación,
      sumaron tablas nuevas encima), y `retail.sedes` devuelve 5 filas reales, no
      vacío. Descarta el riesgo que abrió esta auditoría: la app NO llevaba 6
      semanas rota. Pendiente solo la documentación (ver ARREGLAR).

## 📎 De sesiones previas de Claude Code (contexto, no repetir)

- `docs/CHECKLIST-MANANA.md` (17-jul) y `docs/PLAN-DE-TRABAJO.md` (19-jul): ya
  incorporados arriba, todo lo accionable de ahí quedó cerrado o migró a este
  backlog. Se conservan como registro histórico, no como pendientes activos.
