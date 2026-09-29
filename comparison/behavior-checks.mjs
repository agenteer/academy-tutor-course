// Shared course checks: run from a tutor project with Pi 0.87.1 installed.
// Usage: node ../comparison/behavior-checks.mjs tutor.js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const packageRoot = resolve('node_modules/@earendil-works/pi-coding-agent');
const dependencyRequire = createRequire(join(packageRoot,'package.json'));
const { loadExtensions, createExtensionRuntime } = await import(pathToFileURL(join(packageRoot,'dist/core/extensions/loader.js')));
const { createEventBus } = await import(pathToFileURL(join(packageRoot,'dist/core/event-bus.js')));
const Value = await import(pathToFileURL(dependencyRequire.resolve('typebox/value')));
const source = resolve(process.argv[2] || 'tutor.js');
const allCards = JSON.parse(readFileSync('cards.json', 'utf8'));
const report = [];
const line = (concept, dueAt) => JSON.stringify({concept, correctness:'partial',assisted:false,evidence:'Synthetic prior attempt.',reviewedAt:'2000-01-01T00:00:00.000Z',dueAt})+'\n';
async function fixture(cards, history='') {
 const cwd = mkdtempSync(join(tmpdir(), 'pi-generated-fixture-'));
 // Keep the tested project's installed dependencies available to dynamic imports.
 symlinkSync(resolve('node_modules'),join(cwd,'node_modules'),'dir');
 writeFileSync(join(cwd,'cards.json'),JSON.stringify(cards));
 const fixtureSource=join(cwd,'tutor.js');
 writeFileSync(fixtureSource,readFileSync(source));
 if(history) writeFileSync(join(cwd,'attempts.jsonl'),history);
 const sent=[],notifications=[];let active=[];
 const runtime=createExtensionRuntime();
 runtime.sendUserMessage=(message)=>sent.push(message);
 runtime.sendMessage=(message)=>notifications.push([message.content,'info']);
 runtime.setActiveTools=(tools)=>active=tools;
 runtime.getActiveTools=()=>active;
 const loaded=await loadExtensions([fixtureSource],cwd,createEventBus(),runtime);
 assert.deepEqual(loaded.errors,[]);
 assert.equal(loaded.extensions.length,1);
 const extension=loaded.extensions[0];
 const tool=extension.tools.get('record_attempt').definition;
 const ctx={cwd,hasUI:true,ui:{notify:(...args)=>notifications.push(args)}};
 // Command handlers receive waitForIdle in Pi. This fixture never starts a model,
 // so it is already idle; resolving here models that state without changing the tutor.
 const commandCtx={...ctx,waitForIdle:async()=>{}};
 return {cwd,sent,notifications,tool,extension,active:()=>active,
  start:()=>extension.commands.get('academy').handler('',commandCtx),
  record:(attempt)=>tool.execute('synthetic',attempt,undefined,undefined,ctx),
  history:()=>existsSync(join(cwd,'attempts.jsonl')) ? readFileSync(join(cwd,'attempts.jsonl'),'utf8') : '',
 };
}
const answer=(concept, correctness='correct',assisted=false)=>({concept,correctness,assisted,evidence:'Synthetic assessed answer for deterministic verification.'});
async function rejected(action){try{const result=await action();assert.equal(result?.isError,true,'expected rejection');}catch(e){if(e?.code==='ERR_ASSERTION')throw e;}}
function selection(text){
 for(let start=text.indexOf('[');start>=0;start=text.indexOf('[',start+1)){
  for(let end=text.lastIndexOf(']');end>start;end=text.lastIndexOf(']',end-1)){
   try { const value=JSON.parse(text.slice(start,end+1));if(Array.isArray(value)&&value.length&&value.every(x=>x.id&&x.mode))return value;} catch{}
  }
 }
 throw new Error('Could not find serialized selected cards with id and mode in startup message.');
}
async function check(name,fn,category='requested-contract'){try{await fn();report.push({name,category,status:'PASS'});}catch(e){report.push({name,category,status:category==='requested-contract'?'FAIL':'DIFFERENCE',error:e.message});}console.log(JSON.stringify(report.at(-1)));}
await check('real Pi loader registers /academy and record_attempt',async()=>{const f=await fixture([]);assert(f.extension.commands.has('academy'));assert(f.extension.tools.has('record_attempt'));});
await check('due first, then unseen; future excluded; latest line wins',async()=>{
 const cards=allCards.slice(0,4);const history=line(cards[1].id,'2000-01-01T00:00:00.000Z')+line(cards[2].id,'2000-01-01T00:00:00.000Z')+line(cards[2].id,'2999-01-01T00:00:00.000Z')+line(cards[3].id,'2000-01-01T00:00:00.000Z');
 const f=await fixture(cards,history);await f.start();assert.equal(f.sent.length,1);const queue=selection(f.sent[0]);assert.deepEqual(queue.map(x=>[x.id,x.mode==='learning'?'learn':x.mode]),[[cards[1].id,'review'],[cards[3].id,'review'],[cards[0].id,'learn']]);assert.deepEqual(f.active(),['read','record_attempt']);
});
await check('accepted attempt appends, schedules 3 days and returns remaining; duplicate/foreign rejected',async()=>{
 const cards=allCards.slice(0,2);const old=line(cards[0].id,'2000-01-01T00:00:00.000Z');const f=await fixture(cards,old);await f.start();const result=await f.record(answer(cards[0].id));const after=f.history();assert(after.startsWith(old));const rows=after.trim().split('\n').map(JSON.parse);assert.equal(rows.length,2);const saved=rows.at(-1);assert.equal(Date.parse(saved.dueAt)-Date.parse(saved.reviewedAt),3*86400000);assert.equal(saved.concept,cards[0].id);assert.deepEqual(result.details.remaining ?? result.details.remainingConcepts,[cards[1].id]);await rejected(()=>f.record(answer(cards[0].id)));await rejected(()=>f.record(answer('not-in-course')));assert.equal(f.history(),after);
});
await check('assisted correct, partial and incorrect all schedule 1 day',async()=>{
 // Supply assessments directly: this tests scheduling, not the model's judgment.
 const cases = [['correct', true], ['partial', false], ['incorrect', false]];
 for (const [correctness, assisted] of cases) {
  // Load the real extension in an isolated temporary course with no history.
  const f = await fixture([allCards[0]]);
  await f.start();
  await f.record(answer(allCards[0].id, correctness, assisted));

  // Read what the tool actually saved; the requirement is a one-day interval.
  const saved = JSON.parse(f.history().trim());
  const interval = Date.parse(saved.dueAt) - Date.parse(saved.reviewedAt);
  assert.equal(interval, 86400000); // One day in milliseconds.
 }
});
await check('schema rejects invalid correctness, assisted type and empty evidence',async()=>{
 const f=await fixture([]);const valid=answer(allCards[0].id);assert(Value.Check(f.tool.parameters,valid));for(const attempt of [{...valid,correctness:'perfect'},{...valid,assisted:'false'},{...valid,evidence:''}])assert.equal(Value.Check(f.tool.parameters,attempt),false);
});
await check('fresh instance reads persisted record and suppresses future concept without a model turn',async()=>{
 const f=await fixture([allCards[0]]);await f.start();await f.record(answer(allCards[0].id));const persisted=f.history();const next=await fixture([allCards[0]],persisted);await next.start();assert.equal(next.sent.length,0);assert(next.notifications.length>0);assert.equal(next.history(),persisted);
});
await check('empty course does not start a model turn',async()=>{const f=await fixture([]);await f.start();assert.equal(f.sent.length,0);assert(f.notifications.length>0);});
await check('malformed due date fails without a model turn or history mutation',async()=>{
 const old=line(allCards[0].id,'invalid-date');const f=await fixture([allCards[0]],old);let error;try{await f.start();}catch(e){error=e;}assert.equal(f.sent.length,0);assert.equal(f.history(),old);
 // An unrelated fixture error must not count as correct invalid-date handling.
 const mentionsInvalidDate=(message)=>/invalid.*(?:date|due)|(?:date|due).*invalid/i.test(String(message));
 assert((error && mentionsInvalidDate(error.message)) || f.notifications.some(x=>x[1]==='error' && mentionsInvalidDate(x[0])),'invalid date must be reported as an invalid-date error, not silently omitted');
},'additional-robustness');
writeFileSync(process.argv[3] || 'behavior-results.json',JSON.stringify({source,piVersion:JSON.parse(readFileSync(join(packageRoot,'package.json'))).version,checks:report},null,2)+'\n');
console.log(`${report.filter(x=>x.category==='requested-contract'&&x.status==='PASS').length}/7 requested-contract checks passed; additional robustness probe reported separately. Real file loader and disk fixtures, model not called.`);
process.exitCode=report.some(x=>x.status==='FAIL')?1:0;
