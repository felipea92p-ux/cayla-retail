# Qué colores bajar al piso: lo que dicen los datos y qué conviene construir (y qué no)

**Fecha:** 2026-10-12 · **Pidió:** Felipe, mirando Plan del piso: «aquí podemos hacer algo más genial por los colores: sugerir qué colores bajar,
teniendo en cuenta existencias y otras sedes; analízalo e investiga, dame sugerencias» · **Estado:** investigación y propuesta; **nada está construido**
y este archivo no está commiteado (el repo es público: revisa las cifras de negocio antes de subirlo).
**Cómo se hizo:** dos rondas con subagentes. Primera: nueve investigadores independientes (tres leyeron el repo, dos consultaron producción en solo lectura,
cuatro investigaron mercado, exhibición, estadística y contexto peruano). Segunda: una maqueta con las cifras reales de TRU y AQP, un recálculo independiente
de las cifras clave por otro agente, y tres críticos que intentaron tumbar la propuesta (coherencia con el repo, operación de tienda y una prueba ciega de 5 segundos).
Confianza: **VERIFICADO** = se corrió la consulta o se abrió la fuente y se vio el número · **REPORTADO** = fuente secundaria · **INFERIDO** = razonamiento propio.

## La respuesta corta

La idea es buena, pero **el orden importa y mi primera propuesta era demasiado grande**. Tres hechos la acotan:

1. **Hoy ninguna tienda puede decir «baja X» con verdad.** `retail.cuadres_piso` tiene 0 filas: el piso del sistema nunca se cuadró en TRU, AQP ni LIM, y el
   motor del piso (`lib/piso-plan.ts`) tiene «Por colgar» en pausa en las tres. La captura de Felipe (306 de 600, «Por cuadrar») es exactamente eso. Lo primero que
   desbloquea todo lo demás no es un algoritmo: es cuadrar TRU (el conteo está abierto desde el 10-oct, 283 ítems) y que «Por cuadrar» lleve a donde se cuadra.
2. **«Qué color colgar» ya lo decide el motor.** «Por colgar» ya dice, por prenda en un color y por talla, qué falta colgar, con ventas de 14 días (escaneadas y anotadas),
   y ya llega a Bajar con las prendas por escanear. Mi lista «se venden y no se ven» era ese mismo caso visto por color. Una sección con «Baja primero Negro» es el segundo
   orden de «qué colgar» que Felipe quitó el 2026-10-06 («Colgar primero», ADR-0344 decisión 5).
3. **Con 12 días de historia el color exacto no es predecible; la familia de color sí.** Eso define qué se puede decir hoy sin mentir.

**Lo que sí vale y nadie dice hoy:** una frase por grupo, a nivel de familia de color, sobre lo que se vende frente a lo que cuelga («en Pantalones el azul se vende y casi
no cuelga»). Es de reloj lento (Plan del piso es la pantalla del mix), no choca con las decisiones escritas y es lo que los datos sostienen. Además, el color es el hilo
que une cuatro pantallas que hoy responden por separado: Plan del piso (qué tonos le faltan al grupo), «Por colgar» (qué percha sigue), Análisis y CAYLA Global (dónde se vende
lo que me sobra) y la señal al Taller (qué tonos fabricar).

## Lo que dicen los datos (producción, solo lectura, 2026-10-12)

Dos agentes llegaron a los mismos totales por separado y un tercero los recalculó desde cero: confirmó todo salvo lo marcado en «Correcciones».

| Qué | TRU | AQP | LIM |
|---|---|---|---|
| Cuadres del piso (`cuadres_piso`) | 0 | 0 | 0 |
| Piso libre / almacén libre (prendas, sistema) | 367 / 924 | 152 / 29 | 0 / 1 |
| …solo los 6 grupos del riel | 306 / 915 | 81 / 29 | 0 / 1 |
| Ventas 30-sep a 11-oct, regla viva (escaneadas + anotadas) | 601 (273 + 328; 54,6 % anotadas) | 288 (6 + 282; 97,9 % anotadas) | 0 |
| …solo los 6 grupos del riel | 507 | 221 | 0 |
| Capacidad del piso | 600 (contada) | 1.800 (provisional) | 180 (sin contar) |

- **Solo TRU tiene qué bajar**: 915 prendas del riel esperan atrás para 294 lugares libres. AQP tiene 29 en el almacén (su stock está a medio cargar: 145 libres
  contra 288 vendidas con la regla de los motores). LIM tiene 1 prenda y 0 ventas.
- **Ese «924 atrás» es una foto que el cuadre va a mover.** Según ADR-0328 cuelgan 600 a 750 prendas y hay unas 200 guardadas de verdad; la carga inicial de TRU siguió entrando
  hasta el 11-oct (el almacén del sistema pasó de 657 el 2-oct a 924). Solo 67 % de las ventas anotadas de TRU eran de un grupo×color que el sistema creía colgado.
- **La función viva no es la del archivo del repo.** `fn_piso_plan_lectura` en producción (md5 `3b9b7a08…`) ya cuenta anotadas `pendiente` **y** `cerrada_sin_prenda` y pregunta
  `fn_categoria_entra_a_motores`; la migración `20261004213000` solo cuenta `pendiente`. Cualquier lectura nueva debe copiar la viva (reemplazo anclado, ADR-0377).
- **El equipo ya cuelga lo que se vende**: correlación de Pearson por color entre unidades bajadas y vendidas = **0,95**, y entre vendidas y stock = **0,94** (77 colores, TRU).
  Un ranking de «lo más vendido» repite lo que ya se hace; el valor está en las excepciones y en el nivel de tono.
- **La exposición sesga lo vendido**: un color que no cuelga no vende. Un investigador midió con ventas escaneadas y exposición reconstruida día a día que la tasa por unidad colgada
  no se distingue entre colores (p = 0,55); el verificador, con todas las ventas contra el piso de hoy, **no pudo reproducirlo** (p < 0,001 con cualquier prueba natural). Son
  mediciones distintas y ninguna es concluyente: **no uso este número como argumento en ningún sentido.** Lo que sí está verificado es que la mezcla de ventas sigue a la de lo que hay.
- **Con 12 días el color exacto es ruido; la familia no.** 63 % de las celdas sede×grupo×color de TRU (y 75 % de AQP) tienen 2 ventas o menos. Las 3 familias top de una semana
  cubren **85 %** de lo vendido la semana siguiente, igual al techo posible (verificado: TRU 274 de 322, AQP 90 de 106). Un ranking de colores usable pide ~130 a 350 ventas por grupo;
  hoy solo Polos las tiene. Y la cola larga pesa: 24 colores que no vendieron la primera semana suman 14,6 % de las ventas de la segunda (aunque esa semana vendió 74 % más, lo que por sí solo hace aparecer colores nuevos).
- **Las otras sedes ayudan, poco y como a priori** (calculado por un investigador, **no recalculado por un segundo**): contraer grupo ← (toda la sede + red) gana a «solo la sede» en
  100 % de 924 particiones en TRU (+0,115 nats por venta) y 98 % en AQP (+0,21); la red sola pierde contra la sede en TRU. Y AQP no es TRU: 52 % de neutros contra 36 %, 7 % de azules
  contra 18 %: copiar la mezcla de una a la otra pierde esa diferencia.
- **Entre sedes casi no se mueve nada**: 4 traslados en producción, todos con 0 prendas; 0 pedidos entre sedes; el flete lo paga la tienda que recibe y el sistema no lo registra.
  Zara (Caro y Gallien, versión de trabajo 2007, leída) **no** resuelve la falta de un color moviendo prendas entre tiendas: su piloto redujo esos transbordos y repartió mejor desde la bodega.
- **Cómo se cuelga de verdad** (TRU, 331 bajadas del 26-sep al 11-oct; 26 sin renglones): 217 son de una sola prenda, 56 % se hace entre las 9 y las 10 h, y desde «Colgar en tandas» (9-oct)
  el promedio subió de 1,7 a 2,9 prendas por bajada. Es una ráfaga matinal de quien cuelga, no un sábado a las 6 de la tarde.
- **Quién ve qué**: Plan del piso lo ven 14 líderes (6 Admin) y las 3 cuentas compartidas `terminal_ventas`; **no** lo ven las 12 integrantes ni las 3 cuentas compartidas de Almacén
  (`terminal_administrativa`, la que cuelga). Existencias y Frescura sí las ven.

### Las listas que se pueden decir hoy (TRU, «según el sistema»; colgadas / almacén / vendidas en 12 días)
Todas dependen de «cuánto cuelga», que mientras no haya cuadre puede ser falso. Se escriben así, no como órdenes.
1. **Se vendieron y hoy no cuelga ninguna, con almacén detrás** (verificado): 9 colores: Topo 0/17/9, Azul medio 0/24/2, Mostaza 0/6/2, Turquesa 0/6/1, Terracota 0/3/2, Azul petróleo 0/1/3,
   Cobalto 0/2/1, Verde jade 0/1/1, Caqui 0/1/1 (61 u. atrás). Por grupo×color son **26** combinaciones con 106 u. atrás (mi primer informe decía 31: era un error). Con el mínimo de 5 ventas por color que
   piden los críticos solo Topo llega; es una lista corta, no una sección.
2. **Colores grandes con pocas colgadas** (Blanco 30/97/68, Negro 26/76/61, Celeste 27/61/52…): es el ranking de lo más vendido que el equipo ya sigue; y la versión «menos de 7 días de cobertura» usa un corte
   fijo que la regla de Frescura relativa y `piso-plan-umbral.test.ts` prohíben. **No la propongo.**
3. **Rotación alta con casi nada colgado** (Perla 53 %, Gris 48 %, Vainilla 47 %, Topo 35 %): la más frágil (denominador inflado porque las anotadas no descuentan stock). Se funde con la 1.
4. **Stock sin salida** (Nude 5/21/1, Azul claro 6/41/5, Azul medio 0/24/2, Gris antracita 14/16/3): es terreno de Frescura (relativa) y de Análisis «No se vende». No va en Plan del piso.
5. **Para probar** (8 colores, 12 u., nunca bajados): el motor ya pide 1 por talla central de cada color aunque no se haya vendido; no hace falta una lista.
6. **Red** (AQP vendió 64 Negro con 10 en stock, ~2 días de cobertura; TRU tiene 102, ~20 días): verificado. Pero el stock de AQP está incompleto, el 98 % de sus ventas son anotadas y no hay un solo
   traslado real. Es una pista para el Taller y para Análisis, no una orden. «~179 unidades para igualar cobertura» pasa a «~170 a 180» (depende de dividir por 12 u 11 días).

### Lo que el nivel de familia de color sí dice hoy (TRU; aproximado: sin descontar cambios ni devoluciones; consulta propia del 2026-10-12)
| Grupo | Lo que se ve | Hechos (vendió · cuelgan · atrás) |
|---|---|---|
| Pantalones, faldas y shorts | El azul se vende y casi no cuelga | Azules 25 · 5 · 28 (neutros 25 · 26 · 40; tierras 25 · 18 · 36) |
| Polos, tops y blusas | Se vende más neutro de lo que cuelga; cuelga más azul de lo que se vende | Neutros 100 · 44 · 143; azules 34 · 27 · 74 |
| Vestidos, conjuntos y enterizos | Cuelga más rojo de lo que se vende | Rojos 4 · 7 · 31 |
| Abrigo y capas | Lo que cuelga se parece a lo que se vende | Neutros 19 · 12 · 14; tierras 17 · 17 · 25 |
| Bodys, corsets y lencería | Casi no cuelga nada del grupo (es un tema de lugar del grupo, no de color) | Neutros 16 · 2 · 32; tierras 13 · 2 · 52 |
| Jeans | Todo es azul: no hay mezcla de tonos | 15 · 23 · 49 |

## Lo que el repo ya decidió y esta idea toca
| Decisión | Qué acota | Choque de mi primera propuesta |
|---|---|---|
| ADR-0344 d.5 y «Quinta vuelta» (2026-10-06) | Un solo orden de «qué colgar»; «Colgar primero» se quitó | «Baja primero Negro» + niveles es un segundo orden |
| ADR-0231 / ADR-0357 d.7; piso-plan.ts: «1 por talla y color es el tope» | No se sugiere cuánto; lo vendido decide SI se cuelga, no CUÁNTAS | «Baja más» + «atrás 48» funcionan como cantidad |
| ADR-0328 d.5 | Sin piso cuadrado «Por colgar» queda en pausa | Listas con «0 colgadas» sobre un piso sin cuadrar |
| ADR-0346 / 0347 | El motor habla con 14 días de 90 % de ventas con prenda + piso cuadrado + almacén contado; una sede que no cumple no suma a la red | Solo usaba el cuadre; usaba a AQP como «padre» |
| ADR-0329 | El mix es el reloj lento; ±3 puntos al mes; nada se retira a la fuerza; «un % mal puesto nunca impide colgar lo que se vende» | «Ya tiene de sobra: no bajes más» |
| ADR-0352 (c) | «Cómo quedaría» no elige colores (dos pruebas lo fijan) | La variante B (perchas en contorno) lo revertiría |
| ADR-0357 d.3 (act. 2026-10-06 noche) | Las otras tiendas salen solo donde hay algo que hacer con una prenda propia; la comparación vive en CAYLA Global | «En Arequipa se vende más Negro y Vino que aquí» |
| Frescura relativa (2026-09-24, 10-07, 10-10) | Nada de cortes fijos en días | «Menos de 7 días de cobertura» |
| ADR-0306 / 0161 | La función de bajar vive en Existencias; un módulo no obliga a tener otro | «Bajar estos» dentro de Plan del piso |
| `lib/piso-plan-umbral.test.ts` | Nada compara lo colgado con un número ≥ 1 fuera de `piso-plan.ts` | Cualquier corte propio fallaría el CI |

## Qué recomiendo (en este orden)
1. **Cuadrar TRU antes del 15-oct y que «Por cuadrar» lleve al cuadre.** Es lo único que desbloquea todo y es barato: el chip y el aviso con un botón a `/inventario/cuadrar` (el botón solo si la cuenta ve Existencias;
   confirmar el cuadre es del líder y la pantalla debe decirlo), con palabras de tienda («Falta escanear lo guardado»; la prueba ciega del 10-oct no entendió «cuadrar»). Cómo se verifica: `cuadres_piso` deja de estar en 0 y «Para hoy»
   de TRU deja de decir «En pausa».
2. **Mirar dos semanas con «Por colgar» encendido, sin construir nada nuevo.** Medir cuántas prendas de la lista de la mañana se bajan ese mismo día y qué decisión de color queda sin resolver. Las cifras de «lugares libres» y de colgadas cambiarán.
3. **Plan del piso: una frase por grupo a nivel de familia de color** (la tabla de arriba), sin verbos de orden, sin ranking, sin cantidades, sin botón de bajar, sin otras tiendas. «Según el sistema» se dice una sola vez. Nace en pausa y usa **la misma puerta** que el motor
   de demanda (`preparacionDeSede`, las tres condiciones de ADR-0346), no una pausa propia. Reutiliza `pesoDeLaVenta` (una sola contracción). Va después del 15-oct, cuando las ventas sean escaneadas y TRU esté cuadrada. Sin migración. **Esto ya está en camino en el PR #993** (ver «Lo que cambió en `main`»): lo que falta es revisarlo contra estas conclusiones.
4. **Solo si de 2 sale una decisión de color que «Por colgar» no resuelve**: una línea en «Para hoy» o el Inicio de Almacén (donde está la cuenta que cuelga) con «se vendió y ya no cuelga nada de este color en este grupo; hay atrás», mínimo 5 ventas,
   tope de 5 filas, enlace a «Por colgar».
5. **Otras sedes, donde ya viven**: Análisis («Mándalas a donde sí se venden», umbral de 2 unidades) y CAYLA Global (comparación completa, Admin). Una lectura nueva por color con otras tiendas (`fn_colores_de_la_red`, puerta por módulo y no por sede porque D-69
   acotará a los líderes, anotadas por color exacto a 14 días, `fn_categoria_entra_a_motores`) es una migración que decide Felipe y conviene **después del 15-oct** y de que AQP cargue su inventario. La reposición real entre sedes es el Taller en Lima; el color alimenta la señal al Taller (categoría × talla × familia de color, que ya existe).
6. **Volver a medir el 2-nov y el 1-dic con ventas escaneadas** (persistencia, backtest, exposición, cola larga; los scripts de esta investigación se pueden repetir). Recién ahí se decide si el color exacto o el estimador por exposición valen la pena.

## Lo que descarté y por qué
- **Ranking de colores más vendidos**: repite lo que el equipo ya hace (r = 0,95). 
- **Niveles «Baja más / Baja si hay lugar / Mantén / Ya tiene de sobra / Prueba»**: segundo orden de «qué colgar», cantidad implícita, palabras que se malentienden en tienda («baja» suena a rebaja, «prueba» a probador). Tres veredictos distintos para el mismo color en tres listas.
- **«Bajar estos» en Plan del piso**: la acción vive en Existencias; la cuenta que cuelga no ve Plan del piso. **Seis botones negros** además chocan con la regla de un solo botón oscuro por pantalla.
- **Perchas en contorno dentro de «Cómo quedaría» (variante B)**: revierte ADR-0352 (c) y sus dos pruebas, y la prueba ciega dice que el contorno casi no se nota y que el dibujo «dice cantidad» mientras el texto la niega.
- **Esconder la Mancuerna**: Felipe pidió conservarla y mejorarla el 2026-10-11; el «6,0/10» de Formidable es anterior al rediseño del riel y no se recalificó.
- **Otras sedes dentro de Plan del piso y un traslado Trujillo–Arequipa**: 0 traslados reales, bus de 9 a 20 h, flete de quien recibe, stock de AQP incompleto; «Pedir a otra tienda» ya existe y tampoco se usó.
- **Estimador por exposición (MNL/EM), «Prueba» con cuota de exploración, estimar β**: la fase 1 (Gamma-Poisson por exposición) y la cuota (reutilizar la reserva de ADR-0329 punto 7) quedan documentadas en el informe de métodos, pero con 12 días y el piso sin cuadrar no hay con qué calibrarlas.
- **Señales que no mueven el color**: `combina_con` (no predice co-compra: 37,5 % contra 38,9 % al azar), clima (mueve grupos y telas, no colores; no hay estudio que ligue temperatura con color), tendencia Pantone/WGSN (coincide por familia en azul, naranja, rosado y verde, pero el surtido peruano es 39 % neutros; es una pista para Compras y el Taller),
  folclore (Mes Morado: solo una proyección gremial de 2011; Año Nuevo: ropa interior, 18 % usa amarillo; el Concurso de Marinera ya no es en Trujillo). Un calendario editable, si Felipe lo quiere, vive en Plan de campaña (ADR-0349), no en una tabla nueva.
- **Regla de exhibición por color** (claro a oscuro, 60-30-10): es convención de oficio; no hay estudio en tienda física ni número verificado de colores por riel. Nunca debe ser la razón de bajar un color.
- **Anotadas a media cuenta**: es una cuarta convención (el motor cuenta anotadas pendientes, el riel solo confirmadas, «Fuera del riel» enteras). No se decide aquí.

## Correcciones de cifras (lo que el verificador cambió)
Mi propuesta citaba ocho cifras que no sobrevivieron tal cual: piso libre de TRU **367** (no 368: hay 1 apartada; 331 sin las 36 bolsas); ventas de AQP **288** con la regla viva (350 incluye 62 de la categoría Bolsas, fuera de los motores; 97,9 % anotadas, no 98,3 %);
combinaciones grupo×color **26** (no 31); cobertura de Negro **~20 días en TRU contra ~2 en AQP** (no 22; depende de dividir por 12 u 11 días); **~170 a 180** unidades para igualar cobertura (no 179 exactas); cola larga **14,6 %** (no 14 %);
cuentas compartidas de Almacén **3** (una por sede, no una); y la frase «la tasa por unidad colgada no difiere entre colores (p = 0,55)» **sin sostén** (ver arriba). También se corrigió la lectura de «a pedido de lo que se vende»: no está respaldada; la cadencia real es una ráfaga matinal.
**No recalculadas por un segundo agente:** las cifras de los modelos (contracción jerárquica, backtest, pérdida 3,34 contra 3,64, 52 % contra 36 % de neutros), las citas de mercado y las duraciones de los buses.

## Lo que la literatura aporta (con su fuente)
- **Zara, «colores clave» y retiro por talla principal** (Caro y Gallien, versión de trabajo 2007, §3.1.1 y §5.2; VERIFICADO con la salvedad de que la extensión multicolor no estaba implementada en campo): el mínimo de CAYLA (1 por talla central y color) es la misma lógica; dos o tres colores clave por grupo con mínimo obligatorio y el resto condicional.
- **Corregir la demanda por los días fuera de exhibición** (Zara: ventas × 7/(7 − días sin exhibir); Vulcano, van Ryzin y Ratliff; Conlon y Mortimer): un color agotado no es un color flojo.
- **Contracción jerárquica** (Brown 2008; Zhai y Lafferty 2001; Minka): una sola `pesoDeLaVenta` para todos los niveles; el prior medido (μ ≈ 56, IC90 13–180) contiene al n0 = 50 del repo.
- **Presentación**: razón en una línea y «¿Por qué?» a un toque (Microsoft HAX G11, PAIR); fatiga de alertas (Ancker 2017: cada recordatorio extra baja ~30 % la aceptación; Poly 2020: se anulan 46–96 %); con poca muestra, callar o pausar antes que dar un porcentaje.
- **Corrección al repo:** `docs/investigacion/2026-10-05-algoritmo-de-inventario.md:84` atribuye a Nextail «usa las ventas de su familia si vendió menos de 200 unidades» como pronóstico de demanda; la página oficial dice que esa regla es de las **curvas de talla**.

## Maqueta
`docs/maquetas/colores-que-bajar-2026-10/index.html` (conmutador de estado, claro y oscuro). Los estados 1 a 4 son **exploración, no recomendación**: la sección completa y la variante B, con los problemas que listaron los críticos (cifras de hoy sobre un piso sin cuadrar, botones negros repetidos, «según el sistema» ×10, íconos negros casi invisibles en oscuro).
El estado 5 es lo mínimo recomendado. Lo real y lo ilustrativo: las cifras de TRU y AQP salen de las consultas de arriba; las frases y los niveles de cuatro de los seis grupos del estado 2 son texto propuesto.

## Huecos
- **El piso real**: sin cuadre no se sabe qué cuelga de verdad. Lo resuelve cuadrar TRU. Cuánto tarda el escaneo no está medido en ningún documento.
- **Historia**: solo 12 días y con ventas anotadas a mano; la cola de arranque cierra el 15-oct. Todo lo medido vale para este régimen de arranque y debe repetirse con 3 o 4 semanas de ventas escaneadas y AQP cargada.
- **Color exacto de las anotadas a 14 días**: existe en la base (`prendas_por_regularizar.color_codigo` es NOT NULL) pero ninguna lectura lo expone; en AQP (98 % anotadas) la demanda por color no se puede nombrar hasta que una migración de lectura (de Felipe) lo haga.
- **Sustitución entre colores**: sin medir en CAYLA; el 45 % de recaptura citado es de supermercado (REPORTADO).
- **Flete y plazo reales de un traslado**: ningún traslado con prendas en producción; A-07 sigue abierta.
- **No se abrió la ruta real contra la base** (Docker desinstalado desde el 2026-10-11) ni la probó una colaboradora; la prueba ciega fue con capturas de la maqueta.
- **Decisiones de Felipe** (dinero, permisos, migraciones): si se muestra algo en Plan del piso y a quién (hoy solo líderes y `terminal_ventas`); si la cuenta de Almacén lo ve en Existencias; si se autoriza la lectura por color con otras tiendas; cuánto cuentan las anotadas.

## Lo que cambió en `main` mientras se investigaba (revisado al subir este informe)
La rama de esta investigación estaba **292 commits atrás de `main`** (hasta el PR #994 del 12-oct); todo el código se leyó de esa foto. Al subirla comparé contra `main`:
- **Lo investigado de Plan del piso no cambió**: `piso-plan.ts`, `mix-piso.ts`, `plan-piso-colores.ts`, `plan-piso-percha.ts`, los servidores de lectura y los ADR 0329, 0344, 0346 y 0352 están iguales. Los componentes de Plan del piso solo ganaron atributos `data-guia`
  (guías interactivas, ADR-0389). Consecuencia para quien construya algo aquí: **cualquier cambio de controles en Plan del piso cambia la «huella» de su guía** (`lib/guias/huellas/inventario.plan-del-piso.json`) y pide la skill `/guia`.
- **Hay un PR abierto que ya construye la lectura por familia de color: #993 «Color de la tienda»** (otra sesión; diseño aprobado por Felipe mirando su maqueta `docs/maquetas/color-de-la-tienda-2026-10/`; sin migración). Es, en lo esencial, la recomendación 3 de este informe: una franja con las familias de color de lo que cuelga frente a lo que se
  vende, una marca por familia solo con evidencia («Le falta lugar», «Cuelga de más») y, al tocar una familia, el desglose por color con «Se vende y falta» y «Cuelga y no sale». Su regla es relativa (esperado = ventas × parte que cuelga; residuo de Poisson ≥ 2, 3 prendas de diferencia y 30 ventas mínimas, constantes en `lib/plan-piso-familias.ts`).
  Aplicando esa regla a mano a los datos de TRU de hoy (cálculo propio y aproximado, no la salida de ese PR) marcaría el azul de Pantalones, faldas y shorts como «le falta lugar» (25 vendidas contra ~7 esperadas) y el azul de Polos y el rojo de Vestidos como «cuelga de más»: coincide con la tabla de familias de este informe.
  **Preguntas para revisar #993 con lo hallado aquí:** (1) ¿cómo se ve con el piso sin cuadrar (0 cuadres en las tres tiendas)? su descripción dice que lo probó, pero «cuelga» es del sistema; (2) el desglose por color con «Se vende y falta» a un toque, ¿se lee como un segundo orden de «qué colgar» (ADR-0344 d.5)? (3) con 12 días la mayoría de las celdas por color tiene 2 ventas o menos: la familia aguanta, el color exacto no, y esa propuesta solo cuenta ventas confirmadas por color (en AQP, 98 % anotadas, no opina); (4) los umbrales son criterio de Felipe y conviene medirlos con la primera semana de uso.
- **Ventas históricas de Sinatra** (migración `20261012160000`, ADR-0372): solo **soles por día y tienda**, sin categoría, unidad ni color. Sirven al Plan de campaña, **no** a decidir colores; la conclusión «el color necesita unidades con color y hoy hay 12 días» sigue en pie.
- **PR #806** (el motor del piso cuenta las ventas cerradas sin prenda) y **#995** (corrige las cuatro afirmaciones viejas que listé más abajo, nacido de la tarea que dejé aparte) están abiertos; no chocan con este informe.

## Respuestas de Felipe (2026-10-12) y cómo se leen
- **Qué construir primero:** «espera un momento que se va a actualizar algo y luego volvamos a analizar». No se construye nada; se vuelve a medir cuando él avise.
- **Quién debe verlo:** «no lo sé, analicemos bien y recomiéndame». Recomendación: separar por pregunta y por quien decide. La lectura de familia de color («qué tonos le faltan a este grupo») es del reloj lento y de la líder: Plan del piso.
  El color de la percha que sigue lo decide «Por colgar» y lo usa la cuenta de Almacén (que no ve Plan del piso): vive en «Para hoy» e Inicio de Almacén, en una línea, y solo si después de dos semanas queda una decisión de color sin resolver.
  La comparación entre tiendas es de CAYLA Global y Análisis. No conviene dar `plan_piso` a más roles por esto: la pantalla es densa y de planificación. Además, `terminal_ventas` tiene `plan_piso` en producción y el código (`MODULOS_DE_HOY`) no lo prevé: vale la pena que Felipe confirme en Roles y accesos que fue intencional.
- **Otras sedes:** «si tiene relevancia y cargó todo, debería incluirlo». Se lee como una puerta, no como una fecha: una tienda entra a la comparación cuando cumple las condiciones de ADR-0346 (`preparacionDeSede`: 14 días seguidos con al menos 90 % de ventas con prenda, piso cuadrado y almacén contado) y tiene al menos ~100 ventas con color (donde la familia ya es utilizable).
  Hoy entra TRU como sede propia; AQP no (29 prendas atrás, 6 de 288 ventas con prenda, sin cuadre) y LIM tampoco (0 ventas, 1 prenda). Cuando cumplan, entran solas, sin una decisión nueva.

## Para volver a analizar (cuando se actualice)
1. `retail.cuadres_piso` por sede (hoy 0, 0, 0). Si TRU ya cuadró: «Por colgar» se enciende y hay que rehacer las listas con el piso real (las cifras de «colgadas» y «lugares libres» cambian).
2. Almacén libre del riel de TRU (hoy 915) y cuánta carga inicial sigue entrando: si baja a ~200–300, el problema pasa de «qué bajar» a «qué sacar».
3. Ventas con prenda en 14 días (TRU 45 %, AQP 2 %): la puerta de ADR-0346 pide 90 % durante 14 días seguidos.
4. Cierre de la cola de arranque el 15-oct (`cola_arranque_plazo`): desde ahí las ventas son escaneadas, con variante y color exactos, y la demanda por color deja de depender de las anotadas.
5. AQP: stock cargado (hoy 29 atrás; 145 libres contra 288 vendidas) y cuadre; LIM: primera venta.
6. Repetir las pruebas de predictibilidad con 3 o más semanas de ventas escaneadas (persistencia primera mitad → segunda, backtest de los cuatro predictores, familia contra color). Criterio: color exacto utilizable cuando un grupo tenga ≥ 130 ventas (hoy solo Polos de TRU).
7. La tabla de familias de este informe con el piso cuadrado: si «el azul se vende y casi no cuelga en Pantalones» y «se vende más neutro de lo que cuelga en Polos» desaparecen, eran un artefacto del piso sin cuadrar.
8. Qué cambió en `main` y en las otras ramas sobre Plan del piso, «Por colgar», Roles y CAYLA Global antes de diseñar nada (esta investigación leyó una foto 292 commits atrás de `main`; ver «Lo que cambió en `main`»), y si el PR #993 «Color de la tienda» ya se fusionó y cómo se comporta en TRU y AQP con datos reales.
9. Recalcular siempre con la función viva (`fn_piso_plan_lectura`, md5 `3b9b7a08…`), no con el archivo de la migración.

## Cosas viejas que encontré de paso
`docs/pantallas/inventario-bajar.md` dice «3 bajadas en la historia de TRU» (hoy 331) y `traslados.md` «0 usos» (sigue en 0, pero hay 4 cabeceras); el comentario de cabecera de `lib/plan-piso-colores.ts` dice que Estampado y Multicolor no tienen hex (hoy están archivados con un hex de relleno y 0 variantes);
`lib/modulos.ts` y ADR-0161 P5 dicen que ver el stock de otras sedes es del líder pero el código y la base lo dan a toda cuenta con Existencias; el encabezado de `fn_piso_plan_lectura` dice que comparar sedes en Análisis queda «abierto» (se resolvió el 2026-10-04/06).
