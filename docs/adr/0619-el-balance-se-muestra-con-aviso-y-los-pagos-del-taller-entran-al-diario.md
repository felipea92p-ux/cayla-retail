# ADR-0619 — El Balance se muestra con aviso, y los pagos del Taller entran al diario

- Estado: aceptado (Felipe, 2026-11-06)
- Migración: `supabase/migrations/20261107021000_pagos_del_taller_en_el_diario.sql`, **sin pegar en producción**
- Corrige: ADR-0198 («el Balance se dibuja solo si cuadra»)
- Relacionados: ADR-0611 (camino A, el informe), ADR-0618 (arranque), migraciones `20261106171000` y `20261106234000`

## El problema

Felipe abrió Balance general y preguntó dónde estaban los activos, los pasivos y el patrimonio. No estaban: dos ploteos del Taller
del 6-nov (S/ 50 y S/ 38) salieron del banco en Cuentas y dinero, pero el diario no tenía regla para ellos. La 104 quedó en 377.64
contra 289.64 y, por la regla de ADR-0198, el Balance entero dejó de dibujarse. Una diferencia de S/ 88 escondía un Balance de
S/ 150 mil cuya ecuación sí cuadraba (Activo 150,589.96 = Pasivo 23,525.29 + Patrimonio 127,064.67, consultado en producción el 2026-11-06).

Y cuando sí se dibujaba, tampoco decía esas tres palabras: decía «Lo que tienes», «Lo que debes» y «Lo tuyo», con el Patrimonio
en una sola fila.

## La decisión

1. **Lo de fondo decide si hay Balance; una cuenta no.** Si falla el arranque, el diario o la ecuación, no hay nada firme que dibujar:
   sigue sin mostrarse. Si solo una cuenta no coincide con su otro camino, el Balance sale con un aviso arriba que dice cuál, por
   cuánto y dónde se arregla (`situacion` → `con_diferencias`). La misma pantalla, el Excel y ¿Lo tuyo? avisan igual.
   Lo eligió Felipe: «Mostrar con aviso».
2. **El Balance habla como Balance.** Tres secciones, Activo, Pasivo y Patrimonio, cada una con su total, y al final Total Pasivo +
   Patrimonio. El Patrimonio va línea por línea (capital, aportes, resultados acumulados, resultado del mes). «Nombres del
   contador» sigue cambiando las palabras de las filas, no las secciones.
3. **Un pago del Taller es costo de la ropa:** a la 231 (o a la 241 si compra insumos: viene de una orden de insumos o una línea suya es un insumo del catálogo) contra la cuenta de dinero que
   lo pagó, igual que el gasto «Maquila del Taller». Al entrar la prenda al stock, la regla `produccion` lo pasa a la 201. Las
   causas `pagos_taller` y `taller_cajon` desaparecen, y la 231 y la 241 dejan de caer en «Otros»: van con la mercadería.

## Descartado

- **Esconder solo si la diferencia es grande (un porcentaje):** obliga a inventar un umbral, y una diferencia chica en la cuenta
  equivocada también importa. Con el aviso, la cifra se ve y la diferencia también.
- **Quitar el chequeo de la 104:** el Balance saldría sin avisar. El chequeo es lo que encontró este hueco.
- **Asentar los ploteos a gasto del mes:** se restarían dos veces, al pagarlos y al vender la prenda.

## Lo que se paga

- Un Balance con aviso puede leerse sin mirar el aviso. Por eso va arriba, antes que las cifras, y el cierre con que se compara
  sigue exigiendo que haya cuadrado del todo.
- `cuadra` deja de significar «se dibuja»: quien lea la situación debe usar `seDibuja`.

## Lo que queda

- **S/ 224 de octubre de las órdenes #5 y #6.** El corte se pagó el 27-oct y el arranque de la 231 solo contó las órdenes #2, #3 y #4.
  Cuando esas dos órdenes entren al stock, la 231 quedará en −224. Se arregla corrigiendo el arranque (231 y 50, +224) desde Saldos de
  arranque, con motivo. Es una decisión de Felipe.
- Un comprobante del Taller con IGV iría entero a la 231 o a la 241 (hoy todos tienen IGV 0), y uno a crédito se asienta al pagarse (hoy todos son al contado).
- Un comprobante mixto va entero a la 241, y un concepto libre que no es de ninguna orden se queda en la 231 hasta reclasificarlo.
