## 2026-11-07 (Finanzas ▸ Resumen: tres maquetas de neobanco)
Qué hice: investigué cómo resumen el dinero Monzo, Mercury, Stripe, Copilot, Shopify, Square, Puzzle, Qonto, Robinhood y Apple Card, y dibujé tres caminos tocables para el Resumen en `docs/maquetas/finanzas-resumen-neobanco-2026-11/`: A «Un número» (tres preguntas, la cifra y su frase cambian al recorrer el gráfico con el dedo), B «Lo que tienes de verdad» (lo libre para usar, partido en bolsillos, dónde está la plata y las dos semanas día por día) y C «Pasó y viene» (la semana en una frase con cifras tocables y un hilo de tiempo). Los tres leen un solo modelo de cifras de ejemplo y cambian con la sede.
Por qué así: el Resumen construido apila unos 9 bloques. Lo que ya eligió Felipe para Estados financieros (ADR-0611: neobanco, cifra y frase, Inter) no se reabre: los caminos solo cambian cómo se ordena la información. Comparar siempre con el mismo punto del mes pasado y como mucho 3 avisos salen de Copilot, Square y Shopify.
Felipe se lleva: elegir el camino mirando. Antes de construir B, decidir la regla «libre para usar» (tienes − pagos de 14 días − IGV del mes − plata de CLAURE); en C, los umbrales de «lo que pasó». Nada toca la app ni la base.

## 2026-11-08 (Finanzas ▸ Resumen: las maquetas pasan al fondo de producción)
Qué hice: saqué de las tres maquetas la tela de Hilos y puse lo que hoy está en `main`: el crema con la Aurora detrás (tres nubes quietas, roja, pizarra y ámbar, con las medidas de `vidrio/marco.css`); las tarjetas van en vidrio claro sin desenfoque, y el desenfoque solo en lo que flota quieto (el dock y la franja pegada de C). Los segmentos, los botones y el globito salen de las recetas Serena. También se fue el filo de luz que giraba y el brillo que seguía al mouse.
Por qué así: Felipe recordó que los hilos se descartaron. Lo dice la actualización del 2026-11-06 de ADR-0611 («Sin tela de Hilos ni lentes»). Lo que se desplaza no se desenfoca (ADR-0623), así que la maqueta ya no promete un vidrio que la app no dibuja.
Felipe se lleva: lo mismo que antes, elegir el camino mirando. Las cifras, el orden y las reglas pendientes no cambiaron. El contraste sobre la Aurora sigue sin medir con `tema:auditar`.

## 2026-11-09 (Finanzas ▸ Resumen: tres caminos de punta a punta, con tres fondos)
Qué hice: investigué de nuevo los referentes (Square, Toast, Float, Monarch, Xero, Mercury, Nubank, bunq, Relay, QuickBooks, Stripe) y mapeé lo que el Resumen de `main` ya calcula. Con eso armé `docs/maquetas/finanzas-resumen-de-punta-a-punta-2026-11/`: el marco del ERP, la mesa de mando con sede, mes y «Ocultar montos», un solo modelo de cifras de ejemplo y once hojas de detalle que se recorren en orden. Los tres caminos son A «Bolsillos» (cuánto puedes usar, partido en bolsillos), B «Tablero» (ocho cifras, «¿Ya pagaste el mes?» y el mes en un calendario) y C «Camino» (una frase con cifras tocables, el río de la plata, la cuadrícula de 100 soles y «si gané, ¿por qué tengo menos plata?»). Cada camino se ve con tres fondos: Aurora, Rejilla y Clima.
Por qué así: Felipe pidió lo más completo posible para una persona común. La respuesta va arriba y sola y el detalle queda a un toque, así no se reabre la decisión de ADR-0611. Una prueba ciega con un agente sin contexto dio C 8, A 7 y B 4; B se contradecía y asustaba, y se corrigió antes de entregar.
Felipe se lleva: elegir camino y fondo mirando (recomiendo C con los bolsillos de A, sobre Aurora). Después decidir las reglas nuevas: «Libre para usar», el rango de la proyección, la CTS y gratificación del mes, los umbrales del aviso y del clima, y la fecha de SUNAT, que necesita el RUC. Nada toca la app ni la base.

## 2026-11-09 (Finanzas ▸ Resumen: el camino A, construido)
Qué hice: construí en el ERP el camino «A · Bolsillos» que eligió Felipe, en ocho actividades con su commit: el calendario de Estados financieros, «Libre para usar» con sus bolsillos, el mes estimado con rango, «Próximos» con el día más justo, «Movimientos» día por día, las dos columnas con las preguntas de siempre y siete hojas de detalle. El fondo es el del ERP.
Por qué así: Felipe decidió las dos reglas de dinero («todo lo que tiene dueño» y el estimado con rango) y pidió también las hojas. Todo sale de lecturas que ya existían (la proyección de caja, el estado de resultados, el flujo real), y las pruebas exigen que bolsillos, próximos y equilibrio digan los mismos números.
Felipe se lleva: el PR sin abrir (commits locales en `claude/architecture-design-criteria-adf12e`). Verificado en local con la base compartida, que casi no tiene ventas de noviembre: el estimado con rango solo está probado con pruebas unitarias. Falta verlo con colaboradoras reales.

## 2026-11-09 (Finanzas ▸ Resumen: más parecido a la maqueta)
Qué hice: acerqué el Resumen construido a la maqueta A: la frase con la respuesta a la vista, vidrio claro, cifras en Inter con la «S/» chica, bolsillos en tarjetitas con ícono, íconos por categoría en los movimientos, columnas 7 a 5 desde 1100 px y sin el hueco de «A dónde va la plata» vacío.
Por qué así: Felipe vio que no se parecía en el espacio, el celular ni los íconos. Lo que no se movió (la barra de sede y mes, el tamaño del título) es de piezas comunes del ERP ya decididas.
Felipe se lleva: mirarla a 1440 y en el celular. Contraste medido en claro y oscuro (0 fallas nuevas); la guía se recorre entera en escritorio y a 375 px.

## 2026-11-09 (Finanzas ▸ Resumen: por filas, sin huecos)
Qué hice: rearmé el Resumen por filas de dos tarjetas del mismo alto (libre y mes, lo urgente y lo que viene, movimientos y tiendas), y el último par igual. Una pieza sin pareja toma la fila entera.
Por qué así: con dos columnas sueltas la más corta dejaba unos 470 px vacíos al pie, como mostró Felipe. Con filas, todo termina parejo con cualquier dato.
Felipe se lleva: verificado a 1180, 1440 y 375 px, con y sin tiendas; contraste en claro y oscuro sin fallas nuevas; la guía se recorre entera.

## 2026-11-09 (Finanzas ▸ Resumen: gráficos en las hojas)
Qué hice: cada hoja de detalle abre con su gráfico: reparto de lo libre, de cada S/ 100 vendidos con la barra del mes, venta por día y por tienda, gastos por rubro, la caja de 14 días contra el mínimo, SUNAT y la ropa por sede. Los renglones llevan el color de su tramo.
Por qué así: Felipe vio hojas sin gráficos. Se usaron solo las piezas decididas (barra apilada, barras por tiempo, línea, barra de avance) y los datos que la pantalla ya tenía: ninguna lectura nueva.
Felipe se lleva: verificado en escritorio y a 375 px, con contraste en claro y oscuro sin fallas nuevas. La venta por día solo sale si la cuenta ve Rendimiento.
