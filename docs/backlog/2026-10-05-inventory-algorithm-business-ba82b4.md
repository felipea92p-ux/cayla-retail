## 🧠 Motor de demanda (2026-10-05) — investigación y diseño, sin código; rama `claude/inventory-algorithm-business-ba82b4`

Diseño: `docs/investigacion/2026-10-05-algoritmo-de-inventario.md`. Cada etapa se abre por una condición de los datos, no por fecha.

- [x] Investigación (empresas con fuentes, mapa del código, datos de producción) y decisiones de Felipe (umbral 90 %, sin historia, deciden los tres).
- [x] **Etapa 0 — La verdad (ADR-0346):** indicador por tienda «¿el sistema ya puede recomendar?» en CAYLA Global (90 % sostenido 14 días, piso cuadrado, almacén contado). `fn_motor_demanda_preparacion` (migración `20261005210000`), `lib/motor-demanda-reglas.ts`, `PreparacionMotor.tsx`. Probado: SQL 12/12, vitest 19/19, navegador local.
- [x] `20261005210000` en producción (2026-10-05).
- [ ] **Conectar a Inventario ▸ Tareas (ADR-0345, otra sesión):** su columna «Sugerencias» usa `getPreparacionMotor(sede)` + `fraseDelMotor`; lo conecta esa sesión.
- [ ] **Cargar el stock de AQP y LIM** (operación, no código): hoy AQP tiene 13 unidades y LIM 1.
- [x] **Etapa 1, primera mitad (ADR-0347):** `fn_demanda_sede` (migración `20261005215000`, en producción) + `lib/demanda-reglas.ts` (ritmo apoyado en el grupo, K = 14) + bloque «Lo que dice el motor de demanda» en Nueva orden de producción, al lado de la curva de siempre. Probado: SQL 9/9, vitest 22/22, navegador local (estado «todavía no recomienda»).
- [ ] **Etapa 1, segunda mitad:** que el motor del piso, Análisis y Frescura lean `fn_demanda_sede` (tienen dueños activos: coordinar).
- [ ] ~~Etapa 1 — Una sola cifra:~~ (partida en las dos de arriba) `fn_demanda_*` (ventas + venta perdida ÷ días con la talla expuesta) y agrupación categoría × talla × familia de color × sede (peso n/(n+k)); piso, Análisis y Frescura leen de ahí. Se abre con ≥ 90 % de venta identificada durante 14 días en la sede.
- [ ] **Etapa 2 — Lo huérfano a la vista:** talla rota en Existencias; traslados sugeridos con cantidad (`planDeReposicion`, `cedibleDe`); «Se vendió rápido y falta» (`piso-plan.ts:459`) en Producción.
- [ ] **Etapa 3 — Probar y repetir con el Taller:** lectura a 14 días de cada lote contra su categoría.
- [ ] **Etapa 4 — Compras por campaña:** presupuesto por categoría y cantidad por cuantil crítico. Espera una temporada completa (no hay historia fuera del ERP).
- [x] **Diciembre 2026 (ADR-0349):** Compras ▸ Plan de campaña: tres escenarios por categoría, cuantil crítico, curva propuesta; en enero muestra lo vendido de verdad. Migración `20261005220000` en producción. Probado: SQL 6/6, vitest 45, navegador local (guardar de punta a punta).
- [ ] **Llenar el plan de diciembre (Compras/Felipe)** antes de comprar; en enero, mirar la columna «Lo que pasó» y anotar qué se aprendió para la etapa 4.
- [ ] **Etapa 5 — Rebajas por grupo:** una elasticidad por categoría, después de una liquidación registrada.
- [x] **Venta perdida con la prenda exacta (ADR-0348):** `pedidos_no_atendidos.variante_id` + `registrar_pedido_no_atendido` con `p_variante_id` (migración `20261005212000`, en producción); Vender y Cambios mandan la variante; `fn_demanda_sede` suma «buscó y no había» con prenda a su grupo. Probado: SQL L1/L2, pedidos-no-atendidos 20/20, club-se-probo 22/22 (ajustada a la firma de 8), vitest, 375 px.
- [ ] **Avisarle a Dany (Felipe):** ADR-0348, sección «Para Dany». Antes de pegar `20261005212000` en producción.
- [x] **Las cuatro migraciones en producción (2026-10-05, OK de Felipe, por MCP):** `210000` → versión `20261005203539`, `212000` → `20261005203608`, `215000` → `20261005203655`, `220000` → `20261005203752`. Huellas de las 5 funciones idénticas a local; prueba de humo como líder (en transacción con rollback): las tres tiendas y el plan responden en ~0,5 s en total.
- [ ] **Pegar en producción `20261005223000_motor_demanda_preparacion_sin_sede.sql`** (arreglo del barrido de terminales; una función, una parte, OK de Felipe).
- [ ] **Publicar la web** (fusionar la rama): hasta entonces nada nuevo se ve; la web vieja sigue funcionando con la función nueva de pedidos.
- [x] **Diccionario refrescado (2026-10-05 20:50 UTC):** 164 relaciones y 891 funciones; 124 grupos nuevos o cambiados (de esta rama y de otras sesiones desde la foto del 3-oct), las 1.162 huellas coinciden con producción. `datos:comparar`: ninguna pantalla llama a una función con parámetros que producción no acepte. Aviario: 6 tablas nuevas con pájaro (`planes_compra*` → Pelícano; `capacidad_piso`, `bajadas_en_mano`, `prendas_para_enviar*` → Halcón).

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
