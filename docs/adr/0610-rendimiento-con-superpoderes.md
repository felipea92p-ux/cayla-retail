# ADR-0610 — Rendimiento con superpoderes: una mesa donde cada pieza responde a las demás (2026-11-04)

**Estado:** construido y probado en local. Sin PR y sin tocar producción: **la migración `20261104213000` no está pegada**, y la web no se publica antes que ella.
**Maqueta:** `docs/maquetas/rendimiento-superpoderes-2026-11/` (cuarta ronda; Felipe descartó tres: «Listo, me gusta ese estilo»).

## DECIDÍ

Gestión ▸ Rendimiento deja de ser un panel de bloques sueltos y pasa a ser **una mesa con un solo estado** (la tienda, los días, las personas, el orden). Lo que se toca en cualquier pieza cambia todas. Se arma con la tabla ya elegida (`TablaViva`, `docs/maquetas/tabla-superpoderes-2026-10/`) y con las recetas del vidrio (ADR-0596); lo nuevo es lo que cada pieza puede hacer:

| Pieza | Superpoder |
|---|---|
| Tiendas (`SedesConAnillo`) | Cada una dice cuánto lleva contra su propia meta del mes. Nunca un ranking entre tiendas. |
| Buscador | Entiende personas, «por debajo», «del 5 al 12», «día 10», una tienda, «sumado» y «mes pasado», y solo ofrece: la persona elige. |
| Cifras (`CifrasRendimiento`) | Cuentan, y el «?» las voltea para explicar la cuenta con los números de ahora. «Si vendemos por día» recalcula el cierre y mueve la línea del gráfico. |
| Gráfico (`GraficoRendimiento`) | Se arrastra para elegir días. El mismo dibujo se transforma entre Cada día, Por persona y Sumado. Compara con el mes pasado. «Ver cómo fue» repite el mes en toda la pantalla y se detiene solo. |
| Tabla (`TablaRendimiento` sobre `TablaViva`) | Sus ocho superpoderes, y además las filas viajan al ordenarse y dicen lo de ese día al señalarlo en el gráfico. |
| Fila abierta (`FilaAbierta`) | Su calendario, lo que va bien y su meta, con la lectura y el reparto que quedarían ANTES de guardar. Reemplaza al modal de la meta. |
| Deshacer, descargar, teclas, dirección | Vuelve al paso anterior, baja lo que se ve, `/`, `←` `→`, `Esc`, y lo que se mira queda en la URL. |

La lógica pura vive en `lib/rendimiento-vista-reglas.ts`, con su prueba. No se escribió otra versión de lo que ya existía: la lectura sigue siendo `lecturaDeRitmo`, el cierre `proyectarMes`, la validación `validarCambioMeta` y la meta `fijar_meta_persona`.

## POR QUÉ ASÍ

- **Por persona y por día, con las metas reales.** `fn_metas_por_dia` ya reparte la meta de cada día por horas programadas (o en partes iguales, D-158). La función nueva `fn_rendimiento_persona_dias` junta eso con las ventas, así que cualquier tramo de días se mide con metas de verdad. La maqueta las inventaba por tiempo; el ERP no.
- **Todo en el navegador.** El servidor ya leía todas las tiendas de una vez (Felipe, 2026-10-03): cambiar de días no pide nada, no prende el loader y no mueve la vista. Son como máximo unas 650 filas por tienda (7 personas × 92 días).
- **La tabla recibe sus filtros desde afuera** (`useTablaViva({ control })`): las cifras y el gráfico también los tocan, y una sola fuente evita que la frase diga una cosa y las filas otra.
- **Sin biblioteca de gráficos.** Las barras son `<rect>` con transiciones de CSS: el navegador las mueve, sin un cuadro de JavaScript por barra.

## Decisiones de Felipe (2026-11-04)

1. **«Adelante / En ritmo / Por debajo» salen en cualquier período**, no solo en Hoy. Amplía D-159; los 10 puntos y las palabras no cambian. Lo que tocaba solo cuenta lo que ya pasó: de hoy, lo corrido del turno. Sin turno o antes de empezar, no se dice nada.
2. **La meta se cambia dentro de la fila**, y se fue `EditarMetaModal`. Todo lo que hacía sigue: motivo, responsable, `p_meta_esperada`, volver a la automática.
3. **La pantalla abre en «Este mes»**, como la maqueta aprobada (antes abría en Hoy). `?vista=hoy` sigue funcionando.
4. **El tablero de vidrio decía que aquí «solo cambia el material» porque el plan era de Dany.** Felipe aprobó el cambio mirando la maqueta; queda escrito aquí para que Dany lo sepa.

## Lo que se ajustó al implementar

- **La lente no deforma las cifras.** La primera versión refractaba todo el tramo y las barras se veían torcidas: bonito, pero falso. Ahora solo dobla el canto de 10 px, como el borde de una gota, y el centro se lee exacto.
- **Una tienda sin horarios** tiene metas solo en los días que marcaron asistencia (D-158): su «Este mes» se mide contra los días marcados, y la nota de abajo lo dice.
- **«Mejor día» y «Su mes» se van a la línea de abajo** bajo 1060 px de tabla, como toda `TablaViva`. Por eso `/rendimiento` salió del tope de 64 rem (`CON_TOPE_DE_ANCHO`).
- **«Vende más los lunes» pide al menos dos lunes.** Con uno solo, el mes recién empezado afirmaba una costumbre que nadie había visto todavía (`suDiaFuerte`).
- **Las frases siguen a la tienda.** Sin horarios, la meta se explica como partes iguales, no como horas programadas.
- **Sin lectura por persona, el equipo no se toca.** Elegir a alguien mostraría ceros falsos, así que sus botones se apagan y queda lo de la tienda.
- **Colores por persona:** `--color-persona-0` a `-5`, color de dato validado para daltonismo, siempre con nombre o iniciales. En oscuro, las iniciales van en tinta fija para pasar 4.5:1.

## QUÉ SE ROMPERÍA SIN ESTO

- Sin la función nueva, elegir días obligaría a inventar el reparto de la meta. Si la función no existe o falla, la pantalla dice que no pudo leer lo de cada persona y sigue con lo de la tienda y los rankings (principio 9). **Por eso la migración se pega antes de publicar la web.**
- Sin `medirGrupo` sobre la serie de la tienda, las ventas sin quien atendió se perderían y la cifra no cuadraría con Caja.

## Lo que no se hizo

- Selector de mes, y horas por persona (la lectura por hora sigue siendo de la tienda, a propósito: es para repartir turnos, no para juzgar).
- Un «Deshacer» para el cambio de meta: guardar deja rastro en un historial que no se borra, y deshacer sería otro cambio con su propio motivo.
- Las piezas nuevas (gráfico con selección, cifra que se voltea, buscador que entiende) no se volvieron piezas del sistema: viven en `components/rendimiento/`. Si otra pantalla las quiere, lo decide Felipe con `/unificar`.

## Cómo se verifica

```
pnpm --filter web exec vitest run lib/rendimiento-vista-reglas.test.ts
pnpm pruebas:rendimiento-persona-dias
pnpm --filter web guias:recorrer -- --guia rendimiento --base-url http://localhost:<puerto>
```

Datos inventados para mirarla: `scripts/demo/rendimiento-local.mjs`. Solo corre con el contenedor dicho a mano (`CAYLA_CONTENEDOR_DB`), porque la base local de siempre la comparten otras sesiones y está atrasada frente a `main`; esta construcción se probó en una pila aparte con todas las migraciones.
