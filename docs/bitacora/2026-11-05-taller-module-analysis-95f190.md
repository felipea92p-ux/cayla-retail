## 2026-11-05 (Taller: cerrar lo pendiente antes del rediseño, ADR-0614)
- **Actividad 1 · Revertir un cierre devuelve el costo de la prenda (migración `20261105213000`).**
  QUÉ HICE: `revertir_produccion` ahora devuelve `variantes.costo` al valor exacto de antes del cierre y deja una fila `reversion` en `costo_historial`. Si después entró otra compra u otro cierre, se rechaza.
  POR QUÉ ASÍ: un promedio ya mezclado no se puede deshacer sin inventar un número (ADR-0515); en orden inverso sí se puede.
  QUÉ SE ROMPERÍA SIN ESTO: una orden mal cerrada dejaría mal el costo de la prenda en todas las sedes, y Revertir no lo arreglaría.
  Verificado: `pruebas:produccion-revertir-costo` 11/11 y, con la migración aplicada en la base local, cierre, «ya estaba», ruta nueva, punta a punta, anulaciones, corregir compra, balance y Frescura en verde. Sin probar en el navegador: el único cambio de pantalla es una frase.
- **Actividad 2 · Primeras órdenes cerradas en producción.**
  QUÉ HICE: con la orden de Felipe, desde su cuenta, pasé OP-2, OP-3 y OP-4 al stock del Taller y cerré OP-1 con «ya estaban registradas». Son los primeros cierres reales del módulo.
  POR QUÉ ASÍ: sus prendas tenían costo cero y la tela y las tarifas ya estaban anotadas; lo que Felipe no sabe (nombres de servicios, tela de OP-5 y OP-6) no impedía cerrar estas cuatro.
  QUÉ SE ROMPERÍA SIN ESTO: seguirían sin stock del Taller ni costo real, y Eficiencia sin ninguna cifra.
  Verificado con una consulta de solo lectura: estado, entradas, stock y costo de cada orden. Quedó pendiente lo que dice el backlog.
