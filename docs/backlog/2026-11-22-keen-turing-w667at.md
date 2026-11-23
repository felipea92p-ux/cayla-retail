# Barrido del piso (ADR-0690) — lo que falta

- [ ] **POR PEGAR (2026-11-23): `20261122195000_barrido_piso_por_resolver.sql`** — enciende la actividad 8, «Por resolver». Su web se publica
      dormida (sin la función, la sección no se dibuja). Se pega sola, a cualquier hora, cuando Felipe lo diga (él pidió dejar 8 a 10 para después).
- [ ] **Actividad 9, historial de barridos.** Lista y detalle: quién contó, lecturas por persona con su hora, lo quitado tachado, las fotos y
      lo que se movió.
- [ ] **Actividad 10, cierre.** `/chaos` con 5 personas a la vez, `/formidable` y el área de 44 px con el dedo (`tacto:medir`). `/milimetro` ya se
      corrió el 2026-11-23 (0 graves, 0 medias: `docs/milimetro/auditorias/2026-11-23-barrido-del-piso.md`).
- [ ] **Decisión de Felipe:** en Tienda LIM, una prenda cuya fila mezcla unidades de CAYLA y de CLAURE no se mueve al confirmar
      (`dos_duenos`). ¿Se reparte por una regla fija (primero la casa) o se sigue moviendo a mano en Existencias? Al 2026-11-23 no hay
      ninguna fila así en producción.
- [ ] **Decisión de Felipe:** ¿un barrido mensual debe cortar la medida de Frescura como cualquier cuadre? Hoy sí.
- [ ] Una no cargada cuya talla se fusionó con otra (la juntada queda inactiva) solo se puede resolver como «No era de aquí».
- [ ] Las reservas de número (`pnpm reservar`) fallaron con 403 desde esta sesión: ADR-0690 y las migraciones `20261122190000`–`195000` se
      eligieron por encima de toda reserva existente, sin etiqueta.
