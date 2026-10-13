# 2026-10-13 · Recibir mercadería: Felipe eligió A y la cara se rehízo con el proceso real

- **Qué:** `docs/maquetas/recibir-fardo-2026-10/a-camino.html`, versión 2: sin pistola (nada llega etiquetado), tres paradas —¿Qué
  llegó? → Contar → Cerrar—, contar por categoría como lo único obligatorio, separar por NOMBRE opcional (con tallas y colores ahora o
  después), lo nuevo como cantidad, y al cerrar «Para después · N pendientes» con «Hacer ahora» y el aviso en la cabecera. Al stock entra
  lo que ya tiene tallas y colores; el resto entra al resolver su pendiente. README con la actualización y el contrato nuevo
  (`fardo_pendientes` con tres tipos, `recepcion_conteos`). B y C quedan como referencia del 12-oct.
- **Por qué:** Felipe: «me gusta la A»; las colaboradoras cuentan por categoría, buscan por nombre lo conocido y lo esencial es contar
  el fardo primero; lo demás se deja como pendiente con aviso.
- **Cómo:** solo la maqueta (sin código del ERP ni migración); verificada en el navegador integrado con clics reales y capturas sin ventana.
  Trampa: con `python3 -m http.server` Chrome reusó `_datos.js` viejo (los HTML ahora versionan sus archivos, `?v=2`); y la rueda del
  mouse sobre un `<input type="number">` con foco bajaba el conteo (se le quita el foco antes).
