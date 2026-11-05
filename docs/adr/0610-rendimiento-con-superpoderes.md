# ADR-0610 — Rendimiento con superpoderes: una mesa donde cada pieza responde a las demás (2026-11-04)

**Estado:** construido y probado en local. La migración `20261104213000` está en producción desde el 2026-11-05 (Felipe lo ordenó); la web va en su PR.
**Maqueta:** `docs/maquetas/rendimiento-superpoderes-2026-11/` (cuarta ronda; Felipe descartó tres: «Listo, me gusta ese estilo»).

## DECIDÍ

Gestión ▸ Rendimiento deja de ser un panel de bloques sueltos y pasa a ser **una mesa con un solo estado** (la tienda, los días, las personas, el orden). Lo que se toca en cualquier pieza cambia todas. Se arma con la tabla ya elegida (`TablaViva`, `docs/maquetas/tabla-superpoderes-2026-10/`) y con las recetas del vidrio (ADR-0596); lo nuevo es lo que cada pieza puede hacer:

| Pieza | Superpoder |
|---|---|
| Tiendas (`SedesConAnillo`) | Cada una dice cuánto lleva contra su propia meta del mes. Nunca un ranking entre tiendas. |
| Buscador | Entiende personas, «por debajo», «del 5 al 12», «día 10», una tienda, «sumado» y «mes pasado», y solo ofrece: la persona elige. |
| Cifras (`CifrasRendimiento`) | Cuentan, y el «?» las voltea para explicar la cuenta con los números de ahora. «Si vendemos por día» recalcula el cierre y mueve la línea del gráfico. |
| Gráfico (`GraficoRendimiento`) | Se arrastra para elegir días. El mismo dibujo se transforma entre Cada día, Por persona y Sumado. Compara con el mes pasado. «Ver cómo fue» repite el mes en toda la pantalla y se detiene solo. |
| Tabla (`TablaRendimiento` sobre `TablaViva`) | Sus ocho superpoderes, y además las filas viajan al ordenarse y dicen lo de ese día al señalarlo en el gráfico. |
| Fila abierta (`FilaAbierta`) | Su calendario, lo que va bien y su meta, con la lectura y el reparto que quedarían ANTES de guardar. Reemplaza al modal de la meta. |
| Deshacer, descargar, teclas, dirección | Vuelve al paso anterior, baja lo que se ve, `/`, `←` `→`, `Esc`, y lo que se mira queda en la URL. |

La lógica pura vive en `lib/rendimiento-vista-reglas.ts`, con su prueba. No se escribió otra versión de lo que ya existía: la lectura sigue siendo `lecturaDeRitmo`, el cierre `proyectarMes`, la validación `validarCambioMeta` y la meta `fijar_meta_persona`.

## POR QUÉ ASÍ

- **Por persona y por día, con las metas reales.** `fn_metas_por_dia` ya reparte la meta de cada día por horas programadas (o en partes iguales, D-158). La función nueva `fn_rendimiento_persona_dias` junta eso con las ventas, así que cualquier tramo de días se mide con metas de verdad. La maqueta las inventaba por tiempo; el ERP no.
- **Todo en el navegador.** El servidor ya leía todas las tiendas de una vez (Felipe, 2026-10-03): cambiar de días no pide nada, no prende el loader y no mueve la vista. Son como máximo unas 650 filas por tienda (7 personas × 92 días).
- **La tabla recibe sus filtros desde afuera** (`useTablaViva({ control })`): las cifras y el gráfico también los tocan, y una sola fuente evita que la frase diga una cosa y las filas otra.
- **Sin biblioteca de gráficos.** Las barras son `<rect>` con transiciones de CSS: el navegador las mueve, sin un cuadro de JavaScript por barra.

## Decisiones de Felipe (2026-11-04)

1. **«Adelante / En ritmo / Por debajo» salen en cualquier período**, no solo en Hoy. Amplía D-159 y las palabras no cambian. Lo que tocaba solo cuenta lo que ya pasó: de hoy, lo corrido del turno. Sin turno o antes de empezar, no se dice nada. **La medida cambió el mismo día; ver «Actualización» abajo.**
2. **La meta se cambia dentro de la fila**, y se fue `EditarMetaModal`. Todo lo que hacía sigue: motivo, responsable, `p_meta_esperada`, volver a la automática.
3. **La pantalla abre en «Este mes»**, como la maqueta aprobada (antes abría en Hoy). `?vista=hoy` sigue funcionando.
4. **El tablero de vidrio decía que aquí «solo cambia el material» porque el plan era de Dany.** Felipe aprobó el cambio mirando la maqueta; queda escrito aquí para que Dany lo sepa.

## Lo que se ajustó al implementar

- **La lente no deforma las cifras.** La primera versión refractaba todo el tramo y las barras se veían torcidas: bonito, pero falso. Ahora solo dobla el canto de 10 px, como el borde de una gota, y el centro se lee exacto.
- **Una tienda sin horarios** tiene metas solo en los días que marcaron asistencia (D-158): su «Este mes» se mide contra los días marcados, y la nota de abajo lo dice.
- **«Mejor día» y «Su mes» se van a la línea de abajo** bajo 1060 px de tabla, como toda `TablaViva`. Por eso `/rendimiento` salió del tope de 64 rem (`CON_TOPE_DE_ANCHO`).
- **«Vende más los lunes» pide al menos dos lunes.** Con uno solo, el mes recién empezado afirmaba una costumbre que nadie había visto todavía (`suDiaFuerte`).
- **Las frases siguen a la tienda.** Sin horarios, la meta se explica como partes iguales, no como horas programadas.
- **Sin lectura por persona, el equipo no se toca.** Elegir a alguien mostraría ceros falsos, así que sus botones se apagan y queda lo de la tienda.
- **Colores por persona:** `--color-persona-0` a `-5`, color de dato validado para daltonismo, siempre con nombre o iniciales. En oscuro, las iniciales van en tinta fija para pasar 4.5:1.

## QUÉ SE ROMPERÍA SIN ESTO

- Sin la función nueva, elegir días obligaría a inventar el reparto de la meta. Si la función no existe o falla, la pantalla dice que no pudo leer lo de cada persona y sigue con lo de la tienda y los rankings (principio 9). **Por eso la migración se pega antes de publicar la web.**
- Sin `medirGrupo` sobre la serie de la tienda, las ventas sin quien atendió se perderían y la cifra no cuadraría con Caja.

## Actualización 2026-11-04 (tras `/formidable`, con el OK de Felipe)

**Fuera de Hoy, «En ritmo» es 10 % arriba o abajo de lo que tocaba, no 10 puntos del mes entero.** Medido contra el mes, el día 4 casi nadie podía salir «Por debajo»: la pantalla decía «Todo el equipo va en ritmo» con la tienda S/ 2,148 abajo de S/ 7,104. Ahora la palabra dice lo mismo el día 4 que el día 25. Lo calcula `lecturaDelTramo` (`lib/rendimiento-vista-reglas.ts`).

- **El mínimo son 3 días del período que ya terminaron, los mismos para todo el equipo.** Con menos, sigue `lecturaDeRitmo`, que es más holgada: una sola venta no decide. Hoy no cambia (D-159).
- **DESCARTÉ contar días con ventas**, que fue la primera propuesta: quien no vendió nada nunca llegaría al mínimo y nunca saldría «Por debajo».
- **DESCARTÉ contar los días de meta de cada persona:** quien descansó seguía con holgura un día más, y la segunda prueba ciega vio a alguien en 6 % «En ritmo» junto a alguien en 12 % «Por debajo».
- **Lo que cuesta:** quien trabajó pocos días tiene una banda chica, de menos de un ticket; ahí una venta sí puede cambiar la palabra.

**La frase de arriba lleva a la persona:** cada nombre abre su fila, la deja a la vista y le pasa el foco. **El reparto se dice en palabras de tienda** (`repartoEnPalabras`): cuánto suman las metas contra la de la tienda. Sumar de más no es un error, la base lo permite; lo que se marca en ámbar es lo que falta repartir, antes era al revés.

## Lo que no se hizo

- Selector de mes, y horas por persona (la lectura por hora sigue siendo de la tienda, a propósito: es para repartir turnos, no para juzgar).
- Un «Deshacer» para el cambio de meta: guardar deja rastro en un historial que no se borra, y deshacer sería otro cambio con su propio motivo.
- Las piezas nuevas (gráfico con selección, cifra que se voltea, buscador que entiende) no se volvieron piezas del sistema: viven en `components/rendimiento/`. Si otra pantalla las quiere, lo decide Felipe con `/unificar`.

## Cómo se verifica

```
pnpm --filter web exec vitest run lib/rendimiento-vista-reglas.test.ts
pnpm pruebas:rendimiento-persona-dias
pnpm --filter web guias:recorrer -- --guia rendimiento --base-url http://localhost:<puerto>
```

Datos inventados para mirarla: `scripts/demo/rendimiento-local.mjs`. Solo corre con el contenedor dicho a mano (`CAYLA_CONTENEDOR_DB`), porque la base local de siempre la comparten otras sesiones y está atrasada frente a `main`; esta construcción se probó en una pila aparte con todas las migraciones.

## Actualización 2026-11-05 — la tabla: flechas en vez de texto, el globo en vidrio y más escalones (Felipe)

**Por qué:** el globo de «Cómo va» se veía corrido y con una barra de desplazamiento: «Por debajo primero / Adelante primero» medía 314 px dentro de un globo de 270, y además no tenía el vidrio de las hojas. Felipe pidió flechas para ahorrar texto y una tabla «super responsive». Se cambió en `TablaViva`, así que también llega a Movimientos ▸ Ingresos.

- **Ordenar son dos flechas, sin texto:** ↑ menor a mayor, ↓ mayor a menor, en una línea (`FlechasDeOrden`). Lo que significa en cada columna sigue en `title` y para el lector de pantalla.
- **Una columna que solo ordena no abre globo:** tocarla cambia su flecha (`ordenAlTocar`). Empieza por la cifra o la fecha mayor, o por el nombre de la A a la Z. El globo queda para las columnas con «Mostrar solo», que llevan embudo.
- **El globo es vidrio y mide lo que pide su contenido:** receta nueva `--globo-tabla-*` en `recetas.css`. Sin velo que desenfoque detrás, el desenfoque lo pone él. Ya no puede correrse de lado.
- **Cuatro escalones en vez de dos:** `seVa` admite 1060, 960, 840 y 740, y las columnas se van de una en una: Su mes, Mejor día, Ticket y Meta. Las pistas reparten lo que sobra, para que en una pantalla muy ancha no se lo lleve todo la barra.
- **Bajo el nombre, cada dato baja entero** a la línea siguiente, sin un «·» huérfano. En el celular, «Ordenar» es una lista de columnas con sus flechas y los filtros bajan de línea en vez de esconderse a la derecha.
- **De paso, en toda hoja del celular:** el asa pegada se bajaba 24 px y su franja tapaba el título (`top: 0` se cuenta desde dentro del relleno). Ahora es `top: -1.5rem`.

**Verificado en local:** de 280 a 1700 px de tabla, con letra normal y grande, sin desbordes ni nombres cortados; a 375 y 1024 px de ventana; el globo en claro y en oscuro. **Sin ver en el navegador:** Movimientos ▸ Ingresos con filas, porque la base local no tiene ingresos.

## Actualización 2026-11-05 (b) — lo mismo en las demás tablas del ERP (Felipe: «rastrea dónde se usan tablas parecidas»)

Se midieron las 113 pantallas sin dirección dinámica en seis anchos, con datos, y se buscaron por código las 160 plantillas de columnas.

**La causa de fondo era una sola:** casi toda tabla activa sus columnas con `sm:grid-cols-[…]`, que mira la ventana. Con el menú abierto, a 1024 px la tabla mide 690; la plantilla de Historial de compras pedía 864, corría de lado y su columna `1fr` quedaba sin ancho: no se veía el proveedor.

- **La tabla mira su ancho (`lib/tabla-corte-reglas.ts`, `app/estilos/tabla-corte.css`):** de la plantilla sale cuánto ancho necesita y, bajo eso, la tabla usa la forma de celular que ya tenía. Una consulta de contenedor lo aplica sin tocar cada tabla: `fila()` y `<Encabezado>` suman solos la clase. Se hizo así porque 80 archivos usan `<Tabla>`.
- **DESCARTÉ pasar todas a `TablaViva`:** muchas paginan en la base y sus filas no están todas en el navegador, y es la condición de esa pieza (ADR-0596).
- **DESCARTÉ arreglar tabla por tabla con `@container`:** 18 o más archivos, y una tabla nueva volvería a nacer con el error.
- **Tablas ajustadas a mano:** Historial de compras (columnas más justas, para que siga en tabla a 1280 px), Plan del piso (sin ancho mínimo), Calendario y Historial de campañas, y las tablas por colaboradora y por producto de Comercial, que nunca tuvieron forma angosta y ahora son tarjetas con cada cifra titulada.
- **Mismas flechas en `<Encabezado>`:** ↕ si se puede ordenar, ↓ o ↑ si ya está ordenada; `aria-sort` pasó del botón a la cabecera, que es donde vale. En Ventas sin registrar, «Recientes/Antiguas» pasó a «Fecha» con su flecha.
- **El vidrio llegó a lo que faltaba:** el globo de `CapaDeFiltro` (`.globo-filtro`) y el calendario de `CampoFecha` (la lista de los combos). El desenfoque del globo va en un `::before` y su animación no se queda aplicada: si no, el calendario de adentro se recorta o pierde su desenfoque.
- **El calendario dentro de un globo se salía por abajo:** `usePosicionLista` tomaba el globo de Radix como su límite. Ahora manda la ventana, y se abre hacia arriba si abajo no cabe.
- **Una píldora de filtro nunca es más ancha que su fila** (`.pildora-filtro`): «Ordenar por: La de ahora y las que vienen» empujaba la tarjeta de lado en el celular.

**Lo que cuesta:** a 1024 px con el menú abierto, Historial de compras y Plan del piso se ven como tarjetas altas, no como tabla. Con el menú cerrado o desde 1280 px vuelven las columnas.

**Quedan corriendo de lado, a propósito:** la matriz de dañadas por tienda y mes, la planilla de Configuración y las tablas de Finanzas ▸ Reportes (su kit, ADR-0195, y su rediseño pendiente). Tampoco se tocaron los desbordes de página que no vienen de una tabla: quedan en el backlog.

**Verificado en local:** las pantallas en ocho anchos de 375 a 1920 px, sin ninguna tabla colapsada y sin que ningún globo o lista corra de lado; capturas de las tablas y del globo y el calendario, estos en claro y en oscuro. **Lo que el recorrido no ve:** pantallas con dirección dinámica (`[id]`), tablas sin filas en esta base y las que viven dentro de un modal. Reciben la misma regla, pero no se miraron una por una.
