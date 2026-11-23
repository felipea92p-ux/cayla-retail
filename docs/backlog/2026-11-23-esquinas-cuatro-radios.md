# Las esquinas salen de una escala: cuatro radios, y concéntricas — 2026-11-23

Rama `claude/esquinas-cuatro-radios`, encima de `claude/letra-finanzas-y-resto` (PR #1992, abierto). Actividad 8 de las ocho mejoras
de estética. ADR-0698. Sin migraciones.

## Hecho

- [x] **La escala, en un solo lugar** (`apps/web/app/globals.css`): en una pantalla, 6 `rounded-sm` · 10 `rounded-md` · 14 `rounded-campo` ·
      22 `rounded-tarjeta`. Lo que flota conserva lo del contrato con Dynamic: cajón 28 y hoja 32 (26 en el celular).
- [x] **Los otros nombres de Tailwind apuntan a la escala:** `rounded-lg` vale 10 (era 12), `rounded-xl` 14 (era 16) y `rounded-2xl` 22
      (era 20). Se eligió midiendo en qué tamaño de pieza se pinta cada uno. No se renombró ningún uso.
- [x] **`rounded` a secas → `rounded-sm`** en sus 187 usos: eran 4 px fijos de Tailwind, fuera de cualquier token.
- [x] **Componentes:** 113 esquinas escritas a mano (`rounded-[9px]`, `borderRadius: 9`) pasaron a su escalón.
- [x] **Hojas de estilo comunes:** 107 esquinas de 38 hojas pasaron a `var(--radius-…)` (y 3 quedaron marcadas: los 26 px del celular): el menú y la cabecera, campos y casillas, notas,
      avisos y listas de combo, el buscador, las pestañas, las páginas, el centro de avisos, los globos, las tarjetas de Categorías y de
      Colaboradores, Editar producto y varias de módulos.
- [x] **Concéntricas** (adentro = afuera − separación): la foto y la tira de tallas de la tarjeta de Existencias, la placa de quien
      entró dentro del menú, la fila abierta de Insumos, los avisos del centro de avisos, las filas del Historial de ventas, los
      botones del paso de cantidad y el marco de los tres visores de cámara.
- [x] **El candado:** `tema/esquina-suelta.mjs` (la definición), `lib/esquina-suelta.test.ts`, `lib/esquina-suelta-archivos.ts` y los
      comandos `pnpm --filter web tema:esquinas` y `tema:esquinas:registro`. Un archivo nuevo no nace con una esquina a mano.
- [x] **La regla:** `.claude/rules/esquinas.md`, con su fila en el índice de `CLAUDE.md`. La skill `/espacio` quedó al día.
- [x] **Salieron de `FUERA_DE_P10`** (`lib/familia.test.ts`) ocho piezas que ya piden su esquina a la escala: el aviso de la esquina, la
      lista de un combo, dos globos, el centro de avisos, el cajón de un módulo, la placa de quien entró y la tarjeta Vitrina.
- [x] **Deuda de esquinas:** de 659 a 434 (de 145 a 52 archivos).
- [x] Medido en 56 vistas (47 a 1440 × 900 y 9 a 375 × 812), antes y después. Nada se guardó en la base.

| Medida, en las 56 vistas | Antes | Ahora |
|---|---|---|
| Piezas pintadas con un radio de la escala | 489 de 1.582 (31 %) | 1.148 de 1.564 (73 %) |
| Lo mismo, contando lo concéntrico (13 y 16 px, que salen de una cuenta) | — | 1.300 de 1.564 (83 %) |
| Medidas distintas por pantalla | 6 de mediana, hasta 12 | 5 de mediana, hasta 9 |
| Esquinas más redondas de lo que su contenedor deja | 83 | 4 |
| Piezas que quedaron como cápsula sin serlo antes | — | 0 |

## Pendiente

- [ ] **Decide Felipe: las piezas de diseño propio.** 419 esquinas en 50 archivos que no se tocaron: Estados financieros, los pases de
      Traslados, el Observatorio, Análisis, Rendimiento, El telar, Recibir, la página pública del club, la etiqueta que se llena, el
      Inicio de almacén, Tienda web, la vista rápida de producto, Ajustar stock, insignias y sellos, Fusionar, las vitrinas de
      Configuración, las guías, la persiana de Caja, Mi perfil y el aviso de cierre. Es el criterio de P10 (2026-11-05). Llevarlas a la
      escala cambia de 2 a 6 px por pieza; conviene verlo pieza por pieza, con captura de antes y después.
- [ ] **El cobro de Vender** (15 esquinas: 9 en `globals.css` y 6 en `vidrio/vender.css`). Para verlo hay que abrir una caja, que es
      escribir en la base local compartida: pide el OK de Felipe.
- [ ] **La tarjeta Vitrina de Existencias sí se tocó** (20 → 22 px) aunque es de diseño propio (ADR-0589): era la esquina pellizcada
      más visible (48 en una pantalla). Si Felipe la prefiere en 20, se vuelve con una línea.
- [ ] **Una nota vieja en el contrato de familia:** `radios_anteriores` dice que Retail conserva 8 · 16 · 20 como tokens. Ya no. No se
      corrigió porque `docs/familia/contrato.json` viaja solo a Dynamic: va con la próxima versión del contrato.
- [ ] **Un solo nombre por escalón** (opcional): hoy `rounded-lg`, `rounded-xl` y `rounded-2xl` valen lo mismo que `rounded-md`,
      `rounded-campo` y `rounded-tarjeta`. Renombrar los 620 usos es mecánico y no cambia nada a la vista, pero choca con los PR abiertos.
- [ ] **Sin ver en pantalla:** el cobro de Vender, las hojas y modales que no se abrieron (se abrieron seis), los visores de Bajar al
      piso y de Contar (se vio el de Existencias), el Inicio de almacén, Producción dentro del Taller, un teléfono de verdad, Safari y
      lo impreso (las esquinas de un ticket o una boleta se mueven 2 px, como en pantalla; no se imprimió nada).
- [ ] **Dynamic:** no viaja nada solo (`recetas.css` y el contrato no cambiaron). Queda como tarea allá: las notas y los avisos a 14;
      la lista de un combo, los globos y el aviso de la esquina a 22; la placa de quien entró, concéntrica con el menú; y `rounded` a
      secas → `rounded-sm` en las piezas de `components/ui/`. Si Dynamic quiere la misma escala, le faltan los dos chicos: 6 y 10.
