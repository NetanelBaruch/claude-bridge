import { createHash } from 'crypto';
import { realpathSync, statSync } from 'fs';
import { isAbsolute } from 'path';
import { IssueComment, TaskIssue } from './types';

export function validRepoPart(v: string): boolean { return /^[A-Za-z0-9_.-]+$/.test(v) && v !== '.' && v !== '..'; }
export function authorAllowed(author: string, allowed: string[]): boolean { return allowed.some(a => a.toLowerCase() === author.toLowerCase()); }
export function projectPath(path: string): string {
  if (!isAbsolute(path)) throw new Error('Choose an absolute local project folder.');
  const resolved = realpathSync(path);
  if (!statSync(resolved).isDirectory()) throw new Error('Project folder is not a directory.');
  return resolved;
}
export function queueKey(owner:string, repo:string, cwd:string):string {
  return createHash('sha256').update(JSON.stringify([owner.toLowerCase(),repo.toLowerCase(),cwd])).digest('hex');
}
export function taskSnapshot(issue:TaskIssue, comments:IssueComment[]):string {
  return createHash('sha256').update(JSON.stringify([issue.number,issue.title,issue.body,issue.author,comments.map(c=>[c.id,c.author,c.body])])).digest('hex');
}
export function escapeHtml(text:string):string {return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
