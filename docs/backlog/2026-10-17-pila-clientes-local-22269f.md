## 🧪 La pila local de clientes de la tienda vuelve a arrancar (2026-10-17) — rama `claude/pila-clientes-local-22269f`

Salió al probar la medición de la tienda (ADR-0447, PR #1179): sin la pila de clientes, la tienda local se quedaba reintentando contra
127.0.0.1:58421 y páginas como Recomendaciones no salían de su esqueleto. Sin migraciones ni cambios de la tienda publicada.

### Hecho

- [x] `pnpm --filter tienda pila` / `pila:parar` / `pila:llaves`, con la CLI de Supabase fijada a la del CI (2.118.0); el README los usa.
- [x] `lib/pila-local.test.ts`: los tres scripts usan la versión del CI, que es 2.115 o más nueva, y el README no vuelve a `npx supabase` a secas.

### Sigue pendiente

- [ ] El paso 1 del README (la base local del ERP, `npx supabase start` en la raíz) tampoco fija la versión. Hoy arranca, pero corre el
  mismo riesgo: si se fija, que sea con la misma versión del CI.
