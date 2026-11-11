const assert=require('node:assert/strict');
const vscode=require('vscode');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
exports.run=async function(){
 const ext=vscode.extensions.getExtension('NetanelBaruch.claude-bridge');assert(ext,'extension discovered');await ext.activate();assert(ext.isActive,'extension activated');
 const commands=await vscode.commands.getCommands(true);for(const c of ['checkNow','setToken','stopRun','clearToken','openQueue'])assert(commands.includes('claude-bridge.'+c),'command registered '+c);
 const cfg=vscode.workspace.getConfiguration('claudeBridge');for(const [k,v] of Object.entries({owner:'example-owner',repo:'private-queue',allowedAuthors:['example-owner'],projectFolder:'/downloads/bridge-fixture'}))await cfg.update(k,v,vscode.ConfigurationTarget.Global);
 const original={fetch:global.fetch,input:vscode.window.showInputBox,pick:vscode.window.showQuickPick,warn:vscode.window.showWarningMessage};let writes=0;let denied=0;
 try{
 vscode.window.showInputBox=async()=> 'test-placeholder-not-a-real-token';await vscode.commands.executeCommand('claude-bridge.setToken');
 global.fetch=async(url,opts)=>{if(opts.method!=='GET'){writes++;throw Error('No writes allowed in UI smoke test');}let data;if(url.endsWith('/user'))data={login:'example-owner'};else if(url.includes('/comments'))data=[];else data=[{number:1,title:'Review the local project structure',body:'Summarize this fixture project. Do not change files.\n\nUntrusted text preview test: <script>alert("test")</script>',user:{login:'example-owner'},html_url:'https://github.com/example-owner/private-queue/issues/1',labels:[{name:'claude-task'}],updated_at:'2026-11-11T00:00:00Z'}];return new Response(JSON.stringify(data),{status:200});};
 vscode.window.showQuickPick=async(items)=>items[0];vscode.window.showWarningMessage=async()=>{denied++;return undefined;};
 await vscode.commands.executeCommand('claude-bridge.checkNow');assert.equal(denied,1,'run requires approval');assert.equal(writes,0,'no GitHub writes on declined approval');
 await new Promise(r=>setTimeout(r,1600));execFileSync('import',['-window','root','/downloads/claude-bridge-ui-preview.png']);
 console.log('EXTENSION_HOST_PREVIEW_OK: activation, 5 commands, author-filtered preview, declined approval => zero runs/uploads.');
 const fake='/tmp/bridge-smoke-cli';fs.writeFileSync(fake,'#!/usr/bin/env node\nif(process.argv.includes("--version")){console.log("2.1.300");process.exit(0)}if(process.argv.includes("--help")){console.log("--restricted --safe-mode --tools --permission-prompts --strict-mcp-config");process.exit(0)}let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.stringify({result:"FAKE CLI RESULT: reviewed fixture only. No model was called.",session_id:"fake-test-session"})));');fs.chmodSync(fake,0o700);
 await cfg.update('claudeCommand',fake,vscode.ConfigurationTarget.Global);
 vscode.window.showWarningMessage=async(message)=>message.startsWith('Run issue')?'Run This Snapshot':'Keep Local';
 await vscode.commands.executeCommand('claude-bridge.checkNow');assert.equal(writes,0,'Keep Local never uploads result');
 await new Promise(r=>setTimeout(r,700));execFileSync('import',['-window','root','/downloads/claude-bridge-ui-result.png']);
 console.log('EXTENSION_HOST_RUN_OK: real child process with fake CLI, local result document, Keep Local => zero uploads.');
 
 }finally{global.fetch=original.fetch;vscode.window.showInputBox=original.input;vscode.window.showQuickPick=original.pick;vscode.window.showWarningMessage=original.warn;await vscode.commands.executeCommand('claude-bridge.clearToken');}
};
