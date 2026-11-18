## 🧵 Producción: cinco pasos y ojales y botones del modelo (2026-10-28) — rama `claude/produccion-cinco-pasos-adr-0551` (ADR-0551, actividad 1)

- [x] **Hecho y probado en local:** pasos fijos de 7 a 5 (`20261028052000`), «lleva ojales y botones» del modelo (`20261028053000`) y Nueva orden con los cinco pasos.
- [ ] **Felipe: pegar las dos migraciones en producción** (una parte cada una, en ese orden) y **recién después** publicar la web. Si la web sale antes, nadie puede abrir una orden (`fases_espina`).
- [ ] Después de pegar: refrescar el diccionario (`pnpm datos:generar:produccion`) y asignar `producto_taller` en `scripts/datos/aviario.mjs` (Producción).
- [ ] `pnpm --filter web tema:auditar` sobre `/produccion/ordenes` (escenario de Nueva orden con Ojales y botones prendido) y un `/chaos` acotado: doble clic en «Abrir orden» y un servicio sin proveedor.
- [ ] Las demás actividades del ADR-0551 (orden «de antes», cierre «ya estaba en stock», pago desde BCP Operativa, registrar Blusa y Chaleco) siguen en `docs/backlog/2026-10-27-production-order-cleanup-tagging-567ea8.md`.
- [x] **`20261028064000` lleva a `main` la regla de producción «una fecha prometida pasada vale» (ADR-0537)**, confirmada vigente por Felipe el 2026-10-28; en producción no hace nada (ya está). Deja la huella de la función igual a la de producción.
- [ ] **La hoja de Nueva orden todavía pide una fecha de hoy en adelante** (`fase_fecha_pasada` en `orden-fases-reglas.ts`) aunque la base ya acepta una pasada. Falta decidir si la hoja también la acepta (orden «de antes»). El ADR-0537 quedó en el PR #1422 cerrado: conviene volver a escribirlo en `main`.
