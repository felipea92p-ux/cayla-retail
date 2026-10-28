# ADR-0312 — Familias de color en espectro y una sola escala (2026-10-02)

> Numerado 0312 y no 0310 a propósito: el 0310 ya lo reclaman DOS ramas (`cambio-emisora-b002-b004-76656e`, «Serie 04 de
> AQP», y `sales-rounding-cash-36d9cd`, «Redondeo del efectivo») y, si una se renumera, caerá en el 0311.

> **Estado (2026-10-02):** la migración está en producción, pegada por Felipe y verificada en vivo; la web va en el PR de la rama `claude/color-scales-families-c7513c`.

**Problema.** La carta de colores tenía 9 familias que mezclaban tres criterios sin prioridad —matiz (azul, rojo…), rol
(neutro, tierra) y acabado (metálico)— y su orden no seguía nada (Azul antes que Rojo). Medido sobre los 75 colores de
producción (OKLCH, 2026-10-02):

- El naranja vivía dentro de Amarillo (Naranja 43°, Durazno 51°, Mandarina 66° de matiz) y el rosado dentro de Rojo. Quien
  busca «Naranja» no encuentra la fila y crea un color: «Azul medio» y «Azul Intermedio» (hechos a mano, con 12 y 3
  variantes) son nombres de un **escalón** de la escala, no de un color.
- Entre 25° y 103° de matiz no hay un hueco de más de 10°, y ahí convivían cinco familias; la frontera Neutro/Tierra partía
  una pareja que el propio ERP marcó como confundible (Beige–Arena, ΔE2000 6,0).
- Azul, Verde y Morado abarcan 46–69° de matiz; ordenadas solo por claridad, sus vecinos saltaban ~25° de matiz.
- El **orden de claro a oscuro, en cambio, casi no fallaba** (8 pares de ~320 invertidos): el problema eran las familias.
- Dos pantallas ordenaban distinto: Nuevo producto por brillo de RGB (subestima los azules) y Atributos → Colores por
  `colores.orden`, un número escrito a mano que un color recién creado (siempre 2000) dejaba fuera de lugar.
- La lista de familias vivía en 3 sitios (`colores-familias.ts`, una copia en `app/api/productos/colores/route.ts` y el
  candado de la base).

**Decisión (Felipe, opción B).**

1. **11 familias en orden de espectro**: Neutro, Tierra, Rosado, Rojo, Naranja, Amarillo, Verde, Azul, Morado, Metálico,
   Estampado. Se suman **Rosado** (Rosado, Palo rosa, Fucsia) y **Naranja** (Durazno, Salmón, Mandarina, Naranja); **Arena**
   pasa a Neutro para que Beige y Arena queden juntos y la frontera caiga en el salto Arena→Camel (ΔE2000 9,3).
2. **Prioridad de pertenencia escrita** (`lib/colores-familias.ts`): acabado > rol > matiz. Si un color cumple dos, manda el
   de menor número.
3. **Un solo orden, calculado del color** (`lib/color-escala.ts`): dentro de una familia, gamas de menor a mayor matiz y,
   dentro de cada gama, de más claro a más oscuro (claridad OKLab). Verde, Azul y Morado se parten en dos gamas (cortes a
   135°, 240° y 325°, en huecos naturales del círculo): el salto de matiz entre vecinos baja de ~25° a 10–16°. Lo usan la
   carta de Nuevo producto, Agregar colores y Atributos → Colores. `colores.orden` **ya no decide nada** en la web.
4. **Sale el campo «Orden»** del modal Editar color: con el orden calculado era un control que no hacía nada.
5. **La API valida con `esFamiliaDeColor`** (una sola lista en código); el candado de la base es su par.
6. **Apariencia de la carta.** Se midió primero: el círculo ya pintaba el `#hex` exacto (diferencia media 0,9 sobre 255 contra
   una captura convertida a sRGB; lo «apagado» de la captura era su perfil Wide Gamut sin convertir), así que no había un bug
   de color. Lo que se mejora: círculos de 32 px, borde del propio tono, respiro entre gamas, metal con reflejo de metal
   cepillado, ✓ legible sobre cualquier color (claridad OKLab) y un pie que dice el **Pantone TCX** (la referencia real de la
   tela) y con qué otro color se confunde.
7. **Migración** `20261002180000_colores_familias_rosado_naranja.sql`: cambia el candado, mueve los 8 colores, corrige
   «Amarrillo mantequilla» → «Amarillo mantequilla» (solo el nombre) y renumera `colores.orden` con el orden de la carta
   (una centena por familia, de 5 en 5) para que las listas planas que aún lo leen (Vender, Conteo) no contradigan a la carta.

**Descartado.**

- *Dejar las 9 familias y solo reordenar*: el naranja seguiría dentro de Amarillo. 
- *Cuadrícula tono × familia con columnas alineadas por claridad*: muestra los huecos del catálogo, pero es una pantalla nueva
  que a 375 px no cabe; el problema era de familias, no de la rejilla.
- *Guardar `gama` o `tono` como columnas*: salen del hex; guardarlas es un dato que se desactualiza al editar el hex.
- *Fusionar o retirar los 4 colores creados a mano* (Azul medio, Perla, Azul Intermedio, Amarrillo mantequilla): ya tienen 23
  variantes con stock (12, 7, 3, 1); fusionarlos toca SKUs. Quedan donde están.
- *Quitar `colores.orden` de las consultas de Vender y Conteo*: toca Vender (celular obligatorio) para un cambio de 0 efecto
  visible; se renumera en la base y listo.

**Se rompe si.**

- Alguien crea un color con matiz de frontera (36°–45°, un naranja quemado) y dos personas lo clasifican distinto, uno en
  Tierra y otro en Naranja: la regla de rol (apagado → Tierra, vivo → Naranja) está escrita arriba de `FAMILIAS_COLOR`.
- La web se fusiona **antes** de pegar la migración: la API acepta «rosado»/«naranja» y el candado viejo de la base rechaza
  crear un color en esas familias. Pegar la migración primero.
- Alguien cambia un corte de gama o la fórmula de claridad: `lib/color-escala.test.ts` fija los 75 colores y dice cuál se movió.

**Verificación.** 192 pruebas de colores en verde y la suite completa de la web (307 archivos, 154.745 pruebas); la disposición
esperada de la prueba viene de un prototipo independiente, no del mismo código, y una mutación (mover un corte) la hace
fallar. Migración ensayada en un Postgres 17 desechable con los 79 colores de producción: `UPDATE 8 / 1 / 79`, conteos
13/8/3/5/4/5/9/11/9/8, segunda corrida sin cambios (misma huella md5), el orden de la base == el de la prueba, y un candado
sin «naranja» hace fallar y revertir la transacción. Pantallas a 1280 y 375 px sin desborde.

**Cómo deshacerlo.** Web: `git revert` de los 4 commits (no toca datos). Base: volver el candado a las 9 familias exige antes
devolver los 8 colores a su familia anterior (Arena → tierra; Rosado, Palo rosa, Fucsia → rojo; Durazno, Mandarina, Naranja →
amarillo; Salmón → rojo); el `orden` viejo no hace falta restaurarlo (la web no lo usa).

**Pendiente (de Felipe).** Tres ajustes que se pueden revertir color por color: Coral queda en Rojo, Mora en Morado (por su
nombre, aunque su matiz sea de rosado) y Salmón en Naranja. Y los 4 colores creados a mano: Perla es casi igual a Crudo
(ΔE 2,1) y «Amarillo mantequilla» a Vainilla y a Amarillo limón (7,8 y 7,2).

---

## Actualización 2026-10-02 (b) — «Gris melange» se pinta jaspeado: `colores.tipo` llega a la muestra

**Problema.** `colores.tipo` vale `solido | textura | estampado` desde la migración `20260915230000`, pero la web nunca lo leyó:
`fondoDeMuestra(hex, familia)` solo distinguía «metálico». «Gris melange» (GRM, `textura`, #A2A2A1) se pintaba como un gris liso
casi igual a «Gris» (GRI, #848587), y la carta no podía decir «esto es una tela jaspeada» antes de que alguien leyera el nombre.

**Decidí.** `tipo` viaja de la base a la muestra y `fondoDeMuestra(hex, familia, tipo)` pinta una `textura` con un jaspeado sobre su
hex.
- *Viaje del dato:* `ColorAlta.tipo` (opcional: ausente = liso, que es el default de la base), la consulta de `alta-producto-datos.ts`,
  `colorDeRespuesta`, las dos consultas de `api/productos/colores`, la de Editar producto y la de Atributos → Colores.
- *Quién lo pinta:* `Punto`, la carta y su pie, la franja de la matriz de cantidades, las fotos por color, Atributos → Colores y los
  combos de Editar producto. Una sola función para todas: la misma muestra se ve igual en todas las pantallas.
- *Cómo se dibuja* (`MOTAS`/`JASPEADO` en `lib/colores-familias.ts`): ocho capas de puntos de luz (`--color-crema`) y sombra
  (`--color-tinta`) con `color-mix` sobre el hex, con baldosas de lado primo (5…29 px) para que no se lea como rejilla. Solo tokens: el
  único color suelto en el CSS es el hex de la base, y una prueba lo exige.
- *Prioridad:* metálico > textura > liso (la de ADR-0312: acabado antes que rol antes que matiz). `estampado` se queda liso: un dibujo
  no se deduce de un hex (esa foto es `imagen_muestra_url`, que nadie lee todavía).
- *El liso sigue EXACTO* (`color-escala.test.ts`): con `tipo` sólido, estampado, nulo, ausente o desconocido devuelve el hex tal cual.

**Descarté.**
- *Un velo de ruido SVG (`feTurbulence`) como `data:` URI:* es ruido de verdad, pero no puede usar `var(--color-…)` dentro de un
  `data:`; habría que escribir los colores a mano, que es lo que la paleta prohíbe.
- *Pocas capas de puntos chicos y densos (3 a 6 capas de 3–13 px, las primeras cinco pruebas):* cada capa es una rejilla regular y
  juntas se leen como malla o moiré, y a 100×32 px parecía un tejido, no una fibra. Con ocho capas ralas y de baja opacidad se lee
  como grano al azar. Se juzgó en el navegador a 1:1, en la tarjeta real entre sus vecinos lisos.
- *Un campo nuevo o un hex distinto para GRM:* no se cambia ningún hex ni familia; el jaspeado es presentación.
- *Pintarlo también en Vender y en el filtro de Productos:* el punto de color del filtro y el modal de «prenda sin registrar» dibujan
  el hex a mano (no pasan por `fondoDeMuestra`); tocarlos es otra decisión y Vender exige celular. Ver «Pendiente».

**Se rompe si.**
- Aparece un `textura` muy oscuro o muy claro: el equilibrio luz/sombra es el de un tono medio. Medido (CSS real renderizado a un
  canvas de 300×300): sobre #A2A2A1 el color promedio se mueve +1 de 255 (el liso ya se aceptó con 0,9), sobre #848587 +3, sobre un
  azul marino #1F2A44 +9 y sobre un perla #EAE6DD −3. Si hace falta, se ajusta la mezcla por `claridadDeHex`.
- Alguien deja un `textura` con `familia_color = 'metalico'` esperando ver las dos cosas: manda el reflejo, sin jaspeado.
- Una pantalla nueva dibuja un color con su propio `style={{ background: hex }}` en vez de `fondoDeMuestra`: ese color vuelve a verse
  liso. Hoy hay dos (ver «Pendiente»).

**Verificación.** `color-escala.test.ts` (liso exacto con cualquier `tipo`; la textura lleva `radial-gradient` y termina en su hex;
sin colores sueltos; el metálico gana; sin hex, sin fondo) y `color-alta-reglas.test.ts` (`colorDeRespuesta` trae el tipo). Suite
completa de la web: 308 archivos, 154.813 pruebas; `tsc` sin errores. En el navegador, con la base local y sesión real:
Atributos → Colores muestra exactamente 1 muestra jaspeada (GRM), 64 lisas y los 8 metálicos con su reflejo intacto; Nuevo producto
pinta GRM jaspeado en el círculo de la carta, en su pie (punto de 20 px), en el chip elegido y en la fila y franja de la matriz, con
«Gris» liso al lado; Editar producto recibe `tipo: "textura"` para GRM y `"solido"` para GRI. Escritorio (1024 px) y 375 px sin
desborde horizontal.

**Cómo deshacerlo.** `git revert` del commit (no toca datos ni migraciones). El `tipo` que viaja por las consultas es inofensivo si
se deja.

**Pendiente (de Felipe).** (1) El punto de color del filtro de Productos (`FiltrosProductos.tsx`) y el del modal de «prenda sin
registrar» dibujan el hex plano: GRM sale liso ahí. Pasarlos por `fondoDeMuestra` es trivial; el segundo toca Vender (celular
obligatorio, PL-105). (2) Esta actualización va apilada sobre el PR #736 (`claude/color-scales-families-c7513c`: la prueba
`color-escala.test.ts` y la reescritura de `colores-familias.ts` viven allí): **se fusiona después de #736**. Su migración
`20261002180000` ya está pegada en producción; la mía no trae SQL.

## Actualización 2026-10-02 (c): el filtro de Productos usa la misma escala y sus casillas dicen lo que hace la base

**Problema.** Dejé la carta y Atributos en la escala nueva, pero el filtro de Color de Productos seguía pidiendo los colores
`order("nombre")` (`productos/page.tsx`) y los listaba **alfabéticos** («Arena, Beige, Blanco, Crudo, Gris…»): tres pantallas, dos
órdenes. Además la lista decía una cosa y la base hacía otra: el filtro **suma** (`color_codigo = any(colores) OR familia_color =
any(familias)`, `fn_productos_listar`), así que marcar «Toda la familia Neutro» ya traía Beige aunque su casilla se viera vacía; el
número de la familia (66) era menor que la suma de sus tonos (una prenda con varios colores cuenta en cada uno) sin que nada lo
dijera; y las muestras eran de 10 px, casi iguales entre Arena y Beige.

**Decisión.**

1. **Un solo orden.** `opcionesDeColor` ordena los tonos de cada familia con `enEscala` (gama y claridad, `lib/color-escala.ts`), llegue
   la lista como llegue.
2. **Casillas como un árbol** (`estadoDeColor` y `alternarColor`, puras y probadas): familia marcada ⇒ sus tonos se ven *incluidos*;
   algunos tonos ⇒ la familia queda *parcial* (−); tocar un tono de una familia marcada abre la familia en sus otros tonos; marcar el
   último tono que faltaba recompone «toda la familia». La URL no cambia de forma (`color=` y `familia=`).
3. **Jerarquía visible:** encabezado de familia en negrita con un filo arriba, tonos sangrados, muestras de 14 px con el borde de su
   propio tono (`bordeDeMuestra`) y jaspeado para las texturas (`tipo` llega a la muestra: cierra el pendiente (1) de la actualización b).
4. **Un rótulo sobre la lista** dice qué cuenta el número: «Prendas · una con varios colores cuenta en cada uno» (prop opcional
   `rotuloCantidad` del desplegable; solo Color lo usa).
5. **Una sola agrupación por familia** (`agruparPorFamilia`, `lib/colores-familias.ts`) para Nuevo producto, Atributos y el filtro. Una
   familia que el código aún no conoce sale con **su propio nombre** («Turquesa»), no «Sin familia»/«Otros»: el 2-oct Atributos mostró
   «SIN FAMILIA 7» —eran Rosado y Naranja— porque una pestaña abierta antes del despliegue conservaba el JavaScript anterior mientras
   recibía los datos nuevos (la base ya tenía las 11 familias; el despliegue de #736 había salido a las 22:42Z). «Sin familia» queda solo
   para el color que de verdad no la tiene.

**Descartado.** *Esconder la jerarquía y listar solo tonos:* se pierde «todos los azules», que es el pedido real de mostrador.
*Que tocar un tono de una familia marcada no haga nada:* un control muerto. *Expandir la familia solo en los tonos con prendas hoy:* el
conteo depende de los otros filtros; la familia «menos Beige» tiene que seguir siendo todos los demás tonos aunque hoy den 0.
*Cambiar la base:* no hace falta; la semántica de la base ya era la correcta, lo que estaba mal era lo que la pantalla decía de ella.

**Se rompe si.** Alguien agrega un tono a una familia mientras otra persona tiene la lista abierta con la familia marcada: el tono nuevo
queda incluido (la base lo trae) y su casilla aparece «incluida» al refrescar los conteos. Y las familias sin colores no aparecen, así
que una familia que nunca tuvo prendas no se puede marcar entera (no hay nada que traer).

**Verificación.** Pruebas puras en `lib/productos-filtros.test.ts` (37 casos: orden, familia desconocida, estados, alternar, invariante
«tocar dos veces vuelve a lo mismo que pide la base») y `lib/colores-familias.test.ts`; dos mutaciones (el «último tono recompone» y el
orden alfabético) las hacen fallar. El componente real `FiltrosProductos` recorrido en Chrome sin ventana con los 75 colores a 1280 y a
375 px (dentro de la hoja): sin desborde, sin errores de página, y la URL queda `familia=neutro` → `color=…` → `familia=neutro`.
Suite completa de la web: 312 archivos, 154.946 pruebas.

**Cómo deshacerlo.** `git revert` del commit; no toca datos ni migraciones.

## Actualización 2026-10-02 (d): los cortes de gama cambian

Los cortes de gama del punto 3 (135°, 240° y 325°) pasaron a **138°, 236° y 327°** al sumar 16 colores (ADR-0316): quedaban colores a
menos de 5° del corte. No reasigna a ningún color existente.

## Actualización 2026-10-02 (ADR-0317)

- El descarte «fusionar o retirar los 4 colores creados a mano: quedan donde están» **ya no vale para uno**: Azul Intermedio se funde en Azul
  medio (Felipe: «no debería existir dos nombres que aparenten lo mismo»). Perla y Amarillo mantequilla siguen donde estaban (ADR-0314).
- Neutro y Tierra se reparten distinto: Beige, Arena y **Topo** son tierra; **Nude** se queda en neutro (ADR-0314, ajustado por el 0317).
- «Arena pasa a Neutro» de este ADR lo había reemplazado ya el 0314; con el 0317 Arena queda en Tierra.

## Actualización 2026-10-10: «Estampado» deja de ser una familia

Felipe (2026-10-10): «estampado no existe, ya no existe». Un estampado no tiene un tono: es un dibujo, y los dibujos viven en Patrones
(ADR-0106). Las familias pasan de 11 a **10** (`neutro, tierra, rosado, rojo, naranja, amarillo, verde, azul, morado, metalico`) y el
criterio 1 de la prioridad queda solo con «acabado: metálico».

- **Web:** `FAMILIAS_COLOR` (`lib/colores-familias.ts`) sin `estampado`; `color-alta-reglas.ts` ya no lo excluye de la sugerencia por tono.
  `colores.tipo = 'estampado'` es OTRA cosa (cómo se dibuja la muestra) y no cambia.
- **Base:** `20261010160000_colores_sin_familia_estampado.sql` reemplaza el candado `colores_familia_color_check` por las 10 y archiva las
  3 filas que la usaban —EST Estampado, MUL Multicolor, ANI Animal print—: `activo = false` y `familia_color = null` (la columna admite
  nulo). **No se borran** (regla del repo). Medido en producción el 2026-10-10: 0 variantes, 0 prendas por regularizar, 0 fotos, 0
  temporadas y el hex de relleno `#c9b79c`; nadie las usó. La migración corta si aparece una variante con ellas antes de pegarla.
- **Descarté** dejarlas activas sin familia (saldrían en la carta como un círculo beige bajo «Sin familia») y reasignarlas a Neutro
  (Multicolor no es neutro). Un Líder las reactiva desde Atributos ▸ Colores y les elige una familia real.
- **Se rompe si** la migración se pega antes que la web: la web vieja aún ofrece «Estampado» y el candado nuevo rechaza el guardado.
  **Orden: primero la web, después la migración.** Entre una y otra, la web degrada con gracia (verificado en local: las 3 filas salen en
  una píldora «Estampado», sin errores).
- **Deshacer:** las cuatro líneas están al final del encabezado de la migración.
