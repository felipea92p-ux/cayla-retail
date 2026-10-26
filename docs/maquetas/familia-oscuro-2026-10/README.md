# El oscuro de la familia CAYLA · una lámina para elegir mirando (2026-10-25)

Pendiente **P1** de `docs/familia/contrato.json`: Retail y Dynamic tienen dos oscuros distintos (un gris y un café) y el tema claro es idéntico en
las dos. Felipe elige mirando (la regla de `/unificar`), así que esta lámina pone **la misma pantalla** en tres oscuros, con exactamente los mismos
componentes: lo único que cambia entre columnas son los colores. **Nada toca `apps/web` ni la base.**

Para verla: abrir `index.html` (doble clic) o servirla con el servidor `maquetas` de `.claude/launch.json` (puerto 8791).

| | Qué es | De dónde sale |
|---|---|---|
| **A · Gris** | El oscuro de Retail hoy | `apps/web/app/estilos/tema.css` |
| **B · Café** | El oscuro de Dynamic hoy | el artifact «CAYLA Dynamic» (`tokens.json`, 2026-10-25) |
| **C · Gris cálido** | Nuevo: las claridades de A con el matiz de B | calculado para tener la misma luminancia que A (H 36°, S 10 %) |

C toma de B solo el matiz de las cuatro superficies (`crema #1c1a17`, `papel #26241f`, `hueso #33302a`, `sand #403b34`); los textos, el rojo, el verde,
el ámbar y la pizarra son los de A. Debajo de cada columna hay una tabla de medidas (contraste WCAG calculado en la propia página con los hex de la
columna). Lo que se ve y lo que se mide:

- B tiene un texto bajo 4.5:1 (el rojo sobre la tarjeta, 4.28:1) y el campo casi no se separa de la página (1.08:1, contra 1.32:1 en A y C).
- A y C pasan todos los textos que mide la lámina, con 5.7:1 o más; C es A con calidez.

**Elegir:** el botón «Elegir la A/B/C» guarda la elección en este navegador y da el mensaje para Claude (`P1 = A`, `P1 = B` o `P1 = C`). Con la
decisión se actualiza `contrato.json` (P1 pasa a `decidido` y el oscuro sube a la capa «marca»), se copia el contrato a Dynamic y se cambian los
valores en `tema.css` de Retail y en el CSS de Dynamic.

Qué pasa en cada app con cada opción: **A**: Dynamic cambia casi todo su oscuro y el campo pasa de hundido a elevado. **B**: Retail cambia todo su
oscuro y hay que revisar de nuevo el contraste de cada pantalla (`pnpm --filter web tema:auditar`). **C**: Retail solo tiñe el matiz de cuatro
superficies (los contrastes no cambian); Dynamic cambia el orden del campo y sube el rojo.
