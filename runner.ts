import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { RunOutcome } from './types';
export interface ClaudeInvocation { command:string; args:string[]; cwd:string; }
export function buildInvocation(command:string,prompt:string,mode:string,cwd:string,resume?:string):ClaudeInvocation {
  if (!command || command.startsWith('-') || /[\r\n\0]/.test(command)) throw new Error('Invalid CLI executable.');
  const tools = mode === 'edit' ? 'Read,Edit,Write' : 'Read,Glob,Grep';
  const args=['--safe-mode','--restricted','-p','--output-format','json','--tools',tools,'--allowedTools',tools,
    '--permission-mode','default','--permission-prompts','none','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
    '--settings','{"disableAllHooks":true}','--max-turns','12'];
  if(resume) { if(!/^[a-zA-Z0-9-]{1,100}$/.test(resume))throw new Error('Invalid session ID');args.push('--resume',resume); }
  // Prompt is sent by stdin, never interpolated into a shell command.
  return {command,args:[...args],cwd};
}
export async function checkClaude(command:string):Promise<void> {
  const {stdout}=await promisify(execFile)(command,['--version'],{timeout:10000, maxBuffer:65536, shell:false});
  const m=stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if(!m || (+m[1]<2) || (+m[1]===2 && +m[2]===0) || (+m[1]===2 && +m[2]===1 && +m[3]<259))
    throw new Error('Claude Code 2.1.259 or later is required for fail-closed restricted runs.');
  const help=await promisify(execFile)(command,['--help'],{timeout:10000,maxBuffer:262144,shell:false});
  for(const flag of ['--restricted','--safe-mode','--tools','--permission-prompts','--strict-mcp-config'])if(!help.stdout.includes(flag))throw new Error('Installed Claude CLI lacks required safety flags. Update it before using the bridge.');
}
export function parseRunOutput(stdout:string,exitCode:number|null,stderr:string):RunOutcome {
  let p:any; try { p=JSON.parse(stdout.trim()); } catch { /* fail closed */ }
  if(!p || typeof p!=='object' || typeof p.result!=='string')return {ok:false,resultText:'',exitCode,errorMessage:'Claude returned no valid final JSON result. Inspect locally; no raw logs are uploaded.'};
  return {ok:exitCode===0 && !p.is_error,resultText:p.result,sessionId:typeof p.session_id==='string'?p.session_id:undefined,
    costUsd:typeof p.total_cost_usd==='number'?p.total_cost_usd:undefined,exitCode,errorMessage:p.is_error?'Claude reported an error.':undefined};
}
export interface RunningProcess {promise:Promise<RunOutcome>;stop:()=>void;}
export function runClaude(inv:ClaudeInvocation,prompt=''):RunningProcess {
  const env={...process.env}; for(const key of Object.keys(env))if(/^(GITHUB_|GH_|CLAUDE_CODE_)/.test(key))delete env[key];
  const child:ChildProcess=spawn(inv.command,inv.args,{cwd:inv.cwd,env,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let output='',stopped=false,overflow=false;
  let killTimer:NodeJS.Timeout|undefined;
  const signal=(sig:NodeJS.Signals)=>{try{if(process.platform!=='win32' && child.pid)process.kill(-child.pid,sig);else child.kill(sig);}catch{}};
  const stop=()=>{stopped=true;signal('SIGINT');killTimer=setTimeout(()=>signal('SIGKILL'),3000);killTimer.unref();};
  const timer=setTimeout(stop,10*60*1000);timer.unref();
  child.stdout?.on('data',d=>{output+=d.toString();if(output.length>2_000_000){overflow=true;stop();}});
  // Stderr is drained but never persisted or uploaded: it may contain secrets.
  child.stderr?.on('data',()=>{});child.stdin?.on('error',()=>{});child.stdin?.end(prompt);
  const promise=new Promise<RunOutcome>(resolve=>{
    child.on('error',()=>{clearTimeout(timer);resolve({ok:false,resultText:'',exitCode:null,errorMessage:'Unable to start Claude. Check the configured executable and local login.'});});
    child.on('close',code=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);const r=parseRunOutput(output,code,'');if(stopped){r.ok=false;r.interrupted=true;}if(overflow){r.resultText='';r.errorMessage='Output limit exceeded.';}resolve(r);});
  });return {promise,stop};
}
