## 💸 Gasto de GitHub Actions (2026-10-05, ADR-0345) — solo CI, sin migración; rama `claude/analisis-cobros-aefa9e`

- [x] Diagnóstico: los cobros son minutos de Actions (repo privado, $0,008/min). ~6.770 min del 1 al 5 de oct; proyección ~42.000
      min/mes (~$330 medido, ~$290 neto de lo incluido). Cifras y reparto por job en el ADR-0345.
- [x] El push a `main` ya no repite lo que el PR corrió (ADR-0345): ~1.020 min menos en 5 días (~$50/mes). Probado con
      `scripts/ci/alcance.test.mjs` y simulando la regla sobre los 111 commits reales de `main`.
- [ ] **Sin probar en GitHub:** el primer push a `main` tras fusionar este PR. Debe verse en el log de «Qué toca el PR» la línea
      `push a main «…» → alcance «…», verificar «no»`, y «Tipos, lint y pruebas» saltado. Si sale rojo o corre de más, avisar.
- [ ] **Lo que queda (decide Felipe, cada uno ahorra menos que lo hecho o cuesta algo):**
  - CI de PR en borrador: que las ramas abiertas como «draft» no corran CI hasta marcarlas listas (los PR pesan el 64 %).
  - Cachear las imágenes de Docker de Supabase en «Pruebas de RPC» (`supabase start` = 83 s por corrida); hay que probarlo en GitHub.
  - Menos pushes por rama (hoy 2,86 corridas por rama): cada corrección empuja y vuelve a pagar el CI completo.
  - Tope de gasto en GitHub ▸ Billing ▸ Budgets, para que un mes malo no sorprenda.
  - Hacer público el repo (Actions gratis): NO recomendado sin auditar el historial; ver ADR-0345 «Qué se descartó».
- [ ] **«Deriva diaria» falla todos los días** (al menos desde el 29-sep): cuesta ~10 min al mes, pero esa alarma de producción
      contra `main` no está avisando nada. Causa sin investigar.
