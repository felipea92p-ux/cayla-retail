# ADR-0542 — El stock de Tienda LIM se parte por dueño: CAYLA o CLAURE lo decide quien opera

**Estado:** aceptada · **obra de 9 actividades, la 1 construida en local** (migración `20261027222000`, **solo en la base local; nada en producción sin el OK de Felipe**) · **Fecha:** 2026-10-27 · **Decidió:** Felipe · **Reemplaza** la regla «en Lima manda la marca» de ADR-0532 (Caja, Historial y Movimientos se reconectan al dueño real en la actividad 8) · **Sigue a** ADR-0463 (empresas), ADR-0505 (CLAURE solo en Lima)

## Contexto

Hasta el 2026-10-26 la empresa de una prenda en Lima la decía su ficha (`productos.empresa_id`, ADR-0463) y, desde ese día, su **marca**
(ADR-0532: marca CAYLA = CAYLA, todo lo demás = CLAURE). Las dos reglas fallan por lo mismo: **la prenda no es de nadie, las unidades sí**.
Datos de producción del 2026-10-27 (solo lectura):

- De 475 prendas activas de CAYLA, **26** llevan la marca «CAYLA»; 316 llevan marca de proveedor (Strend, Krisstell, Miramhe…) y 133 no
  llevan marca. Con la regla por marca, todo lo que CAYLA revende y llega a Lima cuenta como CLAURE.
- De los S/ 435 que Caja e Historial contaban como CLAURE en Lima, **S/ 317 (73 %)** eran de prendas que el catálogo registra como CAYLA.
- Dos pantallas decían cosas distintas de la misma prenda: Vender pintaba la insignia por la marca (`catalogo-v2.ts`) y Catálogo ▸ Productos,
  la etiqueta de precio, el filtro «Tienda» y la tienda online, por la ficha.
- «Sin marca» (opcional al crear, ADR-0283) se volvía CLAURE en silencio y la ficha no se corregía sola al editar la marca.

Felipe (2026-10-27): la regla es un **botón** que marca la persona que opera, **al crear la prenda o al ingresar o ajustar su stock en
Tienda LIM**; la marca y el proveedor no cuentan. Y eligió, con sus costos a la vista, que **una misma prenda pueda tener a la vez
unidades de las dos empresas** (el stock de Lima se parte por dueño), que las 27 prendas con stock en Lima arranquen con el dueño con
que se dieron de alta, y que las ventas del 23 al 27-oct se **rehagan** con la regla nueva (CLAURE bajaría de S/ 435 a unos S/ 118).

## Decisión

**1. El modelo: solo se guarda lo que NO es de la casa; CAYLA es el resto.** `stock_dueno` (variante, sede, sububicación, empresa) guarda
las unidades de CLAURE; las de CAYLA son siempre `stock.cantidad − Σ stock_dueno.cantidad`. «Los dueños suman el stock» se cumple **por
construcción**: no hay dos cifras que puedan separarse (principio 2). Todo el stock que ya existe, y el que siembran las 33 pruebas que
escriben `stock` directo, es de CAYLA por defecto. `movimientos.empresa_id` guarda de quién son las unidades de cada movimiento en una sede
con dos empresas (en las demás, vacío = CAYLA): es el libro del que saldrán Caja, Historial y Movimientos
(`coalesce(m.empresa_id, productos.empresa_id)` sirve también para el historial anterior).

**2. `stock` y `fn_aplicar_movimiento` no se tocan (principio 1).** No existe un disparador que aplique el stock: `fn_aplicar_movimiento` es
una función que cada RPC llama a mano tras insertar el movimiento (69 llamadores). El dueño se resuelve en un disparador `BEFORE INSERT`
sobre `movimientos` —el único punto por el que pasa todo cambio de stock, hoy y mañana—, el mismo patrón de ADR-0505 y la cuarentena.

**3. La regla del disparador (solo en una sede donde operan dos empresas, `fn_sede_con_dos_empresas`):**
- **Entra stock** (entrada, ajuste +, traslado que llega): el dueño que traiga el movimiento (`empresa_id`); si no trae, **transitorio**, el de
  la ficha (`fn_dueno_de_entrada_sin_elegir`) hasta que cada pantalla pregunte. Un traslado que llega desde otra sede entra como CAYLA.
- **Sale stock** (venta, traslado, apartado, ajuste −): el dueño elegido, o el **único** que tiene unidades disponibles; si hay de los dos,
  se rechaza con «elige de cuál es» (hint `elegir_dueno`). La base nunca adivina de quién era lo que sale.
- **CLAURE no sale de Lima**, ahora por unidad: un traslado a una sede donde su empresa no opera solo lleva unidades de las empresas que
  operan allá; si lo único que alcanza es de CLAURE se rechaza y dice cuántas sí pueden ir (hint `empresa_fuera_de_sede`).
- Un dueño elegido que no opera en la sede se rechaza. Si el stock **total** no alcanza, el disparador se aparta y habla
  `fn_aplicar_movimiento` con su mensaje de siempre.

**4. La red al cierre.** Dos disparadores de restricción diferidos (`stock_cuadra_con_dueno`, `stock_dueno_cuadra_con_stock`) revisan, al
terminar la transacción, que lo de CLAURE no pase del stock de su fila (ni lo apartado de lo apartado) y que solo haya reparto donde operan
dos empresas. Atrapa lo que el disparador no puede ver: varias filas de un mismo `INSERT` antes de que se aplique el stock.

**5. La carga inicial** escribe en `stock_dueno` las unidades de las fichas de CLAURE (`productos.empresa_id`, Felipe 2026-10-27); idempotente.

**6. La lectura de la web.** `fn_stock_por_dueno(sede)` devuelve solo las prendas con unidades de alguien que no es la casa (una prenda toda de
CAYLA no dice nada; también la mantiene corta: PostgREST corta en 1.000 filas sin avisar) y sin la cuarentena, como `fn_existencias`.
Existencias dice **«De quién es: CAYLA 3 · CLAURE 2»** en el panel de la talla, con las insignias del sistema (CAYLA en tinta, CLAURE en pizarra).

## La obra (9 actividades, aprobadas por Felipe el 2026-10-27, una por una con `/construir`)

1. **El libro por dueño + Existencias** — *hecha, en local* (esta migración, `lib/stock-por-dueno*.ts`, `PanelTalla`).
2. Ingresar y ajustar stock en Lima con el botón. 3. Nuevo producto en Lima con el botón por stock inicial (se quita la lógica por marca).
4. Recibir mercadería y traslados con el dueño. 5. Vender, Apartados y pedidos web (la salida toma el dueño de la unidad). 6. Devoluciones
y Cambios (vuelve al dueño de la venta original). 7. Contar en Lima por dueño. 8. Caja, Historial y Movimientos leen el dueño real y se
rehace el historial. 9. Cierre: `/chaos`, guías, esta decisión corregida donde haga falta, backlog y volcado.

**Nada va a producción hasta cerrar la 8**, salvo que Felipe pida otra cosa: con el dueño transitorio, una pantalla que todavía no pregunta
sigue funcionando, pero una venta de una prenda con unidades de las dos empresas se rechazaría hasta la actividad 5.

## Alternativas descartadas

- **Un solo dueño por prenda y sede** (el «No, un dueño a la vez» que se le ofreció): no tocaba el núcleo, pero obligaba a mantener dos fichas
  de la misma blusa (el origen de la confusión de Becky/Broana). Felipe eligió partir el stock.
- **Una fila por dueño, también para CAYLA:** permite que las filas no sumen el stock, y 33 pruebas siembran `stock` directo (en Lima serían
  «sin dueño»). Guardar solo lo que no es de la casa lo vuelve imposible.
- **Colgarlo de `fn_aplicar_movimiento`:** 69 llamadores y no es un disparador; reescribirla toca el corazón del inventario.
- **La marca como criterio** (ADR-0532): CAYLA revende 316 prendas con marca ajena; la marca no es el dueño.
- **Un campo en la prenda o en el movimiento sin partir el stock:** no dice de quién es lo que queda en el piso.

## Lo que se rompe si…

- **Una sede pasa a tener dos empresas** (`empresa_sedes`) con stock ya cargado: sin repetir la carga inicial de esa sede, todo cuenta como
  de CAYLA. La carga se puede volver a pegar sin riesgo.
- **Una sede deja de tener dos empresas** con unidades de CLAURE en `stock_dueno`: el cierre lo rechaza. Antes, vender o llevar esas unidades.
- **Alguien edita `stock` a mano** bajando una fila por debajo de lo de CLAURE: el cierre de la transacción la rechaza.
- **Se corre `recalcular_stock()`** (mantenimiento, nadie la llama): no reconstruye `stock_dueno`; el cierre fallaría fuerte.
- **Una pantalla que aún no pregunta el dueño** vende, aparta o ajusta una prenda con unidades de las dos empresas: se rechaza con «elige de
  cuál es». Es el comportamiento buscado, pero por eso nada va a producción antes de la actividad 8.
- **Un alta vieja de una prenda de CLAURE** (`crear_producto_con_empresa` crea la prenda como CAYLA y después le pone la empresa): su stock
  inicial se libra como CAYLA hasta la actividad 3, que pasa el dueño al crearla.
- **Dos transacciones mueven en sentidos opuestos las mismas filas** y una función toma `stock` en otro orden que el disparador: Postgres
  aborta una con `40P01` (falla segura).

## Hallazgos de esta actividad (no estaban en la lista)

- **La migración se podía abortar una venta real.** Probada con otras pruebas corriendo a la vez dio `deadlock detected` en el `create
  table` (sus llaves piden candado sobre `variantes`, `ubicaciones`, `empresas` y `sububicaciones`). Ahora toma **todos** sus candados de una
  vez y con `NOWAIT`, reintenta hasta 15 s y, si la base no se desocupa, no aplica nada: nunca espera con algo en la mano.
- **La batería completa de Postgres tumba el Postgres 17.6 local** (aarch64): las 24 pruebas de la tienda web que ejecutan
  `grant tienda_web to current_user with set true` dan *Segmentation fault* y reinician el servidor, cortando las conexiones de todas las
  sesiones que comparten la base. No es de esta obra; queda anotado en el backlog.

## Verificación

- `pnpm pruebas:stock-dueno` — **29/29**, Postgres local, cada caso en ROLLBACK, con la migración aplicada dentro: entradas, ajustes, ventas,
  traslados (a otra sede, a Lima, dentro de Lima), apartados y liberaciones de un dueño elegido; los rechazos con su hint; Trujillo sin cambio; la
  red al cierre (tres formas de armar un descuadre); la carga inicial; la migración pegada dos veces; los permisos.
- Web: `lib/stock-por-dueno-reglas.test.ts` (11), y siguen en verde la paridad con el CI, las guías, las piezas únicas y los colores
  (265 pruebas en 7 archivos); tipos, lint y Knip limpios.
- Navegador (local, una prenda con 3 de 8 unidades de CLAURE, escrita solo durante la prueba y borrada después): el panel de «Negro XS» dice
  «De quién es: CAYLA 5 · CLAURE 3» y suma las 8 del almacén; «Azul marino XS» (todo de CAYLA) no dice nada; en oscuro y a 375 px se lee y
  cabe; Trujillo carga sin la línea y sin errores.
- **No verificado:** la migración en producción (no se ha pegado), un alta o una venta completas por la pantalla con las dos empresas (las
  pantallas aún no preguntan el dueño: actividades 2 a 7) y el reparto de dinero (actividad 8).
