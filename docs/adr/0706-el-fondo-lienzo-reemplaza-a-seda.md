# ADR-0706 — El fondo «Lienzo» reemplaza a Seda

- **Fecha:** 2026-11-26 · **Estado:** construido en la rama `claude/clean-minimal-backgrounds-a49500`. Sin migraciones ni base: entra al
  fusionar y publicar la web. Número reservado con `pnpm reservar adr`.
- **Pidió:** Felipe, 2026-11-26: «ahora se ve como manchas blancas atrás, queremos algo limpio y minimalista». Eligió mirando la maqueta
  `docs/maquetas/fondo-limpio-2026-11/` (el fondo actual y cinco alternativas, en claro y oscuro): la opción «A · Lienzo».
- **Reemplaza:** la parte del fondo de ADR-0681 (Seda). El vidrio que dobla de ese ADR sigue igual.
- **Sigue a:** ADR-0596 (el ERP pasa al vidrio), ADR-0623 (lo fijo detrás de todo no se desenfoca), ADR-0136 (movimiento), ADR-0169 y
  ADR-0336 (solo tokens, claro y oscuro).

## El problema

Seda eran cuatro pliegues enormes, y cada uno terminaba en un canto casi blanco (`--seda-brillo`: 60 % de blanco sobre papel). Ese canto,
visto a través de una tarjeta de vidrio que desenfoca, deja de ser una curva y se vuelve una mancha clara detrás de las cifras y las
tablas. Es el mismo defecto que tuvo la Aurora (tres nubes): cualquier forma detrás del vidrio se lee como suciedad cuando encima hay datos.

## La decisión

DECIDÍ: el fondo no dibuja nada. `.marco-lienzo` (`apps/web/app/estilos/vidrio/marco.css`) es **un solo degradado recto, de arriba abajo,
entre dos tonos de la misma familia**: en claro, de crema a crema con 46 % de hueso; en oscuro, del crema con 45 % de papel al crema. Sigue
fijo detrás de todo, entra una vez con un fundido y no se mueve. La jerarquía la llevan las tarjetas, no el fondo.

Es lo que hacen las herramientas de trabajo que se miraron: Linear («no compitas por una atención que no te has ganado», superficies
neutras), Shopify Polaris (un lienzo liso y tarjetas más claras encima) y Apple, que reserva el vidrio para controles y navegación y pide
materiales estándar para el fondo.

DESCARTÉ (las cuatro están dibujadas en la maqueta):
- **B · Un pliegue** (una sola curva de Seda que solo oscurece): sigue habiendo una forma detrás de las tarjetas.
- **C · Trama** (puntos finos): le da al vidrio algo que desenfocar, pero tiene un aire más técnico que de boutique. Es la segunda opción
  si el Lienzo se siente plano.
- **D · Lino** (hilos cruzados): hilos de 1 px cada 4 px pueden vibrar en pantallas de baja resolución; no se probó.
- **E · Papel** (grano con un filtro SVG): el más caro de dibujar y el grano puede leerse como sucio.

## Lo que se paga

Felipe pidió el 2026-11-18 lo contrario («no fondos planos»), porque sobre un fondo liso el vidrio que dobla no tiene qué doblar. Con el
Lienzo, **el canto de una pieza que flota sobre el fondo vacío casi no muestra el doblez**; sí lo muestra cuando por detrás pasa
contenido (una tabla bajo la cabecera, la pantalla bajo una hoja), que es donde más se veía. Las tarjetas se leen como placas claras.

## Lo que no se cambia sin leer esto

- **Sus dos tonos no salen del rango en que todo texto se lee** (sobre el fondo va texto directo). Lo mide `lib/tema-tokens.test.ts`,
  «el fondo Lienzo»: todo color de texto ≥ 4.5 sobre el tono de arriba y el de abajo, en claro y en oscuro.
- **No lleva formas, ni `filter`, ni una imagen.** La misma prueba rechaza un `radial-gradient`, un `conic-gradient` o un `url()` ahí.
- **Modo liviano:** la capa se apaga (`estilos/liviano.css`) y queda el crema del `body`, como antes.

SE ROMPE SI: alguien «le da vida» al fondo con una nube, una curva o un brillo: vuelve la mancha. Una textura (Trama) se decide mirando
una maqueta, no en el código.

## Cómo se verificó

`vitest` de `tema-tokens`, `liviano`, `tema-colores`, `beige-plano` y `movimiento-reglas` en verde. En el navegador, con las hojas reales
del ERP en una página temporal (datos inventados): el degradado calculado es el esperado en claro y en oscuro, no queda ningún
`.marco-seda`, y se miró a ancho de escritorio y a 375 px. **No se miró dentro del ERP con sesión** (el marco completo con menú y cabecera).
