# Benchmark contra los mejores ERPs del mundo

> Respuesta a la pregunta directa de Felipe (2026-09-23): ¿estudiaste a los mejores ERPs del mundo y
> entendiste lo importante de desarrollar buen software? 6 investigadores en paralelo (comercial,
> velocidad de flujo, inventario, retail+manufactura, reportes de decisión, excelencia de ingeniería),
> con búsqueda web real contra Shopify, Square, Lightspeed, Katana MRP, Odoo, NetSuite, Cin7, y los
> principios de ingeniería del propio CLAUDE.md de Felipe — cruzado contra el código y las 143
> decisiones ya tomadas del plano maestro.

## Veredicto honesto

Sí estudié ERPs reales (Shopify, Square, Lightspeed, Katana MRP, Odoo, NetSuite, Cin7) con evidencia de producto, no de memoria — y el núcleo de CAYLA (ledger append-only con trigger de inmutabilidad, RLS+RPC como primera defensa, costeo promedio ponderado que viaja con la variante, "boring technology" elegido con criterio explícito sobre NestJS/Prisma) ya está al nivel de los patrones que usan Stripe para dinero y Shopify para inventario multi-tenant. Eso no es buena suerte, es ingeniería real.

Pero tu duda tiene razón en el fondo: las 143 decisiones del plano son en su enorme mayoría arqueología de lo ya construido — "¿esto que creíamos roto, sigue roto?" — no diseño hacia adelante, y eso es estructural: un banco de 119 preguntas organizado por capas (negocio, glosario, datos, permisos, pantallas) no puede generar la pregunta que nadie escribió. Nadie en esas 143 preguntas tocó si el CI realmente bloquea un merge con el núcleo roto, si alguien se entera cuando algo falla en producción sin que una clienta se queje, o si el reorder point agregado por producto (que contradice lo que tú mismo pediste: talla×color) alguna vez se iba a corregir solo. Tampoco nadie conectó los tres hallazgos de gestión comercial e inventario que son extensiones baratas de cosas que YA construiste (ficha de clienta, motor de reposición, costeo) — no hacía falta copiarle nada a un gigante para verlos, solo mirar el propio código con otra pregunta.

Conclusión: el plano hecho hasta ahora es corrección local de alta disciplina, no la visión completa de sistema. Este benchmark es el primer paso hacia esa visión — no la reemplaza, la empieza.

## Riesgos estructurales — lo que ni las 143 preguntas ni el benchmark de producto alcanzaron a nombrar antes

- El CI protege 'main' con PR obligatorio pero el job que prueba el núcleo (dinero y stock) corre con continue-on-error: true — un PR puede fusionarse con el núcleo en rojo y nadie se entera hasta que el bug aparece en producción semanas después.
- No existe ninguna herramienta ni proceso que avise cuando el propio código de CAYLA lanza una excepción en producción (venta que falla a medias, RPC en error 500) — hoy el único radar es que alguien en tienda note que algo no funcionó.
- 'stock' es un snapshot derivado de 'movimientos' por decisión explícita (principio 4 de CLAUDE.md), pero nada corre periódicamente para confirmar que de verdad coinciden — un bug de descuadre puede vivir semanas antes de manifestarse como una alerta falsa o una venta rechazada sin motivo aparente.
- 153 de las 199 funciones de la base son SECURITY DEFINER (se saltan RLS a propósito) sin un proceso sistemático de revisión — los 4 huecos de seguridad que esta misma ronda de 143 preguntas encontró (venta editable desde el navegador, baja de acceso, costo visible a cualquiera) se hallaron uno por uno, reactivamente, no porque algo los buscara.
- Felipe es el único desempate estructural para decisiones transversales caras de revertir, sin un segundo nombrado — ya hay un caso vivo (PL-77, candado no construido 'porque se confía en la costumbre') del mismo patrón que ya falló una vez antes (ADR-0002).
- El restore de backup está bien decidido (RPO de 1 día, ensayo antes del primer mes de TRU) pero sigue sin fecha exacta fijada, y afecta también a Dynamic porque comparten el mismo proyecto Supabase desde la unificación — un ensayo sin coordinar puede impactar el otro negocio.

## Huecos reales, priorizados

### Prioridad alta

**Punto de reorden agregado por producto, no por talla/color — contradice lo que ya pediste**

- Quién lo hace bien: Patrón 'size curve' de retail de moda serio (StyleMatrix, Impact Analytics): se pronostica a nivel estilo/color y se desagrega a talla, porque la curva de tallas real nunca es uniforme.
- Por qué importa a CAYLA: No es copiarle a nadie: tú mismo pediste 'inventario talla×color con reposición' como diferencial frente a Alegra (memoria 60-preguntas, Bloque 3). Hoy dos variantes del mismo producto con curvas opuestas comparten el mismo punto de reorden.
- Evidencia en CAYLA: supabase/migrations/20260916100000_punto_reorden.sql:100-118 — el CTE 'agregado' agrupa por producto sin variante_id/talla/color
- Acción: DECIDIDO: bajar el cálculo de fn_productos a nivel variante (group by producto_id + variante_id) antes de agregar cualquier tabla nueva de Águila — es corregir el group by, no diseño nuevo.

**Del punto de reorden a la orden de compra: falta el puente automático**

- Quién lo hace bien: Katana, Cin7 ForesightAI y apps de Shopify (Forstock, Assisty) arman la orden de compra sola cuando el stock cruza el punto de reorden.
- Por qué importa a CAYLA: Es literalmente 'qué comprar' de PL-02. Hoy alguien copia a mano, producto por producto, la lista de 'reponer' hacia una orden de compra.
- Evidencia en CAYLA: supabase/migrations/20260916100000_punto_reorden.sql (reponer_de_proveedor es solo un booleano); apps/web/lib/inteligencia.ts:119 (reorderPoint sin RPC que lo convierta en orden)
- Acción: DECIDIDO: construir una función que agrupe por proveedor habitual (una orden = un proveedor) con cantidad sugerida = punto_reorden − stock_total, como borrador que el rol Compras (PL-27) solo revisa y confirma.

**Sin escalamiento de liquidación por antigüedad ni descuento sugerido**

- Quién lo hace bien: Shopify 'inventory aging report' (buckets 30/60/90/180 días); práctica de moda rápida (sell-through 70-80% a 3/4 de temporada, descuentos escalonados 10-15% → 20-30%).
- Por qué importa a CAYLA: Es la otra mitad de PL-02 ('qué liquidar'). Hoy CAYLA solo tiene un flag binario 'estancado: sí/no' a 45 días, sin acción ni porcentaje asociado.
- Evidencia en CAYLA: packages/shared/src/enums.ts:41 (UMBRAL_ESTANCADO_DIAS=45, solo flag); apps/web/lib/inteligencia.ts:117
- Acción: Construir los buckets de antigüedad (0-45/46-90/91-180/>180) sobre diasSinVenta ya calculado — esto lo decido yo. La política de % de descuento por bucket SÍ es tuya: ver pregunta a Felipe.

**Sin receta de materiales (BOM) — el Taller no puede calcular qué comprar ANTES de producir**

- Quién lo hace bien: Katana MRP: BOM multinivel por producto que dispara automáticamente la compra que falta. Es su feature central, no un extra — y es el caso de uso insignia de manufactura+retail.
- Por qué importa a CAYLA: Es el núcleo de 'qué comprar' para el Taller. Hoy `registrar_consumo_insumo` solo registra lo que se gastó DESPUÉS de fabricar; nadie sabe si una corrida de 200 prendas alcanza con la tela que hay ANTES de comprometerse.
- Evidencia en CAYLA: docs/datos/modulos/10-produccion-del-taller.md:88-94 (bom_items se borró en el corte V1→V2 y nunca se reconstruyó) y :446-450; docs/datos/modulos/10-produccion-del-taller.md:449 (tampoco hay alerta de insumos.stock_minimo)
- Acción: Pendiente de tu decisión de inversión — ver pregunta a Felipe. Si dice sí: tabla chica (producto_id, insumo_id, cantidad_por_unidad) + validación en abrir_produccion, no un rediseño.

**La cotización de maquila (D-31, '¿me conviene Taller propio?') existe en producción y ninguna pantalla la llama**

- Quién lo hace bien: Katana/Odoo muestran costo de producción propia junto al de tercerizar en el mismo tablero (patrón de costeo CMT estándar en manufactura textil).
- Por qué importa a CAYLA: Tú mismo revivistes esta métrica dos veces (D-31 original + Bloque 11 de las 60 preguntas) como LA razón que justifica tener Taller propio. La función ya está construida y probada — nadie la conecta.
- Evidencia en CAYLA: memoria cayla-decisiones-60-preguntas-2026-09.md líneas 95 y 127 ('nadie la llama todavía'); verificado 2026-09-23: grep -rn fn_cotizacion_maquila_vigente apps/web no devuelve nada
- Acción: DECIDIDO: conectar fn_cotizacion_maquila_vigente a /produccion/eficiencia esta semana — es una sesión de trabajo, la función ya está lista, es el hueco más barato de cerrar de todo este benchmark.

**Deriva entre lo que definiste como 'eficiencia' del Taller (PL-39: tela aprovechada) y lo que se construyó (costo por prenda)**

- Quién lo hace bien: Sistemas de corte textil (Audaces, Lectra, Gerber) miden 'marker efficiency' — metros cubiertos vs. ancho de tela, benchmark 78-94% — una métrica de MATERIAL, distinta de costo/mano de obra.
- Por qué importa a CAYLA: PL-39 registra tu respuesta elegida palabra por palabra: eficiencia = tela consumida vs. lo que Audaces predijo. Lo construido en /produccion/eficiencia mide otra cosa (planilla+gastos÷prendas buenas), sin mencionar Audaces, metros ni tela — útil, pero no lo que pediste. Si nadie te lo señala, puedes creer que esa pregunta ya está cerrada.
- Evidencia en CAYLA: docs/plano/01-BANCO-PREGUNTAS.md:146-154 (PL-39) vs. apps/web/lib/eficiencia-reglas.ts:5 (sin mención de metros/Audaces/marker en todo el archivo)
- Acción: Pendiente de tu decisión — ver pregunta a Felipe.

**Dos motores paralelos calculan 'cuánto se vende por día' (SQL nuevo vs. TypeScript viejo) sin hablarse entre sí**

- Quién lo hace bien: Cin7 ForesightAI y NetSuite Demand Planning tienen UN motor de pronóstico que alimenta a la vez ABC, reorden y alertas — nunca dos cálculos independientes compitiendo.
- Por qué importa a CAYLA: CLAUDE.md principio 2 (integridad conceptual, Fred Brooks) es literal: si dos partes resuelven el mismo problema de dos formas, una está mal aunque las dos funcionen. Diseñar Águila sobre esta grieta es construir sobre terreno partido.
- Evidencia en CAYLA: supabase/migrations/20260916100000_punto_reorden.sql (demanda_diaria en SQL, global, 30 días todas las sedes) vs. apps/web/lib/inteligencia.ts:112-125 (velocidad en TypeScript, filtrado por RLS a una sede)
- Acción: DECIDIDO: el motor SQL (con lead time real desde compras/lotes, corregido a nivel variante por el hueco #1) es el que manda. inteligencia.ts queda solo para lo que de verdad es distinto (alcance por sede filtrado por RLS en pantallas que hoy lo necesitan), documentado explícitamente como tal — no como un segundo cálculo de lo mismo.

**La sugerencia de traslado entre sedes ignora el almacén — puede mover una prenda entre ciudades cuando sobraba en la misma tienda**

- Quién lo hace bien: Cin7 ForesightAI / Assisty: 'multi-location planning' cruza TODAS las ubicaciones, incluida la bodega, antes de sugerir un traslado.
- Por qué importa a CAYLA: Contradice directamente D-39 ('las alertas cuentan piso y almacén'). Sin esto, se gasta plata y tiempo en un traslado que se resolvía bajando una caja del propio almacén.
- Evidencia en CAYLA: apps/web/lib/inteligencia.ts:137-165 solo recorre stockPorSede (piso), nunca stockAlmacenPorSede (ya documentado como hueco 6 en docs/datos/modulos/13-inteligencia-y-reportes.md)
- Acción: DECIDIDO: corregir inteligencia.ts (o el motor consolidado del hueco anterior) para sumar piso+almacén de la sede destino antes de proponer traer de otra tienda. Es corrección de un bug ya nombrado, no diseño nuevo.

**No hay vista de rentabilidad de catálogo — solo 'más vendidos', nunca margen×rotación por marca**

- Quién lo hace bien: Lightspeed X-Series 'inventory performance report' cruza margen y rotación por producto; Shopify recomienda 'ABC analysis by revenue contribution' como panel estándar.
- Por qué importa a CAYLA: PL-02 dice literalmente que el éxito es 'qué comprar, qué liquidar, qué tendencia hay'. CAYLA ya mide rotación/sell-through por variante y margen por asesora — pero no margen por producto/marca, que es lo que de verdad decide con qué proveedor reponer.
- Evidencia en CAYLA: apps/web/lib/resumen-comparacion.ts y resumen-desempeno.ts (rotación/sell-through sin números falsos, motor reutilizable); memoria 60-preguntas Bloque 6 solo tiene 'margen por asesora'
- Acción: DECIDIDO: construir el reporte de catálogo agrupado por marca/proveedor (no por producto individual — con ~900 SKUs es la unidad más accionable de compra), reutilizando el mismo motor de resumen-comparacion.ts que ya calcula rotación sin inventar números.

**Clienta que dejó de comprar (win-back) — nadie la señala**

- Quién lo hace bien: Shopify Analytics: segmento 'at-risk customers' + cohortes RFM en el store-performance-dashboard.
- Por qué importa a CAYLA: Ya construiste la ficha de clienta (talla, cumpleaños, 'llegó tu talla') que avisa hacia ADELANTE. No avisa hacia atrás cuando una clienta deja de volver — con ~900 SKUs y equipo chico, eso es plata que se pierde en silencio.
- Evidencia en CAYLA: memoria 60-preguntas Bloque 9 (fidelización sin puntos, sin mención de clienta inactiva); Bloque 5 mide 'recompra' solo como desempeño de asesora, no como alerta
- Acción: DECIDIDO: marcar en la ficha de clienta (reutilizando la tabla del PR #271, cero tabla nueva) a quienes no compran hace N días (60-90, ajustable por categoría) para que la asesora la contacte — es una consulta sobre movimientos, no una construcción nueva.

**El CI protege 'main' pero no bloquea las pruebas del núcleo (dinero y stock)**

- Quién lo hace bien: Práctica base de CI desde Fowler/ThoughtWorks: un build roto bloquea el merge, no solo lo reporta.
- Por qué importa a CAYLA: PL-10 decidió PR+CI obligatorios — pero el job que prueba movimientos de stock y registrar venta está marcado 'piloto, no bloquea' (continue-on-error). Un PR puede fusionarse con el núcleo en rojo y nadie lo nota, el mismo patrón que costó el candado de personas duplicadas (ADR-0002).
- Evidencia en CAYLA: .github/workflows/ci.yml:116-120 ('Pruebas de RPC contra Postgres (piloto, no bloquea)', continue-on-error: true); ninguna de las 143 preguntas del plano lo tocó
- Acción: DECIDIDO: pasar fn_aplicar_movimiento.mjs y registrar_venta.mjs (los dos que ya prueban dinero y stock y ya están estables) a bloqueantes ahora mismo; el resto de scripts/pruebas/ sigue como piloto hasta que se estabilicen uno por uno.

**No hay observabilidad de errores en producción — el único radar es que alguien en tienda note que algo falló**

- Quién lo hace bien: Google SRE: monitoreo de errores y postmortems sin culpa son la base de operar cualquier sistema en producción, del tamaño que sea.
- Por qué importa a CAYLA: CAYLA ya decidió bien qué hacer cuando una API EXTERNA falla (Vogels, principio 8). Pero cuando el PROPIO código de CAYLA lanza una excepción — una venta que falla a medias, un RPC en 500 — hoy nadie se entera hasta que una clienta se queja.
- Evidencia en CAYLA: búsqueda en todo docs/ por sentry/datadog/apm/observabilidad: cero resultados; ninguna de las 143 preguntas lo menciona
- Acción: DECIDIDO: encender algo barato ahora, antes de que TRU cargue más datos reales — Sentry free tier o una tabla errores_capturados con notificación al líder (mismo patrón que PL-113/114 ya usa para SUNAT). No hace falta Datadog, hace falta ALGO.

**Bandeja única 'esto necesita tu atención hoy' — hoy los 'qué lo rompe' de cada número viven documentados pero dispersos**

- Quién lo hace bien: Patrón 'single pane of glass' + alertas configurables de POS serios: agregan las excepciones de todos los módulos en un solo feed priorizado.
- Por qué importa a CAYLA: Eres simultáneamente dueño de 3 tiendas+Taller y arquitecto del sistema. Hoy tienes que abrir pantalla por pantalla para saber qué está roto.
- Evidencia en CAYLA: docs/datos/11-KPIS.md documenta 'Qué lo rompe' por separado para cada uno de los 3 números (líneas 163-220, 281-422, 491-577) sin vista consolidada en producción
- Acción: DECIDIDO: empezar por las señales que YA sabes que están rotas hoy (cajas sin cerrar, gastos con metodo_pago NULL, boletas SUNAT pendientes >X horas) — no hace falta preguntarte cuáles priorizar, son las que este mismo benchmark y 11-KPIS.md ya nombraron como rotas.

**El combo 'responsable/asesora' viene siempre vacío — un tap obligatorio en cada venta, donde la industria pone un default**

- Quién lo hace bien: Square y Toast asocian la venta al cajero que inició sesión por defecto; solo piden elegir a otra persona cuando alguien la cambia explícitamente.
- Por qué importa a CAYLA: Es el único punto donde CAYLA agrega fricción garantizada a CADA venta — pero es una decisión consciente que corregiste dos veces en 24 horas (ADR-0161, 2026-09-22/23) por una razón real: quien atiende puede no ser quien abrió sesión.
- Evidencia en CAYLA: docs/adr/0161-responsable-por-operacion-y-retome-de-roles.md, sección 'Actualización 2026-09-23'
- Acción: Pendiente de medición y de tu decisión — ver pregunta a Felipe. Alternativa técnica que ya tengo lista si decides que vale la pena: default a la asesora que más atendió en los últimos 10 minutos en esa sede (no la sesión), con un toque para cambiar.


### Prioridad media

**ABC de catálogo ordena por monto vendido, no por margen**

- Quién lo hace bien: Cin7 y NetSuite ponderan ABC por rentabilidad, no solo por ingreso — un producto de alto volumen pero vendido con descuento fuerte no debería coronar como clase A.
- Por qué importa a CAYLA: El bloqueo original (descuentos sin registrar aparte del precio, D-44) ya se resolvió en otra ola. El dato para hacerlo bien ya existe, solo falta usarlo.
- Evidencia en CAYLA: inteligencia.ts:88-104 ordena por movimientos.monto; migración venta_asesora_emisor_descuento_lider ya en main desde Ola 1/2 guarda el descuento estructurado
- Acción: DECIDIDO: rediseñar la clase ABC para ordenar por margen bruto (monto − costo, con descuento visible) en vez de monto bruto.

**Un colaborador puede ver un punto de reorden calculado con el alcance equivocado (su sede vs. toda la red) sin que la pantalla lo distinga**

- Quién lo hace bien: El principio detrás de 'multi-location planning' (Cin7/Assisty): el sistema debe distinguir siempre si un número es de una sede o de toda la red, nunca mezclarlos bajo el mismo nombre de campo.
- Por qué importa a CAYLA: Si Águila hereda el cálculo filtrado por RLS para alguna pantalla, un colaborador de TRU vería 'quedan 3, repón ya' de un producto que en toda la red tiene 40 — decisión de compra tomada con el número equivocado.
- Evidencia en CAYLA: inteligencia.ts:107-125 construye stockTotal/reorderPoint sobre lo que RLS dejó leer, con el mismo nombre de campo que usa el Admin para el total de la red (hueco 11 en docs/datos/modulos/13-inteligencia-y-reportes.md)
- Acción: DECIDIDO: cada número de reorden/estancado en las pantallas de Águila declara su alcance en el propio rótulo ('de tu sede' vs. 'de toda la red') — regla de diseño, no pregunta.

**Yape/Plin/tarjeta se cobran en un aparato aparte y se anotan a mano en CAYLA — doble registro**

- Quién lo hace bien: Square (Tap to Pay) y Shopify POS cobran y registran la venta en la MISMA acción.
- Por qué importa a CAYLA: Cada venta con Yape/Plin/tarjeta pasa por dos sistemas: el aparato real y CAYLA como anotación manual — un paso más y una fuente posible de descuadre.
- Evidencia en CAYLA: apps/web/components/PuntoDeVentaTicket.tsx:749 ('Acá se registra, no se cobra')
- Acción: DECIDIDO no construir la integración todavía (mismo criterio que ya aplicaste a Alegra, Bloque 2). Medir en el piloto de TRU si la anotación manual alguna vez causó un descuadre real; si después de un mes la respuesta es 'nunca', este hueco se cierra sin invertir en Izipay/Culqi/API de Yape Empresas.

**El valor de las corridas en curso (WIP) no aparece en ningún reporte de posición del negocio**

- Quién lo hace bien: Katana y Odoo tratan una orden de producción abierta como inventario valorizado (WIP asset) — el material ya consumido sigue contando como valor del negocio.
- Por qué importa a CAYLA: El 'balance' que definiste (Bloque 8: inventario al costo + efectivo − por pagar) puede estar subestimando el inventario real mientras dura una corrida de días o semanas.
- Evidencia en CAYLA: grep -rln valorizac apps/web/lib apps/web/app no devuelve nada; producciones.costo_tela/avios/maquila se actualiza en vivo pero ningún reporte la consulta
- Acción: DECIDIDO: cuando se construya el balance/posición operativa (Bloque 8), sumar el costo acumulado de las órdenes en_proceso del Taller al inventario valorizado — es agregar una fuente ya calculada, no diseño nuevo.

**Sin reconciliación automática del invariante central (stock = suma de movimientos)**

- Quién lo hace bien: Stripe reconcilia su ledger contra la fuente de verdad a diario (T+1), con auto-sanación para casos simples — el mismo principio que un contador aplica al cuadrar caja.
- Por qué importa a CAYLA: 'stock' es un snapshot derivado de 'movimientos' (principio 4 de CLAUDE.md) pero nada corre periódicamente para confirmar que de verdad coinciden. Si un bug descuadra el stock, el primer síntoma es una alerta falsa o una venta rechazada semanas después.
- Evidencia en CAYLA: grep de 'reconcilia' en docs/ se usa siempre para drift de documentación, nunca para stock vs. movimientos; ninguna de las 143 preguntas lo exige
- Acción: DECIDIDO: construir verificar_cuadre_stock() que compare stock.cantidad contra SUM(movimientos) por variante/sububicación, corrida en cron (mismo mecanismo que PL-113 para SUNAT) o en cada cierre de mes (PL-73).

**153 funciones SECURITY DEFINER en producción sin proceso sistemático de revisión de seguridad**

- Quién lo hace bien: Principio de menor privilegio / OWASP: toda función que se salta RLS a propósito es superficie de ataque y necesita revisión dedicada, no reactiva.
- Por qué importa a CAYLA: Esta misma ronda de 143 preguntas encontró 4 huecos de seguridad reales (venta editable desde el navegador, baja de acceso, costo visible a cualquiera) — todos hallados uno por uno, no por un proceso que los busque. Con 153 funciones así, el próximo hueco no se encuentra preguntando 143 preguntas más.
- Evidencia en CAYLA: informes-lectores.md:114 ('199 firmas de funciones, 153 security definer'); PL-84, PL-85, PL-92, PL-75, PL-122 hallados 'verificado en vivo' en esta misma ronda
- Acción: DECIDIDO: cada función security definer nueva responde por escrito, como parte del PR, 'qué puede hacer esta función que RLS no dejaría hacer directamente' — mismo patrón que ya usaron para auditar PL-84/92/122, convertido en checklist obligatorio.

**Efectivo consolidado de 3 sedes + Taller no existe como un solo número**

- Quién lo hace bien: El cambio de Shopify POS de 2026 ('cash tracking across locations'): de ver caja por tienda a sumar/comparar todas las ubicaciones en una sola vista.
- Por qué importa a CAYLA: D-52 marcó 'Efectivo y caja' como uno de los 3 números que miras primero — pero hoy vive solo por sede.
- Evidencia en CAYLA: docs/datos/11-KPIS.md:426-448 ('Efectivo y caja' calculado por sede en /finanzas/efectivo vía getCuadreEfectivo; sin total consolidado)
- Acción: Pendiente de tu preferencia — ver pregunta a Felipe.

**Bus factor arquitectónico: Felipe como único desempate sin sucesión definida**

- Quién lo hace bien: Práctica de equipos de plataforma maduros: todo 'factor de autobús 1' se resuelve con un ADR o runbook escrito de antemano, no cuando la persona ya no está.
- Por qué importa a CAYLA: PL-12 ya lo nombró sin resolverlo. CAYLA tiene el ejemplo vivo: PL-77 (candado contra sububicaciones duplicadas) quedó sin construir porque 'Felipe confía en la costumbre' — el mismo patrón que ya falló una vez (ADR-0002).
- Evidencia en CAYLA: PL-12 ('SE ROMPE SI: Felipe es el único desempate y no está una semana'); PL-77
- Acción: Pendiente de tu decisión — ver pregunta a Felipe.

**Meta del mes: la asesora la ve al cierre, no en vivo mientras vende**

- Quién lo hace bien: Apps del ecosistema Shopify POS (Scoreboard, Shift Win) muestran meta, avance y rango del turno en la pantalla del POS en tiempo real.
- Por qué importa a CAYLA: El contenido de la meta ya está decidido (Bloques 5 y 8-9); lo que falta decidir es el momento — y el patrón visual ya existe (ADR-0136, 'barra que se llena'), solo falta decidir si se usa aquí.
- Evidencia en CAYLA: memoria 60-preguntas Bloque 5/8 (vistas de resultado, no de progreso en vivo); apps/web/app/globals.css sección REGLA DE MODALES
- Acción: Pendiente de tu decisión (motivación en vivo vs. riesgo de ansiedad de venta) — ver pregunta a Felipe.


### Prioridad baja

**Dotación por hora pico: se decidió guardar el dato, no se decidió el panel**

- Quién lo hace bien: Lightspeed 'team performance report': ventas vs. horas trabajadas por franja horaria, para saber si una tienda está sobre o sub-dotada.
- Por qué importa a CAYLA: El propio equipo ya listó 'dotación por turno' como dato a capturar desde el día uno de TRU, pero sin panel asociado.
- Evidencia en CAYLA: memoria 60-preguntas, 'Datos que hay que guardar desde el primer día de TRU'; fn_asesoras_de_turno ya existe como fuente
- Acción: DECIDIDO no construir todavía (correcto: PL-05/06 priorizan registro fiel sobre inteligencia prematura). Cuando haya 60-90 días de datos reales, cruzar ventas por hora con fn_asesoras_de_turno.

**Sin fila de favoritos/más vendidos fija en el catálogo del mostrador**

- Quién lo hace bien: Shopify POS 'Smart Grid': home del POS fijable con lo más usado, para agregar sin escanear.
- Por qué importa a CAYLA: Ahorra taps para lo que se vende sin etiqueta (accesorios de mostrador), pero el escaneo ya es el camino principal con ~900 SKUs.
- Evidencia en CAYLA: apps/web/components/PuntoDeVentaCatalogo.tsx:271-434 (grilla solo con chips de categoría, sin fila de destacados)
- Acción: DECIDIDO no construir sin medir primero: si en el piloto <10% de las ventas usan la grilla en vez del escáner, este hueco no vale la inversión.

**Sin feedback sonoro/háptico al agregar una prenda escaneada (solo si no hay lector físico)**

- Quién lo hace bien: Lectores de código de barras dedicados (los que usan Square/Toast en mostrador fijo) emiten su propio beep de hardware.
- Por qué importa a CAYLA: Si el mostrador usa un lector Bluetooth/USB pareado (lo más probable), esto ya está resuelto por hardware y no hay hueco real.
- Evidencia en CAYLA: Sin BarcodeDetector/getUserMedia/cámara en el repo — confirma que no hay escaneo por cámara del celular
- Acción: DECIDIDO: no construir nada hasta confirmar con el mostrador qué hardware usan hoy en TRU (dato operativo, no arquitectónico — se resuelve preguntando en tienda, no aquí).

**No hay una vista agregada de cuántas corridas están en cada etapa del Taller a la vez**

- Quién lo hace bien: Katana 'production scheduling': tablero que agrega órdenes activas por etapa para ver dónde se atasca la planta.
- Por qué importa a CAYLA: El dato (etapas jsonb) ya existe; con un solo Taller el valor es bajo comparado con fábricas de Katana, pero el costo de una vista simple también es bajo.
- Evidencia en CAYLA: docs/datos/modulos/10-produccion-del-taller.md:43-44 (ninguna pantalla agrega por etapa) y :274-276 (columna etapas jsonb ya existe)
- Acción: DECIDIDO no construir ahora — solo si el volumen de corridas simultáneas crece. Cuando llegue ese momento: conteo simple por etapa sobre producciones.etapas en /produccion (Resumen), sin migración.

**Flujo de caja es una foto de hoy, no una proyección de las próximas semanas**

- Quién lo hace bien: Xero/QuickBooks: pronóstico rolling de 13 semanas que muestra cuándo se va a apretar la caja.
- Por qué importa a CAYLA: Mejora real de 'mejor toma de decisiones' (PL-02), pero puede ser prematuro — ya dijiste que no te interesa cuadrar al milímetro y el saldo de bancos hoy se teclea semanalmente.
- Evidencia en CAYLA: memoria 60-preguntas Bloque 11 (posición actual, no proyección)
- Acción: DECIDIDO no construir sin tu confirmación explícita — de baja prioridad frente a todo lo de arriba, no entra en las preguntas activas de este benchmark.

**GMROI (margen por sol invertido en inventario) — bloqueado, no huérfano**

- Quién lo hace bien: Lightspeed Analytics lo destaca como KPI central para decidir qué categorías merecen más capital.
- Por qué importa a CAYLA: Ayudaría a decidir 'qué comprar' con otra vista, pero construirlo hoy sería una cifra con apariencia de precisión sobre datos sucios (descuentos y costeo aún no cerrados del todo).
- Evidencia en CAYLA: docs/datos/11-KPIS.md:620-646 ('el margen está sucio arriba y abajo a la vez')
- Acción: DECIDIDO no construir todavía — depende de D-45 (método de costeo con el contador). Queda en BACKLOG como dependiente, no como pregunta activa.


## Preguntas reales para Felipe (no puede decidirlas el arquitecto solo)

1. **La pantalla de Eficiencia del Taller que ya existe mide costo por prenda (planilla + materiales ÷ prendas buenas). PL-39 definió 'eficiencia' como tela aprovechada (metros reales vs. lo que Audaces predijo). ¿La pantalla actual reemplaza esa definición, o falta agregar el % de tela aprovechada como una segunda métrica en el mismo panel?**
   *Por qué es tuya:* Es tu propia definición de éxito para el Taller, registrada dos veces en el plano — si no la confirmas, puedes creer que esa pregunta ya quedó resuelta cuando en realidad se construyó algo distinto.

2. **¿Vale la pena invertir el tiempo del equipo en armar una receta de materiales (BOM) real por producto — metros de tela y avíos por unidad, la misma cifra que ya sale de Audaces — para que el sistema avise 'con lo que tienes no alcanza' ANTES de abrir una corrida? Es la pieza que falta para que Águila calcule 'qué comprar' también para el Taller, no solo para las tiendas.**
   *Por qué es tuya:* Es trabajo real de levantamiento de datos (no solo código) y compite por el tiempo del líder del Taller — la prioridad frente a otras tareas de esta lista es tuya, no mía.

3. **Cuando construya el escalamiento de liquidación (30/60/90/180 días), ¿qué porcentaje de descuento sugieres en cada etapa (ej. 10-15% a los 45 días, 20-30% a los 90) o prefieres que el sistema solo marque el bucket de antigüedad sin sugerir cifra, y la decides tú caso por caso?**
   *Por qué es tuya:* Es una decisión de política de precios con impacto real en margen — no es algo que un arquitecto deba decidir por ti.

4. **Para las 2-3 decisiones transversales más caras de revertir (esquema de datos, permisos de dinero, candados que decidiste NO construir como PL-77), ¿quién es el segundo desempate si tú no estás disponible una semana — Dany, o la decisión se congela hasta que vuelvas?**
   *Por qué es tuya:* Es la brecha de bus-factor que PL-12 ya nombró sin resolver; es una decisión de gobierno del negocio, no de arquitectura.

5. **¿Puedes fijar la fecha exacta del ensayo de restore de backup (mismo criterio que ya usaste en PL-89: fecha exacta, no 'cuando sienta confianza'), y coordinarla con quien sea dueño de la base de Dynamic ya que el restore los afecta a ambos?**
   *Por qué es tuya:* Ya está bien decidido en criterio (PL-65/80), solo falta la fecha — y como el proyecto Supabase es compartido con Dynamic desde la unificación, la coordinación es tuya, no mía.

6. **El combo de asesora/responsable viene vacío en cada venta por una decisión consciente (ADR-0161) que corregiste dos veces en 24 horas. ¿Puedes medir en la primera semana de TRU cuánto tiempo real agrega ese tap en hora punta? Si el costo es alto, tengo lista una alternativa (default a quien más atendió en los últimos 10 minutos en esa sede, con un toque para cambiar) — pero decidir si vale la pena cambiarlo es tuyo.**
   *Por qué es tuya:* Es el único punto donde el sistema agrega fricción garantizada a cada venta a cambio de trazabilidad — el trade-off es tuyo porque tú evalúas asesoras con ese dato.

7. **Cuando abras tu Inicio como Admin, ¿quieres ver el efectivo de TRU+AQP+LIM+Taller sumado en un solo número, o prefieres verlos siempre separados para no tapar una sede con problema detrás del total?**
   *Por qué es tuya:* D-52 marcó 'Efectivo y caja' como uno de los 3 números que miras primero — la forma en que lo quieres ver es tu preferencia de tablero, no una decisión técnica.

8. **¿Quieres que la asesora vea su avance hacia la meta del mes/semana en vivo mientras trabaja (barra de progreso en 'Mi día'), o prefieres que el foco en vivo sea solo operativo (turno, caja) y la meta se quede para el cierre, para no generar ansiedad de venta si la meta quedó mal repartida?**
   *Por qué es tuya:* Es un trade-off de cultura de equipo (motivación vs. presión) que toca cómo se siente vender en tus tiendas, no una decisión de ingeniería.


## Informes completos por frente (detalle de investigación)


### Gestión comercial e inteligencia de ventas — lo que un dueño de retail ve para decidir.

Investigué Shopify POS/Analytics, Square Dashboard + Square for Retail, y Lightspeed Retail (S-Series y X-Series, sucesor de Vend) en sus propias páginas de ayuda y blogs de producto. Comparé cada patrón contra lo que ya está decidido en CAYLA (acta de 60 preguntas del 2026-09-21/22 y las 24 decisiones del plano) y, donde pude, contra el código real de este worktree (`apps/web/lib/*.ts`). Aviso honesto: este worktree nace de un `main` local que ya quedó atrás (el propio CLAUDE.md lo advierte) — no encontré en disco los archivos de "asesora"/"clientas" que la memoria dice que ya se fusionaron en Ola 1/Ola 2, así que para esos casos me apoyé en el acta, no en grep. Resultado: CAYLA ya resuelve, y en algunos casos con más disciplina que los gigantes (nunca inventa un número cuando el dato no alcanza), tres cosas que iba a buscar como huecos: rotación/sell-through por SKU, comparación entre tiendas separando ruido de fundamentales, y alertas de reposición. Los huecos reales que encontré no son "features de gigante que CAYLA debería copiar" — son extensiones naturales y baratas de cosas que CAYLA YA construyó (la ficha de clienta, el motor de reposición, la venta con asesora) que ningún bloque de la ronda de 60 preguntas nombró todavía.

**🔴 HUECO — Clienta que dejó de volver (win-back) — nadie la señala todavía**

- Quién: Shopify Analytics: segmento «at-risk customers» + cohortes RFM (recencia/frecuencia/monto) en el store-performance-dashboard (shopify.com/blog/store-performance-dashboard). Square y Lightspeed no lo destacan igual de explícito, pero ambos ofrecen filtros de clientes por última compra.
- Por qué: Felipe definió el éxito a 3 años como «mejor toma de decisiones» (PL-02) y ya construyó la ficha de clienta con talla, cumpleaños y aviso de «llegó tu talla» — pero eso avisa hacia adelante (producto nuevo), no hacia atrás (clienta que se fue). Con ~900 SKUs y equipo chico, no reactivar a una clienta que dejó de comprar es plata que se pierde en silencio, sin que nadie lo note en el pulso diario.
- Evidencia CAYLA: memoria cayla-decisiones-60-preguntas-2026-09.md, Bloque 9 ("Fidelización... SIN puntos: talla guardada, cumpleaños, aviso «llegó tu talla», ajuste del taller, cambio sin fricción") — no menciona clienta inactiva ni recompra vencida como alerta. Bloque 5 sí mide «recompra» pero como métrica de desempeño de la asesora, no como alerta de clienta en riesgo.
- Prioridad: alta
- Acción: Pregunta concreta para Felipe: ¿quieres que el sistema marque, dentro de la ficha de clienta (fidelización v1 ya construida), a las que no compran hace N días (ej. 60-90, ajustable por categoría de prenda) para que la asesora las llame o les escriba? Es una consulta sobre `movimientos`/ventas con clienta identificada, cero tabla nueva — reutiliza la ficha del PR #271.

**🔴 HUECO — Qué comprar / qué SKU realmente da plata — falta rentabilidad y clasificación de catálogo**

- Quién: Lightspeed X-Series: «inventory performance report» (x-series-support.lightspeedhq.com/hc/.../inventory-performance-report) cruza margen y rotación por producto. El propio blog de Shopify (store-performance-dashboard) recomienda «ABC analysis categorizing products by revenue contribution» como panel estándar de salud del negocio.
- Por qué: PL-02 dice literalmente que el éxito es «transaccionar de forma inteligente — qué comprar, qué liquidar, qué tendencia hay». CAYLA ya mide rotación y sell-through por variante (motor determinista, ver evidencia) y ya mide margen — pero por asesora, no por producto/marca. Sin una vista que cruce margen × velocidad por SKU o marca, la decisión de reponer con el proveedor X vs Y sigue siendo intuición, no dato.
- Evidencia CAYLA: apps/web/lib/resumen-comparacion.ts y resumen-desempeno.ts calculan rotación/sell-through por variante (con costo, cuando el costo es confiable) — pero el ranking existente ordena por «más vendidos», no por margen acumulado ni por curva ABC de contribución a ingresos. memoria 60-preguntas Bloque 6: «margen generado por asesora» — no hay «margen por producto/marca».
- Prioridad: alta
- Acción: Construir un reporte de catálogo (no de vendedora) que cruce, por producto o marca: % de ingreso acumulado (curva ABC), margen bruto y rotación del período — usando exactamente el mismo motor de `resumen-comparacion.ts` que ya calcula rotación sin inventar números. Pregunta a Felipe: ¿por producto, por marca o por proveedor primero? (con ~900 SKUs, por marca/proveedor probablemente da una decisión más accionable de compra).

**🔴 HUECO — Una venta, una sola asesora — no distingue quién atendió de quién cobró**

- Quién: Shopify POS: «sales attribution» separa explícitamente el staff que procesó el cobro del staff atribuido a la línea de venta (help.shopify.com/.../sales-attribution) — para el caso exacto de una tienda donde alguien atiende y otra persona cierra en caja.
- Por qué: La propia investigación que el equipo de CAYLA lanzó el 2026-09-21 sobre calidad/bono recomendó «pago a la atendedora que abre la atención (no a quien cobra)» — pero lo decidido en Bloque 5 fue «cada venta lleva una asesora» (singular). En una boutique de 3 tiendas con turnos rotativos, es común que una persona muestre/pruebe la prenda y otra cierre la caja; con un solo campo, el mérito completo se lo lleva quien cobró.
- Evidencia CAYLA: memoria 60-preguntas Bloque 5 ("Cada venta lleva una asesora (referencia de quien atendió); el sistema sugiere a quienes están de turno") — singular, sin distinguir cobro de atención. La propia investigación del equipo (misma memoria, sección "Resultados de las investigaciones") ya identificó el problema pero no se tradujo a una decisión de esquema.
- Prioridad: media
- Acción: Pregunta concreta para Felipe: ¿vale la pena guardar `atendio_por` además de `asesora`/`emisor` en la venta, o el volumen real de casos donde son personas distintas es tan bajo que no compensa la fricción extra en el mostrador (recordar: PL-05 prioriza registro fiel simple sobre precisión que nadie va a usar)? Si la respuesta es «no vale la pena», este hueco se cierra con esa frase, no con código.

**🔴 HUECO — Meta del mes: la asesora la ve al cierre, no en vivo mientras vende**

- Quién: Apps del ecosistema Shopify POS como Scoreboard (apps.shopify.com/scoreboard) y Shift Win (apps.shopify.com/shift-win) ponen la meta, el avance y el rango del turno en la pantalla del POS en tiempo real, no solo en un reporte de fin de mes.
- Por qué: CAYLA ya decidió meta mensual por tienda repartida por el líder, top 3 móvil y bono solo-reconocimiento (Bloques 5 y 8-9) — el contenido está resuelto. Lo que no está decidido es el momento: ¿la asesora ve «te faltan S/320 para tu meta del mes» mientras trabaja, o solo al cerrar el día? El propio ADR-0136 de este repo ya autoriza el patrón visual exacto para esto («barra que se llena, cifra que cuenta», con `--ease-cayla`, nunca en bucle) — la pieza de diseño ya existe, falta decidir si se usa aquí.
- Evidencia CAYLA: memoria 60-preguntas Bloque 5 ("cumplimiento de meta" como métrica) y Bloque 8 (ranking top 3 en Inicio) — ambos son vistas de resultado, no de progreso en vivo durante el turno. apps/web/app/globals.css sección «REGLA DE MODALES» (ADR-0136) ya define la animación permitida para este caso exacto.
- Prioridad: media
- Acción: Pregunta concreta para Felipe: ¿quieres una barra de progreso hacia la meta del mes/semana visible en el «Mi día» de cada asesora (celular y escritorio, por rol — ya decidido en Bloque 14), o prefieres que el foco en vivo sea solo operativo (turno, caja) y la meta se quede en el cierre para no generar ansiedad de venta? Ganas: motiva en el momento. Pagas: si la meta está mal repartida por el líder, la presión en vivo se siente injusta todo el mes, no solo al cierre.

**🔴 HUECO — Dotación por hora pico: se decidió guardar el dato, no se decidió el panel**

- Quién: Lightspeed: el «team performance report» calcula ventas versus horas trabajadas (lightspeedhq.com/blog/employee-performance-metrics) para saber si una tienda está sobre o sub-dotada en cada franja horaria — no solo cuánto vendió cada persona, sino si había la gente correcta a la hora correcta.
- Por qué: El propio equipo de CAYLA, en su investigación de calidad del 2026-09-21, listó «dotación por hora pico» entre los datos que hay que guardar desde el día uno de TRU — pero quedó como dato a capturar, no como panel que alguien mira para decidir turnos. Con 6 personas en el equipo de construcción y 3 tiendas + Taller, decidir bien el turno (sin sobre-dotar ni faltar en la hora pico) es una decisión de plata chica todos los días, no una vez al mes.
- Evidencia CAYLA: memoria 60-preguntas, sección "Datos que hay que guardar desde el primer día de TRU": "dotación por turno" listada junto a descuentos y cambios — sin panel asociado. La lectura de asistencia de Dynamic (Bloque 6/investigación) ya existe como fuente (`fn_asesoras_de_turno`), falta cruzarla con ventas por hora.
- Prioridad: media
- Acción: Cuando haya 60-90 días de datos reales de TRU (no antes — PL-05/PL-06 priorizan registro fiel sobre inteligencia prematura), construir un panel simple: ventas por hora del día cruzadas con personas de turno en esa hora (de `fn_asesoras_de_turno`), para que el líder de sede ajuste el cuadro de turnos del mes siguiente.

**✅ ya resuelto de otra forma — Rotación / sell-through por prenda — CAYLA ya lo tiene, y más disciplinado que Square**

- Quién: Square for Retail: reporte «Inventory Sell-through» (squareup.com/help/.../sell-through-report-with-square-for-retail) con regla fija «80%+ excelente, <40% preocupante». Lightspeed X-Series: «dusty inventory report» con última venta y sell-through por SKU (x-series-support.lightspeedhq.com/.../dusty-inventory-report).
- Por qué: No es un hueco — es al revés. Square y Lightspeed muestran un número de sell-through siempre, incluso cuando el costo o el historial de esa prenda no son confiables, lo que puede engañar. CAYLA ya construyó lo mismo pero con una regla más estricta: si el costo no se puede verificar o el historial de movimientos es inconsistente, la rotación se marca explícitamente `null` (N/D) en vez de mostrar un número falso — coherente con el principio 2 del CLAUDE.md del repo ("cero estados inconsistentes").
- Evidencia CAYLA: apps/web/lib/resumen-comparacion.ts y resumen-comparacion.test.ts:264-287 ("con costos que no se pueden verificar el capital pasa a unidades y la rotación de esa variante es N/D"; "sin ventas pero con stock, el sell-through es 0% — es un dato, no N/D"); apps/web/lib/resumen-desempeno.ts:147,176 (misma regla).
- Prioridad: baja
- Acción: Ninguna acción — confirmar con Felipe que esto ya cubre el caso y que no hace falta importar el umbral fijo de Square (80%/40%) como regla de negocio, ya que CAYLA compara contra el propio histórico de la prenda, no contra un umbral genérico importado de otro rubro.

**✅ ya resuelto de otra forma — Comparar tiendas separando ruido del día de los fundamentales — CAYLA ya lo decidió, y mejor que el patrón típico**

- Quién: Shopify Analytics organization dashboard compara ventas entre tiendas día/semana/mes/año (help.shopify.com/.../analytics; shopify.com/blog/store-performance-dashboard), pero lo hace todo en la misma superficie — mezcla ritmo diario con tendencia de fondo.
- Por qué: Felipe fue explícito: «no confundir gestión con ruido diario, se parece a la bolsa» y pidió separar el pulso del día de los fundamentales (márgenes, flujo de caja, deuda) que solo se leen en ventana de 6-12 meses. Eso es más disciplinado que lo que Shopify muestra por defecto (todo junto, con el riesgo de que un mal día se lea como tendencia).
- Evidencia CAYLA: memoria 60-preguntas Bloque 7 ("separar el pulso del día de los fundamentales... un fundamental solo se marca en rojo si sale de su rango de 6-12 meses; se compara contra el mismo mes del año anterior") y Bloque 8 ("Comercial: pulso del día en Inicio + fila propia «Comercial» para los fundamentales").
- Prioridad: baja
- Acción: Ninguna acción — ya decidido y con mejor diseño que el patrón de referencia. Verificar al construirlo que la regla "cada número vive en una sola frecuencia" se respete literalmente (no mostrar el mismo margen como cifra diaria Y mensual en pantallas distintas con números que no cuadran).

**✅ ya resuelto de otra forma — Alertas de quiebre de stock — CAYLA ya las decidió con más criterio antifricción que Square**

- Quién: Square: alertas de bajo stock por email, 90 minutos después del cierre de cada tienda (squareup.com/help/.../create-inventory-alerts). Shopify: alerta diaria por email de variantes bajo el punto de reorden (shopify.com/blog/stock-alerts), sin notificación proactiva nativa (requiere app de terceros).
- Por qué: CAYLA ya decidió dónde viven estas alertas (aviso emergente dentro del sistema, tope de uno por persona al día, resto en campana) y ya tiene un motor de reposición determinista que no solo avisa «bajo stock» sino que arma el plan completo (bajar del almacén, trasladar de otra sede, pedir al Taller, o «revisar» cuando no hay dato suficiente) — más accionable que un email.
- Evidencia CAYLA: apps/web/lib/resumen-reglas.ts:433-457 (motor de reposición con 6 pasos ordenados) y apps/web/lib/catalogo-v2.ts:109-111 (punto de reorden = tiempo de entrega + stock_minimo, mismo cálculo que Shopify). memoria 60-preguntas Bloque 8 ("Alertas de producto nuevo/reposición: primero equipo y líder... tope de un aviso emergente por persona al día, el resto en campana").
- Prioridad: baja
- Acción: Ninguna acción de diseño — solo verificar en producción que el motor de `resumen-reglas.ts` esté conectado a la campana/aviso emergente descrita en Bloque 8 (confirmar si ya está cableado o sigue pendiente de conectar, igual que quedó pendiente conectar `fn_cotizacion_maquila_vigente` a Eficiencia del Taller).

**✅ ya resuelto de otra forma — Descuento sugerido para liquidar (markdown automático) — ningún gigante lo automatiza tampoco**

- Quién: Square y Lightspeed muestran el dato (sell-through bajo, última venta lejana) pero NINGUNO de los productos investigados sugiere un porcentaje de descuento automático; eso queda en manuales de estrategia de mercadeo (koronapos.com/blog/retail-markdown-strategy, umbrex.com/.../markdown-optimization-playbook), no en el software de POS mismo.
- Por qué: Antes de pedirle esto a CAYLA como si fuera un hueco frente a los gigantes, hay que decir la verdad: no lo es. CAYLA ya marca sobrestock como «revisar liquidación» sin inventar un número, exactamente la misma disciplina que estos productos reales — ellos tampoco inventan el %.
- Evidencia CAYLA: apps/web/lib/resumen-reglas.ts:440 ("Sobrestock → no se repone (mantener / revisar liquidación)") y línea 455-457, 896-898 (`revisar_liquidacion` como paso explícito, sin cantidad ni porcentaje inventado — coherente con el comentario del propio archivo: "Si el historial no alcanza... NO se finge una cantidad").
- Prioridad: baja
- Acción: Ninguna acción — este es un ejemplo correcto de NO copiarle a un gigante un patrón que ni el gigante tiene realmente automatizado. Si en el futuro Felipe quiere un asistente de descuento, debe ser una decisión explícita y separada (con su propio Ganas/Pagas), no una copia de "lo que hacen los grandes".


### Velocidad de flujo — el mostrador y el checkout

Investigué patrones de velocidad de Square, Shopify POS, Toast y Lightspeed (atajos de teclado, denominaciones rápidas de efectivo, grillas de favoritos, line busting) y los comparé contra el código real de `apps/web/components/PuntoDeVenta.tsx`, `PuntoDeVentaCatalogo.tsx` y `PuntoDeVentaTicket.tsx`. Aclaración importante: este worktree (rama `claude/cayla-retail-architecture-6f4079`) está desactualizado frente a `origin/main` — le faltan los cambios de la Ola 2 (2026-09-22/23), así que crucé lo que leí con `git show origin/main:...` para varios archivos clave (ADR-0161, `PuntoDeVenta.tsx` real). Hallazgo principal: el mostrador de CAYLA ya está sorprendentemente alineado con los líderes de industria — atajos F1-F5 que saltan directo al cobro, botones de billete rápido + "Exacto", foco automático continuo en el escáner, tickets en espera (park/hold), stepper de cantidad, descuentos con atajos porcentuales, "Imprimir y nueva venta" con Enter como default. No hay una lista larga de huecos de clics por cerrar. Los huecos reales que encontré son distintos: (1) una decisión deliberada (ADR-0161) que agrega una selección obligatoria en cada venta, exactamente donde la industria pone un default; (2) dos preguntas que el propio equipo ya se hizo y dejó abiertas (doble digitación en hora punta, pago externo sin integrar), a las que ahora les puedo poner nombre de patrón de industria y evidencia comparativa para decidir con más criterio, no más opinión.

**✅ ya resuelto de otra forma — Atajos F1–F5 que saltan directo al cobro con un solo medio de pago**

- Quién: Shopify POS (Cmd+Enter inicia el cobro, flechas navegan resultados, Enter selecciona — help.shopify.com/en/manual/sell-in-person/getting-started/keyboard-shortcuts) y Square (checkout bajo 500ms end-to-end, squareup.com/us/en/the-bottom-line/inside-square/platform-improvements)
- Por qué: En una venta de un solo medio de pago (la mayoría), esto evita tocar el medio Y luego confirmar por separado — es la diferencia entre 3 toques y 1 tecla.
- Evidencia CAYLA: apps/web/components/PuntoDeVenta.tsx:706-733 (atajo que en 'armar' con prendas pone TODO el total en ese medio y salta a 'cobrar' en una sola tecla) y :653-679 (Enter/ArrowUp/ArrowDown/Escape en el buscador)
- Prioridad: baja
- Acción: Nada que construir — confirmar con Felipe que el equipo de tienda ya conoce los atajos F1-F5 (posible tarea de capacitación, no de código).

**✅ ya resuelto de otra forma — Denominaciones de efectivo rápidas + botón 'Exacto'**

- Quién: Patrón estándar de tender screens en POS (botones de $5/$10/$20/Exacto que evitan escribir el monto recibido — ver Microsoft Dynamics 365 'faster checkout' learn.microsoft.com/en-us/dynamics365/commerce/dev-itpro/faster-checkout-pos y patentes de POS de billetes/monedas)
- Por qué: El vuelto es el paso más propenso a error y más lento si se escribe a mano; CAYLA ya lo resuelve con toques.
- Evidencia CAYLA: apps/web/components/PuntoDeVentaTicket.tsx:865-877 (BILLETES.map con BilleteRapido que suma, y botón 'Exacto')
- Prioridad: baja
- Acción: Ninguna — ya resuelto, no repetir el patrón.

**✅ ya resuelto de otra forma — Foco automático continuo en el campo de escaneo (scan-and-stay)**

- Quién: Square y Toast mantienen el cursor siempre listo para el siguiente escaneo sin que la cajera tenga que tocar la pantalla entre prenda y prenda
- Por qué: En hora punta, cada toque extra para 'volver a hacer clic en el campo' es tiempo perdido multiplicado por cada prenda de cada venta.
- Evidencia CAYLA: apps/web/components/PuntoDeVentaCatalogo.tsx:149 (autoFocus) + apps/web/components/PuntoDeVenta.tsx:509 (buscador.current?.focus() tras cada agregar) + :1118 (alCerrarEnfocar={buscador} al cerrar el modal de venta registrada)
- Prioridad: baja
- Acción: Ninguna — ya resuelto.

**✅ ya resuelto de otra forma — Tickets en espera (park/hold) con tope de 5**

- Quién: Square 'Open Tickets', Lightspeed 'Park Sale': dejar un carrito a medias y atender a otra clienta sin perderlo
- Por qué: En hora punta con una sola caja, esto es lo que evita que una clienta indecisa bloquee la fila completa.
- Evidencia CAYLA: apps/web/components/PuntoDeVenta.tsx:612-622 (dejarEnEspera, TOPE_ESPERA) y :623-651 (retomar)
- Prioridad: baja
- Acción: Ninguna — ya resuelto y ya decidido en Bloque 4 de las 60 preguntas ('venta a medias se guarda sola').

**🔴 HUECO — El combo 'Responsable/asesora' viene SIEMPRE vacío en Punto de Venta — un tap obligatorio en cada venta, donde la industria pone un default**

- Quién: Square y Toast asocian la venta al cajero que inició sesión por defecto (el 'sold by' es automático) y solo piden elegir a otra persona cuando alguien la cambia explícitamente — el default es la regla, no la excepción
- Por qué: Es el único punto donde CAYLA agrega fricción garantizada a CADA venta, justo en el momento del negocio real de Felipe (evaluar asesoras, D-62/Bloque 5) — pero es una decisión consciente, no un descuido: se decidió y se corrigió dos veces en 24 horas (2026-09-22 y 2026-09-23) precisamente por este trade-off.
- Evidencia CAYLA: docs/adr/0161-responsable-por-operacion-y-retome-de-roles.md, sección 'Actualización 2026-09-23 — ¿Quién está atendiendo? solo al atender a la clienta': modo `atencion` en Punto de venta deja el combo vacío 'también para una persona' porque 'quien atiende a la clienta puede no ser quien abrió la sesión en el mostrador'; ver también origin/main apps/web/components/PuntoDeVenta.tsx:258-260
- Prioridad: alta
- Acción: No es un bug para arreglar solo — es una pregunta concreta para Felipe: ¿cuánto tiempo real agrega el combo por venta en hora punta (medirlo la primera semana de TRU)? Si el costo es alto, una alternativa intermedia (no on/off) es proponer por defecto a la asesora que MÁS veces atendió en los últimos 10 minutos en esa sede (no la sesión, sino un 'último usado' por terminal) y dejar que se cambie con un toque — mantiene la trazabilidad exacta que Felipe pidió sin obligar a elegir de una lista en cada venta.

**🔴 HUECO — Yape/Plin/tarjeta se cobran en un aparato aparte y se 'anotan' a mano en CAYLA — doble registro, no integración**

- Quién: Square (Tap to Pay / lector integrado) y Shopify POS cobran la tarjeta y registran la venta en la MISMA acción — un solo 'Cobrar' cubre cobro real + registro
- Por qué: Cada venta con Yape/Plin/tarjeta (probablemente la mayoría, dado el comentario del propio código: 'Yape + efectivo, la venta más común de la tienda') pasa por DOS sistemas: el aparato de cobro real y luego CAYLA como anotación manual del monto — un paso más y una fuente de descuadre si la cajera anota mal.
- Evidencia CAYLA: apps/web/components/PuntoDeVentaTicket.tsx:749 ('Acá se registra, no se cobra: Yape, Plin y tarjeta se cobran en su propio aparato y esto es la anotación de que entró por ahí')
- Prioridad: media
- Acción: No construir la integración todavía (Felipe ya dijo que no le interesa 'cuadrar al milímetro' con Alegra — Bloque 2 de las 60 preguntas, mismo criterio aplicaría aquí). Sí vale la pregunta concreta: ¿la anotación manual alguna vez causó un descuadre real de caja en el piloto? Si la respuesta es 'nunca' después de un mes, este hueco no vale la inversión de integrar Izipay/Culqi/API de Yape Empresas para 3 tiendas — ciérralo como 'no ahora' con esa evidencia, no lo dejes abierto sin fecha.

**🔴 HUECO — Sin feedback sonoro/háptico al agregar una prenda escaneada**

- Quién: Los lectores de código de barras dedicados (los que usan Square/Toast/Lightspeed en mostrador fijo) emiten su propio beep de hardware al leer bien — independiente del software
- Por qué: Si el mostrador de CAYLA usa de verdad un lector Bluetooth/USB pareado (lo más probable, dado que el campo dice 'Escanea la etiqueta o busca la prenda' y el negocio ya decidió 'celular del mostrador'), el beep de hardware ya resuelve esto y no hay hueco. Si en cambio alguna sede escanea solo con la cámara del celular o tipea el código a mano, la cajera tiene que mirar la pantalla en cada prenda para confirmar que entró — eso sí rompe el 'vender sin mirar la pantalla' que permite la velocidad.
- Evidencia CAYLA: Sin BarcodeDetector/getUserMedia/cámara en el repo (grep sobre apps/web/components y apps/web/lib) — confirma que no hay escaneo por cámara del celular, así que la etiqueta 'Escanea la etiqueta' depende de un lector físico externo pareado como teclado
- Prioridad: baja
- Acción: Pregunta concreta, no tarea: confirmar con Felipe/el mostrador qué hardware de escaneo usan hoy en TRU. Si es un lector físico, este hallazgo se cierra sin construir nada — el beep ya existe, solo no es de CAYLA.

**🔴 HUECO — Sin fila de 'favoritos' o 'más vendidos' fija arriba del catálogo**

- Quién: Shopify POS 'Smart Grid': el home del POS se puede fijar con los productos o colecciones más usados, para agregar sin escanear ni buscar (help.shopify.com/en/manual/sell-in-person/getting-started/smart-grid)
- Por qué: Ahorra taps para lo que se vende todo el tiempo sin tener que escanear (ej. una prenda sin etiqueta, un accesorio de mostrador).
- Evidencia CAYLA: apps/web/components/PuntoDeVentaCatalogo.tsx:271-434 (grilla filtrada solo por chips de categoría, sin una fila de 'destacados'/'más vendidos' antes del resto)
- Prioridad: baja
- Acción: Baja prioridad real: con ~900 SKUs y escaneo como camino principal (confirmado por el propio diseño: el campo de escaneo es 'lo primero y lo más grande del panel', PuntoDeVentaCatalogo.tsx:82-84), la mayoría de las ventas ya evitan el catálogo entero. No construir sin antes medir cuántas ventas en el piloto terminan usando la grilla en vez del escáner — si es <10%, este hueco no vale la pena.

**🔴 HUECO — Sin segunda caja/dispositivo móvil para 'line busting' en hora punta — pregunta ya abierta por el propio equipo, ahora con nombre de patrón**

- Quién: Lightspeed documenta 'line busting': usar un segundo dispositivo móvil para cobrar en el piso de venta durante hora punta, reduciendo hasta 50% el tiempo de cola (lightspeedhq.com/blog/line-busting-in-retail-what-it-is-and-how-to-implement-it/)
- Por qué: CAYLA ya decidió mostrador-en-celular (PL, Bloque 4 de las 60 preguntas) y la arquitectura es cloud/RLS — no hay obstáculo técnico grande para un segundo dispositivo. El propio Felipe/arquitecto ya identificó el riesgo de hora punta con doble digitación sin resolverlo.
- Evidencia CAYLA: cayla-decisiones-60-preguntas-2026-09.md, Bloque 12: 'Hora punta con doble digitación: Felipe respondió «por ahora solo estamos entrando a piloto»: sin regla; se decide con lo observado. Riesgo que le señalé: la asesora salta retail en la fila y stock/caja se descuadran.'
- Prioridad: media
- Acción: No construir nada ahora — está correctamente marcado como 'se decide con lo observado'. Cuando pase la primera semana de TRU en vivo, la pregunta concreta para Felipe es: ¿hubo un momento con cola visible y una sola caja disponible? Si sí, la solución no es una pantalla nueva — es habilitar una segunda sesión de Vender simultánea en la misma sede (ya lo permite el modelo de caja por sede) desde otro celular, sin construir nada adicional.


### Inteligencia de inventario — qué comprar, qué liquidar (Águila)

Investigué cómo Katana MRP, Cin7, Shopify (vía sus apps de forecasting) y NetSuite resuelven punto de reorden, pronóstico de demanda, ABC, stock estancado y liquidación, y lo comparé línea por línea contra lo que CAYLA ya construyó: la migración `20260916100000_punto_reorden.sql` (explícitamente "inspirada en NetSuite", con lead time real calculado por producto desde `compras`/`lotes`, no un número inventado) y el módulo viejo `apps/web/lib/inteligencia.ts` (ABC, estancado, traslados), documentado a fondo en `docs/datos/modulos/13-inteligencia-y-reportes.md`. Dos hallazgos pesan más que el resto: (1) CAYLA tiene HOY dos motores de "cuánto se vende por día" que no se hablan entre sí — uno en SQL (nuevo, global por producto) y otro en TypeScript (viejo, por sede) — y antes de diseñar el esquema de Águila hay que decidir cuál manda; (2) el punto de reorden se calcula agregado por producto padre, nunca por talla/color, lo que contradice directamente lo que Felipe ya pidió ("inventario talla×color con reposición"). El resto de los huecos reales — sin sugerencia de liquidación/markdown, sin puente de alerta→orden de compra, sin MRP de insumos para el Taller (el caso de uso insignia de Katana) — son exactamente los que le faltan a CAYLA para completar PL-02 ("qué comprar, qué liquidar"). También encontré una decisión de CAYLA que la industria valida en vez de contradecir (el umbral de 45 días para "estancado"), y un hueco real pero de baja prioridad ahora mismo (estacionalidad) porque construirlo con 2 ventas reales en producción sería adivinar con cara de ciencia.

**🔴 HUECO — Dos motores paralelos de demanda/reorden (SQL nuevo vs. TypeScript viejo) — decidir cuál manda antes de diseñar Águila**

- Quién: Los sistemas serios que investigué (Cin7 ForesightAI, NetSuite Demand Planning) tienen UN motor de pronóstico que alimenta a la vez ABC, reorden, alertas y sugerencias de compra — nunca dos cálculos independientes de 'cuánto se vende por día' compitiendo dentro del mismo sistema.
- Por qué: CLAUDE.md principio 2 (Fred Brooks, integridad conceptual) es literal: si dos partes del sistema resuelven el mismo problema de dos formas distintas, una de las dos está mal aunque las dos funcionen. Diseñar el esquema de Águila sobre una base que ya tiene dos respuestas distintas a 'cuánto vendo por día' es construir sobre una grieta, no sobre el núcleo.
- Evidencia CAYLA: supabase/migrations/20260916100000_punto_reorden.sql calcula demanda_diaria en SQL, agregada por producto, ventas de 30 días de TODAS las sedes (fn_productos). apps/web/lib/inteligencia.ts:112-125 calcula velocidad/reorden en TypeScript, filtrado por RLS a la sede de quien mira, con su propia lógica (documentado en docs/datos/modulos/13-inteligencia-y-reportes.md, tabla 'De qué columna cuelga cada indicador'). Alimentan pantallas distintas (/inventario vs. /comercial, /, /producto) sin cruzarse.
- Prioridad: alta
- Acción: Preguntarle a Felipe: ¿Águila reemplaza a inteligencia.ts entero con un solo motor SQL (el más nuevo, con lead time real desde compras), o los dos siguen separados porque de verdad resuelven alcances distintos (global-empresa vs. por-sede)? Si no hay una razón de negocio real para los dos, se colapsa a uno antes de agregar tablas nuevas.

**🔴 HUECO — El punto de reorden es por producto padre, nunca por talla/color — y Felipe ya pidió justo lo contrario**

- Quién: El patrón de 'size curve' que usan las marcas de moda serias (StyleMatrix, Impact Analytics, el caso citado de Nike): se pronostica a nivel estilo/color y se desagrega a nivel talla, porque la curva de tallas real casi nunca es uniforme — una tienda se queda sin M mientras le sobra L de la misma prenda.
- Por qué: No es un patrón que le copio a un gigante: Felipe ya lo pidió explícitamente como parte de lo que hace a CAYLA 'superior' a Alegra ('mostrador rápido, reportes que sirvan e inventario talla×color con reposición', memoria de las 60 preguntas, Bloque 3). Hoy el sistema no lo hace.
- Evidencia CAYLA: supabase/migrations/20260916100000_punto_reorden.sql:100-118 — el CTE `agregado` hace `group by p.id, p.referencia, ...` (sin variante_id, sin color_codigo, sin talla) y suma `stock_total` de TODAS las variantes con `sum(s.cantidad)`. Dos variantes del mismo producto con curvas de venta opuestas comparten el mismo punto_reorden y el mismo reponer_de_proveedor.
- Prioridad: alta
- Acción: Preguntarle a Felipe: ¿el punto de reorden de Águila debe bajar a nivel variante (talla×color) ahora, con ~900 SKUs, o seguir agregado por producto mientras el catálogo real termina de cargarse? Si la respuesta es 'por variante', es un cambio estructural del group by de fn_productos, no un ajuste menor — vale la pena decidirlo antes de construir.

**🔴 HUECO — No hay sugerencia de liquidación ni de profundidad de descuento — solo un flag binario 'estancado'**

- Quién: Cin7 usa ABC segmentation explícitamente para decidir qué eliminar; la práctica estándar de retail de moda (Toolio, Eightx, StyleMatrix) usa sell-through rate como gatillo objetivo (40-50% vendido a mitad de temporada, 70-80% a tres cuartos) y fases de descuento (10-15% primero, 20-30% si no reacciona) antes de liquidar del todo.
- Por qué: Es literalmente la mitad de PL-02: 'qué liquidar' es uno de los tres verbos que Felipe usó para definir el éxito del ERP a 3 años. Hoy CAYLA solo dice 'estancado: sí/no' (45 días sin venta) — no dice cuánto descontar ni cuándo escalar de 'bájale el precio' a 'sácalo ya'.
- Evidencia CAYLA: packages/shared/src/enums.ts:41 (UMBRAL_ESTANCADO_DIAS=45) y apps/web/lib/inteligencia.ts:117 — es un flag, no una recomendación de acción. No existe ninguna función que calcule sell-through (vendido ÷ recibido desde que entró el lote) ni que proponga un % de descuento.
- Prioridad: alta
- Acción: Diseñar en Águila un indicador de sell-through por producto (o por corrida del Taller) y una regla de escalamiento: a los 45 días sin venta, aviso con descuento sugerido leve; a los 90 días, 'candidato a liquidar' — en vez de un flag único sin acción asociada.

**🔴 HUECO — No hay puente entre la alerta de reorden y una orden de compra sugerida**

- Quién: Katana: 'genera órdenes de compra o producción listas para aprobar, para cualquier SKU'. Cin7 ForesightAI: 'crea automáticamente órdenes a proveedores basadas en la necesidad de inventario futura'. Apps de Shopify (Forstock, Assisty): arman la orden de compra sola cuando el stock toca el punto de reorden.
- Por qué: Hoy alguien tiene que mirar la lista de 'reponer' y armar la orden de compra a mano, producto por producto — exactamente el trabajo manual que Águila debería quitarle a Felipe/al rol Compras (PL-27).
- Evidencia CAYLA: supabase/migrations/20260916100000_punto_reorden.sql — reponer_de_proveedor es solo un booleano que filtra la lista de /inventario (p_stock='reponer'); no hay ninguna función que agrupe esos productos por proveedor y arme un borrador en ordenes_compra. El módulo de Compras (PL-27) existe aparte, sin ese puente.
- Prioridad: alta
- Acción: Diseñar en Águila una función que agrupe los productos con reponer_de_proveedor=true por proveedor habitual y arme un borrador de orden de compra (cantidad sugerida = punto_reorden − stock_total), que el rol Compras solo revisa y confirma, no arma desde cero.

**🔴 HUECO — No hay MRP para el Taller — el caso de uso insignia de Katana (manufactura+retail) que CAYLA todavía no cubre**

- Quién: Katana existe justo para negocios como CAYLA: explota la lista de materiales (BOM) de cada producto contra el plan de producción/ventas para calcular qué materia prima comprar y cuándo. Es su feature central, no un extra.
- Por qué: El Taller es la mitad manufacturera de CAYLA. 'Qué comprar' para el Taller (tela, avíos) es tan importante como para las tiendas, y hoy Águila (ni ningún otro módulo) lo calcula — se compra a ojo.
- Evidencia CAYLA: docs/datos/modulos/10-produccion-del-taller.md:449 confirma: 'Tampoco hay pantalla de alerta de stock mínimo (insumos.stock_minimo contra v_insumo_saldos.fisico)'. La columna y la vista existen; nada las conecta, y no existe una receta (BOM) real variante→insumos-por-unidad que permita explotar un plan de producción en necesidad de compra.
- Prioridad: alta
- Acción: Diseñar en Águila (o como extensión del contrato del Taller) una función análoga a fn_productos para insumos: comparar v_insumo_saldos.fisico contra stock_minimo, y — cuando exista una receta real modelo→insumos — multiplicar por las órdenes de producción planeadas, no solo por consumo histórico.

**🔴 HUECO — La sugerencia de traslado entre sedes ignora el almacén — confirmado en el propio repo, validado por el patrón multi-sede de la industria**

- Quién: Cin7 ForesightAI y apps como Assisty ofrecen 'multi-location planning': visibilidad de traslados y reposición cruzando TODAS las ubicaciones de una marca, incluida la bodega, no solo el piso de venta.
- Por qué: Sin esto, el sistema propone mover una prenda entre ciudades para resolver algo que se resolvía bajando una caja del almacén de la misma tienda — plata y tiempo gastados en un traslado innecesario.
- Evidencia CAYLA: Ya documentado como hueco 6 en docs/datos/modulos/13-inteligencia-y-reportes.md: inteligencia.ts:137-165 solo recorre stockPorSede (piso), nunca stockAlmacenPorSede, contradiciendo D-39 ('las alertas cuentan piso y almacén').
- Prioridad: alta
- Acción: Cuando se construya Águila (o se corrija inteligencia.ts antes), la sugerencia de traslado debe sumar piso + almacén de la sede de destino antes de proponer traer de otra tienda. Es corrección de un hueco ya nombrado, no diseño nuevo.

**🔴 HUECO — ABC ordena por monto vendido, no por margen — el bloqueo original para arreglarlo (descuentos sin registrar) ya se resolvió en otra ola**

- Quién: Cin7 (ABC product segmentation) y NetSuite (ABC/123) ponderan por rentabilidad, no solo por ingreso — un producto con mucho volumen pero margen bajo (por ejemplo, vendido con descuento fuerte) no debería salir como clase A automáticamente.
- Por qué: Una clase ABC que corona como 'la más importante' a una prenda que se vendió toda con descuento y perdiendo plata contradice directamente el objetivo de 'mejor toma de decisiones' de PL-02.
- Evidencia CAYLA: Ya documentado como hueco 5 en docs/datos/modulos/13-inteligencia-y-reportes.md: inteligencia.ts:88-104 ordena por movimientos.monto (lo que tecleó quien cobró). El bloqueo era D-44 (el descuento no se guardaba aparte del precio) — pero la migración venta_asesora_emisor_descuento_lider (D-56/60/67, ya en main desde la Ola 1/2 de esta misma sesión) ya guarda el descuento estructurado.
- Prioridad: media
- Acción: Rediseñar la clase ABC de Águila para ordenar por margen bruto (monto − costo, con el descuento ya visible) en vez de monto bruto — el dato que faltaba para hacerlo bien ya existe en la base, falta usarlo.

**✅ ya resuelto de otra forma — El umbral de 'estancado' en 45 días no es un hueco — es una decisión de CAYLA que el benchmark de la industria valida**

- Quién: NetSuite marca dead stock a partir de 90+ días sin movimiento como referencia genérica; la industria de moda rápida apunta a sell-through de 70-80% dentro de temporada, más agresivo que el retail general.
- Por qué: Vale la pena decirlo explícitamente para que Felipe sepa que 45 días (PL-26, R-20: 'CAYLA rota rápido') no fue un número arbitrario — es coherente con que la moda rápida exige moverse más rápido que el genérico de NetSuite. No hay que copiarle a NetSuite acá.
- Evidencia CAYLA: docs/plano/02-ACTA-SESION-1.md PL-26 y docs/datos/15-COMO-OPERA-CAYLA.md R-20/A-02 — el umbral ya está decidido y documentado, con el siguiente paso (ajuste por categoría) también decidido, solo falta construirlo.
- Prioridad: media
- Acción: No hay pregunta nueva para Felipe acá. Ejecutar lo ya decidido en PL-26/A-02 (columna de umbral por categoría, con las líderes de equipo) — es tarea de construcción, no de diseño.

**🔴 HUECO — Pronóstico de demanda con ventana plana de 30 días, sin estacionalidad — correcto para hoy, pero hay que decirlo para no prometerlo antes de tiempo**

- Quién: Cin7 ForesightAI pronostica hasta 24 meses adelante ajustando por estacionalidad con ML; apps de Shopify como Forstock arman planes de demanda a 12 meses ajustando por temporada y patrones cambiantes de venta.
- Por qué: Sería valioso eventualmente (CAYLA es moda, con temporadas reales), pero construirlo ahora sería adivinar con cara de ciencia: producción tiene 2 ventas reales hoy, no hay ni un mes completo de historial. Es exactamente el tipo de sobre-ingeniería que CLAUDE.md pide evitar (principio 'diseña para el volumen que viene, no lo sobre-construyas').
- Evidencia CAYLA: supabase/migrations/20260916100000_punto_reorden.sql:115-122 — demanda_diaria es la suma de movimientos.cantidad de los últimos 30 días ÷ 30, ventana fija y plana, sin ajuste estacional. docs/datos/11-KPIS.md confirma 2 filas reales en ventas al 2026-09-12.
- Prioridad: baja
- Acción: No construir estacionalidad todavía. Sí dejarlo escrito en el diseño de Águila como 'fase 2, cuando haya 6-12 meses de historial real', para que nadie lo prometa antes de tener datos con qué calcularlo.

**🔴 HUECO — Un Integrante puede estar viendo un punto de reorden calculado con el alcance equivocado, y la pantalla no lo distingue**

- Quién: El principio detrás de 'multi-location planning' en Cin7/Assisty es justamente que el sistema sepa distinguir y mostrar con claridad cuándo un número es de una sede y cuándo es de toda la red — nunca mezclarlos bajo el mismo nombre de campo.
- Por qué: Si Águila hereda el cálculo viejo (inteligencia.ts, filtrado por RLS a la sede) para alguna pantalla, un colaborador de TRU vería 'quedan 3, repón ya' de un producto que en toda la red tiene 40 — una decisión de compra tomada con el número equivocado, sin que nadie se entere de que era parcial.
- Evidencia CAYLA: Ya documentado como hueco 11 en docs/datos/modulos/13-inteligencia-y-reportes.md: inteligencia.ts:107-125 construye stockTotal/reorderPoint sobre lo que RLS le dejó leer (solo la sede del Integrante), con el mismo nombre de campo que usa el Admin para el total de la red.
- Prioridad: media
- Acción: Al diseñar las pantallas de Águila, cada número de reorden/estancado debe declarar explícitamente su alcance ('de tu sede' vs. 'de toda la red') en el propio rótulo, no dejar que el nombre del campo sea ambiguo entre roles.


### Taller↔Tiendas: cómo CAYLA modela retail + manufactura propia, comparado contra Katana MRP, Odoo Manufacturing/Inventory/POS y el patrón vertical de Zara

Investigué (WebSearch, en inglés, fuentes reales de producto e ingeniería) cómo Katana MRP, Odoo Manufacturing/Inventory/POS y Zara conectan fábrica con tienda: receta de materiales (BOM) que dispara compras, eficiencia de tela/marker, costo que viaja con la prenda (landed cost), reparto de producción entre tiendas y planificación de carga de taller. Lo comparé contra lo que CAYLA ya construyó y decidió (D-31, D-45/ADR-0067, ADR-0090, ADR-0133, PL-39, Bloque 10-11 de la ronda de 60 preguntas) leyendo el código y los documentos reales del repo, no de memoria. El costeo promedio ponderado que viaja con la variante (ADR-0067) ya iguala el patrón de "landed cost" de Katana — no hay nada que copiarle ahí. Pero encontré una brecha estructural real: CAYLA registra el consumo de tela/avíos DESPUÉS de fabricar (`registrar_consumo_insumo`), no tiene una receta planificada (BOM) por producto que le diga ANTES cuánto material necesita una corrida — eso es el núcleo de todo MRP y CAYLA no lo tiene. Encontré además una deriva concreta y verificable en código: Felipe decidió explícitamente en PL-39 que "eficiencia del Taller" significa tela aprovechada (metros consumidos vs. lo que Audaces dice que debía consumir), pero la pantalla `/produccion/eficiencia` que se construyó mide otra cosa — costo por prenda (materiales + planilla ÷ prendas buenas) — sin ninguna referencia a Audaces, metros o tela. Y la función que responde la pregunta central de D-31 ("¿me conviene tener Taller propio?", la cotización de maquila) ya existe en producción pero no la llama ninguna pantalla. El resto de hallazgos son de impacto medio o bajo, y uno confirma que CAYLA ya resuelve bien el patrón de costeo — no hay que copiarle nada a Katana ahí.

**🔴 HUECO — No existe receta de materiales (BOM) por producto — CAYLA registra consumo real DESPUÉS de fabricar, nunca calcula la necesidad ANTES**

- Quién: Katana MRP: BOM multinivel por producto (X metros de tela + N avíos por unidad) que el motor de MRP compara contra inventario y genera automáticamente la orden de compra que falta (katanamrp.com/blog/bom-in-material-requirements-planning-mrp/). Odoo Manufacturing: misma lógica, la BOM alimenta reabastecimiento de componentes (odoo.com/documentation/19.0/.../bill_configuration.html).
- Por qué: Es exactamente lo que PL-02 pide: 'transaccionar inteligente — qué comprar'. Sin receta planificada, el líder del Taller solo sabe cuánta tela le faltó DESPUÉS de abrir la corrida (o de que `registrar_consumo_insumo` se lo diga sobre la marcha), nunca ANTES de comprometerse a producir. No hay forma de que el sistema le diga 'para esta orden de 200 prendas necesitas comprar 180 metros más de esta tela' antes de que la corrida ya esté en curso.
- Evidencia CAYLA: docs/datos/modulos/10-produccion-del-taller.md líneas 88-94 (bom_items se borró en el corte V1→V2 y nunca se reconstruyó) y líneas 446-450 (registrar_consumo_insumo registra consumo real, pero nada calcula el requerimiento antes de abrir la orden)
- Prioridad: alta
- Acción: Pregunta concreta a Felipe: ¿vale la pena una receta mínima por producto/variante (metros de tela y cantidad de avíos por unidad, la misma cifra que hoy sale de Audaces para PL-39) que `abrir_produccion` use para avisar 'con lo que tienes en insumos, esta corrida no alcanza' antes de comprometer la orden? Es una tabla chica (producto_id, insumo_id, cantidad_por_unidad) y una validación en `abrir_produccion`, no un rediseño.

**🔴 HUECO — La cotización de maquila (la comparación central de D-31: '¿me conviene tener Taller propio?') existe en producción pero ninguna pantalla la llama**

- Quién: Katana y Odoo muestran costo real de producción propia junto al costo de comprar/tercerizar en el mismo tablero, para que la decisión 'fabricar vs. comprar' se lea de un vistazo (patrón estándar de costeo CMT: worldfashionexchange.com/blog/garment-costing-how-costs-are-calculated-in-the-fashion-industry).
- Por qué: D-31 fijó esto como LA métrica que justifica tener un Taller propio en vez de solo comprar/maquilar todo. Felipe ya la revivió explícitamente en el Bloque 11 de la ronda de 60 preguntas después de que otra sesión la había descartado por error el mismo día — es una decisión que él confirmó dos veces. Que la función exista en la base y nadie la muestre es la promesa incumplida más directa de este frente.
- Evidencia CAYLA: memoria cayla-decisiones-60-preguntas-2026-09.md, líneas 95 y 127: 'Pendiente: conectar fn_cotizacion_maquila_vigente a la pantalla de Eficiencia del Taller — nadie la llama todavía'; verificado 2026-09-23: `grep -rn fn_cotizacion_maquila_vigente apps/web` no devuelve nada
- Prioridad: alta
- Acción: Conectar `fn_cotizacion_maquila_vigente` a `/produccion/eficiencia` (apps/web/app/(app)/produccion/eficiencia/page.tsx) mostrando el costo real de la corrida al lado de la cotización de maquila vigente por tipo de prenda. Es trabajo de una sesión: la función ya está probada en producción, falta la llamada y una columna en el panel.

**🔴 HUECO — Deriva entre lo que Felipe decidió que significa 'eficiencia' (PL-39: tela aprovechada) y lo que se construyó (costo por prenda)**

- Quién: Sistemas de corte textil (Audaces, Lectra, Gerber) reportan 'marker efficiency' — metros de tela realmente cubiertos por el patrón vs. el ancho total de la tela, benchmark de industria 78-94% (apparel.wiki/blog/fabric-consumption-markers-optimizing-yield). Es una métrica de MATERIAL, distinta de costo.
- Por qué: PL-39 registra la respuesta recomendada y elegida de Felipe, palabra por palabra: 'eficiencia' = metros consumidos vs. lo que Audaces dice que debía consumir esa corrida. Lo que se construyó en el F7 de ADR-0133 (`/produccion/eficiencia`) mide otra cosa: (planilla + gastos generales) ÷ prendas buenas — una eficiencia de COSTO/mano de obra, sin ninguna referencia a Audaces, metros o tela. No es que CAYLA no mida nada — mide algo real y útil, pero no lo que Felipe pidió explícitamente en PL-39. Si nadie se lo señala, Felipe puede creer que esa pregunta ya está resuelta cuando no lo está.
- Evidencia CAYLA: docs/plano/01-BANCO-PREGUNTAS.md líneas 146-154 (PL-39, respuesta recomendada elegida: tela aprovechada vs. Audaces) contra apps/web/lib/eficiencia-reglas.ts línea 5 (comentario: 'MATERIALES: la tela, los avíos y la maquila... COSTOS reales'; sin mención de metros/Audaces/marker en todo el archivo, verificado con grep)
- Prioridad: alta
- Acción: Pregunta directa a Felipe (no tarea todavía): ¿la pantalla de Eficiencia que ya tienes (costo por prenda) reemplaza la definición de PL-39, o falta agregar el % de tela aprovechada (metros reales vs. lo que Audaces predijo) como una segunda métrica en el mismo panel? Si la respuesta es 'agregar', es un campo más en `produccion_lineas` o `producciones` (metros_reales, metros_audaces) y una tarjeta en `EficienciaTallerPanel`.

**🔴 HUECO — El valor de las corridas en curso (WIP) no aparece en ningún reporte de posición del negocio**

- Quién: Katana y Odoo tratan una orden de producción abierta como inventario valorizado (Work-In-Process asset): el material ya consumido pero que todavía no es prenda terminada sigue contando como valor del negocio, no desaparece de los reportes mientras se cose.
- Por qué: El 'balance' que Felipe pidió en el Bloque 8 (posición operativa = inventario al costo + efectivo − por pagar) puede estar subestimando el inventario real: cuando `registrar_consumo_insumo` descuenta `insumo_lotes`, ese valor sale de 'insumos' pero solo reaparece en `producciones.costo_tela/costo_avios` — una tabla que ningún reporte de valorización consulta todavía. Con corridas que pueden tardar días o semanas entre patronaje y acabado, ese valor queda invisible mientras dura la orden.
- Evidencia CAYLA: verificado 2026-09-23: `grep -rln valorizac apps/web/lib apps/web/app` no devuelve ningún archivo; docs/datos/modulos/10-produccion-del-taller.md líneas 137-141 confirman que `producciones.costo_tela/avios/maquila` se actualiza en vivo con `registrar_consumo_insumo` mientras la orden está `en_proceso`
- Prioridad: media
- Acción: Cuando se construya el 'balance'/posición operativa de Comercial (Bloque 8), sumar el costo acumulado de las órdenes `en_proceso` del Taller (ya calculado en tiempo real en `producciones`) al inventario valorizado — sin eso, el número de 'cuánto vale mi inventario' siempre estará incompleto mientras el Taller tenga corridas abiertas.

**✅ ya resuelto de otra forma — El reparto de una corrida entre TRU/AQP/LIM es 100% manual, sin sugerencia basada en rotación o venta reciente**

- Quién: Zara decide cuánto de cada lote va a cada tienda usando datos de venta en tiempo real por tienda (thefuturefactory.com/insights/zara-lean-supply-chain-agility) — el pulso de venta de cada tienda mueve el reparto de fábrica, no un criterio fijo.
- Por qué: Con solo 3 tiendas y un Taller, un algoritmo de allocation es sobre-ingeniería (principio 5 de CLAUDE.md: 'no sobre-construyas para el volumen que nunca llegará') — es razonable que CAYLA lo resuelva con criterio humano, y probablemente sea la decisión correcta a este tamaño. Lo anoto como hueco_real=false con matiz: CAYLA ya tiene construido `reorden-reglas.ts`/`describirRotacion` para productos terminados por sede, así que una sugerencia simple ('esta talla rota más rápido en AQP que en TRU') sería barata de armar sobre datos que ya existen — vale la pena preguntarlo, no construirlo de oficio.
- Evidencia CAYLA: docs/datos/modulos/10-produccion-del-taller.md línea 48-49 ('el destino lo elige quien traslada'); apps/web/lib/reorden-reglas.ts y catalogo-v2.ts (punto de reorden por sede ya construido para productos terminados, reutilizable)
- Prioridad: baja
- Acción: Pregunta concreta a Felipe, no tarea: ¿el líder del Taller ya tiene suficiente criterio para repartir entre 3 tiendas, o le serviría ver junto al traslado la rotación reciente de ese modelo por sede (dato que `reorden-reglas.ts` ya calcula para otra pantalla)? Si dice que sí, es reutilizar una función existente, no construir un algoritmo nuevo.

**🔴 HUECO — No hay una vista agregada de cuántas corridas están en cada etapa del Taller a la vez (kanban de carga)**

- Quién: Katana ofrece 'production scheduling': un tablero que agrega todas las órdenes activas por etapa/estación para ver dónde se está atascando la planta (katanamrp.com/features).
- Por qué: El Taller ya guarda las 6 etapas por orden (`etapas` jsonb: patronaje, muestra, escalado, corte, confección, acabado — ver `set_etapa_produccion`), pero solo se ve orden por orden, no hay un resumen de 'cuántas corridas hay ahora mismo en corte' o 'dónde se está atrasando el taller'. Con 6 personas y un taller, el valor de esto es bajo comparado con Zara/Katana (fábricas con decenas de líneas), pero el dato ya existe y el costo de una vista simple es chico.
- Evidencia CAYLA: docs/datos/modulos/10-produccion-del-taller.md líneas 43-44 (pantallas actuales de Producción: Resumen, Órdenes, Insumos, Proveedores, Comprobantes, Recibir, Por pagar, Eficiencia — ninguna agrega por etapa) y líneas 274-276 (columna `etapas` jsonb, ya existe el dato crudo)
- Prioridad: baja
- Acción: Si el volumen de corridas simultáneas crece (hoy con 1 Taller probablemente no vale la pena), agregar a `/produccion` (Resumen) un conteo simple por etapa sobre las órdenes `en_proceso` — no requiere migración, es una agregación de lectura sobre `producciones.etapas`.

**✅ ya resuelto de otra forma — El costo que viaja con la prenda (promedio ponderado) ya iguala el patrón de 'landed cost' de los mejores ERP — no hay nada que copiarle a Katana aquí**

- Quién: Katana calcula el costo real por unidad (landed cost) sumando materiales, mano de obra y costos adicionales, y lo actualiza en el producto en cada evento de costo (katanamrp.com/blog/added-costs/).
- Por qué: Confirmo explícitamente que esto NO es un hueco: ADR-0067/D-45 (costo promedio ponderado) ya resuelve exactamente lo mismo, con una función compartida (`fn_recalcular_costo_variante`) que actualiza `variantes.costo` tanto al cerrar una producción como al recibir una compra — el costo real viaja con la variante sin importar si nació en el Taller o se compró. Es el mismo patrón, ya construido y verificado en producción. Lo incluyo para que quede explícito que no hay que rediseñar el costeo — el foco de mejora está en la receta/MRP (hallazgo 1), no en cómo se calcula ni se propaga el costo.
- Evidencia CAYLA: docs/datos/modulos/10-produccion-del-taller.md líneas 235-239 (variantes.costo la promedian tanto cerrar_produccion como recibir_lote/recibir_compras, vía fn_recalcular_costo_variante, con auditoría gratis en historial_producto_cambios) y líneas 482-484 (ADR-0067/ADR-0072)
- Prioridad: baja
- Acción: Ninguna — es una confirmación, no una tarea. Si se toca este código, hacerlo solo por una razón de negocio nueva, no para 'modernizarlo' contra un patrón externo que ya cumple.


### Reportes y decisiones basadas en datos — el panel de mando del dueño-operador

Comparé el patrón de "panel de mando" de Shopify (multi-store reporting, comparación año contra año, cash tracking multi-sede), Lightspeed Analytics (KPIs de retail, alertas de stock configurables), QuickBooks/Xero (widgets de flujo de caja, pronóstico rolling de 13 semanas) y el concepto de "single pane of glass", contra lo que CAYLA ya decidió (D-52 los 3 números, Bloque 8 de la ronda de 60 preguntas — Comercial en Inicio + fila de fundamentales, PL-72 resumen de resultado por sede) y lo que el repo real tiene construido hoy (`docs/datos/11-KPIS.md`, `docs/plano/03-ACTA-SESION-2.md`). Nota importante para Felipe: esta investigación es sobre la capa de REPORTES/TABLERO — la gestión comercial en sí (asesoras, metas, ranking, fidelización, bono) ya se investigó a fondo en la ronda del 2026-09-21 y no la repetí, como pediste. Los huecos reales que encontré están casi todos del lado de "convertir el número en una acción" (comprar, liquidar, atender ya) más que del lado de "mostrar más números" — que es exactamente donde Felipe definió el éxito a 3 años (PL-02).

**🔴 HUECO — Ningún reorder point se convierte en una lista de compra accionable**

- Quién: POS/ERP modernos (Lightspeed, sistemas cloud descritos en el patrón de reposición automática) redactan una orden de compra en el momento en que el stock cruza el punto de reposición, lista para enviar al proveedor — no solo un número en pantalla.
- Por qué: Felipe definió el éxito como 'transaccionar de forma inteligente — qué comprar' (PL-02). Hoy CAYLA calcula el número pero nadie hace nada con él sin copiarlo a mano.
- Evidencia CAYLA: apps/web/lib/inteligencia.ts:119 calcula `reorderPoint` (velocidadDiaria × 14 + stock_minimo) pero no hay pantalla ni RPC que lo convierta en una orden de compra sugerida; PL-76 solo diseña el esquema de Águila, no lo construye
- Prioridad: alta
- Acción: Construir una vista 'Lista de compra sugerida' que agrupe las variantes bajo su reorder point por proveedor (usando el módulo de Abastecimiento del Taller/Producción como referencia de patrón), exportable o copiable para mandar al proveedor. Pregunta a Felipe: ¿la unidad de la lista es por proveedor o por sede?

**🔴 HUECO — No hay reporte de inventario envejecido con niveles de liquidación (30/60/90/180 días)**

- Quién: El 'inventory aging report' de Shopify y el patrón estándar de dead-stock: escalona la acción según cuánto tiempo lleva parado (marcar/mejorar temprano, rebajar a la mitad, liquidar o dar de baja después de 180 días) — no un solo umbral binario.
- Por qué: Es literalmente la otra mitad de PL-02: 'qué liquidar'. Hoy CAYLA sabe qué está parado pero no en qué etapa de gravedad está ni qué acción corresponde.
- Evidencia CAYLA: apps/web/lib/inteligencia.ts:117 solo tiene un booleano `estancado` con un único umbral (`UMBRAL_ESTANCADO_DIAS = 45`, `packages/shared/src/enums.ts:41`); no hay buckets de antigüedad ni un flujo de 'marcar para liquidar'
- Prioridad: alta
- Acción: Agregar buckets de antigüedad (0-45 / 46-90 / 91-180 / >180 días) sobre `diasSinVenta` ya calculado, con una acción sugerida por bucket, y una pantalla 'Para liquidar' que Felipe pueda revisar semanalmente. Depende primero de arreglar `stock.ultima_venta` (11-KPIS.md, punto d del Número 2) — sin eso el bucket miente.

**🔴 HUECO — No existe una bandeja única de 'esto necesita tu atención hoy'**

- Quién: El patrón 'single pane of glass' y los sistemas POS con alertas configurables (bajo stock, sobrestock, caja sin cuadrar) agregan las excepciones de todos los módulos en un solo feed priorizado, en vez de que el dueño tenga que abrir pantalla por pantalla a buscar qué está roto.
- Por qué: Felipe es simultáneamente dueño de 3 tiendas + Taller y arquitecto del sistema; hoy los 'qué lo rompe' de cada número viven documentados pero dispersos (uno por número, uno por pantalla) y nada se los muestra juntos en producción.
- Evidencia CAYLA: docs/datos/11-KPIS.md documenta 'Qué lo rompe' por separado para cada uno de los 3 números (líneas 163-220, 281-422, 491-577) sin una vista consolidada en la app; Bloque 8 de la ronda-60 solo decidió alertas de 'producto nuevo/reposición' limitadas al equipo, no una bandeja ejecutiva para Felipe
- Prioridad: alta
- Acción: Diseñar (Águila, PL-76) un widget 'Atención' en el Inicio de Felipe que junte: cajas sin cerrar a esta hora, gastos con metodo_pago NULL (hoy rotos, ver 11-KPIS.md punto a del Número 3), boletas pendientes de SUNAT >X horas, stock roto por motivo mal escrito. Empieza por listar las señales, no por construir todo — validar con Felipe cuáles quiere ver primero.

**🔴 HUECO — El efectivo consolidado de las 3 sedes + Taller no se ve en un solo número**

- Quién: El cambio de Shopify POS de 2026 ('cash tracking across locations') dio exactamente este salto: de ver caja por tienda a comparar/sumar el efectivo de todas las ubicaciones en una sola vista.
- Por qué: D-52 marcó 'Efectivo y caja' como uno de los 3 números que Felipe mira primero — pero hoy vive por sede, no como una posición total del negocio.
- Evidencia CAYLA: docs/datos/11-KPIS.md líneas 426-448: 'Efectivo y caja' se calcula por sede en `/finanzas/efectivo` (getCuadreEfectivo) y el cierre en `/vender`; no hay evidencia en el repo de un total consolidado en el Inicio del rol Admin
- Prioridad: media
- Acción: Pregunta concreta a Felipe: cuando abres tu Inicio, ¿quieres ver un solo número de efectivo sumando TRU+AQP+LIM+Taller, o prefieres verlos siempre separados para no tapar una sede con problema? Si quiere el consolidado, es una suma sobre la misma consulta de `getCuadreEfectivo` ya existente, sin tocar el núcleo.

**🔴 HUECO — No hay GMROI (margen por sol invertido en inventario)**

- Quién: Lightspeed Analytics lo destaca como KPI central para decidir qué categorías merecen más capital de inventario, no solo qué vende más en soles.
- Por qué: Ayuda a decidir 'qué comprar' (PL-02) con una vista distinta a la clase ABC por ingreso que ya existe — pero solo tiene sentido cuando el costo y el margen dejen de estar sucios.
- Evidencia CAYLA: docs/datos/11-KPIS.md líneas 620-646: el margen por prenda está 'sucio arriba y abajo a la vez' (D-44 descuentos no registrados, D-45 costeo abierto) — construir GMROI encima hoy sería una cifra con apariencia de precisión sobre datos que no la tienen
- Prioridad: baja
- Acción: No construir todavía. Anotar en BACKLOG como dependiente de D-45 (elegir método de costeo con el contador) y D-44 (registrar el descuento, no solo el precio final). Revisar cuando esos dos se cierren.

**🔴 HUECO — Sell-through por talla (curva de tallas) sigue sin construirse, y es la ventaja real frente a Bsale/Alegra**

- Quién: El patrón de optimización de curva de tallas (assortment planning) que usan herramientas de retail más avanzadas que un ERP genérico: decide la mezcla de tallas de la próxima corrida según qué talla se agotó rápido.
- Por qué: El propio repo ya lo identificó como 'la frase que ningún sistema contable dice' — es el diferencial de CAYLA por modelar todo a nivel de variante (talla × color), algo que Alegra/Bsale no hacen.
- Evidencia CAYLA: docs/datos/11-KPIS.md líneas 708-729: 'Sell-through por talla — la ventaja competitiva que todavía no se puede calcular'; sellThrough hoy es solo por variante (inteligencia.ts:128), sin agregación por talla, y bloqueado por volumen real de datos (19 variantes, 2 ventas)
- Prioridad: media
- Acción: No construir aún — está correctamente bloqueado por datos reales insuficientes, como ya dice el propio documento. Cuando el Taller cierre su primera corrida real con ventas de un mes completo en TRU, agregar la consulta por talla sobre la estructura que ya existe (es solo una agregación nueva, no un cambio de esquema).

**🔴 HUECO — El flujo de caja es una foto de hoy, no un pronóstico de las próximas semanas**

- Quién: Xero, QuickBooks y el patrón de pronóstico rolling de 13 semanas muestran hacia adelante cuándo se va a apretar la caja (pagos a proveedor, planilla), no solo cuánto hay hoy.
- Por qué: Es una mejora real de 'mejor toma de decisiones' (PL-02), pero puede ser prematura: Felipe explícitamente dijo que no le interesa 'cuadrar al milímetro' y el saldo de bancos hoy se teclea a mano una vez por semana.
- Evidencia CAYLA: cayla-decisiones-60-preguntas-2026-09.md Bloque 11: 'flujo de caja: cobros por método − pagos a proveedores, más un saldo de bancos que Felipe teclea cada semana' — es una posición actual, no una proyección hacia adelante
- Prioridad: baja
- Acción: Pregunta concreta a Felipe, no construir sin su respuesta: con 3 tiendas y pagos a proveedor conocidos con anticipación, ¿te serviría ver 'te vas a quedar corto de caja en 12 días' antes de que pase, o hoy con el saldo semanal a mano te alcanza? Si dice que sí, es una proyección simple (compromisos de pago conocidos − cobros esperados), no un forecast contable completo.

**✅ ya resuelto de otra forma — Benchmark contra otras tiendas del mismo rubro (fuera de CAYLA)**

- Quién: Shopify ofrecía 'Benchmarks' comparando una tienda contra miles de tiendas similares en su plataforma — pero Shopify mismo lo deprecó en mayo 2026 por falta de valor real.
- Por qué: No aplica: CAYLA es un solo dueño sin acceso a un pool de datos de terceros para comparar, y el propio proveedor que lo inventó lo dio de baja.
- Evidencia CAYLA: D-52 y `getComparativoAnual` (finanzas-nucleo.ts:185, citado en 11-KPIS.md línea 149) ya resuelven la comparación que sí importa para CAYLA: mismo mes contra el año anterior y sede contra sede — comparación interna, no contra desconocidos
- Prioridad: baja
- Acción: Ninguna acción — no copiar esta función. Si en 3 años CAYLA vende el sistema a otra marca (PL-01/PL-02), ahí sí valdría un benchmark entre marcas clientas del propio CAYLA, pero es una decisión de negocio futura, no de esta ronda.

**✅ ya resuelto de otra forma — Control de fatiga de notificaciones (quién, por qué canal, con qué frecuencia)**

- Quién: Los mejores POS dejan configurar destinatario, canal y frecuencia de cada alerta, con prioridad para que los ítems de alta rotación no se pierdan entre los de baja rotación.
- Por qué: Es exactamente el problema que resolvería para evitar que Felipe y el equipo ignoren las alertas por exceso de ruido.
- Evidencia CAYLA: cayla-decisiones-60-preguntas-2026-09.md Bloque 8: 'Alertas de producto nuevo/reposición: primero equipo y líder... tope de un aviso emergente por persona al día, el resto en campana' — ya es una decisión de diseño más disciplinada que el patrón genérico que describen los productos consultados
- Prioridad: baja
- Acción: Ninguna acción — CAYLA ya tomó esta decisión y está mejor pensada que el promedio de la industria (tope explícito + campana como cola). Mantener la regla al agregar la bandeja de atención del hallazgo #3, no reinventarla.


### Excelencia de ingeniería de software — qué separa un ERP "que funciona" de uno realmente excelente

Veredicto honesto: las 143 decisiones son correcciones locales de calidad alta, no una visión de sistema — y eso no es casualidad, es la forma del banco de 119 preguntas (capas: negocio, glosario, arquitectura, datos, permisos, pantallas, integraciones, equipo). Un banco de preguntas estructuralmente no puede generar la pregunta que nadie escribió. Patrón repetido en las 143: casi todas verifican y cierran huecos que YA EXISTÍAN en el código (PL-63, PL-82, PL-84/85, PL-92, PL-122 son arqueología de lo ya construido — "¿esto que creíamos roto, sigue roto?" — no diseño hacia adelante). Eso sí es disciplina real (Felipe corrigiéndose a sí mismo con evidencia en vivo, no aplaudiéndose), pero es mantenimiento, no arquitectura.

Dicho eso: el núcleo de CAYLA (productos/variantes/stock/movimientos como ledger append-only con trigger de inmutabilidad, invariantes como CHECK constraints en vez de validación en código, RLS como primera línea de defensa) ya sigue exactamente los patrones que Stripe usa para dinero y Shopify para inventario multi-tenant. Eso es ingeniería de excelencia real, no buena suerte. Y la decisión más difícil de todas —no perseguir el stack "de referencia" (NestJS/Prisma/tenant_id) solo porque la nota de arquitectura del propio CLAUDE.md lo describe como más "serio"— es "Choose Boring Technology" (Dan McKinley) aplicado con criterio explícito, algo que la mayoría de equipos de 6 personas no logra nombrar, solo intuir.

El hueco real, y es estructural: ninguna de las 143 preguntas —ni el resto de este benchmark— tocó los dos mecanismos que separan un sistema que sobrevive de uno del que solo se espera que sobreviva: (1) que las pruebas automáticas del núcleo (dinero, stock) realmente bloqueen un merge en vez de solo reportar, y (2) que exista alguna forma de enterarse, sin que una clienta se queje, cuando algo se rompe en producción. Sin esos dos, cada uno de los 61 candados que esta ronda encontró y cerró puede volver a romperse en silencio la semana que viene, y nadie —ni Felipe, ni la próxima sesión de IA— se enterará hasta auditarlo de nuevo a mano.

**✅ ya resuelto de otra forma — Choose Boring Technology (Dan McKinley) — aplicado con criterio explícito, no por default**

- Quién: Dan McKinley, ex-Etsy: "Choose Boring Technology" (mcfunley.com/choose-boring-technology) — cada equipo tiene ~3 "innovation tokens"; gástalos en el producto, no en reemplazar Postgres por lo nuevo de moda.
- Por qué: Un equipo de 6 personas sin ingeniero de infraestructura dedicado no puede pagarse una migración a NestJS/Prisma/tenant_id mientras construye el negocio real. Cada hora en el stack nuevo es una hora que no sale en vivo en TRU.
- Evidencia CAYLA: CLAUDE.md, nota de arquitectura 2026-07-16 (decisión con Felipe): "se decidió no migrar el núcleo ya construido y verificado para calzar con NestJS/Prisma/inglés/tenant_id"
- Prioridad: media
- Acción: Ninguna acción de código — esto ya está bien decidido. Sí vale la pena borrar o marcar como "histórico, nunca ejecutar" la sección del propio CLAUDE.md que describe el stack NestJS/Prisma como el "rol" — cada sesión de IA nueva la lee primero y hay riesgo real de que alguna la tome como objetivo en vez de como referencia muerta.

**✅ ya resuelto de otra forma — Ledger append-only con reversas, nunca ediciones (patrón Stripe)**

- Quién: Stripe: el ledger es append-only; un reembolso es un asiento reversor, nunca una edición del original; unicidad a nivel de base de datos hace que un duplicado sea un no-op (prachub.com/concepts/payment-systems-ledgers-idempotency-and-reconciliation).
- Por qué: Es literalmente el mismo diseño que protege el dinero en Stripe, aplicado al stock de CAYLA: si `movimientos` se pudiera editar, nadie podría auditar quién descontó qué prenda ni reconstruir un error de 3 meses atrás.
- Evidencia CAYLA: D-22 (docs/datos/DECISIONES-2026-09-12.md), trigger `movimientos_inmutables` en producción desde 2026-09-15, `20260915150000_movimientos_insert_solo_rpc.sql` revoca el INSERT directo
- Prioridad: baja
- Acción: Ninguna — el patrón ya está bien y verificado en producción. Documentarlo explícitamente en 01-INVARIANTES.md como "por qué" (no solo el candado) ayudaría a que el próximo integrante entienda que esto es deliberado, no un accidente del esquema.

**✅ ya resuelto de otra forma — Fitness functions de arquitectura en CI (Fowler, Building Evolutionary Architectures)**

- Quién: Martin Fowler / Neal Ford: una "fitness function" es un chequeo automático que protege un objetivo arquitectónico y corre en el pipeline de CI/CD (techdebt.guru/tech-debt-quadrant; el libro Building Evolutionary Architectures lo formaliza).
- Por qué: Sin esto, una regla de diseño o de frontera solo vive en la cabeza de quien la escribió — y con 96% de commits asistidos por IA, una regla no verificada por máquina se olvida en días, no en años.
- Evidencia CAYLA: PL-98/PL-99/PL-100 (prueba de CI que cuenta rojo, verifica contraste y exige `EncabezadoPagina`); PL-55 (chequeo de CI que falla si una migración toca `public.*` fuera de la lista permitida hacia Dynamic)
- Prioridad: baja
- Acción: Ninguna acción nueva — ya se decidió construir estos tres chequeos. Vale nombrar el patrón como tal en `docs/ARQUITECTURA.md` ("esto es una fitness function") para que la próxima regla de diseño se piense por defecto como "¿esto puede ser una prueba de CI, o solo va a vivir en un párrafo?".

**🔴 HUECO — El CI no bloquea las pruebas del núcleo — la protección de main es parcial donde más importa**

- Quién: Práctica estándar desde el CI original de Fowler/ThoughtWorks y todo pipeline moderno (GitHub Actions, CircleCI): un build roto bloquea el merge, no solo lo reporta — es la premisa base de "continuous integration", no una opción avanzada.
- Por qué: PL-10 decidió PR+CI obligatorios para proteger `main` — pero el job que prueba lo que de verdad importa (movimientos de stock, registrar venta) está marcado explícitamente "piloto, no bloquea" con `continue-on-error: true`. Un PR puede fusionarse con la prueba del núcleo en rojo y nadie lo nota. Es el mismo tipo de hueco que costó el candado de personas duplicadas (ADR-0002) o el de baja de acceso (PL-92): un bug puede vivir semanas antes de que alguien lo encuentre por accidente.
- Evidencia CAYLA: .github/workflows/ci.yml:116-120 ("Pruebas de RPC contra Postgres (piloto, no bloquea)", `continue-on-error: true`); ninguna de las 143 preguntas del plano tocó este job
- Prioridad: alta
- Acción: Pregunta concreta para Felipe: ¿ese job puede pasar a bloqueante YA para `fn_aplicar_movimiento.mjs` y `registrar_venta.mjs` (los dos que ya prueban dinero y stock), dejando el resto de `scripts/pruebas/` como piloto? Si la respuesta es "todavía no, hay pruebas inestables", esa inestabilidad es la tarea de esta semana — no la promesa "algún día" (principio 12 de CLAUDE.md, causa raíz, no parches).

**🔴 HUECO — No hay observabilidad de errores en producción — nadie se entera de un bug hasta que una clienta se queja**

- Quién: Google SRE (sre.google/sre-book): monitoreo de los "cuatro señales de oro" (latencia, tráfico, errores, saturación) y postmortems sin culpa son la base de operar cualquier sistema en producción, sea de 3 servidores o de 3 tiendas.
- Por qué: CAYLA ya decidió con criterio qué hacer cuando una API EXTERNA falla (Lucode, Dynamic, padrón — Vogels, principio 8, ya aplicado bien). Pero no hay ninguna herramienta ni proceso que avise cuando el propio código de CAYLA lanza una excepción en producción — una venta que falla a medias, una RPC que tira error 500. Hoy el único radar es que alguien en una tienda note que algo no funcionó y lo diga.
- Evidencia CAYLA: búsqueda en todo `docs/` del repo por sentry/datadog/apm/error tracking/observabilidad: cero resultados; ninguna de las 143 preguntas lo menciona
- Prioridad: alta
- Acción: Pregunta concreta para Felipe: ¿vale la pena encender algo barato (Sentry free tier, o incluso una tabla `errores_capturados` con notificación al líder, mismo patrón que PL-113/114 ya construye para SUNAT) antes de que TRU cargue más datos reales? No hace falta Datadog — hace falta ALGO que no sea "el mostrador lo nota".

**🔴 HUECO — Sin reconciliación automática del invariante central (stock = suma de movimientos)**

- Quién: Stripe reconcilia el ledger contra la fuente de verdad externa a diario (T+1), con auto-sanación para los casos simples y revisión manual para los que no cuadran (prachub.com/concepts/payment-systems-ledgers-idempotency-and-reconciliation) — el mismo principio que un contador aplica al cuadrar caja, llevado a código.
- Por qué: `stock` es un snapshot derivado de `movimientos` (regla 4 de CLAUDE.md) — pero nada corre periódicamente para confirmar que el snapshot y la suma de movimientos realmente coinciden. Si un bug en una RPC nueva descuadra el stock de una variante, el primer síntoma es una alerta de reorden falsa o una venta que rechaza stock que sí existe — semanas después del bug, no el día que se introdujo.
- Evidencia CAYLA: grep de "reconcilia" en todo `docs/` (10+ resultados) confirma que la palabra se usa siempre para "código vs. producción" (drift de documentación), nunca para "stock vs. movimientos"; ninguna de las 143 preguntas la exige
- Prioridad: media
- Acción: Construir una función `verificar_cuadre_stock()` que compare `stock.cantidad` contra `SUM(movimientos)` por variante/sububicación y la corra en un cron (mismo mecanismo que PL-113 ya usa para SUNAT) o manualmente cada cierre de mes (PL-73, `periodos_cerrados`) — es la prueba de humo que el propio principio 4 de CLAUDE.md exige, pero que hoy no existe.

**🔴 HUECO — 153 funciones SECURITY DEFINER en producción sin proceso sistemático de revisión de seguridad**

- Quién: Cualquier equipo de plataforma serio con RLS+RPC (el propio patrón de PL-59, vista `security_invoker` para agregados / función `security definer` para filas) trata cada función `security definer` nueva como superficie de ataque que necesita revisión dedicada — es la única forma de que el modelo de permisos no se erosione con el tiempo (principio de menor privilegio, OWASP).
- Por qué: CAYLA ya encontró 4 veces en esta misma ronda de 143 preguntas huecos de seguridad reales en producción (PL-84/85: venta editable desde el navegador; PL-92: baja de acceso; PL-75: costo visible a cualquiera) — todos hallados de forma reactiva, uno por uno, no por un proceso que los busque sistemáticamente. Con 153 funciones que se saltan RLS a propósito, el próximo hueco no se va a encontrar preguntando 143 preguntas más.
- Evidencia CAYLA: informes-lectores.md línea 114: "199 firmas de funciones (153 security definer)"; PL-84, PL-85, PL-92, PL-75, PL-122 — cada uno hallado "verificado en vivo" durante esta ronda, no por un chequeo permanente
- Prioridad: media
- Acción: Pregunta concreta para Felipe: ¿se puede convertir el patrón que ya usaron para auditar PL-84/92/122 (leer la función real en producción con `pg_get_functiondef` y verificar qué tabla toca sin RLS) en un checklist obligatorio de PL-87/94-95 — cada vez que alguien pega una función `security definer` nueva, responde por escrito "qué puede hacer esta función que RLS no dejaría hacer directamente"?

**🔴 HUECO — Bus factor arquitectónico nombrado pero no mitigado — Felipe como único desempate estructural**

- Quién: Práctica estándar de equipos de plataforma maduros: todo criterio de "factor de autobús 1" (una sola persona que si falta detiene decisiones) se resuelve con un ADR o runbook escrito de antemano, no se deja para cuando la persona ya no está.
- Por qué: El propio PL-12 lo nombra sin resolverlo: "SE ROMPE SI: Felipe es el único desempate de lo transversal y no está una semana". Es el mismo patrón de PL-10 (factor de autobús 1, ya resuelto para PR/CI) pero sin resolver para decisiones de arquitectura — y CAYLA ya tiene el ejemplo vivo: PL-77 (candado contra sububicaciones duplicadas) quedó sin construir porque Felipe "confía en la costumbre", exactamente el patrón que el propio 01-INVARIANTES.md documentó que ya falló una vez (ADR-0002).
- Evidencia CAYLA: PL-12 ("SE ROMPE SI"), PL-77 ("riesgo bajo y anotado... si algún día alguien crea una sede por SQL Editor")
- Prioridad: media
- Acción: Pregunta concreta para Felipe: para las 2-3 decisiones transversales más caras de revertir (esquema, permisos de dinero, candados que se decidió NO construir como PL-77), ¿quién es el segundo desempate si tú no estás una semana — Dany, o se congela la decisión hasta que vuelvas?

**✅ ya resuelto de otra forma — Restore real de backup: planeado, todavía no ejecutado**

- Quién: Google SRE y cualquier disciplina de backups seria: un backup sin restore probado no es un backup, es una esperanza — la prueba de restauración es la única forma de saber si el RPO/RTO declarado es real.
- Por qué: PL-65 y PL-80 ya decidieron bien (1 día de RPO, restore de prueba antes del primer mes de TRU en vivo) — esto no es un hueco de criterio, es un hueco de ejecución con una fecha vaga ("antes de", sin día fijo) sobre el único proyecto Supabase que sirve a la vez a retail y a Dynamic (un restore afecta a los dos negocios).
- Evidencia CAYLA: PL-65 ("se prueba antes del primer mes de TRU en vivo"), PL-80 ("una restauración de prueba real al menos una vez")
- Prioridad: alta
- Acción: Pregunta concreta para Felipe: fijar la fecha exacta del ensayo de restore (mismo patrón que PL-89 ya usa para acotar líderes por sede: "fecha exacta, no cuando sienta confianza") — dado que afecta a Dynamic también, vale coordinarla con quien sea dueño de esa base.

**✅ ya resuelto de otra forma — Anti-corruption layer hacia Dynamic (patrón DDD) construido con criterio, antes de que doliera**

- Quién: Domain-Driven Design (Eric Evans) / "strangler fig pattern" (Fowler): cuando dos sistemas conviven y uno depende del otro, se aísla la dependencia detrás de un punto único, para que separarlos después cueste días y no meses de arqueología de código.
- Por qué: PL-54/55/68/69 son exactamente esto: un punto único (`lib/dynamic-contrato.ts`) + CI que falla si algo nuevo se conecta a Dynamic por fuera, dejando explícitamente las 53 FKs ya existentes como "costo ya pagado, no crece más" en vez de intentar migrarlas todas ahora. Es la decisión correcta con la evidencia correcta (no sobre-construir para una venta a otra marca que no existe todavía, PL-01).
- Evidencia CAYLA: PL-54, PL-55, PL-68, PL-69
- Prioridad: baja
- Acción: Ninguna acción nueva — ya está bien decidido. Sí vale que Gorrión (dueño del contrato, PL-66) documente el criterio explícito ("nuevo = pasa por el punto único; viejo = deuda ya pagada, no se toca") para que la próxima persona no intente "limpiar" las 53 FKs viejas sin necesidad.

