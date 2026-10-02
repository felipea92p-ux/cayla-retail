# ADR-0312 — Familias de color en espectro y una sola escala (2026-10-02)

> Numerado 0312 y no 0310 a propósito: el 0310 ya lo reclaman DOS ramas (`cambio-emisora-b002-b004-76656e`, «Serie 04 de
> AQP», y `sales-rounding-cash-36d9cd`, «Redondeo del efectivo») y, si una se renumera, caerá en el 0311.

**Problema.** La carta de colores tenía 9 familias que mezclaban tres criterios sin prioridad —matiz (azul, rojo…), rol
(neutro, tierra) y acabado (metálico)— y su orden no seguía nada (Azul antes que Rojo). Medido sobre los 75 colores de
producción (OKLCH, 2026-10-02):

- El naranja vivía dentro de Amarillo (Naranja 43°, Durazno 51°, Mandarina 66° de matiz) y el rosado dentro de Rojo. Quien
  busca «Naranja» no encuentra la fila y crea un color: «Azul medio» y «Azul Intermedio» (hechos a mano, con 12 y 3
  variantes) son nombres de un **escalón** de la escala, no de un color.
- Entre 25° y 103° de matiz no hay un hueco de más de 10°, y ahí convivían cinco familias; la frontera Neutro/Tierra partía
  una pareja que el propio ERP marcó como confundible (Beige–Arena, ΔE2000 6,0).
- Azul, Verde y Morado abarcan 46–69° de matiz; ordenadas solo por claridad, sus vecinos saltaban ~25° de matiz.
- El **orden de claro a oscuro, en cambio, casi no fallaba** (8 pares de ~320 invertidos): el problema eran las familias.
- Dos pantallas ordenaban distinto: Nuevo producto por brillo de RGB (subestima los azules) y Atributos → Colores por
  `colores.orden`, un número escrito a mano que un color recién creado (siempre 2000) dejaba fuera de lugar.
- La lista de familias vivía en 3 sitios (`colores-familias.ts`, una copia en `app/api/productos/colores/route.ts` y el
  candado de la base).

**Decisión (Felipe, opción B).**

1. **11 familias en orden de espectro**: Neutro, Tierra, Rosado, Rojo, Naranja, Amarillo, Verde, Azul, Morado, Metálico,
   Estampado. Se suman **Rosado** (Rosado, Palo rosa, Fucsia) y **Naranja** (Durazno, Salmón, Mandarina, Naranja); **Arena**
   pasa a Neutro para que Beige y Arena queden juntos y la frontera caiga en el salto Arena→Camel (ΔE2000 9,3).
2. **Prioridad de pertenencia escrita** (`lib/colores-familias.ts`): acabado > rol > matiz. Si un color cumple dos, manda el
   de menor número.
3. **Un solo orden, calculado del color** (`lib/color-escala.ts`): dentro de una familia, gamas de menor a mayor matiz y,
   dentro de cada gama, de más claro a más oscuro (claridad OKLab). Verde, Azul y Morado se parten en dos gamas (cortes a
   135°, 240° y 325°, en huecos naturales del círculo): el salto de matiz entre vecinos baja de ~25° a 10–16°. Lo usan la
   carta de Nuevo producto, Agregar colores y Atributos → Colores. `colores.orden` **ya no decide nada** en la web.
4. **Sale el campo «Orden»** del modal Editar color: con el orden calculado era un control que no hacía nada.
5. **La API valida con `esFamiliaDeColor`** (una sola lista en código); el candado de la base es su par.
6. **Apariencia de la carta.** Se midió primero: el círculo ya pintaba el `#hex` exacto (diferencia media 0,9 sobre 255 contra
   una captura convertida a sRGB; lo «apagado» de la captura era su perfil Wide Gamut sin convertir), así que no había un bug
   de color. Lo que se mejora: círculos de 32 px, borde del propio tono, respiro entre gamas, metal con reflejo de metal
   cepillado, ✓ legible sobre cualquier color (claridad OKLab) y un pie que dice el **Pantone TCX** (la referencia real de la
   tela) y con qué otro color se confunde.
7. **Migración** `20261002180000_colores_familias_rosado_naranja.sql`: cambia el candado, mueve los 8 colores, corrige
   «Amarrillo mantequilla» → «Amarillo mantequilla» (solo el nombre) y renumera `colores.orden` con el orden de la carta
   (una centena por familia, de 5 en 5) para que las listas planas que aún lo leen (Vender, Conteo) no contradigan a la carta.

**Descartado.**

- *Dejar las 9 familias y solo reordenar*: el naranja seguiría dentro de Amarillo. 
- *Cuadrícula tono × familia con columnas alineadas por claridad*: muestra los huecos del catálogo, pero es una pantalla nueva
  que a 375 px no cabe; el problema era de familias, no de la rejilla.
- *Guardar `gama` o `tono` como columnas*: salen del hex; guardarlas es un dato que se desactualiza al editar el hex.
- *Fusionar o retirar los 4 colores creados a mano* (Azul medio, Perla, Azul Intermedio, Amarrillo mantequilla): ya tienen 23
  variantes con stock (12, 7, 3, 1); fusionarlos toca SKUs. Quedan donde están.
- *Quitar `colores.orden` de las consultas de Vender y Conteo*: toca Vender (celular obligatorio) para un cambio de 0 efecto
  visible; se renumera en la base y listo.

**Se rompe si.**

- Alguien crea un color con matiz de frontera (36°–45°, un naranja quemado) y dos personas lo clasifican distinto, uno en
  Tierra y otro en Naranja: la regla de rol (apagado → Tierra, vivo → Naranja) está escrita arriba de `FAMILIAS_COLOR`.
- La web se fusiona **antes** de pegar la migración: la API acepta «rosado»/«naranja» y el candado viejo de la base rechaza
  crear un color en esas familias. Pegar la migración primero.
- Alguien cambia un corte de gama o la fórmula de claridad: `lib/color-escala.test.ts` fija los 75 colores y dice cuál se movió.

**Verificación.** 192 pruebas de colores en verde y la suite completa de la web (307 archivos, 154.745 pruebas); la disposición
esperada de la prueba viene de un prototipo independiente, no del mismo código, y una mutación (mover un corte) la hace
fallar. Migración ensayada en un Postgres 17 desechable con los 79 colores de producción: `UPDATE 8 / 1 / 79`, conteos
13/8/3/5/4/5/9/11/9/8, segunda corrida sin cambios (misma huella md5), el orden de la base == el de la prueba, y un candado
sin «naranja» hace fallar y revertir la transacción. Pantallas a 1280 y 375 px sin desborde.

**Cómo deshacerlo.** Web: `git revert` de los 4 commits (no toca datos). Base: volver el candado a las 9 familias exige antes
devolver los 8 colores a su familia anterior (Arena → tierra; Rosado, Palo rosa, Fucsia → rojo; Durazno, Mandarina, Naranja →
amarillo; Salmón → rojo); el `orden` viejo no hace falta restaurarlo (la web no lo usa).

**Pendiente (de Felipe).** Tres ajustes que se pueden revertir color por color: Coral queda en Rojo, Mora en Morado (por su
nombre, aunque su matiz sea de rosado) y Salmón en Naranja. Y los 4 colores creados a mano: Perla es casi igual a Crudo
(ΔE 2,1) y «Amarillo mantequilla» a Vainilla y a Amarillo limón (7,8 y 7,2).
