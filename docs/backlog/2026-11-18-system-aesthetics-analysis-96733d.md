# El vidrio que dobla y el fondo «Seda» — 2026-11-18

Rama `claude/system-aesthetics-analysis-96733d`. ADR-0681. Primero la maqueta; después, el mismo día, al ERP. Sin migraciones.

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

## En el ERP (ADR-0681; cuatro actividades de `/construir`, una por commit)

- [x] **Seda reemplaza a la Aurora** (`98d2407d7`). Nueve degradados de CSS en `.marco-seda`, sin `filter` y sin JavaScript. Sus tonos no
      salen del rango en que todo texto se lee: `lib/tema-tokens.test.ts` mide 16 colores de texto sobre 4 tonos en 2 temas (el más
      justo, el rojo: 4,54:1). **Es más pálida que la maqueta**, que llegaba a un tostado de 2,7:1.
- [x] **La cabecera dobla** (`2f96638ed`, `97c0d870d`). El motor: `lib/vidrio-dobla.ts` (pura, con prueba), `components/ui/useVidrioQueDobla.ts`
      y `estilos/vidrio/dobla.css`. Relleno claro con un piso de luminosidad: la tinta pasa 4.5:1 con cualquier cosa detrás (4,86 y 4,83).
      Mientras dobla, «Buscar…» y «Actividad» van en tinta plena.
- [x] **El aviso, el cajón de módulo y la isla del celular doblan** (`bec1d4dd8`). Con relleno propio: llevan texto en taupe sobre su vidrio.
      Se asientan al aparecer (480 ms, una vez); con las animaciones apagadas aparecen ya asentados.
- [x] **Las hojas y los cajones doblan** (`c29e73e21`). La hoja sigue sin `backdrop-filter`: su lente es una hermana anclada a su caja.
      Verificado con un combo abierto en «Ajustar stock»: la lista se puede tocar entera. Una prueba cuida que nadie le ponga el filtro a la hoja.
- [x] Verificado en un Chrome de prueba, en claro y oscuro: 955 archivos de prueba en verde, `knip` limpio, 60 cuadros por segundo con la
      lente y sin ella, y `/milimetro auditar` con 0 hallazgos nuevos (`docs/milimetro/auditorias/2026-11-18-vidrio-que-dobla-y-seda.md`).

## Lo que cambia a la vista, para que nadie se sorprenda

- Con una hoja abierta, lo de afuera se sigue viendo desenfocado, como siempre (corregido el 2026-11-19: la primera versión lo dejaba
  nítido y atenuado).
- El menú lateral de escritorio ya no tiene fondo propio: Seda sigue por detrás, de borde a borde.
- En Safari, Firefox, modo liviano y con «menos transparencia» o «más contraste»: Seda de fondo y el vidrio de siempre.
- En el celular doblan la cabecera, el aviso y la isla. La hoja y el cajón no: se arrastran con el dedo.

## Ajustes del 2026-11-19, con Felipe mirando el ERP local

- [x] **«¿Por qué ya no se difumina lo de atrás?»** Con la lente, el velo dejaba de desenfocar para que el canto tuviera algo nítido
      que doblar. Ahora lo de afuera lo desenfoca un marco hermano con el hueco de la hoja (`.hoja-afuera`, `estilos/vidrio/dobla.css`).
      Medido: fuera de la hoja, la pantalla con el marco y con el velo de antes difieren en 3 de 255 como máximo.
- [x] **«El fondo tiene que abarcar el menú lateral»**. El riel de escritorio quedó sin fondo propio (`estilos/vidrio/marco.css`); en modo
      liviano vuelve al liso. El medidor de color dio 0 fallas de texto en el menú, en claro y en oscuro.

## Lámina de ocho mejoras de estética (2026-11-19)

`docs/maquetas/ocho-mejoras-2026-11/`. Solo propuesta: nada del ERP cambió. Mi orden después de verlas:

- [ ] **1 · Fotos recortadas.** 11 de 18 fotos a la vista en Productos y 7 de 12 en Existencias traen fondo claro. Recortarlas con
      IA cuesta por foto: decide Felipe.
- [ ] **3 · Animaciones encendidas de fábrica**, con un modo ligero. Reabre ADR-0625: decide Felipe.
- [ ] **5 · La foto que viaja a la hoja** (View Transitions; `<ViewTransition>` pide React 19.3). Cambia ADR-0136: decide Felipe.
- [ ] **2 · Cifras alineadas.** DM Sans no trae cifras de ancho fijo; los dígitos saldrían de Inter por `unicode-range`.
- [ ] **6 · La cabecera que se pliega al bajar** (animación guiada por el scroll, en CSS).
- [ ] **8 · El rojo en gama amplia.** Los colores de marca viajan a Dynamic por contrato.
- [ ] **7 · Escala cerrada de letra y de esquinas.** Se nota poco en una pantalla; va por `/unificar`.
- [ ] **4 · Superficies sólidas.** Casi no cambia a la vista: la dejaría.

## Las ocho mejoras: lista de actividades propuesta (2026-11-19, espera el OK de Felipe)

Felipe: «Quiero las 8 pero en particular la 7 quiero especial énfasis»: letra más grande y muy poco texto, conciso y sin
tecnicismos. Lámina para elegir el tamaño y el tono: `docs/maquetas/escala-de-letra-2026-11/`. Recomiendo la escala B.
Con `/construir`: una actividad, un commit; cada una en su PR chico, porque `main` avanza rápido.

- [ ] **0 · Antes de empezar:** abrir el PR de lo ya hecho en esta rama y partir de `main` al día (la rama está 61 commits atrás).
- [ ] **1 · La escala de letra en un solo lugar, con su candado.** Sube el menú, la cabecera, las etiquetas y los chips en todo el ERP.
- [ ] **2 · Las cifras alineadas** (mejora 2). Toca la misma definición de letra.
- [ ] **3 · Letra y texto de las piezas comunes** (hojas, tablas, tarjetas de cifra, avisos, vacíos, el «?»).
- [ ] **4 · Letra y texto de Ventas** (Vender, Caja, Cambios, Devoluciones, Apartados, Historial), con captura a 375 px.
- [ ] **5 · Letra y texto de Inventario y Catálogo.**
- [ ] **6 · Letra y texto de Compras, Gestión y Rendimiento.**
- [ ] **7 · Letra y texto de Finanzas, Clientes, Tienda web y Configuración.** La deuda de la prueba llega a cero.
- [x] **8 · Esquinas:** cuatro radios, y concéntricas. Hecho el 2026-11-23 (ADR-0698, `docs/backlog/2026-11-23-esquinas-cuatro-radios.md`). Quedan las
      piezas de diseño propio, que decide Felipe.
- [ ] **9 · Animaciones encendidas de fábrica** (mejora 3). Reabre ADR-0625.
- [ ] **10 · La cabecera que se pliega al bajar** (mejora 6).
- [ ] **11 · La foto que viaja a la hoja** (mejora 5), con la subida de React a 19.3. Cambia ADR-0136.
- [ ] **12 · El rojo en gama amplia** (mejora 8). Los colores de marca viajan a Dynamic por contrato.
- [ ] **13 · Superficies sólidas** (mejora 4). `recetas.css` llega solo a Dynamic.
- [ ] **14 · Fotos recortadas** (mejora 1): contar todo el catálogo y un filtro «Con fondo» en Productos. El recorte lo decide Felipe:
      con IA cuesta por foto y escribe en producción.

## Pendiente

- [ ] **Sin medir:** el Mac mini de la tienda y un teléfono de verdad. Si va lento, la salida es el modo liviano de «Apariencia».
- [ ] **Sin saber:** qué navegador usa el Mac mini. Si es Safari, no verá la refracción.
- [ ] **Sin abrir:** Safari y Firefox reales. El respaldo se comprobó por la pregunta al navegador.
- [ ] **Sin decidir (Felipe):** si las tarjetas y las tablas vuelven a ser casi sólidas, como hacen los referentes.
- [ ] **Fuera a propósito:** el vidrio en el riel del menú de escritorio (deja ver Seda, pero no desenfoca ni dobla), «la hoja nace del botón» (cambiaría ADR-0136), la
      luz que sigue al mouse (Felipe la apagó), las listas de los combos y el vidrio propio de Rendimiento, Observatorio y Vender.
- [ ] Las barras que usan la clase `barra-abajo` a mano, sin `<BarraDeAbajo>`, no doblan.
- [ ] El cajón lateral con velo casi no muestra el canto doblado: su velo sí desenfoca lo de atrás.
- [ ] **Dynamic:** el bloque nuevo de `recetas.css` le llega solo (sin efecto hasta que tenga la pieza). El motor, `dobla.css`, las dos hermanas de
      `Modal` (la lente y el marco de afuera), Seda y el menú sin fondo propio quedan como tarea allá.
- [ ] **Cruce posible** con `claude/graves-heredados-milimetro`, que toca los mismos estilos. Revisarlo al abrir el PR.

## Aprendido al armar la maqueta (vale para el ERP)

- Un `mix-blend-mode` dentro de la pieza, o animar la opacidad de la pieza entera, la aíslan: su lente se queda sin nada que doblar. La
  opacidad se anima en los hijos.
- Una hoja con formulario no puede ser vidrio claro: el texto de atrás choca con los campos. Dos vidrios, como Apple: uno más
  desenfocado para hojas, barras y avisos; uno claro para controles chicos.
- Un patrón que se repite (cuadros, escamas, rombos) no sirve de fondo. Los referentes usan una sola forma grande, en un solo color.
- El servidor local guarda la compilación de los estilos: una hoja de estilos nueva importada en `globals.css`, o un cambio hecho desde
  la terminal, puede no entrar hasta que se edita `globals.css` con contenido nuevo. Si una regla «no gana», mirar primero si llegó al CSS.
- El posicionamiento por ancla exige que el ancla y lo anclado compartan el bloque contenedor. Con la lente en `fixed`, el navegador
  descartaba el ancla sin avisar y la lente medía cero.
