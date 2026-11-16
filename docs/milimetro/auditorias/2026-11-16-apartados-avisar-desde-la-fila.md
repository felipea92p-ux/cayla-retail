# Auditoría al milímetro — `/vender/apartados` ▸ Historial ▸ fila de un apartado liberado ▸ «Avisarle a <nombre>» · 2026-11-16 · `claude/avisar-apartado-liberado`
Medido: 1440×900 claro y oscuro (fila); la hoja es la misma pieza `AvisoDeCancelacion` auditada en `2026-11-16-apartados-avisar-al-liberar.md`, abierta desde la fila y vista a ~409 px (celular)     Servidor: localhost:3010, base local con apartados de prueba (foto `antes-whatsapp-liberar`, restaurada al terminar)
Resumen: 0 graves · 0 medias · 0 leves · 0 decididos a propósito

Piezas: en la fila, el mismo `btn-cayla btn-secundario` chico con `MessageCircle` de 14 px que ya usa «Recordar» en las filas abiertas (`BOTON_CHICO`), con nombre accesible «Avisarle a <nombre> por WhatsApp que se canceló» y `title`. La hoja, `<Modal>` + `AvisoDeCancelacion` (la misma de «Liberar», ahora compartida).

## Lo que se midió y pasó
- Botón de la fila: 52 × 40 px, nombre accesible presente; 0 blancos bajo 24 px; 0 controles ni textos que fallen en claro ni en oscuro.
- Hoja desde la fila: «se liberó solo» → «… venció y lo cancelamos …»; liberado a mano (la fila no trae el motivo) → «… cancelamos tu apartado …», sin inventar por qué. Monto «S/ 90.00» con U+00A0. «Avisar por WhatsApp» abre `wa.me/51…` y cierra; «Ahora no» cierra.
- La hoja de «Liberar» sigue igual tras compartir la pieza (medido con «Fue un error al apartar»).

## Ya estaba (no es de este cambio)
- El padding de 14 px de cada fila de la lista (`li.anim-sube`) queda fuera de la escala de 4: 6 valores, de antes.

## Sin medir
- Anillo de foco del botón de la fila con Tab real (es la misma clase `btn-cayla` que el ícono de «Recordar» de al lado).
- 44 px con el dedo y 375 px exactos (el panel no los sostuvo).
