# Pantalla — Existencias (`/inventario`)

> Modo: **rápido** · Fecha: 2026-10-03 · Rol/sede: no identificable en la captura (ve Inventario, Catálogo y Compras; botones Bajar al piso, Nuevo traslado, Recibir y Contar), Tienda TRU, sábado 16:50 · Datos: captura real, **sin SQL** (modo rápido). Dispositivo juzgado: computadora (la captura); el celular no se revisó.
> SHA analizado: `78749fe6` (`origin/main`; la rama iba 3 commits detrás, así que el código se leyó con `git show origin/main:<archivo>`). Si `InventarioPanel.tsx`, `TarjetaReponerAPiso.tsx`, `existencias-prendas.ts` o `existencias-recomendaciones.ts` cambian, este análisis está vencido.
> Archivos: `app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `TarjetaReponerAPiso.tsx` · `ExistenciasTarjetas.tsx` · `CajonPrendaExistencias.tsx` · `lib/existencias-prendas.ts` · `lib/existencias-recomendaciones.ts` · `lib/politica-operativa-inventario.ts` · ADR-0231, 0237, 0303
> Otra sesión tocándola: no vi ninguna activa sobre `InventarioPanel`/`TarjetaReponerAPiso` en `docs/SESIONES-ACTIVAS.md` (la tabla leída es la de esta rama, 3 commits atrás: `[inferido]`).
> **Sustituye al análisis completo del 2026-09-26**, que quedó vencido: `InventarioPanel.tsx` cambió +949/−696 líneas entre `ffa5d52b` y `78749fe6` (tarjetas «Prioridades de hoy», cajón de la prenda, «Resumen disponible» nuevo, ADR-0303/0306/0317). Sus 12 tareas ya estaban cerradas (✅). El texto completo, con su anexo de consultas SQL y su inventario de elementos, sigue en el historial de git: `git log -- docs/pantallas/inventario.md`.

## 0 · Veredicto
Es una buena **pantalla de trabajo del piso** («qué cuelgo hoy»), no un tablero de gestión comercial. Su defecto central es que la tarjeta que justifica la pantalla —«Reponer a piso hoy»— es la única que no dice cuántas son, y que ordena sin mirar qué se vende.
**Cumple su finalidad:** 6.7/10 (promedio de las 6; sin tope: en lo que leí no hay un defecto que dañe stock o dinero, pero **no revisé las escrituras**) · **Relevancia:** 7.2/10 — Soporte

## 1 · Finalidad declarada
«Existencias existe para que la tienda sepa qué tiene, dónde está (piso, almacén, en camino, dañado) y qué debe reponer hoy, y actúe sobre eso sin salir.» Fuente: ADR-0231 (una regla de piso), ADR-0237 («conectada»: el «sin salir») y el comentario de `InventarioPanel.tsx:269-273`, no la captura. La propia cabecera lo dice: «Acciones clave para mantener el piso completo y la operación al día» `[visto]`.
**¿Docs y pantalla coinciden?** Sí en la finalidad. **No coinciden** en el vocabulario (tarea #7) ni en el nombre de la primera cifra: el ADR-0303 llama «Hay en la tienda» a lo que la tarjeta rotula «Resumen disponible».

## 2 · Objeción
**1. La tarjeta que importa no tiene número.** «Reponer a piso hoy» toma las primeras 3 prendas (`TarjetaReponerAPiso.tsx:19,61`: `slice(0, CUANTAS)`) y nunca muestra `prendas.length`. Las otras tres tarjetas tienen una cifra grande `[visto]`. Con 3 pendientes o con 40, la tarjeta se lee igual: «Empieza por estas prendas». Quien la mira no sabe si le queda media hora o toda la tarde. Costo de arreglarlo: una línea.

**2. «Prioridades de hoy» no prioriza con ningún criterio comercial.** El orden lo decide `urgenciaDePrenda`: 0 = tiene tallas por colgar, 1 = pide reponer y se puede bajar, 2 = nada; desempata por cuántas tallas están sin piso y luego por orden de llegada (`existencias-prendas.ts:208-221`). Ni una venta, un precio ni un margen entra. Nada impide que las tres prendas de la captura sean las de menor venta del mes `[inferido]`.
**Trade-off, y por qué no lo llamo error:** Felipe decidió el 2026-09-25 que reponer es «regla física, no estimación de demanda» (`politica-operativa-inventario.ts`: piso ≤ 4) y el ADR-0303 descartó proyectar con un mes de historia. Respeto el umbral. Objeto solo al **desempate**: entre 30 prendas empatadas «sin piso», contar lo vendido en el mes no es una proyección, es un conteo. Pero reabre el DESCARTÉ #3 del ADR-0303 (leer ventas en cada visita): solo vale si el dato viaja en la misma RPC del stock (tarea #4).

**3. El botón más fuerte de la pantalla apunta a otra prioridad.** `+ Nuevo traslado` es `btn-primario` y `Bajar al piso` es `btn-secundario` (`page.tsx:179-185`) `[visto]`, en una pantalla cuya tarjeta roja dice que lo urgente es colgar. El peso visual manda al colaborador a mandar mercadería a otra sede, no a bajarla al piso.

**4. Dos de las cuatro tarjetas dicen «nada» con el peso de las que dicen algo.** «0 unidades · Ningún traslado en camino» y «0 prendas · Ninguna prenda dañada pendiente» ocupan la mitad del ancho y estiran la altura de la fila `[visto]`; la lista (el nombre de la pantalla) arranca bajo el borde. *Es el diseño que Felipe aprobó el 2026-09-28 (`InventarioPanel.tsx:723`): decide Felipe.*

## 3 · Lo que está bien y no se toca
- **Una sola fuente de «qué reponer»:** tarjeta, tabla, filtro «Acción» y botón leen el mismo `calcularAccionHoy` `[código existencias-recomendaciones.ts:131]`. No hay un semáforo paralelo que se contradiga (el problema del ADR-0231).
- **«Vista de las 16:50» es honesto:** dice la hora de la foto, no un reloj vivo que haría creer que el stock está al minuto `[código page.tsx:160-163, ADR-0220]`.
- **El piso se dice «libre», no «total»:** las cifras restan lo apartado, así 126 + 651 = 777 cuadra con el 777 de la tarjeta `[visto + código InventarioPanel.tsx:604]`.
- **Fallas que se avisan, no se tragan:** si cobertura o marca no cargan, la pantalla lo escribe en ámbar en vez de mostrar una tabla incompleta como si estuviera completa `[código InventarioPanel.tsx:1006-1008]`.
- **Las tallas de la tarjeta** muestran piso y almacén de cada una al pasar el mouse, y la fila entera es un solo blanco de clic `[código TarjetaReponerAPiso.tsx:38,88]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Paleta, serif y jerarquía de la guía CAYLA; pesa mal el vacío (2 de 4 tarjetas en cero) y la unidad cambia (uds / unidades / prendas) | `[visto]` |
| Lógica de negocio | 6 | Regla física clara y documentada; «Mantener» junta lo sano, lo sobrado y lo muerto; el orden no ve ventas | `[código existencias-recomendaciones.ts:131, existencias-prendas.ts:208]` |
| Arquitectura | 7 | Una fuente por regla; ventas del mes bajo demanda para no cargar la pantalla; falla visible | `[código]` · escrituras y concurrencia `[no verificable]` (rápido) |
| Funciones | 7 | Todo botón lleva a algo real. Faltan: el total de pendientes, ir de la tarjeta a la acción, ventas en la vista principal | `[visto]` |
| Utilidad | 6 | Colaboradora nueva, 16:50: la tarjeta dice «empieza por estas» pero no cuántas; clic → lista filtrada → abrir prenda → «Reponer prenda»; cuatro palabras para el mismo acto | `[visto + código]` |
| Conexión con el ERP | 7 | Bien conectada hacia Traslados, Recibir, Contar y Bajar; sin puente a Análisis ni a Frescura del piso | `[código InventarioPanel.tsx:725]` |

**Estética.** `[visto]` Las tres tarjetas con cifra usan tres unidades: «uds», «unidades», «prendas». «Prenda» además significa modelo + color en la lista (ADR-0237) y quizá otra cosa en «Incidencias» `[inferido]`. El eyebrow repite la sede: «TIENDA TRU» arriba a la izquierda de la fecha y otra vez arriba a la derecha.
**Lógica.** El umbral de 4 es por talla y por prenda `[código]`: una talla con 4 en piso y el almacén vacío cuenta igual que una con 0 y 20 atrás; el matiz va en `contexto`, no en la prioridad.
**Utilidad (escenario).** Sábado 16:50, colaboradora nueva. Ve una tarjeta rosada con tres Bodies y chips S, M y L iguales `[visto]`: no sabe si el rosa de cada chip significa «piso en 0» o «queda poco», porque la leyenda es un `title=` que solo aparece con el mouse `[código TarjetaReponerAPiso.tsx:38]`. Para empezar a colgar toca la prenda, y eso **no abre la bajada: filtra la lista de abajo** (`InventarioPanel.tsx:765-770`).
**Conexión.** Los enlaces «Ver recomendaciones» y «Ver análisis de cobertura» se retiraron de esta pantalla (`InventarioPanel.tsx:723-727`: «la cobertura es de Análisis»); quedó sin puente.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | Directo: dice qué reponer, una decisión operativa. Indirecto: es la raíz de la verdad piso/almacén, pero no entrega decisiones comerciales (ventas en una ventana, sin margen, sin rotación) |
| Dinero y stock que toca | ×1 | 8 | Solo lee, pero dispara bajadas y traslados que mueven el stock que Vender luego usa |
| Frecuencia y personas que la usan | ×1 | 9 | Todo el día, cada colaborador de tienda |
| Qué se detiene si falla | ×1 | 7 | La venta no se detiene; se detiene la reposición ordenada y, sin ella, el piso se descuadra del sistema |

Relevancia = (2·6 + 8 + 9 + 7) / 5 = **7.2** → Soporte.

## 6 · Conexión con el ERP
- **Aguas arriba:** `stock` por sububicación (piso / almacén de tienda / cuarentena), `fn_stock_por_sede_json`, ventas del mes por `/api/existencias/ventas-del-mes` (solo al abrir «Resumen disponible», ADR-0303). La regla de piso sale de `politicaDe(sedeId)`, sin excepciones por sede hoy.
- **Aguas abajo:** Bajar al piso (`/inventario/bajar`), Mover mercadería, Recibir, Contar, Etiquetas y Apartados; y Vender, que descuenta del piso.
- **Pájaro dueño y vecinos:** Inventario; vecinos Traslados, Conteo, Frescura del piso, Análisis, Vender.
- **Externos:** ninguno. Si una lectura secundaria cae, la pantalla se degrada así: avisa en ámbar y **no pierde** el stock ni la regla de piso (`[código InventarioPanel.tsx:1006]`).

## 7 · Las 12 tareas, por importancia
### #1 · Mejorar — Ponerle número a «Reponer a piso hoy»
- **Dónde:** `TarjetaReponerAPiso.tsx:57-62` (`prendas.length` ya existe, solo no se pinta) · `InventarioPanel.tsx:765`.
- **Por qué en este puesto:** es la tarjeta por la que existe la pantalla y la única sin cifra. Costo mínimo, efecto inmediato: mide cuánto trabajo queda.
- **Cómo lo verificas tú:** con 2 prendas pidiendo, la tarjeta dice «2 prendas»; con muchas, «N prendas · empieza por estas 3»; y N es el mismo número que da el filtro «Acción: Reponer a piso» en la lista.
- **Esfuerzo / dependencias:** S · ninguna.

### #2 · Mejorar — Un solo botón primario, el del día
- **Dónde:** `page.tsx:179-185` (`btn-secundario` en «Bajar al piso», `btn-primario` en «+ Nuevo traslado»).
- **Por qué en este puesto:** el botón más fuerte debe ser el de la prioridad que la propia pantalla marca. Hoy empuja a mandar mercadería mientras la tarjeta roja pide colgar.
- **Cómo lo verificas tú:** con prendas por reponer, el botón oscuro es «Bajar al piso»; sin ninguna, vuelve a ser «+ Nuevo traslado». Captura a 1440 px.
- **Esfuerzo / dependencias:** S · mejor después de la #1 (usa su mismo conteo).

### #3 · Mejorar — De la tarjeta a la acción: «Bajar estas al piso»
- **Dónde:** `TarjetaReponerAPiso.tsx` (pie de la tarjeta) con `urlBajarAlPiso` y `lineasParaBajar` (`existencias-prendas.ts:128`), que ya arman la bajada con cada talla «por escanear» (no se confirma a ciegas).
- **Por qué en este puesto:** hoy tocar una prenda solo filtra la lista; para colgar hay que dar tres pasos más. Quien ve la tarjeta quiere hacer, no mirar.
- **Cómo lo verificas tú:** tocar «Bajar estas →» abre Bajar al piso con las tallas de esas 3 prendas, todas en «por escanear» y sin cantidad precargada. Solo se dibuja si el rol ve ese módulo.
- **Esfuerzo / dependencias:** S · mejor después de la #1.

### #4 · Mejorar — Desempatar «Reponer» con lo vendido en el mes
- **Dónde:** `existencias-prendas.ts:217-221` (`ordenarPorUrgencia`); el dato: `fn_resumen_variantes_json` (el mismo que usa `/api/existencias/ventas-del-mes`).
- **Por qué en este puesto:** es la respuesta comercial más barata a «Prioridades de hoy». Sin esto, la tarjeta puede mandar a colgar lo que menos sale.
- **Cómo lo verificas tú:** con dos prendas igual de vacías en piso, la tarjeta muestra primero la que más vendió este mes (cuenta, no proyección). Y con ventas en 0 el orden es el de hoy.
- **Esfuerzo / dependencias:** M · **decide Felipe antes**: reabre el DESCARTÉ #3 del ADR-0303.
- **DECIDÍ:** el desempate usa unidades vendidas del mes, sin tocar el umbral de 4. **DESCARTÉ:** una lectura nueva en cada visita (es lo que el ADR-0303 rechazó: suma una tercera lectura pesada a una pantalla que se abre todo el día). **SE ROMPE SI:** el primer día del mes el contador vuelve a cero y las 30 prendas empatadas quedan en el orden de llegada, que es exactamente el criterio de hoy; o si la lectura sube la carga de la página de ~1.200 tallas por visita.

### #5 · Replantear — ¿La capa comercial vive en Existencias o solo en Análisis? (ver sección 8)
- **Dónde:** `InventarioPanel.tsx:723-793` (Prioridades de hoy) · ADR-0303 · módulo Análisis.
- **Por qué en este puesto:** define qué es esta pantalla. Mezclar «qué cuelgo hoy» con «qué compro y qué rematar» la vuelve lenta para el que la abre todo el día y pobre para el que decide. Decide Felipe.
- **Cómo lo verificas tú:** respondiendo la sección 8; la tarea no tiene un cambio de código propio.
- **Esfuerzo / dependencias:** S (decidir) · antes de la #6.
- **DECIDÍ:** recomiendo la opción A de la sección 8 (Existencias sigue siendo el tablero del piso; lo comercial va en Análisis, con un puente). **DESCARTÉ:** la opción B (columnas de ventas, filtro «sin ventas» y «sobrestock» dentro de Existencias) porque entrelaza dos responsabilidades en una pantalla que ya tiene 4 tarjetas, 6 combos, 2 vistas y 4 botones en la cabecera. **SE ROMPE SI:** el equipo de tienda nunca abre Análisis (es de líder) y la decisión comercial de cada sede se queda sin su pantalla.

### #6 · Conectar — Un puente a Análisis para quien lo ve
- **Dónde:** `InventarioPanel.tsx:729-745` (cabecera de «Prioridades de hoy») · `fn_ve_modulo` para el módulo Análisis.
- **Por qué en este puesto:** el ADR quitó los enlaces de cobertura sin dejar reemplazo; quien quiere saber «cómo se vende lo que repongo» hoy tiene que irse por el menú.
- **Cómo lo verificas tú:** con el módulo Análisis, aparece «Cómo se vende esto →»; sin él, no se dibuja (un botón que terminaría en «Sin acceso» no va).
- **Esfuerzo / dependencias:** S · no antes de la #5.

### #7 · Mejorar — Una sola palabra para llevar de almacén a piso
- **Dónde:** `existencias-recomendaciones.ts` (`TEXTO_ACCION_HOY`: «Reponer a piso») · `page.tsx:180` («Bajar al piso») · `CajonPrendaExistencias.tsx:274` («Reponer prenda») · `InventarioPanel.tsx:84` (filtro «Por colgar»).
- **Por qué en este puesto:** el mismo acto tiene cuatro nombres (reponer, bajar, colgar y, al revés, «subir a almacén»). La colaboradora nueva no sabe si son cuatro cosas. Es Brooks: una sola mente diseñó esto; hoy parecen cuatro.
- **Cómo lo verificas tú:** las tres pantallas hermanas (Existencias, Bajar al piso, Conteo) usan un glosario de 2 palabras: una para almacén→piso y otra para piso→almacén. Búsqueda de las otras en `apps/web` sin resultados.
- **Esfuerzo / dependencias:** M · cambia textos de ADR-0231 y de varias pruebas; decide Felipe el glosario.

### #8 · Mejorar — Mostrar el reparto piso/almacén como una barra
- **Dónde:** `InventarioPanel.tsx:752-762` (la línea «126 en piso · 651 en almacén»).
- **Por qué en este puesto:** el 84 % del stock está en el almacén `[visto: 651 de 777]` y la pantalla lo dice en letra chica taupe. En el piloto de TRU eso probablemente sea la carga inicial aún sin colgar `[inferido]`, o es sobrecompra: en cualquier caso es el dato más comercial de la captura.
- **Cómo lo verificas tú:** una barra de dos tonos (tokens de `globals.css`) con 16 % / 84 %; que sume el mismo 777; en Taller (sin piso/almacén) no se dibuja.
- **Esfuerzo / dependencias:** S.

### #9 · Mejorar — Que las tarjetas en cero se encojan *(decide Felipe: es su diseño aprobado)*
- **Dónde:** `InventarioPanel.tsx:773-791` y la rejilla de `749`.
- **Por qué en este puesto:** dos de cuatro cifras en 0 no merecen la mitad del ancho; liberar ese alto sube la lista al primer pliegue (hoy el buscador apenas asoma `[visto]`).
- **Cómo lo verificas tú:** a 1440×768, con traslados y dañadas en 0, la primera prenda de la lista se ve sin hacer scroll; con algo que atender, la tarjeta recupera su tamaño.
- **Esfuerzo / dependencias:** M · después de la #5.

### #10 · Mejorar — Leyenda de los colores de las tallas
- **Dónde:** `TarjetaReponerAPiso.tsx:24-33` (`TONO_TALLA`) y `:38` (el `title=`).
- **Por qué en este puesto:** el significado vive solo en un `title=` que no existe en pantalla táctil, y en la captura las 9 tallas son del mismo tono.
- **Cómo lo verificas tú:** una línea bajo la lista: «● sin nada en piso · ● queda poco»; visible a 375 px y a 1440 px sin pasar el mouse.
- **Esfuerzo / dependencias:** S.

### #11 · Corregir — Unidades y «prenda» consistentes
- **Dónde:** `InventarioPanel.tsx:752,773,781` (`uds` / `unidades` / `prendas`).
- **Por qué en este puesto:** tres unidades en una fila de cifras hacen dudar si se suman. Y «prenda» ya es modelo + color en la lista.
- **Cómo lo verificas tú:** las tres tarjetas usan una unidad cada vez que cuentan lo mismo; «prendas» solo cuando es modelo + color. Revisar el cómputo de «Incidencias» (`danadosPendientes.length`): si cuenta registros y no unidades, la etiqueta miente `[no verificable]`.
- **Esfuerzo / dependencias:** S.

### #12 · bajo valor — La sede dos veces y el nombre «Resumen disponible»
- **Dónde:** eyebrow de `EncabezadoPagina` y barra superior (`TIENDA TRU` repetida) · `InventarioPanel.tsx:752`.
- **Por qué al final:** estorba poco. Pero «Resumen disponible» es jerga; el ADR-0303 llama «Hay en la tienda» a lo mismo, y es más claro para quien no tiene formación técnica.
- **Cómo lo verificas tú:** la sede aparece una vez en la cabecera; la primera tarjeta usa el nombre que dice la ventana que abre.
- **Esfuerzo / dependencias:** S · opcional.

## 8 · Estrategia alternativa — ¿dónde vive lo comercial?
| Opción | Ganas | Pagas |
|---|---|---|
| **A. Existencias = tablero del piso; lo comercial en Análisis, con un puente (#6)** *(recomendada)* | La pantalla de todo el día sigue rápida y sin ruido; cada pantalla tiene una sola responsabilidad (Hickey) | Un clic de más para el líder; requiere que Análisis responda «qué se vende y qué no» sin salir de ahí |
| **B. Subir la capa comercial a Existencias** (ventas del mes por talla, filtro «sin ventas 30 días», «sobrestock») | Todo en un lugar | Una pantalla con 6 combos y 4 tarjetas más pesada; el colaborador carga con lo del líder; reabre ADR-0303 |
| **C. Dos pantallas: «Hoy en el piso» (tarjeta + lista, sin cifras) y «Existencias» (consulta completa)** | Cada rol ve lo suyo | Es un módulo nuevo (ADR-0306: un módulo es una entrada del menú) y un segundo sitio donde mantener la regla de «reponer» |

**Si no respondes:** no toco nada. Este análisis solo propone; ejecutar las #1 a #3 es un paso aparte que ordenas tú.

## 10 · Fuera de esta pantalla
**«126 en piso» es una afirmación del sistema, no un conteo, y esta pantalla no dice cuánto confiar en ella.** Todo lo que la pantalla decide («Reponer», las tallas rosadas, las 3 prendas) sale de que el piso del sistema sea el piso real. El «vista de las 16:50» le dice a quien mira cuándo se cargó la página, no cuándo se contó el piso por última vez. En el menú existe «Frescura del piso» `[visto]`, pero Existencias no la usa: no hay ni una ocurrencia en `InventarioPanel.tsx` ni en `page.tsx` salvo el nombre del filtro «Por colgar» `[código]`. Si el colaborador cuelga sin registrar la bajada, la tarjeta sigue pidiendo reponer lo que ya está en la percha, y quien vende deja de confiar en ella. Según mis notas de sesiones anteriores, la señal de disciplina de registro del ADR-0208 está diseñada y espera tu decisión: `[no verificable]`, confírmalo antes de planear algo encima.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:inventario]` #1 Número en «Reponer a piso hoy» — S
- [ ] `[pantalla:inventario]` #2 Un solo botón primario, el del día — S
- [ ] `[pantalla:inventario]` #3 «Bajar estas al piso» desde la tarjeta — S
- [ ] `[pantalla:inventario]` #4 Desempatar «Reponer» con lo vendido del mes (reabre ADR-0303; decide Felipe) — M
- [ ] `[pantalla:inventario]` #5 Decidir dónde vive la capa comercial (sección 8) — S
- [ ] `[pantalla:inventario]` #6 Puente a Análisis — S
- [ ] `[pantalla:inventario]` #7 Glosario único almacén↔piso (decide Felipe) — M
- [ ] `[pantalla:inventario]` #8 Barra piso/almacén en «Resumen disponible» — S
- [ ] `[pantalla:inventario]` #9 Tarjetas en cero se encogen (diseño aprobado: decide Felipe) — M
- [ ] `[pantalla:inventario]` #10 Leyenda de los tonos de talla — S
- [ ] `[pantalla:inventario]` #11 Unidades coherentes y revisar «Incidencias» — S
- [ ] `[pantalla:inventario]` #12 Sede repetida y «Resumen disponible» → «Hay en la tienda» (bajo valor) — S

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | completo | 5/10 (promedio 6.0, con tope 5) | 7.4 — Soporte | primer análisis (pantalla anterior al #445) |
| 2026-09-26 (tarde) | completo, sin SQL | 5/10 (promedio 6.3, con tope 5) | 7.8 — Soporte | Sobre el PR #500 (`ffa5d52b`). **Cerradas:** #2 (el #445 se fusionó), #3, #4 y #5 (buscador con marca, filtro Marca y vacío que explica: están en el código). **Superadas por el rediseño:** #8 y #11. **Siguen abiertas:** #1, #10, #6, #7, #9 y #12. |
| 2026-10-03 | **rápido**, sin SQL (no comparable con las filas completas) | 6.7/10 (promedio 6.7, sin tope: escrituras sin revisar) | 7.2 — Soporte | Las 12 del análisis del 09-26 figuran ✅ en ese archivo (todas fechadas 2026-09-26). Este análisis **las reemplaza** porque la pantalla se rehízo (`InventarioPanel.tsx` +949/−696 líneas desde `ffa5d52b`): no se tomaron como base. |
