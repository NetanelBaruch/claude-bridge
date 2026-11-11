import * as vscode from 'vscode';
import { mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { GitHubClient } from './github';
import { buildTaskPrompt, buildFollowupPrompt, formatResultComment } from './prompts';
import { buildInvocation, checkClaude, runClaude, RunningProcess } from './runner';
import { authorAllowed, escapeHtml, projectPath, queueKey, taskSnapshot, validRepoPart } from './security';
import { TaskIssue, IssueComment } from './types';

const TOKEN='claude-bridge.githubToken';
type Config={owner:string;repo:string;taskLabel:string;projectFolder:string;claudeCommand:string;runMode:string;allowedAuthors:string[];poll:number;max:number};
type Checkpoint={cursor:number;session?:string;issueHash:string;publishedIds?:number[]};
function config():Config {
  const c=vscode.workspace.getConfiguration('claudeBridge');
  // Never trust executable, queue destination or tool profiles from repository settings.
  const get=<T>(key:string,fallback:T):T=>c.inspect<T>(key)?.globalValue ?? fallback;
  const x={owner:get('owner',''),repo:get('repo',''),taskLabel:get('taskLabel','claude-task'),projectFolder:get('projectFolder',''),claudeCommand:get('claudeCommand','claude'),runMode:get('runMode','inspect'),allowedAuthors:get<string[]>('allowedAuthors',[]),poll:Math.max(60,get('pollIntervalSeconds',300)),max:Math.max(1000,Math.min(50000,get('maxResultChars',50000)))};
  if(!['inspect','edit'].includes(x.runMode))throw new Error('Invalid run profile.');return x;
}
function preview(title:string,text:string):vscode.WebviewPanel {
  const panel=vscode.window.createWebviewPanel('claudeBridgePreview',title,vscode.ViewColumn.One,{enableScripts:false,localResourceRoots:[]});
  panel.webview.html=`<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>body{font-family:var(--vscode-font-family);padding:24px;max-width:1000px}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(text)}</pre></body></html>`;
  return panel;
}
class Bridge implements vscode.Disposable {
  private timer?:NodeJS.Timeout;private busy=false;private current?:RunningProcess;private disposed=false;
  private status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);
  private disposables:vscode.Disposable[]=[];
  constructor(private ctx:vscode.ExtensionContext){this.status.text='$(plug) Claude Bridge';this.status.command='claude-bridge.checkNow';this.status.tooltip='Review queued tasks. Nothing runs automatically.';this.status.show();this.disposables.push(vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('claudeBridge'))this.start();}));}
  start(){if(this.timer)clearInterval(this.timer);try{this.timer=setInterval(()=>void this.check(false),config().poll*1000);}catch{this.status.text='$(warning) Bridge: settings';}}
  async setToken(){const t=await vscode.window.showInputBox({password:true,ignoreFocusOut:true,prompt:'Fine-grained GitHub token: one private queue repo, Issues read/write only. Stored locally in SecretStorage.'});if(t?.trim())await this.ctx.secrets.store(TOKEN,t.trim());}
  async clearToken(){await this.ctx.secrets.delete(TOKEN);vscode.window.showInformationMessage('Claude Bridge: token removed.');}
  openQueue(){const c=config();if(validRepoPart(c.owner)&&validRepoPart(c.repo))void vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${c.owner}/${c.repo}/issues`));}
  stop(){this.current?.stop();}
  private checkpointPath(key:string){const dir=join(this.ctx.globalStorageUri.fsPath,'checkpoints');mkdirSync(dir,{recursive:true,mode:0o700});return join(dir,key+'.json');}
  private readCheckpoint(key:string):Checkpoint|undefined {try{return JSON.parse(readFileSync(this.checkpointPath(key),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new Error('Checkpoint unreadable. Inspect local state before retrying.');}}
  private writeCheckpoint(key:string,value:Checkpoint){const p=this.checkpointPath(key),tmp=p+'.tmp';writeFileSync(tmp,JSON.stringify(value),{mode:0o600});renameSync(tmp,p);}
  private async connect(){
    if(!vscode.workspace.isTrusted)throw new Error('Trust this workspace before using Claude Bridge.');
    if(vscode.env.remoteName)throw new Error('This release runs only in a local VS Code window. Remote/WSL support is not verified.');
    const cfg=config();if(!validRepoPart(cfg.owner)||!validRepoPart(cfg.repo))throw new Error('Set the queue owner and repo in User Settings.');
    const token=await this.ctx.secrets.get(TOKEN);if(!token)throw new Error('Run Claude Bridge: Set GitHub Token first.');
    const client=new GitHubClient(token,cfg.owner,cfg.repo);const login=await client.authenticatedLogin();
    const allowed=cfg.allowedAuthors.length?cfg.allowedAuthors:[login];
    const root=cfg.projectFolder || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if(!root)throw new Error('Open a local project folder first.');
    const cwd=projectPath(root);const q=queueKey(cfg.owner,cfg.repo,cwd);
    return {cfg,client,login,allowed,cwd,q};
  }
  async check(manual:boolean){
    if(this.busy||this.disposed)return;this.busy=true;
    try{
      const c=await this.connect();const issues=await c.client.listOpenTasks(c.cfg.taskLabel);
      const pending:{issue:TaskIssue;comments:IssueComment[];checkpoint?:Checkpoint;key:string}[]=[];
      for(const issue of issues){
        if(!authorAllowed(issue.author||'',c.allowed))continue;
        const key=`task.${c.q}.${issue.number}`;const checkpoint=this.readCheckpoint(key);
        const comments=(await c.client.listComments(issue.number)).filter(x=>authorAllowed(x.author,c.allowed));
        const fresh=comments.filter(x=>x.id>(checkpoint?.cursor??0)&&!checkpoint?.publishedIds?.includes(x.id));
        if(!checkpoint || fresh.length)pending.push({issue,comments:fresh,checkpoint,key});
      }
      this.status.text=`$(plug) Bridge: ${pending.length} pending`;
      if(!manual)return;
      if(!pending.length){void vscode.window.showInformationMessage('Claude Bridge: no pending tasks from allowed authors.');return;}
      const pick=await vscode.window.showQuickPick(pending.map((t,i)=>({label:`#${t.issue.number} ${t.issue.title}`,description:`@${t.issue.author}${t.checkpoint?' - follow-up':''}`,index:i})),{title:'Claude Bridge: select a task to REVIEW, not run'});
      if(!pick)return;const task=pending[pick.index];
      const prompt=task.checkpoint?buildFollowupPrompt(task.comments):buildTaskPrompt(task.issue)+'\n\n'+(task.comments.length?buildFollowupPrompt(task.comments):'');
      if(prompt.length>100000)throw new Error('Task too large. Shorten it before running.');
      const details=`Queue: ${c.cfg.owner}/${c.cfg.repo} | Issue #${task.issue.number}\nAuthor: ${task.issue.author}\nProject folder: ${c.cwd}\nProfile: ${c.cfg.runMode} (no Bash/network/MCP tools)\nExecutable: ${c.cfg.claudeCommand}\n\nTASK SNAPSHOT\n\n${prompt}\n\nClaude reads local project files and sends context to your configured Claude provider. This is NOT an OS sandbox. Review the exact text above before approving. Results remain local until separately approved for upload.`;
      const panel=preview('Review local task',details);
      const approve=await vscode.window.showWarningMessage(`Run issue #${task.issue.number} locally? Review the open task preview first.`,{modal:true,detail:`Folder: ${c.cwd}\nProfile: ${c.cfg.runMode}\nQueue: ${c.cfg.owner}/${c.cfg.repo}\nClaude usage may count against your plan or incur API charges, depending on your local login. Local policies still apply.`},'Run This Snapshot');
      if(approve!=='Run This Snapshot')return;
      if(!vscode.workspace.isTrusted)throw new Error('Workspace trust changed.');
      if(JSON.stringify(config())!==JSON.stringify(c.cfg))throw new Error('Settings changed during review. Review again.');
      const updated=(await c.client.listOpenTasks(c.cfg.taskLabel)).find(x=>x.number===task.issue.number);
      const comments=(await c.client.listComments(task.issue.number)).filter(x=>authorAllowed(x.author,c.allowed)&&x.id>(task.checkpoint?.cursor??0)&&!task.checkpoint?.publishedIds?.includes(x.id));
      if(!updated || taskSnapshot(updated,comments)!==taskSnapshot(task.issue,task.comments))throw new Error('Task changed during review. Nothing ran. Review the new snapshot.');
      await checkClaude(c.cfg.claudeCommand);
      const lockDir=join(this.ctx.globalStorageUri.fsPath,'locks');mkdirSync(lockDir,{recursive:true});
      const lockPath=join(lockDir,`${queueKey('project','run',c.cwd)}.lock`);let fd:number;
      try{fd=openSync(lockPath,'wx',0o600);}catch{throw new Error('Task is locked by another window or an interrupted run. Close other bridge windows; inspect local lock before deleting it manually.');}
      try{
        if(JSON.stringify(this.readCheckpoint(task.key))!==JSON.stringify(task.checkpoint))throw new Error('Task state changed in another window. Review again.');
        this.status.text=`$(sync~spin) Bridge: running #${task.issue.number}`;
        this.current=runClaude(buildInvocation(c.cfg.claudeCommand,prompt,c.cfg.runMode,c.cwd,task.checkpoint?.session),prompt);
        const started=Date.now();const result=await this.current.promise;this.current=undefined;
        const checkpoint:Checkpoint={cursor:Math.max(task.checkpoint?.cursor??0,...comments.map(x=>x.id)),session:result.sessionId??task.checkpoint?.session,issueHash:taskSnapshot(task.issue,[]),publishedIds:task.checkpoint?.publishedIds??[]};
        // Checkpoint BEFORE any remote upload: reload does not rerun a completed task.
        this.writeCheckpoint(task.key,checkpoint);
        const output=formatResultComment(result,{issueNumber:task.issue.number,durationSeconds:(Date.now()-started)/1000,maxChars:c.cfg.max});
        const doc=await vscode.workspace.openTextDocument({content:output,language:'markdown'});await vscode.window.showTextDocument(doc);
        const action=await vscode.window.showWarningMessage('Review/edit the result document, then choose whether to publish it.',{modal:true,detail:`Destination: ${c.cfg.owner}/${c.cfg.repo} issue #${task.issue.number}. The ENTIRE current document will be uploaded as a GitHub comment. It may include private project data. Keep local unless you have checked every line.`},'Publish Reviewed Document','Keep Local');
        if(action==='Publish Reviewed Document'){
          const body=doc.getText();if(body.length>60000)throw new Error('Reviewed output exceeds GitHub comment limit. Nothing uploaded.');
          const id=await c.client.postComment(task.issue.number,body);
          checkpoint.publishedIds=[...(checkpoint.publishedIds??[]),id];this.writeCheckpoint(task.key,checkpoint);
          void vscode.window.showInformationMessage('Claude Bridge: reviewed result published.');
        }
      }finally{closeSync(fd!);try{unlinkSync(lockPath);}catch{}}
      panel.dispose();
    }catch(e){this.status.text='$(warning) Bridge: check needed';if(manual)void vscode.window.showErrorMessage(`Claude Bridge: ${(e as Error).message}`);}
    finally{this.busy=false;if(!this.current)this.status.text='$(plug) Claude Bridge';}
  }
  dispose(){if(this.disposed)return;this.disposed=true;if(this.timer)clearInterval(this.timer);this.stop();this.status.dispose();for(const d of this.disposables)d.dispose();}
}
export function activate(ctx:vscode.ExtensionContext){const b=new Bridge(ctx);ctx.subscriptions.push(b,...[
  ['checkNow',()=>b.check(true)],['stopRun',()=>b.stop()],['setToken',()=>b.setToken()],['clearToken',()=>b.clearToken()],['openQueue',()=>b.openQueue()]
].map(([name,fn])=>vscode.commands.registerCommand(`claude-bridge.${name}`,fn as (...args:any[])=>any)));b.start();}
export function deactivate(){}
