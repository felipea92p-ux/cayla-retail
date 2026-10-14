## 🛍️ Tienda online CAYLA (2026-10-14) — maqueta aprobada; plan de construcción del ADR-0408; rama `claude/customer-catalog-reservation-system-409dbc`

Maqueta: `docs/maquetas/tienda-online-2026-10/` (`index.html` + `README.md`, con todas las decisiones de negocio). Arquitectura:
`docs/adr/0408-tienda-online-app-aparte-clientes-con-su-inicio-de-sesion-y-pedidos-web.md`. **Nada de esto existe todavía en
`apps/web` ni en la base.**

- [x] Maqueta en cuatro versiones el mismo día: v1 pago con Yape, v2 fotos reales y secciones, v3 separar sin pagar, **v4 vigente**
  (catálogo solo con cuenta, cuenta propia sin Google con correo y DNI únicos, «Olvidé mi contraseña», siempre recojo en tienda).
  Propuestas a, c, f–k y m aprobadas. Alcance: todo de una vez, como la maqueta.
- [x] **Arquitectura aprobada por Felipe (ADR-0408):** app aparte `apps/tienda` en este monorepo; cuentas de clientes en un inicio de
  sesión propio (en producción 34 de las 137 políticas de `retail` solo piden sesión y `authenticated` tiene permiso sobre todas las tablas
  y funciones); la tienda entra a la base solo por funciones `tienda_*` con un rol propio; pedidos web sobre el motor de Apartados; pagos
  listos para una pasarela.
- [x] **Lista de actividades aprobada** (abajo, en ese orden). Decidido: confirmar **reserva** la prenda y sale del stock al entregar;
  la boleta sale **al quedar pagado completo** (los adelantos parciales no llevan comprobante).

### Plan de construcción (una actividad = un corte vertical demostrable, un commit; estimado en sesiones)

1. ✅ **La tienda existe y se publica sola** (hecha 2026-10-14; ver abajo) — `apps/tienda` con la marca de la maqueta y su portada, que lee la campaña vigente por la
   puerta angosta (rol `tienda_web` + `tienda_portada`); CI, ganchos y candados extendidos a la app nueva. Demostrable: la portada en
   local con la campaña de la base; CI verde. (1)
2. ✅ **Crear cuenta, entrar, olvidé mi contraseña y salir** (integrada 2026-10-14; falta la 2b, ver abajo) — proyecto de clientes en local, `cuentas_web` + `tienda_registrar_cuenta`
   (correo y DNI únicos, entra al Club con origen web, cumpleaños como `clientas`), nombre por DNI compartido, topes por IP y documento.
   Demostrable: crear cuenta, ver rechazado un DNI o correo repetido, entrar, recuperar la contraseña con el correo de prueba local y
   salir. (1,5)
3. **Vitrina web y catálogo publicado** — `vitrina_productos`; módulo `vitrina_web` (nace solo para el líder): encender con precio web,
   lote, fijar en Lo nuevo; la tienda lista lo publicado con su precio web y la campaña (ADR-0403). Demostrable: encender un modelo en el
   ERP y verlo en la tienda con su precio. (1,5)
4. **Ficha con stock por tienda y filtro por sede** — niveles por tienda, color y talla (nunca la cifra de 4 o más). Demostrable: vender
   en Vender y ver cambiar el nivel en la ficha. (0,5)
5. **Inicio completo y buscador** — Lo nuevo (primer ingreso a una tienda), Ofertas por campaña, Más vendidos sin cifras, categorías,
   buscador y menú. Demostrable: el inicio de la maqueta con datos de la base local. (1)
6. ✅ **Configuración ▸ Tienda web** (integrada 2026-10-14) — WhatsApp, dirección y horario por sede; plazos y umbrales. Demostrable: cambiar el WhatsApp de una sede
   en el ERP y verlo en la tienda. (0,5)
7. **Bolsa y «Separar»** — `pedidos_web` y sus líneas; separar sin tocar el stock; «¡Listo, lo separaste!»; WhatsApp con el mensaje armado;
   Mi cuenta con sus pedidos; cierre a las 24 horas por ruta cron. Demostrable: separar crea el pedido sin cambiar el stock y se cierra
   solo a las 24 horas. (1,5)
8. **Pedidos web en el ERP: confirmar** — módulo `pedidos_web` (nace solo para el líder): lista y cifras; confirmar con la reserva de
   Apartados, de dónde sacar cada prenda, aviso de la última, traslado desde otra sede y «por conseguir» con fecha; no confirmar con motivo;
   anular. Demostrable: confirmar en el ERP y que la tienda y Vender dejen de ofrecer la prenda; anular y que vuelva. (1,5)
9. **Cobrar dentro del pedido** — pagos digitales con n.º de operación único, efectivo a la caja abierta, adelanto para lo que se consigue,
   aviso de 48 horas sin pagar; columnas listas para una pasarela. Demostrable: dos pagos, el n.º repetido rechazado y el efectivo en el
   cuadre de caja. (1)
10. **Entregar con código y boleta** — código de 4 cifras, venta y boleta por Lucode, aviso de 7 días sin recoger; el cliente ve su código.
    Demostrable: entregar en local con la boleta en la cola de Lucode, sin enviarla a SUNAT. (1,5)
11. **Looks** — Vitrina ▸ Looks en el ERP y «Arma tu look» en la tienda. Demostrable: crear un look en el ERP y agregarlo completo en la
    tienda. (1)
12. **El Club en la cuenta** — beneficios (cumpleaños y vale), novedades para ti, favoritos y «Avísame», con «Esperan una talla» en la
    Vitrina. Demostrable: tocar «Avísame» y verlo en la Vitrina. (1)
13. **Producción y piloto** — proyectos y cuentas (los crea Felipe: inicio de sesión de clientes, Vercel, dominio, correo), migraciones por
    partes con su OK, piloto en una sede. Demostrable: la tienda en su dominio, atendida por una sede. (1)

Total ≈ 14 sesiones. Las pantallas del ERP cumplen las reglas del repo (guía de foco, guía interactiva, `/chaos`, modo oscuro, piezas
únicas); la tienda tiene sus propias pruebas.

### Lo que dejó la actividad 1

- [ ] **No está en producción:** `20261014220000_tienda_puerta_y_portada.sql` (rol `tienda_web` + `retail.tienda_portada()`), aplicada solo
  en local. Se pega en la actividad 13, con el OK de Felipe, junto con el usuario con contraseña que hereda `tienda_web`.
- [ ] **Páginas de la portada que aún no existen** (hoy abren «Esta página no está»): Entrar, Crear mi cuenta, Olvidé mi contraseña,
  Privacidad y Términos del club van en la **actividad 2** (crear la cuenta pide aceptar los términos); Cómo separar y Cambios y
  devoluciones, en la **5**; Nuestras tiendas (y la sección de la portada, con el nombre web de cada sede), en la **6**.
- [ ] **Actividad 13, Vercel:** la tienda tendrá su propio proyecto, con su «Ignored Build Step»; el del ERP
  (`scripts/ci/vercel-ignorar.mjs`) hoy reconstruye el ERP en producción aunque la fusión solo toque `apps/tienda`. No rompe nada.
- [ ] **Dirección web (decisión de Felipe, conversada el 2026-10-14):** `cayla.pe` y `www.cayla.pe` abren hoy la tienda de Shopify, y
  `www.cayla.pe` sale impresa en las boletas. Recomendado: el piloto en `tienda.cayla.pe` sin tocar Shopify, y `cayla.pe` pasa a la tienda
  nueva cuando el piloto salga bien (ese día se decide qué hacer con Shopify). El ERP puede seguir en `cayla-retail.vercel.app` o pasar a
  `erp.cayla.pe`: son proyectos separados. Antes de cambiar `cayla.pe` se le pregunta a Felipe.

### Lo que dejaron las actividades 2 y 6 (integradas el 2026-10-14, construidas por agentes en paralelo)

- [ ] **Actividad 2b (en curso):** código de 6 cifras al correo para crear la cuenta, y las casillas «Soy mayor de 18 años» (obligatoria)
  y «Avisos del Club por WhatsApp» (opcional, permiso del Club con origen web). Decisión de Felipe, ADR-0408 act. 2026-10-14 (b).
- [ ] **No están en producción:** `20261014223000_tienda_cuentas_parte1_clientas.sql` (altera `clientas`: va SOLA, sin políticas),
  `20261014224000_tienda_cuentas_parte2_cuentas_web.sql` y `20261014231000_tienda_web_sedes_y_plazos.sql`. Van en la actividad 13, en
  orden y después de `20261014220000`, con el OK de Felipe; recién entonces se refresca el diccionario.
- [ ] **Actividad 13, proyecto de clientes:** crearlo con los ajustes de `apps/tienda/supabase/config.toml`, la plantilla del correo
  (`plantillas/recuperar.html`) y las direcciones permitidas; registro público cerrado (la cuenta la crea el servidor). Variables:
  `NEXT_PUBLIC_TIENDA_AUTH_URL`, `NEXT_PUBLIC_TIENDA_AUTH_ANON_KEY`, `TIENDA_AUTH_SERVICE_KEY`, `TIENDA_INTENTOS_SAL` y, si se quiere el
  respaldo de pago del padrón, `TIENDA_PADRON_*`. Un **proveedor de correo propio**: con el del servicio, al llegar a su tope la persona ve
  «Revisa tu correo» y el correo no sale.
- [ ] **Textos legales en borrador:** `/privacidad` y `/terminos-del-club` dicen «Borrador: lo revisa CAYLA». Felipe los revisa antes de
  producción; después conviene pasarlos a `club_textos` con su versión (hoy lo aceptado queda en `cuentas_web.textos_aceptados`).
- [ ] **Por definir (actividad 12, el Club en la cuenta):** qué pasa con la cuenta web cuando su ficha se anonimiza a los 3 años o la persona
  se da de baja del Club; y si al unir dos fichas la cuenta web se mueve a la que queda.
- [ ] **Topes de registro:** 5 por IP y hora (los del cartel). Si una tienda ayuda a crear cuentas desde su wifi, puede frenarse; se mira
  con el piloto.
- [ ] **Configuración ▸ Tienda web:** Actividad muestra estos cambios con el texto genérico (darle uno propio obliga a reescribir
  `fn_actividad_configuracion` desde su definición de producción); falta `/chaos` completo y `/formidable` de la pestaña; `/configuracion`
  sigue «pendiente» en la guía de foco porque sus otras pestañas no la tienen (la nueva sí).
- [ ] **Base local:** le faltan `fn_sobrantes_por_revisar` y `guias_vistas` de `main` (sale un error en la consola del ERP local); no es de
  esta rama.

### Pendientes que no son de construcción

- [ ] **Datos que la web necesita:** prendas etiquetadas en las campañas (hoy: Aniversario 1, Estreno 2, Últimas unidades 3, Para liquidar
  0), fotos de las 26 prendas sin foto, foto propia de los colores que no la tienen y el precio web de cada modelo.
- [ ] **Decisiones abiertas:** la dirección de la web; los envíos, cuando se retomen (quién reparte y quién paga el reenvío).
- [ ] **Boleta por Lucode:** toca comprobantes y SUNAT; se transmite a SUNAT real solo con el OK de Felipe.
