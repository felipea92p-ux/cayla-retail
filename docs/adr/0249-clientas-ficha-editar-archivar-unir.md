# ADR-0249 — Clientas, paso 2 del acta: ficha, editar, archivar/anonimizar y unir fichas

**Fecha:** 2026-09-27
**Estado:** Aceptado e implementado en rama (`claude/clientas-ficha-y-lista`). Verificado con un
Postgres 17 desechable que corrió las 341 migraciones del repo en orden (incluidas estas 5), 15
escenarios de integración (éxito, rechazo y una carrera real de concurrencia con dos conexiones
simultáneas), `tsc`, `eslint` y `vitest` (78 305 pruebas) en verde, y una verificación visual real
en el navegador — sesión de Felipe (líder/Admin) y de Micaela (colaboradora), a 1440 px y a 375 px —
contra un stack de Supabase completo y aislado (proyecto `cayla-retail-verif-clientas`, nunca el
Docker compartido por las demás sesiones). **Migraciones sin aplicar en producción** — las aplica
Felipe o el arquitecto con el protocolo de ensayo aparte. *(2026-09-28: el paso 2 ya está en producción (PR #543), sin
la política `clientas_fusiones_select`, a propósito; ver «Actualización 2026-09-28» al final.)*

**Decide:** Felipe, en la ronda de 20 preguntas (D-92 a D-111,
`docs/datos/DECISIONES-2026-09-26-clientas.md`, sección H, paso 2). El paso 1 del acta (Caja liga
la venta a la ficha) sigue sin fusionar; Felipe decidió construir este paso igual — con evidencia:
`fn_clienta_compras` y las demás lecturas ya funcionan de punta a punta con las ventas de prueba del
seed, y funcionarán igual con ventas reales en cuanto el paso 1 aterrice.

**Afecta:** `retail.clientas` (columnas nuevas: `version`, `archivada_en`, `archivada_por`,
`motivo_archivo`, `anonimizada`, `fusionada_en_id`); tabla nueva `retail.clientas_fusiones`; FK real
`pedidos_no_atendidos.clienta_id → clientas.id`; RPC nuevas `editar_clienta`, `archivar_clienta`,
`reactivar_clienta`, `unir_clientas`, `exportar_clientas`, `fn_clienta_compras/cambios/
devoluciones/separaciones`; `buscar_clienta` gana `p_incluir_archivadas`. Web: `lib/menu.ts` (nodo
`clientas` de `futura` a `viva`), `lib/clientas*.ts`, `components/ClientasPanel.tsx` (reescrito),
`components/ClientaFichaModal.tsx` y `components/NuevaClientaModal.tsx` (nuevos).

## El encargo, en una frase

`/clientas` deja de ser la pantalla de verificación de D-76/D-77 (solo alta y búsqueda) y se
convierte en la ficha de verdad: buscar por DNI o celular, ver su actividad completa (compras,
cambios, devoluciones y apartados, **leídos** de esas tablas, nunca copiados), la talla que se le
deduce por tipo de prenda (D-101) y cuánto le falta para ser frecuente (D-103), editar con candado
optimista, archivar o anonimizar a pedido (Ley 29733) y unir dos fichas de la misma clienta (D-99).

## DECISIÓN 1 — Concurrencia: `version` reusado, no `updated_at` nuevo

El encargo pedía el candado optimista con «columna `updated_at` + trigger». Antes de escribirlo se
revisó qué ya resuelve este problema en el repo (principio 7, Carmack: antes de agregar, se mira qué
se puede borrar o reusar) — y `productos`/`roles` ya lo resuelven desde el 2026-09-24
(`20260924160000_edicion_simultanea_con_version.sql`, ADR-0193): columna `version integer`, trigger
genérico `fn_subir_version()`, errcode `PT409` que la web YA traduce (`error-escritura.ts`:
`esVersionCambiada`, `CODIGO_VERSION_CAMBIADA`) y ya sabe mostrar («Otra persona cambió esto
mientras lo editabas. Recarga para ver sus cambios» + botón Recargar, patrón de `ProductoForm.tsx`).

**DECIDÍ:** reusar `version` + `fn_subir_version()` en `retail.clientas`, con el mismo mensaje y el
mismo errcode que ya conoce toda la web.
**DESCARTÉ:** un candado nuevo con `updated_at` + un trigger propio de `clientas` — mismo problema,
misma garantía, resuelto DOS VECES de dos formas distintas. Es exactamente lo que la integridad
conceptual (Brooks, CLAUDE.md principio 2) prohíbe: la próxima persona que agregue un candado
optimista a otra tabla no sabría cuál de los dos patrones copiar.
**SE ROMPE SI:** `fn_subir_version()` deja de ser genérica algún día (hoy vive sin prefijo de tabla
a propósito). No hay indicio de eso.

## DECISIÓN 2 — Archivar y anonimizar comparten columnas, con un booleano que las distingue

**DECIDÍ:** una sola familia de columnas (`archivada_en`, `archivada_por`, `motivo_archivo`,
`anonimizada`) sirve para tres casos — «archivar» simple (reversible, conserva datos), «anonimizar»
a pedido de la clienta (Ley 29733, irreversible, borra datos personales) y «perder una fusión»
(irreversible, D-99) —, replicando el patrón que ya usan `series_comprobantes`/`cuentas_dinero`
(`archivada_at`/`motivo_archivo`, con CHECK que exige motivo).
**DESCARTÉ:** una tabla o un enum de «estados» separado (activa/archivada/anonimizada/fusionada) —
costo: un cuarto concepto nuevo para algo que ya se distingue con dos columnas booleanas/timestamp,
y el patrón de archivo YA vive en el repo con ese mismo par de columnas.
**SE ROMPE SI:** aparece un cuarto motivo de «desactivar» con reglas propias de reversión — ahí sí
ameritaría su propio estado con nombre, no una combinación más de booleanos.

**Estados imposibles que el esquema (no el código) deja de permitir:**
- Anonimizada sin archivada (`clientas_anonimizada_implica_archivada`).
- Archivada sin motivo (`clientas_archivada_tiene_motivo`, patrón `series_comprobantes`).
- Fusionada consigo misma (`clientas_fusionada_no_a_si_misma`).
- **Anonimizada con datos personales visibles** — con una trampa real que costó un ciclo de
  verificación completo, ver la sección siguiente.

### El hallazgo que solo el navegador con sesión real encontró

La primera versión del CHECK exigía `nombre = 'Clienta anonimizada'` cuando `anonimizada = true`.
Pasó **todas** las pruebas SQL escritas a mano. Falló en el navegador: al unir dos fichas reales, la
perdedora quedó con `anonimizada = true` y **el nombre vacío, sin ningún error** — el buscador ya no
la encontraba, pero tampoco mostraba el placeholder. La causa es lógica de tres valores de SQL:
`nombre = 'Clienta anonimizada'` con `nombre IS NULL` evalúa a **NULL**, no a `false` — y un CHECK
constraint se considera satisfecho cuando da NULL, no solo cuando da `true`. `unir_clientas` ponía
`nombre = null` al anonimizar a la perdedora (en vez de escribir el placeholder), y el CHECK lo
dejaba pasar en silencio.

**DECIDÍ:** el CHECK compara `coalesce(nombre, '') = 'Clienta anonimizada'` (nunca da NULL), y
`unir_clientas` escribe el mismo placeholder que `archivar_clienta`, nunca `null`.
**DESCARTÉ:** confiar en que «las pruebas SQL ya lo cubrieron» — las pruebas con `ROLLBACK` y datos
armados a mano no habían ejercitado el camino real de `unir_clientas` (que sí quedó verificado
recién en el navegador, con la sesión de Felipe, dos fichas reales del seed y sus ventas).
**SE ROMPE SI:** una columna nueva se agrega a este CHECK sin la misma cautela con NULL — la regla
general: en un CHECK que debe rechazar un valor, comparar contra un `coalesce`, nunca la columna
sola, si esa columna puede ser NULL en el camino que se quiere bloquear.

## DECISIÓN 3 — `unir_clientas` cruza tres tablas en una transacción, con el orden que evita un choque transitorio de DNI

Mover `ventas.cliente_id`, `separaciones.clienta_id` y `pedidos_no_atendidos.clienta_id`, completar
los datos que le falten a la ganadora, dejar el rastro en `clientas_fusiones` y anonimizar a la
perdedora son las cinco partes de UNA transacción (principio 9, Jim Gray): si cualquiera falla,
ninguna se aplica.

**El orden importa:** se vacía primero a la perdedora (libera su DNI del índice único parcial
`clientas_dni_unico`) y solo después se completa a la ganadora — si el orden fuera al revés, un
instante dentro de la misma transacción tendría dos filas con el mismo DNI, y ese índice único (que
no es diferible) lo rechazaría ahí mismo. Verificado con evidencia real: dos fichas del seed
(Camila con DNI, la ganadora sin DNI) fusionadas de punta a punta en el navegador.

**Concurrencia:** las dos filas se bloquean con `for update` desde el principio de la función
(mismo criterio que `apartar_stock`). Probado con evidencia real de dos conexiones simultáneas
sobre `editar_clienta` (ver «Antes de decir listo» abajo) — el mismo mecanismo protege
`unir_clientas`: dos fusiones a la vez sobre la misma pareja se serializan, nunca se aplican dos
veces ni se pisan.

**«¿Qué pasa si se unen mal?»** No hay deshacer automático — dos fichas fusionadas vuelven a ser
una sola persona. `retail.clientas_fusiones` guarda la fila perdedora **completa** (`to_jsonb`)
justo antes de anonimizarla, más cuántas ventas/separaciones/pedidos se movieron — con eso se puede
reconstruir la ficha a mano si la fusión fue un error.

## DECISIÓN 4 — Las lecturas de la ficha (compras, cambios, devoluciones, apartados) cruzan sedes a propósito

`fn_clienta_compras`/`cambios`/`devoluciones`/`separaciones` son `security definer` y filtran SOLO
por el id de la clienta, nunca por la sede de quien mira — a diferencia de las políticas normales de
`ventas`/`cambios`/`devoluciones`/`separaciones`, que sí filtran por sede.

**DECIDÍ:** leer cruzando las tres sedes.
**DESCARTÉ:** leer directo con PostgREST respetando esa RLS — costo: una asesora de TRU vería a una
clienta que compró siempre en AQP como si nunca hubiera comprado, exactamente lo contrario de lo
que D-109 decidió («todas las cuentas con el módulo ven a todas las clientas») y del propósito del
club («la tienda la recuerda», no «la sede la recuerda»).
**SE ROMPE SI:** CAYLA le vende el sistema a otra marca (D-50) y cada sede pasa a ser un tenant
separado — ahí es un cambio de arquitectura mayor, no un parche a estas cuatro funciones.

## DECISIÓN 5 — Talla deducida y «frecuente» se calculan en TypeScript, no en SQL, y nunca se guardan

D-101 y D-103 exigen explícitamente «calculada al leer, jamás guardada». Las funciones SQL solo
entregan las filas planas (una por prenda vendida/cambiada); `lib/clienta-actividad-reglas.ts`
(lógica pura, con pruebas) agrupa por venta, deduce la talla MÁS RECIENTE por categoría (no la más
frecuente — una clienta cambia de talla, lo último es más confiable) y cuenta compras de los
últimos 6 meses contra el umbral de 3 (D-103, propuesta a ajustar cuando haya datos reales).
**Límite conocido, documentado en el código:** D-101 excluye una prenda marcada «es para regalo»,
pero esa marca es del paso 1 (Caja), sin fusionar — hasta entonces, un regalo cuenta como si fuera
su talla.

## DECISIÓN 6 — Cabecera «Todas las sedes», no la sede activa

`EncabezadoPagina` (Ventas/Inventario) asume una pantalla «de una sede». Clientas no lo es (D-109).
Con Felipe: usar el mismo componente (consistencia visual, cero código nuevo) pero con
`sede="Todas las sedes"` en vez de la sede activa de quien mira — evita sugerir falsamente que la
pantalla filtra por esa tienda.

## DECISIÓN 7 — Exportar es de Admin, con rastro; ver y buscar no

D-109/G.4: cualquier cuenta con el módulo ve y busca a todas las clientas, sin candado ni rastro —
es la lectura normal. Exportar la lista completa es otra cosa: `exportar_clientas()` exige
`fn_es_admin()` y anota en `retail.actividad` quién exportó, cuándo y cuántas filas — la Ley 29733
pide proteger la base, no solo pedir el permiso de contacto. Verificado con las dos cuentas reales
del seed: Felipe (Admin) exporta y queda en la bitácora; Micaela (colaboradora) recibe «Solo un
Admin puede exportar la lista completa de clientas.» tal cual, sin jerga de base de datos.

## Antes de decir «listo» — con evidencia

1. **Concurrencia.** Dos conexiones reales (no una prueba con ROLLBACK) llamando `editar_clienta`
   sobre la MISMA fila con la MISMA versión: la primera guarda y duerme 2 s con el lock tomado (sin
   comitear); la segunda, lanzada 0.5 s después, se queda bloqueada esperando el lock y, al
   despertar exactamente cuando la primera comitea, encuentra la versión ya cambiada y rechaza con
   PT409 — nunca pisa el cambio de la primera. Timing medido: las dos conexiones terminan en el
   mismo instante (~2.07 s), confirmando que la segunda esperó de verdad, no que falló de entrada.
2. **Caída externa.** Ninguna de las funciones nuevas toca SUNAT/Lucode, el padrón ni WhatsApp — son
   solo lectura/escritura de `retail.clientas` y sus tablas relacionadas.
3. **Persona sin contexto.** Probado con la cuenta real de Micaela (colaboradora, sin formación de
   arquitecto): abre la ficha, edita, ve el mensaje «Ficha actualizada»; al intentar exportar recibe
   la frase exacta de por qué no puede, sin código ni jerga.

## Lo que este ADR NO resuelve

- El paso 1 del acta (Caja liga la venta a la ficha) — sigue sin fusionar; esta ficha funciona con
  ventas de prueba y funcionará igual con las reales apenas ese paso aterrice.
- «Es para regalo» excluido de la talla deducida (depende del paso 1).
- Los pasos 3 (permiso y avisos) y 4 (medir) del acta — quedan en el BACKLOG.
- Anonimizar las columnas de texto histórico en `separaciones` (`clienta_nombres`, etc., copiadas al
  apartar) — hoy `anonimizar_clienta`/`archivar_clienta` solo limpian la ficha maestra. Igual que un
  comprobante ya emitido, un apartado es un documento con su propio historial; si Felipe decide que
  también deben anonimizarse, es una función aparte, no parte de esta.

## Actualización 2026-09-28 — la ficha es del módulo «Clientas», la clienta que vuelve se reactiva y anonimizar borra todo

**Decide:** Felipe — (c) «Clientas por módulo» el 2026-09-26 (B-03 de la revisión maestra, opción a); (a) y (b) el
2026-09-27. **Migraciones:** `20260928190000_clientas_por_modulo_y_anonimizar_todo.sql` (PARTE 1, solo funciones) y
`20260928190100_clientas_politicas_por_modulo.sql` (PARTE 2, solo políticas). **Sin pegar en producción** al escribir
esto; el orden y los md5 están abajo. Producción, consultada en solo lectura el 2026-09-28: 0 clientas, 0 fusiones, 0
líneas de actividad de Clientas y 0 de Apartados; los 13 cuerpos que se recrean son idénticos a los de `main`.

### El problema

1. **(c) La puerta de la pantalla no era la de la base.** `/clientas` ya exigía el módulo (`exigirModulo`), pero sus 11
   funciones (`registrar`, `buscar`, `editar`, `archivar`, `reactivar`, `unir`, `exportar` y las 4 `fn_clienta_*`) son
   `security definer` y no lo preguntaban, y la política `clientas_select` dejaba leer la tabla a cualquier sesión. La
   ficha (DNI, celular, cumpleaños) quedaba al alcance de cualquier cuenta del proyecto que llamara a la API.
2. **(a) La clienta archivada que vuelve quedaba escondida.** `registrar_clienta` reusaba la ficha por DNI sin
   reactivarla: el buscador no muestra archivadas, y lo que se le vendiera se colgaba de una ficha invisible.
3. **(b) Anonimizar no borraba todo.** El nombre, el DNI y el celular seguían en la foto de `clientas_fusiones` y en
   `retail.actividad`: en las frases de Clientas («Editó la ficha de Ana Pérez», el motivo escrito a mano) y en las de
   Apartados («apartó «Blusa» para Ana Pérez…», con el nombre también en `detalle.clienta`).

### DECISIÓN 8 — el candado es de la CUENTA, va primero, y está escrito una sola vez (c)

**DECIDÍ:** un ayudante `retail.fn_exigir_modulo(clave)` que rechaza con `42501`, un mensaje en castellano que dice qué
pedir («Tu rol no tiene el módulo «Clientas». Pídele al líder que lo active en Roles y accesos.») y el hint estable
`clientas_sin_modulo`. Es la primera línea de las 11, antes de `fn_actor_persona_id(true)`: la cuenta sin el módulo oye
«no tienes Clientas», no «elige quién hace esto». Pregunta a la cuenta (`fn_ve_modulo`, que ya incluye líder y admin),
nunca al responsable del combo: el combo decide quién FIRMA. Sin `execute` para la API. La prueba de cobertura
(`roles_cobertura_modulos`) lo reconoce como tercera forma oficial de nombrar un módulo, y `clientas` sale de su lista
«solo pantalla».
**DESCARTÉ:** copiar la guarda de 4 líneas en las 11 (once textos que se desincronizan el día que cambie el mensaje), y
que las lecturas devolvieran 0 filas en silencio («no hay clientas» y «no tienes permiso» se leerían igual).
**SE ROMPE SI:** alguien le quita «Clientas» a un rol que vende con clienta: hoy la tienen los dos que venden
(Integrante, 17 personas; Terminal de ventas, 3 terminales), y la web ya no le ofrece la búsqueda a quien no la tiene
(ver «Web»). O alguien le pasa al ayudante un nombre armado en tiempo de ejecución: la cobertura solo cuenta el literal.

### DECISIÓN 9 — la lectura directa de la tabla pregunta lo mismo (PARTE 2)

**DECIDÍ:** `clientas_select` pasa de «cualquier sesión» a `(select retail.fn_ve_modulo('clientas'))`, y se borra
`clientas_fusiones_select` (en producción nunca existió: el paso 2 se pegó sin ella a propósito). `clientas_fusiones`
queda con RLS encendido, sin políticas y sin permisos para la API: la leen y escriben solo funciones `security definer`.
**Lo que la web lee directo y pasa por esta política** (revisado en `apps/web`): Ventas ▸ Historial (el nombre, embed
`cliente:clientas ( nombre )`), Comprobantes (el WhatsApp de la clienta, `getExtrasDeComprobantes`) y `/clientas` (que ya
exige el módulo). Una cuenta con Historial o Facturación y sin Clientas vería la venta sin el nombre y el comprobante sin
el botón de WhatsApp: un dato que falta, no un error. **Hoy no le pasa a nadie** (producción, 2026-09-28): los roles con
Historial o Facturación son Integrante y Terminal de ventas, y los dos tienen Clientas; Terminal Almacén (3 terminales) y
Gestión & Visión (0 cuentas) no tienen ninguno de los tres; el líder lo ve todo. Ninguna vista de `retail` lee `clientas`.
**DESCARTÉ:** cerrar solo las funciones y dejar la tabla abierta: la misma ficha se leería por `/rest/v1/clientas`.
**SE ROMPE SI:** Felipe crea un rol con Historial o Facturación y sin Clientas. El arreglo entonces es leer ese nombre y
ese WhatsApp con una función `security definer` que devuelva solo esos dos datos, no reabrir la política.

### DECISIÓN 10 — la clienta archivada que vuelve se reactiva sola (a)

**DECIDÍ:** cuando el DNI de `registrar_clienta` cae en una ficha archivada, el mismo upsert la reactiva (vacía
`archivada_en`, `archivada_por` y `motivo_archivo`; `version` sube sola), conserva su id y su historial, y completa lo que
venga. La fila se toma con `for update`: si dos cajas la registran a la vez, la segunda espera y la encuentra activa (una
sola línea de actividad, sin nombre). Lo vigila una carrera con dos conexiones reales (caso 7 de la prueba): sin el
`for update`, la segunda lee la ficha todavía archivada y anota una segunda «reactivó». Una ficha anonimizada o unida a otra no tiene DNI, así que el DNI nunca cae en
ellas: la anonimizada que vuelve es una ficha nueva (pidió que la olvidaran), y la que se unió a otra encuentra la que se
conservó. El candado nuevo `clientas_fusionada_implica_anonimizada` lo deja escrito en el esquema.
**DESCARTÉ:** seguir el rastro `fusionada_en_id` dentro de `registrar_clienta`: un `if` para un estado que el esquema ya
hace imposible es código que nadie ejercita.
**SE ROMPE SI:** el upsert por DNI pasa a mirar también el celular (no es único; por eso existe «unir fichas»).

### DECISIÓN 11 — anonimizar borra todo: la actividad no guarda a la clienta (b)

**DECIDÍ:** prevenir en vez de borrar. `retail.actividad` es de solo agregar para todo el ERP (ADR-0207), así que nadie
escribe en ella datos de la clienta: Clientas dice «una clienta» (sin nombre, DNI, celular ni el motivo escrito a mano) y
Apartados dice «la clienta» (`fn_actividad_separacion` y `trg_actividad_separacion_hijas` dejan de copiar el nombre del
apartado y la llave `detalle.clienta`; el resto de cada frase queda igual). Quién es queda solo en la fila (`tabla`,
`registro_id`: la ficha o el apartado). Al anonimizar, `archivar_clienta` vacía en la misma transacción la foto de
`clientas_fusiones` de esa persona (cada ficha que se le unió, en cualquier nivel), y el motivo que se escribe se pide
pero no se guarda. Lo escrito ANTES de pegar se limpia una sola vez al pegar: las líneas viejas de la actividad (sección
13) y cada ficha que la función de antes ya anonimizó, que pierde el motivo escrito a mano y la foto de sus fusiones
(sección 14). La raíz es la ficha anonimizada a pedido: la foto de una fusión cuya persona sigue viva en la ficha que se
conservó no se toca, porque es la evidencia para deshacerla. En producción no hay nada que limpiar (0 clientas).
**DESCARTÉ:** una excepción en `trg_actividad_inmutable` para que anonimizar edite la actividad: agujerea el registro de
solo agregar de todos los módulos y, para Apartados, obligaría a encontrar a la clienta por el texto de su nombre (el
apartado guarda nombres y apellidos escritos en caja; la ficha, otro texto).
**Lo que se pierde:** la línea de Apartados ya no dice el nombre de un vistazo («abonó S/ 20 al apartado APT-TRU-0007 de
la clienta»); el código del apartado lleva a él. Es una decisión que toca un segundo módulo: está en el alcance de (b)
(«los nombres escritos en `retail.actividad`»), pero si Felipe prefiere conservar el nombre en Apartados, lo que no se
cumple es «anonimizar borra todo» para la clienta que apartó.
**SE ROMPE SI:** una función nueva vuelve a copiar a la clienta en la actividad. Lo vigilan
`clientas_por_modulo_y_anonimizar` (busca el DNI, el nombre y el celular en todas las columnas de `clientas`,
`clientas_fusiones` y `actividad` después de anonimizar a una clienta con fusiones y un apartado; recorre las cinco ramas
de la actividad de un apartado —apartó, entregó, liberó, devolvió, extendió—; y nombra toda función que anota actividad leyendo las columnas de la clienta de un apartado) y `separaciones.mjs` (un apartado entero sin que su
nombre aparezca). **Fuera, a propósito:** lo que un apartado o un comprobante copiaron al hacerse (documentos de esa
operación, §7 de `docs/datos/06-DATOS-PERSONALES.md`) y el texto libre de otros módulos (el motivo de un descuento).

### Web

- `error-escritura.ts`: todo hint `<módulo>_sin_modulo` pasa con el mensaje de la base (sirve también al
  `ajuste_sin_modulo` de ADR-0250, que caía al genérico «Vuelve a intentar»); `esSinModulo` para las pantallas con su
  propio aviso.
- Punto de venta: sin el módulo, la fila «Clienta» del ticket no aparece (`filaDeClienta`, con pruebas); una clienta que
  ya venía en un ticket retomado se ve y se quita, no se cambia. Si el módulo se le quita con la caja abierta, el buscador
  dice el mensaje de la base, no un error crudo.
- Apartados ▸ Apartar: sin el módulo no se ofrece «Buscar a la clienta por DNI o celular» (`veClientas`, de la cuenta; no
  va en `apagadas`, que es lo que el líder apaga para toda la sede). Los datos se escriben a mano, como sin ficha.

### Cómo se pega (cada parte SOLA en el SQL Editor, en este orden; ninguna tiene políticas mezcladas con `alter`)

1. `20260928190000_clientas_por_modulo_y_anonimizar_todo.sql`. Aborta sin tocar nada si alguna de las 13 funciones ya
   no es la de `main` (candado de md5 normalizado, acepta el «antes» o el «después»).
2. `20260928190100_clientas_politicas_por_modulo.sql`.

Se pueden pegar dos veces y en el orden inverso (probado desde una copia de producción). Después, cada md5 normalizado
(la consulta está en la cabecera de la PARTE 1) tiene que dar: `fn_exigir_modulo` `feba9aed…`, `registrar_clienta`
`eef0904d…`, `buscar_clienta` `889b7dc1…`, `editar_clienta` `7399e713…`, `archivar_clienta` `eedd3fcb…`,
`reactivar_clienta` `104b336e…`, `unir_clientas` `26d5a798…`, `exportar_clientas` `80476e19…`, `fn_clienta_compras`
`4e70112f…`, `fn_clienta_cambios` `b1017922…`, `fn_clienta_devoluciones` `1d75051f…`, `fn_clienta_separaciones`
`b116d08e…`, `fn_actividad_separacion` `feae2b4a…`, `trg_actividad_separacion_hijas` `23eed0ef…`; y
`pg_policies` de `clientas`/`clientas_fusiones`, una sola fila: `clientas_select` con `fn_ve_modulo('clientas')`.

### Verificación

- `pnpm pruebas:clientas-modulo` (nueva, cableada en `ci.yml`): 43/43 (44/44 con `BASE_DESECHABLE=1`). Las 11 rechazan
  sin el módulo (terminal sin él, con y sin responsable; persona a la que se le quitó) y dejan pasar a líder, integrante y
  terminal de ventas; la política; reactivar; anonimizar sin rastro; las cinco ramas de la actividad de un apartado;
  vigilantes; control con el cambio deshecho (el ataque pasa); pegado sobre el estado de producción, dos veces y al revés;
  candado de versión; limpieza de la actividad vieja y de una ficha anonimizada antes de pegar; y dos cajas a la vez con
  el mismo DNI (la segunda espera en la lectura de la ficha; con `BASE_DESECHABLE=1`, además la carrera con COMMIT: una
  sola «reactivó»).
- `separaciones` 78/78 (un caso nuevo), `clientas` 30/30, `roles_por_modulo` 70/70, `roles_cobertura_modulos` 32/32,
  `una_sola_firma` 2/2, `pedidos_no_atendidos` 20/20, `candado-ventas` 6/6, `actividad` en verde; `tsc` y `vitest` (207
  archivos) en verde. Las 103 pruebas del job `pruebas-postgres`, en una sola base como el CI: 101 en verde; las 2 rojas
  (`proveedores-produccion`, el nombre con tilde; `dinero-compras`, el bucket de `storage`) fallan igual sobre `main` en
  el mismo Postgres desechable: son del arnés local (tildes y `storage`), no de este cambio.
- **Mutaciones:** 24 cambios a las dos migraciones (sacar el candado de una función, que el ayudante no rechace o cambie
  de hint, preguntar primero por el responsable, no reactivar, anotar con el nombre, no limpiar las fusiones o solo la
  directa, guardar el motivo, volver a copiar el nombre en Apartados, no limpiar la actividad vieja o dejar el candado en
  otro modo, sin candado de versión, sin el estado imposible, abrir `clientas_fusiones` o el ayudante a la API, política
  abierta, no borrar `clientas_fusiones_select`): las 24 ponen la suite en rojo (las de Apartados, también
  `separaciones`). Y 4 en la web (el hint, sus anclas, la fila del ticket): las 4 ponen `vitest` en rojo.
- **Revisión (2026-09-28), tres huecos de prueba que dejaban en verde un error real, y su arreglo:** (1) una ficha
  anonimizada ANTES de pegar conservaba su motivo escrito y la foto de sus fusiones (la limpieza solo cubría la
  actividad): sección 14 nueva en la PARTE 1; (2) ninguna prueba pasaba por «entregó», «liberó», «devolvió» ni
  «extendió» de la actividad de Apartados: un caso nuevo recorre las cinco ramas; (3) quitar el `for update` de
  `registrar_clienta` dejaba todo en verde: la carrera de dos conexiones. 11 mutaciones nuevas, todas en rojo: sin la
  sección 14, sin cada una de sus dos mitades, tomar como raíz a las fichas unidas (vaciaría la foto de una fusión viva),
  pisar el motivo de las unidas, sin recursión, guardar el apartado entero en el detalle de «entregó», «devolvió»,
  «extendió» o «liberó a mano», y sin el `for update` (caen 7a y 7b). Los 14 md5 de funciones no cambian.

### Lo que sigue abierto

- Probar con sesión real a 375 px el Punto de venta y Apartar con una cuenta sin el módulo (PL-105): verificado por
  reglas puras, tipos y la base, no con clics.
- Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando estén pegadas: el candado
  `clientas_fusionada_implica_anonimizada` y la política nueva.
- Si una clienta pide borrar sus datos, lo que copiaron sus apartados (nombres, apellidos, celular, DNI) y sus
  comprobantes (documento y nombre) sigue en esas filas (decisión aparte, arriba).
