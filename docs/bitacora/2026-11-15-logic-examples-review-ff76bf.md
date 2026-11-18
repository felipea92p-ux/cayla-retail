# 2026-11-15 · Fijar precio con la cuenta única (ADR-0668)

- **Qué:** Felipe respondió 30 preguntas sobre costo, precio e IGV al recibir y aprobó la maqueta `docs/maquetas/precio-sugerido-2026-11/`. Se construyeron A1 (la cuenta en `lib/cuenta-de-precio.ts`) y A2: Recibir y Nuevo producto dicen «Te quedan S/ X» con una sola cuenta para todas las prendas, ámbar bajo el piso que aguanta 35 % de rebaja, y ya no suponen factura por el RUC.
- **Por qué:** el #1867 suponía factura por el RUC, que en producción falla en 64 % de los papeles (solo 26 % son factura); la misma prenda podía verse verde sin aguantar una rebaja.
- **Sigue:** A3 en adelante, según `docs/backlog/2026-11-15-logic-examples-review-ff76bf.md`; A11 (guardar el costo con IGV y corregir ×1.18) espera al contador, y falta decidir las prendas del Taller.
