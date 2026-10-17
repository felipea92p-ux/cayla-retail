## 💰 Registrar movimiento: piso de fecha y lo de la empresa en toda vista (2026-10-17) — rama `claude/trusting-leavitt-edb968`

- [x] **Migración `20261017143000`** (ADR-0417 act. 2026-10-17): `registrar_movimiento_dinero` rechaza una fecha anterior a `inicio_finanzas`
      (`movimiento_antes_del_inicio`, el mismo mensaje que `gasto_antes_del_inicio`); `fn_movimientos_dinero` le muestra al líder lo de la
      empresa (`ubicacion_id` nulo) desde cualquier tienda. Reemplazos anclados, idempotente, probada en una pila al día con `main`.
- [x] **Prueba `pnpm pruebas:movimientos-dinero-inicio-y-empresa`** en las tandas del CI: 1900 y el día anterior rechazados, el día del inicio
      entra, sin inicio no frena, el cajón por egreso sigue; Trujillo, Lima y todas para el líder; la colaboradora con el módulo; pegar dos
      veces y las anclas vecinas.
- [ ] **De Felipe: pegar `20261017143000` en producción** (una sola parte, sin políticas). Antes, decidir la variante: lo de la empresa en toda
      tienda (lo construido) o solo en «Todas las tiendas».
- [ ] **Traer a `main` la web de la rama `claude/finanzas-revisiones-ab242a`** (commit `9b4575544`: el campo de fecha con `min`, el aviso y el
      salto a `?ver=todas`; y `9fd4d991a`, la demo con `?demo=1` en desarrollo). Con la base nueva el salto a «Todas» sobra para el líder: el
      pago ya aparece en la tienda que miraba; el aviso puede decir solo «registrado». Al traerla, tachar en su backlog
      (`docs/backlog/2026-10-16-finanzas-revisiones-ab242a.md`) los dos puntos «De Felipe (RPC)».
- [ ] **Un egreso del cajón anterior al inicio de Finanzas** que la tienda deposita después entra con la fecha de la caja, fuera de los reportes:
      la misma pregunta abierta que la factura de septiembre (ADR-0412, «Lo que queda»).
- [ ] **Refrescar el diccionario de datos** (`pnpm datos:generar:produccion`) cuando la migración esté en producción (cambia el cuerpo y el
      comentario de `fn_movimientos_dinero`).
