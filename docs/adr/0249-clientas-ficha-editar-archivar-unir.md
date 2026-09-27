# ADR-0249 — Clientas, paso 2 del acta: ficha, editar, archivar/anonimizar y unir fichas

**Fecha:** 2026-09-27
**Estado:** Aceptado e implementado en rama (`claude/clientas-ficha-y-lista`). Verificado con un
Postgres 17 desechable que corrió las 341 migraciones del repo en orden (incluidas estas 5), 15
escenarios de integración (éxito, rechazo y una carrera real de concurrencia con dos conexiones
simultáneas), `tsc`, `eslint` y `vitest` (78 305 pruebas) en verde, y una verificación visual real
en el navegador — sesión de Felipe (líder/Admin) y de Micaela (colaboradora), a 1440 px y a 375 px —
contra un stack de Supabase completo y aislado (proyecto `cayla-retail-verif-clientas`, nunca el
Docker compartido por las demás sesiones). **Migraciones sin aplicar en producción** — las aplica
Felipe o el arquitecto con el protocolo de ensayo aparte.

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
