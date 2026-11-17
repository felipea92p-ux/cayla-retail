# Auditoría al milímetro — El ERP en teléfonos de gama baja (ADR-0674) · 2026-11-17 · `claude/confident-gauss-v6tzn7`

Piezas: el botón «Modo liviano» (`components/ui/BotonLiviano.tsx`) en la cabecera de escritorio y al pie del menú del celular; el aviso
«Actualiza el navegador» (`components/AvisoNavegadorViejo.tsx` + `app/estilos/navegador-viejo.css`); y el ERP en modo liviano
(`app/estilos/liviano.css`) en `/productos` e `/inventario`.

Medido: 1440×900 claro y oscuro, con y sin modo liviano (Productos e Inventario); el botón solo (`raiz: ".marco-isla-der .boton-liviano"`),
también con las animaciones encendidas y el mouse encima; 375×812 táctil (Pixel 5) con el menú abierto, claro y oscuro (`raiz: ".marco-yo"`);
el aviso a 375 (Android) y 1440, claro y oscuro, forzando un navegador sin `color-mix()`. Cada medidor de estados con una segunda pasada de
foco. ERP local (`next dev`) contra Supabase local con todas las migraciones. Los medidores se corrieron con `page.evaluate` (Playwright),
el equivalente a pegarlos en `javascript_tool`.

Resumen: **0 graves · 0 medias · 0 leves abiertas** en lo nuevo. **1 media corregida** (la letra del aviso). **1 falso positivo** confirmado
con píxeles. Lo demás que marcaron los medidores es de la pantalla de atrás y ya estaba.

## Graves
Ninguno.

## Medias
1. **Corregida — el aviso usaba `system-ui` como letra.** Regla del repo: las letras salen de los tokens (candado 1). En un navegador viejo
   las variables de Tailwind pueden no existir (`@layer`), así que va `var(--font-dm-sans, system-ui)`: esa variable la pone `next/font` en
   `<html>`, fuera de toda capa. Medido después: `"DM Sans", "DM Sans Fallback", system-ui` a 15 px.

## Leves
Ninguna.

## Falso positivo confirmado
- **Las etiquetas del menú del celular «bajan» a 3,59–4,47:1 con el modo liviano** según `color/medir.js`. Con los píxeles de la captura,
  «Compras» da **8,79:1 con liviano y 9,00:1 sin él**. El medidor supone que el `::after` del menú (tinta al 22 %, una sombra de borde) cubre
  todo el panel, y solo lo «ve» cuando no hay desenfoque. Queda anotado para quien mantenga el medidor de color.

## Decidido a propósito
- **El botón es el mismo cuerpo que «Animaciones» y el tema** (36 px con mouse, 44 con el dedo por `tacto.css`; `transition-colors` y el
  hover dentro de `(hover: hover)` de Tailwind). Encendido, la pluma; apagado, la pluma cruzada, como el destello de «Animaciones» (ADR-0625).
- **En el celular el botón va al pie del menú** (ADR-0674): en la cabecera le quitaba 45 px a la sede (de 122 a 77 a 375 px; a 320 px, 22).
- **El aviso no es `<Aviso>`**: es HTML del servidor con CSS fuera de capas, porque en ese navegador React y Tailwind pueden no correr
  (`// unificar-fijo` en el componente). En oscuro se invierte con la tinta (crema con letra oscura), como lo demás que es «tinta».

## Medido sin hallazgos
- **Estados (`milimetro/medir.js`):** 0 en todos los escenarios, también con foco: el botón con anillo y nombre («Modo liviano», `aria-pressed`),
  el enlace del aviso con anillo.
- **Espacio:** el botón 36×36 con mouse y 44×44 con el dedo; el enlace «Actualizar Chrome» de 44 px de alto; ningún blanco bajo 24 que falle.
  Los blancos bajo 44 con el dedo que marcó el medidor son de la pantalla («Rótulos», «Revisar precios», el campo del login de 40 px).
- **Color:** con el modo liviano no aparece ningún texto que falle en Productos ni en Inventario, en claro ni en oscuro (0 contra 0 sin
  liviano); el aviso, 0 textos que fallen en claro y oscuro.
- **Tipografía y textos del aviso:** 15 px (≥ 14), sin líneas de más de 80 caracteres, sin fallas de texto.
- **Movimiento:** con las animaciones encendidas y el mouse encima, todo quieto a los 2,8 s, sin bucles; quieto, transiciones en 0,01 ms
  (`movimiento.css`). El modo liviano no agrega ni quita animaciones.

## Sin medir
- La ganancia de fluidez del modo liviano en una gráfica de teléfono barato (el emulador no la frena): se mide en un teléfono real.
- `pnpm --filter web tema:auditar` (los contrastes se midieron con `color/medir.js` en los dos temas).
