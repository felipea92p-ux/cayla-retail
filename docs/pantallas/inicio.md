# Pantalla — Inicio (`/`, `app/(app)/page.tsx`)

> Modo: completo, **sin SQL de producción** (Felipe pidió trabajar sin producción) · Fecha: 2026-09-21 · Rol/sede: líder en Tienda TRU (captura) + colaboradora, Taller y fallas simuladas en la demo · Datos: **prueba** (servidor falso `scripts/demo/supabase-falso.mjs`, cifras ficticias)
> SHA analizado: `b6b85206` (`origin/main`, la rama iba 0/0) **más** los 4 archivos de Inicio traídos de `origin/claude/inicio-hoy-por-atender` (`76503cf2`): `page.tsx`, `lib/inicio.ts`, `lib/inicio-reglas.ts`, `lib/inicio-reglas.test.ts`. Si alguno cambia después, este análisis está vencido.
> Archivos: `apps/web/app/(app)/page.tsx` · `lib/inicio-reglas.ts` · `lib/inicio.ts` · `lib/caja.ts` (`getCajaAbierta`, `getVentasMismaHoraSemanaAnterior`) · `lib/caja-panel-reglas.ts` (`comparativoSemanaAnterior`) · `lib/traslados.ts` · `lib/movimientos-v2.ts` · RPC `fn_ventas_del_dia`, `fn_movimientos` · tablas `ventas`, `venta_items`, `ubicaciones` (`meta_venta_diaria`), `movimientos`
> Otra sesión tocándola: **posible choque.** `docs/SESIONES-ACTIVAS.md` (fila `brave-northcutt-7a1d2c`, menú) dice que sigue con «Inicio por perfil». Ninguna fila nombra `page.tsx`, pero es la misma idea que la tarea #3: hay que hablar con esa sesión antes de decidir.
> Lo verificado en navegador: la demo corre en `localhost:50557`, `verifica-inicio.mjs` pasa los 6 escenarios (líder con caja abierta y cerrada, colaboradora, Taller, falla de ventas, de traslados y de movimientos) y las 15 pruebas de `inicio-reglas.test.ts` pasan. **No verificado: RLS, RPC reales, cifras reales, rendimiento.**

## 0 · Veredicto
Ya responde las tres preguntas con que se abre el sistema (¿cómo voy?, ¿qué me toca?, ¿a dónde voy?) y falla por bloque sin mentir con ceros. Le faltan las colas que mueven dinero (SUNAT, por pagar), la rejilla no alinea, y en el celular lo accionable queda bajo el pliegue.
**Cumple su finalidad:** 6.8/10 (antes 5.1) · **Relevancia:** 5.4/10 — Comodidad (antes 4.2). Sube a ≈ 6.2 (Soporte) cuando «Por atender» cubra SUNAT y por pagar (cálculo mío, no medición).

## 1 · Finalidad declarada
"Esta pantalla existe para que quien abre sesión vea, en 5 segundos, cómo está su sede hoy y qué le toca atender, y llegue en un clic a lo que va a hacer."
Fuente: **inferida**; sale de `docs/datos/11-KPIS.md:146` («Inicio = hoy por sede + tendencia de 14 días») y del BACKLOG (`lib/pendientes.ts`, «la bandeja del Inicio», ~línea 4661). Ningún doc la escribe para el Inicio actual.
¿Docs y pantalla coinciden? **No.** Los dos docs describen el Inicio V1 (`getPanelInicio`, `lib/pendientes.ts`), que ya no existe. Manda el código. El comentario de `page.tsx:10-20` es hoy la única descripción fiel. Felipe corrige la finalidad si falla.

## 2 · Objeción
**«Ventas» y «Meta del día» son la cifra que la líder va a repetir en voz alta, y hoy nada garantiza que sea la misma que la de Caja ni que sea neta.** `fn_ventas_del_dia` suma `venta_items.subtotal` sin anuladas (migración `20260921103000`), y `page.tsx` la suma en JS (`inicio-reglas.ts:54`). Esa suma **no descuenta devoluciones ni cambios** `[inferido]`: la función no los mira y no leí otra RPC que los reste `[no verificable]`. Una tarde con cambios mostraría más de lo cobrado y la barra de meta se llenaría de más.
Trade-off: reutilizar la fuente de Caja fue lo correcto (una sola definición de «hoy»); el hueco es que si «hoy» de Caja ya es bruto, Inicio hereda el defecto en vez de corregirlo.
Segunda objeción, de diseño y visible: **en el celular las tres tarjetas de «Hoy» apiladas ocupan casi toda la primera pantalla** y «Por atender» y «Vender» quedan bajo el pliegue `[visto, 390 px]`. En el mostrador (tablet/celular) lo que se hace es vender, no leer.

## 3 · Lo que está bien y no se toca
- **Cada bloque falla solo y lo dice:** ventas caídas → «No se pudieron cargar las ventas de hoy. Lo demás… está al día»; traslados caídos → chip «?»; actividad caída → aviso. Nunca un 0 mudo. `[visto demo, 3 fallas]` `[código page.tsx:33-39, inicio.ts:27-34]`
- **Sin tope de 1.000 filas:** se quitó la suma de stock en JS que cortaba en silencio. `[código]`
- **Misma fuente que Caja** para ventas, semana pasada y meta, y el «2» de traslados es el del menú (`getTrasladosPorAtender`). `[código inicio.ts:2, page.tsx:30]`
- **Decisión por tipo de ubicación, no por nombre** (`accesosInicio`, `mostrarHoy`): un segundo Taller o una cuarta tienda entran solos. Reglas puras y con 15 pruebas. `[código inicio-reglas.ts:19,119]` `[verificado: tests]`
- **El comparativo dice de qué día habla** («vs. lunes pasado») y compara hasta la misma hora, no contra el día entero. `[código caja.ts:158-169]`
- **Rojo en reposo: 0.** Solo hover; ámbar/verde para estados; crema y tinta, sin blanco ni negro puros. `[visto]` `[código page.tsx:63]`
- **Vocabulario:** «colaboradora», «Tu día», «Recibir», sin «sucursal». `[visto]`
- **Cae bien:** el error de la sección no tumba el menú (`(app)/error.tsx`), y `(app)/loading.tsx` usa `EsperaPantalla` (ADR-0149). `[código]`

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con la marca; rejilla 3 / 2 / 3 columnas desalineada, tres tarjetas iguales sin jerarquía y voz de errores inconsistente | `[visto]` `[código page.tsx:59,80,141]` |
| Lógica de negocio | 6 | «Ventas» bruta y sin garantía de cuadrar con Caja; «Valor medio S/ 0» sin ventas; meta ausente desaparece sin avisar | `[código inicio-reglas.ts:54-71, page.tsx:154]` `[inferido]` |
| Arquitectura | 7.5 | Solo lectura, falla por bloque, sin tope; trae la lista completa de ventas (con sus ítems en jsonb) solo para sumar | `[código]` |
| Funciones | 6.5 | Todo lo visible funciona; faltan SUNAT y por pagar; el Taller no tiene «Hoy» | `[visto demo]` `[código inicio-reglas.ts:90]` |
| Utilidad | 7.5 | En 5 segundos la líder ve cómo va y la colaboradora sabe si puede vender; en celular se pierde lo accionable | `[visto]` `[inferido]` |
| Conexión con el ERP | 6.5 | Bien atada a Caja y a traslados; desconectada de SUNAT, compras, producción y de sus propios docs | `[código]` |

**Cumple su finalidad = (7 + 6 + 7.5 + 6.5 + 7.5 + 6.5) / 6 = 6.8.** Sin tope: pantalla de solo lectura, no puede dañar dinero ni stock; la objeción #2 es de fidelidad de una cifra, no de un candado.

### Estética — 7
- (a) **Coherencia:** `card-cayla`, `label-cayla`, `font-display` en cifras, `tinta/65`; chip ámbar `#8c631f` con texto crema. Ámbar sobre crema es 4.72:1 según `globals.css:35`; el texto crema sobre ámbar no lo medí `[no verificable]`. Comparación con hermanas: comparte tarjetas y tipografía con Caja; no comparé capturas.
- **Rejilla desalineada** `[visto]`: «Hoy» va en 3 columnas, «Por atender» en 2 (`page.tsx:59`) y «Ir a» en 3. Con una sola cola, la tarjeta ocupa media fila y su borde derecho no cae en ninguna columna de arriba ni de abajo. Con la segunda cola se arregla sola, hoy se ve suelta.
- **Jerarquía plana:** tres tarjetas del mismo peso. La que pide acción (meta al 83 %, faltan S/ 260) pesa igual que «Valor medio», que es informativa.
- (b) **Tono:** «Así va Tienda TRU» y el saludo son buenos. Los avisos de fallo hablan en dos voces: «No pude leer esto» (`inicio-reglas.ts:98`, `page.tsx:165`, primera persona) y «No se pudo cargar…» (`page.tsx:37,131`, impersonal).
- (c) **Heurísticas:** contraste OK en lo medido; tamaño táctil de tarjetas ~88 px OK; el chip «?» es críptico para quien no sabe qué falló (Nielsen: ayudar a reconocer el error).
- **Celular** `[visto, 390 px]`: una columna, legible, sin scroll horizontal; el problema es de orden vertical (ver objeción).

### Lógica de negocio — 6
- **Bruto vs. neto** (objeción #2). ADR-0110 define «venta» como lo cobrado sin anuladas `[según migración 20260921103000]`; cómo entran cambios y devoluciones: ninguna decisión escrita que yo haya leído lo cubre para este bloque `[no verificable]`.
- **«Valor medio de venta» = S/ 0 con 0 ventas** (`inicio-reglas.ts:68`): un promedio sin ventas no es cero, es «—». A las 9 a. m. la líder lee «S/ 0».
- **Meta ausente:** si la sede no tiene `meta_venta_diaria`, `r.meta` es `null` y la tarjeta simplemente no se dibuja (`page.tsx:154`); quedan dos tarjetas en una grilla de tres y nadie sabe que falta configurar la meta.
- **Comparativo `null`** cuando la semana pasada fue cero: la tarjeta cae a «8 ventas» sin decirlo (`page.tsx:143-147`); mismo hueco silencioso.
- **La colaboradora ve su caja como tarjeta, la líder como acceso.** Dos formas de mostrar lo mismo; una está mal (`page.tsx:164` vs `inicio-reglas.ts:134-142`).
- **Candado D-13 (ADR-0143):** solo la líder cierra caja y ajusta stock; Inicio no ofrece ninguna de las dos, correcto.
- **Referentes** (de memoria, **no verificado**; el traspaso dice que se leyeron en docs públicos, no en las pantallas): Shopify POS y Lightspeed abren con el resumen del día y accesos; Odoo con colas por procesar. Pasa el filtro «¿3 tiendas y 1 taller hoy?»: sí. No pasa (va a Futuro): gráficos de tendencia y comparativos entre sedes.

### Arquitectura — 7.5
- Cadena: `page.tsx` → `requirePersonaActualV2` → en paralelo `getHoyDeLaSede` (caja + `fn_ventas_del_dia` + semana pasada + `getUbicaciones`), `getTrasladosPorAtender`, `listarMovimientos(limite 8)` → reglas puras → JSX. `[código]`
- **Estados imposibles:** no aplica, no escribe.
- **Concurrencia:** la lectura puede quedar vieja segundos; aceptable. Si dos ventas entran mientras carga, la próxima recarga cuadra.
- **Caída externa:** Inicio no toca SUNAT/Nubefact/Culqi. **Se degrada así, no pierde ningún dato:** cada bloque cae solo con su aviso. Cuando se sumen las colas SUNAT, «pendiente» debe aparecer sin tumbar la pantalla (principio 9).
- **Volumen:** ventas del día = decenas por sede `[inferido]`; el riesgo no es cuántas sino que `fn_ventas_del_dia` devuelve por venta un `jsonb` con todos los ítems y Inicio solo usa `total`. A 3 tiendas y unas 100 ventas/día es irrelevante; se vuelve tema si el mostrador crece 10×. Números de producción: `[no verificable]` sin SQL.
- **`getUbicaciones()` trae todas las ubicaciones** para leer una meta (`inicio.ts:54`); son pocas filas, sin problema hoy.
- **`tolerarLectura` deja el error solo en `console.error`** (`inicio.ts:31`): en producción nadie lo ve. Está bien para el usuario, pero sin log observable un «No se pudieron cargar las ventas» recurrente pasa inadvertido.
- **Seguridad (lente RLS):** el filtro por rol lo hace la RPC (`security definer`, migración `20260921103000`) y la actividad la acota `fn_puede_operar_ubicacion`. **No verificado contra RLS real** (la demo no lo prueba).

### Funciones — 6.5
- **Funcionan:** las 6 rutas destino existen (`/vender`, `/caja`, `/buscar`, `/recibir`, `/produccion`, `/inventario`, `/inventario/traslados`) `[código]`; los 6 escenarios de la demo devuelven lo esperado `[visto]`.
- **Fantasma:** ninguna.
- **Faltan:** cola de comprobantes SUNAT pendientes y de compras por pagar (solo líder, `fn_puede_ver_dinero_de_compras`); «Hoy» del Taller (órdenes por etapa: el Resumen de Producción de #231 ya calcula «qué necesita mi decisión hoy»).
- **Sobran / duplican:** «Caja» y «Recibir» ya están en el menú. «Buscar» es la única puerta que solo existe aquí.

### Utilidad — 7.5
Escenario 1, colaboradora nueva a las 7 p. m.: abre, ve «Tu día: S/ 410», «Caja: Abierta · Puedes vender» y un botón negro «Vender». No duda. **Falla al revés:** con la caja cerrada el texto dice «Ábrela en Caja para vender», pero el botón «Vender» sigue siendo el principal y negro; toca «Vender» y recién ahí se entera `[inferido, no probé el POS con caja cerrada]`.
Escenario 2, líder a las 6 p. m.: lee ventas, valor medio y 83 %; «Faltan S/ 260» le dice cuánto empujar. No ve si hay comprobantes SUNAT rechazados ni cuentas por pagar: para eso sigue entrando a Facturación y Compras `[inferido]`.
Escenario 3, celular: la líder abre en el mostrador y tiene que bajar dos pantallas para llegar a «Vender»; la barra inferior sí trae Punto de Venta, así que no se queda sin camino `[visto]`.

### Conexión con el ERP — 6.5
- **Aguas arriba:** ventas (`fn_ventas_del_dia`), caja (`getCajaAbierta`), traslados, ledger `movimientos`, `ubicaciones.meta_venta_diaria`.
- **Aguas abajo:** ninguna, solo navega.
- **Pájaro dueño y vecinos:** `[no verificable]`, `docs/datos/generado/AVIARIO.md` no menciona Inicio (grep sin resultados). Vecinos por código: Caja (misma fuente), Movimientos, Recibir.
- **Desconectada de:** Facturación/SUNAT, Compras por pagar, Producción. **Desconectada de sus propios docs:** `11-KPIS.md:146` sigue diciendo `getPanelInicio`; el BACKLOG (~4661) sigue hablando de `lib/pendientes.ts`; el comentario de `(app)/layout.tsx:13` es de otra época.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | La líder decide con Hoy y meta; sin SUNAT ni por pagar no cubre lo que más cuesta |
| Dinero y stock que toca | ×1 | 2 | Solo lectura; muestra dinero pero no lo mueve |
| Frecuencia y personas que la usan | ×1 | 10 | Aterrizaje de todos los roles y sedes en cada sesión |
| Qué se detiene si falla | ×1 | 3 | Nada operativo: el menú sigue y todo se alcanza desde él |

Relevancia = (2·6 + 2 + 10 + 3) / 5 = **5.4** → Comodidad. Con Gestión en 8 (colas SUNAT y por pagar): (16 + 2 + 10 + 3) / 5 = 6.2 → Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas` / `venta_items` (vía `fn_ventas_del_dia`), `cajas`, traslados, `movimientos`, `ubicaciones`.
- **Aguas abajo:** ninguna.
- **Pájaro dueño y vecinos:** `[no verificable]`; vecinos: Caja, Movimientos, Recibir.
- **Externos, y qué pasa si caen:** ninguno hoy. Al sumar SUNAT, «pendiente» debe leerse aunque Nubefact no responda.

## 7 · Las 12 tareas, por importancia

### #1 · [Mejorar] Colas SUNAT pendiente y compras por pagar en «Por atender»
- **Dónde:** `lib/inicio-reglas.ts:90` (`colasInicio`), `page.tsx:58-76`; hay que subir a `lib/` la lectura que hoy vive dentro de `lib/comprobantes.ts` y de `compras/por-pagar`, y `fn_puede_ver_dinero_de_compras` para el filtro.
- **Por qué en este puesto:** es lo que sube Gestión de 6 a 8 y la relevancia a Soporte. Un comprobante SUNAT rechazado o una deuda vencida son lo más caro de no ver. Riesgo: duplicar la definición de «pendiente»; por eso la lectura se sube, no se copia.
- **Cómo lo verificas tú:** con un comprobante `pendiente` en la sede, «Por atender» muestra la cola con su cifra y coincide con Facturación; con la lectura forzada a fallar aparece «?», no un bloque vacío. La colaboradora no ve la cola de por pagar.
- **Esfuerzo / dependencias:** L · antes que la #5 (la rejilla se arregla sola con 2–3 colas).

### #2 · [Corregir] Cuadrar «Ventas» con Caja y decidir si es bruta o neta de cambios y devoluciones
- **Dónde:** `inicio-reglas.ts:54` (suma en JS), `fn_ventas_del_dia` (suma `venta_items.subtotal`, migración `20260921103000`), `caja/page.tsx:73`. Una sola definición, en SQL o en un `lib/`, que use Caja e Inicio.
- **Por qué en este puesto:** es la cifra que se cita en voz alta y contra la que se mide la meta. Hoy no tiene garantía de cuadrar. Riesgo: decisión de negocio (¿el cambio a otra prenda resta?), no de código.
- **Cómo lo verificas tú:** contra base real (Docker + `supabase start`, no la demo): registra una venta de S/ 100 y una devolución de S/ 30; «Ventas» de Inicio y el total de `/caja` deben decir lo mismo, y lo que digan debe ser lo que Felipe defina.
- **Esfuerzo / dependencias:** M · no antes de tener base real (prueba de RLS incluida).

### #3 · [Replantear] Un Inicio distinto por perfil, decidido por Felipe
- **Dónde:** `inicio-reglas.ts:119` (`accesosInicio`) y `page.tsx` completo; toca el menú (`lib/menu.ts`, ADR-0144).
- **Por qué en este puesto:** hoy hay un solo `page.tsx` con bloques por rol (opción B del análisis anterior); nadie decidió. `SESIONES-ACTIVAS.md` dice que otra sesión trabaja «Inicio por perfil». Si se hacen a espaldas, chocan.
- **Cómo lo verificas tú:** una sección «Estrategia alternativa» (abajo) con Ganas/Pagas; tú decides. Nada se construye hasta entonces.
- **Esfuerzo / dependencias:** S para decidir · antes de la #8 (Hoy del Taller depende de qué ve cada rol).
- **DECIDÍ:** plantear la decisión, no tomarla. **DESCARTÉ:** tres pantallas distintas (líder, colaboradora, taller) por ahora, porque triplica mantenimiento con tres tiendas y un taller, y las reglas de `inicio-reglas.ts` ya alcanzan. **SE ROMPE SI:** una sesión implementa «Inicio por perfil» en el menú mientras otra sigue con bloques por rol: dos definiciones del mismo Inicio y una colaboradora ve lo que no debe.

### #4 · [Mejorar] Que en el celular «Por atender» y «Vender» queden sobre el pliegue
- **Dónde:** `page.tsx:141` (`grid-cols-1 gap-3` para las tres tarjetas de Hoy). En móvil, una sola tarjeta con las tres cifras en fila, o fila horizontal compacta.
- **Por qué en este puesto:** el mostrador es celular/tablet; lo que se hace ahí es vender. Hoy la primera pantalla de 844 px se va en tres tarjetas de 165 px cada una.
- **Cómo lo verificas tú:** abre `/` a 390 px: se ven las cifras de Hoy, «Por atender» y el botón «Vender» sin bajar más de una pantalla.
- **Esfuerzo / dependencias:** S · ninguna.

### #5 · [Corregir] Alinear la rejilla: «Por atender» en las mismas 3 columnas
- **Dónde:** `page.tsx:59` (`sm:grid-cols-2`) → `sm:grid-cols-3`; hoy la tarjeta única queda a media fila.
- **Por qué en este puesto:** es lo primero que se nota al comparar con la captura; cuesta una línea. No daña nada, por eso va abajo del bloque de dinero.
- **Cómo lo verificas tú:** en escritorio, los bordes derecho e izquierdo de «Por atender» caen en las mismas columnas que «Hoy» e «Ir a».
- **Esfuerzo / dependencias:** S · después de la #1 (con más colas se ve si el 3 alcanza).

### #6 · [Corregir] Estados vacíos honestos: valor medio, meta ausente, comparativo sin base
- **Dónde:** `inicio-reglas.ts:68` (`ventas > 0 ? … : 0` → `null`), `page.tsx:154` (tarjeta de meta) y `:143-147` (comparativo).
- **Por qué en este puesto:** a primera hora «Valor medio S/ 0» es un número falso con cara de verdad (mismo defecto que la auditoría anterior corrigió en las tarjetas de catálogo). Si no se hace, la líder aprende a no creerle a la pantalla.
- **Cómo lo verificas tú:** con la demo sin ventas: «Valor medio» dice «—»; sin `meta_venta_diaria` la tarjeta muestra «Sin meta — configúrala en Ubicaciones» en vez de desaparecer; sin semana anterior dice «sin base para comparar».
- **Esfuerzo / dependencias:** S · ninguna.

### #7 · [Eliminar/fusionar/conectar] Mostrar la caja de un solo modo
- **Dónde:** `page.tsx:164` (tarjeta Caja de la colaboradora) y `inicio-reglas.ts:134-142` (acceso «Caja» de la líder).
- **Por qué en este puesto:** el mismo dato en dos formas. Si el estado de caja es información, va como estado (chip en «Hoy»); si es acción, va como acceso. Además con caja cerrada «Vender» debería dejar de ser el botón principal para quien no puede vender (el texto ya lo dice).
- **Cómo lo verificas tú:** con `__mock/caja?abierta=0`: líder y colaboradora ven el estado igual y «Abrir caja» pasa a principal.
- **Esfuerzo / dependencias:** S · después de la #3 (depende de qué ve cada rol).

### #8 · [Mejorar] «Hoy» del Taller (órdenes por etapa)
- **Dónde:** `inicio-reglas.ts:19` (`mostrarHoy` devuelve `false` fuera de tiendas), `lib/produccion-decisiones.ts` (Resumen de #231, ya en `main`).
- **Por qué en este puesto:** el Taller abre Inicio y ve solo «Traslados por recibir». Reutiliza lo ya calculado en Producción; no crea otra definición.
- **Cómo lo verificas tú:** con `__mock/rol?r=taller`, aparece un bloque con órdenes por etapa que coincide con `/produccion`.
- **Esfuerzo / dependencias:** M · después de la #3.

### #9 · [Corregir] Una sola voz en los avisos de fallo
- **Dónde:** `inicio-reglas.ts:98` y `page.tsx:165` («No pude leer esto») frente a `page.tsx:37,131` («No se pudo cargar…»). Sustituir el «?» del chip por un texto que diga qué reintentar.
- **Por qué en este puesto:** cosmético pero visible en la única pantalla que todos ven; el modo de fallo es lo que más se lee cuando algo anda mal.
- **Cómo lo verificas tú:** `__mock/falla?que=ventas,traslados,movimientos`: los tres avisos suenan igual y dicen dónde ir.
- **Esfuerzo / dependencias:** S · ninguna.

### #10 · [Corregir] Docs obsoletos, ADR, BACKLOG y BITACORA
- **Dónde:** `docs/datos/11-KPIS.md:146` (`getPanelInicio`), `docs/BACKLOG.md` ~4661 (`lib/pendientes.ts`), `apps/web/app/(app)/layout.tsx:13`; ADR nuevo con la decisión de la #3; 3 líneas en `docs/BITACORA.md`.
- **Por qué en este puesto:** principio 8 del repo. Sin esto, el próximo análisis vuelve a tomar la finalidad de un doc que describe una pantalla que ya no existe.
- **Cómo lo verificas tú:** `grep -rn "getPanelInicio\|lib/pendientes" docs apps` no devuelve nada vigente.
- **Esfuerzo / dependencias:** S · después de la #3 (el ADR depende de la decisión).

### #11 · [Mejorar] «Ver todo» en Actividad reciente · *bajo valor*
- **Dónde:** `page.tsx:106`; enlace a `/inventario/movimientos`.
- **Por qué en este puesto:** la lista muestra 8 y no lleva a ningún lado. Cómodo, no necesario: el menú ya tiene Movimientos.
- **Cómo lo verificas tú:** el enlace abre Movimientos ya filtrado a la sede.
- **Esfuerzo / dependencias:** S · ninguna.

### #12 · [Mejorar] Que `verifica-inicio.mjs` corra en CI y una prueba con base real · *bajo valor / futuro*
- **Dónde:** `scripts/demo/verifica-inicio.mjs` y `.github/workflows/ci.yml`.
- **Por qué en este puesto:** la demo no prueba RLS ni RPC (dicho en su propio encabezado); sirve para ver la pantalla, no para blindarla. Vale más la prueba real de la #2.
- **Cómo lo verificas tú:** CI verde con el paso nuevo; una rama que rompa un bloque lo hace fallar.
- **Esfuerzo / dependencias:** M · después de la #2.

## 8 · Estrategia alternativa
**El Inicio como bandeja de decisiones en vez de tablero.** Hoy: Hoy → Por atender → Ir a → Actividad. Alternativa: solo «Lo que necesita tu decisión» (traslados, SUNAT, por pagar, meta en riesgo) arriba y las cifras del día en una franja compacta, como en el Resumen de Producción (#231).
- **Ganas:** la pantalla responde en 3 segundos «¿qué hago ahora?» y escala solo: cada módulo nuevo agrega una cola, no una tarjeta. Resuelve la objeción del celular.
- **Pagas:** la líder pierde la vista de «cómo voy» a simple vista (queda en una franja); requiere que cada módulo exponga su cola en `lib/`; y si no hay nada pendiente la pantalla queda casi vacía.
Decide Felipe (tarea #3).

## 9 · Referentes de ERP y futuro
- **De memoria, no verificado en producto real:** Shopify POS y Lightspeed abren con el resumen del día y accesos; Odoo con colas por procesar. La mezcla actual sigue esa lógica.
- **Futuro** (no pasa el filtro «3 tiendas y 1 taller hoy»): serie de tendencia de 14 días, comparativos entre sedes, gráficos.

## 10 · Fuera de esta pantalla
**`docs/pantallas/inicio-traspaso.md` (§7) avisa de una migración de producción pendiente que no es de Inicio: `20260920160000_apartar_stock.sql` no está en producción y `main` ya lee `stock.cantidad_apartada` en Existencias y Apartar.** Hay que pegarla antes de desplegar la web o esas pantallas fallan. No pude confirmar si ya se pegó `[no verificable]`; en esta rama tampoco encontré el registro en el BACKLOG.

## Estado de las 12 tareas de la auditoría anterior
El análisis previo (SHA `f0f66b73`) quedó **vencido**: la pantalla se rehízo. Se reutiliza solo lo que sigue abierto.

| # anterior | Tarea | Hoy |
|---|---|---|
| 1 | Rótulos y filtros de las tarjetas | ✅ cerrada (las tarjetas se retiraron) |
| 2 | Bloque «Hoy» | ✅ cerrada; queda la fidelidad de la cifra → **#2 nueva** |
| 3 | «Por atender» | 🟡 abierta → **#1 nueva** |
| 4 | Decidir Inicio por rol | ⏳ abierta → **#3 nueva** |
| 5 | Quitar tarjetas duplicadas y celda gris | ✅ cerrada |
| 6 | Acciones por rol y ubicación | ✅ cerrada |
| 7 | Actividad legible | ✅ cerrada |
| 8 | Degradar por bloque | ✅ cerrada |
| 9 | Suma sin tope de 1.000 | ✅ cerrada |
| 10 | Quitar «V2» y la sede repetida | ✅ cerrada |
| 11 | Reglas en `lib/` con prueba | ✅ cerrada (15 pruebas) |
| 12 | Docs obsoletos | ⏳ abierta → **#10 nueva** |

## Historial
| Fecha | Modo | SHA | Cumple | Relevancia | Nota |
|---|---|---|---|---|---|
| 2026-09-21 | completo, SQL parcial | `f0f66b73` | 5.1 | 4.2 | Pantalla antigua (tarjetas de catálogo); vencido |
| 2026-09-21 | completo, sin SQL | `b6b85206` + Inicio de `76503cf2` | 6.8 | 5.4 | Diseño nuevo (Hoy · Por atender · Ir a); datos de demo, no de producción |
| 2026-09-21 | implementación | (sin commit aún) | — | — | Hechas #4 (celular), #5 (rejilla 3 columnas), #6 (estados vacíos) y #9 (una voz en los avisos); verificado en demo a 390 px y en escritorio, sin producción |

## Líneas propuestas para BACKLOG.md
*(Felipe aprueba antes de anexarlas. No toqué el BACKLOG.)*
- [pantalla:inicio] #1 Sumar colas SUNAT pendiente y compras por pagar a «Por atender» (subir su lectura a `lib/`; por pagar solo líder).
- [pantalla:inicio] #2 Cuadrar «Ventas» de Inicio con Caja y decidir si es neta de cambios y devoluciones (probar contra base real).
- [pantalla:inicio] #3 Decidir el Inicio por perfil (coordinar con «Inicio por perfil» de la sesión del menú) y escribir el ADR.
- [pantalla:inicio] #4 Celular: «Por atender» y «Vender» sobre el pliegue.
- [pantalla:inicio] #5 Alinear «Por atender» a 3 columnas.
- [pantalla:inicio] #6 Estados vacíos honestos: valor medio «—», meta ausente, comparativo sin base.
- [pantalla:inicio] #7 Mostrar la caja de un solo modo (estado vs. acción).
- [pantalla:inicio] #8 «Hoy» del Taller con órdenes por etapa (reusar `produccion-decisiones.ts`).
- [pantalla:inicio] #9 Una sola voz en los avisos de fallo.
- [pantalla:inicio] #10 Corregir docs obsoletos (`11-KPIS.md:146`, BACKLOG ~4661, `layout.tsx:13`) + ADR + BITACORA.
- [pantalla:inicio] #11 «Ver todo» en Actividad reciente (bajo valor).
- [pantalla:inicio] #12 `verifica-inicio.mjs` en CI y prueba con base real (bajo valor / futuro).
