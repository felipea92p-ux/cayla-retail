# Cuánto llevar de lo que va fuera del riel (accesorios de impulso, bolsos y calzado)

**Fecha:** 2026-10-11 · **Pidió:** Felipe, «las otras categorías: cuánto deberíamos incluir; ocupan menos espacio y van cerca de caja; ayúdame investigando y asignando un estimado para empezar» ·
**Cómo se hizo:** datos propios de producción en solo lectura (el arquitecto), cinco investigaciones en paralelo (cobertura de accesorios, cobertura de bolsos y calzado, exhibición en caja, estadística y una
verificación independiente de los datos propios) y tres escépticos con lentes distintas (operación de tienda, estadística, coherencia con el repo) que intentaron romper el estimado. Confianza según la
convención del repo: **VERIFICADO** = se abrió la fuente y se vio el número · **REPORTADO** = lo dice una fuente secundaria o un blog · **NO ENCONTRADO**.

## La respuesta corta

Lo que ya existía eran las metas en % de lo vendido (TRU accesorios 9–11 %, bolsos y calzado 3–5 %; AQP 16–18 % y 6–8 %; LIM accesorios 4–6 %, sin bolsos). Faltaba **cuántas prendas** llevar. Se agregó a cada
ficha de «Fuera del riel» una línea **«Para empezar»**, que se calcula sola cada vez que se abre la pantalla:

> ritmo (prendas por semana) = peso × lo vendido + (1 − peso) × la meta, con el mismo `pesoDeLaVenta` del riel · «para empezar» = ritmo × semanas de cobertura (accesorios 3 a 5, bolsos y calzado 3 a 4)

Con la ventana tal como estaba el 2026-10-11 (12 días con venta) sale:

| Sede | Accesorios de impulso | Bolsos y calzado |
|---|---|---|
| **TRU** | unas **115 a 190** prendas (73 vendidas en 12 días, ~38 por semana) | unas **35 a 50** (11 vendidas, ~12 por semana, casi todo de la meta) |
| **AQP** | unas **90 a 150** (54 vendidas, ~30 por semana) | unas **35 a 45** (12 vendidas, ~11 por semana) |
| **LIM** | **sin ventas todavía**: no inventa un número; además falta confirmar que el stand tenga mostrador junto a la caja | **no lo lleva** |

(La pantalla usa una ventana fija de 14 días, así que hasta el 13-oct el ritmo sale ~14 % más bajo: TRU accesorios ~95 a 160, AQP ~75 a 130. Se corrige solo.)

**Es un punto de partida, no una compra.** No se resta de lo que cuelga («faltan 160» sería una orden que nadie calculó: el stock del sistema dice 8 accesorios en TRU contra 73 vendidos, porque lo vendido sin registrar no
descuenta stock). Primero hay que contar lo que hay en el mostrador y la trastienda.

## Los datos propios (producción, solo lectura, 2026-10-11; ventana 30-sep → 11-oct)

VERIFICADOS por un agente independiente con consultas `select` (cada línea de venta es 1 prenda; las «sin registrar» son filas de `prendas_por_regularizar`, sin doble conteo salvo una):

- **TRU:** 565 prendas, 356 tickets, S/ 30,078 (255 confirmadas y 310 sin registrar). Accesorios de impulso **73** (6 confirmadas —todas la Gorra Urbana— y 67 sin registrar: aretes 21, pulseras 11, relojes 9, lentes de sol 7,
  collares 6, anillos 6, cinturones 3, maquillaje 3, pañuelos 1) = 12.9 % de las prendas y 6.3 % de los soles; precio ~S/ 26. Bolsos y calzado **11** (no 12: una venta regularizada se había contado dos veces) =
  1.95 % de las prendas; ningún calzado.
- **AQP:** 350 prendas, de las cuales 62 son bolsas de despacho a S/ 0.61 (familia «empaque», fuera de los motores): 288 de mercadería. Accesorios **54** (1 + 53 sin registrar) = 18.75 %; 9.5 % de los soles. Bolsos **12** = 4.2 %.
- **LIM:** sin ventas. **Stock que dice el sistema** (no sirve para medir cobertura): TRU accesorios 8 (1 modelo), TRU bolsos y calzado 24 (10 modelos), AQP accesorios 35 (2 modelos), AQP bolsos 0.
- **Costo y lista:** accesorios costo S/ 6–12 y lista S/ 26–35 (solo 3 modelos tienen costo cargado: anillos, collar dorado, gorra; aretes, pulseras, relojes y lentes **no**); bolsos costo ~S/ 47 y lista ~S/ 65.
- El **92 % (TRU) y el 98 % (AQP)** de los accesorios son ventas sin registrar con la categoría puesta por quien vende: no se puede verificar que cada fila esté bien clasificada. El arranque del sistema distorsiona
  la ventana: el 30-sep y el 1-oct TRU registró 6 y 3 prendas; en la semana completa del 4 al 10 de octubre fueron 458 prendas (65 por día contra 47 del promedio de los 12 días).

## De dónde sale cada decisión

1. **Se mezcla lo vendido con la meta, con el peso del riel.** Con 12 días y 11 a 73 ventas por grupo, usar solo lo vendido es ruido (el error relativo del ritmo es ≈ 1.96/√k: ±23 % con 73 ventas, ±57 % con 12). Se usa la
   misma contracción de `lib/mix-piso.ts` (`pesoDeLaVenta`: n_ef = k ÷ 1.5, peso = n_ef ÷ (n_ef + 50), techo 0.75): TRU accesorios pesa 0.49, AQP accesorios 0.42, bolsos 0.13–0.14. Por eso en bolsos «casi todo sale
   de la meta y no de las ventas»: es lo correcto con 11 ventas.
2. **Dos desvíos del riel, escritos y aceptados por los escépticos de coherencia:** (a) aquí **sí** cuentan las ventas sin registrar, porque un accesorio casi nunca está en el catálogo y sin ellas el grupo parecería no
   venderse (el riel sigue contando solo las confirmadas); (b) **la meta se lee en prendas, no en soles**: viene de % de ingresos de empresas de EE. UU. (Buckle 10.9 %, Torrid 7.5 %, Francesca's 43 %…), pero la pantalla
   compara prendas. En soles TRU accesorios sería 6.3 % y AQP 9.5 %, por debajo de la meta, porque un accesorio vale la mitad del ticket (S/ 26 contra S/ 53): quien lea esa brecha no debe comprar más piezas para
   «llegar a la meta».
3. **Semanas de cobertura: 3 a 5 en accesorios, 3 a 4 en bolsos y calzado.** Es criterio, no dato: **no existe una cifra peruana ni de tienda chica** (ni Saga, Ripley, Oechsle, Topitop ni Estilos publican semanas de
   inventario por categoría). Lo que la acota (VERIFICADO en 10-K salvo lo marcado):
   - Boutiques de mujer que reponen cada semana trabajan con **5 a 6 semanas de costo con alquiler incluido** (Francesca's 5.0–6.3; Body Central 5.2–5.5; Charlotte Russe 5.2), unas **8 a 9 de producto** (cálculo
     propio: la ocupación pesa 24–32 % de esa línea; Buckle es la única tabla que la separa: 10.3 semanas con ella y 15.2 sin ella). Claire's (bisutería pura) 10.8–11.5 con ocupación. **Pero son cifras de la cadena
     entera** (centro de distribución y tránsito, 3 a 5 envíos por semana), no de lo que hay en la tienda: por eso no se copian.
   - Lovisa (bisutería de moda pura) rota a 26 semanas de producto y **paga 10–14 % de su costo de ventas en rebajas por obsoleto**: más de ~15 semanas de moda termina en liquidación.
   - Bolsos: Steven Madden 14 semanas, Buckle 15, Caleres 19, Coach 25 (VERIFICADO) incluyen almacén y mayorista; en CAYLA un bolso inmoviliza S/ 47 (cinco veces un accesorio) con margen de 15–28 % (S/ 65 contra S/ 47,
     según lleve IGV o no): por eso 3 a 4 y no más.
   - Guías de blogs (13 semanas, Toolio; «3 meses de venta al arranque», The Boutique Hub): REPORTADO, no se usan.
   - Cobertura = plazo de reposición del proveedor + 2 semanas, con mínimo 3: mientras no se mida el plazo, se supone 2 (= 4, el centro del rango). **Se afina cuando se conozca ese plazo.**
4. **Un escéptico objetó el razonamiento, y se corrigió:** «con pocos datos, 4 semanas» es un error lógico (con menos datos la incertidumbre es mayor y pediría más colchón). Lo que justifica 3 a 5 y no 8 es: reposición
   corta, costo de equivocarse bajo en accesorios (margen 54–77 %) y alto en bolsos, y que se revisa pronto.
5. **LIM no recibe un número inventado.** Sin ventas no hay ritmo (lo dice); el repo escribe que su stand «no tiene mostrador ni repisa» y sus accesorios existen solo si lo tiene. Si Felipe confirma el mostrador y quiere
   un número de arranque, es una constante suya con fuente (la investigación daba 18 a 45 piezas según se mire la venta supuesta o la variedad: 6 a 10 modelos de 3 piezas). Si LIM llega a vender poco, la línea dice que
   «con menos de 15 prendas manda que el mostrador se vea surtido, no la venta».

## Lo que NO va en la pantalla (para decidir con Felipe; dinero y compras son suyos)

- **Reparto orientativo por tipo** (no es un pedido; con k ≤ 6 por tipo el intervalo no sirve): TRU, unas 190 piezas: aretes 52, pulseras 26, relojes 20, collares 20, lentes de sol 20, anillos 16, gorros y sombreros 14,
  cinturones 8, maquillaje 8, pañuelos 6. AQP, unas 133: collares 34, gorros y sombreros 22, aretes 20, lentes de sol 19, pulseras 14, anillos 14, relojes 6, cinturones 4. Piso de variedad: nunca menos de 2 modelos por
  tipo con 3 piezas. Colores, lapiceros, libretas y útiles de oficina: 0 piezas nuevas (0 ventas; se liquida lo que quede). En TRU, 2 a 3 modelos de gorras y sombreros ligeros (12–16 piezas, en pared: es lo único
  confirmado y el verano será de calor récord, ENFEN N.° 17-2026) y nada de bufandas hasta marzo.
- **Calzado: 0 pares al inicio.** 0 ventas en 853 prendas (como mucho 0.35 % con 95 % de confianza) y exige curva de tallas (una talla que falta es una venta perdida; no hay curva peruana publicada). Si se quiere probar, 1
  modelo en 5 tallas (5 pares) en TRU y juzgar a las 4 a 6 semanas: decisión de Compras.
- **Dinero:** a costo, el objetivo lleno son unos **S/ 5,400 a 8,000** entre las tres sedes (TRU ~S/ 3,000–4,500, AQP ~S/ 2,100–3,100; los bolsos son ~45 % del dinero con 13–15 % de las piezas). Es un **piso**: el costo de
  S/ 9.35 por accesorio sale de solo 3 modelos; si el costo medio fuera S/ 12, los accesorios cuestan ~25 % más. **Hay que cargar el costo real de aretes, pulseras, relojes y lentes antes de aprobar la compra.** Y hay que
  restar lo que ya hay (TRU tiene unos 17 a 24 bolsos).
- **Campaña (supuesto de R-19: Navidad triplica un mes promedio; no hay dato de accesorios):** objetivo = ritmo × 3 × 2 semanas → TRU accesorios ~300 (hasta 350), AQP ~190 (hasta 220), bolsos ~48 cada uno solo si noviembre
  confirma el ritmo; ~S/ 3,000 de más. Recalcular el 8-nov y comprar antes del 15-nov. Lo mismo, en menor escala, para San Valentín (relojes, collares, pulseras) y Día de la Madre (carteras).
- **Exhibición (VERIFICADO en fabricantes):** el mostrador no es el límite. Un giratorio de aretes de 4 caras lleva 144 tarjetas (27 × 27 × 50 cm), uno de lentes 12 o 36 pares, un rack de bolsos 20 (86 × 86 cm), un
  mostrador de caja de 122 cm deja ~57 cm de repisas de vidrio. **Dimensionar el mueble al stock y no el stock al mueble:** una exhibición de bisutería se ve llena con 60–70 % de los ganchos ocupados, así que 72 a 96
  tarjetas al 70 % (8 a 12 modelos de 5 a 6 piezas) vale más que un giratorio de 144 a medias. En TRU (20 m², unas 30 prendas por m²) un rack de bolsos de 0.74 m² desplaza unas 22 prendas del riel: bolsos en repisa o
  ganchos de pared, no en el piso. Medir el mueble real antes de comprar.
- **Operar el accesorio barato por tipo y rango de precio** («Aretes S/ 15», «Aretes S/ 25», «Pulseras S/ 20»…: ~10 a 12 códigos por sede, que es lo que la caja ya clasifica) y reservar el alta por modelo para bolsos,
  relojes y lentes. Sin esos códigos el stock del sistema seguirá diciendo 8 contra 73 vendidas.

## Advertencias y cosas que Felipe debe confirmar

1. **Muestra mínima:** 12 días de arranque; error por muestreo ±23 a 27 % en accesorios, ±57 % en bolsos, y la mayoría de lo vendido está sin registrar. **Hasta unas 6 semanas con venta registrada, los bolsos son hipótesis.**
2. **¿Los S/ 65 del bolso llevan IGV?** Si lo llevan, el margen baja a ~15 % y conviene arrancar con 3 semanas, no 4.
3. **¿El stand de LIM tiene mostrador junto a la caja?** Hoy el repo dice que no.
4. **AQP:** vende 6 días a la semana (no los domingos); sus dos últimos días registrados (9 y 10 de octubre) bajaron a 17–18 prendas por día contra 41–50: confirmar con la tienda que no sea un cambio de hábito de registro.
5. **Dos categorías vendidas están en ningún grupo** («Accesorios de moda»: TRU 2, AQP 1; «Bufanda»: TRU 2, inactiva): 1 a 5 % de las prendas, no cambian el estimado, pero hay que asignarlas para que no se pierdan del plan del piso.
6. **No hay referencia peruana** (ni de ninguna tienda chica): la evidencia de impulso viene casi toda de supermercados, y la de rotación de cadenas de EE. UU. y Australia con otro alquiler, otros plazos de proveedor y otro margen
   (el de Lovisa es 5.6 veces; el de CAYLA, 2.3 a 4). La elasticidad promedio del espacio es 0.17 (Eisend 2014, 1,268 estimaciones, casi todas de supermercado): duplicar el mostrador subiría la venta ~12.5 %, no el doble.

## Fuentes principales (VERIFICADAS salvo las marcadas)

Claire's 10-K FY2016 (`sec.gov/Archives/edgar/data/34115/000119312517124387/d285924d10k.htm`) · Francesca's 10-K FY2019 (`…/1399935/000110465920055658/tm206783d1_10k.htm`) y FY2015/FY2017 · Body Central 10-K FY2012
(`…/1379246/000104746913002653/a2213513z10-k.htm`) · Buckle 10-K FY2025 (`…/885245/000088524526000012/bke-20260131.htm`) · Lovisa, Informe Anual 2025 (`announcements.asx.com.au/asxpdf/20251022/pdf/06qvv511g9xgsj.pdf`) ·
Steven Madden 10-K 2025 (`…/913241/000162828026012995/shoo-20251231.htm`) · Caleres 10-K FY2025 (`…/14707/000001470726000053/cal-20260131x10k.htm`) · Tapestry 10-K FY2026 (`…/1116132/000111613226000018/tpr-20260627.htm`) ·
Falabella Retail Perú, análisis razonado 2T25 (días de inventario de toda la tienda: 123.5; Ripley Perú 131.2) · Reserva Federal, G.73 (1962–63: zapatos de mujer 3.6 a 5.4 meses de venta en el estante; carteras 0.9 a 3.0) ·
Census, Monthly Retail Trade NAICS 448 (`fred.stlouisfed.org/series/MRTSIR448USS`: 2.11 meses de venta) · Eisend (2014) *Shelf space elasticity: a meta-analysis*, Journal of Retailing 90(2) · fabricantes de exhibidores (Eddie's,
WebstaurantStore). **REPORTADO:** Toolio, Branvas, Peasy, Apshan, The Boutique Hub, Wolf & Badger (blogs y guías comerciales). **NO ENCONTRADO:** semanas de inventario por categoría en el Perú; curva de tallas del calzado de
mujer en el Perú; qué parte de la venta de una boutique de ropa se hace en la caja.

**Para recalcular:** no hay nada que pegar ni que editar; el número cambia solo con las ventas. Las semanas de cobertura viven en `lib/mix-piso-partida.ts` (`SEMANAS_DE_VENTA_FUERA_DEL_RIEL`), con esta fuente. Decisión de
estructura: ADR-0352, actualización 2026-10-11 (b).
