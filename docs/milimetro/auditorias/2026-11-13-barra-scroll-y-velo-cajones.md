# Auditoría al milímetro — La barra de scroll de las hojas y el velo de los cajones de Movimientos y Gastos · 2026-11-13 · `claude/modal-scrollbar-styling-e39fb8` · PR #1815

Medido: 1440×900 claro vivo y quieto · 1440×900 oscuro · 375×812 claro (táctil). Servidor local de esta rama, base local.
Raíz de los medidores: el cajón de un movimiento (`.cajon-serena`, `/inventario/movimientos?mov=…`), que tiene las dos piezas a la vez (la barra en su
cuerpo y el velo detrás). La barra en una `<Modal>` se miró a ojo en «Fusionar productos repetidos» (forzada a correr), en claro y oscuro.

Resumen: **1 grave, arreglada** · 0 medias · 0 leves en lo que cambió · 1 nota de la pieza `<Cajon>` (decidida) · 3 notas de la página de atrás.

## Lo medido de lo que cambió
- **Árbol:** no hay pieza nueva. La barra no es una familia de `/unificar`: es el estilo de la barra que ya había (`.scroll-cayla`), llevado a toda
  `[role="dialog"]`. El velo es el de fábrica de `<Cajon>` (pieza `cajon`, decidida 2026-10-17) y «n de N» con ↑ ↓ es su prop `navegacion`.
- **Color de la barra — GRAVE, ARREGLADA:** la píldora en reposo era `tinta` al 22 %: **1,59:1** sobre el vidrio claro y 1,94:1 sobre el oscuro (con el
  mouse, 2,45:1; al arrastrar, 3,38:1). Como ahora la dibujamos nosotros y no el navegador, WCAG 1.4.11 (AA) pide 3:1 `[Norma]`. Mínimo medido: 48 %
  de tinta en claro (vidrio blanco al 70 % sobre crema, con y sin velo) y 44 % de crema en oscuro (vidrio `#33302a` al 82 %, sobre el fondo y sobre la
  aurora). Arreglo: **50 % en reposo, 64 % con el mouse, 76 % al arrastrar** (`--scroll-pulgar*` en `apps/web/app/estilos/barra-de-scroll.css`, con su
  `/* contraste: gráfico sobre papel, crema */`, que mide `lib/tema-tokens.test.ts`).
- **Espacio:** la píldora mide 6 px (8 px con el mouse) a 3 px del borde; ocupa 12 px de canal (medido `offsetWidth − clientWidth` = 12 en el cajón
  a 1440 y a 375; 14 en la hoja, con su borde). En la hoja su recorrido para a 24 px de arriba y de abajo (75 % del radio de 32 px): no pisa la curva.
- **Estados** (de la barra): default 3:1 · hover solo bajo `@media (hover: hover)` (lo vigila `lib/hover-con-mouse.test.ts`, en verde) · active más
  oscura y ancha · focus-visible, selected, disabled, loading, error, read-only y vacío: no aplican (la barra no recibe el foco; el área que corre se
  maneja con la rueda y el teclado) · quieto: la barra no se anima.
- **Foco del cajón (2.4.7, 2.4.11):** 4 controles enfocados con Tab real: 0 sin anillo, 0 flojos, 0 tapados.
- **Color del cajón:** 28 textos medidos, 0 fallan, en claro y en oscuro.
- **Movimiento:** quieto, 0 animaciones y 0 bucles en el cajón; vivo, todo lo que corre es de piezas ya decididas (sellos y trayectos de Movimientos,
  ADR-0353; aviso de cierre, ADR-0359). El velo es la entrada de `<Cajon>`, sin nada propio.
- **375 px:** el cajón sale como hoja de abajo (con velo, como siempre en el celular), la píldora dentro de su cuerpo y «1 de 3» con ‹ ›.

## Nota de la pieza `<Cajon>` (decidida, no es de este cambio)
- «Movimiento anterior» apagado en el primer registro, sin motivo a la vista: es como se apaga la flecha de la punta en todo cajón (Proveedores, Por pagar,
  Recepciones). Un control apagado está exento de 1.4.3; lo de darle `aria-disabled` con motivo es la propuesta 3 de `/milimetro` (`propuestas.md`).

## Notas de la página de atrás (ya estaban, quedan bajo el velo)
- El buscador de Movimientos: borde 2,24:1 (WCAG 1.4.11) según el medidor de color.
- Dos `:hover` globales que el medidor marca «revisar» (`.barra-t:hover …`, `.parecidas-punto:hover::after`): la prueba de hover está en verde (llevan su `hover-tactil`).
- Animaciones de más de 500 ms y bucles de la pantalla, todos con su fila en ADR-0136.

## Sin medir
- Espacio, tipografía y textos con sus medidores: el cambio no toca texto ni medidas de piezas del DOM (la barra es un seudoelemento que ellos no ven).
- Firefox: usa `scrollbar-width: thin` y `scrollbar-color` con el tono de «con el mouse» (64 %); no se abrió en Firefox.
- El cajón de Gastos abierto: la base local no tiene gastos. Es la misma pieza, sin `velo={false}`.
- La hoja `<Modal>` a 375 px (su recorrido 20/6 px).
