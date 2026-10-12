# ADR-0352 — Plan del piso, primera entrega: los grupos del mix, la propuesta frente al piso real y la foto del espacio

**Fecha:** 2026-10-05
**Estado:** **Aceptado** (decisiones de Felipe del 2026-10-05: alcance solo lectura, tabla propia de grupos que asigna él, foto semanal del riel desde ya, entrada propia en Inventario con el tope del menú en 8). **Una decisión quedó a mi propuesta por defecto:** cómo pesar la venta propia (punto 2); Felipe preguntó «qué sugieres» y no la objetó.
**Módulo:** Inventario, Plan del piso (nuevo módulo `plan_piso`).
**Actualiza:** ADR-0329 (act. 2026-10-04, punto 3: el peso `días ÷ (días + 28)` pasa a medirse en prendas confirmadas) y la actividad 12 de ADR-0328.
**Documento de respaldo:** `docs/investigacion/2026-10-05-como-deciden-el-mix-zara-gap-lvmh-ralph-lauren.md` (cinco investigadores, un escéptico, las cuentas con cifras de TRU).

## El problema

ADR-0329 dejó decidido el mix del piso (total = m² × 30, reparto por roles, la venta propia ganando peso) pero no se podía ver ni comprobar nada: había un total por sede y ninguna pantalla donde el líder viera qué le tocaría a cada grupo. La investigación del 2026-10-05 agregó dos cosas: ninguna casa grande publica su mix de piso ni existe un modelo publicado que lo decida, y **nadie ha medido en ropa cuánto más vende una categoría por tener más lugar** (la elasticidad de 0,17 es de supermercado). Con ella, reasignar el piso vale entre ≈ 0,5 % y ≈ 3 % de ventas; con otra, 8 % o 19 %.

## Qué se construyó (solo lectura)

1. **Grupos** (`grupos_mix`, `categoria_grupo_mix`, `fn_grupos_mix`, `fn_categorias_grupo_mix`, `fijar_grupos_de_categorias`; migración `20261006100000`). 8 grupos con su rol; la propuesta de a qué grupo va cada categoría se siembra por prefijo y queda «por revisar»; el líder la confirma o la cambia.
2. **Propuesta** (`lib/mix-piso.ts`, `lib/mix-piso-partida.ts`; sin SQL nuevo): qué cuelga hoy por grupo, la industria, la venta propia con su rango y la propuesta en prendas que suma la capacidad.
3. **Foto del espacio** (`espacio_piso`, `fn_registrar_espacio_piso`, `fn_espacio_piso`; migración `20261006110000`; cron `/api/inventario/espacio-piso`): cada lunes, las prendas libres en el piso por sede y categoría.

## Decisiones

**1. Los grupos viven en tablas propias, y el rol vive en el grupo.**
DECIDÍ: `grupos_mix` (el grupo y su rol) y `categoria_grupo_mix` (una categoría, un grupo, con firma, versión e historial); sin políticas, solo funciones; escritura solo del líder y todo o nada.
DESCARTÉ: (a) una columna en `categorias`, porque el `alter` toma un candado exclusivo sobre una tabla que lee cada pantalla (el deadlock del 24-sep, ADR-0195) y cualquiera con el módulo Categorías la cambiaría sin firma; (b) partir `familias` en subfamilias, porque la familia decide de qué lado del riel va una prenda y se usa en otros lados; (c) seis grupos fijos en el código, porque una categoría creada por un líder quedaría fuera y cada cambio pediría un deploy.
SE ROMPE SI: una categoría cambia de familia con grupo ya asignado (el disparador solo mira al escribir en esta tabla).

**2. El peso de la venta propia se mide en prendas confirmadas, con una muestra efectiva menor y un techo.**
DECIDÍ: `peso = n_ef / (n_ef + 50)`, con `n_ef = confirmadas / 1,5` y techo de 75 %. Solo cuentan las ventas escaneadas (con prenda real); las «sin registrar» se muestran aparte y no mueven la propuesta hasta regularizarlas. 50 equivale a decir que el mix real de una sede puede apartarse de la industria ±6 puntos en una categoría del 26 %; el 1,5 y el techo son criterio, no dato.
DESCARTÉ: `días ÷ (días + 28)`, porque cuenta días (un día de TRU no es un día de AQP: ≈ 686 y ≈ 987 prendas) y equivale a decir que TRU y la industria difieren solo ±1,7 puntos, lo que los propios catálogos desmienten (Topitop y Oechsle difieren 11 puntos en polos). También descarté dejar la venta propia fuera del todo hasta el mes: ignora lo que TRU ya vende.
SE ROMPE SI: una campaña corta duplica una categoría y entra al cálculo (el techo la limita pero no la frena del todo; la frena el tope de ±3 puntos al mes de la entrega siguiente). Si en cambio casi todo se anota «sin registrar», las ventas confirmadas son pocas y el peso se queda bajo, que es lo correcto.

**3. Cada porcentaje de venta lleva su rango de Wilson.**
DECIDÍ: «entre a y b» con el intervalo de Wilson al 95 % sobre la muestra efectiva.
DESCARTÉ: «p ± 1,96·√(p(1−p)/n)», porque con 0 ventas da «0 ± 0» (seguro que no se vende) cuando con 45 ventas efectivas el valor real puede llegar a ≈ 8 %.
SE ROMPE SI: hay tan pocas ventas que ningún grupo tiene muestra (se dice «sin ventas», nunca un 0).

**4. La foto del espacio: llave por fecha, función del servidor, cron de Vercel.**
DECIDÍ: una fila por (tienda, fecha, categoría), tomada por `fn_registrar_espacio_piso` (solo `service_role`, todo o nada, idempotente por día) desde el cron del lunes 3:00 de Lima, igual que la conservación del club. Lo colgado es `fn_existencias_base` (ADR-0270), la misma fórmula que la pantalla.
DESCARTÉ: (a) una columna `semana`, porque fijaría la cadencia en el esquema (pasar a diario son 46 mil filas al año, nada, pero habría que migrar); (b) `pg_cron`, que este repo no usa en ningún lado; (c) tomarla al abrir la pantalla, porque depende de que alguien la abra y escribe desde una lectura.
SE ROMPE SI: el cron falla (esa semana queda sin foto, que la pestaña muestra como hueco y no como cero) o se mide la elasticidad con fotos «por cuadrar» (se guardan marcadas y salen apagadas: no sirven).

**5. Plan del piso entra directo en Inventario y el tope del menú sube a 8.**
DECIDÍ (Felipe, preguntado con las dos opciones): fila propia en Inventario, tope 7 → 8, y la fotografía del menú del líder se actualiza con su aprobación. Una pestaña de Existencias no era un módulo (ADR-0306): quien ve Existencias vería el plan.
DESCARTÉ: el subgrupo «El piso» (Frescura + Plan del piso), que deja Frescura un clic más adentro, justo lo que Felipe descartó el 27-sep.
SE ROMPE SI: Inventario suma otra pantalla o aparece un rol que vea Análisis, Frescura, Plan del piso y Recibir sin Compras: ahí sí se regrupa, y el 8 no vuelve a subir.

## Estados imposibles que la base niega

Una categoría en dos grupos; un rol inventado; un vestido en un grupo de fuera del riel o un cinturón en el riel; una firma sin fecha; dos fotos del mismo día para la misma tienda y categoría; modelos más que prendas, prendas negativas o una foto de 2025; un cambio sin firma ni historial (RLS sin políticas); dos líderes que se pisan (PT409, nunca una sobrescritura silenciosa).

## Lo que queda fuera (siguiente entrega)

Guardar y aprobar el mix con motivo e historial; el ajuste del encargado; **el tope de ±3 puntos al mes con zona muerta** (hoy no hay un mix aprobado contra el que acotar: la investigación mostró que el tope solo es del tamaño del ruido de un mes de ventas, ±3,2 puntos al 95 %, así que por sí solo deja pasar el ruido); la cobertura de Little; «entra una, sale una»; la prueba de 4 semanas de Jeans; el mínimo por talla en el motor; la reserva de prueba por rol.

## Actualización 2026-10-05 (tarde) — la propuesta se ve y se lee mejor

Tras revisar el informe interactivo «Mix del Piso» (artefacto del 5-oct), se aplicó lo que sirve a la pantalla, con los colores de la guía:
- **El riel a escala** (`RielAEscala.tsx`): dos rieles de ganchos, Hoy y Propuesta, con la MISMA capacidad. Muestra lo que una tabla no dice: TRU está al 10 % (61 de 600). Una barra al 100 % de lo colgado escondía el volumen.
- **La mancuerna** (`Mancuerna.tsx`): hoy, industria, venta propia (con su rango de Wilson) y propuesta de cada grupo en una línea, para ver cuál empuja hacia dónde.
- **La lectura en palabras** (`lecturaDeGrupo`): «Faltan 88: cuelga más», «Dentro de lo esperado», «Sobran 20: no cuelgues más hasta llegar a su parte; no se retira nada», «es destino, no baja sin el OK del líder».
- La barra del peso de la venta en su tarjeta y la mezcla por fila en la Historia.

DECIDÍ: el signo de la lectura sale de la META EN PRENDAS (`capacidad × %`, la misma que usa el motor del piso), con tolerancia de ±3 puntos de la capacidad; solo sin capacidad conocida se compara el porcentaje.
DESCARTÉ: comparar el % de lo que cuelga con el % propuesto: con el riel a medias (300 de 600) polos tenía 66 % de lo colgado (más que su 48 %) y aun así le faltaban 88 prendas, y el texto se contradecía. Lo cazó la prueba antes de verlo en pantalla.
DESCARTÉ también el rojo para colorear un grupo (la guía lo reserva: «acento sagrado, máx. 2 por pantalla»): los seis grupos usan tinta, pizarra, verde, ámbar, taupe y sand.
SE ROMPE SI: se agregan más de seis grupos en el riel (los colores se reutilizan y dos grupos se confundirían) o el riel pasa de unos 2.000 ganchos (el canvas se pone ilegible).

## Para producción

1. Pegar `20261006100000_plan_del_piso_grupos_del_mix.sql` y después `20261006110000_plan_del_piso_foto_del_espacio.sql`, cada una sola en el SQL Editor, **antes de publicar la web**. Ninguna crea políticas ni toca tablas en uso. La verificación de cada una está en su encabezado.
2. Publicar la web. `CRON_SECRET` y la llave de servicio ya existen (los usa la conservación del club): no hay variables nuevas.
3. La primera foto se toma el próximo lunes a las 3:00 de Lima. Si se prefiere diaria, es una línea en `vercel.json`.
4. Refrescar el diccionario de datos cuando estén aplicadas (`generado/COMO-REFRESCAR.md`).
5. Darle el módulo «Plan del piso» a quien corresponda en Roles y accesos (nace solo para el líder).

## Objeción y riesgos abiertos

- La elasticidad de espacio en ropa sigue sin medirse: lo que esta entrega muestra no justifica un optimizador (el valor de reasignar es chico y depende de ella). Por eso se construyó la foto.
- El peso (n₀ = 50, efecto de diseño 1,5, techo 75 %) es criterio. Está a la vista en la pantalla («Cómo se calcula») y en `lib/mix-piso.ts`, para que Felipe lo discuta.
- La cobertura de TRU no cuadra: con 98 prendas en 4 días son ≈ 3,5 semanas de piso y ADR-0329 dice «7 a 9». Hay que reconciliarlo antes de fijar un objetivo de cobertura.
- Las ventas «sin registrar» (≈ 7 de cada 10 en TRU) siguen fuera de la propuesta hasta regularizarlas (PR #788, parte 2).
- AQP sigue con 1.800 prendas provisionales: hay que contarla.

## Actualización 2026-10-10 — la base también exige el módulo «Plan del piso» (Felipe)

Al traer el PR #831 sobre `main`, la prueba de roles (`pnpm pruebas:roles-cobertura`) marcó lo que esta entrega había dejado abierto a propósito: el módulo `plan_piso`
es delegable, pero las tres lecturas (`fn_grupos_mix`, `fn_categorias_grupo_mix`, `fn_espacio_piso`) pedían solo la puerta de retail y, la última, la sede. Apagarle el
módulo a un rol le escondía la pantalla, pero por la API seguía leyendo los grupos y las fotos. La decisión original («son un catálogo de pertenencias, sin cifras»)
era razonable para los grupos; la prueba pide además que un módulo delegable tenga un guardián en la base, y Felipe eligió cumplirla así.

**Decisión (Felipe, 2026-10-10):** las tres lecturas piden `fn_ve_modulo('plan_piso')` (migración `20261010171845_plan_del_piso_quien_ve_el_modulo.sql`). Quien no es de
retail sigue recibiendo 42501 («No tienes acceso a retail» en los grupos; «No tienes acceso al espacio de esa sede» en las fotos, como siempre); quien es de retail y no ve el módulo, 42501 con la pista `plan_piso_sin_modulo`. La escritura
(`fijar_grupos_de_categorias`, solo el líder) y la foto (`fn_registrar_espacio_piso`, solo el servidor) no cambian. Hoy el módulo no tiene ningún rol, así que **no cambia
nada para nadie**: solo el líder lo ve, en la pantalla y en la base.

DECIDÍ: la base exige el módulo en las tres lecturas, con una migración nueva (`20261006100000` ya está en producción y una migración aplicada no se reescribe).
DESCARTÉ: (a) anotar `plan_piso` en `SOLO_PANTALLA` de `roles_cobertura_modulos.mjs`: es la lista que solo puede encogerse (devoluciones salió el 2026-10-09) y apagar el
módulo seguiría sin apagar nada en la base; (b) marcarlo «solo líder por ahora»: el líder no podría dárselo a nadie, contra lo que se decidió el 2026-10-05.
SE ROMPE SI: otro módulo necesita leer estos grupos o fotos (la columna «ocupa · meta» de Frescura, pendiente de este PR): quien ve Frescura y no tiene «Plan del piso»
recibiría 42501. Esa pantalla trae su propia función de lectura con su propio candado; no se relaja esta.

**Límites que quedan escritos (revisión adversarial del 2026-10-10):** (1) la escritura, `fijar_grupos_de_categorias`, sigue pidiendo solo al líder: si se le oculta `plan_piso` a un líder (`lider_modulos_ocultos`) pierde las lecturas, pero por la API todavía podría confirmar grupos; hoy nada se lo oculta, y pedirle también el módulo a la escritura es otra decisión de Felipe (toca una escritura). (2) `20261006100000` y `20261006110000` traen las mismas funciones sin la puerta: **no se re-pegan después de `20261010171845`**.

**También en esta actualización:** al fusionar con `main`, el Plan del piso pasó a las piezas únicas de ADR-0358 (`<Pestanas>`, `<Vacio>`, `ui/BarraApilada`); la barra y las
pestañas a mano se retiraron. No cambia qué hace nada, solo cómo se dibuja. **Para producción, en este orden:** `20261006110000` (la foto), `20261010171845` (esta), cada una sola.

## Actualización 2026-10-10 (b) — `/formidable`: el riel en barras, tres tarjetas y un aviso que lleva a Grupos (Felipe)

> **Lo visual de esta actualización (barras, tres tarjetas, canvas de ganchos, `claseDeTramo`, «Cómo se calcula») fue reemplazado el 2026-10-11 por el riel de perchas: ver la actualización de abajo.** Quedan en pie el aviso que lleva a Grupos, la coma de miles, la tabla que se desplaza (c) y todo lo que no es dibujo.

**Pedido:** Felipe, 2026-10-10: «¿podemos mejorar su estética aún más?» y, tras ver la propuesta de tres cambios, «aplicamos». Se corrió `/formidable` sobre la Propuesta
(informe: `docs/formidable/plan-del-piso.md`). **Solo presentación: `lib/mix-piso.ts` y todo lo que calcula o guarda quedan intactos.** No hay SQL.

**El problema, medido (AQP: 78 prendas colgadas de 1,800, a 1440 × 900):** el riel de «Propuesta» —la respuesta de la pantalla— empezaba a 1,236 px, casi un pliegue y medio
bajo la primera pantalla; cada riel era un canvas de 478 px con ~1,700 contornos iguales de ganchos vacíos, y la sección entera medía 1,241 px de los 3,792 de la página.

**Qué cambió:**
1. **El riel son dos barras.** «Hoy» y «Propuesta» son `<BarraApilada>` (ADR-0358) medidas contra la MISMA escala (`escalaDelRiel`: la mayor de la capacidad y lo que suma cada una):
   lo libre es la pista de arena, sin dibujar nada. Pasar el cursor, enfocar con el teclado o tocar un grupo lo resalta en las dos barras y en la leyenda (el mismo estado de antes);
   tocar lo libre de una barra suelta el grupo fijo. Los canvas con un gancho por prenda **siguen**, detrás de «Ver cada gancho (1,800)» (cerrado por defecto). La sección pasó de 1,241 a
   377 px y la barra de «Propuesta» quedó a 774 px: dentro de la primera pantalla.
2. **Tres tarjetas, no cuatro, con la misma forma.** «Caben en el riel» se fundió en «Cuelga hoy»: «**78** de 1,800». «Ventas confirmadas» ganó su barra (5 confirmadas contra 210 sin
   registrar), que es lo que explica el 6 % de «Peso de la venta». La línea y la barra van en el `pie` de `<TarjetaCifra>` (la barra al final): las tres quedan a la misma altura (medido a 1024: a 17 px del fondo).
3. **Un aviso, no una nota.** Lo que antes era una nota («…siguen "por revisar" en la pestaña Grupos») es `<Aviso tono="atencion">` con un botón («Revisar las 45 categorías»; «Ver las…» si quien mira no es
   líder) que abre la pestaña Grupos y pasa el foco a su pestaña. El texto sale de `avisoDeGruposPorRevisar` (`lib/plan-piso-grupos.ts`, con su prueba).

**Decisiones**

**1. Barras, no un canvas más chico.**
DECIDÍ: la pieza única de barras de ADR-0358, y los ganchos a un toque.
DESCARTÉ: (a) achicar la cuadrícula de ganchos: seguirían siendo ~1,700 contornos iguales y la respuesta, bajo el pliegue; (b) borrar los ganchos: los diseñó ADR-0329 y sirven para *estar* en el piso,
no para decidir; (c) una barra hecha a mano: `lib/unificar.test.ts` ya no la deja; (d) `ui/BarraAvance` para «Cuelga hoy»: `docs/unificar/grafico.barra.md` deja las barras de un solo relleno «para otra ronda», y
esa pieza se anuncia como `progressbar` sin nombre. **Desvío deliberado:** la de «Cuelga hoy» es una `BarraApilada` de un tramo con `total`, decorativa; se migra cuando esa ronda decida.
SE ROMPE SI: una sede casi vacía (los tramos de «Hoy» miden 3 a 16 px y el resaltado casi no se nota: el control equivalente es la leyenda, que dice las cifras) o hay más de seis grupos (los colores se reutilizan).

**2. Dos barras miden contra lo mismo.**
DECIDÍ: `escalaDelRiel(capacidad, sumaHoy, sumaPropuesta)` como `total` de las dos. Si hoy cuelga más de lo que cabe, «Hoy» llena la pista y «Propuesta» (que suma la capacidad) queda más corta (medido con
2,340 colgadas y 1,800 de capacidad: 99 % y 76 %); antes cada barra se medía contra lo suyo y las dos parecían iguales. (Lo halló el revisor escéptico.)
SE ROMPE SI: alguien pasa a una barra un `total` propio.

**3. Un grupo, un color en TODA la pantalla.**
DECIDÍ: `claseDeTramo` (`lib/mix-piso-visual.ts`) es la única fuente para barras, leyenda, Mancuerna e Historia. El sexto grupo era `sand`, que dentro de una `<BarraApilada>` es el color de su propia pista y de su
hilo (un hueco); sale como `taupe` a 45 %, y el canvas lo dibuja igual (arena y encima taupe a 45 %). Se quitaron `fondoDeGrupo`/`FONDOS_DE_GRUPO`, que dibujaban el otro. Esto también arregla el mismo hueco que ya
tenía la barra de la pestaña **Historia** (usaba `bg-sand`); lo halló el revisor.
DESCARTÉ: otro token para el sexto grupo: los tokens oscuros distintos ya están en uso (tinta, pizarra, verde, ámbar, taupe) y los de `metodo-*` son de medios de pago.
SE ROMPE SI: se necesita contraste de 3:1 del sexto tramo contra su pista (hoy 1.8:1 en claro, 2.2:1 en oscuro, medido por el revisor; antes era 1.0): lo que dice la barra está también en texto, en la leyenda con las cifras.

**4. Los miles llevan coma: «1,800».**
DECIDÍ: `cifraEs`, la convención de Perú del ERP (`resumen-formato.ts`: «S/ 51,870»), en las tarjetas, las barras, la leyenda y TODA la tabla («Total del riel» decía «1800 · 100 %»). Mi propuesta del chat decía «1.800», como
escriben estos ADR; era la convención de otro lado. (La primera versión de este texto decía que la tabla ya mostraba «1,800»: era falso en el total del riel; lo corrigió el revisor.)

**5. El aviso separa «por revisar» de «sin grupo».**
DECIDÍ: `avisoDeGruposPorRevisar(porRevisar, sinGrupo, esLider)`. Una categoría «por revisar» tiene un grupo propuesto que la propuesta SÍ usa; una «sin grupo» no tiene ninguno y NO entra al reparto
(`armarPropuesta` las cuenta aparte). El primer texto decía «la propuesta usa el grupo que el sistema les puso» también para las segundas, y era falso. Con las dos cosas, el título y el botón cuentan todas (es lo que
muestra la pestaña Grupos) y el detalle dice cuántas son de cada una.
SE ROMPE SI: la propuesta empieza a repartir las «sin grupo» (cambia el texto).

**6. El aviso cambia de pestaña por un contexto, y el foco va a la pestaña.**
DECIDÍ: `useIrALaVista` (`PlanDelPisoPestanas`): las tres vistas son estado de la pantalla y la Propuesta llega del servidor como `children`; el contexto cruza esa frontera. Sin él (fuera de la pantalla) el aviso se
queda sin botón, nunca con uno que no hace nada. El foco pasa a la pestaña abierta (patrón de pestañas; el siguiente Tab entra al panel), en un efecto y no en un `requestAnimationFrame` (que se pausa con la ventana oculta).
DESCARTÉ: dar el foco al panel (`tabIndex={-1}` + `outline-none`): su contorno quedaba invisible; y una ruta (`?vista=grupos`): la pestaña no es una ruta y recargaría el servidor.

**Movimiento:** nada propio. Lo que se mueve es de las piezas del sistema (el aviso entra y dibuja su ícono; las barras entran creciendo y se reacomodan; el botón sube 2 px), todas de ADR-0136/0358 y apagadas con
`prefers-reduced-motion`; lo único que escribe este cambio es el giro de 200 ms del chevron de «Ver cada gancho».

**7. La tabla se desplaza dentro de su tarjeta (corregido el mismo día, 2026-10-10 (c)).**
`PLANTILLA` suma 38 rem de columnas fijas más una `minmax(0, 1.5fr)`; con las separaciones y el relleno son 45.5 rem, así que una tarjeta de 657 px (1024 px con el menú abierto) dejaba a «Grupo» en 0 px y a «Diferencia» 52 px
fuera de ella: el mismo error que ya documenta `Tabla` (2026-09-15). DECIDÍ: la convención de `Tabla` (la fila se desplaza dentro de su tarjeta, `overflow-x-auto`) más un ancho mínimo desde `sm` (56 rem y, en «Fuera del riel», 40 rem).
Medido: «Grupo» pasa de 0 a 168 px a 1024 y no cambia a 1280 (183) ni a 1440 (294); a 375 px las filas siguen apiladas.
DESCARTÉ: esconder columnas bajo un ancho (`desdeLg`/`desdeXl` miden el navegador, no la tarjeta, y el menú abierto le quita 270 px): perdería información sin aviso.
SE ROMPE SI: se agrega una columna fija (hay que sumarla al mínimo), y a 1024 px el nombre del grupo sale de la vista al ver «Diferencia» (primera columna no fija).

**Lo que quedó fuera a propósito** (lista aparte del informe, sin hacer): un camino desde «Por cuadrar» a `/inventario/cuadrar`, los roles («Destino», «Rutina»…) solo por `title`, la jerga de «Cómo se calcula», y las tres piezas compartidas
(`TarjetaCifra` con `acento`, `Aviso` a 375 px, las paradas de teclado de `BarraApilada`).
**Para producción:** nada que pegar; solo publicar la web.

## Actualización 2026-10-11 — el riel de perchas, maqueta A «La percha» (Felipe eligió mirando)

**Pedido:** Felipe, 2026-10-10: «no me convenció lo tuyo» (el riel en barras de la actualización (b)). Se le mostraron tres direcciones de estilo más la actual, lado a lado y con datos reales
(`docs/maquetas/plan-del-piso-2026-10/`), y eligió **A «La percha»**: «si se ve mejor, dúbalo». Sobre la tabla y la mancuerna dijo «dejarla pero alinearla con un mejor diseño uniforme a A».
**Solo presentación: `lib/mix-piso.ts`, las lecturas y todo lo que se guarda quedan intactos.** No hay SQL.

**Qué cambió**
1. **Un pictograma, no barras.** «Hoy» y «Cómo quedaría» son dos rieles de perchas: cada percha dibujada vale N prendas y las de un grupo van juntas en un tramo con la silueta de su categoría sobre el color de su grupo.
   `unidadDePercha(capacidad)` (`lib/plan-piso-percha.ts`) elige la MENOR de 5, 10, 20, 25, 50 o 100 con la que el riel entero cabe en 40 perchas: AQP 1,800 → 50 (36 perchas), TRU 600 → 20, LIM 180 → 5. Pasar el
   cursor, enfocar con Tab o tocar un grupo lo resalta en los dos rieles y en las leyendas; tocarlo lo deja fijo (con filo propio).
2. **Una tarjeta con la respuesta.** «78 de 1,800 prendas», una frase («Tu riel estaría casi vacío (4 % ocupado). Falta contar tu piso…»), «1,722 lugares libres» como riel vacío y rayado, y el botón
   «¿Por qué?» con el panel de «cómo se calcula». Las tres tarjetas de cifra y la nota «Cómo se calcula» de (b) se retiraron.
3. **«Fuera del riel» son dos fichas**, no una tabla; la **mancuerna** y la **tabla** de detalle se quedan, con el ícono y el color del grupo, bajo «El detalle, grupo por grupo».
4. **Se retiraron** `RielAEscala.tsx` (barras y canvas de ganchos), `claseDeTramo`/`fondoDeGrupo`, `lineaDeVentas` y `escalaDelRiel`. **Se agregaron** `plan-piso-percha.ts`, `plan-piso-siluetas.ts`, `app/estilos/plan-piso.css` y
   `components/plan-piso/{TarjetaDelRiel,PorQue,IconoDeGrupo,SiluetasDelPlan}.tsx`.

**Decisiones**

**1. Un color por grupo, en UN solo lugar: `--grupo-0` … `--grupo-5` de `plan-piso.css`.**
DECIDÍ: el color sale de la posición del grupo en la lista del riel (`colorDeGrupo(i)` devuelve `var(--grupo-N)`), solo tokens, con su versión oscura (el 4 al 66 %: a 58 la silueta medía menos de 3:1).
Reemplaza a `claseDeTramo` (decisión 3 de (b)). El rojo no pinta ningún grupo (máx. 2 por pantalla).
SE ROMPE SI: se agrega un séptimo grupo EN EL RIEL (comparte color con el primero y cae a la silueta genérica). La base siembra 6 y no hay pantalla ni RPC que cree grupos; `lib/plan-piso-siluetas.test.ts` falla si la
migración siembra más de 6 en el riel, y quien agregue uno suma su silueta, su color y su prueba en el mismo cambio.

**2. Honestidad primero: mientras la sede no cuadró su piso, «hoy» es lo que el sistema CREE.**
DECIDÍ: la frase va en condicional («estaría»), el riel libre lleva «según el sistema · falta contar tu piso» con borde rayado, y la línea del pie, la leyenda y los nombres para lector de pantalla dicen «según el
sistema hoy 30, quedaría 788» **sin flecha** (la flecha insinuaría «faltan 166», que la tabla de abajo se niega a dar). La revisión halló que esas tres líneas sueltas lo afirmaban como un hecho: corregido (`leyendaDeGrupo(g, cuadrado)`).
DESCARTÉ: atenuar el riel «Hoy» (lo hacía el de (b)): la maqueta A tampoco lo hace y el riel rayado ya lo dice.

**3. El panel «¿Por qué?» abre pegado a su botón** (se aparta de la maqueta, donde iba tras la leyenda).
DECIDÍ: `PorQue.tsx` (cliente) entrega botón + panel como fragmento dentro de la cabecera de «Cómo quedaría»; el panel ocupa su propia línea justo debajo. Medido en la maqueta: abría a 274–298 px del botón en escritorio y a 581 px a
375, siempre fuera de la vista, y el toque parecía no hacer nada. También existe sin capacidad medida (antes desaparecía con el riel).
DESCARTÉ: `scrollIntoView` (a 375 px el panel mide ~660 px y el botón quedaba fuera de la pantalla, sin poder cerrarlo).

**4. Una palabra para cada cosa.** «Punto de partida» (el surtido de Topitop, Estilos y Oechsle, ajustado al clima de la sede: se nombra la fuente a la vista, y ya no «lo que suele funcionar en tiendas de ropa», que afirmaba un
rendimiento que no existe) y «tus ventas», en la tarjeta, el panel, la mancuerna y la tabla. «Industria» y «venta propia» ya no aparecen (`lib/plan-piso-pantalla.test.ts` lo vigila). «% del riel» ya no significa dos cosas: la columna
«Hoy» dice «% colgado». El número de «(23 % ocupado)» es siempre lo ocupado.

**5. Un cero necesita su muestra** (ADR-0214): las fichas de «Fuera del riel» dicen «vende 0 % (0 ventas)», el botón dice «Casi no usa tus 5 ventas confirmadas (6 %): faltan registrar 210», y la cola «casi no sabemos» del panel solo
sale si el rango es ancho (≥ 40 puntos).

**6. Una pieza propia, anotada como excepción de ADR-0358.** El riel de perchas no es `BarraApilada` (`grafico.barra` es «una fila baja de tramos sin texto»; esto es un pictograma donde cada figura vale N prendas) y «78 de 1,800» es el
titular de la tarjeta, no una `TarjetaCifra`. Queda anotado en `docs/unificar/grafico.barra.md` y `cifra.md` para la próxima ronda de `/unificar`. **Pregunta abierta para Felipe:** la pestaña **Historia** sigue dibujando la mezcla de los
mismos grupos con `BarraApilada`; hoy el mismo grupo tiene dos caras en dos pestañas de la misma pantalla. También a propósito: `.pp-chip`/`.pp-lg` son una leyenda que resalta el riel (responden con opacidad, sin `mov-boton`);
`.pp-porque` es la píldora de la maqueta; `.pp-etq` pesa 700 como la maqueta y no 600 como `label-cayla`; el `Aviso` de las categorías por revisar apila su botón bajo el texto con una regla local a 560 px (`plan-piso.css`), sin tocar la pieza.

**Revisión de 7 lentes (2026-10-11), 53 agentes de solo lectura:** React/servidor-cliente, accesibilidad, fidelidad a la maqueta, datos y bordes, reglas del sistema, información perdida o ganada y un escéptico general; un escéptico
reprodujo o refutó cada hallazgo. **Se aplicó lo confirmado o matizado:** el grupo sin perchas que apagaba todo el riel, el segundo toque táctil que no soltaba, las siluetas montadas dos veces (ids duplicados), los títulos que dejaron de ser
encabezados, la línea viva que se anunciaba dos veces, «hoy» como hecho, el panel lejos de su botón, «Fuera del riel» que desaparecía en una sede sin propuesta, el desborde horizontal a 375 px con un grupo de más de ~19 perchas (`--mayor`),
rótulos cortados a media letra, tramos más anchos con menos prendas, la mancuerna a 375 px, las cifras de la tabla a la izquierda de sus títulos y la animación de entrada de 840 ms (ahora < 500). **Se refutó:** la afirmación de que el riel
«Hoy» casi vacío se leía como un hecho: la tarjeta lo dice cinco veces.

**Lo que NO se aplicó (queda para decidir mirando, con Felipe):** (a) la clave «Cada percha = 50 prendas» queda al pie de la tarjeta, como en la maqueta; el escéptico propone ponerla pegada al riel y decir «prendas»/«lugares» con un solo
sentido; (b) la tabla de detalle a 1024 px con el menú abierto se desplaza dentro de su tarjeta sin pista visible de que hay más a la derecha (decisión (c)); (c) un chip ámbar «45 categorías por revisar» en la cabecera, como trae la
maqueta; (d) tocar un tramo del riel para fijarlo (la maqueta lo hacía; aquí se fija con los chips y las tarjetas); (e) los grupos 7 en adelante (decisión 1).

**Cómo se verificó y qué NO:** `tsc`, `eslint` y `vitest` (414 archivos, 157,162 pruebas) en verde; la pantalla real con los componentes reales y datos inventados de AQP, TRU, LIM, con 7 grupos, con más colgadas que capacidad, sin capacidad, sin
sede y con un grupo que ocupa el 83 % del riel, a 1440, 1024 y 375 px, en claro y oscuro, y las interacciones (señalar, fijar, Tab, toque) en Chrome. **No se vio la ruta real contra su base** (la base local no tiene las tablas del Plan del
piso, y el día de la revisión Docker no estaba disponible), **no se corrió `tema:auditar`** ni `/chaos` sobre Grupos (es lo único que guarda y no se tocó), y **no lo probó una colaboradora real**.
**Para producción:** nada que pegar; solo publicar la web.

## Actualización 2026-10-11 (b) — «Dónde está cada grupo» se lee con el cursor y «Fuera del riel» dice cuánto llevar (Felipe)

Felipe, tras ver la pantalla en producción: «se ve bien, buena labor»; y pidió dos cosas: que «Dónde está cada grupo» se vea mejor al pasar el mouse, y «cuánto deberíamos incluir» de las categorías que van cerca de caja, «investigando y asignando un estimado para empezar».
Solo presentación y una referencia nueva: no se guarda nada, no hay SQL. Detalle de la investigación: `docs/investigacion/2026-10-11-cuanto-llevar-fuera-del-riel.md`.

**1. La mancuerna se lee con el cursor, con una tarjeta que FLOTA.**
DECIDÍ: al pasar el cursor por una fila (o enfocarla con Tab, o tocarla) la fila se enciende y las demás bajan; cada marca lleva su cifra en una etiqueta arriba o abajo de la pista (las que caen a menos de 9 puntos comparten una, como Hoy 47.6 y
punto de partida 48 de Polos) y junto a la fila flota una tarjeta con las cuatro cifras en palabras y la frase que ya decía la tabla. Tocar una fila la deja fija; tocar una marca de la leyenda la resalta en todas las filas. Cada fila es un
botón con un nombre que dice las cuatro cifras. La lógica (etiquetas sin encimarse, cifras, frases) es pura: `lib/mancuerna-lectura.ts`, con una prueba de propiedades sobre 14,641 combinaciones.
DESCARTÉ: un panel de lectura fijo arriba de las filas. Reservar su alto dejaba un hueco (108 px en reposo) o, sin reservarlo, bajaba las filas bajo el cursor al aparecer: el cursor quedaba sobre otra fila, la lectura cambiaba y volvía a
mover (se midió: un parpadeo en bucle; Playwright no logró ni apuntar a la segunda fila). La tarjeta es `position: absolute` y `pointer-events: none`: el alto de la mancuerna no cambia (550 px antes, durante y después de barrer las seis filas) y el cursor
sigue llegando a las filas que tapa. Las dos últimas filas abren hacia arriba.
SE ROMPE SI: se agrega una séptima fila y la tarjeta de la última no cabe (hoy abre hacia arriba desde la antepenúltima), o la tarjeta pasa de unos 160 px (taparía más de tres filas).

**2. «Para empezar»: cuántas prendas sostiene lo que la sede vende (fichas de «Fuera del riel»).**
DECIDÍ: cada ficha trae una línea «Para empezar: unas 115 a 190 prendas, entre mostrador y trastienda», calculada al abrir la pantalla con `referenciaFueraDelRiel` (`lib/mix-piso.ts`, pura): ritmo = peso × lo vendido + (1 − peso) × la meta, con el mismo
`pesoDeLaVenta` del riel (techo 0.75), por semana; rango = ritmo × 3 a 5 semanas (accesorios) o 3 a 4 (bolsos y calzado), redondeado de a 5 desde 30. Las semanas son criterio con su fuente en `lib/mix-piso-partida.ts`
(`SEMANAS_DE_VENTA_FUERA_DEL_RIEL`). Con las cifras del 2026-10-11 (12 días con venta): TRU accesorios 115–190 y bolsos 35–50; AQP accesorios 90–150 y bolsos 35–45; LIM sin ventas, y bolsos «no lo lleva».
**Dos desvíos del riel, escritos aquí a propósito** (la regla 2 de `mix-piso.ts` dice que solo cuentan las confirmadas): (a) para estos dos grupos SÍ cuentan las ventas sin registrar, porque un accesorio casi nunca está en el catálogo (TRU: 1 modelo con
stock contra 73 prendas vendidas) y sin ellas el grupo parecería no venderse; (b) la meta se lee en PRENDAS, no en soles (viene de % de ingresos de empresas de EE. UU.; en soles TRU accesorios es 6.3 % y AQP 9.5 %, por debajo de la meta, y quien lea
esa brecha no debe comprar piezas para «llegar a la meta»). La ficha ahora dice de dónde sale el %: «vende 12.9 % (73 ventas: 6 confirmadas y 67 sin registrar)». El panel «¿Por qué?» explica el cálculo y que no es una compra.
DESCARTÉ: (i) restar «Para empezar» de lo que cuelga («faltan 160»): el stock del sistema no descuenta lo vendido sin registrar (8 contra 73), y ADR-0352 decisión 2 ya evitó afirmar una diferencia que la tabla se niega a dar; (ii) un 0.75 fijo y «tomo 50
como centro»: la pantalla tiene que poder reproducirse con una prueba, y el peso sale de la muestra (0.49 en TRU accesorios, 0.13 en bolsos); (iii) un número para LIM sin ventas ni mostrador confirmado: dice «todavía sin ventas aquí»; (iv) las reglas de reposición por
modelo, el reparto por tipo, el calzado de prueba y el capital en la ficha: son decisiones de compra de Felipe y viven en la investigación.
SE ROMPE SI: se agrega un grupo fuera del riel sin su entrada en `SEMANAS_DE_VENTA_FUERA_DEL_RIEL` (no tendrá línea, no se rompe); la lectura deja de traer las ventas sin registrar por categoría; o alguien lee «Para empezar» como la compra que hay que hacer (de ahí «no una compra»,
«primero cuenta lo que hay» y el aviso en el encabezado). La ventana de la lectura es fija de 14 días: hasta el 13-oct (la primera venta fue el 30-sep) el ritmo sale ~14 % bajo (TRU accesorios ~95 a 160): se corrige solo.

**Lo que se le dice a Felipe que confirme:** si los S/ 65 del bolso llevan IGV (si sí, margen ~15 % y 3 semanas, no 4); si el stand de LIM tiene mostrador; el costo real de aretes, pulseras, relojes y lentes (el dinero de la investigación sale de solo 3 modelos con costo cargado); y qué hacer con las
categorías «Accesorios de moda» y «Bufanda», que no están en ningún grupo.

## Actualización 2026-10-11 (c) — las variantes: cada percha lleva el color de lo que de verdad cuelga (Felipe)

**Qué pidió Felipe, mirando la pantalla:** «en los íconos de Polos, tops y blusas un solo color está genial, pero ¿mostrar las variantes?», y que la ficha diga «Polos, tops y blusas 150» y no «Polos 150». Contestó tres preguntas:
las variantes son **los colores reales** (no los tipos de prenda), se ven en **«Hoy», en «Cómo quedaría» y en los íconos de las fichas y las tarjetas**, y cada percha lleva **un solo color** (no franjas).

**Decisiones.**
1. **Una percha, un color, en proporción a lo que cuelga** (`lib/plan-piso-colores.ts`, con su prueba). Es un reparto de resto mayor —el mismo de `repartirEnPrendas`—: la suma da exactamente las perchas del tramo y ningún color se aparta de
   su parte en más de una percha. Los colores van en bloques seguidos, del más abundante al menos, y «Otros colores» al final. Un color con al menos media percha (`MINIMO_DE_COLOR`) tiene **siempre** una percha propia aunque el redondeo
   se la quitara; lo que no llega, y lo que no es un color (Estampado, Multicolor: sin `colores.hex`), se junta en «Otros colores» (`--pp-otros`, un gris neutro de la interfaz). Un primer intento —cada percha toma el color que cubre su
   centro— dejaba sin lugar a un color con 0,6 de percha mientras sí mostraba el gris; por eso se cambió.
2. **El dato ya existía:** `LecturaDelPiso.tallas` trae `colorHex`, `color` y lo libre en el piso. `armarPropuesta` suma los colores de cada grupo con la MISMA cuenta que `colgadas` (los colores de un grupo siempre suman lo que el grupo
   cuelga; una prueba lo exige) y los deja en `FilaDelRiel.colores`. Solo se dibujan: ninguna cuenta de la propuesta cambia (otra prueba lo exige). **Sin migración, sin RPC nuevo.**
3. **«Cómo quedaría» no elige colores.** La propuesta reparte lugares, no colores; su riel repite la mezcla de HOY de cada grupo para que se parezca a lo que ya se conoce, y la pantalla lo dice al pie
   («Los colores son los de lo que cuelga hoy: “Cómo quedaría” repite esa mezcla, no elige colores»). Un grupo que hoy no cuelga nada no tiene qué repetir: su propuesta se dibuja del color del grupo.
4. **El color del grupo no desaparece:** queda en el **poste** de cada tramo, en el filo y el fondo de la ficha o la tarjeta al señalarla, en la tabla y en la mancuerna (donde hace falta saber DE QUÉ GRUPO es). El color de una prenda es
   dato, no tema: lleva `data-color-dato` y no cambia en oscuro; el contorno es un poco más firme que el de la silueta del grupo, porque una prenda blanca o beige se funde con el papel.
5. **El ícono de la ficha y la tarjeta son hasta tres prendas pequeñas superpuestas**, una por color principal, la del color que más cuelga al frente (`coloresDelIcono`, `IconoDeGrupo colores`). Se descartó el relleno por franjas
   verticales: sobre una camisa las franjas caen en las mangas y el cuerpo, y «Polos» se leía como «cuerpo blanco con una manga negra». El ícono con colores mide siempre el ancho de tres prendas, centrado, para que los títulos de las
   tarjetas no se desalineen de un grupo a otro. Las filas de la tabla, la mancuerna y «Fuera del riel» **no** cambian (siguen del color del grupo).
6. **El nombre completo.** La ficha de «Hoy» dice «Polos, tops y blusas 150» (antes `nombreCorto`: «Polos 150»), y su nombre para el lector de pantalla empieza por lo que se lee en el botón (`etiquetaDeChipHoy`). El rótulo sobre el
   riel de «Cómo quedaría» dice el nombre completo cuando el tramo tiene al menos 230 px y el corto («Polos») cuando no cabe. Lo decide una caja propia (`.pp-et-caja`, contenedor de consulta) y **no** el tramo: las medidas de una percha usan
   `cqi`, y un tramo que fuera contenedor las haría medir contra sí mismo (se vio: las perchas quedaron diminutas).
7. **Al pasar por un tramo de «Hoy»,** el `title` dice la mezcla («Polos, tops y blusas · Negro 42 · Blanco 30 · Beige 24 · Rojo 18 · otros colores 36»): el dato exacto está a un gesto, sin cargar el dibujo.

**Qué se descartó.** Colores y tipos de prenda a la vez (silueta por categoría): más rico y más cargado a 15 px; Felipe no lo pidió. Franjas dentro de cada percha: a 15–34 px se leen como ruido. Pintar «Cómo quedaría» con colores nuevos
elegidos por la propuesta: sería inventar una compra.

**Cómo se verificó y qué NO.** `tsc` y `vitest` (415 archivos, 157,218 pruebas) en verde; 27 pruebas nuevas de colores y las de `armarRieles`/`armarPropuesta`. En el navegador, con los componentes reales y datos inventados que imitan la
captura de TRU: sin cuadrar y cuadrado, sin datos de color (cae al color del grupo), en claro y oscuro, a 375 px (sin desborde horizontal) y a escritorio, y el resaltado al pasar por una ficha. **No se vio la ruta real contra su base** (sigue
sin tener las tablas del Plan del piso en local), **no se corrió `tema:auditar`** (necesita sesión) y **no lo probó una colaboradora**. Un color real con muchas variantes de un mismo tono (negro y gris oscuro) se ven casi iguales a 19 px:
es el límite del tamaño, no un error. **Para producción:** nada que pegar; solo publicar la web.
