# Auditoría al milímetro — Flujos más cortos: Vender, Existencias y Devoluciones · 2026-11-28 · `claude/retail-workflow-analysis-646492`

Medido en local (base local, cuenta Admin del seed) con los medidores de `/milimetro` cargados por `fetch` desde
`apps/web/public/__medir` (borrados después), a 1440 × 900 en claro y oscuro y a 375 × 812, solo sobre lo que cambió: la línea «La venta
queda en su ficha» del cobro, el panel de la talla sin paso «Quién» y el último paso de la devolución (reembolso y botones). La versión
«quieta» es la de fábrica y es con la que se midió.

Resumen: **2 graves arreglados · 0 medias abiertas · 2 leves anotadas** · lo heredado, abajo.

## Graves (arreglados)

- El botón decía «Registrar y aprobar S/ 29.90» sin ningún reembolso puesto: parecía que iba a devolver esa plata. Ahora muestra solo
  lo que sale («S/ 29.90») o «Sin reembolso».
- «Quitar», junto a la línea de la ficha, medía 21 px de alto: ahora 24.

## Leves (anotadas)

- «Todo (S/ …)» pasó de un botón con aro hecho a mano a `btn-sutil btn-chico` (la pieza de «usar un saldo»): se ve más suave.
- Con la acción en el mismo paso, ya no se muestra el resumen previo que vivía en «Quién» (pedir para un cliente, dañada).

## Heredado, no tocado

- Etiquetas del cobro («Tipo de documento», «DNI del cliente») con 3,3:1 sobre el vidrio de la hoja.
- Campo «Monto» del reembolso de 40 px de alto con el dedo.

Capturas a 375 px: `capturas/2026-11-28-flujos-mas-cortos/`.
