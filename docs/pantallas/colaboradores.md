# Pantalla — Colaboradores (`/colaboradores`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder, Tienda TRU · Datos: real parcial (SQL de producción A1-constraints, B1, D1-grants, D3; E sin resultado útil)
> SHA analizado: `bda4a16a` (origin/main) — si esos archivos cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/colaboradores/page.tsx` · `apps/web/components/ColaboradoresPanel.tsx` · `apps/web/lib/colaboradores.ts` · RPC `fn_colaboradores`, `fn_dynamic_disponibles`, `agregar_colaborador`, `quitar_colaborador` · tabla `retail.colaboradores`
> Otra sesión tocándola: no (no aparece en `docs/SESIONES-ACTIVAS.md`)

## 0 · Veredicto
Pantalla chica y bien cerrada en lo esencial: solo líder, con el permiso repetido dentro de cada función y sin escritura directa por RLS. Sus fallos son de diseño del gesto (el alta llega prellenada), de memoria (nada registra quién dio o quitó un acceso) y de piel (rojo en cada fila, texto de bajo contraste).
**Cumple su finalidad:** 6,5/10 · **Relevancia:** 6,2/10 — Soporte

## 1 · Finalidad declarada
"Esta pantalla existe para decidir a quién de Dynamic se le abre la puerta de retail y a qué ubicación queda fijo si entra como Colaborador."
Fuente: `docs/datos/modulos/01-identidad-y-acceso.md` (encabezado y mapa) y los comentarios de `0013_colaboradores_autorizados.sql` / `0016_roles_colaborador.sql`. ¿Coinciden docs y pantalla? **Parcialmente:** el módulo 01 describe V1 (revisión 2026-09-12, `personas.rol = lider | integrante`), así que no lo cito como vigente; mandan el código y producción.

## 2 · Objeción
1. **El alta da acceso con valores que nadie eligió.** El modal abre con la primera persona de la lista y la primera ubicación ya elegidas (`ColaboradoresPanel.tsx:41,51-52`; en la captura se ve una persona y «Taller» ya puestos). Un «Agregar» apurado entrega retail a alguien al azar, en una sede al azar, y la pantalla lo celebra con «ya tiene acceso».
2. **Nada registra quién dio o quitó un acceso.** «Quitar» hace `delete from colaboradores` (`0016:167-180`): se pierde `agregado_por` y la fecha, y no queda rastro de la baja. Los 9 líderes ni siquiera tienen `agregado_por` (B1: 9 de 9 sin quién los agregó).
3. **La tabla queda protegida por una sola capa.** `authenticated` tiene INSERT, UPDATE y DELETE sobre `retail.colaboradores` `[producción, D1]`. Hoy lo frena RLS (activo, solo política de SELECT `[producción, volcado]`); si alguien crea una política de escritura por error, se abre sin aviso. Otras tablas ya cerraron esto con `revoke` (`20260915150000_movimientos_insert_solo_rpc.sql:84`).

## 3 · Lo que está bien y no se toca
- Solo líder en tres capas: redirección en `page.tsx:14`, `fn_es_lider()` dentro de cada RPC (`0016:112,132,151,173`) y política de SELECT restringida a líder `[código, producción]`.
- Las 6 funciones son `security definer` con `search_path` fijo `[producción, D3]`.
- No puedes quitarte a ti mismo el acceso (`0016:175-178`), así que siempre queda al menos un líder.
- `fn_tiene_acceso_retail` y `fn_es_lider` exigen `estado = 'activo'` en Dynamic: quien cesa en Dynamic pierde acceso sin que nadie lo quite `[código 0013:45-48, 0016:28-33]`.
- La lista oculta a los inactivos, en línea con esa regla `[código 20260915230001:83]`.
- El estado de un colaborador nuevo se restablece al abrir el modal (`:51-52`), lo que evitó un bug real ya documentado en el comentario `[código :46-50]`.
- Tres candados de esquema: PK por persona, CHECK de rol y las tres llaves foráneas `[producción, A1]`.
- Modal, desenfoque y confirmación de baja siguen el sistema de modales (ADR-0136) `[visto]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6,5 | Coherente con CAYLA, pero rojo repetido por fila y texto de bajo contraste | `[visto]` `[código :139,:149]` |
| Lógica de negocio | 6 | Sin auditoría, sin cambio de ubicación, conflicto silencioso al agregar | `[código 0016:159, :72]` |
| Arquitectura | 7,5 | Sólida en RLS y RPC; permisos de tabla anchos; nada liga rol con ubicación | `[producción D1, A1, B1]` |
| Funciones | 5,5 | Solo agregar y quitar; faltan cambiar ubicación y ver último acceso | `[código]` |
| Utilidad | 6 | Copy engañoso al quitar; columnas parecidas; prellenado peligroso | `[visto]` |
| Conexión con el ERP | 7,5 | Frontera limpia con Dynamic; el acceso se evalúa en cada petición | `[código 0013:41-49]` |

**Estética.** (a) Coherencia: paleta y modales de CAYLA bien; pero `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`) se viola: cada fila lleva «Quitar acceso» en rojo (`:149`) y hay 25 filas `[visto]` `[código]`. (b) Tono: correcto, salvo «él» en «no va a poder cambiarla él mismo» (`:190`). (c) Contraste: «cualquiera» a `tinta/45` (`:139`) da unos 2,9:1 `[inferido]`, bajo el mínimo de 4,5:1; las notas a 11px con `tinta/55` (`:108,:190`) también quedan al filo.

**Lógica de negocio.** Ninguna decisión de `DECISIONES-2026-09-12.md` cubre este módulo (las búsquedas de «colaborador» en ese archivo y en `01-INVARIANTES.md` no devuelven nada), así que no cito D-nn. Hallazgos: (i) `agregar_colaborador` usa `on conflict do nothing` (`0016:159`) y la pantalla igual avisa éxito (`:72`); si dos líderes agregan a la misma persona a ubicaciones distintas, el segundo cree haberla fijado a su sede y no es así. (ii) Para mover a alguien de tienda hay que quitarlo y volver a agregarlo, perdiendo `created_at` y `agregado_por`. (iii) La columna «Desde» de los 9 líderes es la fecha de la migración (los 9 con `created_at` de los últimos 30 días y sin `agregado_por`, B1), no la de su alta real: engaña.

**Arquitectura.** Cadena completa: `page.tsx` → `lib/colaboradores.ts` (lectura pura) → RPC → `retail.colaboradores` → RLS. Estados imposibles: PK por persona impide duplicados; CHECK de rol; pero **nada impide un colaborador sin ubicación** (no hay `check (rol = 'lider' or ubicacion_asignada_id is not null)`). Hoy no ocurre (B1: 0 colaboradores sin ubicación). Transacción: cada RPC es una sola sentencia, sin riesgo de estado a medias. Concurrencia: ver (i) arriba; el resto es inocuo con 25 filas. Caída externa: si Dynamic (misma base) no responde, nadie entra a retail; se degrada cerrando, no perdiendo datos. Volumen: 25 filas hoy (16 colaboradores + 9 líderes, B1); a 3 tiendas y 1 taller no pasa de un par de cientos en años, sin paginación necesaria. Lentes extra: **datos personales** (nombre y correo de todos en una tabla; solo líder la ve) y **auditoría** (falta).
Pendiente de verificar: cuerpos de función contra el repo (D3 trae md5 pero no se comparó); la consulta E (líderes vigentes, colaboradores sin ubicación, cajas abiertas de personas sin acceso) no llegó con resultado — la tercera falló por nombre de columna (`cerrada_en`, no `cerrada_at`).

**Funciones.** Existen y funcionan: listar, agregar con ubicación fija, quitar con confirmación, no auto-quitarse. Fantasma: ninguna. Faltan: cambiar la ubicación de un colaborador; ver último acceso (`fn_mi_perfil` ya lo lee de `auth.users.last_sign_in_at`); historial de altas y bajas. Sobran: nada.

**Utilidad.** Escenario: una encargada nueva en Tienda TRU el lunes. El líder abre «Agregar colaborador», el modal ya trae a la primera persona y «Taller»; si toca «Agregar» sin leer, la persona equivocada queda en el Taller `[visto]`. Luego intenta pasarla a la tienda: no hay cómo, salvo quitar y agregar. Al quitar, el texto promete «puede volver a agregarse desde Dynamic» (`:213`), pero se agrega desde esta pantalla: la persona ya existe en Dynamic. Además «Ubicación asignada» y «Sede en Dynamic» muestran vocabularios distintos («Tienda TRU» frente a «Oficina TRU» / «Central») sin explicar la diferencia `[visto]`.

**Conexión con el ERP.** Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Directo: decide quién opera. Indirecto: `ubicacion_asignada_id` define la sede de toda venta, movimiento y caja de un colaborador |
| Dinero y stock que toca | ×1 | 5 | No los mueve; define quién puede moverlos |
| Frecuencia y personas que la usan | ×1 | 2 | Solo líderes, solo al contratar o cesar; 16 altas de golpe por el arranque |
| Qué se detiene si falla | ×1 | 8 | Sin acceso nadie opera; ver Tarea #2 y #4 |

Relevancia = (2·8 + 5 + 2 + 8) / 5 = **6,2** → Soporte. Cumple = promedio de las seis = 6,5; **no aplica el tope de 5**: ningún defecto toca dinero o stock directamente (el más cercano, dar acceso equivocado, queda acotado por el rol Colaborador y por el candado de líder ADR-0143).

## 6 · Conexión con el ERP
- **Aguas arriba:** `public.personas` y `auth.users` de Dynamic (identidad, estado activo, sede base); `retail.ubicaciones`.
- **Aguas abajo:** todo. `fn_tiene_acceso_retail` y `fn_es_lider` deciden el RLS de cada tabla; `fn_ubicacion_actual_persona` decide la sede de cada colaborador; `fn_mi_perfil` la muestra.
- **Pájaro dueño y vecinos:** Ganso (Identidad y acceso), `docs/datos/generado/AVIARIO.md`; vecinos: Caja y Ajuste de stock (candado de líder), Compras/Producción (solo líder).
- **Externos:** ninguno. La costura con Dynamic vive en la misma base: si Dynamic desactiva a alguien, retail lo deja de reconocer en la siguiente petición.

## 7 · Las 12 tareas, por importancia
### #1 · Corregir — Quitar el prellenado del alta
- **Dónde:** `ColaboradoresPanel.tsx:39-41,51-52,198`.
- **Por qué en este puesto:** es lo único que puede dar acceso a la persona o sede equivocada con un gesto normal; costo casi cero.
- **Cómo lo verificas tú:** abre «Agregar colaborador»: Persona y Ubicación vacías con marcador («Elige…») y el botón «Agregar» deshabilitado hasta elegir ambas.
- **Esfuerzo / dependencias:** S · ninguna.

### #2 · Corregir — Avisar cuando la persona ya tenía acceso
- **Dónde:** `0016:159` (`on conflict do nothing`) y `ColaboradoresPanel.tsx:72`.
- **Por qué:** dos líderes pueden creer que fijaron a la misma persona a sedes distintas; solo vale la primera. Principio 2: el diseño no debe permitir un estado que la pantalla contradice.
- **Cómo lo verificas tú:** abre el modal en dos pestañas, agrega a la misma persona en ambas: la segunda debe fallar con «Esa persona ya tiene acceso».
- **Esfuerzo / dependencias:** S · migración nueva, con ok tuyo antes de pegarla (`retail.` al pegar en producción). Junta con #9.

### #3 · Reconstruir — Historial append-only de accesos
- **Dónde:** tabla nueva `retail.colaboradores_historial` + trigger en `retail.colaboradores`; `fn_colaboradores_historial()` de lectura; sección «Historial» en la pantalla.
- **Por qué:** hoy una baja es irrecuperable y nadie sabe quién dio acceso a quién (B1: los 9 líderes sin `agregado_por`). Con el candado de líder (ADR-0143) el acceso ya es más sensible. Principio 4: una fuente de verdad append-only.
- **Cómo lo verificas tú:** agrega y quita a una persona de prueba; el historial muestra quién lo hizo, a quién, con qué ubicación y cuándo; `delete` directo desde la base no borra el historial.
- **Esfuerzo / dependencias:** M · idealmente tras #4.
- **DECIDÍ:** trigger que copia cada alta, cambio y baja a una tabla de historial, dejando `delete` como está. **DESCARTÉ:** cambiar a baja lógica (columna `quitado_en`) porque obligaría a reescribir `fn_tiene_acceso_retail` y `fn_es_lider`, de las que cuelga el RLS de todo el sistema. **SE ROMPE SI:** un cierre de caja se disputa y hay que probar quién tenía acceso ese día: hoy no hay respuesta.

### #4 · Corregir — Revocar escritura directa de la tabla
- **Dónde:** `retail.colaboradores`; nueva migración con `revoke insert, update, delete, truncate on retail.colaboradores from authenticated, anon;` (precedente: `20260915150000_movimientos_insert_solo_rpc.sql:84`).
- **Por qué:** hoy solo RLS lo protege `[producción, D1]`; las RPC son `security definer` y siguen funcionando sin esos permisos.
- **Cómo lo verificas tú:** repite la consulta D1: solo debe quedar SELECT; agregar y quitar desde la pantalla siguen funcionando.
- **Esfuerzo / dependencias:** S · migración con ok tuyo; ensayo con rollback antes de pegar.

### #5 · Corregir — Candado: un colaborador siempre tiene ubicación
- **Dónde:** `retail.colaboradores`: `check (rol = 'lider' or ubicacion_asignada_id is not null)`.
- **Por qué:** B1 muestra 0 violaciones hoy, así que se puede poner sin migrar datos; sin él, un `insert` futuro deja a alguien sin sede y `fn_ubicacion_actual_persona` devuelve vacío.
- **Cómo lo verificas tú:** un `insert` de prueba de colaborador sin ubicación (en local) falla por el CHECK.
- **Esfuerzo / dependencias:** S · junto con #4 en la misma migración.

### #6 · Mejorar — Cambiar la ubicación de un colaborador
- **Dónde:** RPC nueva `cambiar_ubicacion_colaborador(persona, ubicacion)` solo líder + acción «Cambiar sede» por fila.
- **Por qué:** hoy exige quitar y volver a agregar, perdiendo fecha y autor; es el caso normal cuando alguien rota de tienda.
- **Cómo lo verificas tú:** cambia a una persona de prueba de Taller a Tienda TRU; la fila conserva «Desde» y el historial (#3) registra el cambio.
- **Esfuerzo / dependencias:** M · no antes de #3.

### #7 · Corregir — Un solo rojo por pantalla
- **Dónde:** `ColaboradoresPanel.tsx:149` (y `:222`, que sí debe quedar en rojo por ser la confirmación).
- **Por qué:** 25 botones rojos incumplen `MAX_ROJO_POR_PANTALLA = 2` y quitan fuerza al único rojo que importa.
- **Cómo lo verificas tú:** la lista muestra «Quitar acceso» en tinta neutra; el rojo aparece solo en «Sí, quitar acceso» del modal.
- **Esfuerzo / dependencias:** S · ninguna.

### #8 · Corregir — Contraste y tamaño mínimo
- **Dónde:** `:139` (`text-tinta/45` → al menos `/65`), `:108,:190` (`/55`, 11px).
- **Por qué:** ADR-0012 fija el piso de contraste; «cualquiera» explica el alcance del líder y hoy casi no se lee.
- **Cómo lo verificas tú:** «cualquiera» se lee sin esfuerzo; en devtools la razón de contraste sale ≥ 4,5:1.
- **Esfuerzo / dependencias:** S · ninguna.

### #9 · Corregir — Textos que dicen algo falso o sesgado
- **Dónde:** `:213` («desde Dynamic» → «desde esta pantalla»), `:190` («él mismo» → «la persona no podrá cambiarla»), y el mensaje `0016:177` («pide a otro colaborador» → «pide a otro líder»).
- **Por qué:** el primero manda a la persona al lugar equivocado; el tercero nombra el rol equivocado.
- **Cómo lo verificas tú:** intenta quitarte a ti mismo: el aviso nombra a otro líder; el modal de baja dice dónde volver a agregar.
- **Esfuerzo / dependencias:** S · el mensaje de la RPC entra con la migración de #2.

### #10 · Mejorar — Columna «Último acceso» y orden por rol
- **Dónde:** `fn_colaboradores` (agregar `auth.users.last_sign_in_at`, como ya hace `fn_mi_perfil`) y la tabla.
- **Por qué:** permite ver cuentas dormidas, útil para gestionar acceso; cambiar la firma exige `drop` de la vieja (lección de `recibir_lote`).
- **Cómo lo verificas tú:** la columna muestra fecha reciente para quien entró hoy y «nunca» para quien no.
- **Esfuerzo / dependencias:** M · después de #3.

### #11 · Mejorar — Explicar «Sede en Dynamic» frente a «Ubicación asignada» *(bajo valor / opcional)*
- **Dónde:** encabezados `:126-127`.
- **Por qué:** dos vocabularios sin explicación; afecta a pocas personas expertas.
- **Cómo lo verificas tú:** una nota corta bajo el título o un tooltip aclara la diferencia.
- **Esfuerzo / dependencias:** S · ninguna.

### #12 · Replantear — ¿Dónde debe vivir el alta de acceso?
Pide decisión tuya sobre la sección 8.
- **Dónde:** toda la pantalla y `retail.colaboradores`.
- **Por qué:** es una decisión de dónde vive la verdad sobre el personal; no se resuelve editando código.
- **Cómo lo verificas tú:** tú decides A (mantener) o B (mover a Dynamic) y queda escrito como ADR.
- **Esfuerzo / dependencias:** L si B · no antes de #3.
- **DECIDÍ:** mantener el alta en retail. **DESCARTÉ:** llevarla a Dynamic porque retail guarda dato propio (ubicación fija y rol de retail) que Dynamic no tiene, y habría que ampliar el sistema de personal de otro equipo. **SE ROMPE SI:** hay que cortar el acceso a alguien que sigue activo en Dynamic (cambió de empresa interna, por ejemplo) y esa baja hay que hacerla a mano en dos sitios.

## 8 · Estrategia alternativa
**A · Mantener (hoy):** retail decide quién entra. **Ganas:** autonomía, rol y ubicación propios, cambios inmediatos. **Pagas:** dos listas de personas que sincronizar en la cabeza del líder.
**B · Mover a Dynamic:** retail solo lee rol y ubicación. **Ganas:** una sola fuente de verdad del personal. **Pagas:** ampliar Dynamic con datos de retail, depender de su calendario y perder el control fino de sede por colaborador.
Decide Felipe.

## 9 · Referentes de ERP y futuro
Marcado como de memoria, sin verificar contra los productos: los POS y ERP grandes (Shopify POS, Odoo) manejan permisos por rol y por tienda con historial de cambios; a 3 tiendas y 1 taller solo importa el historial (#3). Roles granulares por función (por ejemplo «solo cajero») quedan como futuro: no hay hoy más de dos niveles y el candado de líder alcanza.

## 10 · Fuera de esta pantalla
Los 9 líderes tienen alcance global y todos salieron de un backfill con «Líder para todos», sin decidir persona por persona si alguno debía ser Colaborador (comentario de `0016:1-24`, «SE ROMPE SI»). Hoy incluye gente cuya sede es «Oficina TRU» o «Central» `[visto]`. Con el candado ADR-0143, cada uno puede cerrar cajas y ajustar stock, y esta pantalla no permite bajar a nadie de Líder ni subirlo. Esa decisión (¿quiénes son líderes de verdad?) es tuya, no de código, y hoy solo se cambia entrando a la base.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:colaboradores]` #1 Quitar el prellenado del alta — S
- [ ] `[pantalla:colaboradores]` #2 Avisar cuando la persona ya tenía acceso (migración) — S
- [ ] `[pantalla:colaboradores]` #3 Historial append-only de accesos — M
- [ ] `[pantalla:colaboradores]` #4 Revocar INSERT/UPDATE/DELETE de `retail.colaboradores` a `authenticated` (migración) — S
- [ ] `[pantalla:colaboradores]` #5 CHECK: un colaborador siempre tiene ubicación — S
- [ ] `[pantalla:colaboradores]` #6 RPC para cambiar la ubicación de un colaborador — M
- [ ] `[pantalla:colaboradores]` #7 Un solo rojo por pantalla — S
- [ ] `[pantalla:colaboradores]` #8 Contraste y tamaño mínimo — S
- [ ] `[pantalla:colaboradores]` #9 Corregir textos engañosos o sesgados — S
- [ ] `[pantalla:colaboradores]` #10 «Último acceso» y orden por rol — M
- [ ] `[pantalla:colaboradores]` #11 Aclarar «Sede en Dynamic» (opcional) — S
- [ ] `[pantalla:colaboradores]` #12 Decidir dónde vive el alta de acceso (A o B) — decisión
- [ ] Decidir quiénes de los 9 líderes deben seguir siéndolo (decisión de Felipe, ver sección 10)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Encabezado | Título y bajada | Explica el alcance de la pantalla | ajustar (12px, `tinta/65`) | `[código :96-100]` |
| Encabezado | «Agregar colaborador» | Abre el modal; se deshabilita si no hay cuentas | bien | `[código :104]` |
| Tabla | Columnas Nombre, Correo, Rol | Identifican a la persona | bien | `[visto]` |
| Tabla | Ubicación asignada / Sede en Dynamic | Dos vocabularios sin explicar | ajustar | `[visto]` |
| Tabla | «Desde» | Fecha de alta; en líderes es la fecha de la migración | ajustar | `[producción B1]` |
| Tabla | «Quitar acceso» por fila | Baja con confirmación | ajustar (rojo repetido) | `[código :149]` |
| Modal alta | Persona (buscable) y Ubicación | Elige a quién y dónde | ajustar (prellenado) | `[visto]` |
| Modal baja | Confirmación | Evita el clic accidental | bien; corregir texto | `[código :213]` |
| Falta | Cambiar ubicación, historial, último acceso | — | falta | `[código]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 6,5 | 6,2 | — (primer análisis) |
| 2026-09-22 | (sin re-análisis) | — | — | Cerradas: #1, #2, #4, #5, #7, #8, #9 (PR #237, ADR-0145); #3 historial, #6 cambiar ubicación, #10 último ingreso y #11 columnas (rediseño, ADR-0148, sin pegar en producción). Sigue abierta la #12 y la decisión de los 9 líderes. **La pantalla se rehízo: este análisis quedó vencido.** |
