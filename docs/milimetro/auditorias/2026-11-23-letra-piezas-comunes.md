# Auditoría al milímetro — letra y texto de las piezas comunes · 2026-11-23 · `claude/letra-piezas-comunes`

Medido: las mismas 31 pantallas a 1440 × 900 y 5 a 375 × 812 del barrido de la escala de letra, en claro, en un Chrome de prueba contra
el servidor de la rama (`localhost:3010`). Se comparó cada pantalla con su estado en el PR #1978: tamaño de cada texto, textos cortados,
desborde horizontal y alto del documento. Además, en captura: el aviso de la esquina y la lista de un filtro (Productos), el cajón de un
proveedor y el Historial de ventas.

Resumen: **0 graves · 0 medias · 1 leve** · el cambio no movió nada: 0 textos cortados nuevos, ninguna pantalla cambió de alto y ninguna ganó desborde horizontal.

## Lo que se midió

| Medida | En el PR #1978 | Con este cambio |
|---|---|---|
| Textos por debajo de 13 px, en las 36 vistas | 250 | 248 |
| Textos cortados | 208 | 208 |
| Pantallas cuyo alto cambió | — | 0 de 36 |
| Vistas con desborde horizontal | 0 | 0 |

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Leve | En el cajón de un proveedor, «FACTURADO 12 M» y «ÚLTIMA COMPRA» ocupan dos renglones | Compras ▸ Proveedores, las tres cifras del cajón | Abierto: viene de la letra a 13 px (PR #1978), va con Compras |

## Sin medir

- El calendario de un campo de fecha y el loader a pantalla completa: cambiaron de clase, no de tamaño; no se abrieron.
- El modo oscuro: el cambio no toca colores.
