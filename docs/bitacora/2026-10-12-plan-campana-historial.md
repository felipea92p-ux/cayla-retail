## 2026-10-12 — Plan de campaña: lista por año, historial y propuestas (ADR-0372, C1–C6)

- **C1 hecho (solo web):** el selector agrupa «En curso», «Por venir · año» y «Terminadas» (solo del último año; las más viejas irán al Historial, C3) y,
  sin `?plan=`, abre la campaña que toca hoy (en curso → próxima → última terminada), no la de inicio más lejano. Regla pura `campanaQueAbre` /
  `campanasDelSelector` (`lib/plan-compra-reglas.ts`, sección 17) con su prueba; verificado en local (abre «Diciembre 2026», no «Galentine's Day 2027»).
- **Base local:** `fn_planes_compra` estaba sin la parte de B5 (la columna sí); se aplicó `20261012120000` (ya en producción), que entró limpia.
- **Decisiones de Felipe (2026-10-12):** ×3 mientras no haya análisis; después, punto medio entre «normal × multiplicador real de la tienda» y lo vendido en
  la misma campaña el año anterior, salvo si esa categoría se agotó (entonces solo normal × multiplicador). Flojo = el mes más bajo de los últimos 6.
  Lo que sobra = un % de CAYLA, distinto por categoría si hace falta, medido después. Sinatra entra como historia de soles por tienda (KIDS y Sodalita no).
