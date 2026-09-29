# ADR-0279 — Las fotos de una prenda se agregan desde su color: «Fotos por color» en Editar producto

**Fecha:** 2026-09-29
**Estado:** Construido, sin migración. `tsc`, `eslint` y la suite de `apps/web` (234 archivos) en verde; el render de la sección se
probó con `react-dom/server` en cuatro casos (la prenda de la captura, colores sin foto, foto huérfana y nueva, prenda sin colores).
**Falta verla en el navegador con datos reales** (la copia local no tiene `apps/web/.env.local`; ver «Cómo se verifica»).
**Decide:** Felipe, 2026-09-29. Pidió que agregar la imagen de un color en «Editar producto» sea obvio para los colaboradores, que
el combo no liste todos los colores del catálogo y que se parezca a cuando se crea un producto. Vio el spike
`docs/maquetas/producto-fotos-por-color-2026-09/` (Hoy + A lista, B foto dentro de cada color, C tarjetas) y eligió **C · Tarjetas
por color**; sobre las fotos ya guardadas sin color pidió **contar primero en producción** (hecho: 0).
**Sobre:** ADR-0228 (la revisión de cada foto), ADR-0257 (la barra de cambios), ADR-0263 (la ficha por ejes y el color que se
corrige: las fotos siguen al color), ADR-0136 (los modales), ADR-0077 (fotos por color en la Grilla).

## Contexto (leído del código de `main`, 58b4601e)

1. **Cada color y su foto vivían en dos lugares que no se hablaban.** «Fotos» (`FotosProducto.tsx`) era una galería suelta; los
   colores vivían abajo, en «Variantes». El único puente era un combo bajo cada foto.
2. **Ese combo listaba los 71 colores del catálogo, no los de la prenda:** `ProductoForm.tsx` le pasaba `colores={colores}`, el
   vocabulario entero.
3. **La foto nacía sin color.** `FotosProducto.subir` la creaba con `colorCodigo: null`, y `fotoDeVariante`
   (`lib/producto-fotos-reglas.ts`) usa las fotos sin color para TODOS los colores que no tengan la suya. Quien subía 4 fotos sin
   tocar los combos dejaba cada color mostrando la misma prenda en Vender, Traslados y Productos.
4. **Un color sin foto no se notaba en ningún lado.** Producción, 2026-09-29 (solo lectura): 11 de los 15 colores activos no
   tienen ninguna foto.
5. **Dos formas de resolver lo mismo.** El alta ya ponía la foto en la fila de su color (`MatrizVariantes.tsx`).

## Decisiones

**1. La foto nace dentro de un color; el hueco se ve.**
- DECIDÍ: la sección pasa a «Fotos por color»: un rectángulo 4:5 por cada color que la prenda vende hoy (variantes activas, en el
  orden de sus variantes). Con fotos muestra la portada, cuántas tiene y «Principal» si la tiene; sin foto es un rectángulo
  punteado que dice «Agregar foto de Beige». Arriba: «3 de 4 colores con foto» (y «· los demás se ven sin foto» si nada los cubre).
  Debajo del nombre de cada color: «1 foto», «usa la general» o «Sin foto» (ámbar).
- DESCARTÉ (a) acortar el combo a los colores de la prenda y dejar la galería: es un cambio de una línea, pero no arregla la causa
  —la foto seguiría naciendo sin color— y nadie sabría que hay que tocar el combo; (b) A, una fila por color: con 8 colores la
  sección medía ≈ 1.220 px contra ≈ 640 de C (medido en la maqueta a 1.180 px de ancho); (c) B, la foto dentro de la cabecera de
  cada color en «Variantes»: enreda las fotos con los precios y el stock en un componente de 672 líneas y borra la sección
  `#fotos` a la que enlaza la pantalla de éxito del alta.
- SE ROMPE SI una prenda llega a 20 o más colores (la grilla de tarjetas se alarga; hoy el peor caso real es 8), o si las fotos
  vuelven a nacer sin color por otro camino (una carga masiva). Volver a contar en producción las fotos sin color antes de publicar.

**2. Cada foto se maneja en una hoja, con botones a la vista.**
- DECIDÍ: tocar un color con fotos abre «Fotos de Celeste» (`<Modal>`): cada foto con **Principal**, **Quitar**, «Ponerla primera»
  (solo cuando cambia algo) y un combo **«Pasar a otro color…»** que ofrece solo los colores de esa prenda y «Todos los colores».
  Una casilla «Agregar otra» sube más. Una foto que se pasa de color queda AL FINAL de las de su nuevo color.
- DESCARTÉ el menú «⋯» del spike: `MenuAcciones` se dibuja en un portal a `document.body`, fuera de la hoja de Radix (por lo mismo
  los combos cuelgan de la capa de la hoja, ADR-0211); y unos botones con su nombre se descubren mejor que un ⋯ para una
  colaboradora en una tablet.
- SE ROMPE SI un color tiene tantas fotos que la hoja no cabe: hoy se desplaza dentro de la hoja.

**3. «Todos los colores» sigue existiendo, pero como excepción explícita.**
- DECIDÍ: la foto general (`color_codigo = null`) tiene su rectángulo si la prenda tiene 2 o más colores, si ya existe alguna, o si
  la prenda no tiene colores (entonces es «La prenda»). Con un solo color no estorba, pero una que ya existe no se esconde. Su hoja
  lleva la pregunta «¿Es de un solo color? Pásala a ese color».
- DESCARTÉ quitar el concepto: Felipe decidió el 2026-09-26 «una foto general y luego escoger la gama de colores» (`FotosAlta`).

**4. Una foto de un color sin variantes activas no se pierde ni se esconde.**
- DECIDÍ: un bloque ámbar aparte: «1 foto es de un color sin variantes activas… se guarda igual y vuelve a su tarjeta si ese color
  se activa. Pásala a otro color o quítala». Hoy hay 0 casos en producción.
- SE ROMPE SI se desactiva el último Beige de una prenda por un rato: la foto pasa al bloque y vuelve sola al reactivarlo (es a
  propósito: el color no se pierde; solo deja de tener tarjeta mientras nadie lo vende).

**5. «Agregar color» trae la foto en el mismo gesto.**
- DECIDÍ: la hoja de «Agregar color» suma, por cada color elegido, «Foto de cada color · opcional» (una casilla con cámara). La foto
  sube al elegirla y entra a la ficha con ese color al confirmar; solo las de los colores que de verdad se crean (uno con todas
  sus celdas quitadas no nace ni lleva foto). Sin ella, el rectángulo vacío de «Fotos por color» la espera igual.
- SE ROMPE SI se elige una foto y se cancela la hoja: el archivo ya está en el almacén y queda sin usar (igual que hoy con la
  galería: nada lo borra).

## Decisiones técnicas

- **Reglas puras en `lib/fotos-por-color-reglas.ts`** (con `.test.ts`, 27 casos): `vistaDeFotos`, `fotosDelColor` (el orden de
  `fotoDeVariante`: la principal primero), `conFotosNuevas`, `sinLaFoto`, `comoPrincipal`, `primeraEnSuColor`, `pasadaAColor`,
  `pendienteDeFoto`, `textoCuenta`. **Siempre exactamente una principal** si hay fotos (la base tiene el índice único parcial
  `producto_fotos_principal_unico`): cada operación devuelve la lista ya normalizada, y una prueba lo recorre.
- **`useSubirFotos`** (elegir → `RevisarFotosModal` → subir) sale de `FotosProducto` para que lo usen la sección y `AgregarColoresModal`.
- **Sin migración ni cambio de contrato:** la sección recibe las fotos como se ven (`fotosComoSeVen`) y devuelve la lista;
  `cambiarFotos` (`anclarFotos`) y `p_fotos` no cambian. Una foto de un color nuevo se ancla a ese color aunque las filas
  todavía no lo tengan (`anclar`: un color que no está en lo guardado es él mismo).
- **Lo pendiente se marca con la misma cuenta de la barra** (ADR-0257): una foto sin fila (`id` ausente) es «Nueva» y una que cambió
  de color contra lo guardado es «Movida», en ámbar; `fotosGuardadas` sale del mismo `fotosComoSeVen(enLaBase.fotos, mudanzas)`.
- **`components/FotosProducto.tsx` se borra:** nada más lo importaba.

## Lo que no cambia

El modelo (`producto_fotos.color_codigo`, `orden`, `es_principal`), `fotoDeVariante`, `mudanzasAlGuardar` (las fotos siguen al color
corregido), la barra «Tienes N cambios sin guardar», la revisión de cada foto (ADR-0228), la subida inmediata a
`retail-productos-fotos` y la edición simultánea (ADR-0193).

## Antes de decir «listo» (las tres preguntas)

- **Concurrencia:** dos personas guardando la misma prenda chocan por `version` (`PT409`, ADR-0193): la segunda recarga. Las fotos
  entran en ese mismo guardado; el archivo que subió quien pierde la carrera queda sin usar en el almacén (como siempre).
- **Caída externa:** si el almacén no responde, la foto no sube, sale el aviso de siempre (`avisar.error`) y nada más se pierde.
- **Persona sin contexto:** el rectángulo vacío dice «Agregar foto de Beige»: no hay nada que aprender antes. Falta probarlo con una
  colaboradora real, en una tablet.

## Cómo se verifica

- `pnpm --filter web test` (incluye `lib/fotos-por-color-reglas.test.ts`), `tsc --noEmit` y `eslint` en verde.
- **En el navegador** (pendiente): abrir una prenda con 2+ colores en `/productos/[id]/editar` → cada color tiene su rectángulo;
  agregar la foto de un color sin ella (sale «Nueva» y la barra cuenta «Se suma 1 foto»); tocar una y «Pasar a otro color…» (solo
  ofrece los de la prenda); «+ Agregar color» con foto; «Descartar» devuelve todo; a 375 px.
