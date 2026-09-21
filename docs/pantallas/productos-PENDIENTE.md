# Traspaso — auditoría `/pantalla` de Productos (EN CURSO, no terminada)

> Fecha: 2026-09-21 · Rama: `claude/audit-pantalla-producto-ddbaca` · SHA analizado: `f69604d0` (= `origin/main`, rama al día, conteo `0 0`)
> Estado: **Pasos 0 y 1 hechos. Paso 2 (SQL) entregado, esperando el resultado de Felipe. Pasos 3, 4 y 5 NO hechos.**
> Este archivo NO es el análisis final. El análisis final va en `docs/pantallas/productos.md` (plantilla: `.claude/skills/pantalla/plantilla-analisis.md`). Cuando exista, este archivo se borra.
> Sin datos personales: las capturas mostraban solo catálogo (no había nombres de clientas ni DNI).

## Cómo continuar en otra cuenta

1. Clonar/actualizar el repo y `git checkout claude/audit-pantalla-producto-ddbaca`.
2. Invocar `/pantalla /productos` (skill en `.claude/skills/pantalla/SKILL.md`) y decirle a Claude: *«lee `docs/pantallas/productos-PENDIENTE.md` y sigue desde el Paso 2»*.
3. Antes de seguir: `git fetch origin` y comparar `git diff --stat f69604d0 origin/main -- <archivos de la pantalla>` (lista abajo). Si cambiaron, el mapa de código de este archivo está **vencido**: rehacer el Paso 1.
4. Pedirle a Felipe que corra el SQL de la sección 6 en **producción** y pegue el resultado (o que diga «sin SQL»).
5. Con eso: Paso 3 (6 dimensiones + 2 puntajes), Paso 4 (12 tareas), Paso 5 (escribir `docs/pantallas/productos.md`, líneas propuestas para BACKLOG sin editarlo).
6. Regla madre del skill: solo analizar y proponer; no tocar código, BACKLOG ni migraciones.

## 1 · Qué se pidió y qué se asumió

Felipe pidió auditar `/pantalla/Producto` con 11 capturas. **No es una ruta real**; se dedujo un **flujo**: `/productos` + `/productos/nuevo`. Slug: `productos`. (Si Felipe quería solo una parte, se parte en `productos` y `productos-nuevo`.) Supuesto sin confirmar.

Capturas (rol líder, sede Tienda TRU, escritorio):
1. Listado en **grilla**: cabecera «44 productos · 190 variantes · 3 para pedir · 23 sin stock», bloque «A quién pedirle» (CAYLA SAC · 3 productos), buscador + botón Filtros. Tarjetas grandes con placeholder de percha y badge «MUESTRA» / «MUESTRA — MARRÓN».
2. Grilla, página 2 de 2 (44 productos, 24 por página). Tarjetas con precio (rangos como S/189.00–199.00), «Stock 0» en rojo, swatches de color, «Arena (retirado)».
3. **Vista rápida** de un producto (POL-001): tabla Talla/Color/Precio/Código con 6 variantes; chip **DESCONTINUADO** tachado; botones EDITAR y AJUSTAR INVENTARIO.
4. **Ajustar inventario** (Blazer Catalina): pestañas Piso de venta / Almacén de tienda; una fila por variante con input «0» y «stock 0»; Motivo (desplegable) y Observación; Cancelar / Confirmar.
5. Vista **tabla** con filtro Descontinuado activo: KPIs 6 productos / 36 variantes / 3 pedir / 0 stock bajo / 6 sin stock; 8 filtros (buscar, categoría, marca, proveedor, color, estado, precio desde/hasta, stock); chip «DESCONTINUADO ×» y «Limpiar todo»; checkbox «Seleccionar todo en esta página»; columnas Categoría/Variantes/Stock/Costo/Estado.
6. Recorte de la tabla con el menú `⋯` abierto (asoma un panel cortado).
7. Tabla sin filtro: KPIs 44 / 190 / 3 / 0 / 23; una fila muestra **Costo S/0.00** (Asimetrico Tul, TOP-0006) con estado ACTIVO.
8–11. **Nuevo producto** (7 pasos): (1) Qué producto es — búsqueda + familias Indumentaria/Accesorios/Bisutería/«Ver más»; (2) Marca y proveedor; (3) Nombre: Referencia (se guarda normalizada: «rgt» → «Rgt») y Descripción; (4) Talla/Tejido/Patrón (Indumentaria exige tejido y patrón); (5) Colores; (6) Precio y variantes (precio de venta y costo opcional, checkbox por talla); (7) Etiquetas. Panel Resumen a la derecha con **Código previsto** (ABR-0001…) y **FALTA** («Pon el precio de venta»). Botón Crear producto deshabilitado hasta completar. Las capturas usan datos de prueba («Rgt», «dfsdf», «dgdr»): no eran productos reales.

## 2 · Paso 0 — terreno (hecho)

- `git fetch` OK; rama al día con `origin/main`.
- `docs/SESIONES-ACTIVAS.md`: fila 19 (candado de líder D-13, ADR-0143, PR #218 ya fusionado; tocó los botones de `ProductosAgrupados.tsx` y `ProductosGrilla.tsx`) y fila 22 (árbol de decisión de producto, ADR-0109; pendiente verificar con sesión de líder real). Ninguna parece tener trabajo abierto en conflicto, pero hay historia reciente.
- No existe `docs/pantallas/productos.md` → es análisis nuevo, no re-análisis. Existen `colaboradores.md` y `productos-categorias.md` (modo rápido, 2026-09-21) para comparar defectos repetidos.
- Tipo: listado con filtros + formulario largo. Dispositivo: escritorio (trabajo de catálogo del líder).
- **Finalidad declarada** (de `docs/datos/modulos/02-catalogo-y-vocabulario.md` y BACKLOG, no de la captura): *«Productos existe para que el líder dé de alta y mantenga la ficha de cada prenda (modelo → variante talla/color) con vocabulario cerrado, vea de un vistazo qué reponer y a quién pedírselo, y ajuste stock sin venta.»* Felipe puede corregirla.
- Aviso: el módulo 02 avisa que describe el núcleo V1 → no citarlo como vigente; mandan el código y producción.
- No hay `graphify` ni `codegraph` instalados; el mapa salió de lectura directa.

## 3 · Paso 1 — mapa del código (hecho por subagente; rutas relativas a `apps/web/` salvo `supabase/`)

**Rutas.** `app/(app)/productos/page.tsx:48` es Server Component; en paralelo (`:67-77`) llama `listarProductos`, `getResumenProductos`, categorías, colores, marcas, proveedores, sububicaciones; `getProductosPendientesAlta` solo líder; `getReposicionPorProveedor` aparte (`:80`). `productos/layout.tsx:24` monta slot `@modal`, cuyo único modal de ruta es `@modal/(.)[id]/historial/page.tsx`. **La vista rápida (tabla Talla/Color/Precio/Código con EDITAR / AJUSTAR) NO es ruta**: es `VistaRapidaModal` con estado local en `components/ProductosGrilla.tsx:253-337` (tabla `:300-319`, Editar `:323`, Ajustar `:327-331` solo líder). `productos/nuevo/page.tsx:15` y `[id]/editar/page.tsx:17` redirigen a quien no es líder.

**Datos de la lista.** `lib/catalogo-v2.ts:220` `listarProductos` → RPC `fn_productos` (24 por página, `:136`); `:323` `getResumenProductos` → `fn_productos_resumen`; `:297` `getReposicionPorProveedor` → `fn_productos` con `stock=reponer`. Definición vigente: `supabase/migrations/20260918231300_productos_por_marca_y_proveedor.sql` (SECURITY DEFINER `:62`, `:226`).

**Origen de cada KPI** (`fn_productos_resumen`, `…231300.sql:294-300`): PRODUCTOS = `count(*)`; VARIANTES = `sum(num_variantes)`; STOCK BAJO = `stock_minimo is not null and stock_total < stock_minimo`; SIN STOCK = `stock_total = 0`; PEDIR = `stock_total <= punto_reorden and demanda_diaria > 0`, con `punto_reorden = ceil(demanda_30d/30 × lead_time) + coalesce(stock_minimo,0)` (`:291`, `:145`), lead time 14 días por defecto (`:259`). Por eso «Stock bajo 0 / Pedir 3 / Sin stock 23» no es contradicción: son tres umbrales distintos (los sin `stock_minimo` nunca cuentan como «bajo»; «pedir» exige ventas en 30 días) — pero **la pantalla no lo explica**.
- Los KPIs respetan búsqueda/categoría/marca/proveedor/color/estado/precio (`catalogo-v2.ts:206-217`); excluyen `stock` y `orden` a propósito. Con filtro Descontinuado «6 productos, pedir 3» es coherente con el código.
- **Los KPIs NO respetan la sede**: `stock_total = sum(s.cantidad)` de todas las ubicaciones (`…231300.sql:101`, `:252`); documentado como decisión de Felipe en `ProductosAgrupados.tsx:37-41`. SECURITY DEFINER → la RLS de `stock` no aplica.
- Grilla: KPIs en 0 se ocultan (`page.tsx:228-245`). «A quién pedirle» (`page.tsx:142-168`) tope 300 productos (`catalogo-v2.ts:295,302`); los enlaces por proveedor (`page.tsx:152`) solo llevan `stock` y `proveedor`, tiran los demás filtros.

**Filtros** `components/FiltrosProductos.tsx`: viven en la URL; `aplicar` (`:55-64`) borra `pagina`; debounce 350 ms (`:68-83`); chips `:93-119`; «Limpiar todo» `:139-153` hace `router.push(pathname)` (también borra la vista tabla). Búsqueda `fn_productos_buscar` (`…231300.sql:36-57`) con `ilike` sobre referencia, código, SKU, marca, proveedor y barras. Paginación server-side (`limit/offset` `…231300.sql:168`, `Paginacion.tsx`).

**Vista TABLA** `components/ProductosAgrupados.tsx`: columnas `:156-165`, plantilla `:27`; «Seleccionar todo» `:122-154`; variantes `:236-274`; costo = rango de variantes (`:19-25`). Lote: solo Activar/Desactivar (`:100-114`) = UPDATE directo a `productos.estado` protegido por RLS `productos_write_lider` (`0004_rls.sql:30`); la selección no se limpia al cambiar de página. Menú `⋯` `MenuFila` (`:288-415`): Editar `:351`, Ajustar (solo líder) `:361`, Ver historial `:376`; **Duplicar y Archivar son fantasmas** (`window.alert("… todavía no está conectado")`, `:319-327`, `:385-402`).

**Vista GRILLA** `components/ProductosGrilla.tsx`: swatches `:82-132`; rango de precio `:35-41` (usado `:219`); «Stock N» `:220` (rojo si 0, ámbar si bajo, `:179-181`). El badge «MUESTRA — <color>» (`:199-201`) **no es un estado real de muestra**: es el placeholder de «color activo sin foto» (`:192-203`) → rotulado engañoso.

**Ajustar inventario** `components/AjustarInventarioModal.tsx`: el input es **DELTA**, no cantidad absoluta (`:50`, placeholder «0» `:236`, resultado `actual+delta` `:109`). Llama a `registrar_movimiento` con `p_tipo:"ajuste"` **una vez por variante** (`:158-169`) → **no atómico**: si falla a mitad, las líneas aplicadas quedan y solo se quitan del formulario (`:170-183`). Candado de líder en la base: `20260921120000_candado_de_lider_caja_y_ajuste.sql:161` (`fn_es_lider()`, 42501); UI lo esconde en `ProductosAgrupados.tsx:361` y `ProductosGrilla.tsx:327`. Append-only: inserta en `movimientos` (`:190-192`) + `fn_aplicar_movimiento`; trigger `movimientos_inmutables` prohíbe UPDATE/DELETE (`20260914165703_movimientos_inmutables.sql:73`). **Motivos**: 4 fijos en el cliente (`:22-27`); la base guarda texto libre (`0002_esquema.sql:131`, sin CHECK); obligatorio solo en el cliente (`:139`) → llamando la RPC directo puede ir NULL. Stock negativo bloqueado en cliente (`:113`, `:147-152`) y base (`20260920160000_apartar_stock.sql:148-158`, incluido no bajar de lo apartado). Sede: `persona.ubicacionId` (cookie `cayla_ubicacion_activa`, `lib/persona-actual.ts:54-71`). **«stock 0» del modal = stock de piso/almacén de ESA sede; «Stock N» de la tarjeta = total de TODAS las sedes → no coinciden.** Sin piso/almacén separados no hay pestañas y se ajusta el sumado (`:45`, `:94-97`).

**Nuevo producto** `components/NuevoProductoForm.tsx`: guarda con RPC `crear_producto_con_variantes` (`:257-269`; vigente en `…20260918231100_alta_y_edicion_exigen_marca_y_proveedor.sql:68`), una transacción, idempotente con token `useRef` (`:64-66`, RPC `:99-103`). Validación cliente `lib/alta-producto.ts:175-199` (`problemasAlta`), **sin Zod** (TypeScript puro; no hay esquema de producto en `packages/shared`). **Precio**: cliente exige `> 0` (`alta-producto.ts:195`), RPC acepta `>= 0`. **Costo**: opcional; vacío se guarda como 0 (`NuevoProductoForm.tsx:245`, RPC `coalesce(...,0)`) → origen del «Costo S/0.00» de la captura 7; sin aviso de margen (`:213`). Parecidos: `lib/use-parecidos.ts:41` (RPC `buscar_productos_parecidos`), el servidor revalida (idéntico bloquea; una letra pide confirmar, `…231100.sql:105-118`). Normalización «Se guardará como»: `tituloReferencia` `alta-producto.ts:19` (espejo de `fn_titulo_referencia`). **Código previsto**: `codigoBasePrevisto` `alta-producto.ts:90` = prefijo + `ultimo+1` leído al cargar (`alta-producto-datos.ts:65,97`); el real lo asigna `fn_asignar_codigo_producto` (`20260912235500_vocabulario_cerrado.sql:175`) con `fn_siguiente_correlativo` atómico (`:148-157`) → **puede diferir** (la pantalla ya lo avisa `:755`). Sin borrador (sin localStorage). Enter no envía el formulario. Tras crear: `ProductoCreado` con «crear otro parecido».

**Fantasmas y rarezas.** Duplicar/Archivar (arriba); `[id]/editar/page.tsx:71-88` muestra dos tarjetas punteadas con `TODO(Sesión A2/A3)` visibles al usuario (Ajustar inventario / Ver historial, que ya existen en la lista); el botón **Editar se muestra al integrante** (`ProductosAgrupados.tsx:351`, `ProductosGrilla.tsx:323`) pero `editar/page.tsx:17` lo redirige a `/productos` → botón sin efecto.

**Roles.** Integrante: no ve «+ Nuevo producto» (`page.tsx:114`), ni Activar/Desactivar (`ProductosAgrupados.tsx:127`), ni Ajustar. Solo líder: lista de altas hechas en un conteo (`page.tsx:76,122`).

**Rendimiento.** Paginación real en base; `p_por_pagina` tope 100 (`…231300.sql:70`), la app pide 24; sin riesgo del tope 1000. El CTE `agregado` (`:88-141`) calcula demanda y lead time con dos laterales sobre `movimientos` **para todos los productos filtrados antes del `limit`** (`:161-168`) y `fn_productos_resumen` lo repite → O(productos × movimientos); con miles de productos hay que precalcular. `ilike '%…%'` de `fn_productos_buscar` (`:47-52`) sin índice trigram en `productos`. Existen `productos_marca_idx` y `productos_proveedor_idx` (`…231000.sql:146-147`); no hay índice sobre `estado`.

**Estética.** `text-[9px]` badge Muestra (`ProductosGrilla.tsx:199`); `text-[10px]` código/categoría de tarjeta (`:209`) y chips/«Limpiar todo» (`FiltrosProductos.tsx:135,150`); `text-[10.5px]` marca en tabla con `text-tinta/45` (`ProductosAgrupados.tsx:207`); Descontinuado `text-tinta/45` (`ui/Chip.tsx:30`) → contraste bajo (ADR-0012 fija piso). Táctil: checkboxes 14 px (`ProductosAgrupados.tsx:123,180`), botón `⋯` 28 px (`:340`), chips de filtro ~22 px, swatches 16 px (`ProductosGrilla.tsx:87`). `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`) solo lo hacen cumplir `TarjetaIndicador`, `TarjetaCifra` y `FlujoGuiado`; **Productos no lo aplica**: varios «Stock 0» en rojo a la vez (`ProductosGrilla.tsx:181`, `ProductosAgrupados.tsx:171`) — la captura 2 muestra 4 seguidos.

**Tests existentes.** `lib/alta-producto.test.ts`, `lib/ajuste-reglas.test.ts`, `lib/reorden-reglas.test.ts`, `lib/catalogo-grupos.test.ts`. No hay tests de `fn_productos`/`fn_productos_resumen`, de los componentes, del candado D-13 ni e2e. (No se revisó `scripts/pruebas/`.)

## 4 · Hallazgos de docs ya cruzados (para el Paso 3)

- **D-13** (`docs/datos/DECISIONES-2026-09-12.md:72`): el líder puede *ver costos y márgenes* y *ajustar stock sin venta*; el integrante no. **`01-INVARIANTES.md` §2 (fila «Que un integrante no vea el costo de cada prenda», verificado 2026-09-19): `fn_productos` devuelve `costo` y `precio` a cualquier sesión** — la columna Costo de la tabla (captura 5/7) la ve un integrante; hueco conocido, decisión de Felipe pendiente (BACKLOG líneas ~315-318). Candidato a tarea alta.
- **Invariante `codigo` inmutable** solo por costumbre (§2, ADR-0025): nada impide editar `productos.codigo`. Relevante para «Editar».
- **`movimientos.motivo` texto libre sin CHECK** (§2): coincide con el hallazgo del ajuste; además `ultima_venta` depende de comparar `motivo = 'venta'`.
- **Candados que sí existen** (§1): stock no negativo (`stock_cantidad_no_negativa` + guardia en `fn_aplicar_movimiento`), `movimientos_cantidad_coherente`, `variantes_identidad_unica`, `productos_codigo_unico`, `variantes_codigo_unico`, `codigos_barras_codigo_key`.
- **Permisos en producción** (§2): `es_lider()` = rol `admin`; `supervisor_sede` no pasa ningún candado de `retail`.
- BACKLOG (sección «Crear producto como árbol de decisión», ~línea 922): pendientes reales — verificar marca/proveedor con sesión de líder real; base local sin patrones («Liso» inexistente); «+ Nuevo color» enlaza a otra pestaña; completar tejido/patrón de 38 productos activos de Indumentaria; `fn_productos` sigue mostrando stock físico (líneas ~89-90, no el disponible).
- BACKLOG línea ~70: el modal «Ajustar» estuvo roto desde 2026-09-17 (pedía `variantes.talla` eliminada); fila 31 de SESIONES-ACTIVAS dice que se arregló; **falta verlo con datos reales** — la captura 4 muestra que ya abre con variantes y «S / Marrón», así que funciona en pantalla.

## 5 · Sospechas del mapa (candidatas a hallazgos; verificar con SQL)

1. «A quién pedirle»: el enlace por proveedor descarta los demás filtros, el conteo puede cambiar al hacer clic.
2. «Stock N» de tarjeta (todas las sedes) vs «stock 0» del modal (esa sede): un producto con «Stock 20» puede no dejar bajar en el modal.
3. Botón Editar visible al integrante que termina en redirect silencioso.
4. Precio 0 permitido por la RPC pero no por el cliente; costo vacío = 0.00 sin advertencia (captura 7).
5. Ajuste multivariante no atómico; motivo sin CHECK.
6. Selección de la tabla persiste entre páginas mientras «seleccionar todo» solo mira la actual.
7. `getReposicionPorProveedor` puede ocultar proveedores si pasan de 300 productos por reponer.
8. Umbrales de stock bajo/pedir sin explicación en pantalla.
9. Badge «MUESTRA» engañoso; Duplicar/Archivar fantasmas; TODOs visibles en Editar.
10. KPIs y «Stock N» ignoran la sede activa pese al selector «TIENDA TRU» de la cabecera (decisión documentada, pero la etiqueta de sede sugiere lo contrario).
11. Cifras del BACKLOG a contrastar con producción: 44 productos visibles (BACKLOG 2026-09-19) — coincide con la captura.

## 6 · Paso 2 — SQL para producción (pendiente de resultado)

Solo lectura, sin datos personales. Se pega en el SQL Editor del proyecto **cayla-dynamic** (schema `retail`, prefijo ya puesto). Nunca guardar en `supabase/migrations/`. Cada bloque por separado. Si un nombre de columna falla en E3/E4c, revisar con A1 y ajustar.

```sql
-- A1. Columnas
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'retail'
  and table_name in ('productos','variantes','stock','movimientos','marcas','marca_proveedores','categorias','codigos_correlativos')
order by table_name, ordinal_position;

-- A2. Constraints
select conrelid::regclass::text as tabla, contype, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in (select oid from pg_class where relnamespace = 'retail'::regnamespace
  and relname in ('productos','variantes','stock','movimientos','marcas','marca_proveedores','categorias','codigos_correlativos'))
order by 1, 2, 3;

-- A3. Índices
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'retail'
  and tablename in ('productos','variantes','stock','movimientos','marcas','marca_proveedores')
order by 1, 2;
```

```sql
-- B1. Volumen y crecimiento
select 'productos' t, count(*) filas, count(*) filter (where created_at > now() - interval '30 days') ult30 from retail.productos
union all select 'variantes', count(*), count(*) filter (where created_at > now() - interval '30 days') from retail.variantes
union all select 'movimientos', count(*), count(*) filter (where created_at > now() - interval '30 days') from retail.movimientos
union all select 'movimientos tipo=ajuste', count(*), count(*) filter (where created_at > now() - interval '30 days') from retail.movimientos where tipo = 'ajuste'
union all select 'stock', count(*), 0 from retail.stock;
```

```sql
-- D1. Políticas RLS
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'retail' and tablename in ('productos','variantes','stock','movimientos','marcas','marca_proveedores','categorias')
order by 1, 2;

-- D2. ¿RLS activado?
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'retail'::regnamespace and relkind = 'r'
  and relname in ('productos','variantes','stock','movimientos','marcas','marca_proveedores','categorias');

-- D3. Firmas y seguridad de las RPC de la pantalla (sin cuerpo)
select p.proname, pg_get_function_identity_arguments(p.oid) firma, p.prosecdef security_definer, p.proconfig
from pg_proc p
where p.pronamespace = 'retail'::regnamespace
  and p.proname in ('fn_productos','fn_productos_resumen','fn_productos_buscar','crear_producto_con_variantes',
                    'catalogo_actualizar_producto','buscar_productos_parecidos','registrar_movimiento',
                    'fn_aplicar_movimiento','fn_asignar_codigo_producto','fn_siguiente_correlativo','fn_es_lider')
order by 1, 2;

-- D4. Cuerpo real de dos funciones críticas
select p.proname, pg_get_functiondef(p.oid) definicion
from pg_proc p
where p.pronamespace = 'retail'::regnamespace and p.proname in ('registrar_movimiento','crear_producto_con_variantes');
```

```sql
-- E1. Tablas sin RLS (debe salir vacío)
select relname from pg_class
where relnamespace = 'retail'::regnamespace and relkind = 'r'
  and relname in ('productos','variantes','stock','movimientos','marcas','marca_proveedores','categorias')
  and not relrowsecurity;

-- E2. Security definer sin search_path fijo (debe salir vacío)
select proname from pg_proc
where pronamespace = 'retail'::regnamespace and prosecdef
  and proname in ('fn_productos','fn_productos_resumen','fn_productos_buscar','crear_producto_con_variantes',
                  'catalogo_actualizar_producto','buscar_productos_parecidos','registrar_movimiento','fn_aplicar_movimiento')
  and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'));

-- E3. Costo y precio en cero
select count(*) filter (where costo is null or costo = 0)  as variantes_sin_costo,
       count(*) filter (where precio is null or precio = 0) as variantes_sin_precio,
       count(*) as variantes_total
from retail.variantes;

-- E4a. Estados de producto
select estado, count(*) from retail.productos group by 1 order by 2 desc;

-- E4b. Motivos reales de los ajustes
select motivo, count(*) from retail.movimientos where tipo = 'ajuste' group by 1 order by 2 desc limit 30;

-- E4c. Cobertura de datos de decisión
select count(*) as productos,
       count(*) filter (where marca_id is null)     as sin_marca,
       count(*) filter (where proveedor_id is null) as sin_proveedor,
       count(*) filter (where stock_minimo is null) as sin_stock_minimo
from retail.productos;

-- E4d. Stock por producto en varias sedes (desajuste tarjeta vs modal)
select p.codigo,
       sum(s.cantidad) as stock_todas_las_sedes,
       count(*) filter (where s.cantidad > 0) as sedes_con_stock
from retail.productos p
join retail.variantes v on v.producto_id = p.id
join retail.stock s on s.variante_id = v.id
group by p.codigo
having count(*) filter (where s.cantidad > 0) > 0
order by 2 desc limit 15;
```

Al recibir el resultado: clasificar cada dato como **hueco** o **está bien** (con evidencia). Si producción contradice al código o a los docs, gana producción.

## 7 · Lo que falta (en orden)

- [ ] Resultado del SQL de la sección 6 (o «sin SQL» de Felipe).
- [ ] **Paso 3:** 6 dimensiones con puntaje 0–10 y etiquetas `[visto]` `[código archivo:línea]` `[producción]` `[inferido]` `[no verificable]`; puntaje «Cumple su finalidad» (promedio, **tope 5** si hay defecto que pueda dañar dinero o stock — ojo con el costo visible al integrante y el ajuste no atómico) y «Relevancia» = (2·Gestión + Dinero/stock + Frecuencia + Qué se detiene)/5. Referentes de ERP (Odoo/NetSuite) con filtro «¿le sirve a 3 tiendas y 1 taller hoy?»; lo que no pase va a «Futuro».
- [ ] Costuras del flujo (una captura = una pantalla; varias = flujo): qué dato viaja de Nuevo producto → lista → vista rápida → Ajustar (código previsto vs real, costo vacío → 0.00 → margen falso, stock de todas las sedes vs de la sede activa).
- [ ] Escenario de utilidad: colaboradora nueva/líder dando de alta un producto con costo vacío; líder ajustando un producto que muestra «Stock 20» pero «stock 0» en su sede.
- [ ] **Paso 4:** 12 tareas ordenadas por impacto + riesgo (dinero/stock arriba); cada una con dónde / por qué en ese puesto / cómo lo verificas / esfuerzo y dependencias; las estructurales (Reconstruir, Replantear) con DECIDÍ / DESCARTÉ / SE ROMPE SI. Una tarea «Replantear» que pida decidir a Felipe. Bajo valor al final rotulado.
- [ ] Contra análisis previos: leer `docs/pantallas/*.md`; el mismo defecto en 3+ pantallas = una tarea raíz (candidatos: contraste `tinta/45` y `text-[9px]/[10px]`, rojo sin tope, «Stock 0» rojo repetido).
- [ ] **Paso 5:** escribir `docs/pantallas/productos.md` con la plantilla (encabezado con SHA analizado, historial, «Objeción primero», «Lo que está bien y no se toca», «Fuera de esta pantalla», «Líneas propuestas para BACKLOG.md» con `[pantalla:productos]`). No editar BACKLOG. Al chat solo: veredicto en 2 líneas, los dos puntajes, las 3 primeras tareas y el enlace. Borrar este archivo `productos-PENDIENTE.md`.

## 8 · Lo que está bien (borrador; confirmar en el análisis final)

- Ajuste: candado real en la base (`fn_es_lider()` 42501), append-only con trigger, stock no negativo en cliente y base `[código]`.
- Alta: transacción única e idempotente por token; parecidos revalidados en servidor; código atómico con `ON CONFLICT` `[código]`.
- Filtros en la URL, paginación en servidor con tope 100 `[código]`.
- Botones escondidos a quien no es líder (Nuevo, Activar/Desactivar, Ajustar) `[código]`.
- Vocabulario cerrado guiando el formulario (familia → categoría, tejido/patrón obligatorios en Indumentaria) `[visto]`.

## 9 · Borrador de objeción (sin confirmar con SQL)

Lo peor hasta ahora: **una pantalla que muestra costo a cualquier sesión y ofrece un costo «opcional» que se guarda como 0.00 sin avisar**, y un botón de ajuste cuyo «stock 0» no es el «Stock N» de la tarjeta. Ambos afectan dinero/stock. Trade-off: esconder costo toca Inventario, Productos y Vender a la vez (Felipe decide; por eso está como hueco conocido, no como tarea automática).
