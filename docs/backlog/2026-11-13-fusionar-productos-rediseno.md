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
- [x] Felipe eligió **B · La ficha que se arma** (2026-11-13): las fichas a la izquierda y «Así va a quedar» a la derecha, que cambia con cada elección.
- [x] Felipe aprobó las 8 actividades (2026-11-13), con las seis skills de «Al milímetro».
- [x] 1 · Ficha al milímetro: `docs/milimetro/fusionar-productos.md`.
- [x] 2 · Datos para comparar: `fn_existencias(null, ids)` + `variantes` (sin migración).
- [x] 3 · Lógica pura con pruebas: matriz final, ficha «Así va a quedar», orden fijo.
- [x] 4 · Hoja nueva B: columnas en vidrio, la elegida en gota + ✓, sin reordenar; «Así va a quedar» pegada a la derecha.
- [x] 5 · Hoja para comparar («Ver ficha»): galería, ventas, stock por sede, tallas, precio, costo y alta.
- [x] 6 · «Revisar y fusionar», «Sí, fusionar» y el sello «Fusionado».
- [x] 7 · Movimiento rico una vez (excepción en ADR-0136 y CLAUDE.md, con su prueba).
- [x] 8 · Cierre: guía de foco, guía interactiva y huella, oscuro, 375 px, `/milimetro auditar`, `/chaos`, ADR-0650, bitácora, PR.

Para mostrarle a Felipe: «Fotos que quedan» no estaba en la maqueta B; va como tercer bloque bajo «Lo que es distinto» (ADR-0650, decisión 9).

## Después del PR (2026-11-13, pedido de Felipe)

- [x] El pie fijo de la hoja en una sola fila (~120 → 68 px): «la parte de abajo ocupa mucho espacio».
- [x] `/chaos` (semilla 1113): 3 hallazgos arreglados, cada uno con su prueba en `lib/fusionar-productos-reglas.test.ts`.
- [x] Las leves de `/milimetro` que son de la hoja.
- [x] (Felipe dijo que sí, 2026-11-13: «Yes, the whole ERP») Heredado de piezas del sistema (cambia todas las hojas del ERP: decisión de Felipe): letra de lectura < 14 px en la bajada de `<Modal>`
      (13,5), la ayuda de `<CampoGuiado>` (12–13) y la cuenta de `<TituloGrupo>` (10,5–11); y el hilo de `<Buscador>` que corre invisible en bucle.
