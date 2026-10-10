# Formidable · Inventario ▸ Análisis   (`/inventario/resumen`)

- **Fecha / SHA:** 2026-10-10 · `25a7a330f` (rama `claude/core-analisis-variantes-prendas-39fd50`) · **Dispositivo que manda:** escritorio (Mac mini)
- **Pregunta que debería resolver (1 frase):** ¿qué modelo se acaba, cuál no se mueve, cuál nadie vio y qué pido? · **Protagonista:** el modelo (la prenda)
- **Corrida:** `rapido` — solo el paso 1 (medir), sin agentes, sin prueba ciega ni escéptico. Las notas de las 9 leyes **no se ponen**: no hay
  evidencia Observada. Motivo de la corrida: cierre de la decisión 12 de ADR-0357 (Análisis mide por modelo).

## Historial
| Fecha | Corrida | Leyes | Oficio | Qué cambió |
|---|---|---|---|---|
| 2026-10-10 | rápido (solo medir) | sin calificar | sin calificar | Análisis pasa de tallas sueltas a modelos (ADR-0357 decisión 12) |

## Medido (pestaña «Nunca salió al piso», datos de la base local, Tienda Lima)
- **1440 × 900:** sin desborde ni huecos fuera de escala. Dentro de Análisis: el «?» de ayuda de cada grupo del carril mide 18 × 18 (< 24 con
  mouse) y el chip «Datos confiables» 20 px de alto; bordes de las pestañas que no calzan por 1 px (312/313, 331/332, 944/945). Las tres piezas
  ya estaban antes de este cambio. El medidor marca 1,06:1 en la pestaña activa: **falso positivo** (su fondo oscuro no lo ve el script; en la
  captura se lee crema sobre negro).
- **1024 × 768:** lo mismo; sin scroll horizontal; la línea nueva bajo cada nombre («2 colores · S, M, L») no se corta.
- **375 × 812:** sin scroll horizontal; la línea de colores y tallas cabe (68 a 127 px). Los blancos bajo 44 px son del marco del ERP (menú,
  cabecera), no de Análisis.
- **Escáneres:** `pnpm sugerir`: 0 ejemplos estáticos. `pnpm focus` marca `/inventario/resumen` «sin registro», pero el registro la tiene como
  `no-aplica` y `lib/guia-de-foco.test.ts` pasa: el escáner no lee esa entrada (está escrita en varias líneas). Falsa alarma del escáner.
- **Tema (`tema:auditar --escenarios`):** Hoy, Se está acabando, No se vende, la hoja de confianza y la ficha sin hallazgos; «Qué pedir», 2
  contrastes solo en oscuro (4,09:1) en las cifras de la curva de tallas, previos a este cambio.

## Lo que falta para calificar
Prueba ciega (¿se entiende «2 colores · S, M, L» y «Falta L Beige» sin explicar?), una encargada real, y el escéptico sobre los hallazgos.
