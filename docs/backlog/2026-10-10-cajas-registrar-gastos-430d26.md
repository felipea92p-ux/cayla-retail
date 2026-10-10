## 💵 Caja ▸ Registrar ingreso (2026-10-10, ADR-0371) — web + migración; rama `claude/cajas-registrar-gastos-430d26`

- [x] «Registrar ingreso» reemplaza a «Depósito o retiro» (cabecera, «Hacer» y barra del celular); `IngresoRapidoModal` + `lib/ingreso-rapido-reglas.ts` con prueba que lee la migración.
- [x] Retiro y depósito a mitad del turno: enlace al pie de las hojas de gasto e ingreso → `MovimientoCajaModal soloSalida`.
- [x] Migración `20261010160000_caja_motivos_de_ingreso.sql` aplicada en local (idempotente, por ancla).
- [ ] **No está en producción:** aplicar `20261010160000` ANTES de publicar la web (sin ella, las cuatro baldosas nuevas fallan con «Motivo de ingreso desconocido»). Después, `pnpm datos:generar:produccion`.
- [ ] Finanzas: separar las entradas por motivo en `fn_flujo_lineas` (hoy todas son «otros ingresos»).
- [ ] Decidir (Felipe): ¿«Compra de insumos» sigue entre las salidas de «Retiro o depósito»? Es un gasto.
