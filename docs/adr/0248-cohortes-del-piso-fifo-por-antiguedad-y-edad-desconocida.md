# ADR-0248 · Cohortes del piso: FIFO por antigüedad y edad desconocida

- **Fecha:** 2026-09-27 · **Estado:** construido en la rama `claude/frescura-3c-terreno` (paso 1, «Terreno del dominio»,
  del diseño 3c de ADR-0208; ver su «Actualización 2026-09-27 — diseño 3c»). Sin fusionar. Solo lógica pura de la web
  (`apps/web/lib/inventario-exposicion.ts`); la migración del mismo paso (`fn_ledger_puntos` más rápido) no cambia
  ningún resultado y se documenta en ADR-0202.
- **Es el cambio de dominio que exige ADR-0208 (d), punto 3:** Frescura necesita del FIFO de cohortes algo que hoy no
  da, y eso se decide en el dominio de Inventario, con su ADR, no con una copia del FIFO en otra pantalla.
- **Complementa:** ADR-0200 (el reloj se pausa en el almacén y sigue al volver), ADR-0202 (libro único),
  ADR-0203 (`fn_es_traslado_interno`), ADR-0212 (carga inicial).

## El problema

Frescura del piso va a medir cuántos días lleva colgada cada prenda y compararlo con lo que tardan en venderse las de
su categoría en la sede (la «vara», con Kaplan-Meier). Para eso lee las cohortes de `armarCohortes`: cada entrada al
piso abre una cohorte, la venta consume la más vieja primero, y el reloj de una cohorte se pausa cuando vuelve al
almacén (ADR-0200). Al revisarlas aparecieron tres huecos:

1. **La venta no se llevaba siempre la cohorte más vieja.** El FIFO recorría las cohortes en el orden del arreglo, y
   cuando una cohorte se partía (vuelve del almacén solo una parte, o se retira solo una parte), el pedazo se
   agregaba **al final**. Ejemplo: el 1 llegan 10 blusas y el 2 se guardan todas; el 5 llegan 5 más y se cuelgan; el 6
   vuelven 4 de las del día 1; el 7 se venden 3. La venta tenía que salir de las del día 1 y salía de las del día 5.
   Lo mismo al reanudar: volvía antes un pedazo pausado del día 3 que uno del día 1.
   - Un segundo detalle del mismo orden: los eventos se ordenaban comparando la hora **como texto**. Postgres escribe
     `10:00:00+00:00` cuando la hora cae justo en el segundo y `10:00:00.5+00:00` cuando no; como texto, el «+» va
     después del «.», y una venta podía quedar antes de la entrada que la explica. Pasa una vez en un millón de
     movimientos, pero pasa.
2. **Frescura necesita saber cuánto llevaba expuesta cada unidad AL VENDERSE,** y `armarCohortes` solo devuelve cómo
   quedaron las cohortes al final: el momento de cada venta se pierde. Sin eso no hay vara.
3. **La mitad del piso no tiene fecha real de colgado.** En TRU entraron al piso 211 unidades (consulta de solo lectura
   del 2026-09-27): 104 por bajadas normales, 95 por bajadas de la **carga inicial** (15 filas del 26-sep) y 12 por
   ajustes de «Reposición» del 24-sep. Las 107 de la carga y los ajustes (51 %) ya estaban colgadas antes de que
   existiera el sistema: su reloj arranca el día que se cargaron, no el día que se colgaron.

## Decidí

**1. FIFO por antigüedad.** «La más vieja» es la cohorte con la fecha (`ts`) más antigua, no la que quedó primero en
el arreglo. El arreglo se mantiene ordenado por fecha: cada cohorte nueva nace con la hora del evento (nunca anterior
a las que ya existen, porque los eventos se procesan en orden) y el pedazo de una cohorte partida se inserta **junto a
su madre** (misma fecha), nunca al final (`partir`). Los eventos se ordenan por el reloj (`compararInstantes`), no por
el texto.

**2. Una sola función arma las cohortes: `historiaDeCohortes(eventos)`.** Devuelve las mismas cohortes de siempre
**y** las salidas: una por cada evento y cada cohorte de la que sacó unidades, con
`{tipo: 'venta' | 'perdida', cantidad, segundosExpuesta, edadDesconocida, ts}`.
- `segundosExpuesta` es lo que esa cohorte llevaba colgada en el momento de la salida, sin contar el tiempo en el
  almacén (el mismo reloj que ya usaba Análisis).
- Una salida al almacén no es una salida: es una pausa (ADR-0200). Lo que sale sin cohorte que lo explique (el libro
  no cuadra) no se anota: no hay edad que medirle.
- `armarCohortes(e)` es `historiaDeCohortes(e).cohortes`. Análisis sigue leyendo `armarCohortes` sin cambios; una
  prueba de propiedad vigila que las dos den lo mismo y que se conserven las unidades (Σ ventas anotadas = Σ vendido
  de las cohortes; lo que queda colgado = el nivel del piso).

**3. Edad desconocida, como marca que viaja con la unidad.** `EventoPiso` suma `edadDesconocida?`. La cohorte que abre
un evento marcado queda marcada, y la marca se **hereda** al partirla (los dos pedazos), al pausarla y al reanudarla, y
pasa a cada salida. La marca no cambia el FIFO ni ninguna cifra de Análisis: solo le dice a Frescura que no confíe en
ese reloj como edad de la prenda.
- **Qué la lleva** (lo marca la lectura SQL de Frescura, paso 3): el saldo con que arranca la ventana, una entrada al
  piso que no es traslado interno ni llegada de mercadería (un ajuste al piso, una devolución, una venta anulada) y la
  bajada de la carga inicial (misma prenda y mismo instante que una entrada `carga_inicial`).
- **Qué hace Frescura con ella:** la prenda dice «al menos N días», puede subir de tramo (Envejecida, Crítica), pero
  **nunca es «Nueva»** y sus ventas **no entran a la vara**.
- Una devolución ya abría una cohorte nueva con el reloj en cero (ADR-0200, decisión 4). Eso no cambia: la marca solo
  dice que ese cero no es la edad de la prenda.

**4. `EventoPiso` suma `oid?`,** el id del movimiento. El FIFO no lo lee: sirve para que Frescura saque una bajada
tardía por su movimiento (y las ventas que la delataron) antes de armar las cohortes, sin adivinar por la hora.

## Descarté

- **Ordenar las cohortes por fecha en cada evento** (un `sort` antes de cada consumo): da lo mismo, pero cuesta un orden
  completo por evento y esconde la regla. Insertar el pedazo junto a su madre la hace imposible de romper sin que falle
  la prueba «el arreglo queda ordenado por fecha».
- **Un FIFO propio para Frescura** que devolviera las salidas: sería el segundo cálculo del mismo libro, justo lo que
  prohíbe ADR-0208 (d). Con dos, la próxima corrección (como esta) llegaría a uno solo.
- **Llevar las cohortes a SQL ahora:** obliga a mover Análisis también, para ahorrar unos 30 ms por sede de un total
  que se va en leer el libro (plan 3c, sección 3).
- **Contar la edad desde el día de la carga:** con el 51 % medido, pintaría de «Nueva» medio piso de TRU, y la vara
  aprendería que esas prendas se venden rápido cuando llevaban semanas colgadas.
- **Sacar del todo las unidades sin edad:** siguen colgadas y ocupan ganchos; con «al menos N días» igual avisan cuando
  se quedaron.

## Se rompe si

- **La puerta de carga inicial se usa para mercadería que llega de verdad** (ADR-0212, «Se rompe si»): esas prendas
  nacerían sin edad y nunca entrarían a la vara. Hay que cerrarla cuando termine el paso al sistema.
- **Alguien arma cohortes fuera de `historiaDeCohortes`** (en Frescura, en SQL o en otra pantalla): vuelven dos
  respuestas distintas a «cuánto llevaba colgada».
- **Una cohorte se parte y el pedazo pierde la marca:** un pedazo de la carga inicial saldría «Nueva». Lo vigila la
  prueba de herencia.
- **Los eventos llegan con horas que no son fechas** (texto libre): se ordenan como texto, que era el problema de
  antes.

## Qué cambia en las cifras de hoy

- **Análisis:** el orden nuevo solo mueve el sell-through de exposición de una prenda donde una cohorte se partió (un
  retiro o un regreso parcial del almacén). En producción no hubo ningún retiro del piso al almacén hasta el 27-sep
  (0 filas; 40 bajadas en TRU): **hoy no cambia ninguna cifra**. Donde pase, el cambio es el correcto: la venta sale
  de lo más viejo.
- **Frescura:** todavía no existe; nace sobre esto.

## Cómo se ve mal hecho

- Ordenar el resultado al final (`return cohortes.sort(...)`): el arreglo se ve ordenado, pero la venta ya se había
  llevado la cohorte equivocada.
- Marcar solo la cohorte madre y no el pedazo, o marcar la unidad según la hora de la bajada y no según el evento que
  la trajo.
- Copiar el FIFO en `frescura-reglas.ts` «con un ajuste».

## Cómo se verificó

`apps/web/lib/inventario-exposicion.test.ts`:
- Las pruebas del FIFO por antigüedad (la venta sale del día 1 y no del día 5; al reanudar vuelve primero el pedazo
  más viejo; el arreglo queda ordenado; dos eventos del mismo segundo) **fallaron antes del arreglo** y pasan después.
- `historiaDeCohortes`: salidas con su exposición (con y sin pausas), una salida por cohorte, pérdidas, la marca
  heredada al partir, pausar y reanudar, y la prueba de propiedad sobre los casos de siempre y 300 historias al azar
  con semilla fija.
- Las pruebas de Análisis (`resumen-*`, `existencias-*`) siguen en verde sin cambios.
