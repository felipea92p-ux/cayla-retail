## 🧨 /chaos de Gestión, Inicio y las sueltas (2026-10-15) — rama `claude/chaos-gestion-5c56e1`, ADR-0423

- [ ] **Pegar en producción**, con el OK de Felipe y en este orden: `20261015174000` (solo `alter table` sobre `compra_adjuntos`) y después
  `20261015175000` (dos reemplazos anclados; verificados contra producción el 2026-10-15).
- [ ] La coma decimal en la meta de una persona: «12.500» se lee como S/ 12.50 (`leerSoles`). Es la misma pregunta transversal que dejó
  Producción («1.299,50»): la decide Felipe una vez para todo el ERP.
- [ ] Una meta `NaN` por la API responde «no puede pasar de la de la tienda»: no entra nada, pero el mensaje no es exacto (gravedad 4).
- [ ] No cubierto en el navegador: la ráfaga de clics en Frescura (la base local no tenía prendas «Por decidir») y la hoja de la meta (sin
  horarios ni meta de la tienda en local). Las dos se probaron en la base.
