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
async function dataUrlToBlob(data:string, contentType:string) {
  const raw = data.includes(',') ? data.split(',')[1] : data;
  const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return new Blob([bytes], { type: contentType || 'image/jpeg' });
}
async function uploadMedia(userId:string, data:string, contentType:string, folder:string) {
  if (!data) return '';
  const ext = (contentType || 'image/jpeg').split('/')[1] || 'jpeg';
  const path = folder + '/' + userId + '-' + crypto.randomUUID() + '.' + ext;
  const blob = await dataUrlToBlob(data, contentType);
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: contentType || blob.type || 'image/jpeg', upsert:false });
  if (error) throw new Error('Media upload failed: ' + error.message);
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
  const rows = data || [];
  const ids = rows.map((p:any)=>p.id);
  let likes:any[] = [], comments:any[] = [];
  if (ids.length) {
    const [lr, cr] = await Promise.all([
      supabase.from('post_likes').select('post_id,user_id').in('post_id', ids),
      supabase.from('post_comments').select('id,post_id,author_id,text,created_at,profiles:author_id(*)').in('post_id', ids).order('created_at',{ascending:true})
    ]);
    if (lr.error) throw lr.error;
    if (cr.error) throw cr.error;
    likes = lr.data || [];
    comments = cr.data || [];
  }
  const me = await currentUser();
  return rows.map((p:any)=>{
    const pl = likes.filter(x=>x.post_id===p.id);
    const pc = comments.filter(x=>x.post_id===p.id);
    return {
      id:p.id,userId:p.author_id,text:p.text||'',photo:p.photo||undefined,
      photos:Array.isArray(p.photos)&&p.photos.length?p.photos:(p.photo?[p.photo]:[]),
      createdAt:new Date(p.created_at).getTime(),author:mapProfile(p.profiles),
      likes:pl.length, likedByMe:!!me && pl.some(x=>x.user_id===me.id),
      comments:pc.map((x:any)=>({id:x.id,postId:x.post_id,authorId:x.author_id,text:x.text,createdAt:new Date(x.created_at).getTime(),author:mapProfile(x.profiles)}))
    };
  });
}
export const auth = {
  async getUser(){ return currentUser(); },
  async signIn({email}:{email?:string} = {}){
    const clean = (email || '').trim();
    if (!clean) throw new Error('Please enter your email address.');
    const redirectTo = window.location.hostname === 'localhost'
      ? window.location.origin
      : 'https://naija-connect-cdp-esport.vercel.app/';
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options:{ emailRedirectTo: redirectTo }});
    if (error) throw error;
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
      const inputs = Array.isArray(body.photosData) ? body.photosData : (body.photoData ? [body.photoData] : []);
      const types = Array.isArray(body.photoContentTypes) ? body.photoContentTypes : [];
      const photos:string[] = [];
      for(let i=0;i<inputs.length;i++){
        if(inputs[i]) photos.push(await uploadMedia(u.id, inputs[i], types[i] || body.photoContentType || 'image/jpeg','posts'));
      }
      const {data,error}=await supabase.from('posts').insert({author_id:u.id,text:body.text||'',photo:photos[0]||null,photos}).select('*, profiles:author_id(*)').single();
      if(error) throw error;
      return {data:{post:{id:data.id,userId:data.author_id,text:data.text,photo:data.photo||undefined,photos,createdAt:new Date(data.created_at).getTime(),author:mapProfile(data.profiles),likes:0,likedByMe:false,comments:[]}}};
    }
    if(path==='/api/post-likes'){
      const {data:existing}=await supabase.from('post_likes').select('post_id').eq('post_id',body.postId).eq('user_id',u.id).maybeSingle();
      if(existing) {
        const {error}=await supabase.from('post_likes').delete().eq('post_id',body.postId).eq('user_id',u.id); if(error) throw error;
      } else {
        const {error}=await supabase.from('post_likes').insert({post_id:body.postId,user_id:u.id}); if(error) throw error;
      }
      const {count,error}=await supabase.from('post_likes').select('*',{count:'exact',head:true}).eq('post_id',body.postId); if(error) throw error;
      return {data:{liked:!existing,likes:count||0}};
    }
    if(path==='/api/post-comments'){
      const text=String(body.text||'').trim(); if(!text) throw new Error('Comment cannot be empty.');
      const {data,error}=await supabase.from('post_comments').insert({post_id:body.postId,author_id:u.id,text}).select('id,post_id,author_id,text,created_at,profiles:author_id(*)').single();
      if(error) throw error;
      return {data:{comment:{id:data.id,postId:data.post_id,authorId:data.author_id,text:data.text,createdAt:new Date(data.created_at).getTime(),author:mapProfile(data.profiles)}}};
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
