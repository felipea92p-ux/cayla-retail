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
- [ ] **Fase 2 · unir una factura a una llegada ya recibida** — contrato nuevo, se propone a Felipe antes de escribirlo. Tabla nueva llegada
  (`lotes`) ↔ línea de factura (`compra_items`), porque `movimientos` no se edita; una factura ↔ varias llegadas de varias sedes, con el candado
  `compras_no_sobrerecibida`; recalcula el costo de la prenda al unir; todo o nada; firma quien ve el dinero de Compras.
- [ ] **Verificar en producción tras publicar:** `/recibir` abre en la puerta; `/inventario/por-regularizar` muestra 247 (o la cifra del día) y
  el botón de Existencias el mismo número; `/inventario/recibir` y `/recibir?vista=por-regularizar` redirigen. Recargar las tablets (la cola sin
  conexión de `/inventario/recibir` sube igual: misma RPC `recibir_lote`).
- [ ] **Abierto de antes, sin cambio:** la lista «Contra factura» del historial lee todas las sedes que se pueden operar mientras el encabezado
  dice una (tarea #8 de `docs/pantallas/recibir.md`); hoy sin consecuencia (0 recepciones contra factura).
