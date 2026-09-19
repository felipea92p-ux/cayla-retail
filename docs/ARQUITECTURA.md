# Arquitectura de cayla-retail

> ⚠️ **Para el MODELO DE DATOS, este archivo ya no es la fuente.** Ve a
> **[`docs/datos/`](datos/README.md)**: ahí el diccionario se regenera desde la base real
> y no puede envejecer en silencio. Este documento sigue siendo el mapa del grafo
> rutas↔lib↔RPC del front, pero su foto del esquema quedó vieja — las afirmaciones que el
> SQL no respalda están listadas con archivo y línea en
> [`docs/datos/13-PROMESAS-INCUMPLIDAS.md`](datos/13-PROMESAS-INCUMPLIDAS.md).

> Mapa de referencia del sistema completo: negocio, stack, modelo de datos y
> el grafo de conexiones real entre rutas, componentes, `lib/` y la base de
> datos. Generado el 2026-09-04 leyendo el código fuente (no la visión de
> `CLAUDE.md`, que describe una arquitectura futura hipotética NestJS/Prisma —
> ver nota al final). Si el código cambia, este documento se desactualiza:
> no es la fuente de verdad, es un mapa para orientarse rápido.

---

## 1. Qué es CAYLA

CAYLA es retail de indumentaria y bisutería peruana con producción textil
propia: 3 tiendas (TRU-Trujillo, AQP-Arequipa, LIM-Lima) más un Taller en
Lima que corta, confecciona y termina prendas. Antes de este sistema, la
operación se llevaba en un Excel llamado "SINATRA" (ventas 2026 medidas ahí:
S/438k TRU, S/177k AQP, S/30k LIM). `cayla-retail` es el ERP que lo
reemplaza: inventario, ventas de tienda, producción del Taller y
contabilidad, todo sobre una misma base de datos.

CAYLA comparte dueño (Felipe) y algunas sedes con otro sistema, **cayla-
dynamic** (RR.HH. / personas), pero son dos repos y dos dominios de negocio
distintos que hoy conviven en el mismo proyecto de Supabase — ver §7.

---

## 2. Stack y decisión de arquitectura

| Capa | Tecnología |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend/servidor | Next.js (App Router: Server Components + Server Actions) |
| Base de datos | Postgres vía Supabase, **Row Level Security** + funciones RPC `security definer` |
| Tipos/validación compartida | `packages/shared` (Zod, enums), `packages/database` (tipos generados del schema) |
| Idioma del esquema | Español, tablas en `snake_case`, sin `tenant_id` |

**Decisión ya tomada (2026-07-16, documentada en `CLAUDE.md`):** no se migra
a NestJS + Prisma + inglés + `tenant_id`, que era el diseño de referencia
original. Se construye sobre lo que ya existe y está verificado:
**Next.js + Supabase con RLS**, tablas en español, CAYLA como único tenant
(la sede reemplaza la dimensión de aislamiento que en un SaaS multi-tenant
resolvería `tenant_id`). Esa combinación NestJS/Prisma queda como visión de
referencia para el día que CAYLA venda el sistema a otra marca — no es una
tarea pendiente de hoy.

---

## 3. Cómo se conecta todo (el grafo real)

```mermaid
flowchart TB
    subgraph Cliente["Navegador"]
        UI["Componentes 'use client'\n(components/*.tsx)"]
    end

    subgraph Next["Next.js App Router (apps/web)"]
        Rutas["Rutas — Server Components\n(app/(app)/**/page.tsx)"]
        Actions["Server Actions\n(app/actions/*.ts)"]
        Lib["lib/*.ts\nlectura + cálculo de negocio"]
    end

    subgraph DB["Postgres / Supabase — schema retail"]
        RPC["Funciones RPC\nsecurity definer"]
        Tablas["Tablas + RLS"]
    end

    UI -- "supabase.rpc(...) / insert-update directo" --> RPC
    UI -- "Server Action" --> Actions
    Rutas -- "await lib.getX(persona)" --> Lib
    Lib -- "solo SELECT" --> Tablas
    RPC -- "transacción" --> Tablas
    Actions --> Tablas
```

**Patrón consistente en todo el repo:**
- **Lectura** (armar una pantalla): la ruta (Server Component) llama a
  `lib/*.ts`, que hace `SELECT` puro contra Postgres. Ningún archivo de
  `lib/` escribe ni llama RPCs.
- **Escritura** (mutar dinero, stock o producción): el componente cliente
  llama **directo** `supabase.rpc('nombre_funcion', ...)`. Las mutaciones
  no pasan por `lib/`. La única excepción es `SedeSwitcher`, que usa la
  Server Action `cambiarSedeActiva` (cambia una cookie, no datos de negocio).
- Todos los imports de `lib/` usan el alias `@/lib` (0 imports relativos),
  y los tipos/enums compartidos vienen de `@cayla-retail/shared` y
  `@cayla-retail/database`.

### 3.1 Mapa por dominio (ruta → lib → componentes → RPC/tablas)

**Identidad y sede**
- `lib/persona.ts` (`requirePersonaActual`, cacheado) resuelve rol
  (`lider`/`integrante`) y sede activa desde `personas` + cookie
  `cayla_sede_activa`. Se usa en *todas* las rutas. El permiso real lo
  valida el servidor vía `fn_puede_operar_sede` — la cookie es solo UX.
- `(app)/layout.tsx` → `AppShell.tsx` (shell de navegación de todo el app) +
  `SedeSwitcher.tsx` → Server Action `cambiarSedeActiva`.

**Catálogo / inventario**
- `/inventario` → `lib/inteligencia.ts` (`getCatalogoInteligente`, reusa
  `lib/catalogo.ts:getCatalogoConStock`) → `InventarioAgrupado.tsx` →
  `MovimientoModal.tsx` → RPC `registrar_movimiento` (excluye venta a
  propósito, para no romper la trazabilidad caja↔movimiento).
- `/inventario/almacen` → `AlmacenStockList.tsx` → `BajarATiendaModal.tsx`
  → RPC `bajar_a_piso` (mueve de `stock_almacen` a `stock` de piso).
- `/inventario/recibir` → `lib/catalogo.ts` → `RecibirLoteForm.tsx` → RPC
  `recibir_lote` (la función más inestable del sistema, ver §6).
- `/inventario/compras` → `ComprasManager.tsx` (escribe directo en
  `ordenes_compra`, sin RPC).
- `/inventario/proveedores` → `ProveedoresManager.tsx` (directo en
  `proveedores`).
- `/inventario/etiquetas` → `lib/catalogo.ts` → `EtiquetasGenerator.tsx`
  (solo lectura, genera Code128 e imprime).
- `/buscar` → `lib/catalogo.ts` + `lib/sedes.ts` → `BuscadorHero.tsx`.
- `/producto/[varianteId]` → `lib/inteligencia.ts` → `FotoProducto.tsx`,
  `MinimosPorSede.tsx` (RPC `fijar_stock_minimo`), `RecetaCosto.tsx`
  (BOM: `insert`/`delete` directo en `bom_items`).
- `/almacen` y `/almacen/recibir` → **redirects puros**, declarados en
  `redirects()` de `next.config.ts` (movidos desde página-stub el 2026-09-17,
  ver ✨ MEJORAR de BACKLOG) a `/inventario` y `/inventario/recibir`
  (compat de enlaces guardados tras el rediseño UX 2026-07-18; resuelven en
  el edge, sin sesión ni consulta a Supabase — no es código en `app/`).
  `/almacen` ya NO apunta a `/inventario/almacen` — esa ruta murió el
  2026-09-16 (ADR-0071 unificó piso+almacén dentro de `/inventario`) y el
  stub viejo quedó redirigiendo a un 404 sin que nadie lo notara; corregido
  de paso al mover esto a la config (ver nota en `next.config.ts`).
- `/inventario/movimientos` (V2, 2026-09-15, ADR-0050; mudada desde `/movimientos`
  el 2026-09-16, ADR-0071 — la ruta vieja es un `permanentRedirect` que conserva
  los filtros; simplificada el 2026-09-19, ADR-0127) → `lib/movimientos-v2.ts`
  (`listarMovimientos`, `getResumenMovimientos`) → RPC `fn_movimientos` /
  `fn_movimientos_resumen` (lectura pura, cursor, filtros en Postgres; la búsqueda
  por prenda **y por proceso** —«Traslado 24», «B001-000184»— la resuelve
  `fn_movimientos_busqueda`, una sola vez para la lista y las tarjetas) →
  `FiltrosMovimientos.tsx` (buscador, Tipo, Sububicación y Período a la vista, el
  proceso específico en «Más filtros»; todo en la URL) + `MovimientosLista.tsx`
  (agrupada por día: Prenda · Hora y dónde · Movimiento · Origen → Destino · Cant. ·
  Referencia; la referencia —`Traslado N`, `Conteo N`, `Boleta …`, `Factura …`—
  enlaza a `/inventario/traslados/[id]` y `/inventario/conteo/[id]`, y Traslados
  cuenta el proceso completo) + `MovimientoDetalle.tsx` (modal por proceso, sin
  segunda consulta; ahí sigue la persona). Sin filtro por persona ni columna
  «Responsable»: la autoría sigue en `movimientos.usuario_id`. Las reglas de pantalla
  (categoría, signo, nombre del proceso, referencia por proceso, período) viven en
  `lib/movimientos-reglas.ts`, sin servidor. Sin escritura: el ledger es inmutable.

**Inventario V2 — cuatro pantallas operativas + una de decisión (2026-09-16, ADR-0071;
quinta pestaña 2026-09-17, ADR-0101).** El lateral tiene un grupo "Inventario"
(`AppShell.tsx`, `grupoInventario`) y `inventario/layout.tsx` monta `InventarioNav.tsx`
con las mismas pestañas: Existencias · Movimientos · Traslados · Conteo · Resumen (esta
última solo líder). Todo `/inventario/*` va a ancho completo (`SIN_TOPE_DE_ANCHO`).
- `/inventario` (Existencias) → `lib/inventario-v2.ts:getExistencias` = `getStockPorUbicacion`
  (tabla `stock` agregada por variante) + RPC `fn_stock_por_sede` (dónde más hay, la misma
  de Vender, vía `lib/stock-por-sede.ts`) + `transferencia_items` en tránsito hacia acá →
  `InventarioPanel.tsx` (tres tarjetas, filtros en memoria, semáforo de 4 estados con
  `calcularEstado` en `lib/inventario-reglas.ts`, leyenda) → `ReponerPisoModal.tsx` (RPC
  `mover_interno`) y `AjustarInventarioModal.tsx` (RPC `registrar_movimiento`).
- `/inventario/traslados` → `lib/traslados.ts` (`getTrasladosDeLaSede`: en curso + últimos 30
  cerrados + miniaturas con UNA consulta de fotos, tolerante a fallo; `numero`) →
  `TrasladosPanel.tsx` (el único con estado: filtros, buscador, paginación, refresco cada minuto) →
  `TrasladosAtencion` / `TrasladosResumen` / `TrasladosFiltros` / `TrasladosLista` +
  `TrasladoEstado` / `TrasladoLlegada` / `TrasladoMiniaturas`. Todo lo que se decide (qué requiere
  acción, qué viene en camino, cuántas prendas están en tránsito, el orden por espera) vive en
  `lib/traslados-reglas.ts` (`situacionTraslado`, ADR-0105) y se comparte con el contador «por atender»
  del menú: `getTrasladosPorAtender` (total, nunca lanza) → `(app)/layout.tsx` e `inventario/layout.tsx`
  → `AppShell` / `InventarioNav` (`ui/Insignia`). Las fotos se eligen con `lib/producto-fotos-reglas.ts`
  (color exacto o general, nunca de otro color) →
  `/inventario/traslados/[id]` → `TrasladoDetallePanel.tsx` (RPC `registrar_recepcion_traslado`,
  `confirmar_traslado`, `cerrar_traslado_con_diferencia`; dice el estado con `TrasladoEstado`).
- `/inventario/conteo` → `lib/conteos.ts` (`getConteoAbierto`, `getConteosResumen` → RPC
  `fn_conteos_resumen`, `getPrevisualizacionCierre`, `getPrioridadConteo`) →
  `ConteoPanel.tsx` (RPC `abrir_conteo`, `conteo_contar`, `cerrar_conteo`; avance con
  `avanceConteo`) + `ConteosLista.tsx` (historial) → `/inventario/conteo/[id]`
  (`getConteoDetalle`, solo lectura). Exactitud con `exactitudConteos`
  (`lib/conteo-varianza.ts`).
- `/inventario/resumen` (Resumen, solo líder, ADR-0101 → rehecho en ADR-0121) →
  `page.tsx` lee de la URL `ubicacion, preset, desde, hasta, comparar, q, cat, cob, st, est, orden, pag`
  → `lib/resumen-inventario.ts:getResumenInventario` = RPC `fn_resumen_variantes(p_ubicacion_id,
  p_ventana_dias, p_desde, p_hasta, p_cmp_desde, p_cmp_hasta)` paginada con `Range` de a 1000 (agregados
  crudos por variante para esa sede — stock SIEMPRE actual, demanda de las dos ventanas, días con stock
  reconstruidos del ledger, costo solo para líder — + jsonb `en_red` con las otras sedes) +
  `getConteosResumen`/`exactitudConteos` (la MISMA exactitud que la pestaña Conteo) →
  `lib/resumen-armado.ts:armarResumen` (puro: analiza TODA la sede, aplica alcance y vista, devuelve
  agregados + UNA página de 15 filas) sobre `resumen-mapeo` (fila cruda → tipada), `resumen-periodo`
  (períodos y comparación en fechas de Lima), `resumen-busqueda` (búsqueda por tokens),
  `resumen-filtros` (alcance = categoría + búsqueda; vista = cobertura/sell-through/estado/orden),
  `resumen-acciones` (paso del plan → enlace real) y `resumen-reglas` (velocidad, cobertura,
  sell-through, reserva, curvas rotas, plan de reposición, capital; umbrales en `inventario-reglas.ts`) →
  `ResumenInventarioPanel.tsx` (orquesta) con `ResumenBanner` (exactitud), `ResumenControles` (período,
  comparación, búsqueda, filtros), `ResumenSenales` (5 × `ui/TarjetaSenal`), `ResumenPrioridades` (tabla),
  `ResumenBloques` (barras, dona y curvas de `ui/Graficos`), `ResumenDetalleModal`, `ResumenCapitalModal`
  y `ResumenAccion`. Las acciones nunca escriben: enlazan a `/inventario/mover?origen=&destino=&variante=&cantidad=`
  (formulario de `iniciar_traslado`), al `ReponerPisoModal` de Existencias (`mover_interno`) o al traslado que
  ya viene en camino.
- `/inventario/recibir` (sin factura) y `/inventario/mover` (`MoverMercaderiaFormV2.tsx`
  → RPC `iniciar_traslado`; acepta prellenado por URL desde Resumen, validado en la
  página) siguen vivas como rutas, sin pestaña propia: se llega por
  «+ Nuevo traslado» / «+ Nuevo».

**Productos (catálogo V2, integración final 2026-09-15)**
- `/productos` → `lib/catalogo-v2.ts` (`listarProductos`/`getResumenProductos`,
  filtros en la URL + Postgres, RPC `fn_productos`/`fn_productos_resumen`,
  `20260915160000_productos_listado_filtros.sql`) → `FiltrosProductos.tsx` +
  `ProductosAgrupados.tsx` (una fila por producto, expandible a variantes;
  checkboxes de selección y menú "..." por fila viven acá, es Server
  Component el padre). El menú abre `AjustarInventarioModal.tsx` (RPC
  `registrar_movimiento`, tipo='ajuste', piso/almacén vía
  `lib/sububicaciones.ts`) como modal de `useState` normal, y "Ver
  historial" navega a `/productos/[id]/historial`.
- Historial de producto como modal (mismo mecanismo que el detalle de
  factura de Compras): `/productos/layout.tsx` tiene el slot `@modal/`, con
  la ruta interceptada `@modal/(.)[id]/historial`. Clic en "Ver historial"
  desde la lista → la URL pasa a `/productos/<id>/historial` pero la lista
  queda montada detrás y el panel se dibuja en `ui/ModalRuta.tsx`; recarga o
  enlace directo → página completa `[id]/historial/page.tsx`. Ambas
  reusan `HistorialProductoPanel.tsx`, que junta dos fuentes con historias
  distintas: `lib/movimientos-v2.ts:listarMovimientosProducto` (stock, cursor,
  por sede) y `lib/historial-producto.ts:getCambiosProducto` (RPC
  `fn_historial_producto_cambios`: precio/categoría/estado, ledger
  append-only `historial_producto_cambios`, trigger `fn_registrar_cambio_producto`
  sobre `productos`/`variantes` — ADR-0059, ampliado en
  `20260915223000_historial_producto_estado.sql` para no perder los cambios
  de `estado`).
- Acciones masivas (activar/desactivar sobre la selección): UPDATE directo
  de `productos.estado` desde el cliente — sin RPC propia, ya alcanza con la
  RLS `productos_write_lider` (0004_rls.sql, solo líderes) y el trigger de
  arriba lo audita solo.

**Producción (Taller)**
- `/produccion` → `lib/produccion.ts` (`getTaller`, `getOrdenesProduccion`,
  `getModelosProducibles`; lectura con `exigir()`) + `lib/produccion-reglas.ts`
  (puro: etapas, semáforo de margen, costo unitario) → `OrdenesProduccionV2.tsx`
  (en proceso / terminadas / anuladas; RPC `set_etapa_produccion`,
  `cerrar_produccion`, `anular_produccion`, `revertir_produccion`) y
  `NuevaOrdenProduccionForm.tsx` (RPC `abrir_produccion` con `p_token`). Entra el
  líder desde cualquier ubicación y el integrante cuyo `ubicacionTipo === "taller"`.

**Ventas / caja**
- `/vender` → `lib/catalogo-v2.ts:getCatalogo` + `lib/caja.ts:getCajaAbierta` +
  `stock` de todas las sedes que RLS deje ver (`lib/stock-por-sede.ts`: aquí + dónde más
  hay; la RPC `fn_stock_por_sede` para colaboradoras está escrita y sin aplicar; «Ventas
  de hoy» firma cada venta con la integrante vía `lib/nombre-integrante.ts`) →
  `PuntoDeVenta.tsx` (padre: TODO el estado, handlers, cabecera con atajos a /caja,
  /cambios y /devoluciones,
  cabecera y modales; ADR-0043) que reparte en `PuntoDeVentaCatalogo.tsx` (escaneo
  primero y dominante, chips, grilla de **una tarjeta por prenda + color** con las tallas
  adentro —`lib/catalogo-grupos.ts`, memo del padre— filtro «Solo con stock», y «Ventas
  de hoy», que llega ya renderizado desde `page.tsx` vía RPC `fn_ventas_del_dia`; el
  escáner recibe el foco al abrir caja, al cerrar cualquier modal —`Modal.alCerrarEnfocar`—
  y ante una tecla suelta, regla en `lib/escaner-tecla-suelta.ts`; shadcn `Tooltip`/
  `Toggle`/`Badge`, ADR-0045 — sin reveal al scroll, por decisión) y `PuntoDeVentaTicket.tsx`
  (tres momentos, ADR-0044: «armar» = líneas + total; «descuento» = % global o por
  prenda, que viaja como `descuento_unitario` por línea; «cobrar» = método de pago,
  boleta/factura con el documento adentro, Confirmar cobro → RPC `registrar_venta`,
  que emite el comprobante en la misma transacción y, desde ADR-0048, rechaza precios
  distintos a `variantes.precio` y descuentos de Colaboradora sin código válido —
  tabla `codigos_descuento`; guarda `ventas.nota`, que `fn_ventas_del_dia` devuelve).
  El ticket en espera (Park/Resume, ADR-0049) no toca la base: `lib/almacen-local.ts`
  → `localStorage` `cayla:vender:<ubicacionId>:en-espera`, cargado tras montar, vaciado
  al cerrar caja; la cola offline usará el mismo módulo con otro `nombre`. `lib/vender-reglas.ts`:
  `motivoBloqueoCobro` (por qué el botón está apagado, derivado una vez),
  `aplicarDescuento`/`descuentoUnitarioPorPorcentaje`/`porcentajeDeLinea`,
  `restanteDePagos`/`vueltoDe` (pago mixto: `p_pagos` viaja como lista de
  `{ metodo, monto }`, una fila por medio en `venta_pagos`; el `recibido` del efectivo es
  solo de pantalla). El reflujo de las líneas es `Flip` de GSAP (`lib/motion-gsap.ts`,
  ADR-0045). Modales del padre:
  `AbrirCajaFormV2` (RPC `abrir_caja`) y `CerrarCajaModalV2` (RPC `cerrar_caja`, con
  conteo ciego: el esperado sale de la respuesta del cierre, no antes).
- **Cambios y Devoluciones comparten lector y piezas** (ADR-0125/0122): `lib/ventas-v2.ts:
  getVentasRecientes` (actividad = ventas de la sede de los últimos 15 días; búsqueda por
  boleta, DNI/RUC o nombre de la clienta —de `comprobantes`—, nombre o etiqueta de la prenda,
  o `?item=` para una prenda exacta; trae también los cambios y devoluciones ya hechos por
  línea, el descuento y si el comprobante está aceptado), `BuscadorVentas.tsx`,
  `ComprasAgrupadas.tsx` (lista por día y compra) y `FlujoGuiado.tsx` (pasos, botones,
  validaciones, foco/Escape). Reglas puras compartidas —plazo R-38, `unidadesDisponibles`
  (descuenta lo cambiado y lo devuelto), validaciones— en `lib/cambios-reglas.ts`.
- `/cambios` → `getVentasRecientes` + `getCatalogo` + stock del piso + `fn_stock_por_sede` +
  `getCajaAbierta` + `lib/cambios-estadisticas.ts` (hoy / mes / valor cambiado; "tallas que no
  calzan" solo para líderes) → `CambiosPanel.tsx` (bloques "Iniciar un cambio" y "Actividad
  reciente", filas en `CambiosVentas.tsx`) → `CambiosFlujo.tsx` (Venta → Prenda → Reemplazo →
  Confirmación, sin modal; paso 3 en `CambioReemplazo.tsx`, piezas de lectura en
  `CambioResumen.tsx`) → RPC `registrar_cambio` (motivo + condición de la prenda que vuelve:
  vendible al piso, no vendible a cuarentena con fila en `prendas_danadas.cambio_id`; rechaza
  ventas anuladas; migración 20260919000100).
- `/devoluciones` (ADR-0122) → `getVentasRecientes` + `lib/devoluciones.ts`
  (`getDevolucionesPendientes`, `getEstadisticasDevoluciones`) + `getCajaAbierta` →
  `DevolucionesPanel.tsx` (bloques "Iniciar una devolución", "Por aprobar" y "Actividad
  reciente"; filas en `DevolucionesVentas.tsx`; "Anular venta" en el encabezado de cada compra,
  solo líder) → `DevolucionesFlujo.tsx` (Venta → Prendas → Detalle → Confirmación: VARIAS
  prendas en una sola devolución) → RPC `crear_devolucion` (queda `pendiente`; no mueve nada) →
  `DevolucionesPendientes.tsx` (solo un líder) → RPCs `aprobar_devolucion` (mueve el stock, emite
  la Nota de Crédito si el comprobante está aceptado —ADR-0100— y el reembolso opcional; lo
  dañado entra a cuarentena) y `rechazar_devolucion`. Reglas puras en
  `lib/devoluciones-reglas.ts`. `?item=` abre el flujo sobre una prenda (desde y hacia Cambios).

**Compras (V2, ADR-0035 — la factura del proveedor es el eje)**
- `/compras/proveedores` → `lib/proveedores.ts:getProveedores` (RPC
  `fn_proveedores`: directorio + facturas vigentes + saldo + última compra) →
  `ProveedoresPanel.tsx` → RPCs `registrar_proveedor`, `actualizar_proveedor`,
  `desactivar_proveedor`, `reactivar_proveedor`
  (`20260914150000_proveedores_administrables.sql`). Es la puerta del módulo:
  `compras.proveedor_id` es FK dura, sin proveedor no hay factura. El alta
  consulta `GET /api/padron?tipo=ruc` para traer la razón social de SUNAT;
  si el padrón no responde, se escribe a mano y se guarda igual. Nunca borra:
  `activo=false`. Candados: `proveedores_ruc_unico` y
  `proveedores_nombre_clave_unica` (sobre `fn_clave_texto`, el mismo
  normalizador de `colores`/`categorias`).
- `/compras` (Facturas), `/compras/nueva`, `/compras/factura/[compraId]`,
  `/compras/recibir`, `/compras/por-pagar` → `lib/compras.ts` →
  `CompraFormV2`, `CompraDetalle` + `CompraDetallePanel`, `RecepcionCompraFormV2` → RPCs
  `registrar_compra`, `recibir_compras`, `registrar_pagos_compra` (varios medios, todo o nada; `registrar_pago_compra` es el atajo de un medio),
  `anular_compra`, `listar_compras`, `resumen_compras`. Sub-navegación en
  `ComprasNav.tsx` (layout de `/compras`).
- **Recibir mercadería por envío** (2026-09-18, ADR-0113): `/recibir` (NO bajo `/compras`, que es solo
  líder; `/compras/recibir` redirige) → `lib/envio.ts` (traslados en tránsito hacia la sede) +
  `lib/envio-reglas.ts` (reglas puras: bloques por comprobante, totales, escaneo, el pedido a la RPC) →
  `RecepcionEnvio` + `KpisRecibir` → RPC atómica e idempotente `recibir_envio` (llama a `recibir_compras` una
  vez por proveedor, `registrar_recepcion_traslado`/`confirmar_traslado`, `cerrar_linea_compra` y
  `registrar_nota_credito_compra`). Tablas `envios` (una guía; agrupa un lote por proveedor vía
  `lotes.envio_id`), `envio_extras` (fuera de comprobante: proveedor + regalo) y `envio_traslados`. Cuenta
  cualquier colaborador de la sede. **Quien no es líder no recibe montos, y eso lo hace cumplir la base** (ADR-0126):
  `lib/compras.ts` le pide los comprobantes y las líneas a `listar_compras_operativo` / `lineas_compra_operativo`
  (`security definer`, candado de sede, lista de permitidos: ni una columna de dinero) y no a `listar_compras` ni a la
  vista `compra_items_resumen`; las tablas `compras`, `compra_items`, `compra_pagos`, `compra_adjuntos` y
  `compra_notas_credito`, y el bucket `retail-compras-adjuntos`, solo las lee `fn_puede_ver_dinero_de_compras()` (hoy: el
  líder); las cinco funciones de dinero (`resumen_compras`, `resumen_compras_extra`, `deuda_por_vencimiento`,
  `salidas_caja_30d`, `por_pagar_tramos`) abren con `fn_exige_dinero_de_compras` y fallan `42501` para un integrante.
  `fn_aplicar_candado_de_dinero()` se los pone (o se los devuelve tras otra migración). La página además tacha los
  montos en el servidor como segunda línea (`comprobanteSinMontos`). «Recibidas» (`?vista=recibidas`) agrupa las filas
  de un envío de 2+ proveedores bajo una cabecera (`agruparPorEnvio`, `getEnviosDeLotes` lee `lotes.envio_id`).
- Detalle de factura como modal (2026-09-14): el layout de `/compras` tiene
  un slot paralelo `@modal/` con la ruta interceptada
  `@modal/(.)factura/[compraId]`. Al hacer clic en una fila (Facturas, Por
  pagar) la URL pasa a `/compras/factura/<id>` pero la lista queda montada
  detrás y el detalle se dibuja en `ui/ModalRuta.tsx` (cierra con
  `router.back()`); recarga o enlace directo → página completa
  `factura/[compraId]/page.tsx`. Ambas usan `components/CompraDetalle.tsx`.
  `@modal/default.tsx` (vacío) y `@modal/[...catchAll]` (limpia el modal al
  cambiar de pestaña) son parte del mecanismo. El prefijo `factura/` es
  obligatorio: un `(.)[compraId]` directo bajo `/compras` interceptaba
  también `/compras/por-pagar`, `/compras/nueva`, etc.
- Avisos globales (ADR-0047): `components/ui/Avisos.tsx`, montado en
  `app/layout.tsx`. Toda validación/error/éxito/proceso pasa por `avisar.*`
  (arriba a la derecha) y `enfocar` lleva el cursor al campo. Sin `useState`
  de error en componentes.
- Adjuntos de factura (ADR-0046, `20260914180000_compras_adjuntos.sql`):
  tabla `compra_adjuntos` + bucket privado `retail-compras-adjuntos`.
  `AdjuntosCompra.tsx` (selector en `/compras/nueva`, lista en el detalle) →
  `lib/adjuntos-compra.ts` sube del navegador al bucket y registra la fila
  con `registrar_adjunto_compra`; `archivar_adjunto_compra` quita de la
  vista (nunca borra). URL firmada de 1 h en `lib/compras.ts`.

**Producción (Taller)**
- `/produccion` → `OrdenesProduccion.tsx` → RPCs `registrar_produccion`,
  `set_etapa_produccion`, `cerrar_produccion`, `revertir_produccion_inventario`,
  `eliminar_produccion`. Modelo unificado en tabla `producciones` (el par
  viejo `ordenes_produccion`/`bom_items` de Fase 1 es legado sin RPC activo).

**Finanzas / contabilidad** (todas Líder-only)
- `/finanzas` → `lib/finanzas-nucleo.ts:getEERRMensual`.
- `/finanzas/balances` → `lib/contabilidad.ts:getEstadosContables` (los 4
  estados financieros, derivados por lectura — no hay tabla de asientos
  detrás de este cálculo, Activo=Pasivo+Patrimonio "por construcción").
- `/finanzas/efectivo` → `lib/finanzas-nucleo.ts:getCuadreEfectivo` →
  `EfectivoPanel.tsx` → RPC `registrar_deposito`.
- `/finanzas/registrar` → `RegistroContableForm.tsx`, que arma las líneas
  con las funciones **puras** de `lib/registro-contable.ts`
  (`opcionesPrincipal`, `construirLineas`, `sumaDebe/Haber` — garantizan
  Σdebe=Σhaber antes de enviar) y envía a RPC `registrar_asiento`, el
  único camino de escritura al libro diario.
- `/finanzas/activos`, `/finanzas/patrimonio`, `/finanzas/comparativo` →
  lectura + edición directa (`PatrimonioEditor`, `HistoricosEditor`).
- `RegistrarGastoModal.tsx` (accesible desde varias pantallas) → RPC
  `registrar_gasto`.
- `/vender/facturacion` → `lib/comprobantes.ts` → `ComprobantesPanel.tsx` →
  RPCs `emitir_comprobante` (reserva serie+correlativo, `for update`) y
  `registrar_serie_comprobante`. Emitir NO transmite: el envío a SUNAT es el
  botón "Transmitir" de cada fila → `POST /api/lucode/emitir` (ADR-0005,
  ADR-0009). El modal de emisión usa `ConsultaDocumento.tsx`, el
  único componente que llama a una ruta de API propia en vez de a una RPC:
  `GET /api/padron?tipo=dni|ruc&numero=…` → `lib/padron.ts` → proveedor externo
  del padrón (RENIEC/SUNAT). Validación de formato y dígito verificador en
  `packages/shared/src/documento.ts` (pura, corre en los dos lados). ADR-0008.

### 3.x Rutas de API (`app/api/**/route.ts`)

Son la excepción al patrón "Server Component lee, RPC escribe": existen solo
cuando hace falta hablar con algo que no es Postgres, o devolver un archivo.

- `/api/export/inventario` → CSV del catálogo (`lib/catalogo.ts`).
- `/api/lucode/emitir` → transmite a SUNAT, vía Lucode (PSE), un comprobante
  que `emitir_comprobante`/`emitir_nota` ya reservó. Traduce el formato propio
  a la forma del proveedor en `lib/lucode.ts` — cambiar de PSE es cambiar ese
  archivo, no el esquema. Si Lucode no responde, el comprobante se queda en su
  estado real (`pendiente`/`rechazado`) y el botón sigue a la vista: nunca se
  le inventa un estado ni se reintenta solo. ADR-0009.
- `/api/padron` → consulta de DNI/RUC contra el padrón externo. El token del
  proveedor nunca sale del servidor. Devuelve siempre 200 con `fuente`
  (`padron` | `historial` | `ninguna`) — "no pude averiguarlo" es una respuesta
  normal, no un error. Antes de gastar una consulta pagada busca el documento
  en `comprobantes` (memoria durable propia) y cachea en memoria por instancia.

Sin sesión, `middleware.ts` devuelve `401` JSON a `/api/*` en vez de redirigir
a `/login` — un `fetch()` seguiría el redirect y recibiría HTML.

---

## 4. Modelo de datos (schema `retail`)

### 4.1 Tablas por dominio

- **Catálogo**: `categorias` (familia fija + nombre editable),
  `productos` (SKU padre), `variantes` (SKU vendible: talla+color, `costo`,
  `precio`, `precio_taller`, `stock_minimo`).
- **Inventario**: `stock` (snapshot `variante_id+sede_id`, `cantidad >= 0`),
  `movimientos` (**append-only**, fuente de verdad — `stock` es un derivado
  que nunca se edita a mano), `contenedores` (ubicaciones fijas por sede),
  `lotes` (recepción/fardo), `stock_almacen` (bolsa de almacén interno,
  separada del piso de venta pero dentro de la misma sede).
- **Sedes/personas**: `sedes`, `personas` (`auth_user_id` único).
- **Ventas**: `cajas` (una sola caja abierta por sede — índice único
  parcial), `ventas` (1 fila por checkout).
- **Compras**: `proveedores`, `ordenes_compra` / `ordenes_compra_items`.
- **Producción** (V2 desde 2026-09-15, ADR-0052): `producciones` (por
  `ubicacion_id` del Taller —`ubicaciones.tipo = 'taller'`—; `cantidad_plan` vs
  `cantidad_buenas`; `costo_unitario` es **columna generada** sobre las buenas,
  no se puede desincronizar; `etapas` jsonb: patronaje → muestra → escalado
  (muestra) · corte → confección → acabado (producción); `inventariado_at`
  evita doble conteo; `token_cliente` unique = idempotencia), `produccion_lineas`
  (plan y buenas por variante), `movimientos.produccion_id`. Sin policy de
  escritura: solo RPC.
- **Finanzas**: `gastos`, `depositos_bancarios`, `ajustes_efectivo`,
  `patrimonio_items`, `activos_fijos`, `ventas_historicas_mensuales`,
  `comprobantes` / `series_comprobantes` (facturación electrónica, parte 1 —
  ver ADR-0005; `estado` nace en `pendiente`, el envío a SUNAT es aparte).
- **Contabilidad**: `cuentas_contables` (35 cuentas semilla, PCGE/NIIF),
  `asientos` / `asiento_lineas` (libro diario, **inmutable para clientes**:
  sin política INSERT/UPDATE/DELETE, solo entra vía RPC).

### 4.2 Funciones RPC (`security definer`)

| Función | Qué resuelve |
|---|---|
| `registrar_movimiento` → `fn_aplicar_movimiento` | Motor de stock: entrada/salida/ajuste/traslado, con `for update` (lock de fila) contra condición de carrera; valida sede |
| `recibir_lote` | Recepción de mercadería: crea lote + producto/variante si faltan + N movimientos. Ver §6, es la función con historial de drift |
| `registrar_venta` | Venta + N movimientos de salida |
| `abrir_caja` / `cerrar_caja` | Apertura/cierre con conteo ciego |
| `registrar_gasto`, `registrar_deposito`, `fijar_stock_minimo`, `recalcular_stock` | Operación de caja y stock; `recalcular_stock` reconstruye `stock` completo desde `movimientos` como red de seguridad |
| `registrar_asiento` | Único camino de escritura al libro diario; valida cuadre antes de insertar |
| `emitir_comprobante` / `emitir_nota` / `registrar_serie_comprobante` | Reserva boleta/factura/nota con su correlativo oficial (`for update` por serie); factura sin RUC es imposible por constraint. No transmite a SUNAT: eso es `/api/lucode/emitir` — ADR-0005, ADR-0009 |
| `actualizar_transmision_comprobante` | Único camino para escribir el resultado real de SUNAT (`enviado`/`aceptado`/`rechazado` + respuesta cruda); nunca se edita `estado` a mano |
| `abrir_produccion`, `set_etapa_produccion`, `cerrar_produccion`, `anular_produccion`, `revertir_produccion` | Ciclo de una corrida del Taller (ADR-0052): abrir solo en `tipo='taller'`; cerrar mete la entrada (`motivo='produccion'`) y pega el costo real a `variantes.costo`; revertir registra la salida (`reversion_produccion`) — nunca se borra un hecho que ya movió stock |
| `bajar_a_piso` / `devolver_a_almacen` | Mueve entre `stock_almacen` y `stock` de la misma sede, atómico |
| `fn_conteos_resumen` (2026-09-16) | Lista de conteos de una ubicación con líneas, sistema/contado/diferencia y soles ya sumados en Postgres; `security invoker` (RLS de conteos decide). Alimenta la pestaña Conteo. ADR-0071 |
| `fn_resumen_variantes` (2026-09-17 en producción; **v2 aplicada en producción el 2026-09-19**, firma `(p_ubicacion_id, p_ventana_dias, p_desde, p_hasta, p_cmp_desde, p_cmp_hasta)`, la `(uuid, integer)` se elimina) | Agregados por variante para UNA ubicación: stock por sububicación **siempre actual** (cuarentena excluida), primer ingreso, **días con stock del período** (reconstruidos del ledger: saldo(t) = stock hoy − Σ movimientos posteriores, con las reglas de `fn_aplicar_movimiento`; `ledger_consistente = false` si el saldo da negativo), stock al inicio, demanda neta del período **y del período comparado** clasificada por FK (venta completada + cambio salida − devolución vendible − cambio entrada, atribuida a la sede de la venta; las salidas `venta` sin `venta_item_id` también cuentan), entradas/mermas, en camino hacia esa sede (enviado, `en_transito`/`recibido_con_diferencia`, atrasado, próxima llegada y su traslado), origen de abastecimiento, códigos de barras, categoría, precio, y `costo` + `estado_costo` (`oficial`/`declarado`/`alterado`/`sin_costo`) **solo si `fn_es_lider()`**; jsonb `en_red` con lo mismo (utilizable, piso, días con stock) de las otras sedes activas. `security definer` con baranda `fn_puede_operar_ubicacion` (0 filas si no puede), `revoke … from public, anon` y `grant execute … to authenticated`. NO decide nada: las reglas viven en `lib/resumen-reglas.ts`. ADR-0101, ADR-0113 |
| `fn_movimientos` / `fn_movimientos_resumen` (2026-09-15; **la búsqueda por proceso y los números de traslado/conteo, 2026-09-19, ADR-0127: en producción desde el 2026-09-19**) | Lectura del ledger para la pantalla de Movimientos: una fila plana por movimiento con su proceso resuelto (comprobante, guía, factura, conteo, devolución, cambio), categoría y signo calculados en SQL, filtros y cursor server-side. `p_ubicacion_id` obligatorio; excluye la variante centinela «Cargo especial». Desde ADR-0127 la fila trae además `transferencia_numero` y `conteo_numero` (las dos últimas columnas) y `p_busqueda` entiende «traslado 24», «conteo 12», «boleta 184», «B001-000184», guía y factura de compra (`fn_movimientos_busqueda` + `fn_movimientos_de_comprobante`; la lista y las tarjetas usan la misma). ADR-0050, ADR-0127 |

### 4.3 RLS sin `tenant_id`

Helpers `security definer` (`fn_es_lider`, `fn_sede_actual_persona`,
`fn_persona_actual`) leen `personas` por `auth.uid()` **sin** pasar por
RLS — necesario desde la migración `0023` para romper una recursión
infinita (policy de `personas` → llama `fn_es_lider()` → vuelve a
consultar `personas` → evalúa la policy de nuevo → *stack depth limit
exceeded*). La sede reemplaza la dimensión de aislamiento: Líder ve todo,
Integrante solo su sede (o su almacén asociado).

### 4.4 Estados imposibles por diseño (no por código)

- `stock.cantidad >= 0` — nunca stock negativo.
- Índice único parcial en `cajas` (`where estado='abierta'`) — una sede no
  puede tener dos cajas abiertas a la vez.
- `asiento_lineas`: `check(debe>0 xor haber>0)` + trigger *deferred* que
  exige Σdebe=Σhaber al confirmar — un asiento descuadrado es literalmente
  imposible en la base de datos, no solo validado en el formulario.
- `personas.auth_user_id` único — una cuenta de auth = una sola persona
  (ver ADR-0002).
- Índice único parcial en `contenedores` (`where tipo='almacen'`) — un solo
  almacén por sede.
- `produccion_lineas`: `unique(produccion_id, variante_id)` +
  `producciones.inventariado_at` — idempotencia contra doble conteo de
  stock si alguien hace doble clic en "cerrar producción".
- `comprobantes`: `check(tipo <> 'factura' or (cliente_tipo_doc = 'ruc' and
  cliente_num_doc is not null))` — una factura sin RUC no puede existir en la
  base, ni siquiera si alguien escribe directo saltándose la RPC. `unique(tipo,
  serie, numero)` — dos comprobantes del mismo tipo nunca comparten número.

---

## 5. Decisiones estructurales ya documentadas (ADRs)

- **ADR-0001** (jul-17) — los traslados no aparecían en el historial de la
  sede que *recibe* porque la policy RLS solo miraba `sede_id` (origen). Se
  agregó una policy nueva en vez de tocar la existente, para no arriesgar
  comportamiento ya verificado.
- **ADR-0002** (jul-17) — 5 filas duplicadas en `personas` para el mismo
  login rompían `.single()`. Se agregó `unique(auth_user_id)` para volver
  ese estado imposible.
- **ADR-0003** (sep-3) — 5 categorías nuevas agregadas *antes* de capturar
  el catálogo físico, basadas en historial real de compras — reclasificar
  después habría costado hacerlo prenda por prenda.
- **ADR-0052** (sep-15) — Producción vuelve sobre V2; el Taller es
  `ubicaciones.tipo = 'taller'`; la migración se reconstruyó desde la base
  local porque el archivo se había perdido.
- **ADR-0004** (sep-3, el más relevante hoy) — `retail.recibir_lote` en
  producción divergió de la versión local durante la unificación con
  Dynamic (jul-2026): el script copió una versión vieja de la función.
  Ver §6.

---

## 6. Hallazgo de seguridad y deuda técnica activa

- **`recibir_lote` sin validar sede** (hallazgo real, ya corregido en
  `0031_recibir_lote_completo.sql` / `14_recibir_lote_produccion.sql`):
  la copia que quedó viva en producción no validaba sede, no guardaba
  `categoria_id`, y no aceptaba `p_orden_compra_id`. Cualquier persona
  autenticada podía recibir mercadería en una sede que no era la suya.
- **Dos versiones de `recibir_lote` convivieron en producción** un tiempo
  corto: `CREATE OR REPLACE` con una firma de parámetros distinta no
  reemplaza la función vieja en Postgres, crea una función nueva. Se
  detectó al regenerar tipos TypeScript (unión de dos firmas) y se corrigió
  con `DROP FUNCTION` explícito de la firma vieja.
- **`packages/database/src/types.ts` desactualizado**: no incluye
  `recibir_lote` ni `recalcular_stock` — señal de que los tipos generados
  no están sincronizados con el schema real de producción.
- **Reconciliación pendiente**: `ordenes_produccion`/`bom_items` (Fase 1,
  legado) vs `producciones`/`produccion_lineas` (modelo actual) — decisión
  aparte, deliberadamente fuera de alcance de ADR-0004.
- **`retail.puede_operar_sede`** sigue sin la cláusula `tienda_asociada_id`
  que sí tenía la versión local.
- Cobertura de tests: tres archivos (`lib/registro-contable.test.ts`,
  `lib/documento.test.ts`, `lib/padron.test.ts`, 43 pruebas). Sigue sin haber
  ninguna sobre stock/movimientos, que es el núcleo con más consecuencia.
- El entorno local ya corre la app completa (ADR-0010, 2026-09-05):
  `supabase/seed.sql` renombra `public` → `retail` después de migrar, así el
  local tiene la misma forma que producción. Storage queda apagado en local
  (subir fotos no funciona ahí); el resto sí. Instrucciones en el README.
- `middleware.ts` usa convención deprecada de Next.js 16.

---

## 7. Dónde vive esto en producción (crítico para tocar SQL)

Producción **no** vive en su propio proyecto Supabase: vive dentro del
proyecto de **cayla-dynamic**, en un schema llamado `retail` (45 tablas y 2 vistas ahí
hoy). `NEXT_PUBLIC_SUPABASE_URL` de producción apunta al proyecto Dynamic,
no al proyecto original de retail. Toda migración pegada en el SQL Editor
de producción necesita el prefijo `retail.` en cada tabla (o
`set search_path to retail, public;` al inicio) — sin eso, el editor busca
en `public`, que en el proyecto Dynamic es el schema de *Dynamic*, no el de
retail. Las migraciones en `supabase/migrations/*.sql` se escriben **sin**
el prefijo (corren limpias contra Postgres local); el prefijo se agrega
solo al pegar en producción, nunca en el archivo del repo.

---

## 8. Estado del proyecto (2026-09-04)

**Construido y verificado en producción**: Vender (caja, conteo ciego),
Inventario (catálogo agrupado, recepción, almacén interno con ubicaciones,
etiquetas, compras, proveedores), Producción del Taller (6 etapas, costeo
por margen de contribución), Comercial (rotación, sugerencias de traslado),
Finanzas (4 estados financieros, motor de partida doble PCGE), identidad
visual CAYLA v3.

**En progreso**: captura del catálogo real (0 → ~900 SKUs físicos, recién
arrancado el 2026-09-03; era el bloqueador #1 y dependía de que el almacén
interno quedara cerrado, lo cual pasó el mismo día).

**Planeado, no empezado**: comprobante electrónico SUNAT (Nubefact),
inventario real de materia prima del Taller, fases avanzadas de
contabilidad (cuentas por pagar, IGV real, cumplimiento SUNAT — relevante
porque CAYLA proyecta ~72% del umbral de 300 UIT en 2026).

---

## 9. Vocabulario y convenciones del código

Español en tablas/dominio de negocio; inglés estándar en nombres de
variables/funciones. Nunca "empleado/jefe/sucursal": se usa
"colaborador/integrante", "líder de equipo/encargado de sede",
"sede/tienda/boutique", "clienta" (compradora final) — ya reflejado en
`personas.rol` (`lider`/`integrante`) y en la tabla `sedes`.

---

*Este documento es una fotografía del código al 2026-09-04. Para el estado
vivo día a día ver `docs/BACKLOG.md` y `docs/BITACORA.md`; para el porqué
de cada decisión estructural, `docs/adr/`.*
