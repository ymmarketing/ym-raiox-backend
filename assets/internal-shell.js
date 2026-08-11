(()=> {
 const SUPABASE_URL='https://nxmcqkhaolplyzapccaf.supabase.co';
 const PUBLISHABLE_KEY='sb_publishable_z7XBvN1Yxao3yooH3dV5Bg_I2tBojp5';
 const sb=window.supabase.createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const isHttp=v=>/^https?:\/\//i.test(String(v||''));
 const safeLink=(v,label)=>isHttp(v)?`<a href="${esc(v)}" target="_blank" rel="noopener">${esc(label)}</a>`:`<span class="ym-meta">${esc(v||'Não informado')}</span>`;
 const datePt=v=>{if(!v)return '—';try{return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}catch{return '—'}};
 const toast=(msg,err=false)=>{let el=document.getElementById('ymToast');if(!el){el=document.createElement('div');el.id='ymToast';document.body.append(el)}el.textContent=msg;el.className='ym-toast'+(err?' err':'');el.style.display='block';clearTimeout(window.__ymtoast);window.__ymtoast=setTimeout(()=>el.style.display='none',4200)};
 const safeNext=v=>/^\/(CRM|MOTOR|Identidade)(?:[/?#]|$)/.test(v||'')?v:'/CRM';
 async function requireSession(next=location.pathname+location.search){const {data:{session}}=await sb.auth.getSession();if(!session){location.replace('/interno?next='+encodeURIComponent(safeNext(next)));return null}return session}
 async function signOut(){await sb.auth.signOut();location.replace('/interno')}
 function shell(active,user){
   const nav=(href,label,icon,ideia='')=>`<a href="${href}" class="${active===label?'active':''}"><span class="nav-icon">${icon}</span><span>${label}</span>${ideia?`<span class="ideia">${ideia}</span>`:''}</a>`;
   const aside=document.createElement('aside');aside.className='ym-sidebar';aside.id='ymSidebar';aside.innerHTML=`
    <img class="ym-logo" src="https://ymnegocios.com.br/assets/img/logo-ym-horizontal.webp" alt="YM Marketing & Negócios">
    <div class="ym-nav">
      <div class="ym-nav-group"><div class="ym-nav-label">Público</div>
        ${nav('https://ymnegocios.com.br','Raio-X','RX')}
        ${nav('/quemsomos','Quem Somos','YM','IDEAÇÃO')}
        ${nav('/areadocliente','Área do Cliente','AC','IDEAÇÃO')}
      </div>
      <div class="ym-nav-group"><div class="ym-nav-label">Interno</div>
        ${nav('/CRM','CRM','C')}
        ${nav('/MOTOR','MOTOR','M')}
        ${nav('/Identidade','IDENTIDADE','ID','IDEAÇÃO')}
      </div>
    </div>
    <div class="ym-account"><strong>${esc(user?.email||'')}</strong><span>${esc(user?.role||'ÁREA INTERNA')}</span><div class="ym-account-actions"><a href="/interno/redefinir?change=1&next=${encodeURIComponent(location.pathname)}">Senha</a><button id="ymLogout">Sair</button></div></div>`;
   document.body.prepend(aside);
   document.getElementById('ymLogout')?.addEventListener('click',signOut);
   document.getElementById('ymMenu')?.addEventListener('click',()=>aside.classList.toggle('open'));
   document.addEventListener('click',e=>{if(innerWidth<=760&&aside.classList.contains('open')&&!aside.contains(e.target)&&e.target?.id!=='ymMenu')aside.classList.remove('open')});
 }
 window.YM={SUPABASE_URL,PUBLISHABLE_KEY,sb,esc,isHttp,safeLink,datePt,toast,safeNext,requireSession,signOut,shell};
})();
