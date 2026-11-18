# Ficha al milímetro — la campaña en la lista y abierta (ADR-0677, actividad 6)

Diseñada el 2026-11-18 antes del código (`/milimetro diseñar`), sobre la cara A de `docs/maquetas/campanas-simple-2026-11/` que eligió Felipe.
Hermana de `fila-de-lista-campanas.md` (la fila de un descuento) y `panel-de-descuento.md` (su panel): la campaña usa las mismas piezas.

## El árbol (reglas 1–3)

| Pieza | Rama | Por qué |
|---|---|---|
| La fila de una campaña | **decidida, reusada:** `FilaDeLista` (la del descuento) | «El descuento y la campaña son la misma fila: se aprende una vez» (README de la maqueta). Cambia la lente por la insignia de la campaña (`SelloTinta` de 44 px, su forma simple bajo 56) y el título por su nombre |
| La cabecera del panel | **decidida, reusada:** `.lc-panel-cab` / `.lc-panel-pre` / `.lc-panel-tit` | la del descuento; el título es un nombre, no un %: baja a `clamp(32px, 3.6vw, 48px)` y puede partirse en dos líneas |
| Los tres chips | **decidida:** `<Chip>` (estado, fechas, tiendas) | estado con su punto; fechas y tiendas sin punto (`versalitas={false}`), tiendas en `pizarra` (lo informativo) |
| «Editar» y «Más» | **decididas:** `<BotonEditar chico>` y `<MenuAcciones texto="Más">` | las de toda la pantalla |
| La oferta como cartel | **nueva** (README: «la oferta como cartel» va por `/milimetro diseñar`) | no hay en el ERP una tarjeta que diga «lo que da» en grande con «a qué» debajo; se arma con el vidrio claro (`--vidrio-claro-*`, ADR-0623: la lista se desplaza) |
| Los títulos «Ofertas» y «Prendas» | **decidida:** `<TituloSeccion cuenta accion>` | el globito con cuántas, pegado al nombre (ronda 9) |
| Las prendas | **decidida, reusada:** `.lc-grilla` + `.sl-prenda` (la del panel del descuento) | misma grilla, sin la × (en una campaña se eligen en su hoja) |
| Sin prendas | **decidida:** `<Vacio tamano="chico">` | y si sus ofertas eligen las prendas, lo dice en vez de «sin prendas» |

## Medidas

- **Fila:** la de `fila-de-lista-campanas.md`; el título de nombre en la serif a 21 px (`.lc-fila-nombre`, una línea con «…»), la bajada «hasta el lunes 30 de
  noviembre» a 14 px; a la derecha la cifra y su palabra («12 días», «15 faltan») o solo la palabra («sin fechas», «14 feb»).
- **Cartel (`.lc-cartel`):** caja de 16 px de relleno y radio `--radius-tarjeta`, vidrio claro; arriba lo que da (`titularDeOferta`) en la serif a 28 px; debajo a qué
  (`alcanceDicho`, o «Toda la campaña» / «Toda la compra») a 14 px; un `<Chip>` si está en borrador o empieza después. Grilla `repeat(auto-fill, minmax(150px, 1fr))`
  con 12 px de hueco: de a dos a 375 px (339 de ancho útil), de a tres o cuatro al costado. «Nueva oferta»: el mismo cartel, punteado y sin relleno (como «Nuevo descuento»).
- **Aire:** 24 px de la cabecera a «Ofertas», 32 px de las ofertas a «Prendas» (el ritmo del panel del descuento: 24 / 32).

## Estados      (de /milimetro)

Pieza: el cartel de una oferta · rama del árbol: nueva → vidrio claro + piezas decididas

| Estado | Qué se ve (token / clase) | Qué se anuncia (ARIA) | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | vidrio claro, borde `--vidrio-claro-borde` | botón: «Ver la oferta 3 x 2, Polos» | medir.js · contraste | WCAG 1.4.3 `[Norma]` |
| hover | solo `@media (hover: hover)`: sube 1 px y el borde a tinta 25 % | — | medir.js · hoverSueltos | repo (`hover-con-mouse.test`) |
| focus-visible | el anillo de foco del sistema | — | medir.js { foco: true } | WCAG 2.4.7 `[Norma]` |
| active | `scale: 0.985` | — | a ojo + /movimiento | ADR-0136 |
| selected | no aplica: el cartel abre su hoja, no queda elegido | — | — | — |
| disabled | no aplica: quien no edita ve el cartel como texto (un `<div>`) | — | medir.js · apagados | — |
| loading | no aplica: no guarda | — | — | — |
| error | no aplica | — | — | — |
| read-only | quien no puede editar: el mismo cartel sin botón | — | — | — |
| vacío | sin ofertas: solo «Nueva oferta» (o el `<Vacio>` si no edita) | — | — | — |
| quieto | sin subir ni encogerse (ADR-0625); el borde sigue cambiando | — | medir.js con `data-movimiento=quieto` | ADR-0625 |

Accesibilidad: WCAG 1.4.3 y 1.4.11 (contraste del texto y del borde, medidos en claro y oscuro), 2.4.7 (anillo de foco), 4.1.2 (cada cartel es un botón
con su nombre entero; la fila dice «Campaña Black Friday, rige hasta el 30 de noviembre, 12 días»).

## Lo que sale del pase de hoy

«vendidas en 30 días» y «en las tiendas» (salían siempre «—»), la barra de días y su cifra grande (lo dice el chip de fechas), «Preparar la campaña» y sus
tres preguntas (las responden las secciones Ofertas y Prendas y el chip de fechas con «Editar»), y «Lo que ya tiene». Una campaña cuyas ofertas eligen
sus prendas ya no dice «sin prendas».

## Después de Formidable (2026-11-18): el cartel dice dónde y cuándo

- Una línea más bajo «a qué», en la misma voz (`.lc-cartel-en`, 14 px, tinta 65 %), pegada 4 px más arriba: «Solo Tienda Lima · 25 nov – 30 nov ·
  mar y jue». **Solo lo que no es lo de su campaña** (`cartelesDeCampana`, con `donde`): las tiendas si no son todas las de la campaña, las fechas
  si no son las suyas **comparadas desde hoy** (una oferta que nació hoy en una campaña que ya rige no repite «18 nov – 30 nov») y los días si no
  son los siete. Una programada con fechas propias dice «Programada» en su chip: la fecha ya va en la línea.

