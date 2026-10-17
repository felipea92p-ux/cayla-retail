## 🔔 La campanita de la tienda y el aviso al celular (2026-10-17, ADR-0448) — campanita sin migración; rama `claude/notificaciones-nuevos-ingresos-906b8b`

- [x] **Actividad 1 y 2 — la campanita en la cabecera** (`apps/tienda`): globo + panel con «las tallas que esperabas» que ya llegaron y «lo nuevo
      desde tu última visita». Sin migración. Verificada en banco temporal (escritorio y 375 px, claro y oscuro); 548 pruebas, tipos y lint.
- [ ] **Mirar la campanita con una cuenta real** (la parte de servidor no se vio con sesión). **La tienda no tiene publicación de prueba**
      (ADR-0408; Vercel la omite en los PR): o en local con la pila de clientes (README «Levantarla en local») y datos de prueba, o en
      producción justo después de fusionar, con una cuenta que tenga un «Avísame» ya llegado.
- [ ] **Decidir (Felipe) para seguir con el aviso al celular:** (1) dependencia `web-push` y 3 variables en Vercel (claves VAPID y contacto);
      (2) si se actualiza el texto de privacidad del Club (hoy promete solo WhatsApp); (3) la enmienda a ADR-0431: registrar `sw.js` también
      en iPhone instalado.
- [ ] **Actividad 3 — base:** migración (reservar con `pnpm reservar migracion`) con `push_suscripciones`, `push_envios` (único por espera y
      aparato) y las funciones `tienda_push_*` y las del trabajo programado, con la regla de «hay» de la ficha. Prueba de Postgres
      (`pnpm pruebas:tienda-club` o una nueva en `PRUEBAS`). Producción solo con OK, en una parte.
- [ ] **Actividad 4 — celular:** `push` y `notificationclick` en `public/sw.js`, botón «Activar avisos» (tras «Avísame» y en «Mi perfil»),
      guía de iPhone.
- [ ] **Actividad 5 — envío:** `/api/avisos-push` cada 15 min (`lib/cron.ts`, `vercel.json`, `CRON_SECRET`); reintento si el servicio no
      responde; aparato muerto → desactivado; el envío se anota después del 2xx.
- [ ] **Actividad 6 — prueba en un Android y un iPhone reales** (la única que no se puede hacer en el escritorio).
- [ ] **Actividad 7 — cierre:** diccionario de datos (`pnpm datos:generar:produccion` solo tras pegar), `/chaos`, bitácora, README de la tienda.
- [ ] **No se hace sin decidir:** avisar novedades generales al celular (es publicidad: `publicidad_push`, mismo tope de 2 al mes, la BAJA apaga
      también el celular, revisión legal CL-34).
- [ ] **Visto de paso:** hoy no hay ningún «Avísame» vivo en producción (8 cuentas web, 11 miembros del Club). Conviene que alguien lo use y
      lo cuente antes de abrir el botón «Activar avisos» al público.
