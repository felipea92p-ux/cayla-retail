# Auditoría del modo oscuro

Herramienta de la obra del modo oscuro (ADR-0336). Corre en **LOCAL** contra un `next dev` ya levantado, abre Chrome real con
Playwright, entra con cada cuenta de prueba, recorre las pantallas en claro y en oscuro, **mide** (no opina) y deja un reporte con
capturas. Hermana de `responsive/`: mismo Playwright, misma idea de «medir el DOM en vez de mirar».

## Qué mide

| Detector | Qué es | Por qué importa |
|---|---|---|
| **Contraste** | El contraste WCAG de cada texto contra su fondo REAL (compuesto capa por capa, con alfa), mínimo 4.5:1 (3:1 si es grande). Exime los controles deshabilitados. | Un texto que se pierde en oscuro. |
| **Mancha clara** | Una superficie grande y opaca que en oscuro sigue clara y no es papel fijo ni un relleno invertido a propósito. | Un `bg-white` o un hex que no cambió con el tema. |
| **Velo claro** | Una capa fija que cubre la pantalla y en oscuro la **aclara** en vez de oscurecerla. | Un `bg-tinta/30` que se volvió crema. |

Corre cada pantalla en **los dos temas** y compara: lo que falla **solo en oscuro** es lo que rompió el tema (urgente); lo que ya
fallaba en claro es «heredado» (no es culpa del oscuro; se arregla cuando toque esa pantalla). La captura es siempre del oscuro.

## Correr

```bash
# 1. una vez: las cuentas de prueba que el seed no trae (terminal de ventas, terminal administrativa, un rol personalizado)
pnpm --filter web tema:cuentas

# 2. con tu `next dev` arriba (si no es el :3010, TEMA_BASE_URL):
TEMA_BASE_URL=http://localhost:3090 pnpm --filter web tema:auditar -- --cuenta admin --ruta /,/caja
pnpm --filter web tema:auditar -- --cuenta admin,integrante --modulo inventario
pnpm --filter web tema:auditar -- --cuenta todas --todas             # las 76 rutas estáticas × 7 cuentas: es largo
pnpm --filter web tema:auditar -- --cuenta admin --ruta / --escenarios   # + modales, listas y buscador de esa ruta
pnpm --filter web tema:auditar -- --ancho 375 --alto 812 --cuenta integrante --ruta /vender   # celular
pnpm --filter web tema:auditar -- --listar                           # cuentas, rutas y escenarios
```

Salida: `tema/.salida/<fecha>/` — `reporte.md`, `reporte.json` y `capturas/<cuenta>/*.png` (fuera de git; se regenera). Sale con
`1` si hay hallazgos solo en oscuro, `2` si el propio script se cayó. **Solo corre contra localhost**: las cuentas y sus claves son
del seed local.

## Las cuentas (`cuentas.mjs`)

Cada una ve pantallas distintas, porque el rol decide los módulos (ADR-0161) y la vista decide la sede.

| Clave | Quién | Ve |
|---|---|---|
| `admin` | Felipe: Admin y Líder en Tienda Lima | todo, con el selector de sede y Actividad |
| `admin-global` | el mismo, con CAYLA Global elegida | el tablero de toda la empresa |
| `admin-taller` | el mismo, parado en el Taller | Producción |
| `integrante` | Micaela, en Tienda Trujillo | el rol por defecto, sin Actividad |
| `terminal-ventas` | el mostrador de Lima | Ventas y Clientas |
| `terminal-administrativa` | la administrativa de Lima | Inventario y Catálogo |
| `rol-personalizado` | Lucía, con un rol de 5 módulos | el menú más corto |

La sesión de cada una se guarda en `tema/.sesion/` (fuera de git) y se reutiliza mientras valga.

## Escenarios (`escenarios/registro.mjs`)

Lo que no se ve al cargar —un modal abierto, la lista de un combo, el buscador global— se audita con un escenario:
`{ id, ruta, cuentas?, nombre, preparar(pagina) }`. `preparar` recibe la página ya cargada y hace los clics. **Cada módulo que se
audita agrega los suyos.** Se corren con `--escenarios` (los de las rutas elegidas) o `--escenario <id>`.

## El candado de colores (`colores-sueltos.mjs`)

`pnpm --filter web tema:colores [--lineas]` lista los archivos con colores escritos a mano (un hex, un `rgb()`, `bg-white`,
`bg-gray-100`…). Es la única definición de «color suelto» y la usa `lib/tema-colores.test.ts` en el CI: un color nuevo en un
archivo que no está declarado **falla**, y la deuda de antes (`lib/tema-colores-archivos.ts`) **solo baja**. Una línea legítima
(papel físico, un color de dato) se exime con `// tema-fijo: <por qué>` en esa misma línea.

## Si algo da raro

- **«No entró …»** La cuenta no existe: `pnpm --filter web tema:cuentas`. El login espera a que React hidrate; si el `next dev`
  está compilando por primera vez, la primera corrida tarda.
- **Muchos hallazgos «heredados»** No son del oscuro: ya fallaban en claro (p. ej. un `text-tinta/50` de 3.3:1). Se arreglan al
  auditar esa pantalla.
- **Una pantalla «sin acceso»** Esa cuenta no tiene el módulo (el rol decide). Es lo esperado, no un fallo.
