import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = createClient(url, key);
const ADMIN_EMAIL = import.meta.env.VITE_NAIJA_CONNECT_ADMIN_EMAIL || '';

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  return u ? { ...u, userId: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Member' } : null;
}
function mapProfile(p:any) {
  if (!p) return null;
  return { id:p.id, userId:p.id, name:p.name, age:p.age, gender:p.gender, city:p.city, country:p.country, bio:p.bio||'', interests:p.interests||[], lookingFor:p.looking_for||'Dating / connection', photo:p.photo||undefined, online:p.online||false, verified:p.verified||false, latitude:p.latitude, longitude:p.longitude };
}
function dataUrlToBlob(data:string, contentType:string) {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return new Blob([bytes], { type: contentType || 'image/jpeg' });
}
async function uploadMedia(userId:string, data:string, contentType:string, folder:string) {
  if (!data) return '';
  const ext = (contentType || 'image/jpeg').split('/')[1] || 'jpeg';
  const path = folder + '/' + userId + '-' + crypto.randomUUID() + '.' + ext;
  const { error } = await supabase.storage.from('media').upload(path, dataUrlToBlob(data, contentType), { contentType, upsert:false });
  if (error) throw error;
  const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
  return pub.publicUrl;
}
async function getProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  return (data||[]).map(mapProfile);
}
async function getPosts() {
  const { data, error } = await supabase.from('posts').select('*, profiles:author_id(*)').order('created_at',{ascending:false});
  if (error) throw error;
  return (data||[]).map((p:any)=>({id:p.id,userId:p.author_id,text:p.text||'',photo:p.photo||undefined,createdAt:new Date(p.created_at).getTime(),author:mapProfile(p.profiles)}));
}
export const auth = {
  async getUser(){ return currentUser(); },
  async signIn(){
    const email = window.prompt('Enter your email address to receive a secure NaijaConnect sign-in link:');
    if (!email) throw new Error('Sign-in cancelled');
    const { error } = await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: window.location.origin }});
    if (error) throw error;
    alert('Check your email for your secure NaijaConnect sign-in link.');
  },
  async signOut(){ await supabase.auth.signOut(); }
};
export const api = {
  async get(path:string) {
    const u = await currentUser();
    if (path === '/api/me') {
      if (!u) return {data:{profile:null}};
      const {data,error}=await supabase.from('profiles').select('*').eq('id',u.id).maybeSingle();
      if(error) throw error;
      return {data:{profile:mapProfile(data)}};
    }
    if (path === '/api/profiles') return {data:{profiles:await getProfiles()}};
    if (path === '/api/posts') return {data:{posts:await getPosts()}};
    if (path.startsWith('/api/admin/requests')) {
      if (!u || !ADMIN_EMAIL || u.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) throw new Error('Unauthorized');
      const {data,error}=await supabase.from('connection_requests').select('*').order('created_at',{ascending:false});
      if(error) throw error;
      return {data:{requests:(data||[]).map((r:any)=>({...r,userName:r.user_name,profileName:r.profile_name}))}};
    }
    if (path.startsWith('/api/admin/messages')) {
      if (!u) throw new Error('Unauthorized');
      const {data,error}=await supabase.from('admin_messages').select('*').eq('user_id',u.id).order('created_at',{ascending:false});
      if(error) throw error;
      return {data:{messages:(data||[]).map((m:any)=>({id:m.id,text:m.text,createdAt:new Date(m.created_at).getTime()}))}};
    }
    if (path.startsWith('/api/messages/')) {
      const other=path.split('/').pop();
      if(!u) throw new Error('Unauthorized');
      const {data,error}=await supabase.from('messages').select('*').or('sender_id.eq.'+u.id+',receiver_id.eq.'+u.id).order('created_at',{ascending:true});
      if(error) throw error;
      return {data:{messages:(data||[]).filter((m:any)=>m.sender_id===other||m.receiver_id===other).map((m:any)=>({id:m.id,senderId:m.sender_id,receiverId:m.receiver_id,text:m.text,createdAt:new Date(m.created_at).getTime()}))}};
    }
    throw new Error('Unsupported GET '+path);
  },
  async post(path:string, body:any) {
    const u=await currentUser(); if(!u) throw new Error('Sign in required');
    if(path==='/api/profile'){
      let photo=body.photoData ? await uploadMedia(u.id,body.photoData,body.photoContentType,'profiles') : undefined;
      const row={id:u.id,name:body.name,age:body.age,gender:body.gender,city:body.city,country:body.country||'Nigeria',bio:body.bio||'',interests:body.interests||[],looking_for:body.lookingFor||'Dating / connection',photo:photo||undefined};
      const {data,error}=await supabase.from('profiles').upsert(row).select().single(); if(error) throw error;
      return {data:{profile:mapProfile(data)}};
    }
    if(path==='/api/posts'){
      const photo=body.photoData ? await uploadMedia(u.id,body.photoData,body.photoContentType,'posts') : undefined;
      const {data,error}=await supabase.from('posts').insert({author_id:u.id,text:body.text||'',photo}).select('*, profiles:author_id(*)').single(); if(error) throw error;
      return {data:{post:{id:data.id,userId:data.author_id,text:data.text,photo:data.photo,createdAt:new Date(data.created_at).getTime(),author:mapProfile(data.profiles)}}};
    }
    if(path==='/api/likes'){
      const {data:existing}=await supabase.from('likes').select('*').eq('user_id',u.id).eq('profile_id',body.profileId).maybeSingle();
      if(!existing){const {error}=await supabase.from('likes').insert({user_id:u.id,profile_id:body.profileId});if(error)throw error;}
      const {data:back}=await supabase.from('likes').select('*').eq('user_id',body.profileId).eq('profile_id',u.id).maybeSingle();
      return {data:{matched:!!back}};
    }
    if(path==='/api/connection-requests'){
      const {data,error}=await supabase.from('connection_requests').insert({user_id:u.id,user_name:u.user_metadata?.full_name||u.email?.split('@')[0]||'Member',email:u.email||'',profile_id:body.profileId,profile_name:body.profileName}).select().single();if(error)throw error;return {data:{request:data}};
    }
    if(path==='/api/messages'){
      const {data,error}=await supabase.from('messages').insert({sender_id:u.id,receiver_id:body.receiverId,text:body.text}).select().single();if(error)throw error;return {data:{message:{id:data.id,senderId:data.sender_id,receiverId:data.receiver_id,text:data.text,createdAt:new Date(data.created_at).getTime()}}};
    }
    if(path==='/api/admin/messages'){
      if(!ADMIN_EMAIL || u.email?.toLowerCase()!==ADMIN_EMAIL.toLowerCase()) throw new Error('Unauthorized');
      const {data,error}=await supabase.from('admin_messages').insert({user_id:body.userId,text:body.text}).select().single();if(error)throw error;return {data:{message:data}};
    }
    if(path==='/api/subscriptions') return {data:{}};
    throw new Error('Unsupported POST '+path);
  }
};
export const ws = { connect(){ return { connectionId:null, onMessage(){}, ready:Promise.resolve(), disconnect(){} }; } };
