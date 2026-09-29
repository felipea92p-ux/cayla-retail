# ADR-0283 — Un producto puede crearse sin marca y/o sin proveedor, y se completa después

**Fecha:** 2026-09-29
**Estado:** Construido y verificado contra el Postgres local (19/19 casos de `pnpm pruebas:producto-sin-marca`, 242 archivos de pruebas web verdes, recorrido en el
navegador de punta a punta: crear sin marca → chip → filtro → editar y completar). **Migración `20260930020000` EN PRODUCCIÓN desde el 2026-09-29** (Felipe dio el «dale»;
se aplicó por MCP como `producto_sin_marca_ni_proveedor`, con **ensayo previo que se revirtió solo** —la migración entera terminada en un `raise exception` deliberado— y
después verificada por efectos: `marca_id` y `proveedor_id` en `YES`; `fn_validar_marca_proveedor` sin `marca_obligatoria`, `md5(prosrc)` idéntico al del local
(`8d66f9e4…`), `anon` no / `authenticated` sí, una sola firma; el filtro del uuid nulo en `fn_productos` y `fn_productos_resumen` sin rastro del filtro viejo; llave
compuesta aún `MATCH SIMPLE`; los 9 productos intactos). Quedó **antes que la web**, como debe: la web de producción (sin este cambio) sigue exigiendo la pareja y no se
rompe. La fila que `apply_migration` dejó en el historial lleva la hora de aplicar, no `20260930020000`: para saber si está, comprobar el efecto (columnas), no el nombre.
La **web todavía no está desplegada** (rama sin commit al aplicar).
**Decide:** Felipe, 2026-09-29: «hay ocasiones en que por temas de proceso no se envía o no se registra a tiempo la marca, pero los productos están en almacén y
deben registrarse; que se pueda agregar después». Y, sobre marca y proveedor: «puede ser por separado; que al elegir la marca salgan sus proveedores, y al
elegir el proveedor, las marcas que maneja; si es una sola, que se ponga sola».
**Afecta:** `supabase/migrations/20260930020000_producto_sin_marca_ni_proveedor.sql` (quita `NOT NULL` de `productos.marca_id` y `proveedor_id`, relaja
`fn_validar_marca_proveedor`, parcha el filtro de `fn_productos` y `fn_productos_resumen`), `apps/web/components/alta-producto/ElegirMarcaProveedor.tsx`
(reescrito: dos campos), `NuevoProductoForm.tsx`, `ProductoForm.tsx`, `ProductoCreado.tsx`, `MarcaProveedorLinea.tsx` (nuevo), `FiltrosProductos.tsx`,
`ProductosGrilla.tsx`, `ProductosTabla.tsx`, `AQuienPedirle.tsx`, `productos/marcas/page.tsx`, `lib/marca-proveedor-reglas.ts`, `lib/marcas.ts`,
`lib/catalogo-v2.ts`, `lib/alta-producto.ts`, `lib/producto-cambios-reglas.ts`, `packages/database/src/types.ts`, `scripts/pruebas/producto_sin_marca_ni_proveedor.mjs`
(sumada al CI). **No toca** el censo de Conteo (`AltaAlVuelo.tsx`): ver «Lo que queda».

## Contexto

Desde el 2026-09-18 (ADR-0109) todo producto **exigía** marca y proveedor: `productos.marca_id` y `proveedor_id` eran `NOT NULL`, atados por una llave compuesta a
la tabla de parejas `marca_proveedores`. La razón era buena: de esa pareja sale «A quién pedirle» y el filtro por marca.

Pero la mercadería no espera al papeleo. Llega a almacén antes de que alguien registre de qué marca es o quién la trajo, y el sistema no la dejaba entrar. Las
dos salidas que quedaban eran malas: **no registrar la prenda** (y entonces no existe en el sistema, no se vende ni se cuenta), o **inventar una marca** para salir
del paso —«CAYLA» hace de comodín hoy: el producto centinela «Prenda sin registrar» vive bajo CAYLA / CAYLA SAC (`20260923161700`)—, que ensucia la marca propia y
sus cifras. El análisis de Marcas de esa mañana (`docs/pantallas/productos-marcas.md`, tarea #1) ya lo había visto para la carga del censo de TRU.

**Este ADR reabre a propósito lo que ADR-0109 y ADR-0217 cerraron:** ADR-0217 dice que aflojar `marca_id` «abre el estado imposible “producto sin marca” que
ADR-0109 cerró». Ya no es un estado imposible: es un estado **transitorio válido**, con dueño (quien registra) y salida (completarlo). El estado que sigue siendo
imposible es otro: **una pareja que nadie registró**.

## Decisión

**DECIDÍ:** marca y proveedor pasan a ser opcionales y **independientes**, con vacío **real** (`NULL`), no una marca comodín.

- **Base.** `marca_id` y `proveedor_id` admiten `NULL`. No hace falta un candado nuevo: la llave compuesta `productos_marca_proveedor_fk` es `MATCH SIMPLE`
  (verificado en producción: `confmatchtype = 's'`), o sea que con un `NULL` en cualquiera de las dos columnas no se comprueba y con las dos llenas sí. Es
  exactamente la regla que se quiere: marca sola y proveedor solo son válidos; **una pareja no registrada sigue siendo imposible**, aun con un `INSERT` directo
  (probado: `23503`). Las llaves simples siguen exigiendo que lo que se ponga exista.
- **Una sola regla.** `fn_validar_marca_proveedor` ya la llamaban las cuatro puertas (`crear_producto_con_variantes`, `crear_producto_con_stock_inicial`,
  `censo_crear_variante`, `catalogo_actualizar_producto`); se relajó ella y **no se reescribió ninguna de las cuatro** (su versión viva no es la de ningún archivo).
  Ahora: cada uno puede faltar; el que venga debe estar activo; si vienen los dos, deben ser pareja.
- **Completar después = editar.** `catalogo_actualizar_producto` ya conservaba `coalesce(p_marca_id, marca_id)` (mandar nada = no tocar). Se dejó así a
  propósito: es la regla **«no empeora»** que ya rige para tejido y patrón. Lo guardado se **cambia por otra cosa**, no se deja en blanco (la base tampoco lo
  permite); lo que faltaba se completa cuando se sepa. Todo cambio deja rastro (`historial_producto_cambios`, con «antes» vacío).
- **El selector.** Deja de ser «un buscador de parejas» (spike v2) y son **dos campos**, Marca y Proveedor, cada uno filtrando al otro: elegir la marca deja en el
  proveedor solo a quienes la traen; elegir el proveedor, solo las marcas que trae; **si queda un solo candidato, se pone solo** y una línea lo dice («Puse a
  CAYLA SAC como proveedor: es el único que trae CAYLA»); si lo ya elegido no es compatible con lo nuevo, se suelta y también se dice. Con varios candidatos no se
  elige ninguno: es de la persona. Las reglas viven en `marca-proveedor-reglas.ts` (puras, probadas).
- **Que no se olvide.** Un chip ámbar «Sin marca ni proveedor» / «Sin marca» / «Sin proveedor» en la tarjeta y la tabla de Productos; opciones «Sin marca» y «Sin
  proveedor» en sus filtros (`?marca=sin`, que a la base llega como el uuid nulo); y al terminar el alta, una línea que dice qué falta y a dónde ir.
- **«A quién pedirle».** Un producto por reponer **sin proveedor no desaparece del radar**: sale como fila «Sin proveedor · N» al final de la lista. Sin esto,
  el efecto real de este cambio habría sido esconder productos que hay que reponer.

**DESCARTÉ:**
- *Marca comodín «Por identificar» (y su proveedor).* Ganas: cero cambios de esquema, y la pantalla Marcas hace de cola. Pagas: un **proveedor falso** en Compras y en
  «A quién pedirle»; alguien lo elegiría por comodidad aunque sepa la marca; y la etiqueta de precio imprimiría «Por identificar» a la clienta (ADR-0281) salvo una
  excepción más. El comodín no elimina el caso especial: lo reparte por cuatro pantallas. (El análisis de Marcas de esta mañana recomendaba el comodín para el
  censo; se cambia de opinión porque el pedido de Felipe es más amplio —cualquier producto que llega sin papeles— y porque «no sabemos» no es una marca.)
- *«Ambos o ninguno» con un candado `CHECK ((marca_id is null) = (proveedor_id is null))`.* Era mi recomendación (la pareja es una sola cosa en el sistema).
  Felipe eligió por separado, con el selector inteligente: llega mercadería con proveedor conocido y marca sin registrar (o al revés), y guardar lo que se sabe
  es mejor que guardar nada. Costo aceptado: el estado «marca sin proveedor» / «proveedor sin marca» existe, y cada consumidor tiene que tolerar los dos vacíos.
- *Permitir vaciar lo ya guardado en Editar.* Ganas: corregir un dato mal puesto sin inventar otro. Pagas: cambiar la semántica de `p_marca_id = null` («no
  tocar») en `catalogo_actualizar_producto`, que otras sesiones parchean por anclas, para un caso raro; mientras tanto, cambiarlo por el correcto siempre se puede.
- *Un parámetro nuevo `p_sin_marca` en `fn_productos`.* Ganas: legible. Pagas: una firma nueva obliga a `drop` + `create` de una función que ADR-0270 está
  reescribiendo. Se usó el uuid nulo (`00000000-…`), que `gen_random_uuid()` nunca genera: dos líneas parcheadas con ancla, misma firma.

**SE ROMPE SI:**
- alguien confía en que «todo producto tiene marca» al agrupar o reportar: cualquier consulta nueva por marca o proveedor tiene que decidir qué hacer con `NULL`
  (los `left join` de hoy ya lo toleran; un `inner join marcas` **descartaría en silencio** los productos sin marca);
- los productos sin marca se acumulan y nadie los completa: por eso el chip, el filtro y la línea del alta. El día que «Sin marca» pase de decenas, hay que
  volverlo una alerta en Inicio;
- «A quién pedirle» se lee como lista de proveedores reales: la fila «Sin proveedor» **no lo es** (no suma al «N proveedores»);
- se despliega la web antes que la migración y alguien crea un producto sin marca: la base vieja respondería «Elige la marca del producto» (falla con un mensaje claro,
  no con datos a medias). Por eso el orden fue **migración primero, web después** (ya cumplido); al revés no rompe nada (la web vieja sigue pidiendo la pareja).

## Lo que queda

- **El censo de Conteo (`AltaAlVuelo.tsx`) sigue exigiendo marca y proveedor.** Es el punto donde más pega (el censo de TRU entra por lotes y una prenda de marca
  desconocida se detiene), pero ese archivo lo está reescribiendo la sesión del Conteo (ADR-0282) y tocarlo ahora choca. El cambio es de tres líneas: quitar su
  validación `!marcaId || !proveedorId` (línea 83), mandar `p_marca_id: marcaId || undefined` y pasar `opcional` al selector. La base ya lo acepta
  (`censo_crear_variante` llama a la misma función relajada).
- **Refrescar el diccionario** (`pnpm datos:generar:produccion`) cuando la migración esté en producción, para que `productos.marca_id` deje de figurar `NOT NULL`.
- ~~Pegar la migración en producción~~ **Hecho el 2026-09-29** (ver «Estado»). Falta desplegar la web (commit → PR → merge; en este repo fusionar a `main` es publicar).

## Verificación

- `pnpm pruebas:producto-sin-marca` **19/19** (Postgres local, cada caso en su transacción con `rollback`): alta sin nada / solo marca / solo proveedor / pareja;
  pareja no registrada rechazada con su hint; marca o proveedor desactivados rechazados; `INSERT` directo con pareja inválida frenado por la llave (`23503`);
  editar completa lo que falta, mandar nada no borra, un proveedor que no trae la marca se rechaza, y el rastro sale con «antes» vacío; el filtro `sin`
  (lista y resumen); la migración se pega dos veces.
- `apps/web`: 242 archivos de pruebas, 153 034 casos verdes; `tsc` y `eslint` limpios. Nuevas: `alElegirMarca`/`alElegirProveedor` (sola, soltar, varios candidatos,
  quitar), opciones recortadas, `problemaAlEditar`, `textoLoQueFalta`, `filtroDeMarcaOProveedor`, reposición con «Sin proveedor». Se borraron `opcionesDeParejas`,
  `cuantasMarcas`, `valorPareja` y `separarPareja` (el candado `reglas-sin-uso` las marcó al dejar de usarse).
- Navegador (local, 1440 px y 375 px): crear «Cinturón» sin marca ni proveedor → «Todo listo para crear» → pantalla de éxito con la línea «Sin marca ni proveedor:
  cuando los tengas, complétalos en Editar el producto» → Productos con `?marca=sin` muestra solo ese producto con el chip → Editar: elegir CAYLA pone sola a CAYLA SAC
  con su línea, la hoja «Revisa y guarda» dice «(sin marca ni proveedor) → CAYLA · CAYLA SAC», y la base queda con los dos y dos filas de historial. Un producto que
  ya tiene marca no ofrece «Quitar». **No verificado:** varios proveedores por marca en el navegador (el local tiene una sola marca; cubierto por las pruebas puras),
  ni contra producción.
- **Vecinas que fallan en el local compartido, con y sin esta migración** (comprobado devolviendo la base a antes de mi cambio y repitiendo): `pruebas:corregir-variantes`
  (al local le falta el índice `variantes_identidad_unica` de la migración `20260929045000`, de otra sesión) y `pruebas:edicion-simultanea` («Ese patrón no está habilitado
  para la categoría elegida», un dato del seed). No son de este cambio. Sí pasan las que tocan lo mismo que esta migración: `alta-con-stock-inicial` 28/28,
  `catalogo-cifra-unica` 14/14, `productos-orden` 13/13, `editar-marca` 23/23, `eliminar-marca` 21/21, `productos-estado-en-bloque` 16/16, `productos-alertas-de-stock`.
