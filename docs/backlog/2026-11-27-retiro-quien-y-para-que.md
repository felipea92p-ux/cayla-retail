# Un retiro dice quién y para qué (2026-11-27, ADR-0713)

- [ ] **POR PEGAR (2026-11-27), DESPUÉS de fusionar y de que Vercel publique** `20261127150000_retiro_dice_quien_y_para_que.sql`. Pegarla antes rompería la web de hoy: no manda quién se lleva la plata y todo retiro se rechazaría con «Di quién se lleva la plata.». La web nueva con la base vieja funciona (el encabezado se ignora y el gráfico cuenta como antes); solo los retiros de ese rato quedan sin quién.
- [ ] Después de pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar` (columna `se_la_lleva_persona_id`, `fn_quien_se_la_lleva`, `fn_quien_se_la_llevo`).
- [ ] Decide Felipe: el retiro de S/ 1,312.10 del 14-oct (caja fuerte AQP) era un ajuste del cuadre, no plata del dueño; anularlo y anotarlo como lo que fue corrige «Queda en CAYLA» (+S/ 1,312.10).
- [ ] Quién PUSO la plata (aportes y préstamos) y «CAYLA te debe» por persona: fuera de este cambio (ADR-0713, «Lo que queda fuera»).
