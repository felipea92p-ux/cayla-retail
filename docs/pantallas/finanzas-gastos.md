# Pantalla — Finanzas ▸ Gastos (`/finanzas/gastos`)

> Modo: completo · Fecha: 2026-10-22 · Rol/sede: Admin (líder), vista CAYLA Global → «De la empresa» (la que muestra la captura) · Datos: real (SELECT de solo lectura a producción)
> SHA analizado: `f26b3b288` — si `GastosPanel.tsx`, `GastosFijosYActivos.tsx`, `RegistrarGastoModal.tsx` o `lib/gastos*.ts` cambian después, este análisis está vencido
> Archivos: `app/(app)/finanzas/gastos/page.tsx` · `components/GastosPanel.tsx` · `components/GastosFijosYActivos.tsx` · `components/RegistrarGastoModal.tsx` · `components/finanzas/GastosPulso.tsx` · `lib/gastos.ts` · `lib/gastos-reglas.ts` · `lib/gastos-pulso-reglas.ts` · RPC `registrar_gasto`, `anular_gasto`, `fn_gastos_panel`, `fn_gastos_lista`, `fn_gastos_fijos_mes`, `guardar_gasto_fijo` · tablas `gastos`, `gastos_fijos`, `gastos_fijos_ficha`, `activos_fijos`, `egresos_no_gasto`
> Otra sesión tocándola: sí — `claude/finanzas-auditoria-arreglos` (ADR-0433: la actividad 12 «revisión desde S/ 100» es de esa sesión) y el PR #1263 (ADR-0477, categorías de los gastos fijos, sin fusionar). Congelamiento de código del mié 28-oct 18:00 al lun 2-nov 12:00.
> **Privacidad:** el repo es público. Aquí van conteos y proporciones, no montos en soles por sede, alquiler, planilla ni faltante de caja. Esas cifras las tiene Felipe en el chat.
> **Límites de esta pasada:** sin medición en navegador, sin prueba ciega, sin `/chaos`, sin 375 px, sin correr la pantalla como no líder (el worktree no tiene `node_modules` ni base local). Estética y Formidable salen de leer código y captura.

## 0 · Veredicto
Gastos guarda bien lo que guarda, pero ayuda poco a **cerrar el mes**: lo que mueve la plata (los 24 gastos fijos) se confirma uno por uno en una hoja de 29 controles, el titular del mes no cuenta lo que falta confirmar y la lista la tapan decenas de renglones de «baño» de S/ 1–3. No le faltan botones: le falta camino para el trabajo que más pesa.
**Cumple su finalidad:** 5/10 (promedio 5,3, con tope 5 por dos defectos que pueden dañar dinero) · **Relevancia:** 7,0 — Soporte

## 1 · Finalidad declarada
"Esta pantalla existe para que el líder vea en qué se fue la plata del mes, confirme cada mes los gastos fijos que llegaron, clasifique lo que salió del cajón y registre lo que no pasa por Caja, de modo que Impuestos, Cierre de mes y el Estado de resultados cuenten lo que pasó de verdad."
Fuente: ADR-0195, ADR-0417 (camino A), CLAUDE.md «Pantallas de Finanzas», `docs/formidable/finanzas-gastos.md`; no la captura. ¿Coinciden docs y pantalla? **En parte:** ADR-0195 mandó «Por categoría» a Reportes y ADR-0417 prometió de vuelta «Ver en qué se fue cada sol»; la pantalla recortó la respuesta a 3 chips. Manda lo más reciente (ADR-0417), y está a medias.

## 2 · Objeción
1. **No te falta un botón: la pantalla no cuenta lo que pesa.** El titular «este mes gastaste» es una pequeña parte (alrededor del 5 %) del costo mensual que el sistema ya conoce (planilla + fijos), porque un fijo solo existe cuando alguien lo registra. Hoy no hay manera de confirmar los fijos que no sea una hoja por fijo. `[código GastosFijosYActivos.tsx:147-162, gastos-reglas.ts:758-771]` `[producción]`
2. **Sumar funciones sobre este esqueleto la hace más «monse».** El 95 % de los gastos (140 de 147) entra por el gasto rápido de Caja, no por esta pantalla: aquí se *revisa y confirma*, no se captura. Arriba de la lista hay cuatro resúmenes (cabecera, Pulso, bandeja, cuatro cifras) y el monto del mes sale dos veces. Cada función nueva tiene que pagar quitando algo (ley 8). `[código GastosPanel.tsx:193-224]` `[producción]`
3. **La captura es de la vista «De la empresa», no de la empresa.** Esa vista solo trae lo que no es de ninguna tienda: 5 de los 24 fijos, egresos siempre 0 y «Todo clasificado» sin haber mirado ninguna tienda. El valor por defecto de CAYLA Global es «Todas». `[visto bajada «la empresa»]` `[código gastos-reglas.ts:136-146, vista-global.ts:100]`
4. **Corrección a mi primera lectura:** «0 de 149 gastos nacieron de un fijo» **no** prueba que los fijos no se usen: los 24 se crearon entre el 17 y el 22 de octubre, cuando los días 15 y 17 ya habían pasado. Se medirá después del 31-oct. `[producción]`

## 3 · Lo que está bien y no se toca
- `registrar_gasto` es todo-o-nada con token e idempotencia; un gasto no se edita ni se borra (`gastos_solo_anular`), un fijo solo se cierra una vez por mes (`gastos_fijo_mes_uq`), un egreso respalda una sola cosa. `[código M1:479-501, M2:158, 20261013201000]`
- El gasto rápido de Caja: 140 de 141 egresos ya llegan clasificados. No se reconstruye. `[producción]`
- La bandeja «de a una cosa» del camino A (Pulso) y la regla del IGV perdido por pagar sin banco (ADR-0362): pasaron prueba ciega el 14-oct. `[docs/formidable/finanzas-gastos.md]`
- Cero colores sueltos en los 5 archivos principales; usa piezas únicas de ADR-0358 en casi todo. `[código: 0 hex / rgb / bg-white]`
- Sin botones fantasma: todo botón llama una RPC real con prueba SQL (`pnpm pruebas:gastos`). `[código package.json:53-56]`

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 5 | Cuatro capas antes de la lista; en Fijos manda el bloque vacío («Nada por confirmar») y lo urgente va segundo, sin fecha ni atraso, con cinco botones iguales | `[visto]` `[código GastosFijosYActivos.tsx:139-169, finanzas.css:436-441]` |
| Lógica de negocio | 5,5 | Los fijos son un recordatorio que ninguna otra puerta cierra: el gasto rápido no los ve, un gasto «suelto» no los cierra, el Cierre solo avisa | `[código 20261017190000:190-192, 20260925180000:505]` |
| Arquitectura | 6,5 | La escritura es sólida; la lectura no: siete lecturas devuelven `[]` sin avisar y tres vacíos afirman lo contrario de lo que pasó; el tope de 500 filas corta en silencio | `[código gastos.ts:35-176, :77]` |
| Funciones | 5 | Lista sin filtros ni orden, Fijos sin mes ni días de atraso, cero conexión con Pagar, Excel o Reportes | `[código GastosPanel.tsx:375-397, :602-610]` |
| Utilidad | 4 | Un monto mal escrito en una factura pagada no tiene salida; confirmar 24 fijos son 24 formularios; el contador no puede sacar nada de aquí | `[código anular_gasto M1:752-757, gastos-reglas.ts:341-343]` |
| Conexión con el ERP | 5,5 | Bien enchufada por fuera, pero «falta» significa cuatro cosas según el módulo que lo lea (Flujo, Confianza, Cierre, Resumen) | `[código flujo 20261002130000:275-283, 20260925180000:505]` |

**Estética.** Hay 8 columnas en la lista; el chip «Pagado» sale en casi toda fila y no informa; el código de cuenta contable se repite en cada fila (la prueba ciega del 14-oct no entendió «cuenta 631»); «Egresos de caja sin clasificar / por clasificar» y «Salida de caja sin clasificar» son tres nombres para lo mismo. Dos botones primarios compiten con la bandeja llena. El «De la empresa» se lee como S/ 0. `[código GastosPanel.tsx:422-482, GastosPulso.tsx:71]` Las 9 leyes de Formidable, **provisionales** (sin prueba ciega): 1 sin manual 5 (tope 8) · 2 una pregunta 4 · 3 simplicidad 6 · 4 lenguaje de tienda 5 · 5 contenido primero 5 · 6 lo difícil a un toque 5 · 7 perdonar 6 · 8 quitar 3 · 9 punta a punta 6 → promedio 5,0; oficio visual: **sin medir**.

**Lógica.** «Faltan» empieza el día siguiente a la fecha esperada, sin gracia; marca como faltantes fijos creados hoy y de meses anteriores al inicio de Finanzas (el Cierre ya filtra por fecha de alta, la pestaña no). El monto de un fijo variable se tipea una vez y queda estático; la pantalla no da pista del mes anterior. Anular un gasto de caja deja el egreso «por clasificar» (correcto, por diseño) pero el aviso manda a «corregir en la caja» sin decir cómo. El efectivo que sale de un cajón no tiene ninguna revisión: ADR-0433 decisión 7 sigue sin construir. `[código]` Los micro-gastos no son un error de categoría (ADR-0368 lo decidió): son un problema de lectura (54 % de las filas del mes, ~5 % del dinero). `[producción]`

**Arquitectura.** *Estados imposibles:* los graves están impedidos por constraint (monto con tope, un fijo por mes, un egreso por gasto, mes cerrado). *Sin cubrir:* la base solo valida la sede de un fijo dentro del RPC, no categoría ni monto; un enlace gasto↔fijo equivocado consume el cupo del mes y es irreversible (`gastos_solo_anular`). *Transacción:* una sola RPC, empieza con el candado por token y termina en el insert de `gastos`. *Concurrencia:* dos personas sobre el mismo fijo → la segunda recibe un `23505` que la pantalla presenta como «Vuelve a intentar». *Caída externa, «se degrada así, no pierde el dato»:* escribir no depende de nada externo; leer sí falla en silencio hoy. *Volumen:* ~200 gastos/mes → el tope de 500 se alcanza hacia ×2,5 del ritmo actual; antes falla la utilidad que el rendimiento. *Permisos:* la web usa `rol === 'lider'` y la base ya usa `fn_ve_finanzas_de_todo`; hoy desajusta a una cuenta como máximo. `[código]` `[producción]`

**Funciones.** Existe y funciona: registrar, anular con motivo, fijos, activos con depreciación y baja, clasificar egresos, gasto de viaje (de Compras), «No es fijo». Falta: filtrar por rango/medio/estado/comprobante, ordenar por monto, agrupar repetidos, avisar el corte de 500, comparar con el mes anterior o el presupuesto, Excel, «Ir a pagar», el desglose por categoría que la base ya devuelve y la UI descarta, adjuntar el comprobante. Media verdad: «No es fijo» se documenta como reversible y no tiene vuelta atrás. `[código]`

**Utilidad (escenarios leídos en el código; sin colaboradora real).** Fin de mes con 24 fijos: 4/10 · caja chica «baño S/ 1»: 8/10 · luz a crédito: 4/10 · corregir un monto: 2/10 · «el contador pide octubre con comprobantes»: 2/10 · vista Global «De la empresa»: 3/10 · colaboradora de tienda: 5/10. Test de 5 segundos: hoy la pantalla dice «aquí se anotan gastos»; debería decir «aquí confirmas lo que se paga cada mes y miras lo que gastan las tiendas».

**Conexión.** Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Alimenta Estado de resultados, Impuestos (IGV de gastos), Cierre de mes, Flujo de caja y Resumen |
| Dinero y stock que toca | ×1 | 7 | Sin stock; dinero: caja, cuentas, Por pagar e IGV, pero el volumen registrado hoy es chico frente al costo real |
| Frecuencia y personas que la usan | ×1 | 6 | Mensual para el líder y el contador; el uso diario (140 gastos) pasa por Caja, no por aquí |
| Qué se detiene si falla | ×1 | 6 | El Cierre solo avisa; Caja sigue registrando por su propio modal; se frena el cierre del primer mes |

Relevancia = (2·8 + 7 + 6 + 6) / 5 = **7,0** → Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** Caja (gasto rápido → 95 % del volumen; egresos por clasificar), Configuración (los fijos y su ficha de pago), Compras (`compras.naturaleza = 'gasto'`, Por pagar, IGV), Órdenes de compra (gasto de viaje), categorías cerradas con cuenta PCGE.
- **Aguas abajo:** Impuestos (crédito fiscal y registro de compras), Cierre de mes (candado `gastos_mes_abierto`; avisa de fijos y egresos), Resumen «Para decidir hoy», Flujo de caja y Confianza (leen `fn_gastos_fijos_mes`), Estado de resultados y Presupuesto (`presupuestos` está vacía).
- **Pájaro dueño y vecinos:** por confirmar en `docs/datos/generado/AVIARIO.md` (los analistas encontraron varios pájaros de Finanzas libres); el módulo `docs/datos/modulos/11-finanzas-operativas.md` describe V1 y no sirve de fuente.
- **Externos, y qué pasa si caen:** Gastos no llama a SUNAT ni Lucode directamente; lo único externo es el bucket de fotos del gasto de viaje (sube primero y registra la fila después: si falla, dice el motivo y no pierde el gasto). Si la base no responde, ADR-0450 manda a `/sin-base`. *«Se degrada así, no pierde este dato»:* escribir no se pierde; **leer sí puede mostrar vacío en vez de error** (tarea #5).
- **Impuesto de procesos de tocar esta pantalla:** guía interactiva de 52 controles con huella (`lib/guias/huellas/finanzas.gastos.json`), guía de foco pendiente en tres archivos, `/sugerir`, `/chaos`, `/unificar`, pruebas SQL (`pruebas:gastos`) y el congelamiento del 28-oct.

## 7 · Las 12 tareas, por importancia
*El orden pone arriba lo que puede dañar dinero y lo que cabe antes del congelamiento (28-oct 18:00). Las seis primeras son solo web (sin pegar SQL).*

### #1 · [Eliminar/fusionar/conectar] Que un gasto «suelto» no duplique un fijo
- **Dónde:** `RegistrarGastoModal.tsx` (+ `PreguntaParecido` de `components/ui`), `gastos-reglas.ts:758` (`borradorDesdeFijo`), `registrar_gasto` con `p_gasto_fijo_id`. El candado de base (misma sede y categoría en `fn_gastos_validar`) va aparte, M.
- **Por qué en este puesto:** el único riesgo de dinero doble: quien registra el alquiler con «+ Registrar gasto» no cierra el fijo; la pestaña sigue diciendo «Faltan» y otra persona lo vuelve a pagar. Un fijo «sin comprobante» no tiene candado de duplicado. Hoy es latente (los fijos son de esta semana); desde noviembre es real.
- **Cómo lo verificas tú:** registra un gasto suelto de la categoría y sede de un fijo del mes y confirma que el sistema pregunta «¿Es el alquiler de octubre?»; al aceptar, el fijo pasa a «registrado» y no se puede registrar de nuevo.
- **Esfuerzo / dependencias:** S (web) + M (candado de base, después del cierre). Cruzar por sede + categoría + fecha dentro del mes, no solo por monto (los fijos variables no calzan ±20 %). El enlace es irreversible: la pregunta debe ser clara. No antes de nada; **antes de la #4**.

### #2 · [Mejorar] Tarjetas y titular honestos
- **Dónde:** `GastosPanel.tsx:141-143, 203-223`, `gastos-pulso-reglas.ts`, rótulos de `fn_gastos_panel`.
- **Por qué en este puesto:** el número que Felipe lee dice «este mes gastaste X» como si estuviera completo; el 1-nov será falso si los fijos no se confirman. Con la vista «De la empresa» muestra S/ 0 y «Todo clasificado» sin mirar tiendas. «Por pagar» y «Egresos sin clasificar» son acumulados a hoy aunque haya selector de mes. Dinero de lectura que decide.
- **Cómo lo verificas tú:** con fijos por confirmar, el titular dice «+ ~S/ … que falta confirmar» (con «~» en los variables); en «De la empresa» el rótulo dice «solo lo que no es de una tienda» y ofrece «Ver todas las tiendas»; las dos tarjetas acumuladas dicen «a hoy».
- **Esfuerzo / dependencias:** S, solo web. No quitar `not p_solo_empresa` de la base (mezclaría alcances). «De la empresa» es vocabulario compartido con Resumen y Cierre: cambiar el rótulo, no el nombre.

### #3 · [Reconstruir] Fijos del mes como cola de cierre
- **Dónde:** `GastosFijosYActivos.tsx:136-218` (`FijosDelMes`), `finanzas.css:436-489`, `gastos-pulso-reglas.ts:67-75`.
- **Por qué en este puesto:** es la pestaña de la captura y el trabajo que más pesa. Hoy: lo vacío («Nada por confirmar») va primero, lo urgente no dice cuánto se atrasó, no hay total, la columna derecha es aire y lo ya registrado no abre su gasto. «Para confirmar» dice «llegan en los próximos días» aunque falten nueve.
- **Cómo lo verificas tú:** abre Fijos: se ve el mes, cada fila con su fecha («se esperaba el 15 oct · 7 días») y orden por urgencia y monto, el total que falta arriba, lo vacío plegado y «Ya registrados» abre su gasto. A 375 px la fila no se parte en tres líneas.
- **Esfuerzo / dependencias:** M, solo web. La parte «atrasados de meses anteriores» necesita una lectura nueva (reemplazo anclado de `fn_gastos_fijos_mes`): va a #8. Se aparta del spike de dos columnas (ADR-0195): se escribe en el ADR.
- **DECIDÍ:** una sola lista ordenada por urgencia, con el total y el mes a la vista. **DESCARTÉ:** mantener las dos tarjetas «Para confirmar / Ya registrados» porque la mitad de la pantalla queda vacía y lo urgente va segundo. **SE ROMPE SI:** hay 24 fijos en «Todas las tiendas» y la lista no se agrupa por tienda: se vuelve una pared de renglones.

### #4 · [Mejorar] Confirmar los fijos de corrido — sin autogenerar
- **Dónde:** `FijosDelMes` + una hoja nueva; cada fila llama `registrar_gasto` con su propio token (`useIntento`, lo exige `lib/intento-reglas.test.ts`).
- **Por qué en este puesto:** 24 formularios al mes es el freno real. **7 de los 24 fijos (≈82 % del monto fijo) son de monto exacto y «sin comprobante»**: se pueden confirmar de un toque cada uno, sin serie ni número. Los 13 de boleta piden serie y número del papel (la base lo exige) y los de monto variable piden el monto: esos no se «autoconfirman». Autogenerar el gasto fabricaría gastos falsos: en CAYLA un gasto es pago + comprobante en un solo acto.
- **Cómo lo verificas tú:** «Confirmar los que faltan» abre una hoja que recorre uno por uno con monto, medio de pago y cuenta prellenados; los exactos sin comprobante se confirman con un toque; los de boleta se detienen en «serie y número». Al terminar, el titular sube y «Faltan» baja.
- **Esfuerzo / dependencias:** M, solo web, **toca dinero** (OK de Felipe sobre el diseño). Depende de la #1 (anti-duplicado) y de la #3. La ficha de pago solo sugiere el *tipo* de medio, no la cuenta de CAYLA: el «Sale de» se elige (una vez para todos). **Antes de construir**, que alguien registre los 24 fijos a mano con el flujo real (≈1 hora): esa corrida es la especificación.
- **DECIDÍ:** lote con confirmación por fila, no autogeneración. **DESCARTÉ:** crear los gastos solos cada mes (QuickBooks/Zoho/Holded lo hacen) porque aquí cada gasto exige comprobante y pago y fabricaría gastos falsos. **SE ROMPE SI:** una fila confirma un fijo equivocado o dos personas lo confirman a la vez; lo contiene `gastos_fijo_mes_uq` pero el mensaje que ve la segunda hoy es genérico.

### #5 · [Corregir] Que una lectura que falla lo diga
- **Dónde:** `lib/gastos.ts:35-176` (siete lecturas devuelven `[]`), `page.tsx:75` (`fallas` cubre 5 de 12), `GastosFijosYActivos.tsx:458`.
- **Por qué en este puesto:** el combo de categoría puede quedar vacío sin explicación y los vacíos «Todo en orden» / «Agregar el primero» pueden decirse cuando lo que pasó fue un error. Rompe la promesa del propio encabezado de `gastos.ts` («nunca muestra ceros como si fueran datos»).
- **Cómo lo verificas tú:** con una lectura que falla (se simula en local), la pantalla dice «No se pudo leer X» y no pinta «Todo en orden».
- **Esfuerzo / dependencias:** S, solo web. **Choca con una decisión:** ADR-0433 dejó «cargadores que confunden error con vacío» en Tanda 2, «fuera hasta nueva aprobación». Pide OK de Felipe. Cuidar que no se apague «+ Registrar gasto» por una caída parcial.

### #6 · [Mejorar] La lista de Gastos que se pueda usar
- **Dónde:** `GastosPanel.tsx:358-500` (`TablaGastos`), `lib/gastos.ts:77`.
- **Por qué en este puesto:** el mes es una lista de 144 filas en la que decenas son «baño» de S/ 1–3 y tapan lo grande. Hoy solo busca por texto, categoría y mes; no filtra por medio, estado, con o sin comprobante ni rango; no ordena por monto; corta en 500 sin avisar y el pie dice «N gastos» igual.
- **Cómo lo verificas tú:** los repetidos del cajón se agrupan en una fila expandible cuyo total cuadra al céntimo con la suma de sus filas; hay filtros por medio, estado y comprobante y orden por monto; si hay más de 500, dice «mostrando 500 de N».
- **Esfuerzo / dependencias:** M, solo web. Un grupo esconde filas anulables: cada fila debe seguir abriéndose y anulándose desde dentro del grupo. Se aparta del spike (8 columnas): ADR. Quitar el chip «Pagado» repetido y el código de cuenta de cada fila. **Choca con** la decisión de Felipe sobre el camino A solo si se funde la tarjeta «Gastado en el mes»: eso es suyo.

### #7 · [Replantear] Corregir un gasto ya pagado
- **Dónde:** `anular_gasto` (M1:752-757), `puedeAnular` (`gastos-reglas.ts:341-343`), `GastoDetalleModal`; pendiente abierto «¿hace falta anular un pago?» en `docs/BACKLOG.md:1600`.
- **Por qué en este puesto:** un monto mal escrito en una factura pagada no tiene salida y el sistema solo dice «Su factura ya tiene pagos: no se anula». Hay dos tareas, no una: (a) **chica y segura**, anular y volver a clasificar o registrar en un solo paso para un gasto de caja (la plata no vuelve sola: decirlo); (b) **decisión de Felipe**: ¿se puede anular un pago?
- **Cómo lo verificas tú:** (a) corrige un monto de un gasto de caja en un paso y el egreso no queda huérfano; (b) cuando Felipe decida, la hoja dice la salida real.
- **Esfuerzo / dependencias:** S (a, web) · L (b, base y contabilidad). La nota de crédito corrige al proveedor, no el monto que tipeó la persona. Un gasto sin comprobante no sustenta crédito fiscal.
- **DECIDÍ:** hacer (a) y dejar (b) como pregunta. **DESCARTÉ:** permitir editar el gasto, porque rompe ADR-0195 («nada se edita») y el rastro del cierre. **SE ROMPE SI:** se anula un gasto de caja y la plata no vuelve: el egreso queda «por clasificar» y bloquea el cierre.

### #8 · [Reconstruir] «Este mes no corresponde» y una sola definición de «falta»
- **Dónde:** `fn_gastos_fijos_mes` (M4:172-207) y sus lectores: Cierre (`20260925180000:463-507`), Flujo (`20261002130000:275-283`), Confianza, Resumen, Presupuesto. Tabla nueva `gastos_fijos_omitidos` (append-only, con motivo, firmada por `fn_actor_persona_id(true)`).
- **Por qué en este puesto:** hoy «falta» significa cuatro cosas según el módulo que lo lea; no existe «este mes no corresponde» y el aviso no se puede limpiar sin falsear un dato (archivar saca el fijo de todos los meses). Con el chequeo de fijos del Cierre pasando a bloquear desde noviembre (decisión de Felipe, 22-oct), sin esto se bloquea por un recibo de luz que llega después del 4-nov.
- **Cómo lo verificas tú:** omite un fijo de octubre con motivo y comprueba que Gastos, Cierre, Flujo y Resumen lo dejan de contar a la vez; un fijo creado el 22-oct no figura «Faltan» en septiembre.
- **Esfuerzo / dependencias:** L, cambia la base (migración por partes, reemplazos anclados). **Después del cierre de octubre.** Depende de la #3. Coordinar con la sesión del cierre (`cierre-chequeos`).
- **DECIDÍ:** una función de lectura única para «falta» que filtre por mes de alta y por omisión con motivo. **DESCARTÉ:** que cada módulo siga con su propia definición, porque el cierre y la pestaña ya discrepan para el mismo mes. **SE ROMPE SI:** se omite un fijo de un mes ya cerrado sin pasar por `fn_exigir_mes_abierto` y los avisos congelados dejan de coincidir con la pantalla.

### #9 · [Mejorar] Revisión del líder del efectivo desde S/ 100
- **Dónde:** ADR-0433 decisión 7 y actividad 12; no hay tabla ni RPC de revisión; `GastoRapidoModal.tsx`.
- **Por qué en este puesto:** el efectivo que sale de un cajón no tiene ninguna revisión y la alerta «fuera de lo normal» no ve los gastos chicos. Solo 5 de 147 gastos la dispararían: el umbral es barato de operar.
- **Cómo lo verificas tú:** un gasto de caja de S/ 100 o más queda pendiente de revisión del líder y aparece en la bandeja.
- **Esfuerzo / dependencias:** M, cambia la base, **toca dinero y permisos**. **Pregunta abierta de Felipe (22-oct):** ¿aprueba el líder *antes* de que salga la plata o la *revisa después*? El ADR dice «revisión» y la decisión del 22-oct dice «aprobación»: son diseños distintos. **Es de la sesión de ADR-0433 y de Caja**: no duplicar; coordinar antes de tocar.

### #10 · [Eliminar/fusionar/conectar] Gastos conectado con Pagar, Excel y Reportes
- **Dónde:** `GastosPanel.tsx:602-610` (nota «Compras ▸ Por pagar» sin enlace), `RegistrarGastoModal.tsx:259-271` (aviso de éxito sin acción), `finanzas/dinero/por-pagar/page.tsx` (`?pagar=<id>`), `lib/exportar-csv.ts`.
- **Por qué en este puesto:** el gasto a crédito termina en un texto, no en un botón, y en CAYLA Global «Compras ▸ Por pagar» ni existe. El contador pide «los gastos de octubre» y no hay nada que descargar. La comparación contra el mes anterior ya existe en Reportes pero Gastos no enlaza.
- **Cómo lo verificas tú:** desde el detalle de un gasto a crédito, «Ir a pagar» abre la hoja de pago de esa factura; «Descargar el mes» baja un CSV; hay un enlace a Reportes ▸ Estado de resultados.
- **Esfuerzo / dependencias:** S, solo web, **toca permisos** (el botón solo con el módulo Cuentas y dinero). `textoCsv` no neutraliza fórmulas (`=`, `+`, `@`) y lo comparte Impuestos: arreglarlo es más grave que el botón. El enlace `?pagar=` necesita `?ver=` de la sede del gasto.

### #11 · [Replantear] Decidir si Gastos pasa a ser «el mes por unidad»
- **Dónde:** sección 8 de este archivo.
- **Por qué en este puesto:** pregunta de fondo, no de pantalla: ¿Gastos es un libro donde se anota o el tablero donde se confirma lo esperado contra lo registrado por unidad? Esta tarea solo pide que **Felipe decida después del cierre del 4-nov**.
- **Cómo lo verificas tú:** tú decides; no hay nada que ejecutar.
- **Esfuerzo / dependencias:** L si se aprueba. No antes del cierre; no reordena las 10 de arriba.
- **DECIDÍ:** proponer, no reconstruir ahora. **DESCARTÉ:** rediseñar antes del 28-oct porque no cabe y reabre el camino A que Felipe eligió el 15-oct. **SE ROMPE SI:** se rediseña sin fijar quién actúa (Gastos) y quién lee (Reportes ▸ Estado de resultados «por tienda hasta resultado directo»).

### #12 · [Mejorar] — *bajo valor / opcional hoy* — Foto o PDF del comprobante dentro del gasto
- **Dónde:** `compra_adjuntos` cuelga de `compras`; el gasto de viaje tiene su propio bucket (`20261013233000`, que descartó reusar `compra_adjuntos`); tabla y RPC nuevas.
- **Por qué en este puesto:** casi todos los gastos de octubre no tienen comprobante y no existe dónde adjuntarlo. Pero el 95 % son micro-gastos de caja sin papel posible; el valor está en los de ≥ S/ 100, que son pocos. Cambia permisos del bucket (un archivo con RUC y montos). Va después de la #9.
- **Cómo lo verificas tú:** desde el detalle de un gasto se adjunta una foto y la ve solo quien ve ese gasto.
- **Esfuerzo / dependencias:** M, cambia la base. No antes de la #9.

**Lista aparte (no cuenta entre las 12):** alcance por la base en vez de `rol === 'lider'` (permisos; hoy una cuenta; pide OK de Felipe) · sugeridos de fijo sin basura del cajón y «No es fijo» reversible (hoy se promete reversible y no lo es) · «¿No está? Súmalo» con el padrón de siempre (ADR-0008) · piezas a mano donde ya hay pieza única (`Vacio`, `Aviso`, `btn-peligro`) · IGV de la vista previa con la tasa de la base (hoy 0,18 fijo) · traducir el `23505` de `registrar_gasto` · candado de esquema fijo↔gasto (misma sede y categoría) · Resumen «Para decidir hoy» con los fijos que más pesan primero · medir la pantalla entera con `/formidable`, `/chaos` y la guía de foco antes de dar por terminada cualquier tarea de arriba.

## 8 · Estrategia alternativa
**Planteamiento:** dejar de ser «un libro de gastos con cuatro pestañas» y pasar a **«el mes por unidad»**: una fila por TRU, AQP, LIM y Taller con lo *esperado* (los fijos, que ya existen) contra lo *registrado*, y la caja chica, la diferencia de caja y la planilla en solo lectura. La lista de gastos queda como el detalle que se abre desde una celda. La captura se mueve al momento del hecho (cierre de caja que pregunta «¿en qué se fueron?», fijo que se confirma al llegar su recibo, fondo con rendición para el Taller).

| | Ganas | Pagas |
|---|---|---|
| Responde lo que Felipe pregunta cada mes | Cuánto cuesta operar cada unidad y qué falta confirmar | Reabre el camino A del 15-oct y se pisa con «por tienda hasta resultado directo» de Reportes |
| Comparación entre tiendas | Control de gestión real (faltante por venta) | «Esperado» solo existe para los fijos: `presupuestos` está vacía |
| Esfuerzo | La lista útil sale como consecuencia | L con 8 compuertas; no cabe antes del 28-oct ni del cierre del 4-nov |
| Riesgo | Respeta `registrar_gasto`, anular con motivo y ADR-0195 | Preguntar en el cierre de caja toca Caja y dinero; si la encargada inventa una categoría para cuadrar, el cierre se vuelve un rito que muere |

**Recomendación:** no reconstruir ahora. Esta semana, a mano, que alguien registre los 24 fijos (≈1 hora; esa corrida es la especificación de la #4); antes del 28-oct, solo web y pequeño (#1, #2, #3); y **después del cierre, decidir el rediseño por unidad** con la pregunta de caja como primera pieza. Decide Felipe.

## 9 · Referentes de ERP y futuro
*Verificado en la web (no copiado): QuickBooks (transacciones recurrentes: programadas, recordatorio, sin programar), Xero (facturas repetidas), Brex y Ramp (recordatorio por push, SMS o correo y captura del recibo). No verificado: Odoo (recurrentes), Zoho Books (borradores), umbral de recibo de Ramp.*
- Los fijos de CAYLA ya son la variante «recordatorio» de QuickBooks y están bien pensados. **No copiar la autogeneración**: aquí un gasto es pago + comprobante en un solo acto.
- **Futuro, con su porqué:** recordatorio por WhatsApp, correo o push (el patrón existe para la tienda, ADR-0461; sirve cuando pague alguien distinto de Felipe) · OCR del recibo (con ~9 facturas a crédito al mes no paga su costo) · periodicidad no mensual (los 24 son mensuales) · repartir un gasto entre tiendas (cada fijo es de una sola unidad) · retención del 8 % de recibos por honorarios (pendiente del contador) · cruce con la propuesta del SIRE de SUNAT · provisión de fijos en el resultado como la planilla (ADR-0453).

## 10 · Fuera de esta pantalla
**El costo fijo mensual está cargado casi entero «sin comprobante».** Cerca del 93 % del monto de referencia de los 24 fijos (los alquileres, el software, la mayor parte de lo demás) tiene tipo `sin_comprobante`: no da IGV descontable y **puede que tampoco sustente el gasto para renta**, según cómo se pague (la regla de bancarización ya se modela para el IGV, pero no se ve que alcance a lo «sin comprobante»). `[producción]` `[no verificable: la conclusión tributaria]`. Es lo que más pesa en el primer cierre real y nadie lo preguntó. **Antes del cierre del 4-nov, pregúntale al contador qué papel sustenta cada alquiler** (recibo por arrendamiento, contrato, pago por banco) y si el medio de pago importa. Las cifras exactas las tienes en el chat; no van al repo.

## 11 · Líneas propuestas para el backlog
(Felipe aprueba antes de pasarlas a un archivo de `docs/backlog/`.)
- [ ] `[pantalla:finanzas-gastos]` #1 Aviso y enlace de un gasto suelto al fijo que le toca — S (+M candado de base)
- [ ] `[pantalla:finanzas-gastos]` #2 Tarjetas y titular honestos («a hoy», «falta confirmar», «De la empresa») — S
- [ ] `[pantalla:finanzas-gastos]` #3 Fijos del mes como cola de cierre (mes, atraso, total, orden, abre lo registrado) — M
- [ ] `[pantalla:finanzas-gastos]` #4 Confirmar los fijos de corrido (hoja por fila; 1 toque para exactos sin comprobante) — M, toca dinero
- [ ] `[pantalla:finanzas-gastos]` #5 Lecturas que fallan lo dicen (7 devuelven `[]`) — S, pide OK (ADR-0433 Tanda 2)
- [ ] `[pantalla:finanzas-gastos]` #6 Lista de gastos útil: filtros, orden, agrupar micro-gastos, aviso del tope de 500 — M
- [ ] `[pantalla:finanzas-gastos]` #7 Corregir un gasto ya pagado: versión chica + decisión «¿se anula un pago?» — S + decisión
- [ ] `[pantalla:finanzas-gastos]` #8 «Este mes no corresponde» y una sola definición de «falta» — L, después del cierre
- [ ] `[pantalla:finanzas-gastos]` #9 Revisión/aprobación del líder del efectivo desde S/ 100 (ADR-0433 act. 12) — M, de otra sesión
- [ ] `[pantalla:finanzas-gastos]` #10 «Ir a pagar», Descargar el mes y enlace a Reportes (neutralizar fórmulas del CSV) — S
- [ ] `[pantalla:finanzas-gastos]` #11 Decidir «el mes por unidad» después del cierre — decisión de Felipe
- [ ] `[pantalla:finanzas-gastos]` #12 Foto o PDF del comprobante dentro del gasto — M, bajo valor hoy

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | «Ver» (solo líder) | Elige tienda, todas o empresa | ajustar: «De la empresa» se lee como toda la empresa | `GastosPanel.tsx:156-169` |
| Cabecera | «+ Registrar gasto» / «+ Registrar activo» | Abre el formulario de 29 controles | ajustar: compite con la bandeja; es la acción rara (95 % entra por Caja) | `GastosPanel.tsx:173-181` |
| Pulso | «¿En qué se fue la plata?» + bandeja | Respuesta grande y una cosa por revisar | bien; falta el «¿Por qué?» y el desglose que la maqueta prometía | `GastosPulso.tsx`, `gastos-pulso-reglas.ts:29` |
| Cifras | Gastado en el mes | Repite el monto del hero | sobra | `GastosPanel.tsx:203` |
| Cifras | IGV que puedes descontar | Neto del IGV perdido | bien | `GastosPanel.tsx:208` |
| Cifras | Por pagar de gastos / Egresos sin clasificar | Acumulados a hoy | ajustar: rotular «a hoy» | `fn_gastos_panel M1:862-877` |
| Pestaña Gastos | Buscar, Categoría, Mes | Filtra en el cliente (≤ 500 filas) | falta: medio, estado, comprobante, rango, orden | `GastosPanel.tsx:375-397` |
| Pestaña Gastos | Fila / «Anular…» | Abre el detalle; anula con motivo | bien; falta salida para factura pagada | `GastosPanel.tsx:441-454, 613` |
| Pestaña Fijos | Para confirmar / Faltan | Lista de fijos por llegar y atrasados | ajustar: sin fecha, atraso ni total | `GastosFijosYActivos.tsx:139-169` |
| Pestaña Fijos | «Registrar» / «Registrar monto» | Abre el formulario lleno | ajustar: 24 formularios | `GastosFijosYActivos.tsx:147, 162` |
| Pestaña Fijos | «Se repiten. ¿Los marco?» / «No es fijo» | Sugiere fijos nuevos | ajustar: «No es fijo» no es reversible | `GastosFijosYActivos.tsx:173-196` |
| Pestaña Fijos | «Ya registrados este mes» / «Editar fijos» | Lista lo hecho; lleva a Configuración | ajustar: la fila no abre su gasto | `GastosFijosYActivos.tsx:197-213` |
| Pestaña Activos | Lista, baja, «se registró por error» | Activos con depreciación | bien (fuera de esta pasada) | `GastosFijosYActivos.tsx:632-790` |
| Pestaña Egresos | «Clasificar» / «Revertir» | Decide qué fue cada salida de caja | bien | `GastosPanel.tsx:298, 626-797` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-22 | completo | 5/10 | 7,0 — Soporte | — (primer análisis de la pantalla entera) |
