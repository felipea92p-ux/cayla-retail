# 2026-11-16 · Auditoría y corrección responsive de todo el ERP (375 · 768 · 1280 · 1440)

- **Qué:** se mapearon las 148 pantallas por módulo (12 lectores + 12 escépticos: 241 riesgos verificados) y se midieron 120 en vivo con un barrido
  nuevo y reutilizable (`apps/web/responsive/barrido.mjs`, `pnpm --filter web responsive:barrido`). Se aplicaron **254 correcciones de presentación**
  en 12 módulos (un agente y un revisor por módulo; solo el del marco tocó las piezas compartidas), sin tocar estado, eventos, datos ni textos de negocio.
  La raíz más repetida: grillas que deciden sus columnas por el ancho de la VENTANA (`md:`/`lg:`) cuando el lateral fijo deja 456 px a 768 y 692 a 1024;
  pasaron a decidir por su contenedor (`@container` + `@min-[…]`). Felipe eligió mirando una demo con capturas reales del celular (artefacto
  «Decisiones responsive del ERP»): pie de hoja «cada uno a su medida» (1A), **íconos y puntos de color DIBUJADOS de 44 px con el dedo** (2B, act. de
  ADR-0611), **«…» en la línea que resume de Marcas** (3B), la sede que se acorta en la cabecera (4A) y **la mesa de Finanzas que se va al bajar en el
  celular** (5A, act. de ADR-0493). Informe completo: `docs/auditoria-responsive/2026-11-16/INFORME.md`.
- **Verificado:** `tsc` limpio, 168.410 pruebas de la web y 1.104 de la tienda en verde, Knip limpio, ESLint sin errores (6 avisos que ya estaban). En el
  navegador a 375 px con el dedo: puntos de color y botones de ícono de 44 × 44, chapas de Existencias sin deslizarse con 2 colores (96/96), Marcas en
  una línea, la mesa de Finanzas fuera de la vista al bajar; en escritorio nada cambió (26 px, 36 px, mesa fija). Vender recorrido hasta «Confirmar
  cobro» a 375, 768 y 1280 sin una sola escritura en la base. Barrido de antes y después en `INFORME.md`.
- **No verificado:** aparatos reales (iPhone, iPad); la tienda online en su servidor (`apps/tienda`, 11 archivos corregidos solo con sus pruebas); el
  separador de días de Gastos en el celular (la base local no tiene gastos); `/milimetro auditar` de las pantallas tocadas (obligatorio antes del PR).
  **Riesgo:** el menú lateral en tablet y celular de lado sigue sin decidir (A plegado, B cajón, C hoy) y la mitad del problema de tablet vive ahí.
