# Órdenes de compra — traspaso del 2026-10-13 (9 am): dónde quedó

> Felipe cambia de cuenta de Claude el 2026-10-13 a las 9 am. **Esta sección manda sobre todo lo de abajo** (lo de abajo es el traspaso
> del 2026-10-10, que queda como historia). Las decisiones 1–64 viven en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`; las
> 51–64 son de esta mañana. Avance: **~72 de 100** (pesos 15/20/12/15/10/18/10).

## Estado al 2026-10-13, 12:00 (actualizado al cambiar de cuenta)

**En producción (pegado y verificado el 2026-10-13 con el OK de Felipe):** fases 2, 3, 4 y 5a. Fase 7 parte 1: NO.
Verificación: cada migración pasó su bloque final; además, la huella md5 de las 38 funciones y las columnas de 7 tablas que tocan las
fases 3–5a coincide con el banco (43 de 45; las 2 restantes son de forma y vienen de antes: `registrar_comprobante_orden` en producción
no trae los comentarios internos con que se pegó la fase 2 —un reemplazo anclado futuro sobre esa función NO debe anclarse en líneas de
comentario— y dos columnas viejas de `compras` están en otro orden físico). Versiones en producción: fase 3 `20261013160428`, `160558`,
`160649`; fase 4 `160945` y `20261013002000` en tres partes (`161225`, `161434`, `161543`); fase 5a `161852`.

| PR | Qué | Estado |
|---|---|---|
| #1006 | fase 2 | lista; rama al día con `main` (19412d276); «SQL pegado» en ROJO (ver abajo) |
| #1014 | fase 3 | borrador; su rama TODAVÍA choca con `main` (`lib/modulos.test.ts`) |
| #1015 | fase 4 | borrador; su rama TODAVÍA choca con `main` (`lib/modulos.test.ts` y `lib/guias/pantallas/inventario.ts`) |
| #1017 | fase 5a | lista, **base `main`** (se cambió hoy); rama al día con `main` (107cfe810); casilla «después» puesta hoy |
| #1019 | fase 7, parte 1 | borrador, base rama de la fase 5; rama al día (77d74e8d3); su SQL NO está pegado |
| #1025 | volcado con las fases 3–5a | lista, CI verde: se puede fusionar ya (solo docs) |
| #1018 | volcado con la fase 2 | FUSIONADA |
| #1022 | Plan de campaña «un plan por año» (otra sesión) | su SQL se pegó en producción, la PR sigue abierta; su «SQL pegado» pasa solo cuando la fase 2 esté en `main` |

**Por qué «SQL pegado» falla (y no es un error del SQL).** El control compara producción con `main` + la PR. Las fases se pegaron todas
juntas y encima de ellas la #1022, así que cada PR ve en producción la versión FINAL de funciones que la PR deja en una versión anterior
(ADR-0251, «otro PR pegado encima»). Y hay un segundo candado: cada número de migración y de ADR solo entra a `main` por la PR de la rama que
lo reservó (`scripts/reservar/reservas.mjs`, usa `GITHUB_HEAD_REF`), así que una PR no puede llevar las fases de otras ramas. Por eso:

**Lo que Felipe aprobó el 2026-10-13 (y falta hacer):** fusionar EN FILA #1006 → #1014 → #1015 → #1017, con la casilla «El SQL se pega
después de fusionar» y su nota en #1006, #1014 y #1015 (el SQL YA está pegado; la casilla solo evita que el control compare contra una
producción que ya va más adelante). Pasos:
1. Poner al día las ramas de las fases 3 y 4: en la de la fase 3, `git merge origin/claude/purchase-order-phase2-9b0c82` (debería entrar
   limpio: la fase 2 ya resolvió `modulos.test.ts`); en la de la fase 4, `git merge` de la fase 3 ya al día y resolver
   `lib/guias/pantallas/inventario.ts` IGUAL que se resolvió en la fase 5: queda la guía `GUIA_RECIBIR_ENVIO` y sale la copia vieja de
   `GUIA_PLAN_DEL_PISO` («Gestión», ADR-0392, la movió a `gestion.ts`); en `modulos.test.ts`, las rutas de `/gestion/…` más lo de la
   pila. Después, la fase 4 dentro de la 5 y la 5 dentro de la 7. Probar `lib/modulos.test.ts`, `lib/menu.test.ts`, `lib/guias.test.ts`,
   `lib/guia-de-foco.test.ts` y `tsc` (los errores de `.next/dev/types` son restos del servidor de pruebas, no del código).
2. En #1006, #1014 y #1015: cambiar `- [x] **SQL pegado en producción.**` por `- [x] **El SQL se pega después de fusionar** — en realidad
   YA ESTÁ pegado…` con la nota (la de la #1017 sirve de modelo). Que no quede ninguna línea marcada con «SQL pegado en producción»: el
   control mira primero esa. Pasar #1014 y #1015 a «lista» (`gh pr ready`).
3. En #1017, volver a la casilla «SQL pegado en producción» (cuando las fases 2–4 estén en `main`, la comparación real le da verde).
4. Felipe fusiona con «merge commit», una por una, esperando el verde de cada una (~5 min): #1006 → #1014 → #1015 → #1017. Al fusionarse
   cada una, GitHub apunta la siguiente a `main` sola (el repo borra la rama al fusionar). Después, la #1022 (vuelve a correr su control y
   pasa) y la #1025.

## Fase 7, parte 1 (#1019): falta el OK de Felipe para pegar

Felipe confirmó el menú (decisión 52) y el precio al recibir en el Taller (53). Sigue provisional: destino obligatorio de tipo taller, la
unidad copiada en la línea, el insumo no restringido al proveedor y las cifras de la lista. Con su OK: pegar `20261013035000` →
`20261013040000` (una parte cada una; por MCP `apply_migration`, verificar con huellas contra el banco como se hizo con las fases 3–5a), marcar
«SQL pegado» en #1019 y fusionarla después de la #1017.

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
