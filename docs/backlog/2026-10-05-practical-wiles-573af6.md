## 🧹 Existencias táctil (2026-10-05, ADR-0344) — solo web, sin migración; rama `claude/practical-wiles-573af6`

- [x] **Un icono por tarjeta + ventana hacia arriba** (`AccionesTarjeta`, `lib/existencias-acciones.ts`), sin la pastilla repetida.
- [x] **Atajos de filtro** bajo el buscador (solo iconos / con texto, por equipo) y escáner de un icono (`FiltrosRapidos`, `lib/existencias-rapidos.ts`).
- [x] **Sonido al confirmar**, apagable por equipo (`lib/sonido-confirmar.ts`); un solo motor de audio con el bip del conteo.
- [x] **«Colgar primero»** con el aro de semanas (`ColgarPrimero`, `lib/existencias-colgar-primero.ts`), sobre la lista del día del motor.
- [x] **Ventana de colgar:** «Faltan en el piso», atajos «Lo que falta en el piso · Todo el almacén · Vaciar» y «casi no hay: en otras sedes».
- [ ] **Ver `/inventario` con sesión real** (motor del piso y ritmo de verdad), en computadora y a 375 px. Verificado solo con datos inventados.
- [ ] **Decisión de Felipe — la pastilla quitada** toca ADR-0331 (c): la suma de pastillas ya no se ve en cada tarjeta, solo en la línea del conteo.
- [ ] **Probar el icono solo con una integrante sin capacitación:** si no descubre la ventana, volver un indicador mínimo.
- [ ] **«Pedir a otra sede» desde «casi no hay»:** abrir `PedirAOtraSedeModal` sin apilar ventanas.
- [x] **«Se acaban» y «Sin ventas»** como opciones de «Condición» y atajos «Recomendados» (Ritmo reciente; no son 30 días).
- [x] **La tarjeta de la maqueta** (tallas en botones, precio, colores de 20 px) y **«Prioridad | A–Z»**; «Para hoy» pasó al botón «Pendientes».
- [ ] **Decisión de Felipe — «Pendientes» en vez de quitar «Para hoy»:** se dejó para no perder «Regularizar» ni «Decidir»; borrar el botón si no lo quiere.
- [ ] **Las guardadas por talla** ya no se ven en la tarjeta (solo la suma por color y el tooltip): mirar si hace falta.
- [ ] **El panel guiado paso a paso de la maqueta** (acciones como flujos de pocos toques): actividad aparte, choca con ADR-0328.
- [ ] **Atajos de teclado** (1–7, flechas) del cajón.
- [ ] **Orden de fusión con #807 y #808:** los tres tocan `ExistenciasTarjetas.tsx` e `InventarioPanel.tsx`; #808 renombra la ventana y sus reglas.
- [ ] **Capacidad al «Todo el almacén»:** hoy no pregunta por el tope del piso (ADR-0329).
