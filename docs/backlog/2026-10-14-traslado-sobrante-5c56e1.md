## 📦 La prenda de más queda como sobrante a revisar (2026-10-14) — rama `claude/traslado-sobrante-5c56e1`, ADR-0404

- [ ] **Pegar en producción** `20261014175000` (tabla nueva) y después `20261014180000` (funciones), ANTES de fusionar la web. Antes,
  comprobar los md5 de `cerrar_traslado_con_diferencia` y `fn_perdidas_de_traslados` (ADR-0404). Después: el volcado de
  `docs/datos/generado/` y el pájaro de `traslado_sobrantes` en el aviario. **Espera el OK de Felipe.**
- [ ] Un conteo que encuentra la prenda de más antes de revisarla la puede hacer entrar dos veces si después se revisa como «salió del
  origen» (ADR-0404, «Se rompe si»). Si pasa en la tienda, avisar al revisar; hoy no hay ningún sobrante en producción.
