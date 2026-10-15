# ADR-0400 · Producción: la orden con sus fases, quién hace cada una, lo que sale y vuelve de un servicio, y su tela

- **Fecha:** 2026-10-14 · **Estado:** **aceptado por Felipe** (decisiones del 13 y 14 de octubre de 2026, en tres tandas de preguntas con
  opciones Ganas/Pagas; la lista de actividades aprobada tal cual el 2026-10-14). **En construcción por actividades**, una por commit.
  Rama `claude/production-module-redesign-136cca`.
- **Números reservados (ADR-0381):** ADR-0400 · migraciones `20261014154000` (esquema y apertura), `20261014155000` (avance, Salida y
  Vuelta), `20261014160000` (cierre, costos del Taller y lo comprometido).
- **Pedido de Felipe (2026-10-13, con la captura de `/produccion/ordenes` vacía):** «Necesito rediseñar todo el módulo de producción. Que sea
  bastante entendible. Que se pueda escoger los colores, los tipos de tela, las tallas. Cuando se crea una orden, indicar si va a
  tercerizarse tal vez una parte de esa producción, si vamos a maquilar aparte: el corte, o las costuras, las diferentes fases de producción
  textil. Investiga a profundidad lo que hacen los sistemas de clase mundial. La estética y las funcionalidades no me convencen para nada.»
  Y el 2026-10-14: «Despliega agentes para hacerlo formidable y bien entendible» · «aplica las mejoras convenientes; si tienes dudas hazme
  preguntas con opción recomendada siempre».
- **Investigación (14 agentes, con fuentes):** `docs/investigacion/2026-10-13-produccion-rediseno/README.md`. **Línea base Formidable del
  módulo entero (antes):** `docs/formidable/produccion-modulo.md` (leyes 5,5 · oficio 5,6; dos pruebas ciegas; escéptico).
- **Complementa:** ADR-0133 (Producción, módulo propio; decisión 4: el costo sale del consumo real), ADR-0051 (producción sobre V2),
  ADR-0090 (insumos por lote, saldo derivado), ADR-0156 (cotizaciones de maquila como vara de mercado), ADR-0161/0306 (módulos y roles),
  ADR-0361 (modelo nuevo desde la orden), ADR-0362 (órdenes de insumos), ADR-0284 (guía de foco), ADR-0333 (la prenda sin foto),
  ADR-0358 (una función, una pieza), ADR-0389 (guías interactivas).
- **Absorbe:** las actividades A4 a A7 de ADR-0396 (decisión de Felipe, 2026-10-14; ver su «Actualización 2026-10-14»). A1 a A3 de ese ADR
  (el modelo primero, la tabla única, la hoja ancha con ficha viva) quedan intactas y son la base de la hoja nueva.

## El problema (medido, no supuesto)

- **El Taller nunca abrió una orden real:** `producciones`, `insumos`, `insumo_lotes`, `comprobantes_produccion` y `cotizaciones_maquila`
  tienen **0 filas** en producción (verificado el 2026-10-13). Rediseñar el esquema no migra datos.
- **Hoy una etapa es un bit.** `EstadoEtapa = pendiente | hecho | tercerizado` (`apps/web/lib/produccion-reglas.ts:28`) sobre tres etapas
  fijas (Corte · Confección · Acabados), sin cantidad, sin fecha, sin a quién ni a cuánto. «Enviar a maquila» solo cambia un color
  (`OrdenPanel.tsx:255-261`). La RPC `set_etapa_produccion` acepta `acabado = hecho` con `corte = pendiente` y «Corte hecho» no mira si se
  descontó tela (escéptico, hallazgos 4 y 12).
- **La orden no sabe qué tela lleva:** tres montos tecleados (`Tela / Avíos / Maquila`) al abrir y otros tres al cerrar; el consumo se
  registra después, en un segundo formulario del cajón; «¿Alcanza la tela?» solo responde con historial de órdenes cerradas, que no existe.
- **La maquila está suelta:** `proveedores_produccion.rubro = 'maquila'` existe pero ninguna pantalla lo usa; `cotizaciones_maquila` no
  tiene entrada de menú ni lector; la factura del servicio entra como «Otro concepto (flete, maquila…)» tecleado.
- **Prueba ciega (Observado):** la colaboradora ciega registró el pedido en 23 clics pero **no encontró dónde decir que la costura va
  afuera ni a quién**; «Enviar a maquila» le cayó sobre el corte sin preguntar nada; terminó escribiéndolo en la nota. No entendió
  «maquila», «corrida», «avíos», «insumos», «curva sugerida», «al filo». La segunda ciega resolvió sus tres tareas, pero el Resumen siguió
  diciendo «faltan 32,3 m» después de pedir 120 m al proveedor (no cuenta las órdenes de insumos).
- **Oficio:** la prenda no aparece en Órdenes (tarjeta: texto; cajón: punto de 10 px); dos cabeceras distintas en un mismo menú; el nombre
  de una migración en pantalla (Eficiencia); un `title` como único lugar del nombre de la etapa.

## Las decisiones (quién, cuándo, qué)

1. **La orden de producción (OP) es la única entidad; las áreas del Taller son fases por las que pasa, no módulos** (análisis traído por
   Felipe el 2026-10-14; coincide con la investigación: D365, Business Central, Infor, Katana, los ERP de moda). **Granularidad A:** el
   avance se anota por fase, no por bulto ni por operaria; la base queda lista para pasar a C (bulto y operación solo en costura) sin
   rehacer: cada avance es una fila con fase, talla y color, cantidad y quién, y `bulto`, `operacion` y `operaria_persona_id` son columnas
   que nacen vacías. *(Felipe: «si estás de acuerdo hacemos tipo A». De acuerdo, con evidencia: con 10 operarias y un estilo el papel
   alcanza; el dato por bulto sale sucio si nadie lo registra a diario; B solo vale con destajo por operación, que CAYLA no paga.)*
2. **Fases de un lote: Corte · Costura · Acabado** (la espina, siempre) **más Bordado, Estampado y Lavandería opcionales**, que la orden
   enciende. Trazo, tendido y habilitado viven dentro de Corte (en Lima son operaciones de la sala de corte, el mismo día y la misma persona:
   SENATI, PUCP, planta piloto UNMSM); Corte cierra con la tela usada y las piezas por talla. Bordado y Estampado se hacen **sobre pieza**
   (entre Corte y Costura) o **sobre prenda** (entre Costura y Acabado), según el modelo; Lavandería siempre después de Costura. **Desarrollo
   (patrón, muestra) no es una fase del lote:** es la orden tipo muestra que ya existe (`es_muestra`). **Ingreso al stock no es una fase:**
   es `cerrar_produccion`, que ya escribe en `movimientos`; el traslado a tiendas sigue en Inventario. *(Felipe, 2026-10-14, eligió esta
   lista frente a sus 7 estados y frente a las 6 de la ficha limeña.)*
3. **Tercerizar = una fase entera tiene UN quién:** el Taller o un servicio de afuera (`proveedores_produccion`). No se reparte una fase
   entre dos talleres (para eso, dos órdenes). *(Felipe: «una fase entera».)* **Se decide al abrir la orden y se puede cambiar hasta que
   la fase empiece** (primer avance o primera Salida). *(Felipe: «al abrir, cambiable hasta que empiece».)* El corte también puede salir.
4. **Lo que sale a un servicio se anota como «Salida» y lo que regresa como «Vuelta»,** por talla y color: la Salida dice cuántas piezas o
   prendas se fueron (y el número de guía como texto); la Vuelta dice cuántas volvieron buenas, cuántas segundas y cuántas faltan, con motivo.
   Afuera = salidas − vueltas. La tela o los avíos que viajan con la Salida se registran como `consumo` de la orden (el libro de insumos no
   gana ningún tipo nuevo). *(Felipe eligió «vale de salida y recepción» y pidió otro nombre: «¿qué diablos son los vales?».)*
5. **La tarifa de un servicio es por prenda, con una cantidad mínima por servicio y un fijo opcional por orden** (ponchado del bordado,
   matriz del estampado). Lo que un servicio cotice por kilo o por metro se escribe como su equivalente por prenda. **Lo que se le debe al
   servicio es el devengado: buenas recibidas × tarifa + fijo; nadie lo teclea.** Si una Salida es menor que la cantidad mínima, la pantalla
   avisa, no bloquea. *(Felipe: «cobran por unidades a partir de una cantidad, 150 o 240; no hacen servicio de 1 o 5».)* La tarifa vive en
   el proveedor (sugiere) y la fase la copia y la congela al abrir.
6. **La tela se compra por metros, no por rollos.** La orden elige el tejido del modelo → la tela de ese color en Insumos → metros a pedir =
   consumo por prenda × prendas (+ merma de la tela). **El consumo por prenda se escribe una vez en el modelo (lo que calcula Audaces, por
   talla si se tiene) y lo real lo corrige al cerrar cada orden.** *(Felipe: «compramos por metros, calculamos primero cuánto necesitaremos»;
   «se escribe en el modelo lo que calcula Audaces y lo real lo corrige». Reabre ADR-0133 d.5 / D-D «lo medido no miente» con una razón
   nueva: 232 modelos y 0 órdenes cerradas; lo medido sigue mandando sobre lo declarado cuando existe.)* **No se construye la conversión
   kilo → metro** (R-25) porque CAYLA no compra por kilo.
7. **El avance se anota «Terminé N de M», por talla y color, cuantas veces haga falta;** el valor por defecto es lo que falta (un clic =
   terminé todas) y hay Deshacer. Solo las buenas avanzan a la fase siguiente. Las segundas no entran al stock. Cortar de más se acepta
   hasta un 10 % del plan (constante en código).
8. **La cabecera de todo el módulo es `EncabezadoPagina`** (la de Ventas e Inventario; CLAUDE.md pedía preguntarlo). *(Felipe, 2026-10-14.)*
9. **Alcance de la primera entrega:** fases con quién + Salida y Vuelta + tela de la orden, con las pantallas rehechas; la ficha de consumo
   por talla fina y las muestras con rondas vienen después. *(Felipe: «opción 1».)*
10. **La lista de Órdenes (lista con chip de fase o columnas por fase) y la orden (cajón o página) se eligen mirando una lámina** en
    claro y oscuro, a 1024 y 1440 (`docs/maquetas/produccion-rediseno-2026-10/`), no por texto (ADR-0358). **Elegido por Felipe el 2026-10-14, mirando las capturas a 1440: «A · Lista» para Órdenes (una fila por lote ordenada por entrega, la fase y quién la tiene como dato de la fila, «Hoy en el Taller» con cuatro cifras que filtran) y «D · Página propia» para la orden (`/produccion/ordenes/OP-000002` con `<Volver>`, fases en fila cosidas por un hilo, tela y costo lado a lado, línea de tiempo al costado).** Se descartaron «B · Columnas por fase» (la urgencia se lee tarjeta por tarjeta y a 1024 se desplaza de costado) y «C · Cajón» (menos ancho para la tabla de tallas y el Deshacer de los avisos falla sobre un cajón modal).

### Supuestos del arquitecto (Felipe puede cambiarlos; cada uno cabe en una línea de migración)

- **Faltantes:** se pagan las buenas recibidas; faltantes y segundas quedan con motivo en la Vuelta; el descuento al proveedor es decisión
  del líder, no automática (en Lima no hay norma: lo fija la relación).
- **IGV y detracción:** la tarifa se escribe sin IGV; el proveedor dice si su papel lleva IGV. La maquila con tela de CAYLA es «fabricación
  por encargo» (Anexo 3 del SPOT, 10 % si la operación pasa S/ 700): el ERP **solo avisa**; el depósito lo hace el contador. Sin adelantos.
- **El papel del servicio sigue como gasto en Finanzas** (decisión d.63 de ADR-0362, 2026-10-13, no se reabre). El costo de servicio de la
  orden es el devengado. El enlace gasto ↔ fase («falta el papel») queda para la segunda entrega.
- **Quién opera:** quien ve el módulo `produccion` y está parado en el Taller (ADR-0161/0306), para abrir, avanzar, mandar, recibir y
  cerrar. Los costos del Taller los ve quien ve `produccion` en ese Taller (A4b de ADR-0396, migración `160000`); la lista de precios y los
  datos bancarios de un proveedor siguen solo del líder.
- **Color de la tela:** la tela tiene color (el mismo vocabulario `colores` de la prenda); la orden propone la tela del color de la prenda y
  deja cambiar. **Tela comprometida:** plan − usado de cada orden abierta se descuenta de lo disponible para la siguiente («alcanza» no se
  dice dos veces contra los mismos metros).
- **La fecha de entrega promete que las prendas salen del Taller ese día** (lo que el Taller controla); cuándo llegan a la tienda lo sabe
  Traslados. `abrir` rechaza una fecha pasada.
- **Un color o una talla que el modelo no tiene no se agrega desde la orden** (ADR-0051/0361, como hoy).
- **Las fases son una lista fija en código** (sin pantalla en Configuración) hasta que haga falta otra.

## Modelo de datos (migración `20261014154000`; todo en `retail.`, RLS encendido **sin políticas**: se lee y escribe solo por funciones `security definer`)

| Tabla | Columnas | Lo que la base hace cumplir |
|---|---|---|
| `produccion_fases` | `id`, `produccion_id → producciones`, `clave` (`corte` · `costura` · `acabado` · `bordado` · `estampado` · `lavanderia`), `secuencia` smallint, `posicion` (`pieza` · `prenda`, solo bordado y estampado), `quien` (`taller` · `servicio`), `proveedor_id → proveedores_produccion`, `tarifa_prenda`, `fijo_orden`, `cantidad_minima`, `fecha_prometida`, `nota`, `creado_por`, `created_at` | una fila por fase y por orden (`unique (produccion_id, clave)`, `unique (produccion_id, secuencia)`); `servicio ⇒ proveedor_id y tarifa_prenda no nulos`; `taller ⇒ proveedor_id, tarifa_prenda y fecha_prometida nulos`; `posicion` no nula ⇔ bordado o estampado; `corte`, `costura` y `acabado` siempre presentes, `corte` primera y `acabado` última. **El estado no se guarda: se deriva** (`fn_fases_de_orden`) |
| `produccion_avances` (**append-only**, disparador `fn_inmutable`) | `id`, `fase_id`, `variante_id → variantes`, `cantidad` int ≠ 0 (negativa = deshacer), `origen` (`taller` · `vuelta` · `deshacer`), `vuelta_id`, `deshace_id`, `bulto`, `operacion`, `operaria_persona_id` (vacías en A), `nota`, `hecho_por`, `created_at` | Σ por (fase, variante) entre 0 y lo disponible: para la primera fase, `cantidad_plan × 1,10`; para las demás, Σ buenas de la fase anterior. Lo comprueba la RPC bajo `pg_advisory_xact_lock(produccion_id)` (ADR-0190), y como nadie más puede insertar, la regla es de la base |
| `produccion_salidas` + `produccion_salida_lineas` | salida: `id`, `fase_id`, `guia` texto, `nota`, `hecho_por`, `created_at`; línea: `salida_id`, `variante_id`, `cantidad` > 0 | solo en una fase `servicio`; Σ salidas ≤ disponible de la fase − ya salido, por variante |
| `produccion_vueltas` + `produccion_vuelta_lineas` | vuelta: `id`, `fase_id`, `guia`, `nota`, `hecho_por`, `created_at`; línea: `vuelta_id`, `variante_id`, `buenas` ≥ 0, `segundas` ≥ 0, `faltantes` ≥ 0, `motivo` (obligatorio si segundas + faltantes > 0) | Σ (buenas + segundas + faltantes) ≤ Σ salidas, por variante; cada Vuelta inserta sus `buenas` como avances `origen = vuelta` |
| `produccion_insumos` | `id`, `produccion_id`, `insumo_id → insumos`, `color_codigo → colores(codigo)` (nulo = toda la orden), `consumo_por_prenda` > 0, `cantidad_plan` (consumo × prendas del color × (1 + `insumos.merma_pct`)), `nota`, `created_at` | `unique (produccion_id, insumo_id, color_codigo)`; comprometido = plan − consumido (vista `v_insumo_comprometido`) |
| `producto_consumos` | `producto_id → productos` (único), `tela_por_prenda` metros > 0, `por_talla` jsonb (`{"S": 1.15, "M": 1.2}`, opcional), `fuente` (`declarado` · `medido`), `nota`, `actualizado_por`, `updated_at` | lo declarado se escribe desde Editar producto (panel del Taller) o desde la orden; lo medido lo escribe `cerrar_produccion` (consumo real ÷ buenas) y gana cuando existe |
| `proveedor_tarifas` | `id`, `proveedor_id`, `fase_clave` (solo fases que pueden salir), `tarifa_prenda` > 0, `cantidad_minima`, `fijo_orden` ≥ 0, `vigente_desde`, `nota`, `created_at` | `unique (proveedor_id, fase_clave, vigente_desde)`; es la lista de precios que **sugiere**; la fase copia |
| `insumos` (columnas nuevas) | `tejido_id → tejidos`, `color_codigo → colores(codigo)` | las dos opcionales; una tela de la orden se filtra por tejido y color |
| `producciones` (columnas nuevas) | `numero` int de `producciones_numero_seq` (prefijo «OP-» en pantalla, como OI) | `etapas` jsonb **deja de escribirse** (se conserva por las lecturas viejas; `fn_fases_de_orden` es la fuente); `costo_maquila` y `costo_tela/avios` dejan de teclearse |

**Invariante que une la Vuelta y el cierre (principio 2):** `cerrar_produccion` no acepta, por variante, más `cantidad_buenas` que Σ avances de
la última fase (migración `160000`). Las prendas en corte, costura o afuera **nunca entran a `stock`**: lo que hay afuera se deriva; el stock de
prendas sigue naciendo **solo** en `cerrar_produccion` (entrada, motivo `produccion`), como manda el principio 4.

## Funciones (`security definer`, firmadas con `fn_actor_persona_id(true)`; exigen `fn_ve_modulo('produccion')` y `fn_puede_operar_ubicacion(Taller)`)

- `154000` · **`abrir_orden_produccion(p jsonb)`**: envuelve a `abrir_produccion` o a `abrir_produccion_con_modelo_nuevo` (sus firmas y su carga
  útil **no cambian**, ADR-0396 «Lo que NO cambia») y en la misma transacción inserta las fases (`p.fases[]`: clave, quién, proveedor, tarifa,
  mínimo, fijo, fecha, posición) y la tela (`p.insumos[]`: insumo, color, consumo por prenda). Valida: fecha no pasada, las tres fases de la
  espina, un proveedor activo con `rubro` de servicio cuando `quien = servicio`, el insumo no archivado. Devuelve el `id` y el `numero`.
  **`fn_fases_de_orden(p_produccion_id)`** → jsonb por fase: plan, hechas, afuera, segundas, faltantes, estado (`pendiente` · `en_curso` ·
  `hecha`), empezada, días en la fase, quién, tarifa, devengado. **`cambiar_quien_fase(p_fase_id, …)`** solo si la fase no empezó.
- `155000` · **`registrar_avance(p_fase_id, p_lineas jsonb, p_nota)`** (fase `taller`; candado del disponible) y **`deshacer_avance(p_avance_id)`**
  (fila negativa, misma cantidad, `origen = deshacer`; solo el último avance de esa fase). **`registrar_salida(p_fase_id, p_lineas, p_guia,
  p_nota)`** y **`registrar_vuelta(p_fase_id, p_lineas, p_guia, p_nota)`** (fase `servicio`; candados de arriba; la Vuelta inserta avances).
  **`fn_costo_servicios_orden(p_produccion_id)`** → devengado por fase y total.
- `160000` · **`cerrar_produccion`** (misma firma, ADR-0090): si `p_costo_maquila` es nulo toma el devengado; si `p_costo_tela/avios` son nulos,
  el consumo del libro (como hoy); **rechaza** más buenas que las terminadas en la última fase; escribe `producto_consumos.medido`. **Toca stock
  y dinero: se construye con el OK explícito de Felipe en la actividad 6.** `fn_costos_producciones` y `fn_costos_insumos_taller` pasan a
  «líder, o quien ve `produccion` y opera ese Taller» (A4b de ADR-0396). `fn_tela_comprometida` para «¿alcanza?» (cuenta lo comprometido por
  otras órdenes abiertas y lo pedido en órdenes de insumos generadas: hallazgo 3 del escéptico).
- `anular_produccion` **no anula con prendas afuera** (afuera > 0): primero la Vuelta (o faltantes con motivo). `revertir_produccion` no cambia.
- Las RPC de lectura nuevas (`fn_fases_de_orden`, `fn_costo_servicios_orden`, `fn_tela_comprometida`) van a la lista de lectura de
  `lib/espera-reglas.ts` (prefijo `fn_`, ya incluido).

## Pantallas (menú `produccion`; nada de adentro es un módulo nuevo, ADR-0306)

1. **Órdenes** (lista, elegida por Felipe el 2026-10-14): cabecera única; la prenda (`MosaicoPrenda`/`FotoDePrenda` ≥ 48 px); `OP-000012`; modelo;
   cuántas; `<Chip>` de fase **con quién** («En costura · Confecciones del Norte · 48 afuera»); días en la fase; entrega; rojo **solo** por
   fecha pasada, tela que no llega o N días sin moverse, con «¿Por qué?» a un toque; filtros `DesplegablePildora`; Muestras y Terminadas.
   El vacío de primer uso dice «Todavía no se abrió ninguna orden», no «todo lo abierto ya se cerró».
2. **La orden** (página propia `/produccion/ordenes/OP-000012`, elegida por Felipe el 2026-10-14): cabecera con la prenda grande, número, modelo, cuántas, entrega; la **ruta de fases como
   piezas** (hecha ✓ · actual encendida · pendiente) con quién, «120 de 200», fecha prometida; **una acción por fase**: «Terminé N» (Taller)
   o «Salida» / «Vuelta» (servicio), con `MatrizCantidades` en modo cantidades (la fila = color, la columna = talla, el fantasma = lo que
   falta); «Cambiar quién» hasta que empiece; «Tela»: plan, usada, alcanza / faltan; «Costo»: estimado vs real en dos columnas (tela, avíos,
   servicios); línea de tiempo (quién, cuándo, cuánto); «Pasar al stock» solo cuando la última fase terminó; «Producir este modelo» en una
   muestra terminada (A6 de ADR-0396). Lo de hoy que se va: el medidor con la leyenda de umbrales, los tres montos, «Descontar al cortar»
   como formulario aparte (la tela usada se pregunta al cerrar Corte).
3. **Nueva orden** (A1–A3 de ADR-0396 intactas): dos bloques nuevos, **«Fases y quién las hace»** (una fila por fase; Taller / Servicio;
   proveedor; tarifa sugerida desde `proveedor_tarifas`; aviso de cantidad mínima; fecha prometida; Bordado, Estampado y Lavandería se
   encienden) y **«Tela»** (tejido del modelo → tela del color → consumo por prenda desde `producto_consumos` → metros a pedir y «alcanza /
   faltan N m»). Los tres `<CampoMonto>` desaparecen. Palabras y plazos de A5 («Precio de venta», «lote», «1 semana · 2 semanas · 1 mes»).
4. **Insumos:** ficha de la tela con tejido y color; «Capital en insumos» deja de ser cifra de portada (se queda para el líder bajo un toque).
5. **Resumen:** «¿Alcanza la tela?» cuenta lo comprometido y lo pedido; la tarjeta «Faltan N m» lleva a **pedir** (`/ordenes-insumos/nueva`),
   no a registrar una factura; un bloque «Hoy en el Taller» (N por fase, N afuera y con quién). Quien no es líder ve una frase, no un redirect.
6. **Abastecimiento:** Proveedores gana la pestaña **«Servicios y tarifas»** (la lista de precios por fase; absorbe Cotizaciones de maquila,
   que deja de ser pantalla huérfana), y la nota que promete un saldo que no calcula se va; Facturas, Recibir y Por pagar con la cabecera única.
7. **Eficiencia:** sin nombres de migraciones ni de sistemas en pantalla; «Conversión» y la fórmula bajo «¿Por qué?».
8. **Vocabulario vigilado por prueba** (`lib/produccion-vocabulario.test.ts`): orden / lote (nunca «corrida»), fase, en el Taller / afuera con
   [proveedor] (nunca «maquila externa»), Salida / Vuelta, tela usada / devuelta (nunca «insumos descontados»), pasó al stock (nunca «cerrar
   al inventario»), falladas / segundas (nunca «costo atípico» a la vista), «Terminé N».

## Lo que NO cambia (contratos)

- `movimientos` única fuente de verdad; `stock` derivado; nada nuevo inserta en `movimientos`. El libro de insumos y sus CHECK (`consumo` y
  `devolucion` exigen `produccion_id`). `fn_recalcular_costo_variante`, promedio ponderado (ADR-0067), piso de costo y margen contra el precio
  más bajo (ADR-0370), semáforo 0,6 / 0,4 y sus palabras, la coma explicada y no aceptada, precio obligatorio en lote y opcional en muestra.
- Firmas vivas: `abrir_produccion`, `abrir_produccion_con_modelo_nuevo`, `cerrar_produccion` (una sola sobrecarga, ADR-0090),
  `registrar_consumo_insumo`, `devolver_insumo_de_produccion`, `recibir_insumo`, `revertir_produccion`. El token de idempotencia y `enVuelo`
  de la hoja de Nueva orden (/chaos DC-01); `useSalidaSinGuardar`; el responsable firmado (ADR-0161/0162).
- ADR-0361 entero (modelo nuevo desde la orden); ADR-0377/0384 (familias fuera de los motores; precio cero solo donde la categoría lo admite).
- D-H (dos directorios y dos libros, Producción y Compras), D-I (deuda total de CAYLA e IGV dentro de Por pagar), D-31/D-82 (cotizaciones como
  vara, no tarifa), A2 (Producción solo parado en un Taller), A3 (el Taller no emite comprobantes: la guía de remisión va como texto).

## Qué se rompe si

- Se escribe un avance, una Salida o una Vuelta fuera de su RPC: las sumas dejan de cuadrar con lo disponible. Por eso las tablas no tienen
  políticas y solo las funciones escriben.
- El cierre acepta más buenas que las terminadas en la última fase: entra al stock lo que no se cosió. Por eso el candado vive en
  `cerrar_produccion` (migración `160000`).
- La fase cambia de quién después de empezar: el devengado y la Salida apuntan a proveedores distintos. Por eso `cambiar_quien_fase` exige
  `empezada = false`.
- La tela de la orden se lee del tejido descriptivo y no del insumo con metros: «¿alcanza?» vuelve a callar. Por eso `produccion_insumos`
  referencia `insumos`, y `insumos` gana `tejido_id` y `color_codigo`.

## Alternativas descartadas

- **Los 7 estados del análisis externo tal cual** (Desarrollo · Trazo y tendido · Corte · Habilitado · Confección · Acabados y calidad ·
  Ingreso): obligan a marcar cuatro pasos en una sola jornada de corte y no tienen fase propia para bordado, estampado ni lavandería, que son
  justo las que salen a servicio. *(Felipe eligió la espina de 3 más 3 opcionales.)*
- **Tercerizar una parte de las prendas de una fase** (dos talleres en una fase): cada fase con dos quién y el avance por envío; con 3 tiendas
  casi no ocurre. *(Felipe: «una fase entera».)*
- **Tarifa con unidad por fase** (prenda · pieza · millar de puntadas · metro · kilo · carga): exacta pero un combo más por fase y una fórmula
  por unidad. *(Felipe: por unidad de producto, con mínimo.)*
- **Solo lo medido, como ADR-0133 d.5:** con 232 modelos y 0 órdenes cerradas tarda años en existir. *(Felipe: declarado en el modelo,
  corregido por lo real.)*
- **Granularidad B (bulto y operación):** el 95 % de las empresas peruanas trabaja por bultos, pero el conteo por bulto sale sucio si nadie
  lo captura a diario y solo paga con destajo por operación. *(A, con la base lista para C.)*
- **Conversión kilo → metro** (R-25): CAYLA compra por metros. No se construye.
- **Catálogo de fases en Configuración:** una tabla y una pantalla para una lista que cambia una vez al año. Lista fija en código.
- **La guía de remisión electrónica por Lucode** (motivo 17 ida / 07 vuelta): el Taller no emite comprobantes (A3). Texto.

## Plan (`/construir`; la lista aprobada por Felipe el 2026-10-14; una actividad por commit; su OK en la 6)

0. **Este ADR + la lámina** para elegir mirando (lista vs columnas; cajón vs página). Verificación: la lámina en el navegador, claro y
   oscuro, 1024 y 1440, medida con `medir-oficio.js`.
1. **Abrir una orden con fases, quién y tela, por la base:** migración `154000`, `abrir_orden_produccion`, `fn_fases_de_orden`,
   `cambiar_quien_fase`; prueba SQL en `scripts/pruebas/produccion_fases.mjs` (en su tanda de `scripts/ci/pruebas-postgres.mjs`).
2. **Nueva orden rehecha** (bloques «Fases y quién» y «Tela»; adiós a los tres montos); paridad de la carga útil de A1–A3; `/focus`, `/sugerir`.
3. **La orden** (página propia): fases como piezas, «Terminé N», Deshacer, «Cambiar quién», tela, costo, línea de tiempo, «Producir este
   modelo»; migración `155000` (avance); prueba SQL.
4. **Salida y Vuelta:** RPC (misma migración `155000`), hojas con `MatrizCantidades`, afuera y devengado en la orden, aviso de mínimo; prueba SQL.
5. **Lista de Órdenes rehecha** con la cabecera única, la prenda, los chips con quién, los tres rojos con «¿Por qué?».
6. **Cierre al stock** (migración `160000`: candado de buenas, devengado, costos del Taller para quien ve `produccion`, `producto_consumos.medido`).
   **OK de Felipe en esta actividad.**
7. **Tela y consumo:** consumo en el modelo (Editar producto ▸ panel del Taller) y desde la orden; «¿alcanza?» con lo comprometido y lo
   pedido; la tarjeta «Faltan N m» lleva a pedir.
8. **Resto del módulo:** cabecera única en Resumen, Insumos, Proveedores («Servicios y tarifas»), Facturas, Recibir, Por pagar, Eficiencia;
   vocabulario con prueba; vacíos que no mienten; «Hoy en el Taller».
9. **Cierre de obra:** `/focus`, `/guia` (huellas aceptadas tras revisar), `/sugerir`, `/chaos` (todo lo que guarda), `/formidable` (remedir,
   ciego otra vez), `tema:auditar`, `/unificar`, bitácora y backlog, retiro de la semilla «ZZ Prueba» de la base local, `/abrir-pr`.

**Fuera de la lista (tarea aparte, `spawn_task`):** el «Deshacer» de los avisos cierra un cajón abierto y resucita avisos viejos con reloj
nuevo (`components/ui/Avisos.tsx:78, 225-229`; escéptico, hallazgo 1 y «lo que nadie vio» 1-2). Es de una pieza del sistema, no de Producción.

## Cómo se verifica (lo que esta obra tiene que demostrar antes de darse por terminada)

- **Punta a punta en local, con la semilla:** abrir una orden de 50 blusas con costura afuera y lino de la orden → cortar 50 → Salida de 50 →
  Vuelta de 48 buenas y 2 faltantes con motivo → acabado 48 → pasar al stock 48 → `stock` del Taller +48 y `variantes.costo` con tela usada +
  48 × tarifa; `anular` rechazada con prendas afuera; `cerrar` rechazada con 49 buenas.
- **Prueba ciega repetida** con la misma tarea del 2026-10-14 (registrar un pedido con la costura afuera y a quién): tiene que encontrar
  dónde decirlo sin la nota, en no más de 15 clics; y la segunda tarea con el Resumen contando lo pedido.
- **Formidable:** remedir las 11 pantallas; la ley 5 (la prenda y la tela a la vista) y la ley 6 («¿Por qué?» a un toque) por encima de 7;
  el módulo por encima de 7,5 (línea base 5,5).
- **Concurrencia:** dos cuentas marcan «Terminé» sobre la misma fase a la vez (candado por orden; la segunda ve el saldo real); dos Salidas
  simultáneas no superan lo disponible. **Caída externa:** si la base no responde al abrir, el token de idempotencia evita la orden doble.

## Actualización 2026-10-15 · actividades 1 a 4 hechas (lo que cambió respecto del plan)

Hechas con commit: **1** (`baef5cfa6`, esquema y apertura), **2** (`b65155eef`, Nueva orden con fases y tela), **3** (`6671cc26e`, la página de la orden con «Terminé N», Deshacer y «Cambiar quién») y **4** (Salida y Vuelta en pantalla). Lo que se aparta del texto de arriba, y por qué:

- **`grant select (numero)` en `producciones`.** El candado de columnas del dinero (`20260921151000`) deja fuera para `authenticated` toda columna nueva; sin el grant la página no encontraba la orden por su número (la API respondía «permission denied»). Va en 154000, donde nace la columna, con su prueba (`N2`).
- **Deshacer un avance es por talla y color, no por fase.** Una sola anotación escribe varias tallas; se deshace «el último avance vivo de esa talla y color en esa fase», y solo si nada avanzó después en la fase que sigue. La pantalla agrupa los avances de una misma anotación y los deshace juntos.
- **Una fase está «hecha» cuando buenas + segundas + faltantes alcanzan lo que entró.** Con 48 que entraron y 40 buenas, 5 segundas y 3 faltantes, la fase termina: las 8 no volverán buenas. Sin esto la Costura quedaba «en curso» para siempre y Acabado no podía cerrarse.
- **Salida y Vuelta solo se agregan: no se deshacen.** Si se mandó de más, se corrige con una Vuelta con faltantes y motivo; los faltantes no se pagan (el devengado es buenas × tarifa), así que un error de más no cuesta plata. **Queda abierto para Felipe:** si una encargada anota una Salida de menos o a otro servicio, no hay cómo corregirla desde la pantalla; hoy se resuelve con el líder en la base. Si resulta un callejón al usarlo, la salida correcta es una función `anular_salida` (mientras no haya Vuelta) con su fila de archivo, no editar lo anotado.
- **La Vuelta es UNA tabla con un segmento** («Volvieron buenas · Segundas · Faltaron»), no tres tablas apiladas. «Volvieron buenas» nace con todo lo que está afuera; anotar segundas o faltantes en una celda baja sus buenas solas (solo si la celda estaba cuadrada). El motivo («qué pasó») es uno por vuelta y la pantalla lo manda en cada línea que lo necesita, como pide la base.
- **El estado de una fase compara contra la suma de todas las tallas** (límite conocido): con el 10 % de corte de más, 33 de una talla y 17 de otra suman 50 aunque a una le falten 3; el detalle por talla (`por_variante`) sí lo muestra y es lo que precarga las hojas.
- **Tela agrupada por insumo en la página:** una misma tela en dos colores sale de un solo estante, así que se suman los planes contra un saldo y el «usado» no se repite (antes decía «Alcanza» dos veces con 44 m contra 75,6 m).
- **Pendiente de actividades que siguen:** la tela usada se pregunta al cerrar Corte y los avíos que viajan con una Salida (actividad 7); «Pasar al stock» y «Anular» siguen llevando al cajón de hoy hasta la actividad 6 (**con OK de Felipe**, toca stock y dinero); la lista de Órdenes rehecha es la 5.
