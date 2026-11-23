# ADR-0694: el texto en tres tonos (tinta, secundario y tenue), y el café fuera del texto

**Fecha:** 2026-11-23 · **Estado:** aceptado · **Cambia:** ADR-0336 (los pisos del texto tenue, act. 2026-10-14) y ADR-0017 (`taupe-profundo`).

## Contexto

El texto que acompaña al dato (el proveedor bajo la marca, «Contado», «2 prendas», la hora) se escribía con 13 opacidades de tinta
(`text-tinta/25` a `/85`, 2.324 usos en `components/` y `app/`) y, aparte, en café (`text-taupe`, 1.683 usos; `text-taupe-profundo`, 71). Como
varias no pasaban el contraste, `tema.css` tenía dos «pisos» que subían de golpe `/35` a `/60` al 64 % en claro y `/35` a `/50` al 60 % en
oscuro. A la vista quedaban unos tres tonos con trece nombres, y el café compitiendo con la tinta por ser «el secundario»: en Historial de
ventas convivían los dos en la misma tarjeta.

Salió de revisar las reglas de diseño contra lo que hacen los mejores sistemas
(`docs/investigacion/2026-11-19-diseno-color-y-flujo-sin-miedo-a-las-reglas.md`, propuesta 1). Apple (label, secondaryLabel,
tertiaryLabel), Radix y Material 3 nombran tres o cuatro escalones de texto y los definen por tema; las piezas solo los citan.

## Decisión

Felipe eligió mirando la lámina (`docs/milimetro/laminas/2026-11-23-escalas/`, con fotos de Compras, Movimientos e Historial de ventas
reales en claro y oscuro) la **«B · Tinta en tres tonos»**, y pidió aplicarla **de una vez en todo el ERP**:

1. **Tres tonos con nombre**, tokens de `globals.css` (alias de la tinta, así que siguen al tema sin bloque oscuro propio; `.papel-fijo` los
   vuelve a declarar):
   - `tinta`: el dato.
   - `secundario` = tinta al 80 %: lo que acompaña. 7,7 a 8,9:1 en claro y 6,9 a 10,1:1 en oscuro sobre crema, papel, hueso y arena.
   - `tenue` = tinta al 64 %: lo más tenue que se lee. 4,7 a 5,1:1 en claro y 5,1 a 6,9:1 en oscuro.
2. **El café sale del texto.** `taupe-profundo` (el café «de texto», ADR-0017) pasa a valer lo mismo que `secundario`, hecho sólido sobre la
   crema; `taupe` queda para líneas y bordes. Los dos usos de `taupe-profundo` que eran color de categoría y no texto (el punto de
   «Numeración» en `TallasLista` y el ícono de «mueve» en Finanzas) pasan a `taupe`, que vale el café de antes en los dos temas.
3. **Las clases de antes se traducen en un solo lugar** (`estilos/tema.css`, `@layer utilities`, con `:where` para que `hover:`, `disabled:`
   y `dark:` sigan ganando, y solo en pantalla): `text-tinta/35` a `/65` y sus marcadores van a `tenue`; `/70` a `/85`, `text-taupe` y
   `text-taupe/50` a `/80` van a `secundario`. Reemplaza a los dos pisos de ADR-0336. `/25` y `/30` siguen siendo fantasmas a propósito.
4. **En código nuevo**, `text-secundario` y `text-tenue`; nunca una opacidad nueva de tinta para texto.

## Medido (2026-11-23, ERP local con datos inventados, 1440 × 900, `.claude/skills/color/referencia/medir.js`)

| | Textos bajo 4,5:1 | Débiles para APCA en oscuro (Compras, Movimientos, Ventas) |
|---|---|---|
| Antes | 0 | 45 + 16 + 33 = 94 |
| Con este cambio | 0 | 14 + 10 + 22 = **46** |

En claro casi no cambia a la vista (los pisos ya llevaban casi todo al 64 %); en oscuro se lee mejor. Las fotos del ERP después del cambio
son iguales a las de la opción B de la lámina.

## Lo que no alcanza (y cómo se completa)

- **El texto escrito a mano en un CSS** (`color: var(--color-taupe)`, 319 líneas; `color-mix(… var(--color-tinta) N% …)` en los estilos de
  pantalla) no lo toca la traducción, igual que en las fotos de la lámina («Tienda Lima · últimos 30 días» sigue en café). Se pasa a
  `var(--color-secundario)` o `var(--color-tenue)` cuando se toca su archivo. `tinta-60` (otro «secundario cálido» del puente shadcn) queda igual.
- **Las líneas y bordes por opacidad** (`border-tinta/NN`, 16 escalones) siguen como están: se ordenan con el mismo criterio en otro paso.
- **CAYLA Dynamic no cambia**: `taupe-profundo`, `secundario` y `tenue` no están en `docs/familia/contrato.json` ni en `vidrio/recetas.css`.

## Actualización 2026-11-23: las cifras de DM Sans en Inter

En la misma lámina Felipe eligió **«B · Inter en las cifras»** y dio el OK para bajar el archivo. DM Sans no trae cifras tabulares: con
`tabular-nums`, a 14 px «1111» mide 18 px y «0000» 41, así que una columna de montos en DM Sans nunca alineaba. Inter sí las trae, y ya era la
letra de las cifras de Estados financieros (ADR-0611).

- **Un recorte de Inter con solo los dígitos 0–9** (`apps/web/app/fuentes/inter-cifras.woff2`, 7 KB, pesos 100–900, con su licencia OFL 1.1
  al lado; Inter no reserva su nombre, así que el recorte está permitido). Se carga con `next/font/local` en `app/layout.tsx`, con
  `unicode-range: U+0030-0039` y **sin fuente de respaldo** (`adjustFontFallback: false`): el respaldo que arma next/font es Arial sin
  `unicode-range` y se quedaría con todas las letras.
- **Va delante de DM Sans en `--font-sans`** (`globals.css`). El navegador la usa solo para los dígitos: letras, signos, «S/» y la Garamond no
  cambian. Comprobado en una página en blanco: con `tabular-nums`, «1111» y «0000» miden lo mismo; sin él, los dígitos son proporcionales.
- **Alcance, más amplio que la lámina:** la lámina cambió solo las cifras de columna en DM Sans; así cambian todos los dígitos en DM Sans,
  también los del texto corrido («11:02», «2 prendas»). Se eligió así porque alinea además las cifras que piden `tabular-nums` desde un CSS
  (no solo con la clase) sin tocar la Garamond, y porque un mismo número no se dibuja con dos letras en una pantalla. En las fotos el texto
  corrido casi no cambia (cada número crece de 0,4 a 4,7 px a 14 px).
- **Medido** (ERP local con datos inventados, 38 pantallas a 1440 px y 5 a 375 px, 1.735 textos con dígitos, con y sin el recorte en la misma página): ningún texto con
  dígitos se corta, desborda la página ni baja de línea, salvo el N.° de documento de Historial de compras. Ese ya no cabía antes con un número
  lleno de ceros («F001-00000000», 123,4 px en DM Sans contra 120 de columna), y ahora todos miden 123–124 px: la columna pasó de 7,5 a 8 rem.
- **No alcanza:** una columna que no pide `tabular-nums` sigue sin alinear; se arregla pidiéndolo, no cambiando la letra. La ayuda de la
  cabecera (`ayuda-cabecera.css`) pedía DM Sans directo y pasó a `--font-sans`; solo `navegador-viejo.css` la sigue pidiendo directo, a
  propósito. CAYLA Dynamic y la tienda (`apps/tienda`) no cambian.
- **Lo vigila** `lib/cifras-en-inter.test.ts`: la fuente primera en `--font-sans`, el `unicode-range`, sin respaldo, el archivo recortado con su
  licencia y ningún CSS que pida DM Sans directo.

## Alternativas descartadas

- **A · Hoy** (13 opacidades y el café): Felipe no la eligió; además deja el doble de texto débil en oscuro.
- **C · Tinta y café, dos voces** (todo lo que acompaña en café): la más cálida, pero el café queda en el límite de AA sobre hueso y arena
  (4,5 a 4,6:1) y no mejora el oscuro (95 débiles).
- **Migrar pantalla por pantalla**: Felipe prefirió aplicarla de una vez; con la traducción en `tema.css` no hay que tocar ninguna pantalla.
- **Cifras: la Inter entera solo en las celdas con la clase `tabular-nums`** (como la foto de la lámina): deja fuera las cifras que piden
  alinear desde un CSS, y sobre una celda dentro de un título en Garamond la pasaría a sans. **Cifras: toda la letra en Inter**: cambia la
  marca (DM Sans es «el sistema» del brandbook) por un problema que solo tienen los dígitos.

## Se rompe si

- Alguien vuelve a poner un piso por opacidad o una opacidad nueva de texto: `lib/tema-tokens.test.ts` exige que las reglas de `secundario` y
  `tenue` sigan alcanzando todas las clases de antes, que los dos tonos sean 80 y 64 % y que pasen 4,5:1 en los dos temas.
- Alguien quita el `unicode-range` del recorte o le deja a next/font su fuente de respaldo: las letras de todo el ERP saldrían en Inter o en
  Arial. Lo vigila `lib/cifras-en-inter.test.ts`.
- Alguien le da a `taupe-profundo` un hex propio: deja de seguir al tono y la prueba de `.papel-fijo` (claro = papel) avisa.
