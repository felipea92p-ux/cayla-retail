# ADR-0215 — Cada color del vocabulario lleva su código Pantone TCX y sus sinónimos

**Fecha:** 2026-09-26
**Estado:** Aceptado. Felipe eligió «código + muestra oficial».
**Migración:** `supabase/migrations/20260926180000_colores_pantone_y_sinonimos.sql`

## El problema

Un color del ERP era un nombre y un hex de pantalla que cada quien puso a ojo. Eso dejó tres huecos:

1. **El código para pedir tela.** Al taller o al proveedor no se le pide «#9B1B30»: se le pide un Pantone TCX, el
   sistema textil de Pantone. El ERP no lo guardaba.
2. **Tonos que en tela no existen.** Azul eléctrico, Violeta y Cobalto estaban tan saturados que ningún tinte
   textil los alcanza: su Pantone más cercano quedaba a ΔE2000 9,4, 8,8 y 4,5.
3. **Duplicados por palabra.** Quien escribe como se dice en tienda («plomo», «guinda», «café») no encontraba el
   color, y lo natural era proponer uno nuevo. El candado de nombre (`colores_clave_unica`) no frena un duplicado
   con otro nombre. En producción ya convivían «Marrón chocolate» y «Chocolate».

## La decisión

- **`colores.pantone_tcx`** (texto, formato `NN-NNNN TCX` con `check`, **único**): dos colores con el mismo Pantone
  son el mismo color, y la base no deja que convivan. Null en los metálicos: el sistema textil de Pantone no tiene
  metales.
- **El hex pasa al que Pantone publica para ese TCX.** Se eligió el TCX que *se ve* igual (el más cercano en
  ΔE2000 entre los 2.310 del sistema Fashion, Home + Interiors), no el que *se llama* igual.
  - 44 de los 56 colores no metálicos cambian menos de ΔE 3, lo que a la vista no se nota.
  - Excepción pedida por Felipe: Beige y Arena van a sus Pantone de nombre (14-1118 Beige y 15-1225 Sand). Eso
    los separa de ΔE 4,3 a 6,0.
- **`colores.sinonimos`** (`text[]`): cómo le dicen en tienda. El buscador de colores (`ComboBuscable`, vía
  `claves` y `coincidenciaCombo` en `lib/combo-reglas.ts`) los entiende. Cuando una opción aparece solo por un
  sinónimo, la lista lo dice: «Gris «plomo»».
- **Los dos se editan en Atributos ▸ Colores.** `lib/color-referencias.ts` normaliza igual en la pantalla y en la
  API.
- **Cuatro colores nuevos con respaldo en los reportes de Pantone:**
  - Cereza: 19-1557 Chili Pepper (NYFW PV27).
  - Moka: 17-1230 Mocha Mousse, Color del Año 2025.
  - Durazno: 13-1023 Peach Fuzz, Color del Año 2024.
  - Mora: 18-1716 Damson (NYFW OI25/26).

## Lo que se descartó

- **Anclar por el nombre de Pantone.** Rompía la paleta: el «Mandarin Orange» de Pantone es nuestro Naranja
  (ΔE 1,8); su «Bottle Green» es un verde medio, no el oscuro que en Perú se llama verde botella. Aparecían 4
  casi-duplicados nuevos.
- **«Azul noche» como color.** Todo azul noche de Pantone queda a ΔE ≤ 4,9 de Azul marino. Es el mismo color con
  otro nombre, así que va como sinónimo.
- **Una tabla `colores_sinonimos` con clave única por sinónimo.** Son más piezas (RLS, API, pantalla) para 60-70
  colores. Un sinónimo repetido en dos colores solo haría que ambos aparezcan al buscar, y la siembra no trae
  repetidos. Si algún día pesa, se migra.

## Qué queda aceptado a propósito

Después de anclar, se revisaron todos los pares no metálicos. Quedan en ΔE ≥ 8, salvo tres casos:

- **Blanco–Crudo (4,6) y Beige–Arena (6,0).** Son colores distintos de verdad en textil; los separa el nombre.
- **Tostado–Moka (8,0).** Justo en el borde.

## Se rompe si

- **Se toma el círculo de pantalla como el color real.** El hex es la aproximación sRGB que publica Pantone. Para
  producción manda el código.
- **Se pega esta migración y se publica la web en el orden equivocado.** La web lee `pantone_tcx` y `sinonimos`
  en Nuevo producto, Atributos y **Vender**. Por eso la migración va a producción ANTES de fusionar la web.

## Fuentes

Consultadas en vivo el 2026-09-26:

- **Hex de los 4 nuevos:** páginas oficiales de Pantone (reportes de tendencia NYFW/LFW 2025-2027 y Color del Año).
- **Hex del resto:** chromafinder.com, que coincidió 110 de 110 con los hex oficiales de Pantone.
- **Nombre de cada TCX:** confirmado en pantone.com/color-finder.
