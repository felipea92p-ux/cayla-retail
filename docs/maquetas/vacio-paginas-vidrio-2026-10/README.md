# Maqueta · el estado vacío y la paginación, con vidrio (2026-11-01)

Piezas de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `<Vacio>` (217 archivos, 157 en su versión chica) y
`<Paginas>` (con quienes la usan: `PaginacionLocal` 17, `PaginacionPaginas` 3, `PaginacionCursor` 5). Van juntas
porque las dos viven al final de una lista: la lista llena termina en sus páginas; la vacía, en su vacío.

Abrir `index.html` (o con la config `maquetas`). Va sobre el marco y las piezas elegidas (`../vidrio-base-2026-10/`), en una pantalla de
Pagos a proveedores: la lista «Con datos» (5 filas y sus páginas; tocar una página hace viajar la marca), «Aún no hay nada» (el vacío
grande con su botón) y «Nada con estos filtros» (lo buscado, los filtros puestos y «Borrar la búsqueda»). Abajo, una tarjeta con el vacío
chico de una línea.

## Lo que hay hoy

- **Vacío:** el ícono de lo que falta en un círculo hueso macizo que se dibuja con una onda, el título serif, la frase y el botón; los
  filtros puestos en tinta sólida.
- **Páginas:** números de 13 px en 32 px; la actual, una píldora de tinta sólida que se desliza.

## Las caras

| Pieza | Caras |
|---|---|
| Vacío | A · Lente que espera (lente de vidrio con aro punteado) · **B · Pozo** (lo que falta es un hueco; solo el botón sobresale) |
| Páginas | **A · Gota en su pozo** (los números en un pozo, la actual es la gota clara que viaja, como las pestañas) · B · Ahumada suelta |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`. Los filtros puestos del vacío ya son los
elegidos (ahumados con su ✕).

## Lo que no cambia

El ícono de lo que falta que se dibuja una vez, el título, la frase que dice qué hacer y el botón que lo hace; al no encontrar, lo
buscado, los filtros que se quitan y «Borrar la búsqueda»; el vacío chico. Las páginas con sus flechas, los cortes «…», la actual que se
desliza (320 ms, sin rebote) y la vuelta al inicio de la tabla.

**En el teléfono angosto (≤ 400 px)** las páginas dejan solo la actual y sus vecinas («‹ 2 3 4 ›»); la frase de al lado ya dice
«página 3 de 9». Sin eso, a 320 px la fila se salía de la tarjeta.

## Medido

En Chrome sin ventana: 90 combinaciones (320 a 1440 px, claro y oscuro, las tres listas, las tres caras de páginas), nada se desborda;
sin errores de JS. La marca de la página viaja (112 → 134 px, a medio camino a los 80 ms).
