# ADR-0444 — El armador de looks acepta máximo 3 prendas: una de arriba, una de abajo y un bolso

**Fecha:** 2026-10-17
**Estado:** Construido en la rama. `tsc` de la web y de la tienda, `pnpm knip`, las 556 pruebas de la web y las 530 de la tienda en verde. **Falta:** verlo en la
tienda con una cuenta real (el probador `/looks/arma`) y en Vitrina ▸ Probador del ERP; el cambio no se miró en pantalla.
**Afecta:** `packages/shared/src/categorias-de-la-tienda.ts` (la regla `zonaDelProbador`, que usan las dos apps), `apps/tienda/lib/probador.ts` (comentarios) y
`probador.test.ts`, y los textos de `apps/web/components/vitrina/{ProbadorPantalla,ProbadorPrendaHoja,LargosTipicosHoja}.tsx`,
`apps/web/lib/vitrina-probador-reglas.ts` y la guía de Vitrina ▸ Probador. **No toca la base:** sin migración ni RPC.
**Relacionado:** ADR-0434 (el probador, que esto reduce), ADR-0442 (las fotos y el recorte), `docs/investigacion/2026-10-17-prompt-estandar-fotos-armador.md`.

## Contexto

Felipe (2026-10-17): el look lleva «máximo 3 prendas, no más»: UNA de arriba (top, casaca, polo o cualquier parte de arriba), el pantalón y la cartera; «que no
aparezcan vestidos, enterizos ni conjuntos», y «que el probador no acepte vestidos o prendas por encima».

El probador de la ADR-0434 tenía cinco zonas: arriba, vestido, abajo, encima y bolso. El vestido ocupaba arriba y abajo y la fila «Algo encima» invitaba a ponerle
un chaleco, un blazer o una casaca a lo de arriba, hasta 4 prendas. Con prendas puestas una sobre otra, además, la figura se amontonaba.

## Decidí

1. **Una sola regla, la que ya comparten las dos apps** (`zonaDelProbador`): arriba, abajo y bolso.
   - **Arriba:** el grupo «Arriba» y, además, las casacas, los blazers, los chalecos y los abrigos (`CAS`, `BLZ`, `CHA`, `ABR`, y lo que cae en «Encima y más» sin
     lista). Una casaca o un chaleco ES la prenda de arriba: reemplaza al polo, no se pone encima.
   - **Abajo y bolso:** igual que antes (`PAN`, `JEA`, `FAL`, `SHO`; `CAR`).
   - **No entran:** el grupo «Vestidos y conjuntos» (`VES`, `CON`, `ENT`, `TBA`) y las capas (`CAP`, largas como un vestido y se llevan sobre algo).
2. **El ERP cambia solo**: Vitrina ▸ Probador usa la misma regla (`entraAlProbador`), así que deja de contar y de pedir largo o recorte de los vestidos,
   enterizos, conjuntos y capas, y empieza a contar las casacas, blazers y chalecos como prendas de arriba. Se ajustaron sus textos y la guía.
3. **Ninguna categoría cae ya en las zonas «vestido» ni «encima».** El código de la tienda que las usa (el vestido que ocupa arriba y abajo, la fila «Algo encima», el
   «o un vestido» de la tira) se queda: no se dibuja nada porque no hay prendas de esas zonas (`TuLook` y `TiraDeOpciones` ya esconden lo que no tiene prendas). Quitar ese
   código es otro cambio, y dejarlo permite volver atrás cambiando una línea.

## Descarté

- **Borrar las zonas «vestido» y «encima» del motor de la tienda.** Toca doce archivos, la dirección compartible, los looks guardados y 40 pruebas, sin cambiar lo que ve el cliente.
- **Que las casacas y los chalecos no entren.** Felipe los nombró como prenda de arriba.
- **Una migración que limite a 3 piezas los looks guardados.** La figura ya no puede armar más de 3; la base sigue aceptando de 2 a 4 sin daño.

## Efectos que ya se pueden prever

- **Looks guardados y enlaces compartidos de antes** que lleven un vestido o una prenda de «encima» (o una capa): esa pieza se salta y el look se completa con lo que hay,
  como cuando una prenda se agota («Una prenda que guardaste ya no está»). Una casaca o un chaleco guardados «encima» se leen ahora como prenda de arriba y reemplazan a la otra.
- **Las casacas, blazers, chalecos y abrigos con recorte entran al armador como prendas de arriba**, con su largo propio o el típico de su categoría (chalecos 55, casacas 60,
  blazers 70). Un abrigo no tiene típico: entra solo con su largo propio.
- **No medido:** cuántas prendas de producción salen del armador (vestidos, conjuntos, capas) y cuántas entran (casacas, blazers, chalecos). La consulta a producción se cortó por tiempo
  de conexión; la lista viva de Vitrina ▸ Probador lo dice.

## Se rompe si

- Alguien crea una categoría nueva de vestidos con un prefijo que no está en la lista de la tienda: cae en «Encima y más» y entra al armador como prenda de arriba. Hay que sumar su prefijo
  al grupo «Vestidos y conjuntos» de `categorias-de-la-tienda.ts`.
