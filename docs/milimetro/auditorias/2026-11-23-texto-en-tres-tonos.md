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

## Actualización 2026-11-23: las cifras en Inter

Medido con un guion propio (fuera de git, `apps/web/unificar/.salida/cifras-inter/medir.mjs`): cada pantalla con el recorte de Inter (lo
nuevo) y sin él (`--font-sans` de antes puesto en `<html>`), en la misma página. Cuenta los textos con dígitos que se cortan, que bajan de
línea o que desbordan la página. 38 pantallas a 1440 × 900 en claro (Inicio, Caja, Compras y sus pestañas, Proveedores, Existencias,
Movimientos, Traslados, Productos, Ventas, Apartados, Clientes, Finanzas, Gestión, Rendimiento, Producción, Tienda web, Vender) y Vender,
Cambios, Devoluciones, Apartados y Existencias a 375 × 812: 43 vistas, 1.735 textos con dígitos, 1.082 de ellos con `tabular-nums`.

Resumen: **0 graves · 0 medias · 0 leves** tras un arreglo: el N.° de documento de Historial de compras bajaba de línea («F077-08080707»,
23 → 47 px) porque la columna de 7,5 rem no cabía un número de SUNAT completo; ya no cabía antes con «F001-00000000». Pasó a 8 rem.

| Medida | Antes (DM Sans) | Con Inter en los dígitos |
|---|---|---|
| «1111» y «0000» con `tabular-nums`, 14 px | 18,4 y 41 px | 36,3 y 36,3 px |
| Un número en texto corrido, 14 px | — | de 0,4 a 4,7 px más ancho |
| Textos que se cortan, bajan de línea o desbordan (43 vistas) | — | 0 (1 antes del arreglo) |

En las fotos, los montos de «Cómo se pagó» (Historial de ventas) y la columna Total de Compras quedan con los decimales en la misma vertical;
el texto corrido casi no cambia. Sin medir: Safari y el modo oscuro (el cambio es de letra, no de color).
