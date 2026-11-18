## 🐦 Entrar después de «Salir» no se queda cargando (2026-11-16, ADR-0136 act. 2026-11-16) — solo web, sin migración; rama `claude/login-infinite-load-bug-552ccb`

- [x] Causa: la caché de rutas de Next aprendía «`/` es el login» con una precarga sin sesión al salir, y el login navegaba con esa nota. Visto en los
  registros de Vercel del 2026-11-16 (22:11 UTC) y reproducido en un banco propio (versión compilada, Chrome).
- [x] Arreglo: Server Action `marcarCambioDeCuenta` a la par de `/api/aterrizaje`; si no responde, página completa. El proxy no redirige el POST
  del login (`saleDelLogin`). Una cuenta sin acceso suelta la espera al volver al login. Regresión en `lib/login-aterrizaje.test.ts`.
- [x] Verificado en el banco: Chrome y WebKit, con y sin animaciones, dos pestañas, terminal → Felipe, contraseña mala, terminal desactivada.
- [ ] **Sin probar en producción:** que Felipe salga de su cuenta y entre con una terminal (Almacén o Caja de Trujillo) en la misma pestaña, y entre
  a la primera.
- [ ] **Visto de paso, sin tocar:** la cookie de la sede elegida (`cayla_ubicacion_activa`) sobrevive a «Salir»; un líder que entra después de otro
  queda parado en la sede (o en CAYLA Global) que eligió el anterior. Decisión de Felipe: ¿cada entrada empieza en la sede propia?
