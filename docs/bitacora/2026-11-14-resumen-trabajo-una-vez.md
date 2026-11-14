## 2026-11-14 · Finanzas ▸ Resumen: bajar el trabajo total (ADR-0661, actualización)

- **Hecho:** el estado de resultados del mes se arma una vez por carga (el presupuesto y el balance lo reciben ya armado, `20261114005000`) y «Movimientos» lee sus seis días de una vez (`20261114010000`); ninguna regla cambia (md5 en 170 casos, la página igual a #1843).
- **Medido en la copia de un año:** mes+presupuesto+balance 1.068 → 607 ms, Movimientos 2.630 → 1.476 ms; en la página, «Hoy te toca» de ~5,1 a ~3,1 s y todo de ~5,4 a ~4,4 s.
- **Sigue:** pegar las dos migraciones con el OK de Felipe, medir 24 h y decidir con esa cifra la foto del diario por día (cambia ADR-0633).
