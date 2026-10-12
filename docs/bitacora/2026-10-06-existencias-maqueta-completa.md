## 2026-10-06 (Existencias: toda la maqueta táctil — pasos dentro del panel, tarjeta, anillo, pistola — ADR-0344 cuarta vuelta)
Qué hice: cada acción de una talla se hace dentro de su panel, paso a paso (colgar, colgar varias, subir, enviar, pedir para reponer o para un cliente,
ajustar, reportar dañada), con «Falta: …», resumen y «✓ hecho»; Apartar abre la separación de Vender. La tarjeta quedó como la maqueta (cabecera que abre,
tallas marcadas por el filtro, icono Colgar/Pedir/Ver), con el anillo «N de M hoy», la caja de buscar, la pistola sin tocar el buscador, el teclado y
la hoja en el celular. Borré el cajón y las ventanas Reponer, Subir y Reportar dañada, que el panel reemplaza (reusando sus reglas).
Por qué así: Felipe pidió la maqueta completa; los pasos llaman a las MISMAS funciones de la base con los mismos armadores, y borrar las ventanas deja un
solo camino por acción en vez de dos que se desincronizan.
Qué se rompería sin esto: una asesora abría una ventana encima de otra para colgar o pedir, y el mismo «Colgar» tenía dos implementaciones distintas.
Cómo se verifica: `pnpm test` (368 archivos, 156 334 pruebas), `tsc` y ESLint en verde; el panel, los pasos, la tarjeta, la barra y el teclado se
recorrieron en el navegador con datos inventados (página temporal fuera del repo), también a 375 px. Falta `/inventario` con sesión y datos reales.
