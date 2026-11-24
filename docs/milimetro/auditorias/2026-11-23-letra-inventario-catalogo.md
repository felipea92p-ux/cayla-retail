# Auditoría al milímetro — letra y texto de Inventario y Catálogo · 2026-11-23 · `claude/letra-inventario-catalogo`

Medido: 79 vistas de Inventario y Catálogo, 47 a 1440 × 900 y 32 a 375 × 812, en un Chrome de prueba contra el servidor de la rama
(`localhost:3010`), antes y después del cambio y con la misma base local. Las vistas solo abren hojas; ninguna guarda. Son: Existencias
(tarjetas, el cajón de una prenda con «Esta talla» y «Todas», la hoja de pendientes), Movimientos con su cajón y sus pestañas Ingresos y
Pérdidas, Traslados con sus tres pestañas y un pase, Nuevo traslado, Conteo, Bajar al piso, Cuadrar el piso, Barrido y su historial,
Ventas sin registrar, Recibir, Productos (grilla, tabla y vista rápida), Nuevo producto, Editar producto, el historial de una prenda,
Categorías, Familias, Marcas, Atributos con sus cinco pestañas, Campañas con sus hojas de configuración y de oferta, Insignias, Por
revisar y Revisar precios. En cada una: el tamaño, el interlineado y el alto de cada texto, los textos cortados, el desborde horizontal
y el alto del documento. El «después» se repitió en oscuro. Aparte: los visores de cámara de Existencias y de Bajar al piso, antes y
después, con la cámara de prueba del navegador, y la planilla de «Ajustar stock».

Resumen: **0 graves · 0 medias · 2 leves** · en las 79 vistas los textos de menos de 13 px bajaron de 246 a 69, sin un texto cortado nuevo ni desborde; los visores de cámara pasaron de 11 a 13 px.

## Lo que se midió

| Medida | Antes | Con este cambio |
|---|---|---|
| Textos por debajo de 13 px, en las 79 vistas | 246 | 69 |
| De esos, el «?», iniciales de avatar, un rótulo de baldosa y uno de muestra (letra fija a propósito) | — | 68 (el que falta era el nombre del globo del «?», que se subió a 13 px después de medir) |
| Textos cortados | 723 | 723 |
| Vistas con desborde horizontal | 0 | 0 |
| Vistas cuyo alto cambió | — | 19 de 79 (16 más cortas, por el texto; 3 de Campañas, +3 px) |
| Textos cuyo interlineado cambió sin cambiar de tamaño | — | 3 (una línea de «Para hoy», una tecla y un guion) |
| Rótulo de un visor de cámara | 11 px | 13 px |
| El nombre que encabeza el globo del «?» | 10,5 px | 13 px |

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Leve | A 13 px, el rótulo «Bajar · si se repite, te pregunto» pasaba a dos renglones entre la × y el contador | El visor de Bajar al piso, a 375 px | Resuelto: el rótulo dice «Bajar al piso»; la regla ya la dice el texto bajo el campo |
| 2 | Leve | El sello «Recibida» pisa un poco la línea «Envía …» | El pase de un traslado recibido | Abierto: ya pasaba antes; con el sello a 13 px se nota algo más |

## Sin medir

- La mesa de Contar de Recibir, la mesa de Ventas sin registrar, las parecidas de Nuevo producto, la hoja Fusionar productos y un conteo
  en curso: la base local no tiene con qué abrirlas. Su letra cambió igual (es de lectura, sin medidas fijas).
- El «antes» en oscuro: el cambio no toca colores; en oscuro se midió solo el «después» (79 vistas, 0 desbordes).
- Los visores con una cámara de verdad: se vieron con la cámara de prueba del navegador, que da una imagen fija.
- Un teléfono de verdad y Safari: el celular es emulado.
- El papel: etiquetas, rótulos y guías de traslado no se tocaron.
