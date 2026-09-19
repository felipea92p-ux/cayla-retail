# ADR-0132 — Compras: un comprobante se reparte entre tiendas y cada tienda recibe lo suyo

**Fecha:** 2026-09-18 (diseño) · 2026-09-19 (implementación en curso)
**Estado:** Aceptado. **Implementación EN CURSO** desde 2026-09-19, en la rama `claude/modulos-por-tienda-ca0f59`, de la
mano con la sesión «Recibir UI/UX» (dueña de la pantalla `/recibir`; acordado por mensaje). La condición de espera de la
primera versión de este documento se cumplió: la rama de Compras se fusionó a `main` (PR #149, su ADR quedó como 0111).
Nada aplicado todavía en la base local compartida ni en producción.
**Decide:** Felipe, en lo de negocio (una factura de proveedor puede traer mercadería para varias tiendas y cada tienda
hace su propia recepción). Arquitectura: este documento.
**Afecta cuando se implemente:** `compras`, `compra_items`, dos tablas nuevas (`compra_item_destinos`,
`compra_reasignaciones`); `registrar_compra`, `recibir_compras`, `listar_compras`, `resumen_compras` y todo lo que hoy
usa `compras.ubicacion_destino_id` como candado; las cuatro pantallas de Compras.

## Contexto (verificado el 2026-09-18 contra `main` `3573959` y contra producción, solo lectura)

1. Hoy la factura tiene **un** destino: `compras.ubicacion_destino_id` (NOT NULL). Es a la vez «a dónde va la
   mercadería» y la llave de seguridad de las cuatro tablas de lectura (ADR-0075).
2. `recibir_compras` topa lo recibido de cada línea sumando `movimientos.compra_item_id` de **todas** las ubicaciones
   (`20260917100001_recibir_compras_fuera_de_factura.sql:63`). Nada sabe cuánto le toca a cada tienda. Con una factura
   repartida: si TRU recibe 14 de 24, AQP queda topada en 10 sin aviso; si recibe las 24, AQP no puede recibir nada; y
   un integrante de AQP ni siquiera ve la factura (RLS por el destino de la cabecera).
3. Las tres pantallas (Comprobantes, Recibir mercadería, Por pagar) no filtran por ubicación: solo las acota RLS, que
   deja pasar todo al líder (`fn_puede_operar_ubicacion = fn_es_lider() or ubicación propia`,
   `0006_colaboradores.sql:51`). El resto de la app trabaja sobre «dónde estás parado» (cookie
   `cayla_ubicacion_activa`, `lib/persona-actual.ts`). `AppShell.tsx:589` dice que Compras también lo hace («igual que
   Vender/Inventario/Compras») y no es así; Recibir promete «Compras · <ubicación>» y lista todo.
4. Producción: 4 ubicaciones activas y **0 comprobantes**. No hay datos que migrar: antes del primer comprobante real
   es el momento más barato para cambiar el modelo.
5. Reglas del negocio que mandan (`docs/datos/15-COMO-OPERA-CAYLA.md`): **R-04** pagar a un proveedor no toca el cuadre
   de ninguna sede; **R-10** pagan Compras y Felipe, rara vez las líderes de equipo; **R-12** los proveedores sirven
   a las tres tiendas a la vez y separar por cuentas protege plata, no la atribuye.

## Decisión

### 1. Qué es «por tienda» en cada módulo

«Por tienda» son tres cosas distintas: **perspectiva** (qué muestra la pantalla al abrirla), **permiso** (quién puede
leer u operar) y **atribución** (a qué tienda pertenece el registro). Compras ya tiene permiso (ADR-0075); le faltan
perspectiva y una atribución que aguante el reparto.

| Módulo | ¿Se parte por tienda? | Por qué |
|---|---|---|
| Recibir mercadería | **Sí.** Perspectiva = la ubicación activa; muestra lo que le toca a esa tienda. | Es un acto físico en un lugar: `recibir_compras` mete el stock en una sola ubicación. |
| Comprobantes | **No.** Un documento de la empresa; muestra sus destinos y filtra por destino (por defecto, todos). | Lo registra Compras (`fn_puede_registrar_compras`, solo líder); si viera solo su tienda, «faltarían» comprobantes que sí existen. |
| Por pagar | **No.** La deuda es una; mismo dato «Destino» y mismo filtro, solo para atribuir. | R-04, R-10, R-12. La pregunta de la pantalla («¿qué pago hoy y cuánta liquidez necesito?») solo se responde con el total. |

### 2. Modelo de datos

- **`compra_item_destinos (compra_item_id, ubicacion_id, cantidad)`**, PK `(compra_item_id, ubicacion_id)`,
  `cantidad > 0`. Es el **plan**: cuánto de cada línea va a cada tienda. La línea sigue siendo el papel tal como llegó.
- **`compra_reasignaciones`**, bitácora append-only: línea, tienda de origen, tienda de destino, cantidad, motivo,
  quién, cuándo. Nunca se edita ni se borra.
- **Lo recibido por tienda no se guarda**: sale de `sum(movimientos.cantidad) where compra_item_id = L and
  ubicacion_id = U` (una sola fuente de verdad; `movimientos` ya anota la línea y la ubicación, el núcleo no se toca).
  `pendiente(L, U) = asignado − recibido` (menos lo cerrado, ver §3).
- **Tres candados que hace cumplir la base, no la pantalla:**
  1. La suma de lo asignado a una línea es igual a su cantidad: *constraint trigger diferido* en ambas tablas
     (valida al confirmar la transacción, así `registrar_compra` inserta línea y reparto juntos).
  2. Una tienda no recibe más de lo asignado a ella: dentro de `recibir_compras`, aprovechando el `for update` sobre la
     línea que ya existe (serializa recepciones concurrentes de la misma línea).
  3. Reasignar solo mueve lo que la tienda de origen aún no recibió, con el mismo candado de fila.
- **Escritura solo por RPC**, sin políticas de INSERT/UPDATE/DELETE, igual que `compras`.
- **`registrar_compra`** se extiende **sin cambiar la firma**: cada ítem de `p_items` puede traer
  `destinos: [{ubicacion_id, cantidad}]`; `p_ubicacion_destino_id` pasa a significar «destino de las líneas que no
  traen su reparto». Así una web vieja sigue funcionando contra la base nueva. La base **siempre** guarda reparto,
  aunque sea de una sola tienda: no hay caso especial en ninguna consulta.
- **`reasignar_reparto_compra(p_compra_item_id, p_desde, p_hacia, p_cantidad, p_motivo)`**: solo líder, motivo
  obligatorio. Cubre «llegó de más a TRU» y «se equivocaron de tienda», que sin esto obligaría a anular el comprobante.
- **Seguridad de lectura:** helper `fn_puede_ver_compra(p_compra_id)` = líder, o alguna línea repartida a mi ubicación.
  Reemplaza a `fn_puede_operar_ubicacion(c.ubicacion_destino_id)` en las 4 políticas y en las funciones.
- **Lectura:** `compras_resumen` expone `destinos` y un `estado_recepcion` agregado; `listar_compras` y
  `resumen_compras` ganan `p_ubicacion_id` (comprobantes con algo para esa tienda). Cambiar una firma es `drop function`
  de la vieja + `create`, nunca `create or replace` con parámetro nuevo (deja dos sobrecargas vivas y PostgREST responde
  «could not choose the best candidate function»).
- **`compras.ubicacion_destino_id` desaparece.** Dos verdades (destino en la factura y reparto aparte) permitirían un
  estado imposible. Antes de soltarla se copia a `compra_item_destinos` (una fila por línea, cantidad completa), así una
  base con datos de prueba no pierde información. Alternativa de transición, **descartada como estado final**: dejarla
  como «destino principal» derivado por trigger; es un concepto que no significa nada para quien opera y una trampa
  (filtrar por ella pierde las partes secundarias).

### 3. Cómo encaja con ADR-0111 (por confirmar al integrar)

ADR-0111 agrega el cierre de faltantes (`compra_item_cierres`: «estas N unidades no van a llegar») y la nota de crédito.
Con reparto:
- `compra_item_cierres` debe llevar **`ubicacion_id`**: lo que faltó es de una tienda concreta.
  `pendiente(L, U) = asignado − recibido − cerrado`; una tienda queda cerrada cuando recibido + cerrado = asignado.
- «Todo llegó» y el panel «Lo que faltó» de la guía operan sobre **la parte de la tienda que recibe**. La nota de
  crédito sigue siendo una por comprobante (es un documento del proveedor), por lo cerrado en todas las tiendas.
- El comprobante pasa a `recibida` cuando **todas** las partes están recibidas o cerradas.
- Pago por lote y deuda no cambian.

### 4. Experiencia de uso (UI/UX)

Principios: (1) el sistema dice **lo que falta**, no solo que hay un error («Faltan 4 por repartir», no «suma
inválida»); (2) cada número se explica solo («Te toca 12 · Recibiste 4 · Faltan 8»); (3) la tienda ve primero lo suyo y
lo de otras tiendas es secundario y solo para líderes; (4) lo que se mueve deja rastro y motivo a la vista; (5) misma
piel que las maquetas aprobadas de ADR-0111 (`docs/maquetas/compras-2026-09/`): solo son nuevos el interruptor de
destino, la fila de reparto y la sección «Reparto por tienda». Maquetar esos tres y que Felipe los apruebe **antes** de
construir, como se hizo en ADR-0111.

- **Registrar comprobante.** Interruptor «Todo a una tienda» (por defecto, el selector «Mercadería destinada a» de
  siempre: un clic) | «Repartir entre tiendas». En «Repartir», cada línea muestra una fila con una casilla por tienda
  activa y un contador «Repartidas 20 de 24»: verde con ✓ cuando cuadra, ámbar «Faltan 4», rojo «Sobran 2». Atajos:
  «En partes iguales» y «Todo a <tienda>». Registrar se apaga diciendo por qué («Faltan 4 por repartir en Blusa Lino M
  Arena»). Volver a «Todo a una tienda» con un reparto armado pide confirmación. En celular, cada línea es una tarjeta
  y el reparto son filas con − n +. Sin destino elegido no hay valor por defecto silencioso: quien registra es Compras,
  no está parada en la tienda que recibe.
- **Recibir mercadería.** Encabezado «Recibiendo en **Tienda TRU**» (selector solo para líderes; el integrante ve el
  nombre fijo). Cada comprobante muestra «Te toca 12 · Recibidas aquí 4 · Faltan 8»; al líder, además, «También
  pendiente en AQP: 12», que cambia la perspectiva. El tope de cada línea es lo que falta **para esta tienda**;
  «Todo llegó» llena lo de esta tienda. Si se pasa: «Solo faltan 8 para Tienda TRU. Si llegaron más, pide a un líder
  que reasigne desde AQP». Al confirmar: «Recibido en Tienda TRU: 12 de 12 ✓ — falta que AQP reciba su parte», para
  que nadie crea que el comprobante quedó cerrado. La pestaña «Recibidas» se filtra a la tienda.
- **Detalle del comprobante.** Sección «Reparto por tienda»: por tienda, asignado · recibido · faltan, barra de avance
  y estado (Completa / Faltan N / Sin recibir). Al líder, «Reasignar» abre un modal («Mover ___ de <prenda> de AQP a
  TRU»), con vista previa («Quedará: TRU 14 · AQP 10») y motivo obligatorio (Llegó de más a esa tienda / Se equivocaron
  de tienda / Otro). Debajo, el historial de reasignaciones con quién y cuándo.
- **Listas.** Comprobantes y Por pagar ganan el chip «Destino» («TRU · AQP», con las cantidades en el tooltip) y el
  filtro «Destino»; la deuda **no** se parte.

## Alcance medido

En la rama de ADR-0111, `fn_puede_operar_ubicacion(c.ubicacion_destino_id)` aparece unas 30 veces en 7 migraciones
(libro de cierres, `compras_resumen` e `compra_items_resumen`, `cerrar_linea_compra`, `resumen_compras` y
`resumen_compras_extra`, `deuda_por_vencimiento`, `salidas_caja_30d`, `por_pagar_tramos`, `listar_recepciones_compras`,
`resumen_recepciones`, `fn_proveedores` y sus métricas), además de `registrar_compra` y las 4 políticas de `main`. En
la web solo cuatro archivos nombran el destino: `CompraFormV2.tsx`, `CompraDetalle.tsx`, `lib/compras.ts` y
`lib/compras-reglas.ts`. El Postgres local compartido **ya tiene aplicadas** las 11 migraciones de ADR-0111.

**Por qué se espera:** reescribir esas funciones hoy y otra vez al fusionar esa rama es trabajo doble y el riesgo real
de dejar dos versiones vivas de una misma función. Con la rama ya en `main`, el cambio es una sola migración que
re-llave todo con `fn_puede_ver_compra`.

## Cómo se verifica (cuando se implemente)

- **Base** (`scripts/pruebas/compras_reparto.mjs`, contra Postgres real): reparto 12/12 entre dos tiendas; una suma
  distinta de lo facturado se rechaza; TRU no recibe más de lo suyo aunque la línea siga pendiente en AQP; reasignar
  solo lo pendiente, con motivo y con rastro; un integrante de AQP ve su parte y no ve comprobantes sin parte para su
  tienda; un comprobante de una sola tienda se comporta como hoy; dos recepciones concurrentes de la misma línea no
  rompen el tope.
- **Navegador:** registrar con reparto, recibir en cada tienda, ver el avance por tienda, reasignar.
- Al implementar: las dos tablas nuevas necesitan pájaro en `scripts/datos/aviario.mjs` (ADR-0104) o el CI falla —
  la asignación la aprueba Felipe—; aplicar en el local con `migration up`, nunca `db reset` (base compartida).

## Consecuencias y qué se rompería

- Se rompe si alguien vuelve a filtrar por un destino en la cabecera (ya no existe), escribe directo en
  `compra_item_destinos`, o agrega una RPC que lee `compras`/`compra_items` sin `fn_puede_ver_compra` (mismo aviso de
  ADR-0075: una función `security definer` no pasa por RLS).
- **Privacidad, decisión abierta con default.** Con reparto, un integrante ve las facturas que tienen algo para su
  tienda, incluido el total de la factura completa. Default: se acepta (extiende ADR-0075 tal cual). Alternativa: una
  función de lectura propia de Recibir, sin montos ni condición de pago; se hace si Felipe lo pide.
- Producción: las migraciones de este ADR se pegan **después** de las 11 de ADR-0111, con el prefijo `retail.` y ok
  explícito de Felipe (CLAUDE.md, «Cómo aplicar SQL a producción»).
