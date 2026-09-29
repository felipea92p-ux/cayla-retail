## 2026-09-29 — Veintiocho acciones sin el combo «Responsable» (ADR-0280)

**QUÉ HICE:** De los 149 lugares donde el ERP pide elegir responsable, 28 dejan de pedirlo (Felipe marcó 30; dos filas no eran lo que decían sus etiquetas y se conservan): 7 de tienda y Compras (apartar, aviso, traslado, cerrar conteo, regularizar, adjuntos) y 21 del Catálogo (alta de producto, aprobar y rechazar valores, campañas, fechas de temporada). Los otros 121 siguen igual. Hay un «volver» de un solo commit.

**POR QUÉ ASÍ:** Un solo punto en la base (`fn_actor_persona_id`) y una lista cerrada de 28 claves, en vez de reescribir decenas de funciones; con lista cerrada, una terminal no puede saltarse el combo en la caja ni en la venta mandando un encabezado inventado. En una terminal esas acciones quedan sin nombre de persona (decisión de Felipe); apartar sigue pidiéndolo en terminal porque `separaciones.creado_por` es NOT NULL.

**QUÉ SE ROMPERÍA SIN ESTO:** Sin la lista cerrada, cualquier terminal quedaría sin nombre en toda la operación; sin la prueba que compara la lista de la web con la de la base, una clave escrita distinta dejaría una pantalla sin combo y la base la rechazaría sin explicar por qué. **No está en producción:** falta probarlo en local y pegar `20260929230000_acciones_sin_responsable.sql`.
