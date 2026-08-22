import assert from 'node:assert/strict';
const mod=await import('../lib/raiox-report-v2.js?test='+Date.now());
const packet={packet_version:'VOS_DIGITAL_INTAKE_2.0',report_version:'RX_REPORT_2.0',evidence:[{evidence_id:'ig-1',channel:'Instagram'}]};
const base={
 report_version:'RX_REPORT_2.0',headline:'Leitura digital',business_context:'Contexto curto',executive_synthesis:'A presença digital possui ativos e pontos a validar sem fechar causa.',
 digital_snapshot:{summary:'Resumo',primary_channel_reading:'Canal principal',evidence_coverage_reading:'Cobertura parcial'},
 journey_reading:{Encontrar:'a',Entender:'b',Confiar:'c',Avançar:'d',Sustentar:'e'},
 channel_readings:[{channel:'Instagram',reading:'O recorte mostra CTA visível.',strengths:['CTA'],attention:[],cannot_conclude:['conversão real'],sources:['RXD13','EV:ig-1'],confidence:'alta'}],
 cross_readings:[{title:'Percepção e recorte',reading:'Os dados se complementam.',sources:['RXD13','EV:ig-1'],confidence:'alta',type:'leitura'}],
 strengths:[{title:'Ativo',reading:'Mensagem clara.',sources:['RXD13']}],attention:[{title:'Validar',reading:'Comparar caminhos.',possible_impact:'Pode afetar avanço.',sources:['RXD12'],confidence:'media'}],
 hypotheses:[],quick_tests:[{title:'Teste',test:'Comparar CTA.',why:'Ajuda a observar avanço.',sources:['RXD14']}],not_to_conclude:['Não concluir conversão por print.'],
 destination:{strategic_destination:'Movimento desejado.',success_signal:'Sinal mensurável.'},next_validation:{reading:'Aprofundar canais.',questions:['Qual canal avança mais?']}
};
const v=mod._test.validate(structuredClone(base),packet);
assert.equal(v.report_version,'RX_REPORT_2.0');
assert.deepEqual(v.channel_readings[0].sources,['RXD13','EV:ig-1']);
assert.equal(v.cross_readings.length,1);
const badSource=structuredClone(base);badSource.channel_readings[0].sources=['RXD13','EV:nao-existe','HACK'];
const clean=mod._test.validate(badSource,packet);assert.deepEqual(clean.channel_readings[0].sources,['RXD13']);
const oneSource=structuredClone(base);oneSource.cross_readings[0].sources=['RXD13'];
assert.equal(mod._test.validate(oneSource,packet).cross_readings.length,0,'leitura cruzada exige duas fontes');
const forbidden=structuredClone(base);forbidden.executive_synthesis='A causa-raiz é falta de Instagram.';
assert.throws(()=>mod._test.validate(forbidden,packet),/fora_escopo/);
console.log('RX_REPORT_2.0 contract tests OK');
