const CRM_EDGE_URL = 'https://srzdikgztpdtwbggwniz.supabase.co/functions/v1/save-raiox-intake';

function clean(v,max=2000){
  const s=String(v??'').trim();
  return s ? s.slice(0,max) : null;
}

export function buildRaioxV22CrmPacket({ref,intake,report,session,completedAt}){
  const indicators=Array.isArray(report?.score_panel?.indicators)?report.score_panel.indicators:[];
  const overall=Number(report?.score_panel?.overall_score);
  const payer={
    name: clean(intake?.contact_name || session?.customerName || (session?.customer && !String(session.customer).includes('@') ? session.customer : null),180),
    email: clean(intake?.contact_email || session?.customerEmail || (String(session?.customer||'').includes('@') ? session.customer : null),180),
    phone: clean(intake?.contact_whatsapp || session?.customerPhone,40),
  };
  // RX_REPORT_3.0 (questionário de 25 perguntas) usa o contrato V3 no CRM; relatórios 2.2 mantêm o V2.
  const v3=report?.report_version==='RX_REPORT_3.0';
  return {
    packet_version:v3?'VOS_INTAKE_3.0':'VOS_INTAKE_2.0',
    questionnaire_version:v3?'RX_CANONICO_3.0':'RX_CANONICO_2.0',
    scoring_version:v3?'RX_SCORE_3.0':'RX_SCORE_2.2',
    report_version:v3?'RX_REPORT_3.0':'RX_REPORT_2.2',
    source_product:'RAIO_X_DIGITAL',
    source_system:'ym_raiox_oficial',
    source_session_id:ref,
    client_ref:clean(intake?.business_name,220),
    business_name:clean(intake?.business_name,220),
    payer,
    answers:intake?.answers||{},
    complements:intake?.complements||{},
    links:intake?.links||[],
    score:{
      overall:Number.isFinite(overall)?overall:0,
      coverage_pct:100,
      status:'FINAL',
      scale:'0-10',
      indicators:indicators.map(x=>({name:clean(x?.name,200),score:Number(x?.score)||0})),
    },
    report,
    completed_at:completedAt||new Date().toISOString(),
    human_validation_required:true,
    route_signal:null,
  };
}

export async function syncRaioxV22ToCrm({ref,intake,report,session,completedAt}){
  const packet=buildRaioxV22CrmPacket({ref,intake,report,session,completedAt});
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(CRM_EDGE_URL,{
      method:'POST',
      signal:ctrl.signal,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
      body:JSON.stringify({ref,packet}),
    });
    let data={};
    try{data=await r.json();}catch{}
    if(!r.ok || !data?.ok){
      throw new Error(`CRM HTTP ${r.status}: ${data?.error||'sync_failed'}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
