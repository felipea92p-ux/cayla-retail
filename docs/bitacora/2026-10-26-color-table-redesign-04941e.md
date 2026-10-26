# 2026-10-26 · Existencias ▸ Ajustar stock: la «Planilla rápida» (ronda 2)

- **Qué:** la tabla de «Ajustar stock» del modal de la prenda se rehízo como la C · Planilla rápida que eligió Felipe (maqueta
  `docs/maquetas/existencias-ajustar-tabla-2026-10/`): la hoja no se desliza (`<Modal altoFijo>`), «Dónde» y «Qué pasó» en una banda fija
  arriba, la planilla con alto fijo y la franja del color, la columna del color opaca al deslizar, nada se apaga, Enter pasa a la siguiente,
  «Revisaste N de M» y un aviso que se nota con «Guardar y pasar» / «Descartar y pasar». Solo web; ADR-0494, actualización 2026-10-26.
- **Cómo se verificó:** ERP local a 1280, 1024 (oscuro) y 375 px; tipos, lint, knip y las 645 pruebas de la web en verde; la huella de la guía
  `inventario` aceptada tras poner al día su texto.
- **Pendiente:** «Guardar y pasar» no se probó guardando de verdad en la base local (compartida); `/chaos` y `/formidable` de la pantalla
  nueva, sin correr.
