---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/app/globals.css"
---

## Paleta y orden de pantalla (regla — ADR-0169, ADR-0220)

**El ERP usa la guía oficial «CAYLA Dynamic»: los colores salen SOLO de los tokens de `apps/web/app/globals.css`**
(crema, papel, tinta, rojo, rojo-profundo, sand, taupe, verde, ámbar, hueso, pizarra, `borde-control`). Nunca un hex suelto. **Lo que se toca o se escribe (campo, combo, botón secundario, casilla, interruptor) lleva `borde-control`, que pasa 3:1; `sand` es solo la línea decorativa** (tarjeta, tabla, píldora con texto): lo vigila `lib/tema-tokens.test.ts` y es el mismo valor en CAYLA Dynamic (ADR-0516 act. 2026-10-26 b). Pantalla nueva
o rediseñada: cabecera → cifras (`TarjetaCifra`) → filtros y tabla en UNA tarjeta (`Tabla`, `caja` en los campos,
`pildora-cayla`) → nota en hueso (`nota-cayla`). **La cabecera es una sola en todo el ERP, Finanzas incluida desde el 2026-11-09 (Felipe 2026-10-14,
`/unificar`, ADR-0358 y ADR-0220 act.):**
`<EncabezadoPagina>` (`components/ui/EncabezadoPagina.tsx`: sede y fecha arriba con el hilo taupe → título de 46 px con el
nombre del menú, nunca la sede, con su «?» de vidrio que abre la frase en un globo (ronda 18, 2026-10-30: la frase ya no se ve; lo que
explicaba un «!» junto al título va en `ayuda`); a la derecha, las cifras o el reloj y, si la pantalla no los tiene, sus acciones
(prop `acciones`: bajan solas bajo la frase si la derecha está ocupada); la vuelta es una flecha a la izquierda de la línea de
sede (`volver={<Volver href a />}`, Felipe 2026-10-06; desde la tarde de ese día es la única cara de la vuelta en todo el ERP, ADR-0358) y bajo la frase van solo estados (`pie`);
la frase es opcional y lo que diga de dónde se llegó («Productos · Blusa Emma») va tras la fecha (`detalle`); ADR-0220 y sus actualizaciones);
la última pantalla de Finanzas que usaba `<CabeceraPantalla>`, Cierre de mes, pasó a `<EncabezadoPagina>` el 2026-11-09 y esa pieza ya no existe. Lo vigila `lib/unificar.test.ts` (`titulo-pagina`). Botones: `btn-cayla` + `btn-primario|secundario|peligro|sutil|enlace`;
estados: `<Chip>` (insignia con punto; `pizarra` = informativo). Sin sombras en superficies pegadas al fondo (la única excepción es la tarjeta Vitrina de Existencias, ADR-0589). Detalle,
contraste medido y lo que quedó fuera (formularios con caja): `docs/adr/0169-paleta-oficial-cayla-dynamic.md`. **El modo oscuro entró el
2026-10-05 sobre esos mismos tokens: ver «Modo oscuro» (`modo-oscuro.md`).**
