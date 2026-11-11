import { IssueComment, TaskIssue } from './types';
export const BRIDGE_MARKER='<!-- claude-bridge:result -->';
/** Only the GitHub API origin is used. No endpoint is selected by issue content. */
export class GitHubClient {
 constructor(private token:string,private owner:string,private repo:string){}
 private async request<T>(method:string,path:string,body?:unknown):Promise<T>{
  const res=await fetch('https://api.github.com'+path,{method,headers:{Authorization:`Bearer ${this.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'claude-bridge-vscode'},signal:AbortSignal.timeout(20000),body:body===undefined?undefined:JSON.stringify(body)});
  if(!res.ok)throw new Error(`GitHub request failed (${res.status}). Check repository access or rate limits.`);
  return await res.json() as T;
 }
 async authenticatedLogin():Promise<string>{return (await this.request<{login:string}>('GET','/user')).login;}
 async listOpenTasks(label:string):Promise<TaskIssue[]>{
  const items=await this.request<any[]>('GET',`/repos/${this.owner}/${this.repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50`);
  if(items.length>=50)throw new Error('Queue has 50+ open tasks. Narrow the task label.');
  return items.filter(i=>!i.pull_request).map(i=>({number:i.number,title:i.title??'',body:i.body??'',url:i.html_url,author:i.user?.login??'',labels:(i.labels??[]).map((l:any)=>typeof l==='string'?l:l.name),updatedAt:i.updated_at}));
 }
 async listComments(n:number):Promise<IssueComment[]>{
  const items=await this.request<any[]>('GET',`/repos/${this.owner}/${this.repo}/issues/${n}/comments?per_page=100`);
  if(items.length>=100)throw new Error('Issue has 100+ comments. Start a new task issue.');
  return items.map(c=>({id:c.id,body:c.body??'',createdAt:c.created_at,author:c.user?.login??''}));
 }
 async postComment(n:number,body:string):Promise<number>{return (await this.request<{id:number}>('POST',`/repos/${this.owner}/${this.repo}/issues/${n}/comments`,{body})).id;}
}
