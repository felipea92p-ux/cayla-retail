import type { KnipConfig } from "knip";

// Knip (ADR-0406): busca el código que nadie usa —archivos que nadie importa, exportaciones que nadie lee, dependencias que nadie
// carga— en las tres piezas del monorepo y en los scripts de la raíz. Corre dos veces en el CI y cada una falla si aparece código
// muerto nuevo. Lo que está aquí abajo es lo único que se le enseña o se le perdona, cada cosa con su porqué.
//
// Las dos corridas. `pnpm knip` cuenta las pruebas como uso (toma cada `*.test.ts` como punto de entrada): ve lo que no usa NADIE.
// `pnpm knip:produccion` corre `knip --production`, que no cuenta las pruebas y parte solo de lo que llega a la tienda (las rutas de
// Next, `proxy.ts`, los dos archivos de `public/`): ve lo que SOLO usan las pruebas, la otra mitad (ADR-0406, actualización del
// 2026-10-14; antes la miraba `reglas-sin-uso.test.ts`, solo en `lib/*-reglas.ts`). Su deuda de antes vive en
// `scripts/knip/deuda-produccion.mjs` y solo baja. Una exportación que existe PARA su prueba (la constante que la prueba cruza con
// la migración, el tope de un placeholder, la lista de todos los valores de un tipo) se declara con `@internal` y el motivo en su
// comentario: Knip la perdona solo en la corrida de producción, y en la otra sigue exigiendo que la prueba la use.
//
// El `!` de los patrones. Con `--production`, Knip solo ANALIZA los archivos de `project` marcados con `!` (de los demás sigue los
// imports, pero no anota qué usan) y vuelve negación todo patrón sin `!`. Por eso lo que llega a la tienda lleva `!` y las
// herramientas no: sin el `!`, la corrida de producción daba por sobrantes todas las dependencias. Una carpeta nueva en
// `apps/web` se suma a uno de los dos grupos.
//
// Una exportación que se usa dentro de su propio archivo tampoco sale (`ignoreExportsUsedInFile`). No es código muerto —el valor
// se usa—, solo una puerta abierta de más: cerrarla tocaría ~150 archivos sin cambiar nada de lo que hace el ERP, y chocaría con
// cada PR abierto.
//
// Lo que se queda a propósito sin uso (una decisión de Felipe pendiente, una pieza recién elegida que aún no se adopta) se marca
// con `@public` en su comentario, junto al código y con el motivo escrito; o, si es un archivo entero, en `ignore` de aquí abajo.

// Tailwind v4 se carga desde el CSS (`@import "tailwindcss"` en `app/globals.css`), no desde un `.ts`: sin esto Knip daría por
// sobrantes `tailwindcss` y `tw-animate-css`. De paso, un `.css` de `app/estilos/` que ya nadie importe sale como archivo sin uso.
const importsDelCss = (texto: string) =>
  [...texto.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map(([, ruta]) => `import "${ruta}";`).join("\n");

const produccion = process.argv.includes("--production");

const config: KnipConfig = {
  compilers: { css: importsDelCss },
  ignoreExportsUsedInFile: true,
  // `supabase` es la CLI (en el CI va por `npx supabase`, no como dependencia) y `uptime`, el comando del sistema que lee la carga
  // de la máquina en `scripts/carga/carga.mjs`.
  ignoreBinaries: ["supabase", "uptime"],
  workspaces: {
    ".": {
      // Los scripts de la raíz se corren a mano, desde las skills o desde el CI: cada uno es un punto de entrada, y también lo que
      // un script lee como texto para armar una página (`flujo-de-negocio/guia/motor.css` y `motor.js`, que `generar-guia.mjs` pega
      // en el HTML). Se suman para que lo que importan de `apps/web/lib` (p. ej. `codigo128.ts`, que lee
      // `scripts/etiquetas/hoja-de-prueba.mjs`) cuente como usado.
      entry: ["scripts/**/*.{mjs,js,ts,css}"],
      // `css` en los tres `project` aunque solo la web tenga hojas importadas: el compilador de arriba es de todo el repo, y sin la
      // extensión Knip avisa en cada corrida que no seguiría los `@import` de un CSS que naciera aquí.
      project: ["scripts/**/*.{mjs,js,ts,css}"],
    },
    "apps/web": {
      // Las rutas de Next (`app/**`, `proxy.ts`), las pruebas de Vitest y los CLI de `package.json` los encuentra Knip solo. Estos no:
      entry: [
        // Se cargan por URL desde el navegador: `navigator.serviceWorker.register("/sw.js")` (ADR-0210) y
        // `new Worker("/quitar-fondo.worker.js")` (ADR-0228). Llegan a la tienda: llevan `!`.
        "public/sw.js!",
        "public/quitar-fondo.worker.js!",
        // Se leen como texto y se inyectan en la página que se mide (`tema/cli.mjs`, `unificar/cli.mjs`, `unificar/fotos.mjs`).
        "tema/motor/escaner-en-pagina.js",
        "unificar/motor/censo-en-pagina.js",
        // CLI de /unificar que se corre a mano (`node unificar/elegir.mjs <especificacion.json>`).
        "unificar/elegir.mjs",
      ],
      project: [
        // Lo que llega a la tienda.
        "{app,components,lib}/**/*.{ts,tsx,css}!",
        "public/**/*.js!",
        "*.{ts,mjs,js}!",
        // Las herramientas de desarrollo (/tema, /unificar, /guia, /multi-view-responsive): solo en la corrida normal.
        "{tema,unificar,guias,responsive}/**/*.{ts,tsx,mjs,js,css}",
      ],
      // Archivos que existen PARA las pruebas: los registros de deuda que leen sus candados y los datos de prueba compartidos. En
      // producción no son sobrantes; en la corrida normal no hace falta perdonarlos (los importan sus pruebas), y perdonarlos ahí
      // haría que Knip avisara de un `ignoreFiles` de más.
      ...(produccion
        ? {
            ignoreFiles: [
              "lib/{guia-de-foco-pantallas,sugerir-archivos,tema-colores-archivos}.ts",
              "lib/*-fixture{,s}.ts",
            ],
          }
        : {}),
      ignore: [
        // «Mis partes de compras» dejó de dibujarse con ADR-0387 (2026-10-12), que dice que se retira junto con
        // `lib/compras-mi-parte*.ts` y la página `/compras/parte/[compraId]`. Su lectura es la única que llama
        // `fn_mis_partes_de_compras`: quitarla deja esa función de la base sin llamador (`pruebas:roles-cobertura` lo marca),
        // así que el retiro va entero, con su migración y el OK de Felipe.
        "components/MisPartesDeCompras.tsx",
      ],
    },
    // La tienda online (ADR-0408), una app aparte. Sus rutas y pruebas las encuentra Knip solo, como en la web.
    "apps/tienda": {
      project: [
        // Lo que llega a la tienda publicada.
        "{app,components,lib}/**/*.{ts,tsx,css}!",
        "*.{ts,mjs,js}!",
        // `scripts/rol-local.mjs` crea el usuario de la base LOCAL (`pnpm --filter tienda rol-local`): solo en la corrida normal.
        "scripts/**/*.mjs",
      ],
      ignore: [
        // «Agregar a la bolsa» (la ficha y las tarjetas) y el ícono de la bolsa de la cabecera (actividad 7, ADR-0408): nacen antes que
        // su primer uso, porque la ficha, las tarjetas y la cabecera las arman a la vez las actividades 4 y 5. Salen de aquí cuando la
        // integración de la tienda los ponga en su lugar.
        "components/bolsa/{AgregarALaBolsa,BotonBolsa}.tsx",
        // «Avísame cuando llegue» (actividad 12) nace antes que la ficha que lo usa (actividad 4): sale de aquí cuando la integración
        // lo ponga en la ficha.
        "components/club/BotonAvisame.tsx",
      ],
    },
    "packages/*": {
      project: ["src/**/*.{ts,css}!"],
    },
  },
};

export default config;
