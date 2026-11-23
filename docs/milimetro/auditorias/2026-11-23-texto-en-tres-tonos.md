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
