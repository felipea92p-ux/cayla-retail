# Spike visual · Vista rápida de producto (2026-10-05)

**Estado (2026-10-05, tarde): Felipe eligió la A y pidió «todas las animaciones posibles». Construida en el ERP real:
`components/vista-rapida/VistaRapidaProducto.tsx` reemplaza a `VistaRapidaModal`. Las otras dos maquetas quedan como referencia.**

Lo que quedó distinto de la maqueta A (todo a propósito):
- **Movimiento:** la maqueta era sobria; la versión real lleva el movimiento rico de ADR-0136 «Actualización 2026-10-05» (título que se barre,
  ola diagonal de celdas con su barra y su cifra, destello único en la foto, foto que cruza y se asienta, cruz al pasar el mouse, onda al
  elegir, texto que se desliza, paralaje y brillo solo con mouse). **Sin rebote y sin ningún bucle**; `lib/vista-rapida-movimiento.test.ts` lo vigila.
- **«Pedir a otra sede» no está:** necesita las sedes a las que se puede pedir (`sedesParaPedir`, que solo calcula Traslados). El aviso de «sin
  unidades aquí» nombra las otras sedes con lo que ya redacta `lineasDeStock`. Queda en el backlog.
- **Etiquetas no se bloquea:** la maqueta apagaba el botón; en el ERP solo se atenúa y el aviso sale antes del clic, porque `EnlaceEtiquetas`
  vuelve a leer FRESCO al tocarlo (una lectura vieja de 0 no debe impedir imprimir lo que acaba de entrar).
- **Variantes retiradas:** se sigue la regla de siempre (`variantesQueSeVenden`: no se listan ni se cuentan); una combinación que no existe sale
  rayada, como `RAYADO_FUERA` de Editar producto, en vez de la celda «retirada» de la maqueta.
- **Dos opciones nuevas y opcionales de `<Modal>`:** `conCerrar` (la ✕ visible) y `tituloGrande`.

Pedido de Felipe, con una captura de «Pantalón Nuki · PAN-0014» (el modal que se abre al tocar una prenda en Catálogo ▸
Productos ▸ Grilla): *«es muy poco entendible, los botones quedan sin ser visibles por la gran cantidad de variantes, y las
variantes no se pueden identificar por la poca guía visual»*. Y pidió que al menos una maqueta fuera **liquid glass,
sofisticada y llena de animaciones, sin romper la estética de CAYLA**.

## Qué está mal hoy (verificado en el código, no solo en la captura)

| Lo que se ve | Por qué pasa |
|---|---|
| **Los botones desaparecen.** | `VistaRapidaModal` pone la tabla —una fila por variante— y, **después**, los cuatro botones (`mt-auto`, línea 392). Pantalón Nuki son 6 colores × 3 tallas = **18 filas de ~41 px**: en un laptop de 768 px de alto los botones quedan bajo el pliegue, y quien scrollea es la hoja entera, así que la foto también se va. |
| **No se distinguen las variantes.** | El color es **texto repetido** («Beige» ×3, «Blanco» ×3…), sin swatch en la fila. La foto y la tabla no se hablan: pasar el mouse por un swatch cambia la foto pero no marca nada en la tabla. Y el orden es talla → color, así que «todo lo Camel» nunca queda junto. |
| **Se repite lo que no varía.** | `S/79.90` ×18. Y **18 impresoras idénticas** que, cuando la sede tiene 0 unidades, no navegan: `EnlaceEtiquetas` avisa y pinta el botón de rojo **después** del clic. |
| **«Stock en Tienda AQP: 0» sin contexto.** | Una línea suelta; no dice si hay en otra sede ni cuánto es el total. |

Tres hallazgos que ya estaban en [`docs/pantallas/productos.md`](../../pantallas/productos.md) y que las maquetas aprovechan:
**#1** la vista rápida lee la tabla `stock` cruda (`useStockEnSede`) y no la cifra única de ADR-0270, así que puede decir otro
número que la tarjeta; **#4** «Editar» se ofrece a quien no puede (la Grilla no lo condiciona; la Tabla sí); y **el precio atípico
no se marca** (una talla a S/10.00 entre tallas de S/79.90 pasa inadvertida).

## Lo que las tres hacen igual (y por qué)

1. **Los botones nunca se esconden.** Pie fijo (`pie-hoja-fijo`, ya existe) en A y B; dock flotante en C. **Medido** (alto natural
   de la hoja contra el que de verdad da el modal: 683 px en un laptop de 768, 804 en uno de 900): con las 18 variantes A y B
   **caben enteras sin scroll en 768** (A 595 px con stock y 644 con el aviso de «sin unidades aquí»; B 582 y 682); con las 45
   variantes caben en 900 (A 730, B 688) y en 768 scrollean de 5 a 47 px, con el pie siempre a la vista. C es de alto fijo
   (620 px) y nada hace scroll salvo el panel de la derecha en pantallas muy bajas. La tabla de hoy sola mide 18 filas × 41 px
   ≈ **740 px** (medido en tu captura) y los botones vienen después: por eso no se ven.
2. **Lo que no varía se dice UNA vez.** «S/79.90 en las 17 variantes» arriba; solo se marca la excepción (en A, el precio distinto
   aparece dentro de la celda; si todo cambia por color, el encabezado lo avisa). Mismo criterio que ya usa `FichaVariantes`
   de la Tabla para costo y margen.
3. **Un solo lugar para etiquetar** en vez de 18 íconos. La regla no cambia: sin unidades en la sede no hay etiqueta
   (`EnlaceEtiquetas`); lo nuevo es que el botón **dice por qué ANTES de tocarlo** («Sin unidades en AQP: no hay nada que
   etiquetar aquí») en vez de ponerse rojo después del clic. Funciona igual con el dedo: la impresora de hoy «va siempre a la
   vista» justamente porque este modal también se abre en el celular.
4. **El color es un swatch en todas partes** y la foto siempre muestra el color que se está mirando (`MosaicoPrenda` si ese color
   no tiene foto, ADR-0333: ícono de la categoría sobre el color).
5. **«En AQP» es la cifra única de ADR-0270** y, al lado, «+35 en otras sedes» (con 0 aquí: «Hay en LIM 24 · TRU 11» y un
   «Pedir a otra sede», que ya existe en la tarjeta: `BotonPedirAOtraSede`). Construirla exige pasarle `existencias` al modal
   (hoy solo llega a la tarjeta), lo que de paso cierra el hallazgo #1.
6. **Editar solo a quien puede** (`puedeEditar`) — hallazgo #4. Una **✕** para cerrar: hoy solo se cierra con Esc o tocando el velo,
   y en el celular no se ve cómo.
7. **Celular (390 px):** hoja que sube desde abajo, foto como cinta, pie en 2×2 (`Editar | Etiquetas` / `Existencias | Eliminar`).
8. **Los 4 casos de datos** (barra de arriba): *Como tu captura* (18 variantes, todo en 0), *Con stock variado* (ceros, pocas
   unidades y una talla retirada), *Pocas variantes* (2×2, con un precio distinto) y *Muchas variantes* (9 colores × 5 tallas =
   45, el peor caso).

Ningún campo, regla ni consulta cambia: todo lo que dibujan existe ya en `ProductoListado` / `ExistenciasProducto`.

---

## A · Matriz — `a-matriz.html`

**La evolución directa.** Mismo `<Modal ancho="max-w-4xl">` con foto a la izquierda y datos a la derecha, pero las 18 filas se
vuelven **una matriz color × talla**: 6 filas en vez de 18, el color con su swatch una sola vez, cada celda con su cifra y una
barrita proporcional (dónde está el stock se ve sin leer). Pasar el mouse por una fila cambia la foto; un clic la deja fija.

- **Se elige para etiquetar:** una celda (esa variante), un color (toda su fila) o una talla (toda su columna). El botón de abajo
  dice exactamente qué va a imprimir: «Etiquetas» → «Etiqueta · Camel M» → «Etiquetas ② ». Apunta a
  `urlEtiquetasDePrecio({ variantes: [...] })`, que ya acepta una lista.
- El total de cada talla va en su cabecera y el de cada color a la derecha; ceros apagados (no rojo, ADR-0151); tallas retiradas
  rayadas (como `RAYADO_FUERA` en Editar producto). El estado de lo elegido vive en la cabecera de la matriz: no gasta una fila.
- **Foto fija (sticky)** mientras se baja por la matriz; **pie fijo** con los botones.
- Reusa: `Modal`, `Chip`, `pie-hoja-fijo`, `EnlaceEtiquetas`, `SwatchesColor` (el swatch), el mismo modelo mental de
  `MatrizStockFicha` / `MatrizCantidades` que ya usan Nuevo y Editar producto.
- **A favor:** es el salto más chico desde lo que existe; da **todo el panorama de un vistazo** (45 variantes caben en una
  pantalla); coincide con cómo ya se ve el stock en Editar producto.
- **En contra:** sigue siendo una tabla — es la más «sobria» de las tres y la que menos cambia la sensación.

## B · Color primero — `b-color-primero.html`

**Las variantes dejan de ser una lista: son dos pasos.** Paso 1, el color (fichas con swatch, unidades y **un punto por talla**:
se ve qué colores todavía tienen algo). Paso 2, las tallas **de ese color** en fichas grandes con la cifra bien visible. Nunca hay
más de 3 a 6 cosas en pantalla, aunque la prenda tenga 45 variantes.

- **La foto ocupa todo el alto, a la izquierda** — es la prop `lateral` de `<Modal>`, que ya existe (hoy en Reponer, Subir a
  almacén y Ajustar) y habría que extender de `max-w-lg` a `max-w-4xl` y a pantalla completa de alto.
- Cambiar de color cruza la foto y re-arma las tallas (cada ficha entra con 40 ms de desfase; la cifra cuenta; la barra se
  llena). Flechas ← → mueven el color (`radiogroup`).
- Una tira de «lo elegido» (Camel · M · código · precio · unidades) con **«Etiqueta de Camel M»** y **«Etiquetas de todo Camel»**.
- **A favor:** responde la pregunta real del piso —«¿tengo ESTA en M?»— sin leer una tabla; la foto manda.
- **En contra:** para el panorama completo (¿qué tallas me faltan en TODOS los colores?) hay que recorrer los colores uno por uno;
  en una prenda de un solo color los dos pasos sobran.

## C · Cristal — `c-cristal.html`

**Liquid glass con la paleta de CAYLA.** La prenda es el escenario (foto a toda la hoja; sin foto, el color con un spot de luz y
su ícono) y la información flota en vidrio cálido: `papel` al 54–76 % con desenfoque y saturación **más un 15 % del color que se
está mirando** (`--tinte`, animado con `@property`), así que al cambiar de color **el vidrio entero vira de tono con la foto**.
Mismos radios, misma tipografía (EB Garamond + DM Sans), tinta sobre vidrio claro, rojo solo en hover — lo único nuevo es la
materia. Sin foto de ese color, el fondo cae al mosaico.

Movimiento (se baja con **«Sobrio»** en la barra de arriba para ver la versión más contenida):

| Qué | Cómo | ¿ADR-0136? |
|---|---|---|
| Entrada | los paneles se **condensan**: parten transparentes y sin desenfoque y se escarchan, 70 ms de desfase | Más que la cascada (en «Sobrio» vuelve a la cascada normal) |
| Color nuevo | se **derrama** desde el swatch que tocaste (círculo que crece, 800 ms) y el vidrio cambia de tono | Respuesta a una acción |
| Lente líquido | una gota de vidrio bajo los swatches que se **estira** al viajar (un borde sale antes que el otro) | Respuesta a una acción |
| Tallas | un **nivel de líquido** sube hasta su stock (mide lo que hay) y la cifra cuenta | Respuesta a una acción |
| Brillo y fondo | brillo especular que sigue al puntero sobre cada panel; el fondo se desplaza apenas con el mouse | **Nuevo** — solo «Completo» |
| Dock | las acciones se agrandan un poco hacia donde apunta el mouse | **Nuevo** — solo «Completo» |
| Luces y ola | las luces del fondo derivan y una ola suave corre sobre el líquido | **Bucle: prohibido por ADR-0136** — solo «Completo» |

Todo se apaga con `prefers-reduced-motion`.

- **A favor:** es la que se siente distinta y de marca premium; la foto es protagonista; el color elegido tiñe toda la hoja.
- **En contra, y son reales:**
  1. **Se aparta de dos reglas escritas:** ADR-0169 («nada de sombras ni gradientes», el vidrio necesita ambos) y ADR-0136 (sin
     bucle ni decorativo). Construirla exige que Felipe apruebe una **excepción nueva** (como las de ADR-0301 y ADR-0322), con
     alcance limitado a esta hoja.
  2. **En celular es la que menos foto deja ver** (el panel de vidrio tapa la mitad de abajo).
  3. `backdrop-filter` + `mask-composite` + `@property`: probada solo en Chromium (ver «Qué no se verificó»); sin soporte cae a un
     panel opaco legible, pero no a esta materia.
  4. Es la más cara de construir y de mantener (efectos propios que ningún otro modal comparte).
  5. Contraste: el texto secundario sobre vidrio va en tinta al 78 %, no al 60 % de siempre, para pasar AA sobre una foto oscura.

---

## Lo que recomiendo, y por qué

**A.** Es la única de las tres que responde las **tres quejas con piezas que el ERP ya tiene** (`Modal`, `pie-hoja-fijo`,
`EnlaceEtiquetas`, el mismo modelo de matriz de Editar producto), y la única que sigue entregando el **panorama completo** cuando la
prenda tiene 45 variantes: con B hay que recorrer nueve colores para saber qué talla falta. El modal de la Grilla es de consulta
rápida —abrir, mirar, imprimir una etiqueta, cerrar—, y ahí gana quien muestra todo de una vez.

De B rescataría una sola idea y para otra pantalla: la **foto a todo el alto** (`lateral`) si algún día la vista rápida deja de ser
solo consulta. **C la dejaría como decisión de marca separada**: si a Felipe le gusta el vidrio, vale más como lenguaje para una
pantalla de entrada (el Observatorio del Admin, el cartel del club) que como la forma de un modal de uso diario en el piso con un
celular de 390 px.

## Qué falta decidir (para Felipe)

1. **¿Cuál construir?** — o A con la foto a todo alto de B.
2. **Si C: ¿se aprueba una excepción de marca?** (ADR-0169 + ADR-0136), con qué alcance, y si los bucles de «Completo» entran o
   solo la versión «Sobrio».
3. **¿La vista rápida muestra «+35 en otras sedes»?** Cuesta pasar `existencias` al modal, pero deja de leer la tabla `stock` cruda
   (hallazgo #1 de `docs/pantallas/productos.md`).
4. **Etiquetas con varias variantes elegidas (A):** `urlEtiquetasDePrecio` acepta la lista, pero **no verifiqué qué hace la pantalla
   de Etiquetas con una variante de la lista que tiene 0 unidades** (¿la omite? ¿falla todo?). A confirmar antes de construir.
5. **La ✕:** hoy el modal no la tiene (Esc o clic en el velo). Las tres la traen; en celular es la única forma visible de cerrar.

## Lo que esto NO cambia

- Ninguna regla de negocio: etiquetas siguen pidiendo unidades en la sede, «Eliminar» sigue abriendo `EliminarProductoModal`
  (la base dice si se puede borrar o solo descontinuar), «Ver en Existencias» sigue abriendo en el color que se está mirando
  (`hrefEnExistencias`).
- No toca la **ficha de variantes de la Tabla** (`FichaVariantes`, `ProductosTabla.tsx:652`): esa ya lleva swatch y no esconde
  botones porque vive en la página. Si A se construye, esa ficha podría adoptar la misma matriz después, para que Grilla y Tabla
  terminen siendo el mismo componente — decisión aparte.
- Guía de foco (ADR-0284): la vista rápida es de **consulta**, sin campos que llenar; `components/ProductosGrilla.tsx` está en
  `PENDIENTE` en `lib/guia-de-foco-pantallas.ts` («un solo control: candidato a no-aplica»). Los pasos «1 Color / 2 Talla» de B son
  orientación de lectura, no una guía de campos. Al implementar hay que correr `/focus` igual.

## Cómo verlas

```bash
# desde la raíz del repo (config «maquetas» de .claude/launch.json: python3 -m http.server en docs/maquetas)
python3 -m http.server 8791 --directory docs/maquetas
# abrir http://localhost:8791/catalogo-modal-producto-2026-10/index.html
```

`index.html` junta las tres con pestañas (atajos **1 · 2 · 3**). `a-matriz.html`, `b-color-primero.html` y `c-cristal.html` son las
mismas tres sueltas. Se pueden abrir con doble clic, pero necesitan red (Google Fonts y las fotos de muestra). Arriba de cada una
hay una barra punteada (no es parte de la pantalla): los **4 casos de datos**, **Sin foto / Con foto de muestra**, **Escritorio /
Celular 390**, y **↻ Reabrir** para ver la entrada del modal otra vez; C suma **Completo / Sobrio**. El estado viaja en el hash de
la URL de una maqueta a la otra.

Archivos compartidos: `_base.css` (tokens de `globals.css`, y la entrada/cascada/salida de ADR-0136 tal cual) y `_datos.js` (datos de
ejemplo, íconos, barra de la maqueta).

## Sobre los datos y lo que no se verificó

- **Todo es inventado** salvo el nombre y el código de la captura. En ella el nombre sale «Patalón Nuki» (falta la n); las maquetas
  lo escriben bien («Pantalón Nuki»). Los hex de color salen de la captura.
- Las **fotos de muestra** son pantalones cualquiera de Unsplash —no son del producto— y solo algunos colores tienen foto, a
  propósito, para ver también el mosaico de respaldo (ADR-0333) lado a lado.
- **Verificado** en el navegador del panel (Chromium) a 1440×900, 1366×768 y 390 de ancho, con los cuatro casos de datos y
  con y sin foto; sin errores de consola.
- **No verificado:** Safari y Firefox (C depende de `backdrop-filter`, `mask-composite` y `@property`); lector de pantalla;
  rendimiento de C en un equipo modesto (el desenfoque de 26 px sobre una foto es lo más caro). Antes de construir C, probar en
  la tablet de la sede.
