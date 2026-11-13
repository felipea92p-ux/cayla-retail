# Fusionar productos: el rediseño de la hoja (2026-11-13)

Sigue de ADR-0650 (la fusión ya está en producción y la web publicada, PR #1794). Felipe probó la hoja en local y pidió mejorarla.

## Lo que Felipe vio al probarla

1. Al elegir la ficha que queda o una opción, la tarjeta se pinta de un color sólido (`bg-hueso`): desentona con el vidrio del ERP.
2. Al tocar la ficha que queda, las tarjetas cambian de lugar: confunde. Que se queden en su sitio y solo se distinga la elegida.
3. Mejorar bastante el diseño, que sea más fácil de entender, más estético e interactivo; y un botón junto a la foto de cada prenda
   para ver su ficha completa (la foto en grande, las ventas y lo más importante) y comparar mejor.

## Las 10 decisiones (2026-11-13)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Cómo se arma la hoja | **Lado a lado:** cada ficha una columna; en cada fila distinta se toca el valor que se queda |
| 2 | Cómo se ve la elegida | **Gota de vidrio + ✓** y la insignia «Queda»; las demás en vidrio claro |
| 3 | Orden de las fichas | **Fijo, como se agregaron:** nada se mueve al elegir |
| 4 | El botón de ver la ficha | **Una hoja para comparar**, encima de la fusión, con las fichas lado a lado |
| 5 | Qué datos compara | **Ventas, stock por sede, tallas y colores, precio, costo y alta** |
| 6 | Las fotos | **Galería de cada una:** la principal grande y sus fotos chicas debajo |
| 7 | Qué pasa con las tallas | **Matriz visual** color × talla: qué pasa y qué se junta (+3), con una frase corta |
| 8 | Movimiento | **Rico, una vez**, sin rebote ni bucle; quieto con «Animaciones» apagado |
| 9 | Antes de construir | **Dos direcciones en maqueta tocable**, en claro y oscuro; Felipe elige mirando |
| 10 | Confirmar | **«Revisar y fusionar»:** un último vistazo grande con «Sí, fusionar» |

## Estado

- [x] Maqueta con dos direcciones: `docs/maquetas/fusionar-productos-2026-11/` (A · La mesa, B · La ficha que se arma), revisada en claro, oscuro y 375 px.
- [ ] Felipe elige; recién ahí la lista de actividades y el código (`/milimetro diseñar` antes, `/milimetro auditar` después).
