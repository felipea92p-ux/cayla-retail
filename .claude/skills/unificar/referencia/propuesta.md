# La propuesta: el diseño extra

Felipe no solo elige entre lo que ya hay: también ve **una forma nueva** que toma lo mejor de cada variante y corrige lo que ninguna resuelve.
Si la propuesta no es claramente mejor que la A, dilo: «la A ya está bien; mi propuesta es la A con el foco arreglado».

## Cómo se diseña

1. **Parte de la A** (la más usada): ya la conoce la gente y es la migración más corta. Cambia solo lo que tenga una razón.
2. **Toma rasgos con razón**, uno por línea, y di de qué variante sale cada uno: *«de la C, el icono a la izquierda: se reconoce antes de leer
   (ley 5 de Formidable, contenido primero)»*. Razones válidas: una ley de Formidable (ADR-0350), una medida de oficio (controles de 24 px mínimo
   y 32 de objetivo con mouse, 44 con dedo; espaciado en múltiplos de 4; contraste WCAG ≥ 4.5:1, 3:1 en letra grande), una regla del repo
   (ADR-0169 jerarquía de botones, ADR-0136 movimiento, ADR-0185 la página no se encoge, ADR-0209 combos). «Se ve más moderno» no es razón.
3. **Corrige lo que ninguna resuelve:** el foco de teclado (ADR-0351, un solo anillo), el estado deshabilitado que se lee, el contraste en
   oscuro, un nombre para el botón de solo icono, el giro de «Guardando…».
4. **No inventes un token, una fuente ni una animación.** Solo los de `apps/web/app/globals.css`. Si de verdad hace falta uno nuevo, se propone
   aparte con la regla 5 del modo oscuro (`@theme`, `tema.css` y `.papel-fijo`).
5. **El movimiento es parte de la pieza** (Felipe 2026-10-07). La propuesta se queda con el mejor movimiento que tenga alguna variante (el
   barrido de luz, el encogerse al presionar, el hilo de «Guardando…», la píldora que se desliza) y lo dice: *«de la B, el barrido de luz al
   pasar el mouse»*. Movimiento de ADR-0136: sin rebote, sin bucle salvo las excepciones de `CLAUDE.md`, y apagado con `prefers-reduced-motion`.
   En la página de elegir, cada opción dice qué movimiento tiene (una foto no lo muestra).
6. **Piensa en la pieza, no en una pantalla.** La propuesta tiene que servir en todos los lugares donde vive la familia: muéstrala en dos o tres
   contextos reales (en una hoja, en una tabla, en una cabecera) con textos del lugar.

## El archivo

`docs/unificar/propuestas/<familia>.html` (el id de `familias.mjs`, por ejemplo `pestanas.html` o `accion.cancelar.html`). Es un **fragmento**
de HTML, sin `<html>` ni `<head>`: la lámina lo envuelve con el CSS real que sirvió el ERP durante el censo, en claro y en oscuro, uno al lado
del otro. Por eso:

- Puedes usar las clases del sistema que ya existen (`btn-cayla btn-secundario`, `label-cayla`, `nota-cayla`, `pildora-cayla`, `card-cayla`) y
  las utilidades de Tailwind **que ya se usan en el código** (Tailwind v4 solo emite lo que ve usado: una utilidad nueva no tendrá estilo).
- Lo nuevo va en un `<style>` propio con clases `prop-*` y **solo** `var(--color-…)`, `var(--font-dm-sans)`, `var(--font-eb-garamond)`.
  Nunca un hex ni un `rgb()`: el oscuro tiene que funcionar solo.
- Los estados se muestran con clases, no con el mouse: `.prop-encima`, `.prop-foco`, `[disabled]`, `.prop-cargando`.
- Sin JavaScript salvo que el estado lo exija (una pestaña que se mueve): la lámina es para mirar.

```html
<style>
  .prop-fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
  .prop-etq { font-size: 11px; color: var(--color-taupe); width: 100%; }
  .prop-cancelar { height: 36px; padding: 0 16px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--color-tinta) 15%, transparent);
    background: var(--color-papel); color: var(--color-tinta); font: 500 14px/1 var(--font-dm-sans); }
  .prop-cancelar.prop-encima { background: var(--color-hueso); }
  .prop-cancelar.prop-foco { outline: 2px solid var(--color-pizarra); outline-offset: 2px; }
  .prop-cancelar[disabled] { opacity: .45; }
</style>
<div class="prop-fila"><span class="prop-etq">Estados</span>
  <button class="prop-cancelar">Cancelar</button>
  <button class="prop-cancelar prop-encima">Cancelar</button>
  <button class="prop-cancelar prop-foco">Cancelar</button>
  <button class="prop-cancelar" disabled>Cancelar</button>
</div>
<div class="prop-fila"><span class="prop-etq">En el pie de una hoja, junto al principal</span>
  <button class="prop-cancelar">Cancelar</button> <button class="btn-cayla btn-primario">Guardar gasto</button>
</div>
```

## Verificarla

Rehaz la lámina (`pnpm unificar:censo -- --lamina <carpeta>`), ábrela (`preview_start` `unificar-laminas`) y mira la propuesta **en los dos
temas** al lado de las variantes. Mide el contraste de sus textos si dudas (`javascript_tool` en la página de la propuesta). Si en oscuro algo se
aclara o se pierde, no está lista. La imagen `comparativas/<familia>.png` que mandas al chat ya la trae.
