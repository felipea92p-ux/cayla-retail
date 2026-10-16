## 💰 Finanzas camino A: lo que dejaron las cuatro revisiones (2026-10-16, rama `claude/finanzas-revisiones-ab242a`, sobre el PR #1127)

- [x] `guias:recorrer` de las seis guías en escritorio y a 375 px oscuro: ✓ (12 · 24 · 15 · 13 · 15 · 10 pasos), capturas miradas, nada que corregir.
- [x] `tema:auditar --cuenta admin --escenarios` sobre las seis rutas: 0 hallazgos solo en oscuro; 1 heredado del claro en «Registrar gasto» (de antes).
- [x] `/chaos` sobre «Registrar movimiento» (planilla y SUNAT), semilla 1016: 22 ataques, 0 de gravedad 1; los 2 de gravedad 2 arreglados en la web con prueba.
- [x] `/formidable` sobre las seis: medido a 3 anchos, ciega con un agente por pantalla, 3 cambios por pantalla **esperando el OK de Felipe** (`docs/formidable/finanzas-*.md`).
- [x] Rojo general arreglado: el motor de guías no arrancaba con `?demo=1` en desarrollo con Next 16.4 (`MotorGuias.tsx`).
- [ ] **De Felipe (RPC):** piso de fecha en `registrar_movimiento_dinero` (como `gasto_antes_del_inicio`, ADR-0412): por la API todavía entra un pago de 1900.
- [ ] **De Felipe (RPC):** `fn_movimientos_dinero` muestre al líder los movimientos de la empresa (`ubicacion_id` nulo) en cualquier vista; hoy solo en «Todas las tiendas». También afecta a «entre cuentas» y «pagar la tarjeta» entre bancos (de antes del PR).
- [ ] **De Felipe (dinero, transversal):** «12,50» se guarda como S/ 1 250 (`parsearMonto` quita todas las comas); ya anotado el 10-14 y 10-15.
- [ ] **De Felipe (negocio):** aviso suave de posible duplicado al registrar dos pagos de planilla/SUNAT iguales en minutos (dos pestañas: dos filas, nada avisa).
- [ ] **De Felipe (presentación, 18 propuestas):** las tres de cada pantalla en `docs/formidable/finanzas-{resumen,dinero,impuestos,gastos-camino-a,reportes,cierre}.md`. Las que más pesan: en Cuentas y dinero la hoja no dice que también sirve para pagar la planilla (la ciega se fue a Gastos); en Gastos dos botones primarios compiten; en Resumen el «Sí» contradice al «33 %» y «te quedan» supera a lo vendido sin explicarlo.
- [ ] **Texto, una línea:** `ritmoPulso` dice «Ya cubriste todo lo fijo» cuando no hay fijos cargados (`lib/pulso-reglas.ts:140`).
- [ ] `guias:recorrer --cobertura` reporta 0 % en todas las guías (el contador de «controles encendidos» parece roto; no es del PR).
- [ ] El escenario `cierre.pendientes` de `tema:auditar` no encuentra su botón cuando ninguna unidad tiene pendientes (seed): declararlo condicional.
- [ ] El error de UN dato en la hoja («Escribe el monto.») sale como aviso arriba a la derecha, no bajo su campo; la hoja sigue `pendiente` de guía de foco (deuda de antes).
- [ ] Colaboradora real en las seis pantallas (la ley 1 no pasa de 8 sin ella).
