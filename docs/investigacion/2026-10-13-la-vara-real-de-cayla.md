# La vara real de CAYLA, con Kaplan-Meier (2026-10-13)

> Medida el 2026-10-13 para decidir cómo juzgar lo quieto en Análisis. La decisión quedó escrita en ADR-0357 (act. 2026-10-14); este documento guarda los **números y el método**, que ninguna otra parte del repo tiene.

Calculada con el código del propio repo —`construirVara` + `kaplanMeier` + `cortesConCola` de `apps/web/lib/frescura-reglas.ts`—
sobre las **549 observaciones** que el cron guardó en `retail.frescura_vara_cayla` (producción, 2026-10-13 08:20 UTC).
No es una reimplementación: son los números que mostraría la pantalla.

```

CATEGORIA          | vend |  uni | nivel       |  p50   p75   p90  (curva) |  P50   P75   P90  (con cola) | visto
----------------------------------------------------------------------------------------------------------------
Polos              |   62 |  134 | solido      |   5.1   7.9    —        |   5.1   7.9  11.1          |   9.4 d
Camisas y Blusas   |   39 |   93 | solido      |   6.9    —     —        |   6.9  11.3  18.9          |  10.7 d
Tops               |   21 |   50 | solido      |   3.7    —     —        |   3.7   9.8  16.4          |  10.7 d
Bodys              |   17 |   21 | aceptable   |   1.7   5.3   6.8       |   1.7   5.3   6.8          |   6.8 d
Pantalones         |   12 |   33 | aceptable   |   5.4   7.3    —        |   5.4   7.3   8.8          |   9.8 d
Conjuntos          |   11 |   32 | aceptable   |    —     —     —        |    —     —     —           |   6.7 d
Capas              |    9 |   10 | pocos_datos |   1.3   2.1   5.2       |   1.3   2.1   5.2          |   7.7 d
Chalecos           |    9 |   40 | pocos_datos |    —     —     —        |    —     —     —           |   9.5 d
Corsets            |    9 |   11 | pocos_datos |   3.1   8.4    —        |   3.1   8.4    —           |   8.7 d
Faldas             |    7 |   20 | pocos_datos |   7.0    —     —        |   7.0    —     —           |   9.7 d
Gorros y Sombreros |    6 |   14 | pocos_datos |    —     —     —        |    —     —     —           |   9.5 d
Vestidos           |    6 |   30 | pocos_datos |    —     —     —        |    —     —     —           |   8.7 d
Jeans              |    5 |   26 | pocos_datos |    —     —     —        |    —     —     —           |   8.8 d
Bolsos y Carteras  |    5 |   19 | pocos_datos |    —     —     —        |    —     —     —           |  11.7 d
Casacas            |    1 |    8 | pocos_datos |    —     —     —        |    —     —     —           |  10.6 d
Shorts             |    0 |    8 | sin vara    |    —     —     —        |    —     —     —           |   5.6 d

Todo en DIAS. 'curva' = el corte que Kaplan-Meier alcanza con la evidencia; 'con cola' = extendido por el
riesgo acumulado, que es lo que la pantalla muestra. 'visto' = la unidad mas vieja observada.
```

## Lo que hay que leer dos veces

**Mis primeros números estaban optimistas por 2 a 4 veces.** Un percentil contado solo sobre las prendas que ya se
vendieron ignora las 330 unidades que siguen colgadas sin venderse, y eso tira los cortes hacia abajo. Kaplan-Meier las
cuenta «en riesgo» hasta sus segundos y después las saca sin empujar la curva. La diferencia medida:

| | Contando solo lo vendido | Con Kaplan-Meier |
|---|---|---|
| Polos P90 | 6 d | **11,1 d** |
| Camisas y Blusas P90 | 8 d | **18,9 d** |
| Tops P90 | 4 d | **16,4 d** |

**6 de los 10 cortes que deciden son ESTIMADOS, no medidos.** La columna «con cola» es la que la pantalla usa: cuando la
curva no alcanza un corte, `cortesConCola` lo extiende suponiendo que la categoría sigue vendiendo a su ritmo promedio
(λ = H/t, decaimiento exponencial; decisión de Felipe del 2026-10-10, ADR-0208). Con 13 días de historia eso es lo
normal: el P90 de Camisas dice 18,9 días cuando la unidad más vieja que ha existido lleva 10,7.

| Categoría | P75 (Vigila) | P90 (Liquida) | Lo más viejo visto |
|---|---|---|---|
| Polos | **7,9 medido** | 11,1 estimado | 9,4 d |
| Camisas y Blusas | 11,3 estimado | 18,9 estimado | 10,7 d |
| Tops | 9,8 estimado | 16,4 estimado | 10,7 d |
| Bodys | **5,3 medido** | **6,8 medido** | 6,8 d |
| Pantalones | **7,3 medido** | 8,8 estimado | 9,8 d |

El P50 **nunca** se extrapola (candado de `cortesConCola`), así que los tramos «nueva» y «vigente» siempre están medidos.
Estos cortes **se van a mover** a medida que lleguen datos, y es lo correcto: se autocorrigen.

**Solo 5 de 16 categorías pueden decir un P90 hoy**, y solo 3 llegan a «sólido» (20 ventas con edad conocida): Polos,
Camisas y Blusas, Tops. Las otras 11 callan — por eso la vara de CAYLA, que junta las tres tiendas, no es un lujo sino
la única forma de tener muestra.

## Cuántas prendas señalaría

Contra el umbral fijo de 15 días que tenía producción: **0 prendas, en las 16 categorías.** Contra su propia vara:

| Categoría | Vigila (P75) | Liquida (P90) | En piso | Cruzan Vigila | Cruzan Liquida |
|---|---|---|---|---|---|
| Polos | 7,9 d | 11,1 d | 85 | **17** | **1** |
| Tops | 9,8 d | 16,4 d | 61 | **7** | 0 |
| Pantalones | 7,3 d | 8,8 d | 40 | **3** | **2** |
| Camisas y Blusas | 11,3 d | 18,9 d | 90 | **2** | 0 |
| Bodys | 5,3 d | 6,8 d | 9 | **1** | **1** |
| | | | **285** | **30** | **4** |

30 para vigilar y 4 para liquidar, contra 0 y 0. El valor está en el escalón suave: con solo el P90 verías 4 prendas y la
pantalla seguiría casi muda.

## El método, para repetirlo

1. `retail.frescura_vara_cayla` guarda las observaciones ya construidas por `unidadesParaVara` (cohortes FIFO, edad
   desconocida excluida, pausas de exposición descontadas). Son `[segundos, vendida, peso]`.
2. Se comprimen sin pérdida agrupando por `(segundos, vendida)` y sumando el peso: Kaplan-Meier solo mira tiempo, evento
   y peso.
3. Se corren `construirVara(obs, 120)` y `cortesConCola(vara.cortes, finDeCurva(vara.curva))` — las funciones reales.

Reimplementar el paso 3 en SQL daría números distintos a los de la pantalla. No se hizo por eso.

Ver **ADR-0357, «Actualización 2026-10-14»** (Análisis mide contra la vara de su categoría).
