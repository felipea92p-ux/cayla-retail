# Revisión legal de la tienda online de CAYLA (2026-11-18)

> **Esto no es asesoría legal firmada.** Es una revisión preparatoria, hecha con el criterio de un abogado peruano de protección de
> datos, consumo y comercio electrónico, para que el abogado colegiado que firme llegue con el trabajo adelantado. Nada de lo que
> sigue cambió un texto ni una línea de código: solo se describe y se propone.

**Para:** Felipe (dueño de CAYLA S.A.C.). **Qué se revisó:** todo lo que la tienda online (`apps/tienda`) le dice al cliente con
efecto legal: privacidad, Términos del Club, cambios y devoluciones, las casillas de consentimiento, eliminar la cuenta, el pie, la
bolsa y el separado, y las campañas con su cuenta regresiva. También el borrador `docs/club/texto-legal-puntos-v1-borrador.md` y los
textos del Club que guarda el ERP (`retail.club_textos`).

## Actualización del mismo día (2026-11-18, tarde)

- **Base de la revisión.** El informe se escribió sobre el código del 2026-10-27; los `archivo:línea` son de esa fecha. Al ponerlo sobre el
  `main` del 2026-11-18 cambiaron dos cosas que afectan a dos hallazgos:
  - **H14:** el sello «Borrador: lo revisa el abogado» se quitó de la política y de los Términos (Felipe, 2026-11-07). La versión aceptada
    sigue llamándose `borrador-…`, y los textos siguen sin la firma de un abogado: el riesgo de fondo es el mismo.
  - **H17:** la tienda ahora mide visitas con una cookie propia de 90 días con un número al azar, el origen de la visita, el departamento
    aproximado y las prendas que se miran (ADR-0495; la política ya lo dice y respeta «no me rastrees»). Ese número es un «identificador en
    línea», o sea un dato personal (DS 016-2024-JUS, definiciones, num. 4), tratado para una finalidad que no es necesaria para el contrato:
    pasa de *Cumple* a **Riesgo**. Que el abogado diga si basta informarlo o hace falta pedir permiso antes de poner la cookie.
- **H2 y H3 están corregidos en el código** (ADR-0680, misma rama): dos casillas y dos permisos de WhatsApp, cada uno con su texto, y
  ninguna cuenta nueva con Google sin marcar la casilla de aceptar. Faltan pegar sus tres migraciones en producción, antes de publicar.

## Cómo leer este informe

- **Veredicto:** *Cumple* · *Incumple* (la norma lo exige y hoy no está) · *Riesgo* (se puede discutir, pero Indecopi o la ANPD
  podrían sancionarlo) · *Mejorable* (no es infracción clara; mejora la defensa o la claridad).
- **Gravedad:** el techo de multa que fija la norma. La UIT de 2026 es **S/ 5 500** (DS 301-2025-EF).
  - Código del Consumidor, art. 110: leve hasta 50 UIT (S/ 275 000), grave hasta 150 UIT (S/ 825 000), muy grave hasta 450 UIT
    (S/ 2 475 000). **Tope para una microempresa: 10 % de sus ventas del año anterior; para una pequeña empresa, 20 %** (si lo
    acredita, no es reincidente y el caso no es de salud).
  - Ley 29733 (datos personales), art. 39: leve de 0,5 a 5 UIT, grave de más de 5 a 50 UIT, muy grave de más de 50 a 100 UIT, con
    tope del 10 % de los ingresos brutos del año anterior. *(Texto original de 2011; que el abogado confirme si una norma posterior
    cambió los montos.)*
- **Cómo verifiqué cada norma.** ✅ = leí el **texto oficial** (El Peruano o una copia en un servidor del Estado). 🟡 = solo pude
  leer una nota oficial o un comentario de un estudio; el abogado tiene que confirmarlo contra el texto. Ninguna cita sale de memoria.

| Norma | Versión que se usó | Verificación |
|---|---|---|
| Ley 29733, Protección de Datos Personales | Texto publicado en El Peruano el 03-07-2011 | ✅ |
| **DS 016-2024-JUS**, su reglamento | Publicado el 30-11-2024; **rige desde el 31-03-2025** (120 días). **Derogó el DS 003-2013-JUS** | ✅ (copia del texto en el servidor de la SMV, con notas del SPIJ) |
| Ley 29571, Código de Protección y Defensa del Consumidor | **Edición actualizada de El Peruano al 12-02-2026**, con la Ley 32323 (spam, 09-05-2025), la Ley 32495 (libro para comercio electrónico, 11-11-2025) y el **DL 1729** (12-02-2026) | ✅ |
| DS 011-2011-PCM, Reglamento del Libro de Reclamaciones, y sus cambios (DS 006-2014-PCM, DS 058-2017-PCM, DS 101-2022-PCM) | DS 101-2022-PCM leído en el visor de El Peruano; formato mínimo y SIREC en las *Preguntas y respuestas* del Indecopi del 12-11-2025 | ✅ / 🟡 (el Anexo I literal no se pudo abrir) |
| Proyecto de cambio del reglamento del libro (RM 244-2026-PCM, 18-07-2026) | En consulta pública; no encontré que se haya aprobado | 🟡 |
| Ley 28493 (correo comercial no solicitado) y Ley 29246 | Notas de terceros | 🟡 |
| Reglamento de Comprobantes de Pago (boleta con DNI desde S/ 700) | Página de orientación de SUNAT | 🟡 |

---

## Los cinco hallazgos más graves (resumen para decidir)

1. **No hay Libro de Reclamaciones virtual** (H1). Desde la Ley 32495 (nov. 2025) toda plataforma de comercio electrónico debe
   tenerlo y mostrar su enlace siempre a la vista. Se está construyendo en otra sesión; abajo va la lista exacta de lo que debe tener.
2. **La casilla de WhatsApp dice una cosa y la política otra** (H2). La casilla opcional dice «Quiero recibir por WhatsApp
   novedades y promociones de CAYLA», bajo el título «Avisos del Club por WhatsApp»; la política dice «Sin publicidad por WhatsApp».
   Un consentimiento para publicidad que no se entiende bien es la puerta a la infracción **muy grave** del art. 58.1.e del Código.
3. **Quien entra con Google queda anotado como que aceptó la privacidad y los términos sin haber visto ni marcado nada** (H3). La
   prueba del consentimiento es de CAYLA, y hoy la base guarda una aceptación que no ocurrió.
4. **Para separar hay que unirse al Club** (H4). El reglamento dice que el consentimiento deja de ser libre si se condiciona el
   servicio a datos que no son indispensables; el cumpleaños y la membresía no lo son para separar una blusa.
5. **No existen las condiciones de la tienda online** (H5). La casilla de «Crear tu cuenta» enlaza «los términos» a los Términos del
   Club. Las reglas del separado (plazos, anulación, precio, recojo) están repartidas en páginas de ayuda y no en un texto que el
   cliente acepte.

---

## Hallazgos, de más grave a menos

### H1. Falta el Libro de Reclamaciones virtual

- **Qué dice hoy la tienda:** no hay libro ni enlace. El pie (`apps/tienda/components/Pie.tsx:30-44`) tiene «Privacidad» y
  «Términos del Club», nada más. «Recomendaciones» (`apps/tienda/app/recomendaciones/page.tsx:17-22`) no es un libro: pide cuenta y
  no tiene formato ni plazo.
- **Qué exige la ley:**
  - Código, **art. 150** (modificado por la Ley 32495, publicada el 11-11-2025): los establecimientos comerciales **y toda plataforma
    digital de comercio electrónico** deben tener un libro de reclamaciones, físico o virtual. ✅
  - Código, **art. 151** (Ley 32495): las plataformas digitales «exhiben permanentemente en un lugar visible y fácilmente accesible el
    enlace al libro de reclamaciones». ✅
  - Código, **art. 24.4** (incorporado por el DL 1729, 12-02-2026): quien vende por canales digitales debe tener mecanismos de
    reclamo «accesibles, eficaces y permanentemente operativos», sin costos ni cargas innecesarias. ✅
  - Código, **arts. 24.1 y 152**: respuesta en **15 días hábiles improrrogables**. ✅
  - Indecopi, *Preguntas y respuestas* (12-11-2025): todo establecimiento, físico o virtual, debe tener libro; el virtual se ofrece en
    el mismo medio donde se vende y debe permitir imprimir la hoja o enviarla al correo del consumidor. ✅
- **Veredicto:** **Incumple.**
- **Gravedad:** Código, art. 110 (hasta 450 UIT, con los topes de micro y pequeña empresa). Es de las infracciones que Indecopi más
  fiscaliza, porque se comprueba con solo abrir la web.
- **Qué propongo:** el libro que se está construyendo, con todo lo de la sección «Requisitos exactos del Libro de Reclamaciones
  virtual», y su enlace **en el pie de todas las páginas** (visible sin iniciar sesión), en «Mi cuenta» y en la página de cada pedido.
  En «Recomendaciones», una línea: «¿Un reclamo o una queja? Usa nuestro Libro de Reclamaciones», con su enlace.

### H2. La casilla de WhatsApp: título, texto y política no dicen lo mismo

- **Qué dice hoy la tienda:**
  - Título de la casilla: «Avisos del Club por WhatsApp» (`apps/tienda/lib/cuentas-mensajes.ts:45`), marcado «Opcional»
    (`apps/tienda/components/cuenta/FormularioUnirseAlClub.tsx:351-367`).
  - Texto de la casilla: el de `club_textos` tipo `casilla_publicidad` versión 2, «Quiero recibir por WhatsApp novedades y
    promociones de CAYLA.» (`supabase/migrations/20261002160000_club_textos_v2_sin_genero.sql:181-183`, servido por
    `retail.tienda_casilla_whatsapp()`).
  - Política de la tienda: «Sin publicidad por WhatsApp: las novedades las ves en tu cuenta. La tienda te escribe por WhatsApp solo
    por tus pedidos. Los mensajes de promociones solo con tu autorización expresa» (`apps/tienda/app/privacidad/page.tsx:106-109`).
  - Términos del Club: «Por WhatsApp te avisamos de tus puntos y tus cupones solo si lo autorizaste» (`apps/tienda/app/terminos-del-club/page.tsx:131-132`).
  - El ERP sí manda avisos promocionales con esa autorización (`aviso_novedades`, «llegaron prendas nuevas…»).
- **Qué exige la ley:**
  - Código, **art. 58.1.e** (Ley 32323, 09-05-2025): prohibido enviar mensajes electrónicos masivos para promover productos, salvo a
    quien dio su consentimiento «libre, previo, informado, expreso e inequívoco»; se revoca «con efecto inmediato»; violarlo es
    **infracción muy grave**. ✅
  - DS 016-2024-JUS, **art. 1.2**: el consentimiento se pide para un tratamiento determinado, «con expresa identificación de la
    finalidad». **Art. 6.1**: informar con lenguaje sencillo. **Art. 26.1 y 26.5**: la publicidad necesita consentimiento directo, y
    la oposición se atiende en máximo **10 días** por un medio sencillo y gratuito, no más complejo que dar el consentimiento. **Art.
    10.2**: se puede negar una finalidad adicional sin afectar la relación principal. ✅
  - Ley 29733, **art. 13.5**: consentimiento previo, informado, expreso e inequívoco. ✅
- **Veredicto:** **Riesgo alto.** La casilla nace sin marcar (bien), pero una persona que lee «Avisos del Club» y la política que dice
  «sin publicidad» puede sostener que no consintió promociones. El consentimiento no fue *informado* sobre esa finalidad.
- **Gravedad:** muy grave en el Código (hasta 450 UIT); grave en datos personales (DS 016-2024-JUS, art. 133.3).
- **Qué propongo:** dos casillas, las dos opcionales y sin marcar, cada una con su título igual a su texto:
  1. «**Avisos de mi Club por WhatsApp**: mis puntos, mis cupones y cuándo vencen.» (servicio).
  2. «**Novedades y promociones por WhatsApp**: prendas nuevas y ofertas de CAYLA. Puedo pedir que paren cuando quiera respondiendo
     BAJA.» (publicidad).
  Y en la política, §3: «**Publicidad por WhatsApp, solo si marcaste la casilla de Novedades y promociones.** La retiras respondiendo
  BAJA o en Mi perfil; dejamos de escribirte en un máximo de 10 días.» Borrar «Sin publicidad por WhatsApp». La versión aceptada de
  cada casilla ya se guarda: conservarla.

### H3. «Continuar con Google» anota una aceptación que nadie vio

- **Qué dice hoy la tienda:** con correo, la casilla «Acepto crear mi cuenta y que CAYLA use mis datos…» es obligatoria
  (`apps/tienda/components/cuenta/FormularioRegistro.tsx:433-454`). Con Google, el botón (`apps/tienda/components/cuenta/BotonGoogle.tsx:27-60`)
  no muestra casilla ni aviso, y aun así la cuenta se crea con `textos: TEXTOS_VERSION` (`apps/tienda/lib/google-servidor.ts:61,68`):
  la base queda diciendo que esa persona aceptó la versión `borrador-2026-10-14`.
- **Qué exige la ley:**
  - DS 016-2024-JUS, **art. 9**: la carga de probar el consentimiento es **siempre** del responsable. **Art. 5.1.3**: hacer clic vale
    como consentimiento expreso, pero en algo que diga qué se acepta. **Art. 4**: previo. ✅
  - Ley 29733, **art. 14.5**: para ejecutar la relación contractual (la cuenta y el pedido) no hace falta consentimiento; pero la
    política sí debe informarse (art. 18) y los Términos del Club son un contrato que se acepta. ✅
  - Código, **art. 47.a**: en contratos en soporte electrónico debe constar «en forma inequívoca la voluntad de contratar». ✅
- **Veredicto:** **Incumple** (el registro de la aceptación no es cierto) y **Riesgo** para todo lo que dependa de esa aceptación.
- **Gravedad:** grave en datos personales si se trata algo que necesita consentimiento (art. 133.3); en consumo, un contrato cuya
  aceptación no se prueba no se puede oponer al cliente.
- **Qué propongo:** encima del botón de Google, la misma casilla obligatoria que con correo (el botón se enciende al marcarla), o
  como mínimo la frase «Al continuar con Google aceptas la [política de privacidad] y las [condiciones de la tienda]» junto al botón,
  y guardar `via = google` con la fecha. Para las cuentas que ya existen por Google, pedir la aceptación la próxima vez que entren.

### H4. Separar obliga a entrar al Club

- **Qué dice hoy la tienda:** sin Club no se separa: la bolsa manda a «Completar mis datos» (`apps/tienda/lib/bolsa.ts:429`), y ese
  formulario pide «Acepto unirme al Club CAYLA y que CAYLA use mis datos para mis pedidos y beneficios»
  (`apps/tienda/components/cuenta/FormularioUnirseAlClub.tsx:338`). La política dice que el cumpleaños es obligatorio
  (`apps/tienda/app/privacidad/page.tsx:113-116`).
- **Qué exige la ley:**
  - DS 016-2024-JUS, **art. 3.2**: el consentimiento no es libre si se condiciona un servicio a datos «que no son indispensables»
    para prestarlo. **Art. 10.2**: se puede negar una finalidad adicional sin perder la principal. ✅
  - Ley 29733, **art. 7** (proporcionalidad): datos adecuados, relevantes y no excesivos para la finalidad. ✅
  - Código, **art. 56.1.g**: no se puede exigir documentación innecesaria para entregar el producto. ✅
- **Veredicto:** **Riesgo.** El documento y el celular sí se pueden justificar para entregar un pedido (identificar a quien recoge,
  confirmar por WhatsApp). La membresía, los puntos y el cumpleaños no son indispensables para separar.
- **Gravedad:** grave en datos personales (art. 133.3) si se concluye que el consentimiento al Club no fue libre.
- **Qué propongo:** separar con lo indispensable (documento, nombre y celular, «para entregarte tu pedido»), y el Club como
  **casilla aparte y opcional** en el mismo paso: «Quiero unirme al Club CAYLA (gratis) y ganar puntos con mis compras». Si Felipe
  decide mantener el Club obligatorio, que lo decida sabiendo el riesgo y que el abogado lo valide por escrito.

### H5. No hay condiciones de la tienda online

- **Qué dice hoy la tienda:** la casilla de registro enlaza «términos» a `/terminos-del-club`
  (`apps/tienda/components/cuenta/FormularioRegistro.tsx:444-451`). Las reglas del separado viven en «Cómo separar»
  (`apps/tienda/lib/ayuda.ts:64-120`) y en las promesas de la bolsa (`apps/tienda/lib/ficha.ts:306-322`): la tienda tiene 24 h para
  confirmar, hay un plazo para pagar o se anula solo, se recoge «hasta 7 días después de pagar». Nada de eso se acepta ni tiene versión.
- **Qué exige la ley:**
  - Código, **art. 2**: información relevante, veraz, suficiente y fácilmente accesible antes de decidir. ✅
  - Código, **art. 47.a**: el proveedor debe establecer en el contrato las restricciones o condiciones especiales. ✅
  - Código, **art. 58.1.b y c**: no se pueden cambiar las condiciones informadas sin consentimiento expreso. ✅
- **Veredicto:** **Riesgo.** Sin un texto, cualquier conflicto (pedido anulado, precio, prenda que no estaba) se resuelve a favor del
  cliente, y una página de ayuda que cambia sola no prueba qué se ofreció ese día.
- **Gravedad:** según el caso concreto (art. 110).
- **Qué propongo:** una página «Condiciones de la tienda online» (con versión y fecha, aceptada en la misma casilla del registro)
  que diga: quién vende (razón social, RUC, domicilio); que separar no es pagar y no obliga a comprar; plazos (confirmar, pagar,
  recoger) y **qué pasa al vencer cada uno** (hoy no se dice qué pasa si no recoges en 7 días: el número de la base es solo un aviso
  interno, `dias_aviso_sin_recoger`); medios de pago; que el precio que se cobra es el del pedido separado; qué pasa si una prenda no
  está (se anula esa línea y se devuelve lo pagado, en qué plazo); cambios, devoluciones y garantía (H7); Libro de Reclamaciones; ley
  aplicable. La casilla del registro pasaría a enlazar esto y la privacidad; los Términos del Club, en la casilla del Club.

### H6. Las campañas no dicen cuántas unidades hay

- **Qué dice hoy la tienda:** la portada dice «Campaña · hasta el 30 de noviembre» y «−30 % en prendas elegidas» o «en las prendas de
  la campaña», con cuenta regresiva (`apps/tienda/components/HeroeDelInicio.tsx:92-117`). La cuenta regresiva termina el último día a
  las 23:59:59 de Lima, según la fecha real de la campaña en la base (`apps/tienda/lib/cuenta-regresiva.ts:6`): eso está bien.
- **Qué exige la ley:**
  - Código, **art. 14.1**: la publicidad de una promoción debe consignar, **en cada anuncio**, su duración y **la cantidad mínima de
    unidades disponibles**; si no, el proveedor debe dar el producto en esas condiciones a quien lo pida. ✅
  - **Art. 14.2-14.4**: si hay restricciones (qué prendas, en qué tienda), se dicen en el anuncio o se remite a una fuente gratuita y
    fácil (una página web vale), y esa fuente no puede contradecir el anuncio. ✅
  - **Art. 56.1.h** (DL 1729, 12-02-2026): prohibido diseñar interfaces que «distorsionen o manipulen» la elección del consumidor y le
    generen un perjuicio. Una cuenta regresiva **real** no lo es; una que se reinicia o una campaña que se alarga sí podría serlo. ✅
- **Veredicto:** **Incumple** (faltan las unidades mínimas y la fecha de inicio); **Cumple** la cuenta regresiva, mientras la fecha
  sea la verdadera.
- **Gravedad:** art. 110; además, si no se informa, CAYLA queda obligada a vender con descuento a quien lo pida.
- **Qué propongo:** bajo el descuento, una línea: «Del 15 al 30 de noviembre o hasta agotar stock. Mínimo 50 unidades en la campaña.
  Solo en las prendas marcadas, en la tienda que elijas. [Ver condiciones]», con la página de condiciones de la campaña. Una regla
  interna: **una campaña no se alarga después de anunciada** con cuenta regresiva (si se alarga, se anuncia como campaña nueva).

### H7. Cambios y devoluciones no separan el cambio voluntario de la garantía por falla

- **Qué dice hoy la tienda:** «Tienes 15 días. Para cambiar o devolver tu prenda, igual que en tienda», «Lleva tu boleta. Y la prenda
  con su etiqueta puesta» (`apps/tienda/lib/ayuda.ts:127-135`, mostrado en `apps/tienda/app/cambios-y-devoluciones/page.tsx:40-49`;
  el plazo sale de `retail.fn_dias_plazo_cambio()`, que devuelve 15, `supabase/migrations/20261012222000_cambio_plazo_en_la_base.sql:31-37`).
  La web y la boleta dicen el mismo número: bien.
- **Qué exige la ley:**
  - Código, **art. 20.a**: la garantía legal no se puede pactar en contra ni desplazar. **Art. 97**: si el producto tiene una falla
    de fabricación o no corresponde a lo ofrecido, el consumidor tiene derecho a reparación, reposición o **devolución de lo pagado**.
    ✅ Ese derecho no depende de 15 días ni de la etiqueta puesta.
  - Código, **arts. 49-51**: cláusulas que limiten derechos legales son abusivas. ✅
  - Indecopi ha sancionado políticas que niegan cambios o devoluciones (p. ej. la prohibición en outlets de Saga Falabella,
    Res. Final 2323-2025/CC2, y una multa de 6 UIT a una empresa de prendas por «no se aceptan cambios ni devoluciones»). 🟡
- **Veredicto:** **Riesgo.** El texto cubre bien el cambio voluntario, pero, leído solo, parece decir que tampoco hay nada para una
  prenda fallada pasados 15 días o sin etiqueta.
- **Gravedad:** art. 110.
- **Qué propongo:** dos bloques: «**Cambio o devolución porque no te quedó o no te gustó**: 15 días, con boleta y etiqueta puesta» y
  «**Si la prenda tiene una falla**: te la reparamos, te damos otra o te devolvemos lo que pagaste, aunque hayan pasado los 15 días o
  ya no tenga la etiqueta. Tráela con tu boleta a cualquier tienda CAYLA». Aclarar si «devolver» es dinero o vale (hoy los Términos
  del Club dicen «se te devuelve lo que pagaste»). Y lo mismo, corto, en el ticket.

### H8. La política llama «obligatorio» al cumpleaños y el formulario lo llama «opcional»

- **Qué dice hoy la tienda:** política: «Tu correo, tu contraseña, tu documento, tu nombre, tu celular y el día y el mes de tu
  cumpleaños: sin ellos no podemos darte tu cuenta ni tus puntos» (`apps/tienda/app/privacidad/page.tsx:113-116`). Formulario:
  «Opcional. Con tu cumpleaños te regalamos puntos…» (`apps/tienda/lib/cuentas-mensajes.ts:35`). Y la cuenta con Google no pide
  contraseña ni documento.
- **Qué exige la ley:** Ley 29733, **art. 18**: informar «el carácter obligatorio o facultativo» de las respuestas. DS 016-2024-JUS,
  **art. 6.1.5**. ✅
- **Veredicto:** **Incumple** (la información es inexacta).
- **Gravedad:** leve si es una o dos condiciones mal informadas (art. 132.5); grave si son tres o más (art. 133.2).
- **Qué propongo:** «Para tu cuenta: tu correo y tu nombre (y tu contraseña, si no entras con Google). Para separar: tu documento y
  tu celular. Para el Club: lo mismo; tu cumpleaños es opcional y solo sirve para tu regalo de puntos.»

### H9. «Los comprobantes se conservan sin tus datos» no es exacto

- **Qué dice hoy la tienda:** «Los comprobantes de pago se conservan el tiempo que exige la ley tributaria, sin tus datos»
  (`apps/tienda/app/privacidad/page.tsx:151-152`); «Tus compras y sus comprobantes quedan en CAYLA, pero sin tus datos»
  (`apps/tienda/lib/mi-cuenta.ts:48-49`).
- **Qué exige la ley:** una boleta electrónica emitida con DNI (obligatorio desde S/ 700, o cuando el cliente lo pide; las compras
  del Club van «a tu nombre con tu documento») queda con ese DNI y ese nombre en el comprobante que recibió SUNAT y en Lucode: no se
  puede anonimizar. 🟡 (SUNAT, orientación sobre la boleta). Ley 29733, **art. 18**, y DS 016-2024-JUS, **art. 6.1.9**: informar el
  plazo de conservación con verdad. ✅ El borrador del club ya decía «sin tus datos **de miembro**», que es lo correcto.
- **Veredicto:** **Riesgo** (información inexacta).
- **Gravedad:** leve (art. 132.5).
- **Qué propongo:** «Las boletas y facturas no se pueden borrar: si la compra se hizo con tu documento, el comprobante lo lleva, y lo
  guardamos (nosotros, Lucode y SUNAT) mientras la ley tributaria lo pida. Lo que sí borramos es tu ficha: ya no se sabe que esas
  compras son tuyas.» Que el contador confirme el plazo (Código Tributario, art. 87 num. 7: mientras el tributo no prescriba).

### H10. El flujo de datos fuera del Perú hay que comunicarlo y nombrarlo

- **Qué dice hoy la tienda:** «Supabase Inc. … y Vercel Inc. …, con servidores fuera del Perú (transferencia internacional de datos)»
  (`apps/tienda/app/privacidad/page.tsx:122-125`). No dice el país; la versión del ERP sí dice «São Paulo, Brasil», y la tienda corre
  en la región `gru1` de Vercel (São Paulo, `apps/tienda/vercel.json:4`). Los correos salen por Resend (ADR-0408) y los mensajes por
  Meta (WhatsApp), sin país.
- **Qué exige la ley:**
  - DS 016-2024-JUS, **art. 21.2**: «En cualquier caso, el flujo transfronterizo … debe ponerse en conocimiento» de la Dirección de
    Protección de Datos, y se **inscribe** en el Registro Nacional. **Art. 18**: país con nivel adecuado, o garantías (cláusulas
    contractuales, art. 20). ✅ No comunicarlo es infracción **leve** (art. 132.8).
  - **Art. 44.1**: la inscripción del banco de datos se mantiene **actualizada en todo momento**; no actualizarla es leve (art. 132.4).
    ✅ El banco «Clientes» se inscribió antes de que existieran la tienda web, la cuenta con correo o Google y los puntos.
  - **Art. 1.4 y 6.1.7**: informar la transferencia internacional y a quién va. ✅
- **Veredicto:** **Riesgo** (no lo puedo comprobar desde el repo: depende de qué se presentó en la inscripción).
- **Gravedad:** leve (0,5 a 5 UIT) por cada omisión.
- **Qué propongo:** (1) revisar la constancia de inscripción del banco «Clientes» y, si no lo tiene, presentar la **modificación**
  con las finalidades nuevas (tienda web, puntos) y el **flujo transfronterizo** (Supabase y Vercel en Brasil; Resend, Meta y Google en
  EE. UU., a confirmar con cada proveedor). (2) En la política, nombrar cada país. (3) Guardar los contratos de encargo de cada
  proveedor (sus «DPA») como garantía del art. 20.

### H11. A la política le faltan datos que tratamos y cosas que la ley pide decir

- **Qué dice hoy la tienda:** la lista de datos (`apps/tienda/app/privacidad/page.tsx:71-89`) no menciona: la dirección del aparato
  para los avisos push (`apps/tienda/components/notificaciones/AvisarEnCelular.tsx:68`), los favoritos, los «Avísame cuando llegue»,
  las recomendaciones que escribe el cliente con su nombre, la huella de la IP para frenar abusos (`apps/tienda/lib/cuentas.ts:721`) ni
  la medición de velocidad (`apps/tienda/components/Medicion.tsx:11-15`). Los destinatarios no nombran al servicio de correo (Resend)
  ni a Google como fuente de los datos de quien entra con Google. Los derechos dicen «dentro de los plazos de la Ley 29733»
  (`:163`) sin decir cuáles. El banco «Clientes» se nombra sin su código.
- **Qué exige la ley:** Ley 29733, **art. 18** y DS 016-2024-JUS, **art. 6.1** (identidad de los destinatarios, banco de datos,
  finalidades, plazo, mecanismos para los derechos) y **art. 6.2** (la fuente, si los datos no vinieron del titular). Plazos: **8 días**
  para el derecho de información, **20** para acceso y **10** para rectificación, cancelación u oposición (**art. 69**), ampliables una
  vez por igual plazo (art. 71). ✅
- **Veredicto:** **Mejorable**, que pasa a **Riesgo** si suman tres o más condiciones mal informadas (grave, art. 133.2).
- **Qué propongo:** sumar a «Qué datos tratamos»: «Si activas los avisos en tu celular, la dirección de tu aparato para mandártelos.
  Tus favoritos, tus avisos de “Avísame cuando llegue” y lo que nos escribes en Recomendaciones. Para proteger tu cuenta, una huella
  de tu conexión (no guardamos tu IP)». En «Con quién se comparten»: Resend (correos, EE. UU.) y Google (si entras con Google, nos da
  tu nombre y tu correo). En «Tus derechos»: «Te respondemos en 8 días si nos pides información, 20 si pides ver tus datos y 10 para
  corregirlos, borrarlos u oponerte.» Y el código de inscripción del banco, como ya lo tiene el texto del ERP.

### H12. Eliminar la cuenta puede quedar bloqueado

- **Qué dice hoy la tienda:** «Eliminar mi cuenta» pide la contraseña (`apps/tienda/app/acciones/mi-cuenta.ts:320-336`). Quien entró
  solo con Google no tiene contraseña (hay que verificarlo en el navegador: no encontré otro camino en el código). Y si la ficha la
  abrió una tienda: «para borrar tus datos, pídelo en cualquier tienda o por su WhatsApp» (`apps/tienda/lib/mi-cuenta.ts:35-36`).
- **Qué exige la ley:** DS 016-2024-JUS, **art. 67.1**: procedimiento **sencillo**; **art. 10.4**: revocar por mecanismos
  «fácilmente accesibles e incondicionales, sencillos, rápidos y gratuitos». Código, **art. 47.c**: el consumidor puede desvincularse
  por el mismo medio por el que contrató. ✅
- **Veredicto:** **Riesgo.**
- **Gravedad:** grave si se considera que se obstaculiza el ejercicio de un derecho (art. 133.1).
- **Qué propongo:** para cuentas con Google, confirmar con Google de nuevo (o con un código al correo) en vez de la contraseña. Para
  fichas abiertas en tienda, aceptar el pedido desde la web (el cliente ya está identificado por su sesión) y que el equipo lo cierre
  en 10 días, en vez de mandarlo a la tienda.

### H13. Términos del Club: cuatro cláusulas que el abogado debe mirar

- **Qué dicen hoy** (`apps/tienda/app/terminos-del-club/page.tsx`):
  1. CAYLA puede cambiar lo que valen los puntos o terminar el programa avisando con 15 días (`:103-104`, `:138-141`).
  2. Los puntos y los datos se eliminan a los 3 años sin compras; el aviso de 30 días va «por WhatsApp si lo autorizaste» (`:147-150`).
  3. Del cupón al portador: «si lo compartes, lo pierdes o te lo usan, no lo reponemos» (`:111-112`).
  4. En una devolución «se te devuelve lo que pagaste, sin incluir el valor del cupón» (`:123-125`).
- **Qué exige la ley:**
  - Código, **art. 51.b**: es abusiva (según el caso) la cláusula que permite modificar unilateralmente un contrato de duración
    continuada, salvo que diga los motivos **y el consumidor pueda desvincularse sin penalización**. ✅ Hoy salir del Club borra los
    puntos (`:153-154`): eso puede leerse como penalización.
  - Código, **art. 50.a**: no se puede excluir la responsabilidad del proveedor por su propia culpa. ✅
  - Código, **art. 97**: ante una falla, se devuelve lo pagado. ✅
  - Código, **art. 2**: la pérdida de puntos es información relevante; avisar solo por un canal que el miembro quizá no autorizó
    deja a muchos sin aviso. ✅
- **Veredicto:** **Riesgo** en 1 y 2; **Mejorable** en 3 y 4.
- **Qué propongo:** (1) «Si un cambio no te conviene, antes de que rija puedes canjear todos tus puntos con el valor de hoy» y nombrar
  los motivos posibles (costos, cambio de la ley, fraude). (2) Avisar los 30 días también en la cuenta web y por correo (es un aviso de
  servicio, no publicidad). (3) «…no lo reponemos, salvo que el error sea nuestro». (4) «Si devuelves una prenda por una falla, además
  te devolvemos los puntos del cupón». Las 10 preguntas de `docs/club/texto-legal-puntos-v1-borrador.md` §8 siguen abiertas.

### H14. El sello «Borrador» y la versión aceptada

- **Qué dice hoy la tienda:** la política y los términos se publican con «Borrador: lo revisa el abogado»
  (`apps/tienda/app/privacidad/page.tsx:46`, `apps/tienda/app/terminos-del-club/page.tsx:52,60-61`), y las cuentas guardan la versión
  `borrador-2026-10-14` (`apps/tienda/lib/cuentas.ts:21`). Los Términos del Club que rigen en tienda (`club_textos` v2) todavía
  hablan del cupón de cumpleaños y del vale de aniversario, retirados.
- **Qué exige la ley:** Código, **art. 2** (información veraz) y **art. 58.1.b** (no cambiar lo informado sin consentimiento expreso);
  DS 016-2024-JUS, **art. 4** (consentimiento previo) y la propia política, §10. ✅
- **Veredicto:** **Riesgo** mientras la tienda tenga clientes reales: un texto que se declara borrador es difícil de oponer.
- **Qué propongo:** al aprobarse los textos, versión nueva con fecha (`2026-12-xx`), quitar el sello, y pedir la aceptación de nuevo
  a toda cuenta que aceptó el borrador, la próxima vez que entre. Publicar en `club_textos` la misma versión que la web, para que caja y
  web digan lo mismo.

### H15. Mayores de 18: la cuenta no lo pregunta

- **Qué dice hoy la tienda:** «La tienda online y el Club CAYLA son solo para mayores de 18 años» (`apps/tienda/app/privacidad/page.tsx:176`).
  La casilla «Soy mayor de 18 años» solo está al unirse al Club (`FormularioUnirseAlClub.tsx:311-323`); crear la cuenta (con correo o
  Google) no la pide.
- **Qué exige la ley:** DS 016-2024-JUS, **art. 22.2 y 25.2**: desde los 14 años se puede consentir; **25.3**: menores de 14, con sus
  padres; **25.4**: «esfuerzos razonables» para verificar la edad. ✅ Exigir 18 es más estricto de lo que pide la ley, y está bien.
- **Veredicto:** **Mejorable** (la promesa de la política no se cumple en la cuenta).
- **Qué propongo:** la misma casilla «Soy mayor de 18 años» al crear la cuenta (también con Google).

### H16. Datos de la empresa en el pie

- **Qué dice hoy la tienda:** el pie dice «© 2026 CAYLA» (`apps/tienda/components/Pie.tsx:95-97`). La razón social, el RUC y el
  domicilio solo están dentro de la política (`apps/tienda/app/privacidad/page.tsx:64-66`).
- **Qué exige la ley:** en el texto actualizado del Código no encontré una regla que obligue a ponerlos en el pie. Sí obliga a dar
  la información relevante (art. 2) y a identificar al proveedor en la hoja de reclamación (ver abajo). ✅
- **Veredicto:** **Mejorable** (muy recomendable y casi gratis).
- **Qué propongo:** en el pie, en una línea: «CAYLA S.A.C. · RUC 20605964550 · Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco
  Herrera, Trujillo · [Libro de Reclamaciones]».

### H17. Cookies y almacenamiento en el navegador

- **Qué dice hoy la tienda:** no tiene rastreadores de publicidad ni de terceros (no encontré Google Analytics, píxel de Meta ni
  similares). Usa la cookie de sesión, la de la tienda elegida (`apps/tienda/lib/sede-cookie.ts`), marcas en el navegador (ubicación
  ya preguntada, campanita, el sorteo de la medición en `sessionStorage`). La ubicación se usa solo en el aparato para sugerir la
  tienda más cercana y no se manda (`apps/tienda/components/CabeceraConCuenta.tsx:432-433`). La política no dice nada de esto.
- **Qué exige la ley:** el DS 016-2024-JUS cuenta los «identificadores en línea» como dato personal (definiciones, num. 4), pero **no
  encontré una regla propia sobre cookies** ni un banner obligatorio. ✅
- **Veredicto:** **Cumple** en lo esencial; **Mejorable** en transparencia.
- **Qué propongo:** una sección «Cookies y lo que guarda tu navegador» en la política: «Solo usamos lo necesario para que la tienda
  funcione: tu sesión, la tienda que elegiste y si ya te preguntamos tu ubicación. No usamos cookies de publicidad ni de terceros.
  Tu ubicación no sale de tu celular. Medimos cuánto tarda la tienda en cargar, sin saber quién eres.» Si un día entra Google Analytics
  o el píxel de Meta, eso sí necesita aviso y consentimiento antes de cargarlos.

### Lo que ya cumple (para no tocarlo)

| Tema | Dónde | Norma |
|---|---|---|
| Responsable identificado con razón social, RUC y domicilio | `privacidad/page.tsx:64-66` | Ley 29733, art. 18; DS 016-2024-JUS, art. 6.1.1 ✅ |
| Casillas sin marcar; el clic vale como consentimiento | `FormularioRegistro.tsx:433-454`, `FormularioUnirseAlClub.tsx:310-367` | DS 016-2024-JUS, art. 5.1.3 ✅ |
| Se guarda qué versión se aceptó, con fecha y hora | `privacidad/page.tsx:87`, `cuentas.ts:21` | DS 016-2024-JUS, art. 9 (salvo Google, H3) ✅ |
| Plazo de conservación concreto (3 años) | `privacidad/page.tsx:145-150` | DS 016-2024-JUS, art. 6.1.9 ✅ |
| Derechos gratis, en tienda o por correo, y la ANPD como vía | `privacidad/page.tsx:158-165` | DS 016-2024-JUS, arts. 65 y 67.3 ✅ |
| Sin datos sensibles | `privacidad/page.tsx:89` | Ley 29733, art. 2.5 ✅ |
| Precio total, en soles, sin cargos escondidos; «Total de tu pedido» antes de separar; no se paga en la web | `app/bolsa/page.tsx:311-328` | Código, arts. 4 y 5 ✅ |
| El plazo de cambio de la web es el de la boleta, leído de la base | `lib/ayuda.ts:127-135` | Código, art. 2 ✅ |
| Cuenta regresiva atada a la fecha real de la campaña | `lib/cuenta-regresiva.ts:6` | Código, art. 56.1.h ✅ |
| Correos de la tienda: solo de servicio (códigos, contraseña, cambio de correo) | `privacidad/page.tsx:133-134` | Ley 28493 no aplica a correos que no son comerciales 🟡 |
| Programa de puntos sin azar: no parece necesitar autorización del Ministerio del Interior | Términos del Club | Código, art. 15; DS 006-2000-IN 🟡 (que lo confirme el abogado) |

Otros dos puntos para tener a mano, sin hallazgo hoy: **incidentes de seguridad** (DS 016-2024-JUS, art. 34: aviso a la ANPD en 48
horas si se exponen muchos datos, y al cliente afectado en 48 horas): conviene escribir un protocolo de una página. **Oficial de datos
personales** (art. 37): solo obligatorio si se tratan grandes volúmenes o datos sensibles; con ventas de pequeña empresa (150 a 1 700
UIT) la fecha sería el 30-11-2027 *si* aplicara. Hoy, con 3 tiendas y sin datos sensibles, probablemente no aplica: que lo confirme el
abogado.

---

## Requisitos exactos del Libro de Reclamaciones virtual

Para la sesión que lo construye. Todo con su fuente; lo marcado 🟡 hay que copiarlo literalmente del Anexo I vigente, que no pude
abrir en texto.

### Quién y dónde

- **CAYLA está obligada a tenerlo**: es establecimiento comercial y plataforma de comercio electrónico (Código, art. 150, Ley 32495). ✅
- **Uno por establecimiento**, cada uno con un **código de identificación** que CAYLA elige libremente; el virtual es uno más. No se
  registra, legaliza ni certifica ante el Indecopi ni ante notario. (Indecopi, *Preguntas y respuestas*, 12-11-2025.) ✅
- **Libro físico de respaldo** para cuando el virtual no esté disponible (misma fuente). ✅ Las tiendas ya deberían tener el suyo.
- **El enlace, permanente, visible y fácilmente accesible** en la plataforma (Código, art. 151). ✅ Propuesta: en el pie de todas las
  páginas, **sin pedir iniciar sesión** (art. 24.4: sin cargas innecesarias), y en la página de cada pedido.
- **Aviso del Libro de Reclamaciones** según el **Anexo II** del DS 011-2011-PCM (Indecopi, *Preguntas y respuestas*). ✅ En la web,
  la ley pide el **enlace**; el aviso del Anexo II es obligatorio en los locales. Poner junto al enlace una frase corta («Conforme al
  Código de Protección y Defensa del Consumidor, contamos con un Libro de Reclamaciones a tu disposición») no cuesta nada. 🟡 (texto
  literal del Anexo II por confirmar).

### Los campos de la hoja (formato oficial, Anexo I del DS 011-2011-PCM)

Mínimos según el Indecopi (*Preguntas y respuestas*, 12-11-2025) ✅, completados con la guía oficial del Indecopi de 2015 🟡:

1. **Denominación** que la identifique como «Hoja de Reclamación».
2. **Número correlativo** de cada hoja y **código de identificación** del libro.
3. **Fecha** del reclamo o queja (conviene guardar también la hora).
4. **Identificación del proveedor**: razón social (CAYLA S.A.C.), **RUC** (20605964550) y **dirección**. En el virtual: el domicilio
   fiscal y, si el reclamo es de un pedido, la tienda de recojo.
5. **Identificación del consumidor**: nombre, **documento de identidad** (DNI), **domicilio**, **teléfono** y **correo electrónico**.
6. **Si es menor de edad**: nombre, domicilio, documento, teléfono y correo de su **padre, madre o representante**. (El libro es
   para todos los consumidores; el «solo mayores de 18» de la tienda no aplica aquí.)
7. **Identificación del bien contratado**: si es **producto o servicio**, su **descripción** y el **monto reclamado**. Sugerencia:
   permitir enlazar el número de pedido o de boleta, sin que sea obligatorio.
8. **Detalle de la reclamación**: el consumidor marca **Reclamo** o **Queja** y escribe el **detalle**.
9. **Pedido del consumidor**: qué solicita.
10. **Observaciones y acciones adoptadas por el proveedor** (lo llena CAYLA al responder), con la fecha de la respuesta.
11. **Firma**: en el virtual se reemplaza por un mecanismo que acredite que el consumidor está conforme con lo que escribió (guía del
    Indecopi de 2015) 🟡: por ejemplo, la casilla «Declaro que los datos son correctos» y el envío con fecha y hora.

Leyendas que van impresas en la hoja 🟡 (copiarlas literalmente del Anexo I que modificó el DS 101-2022-PCM): las definiciones de
reclamo y queja, que **el proveedor responde en un plazo no mayor a 15 días hábiles** y que **presentar el reclamo no impide acudir a
otras vías ni es requisito para denunciar ante el Indecopi**.

**No condicionar**: no se puede exigir pagar el producto ni ningún monto para atender el reclamo (Código, art. 24.3; reglamento,
art. 6). ✅ No pedir más datos que los del formato como obligatorios. Si el consumidor no llena los mínimos del formato, el reclamo
puede tenerse por no presentado (guía del Indecopi de 2015) 🟡: por eso la pantalla debe guiar para que los llene.

### Reclamo y queja

- **Reclamo**: disconformidad con los **productos o servicios** (guía del Indecopi) ✅. Ejemplo: «la blusa llegó con una costura
  rota», «me cobraron otro precio».
- **Queja** (reglamento, art. 3.4, DS 101-2022-PCM): disconformidad **no relacionada** con los productos o servicios, o **malestar
  con la atención al público**. Ejemplo: «la vendedora me trató mal», «nadie contestó el WhatsApp». ✅
- **Ninguno es una denuncia** ni inicia un procedimiento sancionador (art. 3.4 y guía del Indecopi). ✅
- **Si el consumidor marca «queja» pero el texto describe un reclamo**, se tramita como reclamo (reglamento, art. 6). ✅

### Plazos y respuesta

- **15 días hábiles improrrogables** para responder, reclamos y quejas (Código, art. 24.1, Ley 31435; reglamento, arts. 6 y 6-B,
  DS 101-2022-PCM; Indecopi 2025). ✅ La vieja prórroga de 30 + 30 días calendario **ya no existe**.
- **Por escrito**: carta o el **correo** que indicó el consumidor; debe decir las **acciones adoptadas** y, si no se acepta lo pedido,
  **fundamentar** por qué (Indecopi 2025). En una queja no hace falta detallar las medidas (art. 6-B). ✅
- **Si se le ofrece una solución por correo**, el consumidor debe aceptarla expresamente («ACUERDO ACEPTADO PARA SOLUCIONAR EL
  RECLAMO» u otra frase equivalente); el envío suspende el plazo hasta 5 días hábiles y, sin aceptación, se tiene por rechazada y hay
  que responder formalmente (art. 6-A.2.b). ✅
- **Prueba de la entrega**: guardar el correo enviado y su constancia de entrega o lectura (Indecopi 2025). ✅
- No responder a tiempo es infracción denunciable ante el Indecopi (Indecopi 2025; Código, art. 110). ✅

### Copia al consumidor

- El virtual **debe permitir imprimir** la hoja o **enviarla al correo** del consumidor (Indecopi 2025). ✅ Propuesta: las dos cosas,
  al instante, con su número correlativo, y una pantalla de constancia descargable en PDF.

### Conservación

- **Dos años como mínimo desde la presentación**: las hojas y la constancia de la respuesta (guía oficial del Indecopi de 2015) 🟡 (el
  número sale del reglamento; confirmar que siga igual).
- **Entregar al Indecopi** la documentación del libro cuando lo pida (Código, art. 152). ✅
- Datos personales: el libro es un tratamiento con base en una obligación legal (no necesita consentimiento), pero hay que
  informarlo con una línea («Usamos tus datos solo para atender tu reclamo; los guardamos 2 años, como pide la ley») y sumarlo a la
  inscripción del banco de datos o inscribir uno propio (DS 016-2024-JUS, arts. 6 y 44.1).

### ¿Hay que reportar al SIREC?

- Solo los proveedores con **ingresos anuales iguales o mayores a 3 000 UIT** (S/ 16,5 millones en 2026) reportan sus reclamos al
  **SIREC** (Indecopi, *Preguntas y respuestas*, 12-11-2025). ✅ **Con tres tiendas y un taller, CAYLA casi seguro está por debajo:
  no tiene que reportar.** Felipe confirma con las ventas del año anterior.
- Aun así, conviene que el libro exporte las hojas a un archivo (por si el Indecopi las pide o CAYLA crece).

### Lo que puede cambiar pronto

- La **RM 244-2026-PCM** (18-07-2026) publicó un **proyecto** para adaptar el reglamento a la Ley 32495: propone, entre otras cosas,
  un libro único y centralizado para marketplaces y el enlace en todos los canales digitales donde se promueve la venta (redes,
  WhatsApp). 🟡 No encontré que se haya aprobado. **Diseñar el libro para que sumar un campo o un canal sea fácil.** Mientras tanto,
  poner el enlace también en la biografía de Instagram y en el mensaje automático de WhatsApp Business no cuesta nada.

---

## Lo que esta revisión no reemplaza

- **La firma de un abogado colegiado.** Antes de quitar el sello «Borrador» y lanzar la tienda a clientes reales, un abogado
  habilitado en el Perú tiene que revisar y firmar la política, los Términos del Club, las condiciones de la tienda (H5) y el Libro de
  Reclamaciones. Esta revisión no es asesoría legal y no tiene responsabilidad profesional detrás.
- **Lo que no pude leer en texto oficial**: el Anexo I y el Anexo II literales del Reglamento del Libro de Reclamaciones, el texto
  vigente del art. 39 de la Ley 29733 (si una norma posterior cambió los montos), la Ley 28493 y el Reglamento de Comprobantes de Pago.
  Están marcados 🟡.
- **Lo que no se puede ver desde el repo**: qué dice la constancia de inscripción del banco «Clientes» (H10), si los contratos con
  Supabase, Vercel, Resend y Meta tienen cláusulas de protección de datos, las ventas anuales exactas de CAYLA (topes de multa,
  SIREC, oficial de datos) y si las tiendas tienen su libro físico y su aviso.
- **El contador**: el plazo de conservación de comprobantes y el tratamiento contable de los puntos (`docs/club/texto-legal-puntos-v1-borrador.md` §9).
- **Preguntas para el abogado**, además de las 10 del borrador del Club (§8):
  1. ¿Se puede exigir unirse al Club para separar (H4), o hay que separarlo?
  2. ¿Los avisos de puntos y cupones por WhatsApp son publicidad (art. 58.1.e) o aviso de servicio? ¿Basta con dos casillas (H2)?
  3. ¿Cómo se regulariza a las cuentas creadas con Google sin aceptación (H3)?
  4. ¿La inscripción actual cubre la tienda web, los puntos y el flujo a Brasil y EE. UU. (H10)?
  5. ¿Los cambios unilaterales del Club con 15 días de aviso pasan el art. 51.b si salir del Club borra los puntos (H13)?

## Fuentes

- Ley 29733, texto publicado en El Peruano (03-07-2011): <https://leyes.congreso.gob.pe/Documentos/Leyes/29733.pdf>
- DS 016-2024-JUS, texto (copia en la SMV, con notas del SPIJ): <https://www.smv.gob.pe/Uploads/DS016_2024_JUS.pdf> · ficha en El
  Peruano: <https://busquedas.elperuano.pe/dispositivo/SE/2349653-1> · vigencia (El Peruano, 27-03-2025):
  <https://www.elperuano.pe/noticia/266995-minjusdh-el-lunes-31-regira-nuevo-reglamento-de-ley>
- Código de Protección y Defensa del Consumidor, edición actualizada de El Peruano al 12-02-2026:
  <https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=17>
- Ley 32495 (El Peruano, 11-11-2025): <https://busquedas.elperuano.pe/dispositivo/NL/2457203-1/>
- DS 101-2022-PCM (visor de El Peruano): <https://busquedas.elperuano.pe/api/visor_html/2095978-1>
- Indecopi, *Libro de Reclamaciones: preguntas y respuestas* (12-11-2025):
  <https://consumidor.gob.pe/wp-content/uploads/2020/07/Preguntas_Respuestas_LR_12.11.2025.pdf>
- Indecopi, *Guía informativa acerca del uso del Libro de Reclamaciones* (2015; su plazo de 30 días ya no rige):
  <https://repositorio.indecopi.gob.pe/backend/api/core/bitstreams/2f677ec0-8156-40c1-9652-dcd26810eac0/content>
- RM 244-2026-PCM, proyecto de cambio del reglamento del libro: <https://busquedas.elperuano.pe/dispositivo/NL/2536260-1> · nota de
  El Peruano: <https://www.elperuano.pe/noticia/300583-pcm-publica-proyecto-para-modificar-el-reglamento-del-libro-de-reclamaciones>
- UIT 2026 (El Peruano): <https://elperuano.pe/noticia/285208-mef-establece-en-s-5-500-la-unidad-impositiva-tributaria-para-2026>
- SUNAT, boleta de venta (DNI desde S/ 700): <https://orientacion.sunat.gob.pe/node/475>
- Indecopi y cambios en outlets (El Peruano): <https://elperuano.pe/noticia/298072-indecopi-ofertas-y-outlets-no-eliminan-tu-derecho-a-cambios-o-devoluciones>
  · Res. Final 2323-2025/CC2 (comentario de LP): <https://lpderecho.pe/indecopi-ordena-saga-falabella-eliminar-clausula-prohibia-cambios-devoluciones-outlets-res-final-2323-2025-cc2/>
- Ley 28493 (copia en OSIPTEL, no leída en texto): <https://www.osiptel.gob.pe/media/0hyfzp1a/ley-28493-correo-electronico-comercial-no-solicitado-spam-osiptel.pdf>
- DS 006-2000-IN y autorización de promociones (comentario): <https://webiis05.mondaq.com/peru/advertising-marketing--branding/490770/recent-modification-of-the-procedure-to-obtain-authorization-to-carry-out-sweepstakes-contests-and-other-commercial-promotions>
