# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**Auditoría completa 2026-09-03.** BITACORA.md y este archivo llevaban congelados
desde el 19-20 de julio, pero el repo tiene commits reales hasta el 23 de julio —
incluida una fase entera de "Unificación" (9 pasos + fixes) sin documentar en
ningún lado. Se cierra esa brecha aquí. Ver el hallazgo #1 de ARREGLAR: es el más
importante que ha entrado a este archivo desde que existe.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

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
- [ ] **`censo`: los bloques que faltan.** Sesiones de conteo (`conteos` +
      `conteo_lineas` + RPCs, con `cantidad_sistema` congelado al contar y cierre
      solo por Líder = la aprobación que pidió Felipe), la pantalla de captura por
      matriz (talla × color, una tarjeta por color en móvil), la pantalla de
      conteo con la pistola, el resumen de varianza, y etiquetas en lote. **Ojo al
      entrar al frontend: hay otra sesión trabajando ahí** (`AppShell.tsx`,
      `vender/`, los modales) — coordinar antes.
- [ ] **`recalcular_stock` borra el `stock_minimo` de una variante sin
      movimientos.** Borde heredado de ADR-0020, encontrado al extender esa
      función para el almacén: `fijar_stock_minimo` crea una fila de `stock` con
      cantidad 0 solo para guardar el mínimo, y el `delete` final la borra si esa
      variante todavía no tiene ningún movimiento en esa sede. Se dejó anotado en
      el comentario del bloque 7 de `0044` en vez de cambiarlo por cuenta propia,
      porque es una decisión de quien escribió ADR-0020. Arreglo probable: sumar
      `and s.stock_minimo is null` al `delete`.
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
- [ ] **`crear_producto_con_variantes`: construido y verificado (build/lint,
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
- [ ] **`padrón RENIEC/SUNAT`: construido y verificado 2026-09-05 — falta que
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

- [x] **Streaming en las 10 pantallas: hecho y verificado, con resultado NEGATIVO en
      tiempo — 2026-09-09, ADR-0021.** Funciona mecánicamente (el HTML trae el esqueleto
      y llega en 3 trozos), pero **no movió los tiempos**: TTFB 131→124 ms y carga total
      750→730 ms, dentro del ruido. La razón: entre el primer byte y el HTML completo solo
      hay ~100 ms, así que había poco que repartir. Se mantiene porque cambia QUÉ se ve
      durante la espera (estructura en vez de "Cargando…"), no por velocidad. **No volver
      a proponer streaming como solución de rendimiento en este repo.**
- [ ] **Terminar de aplicar `exigir()`/`tolerar()`: quedan ~15 lecturas que fallan en
      silencio — 2026-09-09.** La auditoría encontró 20 consultas que descartaban el error
      de Supabase contra 1 que lo revisaba. Se arreglaron los tres cimientos donde un dato
      falso es una decisión falsa (`finanzas.ts`, `catalogo.ts`, `sedes.ts`) y se creó
      `lib/resultado.ts` con los dos comportamientos que decidió Felipe. **Faltan** los
      demás: `comprobantes.ts`, `proformas.ts`, `produccion/page.tsx`,
      `inventario/almacen/page.tsx`, `inventario/proveedores/page.tsx`,
      `finanzas/activos/page.tsx`, `api/export/inventario`, `api/padron`, y las rutas de
      `api/lucode/*`. Regla para elegir cuál va con cuál: si alguien puede tomar una
      decisión de negocio mirando ese dato, `exigir()`; si es un listado de apoyo,
      `tolerar()` con su franja de aviso.
      **Sin verificar todavía:** que `(app)/error.tsx` efectivamente atrape en vivo. Está
      en la ruta correcta y el build la registra, pero probarlo exige una sesión iniciada
      —el layout redirige al login antes de renderizar— y no se pudo cerrar esa prueba.
      Es lo primero que hay que confirmar al retomar.

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

- [ ] **Verificar en vivo el camino de venta con la pistola Zebra.** Lo construido el 09-09
      (escaneo dentro del modal de venta, Enter que ya no registra la venta a medio
      escaneo, tope contra el stock de la sede, acuse con el monto) pasa build, lint,
      tsc y 77 pruebas, **pero no se pudo probar en el navegador**: el layout redirige al
      login y no corresponde que Claude escriba la contraseña. Hay que hacerlo con la
      pistola real, no simulando el tecleo: confirmar que un escaneo agrega la prenda, que
      dos escaneos seguidos NO cierran la venta, y que el foco vuelve al buscador solo.

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

- [ ] **`retail.stock_almacen` no existe en local — 2026-09-09.** Solo la crea
      `supabase/unificacion/12_almacen_interno.sql`, que es de producción;
      ninguna migración de `supabase/migrations/` la tiene. `lib/catalogo.ts`
      la consulta sin revisar el error, así que en local devuelve `{}` en
      silencio: el almacén se ve vacío y "Recibir mercadería" / "Bajar a tienda"
      no son verificables en local. Cuarto caso del patrón de migraciones
      duales (con ADR-0004, ADR-0006 y las categorías). Es también lo que
      impide verificar la línea "Incluye S/X en almacén" del Inicio sin
      producción.

- [ ] **Dos `.env.local` y uno de ellos con basura — 2026-09-09.** El de la raíz
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
- [ ] `pruebas`: un solo archivo de test (`registro-contable.test.ts`) para todo el
      núcleo de dinero e inventario — `registrar_venta`, `cerrar_caja`,
      `fn_aplicar_movimiento`, las RPCs de producción, no tienen prueba
      automatizada, solo verificación manual en vivo por Felipe. Cayla Dynamic
      (proyecto hermano) corre 302 pruebas pgTAP sobre su propio dinero; acá el
      principio 7 ("pasos verificables") se cumple con el navegador pero no queda
      capturado para que no se repita un bug ya resuelto.
- [ ] `unificación retail↔dynamic`: confirmada aplicada y con datos (ver CERRADO),
      pero sin documentar formalmente — falta el ADR que debió escribirse en
      julio (principio 8) y el `02_*.sql` que crea el schema en sí nunca quedó en
      el repo (se infiere solo de la cabecera de `03_candados.sql`). Deuda de
      documentación, no de funcionamiento. Reversible: sí, es solo escribir.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [ ] **`cacheComponents` (Fase 1b del ADR-0013) — NECESITA SU PROPIA SESIÓN, no es
      un flag que se prende.** Es lo que haría que el armazón (nav, cabecera) aparezca
      al instante mientras los datos entran por streaming — la mejora de percepción más
      grande que queda. Pero medido contra este repo el 2026-09-09, la migración toca:
      **16 puntos de IO síncrono** (`Date.now()` / `new Date()` en `finanzas.ts`,
      `finanzas-nucleo.ts`, `inteligencia.ts`, `panel.ts`, `lucode.ts`, `comercial/page.tsx`,
      `vender/page.tsx`, `producto/[varianteId]/page.tsx`, `api/export`, `api/padron`) que
      con `cacheComponents` son **error de build durante el prerender**, y que el escape
      `instant = false` explícitamente NO perdona — hay que envolver en `<Suspense>` y
      llamar `connection()` antes, o mover a componente de cliente; y **24 archivos** que
      llaman `requirePersonaActual()` → `cookies()`, cada uno necesitando su boundary de
      Suspense. Además `revalidate`/`dynamic`/`fetchCache` pasan a `use cache` + `cacheLife`,
      y `<Activity>` cambia el ciclo de vida: el estado de componentes **sobrevive** a la
      navegación, así que desplegables y diálogos abiertos se quedan abiertos al volver
      (hay que revisar los 8 modales). Vercel publica una skill oficial para conducirla:
      `npx skills add vercel/next.js --skill next-cache-components-adoption`, con modo
      incremental que abre un PR mecánico por ruta.
      **Medido el 09-09 activando el flag de verdad, no estimando:** `instant = false` en
      `(app)/layout.tsx` **NO cascadea** a las páginas hijas — el error solo saltó de
      `/almacen/recibir` a `/inventario/proveedores`. Son ~28 opt-outs, uno por página. Y
      el opt-out por sí solo **no da ningún beneficio**: solo difiere la validación. El
      beneficio real exige que el layout deje de bloquear en `requirePersonaActual()`, y
      ese layout alimenta `AppShell` (nav + selector de sede) — o sea que la parte que de
      verdad paga es reestructurar el armazón, justo lo que el rediseño del riel (ADR-0014)
      está tocando. **No se hizo el 09-09 porque otras
      sesiones tenían abiertos `app/(app)/page.tsx`, `lib/panel.ts` y el rediseño del riel
      del lateral (ADR-0014)** — y esta migración toca casi todas las páginas. Retomar
      cuando el árbol esté quieto.
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
- [ ] Campos viejos: `ProformasPanel`, `EfectivoPanel` y los 6 modales del núcleo
      siguen con los strings `campoTexto`/`campoSelect`/`botonPrimario` de
      `ui/Modal.tsx`. `components/ui/campos.tsx` (ADR-0011) ya los reemplaza en
      Facturación con campos que sí tienen estado (hilo de foco, desplegable propio,
      segmentado). Migrar pantalla por pantalla, nunca de un saque: los strings
      viejos siguen exportados justamente para que la migración sea opcional.
      Esperar a que Felipe confirme que le gusta el diseño en Facturación primero.

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
