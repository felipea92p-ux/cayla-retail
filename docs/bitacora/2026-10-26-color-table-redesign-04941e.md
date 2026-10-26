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
  toques con 14 dudas. Los arreglos y los 3 cambios esperan el OK de Felipe (`docs/formidable/inventario-existencias-ajustar-stock.md`).
