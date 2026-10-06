# Registrar una decisión y migrar

Felipe eligió. Desde este momento esa forma es **la única** de esa función en el ERP. Lo que sigue la vuelve regla (para que nadie dependa de
acordarse) y después, con su OK, la lleva a las pantallas que todavía usan otra.

## 1. La pieza existe

- **Eligió una variante que ya existe** (la B): su pieza es el componente que la dibuja (`components/ui/SegmentoDeslizante.tsx`) o la clase
  del sistema (`btn-secundario`). Si la variante estaba dibujada a mano en una pantalla (sin componente), **extráela a `components/ui/`** con un
  nombre de negocio, una sola vez, con las props que pidan los lugares donde vive.
- **Eligió la propuesta:** constrúyela en `components/ui/` copiando del fragmento solo lo que aguanta en producción (tokens, sin `prop-*`
  sueltas: van como utilidades de Tailwind o en `globals.css` si es una clase del sistema). Su comentario de cabecera dice por qué existe y
  enlaza el registro. Pásala por `/focus` y `/sugerir` si tiene campos, y verifica el oscuro (`tema:auditar`).

## 2. El registro: `docs/unificar/<familia>.md`

```markdown
# <Nombre de la familia> — una sola pieza (ADR-0357)

**Decidido:** AAAA-MM-DD, Felipe. **Elegida:** <B · SegmentoDeslizante | propuesta>. **Pieza:** `components/ui/…`.

## Qué se comparó
| Forma | Usos | Pantallas | Cómo se veía | Archivo |
|---|---:|---:|---|---|
| A | 17 | 12 | … | … |

![comparativa](capturas/<familia>.png)

## Por qué esta
Tres líneas: qué ganó, qué se perdió de las otras y por qué no importa.

## Lo que queda distinto a propósito
Las excepciones que Felipe aceptó (con su motivo), si hay.

## Deuda al decidir
N archivos (lista). Se migran módulo por módulo: <tabla de módulos con estado>.
```

La comparativa (`comparativas/<familia>.png` del censo) se copia a `docs/unificar/capturas/<familia>.png`: es la evidencia de la decisión y es
chica. No se suben las capturas sueltas ni la lámina (se regeneran).

## 3. La regla en el código: `apps/web/unificar/familias.mjs`

En `DECISIONES`, una entrada con la forma que documenta el propio archivo:

```js
"pestanas": {
  fecha: "2026-10-07",
  adr: "docs/adr/0357-unificar-una-funcion-una-pieza.md",
  registro: "docs/unificar/pestanas.md",
  elegida: "B · SegmentoDeslizante",
  pieza: "components/ui/SegmentoDeslizante.tsx",
  firmas: ['role="tablist"', "TabsSubrayado|<Pestanas\\b"],
  deuda: [/* lo que imprime `pnpm unificar:deuda pestanas` */],
},
```

- **Las firmas** son expresiones regulares, una línea de código cada vez, que reconocen la variante **a mano** o una pieza perdedora: el nombre
  del componente que pierde (`<TabsSubrayado`), una combinación de clases que solo la variante a mano usa (`rounded-full px-2 py-0.5 text-\[11px\]`),
  un atributo (`role="tablist"` fuera de la pieza). Que sean **específicas**: una firma que atrapa medio repo es ruido y nadie la respeta.
  Prueba cada firma con `pnpm unificar:deuda <familia>` y mira que lo listado sea de verdad la familia.
- **La deuda** es lo que imprime ese comando el día de la decisión. Solo puede bajar: `lib/unificar.test.ts` falla si aparece un archivo nuevo
  con la firma, y también si uno de la lista ya no la tiene (hay que sacarlo). Una línea legítima se exime con
  `// unificar-fijo: <por qué>` (10 caracteres de motivo) en esa misma línea: el motivo vive junto al código.

## 4. Lo que se actualiza con la decisión (mismo commit)

1. `docs/unificar/<familia>.md` y `docs/unificar/capturas/<familia>.png`.
2. `DECISIONES` en `familias.mjs` (firmas + deuda) → `pnpm --filter web test -- unificar` en verde.
3. La fila de la familia en `docs/unificar/README.md` (tablero).
4. Una línea en la sección «Decisiones» de `docs/adr/0357-unificar-una-funcion-una-pieza.md`. Si la decisión cambia la API de una pieza muy
   usada, borra un componente del sistema o contradice un ADR anterior, va en su **propio** ADR (`pnpm adr:numeros` para el número libre) y el
   anterior gana una «Actualización».
5. Una fila en la tabla «Piezas únicas» de `CLAUDE.md` (regla «Una función, una pieza»): familia → pieza. Una línea, sin explicación (la
   explicación vive en el registro).

Commit: `feat(ui): <familia> es una sola pieza — <pieza> (ADR-0357)`.

## 5. Migrar (`/unificar migrar <familia> [módulo]`)

Toca varios módulos: **pide el OK de Felipe** con la lista de módulos y cuántos archivos tiene cada uno, y el orden que propones (primero el
mostrador). Luego, **un módulo por commit** (`refactor(<módulo>): usa <pieza> para <familia> (ADR-0357)`):

1. Antes: censo de la familia en el módulo (`--modulo <m> --familia <id> --escenarios`) y captura a 1440 × 900 de una pantalla representativa.
2. Reemplaza cada variante por la pieza. **Solo la presentación**: mismos handlers, mismo `type`, mismo texto, mismas props de negocio. Si un
   lugar necesitaba algo que la pieza no tiene, agrégalo a la pieza (no un estilo local).
3. Saca los archivos migrados de `deuda` (la prueba te avisa cuáles).
4. Después: el mismo censo tiene que mostrar **una sola forma** de la familia en el módulo; la misma captura, al mismo ancho; 375 px si es
   Vender, Cambios o Devoluciones (PL-105).
5. `pnpm --filter web test -- unificar tema-colores sugerir guia-de-foco` y `pnpm --filter web typecheck`.
6. La fila del módulo en el registro (`docs/unificar/<familia>.md`, «Deuda al decidir») pasa a «migrado».

Cuando la deuda llega a cero, la pieza perdedora (si era un componente) no tiene a quién servir: bórrala en un commit aparte y dilo en el
registro. No borres un componente que todavía tiene importadores.
