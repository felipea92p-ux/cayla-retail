# Auditoría al milímetro — Mis compras ▸ Mis envíos: «Anular envío» (detalle del envío y su hoja) · 2026-11-13 · `claude/mis-compras-anular-envio-en-camino` (1b16188bd)

Medido: 1440×900 claro vivo · 375×812 claro (táctil) · 1440 oscuro (tema aplicado como la app: `localStorage` + recarga) · quieto
Servidor: local, base desechable con todas las migraciones (envío ENV-000001 «En camino» armado por la pantalla). Raíz de los medidores: el cajón del
detalle (`[role=dialog]`) y, en el celular, la hoja `AnularEnvioModal` encima.

Resumen: **0 graves · 0 medias · 0 leves** en lo que cambió este PR · 4 notas del resto de la página (no son de esta pieza) · 1 «revisar» descartado.

## Lo medido de la pieza nueva
- **Árbol:** «Anular envío» es `<Boton peso="peligro">` (pieza decidida «Lo peligroso», ADR-0358, 2026-11-05: lo que abre la confirmación es `btn-peligro`);
  la confirmación es `<Modal>` con `AvisoNoSeDeshace` sobre los botones, `pie-acciones` con Cancelar antes y `<Boton peso="primario" cargando confirma={guia}>`.
  Ninguna pieza dibujada a mano.
- **Color / contraste (WCAG 1.4.3, 1.4.11):** claro — texto del botón 7,17:1 sobre crema (8,58:1 sobre blanco), frase 4,94:1, borde 3,38:1. Oscuro — texto
  8,05:1 sobre el negro cálido (6,25:1 sobre el gris del cajón), frase 7,77:1, borde 4,25:1. Medidor de color: 0 textos que fallan en los dos temas.
- **Foco (2.4.7, 2.4.11):** 4 controles del cajón enfocados con Tab real: 0 sin anillo, 0 flojos, 0 tapados.
- **Espacio:** 1440 — 0 blancos bajo 24 px, 0 valores fuera de escala. 375 táctil — el botón mide 137×44, 0 blancos bajo 44 px en la pieza y en la hoja;
  sin desborde horizontal (`scrollWidth` 375).
- **Tipografía:** la frase va a 15 px (lectura ≥ 14); sin líneas de más de 80 caracteres.
- **Estados de la hoja:** el botón que confirma no se apaga por lo que falta (`disabled=false`, `confirma={guia}`); con el motivo vacío, el error sale bajo el
  campo con su ícono («Escribe por qué se anula el envío»), el foco va al campo y queda `aria-invalid` + `aria-describedby` (WCAG 1.4.1, 3.3.1). `loading`:
  «Anulando…» con el ancho fijo de `<Boton cargando>`. `selected` y `read-only`: no aplican (botón de acción). `quieto`: 0 animaciones y 0 bucles.
- **Textos:** el medidor de textos, sin fallas en las dos vistas.

## Revisar descartado
- `esperaEscritaAMano` en «Anular envío / Anulando…»: es `<Boton textoCargando>` (la pieza decidida `accion.guardar`), que pinta las dos palabras para
  no cambiar de ancho. No es una espera escrita a mano.

## Notas del resto de la página (no son de este cambio, ya estaban)
- Dos `:hover` que el medidor marca «revisar» (`.barra-t:hover …`, `.parecidas-punto:hover::after`): CSS global, fuera de esta pieza.
- Etiquetas de 10,5 px en el marco («Mis envíos» del cajón, el globito): del marco.
- Cifras proporcionales en DM Sans (`dd` de Prendas/Fardos): la propuesta 1 de `/tipografia`, de todo el ERP.
- El hilo del buscador corre en bucle con opacidad 0 mientras no busca: del `Buscador`, no de esta pieza.

## Sin medir
- Gráficos: no hay. El estado `loading` real (la base respondiendo) no se pulsó: anular de verdad ya se probó en el recorrido del PR.
