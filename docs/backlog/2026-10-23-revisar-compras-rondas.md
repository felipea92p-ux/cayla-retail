## Revisar compras: rondas abiertas y cuaderno (rama `claude/revisar-compras-rondas`, ADR-0480)

**POR PEGAR (2026-10-23), con el OK de Felipe:** `20261023210000_revisar_compras_rondas.sql`.
- Solo agrega lecturas y cambia el nombre y la descripción de dos módulos, así que pegarla antes de publicar la web no rompe nada.
- Sin ella, la web nueva no muestra «Rondas abiertas», el cuaderno ni la ronda de la plata (lo lee como vacío, sin caerse).

Pendiente:
- [ ] Las funciones de la base todavía dicen «necesita el módulo «Mi plata para compras»» en sus mensajes de permiso. Hay que pasarlas a «Mis compras» la próxima vez que se toquen.
- [ ] Un líder sin tienda asignada no muestra tienda en su ronda: está bien así, pero si Felipe quiere ver la sede de compra, hace falta otro dato.
