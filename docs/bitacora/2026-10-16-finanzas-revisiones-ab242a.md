## 2026-10-16 (las cuatro revisiones obligatorias sobre las seis pantallas de Finanzas en camino A, PR #1127)
Qué hice: corrí `guias:recorrer`, `tema:auditar`, `/chaos` y `/formidable` sobre Resumen, Cuentas y dinero, Impuestos, Gastos, Reportes y Cierre, contra
una pila propia al día con `main` y las tres migraciones del PR, con el Chrome del sistema (el panel del navegador estuvo oculto). Las seis guías pasan
en escritorio y a 375 px en oscuro (89 pasos, sin escrituras); el tema da 0 hallazgos solo en oscuro; `/chaos` sobre «Registrar movimiento» con pago de
planilla y pago a SUNAT: 22 ataques, 0 estados imposibles, dos de gravedad 2 arreglados en la web con su prueba (una fecha de 1900 se guardaba; el pago
no aparecía en la lista de una tienda); `/formidable`: seis informes con prueba ciega y 18 cambios propuestos que esperan el OK de Felipe. De paso, un
rojo general: con Next 16.4 ninguna guía arrancaba con `?demo=1` en desarrollo (Strict Mode tomaba el arranque por repetido); arreglado en el motor.
Por qué así: cada revisión se corrió sobre el código de la rama fusionado con `main` del día (no sobre el PR solo) porque así se fusionará; los arreglos
son de UNA pantalla por commit y solo donde hubo gravedad 1–2 o un rojo real; lo que es regla de dinero o RPC (el piso de fecha en la base, la vista de
la empresa en `fn_movimientos_dinero`, la coma decimal) quedó escrito para Felipe, no tocado.
Felipe se lleva: nada que pegar (solo web). Verificado: vitest de las reglas (36), eslint, el hook del commit en verde, y cada arreglo repetido en el
navegador con la misma semilla. NO verificado: colaboradora real en las pruebas ciegas; el estado «faltan cosas» del Cierre (el seed no lo tiene); la
hoja a 375 px con dedo real. Detalle: `docs/formidable/finanzas-*.md`, `docs/chaos/README.md`, `docs/backlog/2026-10-16-finanzas-revisiones-ab242a.md`.
