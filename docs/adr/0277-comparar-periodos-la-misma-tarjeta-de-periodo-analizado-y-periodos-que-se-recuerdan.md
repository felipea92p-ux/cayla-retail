# ADR-0277 · Comparar períodos: la misma tarjeta «PERÍODO ANALIZADO» que Desempeño, y los períodos A y B que se recuerdan

- **Fecha:** 2026-09-29 · **Estado:** aceptado. Solo web, **sin migración** (ninguna RPC ni tabla cambió).
- **Pedido:** Felipe, 2026-09-29, sobre la parte de arriba de Inventario ▸ Análisis ▸ Comparar períodos: usar
  «literalmente» la sección PERÍODO ANALIZADO de Desempeño —no «una segunda versión parecida»—, con dos controles
  (Período A y Período B) en lugar de los atajos, la búsqueda debajo, sin Categoría, con los avisos solo cuando hagan
  falta, y con lo último que elija la persona conservado entre pestañas, módulos y recargas.
- **Complementa:** ADR-0138 (Desempeño y Comparar; B = el período analizado), ADR-0245 (Análisis conectado), ADR-0209
  (los combos) y ADR-0149 (el buscador por URL que no abre el loader). **No cambia** ninguna fórmula: ventas, rotación
  valorizada, sell-through, capital, rankings y gráficos salen del mismo `armarComparacion` de siempre.

## Qué había

Desempeño dibujaba su franja de mando dentro de una tarjeta (`card-cayla`): la etiqueta «PERÍODO ANALIZADO», los atajos
de período, la Categoría y el buscador. Comparar dibujaba otra cosa: dos píldoras sueltas de otro estilo (fondo
`tinta/4 %`, borde `tinta/30`, otro radio), la Categoría, y **ningún buscador** — el comentario del Detalle decía que la
búsqueda «subió a la franja de controles compartida», pero esa rama nunca la dibujó: `?q=` funcionaba en el servidor y
no había dónde escribirlo. Además:

- Un A escrito en el futuro se sustituía **en silencio** por «el período justo antes de B», y el único aviso decía «anterior
  al historial de esta sede», que culpaba a los datos y no a lo escrito. B, en cambio, sí explicaba casos iguales.
- B era el mismo `preset`/`desde`/`hasta` de Desempeño: elegir «7 días» allá le cambiaba B a Comparar y elegir B aquí le
  cambiaba el período a Desempeño. Con eso no se puede prometer «lo último que elegí se mantiene».
- Salir de Análisis y volver por el menú (URL nueva, sin fechas) devolvía los períodos de por defecto.
- Un `cat` en la URL (de Desempeño, que sí tiene el filtro) seguía filtrando Comparar sin ningún control que lo mostrara.

## Decisión

1. **Una sola tarjeta para las dos pestañas.** `MarcoPeriodoAnalizado` y `BloquePeriodo` (en `ResumenControles.tsx`) dibujan
   el contenedor, la etiqueta, las medidas y el buscador; Desempeño y Comparar solo difieren en la fila de arriba.
   El buscador es el mismo `BuscadorDebounced` con el mismo `alcance.q` (no hay una segunda lógica de búsqueda).
2. **Comparar: dos píldoras.** `pildora-cayla` (la de los atajos) con el calendario de «Personalizado» y las dos fechas:
   «Período A: 1 ago. → 30 ago.». Abren el MISMO `PopoverRango` de «Personalizado» (sin cambios: Desde/Hasta escritos a mano,
   Cancelar, Aplicar). Sin atajos y sin botones extra.
3. **Sin Categoría en Comparar.** El servidor la ignora (`leerVistaComparacion` fuerza `categoriaId: null`), la pantalla
   no la dibuja, `ComparacionParaPantalla.categorias` desaparece y «Limpiar filtros» ya no toca `cat` (la categoría es de
   Desempeño y ahí sigue). Un estado imposible menos: un filtro aplicado sin control que lo muestre.
4. **Avisos dentro de la tarjeta y solo si hay.** Salen de un solo lugar, `armarComparacion`, en este orden: A escrito que no
   se pudo respetar (`avisoDelPeriodoA`, nuevo, con las mismas palabras que B), B escrito que no se pudo respetar con su
   letra (`avisoDelPeriodoB`), períodos de distinta duración o superpuestos, y A sin historial. Sin nada que decir no hay
   fila ni hueco.
5. **B con URL propia** (`bdesde`/`bhasta`, `paramsDeComparar`) que le gana a `preset`/`desde`/`hasta`. Mientras B no se elige
   en Comparar sigue siendo el período que se venía analizando (el traspaso de ADR-0138 y los enlaces viejos siguen sirviendo).
   A ya tenía los suyos (`comparar=personalizado`, `cdesde`, `chasta`). Por defecto: B = últimos 30 días y A = los 30
   inmediatamente anteriores, calculados con el «hoy» de Lima (nunca fechas escritas).
6. **Persistencia:** elegir A o B escribe LOS DOS en la URL y los guarda en el navegador (`lib/resumen-periodos-guardados.ts`,
   sobre `almacen-local`, una llave por sede y por persona). Al entrar a Comparar con una URL sin fechas de Comparar se
   siembra la URL con lo guardado: en el propio clic de la pestaña (`ResumenCabecera`, una sola navegación) y al montar el
   panel (enlace directo). Si la URL ya trae fechas, manda ella. Se guarda lo que la pantalla realmente mostrará (las
   mismas reglas del servidor: ordena, recorta a hoy, acorta a un año) y una elección inválida no pisa la última buena.

DECIDÍ: recordar A y B en `localStorage` (por sede y persona) y **sembrar la URL** con ellos al entrar a Comparar; la URL sigue
siendo la única fuente de verdad de lo que se ve.
DESCARTÉ: (a) una cookie que el servidor mezcle en silencio, como `cayla_lateral` — la caché del router
(`staleTimes: { dynamic: 30 }`, `next.config.ts`) reutiliza 30 s una pantalla ya visitada **por URL**, y una URL «vacía» con
fechas escondidas en una cookie serviría los períodos anteriores justo cuando la persona espera los últimos que eligió;
(b) guardarlo en la base (`colaboradores`) — es una preferencia de pantalla de este aparato, no un dato del negocio (lo mismo
que decidió `lateral-cookie.ts`), y una escritura por cada cambio de fecha no lo justifica.
SE ROMPE SI: la persona cambia de navegador o borra los datos del sitio (vuelve a los períodos de por defecto: la memoria es
del aparato, no de su cuenta), o si alguien agrega otra entrada a Comparar que arme la URL a mano sin pasar por la pestaña ni
por el montaje del panel y espere lo recordado.

DECIDÍ: que B de Comparar tenga URL propia (`bdesde`/`bhasta`).
DESCARTÉ: dejarlo compartido con Desempeño — elegir «7 días» allá movía B aquí, y elegir B aquí le cambiaba el período a
Desempeño, así que ninguna de las dos pestañas podía prometer «lo último que elegí se mantiene».
SE ROMPE SI: alguien lee `preset`/`desde`/`hasta` dentro de Comparar saltándose `paramsDeComparar`.

## Lo que NO cambió

`PopoverRango` (el selector de fechas: su código es idéntico, solo se anotó en su comentario que el foco en «Desde» hoy no
ocurre), `BuscadorDebounced`, `useResumenUrl`, `resolverPeriodo`/`resolverRangoPersonalizado`, la RPC
`fn_resumen_comparacion_json` (recibe las mismas cuatro fechas), todas las fórmulas y la tarjeta de Desempeño: su HTML es
**idéntico byte a byte** al de antes (SHA-256 del `outerHTML` de la tarjeta, salvo el contador de `useId` de React).

## Se rompe si

Alguien vuelve a dibujar la fila de período de una pestaña con clases sueltas en vez de pasar por `MarcoPeriodoAnalizado` /
`BloquePeriodo` — que es el error que esta decisión corrige: dos pestañas del mismo análisis que empiezan iguales y divergen.

## Cómo se verificó

Contra la base local (Supabase 54421) y un servidor propio en `:3030` (el `:3020` que pidió el pedido lo ocupa el servidor
de otra rama, y no se tocó):

- **Mismas medidas.** A 1440 y 1280 px las dos tarjetas miden 147,5 px, con la fila de arriba en 61,5, la píldora en 31,5,
  el buscador en 36 y las pestañas y la tarjeta en las mismas coordenadas; a 1024 / 768 / 375 px las pestañas y el comienzo
  de la tarjeta también coinciden. Sin desborde horizontal en ningún ancho. (A ≤ 1024 px la de Desempeño es más alta porque
  *su* Categoría baja de línea; Comparar ya no tiene esa fila.)
- **Persistencia:** elegir A y B → cambiar de pestaña → salir a Existencias y volver por el menú → «Comparar períodos» trae
  A y B en la misma navegación; enlace directo sin fechas los siembra; F5 los conserva; otra sede (Tienda Lima) no hereda
  los de Trujillo y al volver a Trujillo reaparecen.
- **Búsqueda** en Comparar: `q=casaca` pasa las cifras de 16 a 2 variantes y el detalle lista solo esas.
- **Categoría:** la misma URL con y sin `cat=` da exactamente el mismo resultado.
- **Avisos:** un A en el futuro dice «El período A no puede empezar en el futuro…»; un B más allá de hoy, «El período B llega
  hasta hoy…»; sin nada que decir la tarjeta mide lo mismo que Desempeño.
- Consola limpia en una pestaña nueva. Pruebas: `resumen-periodos-guardados.test.ts` (nuevo), y ampliadas
  `resumen-comparacion.test.ts` y `resumen-periodo.test.ts`. `pnpm typecheck`, `eslint` y la suite completa en verde.

## Pendientes y observaciones

- **B sigue heredando el período de Desempeño hasta que se elige en Comparar** (por ADR-0138). Si Felipe prefiere que Comparar
  no herede nunca, es un cambio de una línea en `paramsDeComparar`; queda para su decisión.
- **El selector de fechas compartido no enfoca «Desde» al abrirse**, aunque su comentario lo promete (el enfoque se pide
  antes de que el panel exista, porque `usePosicionAnclada` mide en un `useLayoutEffect`). Pasa igual en el «Personalizado»
  de Desempeño. No se cambió aquí: activar el enfoque abriría el teclado del celular en las dos pestañas, y eso lo decide
  Felipe. Ver `docs/backlog/2026-09-29-periodo-analizado-comparar-c55892.md`.
- **No hay «restablecer»:** la petición pidió no sumar botones. Para volver a «últimos 30 días» hay que escribir las fechas.
- Entrar por un enlace **sin fechas** con períodos guardados pinta primero los de por defecto y a los pocos instantes los
  guardados (el clic de la pestaña, el camino normal, no tiene ese primer pintado).
