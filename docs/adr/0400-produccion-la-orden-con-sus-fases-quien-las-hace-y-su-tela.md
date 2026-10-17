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

Hechas con commit: **1** (`baef5cfa6`, esquema y apertura), **2** (`b65155eef`, Nueva orden con fases y tela), **3** (`6671cc26e`, la página de la orden con «Terminé N», Deshacer y «Cambiar quién») y **4** (Salida y Vuelta en pantalla, `9a44ee38c`) y **4b** (anular una Salida o una Vuelta, abajo). Lo que se aparta del texto de arriba, y por qué:

- **`grant select (numero)` en `producciones`.** El candado de columnas del dinero (`20260921151000`) deja fuera para `authenticated` toda columna nueva; sin el grant la página no encontraba la orden por su número (la API respondía «permission denied»). Va en 154000, donde nace la columna, con su prueba (`N2`).
- **Deshacer un avance es por talla y color, no por fase.** Una sola anotación escribe varias tallas; se deshace «el último avance vivo de esa talla y color en esa fase», y solo si nada avanzó después en la fase que sigue. La pantalla agrupa los avances de una misma anotación y los deshace juntos.
- **Una fase está «hecha» cuando buenas + segundas + faltantes alcanzan lo que entró.** Con 48 que entraron y 40 buenas, 5 segundas y 3 faltantes, la fase termina: las 8 no volverán buenas. Sin esto la Costura quedaba «en curso» para siempre y Acabado no podía cerrarse.
- **Salida y Vuelta no se editan ni se borran, pero SÍ se anulan (actividad 4b, decisión de Felipe 2026-10-15, «poder anular, con motivo»).** Esta línea decía «no se deshacen» y dejaba abierto el callejón de una Salida mal anotada (48 en vez de 40, o al taller equivocado); Felipe eligió cerrarlo ahora en vez de esperar a que duela. Se hace como Deshacer: una fila CONTRARIA, nunca un `delete` ni un `update`. Ver «Actualización 2026-10-15 (b)» más abajo.
- **La Vuelta es UNA tabla con un segmento** («Volvieron buenas · Segundas · Faltaron»), no tres tablas apiladas. «Volvieron buenas» nace con todo lo que está afuera; anotar segundas o faltantes en una celda baja sus buenas solas (solo si la celda estaba cuadrada). El motivo («qué pasó») es uno por vuelta y la pantalla lo manda en cada línea que lo necesita, como pide la base.
- **El estado de una fase compara contra la suma de todas las tallas** (límite conocido): con el 10 % de corte de más, 33 de una talla y 17 de otra suman 50 aunque a una le falten 3; el detalle por talla (`por_variante`) sí lo muestra y es lo que precarga las hojas.
- **Tela agrupada por insumo en la página:** una misma tela en dos colores sale de un solo estante, así que se suman los planes contra un saldo y el «usado» no se repite (antes decía «Alcanza» dos veces con 44 m contra 75,6 m).
- **Pendiente de actividades que siguen:** la tela usada se pregunta al cerrar Corte y los avíos que viajan con una Salida (actividad 7); «Pasar al stock» y «Anular» siguen llevando al cajón de hoy hasta la actividad 6 (**con OK de Felipe**, toca stock y dinero); la lista de Órdenes rehecha es la 5.

## Actualización 2026-10-15 (b) · actividad 4b: anular una Salida o una Vuelta mal anotada

**El problema.** La encargada manda 40 y anota 48, o anota la salida al taller equivocado, o la guía era de otra orden. Con todo «solo se agrega», la pantalla no tenía cómo corregirlo y quedaba en manos de alguien con acceso a la base. Felipe eligió poder **anular, con motivo**, en vez de «corregir con la Vuelta» o «esperar a ver si duele».

**Cómo (migración `20261015160000_produccion_anular_salida_y_vuelta.sql`, sobre 154000 y 155000).**
- Una anulación es **una fila nueva** en `produccion_salidas` / `produccion_vueltas` con `anula_id` (la que anula; una sola anulación por fila, índice único) y `motivo` (obligatorio, con CHECK que lo liga a `anula_id`). Sus líneas llevan **las mismas cantidades en negativo**; la vuelta anulada además escribe, por cada avance de vuelta, su fila contraria `origen = 'deshacer'` (la misma que ya usa Deshacer).
- Las sumas **no saben que existe anular**: salieron, afuera, hechas, faltantes y devengado salen de sumar todo, y lo anulado se cancela solo. Cero filtros nuevos en cinco funciones (y las que vengan). Los CHECK de las líneas se relajan (`cantidad <> 0`; vuelta con `forma`) y dos disparadores (`produccion_*_lineas_signo`) exigen que lo negativo solo viva en una fila de anulación, porque un CHECK no puede mirar a la fila madre.
- `anular_salida(p_salida_id, p_motivo)` y `anular_vuelta(p_vuelta_id, p_motivo)`: módulo `produccion` en ese Taller, `fn_actor_persona_id(true)`, candado por orden, actividad sin montos (`produccion_salida_anulada`, `produccion_vuelta_anulada`); devuelven `fn_fases_de_orden`. Rechazos con hint: `anular_sin_motivo`, `anular_inexistente`, `anular_es_anulacion`, `anular_ya_anulada`, **`anular_ya_volvio`** (de esa salida ya volvieron prendas: se anula primero la vuelta) y **`anular_ya_avanzo`** (la fase siguiente ya usó las buenas de esa vuelta: la misma regla que `deshacer_avance`).
- **Una fase vuelve a «no empezó» cuando lo neto es cero** (`fn_fases_de_orden` y `cambiar_quien_fase`): anular la única salida —o un Deshacer total— deja otra vez cambiar quién la hace. Es el caso «mandé al taller equivocado»: se anula y se anota al otro. Antes un Deshacer total dejaba la fase bloqueada para siempre.
- `fn_orden_produccion` marca cada salida y vuelta con `anulada` y `anulable` (la base decide, la pantalla solo lo muestra) y cuenta la anulación como UNA entrada (`tipo = 'anulacion'`, con `anula` y `motivo`); los avances compensatorios no se muestran como «Deshacer».

**En pantalla.** La línea de tiempo ofrece «Anular» en cada Salida o Vuelta anulable (solo a quien opera la orden); abre una hoja chica con el efecto en una frase, «Por qué la anulas» (obligatorio, queda escrito) y «Quién lo anota», con el botón de peligro. La anotación anulada queda **tachada con su chip «Anulada»**, y «Anuló la salida de Costura · Por qué: …» aparece como entrada propia. Con guía de foco (`camposDeAnulacion`), tres pasos opcionales en la guía interactiva y un escenario de tema. El texto de la hoja «Salida» ya no dice que se corrige con la vuelta.

**Lo que NO se hizo, y por qué.** No se puede anular una anulación («si te equivocaste, anota la salida otra vez»), ni editar la cantidad de una Salida («se anula y se anota de nuevo»); tampoco una tabla `produccion_anulaciones` con un `where not exists` en cada suma.

**Cómo se verificó.** `pnpm pruebas:produccion-anulaciones` (18 casos en ROLLBACK: la fila contraria, los siete rechazos, «taller equivocado», el tope por lo neto, Acabado que ya usó las buenas, la línea de tiempo, el signo por disparadores, las puertas por módulo y por sede, la forma) más las dos suites de antes sin cambios (24 y 29). En el navegador, sobre una orden de prueba local: anular la vuelta devuelve el devengado a 0, la salida pasa a poder anularse, anularla deja «Cambiar quién» a la vista, y un doble clic deja UNA anulación.

## Actualización 2026-10-15 (c) · actividad 5: la lista de Órdenes (vista A, elegida por Felipe)

**Qué cambió en pantalla.** `/produccion/ordenes` deja de ser el tablero por etapa (cuatro columnas, tarjetas, «Terminadas ▸» desplegable, «Margen promedio») y pasa a la lista de la lámina:
cabecera única (`EncabezadoPagina`: «Órdenes», con «Nueva orden»), **«Hoy en el Taller»** (una `TarjetaCifra` por fase —Por cortar, En costura, En acabado, y Bordado, Estampado o Lavandería solo si algún lote está ahí— que
filtra al tocarse, más «Al stock este mes»), y UNA tarjeta con las pestañas **En curso · Muestras · Terminadas** (`Pestanas`), las píldoras **Todas · Afuera · Piden algo** (y **Listas para el stock**
si hay), el `Buscador` (por modelo, color o número, sin tildes) y la `Tabla`: la prenda (48 px), `OP-000012`, cuántas, el chip de fase **con quién la tiene** («En costura · afuera» / «Confecciones del Norte · 48 afuera»),
cuántos días lleva ahí, la entrega («vie 23 oct · en 4 días») y, si pide algo, rojo **solo por las tres causas** con «¿Por qué?» que se abre en una línea. Se ordena por entrega (la más cercana primero). A 1024 px la
tarjeta de la tabla pasa a tres columnas (las prendas van en la línea del número, la entrega en la de la fase); a 375, una columna.

**De dónde salen los datos (una sola fórmula).** `fn_ordenes_produccion_lista(p_ubicacion_id, p_historicas)` (migración `20261015005000`, solo lectura, sin políticas ni `alter`) llama a `fn_orden_produccion` de cada orden
—las en proceso, todas; de las terminadas o anuladas, las 40 más recientes— y devuelve su lectura sin `costos` y con solo el último movimiento. La web arma cada fila con las MISMAS reglas puras de la página de la orden
(`estadoDeLaOrden`, `quienDeFase`, `rojoDeLaOrden`): la lista y la página no pueden contradecirse. Los costos del Taller no viajan a una pantalla que no los muestra. «Al stock este mes» se cuenta en la base (lotes, no muestras,
mes de Lima), no sobre lo que trae la lista. Si la lectura falla, la pantalla lo dice (`Aviso`); nunca una lista vacía que parezca «no hay órdenes». El primer uso dice «Todavía no se abrió ninguna orden» (hallazgo H-B4 del
Formidable de línea base), ya no «todo lo abierto ya se cerró».

**Órdenes de antes de las fases.** Las abiertas antes de la migración 154000 no tienen ninguna fase (en la base local, OP-000001 a OP-000006). La página de la orden ya dice «se sigue desde la lista»; la lista las lee de sus etapas
de siempre (`conEtapasDeAntes`: «Por cortar», «En confección · afuera», «En acabado», o «Lista para pasar al stock») con la nota «Orden de antes de las fases», y al tocarlas abren el cajón de siempre (`OrdenPanel`), no una página
sin fases. Sigue siendo el único camino a «Pasar al stock», «Anular» y «Revertir» hasta la actividad 6.

**Lo que se fue.** El tablero por columnas, `OrdenTarjeta` (la tarjeta; quedan `semaforoDeOrden` y `ChipEntrega`, que el panel usa) y `useFlipCajas` (el viaje de la tarjeta entre columnas). El «Margen promedio» de la cabecera: no está en la
lámina elegida y el margen sigue a la vista en el panel de cada orden y en la hoja de Nueva orden (ADR-0370).

**Cómo se verificó.** `pnpm pruebas:produccion-lista` (9 casos en ROLLBACK: la fila es idéntica a la de la página en orden, líneas, fases y tela; sin costos y con el último movimiento; los límites de históricas; «al stock este mes»
sin muestras ni otro mes; las puertas por módulo y sede; solo lectura), 39 pruebas de las reglas puras con paridad contra el SQL, la guía interactiva de 20 pasos recorrida a 1440 y a 375 px (el «¿Por qué?» se abre solo, sin tocar nada),
`tema:auditar` a 1440, 1024 y 375 sin hallazgos, y el navegador: la explicación se abre bajo su fila, la fila lleva a su página y una orden antigua abre el cajón.

## Actualización 2026-10-15 (d) · actividad 6: pasar la orden al stock, con su candado y sus costos (OK explícito de Felipe)

**Lo que Felipe aprobó (2026-10-15, tres preguntas con Ganas/Pagas).** (1) Construirla tal cual está en el ADR; (2) los costos del Taller los ve **quien ve Producción parado en ese Taller** (antes, solo el líder); (3) las **segundas no entran al
stock**: quedan anotadas en la Vuelta y el costo del lote se reparte entre las buenas (la alternativa, un producto «segunda», es otra obra sobre el núcleo del catálogo).

**Base (migración `20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql`, solo funciones; sin políticas ni `alter table`).**
- `cerrar_produccion` (misma firma, ADR-0090), en una orden CON fases: **(a)** no cierra con prendas todavía en un servicio (`cierre_con_prendas_afuera`); **(b)** no deja entrar más buenas de una talla y color que las terminadas en la
  última fase (`cierre_buenas_exceden`); **(c)** si no le mandan `p_costo_maquila`, el costo de los servicios es lo **devengado** (`fn_costo_servicios_orden`, la suma de lo que `fn_fases_de_orden` ya calcula); tela y avíos siguen siendo los del
  libro de insumos; **(d)** en un lote escribe lo **medido** en `producto_consumos` (metros de tela usados ÷ buenas), que gana sobre lo declarado. Una orden de ANTES de las fases cierra exactamente como hoy.
- `anular_produccion` (misma firma) no anula con prendas afuera (`anular_con_prendas_afuera`).
- `fn_costos_producciones` y `fn_costos_insumos_taller` pasan a «líder, o quien ve `produccion` y opera ese Taller» (`fn_ve_costos_del_taller`, la misma regla de `fn_orden_produccion`).
- **Una extensión de lo aprobado, que solo restringe:** el cierre tampoco acepta prendas afuera (la misma lógica que anular: una prenda en un servicio sin una orden abierta que la reclame es un estado imposible, principio 2). Se resuelve con la Vuelta,
  o con los faltantes y su motivo (que no se pagan).

**Pantalla.** En la página de la orden, `AccionesDeLaOrden` abre tres hojas, ya sin mandar al cajón: **«Pasar al stock»** (en una muestra, «Terminar muestra»; precargada con lo terminado en la última fase, con el resumen de lo que entra y, a quien ve costos, el
costo por prenda; si la base dice `costo_atipico`, un líder lo confirma en línea; un doble clic no cierra dos veces; el aviso trae «Llevarlas a las tiendas»), **«Anular orden»** (deshabilitada con la frase de la base si hay prendas afuera; dice qué tela y avíos
vuelven al estante) y **«Revertir el cierre»** (en una orden terminada). El botón de la cabecera se llama «Anular orden» para no confundirse con el «Anular» de una salida de la línea de tiempo. `?orden=<id>` (Resumen) ya no abre el cajón para una orden con fases: va a
su página; el cajón (`OrdenPanel`) queda solo para las abiertas antes de las fases.

**Lo que NO cambió.** `revertir_produccion` (devuelve el stock como siempre; lo medido que dejó el cierre se reescribe en el siguiente cierre del modelo). `fn_recalcular_costo_variante`, el promedio ponderado (ADR-0067) y la regla del costo atípico.
**Pendiente (A8):** el cajón de una orden antigua y la pantalla de Insumos siguen mostrando costos solo al líder (`esLider` en sus componentes); la página de la orden ya los muestra a quien ve Producción en el Taller.

**Cómo se verificó.** `pnpm pruebas:produccion-cierre` (14 casos en ROLLBACK: el flujo completo con 46 buenas de 50 —2 segundas y 2 faltantes no entran—, el costo de servicios devengado y repartido entre las buenas, el monto explícito que manda, el candado de las buenas, la talla ajena y el cero, las prendas afuera
en cerrar y en anular, lo medido, una muestra, una orden de antes de las fases, quién ve los costos y la forma) y la suite del candado del dinero, cuyo caso 4c cambió a la decisión nueva y cuyo caso de «volver a pegar» ya no deja cambios en la base compartida. En el
navegador, sobre una orden de prueba: el candado dice «No puedes pasar al stock 9 de Caqui · 28: en Acabado se terminaron 8», un doble clic deja UN cierre (6 movimientos, 48 prendas), el costo sale a S/ 4.50 por prenda y «Revertir el cierre» devuelve las 48 con su movimiento.

## Actualización 2026-10-15 (e) · actividad 7: la tela usada y «¿alcanza?» de verdad

**El hueco que cerró.** Con la lista (actividad 5) y el cierre (actividad 6), el cajón viejo (`OrdenInsumos`) dejó de ser alcanzable para una orden con fases: **no había ninguna pantalla para anotar la tela usada ni devolver la que sobró**, y sin tela usada no hay costo real
ni «lo medido». Se rehízo en la página de la orden, sin tocar las dos funciones de la base que ya escriben (`registrar_consumo_insumo`, `devolver_insumo_de_produccion`).

**Pantalla.** En «Tela» de la orden: **«Anotar lo que usaste»** (la hoja `TelaUsadaModal`: qué tela o avío —una fila por insumo aunque tenga varios colores—, cuánto, nota y quién lo anota; nace con lo que falta según el plan sin pasar de lo que hay en el estante; no deja anotar más
de lo que hay) y **«Devolver lo que sobró»** (trae la tela de vuelta al lote del que salió, a su mismo costo; solo aparece si ya se anotó algo). Si lo que se usó cruza de un lote al siguiente, la base pide dos llamadas: la hoja las hace sola (`anotarConsumoEnLotes`, cada una un consumo
válido; si la tela se acaba a la mitad, lo ya anotado queda anotado y dice cuánto falta). Además, **al terminar el corte** (cuando lo que se anota en «Terminé» completa el lote) la propia hoja pregunta la tela usada de cada tela, precargada y opcional: primero se anota el avance
y después la tela (dos RPC, no una: no se tocó la firma de `registrar_avance`); si la tela falla, el corte queda anotado y la hoja lo dice. «Deshacer» del corte no devuelve la tela y el aviso lo advierte.

**«¿Alcanza?» cuenta lo comprometido (migración `20261015165000_produccion_tela_pendiente_de_la_orden.sql`, solo lectura).** `fn_tela_pendiente_de_la_orden` da, por cada tela de la orden, cuánto reservan las OTRAS órdenes abiertas del Taller (la misma fórmula de `fn_nueva_orden_opciones`: su plan menos lo
descontado, sin contar esta) y las órdenes de insumos generadas de esa tela con destino el Taller (últimos 60 días, sin las anuladas). `veredictoTela` ya recibía lo comprometido: la página de la orden pasaba 0; ahora pasa lo real, así que dos órdenes ya no dicen «alcanza» contra los mismos metros. La lista de Órdenes
lleva lo mismo (`tela_pendiente` dentro de `fn_ordenes_produccion_lista`): «la tela no alcanza» es una sola cuenta. Cuando falta, **«Pedir N m»** lleva a Órdenes de insumos (solo a quien ve ese módulo).
**Lo pedido se muestra, NO se suma a lo que hay:** una orden de insumos solo es `generada` o `anulada`, no se liga a la recepción; sumarla contaría dos veces lo que ya llegó y diría «alcanza» sin que alcance.

**Lo que NO se hizo, y queda para decidir con Felipe.** El consumo por prenda **declarado en el modelo** (lo de Audaces) hoy se escribe una sola vez, con la primera tela de la primera orden de ese modelo (la apertura, `on conflict do nothing`), y lo corrige lo MEDIDO al pasar un lote al stock (actividad 6). El
panel para editarlo antes en «Editar producto» no se construyó: esa pantalla no tiene hoy un lugar de Producción y es un formulario grande de otro módulo (Catálogo) con su barra de guardar. **Pendiente de la respuesta de Felipe.** Tampoco se pre-llena «Pedir» en la orden de insumos (es otra
pantalla y otro módulo).

**Cómo se verificó.** `pnpm pruebas:produccion-tela` (9 casos en ROLLBACK: lo que reservan las otras, descontarle tela a la otra, una orden anulada, los pedidos y sus filtros, que la lista diga lo mismo que la página, las puertas y la forma), 15 pruebas de la lógica de la hoja (agrupar por insumo, validar, partir entre
lotes con un lote que se acaba) y 11 de la lectura y las frases de la tela con paridad contra el SQL. En el navegador: la hoja nace con 44 m (lo que hay), un doble clic descuenta UNA vez, el costo real de la tela sale solo (S/ 858) y la tela muestra «Faltan 31.6 m», «Pedir 31.6 m» y sus dos pedidos.

## Actualización 2026-10-15 (f) · actividad 8 (8a, 8b, 8c): el resto de Producción habla el mismo idioma y la lista de precios de los servicios tiene dónde cargarse

**8a · el vocabulario, vigilado.** `lib/produccion-vocabulario.test.ts` lee el código de las pantallas y reglas de Producción sin sus comentarios y falla si dicen «corrida», «maquila externa», «insumos descontados», «cerrar al inventario», «enviar a maquila» o «maquila (real)». Una orden es un lote; la fase la hace el Taller o sale afuera con un servicio; la tela se usa y se devuelve; la orden pasa al stock.
**8b · una sola cabecera.** Resumen, Insumos, Proveedores, Facturas, Recibir, Por pagar y Eficiencia usan `<EncabezadoPagina>` con la sede y la fecha arriba (la decisión de Felipe: la de Ventas e Inventario); `OrdenTarjeta.tsx` quedó en `semaforoDeOrden` y `ChipEntrega`, y se borraron `OrdenesTablero.tsx` y `useFlipCajas.ts`.

**8c · «Servicios y tarifas» (migración `20261015172000_produccion_tarifas_de_servicios.sql`).** El problema: `proveedor_tarifas` (la lista de precios de cada servicio por fase, con su cantidad mínima y su fijo por orden) la leen «Nueva orden» y «Cambiar quién» para SUGERIR la tarifa, pero **nada la escribía**:
no tenía políticas ni función, así que la sugerencia nunca aparecía y cada orden se abría tecleando la tarifa. Solo funciones, ninguna tabla ni política nueva (se pega en producción como `create or replace function`):
- `fn_tarifas_de_servicios()` devuelve la tarifa **vigente** de cada servicio (rubro distinto de tela y avíos) en cada fase, con cuántas versiones tiene; solo el líder, a los demás NULL.
- `guardar_tarifa_servicio(proveedor, fase, tarifa, cantidad mínima, fijo, nota)` carga una tarifa NUEVA vigente desde hoy. **Una renovación es una fila nueva, no una edición:** la anterior queda como historia y las órdenes ya abiertas conservan la suya (la fase la copia al abrirse). Cargar dos veces el mismo día corrige la de hoy.
  Solo el líder; firma con `fn_actor_persona_id(true)`; anota la actividad sin montos.
**Pantalla.** Proveedores gana dos pestañas (`<Pestanas>`): «Proveedores» (el directorio de siempre, sin la nota que prometía un saldo que no existía) y «Servicios y tarifas»: tres cifras (con tarifa, sin tarifa, vigentes), una tabla por servicio y fase (cobra por prenda, desde cuántas prendas, fijo por orden, desde cuándo rige, «Cambiar») y el servicio sin precio sale con «Sin tarifa» y su
«Cargar tarifa». La hoja **«Nueva tarifa» / «Cambiar la tarifa»** (`TarifaServicioModal`, guía de foco, responsable) dice qué reemplaza —si la tarifa se cargó hoy, «lo que guardes la corrige»; si es de antes, «queda guardada como historia»— y no pide el servicio ni la fase al renovar. `?vista=tarifas` abre la segunda pestaña (un enlace desde «Nueva orden» puede caer ahí).
Cotizaciones de maquila **sigue siendo su propia pantalla** (D-80: un líder de tienda debe poder abrirla; no exige estar parado en el Taller): se enlaza desde la pestaña como lo que es, la referencia contra la que se mide al Taller (D-31), distinta de la tarifa de cada servicio.
**Descarté** mezclar ambas en una sola lista (son dos preguntas: «¿cuánto cobra este servicio?» y «¿cuánto costaría hacerlo afuera?») y que cualquiera con Producción cargue la tarifa (es el precio con el que se negocia y se mide, como las cotizaciones).
**Cómo se verificó.** `pnpm pruebas:produccion-tarifas` (8 casos en ROLLBACK: las puertas —solo líder—, que una renovación sea una fila nueva y la vigente sea la última, que el mismo día corrija, todos los topes y la forma de las dos funciones), 48 pruebas de las reglas y de la guía (paridad con el SQL leyendo la migración: topes, fases, orden, los `hint`
de cada rechazo) y la guía recorrida en navegador a 1440 px y a 375 px (22 pasos, sin escrituras). En el navegador: se cargó «Costura S/ 4.50, desde 50 prendas» para un servicio, la tabla y las cifras se actualizaron solas, «Cambiar» abre la hoja con la vigente a la vista; `tema:auditar` 0 hallazgos en claro y oscuro (la pantalla y las dos hojas).


## Actualización 2026-10-15 (g) · actividad 8d: el Resumen cuenta lo que las órdenes ya reservan, muestra lo pedido y dice dónde está cada orden

**El hueco.** El Resumen calculaba lo que «piden» las órdenes abiertas con el rendimiento MEDIDO de las órdenes cerradas de cada modelo; un modelo sin una orden cerrada con tela usada no aportaba demanda, y la orden nueva —que ya trae su tela declarada— contaba con una fórmula distinta de la de «Nueva orden» y de la página de la orden. Y cuando faltaba tela la tarjeta mandaba a «Registrar el comprobante»: a anotar una factura, no a pedir (hallazgo de la prueba ciega del 14-oct).

**Base (migración `20261015173000_produccion_tela_del_taller.sql`, solo lectura, sin tablas ni políticas).** `fn_tela_del_taller(p_ubicacion_id)` da, por cada tela y avío que alguna orden abierta declara o que tiene un pedido en camino: lo **comprometido** (la MISMA cuenta de `fn_nueva_orden_opciones`: plan declarado menos lo descontado), los modelos de las órdenes que todavía la necesitan y las órdenes de insumos generadas con destino el Taller (60 días); y, aparte, las órdenes abiertas **sin tela declarada**. Una ubicación que no existe da NULL, igual que quien no puede leer.

**Una sola cuenta de «piden» (`demandaDelTaller`).** La tela que cada orden declaró manda; para las órdenes que no declaran ninguna (las de antes de las fases) sigue valiendo el rendimiento medido de su modelo, y si la base no contesta todas se cuentan como antes: la pantalla se degrada, no se rompe. Una muestra que declara tela ahora SÍ reserva (el estante no es suyo ni de otra).
**Lo pedido se muestra, no se suma** (como en la página de la orden, actividad 7): una orden de insumos no se liga a la recepción. La tarjeta «Faltan N m» ya no lleva a «Registrar el comprobante»: lleva a **«Pedir la tela»** (`/ordenes-insumos/nueva`), o a **«Ver los pedidos»** si ya hay alguno, que además se nombran en la tarjeta («Si ya llegaron, anótalos en Recibir»). En la tabla de «¿Alcanza la tela?» cada fila que falta lleva su «Pedir» y sus pedidos debajo.
**«Hoy en el Taller» en el Resumen.** La misma lectura de la lista de Órdenes (`getListaDeOrdenes` → `cifrasHoyEnElTaller`): una `TarjetaCifra` por fase con lotes, prendas, cuántas están afuera y con quién, que lleva a Órdenes; va después de «Para decidir» (la pantalla es para decidir). Si la lectura falla, un `Aviso` lo dice.
**Quien no es líder ve una frase, no un redirect** (`ProduccionSoloLider`): Resumen, Facturas de insumos, Por pagar, Proveedores y Eficiencia explican que son del líder (llevan montos, deudas y datos de terceros) y ofrecen «Ir a Órdenes». Contrapartida conocida: en el celular, el enlace del grupo «Producción» apunta a `/produccion`, así que quien no es líder cae en esa frase con su botón, un toque antes de Órdenes.

**Corregido de paso.** En la actividad 7 cinco pasos de la guía de la orden (`pedir-tela`, `anotar-tela`, `tela-cantidad`, `tela-cierre`, `devolver-tela`) quedaron escritos en la guía del Resumen por error; como eran opcionales se saltaban sin avisar y nunca se enseñaban. Ahora están en la guía de la orden y la corrida en navegador (25 pasos) los recorre.
**Cómo se verificó.** `pnpm pruebas:produccion-tela-del-taller` (12 casos en ROLLBACK: lo comprometido es la cuenta de «Nueva orden» y de la página, con dos órdenes y con una que ya descontó; una orden anulada no cuenta; las sin tela declarada; un pedido sin orden que lo declare; los filtros de lo pedido; las puertas y la forma), 19 pruebas nuevas de la lectura y de `demandaDelTaller`/decisiones, la suite web (159 466 en verde), las guías del Resumen y de la orden recorridas a 1440 y a 375 px, y `tema:auditar` del Resumen en claro y oscuro sin hallazgos. En el navegador: «Hoy en el Taller» con sus fases, la tarjeta «Faltan 146.5 m de lino» con sus dos pedidos y «Ver los pedidos».

## Actualización 2026-10-15 (h) · actividad 8e: Insumos, la ficha de la tela y los costos de quien ve Producción

**El hueco.** `insumos.tejido_id` y `insumos.color_codigo` existían desde la actividad 1 y «Nueva orden» las lee para proponer la tela del color de la prenda (`telasSugeridas`), pero **ninguna pantalla las escribía**: la sugerencia nunca acertaba y cada orden se armaba eligiendo la tela a mano. Además, Insumos mostraba el costo de cada lote solo al líder aunque Felipe ya había decidido (actividad 6) que los costos del Taller los ve quien ve Producción parado en él, y la primera cifra de la portada era el capital en insumos.

**Qué se hizo (sin migración: la política `insumos_update_lider` ya permite al líder actualizar).**
- **La ficha de la tela.** Cada insumo dice bajo su nombre de qué tejido y de qué color es (con su muestra de color) o «Sin tejido ni color». La hoja **«Ficha de la tela»** (`FichaDeLaTelaModal`; «Completar tejido y color» / «Editar la ficha» dentro del insumo abierto) escribe las dos columnas con el vocabulario de Catálogo (`tejidos` aprobados, `colores` activos; combos con buscador). **«Nuevo insumo»** (`insumos-taller/NuevoInsumoModal`) los pide también; el tejido de un avío no aplica y no se guarda. Son **sugeridos, nunca un candado** (guía de foco `lib/insumos-guia.ts`).
- **Ejemplos coherentes** (`lib/sugerencias-insumos.ts`, ADR-0290): el código y el nombre de ejemplo siguen al tipo elegido (tela o avío) y evitan lo que ya existe en el catálogo; un texto neutro si todos están usados.
- **Costos.** `getInsumosDelTaller` ahora dice `veCostos` (la base entregó el costo de los lotes) en vez de adivinarlo por el rol: quien ve Producción en el Taller ve el costo de cada lote; con lotes y cero filas no se dibuja «S/ 0.00». **El capital sigue siendo del líder** y ya no es cifra de portada: «Ver el capital en insumos» lo muestra con un toque. Crear el catálogo, ingresar lotes y completar la ficha siguen siendo del líder.
- **No se tocó el cajón de las órdenes de antes de las fases** (`OrdenPanel`, `OrdenInsumos`, `OrdenCierre`): mezcla costos con margen y precios de venta (solo del líder, ADR-0370) y se va solo cuando esas órdenes cierren; las órdenes con fases ya muestran sus costos a quien corresponde en su página.
**Cómo se verificó.** 39 pruebas nuevas (la ficha, los ejemplos con el catálogo lleno y vacío, la guía contra la regla de la hoja con 18 combinaciones), la suite web en verde (159 507), la guía de Insumos recorrida a 1440 y a 375 px (18 pasos, sin escrituras) y `tema:auditar` de Insumos y sus tres hojas sin hallazgos. En el navegador: se completó «Lino · Verde botella» en la tela de prueba, la fila lo dice con su muestra y la base lo tiene guardado.

## Actualización 2026-10-15 (i) · actividad 7b: el consumo del modelo se corrige en Nueva orden (decisión de Felipe)

**La duda y la respuesta.** El consumo de tela por prenda «declarado» del modelo (`producto_consumos`) solo lo fijaba la primera orden de cada modelo y lo corregía lo medido al pasar un lote al stock; el plan decía «Editar producto ▸ panel del Taller», una pantalla de Catálogo. Felipe eligió el 2026-10-15 **corregirlo en Nueva orden, con un interruptor** (no en Editar producto).

**Qué hace.** En el bloque «Tela» de Nueva orden, con un modelo que ya existe, la primera tela con consumo escrito se compara con lo que dice el modelo (`ofertaDeConsumoDelModelo`):
- **El modelo todavía no dice nada:** una línea avisa «es la primera orden de este modelo: queda anotado que lleva N m por prenda» (lo de siempre, sin interruptor ni permiso).
- **Dice otra cosa y quien abre edita el catálogo:** aparece **«Dejar N m por prenda como el consumo del modelo»**, apagado de fábrica, con lo que dice hoy el modelo y de dónde viene (lo medido, o lo anotado). Marcado, la apertura manda `fijar_consumo_modelo: true`.
- **Dice otra cosa y quien abre no edita el catálogo:** solo una línea («solo esta orden usa la tuya; para cambiar el del modelo, pídeselo a quien edita el catálogo»).
**En la base** (`abrir_orden_produccion`, migración `20261014154000`, que todavía no está en producción: se editó en su lugar): con `fijar_consumo_modelo`, la primera tela de la orden queda como consumo **declarado** del modelo aunque ya hubiera uno (aun uno medido; lo medido al cerrar lo vuelve a corregir). Corregir lo que el modelo YA dice exige `fn_puede_editar_catalogo()` (líder o los módulos Productos y Atributos): si no, `42501` con `consumo_modelo_sin_permiso`, **antes de abrir**, así que la orden rechazada no gasta número. Donde el modelo no decía nada no hace falta permiso. La actividad anota si se corrigió el modelo (`consumo_del_modelo`, sin cifras).
**Cómo se verificó.** Tres casos nuevos en `produccion_fases.mjs` (27 en total: el líder corrige incluso un consumo medido; quien no edita el catálogo es rechazado sin número gastado y sin tocar el consumo; donde no había consumo, quien opera el Taller lo deja declarado), 5 pruebas de la regla (`ofertaDeConsumoDelModelo`: la primera tela, avíos que no cuentan, igualdad a tres decimales) y su paridad con la base. En el navegador: con un consumo distinto de lo que dice el modelo aparece la casilla con «Hoy el modelo dice 1.5 m», y al marcarla la apertura lleva `fijar_consumo_modelo: true` (con la red interceptada: no se escribió nada).
**Para producción.** Es solo `create or replace function` sobre una función que tampoco está allá todavía: viaja en la misma migración 154000, con tu OK.

## Actualización 2026-10-16 (j) · la rama se puso al día con main; la tela en camino; el cierre incorpora el techo de buenas

**Lo que pasó.** Al preparar los arreglos del `/chaos` y del `/formidable` se vio que esta rama estaba **758 commits detrás de `main`** y que otras sesiones habían tocado Producción en paralelo: la recepción de las órdenes de insumos (ADR-0362), los candados `*_montos_finitos` y el token que sigue al contenido (ADR-0409), el techo de buenas (ADR-0415), y varias rondas de `/unificar`. Se fusionó `main` (25 archivos en conflicto, resueltos con revisión independiente), se llevó lo nuevo de la rama a las piezas únicas (13 hojas y 3 piezas) y se volvieron a correr las nueve suites de base contra una **copia de la base con todas las migraciones de `main`**: pasan.

**Qué cambió respecto de lo escrito arriba.**
1. **El NaN del `/chaos` (hallazgo #2) ya lo cubría `main`** (candados de tabla, en producción desde el 14-oct): no se escribió migración; los casos EV1–EV3 del `/chaos` se vuelven a rechazar contra la copia con `main`.
2. **«Lo pedido se muestra, no se suma» (g, e) ya no es cierto:** `main` liga la recepción a cada línea de la orden de insumos. **Decisión de Felipe (2026-10-16):** la tela que viene en camino **cuenta** y es **lo que falta recibir de cada pedido** (la cuenta de `fn_orden_insumo_por_recibir_lineas`, la misma de la pantalla Recibir), **salvo los pedidos atrasados** (su fecha estimada de entrega ya pasó): esos no cuentan y salen aparte con su aviso. Un pedido sin fecha cuenta. Ya no hay ventana de 60 días.
   - Base: `fn_tela_en_camino(p_ubicacion_id)` (migración `20261015165000`, reescrita) es la lectura única; `fn_tela_pendiente_de_la_orden` y `fn_tela_del_taller` (`20261015173000`, reescrita) la usan y devuelven `en_camino`, `atrasado` y los `pedidos` con lo que falta de cada uno. No se tocó `fn_nueva_orden_opciones` (puede estar ya pegada): Nueva orden pide `fn_tela_en_camino` aparte.
   - Web: `veredictoTela` suma lo que viene y dice «alcanza si llega lo pedido»; la página de la orden, el Resumen y Nueva orden cuentan igual. El asunto del Resumen deja de contradecirse («Faltan 146.5 m de lino hoy, pero ya vienen 155 m en camino») y su cuenta va bajo un «¿Por qué?» a un toque.
3. **El cierre al stock incorpora el techo `buenas_de_mas`** (`20261014160000`): como esa migración reemplaza `cerrar_produccion` entera y producción ya tenía el bloque de ADR-0415, pegarla tal cual lo habría quitado. Lleva el mismo bloque con la misma marca: pegarla no lo quita, y volver a pegar `20261015153000` después no hace nada (hash idéntico, comprobado). Las otras tres funciones que reemplaza difieren de producción solo en lo que la migración se propone cambiar.
4. **Falso rojo (Formidable H3):** con el corte terminado, la tela que sobra del plan ya no se va a usar; la orden dejaba de salir «la tela no alcanza» (OP-343). Los avíos siguen pendientes después del corte.

**Para producción (con tu OK, en este orden; todas son `create or replace function`/tablas nuevas, sin políticas, idempotentes):** `20261014154000`, `20261014155000`, `20261014160000`, `20261015005000`, `20261015160000`, `20261015165000`, `20261015172000`, `20261015173000`. Verificado en solo lectura el 2026-10-16: producción no tiene ninguna de las tablas ni funciones nuevas, y sí todo lo que necesitan (19 funciones y 16 tablas que usan sin crear, la recepción de `main` incluida).

**Pendiente aparte (Felipe, 2026-10-15):** retirar el cajón viejo de las órdenes de antes de las fases (~1 270 líneas) en un PR propio, después del despliegue y recontando las órdenes abiertas sin fases (hoy `retail.producciones` tiene 0 filas).

## Actualización 2026-10-16 (k) · la ronda de 36 preguntas: lo que Felipe contestó y qué cambia de lo construido

**Contexto.** El rediseño se fusionó a `main` el 2026-10-16 (PR #1140) y sus 8 migraciones están en producción, donde **todas las tablas de Producción siguen en 0 filas**
(verificado con `SELECT` después de la fusión). Felipe pidió «investigar bien en lugar de diseñar a ciegas»: una investigación de 11 agentes sobre cómo se produce de verdad
una prenda y una ronda de 36 preguntas en 10 llamadas (35 del banco y 5 de seguimiento; P-12 diferida). Todo está en
`docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/`: `README.md` (informe), `13-respuestas-de-felipe.md` (cada respuesta) y `14-lo-que-cambia-en-adr-0400.md`.
**Lo de abajo sustituye o matiza lo indicado; el resto de este ADR sigue en pie.**

**Lo que se sustituye o se matiza (decisiones de Felipe; no re-preguntar):**
1. **d.2 · las fases.** Cada orden: **Ploteo · Corte · Costura · Ojales y botones · Limpiar hilos y revisar · Planchado · Etiquetar y embolsar**; cada paso lo hace el Taller o un
   servicio («depende»). **Patronaje y Muestreo** viven en el modelo, una sola vez, no en la orden. **Bordado, estampado y lavandería no se usan por ahora** («luego podemos
   ampliar»). Antes: Corte · Costura · Acabado más tres opcionales (P-13, N-1).
2. **d.4 y A6 · «las segundas no entran al stock».** Una prenda con falla chica **se arregla y cuenta como buena**; la arregla el Taller, también la que devuelve un servicio, y
   el arreglo no se costea (P-06, P-06b).
3. **d.6 · la tela.** Se compra **también por kilo** (el punto); Audaces da un número por marcada, en metros, y se convierte a kilos con el gramaje y el ancho de cada tela
   (P-19, P-20, N-2). **Lo medido manda sobre Audaces solo desde la tercera orden cerrada del modelo**, no desde la primera (P-21). La tela se revisa y mide al llegar; reposo y
   lote de tinte no se anotan (P-23, P-24).
4. **d.7 · el avance.** El tope de cortar de más es de **3 prendas por talla y color**, no 10 % (P-22, N-3). **Una fase puede cerrar corta, con su motivo, si la encargada la da por
   terminada** (P-04); quien hace «Limpiar hilos y revisar» declara «buena» con su visto (P-26); el lote pasa al stock una sola vez, sin entregas por tandas (P-27).
5. **D-31 y d.5 · el costo.** La prenda queda con costo limpio (tela, avíos y servicios). El costo del Taller por prenda (planilla y gastos ÷ prendas terminadas del mes) se ve
   **aparte, por mes**, sin anotar horas; el cierre muestra primero costo, metros y buenas (P-07, P-31, P-32). El contador debe confirmar cómo cierra el costo de ventas.
6. **d.1 · quién anota.** El sistema es el **único registro** (P-08); anota la encargada (P-11); la gente del Taller cobra sueldo mensual, así que el dato por persona no hace
   falta (P-07; P-12 diferida).
7. **Anular.** Anular una orden con tela ya cortada **pregunta qué se hace** con lo cortado (otra orden, liquidar o botar, con motivo); ya no vuelve toda al estante (P-05).

**Se confirma sin cambios:** d.3 (una fase, un solo «quién»; para partir, dos órdenes, P-16); d.5 (tarifa por prenda, aviso del mínimo que no bloquea, P-36; sin adelantos,
P-15); la fecha que importa al abrir es la que sale del Taller (P-33); la tela la pone CAYLA y la manda cortada (P-01); la guía de remisión sigue como un comentario breve
(P-02: el riesgo —SUNAT pide guía antes de mover mercadería— se le informó y la decisión de diferirlo es de Felipe; el contador sigue con la lista de `04` §8).

**Lo nuevo (decidido, no construido):** cada orden guarda si es **reposición o novedad y a qué tienda va** (P-34); marca **«urgente»** con su fecha (P-35); **cambiar una orden
abierta con motivo** (P-29); **quién aprobó la muestra** de un modelo nuevo (P-28); papeles del servicio: factura, boleta, recibo o nada, y «sin factura» marcado (P-14, P-17);
señal de atraso del servicio (P-30); la dirección del Taller (declarado ante SUNAT, P-03); y la rúbrica o contrato simple para servicios (P-18; borrador aparte).

**Supuestos míos (cada uno cambia en una línea):** «Limpiar hilos y revisar» va antes de «Planchado»; **Ojales y botones es opcional según el modelo y los otros seis pasos van
siempre**; Ploteo no cuenta prendas y se marca con un toque «hecho», los demás con «Terminé N de M»; bordado, estampado y lavandería **siguen en el catálogo de la base y se apagan
en pantalla**; Patronaje y Muestreo se registran en el modelo (quién y cuándo), sin tarifa, hasta que haga falta.

**Cómo se aplica a lo ya construido y pegado.** Tres hechos mandan: la web del rediseño **ya está desplegada** y habla con las seis claves de fase actuales; producción tiene
**0 filas** en todas las tablas de Producción, así que cambiar el esquema ahora **no migra datos** (esa ventana se cierra con la primera orden real); y un cambio de esquema en
producción **lo confirma Felipe**. Regla: **expandir, cambiar la web y recién entonces contraer** (la base acepta las claves viejas y las nuevas, la web pasa a las nuevas; no se
borra nada). El orden y el detalle por objeto están en `docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/16-como-aplicarlo-a-lo-ya-pegado.md`:
- **R1** las fases nuevas (`produccion_fases_clave_check`, `proveedor_tarifas_fase_clave_check`, `fn_fase_secuencia`, `fn_fase_nombre`, `fn_produccion_fases_normalizar`,
  `fn_fases_de_orden` y la web): **va primero y en un solo pegado con las columnas nuevas de R3, R4 y R5**, antes de la primera orden real.
- **R2** el tope de 3 (`fn_produccion_entrada_variante`, hoy ×1,10); el techo de cierre de ADR-0415 queda como segunda red.
- **R3** fase corta con motivo y «se arregla y cuenta» (función nueva; hoy una fase del Taller que termina corta nunca queda «hecha»).
- **R4** kilos y «lo medido manda con 3 órdenes» (`insumos`, `cerrar_produccion`): **toca stock y dinero, OK aparte de Felipe**; antes, un reporte real de Audaces y una factura
  de punto para fijar la conversión.
- **R5** datos al abrir (reposición o novedad, tienda, urgente, quién aprobó).
- **R6** anular con tela cortada (`anular_produccion`): **toca stock y dinero, OK aparte**.
- **R7** cambiar una orden abierta con motivo · **R8** costo del Taller por mes, cifras del cierre y señal de atraso (lecturas) · **R9** papeles del servicio
  (`comprobantes_produccion.tipo` hoy solo admite factura, boleta y nota de venta) · **R10** dirección del Taller en `ubicaciones` (un dato; no se versiona).
Cada una con `/construir` (un commit por actividad), las suites de base de Producción (los parches por md5 se suman a sus `DESHACER_*`), `/chaos` en lo que guarda, y la guía, la
huella y los escenarios de tema que toque.

**Qué se rompe si** se cambia la web antes que la base: la hoja «Nueva orden» manda claves que `produccion_fases_clave_check` rechaza. Y si se contrae primero (quitando
`acabado`) con la web vieja desplegada, esa misma hoja deja de abrir órdenes. Por eso: expandir, web, contraer.
