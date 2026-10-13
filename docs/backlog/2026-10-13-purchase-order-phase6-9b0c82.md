## Compras ▸ fase 6 de las órdenes de compra: fondo por rendir y gastos del viaje (2026-10-13) — rama `claude/purchase-order-phase6-9b0c82`

ADR-0362 (decisiones 16, 20, 26, 29, 30, 32–35, 46, 54–57 y 65–70). Lista de 8 actividades aprobada por Felipe el 2026-10-13. PR #1055
(borrador). Con la autorización de Felipe de esa noche, cada actividad se sube y sus migraciones se pegan en producción al cerrarla (no se
fusiona).

- [x] Actividad 1 · base del fondo y Compras ▸ Fondos por rendir (`20261013181000`, `20261013182000`). En producción.
- [x] Actividad 2 · pagar desde «Mi fondo» (`20261013212000`). En producción.
- [x] Actividad 3 · gastos del viaje (`20261013221000`, `20261013222000`). En producción.
- [x] Actividad 4 · «Tu fondo» en Órdenes de compra y en el Inicio (`20261013231000`).
- [ ] Actividad 5 · rendición (decisiones 54 y 69; fotos opcionales con aviso).
- [ ] Actividad 6 · efectivo de S/ 2 000 o más «no deducible» (decisiones 56 y 70) y el tope de la planilla cuando el contador lo fije (68).
- [ ] Actividad 7 · contabilidad (faltante como cuenta por cobrar a la persona; IGV de las facturas de gastos del viaje; la 1413 por dos caminos).
- [ ] Actividad 8 · cierre: `tema:auditar`, `guias:recorrer`, `/chaos` con plata y `/formidable` (todavía no se corrieron).
- [ ] Felipe: lo marcado *provisional* en el ADR (la acción `gasto_viaje_registrar` soltada del combo «Responsable»; cuándo se propone
  «Mi fondo»; de dónde sale y a dónde vuelve la plata de un fondo; «Tu fondo» no sale en el Observatorio del Admin).
- [ ] Felipe: **«Lo recibí»** (la compradora confirma en su tarjeta que recibió la plata; sin confirmar, al líder le aparece «sin
  confirmar»). Está en el mapa de módulos (`docs/compras/ordenes-de-compra-2026-10/mapa-de-modulos.md`, paso 2) pero no en la lista de 8
  actividades: no se construyó. Pediría guardar quién y cuándo confirmó cada entrega.
