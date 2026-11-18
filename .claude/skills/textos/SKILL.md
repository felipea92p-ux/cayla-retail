---
name: textos
description: Escribe y audita cada texto del ERP CAYLA en español del Perú, al milímetro y con base teórica (WCAG, Apple, NN/g, RAE, CLDR) — botones, títulos de pantalla y de hoja, etiquetas, ayudas, errores de campo y de hoja, avisos de éxito y con «Deshacer», confirmaciones de lo irreversible, vacíos, cargando y sin conexión; y los formatos de dinero (S/ 1,234.50), fechas, horas y unidades. Respeta el vocabulario del repo (cliente, miembro, sede, integrante) y las piezas que ya traen su texto. Úsala al escribir o revisar los textos de una pantalla o un modal, cuando `/milimetro` pida la sección «Texto» de la ficha, y cuando Felipe diga «textos», «microcopy», «cómo lo digo», «el mensaje de error no se entiende», «revisa la redacción» o «el formato del monto/la fecha está mal».
---

Escribe o audita los textos de: $ARGUMENTS   (una ruta como `/vender`, un modal, un componente, `auditar <ruta>`, o sin argumento = lo que estás construyendo)

**Un texto del ERP dice lo que pasa y qué hacer, en las palabras de la tienda, y se mide: si hay que leerlo dos veces, está mal escrito.**

## Candados

1. **El repo manda sobre la skill.** El vocabulario sale de `CLAUDE.md` («Vocabulario obligatorio», «Idioma»); el texto fijo de cada pieza, de
   la tabla «Una función, una pieza» (ADR-0358: «Descargar», «Imprimir», «Guardando…», `<AvisoNoSeDeshace />`); los montos, de `soles` y sus
   hermanas (F1). La skill **nunca** inventa un formateador, una pieza, un color ni una fuente; tampoco reescribe el texto que trae una pieza.
2. **Lo que la investigación diga que se puede mejorar se escribe como propuesta** (regla actual con archivo/ADR → qué hacen los mejores →
   propuesta → riesgo → cómo se mide) y se decide con Felipe mirando. Cambiar una regla de varios módulos exige su OK (CLAUDE.md «Reglas de
   ejecución»). Los textos de dinero, stock, comprobantes/SUNAT y los legales del club (Política, Términos, casillas) son siempre de Felipe.
3. **Tres niveles, siempre etiquetados:** `[Evidencia]` · `[Norma]` · `[Práctica]`. Un número de práctica no es un hallazgo. Detalle y
   «No verificado» en `referencia/fuentes.md`.
4. **Se mide, no se opina.** Cada regla dice cómo se verifica: `referencia/auditar.pl` (el colador del código), `referencia/medir.js`
   (lo que se ve, con `javascript_tool`) o una prueba del repo (`lib/montos-sin-corte.test.ts`, `lib/guias.test.ts`, `lib/sugerir.test.ts`).
5. **No duplica:** el ejemplo, el placeholder y los chips son de **`/sugerir`**; el pie «Sigue: Nombre · quedan 2 más» y lo que «falta», de
   **`/focus`**; la nota de la ley 4 «lenguaje de tienda», de **`/formidable`**; qué pieza dibuja el botón, de **`/unificar`**; los pasos de la
   demo, de **`/guia`**; el pulido visual, de **`/better-ui`**. /textos escribe y revisa las palabras; si el problema es la pieza o el ejemplo, pasa la posta.

## Las reglas al milímetro

### A · Principios (valen para todo texto)

1. **Claro antes que ingenioso.** Ni chistes ni metáforas en lo que se toca: «Guardar», no «¡Listo, a volar!» → `[Norma]` Apple HIG («avoid the
   temptation to be too cute or clever»).
2. **Lo importante, primero.** La palabra que decide va en las dos primeras: «Falta el celular…», no «Para poder continuar es necesario…»
   → `[Norma]` Apple HIG («put the most important information first»). Se mide leyendo solo las dos primeras palabras de cada texto.
3. **Verbo en lo que se toca.** Botones y enlaces dicen la acción: «Registrar gasto»; nunca «Clic aquí» → `[Norma]` Apple HIG; GOV.UK. R06, R09.
4. **Mayúscula solo inicial** (y nombres propios), en botones, títulos y etiquetas; **las mayúsculas se tildan**. La versalita la pone el CSS
   (`label-cayla`, la voz de cabecera), nunca se escribe en mayúsculas → `[Norma]` Microsoft Style Guide; RAE (tilde). R07, R08.
5. **Sin culpa.** Se dice lo que el sistema necesita, no lo que la persona hizo mal; nunca «inválido», «incorrecto», «erróneo» →
   `[Práctica]` NN/g 2023; Apple HIG («Invalid name»). R10.
6. **Qué pasó + cómo se arregla**, en texto, junto a su origen → `[Norma]` WCAG 3.3.1 (A) y 3.3.3 (AA). Plantillas: patrones 6 y 7.
7. **Lo escrito se conserva.** Un error nunca vacía la hoja; si lo dices («Lo que escribiste sigue aquí»), que sea verdad → `[Práctica]` NN/g 2023.
   Se verifica en `/chaos` (red y sesión).
8. **Sin relleno:** sin «Por favor», «exitosamente», «con éxito», «Error:» ni «!» en un error; «…» es un carácter → `[Práctica]` GOV.UK
   («no need to say ‘please’»), Apple HIG («oops»). R11–R15.
9. **Una cosa, un nombre.** «cliente» (y «miembro» en el club), «sede», «integrante/colaborador», «líder de equipo/encargado de sede»; nunca
   «clienta», «socia», «empleado», «jefe», «sucursal» en pantalla (los nombres de código —`retail.clientas`, `/clientas`— no se tocan). El error usa la
   misma palabra que la etiqueta → `[Práctica]` CLAUDE.md, ADR-0288 act. k. R01, R02.

### B · Patrones (plantilla corta; las literales, con bien/mal y casos de CAYLA: `referencia/patrones.md`)

| # | Pieza | Plantilla | La pieza del repo |
|---|---|---|---|
| 1 | Botón | «<Verbo> <qué>», 1–3 palabras; mientras: «<Gerundio>…» | `<Boton cargando textoCargando>`, `btn-cayla` |
| 2 | Título de pantalla | «<Nombre del menú>», nunca la sede | `<EncabezadoPagina titulo>` |
| 3 | Título de hoja | «<Verbo> <qué>» · «Nuevo <qué>»; lo concreto en la bajada | `<Modal titulo subtitulo>` |
| 4 | Etiqueta | «<Sustantivo>», sin «:»; `*` y «· opcional» los pone la pieza | `<Campo etiqueta>` |
| 5 | Ayuda | «<Para qué / dónde está>.» persistente; el «Ej.» es de `/sugerir` | `<Campo ayuda>` |
| 6 | Error de campo | «<Qué falta o pasa>. <Cómo se arregla>.» al salir del campo | `<Campo tono="error" pie>`, `guia.marcarError` |
| 7 | Error de hoja | «No se pudo <verbo> <qué>» · «Lo que escribiste sigue aquí.» · «<Qué hacer>.» | `<Aviso tono="error">`, `traducirError` |
| 8 | Éxito | «<Cosa> <participio>» + detalle: «Caja abierta» | `avisar.exito(texto, { detalle })` |
| 9 | Con «Deshacer» | «<Cosa> <participio>» + lo que se conserva + «Deshacer»; solo lo reversible | `avisar.exito(…, { accion })` (≥ 7 s) |
| 10 | Irreversible | «¿<Verbo> <la cosa concreta>?» · consecuencia con cifras · «Cancelar» / «<Verbo> <cosa>» | `<AvisoNoSeDeshace />`, `<PieAcciones>` |
| 11 | Vacío | «Todavía no hay <cosas> <cuándo>» · «<Qué hacer> y <qué verás>.» · «<Verbo> <cosa>» | `<Vacio titulo acciones>` |
| 12 | Vacío de búsqueda | «Nada coincide con «<buscado>»» · «Borrar la búsqueda» / «Limpiar filtros» | `<Vacio filtros>`, `<BotonLimpiar>` |
| 13 | Cargando | sin texto: esqueleto o loader; el botón dice su gerundio; «Buscando…» en el campo | `<EsperaPantalla>`, `<Buscador buscando>` |
| 14 | Sin conexión | «Sin conexión» · qué pasa con lo tuyo · qué pasará solo | `SinConexion.tsx`, `SinBase.tsx` |

Niveles: 1 y 3 `[Norma]` Apple HIG; 6 `[Norma]` WCAG 3.3.1/3.3.3 + `[Evidencia]` Wroblewski 2009 (validar al salir, indicativo); 8–9 `[Norma]`
WCAG 4.1.3 (ya lo cumplen `Avisos.tsx`/`Aviso.tsx`) + `[Práctica]` Carbon; 10 `[Práctica]` NN/g 2018; 11 `[Norma]` Apple HIG; el resto `[Práctica]` del repo.

### F · Formatos (es-PE; verificado con `Intl`, CLDR 48)

1. **Dinero: «S/ 1,234.50»** — «S/», espacio que no se parte (U+00A0), coma de miles, punto decimal, dos decimales. Se escribe con **`soles`
   de `lib/compras-reglas.ts`** (la que amarra `lib/montos-sin-corte.test.ts`, ADR-0413); cifra grande para decidir, sin céntimos:
   `solesRedondo` de `lib/gastos-reglas.ts` («S/ 5,472»). En JSX, «S/&nbsp;»; un mensaje que llega de la base pasa por `montosSinCorte`. Nunca «S/.»,
   «S/25», «PEN 25» ni «25 soles» → `[Norma]` CLDR es-PE. **Conflicto:** la Ley 23560 fija la coma decimal y FundéuRAE separa los miles con espacio;
   el repo usa el formato de CLDR (punto decimal) y `CampoMonto` entiende «2,5» y «1,299.50» (ADR-0419). No se cambia: ver propuesta 2.
2. **Signos:** negativo «−S/ 25.34» con el signo menos U+2212 delante del símbolo (`solesCentimos`, `solesConSigno` de `lib/flujo-caja-reglas.ts`);
   con signo, «+S/ 38,200». `Intl` escribe «-S/ 25.00» con guion: no lo mezcles en una misma pantalla → `[Práctica]` repo. R17.
3. **Cantidades:** `toLocaleString("es-PE")` → «1,234»; «1 ud», «3 uds» (`textoRitmoRecienteCelda`, `lib/resumen-formato.ts`) → `[Norma]` CLDR. R18.
4. **Fechas (siempre de Lima, `lib/fechas-lima.ts`):** en una frase, **«12 nov. 2026»** (`Intl.DateTimeFormat("es-PE", { dateStyle: "medium",
   timeZone: "America/Lima" })`); del año en curso puede ir sin año. En listas, «19/09» (`diaMes`, `diaYHoraLima`). Meses en minúscula. Nunca
   «2026-11-12» a la vista ni mes/día → `[Norma]` CLDR. **Hoy el repo escribe «23 oct» sin punto** (32 copias de `MESES`): propuesta 3.
5. **Horas:** el repo usa 24 h, «16:34» (`horaLima`, ~200 usos); CLDR es-PE da «4:34 p. m.» (~60 usos). En una misma pantalla, una sola forma → propuesta 4.
6. **Porcentaje y unidades:** sin decidir en el repo («12%» y «12 %» conviven; «uds», «unid.» y «u.» también): usa el del módulo y anótalo → propuesta 7.
7. **Abreviaturas y signos:** siglas sin puntos ni plural con s (SUNAT, RUC, DNI, IGV); abreviaturas con punto («Ej.», «aprox.», «N.º», «p. m.»);
   símbolos sin punto (S/, kg, m, %); comillas angulares «»; el punto medio «·» separa datos («Blusa Emma · Blanco · M»); ¿ y ¡ siempre abren → `[Práctica]` repo.

### D · Largo (se mide a 1440 y a **375 px** con `referencia/medir.js`: `cortados`, `botonEnDos`)

1. Un botón cabe en **un renglón a 375 px** (1–3 palabras); si no cabe, se acorta el texto, no la letra → `[Práctica]` repo.
2. El título de una hoja, en un renglón a 375 px; lo concreto baja a `subtitulo`.
3. Un aviso, **dos renglones** como máximo (título + detalle) → `[Práctica]` Carbon.
4. La demo: título ≤ 40 letras, texto ≤ 320 (ADR-0389, lo vigila `/guia`). Un placeholder que no cabe lo corta `/sugerir` (`MAX_DESCRIPCION`).

### E · Tono

1. **«Tú», siempre**, sin mezclar con «usted» → `[Práctica]` Mercado Pago («No utilizamos los pronombres "vos" o "usted"»); Formidable ley 4. R04.
2. **Español neutro peruano:** celular, computadora, boleta, reporte; nunca «ordenador», «móvil», voseo ni jerga interna (stock sí: es de tienda;
   «RPC», «sync», «payload», no) → `[Práctica]` Microsoft español neutro; CLAUDE.md «Idioma».
3. **Sin «nosotros» en un error:** quién es «nosotros» no está claro; di lo que pasa («No responde el sistema») → `[Norma]` Apple HIG. Propuesta 8.
4. **Sin género para el cliente:** «Te damos la bienvenida», «Ya casi», «Te invitamos»; colectivos y «persona» («el equipo», «quien atiende»),
   sin desdoblar ni «x/@/e» → `[Práctica]` ADR-0288 act. k; OMPI 2022. R03.
5. **El «¡!» es solo de celebrar** algo real («¡Te damos la bienvenida, Rosa!»), nunca de un error, un aviso ni un botón → `[Norma]` Apple HIG. R12.

## Cómo se usa

**Diseñar** (sale la sección «Texto» de la ficha): 0) lee `docs/pantallas/<slug>.md` si existe y el vocabulario de `CLAUDE.md`. 1) Lista cada texto
de la pieza en sus estados (default, error, vacío, cargando, éxito, sin conexión). 2) Escríbelo con su patrón (B) y sus formatos (F), marcando la
regla. 3) Si el texto es de una pieza con texto fijo, nómbrala y no lo reescribas; si es un ejemplo, pásalo a `/sugerir`. 4) Mídelo (D) en el navegador.

**Auditar** (una ruta, un módulo o todo):
1. **El colador del código** (lee, no toca; < 5 s en todo `apps/web`):
   ```
   CONTAR=1 perl .claude/skills/textos/referencia/auditar.pl              # el tablero: cuántos por regla
   perl .claude/skills/textos/referencia/auditar.pl components/CerrarCajaModalV2.tsx "app/(app)/caja"   # el detalle de lo que tocas
   SOLO=R10 perl .claude/skills/textos/referencia/auditar.pl              # una regla
   ```
   Reglas: R01 «clienta/socia» · R02 empleado/jefe/sucursal · R03 «Bienvenido/a» · R04 usted · R05 «Exportar» · R06 OK/Aceptar/Sí · R07
   MAYÚSCULAS a mano · R08 Mayúscula De Título · R09 «clic aquí» · R10 inválido/incorrecto · R11 «Error:»/«Ocurrió un error» · R12 «!» en un error
   · R13 «Por favor» · R14 «exitosamente» · R15 «...» · R16 «Cargando…» suelto · R17 «S/25», «S/.» · R18 fecha o número sin `es-PE`.
   Es un colador: **cada hallazgo se lee** (un ticket impreso lleva «TOTAL» a propósito; «Haz clic» en la guía de Windows es correcto). Una línea
   legítima se exime con `// textos-fijo: <por qué>` (10 caracteres o más). Tablero al 2026-11-12: R01 2 · R03 1 · R05 1 · R06 1 · R07 14 (casi todo
   papel impreso) · R08 1 · R09 5 · R10 12 · R15 1 · R16 4 · R18 13; el resto en 0.
2. **Lo que se ve** (el código no ve los textos que llegan de la base): con la pantalla abierta, pega `referencia/medir.js` en
   `javascript_tool` a 1440 × 900 y a 375 × 812, y abre cada estado (error al guardar, vacío, búsqueda sin resultado). Devuelve solo lo que falla:
   vocabulario, botones genéricos o en dos renglones, errores con «inválido» o «!», campos sin etiqueta, montos partibles, fechas crudas, texto cortado.
3. **Los mensajes de la base** (las RPC hablan solas, ADR-0022): en el Postgres local, de solo lectura:
   ```sql
   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.prosrc ~* 'raise exception ''[^'']*\m(clientas?|socias?|inv[aá]lid[oa]s?)\M';
   ```
   Lo que salga no se arregla en la web (no se re-traduce): se anota para una migración, que es de Felipe (ADR-0288 act. k dejó ~25 pendientes).
4. **Informe:** cada hallazgo con regla, archivo:línea, texto actual → texto propuesto, y evidencia **Medido** (colador o navegador) u **Observado**.
   Agrupa por pantalla y propone; **espera el OK** antes de tocar (candado 2), y en el PR di qué textos cambiaron.

## Tu sección de la ficha

```
## Texto        (de /textos)
| Lugar (estado)            | Texto literal                                   | Regla        | Nivel      |
|---------------------------|-------------------------------------------------|--------------|------------|
| Título de la hoja         | «Registrar gasto»                               | B3, A3       | [Norma]    |
| Botón principal / cargando| «Registrar gasto» / «Guardando…»                | B1, D1       | [Norma]    |
| Etiqueta · ayuda          | «Monto» · «Lo que dice la boleta, con IGV.»     | B4, B5       | [Práctica] |
| Error del campo           | «Falta el monto. Escríbelo así: 45.50.»          | B6, A5, A6   | [Norma]    |
| Error de la hoja          | «No se pudo registrar el gasto…» (3 líneas)     | B7, A7       | [Práctica] |
| Éxito / Deshacer          | «Gasto registrado» · «S/ 45.00 en Movilidad»    | B8, F1       | [Norma]    |
| Vacío                     | «Todavía no hay gastos este mes» …              | B11          | [Norma]    |
Formatos: monto con `soles` (F1) · fecha «12 nov. 2026» (F4) · hora (F5: la del módulo).
De otros: ejemplo y placeholder → /sugerir · «Sigue: …» → /focus · pieza del botón → /unificar.
Medido: auditar.pl (R01–R18: 0 en los archivos de la pieza) · medir.js a 1440 y 375 (sin fallas).
Propuestas: las que la pieza choque (número de la lista de abajo).
```

## Propuestas de mejora al repo (todas: propuesta, espera a Felipe)

1. **Un solo formateador de dinero, fecha y hora.** Hoy `soles` de `lib/compras-reglas.ts` es el que amarra la prueba, pero hay ~70 definiciones
   locales (más de 25 exportadas: `soles` en `precio-sede-reglas`, `historial-prenda-reglas`, `flujo-caja-reglas`, `liquidacion-reglas`…) y 13
   que formatean con `en-US`. Los sistemas grandes dan **una** función por formato. Propuesta: `lib/formato.ts` (`soles`, `solesRedondo`,
   `solesConSigno`, `fecha`, `fechaCorta`, `hora`) y una prueba como la de `/sugerir` cuya deuda solo baja. Riesgo: toca casi todos los módulos
   (cambia cómo se ve, nunca la cifra). Se mide: `grep -rc "function soles\|const soles" apps/web/lib` → 1.
2. **Escribir en un ADR el conflicto del separador decimal:** CLDR (punto decimal, coma de miles: el uso de bancos y aparatos en Perú) frente a
   la Ley 23560 (coma) y a la RAE (miles con espacio). Hoy la decisión vive en comentarios (ADR-0121, ADR-0413, ADR-0419). Propuesta: un ADR que diga
   «el ERP escribe CLDR es-PE; lee las dos formas; un documento con exigencia metrológica es la excepción». Riesgo: ninguno. Se mide: existe el ADR.
3. **La fecha abreviada: «12 nov.» (CLDR, con punto de abreviatura) o «12 nov» (32 copias de `MESES` y 7 `replace(".", "")`).** Propuesta: CLDR,
   desde el formateador único. Riesgo: un carácter más en columnas angostas. Se mide: el colador sin `"ene", "feb"` a mano; capturas a 375 px.
4. **La hora: 24 h («16:34», `horaLima`) o «4:34 p. m.» (CLDR, ~60 usos).** Propuesta: 24 h en registros, caja y tablas (se cuadra con el ticket);
   «p. m.» solo en lo que lee el cliente (horario de la tienda). Riesgo: bajo. Se mide: una sola forma por pantalla (`medir.js`).
5. **El saludo del login «Bienvenido(a)» (`lib/login-saludo.ts`) choca con ADR-0288 act. k.** Propuesta: «Te damos la bienvenida, Camila» o
   «Hola, Camila». Riesgo: el saludo es parte de una animación (ADR-0136 act. 2026-10-13 d): medir que quepa. Se mide: R03 = 0.
6. **Un vigilante de vocabulario y de errores para todo el ERP**, no solo para las demos (`lib/guias.test.ts`) y Producción
   (`lib/produccion-vocabulario.test.ts`): R01, R02, R05, R10, R11 sobre el árbol de TypeScript (como `lib/montos-sin-corte.test.ts`, sin
   comentarios ni identificadores), con `// textos-fijo:` y deuda que solo baja. Hoy quedan 2 «clienta» a la vista (`components/apartados/DetalleApartado.tsx:246`,
   `lib/tejido-ayuda.ts:257`). Riesgo: falsos positivos si se hace con grep. Se mide: la prueba en el CI.
7. **Porcentaje y unidades:** «12%» (CLDR) y «12 %» (RAE, no verificado) conviven (~205 y ~315 apariciones); «uds», «unid.» y «u.» también. Propuesta:
   Felipe elige mirando una tabla con las dos formas. Riesgo: bajo. Se mide: grep de cada forma.
8. **«No logramos conectar con el sistema» (`components/SinBase.tsx`)** habla en «nosotros»; Apple HIG lo desaconseja en errores. Propuesta:
   «El sistema no responde». Riesgo: mínimo. Se mide: lectura.
