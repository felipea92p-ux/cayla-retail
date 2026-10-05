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

