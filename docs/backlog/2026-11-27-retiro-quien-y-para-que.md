# Un retiro dice quién y para qué (2026-11-27, ADR-0713)

- [ ] **POR PEGAR** `20261127150000_retiro_dice_quien_y_para_que.sql` en producción, ANTES de publicar la web (con la web nueva y la base vieja, el gráfico cuenta como antes; con la base nueva y la web vieja, un retiro se rechaza con «Di quién se lleva la plata.» hasta publicar).
- [ ] Después de pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar` (columna `se_la_lleva_persona_id`, `fn_quien_se_la_lleva`, `fn_quien_se_la_llevo`).
- [ ] Decide Felipe: el retiro de S/ 1,312.10 del 14-oct (caja fuerte AQP) era un ajuste del cuadre, no plata del dueño; anularlo y anotarlo como lo que fue corrige «Queda en CAYLA» (+S/ 1,312.10).
- [ ] Quién PUSO la plata (aportes y préstamos) y «CAYLA te debe» por persona: fuera de este cambio (ADR-0713, «Lo que queda fuera»).
