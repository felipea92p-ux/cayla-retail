# ADR-0290 · Las sugerencias siguen lo que la persona ya eligió (skill `/sugerir`)

- **Fecha:** 2026-09-30 · **Estado:** implementado y verificado en local (escritorio y 375 px). Solo web, sin migración.
- **Pedido:** Felipe, 2026-09-30, mirando Nuevo producto: eligió «Casacas» y la caja de nombre seguía diciendo «Blusa Aurora», y la
  de descripción «Manga globo, botones forrados…», que no tiene nada que ver. Quiere una skill (`sugerir`) que recorra cada botón
  y cada filtro que afecta a una caja con sugerencia y la adecúe a lo que se está eligiendo, que la use todo el equipo, y que sea
  **obligatoria** para que cada sugerencia sea coherente.
- **Complementa:** ADR-0284 (Guía de foco). Es el mismo mecanismo de cumplimiento (registro + prueba que falla en el CI), sobre otra
  cosa: lo que la caja dice antes de escribir, no lo que falta por llenar.

## Qué había

Los ejemplos estaban escritos a mano en el JSX (`placeholder="Blusa Aurora"`), así que decían lo mismo elija lo que elija la persona.
El escáner nuevo (`pnpm sugerir --todo`) cuenta **130 ejemplos escritos a mano en 69 archivos** (más de 250 placeholders en total; el
resto son instrucciones como «Buscar…»). Un ejemplo es una afirmación sobre lo que la persona está haciendo: si eligió Casacas,
«Blusa Aurora» es falso. Y hay dos fallas más finas que salieron al recorrer Nuevo producto:

1. **Los ejemplos ya existían en el catálogo.** «Palo de rosa» es sinónimo de «Palo rosa» y «Verde botella» es un color que ya está:
   quien los escribía tal cual veía «ya existe».
2. **«Ej. 44» como talla** le decía «talla de zapato» a quien armaba una casaca.

## Decisión

1. **Un ejemplo sigue la selección.** Lógica pura, determinista y sin red en `lib/sugerencias-<pantalla>.ts` (modelo:
   `lib/sugerencias-alta-producto.ts`). El componente solo la llama. De dónde sale el texto, en este orden: la **categoría**
   (clave estable `categorias.prefijo`, no el nombre visible, que se renombra); la **familia** (`familias.codigo`), con un texto
   neutro de su vocabulario; y **nada** («Nombre del producto»). Una familia o categoría que un Líder crea sin deploy cae al neutro,
   nunca al ejemplo de otra.
2. **Lo que ya existe se salta.** Colores y valores nuevos (talla, tejido, patrón) se eligen entre candidatos por familia descartando
   los que el catálogo ya tiene, sinónimos incluidos. El código de ejemplo de un color es el que el sistema propondría para ese mismo
   nombre (`sugerirCodigoColor`): los dos ejemplos siempre cuentan la misma historia.
3. **Nombre y descripción salen de una tabla curada, no de un producto real.** Un dato real invita a copiarlo (el nombre chocaría
   con el aviso de parecidos) y una descripción interna no es un ejemplo. El ejemplo enseña la forma, no ofrece un valor.
4. **Cabe en un celular.** La descripción no pasa de 36 caracteres (`MAX_DESCRIPCION`): a 375 px la caja útil mide 279 px y un
   placeholder que no cabe se corta a media palabra. La primera versión lo hacía en 24 de 42 categorías; lo encontró el recorrido a 375 px.
5. **Es obligatorio, con el mismo trinquete que la Guía de foco.** `lib/sugerir.test.ts` usa el escáner (`scripts/sugerir/escanear.mjs`,
   la única definición de «ejemplo estático») y falla si un archivo de `components/` o `app/(app)/` tiene un ejemplo escrito a mano
   que ni está derivado ni está marcado. Tres salidas, ninguna es olvidarse: derivarlo; marcarlo en su línea con
   `// sugerir-fijo: <por qué>` cuando de verdad no depende de nada elegido antes (el motivo vive junto al código y el escáner lo
   exige de 10 caracteres); o estar en `lib/sugerir-archivos.ts`, que es la **deuda de antes de la regla** (69 archivos), no puede
   recibir archivos nuevos y solo baja (`PENDIENTES_HOY` exacto, y un archivo listado que ya no tiene el problema también falla).
6. **La skill `/sugerir` hace el trabajo:** recorre (escáner), mapea qué control decide qué caja, avisa, implementa la lógica con su
   prueba, y **prueba en el navegador cada control** (no basta con que la función pase).

**Referencia visual e interactiva** (con las funciones y los datos reales; se abre con `preview_start maquetas`):
`docs/maquetas/sugerir-2026-09/index.html`.

## Descartado

- **Una tabla de ejemplos por nombre de categoría.** Se renombra y la crea un Líder sin deploy; envejecería a la semana.
- **Sugerir con IA en vivo o con un servicio externo.** Una sede sin señal tiene que ver el mismo texto; y un ejemplo que cambia entre
  cargas no se puede probar ni vetar. Es una función pura sobre datos que la pantalla ya tiene (principios 3 y 9).
- **Espejar la detección en la prueba, como hizo la Guía de foco.** Aquí la prueba importa el escáner: una sola definición, sin deriva.
- **Un registro con tres estados por archivo (`aplicada`/`no-aplica`/`pendiente`).** Un archivo con un ejemplo derivado y otro fijo
  no cabe en un solo estado; el marcador en la línea sí, y deja el porqué al lado del código.
- **Reactivar `sugerencias={false}` en Marca y proveedor del alta.** Lo apagó a propósito el ADR-0260; no es de esta skill.

## Se rompe si

- Un Líder crea una **subcategoría** con prefijo propio: cae al texto neutro de su familia (hoy no hay ninguna). Si se vuelve común,
  heredar la ficha de la categoría padre.
- Se crea una categoría real nueva y nadie suma su ficha: el sistema no falla (cae al neutro de la familia), pero la prueba de
  «totalidad» no lo ve porque su catálogo es una foto de la base del 2026-09-30. Se refresca con la consulta escrita en la propia prueba.
- Alguien cambia el ancho de la caja de Descripción o el tamaño de letra: `MAX_DESCRIPCION` se recalcula a mano.

## Dónde está aplicada

**Nuevo producto (`/productos/nuevo`), 0 ejemplos estáticos:**

| Caja | Sigue a | Cómo |
|---|---|---|
| Nombre, Descripción (`NuevoProductoForm.tsx`) | la categoría del paso 1 | ficha por `prefijo`; neutro de la familia |
| «+ Nueva talla / tejido / patrón» (`ProponerValor.tsx`, vía `ElegirTallas` y `ElegirMuestra`) | la familia de la categoría | candidatos por familia, descartando los que ya existen |
| «+ Nuevo color» (`NuevoColorAlta.tsx`) | la familia de color (elegida o la que sale del tono) | candidatos por familia, descartando nombres y sinónimos existentes; código coherente |
| Razón social y RUC (`NuevaMarcaForm.tsx`), formato #hex (`SelectorColor.tsx`) | nada: `sugerir-fijo` con su motivo | — |

**Verificado (2026-09-30):** las 42 categorías activas, tocadas una por una en la interfaz real, coinciden con la función, en
escritorio y a 375 px, con 0 recortes (la más larga usa 256 de 279 px). Texto ya escrito y cambio de categoría: lo escrito se
conserva y solo el ejemplo cambia. Talla de calzado «Ej. 44»; de ropa «Ej. XXS» (XXL ya existe y se saltó). Color: Azul → «Azul
acero» / AZA; Tierra → «Barro» (Ocre es sinónimo de Mostaza y se saltó).

**Pendiente (deuda registrada):** 69 archivos, entre ellos `ProductoForm.tsx` (Editar producto: «Blusa Lino» fijo; no se tocó porque
otra sesión trabaja esa ficha), las series de comprobantes (`F001` no cambia si eliges boleta), los motivos de anulación y los medios de
pago. Se hacen con `/sugerir <ruta>`, de a una pantalla.
