import type { KnipConfig } from "knip";

// Knip (ADR-0406): busca el código que nadie usa —archivos que nadie importa, exportaciones que nadie lee, dependencias que nadie
// carga— en las tres piezas del monorepo y en los scripts de la raíz. Corre en el CI (`pnpm knip`) y falla si aparece código muerto
// nuevo. Lo que está aquí abajo es lo único que se le enseña o se le perdona, cada cosa con su porqué.
//
// Qué cuenta como «usado». Las pruebas cuentan (Knip toma cada `*.test.ts` como punto de entrada): una función que solo usa su
// propia prueba NO sale aquí. Esa otra mitad del código muerto la vigila `apps/web/lib/reglas-sin-uso.test.ts` (ADR-0234), solo
// para `lib/*-reglas.ts`.
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
        // `new Worker("/quitar-fondo.worker.js")` (ADR-0228).
        "public/sw.js",
        "public/quitar-fondo.worker.js",
        // Se leen como texto y se inyectan en la página que se mide (`tema/cli.mjs`, `unificar/cli.mjs`, `unificar/fotos.mjs`).
        "tema/motor/escaner-en-pagina.js",
        "unificar/motor/censo-en-pagina.js",
        // CLI de /unificar que se corre a mano (`node unificar/elegir.mjs <especificacion.json>`).
        "unificar/elegir.mjs",
      ],
      project: ["**/*.{ts,tsx,mjs,js,css}"],
      ignore: [
        // La pieza de «Cancelar y el pie de una hoja», elegida por Felipe el 2026-10-14 (ronda 11 de /unificar, ADR-0358): nace
        // antes que sus primeros usos. Sale de aquí cuando la use la primera hoja.
        "components/ui/PieAcciones.tsx",
        // «Mis partes de compras» dejó de dibujarse con ADR-0387 (2026-10-12), que dice que se retira junto con
        // `lib/compras-mi-parte*.ts` y la página `/compras/parte/[compraId]`. Su lectura es la única que llama
        // `fn_mis_partes_de_compras`: quitarla deja esa función de la base sin llamador (`pruebas:roles-cobertura` lo marca),
        // así que el retiro va entero, con su migración y el OK de Felipe.
        "components/MisPartesDeCompras.tsx",
      ],
    },
    "packages/*": {
      project: ["src/**/*.{ts,css}"],
    },
  },
};

export default config;
