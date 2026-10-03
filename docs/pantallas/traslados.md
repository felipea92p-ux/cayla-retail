# Pantalla — Traslados (`/inventario/traslados`, `/inventario/mover`, `/inventario/traslados/[id]`)

> Modo: **completo** · Fecha: 2026-10-03 · Rol/sede: la captura es de Tienda TRU, sábado 17:54, con un rol que ve Inventario,
> Catálogo y Compras. La lista está en su estado vacío. Datos: **real**: consultas de solo lectura a producción (`cayla-dynamic`,
> schema `retail`) que Claude corrió con el MCP en esta sesión, sin escribir nada.
> Dispositivo que se juzga: computadora para enviar y celular o tablet para recibir. Quien recibe cuenta con la caja abierta, en el almacén.
> SHA analizado: `fe5441ec` (`origin/main`; la rama está al día). Si `TrasladosPanel.tsx`, `TrasladoDetallePanel.tsx`,
> `MoverMercaderiaFormV2.tsx`, `lib/traslados*.ts` o las RPC `confirmar_traslado` / `cerrar_traslado_con_diferencia` cambian,
> este análisis está vencido.
> Archivos: `app/(app)/inventario/traslados/page.tsx` · `traslados/[id]/page.tsx` · `inventario/mover/page.tsx` ·
> `components/TrasladosPanel.tsx` · `TrasladosLista.tsx` · `TrasladosResumen.tsx` · `TrasladoDetallePanel.tsx` ·
> `TrasladoConfirmarModal.tsx` · `TrasladoCerrarModal.tsx` · `TrasladoAnularModal.tsx` · `MoverMercaderiaFormV2.tsx` ·
> `PedidosEntreSedes.tsx` · `lib/traslados.ts` · `lib/traslados-reglas.ts` · `lib/traslados-recepcion-reglas.ts`
> RPC: `iniciar_traslado` · `registrar_recepcion_traslado` · `confirmar_traslado` · `cerrar_traslado_con_diferencia` ·
> `anular_traslado` · `fn_traslado_lineas` · `fn_aplicar_movimiento` · `fn_puede_ajustar_inventario`
> Tablas: `transferencias`, `transferencia_items`, `transferencia_recepciones`, `stock`, `movimientos`, `separacion_pedidos`.
> Otra sesión tocándola: **no**. `docs/SESIONES-ACTIVAS.md` todavía tiene dos filas sobre Traslados (26-sep y 01-oct), pero las
> dos ya terminaron: ADR-0239 está fusionado y ADR-0299 está en producción (verificado hoy). Son filas viejas.
> **Análisis previo vencido:** el del 2026-09-26 (recorrido de usabilidad, SHA `2227a9fd`). Desde entonces, 21 archivos de esta
> pantalla cambiaron, con +2.375 líneas (ADR-0239). Abajo, en el Historial, está cuáles de sus 17 hallazgos se cerraron.
> Etiquetas: `[visto]` en la captura · `[código archivo:línea]` · `[producción]` consulta de hoy · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
Recibir quedó bien resuelto: se cuenta a ciegas, cada casilla se guarda en la base, entra lo que coincide, se elige piso o
almacén y un envío se puede anular. El hueco grave está en lo que pasa **después** de una diferencia. La sede que envió nunca se
entera. Lo que sobró entra al stock sin descontarse de ningún lado. Y la misma integrante que contó puede cerrar su propia
diferencia, aunque la pantalla diga «Solo líder».

Todo esto descansa sobre **cero traslados reales**: en producción hay 4 traslados de prueba, todos sin prendas `[producción]`.

**Cumple su finalidad:** 5,0/10 (el promedio es 6,3, con tope 5 por un defecto que puede dañar el stock) · **Relevancia:** 6,8/10 — **Soporte**

## 1 · Finalidad declarada
«Esta pantalla existe para mover prendas de una sede a otra sin que el stock de ninguna de las dos quede mal en ningún
momento». Sale del origen al enviar. Entra al destino solo lo que se cuenta. Lo que no cuadra queda a la vista hasta que alguien lo
resuelve.

Fuentes: ADR-0068 (dos fases), ADR-0239 (recibir sin perder nada) y ADR-0242 (Traslados conectado, que suma pedir y reponer
entre sedes).

¿Coinciden los docs con la pantalla? **En parte.**
- El subtítulo dice lo mismo `[visto]`.
- `docs/datos/modulos/05-inventario-y-movimientos.md` describe todavía el traslado **atómico de V1** («resta origen + suma destino,
  atómico», línea 75), y su propio encabezado lo avisa. Manda el código.
- El ADR-0242 (aprobado el 26-sep) dice que la pantalla es la bandeja «Hoy te toca». **Esa bandeja no existe:** de sus cinco
  tandas solo se construyó la 4 `[código]` `[producción: separacion_pedidos.grupo_id existe]`. La pantalla de la captura es la
  del ADR-0239, con la nota del pie que el ADR-0242 D-1 mandaba quitar.

## 2 · Objeción
**1. Una diferencia se resuelve solo del lado de quien recibe, y el stock del origen queda mal sin que nadie lo sepa.**
`cerrar_traslado_con_diferencia` hace entrar lo contado y nada más `[producción: cuerpo vivo de la función]`. Hay dos casos.

*Faltó una prenda.* No se escribe ningún movimiento: la salida del origen queda sin su entrada, y el porqué vive solo en
`nota_cierre`. Si esa prenda nunca salió (quedó en el almacén de quien envió), el origen la tiene en la mano y el sistema dice 0.
La siguiente vez que alguien la vende, termina en «por regularizar», la cola que ya tiene 199 prendas sin resolver
(`docs/pantallas/inventario.md`).

*Sobró una prenda.* Entra al destino sin descontarse de ningún lado: la red tiene una prenda de más hasta el próximo conteo del
origen.

La sede que envió **no recibe ningún aviso**: el contador del menú solo mira el destino
`[código apps/web/lib/traslados.ts:270-280]`. ADR-0173 dice «se cuenta, no se asume»; hoy el cierre asume que el error siempre
estuvo en el camino.

**2. «Solo líder» no es cierto.**
La pantalla lo dice `[código apps/web/components/TrasladoDetallePanel.tsx:636]`, y la función también lo dice en su mensaje de
error. Pero deja cerrar a cualquiera que vea Traslados: `fn_puede_ajustar_inventario() = fn_es_lider() or capacidad por módulos
['existencias','conteos','traslados']` `[producción]`.

Resultado: la misma integrante que contó 2 de 3 puede dar la tercera por perdida, y no queda ni un movimiento de pérdida. Felipe
aplazó esta decisión a propósito el 26-sep (`docs/BACKLOG.md:317`), y está bien que sea suya. Pero mientras siga aplazada, el
texto en pantalla miente.

**3. Ya son seis diseños sin un solo traslado real.**
ADR-0068, 0105, 0173, 0175, 0239 y 0242. Los 4 traslados de producción son del 16 y 17-sep y no tienen prendas
`[producción: transferencia_items = 0]`. Uno sigue «en tránsito» del Taller a AQP desde hace 16 días.

Construir ahora las tandas 1 a 3 del ADR-0242 (escáner al enviar, bandeja, guía con QR) sería el séptimo rediseño, otra vez sin
haber visto a una integrante usar el sexto. El trade-off está en la sección 8.

## 3 · Lo que está bien y no se toca
- **Recibir a ciegas y guardado en la base, casilla por casilla** (D-130):
  - Se esconde lo enviado `[código TrasladoDetallePanel.tsx:117-119]`.
  - Se guarda con un respiro de 600 ms, reintenta cuando vuelve la red y guarda lo pendiente al salir
    `[código :166-187, :225-249]`. Si se recarga la página, no se pierde nada.
- **Entra lo que coincide** (D-129). La caja de 80 prendas con 1 faltante ya no congela las 79
  `[producción: confirmar_traslado]`.
- **Piso o almacén se pregunta al confirmar, con piso marcado.** Solo se pregunta si la sede tiene piso
  `[código TrasladoConfirmarModal.tsx:39-70]`.
- **Anular devuelve el stock con su propio movimiento**, solo si nadie empezó a contar. Usa token y `for update`
  `[código migración 20260927160000:369-440]`.
- **Transacciones bien cortadas.** Cada RPC es una sola transacción. Los candados van en orden fijo: stock primero, traslado
  después (ADR-0190). El índice único `(transferencia_id, variante_id)` impide dos conteos de la misma prenda `[producción]`.
- **Doble clic al enviar:** con token y advisory lock, el segundo intento devuelve el mismo traslado
  `[producción: iniciar_traslado]`.
- **«Por recibir» ya no depende de la hora estimada** (D-129, arreglo §2 del análisis previo). Los traslados vacíos de la
  limpieza no inflan el contador (`transferencia_items!inner`) `[código lib/traslados.ts:267-272]`.
- **ADR-0299 está en producción:** `recibir_envio` ya no recibe traslados. Se cerró la «segunda puerta» del análisis previo
  `[producción: el cuerpo de recibir_envio menciona ADR-0299 y no tiene el bloque «lo que vino de otra sede»]`.
- **La cabecera y el estado vacío siguen la regla.** `EncabezadoPagina` con sede, fecha y acción a la derecha (ADR-0220); nota
  en hueso; solo tokens `[visto]` `[código page.tsx:46-55]`.

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 8 | Coherente con Existencias y Conteo. Hay dos botones que hacen lo mismo y una nota de «recibir» en una pantalla vacía | `[visto]` |
| Lógica de negocio | 5 | La diferencia se cierra solo en el destino: lo que sobra crea stock y lo que falta no deja rastro; «Solo líder» es falso | `[producción]` |
| Arquitectura | 7 | Transacciones, candados e idempotencia sólidos; faltan CHECK de estado y el permiso del módulo no vive en la base | `[producción]` `[código]` |
| Funciones | 6 | Recibir está completo; desde Traslados no se puede pedir, y tras enviar no queda número ni enlace | `[código]` |
| Utilidad | 6 | Recibir se entiende sin ayuda; enviar te lleva a «Mover mercadería» y el menú marca Existencias | `[código]` `[inferido]` |
| Conexión con el ERP | 6 | Bien con Existencias, Inicio y Apartados; sin enlace a «Bajar al piso», sin aviso al origen, sin flete | `[código]` |

### Estética — 8
- **Coherencia.** La cabecera es la del módulo: sede y fecha con el hilo taupe, título de 46 px, frase y acción a la derecha
  `[visto]`. Tarjeta en papel, nota en hueso, sin rojo, sin sombras. Se parece a Existencias y a Conteo.
- **Duplicado.** El estado vacío repite la misma acción dos veces: «+ Nuevo traslado» (primario) y «Crear el primer traslado»
  (secundario), y los dos llevan a `/inventario/mover` `[código TrasladosPanel.tsx:150]`. Es tolerable en un vacío, pero ese
  segundo botón podría ofrecer la otra cara: **pedir** a otra sede (tarea #4).
- **Nota fuera de lugar.** La nota del pie explica cómo se recibe («Lo que coincide entra al instante…») a quien todavía no tiene
  nada que recibir `[visto]`. El ADR-0242 D-1 la quitaba.
- **Accesibilidad.** Contraste de taupe sobre crema y hueso dentro de lo medido en ADR-0169. Botones de 44 px o más `[visto]`.

### Lógica de negocio — 5
- **Lo que está bien.** D-129 a D-132 están implementadas tal como se decidieron `[producción]`.
- **Faltante.** Al cerrar, el faltante no deja movimiento ni motivo. No existe una cifra de «merma en traslado» que alguien pueda
  revisar: hay que reconstruirla cruzando `transferencia_items` con `transferencia_recepciones`. **Ninguna decisión escrita
  cubre quién responde por la prenda que falta ni dónde se registra la pérdida.**
- **Sobrante.** Entra al destino sin tocar el origen `[producción: cerrar_traslado_con_diferencia recorre toda recepción con
  cantidad > 0]`. Viola el principio 2 del repo (cero estados inconsistentes): la red queda con una prenda que no existe.
- **Quién cierra.** Puede cerrar quien ve Traslados, Existencias o Conteos, aunque haya sido quien contó. Es la decisión
  aplazada de `BACKLOG.md:317`. Hasta que se decida, la pantalla no debe decir «Solo líder».
- **R-24** («el traslado lo paga la tienda que recibe», dato duro) y la pregunta abierta **A-07** («¿el flete frena los
  traslados a Lima?») no tienen dónde anotarse: ni la tabla ni la pantalla registran el flete. Sin ese dato, A-07 no se puede
  responder nunca `[código]` `[producción: transferencias no tiene columna de costo]`.
- **Referentes** (de memoria, sin verificar): Odoo, en una transferencia interna recibida con menos, ofrece dejar lo pendiente
  como **pedido pendiente (backorder)** o darlo por no enviado. NetSuite separa lo **despachado** de lo **recibido** y la
  diferencia queda abierta hasta que alguien la resuelve. En los dos, la diferencia no se cierra solo del lado de quien recibe.
  Para 3 tiendas y 1 taller alcanza con algo mucho más simple (tarea #1).

### Arquitectura — 7
- **Cadena.** `page.tsx` → `getTrasladosDeLaSede`, que lee los traslados en curso sin tope y los últimos 30 cerrados, y aparta
  los vacíos `[código lib/traslados.ts:230-243]`. Después, el panel cliente → RPC `security definer` →
  `fn_aplicar_movimiento`. Lectura con RLS por sede y escritura directa revocada `[código]`.
- **Estados imposibles que ningún CHECK impide:**
  - Un traslado sin prendas (los 4 de producción son así).
  - `cerrada` sin `cerrado_en`.
  - Recibido sin `confirmado_en`.
  - `en_transito` sin fecha estimada (la columna acepta nulo).
  - Dos movimientos de entrada para la misma línea: no hay índice único en `movimientos.transferencia_recepcion_id`. Lo impiden
    solo el candado y el chequeo de estado `[producción: pg_constraint]`.

  Hay CHECK para la anulación (tres) y para origen ≠ destino `[producción]`.
- **Permisos.** Ninguna RPC pregunta `fn_ve_modulo('traslados')`: basta con poder operar la sede `[código]`. El módulo solo se
  exige en la web (`exigirModulo`). Es el mismo patrón que otras pantallas, pero contradice «los permisos se preguntan a la
  cuenta» (ADR-0161).
- **Concurrencia.** Si dos tablets cuentan la misma caja, la última escritura de cada casilla gana, y `registrado_por` se pisa
  sin historial (`BACKLOG.md:638`). Si alguien anula mientras otro cuenta, gana el primero, con un mensaje claro (D-132). Es
  aceptable para el volumen de CAYLA.
- **Volumen.** Supuesto generoso: 4 sedes × 3 traslados por semana × 40 prendas da unos 1.900 traslados y 75.000 líneas en 3
  años. No hace falta ningún índice por sede ni por estado. Sin número, no hay problema de rendimiento que discutir.
- **Caída externa.** No hay dependencias externas. Si la red se cae a mitad del conteo: **«se degrada así: la casilla queda
  pendiente en la pantalla y se reintenta al volver la red; no pierde lo ya guardado»**. No sobrevive a cerrar la pestaña sin
  red (no hay cola local como la de `/recibir`, ADR-0210) `[código :225-249]` `[inferido]`.
- **Desfase entre local y producción.** En producción el Taller **no tiene sububicaciones**; en local tiene «Rack A» y
  «Rack B», que solo crea `supabase/seed.sql:63-65` y ninguna migración `[producción]` `[código]`. El comentario de
  `confirmar_traslado` («el Taller solo tiene racks») es falso en producción. Las cuentas cuadran igual, porque `stock` usa
  `NULLS NOT DISTINCT`. Pero las pruebas locales corren sobre un Taller distinto del real.

### Funciones — 6
- **Existen y funcionan:**
  - Enviar, con origen fijo, tope por stock del almacén y token.
  - Recibir a ciegas, con escáner y prendas de más.
  - Confirmar parcial, elegir piso o almacén, anular, cerrar con diferencia.
  - Lista con filtros y búsqueda; pedidos entre sedes («Te piden / Pediste»), cuando los hay.
- **Promesas sin lógica detrás:**
  - «Solo líder» (`TrasladoDetallePanel.tsx:636`).
  - «Se baja al piso con Reponer» (`TrasladoConfirmarModal.tsx:15`): la pantalla se llama «Bajar al piso» y no hay enlace.
  - El filtro «Acción hoy» no tiene chip (`traslados-reglas.ts:118-137`).
  - `motivoSinResponsable` siempre llega en `null` (`TrasladoDetallePanel.tsx:697,708`).
  - «Volver a Existencias» en `/inventario/mover` nunca se alcanza `[código]`.
- **Faltan:**
  - **Pedir desde Traslados.** «Pedir a otra sede» solo se abre desde Análisis (`ResumenDesempenoPanel.tsx`), aunque la RPC
    acepta el módulo Traslados (ADR-0245). Quien no ve Análisis solo puede *empujar* desde su sede, nunca *pedir*.
  - **Número y enlace del traslado al enviar.** La RPC devuelve el id y el formulario lo descarta
    `[código MoverMercaderiaFormV2.tsx:203-226]`.
  - Aviso al origen cuando hay una diferencia.
  - «Lo siguiente» después de recibir.
- **Sobran:** la nota del pie en el estado vacío y el botón repetido del vacío.

### Utilidad — 6
Escenario: una integrante nueva de TRU, sábado en hora pico. AQP le escribe por WhatsApp que le faltan 2 vestidos M.
1. Abre Traslados → «+ Nuevo traslado». Llega a «Mover mercadería» y **el menú marca Existencias** (`AppShell.tsx:362-381`):
   duda si salió de Traslados `[código]`.
2. Busca la prenda en un combo. No hay foto ni escáner al enviar (tanda 1 sin construir) `[código]`.
3. La fecha estimada es obligatoria y se pide con hora `[código :186]`.
4. Envía. Ve «2 prendas enviadas a Tienda AQP», sin número de traslado `[código :221-238]`. AQP le pregunta «¿cuál es el número
   para buscarlo?» y **no lo tiene**: es el primer lugar donde se equivoca o pierde tiempo. **El error es del diseño.**
5. En AQP, recibir sí se entiende sin ayuda: cuenta a ciegas, «Terminé de contar», compara, elige piso o almacén `[código]`.

La integrante de AQP que quiso **pedir** los vestidos no tuvo cómo hacerlo desde Traslados: tuvo que usar WhatsApp.

### Conexión con el ERP — 6
Ver la sección 6. Están bien:
- Existencias («En camino hacia acá»).
- Inicio y el número del menú.
- Apartados (el pedido para apartar se aparta donde entró la prenda).
- Actividad (disparadores en producción desde el 2-oct).

Faltan:
- El enlace a «Bajar al piso» cuando lo recibido entra al almacén.
- El aviso al origen.
- El flete hacia Finanzas.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Directo: qué está en camino y qué se perdió. Indirecto: el stock por sede del que viven Existencias, Vender, Análisis y «Pedir a otra sede» |
| Dinero y stock que toca | ×1 | 8 | Mueve stock entre sedes; una diferencia mal cerrada deja una prenda fantasma o una pérdida sin rastro |
| Frecuencia y personas que la usan | ×1 | 5 | Hoy, 0 usos reales. Se espera de 2 a 10 por semana entre 3 tiendas y el Taller, con 1 a 2 personas por sede |
| Qué se detiene si falla | ×1 | 7 | La ropa se mueve igual por courier; el stock de cada sede se desvía y lo que llega se vende «por regularizar». Cuando se cierre la carga inicial, será la única puerta del Taller a las tiendas |

Relevancia = (2·7 + 8 + 5 + 7) / 5 = **6,8 → Soporte**. Sube a Núcleo el día que el Taller produzca en el sistema.

## 6 · Conexión con el ERP
- **Aguas arriba:**
  - El stock del almacén del origen: hoy entra al 100 % por carga inicial (TRU 751 u., AQP 14, LIM 1, Taller 0) `[producción]`.
  - Los pedidos entre sedes (`separacion_pedidos`, vacía) `[producción]`.
  - Las sugerencias de Análisis.
  - Los enlaces prellenados de Existencias, Producción y Cambios (`/inventario/mover?…`).
- **Aguas abajo:**
  - `movimientos`: `salida` y `entrada` con motivo `traslado_*`.
  - `stock` del destino, en piso o almacén.
  - Existencias «En camino».
  - Inicio y el contador del menú.
  - Apartados (`fn_apartar_pedidos_que_llegaron`).
  - Actividad (5 disparadores).
  - Vender, que descuenta del piso.
- **Pájaro dueño y vecinos:**
  - **Halcón (05)** es dueño de `transferencias*`, `stock` y `movimientos`.
  - La reposición entre sedes **sin cliente** (ADR-0242 D-7) vive en `separacion_pedidos`, que es de **Colibrí (07)**. Una
    función de Inventario quedó viviendo en una tabla de Ventas. Funciona, pero cualquier cambio a «Pedir» pasa por dos dueños.
- **Externos, y qué pasa si caen:**
  - Hoy no hay ninguno.
  - La guía de remisión de SUNAT quedó fuera a propósito (migración `20260916150000:21-22`) y está pendiente de una decisión
    legal (`BACKLOG.md:4772`).
  - La guía con QR y el mensaje de WhatsApp (ADR-0242 D-3) son enlaces pasivos (`wa.me`): si WhatsApp no responde, el traslado
    ya se guardó; solo no sale el aviso.
- **Una palabra, dos cosas:** en `movimientos`, los 157 movimientos `tipo='traslado'` de producción son **bajadas del almacén al
  piso dentro de la misma tienda** (TRU 143, AQP 14), no traslados entre sedes `[producción]`. La base los distingue
  (`fn_es_traslado_interno`), pero quien lea la tabla o un reporte sin esa función contará 157 «traslados» donde hubo 0.

## 7 · Las 12 tareas, por importancia

### #1 · Reconstruir — Una diferencia también la ve y la resuelve quien envió
- **Dónde:**
  - RPC `cerrar_traslado_con_diferencia` (migración `20260927160000:311-360`).
  - Contador `getTrasladosPorAtender` (`lib/traslados.ts:270-280`, hoy solo destino).
  - `TrasladoDetallePanel.tsx` (vista del origen).
  - Motivos nuevos en `movimientos`.
- **Qué:** cuando el destino cierra con diferencia, el origen recibe una tarea «Revisar el Traslado N», con su número en el menú:
  - *«Faltó 1 Vestido M: ¿está en tu almacén?»* → **Sí, la encontré**: entrada en el origen con motivo
    `traslado_no_salio`. **No**: queda como pérdida en el camino, con su propio registro.
  - *«Sobró 1 Blusa S: ¿salió de aquí?»* → **Sí**: salida en el origen con motivo `traslado_salio_de_mas`.
  - Mientras nadie conteste, no se mueve nada.
- **Por qué en este puesto:** es el único hueco que deja el stock mal sin que nadie lo vea, y no hace falta mala intención: basta
  un error al armar la caja. El faltante que nunca salió termina vendido «por regularizar»; el sobrante deja una prenda fantasma
  en el origen.
- **Cómo lo verificas tú:**
  - TRU envía 3 y arma la caja con 2.
  - AQP cuenta 2 y un líder cierra.
  - En TRU aparece «Revisar el Traslado N · faltó 1».
  - TRU responde «la encontré». En Existencias de TRU esa talla vuelve a 1, y en Movimientos sale la entrada
    `traslado_no_salio`.
- **Esfuerzo / dependencias:** L, con migración y OK de Felipe para pegarla. El primer paso, el aviso al origen, es S y sin
  migración. Junto con la #2.
- **DECIDÍ (recomendación, decide Felipe):** la diferencia se cierra en dos lados. El destino dice qué contó; el origen dice si lo
  que falta está en su almacén. Cada respuesta deja su propio movimiento.
- **DESCARTÉ:**
  - (a) Dejarlo como hoy: el error de quien armó la caja termina en la cola de regularizar, o en un sobrante que solo un conteo
    descubre semanas después.
  - (b) Ajustar el origen automáticamente al cerrar: asume que el error fue del origen, cuando pudo ser el courier o un hurto.
    Asumir es lo que ADR-0173 prohíbe.
- **SE ROMPE SI:** el origen nunca contesta. Mitigación: a los 7 días la línea pasa sola a «pérdida en el camino sin
  explicar», visible en Análisis, y el número del menú no desaparece hasta entonces.

### #2 · Corregir — Decidir quién cierra una diferencia, y que la pantalla diga la verdad
- **Dónde:**
  - `fn_puede_ajustar_inventario()` dentro de `cerrar_traslado_con_diferencia` `[producción]`.
  - El texto «Solo líder» (`TrasladoDetallePanel.tsx:636`).
  - El permiso `ajustarInventario` (`traslados/[id]/page.tsx:39`).
- **Por qué en este puesto:** hoy la integrante que contó puede cerrar su propia diferencia: cuenta 2 de 3 y da la tercera por
  perdida, sin dejar ni un movimiento de pérdida. Es la puerta más simple a un hurto hormiga. La decisión está aplazada
  (`BACKLOG.md:317`); la mentira en pantalla no tiene por qué esperar.
- **Opciones para Felipe:**
  - (a) `fn_es_lider()`. Ganas: la pantalla dice la verdad. Pagas: una tienda sin líder presente espera.
  - (b) «Cualquiera con Traslados, menos quien contó». Ganas: no hay que esperar al líder. Pagas: se compara contra
    `registrado_por`, que hoy se pisa en cada casilla.
  - (c) Dejarlo como está y cambiar el texto a «Quien ve Traslados». Ganas: cero código. Pagas: el control queda en nada.
  - Recomiendo **(a)**.
- **Cómo lo verificas tú:** con una cuenta de integrante con Traslados (sin ser líder), el bloque «Cerrar con esta diferencia»
  no aparece, y llamando a la RPC directo responde «Solo un líder…».
- **Esfuerzo / dependencias:** S (decisión + una línea de SQL + el texto). Con (a) lleva migración y OK. Antes que la #1, o
  junto con ella.

### #3 · Replantear — Primero un traslado real; después las tandas 1 a 3 del ADR-0242
- **Dónde:** el orden del ADR-0242 (`docs/adr/0242-…md`, «Orden de construcción») y `BACKLOG.md:642-643`.
- **Por qué en este puesto:** seis rediseños y ninguna prenda trasladada en producción. Las tandas 1 a 3 (enviar con escáner,
  bandeja «Hoy te toca», guía con QR) son 3 PRs grandes diseñados sin haber visto a nadie usar lo que ya existe. Esta tarea
  **no decide**: le pide a Felipe que elija entre las dos estrategias de la sección 8.
- **Cómo lo verificas tú:** Felipe elige A o B en la sección 8. Si elige A: hay una fecha y una caja real (TRU → AQP o Taller →
  TRU) y una persona que la mira sin ayudar; el resultado queda escrito en este archivo.
- **Esfuerzo / dependencias:** S (decidir y organizar el traslado real). Las #5, #6 y #7 dependen de lo que se elija.
- **DECIDÍ (recomendación):** A, primero el traslado real. Medio día de observación vale más que tres PRs a ciegas.
- **DESCARTÉ:** B, construir las tandas en el orden aprobado. Puede repetir lo que pasó con el «Coincide» (se construyó, se
  probó, se quitó) en tres pantallas a la vez.
- **SE ROMPE SI:** no hay mercadería real que mover en las próximas dos semanas (AQP y LIM casi sin stock cargado: 14 y 1
  unidades). Entonces el traslado real espera a la carga de AQP, y la tanda 1 se puede hacer antes (es la más barata).

### #4 · Conectar — «Pedir a otra sede» desde Traslados
- **Dónde:**
  - `app/(app)/inventario/traslados/page.tsx:47-63`: hoy `PedidosEntreSedes` solo aparece si ya hay pedidos.
  - `PedirAOtraSedeModal.tsx`: hoy solo lo abre `ResumenDesempenoPanel.tsx` (Análisis).
  - El estado vacío de `TrasladosPanel.tsx:143-155`.
- **Por qué en este puesto:** la necesidad más común de una tienda chica es *traer* una talla que no tiene, no *mandar*. Hoy
  quien no ve Análisis solo puede empujar desde su sede, aunque la RPC ya acepta el módulo Traslados (ADR-0245). Sin esto, el
  pedido sigue yendo por WhatsApp y el sistema no se entera.
- **Cómo lo verificas tú:** con una cuenta de AQP con Traslados y sin Análisis: en `/inventario/traslados` hay un botón
  «Pedir a otra sede» (también en el estado vacío), se pide 1 talla a TRU, y en TRU aparece «Te piden» con «Enviar».
- **Esfuerzo / dependencias:** S-M, sin migración. Ninguna (la absorbe la tanda 2 si algún día se construye).

### #5 · Mejorar — Al enviar: el número, el enlace y lo que va en la caja
- **Dónde:** `MoverMercaderiaFormV2.tsx:203-238`, donde se descarta el id que devuelve `iniciar_traslado`.
- **Por qué en este puesto:**
  - Sin número, la otra sede no tiene cómo buscar el traslado.
  - Sin lista, quien envía no tiene con qué revisar la caja antes de cerrarla.
  - Es la mitad barata de ADR-0242 D-3 (la guía con QR es la otra mitad).
- **Cómo lo verificas tú:** al enviar, la pantalla dice «Traslado 12 · 3 prendas a Tienda AQP», con «Ver el traslado» y la
  lista de prendas, y un botón «Copiar mensaje para AQP» (sin cantidades, por el conteo a ciegas).
- **Esfuerzo / dependencias:** S. Después de la #3 si Felipe elige la estrategia B; si no, en cualquier momento.

### #6 · Mejorar — «Nuevo traslado» vive en Traslados (ADR-0242 tanda 1)
- **Dónde:** `app/(app)/inventario/mover/page.tsx` pasa a `/inventario/traslados/nuevo`, con redirección que conserva los
  parámetros. El menú: `AppShell.tsx:362-381`.
- **Por qué en este puesto:** cierra el §16 del análisis previo: el menú marca Existencias y la persona cree que salió de
  Traslados. El escáner y la búsqueda con foto (D-2) van en la misma tanda, aprobada por Felipe.
- **Cómo lo verificas tú:** desde Traslados, «+ Nuevo traslado» → la URL es `/inventario/traslados/nuevo` y el menú marca
  Traslados. Un enlace viejo `/inventario/mover?variante=…` sigue llegando con la prenda cargada.
- **Esfuerzo / dependencias:** M (solo ruta y menú: S). Depende de la #3.

### #7 · Conectar — «Lo siguiente» después de recibir
- **Dónde:**
  - `TrasladoConfirmarModal.tsx:15` (el texto «con Reponer»).
  - El resultado de `confirmar_traslado` en `TrasladoDetallePanel.tsx`.
  - ADR-0242 D-6.1.
- **Por qué en este puesto:** si lo recibido entró al almacén, no se vende hasta bajarlo, y el modal manda a una pantalla con
  otro nombre y sin enlace.
- **Cómo lo verificas tú:** se confirma un traslado eligiendo «Almacén», y aparece «Bajar estas al piso», que abre
  `/inventario/bajar` con las prendas cargadas. «Imprimir etiquetas» lleva a `/etiquetas-de-precio?variantes=`.
- **Esfuerzo / dependencias:** S. Ninguna.

### #8 · Corregir — Guía de foco en Nuevo traslado y en los modales
- **Dónde:** `lib/guia-de-foco-pantallas.ts:100,104-105` (tres pantallas PENDIENTE) y `:207,236-238` (Anular, Confirmar,
  Cerrar, PedidosEntreSedes). Confirmar y Cerrar tienen un solo control: candidatos a `no-aplica`.
- **Por qué en este puesto:** es una regla obligatoria (ADR-0284). El formulario de envío es justo donde la integrante duda qué
  le falta (destino, prenda, fecha).
- **Cómo lo verificas tú:** `pnpm focus` sobre `/inventario/mover`. En el navegador, el campo que sigue se enciende y «Falta:
  fecha de llegada» lleva al campo. Se bajan `PENDIENTES_HOY` y `MODALES_PENDIENTES_HOY`.
- **Esfuerzo / dependencias:** M. Hacerla junto con la #6 si se construye; si no, sobre el formulario actual.

### #9 · Corregir — «En camino» en Existencias: cuántos traslados y cuántas prendas, con la misma regla
- **Dónde:** `app/(app)/inventario/page.tsx:133-141`: el número de traslados y la próxima llegada incluyen
  `recibido_con_diferencia`. Las unidades (`lib/inventario-v2.ts:274-278`) cuentan solo `en_transito`.
- **Por qué en este puesto:** un traslado recibido con diferencia hace decir «1 traslado en camino · 0 prendas». Es pequeño,
  pero es un número que no cuadra en la pantalla más usada del módulo. Hoy no se ve (0 traslados reales).
- **Cómo lo verificas tú:** un traslado de 3 recibido con 2, sin cerrar. En Existencias del destino, «En camino» dice 0
  traslados y 0 prendas.
- **Esfuerzo / dependencias:** S. Ninguna.

### #10 · Mejorar — Anotar el flete del traslado (R-24, A-07) · *decide Felipe*
- **Dónde:** `transferencias`, con una columna opcional de monto, o un gasto de Finanzas con categoría «Flete» que lleve el
  número del traslado. Se anota en el formulario de envío o al recibir.
- **Por qué en este puesto:** R-24 es un dato duro y A-07 lleva abierta desde el 12-sep. Sin el dato, la pregunta «¿el flete
  frena los traslados a Lima?» no se responde nunca. Va bajo porque hoy hay 0 traslados.
- **Cómo lo verificas tú:** en Finanzas, «Flete por sede, último mes» muestra cuánto pagó cada tienda y por cuántos traslados.
- **Esfuerzo / dependencias:** M. Decide Felipe si va en el traslado o en Gastos (recomiendo Gastos: el dinero vive en Finanzas).
  No antes de la #3.

### #11 · Corregir — *bajo valor* · Sacar los traslados de prueba y poner al día los papeles
- **Dónde:**
  - Producción: los Traslados 1 a 4, sin prendas. El 4 (Taller → AQP) sigue «en tránsito» desde el 17-sep.
  - `docs/SESIONES-ACTIVAS.md`: dos filas viejas.
  - `docs/backlog/2026-10-01-traslados-window-empty-625dcb.md:5` y `BACKLOG.md:639`: dicen «por pegar» y «dos puertas», pero
    las dos cosas ya están resueltas en producción.
  - `docs/datos/modulos/05`: describe el traslado de V1.
- **Por qué en este puesto:** el código ya oculta los traslados vacíos y el contador no los cuenta. Un papel viejo hace que la
  próxima sesión rehaga lo hecho.
- **Cómo lo verificas tú:** Felipe anula el Traslado 4 (motivo «prueba de setiembre») y queda `anulada`. En el backlog, la
  migración `20261001140000` aparece como pegada.
- **Esfuerzo / dependencias:** S. Ninguna.

### #12 · Mejorar — *bajo valor / opcional* · Un estado vacío que enseñe las dos caras
- **Dónde:** `TrasladosPanel.tsx:143-155` y la nota del pie de `page.tsx`.
- **Por qué en este puesto:** hoy el vacío ofrece dos veces lo mismo (enviar) y una nota sobre recibir. Mejor: «Enviar prendas
  a otra sede» y «Pedir prendas a otra sede» (si la #4 está hecha), sin la nota. Es cosmético mientras no haya traslados.
- **Cómo lo verificas tú:** en una sede sin traslados se ven dos acciones distintas y ninguna se repite con la cabecera.
- **Esfuerzo / dependencias:** S. Después de la #4.

## 8 · Estrategia alternativa (decide Felipe — tarea #3)

| | **A · Primero un traslado real** (recomendada) | **B · Las tandas del ADR-0242 en orden** |
|---|---|---|
| Qué es | Una caja real (TRU → AQP, o la primera producción Taller → TRU), con una integrante que envía y otra que recibe, y alguien que mira sin ayudar. Después se construyen solo las partes de las tandas 1 a 3 donde se trabaron. Mientras tanto, las #1, #2, #4, #5 y #7, que no dependen de eso | Tanda 1 (Nuevo traslado con escáner) → 2 («Hoy te toca») → 3 (guía con QR y WhatsApp) → 5 (acceso en Existencias), como aprobó Felipe el 26-sep |
| Ganas | Se construye lo que la tienda de verdad necesita; se arreglan primero los huecos de stock (#1, #2), que no dependen de la interfaz | Cumple lo aprobado sin volver a discutirlo; la interfaz queda completa y pareja |
| Pagas | Se posterga lo aprobado; requiere coordinar una caja real; si AQP no tiene stock cargado, la prueba espera | Unas 3 semanas-PR de interfaz para un flujo con 0 usos; arriesga repetir el «Coincide» (se construyó y se quitó) |
| Se rompe si | No hay ninguna caja real que mover en dos semanas | La primera integrante real se traba en algo que ninguna tanda contempló |

## 9 · Referentes de ERP y futuro
- **Odoo Inventario** (de memoria, sin verificar): transferencias internas en dos pasos con **backorder** al recibir menos.
  Lo aplicable hoy es la #1 (la diferencia también la resuelve el origen). Los backorders automáticos, no: con 3 tiendas, un
  «pedir lo que faltó» (#4) alcanza.
- **NetSuite Transfer Orders** (de memoria, sin verificar): la diferencia entre lo despachado y lo recibido queda abierta hasta
  resolverse. Mismo principio que la #1.
- **Shopify (transferencias de inventario)** (de memoria, sin verificar): recepción con cantidades «aceptadas» y «rechazadas».
  Lo de CAYLA (conteo a ciegas, D-130) ya es más estricto.
- **Futuro, no cuenta entre las 12:**
  - Guía de remisión electrónica de SUNAT, cuando el traslado salga de una provincia a otra con transporte propio: espera la
    decisión legal (`BACKLOG.md:4772`).
  - Reposición automática por mínimos entre sedes: con 3 tiendas, la sugerencia de Análisis y la decisión humana alcanzan.
  - Tránsito con seguimiento del courier: CAYLA no integra couriers y no lo necesita a este volumen.

## 10 · Fuera de esta pantalla
**El Taller nunca ha movido una prenda en el sistema.**
- En producción hay 0 producciones, 0 movimientos en el Taller y 0 sububicaciones del Taller. El 100 % del stock de las tiendas
  (766 unidades) entró por **carga inicial** `[producción]`. Esa puerta es temporal (ADR-0212).
- El día que se cierre, la única forma de que una prenda nueva llegue a una tienda será **Producción → stock del Taller →
  Traslado**. Esa cadena nunca corrió en producción, y su prueba local corre sobre un Taller con racks que producción no tiene.
- Antes de cerrar la carga inicial, hay que pasar **un lote real** de punta a punta (cerrar producción en el Taller → enviar a
  TRU → contar → vender). Si algo se rompe ese día, la tienda no puede vender la colección nueva sin pasar todo por «por
  regularizar».

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:traslados]` #1 Diferencia en dos lados: el origen revisa faltantes y sobrantes con movimiento propio — L (migración; aviso al origen S primero)
- [ ] `[pantalla:traslados]` #2 Decidir quién cierra una diferencia (recomendado `fn_es_lider()`) y corregir «Solo líder» — S
- [ ] `[pantalla:traslados]` #3 Decidir estrategia A/B: traslado real antes de las tandas 1-3 del ADR-0242 — S
- [ ] `[pantalla:traslados]` #4 «Pedir a otra sede» desde Traslados (y en el estado vacío) — S-M
- [ ] `[pantalla:traslados]` #5 Al enviar: número, enlace al detalle, lista y mensaje para la otra sede — S
- [ ] `[pantalla:traslados]` #6 Nuevo traslado en `/inventario/traslados/nuevo` (ADR-0242 tanda 1) — M
- [ ] `[pantalla:traslados]` #7 «Lo siguiente» al recibir: Bajar al piso cargado + etiquetas — S
- [ ] `[pantalla:traslados]` #8 Guía de foco en Nuevo traslado, detalle y modal Anular — M
- [ ] `[pantalla:traslados]` #9 «En camino» de Existencias: traslados y prendas con la misma regla — S
- [ ] `[pantalla:traslados]` #10 Flete del traslado (R-24/A-07), decide Felipe dónde — M
- [ ] `[pantalla:traslados]` #11 Anular los traslados de prueba y poner al día backlog/sesiones/módulo 05 — S
- [ ] `[pantalla:traslados]` #12 Estado vacío con «Enviar» y «Pedir» — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Sede · fecha · hora | Contexto | bien | `[visto]` |
| Cabecera | «Traslados» + frase | Título y finalidad | bien | `[visto]` |
| Cabecera | «+ Nuevo traslado» | Lleva a `/inventario/mover` | ajustar (ruta propia, #6) | `[código page.tsx:51]` |
| Cuerpo | Pedidos entre sedes | «Te piden / Pediste», solo si hay pedidos | ajustar (falta «Pedir», #4) | `[código page.tsx:59-65]` |
| Cuerpo | Estado vacío | Explica y ofrece crear | ajustar (dos caras, #12) | `[visto]` |
| Cuerpo | «Crear el primer traslado» | Igual que el de la cabecera | sobra / reemplazar por «Pedir» | `[código TrasladosPanel.tsx:150]` |
| Pie | Nota en hueso sobre recibir | Explica D-129 | sobra en el vacío (ADR-0242 D-1) | `[visto]` |
| Lista (con datos) | Cifras, filtros, búsqueda, filas | Ver y filtrar | bien | `[código TrasladosResumen.tsx]` |
| Detalle | Recorrido de 4 pasos | Historia del traslado | bien | `[código TrasladoRecorrido.tsx]` |
| Detalle | Conteo a ciegas + escáner | Recibir | bien | `[código :117-119, :463-481]` |
| Detalle | Confirmar → piso/almacén | Entra lo que coincide | bien; falta «Lo siguiente» (#7) | `[código TrasladoConfirmarModal.tsx]` |
| Detalle | «Cerrar con esta diferencia» · «Solo líder» | Cierra lo pendiente | corregir (#1, #2) | `[producción]` |
| Detalle | Anular (origen) | Devuelve el stock | bien | `[producción]` |
| Nuevo traslado | Formulario | Envía | ajustar (#5, #6, #8) | `[código MoverMercaderiaFormV2.tsx]` |
| — | Aviso al origen de una diferencia | — | falta (#1) | `[código lib/traslados.ts:270-280]` |
| — | Flete | — | falta (#10) | `[producción]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | recorrido de usabilidad (sin puntajes; 17 hallazgos, SHA `2227a9fd`) | — | — | — |
| 2026-10-03 | completo (SHA `fe5441ec`) | 5,0 (6,3 con tope) | 6,8 Soporte | De los 17 hallazgos del 26-sep: **cerrados 10** (1 piso/almacén, 2 «por recibir», 3 todo o nada, 4 se perdía el conteo, 5 anular, 6 el formulario decidía, 11 «Coincide», 12 escáner, 13 botones que se movían, 14 cierre sin confirmar). **Parcial 1:** 15 (la lista ya dice «Cerrado con diferencia», pero el origen sigue sin enterarse: va a la #1). **Abiertos 6:** 7 buscador por palabras, 8 la cantidad cambia sola, 9 fecha con hora, 10 envío sin número ni papel (#5), 16 el menú marca Existencias (#6) y 17 búsqueda por código de etiqueta (sin verificar hoy). Su sección «Lo que no se pidió» («dos puertas para recibir») está **cerrada**: ADR-0299 está en producción. |
