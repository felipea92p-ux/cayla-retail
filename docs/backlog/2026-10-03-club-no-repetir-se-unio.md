# Backlog — club: actualizar datos desde el cartel (2026-10-03)

- **POR PEGAR (2026-10-03): `20261003235000` en producción** (sola, SQL Editor). Verificar: huella `e62ada5c57e772e4c0e3854cc8984ddb` y «QUEDÓ BIEN».
- **Decidir (Felipe):** ¿la página del cartel avisa ANTES de enviar «ya eres miembro: puedes actualizar tus datos»? Hoy lo dice recién al terminar («Actualizamos tus datos»). Es solo web.
- **Pruebas que fallan igual sin este cambio** (revisar aparte): `club_permisos m1`, `clientas_por_modulo_y_anonimizar 7a`, `club_aniversario/cumpleanos j1` (concurrencia con sesiones paralelas: celular de prueba mal formado / tiempos) y `g` (devolución no libera el vale/canje).
