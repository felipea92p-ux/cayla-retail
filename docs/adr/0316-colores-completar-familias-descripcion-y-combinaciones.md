# ADR-0316 — Completar las familias de color, y que cada color diga qué transmite y con qué se combina (2026-10-02)

**Decidió:** Felipe, con la opción B («la más completa») y el pedido de «una descripción de las virtudes del color y con qué se
combina bien». **Continúa** el ADR-0312 (familias en espectro y una escala). No decide Nude/Beige/Arena ni los hex de Perla y
Amarillo mantequilla: eso es del PR #742 (ADR-0314) y esta decisión no depende de él.

## El problema

1. **Las familias pobres tenían huecos.** Rosado 3, Naranja 4, Rojo 5 y Amarillo 5 colores, con saltos de claridad que ningún color
   llenaba (Rosado 77 → 57; Amarillo 83 → 70; Rojo 67 → 53; Naranja sin nada bajo 68). De la paleta puede salir información de
   tendencias, y un hueco, un color sin Pantone o dos casi iguales parten las cuentas.
2. **Un color solo decía cómo se llama.** Qué transmite y con qué se lleva —lo que una asesora le dice a una cliente— vivía en la
   cabeza de quien atiende.

## Decidí

**A. 16 colores nuevos, elegidos midiendo.** Se midió dónde faltaba claridad en cada familia (OKLCH sobre los 75 de producción) y se
buscó, entre los 2.310 TCX de Pantone Fashion, Home + Interiors, lo que cae en esos huecos con **ΔE2000 ≥ 8 contra todos los colores
no metálicos existentes y entre sí** (el umbral de 20260926100000). El hex de cada uno lo confirman dos fuentes.

| Familia | Entra | TCX |
|---|---|---|
| Rosado (3→6) | Rosa pálido · Rosa chicle · Rosa sandía | 12-1706 · 16-2126 · 17-1927 |
| Naranja (4→7) | Naranja quemado · Albaricoque · Ámbar | 17-1145 · 15-1145 · 17-1048 |
| Rojo (5→7) | Rojo tomate · Marsala | 17-1563 · 18-1438 |
| Amarillo (5→7) | Girasol · Amarillo chartreuse | 15-1062 · 15-0548 |
| Verde (9→12) | Verde hoja · Verde jade · Menta | 16-0237 · 16-5919 · 12-5407 |
| Azul (11→13) | Azur · Azul zafiro | 17-4139 · 19-3952 |
| Morado (9→10) | Glicina | 17-3730 |

Entran 16 y no ~19 a propósito: **Neutro** no necesita nada (su único hueco oscuro ya lo ocupa «Azul Intermedio», un gris pizarra
creado a mano y clasificado Azul); **Azul pálido** y **Naranja pálido/intenso** no tienen lugar a ΔE ≥ 8; en **Amarillo** un hueco de
13 puntos de claridad no admite un color a ΔE ≥ 8 de los dos vecinos, así que se entró por el matiz (Girasol hacia el naranja,
Chartreuse hacia el verde); y «Rosa fresa» se descartó (ΔE 8,7 de dos rosas vecinas: apretaba la escala sin sumar un escalón).
Naranja y Amarillo quedan en 7, igual que Rosado en 6: es lo que el espacio de color permite, no una cuota.

**B. Dos columnas en `colores`:** `descripcion text` (1–300 caracteres) y `combina_con text[]` (hasta 8 **códigos** de otros colores;
mismo patrón que `sinonimos`, ADR-0215: una columna, sin tabla aparte, sin políticas nuevas). Un disparador (`colores_valida_combina_con`)
hace **imposible** un código inexistente, repetido o el propio color. La descripción y las combinaciones de los 91 colores van
escritas a mano, con criterio de estilismo y sin afirmaciones sobre el cuerpo ni el tono de piel de nadie; cada lista trae de 4 a 6
colores (un neutro, un acento y, donde cabe, un metal). **Los 4 colores creados a mano (Perla, Amarillo mantequilla, Azul medio, Azul
Intermedio) tienen su ficha pero no se recomiendan como compañeros** hasta que se decida qué hacer con ellos (23 variantes con stock).

**C. Atributos** muestra la descripción y los compañeros en cada tarjeta y los edita en «Nuevo color» y «Editar color» (descripción con
su tope de 300; «Combina con» como chips con buscador, hasta 8, sin ofrecer el propio color ni los ya elegidos). Opcionales: no entran
a la guía de foco. La API valida con las **mismas reglas puras** que la pantalla (`normalizarDescripcion`, `normalizarCombinaCon`).
El orden de las filas de Atributos sigue siendo el calculado del hex (ADR-0312): los 16 nuevos caen en su lugar sin que nadie los numere.

**D. Los cortes de gama se mueven** al medio del mayor hueco de matiz de cada familia: verde 135° → 138°, azul 240° → 236°, morado 325°
→ 327°. «Verde hoja» (132,2°) y «Azur» (244,1°) quedaban a 2,8° y 4,2° de los cortes de antes: un cambio mínimo de hex los habría mandado
a la otra fila. La prueba de la carta lo cazó. No reasigna a ningún color existente; con los 91, ningún color queda a menos de 5,8° de un
corte. (El ADR-0312 cita los cortes viejos.)

## Descarté

- *Una tabla `colores_combinaciones (a, b)` con llaves foráneas:* integridad perfecta, pero 2 piezas más (RLS, API, pruebas de políticas)
  para ~450 filas que casi nunca cambian. Los colores no se borran, así que un código válido hoy lo sigue siendo.
- *Calcular las combinaciones con teoría del color:* se ensayó y da listas correctas y sosas (repite «Chocolate» y «Celeste» con todo y
  propone azul eléctrico con amarillo limón). El criterio de estilismo es dato, no fórmula.
- *Combinaciones simétricas obligatorias:* «el rojo va con el negro» no implica que el negro lo liste primero.
- *Renumerar `colores.orden`:* los nuevos entran con 2000 (la convención de «agregado después»). La web ya no ordena por `orden` y
  renumerar habría atado esta migración a qué se decida con Nude, Beige y Arena en el PR #742.
- *Fusionar los 4 colores creados a mano con sus gemelos* (Perla ≈ Crudo, ΔE 2,1): tocan SKUs; decisión de Felipe.
- *Esperar a #742 y apilarse sobre él:* es un borrador con conflictos contra `main` y decide cosas que ya tenía resueltas de otra
  forma; mejor desacoplar y resolver el conflicto de la prueba de la carta en quien se fusione segundo.

## Se rompe si

- **La web se fusiona antes de pegar la migración 20261003190000:** la consulta de Atributos pide `descripcion` y `combina_con`, que
  producción no tiene → Atributos ▸ Colores falla. Pegar las dos partes **antes** (por eso el PR va en borrador).
- **Se desactiva un color que otros recomiendan:** sigue siendo un código válido; la tarjeta no lo muestra como compañero.
- **Hay dos fuentes distintas para un hex:** Pantone dejó de mostrarlo sin Pantone Connect (de pago). Se confirmó con dos fuentes de
  terceros; dos de los 16 difieren ±1 en un canal entre fuentes (Autumn Maple `#C46316`, Aqua Glass `#D2E8DF`: se tomó el valor que
  repiten dos de tres). El Pantone TCX sigue siendo la referencia real de la tela; el círculo es una aproximación para la pantalla.
- **#742 se fusiona antes o después:** el conflicto previsible es `lib/color-escala.test.ts` (su fixture mueve 3 colores y cambia 2 hex;
  el mío suma 16). Es mecánico: se resuelve en quien se fusione segundo.

## Verificación

- **Migraciones ensayadas** en un Postgres 17 desechable con los 79 colores de producción (candados, índices únicos de nombre y de
  Pantone y el disparador de estado): parte 1 sin tocar filas; parte 2 `INSERT 16 / UPDATE 16 / UPDATE 91`; repetir ambas deja la misma
  huella md5; lo guardado == lo escrito en el archivo de contenido (huella de los 91). El disparador y los candados **rechazan** un
  código inexistente, el propio color, un repetido, un código en minúscula, más de 8, una descripción de 301 caracteres y una vacía; con el
  disparador apagado el mismo dato imposible sí entra (la prueba muerde).
- **Colores:** el lote de 16 sin choques de código, nombre, sinónimo ni ΔE (≥ 8 contra lo existente y entre sí); `color-escala.test.ts` con
  los 91 colores y la disposición esperada de un prototipo independiente.
- **Pantalla:** `ColoresLista` real con los 91 colores en Chrome sin ventana, 1280 y 375 px: el orden de cada fila idéntico al de la prueba,
  91 tarjetas con descripción y compañeros, sin desborde ni errores; en el modal, quitar y sumar compañeros, y el propio color no se ofrece.
- Suite completa de la web: 312 archivos, 154.964 pruebas.

## SQL para producción

Dos partes, **en este orden**, cada una entera en el SQL Editor (sin políticas, sin `drop trigger`):

1. `20261003190000_colores_descripcion_y_combinaciones.sql` — las columnas, los candados y el disparador.
2. `20261003190100_colores_completar_familias.sql` — los 16 colores, y la descripción y «combina con» de los 91.

Comprobación después: `select familia_color, count(*) from retail.colores where activo group by 1` → neutro 13, tierra 8, rosado 6, rojo 7,
naranja 7, amarillo 7, verde 12, azul 13, morado 10, metalico 8 (91); y `select count(*) from retail.colores where activo and descripcion is
not null and cardinality(combina_con) > 0` → 91.

## Aplicado

Pegadas en producción el 2026-10-02, en orden, y verificadas con consultas de solo lectura: 91 colores activos con las familias de arriba, 91 con descripción y 5–6 compañeros, 0 combinaciones huérfanas, a sí mismo, a inactivos ni repetidas, los dos candados (`colores_descripcion_largo`, `colores_combina_con_maximo`) y el disparador presentes, y la huella md5 de las 91 fichas idéntica a la del archivo de contenido del repo. La web (PR #749) sigue en borrador.

## Cómo deshacerlo

Web: `git revert` del PR (no toca datos). Base: los 16 colores se desactivan (no se borran: pueden tener variantes) con `update retail.colores
set activo = false where codigo in (...)`; las dos columnas son inofensivas si se dejan (nadie las lee sin la web).

## Actualización 2026-10-02 (ADR-0317)

- Donde este ADR dice que el hueco oscuro de Neutro lo ocupa «Azul Intermedio» (un gris pizarra clasificado Azul), **Intermedio se funde en Azul
  medio y se archiva**; Neutro no necesitaba ese color (el 0316 ya decía que no necesitaba ninguno).
- Las fichas de Azul eléctrico, Azul medio, Violeta y Perla se **reescriben** (la migración `20261003200000`): se habían escrito para hex que el
  0317 corrige. Las otras 87 fichas no se tocan.
- Los 4 colores creados a mano ya no son «decisión abierta»: Perla y Mantequilla, ADR-0314; Medio e Intermedio, ADR-0317.
