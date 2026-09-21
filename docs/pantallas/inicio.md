# Pantalla — Inicio (`/`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder · TIENDA TRU · Datos: **parcial** (llegaron F2 —funciones— y A1 —columnas de `stock`—; el resto A–E sin datos reales, marcado `[no verificable]`)
> SHA analizado: `e14ef82c` — si `app/(app)/page.tsx`, `lib/movimientos-v2.ts` o `lib/persona-actual.ts` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/page.tsx` (99 líneas) · `lib/persona-actual.ts` · `lib/movimientos-v2.ts` + `movimientos-reglas.ts` · `lib/resultado.ts` · RPC `fn_movimientos`, `fn_persona_actual_resumen` · tablas `productos`, `variantes`, `stock`, `movimientos`
> Otra sesión tocándola: no la pantalla. Sí `AppShell.tsx` (menú lateral, 6 PRs abiertos): las tareas #4 y #10 se coordinan con esa sesión.

## 0 · Veredicto
Inicio es un tablero de 2026-09-11 que quedó congelado: muestra tres conteos de catálogo y los últimos 8 movimientos, y no dice nada de lo que una líder necesita al abrir la tienda (caja, ventas de hoy, qué espera atención). Dos de sus tres cifras además no significan lo que dice su rótulo.
**Cumple su finalidad:** 4.5/10 · **Relevancia:** 4.4/10 — Comodidad (por fórmula; es la puerta de entrada de todos, así que debería ser Núcleo)

## 1 · Finalidad declarada
"Esta pantalla existe para que quien entra a la sede vea de un vistazo qué necesita atender hoy y llegue en un toque a lo que va a hacer."
Fuente: BACKLOG (líneas 2586 y 4555: el Inicio anterior tenía «Hoy por sede» y una bandeja de pendientes) y `docs/datos/11-KPIS.md:146`. Los docs no la escriben con estas palabras: la deduzco de lo que el Inicio anterior hacía.
¿Docs y pantalla coinciden? **No.** El comentario de `page.tsx:8-15` declara lo contrario: «solo muestra lo que V2 puede probar hoy». Ese comentario está vencido: dice que V2 no tiene `stock_minimo`, y hoy `productos.stock_minimo` existe. Manda la finalidad de arriba; Felipe la corrige si falla.

## 2 · Objeción
**Los tres números de arriba (45 · 164 · 315) no ayudan a decidir nada y dos de ellos están mal rotulados.** Un líder no abre el sistema a preguntarse cuántos SKU hay. Se pregunta: ¿abrí caja?, ¿cuánto llevo vendido contra la meta?, ¿qué llegó?, ¿qué se agota? Todo eso ya existe en el sistema (Caja, `ubicaciones.meta_venta_diaria`, traslados en tránsito, `stock_minimo`) y Inicio no lo usa.
- «Productos activos» no filtra por activo (`page.tsx:21`): cuenta descontinuados, propuestos sin aprobar y la centinela «Cargo especial». `[código page.tsx:21]`
- «Variantes (SKU)» tampoco filtra y cuenta la variante centinela (`page.tsx:22`). `[código]`
- Mezcla alcances: dos cifras son de toda la empresa y la tercera es solo de la sede. `[código page.tsx:21-28]`
- La acción que más se hace en el mostrador, **vender, no está** entre las acciones. `[visto]` `[código page.tsx:56-62]`

Trade-off: arreglar los rótulos es barato (S). Convertir Inicio en «Hoy» cuesta más (L) y compite con el menú del mostrador que Felipe ya decidió construir. Recomiendo #1–#3 ya y decidir #5/#6/#12 junto con ese menú.

## 3 · Lo que está bien y no se toca
- La variante centinela ya se excluye del stock y de los movimientos: `neq("variante_id", ID_CARGO_ESPECIAL)` (`page.tsx:28`) y dentro de `fn_movimientos`. `[código]`
- Las funciones que la pantalla llama tienen `search_path` fijo; tres son `security definer` y `fn_puede_operar_ubicacion` es de invoker. `[producción F2]`
- Los `count` con `head: true` no sufren el límite de 1000 filas de PostgREST. `[código supabase/config.toml:21]`
- La sede sale del servidor (`fn_persona_actual_resumen` + cookie httpOnly validada con `fn_puede_operar_ubicacion`), no de un parámetro de la URL. `[código persona-actual.ts:48-79, app/actions/ubicacion.ts:22-39]`
- La actividad reutiliza `listarMovimientos`: una sola fuente de verdad con la pantalla de Movimientos. `[código page.tsx:31]`
- Contraste: `text-tinta/65` cumple el piso del ADR-0012 (5.14:1). Crema, tinta y rojo solo en hover. `[código globals.css]` `[visto]`
- Los destinos que enlaza existen todos. `[código]`

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | Sistema coherente, pero una celda gris sobrante, «CAYLA V2» a la vista y la sede repetida tres veces | `[visto]` `[código page.tsx:42,54]` |
| Lógica de negocio | 4 | Rótulos que no coinciden con la consulta; unidades sin descontar apartado; «SALIDA» para una venta | `[código page.tsx:21-28]` |
| Arquitectura | 5 | Un solo fallo tumba todo el Inicio; suma de stock en el navegador con tope de 1000 filas | `[código page.tsx:34-36]` |
| Funciones | 3 | Falta lo esencial (vender, caja, hoy, por atender); sobran tres tarjetas que repiten el menú | `[visto]` `[código]` |
| Utilidad | 5 | Una colaboradora nueva en hora pico tiene que ir al menú a buscar «Punto de Venta» | `[inferido]` |
| Conexión con el ERP | 4 | No lee de Caja, Traslados ni Apartados; consulta tablas directo en la página, sin `lib/` | `[código]` |

Promedio: 4.5. No aplica el tope de 5 por daño a dinero o stock: la pantalla solo lee.

**Estética.** (a) Coherencia: usa `card-cayla`, `label-cayla` y crema, igual que las hermanas. Pero `/caja` usa `EncabezadoPagina` (sede, título grande, subtítulo) e Inicio arma la cabecera a mano con el estilo viejo. `[código caja/page.tsx, page.tsx:41-44]` Las 5 tarjetas de acción van en 2 columnas: la sexta celda queda como un bloque gris, porque el color de la rejilla (`bg-tinta/12`, `page.tsx:54`) se ve donde no hay tarjeta. `[visto]` Es un defecto visible en la pantalla más vista. (b) Tono: «CAYLA V2 · TIENDA TRU» expone un nombre interno de versión que la colaboradora no necesita. `[visto]` (c) Heurística: «SALIDA» y «−1» repetidos sin hora ni quién no permiten escanear. `[visto]` Contraste real y foco: `[no verificable]` con una captura.

**Lógica de negocio.** Sin candado de negocio violado; no hay escritura. Pero el número mostrado engaña: (1) «Unidades» suma `cantidad` completa; otras pantallas restan `cantidad_apartada` (`lib/inventario-v2.ts:94`). **Hoy no es defecto:** A1 mostró que en producción `stock` NO tiene esa columna (la migración `20260920160000` sigue sin pegarse, BACKLOG l.64), así que no puede haber apartados. Pasa a ser defecto el día que se pegue. `[producción A1]` (2) La venta se rotula «SALIDA» porque una venta escribe `tipo='salida'` en `movimientos` (migración `20260919155000`, l.300-306): un retiro o una merma se ven igual. (3) Ninguna decisión escrita (D-nn) cubre qué debe mostrar Inicio a cada rol. D-13 (qué puede una líder) y D-14 (dónde manda) son las que habría que consultar al decidir #12.

**Arquitectura.** Cadena: `page.tsx` → `supabase.from(...)` directo → RLS (`stock_select` con `fn_puede_operar_ubicacion`; `productos_select` y `variantes_select` para cualquier autenticado) → `fn_movimientos`. Lectura pura: no hay transacción ni concurrencia que proteger. **Caída:** `exigir` lanza y `error.tsx` reemplaza toda la página por «No se pudo cargar» (`page.tsx:34-36`, `resultado.ts:40-50`); si `fn_movimientos` falla, la líder pierde también sus tres tarjetas. Debería degradarse así: «las tarjetas se ven, la actividad dice “no se pudo leer”», sin pintar cero (lección del BACKLOG 4565). **Volumen:** hoy 164 variantes `[visto]`; `stock` guarda una fila por variante, ubicación y sububicación, así que con unas 350 variantes y 3 sububicaciones por sede se cruza el tope de 1000 filas y la cifra queda corta sin aviso. Filas reales por sede: `[no verificable]`, falta C1. Datos personales: los movimientos traen `usuario_nombre`; Inicio no lo muestra hoy.

**Funciones.** *Existen y funcionan:* Buscar, Recibir, atajos a Inventario/Productos/Movimientos, actividad reciente `[visto]`. *Fantasma:* ninguna. *Faltan para cumplir la finalidad:* Vender, estado de caja, ventas de hoy contra `meta_venta_diaria`, pendientes por atender (traslados en tránsito —ya se cuentan para el badge «2», `AppShell.tsx:881`—, devoluciones por aprobar, productos bajo `stock_minimo`). *Sobran:* Inventario, Productos y Movimientos repiten entradas del menú lateral (`AppShell.tsx:989-995`).

**Utilidad (persona sin contexto).** Escenario 1: una colaboradora nueva, hora pico, una clienta quiere pagar. Abre el sistema, ve «Hola», tres números que no entiende y cinco tarjetas sin «Vender». Tiene que abrir el desplegable «Ventas» del menú. Si se equivoca, el fallo es del diseño. Escenario 2: la líder que abre la tienda quiere saber si abrió caja: no lo ve. `[inferido]`

**Conexión con el ERP.** *Aguas arriba:* `productos`/`variantes` (catálogo), `stock`, `movimientos` (fuente única, principio 4). *Aguas abajo:* nada consume lo que Inicio muestra; es solo lectura. *Pájaro dueño y vecinos:* pantalla transversal; vecinos naturales Caja, Ventas, Recibir, Traslados. Cruce con `AVIARIO.md`: `[no verificable]` aquí. *Externos:* ninguno; una caída de SUNAT/Nubefact/Culqi no la afecta.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 4 | Hoy no ayuda a decidir; no captura ningún dato del que dependan otras pantallas |
| Dinero y stock que toca | ×1 | 2 | Solo lectura; el riesgo es de mala información, no de mover plata |
| Frecuencia y personas que la usan | ×1 | 9 | Primera pantalla de todos, todos los días |
| Qué se detiene si falla | ×1 | 3 | El menú sigue funcionando; pero hoy toda la página cae por una consulta |

Relevancia = (2·4 + 2 + 9 + 3) / 5 = **4.4** → Comodidad. Con #5–#6 sube a Núcleo.

## 6 · Conexión con el ERP
- **Aguas arriba:** `productos`, `variantes`, `stock`, `movimientos` (`fn_movimientos`), `fn_persona_actual_resumen` para la sede.
- **Aguas abajo:** ninguna (solo lectura). Enlaza a `/buscar`, `/recibir`, `/inventario`, `/productos`, `/inventario/movimientos`; NO enlaza `/vender`, `/caja`, `/cambios`, `/devoluciones`, `/inventario/traslados`.
- **Pájaro dueño y vecinos:** transversal; Caja, Ventas, Traslados. `[no verificable]` sin abrir `AVIARIO.md`.
- **Externos, y qué pasa si caen:** ninguno. Si cae la base propia, `error.tsx` muestra «Reintentar» y «Volver al inicio»; ese segundo botón lleva a la misma pantalla que falló.

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Que «Productos activos» y «Variantes» cuenten lo que dicen — ✅ HECHA 2026-09-21 (B1: 39 activos + 6 descontinuados, todos aprobados; la tarjeta mostraba 45; sin commitear)
- **Dónde:** `page.tsx:21-22, 47-48`; `productos.estado`, `productos.estado_alta`, `variantes.activo`, `ID_CARGO_ESPECIAL`.
- **Por qué en este puesto:** es lo primero que ve cada persona al entrar y hoy puede afirmar un total falso; costo mínimo. Si no se hace, todos aprenden a desconfiar del primer número.
- **Cómo lo verificas tú:** corre B1/B2 del SQL; la tarjeta debe mostrar el mismo total que «estado activo, aprobado, sin la centinela».
- **Esfuerzo / dependencias:** S · ninguna (B1 fija el criterio correcto).

### #2 · [Corregir] Unidades de la sede: agregar en la base y restar el apartado
- **Dónde:** `page.tsx:23-28, 36-37`; `stock.cantidad`, `stock.cantidad_apartada`; `lib/inventario-v2.ts:94` (cómo se calcula `disponible`).
- **Por qué en este puesto:** hoy la suma se hace en el navegador y se corta en 1000 filas sin aviso, y cuenta como disponible lo apartado. Es el único número que mueve decisiones de reposición.
- **Cómo lo verificas tú:** C1 (filas de la sede) y C2 (apartado); la tarjeta debe igualar `sum(cantidad − cantidad_apartada)` sin la centinela.
- **Esfuerzo / dependencias:** S–M · **restar el apartado NO se puede hasta que `20260920160000` esté en producción** (A1: la columna no existe; leerla rompería Inicio). Mientras tanto, solo agregar en la base para salir del tope de 1000 filas.

### #3 · [Corregir] Que un fallo no tumbe todo Inicio — ✅ HECHA 2026-09-21 (sin commitear)
- **Dónde:** `page.tsx:34-36` (`exigir` → `tolerar`, `lib/resultado.ts`); `error.tsx`.
- **Por qué en este puesto:** hoy una consulta de una tarjeta pinta pantalla de error a toda la sede en hora pico. Regla del BACKLOG 4565: un bloque caído no se muestra como cero ni como «todo bien», se muestra «no se pudo leer».
- **Cómo lo verificas tú:** corta temporalmente la lectura de actividad y comprueba que las tarjetas siguen y la actividad dice «no se pudo leer», nunca «0».
- **Esfuerzo / dependencias:** S · ninguna.

### #4 · [Mejorar] «Vender» y «Caja» como primeras acciones
- **Dónde:** `page.tsx:56-62`; rutas `/vender`, `/caja`; menú `AppShell.tsx:938-944`.
- **Por qué en este puesto:** es lo que la colaboradora más hace; el mostrador va primero (decisión de Felipe). Sin esto, cada venta empieza con una búsqueda en el menú.
- **Cómo lo verificas tú:** entra como integrante en TRU y llega a «Punto de Venta» en un toque desde Inicio.
- **Esfuerzo / dependencias:** S · coordinar con la sesión que toca `AppShell.tsx` para no duplicar decisiones.

### #5 · [Reconstruir] Bloque «Hoy en TRU»: ventas, caja y meta
- **Dónde:** `page.tsx` (bloque nuevo); leer de `lib/caja.ts` / `lib/panel-serie.ts`, `ubicaciones.meta_venta_diaria`, `ventas`. De dónde leer exactamente: verificarlo al empezar.
- **Por qué en este puesto:** responde la pregunta real de la líder: ¿cómo va el día? Sin esto Inicio sigue siendo un catálogo.
- **Cómo lo verificas tú:** registra una venta de prueba en TRU y el monto del día sube en Inicio; abre y cierra caja y el estado cambia.
- **Esfuerzo / dependencias:** L · después de #3 y de #11.
- **DECIDÍ:** reutilizar la lectura de Caja/panel ya construida, sin tabla nueva ni caché.
- **DESCARTÉ:** una vista materializada de «ventas del día», porque con 3 tiendas y pocas decenas de ventas por hora no hay volumen que la justifique y añade otro estado que sincronizar.
- **SE ROMPE SI:** Caja e Inicio calculan el «hoy» con zonas horarias distintas y una venta de las 23:50 en Lima aparece en el día equivocado en una de las dos.

### #6 · [Reconstruir] Bandeja «Por atender» que se esconde si no hay nada
- **Dónde:** `page.tsx` (bloque nuevo); `lib/traslados.ts:222` (`getTrasladosPorAtender`, ya calculado en el layout), devoluciones por aprobar, `productos.stock_minimo`.
- **Por qué en este puesto:** convierte Inicio en lista de trabajo; el dato del badge «2» ya existe y hoy solo se ve como un puntito.
- **Cómo lo verificas tú:** con un traslado `en_transito` hacia TRU, la bandeja lo muestra con enlace; sin pendientes, desaparece; con la consulta caída, dice «esta bandeja está incompleta».
- **Esfuerzo / dependencias:** L · no antes de la #3; comparte lectura con #5.
- **DECIDÍ:** una bandeja única y corta (máximo 5 renglones) en vez de un contador por módulo.
- **DESCARTÉ:** notificaciones o correos, porque quien necesita esto ya está frente a la pantalla y añadirlos crea una segunda fuente de verdad sobre qué está pendiente.
- **SE ROMPE SI:** la consulta falla y el bloque se esconde: parece «día tranquilo» cuando hay un traslado sin recibir.

### #7 · [Corregir] Rótulo y contenido de «Actividad reciente» — ✅ HECHA 2026-09-21 (`etiquetaActividad` + 3 pruebas; sin commitear)
- **Dónde:** `page.tsx:77-83`; `lib/movimientos-v2.ts` (`ETIQUETA_CATEGORIA`, campo `venta`), `movimientos-reglas.ts:26`.
- **Por qué en este puesto:** «SALIDA» para una venta no distingue una venta de una merma, y sin hora ni comprobante no se puede actuar.
- **Cómo lo verificas tú:** haz una venta y un retiro; Inicio debe rotular «Venta» y «Retiro» y mostrar la hora.
- **Esfuerzo / dependencias:** S · ninguna.

### #8 · [Corregir] Celda gris sobrante en «Acciones» — ✅ HECHA 2026-09-21 (sin verla en navegador)
- **Dónde:** `page.tsx:54` (`gap-px … bg-tinta/12`).
- **Por qué en este puesto:** defecto visible en la pantalla más vista; una línea, pero no cambia el negocio.
- **Cómo lo verificas tú:** con 5 y con 6 tarjetas, no debe verse ningún bloque gris vacío.
- **Esfuerzo / dependencias:** S · si #4 agrega tarjetas, hacerlo junto con #4.

### #9 · [Mejorar] Cabecera al estilo de las hermanas — ✅ HECHA 2026-09-21 (sin verla en navegador)
- **Dónde:** `page.tsx:41-44`; `components/ui/EncabezadoPagina.tsx` (como `/caja`).
- **Por qué en este puesto:** retira «CAYLA V2» y la sede repetida (selector, cabecera y tarjeta); dos pantallas resuelven lo mismo de dos formas y una está mal.
- **Cómo lo verificas tú:** Inicio y Caja muestran la misma cabecera y en ninguna aparece «V2».
- **Esfuerzo / dependencias:** S · ninguna.

### #10 · [Eliminar/fusionar] Quitar las tarjetas que repiten el menú — bajo valor
- **Dónde:** `page.tsx:57-62` (Inventario, Productos, Movimientos); menú `AppShell.tsx:989-1011`.
- **Por qué en este puesto:** antes de agregar (#5, #6), borrar. Deja Buscar y Recibir si tras #4 siguen justificadas. Valor bajo: son tarjetas que no dañan.
- **Cómo lo verificas tú:** Inicio queda con Vender, Caja, Buscar y Recibir; nadie pierde una ruta (el menú las conserva).
- **Esfuerzo / dependencias:** S · no antes de #4 ni de la decisión de #12.

### #11 · [Conectar] Mover las lecturas a `lib/inicio.ts` con reglas probadas
- **Dónde:** `page.tsx:20-37` → `apps/web/lib/inicio.ts` (+ `inicio.test.ts`); convención del repo (`lib/` para datos y reglas).
- **Por qué en este puesto:** hoy la página consulta tablas directo y lleva un comentario vencido (l.8-15). Sin esto, #1, #2 y #5 quedan sin pruebas.
- **Cómo lo verificas tú:** `pnpm test` incluye pruebas de los conteos (centinela excluida, apartado restado); el comentario obsoleto ya no está.
- **Esfuerzo / dependencias:** M · mejor junto con #1–#3.

### #12 · [Replantear] ¿Un mismo Inicio para todos?
- **Dónde:** `page.tsx` completa; `persona.rol`, `ubicacionTipo === 'taller'` (`persona-actual.ts`).
- **Por qué en este puesto:** es la decisión de fondo; el resto mejora la pantalla actual. Decide Felipe (sección 8).
- **Cómo lo verificas tú:** con una líder, un integrante y un usuario del Taller, cada uno aterriza en lo que hace.
- **Esfuerzo / dependencias:** M–L · después de que Felipe decida.
- **DECIDÍ (propuesta, no ejecutada):** Inicio por rol: integrante → acciones de mostrador; líder → «Hoy» + «Por atender»; Taller → Producción.
- **DESCARTÉ:** un solo Inicio con todos los bloques, porque un integrante vería cifras que D-13 reserva a la líder y ocuparía pantalla que necesita para vender.
- **SE ROMPE SI:** una líder que cubre otra sede (D-14) queda con la cookie `cayla_ubicacion_activa` de la sede anterior y lee el Inicio equivocado sin notarlo.

## 8 · Estrategia alternativa
**A · Inicio actual mejorado (#1–#11).** Ganas: bajo riesgo, un diseño para todos, entrega en pasos verificables. Pagas: el integrante sigue dando un paso extra para vender.
**B · Inicio por rol, o aterrizar en la tarea principal.** Integrante entra directo a `/vender`; líder a «Hoy» con «Por atender»; Taller a Producción. Ganas: cada persona empieza donde trabaja; menos que mantener. Pagas: hay que decidir qué ve cada rol (D-13/D-14 no lo cubren) y más pruebas por rol.
Mi recomendación: A ahora (#1–#3, #7–#9), B cuando se decida el menú del mostrador. **Decide Felipe.**

## 9 · Referentes de ERP y futuro
Filtro: ¿le sirve a 3 tiendas y 1 taller hoy? *(De memoria, no verificado.)*
- Los POS tipo Shopify/Lightspeed abren en un resumen del día con ventas y caja del turno. Pasa el filtro: es #5.
- Odoo separa un tablero por aplicación con tarjetas de «por atender». Pasa el filtro: es #6.
- **Futuro:** vista consolidada de las 3 tiendas y el Taller para quien lidera varias sedes; comparativo contra meta mensual; alertas de rotación. No cuentan entre las 12.

## 10 · Fuera de esta pantalla
**La variante centinela «Cargo especial» es un caso especial repartido por el sistema, y esta pantalla ya lo olvidó dos veces.** Vive en `productos` y `variantes` como si fuera mercadería, con 999.999 unidades, y cada pantalla debe acordarse de excluirla por id: `page.tsx:28`, `fn_movimientos`, `fn_movimientos_resumen`, `lib/inventario-v2.ts`. Inicio la excluye del stock pero no de los conteos de las líneas 21-22. Cada pantalla nueva es otra oportunidad de olvidarlo y contaminar un número. Mejor rediseñar que recordar (exigencia 6, eliminar el caso especial): que la centinela no sea una variante de `variantes`, o que una vista `variantes_mercaderia` sea lo único que las pantallas lean. Es una decisión de modelo de datos: se propone, no se ejecuta.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:inicio]` #1 Que «Productos activos» y «Variantes» cuenten activos, aprobados y sin la centinela — S
- [ ] `[pantalla:inicio]` #2 Unidades de la sede: agregar en la base y restar apartado — S–M
- [ ] `[pantalla:inicio]` #3 Que un fallo no tumbe todo Inicio (`exigir` → `tolerar`, con aviso) — S
- [ ] `[pantalla:inicio]` #4 «Vender» y «Caja» como primeras acciones — S
- [ ] `[pantalla:inicio]` #5 Bloque «Hoy en TRU»: ventas, caja y meta — L
- [ ] `[pantalla:inicio]` #6 Bandeja «Por atender» que se esconde si no hay nada — L
- [ ] `[pantalla:inicio]` #7 «Actividad reciente»: Venta vs Retiro, con hora — S
- [ ] `[pantalla:inicio]` #8 Celda gris sobrante en «Acciones» — S
- [ ] `[pantalla:inicio]` #9 Cabecera con `EncabezadoPagina`, sin «V2» — S
- [ ] `[pantalla:inicio]` #10 Quitar tarjetas que repiten el menú — S (bajo valor, después de #4)
- [ ] `[pantalla:inicio]` #11 Lecturas a `lib/inicio.ts` con pruebas — M
- [ ] `[pantalla:inicio]` #12 Replantear: Inicio por rol (decide Felipe) — M–L

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | «CAYLA V2 · TIENDA TRU» + «Hola, [colaborador]» | Saluda y nombra la sede | ajustar | `[visto]` `page.tsx:42` |
| Tarjetas | Productos activos (45) | Cuenta filas de `productos` | ajustar | `page.tsx:21,47` |
| Tarjetas | Variantes (SKU) (164) | Cuenta filas de `variantes` | ajustar | `page.tsx:22,48` |
| Tarjetas | Unidades en TRU (315) | Suma `stock.cantidad` de la sede | ajustar | `page.tsx:23-28,49` |
| Acciones | Buscar | Va a `/buscar` | bien | `[visto]` |
| Acciones | Recibir mercadería | Va a `/recibir` | bien | `[visto]` ADR-0111/0113 |
| Acciones | Inventario, Productos, Movimientos | Repiten el menú | sobra | `AppShell.tsx:989-1011` |
| Acciones | Celda gris vacía | Efecto de la rejilla | ajustar | `[visto]` `page.tsx:54` |
| Acciones | Vender, Caja | — | falta | `[código]` |
| Actividad | 8 últimos movimientos «SALIDA … −1» | Historial de la sede | ajustar | `page.tsx:31,77-83` |
| Menú | Badge «2» en Inventario | Traslados por atender | bien | `AppShell.tsx:881-882` |
| Menú | Botón «+ Nuevo», selector de sede | Crea y cambia de sede | bien | `AppShell.tsx:462-469,1207` |
| Ausente | Ventas de hoy, estado de caja, pendientes | — | falta | — |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo (SQL parcial: F2 y A1) | 4.5 | 4.4 | — (primer análisis; #3, #7, #8 y #9 se cerraron el mismo día) |
