## 🪪 Club, tanda 1g · se une sola desde el cartel (ADR-0288 act. g) — rama `claude/club-paso1g-registro-cartel`; migraciones `20261001210000`–`210700` **SIN pegar**

- [ ] **Felipe:** pegar las 8 partes, cada una SOLA y en orden (`210000` clientas → `210100` configuración → `210200` canjes →
      `210300` textos → `210400` permisos → `210500` módulo → `210600` tablas → `210700` funciones), y recién entonces fusionar.
      Entre el pegado de la parte 8 y el despliegue, la caja vieja no puede invitar de palabra ni mostrar el QR personal (se
      retiran); vender y registrar clientas siguen.
- [ ] **Felipe:** aprobar el texto legal de la página (`docs/club/texto-legal-registro-v1.md`; en la base ya va como v1), los
      textos que escribieron los agentes y no estaban en el borrador (cartel, mensajes de error de la página, plantillas de
      los cuatro avisos) y la fecha de publicación.
- [ ] **Felipe decide:** un vale que cubre toda la compra hoy se rechaza (`aniversario_cubre_todo`: una venta en S/ 0 no se
      registra). ¿Se cobra S/ 0.01 o se modela la venta gratuita con su comprobante (toca SUNAT/Lucode)?
- [ ] **Felipe aprueba:** el menú pasa a Clientas ▸ Fichas · Avisos (cambió `lib/menu-hoy.golden.json`), y `/clientas/cartel`
      queda abierto a quien vea Clientas o Avisos.
- [ ] Asignar el módulo «Avisos del club» al rol de la encargada (nace solo para el líder).
- [ ] Cargar el WhatsApp de cada tienda (Configuración ▸ Tiendas y caja) e imprimir el cartel nuevo.
- [ ] «Enviados hoy» de Avisos cuenta lo anotado desde que se abrió la pantalla; la base ya trae
      `fn_club_avisos_enviados_hoy` para leerlo de verdad.
- [ ] La aceptación de la casilla 2 (privacidad y términos) queda en la nota del permiso con la versión de `privacidad`; si
      se quiere su texto exacto versionado, es un tipo más en `club_textos`.
- [ ] Huecos de prueba: ligar compras previas por documento al registrarse desde el cartel; conservación con apartado abierto.
- [ ] Después de pegar: `CLUB_IP_SAL` en Vercel (si falta, la sal sale de la llave de servicio) y refrescar el diccionario.
- Cómo verificas: el recorrido a 375 px del PR; `pnpm pruebas:club-registro-cartel`, `pruebas:club-aniversario`, `pruebas:club-avisos`.
