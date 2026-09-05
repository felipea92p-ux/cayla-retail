// Fase 0.5 del plan de reemplazo de Alegra (~/.claude/plans/cozy-gathering-nova.md):
// fuente única de los tokens de identidad CAYLA, para que las 5 pantallas nuevas
// de Finanzas (Facturación/Ingresos/Egresos/EERR/Resumen) no reinventen su propio
// gris/borde/hover cada una — el mismo error que le costó a Airbnb tener sistemas
// de diseño paralelos en 2018 (hallazgo de la Ronda 2 de investigación).
//
// LA FUENTE VISUAL REAL sigue siendo `apps/web/app/globals.css` (bloque `@theme`
// de Tailwind v4 — no hay tailwind.config.js en este repo, Tailwind v4 lee el CSS
// directo). Este archivo es el espejo tipado para lógica NO-css que necesite estos
// valores (cálculo de contraste, generación de PDF/print de comprobantes, charts).
// Si cambia un valor acá, cambia también en globals.css — no hay sincronización
// automática todavía (equipo de una persona; ver "metodologia_design_systems",
// Ronda 2: no vale la pena un pipeline de sync para 10 tokens).

export const COLOR_TOKENS = {
  rojo: { $value: "#b8412d", $type: "color", $description: "Acento sagrado. Nunca decoración. Máx. 2 usos por pantalla." },
  crema: { $value: "#f5f0e8", $type: "color", $description: "Fondo dominante. Nunca blanco puro." },
  tinta: { $value: "#1a1a18", $type: "color", $description: "Todo el texto. Nunca negro absoluto." },
  rojoProfundo: { $value: "#8b2a1f", $type: "color", $description: "Variante oscura del rojo — hover/active del acento, nunca un segundo acento." },
  sand: { $value: "#e8e0d0", $type: "color", $description: "Bordes y recuadros neutrales. También la base de hover: bg-sand o bg-sand/40 (ya usado en 8 componentes) — no crear un token de 'hover' aparte." },
  taupe: { $value: "#a47865", $type: "color", $description: "Jerarquía interna cálida, uso puntual." },
  papel: { $value: "#fbf8f2", $type: "color", $description: "Crema un punto más clara, para tarjetas sobre crema (.card-cayla)." },
  tintaSecundaria: { $value: "#5b544c", $type: "color", $description: "Texto secundario cálido / estado inactivo — cubre el rol de 'gris medio' sin agregar una escala numérica nueva." },
  verde: { $value: "#5f7a52", $type: "color", $description: "Semántico: va bien / hecho. Separado del acento, jamás decoración." },
  ambar: { $value: "#b0812f", $type: "color", $description: "Semántico: al filo / en proceso." },
} as const;

export const TYPE_TOKENS = {
  serif: { $value: "var(--font-eb-garamond), ui-serif, Georgia, serif", $type: "fontFamily", $description: "Cifras y titulares — el número ES el titular de una pantalla financiera (hallazgo Hermès, Ronda 1). Nunca en tablas densas ni filas de datos." },
  sans: { $value: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif", $type: "fontFamily", $description: "Tablas, navegación, formularios, metadatos." },
} as const;

// Corrección 2026-09-05 (confirmado con Felipe): el brandbook pide cero bordes
// redondeados — el .card-cayla/botones/inputs se habían desviado a 8-18px.
// Ver globals.css para el detalle; estos son 0 en TODA la app, no solo Finanzas.
export const RADIUS_TOKENS = {
  sm: { $value: "0px", $type: "dimension" },
  md: { $value: "0px", $type: "dimension" },
  lg: { $value: "0px", $type: "dimension" },
  xl: { $value: "0px", $type: "dimension" },
  "2xl": { $value: "0px", $type: "dimension" },
} as const;

export const SHADOW_TOKENS = {
  none: { $value: "none", $type: "shadow", $description: "El sistema no usa sombras — ninguna excepción." },
} as const;

/**
 * Contraste WCAG medido (Ronda 2, hallazgos intuit_harmony + apple_hig) —
 * número, no "se ve bien" (principio 10 del CLAUDE.md global: Jeff Dean).
 *
 *   Rojo  sobre Crema = 4.83:1  → PASA AA para texto (4.5:1), por margen angosto
 *   Tinta sobre Crema = 15.36:1 → excelente
 *   Rojo  sobre Tinta = 3.18:1  → NO PASA AA para texto — solo sirve como
 *                                 elemento gráfico (barra, ícono, borde ≥3:1),
 *                                 JAMÁS como color de letras sobre fondo Tinta.
 *
 * Regla dura para los 5 módulos de Finanzas: si un componente necesita texto
 * en Rojo sobre un fondo oscuro, el fondo no puede ser Tinta pura — usar Tinta
 * como color de FONDO con Rojo como gráfico (borde, ícono), nunca como letra.
 */
export const ROJO_NUNCA_TEXTO_SOBRE_TINTA = true;

/**
 * Límite duro de uso del acento — no una convención de docs/, un valor que los
 * componentes (TarjetaIndicador, TablaFinanciera) pueden importar y hacer
 * cumplir en runtime/props (Ronda 2, hallazgo airbnb_dls: una regla que solo
 * vive en documentación se erosiona bajo presión de fecha).
 */
export const MAX_ROJO_POR_PANTALLA = 2;
