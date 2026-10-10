import {describe,it,expect} from 'vitest';
import {getTask} from '../../packages/task-registry/src/index';
import {ecosystemApps} from '../../packages/app-registry/src/index';
import {getStructuredContract,validateStructuredText} from '../../packages/structured-output/src/index';
import {prompts} from '../../packages/prompt-registry/src/index';
describe('affiliate AI-first product strategy',()=>{
 it('is free-only and available for NestAffiliate',()=>{
  const task=getTask('affiliate.pin.strategy');
  expect(task.allowedProviders).toEqual(['groq','cloudflare']);
  expect(task.blockedProviders).toContain('gemini');
  expect(task.modality).toBe('text');
  expect(ecosystemApps.find(a=>a.appId==='nestaffiliate')?.allowedTasks).toContain(task.id);
  expect(prompts[task.id]).toBeDefined();
  expect(getStructuredContract(task.id)).not.toBeNull();
 });
 it('validates distinct copy choices, strategy, and uncertainty shape',()=>{
  const payload={
   productType:'Jogo de panelas',buyerIntent:'Buscar um novo conjunto para a cozinha',
   audience:'Pessoas que cozinham em casa',positioning:'Mostrar composição do jogo',
   factsUsed:['10 peças','preto e bege'],unknowns:['material não verificado'],
   angles:['Visual da cozinha','Pesquisa de produto','Dúvidas de composição'],
   titles:['Jogo de panelas 10 peças: veja o conjunto preto e bege','Panelas em preto e bege para conhecer melhor','Vai trocar as panelas? Confira as 10 peças'],
   descriptions:[
     'Conheça este jogo de panelas com 10 peças em preto e bege. Confira as imagens e os itens que compõem o conjunto no anúncio antes de decidir. Conteúdo com link de afiliado.',
     'Está procurando panelas? Explore o visual deste conjunto, compare as peças e consulte os detalhes atualizados da oferta para decidir com calma. Conteúdo com link de afiliado.',
   ],
   keywords:['jogo de panelas','panelas 10 peças','conjunto de panelas','panelas preto e bege','cozinha'],
   recommendedBoard:'Panelas e utensílios para cozinha',
   headline:'Conheça este jogo de panelas',cta:'Ver detalhes',
  };
  expect(validateStructuredText('affiliate.pin.strategy',JSON.stringify(payload))).toEqual(payload);
  expect(()=>validateStructuredText('affiliate.pin.strategy',JSON.stringify({...payload,titles:['apenas uma']}))).toThrow();
 });
});