## 2026-10-15 (/unificar: ronda 15 — los íconos, el globito con número, «Ver más», «Deshacer» y «Buscar», decididos y migrados)
Qué hice: medí los íconos en el código (922 en 320 archivos, 25 tamaños, 15 grosores) y en 95 pantallas con un medidor rápido (el censo
completo se cortó cuando se cayó el servidor), y armé una página con cinco preguntas: fotos de siete pantallas reales con cada propuesta
aplicada en vivo (solo el dibujo), los íconos aumentados tres veces y demos vivas del globito, «Ver más» (abre de verdad), «Deshacer» y
«Buscar». Felipe eligió las cinco P1. Escribí `<Globito>`, `<BotonVerMas>` + `<FilasDeMas>`, `<BotonDeshacer>` y `<BotonBuscar>`, pasé
`Insignia` a un `<Globito pide>` y migré 89 archivos de íconos (con un migrador que decide el tamaño por el contenedor de cada uno), 9
globitos, 4 «Ver más», 7 «Deshacer» y 5 «Buscar». Deuda 0, con firmas probadas contra el código de antes (89 · 7 · 4 · 5 · 5).
Por qué así: «una función, una pieza» (ADR-0358). El grosor de fábrica y una escala de cuatro tamaños es lo que ya usaba la mayoría:
ordena sin mover nada a la vista. La marca sobre un punto lleno (trazo 3, como la casilla) y el ícono grande (1,5, como el de un vacío) son
dos reglas que salieron de mirar cada caso, cada una con su `unificar-fijo`. Migrar no cambió qué hace ningún botón.
Felipe se lleva: un solo grosor y una sola escala de íconos, un solo globito con número (nunca rojo para contar), un solo «Ver más» que
despliega en su lugar, y «Deshacer» y «Buscar» con su ícono. Queda para él: si el marco (lateral y cabecera, trazo 1,5) pasa también a 2.
