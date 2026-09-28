# ADR-0261 · Atributos: una sola barra y una sola tarjeta en las seis pestañas

- **Fecha:** 2026-09-28 · **Estado:** aceptado. Solo web, **sin migración**.
- **Pedido:** Felipe, 2026-09-28: «todo este módulo debe tener la misma similitud… en algunos tienen la opción de buscar,
  en otros no… en temporadas faltan todas las imágenes de referencia». Afinado con cuatro preguntas; eligió las cuatro
  recomendadas: «Grilla primero» en Temporadas, buscador en cinco (no en Temporadas), píldoras en todas, e ícono como
  Etiquetas para las temporadas.
- **Complementa:** ADR-0109 (etiquetas con dibujo), ADR-0169 (paleta; sin sombras en superficies pegadas al fondo),
  ADR-0246 (Temporadas; ver su «Actualización 2026-09-28 (b)»), ADR-0256 (detalle de Tejidos y Patrones).

## Qué había

Seis pestañas, tres maneras de verse. Medido en el código el 28-09 (con el buscador del #570 ya fusionado):

| Pestaña | Filtros con píldoras | Título de grupo | Tarjeta al pasar el mouse | Muestra | «Desactivar» |
|---|---|---|---|---|---|
| Etiquetas | sí | con punto ● | borde | 3:1 | discreto, al pie |
| Tallas | sí | con punto ● | borde | 3:1 | discreto, al pie |
| Colores | no (familias sin píldoras) | «Neutro · 11», sin punto | **sombra** | **48 px fijos** | dentro de Editar |
| Tejidos, Patrones | no (contador «N tejidos») | sin grupos | **sombra** | 3:1 | **botón lleno** |
| Temporadas | 4 tarjetas de cifra (#566) | — | — | **ninguna** | — (lista cerrada) |

Cada pestaña copiaba a mano su barra, su título de grupo y su tarjeta. En dos semanas la copia ya había derivado: el
buscador medía 56 en unas y 72 en otras, dos pestañas tenían sombra (prohibida por ADR-0169) y el pie de Etiquetas partía
«Configurar campaña» en dos líneas.

## Decisión

1. **Las piezas viven en un solo lugar: `components/atributos/kit.tsx`.** `BarraAtributos` (píldoras a la izquierda;
   buscador y «+ Agregar» a la derecha, los dos opcionales), `TituloGrupo` (punto + nombre + cuenta), `TarjetaAtributo`
   (muestra 3:1, nombre de 15 px con su «!» y su insignia, líneas chicas, pie; con `abrir`, la parte de arriba es el
   botón del detalle), `BotonesPendiente`, `PieTarjeta` + `AccionTarjeta` + `DesactivarTarjeta`, `BotonReactivar`,
   `SinCoincidencias`, `VocabularioVacio` y `GRILLA_ATRIBUTOS`. **La lógica de cada pestaña no se fusionó** (Colores
   tiene hex y Pantone, Tallas exige comentario, Etiquetas lleva campañas): se unificó cómo se ve, no qué hace.
2. **Píldoras en todas, con el grupo que cada vocabulario ya tiene:** Etiquetas por estilo (+ «Vigentes hoy»), Tallas por
   tipo, Colores por familia, Tejidos y Patrones por **«En uso · Sin prendas»** (`usoDe`, `lib/atributos-buscar.ts`; cuenta
   productos activos y descontinuados, lo mismo que dice la tarjeta), Temporadas por **Una estación · Dos estaciones ·
   Clásicos** (`grupoDeTemporada`). El conteo de uso sale de `exigir(...)`: si la lectura falla, la pantalla cae con su
   aviso, nunca muestra «Sin prendas» por error.
3. **Buscador en las cinco que crecen** (mismo ancho y lugar, `placeholder` «Buscar <cosa>»; Colores «Buscar color o
   código», que además entiende sinónimos). **Temporadas no lleva buscador ni «+ Agregar»**: son nueve fijas y caben en una
   pantalla.
4. **Temporadas abre con las nueve en grilla** y el trabajo queda en una franja encima con su cifra (detalle en ADR-0246,
   «Actualización 2026-09-28 (b)»).
5. **El dibujo de las temporadas usa el molde de Etiquetas** (`MuestraIcono`, extraído de `MuestraEtiqueta`): flor, sol,
   hoja, copo; las de dos estaciones juntan los dos; los clásicos van dentro de un aro (el de todo el año, con un
   infinito). Sale de `estacionesDe()` —los datos de `fn_temporadas`, no la clave—: una décima temporada se dibuja sola.
   Tono por la mitad del año: ámbar (primavera y verano), pizarra (otoño e invierno), tinta (clásicos).
6. **La tarjeta no tiene sombra** (ADR-0169): sube 2 px y marca el borde. «Desactivar» es discreto en todas (aparece al
   pasar el mouse; siempre visible en pantallas táctiles), salvo en Colores, donde sigue dentro de «Editar».

- **DECIDÍ:** un kit de presentación compartido y cada pestaña con su lógica, más píldoras con el grupo natural de cada una.
- **DESCARTÉ:** un componente genérico `VocabularioLista` que haga las seis, porque las diferencias son reales (comentario
  obligatorio en Tallas, campaña y descuento en Etiquetas, hex y Pantone en Colores, lista cerrada en Temporadas) y el
  molde único se llenaría de `if`; y dejar Tejidos y Patrones sin píldoras (solo el contador del #570), porque eran las dos
  únicas barras distintas del módulo.
- **SE ROMPE SI:** alguien arma una pestaña nueva copiando una tarjeta a mano en vez de `TarjetaAtributo` (la grieta
  vuelve); o si un vocabulario llega a tener tantos grupos que las píldoras ocupan dos filas en escritorio (Colores ya tiene
  10 con «Todos» y a 1440 px empuja el buscador a una segunda fila): ahí las familias pasan a un `DesplegablePildora`.

## Cómo se verificó

En el navegador contra la base local (usuario del seed), a 1440 px y a 375 px: las seis pestañas con la misma barra y
tarjeta; buscar «den» en Tejidos deja solo Denim, «denzzz» muestra «Ningún tejido coincide…» y «Quitar filtros» devuelve
los 17; clic en una tarjeta de tejido abre su detalle; en Temporadas la píldora «Clásicos» deja los tres, «Completar ›»
abre «Por completar» sin recargar y «← Las nueve temporadas» vuelve; `?vista=completar&desde=productos` muestra «←
Productos» y «← Las nueve temporadas»; sin scroll horizontal a 375 px. Suite web: 215 archivos, 152 356 pruebas en verde.
