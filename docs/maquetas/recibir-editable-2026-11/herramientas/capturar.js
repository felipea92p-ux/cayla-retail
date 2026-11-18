// Se pega en la consola del navegador (o con javascript_tool) sobre una pantalla del ERP LOCAL.
// Manda el DOM real al receptor (`node recibe.mjs`, puerto 8899) como <nombre>.json. Quita scripts, estilos y lo que pone Next en desarrollo;
// el CSS y las fuentes salen aparte, del archivo compilado, con `armar.mjs`.
//
//   await capturar("contar")   // escribe captura/contar.json
//
// Ojo: Next entrega la pantalla en dos tiempos (primero una «carga» y luego el contenido, que un script cambia de lugar). Capturar a
// medias deja la pantalla de carga en la maqueta, por eso espera a que el contenido esté de verdad (`listo`) y avisa si no llegó.
window.capturar = async (nombre) => {
  const listo = () => {
    const main = document.querySelector("main");
    return !!main && !main.querySelector(".min-h-\\[40vh\\]") && !document.querySelector('template[id^="B:"]') && main.getBoundingClientRect().height > 120;
  };
  for (let i = 0; i < 40 && !listo(); i++) await new Promise((r) => setTimeout(r, 500));
  if (!listo()) return "la pantalla aún no terminó de cargar: no se capturó";

  const vivo = document.documentElement;
  // Lo que el usuario escribió vive en la propiedad, no en el atributo: se copia al atributo para que sobreviva a la clonación.
  vivo.querySelectorAll("input,textarea").forEach((el) => {
    if (el.tagName === "INPUT") {
      if (el.type === "checkbox" || el.type === "radio") el.toggleAttribute("checked", el.checked);
      else el.setAttribute("value", el.value);
    } else el.textContent = el.value;
  });
  const c = vivo.cloneNode(true);
  c.querySelectorAll(
    'script,noscript,style,link,meta,title,base,template,[hidden][id^="S:"],next-route-announcer,nextjs-portal,[data-nextjs-dialog-overlay],[data-nextjs-toast]',
  ).forEach((n) => n.remove());
  const atributos = (el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
  const paquete = JSON.stringify({
    nombre,
    url: location.pathname + location.search,
    ancho: innerWidth,
    alto: innerHeight,
    html: atributos(vivo),
    body: atributos(document.body),
    cuerpo: c.querySelector("body").innerHTML,
  });
  const r = await fetch("http://127.0.0.1:8899/g?nombre=" + encodeURIComponent(nombre + ".json"), { method: "POST", body: paquete });
  return (await r.text()) + " · " + paquete.length + " bytes";
};
