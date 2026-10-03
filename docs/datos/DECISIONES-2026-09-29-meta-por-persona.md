# DECISIONES — acta de la ronda sobre la meta por persona en Rendimiento e Inicio (2026-09-29)

**Quién decide:** Felipe, en la conversación de la sesión de la rama `claude/accesos-rol-terminal-3e62ba`: primero 8 preguntas
sobre «una meta por persona que se reparte sola», después el spike visual interactivo, dos ajustes suyos al spike y el plan de
implementación. Esta acta **no** salió de `AskUserQuestion`: cada respuesta está citada como la dio.
Continúa la numeración después de **D-141**, el número más alto en uso el 2026-09-29 (ADR-0258 usa D-139 y D-140; el acta de
Traslados llega a D-132; D-136 a D-138 están reservados por la sesión de edición de variantes). Se verificó en `main`, en todas
las ramas remotas, en los PR abiertos, en los worktrees y en `SESIONES-ACTIVAS`.
**Esta acta manda sobre las anteriores en lo que cambia:** D-64 (metas), D-68 y D-113 (quién ve las cifras) y D-125 (metas por
persona: «todavía no»). En cada una quedó una nota fechada, sin borrar el texto original.

**El pedido, en palabras de Felipe:**
«Puede realizarse en base a un reparto automático que se basa en la totalidad de la sede, las ventas que haga, los productos que
tiene […] puede incluir los horarios que existen en Dynamic para saber en base a eso cuánto debería vender, y que el líder de la
sede pueda modificarlo si lo ve oportuno. Que también una líder pueda cambiar de cada integrante en la interfaz de rendimientos
[…] y en base a lo que registra en caja, ya que en caja se puede agregar quién hace la venta, con eso saldría el rendimiento y
sus ventas semanales y cómo va su día.» Y sobre el Inicio: «Si es integrante, que se vea la meta individual, algo simple».

**Dónde sigue:** el diseño técnico, el orden de construcción y el despliegue están en
[ADR-0286](../adr/0286-meta-por-persona-en-rendimiento-e-inicio.md); la referencia visual, en
[`docs/maquetas/rendimiento-meta-2026-09/`](../maquetas/rendimiento-meta-2026-09/) y
[`docs/maquetas/inicio-bloques-por-rol-2026-09/`](../maquetas/inicio-bloques-por-rol-2026-09/). **Construido hasta hoy (2026-09-29):** los pasos 1 a 4 —«mis ventas de hoy», las metas en la base, el panel de Rendimiento y el Inicio de la integrante— y los accesos del
Inicio por función del rol, todo en la rama `claude/accesos-rol-terminal-3e62ba` con sus pruebas. **En producción está solo la tabla del historial** (`metas_persona_ajustes`); las 11 funciones
(`20260930040000` y las partes 2 a 4 de `20260930050000`) **están sin pegar**, y hasta que Felipe las pegue el panel no aparece (la pantalla cae a los rankings de siempre). El detalle y lo que falta:
ADR-0286, «Orden de construcción y despliegue».

---

## Lo que se miró antes de decidir (solo lectura, 2026-09-29)

| Dato | Valor | De dónde |
|---|---|---|
| Ventas reales en el ERP | **1** (2026-09-29, una sola asesora). Sin historial de ventas | producción, `retail.ventas` |
| Meta de la sede | **Ninguna tienda la tiene**: `ubicaciones.meta_venta_diaria` sin valor en TRU, AQP y Lima; `ubicacion_metas_dia` con 0 filas | producción |
| Meta por persona | No existe: ninguna columna ni tabla de retail la guarda | `information_schema` |
| Horarios en Dynamic | `turnos`: 178 filas de 11 personas, del 2026-07-01 al **2026-09-21** (ninguna desde hoy ni en octubre). `horarios_asignados`: 184 filas de 31 personas, **21 abiertos hoy**. `jornadas` (asistencia real): 4.663 filas de 47 personas hasta el 2026-09-29 | producción, `public.*` |
| Qué lee retail de Dynamic hoy | `fn_asesoras_de_turno` y `fn_rendimiento_horas_nucleo` leen `jornadas` (lo trabajado), no los horarios | cuerpos de las funciones |
| `fn_ventas_del_dia` para quien no es líder | Devuelve **todas** las ventas de su tienda (`not q.lider and v.ubicacion_id = q.mia`), sin mirar `asesora_id`. El Inicio las mostraba como «Tus ventas» y «Tu ticket» | producción (cuerpo verificado con su md5) y `20260924180000` |
| Rendimiento en producción | El módulo y las funciones de la primera mitad del ADR-0219 (`fn_rendimiento_ubicaciones`, `fn_rendimiento_equipo`). Faltan `fn_rendimiento_persona`, `reasignar_asesora` y `venta_reasignaciones` | producción |
| Roles en producción | Líder de equipo (12 personas: 8 sin tienda, 5 de ellas Admin, y **4 con Tienda TRU, ninguna Admin**, que Felipe cargó el 2026-09-29 como encargadas), Integrante (14, no limitado), Gestión & Visión, Terminal Almacén, Terminal de ventas. **No existe un rol «Encargada de tienda»** | producción, `retail.roles` y `retail.colaboradores` |
| Módulo `rendimiento` | `delegable = true`, `solo_lider = false`; ningún rol lo tiene asignado (el líder lo ve siempre) | producción, `retail.modulos` |

---

## Las 8 preguntas

Cada una llevaba la recomendación de Claude y una alternativa. **Felipe respondió las 8 el 2026-09-29.**

| # | Pregunta | Recomendación de Claude | Respuesta de Felipe |
|---|---|---|---|
| 1 | ¿Quién carga la meta de TRU antes de abrir? Hoy ninguna tienda la tiene | La líder la escribe en Configuración › Metas (ya existe); el sistema solo la sugiere con 4 semanas de ventas | «Estoy de acuerdo» |
| 2 | La fórmula con productos, stock y ritmo de venta: ¿se queda para una fase 2 como sugerencia de la meta de la SEDE? | Sí: hoy hay 1 venta y no hay base; y una meta que sale de esa fórmula no se le puede explicar a quien la recibe | «Estoy de acuerdo» |
| 3 | ¿Reparto por horas programadas o en partes iguales? Si alguien falta, ¿su parte se pierde o se reparte? | Por horas programadas; la parte de quien falta se pierde | «Reparto por horas programadas» |
| 4 | ¿Diaria o mensual? | Se fija mensual, se calcula cada día, se ve día y mes | «Estoy con que sea mensual» |
| 5 | ¿Quién puede cambiar la meta de una persona? | La líder de la sede y el Admin, con motivo e historial; nadie cambia la suya | «Estaría bien que sea la líder de sede y el Admin» |
| 6 | ¿Qué cuenta como venta de la persona? | Con IGV, sin anuladas; devoluciones y cambios no restan; el apartado, el día que se entrega y a quien lo apartó | «De acuerdo» |
| 7 | ¿Solo lo suyo, y solo para acompañar? | Sí; y dejar escrito que la meta no se usa para pagar ni evaluar | «Sí, estoy de acuerdo» |
| 8 | ¿Qué ve primero la líder en Rendimiento? | Hoy · Semana · Mes, abriendo en Hoy; cifras con meta, «Cómo va hoy» por persona, semana en barras y rankings del mes al final | «De acuerdo» |

**Después del spike, Felipe pidió cuatro cambios** (D-149, D-151, D-152 a D-154): el gráfico no debe crecer con la pantalla y debe
poder verse por semana y por mes; la integrante también debe ver su semana y su mes; la pantalla no debe volver arriba al
cambiar de semana o de mes; y, en el Inicio, cada rol y cada terminal debe tener accesos de su función.

---

## Decisiones

**D-142 · Para qué sirve la meta por persona** → **reconocer y acompañar. No se usa para pagar ni para evaluar.** Confirma D-112,
D-65 y D-126: sin dinero, sin bono, y sin relación con el «rendimiento del mes» ni con los objetivos de Dynamic. Va escrito en
la pantalla de la líder y en la de la integrante. Un bono con fórmula y regularidad es remuneración en el Perú (D-65): **si algún
día se usa así, antes se consulta a un abogado laboralista.** *(Pregunta 7.)*

**D-143 · La meta de la sede va primero** → es el ancla: sin ella no hay qué repartir. **La carga la líder en Configuración ›
Metas** (ya existe: `guardar_metas_tienda`, `fn_meta_mes`, campañas incluidas). Si la sede no la tiene, la pantalla lo dice y
lleva a Configuración: **nunca inventa una meta ni dibuja «0 %».** El sistema solo la **sugiere** cuando haya 4 semanas de ventas
de esa tienda. Hoy ninguna tienda la tiene cargada. *(Pregunta 1.)*

**D-144 · La fórmula por productos y ventas** → **fase 2.** Cuando exista historial, sugerirá la meta de la SEDE. **Nunca calcula
la meta de una persona:** esa sale de D-145. *(Pregunta 2.)*

**D-145 · Reparto por horas programadas** → la meta de una persona en un día es **la meta de la sede de ese día × (sus horas
programadas ÷ las horas programadas de todas las personas de esa sede ese día)**. Se redondea a S/ 10 con el método del mayor
resto, de modo que **las partes suman EXACTO la meta de la sede**. Quien no trabaja ese día (descanso) recibe 0 y su parte no se
le carga a las demás. *(Pregunta 3.)*

**D-146 · Se fija mensual y se calcula cada día** → la meta de una persona en el mes es **la suma de sus partes diarias**. Se ve
en tres períodos: **Hoy, Semana (7 días) y Mes**. Cambiar una meta se hace sobre **la del mes**; la del día y la de la semana se
recalculan en la misma proporción. *(Pregunta 4.)*

**D-147 · Quién cambia la meta de una persona** → **la líder de la sede (solo su tienda) y el Admin (todas).** Con **motivo
obligatorio** de una lista cerrada (más «Otro» con una línea) y un **historial que no se edita ni se borra**: quién, cuándo,
el antes y el después. También se puede **volver a la meta automática**. Solo aplica al mes actual y a los futuros. *(Pregunta 5.)*
- **Nadie cambia la suya; la de la encargada la cambia un Admin.** Es el mismo candado que ADR-0219 propone para «corregir quién
  atendió» (D-117) y que ADR-0177 ya aplica a las devoluciones: quien es medido no fija su propia vara. *Lo propuso Claude y
  Felipe lo aprobó al ver el spike; no fue una pregunta aparte.*
- «La líder de la sede» es, en retail, quien tiene la tienda asignada y ve el módulo Rendimiento (D-114): hoy son 4 personas de
  TRU cargadas como Líder de equipo. Ver «Abierto».

**D-148 · Qué cuenta como venta de la persona** → **soles con IGV** (igual que la meta de la sede); ventas **completadas y no de
prueba** (las anuladas no cuentan); **las devoluciones y los cambios no restan** (D-78 y D-79); **un apartado cuenta el día que se
entrega**, a quien lo apartó (ADR-0219, respuesta 10). Es la misma definición de Rendimiento, para que lo que ve la integrante y lo
que ve la encargada sea el mismo número. *(Pregunta 6.)*

**D-149 · Lo que ve la integrante** → **solo lo suyo:** su meta de hoy, su mes y su gráfico **Semana | Mes** (acumulado o por
día), en Inicio. **Nunca ve a sus compañeras ni un ranking**; el top 3 visible entre compañeras de D-66 sigue en pausa.
**Cambia D-68 y D-113**, que decían que las colaboradoras no ven ni sus propias cifras. *(Pregunta 7 y pedido posterior de
Felipe: «en integrante debería ver tanto semanal como mensual».)*

**D-150 · La meta de la integrante se ve por defecto** → **encendida desde el despliegue, sin módulo ni interruptor.** Felipe:
«De momento que esté encendido, quita lo de apagado o encendido, que por defecto se vea».
- **DESCARTÉ:** un módulo «Mi meta» en Roles y accesos (nace solo para el líder, ADR-0161) y un interruptor propio por tienda.
  Cualquiera de los dos habría dejado las metas sin revisar apagadas mientras las encargadas las ajustan.
- **SE ROMPE SI:** la primera semana una integrante ve «41 % de tu meta» con una meta que nadie revisó. Por eso queda una
  **condición de despliegue**: cargar y revisar las metas de TRU con las encargadas **antes** de publicar el Inicio de la
  integrante (paso 4 del ADR-0286).
- **Si no hay meta cargada o no hay horario, el bloque no se dibuja** (no muestra «0 %»). *(Decisión de Felipe, 2026-09-29.)*

**D-151 · Qué ve la líder en Rendimiento** → **Hoy · Semana · Mes, abre en Hoy:** las cifras (soles, meta y avance de la sede,
personas de turno, ticket); **«Cómo va hoy» por persona** (turno, ventas, meta, avance) con la meta editable; **«Ventas contra la
meta»** con pestañas **Semana | Mes** (el mes, **Acumulado** o **Por día**), de **altura fija** que se mide con el ancho real
para no crecer en pantallas grandes; el historial «Cambios de meta»; y los **dos rankings del mes al final**. La pantalla
**conserva su posición y el foco** al cambiar de período o de pestaña. «Las 3 tiendas hoy» (Admin, agrupado por tienda, nunca un
ranking mezclado: D-124). *(Pregunta 8 y correcciones de Felipe al spike.)*

**D-152 · Accesos del Inicio por función del rol** → la lista de accesos sale de **lo que hace el rol** (si ve Vender o no), no
de su nombre ni del tipo de sede: mostrador, trastienda (no vende, en una tienda), líder, almacén y taller. Sigue el tope de 4
(ADR-0225 D5). «Nuevo producto» exige ver Productos **y** poder escribir en el catálogo. La terminal del mostrador no ve el Inicio
(aterriza en `/vender`). *(Pedido de Felipe: «cada rol tenga una lista genérica de lo que va a usar»; «terminal caja […] accesos
relacionados a su función, lo mismo para almacén».)* **Construido y probado** (`lib/inicio-avisos.ts`).

**D-153 · Accesos de la líder** → **«Nuevo producto» en lugar de «Apartados»** (Felipe: «cambiar un acceso de líder que es apartados
por nuevo producto»). Apartados sigue en «Te toca» y en el menú de Ventas. **Construido.** «Las 3 tiendas hoy» del Inicio es
**solo de la líder** (respuesta de Felipe).

**D-154 · Botón fijo del celular** → la **terminal de almacén** (y todo rol que no vende en una tienda) lleva **«Recibir
mercadería»** fijo abajo, igual que el almacén como sede. **Construido.**

**D-155 · «Tus ventas» es lo que ella atendió** → el Inicio de una integrante lee `fn_mis_ventas_del_dia` (solo lo que atendió,
completadas y no de prueba); **la función de siempre, `fn_ventas_del_dia`, no cambia** porque Caja, Vender y Comprobantes
necesitan el día de la tienda. **Construido en local (paso 1); pide el ok puntual de Felipe para producción.** Efecto visible:
la integrante verá que su cifra baja del total de la tienda a lo suyo; conviene avisarles antes de publicar.

**D-156 · Orden de construcción y despliegue** → seis pasos, cada uno probable por separado (principio 7): **0** estos papeles ·
**1** «Mis ventas de hoy» (hecho en local) · **2** metas en la base · **3** Rendimiento web · **4** Inicio de la integrante ·
**5** producción y datos. Las migraciones de producción se ensayan con rollback y se pegan solo con el ok puntual de Felipe,
**siempre antes que la web**, que oculta el bloque de meta si la base todavía no lo tiene. Detalle en ADR-0286.

**D-157 · Permiso para cambiar metas** → **se reutiliza el módulo `rendimiento`.** Quien lo ve cambia las metas de su tienda; el Admin, las de todas;
y nadie cambia la suya (la de la encargada la cambia un Admin). **No hay módulo nuevo.** Felipe: «reutiliza el módulo». *(Decidido el 2026-09-29, después del acta.)*

**D-158 · Sin horario vigente** → **partes iguales** entre quienes marcaron asistencia ese día (`jornadas`); si nadie marcó, esa parte queda sin
asignar. La pantalla dice que la tienda no tiene horarios y que la meta se reparte en partes iguales. Felipe: «déjalo en partes iguales».

**D-159 · «Ritmo esperado» se queda** → la marca vertical de la barra de «Cómo va hoy» (cuánto de su turno ya pasó) y las tres palabras **«Adelante»,
«En ritmo» y «Por debajo»** (con una diferencia de 10 puntos), sin semáforo rojo. Felipe: «con el tercero se queda». Solo lo ve quien ve Rendimiento;
la integrante ve su barra con la misma marca, sin la palabra.

**D-160 · Roles: no se cambia nada** → **las encargadas se quedan como «Líder de equipo»** con Tienda TRU asignada; **no se crea un rol propio** y **ningún paso
de esta construcción toca `roles`, `rol_modulos` ni `modulos`.** Felipe: «que no tengan rol propio, que se quede en líder, no hagas cambios con roles».
Consecuencia que se acepta: heredan todo lo del líder (Finanzas, Cierre de mes, Impuestos…) salvo lo que un Admin les quite en Roles y accesos; eso lo decide
Felipe fuera de esta construcción.

---

## Lo que se aplicó sin volver a preguntar

- **D-65 / D-112:** sin dinero. **D-126:** ninguna relación con el «rendimiento del mes» de Dynamic.
- **D-78 y D-79:** las devoluciones no restan ni ordenan.
- **D-114:** «líder de la sede» es quien ve el módulo Rendimiento y tiene tienda asignada; el Admin ve todas.
- **D-115:** mes calendario con la muestra a la vista («muestra chica» con menos de 40 ventas).
- **D-116:** la encargada entra en el ranking si vende, marcada.
- **D-124:** «Todas las tiendas», agrupado por tienda.
- **ADR-0161:** un módulo nuevo nace solo para el líder y todo lo que guarda firma con el responsable elegido
  (`fn_actor_persona_id(true)`). Aquí no hay módulo nuevo.

---

## Abierto

Decididos el mismo día, después del acta: **D-157 a D-160** (permiso, sin horario, ritmo esperado, roles). Queda esto:

| Qué | Quién |
|---|---|
| **Fuente de las horas programadas.** *Construida como se propuso en el paso 2 (local):* `horarios_asignados` vigentes (forma `horario_por_dia` leída en producción: día `0` a `6` con `e`, `s`, `r`), con `turnos` solo como excepción de un día (un descanso vale 0 h) | Felipe, para confirmar |
| **Que DO mantenga vigentes los horarios de TRU**: hoy hay 21 abiertos de 31 personas | DO |
| **Tope y meses.** *Construidos como se propuso en el paso 2 (local):* una meta personal no puede pasar de la meta de la sede del mes, y no se cambian meses pasados. La suma de las metas personales puede diferir de la de la sede (la pantalla dice «asignado S/ X de S/ Y») | Felipe, para confirmar |
| **Cuándo y quién carga las metas de TRU** (condición de D-150) | Felipe con las encargadas |
| **Avisar a las integrantes** que «Tus ventas» pasa a ser solo lo suyo (D-155) | Felipe |
| **Corregir quién atendió** (ADR-0219, sección 4: `venta_reasignaciones`, `reasignar_asesora`) sigue sin construir. Cuando exista, cambiar de quién es una venta mueve las cifras de las dos personas; los ajustes de meta no cambian | Claude / Felipe |
| Lima no tiene personal cargado en Dynamic (D-62): sin él no hay quién atendió ni horas | DO |
| Sugerir la meta de la sede desde el historial (D-144) | Fase 2, cuando haya 4 semanas de ventas |
