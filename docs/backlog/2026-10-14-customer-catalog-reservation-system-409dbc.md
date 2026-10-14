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

1. **La tienda existe y se publica sola** — `apps/tienda` con la marca de la maqueta y su portada, que lee la campaña vigente por la
   puerta angosta (rol `tienda_web` + `tienda_portada`); CI, ganchos y candados extendidos a la app nueva. Demostrable: la portada en
   local con la campaña de la base; CI verde. (1)
2. **Crear cuenta, entrar, olvidé mi contraseña y salir** — proyecto de clientes en local, `cuentas_web` + `tienda_registrar_cuenta`
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
6. **Configuración ▸ Tienda web** — WhatsApp, dirección y horario por sede; plazos y umbrales. Demostrable: cambiar el WhatsApp de una sede
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

### Pendientes que no son de construcción

- [ ] **Datos que la web necesita:** prendas etiquetadas en las campañas (hoy: Aniversario 1, Estreno 2, Últimas unidades 3, Para liquidar
  0), fotos de las 26 prendas sin foto, foto propia de los colores que no la tienen y el precio web de cada modelo.
- [ ] **Decisiones abiertas:** la dirección de la web; los envíos, cuando se retomen (quién reparte y quién paga el reenvío).
- [ ] **Boleta por Lucode:** toca comprobantes y SUNAT; se transmite a SUNAT real solo con el OK de Felipe.
