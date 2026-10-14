## Compras ▸ fase 6 de las órdenes de compra: fondo por rendir y gastos del viaje (2026-10-13) — rama `claude/purchase-order-phase6-9b0c82`

ADR-0362 (decisiones 16, 20, 26, 29, 30, 32–35, 46, 54–57 y 65–73). Lista de 8 actividades aprobada por Felipe el 2026-10-13; el
2026-10-14 la de contabilidad se partió en dos y quedaron 9 (decisión 73). PR #1055
(borrador). Con la autorización de Felipe de esa noche, cada actividad se sube y sus migraciones se pegan en producción al cerrarla (no se
fusiona).

- [x] Actividad 1 · base del fondo y Compras ▸ Fondos por rendir (`20261013181000`, `20261013182000`). En producción.
- [x] Actividad 2 · pagar desde «Mi fondo» (`20261013212000`). En producción.
- [x] Actividad 3 · gastos del viaje (`20261013221000`, `20261013222000`). En producción.
- [x] Actividad 4 · «Tu fondo» en Órdenes de compra y en el Inicio (`20261013231000`). En producción.
- [x] Actividad 5 · rendición (`20261013233000`, `234000` —bucket y políticas, solas— y `235000`): rendir, aprobar (faltante asumido →
  6599 o deuda → 1419), devolver o retirar, lo rendido congelado y las fotos de los gastos del viaje. En producción.
- [ ] Felipe (actividad 5, provisional): un sobrante no se rinde; 1419 y 6599 hasta el contador; la dueña puede retirar su rendición; el
  tablero cuenta el faltante dentro de «Gastó». La deuda se ve pero todavía no se cobra (actividad 7).
- [x] Actividad 6 · lo «no deducible» (`20261014002000`, decisiones 55, 56, 57, 68 y 70): la regla de la bancarización y el tope de la
  planilla de movilidad (parámetro tributario con vigencias, en Configuración ▸ Impuestos; vacío hasta el contador), el aviso en todas
  las formas de pagar a un proveedor y la marca en la rendición, «Traerla costó» y los pagos de un comprobante. En producción.
- [ ] Felipe (actividad 6, provisional): en «Pagar juntos» el aviso dice «hasta S/ X» si no todos los comprobantes son grandes; la persona
  del tope es quien registró la planilla; un comprobante con nota de crédito se mira por su total original. El tope de la planilla lo
  tiene que fijar el contador (mientras no haya, nada se marca por la planilla).
- [x] Actividad 7 · saldar la deuda de un faltante (`20261014145000`, decisiones 54 y 71): «Registrar su pago» en Fondos por rendir (lo
  registra quien recibe la plata; la más vieja primero; se anula con su motivo) y la 1413 y la 1419 por dos caminos en «¿Cuadra?» del
  Balance. En producción. Nada de descontar del sueldo (71).
- [ ] Felipe (actividad 7, provisional): la deuda se paga a un banco, una caja fuerte o al líder (no a un cajón); una deuda no se perdona
  desde el sistema después de aprobada.
- [ ] Actividad 8 · el IGV: las facturas de los gastos del viaje a crédito fiscal y el IGV de lo no deducible fuera, en el mes del pago
  (72), igual en Impuestos, el Diario y el Balance.
- [ ] Actividad 9 · cierre: `tema:auditar`, `guias:recorrer`, `/chaos` con plata y `/formidable` (todavía no se corrieron).
- [ ] Tabla «Quién tiene plata» de Fondos por rendir: a 1024 px con el menú abierto se desborda (viene de antes; quedó como tarea aparte).
- [ ] Felipe: lo marcado *provisional* en el ADR (la acción `gasto_viaje_registrar` soltada del combo «Responsable»; cuándo se propone
  «Mi fondo»; de dónde sale y a dónde vuelve la plata de un fondo; «Tu fondo» no sale en el Observatorio del Admin).
- [ ] Felipe: **«Lo recibí»** (la compradora confirma en su tarjeta que recibió la plata; sin confirmar, al líder le aparece «sin
  confirmar»). Está en el mapa de módulos (`docs/compras/ordenes-de-compra-2026-10/mapa-de-modulos.md`, paso 2) pero no en la lista de 8
  actividades: no se construyó. Pediría guardar quién y cuándo confirmó cada entrega.
