# Pantalla — Inicio (`/`, `app/(app)/page.tsx`)

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder e integrante, TIENDA TRU (y Taller/almacén por código) · Datos: **sin SQL** (pendiente; ver Paso 2)
> SHA analizado: `fa56e483` (`origin/main`, rama al día) — si `page.tsx`, `lib/inicio.ts` o `lib/inicio-reglas.ts` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/page.tsx` · `lib/inicio.ts` (`getHoyDeLaSede`) · `lib/inicio-reglas.ts` (`mostrarHoy`, `resumirHoy`, `colasInicio`, `accesosInicio`) · `lib/caja.ts` (`getCajaAbierta`, `getVentasMismaHoraSemanaAnterior`) · `lib/traslados.ts` (`getTrasladosPorAtender`) · `lib/movimientos-v2.ts` · RPC `fn_ventas_del_dia`, `fn_movimientos` · tablas `ventas`, `venta_items`, `ubicaciones`, `movimientos`, `transferencias`
> Otra sesión tocándola: **sí, dos choques reales.** (1) `docs/SESIONES-ACTIVAS.md` (fila `brave-northcutt-7a1d2c`) dice que su próximo paso, con el OK de Felipe, es **«Inicio por perfil»** — y este Inicio ya implementa bloques por rol sin que esa sesión lo sepa. (2) Existe una rama sin mergear (`claude/terminales-cuentas-129fd4`, commits `1296a0f0`/`3fa0c80c`) que agrega «cuenta terminal» a Inicio citando «ADR-0152» — número que en `main` ya pertenece a `0152-pedido-no-atendido-en-un-toque.md` (choque de numeración, la propia rama ya lo renombró a ADR-0160 internamente). **Ninguna de las dos se coordinó con la otra.**

## 0 · Veredicto
Segunda versión, ya reconstruida por otra sesión: responde bien las tres preguntas de apertura y ya no miente con ceros. Pero «Tus ventas», la cifra que ve la integrante, no es «sus» ventas — es el total de toda la sede, con la etiqueta equivocada. Y dos sesiones están a punto de decidir «Inicio por perfil» por separado.
**Cumple su finalidad:** 6.5/10 · **Relevancia:** 6.0/10 — Soporte (sube de Comodidad porque ahora sí ayuda a decidir el día)

## 1 · Finalidad declarada
"Esta pantalla existe para que quien entra a la sede vea de un vistazo cómo va el día, qué necesita atender y llegue en un toque a lo que va a hacer."
Fuente: la finalidad que fijé en el análisis anterior (2026-09-21), y que esta reconstrucción cumple mejor que la versión previa. `docs/datos/11-KPIS.md:146` sigue citando `getPanelInicio`, una función que ya no existe — doc desactualizado, no fuente válida hoy.
¿Docs y pantalla coinciden? **Parcialmente.** La pantalla ya hace lo que la finalidad pide (Hoy / Por atender / Ir a), pero un comentario del propio código (`inicio.ts:20`, `page.tsx:16`) afirma algo que el SQL real contradice (ver Objeción). Manda el código real sobre el comentario; Felipe corrige si esto falla.

## 2 · Objeción
**«Tus ventas» le miente a la integrante sobre de quién son esas ventas.** `fn_ventas_del_dia` (`supabase/migrations/20260922140000_ficha_de_clienta_v1_backend.sql:330-378`) filtra por `v.ubicacion_id = fn_ubicacion_actual_persona()` para quien no es líder — **por sede completa, sin ningún filtro por `usuario_id` o vendedor**. El comentario que dice lo contrario (`inicio.ts:20`: «la RPC ya le devuelve solo las suyas») está mal, y la pantalla lo hereda: una integrante en TRU ve el total de TODAS las ventas de la tienda ese día, rotulado como si fueran solo las que ella hizo. `[código inicio.ts:20]` `[código migración 20260922140000:330-378]`

Trade-off: corregir el rótulo a «Ventas de la sede» es una línea (S). Filtrar de verdad por vendedor requeriría cambiar la RPC que usan Caja/Vender/Facturación — no lo recomiendo solo para Inicio; primero decidir si "por vendedor" tiene sentido de negocio (¿CAYLA mide desempeño individual?). Ninguna decisión escrita (D-nn) lo cubre.

## 3 · Lo que está bien y no se toca
- Cada pieza de «Hoy» falla por separado y distingue «no se pudo leer» (`null`) de «cero de verdad» (`0` o `[]`): `inicio.ts:27-34` (`tolerarLectura`), consumido en `page.tsx:127`. `[código]`
- `mostrarHoy` ya excluye Taller y almacén del bloque «Hoy» (no venden): `inicio-reglas.ts:19`. `[código]`
- La cola «Por atender» reutiliza `getTrasladosPorAtender`, la misma cifra del «2» del menú — una sola fuente de verdad. `[código page.tsx:30]`
- 15 pruebas cubren `mostrarHoy`, `resumirHoy` (suma, sin ventas, comparativo, meta ausente), `colasInicio` y `accesosInicio` por rol/tipo. `[código inicio-reglas.test.ts]`
- El candado de líder (D-13, ADR-0143, migración `20260921120000`) sigue vigente; no encontré cambios de RLS posteriores que lo debiliten. `[producción, no verificado directamente — inferido del historial de migraciones]`
- La rejilla de «Hoy» ya es responsive (`sm:grid-cols-2`→`sm:grid-cols-3`, `page.tsx:58,132`) y los estados vacíos (`page.tsx:154-166`) ya dicen «—», «esta sede no tiene meta», «sin base para comparar» en vez de inventar un cero.
- Los tres avisos de fallo (`page.tsx:37,131`, `inicio-reglas.ts:98`) ya comparten el mismo tono: «No se pudo… Lo demás… está al día».

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | No usa `EncabezadoPagina` como sus hermanas (Caja, Cambios, Devoluciones) | `[código page.tsx:44-46 vs caja/page.tsx:7]` |
| Lógica de negocio | 4 | «Tus ventas» de una integrante en realidad son las de toda la sede | `[código, ver Objeción]` |
| Arquitectura | 7 | Distingue bien null/0; sin candado roto; sin transacción que definir (solo lectura) | `[código]` |
| Funciones | 6 | Cumple lo esencial; faltan SUNAT/por pagar en «Por atender» (admitido en el propio código) | `[código inicio-reglas.ts:80-81]` |
| Utilidad | 6 | Una integrante que mira «Tus ventas S/850» puede creer que vendió eso ella sola | `[inferido]` |
| Conexión con el ERP | 6 | Reutiliza RPC/lecturas ya existentes (Caja, Traslados); no llama a SUNAT/Nubefact | `[código]` |

Promedio 5.8, redondeo a 6.5 porque el defecto de la Objeción es de rótulo, no de un candado de dinero/stock roto (no aplica el tope de 5).

**Estética.** (a) Coherencia: comparte `label-cayla`, `card-cayla`, tinta/crema/verde/ámbar con el resto del sistema. Pero la cabecera es un `h1` manual (`page.tsx:44-46`), mientras Caja, Cambios, Devoluciones y Pedidos no atendidos ya usan `EncabezadoPagina` — dos formas de resolver la misma cabecera, y la nueva reconstrucción no adoptó la que ya era el estándar. `[código]` (b) Tono: sin «CAYLA V2» esta vez, corregido. (c) Heurística: los tres colores de estado (ámbar/verde/tinta) en las colas son claros; no verifiqué contraste real sin captura.

**Lógica de negocio.** El hallazgo de la Objeción es el central. Además: `colasInicio` (`inicio-reglas.ts:82-100`) admite en su propio comentario que SUNAT pendiente y compras por pagar no están integradas — dinero real que hoy no aparece en «Por atender», y D-11 (solo Felipe pega SQL) ni D-13/D-14 tocan qué debe mostrar esta cola. **Ninguna decisión escrita cubre qué colas debe tener Inicio.**

**Arquitectura.** Cadena: `page.tsx` → `getHoyDeLaSede`/`getTrasladosPorAtender`/`listarMovimientos` → RPC (`fn_ventas_del_dia`, `security definer`, filtro de rol en el propio SQL) → tablas. Sin escritura, sin transacción que proteger. **Caída:** cada bloque cae a su propio aviso, ya no tumba toda la pantalla (mejora real sobre la versión anterior). **Volumen:** `fn_ventas_del_dia` trae `items` como jsonb agregado por venta — con muchas ventas/día por sede el jsonb crece, pero no hay indicio de problema con el volumen actual de CAYLA. `[no verificable]` sin producción.

**Funciones.** *Existen y funcionan:* Hoy (caja + ventas + meta), Por atender (traslados), Ir a (accesos por rol), Actividad reciente. *Fantasma:* ninguna encontrada. *Faltan:* SUNAT pendiente y compras por pagar en «Por atender» (admitido); «Hoy» del Taller (con órdenes por etapa, propuesto por la sesión anterior y aún no hecho). *Sobran:* ninguna detectada.

**Utilidad (persona sin contexto).** Escenario: una integrante nueva en TRU ve «Tus ventas: S/1,240» un día muy bueno de la tienda. Puede creer que vendió eso ella sola, o preguntarse por qué su comisión (si existiera) no corresponde a esa cifra. El error es del rótulo, no de la persona. `[inferido]`

**Conexión con el ERP.** *Aguas arriba:* `ventas`, `venta_items`, `ubicaciones`, `transferencias`, `movimientos`. *Aguas abajo:* ninguna, solo lectura. *Pájaro dueño y vecinos:* Caja (comparte `fn_ventas_del_dia`, `getCajaAbierta`), Traslados. *Externos:* ninguno directo; si SUNAT o Nubefact fallan, Inicio no se entera porque esas colas no están integradas — que es justamente lo que falta.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | Ya ayuda a decidir el día (meta, caja, pendientes), aunque «Tus ventas» decide con un dato mal rotulado |
| Dinero y stock que toca | ×1 | 3 | Solo lectura; el riesgo es de mala información, no de mover plata directamente |
| Frecuencia y personas que la usan | ×1 | 9 | Primera pantalla de todos, todos los días |
| Qué se detiene si falla | ×1 | 4 | Cada bloque falla por separado; nada más depende de Inicio |

Relevancia = (2·6 + 3 + 9 + 4) / 5 = **6.0** → Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas`, `venta_items`, `ubicaciones` (`meta_venta_diaria`), `transferencias`, `movimientos`.
- **Aguas abajo:** ninguna (solo lectura). Enlaza según rol a `/vender`, `/caja`, `/buscar`, `/recibir`, `/inventario`, `/produccion`, `/inventario/traslados`.
- **Pájaro dueño y vecinos:** Caja (comparte función y lecturas), Traslados. `[no verificable]` sin `AVIARIO.md` a mano en este análisis.
- **Externos, y qué pasa si caen:** ninguno integrado hoy (esa es la tarea #1 pendiente de la sesión anterior: SUNAT/por pagar).

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] «Tus ventas» debe decir de quién son, o filtrar de verdad
- **Dónde:** `page.tsx:145` (etiqueta «Tus ventas»/«Ventas»); `lib/inicio.ts:20` (comentario falso); `fn_ventas_del_dia` (`supabase/migrations/20260922140000...:330-378`, sin filtro por `usuario_id`).
- **Por qué en este puesto:** es la Objeción; una integrante lee un número que no es el suyo, rotulado como si lo fuera.
- **Cómo lo verificas tú:** dos integrantes distintas de la misma sede ven el mismo total en «Tus ventas» el mismo día.
- **Esfuerzo / dependencias:** S (corregir el rótulo a «Ventas de la sede») · M si se decide filtrar por vendedor de verdad (toca la RPC que usan Caja/Vender/Facturación).
- **DECIDÍ (propuesta, no ejecutada):** corregir el rótulo primero (S), y dejar el filtro por vendedor como decisión aparte de negocio.
- **DESCARTÉ:** cambiar la RPC ahora mismo, porque Caja/Vender/Facturación la comparten y un cambio de alcance ahí es más caro que corregir un texto.
- **SE ROMPE SI:** CAYLA decide medir desempeño individual por vendedora y usa esta cifra mal rotulada como si ya lo hiciera.

### #2 · [Replantear] Coordinar «Inicio por perfil» con la sesión del menú — decide Felipe
- **Dónde:** `docs/SESIONES-ACTIVAS.md` (fila `brave-northcutt-7a1d2c`); `lib/inicio-reglas.ts` (`accesosInicio`, `mostrarHoy`) ya implementan una versión de "por perfil".
- **Por qué en este puesto:** dos sesiones están a punto de decidir lo mismo sin saberlo. Si la del menú construye su propio «Inicio por perfil» sin ver que este ya existe, hay trabajo duplicado o dos diseños que compiten (Integridad conceptual: una sola mente).
- **Cómo lo verificas tú:** hablas con ambas sesiones (o las fusionas) antes de que cualquiera avance en «Inicio por perfil».
- **Esfuerzo / dependencias:** — (es coordinación, no código) · bloquea cualquier trabajo nuevo de personalización por rol.
- **DECIDÍ:** frenar y avisar, no elegir una de las dos por mi cuenta.
- **DESCARTÉ:** dejar que ambas avancen en paralelo, porque el incidente del 2026-09-17 (BITACORA) ya mostró qué cuesta eso: funciones construidas dos veces.
- **SE ROMPE SI:** las dos sesiones fusionan por separado y una pisa el trabajo de la otra sin que nadie lo note hasta el conflicto de merge.

### #3 · [Replantear] Definir «cuenta terminal» en Inicio antes de que la rama sin mergear la traiga
- **Dónde:** rama `claude/terminales-cuentas-129fd4` (no mergeada); citará «ADR-0152» que ya choca con `docs/adr/0152-pedido-no-atendido-en-un-toque.md`.
- **Por qué en este puesto:** dos ADR con el mismo número es exactamente el incidente que `SESIONES-ACTIVAS.md` existe para prevenir.
- **Cómo lo verificas tú:** antes de mergear esa rama, confirma que su ADR quedó renumerado (el código ya dice ADR-0160 internamente, según lo hallado) y que el archivo `docs/adr/0160-*.md` existe con ese contenido.
- **Esfuerzo / dependencias:** — (verificación, no código nuevo) · no bloquea Inicio hoy porque la rama no está mergeada.
- **DECIDÍ:** dejarlo como aviso, no tocar esa rama ajena.
- **DESCARTÉ:** renumerar yo mismo el ADR, porque no es mi rama y podría pisar su propio trabajo en curso.
- **SE ROMPE SI:** se mergea con el número viejo y dos ADR-0152 quedan en el repo a la vez.

### #4 · [Mejorar] Sumar SUNAT pendiente y por pagar a «Por atender»
- **Dónde:** `lib/inicio-reglas.ts:82-100` (`colasInicio`); comentario propio admite que faltan.
- **Por qué en este puesto:** son las dos colas que tocan dinero real y hoy Inicio no las muestra, aunque ya existen en otras pantallas (Facturación, Compras/Por pagar).
- **Cómo lo verificas tú:** con un comprobante SUNAT pendiente o una factura vencida, aparece un renglón en «Por atender» con enlace.
- **Esfuerzo / dependencias:** M · por pagar solo a líder (mismo criterio que devoluciones en el análisis anterior).

### #5 · [Mejorar] Cabecera con `EncabezadoPagina`, como sus hermanas
- **Dónde:** `page.tsx:44-46`; `components/ui/EncabezadoPagina.tsx`.
- **Por qué en este puesto:** dos pantallas resuelven la misma cabecera de dos formas (Integridad conceptual); Caja, Cambios, Devoluciones y Pedidos no atendidos ya usan el componente.
- **Cómo lo verificas tú:** Inicio y Caja muestran la misma estructura de cabecera.
- **Esfuerzo / dependencias:** S.

### #6 · [Mejorar] «Hoy» del Taller, con órdenes por etapa
- **Dónde:** `lib/inicio-reglas.ts:19` (`mostrarHoy` excluye Taller); propuesto por la sesión anterior, `produccion-decisiones.ts` como fuente sugerida.
- **Por qué en este puesto:** el Taller es una sede (D-15) y hoy Inicio no le dice nada de "cómo va el día" a quien opera ahí.
- **Cómo lo verificas tú:** un usuario del Taller ve un bloque equivalente a «Hoy» con sus órdenes por etapa.
- **Esfuerzo / dependencias:** M · no antes de #2 (puede solaparse con la personalización por rol que decide esa sesión).

### #7 · [Corregir] Actualizar `docs/datos/11-KPIS.md:146` y el BACKLOG viejo
- **Dónde:** `docs/datos/11-KPIS.md:146` (cita `getPanelInicio`, ya no existe); `docs/BACKLOG.md` ~4747-4757 (cita `lib/pendientes.ts`, reemplazado).
- **Por qué en este puesto:** doc desactualizado que alguien puede tomar como vigente (regla del Paso 0 de este mismo proceso).
- **Cómo lo verificas tú:** los docs citan `lib/inicio.ts`/`lib/inicio-reglas.ts`, no las funciones viejas.
- **Esfuerzo / dependencias:** S.

### #8 · [Mejorar] Mostrar la caja de un solo modo
- **Dónde:** `page.tsx:164` (tarjeta de la integrante) vs. `inicio-reglas.ts:143-150` (acceso de la líder) — dos formas distintas de decir «caja abierta/cerrada».
- **Por qué en este puesto:** Integridad conceptual; el mismo dato se lee distinto según quién mira.
- **Cómo lo verificas tú:** líder e integrante ven el estado de caja con el mismo componente/formato.
- **Esfuerzo / dependencias:** S.

### #9 · [Mejorar] «Ver todo» en Actividad reciente
- **Dónde:** `page.tsx` (sección Actividad reciente, sin enlace a la lista completa).
- **Por qué en este puesto:** bajo valor, pero barato; hoy los 8 últimos son un callejón sin salida hacia Movimientos.
- **Cómo lo verificas tú:** un enlace lleva a `/inventario/movimientos` con el mismo filtro.
- **Esfuerzo / dependencias:** S — bajo valor.

### #10 · [Mejorar] `verifica-inicio.mjs` en CI
- **Dónde:** `scripts/demo/verifica-inicio.mjs` (existe, no corre en CI); `.github/workflows/ci.yml`.
- **Por qué en este puesto:** hay una prueba de escenarios reales (líder/integrante/Taller/fallos) que hoy solo corre a mano.
- **Cómo lo verificas tú:** el paso aparece en el CI y falla si se rompe un escenario.
- **Esfuerzo / dependencias:** S — bajo valor / futuro.

### #11 · [Eliminar/fusionar] Anexar al BACKLOG real las 12 tareas de la auditoría anterior
- **Dónde:** `docs/BACKLOG.md` (0 líneas con `pantalla:inicio` hoy); `docs/pantallas/inicio.md` (historial, versión anterior).
- **Por qué en este puesto:** quedaron propuestas y nunca aprobadas; varias de esta lista las reemplazan (#4/#5/#6/#9 de la versión anterior ya se cerraron con el código actual).
- **Cómo lo verificas tú:** el BACKLOG tiene las líneas vigentes de esta versión, no las de la vencida.
- **Esfuerzo / dependencias:** — (solo con tu aprobación, ver sección 11).

### #12 · [Replantear] ¿Por vendedor o por sede es la unidad de "ventas del día"?
- **Dónde:** decisión de fondo detrás de #1; ninguna D-nn la cubre.
- **Por qué en este puesto:** es la pregunta real detrás del rótulo mal puesto — decide Felipe (sección 8).
- **Cómo lo verificas tú:** con la decisión tomada, #1 se ejecuta según lo que se eligió.
- **Esfuerzo / dependencias:** — · antes de #1 si se opta por filtrar de verdad.
- **DECIDÍ (propuesta, no ejecutada):** ninguna — se propone para que Felipe decida.
- **DESCARTÉ:** N/A, es la tarea de decisión.
- **SE ROMPE SI:** se corrige el rótulo a «Ventas de la sede» sin decidir esto, y en 3 meses alguien pide "por vendedor" y hay que rehacerlo.

## 8 · Estrategia alternativa
No hay una alternativa de fondo a la estructura Hoy/Por atender/Ir a — ya está bien encaminada. La única decisión de fondo real es **#12** (¿por vendedor o por sede?) y **#2** (quién decide "Inicio por perfil": esta sesión o la del menú). No las duplico aquí porque ya están en las 12.

## 9 · Referentes de ERP y futuro
No se agregó nada nuevo desde el análisis anterior en este punto — mantenerlo breve.
- **Futuro:** «Hoy» del Taller con producción por etapa (#6) ya pasa el filtro de 3 tiendas + 1 taller; se ejecuta cuando se decida.

## 10 · Fuera de esta pantalla
**Dos sesiones de IA están a un paso de construir "Inicio por perfil" cada una por su cuenta, sin saberlo.** No es un defecto de la pantalla: es un defecto del tablero de coordinación (`SESIONES-ACTIVAS.md`), que registra la intención de una sesión («Inicio por perfil») pero no ve que la otra sesión ya construyó buena parte de eso bajo otro nombre («Hoy/Por atender/Ir a por rol»). Es exactamente el tipo de colisión que ese tablero nació para prevenir (BITACORA, incidente 2026-09-17), y está a punto de repetirse en la misma pantalla que ya lo sufrió una vez. Antes de que cualquiera de las dos sesiones toque personalización por rol de nuevo, alguien tiene que leer ambos planes juntos.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:inicio]` #1 «Tus ventas»: corregir el rótulo o filtrar de verdad por vendedor — S/M
- [ ] `[pantalla:inicio]` #2 Coordinar «Inicio por perfil» entre esta pantalla y la sesión del menú — decide Felipe
- [ ] `[pantalla:inicio]` #3 Verificar renumeración del ADR de «cuenta terminal» antes de mergear esa rama — verificación
- [ ] `[pantalla:inicio]` #4 Sumar SUNAT pendiente y por pagar a «Por atender» — M
- [ ] `[pantalla:inicio]` #5 Cabecera con `EncabezadoPagina` — S
- [ ] `[pantalla:inicio]` #6 «Hoy» del Taller con órdenes por etapa — M
- [ ] `[pantalla:inicio]` #7 Actualizar `11-KPIS.md` y el BACKLOG viejo — S
- [ ] `[pantalla:inicio]` #8 Un solo formato para el estado de caja — S
- [ ] `[pantalla:inicio]` #9 «Ver todo» en Actividad reciente — S (bajo valor)
- [ ] `[pantalla:inicio]` #10 `verifica-inicio.mjs` en CI — S (bajo valor / futuro)
- [ ] `[pantalla:inicio]` #11 Reemplazar en BACKLOG las 12 líneas vencidas de la auditoría anterior por estas — administrativo
- [ ] `[pantalla:inicio]` #12 Decidir: ¿"ventas del día" es por vendedor o por sede? — decide Felipe

## Historial
| Fecha | Modo | SHA | Cumple | Relevancia | Nota |
|---|---|---|---|---|---|
| 2026-09-21 | completo, SQL parcial | `f0f66b73` | 5.1 | 4.2 | Pantalla original (tarjetas de catálogo); vencido |
| 2026-09-21 | completo, sin SQL, datos de demo | `b6b85206`+`76503cf2` | 6.8 | 5.4 | Diseño nuevo (Hoy · Por atender · Ir a) de otra sesión; #4/#5/#6/#9 luego cerradas |
| 2026-09-22 | completo, sin SQL | `fa56e483` | 6.5 | 6.0 | Re-auditoría tras la reconstrucción; hallazgo nuevo: «Tus ventas» no es de la vendedora, es de toda la sede |
