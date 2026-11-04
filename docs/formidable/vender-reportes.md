# Formidable · Ventas ▸ Reportes: «Ventas del mes» y «Ranking de prendas»   (/vender/reportes, /vender/reportes/ranking)

- **Fecha / SHA:** 2026-11-03 · f9aa3aea2   · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «¿Cómo va el negocio este mes y qué prendas son las que más salen?»   · **Protagonista:** el dinero (Ventas del mes) y la prenda (Ranking)
- **Veredicto en una línea:** «Se entiende en 5 s y una colaboradora nueva resolvió las dos tareas sin retroceder ni pedir ayuda; le faltan tres palabras que no dicen a qué se refieren.»
- **Cómo se hizo:** medido en el navegador a 1440 y 375 px (claro); una prueba ciega (Sonnet, navegador local, datos inventados, 2 tareas, a ~510 px de ancho). **Sin agente escéptico:** contrasté yo cada hallazgo con el código y lo digo abajo. **Real: sin probar.**

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] ciega: a los 5 s dijo «el resumen de ventas de la tienda, con los números de noviembre» (coincide); tarea 1 con 1 toque y tarea 2 con 2, **0 retrocesos, 0 ayudas**. 5 dudas. Real: sin probar (no llega a 10) |
| 2 Una pregunta, una respuesta | 8 | [Observado] encontró sola la cifra, la tienda que más vendió y las 3 primeras prendas. [Opinión] dos pestañas, una pregunta cada una |
| 3 Simplicidad profunda | 7 | [Observado] «+4,6 % vs octubre, los mismos 3 días» y «Para ~3 días» se leyeron bien como veredicto; «Las 10 primeras: 100 % de lo registrado» no se entendió |
| 4 Lenguaje de tienda | 7 | [Observado] no entendió «Por regularizar»; dudó de «Quedan 48» (¿de todas las tiendas o de una?) y de «vs período anterior» |
| 5 Contenido primero | 9 | [Medido] las cifras y la tabla pesan más que el marco; 0 adornos propios |
| 6 Lo difícil, a un toque | 6 | [Observado] «Descargar Excel» no dice qué baja (es el mismo texto en las dos pantallas) y «Quedan» no explica de dónde sale; [Medido] el único «¿por qué?» es el «?» de la cabecera |
| 7 Perdonar antes que preguntar | 9 | [Medido] solo lectura: no guarda, no hay nada irreversible |
| 8 Quitar antes de agregar | 7 | [Observado] «Las 10 primeras» confunde cuando hay 10 modelos (en la base de prueba; en producción hay cientos, ver escéptico) |
| 9 De punta a punta | 7 | [Medido] sin desborde a 375 px (scrollWidth 375); vacíos y errores con `<Vacio>`/`<Aviso>`; [Observado] tras tocar «‹» siguió ~3 s mostrando el mes viejo (en dev; ver escéptico) |
| **Leyes (promedio)** | **7,6** | |
| **Oficio visual** | **8** | [Medido] a 1440: 0 blancos bajo 24 px, 0 problemas de contraste, 0 huecos fuera de escala, 0 rojos de más; marcan solo texto de 11 px (las versalitas del sistema) y bordes «casi alineados» de 1 px de piezas del sistema. A 375 px los blancos bajo 44 px son filas del menú del marco, no de esta pantalla |

## Veredictos de cada hallazgo (contrastados con el código)
- **«Descargar Excel» no dice qué baja** — CONFIRMADO. `BotonDescargar` se usa sin `title` y con el mismo texto en las dos pantallas.
- **«Quedan N» ambiguo** — CONFIRMADO. La función cuenta solo las TIENDAS (no el taller ni el almacén); la celda dice «Quedan 48» y el título de la columna, «Cómo está el stock».
- **«Por regularizar» sin explicar** — CONFIRMADO. Existe la pantalla (`/inventario/por-regularizar`) pero el aviso no dice dónde.
- **«Las 10 primeras: 100 %»** — MATIZADO. Solo pasa con 10 modelos o menos (la base de prueba tiene 10); en producción octubre trae cientos, así que ahí se entiende. No entra a los 3.
- **«Todas las tiendas» en la cabecera contra «Tienda Lima» arriba a la derecha** — MATIZADO. Es el patrón de toda cabecera del ERP (la línea dice qué mira la pantalla; el selector de arriba, dónde estás parado); no es de esta pantalla. Va a «lo que no pediste».
- **3 s con el mes viejo tras tocar «‹»** — NO VERIFICABLE. Pasó en `next dev` (primera compilación); el loader global (ADR-0149) abre a los 200 ms en producción.
- **«Septiembre quedó a medias… No se compara»** — REFUTADO como defecto: la colaboradora lo entendió y respondió bien («octubre mucho más alto, pero septiembre estaba incompleto»); es lo que debe decir.

## Los 3 cambios de mayor impacto (esperan el OK de Felipe; ninguno toca dinero, stock, permisos ni SUNAT)
1. **El botón dice qué baja.** Antes: «Descargar Excel» en las dos. → Después: «Descargar el mes» (Ventas del mes) y «Descargar el ranking» (Ranking), con el detalle en el `title` («la tabla por tienda o por categoría del mes que miras» / «todas las filas con tus filtros»). Ley 6 y 4. Esfuerzo S. Se verifica: el texto del botón en cada pantalla y la prueba ciega repetida. La guía de la pantalla se actualiza en el mismo commit.
2. **«Quedan 48» dice dónde.** Antes: «Quedan 48» bajo «Cómo está el stock». → Después: columna «Stock en tiendas» y «Quedan 48 en tiendas» en la fila (en 375 px, «en tiendas» baja a su línea). Ley 4 y 3. Esfuerzo S. Se verifica: ancho de la columna a 1024/1440 sin cortar el chip «Para ~3 días».
3. **«Por regularizar» dice dónde.** Antes: «…Cuando se registren en Por regularizar, entran aquí.» → Después: «Se cobraron en caja sin elegir qué prenda era. Cuando alguien las identifique en Inventario ▸ Por regularizar, entran aquí.» Ley 4. Esfuerzo S. Se verifica: texto del aviso y que no desborde a 375 px.

## Lo que sobra (ley 8)
«Las 10 primeras» cuando la lista tiene 10 modelos o menos: dice «100 %» y no decide nada. Se propone esconder la tarjeta en ese caso (la grilla pasa de 4 a 3), sin tocar ningún dato.

## Lo que no pediste y importa más
La línea «Todas las tiendas · …» de la cabecera y el selector «Tienda Lima» de arriba se leen como dos controles contradictorios (una colaboradora dudó cuál manda). Es de TODO el ERP, no de Reportes: si Felipe quiere atacarlo, es una decisión de la cabecera (ADR-0220) para `/unificar`.

## Antes de decir «listo»
- **Concurrencia (dos personas, mismo registro):** no aplica, no escribe; descargas y lecturas son independientes.
- **Caída externa:** cada bloque (cifras, gráficos, tabla) lee por separado y, si falla, se ve un `<Aviso>` sin tumbar los otros; si la base no responde, el marco manda a `/sin-base` (ADR-0450). **Sin probar en vivo** una base caída.
- **Persona sin contexto:** la ciega lo respondió (arriba). Real: **sin probar**.

## Después de los 3 cambios (2026-11-03, segunda prueba ciega: otro agente Sonnet, mismas tareas, mismo navegador local)
- **[Observado]** 0 retrocesos y 0 ayudas otra vez; 4 dudas (antes 5). Tarea 1 con 1 toque, tarea 2 con 1 toque (antes 2).
- **El botón** (cambio 1): ahora sabe qué baja cada uno («Descargar el ranking → el ranking de prendas, no el mes») pero anotó que **«la palabra Excel no aparece en el botón; la deduje yo»**. Se devolvió en un cuarto cambio: «Descargar el mes en Excel» y «Descargar el ranking en Excel» (289 px de 343 a 375 px, sin desborde). Sin repetir la prueba ciega después de este último ajuste.
- **«Quedan 48 en tiendas»** (cambio 2): resuelto en lo esencial: infirió «de todas las tiendas juntas, porque dice *en tiendas* y el filtro Tienda está vacío». Le queda la duda de la cabecera («Todas las tiendas» contra «Tienda Lima» de arriba), que es del marco de todo el ERP (ver «Lo que no pediste»).
- **«Por regularizar»** (cambio 3): sigue sin saber qué es, pero ya sabe dónde está («Inventario ▸ Por regularizar»); queda como mejora parcial. Un enlace tocable depende de que su rol vea esa pantalla: decisión de Felipe.
- **«Las 10 primeras: 100 %»**: esta vez lo interpretó bien («solo hay 10 modelos, así que las 10 suman todo»): confirma el veredicto MATIZADO (solo molesta con 10 modelos o menos).
- **Dudas que NO son de la pantalla:** el mes viejo unos segundos tras tocar «‹» y «un hueco en blanco al abrir» son de `next dev` con el panel oculto (compilación y animaciones de entrada congeladas); NO VERIFICABLE en producción.
- **Notas después:** leyes **7,8** (ley 4: 8, ley 6: 7; el resto igual); oficio **8** (medido a 1440, 1024 y 375 px: sin desborde, la celda de «Stock en tiendas» cabe a 1024 px). **Real: sin probar.**
