# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**⚠️ AVISO 2026-09-14 — gran parte de lo de abajo describe V1, reemplazada por V2 el
2026-09-12 (`0af2f1b`, ver `docs/adr/0035-vocabulario-cerrado-portado-no-fusionado.md`
y BITÁCORA de esa fecha).** Facturación electrónica (Lucode/SUNAT), Finanzas (EERR/
Balance/Efectivo/Patrimonio) y Producción del Taller, tal como se detallan más abajo,
**ya no existen en el código** — V2 las borró a propósito (no tenían pantalla V2 propia
y su data en `retail` era de prueba, no operación real). **Producción volvió el 2026-09-15
sobre V2 (ADR-0051)** — lo que diga de ella más abajo describe la versión V1, no la actual.
**Corrección 2026-09-16 (auditoría de Facturación): la frase de arriba está mal para
Facturación — nunca se borró, a diferencia de Producción/Finanzas.** El propio commit del
corte (`0af2f1b`, 2026-09-12) lo dice en su mensaje: *"Facturación/SUNAT se rescata íntegra
(comprobantes, series con correlativo, proformas, 9 RPCs)"*. Verificado hoy contra el código
(`vender/facturacion/page.tsx`, `ComprobantesPanel.tsx`, `ProformasPanel.tsx`, `lib/lucode.ts`,
las RPCs) y contra producción (`retail.comprobantes`/`retail.proformas` tienen filas reales:
aceptadas, anulada, y 2 pendientes). Cierra la duda que había quedado abierta en BITÁCORA
2026-09-15 ("la contradicción sin resolver sobre si Facturación/SUNAT también quedó descrita
como V1"). Detalle de lo que SÍ sigue abierto en Facturación (no el módulo entero, un punto
puntual) en 🩹 ARREGLAR, más abajo en este mismo archivo.
Lo que sí sigue vigente hoy: Vender/Caja (POS), Productos, Inventario, Compras, Movimientos,
Colaboradores, Producción, Facturación. Antes de
actuar sobre cualquier ítem de este archivo, confirmar contra `apps/web/app/(app)/` que
el módulo todavía existe — este documento no se ha reescrito para reflejar V2 todavía
(tarea propia, pendiente de agendar con Felipe, no improvisada acá).

---

## 🎯 Aviario: una sola lista tabla→pájaro, revisada en CI (2026-09-18, ADR-0104)

Felipe pidió "traer el aviario" (los 14 pájaros de `07-GOBIERNO.md` §1). Al cruzarlo con
producción, su índice tabla→pájaro describía V1 (26 de 47 tablas ya no existen, 39 de 60
reales sin pájaro) y el generador del diccionario llevaba otra lista distinta.

- [x] **Una sola lista** en `scripts/datos/aviario.mjs`: las 60 tablas y vistas de
      `retail` con un pájaro cada una. El índice se genera en
      `docs/datos/generado/AVIARIO.md` y GOBIERNO §1 apunta ahí.
- [x] **Alarma en CI:** `node scripts/datos/aviario.mjs --verificar` falla si una tabla
      nace sin pájaro, tiene dos, los pájaros no coinciden con GOBIERNO o `AVIARIO.md`
      quedó viejo. Probado sobre una copia: los errores fallan y apuntarse no rompe nada.
- [x] **Felipe aprobó las asignaciones tal cual** (tabla en ADR-0104: 21 nuevas y 3 que
      cambian — `proformas` y `ubicacion_datos_fiscales` → Cuervo, `sububicaciones` →
      Halcón). PR abierto desde `claude/aviario-cayla-8d1efc`, esperando merge.
- [ ] **Gorrión: lo que se pega a mano en el SQL Editor de producción no deja rastro.**
      GOBIERNO §4 apuntaba a `retail.migraciones_aplicadas`, que ya no existe. El
      registro vivo es `supabase_migrations.schema_migrations` (114 filas, la última de
      hoy), pero solo lo llena el camino de migraciones (CLI/MCP), con versión propia y
      no el nombre del archivo del repo. Decidir si todo SQL de producción pasa por ahí.
- [ ] **Cada pájaro: su archivo en `docs/datos/modulos/` describe V1**, igual que
      `00-MAPA.md` (45 tablas, `sede_meta`, `stock_almacen`). El índice ya es verdad;
      los documentos del porqué, todavía no.
- [ ] **Refrescar el volcado de producción** (`generado/COMO-REFRESCAR.md`):
      `retail.familias` ya existe allá desde el PR #129 y el volcado del 17-sep no la
      tiene. Hasta refrescarlo, la alarma del aviario no ve las tablas nacidas después.

---

## 🎯 Colores: agrupados por familia + 4 tonos de investigación real (2026-09-18)

`/productos/colores` era una sola grilla continua ordenada por `orden`
global (10→92) — con 34+ colores un tono nuevo quedaba "colgando" al final
en vez de junto a sus parecidos, y la última fila (Estampados, 3 items)
se veía a medio llenar sin motivo. Se agrupó por familia (Neutro/Azul/
Rojo/Amarillo/Verde/Morado/Tierra/Metálico/Estampado), mismo patrón visual
que ya usa Categorías (`gruposPorFamilia()`, `ColoresLista.tsx`).

De paso, auditoría real (mismo método que ADR-0096: navegar en vivo, citar
URL, declarar cuando un sitio bloquea) contra Zara, Ralph Lauren, LVMH
(Fendi/Dior) y Platanitos. Zara y Platanitos dieron datos reales; Ralph
Lauren bloqueó el acceso en el primer intento y funcionó en el segundo
(navegación más orgánica en vez de URLs directas); LVMH agrupa por familia
amplia, no por tono fino, así que no aportó huecos nuevos. Resultado: 4
colores nuevos con hueco real en Zara (Cobalto, Gris antracita, Caqui,
Tostado — "Caqui" en español, no "Khaki", por la regla de idioma de
CLAUDE.md), confirmados también en Ralph Lauren ("Dark Cobalt"). Nacen
`aprobado` directo — decisión de marca ya tomada con Felipe, no una
propuesta de piso de venta.

- [ ] Verificado tras fusionar con `main` (2026-09-18): `tsc`, 380 tests, lint de
      lo tocado y `next build` en verde; componente renderizado con los datos
      reales de producción. **Falta, en este orden:** (1) Felipe pega en
      producción `20260918010000_familias_tabla_propia.sql` y después
      `20260918154730_colores_audit_zara_platanitos.sql` (supuestos ya
      verificados contra producción, solo lectura); (2) recién ahí se fusiona
      el PR — antes, el despliegue espera `retail.familias`, que no existe.
      **Decisión abierta de Felipe:** con la grilla agrupada, `orden` solo manda
      dentro de cada familia y hoy queda incoherente (Tierra: Arena → Camel →
      Marrón → Chocolate → Caqui → Tostado; los 4 tonos nuevos van al final de
      su familia). Propuesta: de más oscuro a más claro, medido con el hex real
      de la muestra; solo cambia `orden` (dato de presentación, reversible).

---

## 🎯 Rediseño visual de Caja + Punto de Venta (2026-09-18, ADR-0102)

Felipe pidió rediseñar Caja (visual/interactivo, a partir de una maqueta HTML) y
extender el mismo lenguaje visual a Punto de Venta, sin tocar lógica de negocio. La
maqueta traía modo oscuro y una paleta que no es la de CAYLA — protocolo de pregunta
antes de tocar código, Felipe eligió traducirla a la paleta ya existente (detalle en
ADR-0102).

- [x] **Caja: tablero completo con datos reales** — encabezado (avatar por iniciales,
      reloj en vivo, badge de sincronización), barra de meta diaria (si la ubicación
      tiene una configurada), 5 KPIs con sparkline, dona de métodos de pago (+ tabla
      accesible), barras de ventas por hora, timeline de movimientos+ventas, tendencia
      de 7 cierres, barra de acciones fija. `CajaAbiertaPanel.tsx` reescrito,
      `Graficos.tsx`/`useCountUp.ts` nuevos, `lib/caja.ts` gana `getSeriesVentasCaja()`
      y `MovimientoCaja.registradoPorNombre`. Verificado en navegador con la caja real
      de Tienda Lima (`felipe@cayla.local`).
      Colores categóricos de método de pago (`--color-metodo-*`) nuevos en
      `globals.css`/`design-tokens.ts` — compartidos con Vender, no son de marca.
- [x] **`ubicaciones.meta_venta_diaria`** — columna nullable nueva
      (`20260918100000_meta_venta_diaria_por_ubicacion.sql`), sin RPC propia todavía
      (se configura por UPDATE directo). Aplicada en local, **pendiente producción con
      ok de Felipe**.
- [x] **Punto de Venta: extendida la misma piel visual** — la mayoría YA calzaba
      (tarjetas de producto ya usaban `alza-cayla`+radio `xl`, total ya en serif,
      botón "Cobrar" ya `bg-tinta`/hover `rojo` igual que "Cerrar caja" — no hizo
      falta tocar nada de eso). Lo que sí cambió: chips de categoría y el toggle
      "Solo con stock" pasan de `rounded-lg` a `rounded-md` (mismo radio que la
      "pastilla" real del selector de ubicación, `campos.tsx`); el selector de
      método de pago (`PuntoDeVentaTicket.tsx`) y el ícono de cada pago ya puesto
      se colorean con los mismos 3 categóricos de la dona de Caja. Verificado en
      navegador armando una venta real con pago mixto efectivo+tarjeta+yape.
- [ ] **Banner de alerta de egresos por encima del promedio semanal** — pedido por la
      maqueta, NO construido: no existe ningún rollup histórico de egresos por día
      (`getHistorialCierres()` no los trae). Necesita una función/consulta nueva antes
      de poder mostrar un número real.
- [ ] **Delta "vs. mismo día de la semana anterior" en la barra de meta** — mismo
      motivo: no hay una cifra de "total vendido" histórico por día en ningún lado;
      `montoCierreSistema` mide otra cosa (el esperado en el cajón, no lo vendido).

---

## 🎯 Resumen de Inventario: quinta pantalla, por variante × sede (2026-09-17, ADR-0101)

Worktree `erp-architecture-summary`. `/inventario/resumen` (solo líder, por sede): estado
general (salud, riesgo de quiebre, traslados sugeridos, exactitud = la de Conteo),
excepciones (necesita reposición ahora, curvas incompletas, posible sobrestock, en camino
con impacto), decisiones sugeridas hoy, productos a vigilar y cómo leer. Motor:
`retail.fn_resumen_variantes` (agregados crudos por variante, demanda por FK y estado real,
ventana observable) + `lib/resumen-reglas.ts` (todas las reglas, reutiliza los umbrales de
Existencias). "Crear traslado" prellena `/inventario/mover` — nunca mueve stock. Verificado
en navegador (desktop/tablet/móvil) con un escenario local de historial; typecheck, lint,
358 pruebas y build en verde. Renumerada de ADR-0097 a 0101: `activar-tienda-lima-eff087`
tomó el 0097 primero y ya está en producción — ver ADR-0101 y la fila de abajo.

**Fusionada con `main` (22 commits, PR #106-#119, 2026-09-18):**
- [x] **`fn_productos` y `fn_prioridad_conteo` ROTAS en `main` local** ("column v.talla does
      not exist") — ya venían arregladas en `main` (`20260917220000_reconcilia_talla_id_...`,
      del PR #108); aplicada acá al fusionar. Verificado con `psql` directo (18 y 48 filas
      respectivamente, antes tiraban error).
- [x] **`conteo/page.tsx` en conflicto con el PR #108** (alta de prenda al vuelo durante
      el conteo): dos ediciones a pocas líneas de distancia, sin pisarse en intención.
      Integradas las dos — `tonoExactitud()` de esta rama y `colores`/`tallasPorCategoria`
      del PR #108, con `ConteoPanel.tsx`/`catalogo-v2.ts` traídos de `main` sin cambios.
- [x] **Bug real encontrado al verificar la fusión, ajeno a esta rama pero ya en
      producción (PR #108): "Conviene contar primero" repetía la misma prenda dos veces**
      con montos de "valor en riesgo" distintos — `fn_prioridad_conteo` lee de `stock`
      (una fila por variante×sububicación) pero nunca exponía cuál sububicación era cuál.
      Corregido en `20260918090000_prioridad_conteo_por_sububicacion.sql`: ahora cada fila
      dice "Piso de venta" o "Almacén de tienda"; de paso, "días sin contar" ahora exige que
      el conteo cerrado haya cubierto esa misma sububicación, no cualquiera de la sede.
- [x] **Aplicadas a producción, con ok puntual de Felipe (2026-09-18): las dos
      migraciones de Resumen** — `fn_resumen_variantes` (renombrada localmente a
      `20260918080000_` por choque de timestamp con `reconcilia_talla_id...` de `main`,
      sin choque de contenido) y `fn_prioridad_conteo` con sububicación
      (`20260918090000_prioridad_conteo_por_sububicacion.sql`). Verificado contra
      producción real vía MCP de Supabase: las dos funciones existen con la firma
      correcta, `anon` no puede ejecutarlas, `fn_resumen_inventario`/`transferir` viejas
      quedaron dropeadas, el índice existe. `pnpm datos:comparar` sale limpio (PR #121).
      `20260916100000_punto_reorden.sql` y la taxonomía cerrada NO se tocaron en esta
      pasada — ya estaban en producción (`variantes.talla_id` confirmado presente antes
      de aplicar nada).
- [ ] **`movimientos.motivo` sin CHECK**: Resumen lo esquiva clasificando por FK, pero
      `fn_productos`/`fn_movimientos` siguen dependiendo del texto — vocabulario cerrado
      como colores/tallas.
- [ ] **`fn_stock_por_sede()` suma cuarentena y el cargo especial** (la usan Existencias
      "en la red" y Vender): una prenda dañada en otra sede aparece como disponible.
- [ ] **`anular_venta` repone al bucket `sububicacion_id NULL`** (ni piso ni almacén): la
      unidad cuenta como disponible pero el POS no la puede vender.
- [ ] **`iniciar_traslado` no aplica `fn_variante_permitida_en_sede`** (el candado de
      etiquetas solo está en `registrar_venta` y en la `transferir` legada): una sugerencia
      de Resumen podría proponer mover una variante restringida.
- [x] **`retail.transferir` (modelo atómico viejo) resucitada por `20260917100700`**,
      ejecutable por `anon` y contada doble como "en camino" — dropeada otra vez en
      `20260917220000_resumen_inventario.sql` (sin caller en la app).
- [ ] **`primer_ingreso` recorre todo el ledger en cada carga de Resumen** (mínimo
      histórico por variante×sede): crece lineal con los años. Candidato a materializar
      (tabla `variante_sede_primer_ingreso` alimentada por `fn_aplicar_movimiento`) cuando
      el ledger pase de ~1 millón de filas.
- [ ] **`retail.tallas` sin columna `orden`**: la curva se ordena con la lista
      `LETRAS` de `tallas.ts`; una talla nueva fuera de esa lista cae alfabética.
      Decisión estructural (taxonomía) para Felipe.
- [ ] **Datos simulados de 6 meses en local** (pedido de Felipe): el escenario de esta
      sesión vive en el scratchpad y no se commitea; el generador real debe cubrir a
      propósito producto nuevo con poco historial, curva rota, mermas mezcladas con ventas,
      temporada con pico y caída.
- Preguntas abiertas (ADR-0101): ventana elegible 7/14/30/60/90; mínimo por variante+sede;
  ventana "días con stock" en vez de "días desde el primer ingreso".

---

## 🎯 Proveedores: ficha ampliada y métricas de compras/insumos (2026-09-17, ADR-0094)

Felipe pidió más métricas de proveedor. Protocolo de pregunta completo primero (lo pidió
explícito: "antes de implementar cualquier cosa, preguntas") — 4 decisiones: objetivo
(negociar mejor + cuidar el flujo de caja + medir confiabilidad), cerrar huecos antes que
métricas, secciones separadas para Taller/insumos vs. prenda terminada/compras, sí agregar
plazo/rubro/forma de pago a la ficha. Al aplicar "cerrar huecos primero" salió una
contradicción real con una decisión de Felipe de esa misma mañana ("devolver_proveedor no es
prioridad") — se le mostró explícita, la revisó, y sí valía la pena ahora. Detalle completo,
con verificación contra Postgres real (Felipe vs. Micaela, sede por sede), en ADR-0094.

- [x] **`devolver_proveedor` deja de desaparecer** — entra a `cuarentena` igual que Dañado,
      reusando `prendas_danadas`/`resolver_prenda_danada` con un cuarto estado
      (`devuelta_proveedor`) en vez de un flujo gemelo.
      `20260918070000_devolver_proveedor_entra_a_cuarentena.sql`. Verificado con
      `psql`+`ROLLBACK`: entrada a cuarentena real, las dos validaciones (proveedor
      obligatorio para este estado / prohibido para los otros) rechazan como corresponde,
      resolución deja movimiento de salida + `proveedor_id` + `resuelto_por`/`resuelto_en`.
- [x] **`proveedores` gana `rubro`/`plazo_credito_dias`/`forma_pago_preferida`** —
      `20260918071000_proveedores_rubro_plazo_forma_pago.sql`. `rubro` a propósito sin
      vocabulario cerrado (ver ADR-0094 para el porqué). `fn_proveedores()`,
      `registrar_proveedor` y `actualizar_proveedor` extendidos y verificados.
- [x] **Dos RPC de métricas, nunca sumadas: `fn_proveedor_metricas_compras` /
      `fn_proveedor_metricas_insumos`** — `20260918072000_proveedor_metricas_compras_e_insumos.sql`.
      **Repiten a mano el candado de sede de ADR-0075** (una función `security definer` se
      salta cualquier policy de la tabla que lee, sin excepción) — la primera versión escrita
      en esta sesión no lo tenía, se corrigió antes de la primera prueba, no después de
      encontrarlo roto. Verificado: Felipe (líder) ve 2 facturas de "Textiles Andina SAC"
      cruzando Taller/Lima (S/13,829.60 facturado, S/5,133.60 de saldo); Micaela (integrante,
      Trujillo) ve todo en cero para el mismo proveedor.
- [x] **D-46 (`docs/datos/DECISIONES-2026-09-12.md`) tenía el mismo problema que ya se había
      encontrado en D-45**: la mitad "cuentas por pagar" ya estaba resuelta por ADR-0035
      desde el 2026-09-12 y el documento nunca se actualizó. Corregido con cita cruzada. La
      mitad IGV (crédito fiscal acumulado, 300 UIT) sigue genuinamente abierta.
- [x] **Pantalla de detalle de proveedor** (`/compras/proveedores/[id]`, con las dos
      secciones de métricas) — construida (`apps/web/lib/proveedores.ts`,
      `ProveedoresPanel.tsx`, página nueva) y verificada de punta a punta en el navegador
      real como Felipe (líder): números de "Textiles Andina SAC" coinciden con lo verificado
      por `psql`, estados vacíos correctos para Insumos.
- [x] **Bug real encontrado y corregido en esta misma pasada: `registrar_proveedor`/
      `actualizar_proveedor` quedaron con DOS sobrecargas vivas** (la vieja de 3/4
      parámetros + la nueva de 6/7) porque agregar parámetros al final con
      `create or replace function` no reemplaza la función — a diferencia de un cambio de
      `RETURNS` (que Postgres sí rechaza), esto no avisa solo. Mismo patrón que ya nombró
      ADR-0009/0004 para otras funciones. Se manifestó como `500` al registrar un proveedor
      real desde el formulario, aunque la prueba de `psql` con parámetros nombrados (que no
      tiene esta ambigüedad) pasaba — encontrado recién al probar en navegador, no antes.
      Corregido con `drop function` de las firmas viejas; verificado con `pg_proc` que
      quedó una sola firma de cada una, y con un registro real end-to-end en el navegador.
      Detalle en ADR-0094, sección "Segunda vuelta".
- [x] **Rubro visible en la fila de la lista, sin entrar al detalle** — pedido de Felipe
      el mismo día al ver la pantalla. `ProveedoresPanel.tsx`: se agrega junto al contacto
      ("Jorge Ramos · Tela"), sin tocar el grid de columnas.
- [x] **Los indicadores del detalle también en la lista, y solo para líder — corrección
      angosta de D-27** (`20260918073000_proveedores_lista_indicadores_y_candado_sede.sql`).
      `fn_proveedores()` suma `total_facturado`/`facturas_vencidas`/
      `facturas_recibidas_completas`/`facturas_con_recepcion_pendiente`, todo `NULL` si
      quien pregunta no es líder — el directorio (nombre/RUC/contacto/rubro/plazo/forma de
      pago) sigue siendo para cualquiera. **Hallazgo que cambió el diagnóstico:**
      `/compras/proveedores` ya era solo-líder desde el 2026-09-16
      (`app/(app)/compras/layout.tsx` redirige a colaboradores) — D-27 nunca se actualizó
      para decirlo. Lo genuinamente nuevo es el candado del lado de los datos (antes,
      alguien podía llamar `fn_proveedores()` directo por API y seguir viendo saldo/
      facturas). Se sacó un chequeo de rol redundante que se había escrito en
      `[id]/page.tsx` (el layout ya lo hacía). D-27 corregido con la misma disciplina que
      D-45/D-46. Detalle completo en ADR-0094, sección "Tercera vuelta".
- [x] **Bug real #2, mismo día: `fn_proveedor_metricas_compras`/`_insumos` — "column
      reference \"saldo\" is ambiguous"** al convertirlas a `plpgsql` para poder rechazar a
      quien no es líder: Postgres declara cada columna de `RETURNS TABLE` como variable de
      salida, y `saldo` (columna de salida) chocó con `compras.saldo` (columna de tabla).
      `create or replace` no lo avisa al aplicar — se manifestó recién al abrir la
      pantalla en el navegador. Corregido calificando cada columna con alias (`c.saldo`,
      `il.fecha_ingreso`). Verificado de nuevo en el navegador, dos veces (líder y
      colaboradora).
- [x] **Fusionado con `main` (26 commits, 2026-09-18) — dos hallazgos reales en el
      camino**, ninguno cosmético: (1) `aprobar_devolucion`/`resolver_prenda_danada`
      también las había tocado otra sesión (Nota de Crédito automática; "Liquidada"
      exige venta real) — la migración de `devolver_proveedor` se reconstruyó sobre
      ese cuerpo real, no el viejo, para no revivir un backdoor de integridad ya
      cerrado ni perder la Nota de Crédito. (2) `resolver_prenda_danada` quedó con
      dos sobrecargas vivas (3 params de la otra sesión + 4 de esta) — mismo bug que
      `registrar_proveedor`, cerrado igual con `drop function`. Migraciones
      renombradas `20260918070000`-`073000` por choque de timestamp con 3 archivos
      de `main`. `db reset`/typecheck/lint/297 tests en verde sobre el árbol
      mezclado. Detalle completo en BITÁCORA 2026-09-18.
- [ ] **Pegar las 4 migraciones en producción** — con el prefijo `retail.` en el SQL Editor
      (CLAUDE.md) o vía MCP de Supabase. Ninguna toca datos existentes (solo columnas/
      funciones nuevas), pero sigue siendo cambio de esquema en producción — confirmar con
      Felipe antes, no autónomo. **Ojo: no son independientes** — `20260918070000`
      redefine `aprobar_devolucion`/`resolver_prenda_danada` sobre el cuerpo que
      trajeron `20260918050000` (Nota de Crédito) y `20260917195508`/`095000`
      (Liquidada), que también tienen que estar aplicadas antes en producción, o
      `create or replace` fallaría al no encontrar la firma que espera reemplazar.
- [ ] **Sin pruebas automatizadas** para `devolver_proveedor`/las métricas nuevas — mismo
      patrón de deuda que el resto de RPC de escritura del repo.
- [ ] **Filtrar/agrupar proveedores por `rubro` en la lista** — el campo ya se guarda, se
      lee y ya se ve por fila; falta el filtro/agrupación propiamente dicho. No construido a
      propósito (fuera del alcance que pidió Felipe esta vez).
- [ ] **Los 2 proveedores del seed tienen un RUC que no pasa el checksum de
      `validarDocumento`** — el botón Guardar del modal de edición queda deshabilitado para
      cualquier cambio a "Confecciones del Sur EIRL" o "Textiles Andina SAC" mientras el
      campo RUC no se corrija a mano primero. Encontrado al verificar esta pasada en
      navegador; es un problema de los datos de prueba del seed, no del código de esta
      sesión — no se tocó.
- [ ] **`docs/datos/modulos/09-compras-y-proveedores.md` describe una tabla `proveedores`
      que no existe** (banco/cuenta_bancaria/categoría/marca/score/teléfono,
      `productos.proveedor_id`) — verificado contra producción real que ninguna de esas
      columnas existe, ni ahí ni en este repo. Mismo síntoma que ya tuvo el módulo 02
      (doc describiendo V1/otra línea de migraciones). No reescrito en esta pasada — es su
      propia tarea, no improvisada acá.

---

## 🎯 Taxonomía de variante: tallas/tejidos/patrones/etiquetas (2026-09-17, ADR-0095)

Worktree `cayla-taxonomia-design`. Vocabulario cerrado (propone/aprueba/rechaza, mismo
mecanismo que colores) para talla, tejido, patrón y etiquetas de catálogo, con filtro
por categoría (`categoria_tallas`/`categoria_tejidos`/`categoria_patrones`) y candado de
sede extendido a traslados. Backend + `NuevoProductoForm.tsx`/`ProductoForm.tsx`
probados en navegador como Líder (crear, editar, guardar). Tipos, lint y 293 pruebas en
verde.

- [x] **Pegada en producción (2026-09-17, tarde-noche) — la mitad que faltaba, después
      de que #75 se fusionara a `main` sin su migración.** El "Production Deploy" del
      entorno de esa sesión se la bloqueó, y Vercel desplegó igual el frontend que ya
      esperaba `talla_id` — `/productos` cayó en producción ("NO SE PUDO CARGAR") hasta
      que se aplicó esto. Cadena completa aplicada y reverificada contra
      `vovjyyiafkxteijimpuy`: `retail.tallas` + `categoria_tallas/tejidos/patrones` (la
      parte segura, ya lista desde antes), `variantes.talla_id` (backfill 144/145 filas,
      la única excepción es el sentinel "Cargo especial"), la restricción
      `variantes_producto_talla_color_unico`, `fn_variante_permitida_en_sede` en
      `registrar_venta` (en `transferir` queda escrito pero inerte — producción ya usa
      `iniciar_traslado`/`confirmar_traslado`, ADR-0068), `catalogo_crear_producto`/
      `catalogo_actualizar_producto` con `talla_id` + `color_codigo` en fotos, y
      `categorias.tallas_sugeridas` borrada. Detalle completo — incluida la
      reconciliación de 2 funciones que quedaron rotas por el cambio
      (`fn_prioridad_conteo`, `fn_productos`, que seguían leyendo `variantes.talla` ya
      borrada) y 4 sobrecargas de RPC duplicadas encontradas y cerradas en el camino —
      en BITÁCORA 2026-09-17. Verificación final: cero sobrecargas duplicadas y cero
      referencias a `variantes.talla` en todo `pg_proc` de producción.
      - [ ] **Lo que NO se pegó, a propósito — decisión de negocio, no técnica:**
            `20260917110000` (renombres de ADR-0096: Blusas se fusiona con Camisas,
            etc.) queda vivo solo en este repo/local. Cambia el desplegable que ve una
            encargada de sede ahora mismo — el momento de activarlo en producción lo
            decide Felipe, no es un fix pendiente. Ver 🎯 Familias y categorías, abajo.
- [x] **La reverificación de arriba no cazó todo: a `retail.etiquetas` en producción le
      faltaba la columna `notas` — Catálogo > Etiquetas caía en vivo con "Esta pantalla
      no está mostrando datos".** La tabla la había creado una rama vieja nunca
      fusionada (ver `pegar-en-produccion-taxonomia-parte-segura.sql`); esa
      reconciliación arregló los triggers pero nunca comparó columna por columna.
      `alter table retail.etiquetas add column if not exists notas text;` corrida por
      Felipe en el SQL Editor, reverificada por lectura contra
      `information_schema.columns` (0 filas, sin riesgo). De paso, el trigger que trae
      `20260917100200_etiquetas_catalogo.sql` estaba desactualizado frente al que de
      verdad corre en producción (le faltaba "reactivar retira el rechazo") — corregido
      en el archivo para que un `db reset` local no diverja.
- [x] **Vocabulario real de Etiquetas cargado: 22 filas (2026-09-17).** 19 comerciales/
      festividades (investigadas contra Zara/Bershka/Ralph Lauren/Hermès y calendario
      peruano real — CyberWow lo organiza IAB Perú, Black Friday 27-nov distinto de
      CyberWow, Galentine's/Día del Gato/Día del Perro/Día de la Tierra con fecha
      verificada) + "Para liquidar" generada por sede (`retail.ubicaciones` activa,
      dinámico — no hardcodeado, porque local y producción no comparten nombres de
      sede). Migración `20260917230000`: `vigente_desde`/`vigente_hasta` (calculado en
      lectura, no un cron) + comentario obligatorio al aprobar (mismo candado que
      Tallas, ahora en las 5). Migración `20260917230100`: la semilla. Verificado con
      `db reset` completo (no incremental), `typecheck`/`lint`, y navegador contra
      Postgres local real — las 22 tarjetas con el candado de sede visible.
      **Cerrado 2026-09-18:** vigencia ya conectada — `ProductoForm.tsx` solo ofrece
      etiquetas vigentes hoy (filtro en servidor), y `/productos/etiquetas` muestra la
      ventana + si está vigente o "fuera de temporada". Estilo visual construido
      (migración `20260918060000`): 3 colores fijos + General — urgencia (ámbar),
      positivo (verde), campana (taupe-profundo), nunca rojo (violaría
      `MAX_ROJO_POR_PANTALLA` con 20 tarjetas) ni color libre. Las 20 etiquetas
      clasificadas por nombre. La pantalla agrupa por color en vez de grilla plana.
      **Pendiente, menor:** una etiqueta nueva creada desde la pantalla nace `neutral`
      sin selector para clasificarla ahí mismo — hay que reclasificarla por SQL o en
      una próxima sesión si hace falta desde el día uno.
- [x] **"Para liquidar" corregido: de 4 filas por sede a 1 global (2026-09-18).**
      El diseño original restringía por sede con `sedes_permitidas` — Felipe preguntó
      "por qué 4" y la pregunta destapó que el candado no es cosmético:
      `fn_variante_permitida_en_sede` (`registrar_venta`/`transferir`) lo usa para
      BLOQUEAR venta/traslado, no solo para avisar. Habría bloqueado sin querer la
      venta de una prenda en una sede que tenía su propio stock fresco. Corregido a
      una sola etiqueta global (migración `20260918030000`, 0 variantes afectadas,
      verificado antes de escribirla) y se quitó el botón "SEDES"/todo el flujo de
      edición de `sedes_permitidas` de las 20 etiquetas restantes — "empresa
      uniforme", decisión de Felipe. La columna sigue en el esquema, dormida. PR #115.
- [x] **Tejidos sembrado: 17 valores reales (2026-09-18).** Vacío desde ADR-0095
      (17-sep). Investigado contra Google Merchant Center + el vocabulario propio de
      proveedores de Gamarra (Tejido de Punto vs Tejido Plano), con dos fibras
      peruanas reales (algodón pima, alpaca). Un solo nombre por concepto sin "/"
      (Licra cubre Full Lycra, Jersey cubre Interlock, Rib no se separa de Rib
      licrado). Migración `20260918140000`, los 17 nacen `aprobado`. Verificado con
      `db reset` completo, typecheck/lint, navegador. PR pendiente de abrir.
      **Pendiente, aparte:** Patrones también sembrado (7 valores) y "Estampado"/
      "Multicolor"/"Animal print" retirados de Colores donde estaban duplicados
      (migración `20260918100000`, PR #123, todavía sin fusionar) — imagen de
      muestra para Patrones (como ya tiene Colores) quedó pedida por Felipe, sin
      construir todavía.
- [x] **Las 4 pantallas de administración de vocabulario** (`/productos/tallas`,
      `/productos/tejidos`, `/productos/patrones`, `/productos/etiquetas`, mismo patrón
      que `ColoresLista.tsx`) — construidas y agregadas al nav de "Catálogo"
      (`AppShell.tsx`). Etiquetas suma un campo propio, `sedes_permitidas` (multi-select
      de `retail.ubicaciones`, opcional). Probado en navegador como Líder: proponer,
      aprobar (con comentario obligatorio en Tallas), rechazar, reactivar, desactivar, y
      el candado "en uso" de Etiquetas (bloquea desactivar si alguna variante la tiene
      aplicada — ese candado vive en la API, no en el trigger de la base, porque el
      trigger de `etiquetas` solo cubre la transición pendiente→rechazado, no
      aprobado→desactivado). `db reset`, typecheck y lint en verde.
- [x] **Aplicar/quitar una etiqueta de una VARIANTE puntual ya tiene pantalla.** Dentro
      de "Editar producto" (`ProductoForm.tsx`) — un toggle "Etiquetas" por fila de
      variante, respaldado por un RPC nuevo (`retail.actualizar_variantes_etiquetas`) que
      guarda todas las variantes tocadas en una sola llamada, en la MISMA acción de
      "Guardar cambios" (nunca un botón aparte). Solo manda al RPC las variantes cuyas
      etiquetas de verdad cambiaron contra lo que había al abrir el formulario — evita
      pisar `variante_etiquetas.created_at` en cada guardado del producto y evita exponer
      un guardado de solo precio a un error de etiquetas que no viene al caso. Probado en
      navegador de punta a punta: aplicar una etiqueta, guardar, confirmar por SQL que
      solo esa variante tiene fila nueva; guardar de nuevo sin tocar etiquetas y confirmar
      que `created_at` no se mueve. `db reset`, typecheck, lint y 293 tests en verde.
- [x] **Mapear categoría↔eje ya tiene UI.** Dentro del modal "Editar categoría"
      (`CategoriasLista.tsx`) — 3 grupos de chips (Tallas/Tejidos/Patrones), un botón de
      guardado propio (RPC `retail.actualizar_categoria_ejes`, atómico entre los 3 ejes).
      Antes de esto, tejido/patrón estaban vacíos para TODA categoría (nadie había cargado
      `categoria_tejidos`/`categoria_patrones`) — el selector ya existía en
      `NuevoProductoForm.tsx` pero no tenía nada para ofrecer. Probado en navegador de
      punta a punta: mapear Denim a Jeans en Categorías, confirmar que aparece en el
      selector de tejido al crear un producto de esa categoría. `db reset`, typecheck,
      lint y 293 tests en verde.

---

## 🎯 Vender/Caja ya muestra la foto del producto (2026-09-17)

Felipe: si la Grilla de Productos ya muestra fotos, Caja debería mostrar las mismas —
es el mismo catálogo. `getCatalogo()` (`catalogo-v2.ts`) no traía `producto_fotos` en
su query embebida; se agregó, y `fotoUrl` se resuelve por color exacto (mismo criterio
`color_codigo` que ya usa la Grilla). El dato viaja completo por los 5 archivos entre
la consulta y la tarjeta (`vender/page.tsx` → `PuntoDeVenta.tsx` → `catalogo-grupos.ts`
→ `PuntoDeVentaCatalogo.tsx`), reemplazando el placeholder de iniciales quieto por la
foto real cuando existe (el placeholder se queda como estaba para variantes sin foto
propia). Probado en navegador: prenda con foto la muestra en la tarjeta de Vender;
prenda sin foto sigue con el placeholder de iniciales, sin romperse.

- [x] Cerrado y verificado en navegador. Sin pendientes.

---

## 🎯 Familias y categorías: el contenido real (2026-09-17, ADR-0096)

Investigación real contra Zara, H&M, Bershka, Hermès, Ralph Lauren, LVMH y Platanitos
(terminología peruana). 6 familias (Accesorios pasa a mostrarse "Accesorios y
Complementos"), 39 categorías activas + 2 archivadas (Blusas fusionada con Camisas,
Trajes de baño sin uso). Migración `20260917110000`, probada en navegador.

- [x] **`familia` ya no es un `CHECK constraint` fijo — pasó a tabla propia
      (2026-09-18, ADR-0103).** `retail.familias` (código estable en texto,
      autogenerado del nombre), SIN proponer/aprobar — es decisión de marca,
      no vocabulario operativo, mismo patrón que ya usa `retail.categorias`
      (no el de tejidos/patrones, que sí tienen ese flujo). Pantalla nueva
      `/productos/familias`, líder-only. **Colisión resuelta con Felipe en
      vivo**: `claude/fix-old-stuff-0192ff` construyó en paralelo una
      versión distinta (`familia_id` uuid, con proponer/aprobar) — Felipe
      comparó las dos y eligió esta; ver ADR-0103 para el porqué completo y
      el aviso a esa sesión en `SESIONES-ACTIVAS.md`. Verificado en
      navegador como líder; `pnpm typecheck`/`lint`/297 tests en verde.
      Pendiente: aplicar en producción (SQL con prefijo `retail.`).
- [ ] **Categorías desactivadas de esta sesión (Blusas, Trajes de baño)** — confirmar con
      Felipe si alguna vuelve a activarse cuando el censo real (no el inventario de
      prueba de hoy) muestre que sí hay volumen ahí.
- [ ] **`20260917110000` (los renombres en sí) NO está en producción, a propósito.**
      Confirmado 2026-09-17 tarde-noche al pegar el resto de la taxonomía: producción
      sigue mostrando "Blusas" y "Camisas" como categorías separadas, y "Accesorios"
      sin el "y Complementos". Falta el ok explícito de Felipe sobre el momento
      (cambia lo que ve una encargada de sede hoy mismo) — no es una migración
      olvidada.

---

## 🎯 Revocar EXECUTE público de las funciones "motor" (2026-09-17, ADR-0078)

`retail.fn_aplicar_movimiento(uuid)` (security definer, sin auto-chequeo) tenía EXECUTE
otorgado a `anon` y `authenticated` — cualquiera podía reaplicar un movimiento de tipo
`entrada` ya existente por RPC directo y duplicar stock sin sesión. Mismo patrón que ya se
cerró para `fn_recalcular_costo_variante` (ADR-0067). Detalle completo, tabla de
llamadores verificados contra `pg_proc` y smoke test en
[docs/adr/0078-revocar-execute-publico-de-las-funciones-motor.md](adr/0078-revocar-execute-publico-de-las-funciones-motor.md).

- [x] **Aplicado en LOCAL** (`docker exec`, no `db reset`):
      `20260917150000_revocar_execute_fn_aplicar_movimiento.sql` y
      `20260917150001_revocar_execute_correlativos_y_codigos.sql` — esta segunda también
      cierra `fn_reservar_numero_serie`/`fn_siguiente_correlativo` (mismo patrón, y más
      grave: llamarlas directo quema un número de serie SUNAT sin emitir nada) y
      `fn_asignar_codigo_producto`/`fn_asignar_codigo_variante` (revoke angosto, solo de
      `anon` — `authenticated` lo necesita vía un trigger que no es security definer).
      Verificado con smoke test `psql`+`ROLLBACK`: los seis caminos anon/authenticated
      directos quedan bloqueados, los dos caminos legítimos (wrapper security definer,
      trigger de variantes) siguen funcionando.
- [x] **Verificado contra producción (solo lectura) — el diagnóstico cambia.**
      `fn_aplicar_movimiento` y `fn_recalcular_costo_variante` ya están cerradas ahí;
      `fn_asignar_codigo_producto`/`variante` ya están en el estado angosto correcto. Pero
      **`fn_reservar_numero_serie`/`fn_siguiente_correlativo` siguen con EXECUTE abierto a
      `authenticated` en producción, hoy** — el hueco de numeración SUNAT es real y
      vigente, no hipotético. Detalle en ADR-0078.
- [x] **Aplicado en PRODUCCIÓN (2026-09-17), reverificado después.** Las dos migraciones
      corrieron contra `vovjyyiafkxteijimpuy` (el primer intento lo frenó el clasificador de
      auto mode, el segundo — con Felipe reconfirmando — sí pasó). Reverificado con
      `has_function_privilege`: las cinco funciones quedaron en el estado esperado.
      `get_advisors` no mostró nada nuevo. `20260917150000` fue no-op (ya estaba cerrada);
      `20260917150001` cerró el hueco real de `fn_reservar_numero_serie`/
      `fn_siguiente_correlativo` para `authenticated`.
- [x] **Confirmado contra producción: `registrar_movimiento_una_sola_firma`
      (20260916214600) en efecto colapsó las dos sobrecargas ambiguas** que localmente
      todavía existen (el smoke test de esta tarea tropezó con la ambigüedad). Falta traer
      ese parche a un archivo de este repo — sigue sin uno.
- [x] **De paso, verificado el BLOQUE 1 de `docs/datos/SQL-PENDIENTE-PRODUCCION.sql`
      (2026-09-12): `authenticated` con `TRUNCATE` sobre `retail`, el más grave de la lista
      ("perder CAYLA entera").** Cero filas en producción hoy — ya no existe, para ningún
      rol. El archivo sigue diciendo "nada ejecutado"; está desactualizado, no el riesgo. No
      se revisaron los demás bloques del archivo.
- [ ] **`pnpm datos:comparar` (corrido de paso, ritual de "Regla de oro") encontró 18
      pantallas rotas en producción — sin relación con esta tarea.** Ninguna de las cinco
      funciones de arriba aparece en la lista. Son funciones que existen en este código
      (`iniciar_traslado`, `cerrar_produccion`, `crear_producto_con_variantes`,
      `fn_prioridad_conteo`, mayormente Producción/Traslados/Conteos) pero nunca llegaron a
      `vovjyyiafkxteijimpuy`. Detalle completo en `docs/datos/generado/DRIFT.md` (ya
      regenerado). Merece su propia sesión — toca varios módulos a la vez.

---

## 🎯 Productos — vista de grilla visual (2026-09-17, ADR-0077)

`/productos` alterna grilla ⇄ tabla (`?vista=`), tarjeta con swatches de color
interactivos (hover = vista previa, clic = fijo) y una vista rápida con detalle de
variantes + Ajustar inventario. Sin fotos reales — ninguna en producción — usa un tinte
del color como placeholder honesto en vez de un ícono de "sin foto". Segunda pasada el
mismo día: en Grilla, el Resumen pasa a una línea muda salvo que haya algo que atender.
Tercera pasada: los filtros pasan a píldoras con ícono, y el botón "Filtros" plegable
vuelve (a Felipe le gustaba más así) — Categoría/Color/Estado/Stock dejan el `<select>`
nativo por Radix Select (mismo `radix-ui` ya instalado): la lista abierta también tiene
estilo propio. Color muestra el swatch real de cada opción (`colores.hex`, sumado a la
consulta). Cuarta pasada: las píldoras pierden la caja con borde — ícono+texto sueltos
con el mismo hilo vivo que ya usa `CampoTexto` en el resto del sistema, el panel que
las agrupa pasa a una sola tarjeta con separadores finos en vez de una caja de cajas.
Quinta pasada: el panel pasa de fondo blanco (`papel`) a `sand/50` ("plomo"), las
píldoras ganan la tipografía versalita de "Filtros", y se suma orden por precio
ascendente/descendente (`p_orden` en `fn_productos`,
`20260917180000_productos_ordenar_por_precio.sql`). La Tabla conserva las dos tarjetas
completas, sin tocar en ninguna pasada. Todo construido y verificado en el navegador
local (10 productos reales, incluido el orden por precio funcionando de punta a punta).

- [x] **`20260917180000_productos_ordenar_por_precio.sql` — resuelto indirectamente, con
      un incidente en el medio (2026-09-17, ver BITÁCORA "`/productos` caído en
      producción").** No se pegó nunca sola: solo llegó `20260917190000` (fotos por
      color), que ya traía el mismo `p_orden` en su propio cuerpo — pero como su `DROP`
      apuntaba a la firma de 10 parámetros y no a la de 9, la sobrecarga vieja quedó
      viva y `/productos` se cayó por ambigüedad de RPC. Cerrado con
      `20260917200000_fn_productos_dropea_sobrecarga_vieja.sql` (ok puntual de Felipe:
      "Si hazlo"). Verificado: una sola sobrecarga, `fn_productos` responde con datos
      reales.

- [x] **`producto_fotos` gana `color_codigo` y `fn_productos` devuelve `foto_url` por
      variante — construido, en producción y con el primer piloto real de 5 prendas ×
      4 colores (2026-09-17, ADR-0077 addenda 7; ver BITÁCORA "Primeras 20 fotos reales
      del catálogo" y su corrección el mismo día).** `FotosProducto.tsx`
      (`/productos/[id]/editar`) tiene el selector de color por foto. Piloto real: 5
      productos nuevos (Blusa Ximena, Casaca Emilia, Chompa Josefina, Pantalón Milagros,
      Short Ivanna), cada uno en sus 4 colores (Blanco/Naranja/Negro/Verde) como
      variantes de UN producto — no 20 productos separados, corregido tras el primer
      intento — con foto real por color en `retail-productos-fotos` y stock real
      inyectado (`carga_inicial` en Taller, mismo mecanismo que el resto del catálogo).
      Confirmado con `fn_productos` devolviendo `foto_url` por variante.
      `20260917190000_producto_fotos_por_color.sql` está en producción
      (verificado directo contra `pg_proc`, no solo por lo que decía este BACKLOG).
- [ ] **Verificar en navegador como colaboradora, no solo como líder.** Esta sesión probó
      con la sesión de Felipe en local; falta confirmar que "Ajustar inventario"/"Editar"
      desde la vista rápida se comportan igual para un integrante sin rol de líder.
- [ ] **Sin cambios de esquema en esta pieza** — nada que aplicar a producción todavía; el
      toggle y el componente nuevo son 100% código de front.

---

## 🎯 Recibir mercadería: productos fuera de factura (2026-09-17, ADR-0076)

Felipe: "recibir mercadería" solo se rige respecto a las facturas — si algo
llegó (o se envió) pero ninguna factura de la guía lo lista, no había dónde
anotarlo sin salir a `/inventario/recibir` y perder que llegó en el mismo
paquete. `recibir_compras` ahora acepta ítems con `compra_item_id = null` en
el mismo `p_items`: mismo lote/guía/proveedor que lo facturado, sin tope
contra ninguna línea, sin tocar `compra_pagos` (no inventa deuda), costo
opcional (mismo criterio que `recibir_lote`). Pantalla: nueva sección "¿Llegó
algo que no está en la factura?" en `RecepcionCompraFormV2.tsx`, con el mismo
`ComboBuscable` que ya usa "Registrar factura" para buscar cualquier producto
del catálogo — no solo lo que está en las facturas seleccionadas. Detalle
completo, incluida la verificación por SQL (4 escenarios, con `rollback`) y en
navegador real, en ADR-0076.

Distinto del hueco "mercadería corta o dañada no tiene adónde ir" de la
auditoría más abajo (2026-09-17, misma fecha) — ese es sub-entrega contra lo
facturado; este es sobre-entrega sin factura. No se tocan entre sí.

- [x] **En producción desde 2026-09-17** — aplicada con el MCP de Supabase
      (`apply_migration` contra `vovjyyiafkxteijimpuy`, ok de Felipe para
      todo el paso), no a mano en el SQL Editor. Verificado después contra
      la base, no solo que no tirara error: `retail.recibir_compras` quedó
      con una sola sobrecarga (candado ADR-0009/0004 intacto) y su cuerpo
      real ya tiene `v_con_factura`. `get_advisors` (security) no marcó nada
      nuevo — la única advertencia es la genérica de cualquier
      `security definer` + `authenticated`, ya presente en el resto de RPC
      del repo.
- [ ] **Sin pruebas automatizadas para el camino nuevo** — mismo patrón de
      deuda que el resto de RPC de escritura (ver "Cambios: primeras pruebas
      automatizadas" más abajo). Si alguien escribe
      `scripts/pruebas/recibir_compras.mjs`, los 4 escenarios de ADR-0076 son
      el punto de partida.
- [ ] **Dato de prueba real en el Postgres local compartido.** La recepción
      de "Blusa Emma S/Negro" (2 u., costo 25.50, fuera de factura) + 3 u.
      reales de "Casaca Ximena S/Negro" contra F002-001045 queda en la base
      — no se borró (principio 4, `movimientos` es append-only). Mismo
      criterio que la recepción sin factura de la sesión anterior, el mismo
      día.

---

## 🔖 Pendientes Benja

> Felipe: "recuérdame esto para revisarlo luego con Benja, no lo construyas todavía."
> Sección aparte a propósito — no es un ítem de 🎯/🩹 más, es una cola visible de
> "esto necesita una conversación de negocio antes de volverse código". Se lee al
> abrir sesión junto con el resto de este archivo.
>
> **Nota de fusión (2026-09-17):** otra sesión creó en paralelo una sección equivalente
> ("👤 Pendientes de Benja", mismo concepto, mismo día) — se fusionó acá para no tener
> dos colas del mismo tipo con nombres distintos (mismo criterio que ya aplicó este
> archivo antes con secciones duplicadas de auditoría de migraciones).

- [x] ~~Cuarentena — historial y estado de salida de una prenda dañada~~ **construido
      2026-09-17 (noche)** — Felipe aclaró que lo pendiente era solo la editabilidad,
      no los 3 estados en sí ("ahora mismo necesito los 3 estados [...] luego vamos por
      medio de un panel de administrador, poder editar estas decisiones"). Ver
      `docs/adr/0071-inventario-se-lee-como-cuatro-pantallas.md`, sección "Construcción
      2026-09-17 (noche)", para el detalle completo. Lo único que sigue pendiente de
      esa conversación con Benja es el punto de abajo.

- [ ] **Panel de administrador para editar los 3 estados de Cuarentena.** Hoy Liquidada/
      Se botó/Donada están fijos en un `check` de `retail.prendas_danadas` (migración
      `20260917095000_cuarentena_prendas_danadas.sql`) — cambiar el vocabulario o agregar
      un cuarto estado es una migración, no una pantalla. Felipe pidió que esto nazca
      chico y no se sobrecargue de funciones todavía. Preguntas reales que siguen
      abiertas (no se decidieron solas): ¿quién más allá de un líder podría necesitar
      editar estos estados?

- [x] ~~¿"Liquidada" debería registrar una venta real?~~ **Sí — confirmado por Felipe,
      2026-09-17: "se tiene que tomar en cuenta liquidación como una venta, totalmente".**
      Construido en `20260917150000_liquidar_prenda_danada_como_venta.sql`: nueva función
      `liquidar_prenda_danada` (precio + forma de pago, exige caja abierta, sin comprobante
      por ahora — ver ADR-0071 sección "Corrección 2026-09-17 (más tarde)" para el
      detalle y lo que queda fuera a propósito).

- [x] ~~`devolver_proveedor` — mismo bug de "desaparece sin dejar rastro" que tenía
      Dañado~~ **decisión de Felipe, 2026-09-17: no es prioridad.** "Me parece que la
      manejarán de otra manera [...] si no afecta en nuestra actividad actual ahora mismo,
      entonces no." Sigue sin tocar — si en algún momento se vuelve relevante, retomar
      desde `retail.aprobar_devolucion`, rama `devolver_proveedor`.

- [ ] **Reporte de valor en riesgo, cruzando las 3 sedes a la vez (2026-09-17).** Surgió
      al corregir `fn_prioridad_conteo` (ADR-0074, § "Descartado") — esa función sugiere
      qué contar primero para UNA sede, pensada para el colaborador que va a contar hoy.
      Lo que Benja tendría que construir es distinto: una vista para Felipe/líderes que
      responda "¿cuánta plata sin contar hay expuesta ahora mismo, en las 3 sedes y el
      Taller, ordenada de mayor a menor?" — sin acción de conteo asociada, es solo
      visibilidad para decidir dónde presionar. No reusar `fn_prioridad_conteo` tal cual:
      está `security definer` con `fn_puede_operar_ubicacion` (una sola sede por llamada)
      — una versión cross-sede necesita su propio RPC y probablemente reservarse a
      líder/Felipe, no a cualquier colaborador autenticado. Sin fecha, sin dueño todavía.

---

## 🎯 Recibir mercadería: lista de recepciones + "+ Nueva recepción" (2026-09-17)

Felipe lo pidió tras la auditoría de huecos de más abajo (misma fecha): la pantalla no
dejaba ver nada de lo ya recibido, solo lo pendiente o un formulario en blanco. Sin
cambios de esquema — `retail.lotes` ya guardaba cada recepción (con o sin factura,
ADR-0035); nadie la leía todavía fuera del detalle de una factura puntual
(`getRecepcionesCompra`). Nuevo: `getRecepcionesRecientes()` (`lib/compras.ts`) generaliza
esa misma consulta sin acotar a una factura, y `RecepcionesRecientes.tsx` (reusa
`Tabla`/`Encabezado` de `components/ui/Tabla.tsx`) la dibuja en las dos pantallas:

- **`/inventario/recibir` (sin factura):** pasó de ser siempre el formulario a lista +
  botón — mismo patrón que Colores/Categorías (2026-09-15): `RecibirLotePanel.tsx`
  (nuevo) pone el formulario (`RecepcionFormV2`, lógica de escritura intacta, solo le
  quité el `card-cayla` propio para que no quede una tarjeta dentro de otra) detrás de
  "+ Nueva recepción" en un `Modal`.
- **`/compras/recibir` (con factura, ADR-0035):** pestañas "Pendientes"/"Recibidas
  recientemente" por `?vista=`, server-driven (sin estado de cliente nuevo) para no
  tocar `RecepcionCompraFormV2` (615 líneas, ya maneja bastante estado propio). Cada
  fila de "Recibidas" enlaza a `/compras/factura/[compraId]`.
- Enlace cruzado en los dos sentidos: antes solo `/compras/recibir` mencionaba (y solo
  en su estado vacío) la ruta sin factura; ahora los dos headers se referencian entre sí
  siempre, no solo cuando la lista está vacía.

Verificado en navegador real: recepción sin factura completa (Confecciones del Sur
EIRL, Tienda Lima, 1 unidad, 17/09/2026 — queda como dato real en el Postgres local
compartido, no se borra, principio 4) aparece al instante en la lista tras
`router.refresh()`; pestaña "Recibidas" de Compras muestra las 2 facturas ya recibidas
del seed y enlaza bien al detalle; como Micaela (colaboradora, Tienda Trujillo) la
lista sin factura sale vacía y scoped a su sede — RLS de `lotes`/`movimientos`
(`fn_puede_operar_ubicacion`) ya lo resolvía, no hizo falta acotar nada a mano.
`pnpm --filter web typecheck`/`lint` en verde.

- [ ] **Pregunta de negocio para Felipe, no técnica — cuál pantalla es el default.**
      La tarjeta "Recibir mercadería" del Inicio (`AppShell.tsx`, sección `acciones`)
      manda a `/inventario/recibir` (sin factura); el menú global "+ Nuevo" manda a
      `/compras/recibir` (con factura, el camino principal según ADR-0035). Los dos
      accesos más visibles de la app hoy no coinciden. No lo cambié — decidir cuál es
      el más común en la operación real es suyo, no de Postgres/Next.js.
- [x] **Corrección (mismo día): lo de `personas` NO era drift — es real, en
      producción también.** Primer diagnóstico (arriba, ya borrado) decía que
      `retail.personas` vivía en `public` por drift del Postgres local. Falso:
      verificado contra producción (`vovjyyiafkxteijimpuy`, `information_schema.tables`)
      que `retail.personas` **no existe ahí tampoco** — la identidad de personas está
      unificada con Dynamic desde julio-2026, en `public.personas` (su tabla de
      RR.HH. completa: `nombres`/`apellidos`, no `nombre`; `sede_base_id`, no
      `ubicacion_id`; 30+ columnas de planilla). PostgREST no embebe entre schemas, y
      el propio repo YA tiene el patrón correcto para esto —
      `fn_nombres_personas(p_ids uuid[])` (`0009_integracion_dynamic.sql`), que
      `caja.ts`/`conteos.ts`/`traslados.ts`/`devoluciones.ts` ya usan. Se corrigió
      `getRecepcionesRecientes` para usar esa misma RPC (ya no toca `personas`
      directo) y se revirtió el hand-fix de `packages/database/src/types.ts` (la
      tabla `personas` y el FK que le había agregado a mano a `lotes` no existen en
      ningún lado — era una tabla inventada). Verificado en navegador: "Recibido por"
      ahora sale con el nombre real en las dos filas de la lista.
- [ ] **Sin pruebas automatizadas** para `getRecepcionesRecientes` — mismo patrón de
      deuda que el resto de RPC/consultas de este módulo (ver sección de huecos de
      más abajo, mismo día).

---

## 🎯 Auditoría de migraciones pendientes en producción (2026-09-17)

Felipe pidió validar qué migraciones de `supabase/migrations/` faltan en producción,
antes de correrlas. **Nada contra docs — cada fila de abajo se verificó en vivo contra
`vovjyyiafkxteijimpuy` schema `retail`** (`execute_sql`/`list_migrations`, solo lectura):
columnas/funciones/índices reales, y para dos casos el cuerpo de la función (no alcanza
con que la función exista — hay que ver qué hace). El propio BACKLOG venía desactualizado
en dos direcciones — otra vez el patrón de [[commits-y-migraciones-en-produccion]]:
`20260916200000_numeracion_traslados_conteos.sql` y el SQL de colores del 16-sep
**ya estaban aplicados** (corregidos arriba, en sus propias secciones) aunque sus
checkboxes seguían sin marcar. Las 7 migraciones "de las 5 piezas inspiradas en NetSuite"
más `cambio_y_devolucion_exigen_caja`/`anular_venta`/`variantes_identidad_unica` — 7
chequeos directos contra columnas/funciones reales — también están todas aplicadas.

- [x] **`20260916223000_venta_precio_cambiado_sku_nulo.sql` — aplicada en producción
      2026-09-17, con ok puntual de Felipe.** Corrida con el MCP de Supabase
      (`apply_migration` contra `vovjyyiafkxteijimpuy`), no a mano en el SQL Editor.
      Verificado después contra la base, no solo que no tirara error: una sola
      sobrecarga de `retail.registrar_venta` (sin dejar el candado ADR-0009/0004
      roto) y su cuerpo real ya arma `v_sku` con
      `coalesce(v.codigo, v.sku, 'sin código')`, no con el `select` original.
- [ ] **Producción tiene migraciones sin registro local** (informativo, no bloquea nada):
      `list_migrations` muestra `historial_candado_completo` (20260916200000),
      `historial_producto_estado_restaurado` (20260916201742),
      `anular_venta_sin_huecos` (20260916214500) y
      `registrar_movimiento_una_sola_firma` (20260916214600) aplicadas en producción sin
      un archivo `supabase/migrations/*.sql` con ese nombre en este repo — probablemente
      parches que Felipe escribió directo en el SQL Editor. No se investigó qué cambian
      exactamente (no era la pregunta de hoy); si alguna corrige algo que un archivo local
      "deshace" al pegarse encima, vale la pena migrar el fix a un archivo del repo antes
      de la próxima ronda de producción.
- [ ] **`benja-migracion.sql` sigue como estaba: NO ejecutar.** El propio archivo se
      marca "PENDIENTE DE REVISIÓN — NO EJECUTADO EN PRODUCCIÓN. NO CORRER TAL CUAL" — es
      un `pg_dump --schema-only` de referencia, no una migración incremental. No se tocó.

---

## 🔍 Revisión: Recibir mercadería — huecos para flujo completo de ERP (2026-09-17)

Auditoría pedida por Felipe sobre `/compras/recibir` (RPC `recibir_compras`, ADR-0035) y
`/inventario/recibir` (RPC `recibir_lote`, sin factura) — sin cambios de código, solo
lectura de repo + producción (`vovjyyiafkxteijimpuy`). El diseño en sí está sólido (costo
promedio ponderado con `costo_historial` auditable, tope contra lo facturado con
`select ... for update`, piso/almacén, adjuntos de factura, paginado por cursor) — los
huecos son de alcance, no de correctitud.

- [ ] **El flujo nunca corrió en producción de verdad.** `retail.compras` = 0 filas
      (verificado contra la base, no contra docs). De 160 movimientos `tipo='entrada'`,
      156 son `carga_inicial`, 3 `siembra_cargo_especial`, 1 `devolucion` — ninguno
      `motivo='recepcion'`. Ni `recibir_compras` ni `recibir_lote` se ejecutaron nunca en
      producción. Antes de agregar nada más, correr una recepción real es lo que más
      destapa fricción de verdad (principio 7).
- [ ] **Mercadería corta o dañada no tiene adónde ir** — ya admitido en el propio
      ADR-0035 (docs/adr/0035-la-factura-de-compra-es-el-eje-de-recepcion-y-pago.md:92-93,
      "falta decidir si se agrega 'cerrar línea con faltante'"). Sin eso, una factura con
      3 prendas rotas queda `parcial` para siempre.
- [ ] **Devolución a proveedor es una etiqueta hueca.** `devolucion_items.condicion =
      'devolver_proveedor'` existe (`0002_esquema.sql:269`) pero en `aprobar_devolucion`
      (`20260914230000_inventario_piso_almacen.sql:596-604`) esa condición no genera
      ningún movimiento ni ajuste de deuda con el proveedor — la fila queda marcada y ahí
      termina. Conecta directo con el punto anterior: mercadería dañada no tiene cómo
      salir del sistema hacia el proveedor ni descontarse de lo que se le debe.
- [x] **Insumos/materia prima del Taller: dominio fantasma — RESUELTO 2026-09-17
      (ADR-0090), aplicado en producción.** `retail.insumos`/`insumo_lotes`/
      `movimientos_insumo`/`v_insumo_saldos` (+ `recibir_insumo`/
      `ajustar_insumo_por_conteo`, YA funcionando) son huérfanas del volcado de
      unificación (jul-2026), 0 filas, sin conectar. Primer intento del día construyó un
      esquema paralelo por no leer este ítem antes — chocaba de nombre, se descartó
      (commit `fd3488f`, historia en ADR-0090). Versión final: **adoptado el esquema
      huérfano tal cual** (dos sesiones distintas lo reconstruyeron el mismo día, de
      forma independiente, y coincidieron columna por columna — buena confirmación
      cruzada), más la única pieza que faltaba, `retail.registrar_consumo_insumo`
      (elige el lote más antiguo con saldo, sin partir entre lotes; recalcula
      `costo_tela`/`costo_avios` real). **Local:** `20260917140000_insumos_taller_reconstruido.sql`
      (espejo, ya en `main`) + `20260917141500_registrar_consumo_insumo.sql` (la pieza
      nueva). **`registrar_consumo_insumo` pegada en producción el 2026-09-17** (ok
      explícito de Felipe, excepción puntual a D-11) — confirmado `security_type=DEFINER`
      y `proacl` sin `public`. Fuera de alcance a propósito: `compra_items.producto_id`
      sigue sin poder recibir tela/avíos contra una factura por `/compras/recibir`, y
      `NuevaOrdenProduccionForm.tsx` sigue sin conectar al nuevo stock.
- [ ] **Etiquetado físico (código de barras) al recibir no existe hoy.**
      `EtiquetasGenerator.tsx` ya no está en el árbol; quedan huérfanos `Codigo128.tsx`/
      `codigo128.ts` sin ningún importador (verificado con grep — cero componentes los
      usan). Este mismo BACKLOG decía que `/etiquetas` se "movió a Compras hace tiempo"
      (línea ~546 de este archivo), pero no existe ninguna carpeta `etiquetas` bajo
      `apps/web/app/(app)/compras` — el traslado nunca se completó.
- [ ] **Piso vs. almacén al recibir es 100% fijo.** `fn_sububicacion_por_defecto('entrada')`
      (`20260914230000_inventario_piso_almacen.sql:74-87`) siempre devuelve
      `almacen_tienda`, calculado una sola vez antes del loop; ni la RPC ni la pantalla
      dejan mandar parte de una recepción directo al piso de venta. Probablemente
      intencional (se mueve después por separado vía `/inventario/mover`), vale
      confirmarlo con Felipe si alguna vez pesa en la operación real.
- [ ] **Sin pruebas automatizadas** para `recibir_compras`/`recibir_lote` (`scripts/pruebas/`
      tiene `registrar_cambio.mjs`, `aprobar_devolucion_caja.mjs` y, desde 2026-09-17,
      `registrar_venta.mjs`) — mismo patrón de deuda que todavía tienen
      `iniciar_traslado`/`cerrar_caja` (ver sección "Ventas: primeras pruebas
      automatizadas de `registrar_venta`" más abajo), todavía no le tocó el turno a este
      RPC.
- [ ] **D-45 (`docs/datos/DECISIONES-2026-09-12.md:275`, costeo del inventario) sigue
      listada como abierta pese a que ya se resolvió en código** (promedio ponderado,
      `20260916090000_costo_promedio_ponderado.sql`, confirmado en producción hoy) — el
      documento de decisiones nunca se actualizó para cerrarla. Corregir la tabla de
      "Decisiones que quedaron abiertas" en ese archivo.

---

## 🎯 Facturación: auditoría de flujo completo (2026-09-17)

Felipe preguntó qué le falta al módulo para un flujo completo de ERP. Solo auditoría —
sin cambios de código. Detalle completo, con cita de archivo/línea de cada hallazgo, en
`docs/datos/modulos/08-facturacion-sunat.md` (huecos 1-16, actualizado hoy). Primer
hallazgo, antes que nada: el doc de módulo (fechado 12-sep) tenía **dos huecos ya
resueltos ese mismo día** por `0011_venta_con_comprobante.sql` — venta↔comprobante SÍ
están conectados (`PuntoDeVenta.tsx:647-650` manda `p_tipo_comprobante` siempre) y la
proforma SÍ guarda `precio_unitario` correcto — quedaron marcados RESUELTO en el doc,
con cita, para que nadie los reconstruya.

- [x] **El PDF/XML/CDR que Lucode devuelve en cada emisión se guarda en
      `comprobantes.respuesta_sunat` y ninguna pantalla lo mostraba — CERRADO
      2026-09-18.** `getComprobantesMes` (`lib/comprobantes.ts`) ahora extrae
      `pdfUrl`/`xmlUrl`/`cdrUrl` de `respuesta_sunat` y `ComprobantesPanel.tsx`
      los muestra como enlaces ("Ver PDF · XML · CDR") debajo de cada
      comprobante, en la tabla de escritorio y la tarjeta de celular. Sin
      cambio de esquema — el dato ya existía, solo faltaba leerlo. Verificado
      en navegador local inyectando una `respuesta_sunat` de prueba (revertida
      después). `tsc`/lint/297 tests en verde.
- [x] **Comprobante `pendiente` huérfano, sin camino de salida — RESUELTO
      2026-09-17 por ADR-0093 (`marcar_comprobante_no_emitido`), verificado
      por la auditoría del 2026-09-18: existe la RPC, el botón "Liberar" en
      `ComprobantesPanel.tsx`, y el estado `no_emitido` en el esquema.** Ya
      no es un hueco abierto.
- [x] **Devoluciones/Cambios no emitían Nota de Crédito — CERRADO 2026-09-18
      (ADR-0100).** `aprobar_devolucion` ahora emite la Nota de Crédito sola
      (`emitir_nota`, sin llamador real desde la Fase 0) cuando la venta
      devuelta tiene un comprobante `aceptado` — por el valor exacto de lo
      devuelto, con el motivo 06/07 del Catálogo 09 según sea total o
      parcial. Sin pantalla nueva: aparece en la lista de comprobantes de
      Facturación, lista para "Transmitir". Probado en local con SQL directo
      (devolución parcial real: NC01-000001, subtotal 63.47 + IGV 11.43 =
      total 74.90, coincide centavo a centavo con el cálculo de
      `ComprobantesPanel.tsx`). CI encontró un bug real antes de fusionar
      (la reconstrucción de `aprobar_devolucion` se llevó por delante el
      candado de caja abierta y la cuarentena de prendas dañadas de 2
      migraciones posteriores reales) — corregido, 48/48 pruebas de los 4
      scripts de `scripts/pruebas/` en verde. `tsc`/lint/297 tests en verde.
      **`20260918050000_devolucion_emite_nota_credito.sql` aplicada y
      verificada en producción 2026-09-18** (columna + función confirmadas,
      cuerpo de `aprobar_devolucion` comparado byte a byte contra el de
      producción antes de reemplazarlo).
      **Pendiente real de Felipe, sigue bloqueando el primer uso:** ninguna
      ubicación tiene serie de `nota_credito` registrada todavía — hay que
      registrarla (botón "Registrar serie", ya existe) en cada ubicación con
      boleta o factura, o la primera devolución sobre una venta facturada va
      a fallar con un mensaje que se lo pide explícitamente (a propósito:
      mejor bloquear con un mensaje claro que aprobar la devolución y dejar
      la Nota de Crédito perdida para siempre).
- [x] **`emitir_comprobante` sin idempotencia (hueco 1) y sin candado de IGV (hueco 2b)
      — CERRADO 2026-09-18 (ADR-0102), `20260918091500_emitir_comprobante_idempotente_y_valida_igv.sql`.**
      Portado el mismo patrón `token_cliente`/`p_token` de `registrar_venta`: el guard
      revisa el token antes de reservar el correlativo, así un reintento (respuesta
      perdida, no doble clic) no quema un segundo número. `ComprobantesPanel.tsx` manda
      el token con `useRef` (mismo patrón que `PuntoDeVenta.tsx`). Además, `subtotal +
      igv = total` ahora se valida en la base en `emitir_comprobante` y `crear_proforma`
      — ya no se puede guardar una cifra que no cuadra llamando la RPC directo. Aplicado
      y verificado contra Postgres local (`psql -f`, `CREATE FUNCTION` sin error,
      `pg_get_function_identity_arguments` confirma `p_token`); `pnpm --filter database
      typecheck`/`pnpm --filter web typecheck` en verde. **No probado con una llamada RPC
      autenticada real** (exige JWT/persona real, ver ADR-0102) — solo verificación
      estructural. **No aplicado en producción** — pendiente de Felipe (D-11), aunque ya
      verificado contra `cayla-dynamic` de solo lectura: `emitir_comprobante`/
      `crear_proforma` tienen la misma firma que local (`p_ubicacion_id` incluido,
      no `p_sede_id`), `token_cliente` no existe todavía, 0 filas en
      `comprobantes`/`proformas` con `subtotal+igv≠total` — la migración está lista para
      pegar tal cual, prefijo `retail.` ya incluido en el archivo. **Sigue sin resolver:**
      el 18% hardcodeado en 3 archivos (parte (a) del hueco 2) y el redondeo
      navegador-vs-Lucode (parte (c)) — ver "Lo que falta" en ADR-0102.

Encontrado pero no listado arriba (menor prioridad, incluido en el doc de módulo, no
repetido acá por la regla de 3 ítems por cubo): `registrar_serie_comprobante` no valida
ubicación, un líder puede reapuntar la serie de otra tienda (hueco 12);
`comprobantes.cliente_*` no está ligado a la tabla `clientes` (hueco 16); cero pruebas de
las RPC del módulo contra Postgres real (a diferencia de `registrar_cambio`/
`aprobar_devolucion`, ADR-0066); y el bug ya anotado 2026-09-16 de "Monto facturado"
sumando pendientes/rechazados/anulados/prueba sigue sin decisión.

---

## 🐛 `registrar_venta`: `venta_precio_cambiado` revienta con una prenda sin SKU (2026-09-16)

- [x] **`v_sku` llegaba `NULL` a un `raise ... using detail = ... || v_sku || ...`**
      (`20260915140000_descuento_motivo_y_escalonado.sql`) para cualquier prenda del
      censo (`crear_producto_con_variantes`, `sku` nullable desde
      `20260915221633_crear_producto_con_variantes.sql`). Concatenar con `||` un NULL
      da NULL, y Postgres corta el `RAISE` con su propio error interno ("RAISE
      statement option cannot be null") en vez del `venta_precio_cambiado` (o
      `venta_descuento_*`) que se quería lanzar — la colaboradora veía un error crudo
      de Postgres justo en la venta de una prenda sin SKU, sin el mensaje traducido de
      `error-escritura.ts`. Corregido en
      `20260916223000_venta_precio_cambiado_sku_nulo.sql`: mismo criterio que
      `apps/web/lib/prenda-reglas.ts` (`codigoPrenda`) — código de etiqueta primero,
      sku legado de respaldo, texto fijo si no hubiera ninguno. Reproducido y
      verificado en local (`npx supabase db reset` + una prenda sin sku real): antes
      revienta con el error de Postgres, después lanza `venta_precio_cambiado` con el
      código de etiqueta en el `detail`.
      **En producción desde 2026-09-17** — aplicada con el MCP de Supabase (ok
      puntual de Felipe), no a mano en el SQL Editor. Verificado contra
      `vovjyyiafkxteijimpuy`: `retail.registrar_venta` sigue con una sola sobrecarga
      (mismo candado que se chequeó antes de pegar, ADR-0009/0004) y su cuerpo real
      ya arma `v_sku` con `coalesce(v.codigo, v.sku, 'sin código')`, no con el
      `select` original.

---

## 🎯 Inventario — las 4 vistas de Felipe (2026-09-16, ADR-0071)

Rama `inventario-vistas-de-felipe`. Existencias, Movimientos, Traslados y Conteo
rediseñadas sobre los datos que ya existían; "Inventario" es grupo del lateral con las
4 como pestañas. Tipos, lint, 282 pruebas y build en verde; recorrido en navegador como
líder (Lima) y como colaboradora (Trujillo).

- [x] **Aplicar en producción `20260916200000_numeracion_traslados_conteos.sql`** —
      hecho el 2026-09-16 vía MCP de Supabase (PR #60 ya fusionado), y confirmado de
      nuevo el 2026-09-17 por otra auditoría independiente: `numero`,
      `fn_conteos_resumen`, `conteos.alcance` existen en `vovjyyiafkxteijimpuy`
      (`list_migrations` la muestra pegada con timestamp `20260916231541`). Este
      checkbox se quedó sin marcar en las dos sesiones hasta ahora — dos veces la
      misma verificación, misma respuesta.
- [ ] **Lo que los diseños traían y quedó fuera a propósito:** ~~exportar a CSV/Excel en
      Existencias~~ **RESUELTO 2026-09-17** — botón "Exportar CSV" en
      `InventarioPanel.tsx`, mismo patrón que `AjustarInventarioModal` con
      `descargarCsv`, exporta las filas ya filtradas en pantalla. Quedan: exportar CSV en
      Movimientos (exige una consulta completa, no la página), campana de
      notificaciones, "Ajuste rápido" desde la cabecera de Movimientos (hoy vive por fila
      en Existencias).
- [ ] **"Pedir traslado" no es una acción del sistema.** El semáforo "Stock bajo" dice
      "pide traslado" y "En la red" dice dónde hay, pero el pedido se hace por
      WhatsApp. Una "solicitud de traslado" desde la sede destino (que la sede origen
      convierte en `iniciar_traslado`) cerraría el ciclo. Es modelo de datos nuevo:
      pedir a Felipe con Ganas/Pagas antes de tocarlo.
- [x] ~~"Dañado" (2026-09-17) — decidido: Opción A, sin construir todavía~~
      **construido 2026-09-17 (noche).** `cuarentena` como tercer tipo de
      sububicación; `aprobar_devolucion` mueve ahí las condiciones
      `danada_reparacion`/`danada_donar` en vez de hacerlas desaparecer; tabla
      `retail.prendas_danadas` + RPC `resolver_prenda_danada` (solo líder) resuelven
      cada una como Liquidada/Se botó/Donada; Existencias reemplazó la tarjeta "Piden
      atención" por "Dañado". El ajuste "Merma" de `AjustarInventarioModal` NO se
      tocó — ya tenía su propio movimiento auditable, es un mecanismo distinto. Ver
      ADR-0071, sección "Construcción 2026-09-17 (noche)", para el detalle completo
      y lo que quedó explícitamente fuera de esta pasada (panel de administrador
      para editar los 3 estados; si "Liquidada" debería ser una venta real) — ambos
      en "🔖 Pendientes Benja" más arriba.

---

## 🎯 Colores: proponer/aprobar (2026-09-16, ADR-0070)

Rama `claude/proponer-aprobar-color-20260916`. Cierra el punto que había quedado
abierto en el ítem de Loro de más abajo: cualquiera con sesión propone un color y
queda usable al instante (no frena el censo); cualquiera de los 9 Líderes lo aprueba
después. `retail.colores` gana `estado`/`propuesto_por`/`aprobado_por`/`aprobado_en`;
el estado real lo decide un trigger (`fn_colores_estado_trigger`) mirando
`fn_es_lider()`, no el cliente. `typecheck`/`lint`/266 tests en verde.

- [x] **Pegado en producción — 2026-09-17.** Felipe corrió los 3 bloques en el SQL
      Editor de `cayla-dynamic`. Comprobación (bloque 4): `estados_invalidos=0`,
      `trigger_creado=1`, `policy_insert=1`, `policy_update=1`, `policy_vieja=0` —
      los 5 valores exactos esperados. `colores_ya_aprobados=31`, no "32+" como decía
      el comentario del script (estimación del 16-sep, desactualizada) — confirmado
      por consulta directa (`select estado, count(*) from retail.colores group by
      estado`) que producción tiene hoy exactamente 31 colores, los 31 en
      `aprobado`, cero `pendiente` y cero en estado inválido.
- [x] **Verificado en navegador real, contra el Postgres LOCAL — 2026-09-17 (no el
      canal de ROLLBACK/impersonación del 16-sep, que tiene `rolbypassrls=true` y
      no prueba nada de RLS).** Micaela (`micaela@cayla.local`, Colaboradora real
      del seed, Tienda Trujillo) inició sesión de verdad
      (`supabase.auth.signInWithPassword`) y propuso "Verde Prueba RLS 20260917"
      (`VPR`) en `/productos/colores`: quedó usable al instante con
      `estado='pendiente'`, sin bloquear el flujo. Su intento de aprobarlo se
      probó por dos caminos — no solo "el botón no aparece", que `security-review`
      de este repo ya penaliza como prueba insuficiente: (1) PATCH directo a
      PostgREST (`/rest/v1/colores`, con su JWT real, sin pasar por la app) —
      `colores_update_lider` lo dejó pasar como consulta válida pero sin tocar
      ninguna fila (`200`, `[]`, el comportamiento normal de un `USING` que no
      matchea); (2) PATCH directo a `/api/productos/colores` — el guard propio de
      la ruta respondió `403 "Solo un Líder puede editar el vocabulario de
      colores."`. Lectura directa de Postgres (`docker exec ... psql`, sin pasar
      por RLS) confirmó que el color siguió `pendiente` después de los dos
      intentos. Felipe (Líder, Tienda Lima) inició sesión aparte, vio el botón
      "Aprobar" que Micaela nunca vio, lo usó, y Postgres confirmó
      `estado='aprobado'`, `propuesto_por=Micaela`, `aprobado_por=Felipe`,
      `aprobado_en` sellado. Color de prueba borrado al cerrar (cero variantes lo
      usaban). Las dos políticas RLS (`colores_insert_autenticado`/
      `colores_update_lider`) quedan probadas de punta a punta, ya no solo por
      inferencia de patrón. Ver ADR-0070, sección "Cómo se verificó" (actualizada).
      **Repetido en producción el mismo día por Felipe, en persona, con una cuenta
      real:** confirmó que las mismas situaciones (proponer, no poder aprobar como
      Colaboradora, sí poder aprobar como Líder) funcionan igual en `cayla-dynamic`.
      A diferencia de la prueba local de arriba, esta quedó al nivel "Felipe lo
      probó y confirmó que funciona" — sin el detalle de qué devolvió cada request
      capturado en el chat.
- [x] **`SQL-PENDIENTE-PRODUCCION-2026-09-16-colores.sql` sí está en producción**
      (verificado 2026-09-17 contra `vovjyyiafkxteijimpuy`, no contra docs:
      `retail.colores.estado`/`propuesto_por` y `fn_colores_estado_trigger`
      existen). Este BACKLOG no reflejaba que ya se aplicó — la verificación de
      abajo (colaboradora real en el navegador) sigue abierta, es un punto aparte.
- [ ] **Verificación pendiente, con dueño claro:** la lógica del trigger se probó de
      verdad contra producción (impersonando a Felipe y a Angie Chávez, una de las 16
      colaboradoras dadas de alta hoy, en una transacción con ROLLBACK). Las dos
      políticas RLS nuevas **no** se pudieron probar de punta a punta por ese mismo
      canal — la conexión usada tiene `rolbypassrls=true` y pasa por encima de
      cualquier política siempre. Sintaxis idéntica a `colores_select`/
      `productos_write_lider`, ya vivas en producción, pero es inferencia por patrón,
      no prueba. **Falta: alguien con una cuenta de Colaborador real entra a
      `/productos/colores` en el navegador, propone un color, y confirma que no
      puede aprobarlo — solo un Líder puede.** Ver ADR-0070, sección "Cómo se
      verificó".
- [ ] **No hay forma de "rechazar" una propuesta mala, solo desactivarla** una por
      una desde el camino que ya existía. Con 16 cuentas nuevas es un riesgo bajo,
      no cero. No construido a propósito en esta pasada (alcance acotado).

---

## 🎯 Loro (módulo 02) — prendas escaneables antes del censo (2026-09-16)

Rama `claude/taxonomia-loro-tucan-15eaf3`. Verificado contra V2 y contra producción:
`docs/datos/modulos/02-catalogo-y-vocabulario.md` describe V1, y 3 de los 4 huecos que
Felipe priorizó ya los había cerrado el corte a V2 (disparador de códigos, color como FK,
pantalla de colores). Lo que quedaba se cerró aquí: regla de identidad con talla
normalizada (ADR-0069), red de códigos para variantes activas y `/buscar` leyendo
códigos de barras. Probado en local; tipos y 266 pruebas en verde.

- [x] **`SQL-PENDIENTE-PRODUCCION-2026-09-16-loro.sql`: pegado y confirmado en
      producción 2026-09-16 — cerrado.** Felipe lo corrió completo, bloque 0
      (pre-flight) dio 0 como se esperaba. Comprobación final (bloque 3), igual a lo
      previsto: `activas_sin_codigo=0`, `activas_sin_codigo_barras=0`,
      `productos_descontinuados=6`, `regla_nueva=1`, `regla_vieja=0`,
      `colores_sin_familia=0`, `arena_activa=ARN`. Verificado además por consulta
      directa (Supabase MCP, solo lectura): `retail.colores` tiene `ARE` inactivo
      ("Arena (retirado)") y `ARN` activo ("Arena"). Las 37 variantes de producción
      quedan escaneables (código + código de barras); los 6 productos de prueba
      (BLU-001/PAN-001/VES-001/POL-001/CHO-001/FAL-001) descontinuados, con su
      historial intacto.
- [x] **Stock fantasma de los productos de prueba — ya no existe, se arregló sin
      script ni registro (verificado 2026-09-17).** Archivarlos los sacaba de
      caja, catálogo y conteo, pero dejaba sus ~1.600 unidades vivas en
      `retail.stock` (900 en Taller) porque archivar nunca escribió movimientos
      que las llevaran a 0. Al ir a construir el script de limpieza idempotente
      (`registrar_movimiento` con `p_tipo='ajuste'`, motivo explícito) que este
      ítem pedía, la consulta directa a producción (Supabase MCP, solo lectura)
      mostró `retail.stock` en 0 filas para las 36 variantes de los 6 productos:
      alguien ya lo había corregido a mano — 108 movimientos `ajuste`/`otro` el
      2026-09-16 21:44 UTC por exactamente -1604 (cuadra con 1620 carga_inicial +
      1 devolución − 17 ventas), sin dejar script, sin motivo descriptivo y sin
      anotarlo acá ni en BITACORA. No se construyó el script de limpieza porque
      no había nada que limpiar. Local nunca tuvo este catálogo de prueba
      sembrado (`datos-prueba-catalogo-produccion.sql` excluido a propósito de
      `db reset`), así que tampoco había forma de probar el script ahí.
- [x] **Filtro defensivo en `getStockPorUbicacion` (2026-09-17).** Para que la
      próxima vez que se archive un producto con stock residual ningún reporte
      lo arrastre en silencio: `variante:variantes!inner` + `.eq("variante.activo",
      true)` en `apps/web/lib/inventario-v2.ts` — mismo flag que ya oculta de
      caja/catálogo/conteo. Typecheck, lint y 293 pruebas en verde; verificado en
      el navegador local (Tienda Lima con piso/almacén y Taller sin separación,
      ambas sin regresión). No se pudo ver el caso que sí oculta: hoy no existe
      ningún producto inactivo con stock real, ni en local ni en producción,
      contra el cual probarlo en vivo.
- [x] **Proponer y aprobar colores (decisión 2026-09-16) — construido, ver la sección
      propia "Colores: proponer/aprobar" más arriba (ADR-0070).** Felipe decidió que
      cualquiera de los 9 Líderes actuales aprueba, sin nivel "admin" nuevo. Falta
      pegar en producción y la verificación en navegador que quedó anotada ahí — no
      cerrado del todo todavía. Sigue pendiente el mismo mecanismo para Tucán
      (taxonomía), no construido en esta pasada.
- [x] **`/buscar` sin punto de entrada** (ver "Buscador global fuera de la
      cabecera", más abajo) — resuelto 2026-09-17: tarjeta "Buscar" en Acciones
      de Inicio + campo propio en la pantalla.
      cualquiera de los 9 Líderes actuales aprueba, sin nivel "admin" nuevo. La
      verificación en navegador y el pegado en producción quedaron cerrados el
      mismo 2026-09-17. Sigue pendiente el mismo mecanismo para Tucán (taxonomía),
      no construido en esta pasada.
- [ ] **`/buscar` sin punto de entrada** (ver "Buscador global fuera de la cabecera"):
      ya lee códigos de barras, pero solo se llega por URL.
- [ ] **Reescribir el documento del módulo 02 sobre V2.** Tiene aviso arriba; los huecos
      3, 5, 6, 7, 9-15 no están re-verificados y varios citan migraciones que ya no existen.

---

## 🎯 5 piezas inspiradas en NetSuite (2026-09-16)

Rama `traslados-costeo-reorden-conteo`, todo verificado solo en LOCAL — nada
tocado en producción. Las 5 piezas (costo promedio ponderado, punto de
reorden, conteo por alcance, indicador de rotación, traslados en dos fases)
quedaron cada una en su propio commit, con su propia migración. Detalle
completo en BITÁCORA de esta fecha.

- [ ] **Guía de Remisión Electrónica (SUNAT) para traslados entre
      ubicaciones.** Hueco legal real, encontrado al investigar el traslado
      en dos fases (no construido, a pedido explícito de Felipe — es una
      integración aparte con su propia autorización, como Nubefact). Desde
      2023, mover mercadería entre establecimientos la exige. Verificado por
      grep: cero implementación en el repo hoy. Retomar cuando Felipe lo
      decida, con su contador/asesor legal — no antes.
- [ ] **Recuperar "fecha de pedido" real para el punto de reorden**, si el
      proxy actual (factura→recepción) resulta muy impreciso en la práctica.
      El campo existía en V1 y se borró a propósito en el corte a V2; Felipe
      eligió el proxy por ahora, sabiendo que no es el dato real de tiempo de
      entrega (pedido→llegada).
- [ ] **Decidir si el diseño "censo" completo** (`supabase/unificacion/30_conteos.sql`
      — conteo por familia/contenedor, alta de prenda al vuelo, escaneo
      server-side) se recupera algún día, o se descarta a propósito. Hoy solo
      se reactivó el campo `alcance` (categoría); el resto sigue perdido
      desde el corte a V2, sin que nadie lo haya decidido con esos términos.

---

## 🎯 Cambio y devolución exigen caja si hay efectivo de por medio (2026-09-16)

Al escribir las pruebas de `registrar_cambio` (ítem siguiente) se encontró que ADR-0052
(devoluciones) y ADR-0053 (cambios) habían dejado, cada uno en su propia cabecera de
migración, el MISMO hueco sin resolver: sin caja abierta en la ubicación, la diferencia/
reembolso en efectivo queda con `caja_id = null` — invisible para siempre en cualquier
`cerrar_caja`. Felipe pidió armar el paso para cerrarlo. Detalle completo en ADR-0064.

- [x] **`20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql`** —
      `registrar_cambio`/`aprobar_devolucion` rechazan ahora (mismo mensaje que ya usa
      `registrar_venta`: "No hay una caja abierta…") cuando hay efectivo real moviéndose
      y no hay caja abierta; sin efectivo, siguen funcionando igual que antes. Mismas
      firmas, sin columnas nuevas. Probada en local
      (`pnpm pruebas:registrar-cambio` 13/13, `pnpm pruebas:aprobar-devolucion-caja` 2/2,
      `typecheck`/`lint` limpios).
- [x] **En producción desde 2026-09-16** — pegada por Felipe en el SQL Editor de
      `cayla-dynamic` (con `set search_path = retail, public, extensions;`, ya incluido
      en el archivo); verificada contra `pg_proc` que `registrar_cambio` y
      `aprobar_devolucion` quedaron con una sola sobrecarga cada una (conteo = 1, no el
      hueco de ADR-0009/0004).
- [ ] **Colisión de número de ADR (0063 y ahora también 0064) con la sesión concurrente
      `devoluciones-anular-ventas-e282dc`** (su propio `anular_venta`, migración
      `20260916172645_anular_venta.sql`, sin relación de código con este cambio — se
      verificó que no tocan las mismas funciones). Se resuelve al fusionar ramas, mismo
      patrón que ya pasó con ADR-0051.

---

## 🎯 Ventas: primeras pruebas automatizadas de `registrar_venta` (2026-09-17)

`registrar_venta` (0003_funciones.sql, hoy 11 parámetros tras 8 migraciones encima —
0008_caja_y_pagos, 0011_venta_con_comprobante, candado_precio_venta, codigos_descuento,
nota_en_ventas, inventario_piso_almacen y 20260915140000_descuento_motivo_y_escalonado)
es la función más tocada del repo — cada venta real de las 3 tiendas pasa por ahí — y
tenía cero pruebas automatizadas, mismo hueco que ya cerró `registrar_cambio` (sección de
abajo, ADR-0066). Firma y cuerpo leídos en vivo con `pg_get_functiondef` contra el
Postgres local, no desde `docs/datos/generado/RPCS.md` (describe la V1 de 4 parámetros —
desactualizado).

- [x] **`scripts/pruebas/registrar_venta.mjs`** — 22 escenarios contra el Postgres local
      real, mismo patrón que `registrar_cambio.mjs` (transacción con `ROLLBACK`,
      `set local request.jwt.claim.sub`, sin JWT/PostgREST). Cubre: venta simple (stock
      correcto en la sede correcta), el candado de sede (`fn_puede_operar_ubicacion`,
      Micaela no puede vender en Lima), caja/carrito/pagos/comprobante inválido, precio
      cambiado vs. catálogo (ADR-0048), variante inexistente, stock insuficiente (nunca
      negativo), idempotencia por `p_token`, y las 10 ramas de descuento de R-45
      (20260915140000): motivo obligatorio, "otro" sin detalle, nunca bajo costo, el
      escalonado 20 %/35 % del Líder con y sin argumento, y el tope por código de una
      Colaboradora (código ausente/inválido/insuficiente/dentro de tope). Corre con
      `pnpm pruebas:registrar-venta` — necesita el stack local, no corre desde
      `pnpm test`/CI (ADR-0066). Verificado: 22/22 en verde, dos corridas seguidas sin
      dejar rastro (conteo de `ventas`/`venta_items`/`movimientos`/stock de la variante
      de prueba idéntico antes/después), y el camino de falla probado a propósito (una
      aserción invertida a mano, confirmó ✗ + exit 1, revertida).
- [ ] **La consigna original pedía probar "una variante restringida a otra sede" — ese
      candado no existe en el código hoy** (verificado por grep en
      `supabase/migrations/*.sql`: cero columnas/tablas de restricción de variante por
      sede). El único candado de sede real es de PERSONA (`fn_puede_operar_ubicacion`,
      ya cubierto arriba). Si Felipe quiere restringir una variante puntual a una sede
      (ej. una prenda exclusiva de Lima), es modelo de datos nuevo — no construido, no
      pedido explícitamente todavía.

Igual que `registrar_cambio`: sigue sin engancharse a CI (no hay pipeline en este repo
todavía) y el mismo patrón sigue pendiente para `crear_devolucion`/`cerrar_caja`/
`iniciar_traslado`/`mover_interno`.

---

## 🎯 Cambios: primeras pruebas automatizadas de `registrar_cambio` (2026-09-16)

`registrar_cambio` (0007_cambios.sql + ADR-0053) tenía cero pruebas automatizadas — cada
verificación anterior fue manual ("verificado en psql"/"en el navegador"). Se revisó
`docs/BACKLOG.md` (sección POS V2 de abajo) antes de empezar: no hay ningún ítem grande
pendiente específico de Cambios — lo único de Cambios en esa sección ya está cerrado
(ComboBuscable, ADR-0053). Detalle completo de la decisión de CÓMO probar una RPC en
ADR-0066 (nuevo).

- [x] **`scripts/pruebas/registrar_cambio.mjs`** — 12 escenarios contra el Postgres local
      real (`docker exec ... psql`, `set local request.jwt.claim.sub`, siempre
      `ROLLBACK` — mismo patrón que ya documenta `supabase/seed.sql`, cero dependencias
      nuevas). Cubre: diferencia en los tres sentidos (cero/cobra/devuelve), los 6
      candados (`cantidad<=0`, diferencia sin método, excede lo comprado, venta/variante
      inexistente, sin stock de la variante nueva), idempotencia por `p_token`, el
      candado de sede (Micaela no puede cambiar en Lima — mismo candado que se pidió
      verificar para Vender, confirmado a nivel RPC) y que la diferencia en efectivo
      cuadra `cerrar_caja` (ADR-0053). Corre con `pnpm pruebas:registrar-cambio` — necesita
      el stack local levantado, **no** corre desde `pnpm test`/CI (ver ADR-0066, no toca
      base de datos). Verificado: 12/12 en verde, dos corridas seguidas, sin dejar rastro
      (`movimientos`/`cambios` de prueba en 0 después de cada corrida).
- [ ] **Tienda Lima y Tienda Trujillo no tienen sububicaciones de piso/almacén en el
      Postgres local compartido** (hallazgo de paso, no de este módulo — ver ADR-0066).
      `seed.sql` las crea pero solo corre en `db reset`; este Postgres se migró de más
      veces sin uno después de `20260914230000_inventario_piso_almacen.sql`. Hoy,
      cualquier venta/cambio real en el navegador contra este mismo Postgres compartido
      (no solo esta prueba) recibe `sububicacion_id = NULL` en vez de piso/almacén real.
      El `INSERT` aditivo para reponerlas (idéntico al de `seed.sql`) está en la cabecera
      de `scripts/pruebas/registrar_cambio.mjs` — bloqueado para este agente por el
      clasificador de auto mode ("Modify Shared Resources", correcto: es una escritura
      persistente sobre un recurso de ~27 worktrees). Felipe decide si lo corre.
- [ ] **El mismo patrón (ADR-0066) falta para el resto de RPC de escritura** —
      `crear_devolucion`, `cerrar_caja`, `iniciar_traslado`, `mover_interno`… ninguna
      tiene pruebas automatizadas todavía (`registrar_venta` ya se cerró, 2026-09-17 —
      ver sección "Ventas: primeras pruebas automatizadas de `registrar_venta`" más
      arriba). No es urgente, es el precedente a copiar cuando alguien las toque. (Nota
      al fusionar: `transferir` ya no existe — lo reemplazó
      `iniciar_traslado`/`confirmar_traslado`, ADR-0068.)

---

## 🎯 Caja: pruebas de abrir_caja/cerrar_caja contra Postgres real (2026-09-16)

`pnpm caja:verificar` (`scripts/caja/verificar.mjs` + `.sql`) — 15 escenarios en una sola
transacción con rollback (mismo patrón que cada sesión de Caja venía haciendo a mano y
perdiendo al cerrar): permisos de `abrir_caja` por ubicación (colaborador propia/ajena
sede, líder cualquiera), unicidad de caja abierta, monto de apertura negativo, aritmética
de `cerrar_caja` con depósito+ajuste, el candado de líder de ADR-0056 en ambas direcciones,
doble cierre, permiso de `cerrar_caja` por ubicación, monto contado negativo. Cero huella
verificada (conteo de `cajas` y `ubicacion_asignada_id` de Micaela iguales antes/después de
3 corridas seguidas); el camino de falla se probó a propósito (una aserción invertida a
mano, confirmó ✗ + exit 1, revertida).

**Pendiente, sin dueño:**

- [ ] **`cerrar_caja` también suma `ventas_efectivo` y reembolsos/diferencia de cambio
      (ADR-0052/0053) — esta prueba no los cubre.** Necesitan fixture de producto+variante+
      venta/devolución/cambio completo, fuera del alcance que pidió Felipe ("abrir_caja ni
      cerrar_caja"). Esos tres términos ya se verificaron a mano en sus propias sesiones;
      quien los quiera automatizados arranca de `scripts/caja/verificar.sql` (mismo patrón
      de identidades simuladas con `request.jwt.claim.sub`).
- [x] **Corrección (2026-09-17): la frase de abajo ("no existe pipeline de CI en este
      repo todavía") estaba mal — sí existe.** `.github/workflows/ci.yml` corre desde el
      2026-09-09 (typecheck/lint/`pnpm test` en cada push a `main` y cada PR — ver su
      propia cabecera y ADR-0026). Verificado contra el archivo real, no contra este
      documento.
- [x] **Revisitado con Felipe (2026-09-17): sí es momento — job piloto agregado a
      `ci.yml`.** `pruebas-postgres` levanta Postgres real (`npx supabase start`, con el
      stub de Dynamic copiado primero — CONTRIBUTING.md §1) y corre `caja:verificar` +
      `pruebas:registrar-cambio`/`aprobar-devolucion-caja`/`registrar-venta` contra él, en
      cada push a `main` y cada PR. Lleva `continue-on-error: true` a propósito: ninguna
      corrida real todavía lo vio funcionar en un runner de GitHub Actions (solo en el
      Postgres local de cada quien), así que no bloquea nada mientras se confirma —
      mismo criterio que ADR-0026 para lo incierto. `migraciones:verificar` se dejó
      afuera a propósito (informa, nunca falla — ADR-0026, mezclarlo es otra decisión).
- [ ] **Pendiente: verlo correr de verdad.** Esta sesión no pusheó — hace falta un push a
      esta rama (o el merge) para que GitHub Actions lo corra por primera vez. Con 2-3
      corridas verdes reales, sacar el `continue-on-error` de `.github/workflows/ci.yml`
      convierte el piloto en gate real.

---

## 🧹 Buscador global fuera de la cabecera (2026-09-16)

A pedido de Felipe: `BuscadorGlobal` (la caja "Buscar o escanear prenda…" que
vivía en la cabecera de TODAS las pantallas) se quitó de `AppShell.tsx` — no
por estar roto (se verificó en navegador que funciona de punta a punta: busca
por SKU/referencia/talla/color y muestra stock por ubicación), sino porque no
tiene sentido un buscador de catálogo idéntico en pantallas como
`/colaboradores` o `/producción` igual que en `/vender` o `/inicio`. De paso
se borró `BuscadorHero.tsx`, un segundo componente de búsqueda que ya estaba
muerto de verdad (cero imports en todo el repo — probablemente un diseño
anterior del Inicio que quedó huérfano).

- [x] **`/buscar/page.tsx` quedaba sin ningún punto de entrada en la UI —
      resuelto 2026-09-17.** Se tomó la opción ya sugerida acá: tarjeta
      "Buscar" en "Acciones" de Inicio (`app/(app)/page.tsx`), sin tocar
      `AppShell.tsx` (evita reabrir un buscador global en pantallas donde no
      aplica, que es justo lo que esta sección existe para prevenir).
      De paso apareció un bug más profundo: la pantalla dependía enteramente
      del `BuscadorGlobal` ya eliminado para escribir `?q=` en la URL — sin
      caja propia mostraba "escribe algo en el buscador de arriba", apuntando
      a un "arriba" que ya no existe. Se agregó un `<form method="get">`
      nativo (`CampoTexto`/`Boton`, sin "use client") en `buscar/page.tsx`: el
      navegador arma `?q=...` solo, sin depender de JS.
      Verificado: `pnpm --filter web typecheck`/`lint` en verde; navegador
      real (escritorio y celular) — Inicio → tarjeta "Buscar" → `/buscar` con
      el campo propio enfocado → "casaca" → 8 resultados con stock por
      ubicación real; cabecera sigue solo con el selector de ubicación.

Verificado: `pnpm --filter web typecheck`/`lint` en verde; probado en
navegador real (escritorio y celular) en `/` y `/productos` — la cabecera
queda solo con el selector de ubicación, sin salto de layout.

---

## 🔀 Verificación en navegador de F1-F4 + ajuste de layout (2026-09-15, noche — Claude Code Desktop)

**El checkout de `diegoN` en el Mac estaba a un pull de distancia de lo real.**
Esta sesión abrió sobre un fetch cacheado: `git log origin/DiegoN` mostraba
`8d8e0ee` (la integración A1/A2+A3+B1+B2/C1/C2) como si fuera la punta, y con
eso F1-F4 (fotos/temporada, colores tipo+muestra, subcategoría, densidad
visual) parecían haberse perdido — archivos y migraciones enteras ausentes
del árbol. Un `git fetch` explícito mostró la punta real: `7fed0c8`
("resuelve colisiones de ADR y migración entre F1/F2/F3"), que sí trae las
cuatro sesiones completas, ya fusionadas sobre A/B/C. `git merge --ff-only
origin/DiegoN` en el checkout principal + `npx supabase migration up`
(las 3 migraciones de F1/F2/F3) resolvió todo — no hubo ninguna regresión
real, solo una caché local vieja. **Antes de asumir que "DiegoN perdió
trabajo", siempre `git fetch` explícito primero.**

Con eso resuelto, se verificaron en navegador real (Docker sí funciona en
este Mac) los 5 puntos pendientes de la sesión remota anterior — detalle de
cada uno en la sección de su propia sesión (F1/F2/F3) más abajo y en
BITÁCORA de hoy. Cierre general: `tsc`/`eslint`/`vitest` (215/215) en verde
sobre `7fed0c8`.

**Hallazgo de infraestructura, no de código:** el stack local de
`cayla-retail` (`supabase start` de este proyecto) no levanta el contenedor
de Storage (`docker ps` no lo lista, a diferencia del stack de
`cayla-dynamic`, que sí lo tiene). Cualquier subida real de archivo — foto
de producto, muestra de color — no se puede probar de punta a punta en local
hasta que eso se resuelva. Se verificó la lógica de cada pantalla igual,
sembrando datos directo en Postgres en vez de subir por Storage; ver el
detalle en cada ítem.

**Ajuste de layout, pedido aparte por Felipe en la misma sesión:** contra
capturas de referencia (`~/Downloads/Pantallas producto/`, un mockup de ERP
genérico usado solo como referencia de densidad/ancho, no como spec literal
— trae conceptos que no existen acá, como "Departamentos" o "Colección
SS24"), dos quejas concretas:

- [x] **Productos/Categorías/Colores no usaban el ancho completo del
      `<main>`.** `AppShell.tsx` topa todo lo que no esté en
      `SIN_TOPE_DE_ANCHO` a `max-w-5xl` — Vender y Compras ya estaban
      exceptuados por necesitar el espacio; `/productos` no lo estaba.
      Agregado a la lista (una línea, cubre `/productos` y todo lo que
      cuelga: categorías, colores, ficha, historial).
- [x] **"Agregar color"/"Agregar categoría" aparecían al final de una lista
      larga**, no arriba como en la referencia. En `ColoresLista.tsx` y
      `CategoriasLista.tsx`: el disparador pasó a un botón fijo arriba de la
      grilla/lista (mismo estilo que "+ Nuevo producto" de `/productos`), y
      el formulario de alta/edición —que vivía como una `<section>` empotrada
      al fondo de la página— pasó a `<Modal>` (el mismo componente que ya
      usa `ColorEditarModal`), así que aparece centrado sobre lo que se
      esté mirando, no al fondo de un scroll largo. Sin cambios de datos ni
      de RPC — puro reacomodo de layout.

**Verificado:** `pnpm --filter web typecheck`/`lint` en verde; los tres
archivos tocados (`AppShell.tsx`, `ColoresLista.tsx`, `CategoriasLista.tsx`)
probados en navegador real contra un `pnpm dev` propio de este worktree
(puerto aparte, mismo Postgres local compartido) — ancho completo y los 4
modales (nuevo color, editar color, nueva categoría, editar categoría)
abriendo arriba, no al fondo.

**No se tocó el checkout principal ni se hizo commit.** El editor de este
agente tiene bloqueado escribir fuera de su propio worktree (para no
corromper el checkout principal desde una sesión aislada) — el fix vive sin
commitear en la rama `claude/cayla-productos-integration-verify-59676d` de
este worktree, ya con `origin/DiegoN` fusionado adentro. Pendiente de que
Felipe lo traiga (merge/cherry-pick del worktree, o pedirle a este agente
que commitee) antes de que se pierda.

**Pendiente, sin tocar — decisión de Felipe:**

- [x] **PR #47 (`DiegoN` → `main`) ya mergeó** (`4d9da93`, 2026-09-16) — la
      reconciliación de más de un módulo que este ítem pedía ya se resolvió
      (ver BITÁCORA "Tercera nota" del 2026-09-15/16: ganó la numeración de
      ADR de `main`, `diegoN` corrió 0051-0056→0058-0062). Verificado el
      2026-09-16 (sesión de cierre de deuda de Caja) que el módulo Caja
      sobrevivió limpio: `lib/caja.ts` y `MovimientoCajaModal.tsx` sin ningún
      byte de diferencia entre el punto en que ADR-0056 llegó a `main` y el
      HEAD post-PR#47/#50; `types.ts` (el único de los tres que sí cambió en
      el merge) sigue reflejando la firma real de las 3 RPC de caja. Ver
      BITÁCORA de hoy para el detalle completo.
- [ ] **Los cabos sueltos que el resumen anterior daba por abiertos ya no lo
      están** — verificado contra GitHub, no contra lo que decía el resumen:
      PRs #44/#45/#46/#48 (las 4 ramas F1-F4 → DiegoN) ya están MERGED, no
      quedó ninguno redundante por cerrar a mano. El hilo de F3 sobre
      mergear su propio PR #46 también quedó resuelto solo (ya está
      mergeado). Sin acción pendiente en ninguno de los dos.

---

## 🎯 Productos: fotos, temporada y venta sin stock (2026-09-15, Sesión F1)

`/productos/nuevo` y `/productos/[id]/editar` ganan galería de fotos (varias,
reordenables con flechas, una principal), `temporada` (texto libre) y
`permitir_venta_sin_stock` (checkbox), más margen % de solo lectura junto a
precio/costo de cada variante (`20260915224500_producto_fotos_temporada_venta_sin_stock.sql`,
ADR-0060). Tabla nueva `retail.producto_fotos` + bucket público
`retail-productos-fotos`; `catalogo_crear_producto`/`catalogo_actualizar_producto`
ganan `p_temporada`/`p_permitir_venta_sin_stock`/`p_fotos` (reemplazo completo de la
galería en el orden del array). La consigna asumía que `foto_url`/`temporada`
seguían vivas (muertas) en `productos` de producción — verificado contra
`docs/datos/generado/DICCIONARIO-RETAIL.md`: **no existen**, se agregan de cero
(ver ADR-0060 para el porqué). Verificado con RPC reales contra un schema aislado
(`f1_dryrun`) en el proyecto de producción, nunca contra `retail.*`: alta con 3
fotos, reorden + recambio de principal + foto nueva en edición, borrado con
reasignación de principal, `p_fotos = null` sin tocar la galería. `typecheck`/
`lint`/215 tests en verde.

**Pendiente:**

- [x] **`20260915224500_producto_fotos_temporada_venta_sin_stock.sql` sí está en
      producción** (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`, no contra
      docs: existe `retail.producto_fotos` y `catalogo_crear_producto`/
      `catalogo_actualizar_producto` ya aceptan `p_temporada`/
      `p_permitir_venta_sin_stock`/`p_fotos`).
- [x] **Verificado en navegador real (2026-09-15, noche, Claude Code Desktop —
      Docker sí funciona en este Mac).** `FotosProducto.tsx` carga, reordena
      ("Mover a la izquierda/derecha"), cambia de principal ("Marcar
      principal") y persiste tras guardar+recargar — probado sobre "Blusa
      Emma" con 3 fotos sembradas directo en `retail.producto_fotos` (no vía
      la UI: el botón "Agregar foto" dispara un `<input type=file>` oculto, y
      la herramienta de navegador de esta sesión no puede setear archivos en
      un input de ese tipo — limitación de la herramienta, no del código).
      `Temporada` se guarda y sigue ahí tras recargar. Fotos y temporada de
      prueba se revirtieron al terminar (no quedan en la base).
- [ ] **`permitir_venta_sin_stock` no tiene candado real en Vender/`registrar_venta`
      todavía.** Esta sesión solo escribe y muestra el dato en la ficha
      (fuera de alcance: F1 es dueña de la ficha de producto, no de Vender/POS,
      que otras sesiones tocan en paralelo). Sin esto, el checkbox no cambia
      todavía el comportamiento real de una venta con stock 0.
- [ ] **La UI de arriba (integradora F5) debería revisar si `editar/page.tsx`
      sigue con los `TODO(Sesión A2)`/`TODO(Sesión A3)` de "Ajustar inventario"/
      "Ver historial" como tarjetas placeholder** — esas dos funciones ya existen
      como modales desde el menú "..." de `/productos` (Sesión B2, 2026-09-15),
      así que esas dos tarjetas en la ficha de edición están duplicadas/obsoletas.
      No se tocó en esta sesión (fuera del alcance de F1: fotos/temporada/venta
      sin stock), pero queda anotado para quien limpie al integrar.

---

## 🎯 Categorías: subcategoría opcional de un solo nivel (2026-09-15, Sesión F3)

`categorias.categoria_padre_id` (self-FK, nullable) + `categorias.notas`
(`20260915224501_categorias_subcategoria.sql`, ADR-0062). Candado real en un
trigger (`retail.fn_valida_categoria_subcategoria`): un solo nivel (el padre
no puede a su vez tener padre; quien ya tiene hijas no puede convertirse en
hija) y familia siempre heredada del padre. `CategoriasLista.tsx`: "Nueva
categoría" suma selector opcional de padre; "Editar categoría" de una raíz
suma alta/lista de hijas; una categoría sin hijas se ve pixel-idéntica a
antes. `retail.actualizar_categoria` pasó de 4 a 5 argumentos (se agregó
`p_notas`, firma vieja dropeada en la misma migración).

**Pendiente:**

- [x] **Verificado en navegador real (2026-09-15, noche).** Se creó
      "Vestidos largos" (VLA) con padre "Vestidos" desde la propia pantalla —
      aparece en un clúster junto a "Vestidos", el resto de categorías sin
      hijas (ej. "Pantalones") se sigue viendo igual. Se dejó tal cual (es
      dato real, no de prueba) — Felipe decide si la renombra/borra.
- [x] **`20260915224501_categorias_subcategoria.sql` sí está en producción**
      (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`: `actualizar_categoria`
      ya tiene el 5º argumento `p_notas` y `retail.fn_valida_categoria_subcategoria`
      existe).
- [ ] **`packages/database/src/types.ts` se editó a mano**, no con
      `supabase gen types` (no hay base viva en este entorno). Cuando la
      migración se aplique a un Postgres real, regenerar los tipos desde ahí
      y confirmar que calzan con lo que se escribió a mano acá.
- [ ] **Reasignar el padre de una categoría ya existente no tiene UI.** Se
      puede elegir padre solo al crear; una categoría ya creada no se puede
      mover de familia de primer nivel a subcategoría (o viceversa) desde la
      pantalla — decisión de alcance de esta sesión, no una limitación de la
      base (el trigger lo soportaría).

---

## 🎯 Productos: listado y filtros server-side (2026-09-15, Sesión B1)

`/productos` pasó de filtrar/agrupar TODO el catálogo en memoria del cliente a
filtros en la URL + Postgres (`fn_productos`/`fn_productos_resumen`,
`20260915160000_productos_listado_filtros.sql`), mismo patrón que Movimientos.
Paginado por NÚMERO DE PÁGINA (no cursor, decisión de Felipe — el catálogo no
crece como un ledger) y por PRODUCTO (no por fila de variante). Filtros reales:
categoría, color, estado, rango de precio, sin stock/stock bajo. Tarjetas de
resumen (productos, variantes, stock bajo, sin stock) de una sola consulta
agregada. Tabla con checkboxes de selección y menú "..." por fila (Editar
enlaza a `/productos/[id]/editar` de la sesión A1, ruta todavía sin
construir; Ajustar inventario/Ver historial cableados por la Sesión B2 el
mismo día — ver el ítem de integración final más abajo; Duplicar/Archivar
siguen como placeholder). Verificado con psql contra datos reales y con
HTTP real (sesión autenticada reconstruida a mano) — ver BITÁCORA de hoy.

**Pendiente:**

- [x] **`20260915160000_productos_listado_filtros.sql` sí está en producción**
      (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`: `retail.fn_productos`/
      `fn_productos_resumen` existen con los filtros — confirmado también en
      navegador, `/productos` ya filtra server-side).
- [ ] **El campo `stock_minimo` no tiene UI todavía.** La columna existe
      (`retail.productos.stock_minimo`, nullable — sin valor, ese producto
      nunca entra en "stock bajo") pero el mantenedor de ficha
      (`ProductoForm.tsx`, sesión A1) no tiene el campo para escribirla. Sin
      eso, "stock bajo" en /productos queda siempre en 0 salvo que alguien
      lo cargue por Studio/SQL.
- [ ] **"Duplicar" y "Archivar" del menú "..." siguen sin RPC ni diseño**
      (Archivar probablemente sea `productos.estado = 'descontinuado'` —
      igual que ya hace la acción masiva "Desactivar" de la Sesión B2, pero
      por fila; Duplicar no tiene diseño — decisión de Felipe antes de
      construirla).
- [ ] **Columna "Última actualización" en la tabla de /productos — no hay
      dato que mostrar sin tocar esquema.** `productos`/`variantes` solo
      tienen `created_at` (0002_esquema.sql), no `updated_at` — a diferencia
      de `stock.updated_at`, que sí existe. `historial_producto_cambios`
      (20260915204541) sí registra cuándo cambió precio/categoría/estado,
      pero es un ledger append-only pensado para el panel de Historial, no
      para un `JOIN` por fila en el listado sin agregar una columna a
      `fn_productos`. Decidir "cuál timestamp cuenta como última
      actualización" (¿solo precio/categoría/estado? ¿también alta de
      variante?) es una decisión de esquema/negocio, no de polish de UI —
      queda pendiente de que Felipe la resuelva. Sesión F4 (2026-09-15) no
      la construyó a propósito.
- [ ] **El menú de acciones masivas hoy solo tiene Activar/Desactivar** —
      "cambiar categoría" y "exportar" en bloque, mencionados como parte del
      menú de acciones masivas, no existen todavía en `ProductosAgrupados.tsx`.
      No se construyeron en la sesión F4 (2026-09-15, polish de listado): la
      primera toca `categoria_id` de varios productos a la vez, dominio de la
      sesión que edita categorías en paralelo; la segunda es un export de
      catálogo completo, distinto en alcance al reporte puntual que si se
      agregó en Ajustar Inventario (ver abajo). Quedan para quien tome
      acciones masivas end-to-end.

**Hallazgo de coordinación, no de este módulo:** el Postgres local
(`supabase_db_cayla-retail`, puerto 54422) lo comparte el checkout principal
y las 7 sesiones en paralelo de Productos — no hay worktree con su propia
base. Durante esta sesión el contenedor se reinició al menos dos veces en
minutos (otra sesión corriendo `supabase db reset`/`stop`/`start`), borrando
migraciones recién probadas y datos de prueba de otras sesiones sin aviso.
No es un problema de esta migración — es un riesgo del momento (7 sesiones
tocando `/productos` a la vez): vale la pena que Felipe decida si conviene
un Postgres local por sesión mientras dure este tipo de paralelismo.
## 🩹 Inventario, Colaboradores, Movimientos — 2026-09-15 (noche)

Batch de mejoras sobre los tres módulos, del reconocimiento hecho antes con 3 agentes
en paralelo + verificación en código/base propia (no desde `.md`). Aplicado y probado
**solo en local** (typecheck, `vitest`, lint verdes; probado a mano en el navegador
local logueado como Felipe) — nada tocó `main` ni la Supabase de producción, a pedido
explícito de Felipe. Rama local: `fix/inventario-colaboradores-movimientos`.

**Inventario:**
- [x] **`getCatalogo()` dejaba pasar la variante centinela "Cargo especial" y
      productos inactivos** en los selectores de `/inventario/recibir`,
      `/inventario/conteo` y `/buscar` — la propia migración de la centinela
      (`20260912234726_cargo_especial_pos.sql:18-22`) ya avisaba del hueco por
      escrito. Se agregó `.filter(v => v.activo)` en los 3 call sites (no dentro de
      `getCatalogo()`: `ProductosAgrupados.tsx:145` SÍ necesita ver las inactivas,
      atenuadas, para poder gestionarlas). Verificado en el navegador: Cargo especial
      ya no aparece en el selector de Recibir (48 opciones, ninguna es la centinela).
- [x] **`InventarioNav` nunca se montaba en ningún lado** — y además apuntaba a 4
      rutas que ya no existen (`/inventario/proveedores`, `/compras`, `/almacen`,
      `/etiquetas`, movidas a Compras hace tiempo) y no mencionaba `/inventario/mover`,
      que sí es real. Se reescribió la lista de secciones contra las 4 rutas reales y
      se montó desde un `layout.tsx` nuevo (mismo patrón que `compras/layout.tsx`).
      Verificado: la pestaña Stock/Recibir/Mover/Conteo aparece y navega bien.
- [x] **Piso/Almacén/Total sin etiqueta en la vista móvil** de `/inventario`
      (`InventarioPanel.tsx`) — en celular la tabla se apila en tarjeta y esos tres
      números quedaban sin decir cuál era cuál. Etiqueta `sm:hidden` agregada antes
      de cada uno. Verificado en viewport 375px.

**Colaboradores:**
- [x] **`fn_mi_perfil()` resolvía la ubicación de cualquiera con la fórmula de
      Líder** (`sede_dynamic_id`), nunca con `ubicacion_asignada_id` real de un
      Colaborador — podía mostrar la sede equivocada. **`fn_colaboradores()` no
      filtraba `estado='activo'`** — alguien desactivado en Dynamic seguía
      apareciendo como vigente. Migración
      `20260915230001_colaboradores_perfil_y_lista_correctos.sql`, misma firma en
      las dos funciones. Aplicada y verificada en local (una sola firma cada una).
- [x] **"Quitar acceso" sin confirmación** — un clic y ya, sin paso de revisión.
      Se agregó un modal de confirmación (mismo patrón que "Agregar colaborador").
      Verificado en el navegador.
- [x] **Reabrir "Agregar colaborador" tras un alta podía disparar un intento
      fantasma** — el `useState` de la persona elegida no se resincronizaba con
      `disponibles`. Se resetea al abrir el modal, no una sola vez.
- [x] **El picker de "Persona" era un `<select>` con toda la lista de Dynamic**, sin
      buscador — se reemplazó por `ComboBuscable` (mismo componente que ya usan
      Cambios y Compras). De paso, el botón "Agregar colaborador" deshabilitado ahora
      explica por qué ("Todas las cuentas activas de Dynamic ya tienen acceso"),
      verificado en el navegador.

**Movimientos:**
- [x] **Ningún cambio "sin diferencia de precio" se detectaba como tal** —
      `cambio_diferencia` es `numeric` en Postgres, PostgREST la manda como string, y
      `!== 0` nunca compara igual un string contra un number. Se corrige en el origen
      (`movimientos-v2.ts`, `Number(...)` al armar el objeto `cambio`), no solo en el
      sitio de uso.
- [x] **La diferencia de un ajuste por conteo se volvía a calcular en el cliente**
      (`MovimientoDetalle.tsx`) en vez de usar `m.delta`, que `fn_movimientos` ya
      resuelve en SQL — misma regla en dos lugares. Ahora usa `m.delta` directo.
- [x] **Búsqueda de Movimientos sin escapar `%`/`_`** en
      `fn_movimientos_variantes` — un guion bajo literal en un SKU actuaba como
      comodín. Migración `20260915231500_movimientos_busqueda_escapa_comodines.sql`,
      misma firma, con `escape '\'`. Verificado: buscar "_" ya no trae las 49
      variantes; buscar "blusa" sigue filtrando normal.
- [x] **Un link `?mov=<id>` compartido (WhatsApp) fallaba en silencio** si el
      movimiento caía fuera del rango de 30 días por defecto — sin tocar la premisa
      de "nunca una consulta extra" (`MovimientosLista.tsx` ya lo documentaba así),
      se agregó un aviso visible en vez de nada.

**Sueltos, bajo riesgo:**
- [x] `RecepcionFormV2.tsx`: `costoUnitario` ya no deja escribir un negativo (antes
      solo `cantidad` se clampaba); se agregó la huella `variantes_costo_check` a
      `error-escritura.ts` como red de seguridad.
- [x] `ConteoPanel.tsx`: el escaneo de código de barras reimplementaba el matching a
      mano, sensible a mayúsculas — ahora usa `resolverCodigoV2` de
      `buscar-prenda-v2.ts`, igual que Vender. Se agregó `avisar.exito(...)` en
      abrir/contar/cerrar conteo (antes ninguna acción confirmaba éxito).
- [x] `MoverMercaderiaFormV2.tsx`: el tope de cada línea era el stock total de la
      variante, sin restar lo que otras líneas del mismo formulario ya le pedían —
      dos líneas de 10 sobre una prenda con 10 unidades no avisaban nada hasta que
      la RPC rechazaba la segunda.

**Fuera de este batch, a propósito** (necesitan una decisión de Felipe, no un fix
mío): la condición de carrera de "contar mientras se vende" en Conteo, que
`quitar_colaborador` borre en vez de archivar, y el selector de ubicación duplicado
(header vs. `/inventario` local) — este último ya es una decisión consciente
documentada en `AppShell.tsx:516-519`.

## 🎯 Productos — alta con matriz talla×color — 2026-09-15 (noche)

A pedido de Felipe, tras comparar el modelo de variantes contra Lightspeed Retail: la pieza
que faltaba (`/productos` era solo lectura) para dar de alta un producto con su matriz
talla×color, en una transacción atómica. **Aplicado y probado solo en local** (SQL directo +
navegador logueado como Felipe; typecheck/lint/239 tests verdes) — **no aplicado en
producción**, sin ok de Felipe todavía. Detalle completo: ADR-0058.

- [x] **`retail.crear_producto_con_variantes`** — nueva, mismo patrón que
      `abrir_produccion`: candado `fn_es_lider()`, idempotencia por `p_token`, valida toda
      la matriz antes de insertar una fila. Inmune por diseño al bug de `AltaEnConteo`
      (BITÁCORA 2026-09-10): no acepta `producto_id`, siempre crea uno nuevo.
- [x] **`categorias.tallas_sugeridas` repuesta** (existía en V1, se perdió en el corte a V2)
      — sugiere, no restringe; `variantes.talla` sigue siendo texto libre a propósito.
- [x] **`variantes.sku` deja de ser `NOT NULL`** — y de paso, un `grep` propio encontró
      (antes de aplicar el cambio, no después) que el buscador/escáner de Vender
      (`lib/buscar-prenda-v2.ts`) y otros 4 sitios asumían `sku` siempre con valor;
      corregidos en su propio commit antes de tocar el esquema.
- [ ] **`productos.referencia` sigue sin constraint de unicidad** — detectado durante el
      diseño, no resuelto a propósito (es decisión de negocio: ¿puede haber una reedición
      con el mismo nombre?). Sugerencia si Felipe la quiere: aviso suave en la UI, sin
      candado nuevo en el núcleo.
- [ ] **Override de costo por celda** en la matriz — hoy solo el precio se puede
      sobreescribir por celda; costo es un valor base único. Recorte deliberado, cambio de
      UI nada más si hace falta después.
- [ ] **Aplicar a producción** — pendiente el ok puntual de Felipe.

---

## 🔀 Consolidación Vender + Caja — 2026-09-15 (tarde)

Dos ramas cerradas y verificadas por separado que nunca habían llegado a `main` se
unieron en un solo PR (`claude/caja-punto-venta-cambios-f4edbd`): **A**
`claude/venta-caja-screens-animations-7923b9` (Tandas 1-3 del diagnóstico: arreglos,
animaciones, `/caja/historial`, `/vender/descuentos`) y **B**
`claude/sales-implementation-analysis-676b89` (ADR-0052/0053/0054: reembolso y
diferencia de cambio en el arqueo, descuento con motivo y escalonado). 7 bloques de
conflicto, todos mecánicos (`AppShell`, `cambios/page`, `CambiosLista`,
`PuntoDeVentaTicket`, BITÁCORA ×2); `tsc`/`eslint`/`vitest` 239/239 sobre el resultado
y las 3 pantallas con conflicto probadas en navegador. **Las 3 migraciones de B se
aplicaron a producción ANTES del push** (ver cada ítem abajo) — sin eso, Vercel habría
desplegado un front que lee `venta_items.motivo_descuento` y `*.caja_id` contra una base
que no las tenía (42703).

- [ ] **Cuatro sesiones eligieron ADR-0051 el mismo día.** Quedó: 0051 producción del
      Taller (main), 0054 descuento con motivo (B, renumerado), 0055 insert directo a
      `movimientos` (PR #37, renumerado). **`cuervo-colibri` (depósito bancario y ajuste
      de efectivo, sin commitear al cierre de esta sesión) tiene que entrar como 0056**
      y descartar su rename `20260915120000_reparar_fk…` → `120001`: la colisión de
      timestamp ya la resolvió `origin/benja-ramanexo` moviendo producción del Taller a
      `20260915130000`. Al mergear sobre `main` va a chocar en `MovimientoCajaModal.tsx`,
      `lib/caja.ts` y `types.ts` con lo de A — conflictos chicos, mismo patrón que acá.
- [ ] **Dos worktrees con trabajo V1 sin commitear que ya no aplica** — no se tocaron,
      solo se anotan para que nadie los rescate por error: `pos-systems-comparison-c2472c`
      (`CajaPanel`, `CerrarCajaModal`, `RegistrarVentaModal`, `ventas-offline`,
      `0060_cerrar_caja_desglose_metodos.sql`; 180 commits atrás, ninguno de esos archivos
      existe en `main`) y `motion-dev-analysis-3adc35` (`VenderFormV2.tsx`, que B borra).
      Si Felipe confirma, se limpian con `git worktree remove --force`.
- [ ] **`packages/database/src/types.ts` se regeneró en 3 sesiones desde 3 Postgres
      locales distintos** y se auto-mergeó sin conflicto (tsc en verde). No se volvió a
      regenerar en la consolidación — la próxima vez que se toque, regenerar UNA vez con
      `--local` sobre una base con todas las migraciones de `main` aplicadas.
- [ ] **El historial de producción registra las migraciones con timestamp UTC del momento
      de aplicarlas, no con el del archivo** (`20260915211024` ≠ `20260915140000`, igual
      que `movimientos_insert_solo_rpc` → `20260915205618`). `supabase migration list`
      contra producción va a marcar estas como "remotas sin archivo" — es cosmético, el
      nombre coincide; se anota para que nadie las vuelva a aplicar.

---
## 🎯 POS (Vender + Caja) en V2 — diagnóstico del 2026-09-14

> Sale de reconciliar `docs/datos/modulos/07-ventas-y-caja.md` y `01-INVARIANTES.md`
> —que auditaron **producción** con código V1— contra el código y la base **V2**
> reales. Lo que V2 ya arregló solo (venta↔comprobante en la misma transacción,
> candados por línea en `venta_items`/`venta_pagos`, el bug del `NULL` en el candado
> de sede, la caja sin policy de UPDATE) NO se repite acá: esto es lo que queda.

**Cerrado el 2026-09-15 — Tanda 3 del diagnóstico, las dos pantallas nuevas
"bounded" (sin cambio de esquema; ver BITÁCORA de esa fecha):**

- [x] **Historial de cierres de caja** (`/caja/historial`, link desde `/caja`).
      `cajas` ya tenía todo (`estado`, `monto_cierre_sistema/real`, `diferencia`,
      `cerrada_por`, `nota`) — sin RPC, sin filtro de ubicación (mismo criterio que
      Facturación: mientras "control total temporal" siga vigente, se ve todo, con
      la sede en cada fila). `lib/caja.ts` gana `getHistorialCierres()`. Etiquetas
      de celular agregadas a mano (Tabla.tsx apila sin encabezado bajo `sm`, y
      cuatro cifras seguidas sin etiqueta no se leen en una pantalla de cuadre).
- [x] **Códigos de descuento administrables** (`/vender/descuentos`, Líder-only,
      link desde Facturación). `codigos_descuento_insert`/`_update`
      (20260914215103) ya dejaban la RLS lista para que un Líder escriba directo
      — es la única tabla del sistema sin RPC de por medio: sus reglas de negocio
      (código 3-20 mayúsculas, 0<%≤100, vigencia coherente) ya son `check` de la
      tabla, no queda nada que una RPC tuviera que validar encima. Crear, apagar/
      prender (nunca `DELETE`, la tabla no tiene esa policy).
      **De paso:** `packages/database/src/types.ts` no conocía `codigos_descuento`
      (el archivo llevaba desde antes del 12-sep sin regenerar) — regenerado con
      `pnpm --filter @cayla-retail/database gen-types` (ya apunta a `--local`, sin
      el riesgo de drift de producción que describe la regla de oro de `datos:generar`).
      355 líneas nuevas, 0 tablas perdidas (verificado contando `ventas`/`cajas`/
      `clientes`/etc. antes y después).

Verificado: `tsc`, `eslint`, `vitest` (184/184); ambas pantallas probadas en
navegador con escritura real (un código creado y apagado/prendido, el historial
mostrando las 4 cajas cerradas reales de esta sesión con la sede correcta cada
una). **Subido el 2026-09-15 en el PR de consolidación Vender+Caja.**

**Pendiente de decisión de Felipe — las 2 pantallas grandes del mismo
diagnóstico (2026-09-15).** Clasificadas con `superpowers:brainstorming`, no
construidas: cada una necesita una respuesta suya antes de que una sesión
futura pueda diseñarlas. Explorado (no supuesto) contra el esquema real el
2026-09-15 — sigue valiendo mientras nadie migre `ventas` o `clientes`.

- [ ] **Ficha de clienta.** La tabla `clientes` existe completa (nombre, doc,
      teléfono, email — `0002_esquema.sql`) y `registrar_venta` **ya acepta
      `p_cliente_id`** desde que existe (`0011_venta_con_comprobante.sql:98`) —
      pero Vender nunca lo manda: el DNI/nombre que se tipean en el cobro solo
      llegan al comprobante, ninguna venta queda enlazada a una fila real de
      `clientes`. La pregunta que decide todo el diseño: **¿Vender debe empezar
      a buscar/crear la clienta en `clientes` durante el cobro** (cambia el
      flujo de venta — nueva búsqueda, decidir qué pasa si no se encuentra) **o
      la ficha es, para empezar, una pantalla de consulta aparte que no toca
      Vender todavía** (lee `clientes` + su historial de compras vía
      `ventas.cliente_id`, sin cambiar cómo se cobra hoy)? La segunda opción es
      bounded (sin tocar Vender); la primera es arquitectónica (cambia un flujo
      que ya está muy afinado — ADR-0043/0044). Sin RPC nueva en cualquier caso:
      `registrar_venta` ya sabe qué hacer con `p_cliente_id`.
- [x] **Anular una venta — esquema y RPC (2026-09-16, sesión Devoluciones).**
      Felipe respondió las 4 preguntas que este mismo ítem dejaba pendientes:
      (1) el stock depende de la condición de la prenda, mismo selector que
      Devoluciones; (2) si el comprobante ya fue aceptado por SUNAT, **no se
      puede anular** — usar Cambio o Devolución; (3) el plazo es mientras la
      caja de esa venta siga abierta (no el día calendario); (4) solo un
      Líder. `20260916172645_anular_venta.sql` (ADR-0065): `ventas.estado`
      + tabla `venta_anulacion_items` + RPC `anular_venta`. Aplicada al
      Postgres local y verificada con 8 escenarios en una transacción
      revertida (detalle en el ADR). **Sin aplicar en producción todavía.**
- [x] **Anular una venta — pantalla (2026-09-16).** Felipe confirmó: junto a
      Cambio/Devolución. `AnularVentaForm.tsx` (nuevo) + botón "Anular" en
      `DevolucionesLista.tsx`, una sola vez por venta (no por línea), visible
      solo para Líder. No se tocó `BuscarPorComprobante.tsx` — resultó ser
      solo la caja de búsqueda, sin lógica de acciones que compartir.
      Verificado en navegador real (login `felipe@cayla.local`): el botón
      aparece una vez por venta, el modal carga las líneas reales de la
      venta, y un caso real (caja de una venta del 14-sep, ya cerrada) mostró
      el mensaje de error correcto de punta a punta (RPC → `traducirError` →
      pantalla) — prueba end-to-end del camino de rechazo con datos reales,
      no sintéticos. El camino feliz (clic hasta "Venta anulada") no se pudo
      cerrar por clic dentro de la sesión de Claude — el stock de Tienda Lima
      vivía todo en `sububicacion_id = null`, ninguna unidad asignada a "Piso
      de venta" (probablemente sin backfill desde
      `20260914230000_inventario_piso_almacen.sql`), y `registrar_venta`
      rechaza cualquier venta nueva con "hay 0" sin importar cuánto diga
      `stock.cantidad`. **Felipe probó el camino completo en su propia sesión
      local (2026-09-16) y confirmó que todo funciona, camino feliz
      incluido** — sin precisar en el chat si lo desbloqueó con el backfill
      que se le ofreció o con otro ítem que ya tenía piso asignado. El camino
      feliz de `anular_venta` en sí ya estaba probado por SQL de todas formas
      (ver ADR-0065 y la entrada de BITÁCORA de hoy: 9 escenarios en una
      transacción revertida).

**Cerrado el 2026-09-15 — Tanda 1 del diagnóstico de Venta y Caja (6 arreglos, cada
uno verificado en navegador; ver BITÁCORA de esa fecha para el detalle):**

- [x] **`MovimientoCajaModal.tsx` guardaba un ingreso con el motivo del `<select>` de
      egresos** («Retiro de efectivo») aunque la colaboradora escribiera otro en el
      campo libre que sí veía — el `motivo` calculado nunca miraba `tipo === "ingreso"`.
      De paso, `step="0.10"` + `min={0.01}` rechazaba montos redondos («35») por
      validación nativa del navegador; ahora `step="0.01"`.
- [x] **La pistola con el foco en el cobro podía confirmar la venta sola.** El
      `<form>` del ticket (momento «cobrar») no tenía guarda contra el submit nativo
      de un `<input>` al recibir Enter — bypasseaba el botón «Cobrar» sin que nadie lo
      tocara (`cobrar()` revalida `motivoBloqueoCobro`, así que no colaba una venta a
      medias, pero sí una ya completa). `PuntoDeVentaTicket.tsx` ganó un `onKeyDown`
      que bloquea Enter salvo que venga del botón.
- [x] **Cambios y Devoluciones no mostraban cuándo se vendió la prenda** —`creadoEn`
      ya viajaba desde `ventas-v2.ts`/`devoluciones.ts` y no se pintaba. Agregado con
      el mismo patrón (`Intl.DateTimeFormat` es-PE) de `ComprobantesPanel`/`ProformasPanel`.
- [x] **`/cambios` y `/devoluciones` no estaban en ningún menú** — solo vivían en la
      cabecera de Vender, oculta en celular. Agregadas al lateral de escritorio (íconos
      propios, distintos del de Movimientos) y «Registrar cambio» al menú «+ Nuevo»
      (paridad con «Registrar devolución», que ya estaba ahí y sí llega a celular).
- [x] **`CambioFormV2.tsx` elegía la prenda nueva en un `<select>` con TODO el
      catálogo activo, sin stock ni búsqueda** (48+ opciones sin agrupar). Reemplazado
      por `ComboBuscable` (el mismo componente que Compras ya usa para «elegir 1 de
      muchos tipeando») con stock por opción — `cambios/page.tsx` ahora trae
      `getStockPorUbicacion` igual que `vender/page.tsx`, y ya no se ofrece una talla
      sin stock aquí. Sin preselección (mismo criterio que el método de pago del POS,
      ADR-0044): la «Diferencia» y el método de pago solo aparecen con una prenda
      elegida.
- [x] **Vender a 375px: el ticket quedaba debajo de TODO el catálogo.** Apilado
      (bajo `lg`, decisión a propósito — «dos scrolls internos serían peores que uno
      solo») no había forma de ver el total o llegar a «Cobrar» sin pasar antes por
      cada producto de la grilla. Agregada una barra fija (`lg:hidden`, mismo offset
      que la de `RecepcionCompraFormV2.tsx` para despejar las pestañas del celular)
      con «N prenda(s) · total · Ver ticket ↓» que salta directo al ticket — visible
      solo con el carrito no vacío y la caja abierta.

Verificado: `npx tsc --noEmit`, `eslint` y `vitest` (184/184) en verde; cada ítem
probado en navegador contra la base local (venta/cambio/ingreso reales, confirmados
también por consulta directa a Postgres donde aplicaba). **Subido el 2026-09-15 en el
PR de consolidación Vender+Caja.**

**Cerrado el 2026-09-15 — Tanda 2 del diagnóstico (movimiento; ver BITÁCORA de esa
fecha para el detalle de cada uno):**

- [x] **7 de los 8 modales del módulo cerraban en seco** desde sus propios botones
      (Cancelar/Listo/Nueva venta) — `Modal.tsx` ya ofrecía el cierre animado por
      render-prop (`children={(cerrar) => …}`), pero solo `ComprobantesPanel.tsx` lo
      usaba. Corregido en `CambioFormV2`, `DevolucionFormV2`, `CerrarCajaModalV2` (×2),
      `MovimientoCajaModal` y «Venta registrada» en `PuntoDeVenta.tsx` (un octavo modal
      que el diagnóstico original no había contado). El cierre automático tras un
      guardado exitoso se dejó **sin** animar a propósito, mismo criterio que
      `ComprobantesPanel.tsx` ya tenía.
- [x] **La curva de transición por defecto de Tailwind no era `--ease-cayla`** —
      afecta a los ~260 `transition-colors`/hover del sistema. Era una aproximación a
      mano sin comentario que la justifique; ahora es el número literal.
- [x] **El ticket de Vender cambiaba de un momento a otro (armar↔cobrar↔descuento) sin
      salida.** `PuntoDeVentaTicket.tsx` gana su única excepción a "sin estado, sin
      hooks": un búfer de ANIMACIÓN (no de negocio — `momento` sigue siendo del padre,
      `cobrar()` allá revalida contra el valor real) que retiene el contenido saliente
      con `.anim-revelar-salida` (nueva, en `globals.css`) los 160ms que tarda en
      desvanecerse. El `setState` que arranca la salida vive en el render, no en el
      efecto (el propio linter del repo marca ese patrón — `react-hooks/set-state-in-effect`).
- [x] **Nada animaba el despliegue de un bloque** — el motivo bajo el botón del ticket
      (`PuntoDeVentaTicket.tsx`) y el swap select↔input del motivo en
      `MovimientoCajaModal.tsx`, con el truco `grid-template-rows` (0fr↔1fr). Costó una
      segunda vuelta: `min-h-0` solo no basta para 0px real en un campo con
      padding/borde fijo (queda un piso de ~17-23px medido con `getComputedStyle`) —
      hace falta forzar `padding`/`border` a 0 con `!` SOLO mientras está oculto, y el
      `<select>` nativo además necesita `appearance-none` + `text-[0px]` (su cromado de
      sistema operativo no se mueve con padding/borde solos). Verificado con
      `getComputedStyle` en el navegador real, no solo a ojo.
- [x] **Lo que llega por `router.refresh()` se reemplazaba en seco** — `anim-entrada`
      en el swap `AbrirCajaFormV2`↔`CajaAbiertaPanel` de `/caja` (React ya lo remonta
      solo, son componentes distintos); `transition-opacity` en el atenuado de
      `bloqueado` del POS (no tenía ninguna transición); `anim-revelar` en las filas de
      «Ventas de hoy» y de devoluciones pendientes — sin `key` extra: React ya reusa el
      nodo de lo que sigue igual tras el refresh (no reanima) y solo monta —y por lo
      tanto anima— lo genuinamente nuevo.

Verificado igual que la Tanda 1, más una vuelta extra con `getComputedStyle` para los
colapsos de altura (no alcanza con mirar la pantalla: un colapso a 17px en vez de 0
se ve casi igual a ojo). Sesión completa de principio a fin en navegador: agregar
prenda → cobrar → pagar → confirmar → «Venta registrada» con cierre animado → nueva
venta con ticket limpio, y un ingreso de caja real con «Otro» motivo (ambos campos
del swap). Cero errores de consola en una pestaña nueva (la pestaña vieja arrastraba
un error de una ventana intermedia de la propia edición — no representativo).
**Subido el 2026-09-15 en el PR de consolidación Vender+Caja.**

**Cerrado el 2026-09-15 (mismo día, segunda vuelta) — el resto de Tanda 2**: al
revisar contra el mapeo original, la técnica se había aplicado en 1-2 lugares por
categoría, no en todos los identificados. Completado con la misma técnica, mismo
riesgo bajo:

- [x] `CajaAbiertaPanel.tsx` — las 5 tarjetas de resumen (`key={valor}` +
      `anim-asentar`) y las filas de «Movimientos de esta caja» (`anim-revelar`),
      que se habían quedado fuera del barrido de `router.refresh()`.
- [x] El contador «160/200» bajo la nota del ticket, con el mismo truco de
      `grid-template-rows` — antes aparecía de golpe.
- [x] El bloque «Recibido» del pago en efectivo **no necesitó arreglo propio**:
      `p.metodo` de una fila de pago nunca cambia una vez agregada (`agregarPago`
      bloquea duplicados, nada muta el campo), así que animar la fila entera
      (`anim-revelar`, agregado también a cada fila de `pagos.map`) cubre el bloque.
- [x] Los formularios inline «Aprobar»/«Rechazar» de devoluciones pendientes —
      `anim-revelar` simple (no el búfer de dos tiempos del ticket: es una acción de
      Líder, poco frecuente, no justifica la complejidad extra).
- [x] El desplegable «Ventas de hoy» del catálogo — el más visible de los siete,
      usaba `hidden` (display:none), que ni con CSS se puede animar. Ahora
      `grid-template-rows`. Sin controles enfocables adentro (solo filas de texto),
      así que no necesitó los `disabled` condicionales del swap de
      `MovimientoCajaModal`.

Casi se reescribe este último a una técnica distinta (`max-height`) por una falsa
alarma: medido con `getComputedStyle` justo después de un `.click()` disparado por
JS y de un `navigate()`, el colapso parecía atascado en 133px. Era el Suspense de
«Ventas de hoy» (`Cargando ventas de hoy…`) resolviendo en paralelo con el propio
toggle, más que `element.click()` no siempre dispara el handler de React de forma
confiable en sucesión rápida — dos problemas de METODOLOGÍA de prueba, no del
código. Se confirmó con capturas reales (clic real + pantallazo, no JS) que colapsa
y expande limpio, ida y vuelta. **Lo que ya estaba construido funcionaba.**

Verificado igual que la primera vuelta: `tsc`, `eslint`, `vitest` (184/184), y una
sesión de navegador completa (ingreso de caja real, «Ventas de hoy» expandido y
colapsado dos veces con capturas). **Subido el 2026-09-15 en el PR de consolidación Vender+Caja.**

Del mismo diagnóstico: historial de cierres de caja y códigos de descuento
administrables se cerraron en la Tanda 3 (2026-09-15, más arriba). Ficha de
clienta y anular una venta siguen pendientes de una decisión de Felipe —
ver "Pendiente de decisión de Felipe" en el bloque de la Tanda 3, arriba.

**Cerrado el 2026-09-14 en esta sesión:**

- [x] **`movimientos` es inmutable de verdad** — ADR-0042,
      `20260914165703_movimientos_inmutables.sql`. Disparador `before update or
      delete` + retiro de `UPDATE`/`DELETE`/`TRUNCATE` a `authenticated`/`anon`.
      Probado en rojo: las dos operaciones fallan, las 105 filas quedan intactas.
      **Ya está también en producción** — ver el detalle y la higiene pendiente
      (migración sin registrar) en «Pendiente de construir» más abajo.
- [x] **El modal de cierre de caja dejó de revelar el esperado antes de contar**
      (`CerrarCajaModalV2.tsx`). Ahora el esperado sale de la respuesta de
      `cerrar_caja` —calculado en el instante del cierre, no al cargar la página— y
      se muestra DESPUÉS, junto a lo contado. De paso se arregló que el resultado se
      desmontaba solo: `router.refresh()` corría junto al resultado, el servidor
      respondía "ya no hay caja abierta" y el modal moría antes de que nadie leyera
      la diferencia. Y se eliminó la consulta `getResumenCaja` de `vender/page.tsx`,
      que corría fuera del `Promise.all` en cada carga solo para alimentar ese modal.

- [x] **La tarjeta "Esperado en el cajón" se quitó del panel** (decisión de Felipe,
      2026-09-14). El argumento a favor de dejarla era más débil de lo que parecía: para
      saber si alcanza para dar vuelto se mira el cajón, no la pantalla — su utilidad
      real era casi toda al cerrar, que es justo cuando no debe verse. En contra pesó el
      precedente propio: los SINATRA traían cuadres de **−S/6,122 (TRU) y −S/7,675 (LIM)
      sin fecha de origen**, que es lo que pasa cuando la diferencia diaria no se mide.
      Se quitó también del tipo `ResumenCaja` y de `getResumenCaja`, así el número deja
      de viajar al navegador durante el turno (no se puede leer ni inspeccionando props).
      **No es un candado y no debe leerse como "conteo ciego resuelto"** — ver abajo.

- [x] **Vender partido en padre + dos paneles sin estado, para trabajar en dos ramas
      a la vez** (sesión aparte del mismo día, ADR-0043). `PuntoDeVenta.tsx` 705 → 415
      líneas; `PuntoDeVentaTicket.tsx` y `PuntoDeVentaCatalogo.tsx` nuevos, render puro
      sobre props. Refactor sin un solo byte de diferencia en el HTML (medido con
      `renderToString` y con el SSR real). **Regla para las dos ramas que salen de acá:**
      cada sesión es dueña de UN panel; el padre (estado + handlers) se toca en commits
      chicos separados de la UI y entran a `main` apenas compilan.

- [x] **El ticket de Vender tiene dos momentos: armar y cobrar** (sesión B del mismo
      día, ADR-0044, rama `feat/pos-ticket-progresivo`). Con el ticket vacío ya no se
      despliega el cobro: en «armar» solo líneas y total; pago y comprobante aparecen
      recién al tocar «Cobrar», con el DNI adentro del bloque de comprobante. Un solo
      `motivoBloqueoCobro` (`lib/vender-reglas.ts`, 7 tests) apaga el botón, lo explica
      debajo y frena `cobrar()`. El método de pago ya no viene preseleccionado (decisión
      de Felipe) y los (!) del cobro son `Ayuda tono="falta"`: solo cuando falta el
      método o el RUC, y el globo dice qué falta. Verificado en navegador con venta real
      (Boleta B001-000001 en la base local). Adenda del mismo día: en escritorio el
      POS es pantalla fija — la página no scrollea, catálogo y ticket scrollean por
      dentro y el ticket llena toda la altura visible. Segunda adenda: **descuento
      manual** (tercer momento del ticket; % global o por prenda; viaja como
      `descuento_unitario` por línea — verificado en la base, Boleta B001-000005),
      precio de solo lectura, basurero en «1», íconos en los colores del sistema y
      **vuelven shadcn + GSAP** (ADR-0045: el corte V1→V2 los había borrado sin
      registro). Tercera adenda: **pago mixto y vuelto** — filas por medio, recibido en
      efectivo con teclas que suman billetes, «Cubierto / Falta cubrir / Se pasa»;
      verificado con Boleta B001-000006 (yape 50 + efectivo 109.80, «efectivo + yape»
      en Ventas de hoy). **En `origin/main`** (verificado 2026-09-15: `git merge-base
      --is-ancestor` confirma los commits del 14-sep en el HEAD de esta rama).

- [x] **El escaneo manda en el panel izquierdo de Vender; el catálogo es plan B**
      (sesión A del mismo día, rama `feat/pos-escaneo-primero`). Campo de escaneo primero
      y dominante, sin el título «Catálogo De Prendas», chips + grilla debajo, «Monto
      manual» al lado del campo, sin stock atenuadas + chip «Solo con stock» (filtra la
      grilla, no al escáner). El foco vuelve al escáner al abrir caja, al cerrar cualquier
      modal (`Modal.alCerrarEnfocar` sobre Radix) y ante una tecla suelta con el foco en
      un botón (`lib/escaner-tecla-suelta.ts`, 9 tests) — antes el Enter de la pistola
      activaba ese botón. Verificado en navegador con ventas reales en local
      (B001-000002 a 000004). **En `origin/main`.**

- [x] **El catálogo de Vender se mira por prenda + color, con las tallas adentro**
      (sesión A, segunda ola del mismo día, decisión 1A de Felipe). `lib/catalogo-grupos.ts`
      (10 tests) agrupa y ordena tallas; la tarjeta tiene hueco de foto 4:5, chips de talla
      (tocar «M» agrega esa variante; agotada queda tachada), `Tooltip` «N en sede»,
      borde rojo suave sin stock (pedido explícito; rompe el "máx. 2 rojos" del brandbook),
      `Toggle` «Solo con stock», `Badge` en el globito, `alza-cayla`, `scroll-cayla` y
      `RevelarAlScroll` (GSAP) por tarjeta — lo que ya se ve al montar no viaja. 48 → 16
      tarjetas medidas a 1440×900. **En `origin/main`.**
- [x] **La talla agotada dice en qué sede sí hay** (sesión A, tercera ola). Tooltip por
      talla y línea en el desplegable del escáner; `lib/stock-por-sede.ts` (9 tests);
      `page.tsx` lee el stock de todas las sedes que RLS deje ver. Funciona para Líderes;
      para colaboradoras de sede fija llega vacío (ver pendiente siguiente). De paso: fuera
      el reveal al scroll del POS (dos atenuados no conviven) y `catalogo-grupos.ts` dejó
      de ser binario para git (byte NUL → escape). **En `origin/main`.**
- [x] **«Ventas de hoy» firma cada venta con la integrante** (sesión A). Primer nombre,
      inicial del apellido solo si hay dos con el mismo (`lib/nombre-integrante.ts`, 6
      tests); el relleno «—» de la RPC no se pinta. **En `origin/main`.**
- [x] **La cabecera de Vender enlaza a Caja, Cambios y Devoluciones** (sesión A). Tres
      enlaces discretos antes del botón de caja; agrupados con él para que la fila se parta
      limpia; ocultos bajo `sm`. **En `origin/main`.**
- [x] **«Ventas de hoy» muestra la nota de la venta** (sesión A): misma fila, truncada,
      texto completo en `title`; nada si viene null. **En `origin/main`.**
- [x] **El reembolso en efectivo ya resta del arqueo, y se busca una venta por su
      boleta** (ADR-0052, `20260915180000_reembolso_en_el_arqueo.sql`). Antes: aprobar
      una devolución con reembolso en efectivo dejaba el cajón "sobrando" exactamente
      ese monto en `cerrar_caja` — un faltante disfrazado de sobrante. Ahora
      `devoluciones.caja_id` (fijado solo, al aprobar) liga el reembolso a la caja que
      lo absorbe, y `cerrar_caja` lo resta — solo efectivo, Yape/Plin/transferencia/
      tarjeta no tocan el cajón. Tarjeta "Reembolsos en efectivo" nueva en `/caja`. De
      paso: Devoluciones y Cambios solo mostraban las últimas 30 ventas de la sede —
      ahora se puede escribir "B001-10" (o solo "10") y encontrar una venta de hace
      meses (`parsearComprobante`, `BuscarPorComprobante.tsx`, compartido por las dos
      pantallas). Verificado en psql (3 escenarios con rollback) y de punta a punta en
      navegador: `cerrar_caja` con un reembolso real de S/25.90 dio el esperado exacto
      (S/586.82) contra lo contado. **En producción desde 2026-09-15 16:1x (Lima)** — aplicada vía MCP `apply_migration` en `cayla-dynamic`, schema `retail`, verificada contra `information_schema`/`pg_proc` (columnas, constraints, cuerpos nuevos, una sola sobrecarga por función).
- [x] **Cambios ya no tiene la misma fuga que Devoluciones tenía** (ADR-0053,
      `20260915200000_diferencia_de_cambio_en_el_arqueo.sql`) — cerrado el mismo día
      que se encontró. Mismo mecanismo que ADR-0052: `cambios.caja_id` (fijado solo, al
      registrar) liga la diferencia a la caja que la absorbe; `cerrar_caja` la suma con
      signo — positiva (paga de más) suma, negativa (se le devuelve) resta, un solo
      `sum()` cubre los dos sentidos porque el dato ya trae el signo. Tarjeta "Cambios
      en efectivo" nueva en `/caja` (con signo). Encontrado de paso: `cerrar_caja`
      retorna una columna que también se llama `diferencia` — sin calificar
      `cambios.diferencia`, la función ni compilaba en la prueba. Verificado en psql (3
      escenarios) y de punta a punta en navegador: cambio real con diferencia de
      +S/100 en efectivo, `cerrar_caja` dio el esperado exacto (S/194.99).
      **En producción desde 2026-09-15 16:1x (Lima)** — aplicada vía MCP `apply_migration` en `cayla-dynamic`, schema `retail`, verificada contra `information_schema`/`pg_proc` (columnas, constraints, cuerpos nuevos, una sola sobrecarga por función).
- [ ] **Cambiar `vender/page.tsx` a `fn_stock_por_sede`** — lo único que falta. La RPC
      **ya está en producción** (verificado 2026-09-15 contra `pg_proc` en `cayla-dynamic`,
      schema `retail`: security definer, suma piso+almacén por sede — la trajo el bloque 8,
      `…231015_registrar_venta_piso_con_nota`, aunque su propia migración
      `20260914220001` no quedó registrada en `schema_migrations`). `vender/page.tsx:43`
      todavía lee `stock` directo (`supabase.from("stock").select(...)`), así que
      `stock_select` = «puede operar la sede» sigue filtrando y una colaboradora de sede
      fija recibe `otrasSedes` vacío. Cambio: `supabase.rpc("fn_stock_por_sede")` en vez de
      la lectura directa (un commit chico) y verificar como Micaela (colaboradora de
      Trujillo — su fila ya existe en local, ver ítem siguiente).
- [ ] **`etiquetaSede` no sirve en V2 y nadie la usa.** Deriva la ciudad de un `codigo` que
      `ubicaciones` ya no tiene, o de la última palabra del nombre si mide 2–4 letras
      («Tienda LIM» era V1; hoy «Tienda Trujillo» → «TND»). Si se quiere «TRU/AQP» en
      pantalla, es una columna `codigo` en `ubicaciones` (migración); si no, borrar la
      función y su test para que nadie la reviva por error.
- [ ] **Foto por prenda en el catálogo.** La tarjeta ya tiene el hueco (4:5, iniciales en
      serif), pero `productos`/`variantes` no tienen columna de foto ni bucket de Storage.
      Es cambio de modelo de datos: decidir dónde vive (una por producto o por color),
      quién la sube (Productos) y cómo llega a `getCatalogo`. Cuando exista, la tarjeta
      la pinta sin rediseñar.

- [ ] **Vender como colaboradora de sede fija (rol Colaborador, `0016_roles_colaborador`)
      — falta VERIFICAR, ya no falta la data.** Micaela existe en local como colaboradora
      de Tienda Trujillo (confirmado 2026-09-15: `retail.colaboradores` tiene su fila con
      `ubicacion_asignada_id` = Trujillo). Falta entrar como ella y verificar en
      navegador que la caja opera sobre *su* sede y no sobre la de un Líder: el selector
      «Tienda … ▾» del AppShell, el `ubicacionId` que `vender/page.tsx` saca de la persona,
      y que el escáner solo reconozca stock de esa sede. Sin dueño ni fecha; no bloquea
      nada de Vender.

- [x] **(Cerrado 2026-09-15: `…231015_registrar_venta_piso_con_nota` YA está en producción**
      — verificado contra la base: una sola `registrar_venta`, cuyo cuerpo llama a
      `fn_sububicacion_por_defecto`; `fn_stock_por_sede` ya suma por sede; y ya hay
      sububicaciones creadas. Sigue vigente lo operativo: al activar piso/almacén en una
      tienda, llevar antes el stock «sin sububicación» al piso con
      `mover_interno(…, null, piso, …)`, prenda por prenda, no con un script ciego.)

**Pendiente de decisión de Felipe:**

- [ ] **El candado real del conteo ciego sigue pendiente, y depende de los roles.** Lo
      de arriba es fricción, no imposibilidad: las otras cuatro tarjetas (apertura,
      ventas en efectivo, ingresos, egresos) permiten sumar el total a mano, y
      `ventas_select` deja a cualquiera con sesión consultar las ventas de su sede desde
      la consola del navegador — un `GET` de una línea. El candado de verdad es que quien
      opera la caja no pueda leer ese agregado, y eso necesita los cuatro niveles de
      D-12, que hoy no existen en la base.
- [x] **"Control total temporal" (`0012`/`0013`) — cerrado por `0016_roles_colaborador`.**
      El hueco que este ítem denunciaba (cualquier colaborador podía operar cualquier
      sede) ya no existe: verificado 2026-09-15 contra `cayla-dynamic` en vivo,
      `fn_puede_operar_ubicacion` compone sobre el `fn_es_lider()` y
      `fn_ubicacion_actual_persona()` reales de `0016` (Líder = todo; Colaborador = solo
      su `ubicacion_asignada_id`), no sobre el bypass de `0012` ("cualquier persona activa
      de Dynamic"). Sigue pendiente, aparte, el candado del **conteo ciego** (ítem
      siguiente), que depende de los cuatro niveles de D-12 y no de este.
- [ ] **¿Dónde vive la docencia del cobro ahora que los (!) solo se encienden cuando
      falta algo?** (ADR-0044). La explicación de «acá se registra, no se cobra» y de
      «boleta admite DNI opcional; factura exige RUC» quedó dentro de los globos de
      alerta — se lee solo mientras falte el método o el RUC. Y el tercer (!) del bloque
      (el de «Consulta de DNI», dentro de `ConsultaDocumento`, compartido con
      Facturación) sigue siempre encendido. Opciones: dejarlo así, un «?» permanente en
      la cabecera del cobro, o un prop en `ConsultaDocumento` para apagarlo en el POS.

**Pendiente de construir (no es un fix de una sesión):**

- [x] **RESUELTO 2026-09-16 (ADR-0063).** El POS de V2 ya tiene resiliencia sin
      internet: `lib/ventas-offline.ts` (puro, 19 tests) + estado `cola` y el trío de
      sincronización (mount/`online`/latido de 30s, con mutex) en `PuntoDeVenta.tsx` +
      banner con "Descartar" en `PuntoDeVentaColaOffline.tsx`. Verificado en el
      navegador como Micaela (Trujillo) interceptando `fetch` solo para
      `registrar_venta` (nunca se tocó Kong — lo comparten ~27 worktrees): encola,
      banner persistente, reintento al volver la red, rechazo real con "Descartar" de
      dos pasos. **Pendiente, sin poder verificarse en esta sesión por un problema de
      datos ajeno** (ver la nota nueva en 🩹 ARREGLAR, "`stock.sububicacion_id` en NULL
      en las tres sedes"): la subida exitosa de punta a punta ("sube sola" → aparece en
      Ventas de hoy). **Deuda RESUELTA 2026-09-17 (ADR-0092):** `totalEfectivoEncolado()`
      ahora se usa en `CerrarCajaModalV2.tsx` y `CajaAbiertaPanel.tsx` (sus dos puntos de
      montaje) — avisa antes de cerrar caja si hay efectivo offline sin subir, y bloquea
      el cierre solo cuando hay red (le da tiempo al reintento de 30s); sin red deja
      cerrar con el aviso puesto y repite el monto en el resultado.
- [ ] **Ficha de clienta — preguntado a Felipe 2026-09-16, más temprano de lo que se
      pensaba.** `registrar_venta` acepta `p_cliente_id` (el onceavo parámetro) desde
      que se le agregaron los campos de comprobante, pero Vender nunca lo manda. Al
      preguntarle si el cobro debía buscar/crear la clienta en `clientes` o si por
      ahora es solo una pantalla de consulta aparte, contestó: "el campo ya está pero
      aún no tengo contemplado el almacenar clientes en mi sistema" — ni siquiera está
      decidido SI se van a guardar clientas, así que no se construye ninguna de las dos
      opciones todavía. Retomar con `/decide` cuando Felipe quiera avanzar esa decisión.
- [x] **Las tres migraciones de ADR-0048 ya están en producción — ya no bloquean el
      deploy.** `20260914215059_candado_precio_venta.sql`,
      `20260914215103_codigos_descuento.sql` y `20260914220804_nota_en_ventas.sql`.
      Verificado 2026-09-15: las tres versiones están en
      `supabase_migrations.schema_migrations` de `cayla-dynamic` y `registrar_venta` en
      vivo acepta `p_codigo_descuento` y `p_nota`. Pendiente de higiene, no de deploy:
      correr `pnpm datos:generar:produccion` (el diccionario sigue describiendo la RPC de
      5 parámetros de V1). «Ventas de hoy» ya pinta `nota` (ítem cerrado arriba).
- [x] **Ticket en espera (Park/Resume)** — cerrado el 2026-09-14 (ADR-0049): sin tabla,
      en `localStorage` por sede vía `lib/almacen-local.ts` (puro, 9 tests, nunca lanza),
      tope 5, retomar intercambia, se vacía al cerrar caja, sin reserva de stock (avisa por
      nombre). Verificado en navegador de punta a punta, incluido el cierre de caja.
      **La cola offline usa el mismo módulo** con `nombre = "cola"` — el primer ladrillo
      del ítem de resiliencia sin internet ya está puesto.
- [ ] **Administrar códigos de descuento** (paso propio): hoy se crean en Studio
      (`retail.codigos_descuento`: código, %, vigencia, activo, sede o todas). Una pantalla
      para Líderes —crear, apagar, ver vigencia— y, si se quiere medir cuánto se regala
      por código, una columna en `ventas` con el código usado.
- [x] **El precio lo pone el navegador y el descuento es un dato fantasma** — cerrado el
      2026-09-14 (ADR-0048): `registrar_venta` rechaza precios distintos a
      `variantes.precio` (salvo Cargo especial) y, para una Colaboradora, descuentos sin
      código válido o por encima de su %. Probado en psql con rollback y por HTTP.
      `registrar_venta` (`0011_venta_con_comprobante.sql:114-117`) inserta
      `precio_unitario`/`descuento_unitario` tal cual llegan, sin compararlos con
      `variantes.precio`. La columna `descuento_unitario` existe (diseño D-44) pero
      `PuntoDeVenta.tsx:47,141` la deja fija en `0` y el campo "Precio unitario"
      sobreescribe el precio directo. Nadie puede medir cuánto se regala en descuentos,
      ni distinguir un descuento autorizado de un cero de más al tipear.
- [x] **El Líder también tiene tope, y el descuento pide motivo — cierra R-45 y D-44**
      (ADR-0054, `20260915140000_descuento_motivo_y_escalonado.sql`). Desde el 09-14 la
      Colaboradora ya tenía tope (el código); el Líder podía descontar cualquier % sin
      dejar rastro. Ahora, para cualquier descuento > 0 (Líder o Colaboradora): motivo
      de lista cerrada obligatorio, y nunca por debajo del costo, sin revelar el número.
      Solo para el Líder: hasta 20 % sola, 20-35 % con argumento escrito, más de 35 %
      nadie — sin excepción (decisión de Felipe, 2026-09-15: la base no puede distinguir
      "Felipe" de las otras 8 personas registradas; ver ADR-0054 «Se descartó»). De
      paso: descuento en S/ por unidad, no solo en %. Verificado en 10 escenarios psql
      y de punta a punta en navegador (Boletas B001-000010 y B001-000011, local).
      **En producción desde 2026-09-15 16:1x (Lima)** — aplicada vía MCP `apply_migration` en `cayla-dynamic`, schema `retail`, verificada contra `information_schema`/`pg_proc` (columnas, constraints, cuerpos nuevos, una sola sobrecarga por función).
- [ ] **Reporte de "cuánto margen se fue por cada motivo"** (R-45, punto 2) — el dato ya
      se guarda (`venta_items.motivo_descuento`), pero no hay pantalla que lo sume por
      motivo ni por período. Paso propio, sobre ADR-0054.
- [ ] **Cero pruebas automatizadas sobre `registrar_venta`, `abrir_caja` y
      `cerrar_caja`.** Es el núcleo del dinero y del stock. No hay `supabase/tests/`
      ni un solo `*.test.ts` que las toque. Es D-25, y lo pide **antes** del censo.
- [ ] **La caja no tiene día de negocio.** `cajas` (`0008_caja_y_pagos.sql:22-35`) no
      tiene columna de fecha ni cierre automático: una caja abierta el lunes sigue
      abierta el viernes y se lleva las ventas de toda la semana. V2 tampoco tiene el
      aviso blando que V1 sí tenía ("cajas de días anteriores sin cerrar").
- [x] **(Cerrado 2026-09-15: el disparador `movimientos_inmutables` YA está en producción** —
      verificado en vivo dos veces por dos sesiones distintas: primero contra `pg_proc`
      (trigger presente, `authenticated` sin `UPDATE`/`DELETE`/`TRUNCATE`), después tabla
      por tabla al refrescar el volcado — producción y local tienen los mismos 7
      disparadores. Queda una sola higiene: `20260914165703` no aparece en
      `supabase_migrations.schema_migrations` — el candado corre, pero su migración no
      quedó registrada. Registrarla es cosa de Felipe (D-11), no bloquea nada. Queda el
      texto original como historia.)
      **El candado de `movimientos` falta en producción, y NO necesita gemelo.** Medido
      contra la base real el 2026-09-14: **producción ya corre V2** — 35 tablas,
      `retail.ubicaciones` existe, `retail.sedes` ya no, y `movimientos` tiene
      `ubicacion_id`/`venta_item_id`/`compra_item_id`. Se desplegó el 12-sep con las
      migraciones normales (`supabase_migrations.schema_migrations` las registra como
      `retail_0007_cambios` … `retail_0016_colaboradores_iniciales`), así que
      **`supabase/unificacion/` dejó de ser el riel de producción** y escribir un gemelo
      ahí habría revivido la deuda de migraciones duales (ADR-0004/0006), que este
      backlog llama "la que más caro ha salido".
      Lo que corresponde: pegar `20260914165703_movimientos_inmutables.sql` **tal cual**
      —ya usa el prefijo `retail.`— y registrarla con el mismo mecanismo que las otras.
      **El pre-flight ya se corrió contra producción: 0 funciones editan o borran
      `retail.movimientos`.** Único trigger presente: `movimientos_compra_foto`
      (AFTER INSERT), que no choca con uno BEFORE UPDATE/DELETE. `authenticated` tiene
      hoy UPDATE y DELETE (TRUNCATE ya no), y 108 filas de historial que proteger.
- [x] **(Cerrado 2026-09-15: `docs/datos/generado/` se refrescó desde producción V2** —
      39 tablas, 361 columnas, 219 candados, 74 funciones, verificados con md5 contra la
      base real. `pnpm datos:comparar` vuelve a comparar contra firmas de verdad: 0 rotas.
      Las carpetas escritas a mano (`00-MAPA.md`, módulos) siguen describiendo V1 en
      partes — esa pasada sigue pendiente.)
      **`docs/datos/` describe un sistema que ya no existe — ni en el repo ni en
      producción.** Fue medido el 2026-09-12 contra el modelo viejo (45 tablas,
      `sede_id`, `venta_id`, `registrar_gasto`, `supabase/unificacion/`). Verificado hoy:
      `registrar_gasto` **no existe** en producción, así que el "Bloque 3" de
      `SQL-PENDIENTE-PRODUCCION.sql` y todo `DIAGNOSTICO-PANTALLAS-ROTAS.md` quedaron sin
      objeto. Es el mismo problema que el aviso del encabezado de este archivo, pero más
      grave: esa carpeta se presenta como "la verdad medida contra la base". Necesita su
      propia pasada de actualización antes de que alguien —o un agente— construya encima.
- [x] **(Cerrado 2026-09-15: `INSERT` directo a `movimientos` cerrado — P-05.)**
      `20260915150000_movimientos_insert_solo_rpc.sql` revoca `INSERT` sobre
      `retail.movimientos` a `authenticated`/`anon`. Verificado contra producción antes de
      escribirla (no razonado): 12 funciones insertan en `movimientos`, las 12
      `security definer` y dueño `postgres`; `relforcerowsecurity=false`, así que las 12 se
      saltan la policy por ser dueñas — el privilegio de tabla era la única puerta real.
      `authenticated` tenía `INSERT`+`SELECT` (UPDATE/DELETE ya los sacó ayer D-22); queda
      solo con `SELECT`. Cero pantallas dependían del insert directo (`grep` sobre
      `apps/web`: un solo `.from("movimientos")`, en `lib/compras.ts:330`, y es un
      `.select`). Probado en rojo/verde en local (ver ADR-0055): el insert directo como
      `authenticated` ahora falla con `permission denied`; las funciones siguen sin tocar
      RLS. Hallazgo de paso, sin tocar hoy: `registrar_movimiento` tiene **dos firmas**
      vivas en producción (6 y 7 parámetros) — mismo patrón que `recibir_lote` en ADR-0004
      — y hoy nada en `apps/web` la llama (solo se usa `registrar_movimiento_caja`, que es
      otra función). **Pendiente aparte, sin tocar hoy:** aplicar este mismo archivo a
      producción (falta el ok puntual) y `retail.transferencias` tiene la misma forma de
      policy de INSERT sin verificar.
- [ ] **La pieza que le sigue faltando a D-22:** `force row level security` sobre
      `movimientos`, con prueba de que las RPC que insertan (venta, transferencia, conteo)
      siguen pudiendo hacerlo. Sigue descartada por riesgo — ver ADR-0042/ADR-0055.
- [ ] **Dos firmas vivas de `registrar_movimiento` en producción** (6 y 7 parámetros,
      `p_sububicacion_id` de más en la segunda) — un `select registrar_movimiento(...)`
      con los 6 parámetros históricos sale `is not unique`, reproducido en local
      2026-09-15. Mismo patrón que `recibir_lote` (ADR-0004): `create or replace` con
      firma distinta crea función nueva, no reemplaza. Hoy no rompe nada porque
      `apps/web` no llama a esta función (ver arriba) — pero cualquier llamada futura con
      la firma vieja de 6 parámetros va a fallar. Se corrige con `drop function` explícito
      de la firma que sobra, igual que se hizo con `recibir_lote`.
- [ ] **`retail.transferencias` tiene la misma forma de policy de INSERT sin RPC** que
      tenía `movimientos` (`transferencias_insert` en `0004_rls.sql`, mismo patrón que
      P-05). No verificado si tiene el mismo problema — hacerlo antes de asumir que está
      bien o mal.

**Higiene encontrada de paso:**

- [ ] **El «Cargo especial» tiene stock 0 en la base local, en las tres ubicaciones**
      (medido 2026-09-14: 0 filas en `stock` y 0 en `movimientos` para la variante
      centinela). `20260912234726_cargo_especial_pos.sql` siembra 999 999 recorriendo
      `retail.ubicaciones`, pero en un `db reset` esa tabla está vacía porque `seed.sql`
      corre después de las migraciones. Efecto: «Monto manual» falla en local con «Stock
      insuficiente: hay 0 y se pide sacar 1». Producción no lo sufre (las ubicaciones ya
      existían). Arreglo probable: que `seed.sql` repita la siembra por movimiento.
- [ ] **El buscador global del AppShell («Buscar o escanear prenda…») es un segundo campo
      de escaneo en la pantalla de Vender**: con Enter navega a `/buscar` y abandona la
      venta a medio ticket. Fuera del alcance de la sesión A (AppShell es navegación).
      Opciones: ocultarlo en `/vender`, o que en `/vender` reenvíe al escáner de la caja.

- [ ] **La base local está 4 migraciones atrás del repo**: `compras_desde_factura`,
      `compras_snapshot_y_paginado`, `vocabulario_cerrado` y `activos_fijos` están en
      `supabase/migrations/` y no en `supabase_migrations.schema_migrations`. Lo que se
      prueba en local no es lo que el repo describe. No se aplicaron en esta sesión a
      propósito: el Postgres local lo comparten todos los worktrees y no era lo pedido.

---

## 🎯 Movimientos en V2 — lectura con proceso, filtros y detalle (2026-09-15)

**Cerrado esta sesión, solo local** — `20260915090000_movimientos_lectura.sql`
(`fn_movimientos`, `fn_movimientos_resumen`, 2 índices por fecha) + pantalla nueva
(`movimientos/page.tsx`, `FiltrosMovimientos.tsx`, `MovimientosLista.tsx`,
`MovimientoDetalle.tsx`), ADR-0050. Ninguna tabla cambia; ninguna escritura cambia.
Corregido de paso: el signo de las transferencias que ENTRAN (antes salía «−»),
la variante centinela «Cargo especial» fuera de Movimientos/Inventario/Inicio
(`lib/cargo-especial.ts`), y `activacion-piso-almacen-produccion.sql` versionado.

**Pendiente de Felipe (producción):**

- [x] **`20260915090000_movimientos_lectura.sql` ya está en producción — este ítem
      quedó viejo apenas se escribió.** Verificado 2026-09-15, dos veces: primero en
      vivo contra `pg_proc`/`schema_migrations` de `cayla-dynamic` (la migración estaba
      registrada y `fn_movimientos`/`fn_movimientos_resumen` existían), después
      después del merge del PR #33 (Vercel en verde). Verificada como Benjamin en
      Tienda AQP con rollback. De paso quedaron registradas en
      `supabase_migrations.schema_migrations` las tres que se aplicaron con
      `execute_sql` (`…230000`, `…231015`, `…090000`): el historial de producción
      vuelve a contar lo mismo que `supabase/migrations/`.
- [x] **Foto de producción del diccionario refrescada (2026-09-15).** Se hizo desde el
      MCP en trozos verificados con md5 contra producción (no a mano en el SQL Editor):
      `retail_*.json` + `funciones-produccion.txt` describen la V2 real. `pnpm
      datos:comparar`: **0 pantallas rotas**, 8 llamadas «no analizadas» porque arman
      el objeto con `...` (entre ellas `fn_movimientos`, verificada a mano en producción).
- [x] **Detalle compartible por URL** (`?mov=<id>`, 2026-09-15): abrir una fila escribe
      el id con `history.replaceState` (sin consulta al servidor); cambiar un filtro o
      pasar de página lo borra. Y `buscar/page.tsx` ya excluye la centinela.
- [x] **`20260915120000_reparar_fk_transferencia_items.sql` aplicada en producción el
      2026-09-15 con ok de Felipe**, verificada con una transferencia real revertida
      (`transferir()` pasa, la línea queda enlazada a su movimiento). Hallazgo del refresco: la ÚNICA diferencia entre producción y
      local es que `transferencia_items.movimiento_id` apunta a `transferencia_items(id)`
      en vez de `movimientos(id)`. Comprobado con rollback: la primera «Mover
      mercadería» entre sedes fallaría entera con «violates foreign key constraint».
      Hoy hay 0 transferencias en producción; nadie lo pisó todavía. Sin datos que
      tocar, sin cambios de pantalla.
- [ ] **Buscar por referencia de operación (guía, serie-número) desde Movimientos** quedó
      fuera de esta fase: exige joins solo para el predicado, y Compras/Facturación ya
      buscan por eso. Si Felipe lo usa seguido, va como función hermana de
      `fn_movimientos_variantes` que resuelva `lote_id[]`/`venta_id[]` — no mezclada con
      la búsqueda de prendas.

## 🎯 Historial de Producto en V2 — movimientos por producto + precio/categoría (2026-09-15)

**Cerrado esta sesión (Sesión A3), solo local** —
`20260915204457_movimientos_por_producto.sql` (`fn_movimientos` gana `p_producto_id`,
resuelve a las variantes del producto; `p_ubicacion_id` sigue obligatorio) +
`20260915204541_historial_producto_cambios.sql` (tabla `historial_producto_cambios`,
trigger en `productos`/`variantes` que la llena solo, `fn_historial_producto_cambios`
para leerla) + `HistorialProductoPanel.tsx` (standalone, agrupable por fecha o por
variante). ADR-0059. Ninguna tabla existente cambia de forma; ninguna escritura
existente cambia de comportamiento. Verificado en Chrome headless contra datos
reales (ver BITÁCORA 2026-09-15).

**Integrado por la Sesión B2 (mismo día):** `HistorialProductoPanel` ya no vive
en una ruta de demo — se monta en `/productos/[id]/historial` (página completa)
y, desde el menú "..." de la lista, como modal con ruta interceptada
`@modal/(.)[id]/historial` (mismo mecanismo que el detalle de factura de
Compras). La ruta de demo `productos/dev/historial/[id]` se borró. De paso,
`20260915223000_historial_producto_estado.sql` extiende el trigger para
auditar también `estado` (ver la sección de Acciones masivas más abajo) — sin
eso, activar/desactivar en bloque quedaba fuera del historial.

**Pendiente de Felipe (producción):**

- [ ] **Aplicar las tres migraciones en producción** (las dos de A3 más
      `20260915223000_historial_producto_estado.sql` de B2, con el prefijo
      `retail.`, ver CLAUDE.md) y correr `pnpm datos:generar:produccion` +
      `pnpm datos:comparar` después. Hasta entonces el diccionario de
      `docs/datos/` no describe `historial_producto_cambios` ni el
      `p_producto_id` nuevo de `fn_movimientos`.
- [ ] **`packages/database/src/types.ts` se editó a mano** (el Postgres local es un
      checkout compartido entre 7 sesiones y no era seguro correr `db reset` para
      regenerar tipos). Cuando alguien corra `generate_typescript_types` contra una base
      estable con estas migraciones aplicadas, confirmar que coincide con lo escrito a
      mano y no queda una edición manual suelta.

## 🎯 Inventario en V2 — piso de venta / almacén de tienda (2026-09-14)

**Cerrado esta sesión, solo local** — `20260914210000_inventario_piso_almacen.sql`,
ver BITACORA de esa fecha para el diseño completo. `retail.stock` gana
`sububicacion_id`; las 12 funciones que tocan stock/conteos quedaron revisadas
una por una; `mover_interno()` es la reposición, reutilizable para cualquier
par de sububicaciones. Pantalla de Inventario rediseñada con tarjetas de
resumen, tabla piso/almacén/total/estado, buscador y filtros; POS y "Mover
mercadería" corregidos para no ofrecer stock que el RPC va a rechazar.

**Pendiente de decisión de Felipe:**

- [ ] **"Otras ubicaciones" al revisar una variante** (visibilidad de piso/total
      en las demás sedes) quedó fuera — el pedido lo marcó como "cuando sea
      útil", no como parte de esta fase. Es una consulta adicional sobre
      `getStockPorUbicacion`/`stock`, no un cambio de esquema.
- [ ] **Concurrencia de `mover_interno` verificada por diseño, no por prueba
      real con dos sesiones simultáneas**: el orden determinístico de lock
      (mismo criterio en las dos direcciones) se revisó en el motor
      (`fn_aplicar_movimiento`), pero no se forzó una carrera real de dos
      `psql` en paralelo. Si alguna vez aparece un deadlock real en reposición
      de piso, empezar por ahí.
- [x] **Compras (lectura): RLS de `compras`/`compra_items`/`compra_pagos`/
      `compra_adjuntos` sin candado de ubicación — decidido y aplicado en
      LOCAL el 2026-09-17.** Verificado con Micaela (integrante, Tienda
      Trujillo) contra una transacción de prueba (rollback, sin escribir
      nada): veía las 3 facturas de Taller y Tienda Lima antes del fix, 0
      después (solo la suya, cuando existe). Protocolo `/decide` con Felipe:
      acotar TODO a `fn_puede_operar_ubicacion`, igual que ventas/movimientos
      — no dejarlo compañía-completa ni partir lectura/escritura. Ver
      ADR-0076 y `supabase/migrations/20260917173000_compras_candado_de_sede.sql`.
      **Aplicado en producción el 2026-09-17** (Felipe, SQL Editor) —
      verificado después contra `pg_policies`/`pg_proc` de `cayla-dynamic`:
      idéntico a local. Registrado a mano en
      `supabase_migrations.schema_migrations` (pegar en el SQL Editor no lo
      hace solo).
      De paso, corregido un supuesto de la auditoría original del 09-14: el
      bypass de `0012_control_total_temporal.sql` ("cualquier persona
      activa") ya NO está vigente ni en local ni en producción —
      `0013`/`0016` lo reemplazaron por un chequeo real de rol de líder; el
      registro de compras (`fn_puede_registrar_compras`) ya era solo-líder,
      no hacía falta tocarlo — el hueco real era solo de lectura.
- [ ] **Catálogo:** si la misma auditoría de accesos del 2026-09-14 encontró
      el mismo patrón débil en tablas de catálogo (no solo Compras), sigue
      sin verificar ni tocar — esta sesión (2026-09-17) solo cubrió Compras.

---

**Auditoría completa 2026-09-03.** BITACORA.md y este archivo llevaban congelados
desde el 19-20 de julio, pero el repo tiene commits reales hasta el 23 de julio —
incluida una fase entera de "Unificación" (9 pasos + fixes) sin documentar en
ningún lado. Se cierra esa brecha aquí. Ver el hallazgo #1 de ARREGLAR: es el más
importante que ha entrado a este archivo desde que existe.

## 🎯 Productos en V2 — alta y edición de producto+variantes (2026-09-15)

**Cerrado esta sesión, solo local** — `20260915150001_catalogo_alta_edicion.sql`
(`catalogo_crear_producto`/`catalogo_actualizar_producto`), `/productos/nuevo`,
`/productos/[id]/editar`, `ProductoForm.tsx`. Ver BITACORA de esta fecha para el
diseño completo (por qué no reusa `crear_producto_con_variantes` de V1/producción,
por qué sin `security definer`, por qué el SKU se sugiere y no se le pide a la
persona).

**Pendiente — para que enchufen las sesiones en paralelo:**

- [ ] **Ajustar inventario (Sesión A2)** y **Ver historial (Sesión A3)**: la ficha
      de edición (`app/(app)/productos/[id]/editar/page.tsx`) deja dos huecos con
      `TODO(Sesión A2)`/`TODO(Sesión A3)` explícitos, debajo del form. Grep por esos
      literales para encontrarlos.
- [ ] **No hay pantalla para agregar un color desde el form de producto** — si
      falta un color durante el alta, hay que ir a Productos → Colores aparte
      (`/productos/colores`, ya existe) y volver. Aceptable por ahora (no lo pidió
      Felipe), pero es la fricción más probable en uso real.
- [ ] **Aplicar en producción** — sigue el patrón de siempre: prefijo `retail.` al
      pegar en el SQL Editor (nunca en el archivo), y correr
      `pnpm datos:generar:produccion` + `pnpm datos:comparar` después.

**Hallazgo de infraestructura, no de este módulo — para la próxima sesión de
planificación:** las 7 sesiones paralelas de esta tanda comparten un solo working
directory y un solo `git HEAD` (no worktrees aislados). Un `git checkout` de una
sesión mueve la rama activa para las otras seis, y un archivo generado compartido
(`packages/database/src/types.ts`) se truncó a 0 bytes a mitad de sesión por dos
`supabase gen types ... > src/types.ts` corriendo a la vez. Se resolvió sin perder
trabajo (rama nueva desde el commit vivo + commit acotado + `git branch -f`), pero
el próximo reparto de sesiones en paralelo debería usar worktrees separados
(`EnterWorktree`/`isolation: "worktree"`) en vez de un directorio compartido.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [x] **`20260915130000_produccion_del_taller` — resuelta la contradicción (2026-09-17
      tarde).** Consultado directo contra `information_schema`/`pg_proc` en `cayla-dynamic`
      (schema `retail`): `abrir_produccion`, `cerrar_produccion`, `set_etapa_produccion` y
      `revertir_produccion` **sí existen** en producción. `DiegoN` tenía razón, `main` no —
      Producción del Taller ya está aplicada y operable en producción, no hace falta pegar
      nada de esa migración de nuevo.
- [ ] **Producción, decisiones abiertas tras la matriz (2026-09-15, ADR-0050 §5):**
      (a) ¿atajo «Nuevo modelo» dentro de la orden que abra el flujo de Productos? Hoy
      Productos V2 no crea variantes desde pantalla (nacen por importación), así que el
      enlace de la matriz solo orienta. (b) ¿«tercerizado» se marca al abrir la orden o
      basta en la tarjeta? (c) `productos.material` de V1 no existe en V2 — solo si Felipe
      lo pide, y como cambio de catálogo, no de Producción.
- [ ] **Producción: lo que quedó fuera del paso 1.** (a) Movimientos muestra
      `produccion`/`reversion_produccion` como texto crudo, sin enlace a la orden.
      (b) V1 tenía `RecibirLoteForm` para que el Taller reciba mercadería sin factura;
      V2 lo cubre por Compras → Recibir — decisión de Felipe si el Taller necesita una
      entrada manual aparte de la corrida. (c) Una orden cerrada no se edita (solo
      revertir + volver a cerrar): revisar con el Taller si eso les alcanza.

- [x] **Migración `20260914210000_compras_resumen_por_vencer` sí está en
      producción** (verificado 2026-09-16 contra `vovjyyiafkxteijimpuy`:
      `retail.resumen_compras()` ya devuelve `por_vencer`/`por_vencer_monto`).

- [x] **Migración `20260914220000_compras_orden_por_creacion` sí está en
      producción** (verificado 2026-09-16: `retail.listar_compras` ya acepta
      `p_cursor_creado_en`).

- [x] **Rediseño de Compras (2026-09-14): verificado en navegador 2026-09-17 — encontró
      y arregló un bug real de layout que `tsc`/`eslint` no podían ver (ADR-0098).**
      `/compras/nueva` tenía Serie/Número/Fecha de emisión literalmente superpuestos
      (texto ilegible) entre 1024 y 1279px — la franja donde el panel "Resumen" se
      vuelve columna fija (`lg:` de Tailwind) pero la tarjeta del formulario todavía no
      tiene ancho de sobra. Arreglado: Serie+Número+Fecha pasan a una sola fila de 3
      columnas con `minmax(0,…)` (antes desbordaban su columna en vez de encogerse), y
      el breakpoint del layout de 2 columnas (+ el `sticky` del Resumen, que quedó
      huérfano al mover solo el primero) se corrió de `lg:` (1024px) a `xl:` (1280px) —
      a 1024px la tarjeta del documento no tiene espacio real para tres campos cómodos,
      sin importar cuánto se recorten. Verificado en 1024px, 1280px y 375px (móvil).
      `/compras` (chips, tarjeta "Por pagar" → `/compras/por-pagar?vencidas=1` con el
      panel abierto solo), `/compras/nueva` (buscar "falda" en Producto, Enter en el
      costo agrega línea nueva — confirmado), `/compras/por-pagar` ("Pagar" en la fila
      abre modal sin navegar) y `/compras/recibir` (tocar una factura arma la guía,
      curva de tallas con su propio scroll horizontal, sin desborde) — todo verificado.
      `tsc`, `eslint` y 297 pruebas en verde. Detalle completo, incluido el mismo
      defecto latente sin disparar todavía en `PLANTILLA_LINEAS` (líneas de factura) y
      en `ProductoForm.tsx` (sesión de Catálogo, no tocado acá), en ADR-0098.
      - [ ] **Sin probar en esta pasada:** "+ Sumar" (sumar otra factura del mismo
            proveedor a la misma guía), "Todo llegó", y el caso "barra fija choca con
            las pestañas móviles" en `/compras/recibir` (el número a ajustar, si pasa,
            es `bottom-[calc(4.25rem+…)]` en `RecepcionCompraFormV2.tsx`).
      - [ ] `PLANTILLA_LINEAS` (línea 36 de `CompraFormV2.tsx`) tiene el mismo patrón sin
            `minmax(0,…)` que causó el bug de arriba — no se ha disparado porque sus
            columnas fijas (24rem) son más anchas que el desborde que lo dispara, pero
            sigue latente. Vale una pasada dedicada.

- [ ] **Importador de catálogos de clientes con IA — el estándar universal ya está
      puesto, falta el importador encima.** Construido y verificado hoy (ADR-0030):
      migración `0052`, `scripts/taxonomia/cargar.mjs`, 1.849 categorías y 10.216
      valores de la Shopify Product Taxonomy v2026-08 en local, motor de anclaje
      en dos pasadas (`lib/taxonomia/anclar.ts` puro y testeado +
      `anclar-ia.ts`), endpoint `POST/PUT /api/taxonomia/anclar` (propone / guarda,
      nunca en un solo paso) y pantalla `/inventario/taxonomia`.
      **Bloqueado por lo mismo que todo lo demás de IA: no hay `ANTHROPIC_API_KEY`
      en el entorno.** Sin ella el endpoint responde 503 con el mensaje que lo
      explica, y el anclaje de los 30 colores y 32 categorías de CAYLA nunca se ha
      ejecutado — o sea que la calidad real de las propuestas del modelo todavía no
      se ha visto. Va en `.env.local` y también en Vercel (Production y Preview),
      **sin** prefijo `NEXT_PUBLIC_`, igual que `PADRON_TOKEN` y `LUCODE_TOKEN`.
      Lo que falta después, en orden (plan completo aprobado por Felipe): leer el
      archivo del cliente sin IA (`.xlsx` con `exceljs`, `.csv`, Google Sheets por
      URL) → llamada 1 que infiere el plan de mapeo de columnas → llamada 2 que
      ancla los valores distintos y siembra el vocabulario propio del cliente con
      SUS nombres → RPC `importar_catalogo` transaccional (llamar
      `crear_producto_con_variantes` 900 veces son ~5 minutos de round-trips a São
      Paulo, ADR-0013) + tabla `importaciones` + deshacer por `estado` →
      carril PDF/foto que produce la misma tabla y entra al mismo motor → aviso de
      versión nueva del estándar. Costo estimado ~$0.17 por cliente con Opus 5 y la
      taxonomía cacheada, contra ~$5.85 si se le mandaran las 3.000 filas al modelo:
      la regla es que **la IA compila el mapeo, no procesa las filas**.

- [ ] **`0052` no está en producción.** Se aplicó y verificó solo contra el
      Postgres local. Pegarla en el SQL Editor de producción requiere el prefijo
      `retail.` (CLAUDE.md §"Cómo aplicar SQL a producción") y es un cambio de
      esquema en producción, o sea decisión de Felipe. El seed de la taxonomía
      (`supabase/seed-taxonomia/*.sql`, ~1.5 MB, gitignored) se regenera con
      `node scripts/taxonomia/cargar.mjs` y lleva su propio `set search_path`.

- [x] **`20260914200000_compras_multipago` sí está en producción** (verificado
      2026-09-16: `retail.registrar_pagos_compra` existe).

- [x] **`20260914190000_compras_total_del_papel` sí está en producción**
      (verificado 2026-09-16: `retail.registrar_compra` ya acepta `p_total` y el
      check `compras_total_cuadra` existe).

- [x] **`20260914180000_compras_adjuntos` sí está en producción** (verificado
      2026-09-16: tabla `retail.compra_adjuntos`, RPCs `registrar_adjunto_compra`/
      `archivar_adjunto_compra` y el bucket `retail-compras-adjuntos` existen).
      **La subida real sigue sin probarse de punta a punta** (Storage local
      apagado) — eso no lo confirma una consulta a `information_schema`.

- [x] **`20260914150000_proveedores_administrables` sí está en producción**
      (verificado 2026-09-16: `retail.registrar_proveedor`/`actualizar_proveedor`/
      `desactivar_proveedor`/`reactivar_proveedor` existen).

- [x] **`20260914160000_igv_solo_en_factura` sí está en producción** (verificado
      2026-09-16: check `compras_igv_solo_factura` existe en `retail.compras`).

- [ ] **`gen-types` sigue apuntando al proyecto viejo y ahora hay drift real
      medido.** `packages/database/package.json` usa `--project-id
      vovjyyiafkxteijimpuy` (producción). Generar desde local —lo natural cuando
      las tablas nuevas solo existen ahí— **borra** `catalogo_con_stock`,
      `configuracion_empresa`, `sede_meta`, `sede_datos_fiscales`,
      `persona_actual` y `puede_operar_sede`, que existen en producción y no en
      local. Hoy los 5 tipos de taxonomía y las 2 columnas de anclaje se
      insertaron a mano por eso. Mientras el drift exista, regenerar a ciegas
      rompe la app: hace falta decidir cuál de los dos entornos es la fuente.


- [x] **`almacen interno`: aplicado y verificado en producción 2026-09-03 —
      backend completo, frontend adaptado, falta la prueba en vivo por Felipe.**
      "Recibir mercadería" era el único camino para crear un producto y no
      tenía a dónde escribir (la unificación nunca recreó las sedes-almacén
      TRU-ALM/AQP-ALM/LIM-ALM del retail original). Decisión: el almacén deja
      de ser una sede hermana — pasa a ser un contenedor `tipo='almacen'`
      dentro de la misma sede + tabla `retail.stock_almacen` aparte.
      `supabase/unificacion/12_almacen_interno.sql` pegado y verificado: 4
      contenedores (TRU/AQP/003/LIM, CCO sin ninguno — confirmado con
      `select` real). Las 3 funciones que reescribe (`fn_aplicar_movimiento`,
      `recalcular_stock`, `puede_operar_sede`) se verificaron byte por byte
      contra producción ANTES de pegar, no se asumieron. Frontend actualizado
      en 7 archivos (`inventario/recibir`, `RecibirLoteForm`,
      `inventario/almacen`, `AlmacenStockList`, `BajarATiendaModal`,
      `inventario` catálogo, `InventarioAgrupado`) — ya no buscan una sede
      `tipo='almacen'`, usan el contenedor de la propia sede. Tipos de
      `packages/database` regenerados contra el proyecto correcto
      (`--project-id` de cayla-DYNAMIC, `--schema retail`) — el script de
      `gen-types` en `package.json` sigue apuntando al proyecto viejo de
      retail y hay que corregirlo a mano la próxima vez (ver ítem de tipos
      abajo). **Sin decidir todavía:** si lo terminado del Taller (LIM) debe
      pasar por el almacén interno (con su propio "bajar a piso") o seguir
      directo al piso como hoy — su contenedor ya existe, pero
      `registrar_produccion`/`cerrar_produccion` no lo usan. Y "Devolver a
      almacén" (piso → almacén) quedó con su RPC (`retail.devolver_a_almacen`)
      pero sin conectar en el frontend — pregunta de UX abierta con Felipe
      (¿botón propio, o dentro de `MovimientoModal`?). **Falta lo único que
      de verdad lo cierra: que Felipe entre un producto real por la pantalla
      y confirme que aparece.**
- [x] **RESUELTO (verificado 2026-09-09: `npx tsc --noEmit` sale con exit 0 y
      `next build` compila las 28 rutas). Se arregló en algún momento entre el
      03-09 y hoy sin que nadie lo anotara — mismo patrón que el ítem de
      "no hay registro de qué corrió" de más abajo, pero en el código. Texto
      original abajo, como quedó registrado el 2026-09-03:**
      **`tipos de TypeScript`: regenerar contra el proyecto correcto sacó a la
      luz 30 errores en 14 archivos que nadie tocó hoy — deuda real, no
      ruido de esta sesión.** `retail.sedes`/`retail.personas` son VISTAS
      (join contra `public` de Dynamic) — Postgres no le garantiza a Supabase
      que sus columnas nunca sean nulas, así que el tipo real es
      `string | null` donde el proyecto viejo (con el que se generaban los
      tipos hasta hoy) decía `string`. Afecta `finanzas/*`, `produccion/page.tsx`,
      `producto/[varianteId]/page.tsx`, `layout.tsx`, `actions/sede.ts`,
      `api/export/inventario`, `PatrimonioEditor.tsx`, `lib/finanzas-nucleo.ts`,
      `lib/panel.ts`, `lib/persona.ts`, `lib/sedes.ts` — ninguno tocado en esta
      sesión. `next build` (sin `ignoreBuildErrors` en `next.config`) fallaría
      hoy con estos 30 errores. Necesita su propia sesión, revisando caso por
      caso si el `null` es real (¿puede una sede no tener código?) o si basta
      con filtrar/asegurar como se hizo en `inventario/page.tsx` esta sesión.
      Aparte: `packages/database/package.json` (`gen-types`) sigue apuntando al
      proyecto viejo de retail — corregirlo al de Dynamic + `--schema retail`
      para que esto no se repita.
      **CERRADO 2026-09-09.** Se regeneraron los tipos contra el proyecto
      correcto (`vovjyyiafkxteijimpuy`, `--schema retail`) al empezar
      `lib/conteo.ts`, que no compilaba porque los tipos no conocían `conteos`,
      `conteo_lineas`, `codigos_barras` ni `colores`. De los 30 errores quedaba
      **uno solo**: las otras sesiones limpiaron 29 hoy con la auditoría de
      lecturas. Era `api/lucode/emitir/route.ts:167`, mandando `null` a un
      parámetro que supabase-js tipa opcional (`string | undefined`) porque la
      función tiene default; se cambió a `undefined`, que deja a Postgres
      aplicar ese default. Y se corrigió el `gen-types` para que apunte al
      proyecto de Dynamic con `--schema retail`. `tsc --noEmit` limpio,
      `pnpm build` compila, 79 tests pasan.
- [ ] `catalogo real`: cargar los 300-900 SKUs físicos — el desbloqueador más grande
      que queda. **Cambió de estrategia el 2026-09-09: deja de ser captura gradual
      y pasa a ser un CENSO de una vez.** El plan de `PLAN-DE-TRABAJO.md` §5 ("es
      un ritmo, no un evento") llevaba dos meses sin moverse, y tiene un defecto
      que explica por qué: mientras el catálogo esté a medias, "stock dice 0" es
      ambiguo (¿se agotó, o nunca se capturó?), así que ninguna alerta ni clase
      ABC es confiable, nadie usa el sistema, y nadie lo llena. El censo rompe el
      círculo: desde el día X, 0 significa cero.
      **Decisiones de Felipe (2026-09-09):** solo el piso de las 3 tiendas (no la
      trastienda); costo por modelo, no por talla/color; código corto nuevo
      (`BLU-0042-AZM-M`); las Encargadas cuentan y Felipe aprueba al cerrar el
      conteo. Y el dato que más cambia el diseño: **casi todas las prendas ya
      traen código de barras de fábrica**, así que el censo escanea desde el
      minuto uno en vez de imprimir y pegar 900 etiquetas primero.
      Plan completo en `~/.claude/plans/analiza-el-modulo-de-cached-jellyfish.md`.
      **Avance:** bloques 0 y 1 hechos y verificados en local (ver los dos ítems de
      abajo). Faltan: colores (vocabulario cerrado), códigos + `codigos_barras`,
      conteos, y las pantallas de captura por matriz y de conteo.
      **Consecuencia operativa del alcance que hay que decirle al equipo:** como
      no se cuenta la trastienda, `stock_almacen` queda en 0 y "Bajar a tienda"
      va a fallar por stock insuficiente. Lo que baje de atrás entra como
      "Recibir", no como "Bajar a tienda".
      **Corrección 2026-09-18 — esta entrada quedó desactualizada por las sesiones
      paralelas del 16/17-sep; auditado el código real, no lo que decía este
      archivo.** De los 5 bloqueadores que decía que faltaban, **4 ya están
      completos en producción**: colores (proponer/aprobar/rechazar/reactivar,
      `ColoresLista.tsx`), códigos + `codigos_barras` (tabla desde `0002_esquema.sql`,
      código corto autogenerado por trigger al crear variante), conteos (abrir/
      contar/cerrar/anular, `ConteoPanel.tsx` + `lib/conteos.ts`, escaneo directo) y
      la matriz talla×color con costo por modelo en `/productos/nuevo`.
      **La 5ª brecha (alta de prenda al vuelo durante el conteo) se cerró el
      mismo 2026-09-18 (ADR-0099):** `censo_crear_variante` (sin el candado
      de Líder de `crear_producto_con_variantes`) + `estado_alta` proponer/
      aprobar en `productos` (mismo mecanismo que colores/tallas/tejidos/
      patrones/etiquetas) + banner de revisión en `/productos` y `/productos/
      [id]/editar`. Probado de punta a punta en navegador local: escanear un
      código desconocido en pleno conteo, crear la prenda sin salir de la
      pantalla, contarla, y que el Líder la vea pendiente y la apruebe.
      `tsc`/lint/297 tests en verde. **`20260918020000_censo_alta_al_vuelo.sql`
      aplicada y verificada en producción 2026-09-18** (columnas + 2 funciones
      + 1 trigger confirmados contra `information_schema`/`pg_proc`).
      Aparte, sigue sin construirse una pantalla de impresión de etiquetas
      propias (`Codigo128.tsx`/`codigo128.ts` existen pero no los importa
      nadie) — no bloquea el censo (Felipe ya decidió escanear código de
      fábrica), pero quedó huérfano si algún día hace falta.
- [x] **`almacen interno en el riel numerado` — hecho y verificado en local
      2026-09-09 (`0044_almacen_interno.sql`); falta pegar `unificacion/26` en
      producción.** `stock_almacen`, el contenedor `tipo='almacen'`,
      `bajar_a_piso` y `devolver_a_almacen` solo existían en producción desde el
      3-sep, así que `npx supabase db reset` dejaba una base local donde
      `catalogo.ts:47` consultaba una tabla inexistente. Y apareció la deriva
      inversa: `unificacion/12` reescribió `fn_aplicar_movimiento` partiendo de un
      cuerpo anterior a `0011` y **perdió `ultima_venta`** — en producción la
      columna existe y nadie la escribe, así que "Días sin venta" mide la edad de
      la variante desde que se creó y todo el catálogo aparece estancado para
      siempre. `unificacion/26_ultima_venta_en_aplicar_movimiento.sql` la restaura
      y hace backfill desde `movimientos`. **Pendiente de Felipe: pegar `26` en el
      SQL Editor de producción, ANTES que `27`.**
- [x] **`el ajuste lleva signo` — hecho y verificado en local 2026-09-09
      (`0045_ajuste_con_signo.sql`, ADR-0023); falta pegar `unificacion/27`.**
      Era imposible registrar un conteo MENOR a lo que dice el sistema: la rama
      `ajuste` proponía la fila con el delta y Postgres evalúa el CHECK sobre la
      fila propuesta — el mismo bug de ADR-0020, a cincuenta líneas de la función
      que ese ADR daba por segura. Y producción **nunca tuvo**
      `stock_cantidad_no_negativa`, así que allá no habría explotado: habría
      creado stock negativo en silencio. Se arregla con
      asegurar→bloquear→verificar→sumar bajo `for update`, y se ponen las tres
      redes que faltaban (`stock`, `stock_almacen`, y `movimientos.cantidad <> 0`
      con signo solo para el ajuste). **Pendiente de Felipe: correr el pre-flight
      de `unificacion/27` y LEERLO antes de aplicar** — si hay filas negativas o
      movimientos en cero, se miran una por una y se corrigen con movimientos,
      nunca borrando.
- [x] **`vocabulario cerrado de colores` — hecho y verificado en local 2026-09-09
      (`0046_colores.sql`, ADR-0024); falta pegar `unificacion/28`.** 29 colores
      aprobados por Felipe, con índice único sobre el nombre normalizado: la base
      rechaza "azul marino" si ya existe "Azul marino". Es la pieza con mayor
      costo de postergación del proyecto — unificar colores después del censo no
      es un `update` de texto, es fusionar variantes con stock e historial. NO se
      hizo tabla de tallas, a propósito: agregarla tarde es barato (no es FK de
      nada), agregar colores tarde es caro.
- [x] **`código corto + codigos_barras` — hecho y verificado en local 2026-09-09
      (`0047_codigos.sql`, ADR-0025); falta pegar `unificacion/29` DESPUÉS de la
      `28`.** `BLU-0042-AZM-M` al lado del SKU, que no se toca. El argumento no es
      estético: `EtiquetasGenerator` estira el Code 128 al ancho de la etiqueta,
      así que 40 caracteres dan 1.2 puntos por módulo a 300 dpi cuando la regla
      térmica es ≥3 — **ésa es la razón real de que la pistola a veces no lea**.
      Más `variantes_identidad_unica`, que impide que 4 personas creen la misma
      prenda 4 veces. Y `codigos_barras` (varios códigos → una prenda), que como
      casi todas las prendas ya traen código de fábrica convierte el censo en
      "escanear lo que está en la percha" en vez de "pegar 900 etiquetas primero";
      el backfill registra el `sku` viejo, así que las etiquetas ya impresas
      siguen funcionando. **Pendiente de Felipe: los TRES pre-flight de
      `unificacion/29`** (categorías que el archivo no conoce, variantes
      duplicadas, SKUs repetidos). Si el de duplicados devuelve filas, se resuelve
      una por una — nunca borrando.
- [x] **`sesiones de conteo` — hecho y verificado en local 2026-09-09
      (`0048_conteos.sql`, ADR-0027); falta pegar `unificacion/30` al final de la
      cola.** Dos tablas y siete RPC. Un conteo que puede crear prendas al vuelo
      es un censo; un censo sobre un catálogo cargado es un conteo — la misma
      operación, así que no hay código de "carga inicial" que se abandone.
      `cantidad_sistema` se congela AL CONTAR (si se vende algo entre contar y
      cerrar, la venta sobrevive; leyendo el sistema al cerrar se borraría).
      `ajuste` con signo en vez de un `tipo='conteo'` nuevo, porque
      `recalcular_stock` conoce cuatro tipos y un quinto quedaría excluido en
      silencio. **Verificado con una Encargada real:** abre, crea la prenda
      adoptando su código de fábrica, cuenta 4 — y al cerrar recibe "Solo un líder
      puede cerrar un conteo". El stock quedó en 0 hasta que el Líder cerró.
- [x] **CERRADO 2026-09-10 — `censo`: las pantallas.** El ítem estaba viejo: al auditarlo el
      2026-09-10 resultó que la proyección delgada (`getCatalogoParaConteo`, 6 columnas en
      vez de 1,1 MB) y la pantalla de conteo con pistola ya existían desde `ab479ba`.
      **Cerrado hoy: el cierre del conteo** — `/inventario/conteo/cerrar`, con la varianza
      valorizada en soles, el aviso de lo que nadie contó, y las dos decisiones de la Líder
      (cerrar / anular). Era el agujero que dejaba el módulo entero sin servir: la pantalla
      de conteo prometía "lo contado no entra al inventario hasta que la Líder cierra" y
      `cerrar_conteo` no estaba cableada en ninguna parte.
      **CERRADO TAMBIÉN el alta repetida, y no como se había planeado.** El backlog pedía una
      MATRIZ talla × color; al mirarlo de cerca se descartó y se hizo otra cosa, por dos
      razones. (1) `conteo_crear_variante` siempre termina llamando a `conteo_contar`, así que
      crear las 12 celdas de golpe metería 11 líneas «contadas: 0» al conteo — en el cierre eso
      significa «miré y no había», que es una afirmación, no un vacío. (2) El dolor real no era
      declarar 12 celdas: era que la segunda talla del mismo modelo pedía otra vez los siete
      campos. Se implementó **recordar el modelo**: la siguiente alta pide talla, color y
      cantidad, y nada más.
      **Y de paso destapó un defecto que el censo habría golpeado en la prenda nº 2:**
      `AltaEnConteo` nunca pasaba `p_producto_id`, así que declarar la talla M y después la L
      de la misma blusa creaba DOS productos con la misma referencia y dos códigos cortos
      distintos — y el código corto es lo que va impreso en la etiqueta y lo que agrupa el
      catálogo por modelo. Recordar el modelo es lo que lo impide.
      (Etiquetas en lote quedó fuera del alcance del censo: esa pantalla es de la sesión de QR.)
- [x] **CERRADO 2026-09-10 — LA `33` YA ESTÁ EN PRODUCCIÓN. No queda ninguna migración
      pendiente de pegar.** Aplicada desde la sesión a pedido de Felipe (autorización
      explícita: "aplícala tú"), y verificada en la misma base, no por suposición:
      `la_33_aplicada = true` buscando `v_color_id := nullif(trim(p_color_codigo)` en el
      cuerpo, **una sola firma viva** de 12 argumentos (no se creó sobrecarga, que era el
      riesgo del ADR-0009), e idéntica a la de local argumento por argumento.
      **Se corrió con `execute_sql`, NO con `apply_migration`, y el motivo importa:**
      `apply_migration` habría escrito una fila en `supabase_migrations.schema_migrations`
      del proyecto de Dynamic — el historial de ELLOS, no el nuestro —, y una versión
      fantasma ahí puede romperle el `db push` a quien mantenga Dynamic. `unificacion/`
      se pega, no se registra; eso es justo lo que dice CLAUDE.md.
      **Única divergencia, cosmética y anotada para que nadie la investigue después:** el
      comentario del arreglo quedó en producción sin las flechas `↓↓↓` del archivo del
      repo. El código es idéntico; el marcador que usan las auditorías es la línea de
      código, no el comentario. Texto original abajo:**
      **FALTA UNA SOLA, LA `33` — verificado contra producción 2026-09-10.** Inventario leído de la base y pasado por `migraciones:verificar`:
      la `27`, `28`, `29`, `30`, `31` y `32` **están aplicadas**. Comprobado objeto por
      objeto, no por documento: existen `colores` (30 filas, con `ARN` de la 32),
      `codigos_barras`, `codigos_correlativos`, `conteos`, `conteo_lineas`; hay **0
      funciones sobrecargadas** en `retail` (o sea la 31 corrió); y las 37 categorías
      están. **La única pendiente es `unificacion/33_conteo_color_vacio.sql`:**
      producción tiene todavía la `conteo_crear_variante` de la `30`, confirmado
      buscando `v_color_id := nullif(trim(p_color_codigo)` en el cuerpo de la función
      — no está. Es un `create or replace` de una sola función, con la MISMA firma de
      12 argumentos (no crea sobrecarga) y **no toca ni una fila**.
      **BLOQUEO DE ORDEN:** pegarla ANTES de desplegar la pantalla de conteo. Sin ella,
      crear una prenda al vuelo dejando el color vacío revienta — el formulario manda
      `''` y la versión vieja solo contempla `null`. Es exactamente el bug que `0051`
      arregló en local hoy.
      **Dos avisos que salieron del mismo barrido y NO bloquean:** (a) el verificador
      marca `unificacion/01_sedes.sql` como incompleto por `retail_sede_meta` — falsa
      alarma, la tabla vive en `retail.sede_meta`, se movió de schema en la
      unificación; (b) la sobrecarga de `fn_set_meta_cobertura` que reporta es de
      `public`, o sea de Dynamic, no nuestra. Texto original abajo:**
      **Pegar en producción `27` → `28` → `29` → `30`, en ese orden.** Estado real
      de producción **verificado contra la base el 2026-09-09** (no contra estos
      documentos, que decían otra cosa): la `25`, la `26` y la `31` **ya están
      aplicadas** — el encabezado de ADR-0020 decía que la 25 estaba pendiente
      cuando su propio cuerpo dice que se aplicó, y nadie había registrado que la
      26 ya se pegó. Faltan solo esas cuatro.
      Cada una depende de la anterior: la 29 arma el código de cada prenda con el
      código de color que crea la 28, y la 30 no puede registrar un conteo hacia
      abajo sin el ajuste con signo de la 27.
      **Los siete pre-flight se corrieron contra producción y dieron todos 0**
      (stock negativo, stock_almacen negativo, movimientos en cero, movimientos
      negativos que no son ajuste, categorías desconocidas, variantes duplicadas,
      SKU repetidos). Las 37 categorías calzan exactas con los prefijos de la 29.
      No hay nada que limpiar antes: se pueden pegar seguidas.
      Guía paso a paso con el SQL listo para copiar:
      `~/AppData/Local/Temp/.../scratchpad/falta-pegar.html`, publicada como
      artifact "Lo que falta pegar".
- [ ] **Dos colores escritos a mano que no calzan con los 29.** Los va a destapar
      la `28` en cuanto se pegue: **"Arena"** (3 variantes) y **"azul"** a secas
      (2 variantes) — 5 de las 19 variantes de producción. Arena es un color real
      del catálogo de CAYLA y probablemente convenga agregarlo (`ARN`, familia
      tierra); "azul" hay que decidir si es marino o claro. Mientras no tengan
      color resuelto, esas 5 variantes **no reciben código corto** — es
      deliberado (ADR-0025: el código no se inventa), y en cuanto se les asigne
      color, `retail.fn_asignar_codigo_variante` se los da.
- [ ] **`reemplazo total de Alegra` (antes "finanzas F3") — proyecto propio con
      plan de 8 fases aprobado (Fase 0.5 sumada después). Fase 0 CERRADA Y
      CONFIRMADA EN PRODUCCIÓN 2026-09-05; Fase 0.5 en construcción.** Felipe
      decidió reemplazar Alegra por completo (facturación + contabilidad +
      gastos + ingresos + resumen ejecutivo), no solo conectar SUNAT. Plan
      completo en `~/.claude/plans/cozy-gathering-nova.md`.
      **Corrección importante (ADR-0005, actualizado 2026-09-05):** el
      proveedor de transmisión SUNAT NO es Nubefact — es **Lucode**
      (`app.apisunat.pe`), con quien Felipe ya tenía relación comercial y
      credenciales de sandbox emitidas; más barato que Nubefact (S/30/mes vs
      S/70/mes al mismo volumen). El mecanismo es tercerización **PSE** (sí es
      término oficial SUNAT — la investigación original se equivocó en eso),
      no homologación OSE: CAYLA sigue como "SEE - Del Contribuyente" pero
      autoriza a Lucode a transmitir en su nombre. **Trámite pendiente, hace
      Felipe, no requiere código:** alta como PSE tercero en SUNAT SOL
      (RUCs GIOR TECHNOLOGY `20515809822` / VIDA SOFTWARE `20600337832`, fecha
      de inicio mañana o posterior — SUNAT no permite el mismo día). Mientras
      no se dé de alta, no se puede transmitir en producción aunque el código
      esté listo.
      **Fase 0 (ADR-0007) — verificada en producción:** `17_facturacion_completa.sql`
      pegado; confirmado con `pg_proc`/`information_schema.tables` que las 6
      funciones y las 3 tablas (`comprobantes`, `series_comprobantes`,
      `proformas`) existen. Proforma en tabla separada (nunca se "promociona"
      con UPDATE), NC/ND con referencia obligatoria a un comprobante aceptado
      (CHECK + trigger), `nota_debito` agregado.
      **Fase 1 (Lucode, ADR-0009) — construida y verificada en local, falta
      producción + credenciales:** `comprobantes.items jsonb` (con fallback
      genérico si `ComprobantesPanel.tsx` no manda desglose — el desglose real
      por SKU queda pendiente de conectar Facturación a `ventas`, decisión de
      UX de Felipe), adaptador `apps/web/lib/lucode.ts`, ruta
      `/api/lucode/emitir`, botón "Transmitir" visible en comprobantes
      pendiente/rechazado. Local: `0037_comprobantes_items.sql` +
      `0038_actualizar_transmision_comprobante.sql`. Producción:
      `supabase/unificacion/20_comprobantes_items.sql` +
      `21_actualizar_transmision_comprobante.sql` — **aplicadas en producción
      el 2026-09-08**, junto con `22_serie_numero_inicial.sql` (ver BITÁCORA
      de ese día; el texto de abajo quedó como se escribió el 05-09).
      **Pendiente, ambos bloquean la prueba real:** (1) ~~que Felipe pegue esas
      dos migraciones en el SQL Editor de producción~~ **hecho 2026-09-08**;
      (2) que Felipe ponga su
      `LUCODE_TOKEN` real en `.env.local` (`LUCODE_ENTORNO=sandbox`) — nunca en
      el chat. Sin eso el botón responde "sin_credenciales", sin riesgo de
      transmitir a medias. Independiente del código: el trámite SUNAT SOL de
      alta como PSE tercero (línea de arriba) sigue sin confirmarse hecho —
      bloquea sandbox→producción real aunque el código esté listo.
      **ACTUALIZACIÓN 2026-09-05 (noche) — transmitir a producción YA FUNCIONA,
      verificado con documentos reales.** Sandbox: boleta **B005-000001**
      (S/189.90) ACEPTADA con CDR. Producción: boleta **B004-000001** (TRU,
      S/1.00) transmitida y aceptada en cola por SUNAT (PENDIENTE, firmada, con
      PDF). El token de Lucode autentica igual en ambos ambientes. Tres cosas
      que esto deja pendientes: (1) **dar de baja B004-000001** desde el panel
      de Lucode (resumen diario de bajas, 7 días) — es un documento legal por
      una venta que no existió, y el sistema todavía no sabe anular; (2) al
      configurar la base definitiva, registrar la serie **B004 de TRU con
      próximo número 2** — ese correlativo ya está consumido ante SUNAT y
      arrancar en 1 hace que rechace todo por duplicado; (3) pegar
      `supabase/unificacion/22_serie_numero_inicial.sql`, que es lo que permite
      fijar ese próximo número (antes la serie siempre nacía en 1). Numeración
      acordada con Felipe: una serie por tienda — **TRU B004/F004, AQP B005/F005,
      LIM B006/F006**. Nota de seguridad: el `LUCODE_TOKEN` terminó pegado en el
      chat pese a la advertencia de arriba; conviene rotarlo desde el panel.
      **ACTUALIZACIÓN 2026-09-09 — la pantalla decía que SUNAT no estaba
      conectado.** El modal de emisión seguía con el texto de la Fase 0 ("el
      envío a SUNAT todavía no está conectado — ver SEE propio vs. OSE"), falso
      desde el 05-09 y apuntando a una decisión que ya no existe (es Lucode
      como PSE, ADR-0005). Corregido: ahora dice que Emitir reserva el número y
      que "Transmitir" es lo que lo manda. `ARQUITECTURA.md` repetía la misma
      afirmación y nunca había documentado `/api/lucode/emitir` ni
      `actualizar_transmision_comprobante` — agregados. El bloqueo real no era
      ese texto sino las variables de Lucode que faltan en Vercel (ítem propio
      más abajo, 2026-09-08).
      **PASO (a) HECHO 2026-09-09 — ADR-0015, el ambiente entra al comprobante.**
      `comprobantes.entorno_transmision` + `p_entorno` obligatorio en la RPC:
      un comprobante transmitido al sandbox ya no se guarda igual que uno real,
      y la pantalla lo dice ("Aceptado · prueba"). Cierra dos agujeros: el chip
      verde que no distinguía, y una nota de crédito real colgada de una boleta
      de prueba (`emitir_nota` solo exige que el original esté aceptado).
      **Falta correr el SQL:** `0040_comprobante_entorno_transmision.sql` en
      local (necesita Docker arriba) y `unificacion/23_...` en el SQL Editor de
      producción. Ojo al pegar: dropea la firma de 4 parámetros antes de crear
      la de 5, si se salta ese paso quedan dos sobrecargas.
      **Sigue (b):** variables de Lucode en Vercel — recomendado `LUCODE_TOKEN`
      en los tres ambientes pero `LUCODE_ENTORNO=produccion` SOLO en Production
      (sandbox en Preview y Development), para que ningún preview emita algo
      legal por accidente. **Sigue (c):** anulación dentro del sistema
      (`anularDocumentoLucode` ya existe en el adaptador, sin ruta ni botón, y
      la RPC rechaza `anulado` a propósito).
      **PASO (c) HECHO 2026-09-09 — ADR-0016, anulación dentro del sistema.**
      Ruta `/api/lucode/anular` + RPC `anular_comprobante` (solo líder, motivo
      obligatorio, `anulado_por`) + botón en la fila. Dos caminos según tipo,
      como exige SUNAT: `/api/v3/voided` para factura/notas,
      `/api/v3/daily-summary` con `accion_resumen: "anular"` para boletas
      (verificado en `docs.apisunat.pe/llms-full.txt`). "Anulado" solo se
      escribe con confirmación de SUNAT; si vuelve PENDIENTE la fila dice
      "Anulación en trámite". **Falta correr el SQL** (`0041_anular_comprobante.sql`
      local / `unificacion/24_...` producción) **y probar la llamada real en
      sandbox** — el nombre del campo `motivo` en /voided y la forma de la
      respuesta del resumen diario salen de la documentación, no de una
      respuesta real. Abierto: cerrar solo el ciclo de una anulación en trámite,
      y qué hacer con un correlativo reservado que nunca se transmitió.
      **Queda solo (b):** `LUCODE_TOKEN` y `LUCODE_ENTORNO` en Vercel —
      `produccion` SOLO en Production, `sandbox` en Preview y Development.
      **SQL DE (a) Y (c) CORRIDO Y PROBADO EN LOCAL 2026-09-09.** `db reset`:
      las 41 migraciones aplican en orden, las dos restricciones quedan
      `VALIDADO` y `actualizar_transmision_comprobante` tiene una sola firma
      (sin sobrecarga). Siete reglas probadas contra Postgres real. **Falta
      pegar en producción `unificacion/23_...` y `24_...`** (en ese orden; la
      24 depende de la 23), y probar la llamada real a Lucode en sandbox.
      **Hallazgo nuevo — el local de la app no es el local del repo:** corren
      dos stacks, `cayla-retail` (54421/54422) y `cayla-dynamic` (54321/54322),
      y `apps/web/.env.local` apunta al de Dynamic, cuyo schema `retail` no
      tiene `comprobantes`/`series_comprobantes`/`proformas`. Mientras siga
      así, ninguna pantalla de Facturación se puede verificar en navegador
      local. Decidir cuál de los dos es "el local" de este repo y dejarlo
      escrito — hoy `supabase db reset` administra uno y la app lee el otro.
      **CERRADO 2026-09-09 (final de la jornada):** ya no leen distinto —
      `apps/web/.env.local` dice `:54421` y el bundle que sirve el `:3000` vivo
      confirma `:54421`. "El local de este repo" es `cayla-retail`, escrito en el
      README y comprobable con `pnpm local:donde`.
      **(a) Y (c) EN PRODUCCIÓN 2026-09-09.** `unificacion/23` y `24` pegadas y
      verificadas: una sola firma de `actualizar_transmision_comprobante` (5
      args), las 6 columnas nuevas, `comprobantes_anulado_tiene_motivo` en
      VALIDADO. **Dos cosas quedan abiertas de esto:** (1)
      `comprobantes_transmitido_tiene_entorno` quedó NOT VALID porque
      producción tenía **B004-000002** (boleta S/10.00, aceptada 08-09, ambiente
      DESCONOCIDO) — mirar el panel de Lucode, escribir el ambiente real y
      recién ahí `validate constraint` (SQL exacto en ADR-0015); (2) la llamada
      real a Lucode de anulación sigue **sin probarse en sandbox**: el nombre
      del campo `motivo` en /voided y la forma de la respuesta del resumen
      diario salen de la documentación, no de una respuesta real.
      **Corrección al dato del backlog:** `retail.comprobantes` NO estaba vacía;
      la serie **B004 de TRU va por el número 3**, no el 2 que decía arriba.
      **(b1) HECHO 2026-09-09 — anulación PROBADA contra el sandbox real.**
      Encontró y corrigió dos bugs del adaptador que la documentación tapaba:
      ninguno de los dos endpoints acepta el cuerpo plano. Boleta va con
      `{documento:"resumen_diario", documentos_afectados:[…]}` y factura con
      `{documento:"comunicacion_baja", motivo, documento_afectado:{…}}`. Los dos
      devuelven PENDIENTE, así que "Anulación en trámite" es el camino normal
      de TODA anulación, no solo de boletas (ADR-0016).
      **BLOQUEO DE ORDEN, importante:** el deploy vivo llama a
      `actualizar_transmision_comprobante` con 4 argumentos y producción ya
      solo tiene la de 5. **No poner `LUCODE_TOKEN` en Vercel antes de
      desplegar el código**, o "Transmitir" mandaría el documento a SUNAT y
      fallaría al guardarlo. Orden: push → deploy → token.
      **Falta (b2):** `LUCODE_TOKEN` en Vercel, `LUCODE_ENTORNO=produccion` SOLO
      en Production y `sandbox` en Preview/Development.
      **Falta también:** cerrar el ciclo de una anulación en trámite
      (`consultarEstadoLucode` → promover a `anulado`); hoy queda en trámite
      hasta que alguien mire el panel de Lucode.
      **CICLO DE ANULACIÓN CERRADO 2026-09-09 — botón "Consultar".**
      `/api/lucode/consultar-anulacion` + botón en las filas en trámite:
      pregunta a Lucode y, solo si SUNAT confirmó, promueve a `anulado` con el
      motivo original. `interpretarEstadoAnulacion` es un lector propio porque
      Lucode usa un vocabulario aparte para la anulación (`ANULANDO`/`ANULADO`)
      y reusar el de emisión habría dejado toda baja en trámite para siempre.
      5 tests nuevos. **Falta desplegarlo** y apretar "Consultar" en
      B004-000003, que sigue en trámite desde las 11:58 del 09-09.
      **Sigue abierto:** `ANULADO` no se vio con los ojos todavía — solo
      `ANULANDO`. Confirmarlo cuando SUNAT cierre esa baja.
      **Fase 0.5 (tokens de diseño) — cerrada:** `packages/shared/src/
      design-tokens.ts` (espejo tipado de `globals.css`) y `TarjetaIndicador.tsx`
      construidos (dos sesiones paralelas llegaron al mismo archivo, byte por
      byte); radios corregidos a 0px en toda la app (brandbook pedía esquinas
      rectas, se habían desviado a 8-18px). `tsc` limpio.
      **Fase 2 (Egresos) — primera pantalla nueva construida y verificada en
      vivo:** `/finanzas/egresos` (antes no existía; los gastos solo se veían
      agregados dentro del EERR). Small multiples por sede (`TarjetaIndicador`
      × 5, siempre visibles), tabla de detalle con cifras tabulares. Probado en
      local (ADR-0010): un gasto de prueba en AQP solo movió esa tarjeta, las
      otras tres quedaron en S/0 — segmentación por sede real, no agregada. De
      paso: `RegistrarGastoModal`/`RegistrarGastoButton` nunca habían recibido
      el sistema de identidad CAYLA (usaban `bg-white`/`rounded-2xl` desde que
      se construyeron) — corregido; `METODOS_PAGO_GASTO` separado de
      `METODOS_PAGO` (mismo nombre, dos constraints reales distintos —
      `0013_finanzas_nucleo.sql` vs `0007_finanzas.sql`); `getGastos()` muerto
      en `lib/finanzas.ts` borrado (nadie lo llamaba). Falta: auto-sugerencia
      de categoría por texto (parte 2 de esta fase, no empezada).
      **Aparte, ya construido 2026-09-05 (ADR-0008):** verificación de cliente
      contra RENIEC/SUNAT antes de emitir (`packages/shared/src/documento.ts`,
      `apps/web/lib/padron.ts`, `ConsultaDocumento.tsx`) — encontró y corrigió
      2 bugs reales (middleware bloqueaba rutas de API, estado de tipo de
      documento desincronizado del tipo de comprobante).
      **Aparte, ya construido 2026-09-05:** `supabase/seed.sql` renombra
      `public`→`retail` después de migrar en local — el stack local nunca
      había podido correr con el mismo schema que producción hasta ahora.
      **Pendiente, sin bloquear el proyecto:** preguntarle al contador si
      CAYLA ya cruzó el umbral SIRE (75 UIT, ~S/412,500/año) — obligación
      distinta del PLE (300 UIT) que probablemente ya aplica hoy.
- [x] **LA RPC YA ESTÁ EN PRODUCCIÓN — verificado 2026-09-10.** `retail.crear_producto_con_variantes`
      existe con una sola firma, y la pantalla `/inventario/producto/nuevo` está
      desplegada. O sea que `unificacion/16` se pegó en algún momento y nadie lo anotó.
      **Lo único que queda de este item es manual y de Felipe:** crear un producto real
      con varias tallas/colores y confirmar que aparece en Catálogo. Texto original abajo:**
      **`crear_producto_con_variantes`: construido y verificado (build/lint,
      `next build` limpio) 2026-09-04 — falta que Felipe pegue la RPC en
      producción.** "Recibir mercadería" crea un `producto` nuevo por CADA
      ítem agregado con "+ Agregar prenda nueva": pedir la misma referencia
      varias veces (una por talla/color) dejaba varios productos duplicados
      en vez de un modelo con N variantes. Nueva pantalla
      `/inventario/producto/nuevo` (solo Líder): referencia + familia/
      categoría + chips de talla/color + matriz generada con precio/costo/
      SKU editable por fila → un solo INSERT a `productos` + N a `variantes`,
      sin tocar `stock`/`movimientos` (el modelo nace con 0 unidades hasta el
      primer lote real). Mismo patrón dual que `recibir_lote` (ADR-0004):
      versión local sin prefijo en `0033_crear_producto_variantes.sql`,
      versión schema-calificada para pegar en el SQL Editor de producción en
      `supabase/unificacion/16_crear_producto_variantes.sql`. **Pendiente:
      que Felipe pegue el archivo 16 en producción y cree un producto real
      (ej. varias tallas/colores) para confirmar que aparece en Catálogo** —
      cierra además la verificación que le faltaba a `almacen interno` de
      arriba ("que Felipe entre un producto real por la pantalla").
- [ ] **PROVEEDOR YA CONTRATADO — lo que queda es confirmar Vercel, 2026-09-10.**
      `apps/web/.env.local` tiene un `PADRON_TOKEN` real de `apisnetpe_v1`, así que la
      parte de "contratar" está hecha; y la BITÁCORA del 08-09 registra la consulta
      funcionando en producción (el fallo de ese día fue `apisnetpe` vs `apisnetpe_v1`,
      no falta de credencial). **Lo único abierto: confirmar que Vercel tenga
      `PADRON_PROVEEDOR=apisnetpe_v1` — con el `_v1`.** No pude verificarlo desde la
      sesión: el conector de Vercel devuelve 403 y hay que reautenticar el scope "cayla".
      Se comprueba en un segundo emitiendo en producción y escribiendo un DNI. Texto
      original abajo:**
      **`padrón RENIEC/SUNAT`: construido y verificado 2026-09-05 — falta que
      Felipe contrate un proveedor y ponga dos variables de entorno.** El modal
      de emisión ya lee el DNI/RUC y muestra a quién pertenece antes de emitir
      (nombre o razón social, y para RUC además estado y condición, porque una
      factura a un RUC de baja o "no habido" la rechaza SUNAT con el correlativo
      ya quemado). Adaptadores para tres proveedores intercambiables — ADR-0008.
      **Pendiente:** contratar `decolecta`, `apisnetpe` o `factiliza`, y poner
      en Vercel `PADRON_PROVEEDOR` (uno de esos tres nombres) y `PADRON_TOKEN`.
      Sin eso la pantalla funciona igual, avisando que la consulta automática no
      está activada y dejando escribir el nombre a mano. Reversible: sí (no
      toca el esquema).
- [x] **`la app nunca ha corrido contra el Supabase local` — RESUELTO
      2026-09-05 (ADR-0010).** Eran tres causas: healthchecks que abortaban
      `supabase start` entero, el schema `retail` que en local no existía, y
      `lib/persona.ts` sin reconocer el rol `lider`. Ahora `npx supabase start`
      + `pnpm dev` levanta la app completa contra local (instrucciones en el
      README). Verificado emitiendo una boleta real. Precio: Storage apagado en
      local — subir fotos de producto no funciona ahí.
- [ ] **La misma función de permiso se llama DISTINTO en local y en producción, y
      plpgsql no lo delata — 2026-09-10.** Local: `retail.fn_puede_operar_sede`.
      Producción: `retail.puede_operar_sede`, **sin el `fn_`**. Verificado en las dos
      bases. Los archivos están bien escritos: 20 de `migrations/` usan la versión con
      `fn_` y 17 de `unificacion/` la de sin — nadie se equivocó todavía.
      **Por qué es una trampa y no una curiosidad:** el cuerpo de una función plpgsql
      NO se resuelve al crearla, solo al ejecutarla. O sea que copiar un gemelo al otro
      —el gesto más natural del mundo cuando escribes el par— produce un
      `create or replace` que **corre en verde** y revienta la primera vez que alguien
      la usa, con "function does not exist" y la clienta esperando. `migraciones:verificar`
      tampoco lo ve: comprueba que la función exista por nombre, no a quién llama por
      dentro. Hoy casi muerde al aplicar la `33`: el archivo dice
      `retail.puede_operar_sede` y en local eso no existe, lo que parece un error y no
      lo es.
      Arreglo de fondo: renombrar en producción para que los dos lados digan lo mismo
      (con un alias temporal que llame al nuevo, para no romper las 17 que ya la
      nombran). Arreglo barato mientras tanto: que `migraciones:verificar` extraiga los
      nombres que llama cada cuerpo y los cruce contra el inventario — es la misma idea
      que ya tiene, un nivel más adentro.

- [ ] `migraciones duales (local sin prefijo / producción con prefijo retail.)`:
      la causa raíz de ADR-0004 y ADR-0006 sigue viva — cada cambio de esquema
      se escribe dos veces y las dos copias se desincronizan. Ahora que el local
      corre en el schema `retail` (ADR-0010), la ruta para matarlo es más corta:
      escribir las migraciones una sola vez, ya calificadas. Requiere revisar
      las 32 funciones con `set search_path` y las vistas puente sobre dynamic.
      No urgente, pero es la deuda que más caro ha salido hasta hoy.
- [ ] `produccion — insumos del taller`: la receta de costo (`0024`-`0029`) calcula
      con tela+avíos como costo directo declarado a mano, pero sigue sin inventario
      real de materia prima (decisión de julio: "insumos después"). Sin esto, el
      Taller no sabe cuándo se queda sin tela hasta que pasa. Depende de: decidir
      con Felipe si ya toca retomarlo o sigue postergado. Reversible: sí.
- [ ] `local-first de lecturas (Fase 2 del ADR-0013)`: replicar catálogo, stock,
      precios y sedes al navegador para que las pantallas pinten en 0 ms y la tienda
      siga operando con el wifi caído. Lo hace inusualmente viable el volumen: el
      negocio entero pesa <1 MB hoy y ~1-2 MB con 5.000 variantes — entra completo en
      IndexedDB. **Las escrituras NO se replican**: venta, movimiento y recepción
      siguen pasando por los RPC, `movimientos` sigue siendo la única fuente de verdad
      (principio 4). Escrituras local-first sin arbitraje dejarían el stock en −1
      cuando dos sedes venden offline la misma última unidad — rompe el principio 2.
      Regla de negocio ya decidida por Felipe (2026-09-09): la venta offline se permite
      **solo con stock de sobra**; si es la última unidad, bloquea. Falta definir con
      él el umbral exacto de "de sobra" y qué ve la Encargada cuando se bloquea.
      **Depende de Fase 0 y Fase 1** — sin eso, la primera carga sigue cruzando a
      Washington igual. Tendrá su propio ADR con el motor de sincronización elegido.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [x] **`docs/datos/generado/` estaba desactualizado desde media tarde del 17-sep —
      `pnpm datos:comparar` marcaba 3 pantallas "rotas en producción" que en
      realidad funcionan bien. Refrescado y confirmado 2026-09-17 (noche).** El
      volcado (`funciones-produccion.txt` y los 6 `retail_*.json`) tenía fecha
      15:26 (commit del PR #93, "revoca EXECUTE público"), de antes de que
      aterrizaran ADR-0093 (`marcar_comprobante_no_emitido`) y ADR-0095
      (`actualizar_categoria_ejes`, `actualizar_variantes_etiquetas`) — las 3
      funciones que el comparador marcaba como inexistentes. Antes de alarmar con
      "3 pantallas rotas", se verificó **contra producción de verdad** (MCP de
      Supabase, `vovjyyiafkxteijimpuy`, consulta de solo lectura envuelta en
      `begin transaction read only`): las 3 funciones existen — era la foto, no el
      código. Se volvió a pedir el volcado completo (los 7 queries de
      `COMO-REFRESCAR.md`) y se regeneró el diccionario:
      `pnpm datos:comparar` ahora sale limpio ("Ninguna pantalla llama a una
      función con parámetros que producción no acepte"). De paso salió a la luz
      que producción creció de 45 a **60 tablas** desde la última foto del 12-sep
      — coherente con la cantidad de PRs fusionados hoy (Taxonomía ADR-0095,
      Familias/categorías ADR-0096, Revocar EXECUTE ADR-0078, etc.). El propio
      `docs/CLAUDE.md` ya no necesita corrección: dice explícitamente que el
      conteo vivo está en este diccionario, no hardcodeado ahí.
      **Sin tocar (deuda que sigue viva, no la agrandé ni la until):**
      `glosario.json` solo explica 425 de 586 columnas — las nuevas de hoy (Loro,
      taxonomía, EXECUTE) quedan con "Para qué sirve" vacío hasta que alguien las
      documente a mano; 21 de las 60 tablas quedan "sin módulo" en
      `DICCIONARIO-RETAIL.md` (la lista `DOMINIOS_RETAIL` de `generar.mjs` no se
      actualizó desde el 15-sep). Ninguna de las dos bloquea nada, son mapas
      quedando cortos, no código roto.
- [ ] **`ARQUITECTURA.md:106-119` describe un `/inventario` que ya no existe —
      encontrado 2026-09-17 de rebote, verificando a dónde debía apuntar el alias
      `/almacen`.** El doc dice `/inventario/almacen` → `AlmacenStockList.tsx`,
      `/inventario/compras` → `ComprasManager.tsx`, `/inventario/proveedores` →
      `ProveedoresManager.tsx`, `/inventario/etiquetas` → `EtiquetasGenerator.tsx`, y
      `/inventario` → `InventarioAgrupado.tsx`/`MovimientoModal.tsx`. Ninguno de esos
      cinco componentes existe hoy en el repo (`grep -r` da 0 resultados) y ninguna de
      esas cuatro sub-rutas existe como carpeta bajo `app/(app)/inventario/`
      (`git log` ubica el reemplazo real en `52882ff`, "integra las 4 vistas de
      Felipe", 2026-09-16, ADR-0071 — que dejó `/inventario` como una sola vista con
      piso+almacén juntos, `lib/inventario-v2.ts`). Probablemente son restos de la
      arquitectura V1 que el corte `0af2f1b` (V1→V2) no terminó de limpiar en este
      doc. Efecto concreto ya confirmado: el stub `redirect("/inventario/almacen")`
      de `almacen/page.tsx` apuntaba a un 404 desde el 2026-09-16 sin que nadie lo
      notara — ver ✅ CERRADO de hoy. No se tocó el resto del bloque (106-123):
      corregirlo bien pide releer todo `/inventario/*` y `/compras/*` contra el
      código real (`/compras/proveedores` sí existe hoy, así que probablemente ahí
      se movió esa pieza) — más ancho que esta sesión, que solo tenía permiso sobre
      `next.config.ts` y los dos archivos de `almacen/`.
- [ ] **`stock.sububicacion_id` en NULL en las tres sedes, en el Postgres local
      compartido — detectado 2026-09-16 verificando ADR-0063.** `retail.sububicaciones`
      tiene sus 6 filas intactas (2 piso_venta, 2 almacen_tienda, 2 rack), pero
      `select count(*) from retail.stock where sububicacion_id is not null` da **0**
      sobre 96 filas, en Lima, Trujillo y Taller — probablemente otra de las ~27
      worktrees reseeded `stock` (un `supabase db reset` u otro script) sin su backfill
      de piso/almacén. Efecto: **toda** venta contra este Postgres local se rechaza con
      "Stock insuficiente: hay 0…", incluso el ítem "Monto manual"
      (`ID_CARGO_ESPECIAL`), online u offline — no es un bug de una pantalla, es el
      dato. No se tocó (no es de esta sesión arreglarlo ni está claro cuál es el
      backfill correcto sin mirar cómo se pobló originalmente); quien lo vea de nuevo,
      confirmar con esa misma consulta antes de sospechar de su propio código.
- [ ] **`ComprobantesPanel.tsx`: "Monto facturado" suma TODOS los comprobantes del
      mes, sin importar el estado — encontrado 2026-09-16 al rehacer los tiles del
      resumen, no es de esta sesión.** `totalMes` (`ComprobantesPanel.tsx`, `const
      totalMes = comprobantes.reduce((acc, c) => acc + Number(c.total), 0)`) suma
      pendientes, rechazados, anulados y hasta comprobantes de **prueba** (sandbox,
      que la propia pantalla explica que "no vale como comprobante de pago"). Un
      rechazo o una anulación no fueron una venta facturada; un comprobante de
      prueba nunca lo fue. Pregunta de negocio, no técnica: ¿"Monto facturado" debe
      contar solo `aceptado` + `entorno_transmision='produccion'`? No lo cambié sin
      confirmar contigo qué debe significar la cifra.
- [ ] **Facturación: "Ventas de hoy" no conecta con "Emitir comprobante" — con
      Felipe, pospuesto 2026-09-16 (se hicieron los ítems 2, 3 y 4 de la misma
      auditoría, este no).** Hoy hay que mirar el monto en `VentasDelDiaPanel` y
      volver a tipearlo a mano en el modal de `ComprobantesPanel` — dos pantallas
      para un solo dato. `retail.emitir_comprobante` ya acepta `p_venta_id`/
      `p_items` en producción; `ComprobantesPanel.tsx:215-224` no los manda. Falta
      levantar el estado del modal "emitir" a un componente cliente que envuelva a
      los dos paneles hermanos (hoy conviven sueltos en `facturacion/page.tsx`).

- [x] **Correlativo reservado que nunca se transmitió — mecanismo RESUELTO 2026-09-17
      (ADR-0093), aplicado en producción.** `emitir_comprobante` reserva el
      número oficial ante SUNAT en el mismo instante en que se guarda el comprobante —
      antes de transmitir. Si nadie aprieta "Transmitir" después, ese número quedaba
      `estado='pendiente'` para siempre sin salida. Felipe decidió "liberar sin espera":
      ahora existe `retail.marcar_comprobante_no_emitido` (solo líder, motivo
      obligatorio, nunca toca SUNAT/Lucode — el número queda sin usar para siempre, nunca
      se reutiliza) y un botón "Liberar sin espera" en `ComprobantesPanel.tsx`, junto a
      "Transmitir" cuando `estado='pendiente'` (`rechazado` queda afuera a propósito: ya
      se transmitió, su única salida sigue siendo reintentar). **Migración
      `20260917130050_comprobante_no_emitido.sql` pegada en producción el 2026-09-17**
      (ok explícito de Felipe, excepción puntual a D-11) — `comprobantes_estado_check`/
      `comprobantes_transmitido_tiene_entorno` tenían el mismo nombre allá que en local,
      confirmado antes de aplicar. Los 2 casos reales de producción de abajo siguen sin
      liberarse (nadie apretó el botón nuevo todavía) — igual, ambos siguen mostrando
      `puedeTransmitir=true`, así que Felipe también podría simplemente reintentar
      "Transmitir" sobre ellos si prefiere esa vía. Confirmado en `retail.comprobantes`:
      **B004-000004** (S/655.50, sin cliente, creado 2026-09-14) y **B004-000005**
      (S/185.30, con cliente, creado
      2026-09-15) — dos correlativos oficiales ya quemados ante SUNAT, ninguno transmitido
      ni recuperable desde la pantalla. Pregunta de negocio para Felipe, no técnica: ¿se
      puede anular sin avisarle a SUNAT (nunca salió de acá, no hay nada que darle de baja
      allá — sería un camino nuevo, más simple que el de ADR-0016, no el mismo)? ¿Hay un
      plazo razonable antes de tratarlo como abandonado? Mientras no se decida, cada
      "Emitir" que alguien no transmite quema un número de la serie sin remedio.

- [x] **RESUELTO 2026-09-09. Ahora corre 3 tareas y encontró 1 error real el primer día.**
      `"typecheck": "tsc --noEmit"` en los tres paquetes y la tarea declarada en
      `turbo.json`. Estado al encenderlo: `apps/web` **0 errores** y `packages/shared`
      **0** —estaban limpios porque `next build` ya los tipaba—, y
      `packages/database` **1**: `client.ts:12` usa `process.env` sin `@types/node`
      (TS2580). Invisible desde que existe el paquete, porque `apps/web` lo compila con
      SU tsconfig, que sí tiene los tipos de Node. Arreglado agregando la dependencia,
      que es lo que el paquete de verdad necesita.
      **Dos detalles sin los cuales el gate no sirve, y los dos costaron una corrida
      cada uno:** (1) SIN `dependsOn: ["^typecheck"]` — `apps/web` tipa leyendo el
      código FUENTE de los paquetes, no un artefacto construido, así que encadenarlos
      solo hace que el primer paquete roto cancele los demás y esconda el resto; (2)
      CON `--continue` en el script de la raíz — turbo, por defecto, cancela lo que
      falta en cuanto algo falla, y un gate tiene que dar la lista completa en un solo
      viaje. Con los dos puestos, dos errores plantados a propósito (uno en `web`, otro
      en `shared`) salieron **los dos** en la misma corrida, con salida 2.
      **Probado en rojo antes de creerle al verde** — un gate que nunca se vio fallar no
      es un gate. Cuesta 5 s en frío y **39 ms cacheado** (`FULL TURBO`), o sea que es
      barato de correr antes de cada push.
      **Lo que sigue abierto y no es este item:** no hay CI (`.github/workflows/` no
      existe), así que nada obliga a correrlo; y `apps/web/tsconfig.json` incluye
      `.next/types/**`, que solo existe después de un `build`/`dev` — en un clon limpio
      los tipos de ruta de Next no se verifican. Ninguna de las dos cosas convierte el
      verde en mentira, pero conviene saber qué NO cubre.
      **LAS DOS CERRADAS EL MISMO DÍA (2026-09-10), `.github/workflows/ci.yml`:** el CI
      corre `typecheck` + `lint` + `test` en cada push a main y en cada PR, así que ya no
      depende de que alguien se acuerde; y el agujero de los tipos de ruta se tapó con
      `next typegen` (3,5 s, genera `.next/types/` sin construir), de modo que el clon
      limpio del CI verifica lo mismo que la máquina de Felipe. Texto original abajo:**
      **`pnpm typecheck` no verifica NADA — corre 0 tareas y sale en verde.** El
      script existe en el `package.json` de la raíz (`turbo run typecheck`), pero
      ningún paquete del workspace define esa tarea, así que turbo responde
      *"No tasks were executed as part of this run · 0 successful, 0 total"* y
      termina con éxito. Encontrado el 2026-09-09 usándolo como gate antes de
      pushear: da exactamente la falsa confianza que ADR-0026 describe para el
      verificador de migraciones (*"un verificador que aprueba lo que no entendió
      es peor que no tenerlo: enseña a confiar en un verde vacío"*). El único
      gate real hoy es `pnpm build`, que sí tipa (`next.config.ts` **no** tiene
      `ignoreBuildErrors`) y tarda ~21 s. Arreglo: agregar `"typecheck": "tsc
      --noEmit"` a `apps/web` y a los dos paquetes, y declarar la tarea en
      `turbo.json`. Barato, y convierte un verde mentiroso en uno que significa
      algo.
- [x] **Streaming en las 10 pantallas: hecho y verificado, con resultado NEGATIVO en
      tiempo — 2026-09-09, ADR-0021.** Funciona mecánicamente (el HTML trae el esqueleto
      y llega en 3 trozos), pero **no movió los tiempos**: TTFB 131→124 ms y carga total
      750→730 ms, dentro del ruido. La razón: entre el primer byte y el HTML completo solo
      hay ~100 ms, así que había poco que repartir. Se mantiene porque cambia QUÉ se ve
      durante la espera (estructura en vez de "Cargando…"), no por velocidad. **No volver
      a proponer streaming como solución de rendimiento en este repo.**
- [x] **Auditoria de lecturas silenciosas: CERRADA el 2026-09-09.** Se paso de **20
      consultas que descartaban el error de Supabase a 1**, y esa es deliberada (la memoria
      de conveniencia del padron: si falla, queda preguntarle al padron -- degradarse a la
      ruta lenta es correcto, tumbar la consulta por un cache frio no). `lib/resultado.ts`
      tiene los tres comportamientos con la regla escrita para elegir: `exigir()` cuando un
      numero equivocado ES una decision equivocada, `exigirOpcional()` para los
      `.maybeSingle()` donde "no hay fila" es respuesta legitima pero un error no, y
      `tolerar()` para lo secundario. Las barreras `(app)/error.tsx` y `global-error.tsx`
      quedaron verificadas en vivo el mismo dia.
      **CORRECCIÓN Y CIERRE 2026-09-09 (barrido sobre TODO `apps/web`):** ese "de 20 a 1" era
      correcto **para la lista que auditó** —la que este BACKLOG nombraba—, pero el patrón
      seguía vivo fuera de ella: 52 destructuraciones `{ data: x }` sin `error`, en 16 archivos.
      **Cerradas las 52 el mismo día.** Queda 1, la del padrón, deliberada y explicada en su
      propio código. Lo que alimentaban las que importaban:
      · `lib/finanzas-nucleo.ts` (13) — EERR, cuadre de efectivo, comparativo, patrimonio.
        `getEERRMensual` (`:48`) hace `(ventasData ?? []).forEach(...)`: si la consulta de
        `ventas` falla, el Estado de Resultados dibuja **S/0 en ventas** con cara de
        normalidad. Es, literalmente, el ejemplo que `lib/resultado.ts` usa en su cabecera
        para explicar por qué existe.
      · `lib/contabilidad.ts` (8) — Balance, Flujo de Efectivo, Cambios en el Patrimonio.
      · `lib/pendientes.ts` (4) — la bandeja del Inicio. Su diseño se apoya en que "el valor
        del bloque está en cuándo NO aparece"; si la consulta falla, no aparece, y eso se
        lee como "todo al día". La forma más cara de mentir que tiene el sistema.
      · `lib/panel.ts` (2), `lib/egresos.ts` (2), `lib/actividad.ts` (2),
        `lib/inteligencia.ts` (1), y 5 pantallas más.
      Verificadas y descartadas como falsos positivos: los tres `auth.getClaims()` (si falla,
      no hay sesión y la ruta redirige al login) y `FotoProducto:54` (`getPublicUrl` arma una
      URL en memoria, no devuelve error).
      **Cómo se resolvió cada una.** `exigir()` en todo lo que alimenta una decisión de plata o
      de stock — que resultó ser casi todo. Dos excepciones razonadas:
      · `lib/pendientes.ts` — `exigir` habría tumbado el Inicio entero por una de cinco
        consultas de un bloque secundario, pero `tolerar` a secas tampoco servía: esa bandeja
        **se esconde** cuando no hay nada que hacer, así que una consulta caída se vería igual
        que un día tranquilo. El silencio es su estado normal, y por eso ahí miente mejor que
        en ninguna otra parte. Se resolvió metiendo el fallo A LA BANDEJA como un pendiente
        más ("Esta bandeja está incompleta"): no poder leer tu cola de trabajo es, literalmente,
        algo que atender — y no hizo falta tocar la pantalla.
      · `producto/[varianteId]` — `exigirOpcional()` en las tres consultas que solo corren para
        el Líder: el respaldo llega en `null` a propósito y lo que no puede pasar callado es un
        error, que es la distinción exacta que ese ayudante existe para hacer.
      **El hallazgo más feo, de paso:** `inventario/recibir` derivaba `contenedorAlmacen` de una
      consulta sin revisar. Si fallaba, la pantalla decía «tu sede no tiene un almacén
      configurado» — un mensaje FALSO que manda a configurar lo que ya estaba, con el fardo
      abierto en el mostrador. Un error se entiende; ese mensaje engaña.
      Regla para elegir, la misma de siempre: ¿alguien puede tomar una decisión de negocio
      mirando ese dato? Si sí, `exigir()`.
- [ ] **No hay ninguna pantalla para dar de alta un activo fijo.** `finanzas/activos/page.tsx:54`
      solo LEE `activos_fijos`; ningún componente del repo escribe esa tabla, así que los
      activos entran hoy a mano por SQL. Encontrado el 09-09 al hacer accionables los estados
      vacíos: el de esa pantalla no podía nombrar dónde se resuelve porque no se resuelve en
      ningún lado. Por ahora el texto lo dice tal cual, que es preferible a inventar un botón.
      Cuando toque, el patrón ya existe: `PatrimonioEditor` («+ Agregar partida») hace
      exactamente esto para las partidas de patrimonio.

- [x] **RESUELTO 2026-09-09 — ningún componente del repo muestra ya el error crudo de
      Postgres al escribir.** `traducirError` (ADR-0022) quedó en los 31 sitios de escritura
      de los 17 componentes; el grep de `error.message` fuera de `lib/error-escritura.ts`
      no devuelve nada. De paso aparecieron **dos escrituras que se tragaban el error
      entero** —`ComprasManager.cancelar` y `RecetaCosto.quitarItem`, ambas
      `if (!error) router.refresh()`—: se tocaba el botón, no pasaba nada y nadie se
      enteraba. Es la misma falla que `lib/resultado.ts` arregló del lado de la lectura,
      viva del lado de la escritura.
      **Lo que queda de esto, y es la parte que ninguna prueba puede cerrar:** provocar el
      error de cada pantalla a propósito para saber si la frase sirve de verdad. El
      traductor garantiza que no salga inglés; no garantiza que la frase oriente.
      **Sospecha concreta:** `FotoProducto` no habla con Postgres sino con Supabase
      Storage, así que sus errores (archivo muy pesado, sobre todo) caen al fallback con
      "Código:". No se inventó una huella para eso porque nadie ha visto el texto real —
      cuando alguien suba una foto demasiado grande, se copia el mensaje y se agrega a
      `HUELLAS` **con su prueba** en `lib/error-escritura.test.ts`.

- [x] **RESUELTO — verificado en vivo con la pistola Zebra el 2026-09-09 por Felipe: nada falló.** Lo construido el 09-09
      (escaneo dentro del modal de venta, Enter que ya no registra la venta a medio
      escaneo, tope contra el stock de la sede, acuse con el monto) pasa build, lint,
      tsc y 77 pruebas, **pero no se pudo probar en el navegador**: el layout redirige al
      login y no corresponde que Claude escriba la contraseña. Hay que hacerlo con la
      pistola real, no simulando el tecleo. Felipe lo probó y confirmó que nada falló: el
      escaneo agrega la prenda, dos escaneos seguidos no cierran la venta, y el tope contra
      el stock de la sede frena con el número.
      **Lo que NO se hizo, y se decidió no hacer:** cronometrar a una persona nueva. Sin ese
      número, "facilidad de aprendizaje" —la dimensión del apartado D que esta tanda de
      trabajo vino a cerrar— sigue sin línea base contra la cual comparar la próxima vez.

- [x] **RESUELTO — `recalcular_stock()` aplicada y verificada en producción
      2026-09-09 (ADR-0020). Encontró 2 filas desincronizadas el primer día;
      las 10 filas de stock siguen siendo 10 y todas tienen movimientos
      detrás, así que corrigió cantidades sin borrar nada (eran SKUs de prueba
      de la unificación, no catálogo real). Queda una lección de procedimiento
      registrada en el ADR: la verificación usaba `create temporary table` y el
      SQL Editor de Supabase la destruye entre ejecuciones, así que se supo que
      había 2 diferencias y ya no hubo con qué compararlas. Corregido en
      `unificacion/25`. Texto original abajo:**
      **`recalcular_stock()` arreglada en local, SIN PEGAR EN PRODUCCIÓN —
      2026-09-09, ADR-0020.** La red de seguridad del inventario
      (ARQUITECTURA.md §4.2) nunca pudo correr en una base con ventas: Postgres
      evalúa los CHECK sobre la fila propuesta antes de resolver el
      `on conflict`, así que la fila negativa moría antes del update.
      `supabase/migrations/0042_recalcular_stock_neto.sql` aplicada y verificada
      en local (0 diferencias contra el stock calculado aparte).
      **Falta que Felipe pegue `supabase/unificacion/25_recalcular_stock_neto.sql`
      en el SQL Editor de producción** y corra las dos verificaciones que trae al
      final. Ojo con la segunda: si devuelve algo distinto de 0, no es que el
      arreglo esté mal — es que `stock` y `movimientos` ya estaban
      desincronizados y la red hizo su trabajo por primera vez.

- [x] **YA NO — verificado 2026-09-09.** `supabase/migrations/0044_almacen_interno.sql`
      la crea en local; la base de este repo tiene `retail.stock_almacen`. La entrada
      quedó vieja: describe el estado de antes de la 0044. (Lo que sigue siendo cierto
      del párrafo es el patrón de migraciones duales, no este caso.) Texto original:**
      **`retail.stock_almacen` no existe en local — 2026-09-09.** Solo la crea
      `supabase/unificacion/12_almacen_interno.sql`, que es de producción;
      ninguna migración de `supabase/migrations/` la tiene. `lib/catalogo.ts`
      la consulta sin revisar el error, así que en local devuelve `{}` en
      silencio: el almacén se ve vacío y "Recibir mercadería" / "Bajar a tienda"
      no son verificables en local. Cuarto caso del patrón de migraciones
      duales (con ADR-0004, ADR-0006 y las categorías). Es también lo que
      impide verificar la línea "Incluye S/X en almacén" del Inicio sin
      producción.

- [x] **RESUELTO 2026-09-09 — y el arreglo no fue apagar un stack, fue construir el
      instrumento.** Los dos Supabase locales son legítimos y los dos se quedan: son
      dos repos distintos (`cayla-retail` 54421 / `cayla-dynamic` 54321). Apagar el de
      Dynamic rompería el otro proyecto. Lo que se hizo: (1) el `.env.local` de la raíz
      salió del repo (archivado fuera; se regenera con `vercel env pull` si alguna vez
      hiciera falta) — nada lo leía: no hay `dotenv`, ni `globalDotEnv` en `turbo.json`,
      ni uso de OIDC, o sea que era solo una pista falsa a la mano; (2) `pnpm local:donde`
      (`scripts/local/donde-estoy.mjs`) contesta en un segundo qué stacks corren, cuál
      declara `config.toml`, cuál leerá la app —detectando el caso feo, la variable
      exportada que le gana al archivo— y qué puerto trae de verdad el bundle del `:3000`
      vivo, abriendo los chunks, que es donde Next inlinea `NEXT_PUBLIC_*` (en el HTML no
      está: por eso la primera versión del check salía muda); (3) la tabla de puertos
      abre la sección de Desarrollo del README. **El dato que faltaba en el diagnóstico
      original:** la base de Dynamic también tiene schema `retail` —28 tablas contra las
      36 de acá, le faltan `comprobantes`, `conteos`, `colores`, `stock_almacen`,
      `proformas`, `series_comprobantes`, `codigos_barras`, `codigos_correlativos`—, así
      que el puerto equivocado no falla, miente a medias. Eso es lo que convierte el
      error en una hora. Probado en los dos caminos: en verde, y forzando el puerto malo.
      Texto original abajo:**
      **Dos `.env.local` y uno de ellos con basura — 2026-09-09.** El de la raíz
      tiene `NEXT_PUBLIC_SUPABASE_URL="[SENSITIVE]"` y la clave igual: restos de
      un `vercel env pull` del 08-09 (cuando una variable es *Sensitive* en
      Vercel, el CLI no la puede descifrar y escribe ese literal). Hoy no rompe
      nada porque Next lee el de `apps/web`, pero hizo perder media hora de
      diagnóstico en esta sesión. **Peor todavía:** el servidor de desarrollo
      tiene `NEXT_PUBLIC_SUPABASE_URL` exportada en su terminal, y en Next eso le
      gana al archivo — `apps/web/.env.local` dice `:54321` (stack local de
      dynamic) y la app en realidad habla con `:54421` (stack local de retail).
      Mínimo viable: borrar el `.env.local` de la raíz y dejar en el README qué
      puerto es cuál.

- [x] **RESUELTO 2026-09-09 (pasos 5 y 6 del Inicio). La causa no era el `if`:
      era que el CÓDIGO de sede no sirve para decidir nada y cada pantalla lo
      re-deducía. `PersonaActual` expone ahora `sedeTipo` y los tres sitios leen
      de ahí. De paso el Taller dejó de ver "Vender" (no tiene caja ni piso) y
      el pie del menú dejó de llamarlo "Encargada". Texto original abajo:**
      **`esTaller === "TALLER"` esconde Producción en producción — 2026-09-09.**
      `AppShell.tsx:216` y `mas/page.tsx:10` detectan el Taller por código de
      sede, pero tras la unificación la sede del Taller se llama **`LIM`**
      (`unificacion/01_sedes.sql:35` la mapea a `tipo='fabrica'` justamente
      porque su código no es TALLER). Hoy, en producción, la persona del Taller
      no ve el enlace a Producción en ningún lado. `packages/shared/src/enums.ts:5`
      también quedó viejo (lista `TALLER`, le faltan `003` y `CCO`). Arreglo:
      detectar por `tipo === 'fabrica'`. Va en el paso 6 del plan del Inicio.

- [x] **Fase 0 de latencia: DESPLEGADA Y VERIFICADA EN PRODUCCIÓN el 2026-09-09.**
      La función corre en `gru1` (São Paulo): confirmado con `x-vercel-id: iad1::gru1::…`
      — dos segmentos, el segundo es dónde ejecuta. Las mediciones anteriores daban un
      solo segmento porque las respondía el proxy en el borde sin llegar a la función.
      Pantalla con sesión: TTFB 124 ms, carga total 730 ms. **Registro original abajo,
      por si hay que rediscutirlo:** Lo único que queda
      es `git push` (hoy hay 6 commits sin subir, 3 de otras sesiones — no se
      empujaron para no desplegar trabajo ajeno sin su visto bueno) y después
      confirmar con `curl -sI <dominio>/login | grep -i x-vercel-id`: si dice
      `gru1`, la región tomó; si sigue diciendo `iad1`, el Root Directory del
      proyecto no es `apps/web` y hay que mover `vercel.json` a la raíz o fijar
      la región desde el panel (Settings → Functions). **Medir el TTFB antes y
      después de cada cambio por separado; el que no supere el ruido se revierte.**
      Lo aplicado: (1) `apps/web/vercel.json` con `regions: ["gru1"]`;
      (2) `Promise.all` en `getEstadoResultados` y `getDiarioCaja`, y `sedes`
      pasó a salir de `getSedes()` cacheado — esa consulta desaparece, no se
      paraleliza; (3) `getUser()` → `getClaims()` en `middleware.ts` y
      `lib/persona.ts`. **El riesgo que se temía en (3) no existía:** el proyecto
      ya firma con ES256 asimétrica (verificado en el JWKS), así que la validación
      es local con WebCrypto y no hubo que tocar auth en producción.
      Diagnóstico original, por si hay que rediscutirlo: Diagnóstico medido: la base
      responde en **0.862 ms** (19 variantes, 28 movimientos, <1 MB de schema) y el
      sistema tarda ~2 s. Todo el tiempo es red. `X-Vercel-Id: iad1::…` confirma que
      la función corre en Washington D.C. contra Supabase en `sa-east-1`; una página
      **estática ya cacheada** tarda 430 ms de TTFB desde Perú. Encima, cada
      navegación hace 4 viajes secuenciales, dos de los cuales son el mismo
      `auth.getUser()` pedido dos veces (`middleware.ts:31` y `lib/persona.ts:52` —
      el `cache()` de React no cruza entre middleware y render). Los tres pasos, en
      orden de riesgo creciente: (1) mover la función a `gru1`; (2) `Promise.all` en
      `getEstadoResultados` (`lib/finanzas.ts:150-172`, 5 consultas independientes en
      fila india) y `getDiarioCaja` (3 más); (3) claves JWT asimétricas +
      `getClaims()` para matar el `getUser()` duplicado — este último toca auth en
      producción, va al final y con los otros dos ya verificados. **Medir antes y
      después de cada uno por separado; el que no supere el ruido se revierte.**
      Falta confirmar si `iad1` fue decisión o default: el token de Vercel da 403
      sobre el scope `cayla`.
- [ ] **No hay forma de saber qué archivos de `supabase/unificacion/` están
      aplicados en producción — 2026-09-08.** Se descubrió que `20`, `21` y
      `22` nunca se habían pegado, y solo porque una pantalla se rompió
      ("Could not find the function ... in the schema cache" al registrar una
      serie). Ya aplicadas y verificadas, pero el problema de fondo sigue: el
      historial de migraciones de Supabase no conoce esta carpeta. El ítem de
      categorías de aquí abajo muestra el otro lado del mismo problema: se
      arregló y nadie lo supo hasta que se contó a mano hoy. Salió barato
      porque `comprobantes` y
      `series_comprobantes` estaban vacías. Mínimo viable: un script que
      compare las funciones/columnas que cada archivo promete contra
      `pg_proc`/`information_schema` y liste lo que falta.

- [x] **RESUELTO — Felipe puso las variables el 2026-09-08 por la noche, y
      nadie lo anotó (otra vez el ítem de "no sabemos qué está aplicado").**
      Verificado 2026-09-09 con `vercel env ls`: `LUCODE_TOKEN` y
      `LUCODE_ENTORNO=produccion` existen en Production desde hace 19h, y el
      token es el mismo que el de `apps/web/.env.local`. El deploy transmite:
      **B004-000002 (08-09 17:35) y B004-000003 (09-09 11:57) salieron de ahí**,
      no de la computadora de Felipe. La segunda ya trae
      `entorno_transmision='produccion'` escrito, o sea que corrió contra la RPC
      de 5 argumentos del código desplegado a las 11:50 — circuito completo
      verificado en producción. Texto original abajo, como se escribió el 08-09:
      *"Producción no tiene LUCODE_TOKEN ni LUCODE_ENTORNO. El botón Transmitir
      responde sin_credenciales en el deploy; facturar a SUNAT solo funciona
      desde el npm run dev de Felipe."*
      **Sigue pendiente y es de seguridad:** el token nunca se rotó pese a haber
      pasado por el chat el 05-09, y es el MISMO que ahora vive en Vercel.
      Rotarlo en app.apisunat.pe → Organizaciones, y actualizar los dos lugares
      (Vercel y `apps/web/.env.local`).

- [x] **RESUELTO (verificado 2026-09-08: `select count(*)` devuelve 37 filas,
      por encima de las 30 esperadas). Se aplicó en algún momento entre el
      05-09 y hoy sin que nadie lo anotara — que es justo el ítem de arriba.
      Texto original abajo, como quedó registrado el 2026-09-05:**
      `retail.categorias` le faltan 25 de 30 filas en producción (mismo
      patrón que ADR-0004/ADR-0006, sin arreglar todavía) — encontrado por
      Felipe en vivo, 2026-09-05. `04_catalogo.sql` (paso 4 de la
      unificación) recreó la tabla desde cero pero nunca insertó la semilla
      de `0009` — solo las 5 filas de `0030_categorias_captura_real.sql`
      (pegadas después) existen hoy. "Blusas" y otras 14 de indumentaria más
      todo calzado/accesorios/bisutería/belleza/papelería faltan. Migración
      lista en `supabase/unificacion/19_categorias_completas.sql`
      (`on conflict do nothing`, segura de correr), **falta que Felipe la
      pegue en el SQL Editor**. Sin esto, "Recibir mercadería" y "Nuevo
      producto" no pueden clasificar la mayoría del catálogo real.
      Reversible: sí, son datos (insert aditivo).
- [x] **`patrimonio_items.categoria`: arreglado y confirmado en producción
      2026-09-05 (ADR-0006) — cerrado.** La unificación de julio copió
      `patrimonio_items` desde la migración `0013`, antes de que `0019` le
      agregara `categoria`; `PatrimonioEditor.tsx` inserta esa columna en cada
      ítem, así que agregar un ítem de patrimonio llevaba roto en producción
      desde julio sin que nadie lo notara. Felipe pegó
      `supabase/unificacion/15_patrimonio_categoria.sql` y confirmó con la
      consulta de verificación: `information_schema.columns` ya devuelve
      `categoria` en `retail.patrimonio_items`. Tercer caso del mismo patrón
      de drift (con ADR-0004 y las categorías de `04_catalogo.sql`) — lo que
      falta no es arreglar el siguiente, es dejar de no saber qué corrió en
      producción (ver la deuda de `registro de migraciones aplicadas` abajo).
- [x] **RESUELTO — CUATRO FUNCIONES TENÍAN DOS O TRES FIRMAS VIVAS EN LOCAL. Producción estaba limpia.**
      Encontrado 2026-09-09 por `pnpm migraciones:verificar` en su primera corrida, contra la
      base LOCAL: `registrar_movimiento` (10 y 12 args), `recibir_lote` (6, 7 y 8),
      `registrar_produccion` (11, 13 y 15), `crear_producto_con_variantes` (7 y 8). Probado con
      `explain` (no ejecuta): una llamada que solo nombra los parámetros comunes devuelve
      `function is not unique`. En la práctica, en local, **una devolución al almacén funciona y
      un ajuste, una merma o un traslado normal no** — `MovimientoModal` solo manda
      `p_contenedor_id` cuando es devolución, y `supabase-js` borra las claves `undefined`.
      **Corrección del mismo día, y es importante:** se dio por hecho que esto explicaba que
      `recibir_lote` no esté en los tipos generados y que `RecibirLoteForm` "siempre falla
      cuando se usa". Felipe corrió la consulta y **producción no tiene ninguna función
      duplicada**, así que allá esos dos síntomas siguen sin causa conocida. El motivo de la
      divergencia: local replica el historial completo (`0002` crea la de 10 args, `0008` la
      redefine con 12 y la vieja queda viva), y producción recibió el estado final consolidado
      —`unificacion/07_funciones_operacion.sql:55` la define UNA vez con 12—. O sea: **la base
      local no es una réplica fiel de producción**, y no por los datos sino por la forma. Es el
      costo concreto de la deuda de migraciones duales.
      **Falta saber si producción tiene lo mismo** — se responde corriendo
      `scripts/migraciones/inventario.sql` allá.
      **ARREGLO LISTO, falta pegarlo.** `supabase/migrations/0049_una_sola_firma_por_funcion.sql`
      (aplicado y verificado en local: las cinco formas de llamada que usa la app resuelven, y
      el verificador ya no reporta sobrecargas) y su gemelo
      `supabase/unificacion/31_una_sola_firma_por_funcion.sql` para el SQL Editor de Dynamic.
      El gemelo lleva candado —no borra la firma vieja si la nueva no existe, porque producción
      recibió las migraciones a mano y puede tener otra combinación—, es idempotente (probado
      corriéndolo dos veces) y termina con una tabla que muestra el estado, porque el SQL Editor
      no siempre enseña los `raise notice`. **Pegarlo en producción es decisión de Felipe: es DDL
      en el proyecto compartido con Dynamic.** Antes de eso, la comprobación de 10 segundos está
      escrita en la cabecera del gemelo. Ver ADR-0026.
      Nota al margen: con `recibir_lote` ya sin ambigüedad, podría por fin salir en los tipos
      generados — pero `pnpm gen-types` sigue apuntando al proyecto viejo de retail y sin
      `--schema retail`, así que eso espera a que se arregle ese otro ítem.

- [ ] **`no hay registro de qué migración corrió en producción` — la deuda que
      produce todas las anteriores.** `supabase/unificacion/` tiene 20 archivos
      y el único registro de cuáles se pegaron vive en la memoria de Felipe y
      en frases sueltas de este backlog. Los tres casos de drift de esta semana
      (ADR-0004 `recibir_lote`, ADR-0006 `patrimonio_items.categoria`, y las 25
      categorías que `04_catalogo.sql` nunca insertó) son el mismo agujero, no
      tres bugs distintos: producción se desvía de local y nadie se entera
      durante semanas, hasta que una pantalla falla delante de una clienta.
      Arreglo propuesto: una tabla `retail.migraciones_aplicadas (archivo text
      primary key, aplicada_at timestamptz default now())` y una línea al final
      de cada script de unificación que inserte su propio nombre; con eso, una
      sola consulta dice qué falta. Barato y aditivo. **Decidir con Felipe
      cuándo** — después de vaciar la cola pendiente, no antes.
- [x] **`recibir_lote`: arreglado y confirmado en producción 2026-09-03
      (ADR-0004) — cerrado, con un susto en el camino que vale registrar.**
      Dos sesiones paralelas llegaron a esta función el mismo día por caminos
      distintos y convergieron en el mismo arreglo: la unificación había
      migrado una copia de `recibir_lote` más vieja que la `0018` local, sin
      validar sede, sin guardar `categoria_id` (rompía la taxonomía de
      `0030`) y sin aceptar `p_orden_compra_id`. Cuerpo schema-calificado
      pegado en `supabase/unificacion/14_recibir_lote_produccion.sql`
      (7 parámetros); `13_recibir_lote_valida_sede.sql` quedó SUPERADO (mismo
      hallazgo, alcance más angosto). **Lo que salió mal al pegar:**
      `CREATE OR REPLACE` con un parámetro nuevo (`p_orden_compra_id`) no
      reemplaza la función vieja de 6 parámetros — Postgres las trata como
      dos funciones distintas y crea una segunda, dejando **dos versiones de
      `recibir_lote` conviviendo a la vez** (la vieja insegura + la nueva
      completa). Se detectó regenerando `packages/database/src/types.ts`
      contra el proyecto correcto (el generador mostró un tipo unión con dos
      firmas) — no por una revisión manual. Cualquier "Recibir mercadería"
      sin orden de compra ligada (la mayoría) habría fallado con
      "function is not unique". Verificado con
      `select oid::regprocedure from pg_proc where proname='recibir_lote'
      and pronamespace='retail'::regnamespace` (2 filas), corregido con
      `drop function retail.recibir_lote(uuid,text,jsonb,text,text,text)`
      (la de 6), reverificado (1 fila, la de 7). Lección para la próxima
      migración que le agregue un parámetro a una función existente: un
      `CREATE OR REPLACE` que cambia la firma no reemplaza nada — hay que
      `DROP` la firma vieja explícitamente, o verificar con
      `pg_proc`/`regprocedure` que no quedó una sobrecarga fantasma.
      Agravante relacionado, sin arreglar todavía: `retail.puede_operar_sede`
      (`03_candados.sql:53-55`) tampoco tiene la cláusula `tienda_asociada_id`
      que sí tenía la versión local (`0012`) — hoy solo Líder/admin pasaría ese
      candado para una sede que no es la propia.
- [ ] **`producción`: reconciliar `ordenes_produccion` (modelo viejo) con
      `producciones` (modelo vigente desde `0025`-`0029`) — nunca se propagó.**
      Encontrado al intentar arreglar `recibir_lote`: `inventario/recibir/
      page.tsx:52,57` todavía consulta `retail.ordenes_produccion` y una
      columna `retail.lotes.orden_produccion_id` que **no existe** en
      producción (verificado: `retail.lotes` solo tiene `orden_compra_id`).
      El frontend manda `p_orden_produccion_id` a `recibir_lote`
      (`RecibirLoteForm.tsx:218`) y siempre falla cuando se usa. Deliberadamente
      fuera de `0031` — decidido con Felipe 2026-09-03. Necesita: decidir si
      `producciones` reemplaza del todo a `ordenes_produccion` (¿se puede
      dropear la vieja?), una columna nueva en `lotes` para el vínculo, y
      reescribir la consulta de "producciones pendientes de recibir" contra el
      modelo nuevo. Reversible: sí, nada de esto se ha tocado todavía.
- [ ] `web`: `middleware.ts` usa convención deprecada de Next.js 16 (pide
      `proxy.ts`). Solo un warning en build, no rompe nada. Reversible: sí.
- [x] **ARREGLADOS 2026-09-10, cada uno como pedía su caso — `pnpm lint` en verde.**
      El `:95` quedó con `eslint-disable-next-line` y el motivo escrito (leer
      `localStorage` durante el render devuelve `[]` en el servidor y la cola real en el
      navegador: eso ES una desincronización de hidratación, no una preferencia). El
      `:106` se reemplazó por el ajuste durante el render que documenta React —
      `conteoPrevio` + comparación—, y de paso quitó el parpadeo: el efecto corría
      después de pintar, así que la lista vieja alcanzaba a verse un instante. **El
      montaje no necesitó nada** porque `lineas` ya nacía de `conteo?.lineas` en su
      `useState` (`:62`), o sea que el efecto solo repetía ese valor — por eso el cambio
      conserva el comportamiento exacto. Sin riesgo de bucle: `conteo` llega de un Server
      Component (`page.tsx` hace `await getConteoAbierto`), su identidad solo cambia
      cuando el servidor manda datos nuevos, y la condición se apaga sola en el re-render
      inmediato. Verificado: lint, tipos y las 79 pruebas en verde. Texto original abajo:**
      **`pnpm lint` está en ROJO en main — 2 errores, los dos en `ConteoPanel.tsx`,
      los dos de `react-hooks/set-state-in-effect` — 2026-09-10.** Es lo primero que
      va a marcar el CI recién encendido, y está bien que lo marque: son de código ya
      commiteado (`ab479ba`), no de trabajo suelto. Los dos casos NO son el mismo problema:
      · **`:95` — hidratar `pendientes` desde `localStorage` al montar.** Probablemente
        un falso positivo: en Next no se puede leer `localStorage` durante el render
        (no existe en el servidor y desincroniza la hidratación), así que el efecto es
        justamente el patrón correcto. Lo que corresponde acá es un
        `eslint-disable-next-line` **con el motivo escrito**, no un rediseño.
      · **`:106` — copiar `conteo.lineas` del servidor al estado local.** Éste sí es el
        antipatrón que la regla persigue, y React documenta el reemplazo exacto
        ("ajustar estado durante el render", comparando contra el valor previo). Además
        de callar el lint, quita un render de más: la lista vieja deja de pintarse un
        instante antes de corregirse — en una pantalla donde se cuenta inventario, eso
        no es cosmético.
      Decidir con quien tenga el contexto de la pantalla. Mientras tanto el CI queda
      rojo, que es la verdad.

- [ ] `pruebas`: **dato corregido otra vez, 2026-09-17 — "ninguna toca Postgres" ya no
      es cierto.** La corrección de 2026-09-10 (7 archivos/79 pruebas de TypeScript en
      CI) seguía diciendo que ninguna prueba tocaba Postgres — eso cambió el
      2026-09-16/17: `scripts/pruebas/registrar_cambio.mjs` y
      `scripts/pruebas/aprobar_devolucion_caja.mjs` (ADR-0066) ya corren contra el
      Postgres local de verdad (`docker exec` + `ROLLBACK`, nunca en CI — necesitan
      Docker), y desde hoy también `scripts/pruebas/fn_aplicar_movimiento.mjs`
      (11 escenarios: entrada, salida con bloqueo de stock negativo, traslado atómico
      con overflow forzado, bloqueo por `(ubicacion_id, sububicacion_id)` verificado con
      dos procesos reales en paralelo, y el regresión-catcher exacto de
      ADR-0020/0023 para el signo del ajuste). **Lo que sigue en pie:** `registrar_venta`
      y `cerrar_caja` (las RPC de producción sí quedaron cubiertas por
      `fn_aplicar_movimiento` de forma indirecta) todavía no tienen su propio script
      dedicado — mismo patrón a copiar, documentado en ADR-0066. Cayla Dynamic
      (proyecto hermano) corre 302 pruebas pgTAP sobre su propio dinero; acá el
      principio 7 ("pasos verificables") ya empezó a capturarse en scripts, no solo en
      el navegador, pero falta terminar de cubrir el resto del núcleo.
- [x] **`unificación retail↔dynamic`: RESUELTO 2026-09-17 — ADR-0091.** Documenta por
      qué `retail` vive como schema dentro del proyecto de Dynamic (no un proyecto
      propio), y confirma con `git log --all` que el `02_*.sql` que crea el schema NUNCA
      se llegó a commitear (no se perdió — se corrió a mano contra producción en jul-2026
      y su SQL se fue con la sesión). De paso encontró 3 tablas huérfanas de ese mismo
      paso 02 que tampoco están en el repo: `retail.sede_meta` (la real, con punto —
      `retail_sede_meta` con guion bajo en `01_sedes.sql` es una trampa de nombre, nadie
      la lee), `sede_datos_fiscales`, `configuracion_empresa`.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [x] **`cacheComponents`: ARCHIVADO el 2026-09-09 tras intentarlo de verdad -- ADR-0028.**
      Con el arbol quieto se activo el flag, se corrio el codemod oficial (27 rutas, 0
      errores) y se ejecuto el build. Varias preocupaciones se cayeron al medirlas: 0
      configs de segmento que migrar, 0 `unstable_cache`, y 13 pantallas ya tenian
      `<Suspense>` del mismo dia. **El impedimento real es de producto, no de codigo:**
      `AppShell.tsx:328` decide con `esLider` que enlaces dibuja, asi que la navegacion
      depende del rol -- y un armazon prerenderizado no puede contener un menu que cambia
      segun quien mira. El layout lee cookies para saberlo y bloquea la ruta entera por mas
      `<Suspense>` que se le ponga a cada pagina. No paga: el streaming ya dio CERO en
      tiempo, la cache del router entrega 6-7 ms en pantalla repetida y el armazon llega en
      124 ms. **Solo se revisa si la navegacion deja de depender del rol por una razon de
      producto**, nunca por rendimiento.
- [ ] `inteligencia`: umbral de estancado (45d) y lead time (14d) siguen siendo
      constantes globales, no por categoría/sede. Sigue sin justificarse afinarlo:
      no hay datos reales de venta todavía (depende de `catalogo real` arriba).
- [ ] `almacen/recibir`: rediseño de UX pendiente desde el 17-jul — talla/color/
      categoría quedan escondidos hasta buscar y crear un producto nuevo. Pedido
      explícito de Felipe, nunca agendado en una sesión propia.
- [ ] `finanzas`: el costo de lo vendido usa el costo VIGENTE de cada prenda, no el
      costo del día de la venta. Inofensivo mientras los costos sean estables (nota
      del 17-jul); si algún día se mueven, distorsiona el histórico de EERR pasados.
- [ ] Contraste: el barrido del 08-sep (ADR-0012) midió solo las pantallas que se
      pueden ver sin sesión más Facturación. Las de Finanzas, Inventario y Producción
      quedaron con el piso aplicado por sustitución mecánica pero SIN medición sobre
      el DOM renderizado. Vale una pasada de verificación cuando haya sesión de prueba.
      El hallazgo de taupe que salió acá el 09-sep ya está cerrado (ADR-0017,
      `--color-taupe-profundo`); lo que queda es el barrido de las pantallas con
      sesión, que es más ancho que ese solo color.
- [ ] Campos viejos: los 6 modales del núcleo (abrir/cerrar caja, vender, bajar a
      tienda, registrar gasto, movimiento de stock) siguen con los strings
      `campoTexto`/`campoSelect`/`botonPrimario` de `ui/Modal.tsx`. Migrar pantalla por
      pantalla, nunca de un saque: los strings viejos siguen exportados justamente para
      que la migración sea opcional. `EfectivoPanel` ya no existe (era de Finanzas V1,
      borrado en el corte V1→V2) — se cae de esta lista. `ProformasPanel` ya migró
      (ver CERRADO 2026-09-16) — queda como ejemplo de referencia además de
      `ComprobantesPanel`.

---

## 📚 CONCEPTOS PENDIENTES DE ENSEÑAR

- [ ] **Schema de Postgres como "cajón" aislado** — el hallazgo de arriba no se
      entiende sin este modelo mental: `public` y `retail` pueden vivir en el
      MISMO proyecto Supabase sin verse entre sí a menos que algo los conecte a
      propósito (las vistas puente del paso 3 de unificación). Es la pieza que
      explica por qué "cambiar una palabra en el cliente" puede romper todo.
- [ ] **`security definer`** — por qué `fn_aplicar_movimiento` y las RPCs de venta/
      producción pueden saltarse RLS y por qué eso es seguro *solo* porque validan
      todo adentro (sede del que llama, cuadre de asiento, etc.).
- [ ] **Costeo por margen de contribución** (introducido en `0024`) — por qué la
      mano de obra y los gastos fijos del Taller NO entran al costo por prenda y sí
      al resultado mensual del Taller; es una decisión contable, no un descuido.

## ✅ CERRADO (últimos, con fecha)

- [x] 2026-09-18 — **Tienda Lima activada en producción (ADR-0097).** No estaba
      inactiva, no existía: `retail.ubicaciones` en producción solo tenía Taller,
      Tienda AQP y Tienda TRU (las decenas de menciones de "Tienda Lima" en esta
      bitácora son todas del seed local, nunca de la base real). Creada vía
      `apply_migration` (`20260918010733_activar_tienda_lima.sql`, dry-run+rollback
      verificado antes de aplicar de verdad): fila `Tienda LIM` enlazada a la sede
      Dynamic código `003` (el código `LIM` de Dynamic es el Taller, no la tienda —
      trampa ya documentada abajo, 2026-09-10) + sus 3 sububicaciones (piso de
      venta, almacén de tienda, cuarentena), mismo patrón que AQP/TRU. Verificado
      contra producción después de aplicar; `get_advisors` sin advertencias nuevas.
      **Pendiente (no es parte de "activar"):** cargar stock inicial (traslado desde
      Taller/almacén) y asignar una Encargada — la tienda queda operable pero vacía.
- [x] 2026-09-17 — **`/almacen` y `/almacen/recibir` pasan a `redirects()` de
      `next.config.ts` — y de paso se corrigió un 404 que llevaba un día abierto.**
      Eran páginas de React (`app/(app)/almacen/page.tsx`,
      `app/(app)/almacen/recibir/page.tsx`) que solo llamaban a `redirect()`: cada
      visita pagaba `requirePersonaActualV2()` + `getUbicaciones()` + `AppShell`
      completo en el servidor para terminar igual acá — un alias de ruta pertenece a
      la config, no al árbol de páginas. Verificado en dev (con `.env.local` apuntando
      al Supabase local): el log del servidor no muestra ninguna línea de `proxy.ts`
      para estas dos rutas (sí la muestra para cualquier otra), confirmando que
      `redirects()` resuelve antes de que la barrera de sesión llegue a correr.
      **Hallazgo de rebote:** el destino viejo, `/inventario/almacen`, ya no existe
      desde el 2026-09-16 (ADR-0071, commit `52882ff`, unificó piso+almacén dentro de
      `/inventario`) — el stub llevaba un día completo redirigiendo a un 404 sin que
      nadie lo notara. Corregido el destino a `/inventario` (no `/inventario/almacen`)
      de una vez; el otro alias, `/almacen/recibir` → `/inventario/recibir`, sí
      apuntaba a una ruta real y no cambió. `permanent: false` → **307**, no 308: el
      308 que pedía el ítem original es lo que da `permanent: true`, que es
      justamente lo que no se quería (redirect permanente cacheado en el navegador
      de cada quien). Verificado en navegador real, ambos roles, con las dos rutas:
      colaboradora (Micaela, Tienda Trujillo, sesión ya abierta en el pane) y líder
      (`felipe@cayla.local`) — las dos aterrizan en las pantallas reales de
      Existencias y Recibir mercadería con datos reales, sin ningún componente entre
      medio. `pnpm --filter web build` limpio. De paso quedó al descubierto que
      `ARQUITECTURA.md:106-123` describe un `/inventario` de una arquitectura vieja
      que ya no existe — ver ítem nuevo en 🩹 ARREGLAR, no se tocó por ser más ancho
      que esta sesión.

- [x] 2026-09-16 — **Facturación en tarjetas para celular (ítem 5 de la auditoría de
      amigabilidad; Felipe confirmó que sí entra desde el teléfono a veces).**
      `ComprobantesPanel.tsx` y `ProformasPanel.tsx`: la tabla (`min-w-[760px]`) queda
      para `sm:` (640px) y más ancho; por debajo, las mismas filas se pintan como
      tarjetas apiladas — mismo dato, sin columnas, sin scroll horizontal. Se extrajo
      `accionComprobante()` (botón Transmitir/Anular/Consultar + motivo de rechazo o
      anulación) y `proformasOrdenadas` para que tabla y tarjetas lean la misma lógica,
      no dos copias que puedan desalinearse. **Verificado en el navegador real, con
      Felipe autenticado como líder** (el límite de las sesiones anteriores — sin
      sesión de líder disponible — se resolvió cuando entró él mismo con su
      contraseña): 375px de ancho, con los 13 comprobantes y 1 proforma reales que ya
      había en el local, sin ningún desborde horizontal. `tsc --noEmit`, `pnpm lint`,
      `pnpm test` (239/239) en verde.

- [x] 2026-09-16 — **Auditoría de amigabilidad de Facturación: 3 de 5 hallazgos
      construidos, con el visto bueno de Felipe (pidió todos menos "conectar Ventas
      de hoy con Emitir", ver 🩹 ARREGLAR).** (1) `ComprobantesPanel.tsx`: motivo de
      rechazo de SUNAT ahora visible en la fila (existía en el tipo y en la
      consulta, `lib/comprobantes.ts:20`, y no se pintaba nunca). (2)
      `lib/proformas.ts`: las vigentes se traen aparte, sin el filtro de mes, para
      que una proforma abierta no se caiga de la vista al cruzar de mes — el resto
      de estados sigue por mes. (3) `ComprobantesPanel.tsx`: el resumen pasa de 3 a
      4 tiles — "Rechazados" ya no es una sub-línea roja dentro de "Pendientes de
      enviar". (4) `facturacion/page.tsx`: "Códigos de descuento" se movió de un
      link huérfano bajo el título a la fila de acciones junto al navegador de mes.
      Verificado `tsc --noEmit`, `pnpm lint`, `pnpm test` (239/239) en cada commit
      por separado (4 commits). **Sin demo en navegador autenticado como líder**
      (mismo límite que la sesión de ProformasPanel: este repo solo tiene login por
      contraseña, sin flujo de magic link/OTP en el frontend — verificado, no hay
      ninguna ruta `/auth/*` en `apps/web/app`). De paso salió un hallazgo nuevo, no
      tocado: "Monto facturado" suma comprobantes rechazados/anulados/de prueba —
      ver 🩹 ARREGLAR, es decisión de Felipe qué debe contar la cifra.

- [x] 2026-09-16 — **`ProformasPanel` migrado a `components/ui/campos.tsx` (ADR-0011).**
      Mostrado antes/después a Felipe (artifact interactivo) — aprobó "tal cual". Cambio
      puramente presentacional: `CampoSelect`/`CampoTexto`/`CampoMonto`/`Segmentado`/
      `Boton` en los dos modales (Nueva proforma, Convertir a comprobante); `onCrear`,
      `onConvertir`, `lib/proformas.ts` y la RPC sin tocar. Verificado `tsc --noEmit`,
      `pnpm lint` y `pnpm test` (239/239) en verde. Sin demo en navegador autenticado
      como líder en esta sesión (el atajo de magic link local no completó el canje de
      sesión) — dev server queda levantado en `localhost:3000` por si Felipe quiere
      verlo él mismo. Quedan los 6 modales del núcleo con los campos viejos — ítem
      "Campos viejos" más arriba en este archivo.

- [x] 2026-09-15 — **Colores: tipo visual y muestra real** (Sesión F2,
      `feat/colores-tipo-muestra`, sobre `DiegoN`). `colores.tipo`
      (sólido/textura/estampado — ortogonal a `familia_color`, que agrupa por
      matiz, no por naturaleza), `colores.imagen_muestra_url` y
      `colores.notas` internas (`20260915230000_colores_tipo_y_muestra.sql`).
      Bucket propio `retail-colores-muestras`, PÚBLICO a diferencia de
      `retail-compras-adjuntos` (privado) — decisión justificada en
      ADR-0061: una muestra de tela no tiene el problema de confidencialidad
      de una factura (RUC, montos), y público evita pedir URL firmada por
      cada una de las ~30+ muestras en cada render de la grilla. Columna
      simple en vez de tabla-aparte-con-RPC (como adjuntos de factura)
      porque la relación es 1:1, no 1:N — el candado de negocio real ya
      existe (`colores_write_lider`). `ColoresLista.tsx`: selector de tipo,
      subida de muestra (`lib/colores-muestra.ts`, mismo patrón de subida
      navegador→bucket que `lib/adjuntos-compra.ts`) y campo de notas en
      alta y edición; el listado muestra la muestra real si existe, si no
      el cuadradito de HEX de siempre (fallback intacto). Verificado en
      este entorno: `typecheck`, `lint`, `next build` y `vitest run`
      (215/215) limpios.

      **Fallback visual verificado en navegador real (2026-09-15, noche).**
      "Denim" del ejemplo original no existe — el vocabulario cerrado tiene
      30 nombres fijos y ninguno se llama así; se probó con "Estampado"
      (mismo mecanismo). Tipo=Textura + notas se guardan y persisten.
      **La subida real de la muestra sigue sin probarse un extremo a otro**:
      el contenedor `supabase_storage_cayla-retail` no está entre los que
      levanta este proyecto local (`docker ps` solo trae
      db/rest/auth/kong/studio/pg_meta/inbucket — Storage no corre acá), y
      el botón "Subir muestra" usa un `<input type=file>` oculto que la
      herramienta de navegador de esta sesión no puede completar. Se
      verificó igual el mecanismo de display (URL en `imagen_muestra_url` →
      se pinta la foto en vez del cuadrado de HEX) escribiendo una imagen de
      prueba directo en la fila vía SQL, no por Storage — y se revirtió al
      terminar. Antes de dar la subida por buena: levantar Storage local
      (agregarlo a `supabase/config.toml` si no está declarado, o confirmar
      por qué se excluyó) y subir una muestra real desde el botón.

- [x] 2026-09-15 — **`AjustarInventarioModal.tsx`: ajuste manual de stock por
      variante, con signo** (Sesión A2, `feat/productos-ajustar-inventario`).
      Reusa `retail.registrar_movimiento` (tipo='ajuste', ya existente desde
      `20260914230000_inventario_piso_almacen.sql`) — cero vías nuevas de
      escritura a `stock`. Motivos `reposicion`/`merma`/`conteo_fisico`/`otro`
      agregados a `ETIQUETA_PROCESO`/`PROCESOS_FILTRO` en `movimientos-reglas.ts`.
      Valida el stock negativo en pantalla (ADR-0023) antes de llamar a la RPC.
      Selector Piso de venta/Almacén de tienda cuando la ubicación los separa.
      Probado en navegador contra Tienda Lima / Blusa Valentina, verificado en
      `/movimientos`. Conectado al menú real de `/productos` por la Sesión B2
      el mismo día (ver ítem de integración final abajo).

- [x] 2026-09-15 — **Productos: integración final del bloque (Sesión B2,
      `feat/productos-acciones-masivas`)** — cierra A2+A3+B1. Menú "..." de
      cada fila: "Ajustar inventario" abre `AjustarInventarioModal` (modal de
      `useState`, con `ubicacionId`/`sububicaciones` de la sede del
      colaborador vía `persona.ubicacionId`); "Ver historial" navega a
      `/productos/[id]/historial`, que se abre como modal con ruta
      interceptada (`@modal/(.)[id]/historial`, mismo mecanismo que el
      detalle de factura de Compras) o como página completa por enlace
      directo/recarga. Acciones masivas sobre la selección: Activar/
      Desactivar (solo líder) hacen un solo `UPDATE ... WHERE id IN (...)` de
      `productos.estado` — sin RPC propia, ya alcanza con la RLS
      `productos_write_lider`; el trigger de historial se extendió
      (`20260915223000_historial_producto_estado.sql`) para no perderse esos
      cambios (el propio comentario de A3 avisaba de este hueco). Borradas
      las rutas de demo `productos/dev-ajustar-inventario` y
      `productos/dev/historial/[id]`. De paso: arreglada una colisión de
      timestamp entre dos migraciones de otra sesión anterior
      (`20260915120000_produccion_del_taller.sql` /
      `..._reparar_fk_transferencia_items.sql`, ambas ya en `main`) que
      rompía `supabase db reset` para cualquiera — se renombró la segunda a
      `20260915120001` (solo el archivo, sin tocar contenido). Verificado en
      Chrome headless con Playwright (login real, ambos modales, recarga
      directa del historial, acción masiva reflejada en el historial, las
      tres rutas dev ya no sirven el demo).

- [x] 2026-09-15 — **Categorías: editar y desactivar/reactivar** (Sesión C1,
      `feat/categorias-crud`). `/productos/categorias` solo tenía listado + alta;
      se agregó PUT/PATCH en `route.ts` con RPC `actualizar_categoria` /
      `desactivar_categoria` / `reactivar_categoria` (security definer, mismo
      patrón que `proveedores_administrables`). Decidido con Felipe: prefijo fijo
      una vez que hay productos con esa categoría; desactivar se bloquea (no solo
      avisa) si hay productos activos, con el conteo en el mensaje. De paso se
      cerró un candado que faltaba: `categorias.nombre` era `unique` plano
      (no bloqueaba "Blusas" vs "BLUSAS"); ahora usa `categorias_nombre_clave_unica`
      (`fn_clave_texto`, igual que colores/proveedores) — reemplaza
      `categorias_nombre_key`. Verificado en navegador contra Supabase local.
      **No está en producción** (`20260915160001_categorias_editar_desactivar.sql`
      pendiente de aplicar, junto con las demás migraciones del 2026-09-15 — el
      timestamp pasó de `160000` a `160001` al integrar todo en `diegoN`: chocaba
      con `productos_listado_filtros.sql`, mismo minuto exacto).

- [x] 2026-09-15 — **Vocabulario de colores: editar, desactivar y reactivar** (rama
      `feat/colores-crud`). El listado + alta ya existían; faltaba `PUT/PATCH` en
      `apps/web/app/api/productos/colores/route.ts` (mismo guard de Líder que el POST) y
      la pantalla para usarlo. Antes de desactivar cuenta `variantes` activas con ese
      `color_codigo` y bloquea si hay alguna — decisión de Felipe: se bloquea del todo,
      no se avisa y se deja seguir. El HEX no tiene candado técnico (nada en
      `movimientos`/ventas guarda una copia; catálogo/inventario/producción lo resuelven
      en vivo desde `colores.hex`) pero el formulario lo esconde detrás de "Cambiar
      color" para que no se mueva sin querer. Verificado en el navegador (login sin
      escribir contraseña, vía magic link del service role local): editar Amarillo,
      candado `colores_clave_unica` sigue rechazando "Crudo" → "  Amarillo  ", bloqueo
      de desactivar contra Azul marino (variantes activas reales), desactivar/reactivar
      Amarillo. `tsc`/`eslint` en verde.

- [x] 2026-09-15 — **Producción del Taller restaurada sobre V2** (ADR-0050). Migración
      reconstruida desde el Postgres local (el archivo se había perdido; tablas y RPC
      verificadas idénticas tras `db reset` + diff), `/produccion` con abrir / etapas /
      cerrar al inventario / anular / revertir, `lib/produccion-reglas.ts` con 8 tests,
      ítem en el nav para líder y para quien trabaja en el Taller. Ciclo completo probado
      por PostgREST con RLS real (stock 20→34→20, movimientos append-only).

- [x] 2026-09-12 — **Vocabulario cerrado (colores + categorías) y código corto
      portados a V2, sin fusionar la rama V1 entera — más `activos_fijos`
      rescatada.** El corte V1→V2 (`0af2f1b`) dejó `colores`/`categorias` sin
      el candado que evita "Azul marino" y "azul marino" como filas
      distintas, y sin código corto de prenda. Se evaluó fusionar
      `trix/catalogo-vocabulario` completa y se descartó: 350 archivos,
      mayoría módulos que V2 ya había borrado a propósito (Producción,
      Inventario V1, Finanzas), y `supabase/migrations/` habría quedado con
      los dos núcleos a la vez sin que Git lo marcara como conflicto. Se
      portó en cambio solo el vocabulario, como migraciones nuevas sobre el
      esquema real de V2: `colores_clave_unica` (vía `fn_clave_texto`) + los
      30 colores reales, `categorias.familia`/`prefijo` + las 37 reales, y el
      código corto acuñado por un TRIGGER en `variantes` (no una RPC — V2 no
      tiene una única función que cree variantes). De paso se rescató
      `activos_fijos` (39 filas reales en producción, sin tabla en V2),
      simplificada sin la FK a `cuentas_contables` (Contabilidad sigue sin
      dato real). Verificado: `db reset` limpio, candado de duplicados
      probado en vivo (rechaza "azul  MARINO"), catálogo del seed con código
      corto real asignado solo por el trigger, `tsc`/`eslint` en verde.
      **Pendiente:** ninguna pantalla lee `variantes.codigo` todavía — la
      base está lista, falta conectar la UI.
- [x] 2026-09-10 — **`registrar_venta` deja de duplicar una venta si la red se
      corta a mitad de un cobro (ADR-0032).** `registrar_venta` era atómica
      dentro de Postgres pero no idempotente hacia afuera: si la respuesta se
      perdía después del commit, un reintento de la Encargada entraba como
      venta nueva, con doble descuento de stock. Se agregó `p_token uuid`
      (uno por carrito, generado en `RegistrarVentaModal.tsx`) +
      `ventas.token_cliente` con índice único. Tres rondas de revisión
      adversarial encontraron y cerraron dos bugs reales antes de tocar
      producción: la primera versión devolvía la venta existente ANTES de
      validar el candado de sede (`retail.puede_operar_sede`) — un bypass de
      autorización real; la segunda dejaba la rama de la carrera concurrente
      (`exception when unique_violation`) sin la misma comparación de
      contexto (caja/método/monto) que sí tenía la rama normal. La versión
      final repite esa comparación en las dos ramas y valida sede/caja/estado
      siempre primero, con o sin token. Verificado en producción con consulta
      directa (no solo el `raise notice` del propio script) y con el
      verificador de `scripts/migraciones/` contra una foto fresca de
      producción: firma nueva de 5 argumentos activa, firma vieja ausente,
      `anon`/`PUBLIC` sin `EXECUTE`, cero filas de prueba dejadas atrás.
      `pnpm typecheck` limpio en los 3 paquetes.
- [x] 2026-09-10 — **`recalcular_stock()` vuelve a saber que el almacén
      existe, y de paso corrigió 2 filas de stock que ya estaban infladas
      (ADR-0031).** La versión vigente en producción (ADR-0020, "el neto en
      una pasada") se escribió antes de que existiera el almacén interno —
      producción ya tiene 4 contenedores tipo `almacen` reales y 9
      movimientos enrutados ahí que esa versión no conocía; invocarla
      habría mezclado el almacén de vuelta al piso. Se portó el diseño de
      `0044_almacen_interno.sql` (nunca pegado a producción con ese
      alcance), sumando el candado de Líder que se había perdido en el
      camino, el guard de `stock_minimo` (borde heredado de ADR-0020, ya
      anotado hace días en este archivo) y `EXECUTE` revocado de `PUBLIC`.
      Una revisión adversarial encontró y corrigió un bug antes de aplicar:
      sin una excepción para `tipo='traslado'`, un traslado hacia un
      contenedor de almacén (el mecanismo real de "devolver a almacén", hoy
      inalcanzable desde el frontend) se habría restado del piso de origen
      sin sumarse en ningún lado. Verificando la lógica contra los datos
      reales (por `select`, sin invocar la función) aparecieron 2 filas de
      `stock` con el doble conteo exacto de una entrada al almacén también
      contada como piso, del 2026-09-05 — corregidas a mano con confirmación
      explícita de Felipe (99→49 y 98→58 en Arequipa), sin tocar
      `movimientos`.
- [x] 2026-09-10 — La cabecera dice DÓNDE estás parado, y la tienda de Lima quedó
      entera. El selector mostraba `codigo` — que dejó de ser legible con la
      unificación: el Taller es `LIM` y la tienda de Lima es `003`. Ahora muestra
      una etiqueta derivada (`TND LIM`, `TLL LIM`, `TND AQP`, `TND TRU`, `CCO`) con
      la regla en `lib/etiqueta-sede.ts`, pura y con 9 pruebas que la fijan contra
      los datos reales de producción Y del seed local. Mismo trato para el lateral y
      para la pastilla de la Encargada. Rastreando eso apareció que `003` tenía
      `activo = false`: se podía vender ahí pero no cargarle un gasto ni un asiento
      (`egresos`, `registrar` filtraban por ese flag). El flag resultó ser de
      Dynamic (`retail.sedes` es una vista sobre `public.sedes.activa`) — Felipe
      decidió no escribir en la tabla de Dynamic y que retail deje de mirarlo:
      **ADR-0029**. Verificado antes de tocar nada que ni RLS ni `puede_operar_sede`
      bloqueaban por su lado. **Falta comprobarlo en navegador** (Docker apagado en
      la sesión): typecheck y 88 pruebas en verde, demo pendiente.
- [x] 2026-09-04 — Modal compartido `components/ui/Modal.tsx` sobre Radix Dialog
      (ADR-0003): los 6 modales del núcleo que seguían con estilos genéricos
      pre-brandbook (abrir/cerrar caja, vender, bajar a tienda, registrar gasto,
      movimiento de stock) migraron a los tokens CAYLA v3, y los 8 modales de la
      app ganaron foco atrapado + cierre con `Escape` (antes ninguno lo tenía,
      salvo `Ayuda.tsx` con lógica propia). Verificado en navegador con página de
      prueba temporal (borrada al cerrar). Sin adoptar ningún kit visual externo —
      Radix solo aporta comportamiento, el look sigue siendo 100% CAYLA.
- [x] 2026-07-19/23 — Producción del Taller construida de punta a punta más allá de
      lo registrado en BITACORA: costeo por margen de contribución (`0024`),
      registrar producción por corrida (`0025`), producción a nivel de modelo
      (`0026`), variantes estilo Shopify + "marcar terminado" → inventario
      (`0027`), corrección de producciones mal registradas (`0028`), y la orden de
      producción unificada con 6 etapas y 2 tipos (muestra/producción) en `0029` —
      reemplaza los dos mecanismos que se pisaban entre sí. **Commiteado, sin
      confirmación explícita de Felipe en producción todavía** (no hay entrada de
      bitácora que lo confirme, a diferencia de todo lo anterior).
- [x] 2026-07-16 — Fase 2 pivotada de finanzas a "Inventario Inteligente" (decisión de Felipe)
- [x] 2026-07-17 — Inventario Inteligente commiteado (`feat(inventario)`, `fix(movimientos)`, `docs`)
- [x] 2026-07-17 — Fix RLS: traslados visibles para la sede que los recibe → ADR-0001
- [x] 2026-07-17 — Fix: 4 filas duplicadas en `personas` bloqueaban el login de Felipe;
      agregado `unique(auth_user_id)` para que no se repita → ADR-0002
- [x] 2026-07-17 — Repo conectado a GitHub (`felipea92p-ux/cayla-retail`, privado) —
      antes solo existía en esta Mac, sin respaldo. Vercel conectado al repo para
      deploy automático en cada push; deploy de Inventario Inteligente confirmado
      en `cayla-retail.vercel.app`.
- [x] 2026-07-17 — Fase 2 financiera: Diario de Caja (apertura/cierre con conteo
      ciego), Gastos, Estado de Resultados (mermas como COGS). Verificado por Felipe
      en local. "Venta" se retiró del modal de movimiento genérico — el botón
      "Vender" es ahora la única fuente de verdad para registrar una venta.
- [x] 2026-07-17 — Fase 3: ingreso de mercadería y almacén — un almacén hermano por
      tienda (TRU-ALM/AQP-ALM/LIM-ALM), contenedores, `/almacen/recibir` (lotes),
      `/almacen` (stock + "Bajar a tienda"), devolución con motivo estructurado
      reutilizando `traslado`. Diseñado tras 24 preguntas de descubrimiento (no
      adivinado). Verificado en producción por Felipe.
- [x] 2026-07-17 — Taxonomía real de catálogo: `productos.categoria` (texto libre)
      → 6 familias fijas + 30 categorías en tabla `categorias`, editable por Líder
      sin deploy. Tallas sugeridas por categoría alimentan un `<select>` real en
      "Recibir mercadería". Migración `0009` corrida en Supabase y verificada en vivo.
- [x] 2026-07-17 — Endurecimiento de stock contra concurrencia (`0010`): `for update`
      al validar + `check (cantidad >= 0)` + FK de `movimientos.venta_id`. Cierra la
      condición de carrera que dejaba el stock en -1 con dos ventas simultáneas de la
      última unidad. Encontrado en la revisión nocturna, aprobado y corrido por Felipe.
- [x] 2026-07-18 — "Estancado" mide días sin venta real (`0011`): columna
      `stock.ultima_venta` sellada solo con motivo='venta'. Indicador renombrado a
      "Días sin venta".
- [x] 2026-07-18 — Las 5 RPCs security-definer validan la sede del que llama (`0012`,
      helper `fn_puede_operar_sede`). Cierra la puerta de atrás: nadie mueve stock ni
      cajas de otra sede por API directa.
- [x] 2026-07-18/19 — Identidad visual CAYLA aplicada (brandbook v3.0: Rojo #B8412D,
      Crema #F5F0E8, Tinta #1A1A18, EB Garamond + DM Sans) y rediseño UX total v3
      (AppShell, navegación lateral/móvil, catálogo agrupado, selector de sede del
      Líder). Verificado en vivo por Felipe.
- [x] 2026-07-19 — F1 núcleo financiero (jubilación de SINATRA): proveedores,
      depósitos, ajustes de efectivo, históricos, patrimonio (`0013`-`0014`). Fase B:
      etiquetas Brother con código de barras Code 128 propio, fotos por modelo,
      stock mínimo por sede (`0015`-`0016`). F2: órdenes de compra formales, export
      Excel, modelo de gastos corregido (`0017`). Producción del Taller v1: etapas,
      receta de costo (`0018`). C1: los 4 estados financieros completos por lectura,
      sin tocar money paths (`lib/contabilidad.ts`). Ayudas (!) educativas regadas
      por toda la app. Todo desplegado y verificado el mismo día.
- [x] 2026-07-19 — Motor contable de doble partida (`0019`-`0023`): plan de cuentas
      PCGE, `registrar_asiento` con cuadre forzado, activos fijos con depreciación
      NIIF/SUNAT automática, fix de recursión infinita en RLS de identidad.
- [x] ~2026-07-20/23, confirmado en producción 2026-09-03 — Unificación de
      identidad: retail deja de tener sus propias `sedes`/`personas` y pasa a
      leerlas de Dynamic vía un schema `retail` dedicado dentro del proyecto
      Dynamic, con vistas puente y RPCs migradas (`supabase/unificacion/01`-`11`).
      Verificado con Felipe contra el SQL Editor de producción: el schema
      `retail` existe, tiene 28 tablas (más que las ~22 originales — las
      migraciones de producción `0024`-`0029`, posteriores a la unificación,
      sumaron tablas nuevas encima), y `retail.sedes` devuelve 5 filas reales, no
      vacío. Descarta el riesgo que abrió esta auditoría: la app NO llevaba 6
      semanas rota. Pendiente solo la documentación (ver ARREGLAR).

## 📎 De sesiones previas de Claude Code (contexto, no repetir)

- `docs/CHECKLIST-MANANA.md` (17-jul) y `docs/PLAN-DE-TRABAJO.md` (19-jul): ya
  incorporados arriba, todo lo accionable de ahí quedó cerrado o migró a este
  backlog. Se conservan como registro histórico, no como pendientes activos.
