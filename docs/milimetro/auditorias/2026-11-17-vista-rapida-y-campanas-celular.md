# Auditoría al milímetro — la vista rápida de Productos y Campañas y ofertas en el celular · 2026-11-17 · `claude/vista-rapida-acciones`

Medido: 350×750 claro vivo · 350 oscuro · foco con teclado en la barra nueva · 1440×900 claro (que no cambie). Servidor: `localhost:3010` (base local, sede Lima).
Alcance: lo que cambió. (1) Vista rápida de Productos: bajo 640 px, los botones de la prenda pegados abajo solo en ícono y, al final de la hoja, con su
nombre; «Ver en Existencias» sin la flecha. (2) Campañas y ofertas: «+ Nueva campaña» en su «+», al lado de «Cómo se ven en la web», hasta el margen.
(3) Los pases de Campañas e Insignias con borde `borde-control`.

Resumen: **0 graves · 0 medias · 0 leves abiertas** · 1 grave propia corregida (el pase se fundía con el fondo) · heredados anotados.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Barra de íconos (350) | 5 × 51 × 44 px en una fila; nombre de cada uno para el lector y en `title`; 0 blancos bajo 44 con el dedo | ADR-0611 mejora 5 · WCAG 2.5.8 | pasa |
| Barra ↔ botones con nombre | arriba, la barra a la vista; al final, los botones con nombre y la barra apartada (opacidad 0, `inert`): nunca los dos a la vez | — | pasa |
| «Ver en Existencias» (350) | toda la fila (288 px), sin flecha, el texto cabe (antes se salía del botón) | — | pasa |
| Escritorio (1440) | el pie de siempre, pegado, con los cinco botones en una fila; sin barra de íconos | — | pasa |
| Foco en la barra | 5/5 con anillo, 0 tapados | WCAG 2.4.7, 2.4.11 `[Norma]` | pasa |
| Cabecera de Campañas (350) | «Cómo se ven en la web» 227 px y el «+» 79 × 44 px en la misma fila, hasta el margen (334); Insignias conserva «+ Nueva insignia» con su palabra | — | pasa |
| Contraste (barra, cabecera, pases) | 0 textos ni controles que fallen en claro y en oscuro | WCAG 1.4.3, 1.4.11 `[Norma]` | pasa |
| Guías interactivas | `guias:recorrer` en verde: productos 375 (27) y 1440 (30); productos.campanas 375 y 1440 (27); productos.sellos 375 (15); huellas aceptadas | ADR-0389 | pasa |

## Corregido en esta pasada

1. **(Grave, WCAG 1.4.11) Los pases de color suave se fundían con el fondo.** El borde era `sand` (decorativo): contra el fondo de la página, ~1,1:1; las cabeceras de
   «Lo que viene» (pizarra al 12 %) y «Guardadas» (hueso), ~1,1:1. El pase se toca (se abre), y lo que se toca lleva `borde-control` (≥ 3:1, ADR-0169 / ADR-0516 act.):
   `app/estilos/sellos.css`, también en los recortes del ticket. En oscuro toma su variante del token.

## Heredado (no lo trae este cambio)

1. Versalitas de 9,5 px en «faltan», «sin fechas» y «días» de cada pase (`.sl-cab-marca small`), bajo el piso de 11 px: ADR-0481, ya anotado en auditorías anteriores.
2. El pie con nombres de la vista rápida, al final, deja ~78 px de aire bajo él en el celular: es el lugar de la barra apartada (no se recoge a propósito, para que la hoja no salte).

## Sin medir

- «Top Flower» y las prendas de producción (la base local no las tiene); se probó con «Bolso Tote Sol», también sin unidades en Lima.
- `tema:auditar`.
