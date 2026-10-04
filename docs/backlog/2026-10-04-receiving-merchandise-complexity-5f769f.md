## 🚪 Recibir mercadería: una sola puerta «Llegó mercadería», la factura se une después (2026-10-04, ADR-0330) — solo web, **sin SQL**; rama `claude/receiving-merchandise-complexity-5f769f`

Producción el 2026-10-04 (solo lectura): `compras`, `lotes`, `envios` = 0; todo el stock (789 u) entró por `carga_inicial`; 247 ventas sin
registrar pendientes (AQP 170 con 14 u cargadas; TRU 77). Decisión de Felipe: una sola puerta con la factura como opción, y las ventas sin
registrar a Existencias.

- [x] **0 · ADR-0330** y fila en `SESIONES-ACTIVAS.md`.
- [x] **1 · La puerta** (`LlegoMercaderia.tsx`, `lib/llegada-reglas.ts` + prueba): proveedor con sus marcas, buscador que suma una prenda por
  lectura, quién recibe, `recibir_lote` sin cambios. Guía de foco: `/recibir` pasa a `aplicada`.
- [x] **2 · La factura como opción:** «¿Viene con su factura?» si el proveedor tiene facturas que le faltan a la sede → `?vista=factura&compra=`.
  Sugerida en la guía, no bloquea. El aviso del Inicio «Recibe N facturas» lleva a la vista contra factura.
- [x] **3 · «Llegó esta semana»** y aviso de la misma caja dos veces (`getRecepcionesRecientes` filtra por sede y fecha en la base).
- [x] **4 · Ventas sin registrar en `/inventario/por-regularizar`** (módulo `existencias`), botón con número en Existencias
  (`lib/por-regularizar-cuenta.ts`), redirect del enlace viejo, avisos del Inicio y del Observatorio. `PorRegularizarLista.tsx` y
  `lib/por-regularizar*.ts` **sin tocar** (los edita la actividad 5 de ADR-0328, avisada).
- [x] **5 · Puertas viejas cerradas:** `/inventario/recibir` redirige; fuera `RecibirLotePanel`, `RecepcionFormV2`, `getResumenSinComprobante`;
  `/recibir` sin pestañas ni «Recibiendo en»; el historial suma «Sin factura» con «Sin costo» para quien ve el dinero. Contadores: guía de foco
  67, sugerencias 64. `pnpm datos:comparar`: nada de Recibir sin respaldo (el único aviso es `agregar_celular_clienta`, ajeno).
- [x] **Aviso «Llegadas sin factura»** (Felipe 2026-10-04: «aviso ahora, unión después»): Inicio de quien ve «Facturas de proveedor»
  (fuente `sinFactura` en `lib/inicio.ts`) y Observatorio del Admin. Llegadas sin factura de 7 días o más dentro de los últimos 60
  (`llegadasSinFacturaPorAvisar`, `lib/llegada-reglas.ts`); si `recepciones_sin_comprobante` llega a su tope de 200, dice «puede haber
  más». Visto en el Inicio con la base local (llegada de prueba corrida al 20-sep y devuelta a su fecha). El del Observatorio no se vio en
  pantalla: en local el Observatorio no carga (le faltan funciones de ventas a la base local); pasa tipos y pruebas.
- [ ] **Fase 2 · unir una factura a una llegada ya recibida — diseño DECIDIDO (ADR-0330), se construye cuando llegue la primera factura
  tarde** (hoy 0 facturas en producción). Movimiento `union_factura` sin efecto en stock con `compra_item_id` + `lote_id`; RPC
  `unir_llegada_a_factura` todo o nada con la llegada bloqueada; deshacer = unión negativa (solo la atribución, el costo no se revierte);
  revaloración del costo sobre el stock que queda; origen nuevo en `costo_historial`; ajustar `getRecepcionesRecientes` (suma todo el
  lote) y el balance de mercadería de Finanzas; marcar «esta no tendrá factura». SQL en 2 partes.
- [ ] **Verificar en producción tras publicar:** `/recibir` abre en la puerta; `/inventario/por-regularizar` muestra 247 (o la cifra del día) y
  el botón de Existencias el mismo número; `/inventario/recibir` y `/recibir?vista=por-regularizar` redirigen. Recargar las tablets (la cola sin
  conexión de `/inventario/recibir` sube igual: misma RPC `recibir_lote`).
- [ ] **Abierto de antes, sin cambio:** la lista «Contra factura» del historial lee todas las sedes que se pueden operar mientras el encabezado
  dice una (tarea #8 de `docs/pantallas/recibir.md`); hoy sin consecuencia (0 recepciones contra factura).
