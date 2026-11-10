## 2026-11-09 (Compras → Existencias sin doble ni cero conteo, ADR-0636)
Qué hice: cuatro cortes en la rama `claude/compras-stock-cayla-c20350`. (1) Línea «Mercadería pagada» en el Balance (`20261109231000`).
(2) El aviso de cierre de mes dice cuánta plata queda fuera del libro (`20261109235000`). (3) La puerta «Recibir sin aviso» nombra las compras
pagadas que vienen a esa sede (`20261110004000`, solo lectura). (4) `20261110011000` escrita: tabla `compra_papel_llegadas` y
`unir_recepcion_con_compra(despacho, papel, token)`, que une una recepción «sin aviso» con su compra pagada.
Por qué así: «sin aviso» y «con compra» eran dos caminos que no se hablaban, y una misma mercadería podía entrar dos veces o no pasar nunca al libro.
Qué falta (honesto): la migración 4 está ESCRITA PERO NO PROBADA contra Postgres (Docker dejó de responder) y su revisión adversarial no terminó
(el límite semanal cortó a los cuatro revisores: devolvieron vacío). Nada de esta rama está en producción (consultado en solo lectura el 2026-11-09:
ninguna de las funciones ni la tabla existen). Falta además la prueba de base de la unión, la «lista para unir lo ya recibido» (paso 3) y la
pantalla que llama a la RPC.
Cómo verificas tú: levantar Docker, correr `node scripts/pruebas/compras_pagadas_hacia.mjs` y la prueba nueva de la unión; no pegar `20261110011000`
en producción hasta que la revisión y la prueba den verde (va en dos partes, ver su encabezado).
