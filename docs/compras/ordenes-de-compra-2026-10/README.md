# Órdenes de compra — estado vivo (2026-10-15)

> **Esta sección manda sobre todo lo de abajo**, que queda como historia. Las decisiones 1–88 viven en
> `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`. Avance: **~96 de 100** (pesos 15/20/12/15/10/18/10; falta la fase 5b, ≈4).

## Estado al 2026-10-15

- **En `main` y en producción:** las fases 1, 2, 3, 4, 5a, 6 (PR #1055, con los cambios de /formidable de Fondos en #1088) y 7 completa:
  la parte 1 (la orden de insumos, #1019) y la parte 2 (el papel y la recepción en el Taller, **#1098, fusionado el 2026-10-15**; sus
  siete migraciones `20261015015000` … `20261015043000` y `20261015112000`, pegadas en orden y una sola vez, con las huellas iguales al
  banco). Detalle de la 7.2: ADR-0362, «Fase 7, parte 2», y `contrato-ordenes-de-insumos.md`.
- **Decisión 64 («Fijar un mínimo» del Plan con el módulo):** hecha el 2026-10-15 (`20261015141000`, con `pruebas:plan-compra-minimo`) y
  en producción (allá `20261015141027`, huella igual al banco); además, el plan se bloquea al sumar los mínimos, para que dos personas a la
  vez no pasen del 100 %.
- **Falta:**
  - **Fase 5b, la plata de «Nos debe»** (≈4; contrato `contrato-nos-debe.md`, decisiones 14, 24, 27 y 58–61): mueve dinero y toca la
    contabilidad; espera la lista aprobada por Felipe y, donde haga falta, al contador.
  - La lista de compras del Taller desde la orden de producción (decisión 62: después).
  - De Felipe, transversales: la coma decimal y el piso y techo de las fechas (los g2 de /chaos de la fase 7.2).
  - Pruebas con personas: repetir las ciegas sobre lo nuevo y probar con alguien del Taller que no hizo la orden.

## Historia: el estado del 2026-10-13 (13:00)

> Felipe NO cambió de cuenta: la misma sesión siguió (worktree `.claude/worktrees/rediseno-modulo-colaboradores-c962d9`). Las decisiones
> 1–64 vivían en el ADR-0362. Avance de entonces: ~76 de 100 (la fase 7 parte 1 ya estaba en producción).

## En producción (pegado y verificado por huella contra el banco)

| Fase | Versiones en producción | Verificación |
|---|---|---|
| 2 | `20261012223737` … `224301` (6 pegadas) | consulta de solo lectura (2026-10-12) |
| 3 | `20261013160428`, `160558`, `160649` | 43 de 45 piezas de 3–5a iguales; las 2 restantes son de forma (abajo) |
| 4 | `160945`; `20261013002000` en tres partes: `161225`, `161434`, `161543` | ídem |
| 5a | `161852` | ídem |
| 7, parte 1 | `20261013174954` (esquema), `20261013175242` (funciones) | **30 de 30** piezas iguales al banco |

Las 2 piezas de forma: `registrar_comprobante_orden` en producción no trae los comentarios internos con que se pegó la fase 2 (un
reemplazo anclado futuro sobre esa función NO debe anclarse en líneas de comentario) y dos columnas viejas de `compras` están en otro
orden físico.

## La fila hacia `main` (orden aprobado por Felipe el 2026-10-13)

| PR | Fase | Estado |
|---|---|---|
| #1006 | 2 | **FUSIONADA** (12:45) |
| #1034 | 3 | reemplaza a la #1014; abierta con la fase 2 ya en `main`: se fusiona apenas su CI esté en verde |
| #1035 | 4 | reemplaza a la #1015; tras la #1034: «Update branch» una vez, verde, fusionar |
| #1017 | 5a | tras la #1035: «Update branch», verde, fusionar (su «SQL pegado» compara de verdad con producción) |
| #1019 | 7, parte 1 | base `main`, lista, casilla «SQL pegado»; tras la #1017: «Update branch», verde, fusionar |

Cada una sale en ROJO a propósito hasta que entra la anterior: el candado de reservas (ADR-0381) no deja pasar números que reservó otra
rama. #1006, #1034 y #1035 llevan la casilla «El SQL se pega después de fusionar» (su SQL ya está pegado, pero las fases siguientes y la
#1022 se pegaron encima de sus funciones: ADR-0251, «otro PR pegado encima»); #1017 y #1019, la casilla «SQL pegado en producción».

**Lo que pasó el 2026-10-13 (para no repetirlo):** la #1015 se fusionó dentro de la rama de la fase 3 y la #1014 dentro de la de la fase
2 (GitHub ofrece fusionar una PR apilada en su base, no en `main`). La #1006 quedó con las fases 2, 3 y 4 y el candado de reservas la
bloqueaba. Con el OK de Felipe («Rebobinar la rama»), la rama de la fase 2 volvió a `8b9deeaaf` + `main` (push forzado protegido; la punta
anterior `e406c630e` quedó en la rama local `respaldo/fase2-con-fusiones-1213`) y las ramas de las fases 3 y 4 se rehicieron desde sus
puntas de antes (`a6fd08d54`, `87e989b8d`). Esas dos fusiones no traían contenido propio (comprobado por árbol). **Desde entonces toda PR
de la fila apunta a `main`**: así no hay una base equivocada donde fusionar, y el candado ordena la fila solo.

Al rehacerlas entró #1026 («una función, una pieza», rondas 6–8): las pantallas de las fases 2, 3, 4, 5a y 7 pasaron sus títulos a
`<TituloSeccion>`; las matrices talla × color y la hoja imprimible de la orden de insumos van marcadas `unificar-fijo` (como sus gemelas
en `main`); las huellas de las guías se regeneraron. Cambia cómo se ven, no qué hacen.

## Fase 7, parte 1: en producción

Felipe dio el OK explícito el 2026-10-13 («Sí: pega la fase 7 y sigue»). Antes de pegar, nada de la fase 7 existía en producción, ningún
módulo usaba la clave ni el orden 205, y existían todas las columnas y funciones que usa. Después de pegar, 30 de 30 huellas iguales al
banco (18 funciones, columnas y restricciones de las 3 tablas, 2 disparadores, el módulo, 3 acciones sin responsable, RLS y permisos).
Después de fusionar #1019: en Roles y accesos, darle «Órdenes de insumos» a quien compre para el Taller. Sigue provisional: destino
obligatorio de tipo taller, la unidad copiada en la línea, el insumo de cualquier proveedor, las cifras de la lista.

## /formidable (Felipe 2026-10-13: «Sí, así»), en una PR aparte cuando la fila esté en `main`

- Comprobante de una orden (`docs/formidable/compras-ordenes-comprobante.md`): las 3 — sin valores puestos (factura, crédito, IGV),
  botón «Registrar la compra», y buscar en todas las sedes (la orden de otra sede aparece con «Está en … · ver en todas las sedes»).
- Recibir un envío (`docs/formidable/recibir-envio.md`): la fila entera se toca y el botón dice el envío; «Es nueva» sin tallas
  marcadas; y en vez de guardar lo contado en el navegador (Felipe lo quitó de Recibir en ADR-0129), **un aviso antes de salir** si
  hay algo contado sin recibir.

## Lo que sigue, con las respuestas de Felipe del 2026-10-13 (la fase 6 con su lista de 9 actividades: APROBADA el 2026-10-13; se construye con `/construir`, una actividad por commit)

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
