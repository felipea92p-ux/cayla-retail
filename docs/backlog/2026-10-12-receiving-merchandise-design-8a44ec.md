## 2026-10-12 · Recibir mercadería: el fardo (maqueta, sin construir)

Estado: **maqueta entregada, espera que Felipe elija (A, B o C) y conteste las 6 decisiones del README** · Rama
`claude/receiving-merchandise-design-8a44ec` · `docs/maquetas/recibir-fardo-2026-10/`.

- [x] Modelo común del proceso (contar, separar en conocidas/nuevas, causas de ADR-0362, quién recibe) y las tres caras A/B/C.
- [x] Con aviso de Compras y sin aviso (WhatsApp); claro y oscuro; escritorio y 375 px; demo automática; capturas.
- [x] README: contrato, lo que necesita de la base, recomendación (A con dos préstamos de B y C), decisiones de Felipe.
- [ ] Felipe elige la cara (mirando, no por descripción) y responde: quién crea lo nuevo; si se cierra con prendas sin separar; precio de la
      línea a la vista; dañadas a cuarentena; «dijeron» por WhatsApp.
- [ ] Reservar ADR (`pnpm reservar adr`) y diseñar `prendas_por_crear` + `abrir_fardo`/`recibir_fardo` con la sesión de Órdenes de compra
      (fase 3 de ADR-0362, hoy sin dueño); «Nuevo producto» con `?por_crear=`.
- [ ] Construir con `/construir` sobre `LlegoMercaderia` (la puerta de ADR-0330 se conserva como rama «sin aviso»), `/guia`, `/focus`,
      `/sugerir`, `/unificar`, `tema:auditar`, `/chaos` (guarda stock), `/formidable`.
