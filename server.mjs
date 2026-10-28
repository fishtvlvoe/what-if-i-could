import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleChat } from './lib/chat.mjs';
const publicDir=fileURLToPath(new URL('./public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
export function createAppServer({env=process.env,chatHandler=handleChat}={}){
 const raw=env.BASE_PATH??'/what-if-i-could';
 const base=raw==='/'?'':raw.replace(/\/$/,'');
 if(base&&!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base))throw Error('Invalid BASE_PATH');
 return http.createServer(async(req,res)=>{
  const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
  try{
   const protocol=req.headers['x-forwarded-proto']?.split(',')[0].trim()==='https'?'https':'http';
   const origin=env.PUBLIC_ORIGIN?new URL(env.PUBLIC_ORIGIN).origin:`${protocol}://${req.headers.host}`;
   const url=new URL(req.url,origin);
   if(url.origin!==origin)return send(400,'{"error":"invalid_request"}');
   if(req.method==='GET'&&url.pathname==='/healthz')return send(200,'{"status":"ok"}');
   if(['GET','HEAD'].includes(req.method)&&(base&&(url.pathname==='/'||url.pathname===base))){res.writeHead(308,{Location:base+'/'});return res.end();}
   if(!url.pathname.startsWith(base+'/'))return send(404,'{"error":"not_found"}');
   const local=url.pathname.slice(base.length);
   if(local==='/api/chat'){
    if(req.method!=='POST')return send(405,'{"error":"method_not_allowed"}');
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>100000){send(413,'{"error":"context_limit"}');return;}chunks.push(chunk);}
    const headers=new Headers();for(const name of ['content-type','origin'])if(req.headers[name])headers.set(name,req.headers[name]);
    const request=new Request(url,{method:'POST',headers,body:Buffer.concat(chunks)});
    const result=await chatHandler(request,env);
    res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));
   }
   if(!['GET','HEAD'].includes(req.method))return send(405,'{"error":"method_not_allowed"}');
   const relative=local==='/'||local==='/index.html'?'index.html':decodeURIComponent(local).slice(1);
   if(relative!=='index.html'&&!relative.startsWith('assets/'))return send(404,'{"error":"not_found"}');
   const filename=await realpath(path.resolve(publicDir,relative));
   if(!filename.startsWith(publicDir)||relative.split('/').some(p=>p.startsWith('.')))return send(404,'{"error":"not_found"}');
   const type=types[path.extname(filename).toLowerCase()];if(!type)return send(404,'{"error":"not_found"}');
   const data=await readFile(filename);res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){if(!res.headersSent)send(error.code==='ENOENT'?404:500,'{"error":"server_error"}');else res.end();}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||8080);const server=createAppServer();
 server.listen(port,'0.0.0.0',()=>console.log(`What If I Could listening on port ${port}`));
}
