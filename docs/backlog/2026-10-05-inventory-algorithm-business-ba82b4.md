## 🧠 Motor de demanda (2026-10-05) — investigación y diseño, sin código; rama `claude/inventory-algorithm-business-ba82b4`

Diseño: `docs/investigacion/2026-10-05-algoritmo-de-inventario.md`. Cada etapa se abre por una condición de los datos, no por fecha.

- [x] Investigación (empresas con fuentes, mapa del código, datos de producción) y decisiones de Felipe (umbral 90 %, sin historia, deciden los tres).
- [x] **Etapa 0 — La verdad (ADR-0346):** indicador por tienda «¿el sistema ya puede recomendar?» en CAYLA Global (90 % sostenido 14 días, piso cuadrado, almacén contado). `fn_motor_demanda_preparacion` (migración `20261005210000`), `lib/motor-demanda-reglas.ts`, `PreparacionMotor.tsx`. Probado: SQL 12/12, vitest 19/19, navegador local.
- [ ] **Sin pegar en producción:** `20261005210000_motor_demanda_preparacion.sql` (una función de lectura, una sola parte, sin políticas). Hasta entonces CAYLA Global dice «No se pudo leer…» en esa sección. Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Conectar a Inventario ▸ Tareas (ADR-0345, otra sesión):** su columna «Sugerencias» usa `getPreparacionMotor(sede)` + `fraseDelMotor`; lo conecta esa sesión.
- [ ] **Cargar el stock de AQP y LIM** (operación, no código): hoy AQP tiene 13 unidades y LIM 1.
- [x] **Etapa 1, primera mitad (ADR-0347):** `fn_demanda_sede` (migración `20261005215000`, **sin pegar**) + `lib/demanda-reglas.ts` (ritmo apoyado en el grupo, K = 14) + bloque «Lo que dice el motor de demanda» en Nueva orden de producción, al lado de la curva de siempre. Probado: SQL 9/9, vitest 22/22, navegador local (estado «todavía no recomienda»).
- [ ] **Etapa 1, segunda mitad:** que el motor del piso, Análisis y Frescura lean `fn_demanda_sede` (tienen dueños activos: coordinar).
- [ ] ~~Etapa 1 — Una sola cifra:~~ (partida en las dos de arriba) `fn_demanda_*` (ventas + venta perdida ÷ días con la talla expuesta) y agrupación categoría × talla × familia de color × sede (peso n/(n+k)); piso, Análisis y Frescura leen de ahí. Se abre con ≥ 90 % de venta identificada durante 14 días en la sede.
- [ ] **Etapa 2 — Lo huérfano a la vista:** talla rota en Existencias; traslados sugeridos con cantidad (`planDeReposicion`, `cedibleDe`); «Se vendió rápido y falta» (`piso-plan.ts:459`) en Producción.
- [ ] **Etapa 3 — Probar y repetir con el Taller:** lectura a 14 días de cada lote contra su categoría.
- [ ] **Etapa 4 — Compras por campaña:** presupuesto por categoría y cantidad por cuantil crítico. Espera una temporada completa (no hay historia fuera del ERP).
- [ ] **Diciembre 2026:** hoja de supuestos por categoría para la compra, y comparación con lo real en enero.
- [ ] **Etapa 5 — Rebajas por grupo:** una elasticidad por categoría, después de una liquidación registrada.
