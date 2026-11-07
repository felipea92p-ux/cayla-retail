# Maqueta · Producción ▸ Órdenes con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): la lista (`components/ordenes-lista/OrdenesLista.tsx`, «A · Lista» de ADR-0400) y
la página de una orden (`app/estilos/orden-pagina.css`, la «Ruta viva» de ADR-0570 que eligió Felipe el 2026-10-29).

- **La lista** se arma solo con piezas que ya tienen su cara elegida (cabecera, tarjetas de cifra que filtran, pestañas, buscador, la tabla en
  la placa, insignias en lente): aquí se ve cómo queda, sin nada que elegir.
- **La página de una orden** tiene lo propio: **la ruta** de pasos y **el paso abierto** debajo.

Abrir `index.html` (o con la config `maquetas`). «Pantalla» cambia entre la lista y una orden; tocar otro paso de la ruta lo abre y el pico lo sigue.

## Lo que hay hoy

La ruta: glifos de papel con borde arena, el hecho en verde sólido, el que toca con su aro ámbar, el paso elegido en hueso; el paso abierto en
una tarjeta de papel. La regla de color de Producción no cambia: verde solo lo hecho, ámbar lo que toca, rojo solo un problema.

## Las caras

| Pieza | Caras |
|---|---|
| La ruta | **A · Ranura con gotas** (la de los pasos de Conteo y Recibir, ya elegida: lo hecho en lente verde, lo que toca en lente ámbar, el elegido en la gota clara) · B · Lentes al aire |
| El paso abierto | **A · Placa con su pico** (la placa Serena con un pico que apunta al paso elegido; en el celular, con la ruta en columna, sin pico) · B · Al aire |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Medido

En Chrome sin ventana: 324 combinaciones (320 a 1920 px, claro y oscuro, lista y orden, todas las caras), nada se desborda; sin errores de JS;
el pico sigue al paso elegido (549 → 119 px al tocar Corte).

## Lo que decidió Felipe

**Ruta B · Lentes al aire y paso abierto A · Placa con su pico** (2026-11-02). En la ruta se recomendaba la A.
