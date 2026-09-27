# DECISIONES — ronda de 60 preguntas del menú, Comercial y salida en TRU (2026-09-21)

**Quién decide:** Felipe, en 15 bloques de 4 preguntas (`AskUserQuestion`, opción
recomendada primero, con Ganas/Pagas), durante la sesión de la rama
`claude/cayla-menu-pajaros-aviario-1f2c50`. Continúa la numeración de
[`DECISIONES-2026-09-12.md`](DECISIONES-2026-09-12.md) (hasta D-52); **ese archivo
manda sobre este si hay contradicción** — aquí solo se afina o se ejecuta lo que allá
quedó abierto (D-31, D-46, D-48). Registro completo en la memoria de sesión
`cayla-decisiones-60-preguntas-2026-09.md` (fuera del repo); este documento es la
versión que vive con el código, per CLAUDE.md principio 8.

**Por qué esta ronda:** el 2026-09-20 Felipe pidió «~60 preguntas en bloques» para
afinar el rumbo antes de desplegar entre 24 y 36 agentes de una vez (Bloque 15). Cada
decisión de abajo es la especificación de la que un agente parte — no un resumen
posterior.

---

## A. Salida en vivo en TRU esta semana (prioridad 1, Bloques 1–2)

**D-53 · Fecha y forma de salida** → **esta semana, con el menú y lo que hay hoy**, sin
esperar los pasos 2/3 del menú (celular, colaborador plano). Equipo de 5–6 trabajando
todo el día: **ningún cambio visible del menú se fusiona mientras el equipo de TRU
está en turno**, solo cuando Felipe lo decide.

**D-54 · Datos de prueba en producción** (14 boletas/ventas pendientes, 3 cajas
abiertas, 3 conteos anulados, productos BLU/PAN/VES de prueba) → **se archivan con
marca «prueba», nunca se borran** (el historial de movimientos está protegido por
trigger). No son riesgo tributario: son datos ficticios de prueba.

**D-55 · Censo formal** → **no por ahora.** La mercadería entra «poco a poco», con
boleta, y se corrige sobre la marcha. Baja prioridad de 06 Lechuza.

**D-56 · Quién emite cada venta** → **cada venta elige quién emite**, con **«La emite
Alegra» por defecto**: retail registra venta, stock y caja sin reservar boleta ni
dejar pendiente. «La emite retail» es la opción para probar en momentos tranquilos;
hoy retail reserva boleta en cada venta y la deja pendiente, con el ticket diciendo
«pendiente de validación en SUNAT».

**D-57 · Cuándo cambia el valor por defecto a «La emite retail»** → **cuando Felipe
sienta confianza, sin criterio escrito** (se apartó de la recomendación de un criterio
medible). Mitigación del arquitecto, no pedida por Felipe: mostrar un termómetro
visible de boletas emitidas por retail aceptadas/rechazadas por SUNAT, para que la
confianza tenga con qué apoyarse.

**D-58 · Ingreso de mercadería** → **«ingreso sin comprobante»**, comprobante
opcional (la mercadería ya existe). El costo se pide, pero **puede quedar «pendiente
de costo»**: marcado y visible en una lista que baja sola; el margen se enciende
prenda por prenda al completarlo. No frena la carga de esta semana.

**D-59 · Cierre de caja** → **un líder de turno cierra cada noche** (ADR-0143, ya
aplicado en producción). **Sin pantalla de cuadre con Alegra:** «cuadrar al milímetro
no me interesa» — el mínimo viable de este ERP es reemplazar a Alegra, no calzar con
él.

**D-60 · Transmisión a SUNAT de lo que emite retail** → **automática al cobrar, con
reintento** si el proveedor (Lucode) o SUNAT no responden (D-8 Vogels: todo falla,
todo el tiempo). Cola visible; si pasan horas sin transmitir, avisa al líder.

**D-61 · Doble digitación en hora punta** (con Alegra emitiendo, cada venta se
registra también en retail) → **sin regla todavía: «por ahora solo estamos entrando a
piloto»**. Se decide con lo observado en TRU esta semana, no de antemano. Riesgo
señalado por el arquitecto: la asesora puede saltarse retail en la fila y desalinear
stock y caja — vigilar antes de fijar una regla.

---

## B. Asesora, desempeño y reconocimiento (Bloques 5–9, 13)

**D-62 · Asesora por venta** → cada venta lleva una **referencia de quién atendió**;
el sistema **sugiere a quienes están de turno** en la sede de la sesión, leyendo la
asistencia de Dynamic. Verificado en producción el 2026-09-21: viva para TRU y AQP;
**Tienda LIM (sede `003`) no tiene nada cargado** (0 personas, horarios, marcas) —
cargar personas y terminal de esa sede antes de encender la sugerencia allí. La
sugerencia **nunca es un filtro duro**, siempre lleva «Otra persona» (3% de marcas de
terminal llegan con más de 10 min de retraso). Contrato de lectura propuesto:
`retail.fn_asesoras_de_turno(p_ubicacion_id uuid)` SECURITY DEFINER, exige
`fn_puede_operar_ubicacion`, une por `uuid` (nunca por código — Taller y Tienda LIM
comparten código `LIM`/`003` en Dynamic), usa
`(now() at time zone 'America/Lima')::date`, devuelve solo persona y estado
(presente/en_pausa/salió/programada) — **nunca horas exactas ni motivo de pausa**
(hay marcas de tipo médico/trámite/personal).

**D-63 · Métricas por asesora** → descuentos aplicados (efectividad sin lastimar
margen), ventas en S/ y en prendas, ticket promedio y UPT, cumplimiento de meta,
recompra, margen generado (cuando haya costo), stock estancado movido,
devoluciones/cambios sobre lo vendido, % de ventas a precio pleno.

**D-64 · Bonificación** → **retail calcula el número, Dynamic lo paga.** **Metas:
mensual por tienda, el líder la reparte.**

> **Actualización (2026-09-26, Felipe; D-125 en `DECISIONES-2026-09-26-rendimiento.md`, ADR-0219):** la meta por persona **todavía no** se construye. El módulo
> Rendimiento muestra el avance de la tienda contra su meta del mes y cuánto aportó cada persona. El reparto se retoma el
> día que la colaboradora pueda ver sus cifras. *El texto de arriba se conserva como quedó el 2026-09-21.*

**D-65 · Fase de bonificación con la que se arranca** → **solo reconocimiento, sin
dinero por ahora.** Felipe: «déjame pensar bien lo del bono para no cometer un error o
mal acostumbrar a nuestro equipo». Investigado 2026-09-21: un bono con fórmula y
regularidad es remuneración en el Perú aunque se llame liberalidad (D.S. 003-97-TR,
art. 6) y entra a gratificaciones, CTS y aportes; quitarlo después puede ser
hostilidad laboral (art. 30.b). **Antes de pagar cualquier bono en dinero: consulta
con abogado laboralista** (preguntas preparadas: régimen de CAYLA, pozo de tienda de
90 días, reducción inmotivada, premio en especie, efecto en planilla). Mientras
tanto: **empezar a guardar desde el primer día de TRU** — asesora que vendió y quien
asistió por boleta, descuento (monto, %, quién autorizó, motivo), cambio/devolución
enlazado a la boleta original con días y motivo, costo por variante con fecha,
anulaciones y reasignaciones, dotación por turno. Sin estos datos limpios desde el
día uno, ninguna decisión de bono en 90 días tiene con qué apoyarse.

**D-66 · Reconocimiento (sin dinero)** → **top 3 móvil** (ventana de 3 meses, mínimo
40 ventas) **con categorías rotativas — no solo ventas**: también número de clientas
nuevas identificadas y clientas que vuelven (recompra). Un ranking simple del mes
premia el azar con 30–80 ventas por persona al mes. El líder ve el global de su sede
con la muestra (n) al lado; el top 3 es lo único visible entre compañeras.

> **Actualización (2026-09-26, Felipe; D-115 y D-121 en `DECISIONES-2026-09-26-rendimiento.md`, ADR-0219):** el período es el **mes calendario**. Para que ese mes no premie el azar,
> cada persona lleva el número de ventas al lado y la marca «muestra chica» con menos de 40 ventas, el umbral de esta
> decisión. Hay **dos rankings**: soles por hora trabajada y número de ventas. **El top 3 visible entre compañeras queda en
> pausa**, porque por ahora las colaboradoras no ven el módulo (ver D-68). Clientas nuevas y recompra no se pueden medir
> todavía: el Punto de venta no guarda la clienta en la venta. *El texto de arriba se conserva como quedó el 2026-09-21.*

**D-67 · Descuento en caja** → **tope por rol**; más de eso lo autoriza el líder (con
su clave o cuenta), y queda registrado quién y por qué. Es el dato que hace posible
D-63 sin lastimar margen. Topes exactos (ej. asesora ≤10%, líder ≤20%) los fija
Felipe en el momento de construir.

**D-68 · Quién ve las métricas de quién** → cada colaboradora ve las suyas; el líder,
las de su sede; Felipe, todas. Nunca entre compañeras salvo el top 3 (D-66).

> **Actualización (2026-09-26, Felipe tras hablarlo con el gerente; D-113 y D-114 en `DECISIONES-2026-09-26-rendimiento.md`,
> ADR-0219):** **por ahora las colaboradoras no ven el
> módulo**, ni siquiera sus propias cifras: «esto generaría más caos actualmente». Lo ven dos niveles:
> - **Los 5 Admin ven todas las tiendas.** Los Líderes que no son Admin no las ven.
> - **La encargada ve solo su tienda.** Es encargada quien tiene un rol de Roles y accesos con el módulo encendido.
>
> *El texto de arriba se conserva como quedó el 2026-09-21.*

**D-69 · Alcance de cada líder** → **cada líder acotado a su sede, más las que Felipe
le asigne** (resuelve R-48/D-14, pendiente desde ADR-0143). Se aplica **después** de
la salida en TRU, nunca mientras el equipo trabaja.

**D-70 · Alta de colaborador nuevo** → **el líder de su sede, o Felipe, aprueba el
alta**; no es automática aunque la persona ya tenga función de servicio en Dynamic.
La baja **sí es automática**: si Dynamic marca a la persona inactiva, retail deja de
dejarla entrar.

---

## C. Cómo se lee lo comercial (Bloque 7–8)

**D-71 · Pulso del día vs. fundamentales** → **nunca en la misma pantalla.** El pulso
(hoy/semana: ventas contra meta, ticket, top 3, alertas) vive en **Inicio**. Los
fundamentales (mes/trimestre/12 meses: margen % con tendencia, días de stock y %
estancado, % a precio pleno, devoluciones y recompra por cohorte, deuda con
proveedores y sus vencimientos, flujo operativo) viven en una **fila propia
«Comercial»**. Regla anti-ruido: un fundamental se marca en rojo solo si sale de su
rango de los últimos 6–12 meses, nunca por un mal día; se compara siempre contra el
mismo mes del año anterior (estacionalidad: Día de la Madre, Fiestas Patrias,
Navidad). El «balance» que muestra retail es una **posición operativa** (inventario al
costo + efectivo − por pagar), no el balance contable — el contador sigue jalando de
SUNAT (D-3 de la ronda anterior).

**D-72 · Flujo de caja** → cobros por método (efectivo/tarjeta/Yape/Plin) menos pagos
a proveedores, **más un saldo de bancos que Felipe teclea cada semana**. El
arquitecto advirtió el riesgo (un saldo viejo es peor que ninguno) y mitiga con
diseño: el saldo muestra su fecha y se marca «vencido» pasados ~10 días, con aviso a
Felipe.

**D-73 · Inicio por rol de cuenta** → no hay un Inicio genérico: Felipe generalizó el
principio ya fijado para Admin (D-52, las 3 tiendas y el Taller juntos) a **todos los
roles**. `permisosDe(rol)` (ADR-0144) sigue siendo el único lugar donde el rol se
traduce a permisos; cuando nazca el rol Admin, ahí se agrega, sin tocar el árbol del
menú. La integrante ve su día; el líder, su sede; Admin, el conjunto.

**D-74 · Alertas de producto nuevo y reposición** → primero al **equipo y al líder**,
dentro del sistema (tope de un aviso emergente por persona al día, el resto a una
campana); a las **clientas por WhatsApp después**, cuando exista la ficha con
consentimiento (D-75).

**D-75 · Búsqueda y atajos** → `/buscar` desde la lupa del celular encuentra
**productos y clientas identificadas**, y **qué encuentra depende del tipo de
cuenta** (mismo principio que D-73). En escritorio, **paleta de comandos (Ctrl+K)
ahora**, junto con la lupa del celular — un solo mecanismo de búsqueda para las dos
plataformas.

---

## D. Clientas, fidelización y calidad de atención (Bloque 9, resuelve D-48)

**D-76 · Cómo se pide el dato en caja** → **DNI opcional, un solo campo**, y
**WhatsApp con permiso aparte** (Ley 29733: el consentimiento de contacto es distinto
del dato transaccional). «No queremos ser invasivos ni poner tantas trabas» — Felipe.
Meta modesta de identificación (30–40% de las ventas); nunca se paga ni se rankea por
identificar (induce DNI inventados).

**D-77 · Fidelización, versión 1 (sin puntos)** → ficha viva: talla guardada,
cumpleaños (día y mes), aviso «llegó tu talla», ajuste de taller, cambio sin fricción.
Investigado 2026-09-21: los puntos ajenos devuelven 0,5–3% y su efecto en recompra es
débil; niveles por gasto con acceso (no descuento permanente) y saldo/referidas
quedan para una versión 2, con meses de ventas con DNI y validación del contador.
**Historial de compras en la ficha** (últimas compras, talla) nace junto con esta
ficha, no antes — depende de tener clienta identificada.

**D-78 · Calidad de atención, esta ronda** → **encuesta de 1 toque por QR en el
ticket** (valoración por tienda; por persona solo con 30+ respuestas en ventana de 6
meses — con 5–17 respuestas al mes un puntaje individual es ruido), **reclamos y
cambios a tiempo** (Libro de Reclamaciones: 15 días hábiles, Ley 29571), **tiempo de
cobro por tienda** (nunca por persona: mide la caja, no la fila). Quedan para después:
recuperación con dueño y plazo, traslado a pedido con promesa fechada, visita
incógnita. **No medir todavía:** ranking o bono individual por calificación o
devoluciones (premia el azar con esta muestra y es manipulable), NPS comparado entre
sedes, conversión de probador.

**D-79 · Dos ideas de calidad que sí entran en la construcción de esta ronda:**
- **Pedido no atendido en 1 toque:** la asesora anota «pidió modelo/talla y no
  había»; alimenta el aviso «llegó tu talla» (D-77) y le dice al Taller qué cortar.
- **Motivo del cambio en 1 toque:** al cambiar o devolver, motivo obligatorio (talla,
  calce, defecto, no le gustó, regalo) → «calce por prenda» para revisar con el
  Taller. **Nunca usarlo para rankear asesoras** — desalienta el cambio, que debe ser
  sin fricción (D-77).

---

## E. El Taller como negocio propio (Bloque 10–11, ejecuta D-31/D-47)

**D-80 · «Despacho a tiendas» y D-31** → **sigue siendo un traslado real**, sin
boleta ni venta interna, con guía de remisión (D-83). Felipe pidió poder **«gestionar
cada negocio de manera independiente» y a la vez tener «un resumen global integrando
todo»**; se resuelve con una **vista por negocio**, no con una venta interna: el
Taller ve un **ingreso simulado** = prendas despachadas × la cotización de maquila
externa del tipo de prenda (D-82); las tiendas ven esa misma cifra como su costo de
referencia. El total consolidado de CAYLA es idéntico en las dos vistas — el precio
solo mueve margen entre el Taller y las tiendas, y ese precio nunca lo fija Felipe
(nace del mercado), que era la razón por la que D-31 descartó la venta interna.

**D-81 · Costo de la prenda del Taller** → **automático desde los insumos
consumidos** en la orden (tela descontada al cortar, D-47) + mano de obra del modelo
(`productos.costo_mano_obra`) + maquila real de la corrida. Reemplaza el tecleo manual
de hoy en `cerrar_produccion` — condición para que D-31 sea medición y no estimación,
tal como ya lo pedía D-47.

**D-82 · Referencia de maquila externa** (la otra mitad de D-31, hoy sin dónde
guardarse) → **una cotización por tipo de prenda** (blusa, pantalón, vestido…), con
fecha; se renueva cada ~6 meses y el sistema avisa cuando vence.

**D-83 · Guías de remisión electrónicas** → **segunda etapa**, tras el primer mes de
boletas en TRU. Mientras tanto, campo opcional en el traslado para anotar el número
de guía hecha donde se hace hoy.

**D-84 · Menú de Producción, deuda de 7 hijas** (desde PR #231, tope 6) → se agrupan
Proveedores, Comprobantes, Recibir y Por pagar del Taller bajo un nuevo grupo
**«Abastecimiento»**; Producción queda en Resumen, Órdenes, Insumos, Abastecimiento —
con lugar para Eficiencia (F7). Se aplica cuando Felipe decida, nunca mientras el
Taller está en turno.

---

## F. SUNAT — decisiones técnicas del arquitecto (sin pregunta, Bloque 12)

**D-85 · Series** → retail usa **series propias por tienda** desde el día que emite
(no comparte numeración con Alegra: cruzar series duplicaría o saltaría
correlativos).

**D-86 · Notas de crédito** → **la emite quien emitió la boleta original**: si la
boleta la emitió Alegra, la nota de crédito se hace en Alegra, no en retail (evita
una nota de crédito de retail contra un comprobante que SUNAT no vinculará).

**D-87 · Cambios cuando la boleta original es de Alegra** → retail guarda el número
de boleta de Alegra como **campo opcional**, solo para ubicar la venta al hacer un
cambio; no intenta reconciliar montos con Alegra (D-59: sin cuadre).

---

## Resumen de investigación externa (2026-09-21, agentes de solo lectura)

Fuentes completas y URLs en la memoria de sesión. Resumen aplicado arriba:

- **Asistencia de Dynamic**: ver D-62. Documentación desactualizada detectada:
  `docs/datos/14-DYNAMIC.md` describe vistas `retail.personas`/`retail.sedes` que ya
  no existen (hoy son `retail.ubicaciones`/`retail.colaboradores`) — **corregir antes
  de escribir la migración de D-62**.
  `docs/datos/14-DYNAMIC.md`.
- **Fidelización**: ver D-77.
- **Calidad de atención**: ver D-78–D-79.
- **Bono/desempeño**: ver D-65. Marco legal peruano citado (D.S. 003-97-TR, Ley
  27735, D.S. 001-97-TR) — **no es asesoría legal**, confirmar con abogado
  laboralista antes de pagar cualquier bono en dinero.

## Cómo ejecuta el arquitecto esta ronda (Bloque 15)

**D-88 · Alcance de la primera tanda de agentes** → **todo lo decidido arriba**, en
una sola tanda (Felipe se apartó de la recomendación de limitar a la salida de TRU).
Mitigación de diseño: cada agente trabaja en un worktree propio, ramificado desde
`origin/main` en el momento de arrancar (nunca desde una rama vieja), y las piezas
que tocan el mismo archivo (`apps/web/lib/menu.ts`) o la misma tabla de producción se
secuencian, no se paralelizan a ciegas.

**D-89 · Entregables** → **un PR por tema/bloque** (no uno gigante, no uno por
agente), revisable solo. Cada PR que decide algo estructural nuevo trae su propio ADR
en `docs/adr/`, como ya es la norma del repo.

**D-90 · SQL en producción** → **ningún agente aplica nada en producción.** Cada
migración se deja preparada (con el prefijo `retail.` solo al pegar, nunca en el
archivo del repo) y espera la aprobación de Felipe; el arquitecto la aplica con el
protocolo de ensayo ya usado en el candado de líder (ensayo que termina en excepción
a propósito, verificación con roles reales).

**D-91 · Verificación** → cada agente entrega **evidencia en navegador** (no
«debería funcionar») más la suite existente en verde; el arquitecto revisa con
cuidado extra lo que toca dinero o candados (caja, descuentos, SUNAT, roles).
