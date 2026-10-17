# Rediseño del módulo Producción: qué tiene CAYLA, qué hace la clase mundial y qué le toca decidir a Felipe

**Fecha:** 2026-10-13 · **Pidió:** Felipe: «necesito rediseñar todo el módulo de producción. Necesito que sea bastante entendible. Que se pueda
escoger los colores, los tipos de tela, las tallas. Cuando se crea una orden, indicar si esta orden va a tercerizarse tal vez una parte de esa
producción, si vamos a maquilar aparte, por ejemplo el corte o las costuras, no sé cómo se llaman las diferentes fases de producción textil.
Quiero que investigues a profundidad lo que hacen otros sistemas de clase mundial, los mejores, y que me hagas bastantes preguntas. La estética y
las funcionalidades no me convencen para nada. Primero estudiar bien, investigar bien y volver a desarrollarlo.»
**Estado:** investigación terminada; **nada construido**; esperando las respuestas de Felipe (sección «Preguntas para Felipe»).
**Cómo se hizo:** cuatro lectores del repo (esquema, decisiones ya tomadas, pantallas, ciclo de vida de la orden), seis investigaciones de fuera
(PLM de moda, ERP/MRP de confección, fases y tarifas en Lima, tercerización, interfaz, marcas chicas con taller propio), una síntesis y dos
críticos que la revisaron (contradicciones con lo ya decidido; lo que faltaba). Este archivo es la síntesis **ya corregida** por los dos críticos.
Confianza: **VERIFICADO** = se abrió el archivo o la fuente · **[externo, sin verificar]** = cita de fuera que el repo no respalda · **propuesta del
arquitecto** = idea nuestra que Felipe no pidió.

**Hechos que mandan sobre todo lo demás:** en producción real, `producciones`, `produccion_lineas`, `insumos`, `insumo_lotes`,
`comprobantes_produccion*`, `proveedores_produccion` y `cotizaciones_maquila` tienen **0 filas**: el Taller nunca abrió una orden real. Rediseñar
no migra datos. ADR-0396 (aprobado hoy) rehízo «Nueva orden» con el modelo primero, la tabla talla × color y la hoja ancha (A0–A3 en `main`) y dejó
escrito como abierto «tercerizar una etapa al abrir». Cómo opera el Taller (`docs/datos/15-COMO-OPERA-CAYLA.md` §7, R-25..R-31): la tela se compra
por metro, kilo o rollo; el consumo lo calcula Audaces (la tizada); el Taller corta y confecciona adentro y manda a servicio la confección (maquila) y
los acabados (bordado, estampado, lavandería); a la maquila se le paga por prenda terminada; la merma es menor al 3 %.

---

## 1. Lo que CAYLA tiene hoy

- **La orden** (`producciones` + `produccion_lineas`): modelo, lote o muestra, cantidades por talla × color, `fecha_entrega` global (sin validar),
  tres montos tecleados de toda la corrida (tela, avíos, maquila) de los que sale `costo_unitario` (columna generada), `etapas` como un `jsonb` sin
  candado (`{etapa: pendiente | hecho | tercerizado}`), y `produccion_etapas_historial` que se escribe en cada cambio de etapa y **ninguna pantalla
  lee** (el cajón solo lo nombra en un comentario). Migraciones: `20260915130000_produccion_del_taller.sql`, `20260923240000_quien_en_acciones_pendientes.sql`.
- **Las etapas** son una lista fija escrita dos veces (`apps/web/lib/produccion-reglas.ts:15-26` y el `if` de `set_etapa_produccion`): lote =
  corte → confección → acabado; muestra = patronaje → muestra → escalado. Sin orden obligatorio, sin cantidades, sin fecha, sin responsable, sin
  proveedor, sin tarifa. «Tercerizado» es una palabra: no sabe a quién, cuántas, cuándo ni a cuánto.
- **Tela y avíos** (`insumos`, `insumo_lotes`, `movimientos_insumo`): un insumo tiene nombre, tipo (tela o avío), **una sola unidad** (R-25 sin
  resolver), mínimo y una `merma_pct` que nadie usa. No tiene color, composición, ancho, gramaje ni tejido. La tela se descuenta por lote (PEPS, un
  lote, sin partir) desde el cajón de la orden, **después** de abrirla: la orden «no sabe qué lleva» hasta que alguien descuenta. El tipo `merma` del
  libro de insumos existe y nadie lo escribe.
- **Abastecimiento propio** (D-H, decidido por Felipe contra la recomendación de Claude el 2026-09-19): `proveedores_produccion` (rubro tela,
  avíos, maquila u otro; solo líder), `comprobantes_produccion*` (la maquila entra como «Otro concepto» de texto, sin vínculo a la orden ni a una
  etapa; Recibir la rechaza), `cotizaciones_maquila` (precio de referencia por **tipo de prenda**, proveedor en texto libre; `fn_cotizacion_maquila_vigente`
  no la llama nadie) y `ordenes_insumo*` (OI-000001, sin vínculo a orden ni a comprobante; su parte 2 —recibir contra la orden— no existe).
- **El flujo real:** Resumen (líder: «Producir ya» por modelo) → Nueva orden (ADR-0396) → `abrir_produccion` → tablero de 4 columnas → cajón
  `OrdenPanel` («Marcar hecho» / «Enviar a maquila» / «Descontar al cortar») → `cerrar_produccion` (buenas por variante; costo atípico pide líder;
  escribe `movimientos` con motivo `produccion`) → enlace a Traslados. **Está probado en la suite `produccion_punta_a_punta.mjs`, nunca corrido en
  producción.**
- **Pantallas (11):** Resumen, Órdenes (tablero + cajón + hoja Nueva orden), Insumos, Recibir, Proveedores, Facturas de insumos, Por pagar (con la
  Deuda total de CAYLA y el IGV, D-I), Cotizaciones de maquila (fuera del menú), Eficiencia (pestaña) y Órdenes de insumos (módulo aparte). Solo
  Órdenes de insumos usa `<EncabezadoPagina>`; el resto tiene cabecera a mano. Hay dos matrices talla × color: `MatrizOrden` (lectura, en el cajón y
  el cierre) y `MatrizCantidades` (captura, en la hoja); la de la orden debería ser `MatrizCantidades` en modo lectura. Hay dos puertas para que
  entre tela (Ingresar insumo, sin papel; Recibir, contra factura).
- **Lo que nunca se usó ni existe:** ninguna orden real; la tela no se elige al abrir; tercerizar no sabe a quién ni cuántas; `costo_maquila` se
  teclea dos veces (al abrir y al cerrar) y nunca cuadra con un papel; la muestra terminada no abre lote (D4/A6 pendiente); la prenda no se ve ni en
  tarjeta ni en cajón; no hay hoja de corte ni orden de servicio impresas.

## 2. Lo que hace la clase mundial (lo que se repite en PLM y ERP)

1. **Modelo → color → talla; la variante es color × talla.** CAYLA ya lo tiene (`productos` → `variantes`). (FlexPLM, Infor PLM.)
2. **Una lista de materiales por modelo, con excepciones por color y consumo por talla**, nunca una lista por variante; la orden **congela** su copia
   al confirmarse y un cambio posterior no mueve órdenes abiertas. (Infor «Size Dependent», FlexPLM overrides por colorway.)
3. **El material es un registro con ficha corta** —tipo, composición, gramaje, ancho, unidad de compra, proveedor con precio, merma, foto— **y sus
   colores como hijos**: la orden toma «tela X en color Y», no un texto. (Infor, Centric.)
4. **La ruta de operaciones se declara en el producto y se copia a la orden; la etapa es la unidad de avance.** (Odoo, Katana, MRPeasy, Infor BOO.)
5. **Tercerizar es atributo de la ETAPA, no de la orden ni del producto:** la fila de la ruta lleva proveedor, tarifa congelada y fecha. Odoo y SAP lo
   ponen en el producto y obligan a inventar un subensamble para «solo el corte»: es el anti-patrón. (D365, Business Central, Infor, MRPeasy, Katana
   opción 2, AIMS360 «cada etapa lleva su propio contratista».)
6. **Lo que sale al servicio sigue siendo tuyo, en otro lugar; envío y recepción son documentos que no se borran.** Faltantes y rechazos aparecen **al
   recibir**, por talla y color. (SAP stock O, Odoo Subcontracting Location, BC WIP ledger.)
7. **El servicio es una compra:** la deuda nace de un documento y el costo cae en la orden; la tarifa viene de una lista de precios por proveedor con
   vigencia que **sugiere** y la orden **copia**. Ninguno teclea «costo de maquila» en la orden. (BC, Katana, Odoo.)
8. **Avance por etapa en cantidades** («cuántas desde el último inicio», merma con motivo); **solo las buenas avanzan**. Que la orden «se ajuste a lo
   real» si la última etapa reporta menos es una regla de MRPeasy, **no una decisión de CAYLA** (ver invariante en §6). (MRPeasy, Fulcrum, AIMS360.)
9. **La hoja de corte es la orden impresa, sin costos:** número de corte en todo papel, curva de tallas, tela (lote, ancho, metros + merma), bultos;
   concilia consumo teórico (tizada) contra real. (Uphance, Fashion-Incubator.)
10. **Materiales: reservar al abrir, consumir lo real al cortar; descuento automático solo para lo barato y estable** (avíos), nunca para la tela.
    (Katana, MRPeasy, ERPNext-garment.)
11. **Costo en dos columnas, estimado y real, que madura por etapa**; las causas del desvío con nombre. (Odoo MO Cost / Real Cost; WavePLM.)
12. **Muestras = pedidos con tipo, ronda y estado; la aprobación es un estado con quién, cuándo y qué se corrigió.** Para un taller propio bastan tres
    rondas (primera, calce, pre-producción). (Infor, Uphance, Delogue.) *Propuesta del arquitecto para CAYLA, no pedido de Felipe.*
13. **Tablero: con pocas órdenes, una cola por prioridad gana a un kanban**; rojo por tres causas con el porqué a un clic; atraso = fechas que se cruzan
    + días sin moverse. (Katana Schedule, Odoo filtros «Late».) *Se decide mirando una lámina, no por texto (ADR-0358).*
14. **Estados de la orden:** Borrador → Abierta → En proceso → Por cerrar → Cerrada, más **Detenida** con motivo. *«Detenida» es propuesta del arquitecto.*
15. **Lima en concreto:** la ficha peruana escribe la ruta «corte – habilitado – bordado – confección – acabado» (SENATI); se manda a servicio
    confección, bordado, estampado, lavandería y acabado; la maquila «recibe las prendas cortadas y habilitadas y las entrega cosidas»; el oficio dice
    «servicio», no «maquila»; se cobra por prenda (minutos × valor minuto), bordado por diseño + prenda, estampado por polo + matriz, lavandería por
    prenda; lo que vuelve se clasifica «primera / segunda / incompletos» y el faltante = enviado − devuelto. Las tarifas numéricas de Lima
    (corte S/ 0,50–0,60 de 2014; bordado S/ 5–8 por prenda desde 12 unidades; serigrafía S/ 5–15 por polo + matriz) son **[externo, sin verificar]**.
    Lo fiscal (detracción del 10 % en fabricación por encargo > S/ 700; factura o recibo como sustento) es **[externo, sin verificar] y tema del contador**:
    un taller de maquila factura (3.ª categoría), así que «recibo por honorarios» como tipo de comprobante de maquila no se propone.
16. **Lo que ningún PLM resuelve y CAYLA sí necesita:** el enlace orden → `movimientos` (prendas por variante al cerrar, tela por lote al cortar).
    Existe, probado en la suite y nunca corrido en producción: se diseña alrededor de él, no al revés.

## 3. Brechas

| Tema | CAYLA hoy | Clase mundial | Qué pide Felipe | Impacto Taller | Toca el núcleo |
|---|---|---|---|---|---|
| Etapas de la orden | 3 fijas en código, estado todo-o-nada por orden, sin orden ni cantidades | Ruta por producto copiada a la orden; etapa = unidad de avance con cantidades | «Las diferentes fases de producción textil» | Alto | No |
| Tercerizar | `etapas[x]='tercerizado'`: sin proveedor, tarifa, fecha ni cantidad; se marca después de abrir | Atributo de la etapa: quién, tarifa congelada, fecha; envío y recepción que no se borran | «Al crear una orden indicar si una parte se va a tercerizar: corte, costuras…» | Alto | No (prendas en servicio no entran a `stock`) |
| Pago al servicio | `costo_maquila` tecleado 2 veces; factura como texto sin vínculo | Devengado = tarifa × recibidas; el papel se cruza con la etapa | — (R-30: por prenda terminada) | Alto | Sí, parcial: entra a `costo_unitario` → `variantes.costo` |
| Tela por orden | Solo `productos.tejido_id` descriptivo; la tela aparece al descontar | Materiales congelados al abrir: tela + color + consumo; reserva derivada | «Escoger los tipos de tela» | Alto | No |
| Consumo por prenda o por talla | Solo medido por modelo tras una orden cerrada (D-D); Audaces no entra | Declarado por talla + medido; lo real corrige | — (R-26/R-27) | Medio | No |
| Ficha del insumo | nombre + unidad + mínimo + merma sin uso | composición, gramaje, ancho, color, unidad de compra ≠ consumo | «Tipos de tela» | Medio | No |
| Colores y tallas en la orden | Solo del vocabulario, y solo en modelo nuevo; en existente manda a Editar producto | Color elegido una vez y propagado; tallas de un rango | «Escoger los colores, las tallas» | Medio | No |
| Avance | «Marcar hecho» por orden entera; historial no se lee | Cantidades por etapa, quién, cuándo; solo buenas avanzan | «Que sea entendible» | Alto | No |
| Merma y segundas | `plan − buenas` al cerrar; nada por etapa | Buenas + falladas con motivo por etapa | — (R-31: merma < 3 %, «no hace falta modelar segunda calidad todavía») | Bajo mientras el 3 % se sostenga | No |
| Muestras | `es_muestra` bool, etapas fijas, «Dar por terminada» sin salida | Rondas con nombre, veredicto con quién | — (propuesta del arquitecto) | Medio | No |
| Hoja de corte / orden de servicio | No existe | Cut ticket sin costos; orden al servicio con tarifa | — (propuesta del arquitecto) | Medio | No |
| Varios tejidos / tela por color | Imposible | Líneas con rol (principal, forro) y excepción por color | — (propuesta del arquitecto) | Medio | No |
| Costeo | Generado de 3 números globales; el estimado tecleado se vuelve real | Estimado calculado vs real medido, por línea | — (ya decidido: C1/D-47/D-81, pantalla en deuda) | Alto | Sí: qué entra a `fn_recalcular_costo_variante` |
| Tablero | 4 columnas fijas, sin prenda, sin días en etapa | Cola por prioridad con chip de etapa, rojo por 3 causas | «La estética no convence» | Alto | No |
| Fecha por etapa | Solo `fecha_entrega` global, sin decir si es «sale del Taller» o «llega a la tienda» | Fecha prometida por etapa de servicio | — | Medio | No |

Las cinco pantallas gemelas de Compras (Proveedores, Facturas de insumos, Recibir, Por pagar, Órdenes de insumos) **no son una brecha**: son D-H, decisión de
Felipe. Lo que sí se migra, módulo por módulo y con su OK, son las piezas (`<Tabla>`, `<Vacio>`, `<Aviso>`, cabecera): comparten piezas, no pantallas.

## 4. Propuesta de estructura del módulo

**Principio rector:** la orden sigue siendo UNA (`producciones` + `produccion_lineas`, el pedido talla × color de ADR-0396) y gana tres cosas: **una ruta de
etapas como filas**, **su tela congelada** y **documentos de ida y vuelta para lo que sale del Taller**. El stock de prendas sigue naciendo solo en
`cerrar_produccion`; la tela sigue saliendo solo por `movimientos_insumo`. **Principio 5 (no sobre-construir para 0 órdenes):** cada tabla de abajo tiene un
dueño en el Taller que la llena; lo marcado *propuesta* se construye solo si Felipe lo pide.

### Entidades (todas en `retail.`, sin migrar datos)

| Entidad | Qué guarda | Reemplaza / depende de |
|---|---|---|
| `produccion_etapas` (una fila por etapa de la orden) | `produccion_id`, `etapa_clave`, `secuencia`, `quien` `taller \| servicio`, `proveedor_id` → `proveedores_produccion` (obligatorio si `servicio`), `tarifa` + `tarifa_por` `prenda \| lote` + `fijo_por_orden` congeladas al abrir, `fecha_prometida` (solo si es servicio), `nota`. **El estado se deriva** de avances, envíos y recepciones | `producciones.etapas` jsonb (se elimina); `produccion_etapas_historial` queda como bitácora con CHECK en `estado`. Las claves válidas: lista fija en código (P1/P2) o catálogo `etapas_taller` si Felipe quiere agregar fases desde Configuración |
| `produccion_avances` (no se borra) | `etapa_id`, `fecha`, `buenas`, `falladas` + `motivo_falla` (solo si P21 lo pide), `nota`, `hecho_por` = `fn_actor_persona_id(true)`. Interna: «Terminé N»; servicio: lo escribe la recepción. Deshacer = fila negativa. **Sin token** hasta que el doble clic sea problema medido (mismo criterio que ADR-0090 para el consumo; `/chaos` lo prueba) | «Marcar hecho» todo-o-nada |
| `produccion_envios` + `_prendas` (variante, cantidad, paquete opcional) + `_insumos` (insumo, cantidad) | Lo que sale a un servicio: fecha, `guia_remision` texto (misma forma que `numero_guia` de Traslados), `motivo` `servicio \| reproceso`. **La tela o los avíos que van al servicio se registran como `consumo` de la orden** (lo que ya existe y cuadra con el costo); lo que vuelve sin usar, como `devolucion`. Ningún tipo nuevo en el libro de insumos | «Enviar a maquila» sin datos |
| `produccion_recepciones` + `_prendas` (variante, `buenas`, `segundas`, `rechazadas`) + `_insumos` (sobrante devuelto) | Lo que vuelve; `en_servicio = enviado − recibido`; el faltante se cierra con motivo (como `comprobantes_produccion_cierres`) | — |
| `produccion_insumos` (materiales de ESTA orden) | `insumo_id`, `rol` `principal \| forro \| combinado \| avio` (*propuesta*: nace solo con `principal` y `avio`), `color_codigo` de la prenda a la que aplica (null = todos), `consumo_por_prenda` (+ `consumo_por_talla` jsonb opcional), `cantidad_plan` derivada = Σ consumo × prendas × (1 + merma). Reserva = plan − consumido, sin mover el libro | La tela que hoy «aparece» al descontar |
| `producto_insumos` (ficha de consumo del modelo) | Igual que arriba sin `produccion_id`; **sugiere**, la orden copia. **Reabre ADR-0133 d.5 / D-D** («no se revive `bom_items`; lo medido no miente») con una razón nueva: 232 modelos y 0 órdenes; lo medido corrige lo declarado al cerrar | Decide Felipe (P14) |
| `insumos` (columnas nuevas) | `tejido_id → tejidos` (el vocabulario que ya existe; **nunca un texto `familia_tela`**), `color_codigo → colores` (mismo vocabulario de la prenda; `tipo` ya distingue sólido/estampado), `composicion`, `gramaje`, `ancho_cm`, `unidad_compra` + `factor_a_consumo`, `encogimiento_pct` (*propuesta*, solo si P15 lo pide), `foto_url`. El alta pasa a una RPC `guardar_insumo` firmada | El `.insert` directo de `InsumoModales.tsx:59-70` |
| Tarifas del servicio | Lista de precios por proveedor: `etapa_clave`, `categoria_id` opcional, `tarifa`, `tarifa_por`, `fijo_por_orden`, `con_igv`, vigencia. Con 0 proveedores, **primero como columna JSON chica en `proveedores_produccion`**; tabla `proveedor_servicios` solo si crece. Sugiere al abrir; la etapa copia. `cotizaciones_maquila` queda como vara de mercado por categoría (D-31/D-82, intacta) | «Costo maquila» tecleado |
| Papel del servicio | **Depende de P10 (reabre d.63 de ADR-0362):** si queda como gasto de Finanzas, `gastos` gana `produccion_id` + `etapa_id` opcionales y la orden muestra devengado vs gasto; si pasa a Producción ▸ Facturas, `comprobantes_produccion_items.etapa_id`. En los dos casos el costo de servicio de la orden es el **devengado** (tarifa × recibidas) y nadie lo teclea | «Otro concepto» suelto |
| `producciones` (cambios) | `numero` correlativo `OP-000001` (trigger, como OI); `fecha_entrega` con su sentido decidido (P23); `costo_maquila` deja de teclearse (derivado); `costo_tela/avios` solo del libro; `tolerancia_pct` de corte (P22). *Propuestas:* `estado` gana `detenida` + motivo; `muestra_origen_id` + `muestra_veredicto` | `costo_*` tecleados |

**La tarifa congelada en la etapa es costo de la orden** y la ve quien ve `produccion` en ese Taller (C9/A4b); la lista de precios del proveedor y sus
datos bancarios siguen solo del líder (RLS de `proveedores_produccion`). Se confirma de pasada con Felipe.

### Funciones (todas `security definer`, firmadas con `fn_actor_persona_id(true)`; exigen `fn_ve_modulo('produccion')` + estar en el Taller, P24)

- `abrir_produccion_v2(…, p_etapas jsonb, p_insumos jsonb)` **aditiva**: las firmas de `abrir_produccion` y `abrir_produccion_con_modelo_nuevo` no cambian
  (ADR-0396 «Lo que NO cambia»). Valida fecha no pasada, NaN, variante activa, producto producible (cierra el candado #6).
- `avanzar_etapa(p_etapa_id, p_buenas, p_falladas, p_motivo)`: nunca más prendas de las que entraron a la etapa (CHECK derivado); `deshacer_avance` = fila negativa.
- `enviar_a_servicio` / `recibir_de_servicio` (cantidades por variante; recibir ≤ enviado − recibido; la tela que va es `consumo`, la que vuelve `devolucion`).
- `aprobar_muestra(p_veredicto, p_nota)` y «Producir este modelo» (D4/A6): *propuesta*, se construye en la tercera entrega.
- `cerrar_produccion` **no cambia de firma** (ADR-0090): la pantalla precarga `p_buenas` con las buenas de la última etapa y manda `null` en costos.
  **Invariante nueva (principio 2):** Σ buenas de la última etapa ≥ Σ `cantidad_buenas` del cierre, y el cierre falla si la supera. Que el cierre deje de
  hacer `coalesce` con lo tecleado es RPC y dinero: de Felipe (se confirma con C1).
- `anular_produccion` con prendas en servicio (`en_servicio > 0`): **no se anula** hasta recibirlas o darlas por perdidas con motivo; `revertir_produccion`
  no cambia (sigue fallando por stock si ya se trasladó; avisar antes es tarea de la pantalla).

### Pantallas (menú `produccion`, sin módulo nuevo: todo lo de adentro es función del módulo, ADR-0306)

1. **Resumen** (líder): como hoy + un bloque «Hoy en el Taller»: N órdenes por etapa, N en servicio con quién. (No es pantalla: sería un módulo, A4/ADR-0306.)
2. **Órdenes:** lista o columnas, cajón o página, cabecera: **se eligen mirando una lámina** (claro y oscuro, 1024 y 1440 px, con los tokens y la pieza de orden),
   como `/unificar`, no por texto. Lo que no cambia: la prenda se ve (`MosaicoPrenda`), `OP-000012`, `<Chip>` de etapa + «en Servicio X», días en la etapa, rojo
   solo por fecha pasada, material que llega tarde o N días sin moverse, con «¿Por qué?» a un clic (ley 6); filtros `DesplegablePildora`; Muestras y Terminadas como píldora.
3. **La orden:** ruta de etapas como piezas (hecha ✓ / actual encendida / pendiente), cada una con quién, cantidades, fecha; acción única por etapa: «Terminé N»
   (interna) o «Enviar» / «Recibir» (servicio) con la misma `MatrizCantidades` en modo pedido / cortado / recibido; «Materiales» (tela por color, consumo,
   plan vs descontado, alcanza / falta); «Costo» estimado vs real en dos columnas; línea de tiempo desde `produccion_avances` + historial; «Imprimir hoja de
   corte» / «Orden de servicio» (*propuesta*, dos plantillas fijas `.papel-fijo`, sin editor). Guía de foco y guía interactiva obligatorias.
4. **Nueva orden** (ADR-0396 A1–A3 intactos) + dos bloques: «¿Qué tela y avíos lleva?» (sugerido desde la ficha del modelo o la última orden, editable) y «Fases y
   quién las hace» (ruta con interruptor Taller / Servicio por fila, proveedor, tarifa sugerida, fecha). Los 3 `<CampoMonto>` tecleados desaparecen (C1).
   **Pagas** (ley 8, quitar antes de agregar): la hoja gana una sección con un interruptor por fase.
5. **Insumos:** ficha completa (`<Tabla>`); las dos puertas de entrada siguen hasta que exista la parte 2 de Órdenes de insumos (recibir contra la orden); «Ingresar insumo» pide origen.
6. **Abastecimiento:** Proveedores (gana una pestaña «Servicios y tarifas», que absorbe Cotizaciones de maquila), Órdenes de insumos, Facturas de insumos, Recibir,
   Por pagar (la Deuda total de CAYLA y el IGV se quedan: D-I, de Felipe; se confirma de pasada).

Reglas del repo que aplican sin discusión: solo tokens y piezas únicas (`<Volver>`, `<Pestanas>`, `<TarjetaCifra>`, `<Boton>`, `<Chip>`, `<Vacio>`, `<Aviso>`,
`<Buscador>`, `<BarraApilada>`, `<Tabla>`, `<Casilla>`/`<Interruptor>`, `<Modal>`), guía de foco en cada hoja con campos, guía interactiva por pantalla,
`/sugerir`, `/chaos` en todo lo que guarda, `/formidable` al cerrar, migraciones con `retail.` y políticas aparte (ADR-0195), números reservados (ADR-0381),
ningún `DELETE`.

## 5. Decisiones que son de Felipe

Las **24 preguntas finales** van en «Preguntas para Felipe», al final, ordenadas por lo que más condiciona el diseño y en lenguaje de tienda. Antes, lo que
**no se pregunta** porque ya está decidido (solo se confirma de pasada), lo que **se decide mirando** y lo que queda para **segundo orden**.

### Ya decidido: se confirma de pasada, no se pregunta

- **El costo de tela y avíos sale del consumo real, no de un campo tecleado** (D-47 del 2026-09-12, D-81 del 09-21, ADR-0133 d.4; inventario C1: «regla vigente,
  pantalla en deuda»). Se aplica: los tres `<CampoMonto>` se van y `cerrar_produccion` recibe `null`. Lo único abierto es que el cierre deje de hacer `coalesce`
  con lo tecleado (RPC: de Felipe, una línea).
- **La costura hecha adentro NO entra al costo de la prenda** (D-31: eficiencia absorbida + referencia de maquila externa; D1 «nada inventado»; C20: el semáforo
  60/40 ya la absorbe). `variantes.costo` no cambia de significado.
- **El corte puede salir a un servicio** (Felipe, hoy: «maquilar aparte, por ejemplo el corte o las costuras»). Queda solo «¿al abrir o al llegar?» (P4).
- **A la maquila se le paga por prenda terminada; si cobra por lote, se reparte entre las que salieron** (R-30). P6 solo elige la forma de cargarlo.
- **La merma es < 3 % y no se modela segunda calidad** (R-31). P21 pregunta solo si el dato cambió.
- **ADR-0396 A1–A3:** modelo primero, tipo deducido con interruptor, `MatrizCantidades` única sin − y +, hoja ancha con ficha viva, plazos «1 semana · 2 semanas
  · 1 mes · otra fecha» (A5), «Producir este modelo» (A6/D4), costos del Taller visibles a quien ve `produccion` (C9/A4b: regla por módulo, se confirma al escribir A4b).
- **Producción y Compras son dos módulos con directorio y libro aparte** (D-H); Cotizaciones de maquila por categoría es vara de comparación, nunca tarifa de una orden
  (D-31/D-82/ADR-0156); «Deuda total de CAYLA» e IGV dentro de Por pagar (D-I).
- **El Taller no emite comprobantes** (A3): la guía de remisión electrónica por Lucode (motivo 17 ida / 07 vuelta) **no se ofrece ahora**; el número de guía va como texto.
- **Propuestas del arquitecto que Felipe no pidió** y que entran solo si dice que sí: rondas de muestra con veredicto, estado «Detenida», líneas de tela con rol
  (forro, combinado), hoja de corte y orden de servicio impresas, «corte y confección no apagables», «cambiable hasta que la etapa empiece».

### Se decide mirando, no por texto (ADR-0358; el 2026-10-06 Felipe eligió por texto y al verlo no le gustó)

Una lámina en claro y oscuro, a 1024 y 1440 px, dibujada con los tokens y una orden real de ejemplo: **(a)** lista con chip de etapa vs columnas por etapa vs lista +
«Hoy en el Taller»; **(b)** cajón vs página para la orden; **(c)** cabecera `<EncabezadoPagina>` vs `<CabeceraPantalla>` (CLAUDE.md: «en cualquier otro módulo la
cabecera está sin decidir: pregúntale a Felipe»); **(d)** Cotizaciones como pestaña de Proveedores.

### Segundo orden: se preguntan al construir, no ahora

¿Qué orden va primero (fecha, estrella o las dos)? · ¿Las costureras cobran sueldo fijo o por prenda (si es por prenda, «Terminé N» dice quién)? · ¿La muestra
aprobada se guarda como referencia, entra al stock o se decide al aprobarla? · ¿Quieres ver en cada orden cuánto habría costado afuera (conecta
`fn_cotizacion_maquila_vigente`, sin cambiar el costo de la prenda)? · ¿«Producir ya» mira si hay tela antes de sugerir? · ¿Tus avíos cambian según la talla o
el color (hilo a tono, cierre más largo en XL)? · ¿Tu Taller cuenta el encogimiento al pedir tela (como % por tela o solo si va a lavandería)? · ¿El ponchado o
la matriz se paga una vez por diseño o en cada orden? · ¿Quieres una curva de tallas de un clic? (el fantasma de `MatrizCantidades` ya sugiere la de la red) ·
¿Una talla que la categoría no tiene se agrega desde la orden? · ¿Algún día un colaborador del Taller registra comprobantes?

**Actividad A0 de `/construir` (antes de la primera migración):** 30 minutos con la encargada del Taller: tarifa actual de corte por prenda, valor minuto 2025,
precio por millar de puntadas de su bordador, cobro y plazo de su lavandería, cómo liquida hoy faltantes y segundas con la maquila, qué papel le manda hoy (foto
del WhatsApp real) y un archivo de ejemplo de lo que exporta Audaces.

## 6. Lo que NO se debe tocar

- **`movimientos` como única fuente de verdad, `stock` derivado por `fn_aplicar_movimiento`.** El stock de prendas sigue naciendo **solo** en `cerrar_produccion`
  (entrada, motivo `produccion`) y saliendo en `revertir_produccion`; las prendas en corte, costura o en un servicio **no entran a `stock`** (lo que hay afuera se
  deriva de avances, envíos y recepciones). Ninguna función nueva inserta en `movimientos`. La invariante que une recepción y cierre: Σ buenas de la última etapa
  ≥ Σ `cantidad_buenas` del cierre, y el cierre falla si la supera.
- **Firmas vivas:** `abrir_produccion`, `abrir_produccion_con_modelo_nuevo` (la v2 es aditiva), `cerrar_produccion` (ADR-0090: dos sobrecargas rompen PostgREST),
  `registrar_consumo_insumo` / `devolver_insumo_de_produccion` (PEPS, un lote, sin partir, sin token), `recibir_insumo` (token + advisory lock),
  `fn_recalcular_costo_variante` y `fn_aplicar_movimiento` (revocadas a la API), `fn_costo_fuera_de_banda` + `p_confirma_costo_atipico` (ADR-0298).
- **El libro de insumos:** sus CHECK (`consumo/devolucion ⇒ produccion_id`; `compra/merma/ajuste ⇒ sin`) no cambian: la tela que va al servicio es `consumo` y la
  que vuelve `devolucion`; no se inventa un cuarto estado de tela para un taller.
- **Costeo:** promedio ponderado (ADR-0067/D-45), `costo_historial` que no se borra, piso de costo (ADR-0370 C11), margen contra el precio propio más bajo (C10),
  semáforo 0,6/0,4 y sus palabras (B13), coma decimal solo explicada (B12), precio obligatorio en lote y opcional en muestra (B4).
- **Arquitectura del módulo:** D-H, A2 (Producción solo parado en un Taller), A3, menú con 6 hijas máximo y `ordenes_insumos` como módulo propio (A6), D-I, D-31/D-82,
  D-F (gastos del Taller sin tabla propia), ADR-0090 (insumos por lote, saldo derivado, archivar nunca borrar).
- **Resumen y «¿qué producir?»:** unidad = modelo (D2), producible según ADR-0377 (D3), poca base = 2 ventas (D4), vara fija 7/30/60 (D5), «Producir ya» por talla y
  color (D6), motor de demanda al lado de la curva (D8), cobertura con poca muestra sin «conservación» (D9), «nada inventado» (D1).
- **Reglas transversales:** solo tokens (ADR-0169/0336), piezas únicas (ADR-0358), movimiento sin rebote (ADR-0136), loader único (ADR-0149), guía de foco (ADR-0284),
  sugerencias coherentes (ADR-0290), guías interactivas (ADR-0389), módulos y roles (ADR-0161/0306), migraciones con `retail.` y políticas aparte (ADR-0195), sin
  `select … into` en texto entre comillas (ADR-0288), números reservados (ADR-0381), **nunca `DELETE`** en `movimientos`, `movimientos_insumo`, `produccion_avances`
  ni catálogos con historial.
- **Lo rechazado que no se re-propone:** Producción como padre de Compras; un solo directorio de proveedores; una receta manual que MANDE sobre lo medido (aquí la ficha
  solo sugiere y lo medido la corrige); tela, tallas o colores en texto libre; precio de transferencia del Taller; días de trabajo por etapa inventados; bultos con
  código de barras y pago a destajo por operación; subcontratar el producto entero con ubicaciones por maquilador.

## Verificar antes de construir

1. **Qué hay en producción:** `abrir_produccion_con_modelo_nuevo` (20261010210000) figura como «no pegada» en el ciclo de vida y como «en producción» en ADR-0361: listar
   las migraciones de Producción no aplicadas (20260924000000 paso 1, 20261010210000, 20261013035000, 20261012214000) con `pnpm datos:comparar` y un `select` de solo
   lectura sobre `pg_proc` del schema `retail`; confirmar que existe una `ubicaciones` con `tipo = 'taller'` activa (si no, explica las 0 órdenes mejor que cualquier rediseño).
2. **`cerrar_produccion` con costo derivado y órdenes sin insumos:** sin tela cargada, `costo_unitario = 0` → `fn_costo_fuera_de_banda` → `sin_costo` → la cuenta del
   Taller no puede cerrar. Leer `20260930120000` y `20260930121000`, decidir si «sin insumos cargados» pide confirmación o bloquea; correr `pnpm pruebas:produccion-costo-atipico`.
3. **A dónde apunta `insumos.proveedor_id`:** `20260917145000` lo creó contra `retail.proveedores` (Compras) y `20260920110000:88-94` soltó la FK; confirmar en producción.
4. **Cada lugar que enumera motivos del libro de insumos** (`efectoEnSaldo`, `saldoDeLote`, `v_insumo_saldos`, `previsualizarConsumo`, `fn_recalcular_costo_insumos_produccion`):
   la tela que va al servicio como `consumo` cuenta al costo del lote; correr `pnpm pruebas:insumos-devolucion` y `produccion-punta-a-punta` como línea base.
5. **Tope `cantidad_buenas ≤ cantidad_plan`** en `20260915130000` (hoy no lo hay) y qué hace `revertir_produccion` con una orden que tuvo envíos.
6. **Suites que cargan estas funciones:** un parche a `cerrar_produccion`, `fn_recalcular_costo_variante` o `registrar_consumo_insumo` se suma a las listas `DESHACER_*`
   de cuadrar-piso y frescura-*; una prueba nueva va en `PRUEBAS` de `scripts/ci/pruebas-postgres.mjs`.
7. **Vocabularios que ya existen:** `retail.tejidos` + `categoria_tejidos`; `retail.colores` (`tipo`, `familia_color`, `pantone_tcx`); `numero_guia` de
   `20260916150000_traslados_dos_fases.sql`; `fn_sububicacion_por_defecto(taller, 'entrada')`.
8. **Permisos reales:** `apps/web/lib/modulos.ts:197` siembra `produccion` al rol integrante (contradice «nace solo para el líder»); confirmar con `rol_modulos` y
   `fn_puede_operar_ubicacion` qué cuentas pueden hoy abrir y cerrar órdenes; `pnpm pruebas:roles` tras cualquier función nueva.
9. **Tableros que el rediseño debe bajar, no subir:** `PENDIENTES_HOY` / `MODALES_PENDIENTES_HOY` (Producción tiene ≥ 7), `lib/sugerir-archivos.ts`, la `deuda` de
   `apps/web/unificar/familias.mjs`, las 11 huellas de `lib/guias/huellas/`, el tope de 6 hijas de `lib/menu.ts`.
10. **Formato real de Audaces y el papel que hoy viaja a la maquila:** no están en el repo; se piden a la encargada (A0) con un archivo y una foto.
11. **Citas externas sin respaldo en `docs/`:** Informe 057-2017, detracción 10 % > S/ 700, ficha SENATI, tesis UNMSM/CAF, cada URL de §2: marcadas [externo, sin verificar]; lo fiscal
    es del contador y no entra al ERP.

## Fuentes

**Repo (VERIFICADO):** `supabase/migrations/20260915130000_produccion_del_taller.sql`, `20260917145000_insumos_taller_reconstruido.sql`,
`20260920100000_devolver_insumos_de_produccion.sql`, `20260920110000_proveedores_produccion.sql`, `20260921100000_comprobantes_produccion.sql`,
`20260921151000_candado_dinero_produccion_columnas.sql`, `20260922160000_cotizaciones_maquila.sql`, `20260930121000_cerrar_produccion_costo_atipico.sql`,
`20261010210000_abrir_produccion_con_modelo_nuevo.sql`, `20261013035000_ordenes_insumo_esquema.sql`; `apps/web/lib/produccion-reglas.ts`,
`produccion-decision-reglas.ts`, `insumos-reglas.ts`, `modelo-nuevo-reglas.ts`; `apps/web/components/{OrdenPanel,OrdenCierre,OrdenInsumos,InsumoModales,NuevaOrdenProduccionForm}.tsx`;
`docs/adr/{0051,0090,0133,0156,0161,0298,0361,0362,0370,0371,0377,0396}-*.md`; `docs/datos/15-COMO-OPERA-CAYLA.md` §7; `docs/datos/DECISIONES-2026-09-12.md`;
`docs/pantallas/produccion.md`, `docs/pantallas/produccion-ordenes-nueva.md`; `docs/PLAN-PRODUCCION.md`.

**PLM:** FlexPLM tallas y colorways https://support.ptc.com/help/windchill/Windchill-FHC/en/FlexPLM_Help_Center/SizeDefinitionColorSizeIntroduction.html ·
overrides https://support.ptc.com/help/windchill/Windchill-FHC/en/FlexPLM_Help_Center/BillofMaterialsOverridesColorways.html ·
costing https://support.ptc.com/help/windchill/Windchill-FHC/en/FlexPLM_Help_Center/CostingIntro.html ·
muestras https://support.ptc.com/help/windchill/Windchill-FHC/en/FlexPLM_Help_Center/SamplesMultiSampleRequests.html ·
Infor BOM https://docs.infor.com/iplmfsh/2026.07/en-us/useradminlib/iplmfshug/qia1599696836313.html ·
Infor materiales https://docs.infor.com/ifplm/16.0.13/en-us/ifplmceug/qla1530683715075.html ·
Infor BOO https://docs.infor.com/iplmfsh/2026.07/en-us/useradminlib/iplmfshug/afx1599696937675.html ·
Infor muestras https://docs.infor.com/iplmfsh/2026.07/en-us/useradminlib/iplmfshsog/tpr1671737179056.html ·
Centric materiales https://www.centricsoftware.com/blog/8-things-you-need-to-know-about-centrics-materials-management-module/ ·
WavePLM colorway https://blog.waveplm.com/what-is-a-colorway-a-complete-guide/ · costeo https://blog.waveplm.com/?p=6051 ·
Uphance muestras https://www.uphance.com/blog/what-is-a-pre-production-sample-review-and-when-it-belongs-in-plm/ · cut ticket https://uphance.com/blog/what-is-a-cut-ticket-and-why-it-belongs-in-erp/ ·
Techpacker https://techpacker.com/blog/what-is-a-tech-pack · OCS consumo https://onlineclothingstudy.com/2020/04/how-do-we-calculate-fabric-consumption.html ·
Audaces https://audaces.com/en/solutions/marker

**ERP/MRP:** Odoo BoM y operaciones https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html ·
Odoo Shop Floor https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html ·
Odoo costos https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/mo_costs.html ·
Odoo atrasos https://www.odoo.com/documentation/master/applications/inventory_and_mrp/manufacturing/reporting/delayed.html ·
Odoo subcontratación https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html ·
Katana estados https://support.katanamrp.com/en/articles/271-manufacturing-order-production-statuses · Schedule https://support.katanamrp.com/en/articles/5914378-using-the-make-screen-schedule ·
disponibilidad https://support.katanamrp.com/en/articles/5914374-ingredients-availability · parcialmente tercerizado https://support.katanamrp.com/en/articles/6215435-partially-outsourced-manufacturing ·
MRPeasy avance https://www.mrpeasy.com/resources/user-manual/reporting/my-production-plan/details/ · subcontratación https://www.mrpeasy.com/resources/user-manual/settings/system/professional-functions/subcontracting ·
D365 https://learn.microsoft.com/en-us/dynamics365/supply-chain/production-control/manage-subcontract-work-production ·
Business Central https://learn.microsoft.com/en-us/dynamics365/business-central/subcontract-wip-transfers · precios https://learn.microsoft.com/en-us/dynamics365/business-central/subcontract-prices ·
Infor LN https://docs.infor.com/ln/2024.x/en-us/lnloca/lpindlocug/hed1633673887745.html · SAP AFS https://help.sap.com/saphelp_afs60/helpdata/en/0d/3ac638ca1d6527e10000000a11402f/content.htm ·
AIMS360 https://www.aims360.com/features-integrations/production-process-tracking · ERPNext garment https://ecosire.com/apps/erpnext/erpnext-garment-apparel-manufacturing ·
Fulcrum https://fulcrumpro.com/software/job-tracking · Zedonk https://zedonkopedia-docs.screenstepslive.com/a/1271932-book-out-add-production-order-in-production-orders ·
Fashion-Incubator https://fashion-incubator.com/what-is-a-cutting-ticket/

**Lima y Perú [externo, sin verificar]:** CAF/ADEX «La confección del progreso» https://scioteca.caf.com/bitstream/handle/123456789/437/La_confeccion_del_progreso._Subcontratacion_en_el_sector_de_textiles_de_exportacion_en_el_Peru.pdf ·
UNMSM talleres externos https://eventosindustrial.unmsm.edu.pe/upg_old/archivos/TESIS2018/MAESTRIA/tesis8.pdf · PUCP corte https://tesis.pucp.edu.pe/server/api/core/bitstreams/3093332f-4f9c-4eb8-baea-0b0cbf9e5d5e/content ·
SENATI https://www.senati.edu.pe/sites/default/files/escritorio/Comunicados/PUBLICACIONES-19/manual-uniforme-senati-act.pdf ·
MINEDU costura y acabados https://www.minedu.gob.pe/superiortecnologica/pdf/catalogo/actual/industria-manufacturera/fabricacion-prendas-de-vestir/costura-y-acabados-publicado-18-12-2018.pdf ·
APTT https://apttperu.com/calidad-post-costura-estrategias-para-la-competitividad-textil-peruana/ · SUNAT motivos de traslado https://www.sunat.gob.pe/legislacion/superin/2024/anexo1-000240-2024.pdf ·
SUNAT Informe 117-2003 https://www.sunat.gob.pe/legislacion/oficios/2003/oficios/i1172003.htm · detracción https://www.sunat.gob.pe/legislacion/oficios/2006/oficios/i1512006.htm ·
Informe 057-2017 https://www.sunat.gob.pe/legislacion/oficiosAd/2017/informes/2017-INF-057-5D1000.pdf ·
Gamarra condiciones https://fabricantes.gamarra.com.pe/fabricante/corte-y-confeccion-a-pedido-talleres-textiles-reyes/ · bordado https://fabricantes.gamarralima.com/servicio-de-bordado ·
estampado https://polospublicitarios.pe/estampado/estampados-de-polos/ · Chroma https://www.chromaestampados.com/blog/cuanto-cuesta-estampar-polos-lima-precios ·
lavandería https://www.industrialrivero.com/ · textiltelar encogimiento https://textiltelar.com/consumo-tela-produccion-prendas/

**Marcas chicas:** Uphance orden https://help.uphance.com/en/articles/1296605-how-to-create-a-production-order · thefword https://thefword.ai/is-fashion-plm-software-right-for-small-brands-and-startups ·
Fashion-Incubator números https://fashion-incubator.com/how_to_issue_style_numbers_pt129/ · Ohavah repedido https://ohavah.com/blog/how-to-know-when-to-reorder-vs-move-on ·
Fittly curva https://www.fittlyapp.com/en/apparel-size-curve · Kōbō https://www.kobolabs.io/blog/ops/plm-vs-erp · Linear https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026

---

## Preguntas para Felipe

Veinticuatro preguntas de negocio, ordenadas por lo que más condiciona el diseño y agrupadas en bloques de hasta cuatro para `AskUserQuestion`. Cada opción dice qué
ganas y qué pagas; la recomendada va primera. Nada de Postgres ni de Next: eso lo decide el arquitecto. Donde hay un dato de referencia (cómo cobra una maquila en
Lima, qué hace otro sistema) va en la opción, para que decidas con contexto.

### Bloque 1 · Tercerización

**T1 · Cuando dices «tercerizar una parte de la producción», ¿qué parte?**
- **Una fase entera (recomendada):** todo el bordado va a un bordador, toda la costura a una maquila; el corte puede salir igual. Ganas: la ruta se lee en una línea
  por fase, un costo y una fecha por fase; es lo que hacen D365, Business Central, Infor y los ERP de moda (AIMS360: «cada fase lleva su propio contratista»). Pagas:
  para repartir las prendas de una fase entre dos talleres hay que abrir dos órdenes.
- **Una parte de las prendas:** la mitad se cose adentro y la mitad en Gamarra, en la misma orden. Ganas: una sola orden. Pagas: cada fase puede tener dos «quién» y
  el avance se cuenta por envío, no por fase; la pantalla y el costo se complican para un caso que con 3 tiendas casi no ocurre.
- **Las dos cosas:** Ganas: cubre todo. Pagas: lo más complejo de la hoja y del costo; nadie lo llena si no pasa seguido.

**T2 · ¿Cuándo se dice quién hace cada fase: al abrir la orden o cuando le toca?**
- **Al abrir, y se puede cambiar hasta que esa fase empiece (recomendada):** Ganas: la orden nace con su costo de servicio y su fecha prometida; el estimado no miente.
  Pagas: la hoja de Nueva orden gana una sección con un interruptor Taller / Servicio por fase (contra «quitar antes de agregar»).
- **Cuando le toca, como hoy:** Ganas: la hoja de Nueva orden queda igual. Pagas: la orden nace sin costo de servicio ni fecha prometida; el estimado miente hasta que alguien se acuerde.

**T3 · Cuando mandas cortes a coser (o prendas a bordar), ¿qué se anota?**
- **Un vale de salida y una recepción, por talla y color (recomendada):** cuántas se van (y qué avíos o tela), cuántas vuelven buenas, segundas o rechazadas; lo que falta se
  cierra con motivo; el número de guía va como texto. Ganas: faltantes y segundas aparecen al recibir, el pago sale de lo recibido (R-30), la tela que salió sigue siendo tuya
  en el libro. Pagas: dos pantallitas más (Enviar, Recibir) con la misma tabla talla × color.
- **El vale cuenta paquetes:** la maquila en Lima recibe «cortes habilitados» en paquetes de ~30 por talla y color, y su queja más repetida es «que los paquetes vengan
  completos». Ganas: un talón por paquete y cuadrar lo que volvió incompleto por bulto. Pagas: hay que armar y numerar paquetes antes de cada envío; con 3–5 bultos por orden puede ser exceso.
- **Solo «se fue», con fecha prometida (hoy):** Ganas: un clic. Pagas: no se sabe cuántas están afuera ni cuántas faltaron; no hay de dónde sacar el pago.

**T4 · ¿Cómo se le paga a cada servicio?**
- **Por prenda buena recibida, con un fijo opcional por orden (recomendada):** la costura por prenda (en Lima: minutos × valor minuto), el bordado con su ponchado
  aparte (S/ 30–60 por diseño [externo]) más por prenda, el estampado con su matriz. Ganas: cubre lo real sin regla escondida; el descuento por fallas sale solo.
  Pagas: un control más («fijo por orden») en la tarifa.
- **Por lote fijo, repartido entre las que salieron:** como cobra una lavandería por carga. Ganas: sirve para lo que se cobra por carga. Pagas: el unitario sube en
  silencio si volvieron menos; no sirve para la costura.
- **Se elige en cada fase:** Ganas: cada servicio con su forma. Pagas: dos controles más en la hoja, en cada fase.

**T5 · Si mandaste 100 y volvieron 97 buenas, ¿qué se le paga al taller externo?**
- **Por las 97, y las 3 perdidas las absorbe CAYLA (recomendada):** es lo que dice R-30 y no mete dinero nuevo. Ganas: simple; la merma por orden queda registrada.
  Pagas: nadie le cobra al taller su descuido.
- **Por las 97, y se le descuenta la tela de las 3:** práctica de las exportadoras limeñas (el faltante se liquida como descuento al maquilero). Ganas: el que pierde paga.
  Pagas: Por pagar necesita una línea de descuento y alguien que la negocie por WhatsApp.
- **Por las 100:** es su merma normal. Ganas: cero discusión. Pagas: pagas prendas que no existen.

**T6 · Cuando el taller externo te dice «S/ 4 por prenda», ¿es con IGV o sin?**
- **Se marca en cada tarifa, sin IGV por defecto (recomendada):** Ganas: el devengado cuadra con el papel sea factura (18 %) o nota sin IGV; el costo de la prenda no
  cambia 18 % por sorpresa. Pagas: una casilla más en la lista de precios del proveedor.
- **Siempre sin IGV; la factura lo agrega:** Ganas: una regla. Pagas: el taller de Gamarra que da nota de venta «todo incluido» queda mal cargado.
- **Siempre todo incluido:** Ganas: lo que te dicen es lo que pagas. Pagas: el crédito fiscal de la factura se pierde en la cuenta.

**T7 · ¿Le adelantas plata a la maquila antes de que entregue, y quieres que Por pagar separe la detracción?**
- **No hay adelanto; la detracción la ve el contador (recomendada):** Ganas: nada nuevo en Por pagar; lo fiscal fuera del ERP. Pagas: si un día adelantas el 50 % (práctica
  de Gamarra), no hay dónde anotarlo.
- **Sí hay adelanto, se anota contra la fase y se descuenta del pago final:** Ganas: Por pagar dice la verdad. Pagas: un pago sin papel contra una fase; hoy un pago solo se
  registra contra un comprobante.
- **Adelanto y además Por pagar separa «a pagar al proveedor» y «a depositar por detracción»:** la fabricación por encargo > S/ 700 lleva detracción del 10 % cuando CAYLA
  pone la tela [externo, sin verificar]. Ganas: el saldo es lo que de verdad sale de la cuenta. Pagas: regla fiscal dentro del ERP que el contador tiene que validar.

**T8 · ¿Quién puede anotar «volvieron 97 de la maquila»?**
- **Cualquiera que vea Producción en el Taller; la tarifa ya está congelada y el dinero sale solo (recomendada):** Ganas: quien recibe los bultos lo anota en el momento;
  la cuenta compartida del Taller no toca montos. Pagas: una cuenta de aparato crea deuda sin ver la cifra.
- **Cualquiera anota las prendas; el líder confirma la tarifa después:** Ganas: dos ojos sobre el dinero. Pagas: un paso más que, si nadie lo hace, deja el costo de la orden a medias.
- **Solo el líder:** Ganas: control total. Pagas: si el líder está en Trujillo, lo recibido espera.

### Bloque 2 · Fases

**F1 · ¿Qué fases tiene una orden de lote en tu Taller?**
- **Las 6 de la ficha limeña: corte (con habilitado) → confección → bordado → estampado → lavandería → acabado; cada orden marca cuáles usa (recomendada):** Ganas:
  refleja lo que se manda a servicio hoy (R-29) y permite decir a quién fue cada una. Pagas: una orden simple marca dos fases y deja cuatro apagadas.
- **Las 6 más control de calidad como fase propia:** la última, la que dice cuántas entran al stock (así lo hacen Topitop y las fichas del MINEDU). Ganas: una sola
  fase dice la verdad del cierre. Pagas: una fase más que alguien tiene que marcar aunque la haga la misma persona que acaba.
- **Las 6 más moldes, escalado y tizado como fase de la orden:** Ganas: se ve cuando el tizado se manda a servicio (Gamarra lo vende aparte). Pagas: es trabajo del modelo,
  no de cada orden; se repite en cada lote.
- **Solo las 3 de hoy (corte → confección → acabados):** Ganas: nada que cambiar. Pagas: bordado, estampado y lavandería quedan escondidos dentro de «acabados» y no se puede decir a quién fue cada uno.

**F2 · ¿Quién puede agregar una fase nueva (sublimado, plisado)?**
- **Solo nosotros, con una actualización (recomendada):** con 0 órdenes, una lista fija basta. Ganas: cero pantallas nuevas; nada que nadie llene. Pagas: un servicio nuevo espera un deploy.
- **Tú, desde Configuración:** Ganas: el Taller no depende de un deploy. Pagas: una tabla y una pantallita en Configuración con su guía y su demo.

### Bloque 3 · Tela

**L1 · Cuando dices «escoger el tipo de tela» en la orden, ¿qué eliges?**
- **Las dos: el tejido (lino, jersey, drill) filtra qué rollos del estante se pueden elegir (recomendada):** Ganas: la orden sabe qué lleva y «¿alcanza?» puede responder;
  usa el vocabulario de tejidos que ya existe en Catálogo. Pagas: cada rollo del estante tiene que decir de qué tejido es (una ficha más completa al ingresarlo).
- **El tejido, igual que en la ficha del producto:** Ganas: cero cambio en Insumos. Pagas: «tejido» es descriptivo, no es un rollo con metros: «¿alcanza?» sigue sin poder responder.
- **El rollo del estante (con su color, lote y metros):** Ganas: lo más exacto. Pagas: sin el tejido como filtro, la lista de rollos es larga y se elige a ciegas.

**L2 · ¿De dónde sale «1,4 m por prenda»? (reabre lo decidido en ADR-0133: «lo medido no miente»; la razón nueva: 232 modelos y 0 órdenes)**
- **Se escribe una vez por modelo (el número de Audaces) y lo medido lo corrige al cerrar cada orden (recomendada):** Ganas: arranque inmediato y corrección automática;
  es lo que hacen los PLM con «lo que de verdad llegó». Pagas: un número que alguien tipea una vez por modelo y puede copiar mal.
- **Se pega el archivo que exporta Audaces:** Ganas: exacto y por talla. Pagas: hay que ver qué formato exporta (pedirlo a la encargada) antes de prometerlo.
- **Solo medido tras la primera orden cerrada, como hoy:** Ganas: nada inventado. Pagas: con 232 modelos y 0 órdenes, cubrir el catálogo tarda años y la primera orden de cada modelo no sabe si alcanza la tela.

**L3 · La tela se compra por kilo o rollo y se corta por metro: ¿el sistema convierte?**
- **Sí: cada tela dice cómo se compra y cuánto rinde por metro (recomendada):** el jersey 24/1 rinde ~3 m por kilo [externo]. Ganas: el Taller habla en metros y la factura en
  kilos, y los dos cuadran; cierra lo que `15-COMO-OPERA` llama «la primera cosa que hay que resolver». Pagas: el factor se declara al crear la tela y se corrige al recibir.
- **Una sola unidad por tela, como hoy:** Ganas: nada. Pagas: el jersey comprado por kilo se descuenta en kilos y el consumo por prenda se escribe en kilos.

**L4 · ¿La tela tiene color, y al marcar «Azul marino» en la prenda se elige sola la tela azul marino?**
- **Sí: la tela usa la misma carta de colores que la prenda; la orden propone el rollo del mismo color y deja cambiar (recomendada):** Ganas: «Lino crudo» y «Lino negro» son
  dos telas con su propio stock; escoger el color es un clic y no dos tablas; si no hay, avisa «no hay lino azul marino». Pagas: un azul marino sirve para prenda y para tela.
- **Sí, y obliga el mismo color:** Ganas: cero error. Pagas: una prenda azul que sale de tela cruda que se tiñe no cabe.
- **No: la tela se elige aparte, sin color:** Ganas: nada. Pagas: dos rollos del mismo lino en colores distintos son el mismo insumo y el stock se mezcla.

**L5 · Cuando una orden está abierta, ¿su tela queda apartada para ella?**
- **Sí: la siguiente orden la ve como «ya comprometida» (recomendada):** como Katana reserva por prioridad. Ganas: dos órdenes no pueden decir «alcanza» contra el mismo rollo.
  Pagas: una orden olvidada abierta aparta tela que nadie usa (se ve en la lista con días sin moverse).
- **No: se descuenta solo al cortar y la primera en cortar gana:** Ganas: nada que reservar. Pagas: la segunda orden se queda sin tela al cortar sin aviso.

### Bloque 4 · Avance

**A1 · ¿Cómo se anota el avance de una fase?**
- **«Terminé N de M», cuantas veces haga falta; el valor por defecto es lo que falta; «Deshacer» 5 segundos (recomendada):** Ganas: cantidades reales, el cuello de botella se
  ve («N esperando en costura»), solo las buenas avanzan. Pagas: una entrada de datos diaria que alguien del Taller tiene que hacer.
- **«Marcar hecho» por fase entera, como hoy:** Ganas: un clic. Pagas: una orden de 300 está «en corte» cinco días y nadie sabe cuántas van.

**A2 · ¿Cambió el 3 %? ¿Se anotan las prendas que salen mal en cada fase?**
- **No: solo las buenas al cerrar, como hoy (recomendada mientras la merma siga < 3 %, R-31):** Ganas: nada que llenar. Pagas: `plan − buenas` no dice dónde ni por qué.
- **Sí: buenas + falladas con motivo (tela, corte, costura, servicio) al cerrar cada fase; lo arreglable se arregla adentro y cuenta como buena; las segundas no entran
  al stock:** la inspección real en Lima da ~15 % zurcidos y ~13 % composturas frente a 1 % segundas [externo]. Ganas: el descuento al servicio y la calidad por fase salen solos.
  Pagas: un campo más por avance.
- **Lo anterior y además las segundas entran al stock para venderse:** Ganas: se venden. Pagas: toca `stock`, `movimientos`, Vender y precios: es otro proyecto.

**A3 · Si se cortan más prendas que las pedidas (108 cuando pediste 100), ¿qué hace el sistema?**
- **Acepta hasta un % de tolerancia que tú fijas (recomendada, 10 % como Uphance):** se corta de más para cubrir falladas; lo real es ±5–10 %. Ganas: la orden no queda
  «abierta para siempre» ni rechaza lo normal. Pagas: un número en Configuración.
- **Acepta y la orden crece:** Ganas: nada que configurar. Pagas: el plan deja de servir de referencia.
- **No deja: se corta exactamente lo pedido:** Ganas: control. Pagas: la cortadora miente o deja prendas sin registrar.

**A4 · La fecha que pones al abrir la orden, ¿qué promete?**
- **Que las prendas salen del Taller ese día (recomendada):** Ganas: una fecha, la que el Taller controla; el rojo de la lista es honesto. Pagas: cuándo llegan a Trujillo (80 %
  de la venta) lo sabe Traslados, no Producción.
- **Que están en la tienda ese día; el sistema resta los días del traslado:** Ganas: lo que a la tienda le importa. Pagas: días de traslado inventados (D1) o un dato más por sede.
- **Dos fechas:** Ganas: las dos verdades. Pagas: dos fechas que llenar y dos rojos.

### Bloque 5 · Colores y tallas · Dinero

**C1 · Si el modelo no tiene «Verde» o «XL», ¿la orden puede sumarlos? (hoy no: ADR-0051 d.5, ajustado solo para el modelo nuevo)**
- **No: se agrega en Catálogo, como hoy (recomendada):** Ganas: el catálogo no se toca desde el Taller; lo que se manda sigue el vocabulario. Pagas: dos pantallas para una orden.
- **Sí: la orden crea la variante del vocabulario y cae «pendiente» en Por revisar, como un modelo nuevo (ADR-0371):** Ganas: un camino. Pagas: una variante pendiente puede quedar
  sin precio y la orden de lote exige precio.

**D1 · El papel del bordador o de la maquila, ¿dónde se registra? (ayer, d.63 de ADR-0362, dijiste «maquila y flete siguen como gastos en Finanzas»; esta pregunta lo reabre, sin recomendación fuerte)**
- **Sigue como gasto en Finanzas, y el gasto puede decir «paga la fase X de la orden OP-…» (lo decidido ayer):** Ganas: nada nuevo en Producción; Gastos ya admite recibo por
  honorarios. Pagas: Por pagar del Taller no sabe lo que debe por servicios; el costo real de la orden es el devengado (tarifa × recibidas) y se concilia con el papel en Gastos.
- **En Producción ▸ Facturas de insumos, cruzado con la fase de la orden:** Ganas: el costo de servicio cae en la orden y Por pagar del Taller muestra lo que debes, lo que ya trajo
  papel y lo que ya se pagó. Pagas: reabre d.63 y una migración más al libro de Producción.

**D2 · Si el bordador ya entregó pero no ha traído su papel, ¿eso ya aparece como plata que debes?**
- **Solo en el Taller, como aviso «falta el papel»; la deuda total espera el papel (recomendada):** Ganas: la Deuda total de CAYLA solo suma documentos (lo que el contador reconoce).
  Pagas: el Taller debe algo que Finanzas todavía no ve.
- **Sí, en Por pagar del Taller y en la deuda total:** Ganas: la deuda es la real. Pagas: una cifra sin papel entra al consolidado.
- **No, hasta que llegue el papel:** Ganas: nada que derivar. Pagas: lo recibido sin factura desaparece hasta que alguien se acuerde.

### Bloque 6 · Alcance

**Q1 · ¿Quién puede abrir, avanzar y cerrar órdenes? (hoy la base deja a 3 cuentas «Integrante» que el menú no deja entrar)**
- **Quien ve el módulo Producción y está parado en el Taller (recomendada):** Ganas: la base dice lo mismo que Roles y accesos (ADR-0161). Pagas: una cuenta sin el módulo no puede
  «Terminé N» aunque esté en el Taller.
- **Cualquiera parado en el Taller, como hoy:** Ganas: nada que cambiar. Pagas: la base contradice Roles y accesos.

**Q2 · La primera orden real, ¿con qué sale?**
- **Fases + servicio con vale, recepción y tarifa + elegir la tela de la orden (sin ficha de consumo por modelo todavía) (recomendada):** Ganas: lo que pediste (tercerizar, fases,
  tela, entendible) corre en 3–4 cortes verticales con `/construir`, y la primera orden real se acompaña con `/flujo-de-negocio` antes de seguir. Pagas: «¿alcanza?» responde
  solo con el consumo que se escriba en esa orden; la ficha del modelo y las muestras con rondas vienen después.
- **Fases + servicio, sin tela por orden:** Ganas: la primera orden en 2–3 cortes. Pagas: «¿alcanza la tela?» sigue como hoy y el costo estimado nace sin tela; lo de la tela, que
  pediste segundo, queda para la segunda entrega.
- **Todo de una (fases, tela, ficha por modelo, muestras con rondas, papel cruzado):** Ganas: la orden completa. Pagas: el doble de superficie antes de la primera orden real; lo que mata a
  los sistemas chicos son los campos que nadie llena.

## Lo que Felipe decidió con estas preguntas (2026-10-14)

Las respuestas, en tres tandas, y los supuestos del arquitecto están escritos en **ADR-0400**
(`docs/adr/0400-produccion-la-orden-con-sus-fases-quien-las-hace-y-su-tela.md`): la OP es la única entidad y las áreas son fases
(granularidad A, base lista para C); fases Corte · Costura · Acabado más Bordado, Estampado y Lavandería opcionales; tercerizar = una fase
entera con un quién, decidido al abrir y cambiable hasta que empiece; **Salida** y **Vuelta** por talla y color (Felipe pidió no llamarlos
«vales»); tarifa por prenda con cantidad mínima y fijo opcional; tela por metros (sin rollos ni kilos); consumo escrito en el modelo (Audaces)
y corregido por lo real; avance «Terminé N de M»; cabecera `EncabezadoPagina`; primera entrega completa (fases + Salida/Vuelta + tela); A4–A7
de ADR-0396 absorbidas. Este documento queda como la investigación que llevó a esas decisiones; lo que aquí era «propuesta» o «pregunta»
se lee ya resuelto en el ADR.
