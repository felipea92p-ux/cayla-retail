# Cuadrar con el banco: el saldo de hoy se corta al anotarlo (2026-11-13)

Sigue de ADR-0652.

## Pendiente

- [x] **Pegado en producción (2026-11-13, Felipe)** `supabase/migrations/20261113170000_cuadre_se_corta_al_anotar.sql` (una sola parte, idempotente, sin políticas). Vuelta:
      `pegar-en-produccion-vuelta-cuadre-se-corta-al-anotar-2026-11-13.sql`. Falta refrescar `docs/datos/generado/` con la columna `movido_del_dia`.
- [ ] **El cuadre de BCP Empresa del 13 nov:** lo ya anotado no tiene corte y sigue en «No cuadra». Se arregla anulando ese saldo y anotando el que el
      banco muestra ahora (S/ 1,200.00 si el retiro ya salió).
- [ ] Mirar la tarjeta en el navegador con un saldo anotado y un retiro posterior (claro y oscuro, 375 px) y pasar `/milimetro auditar` (el check «Al milímetro» del PR #1813 sigue rojo por esto).
