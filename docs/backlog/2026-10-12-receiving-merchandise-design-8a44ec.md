## 2026-10-12 · Recibir mercadería: el fardo (maqueta, sin construir)

Estado: **Felipe eligió A (13-oct) y corrigió el proceso; la cara A se rehízo (versión 2). Esperan las decisiones abiertas del README y el «dale» para construir** · Rama
`claude/receiving-merchandise-design-8a44ec` · `docs/maquetas/recibir-fardo-2026-10/`.

- [x] Modelo común del proceso (contar, separar en conocidas/nuevas, causas de ADR-0362, quién recibe) y las tres caras A/B/C.
- [x] Con aviso de Compras y sin aviso (WhatsApp); claro y oscuro; escritorio y 375 px; demo automática; capturas.
- [x] README: contrato, lo que necesita de la base, recomendación (A con dos préstamos de B y C), decisiones de Felipe.
- [x] Felipe eligió A (13-oct): sin pistola, contar primero, separar por nombre opcional, pendientes con aviso. Hecho en `a-camino.html` v2.
- [x] Las 10 decisiones de Felipe (13-oct, tabla en el README): solo lo detallado entra al stock; se cuenta la guía; todo quien tenga Recibir;
      aviso en Inicio + Recibir + Catálogo; reabrir hasta que Compras resuelva; costo al cerrar (d.18); dañadas en Existencias; nueva = solo
      cantidad; varias personas con firma de quien cierra; reemplaza a «Llegó mercadería» y «sin aviso» sigue.
- [ ] Reservar ADR (`pnpm reservar adr`) y diseñar `fardo_pendientes` (separar · detalle · crear) + `recepcion_conteos` + `abrir_fardo`/`cerrar_fardo` con la sesión de Órdenes de compra
      (fase 3 de ADR-0362, hoy sin dueño); «Nuevo producto» con `?por_crear=`.
- [ ] Construir con `/construir` sobre `LlegoMercaderia` (la puerta de ADR-0330 se conserva como rama «sin aviso»), `/guia`, `/focus`,
      `/sugerir`, `/unificar`, `tema:auditar`, `/chaos` (guarda stock), `/formidable`.
