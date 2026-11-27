# ADR-0708 — Producción más clara: solo lo que sirve, y cada dato con su rótulo

**Fecha:** 2026-11-26 · **Estado:** aceptado por Felipe (maquetas aprobadas el mismo día, pantalla por pantalla). Solo web: sin migración,
sin cambios de RPC, de permisos ni de datos.

## Contexto

Felipe (2026-11-26) pidió revisar las pantallas de Producción del Taller (Resumen, Órdenes, Insumos y lo que cuelga de ellas): que sean
profesionales, intuitivas y «solo con texto preciso sin tanta explicación innecesaria»; que las entienda «cualquier persona que ingrese por
primera vez, sin saber nada»; con «datos que realmente sirvan al usuario y no datos basura»; y sin el punto medio «·» como separador.

Lo que se encontró leyendo el código (antes de este cambio):

- **Resumen:** seis bloques, tres repetidos (las tarjetas por fase eran las de Órdenes; la tela que falta salía en «Para decidir» y en
  «¿Alcanza la tela?»; el sobrestock, como tarjeta y como insignia), párrafos de explicación a la vista y el mismo botón con tres nombres.
- **Eficiencia:** cuatro tarjetas con tres formas del mismo costo, cinco párrafos a la vista y una tabla con encabezados abreviados.
- **Órdenes:** cuatro mecanismos de filtro y el motivo de una orden en rojo escondido tras «¿Por qué?».
- **Insumos:** cuatro botones en la cabecera, una cifra que solo contaba insumos y el libro de movimientos fijo al costado.
- En todas: datos distintos en una sola línea separados por «·» («stock 4 · 6/sem. · 12 en 30 d»).

## Decisión

Se llevó al código la maqueta `docs/maquetas/produccion-resumen-2026-11/` (su README guarda lo que eligió Felipe). Cuatro reglas salen de aquí
y valen para lo que se toque de Producción en adelante:

1. **Cada dato en pantalla responde «qué hago» o «por qué».** Lo que solo informa se resume en una línea con su enlace o se saca.
2. **Un dato es una pieza:** `<ParDato rotulo="…">valor</ParDato>` dentro de `<Pares>` (`components/ui/ParDato.tsx`): el nombre chico arriba y
   el valor abajo. Nunca «dato · dato · dato».
3. **Rótulos y encabezados con palabras completas** («Se venden por semana», «12 días»).
4. **Lo que explica va detrás del «?»**; los formularios van en pasos numerados (`<TituloGrupo paso={n}>`) y lo opcional, plegado.

Pantalla por pantalla:

| Pantalla | Lo que queda |
|---|---|
| Resumen (`/produccion`) | Tres bloques: «Qué fabricar primero», «Por resolver» (antes «Para decidir») y «Lo demás está en orden» (recuadros que llevan a otra pantalla o despliegan en el lugar «¿Alcanza la tela?», «Los demás modelos» y «para vigilar»). Sin las cuatro cifras de dinero ni las tarjetas por fase |
| Eficiencia | El costo por prenda arriba con su variación en soles, «De qué se forma», «En qué se fue la plata» con barras y «mes a mes» en barras |
| Órdenes | La franja «dónde está cada orden» (filtra al tocarla), una sola píldora «Piden atención» y la columna «Atención» con el motivo a la vista. **El orden de la lista no cambia** (por fecha de entrega) |
| Nueva orden | Tres pasos numerados; el tipo se llama «Para vender» (antes «Lote de producción»); la ficha dice «Cuesta hacerla», «Se vende a» y «Ganancia por prenda» en soles (antes margen en %) |
| Insumos | «Por acabarse» con su botón, pestañas «Telas», «Avíos» y «Movimientos», buscador y una tarjeta por tela con sus colores |
| Hojas de Insumos | Pasos numerados, sin el código a la vista; «Saldo inicial» se llama «Lo que ya tenías» y su primer campo ya no dice «¿Qué llegó?» |

Nombres aprobados por Felipe: «Por resolver», «Hay de sobra» (sobrestock), «Llevar a tienda» (trasladar al piso), «Sin ventas todavía»,
«Nadie la pide», «Para vender», «Lo que ya tenías». Las claves internas (`sobrestock`, `trasladar`, `es_muestra`…) no cambian.

## Lo que se decidió no cambiar

- **El capital de insumos sigue bajo un toque** («Valor de lo guardado», con «Mostrar / Ocultar»): ADR-0400 ya había decidido que no es cifra
  de portada. Sale del Resumen y vive en Insumos.
- **La ganancia por prenda usa el precio más bajo de cualquier tienda**, el mismo que ya pintaba el semáforo del margen (ADR-0370): así el
  color no contradice al número. La fila «El precio más bajo» va justo encima.
- **Las insignias de estado de un insumo** dicen lo de siempre («Se acabó», «Bajo el mínimo», «Alcanza»).
- **«Por acabarse» de Insumos no dice «Se necesitan» ni «Pedido en camino»:** esa pantalla no conoce esos datos (la demanda de las órdenes
  abiertas la calcula el Resumen).
- La línea de sede y fecha de la cabecera (`EncabezadoPagina`) conserva su punto medio: es de todo el ERP y de CAYLA Dynamic.

## Consecuencias

- `components/ui/ParDato.tsx` es pieza nueva y `TituloGrupo` acepta `paso`: las dos están en la carpeta que CAYLA Dynamic mira; allá queda
  como tarea si quieren la misma pieza.
- La página del Resumen ya no pide costos (dos lecturas menos) y se borraron `cifrasResumen`, `textosDeCifras`, las tarjetas por fase
  (`cifrasHoyEnElTaller`, `datoHoyEnElTaller`) y las vistas previas del código de tela y de avío.
- Las guías interactivas de estas pantallas se reescribieron: cambiaron sus controles.

## Sin hacer

Ver `docs/backlog/2026-11-26-produccion-pantallas-revision-9c5ccd.md`.
