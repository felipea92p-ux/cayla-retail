## 💲 Nueva orden: costo por prenda partido en tela y servicios (2026-10-16) — rama `claude/costos-unitarios-maquila-desglose`, sobre `claude/production-module-redesign-136cca`

- [x] Ficha de «Nueva orden de producción»: «Costo por prenda» arriba, su desglose (tela y cada servicio de afuera con su proveedor) y «Toda la orden»
      abajo; las partes suman exactamente el costo por prenda con el que se mide el margen. `partesDelCostoPorPrenda` (`lib/orden-ficha-reglas.ts`) y
      `serviciosConCosto` (`lib/orden-fases-reglas.ts`), con pruebas (incluida una al azar con semilla). Retirado `textoQuien` (sin llamadores).
- [x] Verificado en local a 1440 px, claro y oscuro (contraste 5.16 y 6.56), y en las pruebas, tipos, lint y Knip del repo.
- [ ] **Sumarlo a la rama del rediseño** antes de su `/abrir-pr`: este commit parte del último de esa rama (`ec9bc16a5`), así que entra con un merge sin
      conflictos esperados (toca `NuevaOrdenProduccionForm.tsx`, `FichaOrden.tsx`, las dos `*-reglas.ts`, sus pruebas y el texto de la guía). La sesión del
      rediseño sigue abierta: que la sesión que la dirige decida cómo traerlo.
- [ ] **Sin ver en pantalla:** la tela con costo como tercera parte (la base local no tiene una tela con saldo y costo; «ZZ Prueba Lino lavado» está en 0 m).
      Las pruebas cubren el reparto con tres partes, y una parte en 0 no se lista.
- [ ] **Sin tocar, a propósito:** el trabajo propio del Taller (corte, costura, acabado hechos en casa) no entra al estimado de la orden al abrirla; se
      mide al cerrar (decisión de A6 del ADR-0400). La ficha no lo inventa.
- [ ] Nota de entorno: en la base local compartida falta `retail.fn_sobrantes_por_revisar(p_ubicacion_id)` (migración de `main` que esa base no tiene aplicada):
      es el «1 issue» que muestra el indicador de Next en el 3010, no de este cambio.
