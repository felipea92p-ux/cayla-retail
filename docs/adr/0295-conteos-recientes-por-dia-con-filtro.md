# ADR-0295 · «Conteos recientes» agrupados por día, con filtro Hoy / Ayer / fecha

> Renumerado de 0293 a 0295 el 2026-10-01: el 0293 lo tenía también «Descuento por etiqueta con el módulo», que entró antes a `main`, y el candado de números de ADR dejó el CI de `main` en rojo.

- **Fecha:** 2026-10-01 · **Estado:** construido y probado (265 archivos de pruebas web). Solo web, **sin migración**.
- **Pedido:** Felipe, 2026-10-01, mirando Inventario ▸ Conteo en producción: la tabla de conteos recientes repetía la fecha en cada fila; quiere apartados por día (la fecha en una banda, y en cada fila solo la hora) y una barra de filtro con botones «Hoy», «Ayer» y una fecha exacta del calendario. Aprobó la maqueta (`docs/maquetas/conteo-recientes-2026-10/`) y decidió: **hora de apertura** y **entrada en «Todos»**.
- **Complementa:** ADR-0282 (Conteo rediseñado).

## Problema
Con 16 conteos en un día la columna «Fecha» decía «30/09» dieciséis veces, y no había cómo ver un día concreto: la pantalla solo traía los 20 más recientes.

## Decidí
- **Bandas por día** (`agruparPorDia`): «HOY · miércoles 30 de setiembre», «AYER · …», o solo la fecha, con cuántos conteos trae. La primera columna de cada fila es la **hora de apertura** (la del día ya está en la banda); al pasar el mouse, «Abierto 11:43 · cerrado 11:52». El día y la hora son los de **Lima** (`diaLimaDe`): el servidor corre en UTC y de 7 pm a medianoche ya es «mañana» para él.
- **Filtro en la URL** (`?dia=aaaa-mm-dd`, igual que Existencias y Movimientos): «Todos · Hoy 16 · Ayer 4» son enlaces y la fecha exacta es el `CampoFecha` de siempre (tipeable, con el teclado completo), al que se le sumó la opción `diasMarcados`: el calendario marca con un punto los días que tienen conteos. Un `?dia=` inválido (`2026-02-31`, un texto) se ignora y sale «Todos». Cambiar de día conserva `?variantes=` («Contar esta prenda», ADR-0241).
- **Sin SQL:** la página pide 300 conteos a `fn_conteos_resumen` (`LIMITE_CONTEOS_FILTRABLES`; una sede hace ~100 al año) y `vistaDeRecientes` decide qué se dibuja. «Todos» sigue mostrando los 20 más recientes; «Último conteo» sigue mirando esos 20. Al navegador solo viaja lo que se dibuja más la lista de días con conteos (unas decenas de fechas).
- **Día sin conteos:** «No hubo conteos el viernes 25 de setiembre. El conteo anterior fue el jueves 24 (Conteo 5)» con «Ir a ese día» y «Ver todos».

## Descarté
- **Una columna `dia` o un parámetro de fecha en `fn_conteos_resumen`:** una migración en producción para algo que 300 filas resuelven hoy, y la función ya suma las líneas de todos los conteos antes de cortar, así que pedir más no cuesta más. Se revisa si una sede llegara a miles de conteos.
- **Agrupar por la fecha de cierre:** la pregunta de quien mira es «¿a qué hora se hizo?»; un conteo abierto a las 11:43 y cerrado a las 11:52 tiene una sola hora. La de cierre queda en el tooltip.
- **Un calendario propio con forma de píldora (como la maqueta):** duplicaba `CampoFecha`. La fecha exacta es el campo de siempre, con su etiqueta «Otra fecha»; las tres píldoras sí son las de la maqueta.
- **Cifra en «Todos»:** muestra los más recientes, no todos; una cifra que no coincida con lo que se ve es peor que ninguna.

## Se rompe si
- una sede supera los 300 conteos en el período que alguien quiere mirar: el calendario no llegará a los más viejos (se sube el tope o se pasa la fecha a la base);
- alguien cambia el orden de `fn_conteos_resumen` (el abierto primero, luego por fecha de apertura descendente): `agruparPorDia` parte de ese orden;
- el reloj de Lima deja de ser UTC−5 todo el año.

## Cómo se verificó
`lib/conteo-recientes-reglas.test.ts` (día y hora de Lima —una apertura a las 10:30 pm—, fechas inválidas, agrupado, Hoy/Ayer, cruce de mes, día sin conteos, tope, enlace que conserva `?variantes=`, apertura y cierre); suite completa, `tsc` y eslint. La maqueta interactiva se probó en escritorio y celular.
