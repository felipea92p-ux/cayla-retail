## 🔔 Aviso «hay una versión nueva de CAYLA» (2026-10-15, ADR-0422) — solo web, sin migración; rama `claude/stale-version-notification-7f9461`

- [x] `next.config.ts` graba `NEXT_PUBLIC_BUILD_ID` (el commit de Vercel; «desarrollo» fuera de Vercel); `GET /api/version` lo devuelve con `no-store`.
- [x] `<VersionNueva />` montada una vez en `app/(app)/layout.tsx`; reglas puras en `lib/version-nueva-reglas.ts` con su prueba (18 pruebas;
      suite completa de 504 archivos en verde; `tsc`, ESLint y Knip limpios).
- [x] Verificado en el navegador (pantalla de prueba y Punto de Venta real con cuenta local): aparece, «Más tarde» la calla y vuelve a los 30 min,
      «Actualizar» recarga; a 375 px y en oscuro.
- [ ] **Falta verificar en Vercel** con la protección de versiones activa (12 h): publicar este PR (A) y, con una pestaña abierta, esperar al
      siguiente (B): la franja debe salir en menos de 5 min. Si no sale, ver «SE ROMPE SI» del ADR-0422.
- [ ] **Recargar a mano, una vez**, las pestañas que estaban abiertas antes de publicar este PR: no traen el código del aviso.
- [ ] Decisión de Felipe: ¿hace falta distinguir una publicación importante de una menor? (6 por hora → riesgo de que se ignore). Opciones en el ADR.
