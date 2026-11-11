import {describe,it,expect,vi,afterEach} from 'vitest';
import {GitHubClient} from './github';
afterEach(()=>vi.unstubAllGlobals());
const client=()=>new GitHubClient('fake-token','owner','queue');
function mock(body:unknown,status=200){vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body),{status})));}
describe('GitHub client',()=>{
 it('maps author identity, filters PRs and encodes labels',async()=>{mock([{number:1,title:'task',body:'body',html_url:'url',user:{login:'alice'},labels:[{name:'task'}]},{number:2,pull_request:{}}]);const x=await client().listOpenTasks('task&evil');expect(x).toHaveLength(1);expect(x[0].author).toBe('alice');expect((fetch as any).mock.calls[0][0]).toContain('task%26evil');});
 it('rejects over-limit queues instead of losing tasks',async()=>{mock(Array(50).fill({}));await expect(client().listOpenTasks('task')).rejects.toThrow('50+');});
 it('rejects over-limit comment threads',async()=>{mock(Array(100).fill({}));await expect(client().listComments(1)).rejects.toThrow('100+');});
 it('never forwards remote errors which may contain secrets',async()=>{mock({message:'secret-string'},403);await expect(client().authenticatedLogin()).rejects.not.toThrow('secret-string');});
 it('uses only GitHub origin and returns published comment ID',async()=>{mock({id:9});expect(await client().postComment(1,'reviewed body')).toBe(9);expect((fetch as any).mock.calls[0][0]).toBe('https://api.github.com/repos/owner/queue/issues/1/comments');});
});
