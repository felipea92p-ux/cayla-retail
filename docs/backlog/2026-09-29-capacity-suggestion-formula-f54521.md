## 📐 Sugerencia de capacidad del piso — diseño, nada construido (2026-09-29, ADR-0208 decisión 12 / bloque 6) — rama `claude/capacity-suggestion-formula-f54521`

**Estado:** diseño para que Felipe lo compare con el piso real de TRU. Sin código, sin migración. El skill `/rigor` aún no está en
`main` (vive en `claude/habilidades-propias-12a8fb`); se leyó de ahí y se aplicaron sus cinco lentes. Cambiaron el diseño la 4
(estadística: censura y contracción), la 5 (resultado tipado) y la 3 (reparto en proporción, no celda por celda); la 1 y la 2 no.

- [x] **Hallazgo que cambia el planteamiento.** Las dos fuentes de la idea original no existen hoy.
  - *Prendas exhibidas la temporada equivalente del año anterior:* el ERP tiene un día de historia (consulta de solo lectura,
    2026-09-29: 9 productos, 3 ventas desde el 28-sep, 39 movimientos desde el 29-sep, 23 bajadas desde el 26-sep). En TRU hoy
    hay 3 camisas en piso y en el almacén 20 jeans, 12 polos y 2 camisas. Esa cifra existiría recién en sep-2027, y aun así
    repetiría la asignación del año pasado con sus errores.
  - *Ritmo de venta × tiempo en el piso:* el ritmo se puede medir, pero el tiempo en el piso es justo lo que Frescura va a tardar
    semanas en medir (ADR-0208, «Números»). Usar el tiempo *observado* es circular: un piso sobrecargado devuelve una sugerencia
    sobrecargada.
- [x] **Una sola fórmula.** Ley de Little: `prendas colgadas = prendas que salen por semana × semanas que se quedan`. Es una
  identidad para un piso estable, no un estimador. La historia directa (el método A) deja de ser segunda fuente y pasa a control
  cruzado: si el conteo directo y λ·W no cuadran, hay bajadas sin registrar (y baja la confianza del registro de la sede).
  1. **λ** = ventas *de piso* de la categoría en la sede en 8 semanas (sin las «a pedido», D-40), **contraída**: `λ̃ = (n + m·λ₀)
     / (T + m)`, con λ₀ = (ventas de la sede) × (parte de la categoría en las 3 sedes) y m = 28 días. Con n ventas el error es
     ≈ 1/√n: n = 10 → ±32 %, n = 20 → ±22 %; por eso los umbrales son los mismos 10 / 20 del ADR (decisión 6 del 2026-09-26).
  2. **W objetivo** = tiempo medio de permanencia *censurado*: el área bajo la curva de Kaplan-Meier de la categoría en la sede
     hasta su P90 (la curva que Frescura ya calcula, con su mismo respaldo de 3 sedes). Se descartó el promedio de lo vendido:
     en la simulación del propio ADR baja de 55 a 31 días (−44 %) porque deja fuera lo que sigue colgado. Se descartó el P50/P75
     porque Little usa la media, no un percentil.
  3. **Necesidad** `N_c = λ̃_c · W_c` en prendas. Categoría con `N` pero sin ventas en *esta* sede y con ventas en otra
     (traslado por novedad, ADR-0208 decisión 9): λ₀ da el punto de partida.
  4. **Reparto** `K_c = G_s · N_c / Σ N` con el método del resto mayor, para que la suma sea exactamente `G_s` (redondeo una
     sola vez, al final). `G_s` = el total físico de ganchos/frentes del piso de la sede: **3 números, no 540 celdas**.
     Si todas las categorías tuvieran el mismo W, este reparto es el «índice perchas ÷ venta» de la maqueta
     (`frescura-del-piso.html`, capítulo 7): la fórmula lo generaliza, no lo reemplaza.
  5. **Holgura** `G_s / Σ N`: cuánto de lo que pide la venta cabe. > 1 sobra piso; < 1 falta.
- [x] **Contrato (3 líneas).** Promete: para (sede, temporada, categoría) devuelve `{ ok: true, prendas, unidad, confianza }` o
  `{ ok: false, motivo }`; nunca 0 ni `null`. Asume: la lectura de Frescura, las ventas de piso y `G_s`. Motivos:
  `categoria_nueva` (sin ventas en ninguna sede), `pocos_datos` (< 10 ventas en 8 semanas tras la contracción),
  `sin_total_de_sede`, `registro_debil` (confianza de registro «Pocos datos»). En pantalla: campo en blanco + una nota con el motivo.
- [x] **Unidad.** No es «ganchos» o «frentes» para todo: cada categoría declara su **medio** (colgada → 1 gancho = 1 prenda;
  doblada → 1 frente = una pila de `prendas_por_frente`). La cuenta se hace en prendas y se convierte al final. El plan se
  muestra en esa unidad. m² sigue descartado (ADR-0208 decisión 12).
- [x] **Estados imposibles (Lamport) que el esquema debe negar:** (1) Σ capacidad de una sede-temporada > `G_s`; (2) capacidad 0
  para una categoría que se vende (la ausencia de fila = «no se exhibe», explícito); (3) dos filas para la misma
  (categoría, sede, temporada); (4) la unidad guardada por fila (sale de la categoría); (5) una sugerencia guardada como si fuera
  decisión: la sugerencia se calcula al abrir y **no se guarda**; solo se guarda lo que el líder decide.

### Ejemplo con TRU (para comparar con el piso; es la forma de la fórmula, no su prueba)

Ventas de Alegra, 1-jul → 29-sep-2026 (13 semanas), **toda CAYLA** (TRU + AQP), solo líneas con nombre de categoría (cota
inferior), × 0,38 (la parte de TRU en soles: S/ 61.607 de S/ 161.875). 189 unidades quedan bajo el ítem genérico «Prendas Cayla»
y no se pueden asignar a ninguna categoría. W no está medido: se muestra un rango.

| Categoría (TRU) | Vendidas TRU / semana | Prendas colgadas si W = 4 / 8 / 12 sem | Parte del reparto entre las tres |
|---|---|---|---|
| Polos | 5,5 (≥ 187 en toda CAYLA) | 22 / 44 / 66 | 53 % |
| Camisas y blusas | 2,8 (≥ 97) | 11 / 22 / 34 | 27 % |
| Jeans | 2,0 (≥ 69) | 8 / 16 / 24 | 19 % |

Cómo compararlo: `W implícito = (ganchos o frentes reales de esa pared) ÷ vendidas por semana`. Si los tres salen entre ~4 y 12
semanas, el orden de magnitud aguanta; si jeans sale en 30 o más, o la pared tiene más de lo que la venta pide (candidata a
«Envejecida» en Frescura) o λ está subcontado (y se arregla contando bien en el ERP, no confiando en Alegra).

### Preguntas para Felipe (decisiones de negocio)

- [ ] ¿Polos y jeans de TRU se **cuelgan o se doblan**? (define el medio de cada categoría)
- [ ] ¿Cuántos ganchos / frentes tiene hoy cada una de esas tres paredes, y cuántos jeans vende TRU por semana a ojo?
- [ ] ¿Se admite un **mínimo de surtido** por categoría (que la sección se vea completa aunque venda poco)? La fórmula sola
  achica lo lento; el mínimo es una decisión del líder, no del cálculo.
- [ ] Umbral de confianza para mostrar la sugerencia: propuesta «Aceptable» (es un borrador que el líder edita); «Sólido» queda
  para lo que mueve plata sola (traslado, rebaja).

---

### Actualización 2026-09-30 — respuestas de Felipe y lo que cambió la investigación

Informe completo, con el veredicto de un refutador por hallazgo: `docs/investigacion/2026-09-30-espacio-y-mix-por-categoria.md`.

**Decidido por Felipe (preguntas del 30-sep):**
- [x] **Unidad del plan: prendas** (es lo que ya cuenta el stock de piso, así que plan y realidad se comparan solos). Colgado o doblado
  es «ultra variado y volátil»: no se modela, y eso descarta ganchos y frentes como unidad. Ajusta la decisión 12 del ADR.
- [x] **Nivel:** por categoría, solo las activas en la sede. **Temporadas:** dos (Primavera-Verano y Otoño-Invierno).
- [x] **Alcance del mix:** solo espacio por ahora, con nombre neutro («mix») para que Compras y Producción lo lean después.
- [x] **m² de sala:** TRU 20, AQP 60, LIM 6 (un stand). Su idea: mix % por categoría × tamaño de la tienda, con ajustes por sede.
- [x] **Arranque de una sede nueva:** una cifra simple («1 es suficiente para un aproximado»). Su hipótesis: unas 20 prendas por m³.
- [ ] **Quién fija el % de cada categoría:** «no sé, hay que investigar». La investigación responde abajo; falta su OK.

**Lo que cambia el diseño (verificado por refutadores salvo donde se dice):**
1. **Total de la sede = m² de sala × 12 prendas** (rango 8 a 16; arrancar bajo). TRU 240, AQP 720, LIM 72. El m³ del *local* no sirve:
   la altura del techo no cambia cuántas prendas caben, y con techo de 3 m daría 60 por m² (4 a 9 veces lo que se observa en marca
   media). Sí sirve para el volumen de un *mueble* de colgado lleno (18 a 33 por m³). El 12 sale de una consultora colombiana y de
   blogs: es un punto de partida débil hasta que Felipe cuente TRU y AQP (ofreció hacerlo). El ADR registra que al 27-sep entraron
   211 prendas al piso de TRU (≈ 10 por m²); la purga del 28-sep borró esa historia, así que no se puede volver a medir.
2. **Mi fórmula de Little cambia de oficio.** Antes era «el reparto». Ahora es **«lo que sostiene su venta actual»** (prendas de piso
   ÷ venta semanal = semanas de cobertura): un control y un mínimo por categoría, no la regla de asignación. Razón: repartir el piso
   según ventas repite el pasado, porque las ventas ya reflejan el espacio que tuvo cada categoría (Van Dijk 2004: 0,85 con datos
   históricos contra ≈ 0,2 corregido), y «% de piso = % de ventas» supone elasticidad 1 cuando la medida es ≈ 0,17 a 0,21 (Eisend
   2014; casi todo supermercado, no moda).
3. **El mix es una decisión con barandas.** Familias (6 a 8) y rol de cada una por juicio de Felipe; mínimo de presentación por
   familia (curva de tallas clave completa); el resto proporcional a las ventas propias de la sede corregidas por los días sin
   stock; una reserva pequeña para probar categorías; cambios acotados por ciclo. Con dos sedes y un stand no hay estadística que
   aplicar: es juicio informado, y el sistema debe decirlo.
4. **Lo que el ERP ya mide solo, sin registro manual:** el espacio real por categoría (stock de piso por fecha, reconstruible
   repasando `movimientos`) y los días con curva de tallas rota (tallas clave de `categoria_tallas.habitual`). Lo único manual es
   en qué pared o mueble está cada categoría: son las «zonas de exhibición» que el ADR dejó fuera de los bloques (paso 12).

**Decidí:** total = m² × densidad editable; mix objetivo decidido por Felipe por familia y rol; Little queda como control.
**Descarté:** repartir en proporción a las ventas como regla (repite el pasado) y las 20 prendas por m³ del local.
**Se rompe si:** CAYLA dobla mucho (jeans, polos): lo doblado cabe más por metro que lo colgado y el 12 se queda corto; o el stand de
LIM (mucha pared, sin pasillo) rinde el doble de prendas por m² que el promedio.

**Pendiente de Felipe:** densidad de marca (media ≈ 12, premium ≈ 6, moda rápida 20 a 25 por m²); reserva de prueba (10 %
propuesto, sin fuente); qué mostrar en LIM con 72 prendas y 45 categorías; si la encargada de sede ajusta el mix sugerido; y
reescribir la decisión 12 del ADR-0208 («no m²») cuando cierre lo anterior.

### Segunda ronda de respuestas de Felipe (2026-09-30)

- [ ] **Densidad: sin fijar, espera el conteo de TRU** (Felipe ya lo pidió). Su estimación es de hasta 30 prendas por m²: TRU
  600 a 900 (30 a 45 por m²) y LIM unas 180 en 6 m² (30 por m², que es la misma intuición, no un dato independiente). La
  investigación da 12 (8 a 16) para marca media y 30 a 40 para bajo costo. La diferencia pesa: para una tienda nueva de 40 m² son
  480 prendas contra 1.200 a 1.800. El conteo debe traer: total, colgadas y dobladas por separado, y si se puede, por categoría
  (eso da además el mix real de hoy).
- [x] **El encargado de sede puede ajustar el mix sugerido**, como sugerencia editable con motivo registrado. Falta decidir qué rol
  lo puede hacer (ADR-0161; «solo das lo que tienes»).
- [ ] **Reserva de prueba: no es un % plano.** Felipe: «depende de la categoría, hay categorías más relevantes que otras». Eso es el
  *rol de categoría* (destino, rutina, ocasional o estacional, conveniencia) del informe: el rol lo decide él por juicio y se
  verifica con datos propios; la exploración pasa a ser un rol más. Pendiente: sus categorías destino y qué tan a fondo investigar.
- [ ] **Stand de LIM sin decidir.** Con unas 180 prendas (estimación de Felipe) caben unos 2,5 veces más estilos que con las 72 de
  la base; la pregunta de fondo (solo las familias que llegan al mínimo, o un poco de todo) sigue abierta.
- [x] **Base para familias ya existe:** `categorias.familia` tiene 6 valores sobre 42 categorías activas (indumentaria 18, accesorios 8,
  calzado 7, bisutería 4, papelería 4, belleza 1). Sirven de primer nivel, pero indumentaria es demasiado gruesa para asignar roles:
  hay que partirla (por ejemplo, parte de abajo, parte de arriba, abrigos, vestidos y conjuntos). La partición y los roles los
  decide Felipe; el sistema solo puede proponer el borrador.

### Tercera ronda (2026-09-30)

- [x] **Categorías destino de CAYLA (Felipe):** Jeans, y Polos, tops y blusas. (Se leyó «Jeans» como jeans solos, sin pantalones, faldas ni
  shorts; por confirmar.) El resto de las 42 categorías activas aún no tiene rol.
- [x] **Stand de LIM:** se muestran solo las categorías destino y las que lleguen al mínimo de presentación; el resto, por pedido o desde
  otra sede.
- [ ] **Investigación pedida:** cómo deciden las grandes casas qué categorías son más relevantes (Zara, Pull&Bear y Bershka; LVMH;
  Ralph Lauren; moda masiva tipo H&M, Mango y Uniqlo; y el método general), «sobre todo estos». Escala elegida por Claude, no por
  Felipe: 5 investigadores en paralelo y 1 revisor escéptico (6 agentes), sin la verificación uno a uno de la primera ronda. Resultado
  esperado en `docs/investigacion/2026-09-30-categorias-relevantes-grandes-marcas.md`.

### Cuarta ronda: grandes marcas (2026-09-30)

Informe revisado: `docs/investigacion/2026-09-30-categorias-relevantes-grandes-marcas.md` (5 investigadores y 1 revisor escéptico).

- [x] **Hallazgo central:** ninguna casa grande publica cómo decide que una categoría es «destino», ni los metros de piso por categoría, ni qué categoría trae a la
  clienta nueva. Lo que publican es peso en ventas (Levi's: lo que no es jean, 36 % de ingresos FY2025; Lacoste, por su CEO: el polo bajó de más de un tercio a ~20 % en
  diez años; Ralph Lauren, por Fortune: ~70 % del surtido se repite). Son declaraciones, no reglas para copiar.
- [x] **Consecuencia para el diseño:** «Jeans, y Polos/tops/blusas son destino» queda como **hipótesis de Felipe, válida como punto de partida**, y se contrasta con datos
  propios, por sede y sin promediar (3 sedes son 3 casos, no una muestra): % de tickets con la categoría; categoría de la primera compra de cada clienta y recompra a
  90 días; prendas por ticket; rotación y margen corregidos por los días con curva de tallas rota; y «pidió y no había».
- [x] **Lo que el ERP ya puede medir hoy (columnas verificadas en producción):** `ventas.cliente_id` y `ventas.ubicacion_id`; `venta_items.variante_id`, `subtotal` y
  `costo_unitario` (margen por categoría vía producto); `movimientos` (rotación y días sin stock). Las tallas clave vienen de `categoria_tallas.habitual` (no re-verificado hoy).
- [x] **«Pidió y no había» YA EXISTE** (corrección: una primera versión de este documento dijo que no). D-79 del 2026-09-21, ADR-0152, tabla
  `pedidos_no_atendidos` y RPCs `registrar_pedido_no_atendido` y `marcar_pedido_no_atendido_resuelto` (migración `20260922190000`), botón en el Punto de
  Venta (`components/punto-de-venta/AnotarNoHabia.tsx`) y pantalla `/pedidos-no-atendidos`. Guarda producto o descripción libre, talla, clienta y si se
  resolvió; en producción hay 1 fila al 30-sep. Falta saber si el equipo lo usa. Lo que no existe es «¿qué venías a buscar?» (el motivo de la visita).
- [x] **La clienta en caja YA está decidida por el club** (corrección: no era una decisión abierta de este diseño): `docs/datos/DECISIONES-2026-09-26-clientas.md`
  G.6 y `DECISIONES-2026-09-29-club-clientas.md` CL-27. El DNI de la boleta se guarda en `comprobantes.cliente_num_doc` (3 de 22 comprobantes hoy) pero **no crea
  ficha ni liga la venta** (`ventas.cliente_id` vacío en las 21 ventas): la ficha la crea el «sí» al club, y al unirse se ligan sus boletas anteriores con ese
  documento. Consecuencia: primera compra y recompra por categoría solo cubrirán a las socias del club (sesgo conocido) y dependen de que ese módulo avance.

### Quinta ronda (2026-09-30)

- [x] **Destino «Jeans»** = la categoría Jeans (pantalones). Las faldas y los shorts de denim se registran en su propia categoría y el denim va en el material
  (`productos.tejido_id`); no son destino.
- [ ] **Conteo de TRU: 600 a 750 prendas** (cifra que le dieron a Felipe hoy) = 30 a 37,5 por m² con 20 m². Por confirmar si es solo piso de venta o incluye el almacén
  de la tienda. Es de 2,5 a 3 veces la base de 12 de las consultoras. Felipe aclaró que es solo el piso de venta y que **allí no hay nada doblado**: todo cuelga, así que el 12 no se
  rompió por «doblado» sino porque TRU cuelga muy apretado (600 a 750 prendas son 30 a 37 m de riel a 20 por metro, en 20 m²: faltan los metros lineales para calibrarlo). Cruce muy aproximado con las ventas de jul-sep (≈ S/ 52.700 sin IGV a ≈ S/ 48 por prenda ⇒ unas 85 prendas por semana en TRU): cobertura de 7 a 9 semanas,
  dentro del rango de 4 a 12 que se usó como hipótesis. El precio medio es un supuesto: frágil.
- [ ] **Densidad para una sede nueva:** propuesta 30 por m² (extremo bajo del conteo de TRU). AQP (60 m²) sin contar: una tienda más grande suele tener más pasillo y
  menos densidad. LIM (stand) queda en la estimación de Felipe, 30 por m² (~180 prendas), sin dato.

### Sexta ronda (2026-09-30 / 2026-10-01)

- [x] **El conteo de TRU es solo piso de venta y todo cuelga.** Densidad de arranque para una sede nueva: **30 por m²** (Felipe aceptó la recomendada).
- [ ] **«Pidió y no había»: hay que avisarle al equipo de TRU** (no lo conocen; 1 pedido en producción). Dónde sale: en el modal de talla del Punto de Venta cuando la talla que
  pide la clienta no se puede cobrar (botón «Anotar que no había», `components/punto-de-venta/AnotarNoHabia.tsx`), y en `CambioSalidas.tsx`. **Hueco:** guarda solo el texto
  «referencia · color» y no pasa `p_producto_id`, aunque la función lo acepta (`registrar_pedido_no_atendido(p_ubicacion_id, p_producto_id, p_descripcion_libre, p_talla,
  p_clienta_id, p_motivo, p_razon)`): sin el producto no hay categoría y el indicador por categoría no se puede leer. Cambio chico en `PuntoDeVenta.tsx` (toca Vender: se prueba a 375 px).
- [x] **ADR escrito como Propuesto:** `docs/adr/0329-capacidad-del-piso-total-por-m2-mix-por-roles-y-control-por-cobertura.md` (número provisional; `origin/main` llega a 0294 y tiene
  dos 0293). Falta apuntar la actualización en la decisión 12 de ADR-0208 y reservar el número en `SESIONES-ACTIVAS.md` al fusionar (esta rama está atrasada respecto a `main`).
