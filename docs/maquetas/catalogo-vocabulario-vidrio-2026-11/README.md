# Maqueta · Catálogo ▸ Categorías, Marcas y Atributos con vidrio (2026-11-02)

Tres páginas de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596) en una sola maqueta, porque comparten su tarjeta:
Catálogo ▸ Categorías (`/productos/categorias` → `CategoriasLista`), Marcas (`/productos/marcas` → `MarcasLista`, ADR-0109 y ADR-0373) y
Atributos (`/productos/atributos` → `AtributosHub`; aquí, su pestaña Colores).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la pantalla, la cara de lo propio, el tema y el
ancho (de 320 a 1920 px); «Nueva categoría» abre la hoja con «Existe también».

Está armada **solo con lo ya elegido**: cabecera A con sus gotas, pestañas A con su globito, buscador A · Pozo, filtros A · Gotas, títulos de
grupo con su globito, insignia A («Pendiente»), paginación A, botones gota y la hoja Serena con sus campos hundidos.

**Dos cosas que no se tocan:**
- **El buscador de Marcas con su sombra** (ADR-0373) es una excepción decidida: aquí es el pozo elegido con la sombra que completa en gris y
  su «Tab».
- **«Existe también»** (ADR-0576) pregunta **dentro de la hoja**, sobre los botones, mientras se escribe el nombre; «Guardar» espera el «No,
  es otra». Su cara es el aviso ya elegido (B · Lente, en ámbar): no tiene caras propias.

## Lo propio (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| La tarjeta de un valor (`TarjetaAtributo`, que es también `TarjetaCategoria`; `TarjetaMarca` con la misma forma) | Como ahora | Tarjeta de papel con borde arena; la muestra (ícono sobre el tono de la familia, o el color), un recuadro de 8 px de esquina. |
| | **A · Muestra al aire** (recomendada) | La placa Serena; la muestra llega al borde de arriba, sin marco, como la foto de Productos elegida; un filo de luz la separa del texto. El monograma de una marca, una lente de su estado. |
| | B · Placa con su ventana | La placa Serena; la muestra dentro, con esquinas de 12 px, su filo y su luz. |
| El índice de letras de Marcas (`marcas/IndiceLetras`) | Como ahora | Cuadritos de 30 px; las letras de esta página sobre arena. |
| | **A · Ranura con gotas** (recomendada) | Las letras en una ranura, como la paginación elegida; las de esta página en gotas claras. |
| | B · Letras al aire | Solo letras; un punto bajo las de esta página. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Los grupos por familia, el tono de cada familia, el dibujo de cada categoría y su movimiento al pasar el mouse, el color de cada muestra (es
dato), la vista rápida, el buscador de Marcas con su sombra, el monograma y su estado, «Más ▾», «Pendiente» con Aprobar / Rechazar, el orden
de las pestañas de Atributos, y todo lo de «Existe también».

## Reglas que respeta

Solo tokens (los colores de las muestras son dato, `data-color-dato`). Claro y oscuro. Sin movimiento nuevo; todo se apaga con
`prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin que nada se salga. En la maqueta, `marco.css` ya usa `.tx` y `.mas`,
así que aquí se llaman `.cv-tx` y `.cv-mas`.

## Lo que decidió Felipe

Pendiente.
