# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**Auditoría completa 2026-09-13.** Este archivo llevaba congelado desde el 12-sep,
pero el repo tuvo desde entonces un corte de arquitectura completo (V1→V2, `0af2f1b`,
fusionado a `main` el mismo 12-sep) que **removió módulos enteros** — Finanzas,
Producción, Inteligencia, Taxonomía/importador de catálogo con IA — y construyó
Compras, Colaboradores (allowlist) y "vender emite comprobante al cobrar" sobre el
esquema nuevo. Casi todo lo que este archivo tenía abierto quedó obsoleto de un
salto: no es que se haya resuelto, es que el código que describía ya no existe —
se retiró en vez de arrastrarlo. Detalle del corte en `docs/BITACORA.md` (12-sep) y
de esta auditoría en la entrada del 13-sep, que incluye el hallazgo más importante:
**Compras, Colaboradores y Venta-con-comprobante ya están en producción**,
confirmado consultando la base directamente — ningún documento del repo lo decía.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [ ] **Catálogo real — el censo de 300-900 SKUs sigue en cero.** Producción tiene
      6 productos / 36 variantes de prueba (`supabase/migrations/datos-prueba-catalogo-produccion.sql`,
      "mientras retail sigue en etapa de pruebas"), no el catálogo de las 3 tiendas.
      **Desbloquea:** que Vender, Compras y el stock por ubicación dejen de ser una
      demo y empiecen a reflejar el negocio real — hoy no hay ningún motivo TÉCNICO
      para seguir esperando: V2 ya soporta venta con comprobante en la misma
      transacción, compras con factura como eje, y colaboradores reales operando.
      **Depende de:** que Felipe confirme si el plan de censo de julio (piso de
      tienda, código corto nuevo, escaneo desde el día uno porque casi toda la
      prenda ya trae código de fábrica) sigue vigente tal cual sobre el esquema V2,
      o si algo cambió con el corte. **Reversible:** sí — es carga de datos, no
      cambio de esquema. **Por qué importa:** sin esto, cada demo de Vender o
      Compras es un ensayo, nunca el negocio operando; es el desbloqueador más
      grande del proyecto desde julio y sigue siéndolo.

- [ ] **Tests automatizados para Compras y Venta-con-comprobante — cero cobertura
      en el núcleo que más cambió este mes.** Los 95 tests de hoy son lógica pura
      (Vitest: `documento`, `error-escritura`, `lucode`, `padron`, `panel-serie`,
      `proformas`, `registro-contable`, `conteo-varianza`, `etiqueta-sede`); ninguno
      ejercita `registrar_compra`, `registrar_pago_compra`, `anular_compra`,
      `recibir_compras` ni el camino nuevo de `registrar_venta` emitiendo
      comprobante en la misma transacción (`0011_venta_con_comprobante.sql`).
      **Desbloquea:** poder tocar ese código sin depender solo de que Felipe lo
      pruebe a mano en el navegador. **Depende de:** nada, se puede empezar hoy.
      **Reversible:** sí, es aditivo. **Por qué importa:** es dinero real y
      documentos legales ante SUNAT — el tipo de código donde un bug se nota con
      la clienta esperando en caja, exactamente el criterio que ya justificó las
      302 pruebas pgTAP del proyecto hermano Dynamic (ver también MEJORAR).

- [ ] **Decidir con Felipe: ¿qué queda de `personas.rol` (líder/integrante)?**
      Desde `0012_control_total_temporal.sql`, `fn_es_lider()` es un simple alias
      de `fn_tiene_acceso_retail()` — estar en la allowlist de colaboradores YA es
      control total (anular comprobantes SUNAT, cerrar conteos, aprobar
      devoluciones, registrar series), sin distinguir líder de integrante. Es una
      decisión deliberada y documentada en el propio código ("Felipe no pidió
      graduar roles, pidió filtrar quién entra"), pero sigue siendo una pregunta de
      negocio abierta, no técnica: ¿alguna colaboradora NO debería poder anular un
      comprobante o aprobar una devolución? **Depende de:** nada técnico — es
      decisión de Felipe. **Reversible:** sí, `fn_es_lider()` es una función de una
      línea. **Por qué importa:** hoy "estar autorizado a entrar al sistema" y
      "poder hacer cualquier cosa dentro" son la misma cosa; vale la pena que sea
      una elección consciente y no una herencia de cómo se escribió el código la
      primera vez.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [ ] **`migraciones_aplicadas` se perdió en el corte V1→V2, y hoy nadie sabe con
      certeza qué de `supabase/migrations/*` ya corrió en producción sin ir a
      preguntarle a la base directamente.** Existió (18 filas reales, confirmado
      2026-09-12) pero sus archivos fuente (`0058_migraciones_aplicadas.sql` local,
      `38_migraciones_aplicadas.sql` en `unificacion/`) fueron borrados por el
      corte y no volvieron. Peor: hoy se confirmó (consulta directa a producción,
      13-sep) que Compras, Colaboradores y Venta-con-comprobante **ya están
      desplegados**, sin que exista un solo archivo en `supabase/unificacion/` que
      lo documente — alguien las pegó directo la noche del 12-sep.
      **Depende de:** nada, es aditivo. **Reversible:** sí. **Por qué importa:** es
      la causa raíz de la falsa alarma de hoy (ver BITÁCORA 2026-09-13, donde
      `pnpm datos:comparar` reportó "23 funciones rotas" que resultaron ser un
      diccionario desactualizado) — sin este registro, cada sesión nueva tiene que
      volver a preguntarle a la base qué es verdad, con el riesgo de escribir un
      incidente falso o, peor, no notar uno real.

- [ ] **`/almacen` redirige a una ruta que no existe (`/inventario/almacen`, 404
      real), y 3 componentes huérfanos sobrevivieron al corte V1→V2 sin que nada
      los importe.** `apps/web/app/(app)/almacen/page.tsx` y
      `.../almacen/recibir/page.tsx` solo hacen `redirect()` a rutas del inventario
      V1 que el corte ya borró; `InventarioNav.tsx`, `FinanzasNav.tsx` y
      `AnclarVocabulario.tsx` no los importa ningún archivo del árbol actual.
      **Depende de:** nada. **Reversible:** sí, es borrar código muerto.
      **Por qué importa:** un enlace roto real (no hipotético) es el tipo de cosa
      que una colaboradora encuentra sola en producción, no en una revisión de
      código — y el principio 3 (simplicidad radical) pide no dejar código que
      nadie ejecuta.

- [ ] **`supabase/migrations/benja-migracion.sql` (2794 líneas) es un dump de
      referencia ya superado, marcado "NO CORRER" en su propio encabezado, y sigue
      en el árbol confundiendo qué es una migración real.** Su propio contenido
      describe producción como "V1, 28 tablas" — dato que hoy es falso (V2, y con
      Compras/Colaboradores ya encima). **Depende de:** confirmación de Felipe — el
      modo automático bloqueó el borrado por ser una acción destructiva,
      correctamente. **Reversible:** sí, queda recuperable del historial de git si
      algún día hiciera falta. **Por qué importa:** barato de resolver, y cada día
      que queda es un día más en que alguien nuevo puede confundirlo con una
      migración pendiente de correr.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [ ] **pgTAP para el núcleo de dinero/inventario — cero cobertura contra Postgres
      real.** Cayla Dynamic (proyecto hermano, mismo Supabase) corre 302 pruebas
      pgTAP sobre su propio dinero; acá `registrar_venta`, `cerrar_caja`,
      `registrar_compra` y el resto de las funciones `security definer` solo tienen
      verificación manual en vivo por Felipe. **Depende de:** nada, se puede
      empezar por una sola función. **Reversible:** sí. **Por qué importa:** es la
      misma clase de riesgo que el ítem #1 de ARREGLAR, pero del lado del código en
      vez de la documentación — el día que alguien toque `registrar_venta` sin
      querer romper el candado de idempotencia (ADR-0032), un test en Postgres lo
      cacha antes que una colaboradora con la clienta esperando.

- [ ] **9 componentes V2 nuevos se construyeron con los strings viejos de
      `ui/Modal.tsx` en vez del patrón con estado real de `ui/campos.tsx`
      (ADR-0011).** `VenderFormV2`, `CompraDetallePanel`, `AbrirCajaFormV2`,
      `RecepcionFormV2`, `CerrarCajaModalV2`, `CambioFormV2`,
      `MoverMercaderiaFormV2`, `ProformasPanel`, `PuntoDeVenta`,
      `MovimientoCajaModal` — el código nuevo siguió creciendo sobre el patrón que
      se suponía iba a reemplazarse pantalla por pantalla, mientras 12 componentes
      sí adoptaron el nuevo. **Depende de:** nada. **Reversible:** sí.
      **Por qué importa:** cada pantalla nueva construida con el patrón viejo es
      una pantalla más que migrar después — más barato migrar ahora que la
      superficie todavía es chica.

- [ ] **Local-first de lecturas (Fase 2, ADR-0013) — catálogo/stock/precios
      replicados al navegador para pintar en 0 ms y seguir operando con el wifi
      caído.** Sigue sin empezar; solo Fase 0/1 (cascadas `Promise.all`,
      `staleTimes` en `next.config.ts`) están aplicadas. **Depende de:** que el
      catálogo real ya esté cargado — si no, no hay nada real que replicar; por eso
      va después de "Catálogo real" en CONSTRUIR, no antes. **Reversible:** no
      aplica en el sentido de riesgo (es aditivo, las escrituras siguen sin
      replicarse — principio 4). **Por qué importa:** con 3 tiendas + 1 taller y
      menos de 2 MB de negocio completo, es un salto de UX inusualmente barato para
      este tamaño de operación.

---

## 📚 CONCEPTOS PENDIENTES DE ENSEÑAR

- [ ] **Schema de Postgres como "cajón" aislado** — `public` (Dynamic) y `retail`
      pueden vivir en el MISMO proyecto Supabase sin verse entre sí a menos que algo
      los conecte a propósito (las vistas puente y las FKs cruzadas hacia
      `public.personas`/`public.sedes`, ver `docs/datos/generado/retail_fks_cruzadas.json`).
      Sigue siendo la pieza que explica por qué "cambiar una palabra en el
      cliente" puede romper todo, y por qué el SQL Editor de producción necesita
      el prefijo `retail.`.
- [ ] **`security definer`** — por qué `fn_aplicar_movimiento`, `registrar_venta`,
      `registrar_compra` y el resto de las RPCs de dinero/inventario pueden
      saltarse RLS, y por qué eso es seguro *solo* porque cada una valida todo
      adentro (`fn_puede_operar_ubicacion`, cuadre del comprobante, etc.) — el 90%
      de la superficie de ataque real de este sistema vive en esa validación
      interna, no en las políticas de RLS.
- [ ] **Un archivo generado no es una conexión viva** — el hallazgo del 13-sep:
      `docs/datos/generado/funciones-produccion.txt` es un volcado pegado a mano
      desde el SQL Editor de producción, no una consulta en tiempo real. Si nadie
      lo refresca después de un cambio de esquema real, miente — y puede mentir en
      la dirección más cara ("esto está roto") tanto como en la más cómoda ("está
      todo bien"). La regla de oro de `CLAUDE.md` (una migración no está terminada
      hasta que su tabla está en el diccionario) no es higiene, es lo único que
      distingue un diagnóstico de una suposición.
- [ ] **Allowlist de acceso vs. rol de negocio** — por qué "puede entrar al
      sistema" (`retail.colaboradores`) y "qué puede hacer una vez adentro"
      (`personas.rol`) son dos preguntas distintas que hoy están fusionadas en
      `fn_es_lider()` (ver CONSTRUIR #3) — y qué se gana o se pierde en cada
      dirección si se separan.

## ✅ CERRADO (últimos, con fecha)

- [x] 2026-09-14 — **Los tres flujos verificados en NAVEGADOR, no solo por consulta a
      la base: Vender-con-comprobante, Compras y Colaboradores funcionan de punta a
      punta.** Entorno local completo (stub de Dynamic, ADR-0033) + usuario semilla
      `felipe@cayla.local`. Vender emitió boleta B001-000001 en la misma transacción
      que la venta; Compras registró factura F001-000123, la pagó y recibió contra
      ella (stock quedó en 15 = 6 − 1 + 10, exacto); Colaboradores listó a Felipe y
      Micaela con su sede real de Dynamic y el candado "nadie se quita su propio
      acceso" respondió en pantalla tal cual el código lo promete. Detalle completo,
      incluido un segundo susto (Docker cayéndose a mitad de prueba, no un bug de la
      app) en `docs/BITACORA.md` (2026-09-14). **Dos hallazgos menores, sin bloquear:**
      (1) ninguna llamada a Supabase tiene timeout explícito — con la base caída, la
      app tarda ~50s en degradarse a `/login` en vez de fallar rápido; (2) el botón
      "Agregar colaborador" se deshabilita sin explicar por qué (no hay nadie de
      Dynamic disponible) — un líder real, con todo su equipo ya autorizado, vería lo
      mismo sin saber que es normal.

- [x] 2026-09-13 — **Confirmado en producción por consulta directa (no por un
      documento): Compras, Colaboradores (allowlist) y Venta-con-comprobante ya
      están desplegados.** Nadie lo había anotado en ningún lado del repo. Se
      refrescó el volcado de `docs/datos/generado/` contra la base real (35 tablas
      con columnas, antes 28 — dato de un diccionario generado 6 minutos antes del
      corte V1→V2) y `pnpm datos:comparar` pasó de reportar "23 funciones rotas"
      (falsa alarma) a **0 rotas**. Detalle completo, incluida la causa raíz, en
      `docs/BITACORA.md` (2026-09-13). De paso: `docs/adr/0035` estaba duplicado
      (dos decisiones distintas nacidas el mismo día con el mismo número) —
      resuelto renumerando la de vocabulario a **ADR-0042**; y el título interno de
      `docs/adr/0041-taxonomia-captura-real.md` seguía diciendo "ADR-0003" desde un
      rename del 12-sep que nunca tocó el contenido — corregido.

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
