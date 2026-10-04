## 🧾 Existencias: la cara que dice la verdad (2026-10-04, ADR-0331) — solo web, sin migración; rama `claude/kind-lederberg-a5bb65`

- [x] Umbral de reponer 4 → 0 (mínimo de 1 colgada por talla y color). Verificado: «Hoy ▸ Por reponer» = 0 productos en local.
- [x] «Para hoy» reemplaza «Prioridades de hoy»; lee la cola `prendas_por_regularizar` y dice «no se pudo leer» si falla; ≤ 2 rojos.
  Verificado: 27 en «Para hoy» = 27 tallas en el filtro.
- [x] Cabecera con `ResumenSede` (colgadas · guardadas) y un solo botón oscuro; la lectura de 7 días solo en el Taller.
- [x] Rojo como señal (`TONO_HOY` sin rojo) y `estadoTalla` sale de `hoyDeTalla`, con prueba de propiedad. Medido: 0 rojos en reposo.
- [x] Tarjeta con el riel de tallas, un solo botón y menú «⋯». Verificado con clics reales.
- [x] Filtros cerrados de fábrica en Existencias. Verificado a 1366 × 768.
- [x] Celular: «Para hoy» plegado, accesos que se desvanecen, placeholder que cabe. Verificado a 375 × 812.
- [x] Guía de foco: «/inventario» pasa a «no aplica» (`PENDIENTES_HOY` 69 → 68). `requierenReposicion` sin uso, borrado.
- [x] Revisión adversarial (3 lentes + escéptico): 13 hallazgos confirmados, corregidos (ADR-0331 «Revisión adversarial»). Verificado en local.
- [ ] **Sin probar con datos reales:** todo se vio con la base local (semilla). En TRU real, «Para hoy» va a decir ~391 por colgar hasta el cuadre del piso.
- [ ] Fecha de cuadre por sede y «puerta de confianza» de «Para hoy» (ADR-0328 decisiones 4 y 5): de la otra sesión del rediseño; se engancha en `tareasParaHoy`.
- [ ] «155 de 600» (colgadas de las que caben): espera la capacidad por sede en la base (ADR-0329).
- [ ] La edad del piso dentro de Existencias: aprobada por Felipe para DESPUÉS del cuadre (tarea #10 del análisis).
- [ ] El Inicio de la cuenta Almacén cuenta «modelos que piden piso» con otra regla que «Para hoy» (incluye los que no tienen nada atrás): tarea aparte propuesta.
- [ ] Un candado de rojo que mire las tarjetas (hoy solo la prueba de `TONO_HOY`); un solo verbo para bajar («Bajar al piso» / «Reponer prenda»); «Eliminar el producto» en el cajón (D4 del 3-oct, abierta).
- [ ] Pruebas que faltan: `ordenarModelos` y `agruparPorModelo` viven en el componente (pasarlas a `lib/`), `resumirExistencias`.
