# Auditoría al milímetro — Recibir ▸ Contar ▸ la hoja «N de [modelo] ya están en el stock» (imprimir la tanda) · 2026-11-14 · `claude/recibir-imprimir-tanda-594af7`

Medido: 1440×900 claro · 1440 oscuro (`data-tema="oscuro"`, solo el medidor de color) · 375×812 (captura) · quieto (el aparato de prueba tiene las animaciones apagadas)
Servidor: local, base compartida (envío ENV-001660). Raíz de los medidores: la hoja (`[role=dialog]`).

Resumen: **0 graves · 0 medias · 0 leves** en lo que cambió este PR · 2 «revisar» descartados · 3 notas del resto de la página.

## Lo medido de la pieza
- **Árbol:** ninguna pieza nueva. El botón es `<BotonImprimir peso="primario">` (pieza decidida «Imprimir», 2026-10-14; antes era un `BotonEnlace` con el
  texto a mano), la hoja es `<Modal conCerrar>`, los avisos son `<Aviso chico>` (`error` con «Reintentar», `atencion` para lo que no tiene código), el
  enlace es `btn-cayla btn-enlace` y el aviso de la Mac sin ayudante es `AvisoAyudanteMac`, el mismo de la pantalla de Etiquetas.
- **Color / contraste (WCAG 1.4.3):** 8 textos medidos en claro y 8 en oscuro, 0 fallan. El texto del botón negro sale «no concluyente» para el medidor
  (va sobre el vidrio de la gota): lo cubre `lib/vidrio-contraste.test.ts`. 0 rojos en la hoja; el rojo queda para el aviso de error.
- **Foco (2.4.7, 2.4.11):** 6 controles enfocados con Tab real: 0 sin anillo, 0 flojos, 0 tapados.
- **Espacio:** 0 blancos bajo 24 px que fallen; controles de 40 px (y 42 el del aviso). En el celular el enlace `btn-enlace` toma el área de 44 px de `tacto.css`.
- **Tipografía:** lectura a 14–15 px, botones a 13,5; sin líneas de más de 80 caracteres.
- **Estados:** `loading`: «Imprimiendo…» con el ancho fijo de `<Boton cargando>` y la hoja bloqueada mientras tanto; `disabled`: solo cuando no hay nada
  que imprimir («Nada que imprimir») o la lectura falló (con su aviso y «Reintentar» a la vista); `error`: aviso con ícono y texto, no solo color;
  `selected` y `read-only`: no aplican; `quieto`: 0 animaciones y 0 bucles.
- **Textos:** el medidor de textos, sin fallas en la hoja. El enlace es una sola línea de cuatro palabras («Ajustar antes de imprimir»).

## Revisar descartado
- `esperaEscritaAMano` en «Imprimir la etiqueta / Imprimiendo…»: es `<Boton textoCargando>` dentro de `BotonImprimir`, que pinta las dos palabras para no cambiar de ancho.
- «Ver cómo» mide 61×20 px: es el enlace de `AvisoAyudanteMac` (pieza de antes, separada de otros blancos); solo aparece en una Mac sin el ayudante.

## Notas del resto de la página (no son de este cambio)
- El interlineado del título de toda hoja (27/29,7 = 1,10): es de `<Modal>`.
- «Cambiar de ubicación» de la cabecera: borde 2,35:1; es del marco.
- Dos `:hover` que el medidor marca «revisar» (`.barra-t`, `.parecidas-punto`): CSS global.

## Sin medir
- Gráficos: no hay. El papel impreso no se midió (la hoja de impresión es la misma de Etiquetas, sin cambios de dibujo).
- La captura en oscuro: el tema se aplicó para el medidor, pero la captura del panel no lo reflejó; el contraste sí se midió con los tokens oscuros.
