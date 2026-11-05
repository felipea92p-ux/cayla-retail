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
- **Actividad 3 · Lo que se le debe a un servicio llega a Por pagar (migración `20261105221000`).**
  QUÉ HICE: `fn_servicios_por_pagar` deriva devengado menos lo documentado, se suma a la deuda de Producción y sale en Por pagar del Taller. El nombre de un servicio ahora se registra también con la orden cerrada, sin tocar el monto.
  POR QUÉ ASÍ: copiar la deuda a otra tabla daría dos verdades; derivada cambia sola con otra vuelta o una anulación. Se cuenta sin IGV porque la tarifa es sin IGV.
  QUÉ SE ROMPERÍA SIN ESTO: el Taller debería plata a quien le cose sin que ninguna pantalla de dinero lo dijera.
  Verificado: `pruebas:produccion-servicios-por-pagar` 12/12 y en el navegador local, de la lista a registrar el nombre en una orden cerrada. Sin mirar a 375 px ni en oscuro (va con el rediseño). Sin pegar en producción.
- **Actividad 4 · Pagar a un servicio con el papel que dio (migración `20261105222000`).**
  QUÉ HICE: hoja «Pagar a…» desde Por pagar: cuánto, qué papel (factura, boleta, recibo por honorarios o sin papel), y si ya se pagó o queda por pagar. Al anotar una vuelta, el aviso lleva «Ir a pagar».
  POR QUÉ ASÍ: `pagar_servicio_de_orden` usa la misma puerta de siempre (`registrar_comprobante_produccion`), así Finanzas, IGV y el flujo lo ven sin cambiar. Sin papel queda marcado y fuera de Impuestos.
  QUÉ SE ROMPERÍA SIN ESTO: habría que escribir el pago a mano en Facturas, y la deuda de la orden no se enteraría.
  Verificado: `pruebas:produccion-pagar-servicio` 16/16, reglas 9/9 y en el navegador local un pago sin papel que deja el Taller sin deuda. Sin mirar a 375 px ni en oscuro. Sin pegar en producción.
