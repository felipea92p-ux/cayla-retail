# Finanzas ▸ Gastos contra las mejores apps de 2025-2026: cómo se ven y cómo se mueven

- **Fecha:** 2026-10-31 · **Rama:** `claude/gastos-benchmark-visual-655c21` (sale de `claude/gastos-extracto-por-dia`, el PR del extracto por día).
- **Qué es:** la pasada **visual y de interacción**. La pasada funcional (9 puntos: corregir sin anular, «no puedo darlo», foto con
  extracción, panel lateral, duplicados, categoría por proveedor, presupuesto, «Por revisar», descargar lo filtrado) ya se hizo, y Felipe
  aprobó construir sus 3 primeros en otra sesión. Aquí no se repite: se le suma cómo **se ven** y cómo **se mueven** las piezas.
- **Lámina tocable:** `docs/maquetas/gastos-benchmark-2026-10/index.html`, con las 8 propuestas de más impacto redibujadas con los tokens
  reales, en claro y oscuro, «Ver a 375 px» y su movimiento, al lado de cómo es hoy.
- **No se tocó** nada de `apps/web` ni de `supabase/`.

**Cómo leer las marcas.**
- **[Verificado]**: lo leí en la fuente enlazada, o en un resumen de esa misma página hecho por el buscador cuando no abría. Las fuentes son
  centros de ayuda, registros de cambios, blogs de las empresas y el código abierto de New Expensify. **Ninguna imagen ni ningún video de
  esas apps se vio ni se copió**: solo texto.
- **[Inferido]**: lo deduzco o es conocimiento general, sin una fuente a mano.
- **[Opinión]**: es mi juicio de diseño.

Ninguna de las 11 apps de gastos de empresa publica una guía de movimiento con duraciones y curvas. Las cifras de movimiento de abajo salen de
tres lugares: el código de New Expensify, las guías de Vercel (Geist), los escritos de Emil Kowalski y Rauno Freiberg, y el sistema de IBM (Carbon).

---

## Cómo es Gastos hoy (lo que se comparó)

Lo vi funcionando en la base local, como líder, a 1440 px en claro y oscuro y a 375 px. Las capturas quedaron fuera de git. La base local
tiene 11 gastos, todos del 9 de octubre, así que para la forma completa también miré el código y las maquetas
`gastos-lista-2026-10`, `gastos-grafico-2026-10` y `gastos-cuando-2026-10`.

| Pieza | Dónde | Cómo se ve y se mueve |
|---|---|---|
| Cabecera y cifra | `GastosPanel.tsx:259`, `RespuestaTelar` | «¿Cuánto gastó CAYLA en octubre?» en versalitas rojas, el hilo, la cifra serif de 46 px que cuenta desde 0 (`CifraAnimada`, 900 ms) y sus chips («▲ 6 % vs septiembre a esta altura») |
| Orillo y dock | `Orillo`, `DockTelar` | La tira por sede que se teje al entrar; el dock flotante abajo con 4 acciones y sus teclas (g, f, e, a) |
| «En qué se va» | `HilosGastos.tsx` | Ranking de categorías: hilo por sede (`BarraApilada`), la rayita del mes anterior, la píldora ▲/▼, el monto, una línea de meses. Al tocar se abre el desglose debajo. Las filas se reordenan con un deslizamiento (FLIP) |
| «Cuándo» | `RitmoGastos.tsx` | `<Linea>` del acumulado contra el mes anterior a la misma altura, el «si sigue así» punteado y los saltos con nombre; tocar un día abre lo de ese día |
| La bandeja | `GastosPulso.tsx` | «Te falta 1 cosa por revisar», UNA cosa a la vez con su botón («Clasificar») y el aviso de lo grande sin comprobante |
| Tres cifras | `TarjetaCifra` | IGV que puedes descontar, Por pagar de gastos, Egresos sin clasificar |
| La lista | `ExtractoGastos.tsx:81` | Por día, como el extracto del banco: separador pegado con el total del día, la fila con «qué · proveedor» y debajo «categoría · pago · comprobante», UNA marca si algo no es normal, el monto con el IGV debajo, «×N» para lo chico repetido, 5 días a la vista |
| Filtros | `GastosPanel.tsx:591` | `Buscador` + dos `DesplegablePildora` (Categoría, Comprobante) y las píldoras de lo puesto |
| El detalle | `GastoDetalleModal`, `GastosPanel.tsx:668` | `<Modal variante="hoja">` **al centro**, 576 px, con velo: la categoría y la cuenta, el título, la bajada, el aviso de la marca, la lista de datos y «Anular…» |
| Registrar | `HojaRegistrarGasto.tsx` | La hoja del telar; al guardar, loader global → aviso «Gasto registrado» con lo que pasa («Se suma a lo gastado en…») → la lista se rehace |

---

## Familia por familia

### 1. La fila de un gasto

**Lo que hacen los mejores**
- **New Expensify.** El código está abierto y da medidas exactas.
  - La fila mide 52 px en la búsqueda de escritorio, 56 en la tabla y 60 en el celular.
  - La miniatura del recibo es de 28×32 px en escritorio y 36×40 en el celular. Si no hay recibo, va un ícono gris de 20 px y no un hueco.
  - Lo anormal va en UNA línea debajo de la fila, con un punto, cortada con «…».
  - [Verificado: https://raw.githubusercontent.com/Expensify/App/main/src/styles/variables.ts y el componente `TransactionItemRowRBR` del mismo repositorio]
- **Mercury.** En 2021 juntó el monto con el nombre del comercio para que se lean de corrido.
  [Verificado: https://mercury.com/blog/new-transactions] Desde marzo de 2026 la categoría sugerida va como etiqueta editable dentro de la fila.
  [Verificado: https://mercury.com/blog/march-2026-product-updates]
- **Copilot.** Cada categoría lleva su emoji. El tipo de movimiento va en una marca cuadrada de una letra (T, I, R). Un punto celeste marca
  «por revisar» en todas las listas. [Verificado: https://copilot.money/ y su ayuda] **Monarch** bajó el alto de las filas en dic-2024 y usa íconos
  de categoría en escritorio. [Verificado: https://www.monarch.com/monarch-brand-refresh]
- **Stripe.** El color se guarda para el estado: verde, rojo y amarillo. Todo lo demás va en gris.
  [Verificado, fuente de terceros: https://www.925studios.co/blog/stripe-dashboard-design-breakdown]
- **Logo del comercio o avatar a la izquierda** (Ramp, Brex, Mercury). [Inferido: no se pudo ver una imagen]

**Lo que hace Gastos.**
- La fila es solo texto: «qué · proveedor» arriba y «categoría · pago · comprobante» abajo, con una sola marca y el monto.
- La sede se ve como un punto de color solo cuando se miran varias.
- Mide unos 58 px.
- Es la misma anatomía que Expensify en el celular, y mejor en algo: el IGV va bajo el monto.

**La brecha.** Nada se ve antes de leer:
- ni de qué es el gasto (hay que leer «Mantenimiento y reparaciones»);
- ni si tiene la foto de su comprobante (hoy no existe la foto; llega con la otra sesión).

**Propuesta (lámina 06).**
- **A la izquierda, un cuadrito de 32 px en hueso con el ícono lucide de la categoría.** Es la misma idea de la prenda sin foto
  (`MosaicoPrenda` con su `categoriaDe`): un mapa `codigo de categoría → ícono` en `lib/`, con un ícono neutro (el recibo) para la categoría
  que se cree sin deploy.
- **Junto al monto, la miniatura del comprobante** de 20×26 px. Es papel físico (`data-papel`: no se oscurece, regla 3 de ADR-0336).
- **Un hueco punteado en ámbar** solo cuando el gasto ya pide comprobante (desde S/ 300, la regla de la marca). En lo chico, nada.

Esfuerzo **medio**. **Pieza nueva**: pasa por `/unificar` (el ícono de categoría de gasto no existe). [Opinión: no copiar el emoji de
Copilot, que choca con la paleta y con «una función, una pieza»]

### 2. El separador de día y los grupos

**Lo que hacen los mejores.**
- Expensify **no agrupa por día**: agrupa por persona, tarjeta, comercio, categoría o período. Cada grupo se pliega y al pie va una barra fija
  con el total. [Verificado: https://help.expensify.com/articles/new-expensify/reports-and-expenses/Using-search-operators]
- Mercury agrupa por categoría y ordena los grupos por lo que salió. [Verificado: https://mercury.com/blog/updated-transactions-page]
- Revolut, Qonto y Wise en el celular: fecha pegada con el total del día. [Inferido: no está documentado]

**Lo que hace Gastos.** `<SeparadorDia>` pegado bajo la mesa del telar, «Hoy · …» con su punto rojo, el total del día y cuántos gastos, sin
los anulados.

**La brecha.** Ninguna de afuera. **Gastos ya hace esto igual o mejor** (ver más abajo).

**Visto de paso, un defecto real.**
- **La zebra marca una fila al azar.**
- La regla `.fila-cayla:nth-child(even of .fila-cayla)` (`app/globals.css:672`) cuenta solo hermanos `.fila-cayla`.
- Los grupos «×N» van envueltos en un `<div class="extracto-repetidos">`, que no es `.fila-cayla`.
- Resultado: con Agua · Bolsas ×2 · Baño ×6 · Movilidad · Refrigerio, solo «Movilidad» queda con fondo hueso, y se lee como «esta está
  marcada». Lo mismo corre la cascada de entrada (`--k-fila`).
- Lo vi a 1440 y a 375 px en la base local. Lo dejé escrito para la sesión que edita `ExtractoGastos` en la carpeta de notas compartida.
- [Opinión] El arreglo más simple es sin zebra dentro del extracto: el separador ya agrupa, y un extracto de banco no se raya.

### 3. El detalle (panel lateral, hoja, vista previa)

**Lo que hacen los mejores**
- **Stripe** tiene dos formas, y la regla es usar la primera salvo que la tarea pida más:
  - **ContextView:** un cajón al costado, **sin velo**, que se lee lado a lado con la página.
  - **FocusView:** con velo, para tareas largas.

  [Verificado: https://docs.stripe.com/stripe-apps/design]
- **New Expensify:**
  - panel derecho de 440 px, que flota con 12 px de margen y entra en 300 ms;
  - dentro, se pasa al gasto anterior o siguiente con ← →, botones y «2 de 5»;
  - el lápiz para editar aparece al pasar el mouse por una celda.

  [Verificado: el código de https://github.com/Expensify/App y https://help.expensify.com]
- **Brex:** panel a la derecha con su sección «Receipt», donde se suelta el archivo. [Verificado: https://www.brex.com/support/receipts-for-expenses]
- **Spendesk:** secciones separadas por una línea, cada una editable en su lugar, y un resumen con la acción al pie.
  [Verificado: https://grapes.spendesk.design/docs/components/side-panel]
- **Linear Peek:** con el vistazo abierto, J/K o ↑ ↓ pasan al siguiente sin cerrar. [Verificado por buscador: https://linear.app/docs/peek]
- **Notion:** el «side peek» es lo que trae por defecto en tablas y deja la base viva a la izquierda. [Verificado: https://www.notion.com/releases/2022-07-20]
- **Jira (jun-2026), la advertencia.** Al forzar un panel de vista previa, los usuarios se quejaron de cuatro cosas: la fila abierta dejó de
  verse marcada, se perdió el paso con flechas, el panel no recuerda su ancho y no hay vuelta a la vista completa. [Verificado por buscador,
  foro de Atlassian]

**Lo que hace Gastos.**
- El detalle es una hoja **al centro**, con velo: tapa la lista.
- Para ver el siguiente gasto hay que cerrarla, encontrar la fila y tocarla.
- No hay «3 de 12».

**La brecha.** Es la mayor de la pantalla para quien revisa el mes gasto por gasto.

**Propuesta (lámina 01).**
- **`<Cajon>`, la pieza del cajón que ya está decidida** (ADR-0358 ronda 17; ya la usan Por pagar, Movimientos y Proveedores):
  - **sin velo**, como Movimientos y como el ContextView de Stripe;
  - la fila abierta con `aria-current` (el hilo rojo de canto y el fondo hueso);
  - «5 de 12» con ↑ ↓ y `useFlechasDelCajon`.
- Arriba, el ícono de la categoría (si se aprueba la 06), la categoría tocable que filtra la lista, el título, el monto en serif de 34 px y
  el `<Aviso>` de la marca, que hoy ya existe en la hoja.
- Debajo, el comprobante (miniatura que se agranda) y la lista de datos.
- Al pie, «Anular…» a la izquierda.
- En el celular, el `<Cajon>` ya es la hoja desde abajo y pasa de registro deslizando de lado (ADR-0479).

Esfuerzo **medio**. **No choca**: es pasar de `<Modal>` a `<Cajon>`. Lo que la hoja hace hoy (anular con motivo y responsable) se queda: el
modo «Anular» abre su propia hoja o va en el pie. La otra sesión construye «corregir sin anular» dentro de esta misma hoja; conviene que lo
construya ya en el cajón.

### 4. Filtros, búsqueda y barra de comandos

**Lo que hacen los mejores**
- **Vistas fijas con su conteo:**
  - Qonto (2022) las fija en una barra, cada una con su número. [Verificado: https://website-a0e.pages.dev/projects/qonto]
  - Expensify ofrece búsquedas sugeridas según el rol («Por aprobar», «Listo para pagar»): es una bandeja hecha como búsqueda.
    [Verificado: https://help.expensify.com/articles/new-expensify/reports-and-expenses/Suggested-Search]
  - Mercury trae tres vistas de fábrica. [Verificado: https://mercury.com/blog/updated-transactions-page]
- **Un solo control.** Ramp junta búsqueda y filtros en un único «Search or filter…», con «Save as new view».
  [Verificado: https://support.ramp.com/accounting-filters-and-custom-views]
- **Búsqueda en la URL.** Stripe la escribe en la dirección y entiende operadores como `amount:>149.99`; «?» muestra los atajos.
  [Verificado: https://docs.stripe.com/dashboard/search]
- **Filtros con operador.** En Linear, F abre los filtros, el operador de la píldora se cambia tocándolo y los filtros viajan en la URL.
  [Verificado: https://linear.app/docs/filters.md]
- **Barra de comandos.** Superhuman la arma con una sola tecla, sabe dónde estás y enseña el atajo de cada acción.
  [Verificado: https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/]

**Lo que hace Gastos.**
- `Buscador` que filtra mientras se escribe, «Categoría» y «Comprobante» en desplegables, y las píldoras de lo puesto con su ✕.
- Los filtros NO van en la URL: los guarda la pantalla.
- **El «/» no lleva al buscador**, porque Gastos no le pasa `atajo` a su `Buscador` (`GastosPanel.tsx:591`; la pieza ya lo trae).
- El ⌘K es el buscador global del ERP (ADR-0493 decidió no tener uno propio).

**La brecha.**
- **Lo que pide algo no se ve con su número** hasta abrir el desplegable y elegir.
- «Sin comprobante, de S/ 300 o más» es la cuarta opción de un combo.

**Propuesta (lámina 02).**
- **Una fila de vistas con su conteo** sobre el extracto: «Todos 12 · Piden algo 3 · Sin comprobante 2 · Por pagar 1 · Anulados 1».
- Se arma con la píldora de filtro (`pildora-cayla`) y el `<Globito>` de las pestañas: `pide` (ámbar) solo en «Piden algo».
- Lo que cuenta cada vista sale de las reglas que ya marcan la fila (`marcaDelGasto`, `sinComprobanteGrande`); no se inventa ninguna regla.
- Y, en el cajón, **la categoría tocable filtra la lista**: es la «acción de un toque» de Mercury.

Esfuerzo **chico**. **No choca**.

**Arreglo de un renglón (sin lámina).** `atajo` en el `Buscador` de Gastos.

**Lo que no recomiendo ahora** [Opinión]:
- **Filtros en la URL.** Lo piden Vercel y Linear, pero la pantalla ya lleva `?sede=` y `?mes=` del telar. Tiene sentido el día que se
  quieran compartir vistas, no antes.
- **Operadores tipo `monto:>300`.** Una colaboradora no los escribe.

### 5. Cifras y KPI

**Lo que hacen los mejores**
- **Dígitos que ruedan.** NumberFlow hace girar cada dígito del valor viejo al nuevo, hacia arriba si sube y hacia abajo si baja. Respeta
  «menos movimiento» y sincroniza cifras vecinas; sus ejemplos usan 750 ms de giro. [Verificado: https://number-flow.barvian.me/]
- **El período anterior bajo la cifra.** Stripe pone la cifra grande con el período anterior debajo, en letra chica.
  [Verificado, fuente de terceros: 925studios]
- **La comparación en palabras.** Apple Card dice bajo el total, en una frase, cuánto más o menos se gastó que el período anterior.
  [Verificado: https://support.apple.com/en-us/102329]
- **Lo que queda, no lo gastado.** Copilot habla de «$183 left». [Verificado: https://copilot.money/]
- **Totales que siguen al filtro.** En Copilot (web ago-2026, iOS sep-2026), al filtrar se ven «Total gastado / Neto», y al marcar varias
  filas, una tarjeta suma lo marcado. [Verificado: https://www.copilot.money/dispatch]
- **Números tabulares.** Moneda con 0 o 2 decimales, nunca las dos en el mismo lugar. [Verificado: https://vercel.com/design/guidelines]

**Lo que hace Gastos.**
- La cifra cuenta desde 0 al llegar, con chips en palabras («▲ 6 % vs septiembre a esta altura»), y las tres `TarjetaCifra`.
- **Pero `CifraAnimada` se arma de nuevo con cada valor** (`key={valor}`), así que al cambiar de sede o de mes **vuelve a contar desde cero**:
  23,480 → 0 → 6,120.

**La brecha.**
- El conteo desde cero no dice cuánto cambió.
- El total de lo filtrado solo existe en el pie («3 de 12 gastos») y no dice cuánta plata es.

**Propuesta (lámina 08).**
- **La cifra rueda del valor viejo al nuevo**, dígito por dígito, en 700 ms con `--ease-cayla`, sin el resorte de fábrica de NumberFlow.
  Los dígitos que sobran o faltan se cierran o se abren.
- **Y el pie de la lista dice el monto de lo filtrado** («3 de 12 gastos · S/ 1,230»).

Esfuerzo **chico**.

**Choca:**
- `CifraAnimada` es la pieza de todo el ERP. Cambiar su movimiento pasa por `/unificar` y por Felipe.
- Si se usa la librería, entra una dependencia nueva (y Knip).

[Opinión] La cifra que rueda es pulido, no comprensión: va al final del top 10.

### 6. Gráficos: categorías, ritmo y presupuesto

**Lo que hacen los mejores**
- **YNAB tiñe solo el tramo de la barra que se pasó**: así se ve cuánto. [Verificado: https://support.ynab.com/en_us/progress-bars-a-guide-SkDEhot09.md]
  Una crítica a otra app (nov-2024) dice lo mismo al revés: una barra que solo «se pone roja» no dice cuánto. [Verificado por buscador]
- **Copilot (Categorías):**
  - las barras cambian de color según el ritmo;
  - lo que se espera pagar en recurrentes va **con solo el contorno**;
  - sin presupuesto, compara contra el mes anterior: el caso de CAYLA.
  - [Verificado: https://help.copilot.money/en/articles/9504513-categories-tab-overview]
- **Copilot (Cash Flow):** «en lo que va del mes» compara contra el mismo tramo de días, igual que Gastos «a esta altura».
  [Verificado: https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview]
- **El gráfico sigue a la tabla.**
  - En Mercury, el gráfico del mes se recalcula con cada filtro que tenga puesta la tabla. [Verificado: https://mercury.com/blog/updated-transactions-page]
  - En Monarch, el clic en el gráfico filtra la lista. [Verificado: https://www.monarch.com/monarch-brand-refresh]
- **Coinbase (su componente Scrubber):** al leer una línea con el mouse, una guía punteada, un punto en cada serie y **lo que queda a la
  derecha del cursor, atenuado**. [Verificado: https://cds.coinbase.com/llms/web/components/Scrubber.txt]
- **Escalas que aguantan un atípico.** Monarch usa una escala que se ajusta para que un gasto atípico no aplaste el resto (feb-2025), y Revolut
  marcaba los picos con su categoría (2019). [Verificado]

**Lo que hace Gastos.**
- Ya está entre los mejores en lo esencial: ranking, rayita del mes anterior a la misma altura, «si sigue así» con los fijos por venir como
  puntos huecos, saltos con nombre.
- Del gráfico a la lista: «Ver en la tabla» con su filtro.

**La brecha.**
- **Hilos 1.** La rayita y el «▲ 112 %» no dicen **cuánta plata** es lo que se pasó.
- **Hilos 2.** Un alquiler que todavía no se registra hace que su categoría salga «▼ 29 %» en verde: un mes que parece barato y no lo es.
- **Ritmo.** El globito de `<Linea>` no atenúa lo que queda a la derecha (detalle menor).
- **Sin vuelta.** La lista no devuelve el favor: filtrar la lista no recalcula los gráficos.

**Propuesta (lámina 07).**
- **El tramo que pasa la rayita, rayado en ámbar.** Es `<BarraApilada>` con un tramo encima: su regla ya dice que el ámbar lo pone la
  pantalla. La píldora suma la plata: «▲ 112 % · S/ 850 más».
- **El fijo del mes por confirmar, en contorno punteado** al final de su hilo, con su frase: «+ S/ 2,100 del alquiler de Lima, por
  confirmar». Es el mismo dato que «Cuándo» ya dibuja como punto hueco.
- **Sin el verde engañoso.** La píldora dice «falta un fijo» en pizarra en vez del verde.

Esfuerzo **chico**. **Choca** con una regla de dinero: qué cuenta como «pasarse» (contra el mes anterior a la misma altura, como hoy, o contra
un presupuesto que todavía no existe) es de Felipe.

**Lo que no recomiendo** [Opinión]:
- Cambiar el color de la línea según el ritmo, como hace Copilot. Choca con la regla de `<Linea>`: lo que está bien o mal lo dicen el titular
  y el globito, no el color.
- Que los gráficos sigan a los filtros de la lista. Es grande y confunde «el mes» con «lo que buscaste»; mejor el total en el pie (familia 5).

### 7. Estados vacíos y de carga

**Lo que hacen los mejores**
- **NN/g:**
  - bajo 1 s, nada (ni esqueleto ni rueda);
  - de 1 a 10 s, esqueleto si carga la página entera.

  [Verificado: https://www.nngroup.com/articles/skeleton-screens/]
- **Vercel:**
  - el indicador espera 150-300 ms antes de aparecer y, si sale, dura al menos 300-500 ms;
  - el guardado va **optimista** y vuelve atrás si falla.

  [Verificado: https://vercel.com/design/guidelines]
- **Geist:** el esqueleto tiene la forma exacta de lo que viene, porque si no, se lee como una falla. [Verificado: https://vercel.com/geist/skeleton]
- **Qonto:** un esqueleto en cada celda (ene-2026). [Verificado: https://docs.qonto.com/api-reference/sdk-libraries/doc-pages/ui-elements/transaction-list]
- **Expensify:**
  - en línea, lo guardado se ve hecho al instante;
  - sin conexión, lo pendiente queda al 50 % y lo borrado, tachado;
  - los formularios que mueven dinero se bloquean.

  [Verificado: https://raw.githubusercontent.com/Expensify/App/main/contributingGuides/philosophies/OFFLINE.md]
- **El vacío (Geist):** ícono, título, una frase y UNA acción; al no encontrar, cita lo buscado. [Verificado: https://vercel.com/geist/empty-state]

**Lo que hace Gastos.**
- El loader único (ADR-0149): ya espera 200 ms antes de verse y el aviso sale después.
- `<Vacio>` con lo buscado y «Borrar la búsqueda».
- `<RefrescoTrasCorte />` tras un corte de red.

En el vacío y en la espera **Gastos ya hace lo que recomiendan Vercel y Geist**.

**La brecha.** El guardado no es optimista. Cada cosa de la bandeja y cada gasto pasan por el loader a pantalla completa y por un rehacer.

**Propuesta.** Sin lámina propia: es la decisión de fondo de las láminas 03 y 05.
- **Que el guardado sea optimista** solo donde la persona repite mucho (la bandeja, clasificar una salida de caja): la tarjeta se va al
  instante, la base confirma por detrás y, si falla, vuelve con su aviso (`useOptimistic` de React, [Verificado: https://react.dev/reference/react/useOptimistic]).

Esfuerzo **medio**. **Choca de frente con ADR-0149** («todo botón que guarda» lleva el loader): **decide Felipe**.
[Opinión] Lo recomiendo solo para la bandeja: es la tarea que se repite y la única donde el loader corta el ritmo.

### 8. Avisos, alertas y deshacer

**Lo que hacen los mejores**
- **Geist:**
  - «Deshacer» dura 5-10 s, con esa palabra, y solo si volver atrás es seguro;
  - el texto va como «{cosa} {participio}», sin «exitosamente»;
  - un error son dos frases y termina con qué hacer;
  - una falla que exige acción no vive solo en un aviso.

  [Verificado: https://vercel.com/geist/toast]
- **Sonner:** pausa al pasar el mouse y con la pestaña oculta; los avisos se apilan. [Verificado: https://emilkowal.ski/ui/building-a-toast-component]
- **Spendesk:** aviso con UNA sola acción. [Verificado: https://grapes.spendesk.design/docs/components/toast]
- **«Deshacer» en las apps de gastos:** no lo encontré documentado en ninguna de las 11. [Inferido]

**Lo que hace Gastos.**
- `avisar.*` arriba a la derecha, después del loader; con botón dura 7 s como mínimo (dentro del rango de Geist).
- El aviso de la marca va en la hoja del gasto, como `<Aviso>` persistente, y no solo como globo: es lo que pide Geist.

**La brecha.**
- «Gasto registrado» no dice **dónde quedó** el gasto.
- Anular siempre pregunta; no hay «Deshacer».

**Propuesta (lámina 05).**
- Al guardar, la lista baja hasta el día del gasto, la fila **respira en verde una vez** (`data-recien`, ya decidido en `<Tabla>`, 1,4 s) y el
  total del día cuenta.
- El aviso dice el día («Gasto registrado · lunes 26 de octubre») y trae «Ver».

  Expensify hace lo mismo con su fila nueva: crece en 300 ms, se enciende en 300 ms, se queda 800 ms y se apaga en 2 s, una vez.
  [Verificado: https://github.com/Expensify/App/blob/main/src/hooks/useAnimatedHighlightStyle/index.ts]

Esfuerzo **chico**. **No choca**, salvo el **«Deshacer»**: deshacer un gasto es anularlo (sin motivo escrito por la persona). Es dinero, así
que **decide Felipe**. [Opinión] Sin «Deshacer»: con «corregir sin anular» (lo que construye la otra sesión) se arregla el error común,
que es el dato mal puesto.

### 9. El comprobante adjunto

**Lo que hacen los mejores**
- **Payhawk:**
  - una zona que acepta arrastrar, subir o **pegar desde el portapapeles**;
  - el visor con zoom, girar, tamaño grande o chico y «1 de 2»;
  - lo que leyó la máquina, **con un contorno sobre el dato**, y en cada campo las cajitas con lo detectado.

  [Verificado: https://payhawk.com/help/managing-receipts-and-invoices-in-the-portal]
- **Ramp:** lo que llena la IA se anuncia con una animación breve y lleva una marca; **nunca pisa lo ya escrito**.
  [Verificado: https://support.ramp.com/hc/en-us/articles/360042588454]
- **Brex:** se suelta en la sección «Receipt» del panel; la carga masiva dice «emparejado / sin pareja / falló» con «Reintentar».
  [Verificado: https://www.brex.com/support/receipts-for-expenses]
- **Mercury:** «Match receipts» empareja por comercio, monto y hora (feb-2025).
  [Verificado: https://mercury.com/blog/inside-mercury/february-2025-product-updates]
- **Expensify:** al pasar el mouse por la miniatura de la fila se abre una vista previa grande (380 px). [Verificado: el código, `ReceiptCell`]
- **Soltar el recibo sobre la fila:** en Ramp es un **pedido de usuarios**: hoy abre otra ventana.
  [Verificado como pedido: https://community.ramp.com/t/receipt-drag-drop-option/513] Ninguna de las 11 lo tiene documentado.

**Lo que hace Gastos.** Nada todavía: lo construye la otra sesión (foto y QR).

**La brecha.** Todo. Lo útil aquí es decir **qué cara** debería tener lo que se construye.

**Propuesta (lámina 04, para la otra sesión).**
1. **Soltar sobre la fila.**
   - Las filas se vuelven blanco con un borde punteado y la que está bajo el puntero, con borde de tinta.
   - Un cartel dice «Soltar en "Pintura de la vitrina"».
   - Es algo que ni Ramp tiene; [Opinión] para la tienda vale más **soltar en el cajón**, como Brex, y también **pegar** (Payhawk).
2. **Mientras se lee, el hilo que barre.** Es la señal que ADR-0136 ya admite mientras la base responde; después la fila destella en verde una
   vez y la marca «Sin comprobante» se va.
3. **El QR de la factura electrónica peruana trae RUC, serie, número, IGV y total.** Lo leído se marca como leído y **nunca pisa lo que la
   persona escribió** (Ramp).
4. **El visor** se abre desde la miniatura, agrandándose desde ella. Lleva zoom y girar.
5. **En el celular, la cámara en la Isla** («Foto del comprobante», `<BarraDeAbajo>`). Brex abre la cámara de inmediato; Ramp busca en el
   carrete de fotos y propone a qué gasto va [Verificado: https://support.ramp.com/auto-match-receipts-from-your-camera-roll].

Esfuerzo **grande** (es la funcionalidad entera). **Decide Felipe**: es una integración que da respaldo a un dato tributario (el IGV
recuperable). La lámina solo propone la cara.

### 10. El móvil

**Lo que hacen los mejores**
- **Deslizar la fila.** Qonto (2022) desliza una transacción a la izquierda para marcarla verificada; Monarch revisa con una pila de tarjetas
  (derecha = revisada, izquierda = saltar). [Verificado: https://www.monarch.com/review-on-the-go-and-smart-split]
- **La cámara al instante.** En Brex, «Add receipt» abre la cámara de inmediato. [Verificado]
- **La hoja que se arrastra (Vaul):**
  - 500 ms con `cubic-bezier(0.32,0.72,0,1)`, la curva de las hojas de iOS;
  - se cierra por velocidad, no solo por distancia;
  - no deja arrastrar hasta que el contenido está arriba.

  [Verificado: https://emilkowal.ski/ui/building-a-drawer-component]

**Lo que hace Gastos.**
- A 375 px el ERP ya tiene la «hoja viva» (ADR-0479): llega desde el borde, se baja con el dedo, se cierra con «atrás».
- La Isla abajo.
- `--ease-cayla` es `cubic-bezier(.32,.72,.24,1)`, casi la misma curva de Vaul y de iOS.

En las hojas **Gastos ya está al nivel**.

**La brecha.**
- No hay gesto en la fila.
- La foto del comprobante no tiene un botón propio.

**Propuesta.**
- **La cámara en la Isla**: va dentro de la lámina 04.
- **Deslizar la fila** para «Foto» y «Ver»: se dibujó y se sacó de la lámina, porque el ERP se usa sobre todo en escritorio y es una pieza
  nueva (un gesto de fila no existe en el ERP: `/unificar`).

Esfuerzo **medio**. [Opinión] Esperar a ver si la cámara en la Isla alcanza.

### 11. El teclado

**Lo que hacen los mejores**
- **Linear:** ↑ ↓ o J/K, X marca, ⌘K actúa sobre lo enfocado, «?» abre la ayuda de atajos.
  [Verificado: https://linear.app/docs/select-issues.md]
- **Plain:** J/K, F filtra, / busca, E termina. [Verificado: https://www.plain.com/docs/product/platform/keyboard-shortcuts]
- **Copilot web:** flechas, R para revisada, C para la categoría. [Verificado por buscador]
- **Stripe:** «?» con los atajos. [Verificado]
- **Raycast:** una barra muestra las acciones con su tecla, «para que se aprendan». [Verificado: https://raycast.com/blog/a-fresh-look-and-feel]
- **Geist `Kbd`:** ⌘ o Ctrl según la máquina. [Verificado: https://vercel.com/geist/keyboard-input]

**Lo que hace Gastos.**
- Tab llega a cada fila con su anillo y Enter abre.
- El dock con g, f, e, a y sus letras a la vista.
- Sin ↑ ↓ entre filas, sin «/» (familia 4) y sin «?».

**La brecha.** Media. Quien revisa el mes en el Mac mini hace 50 Tab.

**Propuesta (dentro de la lámina 01).**
- ↑ ↓ y J/K mueven el foco entre filas, y con el cajón abierto pasan de gasto.
- Esc cierra y devuelve el foco a la fila.
- La fila enfocada muestra su «↵».
- «?» abriría una hoja con las teclas de Gastos.

Esfuerzo **chico** (con el cajón). **No choca.**

### 12. El movimiento

**Lo que dicen los que más saben de oficio**
- **Emil Kowalski:**
  - lo que se dispara con el teclado no se anima, y lo que se ve cien veces al día, tampoco;
  - las hojas duran de 200 a 300 ms;
  - la salida va un 20 % más rápida que la entrada;
  - al presionar, `scale(0.97)`, y nunca se arranca desde `scale(0)`.

  [Verificado: https://emilkowal.ski/ui/you-dont-need-animations, https://emilkowal.ski/ui/7-practical-animation-tips, https://emilkowal.ski/ui/agents-with-taste]
- **Rauno:** toda animación se puede interrumpir; las de interacción no pasan de 200 ms; un hover nunca cambia el grosor de la letra.
  [Verificado: https://interfaces.rauno.me/]
- **IBM Carbon** («productivo», para apps de trabajo): 70 / 110 / 150 / 240 / 400 / 700 ms. [Verificado: https://carbondesignsystem.com/elements/motion/overview/]
- **Vercel:** nunca `transition: all`, solo `transform` y `opacity`; se anima solo para explicar causa y efecto. [Verificado]
- **Stripe** (2014): si el flujo funciona igual sin la animación, sobra. [Verificado, viejo: https://medium.com/p/3d1b0a9b810e]

**Lo que hace Gastos.**
- ADR-0136 ya dice casi todo: una vez, sin rebote ni bucle, con `--ease-cayla`, y quieto con «menos movimiento».
- El cajón entra en 380 ms y sale en 240 (un 37 % más rápido: más de lo que pide Emil).
- `.mov-boton` se encoge al presionar.

**La brecha y la propuesta.**
1. **Pasar de gasto con el teclado no se anima.** Con el mouse, el «se asienta» de 320 ms de `<Cajon>`; con ↑ ↓, aparece en su lugar. La
   lámina 01 ya lo hace así. Cambia `<Cajon>`: decide Felipe, aunque es chico.
2. **Una curva fuera de lugar.** `HilosGastos.tsx:30` usa `EASE = "cubic-bezier(0.22, 1, 0.36, 1)"` para su FLIP, no `--ease-cayla`.
   [Opinión] Es un detalle, pero es la única curva propia de la pantalla.
3. **La cifra que rueda:** familia 5.
4. **La fila nueva que respira:** familia 8.

---

## Top 10, por impacto para una colaboradora de tienda

Escritorio primero; los 375 px se adaptan. El orden es mío [Opinión] y pesa tres cosas: cuánto ahorra al que revisa el mes, si evita un
error con plata, y cuánto cuesta.

| # | Propuesta | Lámina | Esfuerzo | Choca |
|---|---|---|---|---|
| 1 | **El detalle al costado (`<Cajon>` sin velo), con ↑ ↓ y la fila marcada** | 01 | Medio | No (pieza decidida) |
| 2 | **Vistas con su número sobre la lista** («Piden algo 3», «Sin comprobante 2»…) | 02 | Chico | No |
| 3 | **La cara del comprobante:** soltar (en la fila o en el cajón), el hilo que lee el QR, la miniatura, el visor y la cámara en la Isla | 04 + 06 | Grande | Sí: lo construye la otra sesión; SUNAT/IGV es de Felipe |
| 4 | **La bandeja como una pila que baja**, con su número y su barra, sin reordenarse bajo el dedo | 03 | Medio | Sí: optimista contra el loader (ADR-0149) |
| 5 | **Lo que te pasaste, en plata, y el fijo que falta, en contorno** («▲ 112 % · S/ 850 más»; sin el verde engañoso) | 07 | Chico | Sí: qué es «pasarse» |
| 6 | **Al guardar, el gasto aterriza en su día** (la vista baja, la fila respira en verde, el aviso dice el día) | 05 | Chico | No («Deshacer», sí) |
| 7 | **El ícono de la categoría en la fila** | 06 | Medio | Pieza nueva (`/unificar`) |
| 8 | **El teclado:** ↑ ↓ / J K entre filas, «/» al buscador (un renglón), «?» con las teclas | 01 | Chico | No |
| 9 | **El total de lo filtrado en el pie** («3 de 12 gastos · S/ 1,230») | — | Chico | No |
| 10 | **La cifra que rueda** del valor viejo al nuevo | 08 | Chico | Sí: pieza de todo el ERP |

Fuera del top, sin lámina: deslizar la fila en el celular (familia 10), el guardado optimista fuera de la bandeja (7) y los gráficos que siguen
a los filtros (6).

## Lo que Gastos ya hace igual o mejor

- **El extracto por día con el total del día pegado.** Ninguna de las 11 apps de gastos de empresa agrupa por día (Expensify agrupa por
  persona o período). Es lo de un banco, que es lo que la colaboradora conoce.
- **Una sola marca por fila, con su porqué en la hoja**, y el umbral de S/ 300 para no gritar por el mototaxi: es la regla de Stripe (el color
  solo para el estado), afinada. Lo que Expensify sí hace mejor es la línea del porqué bajo la fila (ver «Para conversar»).
- **La comparación «a esta altura».** Es la misma que hace Copilot (Cash Flow), y la línea acumulada es lo que más extrañan de Mint los usuarios
  de Lunch Money (pedido desde 2021, 49 votos) [Verificado: https://feedback.lunchmoney.app/budget/p/monthly-spending-trend-vs-previous-month].
- **El «si sigue así» que cuenta los fijos que vienen.** Copilot los saca del ritmo; Gastos los pone y lo dice.
- **El IGV bajo el monto y el «IGV perdido».** Ninguna app de afuera tiene esta capa, porque es de Perú.
- **Lo chico repetido en «×N».** Ninguna lo hace en la lista; Copilot lo hace solo con los recurrentes.
- **La espera y los avisos.** Un loader que espera 200 ms y el aviso después, ya medido (ADR-0149); el vacío con lo buscado (Geist lo pide igual).
- **La hoja del celular.** `--ease-cayla` es casi la curva de Vaul y de iOS, y la hoja ya se baja con el dedo y se cierra con «atrás».
- **El color de sede con su nombre siempre escrito** (ADR-0493). Apple Card usa colores fijos sin nombre y su barra «da una impresión, no un
  porcentaje» [Verificado por buscador].

## Lo que pide decisión de Felipe

1. **¿El detalle pasa a `<Cajon>`, sin velo?** No choca, pero cambia la pantalla y la otra sesión está construyendo «corregir sin anular»
   dentro de la hoja de hoy: conviene decidirlo antes de que termine.
2. **¿La bandeja (y solo la bandeja) guarda optimista**, sin el loader a pantalla completa? Choca con ADR-0149.
3. **¿Qué cuenta como «pasarse»** en «En qué se va»: el mes anterior a la misma altura, como hoy, o un presupuesto? Y si el fijo por confirmar
   se dibuja en el hilo.
4. **¿«Deshacer» un gasto recién registrado?** Sería anularlo sin motivo escrito. Mi recomendación es que no.
5. **¿La cifra que rueda** reemplaza al conteo desde cero en todo el ERP? Pasa por `/unificar`.
6. **¿El ícono de categoría de gasto** entra como pieza? Pasa por `/unificar`.
7. **La cara del comprobante** (lámina 04): ¿se la pasamos a la sesión que lo construye como referencia?

## Para conversar (no está en la lámina)

- **La línea del porqué bajo la fila**, como Expensify: «Sin comprobante · con factura recuperarías S/ 129.66». Hoy el porqué está en el
  `title` y en la hoja; a la vista sumaría una línea por cada fila marcada. Es la ley 6 de /formidable («lo difícil a un toque»), que el
  30 de octubre se resolvió con el `<Aviso>` en la hoja. [Opinión] Probarlo solo si la ciega vuelve a fallar ahí.
- **Pegar desde el portapapeles** (Payhawk): en el Mac mini, la factura llega por WhatsApp Web o por correo. ⌘V en el cajón la adjunta.

## Visto de paso (no se tocó)

- **La zebra que marca una fila al azar** en el extracto (familia 2). Nota para la sesión de Gastos en la carpeta compartida.
- **El «/» no funciona en el buscador de Gastos**: falta `atajo` (familia 4).
- **La curva propia de `HilosGastos`** (familia 12).

## Fuentes que no se pudieron leer

- **Pidieron cuenta o bloquearon:** Mobbin (pide cuenta: no se entró; si Felipe tiene una, sirve para ver las pantallas de verdad) y Refero
  (solo el título).
- **Dieron 403:** support.mercury.com, help.revolut.com, la ayuda de Superhuman y algunas páginas de Lunch Money.
- **Daban 404 o venían vacías:** wise.design (Motion figura en su menú y da 404) y builders.ramp.com.
- **De pago:** el curso «Devouring Details» de Rauno y los UX Bites de Built for Mars.
- **Sin nada útil:** Wise Business y Revolut Business no tienen nada visual público que se pueda abrir.
- **Cerró:** Height, el 24-sep-2025.

## Cómo se hizo

Primero se leyó el código y las maquetas de Gastos, y se capturó la pantalla en la base local, como líder, a 1440 px (claro y oscuro) y a
375 px. Esas capturas y las de la lámina quedaron en el scratchpad de la sesión, fuera de git.

Después, tres investigaciones en paralelo, solo con fuentes públicas y sin iniciar sesión: apps de gastos de empresa, finanzas personales y
oficio de interfaz.

Por último, la lámina, revisada con Playwright en claro, en oscuro y a 375 px, con cada interacción. A 375 px no hubo errores de consola ni
scroll horizontal.
