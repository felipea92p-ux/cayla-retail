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
- [ ] **«Se acaban» como filtro:** con la cobertura del Ritmo reciente; «Sin ventas en 30 días» pide la ventana de 30 días de Frescura.
- [ ] **El panel guiado paso a paso de la maqueta** (acciones como flujos de pocos toques): actividad aparte, choca con ADR-0328.
- [ ] **Atajos de teclado** (1–7, flechas) del cajón.
- [ ] **Orden de fusión con #807 y #808:** los tres tocan `ExistenciasTarjetas.tsx` e `InventarioPanel.tsx`; #808 renombra la ventana y sus reglas.
- [ ] **Capacidad al «Todo el almacén»:** hoy no pregunta por el tope del piso (ADR-0329).
