# El vidrio que dobla y el fondo «Seda» — 2026-11-18

Rama `claude/system-aesthetics-analysis-96733d`. **Solo maqueta: nada del ERP cambió.** Sin ADR todavía: se reserva al empezar la
construcción.

## Lo decidido por Felipe (mirando la maqueta)

- [x] **El vidrio dobla lo de atrás.** Preset «E · Elegido» de `docs/maquetas/vidrio-que-dobla-2026-11/index.html`: dobla, arcoíris del
      canto, relleno claro, profundidad, grano y movimiento; **sin** luz al mouse. Nitidez 0,45 · reflejo 0,3 · curva 0,9.
- [x] **El fondo es «Seda», difuminado.** Cuatro pliegues enormes en una sola familia de color (de la crema al ámbar), con un
      desenfoque de 18 px horneado en la imagen. Reemplaza a la Aurora: Felipe no quiere «fondos planos ni puntos de colores que se
      desvanecen», y tampoco líneas nítidas que distraigan.

## Lo hecho

- [x] Investigación: la refracción real se logra con un filtro SVG de desplazamiento dentro de `backdrop-filter`. Solo Chrome y Edge;
      Safari y Firefox se quedan con el desenfoque. Descartados: WebGL con foto de la página (ignora lo `fixed`), HTML-in-Canvas
      (recién saliendo) y stay-liquid (es para apps de iPhone con Capacitor).
- [x] Maqueta con seis direcciones de vidrio, tres deslizadores, quince fondos y un botón «Medir fluidez». Probada en Chrome 156 en
      claro, oscuro, 375 px, 1440 px, con la hoja abierta y con el respaldo sin refracción. Sin errores de consola.
- [x] Lámina de referencias (Apple, Microsoft, Linear, Stripe, Raycast y otros) en `…/referencias/`. **No entra a git:** son capturas
      de terceros y el repo es público. Está excluida solo en esta máquina (`.git/info/exclude`).
- [x] Medido en esta máquina: 75 cuadros por segundo con y sin refracción, también con la hoja abierta. Dibujar Seda toma 8 ms.

## Lo que falta para llevarlo al ERP

Va con `/construir` (lista aprobada por Felipe antes de tocar código) y `/milimetro diseñar`. Toca más de un módulo y el diseño de
Dynamic.

- [ ] **Reservar el ADR** (`pnpm reservar adr`) y escribirlo. Actualiza ADR-0596 (el vidrio) y ADR-0623 (lo que se desplaza no se
      desenfoca).
- [ ] **El fondo:** reemplaza `.marco-aurora` (`apps/web/app/estilos/vidrio/marco.css`). Se dibuja una vez con los tokens, en claro y
      en oscuro. En modo liviano y con «reducir transparencia» queda la crema plana.
- [ ] **La lente:** va en una capa hija de cada pieza, nunca en la hoja misma (la volvería el contenedor de las listas de sus combos,
      ADR-0596). Detrás de `@supports (backdrop-filter: url(#x))`; sin soporte queda el vidrio de hoy. Necesita su versión en
      `aguanta.css`, y con las animaciones apagadas no «se asienta».
- [ ] **Solo en lo que flota:** cabecera, riel, isla, avisos y hojas. **Sin decidir:** si las tarjetas y las tablas vuelven a ser casi
      sólidas, como hacen los referentes.
- [ ] **Dynamic:** `recetas.css` solo admite variables, así que el filtro es una pieza nueva y queda como tarea allá.

## Sin medir y sin saber

- [ ] **Sin medir:** la fluidez en el Mac mini (la maqueta trae el botón), el contraste del texto sobre Seda y sobre el vidrio claro, y
      un Safari o un iPhone de verdad (solo se simuló el respaldo).
- [ ] **Sin saber:** qué navegador usa el Mac mini. Si es Safari, verá el respaldo y no la refracción.

## Aprendido al armar la maqueta (vale para el ERP)

- Un `mix-blend-mode` dentro de la pieza, o animar la opacidad de la pieza entera, la aíslan: su lente se queda sin nada que doblar. La
  opacidad se anima en los hijos.
- Una hoja con formulario no puede ser vidrio claro: el texto de atrás choca con los campos. Dos vidrios, como Apple: uno más
  desenfocado para hojas, barras y avisos; uno claro para controles chicos.
- Un patrón que se repite (cuadros, escamas, rombos) no sirve de fondo. Los referentes usan una sola forma grande, en un solo color.
