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

## Segunda ronda, misma tarde

- **Qué:** en `a-camino.html`: «Agregar categoría» también con aviso (nace como «no venía en el fardo», causa «no se pidió» puesta); «Reabrir el
  conteo» desde el fardo cerrado (nota con el cierre anterior, causa que se borra sola al cuadrar, «Cerrar de nuevo» con rastro); el caso
  sin aviso pulido (proveedor con buscador y «agregar proveedor», total del WhatsApp opcional, «dijeron» por categoría al contar). Cuatro
  categorías más en los datos para poder agregar una que no venía (Tops, Polos, Poleras, Chompas).
- **Por qué:** Felipe: llegan cosas de categorías no especificadas; cierran el conteo y aparecen las 2 que faltaban; el envío sin aviso pasa.
- **Cómo:** verificado con clics y JS en el navegador integrado: agregar Polos del proveedor Nórdica, reabrir y cuadrar los pantalones (la
  causa «No vino del proveedor» se borra sola), cerrar de nuevo a las 11:21 con el rastro; sin aviso: buscar «andina», elegir, 64 del
  WhatsApp, Blusas con «dijeron 40». Demos de los dos casos sin errores.
