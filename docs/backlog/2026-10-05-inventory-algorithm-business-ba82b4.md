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
- [x] **Diciembre 2026 (ADR-0349):** Compras ▸ Plan de campaña: tres escenarios por categoría, cuantil crítico, curva propuesta; en enero muestra lo vendido de verdad. Migración `20261005220000` **sin pegar**. Probado: SQL 6/6, vitest 45, navegador local (guardar de punta a punta).
- [ ] **Llenar el plan de diciembre (Compras/Felipe)** antes de comprar; en enero, mirar la columna «Lo que pasó» y anotar qué se aprendió para la etapa 4.
- [ ] **Etapa 5 — Rebajas por grupo:** una elasticidad por categoría, después de una liquidación registrada.
- [x] **Venta perdida con la prenda exacta (ADR-0348):** `pedidos_no_atendidos.variante_id` + `registrar_pedido_no_atendido` con `p_variante_id` (migración `20261005212000`, **sin pegar**, va ANTES de `20261005215000`); Vender y Cambios mandan la variante; `fn_demanda_sede` suma «buscó y no había» con prenda a su grupo. Probado: SQL L1/L2, pedidos-no-atendidos 20/20, club-se-probo 22/22 (ajustada a la firma de 8), vitest, 375 px.
- [ ] **Avisarle a Dany (Felipe):** ADR-0348, sección «Para Dany». Antes de pegar `20261005212000` en producción.
- [ ] **Orden de pegado en producción (con el OK de Felipe):** `20261005210000` → `20261005212000` → `20261005215000` → `20261005220000`, y después publicar la web. Luego `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

### Contrato para Inventario ▸ Tareas (ADR-0345): talla rota y traslados con cantidad (etapa 2)

Felipe decidió el 2026-10-05 que la tienda vea estas dos recomendaciones en la columna «Sugerencias» de Tareas, no en
Existencias. La sesión de Tareas se cerró sin subir su rama, así que esto queda escrito para quien la retome cuando Tareas
esté en main.

- **La puerta:** usar `getPreparacionMotor(sede)` (`lib/motor-demanda.ts`).
  - Si `!puedeHablar`, Tareas muestra `fraseDelMotor(p)` y no sugiere nada.
  - Si `falla` no es null, no muestra la línea.
- **La cifra:** `fn_demanda_sede(sede, 28)` + `ritmosDePrendas` / `gruposDeDemanda` (`lib/demanda-reglas.ts`). Es la misma
  cifra que usa Producción.
- [ ] **Talla rota:** por modelo y color en la sede, la talla central (`esTallaCentral`, `piso-plan.ts`) sin piso.
  - El origen se elige en este orden: el almacén propio (si la sede está cuadrada) → otra sede (`fn_stock_por_sede`) →
    «retírala del piso».
  - Una regla nueva, `tallaRota(...)`, va en `lib/demanda-reglas.ts`, con su prueba.
- [ ] **Traslado con cantidad:** cuánto puede ceder la sede A sin quedarse corta, con esta cuenta:
  `libre_A − ⌈ritmo_A × 14⌉ − 1 en el piso por talla`. La sede B lo vende en
  `⌈cantidad ÷ ritmo_B⌉` días.
  - Reemplaza a `cedibleDe` (`resumen-reglas.ts:407`), cuyo umbral de 10 casi siempre da 0.
  - Se abre `PedirAOtraSedeModal` con `lineas` y su `cantidad`.
- [ ] **Avisar a quien tenga Existencias** (sesión de olas, ADR-0328) antes de tocar `piso-plan.ts`.
