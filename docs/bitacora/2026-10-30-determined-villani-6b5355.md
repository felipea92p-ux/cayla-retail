# 2026-10-30 · Los rojos intermitentes de las pruebas de CLAURE: la prueba ya no toma prestada una prenda del seed (rama determined-villani-6b5355)

- **Qué:** el 30-oct el CI se puso rojo en cuatro corridas seguidas de un PR que no tocaba nada de CLAURE, y cada vez
  en una suite distinta y en una tanda distinta (`claure-fuera-de-las-cifras`, `claure-perdidas-y-danadas` ×2,
  `claure-cuenta`). La causa no era el reloj ni el PR: **13 suites de CLAURE abrían su escena tomando prestada «la
  primera prenda que encontraran»** (`select va.id, va.producto_id from retail.variantes va order by va.id limit 1`) y
  le cambiaban el dueño a CLAURE. Pero `retail.variantes.id` nace con `gen_random_uuid()` y el seed inserta sus 49
  variantes sin id: «la primera» es una prenda DISTINTA en cada base, y cada tanda del CI levanta la suya. El propio
  seed deja, con fecha de hoy, 3 ventas, 1 cambio y 1 devolución aprobada con una prenda dañada, sobre 5 de sus 11
  prendas (28 de 49 variantes). Cuando el sorteo caía ahí, esa historia pasaba a ser «de CLAURE» y se sumaba a lo que
  la prueba medía. Ahora las prendas A (de CLAURE) y B (de CAYLA) **las crea la escena dentro de su transacción**
  (`scripts/pruebas/_prendas_de_prueba.mjs`), copiando categoría, tejido, patrón, marca, proveedor, temporada, color,
  talla, precio y costo de una prenda real.
- **Por qué así y no «elegir una prenda limpia»:** una prenda creada dentro de la transacción no puede tener historia
  POR CONSTRUCCIÓN. La alternativa —buscar una prenda sin ventas, sin cambios, sin devoluciones, sin apartados, sin
  pedidos web, sin movimientos…— es una lista que hay que acordarse de ampliar cada vez que nace una tabla con
  historia; la primera que se olvide devuelve el rojo intermitente. No se tocó ninguna función de la base: el
  descuadre estaba en la escena de la prueba, no en lo que la prueba vigila.
- **Verificado (con un control que falla antes y pasa después):** en una base privada (Postgres 17 de Homebrew en un
  puerto propio, 981 migraciones + seed; la base local compartida no se tocó) se barrieron los 49 sorteos posibles
  (`order by va.id limit 1 offset K`). ANTES: 40 de 147 corridas rojas, con los mensajes IDÉNTICOS a los del CI —
  `claure_cuenta` 10/49 (la fila extra `cambio||(sin cuenta)|1|0.00|-|-|f`, que es el cambio del seed),
  `claure_perdidas_y_danadas` 14/49 (`se esperaba 3|1 y salió 2|1`, que es la devolución dañada del seed) y
  `claure_fuera_de_las_cifras` 16/49 (`121.28|84.75` y `192.90|29.43|163.47|40.00`, que son las ventas del seed).
  DESPUÉS: 147/147 verdes. Las otras 10 suites de CLAURE con el mismo patrón también se barrieron (fallaban ~5 de 26
  sorteos cada una) y quedaron con el mismo arreglo y el mismo barrido en verde.
- **Dos pruebas más de que es el sorteo y no el reloj:** (a) `main` cae igual, con los MISMOS números (corrida
  41136130684, commit 708d411ba, 22:08 UTC: `121.28|84.75` y `192.90|29.43|163.47|40.00`), así que la causa no es
  ningún PR; (b) la corrida 41137391922 (commit 037c464c9) tiene dos intentos: el 1 falló en la tanda 2 y el 2 —un
  re-run del mismo commit, con el mismo reparto— pasó. Entre intento e intento no cambia el código ni el reparto:
  cambia la base, o sea el sorteo. Y el barrido corrió entre las 18:30 y las 19:30 de Lima, justo en el cruce
  19:00 Lima = 00:00 UTC, sin que la hora moviera nada.
- **De paso:** `scripts/ci/pruebas-postgres-duraciones.json` pasó de 189 a 394 medidas (desde la corrida 41137549225,
  que corrió las 4 tandas completas). Las 19 suites de CLAURE y `pruebas:materiales` valían la mediana; con su
  duración real el reparto estimado pasó de 263 s a 338 s por tanda, que es lo que tardan de verdad.
- **Felipe se lleva:** un dato al azar en una prueba no es «ruido», es una prueba distinta cada vez. El seed le pone
  un id sorteado a cada prenda; cualquier prueba que diga «la primera que encuentres» está jugando a los dados con el
  CI. Una prueba se arma con lo que ella misma crea, no con lo que encuentra.
