# ADR-0197 — Nuevo producto en 4 pasos, y fotos que se suben al crear

**Fecha:** 2026-09-24
**Estado:** Aprobado por Felipe el 2026-09-24 («Implementemos esto y para editar también de ser necesario»).
**Afecta:** `apps/web/components/NuevoProductoForm.tsx`, `components/alta-producto/*` (nuevas: `ElegirColores`, `FotosAlta`,
`MatrizVariantes`, `FichaPrevia`; cambiadas: `ElegirMarcaProveedor`, `NuevaMarcaForm`, `ProductoCreado`, `piezas`),
`components/ui/ComboBuscable.tsx` (props opcionales `limite`, `crear`, `caja`), `lib/alta-producto.ts`.
**Sin migración.** Spike: `docs/maquetas/producto-nuevo-spike-2026-09/` (PR #392).
**Actualiza:** ADR-0109 (el alta como árbol de decisión). La lógica del ADR-0109 no cambia: cambia cómo se muestra, y se
suman las fotos.

## El problema

Felipe: «no se ve bien distribuido y confunde». Leído del código:

1. Eran siete tarjetas del mismo peso. Las cerradas también se veían, en gris y con texto.
2. «Nueva marca» mostraba los ~60 proveedores como botones, y «Más colores» mostraba todas las familias como botones.
   Cada una ocupaba media pantalla.
3. Las variantes eran casillas sueltas, sin la forma talla × color.
4. El resumen enumeraba todo lo que faltaba desde el primer segundo.
5. **Al crear un producto no se podían subir fotos.** Era a propósito: la galería de la edición sube cada archivo apenas
   se elige, y si la persona cancelaba el alta, el archivo quedaba huérfano en el almacén.

## Decisión

- **Cuatro pasos en acordeón**: Qué es · Quién es y cómo se llama · Cómo se hace · Precio y variantes. Solo uno está
  abierto. El terminado se pliega en una línea con «Cambiar». El paso 1 avanza solo al elegir la categoría; el 2 y el 3
  tienen «Seguir →», con lo que falta escrito al lado. Cada problema de `problemasAlta` cae en un paso
  (`pasoDeProblema`), así que el paso dice qué le falta sin repetir las reglas.
- **Nombre y marca van juntos**, en el paso 2. Antes el nombre recién se abría después de elegir la marca.
- **Nunca una lista entera de botones.** El proveedor y la marca se eligen con `ComboBuscable`: 6 o 7 resultados a la
  vista, y la opción «+ Registrar «…» como nuevo» al final de la lista. Los colores se muestran así: los 6 más usados,
  un buscador y «Ver los N colores», que abre una paleta de círculos. Los elegidos fuera de los frecuentes quedan en
  «También elegiste», con ×.
- **Variantes como tabla talla × color** (`MatrizVariantes`): clic en una celda la quita; clic en una fila o columna
  quita todo el color o toda la talla. «Poner un precio distinto» cambia las celdas por campos de precio. En celular la
  celda muestra solo ✓, y el precio aparece únicamente cuando es distinto.
- **La ficha de la prenda reemplaza al resumen** (`FichaPrevia`). Muestra código, nombre, colores, foto principal y
  precio, más UNA frase con el siguiente paso. En celular va en una barra pegada encima de la navegación de abajo.
- **Fotos por color en el paso 3** (`FotosAlta`): el archivo queda en el navegador, con una vista previa local
  (`blob:`), y se sube **después** de que `crear_producto_con_variantes` creó el producto. La principal es la primera
  del primer color (`ordenarFotosAlta`). Las filas de `producto_fotos` se insertan directo desde el navegador: la
  política `producto_fotos_write_lider` (`fn_puede_editar_catalogo`) es la misma que exige esta pantalla. Verificado
  en producción el 2026-09-24.

## Por qué así y no de otra forma

- **Subir después de crear, y no dentro de la transacción:** un archivo no puede ser parte de una transacción de
  Postgres. Si subiera antes, cancelar lo dejaría huérfano, que es el problema original. Si sube después y una foto
  falla, el producto ya existe (principio 9: se degrada, no se pierde) y la pantalla de éxito dice cuál falló y lleva
  a la galería de la edición.
- **Sin migración:** agregar `p_fotos` a `crear_producto_con_variantes` exigía cambiar el esquema de producción sin
  ganar nada, porque las URLs recién existen después de subir. La inserción directa ya estaba permitida.
- **La animación de entrada del paso no deja un `transform` puesto** (en vez de `anim-revelar`, que usa
  `fill-mode: both`). Si lo dejara, las listas `position: fixed` de adentro se medirían contra el paso y no contra la
  ventana, y abrirían lejos de su campo. Se encontró probándolo en el navegador.

## Lo que se rompería sin esto

Con 60 proveedores y 40 colores, el alta seguiría siendo una pantalla que se recorre con la rueda del mouse, y cada
producto seguiría necesitando una segunda visita para cargarle las fotos.

## Lo que queda abierto

- En este equipo no existe el almacén local de retail (`supabase_storage_cayla-retail` no está levantado), así que la
  subida exitosa no se vio en local. Sí se probó el camino de falla: el producto se crea, las fotos no suben, y la
  pantalla de éxito lo dice. **La primera prueba real con fotos es en producción.**
- La edición conserva su galería (`FotosProducto`). Cambió lo compartido: el selector de marca y proveedor, y
  «Nueva marca», también en el censo y en Catálogo ▸ Marcas.
