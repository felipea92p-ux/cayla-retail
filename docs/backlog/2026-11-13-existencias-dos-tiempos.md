## ⚡ Existencias en dos tiempos y la medición por tramos (2026-11-13, ADR-0662) — solo web, sin migración; rama `claude/existencias-dos-tiempos`

- [x] La línea `existencias_tramos` por carga (`lib/medir-tramos.ts`, con prueba; sin datos personales, ADR-0424), escrita con `after()`.
- [x] La página no espera al plan: la promesa recortada (`planDelPanel`) viaja al panel; `usePlanDelPiso` la espera sin suspender y `aplicarPlan` la junta con el stock (con prueba: calculando, listo, fallo, refresco con tallas cambiadas).
- [x] «Calculando» (no «N/D») en «Hoy», los atajos, el anillo (sin guardar la foto del día), «Para hoy», el conteo y la lista con `?hoy=`; el aviso del cuadre desde el principio.
- [x] El orden de la lista del día no se mueve bajo el dedo la primera vez (`listaQueOrdena`, con prueba).
- [x] «Ver el valor a costo» arranca con las demás lecturas (era el último tramo, en fila).
- [x] Verificado en local con Playwright (1440 claro/oscuro, 375): CLS 0 al llegar el plan, «N/D» con el plan caído, lo escrito sigue, sin loader. `/milimetro`: 0 graves.
- [ ] **Leer 24 h de `existencias_tramos` en producción** (`vercel logs … --query existencias_tramos --json` + `jq`) y decidir el siguiente paso con esos números: en local la lectura más lenta fue `danadas` (`getPrendasDanadasPendientes`), no el plan.
- [ ] `persona` y `ubicaciones` van en fila antes de todo: `getUbicaciones()` podría arrancar a la vez que la identidad (cuidando el rechazo suelto si la identidad redirige).
- [ ] Si el ritmo reciente resulta estar en el camino largo, abrirle otra mitad como al plan (ya espera a las prendas).
- [ ] Las bandas «calculando» se ven hasta que el panel se hidrata, también si el plan llegó antes (ver «Alternativas» del ADR-0662).
- [ ] **Sin probar:** un refresco que cambie stock de verdad (colgar o vender) en el navegador; lo cubre la prueba de `aplicarPlan`, no se escribió en la base local compartida. Tampoco 375 px con `?hoy=` ni la tabla por talla en el celular.
- [ ] Cuando el informe `docs/innovacion/2026-11-13-cambiar-de-modulo.md` llegue a `main`, anotar en su fila lo que hizo este PR.
