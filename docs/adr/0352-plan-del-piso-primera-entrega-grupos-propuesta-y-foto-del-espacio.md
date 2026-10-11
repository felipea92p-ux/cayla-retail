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
