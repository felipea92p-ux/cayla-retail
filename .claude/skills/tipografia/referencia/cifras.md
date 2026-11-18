# Las cifras del ERP: el hallazgo de DM Sans y la propuesta 1

**Propuesta, espera a Felipe.** Toca todos los módulos (CLAUDE.md «Reglas de ejecución»): se decide mirando, como `/unificar`.

## 1. La regla actual

- `app/layout.tsx` carga EB Garamond y DM Sans con `next/font/google` (`--font-eb-garamond`, `--font-dm-sans`); `globals.css` las nombra
  `--font-serif` y `--font-sans`. Todo el ERP escribe en DM Sans.
- Para que las cifras queden en columna, el código pide `tabular-nums` (Tailwind: `font-variant-numeric: tabular-nums`):
  `celda("der")` de `components/ui/Tabla.tsx` lo pone en toda celda a la derecha, y la piden también `TarjetaCifra`, `.titulo-cuenta`,
  `.titulo-seccion-dato` y cientos de filas.
- Solo **Estados financieros** cambia la letra de sus cifras: Inter (`lib/letra-estados.ts`, pesos 400/500/600, ADR-0611, Felipe la eligió
  mirando «contra DM Sans»). `app/estilos/vidrio/estados.css` toma `.tabular-nums, .num, .fin-num, .fin-casc-monto` dentro de
  `.estados-vidrio` y les pone `var(--letra-estados)`; `app/estilos/finanzas-bolsillos.css` hace lo mismo en `.resumen-bolsillos`.

## 2. El problema, medido

**DM Sans (4.004, la que sirve Google Fonts) no tiene la función `tnum`: sus cifras son proporcionales y `tabular-nums` no hace nada.**
El «1» mide 342 milésimas y el «0», 656 [Verificación, `fuentes.md`]. EB Garamond sí: sus cifras son tabulares por defecto. Este repo
ya lo descubrió una vez, en la tienda (ADR-0446: «veinte reglas pedían `tabular-nums` y no pasaba nada»), y la tienda cambió a Heebo.
El ERP sigue igual.

Cuánto pide el código hoy (2026-11-12, reprodúcelo antes de citar la cifra: envejece rápido):

```bash
cd apps/web
grep -rn "tabular-nums" app components lib --include=*.tsx --include=*.ts --include=*.css | wc -l   # 1301 líneas
grep -rln "tabular-nums" app components lib --include=*.tsx --include=*.ts --include=*.css | wc -l  # 430 archivos
grep -rn "font-variant-numeric" app components lib --include=*.tsx --include=*.ts --include=*.css | wc -l  # 214 líneas
grep -rn "tabular-nums" components app --include=*.tsx | grep -E "font-serif|font-display" | wc -l  # 198: en EB Garamond, sí alinean
grep -rn "tabular-nums" components app --include=*.tsx | grep -vE "font-serif|font-display" | wc -l # 893: en DM Sans, no alinean
```

De esas 893, solo las que viven dentro de Estados financieros alinean (por Inter). **Las tablas de Caja, Compras, Existencias, Ventas,
Colaboradores… escriben montos y cantidades con cifras de ancho distinto**: «1,111.10» es más angosto que «8,888.80» y, alineados a la
derecha, los decimales coinciden pero los miles y las centenas no forman columna. En una lista para comparar montos es justo lo que falla.

Cómo se ve en el navegador: `referencia/medir.js` (modo `medir`) devuelve `cifras.familias`; una fila
`{ familia: "DM Sans…", pidenTabulares: 40, tieneTabulares: false }` es este hallazgo en la pantalla que mides.

## 3. Lo que hacen los mejores

- **Fluent 2 (Microsoft)** declara `fontFamilyNumeric` (Bahnschrift): una familia aparte, solo para números [Práctica].
- **Atlassian** tiene tokens `font.metric.*` solo para las cifras de tablero [Práctica].
- **Material 3 y Atlassian** separan la letra de marca (lo grande) de la de interfaz [Práctica]. El ERP ya lo hace con EB Garamond.
- Con dos familias y una tercera solo para cifras, el repo sigue dentro de «use multiple fonts conservatively» (Next.js) siempre que la
  tercera sea **la que ya está cargada**.

## 4. Opciones

| | A · Inter para toda cifra (recomendada) | B · Solo los dígitos, de otra letra | C · Cifras en EB Garamond | D · Dejarlo así |
|---|---|---|---|---|
| Qué es | `lib/letra-estados.ts` pasa a cargarse en `app/layout.tsx` (una sola declaración, `next/font` no deja repetirla); un token `--font-cifras: var(--letra-estados), var(--font-dm-sans), …` en `@theme`; y una regla única `:where(.tabular-nums):not(.font-display, .font-serif) { font-family: var(--font-cifras) }` más el cambio de las reglas CSS que escriben `font-variant-numeric: tabular-nums` a mano | Un `@font-face` con `unicode-range: U+0030-0039, U+002C, U+002E` (dígitos, coma, punto) de una sans con `tnum`, puesta delante de DM Sans solo en `--font-cifras`. Las letras y la «S/» siguen en DM Sans | Las cifras de tablas y filas pasan a `font-serif` (como ya hace `TarjetaCifra`) | Nada |
| Ganas | **Cero letras nuevas**: Inter ya está en el repo y Felipe ya la eligió mirando para cifras. Las ~893 líneas que hoy no hacen nada empiezan a alinear de una vez, porque el gancho (`.tabular-nums`) ya está puesto. Estados y el resto se ven iguales | La letra de la frase no cambia: solo los dígitos. Lo más fiel a DM Sans | Ninguna descarga nueva. Es la marca | Cero trabajo y cero riesgo |
| Pagas | Una descarga más en toda pantalla (Inter latin, 3 pesos; peso del archivo sin medir). Dos sans en la misma fila (el nombre en DM Sans, el monto en Inter): hay que mirarlo. `estados.css` y `finanzas-bolsillos.css` quedan redundantes y se simplifican | `next/font/google` no deja elegir `unicode-range`: hace falta `next/font/local` con un archivo recortado (`pyftsubset`) dentro del repo, que es una letra nueva y un paso más de mantenimiento | La altura x de EB Garamond (0,400) hace que la cifra a 14 px se vea chica junto al texto; una tabla densa en serif se lee «editorial»; mezcla serif y sans en cada fila | Las columnas de montos siguen sin columna; 893 líneas siguen pidiendo algo que no pasa |
| Riesgo | Que la mezcla se note. Se mitiga con un piloto en UNA tabla y Felipe mirando | Glifos de puntuación de dos letras distintas en el mismo número | Que la tabla pierda densidad | Ninguno nuevo |

**Recomendación: A, con piloto.** Es la única que no trae una letra nueva, reusa una decisión de Felipe (ADR-0611) y arregla todo desde un
solo lugar. B es la más fina pero mete un archivo de letra al repo. C sirve solo para cifras grandes (ya la usa `TarjetaCifra`).

## 5. Cómo se mide (antes y después)

1. **Antes:** `medir.js` a 1440 × 900 en una pantalla con tabla de montos (piloto sugerido: Compras, la tabla de la que salió `<Tabla>`).
   Anota `cifras.familias`, `resumen.cifrasQuePidenTabularesYNoLosTienen` y `resumen.columnasSinAlinear`. Captura.
2. **Después:** lo mismo. Pasa si la familia de las cifras dice `tieneTabulares: true`, `cifrasQuePidenTabularesYNoLosTienen` llega a 0 y
   las columnas numéricas no varían más de 1,5 px en su borde derecho.
3. **Peso de la letra:** tras `pnpm --filter web build`, mira el tamaño de los `.woff2` nuevos en `.next/static/media` (o la pestaña Red).
4. **Felipe mira** las dos capturas al mismo ancho, en claro y oscuro (`/unificar` arma la lámina). Sin su elección, no se aplica.
5. Si se aplica: una prueba que falle si una regla CSS nueva escribe `font-variant-numeric: tabular-nums` sin `--font-cifras` (mismo estilo
   que `lib/montos-sin-corte.test.ts`), y avisar en el PR que **toca Dynamic** solo si cambia algo de `app/estilos/vidrio/` (CLAUDE.md «Los dos sistemas»).

## 6. Mientras no se decida

- **No quites `tabular-nums`**: es inocuo y es el gancho que usará la solución.
- Cifras que comparan (columnas): a la derecha, con los mismos decimales en toda la columna; eso alinea al menos el final.
- Cifras sueltas grandes (KPI): en serif, como `TarjetaCifra` (`font-display lining-nums tabular-nums`): ahí sí alinean.
- No inventes otra letra ni un `font-family` local para «arreglarlo» en una pantalla: es una decisión de todo el ERP.
