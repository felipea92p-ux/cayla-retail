# ADR-0314 — La carta de colores: Neutro sin tinte, una gama por fila y hex distinguibles

**Fecha:** 2026-10-02 · **Decidió:** Felipe, con preguntas de opción · **Continúa:** ADR-0312 (reemplaza solo dos cosas: la regla
«Arena → neutro» y la fila única por familia ancha).

## El problema

Felipe miró la carta de Nuevo producto en producción y dijo «lo hiciste peor». Se veían tres cosas:

1. **Un renglón «Otros» con 7 colores** (Durazno, Salmón, Mandarina, Naranja, Rosado, Palo rosa, Fucsia). No es un error de la
   carta nueva: la base de producción ya tenía las familias Rosado y Naranja (migración `20261002180000`, pegada) y la web
   desplegada seguía siendo la de `main`, de 9 familias, que no las conoce. `ordenarColores` pone en «Otros» a todo color cuya
   familia no conoce (para que nunca desaparezca). Se va cuando se despliega el PR #736; no hay que cambiar código.
2. **Neutro con 13 colores en una fila**, la más larga. Diez no tienen tinte; tres (Nude, Beige, Arena) sí.
3. **Las escalas no se leían como escala.** Azul, Verde y Morado se parten en dos gamas; en la carta quedaban en el mismo renglón
   con un hueco y, al cortarse el renglón, la claridad «subía» a mitad de fila (Petróleo 0,45 → Azul claro 0,70).

## Decidí

1. **Neutro = sin tinte; Tierra = lo cálido con tinte, con una regla medible.** Croma OKLab < 0,03 es Neutro (el más cargado,
   Gris piedra, 0,026); croma ≥ 0,035 es Tierra (el más suave, Chocolate, 0,035). Nude (0,047), Beige (0,055) y Arena (0,069)
   pasan de Neutro a Tierra: **Neutro 13 → 10, Tierra 8 → 11**. Escrito en `lib/colores-familias.ts`; migración
   `20261002190000_colores_neutro_mas_corto.sql`.
2. **Cada gama, una fila.** En la carta (Nuevo producto y Agregar colores) y en Atributos ▸ Colores, Azul, Verde y Morado pasan de
   1 a 2 filas (5+4, 3+8, 4+5). Cada fila es una escala pura de más claro a más oscuro. No toca la base: las gamas salen del hex.
   El nombre de la familia queda alineado con la primera fila.
3. **El #hex de dos colores creados a mano, más distinguible.** Perla `#EAE6DD → #DBDDD9` y Amarillo mantequilla
   `#FFE68A → #FEDF87` (migración `20261002191000_colores_hex_mas_distinguibles.sql`, que exige el hex viejo en el `where`). El par más
   cercano entre colores que no son metálicos pasa de **ΔE2000 2,12 (Crudo–Perla) a 6,03** (Beige–Arena, la pareja canónica que ya se
   aceptaba). Una prueba fija que dos colores no metálicos nunca queden a menos de 6,0.

## Descarté

- *Familia nueva «Crema»* (Crudo, Perla, Nude, Beige, Arena): cambia el candado de la base y suma una fila.
- *Nude a Naranja* (junto a Durazno): filas más parejas, pero quien busca «nude» entre los neutros no lo encuentra donde espera.
- *Una sola rampa de claridad por familia, sin gamas:* los vecinos saltan hasta 55° de tono (Turquesa 205° junto a Azul claro 260°;
  Petróleo 219° entre dos azules de 253° y 274°): se lee como escala pero mezcla cian con ultramar.
- *Quitar el renglón «Otros» del código:* con una familia que la web no conoce, ese color **desaparecería** de la carta. Se queda como
  red de seguridad y es invisible mientras base y web conozcan las mismas familias; reaparece, por unas horas, cada vez que se
  agrega una familia (la base va primero, la web después: ese es el orden que exige el candado).
- *Separar Perla a ΔE ≥ 8:* exige `#D6E1DB`, un gris verdoso que ya no es «perla». Con 4 de movimiento se llega a 6,1.
- *Mover Crudo en vez de Perla:* Crudo es canónico con código Pantone; Perla se creó a mano. *Tocar Moka–Tostado (7,9) o
  Beige–Arena (6,0):* son canónicos y se distinguen; moverlos es alejarlos de su referencia de tela.
- *Fusionar Perla con Crudo:* Perla tiene 7 variantes con stock; fusionar toca SKUs.

## Se rompe si

- Alguien crea un color con croma entre 0,026 y 0,035: el hueco entre Neutro y Tierra es estrecho y dos personas lo pueden clasificar
  distinto. Gana el de menos croma.
- Se espera que el círculo de Perla o de Mantequilla sea una medición de la tela: pasan a ser una aproximación para la pantalla. El
  Pantone TCX sigue siendo la referencia real y esta decisión no lo toca.
- En 375 px una gama de 8 colores se parte en 7 + 1 (Azul marino queda solo en su línea): es el ajuste normal del renglón.

## Verificación

- **Se midió con ΔE2000**, la distancia que usa la app para su aviso «se confunde con» (umbral 8), validada contra los números del
  ADR-0312 (Beige–Arena 6,03, Arena–Camel 9,34, Crudo–Perla 2,12). Una primera lectura en OKLab×100 exageraba cinco parejas
  (Caqui–Camel, Gris perla–Gris piedra, Beige–Gris piedra, Moka–Tostado) que en ΔE2000 están entre 5 y 8: solo Crudo–Perla estaba
  confundida de verdad.
- **Las migraciones se corrieron sobre el estado de producción.** En una base propia con los 75 colores tal como estaban antes (Neutro 13,
  Tierra 8, hex viejos): `UPDATE 3 / 1 / 1`; segunda corrida `UPDATE 0` en las tres; la base resultante es idéntica a la tabla de
  `lib/color-escala.test.ts` (75 de 75, por código, hex y familia).
- **Pruebas:** `color-escala.test.ts` recalcula las filas esperadas con un prototipo aparte; la prueba nueva de distancia mínima falla
  con el hex viejo de Perla nombrando «Crudo ~ Perla: 2.12». Suite completa de la web: 308 archivos, 154.819 pruebas.
- **En el navegador** (Chrome real, base con las tres migraciones): la carta de Nuevo producto a 1380 px y a 375 px, y Atributos ▸
  Colores. Neutro 10, Tierra 11, Verde/Azul/Morado en 2 filas, sin «Otros» y sin desborde horizontal.

## SQL para producción

Dos archivos, sin candado ni `alter` (no hay deadlock con políticas), idempotentes y reversibles; se pegan en cualquier orden y
**antes o después** de desplegar la web: Tierra y Neutro existen en la web vieja y la nueva.

1. `20261002190000_colores_neutro_mas_corto.sql` — verificación: `neutro 10, tierra 11` (`select familia_color, count(*) from retail.colores where activo group by 1`).
2. `20261002191000_colores_hex_mas_distinguibles.sql` — verificación: `PER = #DBDDD9`, `AMM = #FEDF87`.

## Cómo deshacerlo

Web: `git revert` de los tres commits (no toca datos). Base: las dos líneas `DESHACER` al pie de cada migración.

## Pendiente (de Felipe)

Moka–Tostado (7,9) y Beige–Arena (6,0) se quedan como están. Perla y Amarillo mantequilla conservan su nombre aunque Mantequilla
sea ahora un amarillo algo más cargado (queda segundo en su fila, tras Vainilla).
