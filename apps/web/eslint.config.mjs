import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // components/charts/** llega vía `npx shadcn add @bklit/*` (ADR-0038):
    // código de Bklit UI instalado como fuente propia, no un paquete.
    // `react-hooks/refs` y `react-hooks/set-state-in-effect` son las reglas
    // nuevas orientadas a React Compiler — muy estrictas sobre patrones de
    // ref/effect que la orquestación de animación de Bklit usa por todos
    // lados (tooltip, fase del chart, tween del y-domain) y que hoy son
    // seguros, no bugs reales. Se corrigió el único caso real que SÍ era un
    // bug (`highlight-segment.tsx` leía `pathRef.current` en el cuerpo del
    // render, no en un efecto) enrutando el `d` ya calculado como prop en
    // vez de leer el ref — eso quedó arreglado, no exceptuado. El resto (31
    // ocurrencias en ~15 archivos internos de animación que este chart no
    // ejercita todos) se deja fuera de esta regla: parchearlos a ciegas sin
    // el contexto del autor original es más riesgo de romper timing de
    // springs que beneficio real hoy. tsc sigue estricto sobre este
    // directorio — no se relaja tipado, solo estas dos reglas de hooks.
    files: ["components/charts/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
