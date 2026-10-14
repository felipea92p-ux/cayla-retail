# Código que solo usan las pruebas (2026-10-14)

Informe para Felipe. Rama `claude/knip-produccion-1bed1d`, montada sobre `claude/knip-dead-code-9cfc30` (`0391b9227`, con
`origin/main` `89de128be` adentro), que suma Knip al CI (ADR-0406) y se fusionó como #1079.

> **Decidido el mismo día (Felipe, chat):** opción 2 de la sección 4 y conectar las cuatro copias de la sección 2 C. Ya están hechas
> en esta rama (ADR-0406, actualización b): `pnpm knip:produccion` en el CI, `@internal` en los 22 oráculos de A, `ignoreFiles` para
> los 5 archivos de B, las cuatro pantallas conectadas y `reglas-sin-uso.test.ts` retirado. Las 78 piezas de D, E y F son la deuda
> de `scripts/knip/deuda-produccion.mjs`. **No se borró nada de esa lista:** `registro-contable.ts`, la hoja de prueba de etiquetas y
> el resto siguen esperando su OK, módulo por módulo.

## En corto

- **109 piezas de `apps/web` que ninguna pantalla usa: solo sus pruebas.** 103 exportaciones (960 líneas) y 6 archivos
  (791 líneas), todas en `lib/`. En `components/` y `app/` no hay ninguna.
- **El candado de hoy ve 1 de cada 5.** Las 21 de `SIN_USO_CONOCIDAS` (`lib/reglas-sin-uso.test.ts`, ADR-0234) están todas en la
  lista; las otras 88 no las vigila nadie, porque no son funciones de un `*-reglas.ts` (son constantes o viven en `marcas.ts`,
  `existencias-prendas.ts`, `facturacion-actividad.ts`…).
- **Siguen apareciendo:** en la semana del 5 de octubre, 14 piezas perdieron su pantalla y 4 nacieron sin ella; en los tres días
  de esta semana van 6, entre ellas `decisionesDeProduccion`, que dejó de usarse hoy mismo.
- **Cuatro no son basura: son un candado que vigila una copia.** La prueba fija la regla en `lib/`, pero la pantalla escribe la suya
  en línea. Si alguien cambia la de la pantalla, la prueba sigue en verde (sección 2, C).
- **Ninguna llama a la base (`.rpc(`).** Borrarlas no deja una función de la base sin llamador, así que `pruebas:roles-cobertura`
  no se entera y no hace falta migración. (La única que sí la llama, `MisPartesDeCompras`, ya está aparte en `knip.ts`, ADR-0387.)
- **La lista es un piso, no un techo.** Al borrar una función aparecen las que solo ella usaba en su propio archivo. Por ejemplo, en
  `registro-contable.ts` Knip marca 4 funciones, pero al sacarlas se va el archivo casi entero (247 de 248 líneas).

Semana a semana (sin contar los oráculos de la sección A):

| Semana del | Perdieron su pantalla | Nacieron sin pantalla |
|---|---:|---:|
| 2026-09-07 | 8 (el corte V1→V2 del 12) | 1 |
| 2026-09-14 | 1 | 6 |
| 2026-09-21 | 21 (13 de ellas cuando Facturación pasó a Comprobantes, #287) | 7 |
| 2026-09-28 | 7 | 4 |
| 2026-10-05 | 14 | 4 |
| 2026-10-12 (3 días) | 4 | 2 |

## 1. Por qué `knip --production` daba todo por sobrante, y cómo se hace andar

`pnpm exec knip --production` con el `knip.ts` actual da 13 dependencias «sin uso» (`radix-ui`, `gsap`, `server-only`, `zod`…) y
ningún archivo. **No es el plugin de Next:** en modo producción sí entrega las rutas como entrada (con `--debug` aparecen `proxy.ts`,
`app/layout.tsx`, cada `page.tsx`…). El problema es el `project` de `knip.ts`. En Knip 6.41.0:

- `WorkspaceWorker.getProductionProjectFilePatterns()` se queda **solo con los patrones de `project` que terminan en `!`** y niega
  los demás. El nuestro (`**/*.{ts,tsx,mjs,js,css}`, sin `!`) deja el proyecto de producción vacío.
- `ProjectPrincipal.walkAndAnalyze()` **solo analiza los archivos del proyecto.** A los demás los recorre siguiendo sus imports,
  pero no anota qué paquetes cargan ni qué exportaciones usan. Por eso las rutas se recorren y aun así ningún `import` de
  `radix-ui` cuenta.

El arreglo es marcar con `!` lo que es producción. Probado con una copia de la configuración (sin tocar `knip.ts`, que está
trabajando otra sesión):

```ts
const produccion = process.argv.includes("--production");
// …
"apps/web": {
  entry: [
    "public/sw.js!",                 // se registra por URL en el navegador: es producción
    "public/quitar-fondo.worker.js!",
    "tema/motor/escaner-en-pagina.js", // herramientas de desarrollo: sin «!»
    "unificar/motor/censo-en-pagina.js",
    "unificar/elegir.mjs",
  ],
  project: [
    "{app,components,lib}/**/*.{ts,tsx,css}!", // lo que llega a la tienda
    "public/*.js!",
    "*.{ts,mjs,js}!",                          // proxy.ts y las configuraciones de la raíz
    "{tema,unificar,guias,responsive}/**/*.{ts,tsx,mjs,js,css}", // herramientas: solo en el modo normal
  ],
  ignore: [/* los dos de hoy */],
  // Archivos que existen PARA las pruebas (registros de deuda, datos de prueba): en producción no se cuentan como sobrantes.
  ...(produccion ? { ignoreFiles: ["lib/{guia-de-foco-pantallas,sugerir-archivos,tema-colores-archivos}.ts", "lib/*-fixture{,s}.ts"] } : {}),
},
"packages/*": { project: ["src/**/*.{ts,css}!"] },
```

Con eso:

- **Modo normal (`pnpm knip`):** idéntico a hoy. Sale 0 y sin avisos de configuración.
- **Modo producción:** 0 dependencias, 1 archivo y 103 exportaciones (la lista de abajo). Ningún falso positivo de dependencias,
  rutas, workers ni configuraciones. Tarda ~1 s.
- **`@internal` es la forma de declarar un oráculo de prueba.** Knip lo ignora solo con `--production`
  (`getShouldIgnoreHandler`: `isProduction && tags.has("@internal")`), y en el modo normal sigue exigiendo que alguien lo use.
  Probado: con `/** @internal Solo para las pruebas… */` en `reiniciarSunatPublico`, producción baja de 103 a 102 y el modo
  normal sigue en 0. Lo deshice después.

## 2. Qué hacer con cada una

| | Qué es | Cuántas | Propuesta |
|---|---|---:|---|
| **A** | **Oráculo de prueba, a propósito:** la constante que la prueba cruza con la migración (`PARAMETROS_RPC_*`, `TOPE_DEL_DIA_EN_MANO`), el tope de un placeholder (`MAX_*`, ADR-0290), la lista de todos los valores de un tipo para recorrerlos (`TIPOS_*`, `FILTROS_MARCAS`), un candado de compilación (`CAMPOS_CUBIERTOS`), el gancho que reinicia una caché (`reiniciarSunatPublico`) y el tablero de las guías (`PANTALLAS`, `PENDIENTES_HOY`) | 22 | `/** @internal <motivo> */`. No se borra. `LISTA_VACIA` y `BORRADOR_VACIO` son comodidades de la prueba: mejor que vivan en la prueba |
| **B** | **Archivos que existen para las pruebas:** los registros de deuda (`guia-de-foco-pantallas.ts`, `sugerir-archivos.ts`, `tema-colores-archivos.ts`) y los datos de prueba (`piso-plan-fixtures.ts`, `ya-emitido-fixture.ts`) | 5 archivos | `ignoreFiles` solo en producción (arriba) |
| **C** | **La prueba vigila una copia** | 4 | Conectar: una línea en la pantalla cada una (detalle abajo) |
| **D** | **Las usó una pantalla y la pantalla cambió** | 51 | Borrar con su prueba, módulo por módulo |
| **E** | **Nunca tuvieron pantalla en `main`** (nacieron con su prueba para una pantalla que no llegó, o la rama que las usaba las soltó al fusionarse) | 18 | Borrar, o conectar si la idea sigue viva (ver `textoDeRepartoParaLector`) |
| **F** | **Aparte:** `registro-contable.ts` (sección 3), la hoja de prueba de etiquetas, un duplicado en `scripts/` y dos que ya esperan otra decisión | 8 + 1 archivo | Caso por caso, abajo |

### C. La prueba vigila una copia (lo más importante de la lista)

Hoy no rompen nada: la copia de la pantalla dice lo mismo que la función. Pero la prueba no protege lo que dice proteger.

- **`campanaValida`** (`lib/etiqueta-campana-guia.ts:24`). `etiqueta-campana-guia.test.ts` exige que la guía de foco deje confirmar
  exactamente cuando `campanaValida` dice que sí (ADR-0284: «la guía no cambia qué se puede confirmar»). Pero `CampanaModal` apaga
  «Guardar» con su propio `valido`, escrito en línea (`components/EtiquetasLista.tsx:630`). Si alguien endurece esa línea, la guía
  y su prueba siguen en verde. **Arreglo:** `const valido = campanaValida({ descuento, desde, hasta })`.
- **`textoRecibido`** (`lib/recepcion-envio-reglas.ts`). `components/recepcion-envio/ComoSeCerro.tsx:94` arma
  `${tituloRecibido(resumen)} · ${detalleRecibido(resumen)}` a mano. **Arreglo:** `titulo={textoRecibido(resumen)}`.
- **`anioLima`** (`lib/club-cumple-canje-reglas.ts:122`). `app/(app)/configuracion/page.tsx:126` repite
  `Number(hoyLima().slice(0, 4))`. **Arreglo:** moverla a `lib/fechas-lima.ts`, donde la encuentra cualquiera, y usarla en los dos
  lugares.
- **`esRafaga`** (`lib/existencias-pistola.ts`). `components/existencias/PanelTalla.tsx:430` decide la ráfaga con su propia resta
  (`e.timeStamp - antes < MS_ENTRE_TECLAS`). Este es más fino: el panel mide con el reloj del evento y la función con el del
  lector. **Propuesta:** que lo vea quien conoce la pistola antes de unificar.

Y uno de la sección E que no es basura: **`textoDeRepartoParaLector`** (`lib/plan-piso-familias.ts:345`) es el texto para el lector de
pantalla del reparto de colores («Neutro 32 %, Tierra 31 %…»). `components/plan-piso/DetalleDelGrupo.tsx` muestra los porcentajes
solo a la vista: conectarlo es accesibilidad, no limpieza.

### F. Aparte

- **`lib/codigo128.ts` (157 líneas) y `puntosPorModuloQR` (`lib/qr.ts`).** Ninguna pantalla los usa desde el 2026-10-06 (#858, que
  borró `components/Codigo128.tsx`). Los importa solo `scripts/etiquetas/hoja-de-prueba.mjs`, la hoja que se armó para medir si la
  Zebra leía el código (2026-09-09/10, antes de que la etiqueta pasara a QR). **Tu decisión:** si esa hoja ya no se usa, se van los
  tres (y Knip normal lo confirma en la misma corrida); si se usa, los dos se quedan con `@internal` y el motivo.
- **`resolverTienda`** (`lib/terminales-reglas.ts`, en `SIN_USO_CONOCIDAS`). `scripts/terminales/reglas.mjs` tiene su propia copia,
  que es la que corre al crear una terminal. Son dos implementaciones de la misma regla: o el script importa la de `lib/` (como hace
  `hoja-de-prueba.mjs`), o se borra la de `lib/`.
- **`partesPorPagar`** (`lib/compras-mi-parte-reglas.ts`). Salió de Por pagar el 2026-10-13 (#1034, ADR-0387). Hoy la usa solo
  `components/MisPartesDeCompras.tsx`, que ya está en `ignore` porque su retiro lleva migración: va en ese mismo retiro.
- **`dniEnmascarado`** (`lib/clienta-ticket-reglas.ts`). Desde el 2026-10-01 (#673) es un alias de `numeroEnmascarado`
  (`documento-clienta-reglas.ts`), y solo lo pide `vender-conectado.test.ts`. **Arreglo:** que la prueba importe `numeroEnmascarado` y
  borrar el alias.

## 3. `registro-contable.ts`: mover `IGV_TASA` y borrar el resto

ADR-0198 ya lo llamó huérfano: el motor de partida doble de V1 armaba líneas para `registrar_asiento`, que el corte V1→V2 del
2026-09-12 borró, y la regla contable vive en SQL. Su pantalla (`components/RegistroContableForm.tsx`) se fue ese mismo día
(`0af2f1b54`). Hoy la web solo usa `IGV_TASA` (`lib/analisis-rinde.ts:5`, «Lo que más rinde», ADR-0357). No importa nada y no llama
a la base.

**Propuesta (un commit, sin migración):**

1. `IGV_TASA` pasa a `lib/impuestos-reglas.ts` (puro, el dominio de impuestos de Finanzas, ADR-0195 F8), con el comentario de que la
   tasa vigente vive en `parametros_tributarios` y esta es su copia para lo que no puede leerla (`fn_parametros_tributarios_lista`
   pide `fn_es_lider()` y Análisis lo lee también la encargada). `analisis-rinde.ts` la importa de ahí.
2. Se borran `lib/registro-contable.ts` (248 líneas) y `lib/registro-contable.test.ts` (108).
3. Se ponen al día los textos que lo nombran: los comentarios de `lib/panel-serie.ts:4` y `lib/proformas-reglas.ts:4` (lo citan como
   ejemplo de lib pura), `docs/ARQUITECTURA.md` (líneas 1392 y 1884), `docs/datos/modulos/12-contabilidad.md:455` y una línea de
   «Actualización» en ADR-0198. La investigación del 2026-09-23 y la auditoría del 2026-09-17 se dejan como están: son historia.

**De paso (no lo toco sin tu OK, porque es dinero):** el 18 % está escrito cinco veces en la web: `IGV_TASA`, `IGV_PORCENTAJE` en
`comprobante-orden-reglas.ts:85` y en `comprobantes-produccion-reglas.ts:26`, y el valor por defecto de `igvDeFactura`
(`gastos-reglas.ts:69`). El día que la tasa cambie, cambia en `parametros_tributarios` y en cinco lugares más. Si te parece, el paso 1
deja `impuestos-reglas.ts` como el único lugar del 18 % en la web y las otras copias pasan a importarlo, en un PR aparte.

## 4. El candado: dos caminos

Hoy, una función que pierde su pantalla en un PR (como `decisionesDeProduccion` hoy) solo la detecta `reglas-sin-uso.test.ts`, y
solo si es una función de un `lib/*-reglas.ts`.

**Opción 1. Extender `reglas-sin-uso.test.ts`** a toda exportación de `lib/` y `components/`, constantes incluidas.

- *Ganas:* ningún paso nuevo en el CI. Sigue siendo una prueba de vitest de ~1 s, con la misma lista que solo se achica.
- *Pagas:* cuenta identificadores, no imports. Medido sobre los 103 de hoy, **no vería 15**: los que comparten nombre con una
  variable de otro archivo (`progreso`, `unidades`, `textoLlegada`, `tramoDe`, `siguienteOrden`…) y los que «usa» un archivo que a su
  vez está muerto (`partesPorPagar`, por `MisPartesDeCompras.tsx`). Además habría que enseñarle a leer `export const`,
  `export { a as b }` y `export *`, y eso es reescribir Knip a mano.

**Opción 2. `knip --production` en el CI** (la recomendada), con la configuración de la sección 1.

- *Ganas:* sigue los imports desde las rutas de Next, así que lo que solo alcanza un archivo muerto también cuenta como muerto.
  Ve funciones, constantes, tipos y archivos en todo el monorepo, con la herramienta que ya está en el CI y ~1 s más. Lo que se
  queda a propósito se declara junto al código (`@internal` + motivo), igual que hoy se declara `@public`.
  `reglas-sin-uso.test.ts` se retira, porque sus 21 son un subconjunto (verificado) y dos candados para lo mismo terminan
  diciendo cosas distintas.
- *Pagas:* Knip no tiene una lista de deuda por símbolo. Hasta que se resuelvan las 78 de D, E y F (y las 4 de C, mientras no se conecten), hace falta un script chico
  (`scripts/knip/produccion.mjs`) que corra `knip --production --reporter json` y lo compare con una lista que solo se achica:
  falla si aparece una nueva y si una de la lista ya no está. Es la misma mecánica de `SIN_USO_CONOCIDAS`, `PENDIENTES_HOY` y
  `sugerir-archivos.ts`.

**Cómo lo haría, si dices que sí a la 2 (cada paso un commit verificable):**

1. `knip.ts` con la configuración de la sección 1, y `@internal` + motivo en las 22 de A.
2. `pnpm knip:produccion` + su lista de deuda (D + E + F menos lo que se borre en el paso 3), un paso «Código que solo usan las
   pruebas» en el job «Tipos, lint y pruebas» del CI, y se retira `reglas-sin-uso.test.ts` (su lista pasa a la nueva). Va como
   actualización de ADR-0406 (es la misma decisión, Knip), así que no hace falta un número nuevo.
3. Los arreglos que no borran nada: los 4 de C y `textoDeRepartoParaLector`.
4. Con tu OK, módulo por módulo: borrar lo de D y E con sus pruebas, y `registro-contable.ts` como en la sección 3. Cada PR achica
   la lista.

**Ojo con el orden:** `knip.ts` y el CI de Knip viven en `claude/knip-dead-code-9cfc30`, que todavía no es un PR y la está
trabajando otra sesión (último commit hoy a las 13:50). Esto va encima de esa rama, después de que se fusione.

## 5. Cómo verificas tú

Desde la raíz del repo, en esta rama:

```bash
pnpm exec knip --production
```

Hoy da las 13 dependencias falsas (sección 1). Con la configuración propuesta da 1 archivo y 103 exportaciones, y
`pnpm exec knip` (normal) sigue en 0. Para ver la historia de una pieza:

```bash
git log --first-parent -m -G'decisionesDeProduccion' --format='%h %cs %s' origin/main -- apps/web/app apps/web/components
```

Cómo se midió la columna «Sin pantalla desde»: `git log -G<símbolo>` por el primer padre de `origin/main`, o sea un cambio por PR
fusionado y con la fecha en que llegó a la tienda (no la de la rama), sobre `app/`, `components/` y `lib/` sin las pruebas. Una
línea de otro archivo cuenta solo si ese archivo importa el módulo. «Nunca» quiere decir que en `main` jamás hubo una línea que la
usara fuera de su prueba (en las de Caja, la rama que las usaba las soltó al fusionarse, #128).

## Anexo: la lista completa

«Sin pantalla desde»: la fecha en que el último uso salió de `main`, con el PR (o el commit, si entró directo) y la pantalla que la
usaba. «Nunca»: la fecha en que nació. «Su prueba»: las pruebas que la importan.

#### D. Las usó una pantalla y la pantalla cambió — 51 símbolos, 507 líneas

| Archivo | Símbolo | Líneas | Sin pantalla desde | Su prueba | En `SIN_USO_CONOCIDAS` |
|---|---|---:|---|---|:-:|
| `lib/intento-reglas.ts` | `cobrosPorResolver` | 2 | 2026-10-14 · #1068 (antes: `components/PuntoDeVenta.tsx`) | `intento-reglas.test.ts` |  |
| `lib/produccion-decisiones.ts` | `decisionesDeProduccion` | 4 | 2026-10-14 · `555fedd7b` (antes: `app/(app)/produccion/page.tsx`) | `produccion-decisiones.test.ts` |  |
| `lib/recibidas-filtros-reglas.ts` | `textoProveedor` | 9 | 2026-10-13 · #1026 (antes: `components/FiltrosRecibidas.tsx`) | `recibidas-filtros-reglas.test.ts` |  |
| `lib/plan-compra-reglas.ts` | `campanasActivas` | 2 | 2026-10-12 · #977 (antes: `components/plan-compra/SelectorCampana.tsx`) | `plan-compra-reglas.test.ts` |  |
| `lib/frescura-pantalla.ts` | `tramoBarraDe` | 7 | 2026-10-10 · `bd5b3c6f7` (antes: `lib/frescura-pantalla.ts`) | `frescura-pantalla.test.ts` |  |
| `lib/frescura-reglas.ts` | `tramoDe` | 28 | 2026-10-10 · `bd5b3c6f7` (antes: `lib/frescura-reglas.ts`) | `frescura-dos-relojes.test.ts`, `frescura-pantalla.test.ts`, `frescura-reglas.test.ts` |  |
| `lib/marcas.ts` | `filtrarMarcas` | 7 | 2026-10-10 · #930 (antes: `components/MarcasLista.tsx`) | `marcas.test.ts` |  |
| `lib/marcas.ts` | `textoProductosMarca` | 7 | 2026-10-10 · #930 (antes: `components/MarcasLista.tsx`) | `marcas.test.ts` |  |
| `lib/existencias-prendas.ts` | `aclaracionDeLaCaja` | 5 | 2026-10-07 · #873 (antes: `components/existencias/PanelTalla.tsx`) | `existencias-prendas.test.ts` |  |
| `lib/existencias-prendas.ts` | `desgloseDePrenda` | 7 | 2026-10-07 · #873 (antes: `components/existencias/PanelTalla.tsx`) | `existencias-prendas.test.ts` |  |
| `lib/existencias-prendas.ts` | `lineaDeLaSuma` | 13 | 2026-10-07 · #873 (antes: `components/existencias/PanelTalla.tsx`) | `existencias-prendas.test.ts` |  |
| `lib/por-regularizar-reglas.ts` | `siguienteOrden` | 6 | 2026-10-07 · #867 (antes: `components/PorRegularizarLista.tsx`) | `por-regularizar-reglas.test.ts` |  |
| `lib/movimientos-reglas.ts` | `unidades` | 4 | 2026-10-06 · #858 (antes: `components/MovimientoDetalle.tsx`) | `movimientos-reglas.test.ts` |  |
| `lib/recordatorio-cierre-reglas.ts` | `progreso` | 4 | 2026-10-06 · #856 (antes: `components/RecordatorioCierreCaja.tsx`) | `recordatorio-cierre-reglas.test.ts` |  |
| `lib/reponer-prenda-reglas.ts` | `topeDeTalla` | 2 | 2026-10-06 · #833 (antes: `components/MatrizMover.tsx`, `lib/reponer-prenda-reglas.ts`) | `reponer-prenda-reglas.test.ts` |  |
| `lib/retiro-reglas.ts` | `TEXTOS_BLOQUE_SUBIR` | 2 | 2026-10-06 · #833 (antes: `components/SubirAAlmacenModal.tsx`) | `retiro-reglas.test.ts` |  |
| `lib/traslados-reglas.ts` | `textoLlegada` | 48 | 2026-10-06 · #841 (antes: `components/TrasladoLlegada.tsx`) | `traslados-reglas.test.ts` |  |
| `lib/colaboradores-reglas.ts` | `fechaHoraLima` | 5 | 2026-10-05 · #816 (antes: `components/ColaboradoresTablas.tsx`) | `colaboradores-reglas.test.ts` |  |
| `lib/se-probo-reglas.ts` | `OPCIONES_RAZON` | 5 | 2026-10-02 · #727 (antes: `components/punto-de-venta/SeProboNoLlevo.tsx`) | `se-probo-reglas.test.ts` |  |
| `lib/club-reglas.ts` | `textoVigente` | 4 | 2026-10-01 · #697 (antes: `app/(app)/clientas/cartel/page.tsx`, `components/ClientaFichaModal.tsx`, `components/NuevaClientaModal.tsx`, `components/punto-de-venta/InvitarAlClub.tsx`, `lib/club-caja-reglas.ts`) | `club-reglas.test.ts` |  |
| `lib/alta-producto.ts` | `codigosRepetidos` | 5 | 2026-09-29 · `0d4c44599` (antes: `components/ProductoForm.tsx`) | `alta-producto.test.ts` |  |
| `lib/movimientos-atajos.ts` | `atajosDeMovimiento` | 46 | 2026-09-29 · #589 (antes: `components/MovimientosLista.tsx`) | `movimientos-atajos.test.ts` |  |
| `lib/movimientos-atajos.ts` | `atajosDeOperacion` | 16 | 2026-09-29 · #589 (antes: `components/FilaMovimiento.tsx`) | `movimientos-atajos.test.ts` |  |
| `lib/marcas.ts` | `marcaAutomatica` | 4 | 2026-09-28 · #578 (antes: `components/alta-producto/ElegirMarcaProveedor.tsx`) | `marcas.test.ts` |  |
| `lib/marcas.ts` | `proveedorAutomatico` | 5 | 2026-09-28 · #578 (antes: `components/alta-producto/ElegirMarcaProveedor.tsx`) | `marcas.test.ts` |  |
| `lib/caja-panel-reglas.ts` | `escalaTurno` | 8 | 2026-09-26 · #489 (antes: `components/CajaAbiertaPanel.tsx`) | `caja-panel-reglas.test.ts` | sí |
| `lib/alta-producto.ts` | `desbloqueos` | 14 | 2026-09-25 · #395 (antes: `components/NuevoProductoForm.tsx`) | `alta-producto.test.ts` |  |
| `lib/marcas.ts` | `buscarMarcaProveedor` | 43 | 2026-09-25 · #395 (antes: `components/alta-producto/ElegirMarcaProveedor.tsx`) | `marcas.test.ts` |  |
| `lib/facturacion-actividad.ts` | `accionDeLaFila` | 9 | 2026-09-22 · #287 (antes: `components/ActividadDeHoy.tsx`) | `facturacion-actividad.test.ts` |  |
| `lib/facturacion-actividad.ts` | `camposDeBusquedaDeLaFila` | 18 | 2026-09-22 · #287 (antes: `components/ActividadDeHoy.tsx`) | `facturacion-actividad.test.ts` |  |
| `lib/facturacion-actividad.ts` | `detalleDeLaFila` | 9 | 2026-09-22 · #287 (antes: `components/ActividadDeHoy.tsx`) | `facturacion-actividad.test.ts` |  |
| `lib/facturacion-actividad.ts` | `enlazarVentasConComprobantes` | 9 | 2026-09-22 · #287 (antes: `app/(app)/vender/facturacion/page.tsx`) | `facturacion-actividad.test.ts` |  |
| `lib/facturacion-actividad.ts` | `estadoDeLaFila` | 5 | 2026-09-22 · #287 (antes: `components/ActividadDeHoy.tsx`) | `facturacion-actividad.test.ts` |  |
| `lib/facturacion-actividad.ts` | `etapasDelHilo` | 26 | 2026-09-22 · #287 (antes: `components/ui/HiloComprobante.tsx`) | `facturacion-actividad.test.ts` |  |
| `lib/facturacion-comprobantes-reglas.ts` | `seriesFaltantes` | 14 | 2026-09-22 · #287 (antes: `components/ComprobantesPanel.tsx`) | `facturacion-comprobantes-reglas.test.ts` | sí |
| `lib/facturacion-comprobantes-reglas.ts` | `textoDeSeriesFaltantes` | 7 | 2026-09-22 · #287 (antes: `components/ComprobantesPanel.tsx`) | `facturacion-comprobantes-reglas.test.ts` | sí |
| `lib/facturacion-proformas-reglas.ts` | `franjaDeProformas` | 10 | 2026-09-22 · #287 (antes: `components/FranjaProformas.tsx`) | `facturacion-proformas-reglas.test.ts` | sí |
| `lib/facturacion-resumen-reglas.ts` | `comparativoEnCantidad` | 6 | 2026-09-22 · #287 (antes: `components/ResumenTarjetas.tsx`) | `facturacion-resumen-reglas.test.ts` | sí |
| `lib/facturacion-resumen-reglas.ts` | `comparativoEnPorcentaje` | 7 | 2026-09-22 · #287 (antes: `components/ResumenTarjetas.tsx`) | `facturacion-resumen-reglas.test.ts` | sí |
| `lib/facturacion-resumen-reglas.ts` | `horaDeReloj` | 5 | 2026-09-22 · #287 (antes: `components/ResumenTarjetas.tsx`) | `facturacion-resumen-reglas.test.ts` | sí |
| `lib/facturacion-resumen-reglas.ts` | `tonoPorEnviar` | 6 | 2026-09-22 · #287 (antes: `components/ResumenTarjetas.tsx`) | `facturacion-resumen-reglas.test.ts` | sí |
| `lib/facturacion-resumen-reglas.ts` | `tonoVendidoHoy` | 7 | 2026-09-22 · #287 (antes: `components/ResumenTarjetas.tsx`) | `facturacion-resumen-reglas.test.ts` | sí |
| `lib/facturacion-resumen-reglas.ts` | `ventasUnicas` | 7 | 2026-09-22 · #287 (antes: `components/ResumenTarjetas.tsx`) | `facturacion-resumen-reglas.test.ts` | sí |
| `lib/produccion-menu.ts` | `hijosMenuCompras` | 6 | 2026-09-21 · `518132fbe` (antes: `components/AppShell.tsx`) | `produccion-menu.test.ts` |  |
| `lib/produccion-menu.ts` | `hijosMenuProduccion` | 3 | 2026-09-21 · `518132fbe` (antes: `components/AppShell.tsx`) | `produccion-menu.test.ts` |  |
| `lib/produccion-menu.ts` | `puedeVerCompras` | 7 | 2026-09-21 · `518132fbe` (antes: `lib/produccion-menu.ts`) | `produccion-menu.test.ts` |  |
| `lib/recepciones-reglas.ts` | `resumenConteo` | 11 | 2026-09-19 · #172 (antes: `components/RecepcionCompraFormV2.tsx`) | `recepciones-reglas.test.ts` | sí |
| `lib/panel-serie.ts` | `hastaEstaHora` | 9 | 2026-09-12 · `0af2f1b54` (antes: `lib/panel.ts`) | `panel-serie.test.ts` |  |
| `lib/panel-serie.ts` | `INDICE_SEMANA_PASADA` | 2 | 2026-09-12 · `0af2f1b54` (antes: `lib/panel.ts`) | `panel-serie.test.ts` |  |
| `lib/panel-serie.ts` | `indiceEnSerie` | 8 | 2026-09-12 · `0af2f1b54` (antes: `lib/panel.ts`) | `panel-serie.test.ts` |  |
| `lib/panel-serie.ts` | `inicioDeLaVentana` | 4 | 2026-09-12 · `0af2f1b54` (antes: `lib/panel.ts`) | `panel-serie.test.ts` |  |

#### E. Nunca tuvieron pantalla en `main` — 18 símbolos, 147 líneas

| Archivo | Símbolo | Líneas | Sin pantalla desde | Su prueba | En `SIN_USO_CONOCIDAS` |
|---|---|---:|---|---|:-:|
| `lib/plan-piso-familias.ts` | `textoDeRepartoParaLector` | 2 | nunca · nació 2026-10-12 · `3b1fafcc3` | `plan-piso-familias.test.ts` |  |
| `lib/frescura-piso.ts` | `conteoDeFamilia` | 14 | nunca · nació 2026-10-10 · `bd5b3c6f7` | `frescura-piso.test.ts` |  |
| `lib/motor-demanda-reglas.ts` | `faltasDe` | 2 | nunca · nació 2026-10-05 · #823 | `motor-demanda-reglas.test.ts` |  |
| `lib/movimientos-tipos.ts` | `grupoDeTipo` | 4 | nunca · nació 2026-10-05 · #822 | `movimientos-tipos.test.ts` |  |
| `lib/productos-filtro-precio.ts` | `montoParaUrl` | 6 | nunca · nació 2026-10-02 · #723 | `productos-filtro-precio.test.ts` |  |
| `lib/productos-orden.ts` | `ordenPorVentas` | 5 | nunca · nació 2026-09-29 · `781f66bcf` | `productos-orden.test.ts` |  |
| `lib/foto-encuadre.ts` | `esFotoEncuadrada` | 4 | nunca · nació 2026-09-26 · #491 | `foto-encuadre.test.ts` |  |
| `lib/alta-producto.ts` | `pasoAlcanzable` | 5 | nunca · nació 2026-09-25 · #395 | `alta-producto.test.ts` |  |
| `lib/por-pagar-consolidado-reglas.ts` | `ordenarPorVencimiento` | 4 | nunca · nació 2026-09-25 · #396 | `por-pagar-consolidado-reglas.test.ts` | sí |
| `lib/presupuesto-reglas.ts` | `filasQueSePasan` | 3 | nunca · nació 2026-09-25 · #396 | `presupuesto-reglas.test.ts` |  |
| `lib/sin-conexion-reglas.ts` | `pantallaSinConexion` | 5 | nunca · nació 2026-09-25 · #436 | `sin-conexion-reglas.test.ts` | sí |
| `lib/configuracion-reglas.ts` | `textoEfecto` | 8 | nunca · nació 2026-09-24 · #390 | `configuracion-reglas.test.ts` | sí |
| `lib/reparto-reglas.ts` | `textoTeToca` | 6 | nunca · nació 2026-09-19 · #203 | `reparto-reglas.test.ts` | sí |
| `lib/caja-panel-reglas.ts` | `egresosElevados` | 5 | nunca · nació 2026-09-18 · #128 | `caja-panel-reglas.test.ts` | sí |
| `lib/caja-panel-reglas.ts` | `rangoHorasCaja` | 11 | nunca · nació 2026-09-18 · #128 | `caja-panel-reglas.test.ts` | sí |
| `lib/caja-panel-reglas.ts` | `senalCaja` | 11 | nunca · nació 2026-09-18 · #128 | `caja-panel-reglas.test.ts` | sí |
| `lib/caja-panel-reglas.ts` | `tendenciaCierres7Dias` | 37 | nunca · nació 2026-09-18 · #128 | `caja-panel-reglas.test.ts` | sí |
| `lib/caja-panel-reglas.ts` | `ventasPorHora` | 15 | nunca · nació 2026-09-18 · #128 | `caja-panel-reglas.test.ts` | sí |

#### C. La prueba vigila una copia — 4 símbolos, 15 líneas

| Archivo | Símbolo | Líneas | Sin pantalla desde | Su prueba | En `SIN_USO_CONOCIDAS` |
|---|---|---:|---|---|:-:|
| `lib/club-cumple-canje-reglas.ts` | `anioLima` | 2 | nunca · nació 2026-10-01 · #671 | `club-cumple-canje-reglas.test.ts` |  |
| `lib/etiqueta-campana-guia.ts` | `campanaValida` | 7 | nunca · nació 2026-09-30 · #646 | `etiqueta-campana-guia.test.ts` |  |
| `lib/existencias-pistola.ts` | `esRafaga` | 4 | nunca · nació 2026-10-06 · #833 | `existencias-pistola.test.ts` |  |
| `lib/recepcion-envio-reglas.ts` | `textoRecibido` | 2 | nunca · nació 2026-10-13 · #1035 | `recepcion-envio-reglas.test.ts` |  |

#### A. Oráculos de prueba — 22 símbolos, 203 líneas

| Archivo | Símbolo | Líneas | Sin pantalla desde | Su prueba | En `SIN_USO_CONOCIDAS` |
|---|---|---:|---|---|:-:|
| `lib/bajada-desde-vender.ts` | `PARAMETROS_RPC_BAJADA_DESDE_VENDER` | 1 | nunca · nació 2026-10-03 · #764 | `bajada-desde-vender.test.ts` |  |
| `lib/bajada-en-mano.ts` | `PARAMETROS_RPC_EN_MANO` | 1 | nunca · nació 2026-10-05 · `bfdf2608f` | `bajada-en-mano.test.ts` |  |
| `lib/bajada-en-mano.ts` | `TOPE_DEL_DIA_EN_MANO` | 2 | nunca · nació 2026-10-05 · `bfdf2608f` | `bajada-en-mano.test.ts` |  |
| `lib/bajada-reglas.ts` | `PARAMETROS_RPC_BAJADA` | 1 | nunca · nació 2026-09-25 · #434 | `bajada-reglas.test.ts` |  |
| `lib/capacidad-piso.ts` | `FAMILIAS_DEL_RIEL` | 11 | nunca · nació 2026-10-05 · `5b0286836` | `capacidad-piso.test.ts` |  |
| `lib/danadas-reglas.ts` | `PARAMETROS_RPC_ARREGLAR` | 1 | nunca · nació 2026-10-05 · `16837a352` | `danadas-reglas.test.ts` |  |
| `lib/danadas-reglas.ts` | `PARAMETROS_RPC_REPORTAR` | 1 | nunca · nació 2026-10-05 · `16837a352` | `danadas-reglas.test.ts` |  |
| `lib/guias/registro.ts` | `PANTALLAS` | 141 | nunca · nació 2026-09-25 · #436 | `guias.test.ts` |  |
| `lib/guias/registro.ts` | `PENDIENTES_HOY` | 2 | nunca · nació 2026-09-29 · #623 | `guias.test.ts` |  |
| `lib/marcas.ts` | `FILTROS_MARCAS` | 1 | nunca · nació 2026-10-10 · #930 | `marcas.test.ts` |  |
| `lib/menu.ts` | `TIPOS_UBICACION` | 1 | nunca · nació 2026-09-21 · `518132fbe` | `menu.test.ts`, `modulos.test.ts` |  |
| `lib/modelo-nuevo-reglas.ts` | `BORRADOR_VACIO` | 1 | nunca · nació 2026-10-10 · `bd4ce8710` | `modelo-nuevo-reglas.test.ts`, `orden-carga-util.test.ts`, `orden-tabla-reglas.test.ts` |  |
| `lib/padron.ts` | `reiniciarSunatPublico` | 4 | nunca · nació 2026-09-29 · #628 | `padron.test.ts` |  |
| `lib/para-enviar-reglas.ts` | `PARAMETROS_RPC_SUBIR_PARA_ENVIAR` | 1 | nunca · nació 2026-10-05 · `5c0fa26de` | `para-enviar-reglas.test.ts` |  |
| `lib/producto-cambios-reglas.ts` | `CAMPOS_CUBIERTOS` | 20 | nunca · nació 2026-09-28 · `abd7a7d24` | `producto-cambios-reglas.test.ts` |  |
| `lib/responsable-reglas.ts` | `LISTA_VACIA` | 1 | nunca · nació 2026-09-22 · #285 | `responsable-reglas.test.ts` |  |
| `lib/retiro-reglas.ts` | `PARAMETROS_RPC_RETIRO` | 1 | nunca · nació 2026-10-01 · #682 | `retiro-reglas.test.ts` |  |
| `lib/sugerencias-orden-insumo.ts` | `MAX_CANTIDAD` | 3 | nunca · nació 2026-09-29 · #615 | `sugerencias-orden-insumo.test.ts` |  |
| `lib/sugerencias-orden-insumo.ts` | `MAX_DESCRIPCION` | 1 | nunca · nació 2026-09-30 · #645 | `sugerencias-orden-insumo.test.ts` |  |
| `lib/sugerencias-orden-produccion.ts` | `MAX_NOTA_ORDEN` | 2 | nunca · nació 2026-10-10 · `bd4ce8710` | `sugerencias-orden-produccion.test.ts` |  |
| `lib/sugerencias-orden-produccion.ts` | `TIPOS_DE_ORDEN` | 1 | nunca · nació 2026-10-10 · `bd4ce8710` | `sugerencias-orden-produccion.test.ts` |  |
| `lib/tamano-grilla.ts` | `ANCHO_MINIMO_TARJETA` | 5 | nunca · nació 2026-09-29 · `781f66bcf` | `tamano-grilla.test.ts` |  |

#### B. Archivos que existen para las pruebas — 5 archivos, 634 líneas

| Archivo | Líneas | Qué es | Lo leen |
|---|---:|---|---|
| `lib/guia-de-foco-pantallas.ts` | 384 | El tablero de la guía de foco (ADR-0284) | `guia-de-foco.test.ts`, `scripts/focus/escanear.mjs`, `scripts/abrir-pr/choques.mjs` |
| `lib/sugerir-archivos.ts` | 89 | La deuda de las sugerencias coherentes (ADR-0290) | `sugerir.test.ts`, `scripts/abrir-pr/choques.mjs` |
| `lib/tema-colores-archivos.ts` | 57 | Los archivos con color fijo a propósito (ADR-0336) | `tema-colores.test.ts` |
| `lib/piso-plan-fixtures.ts` | 69 | Datos de prueba | `existencias-tarjeta-compacta.test.ts`, `existencias-tarjetas.test.ts`, `inicio-almacen-reglas.test.ts` |
| `lib/ya-emitido-fixture.ts` | 35 | Datos de prueba | `resolver-ya-emitido.test.ts`, `ya-emitido-reglas.test.ts` |

#### F. Aparte — 8 símbolos y 1 archivo, 246 líneas

| Archivo | Símbolo | Líneas | Sin pantalla desde | Su prueba | En `SIN_USO_CONOCIDAS` |
|---|---|---:|---|---|:-:|
| `lib/registro-contable.ts` | `construirLineas` | 39 | 2026-09-12 · `0af2f1b54` (antes: `components/RegistroContableForm.tsx`) | `registro-contable.test.ts` |  |
| `lib/registro-contable.ts` | `opcionesPrincipal` | 17 | 2026-09-12 · `0af2f1b54` (antes: `components/RegistroContableForm.tsx`) | `registro-contable.test.ts` |  |
| `lib/registro-contable.ts` | `sumaDebe` | 3 | 2026-09-12 · `0af2f1b54` (antes: `components/RegistroContableForm.tsx`) | `registro-contable.test.ts` |  |
| `lib/registro-contable.ts` | `sumaHaber` | 3 | 2026-09-12 · `0af2f1b54` (antes: `components/RegistroContableForm.tsx`) | `registro-contable.test.ts` |  |
| `lib/codigo128.ts` | (archivo entero) | 157 | 2026-10-06 · #858 (antes: `components/Codigo128.tsx`); hoy solo `scripts/etiquetas/hoja-de-prueba.mjs` | — |  |
| `lib/qr.ts` | `puntosPorModuloQR` | 8 | nunca · nació 2026-09-10 · `397e66682`; solo `scripts/etiquetas/hoja-de-prueba.mjs` | — |  |
| `lib/terminales-reglas.ts` | `resolverTienda` | 14 | nunca · nació 2026-09-22 · #285; el script usa su copia de `scripts/terminales/reglas.mjs` | `terminales-reglas.test.ts` | sí |
| `lib/compras-mi-parte-reglas.ts` | `partesPorPagar` | 4 | 2026-10-13 · #1034 (antes: `app/(app)/compras/por-pagar/page.tsx`); hoy solo `MisPartesDeCompras.tsx`, en `ignore` | `compras-mi-parte-reglas.test.ts` |  |
| `lib/clienta-ticket-reglas.ts` | `dniEnmascarado` | 1 | 2026-10-01 · #673 (pasó a `numeroEnmascarado`, `documento-clienta-reglas.ts`; queda el alias) | `vender-conectado.test.ts` |  |
