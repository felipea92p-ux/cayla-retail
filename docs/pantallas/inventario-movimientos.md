# Pantalla — Movimientos (`/inventario/movimientos`)

> Modo: **completo** · Fecha: 2026-10-03 · Rol/sede: cuenta de aparato «Almacén Trujillo», Tienda TRU, escritorio
> (~1.000 px de contenido) · Datos: **real** — producción, solo lectura, consultas agregadas sin datos personales, corridas por
> Claude con el MCP de Supabase (precedente aceptado; no se leyó ni una fila con nombre).
> SHA analizado: `6a6ab03a` (origin/main). La rama de trabajo iba 12 commits detrás, pero los archivos de esta pantalla
> son idénticos a `origin/main` (`git diff --stat HEAD origin/main` vacío sobre ellos).
> **El análisis del 2026-09-26 (SHA `9f0d2f3b`) quedó vencido:** desde entonces la pantalla cambió en 866 líneas (ADR-0241,
> el cajón del 2026-09-28 y sus dos simplificaciones del 2026-10-01). Este lo reemplaza; su historial sigue abajo.
> Archivos: `app/(app)/inventario/movimientos/page.tsx` · `components/FiltrosMovimientos.tsx` · `MovimientosLista.tsx` ·
> `FilaMovimiento.tsx` · `CajonMovimiento.tsx` · `MenuMovimientos.tsx` · `ui/TarjetaCifra.tsx` · `ui/lista-actividad.tsx` ·
> `lib/movimientos-reglas.ts` · `lib/movimientos-v2.ts` · `lib/movimientos-saldo.ts` · `lib/movimientos-cajon.ts` · RPC
> `fn_movimientos`, `fn_movimientos_resumen_procesos`, `fn_movimientos_saldos` · tabla `movimientos`.
> Otra sesión tocándola: **no** (ninguna fila viva en `SESIONES-ACTIVAS.md` ni PR abierto sobre estos archivos; la de
> Actividad, PR #745, puso disparadores en la tabla `movimientos`, no en la pantalla).
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` · `[inferido]` · `[no verificable]`.

## 0 · Veredicto

Se ve mal por **acumulación**, no por un color: cinco rediseños en dos semanas sumaron piezas y ninguno quitó, y hoy cada dato
se dice dos o tres veces con unidades distintas. Lo grave no es estético: **la tarjeta «Ajustes +52» esconde 35 prendas que
faltaron, y la banda «HOY · 14 movimientos» dice 14 cuando el día llevaba unas 90 operaciones.**
**Cumple su finalidad:** 5,7/10 · **Relevancia:** 6,0/10 — **Soporte**

## 1 · Finalidad declarada

«Que cualquier integrante de la sede sepa **por qué** el stock es el que es —qué entró, qué salió, quién y contra qué
documento— y desde ahí llegue al proceso que lo originó.» Fuente: ADR-0127, ADR-0234, ADR-0241 y `docs/ARQUITECTURA.md`
(Inventario V2). Es de **consulta**: no escribe, y el libro es inmutable.

¿Docs y pantalla coinciden? **No, en un punto:** `docs/ARQUITECTURA.md:244-248` y ADR-0241 §1 dicen que el detalle trae los
atajos «Seguir con esta prenda» (Cambio, Devolución, Bajar al piso, Etiquetas, Contar, Corregir). **No existen:**
`atajosDeMovimiento` y `atajosDeOperacion` (`lib/movimientos-atajos.ts:86,133`) solo los llaman sus pruebas; el cajón que
reemplazó al detalle (2026-09-28, `CajonMovimiento.tsx:15-21`) no los monta. Manda la pantalla (es lo que la gente ve); los
docs están desactualizados, y la decisión de Felipe del 2026-09-26 («los cuatro atajos») se perdió sin que nadie la
revocara. Ver tarea #12.

## 2 · Objeción (lo peor arriba)

1. **«Ajustes +52» es un neto que esconde las pérdidas.** `[producción]` En TRU, 30 días: los ajustes **sumaron 87 y restaron
   35**. La tarjeta muestra +52 en tinta, sin alarma (`page.tsx:225-227`), y el desglose también resta dentro de cada motivo
   (`desgloseCifras`, forma `neto`, `lib/movimientos-reglas.ts:800-808`): «−5 por conteo» son +4 y −9; «+24 por conteo
   físico» son +37 y −13; «+7 por otro motivo» son +20 y −13. Una encargada que entra a ver «¿se me pierde ropa?» lee +52 y
   concluye que sobra. **Lo que faltó no se compensa con lo que apareció:** son dos preguntas distintas (¿se pierde? ¿de dónde
   sale?), y el neto responde mal a las dos. Trade-off de arreglarlo: una cifra más en la tarjeta.
2. **La banda negra dice un número falso.** `[producción]` `[código MovimientosLista.tsx:161]` «HOY · 14 MOVIMIENTOS» cuenta
   las operaciones **de la página cargada** (50 filas, `lib/movimientos-v2.ts:39`), no las del día. A las 17:23 TRU llevaba
   179 filas, unas 90 operaciones. Es el elemento más pesado de la pantalla y el único con una cifra equivocada.
3. **Cada número se dice dos veces, con unidades distintas.** `[visto]` `[código FiltrosMovimientos.tsx:256-260]` Tarjeta
   «Salió −30» (prendas) y píldora «Salidas 26» (operaciones); tarjeta «+753» y píldora «Entradas 139»; «152 movidas entre
   piso y almacén» y píldora «Piso ↔ almacén 99». Nadie sin contexto adivina que 26 y 30 son la misma cosa medida distinto.
   Ninguna regla escrita pide las cifras en las píldoras: vienen de la demo del 2026-09-22 («cantidades por tipo en cada
   chip»), anterior a las tarjetas tocables.
4. **Ajustes con papeles y sin papeles se leen igual.** `[producción]` «por conteo» (13 filas, del módulo Conteo, con
   documento) y «por conteo físico» (45 filas, **escritas a mano en Ajustar stock por 8 personas, sin documento**, 3 con nota)
   son casi la misma palabra. De 94 ajustes en 30 días, 80 no tienen documento y 5 tienen nota.
5. **La fila de bajadas usa las palabras que el propio ADR declaró incomprensibles.** `[visto]` `[código
   FilaMovimiento.tsx:283,295]` «3 veces · 27 tallas · ⇄ 27». ADR-0241, «Actualización 2026-10-01», quitó del cajón «veces»,
   «tallas» y «⇄» porque «no se entendían»; la fila que abre ese cajón los conserva. Y «tallas» cuenta talla × color
   (`lib/movimientos-reglas.ts:722`), no tallas.

## 3 · Lo que está bien y no se toca

- **El libro es inmutable de verdad.** `[producción]` `authenticated` no tiene INSERT/UPDATE/DELETE sobre `movimientos`;
  disparadores `movimientos_inmutables` y `movimientos_sin_truncate` activos. La pantalla no puede mentir escribiendo.
- **Las cifras cuadran con la base.** `[producción]` Entradas 139 (137 de stock inicial + 2 anulaciones), Salidas 26, Piso ↔
  almacén 99, Ajustes 75 = Todos 339: la clave de operación de ADR-0234 D2 funciona. El problema es cómo se presentan, no
  cómo se calculan (salvo la banda del día).
- **Disciplina de color.** `[código]` Menos tipográfico U+2212 (`textoDelta`), verde solo cuando entra, rojo solo cuando un
  ajuste resta, «Salió» en neutro a propósito (`page.tsx:245`). Ningún hex suelto.
- **Referencia viva:** la boleta abre la venta (`FilaMovimiento.tsx:128-129`); traslado y conteo abren su pantalla y vuelven
  con los filtros (`?volver=`).
- **Lectura desde la tienda y una fila por operación** (ADR-0234 D1/D2), cursor que nunca corta una operación
  (`lib/movimientos-v2.ts:197-216`), RPC `security definer` que revisan el permiso de la sede.
- **El cajón simplificado del 2026-10-01**: una frase con el número grande y quién; es el mejor texto de la pantalla.
- **Celular** (no juzgado en esta captura): franja única de cifras, buscador fijo con cámara, filtros en hoja (`page.tsx:232-241`,
  `FiltrosMovimientos.tsx:324-434`).

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 5 | Acumulación: sede ×5, período ×4, cada cifra dos veces, cuatro lenguajes de filtro, el elemento más pesado es una fecha | `[visto]` `page.tsx:243-251` |
| Lógica de negocio | 5 | El neto de ajustes esconde −35; «30 vendidas» incluye 2 anuladas; con y sin documento se leen igual | `[producción]` `movimientos-reglas.ts:770-808` |
| Arquitectura | 7 | Libro sano; la cifra del día se calcula sobre la página; lecturas y código muertos | `MovimientosLista.tsx:161` `movimientos-v2.ts:276` |
| Funciones | 6 | Filtrar, buscar, cajón, exportar y copiar enlace funcionan; los atajos documentados no existen | `movimientos-atajos.ts:86,133` |
| Utilidad | 4 | Una encargada sin contexto saca tres conclusiones falsas en la primera pantalla | recorrido §4.5 |
| Conexión con el ERP | 7 | Enlaza a venta, traslado, conteo e historial; perdió la salida hacia «qué hago ahora» | `CajonMovimiento.tsx:15-21` |

### 4.1 Estética

**(a) Coherencia con CAYLA.** Usa los tokens y las piezas del sistema (`EncabezadoPagina`, `TarjetaCifra`, `pildora-cayla`,
`card-cayla`); rojo dentro del tope de 2 (solo un ajuste negativo, hoy ninguno a la vista). Pero se aparta de sus hermanas:
- **Separador de día:** banda negra `bg-tinta` (`ui/lista-actividad.tsx:35`, decisión de Felipe del 2026-10-01: «que el día se
  vea de un golpe»). La comparte Conteo (`ConteosLista.tsx:64-67`); Historial de ventas usa una línea taupe con un punto
  (`HistorialVentasLista.tsx:82-95`). Dos soluciones para lo mismo: una está mal (ver tarea #10).
- **Etiquetas de tarjeta:** Existencias y Traslados no repiten sede ni período en sus tarjetas (`InventarioPanel.tsx:752-792`,
  `TrasladosResumen.tsx:54-107`); Movimientos sí, en las tres (`page.tsx:243,247,251`). El porqué está escrito
  (`page.tsx:196-199`: «comparar dos tiendas sin darse cuenta es fácil si la sede solo está arriba, en chico»), pero la sede ya
  está tres veces arriba (barra, sobretítulo y ahora tres etiquetas) y en el celular la misma pantalla la dice **una** vez.
- **Filtros:** cuatro lenguajes en una tarjeta `[código FiltrosMovimientos.tsx]` — píldoras de período (`pildora-cayla`), píldoras
  de tipo con cifra y × (la misma clase, otro contenido), segmentado de Zona hecho a mano en hueso (`:280-291`) y píldoras
  «sutil» de proceso (`:301-317`). Historial de ventas resuelve lo mismo con `DesplegablePildora`; Traslados con el mismo
  segmentado hueso. **Integridad conceptual rota a nivel ERP, no solo aquí.**

**(b) Marca y tono.** La cabecera serif, el crema y el papel están bien. Lo que rompe el tono es la densidad: la tarjeta de
Ajustes es un párrafo de 6 cifras corridas más una oración «Además…» `[visto]`, que estira las tres tarjetas a la misma altura
y deja a «Entró» y «Salió» con media tarjeta vacía.

**(c) Heurísticas.**
- *Jerarquía:* lo más oscuro de la página es «HOY · 14 MOVIMIENTOS» (tinta sobre crema, el único bloque negro). El ojo va
  primero a una fecha, después al título, al final a los datos. `[visto]`
- *Estado visible:* la tarjeta «Entró» se ve más oscura en la captura. No está activa: es el hover (`TarjetaCifra.tsx:137`,
  `hover:bg-sand/30` contra `bg-sand/40` activa: 10 puntos de diferencia). Con «Todos» negro y «Entró» oscurecida, la pantalla
  muestra dos «seleccionados» que se contradicen. Y la tarjeta tocable no tiene ninguna señal de que se toca (ni flecha ni
  `aria-current`).
- *Separadores que chocan:* «+1 por ajuste · encontrada tras un conteo» — el « · » que separa cifras también vive dentro de la
  etiqueta, así que se lee como dos ítems (bug: falta `hallazgo_conteo` en `FRASE_PROCESO`, `movimientos-reglas.ts:770-796`; cae
  al respaldo que pega la etiqueta de la fila).
- *Ruido repetido en la fila:* «Piso» dos veces (bajo el nombre y en «Piso → Cliente»); «Salida · Venta» + «Piso → Cliente» dicen
  lo mismo; el punto gris de una venta no informa nada (cuatro colores de punto sin leyenda, `lista-actividad.tsx:22-30`); cuatro
  colibríes iguales al 30 % donde no hay foto (`PrendaCelda.tsx:27-33`).
- *Cabecera:* el subtítulo deja «qué.» solo en la segunda línea (`EncabezadoPagina.tsx:54`, `max-w-md` sin `text-wrap: pretty`);
  el «⋯» de 36 px queda solo en el extremo derecho, centrado contra un bloque de 140 px.
- *Contraste:* `Traslados 0` apagada al 40 % `[código FiltrosMovimientos.tsx:87]` queda bajo 3:1 `[inferido]`; aceptable para
  algo deshabilitado (WCAG lo exime), pero se ve roto, no «vacío».

### 4.2 Lógica de negocio

- **Neto de ajustes** (objeción 1). Ninguna D-nn cubre cómo se resume un ajuste. La práctica de retail (merma reportada en bruto,
  no compensada) es de memoria `[no verificable aquí]`, pero el argumento no la necesita: con +87/−35, el neto contesta una
  pregunta que nadie hace.
- **«30 vendidas» incluye 2 anuladas.** `[producción]` `[código]` La anulación es `tipo='entrada', motivo='anulacion_venta'`
  (`20260922151500_comprobantes_cola_de_reintento.sql:304-306`) y va a «Entró: 2 por venta anulada». Es coherente con ADR-0234
  D1 (todo lo que sumó stock es entrada), pero la palabra «vendidas» en «Salió» afirma 30 ventas cuando quedaron 28.
- **Con y sin documento** (objeción 4). ADR-0235 ya avisó que si los ajustes se usan de puerta «Ajustes deja de ser una señal».
  Cerró la primera carga, pero en 30 días hubo +82 a mano (conteo físico, otro, reposición) contra +5 de conteos reales.
- **«Además, 152 movidas entre piso y almacén»** vive dentro de la tarjeta «Ajustes» (`page.tsx:259`), y no es un ajuste: no cambia
  el total (lo dice la misma frase). Está en la caja equivocada.
- **«Entró +753 · 751 de stock inicial»**: el 99,7 % de lo que «entró» en el mes es la carga de arranque (ADR-0212). Es verdad y
  D1 lo pide así; dejará de pesar el 2 de noviembre. Sin tarea.

### 4.3 Arquitectura

- **Estados imposibles:** el libro no se puede editar ni borrar (revocado + disparadores `enable always`). La pantalla no escribe.
  Bien.
- **Transacción:** no aplica (solo lectura). Las tres RPC leen en su propia consulta; las cifras y la lista pueden ver instantes
  distintos si alguien vende entre una y otra `[inferido]` — irrelevante para una consulta.
- **Concurrencia:** dos sesiones leyendo no chocan. Lo frágil es la **clave de operación** escrita en dos lugares
  (`claveOperacion` en TS y el `count(distinct …)` de `fn_movimientos_resumen_procesos`), ya anotado en ADR-0234 D2.
- **Caída externa:** no tiene integraciones. Si la RPC de cifras falla, la página muestra una nota en su lugar (`page.tsx:119`): se
  degrada sin cifras y no pierde nada porque no guarda nada.
- **Volumen:** 834 filas en producción hoy; 200 en las últimas 24 h (carga). Régimen estimado: 3 tiendas × ~100 filas/día ≈ 110 mil
  filas/año, ~330 mil en 3 años. Con cursor e índice por sede y fecha, la lista no sufre; `fn_movimientos_saldos` tiene tope de
  1000 ids (`20260927173000:60-62`), holgado para páginas de 50.
- **Cifra del día por página** (objeción 2): el conteo del día debería salir de la base, o no mostrarse.
- **Lecturas y código muertos:** `stockHoy` se lee por cada prenda (`movimientos-v2.ts:276`) y esta pantalla ya no lo usa;
  `accesos.puedeAjustar` (`page.tsx:157`) no lo lee nadie; `lib/movimientos-atajos.ts` (+12 pruebas) no tiene llamador.
- **Hueco de pruebas:** ninguna exige que cada proceso de `ETIQUETA_PROCESO` tenga su `FRASE_PROCESO`; por eso `hallazgo_conteo`
  pasó. El neto de ajustes solo se prueba con «−1 por conteo» (`movimientos-reglas.test.ts:657-660`).

### 4.4 Funciones

- **Existen y funcionan:** buscador que entiende procesos, período, tipo, zona, tarjetas que filtran, cajón de detalle, boleta que
  abre la venta, Exportar a Excel y Copiar enlace (en «⋯»), paginación por cursor.
- **Fantasma:** los atajos «Seguir con esta prenda» (documentados, probados, no montados).
- **Faltan para la finalidad:** ver lo que **faltó** separado de lo que apareció; distinguir un ajuste con respaldo de uno a mano.
- **Sobran:** la sede y el período en cada tarjeta; las cifras de las píldoras (otra unidad); la cifra de la banda del día (falsa);
  la segunda línea «Piso → Cliente» en una venta.

### 4.5 Utilidad — recorrido sin contexto

*Sábado 17:30, la encargada de TRU nota que en el piso faltan dos polos y abre Movimientos.*
1. Ve «Ajustes +52 unidades» → «sobra mercadería, no se perdió nada». **Falso:** faltaron 35.
2. Ve «Salió −30» y la píldora «Salidas 26» → ¿30 o 26? No hay cómo saberlo sin preguntar.
3. Ve «HOY · 14 MOVIMIENTOS» → «hoy pasó poco». **Falso:** pasaron ~90.
4. Toca «Ajustes 75» para buscar las pérdidas → 75 filas mezcladas, sumas y restas; no hay «solo lo que faltó».
5. Ve «3 veces · 27 tallas ⇄ 27» → no entiende qué es (el ADR-0241 ya lo comprobó).
Tres conclusiones falsas antes de bajar al primer movimiento. El fallo es del diseño.

### 4.6 Conexión con el ERP

Ver §6.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Es la única ventana al libro de stock de la sede: donde se ve la merma y quién ajusta; no captura datos para otras pantallas |
| Dinero y stock que toca | ×1 | 6 | No mueve stock, pero es donde se audita cada unidad que entra o se pierde |
| Frecuencia y personas que la usan | ×1 | 5 | El líder la revisa al cierre; las integrantes cuando algo no cuadra |
| Qué se detiene si falla | ×1 | 3 | Nada operativo se detiene (venta, traslado y conteo siguen); se pierde la auditoría |

Relevancia = (2·8 + 6 + 5 + 3) / 5 = **6,0** → **Soporte**.

Cumple su finalidad = (5 + 5 + 7 + 6 + 4 + 7) / 6 = **5,7**. Sin tope: la pantalla no escribe, así que no puede dañar dinero ni
stock; sí esconde un daño que ya ocurrió (objeción 1).

## 6 · Conexión con el ERP

- **Aguas arriba:** todo lo que mueve stock escribe en `movimientos`: Vender (venta, anulación), Cambios, Devoluciones, Compras
  (recepción), Traslados, Conteo, Ajustar stock y Bajar al piso (Existencias, ADR-0306), Apartados, carga inicial (ADR-0212).
- **Aguas abajo:** nada consume lo que muestra (es consulta). Sale hacia la venta (boleta), el traslado, el conteo y el historial
  de la prenda. **Perdió** la salida hacia el trabajo siguiente (los atajos).
- **Pájaro dueño y vecinos:** Halcón — Inventario y movimientos (`DICCIONARIO-RETAIL.md` §05). Vecinos: Existencias (el stock
  que este libro explica), Conteo (la fuente de los ajustes con respaldo), Actividad (ADR-0207, que ya anota estos movimientos).
- **Externos, y qué pasa si caen:** ninguno directo. SUNAT/Lucode solo afectan a la boleta que se enlaza: si Lucode no responde,
  el movimiento de la venta igual existe (lo escribe `registrar_venta`, no la transmisión) y la referencia muestra el número.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Ajustes en bruto: lo que faltó y lo que apareció, nunca un neto
- **Dónde:** `page.tsx:225-227,250-260` (tarjeta y franja del celular) · `lib/movimientos-reglas.ts:800-808` (`desgloseCifras`,
  forma `neto`) · el dato ya existe: `CifrasGrupo.entran` y `.salen` por proceso.
- **Por qué en este puesto:** es la única cifra de la pantalla que lleva a una conclusión de negocio equivocada sobre pérdida de
  stock (+52 visible, −35 escondido). Sin esto, la merma de la primera tienda real se lee como sobrante.
- **Cómo lo verificas tú:** TRU, 30 días → la tarjeta dice «−35 faltaron · +87 aparecieron» (el −35 en rojo, que es uno de los dos
  rojos permitidos) y el desglose por motivo trae las dos caras («conteo físico +37 / −13»). Prueba en `movimientos-reglas.test.ts`
  con un motivo que suma y resta en el mismo período.
- **Esfuerzo / dependencias:** S · ninguna. Va antes de la #7 (que acorta el desglose).

### #2 · Corregir — Que se note qué ajuste tiene respaldo y cuál es a mano
- **Dónde:** `ETIQUETA_PROCESO` y `FRASE_PROCESO` (`lib/movimientos-reglas.ts:102-110,770-790`) · la fila (`FilaMovimiento.tsx`)
  · `fn_movimientos_resumen_procesos` ya distingue `conteo` (con `conteo_item_id`) de `conteo_fisico` (sin él).
- **Por qué en este puesto:** 80 de 94 ajustes de TRU no tienen documento y 5 tienen nota; «por conteo» y «por conteo físico» se
  leen como sinónimos aunque solo uno está respaldado por un conteo. Es lo que vuelve auditable la #1.
- **Cómo lo verificas tú:** en la tarjeta y en la fila, el ajuste del módulo Conteo dice «por un conteo» con enlace al Conteo N, y
  el de Ajustar stock dice «a mano» con su motivo («a mano · conteo físico») y «sin nota» si no la tiene.
- **Esfuerzo / dependencias:** S · después de la #1. **Las palabras exactas las decide Felipe** (son vocabulario del negocio).

### #3 · Corregir — La banda del día dice un número falso
- **Dónde:** `MovimientosLista.tsx:159-164` (`dia.operaciones.length` de la página cargada).
- **Por qué en este puesto:** el elemento más visible de la lista muestra «14» cuando el día llevaba ~90 operaciones `[producción]`.
  Un número falso en grande le quita crédito a todos los demás.
- **Cómo lo verificas tú:** TRU, «Hoy», sin filtros → la banda dice «HOY» sin cifra (recomendado: quitarla; el número del día ya lo
  dan las tarjetas con el período «Hoy») o la cifra coincide con la de la píldora «Todos» con período «Hoy».
- **Esfuerzo / dependencias:** S (quitarla) · M (traerla de la base por día).

### #4 · Corregir — «+1 por ajuste · encontrada tras un conteo» y la prueba que lo habría atajado
- **Dónde:** `FRASE_PROCESO` (`lib/movimientos-reglas.ts:770-790`): falta `hallazgo_conteo` → «encontrada tras un conteo» ·
  `movimientos-reglas.test.ts`: una prueba que recorra **todo** `ETIQUETA_PROCESO` y exija su frase (como pide ADR-0290 para las
  sugerencias: totalidad).
- **Por qué en este puesto:** bug visible hoy en la tarjeta; la prueba evita el siguiente proceso nuevo sin frase.
- **Cómo lo verificas tú:** la tarjeta dice «+1 encontrada tras un conteo», sin el « · » partido. Borrar a propósito una frase del
  mapa hace fallar la prueba.
- **Esfuerzo / dependencias:** S · ninguna.

### #5 · Corregir — «30 vendidas» cuando 2 se anularon
- **Dónde:** desglose de «Salió» (`page.tsx:247-248`) y de «Entró» (`:243-244`).
- **Por qué en este puesto:** «vendidas» afirma una cifra de ventas que no es; el líder la cruza con Caja y no cuadra.
- **Cómo lo verificas tú:** TRU, 30 días → «Salió: 30 vendidas · 2 se anularon después» y «Entró: … 2 volvieron por venta
  anulada». La regla D1 (la anulación es entrada) no cambia.
- **Esfuerzo / dependencias:** S · ninguna.

### #6 · Replantear — ¿Movimientos muestra «qué pasó» o «qué está mal»? (decide Felipe)
- **Dónde:** sección 8 de este archivo.
- **Por qué en este puesto:** si Felipe elige la alternativa, la #7 cambia de forma; por eso se decide antes.
- **Cómo lo verificas tú:** una respuesta tuya entre las dos opciones de la sección 8.
- **Esfuerzo / dependencias:** S (decidir) · antes de la #7.
- **DECIDÍ (mi recomendación):** mantener la lista con las tres tarjetas, corregidas por #1 y #2 (lo que faltó ya queda a la vista
  en la tarjeta de Ajustes).
- **DESCARTÉ:** «excepciones primero» ahora, porque producción tiene 5 días de datos con la carga inicial mezclada: armar alertas
  sobre el ruido del arranque fija umbrales que mañana serán falsos.
- **SE ROMPE SI:** pasada la carga, TRU sigue con ajustes que restan casi todos los días y nadie abre Movimientos para verlos: la
  señal tiene que ir a Inicio, no quedarse aquí.

### #7 · Mejorar — Decir cada cosa una vez: tarjetas «Entró / Salió / Ajustes»
- **Dónde:** `page.tsx:242-262` (etiquetas, desglose y la frase «Además…»), `page.tsx:196-199` (el comentario que justifica
  repetir la sede) · `EncabezadoPagina.tsx:54` (subtítulo).
- **Qué:** una línea encima de las tarjetas «Tienda TRU · últimos 30 días», como ya hace el celular (`page.tsx:232-241`); etiquetas
  de una palabra; desglose de 2 líneas como máximo con «y N más» (el resto en el cajón o al tocar); sacar «152 movidas entre piso y
  almacén» de la tarjeta Ajustes (no es un ajuste; ya lo dice la píldora «Piso ↔ almacén»); `text-wrap: pretty` en el subtítulo
  de `EncabezadoPagina` (deja de quedar «qué.» solo, en todas las pantallas que la usan).
- **Por qué en este puesto:** es la mitad del «se ve mal»: sede ×5 y período ×4 arriba del pliegue, y tres tarjetas estiradas por
  un párrafo.
- **Cómo lo verificas tú:** captura a 1.366 px antes y después: «TIENDA TRU» aparece 2 veces (barra y sobretítulo) + 1 línea de
  contexto; las tres tarjetas miden lo mismo sin media tarjeta vacía.
- **Esfuerzo / dependencias:** S · después de #1, #2 y #6.

### #8 · Mejorar — Una sola unidad por cifra
- **Dónde:** `FiltrosMovimientos.tsx:254-271` (cifra de las píldoras de tipo).
- **Qué:** las píldoras sin número (siguen apagándose en 0, `:81`); las prendas las dicen las tarjetas. Alternativa si Felipe
  quiere el número: que sea en prendas, igual que las tarjetas.
- **Por qué en este puesto:** «Salidas 26» junto a «Salió −30» obliga a adivinar; es la otra mitad del «se ve mal».
- **Cómo lo verificas tú:** en ninguna parte de la pantalla aparecen dos cifras distintas para la misma cosa.
- **Esfuerzo / dependencias:** S · con la #3.

### #9 · Mejorar — Filtros en un solo lenguaje
- **Dónde:** `FiltrosMovimientos.tsx:220-299`.
- **Qué:** período y zona como `DesplegablePildora` («Últimos 30 días ▾», «Zona: todas ▾»), como Historial de ventas; los tipos
  quedan en una sola fila sin partirse; el segmentado hueso se va. La misma decisión vale para Traslados
  (`TrasladosFiltros.tsx:126-142`): cambiar uno solo deja dos maneras.
- **Por qué en este puesto:** hoy hay cuatro estilos de filtro en una tarjeta y la fila de tipos se parte en dos con «Zona»
  flotando entre las dos líneas `[visto]`.
- **Cómo lo verificas tú:** a 1.024, 1.366 y 1.920 px la tarjeta de filtros tiene dos filas limpias (buscador + 2 desplegables;
  tipos) y ningún control queda centrado entre dos líneas.
- **Esfuerzo / dependencias:** M · después de la #8.

### #10 · Mejorar — La banda del día pesa más que los datos (objeción a una decisión tuya del 2026-10-01)
- **Dónde:** `DIA_TITULO` (`ui/lista-actividad.tsx:35`; la comparten Movimientos y Conteo).
- **Qué:** tú pediste la banda negra para «que el día se vea de un golpe al recorrer la lista». Mi objeción: es el bloque más
  oscuro de la página y gana a los datos y al título. Propuesta: banda en `sand` o `hueso` con letra tinta y **pegada arriba al
  desplazarse** (`sticky`): el día se ve siempre, que es lo que pediste, sin gritar. Al cambiar el token cambian las dos listas, y
  Historial de ventas tendría que elegir entre la suya y esta.
- **Por qué en este puesto:** jerarquía visual; no hay dato equivocado (eso lo arregla la #3).
- **Cómo lo verificas tú:** al bajar por la lista, el día sigue arriba; en una captura, lo más oscuro es el título.
- **Esfuerzo / dependencias:** S · **decide Felipe**.

### #11 · Mejorar — Una fila que dice cada cosa una vez
- **Dónde:** `FilaMovimiento.tsx:87-160` (fila) y `:247-301` (`FilaBajadas`) · `lib/movimientos-reglas.ts:708-727`.
- **Qué:** bajadas con las palabras del cajón («27 prendas bajaron al piso», sin «veces», «tallas» ni «⇄»); en una venta, sin la
  segunda línea «Piso → Cliente» (la zona ya va bajo el nombre); el punto solo cuando dice algo (verde entra, rojo falta, ámbar
  dentro de la sede), sin el gris; «no queda ninguna» → «quedan 0 en la tienda» con el mismo formato que «quedan 3».
- **Por qué en este puesto:** la fila de bajadas contradice una decisión ya tomada (ADR-0241 act. 2026-10-01); lo demás es pulido.
- **Cómo lo verificas tú:** una venta ocupa dos líneas de texto en vez de cuatro; la fila de bajadas se entiende sin abrirla.
- **Esfuerzo / dependencias:** S–M · ninguna.

### #12 · Eliminar/conectar — Los atajos que se perdieron, el código muerto y la guía de foco (bajo valor, salvo que decidas recuperarlos)
- **Dónde:** `lib/movimientos-atajos.ts` (+ su prueba), `MODULOS_DE_ATAJOS` y `accesos.puedeAjustar` (`page.tsx:157,194`),
  `stockHoy` (`movimientos-v2.ts:276`), `docs/ARQUITECTURA.md:244-248`, ADR-0241 §1 · `lib/guia-de-foco-pantallas.ts:101,107`
  (`/inventario/movimientos` y `/movimientos` figuran `PENDIENTE`; es una pantalla de consulta sin campos que llenar).
- **Qué:** decides tú: (a) recuperar los atajos como enlaces en el cajón («Seguir con esta prenda»; no ejecutan nada, así que no
  chocan con «solo consulta») o (b) borrarlos con sus pruebas y corregir los docs. Además: las dos rutas pasan a `no-aplica` con
  su motivo y `PENDIENTES_HOY` baja de 69 a 67.
- **Por qué en este puesto:** nadie los echa de menos en la operación de hoy; el riesgo es que el próximo que lea los docs construya
  sobre algo que no existe.
- **Cómo lo verificas tú:** (a) abrir una venta en el cajón → aparece «Cambio» / «Devolución»; o (b) `grep atajosDe` no devuelve
  nada y ARQUITECTURA no los menciona. `lib/guia-de-foco.test.ts` en verde.
- **Esfuerzo / dependencias:** S · ninguna.

## 8 · Estrategia alternativa — «excepciones primero»

| | Hoy (lista + Entró/Salió/Ajustes, corregida con #1–#2) | Alternativa: «Lo que pide tu atención» arriba |
|---|---|---|
| Qué ve primero | Qué entró, qué salió y cuánto se ajustó | Faltaron por ajuste (−35) · Aparecieron a mano (+82) · Se agotaron hoy en el piso y hay en el almacén (N); Entró/Salió bajan a una línea |
| Ganas | Cuadra con el libro; ya está construida y decidida (ADR-0234 D1) | La encargada ve la merma el día que pasa y cada cifra la lleva a su lista |
| Pagas | Responde «qué pasó», no «qué está mal» | Rehace D1; una RPC nueva o ampliada (bruto y «sin documento» por sede); riesgo de duplicar Análisis e Inicio |

Decide Felipe (tarea #6). Recomendación: la columna de la izquierda ahora; volver a mirar con dos semanas de TRU sin carga.

## 9 · Referentes de ERP y futuro

La investigación del 2026-09-26 (Shopify, Square, Lightspeed, Loyverse, Odoo, Bsale/Alegra, con fuentes) sigue válida; está en
el historial de git de este archivo (`git show 1f390f787:docs/pantallas/inventario-movimientos.md`). Lo que agrega este análisis,
**de memoria y sin verificar**: los sistemas de inventario suelen separar el ajuste por motivo y mostrar la merma en bruto, y
algunos exigen un motivo de una lista cerrada + nota para un ajuste manual. Pasa el filtro de «3 tiendas y 1 taller» solo lo que
ya está en #1 y #2. **Futuro (no cuenta entre las 12):** valorizar los ajustes en soles al costo (cuánta plata faltó), que
depende de que el costo promedio sea confiable (ver memoria de la auditoría del 2026-10-03: costo diluido).

## 10 · Fuera de esta pantalla

**La puerta de los ajustes a mano está abierta y casi nadie deja nota.** `[producción]` En TRU, 30 días: +82 prendas aparecieron
y 26 desaparecieron por ajustes **sin documento** (conteo físico, otro, reposición), hechos por 10 personas distintas, con nota en 5 de
94. Desde ADR-0306 (2026-10-02) cualquier integrante que ve Existencias puede ajustar (`fn_puede_ajustar_stock`,
`20261002120000:87-92`), y «Reposición» sigue sumando sin papeles en el **almacén**: el candado de 2026-09-26 cerró solo el piso y
dejó el almacén «pendiente en el BACKLOG» (`20260926000400_reposicion_no_toca_el_piso.sql:15`). Un ajuste a mano sin nota es
justo el hueco por donde una prenda que se fue sin boleta queda «cuadrada». Decisión de negocio, tuya: nota obligatoria en todo
ajuste a mano, cerrar «Reposición» también en el almacén (entrar ya tiene carga inicial y compras; subir al piso tiene Bajar al
piso), o ambas. Esta pantalla solo puede mostrarlo (#1, #2); cerrarlo es en Ajustar stock.

## 11 · Líneas propuestas para el backlog

- [ ] `[pantalla:inventario-movimientos]` #1 Ajustes en bruto (faltó / apareció), nunca neto — S
- [ ] `[pantalla:inventario-movimientos]` #2 Ajuste con respaldo vs a mano, y «sin nota» — S (palabras: Felipe)
- [ ] `[pantalla:inventario-movimientos]` #3 Banda del día sin la cifra de la página — S
- [ ] `[pantalla:inventario-movimientos]` #4 Frase de `hallazgo_conteo` + prueba de totalidad de `FRASE_PROCESO` — S
- [ ] `[pantalla:inventario-movimientos]` #5 «vendidas» sin contar las anuladas como ventas — S
- [ ] `[pantalla:inventario-movimientos]` #6 Decidir «qué pasó» vs «excepciones primero» — Felipe
- [ ] `[pantalla:inventario-movimientos]` #7 Sede y período una vez; desglose corto; «movidas» fuera de Ajustes; subtítulo sin viuda — S
- [ ] `[pantalla:inventario-movimientos]` #8 Píldoras sin cifra (una unidad por número) — S
- [ ] `[pantalla:inventario-movimientos]` #9 Filtros en un lenguaje (`DesplegablePildora`), también Traslados — M
- [ ] `[pantalla:inventario-movimientos]` #10 Banda del día en sand y pegada arriba — S (decide Felipe)
- [ ] `[pantalla:inventario-movimientos]` #11 Fila sin repeticiones; bajadas con las palabras del cajón — S–M
- [ ] `[pantalla:inventario-movimientos]` #12 Atajos: recuperar o borrar; docs; guía de foco `no-aplica` — S

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Sobretítulo «TIENDA TRU · SÁBADO… · 17:23» | Sede, fecha, hora | bien | `[visto]` |
| Cabecera | Título «Movimientos» 46 px | Nombre del menú | bien | ADR-0220 |
| Cabecera | Subtítulo | Para qué sirve | ajustar (viuda «qué.») | `EncabezadoPagina.tsx:54` |
| Cabecera | «⋯» | Exportar a Excel · Copiar enlace | bien (solo, pero correcto) | `MenuMovimientos.tsx:10-28` |
| Cifras | Etiquetas «… A TIENDA TRU · 30 DÍAS» | Contexto | sobra (×3) | `page.tsx:243-251` |
| Cifras | «Entró +753» | Prendas que sumaron | bien | `[producción]` |
| Cifras | «Salió −30 · 30 vendidas» | Prendas que restaron | ajustar (anuladas) | §4.2 |
| Cifras | «Ajustes +52» | Neto de ajustes | **corregir** (esconde −35) | `[producción]` |
| Cifras | «+1 por ajuste · encontrada…» | Desglose | **bug** | `movimientos-reglas.ts:792-796` |
| Cifras | «Además, 152 movidas…» | Piso ↔ almacén | sobra aquí | `page.tsx:259` |
| Cifras | Hover de tarjeta | Señal de tocable | ajustar (parece activa) | `TarjetaCifra.tsx:137` |
| Filtros | Buscador | Prenda, código, proceso | bien | `FiltrosMovimientos.tsx:327-353` |
| Filtros | Píldoras de período | Hoy / 7 / 30 / 90 / Personalizado | ajustar (desplegable) | `:220-231` |
| Filtros | Píldoras de tipo con cifra | Filtran; cifra en operaciones | ajustar (sin cifra) | `:254-271` |
| Filtros | «Traslados 0» apagada | No hay traslados | bien | `:81` |
| Filtros | Zona (segmentado hueso) | Piso / Almacén / Cuarentena | ajustar (desplegable) | `:273-299` |
| Lista | Banda «HOY · 14 MOVIMIENTOS» | Separador de día | **corregir** cifra; ajustar peso | `MovimientosLista.tsx:161` |
| Lista | Hora | Cuándo | bien | `lista-actividad.tsx:41-48` |
| Lista | Punto gris | Tono «neutro» | sobra | `lista-actividad.tsx:24` |
| Lista | Miniatura colibrí 30 % | Sin foto | ajustar (raíz: `PrendaCelda`, todo el ERP) | `PrendaCelda.tsx:27-33` |
| Lista | «Salida · Venta / Piso → Cliente» | Proceso y trayecto | ajustar (redundante) | `FilaMovimiento.tsx` |
| Lista | «Boleta B001-…» | Abre la venta | bien | `:128-129` |
| Lista | «−1 / no queda ninguna» | Cantidad y saldo al terminar | bien el dato; ajustar el texto | `movimientos-saldo.ts:7-11` |
| Lista | «Bajadas al piso · 3 veces · 27 tallas · ⇄ 27» | Bajadas plegadas | **corregir** palabras | `FilaMovimiento.tsx:283,295` |
| Detalle | Cajón | Frase, quién, dónde, documento | bien; faltan los atajos | `CajonMovimiento.tsx` |

## Historial

| Fecha | SHA | Modo | Cumplimiento | Relevancia | Nota |
|---|---|---|---|---|---|
| 2026-09-26 | `9f0d2f3b` | rápido + spike | — | — | Primer análisis tras ADR-0234; spike en `docs/maquetas/movimientos-conectado-2026-09/` |
| 2026-09-26 | encima del #512 | ejecución | — | — | Felipe eligió las 4 recomendadas + los 4 atajos + apartado exacto + Conteo con lista; «Lo que hice yo» no. Construidas #1 a #10 (ADR-0241). **Corrección al análisis:** la #1 NO pedía columna nueva: `apartados.movimiento_id` ya existe. La nota «Registro transparente» se quedó (la pide ADR-0169); se quitó la frase repetida del subtítulo. |
| 2026-10-03 | `6a6ab03a` | completo (SQL de solo lectura en producción) | 5,7 | 6,0 Soporte | Reemplaza al del 26-09 (vencido: 866 líneas cambiadas). De sus 12 tareas: **cerradas 9** (#1 apartados, #2 píldoras en cero, #4 escanear, #5 Hoy, #6 bajadas plegadas, #7 tarjetas que filtran, #8 frases repetidas, #9 celular, #10 Exportar al «⋯»); **#3 (atajos) reabierta**: se construyó y se perdió con el cajón del 28-09 (ver #12); #11 descartada por Felipe; #12 (saldo) hecha de otra forma (`fn_movimientos_saldos`, «quedan N»). |
