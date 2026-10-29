# Backlog · Tienda web ▸ Tráfico: del Observatorio al ERP (rama web-store-traffic-dashboard-e8b9e2)

Hecho: maqueta aprobada en lo grueso (`docs/maquetas/trafico-decisiones-2026-10/index.html`). Pendiente, en este orden:
- Felipe confirma la maqueta (o pide más cambios) y decide qué filtros nuevos entran primero (Hoy y Este mes).
- Plan por actividades (`/construir`): ampliar `resumen_trafico_web` (períodos, series, hora × día, quienes vuelven) y `fn_trafico_web_prendas`; el cruce de talla elegida con stock por talla es una lectura nueva.
- Decisión abierta: colores de los caminos (la maqueta reutiliza los de método de pago).
- Decisión abierta: el mapa de Perú de la maqueta es esquemático; la versión final necesita un contorno real.
- Revisar a 375 px la maqueta final y correr `/formidable` cuando se construya.

## Estado de la construcción (actividades aprobadas el 2026-10-28)
- [x] 1 · Períodos y comparación. **Pegar en producción `20261029015000_trafico_web_periodos.sql` (con OK de Felipe) ANTES de publicar la web:** la pantalla
  nueva llama a `resumen_trafico_web` con 7 parámetros y la base de producción solo tiene la de 4.
- [x] 2 · Cifras que eligen el gráfico (`20261029040000_trafico_web_serie.sql`, se pega DESPUÉS de `20261029015000`) · [ ] 3 · 100 puntos · [ ] 4 · Mapa de calor · [ ] 5 · De dónde vienen · [ ] 6 · Prendas en tabla
- [ ] 7 · Tallas por categoría y Quién entra · [ ] 8 · Necesita tu atención · [ ] 9 · Calendario · [ ] 10 · Cierre
- Decisión tomada al construir: el control de período usa `SegmentoEnlaces` (la pieza de «modo», pensada para 2–3 opciones) porque Felipe pidió que se vea
  como la maqueta; ADR-0358 dice «período = `pildora-cayla`». Confirmarlo con Felipe en `/unificar` si molesta.
