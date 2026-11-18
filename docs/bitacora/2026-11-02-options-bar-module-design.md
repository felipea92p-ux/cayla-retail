# 2026-11-02 · options-bar-module-design

- **Qué:** el menú lateral de escritorio pasa de riel de vidrio (degradado, aro de luz rojo, sombra larga) a una columna lisa que sigue el tema:
  papel con una línea fina en claro, negro cálido bajo la página en oscuro. Felipe: «el degradado entre el menú y el contenido se ve raro».
  La nube roja de la aurora ya no nace bajo el menú.
- **Dónde:** `apps/web/app/estilos/vidrio/recetas.css` (tokens `--riel-fondo`, `--riel-borde`, `--bandeja-*`, `--menu-activa-*`) y `vidrio/marco.css`.
  Solo CSS; el cajón del celular (bajo 640 px) no cambia.
- **Verificado:** vitest (`tema-tokens`, `hover-con-mouse`, `tema-colores`, `unificar`) en verde; en el navegador, claro, oscuro, plegado y 375 px.
