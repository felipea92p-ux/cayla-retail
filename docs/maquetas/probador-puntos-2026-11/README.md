# Revisar recortes con sus puntos (2026-11-25)

Maqueta de la hoja «Revisar recortes» de Tienda web ▸ Vitrina ▸ Probador (`components/vitrina/RevisarRecorteHoja.tsx`) con los puntos de
cada prenda: hombros y borde de abajo (arriba), pretina y bajo (abajo), asa y base (cartera). El sistema los propone, una persona arrastra
el que está mal, «Así queda» muestra la prenda puesta en la figura y «Usar en el probador» los guarda.

Por qué: el probador de la tienda adivina el tamaño de cada prenda por la forma de su foto (`apps/tienda/lib/probador.ts` `cajaDe`,
`apps/tienda/lib/union-prendas.ts`); una blusa con las mangas abiertas sale enorme junto al jean y la cartera puede salirse del marco.

- Caras: A · Puntos y «Así queda» (recomendada) y B · Claro, oscuro y «Así queda», más «Como ahora».
- Datos inventados: las prendas son dibujos, no fotos reales.
- Capturas en `capturas/` (propuesta dudosa, hombros corregidos, oscuro y 375 px).
- **Descartada** (Felipe 2026-11-25: «no queremos agregar más pasos»). Se construyó la versión automática: ADR-0705.
- `prueba-ia/`: la prueba con 26 recortes reales (lo que marcó la IA, sus respuestas) y las láminas de antes y después de la «Camisa Dalia» (CMS-0092).
