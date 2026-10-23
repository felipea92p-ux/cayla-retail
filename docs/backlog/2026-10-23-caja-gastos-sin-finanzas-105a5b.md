## 🧾 Caja registra el gasto de hoy sin el módulo Gastos (2026-10-23, ADR-0491) — web + migración; rama `claude/caja-gastos-sin-finanzas-105a5b`

- [x] Base: `fn_gastos_desde_caja_puede`, `fn_puede_registrar_gasto` (la regla entera; `gasto_fuera_de_caja`, `caja_cerrada`),
      reemplazo anclado en `registrar_gasto`, `fn_gastos_de_caja` (lectura de Caja) y el «incluye» del módulo Caja. Idempotente, sin políticas.
- [x] Web: el botón con `registrarGastos || gestionarCaja`; formulario completo y «Ver en Finanzas» solo con Gastos; sin él, la hoja dice a quién
      pedírselo. `getGastosDeCaja` con respaldo a `fn_gastos_lista` mientras la función no exista (PGRST202).
- [x] `pnpm pruebas:gastos` casos 11 y 11b (16 casos nuevos en verde). Las 19 que fallan en la base local son las categorías Luz/Agua/Software
      (20261022205000), que la base local no tiene: ajenas a este cambio, el CI aplica todas.
- [x] En el navegador local, con la terminal de ventas de Lima (Caja sin Gastos): registra «Movilidad · S/ 5» del cajón, el cajón lo descuenta,
      la fila dice «Gasto · Movilidad» y la ★ lo marca al reabrir. Base restaurada a su foto después.
- [ ] **No está en producción:** pegar `20261023212000_caja_registra_gastos_sin_finanzas.sql` (una sola parte) con el OK de Felipe, y después
      `pnpm datos:generar:produccion` para el diccionario.
- [ ] Sin probar en producción con una cuenta real de tienda (Caja sin Gastos) después del pegado.
