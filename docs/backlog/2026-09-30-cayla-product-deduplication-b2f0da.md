## Nuevo producto: alerta de «prendas parecidas» (2026-09-30, ADR-0294) — Fase 1, solo web, sin migración y sin tocar producción; rama `claude/cayla-product-deduplication-b2f0da` (PR abierto)

Qué es: que agregar un producto no cree la misma prenda dos veces con nombres distintos. «Mismo producto» es **mismo diseño** (Felipe): el sistema avisa y ordena, la persona decide mirando foto y stock.
Evidencia: `docs/investigacion/2026-09-29-duplicados-de-producto.md` (la sección 0 manda; 0.4 dice qué se construyó). Especificación visual aprobada: `docs/maquetas/producto-buscar-primero-2026-09/`.

### Hecho (Fase 1)

- [x] Reglas puras de comparación, léxico y fixtures: `apps/web/lib/parecidas-alta-tipos.ts`, `parecidas-alta-reglas.ts`, `parecidas-lexico.ts`, `parecidas-alta-fixtures/` (con pruebas).
- [x] Lectura de lo que ya existe, sin precio ni costo: `lib/candidatas-alta-datos.ts`, `candidatas-alta-lector.ts`, `useCandidatasAlta.ts`. Usa `fn_productos`, la tabla `productos`, `fn_existencias_productos`, `fn_producto_origen`, `fn_temporadas`, `ubicaciones`, `variantes` y `producto_fotos`.
- [x] Vista pura (todos los textos) y pegamento con el candado: `lib/parecidas-alta-vista.ts`, `parecidas-alta-estado.ts`, `useParecidasAlta.ts`.
- [x] Pantalla: `components/alta-producto/{AlertaParecidas,TarjetaParecida,HojaParecidas,TiraParecidas,ParecidasDelAlta}.tsx` y `app/estilos/alta-parecidas.css` (importado en `app/globals.css`).
- [x] Integración: `NuevoProductoForm.tsx` (Marca y proveedor arriba del Nombre, pie del paso 2, línea de «Avance»), `FichaPrevia.tsx` (prop opcional `parecidas`), `lib/alta-producto-guia.ts` (la marca antes del nombre, con su prueba) y la frase de «una letra» en `lib/alta-producto.ts`.
- [x] Guía de foco: `HojaParecidas.tsx` declarada `no-aplica` en `lib/guia-de-foco-pantallas.ts`; `/productos/nuevo` sigue `aplicada`; `MODALES_PENDIENTES_HOY` no cambia. `node scripts/focus/escanear.mjs` (2026-09-30): 1 pantalla y 1 modal, 0 sin guía. `node scripts/sugerir/escanear.mjs`: 0 ejemplos estáticos por revisar.
- [x] Revisión final (2026-09-30): pruebas de todo `apps/web` en verde (vitest completo), `tsc --noEmit` limpio en `apps/web`, `packages/database` y `packages/shared`, eslint limpio sobre los archivos del trabajo. Se corrigieron: `reglas-sin-uso` (`codigoDeMarca` y `tramoDeCodigo` ahora las usan la hoja y la descripción), la hoja que reaparecía sola tras un corte de red, «Ninguna es mi prenda» con una búsqueda activa (solo marca lo que se ve), «Crear producto» fijo abajo del resumen, el aviso ámbar de «una letra» bajo Nombre, el conteo de la tira del celular, el nombre reservado «Prenda sin Registrar», `reintentar()` tras un rechazo, un nombre sin letras ni números (`problemasAlta` y la guía) y `nombreEnCola` (misma clave que la base).

### Por hacer antes del commit

- [x] ~~Borrar `apps/web/app/auth/`~~ (páginas de prueba temporales): borrado en la revisión final, junto con `apps/web/.env.local` y `apps/web/.next`. No van al commit.
- [x] ~~`lib/reglas-sin-uso.test.ts` falla~~ por `codigoDeMarca` y `tramoDeCodigo`: conectadas en la revisión final.
- [x] ~~Numerar el ADR al subir~~: el 0293 ya lo había tomado otro PR; renumerado al **0294** (2026-09-30).
- [ ] Repetir `pnpm datos:comparar` (la pantalla llama a `fn_productos`, `fn_existencias_productos` y `fn_producto_origen`; antes de la integración avisó que `fn_existencias_productos` no está en la foto del 2026-09-28, aunque la función existe en producción: verificado en vivo el 2026-09-30).
- [ ] Commit con Conventional Commits, por ejemplo `feat(productos): alerta de prendas parecidas en Nuevo producto (ADR-0294)`.

### Por verificar (nadie lo ha visto con una cuenta real)

- [ ] `/productos/nuevo` con una cuenta real: Jeans, marca Jirish; el resumen dice que ya hay prendas de esa marca; «Ver y comparar» muestra foto o «Sin foto todavía», colores, tallas, «Disponibles» por sede y «Cargada en …» **sin precios ni costos**; teclear «Wide Leg Corto» sube «Wide Leg Corto Comfo» y el campo Nombre no se mueve.
- [ ] La lectura real de `fn_productos`, `fn_producto_origen` y `fn_existencias_productos` (la página de prueba usó respuestas de ejemplo). `producto_origen` tenía el 2026-09-30 (consulta de solo lectura) 11 filas para 12 productos; la prenda que no tiene fila dice solo «hace X h».
- [ ] La casilla de respaldo (`AvisoParecidos`) cuando la lectura falla, y «Crear» con un nombre idéntico y con «una letra» (Polo G44 sobre Polo G45).
- [ ] «Crear otro parecido» con la lista que trae la base: el código vacía nombre y descripción y llama a `reiniciar()` (`NuevoProductoForm.tsx`, `otroParecido`); falta verlo funcionando, y que la lista de la marca no traiga la prenda recién creada hasta releer.
- [ ] Capturas a 375 px y a 1280, 1440 y 1920 px, comparadas con la maqueta; y la tira de celular y tablet sobre la barra de abajo.
- [ ] El pulso de entrada y `prefers-reduced-motion` en un sistema real; el anuncio de un lector de pantalla; Safari de una tablet de tienda; el peso de la lectura en una tablet.

### Por decidir (Felipe)

- [ ] **«Polo G45» sobre «Polo G44»:** en la Fase 1 «Crear» espera la respuesta «No, es otro diseño», porque la base lo rechaza. La maqueta decía que no frenaba; solo será así con la fase 2b. `CASI_IGUAL_FRENA_EN_BASE` (`lib/parecidas-alta-estado.ts`) lo apaga.
- [ ] ¿«Revisa: N parecidas · Ver» se repite junto a «Crear producto» en el paso 4? Hoy solo sale en el paso 2.
- [x] «Crear producto» en escritorio: resuelto. El resumen corre por su cuenta y «Cancelar / Crear producto / Siguiente» quedan fijos abajo (se ve a 900, 800 y 720 px). Queda ¿dos filas en la alerta o tres?
- [ ] Pedir la foto al crear (punto 8 de «Falta confirmar»): sin foto no se compara el diseño a la vista.
- [ ] Qué otras marcas cuentan como comodín además de «Importado» (hoy se reconoce por nombre en `NOMBRES_COMODIN_DE_MARCA`).
- [x] ~~Aviso ámbar bajo Nombre para «una letra»~~: hecho en la revisión final (con «Ver y comparar»; sale solo si «Crear» espera esa respuesta y no hay un idéntico).
- [ ] **La pista de color de la maqueta (`#color`, «“Negra” es un color y se elige en el paso 3. ¿La quito del nombre?») no está construida.** El README la daba por conservada. Hace falta la lista de colores del catálogo y una línea bajo Nombre; ¿entra en la Fase 1 o se corrige el README?
- [ ] **Sin marca, ¿la alerta también avisa de una prenda parecida de la categoría?** Hoy sin marca solo frena el idéntico y ofrece «Ver las de {categoría}» (como `#sinmarca`); con marca sí sube un ámbar «Se parece a…». La decisión 7 dice que sin marca «compara contra las de la categoría»: ¿ordenar y ofrecer la lista (hoy) o también avisar en ámbar?
- [ ] Al elegir la marca, la línea «Puse a … como proveedor» (de `ElegirMarcaProveedor`) empuja el Nombre unos 15 px hacia abajo, y la maqueta prometía que no crecía. Reservar su alto (celda de grid, como `LineasPago`) o dejarlo.
- [ ] «Disponibles» en la hoja sale en orden alfabético de sede (AQP, LIM, TRU, Taller) y no empieza por la sede de quien crea; en celular no hay tira cuando «no hay prendas de X en Y todavía».
- [ ] Los botones «Ver» y «Crear» de la barra de abajo del celular miden 35 px de alto (mínimo táctil: 44). Es anterior a este trabajo (`FichaPrevia.tsx`).
- [ ] **«Prenda sin Registrar»** (el producto de las ventas, sin categoría): la pantalla reserva el nombre (`NOMBRES_RESERVADOS` en `lib/parecidas-alta-estado.ts`) porque `buscar_productos_parecidos` no lo ve (su `join categorias` lo deja fuera) y el índice único sí lo cuenta. El arreglo de fondo es el `left join categorias` de la fase 2b; ahí se retira la reserva.
- [ ] Anteriores a este trabajo y sin tocar: la guía no tiene campo «variantes» (con todas las filas de la tabla desmarcadas `problemasAlta` bloquea y «Sigue aquí» calla; `lib/alta-producto-guia.ts`).

### Fases posteriores (cada una necesita el OK de Felipe; las que tocan producción, SQL pegado por él, partiendo de `pg_get_functiondef`)

- [ ] **2a. Sumar variantes y unidades en un solo gesto** (D2, opción 2). Función nueva que escribe stock (`sumar_variantes_a_producto`), con `fn_actor_persona_id(true)` y `ComboResponsable`. Hoy «Es el mismo diseño» abre `/productos/<id>/editar` y las unidades se registran en Recibir.
- [ ] **2b. Cerrar la carrera entre sedes y quitar el bloqueo «una letra».** `crear_producto_con_variantes`: capturar `unique_violation` y responder `nombre_duplicado` con el id del ganador; `left join categorias` en la comprobación; después apagar `CASI_IGUAL_FRENA_EN_BASE`. Residual de hoy: un 23505 por carrera no trae pista y no reabre el paso 2.
- [ ] **2c. Nombre único por marca** (D1, decidida). `productos_referencia_clave_unica` pasa a `(marca_id, clave)` con `NULLS NOT DISTINCT`; toca una tabla en uso: en PARTES (ADR-0195). Hasta entonces la base rechaza el mismo nombre aunque sea de otra marca.
- [ ] **3. Registro de decisiones en modo sombra.** Tabla de solo agregar (`decisiones_parecido`, RLS sin políticas); incluye si se abrió «Ver y comparar». Con eso se fija el corte provisional 0,48 y se decide si la alerta necesita ser más visible.
- [ ] **4. Conteo** (D7): `censo_crear_variante` con `fn_ve_modulo('conteos')` y el mismo buscador compacto en `components/conteo/AltaAlVuelo.tsx`. Coordinar con la sesión del Conteo (`Benja-responsive`).
- [ ] **4. Cola sin conexión:** «Es el mismo diseño» en vez de solo «Descartar». (`nombreEnCola` de `lib/cola-offline.ts` ya usa la clave de la base.)
- [ ] **5. Solo si hace falta:** `productos.codigo_marca` (el código ya se lee del texto), herramienta de fusión (molde `unir_clientas`) y retirar `catalogo_crear_producto`.
- [ ] Descartado por ahora (Felipe): limpieza del vocabulario (tejidos, patrones) y renombrar etiquetas.
