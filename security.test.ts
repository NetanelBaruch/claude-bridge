import {describe,it,expect} from 'vitest';
import {authorAllowed,queueKey,taskSnapshot,escapeHtml,validRepoPart,projectPath} from './security';
const issue={number:1,title:'task',body:'hello',url:'url',labels:[],updatedAt:'now',author:'alice'};
describe('approval and identity',()=>{
 it('author allowlist is exact and case insensitive, not content based',()=>{expect(authorAllowed('ALICE',['alice'])).toBe(true);expect(authorAllowed('mallory',['alice'])).toBe(false);expect(authorAllowed('alice-attacker',['alice'])).toBe(false);});
 it('binds approval to body, author and comment contents',()=>{const c=[{id:3,body:'yes',author:'alice',createdAt:'now'}];const hash=taskSnapshot(issue,c);expect(taskSnapshot({...issue,body:'new instruction'},c)).not.toBe(hash);expect(taskSnapshot(issue,[{...c[0],body:'edited'}])).not.toBe(hash);expect(taskSnapshot({...issue,author:'mallory'},c)).not.toBe(hash);});
 it('sessions are isolated across queue and project',()=>{const k=queueKey('a','q','/one');expect(queueKey('a','q2','/one')).not.toBe(k);expect(queueKey('a','q','/two')).not.toBe(k);});
 it('escapes hostile HTML in task preview',()=>expect(escapeHtml('<script>"attack"</script>')).toBe('&lt;script&gt;&quot;attack&quot;&lt;/script&gt;'));
 it('rejects path traversal in queue settings and relative cwd',()=>{expect(validRepoPart('../evil')).toBe(false);expect(validRepoPart('good-repo')).toBe(true);expect(()=>projectPath('../outside')).toThrow();});
});
