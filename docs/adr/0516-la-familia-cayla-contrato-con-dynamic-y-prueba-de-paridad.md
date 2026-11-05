# ADR-0516 — La familia CAYLA: un contrato con Dynamic y una prueba que impide el desfase en silencio

**Estado:** aceptada, **en su PR (solo documentos, una prueba y un script; sin migración, nada en producción que pegar)**; **falta aplicar el oscuro y el borde de control en Dynamic** (ver «Lo que falta») ·
**Fecha:** 2026-10-26 · **Decidió:** Felipe (opción A, «la tabla de familia y la prueba de paridad», el 2026-10-25; «P1 = C», el oscuro de la familia, y «P2 = C», el borde de un control, el 2026-10-26) ·
**Sigue a:** ADR-0169 (la paleta oficial «CAYLA Dynamic» en todo el ERP) y ADR-0336 (el modo oscuro; su actualización del 2026-10-26 aplica el oscuro de la familia)

## Contexto

CAYLA Retail (este ERP) y CAYLA Dynamic (asistencia y planilla, otro repositorio) son la misma empresa, y la misma persona usa las dos en el mismo turno. ADR-0169 hizo que
Retail adoptara la guía de Dynamic, pero nada comprobaba que siguieran iguales después: cada repositorio tiene su propio `globals.css`, y un cambio en uno no avisa al otro.
Ya pasó una vez dentro de Retail: `packages/shared/src/design-tokens.ts` se desfasó solo durante semanas (taupe `#a47865` en vez de `#805c4c`, radios en 0, «sin sombras») y
nadie lo notó, porque nadie lo comparaba con `globals.css`.

La comparación del 2026-10-25 entre los dos sistemas de diseño encontró lo que hoy es igual y lo que no:

- **Igual, al hex:** los 13 colores del tema claro, DM Sans y EB Garamond, los radios de 8, 16 y 20 px y el nombre del atributo del tema.
- **Distinto:** el tema oscuro (un gris en Retail, un café en Dynamic, con el campo más claro que la página en uno y más negro en el otro), el borde de un control (`sand` a 1.2:1
  contra `taupe` a 5.6:1), el anillo de foco (tinta contra rojo), el vocabulario («cliente» contra «clienta»), el peso de la serif, el estado vacío, los signos de exclamación y los
  tokens de capas.

Que dos apps sean «de la misma familia» no es que sean idénticas: Dynamic se usa en el celular para marcar asistencia y Retail en un computador para vender y producir. Lo que una
persona mira para reconocer a CAYLA es otra cosa que cómo se organiza cada pantalla.

## Decisión

**1. Tres capas, con tres maneras de cuidarlas** (`docs/familia/README.md`):

| Capa | Qué es | Cómo se cuida |
|---|---|---|
| **Marca** | Los colores de los dos temas, las dos letras, los radios, el nombre del tema, el colibrí | Una prueba en cada repositorio; si cambia en uno y no en el otro, falla |
| **Sistema** | Los cinco estados con el mismo vocabulario, el color nunca va solo, 4.5:1 en el texto, sombra solo en lo que flota, una sola forma por pieza, íconos de lucide | Se vigila leyendo; una diferencia se aprueba con su motivo escrito |
| **Producto** | Celular primero o escritorio primero, la escala de títulos, el movimiento, con qué tema arranca, los colores de dato | Cada aplicación decide, con su motivo escrito |

**2. Un archivo, dos repositorios.** `docs/familia/contrato.json` (versión 2) es el MISMO archivo en Retail y en Dynamic. Guarda los 13 colores claros, los 11 oscuros, las letras,
los radios, el tema, las reglas de sistema (S1 a S9), las diferencias de producto con su motivo (D1 a D5) y los pendientes.

**3. Una prueba por repositorio.** `apps/web/lib/familia.test.ts` lee `globals.css` y `estilos/tema.css` y exige que digan lo que dice el contrato, al hex. Dynamic tendrá la misma
prueba con la ruta de su `globals.css`. También comprueba que el contrato esté bien armado (cada diferencia de producto trae su motivo; cada pendiente dice cómo se decide) y que el
detector no esté ciego.

**4. Un comparador entre repositorios** (`scripts/familia/comparar.mjs`, `pnpm familia:comparar`): contrato contra contrato (`contrato <ruta>`) y el `tokens.json` de un artifact
«Design System» contra el contrato (`tokens <ruta> --como retail|dynamic`). Su `--autoprueba` cambia a propósito un dígito de un color, saca un color de marca, deja un solo tema, cambia un radio o la letra, y
exige que el detector lo note. Es lo único que ve los dos repositorios a la vez, y se corre a mano (ningún CI de un solo repositorio ve el otro).

**5. Lo que está decidido pero no aplicado se declara.** `aplicacion_pendiente` lista lo que falta aplicar en cada miembro, con su motivo y fecha; el comparador lo dice como **aviso**
(no como falla) para que un cambio de marca pueda avanzar en un repositorio sin romper al otro, pero que no se pierda al cerrar la sesión.

**6. Los desacuerdos se deciden mirando.** Hay nueve pendientes (P1 a P9), cada uno con lo que dice cada aplicación, por qué importa y cómo decidirlo. **P1, el oscuro, se decidió el
2026-10-26** con una lámina de tres opciones (`docs/maquetas/familia-oscuro-2026-10/`): Felipe eligió la C, el «gris cálido» (las claridades del gris de Retail con el matiz del café de
Dynamic), y subió a la capa «marca». **P2, el borde de un control, se decidió el mismo día** con su lámina (`docs/maquetas/familia-borde-control-2026-10/`): ver «Actualización 2026-10-26 (b)». Cambiar un valor de la marca
es siempre el mismo orden: se decide mirando; se cambia en el contrato y se sube su versión; se cambia Retail con su prueba en verde; el mismo día se copia el contrato a Dynamic y se
cambia su código; se comprueba que los dos repositorios guardan el mismo contrato y se republican los dos artifacts.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** un contrato que es el mismo archivo en los dos repositorios, una prueba de paridad en cada uno y un comparador que los mira juntos; la marca igual, el sistema con
diferencias aprobadas y el producto libre.
**DESCARTÉ:** (a) **un paquete compartido de marca** (un repositorio o paquete tercero con los tokens), porque obliga a publicar, versionar y actualizar dos dependencias para mantener dos
archivos de colores; pasaría a valer la pena si aparece una tercera aplicación estable, o si el paso 4 del procedimiento se olvida más de una vez; (b) **hacer idénticas las dos
aplicaciones**, porque copiar pieza por pieza congela a las dos y obliga a una app de celular a parecerse a una de escritorio; (c) **generar el CSS de Retail desde el contrato**, porque
invertiría la fuente de verdad (los colores salen SOLO de `globals.css`, ADR-0169) y chocaría con el `@theme static` de Tailwind; por eso la prueba lee el CSS y compara; (d) **confiar en
la revisión de una persona**, que es lo que ya falló con `design-tokens.ts`.
**SE ROMPE SI:** alguien cambia un color en Dynamic y no lo cambia en Retail el mismo día: la prueba de Retail sigue verde porque no ve el otro repositorio, y solo
`pnpm familia:comparar contrato` lo ve, a mano; si la prueba de Dynamic nunca se copia (hoy no existe: la paridad se comprueba por un solo lado); si `aplicacion_pendiente` se queda
años sin aplicarse (es un aviso, no un candado); o si se agrega un token de marca con un formato que el lector de `familia.test.ts` no encuentra (`--color-<nombre>: #hex;`), aunque la
prueba que exige que el contrato guarde el oscuro de TODO color de marca lo cubre en parte.

## Qué NO cambia

Ninguna función de la base y ningún permiso. Los cambios visibles son dos: el oscuro (un negro apenas más cálido; los contrastes casi no se mueven: texto 13,71:1 → 13,67:1, rojo sobre tarjeta
5,72:1 → 5,70:1), que vive en ADR-0336, actualización 2026-10-26, y el borde de los controles (abajo). Los colores del tema claro no cambian.

## Verificación

- `lib/familia.test.ts`, `lib/tema-tokens.test.ts`, `lib/tema-colores.test.ts` y `lib/unificar.test.ts` sobre la rama fusionada con `main`: 237 pruebas en verde.
- `node scripts/familia/comparar.mjs --autoprueba`: el detector falla con un rojo claro distinto por un dígito, un color de marca que falta, un oscuro que cambió sin tocar el
  contrato, el oscuro viejo de Dynamic en una app que ya debería tenerlo, un radio, la serif y un `tokens.json` con un solo tema; avisa (sin fallar) un oscuro pendiente de aplicar;
  nota dos contratos con un color de marca distinto, e ignora la fecha `actualizado`. Sus casos son los de la función `autoprueba` del script.
- El `tokens.json` del artifact de Retail contra el contrato: 13 colores claros, 11 oscuros, radios y letras coinciden. El del artifact de Dynamic: los claros, los radios y las letras
  coinciden; el oscuro sale como aviso (su aplicación está pendiente).
- `pnpm knip`, `pnpm adr:numeros` y `pnpm migraciones:versiones` sin hallazgos.
- **No se corrió** `pnpm --filter web tema:auditar` (pide la pila local): nadie ha mirado el ERP real en oscuro con el negro nuevo.

## Lo que falta

1. **Aplicar en Dynamic el oscuro y el borde de control** (las tablas de valores antes y después están en `docs/familia/README.md`), copiarle el contrato, poner allí la misma prueba y quitar
   `aplicacion_pendiente` en los dos repositorios. Revisar lo que dependa de que su campo (`hueso`) sea más oscuro que su tarjeta.
2. **Decidir P3 a P9.** P6 pedirá su lámina. P4 (vocabulario) choca con el `CLAUDE.md` global de Felipe y el README de Dynamic, que todavía dicen «clienta» y
   «encargada», mientras Retail dice «cliente» y «encargado de sede» desde el 2026-10-02 (ADR-0288, act. k).
3. **Mirar el ERP real en oscuro** con `tema:auditar` en una máquina con la pila local. Las pantallas con muchos campos juntos ya se vieron (2026-10-26): no pesan.
4. **Limpiar `packages/shared/src/design-tokens.ts`**, que sigue desfasado y nadie importa (solo `MAX_ROJO_POR_PANTALLA` se usa).

## Actualización 2026-10-26 (b) — P2 = C: el borde de un control tiene su propio color

Felipe eligió la opción C de la lámina de P2: un color de marca nuevo, **`borde-control`** (claro `#96786a`, oscuro `#8d7a6e`), en el contrato (versión 3) y en Retail (`@theme` de `globals.css`,
bloque oscuro y `.papel-fijo` de `tema.css`). Lo llevan **lo que se toca o se escribe**: `.caja-cayla` y `.caja-campo-input` (campo, combo, monto, fecha, área de texto), `.buscador` (el buscador de una lista; el «mostrador» de Vender no lleva borde), `.btn-secundario`, `.casilla-input` y el interruptor apagado
(`.interruptor`, un aro de 1,5 px). `sand` sigue siendo la línea **decorativa** (tarjeta, tabla, píldora con texto, separadores): la regla que ya aplicaba Dynamic.

- **Por qué:** `sand` da 1.2:1 contra la tarjeta y no identifica un control (WCAG 1.4.11 pide 3:1). Hoy las cuatro piezas fallaban en los dos temas (campo y botón 1.2:1, interruptor apagado 1.6:1, casilla 2.2:1 en claro).
  `borde-control` se calculó mezclando taupe con papel hasta pasar 3:1 sobre la página, la tarjeta **y** el campo (`hueso`) en los dos temas (3.6 / 3.8 / 3.1:1 en claro; 4.3 / 3.8 / 3.2:1 en oscuro); `lib/tema-tokens.test.ts` lo mide.
- **Los estados suben un escalón.** Con el reposo ya a 3:1, el hover antiguo (taupe al 60 %) y el foco antiguo (tinta al 38 %) quedaban más débiles que el reposo: hover y campo encendido usan ahora una mezcla de tinta al 65 %
  (`campos-y-casillas.css`, `vacio-aviso-buscador.css`, `alta-guia.css`, `globals.css`). El foco **no** quedó en tinta plena (como mostraba la lámina): en el ERP real se suma al anillo de foco de 2 px, y un borde negro además se leía como un doble marco.
- **DESCARTÉ:** B (taupe pleno, como Dynamic), porque en oscuro da 6,9:1 y cada borde queda tan claro como el texto secundario; y A (dejar `sand`), porque Dynamic ya cumple 1.4.11 y la familia habría quedado dividida justo en lo que más se toca.
- **SE ROMPE SI:** una pantalla dibuja a mano un campo con `border-sand` (no recibe el cambio; una búsqueda de `<input … border-sand>` en `components/` y `app/` no encontró ninguno, pero un campo armado con un contenedor y `border-sand` no se vería así); si Dynamic no cambia su alias `borde-control = taupe` (el comparador lo avisa mientras esté en `aplicacion_pendiente`);
  o si alguien dibuja a mano una celda tecleada de una matriz (`border-transparent bg-hueso`) junto a las celdas con − y +: dentro de la misma tabla cambian de cara. **Mirado el 2026-10-26** con las piezas reales (matriz de 48 celdas y filas de tabla con cuatro campos, en claro y oscuro, antes y después): el borde de control no pesa y mejora los campos sobre una fila rayada. Felipe decidió el mismo día llevarlo también a las celdas que solo se teclean: `MatrizCantidades`, `MatrizStockFicha`, `FlujoTalla` y el cierre de `MatrizOrden` (más el cuadrito ✓ de etiquetas de `MatrizStockFicha`, que estaba en `sand`) usan ahora `border-borde-control`.
- **Verificación:** las piezas reales (`CampoMonto`, `CampoSelect`, `CampoTexto`, `Casilla`, `Interruptor`, `Boton`) en una página temporal bajo `/login`, en claro y oscuro: bordes `#96786a` y `#8d7a6e`, `sand` intacto en tarjeta y píldora, interruptor
  apagado con su aro y prendido sin él, foco con borde un escalón arriba, anillo y hilo. La página se borró al terminar. 176 pruebas de tema, familia, colores y foco en verde. No se corrió `tema:auditar`.

## Piezas

`docs/familia/contrato.json`, `docs/familia/README.md`, `apps/web/lib/familia.test.ts`, `scripts/familia/comparar.mjs` (y su entrada `familia:comparar` en `package.json`),
`docs/maquetas/familia-oscuro-2026-10/` y `docs/maquetas/familia-borde-control-2026-10/` (las láminas para decidir mirando). El oscuro cambia en `apps/web/app/estilos/tema.css`,
`app/global-error.tsx`, `public/sin-conexion.html` y `unificar/fotos.mjs`, con su prueba en `lib/tema-tokens.test.ts`; el borde de control, en `app/globals.css`, `app/estilos/campos-y-casillas.css`, `app/estilos/vacio-aviso-buscador.css` y `app/estilos/alta-guia.css`.
