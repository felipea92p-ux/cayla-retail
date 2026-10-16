## 🛡️ Antes de abrir la tienda online a cualquiera (2026-10-15, ADR-0426) — rama `claude/tienda-ficha-solo-con-prueba`, PR #1124

- [x] B1 · Una cuenta web se une a una ficha existente solo con el correo que la ficha ya tenía (20261015230000, en producción).
- [x] B2 · El cartel del Club no escribe en una ficha que ya existía: lo pide en caja (20261015232000, en producción).
- [x] B3 · Freno común de las puertas públicas por conexión, documento y día; DNI solo por SUNAT gratis (20261016000000, en producción).
- [x] B4 · Pedidos web: lo confirmado sin ningún pago se anula solo a las horas de «Si no paga»; 3 separaciones abiertas y 2 por prenda;
      la bolsa pregunta por 2 como máximo; pagos digitales solo el líder; «Cómo separar» dice el plazo para pagar (20261016001000, en producción).
- [x] B5 · Tienda: cabeceras de seguridad, cookie de sesión segura, catálogo compartido 30 s, `?aviso=` sin claves heredadas, páginas de error.
- [x] C1 · Apartados: adelanto mínimo del 30 %, 3 abiertos y 2 por prenda por persona en todas las tiendas (20261016003000, en producción).
- [x] C2 · Apartados: barrido diario `/api/apartados/vencer` (3:40 de Lima) en todas las tiendas, también los apartados simples.
- [ ] **Publicar** la web (ERP) y la tienda de este PR: las migraciones ya están en producción y la web vieja muestra el texto de la base.
- [ ] **D10 · Captcha (Felipe):** crear la cuenta de Cloudflare Turnstile y entregar las dos llaves; entonces conectarlo en «Crear mi cuenta»
      y probarlo en el navegador.
- [ ] **Tienda · `script-src`:** escribir la lista de scripts de la política de contenido cuando se pueda probar la tienda entera en el navegador
      con la pila de clientes local (hoy solo se probó la portada sin sesión).
- [ ] **ERP · Registrar pago de un pedido web:** hoy un integrante que elige Yape ve el rechazo de la base bajo «Medio»; mejor esconder los
      medios digitales a quien no es líder (necesita saber en la hoja si la cuenta es líder).
- [ ] **Contador:** cómo se declara el adelanto de un pedido web pagado a distancia.
