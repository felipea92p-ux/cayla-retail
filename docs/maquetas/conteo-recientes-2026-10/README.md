# Conteos recientes por día — maqueta (2026-10-01)

**Pedido (Felipe):** en Inventario ▸ Conteo, la tabla «Conteos recientes» agrupada por día como apartados, con la primera columna solo con la hora; y una barra de filtro con botones «Hoy», «Ayer» y un calendario para una fecha exacta.

**Cómo verla:** abrir `index.html` en el navegador (sin servidor). Arriba, «Escritorio / Celular» cambia el ancho; «Reiniciar» vuelve al inicio. «Hoy» en la demo es el miércoles 30 de setiembre de 2026. Los datos son los Conteos 1 a 27 del historial real de TRU; **las horas son inventadas**.

## Qué muestra
- **Apartados por día:** una banda en hueso con el día («HOY · miércoles 30 de setiembre», «AYER · …», o solo la fecha) y cuántos conteos trae.
- **Primera columna = hora de apertura** («11:58») y debajo «Conteo 27». Pasando el mouse por la fila se ve «Abierto 11:43 · cerrado 11:52».
- **Filtro:** `Todos 27` · `Hoy 16` · `Ayer 4` · `Elegir fecha`. Cada botón trae cuántos conteos hay. El calendario marca con un punto los días que tienen conteos, bloquea los futuros y no deja ir más atrás del primer mes con datos. Elegir en el calendario el día de hoy o de ayer enciende el botón de siempre. La pastilla de fecha elegida lleva una «×» para quitarla.
- **Sin resultados:** «No hubo conteos el viernes 25 de setiembre. El conteo anterior fue el jueves 24 (Conteo 5)» con «Ir a ese día» y «Ver todos».
- **Tres anchos** (por el ancho de la tarjeta, no de la ventana, igual que hoy): tabla de seis columnas, ficha media (hora · qué · resultado · acción y debajo el responsable) y ficha de celular.

## Lo que hay que decidir antes de construirla
1. **La hora: ¿apertura o cierre?** La maqueta muestra la de apertura (es «a qué hora se hizo»). Un conteo abierto a las 11:43 y cerrado a las 11:52 sale como 11:43.
2. **¿Entra por «Todos» o por «Hoy»?** La maqueta entra en «Todos». Con 16 conteos en un día de pruebas «Hoy» sería más corto; con el uso normal (1–2 conteos por día) «Todos» sirve.
3. **Un límite real que la maqueta no muestra:** hoy la pantalla solo trae los **20 conteos más recientes** (`getHistorial`). Filtrar por una fecha exacta sobre esos 20 no llega a días viejos. Para que el calendario sirva hay que traer más (p. ej. los de los últimos 90 días, unos cientos de filas al año por sede: poco) o pedir el día a la base (`?dia=2026-09-25`). Recomiendo lo segundo para el calendario y mantener los 20 más recientes para «Todos».
4. **Sin cambios en la base para la hora**: `conteos.created_at` ya está; el agrupado por día es en hora de Lima (`lib/fechas-lima.ts`).

## Para construirlo de verdad
Cambia `components/ConteosLista.tsx` (hoy Server Component sin estado: el filtro necesita estado en la URL, como ya hacen los filtros de Existencias y Movimientos) y `lib/conteos.ts` (`getHistorial`). Lo vigilan: guía de foco (un filtro con calendario no es un formulario; `no-aplica` con su motivo) y prueba a 375 px.
