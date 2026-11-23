# Auditoría al milímetro — El texto en tres tonos (ADR-0694) · 2026-11-23 · `claude/texto-en-tres-tonos`

Medido: Historial de compras (`/compras`), Movimientos (`/inventario/movimientos`) e Historial de ventas (`/vender/historial`), con el medidor
de color (`.claude/skills/color/referencia/medir.js`) inyectado entero con Playwright, antes y después del cambio. Servidor de la rama
(`localhost:3010`) contra la base local aislada con datos inventados, cuenta Líder en Tienda Lima, 1440 × 900 en claro y en oscuro. Es un
cambio de tokens y de la traducción de clases: no cambia espacio, letra, movimiento, textos ni estados, así que solo corrió el medidor de color.

Resumen: **0 graves · 0 medias · 0 leves** · ningún texto bajo 4,5:1 en las tres pantallas y los dos temas; en oscuro, los textos débiles
para APCA (la segunda mirada) bajan de 94 a 46.

## Lo que se midió

| Pantalla | Tema | Textos medidos | Bajo 4,5:1 antes → después | Débiles para APCA antes → después |
|---|---|---|---|---|
| Historial de compras | claro | 113 | 0 → 0 | 1 → 1 |
| Movimientos | claro | 68 | 0 → 0 | 1 → 1 |
| Historial de ventas | claro | 89 | 0 → 0 | 0 → 0 |
| Historial de compras | oscuro | 113 | 0 → 0 | 45 → 14 |
| Movimientos | oscuro | 68 | 0 → 0 | 16 → 10 |
| Historial de ventas | oscuro | 89 | 0 → 0 | 33 → 22 |

Las fotos de después (fuera de git, en `apps/web/unificar/.salida/tono-b-verificacion/`) son iguales a las de la opción B de la lámina
(`docs/milimetro/laminas/2026-11-23-escalas/`).

## Lo que no se midió

- 375 px: el cambio es de color, igual en todos los anchos; no se repitió.
- El texto tenue escrito a mano en los CSS de `app/estilos`: la traducción no lo alcanza (ver ADR-0694, «Lo que no alcanza»).

## Actualización 2026-11-23: sobre la letra de ADR-0691

Las mismas tres pantallas y los mismos temas, con `main` ya traído (escala de letra y cifras de ADR-0691, fondo Seda):

| Pantalla | Tema | Textos medidos | Bajo 4,5:1 | Débiles para APCA |
|---|---|---|---|---|
| Historial de compras | claro | 111 | 0 | 2 |
| Movimientos | claro | 67 | 0 | 1 |
| Historial de ventas | claro | 88 | 0 | 1 |
| Historial de compras | oscuro | 111 | 0 | 10 |
| Movimientos | oscuro | 67 | 0 | 7 |
| Historial de ventas | oscuro | 88 | 0 | 19 |

Un hallazgo medio, arreglado: el N.° de documento de Historial de compras bajaba a dos líneas («F077-08080707», 24 → 48 px de alto), porque
un número de SUNAT completo pide 127,9 px a 16 px y la columna tenía 120. Pasó a 8,5 rem (136 px): los cuatro números, en una línea.
