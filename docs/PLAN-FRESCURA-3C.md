# PLAN — Frescura del piso, paso 3c (ADR-0208, ADR-0246, ADR-0248)

> **Estado al 2026-09-27 (tarde).** Pasos 1 y 2 fusionados (#534, #537) y **pegados en producción** (verificado:
> `fn_ledger_puntos` = `a3d9fb69…`, `fn_bajadas_del_piso` = `34a7e0cc…`, `fn_bajadas_del_piso_nucleo` = `fcfd2c4b…`).
> **El paso 3 está construido y sin pegar** (las migraciones son `20260928120300_frescura_lectura.sql`,
> `20260928120310_frescura_lectura_revision3.sql` y `20260928120320_frescura_lectura_revision7.sql`, en ese orden y sin
> el módulo: decisión 4). Lo que quedó: ADR-0208, «Paso 3 construido». Las revisiones 3 a 6 entraron a main con el PR
> #544; la revisión 7 (las preguntas 7 y R7-1, decididas por Felipe el 27-sep, y los otros cinco hallazgos corregidos)
> va en la misma rama, en un PR nuevo. El orden de pegado con sus md5 y lo que queda para la pantalla: ADR-0208,
> «Revisión 7 del paso 3». **Sigue el paso 4.** Este archivo es el plan escrito el 27-sep; donde choque con
> las decisiones de abajo, **mandan las decisiones** (ADR-0208, «Actualización 2026-09-27 — diseño 3c»).

## Decisiones de Felipe y técnicas que corrigen el plan (2026-09-27)

1. **Menú: Frescura directo en Inventario** (6.ª fila), no el subgrupo «Diagnóstico». Excepción escrita al tope:
   `EXCEPCIONES_TOPE_HIJAS = { inventario: 7 }` solo para el rol que ve Análisis + Frescura + Recibir sin Compras.
2. **«Envejecida» = más lenta que su categoría en su sede, SIN partir por mitad del año.** La curva (Kaplan-Meier,
   P50/P75/P90) es de **categoría × sede**. La temporada solo da el aviso aparte «Temporada pasada» (estación de la
   última llegada) y dice qué es clásico (los clásicos se miden contra su propia historia). Prendas sin temporada: se
   miden igual, sin aviso de fin de estación, con el chip «Sin temporada · complétala». `mitad` ya no se usa.
3. **Indicador de la Terminal de ventas: en Caja, con los botones del 3b.** El paso 6 pasa al 3b; `registro_piso` nace
   con la tarjeta. En el 3c el indicador lo ve solo el líder, en Frescura.
4. **El módulo `frescura` nace con la PANTALLA (paso 4), no en el paso 3** (técnica, 27-sep): Roles y accesos no debe
   ofrecer un módulo que no muestra nada (misma razón que `registro_piso`). En el paso 3 las lecturas exigen
   `fn_es_lider()` (o `fn_ve_modulo('frescura')` si esa función tolera una clave que aún no existe) + operar la sede; el
   cambio de candado de `fn_bajadas_del_piso` también va en el paso 4.
5. **Regla de bajadas (paso 2, ya en producción):** piso de antes = nivel justo antes + retiros de [t−10, t); cada retiro
   se descuenta de UNA bajada (la más cercana; empate → la anterior). Nunca culpar a quien corrige.
6. **Pendiente antes del paso 3 (ADR-0208 «Revisión 3»):** 13 mutantes vivos en `frescura_bajadas.mjs`; y T33: el
   indicador del mes debe contar solo bajadas cerradas de hace más de 2W para que la cifra no se mueva después de
   mostrarse.

---


**Dónde va:** en Inventario ▸ Diagnóstico ▸ Frescura del piso, ruta `/inventario/frescura`. «Diagnóstico» es un subgrupo nuevo que junta Análisis y Frescura del piso. Hace falta porque no cabe como hija suelta:
- La prueba pone un tope de 6 hijas por grupo (`apps/web/lib/menu.test.ts:218,241-244`) y lo revisa en todas las combinaciones de permisos.
- Esos perfiles de prueba no traen módulos, así que un nodo que solo depende de su módulo sale siempre (`menu.ts:478-487`). Con Existencias, Movimientos, Traslados, Conteo, Análisis y Recibir (`menu.ts:292-300`), Frescura suelta sería la séptima.
- El molde es Posventa (`menu.ts:278`). Si un rol solo ve Análisis, el subgrupo se deshace y la ve con su nombre de siempre (`menu.ts:531-537`).

**Base:** leí `origin/main` en `0514170a`. El #525 (Análisis) **ya está fusionado**, así que la restricción de no tocar sus archivos ya no aplica. También hice consultas de solo lectura en producción el 2026-09-27. No edité nada.

---

## 0. Veredicto: base A con injertos de B y correcciones a los dos

**Base: el diseño A.**
- Hace una sola lectura por sede. El fin de estación se calcula en SQL.
- El registro se descuenta de los retiros, como exige ADR-0208:569-582.
- La marca de «edad desconocida» va en el evento.
- El indicador de registro se calcula en SQL, así que la pantalla del líder y la tarjeta de la terminal usan la misma definición.

**Lo que se toma de B:**
- El menú sin permiso nuevo. Mismo patrón que Apartados: la visibilidad la da el módulo.
- Toda la pantalla: cabecera de cada grupo explicando la referencia en palabras, frase de acción, hoja de detalle, tabla de casos sin datos, tabla «Las 3 tiendas» y la versión de 375 px.
- La rapidez y `estaQuieta`, que es «vieja **y** lenta» y no solo «vieja»: una prenda que es pilar de venta nunca debe ir al perchero de oportunidades.
- Corregir los documentos atrasados.

**Correcciones, verificadas en código o en producción:**
1. **Los dos cuentan las bajadas de la carga inicial dentro del indicador de registro.** En TRU son 95 de 199 unidades bajadas (15 filas del 26-sep, medido). No dicen nada del hábito del equipo y lo inflarían al doble. Salen del indicador (columna `es_carga_inicial` en el núcleo).
2. **A agrega el permiso `verFrescura`.** Sobra: duplica el módulo y duplica los perfiles de `menu.test.ts:127-129`. Se usa `modulo: "frescura"` sin `exige`.
3. **A calcula los días colgada por días calendario** (`diasExposicionComercial`, `existencias-ritmo.ts:65-105`). Esa función cuenta la jornada entera, con un sesgo de hasta +1 día. La vara, en cambio, sale de segundos por el FIFO. Se mide en tiempo continuo: Σ de los tramos con piso > 0, sumando todas las tallas.
4. **B trata la rapidez sin dato como «lenta».** Mandaría al perchero a un éxito de venta que vino en la carga inicial. Sin dato, la frase queda en «revisa sus ventas» y nunca se habilita «Trasladar».
5. **A dice que el cambio en el núcleo de bajadas da «64/64 iguales»,** pero a la vez cambia `piso_antes` y agrega `corregida`: eso contradice el 64/64. Se parte en dos pasos. Primero un refactor idéntico, que sí debe dar el mismo resultado en todos los casos. Después el cambio de conducta, con la lista explícita de lo que cambia.
6. **A crea el módulo `registro_piso` en 3c.** Roles y accesos ofrecería un módulo que no muestra nada. Nace junto con la tarjeta.
7. **B pinta Crítica en rojo en cada fila.** Choca con `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`) y con el precedente de «un vencido no es falla» (`facturacion-codigos-reglas.ts:66`). El rojo va solo en la cifra de cabecera «Críticas». En las filas, el chip ámbar dice la palabra y la barra marca la posición. Se decide en la maqueta.
8. **A inventa `clavePrenda`, pero ya existe** (`analisis-que-hacer.ts:119`, con alternativa al nombre del color). Se extrae una sola definición.
9. **B hace una segunda llamada, `fn_ocurrencias_temporada`,** y usa un simple sí/no de «exhibida antes». A lo resuelve dentro de la misma lectura y con la fecha real.
10. **Falta en los dos:** excluir los productos marcados como prueba (`productos.es_prueba`, `20260922130000:97`).

---

## 1. Hechos medidos en producción (27-sep, solo lectura) que cambian el plan

- **Volumen:** 138 movimientos y 7 ventas, todo en TRU. Las **54 de 54 prendas no tienen temporada**.
- **El libro cuadra:** 0 de 45 variantes del piso y 0 de 78 del total tienen saldo inicial distinto de 0, y 0 de 84 filas de stock no tienen movimiento. El chequeo pendiente de `BACKLOG.md:886` pasa.
- **Lo que entró al piso de TRU:**
  - 104 unidades por bajadas normales (25 filas, 24 al 26-sep);
  - 95 por bajadas de carga inicial (15 filas, 26-sep);
  - 12 por ajuste de reposición.
  - Total: **el 51 % no tiene fecha real de colgado.**
- **Huellas de las funciones vivas:** `fn_bajadas_del_piso` = `91e2d0c1…` y `fn_ledger_puntos` = `6e46fe4f…`. Todavía no existen los módulos `frescura` ni `registro_piso`.
- **Producción no está al día con `main`:**
  - El #409 se fusionó sin su migración `20260925220000`.
  - No existe el módulo `inicio`, `guardar_modulos_rol` tiene 3 argumentos y no existe `roles.pantalla_principal`.
  - La web de `main` llama a esa función con 4 argumentos (`roles-acciones.ts:36-43`).
  - La **Terminal Almacén sigue sin `bajada_piso`**, que es urgente desde ADR-0240.

---

## 2. Pasos (un PR por paso, terreno primero)

### PASO 1 · Terreno del dominio (PR «inventario»)

**a) Documentación**
- ADR-0248, «Cohortes del piso: FIFO por antigüedad y edad desconocida». Es el cambio de dominio que exige ADR-0208:651-652. El número está libre en todas las ramas remotas.
- «Actualización 2026-09-27 — diseño 3c» dentro de ADR-0208.
- Corregir ADR-0246:3-4, que todavía dice «sin pegar».

**b) `refactor(inventario)`**
- El FIFO consume las cohortes por su fecha (`ts`), no por el orden del arreglo (`inventario-exposicion.ts:104,125`).
- **Bug verificado:** cuando una cohorte se parte, el pedazo va al final (`:109,:136`). Una cohorte pausada con fecha 1 que vuelve en parte, con otra cohorte de fecha 5 activa, hace que la venta consuma la de fecha 5.
- Mueve las cifras de Análisis solo donde hubo pausas.

**c) `feat(inventario)`: `historiaDeCohortes(eventos)`, que solo agrega**
- Devuelve `{cohortes, salidas[{tipo: venta|perdida, cantidad, segundosExpuesta, edadDesconocida, ts}]}`.
- `armarCohortes(e) ≡ historiaDeCohortes(e).cohortes`, con una prueba de propiedad sobre los casos actuales.
- `EventoPiso` suma `oid?` y `edadDesconocida?`, que se hereda al partir una cohorte.
- Se corrige el comentario de `:17-18`: la señal hoy es `fn_es_traslado_interno`.

**d) SQL `20260928120000_ledger_semijoin.sql`**
- Guarda: el md5 del cuerpo vivo tiene que ser igual al del repo.
- Cambia `= any(p_variante_ids)` por `in (select unnest(p_variante_ids))` en `20260924030000:134,152,161`. Misma firma.
- Nota en ADR-0202. Cierra `BACKLOG.md:888-891` (a 120 días: de ~560 a ~330 ms).

**Cómo se verifica:**
- vitest: el caso de la partición falla antes y pasa después; la propiedad se cumple.
- `pnpm pruebas:fn-ledger-fuente-unica` en verde.
- En producción: el md5 nuevo y Análisis de TRU con las mismas cifras de antes.

### PASO 2 · Núcleo de bajadas (PR «inventario», dos migraciones)

**`20260928120100_bajadas_nucleo.sql`: refactor puro**
- Guarda: md5 vivo = `91e2d0c1…`; si no coincide, aborta sin tocar nada.
- Crea `retail.fn_bajadas_del_piso_nucleo(...)` con el cuerpo de `20260926000300:147-199`, sin candado y con `revoke` a `public`, `anon` y `authenticated`.
- `fn_bajadas_del_piso` pasa a ser un envoltorio del núcleo, **con el mismo candado de líder** por ahora.

**`20260928120200_bajadas_netear_retiros.sql`: cambio de conducta**
- `piso_antes` = el nivel más alto del piso en [t−10 min, t].
- `cantidad_efectiva` = greatest(0, cantidad − retiros de la misma talla en [t−10 min, t+10 min]).
- Estado nuevo `corregida` cuando la cantidad efectiva es 0.
- `es_carga_inicial` = hay una entrada `carga_inicial` de la misma variante en el mismo instante.
- Las unidades tardías se topan por la cantidad efectiva.

**Cómo se verifica:**
- `pnpm pruebas:frescura-bajadas`: todos los casos actuales iguales después del primer archivo. Después del segundo, casos nuevos:
  - el ejemplo de ADR-0208:569-575 (sin tardía, `corregida`);
  - 10 escaneadas y 4 retiradas → efectiva 6;
  - la carga inicial marcada;
  - cada caso cambiado, listado en el PR.
- En producción, con la consulta de ADR-0208 (e): las 15 filas del 26-sep salen con `es_carga_inicial`.

### PASO 3 · Lectura y reglas (PR «frescura»)

**`20260928120300_frescura_modulo.sql`**
- `('frescura','Gestión','Frescura del piso','<texto sin apóstrofes>',215,false,true) on conflict (clave) do nothing`.
- Sin `rol_modulos` (regla ADR-0161). El 215 queda entre Análisis (210) y Colaboradores (220).
- **Se pega antes de publicar la web.**

**`20260928120400_frescura_lectura.sql`**
- **`fn_es_llegada(tipo, motivo, lote, producción, recepción)`, immutable:** el predicado de `20260924030000:634` con nombre propio.
- **`fn_frescura_sede(p_ubicacion_id, p_dias default 120) → jsonb`:**
  - Solo lectura: `security definer`, `stable`, `force_custom_plan`.
  - Candado: `fn_ve_modulo('frescura') and fn_puede_operar_ubicacion(p)`; si falla, `P0001` con la pista `frescura_sin_permiso`.
  - Qué prendas entran: stock ≠ 0 hoy, más las que tuvieron movimiento en la ventana. Sin la Prenda sin registrar ni los productos `es_prueba`.
  - Hace **una** llamada a `fn_ledger_puntos` (el arreglo nunca va nulo) y **una** al núcleo.
  - Devuelve:
    - `{separa_piso, desde, ahora, prendas[], eventos{variante:[[ts,delta,marcas,oid]]}, tardias[], dudosas[]}`.
    - Por prenda: `primera_exhibicion` (todo el historial) y `ultima_llegada`. Si no hay llegada, la primera entrada con `llegada_estimada`.
    - Temporada, origen, mitad y si es clásico: `fn_temporada_efectiva` × `fn_temporadas`.
    - `fin_estacion` y `en_estacion_ahora`: `fn_ocurrencia_temporada` dentro de la misma consulta.
    - `piso_hoy` y `almacen_hoy`.
  - Marcas de cada evento: 1 = venta, 2 = interno, 4 = edad desconocida. Llevan la 4 el saldo inicial, una entrada al piso que no es interna ni llegada, y la bajada de carga inicial.
  - El Taller devuelve `{separa_piso:false}`.
- **`fn_confianza_registro(p_ubicacion_id uuid default null, p_meses int default 2)`:**
  - Por sede y mes calendario de Lima: filas, unidades (Σ efectiva), tardías y `confianza = 1 − tardías ÷ unidades`, nula si no hubo unidades. El nivel va por filas: 1-9, 10-19, 20 o más.
  - Excluye las filas no cerradas, `dudosa`, `corregida` y de carga inicial. **Sin `persona_id`.**
- **El envoltorio `fn_bajadas_del_piso`** cambia de candado a «ve Frescura y opera la sede». `persona_id` solo sale para el líder (ADR-0208:536).

**Web: `lib/frescura-reglas.ts` + prueba (lógica pura)**
- `excluirTardias`: por `oid`, resta a la bajada y a las ventas de esa talla en [t, t+10 min], empezando por la última.
- `relojNovedad`: segundos con Σ de tallas en piso > 0 desde la primera exhibición. Da `alMenos` si esa fecha es anterior a la ventana o la edad es desconocida.
- `kaplanMeier` y `cortes` → P50, P75 y P90. Un corte que la curva no alcanza sale nulo y la pantalla dice «aún sin referencia».
- `elegirVentana`: 30, 60, 90 o 120 días. La más corta con 20 unidades vendidas o más **y** los tres cortes; si ninguna llega, 120.
- `nivelPorVentas`: cuenta unidades vendidas **con edad conocida**.
- `rapidez`: solo con edad conocida.
- `estadoFrescura`, un tipo cerrado: `semaforo | sin_ventas_sede | sin_vara | sin_edad_conocida | clasico | dudosa`. Lleva `temporadaPasada` y sus sugerencias. «Trasladar» existe solo con «Sólido» y almacén > 0. «Rebajar» no existe.
- `estaQuieta`: (Envejecida o Crítica) y más lenta que su categoría, o de temporada pasada. *Precisado el 2026-09-27 (Felipe, ADR-0208, «Revisión 5 del paso 3»): un pilar de venta de temporada pasada también entra, con su propia sugerencia («sigue vendiendo: decide si la dejas hasta agotar o la retiras»); un pilar nunca entra por viejo. Revisión 6: un pilar tiene que seguir vendiéndose (el que lleva 30 días colgado sin vender es lento).*
- `clavePrenda` en un solo lugar compartido con Análisis.

**Web: `lib/frescura.ts` (servidor)**
- Patrón `Tolerado` (`existencias-ritmo-servidor.ts:30-62`): cada bloque falla por su cuenta.
- El líder hace 6 llamadas **en paralelo**: 3 × `fn_frescura_sede` + 3 × `fn_confianza_registro(sede)`.
- Tipos a mano en `packages/database`, como hizo el #525.

**CI y scripts**
- `scripts/pruebas/frescura_lectura.mjs` + `pruebas:frescura-lectura` en `package.json`, junto a `:47`.
- Su paso en `ci.yml`, después de `:323-325`.

**Cómo se verifica:**
- **SQL:** permisos (líder; rol con `frescura` solo en su sede; sin el módulo; `anon`).
- **SQL:** aparece una prenda colgada sin movimiento en la ventana.
- **SQL:** marcas de edad desconocida en carga inicial, ajuste al piso y saldo inicial.
- **SQL:** la chompa de invierno cargada el 26-sep sale como temporada pasada (ADR-0246:96-98); un clásico de verano fuera de estación no.
- **SQL:** color nulo, `es_prueba` y Taller.
- **SQL:** el código llama una sola vez a `fn_ledger_puntos(` y nunca con nulo.
- **SQL:** `fn_es_llegada` es idéntico al predicado de `fn_resumen_comparacion`.
- **SQL:** el indicador excluye la carga inicial.
- **Roles:** `pruebas:roles` (el módulo nuevo solo lo ve el líder) y `pruebas:roles-cobertura` (Frescura queda protegido por `fn_frescura_sede`).
- **vitest:** Kaplan-Meier contra un ejemplo a mano; cortes nulos; ventana; niveles 0, 1, 9, 10, 19, 20; la edad desconocida nunca da «Nueva»; los días agotada o guardada no cuentan; una prenda repuesta no vuelve a Nueva; `estaQuieta` de un pilar = false; «Trasladar» sin «Sólido» imposible.
- **Carga sintética** (1 tienda, 2.000 prendas, 20.000 bajadas, 10.000 ventas): `fn_frescura_sede` a 120 días < 1 s.

### PASO 4 · Pantalla (PR «frescura»)

**a) Maqueta primero.** `docs/maquetas/frescura-3c-2026-09/`, estática, con datos simulados, en escritorio y 375 px. Felipe elige colores y frase de acción **antes** de construir.

**b) Módulo y menú**
- `lib/modulos.ts`: `"frescura"` después de `"analisis"` en `CLAVES_MODULO` (`:20`) y su fila junto a `:75`.
- `lib/menu.ts`:
  - `:298` pasa a ser el subgrupo `inventario.diagnostico` «Diagnóstico» (`raiz` `/inventario/resumen`, 13 Águila), con Análisis igual que hoy más `{modulo:"frescura", ruta:"/inventario/frescura"}`;
  - clave de ícono `frescura` (`:112`) y su trazo en `AppShell`.
- Pruebas que cambian:
  - `menu.test.ts`: el subgrupo, cómo se deshace y el tope;
  - `modulos.test.ts:155-178`: sumar `frescura` y `/inventario/frescura`;
  - `menu-hoy.golden.json`: los 6 perfiles cambian **a propósito, con el OK de Felipe** (lo exige la prueba).

**c) Ruta**
- `app/(app)/inventario/frescura/{layout.tsx con exigirModulo("frescura"), page.tsx, loading.tsx con <EsperaPantalla/>}`.
- `components/frescura/*`.

**d) Contenido de la pantalla**
- Cabecera `EncabezadoPagina` con la sede del selector global. Cifras: Edad del piso, % Nuevas, «Por decidir».
- Franja «Registro al colgar este mes» y «% a pedido: sin datos hasta los botones de la caja».
- UNA tarjeta con píldoras, filtros en la URL y la lista agrupada por categoría × mitad. Cada grupo explica su referencia en palabras e incluye la de CAYLA. Hoy CAYLA es solo Trujillo, y se dice.
- Hoja de detalle, «Las 3 tiendas» (solo el líder) y nota en hueso.

**Cómo se verifica** (como líder, en TRU):
- Los «días colgada» de una prenda coinciden con su historia en Movimientos.
- Las 15 prendas de carga inicial dicen «al menos N días» y nunca «Nueva».
- Un rol con solo Análisis sigue viendo «Análisis» suelto.
- Captura en escritorio y a 375 px, comparada con la maqueta.

### PASO 5 · Análisis usa la regla de Frescura (PR «inventario»)

- «Estancadas» (`analisis-que-hacer.ts:34`, hoy con un corte fijo de 14 días en `resumen-lectura.ts:40`, justo el que ADR-0208:94-97 descartó) pasa a usar `estaQuieta` y enlaza a Frescura.
- El candado de `fn_frescura_sede` suma `or fn_puede_analizar()`, siempre solo para su sede.
- «Rebajar» (`:367-372`) deja de ofrecerse a quien no puede poner descuento.

**Cómo se verifica:** para una misma prenda, Análisis y Frescura dicen lo mismo.

### PASO 6 · Tarjeta de la Terminal de ventas (después de la pregunta 1)

- Migración del módulo `registro_piso` (orden 216, sin rol).
- El candado de `fn_confianza_registro` suma `or fn_ve_modulo('registro_piso')`. Quien no es líder recibe su sede completa y de las otras solo los agregados.
- Tarjeta con «septiembre 86 % · agosto 79 %» en grande y un enlace gris «Ver ranking y promedio de CAYLA».

**Cómo se verifica:** una prueba SQL con una terminal que tiene el módulo (nunca `persona_id`), otra sin el módulo, y `pruebas:roles`.

### Documentos (cada paso)

- Actualizar `docs/ARQUITECTURA.md`, `BACKLOG.md`, `BITACORA.md` y `SESIONES-ACTIVAS.md`.
- Después de cada pegado: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- Antes de subir: `scripts/migraciones/versiones.mjs` y el verificador de números de ADR.

**Orden para pegar en producción:** 1d → 2 (100, luego 200) → 3 (300 antes de la web, 400) → publicar la web → verificación de solo lectura. Cada parte va sola, con `set search_path = retail, public, extensions`, `set lock_timeout='3s'` y guardas, y se puede pegar dos veces sin daño. Ninguna crea políticas ni hace `alter` de tablas en uso (ADR-0195).

### Costo por carga de pantalla (líder)

| | Hoy | 3 años, escenario alto sintético |
|---|---|---|
| Llamadas | 6 en paralelo | 6 en paralelo |
| `fn_frescura_sede` (2 lecturas del libro) | < 50 ms | ~0,7 s con el semi-join (~1,1 s sin él) |
| `fn_confianza_registro` (62 días) | < 20 ms | ~0,3 s |
| JSON por sede | < 20 KB | ~1,5 MB, solo entre servidor y base; al navegador van ≤ 500 filas ya calculadas |
| Kaplan-Meier y FIFO en TypeScript | ~0 | ~30 ms por sede |

---

## 3. Decisiones estructurales

**Cálculo**
- **DECIDÍ:** SQL delgado (libro + núcleo) y FIFO, Kaplan-Meier y tramos en TypeScript. Es la única copia del FIFO, como exige ADR-0208:649-650.
- **DESCARTÉ:** llevar las cohortes a SQL ahora. Obliga a mover Análisis también, para ahorrar ~30 ms de un total que se va en leer el libro.
- **SE ROMPE SI:** una sede pasa de 1 s medido en producción. Entonces, primero una foto diaria, o las cohortes a SQL como versión única.

**Edad desconocida**
- **DECIDÍ:** carga inicial, saldo inicial, ajuste al piso y devolución quedan como «al menos N días», fuera de la vara. Pueden subir el tramo, pero nunca dar «Nueva».
- **DESCARTÉ:** contarlas desde la fecha de carga. Con el 51 % medido, pintaría de Nueva medio piso.
- **SE ROMPE SI:** la puerta de carga inicial se usa para mercadería que llega de verdad (ADR-0212:47-50). Esas prendas nunca tendrían edad.

**Temporada pasada**
- **DECIDÍ:** la estación de la **última llegada** a la sede (A). *Precisado por Felipe el 2026-09-27 (ADR-0208, «Revisión 5 del paso 3»): la última llegada del modelo+color **a CAYLA** (lote, producción o carga inicial, en cualquier sede), no a la sede; la recepción de un traslado no cuenta. Así el «SE ROMPE SI» de abajo ya no pasa.*
- **DESCARTÉ:** la cohorte más vieja con saldo (B). Un modelo que el Taller repite en temporada saldría «pasado» por 2 unidades viejas, y sugeriría retirar lo recién llegado.
- **SE ROMPE SI:** llega un traslado de una prenda vieja a mitad de camino entre dos estaciones. Oculta el aviso de toda la prenda.

**Referencia de CAYLA**
- **DECIDÍ:** una sola curva con las unidades de las 3 sedes juntas.
- **DESCARTÉ:** promediar el P50 de cada sede: una sede con 2 ventas pesaría lo mismo que una con 200.
- **SE ROMPE SI:** Felipe delega Frescura a una encargada. No opera las otras sedes, así que hará falta una foto de los cortes agregados.

**Menú**
- **DECIDÍ:** el subgrupo «Diagnóstico», sin permiso nuevo. Si Felipe prefiere otro nombre, es una línea.
- **DESCARTÉ:**
  - subir el tope a 7: la prueba lo prohíbe (`menu.test.ts:215-222`);
  - una pestaña dentro de Análisis: ataría Frescura al permiso de Análisis.
- **SE ROMPE SI:** Inventario suma otra pantalla de uso diario. Se reagrupa, sin subir el tope.

**Sin estado nuevo:** no hay tablas nuevas, solo filas de `modulos`. Todo es lectura de una sola foto de la base, así que no hay problema de concurrencia. Si Supabase falla, cada bloque lo dice por su cuenta.

---

## 4. Objeción

- **La tarjeta de la terminal no puede ir en Inicio como se decidió.**
  - Para una terminal de ventas, cada visita a «/» redirige a `/vender` (`app/(app)/page.tsx:48-49`, `menu.ts:404`), y el menú le esconde Inicio (`menu.ts:97-99,484`).
  - Además, antes de 3b, «la clienta pidió otra talla y se la trajeron del almacén» cuenta como bajada tardía (ADR-0208:560). La cifra castigaría al equipo por atender bien.
- **«Semáforo desde el día 1»** se cumple en los días colgada y en la referencia de CAYLA. El color, en cambio, llega solo para lo que tiene edad conocida, y hoy es la mitad del piso.

## 5. Lo que no pediste

Producción está desalineada con `main`:
- El #409 se publicó sin su migración: no hay módulo `inicio` y `guardar_modulos_rol` tiene 3 argumentos, pero la web llama con 4 (`roles-acciones.ts:36-43`).
- Consecuencia: **Roles y accesos no puede guardar**.
- Por eso la Terminal Almacén sigue sin «Bajada al piso» (urgente desde ADR-0240), y el día que haya que dar Frescura o `registro_piso` a un rol, no se va a poder.
- Hay que pegar `20260925220000` antes del paso 4.

---

## 6. Preguntas para Felipe que de verdad bloquean

**P1. Registro de la Terminal de ventas (bloquea solo el paso 6)**
- **A, recomendada: en Caja, y sale con 3b.** Ganas: la ven cada día y no castiga lo que se trae a pedido. Pagas: no está en Inicio y llega después.
- **B: en Caja ya en 3c,** con la nota «todavía cuenta lo que pidió la clienta». Ganas: sale ya. Pagas: una cifra injusta hasta 3b.
- **C: en Inicio.** Ganas: es lo que decidiste. Pagas: deshacer tu regla del 21-sep y cambiar cómo se aterriza, no solo el menú.
- *Si no respondes: A (en 3c solo el líder ve el indicador).*

**P2. Las 54 prendas sin temporada (bloquea lo que muestra la pantalla el día 1)**
- **A, recomendada:** se comparan con toda su categoría en la sede, sin partir por mitad del año, con el chip «Sin temporada · complétala» y sin aviso de fin de estación. Ganas: hay semáforo ya. Pagas: se mezcla verano con invierno hasta que las completes.
- **B:** sin semáforo hasta que tengan temporada. Ganas: la vara sale limpia. Pagas: la pantalla nace vacía.
- *Si no respondes: A.*

Nada más bloquea. El «mes» del indicador será el mes calendario de Lima, y «cambiar de lugar 7 días» será solo una sugerencia escrita.

## 7. Riesgos

1. La desalineación de producción (sección 5).
2. El 51 % de edad desconocida: el color llenará el piso en semanas, no en días.
3. Las tardías incluyen lo traído a pedido hasta 3b.
4. El arreglo del FIFO mueve las cifras de Análisis donde hubo pausas.
5. Netear retiros resta de más si hay un retiro legítimo de la misma talla dentro de 10 minutos.
6. La regularización de la «Prenda sin registrar» entra a la vara como venta en la hora de la regularización. Cambiarlo es un cambio de dominio, con su ADR.
7. Hasta el paso 5, Análisis y Frescura dan dos respuestas distintas a «esto se quedó».

## 8. Lo que queda fuera

- La rebaja (bloque 7).
- El traslado armado y la alerta al Taller (bloque 5).
- Las tallas clave y la curva rota (bloque 4).
- La capacidad (bloque 6).
- Las marcas de 3b («a pedido», «ya estaba colgada», «retirada de la venta»).
- La foto diaria.
- La edad del apartado.
- La serie de % Nueva en el tiempo.
- La referencia de CAYLA para quien no es líder.
- El botón «la cambié de lugar hoy».