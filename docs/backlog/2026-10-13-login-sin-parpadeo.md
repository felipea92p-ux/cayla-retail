## 🐦 Entrar sin ver el Inicio de paso (2026-10-13, ADR-0136 act. 2026-10-13 (e)) — solo web, sin migración; rama `claude/login-sin-parpadeo`

- [x] El login pregunta a `/api/aterrizaje` a dónde entra la cuenta y navega una vez, directo (sin pasar por `/` ni `router.refresh()`); la pantalla
  de destino se pide de inmediato y espera tras el velo del colibrí (`EsperaAlVelo`). Medido cuadro por cuadro en una versión de producción local con
  120 ms de latencia, en un banco propio: 0 cuadros en `/` y 0 con la app a la vista antes de la ventana en 6 cuentas (pantalla principal Existencias,
  Inicio, terminal de ventas, terminal administrativa, vista global sin y con Admin); la ventana se abre a los mismos ~1,8 s que antes.
- [x] Casos de borde en el navegador: contraseña equivocada, cuenta sin acceso (`?error=sin_persona`), «Salir» con el colibrí de vuelta, otra cuenta en
  la misma pestaña (también justo después de que un líder corta una terminal: no ve nada guardado de la anterior). `vitest` completo, `tsc` y `eslint`.
- [ ] **Sin probar en producción:** que Felipe entre desde su Mac, y una terminal de tienda desde la suya, y confirmen que ya no se ve el Inicio de paso.
