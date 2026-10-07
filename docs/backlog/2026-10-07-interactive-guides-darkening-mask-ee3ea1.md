## 🎬 Guías interactivas con máscara (2026-10-07, ADR-0362) — web + 1 migración (NO en producción); rama `claude/interactive-guides-darkening-mask-ee3ea1`

- [x] Motor con velo y recorte (`components/guias/GuiaInteractiva.tsx`), piloto que nunca guarda (`piloto.ts`, `lib/guias/reglas.ts` con prueba), tokens y modo oscuro, `prefers-reduced-motion`.
- [x] Oferta una vez por persona y pantalla (`MotorGuias`, `retail.guias_vistas`, respaldo en el navegador) y «Demo» en Mi perfil (selector por módulo y submódulo; lo sin guía dice «Pronto»).
- [x] Guías de Punto de Venta, Apartados, Historial y Comprobantes; recorridas con `guias:recorrer` en escritorio claro y a 375 px en oscuro, sin escrituras.
- [x] Candado del CI por controles (`lib/guias.test.ts`, `guias/escaner.mjs`, `lib/guias/huellas/`), skill `/guia`, regla en CLAUDE.md, casilla del PR.
- [ ] **Producción:** pegar `supabase/migrations/20261007180000_guias_vistas.sql` (una parte, re-ejecutable, sin políticas ni `alter` de tablas en uso). Hasta entonces la oferta se recuerda por navegador.
- [ ] **Decisión de Felipe:** las terminales no tienen Mi perfil; ¿dónde va «Demo» para ellas (la cabecera)?
- [ ] **78 pantallas pendientes** (`PENDIENTES_HOY` en `lib/guias/registro.ts`): `/guia <módulo>`, módulo por módulo, con el OK de Felipe.
- [ ] Probar con 3 a 5 colaboradoras reales en la tienda (que la demo se entienda sin explicación, ADR-0350).
