/* Datos y piezas comunes de los 3 spikes. Los envíos son los del caso que acabamos de probar en local (ENV-003035) más dos de relleno. */
(function(){
  var P={
    sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    mas:'<path d="M12 5v14M5 12h14"/>', menos:'<path d="M5 12h14"/>', ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>', atras:'<path d="M19 12H5M11 6l-6 6 6 6"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
    caja:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
    camion:'<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    etiqueta:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    piso:'<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-6h4v6"/>',
    mano:'<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.6L3.6 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15"/>',
    falda:'<path d="M9 4h6l1 3 4 13H4L8 7z"/><path d="M9 4l-1 3M15 4l1 3"/>',
    blusa:'<path d="M8 4l-5 4 2.5 4L8 11v9h8v-9l2.5 1L21 8l-5-4c-.5 1.8-2 3-4 3S8.5 5.8 8 4z"/>',
    casaca:'<path d="M9 3L4 6l-1 14h4l.5-9M15 3l5 3 1 14h-4l-.5-9M9 3h6v18M9 3l3 4 3-4"/>',
    pantalon:'<path d="M7 3h10l1 18h-4l-2-10-2 10H6z"/><path d="M7 3l-1 0M7 7h10"/>'
  };
  function ico(n,c){return '<svg viewBox="0 0 24 24" aria-hidden="true"'+(c?' class="'+c+'"':'')+' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+P[n]+'</svg>'}

  var MODELOS={
    ariana:{n:'Falda Ariana',cat:'falda',color:'Rosado',hex:'var(--dato-rosado)',tallas:['S','M']},
    emma:{n:'Blusa Emma',cat:'blusa',color:'Beige',hex:'var(--dato-beige)',tallas:['S','M','L']},
    luciana:{n:'Casaca Luciana',cat:'casaca',color:'Negro',hex:'var(--dato-negro)',tallas:['M','L']},
    carla:{n:'Pantalón Carla',cat:'pantalon',color:'Azul',hex:'var(--dato-azul)',tallas:['28','30','32']},
    valentina:{n:'Blusa Valentina',cat:'blusa',color:'Verde',hex:'var(--dato-verde)',tallas:['S','M','L']}
  };
  var ENVIOS=[
    {id:'ENV-003035',cuando:'Hoy 9:38',prov:'CAYLA SAC',estado:'camino',fardos:1,lineas:[{m:'ariana',esp:3},{m:'emma',esp:2}]},
    {id:'ENV-002668',cuando:'Hace 2 días',prov:'CAYLA SAC',estado:'camino',fardos:2,lineas:[{m:'luciana',esp:2}]},
    {id:'ENV-000249',cuando:'Hace 7 días',prov:'CAYLA SAC',estado:'camino',fardos:3,lineas:[{m:'valentina',esp:12},{m:'carla',esp:14},{m:'ariana',esp:10}]}
  ];
  function tile(mid,extra){var m=MODELOS[mid];return '<div class="prenda" data-color-dato style="--c:'+m.hex+';'+(m.cat==='casaca'?'color:var(--crema-fija);':'')+(extra||'')+'">'+ico(m.cat)+'</div>'}
  function tema(){
    var r=document.documentElement;try{if(localStorage.getItem('cayla-tema')==='oscuro')r.setAttribute('data-tema','oscuro')}catch(e){}
    var b=document.querySelector('.tema');if(!b)return;
    function pinta(){var o=r.getAttribute('data-tema')==='oscuro';b.innerHTML=ico(o?'sol':'luna');b.setAttribute('aria-label',o?'Modo claro':'Modo oscuro')}
    pinta();b.addEventListener('click',function(){var o=r.getAttribute('data-tema')==='oscuro';if(o)r.removeAttribute('data-tema');else r.setAttribute('data-tema','oscuro');try{localStorage.setItem('cayla-tema',o?'claro':'oscuro')}catch(e){}pinta()})
  }
  /* una cifra que cuenta hasta su valor (una vez, 600 ms) */
  function cuenta(el,a,b,ms){
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){el.textContent=b;return}
    var t0=performance.now(),d=ms||600;
    (function f(t){var k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=Math.round(a+(b-a)*e);if(k<1)requestAnimationFrame(f)})(t0)
  }
  var tt;function toast(txt){var t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}
    t.innerHTML=ico('ok')+txt;requestAnimationFrame(function(){t.classList.add('ver')});clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('ver')},2600)}
  function anillo(p,len){return '<svg viewBox="0 0 100 100"><circle class="pista" cx="50" cy="50" r="'+len+'"/><circle class="arco" cx="50" cy="50" r="'+len+'"/></svg>'}
  window.R={ico:ico,MODELOS:MODELOS,ENVIOS:ENVIOS,tile:tile,tema:tema,cuenta:cuenta,toast:toast,anillo:anillo};
  document.addEventListener('DOMContentLoaded',tema);
})();
