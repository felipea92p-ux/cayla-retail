# Auditoría al milímetro — letra y texto de Compras, Gestión y Rendimiento · 2026-11-23 · `claude/letra-compras-gestion`

Medido: 74 vistas, 42 a 1440 × 900 y 32 a 375 × 812, en un Chrome de prueba contra el servidor de la rama (`localhost:3010`), antes y
después del cambio y con la misma base local. Las vistas solo abren hojas; ninguna guarda. Son: el Historial de compras con el cajón de
una compra, Por pagar con su vista rápida y la hoja de pago, Proveedores con el cajón de uno y la hoja de registrar, el Plan de campaña
(tabla, la hoja de una categoría, Calendario, Historial, Presupuesto, Pagos y Resultados), Mis compras con sus hojas «Me dieron» y
«Gasté», el Apunte de compras, los envíos, Fondos, Notas de crédito, Órdenes y Nueva orden, Gestión, Análisis con sus cinco pestañas y
la hoja de confianza, Frescura con el detalle de una prenda y «¿Cómo se lee?», el Plan del piso con sus tres pestañas y su
configuración, Preguntas del equipo, Pedidos no atendidos y Rendimiento con una fila abierta y su historial. En cada una: el tamaño, el
interlineado y el alto de cada texto, los textos cortados, el desborde horizontal y el alto del documento. El «después» se repitió en
oscuro.

Resumen: **0 graves · 0 medias · 2 leves** · en las 74 vistas los textos de menos de 13 px bajaron de 427 a 134, sin un texto cortado nuevo ni desborde; lo que queda a la vista bajo 13 px son las cifras y los ejes de los gráficos.

## Lo que se midió

| Medida | Antes | Con este cambio |
|---|---|---|
| Textos por debajo de 13 px, en las 74 vistas | 427 | 134 |
| De esos, el «?» e iniciales de avatar (letra fija a propósito) | — | 94 |
| De esos, cifras y ejes de gráficos (pendiente) | 40 | 40 |
| Textos cortados | 269 | 269 |
| Vistas con desborde horizontal | 0 | 0 |
| Vistas cuyo alto cambió | — | 30 de 74, entre −135 px (por el texto más corto) y +53 px |
| Textos cuyo interlineado cambió sin cambiar de tamaño | — | 3 cifras de Por pagar (27 → 28 px) y 2 rótulos (14,3 → 16,3 px) |
| El globito de un gráfico | 12 px | 13 px |
| Las fechas del calendario del Plan | 12,8 px | 13 px |

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Leve | Con los rótulos en dos renglones y «Saldo» en uno, las tres cifras quedaban a distinta altura | El cajón de un proveedor | Resuelto: cada celda pega su cifra abajo. En una sola línea no entran (se probó: «Última compra» se cortaba) |
| 2 | Leve | Las cifras sobre las barras (11 px) y los ejes (10,5 px) siguen bajo el piso | Los gráficos de Por pagar, Proveedores y Rendimiento | Abierto: su posición se calcula con esos tamaños; pide una lámina para Felipe |

## Sin medir

- Una orden de compra abierta, el detalle de una factura, la hoja de un pago en varios medios y el paso a paso del Plan: cambiaron de
  clase, no de tamaño; no se abrieron.
- El «antes» en oscuro: el cambio no toca colores; en oscuro se midió solo el «después» (74 vistas, 0 desbordes).
- Un teléfono de verdad y Safari: el celular es emulado.
- El papel: la lista de compra que se imprime no se tocó.
