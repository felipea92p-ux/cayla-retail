## 📣 Club de clientas, tanda 1g — Avisos, Beneficios del club y conservación (2026-10-01, ADR-0288 act. g) — rama `claude/club-paso1g-avisos`

- [x] Clientas ▸ Avisos (`/clientas/avisos`, módulo `avisos_club`): lista por tipo, «Enviar» a WhatsApp Web + `registrar_aviso_enviado`, «Deshacer» 10 min, «Pidió BAJA», cifras, guía en el combo «Quién envía».
- [x] «Beneficios del club» (líder): %, compras, monto, días y escala 1–5, con guía y «Cambiar un beneficio publica una versión nueva de los términos».
- [x] Cron `GET /api/club/conservacion` (08:00 UTC) con `CRON_SECRET`, en `vercel.json` y `proxy.ts` (`lib/rutas-cron.ts`).
- [ ] **Integrar con la rama de base:** migración del módulo `avisos_club` (orden 75, `delegable = true`, sin rol) y tipos; quitar los casts `TODO tipos` de `lib/club-avisos.ts`, `lib/club-avisos-acciones.ts` y `app/api/club/conservacion/route.ts`.
- [ ] **«Enviados hoy» de verdad:** la cifra cuenta solo lo anotado desde que se abrió la pantalla; falta una lectura de `club_avisos_enviados` del día (por ejemplo `fn_club_avisos_enviados_hoy(p_ubicacion_id)`).
- [ ] **BAJA desde Avisos sin el módulo Clientas:** `registrar_baja_whatsapp` exige `clientas`; quien solo tiene `avisos_club` recibe el rechazo de la base. Decidir si la BAJA también se abre con `avisos_club`.
- [ ] **Ver en el navegador** (líder y una cuenta con solo Avisos): enviar, deshacer, BAJA, beneficios, y a 375 px.
- [ ] **Aviso de 15 días (G-16, propuesto):** «Beneficios del club» guarda al instante; si G-16 se aprueba, el cambio debería programarse o avisarse antes.
