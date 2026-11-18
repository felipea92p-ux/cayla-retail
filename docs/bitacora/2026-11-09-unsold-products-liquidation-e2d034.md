## 2026-11-09 (Análisis ▸ No se vende: el plazo de cada fila, a la vista)
Qué hice: bajo la barra de cada fila de «No se vende» ahora dice desde cuándo se liquida y por qué. Si su tipo tiene ritmo, dice cuánto
suele tardar («Blusas: suelen venderse en 27 d»). Si no lo tiene, dice que sigue a la caja («Sin historial: liquidar desde 7 d», con la
rayita en ámbar). La caja pasó a llamarse «Sin historial: liquidar desde», igual que su hoja de guardar y el aviso. La nota del carril dice
que la caja solo vale para tipos con menos de 10 ventas, y si hoy no mueve a ninguno, lo dice. No cambió ninguna regla: la vara (p90 de
Frescura) y la caja de respaldo son las de ADR-0357, act. 2026-10-14.

Por qué así: Felipe bajó la caja de 7 a 1 día y le seguían saliendo los mismos 15 modelos, porque todos eran de tipos con su propio ritmo.
La pantalla no decía qué vara se usaba, y parecía que la caja no hacía nada. Le ofrecí tres caminos y eligió «Plazo por tipo, a la vista»
(dejar la regla y mostrarla). Descartó «un solo número para todo», que mediría igual un polo y un vestido, y «ajustar el plazo tipo por
tipo», que es más pantalla que mantener.

Cómo verificas tú: en Análisis ▸ No se vende, cada fila dice su plazo. Al mover la caja solo cambian las filas «Sin historial». Prueba:
`lib/analisis-quietas.test.ts` («el plazo de cada fila»: con ritmo propio, la caja en 1, 7, 60 o 999 no lo mueve). Lo vi en el navegador
con datos inventados a 1440, 1024 y 375 px, en claro y en oscuro.
