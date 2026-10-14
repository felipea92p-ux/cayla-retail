# ADR-0406 — Knip vigila el código muerto en el CI

**Fecha:** 2026-10-14
**Estado:** Aceptado y construido (sin migración: `knip.ts`, `package.json`, un paso de `.github/workflows/ci.yml`).
**Decide:** Felipe pidió sumar Knip «para quitar el código muerto» (chat, 2026-10-14). Que sea un paso obligatorio del CI, la
configuración y qué se borró: este documento.
**Complementa:** [ADR-0234](0234-movimientos-leido-desde-la-tienda.md) (`lib/reglas-sin-uso.test.ts`, «probado = en
pantalla»). No lo reemplaza: miran mitades distintas del código muerto (abajo).

## El problema primero

El código que nadie usa no avisa. Hasta hoy se encontraba a mano: la limpieza del 2026-10-06 (rama `determined-thompson-f7b8d8`)
rehízo el grafo de imports con un script propio y borró 19 archivos; ocho días después había otra vez una docena de piezas sin
pantalla. La única red automática era `reglas-sin-uso.test.ts`, que mira solo las funciones de `lib/*-reglas.ts`. Nadie miraba un
componente, un hook, una lectura de servidor ni una dependencia: `@anthropic-ai/sdk` se instalaba en cada `pnpm install` desde que el
corte V1→V2 (2026-09-12) borró la importación con IA, la única que lo usaba.

El daño no es el peso. Es que una pieza muerta parece viva: se lee como «así funciona esto», se corrige cuando cambia algo a su lado,
y su prueba en verde dice que algo funciona cuando ninguna pantalla lo muestra (la historia de ADR-0234). Hoy había dos casos de esos:
el componente `SenalBuscando`, que `CLAUDE.md` todavía nombraba como «el campo dice Buscando…», y la tira `TiraFicha`, que la regla
de la guía de foco citaba como modelo de una ficha que se edita. Ninguna de las dos se dibujaba desde hacía días.

**Medido el 2026-10-14, sobre `main` (`9cb3f2d41`), con Knip 6.41.0:**

| | Primera pasada | Sin las usadas en su propio archivo | Falsos positivos | Muerto de verdad |
|---|---|---|---|---|
| Archivos | 8 | 8 | 5 (cargados por URL o leídos como texto) | 3 |
| Dependencias | 4 | 4 | 2 (`tailwindcss` y `tw-animate-css`, que se importan desde el CSS) | 2 |
| Exportaciones | 190 | 37 | 0 | 37 |
| Tipos exportados | 152 | 24 | 0 | 24 |

Tarda unos 3 segundos sobre el monorepo entero.

## Decidí

1. **Knip es un paso del job «Tipos, lint y pruebas»** (`pnpm knip --no-progress`, después de «Pruebas»): un archivo que nadie
   importa, una exportación que nadie lee, una dependencia que nadie carga o un binario sin declarar ponen el PR en rojo. Corre con
   la misma condición que los otros tres (siempre que la instalación haya funcionado).
2. **La configuración es `knip.ts`, no `knip.json`**, por dos razones: cada excepción lleva su porqué escrito al lado (principio 8),
   y Tailwind v4 necesita un compilador. `@import "tailwindcss"` vive en `app/globals.css`, no en un `.ts`; el compilador convierte
   cada `@import` de un CSS en un `import` que Knip entiende. De paso, un `.css` de `app/estilos/` que ya nadie importe sale como
   archivo sin uso (lo probé: sale).
3. **Una exportación que se usa dentro de su propio archivo no se reporta** (`ignoreExportsUsedInFile`). Eran 153 exportaciones y
   128 tipos: el valor se usa, solo sobra la palabra `export`. Cerrarlas tocaría ~150 archivos sin cambiar nada de lo que hace el ERP
   y chocaría con cada PR abierto.
4. **Las pruebas cuentan como uso.** Knip toma cada `*.test.ts` como punto de entrada, así que una función que solo usa su prueba no
   sale aquí. Esa mitad la sigue vigilando `reglas-sin-uso.test.ts` (solo `lib/*-reglas.ts`, con su lista `SIN_USO_CONOCIDAS`).
5. **Lo que se queda sin uso a propósito se declara**, nunca se calla con una regla general:
   - una exportación: la marca `@public` en su comentario, **con el motivo escrito ahí mismo** (como `// tema-fijo:` o
     `// sugerir-fijo:`);
   - un archivo entero: en `ignore` de `knip.ts`, con su comentario;
   - un falso positivo de la herramienta (un archivo que se carga por URL, un script que se inyecta en la página, un CLI que se corre
     a mano): en `entry` de `knip.ts`, que es lo que de verdad es.

### Lo que se borró (sin cambiar nada de lo que se ve ni de lo que se guarda)

- **Un archivo:** `components/ui/useArrastrarParaCerrar.ts` (la hoja de la prenda que se cerraba bajándola; desde ADR-0391 es un
  modal al centro).
- **Cinco componentes que ninguna pantalla dibujaba:** `TiraFicha` (la reemplazó «Lo que falta» del panel del taller, maqueta B,
  2026-10-02), `SenalBuscando` (la reemplazó `<Buscador buscando>`, ronda 5 de /unificar), `FotosAlta` (la grilla de fotos del alta;
  se quedan `useFotosPendientes` y `BotonFoto`, que sí se usan), `BotonVerDetalleCierre` (el historial abre el detalle desde su fila) y
  `ListaAbierta` (guía de impresión).
- **Cinco lecturas de servidor sin llamador,** y ninguna deja una función de la base sin quien la llame (`pruebas:roles-cobertura`
  marcaría eso): `getVentasDeHoy` (`fn_ventas_del_dia` la llaman Caja, Vender e Inicio), `getFichaClienta` (la ficha la lee el
  navegador con `cargarFichaClienta`, mismas RPC), `getTextosClub` (Vender llama `fn_club_textos_vigentes` directo),
  `listarMovimientosProducto` (`fn_movimientos` la llama `listarMovimientos`), `getTrasladosCerrados` y `leerRendimientoEquipo`.
- **Textos y reglas que quedaron huérfanos en un rediseño:** `TEXTO_REPORTE_YA_ESTABA` y `TEXTO_YA_ESTABA_SUBIDA` (el panel de la
  talla dice un solo «Esto ya estaba guardado. No se repitió.» para todo, `FlujoTalla.tsx`), `PREGUNTA_SE_PROBO` (la pregunta se
  retiró del ticket el 2026-10-02), `ALTO_CONTROL` (`h-9`, de cuando los campos medían 36 px; desde la ronda 6 miden 40),
  `COMPROBANTES` de `registro-contable.ts` (ADR-0198 ya decidió que esas reglas viven en SQL), y `tieneAlgoLibre`,
  `esAccionAnotable`, `nombreVer`, `TEXTO_ESTADO_FIJO`, `textoAvance`, `etiquetaMedio`, `fechaLargaES`, `modulosDeVersion`,
  `abonosDe`, `hayRedAhora`, `useAumento` y `esAnonima`. `nombreVer` sale también de `SIN_USO_CONOCIDAS`.
- **Reexportaciones que nadie pedía por ese camino** (20 tipos y 3 valores: `comprobantes.ts`, `clientas.ts`, `proformas.ts`,
  `compras-faltantes.ts`, `useStockEnVivo.ts`, `configuracion.ts`, `frescura.ts`, `conteos.ts`) y 4 tipos sin uso
  (`PasoConteo`, `Recepcion`, `ModuloDeRespaldo`, `ColumnaTablero`). En `piso-plan.ts`, `DIAS_ALCANCE_FALTA` deja de exportarse: era
  el mismo valor que `DIAS_VENTANA` con otro nombre y solo lo usa su archivo.
- **Dos dependencias:** `@anthropic-ai/sdk` y `@radix-ui/react-slot` (los componentes shadcn importan `Slot` de `radix-ui`; nota en
  ADR-0045).

### Lo que se queda, a la espera de Felipe

| Pieza | Por qué no se borró | Marca |
|---|---|---|
| `BotonConfirmar` y `lanzarChispas` (`ComprobanteBotonConfirmar.tsx`) | El destello de «comprobante saldado» no se ve desde el 2026-09-19: o vuelve a los modales de pago o se borra (backlog del 2026-10-06) | `@public` |
| `MisPartesDeCompras.tsx`, `getMisPartesDeCompras` y `porPagarConMiParte` | ADR-0387 dice que se retiran juntos con `lib/compras-mi-parte*.ts` y su página; las dos lecturas son las únicas que llaman `fn_mis_partes_de_compras` y `fn_deuda_visible`, así que el retiro lleva migración | `ignore` + `@public` |
| `PieAcciones.tsx` | Pieza elegida hoy en la ronda 11 de /unificar; nace antes que sus usos | `ignore` |
| `DIAS_PARA_VEREDICTO_DE_COMPROMISO` | **No es basura: es una regla escrita y no aplicada.** «De un compromiso se dice cómo va desde el día 7» nació con la libreta de Frescura (2026-09-30) y ningún código la lee. O se aplica o se borra | `@public` |
| `puntosPorModulo` (`codigo128.ts`) | Su autor la dejó «para explicar por qué eso está mal» | `@public` |

## Descarté

- **Quitar el `export` de las 281 exportaciones que solo usa su propio archivo.** No es código muerto y el diff tocaría la mitad de
  `lib/`, en un repo con varias sesiones a la vez.
- **El modo `--production` de Knip** (contar solo lo que llega a una pantalla, sin pruebas): sería `reglas-sin-uso.test.ts` para todo
  el repo, pero con la configuración de hoy no reconoce las rutas de Next como entrada y daba por sobrantes a todas las dependencias.
  Necesita su propio trabajo.
- **Una lista de deuda que «solo baja»**, como `PENDIENTES_HOY`. Con lo de arriba borrado no hay deuda que listar: Knip arranca en
  cero, y lo que se queda a propósito se declara una por una.
- **Callar `tailwindcss` y `tw-animate-css` con `ignoreDependencies`.** Se usan: el compilador lo dice, y además vigila los CSS.

## Se rompe si

- **Un PR abierto agrega una pieza que todavía no usa nadie** (un componente antes de su pantalla, una función para «cuando llegue»).
  Sale rojo al traer `main`. Es lo que se quiere: o la pieza llega con su uso, o se marca `@public` con el motivo.
- **Se carga un archivo de una forma que Knip no ve** (por URL, `readFileSync`, un `import()` armado en tiempo de ejecución): sale
  como archivo sin uso. Va en `entry` de `knip.ts`, con su comentario; nunca se borra solo porque Knip lo diga.
- **Se borra una lectura que es la única que llama una RPC.** Knip no lo sabe; `pruebas:roles-cobertura` sí (en el job de Postgres).
  Antes de borrar una función que llama `.rpc(…)`, mirar si alguien más la llama.

## Cómo se verifica

- `pnpm knip` en la raíz: sin nada que decir, sale con 0.
- Lo probé al revés: un archivo, una exportación y un CSS sin uso sembrados a propósito salen los tres y Knip sale con 1.
- `tsc` limpio, eslint limpio en lo tocado, `vitest` entero en verde (las huellas de las guías de Caja, Nuevo producto y Editar
  producto se aceptaron después de revisar que ningún paso hablaba de los controles borrados) y las pruebas de los escáneres de
  `/focus` y `/sugerir` en verde.
