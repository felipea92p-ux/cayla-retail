## 🧾 Caja registra el gasto de hoy sin el módulo Gastos (2026-10-23, ADR-0491) — web + migración (ya en producción); rama `claude/caja-gastos-sin-finanzas-105a5b`

- [x] Base: `fn_gastos_desde_caja_puede`, `fn_puede_registrar_gasto` (la regla entera; `gasto_fuera_de_caja`, `caja_cerrada`),
      reemplazo anclado en `registrar_gasto`, `fn_gastos_de_caja` (lectura de Caja) y el «incluye» del módulo Caja. Idempotente, sin políticas.
- [x] Web: el botón con `registrarGastos || gestionarCaja`; formulario completo y «Ver en Finanzas» solo con Gastos; sin él, la hoja dice a quién
      pedírselo. `getGastosDeCaja` con respaldo a `fn_gastos_lista` mientras la función no exista (PGRST202).
- [x] `pnpm pruebas:gastos` 93/93, con los casos 11 y 11b (16 nuevos). Para eso se aplicó en la base local la migración de las categorías
      Luz/Agua/Software (20261022205000), que ya estaba en main y le faltaba.
- [x] En el navegador local, con la terminal de ventas de Lima (Caja sin Gastos): registra «Movilidad · S/ 5» del cajón, el cajón lo descuenta,
      la fila dice «Gasto · Movilidad» y la ★ lo marca al reabrir. Base restaurada a su foto después.
- [x] **En producción desde el 2026-10-23** (OK de Felipe): ancla verificada antes, pegada con `apply_migration` (registrada como
      `20261023213359`), las tres funciones nuevas con el mismo md5 que en local y el «incluye» de Caja al día.
- [ ] Refrescar el volcado y el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`, después `pnpm datos:generar:produccion`).
- [ ] Sin probar en producción con una cuenta real de tienda (Caja sin Gastos) después del pegado.
