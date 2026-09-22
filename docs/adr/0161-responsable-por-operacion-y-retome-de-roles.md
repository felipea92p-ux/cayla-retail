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
| A6 | **Viene vacío siempre** | Nunca se hereda el nombre de la operación anterior. |
| A7 | **Toda acción que guarda lo pide; mirar no.** Es fijo: no se configura por rol | Una sola regla, sin lista que mantener. |
| A8 | **Sale en todas las cuentas**, no solo en las terminales, **en la operación de tienda**: Ventas, Caja, Cambios, Devoluciones, Facturación, Inventario, Traslados, Catálogo | Compras, Producción del Taller, Colaboradores y Configuración firman con la persona que inició sesión, como hoy. |
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
| B5 | Las demás decisiones del ADR-0150 siguen: solo el líder administra roles, un rol por persona, catálogos de Dynamic y retail separados, acceso explícito con ubicación. |

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
