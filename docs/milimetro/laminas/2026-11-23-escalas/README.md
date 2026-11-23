# Lámina de escalas (2026-11-23): el tono del texto y las cifras

`/milimetro proponer`. Salió de la segunda vuelta del análisis de reglas
(`docs/investigacion/2026-11-19-diseno-color-y-flujo-sin-miedo-a-las-reglas.md`, propuestas 1 y 2 de diseño). **Nada de esto está
aplicado al ERP: espera la elección de Felipe.** La página de elección y las fotos viven en `apps/web/unificar/.salida/escalas-2026-11/`
(fuera de git: llevan datos de la base local). Estas son sus fuentes.

| # | Pregunta | Opciones |
|---|---|---|
| 1 | ¿Con qué tono va el texto que acompaña? | A hoy (13 opacidades de tinta y el café) · B tinta en tres tonos (100, 80 y 64 %) · C tinta y café, dos voces |
| 2 | ¿Las cifras en DM Sans pasan a Inter? | A hoy (DM Sans) · B Inter, solo en las cifras (propuesta 1 del tablero) |

## Lo que se midió (2026-11-23, ERP local con la base aislada y datos inventados, 1440 × 900)

- **Contraste** (`.claude/skills/color/referencia/medir.js` en cada foto): ninguna opción deja un texto bajo 4,5:1 en Compras,
  Movimientos ni Historial de ventas, en claro ni en oscuro. En oscuro, los textos débiles para APCA (la segunda mirada) son 94 hoy,
  46 con B y 95 con C. En claro, 1 o 0 en las tres.
- **Contraste por tono, calculado** (alfa compuesto en sRGB sobre crema, papel, hueso y arena): tinta al 80 %, de 7,7 a 8,9:1 en claro y
  de 6,9 a 10,1:1 en oscuro; al 64 %, de 4,7 a 5,1:1 y de 5,1 a 6,9:1; el café, de 4,5 a 5,6:1 en claro (justo sobre hueso y arena) y de
  5,0 a 7,8:1 en oscuro.
- **Cifras** (página en blanco, 40 px, `tabular-nums`): «1111» y «0000» miden 41,3 y 107 px en DM Sans (la de next/font y la completa de
  Google), 103,8 y 103,8 en Inter, y 76,8 y 76,8 en EB Garamond. DM Sans no trae cifras tabulares; la Garamond de los montos ya alinea.
- **Tamaño óptico de DM Sans** (eje `opsz`, la propuesta que se retiró): la misma frase mide 160,6 contra 160,8 px a 11 px y 204,0 contra
  204,7 a 14 px; solo a 46 px cambia (606,7 contra 672,6). En la letra de lectura del ERP no se nota, y la letra grande es Garamond.
  Por eso no está en la lámina.

## Lo que la lámina no muestra

- Las opciones de texto solo alcanzan a las clases de Tailwind (`text-tinta/NN`, `text-taupe`). El texto tenue escrito en un CSS de
  `app/estilos` (`color-mix(…tinta N%…)`, 2.028 en total) no cambia en las fotos; si se elige B o C, se migra con la misma regla.
- El tono de las líneas y bordes (`border-tinta/NN`, 16 escalones) va detrás del texto: se ordena con el mismo criterio una vez elegido.

## Archivos

| Archivo | Qué hace |
|---|---|
| `texto-b.css`, `texto-c.css` | las opciones B y C del tono, como una hoja que se pone encima (no tocan el ERP) |
| `cifras-b.css` | la opción B de las cifras: Inter en los elementos marcados con `data-cifra-sans` |
| `fotos.mjs` | abre cada pantalla con la cuenta `admin`, pone la opción, saca la foto y su recorte, y mide el contraste; escribe `medidas.json` |
| `elegir.json` | la especificación de la página (`node unificar/elegir.mjs elegir.json`, desde `apps/web`) |
| `lamina.css` | la cara de la página: letras y tokens del ERP, para que «Ver en oscuro» funcione |

## Cómo se vuelve a armar

Con el ERP local en marcha (`cayla-retail-dev-base-prod` de `.claude/launch.json`, puerto 3010), desde `apps/web`:

```
mkdir -p unificar/.salida/escalas-2026-11 && cp ../../docs/milimetro/laminas/2026-11-23-escalas/* unificar/.salida/escalas-2026-11/
B=http://localhost:3010 TEMA_DB_CONTENEDOR=supabase_db_cayla-retail-prod node unificar/.salida/escalas-2026-11/fotos.mjs
node unificar/elegir.mjs unificar/.salida/escalas-2026-11/elegir.json
```

Se ve con `preview_start` `unificar-laminas`: `http://localhost:8793/escalas-2026-11/elegir.html`.
