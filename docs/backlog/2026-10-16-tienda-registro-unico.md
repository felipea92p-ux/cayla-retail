## 🛍️ El Club empieza al crear la cuenta: un solo registro, y el cartel lleva a tienda.cayla.pe (2026-10-16)

**Decisiones de Felipe:**
- [x] ~~**¿Cómo se une una ficha que se abrió antes de la página?**~~ — Felipe 2026-10-16: por el mismo registro que una persona nueva, sin
  pedirle nada más («todos se registren en el sistema […] así tenga ficha»); el Club empieza al crear la cuenta, no antes.
- [x] ~~**¿Qué hace el cartel?**~~ — Felipe 2026-10-16: «al escanear el cartel lleva al link tienda.cayla.pe». Las 5 personas que ya
  inscribió siguen en el Club como estaban.
- [ ] **Lo impreso en el cartel** («Te invitamos a ser parte del club. Es gratis.», «Escanea y únete en un minuto», «Condiciones al
  escanear»): sigue siendo cierto con la cuenta, pero crearla toma un poco más que un minuto (correo con código y contraseña). ¿Se ajusta?

**Para hacer:**
- [ ] **Pegar `20261016154000` en producción** (con OK de Felipe): una sola parte, idempotente, sin tablas ni políticas; el orden con la
  publicación no importa. Después, refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Publicar** la tienda y el ERP de este PR, y ver en producción que un cartel ya impreso (`/club/<tienda>`) lleva a tienda.cayla.pe.
- [ ] **Retirar `registrarse_en_el_club`** (sin llamador en la web) con las seis pruebas del Club rehechas sobre el registro de la tienda, y
  el CSS que quedó del registro del cartel en `club-publico.css` (tarea aparte ya propuesta).
- [ ] **Las tiendas saben usar «Restablecer acceso»** (Clientes ▸ ficha ▸ Tienda online) para devolverle una cuenta a su dueño si alguien
  la creó con un DNI ajeno: es la red del riesgo que se aceptó.
