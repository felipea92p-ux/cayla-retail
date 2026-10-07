## 🧩 Unificar, ronda 4: los botones (2026-10-07, ADR-0358) — solo web, sin migración; rama `claude/unificar-boton`

- [x] Censo de botones con escenarios; motor corregido (la luz del `::after`, el atajo `animation` con `var()`, lo medido que se cortaba).
- [x] Felipe eligió mirando y tocando: dos voces (con onda al clic), peligro en rojo, cerrar con la ×.
- [x] Piezas: voz por lugar (`data-voz="cabecera"`), `<Boton>` sobre `btn-cayla` (+ peso `peligro`), movimiento para todo `btn-cayla`, `<OndaBotones>`.
- [x] Migrados: 41 versalitas a mano (26 archivos), 15 botones peligrosos (12 archivos), 17 hojas a la ×; `ModalRuta` con la × por defecto.
- [x] Registro (`docs/unificar/boton.md`), firmas y deuda de `boton`, `accion.eliminar` y `accion.cerrar`; `CLAUDE.md` y ADR-0358.
- [x] **El mostrador** (14 archivos de Vender, Apartados y el «Buscar» de Cambios/Devoluciones): voz, movimiento y onda sin perder los altos del dedo; probado a 1440 y 375 px. Deuda de `boton`: 0.
- [x] Modo oscuro (`tema:auditar`, 2026-10-07): 107 vistas de los módulos migrados con sus hojas (Admin, 1440) + 16 del mostrador a 375 px (terminal-ventas) + Apartados (Admin, 375): **0 hallazgos solo en oscuro**. Capturas miradas a mano.
- [ ] Heredados del claro que vio la auditoría (no los causó esta ronda): el «Pagar» sutil de una fila marcada en Por pagar (1,8:1) y el conteo gris de las píldoras de Clientes (2,5:1); y 24 textos de filas atenuadas.
