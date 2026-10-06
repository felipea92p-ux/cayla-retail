# Censo de piezas: `/unificar`

El motor de la skill `/unificar` (ADR-0354, «una función, una pieza»). Corre en **LOCAL** contra un `next dev` de esta worktree, abre Chrome
con Playwright, entra con una cuenta de prueba, recorre las pantallas (y sus modales, con los escenarios del auditor de tema), y **cuenta
cuántas formas distintas hay de dibujar lo mismo**: el botón «Cancelar», las pestañas, la insignia de estado, la tabla, la tarjeta de cifra…
Hermano de `tema/` y `responsive/`: reutiliza las sesiones, las rutas y los escenarios de `tema/`.

## Correr

```bash
# con tu `next dev` arriba (preview_start «cayla-retail-dev-libre» toma un puerto libre)
pnpm --filter web unificar:censo -- --base-url http://localhost:3110 --todas                              # todo el ERP
pnpm --filter web unificar:censo -- --base-url http://localhost:3110 --todas --foco inventario --escenarios  # + modales de Inventario
pnpm --filter web unificar:censo -- --base-url http://localhost:3110 --todas --familia pestanas,accion       # solo esas familias
pnpm --filter web unificar:censo -- --lamina unificar/.salida/<carpeta>     # rehace la lámina (tras escribir una propuesta)
pnpm --filter web unificar:censo -- --listar                               # familias, cuentas y módulos
pnpm --filter web unificar:deuda [familia]                                 # lo que todavía dibuja a mano una familia decidida
```

Salida en `unificar/.salida/<fecha>/` (fuera de git; se regenera):

| Archivo | Qué es | Para quién |
|---|---|---|
| `reporte.md` | por familia: cuántas formas, usos, pantallas, archivo probable y la huella de cada una | `/unificar` |
| `lamina.html` | las variantes lado a lado con su captura, lo que cambia frente a la más usada y la propuesta (claro y oscuro) | Felipe |
| `comparativas/<familia>.png` | la sección de la lámina de cada familia, en una imagen | el chat |
| `censo.json` | todo lo anterior en datos | `--lamina` |
| `capturas/`, `recursos/` | las capturas a ×2 y el CSS y las fuentes que sirvió el ERP | la lámina |

Para verla en el navegador integrado: `preview_start` «unificar-laminas» y abre `/<carpeta>/lamina.html` (también abre como archivo local).

## Cómo funciona

- **`familias.mjs`** es la única definición de las familias, de las funciones de botón (se reconocen por lo que dicen: «Cancelar», «← Volver»,
  «+ Nuevo…»; o por su icono si no dicen nada) y de las **decisiones** de Felipe. Lo usan el censo, la lámina y `lib/unificar.test.ts`.
- **`motor/censo-en-pagina.js`** corre dentro de la página: reconoce cada familia y le saca su **huella** (alto, esquinas, fondo, borde,
  relleno, letra, icono) con los colores traducidos al token del sistema (`tinta`, `rojo/35`; `≈taupe` si se parece; el hex si no es ninguno).
  Deja fuera el marco (lateral y cabecera), el papel físico (`.papel-fijo`, `[data-papel]`) y los colores de prenda (`[data-color-dato]`).
- **`cli.mjs`** agrupa por huella (misma familia + misma huella = misma variante), las ordena por uso (la **A** es la más usada), captura cada
  una (hasta 2, de pantallas distintas) y escribe todo. **`motor/archivos.mjs`** adivina qué archivo dibuja cada variante buscando sus clases de
  Tailwind más raras en `components/` y `app/` (una pista: el informe dice `[probable]`).
- **`deuda.mjs`** aplica las `firmas` de cada familia decidida a `components/` y `app/`: los archivos que la dibujan a mano. La prueba exige que
  coincidan con la `deuda` declarada (nadie nuevo, y solo baja).

## Si algo da raro

- **«El servidor es de otra worktree»** Con varias worktrees levantadas, el 3010 suele ser de otra: levanta el tuyo y pásalo con `--base-url`
  (`--otra-obra` mide aquel a sabiendas).
- **«No entró …»** La cuenta no existe en la base local: `pnpm --filter web tema:cuentas`.
- **Una familia con decenas de formas** (botones, iconos, títulos) No todas son un problema: la jerarquía de botones tiene 5 a propósito. El
  juicio de qué unificar es de `/unificar` (`.claude/skills/unificar/referencia/criterio.md`), no del motor.
- **Un falso positivo** (una frase con una cifra grande, un grupo de filtros que parece pestañas): está listado en `criterio.md`. Si se repite
  mucho, corrige el detector en `censo-en-pagina.js` y anótalo ahí.
