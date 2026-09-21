# ADR-0152 — Cuentas terminal por tienda: dos por tienda, compartidas, con los poderes de un solo oficio

**Fecha:** 2026-09-21
**Estado:** **Implementado en la rama `claude/terminales-cuentas-129fd4`, probado en local. NADA aplicado en producción**: falta pegar la migración `20260922140000_terminales_por_tienda.sql` (cambio de esquema: **se detiene y se confirma antes de pegar**), crear las 6 personas en Dynamic y darles entrada.
**Decide:** Felipe, el 2026-09-21 (respuestas en «Lo que dijo el negocio»). Arquitectura: este documento.
**Número:** provisional — `0150` ya es «roles y permisos a medida» (abandonado, sin aplicar) y la rama `claude/adr-0145-compras-permisos` (sin subir a GitHub) usa `0151`. **Numerar al subir**, sin reemplazar en masa.
**Refina** ADR-0143 (solo el líder cierra la caja y ajusta stock) y **revierte en parte** ADR-0126 y ADR-0143 *para una cuenta que no es una persona*. **No toca** `fn_puede_registrar_compras()` ni `fn_puede_ver_dinero_de_compras()`: el Compras de la terminal administrativa es de ADR-0151.

## Lo que dijo el negocio (2026-09-21)

1. Cada tienda (TRU, AQP, LIM) tiene **dos cuentas** —seis en total— que **usa todo el equipo**: una **de ventas** y una **administrativa**. Son «terminales», como las de Dynamic.
2. **Ventas**: punto de venta, caja (**incluido cerrar la caja**) y Facturación. Al entrar, **aterriza en el Punto de Venta**. El combo que pide el nombre de quien atiende (trazabilidad) **se desarrolla en otra sesión**.
3. **Administrativa**: inventario —**con ajustes de stock y cierre de conteo**— y catálogo, **incluidas las cuentas bancarias de proveedores**, y Compras. Sin identificar a quien opera: la terminal «hace todo».
4. Solo tiendas: **el Taller no lleva terminales**.

## Contexto — el problema primero

Hasta hoy retail distingue dos niveles: `lider` (cambia de tienda, ve las tres, cierra caja, ajusta stock, da y quita accesos) y `colaborador` (sede fija, sin dinero, sin esos actos). Una cuenta que **usa todo el equipo** no puede ser líder —cualquiera que sepa la clave manejaría la red entera— ni un colaborador común: no podría cerrar la caja del día ni ajustar el stock que el negocio quiere que la tienda resuelva sola. Necesita el punto medio: **los poderes de un solo oficio, en una sola tienda**.

Dos hechos medidos en producción (solo lectura, 2026-09-21) fijan la forma de la solución:

- **57 llaves foráneas de retail apuntan a `public.personas`** (`ventas.usuario_id`, `movimientos.usuario_id`, `compra_pagos.usuario_id`…). Una terminal «de Dynamic» —un usuario de acceso **sin** fila en `personas`— no puede ni cobrar una venta. Por eso cada terminal es una **persona de servicio en Dynamic** más su fila en `retail.colaboradores`.
- **Ninguna de las 119 políticas de fila usa `auth.uid()` directo**: todas pasan por ayudantes (`fn_es_lider()`…). Y 81 funciones lo usan inline. Esa cifra descartó el diseño alternativo (turno de operador con PIN y `fn_actor_uid()`), que exigía reescribir las 81 y que el negocio no pidió.

**Analogía CAYLA:** la llave del taller es una, pero la orden de producción la firma quien trabajó. Aquí la cuenta es la llave de la tienda; las cuentas de ventas y administrativa **no** tienen la llave maestra de la oficina (el líder).

**Cómo se ve mal hecho:** dar «líder» a la cuenta compartida (una clave repartida abre las tres tiendas, la Facturación, los accesos y todo el dinero); o esconder botones sin candado en la base (`menu.ts` lo dice: *un nodo que no se pinta no protege nada*); o abrir **Compras** cambiando `fn_puede_registrar_compras()` a secas: las funciones de pago reciben un `compra_id` **sin filtrar por tienda** y la terminal de TRU pagaría la factura de AQP (lo detectó ADR-0151, D1).

## Decisión

**D1 — Una columna, no un rol nuevo.** `colaboradores.terminal` (`null` = una persona; `'ventas'` | `'administrativa'`), **también en `colaboradores_suspendidos`** para que suspender y reactivar no pierda el tipo. `CHECK`: solo un `colaborador` puede ser terminal (nunca un líder). **Índice único parcial:** una terminal de cada tipo por tienda. Es un colaborador de sede fija, así que **hereda todo el esquema de seguridad que ya existe** (RLS, `fn_puede_operar_ubicacion`, el `CHECK` de sede fija de ADR-0145).

**D2 — La terminal decide qué módulos hay; el permiso decide qué puede hacer.** Dos ejes que no se mezclan:

| Eje | Dónde vive | Qué dice |
|---|---|---|
| **Módulos** | `terminales?` de cada nodo de `apps/web/lib/menu.ts` (`:118`, filtro en `esVisible` `:362`) | Qué filas ve. **Sin declarar, ninguna terminal lo ve** (falla cerrado: un módulo nuevo no se filtra a una cuenta compartida por olvido). Las hijas heredan las del grupo. |
| **Poderes** | `permisosDe(rol, terminal)` (`menu.ts:81`) + capacidades en la base | Qué actos puede hacer. |

**D3 — Cinco capacidades en la base, cada una «líder O terminal de tal tipo»** (`fn_puede_*()`, nunca devuelven `null`: lección de `docs/datos/14-DYNAMIC.md` §6, un `not null` no dispara el `raise exception`):

| Capacidad | Quién además del líder | Qué abre |
|---|---|---|
| `fn_puede_gestionar_caja()` | terminal de **ventas** | `cerrar_caja`, `registrar_movimiento_caja` |
| `fn_puede_ajustar_inventario()` | terminal **administrativa** | `registrar_movimiento` (ajuste), `cerrar_conteo`, `cerrar_traslado_con_diferencia` |
| `fn_puede_editar_catalogo()` | terminal **administrativa** | 15 políticas de fila, 5 disparadores de estado, 7 funciones (categorías, marcas, productos, censo) |
| `fn_puede_editar_cuentas_proveedor()` | terminal **administrativa** | `guardar_cuentas_proveedor` |
| `fn_puede_dar_descuento_por_etiqueta()` | **nadie más que el líder** | el guardia de `crear_producto_con_variantes` (ver «Descartado») |

**D4 — Los candados se inyectan, no se copian.** La migración lee `pg_get_functiondef` de cada función y cambia `fn_es_lider()` por su capacidad (`pg_temp.reemplazar`, `…140000_terminales_por_tienda.sql:209`), **exigiendo la cantidad exacta de ocurrencias medida en producción**; si la función cambió, aborta con un mensaje claro y no toca nada. Para las políticas, `pg_temp.conceder_politica` (`:254`), que funciona **con o sin el prefijo `retail.`** (con `set search_path to retail, public;` `pg_policies` lo muestra sin él: la primera versión abortaba, la detectó correr `pruebas:candado-lider` con esta migración encima). Mismo patrón que `fn_aplicar_candado_de_dinero()` (ADR-0126) y por la misma razón: en producción estas funciones se pegan a mano y copiar un cuerpo del repo pisaría una versión más nueva.

**D5 — El alta es una RPC nueva, `agregar_terminal(persona, tienda, tipo)`**, solo del líder, siempre como colaborador, **solo en una tienda activa** y con aviso si esa tienda ya tiene su terminal de ese tipo. Función **nueva** y no un parámetro más en `agregar_colaborador`: `create or replace` con otra firma deja dos versiones vivas a la vez.

**D6 — La web pregunta por un permiso, no por «¿es líder?».** `requirePersonaActualV2` trae `terminal` y `permisos` (`persona-actual.ts:61`, en paralelo con el resumen, sin sumar una espera) y ofrece `puede(persona, permiso)` y `exigirPermiso(permiso)`. Si `fn_mi_terminal` aún no existe en esa base (la web se desplegó antes que la migración) la cuenta se lee como persona común: **pierde poder, nunca lo gana**.

**D7 — Alta en `/colaboradores`:** botón «+ Agregar terminal» y un modal aparte (persona, tienda, tipo; abre **sin nada elegido**, ADR-0145). Una terminal no se muda de tienda (la fila no ofrece «Cambiar ubicación»): se quita y se agrega otra; así nunca queda una en el Taller.

## Qué cambia

- **Base:** `supabase/migrations/20260922140000_terminales_por_tienda.sql` (columna, índice, `fn_es_terminal`, `fn_mi_terminal`, cinco capacidades, `agregar_terminal`, 13 funciones con candado, 5 disparadores y 15 políticas; y `suspender_colaborador` y `reactivar_colaborador` ahora conservan el tipo). Pruebas: `scripts/pruebas/terminales_por_tienda.mjs` (`pnpm pruebas:terminales`, en el CI): **75 casos, un escenario por actor, con objetos reales** —un conteo abierto, un traslado «recibido con diferencia», una caja abierta— porque varias funciones verifican que el objeto exista **antes** del candado y llamarlas con un id inventado no distingue a nadie. Se rompió la migración a propósito de 4 maneras y el test las detecta todas. `candado_lider_caja_y_ajuste.mjs` (ADR-0143) se ajustó para reconocer las capacidades: lo que prueba es la **posición** de la puerta, no su nombre; 20/20 con y sin esta migración encima.
- **Web:** `lib/menu.ts` (terminales, cuatro permisos nuevos y `facturar`, que reemplaza a `verDinero` en la fila Facturación), `lib/persona-actual.ts`, aterrizaje de la terminal de ventas en `/vender` (`app/(app)/page.tsx`), y cada control que decidía por «es líder» pasa a su permiso: **Caja** (`CajaAbiertaPanel`, `PuntoDeVenta`), **Existencias y Productos** (`InventarioPanel`, `ProductosAgrupados`, `ProductosGrilla`), **Conteo**, **Traslados** (`esLider` → `puedeCerrarDiferencia`: siempre significó eso), **Facturación** (layout y cuatro vistas con `exigirPermiso("facturar")`; anular, «liberar sin espera», registrar serie y la pestaña de descuentos siguen ocultos para quien no es líder) y **Catálogo** (7 rutas de API y 7 pantallas). Cuando un mismo `esLider` gobernaba dos cosas distintas se **separó en props con nombre** (en Existencias, «Ajustar» se abre y «resolver prendas dañadas» no; en Conteo, cerrar es Inventario y crear marcas es Catálogo).
- **Tests:** `menu.test.ts` (permisos de cada terminal, el menú de cada una y el invariante *falla cerrado*), `colaboradores-reglas.test.ts` (una terminal no se muda) y `facturacion-puerta.test.ts`, que ahora exige **exactamente** `exigirPermiso("facturar")` en las cuatro vistas y `exigirLider()` en descuentos. Suite web completa: **104 archivos, 7.752 pruebas**.

## Descartado

- **Turno de operador con PIN y `fn_actor_uid()`** (la terminal como usuario sin persona, como en Dynamic): trazabilidad completa, pero reescribe 81 funciones y agrega fricción en cada acción. El negocio prefirió la terminal simple; el combo de ventas cubre la trazabilidad donde importa.
- **Abrir Compras cambiando `fn_puede_registrar_compras()`**: la terminal de una tienda pagaría facturas de otra (ver arriba). Es de ADR-0151: la administrativa entra como «comprador de tienda» de la suya.
- **Un rol «terminal» en `colaboradores.rol`** (`fn_persona_actual_resumen` y 87 migraciones leen `rol`): una columna aparte no rompe nada de lo que ya funciona.
- **Etiquetas dentro del Catálogo de la terminal:** pueden llevar `descuento_pct` y eso baja el precio. Sus políticas, su disparador, `etiquetar_variantes`, `actualizar_variantes_etiquetas` y `actualizar_campana_etiqueta` **siguen solo del líder**. Como `crear_producto_con_variantes` deja elegir cualquier etiqueta aprobada, se le insertó un guardia (`fn_puede_dar_descuento_por_etiqueta`) para que la terminal no le cuelgue un descuento a la prenda que crea.
- **Resolver y liquidar prendas dañadas, anular ventas y comprobantes, aprobar devoluciones, series de comprobantes, códigos de descuento, crear proveedores:** no estaban en la matriz que aprobó Felipe; siguen del líder. `recibir_envio` conserva una rama de líder (cierres y notas de crédito) que es de Compras.

## Se rompe si

- **Las personas de servicio salen en la marcación de Dynamic.** La vista `terminal_roster` lista a toda persona activa de la sede (verificado en el diccionario; la planilla no se revisó). El ajuste es del repo de Dynamic, no de este.
- **Otra migración recrea `cerrar_caja`, `registrar_movimiento`… desde un archivo viejo del repo:** vuelven a `fn_es_lider()` y la terminal pierde el poder. Falla **cerrado** y `pnpm pruebas:terminales` lo detecta.
- **Alguien mueve una terminal al Taller llamando `cambiar_ubicacion_colaborador` a mano:** la web no lo ofrece, pero **la base no lo impide** (un `CHECK` no puede mirar `ubicaciones`). Queda como deuda: un disparador.
- **Lo que crea la administrativa en el Catálogo queda aprobado sin revisión de un líder, y puede fijar precio y costo.** Es lo que pidió el negocio («escribir en el catálogo»). Para volver a exigir revisión basta quitar los cinco disparadores de la lista (8.e) o apuntarlos a `fn_es_lider()`.
- **Cualquiera que sepa la clave de una terminal actúa como ella**: cada acción queda a nombre de «Terminal Ventas TRU». El combo de ventas cubre la trazabilidad de la venta; para lo demás, **rotar la clave cuando alguien deja de trabajar ahí**. Las claves las crea Felipe en Supabase Auth: nadie las escribe por él.
- **Se despliega la web antes que la migración:** no pasa nada (las cuentas se leen como personas; el menú es el de un colaborador). **Al revés** tampoco: sin `terminal` cargada nadie tiene los poderes.

## Cómo se pega en producción (con el OK de Felipe)

1. **Antes:** `pnpm pruebas:terminales --en-seco` y `pnpm pruebas:candado-lider --en-seco` en verde. Nada que verificar en datos (la columna nace `null`).
2. Pegar **entera** `20260922140000_terminales_por_tienda.sql` en el SQL Editor de cayla-dynamic (ya trae `retail.`; se puede pegar dos veces y con `set search_path to retail, public;`). Si alguna función o política cambió desde el 2026-09-21, **aborta con un mensaje que nombra cuál** y no aplica nada; entonces se regenera ese reemplazo desde su definición real.
3. **Verificar en solo lectura:** `select column_name from information_schema.columns where table_schema='retail' and table_name='colaboradores' and column_name='terminal';` (1 fila); las 15 políticas de Catálogo mencionan `fn_puede_editar_catalogo`; `cerrar_caja` ya no contiene `fn_es_lider()`.
4. **Los 6 accesos** (los crea Felipe): 6 personas en Dynamic con su correo y 6 usuarios en Supabase Auth; después, `/colaboradores` → «+ Agregar terminal» ×6 (TRU, AQP y LIM; ventas y administrativa).
5. **Probarlas con clics** (nadie las ha visto en el navegador: yo no escribo claves, así que entrar como terminal lo hace Felipe): entrar como terminal de ventas (¿aterriza en Punto de Venta? ¿cierra la caja? ¿Facturación abre y no ofrece Anular?) y como administrativa (¿ajusta stock, cierra un conteo, crea una categoría? ¿Compras **no** aparece todavía?).
6. **Refrescar el diccionario** (`pnpm datos:generar:produccion`, regla de oro de `CLAUDE.md`): la columna `terminal` entra al diccionario.

## Abierto

1. **Compras de la administrativa (ADR-0151).** La terminal debe ser «comprador de tienda» de la suya. F1 (lectura) está escrita en su rama, sin subir ni aplicar; registrar y pagar por tienda (F3/F4) no existe. El árbol ya declara Compras para ella: el día que reciba `verDinero`, aparece **sin tocar `menu.ts`** (lo prueba `menu.test.ts`). Mientras tanto la pantalla donde se editan las cuentas bancarias (Compras → Proveedores) no está a su alcance: el candado en la base ya está listo, la puerta llega con Compras. **Conflicto esperado al fusionar:** `menu.ts` (`permisosDe`, para el comprador), `ci.yml` y `package.json` (ambas ramas agregan una prueba al final).
2. **El combo «¿quién atiende?» del punto de venta** (`ventas.vendedor_id`): otra sesión.
3. **Disparador que impida mover una terminal al Taller** (ver «Se rompe si»).
4. **La rama de ADR-0151 no está subida a GitHub**: solo existe en la máquina de Felipe.
