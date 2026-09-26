# Revisión maestra — AAAA-MM-DD

> **Analizado:** `origin/main` @ `<sha corto>` · **Rama de trabajo:** `<rama>` (`<N>` commits detrás/delante de `origin/main`)
> **Ejes:** A B C D E (o los que corrieron) · **Producción:** consultada en vivo con `SELECT` el AAAA-MM-DD hh:mm / **no consultada** (motivo)
> **Vence cuando** cambien los archivos que cita: este informe es una foto, no un documento vivo. Para saber si sigue valiendo, compara el SHA con `git diff --stat <sha> origin/main -- <archivos citados>`.
> *(Si fue pasada rápida:)* **Pasada rápida — sin escéptico, puede traer falsos positivos.**

## 1 · Los tres movimientos

**El trabajo.** Ocho líneas como máximo: qué se revisó, qué salió, y un veredicto por eje en una palabra («sano», «con deuda», «frágil», «roto») con su razón.

| Eje | Veredicto | Por qué en una línea |
|---|---|---|
| A · Módulos y diccionario | | |
| B · Base de datos | | |
| C · Cierre y pendientes | | |
| D · Instrucciones a Claude Code | | |
| E · Duplicación de la web | | |

**La objeción.** Lo que está mal de fondo, no de detalle: una estructura, una costumbre o una decisión que produce varios de los hallazgos de abajo. Directo, con el trade-off nombrado. Si no hay: «sin objeción».

**Lo que nadie pidió.** UNA cosa, la de mayor consecuencia, con su porqué en una línea.

## 2 · Los diez que harías primero

| # | Id | Sev. | Esf. | Conf. | Hallazgo | ¿Decide Felipe? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## 3 · Corrige ya (Crítico o Alto, esfuerzo S o M, sin decisión pendiente)

Un bloque por hallazgo:

### `<id>` · <título> — <Sev.> · <Esf.> · <Conf.>
- **Problema:** una frase.
- **Evidencia:** `archivo:línea` o consulta → resultado, con fecha.
- **Por qué importa:** el escenario del negocio real (sede, clienta, taller).
- **Solución:** pasos con nombre de tabla, archivo o función.
- **Descartada:** la alternativa real y su costo.
- **Se rompe si:** el escenario específico que haría fallar la solución.
- **Cómo se verifica:** el comando, la consulta o la captura a 375 px.
- **Rúbrica:** n.º de las 12 preguntas de las que nace.

## 4 · Decide Felipe

Cada decisión con «Ganas / Pagas» por opción, la recomendada primero y el cierre «si no respondes, ejecuto X». Solo lo que depende de cómo opera CAYLA (dinero, permisos, plazos, qué se apaga). Lo técnico lo decide quien revisa y se explica en tres líneas.

## 5 · Cómo programar mejor (patrones, no consejos)

Un bloque por patrón, agrupando las `ideas` de los revisores:

### <Patrón en una frase imperativa>
- **Hoy se ve mal aquí:** `archivo:línea` (y cuántos casos parecidos hay).
- **Así se vería bien:** fragmento corto o descripción con nombres reales.
- **Qué lo vigila para que no vuelva:** una prueba, un lint o un paso de CI; si no existe, esa es la tarea.

## 6 · Detalle por eje

Los hallazgos que no entraron arriba, con el mismo formato compacto y ordenados igual. Al inicio de cada eje: el `resumen` del revisor y su lista `no_mire` (lo que no se alcanzó a mirar).

## 7 · Lo que está bien (no lo toques)

Máximo tres por eje. Sirve para que el próximo arreglo no rompa lo que funciona.

## 8 · Descartados por el escéptico

| Id | Lo que decía | Por qué se refutó |
|---|---|---|

## 9 · Anexo: cifras y cómo se midieron

| Cifra | Valor | Consulta o comando | Cuándo |
|---|---|---|---|
