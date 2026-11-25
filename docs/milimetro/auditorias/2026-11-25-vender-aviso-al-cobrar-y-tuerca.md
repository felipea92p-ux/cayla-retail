# Auditoría al milímetro — Vender: el aviso al cobrar y la tuerca de impresión · 2026-11-25 · `claude/fusion-2011-functionality-4d813d` (`07163dac2`)

Medido: las dos piezas nuevas del PR #2016 —`components/punto-de-venta/AvisoAlCobrar.tsx` (el aviso que reemplaza a «Venta registrada») y
`components/punto-de-venta/ImpresionDelEquipo.tsx` (la tuerca y su hoja «Impresión de este equipo»)— montadas en una página temporal de la rama
(no commiteada) con una venta inventada, sin sesión ni base: la impresión simulada (`window.print`) y la cola de la caja con las dos RPC
interceptadas. Medidores del repo cargados enteros (`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos` de
`.claude/skills/*/referencia/medir.js`), con la hoja o la tuerca como raíz, desde Playwright (Chrome): 1440 × 900 claro y vivo, 375 × 664 con dedo
(iPhone 13), 1440 oscuro, 1440 quieto y una pasada de foco con teclado de verdad (Tab).

Resumen: **0 graves · 0 medias · 0 leves de esta rama** · 3 de piezas ya decididas, anotados abajo.

## Lo que se midió y dio bien

1. **Foco con teclado:** hoja de la tuerca, 3 controles (la ×, los dos interruptores); aviso, 2 botones («Nueva venta», «Reimprimir»): todos con
   anillo, ninguno flojo ni tapado (`medir.js { foco: true }`). Al abrir el aviso, el foco cae en «Nueva venta» (Enter) y, al cerrarlo, vuelve al buscador.
2. **Alto de los controles:** 40 px con mouse; 44 px con dedo en las dos hojas (375 px).
3. **Letra:** el aviso usa 13 · 14 · 16 y la serif del título (27 en escritorio, 25 en el celular) y la del vuelto (30), con cifras tabulares.
4. **Color:** ningún texto de las piezas nuevas falla contraste, en claro ni en oscuro. Solo tokens (`text-secundario`, `text-tenue`,
   `text-verde-profundo`, `text-ambar-profundo`, `text-rojo-profundo`) y recetas de vidrio (`vd-placa`, `vd-lente`).
5. **Movimiento:** solo el del velo del `<Modal>` (160 ms, `--ease-cayla`, una vez); quieto, nada se mueve. La tuerca y el aviso no agregan animación.
6. **Textos:** una línea por opción, de 8 palabras o menos («Poco texto a la vista»).

## Decidido a propósito (de piezas ya decididas, no de esta rama)

- **El pie del `<Interruptor>` va a 13 px** («La boleta sale en la computadora de la caja.»): lo dibuja la pieza (`components/ui/campos.tsx`,
  `text-xs`); el medidor lo cuenta como lectura bajo 14. Es de la pieza, no de la tuerca → `/unificar` (familia `casilla`).
- **El interruptor apagado se aparta poco de su fondo** (1,11:1 en claro, 1,17:1 en oscuro, sin contar su borde): es la pieza «pozo y gota» decidida
  el 2026-11-01; su contraste lo mide `lib/vidrio-contraste.test.ts` → `/unificar` (familia `casilla`).
- **Los montos sin espacio** («S/129.90»): Vender escribe así desde V1 (`lib/money.ts`), igual que la hoja de antes y el ticket.

## Sin medir

- **`/vender` de verdad**, con sesión y caja abierta: en esta máquina no se inicia sesión en la base compartida (hace falta un banco propio).
- **La tuerca a 375 px con `tacto:medir`:** se dibuja de 36 px como «Más» (`BOTON_ACCESO`, con `area-dedo`); no se midió su área de toque.
- **El foco de la tuerca misma:** con la tuerca como raíz el medidor no encuentra controles dentro (es el control).
- `textos` a 375 px.
