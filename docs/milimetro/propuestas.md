# Al milímetro — tablero de propuestas

Lo que la investigación del 2026-11-12 (`docs/investigacion/2026-11-12-fundamentos-de-diseno/`) dice que se puede hacer mejor
que hoy. **Nada de esto está aplicado: cada fila espera a Felipe.** Las skills del set (`/milimetro`, `/movimiento`,
`/tipografia`, `/espacio`, `/color`, `/graficos`, `/textos`) traen el detalle de cada una en su sección «Propuestas de mejora al repo»;
`/milimetro proponer` arma la lámina para elegir mirando, como `/unificar`.

Felipe, 2026-11-12: «Reescribimos las reglas siempre y cuando sea una mejora para lo que hay hoy en día; si es la forma en que lo
hacen los mejores del mundo, hagámoslo». Cada propuesta dice qué se gana, de dónde sale y qué se arriesga.

## Las que más cambian (por orden)

| # | Skill | Propuesta | Por qué (nivel) | Riesgo |
|---|---|---|---|---|
| 1 | `/tipografia` | **Las cifras en una letra con tabulares.** DM Sans no trae `tnum`: las ~1.300 líneas que piden `tabular-nums` no alinean nada en DM Sans. Usar en toda cifra tabular la Inter que ya carga Estados financieros (`lib/letra-estados.ts`), con un token `--font-cifras`. Piloto: una tabla de Compras, medida antes y después con `medir.js` | Las columnas de montos se leen alineadas [Norma de oficio + verificación del archivo de la letra; la tienda ya lo resolvió así, ADR-0446] | Una tercera letra en pantalla; el peso del archivo |
| 2 | `/movimiento` | **Que las animaciones no arranquen todas apagadas.** Hoy (ADR-0625) casi nadie ve las «full animaciones» que eligió Felipe. Por defecto un modo ligero (fundidos y respuestas ≤ `--t-hoja`); lo rico, con el botón encendido. La preferencia del sistema sigue ganando siempre | WCAG 2.3.3 pide poder apagarlas, no que nazcan apagadas [Norma]; los sistemas grandes respetan la preferencia del sistema [Práctica] | Equipos lentos; hay que medirlo en uno |
| 3 | `/movimiento` | **Quieto reemplaza, no borra.** Hoy todo queda en 0,01 ms; mejor cambiar el desplazamiento por un fundido de la misma duración | La opacidad no cuenta como movimiento para WCAG [Norma]; Val Head [Práctica] | Bajo |
| 4 | `/color` | **El foco nunca rojo.** Quedan `--color-ring: var(--color-rojo)`, `.hoja-cobro-medio:focus-visible` y 27 `outline-rojo` que `lib/foco-comun.test.ts` no cuenta | Regla del propio repo (ADR-0351, «el rojo es solo del error") | Bajo |
| 5 | `/color` | **El CI mide el contraste por superficie también en claro.** Hoy solo en oscuro: `rojo` sobre `hueso`/`sand` da 4,23/4,18 y nadie avisa | WCAG 1.4.3, 4,5:1 [Norma] | Bajo |
| 6 | `/textos` | **Un solo formateador de dinero, fechas y horas** (`lib/formato.ts`). Hoy hay ~70 definiciones locales de `soles` y 13 que formatean con `en-US` | Una función por formato, como los sistemas grandes [Práctica] | Migración gradual, archivo por archivo |
| 7 | `/graficos` | **«Ver como tabla» en `BarrasTiempo`, `Linea` y `BarraApilada`**, y subir las barras de contexto (hoy 1,56:1) y la rejilla (1,24:1) | WCAG 1.4.11 [Norma]; Heer & Bostock 2010, rejilla al 20 % [Evidencia]; Chartability [Práctica] | Bajo |
| 8 | `/graficos` | **Entrada corta, cambio de datos largo.** Hoy las piezas tardan 560–1100 ms en entrar y 500–700 ms en el cambio de datos, que es el que ayuda a leer. Al revés: entrada ≤ `--t-momento`, cambio ~800 ms en dos etapas | Heer & Robertson 2007 [Evidencia] | Choca con «ricas, una vez»: lo decide Felipe mirando |
| 9 | `/milimetro` | **Un aviso con «Deshacer» o un error no se va solo** (hoy 7 s y 8 s, `lib/avisos-reglas.ts`) | Carbon; WCAG 2.2.1 [Práctica/Norma] | Más avisos a la vista |
| 10 | `/espacio` | **Una escala cerrada de espacio**, escrita igual en `CLAUDE.md` y en `/formidable` (uno dice múltiplos de 4, el otro de 2; hay 313 usos de 14 px y valores sueltos de 5, 11, 15 y 18 px) | Carbon, Atlassian, Primer [Práctica] | Bajo; va con `/unificar` |

## Las demás (cada una en su skill)

- **`/movimiento`:** registro único de bucles (`lib/bucles.test.ts`), tiempos largos fuera de la lista de excepciones (`.anim-sube` hasta ~1,8 s, `.hilo-vertical` 1,8 s),
  sin cascada cuando la hoja se abre con el teclado, un token `--t-salida` para los 220 ms sueltos, `@keyframes cayla-onda` definido dos veces en `globals.css`, dos `transition-all`.
- **`/tipografia`:** la vigilancia de `texto` solo mira `<p>` (deja pasar 13 px en `<span>`/`<div>`: globo de `<Ayuda>`, frase de `<Cajon>`); interlineados fraccionarios (23,25 y 19,5 px);
  `.texto-bajada`, `.texto-detalle` y `.nota-cayla` en px y no en rem; `case` en las versalitas de DM Sans.
- **`/espacio`:** `btn-chico` mediría 40 px y no 44 (una regla sin capa le gana; falta medirlo); la regla «sin sombras» no calza con el vidrio claro; densidad compacta opcional;
  la cebra de `.fila-cayla`; 52 cortes de ventana a medida.
- **`/color`:** `packages/shared/src/design-tokens.ts` está desactualizado; el texto tenue del oscuro al 70 % y no al 60 % (APCA); colores de dato vecinos que se confunden con daltonismo
  (`sede-tru`/`sede-tal`, `metodo-yape`/`metodo-transferencia`); un tono de error distinto del rojo de marca, solo si medir lo justifica.
- **`/graficos`:** rangos de meta en `BarraAvance` (bullet graph de Few); una escala secuencial con `color-mix` de tinta.
- **`/textos`:** ADR del separador decimal (formato del navegador vs. Ley 23560 vs. RAE); «12 nov.» o «12 nov»; 24 h o «4:34 p. m.»; «Bienvenido(a)» del login contra ADR-0288;
  dos «clienta» visibles y ~25 funciones de la base que aún dicen «clienta» o «socia».
- **`/milimetro`:** `aria-disabled` con su motivo en vez de `disabled` al 50 % para lo apagado por permiso; una cara común para el solo lectura; medir si la cabecera fija tapa el foco
  (WCAG 2.4.11).

## Lo que decidió Felipe

| Fecha | # | Decisión |
|---|---|---|
| | | |
