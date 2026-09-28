# Spike visual · Crear un color guiado, versión 2 (2026-09-28)

`crear-color-spike.html`: un solo archivo, se abre con doble clic en el navegador. Datos de ejemplo (25 colores, no los 72
reales); nada se guarda salvo lo que haces mientras la página está abierta. Enlace directo a un estado, para mandarle a
alguien «mira cómo se hace»: `crear-color-spike.html#pantalla=atributos&rol=lider&paso=3&guia=0`
(`pantalla` = `producto` o `atributos`; `rol` = `colaboradora` o `lider`; `paso` = 1 a 5; `guia=0` apaga la guía).

## De dónde viene

- **v1 (28-sep, en el chat):** una hoja de 3 pasos con una paleta de círculos y una barra de claridad.
- **Lo que dijo Felipe sobre la v1:** el selector de color que hoy abre «Nuevo color del vocabulario» en Atributos (el del
  navegador: recuadro flotante con cuadrado de degradado, barra de matiz, cifras RGB y un gotero de pantalla completa) le
  parece **invasivo**; quiere el tono «similar al gotero» —señalar y tomar—, pero sin eso. Y aclaró que el color **debe
  crearse en Catálogo ▸ Atributos y existir luego** ahí.
- **v2 (este spike):** el gotero vive **dentro de la hoja**, y la hoja es **la misma** en «Nuevo producto» y en «Atributos».

## Qué se ve

1. **Barra del spike (arriba, no es del producto):** cambia de pantalla, «Ver como» colaboradora o líder, salta al paso 1–5,
   prende la guía de primera vez y reinicia la demo.
2. **Nuevo producto.** El formulario denso conserva su letra chica (es lo que se quiere mantener). En «Colores», el
   buscador dice «Sin resultados» y ofrece **«+ Crear «petróleo» como color nuevo»** (la opción `crear` de `ComboBuscable`,
   que hoy usa el selector de proveedor). El aviso gris «Créalo en Catálogo → Atributos (otra pestaña)» desaparece. Al
   guardar: el color queda elegido («También elegiste», con «nuevo · por aprobar»), sale el aviso con «Verlo en Atributos»
   y el «Siguiente paso» de la ficha pasa a «Elige las etiquetas» (es un botón: te lleva y resalta la sección).
3. **La hoja «Nuevo color»** (`<Modal variante="hoja">`, con el movimiento de ADR-0136), tres pasos con letra grande:
   - **¿Cómo se llama?** Revisa que no exista: un nombre repetido detiene el paso y ofrece «Usar ese».
   - **Toma el color con el gotero.** Tres fuentes: **la foto de este producto** (la que ya se subió al formulario), una
     **carta de tonos**, o **«Subir o tomar foto»** (cámara en el celular). Tocas o arrastras; una **lupa con zoom de
     píxeles** muestra el punto exacto y su aro toma el color que se va a capturar; queda un pin donde tocaste. Se
     **promedia una zona**, no un píxel (una foto tiene grano y brillos). Arranca con el gotero ya puesto en el centro de
     la prenda («sugerido», círculo punteado). «− Más claro / Más oscuro +» corrigen lo que la luz de la foto cambió. Si el
     tono se ve casi igual que uno existente (ΔE2000 < 8, `lib/color-parecido.ts`) avisa y ofrece «Usar «Azul marino»»
     (desde Atributos dice «Ver»).
   - **Revisa y guarda.** Muestra **la tarjeta tal como quedará en Atributos** (con «Pendiente» si la crea una
     colaboradora), en qué familia va y con qué código. El código y la familia **se deducen**: `sugerirCodigoColor` (la
     misma regla de hoy) y la familia del color más cercano del vocabulario. «Más datos (opcional)» los deja editar y
     ahí van Pantone, sinónimos y notas. Lleva el combo **Responsable**, obligatorio (ADR-0161).
4. **Catálogo ▸ Atributos ▸ Colores.** «+ Agregar color» abre **la misma hoja**. La tarjeta nueva aparece en su familia,
   con «Pendiente» si la creó una colaboradora. **Ver como ▸ Líder:** ve «Aprobar / Rechazar / Editar», y lo que él crea
   queda aprobado (lo decide el trigger de la base, no la pantalla).
5. **Guía de primera vez** (5 pasos, el mismo velo con círculo del spike de Ayuda guiada): se apaga con «Terminar guía» o `Esc`.
6. **Teclado y accesibilidad:** el gotero se mueve con las flechas (Shift = salto grande); `Esc` cierra la lista, luego la
   hoja, luego la guía; el fondo queda inerte mientras la hoja está abierta y el foco no sale de ella.
7. **Celular (375 px):** la hoja sube desde el borde, la lupa aparece sobre el dedo y la guía pasa a una tarjeta fija arriba.

## Por qué el gotero de la hoja no es «invasivo» (frente al selector nativo)

| Selector nativo de hoy | Gotero de la hoja |
|---|---|
| Recuadro flotante que tapa el formulario | Vive dentro de la hoja, en una caja fija |
| Su gotero lee **cualquier píxel de la pantalla** (`EyeDropper`: solo Chrome/Edge de escritorio) | Lee **solo** la foto o la carta de esa caja |
| Cuadrado de saturación, barra de matiz y cifras RGB | Tocas la tela; sin cifras |
| Un píxel suelto | Promedio de una zona |
| Empieza vacío | Empieza en el centro de la prenda |
| Solo con mouse | También con flechas y con el dedo |
| No dice si ya existe uno parecido | Avisa con ΔE2000 y ofrece usar el existente |

## Decisiones tomadas en el spike (y por qué)

- **Una sola hoja para las dos pantallas**, como `NuevaMarcaForm` ya hace con las marcas («una sola forma de crear una
  marca, no dos»). El modal actual de Atributos («Nuevo color del vocabulario», con siete campos y el selector nativo) se
  reemplaza por esta hoja.
- **Es el mismo color del vocabulario, no uno «del producto»:** mismo `POST /api/productos/colores`, misma tabla, mismo
  trigger que decide `pendiente` o `aprobado`. No hay tabla ni columna nueva. El alta ya ofrece los colores pendientes
  (`alta-producto-datos.ts:72` solo filtra `activo`), así que se puede usar al instante.
- **De 5 datos a 2:** nombre y tono. Código y familia se deducen; Pantone, sinónimos y notas quedan en «Más datos».
- **El gotero es propio y contenido, no `EyeDropper`:** el nativo lee toda la pantalla, solo existe en navegadores de
  escritorio basados en Chrome y no sirve con la cámara del celular. El nuestro es un `<canvas>` con `getImageData`.
- **Responsable:** la hoja **hereda** el que se eligió en el formulario (hoy `ProponerValor` pide uno aparte). Es una
  propuesta, no una regla nueva: cada guardado sigue firmado.
- **Solo tokens de la paleta** (ADR-0169); los únicos colores «libres» son las muestras y las fotos, que son el dato.

## Cómo llevarlo al ERP (propuesta, si se aprueba)

- `components/catalogo/CrearColorHoja.tsx`: **una** pieza, usada por `ColoresLista` (reemplaza el modal actual) y por
  `ElegirColores` (opción `crear` del buscador + botón). Con `<Modal variante="hoja">` y `useResponsable`.
- `lib/gotero.ts`: `promedioDeZona`, `familiaDeHex` (la del color más cercano por ΔE2000) y la geometría de la lupa; puros,
  con pruebas. Se reutilizan `sugerirCodigoColor` y `coloresParecidos`.
- `NuevoProductoForm` pasa a la hoja las fotos que ya tiene en estado. `FichaPrevia`: «Siguiente paso» clicable.
- **ADR nuevo** que revierte `ProponerValor.tsx:29-31` («los colores no se proponen en el sitio»).
- **Sin migración.** A comprobar al construir: que `crear_producto_con_variantes` acepte un color pendiente (no se ve
  ningún candado de estado, pero no se probó).
- Verificación: pruebas de `lib/gotero.ts`, recorrido en el navegador a 1024 y 375 px, y una prueba con una foto real de tela.

## Preguntas abiertas para Felipe

1. **¿«Similar al gotero, pero no invasivo» es esto?** Gotero dentro de la hoja sobre la foto del producto, una carta o una
   foto propia (y no el gotero de pantalla completa).
2. **¿Puede una colaboradora crear un color** (queda pendiente hasta que un líder lo apruebe, como hoy permite la API) o
   solo *pedirlo*? Facilitarlo hará que lleguen más colores por aprobar.
3. **¿La hoja hereda el «Responsable»** del formulario o pide el suyo, como hoy?
4. **¿La guía de primera vez se ofrece sola** o solo cuando la piden? (es la pregunta 1 del spike de Ayuda guiada; esta guía
   sería una de las de ese motor).
5. **¿«Letra cómoda» (aumentar la letra por persona) va aparte?** Este spike no la incluye; sigue siendo la respuesta de
   raíz a «las letras pequeñas» (ADR-0012).

## Verificado

- **95 comprobaciones automáticas en un Chrome real** (con y sin movimiento reducido), sin errores de JavaScript: el camino
  feliz en las dos pantallas y con los dos roles, duplicados, código repetido, Pantone, teclado, paleta, guía de 5 pasos, los
  20 saltos de «Ir al paso» y los enlaces directos.
- **A 375 px no hay desborde horizontal en ningún estado** (7 estados medidos en el panel de vista previa).
- Capturas revisadas de cada paso a 1360 px.
- **Límites:** la foto del vestido es un dibujo, no una foto real (se puede probar con «Subir o tomar foto»); el vocabulario
  tiene 25 colores de ejemplo; solo se probó en Chrome (no en Safari ni Firefox); el color que da una foto depende de la
  luz y el gotero solo lo promedia: por eso quedan «Más claro / Más oscuro» y el aviso de parecido.
