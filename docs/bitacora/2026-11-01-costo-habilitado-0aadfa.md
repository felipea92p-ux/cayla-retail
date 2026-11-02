# Bitácora — 2026-11-01 · costo-habilitado-0aadfa

- **Hecho:** un paso del Taller (Habilitado, Costura, Planchado) puede llevar su propio costo: migración `20261101033000`, `poner_costo_a_fase`, «Poner costo» en la ruta de la orden y el cuadro «Costo» con «Habilitado en el Taller» (ADR-0597). Probado: 23 casos de base, las 34 suites de Producción en verde, y en el navegador (claro, oscuro, 375 px).
- **Por qué así:** los mismos campos de un servicio, no una tabla nueva, para que el devengado, el estimado y el costo por prenda sigan UNA sola cuenta; vale con el paso ya hecho porque la base no deja cambiar quién lo hizo.
- **Pendiente:** pegar la migración en producción (con el OK de Felipe) y decidir si el sueldo de quien habilita, si está en planilla, se costea aquí o por planilla (se cuenta dos veces si es por los dos).
