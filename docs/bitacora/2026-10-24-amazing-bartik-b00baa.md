# 2026-10-24 · Historial de compras: una fila, tres pestañas (ADR-0504)

- Felipe aceptó la opción A: una fila de menú «Historial de compras» con tres pestañas (Historial, Revisar compras, Por pagar), los tres módulos de Roles y accesos intactos y cabecera con título único. Maqueta navegable: `docs/maquetas/compras-historial-unificado-2026-10/index.html`.
- Paso 1 hecho, sin cambio visual: `moduloAlterno` (uno) pasa a `modulosAlternos` (lista) en `lib/menu.ts`, con pruebas nuevas en `menu.test.ts`.
- Paso 2 hecho: una sola fila «Historial de compras» con tres pestañas (cabecera A, contadores, cada pestaña con su módulo, URLs iguales), guías y huellas al día. La cadena a crédito se recorrió en una base local y quedó como caso permanente de `compras_simple_revisar.mjs`. Rama sin subir.
- Hallazgo en producción (solo lectura): «Entregas y devoluciones» no lista el saldo inicial («ya tenía») que sí cuenta «Entregado»; queda para un PR aparte, con el OK de Felipe.
