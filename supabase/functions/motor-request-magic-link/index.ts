import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN_E4="https://ym-raiox-backend-git-vos-etapa4-mo-64ac7a-ym-marketing-negocios.vercel.app";
const ORIGIN_E5="https://ym-raiox-backend-git-vos-etapa5-cr-022cc5-ym-marketing-negocios.vercel.app";
const PROD_ORIGIN="https://ymnegocios.com.br";
const ALLOWED_ORIGINS=new Set([ORIGIN_E4,ORIGIN_E5,PROD_ORIGIN,"http://localhost:3000","http://localhost:5173"]);
const FROM="YM Marketing & Negócios <acesso@ymnegocios.com.br>";
function headers(origin:string|null){return{"Access-Control-Allow-Origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:ORIGIN_E5,"Access-Control-Allow-Headers":"content-type, apikey, x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:headers(origin)});}
function validEmail(v:unknown){return typeof v==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())&&v.length<=240;}
function safeNext(v:unknown){const s=typeof v==="string"?v:"/CRM";return /^\/(CRM|MOTOR|Identidade)(?:[/?#]|$)/.test(s)?s:"/CRM";}
function callbackOrigin(origin:string|null){return origin&&ALLOWED_ORIGINS.has(origin)?origin:ORIGIN_E5;}
function html(link:string,code:string){return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#102b45"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #dce5f0"><tr><td style="background:#0A2540;color:#fff;padding:28px 32px"><b style="letter-spacing:.1em;font-size:12px">YM MARKETING & NEGÓCIOS</b><div style="font-size:27px;font-weight:800;margin-top:10px">Definir ou recuperar senha</div></td></tr><tr><td style="padding:32px"><p style="line-height:1.6">Use este link somente para criar ou trocar sua senha da área interna YM.</p><p style="font-size:12px;color:#687b91">Solicitação: <b>${code}</b></p><a href="${link}" style="display:inline-block;background:#0066FF;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:800">Definir minha senha</a><p style="font-size:12px;color:#687b91;line-height:1.5;margin-top:22px">Depois disso, CRM, MOTOR e Identidade usam a mesma sessão. Se você não solicitou a alteração, ignore este e-mail.</p></td></tr></table></td></tr></table></body></html>`;}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false},origin);return new Response(null,{status:204,headers:headers(origin)});}
 if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
 if(origin&&!ALLOWED_ORIGINS.has(origin))return reply(403,{ok:false,error:"origin_not_allowed"},origin);
 let body:any;try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_json"},origin);}
 if(!validEmail(body?.email))return reply(400,{ok:false,error:"invalid_email"},origin);
 const email=String(body.email).trim().toLowerCase(),next=safeNext(body?.next);
 const su=Deno.env.get("SUPABASE_URL"),sk=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),rk=Deno.env.get("RESEND_API_KEY");
 if(!su||!sk||!rk)return reply(503,{ok:false,error:"auth_not_configured"},origin);
 const admin=createClient(su,sk,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:access,error:ae}=await admin.from("vos_internal_access").select("role,active").eq("email",email).maybeSingle();
 if(ae)return reply(503,{ok:false,error:"access_check_failed"},origin);
 const generic={ok:true,message:"Se o e-mail estiver autorizado, você receberá as instruções para definir a senha."};
 if(!access||access.active!==true){await admin.from("vos_access_audit").insert({email,role:access?.role||null,event:"PASSWORD_SETUP_DENIED"});return reply(200,generic,origin);}
 const created=await admin.auth.admin.createUser({email,email_confirm:true});
 if(created.error&&!/already|registered|exists/i.test(created.error.message||""))return reply(503,{ok:false,error:"auth_provision_failed"},origin);
 const {data,error}=await admin.auth.admin.generateLink({type:"recovery",email});
 const props:any=data?.properties||{},tokenHash=props.hashed_token||props.hashedToken;
 if(error||!tokenHash){console.error("recovery link",error?.message);return reply(503,{ok:false,error:"password_link_generation_failed"},origin);}
 const code=crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
 const link=`${callbackOrigin(origin)}/interno/redefinir?token_hash=${encodeURIComponent(tokenHash)}&next=${encodeURIComponent(next)}`;
 const resend=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${rk}`,"Content-Type":"application/json"},body:JSON.stringify({from:FROM,to:[email],subject:`Definir senha · ${code} | YM Marketing & Negócios`,html:html(link,code),text:`YM Marketing & Negócios\nDefinir ou recuperar senha\n${link}\nSolicitação ${code}`})});
 if(!resend.ok){console.error("resend",resend.status,(await resend.text()).slice(0,400));return reply(503,{ok:false,error:"resend_send_failed"},origin);}
 await admin.from("vos_access_audit").insert({email,role:access.role,event:"PASSWORD_SETUP_SENT",metadata:{next,request_code:code,provider:"resend"}});
 return reply(200,generic,origin);
});
