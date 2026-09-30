# WhatsApp del club: bot automático (descartado) y consentimiento en tienda (2026-09-30)

**Para qué:** el sustento de dos decisiones de Felipe sobre el club (ADR-0288, «Actualización 2026-09-30»):
- no usar un bot de envío automático;
- registrar el consentimiento en caja sin que la clienta tenga que sacar su celular.

Es una investigación web del 2026-09-29 y el 2026-09-30. Cada afirmación lleva su fuente. **(secundaria)** indica
que la fuente es un agregador o un blog, y **no verificado**, que no se pudo confirmar.

## Parte 1 · Bot con la API oficial de Meta: lo que se evaluó y por qué no

**Decisión de Felipe (2026-09-30): no habrá bot.** Cada tienda envía los mensajes desde su número, y el ERP recomienda
qué mensaje mandar y a quién. Lo que sigue queda como referencia por si el volumen algún día lo justifica.

**Cómo funciona la Cloud API de Meta:**
- **Plantillas y categorías:** utility (sigue a un pedido de la clienta, sin promoción) o marketing (todo lo demás;
  una plantilla mixta cuenta como marketing, y Meta la recategoriza sola)
  ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)).
  Para CAYLA: la boleta y el apartado por vencer son utility; «Llegó tu talla» es utility solo si ella lo pidió y
  el texto no promociona nada; el cumpleaños, el aniversario, «Te extrañamos», las novedades y las rebajas son
  marketing.
- **Se cobra por mensaje** desde el 1-jul-2025
  ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)). **Desde el
  1-oct-2026** también se cobran los mensajes de servicio y los utility dentro de la ventana de 24 h
  ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages);
  [360dialog](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/)).
- **Tarifas para Perú** **(secundarias; hay que confirmarlas en el CSV oficial de Meta)**: marketing US$0,0703;
  utility US$0,0300 desde el 1-oct-2026; servicio US$0,0300 pasados los 1.000 gratis al mes por número
  ([riqra](https://blog.riqra.com/posts/costo-whatsapp-business-api-precios-2026);
  [360dialog](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/)).
- **Coexistencia** (el mismo número en la app del celular y en la API): existe, pero **solo** a través de un
  proveedor (Solution Partner o Tech Provider). Si el celular pasa unos 14 días sin abrirse, el número se desconecta
  ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/);
  [360dialog](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence)). Que esté disponible en Perú:
  **no verificado** en Meta.
- **Límite de envío:** 250 destinatarias distintas por día sin verificar el negocio; 2.000 al verificarlo. El
  límite es por portafolio, así que lo comparten las 3 tiendas
  ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)).

**Costo estimado** para ~1.000 mensajes de marketing y ~2.000 utility al mes:

| Concepto | Cálculo | Costo |
|---|---|---|
| Marketing | 1.000 × US$0,0703 | US$70,30 |
| Utility | 2.000 × US$0,0300 | US$60,00 |
| Total Meta | | **US$130,30 al mes** |
| Plataforma, si se usa 360dialog con coexistencia | €49 por número | +€49 (1 número) a +€147 (3 números) |

La plataforma de 360dialog no cobra recargo por mensaje ([360dialog](https://360dialog.com/pricing)).

**Por qué no, en palabras de Felipe:** cada tienda ya tiene su número y atiende a sus clientas. Lo que falta no es un
robot que envíe: es que el sistema diga a quién escribir hoy, qué escribirle y a quién no escribirle.

## Parte 2 · La ley y el consentimiento en tienda

**Hallazgo que cambia el flujo del club:** la **Ley 32323** (publicada el 9-may-2025) modifica el art. 58.1.e del
Código de Protección y Defensa del Consumidor.
- Considera método comercial agresivo enviar comunicaciones comerciales (llamadas, mensajes, mensajería
  instantánea, correo) a quien no las pidió por iniciativa propia ni dio un consentimiento previo, informado,
  expreso e inequívoco. Es infracción muy grave
  ([Estudio Ugaz](https://estudiougaz.com/publicaciones/ley-n-32323-ley-que-modifica-la-ley-29571-codigo-de-proteccion-y-defensa-del-consumidor-a-fin-de-ampliar-la-prohibicion-de-las-comunicaciones-spam/)).
- Según CMS, la ley no reconoce el «primer contacto para pedir permiso» que sí admite el reglamento de la Ley 29733
  ([CMS](https://cms.law/es/per/publication/promulgan-ley-contra-llamadas-y-mensajes-spam)).
- Antecedente: Indecopi multó a Cencosud con S/ 1,97 millones por enviar comunicaciones sin consentimiento previo
  ([Gestión](https://gestion.pe/economia/empresas/indecopi-multa-con-casi-s-2-millones-a-cencosud-por-enviar-comunicaciones-sin-previo-consentimiento-noticia/)).

**Consecuencia:** el plan de D-108 («la tienda manda un primer mensaje y la clienta responde SÍ») queda en riesgo, y
el texto v1 del ADR-0288 también. La forma de dar el consentimiento sin pantalla táctil está en la parte 3.

## Parte 3 · Consentimiento en tienda sin pantalla táctil: qué dice la norma y qué se decidió

**Art. 58.1.e tras la Ley 32323** ([El Peruano](https://busquedas.elperuano.pe/dispositivo/NL/2397811-2); se leyó con
un extractor, así que conviene cotejarlo con el PDF oficial):
- Prohíbe centros de llamada, llamadas, SMS y «mensajes electrónicos masivos» para promover productos.
- Única excepción: el consumidor que, **«por iniciativa propia»**, se contacta con el proveedor y da su
  consentimiento libre, previo, informado, expreso e inequívoco.
- La revocación tiene «efecto inmediato y sin expresión de causa».
- Es infracción muy grave: hasta 450 UIT ([CMS](https://cms.law/es/per/publication/promulgan-ley-contra-llamadas-y-mensajes-spam)).
- WhatsApp no se nombra, pero el reglamento de la Ley 29733 (DS 016-2024-JUS, art. 26.1) exige de todos modos
  consentimiento para publicidad.

**Lo que dicen Indecopi y el reglamento:**
- **El primer contacto quedó sin efecto:** la directora de Fiscalización de Indecopi habló de «derogación tácita»
  del art. 26.2 del reglamento ([Gestión](https://gestion.pe/peru/los-dos-cambios-que-trae-la-ley-contra-las-llamadas-spam-y-la-fiscalizacion-del-indecopi-noticia/);
  [Echecopar](https://echecopar.com/publicaciones-se-publico-ley-que-amplia-la-prohibicion-de-las-comunicaciones-spam/)).
- **Consentir en la tienda vale:** el usuario puede «ir al local del proveedor», y el permiso «pudo haber sido
  otorgado al momento de adquirir un bien o servicio»
  ([Gestión](https://gestion.pe/peru/los-dos-cambios-que-trae-la-ley-contra-las-llamadas-spam-y-la-fiscalizacion-del-indecopi-noticia/);
  [El Comercio](https://elcomercio.pe/economia/indecopi-advierte-que-llamadas-comerciales-solo-pueden-hacerse-con-consentimiento-del-consumidor-ultimas-noticia/)).
  - **Zona gris:** que la cajera *ofrezca* el club podría leerse como que la tienda «la busca».
- **Qué dice el reglamento de la Ley 29733** ([texto](https://img.lpderecho.pe/wp-content/uploads/2024/11/Decreto-Supremo-016-2024-JUS-LPDerecho.pdf)):
  - la prueba del consentimiento corre siempre por cuenta de la empresa (art. 9);
  - cada finalidad se identifica por separado (art. 1.2);
  - no se condiciona un beneficio a datos no indispensables (art. 3.2);
  - la baja se atiende de forma sencilla y gratuita (arts. 26.5 y 10.4).

**Casos sancionados:**
- **Cencosud:** S/ 1 968 384. No pudo probar el consentimiento en 232 de 500 comunicaciones
  ([IAPP](https://iapp.org/news/a/en-peru-el-indecopi-sanciono-a-cencosud-con-mas-de-usd-500-000-por-enviar-comunicaciones-publicitarias-a-los-consumidores-sin-su-consentimiento)).
- **Claro, Telefónica y Rappi** (2019), casos nacidos de quejas por el canal «WhatsApp No Insista»
  ([Andina](https://andina.pe/agencia/noticia-sancionan-a-claro-movistar-y-rappi-llamadas-y-mensajes-sin-consentimiento-779245.aspx)).

**Cómo lo hacen en Perú:**
- **Publicidad como finalidad adicional y opcional:** Plaza Vea (nombra WhatsApp), Promart y Oechsle
  ([Plaza Vea](https://www.plazavea.com.pe/tratamiento-de-datos-personales-adicional);
  [Promart](https://www.promart.pe/politicas-y-privacidad/tratamiento-datos-personales-otros-usos);
  [Oechsle](https://www.oechsle.pe/politicas-y-privacidad/datos-personales)).
- **Mifarma:** en tienda manda un SMS con un enlace, y la clienta acepta las casillas en su celular
  ([Mifarma](https://legales-mifarma.s3.amazonaws.com/terminos_y_condiciones_monedero.html)).
- Saga, Ripley y los demás: no verificado.

**Métodos que se evaluaron** (CAYLA no tiene pantalla táctil ni tablet):

| Método | ¿Sin sacar el celular? | Peso de la prueba | Resultado |
|---|---|---|---|
| «Sí» de palabra que registra la asesora | Sí | Bajo | **Elegido solo para el club** (beneficios y avisos informativos) |
| Ella toca una casilla en una pantalla | Sí | Alto (el reglamento nombra el «toque») | Descartado: no hay pantallas táctiles |
| Firma en tablet o en papel | Sí | Alto | Descartado: sin tablet, y el papel se pierde |
| **Ella escribe primero a la tienda desde un QR** | No (o después, desde el ticket) | Máximo: es la «iniciativa propia» literal y prueba que el número es suyo | **Elegido para la publicidad** |
| La tienda escribe primero pidiendo el «SÍ» | Sí | — | Descartado: es el primer contacto derogado |

**Decisión de Felipe (2026-09-30):** club de palabra; publicidad solo con su mensaje desde el QR (en caja, en el
ticket y en un cartel); sin validación de un abogado. Es la CL-29 a CL-34 del acta y el ADR-0288, «Actualización
2026-09-30».

**Lo que un abogado confirmaría, si algún día se consulta:**
- que la invitación en caja cumple la «iniciativa propia»;
- que los avisos informativos (apartado, talla pedida) quedan fuera del 58.1.e;
- el texto de la política de privacidad y los términos del club;
- cuánto tiempo guardar las pruebas.

