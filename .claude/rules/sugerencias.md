---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/lib/sugerencias-*"
  - "apps/web/lib/sugerir-*"
  - "apps/web/lib/atributo-parecido*"
  - "scripts/sugerir/**"
---

## Sugerencias coherentes: el ejemplo sigue lo que la persona eligió (regla — ADR-0290, Felipe 2026-09-30)

**Todo ejemplo o texto de ayuda que la persona lee en un campo (placeholder, «Ej. …», chips y listas sugeridas) tiene que ser
coherente con lo que ya eligió antes. Es OBLIGATORIO en toda interfaz nueva o editada.** Nació de Nuevo producto: con «Casacas» elegida,
la caja de nombre decía «Blusa Aurora» y la de descripción «Manga globo…». Un ejemplo es una afirmación sobre lo que la persona está
haciendo; uno equivocado es peor que uno genérico. Cómo se hace bien:
1. **Lógica pura en `lib/sugerencias-<pantalla>.ts`, con su prueba** (modelo: `lib/sugerencias-alta-producto.ts`): el componente solo la
   llama (`placeholder={sugerirNombre(ctx).texto}`), no decide dentro del JSX. Fuente, en este orden: la categoría (por
   `categorias.prefijo`, **nunca por el nombre visible**, que se renombra), la familia (`familias.codigo`, con un texto neutro de su
   vocabulario) y, si no hay contexto, un texto que no promete nada. Lo que un Líder crea sin deploy cae al neutro, **nunca al ejemplo de otra
   familia**.
2. **La prueba recorre TODOS los valores del control** y exige: totalidad, sin contradicción entre categorías, neutro sin contexto,
   que siga al control (A→B→A) y que sea estable (sin azar, sin red).
3. **Colores y valores nuevos evitan lo que ya existe** (sinónimos incluidos): un ejemplo que ya está en el catálogo lleva a un «ya existe».
   Nombre y descripción salen de una tabla curada, no de un producto real (un dato real invita a copiarlo).
4. **Cabe a 375 px:** un placeholder que no cabe se corta a media palabra (`MAX_DESCRIPCION`). Se prueba en el navegador.
5. **Si de verdad no depende de nada elegido antes** (el formato de un RUC, un #hex), se marca en su línea:
   `// sugerir-fijo: <por qué>` (10 caracteres mínimo). El motivo vive junto al código.

**Cómo se hace cumplir:** `lib/sugerir.test.ts` (con el escáner `scripts/sugerir/escanear.mjs` como única definición de «ejemplo
estático») falla si un archivo de `components/` o `app/(app)/` tiene un ejemplo escrito a mano que ni está derivado ni marcado
`sugerir-fijo`. **Un archivo nuevo no puede entrar a `lib/sugerir-archivos.ts`**: esa lista es la deuda de antes de la regla
(`PENDIENTES_HOY`, cuenta exacta: solo baja, y un archivo listado que ya no tiene el problema también falla). **`/sugerir` (skill) +
`pnpm sugerir`:** recorre lo que estás construyendo, mapea qué control decide qué caja, avisa, lo implementa y **prueba cada botón y
filtro en el navegador**; `pnpm sugerir --todo` es el tablero. Correla antes de dar por terminada cualquier pantalla o modal con campos.
Al terminar un archivo de la deuda: bórralo de la lista y baja `PENDIENTES_HOY`. Detalle y decisiones:
`docs/adr/0290-sugerencias-que-siguen-lo-que-la-persona-eligio.md`. Para verlo funcionando, con datos reales y tocable:
`docs/maquetas/sugerir-2026-09/index.html`.

## «Existe también»: antes de crear, se ve lo que ya existe (regla — ADR-0576, 2026-10-30)

**Todo formulario que crea un valor de un vocabulario (color, talla, tejido, patrón, familia, categoría, y el que venga) dice, mientras se escribe el
nombre, qué ya existe y por qué se parece.** Nació de «Verde Olivo» creado teniendo «Verde oliva»: la base solo frena el nombre idéntico, y una letra
(olivo/oliva, rayas/raya, rojo/roja) pasa. Es OBLIGATORIO en toda pantalla o modal nuevo que cree un valor. Cómo se hace bien:
1. **La regla es una sola** (`lib/atributo-parecido.ts`, sobre `nombresParecidos` de marcas y proveedores): `existentesParecidos(nombre, lista, { excluirId })`.
   Plural y femenino son el mismo nombre; los números cuentan («Talla 38» no es «Talla 40»); lo contenido no avisa («Azul» y «Azul rey» son dos colores);
   el tipeo de una letra solo desde 8 letras. **No escribas otra comparación de nombres.** Un color suma el tono: `coloresQueYaExisten`.
2. **La pieza es una sola:** `useExisteTambien` + `<ExisteTambien que="…">` (`components/ui/ExisteTambien.tsx`, sobre `PreguntaParecido`). Tres niveles que decide el
   motivo: **frena** (mismo nombre: la base lo rechaza), **pregunta** (casi igual o sinónimo: «Guardar» espera el «No, es otro») y **avisa** (solo el tono). El botón
   de guardar suma `existe.bloquea` y su `title` dice `faltaPorExistente(…)`; la guía de foco cuenta la pregunta sin contestar como lo que falta del Nombre.
3. **Al editar, solo si cambió el nombre**, y por nombre entran también los desactivados (la base rechaza un nombre que ya tuvo uno).
4. **Donde no hay un botón de guardar** (el valor se crea al tocar «+ Crear …» en un combo, como el tejido de Insumos ▸ Nueva tela), la pregunta sale ANTES de crear: queda pendiente hasta «Usar X» o «No, es otro» (modelo: `useTejidosDeLaTela`), y mientras siga sin contestar la hoja no se guarda (es un problema más de la validación de la hoja, no un candado aparte: guardar perdería el valor que la persona pidió). Lo que decide si «Guardar» espera es `preguntaPendiente`, función pura con su prueba: la respuesta «es otro» calla solo la pregunta, nunca el mismo nombre.
5. **Nunca un candado de la base para el «casi igual»**: Blanco y Crudo son dos colores. El candado es el nombre exacto. Una prueba nueva de vocabulario corre la carta
   oficial contra sí misma (`lib/atributo-parecido.test.ts`): si la regla grita sobre lo correcto, la gente aprende a ignorarla.
