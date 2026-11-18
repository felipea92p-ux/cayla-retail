# Formidable · Tienda web ▸ Tráfico (`/tienda-web/trafico`) — pasada rápida (2026-10-23)

Pasada **rápida**: solo medido (`referencia/medir-oficio.js`) a 1440, 1024 y 375 px y la vista de tabla a 1440, como líder, con 360 visitas
de prueba en la base local (datos inventados, ADR-0495). Un navegador sin ventana (Playwright, la sesión de `tema/`), porque el panel del
navegador estaba oculto. Sin prueba ciega y sin calificar las 9 leyes. Pantalla nueva, de solo lectura, escritorio primero. SHA de partida
`09b30f7fe` más los cambios de la actividad 7 (movimiento, oscuro, anchos).

## Medido
- **Contraste:** 0 textos bajo el mínimo en los tres anchos y en la tabla, en claro. En oscuro, `tema:auditar` con la pantalla, el cajón desde
  la vitrina y el cajón desde la tabla: **0 hallazgos solo en oscuro, 0 heredados**.
- **Sin scroll horizontal** a 375, 1024, 1280, 1440 y 1920 px.
- **Rojos:** 2 («Aquí se atora» y el lateral). **Acción principal:** ninguna (la pantalla solo lee; lo que se toca filtra o abre un cajón).
- **Blancos pequeños (< 24 px con mouse):** solo «Salir» del marco. **A 375 px (dedo, 44 px):** lo del marco, el segmento Gráfico/Tabla
  (40 px, pieza del sistema) y **las baldosas chicas de la vitrina** (la más chica, 59 × 41 px).
- **Huecos fuera de la escala de 4:** un aire de 1 px dentro de la etiqueta de papel y de la talla del cajón → **corregido a 0**; el de 15 px
  es del marco.
- **Texto chico (10–11 px):** todo del marco o de las versalitas del sistema («Entraron», «Por dónde llegan»).
- **Bordes casi alineados:** el lateral y la línea de sede (heredados) y el borde de la baldosa grande contra la tarjeta (1–2 px, por el
  aire de 3 px entre baldosas).
- **Nota sobre las capturas:** una captura de página completa tomada mientras la página era más alta que la ventana sacó la vitrina vacía;
  agrandar la ventana de verdad no la vacía (21 baldosas visibles, sin volver a animarse): es de la captura, no de la pantalla.

## Los 3 cambios que propondría (sin ejecutar; esperan el OK de Felipe)
1. **[Medido] En el celular, menos baldosas:** a 375 px, 12 prendas a la vista y las demás en «y N prendas más», para que ninguna baldosa
   quede bajo los 44 px de un dedo. La tabla ya lleva todas.
2. **[Medido] En el celular, la fila de controles ocupa cuatro renglones antes del contenido** (período, días, la pista y Gráfico/Tabla):
   la pista «Toca un camino o una ciudad…» solo en escritorio, y los días junto al período.
3. **[Opinión] Una prueba ciega con alguien de la tienda:** ¿entiende sin ayuda que el tamaño de cada cuadro es cuánta gente lo miró y que
   las filas de «De dónde vienen» filtran toda la pantalla?

## Lo que sobra (ley 8)
La leyenda «Tamaño: cuántos la miraron · franjas: los colores que eligieron» repite lo que la guía explica; podría vivir bajo un «¿Cómo se
lee?». Se deja hasta la prueba ciega.

## Antes de decir «listo»
- **Concurrencia:** solo lee; dos personas mirando a la vez ven lo mismo.
- **Caída externa:** si la base no responde, «No se pudo leer el tráfico» (sin cifras inventadas); si la tienda online deja de mandar
  visitas en horario de tienda, «La tienda online no manda visitas desde…».
- **Persona sin contexto:** sin probar.

## Pendiente
Ciega, real, escéptico y la calificación de las leyes. Esta fila no cuenta como «formidable».
