# ADR-0133 — Producción es un módulo propio, con su abastecimiento, conectado con Compras solo por los datos

- **Numeración:** nació como ADR-0130 («Producción es el módulo padre») y se renumeró a 0133 al fusionar con `main`, donde el 0130 ya era
  «El menú lateral se pliega a íconos». El título y el rumbo cambiaron el mismo día (ver «Historia»).
- **Estado:** **Aceptado e implementado (F0 a F8, 2026-09-19 a 2026-09-22).** Las decisiones abiertas se resolvieron con Felipe: D-H (Producción con su propio abastecimiento) el 2026-09-19; D-G (dinero solo del líder)
  y D-I (deuda consolidada e IGV) el 2026-09-21; **D-E (cotización de maquila externa) descartada** y **D-F (gastos del Taller) resuelta sin tabla propia** —sueldos de Dynamic, alquiler y servicios de Finanzas— el 2026-09-22.
  Qué se construyó y qué migraciones lleva cada fase: `docs/PLAN-PRODUCCION.md`. Estado de la base: todas las migraciones de Producción están pegadas en producción.
- **Reemplazó, en un punto, y luego se revirtió:** la regla del 2026-09-17 «Producción solo se ve parado en el Taller, líder incluido» (comentario
  en `AppShell.tsx`, ADR-0051). El 2026-09-19 la Decisión 2 la cambió (el líder la veía desde cualquier ubicación); **el 2026-09-20 Felipe la
  restituyó** — ver la nota bajo la Decisión 2. Hoy manda la del 2026-09-17.
- **Refina:** ADR-0090 (insumos del Taller) — ahora se conecta con su propio abastecimiento y con la orden; ADR-0126 (el dinero es del líder) — se extiende
  a los costos de insumos. **Copia las reglas de** ADR-0035 (la factura es el eje) para los comprobantes de Producción, sin tocar las tablas de Compras.
- **Diseño de referencia:** `docs/maquetas/produccion-modulo-2026-09/`.

## Historia (por qué el título cambió)

La primera versión de este ADR proponía a Producción como **módulo padre** que absorbía a Compras (así lo mostraba el spike, con un grupo «Abastecer»).
Se publicó en el PR #185 y se vio en pantalla: **las mismas cuatro pantallas de Compras, con los mismos datos, aparecían dos veces en el menú**
(una copia). Felipe lo corrigió el mismo día: **Producción y Compras son módulos distintos, cada uno con sus proveedores y sus pantallas.** Además
eligió, contra la recomendación de este ADR (una lista de proveedores vista por rubro y una sola factura registrada en Compras), que Producción
tenga **su propio directorio de proveedores** y **sus propios Comprobantes, Por pagar y Recibir**.

## Contexto

CAYLA fabrica y vende. El costo de la prenda que llega a la tienda —y con él el margen de todo el negocio (D-31)— depende hoy de un número que alguien
escribe: Insumos existe en la base (ADR-0090) con **0 filas y ninguna pantalla**, y `NuevaOrdenProduccionForm.tsx` teclea a mano tela y avíos. Comprar tela
y avíos es, en la práctica, parte de fabricar: otros proveedores (Gamarra, lino, botones), otras unidades (metros, conos), otro destino (el Taller) y
otra pregunta («¿alcanza para cortar?»).

## Decisión

1. **Producción y Compras son dos módulos distintos**, cada uno con su grupo en el menú. Se conectan por los datos (la factura de tela abre un lote, la
   orden lo consume), **no por el menú**. Compras **no se modifica**: sus pantallas, sus tablas y sus funciones quedan tal cual.
2. ~~**El líder ve Producción desde cualquier ubicación**~~ **(revertida el 2026-09-20 — ver nota)**: quien trabaja en el Taller ve sus pantallas; el
   resto no la ve.
   > **Nota 2026-09-20 (Felipe, al ver «Producción» en el menú de una tienda):** Producción se ve **solo parado en un Taller, líder incluido**. La
   > regla mira el **tipo** de la ubicación activa (`ubicaciones.tipo = 'taller'`), no un nombre: un segundo Taller entraría sin tocar código. Es una
   > regla de **visibilidad** (menú y páginas), no de permiso: la base sigue permitiéndole al líder operar el Taller desde cualquier sede
   > (`fn_puede_operar_ubicacion` = líder o mi ubicación), así que no hubo cambio de esquema. Un líder que llega a `/produccion/*` desde otra ubicación
   > (por ejemplo, con el enlace del Resumen de Inventario) ve un aviso que le dice que cambie al Taller; quien no puede cambiar de ubicación vuelve al
   > inicio. La regla vive en `puedeVerProduccion` (`lib/produccion-menu.ts`), que usan el menú y las dos páginas.
3. **Producción tiene su propio abastecimiento (D-H, decidido por Felipe):** `proveedores_produccion` (tela, avíos, maquila), `comprobantes_produccion`
   (+ ítems y pagos), Por pagar y Recibir propios. Recibir un comprobante **abre un lote** por línea (proveedor, documento, costo sin IGV). Son pantallas
   **nuevas** sobre **datos distintos** de los de Compras: se parecen en el lenguaje visual, no en lo que muestran.
4. **El costo de tela y avíos de una orden sale del consumo real** (`registrar_consumo_insumo`), no de un campo tecleado. `cerrar_produccion` conserva su
   firma (acepta `null`).
5. **El rendimiento se mide, no se declara:** consumo real ÷ prendas buenas de las órdenes cerradas. No se revive `bom_items`.
6. **D-31 se completa con dos tablas mínimas:** `maquila_referencias` (cotización externa por modelo) y `gastos_taller` (mes, concepto, monto), solo líder.
   Hasta que existan, Eficiencia muestra estados vacíos, **nunca cifras inventadas**.
7. **Los costos y los comprobantes de Producción nacen bajo el candado de ADR-0126:** solo el líder ve montos; el Taller usa funciones operativas sin
   monto. `v_insumo_saldos` deja de saltarse la RLS (`security_invoker`).
8. **El diseño se porta del spike y solo cambia donde CAYLA lo exige** (tabla de la sección 5 del plan): tope de rojo por pantalla, piso de contraste,
   candado en la base, estados vacíos en vez de datos de ejemplo, piezas reales del repo, **ninguna animación en bucle**, sin rótulos de sección en el lateral.
9. **Gestos de movimiento:** se reutiliza lo de ADR-0128 (`anim-entra`, `anim-crece-x/y`, `anim-trazo`, `anim-cajon`, `useFlip`, `useContar`, `Avisos` con
   «Deshacer»). Lo nuevo: `useFlipCajas` (la tarjeta viaja **entre columnas**) y, en F7, el trazo del gráfico de línea.

## Lo que cuesta esta decisión (Felipe la tomó sabiéndolo)

- **Un proveedor real que vende a los dos módulos existe dos veces** (RUC, cuenta, contacto): dos fichas que mantener.
- **La deuda con proveedores vive en dos lugares** y el **IGV crédito fiscal sale de dos libros**. Nadie ve «lo que debe CAYLA» ni el registro de compras
  completo sin una vista consolidada de solo lectura (**D-I**, abierta; recomendada).
- **Se duplica lógica financiera** ya resuelta en Compras (contado ⇒ pago en la misma transacción, vencimiento, faltantes, pagos). Se mitiga copiando las
  reglas de ADR-0035 y probándolas con los mismos casos.
- **A favor:** Producción avanza sin depender de ADR-0139 ni de las funciones de Compras, y sin riesgo de romperlas. Como `insumos` e `insumo_lotes` tienen
  0 filas, repuntar sus llaves al nuevo directorio hoy es barato.

## Lo que la base vuelve imposible (cuando esté construido)

- Un comprobante de Producción al contado sin su pago, o a crédito sin vencimiento.
- Recibir dos veces el mismo comprobante y abrir dos lotes (idempotencia por token).
- Consumir de un lote más de lo que tiene (`registrar_consumo_insumo`, ya verificada) o sobre una orden cerrada.
- Que un colaborador lea montos de insumos, comprobantes o pagos por la API directa.

## Alternativas descartadas

- **Producción como módulo padre de Compras** (la primera versión): mostraba las mismas pantallas y los mismos datos dos veces. Descartada por Felipe.
- **Una sola lista de proveedores vista por rubro + una sola factura registrada en Compras** (mi recomendación): no duplicaba proveedores ni deuda.
  Descartada por Felipe a favor de módulos con sus propios proveedores y comprobantes.
- **Columna `insumo_id` en `compra_items`:** ya no aplica; Producción no usa las tablas de Compras.
- **Receta de costo por modelo (`bom_items`):** murió con el corte V1→V2 y una receta manual envejece. Lo medido no miente.
- **Esperar a que se reconstruya Finanzas para Eficiencia:** bloquea D-31 indefinidamente; `gastos_taller` es migrable después.

## Consecuencias

- **Costo:** F4 (cinco PR) construye esquema y lógica financiera nuevos (proveedores, comprobantes, pagos, recepción); cada uno va solo, con prueba SQL en CI
  y dry-run antes de pegarlo.
- **Ganancia:** el costo real de cada prenda queda conectado de la factura de tela a la tienda, y el Resumen puede decir *qué decidir* con datos de
  Producción, Insumos e Inventario juntos.
- **Sin decidir:** D-I (consolidado de deuda e IGV); cuándo se reconstruye Finanzas (migrar `gastos_taller`); si algún día un colaborador del Taller registra
  comprobantes (hoy solo el líder).

## Actualización 2026-10-13: el Resumen dice la verdad sobre lo que decide

El análisis de `/pantalla` sobre `/produccion` (`docs/pantallas/produccion.md`, cumple su finalidad 5,0/10) encontró que el Resumen decidía por modelo con un ritmo sin
base visible y decía más de lo que sabía. Felipe ordenó las tareas #1 a #5; quedaron construidas sin migración:

- **Qué se ofrece para fabricar.** Solo lo activo, aprobado, no de prueba y de una familia que entra a los motores (`esProducible`; ADR-0270, ADR-0377 act. 2026-10-13).
- **La urgencia no miente.** Con 0 en tiendas dice «ya se agotó» (no «se agota en ~1 día»), «1 día» en singular, y entre agotados va primero el que más se vende.
- **El tope no corta en silencio.** Hasta 3 modelos por producir tienen tarjeta; con más, UNA los junta y nombra a los 3 más urgentes. Ninguna clase pasa de 3 tarjetas y el
  total sigue en 7; lo que no cabe se cuenta («10 asuntos · se ven 4», «Y 6 entregas más, que no caben aquí»). `resumenDeDecisiones` devuelve `ocultas` y `total`.
- **Cada cifra dice su base.** «Se vende X por semana (N ventas en 30 días)»; con 2 o menos, «poca base» (`UMBRAL_POCA_BASE_VENTAS`, `lib/inventario-reglas.ts`, elegido por Felipe).
  La base cuenta solo las ventas de las sedes con las que se midió el ritmo (`DemandaVariante.ventasBase`). Solo avisa: no cambia estados ni esconde tarjetas.
- **La tela no se subestima.** El rendimiento medido se calcula para los modelos que se ofrecen **y para todo producto con una orden** (`productosParaRendimiento`): una orden abierta de un modelo que ya no se ofrece (descontinuado, de prueba, familia apagada) igual va a cortar tela, y sin su rendimiento «¿Alcanza la tela?» habría pedido menos de lo real. Lo cazó la revisión independiente del código, no una prueba.
- **El modelo se reconoce.** Foto de cada modelo (la del primer color con foto, como Catálogo) o, sin foto, el ícono de su categoría sobre su color (ADR-0333), en cada fila
  y tarjeta. La tabla se lee a 1024 px (nombre a dos líneas; «En prod.» entre 1024 y 1279 px solo en la insignia) y la fila tiene el anillo de foco del sistema (ADR-0351).

**Lo que sigue sin hacerse** (el análisis lo ordena, falta el OK de Felipe): el «% de ventas sin prenda», que exige leer la cola de ventas sin registrar de otro módulo. Lo que aquí figuraba
como pendiente (#6 a #9) se ordenó después: ver la actualización (b).

## Actualización 2026-10-13 (b): «Producir ya» compara lo que falta, y la unidad de decisión sigue siendo el modelo

Felipe ordenó las tareas #6 a #9 del mismo análisis (`docs/pantallas/produccion.md`).

- **«Producir ya» compara en vez de preguntar si existe una orden (#6).** Por cada talla y color: lo que falta para cubrir `DIAS_OBJETIVO_PRODUCCION` (30) días de venta es `ritmo × 30 − (tiendas + en camino + órdenes
  abiertas)`; de eso, lo que ya está hecho en el Taller se **traslada** y el resto se **produce** (`repartirFalta`, `lib/produccion-decision-reglas.ts`). `producir` es exactamente lo que sugiere «Nueva orden»
  (`sugerirVariante`): una sola cifra para las dos pantallas, y una prueba lo exige sobre una rejilla de combinaciones. Con 7 días de stock o menos y algo por fabricar el modelo queda en «Producir ya» aunque haya una
  orden: una de 1 prenda contra una falta de 30 no la apaga (la tarjeta dice «lo que ya se fabrica no alcanza (faltan 29)», nunca «no hay orden abierta» delante de una orden, y no cita la cantidad de la orden: con varias
  tallas no es lo que cubrió cada falta). Entre 8 y 30 días rige la misma idea para el estado: «Ya hay orden abierta» solo si las órdenes CUBREN lo que falta; si no, «Vigilar» (y la hoja muestra lo que falta). **DESCARTÉ** comparar sumando todo el modelo, porque lo que sobra
  de una talla no cubre la falta de otra: se compara por talla y color.
- **«Trasladar al piso» es un estado nuevo.** Si lo que falta ya está en el Taller no hay que fabricar nada: la fila y, con 7 días de stock o menos, una tarjeta llevan a Mover mercadería con el Taller de origen y las cantidades puestas
  (`urlLlevarATiendas`, el mismo contrato de «Siguiente paso: llevarlas a las tiendas», F8). Si el Taller cubre solo una parte, sigue «Producir ya» (con 7 días o menos; entre 8 y 30, «Vigilar») y la tarjeta nombra lo que hay en el Taller. Más de 3 modelos para trasladar se cuentan en «y N más».
- **«Se vendían y ya no hay en tiendas» solo avisa.** Una talla o color en 0 con más de `UMBRAL_POCA_BASE_VENTAS` ventas, dentro de un modelo que sí tiene stock, se nombra en su fila; **no cambia el estado ni crea tarjeta** (Felipe: «solo avisar»). Por eso, en un modelo que el Resumen aconseja no producir («Alcanza», «Sobrestock», sin ritmo) la
  hoja tampoco dice «hay que fabricar» ni ofrece «Abrir orden sugerida»: serían dos mensajes opuestos sobre el mismo modelo (`estadoPideFabricar`, lo halló la revisión independiente). Con poca base, ni la tarjeta ni la hoja
  dicen cuánto fabricar (sí lo que ya está en el Taller, que es stock que existe).
- **«Ver el modelo» (#8): la fila abre una hoja.** Tocar un modelo de «¿Qué producir?» abre `<Modal variante="hoja">` con su foto, lo que hay (tiendas, Taller, en camino, órdenes abiertas), lo que falta
  y, por color y talla, lo vendido en 30 días con «ya no hay» donde se vendió más de 2 veces y hoy no queda nada, y los totales por talla y por color; en gris, lo de 2 ventas o menos (poca base: conteos, no rankings).
  El stock va debajo, como dato secundario. La cabecera mide el ritmo con las tiendas donde se pudo medir y la matriz suma las de todas: si difieren, la nota al pie lo dice con los dos números. La matriz es una región con
  nombre y se alcanza con el teclado (se desplaza hacia el lado con muchas tallas). La orden y el traslado salen DE la hoja: la fila ya no es un enlace a «Nueva orden» (un clic más; Felipe lo eligió así) y las tarjetas de «Para decidir» siguen yendo directo.
  La hoja es solo de lectura. **DESCARTÉ** reutilizar la vista rápida de Catálogo (depende de lo que carga la grilla y del stock de la sede activa, que en Producción es el Taller) y abrirla por una ruta interceptada
  (repetiría las ~30 lecturas de la página por cada modelo). **Costo medido:** el dato de las hojas viaja con la página, ~1,2 KB por modelo; con 232 modelos y 1.898 variantes (más que las ~1.435 de producción) son
  267 KB sin comprimir y 18 KB con brotli (25 KB con gzip). Si el catálogo crece mucho, se recorta primero lo que cabe en la hoja (los colores sin venta), no se agrega una lectura.
- **«Abrir orden sugerida» dice la cantidad y la lleva (#9).** La tarjeta de «producir» agrega «Sugerido: 52 prendas (S 8 · M 16 · L 16 · XL 12)» —lo que falta fabricar, por talla— solo si el modelo tiene base
  (más de 2 ventas, `sugerenciaDeOrden`); con poca base el botón dice «Abrir orden» y la orden se abre vacía: no promete una cantidad que sería ruido (ADR-0346). Con base, el botón lleva `&sugerida=1` y «Nueva orden»
  llega con la matriz ya llena (`cantidadesInicialesDeNuevaOrden`, la función que usa el formulario al abrirse, con la misma cuenta de «Usar la sugerencia»; una prueba exige que lo que escribe coincida con la cifra de la tarjeta).
  La sugerencia se aplica UNA vez, a la apertura que vino por la URL: como la URL no cambia al cerrar ni al guardar, `OrdenesTablero` la descarta al cerrar y un «+ Nueva orden» posterior abre vacío. El parámetro es **opt-in**: `?nueva=` sigue siendo
  el contrato de siempre para Análisis y Nuevo producto, que no cambian. La matriz se llena al iniciar el estado del formulario y no en un efecto, así lo precargado es el punto de partida y cerrar sin tocar nada no
  pregunta «¿salir sin guardar?»; solo para el modelo pedido (nunca el primero de la lista), en una orden de producción y si la red respondió. La hoja «Ver el modelo» ofrece el mismo botón con la misma regla.
- **#7 decidida: la unidad es el modelo.** Lo que Producción fabrica es una orden de un modelo (`producciones.producto_id`), y la hoja «Ver el modelo» y la cantidad sugerida se construyen sobre él. El «hueco» (categoría × talla × familia de
  color) queda como la alternativa que el motor de demanda ya calcula para lo nuevo (ADR-0347) y que Felipe puede traer al Resumen cuando hable; el motor calla en una tienda mientras no cumpla las condiciones de ADR-0346 (14 días seguidos con ≥90 % de ventas con prenda y el piso cuadrado). **Se reabre si** el catálogo se parte en tantos modelos
  de pocas ventas que casi todos salen «poca base»: ahí el modelo deja de ser una unidad con la que se pueda decidir.
