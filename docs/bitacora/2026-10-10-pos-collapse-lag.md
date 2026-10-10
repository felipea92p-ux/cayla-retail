# 2026-10-10 — El tirón al plegar el menú en el Punto de venta

- **Qué:** al plegar el menú lateral, solo se anima el lateral; el contenido, la cabecera y las barras fijas saltan a su lugar en el primer cuadro (ADR-0130, actualización 2026-10-10).
- **Por qué:** animar el margen del `<main>` recalculaba la pantalla ~19 veces por plegado; en Vender (64 prendas, 1440 px) eran ~70 ms de recálculo contra ~24 ms ahora, y la grilla cambiaba de 3 a 4 columnas a mitad del movimiento.
- **Cómo verificas:** en `/vender` con varias prendas, plegar y expandir el menú (botón de la cabecera o `[`): el lateral se desliza y el catálogo aparece ya acomodado, sin tirón.
