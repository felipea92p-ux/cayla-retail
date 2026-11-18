# 2026-10-30 · Los rojos intermitentes de las pruebas de CLAURE: causa confirmada, arreglo de `main` verificado sorteo por sorteo, y las duraciones del CI medidas (rama determined-villani-6b5355)

- **Qué pasaba:** el 30-oct el CI se puso rojo en una suite de CLAURE distinta en cada corrida —en un PR que no tocaba
  nada de CLAURE, pero también en `main`—, y el MISMO commit podía salir verde al re-correrlo. La causa:
  `retail.variantes.id` nace con `gen_random_uuid()` y el seed inserta sus 49 variantes sin id, así que «la primera
  variante por id» —que 13 suites de CLAURE tomaban prestada para marcarla como de CLAURE— es una prenda DISTINTA en
  cada base, y cada tanda del CI levanta la suya. El propio seed deja, con fecha de hoy, 3 ventas, 1 cambio y 1
  devolución aprobada con una prenda dañada, sobre 5 de sus 11 prendas (28 de sus 49 variantes): cuando el sorteo caía
  ahí, esa historia pasaba a contarse como «de CLAURE» y se sumaba a lo que la prueba medía.
- **El arreglo es de `main`, no de esta rama:** otra sesión llegó al mismo diagnóstico y lo cerró primero en
  `bff3954ea` («las pruebas de CLAURE eligen prendas sin historia comercial», `scripts/pruebas/_claure_prendas.mjs`):
  las prendas A y B se eligen entre las que no tienen ninguna línea de venta, apartado, pedido web, cambio, prenda
  dañada ni merma, y que son mercadería de verdad. Esta rama tenía construido el otro camino —que la escena CREARA sus
  prendas, con lo que no puede tener historia por construcción— verificado en 637 corridas; se descartó al traer
  `main` para no hacer un segundo arreglo del mismo problema. El de `main` cubre algo que al mío le faltaba: exigir que
  la prenda sea mercadería con categoría que entra a los motores (si no, Pérdidas y el Diario no la listan).
- **Lo que esta rama aporta: la verificación sorteo por sorteo del arreglo de `main`.** En una base privada (Postgres 17
  de Homebrew en su puerto, 984 migraciones + seed, en hora de Lima como el CI; la base local compartida no se tocó) se
  barrieron los sorteos posibles enumerándolos con `order by va.id limit 1 offset K`, que es exactamente lo que el
  sorteo de uuid del seed puede dar: **14 suites × 20 prendas limpias = 280 corridas, todas verdes.** Antes del arreglo
  el mismo barrido daba 40 de 147 corridas rojas en las tres suites del informe, con los mensajes IDÉNTICOS a los del
  CI: `claure_cuenta` 10/49 (la fila extra `cambio||(sin cuenta)|1|0.00|-|-|f`, que es el cambio del seed),
  `claure_perdidas_y_danadas` 14/49 (`se esperaba 3|1 y salió 2|1`, la devolución dañada del seed) y
  `claure_fuera_de_las_cifras` 16/49 (`121.28|84.75` y `192.90|29.43|163.47|40.00`, las ventas del seed). Las otras 10
  suites con el mismo patrón fallaban ~5 de cada 26 sorteos.
- **No era el reloj,** y hay dos pruebas directas: (a) `main` cae con los MISMOS números (corrida 41136130684, commit
  708d411ba, 22:08 UTC), así que no es de ningún PR; (b) la corrida 41137391922 (commit 037c464c9) tiene dos intentos:
  el 1 falló en la tanda 2 y el 2 —un re-run del mismo commit, con el mismo código y el mismo reparto— pasó. Entre
  intento e intento no cambia nada salvo la base, o sea el sorteo. Y el barrido corrió entre las 18:30 y las 19:30 de
  Lima, justo en el cruce 19:00 Lima = 00:00 UTC, sin que la hora moviera un solo resultado.
- **Las duraciones del CI, medidas:** `scripts/ci/pruebas-postgres-duraciones.json` pasa de 189 a 394 medidas (de la
  corrida 41137549225, la única reciente que corrió las 4 tandas completas: en un push a `main` las tandas se saltan y
  `--medir` se niega con 0 medidas). Las 19 suites de CLAURE y `pruebas:materiales` valían la mediana. Con su duración
  real el reparto estimado pasa de 263 s a 338 s por tanda, que es lo que tardan de verdad.
- **Felipe se lleva:** un dato al azar en una prueba no es «ruido», es una prueba distinta cada vez. El seed le pone un
  id sorteado a cada prenda, así que cualquier prueba que diga «la primera que encuentres» está jugando a los dados con
  el CI. Y para saber si un rojo es intermitente de verdad, el API de Actions guarda los intentos viejos de una corrida
  aunque `gh run view` solo muestre el último: ahí estaba la prueba de que el mismo commit salía verde y rojo.
