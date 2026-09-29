## 🧾 La grilla de Vender no se congela con el catálogo real (2026-09-29, hallazgo C4 del carril profundo) — solo web, sin migración; rama `claude/grilla-vender-no-se-congela`

- [x] **Ventana de la grilla:** `PuntoDeVentaCatalogo` pinta 60 tarjetas y suma otras 60 cuando un
      centinela al fondo entra a la vista (`IntersectionObserver`), en vez de las ~1.500 de golpe. Vuelve
      a la primera tanda al cambiar de categoría o de «Solo con stock».
- [x] **El sondeo de stock no repinta si no hay nada nuevo:** `mismoStock` (nuevo, en
      `lib/stock-en-vivo-reglas.ts`, con su prueba) compara la lectura de cada 10 s contra la anterior;
      si es igual, `useStockEnVivo` no avisa a la pantalla. Beneficia también a Apartados y Cambios, que
      comparten el mismo hook.
- [x] **El sondeo va siempre en serie** (`enParalelo: 1`): antes solo lo hacía la relectura puntual tras
      una venta; el sondeo periódico de TODA la sede pedía varias páginas a la vez, multiplicando las
      peticiones simultáneas de cada caja abierta sin acortar un sondeo que corre en segundo plano.
- [x] Verificado con un andamio temporal (sin Supabase local): 300 grupos sintéticos, a 375 px — arranca
      en 60, crece de a tandas hasta 300 al hacer scroll, se reinicia al cambiar de categoría, sin errores
      de consola. `pnpm typecheck`, `pnpm lint` y las 227 suites (152.700 casos) en verde. El andamio y su
      `.env.local` de mentira se borraron antes de cerrar la tanda.
- [ ] **Semana 1 (mayor riesgo, más tiempo de revisión):** memoizar cada tarjeta (`React.memo`) para que
      escribir en el buscador no repinte las que ya se ven — necesita antes volver estables por
      `useCallback` a `agregar()` y `onElegirTalla`, que hoy se recrean en cada render de
      `PuntoDeVenta.tsx` (1.600 líneas, con dinero real: no se toca la noche antes de abrir).
- [ ] **Semana 1:** el buscador especial (`filtrarPrendasV2`) para que "negro m" encuentre por las dos
      palabras sueltas — revierte a propósito una decisión ya tomada en ADR-0071 (a), así que necesita su
      propio análisis, no una noche.
