# ADR-0623 — Fluidez: lo que se desplaza no se desenfoca, y cambiar de pantalla no tapa nada

**Fecha:** 2026-11-07 · **Estado:** aceptado (los seis puntos, hechos)

## Contexto

Felipe notó que el ERP se sentía pesado, «lageado» o con tirones, en algunos equipos. Se midió una pantalla típica (menú, cabecera, cuatro
cifras y una tabla de 160 filas) con Chromium sin tarjeta gráfica y el procesador 4 veces más lento, que es como funciona un portátil o una
tablet económica: **32 cuadros/s y 18 tirones** (cuadros de más de 50 ms) al hacer scroll. Al quitar un efecto a la vez:

| Lo que se quitó | Cuadros/s | Tirones |
|---|---|---|
| Nada | 32 | 18 |
| El desenfoque solo de la tabla | 53 | 0 |
| Todo el desenfoque | 49 | 3 |
| Las nubes del fondo | 36 | 10 |
| El desenfoque del menú y la cabecera | 37,5 | 10 |
| El de los botones negros o de las cifras | ~32 | — |

Con la tarjeta gráfica real de un Mac M4 los cinco casos daban lo mismo (~49 cuadros/s): el lag es de los equipos sin buena tarjeta gráfica,
no de todos. La causa es una sola: la Aurora (`.marco-aurora`) está fija detrás de todo y las tablas y las cifras corren con el scroll por
encima de ella con `backdrop-filter: blur(24px)`. Como lo que tienen detrás cambia en cada cuadro, el equipo vuelve a desenfocar toda la
tabla en cada cuadro: en esa pantalla eran 138 piezas con desenfoque y 10,5 pantallas de superficie desenfocada.

Una revisión del lado JavaScript encontró además: el velo del loader en casi toda navegación (bloquea la página y espera la respuesta
entera), la marca del menú medida ~30 veces por cambio de pantalla, las 79 guías de demo descargadas con cada pantalla, `PaginaEstable`
buscando el contenedor en cada tecla, `FilasQueSeDeslizan` leyendo y escribiendo intercalado, y dos efectos que siguen al mouse sin
esperar al cuadro.

Felipe revisó una maqueta navegable con antes y después de cada punto, sobre la pantalla real del ERP, y eligió **«B» para el vidrio**
(vidrio claro, un poco más lleno) y **«después» en todo lo demás**.

## Decisiones

1. **Lo que se desplaza no se desenfoca.** `.tabla-cayla`, `.tarjeta-cifra`, `.resumen-sede`, el fondo de `TablaViva` (`.tv-fondo`) y los
   bloques de una pantalla en vidrio (`.pantalla-en-vidrio .card-cayla`, `.fin-superficie`) pasan al **vidrio claro**
   (`--vidrio-claro-fondo/borde/sombra`, la receta que ya usaban las tarjetas repetidas), sin `backdrop-filter`. `.btn-primario` pierde su
   desenfoque (el ahumado casi no deja ver lo de atrás). El desenfoque queda para lo que flota quieto: la cabecera, el menú, la cabecera
   pegada de `TablaViva`, las hojas y sus velos. No se tocó `recetas.css`: solo se consumen recetas que ya existían.
2. **Las nubes se pintan con degradados.** Cada `.marco-aurora i` es un `radial-gradient` que se apaga hacia el borde con `scale(1.55)`,
   en vez de una mancha con `filter: blur(90px)`. Se ve igual (comparado en capturas).
3. **Cambiar de pantalla no tapa nada (cambia ADR-0149).** Una ficha de **carga** ya no muestra el velo ni vuelve `inert` la página:
   `EsperaPantalla` (en cada `loading.tsx`) dibuja `EsqueletoPantalla` (título, cuatro cifras y una tabla, con las mismas piezas de
   vidrio) bajo el menú y la cabecera, que siguen vivos. El velo es solo de lo que **guarda** y de lo pedido a mano (cambiar de sede);
   una vez a la vista, una carga encadenada (el refresco que sigue a guardar) lo sostiene como antes. Las fichas de carga siguen
   contando para los avisos: el aviso de éxito sigue saliendo cuando la pantalla ya llegó.
4. **La marca del menú se mide una vez al navegar.** Si solo cambió la ruta y el menú conserva su forma, una medición y la transición de
   `marco.css` la llevan. El seguimiento cuadro a cuadro queda para cuando un grupo se abre o el menú se pliega.
5. **Lo que se usa al abrirlo se descarga al abrirlo.** El registro de guías es un trozo aparte (`lib/guias/diferidas.ts`): `MotorGuias`
   lo pide cuando la pantalla ya está quieta (`requestIdleCallback`, tope 2,5 s) y `GuiaInteractiva` se carga al arrancar una guía.
   `PerfilModal` (que se pide al acercar el mouse a «Mi perfil»), `ElegirDemoModal` y `Acompanante` van con `next/dynamic`, y el cajón
   del asistente pasa a `CajonAsistente.tsx`, que se pide al acercarse al botón.
6. **Medir menos.** `PaginaEstable` sigue la ráfaga de tecleo del mismo campo sin volver a buscar su contenedor, e ignora el clic que solo
   pone el cursor en una caja de texto. `FilasQueSeDeslizan` lee todas las filas y después escribe. `EfectosInicio` y `TarjetaKpiVidrio`
   siguen al mouse una vez por cuadro.

## Resultado

La misma pantalla, con el código nuevo y el mismo equipo modesto simulado: **53,6 cuadros/s y 1 tirón** (antes 32 y 18), con 4 piezas
desenfocadas (0,3 pantallas) en vez de 138 (10,5).

## Descartado

- **«A · El mismo vidrio sin desenfoque»:** mismo color y transparencia, y lo de atrás se ve tal cual. Felipe eligió B, que deja pasar
  menos color y se lee más parecido al de hoy.
- **Apagar el vidrio solo en equipos débiles** (detectar la tarjeta gráfica): no hay forma fiable de saberlo desde la página, y dos
  apariencias según el aparato contradicen «una función, una pieza» (ADR-0358).
- **Un índice de rutas con guía para no esperar el registro:** cambiar la forma del registro tocaba `lib/guias.test.ts` y sus huellas.
  La carga en reposo da el mismo resultado: la oferta de la guía ya esperaba 1,4 s.

## Consecuencias

- Las pantallas con vidrio propio de diseño (Observatorio, Estados financieros, Vender, Caja, Rendimiento…) conservan sus desenfoques: se
  auditan una por una con esta regla (backlog de la rama).
- Lo de `app/estilos/vidrio/` fuera de `recetas.css` no viaja solo a CAYLA Dynamic: queda como tarea allá (contrato de familia v4).
- Cómo se volvió a medir: una página temporal `app/auth/prueba-*` con `AppShell` y la tabla, Playwright con `--disable-gpu`,
  `Emulation.setCPUThrottlingRate` 4 y 3 rondas de scroll contando cuadros con `requestAnimationFrame` (receta en el backlog de la rama).
  Nunca en `localhost`: comparte la cookie de sesión con el ERP local y lo cerró una vez; siempre en `<nombre>.localhost`.
