## 🛍️ Tienda online CAYLA: maqueta navegable (2026-10-14) — solo docs, sin migración; rama `claude/customer-catalog-reservation-system-409dbc`

Maqueta: `docs/maquetas/tienda-online-2026-10/` (`index.html` + `README.md`). **No es código del ERP**: nada de esto existe
todavía en `apps/web` ni en la base.

- [x] Versión 1 (pago con Yape en la web) y versión 2 (fotos reales y secciones): superadas.
- [x] Versión 3: separar sin pagar; stock baja al confirmar; stock por tienda y filtro por sede; pagos dentro del pedido web.
- [x] **Versión 4 (mismo día):** catálogo solo con cuenta (portada sin prendas); cuenta propia sin Google (correo y
  contraseña, DNI, celular, cumpleaños; correo y DNI únicos; «Olvidé mi contraseña»); siempre recojo en tienda; adelanto por
  prenda por conseguir; avisos del club por WhatsApp y en la cuenta; cambios como en tienda. **Propuestas a, c, f–k y m
  aprobadas.** Alcance decidido: todo de una vez, como la maqueta. Decisiones completas en el `README.md` de la maqueta.
- [ ] **OK de Felipe a la arquitectura recomendada** (README de la maqueta): app aparte `apps/tienda` en este monorepo,
  cuentas de clientes en un inicio de sesión propio (la base tiene ~850 reglas para «cualquiera con sesión»), pagos listos
  para una pasarela (referencia externa única, estados, notificación repetible sin duplicar).
- [ ] **Datos que la web necesita:** etiquetar prendas en las campañas (hoy: Aniversario 1, Estreno 2, Últimas unidades 3,
  Para liquidar 0), fotos de las 26 prendas sin foto, foto propia de los colores que no la tienen y precio web por modelo.
- [ ] **Decisiones abiertas:** la dirección de la web; los envíos, cuando se retomen (quién reparte, quién paga el reenvío).
- [ ] **Después del OK:** ADR (reservar con `pnpm reservar adr`) y plan por fases con `/construir` (estimado: 10 a 13
  sesiones, unas 3 a 4 semanas con las aprobaciones de producción): base (pedidos web con líneas y pagos aparte de
  `apartados`; separar no escribe en `movimientos`; confirmar escribe la salida y anular la entrada; `productos.precio_web`;
  función pública que devuelve el nivel de stock, no la cifra; cierre a las 24 h; traslado con Traslados; cuentas web con
  correo y DNI únicos unidas a `clientas`); ERP (módulos `pedidos_web` y `vitrina_web`, que nacen solo para el líder); la
  tienda; piloto en una sede.
- [ ] **Cuentas que crea Felipe cuando toque:** el proyecto de inicio de sesión de clientes, el proyecto de Vercel de la
  tienda, el dominio y, más adelante, la cuenta de comercio de la pasarela (Izipay o Culqi).
- [ ] **Boleta al quedar pagado:** emitirla por Lucode toca comprobantes y SUNAT; se construye solo con el OK de Felipe.
