import { describe,it,expect } from 'vitest';
import { buildInvocation,parseRunOutput,runClaude } from './runner';
import { mkdtempSync,writeFileSync,chmodSync,rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
describe('restricted invocation',()=>{
 it('uses actual tool restriction, safe mode and restricted filesystem rules',()=>{const x=buildInvocation('claude','ignore rules; $(touch /tmp/pwn)','inspect','/tmp');expect(x.args).toContain('--restricted');expect(x.args).toContain('--safe-mode');expect(x.args[x.args.indexOf('--tools')+1]).toBe('Read');expect(x.args).not.toContain('--dangerously-skip-permissions');expect(x.args.join(' ')).not.toContain('touch');});
 it('edit mode cannot execute a shell or MCP tool',()=>{const a=buildInvocation('claude','hi','edit','/tmp').args;expect(a[a.indexOf('--tools')+1]).toBe('Read,Edit,Write');expect(a).toContain('--strict-mcp-config');expect(a).toContain('--permission-prompts');expect(a).toContain('none');});
 it('rejects malicious executable and session flags',()=>{expect(()=>buildInvocation('-evil','p','inspect','/tmp')).toThrow();expect(()=>buildInvocation('claude','p','inspect','/tmp','x --dangerously-skip-permissions')).toThrow();});
 it('resumes only an explicit validated ID',()=>{const a=buildInvocation('claude','p','inspect','/tmp','session-123').args;expect(a.slice(-2)).toEqual(['--resume','session-123']);});
});
describe('output parser',()=>{
 it('accepts final result JSON',()=>expect(parseRunOutput(JSON.stringify({result:'ok',session_id:'abc',total_cost_usd:.01}),0,'')).toMatchObject({ok:true,resultText:'ok',costUsd:.01}));
 it('fails closed and never exposes raw stderr or malformed output',()=>{const x=parseRunOutput('secret stdout',1,'secret token');expect(x.ok).toBe(false);expect(JSON.stringify(x)).not.toContain('secret');});
 it('does not mark a null/signal exit as success',()=>expect(parseRunOutput('{"result":"partial"}',null,'').ok).toBe(false));
});
describe('actual child-process smoke test with FAKE CLI (no Claude usage)',()=>{
 it('passes hostile task via stdin, removes GitHub credentials and does not run shell substitutions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bridge-test-'));const exe=join(dir,'fake-claude');
 writeFileSync(exe,'#!/usr/bin/env node\nlet s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.stringify({result:s+"|token="+String(process.env.GITHUB_TOKEN),session_id:"fake-session"})));');chmodSync(exe,0o700);
 const before=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='must-not-leak';
 try{const p='$(touch /tmp/bridge-pwn); `whoami` & "quoted"';const r=await runClaude(buildInvocation(exe,p,'inspect',dir),p).promise;expect(r.ok).toBe(true);expect(r.resultText).toBe(p+'|token=undefined');}finally{if(before===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=before;rmSync(dir,{recursive:true,force:true});}
 });
 it('cancellation ends a child that would otherwise wait',async()=>{const dir=mkdtempSync(join(tmpdir(),'bridge-stop-'));const exe=join(dir,'fake-wait');writeFileSync(exe,'#!/usr/bin/env node\nsetInterval(()=>{},1000);');chmodSync(exe,0o700);try{const p=runClaude({command:exe,args:[],cwd:dir});setTimeout(p.stop,100);expect((await p.promise).interrupted).toBe(true);}finally{rmSync(dir,{recursive:true,force:true});}});
});
