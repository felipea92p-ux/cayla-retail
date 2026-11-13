# ADR-0542 — El stock de Tienda LIM se parte por dueño: CAYLA o CLAURE lo decide quien opera

**Estado:** aceptada · **las 9 actividades construidas** · migraciones `20261027222000` y `20261028153000` · **Fecha:** 2026-10-27 (obra) · **Decidió:** Felipe · **Reemplaza** la regla «en Lima manda la marca» de ADR-0532 (también su lectura en Caja, Historial y Movimientos) · **Sigue a** ADR-0463 (empresas), ADR-0505 (CLAURE solo en Lima)

## Contexto

Hasta el 2026-10-26 la empresa de una prenda en Lima la decía su ficha (`productos.empresa_id`, ADR-0463) y, desde ese día, su **marca**
(ADR-0532: marca CAYLA = CAYLA, todo lo demás = CLAURE). Las dos fallan por lo mismo: **la prenda no es de nadie, las unidades sí**.
Datos de producción del 2026-10-27 (solo lectura):

- De 475 prendas activas de CAYLA, **26** llevan la marca «CAYLA»; 316 llevan marca de proveedor (Strend, Krisstell, Miramhe…) y 133 no llevan
  marca. Con la regla por marca, todo lo que CAYLA revende y llega a Lima contaba como CLAURE.
- De los S/ 435 que Caja e Historial contaban como CLAURE en Lima, **S/ 317 (73 %)** eran de prendas que el catálogo registra como CAYLA.
- Dos pantallas decían cosas distintas de la misma prenda: Vender pintaba la insignia por la marca y Catálogo ▸ Productos, la etiqueta de precio y
  la tienda online, por la ficha. «Sin marca» (opcional al crear, ADR-0283) se volvía CLAURE en silencio.

Felipe (2026-10-27): la regla es un **botón** que marca la persona que opera, **al crear la prenda o al ingresar o ajustar su stock en Tienda
LIM**; la marca y el proveedor no cuentan. Y eligió, con sus costos a la vista, que **una misma prenda pueda tener a la vez unidades de las dos
empresas** (el stock de Lima se parte por dueño), que las 27 prendas con stock en Lima arranquen con el dueño con que se dieron de alta, y que las
ventas del 23 al 27-oct se **rehagan** con la regla nueva (CLAURE bajaría de S/ 435 a unos S/ 118).

## Decisión

**1. El modelo: solo se guarda lo que NO es de la casa; CAYLA es el resto.** `stock_dueno` (variante, sede, sububicación, empresa) guarda las
unidades de CLAURE; las de CAYLA son siempre `stock.cantidad − Σ stock_dueno.cantidad`. «Los dueños suman el stock» se cumple **por construcción**
(principio 2). Todo el stock que ya existía, y el que siembran las 33 pruebas que escriben `stock` directo, es de CAYLA por defecto.
`movimientos.empresa_id` guarda de quién son las unidades de cada movimiento en una sede con dos empresas (en las demás, vacío = CAYLA): es el libro
(append-only) del que salen Caja, Historial y Movimientos.

**2. `stock` y `fn_aplicar_movimiento` no se tocan (principio 1).** No existe un disparador que aplique el stock: `fn_aplicar_movimiento` es una
función que cada RPC llama a mano (69 llamadores). El dueño se resuelve en un disparador `BEFORE INSERT` sobre `movimientos` —el único punto por el
que pasa todo cambio de stock—, el patrón de ADR-0505 y la cuarentena.

**3. Cómo llega la elección de la pantalla a la base: un encabezado**, el camino de `x-responsable` (ADR-0162). `x-dueno` = la empresa de todo lo que
mueve la llamada; `x-dueno-lineas` = `{variante: empresa}` cuando una venta mezcla dueños (`fn_dueno_de_la_llamada`). Ninguna de las 80 funciones que
escriben movimientos cambió. La cola sin conexión guarda el dueño en la operación y lo manda al subir; una venta encolada lo lleva en sus líneas.

**4. Qué elige la persona y qué se resuelve solo** (solo donde operan dos empresas; `lib/dueno-reglas.ts`, `ElegirDueno`, sin respuesta de fábrica):

| Operación | Quién decide el dueño |
|---|---|
| Ajustar stock (los dos modales), Nuevo producto (ficha y stock inicial), Llegó mercadería, Recibir envío (nuevo y antiguo) | La persona: «¿De quién es?» |
| Vender, Apartar | La persona, **solo por prenda con unidades de las dos**; con un solo dueño, la base toma al único |
| Cerrar un conteo | La persona, por línea: lo que apareció de más, de quién es; lo que faltó, de quién falta si hay de las dos |
| Devolución, cambio, venta anulada | **Solo**: vuelve al dueño de la línea vendida (la prenda nueva de un cambio sale del mismo dueño si hay duda) |
| Traslado que llega de otra sede / vuelve de uno anulado | **Solo**: es de CAYLA (CLAURE solo existe en Lima) |

**5. Las reglas del disparador:** una salida sin dueño elegido toma al **único** que tiene unidades disponibles; con unidades de los dos se rechaza
(«elige de cuál es», hint `elegir_dueno`); pedir más de lo que tiene un dueño se rechaza y dice cuántas hay; CLAURE no sale de Lima (un traslado solo
lleva unidades de las empresas que operan en el destino, hint `empresa_fuera_de_sede`); si el stock total no alcanza habla `fn_aplicar_movimiento` con su
mensaje de siempre. Un **ingreso** sin dueño que llega desde la app (hay `request.headers`) se rechaza; desde un proceso interno (script, SQL Editor,
prueba) vale la ficha, como antes del libro. Cuando nadie puede elegir, la duda se resuelve sin adivinar a escondidas: lo que se entrega de un apartado
hereda el dueño al que se le liberó en la misma transacción; soltar un apartado con duda sale primero de la casa; y quien llama sin ser personal de la
tienda (la tienda online) toma primero la casa.

**6. La red al cierre.** Dos disparadores de restricción diferidos revisan que lo de CLAURE no pase del stock de su fila (ni lo apartado de lo apartado)
y que solo haya reparto donde operan dos empresas: atrapan lo que el disparador no ve (varias filas de un mismo `INSERT`). Invariante `INV-23` de `/chaos`.

**7. Caja, Historial y Movimientos leen el dueño real** (`20261028153000`): `fn_dueno_de_la_linea` = el dueño del movimiento de la venta, o la ficha si la
venta es anterior al libro (así el historial se rehace, como pidió Felipe). Las tres lecturas por empresa se reescriben sobre ella y el filtro «Tienda» de
Movimientos se parcha con candado de huella (md5 antes y después, como 20261026234000). Se retiran `fn_empresa_de_prenda_en_sede` y `fn_marcas_de_empresas`,
y de la web `empresaPorMarca`. La insignia «CLAURE» de Catálogo/Vender vuelve a leer la ficha.

## Alternativas descartadas

- **Un solo dueño por prenda y sede** (el «No, un dueño a la vez» que se le ofreció): no tocaba el núcleo, pero obligaba a dos fichas de la misma blusa
  (el origen de la confusión de Becky/Broana). Felipe eligió partir el stock.
- **Una fila por dueño, también para CAYLA:** permite que las filas no sumen el stock, y 33 pruebas siembran `stock` directo.
- **Colgarlo de `fn_aplicar_movimiento`:** 69 llamadores y no es un disparador. **La marca como criterio** (ADR-0532): CAYLA revende 316 prendas con marca ajena.
- **Una función envoltorio por cada RPC** (`registrar_venta_con_dueno`…): 20+ firmas largas, varias con reemplazos anclados; el encabezado no toca ninguna.
- **Rechazar siempre una entrada sin dueño:** habría roto procesos internos y las 188 pruebas de Postgres que siembran stock en Lima.

## Lo que se rompe si…

- **Una sede pasa a tener dos empresas** con stock ya cargado: sin repetir la carga inicial de esa sede, todo cuenta como de CAYLA (se puede volver a pegar).
- **Una sede deja de tener dos empresas** con unidades de CLAURE en `stock_dueno`: el cierre lo rechaza. **Alguien edita `stock` a mano** por debajo de lo de CLAURE: idem.
- **Se corre `recalcular_stock()`** (nadie la llama): no reconstruye `stock_dueno`.
- **Una pantalla nueva que ingresa stock en Lima no manda `x-dueno`:** la base la rechaza con «elige si lo que entra es de CAYLA o de CLAURE» (es lo buscado).
- **Dos dueños con unidades de una prenda y una función de personal que apartó/vendió sin elegir:** «elige de cuál es». Los pedidos web los toma la casa; **decisión pendiente de Felipe:** que quien confirma un pedido web con prendas de las dos empresas elija de cuál sale.
- **Una venta con la misma prenda de dos dueños en el mismo ticket:** hoy viaja un dueño por prenda y venta; para vender una de cada una, dos ventas.
- **Una venta anterior al libro cuya prenda cambió de ficha después:** se lee con la ficha de hoy. **Un apartado de cada dueño sobre la misma prenda que se suelta de a uno:** sale primero el de la casa (los totales siguen cuadrando).
- **Dos transacciones mueven en sentidos opuestos las mismas filas** y una función toma `stock` en otro orden: Postgres aborta una con `40P01` (falla segura).

## Hallazgos de la obra (no estaban en la lista)

- **La migración 1 podía abortar una venta real.** Probada con otras pruebas corriendo dio `deadlock detected`. Ahora toma todos sus candados de una vez con
  `NOWAIT`, reintenta hasta 15 s y, si la base no se desocupa, no aplica nada.
- **La batería completa de Postgres tumba el Postgres 17.6 local** (aarch64): las 24 pruebas de la tienda web con `grant tienda_web to current_user with
  set true` dan *Segmentation fault* y cortan las conexiones de todas las sesiones. No es de esta obra; queda en el backlog.

## Verificación

- `pnpm pruebas:stock-dueno` — **43/43** (Postgres local, cada caso en ROLLBACK): entradas, ajustes, ventas, traslados, apartados y liberaciones; el
  encabezado; las reglas de duda; devoluciones, cambios y ventas anuladas; la red al cierre; la carga inicial; la migración pegada dos veces; los permisos.
- `pnpm pruebas:vendido-por-empresa` — **26/26** con la regla nueva (la suma de las empresas es el «vendido» del Historial; Caja cuadra con `fn_resumen_caja`; el filtro de Movimientos).
- Regresión: las 188 pruebas del CI que tocan stock, movimientos, ventas, traslados y conteos (sin las 24 que tumban el servidor), contra la base local con
  todo aplicado; cada rojo se repite con los disparadores apagados para ver si es mío. Ver el resultado final en la bitácora de la obra.
- Web: la suite completa de `apps/web`, tipos, lint y Knip en verde; guías interactivas con sus huellas revisadas.
- Navegador (local): Existencias de Lima dice «De quién es: CAYLA 5 · CLAURE 3», solo cuando alguien que no es la casa tiene unidades, en claro, oscuro y a
  375 px; «Ajustar stock» pide «¿De quién es?» y no deja guardar sin elegir; Nuevo producto vuelve a preguntar la tienda; Historial carga.
- **No verificado:** las migraciones en producción (se pegan al cerrar la obra), la fila con el selector dentro del ticket de Vender y de Apartados (la
  prenda de prueba local solo tiene stock en el almacén), los formularios de Recibir con una recepción real, y una carrera real de dos ventas del último
  CLAURE (los candados de fila lo cubren; no se corrió con dos conexiones que confirman).
