# Base de las maquetas del vidrio (2026-10-31)

El marco ya elegido por Felipe (ADR-0596, `docs/maquetas/marco-vidrio-2026-10/`), separado para que cada maqueta de una pieza de pantalla
(`docs/vidrio/README.md`, sección 3) se vea en su lugar y no suelta: fondo B · Aurora, lateral B · Riel de vidrio con la gota, submódulos en
bandeja, plegado con nombre, cabecera C · Dos islas y el combo A · Gota viajera de la sede.

- `marco.css`: los tokens (claro y oscuro), el marco, la barra negra de la maqueta y el estilo del análisis del pie.
- `marco.js`: el menú real (`lib/menu.ts`, con sus 61 trazos de `lib/menu-iconos.ts`), la gota de la fila activa, plegar, el cajón del
  celular, la cabecera y el combo de la sede.

**Cómo se usa:** la maqueta enlaza los dos archivos, pone el esqueleto del aparato (`#disp` con `.lienzo`, `#lat`, `#plegar-flota`,
`#cab`, `#cont`, `#flotante`), pinta su pantalla en `#cont` y llama a `Marco.iniciar({ estado, alPintar, alAccion })`. Cada botón de la
barra (`.seg-m[data-ctl="x"]`) cambia `estado.x`, que llega al `<html>` como `data-x` (con `ahora` se quita: «Como ahora»). Modelo:
`docs/maquetas/cabecera-vidrio-2026-10/`.

Si Felipe cambia el marco, se cambia en su maqueta y se vuelve a copiar aquí.
