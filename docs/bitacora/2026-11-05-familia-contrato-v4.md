# 2026-11-05 — Retail en el contrato v4 de la familia, y una sola esquina de tarjeta

**Qué se hizo:** Retail trae el contrato v4, idéntico al de Dynamic: Retail manda en diseño. Cada pieza lee su radio de un token, y las tarjetas de 20 y 24 px pasaron a 22 px (P10). `recetas.css` volvió a tener solo variables: las reglas de contraste de ADR-0611 salieron a `vidrio/aguanta.css`, y una prueba lo exige en cada PR.
**Por qué:** Felipe decidió que Dynamic se vea como Retail, y Retail seguía en v3. Además, desde ADR-0611 el vigilante de Dynamic rechazaba `recetas.css` entero, y nadie se enteró: su Action todavía no había corrido.
**Felipe se lleva:** los 2 px casi no se ven; lo que gana es una sola regla para los dos sistemas. Quedaron fuera, con su motivo escrito, lo que flota y lo que tiene diseño propio: ampliarlo es decisión suya. Dynamic no recibe el vidrio macizo por este camino.
