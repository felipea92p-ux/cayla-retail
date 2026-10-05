# ADR-0339 · La acción de pasar prendas del almacén al piso se llama «Colgar en el piso», en toda la pantalla

- **Fecha:** 2026-10-04 · **Estado:** construido y commiteado en la rama `claude/unificar-bajar-prendas-c077c7`, **sin push ni PR todavía**: se regenera sobre `main` cuando se fusione la cola de PR de Inventario (ADR-0328).
  **Solo web, sin migración y sin tocar producción.** Verificado: `tsc` y ESLint limpios y las 332 archivos de prueba de `apps/web` en verde (155 446 pruebas); 89 archivos cambiados, ninguno en `supabase/`.
  **Sin probar en el navegador ni a 375 px** (ver «Lo que no se verificó»).
- **Pedido:** Felipe, 2026-10-04: «unificar el nombre de "bajar prendas al piso" en todo el código y la interfaz»; la misma acción
  aparecía con hasta siete nombres y confundía a las asesoras nuevas. El artefacto de inventario del 3-oct ya lo marcaba
  («un solo nombre para esta tarea… hoy tiene hasta siete»).
- **Decidió Felipe (2026-10-04), sobre tres opciones:** «Colgar en el piso». Su razón, que cambió la recomendación que yo traía:
  «bajar» nació porque el almacén de TRU está arriba, pero en AQP y Lima está **en la misma planta**.
- **Complementa:** ADR-0208 (la bajada), ADR-0295 y ADR-0320 (Reponer por modelo), ADR-0306 (es una función de Existencias).
  **Reemplaza, solo en el nombre visible:** «Reponer prenda» y el botón «Reponer» (ADR-0320, 2026-10-03).

## El problema

La misma acción —una prenda pasa del almacén de la tienda al piso de venta (`bajar_al_piso`)— se leía en pantalla de ocho maneras.
Una asesora que seguía el camino normal de TRU pasaba por cinco nombres en cuatro clics: filtraba **«Por colgar»**, la tarjeta le
ofrecía **«Reponer»**, se abría una ventana titulada **«Reponer prenda»**, el botón de confirmar decía **«Bajar al piso»**, el
historial lo anotaba como **«Bajada al piso»** y la tabla le recomendaba **«Reponer a piso»**. Ninguno estaba mal escrito. Cada uno
nació de una decisión correcta, tomada por separado en nueve días, y **nadie era dueño del nombre**.

## Decidí

DECIDÍ: **«Colgar en el piso»** como único nombre visible de la acción, y la familia `bajada` / `bajar_al_piso` como único nombre en
código (la RPC, las tablas y la ruta ya se llaman así y renombrarlas pide una migración en producción).

DESCARTÉ: «Bajar al piso» (mi recomendación inicial) porque describe solo a TRU: en AQP y Lima nadie «baja» nada, y una asesora de
esas sedes aprendería una palabra que su tienda no usa. DESCARTÉ también «Reponer prenda» (ADR-0320) porque «reponer» ya significa
otra cosa en CAYLA —`reposicion` es un motivo de ajuste guardado en `movimientos`, y la migración `20260926000400` le prohibió tocar
el piso—: unificar en «reponer» habría cambiado siete nombres por una palabra con dos significados.

SE ROMPE SI: una asesora de TRU lee «Colgar» y entiende «colgar la prenda en la percha del piso» pero no «sacarla del almacén»
(el primer nombre sugiere el destino, no el origen). Es el único escenario en que «Bajar al piso» era mejor para TRU. Se cubre con
el texto de ayuda de cada botón («del almacén al piso») y con el estado «Por colgar», que ya enseñaba el verbo.

## Lo que cambió, y lo que NO

**Texto visible.** Todo botón, título, aviso y etiqueta de historial dice «Colgar en el piso» (acción) o «Colgada(s) en el piso»
(fila del historial: la prenda *fue colgada*). El sustantivo «una bajada» no tiene equivalente natural con «colgar» («Confirmar
colgada» no se dice), así que el lote de prendas pasa a llamarse **«tanda»** («Una tanda admite hasta N prendas…», «Colgar otra
tanda») y el botón de confirmar a «Confirmar y colgar». **«tanda» es una palabra nueva que Felipe no ha visto: es lo primero que debe
revisar.** El buscador de Movimientos entiende los dos vocabularios (`colgada`, `colgar` y también `bajada`).

**Código.** Se renombraron los identificadores que decían `reponer` en el sentido de esta acción, y los archivos:
`ReponerPrendaModal.tsx` → `BajarPrendaModal.tsx`, `reponer-prenda-reglas.ts` → `bajar-prenda-reglas.ts`, `reponer_a_piso` →
`bajar_al_piso` (el tipo de «Acción hoy», solo TypeScript: no existe en la base), `puedeReponer` → `puedeBajarPrendas`,
`umbralStockPisoReposicion` → `umbralStockPisoBajada`, entre otros (lista cerrada en la prueba).

**NO cambió, a propósito:**
- La RPC `bajar_al_piso`, las tablas `bajadas_piso` / `bajada_piso_items`, la clave de aviso, la ruta `/inventario/bajar` y la familia
  `bajada` en identificadores: renombrarlos exige una migración en producción, y una ruta renombrada rompe los enlaces guardados.
- **`reposicion`** (el motivo de ajuste, 168 apariciones): es otro concepto y un valor guardado en producción.
- **«Reponer» en «Se agotaron ▸ Reponer»** (`lib/analisis-que-hacer.ts`, grupo `agotada`): ahí cubre dos caminos, colgar desde el
  almacén **o** pedir a otra sede; llamarlo «Colgar en el piso» sería falso cuando no hay almacén. **Pendiente de decisión.**
- **«Por colgar»** (el estado), «Subir a almacén» / «Subir prenda» (la acción inversa) y el abastecimiento desde proveedor
  (`ReposicionProveedor`, `revisar_abastecimiento`), que es otra cosa.
- **`catalogo-v2.ts:452` `p_disponibilidad: "reponer"`:** un valor de contrato con una RPC de producción (sobre `punto_reorden`),
  distinto de esta acción. Un reemplazo global lo habría roto.

## Tabla de equivalencias (para ramas abiertas con textos nuevos)

| Antes | Ahora |
|---|---|
| Bajar prendas al piso · Bajar al piso · Reponer a piso · Reponer al piso · Reponer prenda · Reponer (botón de la tarjeta) | **Colgar en el piso** |
| Bajar estas al piso · `Bajar ${n} al piso` | Colgar estas en el piso · `Colgar ${n} en el piso` |
| Bajada al piso · Bajadas al piso (etiqueta del historial) | **Colgada en el piso** · Colgadas en el piso |
| Se bajó / Se bajaron N prendas al piso de X | Se colgó / Se colgaron N prendas en el piso de X |
| N prendas bajadas al piso | N prendas colgadas en el piso |
| Baja al piso N tallas por colgar | Cuelga en el piso N tallas por colgar |
| bájalas / que la bajen / que lo bajen | cuélgalas / que la cuelguen / que lo cuelguen |
| Confirmar bajada · Empezar otra bajada · «una bajada» (el lote) | Confirmar y colgar · Colgar otra tanda · «una tanda» |
| «registrar la bajada» / «la bajada queda registrada» | «registrar que se colgó» / «queda registrada como colgada» |
| Inventario ▸ Existencias ▸ Reponer | Inventario ▸ Existencias ▸ Colgar en el piso |
| Subir al piso: «Reponer» (nota de Ajustar; «subir» apuntaba al revés que «Subir a almacén») | Prendas al piso: «Colgar en el piso» |

## Cómo se hace cumplir

`apps/web/lib/un-solo-nombre-de-la-bajada.test.ts` (corre con `pnpm test`, que `ci.yml` ya ejecuta: **no hizo falta tocar el
pipeline**). Lee el **árbol del código**, no las letras, así que un comentario que cuenta cómo se llamaba antes no cuenta. Falla si
un texto visible de `app/`, `components/` o `lib/` nombra la acción con un nombre retirado —**flexionado** («se bajó», «bájalas»,
«prendas bajadas al piso») o **con una interpolación en medio** (`Bajar ${n} al piso`)—, y si reaparece un identificador o un archivo
retirado. Está probada en las dos direcciones: 12 casos del detector (incluidos los homónimos que no son esta acción: «bajó la
deuda», «bajar el IGV», «no es una baja», una clase CSS `club-bajada`) y una **mutación** (se plantaron cuatro nombres viejos en un
archivo temporal y la prueba falló por cada uno).

**Lo que la prueba NO ve, dicho sin adornos:** (a) el verbo suelto («cuántas bajar»): «bajar» también es «bajó la deuda» y «bajar
el IGV», y prohibirlo castigaría textos que no son de esta acción; (b) `supabase/`: los mensajes que levanta la base
(`raise exception 'No puedes bajar prendas al piso…'`) siguen diciendo el nombre viejo hasta que se pegue una migración; (c) las
pruebas y los comentarios. **El inventario a mano que hice antes de escribir la prueba se perdió un texto** (en
`guia-de-foco-pantallas.ts`) **que la prueba sí encontró**: por eso el patrón manda sobre cualquier lista.

## Lo que no se verificó

- **Navegador y 375 px.** No se levantó la web: este worktree no tiene `.env.local` ni base local. «Colgar en el piso» es más largo que
  «Reponer» y el botón de la tarjeta de Existencias es `btn-chico`: hay que mirar que no se corte. Existencias no está en la lista de
  pantallas de celular obligatorio (Vender, Cambios, Devoluciones), pero **Vender sí cambió textos** (avisos de «no se registró como
  colgada», el modal «Registrar que se colgó en el piso») y esas sí piden captura a 375 px.
- **Los mensajes de la base.** Los `raise exception` de producción dicen «bajar prendas al piso»; se ven crudos cuando la web no los
  reinterpreta. Cambiarlos es una migración y es decisión de Felipe.
