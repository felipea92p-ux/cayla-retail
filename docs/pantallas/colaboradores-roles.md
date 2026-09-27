# Pantalla — Roles y accesos (sección de `/colaboradores`)

> Modo: completo · Fecha: 2026-09-27 · Rol/sede: Admin/Líder, Tienda TRU (la sede activa no filtra esta sección) · Datos: real (SQL de producción: volumen, roles de hoy, RLS, cuerpo real de `asignar_rol` y de `fn_actor_persona_id`, conteo de Admins)
> SHA analizado: `18a2e4b9` (origin/main) — si `RolesPanel.tsx`, `RolesModales.tsx`, `roles-reglas.ts`, `roles-acciones.ts`, `ComboResponsable.tsx` o `responsable-reglas.ts` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/colaboradores/page.tsx` → `ColaboradoresPanel.tsx` (sección "roles") → `RolesPanel.tsx` + `RolesModales.tsx` (`AsignarRolModal`) → `lib/roles-reglas.ts` + `lib/roles-acciones.ts` + `lib/roles.ts` → RPC `asignar_rol`, `crear_rol`, `guardar_modulos_rol`, `fn_es_admin`, `fn_exigir_otro_admin`, `fn_actor_persona_id` → tablas `retail.roles`, `rol_modulos`, `roles_historial`, `colaboradores`, `terminales`, `modulos`. Comparte `ComboResponsable.tsx` / `lib/responsable-reglas.ts` con el resto del ERP (ADR-0161/0162).
> Otra sesión tocándola: no. `docs/SESIONES-ACTIVAS.md` lista `claude/self-role-assignment-fee72b` (PR #399), pero ya está fusionado en `origin/main` (verificado: `0493d790` es ancestro de HEAD). Es una fila por limpiar, no trabajo en curso.
> Primer análisis de esta sección. `docs/pantallas/colaboradores.md` (2026-09-22) analizó "Cuentas"; esta es la sección "Roles y accesos", construida después (ADR-0161/0178) y nunca analizada aparte.

## 0 · Veredicto
El motor de permisos (roles por módulo, escalón Admin leído de Dynamic, "solo das lo que tienes", "solo alcanzas a quien está por debajo") está construido con más cuidado que casi cualquier otra parte del ERP, y en producción funciona exactamente como documentan los ADR. Lo que falla es la comunicación en el momento más caro: el modal para cambiar un rol no dice que un Admin que se autodegrada de Líder pierde su escalón de un clic (hoy hay 5 Admins, así que nada lo frena), y un aviso de error global puede quedar flotando sobre un modal al que no pertenece, sin decir de cuál acción es.
**Cumple su finalidad:** 7,4/10 · **Relevancia:** 6,6/10 — Soporte (al borde de Núcleo por su peso de gestión indirecta)

## 1 · Finalidad declarada
"Esta pantalla existe para decidir qué ve y qué puede hacer cada cuenta del ERP —por rol, no por persona—, protegiendo que nunca quede el sistema sin quien administre a los líderes, y dejando escrito quién se lo dio y cuándo."
Fuente: ADR-0161 sección B (roles a medida, "ve/no ve" por módulo) y ADR-0178 (escalón Admin, "solo das lo que tienes", "solo alcanzas a quien está por debajo"). `docs/datos/modulos/01-identidad-y-acceso.md` no cubre esta sección: es del 2026-09-12, anterior al sistema de roles por módulo (2026-09-22/23), y no se cita como vigente para esto. ¿Coinciden docs y pantalla? **Sí, con fidelidad alta** — cada pieza visible en la captura (badge "Eres admin", aviso "Deja de ser líder", candados por alcance) tiene su decisión exacta en ADR-0161/0178 y su función correspondiente, verificada en producción. El desajuste ya conocido (D-12 promete cuatro niveles fijos; el sistema real es roles arbitrarios + escalón Admin) ya está señalado en `colaboradores.md` — no se repite aquí como hallazgo nuevo.

## 2 · Objeción
1. **El aviso "Deja de ser líder" no dice que también se pierde el escalón Admin.** `CuentaConRol` (`apps/web/lib/roles-reglas.ts:46-53`) trae `tipo, id, nombre, ubicacion, rolId, esLider, estado` — **no `esAdmin`**. El aviso ámbar de `RolesModales.tsx:265-268` es genérico para cualquier líder: `cuenta.esLider && !destino.fijo`. Pero `fn_es_admin()` (producción, confirmado por SQL) exige **ser admin en Dynamic Y líder activo en retail** a la vez — perder el rol de líder apaga el escalón Admin en el acto. El candado `fn_exigir_otro_admin` (confirmado en el cuerpo real de `asignar_rol` en producción) sí impide dejar el ERP sin **ningún** Admin, pero **hoy hay 5 Admins activos** (`E3_admins_hoy` = 5, SQL de producción), así que ese candado no se activa: cualquiera de los 5 puede autoasignarse un rol no-líder y perder, sin aviso, su propia capacidad de subir/bajar líderes — hasta que otro Admin se lo devuelva. Es exactamente el escenario de la captura: "Gestión & Visión" tiene 1 de 30 módulos (`C1`, producción) — quien confirme ese modal pasa de ver y hacer todo a ver casi nada, y de Admin a nadie, con un solo clic y una sola línea de advertencia.
2. **El aviso rojo "Esa persona ya no figura de turno…" casi con certeza no pertenece a este modal, y la pantalla no dice a cuál acción sí.** Verificado en ambos lados: el frontend (`estadoCombo`, `lib/responsable-reglas.ts:130`) devuelve `"admin"` de forma incondicional cuando la sesión es Admin — nunca muestra una lista, nunca puede fallar por turno. El backend (`fn_actor_persona_id`, cuerpo real de producción) confirma la misma regla: `if coalesce(v_responsable, v_yo) = v_yo and fn_es_admin() then return v_yo` — sin mirar asistencia. El único camino real hacia el hint `responsable_no_presente` en esta pantalla es la **otra** acción que vive en el mismo panel: la barra fija "Guardar cambios" al editar los módulos de un rol (`RolesPanel.tsx`, alrededor de la línea 620, con su propio `responsable.motivo`), visible detrás del modal en la captura (el interruptor y "Quitar todo" de la lista de módulos). El aviso es un toast global (`Avisos.tsx`, `z-[100]`, montado una sola vez en `app/layout.tsx`) que se pinta por encima de cualquier `<Modal>` (`z-50`) y no se limpia al abrir uno nuevo. Nadie sin el código a la vista puede saber si ese error bloquea lo que está a punto de confirmar.

## 3 · Lo que está bien y no se toca
- **El motor de permisos en producción coincide con lo documentado, línea por línea.** El cuerpo real de `asignar_rol` trae los tres candados de ADR-0178 (`fn_es_admin()` para subir/bajar a un líder, `fn_exigir_otro_admin` antes de bajar a un líder, `fn_exigir_rol_dentro_de_lo_mio` para "solo das lo que tienes") y `fn_exigir_alcanzo_a` de la actualización del 2026-09-23 `[producción D3]`.
- **El historial firma con el responsable, no con la sesión.** `retail.fn_actor_persona_id(true)` en el `insert` final de `asignar_rol` `[producción D3]` — el parche vivo `20260923230000` se aplicó y se sostiene, a pesar de que la migración base (`20260923110000`) todavía trae `v_yo` en el texto: el patrón de "reemplazar sobre la definición viva" (que en otros casos perdió parches al recrear una función, ver memoria del repo) aquí funcionó como debía.
- **El rename `colaborador` → `integrante` (Paso 1, aditivo) ya está pegado en producción**: el cuerpo real de `asignar_rol` escribe `rol = 'integrante'`, lo que solo es posible si el CHECK ya acepta ese valor. El CLAUDE.md del repo (fecha del 2026-09-25) ya quedó desactualizado en este punto — dato para corregirlo, no un defecto de la pantalla.
- **RLS activo y sin huecos** en las 7 tablas de esta sección, todas con `relrowsecurity = true` `[producción D2]`; `E1` (tablas sin RLS) y `E2` (security definer sin `search_path`) salieron **vacíos** `[producción]`.
- **Vocabulario limpio**: `colaboradores.rol` solo tiene `colaborador` (17) y `lider` (8), ni un valor suelto `[producción E5]`; 0 personas suspendidas hoy.
- **El rol "Administrador" (a medida, reemplazado por el escalón Admin) quedó correctamente archivado** el 2026-09-23, con 0 cuentas — exactamente lo que promete ADR-0178 punto 5 `[producción C1]`.
- **El editor de un rol muestra "X de 30 módulos · Y cuentas" y coincide con la base**: Integrante 22/17, Gestión & Visión 1/0 `[visto]` = `[producción C1]`, sin desfase.
- **Ningún rol a medida activo tiene 0 módulos** (`E4` vacío) — el aviso "sin uso" de la lista (`avisoDelRol`, `roles-reglas.ts:275-280`) está cumpliendo su función preventiva.
- **Volumen minúsculo, sin riesgo de performance**: 6 roles, 49 filas en `rol_modulos`, 22 en `roles_historial` `[producción B1]`. A este ritmo (22 eventos en 5 días de construcción activa, bajando a casi cero en operación normal) faltan años para que importe un límite de paginación.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Coherente con el sistema (`card-cayla`, movimiento ADR-0136/0149); el mismo patrón "borde rojo = foco" de `colaboradores.md` se repite aquí | `[visto]` `[código]` |
| Lógica de negocio | 7 | El motor de candados es sólido; el aviso de autodegradación es incompleto (objeción 1) | `[código]` `[producción]` |
| Arquitectura | 9 | Cadena verificada extremo a extremo en producción; RLS y `search_path` limpios; concurrencia con `for update` | `[producción A-E]` |
| Funciones | 7,5 | Existen y funcionan (crear, duplicar, archivar, encender/apagar módulos con alcance, asignar); falta el resumen antes/después al asignar | `[código]` `[producción]` |
| Utilidad | 6 | El flujo normal es claro; el flujo de autodegradación de un Admin es peligrosamente fácil de confirmar sin entender la consecuencia | `[visto]` `[código]` |
| Conexión con el ERP | 8 | Frontera con Dynamic bien resuelta y con degradación documentada (`fn_es_admin()` falla a `false`, no a error) | `[código]` `[producción]` |

**Estética.** (a) Coherencia con CAYLA: `card-cayla`, chips por tono (`verde`=suma, `rojo/10`=quita, `ambar`=aviso, `pizarra`=admin) siguiendo la paleta oficial `[visto]` `[código RolesPanel.tsx:553]`. El movimiento (barra fija, colapso de grupos con `ease-cayla`, `anim-revelar`) respeta ADR-0136/0149, sin loop ni rebote `[código]`. Rojo usado con moderación en la pantalla en reposo (1 de los 2 permitidos: la barra vertical del rol elegido, `RolesPanel.tsx:720`). Pero el campo de nombre de un rol nuevo hereda `focus:border-rojo` en un campo vacío (`RolesModales.tsx:18`) — el mismo defecto que `colaboradores.md` ya señaló como una tarea raíz repetida, no uno nuevo. (b) Marca y tono: correcto y consistente con el resto del ERP. (c) Heurísticas: sin verificar contraste/tamaño táctil en esta pasada (no hay sesión en navegador con datos reales); nada saltó a la vista en la captura salvo el punto (a).

**Lógica de negocio.** El diseño (B1-B8 de ADR-0161 + los 5 puntos de ADR-0178) ya descartó explícitamente la alternativa de una matriz Ver/Crear/Editar/Eliminar por ser complejidad innecesaria para 3 tiendas y 1 taller — decisión razonable, no se vuelve a proponer. El hueco real es el de la objeción 1: **ninguna decisión escrita (ADR-0161/0178) contempla explícitamente "avisar la pérdida del escalón Admin al autodegradarse"** — es un vacío de especificación, no una regla violada. Referente (de memoria, sin verificar): los ERP grandes que separan "rol de negocio" de "escalón de sistema" (algo parecido a Admin vs. Líder aquí) casi siempre muestran una confirmación explícita de "vas a perder X capacidad" antes de un downgrade de ese tipo — dato no verificado contra ningún producto real.

**Arquitectura.** Cadena completa y verificada: `page.tsx` (guard) → `RolesPanel.tsx`/`RolesModales.tsx` → `lib/roles-acciones.ts` (llama la RPC directo, con `firmar()` agregando `x-responsable`/`x-ubicacion`) → `asignar_rol` (una sola función `plpgsql`, transacción única, `for update` en la fila del colaborador antes de escribir: dos asignaciones simultáneas al mismo `persona_id` se serializan, no se pisan). Estados imposibles: CHECK de `rol`, FK de `rol_id`, candado cruzado colaborador/suspendido, `roles_fijo_es_sistema` y `roles_sistema_no_se_archiva` en la tabla `roles` `[producción A2, no repetido aquí por espacio — confirmado en el volcado]`. Caída externa: `fn_es_admin()` y `fn_tiene_acceso_retail()` leen `public.personas` (Dynamic); el CLAUDE.md del repo ya documenta que `fn_es_admin()` se degrada a `false` sin error si esa fila falta — comportamiento correcto, heredado, no construido para esta pantalla en particular. Volumen: ver sección 3 (irrelevante para performance por años). Lente extra: **auditoría**, bien resuelta (`roles_historial` append-only, firma el responsable real, no la cuenta que ejecuta).

**Funciones.** Existen y funcionan, verificado en producción: crear rol, duplicar, renombrar, archivar/restaurar, encender/apagar módulos por grupo con "solo das lo que tienes", asignar rol a persona o terminal, ver los últimos eventos del historial. Fantasma: ninguna. Falta: el modal de asignación no resume "vas a ganar X módulos y perder Y" antes de confirmar — hoy solo hay un texto genérico de una línea para el caso "deja de ser líder", y nada para el caso general (bajar de un rol con 22 módulos a uno con 1, sin ser líder, tampoco avisa la magnitud del cambio). Sobra: nada.

**Utilidad.** Escenario 1 — un líder da de alta el rol "Vendedora de campaña" y se lo asigna a una nueva terminal: flujo claro, con candado de alcance si a quien lo hace le falta algún módulo que el rol pide. Sin dudas. Escenario 2 — el de la captura: un Admin, viendo "Eres admin: no necesitas autorización" (tranquilizador) y "Deja de ser líder: solo verá los módulos de «Gestión & Visión»" (informativo pero incompleto), confirma sin saber que también deja de ser Admin. Una persona sin el código a la vista —incluido el propio Felipe, a juzgar por la captura— no tiene cómo saberlo. Es un error de diseño, no de capacitación (principio 12 de este repo). Escenario 3 — ese mismo Admin ve un aviso rojo de "turno" mientras confirma una acción que su propia pantalla le dice que no necesita turno: contradicción visible, sin explicación de a qué pertenece.

**Conexión con el ERP.** Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Directo: decide quién administra líderes y roles. Indirecto: `rol_modulos` es la fuente de qué ve y hace CADA cuenta en TODO el ERP |
| Dinero y stock que toca | ×1 | 6 | Indirecto pero real: un rol mal armado puede dar a alguien acceso a caja, precios o descuentos sin que nadie lo note de inmediato |
| Frecuencia y personas que la usan | ×1 | 3 | Muy baja: 22 eventos de historial desde que existe (5-6 días de construcción activa), casi todos "modulos", no "asignacion" |
| Qué se detiene si falla | ×1 | 6 | No para la operación diaria de tienda, pero bloquea onboarding/promoción y, si un Admin se autodegrada mal, su propia capacidad de arreglarlo |

Relevancia = (2·9 + 6 + 3 + 6) / 5 = **6,6** — Soporte, al borde de Núcleo por el peso de la gestión indirecta.

## 6 · Conexión con el ERP
- **Aguas arriba:** `public.personas` de Dynamic (identidad, `rol = 'admin'`, asistencia/turno vía `fn_persona_presente`); `retail.modulos` (catálogo fijo de 38 módulos, 30 delegables).
- **Aguas abajo:** literalmente cada pantalla del ERP: `lib/menu.ts` (`permisosDe`), cada `fn_ve_modulo`/`fn_puede_*`, `requirePersonaActualV2`, y las funciones `fn_exigir_rol_dentro_de_lo_mio`/`fn_exigir_modulos_dentro_de_lo_mio` que gobiernan qué puede dar cada cuenta.
- **Pájaro dueño y vecinos:** Ganso (Módulo 01 · Identidad y acceso) — dueño de `roles`, `rol_modulos`, `roles_historial`, `colaboradores*` `[docs/datos/generado/AVIARIO.md]`. Vecino directo: la sección "Cuentas" de la misma pantalla (`colaboradores.md`), Terminales, y el combo Responsable que comparten Ventas/Caja/Inventario/Compras/Producción.
- **Externos y qué pasa si caen:** Dynamic (personas, asistencia) — degradación documentada y correcta (`fn_es_admin()` → `false` sin error). Ningún otro externo (SUNAT, Culqi, Shopify) toca esta pantalla.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — El aviso de autodegradación no dice que se pierde el escalón Admin
- **Dónde:** `apps/web/lib/roles-reglas.ts:46-53` (tipo `CuentaConRol`, falta `esAdmin`) · `apps/web/lib/roles.ts:69` (mapeo, falta traer `es_admin` de `fn_admins()`) · `apps/web/components/RolesModales.tsx:265-268` (el aviso)
- **Por qué en este puesto:** con 5 Admins hoy, cualquiera puede autodegradarse sin aviso y perder, con un clic, su capacidad de administrar líderes — el candado que existe (`fn_exigir_otro_admin`) protege al sistema, no a la persona.
- **Cómo lo verificas tú:** entra como Admin a "Roles y accesos", elige tu propia cuenta y un rol sin `fijo`; el modal debe mostrar, además del aviso ámbar actual, uno nuevo: "También dejarás de ser Admin: no podrás administrar líderes hasta que otro Admin te lo devuelva."
- **Esfuerzo / dependencias:** S · ninguna
- **DECIDÍ:** agregar `esAdmin` a `CuentaConRol` (ya existe `fn_admins()` en producción, solo falta enchufarlo) y un segundo aviso condicionado a `cuenta.esAdmin && !destino.fijo`. **DESCARTÉ:** bloquear la autodegradación del último… no, del ÚNICO Admin que la pide, porque `fn_exigir_otro_admin` ya lo hace en la base; duplicar el candado en el frontend sin el aviso no resuelve el problema real (falta de información, no falta de permiso). **SE ROMPE SI:** un Admin que administra 4 tiendas se autoasigna "Vendedora de campaña" un viernes a las 8pm sin darse cuenta de la consecuencia, y el lunes nadie recuerda pedirle a otro Admin que se lo devuelva.

### #2 · Corregir — El toast de error puede pertenecer a otra acción y no lo dice
- **Dónde:** `apps/web/components/ui/Avisos.tsx` (toast global, `z-[100]`) · `apps/web/components/RolesPanel.tsx` (barra fija "Guardar cambios", ~línea 620) · `apps/web/components/RolesModales.tsx:270` (`ComboResponsable` del modal)
- **Por qué en este puesto:** un error visible mientras se mira una acción distinta rompe la confianza en toda la pantalla — el principio 12 de este repo (el error es del diseño) aplica directo.
- **Cómo lo verificas tú:** edita los módulos de un rol con alguien fuera de turno como responsable propuesto, intenta guardar (falla con el aviso rojo), y sin cerrar el aviso abre "Asignar rol": el aviso viejo sigue flotando sobre el modal nuevo, sin relación visible con lo que hay adentro.
- **Esfuerzo / dependencias:** M · ninguna
- **DECIDÍ:** (a) limpiar los avisos de error activos al abrir cualquier `<Modal>`, o (b) incluir en el texto del aviso a qué acción pertenece ("al guardar los módulos de Integrante: esa persona ya no figura de turno…"). **DESCARTÉ:** dejarlo como está confiando en que el usuario infiera el origen por el momento en que aparece — ya falló una vez, en la propia captura que Felipe adjuntó. **SE ROMPE SI:** una encargada de sede, sin el código a la vista, ve ese aviso mientras confirma una asignación de rol y cancela por miedo a algo que no le corresponde.

### #3 · Mejorar — El modal "Asignar rol" no resume qué gana y qué pierde la cuenta
- **Dónde:** `apps/web/components/RolesModales.tsx:238-270` (`AsignarRolModal`)
- **Por qué en este puesto:** complementa la #1 para el caso general (no solo Admin): bajar de un rol con 22 módulos a uno con 1 hoy solo se explica con un texto genérico de una línea.
- **Cómo lo verificas tú:** al elegir un destino distinto del actual, el modal muestra una lista corta de "pierdes: Ventas, Caja, Inventario… · ganas: Existencias" antes de habilitar "Asignar rol".
- **Esfuerzo / dependencias:** M · no antes de la #1 (comparten el mismo componente y el mismo diff)

### #4 · Mejorar — Las condiciones de los avisos del modal viven inline en JSX, no en `roles-reglas.ts`
- **Dónde:** `apps/web/components/RolesModales.tsx:265` (`cuenta.esLider && !destino.fijo`, sin función propia) vs. `apps/web/lib/roles-reglas.ts:244` (`pideUbicacion`, sí es función pura y testeada)
- **Por qué en este puesto:** el propio patrón del archivo (una función pura por regla, con test) ya existe para una condición hermana; esta quedó afuera y es exactamente la que falla en la #1.
- **Cómo lo verificas tú:** existe `debeAvisarBajaDeLider(cuenta, destino)` en `roles-reglas.ts` con su prueba en `roles-reglas.test.ts`, y `RolesModales.tsx` solo la llama.
- **Esfuerzo / dependencias:** S · junto con la #1 (mismo cambio, más fácil de probar)

### #5 · Verificar — Confirmar que el chip "Admin" (ADR-0178) aparece en pantalla
- **Dónde:** `ColaboradoresPanel.tsx` / `RolesPanel.tsx` (no confirmado en esta pasada; el ADR promete el chip pero no lo verifiqué en el código ni en la captura)
- **Por qué en este puesto:** sin ese chip visible, nadie sabe hoy —sin correr SQL como tuve que hacer yo— cuántos Admins hay ni quiénes son; es la única forma de detectar a simple vista el riesgo que describe la #1.
- **Cómo lo verificas tú:** entra a Colaboradores ▸ Cuentas con una cuenta Admin visible en la lista y confirma si el chip está ahí; si no está, se vuelve Corregir.
- **Esfuerzo / dependencias:** S (verificación) → si falta, S-M (agregarlo)

### #6 · Mejorar — Enlazar con `colaboradores.md`: el borde rojo de foco se repite aquí
- **Dónde:** `apps/web/components/RolesModales.tsx:18` (`focus:border-rojo` en un campo vacío) — mismo defecto que `colaboradores.md` sección 4 ya documentó en `ColaboradoresModales.tsx`/`ColaboradoresPanel.tsx`
- **Por qué en este puesto:** es la segunda pantalla con el mismo patrón — según la propia regla de este skill, dos apariciones ya justifican tratarlo como una tarea raíz compartida, no dos independientes.
- **Cómo lo verificas tú:** abrir "Nuevo rol" con el campo de nombre vacío: el borde nace rojo, indistinguible de un error.
- **Esfuerzo / dependencias:** S · resolver junto con la tarea equivalente de `colaboradores.md` (un solo cambio en el token de foco, no dos)

### #7 · Mejorar — Sin búsqueda en la lista de roles del panel izquierdo
- **Dónde:** `apps/web/components/RolesPanel.tsx` (barra lateral de roles; hay buscador de módulos dentro de un rol, no de roles en la lista)
- **Por qué en este puesto:** bajo valor hoy (6 roles), pero crece si CAYLA arma roles por campaña o temporada.
- **Cómo lo verificas tú:** con más de ~10 roles a medida, sigue sin haber forma de filtrar la lista de la izquierda.
- **Esfuerzo / dependencias:** S · bajo valor / futuro

### #8 · Mejorar — Historial de roles sin paginación ni filtro
- **Dónde:** `apps/web/lib/roles.ts` (lectura del historial) — límite no confirmado en el código, inferido del volumen y de la ausencia de "ver más" en la captura
- **Por qué en este puesto:** con 22 eventos hoy no molesta; sin límite visible, en un par de años de operación normal sí.
- **Cómo lo verificas tú:** pasar de ~50-100 eventos y comprobar si la pantalla sigue mostrando todos o corta en silencio.
- **Esfuerzo / dependencias:** S · bajo valor / futuro `[inferido]`

### #9 · Mejorar — "X de 30 módulos" no explica qué son los 8 que faltan
- **Dónde:** `apps/web/components/RolesPanel.tsx:485` (`Ve {veCuantos} de {DELEGABLES} módulos que se pueden dar`)
- **Por qué en este puesto:** alguien sin contexto técnico puede preguntarse por qué nunca llega a "30 de 30" aunque encienda todo — los 8 restantes son "solo líder", invisibles en ese número.
- **Cómo lo verificas tú:** encender todos los módulos delegables de un rol y comprobar que el contador no menciona los 8 que quedan fuera ni por qué.
- **Esfuerzo / dependencias:** S · bajo valor / opcional

### #10 · Mejorar — Sin doble confirmación al bajar a un rol muy vacío
- **Dónde:** `apps/web/components/RolesModales.tsx:271-277` (botón "Asignar rol", sin paso extra)
- **Por qué en este puesto:** complementa la #1 y la #3 — para un cambio con consecuencia grande (de 22 módulos a 1), el mismo patrón de un clic que para un cambio trivial (de Integrante a Terminal de ventas) no distingue el riesgo.
- **Cómo lo verificas tú:** bajar una cuenta a un rol con 0-2 módulos y comprobar si el flujo pide algo más que el clic normal.
- **Esfuerzo / dependencias:** M · no antes de la #3

### #11 · Mejorar — El nombre "Gestión & Visión" no explica su propósito
- **Dónde:** `retail.roles` (dato, no código) — rol a medida con 1 módulo, 0 cuentas, creado el 2026-09-25 (`roles_historial`)
- **Por qué en este puesto:** bajo valor técnico, pero un nombre vago en un rol con solo 1 módulo encendido sugiere que puede ser un experimento sin archivar — vale la pena que Felipe confirme si sigue en uso o se archiva.
- **Cómo lo verificas tú:** preguntarle a Felipe si "Gestión & Visión" sigue siendo un rol real o quedó de una prueba.
- **Esfuerzo / dependencias:** — (decisión de Felipe, no de código) · bajo valor / opcional

### #12 · Mejorar — Sin resumen de "cuántos Admin hay" en ninguna pantalla
- **Dónde:** no existe una vista dedicada; hoy solo se puede saber con SQL directo a producción (como tuve que hacer para este análisis)
- **Por qué en este puesto:** de menor urgencia porque hoy son 5 (margen cómodo), pero es la raíz de por qué nadie iba a notar el riesgo de la #1 sin este análisis.
- **Cómo lo verificas tú:** buscar en la web cualquier lugar que diga "hoy tienes N Admins"; no debería encontrarse ninguno.
- **Esfuerzo / dependencias:** S-M · bajo valor / futuro (se vuelve más urgente si el número baja de 3)

## 8 · Estrategia alternativa
No existe una alternativa estructural mejor que valga la pena plantear. El diseño actual (roles por módulo + escalón Admin leído de Dynamic + "solo das lo que tienes" + "solo alcanzas a quien está por debajo") ya evaluó y descartó explícitamente la alternativa obvia — una matriz Ver/Crear/Editar/Eliminar por pantalla — por complejidad innecesaria para 3 tiendas y 1 taller (B2, ADR-0161). No hay tarea "Replantear" entre las 12: lo que falla es comunicación puntual (objeciones 1 y 2), no la arquitectura del permiso.

## 9 · Referentes de ERP y futuro
Lo único que pasó el filtro "¿le sirve a 3 tiendas y 1 taller hoy?" y quedó fuera de las 12 por ser genuinamente futuro: un log de auditoría específico para cambios al escalón Admin (quién subió/bajó a quién de Admin, separado del historial general de roles) — útil cuando el equipo de sistemas crezca más allá de las 4 personas actuales, prematuro hoy. **De memoria, sin verificar contra ningún producto real:** varios ERP separan el "rol de negocio" (qué pantallas ves) del "rol de sistema" (quién administra usuarios) en dos pantallas distintas en vez de mezclarlos en una — CAYLA ya casi lo hace (Admin es un concepto aparte, leído de Dynamic) pero no tiene vista propia; ver tarea #12.

## 10 · Fuera de esta pantalla
El escalón Admin no tiene ninguna vista de gobierno en todo el ERP — ni aquí, ni en Colaboradores, ni en ningún reporte. Para escribir la objeción #1 de este análisis tuve que consultar producción con SQL directo porque no hay otra forma de saber cuántos Admin existen hoy. Si ese número baja (por renuncias, por reorganización del equipo de sistemas) sin que nadie lo esté vigilando activamente, CAYLA puede llegar al último Admin sin que ninguna pantalla lo haya avisado antes — el candado `fn_exigir_otro_admin` frena la última operación, pero nadie ve venir que se acerca.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:colaboradores-roles]` #1 El modal de asignar rol no avisa la pérdida del escalón Admin al autodegradarse de Líder — S
- [ ] `[pantalla:colaboradores-roles]` #2 El toast de error de turno puede pertenecer a otra acción de la misma pantalla y no lo dice — M
- [ ] `[pantalla:colaboradores-roles]` #3 El modal de asignar rol no resume qué módulos gana/pierde la cuenta — M
- [ ] `[pantalla:colaboradores-roles]` #4 Extraer los avisos del modal de roles a `roles-reglas.ts` puro y testeado — S
- [ ] `[pantalla:colaboradores-roles]` #5 Verificar si el chip «Admin» (ADR-0178) está construido y visible — S
- [ ] `[pantalla:colaboradores-roles]` #6 Unificar con `colaboradores.md`: borde rojo de foco en campo vacío, ahora en 2 pantallas — S
- [ ] `[pantalla:colaboradores-roles]` #12 Sin ninguna vista que muestre cuántos Admin hay hoy — S-M

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Sidebar de roles | Tarjeta de rol con barra de progreso | "X de 30 módulos · Y cuentas", coincide con producción | bien | `[visto]` `[producción C1]` |
| Sidebar de roles | Sección "A MEDIDA" | Agrupa roles no-sistema, no-terminal | bien | `[código roles-reglas.ts:265-271]` |
| Modal Asignar rol | Campo Cuenta | Elegir persona/terminal (aquí fijo: `rolFijo`) | bien | `[código RolesModales.tsx:238-248]` |
| Modal Asignar rol | Campo Sede donde queda | Solo si baja a un líder sin ubicación propia | bien | `[código roles-reglas.ts:244-246]` |
| Modal Asignar rol | Aviso ámbar "Deja de ser líder" | Avisa la baja de líder | ajustar | `[código RolesModales.tsx:265-268]` — objeción 1 |
| Modal Asignar rol | Aviso "Eres admin" | Tranquiliza sobre el candado de turno | bien, pero incompleto junto al de arriba | `[código ComboResponsable.tsx:105-114]` |
| Modal Asignar rol | Botón "Asignar rol" | Envía la RPC, cierra si la base acepta | bien | `[código RolesModales.tsx:275-277]` |
| Fondo (detrás del modal) | Toast rojo "ya no figura de turno" | Avisa un `responsable_no_presente` — de OTRA acción | ajustar | `[visto]` `[código]` — objeción 2 |
| Editor de rol | Buscador de módulos | Filtra por texto dentro del rol elegido | bien | `[código RolesPanel.tsx:600-611]` |
| Editor de rol | "Encender todo" / "Quitar todo" | Solo mueve lo que el actor puede dar (ADR-0178) | bien | `[código RolesPanel.tsx:494-500]` |
| Editor de rol | Barra fija "Guardar cambios" | Su propio `responsable`, candado de asistencia | bien, pero es la fuente probable del toast cruzado | `[código RolesPanel.tsx:~620]` — objeción 2 |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-27 | completo | 7,4/10 | 6,6/10 — Soporte | — (primer análisis de esta sección) |
