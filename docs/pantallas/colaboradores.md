# Pantalla — Colaboradores (`/colaboradores`)

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder, Tienda TRU (la pantalla no depende de la sede) · Datos: real (SQL de producción: estructura, volumen, RLS, grants, funciones, consistencia; **sin resultado de cajas abiertas**, ver «Datos pendientes»)
> SHA analizado: `b6b85206` (origin/main) — si esos archivos cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/colaboradores/page.tsx` · `apps/web/components/ColaboradoresPanel.tsx` · `ColaboradoresTablas.tsx` · `ColaboradoresModales.tsx` · `components/ui/MenuAcciones.tsx` · `lib/colaboradores.ts` · `lib/colaboradores-reglas.ts` · `lib/colaboradores-acciones.ts` · migraciones `20260922100000` y `20260922110000` · RPC `fn_colaboradores*`, `fn_dynamic_disponibles`, `agregar_colaborador(es)`, `suspender_/reactivar_/quitar_colaborador`, `cambiar_ubicacion_colaborador`, `fn_historial_colaborador` · tablas `retail.colaboradores`, `colaboradores_suspendidos`, `colaboradores_historial`
> Otra sesión tocándola: no. `docs/SESIONES-ACTIVAS.md` aún lista `claude/colaboradores-rediseno` y `claude/colaboradores-auditoria`, pero sus commits (`71c6904b`, `1f41ea9a`) ya están en `main`: son filas por limpiar, no trabajo en curso.
> **Re-análisis.** El de `bda4a16a` (2026-09-21) quedó **vencido**: la pantalla se rehízo (ADR-0148) y sus tres archivos cambiaron (+312/−190). No se tomó como base; solo se marcó qué de sus 12 tareas se cerró.

## 0 · Veredicto
La puerta está bien construida: solo líder, escritura solo por RPC, historial que no se puede editar, y producción coincide con lo que promete el ADR-0148. Lo que falla es lo que la rodea: suspender no mira la caja que la persona dejó abierta, «Último ingreso» miente sobre qué mide, y el rol de líder tiene el alcance global que la decisión D-14 dice que no debe tener.
**Cumple su finalidad:** 7,3/10 · **Relevancia:** 6,2/10 — Soporte

## 1 · Finalidad declarada
"Esta pantalla existe para decidir a quién de Dynamic se le abre la puerta de retail, a qué ubicación queda fijo si entra como Colaborador, y dejar escrito quién lo decidió."
Fuente: `docs/datos/modulos/01-identidad-y-acceso.md` (encabezado y mapa; **avisa que describe V1**, por eso no lo cito como vigente), `docs/adr/0145` y `0148`, y las reglas R-49 y D-12/D-13/D-14. ¿Coinciden docs y pantalla? **Parcialmente, y el desajuste es hallazgo:** D-12 define **cuatro** niveles (Admin · Líder de equipo · Integrante · Solo lectura) con vocabulario «Líder de equipo / Integrante» y D-14 dice que el líder «manda en su sede, y puede cubrir otra temporalmente». La pantalla y la base manejan **dos** niveles (`lider` / `colaborador`), el líder ve «cualquiera» como ubicación, y no existe el permiso temporal. Manda el código y producción para el estado de hoy; la decisión escrita dice adónde ir.

## 2 · Objeción
1. **Suspender y Quitar no miran la caja abierta.** Ni `suspender_colaborador` ni `quitar_colaborador` consultan `retail.cajas` `[código migración 20260922110000 l.242-274, l.337-363]`. Un índice parcial permite **una sola caja abierta por ubicación** `[producción: diccionario, «cajas_ubicacion_abierta_unica»]`: si se suspende a quien abrió la caja de Tienda TRU a medio turno, esa caja queda abierta a nombre de alguien que ya no puede entrar y **nadie puede abrir otra en esa sede** hasta que un líder la cierre. El BACKLOG ya lo anota como «decisión abierta» y nadie lo resolvió; la pantalla ya está en producción. No sé cuántas cajas así hay hoy (falta el dato).
2. **Suspender está en producción sin que nadie haya comprobado que corta el acceso de verdad.** El BACKLOG lo deja sin marcar («probar el ingreso con su cuenta»). Las 67 comprobaciones se hicieron en PGlite con un esquema *imitado* `[código ADR-0148, «Cómo se verificó»]`, y la prueba de `scripts/pruebas/` contra el Postgres real no existe para esta migración (y la de la anterior falla con `no rows returned for \gset`, BITACORA l.272). Todo el diseño descansa en «un suspendido no está en la tabla, luego no entra por ningún camino»; probable, pero hoy es una afirmación, no una comprobación.
3. **«Último ingreso» no dice lo que parece.** Es `auth.users.last_sign_in_at` `[código migración l.377]`: el último inicio de sesión **en Dynamic**, que comparte cuenta con retail. En la captura, [colaborador] con «Desde 16/09/2026» tiene «Último ingreso 24/08» y otra «14/08» `[visto]`: entraron **antes de existir en retail**. El líder lee «ya usó el sistema» donde solo significa «alguna vez abrió Dynamic». Además la fecha no lleva año.
4. **El líder tiene alcance global; la decisión escrita dice «en su sede».** D-14 `[DECISIONES-2026-09-12]` frente a `cualquiera` en 9 de 9 líderes `[visto]` y `fn_es_lider()` sin mirar ubicación `[código 0016]`. Con D-13 (cerrar caja, ajustar stock, gastos) cada uno de esos 9 puede hacerlo en cualquier sede, y la pantalla no permite cambiar a nadie de rol. Quedan sin resolver los 9 que salieron del backfill «Líder para todos» (`sin_agregado_por = 9` `[producción E4]`).

## 3 · Lo que está bien y no se toca
- **Producción coincide con el ADR-0148.** Las 3 tablas, sus 16 constraints, los 4 triggers y las 15 funciones existen `[producción A1, A2, D4]`. La BACKLOG dice que la migración `20260922110000` no está pegada; **está** (tablas y RPC existen, la pantalla nueva funciona en las capturas): el BACKLOG está desactualizado.
- **RLS activo en las 3 tablas, solo política de SELECT con `fn_es_lider()`** `[producción D1, D2]`; ninguna tabla sin RLS `[E1]`.
- **Escritura directa cerrada:** `authenticated` solo conserva SELECT en las 3 tablas `[producción D3]`; las 15 funciones son `security definer` con `search_path` fijo `[D4, E2 vacío]` y **ninguna ejecutable por `anon`** `[D4]`.
- **Historial inmutable:** trigger `BEFORE UPDATE/DELETE` sobre `colaboradores_historial` `[producción A2]`; `fn_historial_colaborador` sin permiso para nadie `[código migración l.153-167]`.
- **Candado cruzado:** dos triggers `BEFORE INSERT` impiden estar en `colaboradores` y en `colaboradores_suspendidos` a la vez; hoy 0 personas en ambas `[producción A2, E3]`.
- **Invariantes limpios hoy:** 0 colaboradores sin ubicación, 0 en ubicación inactiva, 0 accesos sin cuenta de ingreso `[producción E3, E4]`; 25 accesos vigentes y 25 eventos en el historial (16 altas con autor, 9 sembradas sin autor) `[producción B1, C1]`: cada acceso vigente tiene su alta escrita.
- **Cada RPC es una sola transacción con `for update`** donde hay carrera (suspender, reactivar, cambiar ubicación) y errores en español que dicen qué hacer `[código migración]`. No te puedes suspender ni quitar a ti mismo, así que nunca queda sin líder `[código l.256, l.351]`.
- **R-49 se cumple:** quien cesa en Dynamic deja de entrar sola, porque las funciones de acceso exigen `estado = 'activo'` `[código 0013, 0016]`.
- **Copy de los modales de Suspender y Quitar:** explica la diferencia (reversible vs. baja definitiva) y qué usar en cada caso `[visto]`. No se toca.
- Modales sobre `<Modal>` (ADR-0136), sin overlay propio `[código]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente y limpia; «Colaboradores» nombra dos cosas, foco en rojo que parece error, contraste al filo | `[visto]` `[código]` |
| Lógica de negocio | 6,5 | Suspender ignora la caja; «Último ingreso» engañoso; alcance del líder contra D-14 | `[código]` `[producción]` |
| Arquitectura | 8,5 | Cadena sólida y verificada en producción; sin prueba real del corte de acceso | `[producción A-E]` |
| Funciones | 7 | Falta cambiar rol, filtrar/paginar Actividad, avisar de caja | `[código]` |
| Utilidad | 7 | Recorrido claro de alta y baja; la columna de ingreso induce a error | `[visto]` |
| Conexión con el ERP | 7,5 | Frontera limpia con Dynamic; el vínculo con Caja no existe | `[código]` `[producción]` |

**Estética.** (a) Coherencia con CAYLA: crema, tinta, serif en títulos, chips de rol y tarjetas del sistema; comparable a Catálogo y Facturación `[visto]`. `MAX_ROJO_POR_PANTALLA = 2`: la vista principal casi no usa rojo (el «Suspender» del menú y el resto van en tinta), lo cual está bien `[visto]`. Pero el campo de motivo del modal de Suspender aparece con **borde rojo** apenas se abre `[visto]`, y el rojo en un campo vacío se lee como «error», no como foco `[código ColaboradoresModales.tsx:14, Panel:33 `focus:border-rojo`]`. El botón «Sí, quitar acceso» lleva `bg-rojo` en el código `[código Modales:289]` pero en la captura sale oscuro `[visto]`: la clase compite con la del botón primario y pierde `[inferido]`. (b) Marca y tono: correcto, con dos tropiezos: «reactivarla» y «agregarla» en femenino para [colaborador] de cualquier género `[visto]`, y la palabra «Colaboradores» es a la vez el título (25 personas, líderes incluidos), la tarjeta y el filtro (16, sin líderes) `[visto]`. (c) Heurísticas: placeholders a `tinta/55` (~3,8:1, bajo 4,5:1) `[código Panel:33, Modales:14]` `[inferido]`; cabeceras de tabla a 11 px `[código Tablas:21]`; el botón «⋯» mide 36×36 px, bajo los 44 px táctiles `[código MenuAcciones:338]`; fechas sin año («24/08 11:36») `[visto]`. El selector «TIENDA TRU» de la cabecera no hace nada aquí (la pantalla no filtra por sede) `[visto]` `[código page.tsx]`: control ilusorio.

**Lógica de negocio.** Cita de reglas: R-49 (cesado no entra) ✔; D-13 y D-14 (líder y su alcance) ✘ en el alcance; D-12 (cuatro niveles) no implementado (no hay Admin ni Solo lectura). **Ninguna decisión escrita cubre el caso de la caja abierta de quien pierde el acceso**, ni qué debe pasar. Otros hallazgos: (i) no hay forma de cambiar el rol desde la pantalla, y hacerlo por SQL **no deja evento** en el historial (`por` sería nulo y el CHECK de `accion` no tiene «rol») `[código l.113-127]`; (ii) «Desde» de los 9 líderes (12/09/2026) es la fecha del backfill, no su alta real `[visto]` `[producción E4]`; (iii) reactivar a un colaborador cuya ubicación se desactivó falla y el mensaje manda a quitarlo y agregarlo de nuevo, perdiendo la fecha y partiendo el historial `[código l.277-304]`. Referentes (de memoria, sin verificar contra los productos): los ERP grandes ligan la baja de un usuario con sus sesiones o turnos abiertos y guardan quién aprobó cada cambio de permisos; a 3 tiendas y 1 taller solo importa lo primero (#1) y lo segundo ya está (historial).

**Arquitectura.** Cadena: `page.tsx` (guard `requirePersonaActualV2`, solo líder, l.14-15) → 6 lecturas en `Promise.all` → panel cliente → `lib/colaboradores-acciones.ts` **llama las RPC directo desde el navegador** (no hay server actions), así que la única puerta es la RPC `[código]`, y está bien puesta (D4). Estados imposibles: PK por persona, CHECK de rol, CHECK de ubicación para colaborador, candado cruzado, historial inmutable `[producción A2]`. Transacción: cada RPC es una sola función plpgsql (suspender: `delete` + `insert` + historial, todo o nada). Concurrencia: `for update` y errores «actualiza la pantalla» cuando dos líderes chocan `[código]`. **Caída externa:** sin APIs externas; si Dynamic no responde es la misma base: se degrada cerrando la puerta, sin perder datos. **Volumen:** 25 accesos y 25 eventos hoy `[producción B1]`. Estimo 60–100 eventos por año con la rotación de 4 ubicaciones `[inferido]`, o sea el tope de 100 eventos de la pestaña Actividad (`fn_colaboradores_actividad`, `least(...,500)`, la web pide 100) se alcanza en 1–2 años y **no hay «ver más»** `[código Tablas ListaActividad l.216]`. Debilidades: las tres lecturas hacen `join auth.users` (interno): una persona con acceso pero sin cuenta de ingreso desaparecería de las listas y de las tarjetas; hoy son 0 `[producción E3]`, pero `agregar_colaborador` no lo exige `[código l.179-212]` (principio 2). `TRUNCATE` sobre el historial no lo cubre el trigger, aunque solo el dueño podría `[código l.137-150]` `[producción D3]`. Lentes extra: **auditoría** (bien resuelta) y **datos personales** (nombre y correo visibles solo para líder, RLS de SELECT; no se copia nada a disco en este análisis).

**Funciones.** Existen y funcionan (código y producción coinciden): listar en 3 estados, buscar y filtrar por rol, alta de varias a la vez (máx. 50, todo o nada), suspender con motivo, reactivar, cambiar ubicación, quitar con confirmación, Actividad. **Fantasma:** ninguna en el sentido de botón sin lógica; sí una **promesa a medias**: la nota de «Inactivas en Dynamic» dice que recuperan su acceso solas `[código Panel:218]`, cierto para las que estaban activas, pero una persona suspendida que Dynamic reactiva vuelve a **Suspendidos**, no a Activos. **Faltan:** cambiar el rol, aviso de caja abierta, buscar/filtrar Actividad, historial de una sola persona, alta de un Líder de equipo. **Sobran:** nada.

**Utilidad.** Escenario 1 — una colaboradora nueva llega a Tienda TRU el lunes: el líder abre «Agregar colaboradores», busca su cuenta, elige la ubicación y la pantalla explica «Entran como Colaborador, fijos a esta ubicación»; sin dudas `[visto]`. Si no aparece en la lista, la bajada dice que primero debe existir en Dynamic `[visto]`. Escenario 2 — cesa una colaboradora con la caja del día abierta: el líder toca «⋯ → Suspender acceso», el modal promete «perderá el acceso de inmediato», pero **no le dice que su caja sigue abierta** y la sede no podrá abrir otra `[código]`. Duda real, del diseño. Escenario 3 — ¿la nueva ya entró? El líder mira «Último ingreso» y ve una fecha de agosto para alguien dada de alta en septiembre `[visto]`: no sabe si ya usó retail. Escenario 4 — rota de tienda: «Cambiar ubicación» resuelve sin perder fecha ni historial ✔ (no aparece en la captura porque se abrió el menú de un líder, que no la tiene).

**Conexión con el ERP.** Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Directo: decide quién opera y dónde. Indirecto: `ubicacion_asignada_id` es la sede de cada venta y caja de la persona y `rol` decide quién cierra caja y ajusta stock (D-13) |
| Dinero y stock que toca | ×1 | 6 | No los mueve; es la llave de quien sí puede (cerrar caja, ajustar stock, compras) |
| Frecuencia y personas que la usan | ×1 | 2 | Solo líderes y solo cuando hay altas, bajas o rotaciones |
| Qué se detiene si falla | ×1 | 7 | Un alta caída deja a la persona sin poder trabajar el primer día; una baja caída deja la puerta abierta a quien ya no debe entrar |

Relevancia = (2·8 + 6 + 2 + 7) / 5 = **6,2** → Soporte.
Cumple = promedio de las seis = (7 + 6,5 + 8,5 + 7 + 7 + 7,5) / 6 = **7,3**. **No aplica el tope de 5:** el defecto que más se acerca a dinero (caja abierta de una persona suspendida) no destruye ni corrompe nada —el líder puede cerrarla (ADR-0143) y el diseño no pierde datos—, pero sí bloquea abrir caja en esa sede. Si el SQL de cajas pendiente devolviera casos con días de antigüedad, o si `cerrar_caja` no pudiera cerrarse por otra persona, el tope sí aplicaría.

## 6 · Conexión con el ERP
- **Aguas arriba:** `public.personas` (estado, sede base) y `auth.users` (correo, último inicio de sesión) de Dynamic; `retail.ubicaciones`. Todo en la misma base.
- **Aguas abajo:** todo. `fn_tiene_acceso_retail` y `fn_es_lider` deciden el RLS de cada tabla de retail; `fn_ubicacion_actual_persona` decide la sede de cada colaborador; `/vender/historial` arma su filtro «vendedor» con activos + suspendidos + inactivos (ADR-0148 #8) `[código]`; Caja (cierre y ajuste solo líder, ADR-0143) depende del `rol` que se fija aquí. **Lo que no existe: ningún vínculo entre esta pantalla y `retail.cajas.abierta_por`** (ver #1).
- **Pájaro dueño y vecinos:** Ganso (Identidad y acceso), `docs/datos/generado/AVIARIO.md`. Vecinos: Caja/Colibrí (cierre de turno), Ajuste de stock, Compras y Producción (solo líder).
- **Externos, y qué pasa si caen:** ninguno. La costura con Dynamic vive en la misma base: si Dynamic desactiva a alguien, retail lo deja de reconocer en la siguiente petición y la persona pasa a «Inactivas en Dynamic» sin perder su fila. Si Dynamic no responde, nadie entra a retail, y ningún dato se pierde.

## 7 · Las 12 tareas, por importancia
### #1 · Corregir — Suspender y Quitar avisan de la caja abierta, y un líder la cierra desde ahí
- **Dónde:** `suspender_colaborador` y `quitar_colaborador` (migración `20260922110000` l.242-274 y l.337-363) leen `retail.cajas` (`estado = 'abierta'` y `abierta_por = persona`); `ColaboradoresModales.tsx` (`SuspenderModal` l.155, `QuitarAccesoModal` l.255) muestran el aviso «Tiene la caja de [ubicación] abierta desde [fecha]; ciérrala antes o la sede no podrá abrir otra».
- **Por qué en este puesto:** es el único hallazgo que toca dinero: caja abierta a nombre de alguien sin acceso, y sede bloqueada por el índice `cajas_ubicacion_abierta_unica`. La decisión sobre *bloquear o solo avisar* es de negocio y está pendiente en el BACKLOG. Sin esto, pasa el primer día que se suspende a alguien a mitad de turno.
- **Cómo lo verificas tú:** con una persona de prueba, abre una caja en una ubicación de prueba, suspéndela desde la pantalla: el modal advierte de la caja y cuál es; después de cerrarla, suspender pasa sin aviso. Con la consulta de «Datos pendientes» sale 0 filas.
- **Esfuerzo / dependencias:** M · migración con tu ok antes de pegarla (con `retail.`); antes, decide tú «avisar» o «impedir» (recomiendo avisar y dejar pasar: bloquear dejaría a un líder sin poder cortar un acceso urgente).

### #2 · Corregir — Comprobar de verdad que un suspendido no entra, y dejarlo como prueba automática
- **Dónde:** `scripts/pruebas/colaboradores_suspender.mjs` (nueva, contra el Postgres local) + paso en `ci.yml`; arreglar el montaje de `colaboradores_endurecimiento.mjs` (falla en `\gset`, BITACORA l.272).
- **Por qué en este puesto:** Suspender ya corre en producción sobre una verificación con esquema imitado. Si una de las ocho funciones que leen acceso (`registrar_venta`, stock por sede, perfil…) sigue viendo al suspendido, opera con una llave que se creía cortada. Es una comprobación barata de un candado de seguridad (principio 2).
- **Cómo lo verificas tú:** (a) ahora, a mano: suspende a una cuenta de prueba, abre una ventana privada con esa cuenta y confirma que la redirigen/deniegan en Punto de Venta, Caja e Inventario; (b) `pnpm pruebas:colaboradores-suspender` en verde con Docker.
- **Esfuerzo / dependencias:** M · ninguna. La parte (a) es de 10 minutos y no exige código.

### #3 · Corregir — «Último ingreso» dice a Dynamic, y lleva el año
- **Dónde:** `ColaboradoresTablas.tsx:99` (cabecera y celda) y `lib/colaboradores-reglas.ts:91` (`ultimoAccesoTexto`); a futuro, `fn_colaboradores` l.368-386 para leer el último uso de retail.
- **Por qué en este puesto:** el dato lo usa el líder para saber quién ya entró y quién está dormida; hoy responde otra pregunta. Barato ahora (renombrar y añadir año), mejor después (último uso real).
- **Cómo lo verificas tú:** la cabecera dice «Último ingreso a Dynamic» y las fechas traen año; a futuro, [colaborador] recién agregada muestra «Aún no usa retail» hasta su primera venta o movimiento.
- **Esfuerzo / dependencias:** S para la etiqueta, M para «último uso en retail» (leer `ventas.usuario_id` / `movimientos`) · ninguna. Recomiendo hacer solo la S ahora.

### #4 · Mejorar — Cambiar el rol Líder ↔ Colaborador desde la pantalla, con historial
- **Dónde:** RPC nueva `cambiar_rol_colaborador(persona, rol, ubicacion)` solo líder, sin poder cambiarse a sí mismo ni dejar a la sede sin líder; ampliar el CHECK `colaboradores_historial_accion_check` (`accion in (… , 'rol')`); acción «Cambiar rol» en el menú «⋯».
- **Por qué en este puesto:** hoy 9 de 9 líderes salieron de un backfill y bajar o subir a alguien exige entrar a la base (D-11), sin dejar evento. Con D-13, ser líder es poder cerrar caja y ajustar stock.
- **Cómo lo verificas tú:** cambia a una persona de prueba de Colaborador a Líder y de vuelta; el historial de Actividad muestra los dos cambios con quién los hizo.
- **Esfuerzo / dependencias:** M · **no antes de la #12** (conviene decidir primero el alcance del líder), y migración con tu ok.

### #5 · Corregir — Copy sin género y sin promesas falsas
- **Dónde:** `ColaboradoresModales.tsx` (textos de Suspender/Quitar: «reactivarla», «agregarla»), `ColaboradoresPanel.tsx:218` (nota de «Inactivas»), encabezados «Sede en Dynamic» / «Ubicación asignada» (`Tablas` ~l.96-97).
- **Por qué en este puesto:** el género asumido por el nombre es un error real y visible en cada modal; la nota de «Inactivas» promete algo que no siempre pasa; las dos columnas de sede siguen sin explicación (era la #11 del análisis anterior y quedó abierta).
- **Cómo lo verificas tú:** los modales usan «volver a darle acceso» / «reactivar el acceso»; la nota de «Inactivas» dice que al reactivarse en Dynamic vuelve a la pestaña donde estaba; una nota o tooltip bajo las cabeceras aclara «Sede en Dynamic = donde figura en planilla; Ubicación asignada = donde puede vender».
- **Esfuerzo / dependencias:** S · ninguna.

### #6 · Corregir — Contraste, foco y tamaño táctil
- **Dónde:** `ColaboradoresPanel.tsx:33` y `ColaboradoresModales.tsx:14` (placeholder `tinta/55` → `/65`, foco `focus:border-rojo` → foco de tinta); `Tablas:21` (cabeceras 11 px → 12 px); `MenuAcciones.tsx:338` (`h-9 w-9` → 44 px en táctil).
- **Por qué en este puesto:** el borde rojo del motivo se lee como error en un campo opcional; ADR-0012 fija el piso de contraste; el «⋯» es la puerta de toda acción por fila y en tableta cuesta acertarlo.
- **Cómo lo verificas tú:** el campo de motivo enfocado no se ve rojo; en devtools el placeholder pasa 4,5:1; el «⋯» mide 44 px de alto en pantalla táctil.
- **Esfuerzo / dependencias:** S · ninguna.

### #7 · Mejorar — Actividad: buscar por persona o acción, y «ver más»
- **Dónde:** `fn_colaboradores_actividad` (migración l.431-450, hoy solo `p_limite`) → añadir cursor (`p_antes`) o filtro; `ListaActividad` (`Tablas` ~l.216) con buscador y botón «Ver más». Agrupar altas hechas en el mismo minuto por la misma persona («dio acceso a 16 personas») en vez de 16 líneas iguales `[visto]`.
- **Por qué en este puesto:** hoy no hay problema (25 eventos), pero el tope de 100 se alcanza en 1–2 años y en la captura ya se ve que un alta masiva ocupa media pantalla.
- **Cómo lo verificas tú:** con 120 eventos de prueba, «Ver más» trae los siguientes; el buscador filtra por nombre.
- **Esfuerzo / dependencias:** M · después de #1, #2 y #3.

### #8 · Corregir — El alta exige cuenta de ingreso; las listas no esconden a nadie
- **Dónde:** `agregar_colaborador` (migración l.179-212) añade `auth_user_id is not null`; `fn_colaboradores*` (l.368-429) pasan a `left join auth.users`.
- **Por qué en este puesto:** hoy es 0 casos `[producción E3]`, así que no urge, pero el estado imposible «tiene acceso y no aparece en ninguna lista ni en las tarjetas» solo se evita porque `fn_dynamic_disponibles` filtra antes (principio 2: que el diseño lo impida, no el orden de las pantallas).
- **Cómo lo verificas tú:** intentar dar acceso a una persona sin cuenta desde la consola de pruebas local falla con un mensaje claro; repetir E3 en producción sigue en 0.
- **Esfuerzo / dependencias:** S · migración con tu ok; puede ir junto con #1.

### #9 · Corregir — Botón «Sí, quitar acceso»: que su color sea el que dice el código
- **Dónde:** `ColaboradoresModales.tsx:289` (`bg-rojo` en conflicto con `peso="primario"`).
- **Por qué en este puesto:** hoy sale oscuro `[visto]`, lo cual **ya respeta** el máximo de rojo; el defecto es la clase muerta y la duda de qué se pretendía. Decide: rojo en la única acción irreversible (mi sugerencia) o quitar la clase.
- **Cómo lo verificas tú:** el botón de confirmar de la baja definitiva se ve rojo, y ninguna otra acción de la pantalla lo es.
- **Esfuerzo / dependencias:** S · junto con #6. *(bajo valor)*

### #10 · Mejorar — Reactivar cuando la ubicación ya no existe: elegir otra sin perder la fecha
- **Dónde:** `reactivar_colaborador(p_persona_id, p_ubicacion_id default null)` (migración l.277-304) y el botón «Reactivar acceso» (`Tablas:155`).
- **Por qué en este puesto:** hoy el mensaje manda a quitarla y agregarla de nuevo, con lo que se pierden la fecha de alta y se parte el historial. Ocurriría solo si se desactiva una ubicación con gente suspendida: raro con 4 ubicaciones. *(bajo valor / opcional)*
- **Cómo lo verificas tú:** desactiva una ubicación de prueba con una persona suspendida allí; «Reactivar» pide otra ubicación y la fila conserva «Desde».
- **Esfuerzo / dependencias:** S · migración con tu ok.

### #11 · Mejorar — Menú «⋯»: Home/End, Shift+Tab y «Seleccionar todas» con tope de 50 en pantalla
- **Dónde:** `MenuAcciones.tsx` (~l.313-326, hoy solo ↑/↓/Esc, y solo `Tab` sin `Shift` cierra) y `AgregarColaboradoresModal` (`Modales` l.18-153, el tope de 50 solo lo pone la RPC, l.231).
- **Por qué en este puesto:** pulido de teclado y de un caso límite que hoy no se ve (1 sola cuenta disponible). *(bajo valor / futuro)*
- **Cómo lo verificas tú:** con el teclado, Home/End llevan a la primera y última opción; con más de 50 cuentas de prueba, «Seleccionar todas» marca 50 y lo dice.
- **Esfuerzo / dependencias:** S · ninguna.

### #12 · Replantear — ¿El líder manda en toda CAYLA o en su sede?
Pide decisión tuya sobre la sección 8.
- **Dónde:** `fn_es_lider()` (0016), `fn_ubicacion_actual_persona` y todas las políticas RLS que la usan; la columna «Ubicación asignada» de los líderes (`cualquiera`); D-12/D-14 en `DECISIONES-2026-09-12.md`.
- **Por qué en este puesto:** es la decisión que gobierna quién puede cerrar caja y ajustar stock en cada sede (D-13), y hoy la base hace lo contrario de la decisión escrita (D-14). No se arregla editando código: alguien tiene que elegir, y eso condiciona la #4.
- **Cómo lo verificas tú:** tú decides A o B (sección 8); queda como ADR y en `DECISIONES-…` con su número.
- **Esfuerzo / dependencias:** L si B · no antes de la #2 (comprobar que el acceso se corta bien antes de cambiar quién manda).
- **DECIDÍ:** mantener a los líderes con alcance global **hoy**, **pero** escribirlo como decisión y no como accidente del backfill (que D-14 quede corregida o el código cambie a ella), y registrar quiénes son los 9 con nombre y motivo. **DESCARTÉ:** implementar ya el líder por sede con permiso temporal, porque obligaría a reescribir `fn_es_lider()` y las políticas RLS de cada módulo (Caja, Compras, Producción, Inventario) a la vez, para cubrir un riesgo que con 4 ubicaciones y 9 personas conocidas se resuelve hablando; y tampoco tendría un solo caso probado hoy. **SE ROMPE SI:** una encargada de Tienda TRU (líder por el backfill) cierra la caja de Tienda AQP o ajusta su stock sin que nadie se lo haya pedido, y no queda en ninguna parte que estaba fuera de su sede.

## 8 · Estrategia alternativa
**A · Líder global con lista corta y auditada (mi recomendación hoy):** mantener `lider` como está, decidir con nombre quiénes son los 9 y dejar la decisión escrita. **Ganas:** cero cambios en RLS, ninguna migración; la pantalla ya lo permite (tras #4). **Pagas:** la regla «en su sede» de D-14 se rebaja a «en toda CAYLA» para quien sea líder, y el riesgo pasa a ser de confianza en personas, no de sistema.
**B · Líder por sede + permiso temporal (D-14 tal cual):** `colaboradores` gana el alcance del líder (una ubicación o «todas») y `fn_es_lider()` pasa a `fn_es_lider(ubicacion)`. **Ganas:** el mínimo privilegio que pide la decisión; una encargada de TRU no toca AQP. **Pagas:** reescribir la función y sus políticas RLS en los módulos que la usan, construir el permiso con fecha de vencimiento (que ni existe), y una pantalla más de gestión.
Decide Felipe.

## 9 · Referentes de ERP y futuro
De memoria, sin verificar contra los productos: Shopify POS y Odoo separan «permiso» de «ubicación» y guardan cada cambio de permisos con su autor; el equivalente aquí ya existe (Actividad). Quedan como **futuro** (no cuentan entre las 12): roles finos por función («solo cajero»), el nivel Solo lectura de D-12 para el contador externo, y avisar por correo a la persona cuando se le suspende. Para 3 tiendas y 1 taller, el nivel Admin/Solo lectura se activará cuando llegue el contador externo, no antes.

## 10 · Fuera de esta pantalla
El candado de dinero de todo el sistema (`fn_es_lider()`, D-13) depende de **9 cuentas de personas que ingresan con correos personales**, y no hay evidencia en el repo de que se les pida un segundo factor. La configuración de Supabase Auth (verificación en dos pasos, política de contraseñas) no vive en el repositorio y no puedo verlo `[no verificable]`; si una de esas cuentas se compromete, el atacante puede cerrar cajas, ajustar stock y ver costos, y esta pantalla solo registra *quién dio acceso*, no *qué hizo cada líder*. Es una decisión tuya: revisar en el panel de Supabase Auth si el segundo factor está activo y, si no, decidir si se exige a los líderes.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:colaboradores]` #1 Suspender y Quitar avisan de la caja abierta (y decidir si avisar o impedir) — M
- [ ] `[pantalla:colaboradores]` #2 Probar de verdad que un suspendido no entra + prueba `.mjs` contra Postgres real — M
- [ ] `[pantalla:colaboradores]` #3 «Último ingreso» → «a Dynamic» y con año (después, último uso en retail) — S
- [ ] `[pantalla:colaboradores]` #4 Cambiar rol Líder ↔ Colaborador con historial — M · no antes de #12
- [ ] `[pantalla:colaboradores]` #5 Copy sin género y sin promesa falsa; aclarar «Sede en Dynamic» — S
- [ ] `[pantalla:colaboradores]` #6 Contraste, foco (sin borde rojo) y tamaño táctil — S
- [ ] `[pantalla:colaboradores]` #7 Actividad: buscar y «ver más», agrupar altas en lote — M
- [ ] `[pantalla:colaboradores]` #8 El alta exige cuenta de ingreso; listas con `left join` — S
- [ ] `[pantalla:colaboradores]` #9 Color del botón «Sí, quitar acceso» *(bajo valor)* — S
- [ ] `[pantalla:colaboradores]` #10 Reactivar eligiendo otra ubicación *(bajo valor / opcional)* — S
- [ ] `[pantalla:colaboradores]` #11 Menú «⋯» teclado y tope de 50 en «Seleccionar todas» *(bajo valor / futuro)* — S
- [ ] `[pantalla:colaboradores]` #12 Decidir el alcance del líder (A global auditado / B por sede) — decisión
- [ ] Corrección de docs: marcar `20260922110000` como aplicada en producción (verificado 2026-09-22) y refrescar el volcado; limpiar las dos filas de `SESIONES-ACTIVAS.md` de las ramas ya fusionadas
- [ ] Revisar en Supabase Auth si los líderes tienen segundo factor (ver sección 10)

## Datos pendientes
No se corrió la consulta de cajas abiertas de personas sin acceso. Es de solo lectura y sin datos personales; pégala en el SQL Editor de producción:
```sql
select count(*) as cajas_abiertas_sin_dueno_con_acceso,
       jsonb_agg(jsonb_build_object('ubicacion', u.nombre, 'desde', c.abierta_en,
                 'dias', extract(day from now() - c.abierta_en))) as detalle
from retail.cajas c
join retail.ubicaciones u on u.id = c.ubicacion_id
where c.estado = 'abierta'
  and c.abierta_por is not null
  and not exists (select 1 from retail.colaboradores x where x.persona_id = c.abierta_por);
```
Con 0 filas, la #1 baja de urgente a preventiva; con una o más, sube a «esta semana».

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título y bajada | Explica que las personas se dan de alta en Dynamic y aquí solo se abre la puerta | bien | `[visto]` |
| Cabecera | «+ Agregar colaboradores» | Abre el alta múltiple | bien | `[visto]` |
| Cabecera global | Selector «TIENDA TRU» | No filtra esta pantalla | ajustar (control ilusorio; vive en `AppShell`, no tocar aquí) | `[visto]` `[código page.tsx]` |
| Tarjetas | Con acceso / Líderes / Colaboradores / Suspendidos | Cuatro cifras reales derivadas de las listas | bien; «Colaboradores» choca con el título | `[visto]` `[código reglas l.182-195]` |
| Pestañas | Activos · Suspendidos · Inactivas · Actividad | Cada persona en una sola lista | bien | `[visto]` `[código]` |
| Lista | Buscador y filtro Todos/Líderes/Colaboradores | Filtro en el navegador, sin tildes | bien | `[código reglas l.157-164]` |
| Tabla | Nombre, correo, rol, ubicación asignada | Identifica a la persona y su sede fija | bien | `[visto]` |
| Tabla | «cualquiera» en cursiva (líderes) | Dice que el líder no tiene sede fija | ajustar (contra D-14, ver #12) | `[visto]` |
| Tabla | «Sede en Dynamic» | Sede de planilla | ajustar (sin explicación) | `[visto]` |
| Tabla | «Desde» | Alta; en líderes es la fecha del backfill | ajustar | `[visto]` `[producción E4]` |
| Tabla | «Último ingreso» | Último inicio de sesión en Dynamic, sin año | ajustar (#3) | `[visto]` `[código migración l.377]` |
| Tabla | Menú «⋯» | Cambiar ubicación · Suspender · Quitar (según rol) | bien; falta teclado y tamaño táctil | `[visto]` `[código MenuAcciones]` |
| Tabla | «Sesión activa» / chip «Tú» | Protege de auto-suspenderse | bien | `[código Tablas:101-102]` |
| Modal | Alta múltiple | Varias personas, misma ubicación, todo o nada | bien | `[visto]` |
| Modal | Suspender con motivo (0/300) | Mueve la fila y anota el motivo | bien; borde rojo de foco | `[visto]` |
| Modal | Quitar acceso | Baja definitiva con explicación | bien; botón oscuro pese a `bg-rojo` | `[visto]` `[código Modales:289]` |
| Actividad | Registro de accesos (25 eventos) | Historial inmutable con autor y ubicación | bien; sin buscador ni «ver más» | `[visto]` `[producción B1, C1]` |
| Falta | Aviso de caja abierta, cambiar rol, filtrar Actividad | — | falta | `[código]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 6,5 | 6,2 | — (primer análisis) |
| 2026-09-22 | (sin re-análisis) | — | — | Cerradas: #1, #2, #4, #5, #7, #8, #9 (PR #237, ADR-0145); #3 historial, #6 cambiar ubicación, #10 último ingreso y #11 columnas (rediseño, ADR-0148, sin pegar en producción). Sigue abierta la #12 y la decisión de los 9 líderes. **La pantalla se rehízo: este análisis quedó vencido.** |
| 2026-09-22 | completo | 7,3 | 6,2 | Re-análisis sobre `b6b85206`. De las 12 anteriores: **cerradas** #1 (alta sin prellenado), #2 (aviso si ya tenía acceso), #3 (historial), #4 (revoke, verificado en producción), #5 (CHECK, verificado), #6 (cambiar ubicación), #7 (un solo rojo; el foco rojo del campo de motivo sigue, ver #6 nuevo), #9 (textos). **Cerrada a medias:** #10 «Último ingreso» (existe, pero mide Dynamic: ahora #3), #8 contraste (cambió el estado: queda #6). **Abiertas:** #11 («Sede en Dynamic» sin explicar: ahora en #5) y #12 (alta en retail o Dynamic: la decisión se movió al alcance del líder, #12 nueva). |
