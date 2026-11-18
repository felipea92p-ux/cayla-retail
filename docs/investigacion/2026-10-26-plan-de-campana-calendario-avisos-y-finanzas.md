> **Nota de procedencia (2026-10-26):** informe de un agente de investigación (solo lectura, búsquedas genéricas de industria; ningún dato de CAYLA salió a la web). Las etiquetas VERIFICADO / REPORTADO / SECUNDARIO / OPINIÓN son las del agente. Lo que se decide con esto vive en `docs/pantallas/compras-plan.md` y en los spikes `docs/maquetas/plan-campana-vision-2026-10/`.

# Investigación B — Calendario de campañas, centro de avisos y compra de mercadería en Finanzas

Fecha de la investigación: 2026-10-26. Solo lectura (no se tocó el repo). Búsquedas genéricas de industria; no se envió ningún dato de CAYLA a la web.

Etiquetas de evidencia:
- **VERIFICADO**: leí la fuente (página o PDF) y la afirmación está ahí.
- **REPORTADO**: aparece en el resultado de una búsqueda (resumen o titular) pero no abrí la fuente completa, o la fuente la cita de segunda mano.
- **SECUNDARIO**: blog de proveedor, enciclopedia sin autor, foro de usuarios. Orienta, no prueba.
- **OPINIÓN / CÁLCULO**: mía. Marcada para que se pueda objetar.

---

## TEMA 1 — Calendario anual de campañas

### 1.1 Cómo deciden los retailers qué eventos merecen compra

**Lo que SÍ hay (y su calidad):**

1. **Un «tentpole» es una fecha recurrente alrededor de la cual se organizan promociones, inventario y lanzamientos; obliga a coordinar merchandising, cadena de suministro y medios.** SECUNDARIO. Racklify (enciclopedia de logística 3PL, sin autor, publicada 1-oct-2026): https://racklify.com/encyclopedia/what-is-a-tentpole-event-definition-examples-and-why-brands-plan-around-them/ . Amazon Ads usa el término para Prime Day/Black Friday y reporta casos de marca con «35 % de lift» (dato de un anunciante, no estudio): https://advertising.amazon.com/blog/retail-tentpole-events-to-drive-year-round-results (VERIFICADO que lo dice; SECUNDARIO como evidencia).
2. **Criterios para priorizar tentpole vs. promoción de temporada** (VERIFICADO que el artículo los lista; SECUNDARIO como calidad; https://racklify.com/encyclopedia/tentpole-events-vs-seasonal-promotions-how-they-differ-and-which-to-prioritize/): objetivo (captar rápido vs. fidelizar), capacidad operativa para un pico corto, categoría, **elasticidad del inventario (si puedes reponer rápido, el tentpole es menos riesgoso)**, valor de vida del cliente, flexibilidad logística. El propio artículo dice que NO cubre la evaluación posterior ni cuándo repetir.
3. **Shopify no publica un método para elegir qué fechas promocionar.** Lo más cercano: «revisa los datos del año pasado y arma tu calendario» (https://www.shopify.in/enterprise/holiday-ecommerce-strategy , REPORTADO desde la búsqueda). No hay criterios explícitos.
4. **Calendario 4-5-4 de la NRF.** VERIFICADO (https://nrf.com/resources/4-5-4-calendar): guía voluntaria de reporte que divide el año en meses de 4-5-4 semanas para que (a) las ventas sean comparables año contra año, (b) los feriados queden alineados, (c) cada mes comparable tenga los mismos sábados y domingos. No encontré las fechas fiscales 2026 (solo un PDF enlazado). Utilidad para CAYLA: comparar la campaña de este año contra la del año pasado «en el mismo punto del calendario» (Día de la Madre y del Padre son domingos móviles, el Black Friday es el viernes tras el cuarto jueves), no contra «el mismo número de día». OPINIÓN sobre la aplicación.

**Lo que NO hay:** no encontré ningún marco publicado y serio de «ancla vs. opcional». La clasificación que propongo abajo es OPINIÓN, construida sobre los pesos que da la Cámara de Comercio de Lima.

### 1.2 Repetir, pausar, archivar y la revisión posterior (post-mortem)

Todo lo siguiente es SECUNDARIO (blogs de proveedores de software de promociones y consultoras). Coincide entre sí pero no es ciencia revisada por pares.

- **Primero una línea base; el «lift» es venta real menos esa línea base** (tendencia, estacionalidad, feriados). Umbrex: https://umbrex.com/?p=244799 (REPORTADO). Simon-Kucher usa la misma lógica y evalúa por ingreso incremental, utilidad bruta, ROI y efecto en la canasta: https://www.simon-kucher.com/de/node/9836 (REPORTADO).
- **Margen incremental, no ingreso:** (venta promocional − venta línea base) × margen de contribución por unidad; luego se descuenta canibalización, adelanto de compras y el bache posterior. Racklify/Tredence/Promomash (REPORTADO desde búsqueda).
- **Mirar después del evento:** una guía recomienda seguir las ventas 6–8 semanas tras cada promoción; otra dice que cuanto más profundo el descuento, más largo el bache. Son heurísticas, no estándares (REPORTADO).
- **Regla de pausa de un proveedor:** si un tipo de promoción muestra «tasa de demanda prestada» mayor a 50 % dos corridas seguidas, tratarlo como fuga de margen y mover el dinero (REPORTADO; heurística de un blog). Otro método califica cada evento de 0 a 5 y lo manda a REPETIR/EXPANDIR (≥4.0), AJUSTAR (3.1–4.0) o PARAR (≤3.0) (REPORTADO; método de un proveedor).
- **Dependencia del descuento:** seguir el % de ingreso vendido a precio completo en el tiempo (REPORTADO).
- **Específico de moda:** el ciclo normal es ventana de precio completo de ~4–6 semanas tras el lanzamiento y promoción/liquidación desde ~semana 6; se sugiere evaluar el desempeño del inventario a las 4 semanas. SPS Commerce (red de proveedores/retail de EE. UU.): https://www.spscommerce.com/community/articles/why-fashion-runs-on-a-calendar-and-what-it-costs-suppliers-who-fall-behind-it (VERIFICADO que lo dice; SECUNDARIO como fuente).
- **Archivar vs. eliminar:** no encontré guía publicada. OPINIÓN: archivar siempre. El historial de una campaña pausada es la línea base para decidir si se reactiva (Umbrex: la línea base sale de promedios históricos o tiendas control), y borrarlo destruye la única evidencia con la que se puede discutir «¿volvemos a hacerla?». Pausar = sale del calendario activo y de las alertas, conserva sus resultados; la reactivación pide una nota de por qué.

**Métricas mínimas de post-mortem que propongo (OPINIÓN, derivadas de lo anterior):**
1. Venta de la campaña vs. línea base comparable (mismo período del año anterior alineado al calendario, con quiebres de stock marcados: un quiebre recorta la demanda medida).
2. Margen después de descuento (no solo venta).
3. Sell-through al cierre (unidades vendidas / unidades compradas para esa campaña) y a las 4 semanas.
4. Lo que hubo que rebajar después (stock sobrante y a qué precio salió).
5. Bache posterior (4–8 semanas).
Decisión: repetir igual / repetir ajustando cantidad o descuento / pausar / retirar del calendario.

### 1.3 Plazos de anticipación de compra

- **Wholesale de moda tradicional (EE. UU., SPS Commerce, VERIFICADO que lo dice, SECUNDARIO):** ferias 12–14 meses antes de llegar a tienda; revisión de línea ~9 meses; pre-pedidos y cierre de órdenes 6–9 meses; producción 4–8 meses; ventana de embarque 0–3 meses.
- **Cercanía vs. ultramar (Sourcify, blog de sourcing; REPORTADO):** cercanía 30–60 días de producción + 2–10 de tránsito; ultramar 30–90 días de producción + 20–45+ de flete marítimo. Otro blog (Alibaba seller, SECUNDARIO): 8–14 semanas de producción estándar en ultramar. Cifras inconsistentes entre fuentes; usar como orden de magnitud.
- **Velocidad Zara:** un caso del MIT cita 6 semanas de diseño a tienda frente a un promedio de industria de 6 meses (https://dspace.mit.edu/handle/1721.1/39596 , REPORTADO desde búsqueda).
- **Perú:** no encontré un benchmark de plazos de manufactura local ni de importación para Perú. Un reporte de Forbes Perú (2023, REPORTADO) cita a un ejecutivo de DHL: las tiendas por departamento cumplen una programación de importaciones «para todo el año» que no es variable, lo que limita su reacción. Para la manufactura propia de CAYLA el dato verdadero está en sus propias órdenes de producción (tiempo entre «corte» y «en piso»): OPINIÓN, medirlo y no importarlo de un blog.

### 1.4 El calendario peruano: qué pesa y cuándo cae en 2026

**Pesos (lo más sólido que encontré):**

| Dato | Fuente | Etiqueta |
|---|---|---|
| Navidad ≈ 40 % de las ventas anuales del retail; Día de la Madre 15–20 %; San Valentín 6–7 % «del calendario comercial anual». Passalacqua (presidenta del Gremio Retail y Distribución de la CCL) a Andina. Además: San Valentín se vende casi a precio completo, «el margen es bueno», y es el primer pico de caja tras las liquidaciones de verano; no vuelve a repetirse hasta el Día de la Madre. | https://infomercado.pe/san-valentin-2026-moveria-hasta-7-de-las-ventas-anuales-del-retail-en-peru/ (12-feb-2026) | VERIFICADO. Reserva: la nota no aclara si los % son de ventas anuales o «del calendario»; cifras de una gremial, no auditadas |
| Navidad 2025: ~S/ 16 000 M; la campaña equivale al 30–40 % de las ventas anuales de los comercios (Produce); vestidos y calzado entre los artículos de alta solicitud; ticket S/ 300–400 | https://www.peru-retail.com/ventas-por-campana-navidena-2025-alcanzaran-los-s-16000-millones-cual-sera-el-gasto-promedio/ (13-dic-2025) | VERIFICADO |
| Día de la Madre 2026: ventas del retail de S/ 4 500 M en mayo (CCL); ticket S/ 280–380 (S/ 250–350 el año previo); ropa, calzado y accesorios siguen liderando; flores y chocolates pasaron a complemento | https://www.infobae.com/peru/2026/04/30/mama-alista-espacio-este-ano-el-regalo-viene-mas-caro-segun-la-ccl/ | VERIFICADO (proyección, no cierre) |
| Día de la Madre: «segunda campaña más importante después de Navidad»; en 2024 moda = 27 % de la demanda de la campaña | https://lacamara.pe/el-dia-de-la-madre-2024-es-un-desafio-para-la-industria-del-retail/ (entrevista de marzo 2024) | VERIFICADO (es de 2024). Otra nota de un medio de retail sin fecha clara la ubica 3.ª, tras Navidad y Fiestas Patrias: REPORTADO, **ranking en disputa** |
| Día del Padre 2026: pymes +6–9 %, gasto S/ 140–230; dinamismo por Mundial, tecnología, gastronomía, experiencias; **la nota no menciona ropa ni calzado**. Retail: ~S/ 4 200 M, +3–5 %, ticket S/ 150–220 (menor al de 2025) | https://www.peru-retail.com/dia-del-padre-2026-ventas-crecerian-hasta-9-en-peru-impulsadas-por-el-mundial-de-futbol/ (1-jun-2026) | VERIFICADO (pymes); REPORTADO (retail S/ 4 200 M) |
| Fiestas Patrias 2026: ventas +3–5 %, ticket S/ 350–600; **moda y tecnología con mayor demanda esperada**; impulsa la gratificación | https://infomercado.pe/retail-proyecta-que-ticket-promedio-de-compra-llegaria-a-s-600-en-fiestas-patrias/ (13-jul-2026) | VERIFICADO |
| Campaña escolar 2026: +5–10 % (S/ 900–1 300 M), canasta ~S/ 600 por alumno; incluye uniformes y calzado pero la nota no desglosa ropa | https://andina.pe/agencia/noticia-camara-comercio-lima-preve-ventas-campana-escolar-crecerian-hasta-10-1059919.aspx (19-ene-2026) | VERIFICADO |
| Halloween + Día de la Canción Criolla 2026: pymes +8–12 % vs. período normal; beneficia confecciones (disfraces), gastronomía, entretenimiento | https://www.peru-retail.com/halloween-y-el-dia-de-la-cancion-criolla-elevarian-las-ventas-de-las-pymes-hasta-en-12/ (15-oct-2026) | VERIFICADO |
| Año Nuevo: Gamarra proyectó S/ 200 M en ropa interior de fin de año (nov-2024; ~4 000 mypes); en 2023 los confeccionistas recortaron producción por bajas expectativas | https://www.peru-retail.com/?p=353842 ; https://www.infobae.com/peru/2023/12/27/ano-nuevo-sin-prenda-amarilla-gamarra-disminuye-produccion-de-ropa-por-bajas-ventas-este-2023/ | REPORTADO (proyecciones de otra época) |
| Cyber Wow: lo organiza IAB Perú, 3 ediciones al año de ~4 días; la de julio 2026 tuvo >1 200 ofertas y 250 marcas | https://www.infobae.com/peru/2026/07/13/cyber-wow-2026-que-marcas-tiendas-y-aerolineas-participan-en-las-ofertas-por-fiestas-patrias/ ; https://larepublica.pe/economia/2026/07/06/cyberwow-2026-segunda-edicion-sumara-mas-1200-ofertas-y-medidas-antifraude-hnews-279738 | VERIFICADO (julio). Histórico: el Cyber Wow 2019 (GfK, S/ 90 M) lideraba por televisores, cómputo y electrodomésticos, sin moda: VERIFICADO pero viejo |
| Black Friday Perú 2022: gasto promedio planeado S/ 743; ropa entre los segmentos más populares (portal Black-Friday.Global, no Ipsos) | https://www.peru-retail.com/black-friday-cuanto-gastaran-y-que-productos-consumiran-los-peruanos/ | VERIFICADO que lo dice; dato de 2022 y de un portal con interés comercial |
| Navidad 2019 (Ipsos Perú): regalos planeados: juguetes 64 %, ropa 51 %, calzado 10 %; las dos primeras semanas de diciembre son el pico; los eventos Cyber adelantaron la búsqueda a octubre–noviembre | https://www.ipsos.com/sites/default/files/ct/publication/documents/2019-12/gestion_pdf-2019-12_04.pdf (REPORTADO desde búsqueda) | REPORTADO, 2019 |
| Prendas y calzado = 58.5 % del valor de ventas de las tiendas por departamento (Produce vía Forbes Perú, 2023); liquidaciones por cambio de temporada se extendieron en 2023 | https://forbes.pe/negocios/2023-07-03/calor-o-frio-las-tiendas-de-ropa-intensifican-sus-ofertas-y-descuentos-ante-un-inusual-invierno-por-el-fenomeno-de-el-nino | REPORTADO |
| Gamarra liquida verano tras el inicio del otoño (abril 2026; también marzo 2024 con hasta 80 % de descuento) para recuperar capital y liberar stock | https://www.peru-retail.com/empresarios-de-gamarra-rematan-prendas-de-verano-con-hasta-80-de-descuento/ | REPORTADO |
| Gratificaciones: se pagan hasta el 15 de julio y el 15 de diciembre (Ley 27735), un sueldo bruto + bonificación extraordinaria de 9 % | https://laley.pe/gratificaciones-en-peru-cuando-y-cuanto-te-corresponde-recibir/ | REPORTADO. Ninguna fuente que encontré mide cuánto de la gratificación va a ropa |

**No encontré:** cifras de INEI, Euromonitor o Indecopi que pesen campañas para ropa específicamente, ni un estudio Ipsos reciente de ropa por campaña. Los pesos de arriba son de la CCL/Produce (gremial y ministerio), que miden «retail» completo (electro, tecnología, supermercados), no moda. **El peso de cada campaña para ropa de CAYLA debe medirse con las ventas propias de CAYLA, no con estas cifras.**

### 1.5 Lista semilla de ~12 campañas con fecha 2026

Tipo «ancla» / «opcional» = **OPINIÓN mía**, basada en el peso gremial de la columna fuente. Un ancla se planifica siempre; una opcional se planifica solo si el post-mortem del año anterior fue positivo. Fechas de feriados móviles verificadas por calendario (día de la semana calculado en Python).

| # | Campaña | Fecha 2026 | Tipo | Fuente / peso |
|---|---|---|---|---|
| 1 | Liquidación de verano y paso a otoño-invierno | desde ~20-mar (inicio de otoño, cálculo) hasta abril | Ancla de salida de stock | Gamarra liquida en abril 2026 (REPORTADO). Decide cuánto de verano sobra y financia la siguiente compra. En Arequipa el invierno frío es más marcado que en Trujillo: OPINIÓN |
| 2 | San Valentín | sáb 14-feb | Opcional | CCL: 6–7 % del calendario anual, casi a precio completo (VERIFICADO) |
| 3 | Regreso a clases | clases públicas lun 16-mar (colegios privados desde ~2-mar) | Opcional (solo si hay línea de uniformes o juvenil) | Andina 19-ene-2026: canasta S/ 600 (VERIFICADO); fecha Minedu RM 501 (REPORTADO) |
| 4 | Día de la Madre | dom 10-may (segundo domingo de mayo) | **Ancla** | CCL 15–20 % del año; ropa/calzado/accesorios lideran (VERIFICADO) |
| 5 | Cyber Wow, edición de abril | lun 20 – jue 23-abr (otra fuente dice 6–9 abr) | Opcional (canal online) | Caretas; La República cita 20–23 abr en una nota relacionada (REPORTADO, fechas en conflicto) |
| 6 | Día del Padre | dom 21-jun (tercer domingo de junio) | Opcional | CCL pymes +6–9 %; la nota no cita ropa (VERIFICADO); Sodimac/El Comercio dan la fecha |
| 7 | Cyber Wow, edición de julio | lun 13 – jue 16-jul | Opcional (canal online) | IAB Perú; >1 200 ofertas (VERIFICADO, dos fuentes) |
| 8 | Fiestas Patrias + gratificación de julio | mar 28 y mié 29-jul (megapuente 25–29 jul en el sector público; descanso del lun 27) | **Ancla** | Moda y tecnología lideran la demanda esperada (VERIFICADO); feriados y puente: Caretas (REPORTADO) |
| 9 | Halloween / Día de la Canción Criolla | sáb 31-oct | Opcional (candidata a pausar si CAYLA no vende disfraz ni línea criolla) | CCL pymes +8–12 % (VERIFICADO); la nota no habla de moda de tienda |
| 10 | Cyber Wow, edición de noviembre | lun 2 – jue 5-nov | Opcional (canal online) | Sodimac: «Volvemos del 02 al 05 de Noviembre» (VERIFICADO como afirmación de Sodimac); Caretas igual; **no vi el anuncio del IAB**. Empieza en 7 días |
| 11 | Black Friday (y Cyber Monday lun 30-nov, cálculo) | vie 27-nov (día siguiente al cuarto jueves, 26-nov) | **Ancla** (con tope de descuento) | Peru Retail/Calendarr: 27-nov (REPORTADO). Lenovo Perú dice 28: error de calendario |
| 12 | Navidad | vie 25-dic; compra de regalos concentrada en las dos primeras semanas de diciembre; gratificación hasta el mar 15-dic | **Ancla principal** | ≈40 % de las ventas anuales del retail (VERIFICADO, CCL); 30–40 % según Produce (VERIFICADO) |
| 13 | Año Nuevo (prendas de cábala) | jue 31-dic | Opcional | Gamarra: S/ 200 M proyectados en 2024 (REPORTADO); mercado de precio bajo (desde S/ 2): puede no calzar con CAYLA |

Si se quiere exactamente 12: unir 5, 7 y 10 en una sola fila «Cyber Wow (3 ediciones, online)» y se obtienen 11; sumar «Día de la Mujer, 8-mar» (no investigado, sin fuente) o dejar las 13.

### 1.6 Lo que esto implica para la pantalla (OPINIÓN)

- «Conservar» una campaña ≠ «planificarla este año». Tres estados: **Activa** (se planifica), **En pausa** (no sale en alertas ni en plazos; conserva resultados; vuelve con un clic y una nota), **Retirada/Archivada** (solo lectura). Nunca eliminar.
- La decisión de «volver a hacerla» debería salir del post-mortem (sección 1.2), no de una casilla manual. Un campo «decisión tras la campaña» (repetir/ajustar/pausar/retirar) con la métrica que la sustenta.
- Las fechas móviles (Madre, Padre, Black Friday, Cyber Wow) se calculan por regla («segundo domingo de mayo»), no se tipean cada año.
- Ojo con el Cyber Wow de noviembre: si hoy se planifica, el pedido ya no llega (el propio plazo de la pantalla lo dirá).

---

## TEMA 2 — Centro de avisos compacto

**Contexto del repo (lectura, sin cambios):** en esta rama ya existe un cajón «Resumen y avisos» con un botón de ícono y un globito de número (`components/plan-compra/PlanCampana.tsx`, ~líneas 313–338), y bajo las pestañas hay franjas `<Aviso>`: la de **fecha límite para pedir** (con tono verde/ámbar/rojo/info según el plazo), la de «campaña archivada» y la de «sin plan». No es lo mismo que describe Felipe (ícono a la altura de las pestañas que se expande en el sitio), pero sirve para decidir qué es crítico y qué es informativo. La franja del plazo es el único aviso cuyo costo de ignorarlo es dinero perdido sin vuelta atrás.

### 2.1 Evidencia por tema

**Gravedad e intrusividad deben ir juntas**
- NN/g: las notificaciones pasivas (informativas, que no piden respuesta) van en badges o popovers discretos; las que exigen acción son urgentes y «deben ser intrusivas»; una pasiva fácil de ignorar es un problema cuando la información es clave para entender el sistema. Un toast que se desvanece es mala idea para errores. VERIFICADO: https://www.nngroup.com/articles/indicators-validations-notifications/
- IBM Carbon: cuatro estados (info, éxito, advertencia, error); el estilo de alto contraste «es más disruptivo y se usa para lo urgente o crítico»; banner = nivel producto/sistema, persiste hasta descartarlo, **uno a la vez**; panel de notificaciones = historial en orden cronológico que el usuario abre y cierra; no usar temporizador para mensajes críticos; limitar los no críticos; «las interrupciones frecuentes causan fatiga de alertas». VERIFICADO: https://carbondesignsystem.com/patterns/notification-pattern/ (no cubre badges ni aria-live).
- Atlassian: el banner va arriba, solo para pérdida de datos/funcionalidad o información de todo el sitio, **uno a la vez**, no descartable, rol `alert` (ruidoso para lectores de pantalla); para confirmaciones usar flag; para información disponible usar mensaje en línea. VERIFICADO: https://atlassian.design/components/banner/usage
- GitHub Primer: jerarquía de más a menos prominente = actualizaciones del sistema, retroalimentación, concienciación; mensajes de sistema no descartables hasta resolver; colocar cerca de la acción relacionada; seis estados (info, advertencia, éxito, no disponible, crítico, upsell). VERIFICADO: https://primer.style/product/ui-patterns/notification-messaging/ (no cubre cantidad simultánea, fatiga ni aria-live; esos puntos de Primer los vi solo en un resumen de búsqueda, REPORTADO).
- Shopify (documentación para desarrolladores, no la página de Polaris): banners para condiciones persistentes importantes, pocos a la vez, descartables salvo que sean críticos. REPORTADO: https://shopify.dev/docs/apps/build/checkout/migrate-to-web-components/banner . No logré leer la página de mejores prácticas de Polaris.

**Badges y conteos**
- PatternFly (Red Hat): siempre un badge cuando hay panel de notificaciones; un clic en el badge **abre y cierra** el panel; estado «sin leer» (azul) solo si se pueden marcar como leídas y llegan con poca frecuencia (si siempre hay no leídas, la señal se pierde y distrae); estado «atención» (rojo, con ícono distinto) solo para severidad error y condiciones infrecuentes; el conteo es útil en la mayoría de los casos. VERIFICADO: https://www.patternfly.org/components/notification-badge/design-guidelines (no da guía de accesibilidad).
- Android/Material: dos variantes, pequeña (punto) y grande (con número); el número máximo es configurable (`maxNumber`); la descripción accesible del badge sale del número mostrado y se puede personalizar (singular/plural, «excede el máximo»). VERIFICADO: https://github.com/material-components/material-components-android/blob/master/docs/components/BadgeDrawable.md . La página oficial de Material 3 (m3.material.io) es JavaScript y no me devolvió texto; no pude confirmar su regla de «999+».
- Otras guías: no usar solo color (un punto de color solo es ambiguo), pasar a «99+» con números grandes, evitar el conteo cuando el número no informa (UX4G, Layer5, Visa; REPORTADO). Braze: los usuarios pierden interés pasado un conteo de dos dígitos (REPORTADO).
- SAP Fiori: el badge cuenta lo nuevo y vuelve a cero al abrir; lista agrupable por app con conteo en el encabezado del grupo; el grupo hereda la prioridad más alta de sus elementos; lo urgente sale además como banner breve arriba a la derecha. REPORTADO (los .sap.com devolvieron 403; resumen de búsqueda): https://www.sap.com/design-system/fiori-design-web/v1-96/ui-elements/notification-center/usage

**Esconder cosas tiene un costo medido**
- NN/g, navegación oculta (hamburguesa) vs. visible: uso 27 % vs. 48 % en escritorio; descubrimiento de contenido más de 20 % peor; tareas ≥39 % más lentas en escritorio. VERIFICADO: https://www.nngroup.com/articles/hamburger-menus/ . Es una analogía (menús, no avisos), pero es el mejor número que encontré sobre lo que cuesta esconder algo detrás de un ícono en escritorio.
- NN/g, íconos: la etiqueta de texto debe estar presente y visible siempre, no solo en hover; solo unos pocos íconos son universales (casa, imprimir, lupa); un ícono de reloj en la navegación no lo tocó ningún participante («ícono oscuro = función desperdiciada»). VERIFICADO: https://www.nngroup.com/articles/icon-usability/ . No habla de la campana.
- NN/g, ceguera a banners: la gente salta lo que parece publicidad, y eso incluye lo de lugar típico de anuncios (arriba de la página, columna derecha) y lo que se ve distinto del contenido (caja de color, forma rectangular, texto incrustado). «Evita depender del banner superior para contenido crítico». VERIFICADO: https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/ . **Ojo, es un hallazgo en contra de la solución actual también:** dos franjas grandes de color arriba de la tabla corren el mismo riesgo de ser ignoradas. No es un argumento a favor de esconderlas.
- Fatiga de alertas (clínica, no UX web): en 112 médicos de atención primaria, más alertas en el mismo encuentro → más rechazos; no lo explicó la carga total ni la repetición de la misma alerta; recomiendan **menos alertas por paciente**. VERIFICADO el resumen de AHRQ PSNet: https://psnet.ahrq.gov/issue/effects-workload-work-complexity-and-repeated-alerts-alert-fatigue-clinical-decision-support . (La cifra «-30 % de aceptación por cada recordatorio adicional» la vi solo en el resumen de una búsqueda: REPORTADO.) Lección: el problema de fondo es la cantidad de avisos que compiten, no solo dónde se ven.

**Accesibilidad**
- Botón de expandir/colapsar = patrón *disclosure*: `button` con `aria-expanded` verdadero/falso, `aria-controls` opcional, Enter y Espacio lo activan. VERIFICADO: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- Mensajes de estado (WCAG 4.1.3): deben poder anunciarse sin mover el foco; `role="status"` para estados y éxito, `role="alert"` para errores/advertencias, sin abusar del anuncio asertivo con lo que no es urgente. VERIFICADO: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- Regiones vivas: `aria-live="polite"` normalmente; `assertive` solo para lo crítico e inmediato, «puede ser extremadamente molesto»; la región debe existir en el HTML inicial antes de cambiar su contenido; `role="alert"` y `aria-live` juntos duplican el anuncio en VoiceOver iOS. VERIFICADO: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
- Contraste: los componentes de interfaz y objetos gráficos necesarios para entender el contenido deben tener 3:1 contra los colores adyacentes (WCAG 1.4.11). VERIFICADO: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html . El texto del número dentro del badge cae bajo la regla de 4.5:1 de WCAG 1.4.3 (conocimiento general mío, no leído en esta sesión). Un badge no debe depender solo del color: número o ícono más nombre accesible (Material/UX4G).

**Posponer / descartar / agrupar**
- Hay buena guía para agrupar y ordenar (SAP) y para no descartar lo crítico por temporizador (Carbon). **No encontré evidencia seria sobre «posponer» (snooze)**: solo peticiones de usuarios de ClickUp (SECUNDARIO). OPINIÓN: en un ERP, un aviso ligado a un plazo no se posterga; se resuelve o se acepta explícitamente («Entendido, compraré tarde»).
- Apple HIG: no pude leer la página (solo el título); no uso nada de ella.

### 2.2 Cuándo un aviso NO debe ir tras un ícono

Criterio mío, apoyado en las fuentes de arriba. Un aviso se queda a la vista (o en su contexto) si cumple CUALQUIERA de estas:
1. **Tiene una fecha límite cercana y su costo de ignorarlo es irreversible o es dinero** (NN/g: lo urgente debe ser intrusivo; Carbon: no temporizar lo crítico). En Plan de campaña: la fecha límite para pedir cuando el estado es «justo» o «tarde».
2. **Invalida lo que la persona está mirando** (los números de la tabla dependen de él): va junto a lo que afecta (Primer: cerca de la acción relacionada; NN/g: una notificación fácil de ignorar es un problema si es clave para entender el sistema). Ejemplo en el repo: stock sin cuadrar en alguna tienda cambia cuánto «hay que comprar».
3. **Es del nivel de sistema o pérdida de datos/funcionalidad** (Atlassian: banner, no descartable).
4. **Nadie lo va a resolver desde la lista** si el número no dice qué es: un «3» sin pista de gravedad es un número que se aprende a ignorar (PatternFly: si siempre hay no leídas, la señal se pierde).
5. **La persona nunca ha visto el ícono** (primeras sesiones): un ícono nuevo sin etiqueta tiene riesgo de «función desperdiciada» (NN/g, íconos).
Lo informativo (campaña archivada, «sin plan», sugerencias, avisos que ya se resolvieron) sí puede ir tras el ícono.

### 2.3 Tres patrones concretos

**Patrón A — «Lo grave a la vista, lo demás en la campana» (recomendado).**
Se separan por gravedad con una regla escrita: *crítico/con plazo* = una sola franja delgada arriba (máx. una, la más grave, como Carbon/Atlassian); *informativo/pendiente* = ícono con contador a la altura de las pestañas, que se expande en el lugar (disclosure con `aria-expanded`) y se vuelve a compactar con otro ícono (p. ej. campana → campana-con-chevron/«cerrar»). El color del badge sube a ámbar/rojo si dentro hay algo grave y, si hay un crítico, la franja fina ya lo dice por escrito.
- Gana: lo que cuesta dinero no se esconde (NN/g navegación oculta: −20 % de descubrimiento); la pantalla queda limpia en el caso normal; coincide con el pedido de Felipe para todo lo no crítico.
- Cuesta: dos mecanismos conviven, hay que decidir y documentar quién es «crítico» (una regla en una línea); el contador cuenta pendientes, no «no leídos».

**Patrón B — «Todo tras el ícono» (lo que Felipe pidió, literal).**
Un solo botón compacto con número; clic = lista expandida como hoy (orden por gravedad y luego fecha, con conteo por grupo, SAP); segundo clic la compacta y cambia el ícono. Añadir: etiqueta de texto visible junto al ícono («Avisos 3»), no solo hover (NN/g, íconos); el ícono y el número adoptan el color del aviso más grave (PatternFly «atención»); abrir **solo** la primera vez de la sesión si hay uno crítico y recordar el estado en la sesión; región `role="status"` `aria-live="polite"` en el HTML inicial para anunciar cambios de conteo, y `role="alert"` una sola vez al llegar un crítico nuevo.
- Gana: máxima limpieza; consistente con el resto del ERP si ya hay un cajón (ya existe en esta rama).
- Cuesta: es el patrón con más riesgo de esconder lo crítico (hamburguesa: ≥39 % más lento, 27 % de uso); depende de que el número sea creíble. Mitigación obligatoria: el punto 1 de 2.2 cuando el plazo es «justo» o «tarde».

**Patrón C — «Resumen de una línea que se expande».**
Una barra compacta a la derecha, a la altura de las pestañas, que muestra el aviso más grave **con texto** («Vence el pedido en 2 días · +2 avisos») y un chevron: clic abre la lista completa debajo, clic la cierra. Es la forma híbrida entre A y B.
- Gana: lo más grave se lee sin clic y el resto queda recogido; baja el riesgo de «ceguera a banners» al ser texto y no un bloque de color.
- Cuesta: ocupa más ancho que un ícono; en 375 px hay que decidir si colapsa a solo ícono (y ahí vuelve el riesgo de B); necesita truncar texto con cuidado.

**Recomendación (OPINIÓN):** A si Felipe acepta que el aviso de plazo en estado «justo/tarde» viva fuera del ícono; si quiere B literal, que el plazo cambie el ícono a rojo con texto («Pedir ya») y se abra solo una vez. Antes de decidir, medir en la propia pantalla: ¿cuántos avisos hay en promedio? Si casi siempre hay 0 o 1, un contador sobra y la franja basta (PatternFly: el conteo/no leído pierde sentido cuando casi nunca hay nada, o cuando siempre hay algo).

---

## TEMA 3 — La compra de mercadería en las finanzas

### 3.1 La verdad contable (Perú / NIIF)

**NIC 2 (texto del MEF, versión 2019; VERIFICADO leyendo el PDF):** https://www.mef.gob.pe/contenidos/conta_publ/con_nor_co/vigentes/nic/SpanishRedBV2019_NIC02_GVT.pdf
- Párr. 1: el tema central es cuánto costo se reconoce **como un activo, diferido hasta que se reconozcan los ingresos correspondientes**.
- Párr. 6: inventarios son activos poseídos para ser vendidos en el curso normal de la operación, en proceso de producción con vistas a esa venta, o materiales que se consumirán en la producción.
- Párr. 9: se miden al costo o al valor neto realizable, el menor.
- Párr. 11: el costo de adquisición incluye precio de compra, aranceles de importación y otros impuestos no recuperables, transporte y manejo; los descuentos comerciales y rebajas se deducen.
- Párr. 34: *«Cuando los inventarios sean vendidos, el importe en libros de los mismos se reconocerá como gasto del periodo en el que se reconozcan los correspondientes ingresos de operación.»* Las rebajas de valor se reconocen cuando ocurren. Confirmado también en https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/ (VERIFICADO).

**Consecuencia:** comprar mercadería **no es un gasto**. Es un activo (inventario) que se convierte en gasto (costo de ventas) cuando se vende. Un pedido todavía no recibido ni siquiera es inventario.

**Pedido sin recibir:** un contrato donde ninguna parte ha cumplido es un *contrato pendiente de ejecución*; los borradores del IASB indican que, con precio de mercado, normalmente ninguna parte reconoce un activo o pasivo neto al inicio. VERIFICADO que lo dice un documento de personal técnico del IASB (junio 2014, ap8b), pero es un documento de trabajo, **no una norma**: https://www.ifrs.org/content/dam/ifrs/meetings/2014/june/asaf/conceptual-framework/ap8b-cf-executory-contracts.pdf . Coincide con la práctica de los ERP (3.2).

**Cuentas del PCGE (SECUNDARIO: ejemplos de sitios contables peruanos; no pude leer el PCGE oficial, el PDF dio 403):**
- 20 Mercaderías (activo); 42 Cuentas por pagar comerciales – terceros (421 facturas por pagar; **422 anticipos a proveedores, naturaleza deudora** = activo); 60 Compras; 61 Variación de inventarios; 69 Costo de ventas.
- Asiento de una compra (método de la cuenta 60): Debe 60 (S/ 2 500) + 40 IGV (S/ 450) / Haber 42 (S/ 2 950); luego, por el ingreso al almacén: Debe 20 / Haber 61 (S/ 2 500). https://noticierocontable.com/?p=54485 . El IGV no entra al costo del inventario (es crédito fiscal): la salida de caja es 18 % mayor que el costo. VERIFICADO el ejemplo; SECUNDARIO como norma.
- Al vender: Debe 69 (costo de ventas) / Haber 20 (salida del almacén). REPORTADO (la búsqueda no encontró un ejemplo numerado, y la inferencia es mía).
- El anticipo a proveedor se registra en 422 (activo) y se aplica contra la compra cuando llega la factura: https://misha.pe/?p=26723 (SECUNDARIO; su asiento está mal presentado, solo confirma el uso de la 422).
- **Aviso:** El Peruano informa que el MEF aprobó un **PCGE 2026** (Resolución 002-2026-EF/30, 7-sep-2026) que «mantiene la estructura del PCGE Modificado 2019» y busca simplificarla (https://elperuano.pe/noticia/304192-mef-actualizo-plan-contable-empresarial , REPORTADO). No pude confirmar si cambiaron las cuentas 20/42/60/61/69. Antes de nombrar cuentas en la pantalla, consultar al contador de CAYLA.

**Manufactura propia:** la parte de la campaña que se fabrica en el Taller no es «compra de mercadería» sino costo de producción: materiales + mano de obra + costos indirectos entran al inventario por NIC 2 (costos de transformación); el flujo de caja de esa parte son telas, insumos y planilla en fechas distintas. Debe mostrarse distinto de la compra a un proveedor.

### 3.2 Cómo lo tratan los sistemas

- **NetSuite:** «Una orden de compra expresa un compromiso de recibir y pagar; **no tiene impacto contable hasta que recibes la orden**.» VERIFICADO: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2399585.html . La recepción debita inventario y acredita compras devengadas; la factura del proveedor crea la cuenta por pagar (REPORTADO, guías de terceros).
- **QuickBooks:** las órdenes de compra son registros que no contabilizan hasta convertirse en factura (bill) o pagarse. SECUNDARIO (foros de la comunidad y un blog contable).
- **Oracle E-Business Suite, pronóstico de caja:** las fuentes de salidas incluyen facturas de proveedores, pagos de proveedores, **órdenes de compra (POP) y requisiciones de compra (POR)**, presupuestos del libro mayor y «salidas definidas por el usuario» (se pueden agregar montos a mano); la fecha de caja de una factura sale de la fecha de vencimiento o de descuento según la plantilla. VERIFICADO: https://docs.oracle.com/cd/E26401_01/doc.122/e48900/T359831T359838.htm . **O sea: una orden de compra aparece en el pronóstico de caja sin ser un gasto contable, y es una fuente que se elige.**
- **Xero:** su pronóstico de flujo a corto plazo se arma con facturas y bills por fecha de vencimiento; **no incluye órdenes de compra**. El equipo de Xero respondió a un pedido de usuarios (4-jun-2026, estado «ganando apoyo») que por ahora se revisen aparte «para considerar ingresos y compromisos esperados». VERIFICADO: https://productideas.xero.com/forums/967115-invoices-quotes/suggestions/51084937-reporting-include-quotes-and-purchase-orders-in . Float (herramienta externa) tampoco trae órdenes de compra desde Xero (REPORTADO). Lección: los usuarios *piden* ver los compromisos en el flujo, y a la vez nadie los mezcla con los bills reales.
- **Odoo:** los plazos de pago (p. ej. 30 % al contado y saldo a 30 días, o 50 % a 30 y 50 % a 45 días) se definen en el proveedor o en la orden de compra y calculan las fechas de vencimiento de la factura; los reportes de proveedores por pagar agrupan por fecha de vencimiento. VERIFICADO: https://www.odoo.com/documentation/13.0/applications/finance/accounting/payables/misc/forecast.html (Odoo 13). No encontré qué asiento genera confirmar una OC en Odoo.
- **«Open-to-buy» (planificación de merchandising):** presupuesto de compra = ventas planificadas + rebajas planificadas + inventario final planificado − inventario inicial − **lo ya pedido (on order)**. La resta de lo ya pedido es lo que impide duplicar compras. VERIFICADO el formulario en Shopify (sin el término «on order», que trata aparte: «las órdenes existentes pueden agotar ese presupuesto»): https://www.shopify.com/blog/open-to-buy-plans ; la versión con «on order» como parte de la fórmula: https://www.hyperbots.com/glossary/open-to-buy-formula (REPORTADO, glosario de proveedor). Anaplan: no encontré mecánica de OTB ni de caja.
- **Contabilidad por «comprometido» (encumbrance):** técnica del sector público/universidades que reserva presupuesto cuando se emite una orden de compra, sin ser gasto, y la libera al recibir o pagar; las fuentes difieren en el momento de la conversión (factura vs. pago). SECUNDARIO: https://www.bill.com/learning/encumbrance-accounting ; https://www.fordham.edu/resources/policies/office-of-finance-purchasing-manual/the-purchasing-process/encumbrances-and-purchase-orders/ .
- **Mostrar u ocultar partidas proyectadas:** no encontré un caso documentado de «interruptor» que incluya/excluya partidas planificadas en un resumen real. Lo que sí vi: Qonto hasta 5 pronósticos paralelos (REPORTADO), BILL con modelado «what-if» y presupuesto vs. real separados (REPORTADO), Oracle EBS con fuentes seleccionables por plantilla (VERIFICADO). Patrón común: **lo proyectado es una capa/serie aparte; lo real nunca se modifica**. OPINIÓN: el interruptor es de visualización del flujo de caja, no de la contabilidad.

### 3.3 Condiciones de pago (Perú)

- **Ley 31362 y su reglamento (DS 120-2022-EF):** quien compra a un proveedor MYPE (ventas anuales hasta 1 700 UIT; Gestión dice hasta S/ 7.8 M) debe pagar en **máximo 30 días calendario desde la emisión de la factura**; un plazo mayor solo por acuerdo excepcional con firma legalizada notarialmente o escritura pública, con declaración de que no es abuso; si se pacta en cuotas, el acuerdo fija las fechas de cada cuota y la primera cae dentro del plazo; hay 8 días para dar conformidad; mora desde el día siguiente al vencimiento. VERIFICADO el reglamento: https://busquedas.elperuano.pe/dispositivo/NL/2076849-4 ; Gestión (13-jun-2022): https://gestion.pe/economia/mypes-ya-pueden-cobrar-sus-facturas-a-empresas-en-un-plazo-de-30-dias-noticia/ . **No verifiqué si fue modificada después de 2022.** Relevancia: los confeccionistas y talleres externos peruanos suelen ser MYPE, así que un calendario «a 60/90 días» con ellos requiere acuerdo notarial; el calendario de pagos de CAYLA no debe asumir 60/90 como si fuera libre.
- **Importación textil de Asia:** el esquema más citado es T/T 30 % de anticipo al confirmar la orden y 70 % antes del embarque o contra copia del B/L; con relación establecida pasa a 70 % contra B/L o Net 30/60 tras varias operaciones. SECUNDARIO: https://seller.alibaba.com/blogs/2026/southeast-asia/apparel/tt-payment-terms-guide-alibaba-b2b (blog de vendedores de Alibaba, con interés comercial, y ni siquiera es sobre Perú).
- **No encontré** ninguna fuente que describa condiciones de pago típicas de proveedores textiles peruanos (anticipo, crédito, letras). Cualquier cifra en pantalla tiene que salir de lo que CAYLA pacte con cada proveedor (por proveedor, no un supuesto global).

### 3.4 Conclusión: cómo llamarlo y tratarlo en Finanzas (OPINIÓN fundamentada)

**DECIDÍ (recomiendo):** en Finanzas esto se llama **«Compra planificada»** mientras es un plan, **«Compromiso de compra»** desde que existe una orden con el proveedor, y su calendario se muestra como **«Salida de caja proyectada»**. No se llama gasto, ni egreso, ni costo. Aparece solo en las vistas de **caja/por pagar proyectado**, con un interruptor «incluir compras planificadas» que **por defecto está apagado en resultados (P&L)** y **encendido en el flujo de caja futuro**.

**DESCARTÉ:** llamarlo «gasto de campaña» (lo que Felipe dijo). Costo concreto: (1) el resultado del mes en que se compra mostraría una pérdida que no existe (la mercadería sigue en el almacén como activo, NIC 2 párr. 34), y el mes en que se vende mostraría una ganancia inflada; (2) cuando llegue el costo de ventas real se cuenta dos veces; (3) el margen de la campaña queda sin sentido. Descarté también hacerlo «egreso real» antes del pago o de la factura, porque un plan no es un pasivo.

**SE ROMPE SI:** (a) una compra planificada y su orden real (o su factura real) aparecen a la vez en el flujo, duplicando la salida de caja: debe consumirse la línea proyectada cuando se registra la real (la real la reemplaza, no se suma); (b) una parte importante de la campaña se fabrica en el Taller y se trata igual que una compra a proveedor, cuando su caja son telas, insumos y planilla en otras fechas; (c) el plan «a N meses» se muestra como obligación contractual cuando solo es una intención (los proveedores MYPE por ley 31362 deberían cobrar a 30 días, y el 60/90 depende de un acuerdo notarial); (d) el calendario de pagos muestra el costo sin IGV cuando la caja sale con IGV (18 % más; el IGV recuperable es otro flujo).

**Cómo tratarlo, en capas (cada una distinta):**
1. **Plan** (estimado, sin documento): presupuesto de compra por categoría y campaña. No es contable. Alimenta el open-to-buy.
2. **Compromiso** (orden de compra emitida o producción lanzada): aún no es activo ni pasivo (contrato pendiente de ejecución). Se muestra como «Comprometido» y se resta del presupuesto de compra (open-to-buy: lo ya pedido).
3. **Recepción**: sube inventario (cuenta 20) y la cuenta por pagar (42); sigue sin ser gasto.
4. **Pagos programados** (anticipo, saldo, cuotas, 30/60/90 días): líneas de fecha y monto sobre el compromiso o la cuenta por pagar; estado proyectado → programado → pagado. El anticipo ya pagado es un activo (422), no un gasto.
5. **Venta**: aquí sí se reconoce el costo (cuenta 69).

**Regla de visualización:** nada proyectado modifica lo real; todo lo proyectado va con marca visible («Proyectado») y se puede ocultar. El calendario de pagos de una campaña debe poder cerrar la pregunta «¿qué compro cada mes y cuánto sale de caja ese mes?» sin tocar el estado de resultados.

**Pregunta abierta para el contador (no la pude responder):** si CAYLA lleva inventario permanente (20 contra 69 en cada venta) o periódico (compra a 60, ajuste a 61), y si el PCGE 2026 cambió los códigos.

---

## Lo que NO encontré / lo débil

- **Tema 1:** ningún marco publicado de «ancla vs. opcional»; criterios de repetir/pausar solo en blogs de proveedores; ningún dato de INEI, Euromonitor o Indecopi que pese campañas para **ropa**; los pesos de la CCL/Produce son de retail total; ningún benchmark de plazos de manufactura o importación peruanos; fechas del Cyber Wow (abril: 6-9 vs. 20-23; noviembre: 2-5 solo de Sodimac y Caretas, no del IAB); fechas fiscales 4-5-4 2026 de la NRF no leídas; ranking del Día de la Madre en disputa (2.º vs. 3.º).
- **Tema 2:** NN/g no tiene (que yo encontrara) un artículo específico de badges de notificación ni de centro de notificaciones; Material 3 y Polaris no se pudieron leer; SAP y Apple dieron 403/solo título; fatiga de alertas solo con evidencia clínica (analogía); nada serio sobre posponer; la cifra de NN/g sobre navegación oculta es de menús, no de avisos.
- **Tema 3:** el PCGE oficial dio 403 (cuentas citadas con fuentes secundarias); PCGE 2026 sin leer; asiento del costo de ventas inferido, no leído; QuickBooks solo por foros; comportamiento de Odoo al confirmar una OC no encontrado; condiciones de pago de proveedores textiles peruanos: ninguna fuente; Ley 31362 sin verificar modificaciones posteriores a 2022; interruptores de «incluir proyectado» documentados: ninguno.
