# Auditoría al milímetro — `/vender/apartados` ▸ «Liberar apartado» ▸ hoja «Avisarle a <nombre>» · 2026-11-16 · `claude/milimetro-aviso-liberar` sobre `4fa4d2c38` (PR #1888)
Medido: 1440×900 claro (quieto y vivo) · 1440 oscuro · ~409 px (preset celular, el panel no dejó 375 fijo) · foco con Tab real     Servidor: localhost:3010, base local con un apartado de prueba (foto `antes-whatsapp-liberar`, restaurada al terminar)
Resumen: 0 graves · 1 media (corregida) · 0 leves · 0 decididos a propósito

Raíz medida: `[role=dialog]` en el estado que sigue a «Liberar prendas». Piezas: `<Modal>` (hoja Serena), `card-cayla` + globo `bg-hueso` (los mismos de «Recordar»), `pie-acciones`, `btn-cayla btn-secundario` «Ahora no» y `<Boton peso="primario">` «Avisar por WhatsApp» con `MessageCircle` de 16 px. Ninguna pieza dibujada a mano.

## Graves
Ninguno.

## Medias
1. **El monto del mensaje no tenía el formato del ERP** — `mensajeLiberacion` (`apps/web/lib/separaciones-reglas.ts`) — medido «S/90.00» — regla «S/ 90.00» con espacio que no se parte, escrito con `soles` de `lib/compras-reglas.ts` (`/textos` R1, ADR-0413) — va a `/textos`. **Corregido:** usa `soles` (importado como `solesErp`, porque el archivo tiene su propio `soles` local de «S/90.00»); prueba nueva con 1,250.00. Medido después en la hoja: «S/ 90.00» con U+00A0.

## Leves
Ninguna.

## Lo que se midió y pasó
- Estados (`milimetro/medir.js`): 0 apagados, 0 ocupados que se pulsan, 0 errores, 0 sin etiqueta, 0 bucles. Foco (2.ª pasada, Tab real): 2/2 con anillo, 0 flojos, 0 tapados.
- Espacio: 0 blancos bajo 24 px, 0 valores fuera de escala, 0 proximidad rota; botones de 40 px de alto.
- Tipografía: 0 lectura bajo 14 px (mensaje 15 px, etiqueta 11 px en versalitas, título 27 px serif), 0 líneas de más de 80.
- Color: 0 textos que fallen en claro y en oscuro. El «no concluyente» del botón (1.09 / 1.25) es el medidor leyendo un fondo transparente bajo un degradado: medido a mano, crema `rgb(245,240,232)` sobre tinta al 72–93 % en claro y tinta `rgb(28,26,23)` sobre crema al 74–92 % en oscuro (≈14:1). Los dos controles que fallan (selector de sede y buscador) son de la pantalla de atrás, fuera de la hoja.
- Movimiento (vivo): la hoja no agrega animaciones; el cambio de «¿Liberar el apartado?» a «Avisarle a …» es dentro de la misma hoja (no sale y vuelve a entrar). Lo marcado (aurora, trazo del vacío) es del marco y de la pantalla de atrás.
- Celular: la hoja sube desde abajo con su asa, «Ahora no» y «Avisar por WhatsApp» a mitades (176 px cada uno), sin desborde.

## Sin medir
- 44 px con el dedo: el panel no emuló `pointer: coarse` (lo da `tacto.css`; `pnpm --filter web tacto:medir`).
- Ancho exacto de 375 px: el panel cambió de ancho durante la medición; se midió a ~409 px con el preset celular.
- `/chaos` de «Liberar prendas»: no se corrió (la RPC `liberar_separacion` no cambió).
- Fuera de alcance, visto de paso: `mensajeWhatsapp` («Recordar») también escribe «S/99.00».
