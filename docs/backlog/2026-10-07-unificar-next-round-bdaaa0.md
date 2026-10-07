## 🧩 Unificar, ronda 5: vacíos, avisos y buscadores (2026-10-07/08, ADR-0358) — solo web, sin migración; rama `claude/unificar-next-round-bdaaa0`

- [x] Censo nuevo (`vacio,aviso,buscador`) con Admin (242 vistas) y `terminal-ventas`; depurado contra el código.
- [x] Propuestas en `docs/unificar/propuestas/{vacio,aviso,buscador}.html`; lámina rehecha con ellas.
- [x] Página de elegir con demos vivas, fotos reales antes/después (claro, oscuro, 375 px) y «Ver en oscuro»; `elegir.mjs` con `estilos`, `guion`, `fotosAlFinal` y el arreglo de `.op > input`.
- [ ] Felipe elige (8 preguntas) mirando y tocando.
- [ ] Registrar las tres decisiones, construir `<Vacio>`, `<Aviso>` y `<Buscador>` en `components/ui/` con su movimiento, firmas y deuda en `familias.mjs`.
- [ ] Migrar módulo por módulo (con su OK). Si elige la P1 de «cuando buscas y no aparece», confirmar pantalla por pantalla: suma acciones que hoy solo están arriba.
