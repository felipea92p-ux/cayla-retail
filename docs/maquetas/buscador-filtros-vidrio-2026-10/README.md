# Maqueta · el buscador y los filtros con vidrio (2026-10-31)

Pieza de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596). Van juntos porque viven en la misma barra, arriba de una lista:
`<Buscador>` (67 archivos), la píldora que filtra `pildora-cayla` (101), `<DesplegablePildora>` (20), `<BotonFiltros>` (6),
`<FiltroPuesto>` (12) y `<BotonLimpiar>` (17).

Abrir `index.html` (o con la config `maquetas`). Va sobre el marco y las piezas elegidas (`../vidrio-base-2026-10/`), en Catálogo ▸
Productos. Todo funciona: se busca mientras se escribe («/» lleva al campo, la × borra), las píldoras filtran con su cuenta, «Categoría»
abre el combo elegido (gota viajera), lo puesto sale arriba con su ✕ y «Limpiar todo». «Ver «Buscando…»» muestra el hilo.

## Las caras

| Pieza | Como ahora | Caras |
|---|---|---|
| Buscador | caja hueso de 40 px, borde de control | **A · Pozo** (el campo hundido elegido; al escribir sube sin volverse sólido) · B · Lente (sobresale, la lupa en su lente) |
| Filtros | la puesta en tinta sólida | **A · Gotas, la puesta ahumada** (el ahumado de los controles del Observatorio, con ✓; sueltas, nunca en un pozo) · B · Chips con ✓ (la puesta se hunde) |

En negrita, la recomendada. Regla que se cuida: la píldora que filtra no se parece a la pestaña (pozo y gota, ADR-0358). Lo que gana y lo
que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Busca mientras se escribe, «/», la ×, «Buscando…» y su hilo después de 350 ms, el conteo; la píldora filtra al tocar; el combo de la
píldora abre la lista elegida; lo puesto se quita con su ✕ y «Limpiar todo» quita todo. El buscador del mostrador (60 px) sigue la cara
que se elija.

## Medido

En Chrome sin ventana: 30 combinaciones (320 a 1440 px, claro y oscuro, las tres caras), nada se desborda; sin errores de JS. Corregido
al medir: el navegador agregaba su propia × al campo, y en oscuro la píldora puesta quedaba con la letra oscura sobre oscuro.

## Lo que decidió Felipe

Pendiente.
