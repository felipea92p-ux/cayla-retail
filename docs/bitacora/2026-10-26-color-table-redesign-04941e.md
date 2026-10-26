# 2026-10-26 · Existencias ▸ Ajustar stock: la «Planilla rápida» (ronda 2)

- **Qué:** la tabla de «Ajustar stock» del modal de la prenda se rehízo como la C · Planilla rápida que eligió Felipe (maqueta
  `docs/maquetas/existencias-ajustar-tabla-2026-10/`): la hoja no se desliza (`<Modal altoFijo>`), «Dónde» y «Qué pasó» en una banda fija
  arriba, la planilla con alto fijo y la franja del color, la columna del color opaca al deslizar, nada se apaga, Enter pasa a la siguiente,
  «Revisaste N de M» y un aviso que se nota con «Guardar y pasar» / «Descartar y pasar». Solo web; ADR-0494, actualización 2026-10-26.
- **Cómo se verificó:** ERP local a 1280, 1024 (oscuro) y 375 px; tipos, lint, knip y las 645 pruebas de la web en verde; la huella de la guía
  `inventario` aceptada tras poner al día su texto.
- **/chaos (semilla 1026) y /formidable, el mismo día:** 17 ataques en un navegador sin pantalla, 0 estados imposibles; doble clic,
  recargar, red cortada y «Guardar y pasar» escriben una vez. Abierto (g3, de esta rama): llegar con la hoja bajada deja la planilla
  aplastada y corrida (`PaginaEstable` reserva el alto en la hoja de alto fijo). Formidable: leyes 6,8 (ley 9: 4), oficio 6; ciega en 4
  toques con 14 dudas (`docs/formidable/inventario-existencias-ajustar-stock.md`).
- **Con el OK de Felipe:** cerrada la hoja corrida (`soltarPaginaEstable()` al entrar a la planilla, `overflow: clip` en `<Modal altoFijo>`,
  prueba `lib/ajuste-modelo-hoja-fija.test.ts`) y hechos los 3 cambios de Formidable: «Dónde» sin conteos, sin el contador «Revisaste» (queda el
  ✓ por color) y un solo botón principal mientras el aviso de lugar pregunta. H1 repetido con la semilla 1026: resiste. Pendiente: repetir la
  ciega y la lista aparte (Tab por lo plegado, «Confirmar» en el aviso de red, 44 px con el dedo, la caja que borra lo que no es dígito).
