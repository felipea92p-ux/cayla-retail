# Auditoría al milímetro — `/productos/nuevo` ▸ paso 3 «Fotos y colores» ▸ los estados de espera nuevos · 2026-11-16 · `claude/mejorar-visualizacion-prendas-cbfd17`
Medido: 1440×900 claro y oscuro (quieto y vivo) · 375×812 (preset celular)     Servidor: localhost:3011, base local (sin la llave de OpenAI: «Catálogo con IA» no aparece)
Resumen: 0 graves · 0 medias · 0 leves en lo nuevo · 0 decididos a propósito

Qué cambió a la vista: la tarjeta de una foto nace en el mismo clic con **«Abriendo la foto…»** (sin imagen todavía) y su × apagada; la tarjeta de un
color cuya foto la IA prepara al encenderla dice **«Arreglando la foto con IA…»** (o **«Terminando la foto de IA…»** si se apagó a mitad) con su × apagada,
también la de las miniaturas. Ninguna pieza nueva: es el mismo letrero que ya decía «Leyendo los colores…» (`span absolute inset-x-0 bottom-0 bg-papel/90
px-3 py-2 text-sm role=status` + `<HiloEnEspera>`), y la × es `<BotonQuitarFoto>` con `disabled`.

Cómo se midió «Abriendo la foto…», que dura menos de un segundo: en la pestaña de prueba, `createImageBitmap` quedó en pausa (parche solo de inspección,
restaurado al terminar) y los medidores corrieron sobre `[data-auditar="abriendo"]`, la tarjeta congelada.

## Graves
Ninguno.

## Medias
Ninguna.

## Leves
Ninguna en lo nuevo.

## Lo que se midió y pasó
- Estados (`milimetro/medir.js`, raíz = la tarjeta): 1 apagado (la ×) con su motivo a la vista (el letrero), 0 ocupados que se pulsan, 0 errores, 0 sin etiqueta;
  1 bucle, el `cayla-hilo-barrido` de 1100 ms, que es señal (`data-senal`): sigue con las animaciones apagadas, como pide ADR-0625.
- Letrero: 15 px (`text-sm`), contraste **16,25:1** en claro y en oscuro (WCAG 1.4.3 pide 4,5), `role="status"` (se anuncia sin mover el foco).
- La × apagada: 28×28 px (WCAG 2.5.8 pide 24), opacidad 0,4 (la de siempre de la pieza), motivo a la vista en el letrero.
- 375 px: el letrero cabe en una línea (307 px de 309 de la tarjeta), sin desborde.
- Movimiento: nada nuevo; la tarjeta no agrega animaciones de entrada. El único movimiento es el hilo de espera.

## Lo que marcaron los medidores y ya estaba (fuera de este cambio)
- `color`: «—» y «S/ —» de la ficha a la derecha en `text-tinta/25` (1,7:1): fantasmas a propósito (CLAUDE.md «Modo oscuro», punto 4).
- `color`: el `input.sr-only` de «Subir fotos» sin borde: es invisible a propósito (lo dispara el botón).
- `tipografia`: 4 textos de 12–13 px y versalitas de 10,5 px de la pantalla (tallas, rótulos de los pasos), no de las tarjetas.
- `textos`: el «Siguiente: …» de la ficha en dos líneas.
- La × de `<BotonQuitarFoto>` mide 28×28 también en el preset celular: no se midió el área de `tacto.css` (`pointer: coarse`).

## Sin medir
- **«Arreglando…» / «Terminando la foto de IA…» en vivo y la × apagada de la tarjeta del color mientras la IA prepara:** necesitan la llave de OpenAI, que
  la base local no tiene. Usan el mismo marcado medido arriba (mismas clases, otro texto de 26 letras, que cabe en 309 px a 15 px).
- 44 px con el dedo (`pnpm --filter web tacto:medir`).
- Foco con Tab (`{ foco: true }`): la × está apagada en estos estados y no recibe foco; no hay otro control nuevo.
- `/chaos`: «Fotos y colores» no guarda en la base salvo al armar una mezcla, que no cambió.
