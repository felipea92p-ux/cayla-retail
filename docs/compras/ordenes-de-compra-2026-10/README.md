# Órdenes de compra — traspaso del 2026-10-13 (9 am): dónde quedó

> Felipe cambia de cuenta de Claude el 2026-10-13 a las 9 am. **Esta sección manda sobre todo lo de abajo** (lo de abajo es el traspaso
> del 2026-10-10, que queda como historia). Las decisiones 1–64 viven en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`; las
> 51–64 son de esta mañana. Avance: **~72 de 100** (pesos 15/20/12/15/10/18/10).

## La pila de ramas y PR (se fusionan EN ESTE ORDEN; cada una va encima de la anterior)

| Fase | PR | Rama | Base | En producción |
|---|---|---|---|---|
| 1 · orden de tienda | #973 fusionada | — | — | sí |
| 2 · de la orden al comprobante | **#1006, lista** (CI verde) | `claude/purchase-order-phase2-9b0c82` | `main` | **la base sí** (pegada el 2026-10-12) |
| — · diccionario con la fase 2 | **#1018, lista** (solo docs) | `claude/volcado-fase2-oc-9b0c82` | `main` | — |
| 3 · envío a la sede + «Sin comprobante» | #1014, borrador | `claude/purchase-order-phase3-9b0c82` | rama de la fase 2 | no |
| 4 · recepción en la sede | #1015, borrador | `claude/purchase-order-phase4-9b0c82` | rama de la fase 3 | no |
| 5a · «Nos debe» sin plata | #1017, borrador | `claude/purchase-order-phase5-9b0c82` | rama de la fase 4 | no |
| 7 (parte 1) · órdenes de insumos | #1019, borrador | `claude/purchase-order-phase7-9b0c82` | rama de la fase 5 | no |

Las cuatro en borrador tienen el CI en verde salvo «SQL pegado» (esperado: sus migraciones no están en producción). El repo borra la rama al
fusionar, así que al fusionar #1006 GitHub apunta #1014 a `main` solo, y así en cadena. Fusionar con «merge commit» (no squash).

## Lo primero que falta: pegar en producción (Felipe dijo «Sí, pégalas tú» el 2026-10-13 ~08:40 para las fases 3, 4 y 5a)

**No se pegó todavía** (Felipe cambió de cuenta). La sesión nueva **vuelve a pedirle el OK** antes de pegar (el permiso se dio en la
sesión anterior). Orden y archivos:
1. Fase 3: `20261012225000_compras_envios.sql` → `20261012230000_compras_por_repartir.sql` → `20261012235000_compras_sin_comprobante.sql`
2. Fase 4: `20261013001000_recepcion_de_envio_esquema.sql` → `20261013002000_recepcion_de_envio.sql`
3. Fase 5a: `20261013015000_nos_debe.sql`
4. Fase 7 parte 1 (Felipe confirmó el menú —decisión 52—; pegar cuando él diga): `20261013035000_ordenes_insumo_esquema.sql` → `20261013040000_ordenes_insumo_funciones.sql`

Cómo se hizo con la fase 2 (receta): proyecto de producción `vovjyyiafkxteijimpuy` (el de Dynamic; todo en el schema `retail`), cada
archivo ENTERO por MCP `apply_migration`, uno a la vez y en orden, y después de cada uno una consulta de solo lectura que compruebe lo
creado (funciones y tablas nuevas). Todas son de UNA parte, sin políticas, re-ejecutables (CLAUDE.md «Cómo aplicar SQL a producción»).
Los reemplazos anclados de las fases 3 (15) y 4 (1) se simularon contra producción, solo leyendo, el 2026-10-12: entran. Luego, en el
cuerpo de cada PR, la casilla `- [x] **SQL pegado en producción.**` con la tabla «Pegada | Archivo | Versión en producción» (como en
#1006): el check «SQL pegado» la comprueba contra producción. Y refrescar el diccionario (`datos:refrescar`, como en #1018).

## Lo que sigue, con las respuestas de Felipe del 2026-10-13 (planes listos; mostrar la lista y esperar su OK antes de codificar, `/construir`)

**Fase 6 · fondo por rendir y gastos del viaje (18)** — contrato `contrato-fondo-por-rendir.md`; decisiones 16, 20, 26, 29, 30, 32–35, 46 y
54–57. Nueve actividades: (1) base del fondo: `cuentas_dinero.persona_id`, tipos `entrega_fondo`/`devolucion_fondo`, módulo `fondos`
(Finanzas, delegable, sin rol), `entregar_fondo`/`devolver_fondo`, nadie se entrega a sí mismo; (2) Finanzas ▸ Fondos por rendir (tablero,
entregar, devolver; kit y spike de Finanzas, ADR-0195); (3) pagar desde «Mi fondo» en el comprobante de una orden al contado y en Por
pagar; si no alcanza, paga de su bolsillo y queda «CAYLA te debe» (32); (4) gastos del viaje: flete de compra (609) y viajes (631), sustento
(comprobante / planilla de movilidad con tope solo para taxi y cargador —55— / sin comprobante con motivo), ligados a la orden o al envío,
«Traerla costó S/ X», nunca al costo de la prenda (20); (5) «Tu fondo» en Órdenes de compra y en Inicio; (6) rendición: cuenta su efectivo,
cuadra o diferencia con motivo, el faltante sin explicación es deuda de la persona (54), la aprueba otra persona con Fondos (35) y la de un
líder un Admin distinto (33), cerrada se congela; (7) efectivo de S/ 2 000 o más: se deja, marcado «no deducible», con aviso (56);
(8) contabilidad: 1413, 609/631, faltante como cuenta por cobrar al trabajador (57, provisional hasta el contador); (9) cierre: guías, foco,
oscuro, 375 px, caos con plata, /formidable.

**Fase 5b · la plata de «Nos debe» (≈4)** — contrato `contrato-nos-debe.md`; decisiones 14, 24, 27 y 58–61. Cuatro actividades:
(1) «Pasar a saldo a favor»: documento interno ya, marcado «falta su nota de crédito» hasta que llegue la nota del proveedor (58; boleta,
nota de venta o sin comprobante: interno sin IGV); (2) «Depositó» desde la ficha del proveedor, con el módulo Proveedores (59); (3) devolver
una dañada al proveedor desde la cuarentena, la hace quien tiene Recibir (no solo el líder), queda como deuda «por reponer» (60);
(4) aviso del IGV en Inicio que no se oculta (61). Ojo: hoy el saldo a favor solo nace de una nota de crédito (`proveedor_creditos`); el
documento interno es una forma nueva y hay que cuidar el signo de `fn_saldo_favor_proveedor` y el Balance (ver el contrato).

**Fase 7 parte 2 · comprobante y recepción en el Taller (≈6)** — contrato `contrato-ordenes-de-insumos.md`; decisiones 17, 18, 25, 28, 29,
47, 52, 53, 62 y 63. Cuatro actividades: (1) el comprobante de la orden de insumos por `comprobantes_produccion` (con `orden_insumo_id`),
reglas de la fase 2; (2) recibir en el Taller contra la orden (lote + movimiento en la misma transacción, no más de lo pendiente,
3 decimales, idempotente), quien hizo la orden no la recibe (17), quien recibe ve y corrige el precio de esa orden (53); (3) lo que faltó
va a «Nos debe»; editar y anular suman «no con comprobante o recepción vivos»; (4) cierre. La lista de compras del Taller va después
(62); maquila y flete siguen como gastos (63).

**Sueltos:** «Fijar un mínimo» del Plan de campaña pasa a quien tiene el módulo (64): `guardar_plan_compra_minimo` (20261012164000) pide
hoy `fn_es_lider()`; reemplazo anclado + quitar `esLider` del botón en `components/plan-compra/PlanCampana.tsx` + caso en
`pruebas:compras-llave`. Las 6 propuestas de /formidable (`docs/formidable/compras-ordenes-comprobante.md` y `recibir-envio.md`) siguen
esperando el OK de Felipe (no se preguntaron). Una cuenta con SOLO «Órdenes de insumos» ve su entrada como «Producción» y solo parada en
un taller (backlog de la fase 7).

## El banco de pruebas (para seguir probando en local)

Base aislada `supabase_db_cayla-oc` (puerto 57722, Docker) con todas las migraciones hasta la fase 7; servidor «oc-banco» en
`http://oc.localhost:3027` desde el worktree `.claude/worktrees/rediseno-modulo-colaboradores-c962d9` (DETENIDO la noche del 13 para
liberar memoria; para levantarlo, la entrada «oc-banco» de `.claude/launch.json`, que no se commitea). En ese worktree,
`apps/web/.env.local` apunta al banco: restaurarlo desde el checkout principal al cerrar la obra. Cuentas del seed (`apps/web/tema/cuentas.mjs`):
felipe@cayla.local (Admin y líder), sandra@cayla.local (líder), micaela@cayla.local (integrante; en el banco no puede firmar: no hay
asistencia). Para aplicar migraciones al banco: `npx supabase migration up --include-all --db-url "postgresql://postgres:postgres@127.0.0.1:57722/postgres?sslmode=disable"`
y `notify pgrst, 'reload schema'`. Muchas pruebas viejas tienen escrito `supabase_db_cayla-retail`: correrlas desde una copia con `sed`
apuntando al banco y borrarla después. No usar `pnpm` para correr cosas (reescribe `pnpm-lock.yaml`): `node`/`npx`.

---

# Órdenes de compra — traspaso de sesión (2026-10-10)

Sesión «Flujo de órdenes de compra» (2026-10-07 → 10), rama `claude/purchase-order-flow-6207e9`, worktree
`.claude/worktrees/determined-thompson-f7b8d8`. **Fue de diseño y preguntas: no hay código, ni migraciones, ni nada en producción.**

**Empieza por:** `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` (borrador; las decisiones 1–31 de Felipe y el mapa de
módulos). **Lo que diga el ADR manda sobre los anexos de esta carpeta**, que son salidas de workflows con diseños previos a
decisiones posteriores (cada anexo dice en su cabecera qué quedó superado).

## Estado al cerrar

- **Felipe aprobó las 7 fases** (decisión 31) y pidió el mapa de módulos; el mapa está en el ADR y en `mapa-de-modulos.md`.
- **Faltan 4 respuestas de Felipe antes de la fase 1** (al pie del mapa):
  1. Si no le alcanza el fondo frente al proveedor: bloquear el pago, o paga de su bolsillo y «CAYLA te debe» con recibo y tope (recomendado).
  2. Quién aprueba la rendición del fondo del propio líder: el Admin (recomendado) o se cierra sola.
  3. Precios del Taller: quien compra insumos ve los de SUS órdenes (recomendado) o solo compra el líder.
  4. Quién entrega fondos: solo el líder, o el módulo `fondos` delegable con «nadie se entrega a sí mismo» (recomendado).
- **Para el contador** (no bloquea programar): ver «Para el contador» en el ADR. Ojo con la decisión 20 (gastos de llegada fuera
  del costo): la NIC 2 los pone dentro.

## Las fases aprobadas

| Fase | Qué | Quién |
|---|---|---|
| 1 | Orden de compra de tienda: listado, crear (`OC-000001`, bloqueado), ver en modal, editar, anular, PDF | esta línea |
| 2 | Comprobante desde la OC (factura/boleta/nota de venta/«sin comprobante»), IGV, contado con pago, precio sugerido, parciales | esta línea |
| 3 | Envío a la sede: la general manda (una guía por sede); la de tienda → envío directo a su sede | esta línea |
| 4 | Recepción en la sede (contar, costo, faltantes, sobrantes, dañadas, prendas nuevas) | sesión de Recepción (reservó el ADR-0361, que en `main` quedó para Producción; hoy sin rama ni ADR) |
| 5 | Deudas del proveedor («Nos debe»): reposición, depósito o descuento; devueltas | esta línea |
| 6 | Fondo por rendir + gastos del viaje (aparte del costo), rendición «te quedan S/ X» | esta línea |
| 7 | Orden de insumos del Taller (`OI-`), proveedores del Taller, recibe el Taller | esta línea |

## Antes de escribir la primera línea de código

1. **La rama va 292 commits atrás de `origin/main`** (2026-10-10): sincronizar primero (en el escritorio, `sync_with_base_branch`).
2. **Numeración:** `ADR-0362` sigue libre (en `main` llegan hasta 0370, sin 0361/0362/0364). El rango de migraciones que se
   había reservado (`20261008100000`–`…109999`) ya quedó atrás de lo que entró a `main` (hasta `20261010150000`): elegir versiones
   posteriores a la última de `main` el día que se escriban, y revisar PRs abiertos (memoria «versión de migración repetida»).
3. **Menú:** Compras tiene tope de 6 hijas (`menu.test.ts:256`). «Órdenes de compra» cabe cuando Recibir mercadería pase a
   Inventario (ADR-0361, aún no en `main`): la fase 1 va después de esa sesión o junto con ella.
4. **Coordinar con la sesión «Recibir Mercadería»** (rama `claude/recepcion-mercaderia-inventario-16e55e`, no visible en `origin`
   ni en los worktrees de esta máquina al 2026-10-07): el contrato provisional está al final del ADR. Su migración en producción es
   `20261007182535_recibir_es_de_inventario` (solo cambió el grupo del módulo `recibir`); su archivo local `20261007120000` chocaba
   con `20261007120000_analisis_salio_al_piso.sql` (hoy en `main`).
5. Reglas del repo que aplican a cada pantalla: módulo nuevo nace solo para el líder (ADR-0161), guía de foco (ADR-0284),
   `/sugerir`, `/formidable`, `/chaos` en lo que guarda, `/unificar` (piezas únicas), modo oscuro (solo tokens), loader único,
   y Órdenes de compra a 375 px (se usa en Gamarra).

## Hechos de producción consultados (2026-10-07, proyecto `vovjyyiafkxteijimpuy`, schema `retail`)

0 compras, 0 `compra_items`, 0 envíos, 2 lotes, 87 marcas, 47 categorías; sedes Taller, Tienda TRU, Tienda AQP, Tienda LIM.
Volver a preguntarle a la base antes de afirmarlo de nuevo.

## Anexos

| Archivo | Qué tiene |
|---|---|
| `hechos-del-repo.md` | Modelo actual de Compras, catálogo, numeración, recepción; el brief contra el ERP |
| `contrato-v1-y-criticas.md` | Primer contrato con Recepción y dos críticas (consistencia, fidelidad) |
| `faltantes-y-sobrantes.md` | Casuística de cierre de una guía, críticas de dinero/SUNAT y de tienda |
| `fondo-y-gastos-del-viaje.md` | Flujo del fondo por rendir y la rendición, modelo de datos, anti-duplicado |
| `insumos-por-orden-de-compra.md` | Cómo entran los insumos a una orden (antes de decidir separarla de la de tienda) |
| `mapa-de-modulos.md` | Mapa final de módulos, los dos mapas que compitieron y sus juicios |

**El brief de Felipe** («CAYLA Retail · Brief de desarrollo: Compras y LIM Taller», 7 oct 2026,
https://claude.ai/artifact/2GE1cKibGDhCZFsQaY5XRV) no está en el repo: Felipe lo pegó en la sesión. Si hace falta, pedírselo.
El conector de documentos y el navegador integrado no lo abren (otra cuenta, pide sesión).
