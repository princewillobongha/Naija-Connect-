import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = createClient(url, key);
const ADMIN_EMAIL = (import.meta.env.VITE_NAIJA_CONNECT_ADMIN_EMAIL || 'cinddycook@gmail.com').trim();
function isAdminUser(u:any) { return u?.app_metadata?.role === 'admin' || (Array.isArray(u?.app_metadata?.roles) && u.app_metadata.roles.includes('admin')) || u?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(); }

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  return u ? { ...u, userId: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Member' } : null;
}
function mapProfile(p:any) {
  if (!p) return null;
  const lastActive=p.last_active_at ? new Date(p.last_active_at).getTime() : 0;
  const online=lastActive ? Date.now()-lastActive < 15*60*1000 : !!p.online;
  return { id:p.id, userId:p.id, name:String(p.name||'Member'), age:Number(p.age||18), gender:p.gender||'', city:String(p.city||'Nigeria'), country:String(p.country||'Nigeria'), bio:String(p.bio||''), interests:Array.isArray(p.interests)?p.interests.map((x:any)=>String(x)).filter(Boolean):[], lookingFor:String(p.looking_for||'Dating / connection'), photo:p.photo||undefined, photos:Array.isArray(p.photos)?p.photos.filter(Boolean):(p.photo?[p.photo]:[]), online, verified:!!p.verified, adminBadge:!!p.admin_badge, latitude:p.latitude, longitude:p.longitude, lastActiveAt:p.last_active_at||undefined };
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
  const raw = data.includes(',') ? data.split(',')[1] : data;
  const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  const { error } = await supabase.storage.from('media').upload(path, bytes.buffer, { contentType: contentType || 'image/jpeg', cacheControl:'3600', upsert:false });
  if (error) throw new Error('Media upload failed: ' + error.message);
  const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
  return pub.publicUrl;
}
async function getProfiles() {
  const me = await currentUser();
  if (me) {
    await supabase.from('profiles').update({last_active_at:new Date().toISOString(),online:true}).eq('id',me.id);
  }
  const { data, error } = await supabase.from('profiles').select('*').order('created_at',{ascending:false});
  if (error) throw error;
  let rows = data || [];
  if (me) {
    const {data:blocked}=await supabase.from('profile_blocks').select('blocked_id').eq('blocker_id',me.id);
    const blockedIds=new Set((blocked||[]).map((x:any)=>x.blocked_id));
    rows=rows.filter((p:any)=>p.id!==me.id && !blockedIds.has(p.id));
  }
  return rows.map(mapProfile);
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
  async signInWithPassword(email:string, password:string){
    const clean = String(email || '').trim();
    if (!clean || !password) throw new Error('Enter your email and password.');
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
    if (error) throw error;
  },
  async requestPasswordReset(email:string, redirectTo:string){
    const clean = String(email || '').trim();
    if (!clean) throw new Error('Enter your email address.');
    const { error } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo });
    if (error) throw error;
  },
  async updatePassword(password:string){
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
  async signUpWithPassword(email:string, password:string){
    const clean = String(email || '').trim();
    if (!clean || !password) throw new Error('Enter your email and password.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    const { data, error } = await supabase.auth.signUp({ email: clean, password });
    if (error) throw error;
    return data;
  },
  async deleteMyAccount(){
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    await supabase.auth.signOut();
  },
  async signOut(){ await supabase.auth.signOut(); },
  onAuthStateChange(callback:(event:string, session:any)=>void){ return supabase.auth.onAuthStateChange(callback); }
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
    if (path === '/api/admin/reports') {
      if (!u || !isAdminUser(u)) throw new Error('Unauthorized');
      const {data,error}=await supabase.from('profile_reports').select('*').order('created_at',{ascending:false});
      if(error) throw error;
      const ids=Array.from(new Set((data||[]).flatMap((r:any)=>[r.reporter_id,r.reported_id]).filter(Boolean)));
      const {data:profiles,error:profilesError}=ids.length ? await supabase.from('profiles').select('*').in('id',ids) : {data:[],error:null};
      if(profilesError) throw profilesError;
      const byId=new Map((profiles||[]).map((p:any)=>[p.id,mapProfile(p)]));
      return {data:{reports:(data||[]).map((r:any)=>({id:r.id,reason:r.reason,details:r.details,status:r.status,createdAt:new Date(r.created_at).getTime(),reporter:byId.get(r.reporter_id)||null,reported:byId.get(r.reported_id)||null}))}};
    }
    if (path === '/api/admin/users') {
      if (!u || !isAdminUser(u)) throw new Error('Unauthorized');
      const {data:profiles,error:profilesError}=await supabase.from('profiles').select('*').order('created_at',{ascending:false});
      if(profilesError) throw profilesError;
      const {data:contacts,error:contactsError}=await supabase.from('user_contacts').select('user_id,phone');
      if(contactsError) throw contactsError;
      const phoneByUser=new Map((contacts||[]).map((c:any)=>[c.user_id,c.phone]));
      return {data:{users:(profiles||[]).filter((p:any)=>p.id!==u.id).map((p:any)=>({...mapProfile(p),phone:phoneByUser.get(p.id)||''}))}};
    }
    if (path === '/api/likes/me') {
      if (!u) throw new Error('Sign in required');
      const {data,error}=await supabase.from('likes').select('profile_id').eq('user_id',u.id);
      if(error) throw error;
      return {data:{likes:data||[]}};
    }
    if (path === '/api/posts') return {data:{posts:await getPosts()}};
    if (path.startsWith('/api/admin/requests')) {
      if (!u || !isAdminUser(u)) throw new Error('Unauthorized');
      const {data,error}=await supabase.from('connection_requests').select('*').order('created_at',{ascending:false});
      if(error) throw error;
      return {data:{requests:(data||[]).map((r:any)=>({...r,userName:r.user_name,profileName:r.profile_name}))}};
    }
    if (path === '/api/admin/messages/unread-count') {
      if (!u) throw new Error('Unauthorized');
      const isAdmin = isAdminUser(u);
      const query = supabase.from('admin_messages').select('id', { count:'exact', head:true }).is('read_at', null);
      const {count,error}=isAdmin ? await query.eq('sender_type','user') : await query.eq('user_id',u.id).eq('sender_type','admin');
      if(error) throw error;
      return {data:{count:count||0}};
    }
    if (path === '/api/admin/message-threads') {
      if (!u || !isAdminUser(u)) throw new Error('Unauthorized');
      const {data:rows,error}=await supabase.from('admin_messages').select('*').order('created_at',{ascending:false});
      if(error) throw error;
      const grouped=new Map<string,any>();
      for(const m of rows||[]){
        if(!grouped.has(m.user_id)) grouped.set(m.user_id,{userId:m.user_id,latest:{id:m.id,text:m.text,senderType:m.sender_type,createdAt:new Date(m.created_at).getTime()},unreadCount:0});
        if(m.sender_type==='user' && !m.read_at) grouped.get(m.user_id).unreadCount++;
      }
      const ids=Array.from(grouped.keys());
      const {data:people,error:peopleError}=ids.length ? await supabase.from('profiles').select('*').in('id',ids) : {data:[],error:null};
      if(peopleError) throw peopleError;
      const byId=new Map((people||[]).map((p:any)=>[p.id,mapProfile(p)]));
      return {data:{threads:ids.map(id=>({...grouped.get(id),profile:byId.get(id)||null}))}};
    }
    if (path.startsWith('/api/admin/messages')) {
      if (!u) throw new Error('Unauthorized');
      const isAdmin = isAdminUser(u);
      const query = supabase.from('admin_messages').select('*').order('created_at',{ascending:true});
      const {data,error}=isAdmin ? await query : await query.eq('user_id',u.id);
      if(error) throw error;
      const ids=(data||[]).map((m:any)=>m.id);
      const {data:reactionRows,error:reactionError}=ids.length ? await supabase.from('admin_message_reactions').select('message_id,user_id,reaction').in('message_id',ids) : {data:[],error:null};
      if(reactionError) throw reactionError;
      const reactionsBy=new Map<string,any[]>();
      for(const x of reactionRows||[]){const list=reactionsBy.get(x.message_id)||[];list.push({userId:x.user_id,reaction:x.reaction});reactionsBy.set(x.message_id,list);}
      return {data:{messages:(data||[]).map((m:any)=>({id:m.id,userId:m.user_id,text:m.text,senderType:m.sender_type,createdAt:new Date(m.created_at).getTime(),readAt:m.read_at?new Date(m.read_at).getTime():null,replyToId:m.reply_to_id||null,reactions:reactionsBy.get(m.id)||[]}))}};
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
      let photo:string|undefined;
      if(body.photoData){
        try { photo=await uploadMedia(u.id,body.photoData,body.photoContentType,'profiles'); }
        catch(e:any){ throw new Error('Could not upload your profile photo. ' + String(e?.message || 'Please choose another photo.')); }
      }
      const row:any={id:u.id,name:String(body.name||'').trim(),age:Number(body.age),gender:body.gender||null,city:String(body.city||'').trim(),country:body.country||'Nigeria',bio:body.bio||'',interests:Array.isArray(body.interests)?body.interests:[],looking_for:body.lookingFor||'Dating / connection',last_active_at:new Date().toISOString(),online:true};
      if(photo) row.photo=photo;
      if(Array.isArray(body.photosData)){
        const uploaded:string[]=[];
        for(let i=0;i<body.photosData.length;i++){
          const item=String(body.photosData[i]||'');
          if(item) uploaded.push(await uploadMedia(u.id,item,(body.photoContentTypes||[])[i]||'image/jpeg','profiles'));
        }
        const existing=Array.isArray(body.existingPhotos)?body.existingPhotos.filter((x:any)=>typeof x==='string'&&x):[];
        row.photos=[...existing,...uploaded].slice(-6);
        if(row.photos[0]) row.photo=row.photos[0];
      }
      const {data,error}=await supabase.from('profiles').upsert(row,{onConflict:'id'}).select().single();
      if(error) throw new Error('Could not save profile details. ' + error.message);
      if(body.phone !== undefined){
        const {error:phoneError}=await supabase.from('user_contacts').upsert({user_id:u.id,phone:String(body.phone||'').trim(),updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(phoneError) throw new Error('Could not save the private phone number. ' + phoneError.message);
      }
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
    if(path==='/api/blocks'){
      const blockedId=String(body.profileId||'');
      if(!blockedId || blockedId===u.id) throw new Error('Invalid profile.');
      const {data:existing}=await supabase.from('profile_blocks').select('blocked_id').eq('blocker_id',u.id).eq('blocked_id',blockedId).maybeSingle();
      if(existing){ const {error}=await supabase.from('profile_blocks').delete().eq('blocker_id',u.id).eq('blocked_id',blockedId); if(error) throw error; return {data:{blocked:false}}; }
      const {error}=await supabase.from('profile_blocks').insert({blocker_id:u.id,blocked_id:blockedId}); if(error) throw error;
      return {data:{blocked:true}};
    }
    if(path==='/api/reports'){
      const reportedId=String(body.profileId||''); const reason=String(body.reason||'Other').trim(); const details=String(body.details||'').trim();
      if(!reportedId || reportedId===u.id) throw new Error('Invalid profile.');
      const {data,error}=await supabase.from('profile_reports').insert({reporter_id:u.id,reported_id:reportedId,reason,details}).select().single(); if(error) throw error;
      return {data:{report:data}};
    }
    if(path==='/api/likes'){
      const {data:existing}=await supabase.from('likes').select('*').eq('user_id',u.id).eq('profile_id',body.profileId).maybeSingle();
      if(existing){
        const {error}=await supabase.from('likes').delete().eq('user_id',u.id).eq('profile_id',body.profileId); if(error) throw error;
        return {data:{liked:false}};
      }
      const {error}=await supabase.from('likes').insert({user_id:u.id,profile_id:body.profileId}); if(error) throw error;
      return {data:{liked:true}};
    }
    if(path==='/api/connection-requests'){
      const {data,error}=await supabase.from('connection_requests').insert({user_id:u.id,user_name:u.user_metadata?.full_name||u.email?.split('@')[0]||'Member',email:u.email||'',profile_id:body.profileId,profile_name:body.profileName}).select().single();if(error)throw error;return {data:{request:data}};
    }
    if(path==='/api/messages'){
      throw new Error('Member-to-member messaging is disabled. Use the official NaijaConnect admin conversation.');
    }
    if(path==='/api/admin/verify-user'){
      if(!isAdminUser(u)) throw new Error('Unauthorized');
      if(!body.userId) throw new Error('User is required.');
      const {data,error}=await supabase.from('profiles').update({verified:!!body.verified}).eq('id',body.userId).select().single();
      if(error) throw error;
      return {data:{profile:mapProfile(data)}};
    }
    if(path==='/api/admin/badge'){
      if(!isAdminUser(u)) throw new Error('Unauthorized');
      if(!body.userId) throw new Error('User is required.');
      const {data,error}=await supabase.from('profiles').update({admin_badge:!!body.adminBadge}).eq('id',body.userId).select().single();
      if(error) throw error;
      return {data:{profile:mapProfile(data)}};
    }
    if(path==='/api/admin/messages/read'){
      if(!u) throw new Error('Sign in required');
      const target = isAdminUser(u) ? (body.userId || null) : null;
      const {error}=await supabase.rpc('mark_admin_messages_read',{target_user_id:target});
      if(error) throw error;
      return {data:{ok:true}};
    }
    if(path==='/api/admin/message-reaction'){
      if(!u) throw new Error('Sign in required');
      if(!body.messageId) throw new Error('Message is required.');
      const {data:message,error:messageError}=await supabase.from('admin_messages').select('id,user_id').eq('id',body.messageId).maybeSingle();
      if(messageError) throw messageError;
      if(!message) throw new Error('Message not found.');
      if(!isAdminUser(u) && message.user_id!==u.id) throw new Error('Unauthorized');
      const reaction=String(body.reaction||'').trim();
      const allowed=['👍','❤️','😂','😮','😢','🙏'];
      if(!allowed.includes(reaction)) throw new Error('Unsupported reaction.');
      const {data:existing}=await supabase.from('admin_message_reactions').select('id,reaction').eq('message_id',body.messageId).eq('user_id',u.id).maybeSingle();
      if(existing){
        if(existing.reaction===reaction){
          const {error}=await supabase.from('admin_message_reactions').delete().eq('id',existing.id);
          if(error) throw error;
        } else {
          const {error}=await supabase.from('admin_message_reactions').update({reaction}).eq('id',existing.id);
          if(error) throw error;
        }
      } else {
        const {error}=await supabase.from('admin_message_reactions').insert({message_id:body.messageId,user_id:u.id,reaction});
        if(error) throw error;
      }
      return {data:{ok:true}};
    }
    if(path==='/api/admin/messages'){
      const admin = isAdminUser(u);
      const targetUserId = admin ? body.userId : u.id;
      if(!targetUserId) throw new Error('Recipient is required.');
      const senderType = admin ? 'admin' : 'user';
      const clean=String(body.text||'').trim();
      if(!clean) throw new Error('Message cannot be empty.');
      let replyToId:any=null;
      if(body.replyToId){
        const {data:reply,error:replyError}=await supabase.from('admin_messages').select('id,user_id').eq('id',body.replyToId).eq('user_id',targetUserId).maybeSingle();
        if(replyError) throw replyError;
        if(!reply) throw new Error('The message you are replying to is no longer available.');
        replyToId=reply.id;
      }
      const {data,error}=await supabase.from('admin_messages').insert({user_id:targetUserId,text:clean,sender_type:senderType,reply_to_id:replyToId}).select().single();
      if(error) throw error;
      return {data:{message:{id:data.id,userId:data.user_id,senderType:data.sender_type,text:data.text,createdAt:new Date(data.created_at).getTime(),readAt:null,replyToId:data.reply_to_id||null,reactions:[]}}};
    }
    if(path==='/api/delete-my-account'){
      const {error}=await supabase.rpc('delete_my_account');
      if(error) throw error;
      await supabase.auth.signOut();
      return {data:{deleted:true}};
    }
    if(path==='/api/admin/delete-user'){
      if(!isAdminUser(u)) throw new Error('Unauthorized');
      if(!body.userId) throw new Error('User is required.');
      const {error}=await supabase.rpc('delete_account_as_admin',{target_user_id:body.userId});
      if(error) throw error;
      return {data:{deleted:true}};
    }
    if(path==='/api/subscriptions') return {data:{}};
    throw new Error('Unsupported POST '+path);
  }
};
export const ws = { connect(){ return { connectionId:null, onMessage(){}, ready:Promise.resolve(), disconnect(){} }; } };
