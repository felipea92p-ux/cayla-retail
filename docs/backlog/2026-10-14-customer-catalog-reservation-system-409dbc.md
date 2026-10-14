## 🛍️ Tienda online CAYLA: maqueta navegable (2026-10-14) — solo docs, sin migración; rama `claude/customer-catalog-reservation-system-409dbc`

Maqueta: `docs/maquetas/tienda-online-2026-10/` (`index.html` + `README.md`). **No es código del ERP**: nada de esto existe
todavía en `apps/web` ni en la base.

- [x] Versión 1: 13 decisiones de Felipe; web del cliente y ERP conectados (quedó superada por la versión 3).
- [x] **Versión 2 (mismo día):** fotos reales (48 prendas, 116 fotos, solo lectura), Lo nuevo, Ofertas por campaña, Más
  vendidos, Arma tu look, Club automático al crear la cuenta, sin publicidad por WhatsApp, vista «La tienda en grande»;
  ERP con Looks en la Vitrina y «Fijar en Lo nuevo». Las fotos no van al repo (`fotos/` en `.gitignore`).
- [x] **Versión 3 (mismo día): separar sin pagar.** «Separar» crea un pedido por confirmar con su número y lleva al WhatsApp
  de la tienda; el stock baja al confirmar; stock de cada tienda en cada prenda (número solo si quedan 3 o menos) y filtro por
  sede; pagos dentro del pedido web; 24 horas corridas para confirmar; si dos piden la última, decide la tienda (otra sede o
  conseguirla para una fecha); aviso a las 48 h de un confirmado sin pagar; «Lo nuevo» desde que llega a una tienda. Se fueron
  el pago en la web y el estante web. Las decisiones de las siete rondas están en el `README.md` de la maqueta.
- [ ] **Datos que la web necesita:** etiquetar prendas en las campañas (hoy: Aniversario 1, Estreno 2, Últimas unidades 3,
  Para liquidar 0), fotos de las 26 prendas sin foto, y foto propia de los colores que no la tienen.
- [ ] **OK de Felipe a las propuestas** de la maqueta: (a) n.º de operación al anotar un pago digital, sin repetirse; (c) un
  color sin foto propia se muestra con la foto principal; (f) agregar a la bolsa no separa; (g) más vendidos sin cifras;
  (h) look completo en una hoja de tallas; (i) «Novedades para ti»; (j) al confirmar, el stock baja primero del almacén;
  (k) el ERP dice cuál pedido separó antes la última y la ficha se lo avisa al cliente; (m) código de 4 cifras para recoger.
- [ ] **Decisiones abiertas:** una prenda que se consigue para una fecha, ¿se cobra antes de que llegue?; ¿un Yape por sede o
  uno compartido?; ¿los avisos del club por WhatsApp (cumpleaños, vale) también se dejan?; cambios y devoluciones de una compra
  web; quién reparte en la ciudad y quién paga si la dirección estaba mal; nombre y dirección de la web.
- [ ] **Después del OK:** ADR (reservar número con `pnpm reservar adr`) y plan por fases con `/construir`: base (pedidos web
  con sus líneas y sus pagos, aparte de `apartados`; separar no escribe en `movimientos`; confirmar escribe la salida y anular
  la entrada; `productos.precio_web`/`publicado_web`; una función pública que devuelve el nivel de stock, no la cifra; cierre a
  las 24 h; traslado al confirmar con Traslados; la prenda «por conseguir» enlazada a Compras o Producción, sin diseñar);
  ERP (módulos `pedidos_web` y `vitrina_web`, que nacen solo para el líder); repositorio aparte `cayla-tienda` (crearlo en
  GitHub necesita OK); piloto en una sede.
- [ ] **Riesgo a cuidar al construir:** las cuentas de los clientes no pueden vivir en el mismo inicio de sesión que el
  equipo (proyecto de Dynamic) sin revisar cada regla de seguridad que hoy dice «cualquier persona con sesión».
- [ ] **Boleta al quedar pagado:** emitirla por Lucode toca comprobantes y SUNAT; se construye solo con el OK de Felipe.
