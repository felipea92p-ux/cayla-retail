# Al milímetro · casos de Campañas y ofertas (PR #1897)

**Fecha:** 2026-11-16 · **Rama:** `claude/ofertas-promociones-casos-689a3b` · **Modo:** `auditar`
**Dónde:** ERP local (puerto 3077) sobre una copia de la base con todas las migraciones, 1440 × 900 claro y oscuro, quieto y vivo.

## Qué cambia a la vista

Este PR no trae piezas nuevas: cambian textos y se suman piezas del sistema.

- `/productos/campanas`: el `<Aviso tono="atencion">` de «N prendas tienen dos ofertas» y su hoja (`AvisoDosOfertas`), los textos del pase
  (`SellosPantalla`) y de la hoja de la oferta (`OfertasHoja`).
- `/vender/historial`: el `<Chip tono="ambar">` «Oferta que cambió» (`HistorialVentasLista`).
- `/vender` y Apartar: una frase más en `PieDeGrupo` y el aviso de «Quedaría en».

## Números

**0 graves · 0 medias · 0 leves** en lo que cambia.

| Medidor | Resultado |
|---|---|
| Estados (`milimetro/medir.js`) | Sin apagados, errores ni esperas propias. |
| Color, 1440 claro | 0 textos fallan en `/productos/campanas`. |
| Color, oscuro | El chip «Oferta que cambió» (`text-ambar` sobre `bg-ambar/15`, 24 px de alto): pasa 4,5:1 en claro y en oscuro. |
| Tipografía | Lo de este PR no baja de 14 px; el chip es la versalita de `<Chip>` (pieza decidida). |
| Textos | «Sin fallas de texto medibles en esta vista». |

## Heredado (no es de este PR)

- **Pila «Lo que viene» y cabecera de los pases** (`sl-*`): valores fuera de la escala de 4 y versalitas de 9,5 px en los números del pase
  («días», «faltan»). Es el diseño de los pases de ADR-0481.
- **«No sale en la portada»** (`chip-cayla`, 13 px): la lectura chica de la pieza `<Chip>`.
- **Cifras sin tabulares en DM Sans** (`titulo-cuenta`): la propuesta 1 de `/tipografia`, ya en `docs/milimetro/propuestas.md`.
- **El menú lateral en oscuro** (`marco-etiqueta`, 1,07:1): el medidor lo lee mientras el vidrio cambia de tema; es del marco.
- **5 bucles** en la cabecera: el aviso de cierre de caja, permitido por ADR-0359.

## Sin medir

- **`PieDeGrupo` con los medidores:** la caja de la copia local está cerrada y Vender no abre el ticket. Su frase nueva se vio en el navegador,
  a unos 800 px, al probar el 3x2 de tres polos (PR). Es texto dentro de la pieza ya auditada el 2026-11-14.
- **El chip en la lista real:** el historial local lee la base compartida, donde ninguna venta tiene la marca; se midió un chip con las mismas
  clases puesto en una fila real (sin guardar nada).
- `tema:auditar`, 375 px con el dedo y `/chaos` completo.
