# Unificar — una función, una pieza (tablero)

`/unificar` (ADR-0357, `.claude/skills/unificar/`) cuenta cuántas formas distintas tiene cada familia de piezas del ERP —el botón «Cancelar»,
las pestañas, la insignia de estado, la tabla, la tarjeta de cifra…—, se las muestra a Felipe con capturas lado a lado y una propuesta nueva,
y **lo que Felipe elige pasa a ser la única forma de esa función en todo el ERP**, también en las pantallas que todavía no existen.
`lib/unificar.test.ts` lo hace cumplir: un archivo nuevo que vuelve a dibujar a mano una familia decidida falla, y la deuda solo baja.

**Felipe elige mirando** (la página de `unificar/elegir.mjs`), nunca por una descripción. **Antes de dibujar una pieza en una pantalla o un modal, mira la primera tabla.** Si su familia está decidida, se usa esa pieza. Si no, se usa la
forma más usada del último censo (la «A» de la lámina) y no se inventa otra.

## Piezas únicas (lo decidido)

| Familia | La pieza | Decidido | Deuda (archivos por migrar) | Registro |
|---|---|---|---:|---|
| Botón «Volver» (`accion.volver`) | `<Volver>` (`components/ui/Volver.tsx`): la flecha redonda, sola, con «Volver a …» para el lector | 2026-10-07 (mirando) | 0 | [accion.volver.md](accion.volver.md) |
| Pestañas y segmentos (`pestanas`) | `<Pestanas>` (vidrio con píldora oscura, en mayúsculas; también Finanzas) si cambia de sección · `pildora-cayla` si filtra o elige período · `SegmentoEnlaces` / `SegmentoDeslizante forma="modo"` (caja arena) si cambia el modo u orden | 2026-10-07 (mirando) | 0 | [pestanas.md](pestanas.md) |
| Tarjetas de cifra (`cifra`) | `<TarjetaCifra>`: la de Compras tal cual (flecha si lleva, arena si filtra, punteada sin dato) | 2026-10-07 (mirando) | 0 | [cifra.md](cifra.md) |

## Propuestas esperando decisión

| Familia | Propuesta | Desde | Nota |
|---|---|---|---|
| — | ninguna por ahora | — | — |

## Censos

| Fecha | Rama | Vistas medidas | Familias con más de una forma | Lo que más confunde |
|---|---|---:|---:|---|
| 2026-10-06 | `claude/unificar-componentes-skill-7e9d26` @ `c215dd2f`, cuenta Admin, foco Inventario | 101 de 109 | 30 | 25 formas de pestañas en 54 pantallas; 6 de «Volver»; solo 123 de 591 botones usan `btn-cayla` (detalle: ADR-0357) |

## Cómo se agrega una fila

- **Piezas únicas:** al registrar una decisión (`.claude/skills/unificar/referencia/decision.md`): la familia, la pieza, la fecha, cuántos
  archivos quedan en la deuda (`pnpm --filter web unificar:deuda <familia>`) y el enlace a `docs/unificar/<familia>.md`. Cuando un módulo se
  migra, baja el número. La misma fila va a la tabla «Piezas únicas» de `CLAUDE.md`.
- **Propuestas:** al dibujar una (`propuestas/<familia>.html`); sale de esta tabla cuando Felipe decide (gane o no).
- **Censos:** una fila por censo de `todo` o de un módulo: lo medido, no lo opinado.

## Qué hay en esta carpeta

| | |
|---|---|
| `README.md` | este tablero |
| `<familia>.md` | el registro de una decisión: qué se comparó, qué se eligió y por qué, la deuda por módulo |
| `capturas/<familia>.png` | la comparativa con la que Felipe decidió (la evidencia, chica) |
| `propuestas/<familia>.html` | el diseño extra de `/unificar`: un fragmento que la lámina dibuja con el CSS real, en claro y oscuro |

El censo, las capturas sueltas y la lámina se regeneran y viven fuera de git, en `apps/web/unificar/.salida/`.
