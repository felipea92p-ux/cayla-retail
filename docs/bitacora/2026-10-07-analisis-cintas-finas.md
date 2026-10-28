## 2026-10-07 (Análisis: «Qué hacer hoy» con cintas finas y «Liquidar desde» sin tope — ADR-0357)
Qué hice: el flujo de «Qué hacer hoy» pasó a cintas finas (A1): grosor como la raíz de las prendas con tope, degradado, «Tu tienda» como
tarjeta clara y etiquetas claras. «Liquidar desde» dejó la barra de 30 a 85 por una caja con − y + de 1 a 999 días (B1), con el carril que se
alarga si pasa de 4 meses; la migración `20261007100000` cambió el rango en la base, y Felipe la pegó en producción el mismo día.
Por qué así: Felipe vio el flujo «muy brusco» (49 prendas llenaban la tarjeta) y pidió que «Liquidar desde» no tuviera tope; eligió A1 y B1
mirando las propuestas lado a lado (artifact «Qué hacer hoy y Liquidar desde»).
Qué sigue: refrescar el volcado de producción para que el diccionario diga 1 a 999; `/formidable` y `/chaos` de Análisis siguen pendientes.
