import { defineConfig } from "vitest/config";

// La prueba de `diseno.test.ts` lee `heroe.css` como texto (`?raw`); por defecto vitest vacía los .css.
export default defineConfig({ test: { css: { include: [/heroe\.css/] } } });
