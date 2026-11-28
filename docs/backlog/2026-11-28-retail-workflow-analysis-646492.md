## ⚡ Flujos más cortos: DNI en la boleta y «Quién» ya puesto (2026-11-28) — solo web, sin migración; rama `claude/retail-workflow-analysis-646492`

### Hecho

- [x] Análisis `docs/investigacion/2026-11-28-flujos-para-acortar.md` y maqueta `docs/maquetas/flujos-mas-cortos-2026-11/`.
- [x] Mejora 3: el DNI de la boleta une la ficha (ADR-0718), con guía de Vender al día.
- [x] Mejora 5: sin paso «Quién» cuando el responsable ya viene puesto.

### Sin hacer (dicho sin adornos)

- [ ] Antes del PR: `/milimetro auditar` de `/vender` y `/inventario`, `/formidable`, `/chaos` y `guias:recorrer`; no se corrieron.
- [ ] La terminal compartida (sin responsable puesto) no se probó en el navegador: se sostiene en el código y en las pruebas de reglas.
- [ ] No se registró una venta ni un movimiento de verdad: se leyó lo que viajaba a la base y se bloqueó.
- [ ] **Decide Felipe:** mejora 4 (devolución en un viaje), después de revisar cómo funciona hoy; mejoras 1 (traslados) y 2 (anular).
- [ ] **Decide Felipe:** botón «Guardar como cliente» para un DNI sin ficha.
- [ ] Aviso en Nuevo producto de mercadería que ya viene en camino (puede entrar dos veces).
- [ ] La base local no tiene `20261027164000` (ADR-0534): hace falta antes de probar la mejora 4.
