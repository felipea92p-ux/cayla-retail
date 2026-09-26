# ADR-0209 · Buscador y paginado: la regla global de todo combo

> Nació como ADR-0194 (2026-09-25). Renumerado a 0209 al subir: `main` ya tenía el 0194 de la prueba de carga
> (PR #387) y el 0208 estaba tomado en otra rama.

**Fecha:** 2026-09-25 · **Estado:** F1 y F2 construidos y verificados en navegador · **Alcance:** todo el ERP

## Problema

Felipe pidió una regla pareja para todos los combos del sistema: con más de 8 opciones, que se pueda buscar
escribiendo; con más de 50, que la lista se complete sola al bajar el scroll en vez de mostrarlas todas de
golpe. Y que los combos se **estandaricen** — hoy no hay uno, hay cuatro maneras distintas de elegir "uno de
varios" en el repo, cada una resolviendo el mismo problema (o no resolviéndolo) por su cuenta:

1. **`<select>` nativo a mano** — el más viejo, sin ni siquiera el vestido de `SelectNativo`. ~11 pantallas.
2. **`SelectNativo`/`CampoSelectNativo`** (`campos.tsx`, 2026-09-12) — el `<select>` del navegador vestido igual
   que un input. Es hoy la opción MÁS usada para listas largas (292 proveedores, todo el catálogo) — pero un
   `<select>` nativo no se puede vestir por dentro, no tiene buscador propio (solo el salto-al-tipear del
   sistema operativo) y no pagina: mete las 292 opciones al DOM de una.
3. **`Desplegable`/`CampoSelect`** (`campos.tsx`, 2026-09-09) — el desplegable propio del sistema, para listas
   cortas. Sin buscador ni corte: con 292 opciones metía 292 `<li>` sin forma de encontrar una.
4. **`ComboBuscable`** (2026-09-14) — nació ya resolviendo "listas largas" para el catálogo (300 referencias),
   con buscador — pero cortaba en 40 con el mensaje "sigue tipeando para acortar": el mismo parche que esta
   regla viene a sacar.

A esto se suman `DesplegablePildora` (las píldoras de filtro, Radix Select, API por `children` en vez de
`opciones`) y `ComboResponsable` (el combo de quién firma, con su propio diseño de avatares) — dos piezas más,
deliberadamente distintas de las cuatro de arriba por buenas razones (ver "F2" más abajo).

## Decisión

**La regla (`lib/combo-reglas.ts`, pura y testeada) vive en UN solo lugar y la usan `Desplegable`/`CampoSelect`
y `ComboBuscable` por igual, vía el hook compartido `components/ui/useCombo.ts`:**

- `UMBRAL_BUSCAR_COMBO = 8`: con más opciones que esto, aparece un campo para escribir y filtrar (sin tildes ni
  mayúsculas — misma `clave()` que ya usaba `ComboBuscable`). Con 8 o menos, no cambia nada.
- `TAMANO_PAGINA_COMBO = 50`: se revela de a 50; el scroll de la lista pide 50 más al llegar al fondo
  (`comboLlegoAlFinal`, con margen). Reemplaza el corte duro de `ComboBuscable` ("se muestran 40, sigue
  tipeando") — ahora no hace falta seguir tipeando, alcanza con bajar.
- Al abrir con una opción ya elegida que vive más allá de la primera página, `mostrarDesde` la incluye de
  entrada y la lista se auto-scrollea para que quede a la vista resaltada — abrir un combo de 120 con el
  #99 elegido no debe mostrar el #1.
- El escalonado de entrada de `Desplegable` (30ms por fila, para que la lista corta se lea como que se
  despliega) se apaga cuando hay buscador: a la fila 96 le tocarían ~2.9s de demora y quedaría invisible ese
  rato. `ComboBuscable` nunca tuvo ese escalonado — con buscador, ninguno de los dos lo tiene.

**Con 8 opciones o menos, `Desplegable` es exactamente el mismo control de siempre** (`mostradas` es
literalmente `opciones`, sin buscador, sin cambio de comportamiento ni de props) — cero riesgo para los
cientos de `CampoSelect` de 2 a 6 opciones que ya funcionaban. El cambio es puramente aditivo.

**F1 (núcleo + piloto).** `combo-reglas.ts`/`.test.ts`, `useCombo.ts`, y `Desplegable`/`ComboBuscable`
actualizados; migrado como prueba el bloque de escritorio de `FiltrosProductos.tsx`
(Categoría/Marca/Proveedor/Color/Estado/Stock, de `CampoSelectNativo` a `CampoSelect`) — verificado en
navegador con 120 proveedores de prueba: buscador, filtro, paginado al scrollear y selección, los tres
funcionando.

**F2 (el resto, "todo de una" — pedido explícito de Felipe tras ver F1 funcionando).** Mismo día:

- **`ComboResponsable`** (69 usos): ahora suma buscador con más de 8 personas de turno a la vez, mismo
  paginado. Verificado en navegador con 12 personas de prueba — al principio el foco no llegaba al campo de
  búsqueda (el efecto dependía de `abierto` en vez de `posLista`, que recién queda listo un render después de
  abrir: el `<input>` ni existía todavía en el DOM cuando el efecto intentaba enfocarlo) — corregido y
  reverificado, tipear ya filtra de inmediato.
- **`DesplegablePildora`** (píldoras de filtro, `FiltrosPildora.tsx`): reescrita a mano (no Radix `Select` —
  no aloja un `<input>` de búsqueda propio de forma robusta) con la misma firma de opciones/regla que
  `Desplegable`, conservando su aspecto sin caja (ADR de 2026-09-17: "no me gusta que estén encapsulados en
  esos rectángulos blancos"). `ItemDesplegable` se retiró (API vieja de `children`); sus 6 consumidores
  (`FiltrosProductos.tsx`, `FiltrosCompras.tsx`, `AQuienPedirle.tsx`, `FiltrosHistorialVentas.tsx`,
  `ComprobantesPanel.tsx`) pasaron a `opciones`. `FiltrosRecibidas.tsx` tenía su PROPIA pastilla de proveedor
  a mano (ni `DesplegablePildora` ni `ItemDesplegable` tal cual) — se reescribió igual, a mano, conservando su
  forma con borde (`claseDeLaPastilla`) en vez de forzarla a la piel sin caja de `DesplegablePildora`, porque
  tiene que verse igual que su vecina «Fechas» en la misma barra.
- **~25 pantallas con `SelectNativo`/`CampoSelectNativo`/`<select>` nativo a mano** (Compras, Producción,
  Catálogo/Inventario, Vender/Caja) migradas a `CampoSelect`/`Desplegable`, en 5 lotes en paralelo. Casos reales
  resueltos en el camino (no mecánicos): distinguir un placeholder verdadero ("nada elegido, bloquea guardar") de
  una opción real como "Todos"/"Sin preferencia"; preservar `disabled` condicional (talla que depende de la
  categoría elegida); preservar el foco-en-error de `avisar.error({enfocar: id})` cuando `CampoSelect` no expone
  un `id` propio (se puso en el `<div>` contenedor, que el `querySelector` de respaldo de `enfocar()` ya sabía
  encontrar).

**Dos archivos quedaron sin migrar a propósito — no son descuido, son decisión pendiente de Felipe:**

- **`DecisionFaltanteFila.tsx`**: su `<select>` usa un `<optgroup>` real (agrupa motivos de cierre bajo un
  encabezado, con una opción suelta arriba) y además no es un combo con estado propio — es un "disparador"
  de acción (`value` fijo, aplica una decisión a todas las filas). `Opcion<T> = {valor, texto}` es plano y no
  representa el agrupamiento. Decidir: ¿un tipo `OpcionAgrupada` nuevo para este único caso, o dejarlo fuera
  de la regla?
- **`CambioReemplazo.tsx`**: su `<select>` reenvía un `ref` que el PADRE (`CambiosFlujo.tsx`) usa directo
  (`refMetodo.current?.focus()`) para el foco-en-error de la validación de caja. `Desplegable` no reenvía ref a
  su botón interno. Arreglarlo bien toca `CambiosFlujo.tsx` también (mismo patrón contenedor+`querySelector`
  que ya usan `refMotivo`/`refPrenda` ahí mismo) — Felipe decide si vale la pena para un solo campo.

Verificación final de F1+F2: typecheck y `eslint` limpios en los ~39 archivos tocados, suite completa
(21 290 pruebas — la cifra bajó desde los 24 373 de F1 porque otra sesión, en paralelo en el mismo checkout,
edita `lib/menu.ts`/`modulos.test.ts` para un feature de menú móvil no relacionado; nada de eso es de esta
migración).

## Actualización 2026-09-26 — lo que la migración no alcanzó

**Actividad (ADR-0207), construida el mismo 2026-09-25 en otra rama, nació con `SelectNativo`**: en el panel de la
cabecera se veía el hilo del campo dibujado DENTRO de la caja, otra flecha y la lista del sistema operativo. Sus cuatro
combos pasan a `Desplegable forma="caja"`. Lo que eso destapó vale para cualquier combo: `Desplegable` muestra el
marcador («Elegir») si su valor no está entre las opciones, así que **lo elegido tiene que estar siempre en la lista**
(`opcionesDeModulo` y `opcionesDePersona` en `lib/actividad-reglas.ts`); el `<select>` nativo, en el mismo caso,
mostraba la primera opción («Todas las personas») mientras filtraba por otra.

Quedan `<select>` nativos que nacieron del 18 al 24 de setiembre y la migración no tocó: `DevolucionesPendientes.tsx`,
`MediosDePago.tsx`, `apartados/ModalesApartado.tsx` y `finanzas/CampoCuenta.tsx` (además de las dos excepciones de
arriba y de `SelectFin`, el control propio de Finanzas, ADR-0195). No hay prueba que vigile la regla; hasta que la haya,
cada pantalla nueva puede volver a traer uno.

## Actualización 2026-09-26 (b) — cero excepciones, Finanzas incluida, y la prueba que lo vigila

Pedido de Felipe: «cambiemos esos select de otros módulos y creemos esa prueba para que avise cuando salga uno nuevo, y
que se aplique ese diseño por defecto». Con Finanzas dentro (lo eligió él: su spike, ADR-0195, dibuja 24 `<select>`).

**Primero se hizo fácil el cambio.** Lo que dejaba afuera a los últimos nativos eran tres cosas que `Desplegable` no
sabía, y las aprendió (reglas puras en `lib/combo-reglas.ts`, con pruebas):

- **Grupos** (`Opcion.grupo`, el `<optgroup>`): las seguidas del mismo grupo van bajo su título, en un `role="group"`.
  Las flechas y el «activo» siguen contando la lista plana (`tramosPorGrupo`). El buscador también mira el grupo.
- **Opciones que se ven y no se eligen** (`Opcion.deshabilitada`, el `<option disabled>`): un cajón con la caja cerrada.
  Ni el clic ni Enter la eligen; las flechas, Inicio y Fin la saltan (`siguienteElegible`, `primeraElegible`).
- **`id` y `ref`**: el `id` va al disparador (un `<label htmlFor>`, `avisar.error({ enfocar })`); el `ref` (prop común en
  React 19) entrega el disparador — lo que Cambios enfoca cuando falta la caja.

Y dos formas para Finanzas: `fin` (la caja `fin-control` del spike: su flecha, su relleno) y `finEnLinea` (el combo dentro
de un sobretítulo). Las dos son **«como nativas»**: todas las opciones invisibles apiladas en la misma celda le dan al
control el ancho de la más larga, como hace el navegador, y su lista puede ser más ancha que el control.

**Después, el cambio.** Devoluciones pendientes, Medios de pago, Apartados, los combos de cuentas (`opcionesDeCuenta` en
`lib/cuenta-sellada-reglas.ts` reemplaza a `OpcionesCuenta`, que dibujaba `<option>` sueltos), «Decidir todas» de Recibir
(`DecisionFaltanteFila.tsx`) y el medio de la diferencia de Cambios (`CambioReemplazo.tsx`): las dos excepciones de
arriba ya no lo son. En Finanzas, `SelectFin` pasó a ser un `Desplegable` (44 combos en 18 archivos) y Flujo de caja usa
`SelectEnLineaFin`. Se borraron `SelectNativo`, `CampoSelectNativo` y el `campoSelect` de `Modal.tsx`.

**Medido, no a ojo.** Un banco temporal con las piezas en sus contextos reales (barra de herramientas, «Ver:», mes chico,
campo, tabla, sobretítulo), comparado número contra número con la línea base tomada antes del cambio, a 1280 y a 375 px:
alto, relleno, letra, colores, borde, esquinas, flecha y posición iguales; anchos con diferencias de menos de medio
píxel. Las formas `campo` y `pastilla`, idénticas.

**Un cambio visible, a propósito:** la forma `caja` salía transparente —un `bg-transparent` común a todas las formas le
ganaba a `.caja-cayla`— y ahora es hueso, como dice la guía (ADR-0169) y como `CampoTexto caja`. En Existencias el
buscador era hueso y los combos de al lado no.

- DECIDÍ: enseñarle a `Desplegable` grupos, opciones bloqueadas, `id`/`ref` y las formas de Finanzas, y migrar todo.
  DESCARTÉ: dejar los casos raros como excepciones escritas en la prueba, porque cada excepción es el precedente de la
  siguiente, y el combo «de mentira» (una opción vacía que dice «Sin cuentas») seguía mintiendo en el nativo.
  SE ROMPE SI: un combo necesita algo que tampoco sabe `Desplegable` (varias opciones a la vez, grupos anidados); ahí
  se le enseña a él o se usa otra pieza del sistema (`SelectorMultiple`), nunca el nativo.
- DECIDÍ: la prueba lee el árbol del código con TypeScript (`lib/sin-select-nativo.test.ts`), como la de arquitectura.
  DESCARTÉ: buscar el texto «<select» (salta con un comentario que lo nombre, y el repo tiene varios) y una regla de
  ESLint (sería un segundo mecanismo para lo mismo, y su excepción se esconde en un comentario dentro del archivo).
  SE ROMPE SI: alguien arma un `createElement("select")` o trae un `<select>` desde una librería; hoy no hay ninguno.

Queda sin resolver (no es de esta regla, lo destapó): Escape con la lista de un combo abierta cierra el modal entero en
todo el ERP (ver BACKLOG, 2026-09-26).
