## 2026-11-05 (Taller: cerrar lo pendiente antes del rediseño, ADR-0614)
- **Actividad 1 · Revertir un cierre devuelve el costo de la prenda (migración `20261105213000`).**
  QUÉ HICE: `revertir_produccion` ahora devuelve `variantes.costo` al valor exacto de antes del cierre y deja una fila `reversion` en `costo_historial`. Si después entró otra compra u otro cierre, se rechaza.
  POR QUÉ ASÍ: un promedio ya mezclado no se puede deshacer sin inventar un número (ADR-0515); en orden inverso sí se puede.
  QUÉ SE ROMPERÍA SIN ESTO: una orden mal cerrada dejaría mal el costo de la prenda en todas las sedes, y Revertir no lo arreglaría.
  Verificado: `pruebas:produccion-revertir-costo` 11/11 y, con la migración aplicada en la base local, cierre, «ya estaba», ruta nueva, punta a punta, anulaciones, corregir compra, balance y Frescura en verde. Sin probar en el navegador: el único cambio de pantalla es una frase.
