## 💵 Caja ▸ Registrar ingreso (2026-10-10, ADR-0371) — web + migración; rama `claude/cajas-registrar-gastos-430d26`

- [x] «Registrar ingreso» reemplaza a «Depósito o retiro» (cabecera, «Hacer» y barra del celular); `IngresoRapidoModal` + `lib/ingreso-rapido-reglas.ts` con prueba que lee la migración.
- [x] Retiro y depósito a mitad del turno: enlace al pie de las hojas de gasto e ingreso → `MovimientoCajaModal soloSalida`.
- [x] Migración `20261010160000_caja_motivos_de_ingreso.sql` aplicada en local (idempotente, por ancla).
- [x] Cada ingreso baja la cuenta de donde sale (ADR-0371 act. b): `registrar_ingreso_caja` + `movimientos_dinero.caja_ingreso_id`; caja fuerte, efectivo por rendir, aporte del dueño y préstamo de otra sede con las dos puntas; flujo, balance y libro lo leen entre cuentas o como aporte. Prueba `pnpm pruebas:caja-ingresos` (31 casos, en el CI).
- [x] «Compra de insumos» ya no es salida (web y base).
- [x] Hueco viejo: los motivos de sistema se podían tipear sueltos (NULL en `current_setting`); corregido con `coalesce`.
- [x] En producción desde el 2026-10-10: `20261010160000` y `20261010170000` (MCP; versiones `20261010144148` y `20261010144250`), verificadas antes y después.
- [ ] Refrescar el volcado de producción y `pnpm datos:generar:produccion` (falta `caja_ingreso_id` y `registrar_ingreso_caja` en el diccionario).
- [ ] Decidir (Felipe): ¿se bloquea un ingreso que dejaría la caja fuerte o el efectivo por rendir en negativo? Hoy no se bloquea: el negativo avisa que falta un registro.
- [ ] «Vuelve de un retiro» sigue sin contraparte (otros ingresos / ingreso sin origen): unirlo al retiro que devuelve.
