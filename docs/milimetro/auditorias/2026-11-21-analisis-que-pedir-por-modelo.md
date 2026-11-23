# Auditoría al milímetro — Gestión ▸ Análisis ▸ «Qué pedir» por modelo · 2026-11-21 · `claude/analisis-design-improvement-6bc529` (sobre 160c217ac)

Medido: 1440×900 claro vivo (milimetro, espacio, tipografia, color, textos, movimiento) · 375×812 claro (milimetro, espacio, tipografia, textos) ·
1440×900 oscuro (color), cada uno sin filtros y con un solo tipo («Polos») en el filtro. Servidor: la web de la rama en local, con una página de prueba de
datos inventados (no se commitea).

Resumen: 0 graves · 0 medias · 1 leve · 4 de piezas del sistema o decididos a propósito

## Graves

Ninguno. Las tarjetas por modelo son la misma `TarjetaPrenda` de «Se acaba» (ya auditada en `2026-11-21-analisis-b.md`), y el bloque del tipo no
tiene fallas de contraste, de tamaño ni de desborde a los tres anchos.

## Medias

Ninguna.

## Leves

1. **El veredicto del bloque del tipo, 24/27,6 px = 1,15 a 375 px** (dos líneas en la serif) — `.an-veredicto` (`app/estilos/analisis-b.css`) — es el valor
   que fija la ficha al milímetro para el veredicto (`docs/milimetro/analisis-b.md`, §6) — `[Práctica]` — /tipografia.

## De una pieza del sistema o decidido a propósito

- **La lista abierta del filtro «Tipo»** (quedó abierta en la medición): su buscador con borde de 1,35:1, «1 prenda» a 3,62:1 en oscuro y la ✕ de «Quitar
  filtro» de 22 px son de `DesplegablePildora` (pieza `filtro`, decidida), no de esta pantalla: van a `/unificar` si se confirman.
- **El globito de las pestañas a 10,5 px y DM Sans sin cifras tabulares:** pieza `contador` y propuesta 1 de `/tipografia` (como en la auditoría anterior).
- **La pestaña elegida, gota contra pozo 1,24:1:** pieza `pestanas` decidida.
- **«Ordenar por» cortado a 375 px:** es el margen de la página de prueba; en la pantalla real no se corta (medido en la auditoría anterior).

## Sin medir

- El movimiento de lo que dura poco (`__mov.grabar`); no hay bucles.
- 1024 px y tablet.
