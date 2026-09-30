---
name: sugerir
description: Hace que las sugerencias de la web (placeholders de las cajas de texto, «Ej. …», textos de ayuda, listas y chips sugeridos) digan algo coherente con lo que la persona ya eligió antes. Es OBLIGATORIA (CLAUDE.md «Sugerencias coherentes», ADR-0289). Recorre la pantalla o el modal, encuentra cada sugerencia escrita a mano, averigua qué botón, filtro o combo la debería decidir (categoría, familia, sede, medio de pago…), la adapta con lógica pura y probada contra todos los valores del control, y después prueba en el navegador cada control que la afecta, también a 375 px. Úsala cuando una sugerencia no calce con lo elegido (elegiste «Casacas» y el nombre sugiere «Blusa Aurora»), al construir o editar una pantalla o modal con campos que traen ejemplos, cuando `lib/sugerir.test.ts` falle, y cuando alguien diga «sugerir», «el ejemplo no tiene que ver» o «el placeholder está mal».
---

Adapta las sugerencias al contexto elegido en: $ARGUMENTS

**Regla madre:** una sugerencia es una afirmación sobre lo que la persona está haciendo. Si ya eligió «Casacas» y la caja de nombre le dice «Blusa Aurora», el sistema está diciendo algo falso. **Peor que un ejemplo genérico es un ejemplo equivocado.** Esta skill recorre → mapea → avisa → implementa → prueba cada control. No decide reglas de negocio ni cambia qué se puede guardar.

**Es obligatoria y se hace cumplir sola:** `lib/sugerir.test.ts` falla en el CI si un archivo nuevo trae un ejemplo escrito a mano que ni está derivado de la selección ni marcado `sugerir-fijo`. El modelo ya hecho, con todo lo que la skill enseña, es **Nuevo producto** (`lib/sugerencias-alta-producto.ts` y su prueba).

**Alcance según `$ARGUMENTS`:**
- *(vacío)* los archivos de UI tocados por tus cambios (la rama contra `origin/main` más lo sin commitear).
- una ruta (`/productos/nuevo`) o un archivo (`components/NuevoProductoForm.tsx`): solo eso y lo que esa pantalla alcanza.
- `todo` solo **informa** el tablero (hoy la deuda son los archivos de `lib/sugerir-archivos.ts`). No implementa: el módulo por el que se empieza lo elige Felipe.

## Paso 1 — Recorre (el escáner, y después tus ojos)

1. `git fetch origin main`, y después `pnpm sugerir` (o `--ruta <ruta>`, `--archivo <archivo>`, `--todo`). Lista por archivo cada **superficie**: un `placeholder`, un «Ej. …», una lista o prop `sugerencias`. Cada una sale como **ESTÁTICA** (literal en el JSX: dice lo mismo elijas lo que elijas), **derivada** (la calcula una expresión: probablemente ya reacciona) o **fijo** (marcada `sugerir-fijo` con su motivo), junto a los **estados de selección** del archivo (`categoriaId`, `familia`, `medio`…), que son las causas posibles.
2. **El escáner es por texto: no juzga, ayuda a no olvidarse.** Confirma leyendo el archivo:
   - Una estática sin ninguna causa en su archivo puede recibirla por props: sigue el import hasta el componente que sí sabe la selección.
   - Una «derivada» puede seguir estando mal (calcula desde el dato equivocado): léela.
   - Una lista con `sugerencias={false}` está **apagada a propósito** (ver «Paradas»).
   - Los placeholders que son una orden («Buscar…», «¿Por qué se anula?») o un número («0.00», «—») no son ejemplos y no cuentan. Un falso positivo (una frase que dice «por ejemplo» en un párrafo) se resuelve con `sugerir-fijo`, no agregando el archivo a la deuda.
3. Las superficies son de dos clases, y la segunda pide más cuidado:
   - **Pasivas:** placeholder, «Ej. …», texto de ayuda. Solo informan.
   - **Activas:** chips o lista que **rellenan al tocarlos**, autocompletado, un orden por relevancia (colores por uso). Escriben un valor.
4. Mira `docs/SESIONES-ACTIVAS.md`: si otra sesión toca los mismos archivos, **avísalo y no la pises** (en la primera corrida, `ProductoForm.tsx` estaba tomado por otra sesión y se dejó en la deuda a propósito).

## Paso 2 — Mapa de dependencias (la parte que se olvida)

Para cada superficie estática, escribe **qué control la debería decidir y con qué valores**. Sin esta tabla no se sabe qué probar en el Paso 6:

| Superficie (archivo:línea) | Qué la decide | Valores posibles | Hoy dice | Debería decir |
|---|---|---|---|---|
| Nombre (`NuevoProductoForm.tsx:762`) | categoría elegida en el paso 1 | cada categoría de `retail.categorias`, y «ninguna aún» | «Blusa Aurora» siempre | una prenda de esa categoría; neutro si no hay |
| Nombre del color (`NuevoColorAlta.tsx:164`) | la familia de color (elegida, o la que sale del tono) | las 9 de `FAMILIAS_COLOR`, y «ninguna aún» | «Palo de rosa» siempre (ya existe en el catálogo) | un color de esa familia que no exista |

Recorre **todos** los controles que hay antes de esa superficie, no solo el obvio: categoría, familia, marca, proveedor, sede, tipo de comprobante, medio de pago, motivo, modo, rol, temporada. Anota también las situaciones que rompen sugerencias sin que nadie lo note:
- **La persona cambia lo elegido después** («Cambiar» la categoría): la sugerencia tiene que seguir al control, sin recargar.
- **Ya escribió algo:** cambiar el control cambia el placeholder, **nunca el texto que ella escribió**.
- **Un control que decide la caja pero está *después* en la pantalla** (el nombre del color va antes que su familia): el ejemplo sigue a lo que ya se sabe (la familia que sale del tono elegido), y sin nada, es neutro.

## Paso 3 — Avisa (antes de tocar código)

Un mensaje corto y sigues sin esperar respuesta (salvo en las «Paradas»):

```
Sugerir: N sugerencias estáticas en <pantalla>
- Nombre (Archivo.tsx:762) — hoy «Blusa Aurora» · lo decide: categoría (N valores + ninguna)
- Descripción (Archivo.tsx:778) — hoy «Manga globo…» · lo decide: categoría
Ya reaccionan: … · No aplican (instrucción/número): … · Apagadas a propósito: … · Ocupadas por otra sesión: …
Voy a adaptarlas con una tabla por familia/categoría, lo que ya existe en el catálogo se salta, y un texto neutro de respaldo.
```

## Paso 4 — De dónde sale cada sugerencia (en este orden)

1. **La categoría o la familia, con clave estable.** Las familias y categorías las crea un Líder **sin deploy** (`retail.familias`) y se renombran (`Casacas/Chaquetas` → `Casacas`, `Blusas` se fusionó en `Camisas y Blusas`). Nunca claves por el nombre visible: usa `categorias.prefijo` y `familias.codigo`. La ficha va en la categoría cuando la familia no alcanza (en Indumentaria, «Casacas» y «Vestidos» no se nombran igual); si la familia alcanza, va en la familia.
2. **Lo que ya existe se salta.** Si la sugerencia es un valor que el catálogo también puede tener (un color, una talla, un tejido, un patrón), se elige el primer candidato de la familia que **no esté ya en lo que la pantalla tiene, sinónimos incluidos** (`colorConEseNombre`): un ejemplo que ya existe lleva a la persona a un «ya existe». En la primera corrida los dos ejemplos de color de antes ya estaban en el catálogo. Si un ejemplo va acompañado de otro (un color y su código), el segundo sale del mismo cálculo que el sistema usa (`sugerirCodigoColor`), no de otro texto: los dos cuentan la misma historia.
3. **Neutro y honesto.** Antes de elegir nada, o si la categoría es nueva y no está en la tabla, el placeholder no promete nada («Nombre del producto») o usa el vocabulario de la familia sin nombrar una prenda («Nombre del modelo»). **Nunca cae al ejemplo de otra familia.** Toda tabla curada termina en este neutro, porque mañana aparece una familia que hoy no existe.

**Cuándo NO usar un dato real como ejemplo:** para texto libre (nombre, descripción, motivo) usa una tabla curada, no un registro real de esa categoría: un dato real invita a copiarlo (el nombre chocaría con el aviso de parecidos) y una descripción interna no es un ejemplo. Un dato real sí sirve para *ordenar o preseleccionar* lo habitual (colores por uso, tallas de la curva): ahí hace falta muestra — *una cifra con poca muestra no es una cifra* (ADR-0214).

**Reglas duras de la sugerencia:**
- **Enseña la forma, no ofrece un valor.** El ejemplo sigue la convención real (`<Prenda> <nombre propio>`) y no choca con una regla de la pantalla.
- **Placeholder no es valor:** no se precarga ni se guarda. Una sugerencia **activa** rellena solo con un toque de la persona y lo que rellena queda visible como elegido.
- **Sin azar:** mismo contexto, mismo texto (nada de `Math.random()`: la hidratación y las pruebas se rompen).
- **Sin llamadas externas ni IA en vivo:** una sede sin señal tiene que ver el mismo texto. Es una función pura sobre datos que la pantalla ya tiene (principios 3 y 9).
- **Cabe en un celular:** a 375 px la caja de texto útil mide ~280 px y `text-overflow` es `clip`: un placeholder que no cabe se corta a media palabra. Pon un tope de caracteres (`MAX_DESCRIPCION` en Nuevo producto: 36) y una prueba que lo exija; mídelo con el ancho real, no a ojo.
- **Vocabulario del negocio:** «clienta», «sede», «colaborador»; prendas como se dicen en el Perú (polo, casaca, chompa, polera, enterizo). No inventes marcas ni proveedores reales.
- **Números y dinero no se inventan:** precio, costo o cantidad sugerida salen de datos con muestra o no se muestran (es decisión de Felipe: ver «Paradas»).

## Paso 5 — Implementa (una pantalla a la vez)

Lee antes: CLAUDE.md «Sugerencias coherentes», y `lib/sugerencias-alta-producto.ts` con su prueba (el modelo).

1. **Lógica pura** en `apps/web/lib/sugerencias-<pantalla>.ts`, con su prueba al lado. Una función que recibe el contexto (`{ familia, prefijo }`, o lo que decida la caja) y devuelve `{ texto, origen }`. El componente solo la llama. **Dentro de `lib/`, importa con rutas relativas** (`./color-codigo`), no con `@/`: vitest no resuelve el alias en esa carpeta.
2. **La prueba recorre TODOS los valores** del control (el catálogo de la prueba es una foto de la base real, con la consulta escrita en la propia prueba; no una lista que te inventes) y exige:
   - **Totalidad:** cada valor tiene su sugerencia propia, o cae al neutro **declarado**.
   - **Sin contradicción:** el ejemplo de una categoría empieza con *su* prenda y no nombra la de otra de su familia (cruza todas las parejas: en la primera corrida esto encontró un «colores surtidos» dentro de «Útiles de oficina», y «Colores» es otra categoría).
   - **Sin contexto → neutro; categoría nueva → neutro de su familia.**
   - **Sigue al control:** cambiar A → B cambia el texto, y B → A lo devuelve.
   - **Estable:** dos llamadas con el mismo contexto dan lo mismo.
   - **Cabe:** el largo no pasa del tope.
3. **Pasa el contexto por props opcionales** (`familia?: string | null`): así Editar producto y cualquier otra pantalla que use el mismo componente sigue compilando, y sin contexto muestra el neutro.
4. **Los ejemplos que no dependen de nada** se marcan en su línea: `placeholder="11 dígitos" // sugerir-fijo: formato del RUC; es el mismo para cualquier proveedor`. El motivo tiene que ser una razón (10 caracteres mínimo o el escáner lo ignora), no «ok».
5. **Verifica que no cambiaste el alcance:** el `disabled` de los botones, la validación y lo que se guarda quedan igual.

## Paso 6 — Prueba cada botón y cada filtro en el navegador

Aquí se cumple lo que pidió Felipe: no basta con que la función pase, hay que **tocar cada control y mirar qué dice la caja**.

1. Levanta la app (`preview_start`). **Si el puerto 3010 ya lo usa otra sesión, es de otro worktree con otro código: usa `cayla-retail-dev-3070`.** Necesitas `apps/web/.env.local` (lo ignora git) con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` y la `PUBLISHABLE_KEY` de `npx supabase status`; entra con el usuario de prueba de `supabase/seed.sql` (solo en la base local; no repitas su clave en chats ni informes).
2. Con la tabla del Paso 2, para **cada control que decide** y **cada valor**: tócalo y lee el `placeholder` / texto real del DOM (`javascript_tool` **solo para leer**, nunca para implementar). Compáralo con lo que dice la función. Anota `control → valor → lo que salió`.
3. Recorre siempre estos casos, además de los valores:
   - **Al abrir, sin nada elegido:** sale el neutro.
   - **Elegir, cambiar por otro y volver** al primero: sigue al control.
   - **Quitar la selección** («Cambiar»): vuelve al neutro.
   - **Con texto ya escrito:** cambiar el control cambia el placeholder y **no toca lo escrito**.
   - **Todos los valores de un control con ≤ ~50 opciones**: automatiza el recorrido (una función que elija cada valor, lea la caja y compare con lo esperado, generado desde la propia lógica); con más, uno por familia más las excepciones. En Nuevo producto se recorrieron las 42 categorías por la interfaz real.
   - **Cada botón o filtro de la pantalla** que pueda mover una sugerencia, aunque no lo hayas listado: si al tocarlo cambia algo que no esperabas, entra en la tabla.
4. **Escritorio y 375 px** (`resize_window` `mobile`, y vuelve a `desktop` al terminar). A 375 px **mide** cada placeholder contra el ancho útil de su caja (canvas `measureText` con la fuente calculada de la caja) y comprueba que ninguno se corta. En la primera corrida esto encontró que 24 de 42 descripciones no cabían: el recorrido en escritorio no lo habría visto. Vender, Cambios y Devoluciones llevan además la captura a 375 px que pide la plantilla del PR (PL-105).
5. **Solo lee: nunca guardes, crees ni confirmes durante el recorrido.** Un clic sobre «Crear producto» escribe en la base. Si para llegar a una sugerencia hay que guardar algo, **para y pregunta**.
6. Termina con `read_console_messages` (sin errores) y una captura del caso que motivó la skill.

**Trampas del recorrido automatizado** (todas ocurrieron):
- Un texto puesto en mayúsculas con CSS se lee en mayúsculas en `innerText` (`CAMBIAR`, `+ NUEVO TEJIDO`): busca con `/…/i`.
- Un `input` rellenado antes de que la página termine de hidratar se vacía solo: espera y repite.
- `javascript_tool` corta a los ~45 s: parte el recorrido en tandas (unas 14 opciones) y **no lances dos bucles a la vez** (compiten por el mismo control y se pisan).
- Un React con campos controlados no acepta `input.value = x`: usa el `set` nativo del prototipo y despacha un evento `input`.
- Si un valor cambia de un cierre a otro, el resultado de una tanda puede llegar como `undefined`: lee el estado en una llamada aparte.

## Paso 7 — Checks, registro y documentos

- `pnpm typecheck`, eslint de lo tocado, `pnpm --filter web test`, `node --test scripts/sugerir/escanear.test.mjs`, y `pnpm sugerir --ruta <ruta>`: lo que dejaste tiene que salir **derivado o fijo**, no estático.
- **Registro:** si arreglaste un archivo de la deuda, **bórralo de `ARCHIVOS_PENDIENTES` y baja `PENDIENTES_HOY`** en `lib/sugerir-archivos.ts` (la prueba exige la cuenta exacta). **Nunca agregues un archivo nuevo a esa lista**: es la deuda de antes de la regla.
- Una entrada de bitácora y de backlog, **un archivo por entrada** (ADR-0259). ADR solo si hubo una decisión estructural (la de la regla es el 0289).
- Si tocaste una ficha de categoría real, la prueba de «totalidad» tiene una foto del catálogo de la base: refréscala con la consulta que trae escrita.
- **No hagas commit ni push** salvo que Felipe lo pida.

## Paradas (pregunta a Felipe; no decidas tú)

- La lista tiene `sugerencias={false}` o un comentario que dice que se apagó: alguien lo decidió (en el alta de Nuevo producto, marca y proveedor sin sugerencias, ADR-0260). Léelo y pregunta antes de reactivar.
- La sugerencia sería un **número o un precio**, o rellenaría un valor por su cuenta: eso ya es una regla de negocio.
- El control vive en una pieza **compartida** (`ui/`, un combo usado por muchas pantallas) y cambiar su comportamiento afectaría a las demás.
- Hace falta cambiar la base (una columna, una RPC) para tener el dato.
- Otra sesión está tocando esos archivos (déjalos en la deuda y avísalo).

Los **textos de ejemplo** que inventes (nombres de prenda, descripciones) no son una parada: cuesta menos deshacerlos que preguntarlos. Decídelos, ponlos en la tabla (un solo archivo, fácil de leer y de vetar) y déjalos en la lista del cierre para que Felipe los vete.

## Cierre

- Corre `pnpm sugerir` otra vez sobre el mismo alcance: nada que debiera reaccionar puede quedar estático.
- Informe final corto: la tabla del Paso 2 con el antes/después, la tabla del Paso 6 (`control → valor → lo que salió`), qué categorías caen al neutro, **los textos que inventaste para que Felipe los vete**, las paradas abiertas y lo que no se pudo verificar.

## Lo que esta skill NO hace

No cambia validaciones, no habilita ni bloquea nada, no precarga valores y no inventa precios ni cantidades. No usa IA ni llamadas externas para sugerir. No reactiva sugerencias que alguien apagó. No rediseña la pantalla ni toca las que están fuera del alcance. No guarda datos durante la prueba. No agrega archivos a la deuda. Con `todo` no implementa nada.
