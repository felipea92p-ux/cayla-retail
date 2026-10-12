## 2026-10-06 (Modo oscuro: tres fallas que ya estaban en `main` y los escenarios de la auditoría — ADR-0336, actualización)
Qué hice: la cifra dorada del héroe de Caja se oscurece solo en oscuro (2.22 → 4.6:1); «Vence el» de Registrar factura se apaga como un
`fieldset` deshabilitado y su frase («Al contado no hay vencimiento.») queda fuera de la opacidad; el velo del panel de la talla en
Existencias pasa de `tinta` a `sombra`. En la auditoría, 5 escenarios vuelven a abrir lo que dicen (y uno obsoleto se borra). Antes:
8 hallazgos solo en oscuro en `/caja`, `/compras/nueva`, `/inventario` y `/inventario/movimientos`; después: 0, con las 26 visitas cargadas.
Por qué así: el dorado del efectivo es color de dato y no cambia, así que en oscuro se mezcla hacia el texto del héroe y en claro queda
igual; la opacidad sobre «Vence el» hundía su frase también en claro (1.7:1), y ningún `dark:` lo arreglaba sin quitar el «apagado».
Felipe se lleva: abrir Caja y Registrar factura en oscuro y mirarlos; Cambios paso 4 y la ficha de Análisis siguen sin abrir por datos
locales (ver el backlog de esta rama), no por el escenario.
