# ADR-0655 — Campañas y ofertas sale de Insignias: fila propia y tres preguntas por campaña

**Fecha:** 2026-11-13 · **Estado:** aceptado por Felipe (maqueta `docs/maquetas/campanas-y-ofertas-2026-11/`, «lo hacemos en una fila propia»
y la lista de actividades aprobada el mismo día). **Modifica ADR-0481** (las campañas como primera vista de Insignias). Esta es la actividad 1
de 9: solo la web, sin migración.

## Contexto

Desde el 2026-10-22 (ADR-0481) las campañas eran la primera pestaña de Catálogo ▸ Insignias. Entonces una campaña era nombre, fechas,
prendas y un porcentaje, y se parecía a una insignia. Desde ADR-0496 una campaña tiene **ofertas**, y lo que viene (3x2, descuento por
monto) las hace todavía más distintas. Felipe, el 2026-11-13: «con el término "insignias" no sabía que se podían aplicar promociones o
descuentos desde ese módulo», y la pantalla era «confusa, poco intuitiva»: cada campaña tenía cuatro botones (Editar, Prendas, Configurar,
Desactivar) y no se sabía cuál tocaba primero.

El orden que eligió Felipe mirando la maqueta:

| Palabra | Responde | Cambia el precio | Dónde vive |
|---|---|---|---|
| Insignia | ¿Qué es esta prenda? (Nuevo, Hecho a mano) | Nunca (desde la actividad 5) | Catálogo ▸ Insignias |
| Campaña | ¿Qué fecha celebramos? (Black Friday, Navidad) | Solo con sus ofertas | Catálogo ▸ Campañas y ofertas |
| Oferta | ¿Qué paga de menos el cliente? (−20 %, 3x2, S/ 30 desde S/ 300) | Sí | Dentro de cada campaña |

## Decisión

1. **Fila propia «Campañas y ofertas»** en Catálogo, antes de Insignias, con el calendario con corazón del módulo `campanas`. La abre el
   módulo Campañas o el de Insignias (`modulosAlternos: ["etiquetas"]`): los mismos dos que abrían las campañas dentro de Insignias, así que
   **nadie gana ni pierde acceso**. Insignias queda con Rotación, Artesanal y General y solo la abre su módulo. Ruta `/productos/campanas`.
   `/productos/insignias?vista=campanas`, y quien entra a Insignias solo con Campañas, van a `/productos/campanas`.
2. **Una sola pieza, dos modos.** `SellosPantalla` recibe `modo="campanas" | "insignias"`: la billetera de pases es la misma (ADR-0481), con
   su título, su frase y sus vistas.
3. **Tres preguntas por campaña** (`preguntasDeCampana`, `lib/sellos-pases.ts`, con su prueba): **Qué le das**, **En qué prendas** y
   **Cuándo y dónde**. Reemplazan a «Lo que ya tiene» en el pase abierto. Cada una dice si está respondida, la que sigue lleva el hilo de la
   guía de foco (ADR-0284, sin rojo), y tocarla abre la hoja que ya la responde: las ofertas (ADR-0496), las prendas o las fechas. Una oferta
   en borrador no cuenta como respondida: todavía no baja nada. «Cuándo y dónde» siempre está respondida (sin fechas rige siempre, sin
   tiendas en todas).
4. **Un botón y «Más».** El pase de una campaña lleva «Preparar la campaña» (abre lo primero que falta; con todo listo, «Ver sus ofertas»)
   y `<MenuAcciones texto="Más">` con cambiar nombre, ícono o fechas (o «Repetir el próximo año»), marcar prendas sueltas, imprimir sus
   etiquetas de precio, ver su diseño en la web y desactivar. Las insignias conservan sus botones de siempre.
5. **El mapa.** El «?» de la cabecera de las dos filas abre «¿Insignia, campaña u oferta?» (`MapaCampanas`): las tres palabras con su
   pregunta, ejemplos y dónde viven, y una lista de «¿qué quieres hacer?». Marca «Estás aquí».

## Lo que NO hace (las actividades que siguen)

La hoja nueva de la campaña en tres pasos (2), prenda por prenda dentro de una oferta (3), «una prenda, una oferta por tienda y por día»
(4), campañas sin fecha de fin y el paso de «Para liquidar» y «Sorteo» a campañas (5), el 3x2 y el monto en la caja y la web (6–8). Hasta la
actividad 5, Insignias todavía puede tener una insignia con descuento.

## Actividad 2 (2026-11-13): la hoja de la oferta en el orden de la maqueta

`OfertasHoja` («Tres preguntas», ADR-0496) pasa de *Qué le das → Cuándo y dónde → Prendas (con el repaso al pie)* a **Qué le das → En qué
prendas → Cuándo y dónde → Revisa y activa**: qué prendas preguntar depende de la oferta (con el 3x2 será «¿con qué prendas se arma el
grupo?»), y el repaso —la frase, los avisos, el nombre y los botones de guardar o activar— es un paso propio. La guía de foco (`faltan`) y
la guía interactiva siguen ese orden. No cambia qué se guarda ni cómo cobra la caja. El ticket de varias prendas de la maqueta («Así cobra
la caja») llega con el 3x2 (actividad 6): para una rebaja, la etiqueta viva ya muestra el cobro de prendas reales.

## Actividad 3 (2026-11-13): prenda por prenda dentro de una oferta

Felipe: «Me pide por categoría, pero si quiero seleccionar las prendas, ¿cómo hago?». En «¿En qué prendas?» la hoja suma un segmento
**Por categoría | Prenda por prenda**: un buscador (sin tildes) y la lista de modelos del catálogo a la venta, cada uno con todas sus tallas y
colores (Felipe mide por modelo). Lo que entra por una categoría marcada lo dice («Entra por Polos») y no se marca dos veces.

En la base (`20261113210000_oferta_prenda_por_prenda.sql`, **sin pegar en producción**): la tabla `campana_regla_productos`; `fn_campanas_en_sede`
suma, por reemplazo anclado, que una oferta con categorías «solo» **o** modelos elegidos alcanza a esas categorías y esos modelos (sin ninguno
de los dos, a su campaña, como siempre); `campana_reglas()` devuelve `productos_solo`; y `guardar_oferta` envuelve a `guardar_campana_regla` y
deja los modelos en la misma transacción (el historial, que solo se agrega, suma una fila con los modelos de antes). La web llama a
`guardar_oferta` solo si la oferta trae o traía modelos: sin ellos sigue usando la función de siempre, así que publicar la web antes que la
migración no rompe nada salvo elegir prendas sueltas. Al elegir el primer modelo sin haber tocado las categorías, la hoja fija las categorías
que se veían: la oferta deja de ser «toda la campaña» y lo dice («rige solo en lo que marques»), porque la base no suma «toda la campaña» con
modelos sueltos. Prueba: `pnpm pruebas:campana-reglas` (83 de 83, con escenarios «Prenda por prenda»).

## Actividad 4 (2026-11-13): una prenda, una oferta por tienda y por día

Felipe: «No deberían sumarse dos ofertas de la misma prenda», «debe salir una alerta para el usuario que intente aplicar doble oferta a un
producto [y] no le permita»; y el 3x2 de polos en Trujillo con un −20 % de polos en Arequipa sí conviven (otra tienda). Hasta aquí la caja
cobraba la de mayor % y la hoja solo avisaba «se cruza; gana el mejor precio».

En la base (`20261113223000_una_oferta_por_prenda_tienda_y_dia.sql`, **sin pegar en producción**):
- **El candado es un disparador diferido** (`campana_reglas_sin_choques`, `deferrable initially deferred`) sobre `campana_reglas`: al cerrar la
  transacción, toda oferta que queda **activa** no puede compartir prenda, tienda y día con otra oferta activa (de cualquier campaña) ni con el
  descuento de siempre de una campaña o insignia, salvo una cesión. Diferido porque `guardar_oferta` agrega los modelos después de guardar la
  oferta. Vale para guardar activando, para «Activar» y para cualquier camino. Un borrador no se mira (no rige).
- **«Que la otra ceda»** es `campana_regla_cesiones (cede, gana)`: donde las dos rigen, vale la que gana; `fn_campanas_en_sede` calla a la que
  cede solo ahí (reemplazo anclado), y en lo demás sigue igual. No copia fechas ni prendas: se evalúa en la caja con lo que cada una tiene ese día.
  `ceder_ofertas` reemplaza el conjunto, deja historia y vuelve a exigir el candado (quitar una cesión no puede dejar un choque); `guardar_oferta_y_ceder`
  hace las dos cosas en una transacción (lo que llama la hoja).
- **`fn_choques_de_oferta`** dice, tienda por tienda, con qué chocaría una oferta —guardada o todavía en la hoja— y en cuántas prendas. Usa
  `fn_oferta_alcanza_variante`, la misma regla de alcance de la caja (la prueba exige que coincidan).
- Producción al 2026-11-13: 0 ofertas activas, 0 campañas con descuento de siempre, 4 insignias con descuento (la actividad 5 las pasa a
  campañas). Nada existente queda bloqueado.

En la web, «¿Cuándo y dónde?» y «Revisa y activa» muestran cada choque («Choca con «Polos 3x2» (de Fiestas Patrias) en Lima y Trujillo · 6
prendas…») con su salida: «Que «X» ceda» si es una oferta, o «retíralo» si es un descuento de siempre. Hasta resolverlo se puede guardar como
borrador, pero «Activar» (y «Guardar cambios» de una que ya rige) lleva al choque en vez de guardar. Reemplaza los avisos de «se cruza» y
«gana el mayor». Prueba: `pnpm pruebas:campana-reglas` (107 de 107, con «Una oferta por prenda, tienda y día»).

`20261113223000` está **en producción desde el 2026-11-13**. Ahí la búsqueda de choques tardó 2,9 s: preguntaba prenda por prenda (3.920 prendas ×
las otras ofertas). `20261113230000_choques_de_oferta_de_una_vez.sql` la cambia por cruces de conjuntos (`fn_variantes_de_oferta`, la misma
regla; la prueba exige que coincidan): la misma consulta así tardó 64 ms en producción.

**La tienda web también tiene que enterarse.** `tienda_catalogo_version()` (20261113202000, de main) le dice a la tienda cuándo rearmar el
catálogo con un hash de cada tabla chica que leen sus lecturas. No conocía `campana_regla_productos` ni `campana_regla_cesiones`: cambiar
solo los modelos de una oferta, o que una ceda, cambiaba el precio en la caja y no en la web. `20261113232000_huella_tienda_con_ofertas.sql`
las suma (y `fn_regla_alcanza_variante` y `fn_oferta_alcanza_variante` a su lista de funciones). Lo vigila la «cobertura» de
`pruebas:tienda-catalogo-version`, que ahora lee las listas de la última migración de la huella; sin el arreglo, falla en esas dos tablas.

**No vigila** lo que cambia el alcance desde fuera de la oferta (marcar una prenda a mano en otra campaña, sumarle una categoría a una campaña,
ponerle descuento a una insignia): el candado mira las ofertas al guardarlas o activarlas, que es «al configurar». Si hiciera falta, ese es el
lugar del próximo paso.

## Actividad 5 (2026-11-13): una insignia nunca baja el precio

La regla de la maqueta: «¿cambia lo que paga el cliente? → Campañas y ofertas. ¿Solo dice algo de la prenda? → Insignias». En producción
cuatro insignias tenían descuento de siempre: «Para liquidar» (−15 %, 1.251 prendas, una tienda, hasta el 31 dic), «Top ventas» (−20 %,
3, hasta el 31 dic), «Prendas de 10%» (−10 %, 37 tallas, una tienda, hasta el 12 dic) y «Sorteo» (−100 %, 1, sin fechas). Felipe decidió
(2026-11-13) que **las cuatro pasan a campañas** y que «Para liquidar» **conserva su fin del 31 dic** (sin fecha de fin habría seguido con
−15 % desde el 1 de enero): el cliente paga exactamente lo mismo.

- **Base** (`20261113234000_insignias_sin_descuento.sql`, sin pegar): toda etiqueta con descuento que no era campaña pasa a `estilo =
  'campana'` con todo igual (%, fechas, prendas, categorías, tiendas), y el candado `etiquetas_descuento_solo_campana` rechaza un descuento en
  una insignia por cualquier camino. Se queda como descuento de siempre de la campaña, no como oferta: una oferta necesita fecha de fin y
  «Sorteo» no tiene; la caja lo cobra igual.
- **Campañas sin fecha de fin:** la base y «Cambiar nombre, ícono o fechas» ya las aceptaban (las fechas son opcionales); «Sorteo» es la primera.
- **Pantalla:** la hoja «Configurar» de una insignia queda con «Cuándo rige» y «Categorías», sin descuento ni «Dónde rige», y lo dice
  («Una insignia no cambia el precio»); su pase ya no muestra «— descuento»; la guía de Insignias y el error de la base lo dicen igual.
- **«Anunciar en la portada»** (Felipe 2026-11-13): la portada de la tienda online anuncia la campaña que termina primero y dejaba fuera a
  estas cuatro por ser insignias; como campañas entrarían («Prendas de 10%» apenas se pegue, «Sorteo» −100 % desde enero si queda sola). Cada
  campaña lleva ahora `anunciar_en_portada` (`fn_campana_portada` lo pregunta): las cuatro nacen apagadas y las demás encendidas, así la portada
  queda como hoy. Se cambia con un interruptor en «Cambiar nombre, ícono o fechas» (`fijar_anuncio_campana`), y el pase dice «No sale en la
  portada». La pantalla lo lee en una lectura aparte: sin la columna, todas se anuncian, como antes.
- **De paso:** las tres con fechas cuentan como campañas donde se listan campañas con fechas (Finanzas y el plan de compra) y en Tienda web ▸
  Campañas. Las pruebas de base que usaban una insignia con descuento (12 archivos) pasan a una campaña, o a una campaña sin anunciar.

Prueba: `pnpm pruebas:insignias-sin-descuento` (12 de 12); con el candado puesto en la base local, las 33 pruebas que tocan descuentos en verde.

## Actividad 6 (2026-11-13): «Llevar varias y pagar menos», en cuatro partes

Felipe aprobó partirla en cuatro, cada una con su PR: (1) la base, (2) la hoja, (3) la caja, (4) los apartados. Y decidió las reglas de dinero:

- **Varios grupos:** se ordenan de la más cara a la más barata y se arman de a N; en cada grupo, lo de la forma (en el 3x2, la más barata
  gratis; si cuestan lo mismo, cualquiera). Ejemplo: seis polos, tres de S/ 50 y tres de S/ 30 → gratis uno de 50 y uno de 30.
- **El ahorro de un grupo se reparte entre sus prendas en proporción a su precio**, en céntimos exactos: cada prenda queda con lo que pagó, y
  así va a SUNAT, a un cambio y a una devolución (decisión 7 de la maqueta).
- **Un 3x2 se puede apartar**, y queda «así como está ese día» aunque la oferta termine antes de recoger (parte 4).
- **Un descuento manual en una prenda del grupo se suma** a su parte del grupo: la prenda sigue contando (parte 3).

### Parte 1: la base (`20261114003000_ofertas_de_grupo.sql`)

- `campana_reglas` suma tres formas: `nxm` («lleva N, paga M»), `n_por_monto` («N por S/ X») y `nesima_pct` («la N.ª al X %»), con
  `lleva`, `paga`, `monto` y `agrupa` (con cualquier prenda que alcanza la oferta, o solo del mismo modelo). El candado `campana_reglas_forma`
  exige lo de cada una (un `CHECK` deja pasar lo que da NULL: va con `coalesce(…, false)`).
- `fn_ofertas_de_grupo(hoy, sede, líneas, tolerancia)` es **la** regla: arma los grupos de un ticket y reparte el ahorro. Toma la oferta de
  grupo de cada prenda con las mismas condiciones que la caja usa para el % (fechas, días, tiendas, alcance, cesiones). Va en céntimos
  enteros: `sum()` de enteros es `numeric` en Postgres, y con `/` la base del reparto salía con decimales y sobraba un céntimo (tres de S/ 50
  en 3x2 daban 16.67 × 3 = 50.01); se usa `div`/`mod`.
- `guardar_oferta_completa` guarda cualquier forma encima de `guardar_oferta_y_ceder`, en la misma transacción, con la forma de antes en la
  historia. `campana_reglas()` devuelve la forma.
- Nadie cobra todavía una oferta de grupo: `fn_campanas_en_sede`, `registrar_venta`, la tienda web y los apartados leen solo `tipo = 'pct'`
  (revisado en producción). La misma regla en TypeScript entra con la caja (parte 3): Knip no deja entrar una pieza que solo usa su prueba.

Prueba: `pnpm pruebas:ofertas-de-grupo` (25 de 25), con 300 tickets al azar que comparan el ahorro con «la más barata de cada grupo»
contada de otra forma; con el error de la división puesto a propósito, fallan 80 de los 300.

### Parte 2: la hoja (sin migración)

- «¿Qué le das al cliente?» habilita **«Llevar varias y pagar menos»** con las tres formas de la maqueta («3 x 2», «2 por S/ 59.90», «2.ª al
  50 %») y sus números dichos como una frase («Lleva [3] y paga [2]»); la etiqueta de la derecha dice la forma en grande («3 x 2»).
- «¿En qué prendas?» pregunta **«¿Se pueden mezclar?»** (cualquiera de estas · solo del mismo modelo) y muestra **«Así funciona en la caja»**:
  un grupo de prendas de verdad, cobrado con la misma regla de la caja (`lib/ofertas-de-grupo.ts`, la versión TypeScript de
  `fn_ofertas_de_grupo`, probada con los mismos ejemplos y con 2 000 tickets al azar).
- La frase, el nombre automático, la lista de ofertas y el «antes: …» dicen la forma. La validación de la forma es la misma de la base
  (`problemasDeForma`) y lo que falta lleva al paso 1.
- **Una oferta de grupo se guarda como borrador y no se activa** (`CAJA_COBRA_GRUPOS = false`) hasta que la caja la cobre (parte 3): sin
  «Activar» en la hoja ni en la lista, y un aviso que lo dice. La ruta la guarda por `guardar_oferta_completa`.

## Alternativas descartadas

- **Dentro de Insignias, renombrado «Insignias y ofertas».** No mueve nada, pero sigue mezclando dos preguntas en una pantalla y el nombre
  sigue sin decir «descuentos». Felipe lo comparó en la maqueta y eligió la fila propia.
- **Otra pantalla para las campañas.** Duplicaría la billetera; con un modo, la pieza decidida (ADR-0481) sigue siendo una.
- **Dar a Campañas solo su módulo (sin `etiquetas`).** Quien hoy ve las campañas por tener Insignias las habría perdido.

## Cómo se verifica

- `vitest`: `lib/sellos-pases.test.ts` (las tres preguntas), `lib/menu.test.ts` (la fila y su foto, `menu-hoy.golden.json`, cambiada a
  propósito), `lib/modulos.test.ts` (Campañas solo → Campañas y ofertas; Insignias solo → las dos filas), `lib/guias.test.ts` (guía
  `productos.campanas` nueva; `productos.sellos` sin los pasos de las campañas) y `lib/guia-de-foco.test.ts`.
- En el navegador, con datos inventados: escritorio 1440, oscuro y 375 px; `/milimetro auditar`: 0 textos bajo 4.5:1, foco visible en los
  8 controles, 0 blancos bajo 24 px (y bajo 44 con el dedo). La guía no se recorrió con `guias:recorrer`: necesita sesión y base local.

## Se rompe si

- Un enlace guardado apunta a `/productos/insignias` esperando las campañas: llega a Rotación. El de `?vista=campanas` sí redirige.
- Alguien agrega una séptima fila a Catálogo: el tope de hijas es 6 (`menu.test.ts`).
