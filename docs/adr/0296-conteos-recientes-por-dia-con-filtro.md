# ADR-0296 · «Conteos recientes» agrupados por día, con filtro Hoy / Ayer / fecha

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

## Actualización 2026-10-01 (b) — la lista se lee igual que Movimientos
Felipe, mirando la pantalla en producción: «se ve muy desordenada y poco entendible… más moderna, básica, simple y práctica». Una primera versión (una fila de dos líneas con chip y círculo de iniciales) no le convenció del todo: «que tenga la misma estructura visual y lógica que la tabla de Movimientos, se entiende mucho más». Lo que cambia es **solo la forma**: el filtro por día, el orden, el tope y las reglas de resultado siguen como arriba.
- **Antes:** tabla de seis columnas (Hora · Ubicación · Qué se contó · Resultado · Responsable · Acción) en bandas de día, con cebra y un botón «Ver» por fila. Cuatro datos repartidos en ~1.500 px, «Almacén de tienda» repetido en las 17 filas y «Cerró —» en casi todas.
- **Ahora:** la misma lista que Movimientos (`components/ui/lista-actividad.tsx`: la rejilla, el punto de color, el título del día y la columna de hora, extraídos de `FilaMovimiento` sin cambiar una medida; Movimientos se ve igual). Cada celda dice lo análogo: **hora** de apertura · **punto** del resultado (verde, neutro, ámbar, gris, pizarra: los mismos tonos, ahora en el punto y no en un chip) · **ficha** con el ícono del lugar (percha = piso, caja = almacén) y «Conteo 28» sobre «Almacén de tienda · Solo Pantalones» · **resultado** («Todo correcto») sobre cuándo cerró («Cerrado 17:52», «Sigue abierto») · **quién** abrió (y «Cerró X» solo si se sabe y es otra persona) · **cifra** de variantes verificadas («15», o «20 de 37» si no terminó) · flecha ›. La fila entera es el enlace. El día se rotula con `etiquetaDia`, la misma función de Movimientos («HOY», «AYER», «SÁBADO, 26 DE SETIEMBRE», con «N conteos»). Sin encabezado de columnas ni cebra.
- **El filtro:** título y filtro en la misma línea; «Otra fecha» ya no flota sobre un campo con hilo: va al lado como texto y el campo es la caja hundida de los demás filtros (`CampoFecha caja`). Como ahora queda en el extremo derecho, el calendario se ancla por la derecha cuando no cabe (se mide al abrir).
- **Descarté** dejar «Cerró —» y solo achicar la tabla (el ruido venía de la estructura, no del tamaño) y copiar la rejilla de Movimientos a mano (dos copias que se desalinean el día que una cambie): por eso se extrajo a un módulo compartido sin `"use client"`, porque un valor exportado por un archivo cliente no se puede leer desde un Server Component. **Ojo:** esconder «Cerró —» no arregla que un conteo cerrado con la cuenta de tienda no guarde quién lo cerró (ADR-0280): la decisión de fondo (que `cerrar_conteo` vuelva a llevar responsable) sigue siendo de Felipe.
- **Se rompe si:** el chip más largo («99 diferencias encontradas») pasa de lo que cabe en su columna (envuelve a dos líneas, no se corta), o alguien cambia una medida de `FILA_ACTIVIDAD` pensando solo en Movimientos (las dos listas cambian a la vez, a propósito).
- **Cómo se verificó:** `cifraDeConteo`, `apoyoDeResultado`, `textoCierre` y `responsablesDeConteo` con prueba; en el navegador, con datos inventados que cubren los cinco resultados, nombre largo y sin nombre, y con la pantalla real (filtros Hoy / día sin conteos / calendario / clic en una fila), y Movimientos antes y después del refactor. El celular no se revisó en esta pasada (Felipe: no hace falta por ahora; Conteo es de escritorio).
