## 2026-11-03 — Recibir ▸ Contar sin fila «Total» (ADR-0604, act. 2026-11-03)

Qué hice: Felipe respondió 20 preguntas y Contar pasó a contarse por modelo: «+» junto al check de cada categoría, tacho, «Blusa 1» que no deja cerrar, marca por modelo, cuadre por categoría con guía, y al cerrar se descarta lo que quedó en 0 y las diferencias van por modelo si Compras lo anotó. Migración `20261103182000`.
Por qué así: «Total de Blusas» parecía un modelo más. El modelo en 0 se guarda en `separado` (jsonb), sin tabla nueva, y la migración solo acepta más cosas: la web de hoy sigue funcionando y se pega antes de publicar.
Verificado: cerré de verdad un envío sin aviso y uno con guía en la base local y miré la base; `pruebas:envio-sin-aviso` 16/16, `pruebas:conteo-de-envio` 16/16; guía interactiva en escritorio y a 375 px; modo oscuro; `/chaos` semilla 20261103. Sin prueba ciega: `/formidable` corrió en `rapido`.

Después de publicar: en el cruce con #1616 mandó #1617 (Felipe). Se sumó quitar una categoría con el tacho, y se corrigió «Deshacer», que no devolvía el único modelo de una línea en 0: la línea ya oculta se comparaba contra su foto vieja y no se guardaba nada.
