# ADR-0331 · Existencias: la cara que dice la verdad

- **Fecha:** 2026-10-04 · **Estado:** construido en la rama `claude/kind-lederberg-a5bb65` (8 commits, uno por actividad). **Solo web,
  sin migración.** Verificado en local, en Chrome sin ventana, a 1440 × 900, 1366 × 768 y 375 × 812.
- **Pedido:** Felipe, 2026-10-04, sobre una captura de Existencias en TRU: «céntrate en el diseño y UI/UX y hazlo impecable,
  cámbialo, es horrible al día de hoy». Después invocó `/pantalla`, `/construir` y `/rigor`.
- **Análisis:** `docs/pantallas/inventario.md` (2026-10-04, 4,5/10, Núcleo, 12 tareas). Felipe aprobó la lista de 8 actividades y
  decidió la tarea #10 (la edad del piso entra a Existencias **después** de cuadrar el piso).
- **Decisiones de negocio en las que se apoya:** ADR-0328 (las cuatro tandas de preguntas del 2026-10-03 y 2026-10-04, escritas por
  la sesión del rediseño por olas): portada = buscador + «Para hoy» + catálogo; número grande = colgadas; diseñar para el encargado
  de sede, la asesora y la cuenta Almacén; mínimo de 1 colgada por talla y color. Este ADR no las repite: dice cómo se construyó la
  cara de Existencias con ellas.
- **Complementa:** ADR-0220 (cabecera de Ventas en Inventario), ADR-0169 (paleta; `MAX_ROJO_POR_PANTALLA`), ADR-0326 («Hoy»),
  ADR-0306 (bajar, subir y ajustar son funciones de Existencias), ADR-0231 (regla de piso, que esta decisión reemplaza en su número),
  ADR-0284 (guía de foco).

## El problema

Medido en producción el 2026-10-04 a las 13:56 (solo lectura): TRU tiene 155 prendas colgadas, 653 guardadas, 538 tallas, **391
«por colgar»** y **ninguna talla con 5 o más en el piso**, más **78 ventas sin registrar** (14 vencidas). La pantalla decía:

- «Resumen disponible: 795 uds», cuando la caja solo cobra lo colgado;
- «Reponer a piso hoy» en una tarjeta rosada, sin cifra, con tres prendas en orden casi alfabético;
- «Incidencias 0», con 78 ventas que el stock todavía cuenta;
- «reponer» en las 538 tallas (la regla «4 o menos en el piso» no tenía con qué distinguir);
- un rojo en cada tarjeta (más de 30 en la pantalla contra un tope de 2 que nada hacía cumplir);
- cinco botones arriba y cuatro en cada tarjeta (quince negros por página).

`/rigor` agregó el dato que cambia la lectura: con el mínimo de 1 por talla y color, TRU necesita **539 lugares de 600** (546
combinaciones talla-color con stock, 539 en talla central, 7 extremas), y Felipe contó 600–750 prendas colgadas. Las 391 «por
colgar» son casi todas prendas ya colgadas que entraron al sistema como guardadas, no trabajo pendiente.

## Decisiones (técnicas y de diseño; las de negocio están en ADR-0328)

**1. El umbral de reponer pasa de 4 a 0** (`lib/politica-operativa-inventario.ts`).
DECIDÍ: «reponer» solo cuando no queda ninguna colgada; es el mínimo de 1 por talla y color de Felipe. Existencias, el filtro «Hoy» y
el Inicio de la cuenta Almacén leen la misma política y cambian juntos.
DESCARTÉ: esperar al motor del mix para cambiarlo, porque mientras tanto la pantalla seguía diciendo «reponer» en el 100 % de las
tallas; y la excepción de tallas extremas ya, porque en TRU cambia 7 de 546.
SE ROMPE SI: un color se vende tan rápido que su única colgada se va antes de que alguien mire: no reaparece hasta el día siguiente.
«Para hoy» pone «por colgar» primero para que se vea temprano.

**2. «Para hoy» reemplaza las cuatro tarjetas** (`lib/existencias-para-hoy.ts` con su prueba; `components/existencias/ParaHoy.tsx`).
DECIDÍ: cada pendiente de la sede es una frase con su cifra y un botón, en el orden en que conviene hacerlo (colgar → ventas sin
registrar → dañadas → apartados vencidos → traslados → lo que se pide afuera); lo que está en 0 no aparece; se ven tres. «Por colgar»
cuenta con `hoyDeTalla`, la misma regla del filtro (27 = 27, verificado). La cola de Recibir (`prendas_por_regularizar`) entra por
primera vez: si no responde, la fila dice «No se pudo leer las ventas sin registrar» (lente de resiliencia de `/rigor`: la falla
se dice, no se calla ni se vuelve un 0). Como mucho dos filas en rojo, las de plazos vencidos (`MAX_ROJO_POR_PANTALLA`, que hasta hoy
no importaba ningún archivo).
DESCARTÉ: conservar las tarjetas escondiendo las que dicen 0, porque seguían sin decir cuánto trabajo hay ni en qué orden, y la de
reponer contaba la unión de tres casos que ningún filtro reproduce (se borra `TarjetaReponerAPiso.tsx`).
SE ROMPE SI: TRU acumula 30 ventas sin registrar en un día de campaña y 80 tallas por colgar: la cola sale segunda, en rojo. Si
Felipe la quiere primera, es una línea del orden en `tareasParaHoy`.

**3. La frase de «por colgar» dice la verdad sobre su número.** «162 guardadas y ninguna colgada: empieza por … ¿Ya cuelgan?
Regístralas al bajar.» Hasta que exista la fecha de cuadre por sede (ADR-0328 decisiones 4 y 5, de la otra sesión), esa segunda
frase es lo único que evita mandar a colgar lo que ya cuelga.

**4. La cabecera usa `ResumenSede` y un solo botón oscuro** (`app/(app)/inventario/page.tsx`).
DECIDÍ: a la derecha «Colgadas en el piso» y «Guardadas en el almacén» (libres), «En camino» solo cuando hay; en el Taller, «Disponibles
aquí» con su cambio de 7 días (esa lectura ahora solo se pide allí). Un botón oscuro, «Bajar al piso»; Recibir, Contar, Trasladar y
Apartados, claros. Los botones de «Para hoy» también son claros: con el primero oscuro había dos «Bajar al piso» negros juntos.
DESCARTÉ: una cifra propia con un riel dibujado (un sexto estilo de cabecera cuando Ventas ya tiene uno) y «+ Nuevo traslado» como
oscuro (se usa pocas veces al mes).
SE ROMPE SI: la sede no separa piso y almacén (Taller): no hay «Bajar al piso» y no queda ningún botón oscuro; es lo correcto, porque
allí no se cuelga.

**5. El rojo vuelve a ser señal; cada talla tiene un solo estado.**
DECIDÍ: `TONO_HOY` sin rojo (por colgar y por reponer en ámbar, sin stock atrás en pizarra); la caja «Piso», la fila abierta, el
detalle del cajón y la talla sin nada dejan el rojo (la talla vacía es un borde punteado); `estadoTalla` sale de `hoyDeTalla` y una
prueba recorre cada combinación de piso y almacén (umbral 0 y 4) exigiendo que la celda diga lo mismo que la pastilla y el filtro.
Medido: 0 elementos rojos visibles en el contenido en reposo.
DESCARTÉ: contar los rojos en tiempo de ejecución para apagarlos, porque la causa era el tono de un estado normal, no la cantidad.
SE ROMPE SI: alguien vuelve a pintar «por colgar» en rojo en otra pieza (la prueba de `TONO_HOY` lo detiene) o agrega un rojo nuevo en
una tarjeta (eso no lo detiene nada: es la tarea de un lint de rojo, anotada en el backlog).

**6. La tarjeta de prenda cuelga sus tallas de un riel** (`components/ExistenciasTarjetas.tsx`).
DECIDÍ: cada talla es una etiqueta colgada de una barra fina, como en el perchero: en grande las colgadas, debajo «+N» las guardadas;
tono por estado (papel, ámbar por colgar, punteado sin nada). Un solo botón claro, «Reponer», solo si algún color tiene algo que bajar;
Subir al almacén, Ajustar stock y Ver detalle en el menú «⋯» (`MenuAcciones`). La pastilla y el botón van al lado del riel cuando la
tarjeta tiene ancho (`@container`): 234 px de alto en una pantalla de 1440 (antes ~290 con la primera versión del riel).
DESCARTÉ: la tabla «Por prenda» como entrada (ya existe en «Ver detalle» y no se lee en el celular) y conservar cuatro botones.
SE ROMPE SI: una prenda tiene más tallas que ancho (calzado, o 6 tallas a 375 px): el riel se desliza de lado dentro de la tarjeta, con el
borde derecho desvanecido para que se note que hay más (corrección de la revisión).

**7. Filtros cerrados de fábrica en Existencias** (`lib/panel-filtros.ts`: `leerPanelFiltros(valor, deFabrica)`).
DECIDÍ: Existencias nace con el panel cerrado (Productos sigue abierto, decisión de Felipe del 2026-10-02); lo que cada equipo guardó
manda. La estructura de la barra (ADR-0326) no cambia.
SE ROMPE SI: un equipo que trabaja con filtros todo el día abre Existencias por primera vez: un toque en «Filtros» y queda abierto.

**8. Celular.** «Para hoy» entra plegado bajo `sm` («27 tallas por colgar · 1 más», 112 px; abierto ocupaba 428); la fila de accesos de
la cabecera se desvanece a la derecha para avisar que se desliza; el texto de ayuda del buscador cabe entero a 375 px (157 de 195 px).

## Verificación
- `vitest`: 155.343 pruebas en verde; nuevas: `existencias-para-hoy.test.ts` (11), la propiedad «una sola clasificación» y el tono
  de «Hoy» sin rojo; `tsc` y `eslint` en verde en cada commit.
- En el navegador (local, base semilla): «Hoy ▸ Por reponer» = 0 productos tras el umbral 0; «Para hoy» 27 = filtro 27; cabecera con
  un solo oscuro; menú «⋯» con sus tres acciones y «Reponer» abre su ventana; a 1366 × 768 la primera prenda asoma sin bajar; a 375 px
  sin desplazamiento horizontal.

## Revisión adversarial (2026-10-04)
Tres revisores (lógica, persona sin contexto y reglas de la casa, celular y accesibilidad) y un escéptico por lente: 23 hallazgos, 13
confirmados (10 distintos), ninguno de dinero ni stock. Corregidos en un commit aparte: «sin stock atrás» ya no cuenta lo que viene en
camino ni dice «queda poco en el piso», y usa la palabra del filtro; un traslado recibido con diferencia ya no sale «en camino»;
«Regularizar» lleva la sede y la lista la respeta para el líder; «Decidir» solo a quien puede decidir (los demás, «Ver cuáles»); el tono de
«sin stock atrás» es el mismo en la tarjeta, la tabla «Por prenda» y el cajón; la línea plegada del celular toma el tono más grave y dice
«N con plazo vencido»; el riel y la fila de accesos se desvanecen solo sobre su aire; el foco vuelve a la tarjeta al cerrar «Ajustar»
desde el «⋯»; la cifra de una talla sin nada pasa de 2,3:1 a 5,6:1 de contraste; la leyenda de la tabla muestra solo los casos que existen.

## Integración con ADR-0330 (2026-10-04, antes de fusionar)
Mientras este PR esperaba, `main` recibió el #791 (ADR-0330): las ventas sin registrar se mudaron de Recibir a Existencias
(`/inventario/por-regularizar`) con un botón propio en la cabecera y su propio contador (`contarPorRegularizar`). Juntos quedaban
dos contadores y dos puertas para lo mismo, y «Regularizar» apuntaba a la ruta vieja (la redirección perdía la sede).
DECIDÍ: un solo contador, `contarPorRegularizar` (`lib/por-regularizar-cuenta.ts`), que ahora devuelve pendientes y vencidas; se borra
`contarPendientesDeSede`. Una sola puerta: la fila de «Para hoy», que lleva a `/inventario/por-regularizar?ubicacion=<sede>`; la página
respeta esa sede para el líder (sin ella, sigue mostrando todas sus tiendas). La fila ya no depende de ver Recibir: la lista vive bajo
el mismo módulo que Existencias.
DESCARTÉ: conservar el botón de la cabecera, porque repetía la fila de «Para hoy» y volvía a dejar seis accesos arriba (decisión 4).
SE ROMPE SI: un líder que mira el Taller (o cualquier sede que no vende) quiere ver las ventas sin registrar de todas sus tiendas desde
Existencias: ya no hay botón; las ve desde el aviso del Inicio o abriendo `/inventario/por-regularizar` sin sede.

## Actualización 2026-10-04 (b): el Inicio de Almacén cuenta lo mismo que «Para hoy»

La decisión 1 decía que el Inicio de la cuenta Almacén «cambia junto» con Existencias, y no era cierto: su aviso y su bloque contaban
MODELOS con alguna talla que pedía reponer. Con el umbral en 0 eso incluía las tallas agotadas en la sede (ni colgada ni guardada), y
el Inicio decía «Sube N modelos al piso» con un número que no era el de «Para hoy» y con prendas que no existían atrás; además «Subir»,
en Existencias, es del piso al almacén.
DECIDÍ: una sola función cuenta «por colgar» (`porColgarDeLaSede`, `lib/existencias-para-hoy.ts`) y la leen «Para hoy» y el Inicio
(`existenciasDeAlmacen`, `lib/inicio-almacen-reglas.ts`). El aviso se llama «Por colgar», cuenta tallas, dice «Baja al piso N tallas por
colgar» y lleva a `/inventario?hoy=por_colgar`; el bloque lateral lista las prendas (modelo + color) con sus tallas y su pie lleva a
«Bajar al piso» con esas tallas cargadas. La clave del aviso sigue siendo `reponer`: es la que guarda la elección de «Ajustar» (cookie).
DESCARTÉ: dejar que el Inicio contara modelos y solo filtrar las agotadas, porque «3 modelos» en el Inicio y «7 tallas» en Existencias
siguen siendo dos números para lo mismo, y quien llega desde el aviso no puede comprobarlo.
SE ROMPE SI: alguien vuelve a contar «por colgar» dentro de un componente. Lo vigila `lib/inicio-almacen-reglas.test.ts` (el mismo stock
da la misma cifra en el aviso, el bloque, «Para hoy» y la lista filtrada, y las dos pantallas llaman a la función compartida).

## Actualización 2026-10-04 (c): con «Hoy», una tarjeta por prenda
El Inicio y «Para hoy» decían «15 tallas por colgar» (Tienda Trujillo, base de semilla) y la lista a la que llevan mostraba 5 tarjetas
cuyas pastillas sumaban 12. No faltaba ningún dato: la lista agrupaba una tarjeta por MODELO y la tarjeta enseña un color a la vez; las
3 tallas de Blusa Valentina Rosado quedaban detrás de un punto de color y la pastilla hablaba solo del Blanco. La opción del filtro,
además, decía «Por colgar · 5» (modelos): tres números (15, 5, 12) para la misma lista. Felipe delegó la decisión («decide tú, con el
máximo de efectividad»).
DECIDÍ: con un caso de «Hoy» elegido, la lista va por PRENDA (modelo + color, la percha): cada tarjeta muestra un solo color y la suma
de sus pastillas es la cifra de «Para hoy». Sin «Hoy», una por modelo, como antes. Una sola función decide qué es una tarjeta
(`claveDeTarjeta`, `lib/existencias-tarjetas.ts`) y la usan la lista y el número de cada opción de la barra (`conteosDeFiltros`):
«Por colgar · 6» trae 6 tarjetas. La línea de arriba, el pie y el botón de la hoja de filtros dicen «6 prendas · 15 tallas por
colgar»; con «Sin stock atrás» la línea aclara «(1 ya viene en camino)», lo que «Para hoy» descuenta. `agruparPorModelo` (ahora
`tarjetasDeExistencias`), `ordenarModelos` y `opcionesOrden` salen del componente a ese archivo, con prueba.
DESCARTÉ: que la pastilla sume todos los colores («6 tallas por colgar»), porque el riel seguiría mostrando 3 etiquetas ámbar y el
descuadre se mudaba dentro de la tarjeta; la tarjeta por modelo con «+3 en Rosado», porque cuadra solo leyendo una segunda línea y el
trabajo del día (qué tallas de Rosado colgar) queda detrás de un toque; corregir solo la línea de arriba, porque lo visible seguía
sumando 12. Lo que se paga: con «Hoy», un modelo de dos colores sale dos veces (misma foto, otro color) y la lista cambia de agrupación
al poner o quitar «Hoy». Es la unidad que ya usaban el bloque del Inicio y la tabla «Por colgar» (ordenada y paginada por percha).
SE ROMPE SI: otro filtro gana su propia cifra en «Para hoy» con un enlace a la lista (hoy solo «Hoy»: las dañadas y los apartados
abren su ventana) sin pasar por `claveDeTarjeta`, o la pastilla deja de contar las tallas de su prenda (el PR #787 agrega «En pausa»).
Lo vigilan `lib/existencias-tarjetas.test.ts` (la escena de la semilla: 6 tarjetas que suman 15; por modelo sumaban 12; todo caso de
«Hoy» con cifra; candado de fuente sobre `InventarioPanel.tsx` y `existencias-filtros.ts`) y `lib/existencias-filtros.test.ts` (cada
número de la barra es lo que trae la lista, en tarjetas). Mutación: agrupar siempre por modelo pone 5 pruebas en rojo.
Verificado en local con Chrome sin ventana, en escritorio y a 375 px: «Para hoy» 15 → «Ver cuáles» → 6 tarjetas, 3+3+3+3+2+1 = 15,
sin desborde ni errores de consola; sin «Hoy», Blusa Valentina vuelve a ser una tarjeta con dos puntos y el punto cambia el color.

## Actualización 2026-10-04 (d): la cuenta única la alimenta el motor del piso (integración con el PR #787)
El PR #787 (ADR-0328 act. 7) cambió QUÉ es «por colgar» —lo decide un motor, `lib/piso-plan.ts`: 1 por color en las tallas del centro
y en lo vendido en 14 días, lo vendido ayer primero, «En pausa» sin piso cuadrado— y, en paralelo con (b), le dio al Inicio su propia
cuenta por percha (`paraColgarHoy`) sobre la lectura del motor. Al juntarlos quedaban dos cuentas otra vez.
DECIDÍ: `porColgarDeLaSede` sigue siendo la ÚNICA cuenta, y el motor la alimenta: cada fila trae la decisión del motor (`planPiso`) y la
función recibe la lista del día (`listaDelDia`, obligatoria) para ordenar las prendas; además devuelve `enPausa` (tallas que esperan el
cuadre), la cifra que «Para hoy» y el Inicio dicen en lugar de «por colgar» con el piso sin cuadrar. El Inicio no vuelve a leer
Existencias entera: pasa la MISMA lectura del motor (`fn_piso_plan_lectura`, 3,2 ms en TRU) a filas (`filasDelPiso`,
`lib/inicio-almacen-reglas.ts`) y cuenta con esa función. El aviso cuenta tallas («Baja al piso N tallas por colgar») y, con el piso sin
cuadrar, dice «Cuadrar el piso» con las tallas que esperan. Se borran `paraColgarHoy` (motor), `prendasParaColgarHoy` (sin uso desde que
se retiró la tarjeta «Reponer a piso hoy») y `resumirPorColgar` (`existencias-hoy.ts`): tres cuentas más de lo mismo.
DESCARTÉ: que el Inicio leyera Existencias entera (`getExistencias`, como en (b)) para tener exactamente las mismas filas: garantiza la
igualdad por construcción, pero vuelve a poner ~0,9 s solo de stock (más la red de sedes y los traslados) en la portada de una cuenta de
almacén para mostrar un número y tres prendas, lo que el #787 había quitado. Y mantener `paraColgarHoy` probada «igual» a la cuenta de
Existencias: dos funciones que una prueba obliga a coincidir son dos lugares donde cambiar la regla, y la siguiente pantalla elige una.
SE ROMPE SI: las filas de Existencias (`getExistencias`, que todavía suma `stock` en TypeScript) y `fn_existencias_base` dejan de aplicar
la misma regla de «libre» (ADR-0270, tarea #4 pendiente): el Inicio y «Para hoy» contarían las mismas tallas con unidades distintas. Lo
vigilan `pnpm pruebas:piso-plan` (S4: la lectura = `fn_existencias_base`, talla por talla) y `lib/inicio-almacen-reglas.test.ts` (una
escena pasada por los tres caminos —«Hoy», «Para hoy» y el Inicio— con el piso cuadrado y sin cuadrar, más candados de fuente;
mutaciones: el Inicio sin la decisión del motor, sin la lista del día, con piso y almacén cruzados, la cuenta sin la pausa, el aviso
contando unidades y el panel sin la lista: todas en rojo).

## Actualización 2026-10-04 (e): el Inicio dibuja la prenda sin foto con la misma lectura del motor (merge con ADR-0333)
ADR-0333 (main) dibuja la prenda sin foto con el ícono de su categoría sobre su color en todo el ERP, y para el Inicio de Almacén le
pasó color y categoría a las tres prendas de «Por colgar»… desde las filas de Existencias. Con (d) esas filas salen de la lectura del
motor (`filasDelPiso`), que no traía ni el hex del color ni el prefijo y la familia de la categoría: el merge compilaba y las tres
prendas habrían salido como una percha sobre un tono neutro.
DECIDÍ: `fn_piso_plan_lectura` trae `color_hex` en cada talla y `prefijo` y `familia` en cada curva (ya traía el nombre de la
categoría), `lecturaDesdeJson` los traduce y `filasDelPiso` los pone en cada fila. El motor no los usa. Cuestan dos columnas de dos
uniones que la lectura ya hacía (`colores`, `categorias`).
DESCARTÉ: una segunda consulta del Inicio por la categoría y el color de sus tres prendas (otra ida a la base y otra lectura que puede
fallar sola, para lo que la primera ya tenía a mano), y volver a leer Existencias entera (lo que (d) descartó).
SE ROMPE SI: una pantalla nueva arma filas desde la lectura del motor sin `filasDelPiso`, o la lectura deja de traer esos campos. Lo
vigilan F5 y F6 de `pnpm pruebas:piso-plan` (las claves de la talla; el hex, el prefijo y la familia, con mutación en rojo) y la
escena de `lib/inicio-almacen-reglas.test.ts` («dibuja la prenda sin foto como el resto del ERP», también en rojo si el Inicio pierde
la categoría).

## Lo que no se hizo aquí
- La fecha de cuadre por sede y la «puerta de confianza» de «Para hoy» (ADR-0328, decisiones 4 y 5): es de la otra sesión; se
  engancha en `tareasParaHoy` cuando exista.
- «de las que caben» junto a las colgadas: espera la capacidad por sede en la base (ADR-0329).
- La edad del piso dentro de Existencias: Felipe la aprobó para **después** del cuadre.
- «Eliminar el producto» sigue en el cajón (D4 del 3-oct, abierta) y el verbo de bajar sigue con tres nombres («Bajar al piso»,
  «Reponer prenda», «Subir prenda»): no entraron en las 8 actividades.

## Actualización 2026-10-04 (noche) — la regla del piso la define el motor (ADR-0328, actividad 7)

Este ADR dejó el umbral de reponer en 0 (mínimo de 1 colgada por talla y color) dentro de `politicaDe`. Con el motor del piso
(`lib/piso-plan.ts`, PR #787) la regla vive en un solo lugar y es la que Felipe decidió en las rondas del 2026-10-04
(ADR-0328 y ADR-0329, «Actualización 2026-10-04»): **1 colgada por color en las tallas centrales y en toda talla que se
vendió en los últimos 14 días** (las extremas que no se venden pueden quedar guardadas); lo vendido decide si una talla se
cuelga, nunca cuántas. Con 1 por color, «Por reponer» y «Por colgar» decían lo mismo: **queda una sola palabra, «Por colgar»**,
y «Hoy» tiene tres casos (Por colgar · Sin stock atrás · Mantener), más «En pausa» mientras la sede no cuadra su piso
(ADR-0328, decisión 5), que «Para hoy» explica con la tarea «Cuadra el piso». La cara (cabecera, «Para hoy», riel de tallas,
TONO_HOY sin rojo) sigue siendo la de este ADR. Lo que aquí dice «por reponer en ámbar» queda como historia.

