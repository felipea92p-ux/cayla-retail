## 🛍️ Tienda online: revisión completa (2026-10-15)

**Decisiones de Felipe** (con la recomendación de la revisión):
- [ ] **Páginas legales en borrador en producción:** Privacidad y Términos dicen «Borrador: lo revisa CAYLA» y «Versión:
  borrador-2026-10-14». Que las revise el abogado, publicarlas como versión final y recién ahí quitar el sello (texto legal: no se tocó).
- [x] ~~**Portada sin cuenta sin ninguna prenda**~~ — Felipe 2026-10-15: se deja como está (la ropa es para quien tiene cuenta). **Cambió el 2026-10-16:** fotos de prendas sin precio (ADR-0408 act. h).
- [ ] **Textos del Club que chocan:** «Sin mensajes de publicidad» frente a la casilla «Quiero recibir por WhatsApp novedades y
  promociones» (recomendado «Sin publicidad, salvo que tú la pidas»); y «En caja, con tu DNI» ahora que hay carné y pasaporte
  («con tu documento»).
- [ ] **Mensaje nuevo de WhatsApp en el detalle del pedido:** «Hola CAYLA Trujillo, te escribo por mi pedido web W-0141.» (el de
  separar no cambió).
- [ ] **«Cómo separar» dice «La tienda tiene 24 horas para confirmarlo»** (antes «Tienes 24 horas»): es la regla de ADR-0408 (sin
  confirmar, se cierra solo). Confirmar que la intención no era «tienes 24 h para escribir».
- [x] ~~**«Toda la ropa»** incluía aretes y maquillaje~~ — Felipe 2026-10-15: «Toda la *tienda*» (ceja «Catálogo»), también en los
  botones «Ver toda la tienda» y el pie. Hecho en este PR.
- [ ] Un título largo por grupo («Prendas de *abajo*») para la página del grupo, dejando el corto en las píldoras.
- [ ] **Bolsa:** «Quitar» saca la prenda entera (la maqueta sacaba una) y se suma un «+»: recomendado dejarlo.
- [ ] **Cambios en cualquier tienda** de un pedido web: confirmar.
- [ ] **«Club CAYLA» del pie sin cuenta:** probar `/#club-cayla` en vez de Crear cuenta. **«Cómo llegar»:** hoy busca la dirección
  escrita en Google Maps; más exacto, guardar el enlace de Maps de cada tienda en Configuración ▸ Tienda web (cambio de base).

**Para hacer:**
- [ ] **Fusionar #1124 antes que #1129** (Felipe 2026-10-15) y resolver en #1129 los 5 archivos que chocan.
- [ ] **Producción:** confirmar en el panel del proyecto de clientes que «Change email address» usa `correo-nuevo.html` (la guía lo
  decía): sin ella, «Cambiar mi correo» no se puede terminar (espera un código de 6 números).
- [ ] **Los grupos por familia:** que `tienda_catalogo` mande `categorias.familia`, para que una categoría nueva de accesorios no caiga
  en «Ropa ▸ Encima y más» (hoy se ordena por prefijo, `lib/grupos.ts`).
- [ ] **El buscador con una tienda elegida:** «cinturón» con Lima dice «No encontramos» aunque en Trujillo haya; que diga dónde sí hay
  (hoy en producción hay una sola tienda en la web: no se nota).
- [ ] **La ficha que no existe responde 200** (la pantalla sí dice «Esta prenda ya no está»): el `loading.tsx` del catálogo empieza a
  mandar la página antes del `notFound()`. Riesgo bajo (detrás del login, con noindex).
- [ ] **Contraseña nueva, caso raro:** si guardar falla después de canjear el código del enlace, el reintento dice «ya no sirve» con la
  sesión ya abierta (`app/acciones/cuenta.ts`, `guardarClaveNueva`).
- [ ] **«Mi cuenta» y la bolsa leen el catálogo entero** solo para armar la cabecera (~1,2 s): el esqueleto lo disimula.
- [ ] **Ver la revisión en producción con una cuenta real** al publicarse (menús, filtros, bolsa, Mis pedidos) y a 375 px.
