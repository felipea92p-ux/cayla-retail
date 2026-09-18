# ADR-0094 — Proveedores: ficha ampliada, métricas de compras/insumos, y devolver_proveedor deja de desaparecer

**Fecha:** 2026-09-17
**Estado:** Construido y verificado en local, esta vez incluido el navegador real (no solo
`psql`) — ver "Cómo se verificó", sección "Segunda vuelta", para el bug real que esa prueba
encontró y que `psql` con parámetros nombrados no detectaba. Pendiente: pegar en producción.
**Afecta:** `supabase/migrations/20260917210000_devolver_proveedor_entra_a_cuarentena.sql`,
`20260917220000_proveedores_rubro_plazo_forma_pago.sql`,
`20260917230000_proveedor_metricas_compras_e_insumos.sql`; `apps/web/lib/proveedores.ts`;
`apps/web/components/ProveedoresPanel.tsx`; nueva ruta
`apps/web/app/(app)/compras/proveedores/[id]/page.tsx`; `docs/datos/DECISIONES-2026-09-12.md`
(D-46, corrección de staleness).

## Contexto

Felipe pidió más métricas de proveedor ("cuánto nos factura cada proveedor, etc"). Antes de
construir nada se hizo el protocolo de pregunta completo (Felipe pidió explícitamente
"antes de implementar cualquier cosa, preguntas"). Se auditó primero el estado real —no lo
que decían `docs/datos/modulos/09-compras-y-proveedores.md` ni BITÁCORA 2026-09-05, que
describen una tabla `proveedores` con banco/cuenta_bancaria/categoría/marca/score/teléfono y
`productos.proveedor_id`, **ninguno de los cuales existe en este repo ni en producción,
verificado contra `vovjyyiafkxteijimpuy` en vivo** (esos documentos describen otra línea de
migraciones, probablemente la de unificación/SINATRA, no esta). La realidad verificada:
`proveedores` en producción tenía 1 sola fila y 6 columnas (id/nombre/ruc/contacto/activo/
created_at); `compras`/`compra_items`/`compra_pagos` en 0 filas (el flujo de factura formal
nunca se usó de verdad); la única recepción real (Confecciones del Sur EIRL) entró por el
camino sin factura, que no toca `compras`.

Felipe respondió el protocolo de pregunta con 4 decisiones:
1. **Objetivo** (multiselección): negociar mejor, cuidar el flujo de caja, medir confiabilidad.
2. **Prioridad**: cerrar huecos de integridad antes que construir métricas encima.
3. **Alcance**: proveedor de insumos del Taller y de prenda terminada comparten ficha
   (`proveedor_id`), pero sus métricas se muestran en **secciones separadas**, nunca sumadas.
4. **Ficha nueva**: sí agregar plazo de crédito, rubro y forma de pago preferida.

Al aplicar la decisión 2 se encontró una contradicción real: horas antes, en otra sesión,
Felipe había decidido explícitamente que arreglar `devolver_proveedor` (una devolución con
esa condición no genera movimiento ni ajusta nada — "desaparece sin dejar rastro", mismo bug
que tenía Dañado) **no era prioridad** ("si no afecta nuestra actividad actual ahora mismo,
entonces no" — `docs/BACKLOG.md`, sección "Pendientes Benja"). Se le mostró la contradicción
explícita — no se asumió una respuesta — y Felipe la revisó: con el contexto de que "cuánto
le debemos a un proveedor" iba a ser una métrica real, sí valía la pena cerrarlo ahora.

## Decisión

**DECIDÍ, en 4 piezas:**

**1. `devolver_proveedor` entra a cuarentena, igual que Dañado — reusando la máquina que ya
existe, no una nueva.** `20260917195448_cuarentena_prendas_danadas.sql` (mismo día, sesión
anterior) había resuelto exactamente este bug para `danada_reparacion`/`danada_donar` y dejó
`devolver_proveedor` flageado a propósito, afuera. En vez de una tabla/flujo gemelo,
`devolver_proveedor` se suma como tercera condición que entra a `cuarentena`, y
`prendas_danadas` gana un cuarto estado de resolución, `devuelta_proveedor`, con una columna
`proveedor_id` (nullable, con un check de coherencia: solo puede estar seteada cuando
`estado = 'devuelta_proveedor'`). **A quién se le devuelve lo elige a mano quien resuelve**
(nuevo parámetro `p_proveedor_id` en `resolver_prenda_danada`) — no hay ningún camino de
datos hoy que lo infiera solo: `devoluciones` cuelga de `venta_id`, nunca de una compra, y
`productos.proveedor_id` (el "proveedor preferido del producto" que BITÁCORA 2026-09-05 da
por construido) no existe en este repo. Inventar una inferencia automática sin nada real que
enganchar habría sido el mismo error que ADR-0035 evitó con `ordenes_compra.monto_estimado`
(un número que nunca se concilia). Por la misma razón, **no hay ajuste automático de saldo
contra una factura** — la persona que hace la devolución física es quien sabe con quién está
hablando, y lo registra, igual que ya hace con Liquidada/Se botó/Donada.

**2. `proveedores` gana `rubro` (texto libre), `plazo_credito_dias` (integer, > 0) y
`forma_pago_preferida` (mismo vocabulario cerrado que ya usa `compra_pagos.metodo`).** `rubro`
es a propósito texto libre, no el patrón de vocabulario cerrado de `colores`/`categorias`
(ADR-0070): es metadata de agrupación sin impacto en integridad de inventario, y construir la
maquinaria completa (proponer/aprobar, `fn_clave_texto`) para un campo sin historia de uso
real sería sobre-construir (principio 5). Se revisa el día que el texto libre demuestre ser
un problema real, no antes.

**3. Dos funciones nuevas de métricas, deliberadamente separadas, nunca una sola que sume
todo:** `fn_proveedor_metricas_compras` (facturas vigentes, total facturado, saldo, última
compra, vencidas, recibidas completas vs. con recepción pendiente) y
`fn_proveedor_metricas_insumos` (lotes, total comprado, última entrega). Reflejan la decisión
3 de Felipe tal cual — dos negocios, dos números, nunca mezclados.

**4. Candado de sede repetido a mano en las dos funciones nuevas — el hallazgo más importante
de esta pasada, técnicamente.** [ADR-0075](0075-compras-lectura-acotada-por-sede.md), de esa
misma tarde, había cerrado que la lectura de `compras` queda acotada por
`fn_puede_operar_ubicacion`, y advierte en su propia sección de consecuencias: cualquier RPC
nueva que lea `compras` directo tiene que repetir ese chequeo a mano, porque una función
`security definer` corre con los privilegios del dueño de la función y se salta cualquier
política de fila sin excepción. La primera versión de `fn_proveedor_metricas_compras`
escrita en esta sesión NO lo tenía — se corrigió antes de la primera prueba, no después de
encontrar el hueco en producción. `insumo_lotes` ya había nacido esa misma tarde con la
política de sede correcta a nivel de tabla (`insumo_lotes_select`), pero el mismo argumento
aplica igual: una función `security definer` la salta si no repite el chequeo, así que
`fn_proveedor_metricas_insumos` también lo tiene.

## Consecuencias

- Con `compras`/`insumo_lotes` prácticamente vacías todavía, las métricas nuevas devuelven
  mayormente ceros hoy — es lo esperado, no un bug: están construidas para cuando el uso real
  empiece, no para mentir con datos de prueba.
- `fn_proveedores()` (la lista) tuvo que recrearse con `drop function` en vez de
  `create or replace`, porque Postgres no permite cambiar las columnas de salida de una
  función existente solo con `replace`.
- D-46 (`docs/datos/DECISIONES-2026-09-12.md`) tenía el mismo problema que ya se había
  encontrado en D-45: la mitad "cuentas por pagar" quedó resuelta por ADR-0035 el
  2026-09-12 y el documento nunca se actualizó. Se corrigió con la misma cita cruzada que ya
  usa D-45/D-26. La mitad IGV de D-46 (crédito fiscal acumulado, umbral de 300 UIT) sigue
  genuinamente abierta — no se tocó.
- Pendiente, fuera de esta pasada a propósito: filtrar/agrupar la lista de proveedores por
  `rubro` (el campo ya se puede guardar y leer, no hay pantalla que lo use para filtrar
  todavía); un panel para editar el vocabulario de formas de pago si algún día deja de
  alcanzar con los 6 valores fijos; IGV acumulado de D-46.

## Cómo se verificó

Contra Postgres LOCAL (`npx supabase db reset` limpio de punta a punta, incluida la nueva
migración), con `psql`/`docker exec`, dentro de transacciones con `ROLLBACK` (nada de esto
quedó como dato real):

- `devolver_proveedor`: una devolución con esa condición, aprobada, generó el movimiento de
  entrada a `cuarentena` real (confirmado el tipo de sububicación); `resolver_prenda_danada`
  sin `p_proveedor_id` para el estado `devuelta_proveedor` rechazó con el mensaje esperado;
  con un proveedor que no aplica (otro estado) también rechazó; resuelta correctamente generó
  el movimiento de salida (`motivo = cuarentena_devuelta_proveedor`) y dejó `proveedor_id`,
  `resuelto_por` y `resuelto_en` bien seteados.
- Campos nuevos: alta con `rubro`/`plazo_credito_dias`/`forma_pago_preferida` y lectura de
  vuelta por `fn_proveedores()` coincide; plazo ≤ 0 y forma de pago fuera de la lista
  rechazan con el mensaje en idioma CAYLA correspondiente.
- **Candado de sede, el caso que más importaba probar:** con el proveedor real de seed
  "Textiles Andina SAC" (una factura en Taller, otra en Tienda Lima), Felipe (líder) ve las 2
  facturas combinadas (S/13,829.60 facturado, S/5,133.60 de saldo); Micaela (integrante,
  Tienda Trujillo) ve **todo en cero** para el mismo proveedor — ninguna de las dos facturas
  es de su sede.

**Segunda vuelta — con navegador real, no solo `psql` (mismo día, después de que
`ProveedoresPanel.tsx` y la pantalla de detalle quedaran construidas):**

- La pantalla de detalle (`/compras/proveedores/[id]`) renderiza igual que lo verificado por
  `psql`: mismos números para "Textiles Andina SAC" (S/13,829.60 facturado, S/5,133.60 de
  saldo, 1 vencida, 1 completa/1 pendiente), sección de Insumos con el estado vacío correcto.
- **Bug real, encontrado recién acá, no antes:** registrar un proveedor nuevo desde el
  formulario real respondía `500`, aunque la prueba de `psql` con parámetros nombrados
  (arriba) había pasado. Causa: `registrar_proveedor`/`actualizar_proveedor` se habían
  extendido con `create or replace function` agregando parámetros nuevos al final — eso NO
  reemplaza la función existente (a diferencia de un cambio de `RETURNS`, que Postgres sí
  rechaza y obliga a corregir antes de tiempo), **crea una segunda sobrecarga** y deja la
  vieja de 3/4 parámetros viva al lado de la nueva. Mismo bug que ADR-0009/0004 ya nombró
  para otras funciones ("un candado: una sola firma"), aplicado sin querer acá. `psql` con
  todos los parámetros nuevos explícitos resuelve sin ambigüedad porque solo la firma nueva
  los tiene — por eso esa prueba pasaba y ocultaba el problema. Corregido agregando
  `drop function` de las firmas viejas antes de crear las nuevas (`fn_proveedores()` ya lo
  hacía, forzada por el error de Postgres; a estas dos les faltaba). Verificado después:
  `pg_proc` muestra una sola firma de cada una.
- Con el candado corregido, el registro real desde el navegador (Felipe, líder) funcionó de
  punta a punta: proveedor nuevo con rubro/plazo/forma de pago aparece en la lista al
  instante, con el rubro visible en la fila (pedido de Felipe, mismo día: "parámetros clave
  del proveedor... sin necesidad de tener que presionar en él"), y el modal de edición trae
  de vuelta los 3 valores guardados correctamente.
- De paso, se encontró (no se tocó, es aparte): las 2 fichas de proveedor del seed tienen un
  RUC que no pasa el checksum de `validarDocumento`, lo que deja el botón Guardar
  deshabilitado para CUALQUIER edición de esas dos fichas — un problema de los datos de
  prueba, no del código de esta pasada. Queda anotado en BACKLOG.

**Tercera vuelta — Felipe vio la pantalla y pidió dos cosas más el mismo día: los
indicadores de la ficha también en la fila de la lista (sin clic), y que solo un líder
vea eso y entre al detalle.**

- Antes de tocar nada: lo segundo contradice D-27 tal como estaba escrito ("visible para
  cualquiera con cuenta, transparencia"). Se le mostró la cita exacta a Felipe — no se
  asumió una respuesta. Decidió una versión más angosta que "reemplazar D-27 del todo":
  el directorio (nombre/RUC/contacto/rubro/plazo/forma de pago) sigue siendo para
  cualquiera con cuenta; lo financiero (facturas, montos, vencidas, recepción) y el clic
  al detalle pasan a ser solo de líder. `20260917240000_proveedores_lista_indicadores_y_candado_sede.sql`
  extiende `fn_proveedores()` con `total_facturado`, `facturas_vencidas`,
  `facturas_recibidas_completas`, `facturas_con_recepcion_pendiente`, y envuelve TODO lo
  financiero en `case when fn_es_lider() then ... end` — la base no manda el dato a quien
  no debe verlo, no es solo la pantalla la que lo esconde.
- **Hallazgo que cambia el diagnóstico: `/compras/proveedores` (y las otras 4 pantallas de
  Compras) ya eran solo-líder desde el 2026-09-16** —
  `apps/web/app/(app)/compras/layout.tsx` redirige a "/" a cualquier colaborador antes de
  llegar a la pantalla, con su propio comentario explicando por qué se centralizó ahí
  ("protege las 5 de una sola vez"). Confirmado en el navegador: Micaela, logueada de
  verdad, nunca llegó a ver la lista — `window.location.href` mostró que había vuelto a
  "/". Es decir: la mitad de lo que pidió Felipe ("solo el líder entra al detalle") **ya
  estaba resuelta** desde antes, y D-27 (2026-09-12) quedó desactualizado sin que nadie lo
  notara — describía una pantalla que 4 días después se volvió líder-only y nunca se
  corrigió el documento. Lo genuinamente nuevo de hoy es el candado del LADO DE LOS DATOS:
  antes de esta migración, alguien con sesión podía llamar `fn_proveedores()` directo por
  API (saltándose la pantalla y el layout) y seguir recibiendo saldo/facturas de
  cualquier proveedor. Ahora esa misma llamada devuelve `NULL` en esos campos si quien
  pregunta no es líder — el layout protege la navegación, esto protege el dato.
- Con ese hallazgo, se sacó del código un chequeo de rol que se había escrito en
  `compras/proveedores/[id]/page.tsx` (redundante con el del layout, en contra del propio
  criterio de ese layout de centralizar el candado en un solo lugar) — quedó solo el
  comentario explicando por qué no hace falta repetirlo.
- **Bug real #2, encontrado en esta misma vuelta de navegador:** al convertir
  `fn_proveedor_metricas_compras`/`fn_proveedor_metricas_insumos` de `language sql` a
  `plpgsql` (para poder hacer `if not fn_es_lider() then raise exception`), Postgres
  declara cada columna de `RETURNS TABLE` como variable de salida — y `saldo` (nombre de
  columna de salida) chocó con `compras.saldo` (columna de la tabla) con "column
  reference is ambiguous". `create or replace` no avisa este error al aplicar la
  migración; recién se manifestó al abrir la pantalla de detalle en el navegador.
  Corregido calificando cada columna con el alias de su tabla (`c.saldo`, `il.fecha_ingreso`,
  etc.) en las dos funciones.
- Verificado de nuevo de punta a punta en el navegador tras los dos arreglos: Felipe ve
  la lista con las 4 columnas financieras nuevas y entra al detalle sin problema; Micaela
  sigue sin poder llegar a `/compras/proveedores` en absoluto (comportamiento que ya tenía
  desde el 2026-09-16, ahora reforzado también a nivel de dato).
