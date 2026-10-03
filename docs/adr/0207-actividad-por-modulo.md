# ADR-0207 · La actividad de cada módulo: quién hizo qué, desde la cabecera

- **Fecha:** 2026-09-25 · **Estado:** Aceptado y construido (primer paso: Punto de venta, Historial de ventas, Caja y
  Cambios). **Producción:** migración `20260926090000_actividad_por_modulo.sql` **aplicada y verificada el 2026-09-25**
  (ensayo abortado primero; 41 líneas cargadas).
- **Alcance:** `supabase/migrations/20260926090000_actividad_por_modulo.sql`, `scripts/pruebas/actividad.mjs`,
  `apps/web/lib/actividad-reglas.ts`, `apps/web/components/actividad/*`, `apps/web/app/(app)/actividad/*`,
  `apps/web/components/AppShell.tsx` (el botón), `lib/modulos.ts` y `lib/terminales-reglas.ts` (el módulo nuevo).
- **Decide:** Felipe, 2026-09-25: «cada módulo debe tener su historial propio… solo lo vería el admin o la líder…
  no quiero que esté en el panel lateral… quizás en la parte superior al lado de sedes». Luego: líder de tienda = solo
  su sede (opción B), un traslado lo ven las dos sedes, y lo pasado se carga.

## Problema

Cada operación queda firmada, pero en la fila de lo que se hizo: unas 55 tablas, cada una con su propia columna de
firma (`ventas.usuario_id`, `cajas.abierta_por`, `cambios.usuario_id`, `separaciones.liberada_por`…). No hay un lugar
donde una líder pregunte «¿quién anuló esa venta?» o «¿qué pasó hoy en la Caja de Trujillo?» sin saber SQL. Además, las
EDICIONES no dejan rastro: la tabla guarda el valor nuevo y pierde quién lo cambió y cuál era el anterior.

## Decisión

- **D1 — Una sola tabla `retail.actividad`, de solo agregar** (como `movimientos`): un disparador rechaza UPDATE y
  DELETE. Cada fila: cuándo pasó, módulo, acción (clave estable), la frase sin el sujeto («anuló la venta B001-000123…»),
  quién (el responsable que firmó, ADR-0162), desde qué terminal, la sede (y la de destino en un traslado), a qué registro
  se refiere y un `detalle` jsonb con montos y motivo. «Cada módulo tiene su historial» es un FILTRO sobre esa tabla,
  no 30 tablas: una pieza, una sola forma de leerla.
- **D2 — Se llena con disparadores sobre las tablas que ya guardan**, no tocando las funciones que guardan (343). Cada
  evento lo arma UNA función (`fn_actividad_<evento>`) que usan el disparador y la carga inicial: el texto de hoy y el de
  lo reconstruido salen del mismo lugar. La venta se anota al CONFIRMAR (disparador de restricción diferido): su cabecera
  se guarda antes que sus prendas y su comprobante.
- **D3 — Un error del historial nunca detiene la operación.** Cada disparador envuelve su anotación: si falla, WARNING en
  el log y la venta sigue. Se prefirió perder una línea del historial a dejar una tienda sin cobrar (principio 9).
  `pnpm pruebas:actividad` lo prueba forzando la falla.
- **D4 — Se abre desde la cabecera, junto a la sede, no desde el lateral** (Felipe). El botón «Actividad» abre el
  historial DEL MÓDULO DONDE UNO ESTÁ (`moduloDeRuta`), en la sede del selector; dentro se cambia de módulo y de periodo.
  «Ver todo el historial» lleva a `/actividad` (fuera del lateral), con filtros de módulo, sede, persona y periodo. El
  panel es un `<Modal variante="papel">` y no un cajón lateral como en la maqueta del chat: la regla de modales (ADR-0136)
  no admite otro overlay.
- **D5 — Quién la ve.** Es un módulo más en Roles y accesos (`actividad`, grupo Gestión), aunque no tenga fila en el
  lateral: así «la líder de tienda» es simplemente un rol al que el líder le enciende «Actividad». Nace sin rol (ADR-0161).
  El Líder (y el Admin, que es Líder) ve todas las sedes; cualquier otra cuenta con el módulo, SOLO su sede
  (`fn_ubicacion_actual_persona`), pida lo que pida; un traslado cuenta para las dos sedes. **Solo personas:** se suma a
  `MODULOS_SOLO_PERSONAS` y a `fn_exigir_rol_de_terminal` — un aparato compartido de mostrador no revisa lo que hacen
  las demás.
- **D6 — La anulación es del Historial de ventas**, no del Punto de venta: cada evento pertenece al módulo cuya pantalla
  lo guarda. Así cada historial responde por su pantalla.
- **D7 — Lo pasado se carga** (`origen = 'carga_inicial'`) desde las firmas que ya existen, con la hora de cada operación;
  re-ejecutable (no repite). Las ediciones antiguas no se pueden recuperar: se anotan desde que cada módulo sume las suyas.

## Alternativas descartadas

- **Una vista que junte las 55 tablas.** No ve ediciones (lo pisado ya no existe), se rompe cada vez que una tabla cambia
  y se pone lenta con el volumen.
- **Anotar desde cada función que guarda.** 343 funciones; basta olvidar una para que el historial mienta sin que nadie
  lo note. El disparador está en la tabla: ninguna función nueva se lo salta.
- **Un botón fijo «Actividad ▸ elegir módulo».** Dos clics y pensar dónde buscar; cuando algo raro pasa, la líder ya
  está parada en ese módulo.

## Cómo se suma un módulo

Una migración propia con (1) una función `fn_actividad_<evento>(id, origen)` que llama a `fn_actividad_anotar`, (2) su
disparador envuelto (D3), (3) la carga de lo pasado con la misma función, y (4) la clave del módulo en
`MODULOS_CON_ACTIVIDAD` (`lib/actividad-reglas.ts`). Siguientes por valor: Devoluciones, Apartados, Traslados,
Existencias (ajustes), Productos (precio: con antes/después), Colaboradores y Roles.

## Producción

Una sola parte (no hay políticas: la tabla solo se lee por funciones `security definer`). Toma candados breves de
`ventas`, `cajas`, `caja_movimientos`, `caja_traslados` y `cambios` al crear los disparadores: pegarla fuera del horario
de tienda. `lock_timeout = 3s`: si una tienda está cobrando, falla sin trabar y se vuelve a pegar.

## Actualización 2026-10-02 — Existencias, Conteos y Traslados anotan su actividad

**Decide:** Felipe, 2026-10-02: «que abarque más módulos… donde haya bastante movimiento». Medido en producción ese día:
~117 cargas de stock, 26 bajadas al piso, 31 ajustes, 29 conteos y 4 traslados, ninguno en Actividad. Felipe eligió
Existencias, Conteos y Traslados para esta etapa; Productos queda para la siguiente, y cuando llegue **se ve en la sede de
quien hizo el cambio** (el catálogo no tiene sede; Felipe eligió esa opción frente a «solo Líder» y «todas las sedes»).

Migración `20261002233000_actividad_existencias_conteos_traslados.sql`; prueba `pnpm pruebas:actividad-inventario`.

- **A1 — Una línea por operación, no por prenda.** Bajar 14 prendas son 14 filas de `movimientos` y una línea: «bajó al
  piso 14 prendas de 6 modelos» (hasta tres prendas se nombran). Lo que tiene cabecera (`conteos`, `transferencias`)
  cuelga de ella. Lo que no (ajustar, subir al almacén, cargar stock) se agrupa por **transacción**: los movimientos de
  una misma llamada comparten exactamente `created_at` (`now()` es la hora de inicio de la transacción). Al confirmar,
  un disparador diferido sobre `movimientos` corre por fila y **solo el primero del grupo (menor id) anota**: sin tabla de
  pendientes ni candados, y la carga de lo pasado usa la misma regla. El `when` del disparador deja fuera, sin llamar a
  nada, los movimientos que no son de Existencias (venta, cambio, compra, traslado, conteo).
- **A2 — De qué módulo es cada cosa** (D6, la pantalla que lo guarda). Existencias: carga desde «Ajustar stock», bajar
  al piso, subir al almacén, ajustar (también el que se hace desde la ficha del producto: es el mismo
  `ajustar_inventario` y la base no los distingue). Conteos: abrir, cerrar (cuántas con diferencia y en qué sentido),
  reabrir, cancelar; el ajuste del cierre NO sale también en Existencias. Traslados: enviar, recibir (todo o con
  faltantes), cerrar con diferencia, anular; las dos sedes lo ven. **El stock que nace con un producto nuevo no se anota
  en Existencias**: es de Productos y se reconstruirá de `movimientos` cuando llegue esa etapa.
- **A3 — Firma.** La de cada tabla (el responsable del combo, ADR-0162). Recibir un traslado y cerrar un conteo pueden
  ir con firma omitida en una terminal: la línea queda sin persona y dice el aparato (se toma la terminal de la sesión
  que guarda, no la de la cabecera, que es la de quien envió o abrió). Reabrir un conteo no guarda quién: se toma el
  responsable de la sesión en el momento; por eso esa línea no se reconstruye de lo pasado.
- **A4 — La prenda se nombra por su `referencia`** («Top con Escote y Amarre · Estándar · Vino»), que es el nombre; la
  `descripcion` es el detalle y solo se usa si falta (`fn_actividad_prenda`). Antes se usaba la descripción: 23 de 91
  productos no la tienen y salían como «S · Blanco», y los demás con su detalle largo. Vale también para Cambios.
- **A5 — La web reconoce lo que la base anota.** Clientes, Avisos del club y Productos anotaban desde setiembre, pero
  `MODULOS_CON_ACTIVIDAD` no los listaba: el panel decía «todavía no anota» y no mostraba nada. Ahora la lista sale en el
  orden del catálogo y `actividad-reglas.test.ts` lee TODAS las migraciones y falla si una anota en un módulo que la web
  no reconoce.

**Lo que cuesta.** Un disparador diferido sobre `movimientos` deja eventos pendientes hasta el `commit`, y Postgres no
deja hacer `alter table movimientos …` en una transacción con eventos pendientes. Ninguna función ni script de producción
inserta movimientos y después altera la tabla en la misma transacción (`eliminar_producto_con_historia` solo borra; el
script de restaurar usa `session_replication_role = replica`), pero las pruebas que preparan datos y luego desactivan el
candado de `movimientos` sí: llaman antes a `set constraints retail.trg_actividad_movimientos, … immediate` (solo los de
Actividad; las demás comprobaciones diferidas siguen al final). Una prueba nueva con ese patrón tiene que hacer lo mismo.

**Siguientes por valor:** Productos (altas, precio/costo/temporada/categoría con antes→después desde
`historial_producto_cambios`, una línea por guardado), Colaboradores y Roles, Recibir mercadería, Devoluciones.

**Producción.** Una sola parte (sin políticas). Toma candados breves de `movimientos`, `conteos` y `transferencias` al
crear los disparadores: pegar fuera del horario de tienda; `lock_timeout = 3s`. **Aplicada el 2026-10-02** (18:01 Lima,
a pedido de Felipe), y A4 enseguida en un segundo paso. Las 133 líneas de Existencias reconstruidas entre los dos pasos
quedaron con la descripción larga; Felipe las rehízo en el SQL Editor el 2026-10-03 (respaldo de las originales en
`respaldo_purgas.filas`, purga `actividad-nombre-de-prenda-2026-10-02`). Es la única vez que se apagó el candado de solo
agregar de `actividad`, y solo para filas reconstruidas minutos antes, nunca para algo anotado en vivo.

### Etapa Productos (2026-10-02, mismo día)

Migración `20261002234500_actividad_productos.sql`; prueba `pnpm pruebas:actividad-productos`. **Cada línea va en la sede
de quien la hizo** (Felipe): el catálogo no tiene sede.

- **P1 — Crear:** una línea con variantes (tallas y colores), precio y el stock que nació con la prenda (el que
  Existencias deja fuera). Persona, sede y terminal salen de `producto_origen` (ADR-0283). Una prenda propuesta dice
  «propuso … · por aprobar»; aprobarla o rechazarla después es su propia línea.
- **P2 — Editar, desde `historial_producto_cambios`:** ya guarda cada campo con su antes y su después. Se agrupa por
  transacción (igual que Existencias). Un guardado de una prenda: «editó «Blusa Alba»: precio S/ 89.00 → S/ 79.00 en 6
  variantes y categoría Blusas → Tops». En bloque, la frase del negocio: «asignó la temporada Verano a 8 productos»,
  «descontinuó 5 productos», «pasó 3 productos a la categoría Tops». Nombre y descripción no quedaban en el historial:
  un disparador nuevo (`productos_nombre_historial`) los suma.
- **P3 — El costo no se escribe.** Solo lo ve el líder o quien tiene permiso de dinero de compras (20260923193700), y
  la línea la lee la líder de tienda: «corrigió el costo de 3 variantes», sin montos ni en el texto ni en `detalle`. El
  costo que cambia al recibir una compra o cerrar una producción no es una edición de Productos y se deja fuera.
- **P4 — Eliminar:** `eliminar_producto_con_historia` ya anotaba; `eliminar_producto` (sin historia) se anota desde su
  fila «eliminado» del historial, sin repetir la otra.
- **P5 — Tallas en orden de tienda** (`fn_actividad_peso_talla`, la misma regla que `ordenTalla` de la web).

**Aplicada en producción el 2026-10-02** (a pedido de Felipe). El primer intento abortó entero: había ediciones de
prendas eliminadas después y su texto quedaba vacío. Ahora esas prendas se nombran «una prenda eliminada», y un
guardado cuyas variantes ya no existen no deja línea.

Lo mismo que en Existencias: los disparadores de alta y de historial son diferidos. Una prueba que inserte productos o
historial y luego altere esas tablas en la misma transacción tiene que dispararlos antes.
