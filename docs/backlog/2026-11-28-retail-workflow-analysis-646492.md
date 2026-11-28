## ⚡ Flujos más cortos: DNI en la boleta y «Quién» ya puesto (2026-11-28) — solo web, sin migración; rama `claude/retail-workflow-analysis-646492`

### Hecho

- [x] Análisis `docs/investigacion/2026-11-28-flujos-para-acortar.md` y maqueta `docs/maquetas/flujos-mas-cortos-2026-11/`.
- [x] Mejora 3: el DNI de la boleta une la ficha (ADR-0718), con guía de Vender al día.
- [x] Mejora 5: sin paso «Quién» cuando el responsable ya viene puesto.
- [x] Mejora 4: «Registrar y aprobar» en el último paso de la devolución, con guía al día.

### Sin hacer (dicho sin adornos)

- [x] `/milimetro auditar` de lo que cambió (`docs/milimetro/auditorias/2026-11-28-retail-workflow-analysis-646492.md`), medición de
  oficio de la devolución, revisión independiente del diff y `guias:recorrer` de las tres pantallas (escritorio y 375 px).
- [ ] `/chaos` completo (núcleo de 8 familias con semilla) y `/formidable` con prueba ciega: no se corrieron; solo ataques dirigidos
  (triple clic, corte de red al aprobar, reembolso de más, «Quitar» con el ticket en espera).
- [ ] `tema:auditar` no se corrió; el color en oscuro se midió solo en lo que cambió.
- [ ] Guía de foco: `/devoluciones` y `/vender` siguen «pendiente» de antes; el reembolso del último paso no la lleva.
- [ ] «Por aprobar» deja confirmar un reembolso mayor que lo pagado y la base lo rechaza (de antes); el paso nuevo sí lo frena.
- [ ] La terminal compartida (sin responsable puesto) no se probó en el navegador: se sostiene en el código y en las pruebas de reglas.
- [ ] En las mejoras 3 y 5 no se grabó nada: se leyó lo que viajaba a la base y se bloqueó.
- [ ] De la 4 no se probó en el navegador: el reembolso sin caja abierta, un medio distinto de efectivo y el fallo al aprobar.
- [ ] **Decide Felipe:** mejoras 1 (traslados) y 2 (anular).
- [ ] **Decide Felipe:** botón «Guardar como cliente» para un DNI sin ficha.
- [ ] Aviso en Nuevo producto de mercadería que ya viene en camino (puede entrar dos veces).
- [ ] A la base local solo se le aplicó la parte de devoluciones de `20261027164000` (ADR-0534); el resto sigue sin aplicar.
