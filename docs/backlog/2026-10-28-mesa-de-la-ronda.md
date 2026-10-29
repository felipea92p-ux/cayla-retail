# Backlog · 2026-10-28 · «La mesa de la ronda» de Mis compras (ADR-0559) — rama `claude/mesa-de-la-ronda`

- [ ] **Probarla con una cuenta real y la base local** (`pnpm --filter web tema:auditar -- --ruta /compras/mi-plata --escenarios` y `guias:recorrer`): hasta hoy solo se vio `MesaDeLaRonda` con datos inventados (los de la captura de Felipe), sin base ni sesión.
- [ ] **Una ronda con muchas compras:** la tabla de «En esta ronda» solo se vio con 2 a 4 filas; con 30, ¿conviene paginar o plegar?
- [ ] **`/formidable` con una compradora** sobre Mis compras con la ronda abierta (pendiente desde #1359, y ahora con la pantalla nueva).
- [ ] **Escenarios del tema (`tema/escenarios/registro.mjs`):** la tabla y las tarjetas de ronda no tienen escenario propio; la pantalla ya está en el registro.
- [ ] **«Rondas anteriores» sin ronda abierta** (la de «Tu última ronda») no cambió: si Felipe quiere también tarjetas ahí, es otra decisión.
- [ ] **Una ronda recién abierta:** el bloque `RondaVacia` (solo PC) y las tarjetas del celular siguen como antes; mirar con una compradora si el camino de la ronda ya basta.
