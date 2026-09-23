# ADR-0161 — Responsable en cada operación de tienda, y se retoma el ADR-0150 (roles) con las terminales dentro

**Fecha:** 2026-09-22 · **Estado:** decidido por Felipe; **spike aprobado el 2026-09-22**
(`docs/maquetas/responsable-y-roles-spike-2026-09/`). Nada construido ni aplicado todavía ·
**Origen:** conversación del 2026-09-22 tras fusionar el ADR-0160 (cuentas terminal), cuatro rondas de preguntas.

## El problema

El ADR-0160 creó cuentas **compartidas** por tienda (terminal de ventas y terminal administrativa). Una cuenta compartida
responde «qué tienda hizo esto», pero no «qué persona lo hizo». Si falta plata en la caja de TRU, o si alguien ajusta
stock a mano, lo único que queda escrito es «Terminal Ventas TRU». El ADR-0160 lo resolvía solo en la venta
(«¿quién atiende?», D-62) y dejaba el resto a «rotar la clave». Felipe pide que **toda** operación diga quién la hizo.

Además pide que qué módulos ve cada terminal y qué acciones hace dentro **no quede fijo en el código**. Eso es el
ADR-0150 (roles a medida), que se había abandonado esta misma mañana en la fase F1.

## Decisiones (Felipe, 2026-09-22)

### A. El combo «Responsable»

| # | Decisión | Lo que implica |
|---|---|---|
| A1 | **Se elige en cada operación**, no una vez por turno | Un combo más en cada guardado. Trazabilidad exacta, más fricción. |
| A2 | **Solo se elige el nombre**, sin PIN | Rápido. **Riesgo aceptado:** cualquiera puede poner el nombre de una compañera. |
| A3 | **Solo aparece quien marcó entrada hoy en esa tienda y no marcó salida** (asistencia de Dynamic) | La lista es «quién está en la tienda ahora». |
| A4 | **Si no hay nadie, la operación se bloquea**, sin «Otra persona» | Contradice a propósito la D-62 («nunca un filtro duro»). **Riesgo aceptado:** ~3 % de marcas llegan con más de 10 min de retraso. Mientras tanto, esa persona no puede guardar. |
| A5 | **Tienda LIM se bloquea igual** | Hoy LIM tiene 0 personas, horarios y marcas en Dynamic. **Sus terminales no podrán guardar nada hasta que se cargue su asistencia.** |
| A6 | **Viene vacío siempre** — *cambiado el 2026-09-22, ver «Actualización: el combo propone a quien inició sesión» al final* | Nunca se hereda el nombre de la operación anterior. |
| A7 | **Toda acción que guarda lo pide; mirar no.** Es fijo: no se configura por rol | Una sola regla, sin lista que mantener. |
| A8 | *Ampliada el 2026-09-23: ahora en TODA operación, ver «Actualización 2026-09-23 (c)» al final.* **Sale en todas las cuentas**, no solo en las terminales, **en la operación de tienda**: Ventas, Caja, Cambios, Devoluciones, Facturación, Inventario, Traslados, Catálogo | Compras, Producción del Taller, Colaboradores y Configuración firman con la persona que inició sesión, como hoy. |
| A9 | **El líder también se bloquea si no marcó** en esa tienda, incluso trabajando desde casa (Felipe lo confirmó dos veces) | **Consecuencia:** sin marcar asistencia en una tienda, Felipe no puede crear ni editar una prenda, ajustar stock ni tocar la caja. |
| A10 | **Un líder aparece en la lista** si marcó en esa tienda | Misma regla para todas y todos. |
| A11 | **La lista sale de la sede activa** de la cabecera | Si el líder cambia de TRU a AQP, la lista cambia. |
| A12 | **Se ve después** en cada historial (columna «Responsable») y en el cierre de caja (quién cerró y quién hizo cada ingreso o egreso) | No hay reporte por persona ni filtro por responsable, por ahora. |

### B. Roles a medida: se retoma el ADR-0150, con las terminales dentro

| # | Decisión |
|---|---|
| B1 | **Se retoma el ADR-0150** para todas las cuentas. Las terminales son una cuenta más con su rol: «Terminal de ventas», «Terminal administrativa». |
| B2 | **Un rol decide solo «ve / no ve» por módulo** (Felipe, 2026-09-22: «no hay que complicarnos»). Se probó una matriz Ver/Crear/Editar/Eliminar con acciones internas y se descartó ese mismo día. **Quien ve un módulo hace todo lo que hay en él**; en el editor, cada módulo dice qué incluye. Esto es la decisión 2 del ADR-0150, pero por **módulo** en vez de por pantalla. |
| B2b | **Excepción fija: siempre solo del líder**, aunque el rol vea el módulo. Todas son decisiones ya tomadas antes: anular una venta o un comprobante y las series de SUNAT (ADR-0150, 4); autorizar un descuento sobre el tope (D-67); aprobar devoluciones y poner etiquetas con descuento (ADR-0160); ver costos, márgenes y montos de Compras (ADR-0126); y Colaboradores, y Roles y accesos (ADR-0150, 3). |
| B2c | **Solo el rol Líder es fijo.** **Integrante se edita** como cualquier otro rol; lo único que no se puede es archivarlo, porque es el que recibe una persona nueva. **Cambia al ADR-0150**, que dejaba fijos los dos roles de sistema. |
| B2d | **Consecuencia que Felipe debe confirmar:** encender un módulo da todo lo que hay en él. Hoy un integrante ve Existencias, Productos y Caja, pero no puede ajustar stock, editar precios ni cerrar caja (ADR-0143). Con esta regla, si su rol ve esos módulos, podrá. |
| B3 | «Pide Responsable» **no** es configurable (A7). |
| B4 | **Facturación sí se delega en parte:** emitir y reenviar a SUNAT. Anular y las series siguen siendo solo del líder. La decisión 4 del ADR-0150 ya la había cambiado el ADR-0160, que dio Facturación a la terminal de ventas; aquí queda escrito. |
| B5 | Las demás decisiones del ADR-0150 siguen: solo el líder administra roles, un rol por persona, catálogos de Dynamic y retail separados, acceso explícito con ubicación. *(Cambiado por B6/B7: los roles también los administra quien tenga el módulo Roles y accesos.)* |
| B6 | **(Felipe, 2026-09-22, después del spike) Se abren los 5 módulos «Solo líder por ahora»:** Etiquetas, Facturas de compra, Por pagar, Notas de crédito y Análisis se asignan a cualquier rol, y quien los tiene los usa completos. **Montos de Compras:** los ve quien tenga Facturas de compra, Por pagar o Notas de crédito (sin montos, Notas de crédito no sirve); «Ver costos, márgenes y montos de Compras» sale de B2b (cambia el ADR-0126). **Etiquetas:** con el módulo se crean, editan, aprueban y archivan etiquetas SIN descuento y se ponen en prendas; lo que lleva descuento (crearla, editarla, ponerla o quitarla de una prenda) sigue siendo del líder. **Análisis:** el rol analiza SU sede, con costo y stock de la red. Migración `20260923130000_abrir_modulos_a_los_roles.sql`. |
| B7 | **(Felipe, 2026-09-22, cambio de alcance) Colaboradores, y Roles y accesos, también se asignan a cualquier rol** (dejan de ser `solo_lider`): dar, quitar, suspender y reactivar accesos, cambiar ubicación, aprobar altas, terminales (ver, crear, cambiar clave, desactivar, reactivar), y crear, editar, duplicar, renombrar, archivar, restaurar y asignar roles. Quien tiene Roles y accesos puede editar SUS propios módulos (queda en `roles_historial`). Migración `20260923131000_colaboradores_y_roles_delegables.sql`. |
| B8 | **Tres protecciones mínimas — decisión de arquitectura, revisable (Felipe puede vetarlas):** (1) el rol «Líder de equipo» sigue fijo: nadie lo edita ni lo archiva; (2) a un líder solo lo toca un líder: quien no es líder no puede subir a nadie a Líder, ni cambiarle el rol o la sede, quitar, suspender o reactivar a un líder (un líder sí sube y baja líderes, `20260923110000_cambiar_rol_entre_lideres`); (3) nunca quedan cero líderes activos: no se quita, suspende ni baja al último (`fn_exigir_puede_tocar_colaborador` y `asignar_rol`). Se conserva «nadie se cambia su propio rol». Con B6-B8, B2b queda así: anular venta o comprobante y series SUNAT, descuento sobre el tope, aprobar/rechazar devoluciones, etiquetas con descuento y las tres protecciones. |

### C. Cómo se trabaja

| # | Decisión |
|---|---|
| C1 | **Spike visual primero**, con cuatro pantallas: editor de roles, combo en una venta, cierre de caja, nadie de turno. No se construye nada hasta que Felipe lo apruebe. |
| C2 | **Responsable y roles se construyen en paralelo**, en dos sesiones coordinadas por este ADR y el BACKLOG. |
| C3 | **La migración del ADR-0160 se pega ya**, con los permisos fijos. El módulo de roles cambiará después solo el interior de las 5 capacidades `fn_puede_*()`, que pasarán a leer la tabla de roles. Las 23 funciones que las llaman no se vuelven a tocar. |

## Cómo se construye (decisiones técnicas de arquitectura, no de negocio)

**1. El candado va en la base, no solo en la pantalla (principio 2).** Si solo la pantalla exigiera el combo, una
llamada directa a la API guardaría sin responsable. Por eso la base valida que la persona indicada **está presente
ahora** en la sede de la operación. Para eso reutiliza la lógica de `retail.fn_asesoras_de_turno`, que ya está en
producción y devuelve `presente | en_pausa | salio | programada` desde `public.marcajes` y `public.jornadas`.

**2. Cómo viaja el responsable: un encabezado de la petición, no un parámetro nuevo en cada función.** Hay que cubrir
alrededor de 40 funciones de escritura. Agregarles un parámetro cambia su firma, y el ADR-0026 ya mostró que eso deja
dos versiones vivas a la vez. En su lugar:
- La web manda `x-responsable: <persona_id>` en cada escritura.
- `retail.fn_responsable_actual()` lo lee de `current_setting('request.headers')`, valida que esa persona esté
  «presente» en la sede y, si no, lanza la excepción.
- Cada función de escritura de tienda llama a `fn_responsable_actual()` una sola vez, y el valor se guarda en una
  columna `responsable_id` que referencia `public.personas`, igual que `ventas.asesora_id`.

La inyección en las funciones sigue el patrón del ADR-0160: leer la definición real con `pg_get_functiondef` y exigir
el número exacto de ocurrencias. **El equipo de construcción debe probarlo antes de comprometerse:** que PostgREST pase
el encabezado dentro de las RPC de Supabase, y cómo se comporta en las ventas offline que se sincronizan después.

**2b. Un módulo es una llave que la base revisa.** Cada módulo es una clave de `retail.permisos` (`caja`, `productos`,
`traslados`…) que sus funciones comprueban con `fn_tiene_permiso('caja')`. Si solo se escondiera la fila del menú, la
API seguiría abierta. Son unas 21 llaves, no 60: la simplificación también reduce la construcción. Lo de B2b sigue
llamando a `fn_es_lider()`. Un módulo cuyas funciones todavía no revisan su llave sale como «Solo líder por ahora»
(regla `delegable` del ADR-0150).

**3. Ventas ya tiene la mitad hecha.** `ventas.asesora_id` y `fn_asesoras_de_turno` están en producción (ADR-0153).
`asesora_id` pasa a ser el responsable de la venta; no se crea una segunda columna para lo mismo.

**4. Dónde se guarda.** *(Actualizado por el ADR-0162: con terminales sin persona, `usuario_id` pasa a ser el responsable y se agrega `terminal_id`; la columna `responsable_id` ya no hace falta.)* `responsable_id` va en `movimientos`, `ventas`, `caja_movimientos`, los cierres de caja,
`transferencias`, `conteos` y los comprobantes. En Catálogo (`productos`, `variantes`) va al historial de cambios,
no a la fila de la prenda.

## F4b — la web manda el responsable (2026-09-22, rama `claude/adr-0161-f4b-responsable`)

**Piezas:** reglas puras en `apps/web/lib/responsable-reglas.ts` (+ test), lectura de asistencia en `lib/useDeTurno.ts`
(evoluciona `useVendedorasDeTurno`), estado en `lib/useResponsable.ts`, el combo en `components/ComboResponsable.tsx`
(diseño del spike, pantallas 2-4) y la sede activa como contexto (`components/SedeActiva.tsx`, montado en
`app/(app)/layout.tsx`). `traducirError` traduce los 42501 con `hint` (`responsable_*`, `ubicacion_requerida`).

**Cómo viaja:** desde el navegador, con `firmar(supabase.rpc(...), responsable.firma())` → `.setHeader('x-responsable')`
y `x-ubicacion` (la sede activa). Las rutas `/api/*` que guardan reciben esos encabezados en el `fetch` y los reenvían con
`createClient({ firma: firmaDeEncabezados(request.headers) })`. No hay server actions de escritura en estas pantallas.
La venta sin conexión guarda el responsable en `p_asesora_id` y al subir manda además `x-momento` = hora de la venta.
`/api/lucode/emitir` valida al responsable con `fn_actor_persona_id` **antes** de llamar a Lucode.

**Pantallas conectadas** (combo vacío, solo presentes, bloqueo sin nadie, vuelve a vacío al guardar):
- **Punto de venta:** cobrar (reemplaza la fila «Atendió» del ADR-0163: ya no se elige sola con una presente ni vende a
  nombre de la sesión con cero; `p_asesora_id` = responsable); subida de ventas sin conexión.
- **Caja:** abrir, ingreso/egreso, cerrar (el resultado muestra «Responsable del cierre»).
- **Cambios:** registrar. **Devoluciones:** solicitar («Lo registra» = responsable).
- **Facturación:** emitir comprobante, convertir proforma, crear proforma, transmitir/reintentar a SUNAT (confirmación
  corta con el combo, desde Comprobantes y desde «Actividad de hoy»).
- **Inventario:** ajuste de stock, apartar y liberar apartado, reponer piso, prendas dañadas, conteo (abrir, registrar,
  cerrar, anular, alta al vuelo), traslados (enviar —lista del origen—, recibir, confirmar, cerrar con diferencia). En
  operaciones de varios pasos el combo se vacía al cerrar la operación, no en cada prenda (Felipe, 2026-09-22).
- **Catálogo:** nueva prenda, editar prenda y sus etiquetas, archivar en lote, revisar alta al vuelo, etiquetar prendas,
  marcas (lista y alta desde el formulario), categorías y ejes, colores, tallas, tejidos, patrones, familias, etiquetas.

**No conectadas, a propósito:** lo que es solo del líder (anular venta o comprobante, liberar comprobante no emitido,
series, aprobar/rechazar devoluciones, códigos de descuento); Compras, Producción, Colaboradores y Configuración (A8);
`registrar_clienta` (alta de clienta dentro del cobro: la firma va en la venta); pedidos no atendidos (pendiente de decidir
si es operación de tienda).

**Para encender `fn_exige_responsable()`:** publicar esta web primero. Antes de pegar el interruptor, revisar que no quede
una escritura de tienda fuera de la lista de arriba (la base rechazaría a una persona sin encabezado con
`responsable_requerido`). Límites conocidos: una pantalla abierta sin conexión desde el inicio no tiene lista y no puede
vender sin conexión; en Tienda LIM (sin asistencia cargada) y en el Postgres local (sin `marcajes`/`jornadas`) todo queda
bloqueado — es la regla A4/A5, no un error.

## Lo que queda abierto

1. ~~En pausa~~ **Decidido (Felipe, 2026-09-22): quien está en pausa no puede firmar ni operar.** Solo firma quien está `presente`.
2. **Venta offline:** si la venta se sincroniza horas después, ¿se valida la asistencia en el momento de la venta o en
   el de la sincronización? Hay que medirlo al construir.
3. **El pedido anterior de esconder las 6 terminales en Dynamic** sigue sin respuesta: si quedan visibles en su
   directorio y en el kiosco de marcación, o si se abre una sesión en cayla-dynamic para agregar un filtro. Con este ADR
   las terminales nunca marcan asistencia, así que en el kiosco solo estorban.

## Lo que se rompería sin esto

Un faltante de caja o un ajuste de stock quedaría a nombre de «Terminal Ventas TRU», y nadie podría reconstruir quién
fue. Si el combo estuviera solo en la pantalla y no en la base, bastaría una llamada directa a la API para guardar sin
responsable, y la trazabilidad dependería de que nadie la esquive.

## Referencias

ADR-0150 (roles a medida, retomado), ADR-0160 (cuentas terminal), ADR-0153 (`asesora_id`, `fn_asesoras_de_turno`),
D-62 en `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, ADR-0026 (firmas que cambian dejan sobrecargas).

## Regla permanente: módulos nuevos (Felipe, 2026-09-22, tras fusionar el PR #285)

Todo módulo nuevo que se desarrolle **aparece en Roles y accesos y nace disponible solo para el líder**; el líder decide
después a qué rol dárselo. Se da de alta con su propia migración en `retail.modulos` (sin tocar `rol_modulos`), en
`lib/modulos.ts` y con `modulo` en su nodo de `lib/menu.ts` + `exigirModulo` en su ruta. La regla operativa completa está en
`CLAUDE.md` («Módulos y roles») y la vigilan `lib/modulos.test.ts` y `pnpm pruebas:roles`.

## B6-B8 construidos (2026-09-22, rama `claude/abrir-modulos-a-los-roles`, PR #308) — pegado en producción el 2026-09-22

**Dos migraciones, en este orden:** `20260923130000_abrir_modulos_a_los_roles.sql` (los 5 módulos) y
`20260923131000_colaboradores_y_roles_delegables.sql` (Colaboradores y Roles). Las dos cambian cada función desde su
definición VIVA con conteo exacto de ocurrencias (inventario hecho contra producción el 2026-09-22; si algo cambió, abortan
sin dejar nada a medias) y abren el módulo (`delegable`) solo al FINAL, así que un aborto deja todo «solo del líder».
Cada una trae en su cabecera la clasificación de cada `fn_es_lider()` que se cambió y de los que no, con el porqué.

**Capacidades nuevas** (mismo molde que las de C3): `fn_puede_editar_etiquetas`, `fn_puede_tocar_etiqueta(etiqueta,
descuento)`, `fn_puede_analizar`, `fn_puede_gestionar_colaboradores`, `fn_puede_administrar_roles`; y
`fn_puede_registrar_compras` / `fn_puede_ver_dinero_de_compras` pasan a «líder o capacidad(Facturas de compra, Por pagar,
Notas de crédito)». En la web, los permisos `verDineroCompras`, `editarEtiquetas` y `analizar` salen de esos módulos
(`permisosDeModulos`); `verDinero` queda para el dinero del Taller y el Resumen de Producción, solo del líder.

**Lo que NO se abrió, a propósito** (no es de estos módulos): `fn_deuda_consolidada` y `fn_igv_credito_fiscal` (suman el
Taller; las lee Producción ▸ Por pagar), la ficha de un proveedor (mezcla insumos del Taller), `registrar_gasto` (solo en
producción, sin pantalla: se fija en `fn_es_lider()` para que abrir Compras no abra gastos), lo que el `es_lider` decide en
Recibir (qué sede se mira), y las escrituras de Proveedores (módulo aparte).

**Pruebas:** `pnpm pruebas:roles` 52/52 (en una copia de la base local con main + las migraciones, y también `--en-seco`), con
casos de Por pagar (ve montos y paga), Facturas/Notas, Etiquetas (sí sin descuento, no con descuento), Análisis (su sede
sí, otra no), Roles (asigna Integrante o un rol a medida, no Líder; edita sus módulos con historial), Colaboradores (da
acceso, aprueba, ve listas y terminales), las protecciones 2 y 3 (también en la sede de un líder) y la regla «entre líderes».

**Combinado con «el rol entre líderes» (`20260923110000_cambiar_rol_entre_lideres`, ya en producción):** `asignar_rol`
conserva lo de esa migración (un LÍDER sube a una persona a Líder y baja a otro líder, con sede si no la tiene; nadie se
cambia su propio rol) y `20260923131000` le suma, desde la definición viva: quien tiene Roles y accesos sin ser líder
asigna cualquier OTRO rol, pero no sube a nadie a Líder ni le cambia el rol a un líder; y no se baja al último líder
activo. Las migraciones de esta rama se renumeraron a `20260923130000` y `20260923131000` (el 110000 lo ocupa la de
main y el 120000 la rama `claude/ubicacion-entre-lideres`). Si esa rama se pega DESPUÉS, su `cambiar_ubicacion_colaborador`
vuelve a «solo el líder» (falla cerrado): volver a pegar `20260923131000`.

**Las 6 preguntas, DECIDIDAS por Felipe el 2026-09-22 («todas como propones»). Construidas en la rama
`claude/modulos-seis-decisiones` (sección «P1–P6 construidas», abajo).**

| # | Decisión | Qué cambia cuando se construya |
|---|---|---|
| P1 | **Compras: cada módulo solo lo suyo.** Registrar deja de ser una sola capacidad. | Facturas de compra registra/corrige/anula facturas; Por pagar registra pagos; Notas de crédito registra y anula notas. Separar `fn_puede_registrar_compras` por módulo en las ~15 funciones que la llaman. Ver montos sigue siendo de cualquiera de los tres. |
| P2 | **Recibir mercadería muestra montos a quien ya los ve en Compras.** | `/recibir` e `/inventario/recibir` dejan de mirar «¿es líder?» y miran `verDineroCompras`. |
| P3 | **La ficha y la edición de proveedores se abren a quien tenga Proveedores.** | `registrar/actualizar/desactivar/reactivar_proveedor` y la ficha pasan a «líder o módulo Proveedores»; los insumos del Taller de la ficha siguen del líder. |
| P4 | **«Productos» también cambia etiquetas SIN descuento desde la ficha de la prenda.** | `actualizar_variantes_etiquetas` pasa a «editar catálogo o módulo Etiquetas»; lo que lleva descuento sigue del líder. |
| P5 | **Análisis NO ve costo ni stock de otras sedes en Existencias**: solo su sede. | `fn_resumen_variantes` separa lo que ve Existencias (sin costo ni red para quien no es líder) de lo que lee Análisis. |
| P6 | **Colaboradores y Roles y accesos solo se asignan a PERSONAS, nunca a una terminal.** | `guardar_modulos_rol`/`asignar_rol`: un rol con esos módulos no se asigna a una terminal (y una terminal con un rol así no los recibe). |

## P1–P6 construidas (2026-09-22, rama `claude/modulos-seis-decisiones`) — NO pegado en producción

**Una migración:** `20260923140000_modulos_seis_decisiones.sql`. Mismo patrón que B6-B8: cada función se cambia desde su
definición VIVA con conteo exacto de ocurrencias (inventario contra producción el 2026-09-22, solo lectura), aborta sin dejar
nada a medias si algo cambió, y es re-ejecutable. Su cabecera trae la clasificación de cada candado. La web y las pruebas van
en la misma rama.

| # | Base | Web |
|---|---|---|
| P1 | Tres capacidades por módulo: `fn_puede_registrar_facturas_compra` (registrar_compra —con su pago al contado—, anular_compra, reasignar_reparto_compra, adjuntos), `fn_puede_pagar_compras` (registrar_pago_compras, _medios, registrar_pagos_compra y su envoltorio registrar_pago_compra, registrar_reembolso_proveedor), `fn_puede_registrar_notas_credito` (registrar_nota_credito_compra; y el adjunto cuando es el PDF de una nota). `fn_puede_registrar_compras` queda como «cualquiera de los tres» SOLO para leer lo que usan los tres: `compras_nota_pendiente`, `fn_proveedor_creditos` y la política `proveedor_creditos_select` (el libro del saldo a favor). El dinero (`fn_puede_ver_dinero_de_compras`) no cambia. | `accionesDeCompra` / `usaModulo` en `lib/modulos.ts`: el detalle del comprobante muestra «Anular», reparto y adjuntos a Facturas de compra y «Registrar pago» a Por pagar; «Reembolso» (Notas de crédito, ficha) solo a Por pagar. |
| P2 | Nada que cambiar, a propósito: `listar_compras_operativo`, `lineas_compra_operativo` y `recibir_envio` no devuelven montos; su `fn_es_lider()` decide la SEDE que se mira y eso se queda. Los montos salen de vistas con RLS `fn_puede_ver_dinero_de_compras` y `recepciones_sin_comprobante` ya la pregunta. | `/recibir` e `/inventario/recibir` usan `verDineroCompras` para los montos; las decisiones sobre faltantes y la sede siguen con `esLider`. |
| P3 | `fn_puede_gestionar_proveedores` (líder o Proveedores): registrar/actualizar/desactivar/reactivar_proveedor, `fn_proveedor_devoluciones`, política `proveedores_write` (reemplaza a `proveedores_write_lider`). `fn_proveedor_metricas_compras` y `fn_proveedor_costo_evolucion` ya pedían el dinero (solo cambia el mensaje). `fn_proveedor_metricas_insumos` sigue del líder. | Compras deja entrar a quien tiene Proveedores; el menú pide `editarCuentasProveedor` (= el módulo) para Proveedores; la lista y la ficha se pintan por partes (montos con `verDineroCompras`, Taller solo líder); el detalle de un comprobante pide `verDineroCompras`. |
| P4 | `actualizar_variantes_etiquetas`: «Etiquetas o editar catálogo»; lo que lleva descuento sigue del líder. | La ficha de la prenda no ofrece las etiquetas con descuento a quien no es líder (y lo dice). |
| P5 | **Elección:** en `fn_resumen_variantes` el costo y `en_red` vuelven a ser solo del LÍDER. Esa función no la lee Análisis (la leen Existencias y la «Nueva orden» del líder); Análisis lee `fn_resumen_comparacion`, que ya analiza solo su sede y ahí ve el costo de lo vendido (márgenes). Así «Análisis ve el costo de SU sede» se cumple sin un parámetro que el que llama podría falsear. | Sin cambio (Existencias ya pintaba costo y red solo al líder). |
| P6 | `fn_exigir_rol_de_terminal(rol, módulo)` en los disparadores de `retail.terminales` y `retail.rol_modulos`: una terminal no queda con un rol que incluya Colaboradores o Roles y accesos, y no se encienden en un rol con terminales (activas o no). Bloquea la fila del rol contra carreras. Además `fn_puede_gestionar_colaboradores` y `fn_puede_administrar_roles` son falsas para una sesión de terminal. Antes de poner el candado verifica que ninguna terminal lo incumpla (producción: ninguna). | Roles y accesos avisa al encender esos módulos en un rol con terminales y no ofrece esos roles a una terminal (asignar y «Nueva terminal»). |

**Pruebas:** `pnpm pruebas:roles` 63/63 (10 casos nuevos, uno por decisión y más) en una copia local alineada con producción, incluida la RLS «una vez por consulta» de ADR-0176
(las funciones, políticas y restos del ADR-0151 que la base local tenía distintos se dejaron iguales a producción antes de
probar), también `--en-seco`; las suites de Compras, terminales y actor-firma sin fallas nuevas (las que fallan lo hacen igual
sin esta migración: datos de la base local). Typecheck, lint y vitest en verde.

**Consecuencias para que Felipe confirme (no decididas aquí):** (1) la Terminal Almacén tiene Proveedores, así que ahora da de
alta, edita y desactiva proveedores; (2) recibir con una nota de crédito por faltante (`recibir_envio`/`recibir_y_cerrar_compras`
con notas) pide Notas de crédito, no cualquiera de los tres — la web hoy no lo usa; (3) una factura AL CONTADO se registra con su
pago dentro de Facturas de compra (es parte de registrarla), aunque ese rol no tenga Por pagar.

## Actualización 2026-09-22 — el rol se cambia también entre líderes

Felipe pidió que el cambio de rol funcione entre líderes. Hasta aquí `asignar_rol` tenía dos candados: a un líder no se le
cambiaba el rol y «Líder de equipo» no se asignaba desde ningún lado (solo con SQL a mano). Se levantan los dos, con tres
reglas que se mantienen:

| # | Regla | Por qué |
|---|---|---|
| L1 | **Un líder sube a otra persona a Líder o baja a otro líder** a cualquier rol vigente, desde Colaboradores («⋯ ▸ Cambiar rol») o desde Roles y accesos («Asignar a una persona» en el rol Líder). | Es la misma decisión que asignar cualquier otro rol; no tenía sentido que exigiera SQL. |
| L2 | **Nadie se cambia su propio rol.** | Quien hace el cambio ya es líder y no puede bajarse: la tienda nunca se queda sin líder, sin necesidad de contar líderes. |
| L3 | **Al bajar a un líder sin sede, se elige la sede donde queda.** | Un líder opera todas y no tiene `ubicacion_asignada_id`; cualquier otro rol la necesita (check `rol = 'lider' or ubicacion_asignada_id is not null`). Hoy los 9 líderes de producción no tienen sede. |

Una terminal sigue sin poder ser líder. Migración `20260923110000_cambiar_rol_entre_lideres.sql`: `asignar_rol` gana
`p_ubicacion_id` (se suelta la firma vieja para no crear una sobrecarga) y escribe `colaboradores.rol`; el disparador
`fn_colaborador_rol_coherente` deja `rol_id` coherente. Reglas de la web: `rolesAsignables`, `cuentasAsignables` y
`pideUbicacion` en `lib/roles-reglas.ts`, `accionesDeFila` en `lib/colaboradores-reglas.ts`.

### Y la ubicación, también entre líderes (mismo día)

| # | Regla | Por qué |
|---|---|---|
| L4 | **A un líder se le cambia la ubicación** desde Colaboradores («⋯ ▸ Cambiar ubicación»). Para él no es un límite: es **la tienda donde arranca su sesión**; sigue operando todas desde la cabecera. | Ninguna sede de Dynamic de los 9 líderes («Central», «Oficina TRU») está enlazada a una tienda de retail: todos arrancaban en la primera tienda creada. |

Orden para decidir dónde arranca un líder: su ubicación asignada → la tienda de su sede de Dynamic → la primera tienda.
Vive en `retail.fn_ubicacion_de_partida`, que usan `fn_persona_actual_resumen` y `fn_ubicacion_actual_persona`. Migración
`20260923120100_ubicacion_de_lideres.sql`.

## Actualización 2026-09-22 — el combo propone a quien inició sesión (reemplaza A6)

Felipe pidió dos cambios al combo «Responsable»:

1. ~~**El texto del combo vacío pasa a «¿Quién está atendiendo?»** en todos los módulos~~ — **corregido el 2026-09-23**
   (ver abajo): Felipe lo había pedido solo para la venta; el cambio global fue un malentendido de la sesión.
2. **A6 deja de ser «vacío siempre»:**
   - Sesión de una **persona**: el combo viene ya elegido con ella misma, **si está presente** en la sede (A3 no cambia:
     si no marcó entrada, viene vacío y la operación se bloquea igual que antes). Después de guardar vuelve a esa persona.
   - Sesión de una **terminal**: vacío siempre (el aparato no es nadie; ADR-0162).
   - **Módulo Punto de venta** (`vender`: Punto de venta y Apartados): vacío siempre, también para una persona — quien
     atiende a la clienta queda como asesora de la venta y puede no ser quien abrió la sesión en el mostrador.

Cómo: `requirePersonaActualV2` trae `personaId` con `fn_actor_persona_id(false)` (para una persona devuelve su propio id;
en una terminal falla y queda `null`) — **sin migración**. Viaja por `SedeActivaProveedor` (`personaSesionId`), y
`useResponsable(ubicacion, { proponerSesion: false })` lo apaga en las pantallas de `vender`. La regla pura es
`responsableInicial` en `lib/responsable-reglas.ts`, con pruebas. La base no cambia: sigue validando que el responsable
esté presente (`fn_persona_presente`), así que proponer a alguien nunca permite firmar con un ausente.

## Actualización 2026-09-23 — «¿Quién está atendiendo?» solo al atender a la clienta (corrige la del 2026-09-22)

La actualización anterior puso «¿Quién está atendiendo?» en **todos** los módulos. Felipe lo había pedido solo para la
venta. Queda así, con dos modos (`ModoResponsable` en `lib/responsable-reglas.ts`):

| Modo | Pantallas | Combo vacío / aviso | ¿Viene elegido? |
|---|---|---|---|
| `atencion` | Punto de venta (venta y sus apartados: `/vender/apartados`), Cambios, Devoluciones | «¿Quién está atendiendo?» / «Elige quién está atendiendo.» | Nunca: vacío también para una persona |
| `operacion` (por defecto) | Todo lo demás: Caja, Historial, Facturación, Existencias (también apartar desde ahí), Conteos, Traslados, Catálogo, Compras… | «¿Quién hace esta operación?» / «Elige quién hace esta operación.» | Con la sesión de una persona presente, ella; con una terminal, vacío |

Cambios y Devoluciones **pasan a venir vacíos** (antes traían a la persona de la sesión): también atienden a una clienta
en el mostrador. `useResponsable(ubicacion, { modo: "atencion" })` reemplaza a `{ proponerSesion: false }`; el combo pinta
`control.pregunta`. El rechazo `responsable_requerido` de la base no sabe en qué pantalla está, así que dice «Falta elegir
al responsable» (es casi inalcanzable: la pantalla apaga el botón antes). Una prueba en `lib/responsable-reglas.test.ts`
fija qué pantallas usan `atencion` y que ninguna otra lo use. Sin migración.

## Actualización 2026-09-23 (b) — en Catálogo el combo no va arriba de la lista

Las 8 listas del Catálogo (Categorías, Familias, Colores, Tallas, Tejidos, Patrones, Etiquetas, Marcas) tenían un combo
«Responsable» suelto arriba, para firmar los botones que guardan con un clic, y el mismo combo se repetía dentro de cada
ventana. Con la cuenta de una persona ya trae su nombre, así que arriba solo ocupaba espacio y se veía dos veces.
Felipe eligió (maqueta `docs/maquetas/catalogo-responsable-confirmacion-2026-09/`): **sin combo arriba**; Aprobar,
Desactivar y Reactivar abren una confirmación corta con el combo adentro (`components/ConfirmarConResponsable.tsx`,
textos en `lib/confirmar-catalogo.ts`). Agregar, editar, rechazar y renombrar no cambian: su ventana ya traía el combo.
La firma no cambia. `lib/confirmar-catalogo.test.ts` vigila que ninguna de las 8 listas vuelva a tener un combo
flotante ni un botón de tarjeta que guarde sin confirmar. Sin migración.

## Actualización 2026-09-23 (c) — el combo en TODA operación que guarda (amplía A8)

**Qué pasó.** Felipe no encontraba el combo al recibir mercadería ni al registrar un comprobante. No estaba porque la A8
dejó fuera a Compras, Producción, Colaboradores y Configuración («firman con la persona que inició sesión»), pensando en
Compras como trabajo de oficina del líder. Un día después Compras se abrió a las tiendas (ADR-0184) y los módulos a los
roles: una terminal podía entrar a Recibir, pero sin combo no mandaba responsable y la base la rechazaba («Elige quién
hace esta operación»); con cuenta de persona firmaba la cuenta aunque el trabajo lo hiciera otra.

**Decisión (Felipe, 2026-09-23): «En todo debe estar el combo», con el mismo candado de asistencia (A9).** Se le mostró
la consecuencia y la eligió: sin marcar entrada en la sede activa, nadie guarda en ningún módulo —tampoco el líder desde
casa (pagar un comprobante, dar de alta a una colaboradora, cerrar una orden del Taller)—, y si el Taller no tiene marcas
en Dynamic, Producción queda bloqueado. Se descartó la variante «combo en todo, oficina sin candado».

**Cómo.** Migración `20260923230000_responsable_en_todas_las_operaciones.sql`: toda función que firmaba con
`fn_actor_persona_id(false)` pasa a `(true)`, más `fn_historial_colaborador` y `desactivar_terminal`, que firmaban
buscando la cuenta en línea. `(false)` queda solo donde es PERMISO comparado con la cuenta: `fn_alcanzo_a` y «no te
quites / suspendas / cambies el rol a ti mismo» (`quitar_colaborador`, `suspender_colaborador`, `asignar_rol`; en las dos
últimas la firma del historial pasa al responsable). Falla cerrada si queda otro `(false)`. En la web, el combo entra en
todas las pantallas de Compras, Recibir, Producción/Taller/Insumos, Colaboradores y Roles, y en la revisión de aperturas
de caja. La F3 (`20260923100000`) acepta volver a pegarse después de esta sin abortar.

**Lo que queda fuera (no firman a nadie en la base, así que un combo ahí no dejaría rastro):** acciones que guardan sin
registrar quién, p. ej. `set_etapa_produccion`, `anular_comprobante_produccion`, proveedores de producción, alta de
insumos del catálogo. Para que lleven combo hace falta una columna «quién» en cada tabla: queda en el BACKLOG.

## Actualización 2026-09-23 (d) — «quién» en las acciones que guardaban sin firmar a nadie

Tras la (c) quedaron acciones que guardan sin anotar quién; Felipe pidió agregarles el campo. Migración
`20260923240000_quien_en_acciones_pendientes.sql`, siempre con `fn_actor_persona_id(true)` (el responsable del combo):

| Acción | Dónde queda quién |
|---|---|
| `anular_compra` | `compras.anulada_por` / `anulada_at` |
| `anular_comprobante_produccion` | `comprobantes_produccion.anulada_por` / `anulada_at` |
| `set_etapa_produccion` | tabla NUEVA `produccion_etapas_historial` (append-only: una fila por cambio; una columna solo guardaría el último) |
| `guardar_proveedor_produccion`, `cambiar_estado_proveedor_produccion` | `proveedores_produccion.creado_por`, `modificado_por` / `modificado_at` (último cambio) |
| Alta de insumo (va directo por la API, sin RPC) | `insumos.creado_por`, lo pone el disparador `insumos_creado_por` |
| `reactivar_terminal` | `terminales.reactivada_por` / `reactivada_at` |
| Crear terminal | `terminales.creada_por` (ya existía): la web lo llena con el responsable, no con la cuenta |
| Cambiar la clave de una terminal | `terminales.clave_cambiada_por` / `_at`, vía RPC nueva `registrar_cambio_clave_terminal` (la clave la cambia la llave de servicio, que no ve a quien lo pide) |

Las filas anteriores quedan con el «quién» vacío: no se inventa quién fue. En la web, cada una de esas pantallas lleva el
combo. Pruebas: `pnpm pruebas:quien-pendientes` (9 casos).

