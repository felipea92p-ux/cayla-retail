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
2. ✅ **Crear cuenta, entrar, olvidé mi contraseña y salir** (integrada 2026-10-14, con la 2b) — proyecto de clientes en local, `cuentas_web` + `tienda_registrar_cuenta`
   (correo y DNI únicos, entra al Club con origen web, cumpleaños como `clientas`), nombre por DNI compartido, topes por IP y documento.
   Demostrable: crear cuenta, ver rechazado un DNI o correo repetido, entrar, recuperar la contraseña con el correo de prueba local y
   salir. (1,5)
3. ✅ **Vitrina web y catálogo publicado** (integrada 2026-10-14, con la 3b: sin precio web) — `vitrina_productos`; módulo `vitrina_web` (nace solo para el líder): encender con precio web,
   lote, fijar en Lo nuevo; la tienda lista lo publicado con su precio web y la campaña (ADR-0403). Demostrable: encender un modelo en el
   ERP y verlo en la tienda con su precio. (1,5)
4. ✅ **Ficha con stock por tienda y filtro por sede** (integrada 2026-10-15) — niveles por tienda, color y talla (nunca la cifra de 4 o más). Demostrable: vender
   en Vender y ver cambiar el nivel en la ficha. (0,5)
5. ✅ **Inicio completo y buscador** (integrada 2026-10-15) — Lo nuevo (primer ingreso a una tienda), Ofertas por campaña, Más vendidos sin cifras, categorías,
   buscador y menú. Demostrable: el inicio de la maqueta con datos de la base local. (1)
6. ✅ **Configuración ▸ Tienda web** (integrada 2026-10-14) — WhatsApp, dirección y horario por sede; plazos y umbrales. Demostrable: cambiar el WhatsApp de una sede
   en el ERP y verlo en la tienda. (0,5)
7. ✅ **Bolsa y «Separar»** (integrada 2026-10-15) — `pedidos_web` y sus líneas; separar sin tocar el stock; «¡Listo, lo separaste!»; WhatsApp con el mensaje armado;
   Mi cuenta con sus pedidos; cierre a las 24 horas por ruta cron. Demostrable: separar crea el pedido sin cambiar el stock y se cierra
   solo a las 24 horas. (1,5)
8. ✅ **Pedidos web en el ERP: confirmar** (integrada 2026-10-15) — módulo `pedidos_web` (nace solo para el líder): lista y cifras; confirmar con la reserva de
   Apartados, de dónde sacar cada prenda, aviso de la última, traslado desde otra sede y «por conseguir» con fecha; no confirmar con motivo;
   anular. Demostrable: confirmar en el ERP y que la tienda y Vender dejen de ofrecer la prenda; anular y que vuelva. (1,5)
9. ✅ **Cobrar dentro del pedido** (integrada 2026-10-15) — pagos digitales con n.º de operación único, efectivo a la caja abierta, adelanto para lo que se consigue,
   aviso de 48 horas sin pagar; columnas listas para una pasarela. Demostrable: dos pagos, el n.º repetido rechazado y el efectivo en el
   cuadre de caja. (1)
10. ✅ **Entregar con código y boleta** (integrada 2026-10-15; la boleta sale sola al completar el pago) — código de 4 cifras, venta y boleta por Lucode, aviso de 7 días sin recoger; el cliente ve su código.
    Demostrable: entregar en local con la boleta en la cola de Lucode, sin enviarla a SUNAT. (1,5)
11. ✅ **Looks** (integrada 2026-10-15) — Vitrina ▸ Looks en el ERP y «Arma tu look» en la tienda. Demostrable: crear un look en el ERP y agregarlo completo en la
    tienda. (1)
12. ✅ **El Club en la cuenta** (integrada 2026-10-15) — beneficios (cumpleaños y vale), novedades para ti, favoritos y «Avísame», con «Esperan una talla» en la
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

- [x] **Actividad 2b (integrada 2026-10-14):** código de 6 cifras al correo para crear la cuenta (vence a los 30 min; 5 intentos y 15 min
  de bloqueo; reenvío cada 60 s, 5 por hora), «Soy mayor de 18 años» exigida también por la base y «Avisos del Club por WhatsApp»
  opcional, anotado en `club_permisos` con medio `tienda_web`. Si la ficha ya tenía OTRO celular, la web no lo cambia y los avisos no se
  activan (el código prueba el correo, no el DNI). Por decidir con Felipe: qué tienda le manda los avisos a quien se registró en la web
  y todavía no compró (hoy empiezan con su primera compra).
- [ ] **Actividad 13, proyecto de clientes (lo que suma la 2b):** la plantilla de invitación (`plantillas/codigo.html`) y su asunto, códigos de
  6 cifras con vencimiento de 30 minutos, y subir `rate_limit.token_verifications` (todas las verificaciones salen del servidor de la tienda,
  desde una sola IP). El «sí» al Club sigue sin anotarse en `club_permisos` mientras los textos legales sean borrador.
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

### Lo que dejaron la actividad 3 y el motor del pedido (integrados el 2026-10-14)

- [x] **Actividad 3b (integrada 2026-10-14):** sin precio web. `tienda_catalogo(p_sede)` da el precio de tienda de la sede elegida
  (`fn_precio_en_sede`, el modelo vale lo de su talla más cara) y, con «Todas», el mayor entre las tiendas de la web; la campaña va encima
  talla por talla (ADR-0403) y «Desde» solo sale si la campaña no toca todas las tallas igual. `?sede=` lleva el nombre web de la tienda
  (`lib/sede-elegida.ts`); una tienda escondida se lee como «Todas»; sin ninguna tienda en la web, el precio de la grilla. Las píldoras
  «Ver lo que hay en» salen con 2 tiendas o más. La Vitrina queda para mostrar u ocultar y Lo nuevo. La base local recibió las 13
  migraciones de precio por sede de `main` y la de ADR-0403, que le faltaban (sin anotarlas en `schema_migrations`).
- [x] **Por la 3b, para la actividad 4** (hecho en la 4): «Ver lo que hay en» hoy solo cambia el precio; con la 4 también filtra por lo que hay en esa tienda
  (como la maqueta). Recordar la tienda elegida entre visitas, si hace falta, va con la 7 (el cliente elige una tienda para recoger todo).
- [x] **El catálogo pide cuenta** (`(catalogo)/layout.tsx` y el proxy): sin sesión manda a «Entrar»; con sesión, la portada lleva al
  catálogo hasta que exista el Inicio de la actividad 5.
- [ ] **No están en producción:** ver «Para la actividad 13», más abajo, con el orden de pegado de todas.
- [x] **Para la actividad 7** (hecho en la 7): envolver `crear_pedido_web` y `fn_pedidos_web_de_clienta` en funciones `tienda_*`; validar cada precio con
  `fn_precio_en_sede` de la sede de recojo (y la campaña, ADR-0403); la ruta programada del cierre llama a `fn_cerrar_pedidos_web_vencidos`;
  los plazos salen de `configuracion_tienda_web` (actividad 6), no escritos a mano.
- [x] **Para la actividad 8** (hecho en la 8): dar de alta el módulo `pedidos_web` (sin `rol_modulos`); el traslado de una prenda reservada en otra sede;
  rotular u ocultar las reservas «Pedido web W-…» en Apartados (liberarlas desde ahí ya está bloqueado); que el aviso de 48 h no salte a lo
  que espera una prenda por conseguir con su adelanto pagado (ADR-0408 act. c); y que `fn_producto_se_puede_eliminar` y
  `fn_producto_historia` digan «tiene pedidos web» (hoy lo frena la llave con el aviso genérico), con un reemplazo anclado.
- [x] **Para la actividad 10** (hecho en la 10; la nota de crédito se reemplazó por «Anular pedido pagado», ADR-0408 act. d): al entregar, la línea pasa a `entregada`, el apartado se cierra, la salida de venta, el código de 4 cifras y la
  boleta por Lucode; extender el candado diferido `venta_pagos_anticipo_solo_de_apartado` (20261013155000) a los pedidos web; y la nota de
  crédito para un pedido ya pagado.
- [ ] **La Vitrina:** falta `/chaos` y `/formidable` de la pantalla; el ERP local muestra errores de `fn_guias_vistas`, `marcar_guia_vista`
  y `fn_sobrantes_por_revisar` porque la base local está atrasada (no es de esta rama).
- [ ] **Pasarela (cuando se integre):** un cobro que el pedido ya no admite queda «por revisar» y se devuelve siempre.

### Lo que dejaron las actividades 4 a 12 y las tandas de integración (2026-10-15)

- [x] **Integradas en la rama** (agentes en paralelo, cada una en su rama y su worktree): la 4 (ficha y niveles por tienda), la 5 (Inicio,
  Lo nuevo, ofertas, más vendidos y buscador), la 7 (bolsa en cookie `httpOnly`, «Separar», Mis pedidos, cierre programado cada 15 min),
  la 8 (Ventas ▸ Pedidos web: confirmar, cerrar, anular, enviar), la 9 (cobrar: registrar, anular y devolver pagos), la 10 (la venta y su
  boleta en cola al completar el pago; entregar con el código; Por entregar; Finanzas con la cuenta 122), la 11 (looks en el ERP y «Arma tu
  look») y la 12 (favoritos, «Avísame», el Club en «Mi cuenta» y Esperan una talla). Después, tres tandas conectaron la ficha y las
  tarjetas, la cabecera, los looks a la bolsa y el aviso del Club al entrar, y dejaron una sola regla de «hay», de «nuevo», de precio y de
  tienda elegida (ADR-0408 act. d).
- [x] **Lo que Felipe decidió al integrar** (ADR-0408 act. d): tope de 3 separaciones por confirmar; textos de anulación para el cliente;
  la boleta sale sola; anula o devuelve quien ve Pedidos web; sin «baja» del Club en la tienda; avisos del Club al entrar; entrar a la web
  cuenta para los 3 años y la cuenta web se cierra al anonimizar; correo y DNI únicos y sin «Unir fichas»; tiendas solo con piso, almacén
  y Cuarentena.
- [x] **Verificado en una base limpia, como el CI** (2026-10-15, sobre el merge con `origin/main`): las migraciones de la rama se aplican
  una por una, cada una en su transacción; 231 de 233 pruebas en verde. Las dos rojas: una prueba de esta rama que dependía de la edad del
  seed (arreglada) y `pruebas:igv-fase6`, que falla en `main` entre las 19:00 y las 24:00 de Lima (tarea aparte).
- [x] **Integrado** (2026-10-15): la talla de obsequio sigue en S/ 0 y la Vitrina solo publica ropa (`20261015121000`, `122000`); el correo
  en «Editar ficha» del ERP, el aviso al archivar con un pedido web en curso, Vender que dice si ya tenía ficha y el correo del cartel bajo
  su campo (`20261015123000`).
- [ ] **En construcción** (agentes, 2026-10-15): anular un pedido pagado con su boleta (cualquiera con el módulo); la ropa al precio de la
  tienda aunque su ficha diga S/ 0; «Cambiar mi correo» y «Eliminar cuenta» en Mi cuenta, «Restablecer acceso» en la ficha del ERP y la
  anonimización que espera a un pedido pagado; el nombre siempre del padrón; «Recomendaciones» (tienda y módulo nuevo del ERP).
- [ ] **Antes del PR:** volver a verificar en una base limpia con todo junto; `/chaos` y `/formidable` de las pantallas nuevas del ERP y de la
  tienda; `pnpm datos:comparar`.

### Para la actividad 13 (producción), en este orden y con el OK de Felipe

1. **Lo que crea Felipe:** el proyecto de autenticación de clientes (Supabase), el proyecto de la tienda en Vercel con sus variables
   (`TIENDA_DB_URL` del usuario de `tienda_web`, las llaves del proyecto de clientes, `CRON_SECRET`, `TIENDA_FOTOS_ORIGEN`), el correo que
   manda el código, y `tienda.cayla.pe` en GoDaddy (`cayla.pe` sigue en Shopify hasta cerrar el piloto).
2. **Migraciones, en orden de versión, cada una por separado en el SQL Editor** (todas re-ejecutables; ninguna mezcla políticas con un
   `alter` de tabla en uso): `20261014220000`, `223000`, `224000`, `225000`, `231000`, `235000`; `20261015000000`, `010000`, `011000`,
   `012000`, `013000`; `021000` y `024000` en la misma tanda («Separar» escribe en `esperas_web`); `022000`, `023000`, `025000` (exige la
   `013000` nueva), `030000`, `031000`, `032000`; `041000`, `042000` (exige `20261013200000` y siguientes de main); `044000`, `045000`;
   `051000`, `052000`, `053000` (PARTE 1 sola y después PARTE 2); `054000` (se puede pegar antes, sola: ya no depende de la tienda),
   `055000`, `060000`; y las de la tanda en construcción. Antes de cada una, preguntarle a la base si ya está.
3. **El rol `tienda_web`:** su usuario con contraseña (como `tienda_web_local`, con `statement_timeout`), creado por Felipe o con su OK.
4. **Publicar la web del ERP de la rama**, después la tienda con sus crons (`apps/tienda/vercel.json`: el barrido de cuentas cerradas) y el
   del ERP (cierre de pedidos sin confirmar cada 15 min).
5. **Configurar antes de abrir:** Configuración ▸ Tienda web (qué tiendas se ven, su WhatsApp, dirección y horario), las cuentas de cobro de
   cada tienda (Yape, Plin, transferencia), los módulos `vitrina_web` y `pedidos_web` a los roles que los atiendan, y la Vitrina.
6. **La boleta real por Lucode:** solo con el OK de Felipe y después de hablar con su contador (abajo).
7. **Después:** `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

### Pendientes que no son de construcción

- [ ] **Datos que la web necesita:** prendas etiquetadas en las campañas (hoy: Aniversario 1, Estreno 2, Últimas unidades 3, Para liquidar
  0), fotos de las 26 prendas sin foto y foto propia de los colores que no la tienen (no hay precio web: ADR-0408 act. c).
- [ ] **Decisiones abiertas:** la dirección de la web; los envíos, cuando se retomen (quién reparte y quién paga el reenvío).
- [ ] **Boleta por Lucode:** toca comprobantes y SUNAT; se transmite a SUNAT real solo con el OK de Felipe.
- [ ] **Con el contador, antes de abrir:** si un adelanto cobrado antes de entregar pide su propio comprobante (hoy la boleta sale una
  vez, al quedar pagado completo, como en Apartados); los asientos de la cuenta 122 («Adelantos de clientes») y la mercadería vendida sin
  entregar; y la nota de crédito al anular un pedido pagado.
- [ ] **Textos finales:** la política de privacidad y los términos del Club siguen en borrador; publicar `club_textos` v3 con la regla de 3
  años nueva («desde tu última compra o tu última entrada a tu cuenta web»).
