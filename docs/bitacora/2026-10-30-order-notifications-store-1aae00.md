## 2026-10-30 (El celular de la tienda suena cuando llega un pedido web)
Qué hice: el ERP se instala como app, cada teléfono se activa en Tienda web ▸ Pedidos ▸ «Avisos de pedidos» para su sede, y un cron cada minuto le manda «Pedido web nuevo · W-0018 / Tienda TRU · 1 prenda · S/ 109.00» con el sonido «Campanita» en Android (ADR-0582).
Por qué así: push web sin apps ni costos; el permiso se vuelve a preguntar en cada envío para que a quien deja la sede no le siga sonando.
Felipe se lleva: pegar la migración `20261030150000`, poner `ERP_VAPID_*` en Vercel y activar los dos teléfonos (el iPhone, agregando el ERP desde Safari).
