## 🔎 Auditoría de Mis compras y Recibir (2026-11-12) — rama `claude/audit-compras-recibir-mercaderia-e343e1`

Informe con capturas: https://claude.ai/artifact/Gr61aHqN8dNmtPgkk7PLbW

- [x] Los 23 hallazgos de pantalla (12 de Mis compras, 11 de Recibir), con el OK de Felipe. Solo web, sin migración.
- [ ] **Dynamic:** `app/estilos/vidrio/hoja.css` (la tarjeta elegida dentro de una hoja se hunde con filo de tinta) y `app/estilos/vidrio/recibir-mesa.css` (celda enfocada en tinta, `.rc-cuenta-plegada`) quedan como tarea allá; no viajan solos.
- [ ] `lib/inicio-avisos.ts:519`: el aviso «Envíos a medias» de Inicio todavía no nombra la sede (Recibir ya lo hace).
- [ ] `/chaos` y la prueba ciega de `/formidable` sobre las dos pantallas: sin correr. La base compartida sigue atrasada (19-oct); esta auditoría usó una base desechable propia.

### Decisiones de Felipe (plata, stock o base) — sin hacer a propósito

- [x] **A · Reabrir un envío de Mis compras** — resuelto el 2026-11-13 (Felipe: se deshace solo mientras va «En camino», lo anula quien compró en Mis envíos; recibido, ya no). ADR-0574 act. 2026-11-13, rama `claude/mis-compras-anular-envio-en-camino`.
- [x] **B · «¿Con qué pagaste?» viene con Yape elegido** — resuelto el 2026-11-13 (Felipe: «sin elegir»; la guía lo pide y no se guarda hasta tocar uno). Rama `claude/mis-compras-medio-sin-elegir`.
- [ ] **C · La billetera de la ronda.** «Te dieron» suma lo anotado y no lo confirmado (S/ 500 anotado, S/ 480 confirmado → «te debían S/ 20»), y la plata anotada entre dos rondas sale en la lista pero no en «Te dieron». Lleva migración.
- [ ] **D · Dos guardados del mismo conteo en vuelo** (`RecibirContando.tsx:224-266`): con mala señal puede salir «X había puesto 5» con tu propio nombre, o el número volver atrás; y salir antes de 0,7 s pierde el último número.
- [ ] **E · `/recibir?vista=recibidas`** mezcla la sede de la cabecera con todas las sedes para un líder (cifras y lista sin filtro de sede). Lleva migración o un rótulo «todas las sedes».
- [ ] **F ·** Lo que sigue abierto de la auditoría del 27-oct (`docs/backlog/2026-10-27-auditoria-mis-compras.md`).
