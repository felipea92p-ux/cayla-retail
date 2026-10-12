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
