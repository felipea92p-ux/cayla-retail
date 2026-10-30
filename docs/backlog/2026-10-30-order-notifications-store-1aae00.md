## 🔔 Aviso de pedido web en el celular de la sede (2026-10-30, ADR-0582) — migración `20261030150000` SIN pegar en producción; rama `claude/order-notifications-store-1aae00`

- [x] Maqueta del aviso (`docs/maquetas/aviso-pedido-web-2026-10/`): Felipe eligió el texto A y el sonido Campanita.
- [x] ERP instalable (`app/manifest.ts`, íconos rojos, `proxy.ts` deja pasar el manifiesto sin sesión).
- [x] Cola, teléfonos por sede y disparador; `pnpm pruebas:pedidos-web-push` (11, ROLLBACK) en el CI.
- [x] Cron `/api/pedidos-web/avisar` cada minuto con `web-push`; probado en local (401, cola, 410 de FCM).
- [x] Hoja «Avisos de pedidos» + `sw.js` (aviso, insignia, vibración, botones) + guía al día; probada en local a 375 px y en oscuro.
- [ ] **Producción:** pegar `supabase/migrations/20261030150000_pedidos_web_push_aparatos.sql` (una sola parte, sin políticas).
- [ ] **Vercel (proyecto del ERP, Production):** `ERP_VAPID_PUBLIC_KEY`, `ERP_VAPID_PRIVATE_KEY`, `ERP_VAPID_ASUNTO` (`npx web-push generate-vapid-keys`).
- [ ] **Sin probar:** un aviso real en el Android (y elegir Campanita en sus Ajustes) y en el iPhone 12 (agregando el ERP desde Safari).
- [ ] **Sin correr:** `/chaos` completo de la hoja; el doble clic lo frena `enVuelo` y la dirección única del teléfono, y los permisos los prueba la base.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción.
