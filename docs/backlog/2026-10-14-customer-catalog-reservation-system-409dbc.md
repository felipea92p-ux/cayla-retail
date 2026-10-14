## 🛍️ Tienda online CAYLA: maqueta navegable (2026-10-14) — solo docs, sin migración; rama `claude/customer-catalog-reservation-system-409dbc`

Maqueta: `docs/maquetas/tienda-online-2026-10/` (`index.html` + `README.md`). **No es código del ERP**: nada de esto existe
todavía en `apps/web` ni en la base.

- [x] 13 decisiones de Felipe (estante web por sede, recojo y envío, tarifa fija en las 3 ciudades y pago en destino fuera,
  100 % al apartar, WhatsApp con mensaje armado + foto y código de pedido, cada sede confirma lo suyo, cuenta solo al
  apartar, interruptor por modelo, precio web propio por modelo, el cliente ve solo el precio web, campañas también sobre
  el precio web, no recoge en 7 días = se recuerda y decide la sede, maqueta antes que repo).
- [x] Web del cliente (11 pantallas) y ERP (Pedidos web, Vitrina web, Separar para la web, Configuración ▸ Tienda web),
  conectados entre sí; recorrido por clics probado en Chrome sin pantalla, en claro y oscuro, a 1440, 1024 y 390 px.
- [x] **Versión 2 (mismo día):** fotos reales (48 prendas, 116 fotos, solo lectura), Lo nuevo, Ofertas por campaña, Más
  vendidos, Arma tu look, Club automático al crear la cuenta, sin publicidad por WhatsApp, vista «La tienda en grande»;
  ERP con Looks en la Vitrina y «Fijar en Lo nuevo». Las fotos no van al repo (`fotos/` en `.gitignore`).
- [ ] **Datos que la web necesita:** etiquetar prendas en las campañas (hoy: Aniversario 1, Estreno 2, Últimas unidades 3,
  Para liquidar 0), fotos de las 26 prendas sin foto, y foto propia de los colores que no la tienen.
- [ ] **OK de Felipe a las propuestas** de la maqueta: (a) n.º de operación escrito por la sede al confirmar; (b) 20 min /
  7 días / aviso a las 2 h; (c) un color sin foto propia se muestra con la foto principal (versión 2); (d) a otra ciudad envía la sede más cercana con todo
  el pedido; (e) boleta al confirmar el pago (SUNAT/Lucode); (f) agregar a la bolsa no guarda; (g) más vendidos sin cifras; (h) look completo en una hoja de tallas; (i) «Novedades para ti».
- [ ] **Decisiones abiertas:** ¿un Yape Empresa (QR) por sede o uno compartido?; ¿los avisos del club por WhatsApp (cumpleaños, vale) también se dejan?; cambios y devoluciones de una compra web;
  quién reparte en la ciudad y quién paga si la dirección estaba mal; apartar fuera de horario; nombre y dirección de la web.
- [ ] **Después del OK:** ADR (reservar número con `pnpm reservar adr`) y plan por fases con `/construir`: base (sububicación
  `estante_web`, `pedidos_web`, `productos.precio_web`/`publicado_web`, canal `web` en la venta, función propia para
  confirmar un pago web sin caja, seis funciones públicas); ERP (módulos `pedidos_web` y `vitrina_web`, que nacen solo para
  el líder; «Separar para la web» como función de Existencias); repositorio aparte `cayla-tienda` (crearlo en GitHub
  necesita OK); piloto en una sede.
- [ ] **Riesgo a cuidar al construir:** las cuentas de los clientes no pueden vivir en el mismo inicio de sesión que el
  equipo (proyecto de Dynamic) sin revisar cada regla de seguridad que hoy dice «cualquier persona con sesión».
